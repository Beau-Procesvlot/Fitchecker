// Tabblad "Kast": overzicht per categorie, en het detailscherm van één kledingstuk.

let kastFilter = 'all'; // 'all' | 'wash'
let kastCategory = 'all';

// Placeholder-kaarten zonder foto krijgen per plek een eigen vorm,
// zodat het raster ook zonder foto's een Pinterest-ritme heeft.
const SWATCH_RATIO = { base: '1', mid: '1', bottom: '3 / 4', full: '2 / 3', shoes: '4 / 3', outer: '4 / 5', acc: '1' };

// "3 / 4" -> hoogte gedeeld door breedte (1.33)
function ratioValue(css) {
  const [w, h] = css.split('/').map(Number);
  return h ? h / w : 1;
}

function renderKast() {
  const inWash = state.items.filter(i => i.inWash);
  if (kastFilter === 'wash' && !inWash.length) kastFilter = 'all';

  // De wasmand is bewust klein: alleen zichtbaar als er iets in zit.
  $('#wash-bar').classList.toggle('hidden', !inWash.length);
  $('#wash-bar').innerHTML = inWash.length ? `
    <button class="link" id="wash-toggle">${inWash.length} in de was${kastFilter === 'wash' ? ' · toon alles' : ''}</button>
    <button class="link" id="wash-empty">Alles is schoon</button>` : '';
  if (inWash.length) {
    $('#wash-toggle').onclick = () => { kastFilter = kastFilter === 'wash' ? 'all' : 'wash'; renderKast(); };
    $('#wash-empty').onclick = async () => {
      for (const it of inWash) await saveItem({ ...it, inWash: false });
      kastFilter = 'all';
      toast('Wasmand is leeg');
      renderKast();
    };
  }

  $('#kast-empty').classList.toggle('hidden', state.items.length > 0);
  $('#kast-count').textContent = state.items.length ? `${state.items.length} stuks` : '';

  // Filterknoppen: alleen categorieën waar iets in zit, in volgorde van het lichaam.
  const used = sortedCategories().filter(c => state.items.some(i => i.categoryId === c.id));
  if (kastCategory !== 'all' && !used.some(c => c.id === kastCategory)) kastCategory = 'all';
  $('#kast-filter').classList.toggle('hidden', used.length < 2);
  renderChips($('#kast-filter'), [{ id: 'all', label: 'Alles' }, ...used.map(c => ({ id: c.id, label: c.name }))],
    id => id === kastCategory, id => { kastCategory = id; renderKast(); });

  const order = Object.fromEntries(sortedCategories().map((c, i) => [c.id, i]));
  const list = (kastFilter === 'wash' ? inWash : state.items)
    .filter(i => kastCategory === 'all' || i.categoryId === kastCategory)
    .sort((a, b) => order[a.categoryId] - order[b.categoryId] || (b.createdAt || 0) - (a.createdAt || 0));

  // Twee kolommen zoals Pinterest: elk stuk gaat naar de kortste kolom,
  // zodat de volgorde van links naar rechts loopt.
  const cols = [[], []], heights = [0, 0];
  for (const it of list) {
    const ratio = it.photo ? (it.ratio || 1) : ratioValue(SWATCH_RATIO[slotOf(it)] || '1');
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push(it);
    heights[c] += ratio + 0.15; // + ruimte voor de naam
  }
  const pinHTML = it => `
    <button class="pin ${it.inWash ? 'washing' : ''}" data-id="${it.id}">
      ${it.photo
        ? `<img src="${it.photo}" alt="" style="aspect-ratio:${1 / (it.ratio || 1)}">`
        : `<div class="pin-swatch" style="aspect-ratio:${SWATCH_RATIO[slotOf(it)] || '1'}"><div class="swatch" style="background:${colorCss(colorById(it.color))}"></div></div>`}
      ${it.inWash ? '<span class="badge">In de was</span>' : ''}
      <span class="pin-name">${esc(itemTitle(it))}</span>
    </button>`;
  $('#kast-list').innerHTML = cols.map(col => `<div class="masonry-col">${col.map(pinHTML).join('')}</div>`).join('');
  $('#kast-list').querySelectorAll('.pin').forEach(b => b.onclick = () => openDetail(b.dataset.id));
}

function openDetail(id) {
  const it = state.items.find(i => i.id === id);
  if (!it) return;
  const cat = categoryById(it.categoryId);
  const color = colorById(it.color);
  const lastWorn = it.worn?.length ? it.worn[it.worn.length - 1] : null;
  const wornToday = lastWorn === today();

  $('#detail-body').innerHTML = `
    <div class="detail-pic">${pictureHTML(it)}</div>
    <h2>${esc(itemTitle(it))}</h2>
    <dl class="facts">
      <dt>Categorie</dt><dd>${esc(cat?.name || '?')}</dd>
      <dt>Kleur</dt><dd class="wrap">${it.color === 'print' ? `<span class="dot" style="background:${colorCss(color)}"></span>Print · ` : ''}${(it.colors?.length ? it.colors : [{ id: it.color }]).filter(c => c.id !== 'print').map(c => `<span class="dot" style="background:${colorCss(colorById(c.id))}"></span>${colorById(c.id).label}`).join(' ')}</dd>
      ${FIT_SLOTS.includes(slotOf(it)) ? `<dt>Pasvorm</dt><dd>${FITS.find(f => f.id === it.fit)?.label || 'Normaal'}</dd>` : ''}
      <dt>Warmte</dt><dd>${WARMTH.find(w => w.id === it.warmth)?.label || '-'}</dd>
      <dt>Stijl</dt><dd>${it.styles.map(s => STYLES.find(x => x.id === s)?.label).filter(Boolean).join(', ') || '-'}</dd>
      <dt>Gedragen</dt><dd>${daysAgoText(lastWorn)}${it.worn?.length ? ` · ${it.worn.length}×` : ''}</dd>
    </dl>
    <div class="actions">
      <button class="btn primary" id="d-wear" ${wornToday ? 'disabled' : ''}>${wornToday ? 'Vandaag gedragen ✓' : 'Draag ik vandaag'}</button>
      <button class="btn" id="d-wash">${it.inWash ? 'Uit de wasmand' : 'In de wasmand'}</button>
      <div class="row">
        <button class="btn" id="d-edit">Bewerken</button>
        <button class="btn danger" id="d-del">Verwijderen</button>
      </div>
    </div>`;

  $('#d-wear').onclick = async () => {
    await saveItem({ ...it, worn: [...(it.worn || []), today()] });
    toast('Genoteerd');
    openDetail(id); renderKast();
  };
  $('#d-wash').onclick = async () => {
    await saveItem({ ...it, inWash: !it.inWash });
    $('#detail').close(); renderKast();
  };
  $('#d-edit').onclick = () => { $('#detail').close(); openItemForm(it); };
  $('#d-del').onclick = async () => {
    if (!confirm(`"${itemTitle(it)}" verwijderen?`)) return;
    await removeItem(it.id);
    $('#detail').close(); renderKast();
    toast('Verwijderd');
  };
  if (!$('#detail').open) $('#detail').showModal();
}

$('#fab').onclick = () => startAdding();
$('#empty-add').onclick = () => startAdding();
$('#empty-demo').onclick = loadDemo;
