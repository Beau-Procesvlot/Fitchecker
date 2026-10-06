// Moodboard: tik aan wat je mooi vindt, daaruit maakt de app je stijlprofiel.
// De afbeeldingen maakt de maker van de app zelf. Ze staan in de map moodboard/ met een lijst
// moodboard/index.json, zo:
//   { "man":   [{ "file": "man/street-1.jpg", "style": "street" }, …],
//     "vrouw": [{ "file": "vrouw/clean-1.jpg", "style": "clean" }, …] }
// Zolang er (voor jouw keuze man/vrouw) nog geen afbeeldingen zijn, kies je uit stijl-tegels.

let moodImages = null;   // [{ file, style }] of [] als er (nog) geen zijn
let moodPicks = new Set();
let moodDone = null;      // wat er moet gebeuren na "Klaar"

async function loadMoodImages() {
  try {
    const res = await fetch('moodboard/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const g = state.profile.gender;
    // Bij "alles laten zien": de afbeeldingen van allebei.
    moodImages = g === 'man' ? data.man || [] : g === 'vrouw' ? data.vrouw || [] : [...(data.man || []), ...(data.vrouw || [])];
  } catch {
    moodImages = [];
  }
  // Door elkaar, zodat stijlen niet in blokken achter elkaar staan.
  moodImages = moodImages.map(m => ({ m, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.m);
  return moodImages;
}

// Tekent het moodboard in een element. Met foto's: een Pinterest-wand. Zonder: stijl-tegels.
async function renderMoodboard(el, hintEl, doneBtn) {
  if (!moodImages) await loadMoodImages();
  const withImages = moodImages.length > 0;
  el.classList.toggle('mood-wall', withImages);
  el.classList.toggle('mood-styles', !withImages);
  if (withImages) {
    el.innerHTML = moodImages.map((m, i) => `
      <button class="mood-pin ${moodPicks.has(i) ? 'on' : ''}" data-i="${i}" aria-label="Mooi">
        <img src="moodboard/${m.file}" alt="" loading="lazy">
        <span class="mood-heart">${heartSVG(moodPicks.has(i))}</span>
      </button>`).join('');
  } else {
    el.innerHTML = STYLE_PROFILES.map(p => `
      <button class="mood-style ${moodPicks.has(p.id) ? 'on' : ''}" data-s="${p.id}">
        <span class="mood-dots">${p.dots.map(c => `<span style="background:${c}"></span>`).join('')}</span>
        <strong>${p.label}</strong><span class="muted small">${p.hint}</span>
      </button>`).join('');
  }
  el.querySelectorAll('button').forEach(b => b.onclick = () => {
    const key = withImages ? +b.dataset.i : b.dataset.s;
    moodPicks.has(key) ? moodPicks.delete(key) : moodPicks.add(key);
    renderMoodboard(el, hintEl, doneBtn);
  });
  const need = withImages ? 5 : 1;
  hintEl.textContent = withImages
    ? (moodPicks.size < need ? `Tik minstens ${need} looks aan die je mooi vindt (${moodPicks.size} gekozen).` : `${moodPicks.size} gekozen. Meer mag ook.`)
    : (moodPicks.size ? `${moodPicks.size} gekozen. Meer mag ook.` : 'Kies een of meer stijlen die bij je passen.');
  doneBtn.disabled = moodPicks.size < need;
}

// Van je keuzes naar een stijlprofiel: elke stijl krijgt een deel, naar hoe vaak je hem koos.
function picksToWeights() {
  const counts = Object.fromEntries(STYLE_PROFILES.map(p => [p.id, 0]));
  for (const k of moodPicks) {
    const style = typeof k === 'number' ? moodImages[k]?.style : k;
    if (style in counts) counts[style]++;
  }
  return normalizeWeights(counts);
}

async function saveMoodboard() {
  state.profile.styleWeights = picksToWeights();
  await saveProfile();
}

// Stijlprofiel als balkjes (Instellingen).
function styleProfileHTML() {
  const w = state.profile.styleWeights;
  if (!w) return '<p class="muted small">Nog geen stijlprofiel. Stel het in met het moodboard.</p>';
  return Object.entries(w).filter(([, v]) => v >= 0.04).sort((a, b) => b[1] - a[1]).map(([id, v]) => {
    const p = STYLE_PROFILES.find(x => x.id === id);
    return `<div class="style-bar"><span>${p.label}</span><span class="bar"><span style="width:${Math.round(v * 100)}%"></span></span><span class="muted small">${Math.round(v * 100)}%</span></div>`;
  }).join('');
}

// Opnieuw instellen vanuit Instellingen, in een eigen scherm.
async function openMoodboardSheet() {
  moodPicks = new Set();
  moodImages = null;
  await renderMoodboard($('#mood-sheet-grid'), $('#mood-sheet-hint'), $('#mood-sheet-done'));
  $('#mood-sheet').showModal();
}
$('#mood-sheet-done').onclick = async () => {
  await saveMoodboard();
  $('#mood-sheet').close();
  toast('Je stijlprofiel is bijgewerkt');
  renderSettings();
};
