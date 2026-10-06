// Kastcheck: hooguit één keer per week laat de app bij het openen een paar stukken zien
// die je lang niet droeg: "Heb je dit de afgelopen maand gedragen?"
// Ja: dan telt het als gedragen. Nee: dan krijgt het voorrang in je looks, tot je het draagt.

const KASTCHECK_DAYS = 7;
let kastcheckItems = [];
const kastcheckAnswers = {};

function kastcheckDue() {
  const last = state.profile.lastKastcheck || 0;
  if (Date.now() - last < KASTCHECK_DAYS * 86400000) return [];
  return state.items
    .filter(i => !i.inWash && daysUnworn(i) >= 21 && (Date.now() - (i.createdAt || 0)) > 14 * 86400000)
    .sort((a, b) => daysUnworn(b) - daysUnworn(a))
    .slice(0, 5);
}

// Toont de kastcheck als die aan de beurt is. Geeft true als hij getoond wordt.
function maybeKastcheck(after) {
  kastcheckItems = kastcheckDue();
  if (kastcheckItems.length < 3) return false;
  for (const k of Object.keys(kastcheckAnswers)) delete kastcheckAnswers[k];
  renderKastcheck();
  $('#kastcheck').showModal();
  $('#kastcheck').onclose = () => { if (after) after(); };
  return true;
}

function renderKastcheck() {
  $('#kastcheck-list').innerHTML = kastcheckItems.map(it => `
    <div class="kc-row">
      <div class="kc-pic">${it.photo ? `<img src="${it.photo}" alt="">` : `<span class="swatch" style="background:${colorCss(colorById(it.color))}"></span>`}</div>
      <div class="kc-text"><strong>${esc(itemTitle(it))}</strong><span class="muted small">${Math.floor(daysUnworn(it) / 7)} weken niet gedragen</span></div>
      <div class="kc-btns">
        <button class="chip ${kastcheckAnswers[it.id] === 'ja' ? 'on' : ''}" data-id="${it.id}" data-a="ja">Gedragen</button>
        <button class="chip ${kastcheckAnswers[it.id] === 'nee' ? 'on' : ''}" data-id="${it.id}" data-a="nee">Niet</button>
      </div>
    </div>`).join('');
  $('#kastcheck-list').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    kastcheckAnswers[b.dataset.id] = b.dataset.a;
    renderKastcheck();
  });
  const n = Object.keys(kastcheckAnswers).length;
  $('#kastcheck-done').textContent = n ? 'Klaar' : 'Overslaan';
}

$('#kastcheck-done').onclick = async () => {
  // "Gedragen" telt als gedragen, ongeveer een week geleden (de precieze dag weet je vaak niet meer).
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const date = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
  let nee = 0;
  for (const it of kastcheckItems) {
    const a = kastcheckAnswers[it.id];
    if (a === 'ja') await saveItem({ ...it, worn: [...(it.worn || []), date].sort(), boost: false });
    if (a === 'nee') { await saveItem({ ...it, boost: true }); nee++; }
  }
  state.profile.lastKastcheck = Date.now();
  await saveProfile();
  if (nee) toast(`${nee} ${nee === 1 ? 'stuk krijgt' : 'stukken krijgen'} voorrang in je looks`);
  $('#kastcheck').close();
  renderKast();
};
