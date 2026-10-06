// Fitchecker Wrapped: aan het begin van elke maand een overzicht van de vorige maand,
// zoals Spotify Wrapped. Wat droeg je het meest, wat kwam terug, wat bleef hangen?
// Alles wordt berekend uit wat je hebt aangegeven als gedragen; er gaat niets van je telefoon af.
// (Later uit te breiden met meer details en bewegende animaties.)

const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = key => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 2, 1));
}

// Hoofdkleur van een stuk (bij een print de eerste echte kleur).
const mainColorOf = it => it.color === 'print' ? (it.colors?.find(c => c.id !== 'print')?.id || 'zwart') : it.color;

function wrappedStats(key) {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1).getTime();
  const end = new Date(y, m, 1).getTime();
  const inMonth = d => d.startsWith(key);

  const existing = state.items.filter(it => (it.createdAt || 0) < end);
  const rows = existing.map(it => ({ it, n: (it.worn || []).filter(inMonth).length }));
  const worn = rows.filter(r => r.n > 0);
  const events = worn.reduce((s, r) => s + r.n, 0);
  const days = new Set(existing.flatMap(it => (it.worn || []).filter(inMonth))).size;

  // Favoriet: het vaakst gedragen.
  const favorite = [...worn].sort((a, b) => b.n - a.n)[0] || null;

  // Kleur van de maand: welke kleur droeg je het vaakst.
  const colorCount = {};
  for (const r of worn) colorCount[mainColorOf(r.it)] = (colorCount[mainColorOf(r.it)] || 0) + r.n;
  const topColor = Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Comeback: stukken die je eerder droeg, daarna minstens 3 weken niet, en deze maand weer wel.
  // (Zonder eerdere keer telt het niet: anders is bij een nieuwe gebruiker alles een comeback.)
  const comebacks = worn.filter(({ it }) => {
    const dates = [...(it.worn || [])].sort();
    const first = dates.find(inMonth);
    const before = dates.filter(d => d < first).pop();
    return before && (new Date(first) - new Date(before)) >= 21 * 86400000;
  }).map(r => r.it);

  // Bleef hangen: stukken die er de hele maand (bijna) al waren en die je niet droeg.
  const forgotten = rows.filter(r => r.n === 0 && (r.it.createdAt || 0) < end - 14 * 86400000)
    .map(r => r.it).sort((a, b) => daysUnworn(b) - daysUnworn(a));

  return {
    key, start, total: existing.length, worn: worn.length, events, days,
    pct: existing.length ? Math.round(worn.length / existing.length * 100) : 0,
    favorite, topColor, comebacks, forgotten,
  };
}

// Een maand telt mee als je die maand minstens één keer hebt aangegeven wat je droeg.
const hasWrapped = key => wrappedStats(key).events > 0;

// Bij het openen in een nieuwe maand, één keer: de Wrapped van vorige maand. Geeft true als hij getoond wordt.
async function maybeWrapped() {
  const key = prevMonthKey(monthKey(new Date()));
  if (state.profile.lastWrapped === key || !hasWrapped(key)) return false;
  state.profile.lastWrapped = key;
  await saveProfile();
  openWrapped(key);
  return true;
}

// ---------- Weergave ----------
let wrappedSlides = [];
let wrappedIndex = 0;
let wrappedData = null;

function thumbHTML(it) {
  const src = cutoutOf(it);
  if (src) return `<img class="cut" src="${src}" alt="">`;
  if (it.photo) return `<img class="photo" src="${it.photo}" alt="">`;
  return `<span class="wr-swatch" style="background:${colorCss(colorById(it.color))}"></span>`;
}

function openWrapped(key) {
  const s = wrappedStats(key);
  const prev = wrappedStats(prevMonthKey(key));
  wrappedData = { s, prev };
  const month = monthLabel(key);
  const slides = [];

  slides.push({ cls: 'wr-ink', html: `
    <p class="wr-kicker">Fitchecker Wrapped</p>
    <h2 class="wr-huge wr-word">${month.split(' ')[0]}</h2>
    <p class="wr-big">Je maand in kleding.</p>
    <p class="wr-small">Tik om verder te gaan</p>` });

  const lowData = s.days < 4;
  slides.push({ cls: 'wr-cream', html: `
    <p class="wr-kicker">Je droeg</p>
    <h2 class="wr-huge">${s.pct}%</h2>
    <p class="wr-big">van je kast</p>
    <p class="wr-text">${s.worn} van je ${s.total} stukken kwamen deze maand uit de kast.</p>
    ${lowData ? `<p class="wr-small">Je gaf op ${s.days} ${s.days === 1 ? 'dag' : 'dagen'} aan wat je droeg. Tik vaker op ‘Draag ik vandaag’, dan klopt je Wrapped beter.</p>` : ''}` });

  if (s.favorite) {
    const f = s.favorite;
    slides.push({ cls: 'wr-green', html: `
      <p class="wr-kicker">Je favoriet</p>
      <div class="wr-hero">${thumbHTML(f.it)}</div>
      <h2 class="wr-title">${esc(itemTitle(f.it))}</h2>
      <p class="wr-text">${f.n}× gedragen. Jullie zijn onafscheidelijk.</p>` });
  }

  if (s.topColor) {
    const c = colorById(s.topColor);
    const light = ['wit', 'creme', 'beige', 'geel', 'lichtblauw', 'roze'].includes(c.id);
    slides.push({ cls: light ? 'wr-light' : 'wr-dark', style: `background:${colorCss(c)}`, html: `
      <p class="wr-kicker">Je kleur van de maand</p>
      <h2 class="wr-huge wr-word">${esc(c.label)}</h2>` });
  }

  if (s.comebacks.length) {
    slides.push({ cls: 'wr-cream', html: `
      <p class="wr-kicker">Comeback</p>
      <h2 class="wr-title">${s.comebacks.length === 1 ? 'Dit stuk is terug' : `${s.comebacks.length} stukken zijn terug`}</h2>
      <p class="wr-text">Weken niet gedragen, en nu weer wel.</p>
      <div class="wr-grid">${s.comebacks.slice(0, 6).map(it => `<div>${thumbHTML(it)}</div>`).join('')}</div>` });
  }

  slides.push(s.forgotten.length ? { cls: 'wr-ink', html: `
      <p class="wr-kicker">Bleef hangen</p>
      <h2 class="wr-title">${s.forgotten.length === 1 ? '1 stuk' : `${s.forgotten.length} stukken`} droeg je niet</h2>
      <div class="wr-grid">${s.forgotten.slice(0, 6).map(it => `<div>${thumbHTML(it)}</div>`).join('')}</div>
      <button class="btn wr-btn" id="wr-boost">Geef ze volgende maand voorrang</button>` }
    : { cls: 'wr-ink', html: `
      <p class="wr-kicker">Bleef hangen</p>
      <h2 class="wr-title">Niks. Je droeg echt alles.</h2>
      <p class="wr-text">Zo hoort een kast te werken.</p>` });

  const diff = prev.events > 0 ? s.pct - prev.pct : null;
  slides.push({ cls: 'wr-cream wr-end', html: `
    <p class="wr-kicker">Fitchecker Wrapped · ${month}</p>
    <h2 class="wr-huge wr-quote">Draag wat je hebt.</h2>
    <p class="wr-text">${diff === null ? `Je droeg ${s.pct}% van je kast.` : diff > 0 ? `Je droeg ${s.pct}% van je kast, ${diff}% meer dan vorige maand.` : diff < 0 ? `Je droeg ${s.pct}% van je kast. Vorige maand was het ${prev.pct}%: volgende maand weer meer?` : `Je droeg ${s.pct}% van je kast, net als vorige maand.`}</p>
    <div class="wr-actions">
      ${navigator.share ? '<button class="btn" id="wr-share">Delen</button>' : ''}
      <button class="btn primary" id="wr-close-end">Klaar</button>
    </div>` });

  wrappedSlides = slides;
  wrappedIndex = 0;
  renderWrapped();
  if (!$('#wrapped').open) $('#wrapped').showModal();
}

function renderWrapped() {
  const slide = wrappedSlides[wrappedIndex];
  $('#wr-bars').innerHTML = wrappedSlides.map((_, i) => `<span class="${i < wrappedIndex ? 'done' : i === wrappedIndex ? 'on' : ''}"></span>`).join('');
  const el = $('#wr-slide');
  el.className = `wr-slide ${slide.cls}`;
  el.style.cssText = slide.style || '';
  el.innerHTML = slide.html;
  $('#wrapped').className = `wrapped ${slide.cls.split(' ')[0]}`;
  if (slide.style) $('#wrapped').style.cssText = slide.style; else $('#wrapped').style.cssText = '';

  $('#wr-boost')?.addEventListener('click', async e => {
    e.stopPropagation();
    for (const it of wrappedData.s.forgotten) await saveItem({ ...it, boost: true });
    e.target.textContent = 'Komt goed ✓';
    e.target.disabled = true;
  });
  $('#wr-share')?.addEventListener('click', e => { e.stopPropagation(); shareWrapped(); });
  $('#wr-close-end')?.addEventListener('click', e => { e.stopPropagation(); $('#wrapped').close(); });
}

// Tikken: rechts = verder, links = terug. Zoals bij stories.
$('#wr-slide').addEventListener('click', e => {
  if (e.target.closest('button')) return;
  const left = e.clientX < window.innerWidth * 0.3;
  if (left) wrappedIndex = Math.max(0, wrappedIndex - 1);
  else if (wrappedIndex < wrappedSlides.length - 1) wrappedIndex++;
  renderWrapped();
});
$('#wr-close').onclick = () => $('#wrapped').close();
$('#wrapped').addEventListener('close', () => renderKast());

// ---------- Delen als afbeelding (voor bijvoorbeeld een Instagram-story) ----------
async function shareWrapped() {
  const { s } = wrappedData;
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  await document.fonts.ready;
  g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f3efe6'; g.textAlign = 'center';
  g.font = '600 40px Inter'; g.fillText('FITCHECKER WRAPPED', W / 2, 220);
  g.font = '400 64px "DM Serif Display"'; g.fillText(monthLabel(s.key), W / 2, 310);
  g.font = '400 300px "DM Serif Display"'; g.fillText(`${s.pct}%`, W / 2, 760);
  g.font = '500 56px Inter'; g.fillText('van mijn kast gedragen', W / 2, 860);
  let y = 1060;
  if (s.favorite) {
    g.font = '600 34px Inter'; g.fillStyle = '#b9b2a4'; g.fillText('FAVORIET', W / 2, y);
    g.font = '600 76px Caveat'; g.fillStyle = '#f3efe6'; g.fillText(`${itemTitle(s.favorite.it).toLowerCase()} · ${s.favorite.n}×`, W / 2, y + 90);
    y += 220;
  }
  if (s.topColor) {
    const col = colorById(s.topColor);
    g.font = '600 34px Inter'; g.fillStyle = '#b9b2a4'; g.fillText('KLEUR VAN DE MAAND', W / 2, y);
    g.fillStyle = col.hex || '#888'; g.beginPath(); g.arc(W / 2 - 150, y + 66, 34, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f3efe6'; g.lineWidth = 4; g.stroke();
    g.font = '600 76px Caveat'; g.fillStyle = '#f3efe6'; g.textAlign = 'left'; g.fillText(col.label.toLowerCase(), W / 2 - 90, y + 90);
    g.textAlign = 'center';
  }
  g.font = 'italic 400 80px "DM Serif Display"'; g.fillText('Draag wat je hebt.', W / 2, H - 260);
  g.font = '500 34px Inter'; g.fillStyle = '#b9b2a4'; g.fillText('fitchecker', W / 2, H - 170);

  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], `fitchecker-wrapped-${s.key}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* geannuleerd */ }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}


// ---------- Instellingen: eerdere Wrapped's terugkijken ----------
function renderWrappedSettings() {
  const keys = [];
  let key = prevMonthKey(monthKey(new Date()));
  for (let i = 0; i < 12; i++, key = prevMonthKey(key)) if (hasWrapped(key)) keys.push(key);
  $('#wrapped-list').innerHTML = keys.length
    ? keys.map(k => `<button class="settings-row" data-wrapped="${k}"><span>Wrapped ${monthLabel(k)}</span><span class="muted">›</span></button>`).join('')
    : '<p class="muted small">Aan het begin van elke maand krijg je een overzicht van wat je de maand ervoor droeg. Geef aan wat je draagt (‘Draag ik vandaag’), dan komt je eerste Wrapped vanzelf.</p>';
  $('#wrapped-list').querySelectorAll('[data-wrapped]').forEach(b => b.onclick = () => openWrapped(b.dataset.wrapped));
}
