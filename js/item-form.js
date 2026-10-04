// Kledingstukken toevoegen (één of meerdere foto's achter elkaar) of bewerken.
// Categorie kiezen is verplicht; de kleur herkent de app zelf.

let draft = null;
let showPalette = false;
const batch = { files: [], index: 0, saved: 0, processed: [], last: null };

const EMPTY_DRAFT = () => ({ processing: false, id: null, name: '', photo: null, categoryId: null, color: 'zwart', colors: [], fit: 'normaal', warmth: 2, styles: ['casual'], inWash: false, worn: [] });

// ---------- Starten ----------

// De ＋ opent direct de foto-kiezer; je kunt er meerdere tegelijk kiezen.
function startAdding() { $('#f-photos').value = ''; $('#f-photos').click(); }

$('#f-photos').onchange = e => {
  const files = [...e.target.files];
  if (!files.length) return;
  batch.files = files;
  batch.index = 0;
  batch.saved = 0;
  batch.last = null;
  // Foto's alvast verwerken terwijl je de eerste invult.
  batch.processed = files.map(f => processPhoto(f).catch(err => ({ error: err.message })));
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

  const result = await batch.processed[batch.index];
  draft.processing = false;
  if (result.error) toast(result.error);
  else Object.assign(draft, { photo: result.photo, ratio: result.ratio, color: result.color, colors: result.colors });
  renderItemForm();
}

function openItemForm(existing) {
  batch.files = [];
  draft = existing ? { ...EMPTY_DRAFT(), ...existing, styles: [...existing.styles] } : EMPTY_DRAFT();
  if (!draft.colors?.length) draft.colors = [{ id: draft.color, pct: 100 }];
  showPalette = !draft.photo;
  $('#form-title').textContent = existing ? 'Bewerken' : 'Nieuw kledingstuk';
  $('#f-name').value = draft.name;
  renderItemForm();
  $('#item-form').showModal();
  $('#item-form .sheet-body').scrollTop = 0;
}

// ---------- Weergave ----------

function colorSummaryHTML() {
  if (draft.processing) return '<span class="muted">Kleuren herkennen…</span>';
  const list = draft.colors?.length ? draft.colors : [{ id: draft.color, pct: 100 }];
  const dots = list.map(c => `<span class="color-tag"><span class="dot" style="background:${colorCss(colorById(c.id))}"></span>${colorById(c.id).label}${list.length > 1 ? ` <span class="muted">${c.pct}%</span>` : ''}</span>`).join('');
  return (draft.color === 'print' ? '<span class="color-tag"><span class="dot" style="background:' + colorCss(colorById('print')) + '"></span>Print</span>' : '') + dots;
}

function renderItemForm() {
  $('#f-photo-area').innerHTML = draft.processing
    ? '<div class="photo-empty">Foto verwerken…</div>'
    : draft.photo
      ? `<img src="${draft.photo}" alt=""><span class="photo-change">Andere foto</span>`
      : `<div class="photo-empty"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>Maak een foto of kies er een</div>`;
  $('#f-tip').classList.toggle('hidden', !!(draft.photo || draft.processing));

  // Categorieën gegroepeerd per plek, zodat je snel de juiste vindt.
  const cats = sortedCategories();
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
  $('#f-color-fix').classList.toggle('hidden', !!(showPalette || !draft.photo || draft.processing));
  $('#f-colors').classList.toggle('hidden', !showPalette);
  $('#f-colors').innerHTML = COLORS.map(c => `
    <button type="button" class="color ${draft.color === c.id ? 'on' : ''}" data-c="${c.id}" title="${c.label}" style="background:${colorCss(c)}"></button>`).join('');
  $('#f-colors').querySelectorAll('button').forEach(b => b.onclick = () => {
    draft.color = b.dataset.c;
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
  const ok = !!draft.categoryId && !draft.processing;
  $('#f-save').disabled = !ok;
  $('#f-save').textContent = inBatch && !last ? 'Opslaan, volgende' : 'Opslaan';
  $('#f-cancel').textContent = inBatch ? 'Overslaan' : 'Annuleren';
  $('#f-hint').classList.toggle('hidden', !!draft.categoryId);
}

$('#f-color-fix').onclick = () => { showPalette = true; renderItemForm(); };

// Eén foto vervangen (bij bewerken, of als de foto mislukt is).
$('#f-photo-area').onclick = () => { if (!draft.processing) $('#f-photo').click(); };
$('#f-photo').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  draft.processing = true;
  renderItemForm();
  try {
    Object.assign(draft, await processPhoto(file));
    showPalette = false;
  } catch (err) {
    toast(err.message);
  }
  draft.processing = false;
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
  if (!draft.categoryId || draft.processing) return;
  const isNew = !draft.id;
  const { processing, ...rest } = draft;
  const item = {
    ...rest,
    id: draft.id || newId(),
    name: draft.name.trim(),
    styles: draft.styles.length ? draft.styles : ['casual'],
    createdAt: draft.createdAt || Date.now(),
  };
  await saveItem(item);
  renderKast();
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
