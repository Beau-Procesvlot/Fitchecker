// Personage: je eigen getekende man of vrouw, aangekleed in de kleuren van jouw kleding.
// Per soort kledingstuk is er een witte laag (img/personage/<man|vrouw>/<laag>.webp). De app kleurt die laag
// in de kleur van jouw stuk en legt de lagen op het personage: schoenen, broek of jurk, shirt, trui of vest.

// Welke laag bij welke categorie hoort. Eigen categorieën vallen terug op hun plek op het lichaam.
const PERSONAGE_CAT = {
  tshirts: 'tshirt', tops: 'top', blouses: 'blouse', overhemden: 'blouse', polos: 'polo',
  truien: 'trui', sweaters: 'trui', hoodies: 'hoodie', vesten: 'vest',
  spijkerbroeken: 'spijkerbroek', broeken: 'broek', joggingbroeken: 'trainingsbroek', shorts: 'shorts', rokken: 'rok',
  jurken: 'jurk', jumpsuits: 'jumpsuit',
  sneakers: 'sneakers', laarzen: 'laarzen', 'nette-schoenen': 'nette-schoenen',
};
const PERSONAGE_SLOT = { base: 'tshirt', mid: 'trui', bottom: 'broek', full: 'jurk', shoes: 'sneakers' };
// Volgorde van tekenen: onderop eerst.
const PERSONAGE_ORDER = ['shoes', 'bottom', 'full', 'base', 'mid'];

// Man of vrouw volgt "Kast voor"; bij "alles laten zien" kies je het zelf bij Instellingen.
const personageGender = () => ['man', 'vrouw'].includes(state.profile.gender) ? state.profile.gender : (state.profile.personage || 'vrouw');

const personageData = {};   // per man/vrouw: { manifest, base, layers: { naam: Image } }
const personageCache = new Map(); // klaar getekende looks

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });

function personageSet(gender) {
  if (!personageData[gender]) {
    personageData[gender] = (async () => {
      const dir = `img/personage/${gender}/`;
      const manifest = await (await fetch(dir + 'lagen.json')).json();
      const base = await loadImg(dir + 'basis.webp'); // al uitgesneden tot het weergavevak, zonder achtergrond
      return { manifest, base, dir, layers: {} };
    })();
    personageData[gender].catch(() => { delete personageData[gender]; }); // later opnieuw proberen
  }
  return personageData[gender];
}

function layerNameFor(it, manifest) {
  const byCat = PERSONAGE_CAT[it.categoryId];
  if (byCat && manifest.layers[byCat]) return byCat;
  // "top" bestaat alleen bij de vrouw; bij de man een T-shirt. Verder: terug naar de plek op het lichaam.
  const bySlot = PERSONAGE_SLOT[slotOf(it)];
  return bySlot && manifest.layers[bySlot] ? bySlot : null;
}

async function layerImg(set, name) {
  if (!set.layers[name]) set.layers[name] = loadImg(set.dir + name + '.webp');
  return set.layers[name];
}

// Kleur van het stuk: de hoofdkleur (bij een print de eerste echte kleur).
const personageColor = it => colorById(it.color === 'print' ? (it.colors?.find(c => c.id !== 'print')?.id || 'grijs') : it.color).hex;

async function composePersonage(parts) {
  const gender = personageGender();
  const set = await personageSet(gender);
  const { manifest } = set;
  const list = PERSONAGE_ORDER
    .filter(slot => parts[slot])
    .map(slot => ({ slot, name: layerNameFor(parts[slot], manifest), color: personageColor(parts[slot]) }))
    .filter(l => l.name);
  const key = gender + '|' + list.map(l => l.name + l.color).join(',');
  if (personageCache.has(key)) return personageCache.get(key);

  const v = manifest.view;
  const c = document.createElement('canvas');
  c.width = v.w; c.height = v.h;
  const g = c.getContext('2d');
  g.drawImage(set.base, 0, 0);
  // Een broek, rok of jurk die smaller is dan de grijze short van de basis: eerst die short weggummen,
  // anders piept hij er bij de heupen onder uit.
  if (manifest.layers.shorts && list.some(l => ['bottom', 'full'].includes(l.slot) && l.name !== 'shorts')) {
    const pos = manifest.layers.shorts;
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(await layerImg(set, 'shorts'), pos.x - v.x, pos.y - v.y);
    g.globalCompositeOperation = 'source-over';
  }
  for (const l of list) {
    const img = await layerImg(set, l.name);
    const pos = manifest.layers[l.name];
    // Huid die bij dit stuk hoort (blote schouders bij een top, benen bij een rok): eerst, niet ingekleurd.
    if (pos.skin) g.drawImage(await layerImg(set, l.name + '-huid'), pos.skin.x - v.x, pos.skin.y - v.y);
    const t = document.createElement('canvas');
    t.width = pos.w; t.height = pos.h;
    const tg = t.getContext('2d');
    // Witte stof × kleur = gekleurde stof met de plooien en schaduw van het origineel.
    tg.drawImage(img, 0, 0);
    tg.globalCompositeOperation = 'multiply';
    tg.fillStyle = l.color;
    tg.fillRect(0, 0, pos.w, pos.h);
    // Bij donkere kleuren de plooien een beetje terughalen, anders wordt het één egaal vlak.
    tg.globalCompositeOperation = 'soft-light';
    tg.globalAlpha = .35;
    tg.drawImage(img, 0, 0);
    tg.globalAlpha = 1;
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(img, 0, 0);
    g.drawImage(t, pos.x - v.x, pos.y - v.y);
  }
  if (personageCache.size > 40) personageCache.delete(personageCache.keys().next().value);
  personageCache.set(key, c);
  return c;
}

// HTML voor in de look: een leeg doek dat daarna getekend wordt.
const personageHTML = i => `<canvas class="personage" data-look="${i}" aria-label="Je personage in deze look"></canvas>`;

// Na het tekenen van de looks: elk personage-doek vullen. Lukt het niet (bijvoorbeeld offline
// en nog nooit geladen), dan komt het oude poppetje ervoor in de plaats.
function drawPersonages() {
  document.querySelectorAll('canvas.personage').forEach(async el => {
    const look = looks[+el.dataset.look];
    if (!look) return;
    try {
      const src = await composePersonage(look.parts);
      el.width = src.width; el.height = src.height;
      el.getContext('2d').drawImage(src, 0, 0);
      el.classList.add('ready');
    } catch {
      el.outerHTML = figureSVG(look.parts);
    }
  });
}
