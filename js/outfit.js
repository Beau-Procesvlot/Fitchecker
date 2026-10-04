// De outfit-motor: stelt een paar looks tegelijk samen op basis van de situatie,
// het weer, stijlregels en wat je zoekt. De situatie-kiezer staat in planner.js.

let looks = [];      // [{ parts: { plek: kledingstuk }, why }]
let activeLook = 0;
let lookCtx = null;  // de laatst gebruikte situatie, zie planner.js

const LOOK_COUNT = 5;
// Hoeveel "warmte" (som van 1–3 per stuk, zonder jas) past bij het weer.
const TARGET_WARMTH = { warm: 4, mild: 6, koud: 8 };
const MAIN_ORDER = ['mid', 'base', 'full', 'bottom', 'shoes', 'acc'];

// ---------- Eigenschappen van een stuk ----------

// De kleuren die meetellen: de hoofdkleur plus een duidelijke tweede kleur.
function itemColors(it) {
  if (it.color === 'print') return ['print'];
  const list = (it.colors || []).filter(c => c.pct >= 20).map(c => c.id);
  return list.length ? list.slice(0, 2) : [it.color];
}

function itemFormality(it) {
  const f = CATEGORY_FORMALITY[it.categoryId];
  if (f !== undefined) return it.styles.includes('net') && f < 2 ? f + 0.5 : f;
  if (it.styles.includes('net')) return 2.5;
  if (it.styles.includes('sport')) return 0.5;
  return 1;
}

// ---------- Stijlregels ----------

// Neutrale kleuren passen altijd; één accentkleur is ideaal; twee kleuren alleen
// als ze dicht bij elkaar of juist tegenover elkaar liggen. Print telt als accent.
function colorScore(parts) {
  const ids = [...new Set(parts.flatMap(itemColors))];
  const colors = ids.map(colorById);
  const prints = parts.filter(i => i.color === 'print').length;
  const hues = colors.filter(c => !c.neutral && !c.print).map(c => c.hue);
  const accents = hues.length + prints;
  if (prints > 1) return { score: -1, accents, why: 'Twee prints tegelijk is druk.' };
  if (accents === 0) {
    const tonal = colors.length <= 2;
    return { score: tonal ? 3.5 : 3, accents, why: pick(tonal ? WHY.tonal : WHY.neutral) };
  }
  if (accents === 1) {
    const accent = prints ? 'de print' : 'het ' + colorById(ids.find(id => !colorById(id).neutral)).label.toLowerCase();
    const why = pick(WHY.accent).replace('{kleur}', accent);
    return { score: 4, accents, why: why[0].toUpperCase() + why.slice(1) };
  }
  if (accents === 2 && hues.length === 2) {
    let d = Math.abs(hues[0] - hues[1]); d = Math.min(d, 360 - d);
    if (d <= 45) return { score: 3, accents, why: 'Twee kleuren die familie zijn.' };
    if (d >= 150) return { score: 3, accents, why: 'Complementaire kleuren die elkaar laten knallen.' };
  }
  return { score: accents === 2 ? 0.5 : 0, accents, why: 'Gewaagde kleurcombinatie. Durf jij?' };
}

const WHY = {
  tonal: ['Ton-sur-ton: rustig en doordacht.', 'Eén kleurfamilie van top tot teen. Clean.', 'Monochroom werkt altijd strak.'],
  neutral: ['Rustig en tijdloos: alleen neutrale kleuren.', 'Basics die altijd kloppen.', 'Neutraal, dus makkelijk te dragen.'],
  accent: ['Eén kleuraccent op een neutrale basis. Werkt altijd.', '{kleur} mag de show stelen, de rest blijft rustig.', 'Neutrale basis, {kleur} als eyecatcher.', 'Eén ding dat opvalt, meer heb je niet nodig.'],
};

// Warme aardetinten (bruin, beige, crème) met koele felle kleuren (blauw, paars) botsen een beetje.
function toneScore(parts) {
  const tones = new Set(parts.flatMap(itemColors).map(id => colorById(id).tone).filter(Boolean));
  return tones.has('warm') && tones.has('cool') ? -0.5 : 0;
}

// Wijd met slank geeft balans; wijd op wijd alleen als je daar bewust om vraagt.
function silhouetteScore(o, search) {
  const top = o.mid || o.base;
  if (!top || !o.bottom) return { score: 0 };
  const t = top.fit || 'normaal', b = o.bottom.fit || 'normaal';
  if (t === 'wijd' && b === 'wijd') return search.fits.includes('wijd') ? { score: 0.5 } : { score: -1 };
  if ((t === 'wijd' && b === 'slim') || (t === 'slim' && b === 'wijd')) return { score: 0.7, why: 'Wijd en slank in balans.' };
  return { score: 0 };
}

// Stukken horen ongeveer even netjes te zijn als de situatie vraagt, en als elkaar.
function formalityScore(parts, target) {
  const fs = parts.map(itemFormality);
  const off = fs.reduce((s, f) => s + Math.abs(f - target), 0) / fs.length;
  const spread = Math.max(...fs) - Math.min(...fs);
  return -off * 0.8 - (spread >= 2 ? 1.2 : 0);
}

function searchScore(parts, s, col) {
  let score = 0;
  for (const it of parts) {
    if (s.colors.some(c => itemColors(it).includes(c))) score += 0.8;
    if (s.cats.includes(it.categoryId) || s.catWords.some(w => (categoryById(it.categoryId)?.name || '').toLowerCase().includes(w))) score += 1.2;
    if (s.fits.includes(it.fit)) score += 0.6;
    if (s.styles.some(st => it.styles.includes(st))) score += 0.5;
  }
  if (s.accents && col.accents >= 1) score += 1.2;
  if (s.neutral && col.accents === 0) score += 1.5;
  return score;
}

// ---------- Kandidaten en samenstellen ----------

function fitsWeather(it, ctx) {
  if (ctx.level === 'warm') return it.warmth <= 2;
  // Bij mild weer geen korte broek of dunne rok; een jurk kan nog met een laag erover.
  if (ctx.level === 'mild') return !(slotOf(it) === 'bottom' && it.warmth < 2);
  if (ctx.level === 'koud') return it.warmth >= 2 || ['base', 'acc'].includes(slotOf(it));
  return true;
}

// Kandidaten per plek. Eerst streng (stijl + weer), dan steeds soepeler,
// zodat er met een kleine kast toch iets uitkomt.
function candidates(slot, ctx) {
  let all = state.items.filter(i => !i.inWash && slotOf(i) === slot);
  if (ctx.rain && slot === 'shoes') all = all.filter(i => i.categoryId !== 'sandalen').length ? all.filter(i => i.categoryId !== 'sandalen') : all;
  const strict = all.filter(i => i.styles.some(s => ctx.styles.includes(s)) && fitsWeather(i, ctx));
  if (strict.length) return strict;
  // Een jurk of accessoire is optioneel: past er niets bij de situatie, dan liever geen
  // (geen zomerjurk bij het sporten). Alleen als er geen boven- en onderstuk is, toch een jurk.
  if (slot === 'acc') return [];
  if (slot === 'full' && state.items.some(i => !i.inWash && ['base', 'bottom'].includes(slotOf(i)))) return [];
  const byWeather = all.filter(i => fitsWeather(i, ctx));
  return byWeather.length ? byWeather : all;
}

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function daysSinceWorn(it) {
  const last = it.worn?.[it.worn.length - 1];
  if (!last) return 60;
  return Math.min(60, (new Date(today()) - new Date(last)) / 86400000);
}

function scoreLook(o, used, ctx) {
  const parts = Object.values(o);
  const col = colorScore(parts);
  const sil = silhouetteScore(o, ctx.search);
  let score = col.score + toneScore(parts) + sil.score;
  score += formalityScore(parts.filter(i => slotOf(i) !== 'acc'), ctx.search.formality ?? ctx.formality);
  score += parts.filter(i => i.styles.some(s => ctx.styles.includes(s))).length * 0.4;
  const target = TARGET_WARMTH[ctx.level] + ctx.search.warmer;
  score -= Math.abs(parts.reduce((s, i) => s + i.warmth, 0) - target) * 0.4;
  score += searchScore(parts, ctx.search, col);
  // Stukken die je lang niet droeg krijgen voorrang (kern van de app).
  score += parts.reduce((s, i) => s + daysSinceWorn(i), 0) / parts.length / 30;
  // Afwisseling tussen de looks: stukken die al in een eerdere look zitten tellen minder.
  score -= parts.filter(i => used.has(i.id)).length * 0.9;
  return { score, why: [forgottenWhy(parts), sil.why, col.why].filter(Boolean) };
}

// Een vergeten stuk is het mooiste om te benoemen: daar is de app voor.
function forgottenWhy(parts) {
  const old = parts
    .filter(i => (Date.now() - (i.createdAt || 0)) > 14 * 86400000 && daysSinceWorn(i) >= 21)
    .sort((a, b) => daysSinceWorn(b) - daysSinceWorn(a))[0];
  if (!old) return null;
  const name = itemTitle(old).toLowerCase();
  return old.worn?.length ? `Je ${name} lag al ${Math.round(daysSinceWorn(old))}+ dagen stil.` : `Je ${name} heb je nog nooit gedragen. Tijd voor de première.`;
}

function buildLook(c, used, taken, ctx) {
  let best = null;
  for (let n = 0; n < 350; n++) {
    const o = {};
    const canSplit = c.base.length && c.bottom.length;
    if (c.full.length && (!canSplit || Math.random() < 0.3)) o.full = pick(c.full);
    else if (canSplit) { o.base = pick(c.base); o.bottom = pick(c.bottom); }
    // Laag eroverheen: bij koud bijna altijd, bij mild soms (vaker als het waait), bij warm niet.
    const midChance = { warm: 0, mild: ctx.windy ? 0.75 : 0.45, koud: 0.9 }[ctx.level];
    if (c.mid.length && Math.random() < midChance) o.mid = pick(c.mid);
    if (c.shoes.length) o.shoes = pick(c.shoes);
    if (c.acc.length && Math.random() < 0.4) o.acc = pick(c.acc);
    const parts = Object.values(o);
    if (!parts.length) continue;
    const key = parts.map(i => i.id).sort().join();
    if (taken.has(key)) continue;
    const s = scoreLook(o, used, ctx);
    s.score += Math.random() * 1.2;
    if (!best || s.score > best.score) best = { parts: o, why: s.why, score: s.score, key };
  }
  if (!best) return null;
  // De jas staat los: voorstellen als het weer erom vraagt, en altijd bij regen.
  if (!ctx.indoor && c.outer.length && (ctx.level !== 'warm' || ctx.rain)) {
    best.parts.outer = (ctx.level === 'koud' && c.outer.find(j => j.warmth === 3)) || pick(c.outer);
  }
  if (ctx.rain) best.why.push('Regen verwacht: jas mee.');
  else if (ctx.windy && best.parts.mid) best.why.push('Het waait flink, dus een laag extra.');
  best.why = best.why.slice(0, 2).join(' ');
  return best;
}

function generateLooks(ctx) {
  lookCtx = ctx;
  if (!state.items.some(i => !i.inWash)) {
    looks = [];
    renderLooks(state.items.length ? 'Alles zit in de wasmand. Tijd voor een wasje?' : 'Je kast is nog leeg. Voeg eerst wat kleding toe.');
    return;
  }
  const c = Object.fromEntries(SLOTS.map(s => [s.id, candidates(s.id, ctx)]));
  const used = new Set(), taken = new Set();
  looks = [];
  for (let i = 0; i < LOOK_COUNT; i++) {
    const look = buildLook(c, used, taken, ctx);
    if (!look) break;
    taken.add(look.key);
    Object.values(look.parts).forEach(it => used.add(it.id));
    looks.push(look);
  }
  activeLook = 0;
  renderLooks();
  $('#looks').scrollTo({ left: 0 });
}

// ---------- Titelkleur ----------
// De titel krijgt de hoofdkleur van de outfit: de accentkleur, of anders de
// donkerste neutrale kleur. Te licht? Dan donkerder tot hij leesbaar is op crème.
const PAPER = [243, 239, 230];

function luminance([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function titleColor(parts) {
  const order = ['full', 'mid', 'base', 'bottom', 'outer', 'shoes', 'acc'];
  const colors = order.filter(s => parts[s]).map(s => colorById(parts[s].color)).filter(c => !c.print);
  if (!colors.length) return '#1a1a1a';
  const accent = colors.find(c => !c.neutral);
  let rgb = hexToRgb((accent || colors.reduce((a, b) => luminance(hexToRgb(a.hex)) < luminance(hexToRgb(b.hex)) ? a : b)).hex);
  for (let n = 0; n < 12 && contrast(rgb, PAPER) < 4.5; n++) rgb = rgb.map(v => Math.round(v * 0.85));
  return `rgb(${rgb.join(',')})`;
}

// ---------- Weergave ----------

function lookItemHTML(slot, it, nr, lookIdx) {
  const label = slot === 'outer' ? 'Jas · optioneel' : (categoryById(it.categoryId)?.name || '');
  return `<li class="look-item ${slot === 'outer' ? 'optional' : ''}">
    <span class="nr">${nr}</span>
    <div class="look-pic">${pictureHTML(it)}</div>
    <span class="look-label">${esc(label)}</span>
    <button class="swap" data-look="${lookIdx}" data-slot="${slot}" aria-label="Ander stuk kiezen">+</button>
  </li>`;
}

function renderLooks(message) {
  $('#looks-empty').classList.toggle('hidden', looks.length > 0 || !message);
  $('#looks-start').classList.toggle('hidden', looks.length > 0 || !!message);
  $('#plan-summary').classList.toggle('hidden', !lookCtx);
  $('#looks-empty').textContent = message || '';
  $('#look-actions').classList.toggle('hidden', !looks.length);

  const left = lookCtx ? esc(lookCtx.label) : '';
  const right = lookCtx ? esc(lookCtx.weatherText || '') : '';
  $('#looks').innerHTML = looks.map((look, i) => {
    const slots = MAIN_ORDER.filter(s => look.parts[s]);
    if (look.parts.outer) slots.push('outer');
    return `<article class="look">
      <div class="look-meta"><span>${left}</span><span>${right}</span></div>
      <h2 class="look-title" style="color:${titleColor(look.parts)}">Look ${i + 1}</h2>
      <p class="look-why">${look.why}</p>
      <div class="look-body">
        <ol class="look-items">${slots.map((s, n) => lookItemHTML(s, look.parts[s], n + 1, i)).join('')}</ol>
        <div class="look-figure">${figureSVG(look.parts)}</div>
      </div>
    </article>`;
  }).join('');
  $('#looks').querySelectorAll('.swap').forEach(b => b.onclick = () => openSwap(+b.dataset.look, b.dataset.slot));

  $('#look-dots').innerHTML = looks.length > 1 ? looks.map((_, i) => `<span class="${i === activeLook ? 'on' : ''}"></span>`).join('') : '';

  // Bewaren, zodat je je looks terugziet als je de app binnen 2 uur weer opent.
  if (looks.length && lookCtx) {
    DB.setMeta('lastLooks', {
      at: Date.now(), ctx: lookCtx, summary: $('#plan-summary-text').textContent,
      looks: looks.map(l => ({ why: l.why, parts: Object.fromEntries(Object.entries(l.parts).map(([s, it]) => [s, it.id])) })),
    });
  }
}

async function restoreLastLooks() {
  const saved = await DB.getMeta('lastLooks');
  if (!saved || Date.now() - saved.at > 2 * 3600 * 1000) return false;
  const byId = id => state.items.find(i => i.id === id);
  looks = saved.looks
    .map(l => ({ why: l.why, parts: Object.fromEntries(Object.entries(l.parts).map(([s, id]) => [s, byId(id)]).filter(([, it]) => it)) }))
    .filter(l => Object.keys(l.parts).length);
  if (!looks.length) return false;
  lookCtx = saved.ctx;
  $('#plan-summary-text').textContent = saved.summary;
  return true;
}

$('#looks').addEventListener('scroll', () => {
  const el = $('#looks');
  const slide = el.querySelector('.look');
  if (!slide) return;
  const i = Math.round(el.scrollLeft / (slide.offsetWidth + 12));
  if (i !== activeLook) {
    activeLook = i;
    $('#look-dots').querySelectorAll('span').forEach((d, n) => d.classList.toggle('on', n === i));
  }
}, { passive: true });

// ---------- Eén stuk wisselen ("+") ----------
function rerenderKeepScroll() {
  const scroll = $('#looks').scrollLeft;
  renderLooks();
  $('#looks').scrollLeft = scroll;
}

function openSwap(lookIdx, slot) {
  const look = looks[lookIdx];
  const current = look.parts[slot];
  const options = state.items.filter(i => !i.inWash && slotOf(i) === slot && i.id !== current.id);
  $('#swap-title').textContent = slot === 'outer' ? 'Andere jas' : `Ander stuk voor ${slotById(slot).label.toLowerCase()}`;
  $('#swap-list').innerHTML = options.length
    ? options.map(it => `<button class="swap-option" data-id="${it.id}"><div class="pic">${pictureHTML(it)}</div><span>${esc(itemTitle(it))}</span></button>`).join('')
    : '<p class="muted">Je hebt hier nog geen ander stuk voor. Voeg er een toe aan je kast.</p>';
  $('#swap-list').querySelectorAll('.swap-option').forEach(b => b.onclick = () => {
    look.parts[slot] = state.items.find(i => i.id === b.dataset.id);
    look.why = colorScore(Object.entries(look.parts).filter(([s]) => s !== 'outer').map(([, it]) => it)).why;
    $('#swap').close();
    rerenderKeepScroll();
  });
  $('#swap-remove').classList.toggle('hidden', !['outer', 'acc', 'mid'].includes(slot));
  $('#swap-remove').onclick = () => {
    delete look.parts[slot];
    $('#swap').close();
    rerenderKeepScroll();
  };
  $('#swap').showModal();
}

$('#wear-look').onclick = async () => {
  const look = looks[activeLook];
  if (!look) return;
  // De jas telt niet mee: die neem je vaak wel of niet mee, los van de outfit.
  for (const [slot, it] of Object.entries(look.parts)) {
    if (slot === 'outer' || it.worn?.[it.worn.length - 1] === today()) continue;
    const updated = { ...it, worn: [...(it.worn || []), today()] };
    await saveItem(updated);
    look.parts[slot] = updated;
  }
  toast(`Look ${activeLook + 1} it is. Veel plezier!`);
};
$('#more-looks').onclick = () => lookCtx && generateLooks(lookCtx);
