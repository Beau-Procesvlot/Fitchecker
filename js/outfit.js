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
  // Twee prints vermijden zolang er iets anders kan (zware aftrek); lukt het niet, dan neutraal benoemen.
  if (prints > 1) return { score: -4, accents, why: 'Print op print: een statement. De rest houden we simpel.' };
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

// Welke stijlen mogen samen in een outfit. Sportief mixt met niets anders; strikt netjes
// (sollicitatie) alleen met netjes; casual en feest kunnen breder mixen (smart casual).
const STYLE_COMPAT = {
  sport: ['sport'],
  casual: ['casual', 'net', 'feest'],
  net: ['net'],
  feest: ['feest', 'net', 'casual'],
};
function allowedStyles(ctx) {
  return [...new Set(ctx.styles.flatMap(s => STYLE_COMPAT[s] || [s]))];
}
const fitsStyle = (it, ctx) => it.styles.some(s => allowedStyles(ctx).includes(s));

// Kandidaten per plek. De stijl is een harde eis: nooit terugvallen op stukken die er niet
// bij passen (geen spijkerbroek bij het sporten). Het weer mag wel soepeler als het moet.
function candidates(slot, ctx) {
  let all = state.items.filter(i => !i.inWash && slotOf(i) === slot && fitsStyle(i, ctx));
  if (ctx.rain && slot === 'shoes') all = all.filter(i => i.categoryId !== 'sandalen').length ? all.filter(i => i.categoryId !== 'sandalen') : all;
  const strict = all.filter(i => fitsWeather(i, ctx));
  if (strict.length) return strict;
  // Een jurk of accessoire is optioneel: past er niets bij het weer, dan liever geen.
  if (slot === 'acc' || slot === 'full') return [];
  return all;
}

// Wat ontbreekt er om voor deze situatie iets samen te stellen? Voor een eerlijke melding.
function missingFor(ctx) {
  const has = slot => state.items.some(i => !i.inWash && slotOf(i) === slot && fitsStyle(i, ctx));
  const style = ctx.styles.map(s => STYLES.find(x => x.id === s)?.label.toLowerCase()).join(' of ');
  if (has('full') || (has('base') && has('bottom'))) return null;
  const need = !has('base') && !has('bottom') ? 'een bovenstuk en een broek of rok' : !has('base') ? 'een bovenstuk' : 'een broek of rok';
  return `Voor deze look mist nog ${need} met de stijl ${style}. Voeg er een toe, of geef een stuk dat je hebt die stijl (via Bewerken).`;
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
  // Netheid: wat de situatie vraagt, bijgestuurd door je duimpjes ("te netjes" / "te casual").
  score += formalityScore(parts.filter(i => slotOf(i) !== 'acc'), (ctx.search.formality ?? ctx.formality) + feedback().formality);
  score += parts.filter(i => i.styles.some(s => ctx.styles.includes(s))).length * 0.4;
  const target = TARGET_WARMTH[ctx.level] + ctx.search.warmer;
  score -= Math.abs(parts.reduce((s, i) => s + i.warmth, 0) - target) * 0.4;
  score += searchScore(parts, ctx.search, col);
  // Jouw stijl (moodboard) en wat je eerder van deze combinaties vond (duimpjes).
  score += profileScore(o) + feedbackScore(o);
  // Trends van dit seizoen: standaard een lichte voorkeur (bij verder gelijke looks wint de trendy).
  // Vraag je om iets "trendy", dan tellen ze flink zwaarder.
  const trends = lookTrends(o);
  score += Math.min(2, trends.length) * (ctx.search.trendy ? 1.8 : 0.35);
  // Stukken die je lang niet droeg of die de app lang niet voorstelde krijgen voorrang (kern van de app).
  score += parts.reduce((s, i) => s + daysSinceWorn(i), 0) / parts.length / 30;
  score += parts.reduce((s, i) => s + daysSinceSuggested(i), 0) / parts.length / 60 * 0.6;
  // Bij de kastcheck gezegd dat je iets niet droeg? Dan extra voorrang tot je het draagt.
  score += parts.filter(i => i.boost).length * 1.2;
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
    // Laag eroverheen: bij koud altijd (een shirt alleen bij 7° is niet realistisch),
    // bij mild soms (vaker als het waait), bij warm niet.
    const midChance = { warm: 0, mild: ctx.windy ? 0.75 : 0.45, koud: 1 }[ctx.level];
    if (c.mid.length && Math.random() < midChance) o.mid = pick(c.mid);
    if (c.shoes.length) o.shoes = pick(c.shoes);
    if (c.acc.length && Math.random() < 0.4) o.acc = pick(c.acc);
    const parts = Object.values(o);
    if (!parts.length) continue;
    // Stukken die qua netheid niets met elkaar te maken hebben (joggingbroek + nette schoenen)
    // nooit samen. Spijkerbroek + blazer (verschil 2) mag wel.
    const fs = parts.filter(i => slotOf(i) !== 'acc').map(itemFormality);
    if (Math.max(...fs) - Math.min(...fs) > 2) continue;
    const key = parts.map(i => i.id).sort().join();
    if (taken.has(key)) continue;
    const s = scoreLook(o, used, ctx);
    s.score += Math.random() * 1.2;
    if (!best || s.score > best.score) best = { parts: o, why: s.why, score: s.score, key };
  }
  if (!best) return null;
  // De jas zit niet in de look; bovenaan staat of je er een nodig hebt (zie coatAdvice).
  // Koud maar geen trui of vest in de kast? Eerlijk zeggen, in plaats van doen alsof het klopt.
  if (ctx.level === 'koud' && !ctx.indoor && !best.parts.mid) best.why.unshift('Het is koud: een trui of vest eroverheen zou fijn zijn, maar die staat nog niet in je kast.');
  if (ctx.windy && best.parts.mid) best.why.push('Het waait flink, dus een laag extra.');
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
  const missing = missingFor(ctx);
  if (missing) {
    looks = [];
    renderLooks(missing);
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
  markSuggested(looks);
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

// ---------- Waarom deze look (onder de looks, om naar toe te scrollen) ----------
// Geen tweede lijst met kleding, maar de redenering: het kleurenpalet en een paar korte uitleggen.

// Hoeveel van de outfit is welke kleur? Grote stukken tellen zwaarder dan schoenen of een riem.
const SLOT_WEIGHT = { full: 4, base: 2.5, mid: 3, bottom: 3, shoes: 1, acc: 0.6 };
function lookPalette(parts) {
  const sum = {};
  for (const [slot, it] of Object.entries(parts)) {
    const cols = it.colors?.length ? it.colors : [{ id: it.color, pct: 100 }];
    for (const c of cols) if (c.id !== 'print') sum[c.id] = (sum[c.id] || 0) + (SLOT_WEIGHT[slot] || 1) * c.pct;
  }
  const total = Object.values(sum).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(sum).map(([id, v]) => ({ id, pct: Math.round((v / total) * 100) })).sort((a, b) => b.pct - a.pct).slice(0, 4);
}

function explainLook(look, ctx) {
  const parts = Object.values(look.parts);
  const reasons = [];
  const col = colorScore(parts);
  const ids = [...new Set(parts.flatMap(itemColors))];
  const accents = ids.map(colorById).filter(c => !c.neutral && !c.print);
  const name = c => c.label.toLowerCase();

  // Kleur
  if (parts.some(i => i.color === 'print') && accents.length === 0) reasons.push(['Kleur', 'De print is het enige drukke stuk. Alles eromheen is rustig, zodat hij goed uitkomt.']);
  else if (col.accents === 0) reasons.push(['Kleur', ids.length <= 2 ? 'Eén kleurfamilie van top tot teen. Dat oogt rustig en doordacht.' : 'Alleen neutrale kleuren. Die passen altijd bij elkaar, dus je zit altijd goed.']);
  else if (accents.length === 1) reasons.push(['Kleur', `${accents[0].label} is de enige opvallende kleur. De neutrale stukken eromheen geven hem de ruimte.`]);
  else if (accents.length === 2) {
    let d = Math.abs(accents[0].hue - accents[1].hue); d = Math.min(d, 360 - d);
    reasons.push(['Kleur', d <= 45 ? `${accents[0].label} en ${name(accents[1])} liggen dicht bij elkaar op het kleurenwiel: ze versterken elkaar zonder te botsen.`
      : d >= 150 ? `${accents[0].label} en ${name(accents[1])} zijn elkaars tegenpool. Dat geeft spanning, en juist daardoor valt het op.`
      : `${accents[0].label} met ${name(accents[1])}: een gewaagde combinatie.`]);
  }
  // Tinten
  // Alleen benoemen als echt minstens twee kleuren dezelfde kant op gaan (en niets de andere kant).
  const warm = ids.filter(id => colorById(id).tone === 'warm').length, cool = ids.filter(id => colorById(id).tone === 'cool').length;
  if (warm >= 2 && !cool) reasons.push(['Tinten', 'Warme aardetinten bij elkaar: zacht en herfstig.']);
  else if (cool >= 2 && !warm) reasons.push(['Tinten', 'Koele tinten bij elkaar: fris en strak.']);
  // Silhouet
  const top = look.parts.mid || look.parts.base, bottom = look.parts.bottom;
  if (top && bottom) {
    const t = top.fit || 'normaal', b = bottom.fit || 'normaal';
    if (t === 'wijd' && b === 'slim') reasons.push(['Silhouet', 'Wijd boven, slank onder. Die balans maakt een losse trui of hoodie meteen netter.']);
    else if (t === 'slim' && b === 'wijd') reasons.push(['Silhouet', 'Strak boven, wijd onder: de broek mag het volume hebben.']);
  }
  // Weer
  if (ctx && !ctx.indoor) {
    const feels = ctx.minFeels !== undefined ? ` (voelt als ${ctx.minFeels}°)` : '';
    if (ctx.level === 'koud') reasons.push(['Weer', `Het is koud${feels}, daarom ${look.parts.mid ? 'een laag eroverheen' : 'warme stukken'}.${ctx.rain ? ' En kans op regen: jas mee.' : ''}`]);
    else if (ctx.level === 'warm') reasons.push(['Weer', 'Warm weer: dunne, luchtige stukken.']);
    else if (ctx.rain) reasons.push(['Weer', 'Niet koud, wel kans op regen: denk aan een jas en dichte schoenen.']);
    else if (ctx.windy) reasons.push(['Weer', 'Het waait flink: een laag extra houdt de wind tegen.']);
  }
  // Stemming en zoekwoorden
  const wished = [...new Set(ctx?.search?.recognized || [])];
  if (wished.length) reasons.push(['Jouw wens', `Je stemming: ${wished.join(', ')}. Daar heeft de app op gelet bij het kiezen.`]);
  // Trend van dit seizoen en jouw stijl gaan vooraan: dat wil je het eerst weten.
  const trend = lookTrends(look.parts)[0];
  if (trend) reasons.unshift(['Trend', trend.text]);
  const style = topStyleFor(look.parts);
  if (style) reasons.splice(trend ? 1 : 0, 0, ['Jouw stijl', `Past bij jouw stijl: ${style.label.toLowerCase()}.`]);
  // Vergeten
  const forgotten = forgottenWhy(parts);
  if (forgotten) reasons.push(['Uit de kast', forgotten]);

  return { quote: look.why.split('. ')[0].replace(/\.$/, ''), palette: lookPalette(look.parts), reasons: reasons.slice(0, 5) };
}

// De rij looks is zo hoog als de look die je bekijkt (anders ontstaat er een gat onder korte looks).
function fitLooksHeight() {
  const card = $('#looks').querySelectorAll('.look')[activeLook];
  $('#looks').style.height = card ? `${card.offsetHeight + 4}px` : '';
}

function renderWhyMore() {
  fitLooksHeight();
  const look = looks[activeLook];
  $('#why-more').classList.toggle('hidden', !look);
  if (!look) return;
  const e = explainLook(look, lookCtx);
  $('#why-more').innerHTML = `
    <p class="why-kicker">Waarom look ${activeLook + 1}</p>
    <blockquote class="why-quote">“${esc(e.quote)}”</blockquote>
    <div class="chips-palette">
      ${e.palette.map(c => {
        const col = colorById(c.id);
        return `<div class="chip-card"><div class="chip-color" style="background:${colorCss(col)}"></div><span class="chip-name">${col.label}</span><span class="chip-pct">${c.pct}%</span></div>`;
      }).join('')}
    </div>
    <div class="why-reasons">
      ${e.reasons.map(([label, text]) => `<div class="why-reason"><span class="why-label">${label}</span><p>${esc(text)}</p></div>`).join('')}
    </div>`;
  // Even laten "opvallen" dat het meeverandert bij swipen.
  $('#why-more').classList.remove('fade'); void $('#why-more').offsetWidth; $('#why-more').classList.add('fade');
}

// Jas: geen stuk in de look, maar een advies op basis van het weer.
function coatAdvice(ctx) {
  if (!ctx || ctx.indoor) return null;
  const feels = ctx.minFeels !== undefined ? `, voelt als ${ctx.minFeels}°` : '';
  if (ctx.level === 'koud') return { need: 'ja', text: 'Jas nodig', why: `koud${feels}${ctx.rain ? ' en kans op regen' : ''}` };
  if (ctx.rain) return { need: 'ja', text: 'Jas nodig', why: ctx.rainPct ? `${ctx.rainPct}% kans op regen` : 'kans op regen' };
  if (ctx.level === 'mild' && ctx.windy) return { need: 'handig', text: 'Jas handig', why: 'het waait flink' };
  return { need: 'nee', text: 'Geen jas nodig', why: ctx.level === 'warm' ? 'lekker warm' : 'droog en mild' };
}

function coatHTML(ctx) {
  const a = coatAdvice(ctx);
  if (!a) return '';
  return `<p class="coat coat-${a.need}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 3l3 3 3-3 4 2 2 6-3 1v9H6v-9L3 11l2-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6v15" stroke="currentColor" stroke-width="1.6"/></svg><strong>${a.text}</strong><span>${a.why}</span></p>`;
}

function lookItemHTML(slot, it, nr, lookIdx) {
  const label = categoryById(it.categoryId)?.name || '';
  return `<li class="look-item">
    <span class="nr">${nr}</span>
    ${lookPicHTML(it)}
    <span class="look-label">${esc(label)}</span>
    <button class="swap" data-look="${lookIdx}" data-slot="${slot}" aria-label="Ander stuk kiezen">+</button>
  </li>`;
}

// ---------- Versiering van de look-kaart ----------
const svgIcon = (d, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SITUATION_ICONS = {
  sport: 'M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12',
  school: 'M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z',
  werk: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  stad: 'M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0',
  date: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',
  verjaardag: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0',
  stap: 'M7 4h10l-5 7zM12 11v8M8 20h8',
  etentje: 'M7 3v7a2 2 0 0 0 4 0V3M9 10v11M16 3c-2 2-2 6 0 8v10',
  festival: 'M9 18V6l10-2v12M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  formeel: 'M3 8l7 4-7 4zM21 8l-7 4 7 4zM10 11h4v2h-4z',
  sollicitatie: 'M10 3h4l-1 3 2 11-3 4-3-4 2-11z',
  thuis: 'M4 11l8-7 8 7v9H4zM10 20v-6h4v6',
  eigen: 'M12 3l2.5 6 6.5.5-5 4 1.5 6.5L12 17l-5.5 3 1.5-6.5-5-4 6.5-.5z',
};
const WEATHER_ICONS = {
  zon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  zonwolk: 'M8 4v1.5M3.5 8.5H5M5 5l1 1M11 5l-1 1M8 7a2.5 2.5 0 0 0-2.4 3.2M8 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 8 19z',
  wolk: 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z',
  regen: 'M7 15h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 15zM9 18l-1 3M13 18l-1 3M17 18l-1 3',
  binnen: 'M4 11l8-7 8 7v9H4z',
};
function weatherIcon(ctx) {
  if (!ctx || ctx.indoor) return WEATHER_ICONS.binnen;
  if (ctx.rain) return WEATHER_ICONS.regen;
  return { warm: WEATHER_ICONS.zon, mild: WEATHER_ICONS.zonwolk, koud: WEATHER_ICONS.wolk }[ctx.level];
}

const DOODLES = [
  'M4 18h16l-1-9-4 4-3-6-3 6-4-4z',                                                     // kroontje
  'M12 3l2.5 6 6.5.5-5 4 1.5 6.5L12 17l-5.5 3 1.5-6.5-5-4 6.5-.5z',                       // ster
  'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',                       // hartje
  'M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3',                    // sparkle
];
// Handgetekend pijltje (eigen viewBox, zodat het groot genoeg is)
const arrowSVG = cls => `<svg class="arrow ${cls}" viewBox="0 0 40 40" width="44" height="44" aria-hidden="true"><path d="M8 5c12 3 20 13 15 27M23 32l-7-2M23 32l2-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Twee handgeschreven notities bij het poppetje: het gevoel, en de stijl in twee woorden.
const FEEL_BY_SITUATION = {
  sport: 'Comfort', school: 'Easy', werk: 'Sharp', stad: 'Stad-proof', date: 'Date night',
  verjaardag: 'Feestje!', stap: 'Party ready', etentje: 'Dinner look', festival: 'Festival vibes',
  formeel: 'Dressed up', sollicitatie: 'Sharp', thuis: 'Cozy',
};
function lookNotes(look, ctx) {
  const wish = ctx?.search?.recognized?.[0];
  const feel = wish ? wish[0].toUpperCase() + wish.slice(1) : (FEEL_BY_SITUATION[ctx?.sitId] || 'Jouw look');
  const style = { casual: 'Casual', net: 'Netjes', sport: 'Sportief', feest: 'Feest' }[ctx?.styles?.[0]] || 'Casual';
  const col = colorScore(Object.values(look.parts));
  const word = col.accents === 0 ? 'clean' : col.accents === 1 ? 'pop' : 'bold';
  return [feel, `${style} & ${word}`];
}

// ---------- Uitgeknipte stukken en flat-lay ----------
// De uitgeknipte versie van een stuk (voor- of achterkant), als die er is.
function cutoutOf(it, side = 'front') {
  const c = side === 'back' ? it.cutoutBack : it.cutout;
  return c && c !== 'mislukt' ? c : null;
}

// Plaatje in de genummerde lijst: uitgeknipt met stickerrand, anders de gewone foto of kleur.
function lookPicHTML(it) {
  const front = cutoutOf(it) || it.photo, back = cutoutOf(it, 'back') || it.photoBack;
  const cls = cutoutOf(it) ? 'look-pic cut' : 'look-pic';
  const inner = cutoutOf(it) ? `<img src="${front}" alt="">` : pictureHTML(it);
  return back
    ? `<div class="${cls} flippable" data-front="${front}" data-back="${back}" title="Tik voor de achterkant">${inner}<span class="flip-badge">↻</span></div>`
    : `<div class="${cls}">${inner}</div>`;
}

// Flat-lay: de stukken neergelegd zoals een stylist dat doet. Vakken in procenten van het vlak.
// Groot en een beetje over elkaar heen. Een trui of hoodie ligt altijd bovenop het shirt;
// het shirt piept er linksboven onder vandaan.
const FLATLAY = {
  full:   { left: 0,  top: 0,  width: 100, height: 64 },
  base:   { left: -2, top: 0,  width: 74,  height: 40 },
  mid:    { left: 12, top: 5,  width: 90,  height: 45 },
  single: { left: 0,  top: 0,  width: 100, height: 46 },
  bottom: { left: 6,  top: 35, width: 88,  height: 50 },
  shoes:  { left: -2, top: 79, width: 66,  height: 21 },
  acc:    { left: 60, top: 68, width: 42,  height: 24 },
};
function flatlayHTML(parts) {
  const layers = [];
  const add = (slot, box, z) => {
    const it = parts[slot];
    if (!it) return;
    const src = cutoutOf(it);
    const rot = (seeded(it.id, 'f') * 10 - 5).toFixed(1);
    const content = src ? `<img src="${src}" alt="">`
      : it.photo ? `<img class="photo" src="${it.photo}" alt="">`
      : `<span class="fl-color" style="background:${colorCss(colorById(it.color))}"></span>`;
    layers.push(`<div class="fl-item ${src ? 'cut' : 'nocut'}" style="left:${box.left}%;top:${box.top}%;width:${box.width}%;height:${box.height}%;--r:${rot}deg;z-index:${z}">${content}</div>`);
  };
  if (parts.full) add('full', FLATLAY.full, 2);
  // Trui of hoodie (laag eroverheen) altijd boven het shirt.
  if (parts.base && parts.mid) { add('base', FLATLAY.base, 2); add('mid', FLATLAY.mid, 4); }
  else { add('base', FLATLAY.single, 2); add('mid', FLATLAY.single, 4); }
  add('bottom', FLATLAY.bottom, 1);
  add('shoes', FLATLAY.shoes, 5);
  add('acc', FLATLAY.acc, 6);
  return `<div class="flatlay">${layers.join('')}</div>`;
}

// Welke weergave: flat-lay als er uitgeknipte stukken zijn, anders het poppetje (of je eigen keuze).
function lookView(parts) {
  if (state.profile.lookView) return state.profile.lookView;
  return Object.values(parts).some(it => cutoutOf(it)) ? 'flatlay' : 'pop';
}

// ---------- Favorieten ----------
const favKey = parts => Object.values(parts).map(i => i.id).sort().join();
async function getFavorites() { return (await DB.getMeta('favorites')) || []; }
let favoriteKeys = new Set();
async function loadFavoriteKeys() {
  favoriteKeys = new Set((await getFavorites()).map(f => Object.values(f.parts).sort().join()));
}

async function toggleFavorite(look) {
  const favs = await getFavorites();
  const key = favKey(look.parts);
  const i = favs.findIndex(f => Object.values(f.parts).sort().join() === key);
  if (i >= 0) favs.splice(i, 1);
  else favs.unshift({
    id: newId(), at: Date.now(), why: look.why,
    ctx: lookCtx ? { label: lookCtx.label, sitId: lookCtx.sitId, styles: lookCtx.styles, weatherText: lookCtx.weatherText, indoor: lookCtx.indoor, level: lookCtx.level, rain: lookCtx.rain, windy: lookCtx.windy, minFeels: lookCtx.minFeels, search: lookCtx.search } : null,
    parts: Object.fromEntries(Object.entries(look.parts).map(([s, it]) => [s, it.id])),
  });
  await DB.setMeta('favorites', favs);
  await loadFavoriteKeys();
  toast(i >= 0 ? 'Uit je favorieten' : 'Bewaard bij je favorieten');
  rerenderKeepScroll();
  updateFavButton();
}

async function updateFavButton() {
  const n = (await getFavorites()).length;
  $('#fav-pill-text').textContent = n ? `Favorieten ${n}` : 'Favorieten';
}

async function openFavorites() {
  const favs = await getFavorites();
  const byId = id => state.items.find(i => i.id === id);
  $('#fav-list').innerHTML = favs.length ? favs.map(f => {
    const items = Object.values(f.parts).map(byId).filter(Boolean);
    const thumbs = items.slice(0, 4).map(it => `<span class="fav-thumb">${cutoutOf(it) ? `<img src="${cutoutOf(it)}" alt="">` : pictureHTML(it)}</span>`).join('');
    const date = new Date(f.at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    return `<div class="fav-row">
      <button class="fav-show" data-id="${f.id}"><span class="fav-thumbs">${thumbs}</span>
        <span class="fav-text"><strong>${esc(f.ctx?.label || 'Look')}</strong><span class="muted small">${date}${items.length < Object.keys(f.parts).length ? ' · niet alles meer in je kast' : ''}</span></span></button>
      <button class="fav-del" data-id="${f.id}" aria-label="Verwijderen uit favorieten">${heartSVG(true)}</button>
    </div>`;
  }).join('') : '<p class="muted">Nog geen favorieten. Tik op het hartje bij een look om hem te bewaren.</p>';
  $('#fav-list').querySelectorAll('.fav-show').forEach(b => b.onclick = () => {
    const f = favs.find(x => x.id === b.dataset.id);
    const parts = Object.fromEntries(Object.entries(f.parts).map(([s, id]) => [s, byId(id)]).filter(([, it]) => it));
    if (!Object.keys(parts).length) { toast('Deze stukken staan niet meer in je kast'); return; }
    lookCtx = f.ctx || { label: 'Favoriet', styles: ['casual'], search: parseSearch('') };
    looks = [{ parts, why: f.why }];
    activeLook = 0;
    $('#plan-summary-text').textContent = `Favoriet · ${f.ctx?.label || 'look'}`;
    $('#fav-sheet').close();
    showTab('outfit');
    renderLooks();
  });
  $('#fav-list').querySelectorAll('.fav-del').forEach(b => b.onclick = async () => {
    await DB.setMeta('favorites', favs.filter(f => f.id !== b.dataset.id));
    await loadFavoriteKeys();
    openFavorites();
    updateFavButton();
    if (looks.length) rerenderKeepScroll();
  });
  if (!$('#fav-sheet').open) $('#fav-sheet').showModal();
}

$('#fav-pill').onclick = openFavorites;

const THUMB = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 10v10H4V10zM7 10l4-7c1.6 0 2.6 1.2 2.1 3L12.4 10H18a2 2 0 0 1 2 2.3l-1.1 6A2 2 0 0 1 16.9 20H7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

const heartSVG = filled => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

function renderLooks(message) {
  $('#looks-empty').classList.toggle('hidden', looks.length > 0 || !message);
  $('#looks-start').classList.toggle('hidden', looks.length > 0 || !!message);
  $('#plan-summary').classList.toggle('hidden', !lookCtx);
  $('#looks-empty').textContent = message || '';
  $('#look-actions').classList.toggle('hidden', !looks.length);

  // Kort label in het pilletje: 'School / studie' wordt 'School'.
  const sitLabel = lookCtx ? esc(lookCtx.label.replace(/ · morgen$/, '').split(' / ')[0]) : '';
  const sitIcon = SITUATION_ICONS[lookCtx?.sitId] || SITUATION_ICONS.eigen;
  const weather = lookCtx ? esc(lookCtx.weatherText || '') : '';
  $('#looks').innerHTML = looks.map((look, i) => {
    const slots = MAIN_ORDER.filter(s => look.parts[s]);
    const [feel, styleNote] = lookNotes(look, lookCtx);
    const view = lookView(look.parts);
    const fav = favoriteKeys.has(favKey(look.parts));
    return `<article class="look ${i === activeLook ? 'active' : ''}">
      <div class="look-meta">
        <span class="sit-pill">${sitLabel}${svgIcon(sitIcon, 16)}</span>
        <span class="weather-tag">${svgIcon(weatherIcon(lookCtx), 20)}${weather}</span>
      </div>
      <button class="fav-btn ${fav ? 'on' : ''}" data-look="${i}" aria-label="${fav ? 'Uit favorieten' : 'Bewaar als favoriet'}">${heartSVG(fav)}</button>
      <h2 class="look-title" style="color:${titleColor(look.parts)}">Look ${i + 1}</h2>
      <p class="look-why">${look.why}</p>
      ${(() => { const t = lookTrends(look.parts)[0]; return t ? `<p class="trend-badge">${svgIcon('M12 3l2.5 6 6.5.5-5 4 1.5 6.5L12 17l-5.5 3 1.5-6.5-5-4 6.5-.5z', 14)}Trend dit seizoen · ${esc(t.label)}</p>` : ''; })()}
      ${coatHTML(lookCtx)}
      <div class="look-body">
        <ol class="look-items">${slots.map((s, n) => lookItemHTML(s, look.parts[s], n + 1, i)).join('')}</ol>
        <div class="look-figure view-${view}">
          <div class="view-toggle" role="group" aria-label="Weergave">
            <button data-view="flatlay" class="${view === 'flatlay' ? 'on' : ''}">Flat-lay</button>
            <button data-view="pop" class="${view === 'pop' ? 'on' : ''}">Pop</button>
          </div>
          ${view === 'flatlay'
            // Bij flat-lay geen notities over de foto's heen, maar één bijschrift eronder, zoals in een tijdschrift.
            ? `${flatlayHTML(look.parts)}<p class="fl-caption">${esc(feel)} · ${esc(styleNote)}</p>`
            : `<span class="note note-top">${esc(feel)}${arrowSVG('down-left')}</span>
               ${figureSVG(look.parts)}
               <span class="note note-side">${esc(styleNote)}${arrowSVG('down-right')}</span>`}
          <span class="doodle">${svgIcon(DOODLES[i % DOODLES.length], 34)}</span>
        </div>
      </div>
      <div class="rate">
        <span class="rate-q">${look.rated === 'up' ? 'Meer van dit, genoteerd' : look.rated === 'down' ? 'Genoteerd' : 'Wat vind je ervan?'}</span>
        <button class="rate-btn ${look.rated === 'up' ? 'on' : ''}" data-look="${i}" data-rate="up" aria-label="Goed">${THUMB}</button>
        <button class="rate-btn down ${look.rated === 'down' ? 'on' : ''}" data-look="${i}" data-rate="down" aria-label="Niet goed">${THUMB}</button>
      </div>
      ${look.rated === 'down' ? `<details class="why-not">
        <summary>Waarom? <span>(optioneel)</span></summary>
        <div class="chips">${DISLIKE_REASONS.map(r => `<button class="chip ${look.reason === r.id ? 'on' : ''}" data-look="${i}" data-reason="${r.id}">${r.label}</button>`).join('')}</div>
      </details>` : ''}
    </article>`;
  }).join('');
  $('#looks').querySelectorAll('.swap').forEach(b => b.onclick = () => openSwap(+b.dataset.look, b.dataset.slot));
  $('#looks').querySelectorAll('.fav-btn').forEach(b => b.onclick = () => toggleFavorite(looks[+b.dataset.look]));
  // Duimpjes: de app leert je smaak. Bij een duim omlaag kun je (optioneel) zeggen waarom.
  $('#looks').querySelectorAll('.rate-btn').forEach(b => b.onclick = async () => {
    const look = looks[+b.dataset.look];
    if (look.rated) return;
    await rateLook(look, b.dataset.rate === 'up');
    rerenderKeepScroll();
  });
  $('#looks').querySelectorAll('[data-reason]').forEach(b => b.onclick = async () => {
    const look = looks[+b.dataset.look];
    if (look.reason) return;
    await explainDislike(look, b.dataset.reason);
    toast('Dank je, de app past zich aan');
    rerenderKeepScroll();
  });
  // Wisselen tussen flat-lay en poppetje; de keuze wordt onthouden.
  $('#looks').querySelectorAll('.view-toggle button').forEach(b => b.onclick = () => {
    state.profile.lookView = b.dataset.view;
    saveProfile();
    rerenderKeepScroll();
  });
  // Tik op een stuk met een achterkant: het draait om.
  $('#looks').querySelectorAll('.look-pic.flippable').forEach(p => p.onclick = () => {
    const img = p.querySelector('img');
    p.classList.add('turning');
    setTimeout(() => {
      p.classList.toggle('showing-back');
      img.src = p.classList.contains('showing-back') ? p.dataset.back : p.dataset.front;
      p.classList.remove('turning');
    }, 160);
  });

  $('#look-dots').innerHTML = looks.length > 1 ? looks.map((_, i) => `<span class="${i === activeLook ? 'on' : ''}"></span>`).join('') : '';
  renderWhyMore();

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
    .map(l => ({ why: l.why, parts: Object.fromEntries(Object.entries(l.parts).filter(([s]) => s !== 'outer').map(([s, id]) => [s, byId(id)]).filter(([, it]) => it)) }))
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
    el.querySelectorAll('.look').forEach((l, n) => l.classList.toggle('active', n === i));
    renderWhyMore();
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
  // Alleen stukken die bij de stijl van deze situatie passen, en qua netheid bij de rest.
  const others = Object.entries(look.parts).filter(([s]) => s !== slot && s !== 'acc').map(([, it]) => itemFormality(it));
  const fitsRest = i => {
    const fs = [...others, itemFormality(i)];
    return Math.max(...fs) - Math.min(...fs) <= 2;
  };
  const options = state.items.filter(i => !i.inWash && slotOf(i) === slot && i.id !== current.id
    && (!lookCtx || fitsStyle(i, lookCtx)) && (slot === 'acc' || fitsRest(i)));
  $('#swap-title').textContent = `Ander stuk voor ${slotById(slot).label.toLowerCase()}`;
  $('#swap-list').innerHTML = options.length
    ? options.map(it => `<button class="swap-option" data-id="${it.id}"><div class="pic">${pictureHTML(it)}</div><span>${esc(itemTitle(it))}</span></button>`).join('')
    : '<p class="muted">Je hebt hier nog geen ander stuk voor dat bij deze look past. Voeg er een toe aan je kast.</p>';
  $('#swap-list').querySelectorAll('.swap-option').forEach(b => b.onclick = () => {
    look.parts[slot] = state.items.find(i => i.id === b.dataset.id);
    look.why = colorScore(Object.values(look.parts)).why;
    $('#swap').close();
    rerenderKeepScroll();
  });
  $('#swap-remove').classList.toggle('hidden', !['acc', 'mid'].includes(slot));
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
  for (const [slot, it] of Object.entries(look.parts)) {
    if (it.worn?.[it.worn.length - 1] === today()) continue;
    const updated = { ...it, worn: [...(it.worn || []), today()], boost: false };
    await saveItem(updated);
    look.parts[slot] = updated;
  }
  toast(`Look ${activeLook + 1} it is. Veel plezier!`);
};
$('#more-looks').onclick = () => lookCtx && generateLooks(lookCtx);
