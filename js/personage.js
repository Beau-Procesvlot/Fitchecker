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
  // Het grijze shirt van de basis kan langer zijn dan een trui of top. Wat ervan overblijft tussen
  // de zoom en de broek krijgt de kleur van de broek, rok of jurk (zoals een tailleband).
  const lower = list.find(l => l.slot === 'full') || list.find(l => l.slot === 'bottom');
  if (lower) {
    const tee = await baseTee(set);
    if (tee) {
      // alleen zo breed als de broek (of jurk) bovenaan is, anders lijkt het een rokje over de broek
      const p = manifest.layers[lower.name];
      const top = await layerTops(set, lower.name);
      g.save();
      g.beginPath();
      g.rect(top.left - v.x, 0, top.right - top.left + 1, v.h);
      g.clip();
      g.drawImage(colorize(tee, tee, lower.color), 0, 0);
      g.restore();
      // wat van het basisshirt buiten de broek valt, weg (daar is achtergrond)
      g.save();
      g.beginPath();
      g.rect(0, p.y - v.y - 40, top.left - v.x, 140);
      g.rect(top.right - v.x + 1, p.y - v.y - 40, v.w, 140);
      g.clip();
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(tee, 0, 0);
      g.restore();
    }
  }
  const colored = {}; // per plek het ingekleurde stuk, voor het randje shirt onder de trui
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
    colored[l.slot] = { canvas: t, name: l.name, pos };
    // Shirt onder een trui, hoodie of vest: een randje laten uitpiepen onder de zoom.
    if (l.slot === 'mid' && colored.base) await drawHemPeek(g, set, v, colored.base, colored.mid);
  }
  if (personageCache.size > 40) personageCache.delete(personageCache.keys().next().value);
  personageCache.set(key, c);
  return c;
}

// Een witte (grijs-witte) laag inkleuren: stof × kleur, met de plooien behouden.
function colorize(img, shape, color) {
  const t = document.createElement('canvas');
  t.width = img.width; t.height = img.height;
  const tg = t.getContext('2d');
  tg.drawImage(img, 0, 0);
  tg.globalCompositeOperation = 'multiply';
  tg.fillStyle = color;
  tg.fillRect(0, 0, t.width, t.height);
  tg.globalCompositeOperation = 'soft-light';
  tg.globalAlpha = .35;
  tg.drawImage(img, 0, 0);
  tg.globalAlpha = 1;
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(shape, 0, 0);
  return t;
}

// Het grijze T-shirt van de basis als losse laag (wit gemaakt), berekend uit de basis zelf:
// grijze stof van het personage, behalve de short. Eén keer per personage.
const teeCache = {};
function baseTee(set) {
  if (!(set.dir in teeCache)) {
    teeCache[set.dir] = (async () => {
      const { manifest } = set; const v = manifest.view;
      const c = document.createElement('canvas'); c.width = v.w; c.height = v.h;
      const g = c.getContext('2d'); g.drawImage(set.base, 0, 0);
      const img = g.getImageData(0, 0, v.w, v.h); const d = img.data;
      // de short eruit
      const s = manifest.layers.shorts; let shorts = null;
      if (s) { const sc = document.createElement('canvas'); sc.width = v.w; sc.height = v.h; const sg = sc.getContext('2d'); sg.drawImage(await layerImg(set, 'shorts'), s.x - v.x, s.y - v.y); shorts = sg.getImageData(0, 0, v.w, v.h).data; }
      const lums = [];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i+1], b = d[i+2], bright = (r + gg + b) / 3;
        const grey = d[i+3] > 200 && Math.abs(r - b) < 16 && Math.abs(r - gg) < 14 && bright > 80 && bright < 218; // geen witte sokken
        const y = (i / 4 / v.w) | 0;
        if (!grey || (shorts && shorts[i+3] > 60) || y > v.h * .7) { d[i+3] = 0; continue; }
        const lum = r * .3 + gg * .59 + b * .11; lums.push(lum);
        d[i] = d[i+1] = d[i+2] = lum;
      }
      if (lums.length < 500) return null;
      lums.sort((p, q) => p - q); const ref = lums[Math.floor(lums.length * .96)];
      for (let i = 0; i < d.length; i += 4) if (d[i+3]) d[i] = d[i+1] = d[i+2] = Math.min(255, d[i] / ref * 255);
      g.putImageData(img, 0, 0);
      return c;
    })();
  }
  return teeCache[set.dir];
}

// Hoe breed een broek, rok of jurk bovenaan is (linker- en rechterrand van de bovenste 30 rijen).
const topCache = {};
async function layerTops(set, name) {
  const key = set.dir + name;
  if (!topCache[key]) {
    const img = await layerImg(set, name);
    const pos = set.manifest.layers[name];
    const c = document.createElement('canvas'); c.width = pos.w; c.height = pos.h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const rows = Math.min(30, pos.h);
    const a = g.getImageData(0, 0, pos.w, rows).data;
    let left = pos.w, right = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < pos.w; x++) if (a[(y * pos.w + x) * 4 + 3] > 128) { if (x < left) left = x; if (x > right) right = x; }
    topCache[key] = { left: pos.x + left, right: pos.x + right };
  }
  return topCache[key];
}

// Per kolom de onderkant van een laag (in beeldcoördinaten), één keer berekend per laag.
const hemCache = {};
async function layerBottoms(set, name) {
  const key = set.dir + name;
  if (!hemCache[key]) {
    const img = await layerImg(set, name);
    const pos = set.manifest.layers[name];
    const c = document.createElement('canvas'); c.width = pos.w; c.height = pos.h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const a = g.getImageData(0, 0, pos.w, pos.h).data;
    const bottom = new Int32Array(pos.w).fill(-1);
    for (let x = 0; x < pos.w; x++) for (let y = pos.h - 1; y >= 0; y--) if (a[(y * pos.w + x) * 4 + 3] > 128) { bottom[x] = pos.y + y; break; }
    hemCache[key] = { x: pos.x, bottom };
  }
  return hemCache[key];
}

// Het shirt een stukje omlaag schuiven en alleen het deel net onder de zoom van de trui tonen.
// Alleen bij het lijf (niet bij de mouwen), zodat het eruitziet als een shirt dat eronder uitkomt.
const PEEK = 12; // zoveel pixels (op 1024) steekt het shirt uit
async function drawHemPeek(g, set, v, base, mid) {
  const b = await layerBottoms(set, base.name), m = await layerBottoms(set, mid.name);
  // De zoom van het shirt: niet het allerlaagste puntje (losse pixels), maar waar het lijf ophoudt.
  const sorted = [...b.bottom].filter(y => y >= 0).sort((p, q) => p - q);
  const shirtHem = sorted[Math.floor(sorted.length * .8)];
  const midHems = [...m.bottom].filter(y => y >= 0).sort((p, q) => p - q);
  const midHem = midHems[Math.floor(midHems.length * .5)];
  const cols = [];
  for (let i = 0; i < b.bottom.length; i++) {
    const x = b.x + i, mi = x - m.x;
    // lijf: kolommen waar het shirt tot ongeveer de zoom komt (de mouwen houden veel hoger op)
    if (Math.abs(b.bottom[i] - shirtHem) > 18 || mi < 0 || mi >= m.bottom.length) continue;
    // en waar de trui ook echt een zoom heeft rond de hoogte van het lijf (geen mouw of losse pixel)
    if (Math.abs(m.bottom[mi] - midHem) > 30) continue;
    cols.push([x, m.bottom[mi], b.bottom[i]]);
  }
  if (cols.length < 20) return;
  const shift = Math.max(...cols.map(([, mb, bb]) => mb - bb)) + PEEK;
  if (shift <= PEEK - 4) return; // het shirt is al langer dan de trui: het steekt vanzelf al uit
  g.save();
  g.beginPath();
  // van net onder de zoom van de trui tot de zoom van het (verschoven) shirt, hooguit een smal randje
  for (const [x, mb, bb] of cols) g.rect(x - v.x, mb - v.y - 1, 1, Math.min(bb + shift - mb + 1, PEEK + 6));
  g.clip();
  g.drawImage(base.canvas, base.pos.x - v.x, base.pos.y - v.y + shift);
  g.restore();
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
