// Gedeelde staat, hulpfuncties en het opstarten van de app.

const state = {
  items: [],
  categories: [],
  // koukleum: -2 (snel warm) … +2 (snel koud); transport: laatst gekozen vervoer.
  profile: { koukleum: 0, transport: 'fiets', onboarded: false, customSituations: [] },
};

const $ = sel => document.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// Lokale datum (niet UTC), anders is het na middernacht nog "gisteren".
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const categoryById = id => state.categories.find(c => c.id === id);
const slotOf = item => categoryById(item.categoryId)?.slot;
const itemTitle = item => item.name || categoryById(item.categoryId)?.name || 'Kledingstuk';

function sortedCategories() {
  const slotIndex = Object.fromEntries(SLOTS.map((s, i) => [s.id, i]));
  return [...state.categories].sort((a, b) => slotIndex[a.slot] - slotIndex[b.slot] || a.order - b.order);
}

// Categorieën om uit te kiezen: zonder de categorieën die niet bij jou passen (man/vrouw),
// maar een categorie waar al iets in zit blijft altijd zichtbaar.
function visibleCategories() {
  const hide = HIDDEN_FOR[state.profile.gender] || [];
  return sortedCategories().filter(c => !hide.includes(c.id) || state.items.some(i => i.categoryId === c.id));
}

// Rij met keuzeknoppen. isOn(id) bepaalt of een knop aan staat.
function renderChips(el, options, isOn, onClick) {
  el.innerHTML = '';
  for (const o of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (isOn(o.id) ? ' on' : '');
    b.textContent = o.label;
    b.onclick = () => onClick(o.id);
    el.appendChild(b);
  }
}

function pictureHTML(item) {
  return item.photo
    ? `<img src="${item.photo}" alt="">`
    : `<div class="swatch" style="background:${colorCss(colorById(item.color))}"></div>`;
}

function daysAgoText(dateStr) {
  if (!dateStr) return 'nog nooit';
  const days = Math.round((new Date(today()) - new Date(dateStr)) / 86400000);
  if (days === 0) return 'vandaag';
  if (days === 1) return 'gisteren';
  return `${days} dagen geleden`;
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Sluit een sheet als je op de donkere achtergrond tikt.
document.querySelectorAll('dialog.sheet').forEach(d => d.addEventListener('click', e => {
  if (e.target === d) d.close();
}));

// Sheets wegslepen aan het greepje bovenaan: ver genoeg (of snel genoeg) omlaag = sluiten,
// anders veert hij terug.
document.querySelectorAll('dialog.sheet .sheet-handle').forEach(handle => {
  const sheet = handle.closest('dialog');
  let startY = 0, lastY = 0, lastT = 0, speed = 0, dragging = false;

  handle.addEventListener('pointerdown', e => {
    dragging = true;
    startY = lastY = e.clientY;
    lastT = performance.now();
    speed = 0;
    sheet.style.transition = 'none';
    try { handle.setPointerCapture(e.pointerId); } catch { /* sommige browsers: niet nodig */ }
  });
  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    const now = performance.now();
    speed = (e.clientY - lastY) / Math.max(1, now - lastT); // px per ms
    lastY = e.clientY;
    lastT = now;
    const dy = Math.max(0, e.clientY - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    const dy = Math.max(0, lastY - startY);
    sheet.style.transition = 'transform .22s ease-out';
    if (dy > sheet.offsetHeight * 0.25 || (dy > 30 && speed > 0.6)) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => { sheet.close(); sheet.style.transform = ''; sheet.style.transition = ''; }, 220);
    } else {
      sheet.style.transform = '';
      setTimeout(() => { sheet.style.transition = ''; }, 220);
    }
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
});

// ---------- Opslaan ----------
async function saveItem(item) {
  await DB.putItem(item);
  const i = state.items.findIndex(x => x.id === item.id);
  if (i >= 0) state.items[i] = item; else state.items.push(item);
}
async function removeItem(id) {
  await DB.deleteItem(id);
  state.items = state.items.filter(x => x.id !== id);
}
async function saveCategories() {
  await DB.setMeta('categories', state.categories);
}
async function saveProfile() {
  await DB.setMeta('profile', state.profile);
}

// ---------- Tabs ----------
function showTab(name) {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + name));
  $('#fab').classList.toggle('hidden', name !== 'kast');
  $('#page-title').textContent = { kast: 'Mijn kast', outfit: 'Today’s look', instellingen: 'Instellingen' }[name];
  $('#page-title').classList.toggle('swash', name === 'outfit');
  window.scrollTo(0, 0);
  if (name === 'kast') renderKast();
  if (name === 'outfit') rerenderKeepScroll();
  if (name === 'instellingen') renderSettings();
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => showTab(b.dataset.tab));

// ---------- Oudere gegevens omzetten ----------
const OLD_CAT = { top: 'tshirts', bottom: 'broeken', dress: 'jurken', outer: 'jassen', shoes: 'sneakers', acc: 'tassen' };
function migrateItem(it) {
  // Fase 2: meerdere kleuren en pasvorm.
  if (it.categoryId) return it.colors && it.fit ? null : { ...it, colors: it.colors || [{ id: it.color, pct: 100 }], fit: it.fit || 'normaal' };
  return {
    colors: [{ id: COLORS.some(c => c.id === it.color) ? it.color : 'zwart', pct: 100 }], fit: 'normaal',
    id: it.id, name: it.name || '', photo: it.photo || null,
    categoryId: OLD_CAT[it.cat] || 'tshirts',
    color: COLORS.some(c => c.id === it.color) ? it.color : 'zwart',
    warmth: it.season === 'koud' ? 3 : it.season === 'warm' ? 1 : 2,
    styles: it.styles?.length ? it.styles : ['casual'],
    inWash: false, worn: [], createdAt: Date.now(),
  };
}

// ---------- Voorbeeldkast ----------
async function loadDemo() {
  const demo = [
    ['Wit T-shirt', 'tshirts', 'wit', 1, ['casual', 'sport']],
    ['Zwart T-shirt', 'tshirts', 'zwart', 1, ['casual']],
    ['Gestreept shirt', 'tshirts', 'print', 2, ['casual']],
    ['Lichtblauwe blouse', 'blouses', 'lichtblauw', 1, ['net', 'casual']],
    ['Roze top', 'tops', 'roze', 1, ['casual', 'feest']],
    ['Zwarte coltrui', 'truien', 'zwart', 3, ['casual', 'net']],
    ['Groene trui', 'truien', 'groen', 3, ['casual']],
    ['Grijze hoodie', 'hoodies', 'grijs', 2, ['casual', 'sport']],
    ['Crème vest', 'vesten', 'creme', 2, ['casual', 'net']],
    ['Blauwe spijkerbroek', 'spijkerbroeken', 'denim', 2, ['casual']],
    ['Zwarte spijkerbroek', 'spijkerbroeken', 'zwart', 2, ['casual', 'feest']],
    ['Beige pantalon', 'broeken', 'beige', 2, ['net', 'casual']],
    ['Zwarte rok', 'rokken', 'zwart', 1, ['net', 'feest']],
    ['Korte broek', 'shorts', 'beige', 1, ['casual', 'sport']],
    ['Joggingbroek', 'joggingbroeken', 'grijs', 2, ['sport']],
    ['Rode zomerjurk', 'jurken', 'rood', 1, ['casual', 'feest']],
    ['Navy wollen jas', 'jassen', 'navy', 3, ['net', 'casual']],
    ['Spijkerjasje', 'jacks', 'denim', 2, ['casual']],
    ['Witte sneakers', 'sneakers', 'wit', 2, ['casual', 'sport']],
    ['Bruine laarzen', 'laarzen', 'bruin', 3, ['casual', 'net']],
    ['Zwarte loafers', 'nette-schoenen', 'zwart', 2, ['net', 'feest']],
    ['Gele sjaal', 'sjaals', 'geel', 3, ['casual']],
    ['Bruine riem', 'riemen', 'bruin', 2, ['net', 'casual']],
  ];
  const fits = { 'Grijze hoodie': 'wijd', 'Crème vest': 'wijd', 'Joggingbroek': 'wijd', 'Beige pantalon': 'wijd', 'Zwarte spijkerbroek': 'slim', 'Zwarte coltrui': 'slim', 'Wit T-shirt': 'wijd' };
  const colorMix = { 'Gestreept shirt': [{ id: 'navy', pct: 55 }, { id: 'wit', pct: 45 }] };
  // Geen jurk of rok in de voorbeeldkast van een man.
  const hide = HIDDEN_FOR[state.profile.gender] || [];
  const list = demo.filter(([, categoryId]) => !hide.includes(categoryId));
  for (const [name, categoryId, color, warmth, styles] of list) {
    await saveItem({
      id: newId(), name, photo: null, categoryId, color, colors: colorMix[name] || [{ id: color, pct: 100 }],
      fit: fits[name] || 'normaal', warmth, styles, inWash: false, worn: [], createdAt: Date.now(),
    });
  }
  toast(`${list.length} voorbeeldstukken toegevoegd`);
  showTab('kast');
}

// Bij het openen (na de eerste keer), één scherm tegelijk:
// 1. Ingesteld voordat het moodboard bestond? Eén keer om je stijl vragen.
// 2. Binnen 2 uur terug? Je laatste looks.
// 3. Hooguit één keer per week de kastcheck.
// 4. "Wat wordt de look vandaag?"
async function startupFlow() {
  if (!state.profile.styleWeights && !state.profile.moodAsked) {
    state.profile.moodAsked = true;
    await saveProfile();
    await openMoodboardSheet();
    await new Promise(r => $('#mood-sheet').addEventListener('close', r, { once: true }));
  }
  if (await restoreLastLooks()) { showTab('outfit'); return; }
  if (maybeKastcheck(() => maybeOpenPlanner())) return;
  maybeOpenPlanner();
}

// ---------- Start ----------
// Pas starten als alle scripts geladen zijn (de opslag kan eerder klaar zijn dan de rest).
document.addEventListener('DOMContentLoaded', async () => {
  state.categories = (await DB.getMeta('categories')) || DEFAULT_CATEGORIES.map(c => ({ ...c }));
  state.profile = { ...state.profile, ...((await DB.getMeta('profile')) || {}) };
  const items = await DB.allItems();
  for (const it of items) {
    const migrated = migrateItem(it);
    if (migrated) await DB.putItem(migrated);
    state.items.push(migrated || it);
  }
  if (!(await DB.persistent)) $('#storage-warning').classList.remove('hidden');
  // Vraag de browser om de kast niet zomaar op te ruimen bij weinig ruimte.
  navigator.storage?.persist?.().catch(() => {});
  plan.transport = state.profile.transport;
  await loadSuggested();
  await loadFavoriteKeys();
  updateFavButton();
  // Stukken die nog niet zijn uitgeknipt (bijvoorbeeld na het terugzetten van een back-up) alsnog doen.
  if (state.profile.cutoutReady) Cutout.enqueueAll(false);
  showTab('kast');
  // Eerste keer: welkomstscherm. Daarna opent de app met "Wat wordt de look vandaag?".
  if (!state.profile.onboarded) openWelcome();
  else startupFlow();
});
