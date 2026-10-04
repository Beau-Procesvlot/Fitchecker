// Tabblad "Kast": een prikbord met je kleding als polaroids, en het detailscherm van één stuk.

let kastFilter = 'all'; // 'all' | 'wash'
let kastCategory = 'all';
const justAdded = new Set(); // net toegevoegd: deze polaroids "ontwikkelen" zich

// Vaste "willekeur" per stuk, zodat een polaroid elke keer even scheef hangt.
function seeded(id, salt) {
  let h = 2166136261;
  for (const ch of id + salt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

// Hoe lang hangt een stuk al ongedragen? Vanaf de laatste keer dragen, of vanaf het toevoegen.
function daysUnworn(it) {
  const last = it.worn?.[it.worn.length - 1];
  const since = last ? new Date(last).getTime() : (it.createdAt || Date.now());
  return Math.floor((Date.now() - since) / 86400000);
}

function polaroidHTML(it) {
  const c = colorById(it.color);
  const rot = (seeded(it.id, 'r') * 7 - 3.5).toFixed(1);       // -3.5° … 3.5°
  const dy = Math.round(seeded(it.id, 'y') * 14);               // een beetje hoger of lager
  const px = Math.round(35 + seeded(it.id, 'p') * 30);          // punaise niet altijd precies in het midden
  // Punaise in de kleur van het stuk (bij een print: de eerste echte kleur).
  const pinColor = c.print ? colorById(it.colors?.find(x => x.id !== 'print')?.id || 'zwart').hex : c.hex;
  // Vergeten stukken vergelen langzaam: vanaf 3 weken ongedragen.
  const days = daysUnworn(it);
  const age = days >= 21 ? Math.min(0.65, (days - 14) / 80) : 0;
  const weeks = days >= 21 ? ` · ${Math.floor(days / 7)} wk` : '';
  const img = it.photo
    ? `<img src="${it.photo}" alt="">`
    : `<div class="pol-color" style="background:${colorCss(c)}"></div>`;
  return `<button class="polaroid ${it.inWash ? 'washing' : ''} ${justAdded.has(it.id) ? 'developing' : ''}" data-id="${it.id}"
      style="--r:${rot}deg;--dy:${dy}px;--age:${age.toFixed(2)};--pin:${pinColor};--px:${px}%">
    <span class="pushpin" aria-hidden="true"></span>
    <div class="pol-img">${img}</div>
    <span class="pol-cap">${esc(itemTitle(it))}${weeks}</span>
    ${it.inWash ? '<span class="pol-sticker">in de was</span>' : ''}
  </button>`;
}

function miniHTML(it) {
  return it.photo ? `<img src="${it.photo}" alt="">` : `<span style="background:${colorCss(colorById(it.color))}"></span>`;
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

  // Borden, zoals op Pinterest: per categorie een collage van je stukken. Tik = filteren.
  const used = sortedCategories().filter(c => state.items.some(i => i.categoryId === c.id));
  if (kastCategory !== 'all' && !used.some(c => c.id === kastCategory)) kastCategory = 'all';
  $('#kast-boards').classList.toggle('hidden', used.length < 2);
  const boards = [{ id: 'all', name: 'Alles', items: state.items }, ...used.map(c => ({ id: c.id, name: c.name, items: state.items.filter(i => i.categoryId === c.id) }))];
  $('#kast-boards').innerHTML = boards.map(b => `
    <button class="board ${kastCategory === b.id ? 'on' : ''}" data-board="${b.id}">
      <div class="board-cover">${[0, 1, 2, 3].map(n => b.items[n] ? `<div>${miniHTML(b.items[n])}</div>` : '<div></div>').join('')}</div>
      <span class="board-name">${esc(b.name)}</span>
      <span class="board-count">${b.items.length}</span>
    </button>`).join('');
  $('#kast-boards').querySelectorAll('.board').forEach(b => b.onclick = () => { kastCategory = b.dataset.board; renderKast(); });

  const order = Object.fromEntries(sortedCategories().map((c, i) => [c.id, i]));
  const list = (kastFilter === 'wash' ? inWash : state.items)
    .filter(i => kastCategory === 'all' || i.categoryId === kastCategory)
    .sort((a, b) => order[a.categoryId] - order[b.categoryId] || (b.createdAt || 0) - (a.createdAt || 0));

  $('#corkboard').classList.toggle('hidden', !list.length);
  $('#kast-list').innerHTML = list.map(polaroidHTML).join('');
  justAdded.clear();
  // Aantikken: de polaroid komt los van het bord, daarna opent het stuk.
  $('#kast-list').querySelectorAll('.polaroid').forEach(b => b.onclick = () => {
    b.classList.add('lifted');
    setTimeout(() => { openDetail(b.dataset.id); b.classList.remove('lifted'); }, 220);
  });
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
