// Kledingstukken toevoegen (één of meerdere foto's achter elkaar) of bewerken.
// Categorie kiezen is verplicht; de kleur herkent de app zelf.

let draft = null;
let showPalette = false;
const batch = { files: [], index: 0, saved: 0, processed: [], last: null };

const EMPTY_DRAFT = () => ({ processing: false, id: null, name: '', photo: null, categoryId: null, color: 'zwart', colors: [], fit: 'normaal', warmth: 2, styles: ['casual'], inWash: false, worn: [] });

// ---------- Starten ----------

// De ＋ vraagt: foto's kiezen (één of meerdere) of snel zonder foto.
function startAdding() { $('#add-choice').showModal(); }
$('#choice-photos').onclick = () => {
  $('#add-choice').close();
  $('#f-photos').value = '';
  withPhotoTips($('#f-photos'));
};

// Vóór het fotograferen: de schets met hoe je een stuk het best neerlegt. De knop in het scherm
// opent meteen de camera of je foto's (dat moet direct na een tik, anders blokkeert de iPhone het).
function withPhotoTips(input) {
  if (state.profile.photoTipsHidden) { Cutout.preloadQuiet(); input.click(); return; }
  $('#pt-download').classList.toggle('hidden', !!state.profile.cutoutReady);
  $('#pt-hide').checked = false;
  $('#pt-go').onclick = async () => {
    // Met deze tik geef je ook toestemming voor het eenmalig downloaden van het uitknipmodel.
    Cutout.preloadQuiet();
    input.click();
    $('#photo-tips').close();
    if ($('#pt-hide').checked) { state.profile.photoTipsHidden = true; await saveProfile(); }
  };
  $('#photo-tips').showModal();
}
$('#pt-cancel').onclick = () => $('#photo-tips').close();
$('#settings-phototips').onclick = async () => {
  state.profile.photoTipsHidden = false;
  await saveProfile();
  toast('De fototips komen weer voor je foto’s');
};

// Eerst uitknippen, dan pas de kleur: anders telt de achtergrond mee.
// Een foto die de iPhone al heeft uitgeknipt, is meteen klaar.
async function withCutout(result, onProgress) {
  if (!result || result.error || result.cutout) return result;
  const cut = await Cutout.cutNow(result.photo, onProgress);
  if (!cut) return { ...result, cutFailed: true }; // geen model of geen internet: kleur uit de hele foto
  const c = detectColors(cut.canvas);
  return { ...result, cutout: cut.dataUrl, color: c.color, colors: c.colors, lowContrast: false };
}

// Voortgang van de eerste download van het model, in het toevoegscherm.
function cutProgress(done, total) {
  if (!draft?.cutting || !total) return;
  draft.cutLabel = done >= total ? '' : `Uitknipmodel downloaden: ${Math.round(done / 1048576)} van ${Math.round(total / 1048576)} MB`;
  $('#f-color-summary').innerHTML = colorSummaryHTML();
}
$('#choice-quick').onclick = () => {
  $('#add-choice').close();
  openItemForm(null, { quick: true });
};

$('#f-photos').onchange = e => {
  const files = [...e.target.files];
  if (!files.length) return;
  batch.files = files;
  batch.index = 0;
  batch.saved = 0;
  batch.last = null;
  // Foto's alvast verwerken terwijl je de eerste invult: eerst de foto zelf, daarna (één voor één) uitknippen.
  batch.photos = files.map(f => processPhoto(f).catch(err => ({ error: err.message })));
  let chain = Promise.resolve();
  batch.processed = batch.photos.map(p => (chain = chain.then(() => p).then(r => withCutout(r, cutProgress))));
  openBatchItem(null);
};

async function openBatchItem(previous) {
  // Categorie, pasvorm, warmte en stijl van het vorige stuk alvast overnemen:
  // vaak fotografeer je een stapel van hetzelfde soort.
  draft = EMPTY_DRAFT();
  if (previous) Object.assign(draft, { categoryId: previous.categoryId, fit: previous.fit, warmth: previous.warmth, styles: [...previous.styles] });
  showPalette = false;
  $('#f-name').value = '';
  $('#form-title').textContent = batch.files.length > 1 ? `Stuk ${batch.index + 1} van ${batch.files.length}` : 'Nieuw kledingstuk';
  draft.processing = true;
  renderItemForm();
  if (!$('#item-form').open) $('#item-form').showModal();
  $('#item-form .sheet-body').scrollTop = 0;

  const index = batch.index;
  const photo = await batch.photos[index];
  draft.processing = false;
  if (photo.error) { toast(photo.error); renderItemForm(); return; }
  // De foto alvast laten zien; de kleur komt pas na het uitknippen.
  Object.assign(draft, { photo: photo.photo, ratio: photo.ratio, cutting: true, cutLabel: '' });
  renderItemForm();
  const result = await batch.processed[index];
  if (batch.index !== index || draft.photo !== photo.photo) return; // intussen verder gegaan
  draft.cutting = false;
  Object.assign(draft, { color: result.color, colors: result.colors, colorsFront: result.colors, cutout: result.cutout, lowContrast: result.lowContrast, cutFailed: result.cutFailed });
  renderItemForm();
}

function openItemForm(existing, { quick = false } = {}) {
  batch.files = [];
  draft = existing ? { ...EMPTY_DRAFT(), ...existing, styles: [...existing.styles] } : EMPTY_DRAFT();
  // Zonder foto kan de app de kleur niet raden: dan kies je hem zelf (verplicht).
  if (quick) { draft.color = null; draft.colors = []; }
  else if (!draft.colors?.length) draft.colors = [{ id: draft.color, pct: 100 }];
  showPalette = !draft.photo;
  $('#form-title').textContent = existing ? 'Bewerken' : quick ? 'Snel toevoegen' : 'Nieuw kledingstuk';
  $('#f-name').value = draft.name;
  renderItemForm();
  $('#item-form').showModal();
  $('#item-form .sheet-body').scrollTop = 0;
}

// ---------- Weergave ----------

function colorSummaryHTML() {
  if (draft.processing) return '<span class="muted">Foto verwerken…</span>';
  if (draft.cutting) return `<span class="muted">${esc(draft.cutLabel || 'Uitknippen… daarna herkent de app de kleur')}</span>`;
  if (draft.cutFailed && draft.color && !draft.colorManual) {
    return colorTagsHTML() + '<p class="muted small cut-note">Uitknippen lukte nu niet (geen internet?), dus de kleur komt uit de hele foto. Klopt hij niet, kies hem dan zelf.</p>';
  }
  return colorTagsHTML();
}
function colorTagsHTML() {
  if (!draft.color) return '<span class="muted">Kies hieronder de kleur</span>';
  const list = draft.colors?.length ? draft.colors : [{ id: draft.color, pct: 100 }];
  const dots = list.map(c => `<span class="color-tag"><span class="dot" style="background:${colorCss(colorById(c.id))}"></span>${colorById(c.id).label}${list.length > 1 ? ` <span class="muted">${c.pct}%</span>` : ''}</span>`).join('');
  return (draft.color === 'print' ? '<span class="color-tag"><span class="dot" style="background:' + colorCss(colorById('print')) + '"></span>Print</span>' : '') + dots;
}

function renderItemForm() {
  $('#f-photo-area').innerHTML = draft.processing
    ? '<div class="photo-empty">Foto verwerken…</div>'
    : draft.photo
      ? `<img src="${draft.photo}" alt=""><span class="photo-change">${draft.cutting ? 'Uitknippen…' : 'Andere foto'}</span>`
      : `<div class="photo-empty"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Foto toevoegen <span class="muted">· mag ook later</span></div>`;
  $('#f-tip').classList.toggle('hidden', !!(draft.photo || draft.processing));
  // Waarschuwing als het stuk op de achtergrond lijkt (en de iPhone het niet al heeft uitgeknipt).
  $('#f-contrast').classList.toggle('hidden', !(draft.photo && draft.lowContrast && !draft.cutout && !draft.processing));
  // Zonder foto is het vlak klein, zodat de categorieën meteen in beeld zijn.
  $('#f-photo-area').classList.toggle('compact', !draft.photo && !draft.processing);

  // Achterkant: optioneel, alleen als er een voorkant is.
  $('#f-back-row').classList.toggle('hidden', !draft.photo || !!draft.processing);
  $('#f-back-area').innerHTML = draft.processingBack
    ? '<span class="back-empty">Verwerken…</span>'
    : draft.photoBack
      ? `<img src="${draft.photoBack}" alt=""><span class="back-label">achterkant</span><span class="back-remove" id="f-back-remove" role="button" aria-label="Achterkant weghalen">×</span>`
      : '<span class="back-empty">＋ Achterkant<br><span class="muted">optioneel</span></span>';
  $('#f-back-hint').classList.toggle('hidden', !!draft.photoBack);
  const rm = $('#f-back-remove');
  if (rm) rm.onclick = e => { e.stopPropagation(); draft.photoBack = null; draft.colorsBack = null; draft.cutoutBack = null; recombineColors(); renderItemForm(); };

  // Categorieën gegroepeerd per plek, zodat je snel de juiste vindt.
  const cats = visibleCategories();
  $('#f-cats').innerHTML = SLOTS.map(slot => {
    const inSlot = cats.filter(c => c.slot === slot.id);
    if (!inSlot.length) return '';
    return `<div class="cat-group"><p>${slot.label}</p><div class="chips">
      ${inSlot.map(c => `<button type="button" class="chip ${draft.categoryId === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}
    </div></div>`;
  }).join('') + `<button type="button" class="chip add" id="f-newcat">＋ Nieuwe categorie</button>`;
  $('#f-cats').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { draft.categoryId = b.dataset.cat; renderItemForm(); });
  $('#f-newcat').onclick = () => openCategoryEditor(null, cat => { draft.categoryId = cat.id; renderItemForm(); });

  // Kleur: herkend uit de foto. Alleen als het niet klopt kies je zelf.
  $('#f-color-summary').innerHTML = colorSummaryHTML();
  $('#f-color-fix').classList.toggle('hidden', !!(showPalette || !draft.photo || draft.processing || draft.cutting));
  $('#f-colors').classList.toggle('hidden', !showPalette);
  $('#f-colors').innerHTML = COLORS.map(c => `
    <button type="button" class="color ${draft.color === c.id ? 'on' : ''}" data-c="${c.id}" title="${c.label}" style="background:${colorCss(c)}"></button>`).join('');
  $('#f-colors').querySelectorAll('button').forEach(b => b.onclick = () => {
    draft.color = b.dataset.c;
    draft.colorManual = true; // zelf gekozen: niet meer automatisch overschrijven
    if (b.dataset.c !== 'print') draft.colors = [{ id: b.dataset.c, pct: 100 }];
    renderItemForm();
  });

  const slot = categoryById(draft.categoryId)?.slot;
  $('#f-fit-row').classList.toggle('hidden', !FIT_SLOTS.includes(slot));
  renderChips($('#f-fit'), FITS, id => draft.fit === id, id => { draft.fit = id; renderItemForm(); });
  renderChips($('#f-warmth'), WARMTH, id => draft.warmth === id, id => { draft.warmth = id; renderItemForm(); });
  renderChips($('#f-styles'), STYLES, id => draft.styles.includes(id), id => {
    draft.styles = draft.styles.includes(id) ? draft.styles.filter(s => s !== id) : [...draft.styles, id];
    renderItemForm();
  });

  const inBatch = batch.files.length > 1;
  const last = batch.index >= batch.files.length - 1;
  const ok = !!draft.categoryId && !!draft.color && !draft.processing && !draft.processingBack && !draft.cutting;
  $('#f-save').disabled = !ok;
  $('#f-save').textContent = inBatch && !last ? 'Opslaan, volgende' : 'Opslaan';
  $('#f-cancel').textContent = inBatch ? 'Overslaan' : 'Annuleren';
  $('#f-hint').textContent = !draft.categoryId ? 'Kies eerst een categorie' : draft.cutting ? 'Even wachten: de app knipt het stuk uit' : 'Kies nog een kleur';
  $('#f-hint').classList.toggle('hidden', ok || !!draft.processing);
}

$('#f-color-fix').onclick = () => { showPalette = true; renderItemForm(); };

// ---------- Achterkant ----------
// De kleuren van voor- en achterkant samen: de voorkant telt zwaarder (65/35).
// De hoofdkleur blijft die van de voorkant; een print op de rug telt mee als kleur.
function recombineColors() {
  draft.colors = mergeFrontBack(draft.colorsFront || draft.colors, draft.colorsBack);
}

$('#f-back-area').onclick = () => { if (!draft.processingBack) $('#f-back').click(); };
$('#f-back').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  draft.processingBack = true;
  renderItemForm();
  try {
    // Ook de achterkant eerst uitknippen, dan pas de kleuren.
    const back = await withCutout(await processPhoto(file));
    if (!draft.colorsFront) draft.colorsFront = draft.colors;
    draft.photoBack = back.photo;
    draft.cutoutBack = back.cutout; // uitgeknipt (door de iPhone of de app), of null
    draft.colorsBack = back.colors;
    recombineColors();
  } catch (err) {
    toast(err.message);
  }
  draft.processingBack = false;
  renderItemForm();
};

// Eén foto vervangen (bij bewerken, of als de foto mislukt is).
$('#f-photo-area').onclick = () => { if (!draft.processing && !draft.cutting) withPhotoTips($('#f-photo')); };
$('#f-photo').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  draft.processing = true;
  renderItemForm();
  try {
    const photo = await processPhoto(file);
    // Foto laten zien, dan uitknippen, dan pas de kleur.
    Object.assign(draft, { photo: photo.photo, ratio: photo.ratio, cutout: null, processing: false, cutting: true, cutLabel: '' });
    renderItemForm();
    const result = await withCutout(photo, cutProgress);
    Object.assign(draft, { color: result.color, colors: result.colors, cutout: result.cutout, lowContrast: result.lowContrast, cutFailed: result.cutFailed });
    draft.colorManual = false;
    draft.colorsFront = draft.colors;
    recombineColors();
    showPalette = false;
  } catch (err) {
    toast(err.message);
  }
  draft.processing = false;
  draft.cutting = false;
  renderItemForm();
};
$('#f-name').oninput = e => { draft.name = e.target.value; };

// ---------- Opslaan en verder ----------

function nextInBatch(previous) {
  if (batch.index < batch.files.length - 1) {
    batch.index++;
    openBatchItem(previous);
    return true;
  }
  $('#item-form').close();
  if (batch.files.length > 1) toast(`${batch.saved} van ${batch.files.length} toegevoegd aan je kast`);
  batch.files = [];
  return false;
}

$('#f-cancel').onclick = () => {
  if (batch.files.length > 1) nextInBatch(batch.last);
  else $('#item-form').close();
};

$('#f-save').onclick = async () => {
  if (!draft.categoryId || draft.processing || draft.processingBack) return;
  const isNew = !draft.id;
  const { processing, processingBack, lowContrast, cutting, cutLabel, cutFailed, ...rest } = draft;
  const item = {
    ...rest,
    id: draft.id || newId(),
    name: draft.name.trim(),
    styles: draft.styles.length ? draft.styles : ['casual'],
    createdAt: draft.createdAt || Date.now(),
  };
  await saveItem(item);
  if (isNew) justAdded.add(item.id);
  renderKast();
  // Op de achtergrond uitknippen (voor de looks); de kast blijft de gewone foto tonen.
  Cutout.enqueue(item);
  if (batch.files.length > 1) {
    batch.saved++;
    batch.last = item;
    nextInBatch(item);
    return;
  }
  batch.files = [];
  $('#item-form').close();
  toast(isNew ? 'Toegevoegd aan je kast' : 'Opgeslagen');
};
