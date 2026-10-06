// Foto's verkleinen en automatisch de kleuren van het kledingstuk herkennen.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Kon de foto niet lezen'));
    img.src = URL.createObjectURL(file);
  });
}

async function processPhoto(file) {
  const img = await loadImage(file);
  const max = 900; // groot genoeg voor later uitknippen, klein genoeg voor opslag
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.naturalWidth * scale);
  cv.height = Math.round(img.naturalHeight * scale);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  const colors = detectColors(cv);

  // Al uitgeknipt door de iPhone (doorzichtige achtergrond)? Dan is dat meteen de uitgeknipte versie,
  // en krijgt de kast een gewone foto op een lichte achtergrond.
  if (hasTransparency(cv)) {
    const cut = trimCutout(cv);
    const flat = document.createElement('canvas');
    flat.width = cv.width; flat.height = cv.height;
    const fctx = flat.getContext('2d');
    fctx.fillStyle = '#e9e3d6';
    fctx.fillRect(0, 0, flat.width, flat.height);
    fctx.drawImage(cv, 0, 0);
    return { photo: flat.toDataURL('image/jpeg', 0.85), ratio: cv.height / cv.width, cutout: cut?.dataUrl || null, ...colors };
  }
  return { photo: cv.toDataURL('image/jpeg', 0.82), ratio: cv.height / cv.width, cutout: null, ...colors };
}

// Heeft de foto een doorzichtige achtergrond (meer dan 3% doorzichtig)?
function hasTransparency(cv) {
  const s = document.createElement('canvas');
  s.width = s.height = 64;
  const ctx = s.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cv, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) clear++;
  return clear > 64 * 64 * 0.03;
}

// Kleuren van voor- en achterkant samen: de voorkant telt zwaarder (65/35).
function mergeFrontBack(front, back) {
  if (!back?.length) return front || [];
  const sum = {};
  for (const c of front || []) sum[c.id] = (sum[c.id] || 0) + c.pct * 0.65;
  for (const c of back) sum[c.id] = (sum[c.id] || 0) + c.pct * 0.35;
  const list = Object.entries(sum).map(([id, pct]) => ({ id, pct })).sort((a, b) => b.pct - a.pct).filter(c => c.pct >= 8).slice(0, 3);
  const total = list.reduce((s, c) => s + c.pct, 0) || 1;
  return list.map(c => ({ id: c.id, pct: Math.round((c.pct / total) * 100) }));
}

// Herkent tot drie kleuren en of het een print is.
// 1. Achtergrond: vanaf de randen van de foto alles wat erop lijkt "weglekken" (flood fill).
// 2. Wat overblijft is het kledingstuk; elke pixel stemt op de dichtstbijzijnde kleur.
// 3. Veel kleuren, of veel kleurwisselingen dicht op elkaar (strepen, ruit) = print.
function detectColors(cv) {
  const size = 96;
  const small = document.createElement('canvas');
  small.width = small.height = size;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cv, 0, 0, size, size);
  const px = ctx.getImageData(0, 0, size, size).data;
  const rgb = i => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];
  const n = size * size;

  // Uitgeknipt (doorzichtig)? Dan is de achtergrond simpelweg alles wat doorzichtig is.
  let transparent = 0;
  for (let i = 0; i < n; i++) if (px[i * 4 + 3] < 128) transparent++;
  if (transparent > n * 0.03) {
    const bgAlpha = new Uint8Array(n);
    for (let i = 0; i < n; i++) bgAlpha[i] = px[i * 4 + 3] < 128 ? 1 : 0;
    return countColors(px, size, bgAlpha);
  }

  // Gemiddelde randkleur = waarschijnlijk de achtergrond.
  const border = [];
  for (let k = 0; k < size; k++) border.push(k, (size - 1) * size + k, k * size, k * size + size - 1);
  const bgAvg = border.reduce((a, i) => a.map((v, c) => v + rgb(i)[c] / border.length), [0, 0, 0]);

  const bg = new Uint8Array(n);
  const queue = [];
  for (const i of border) if (colorDistance(rgb(i), bgAvg) < 90) { bg[i] = 1; queue.push(i); }
  while (queue.length) {
    const i = queue.pop();
    const x = i % size, y = (i / size) | 0, here = rgb(i);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      if (bg[j]) continue;
      const c = rgb(j);
      if (colorDistance(c, here) < 22 && colorDistance(c, bgAvg) < 110) { bg[j] = 1; queue.push(j); }
    }
  }

  // Lichte delen van het stuk die op de achtergrond lijken (witte strepen op een witte vloer)
  // lekken mee weg. Wat per kolom tussen twee stukken kledingstuk ingesloten zit, hoort erbij.
  for (let x = 0; x < size; x++) {
    let first = -1, last = -1;
    for (let y = 0; y < size; y++) if (!bg[y * size + x]) { if (first < 0) first = y; last = y; }
    for (let y = first + 1; y < last; y++) bg[y * size + x] = 0;
  }

  // Lijkt het stuk op de achtergrond (wit shirt op wit dekbed)? Dan wordt uitknippen lastig:
  // de app geeft dan meteen een tip om de foto anders te maken.
  const result = countColors(px, size, bg);
  const main = result.colors[0];
  if (main && colorDistance(hexToRgb(colorById(main.id).hex), bgAvg) < 75) result.lowContrast = true;
  return result;
}

// Telt de kleuren van alles wat geen achtergrond is (bg[i] = 1 is achtergrond).
function countColors(px, size, bg) {
  const n = size * size;
  const rgb = i => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];

  // Bleef er bijna niets over (stuk vult de hele foto, of lijkt op de achtergrond)? Neem dan het midden.
  let garment = 0;
  for (let i = 0; i < n; i++) if (!bg[i]) garment++;
  const useCenter = garment < n * 0.06;
  const inGarment = i => {
    if (!useCenter) return !bg[i];
    const x = i % size, y = (i / size) | 0;
    return x > size * 0.25 && x < size * 0.75 && y > size * 0.25 && y < size * 0.75;
  };

  const labels = new Array(n).fill(null);
  const votes = {};
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!inGarment(i)) continue;
    const id = nearestColor(rgb(i));
    labels[i] = id;
    // Het midden telt iets zwaarder: daar zit het stuk zelf, aan de randen vaak schaduw.
    const x = i % size - size / 2, y = ((i / size) | 0) - size / 2;
    const w = 1.5 - Math.min(1, Math.hypot(x, y) / (size / 2)) * 0.7;
    votes[id] = (votes[id] || 0) + w;
    total += w;
  }

  // Hoe vaak wisselt de kleur tussen buren? Hoog = patroon.
  let pairs = 0, changes = 0;
  for (let i = 0; i < n; i++) {
    if (!labels[i]) continue;
    for (const j of [i + 1, i + size]) {
      if (j >= n || !labels[j] || (j === i + 1 && j % size === 0)) continue;
      pairs++;
      if (labels[j] !== labels[i]) changes++;
    }
  }
  const busy = pairs ? changes / pairs : 0;

  const ranked = Object.entries(votes).map(([id, v]) => ({ id, pct: (v / total) * 100 })).sort((a, b) => b.pct - a.pct);
  const kept = ranked.filter(c => c.pct >= 12).slice(0, 3);
  const keptTotal = kept.reduce((s, c) => s + c.pct, 0) || 1;
  const colors = kept.map(c => ({ id: c.id, pct: Math.round((c.pct / keptTotal) * 100) }));

  // Effen (ook met schaduw) en kleurvlakken wisselen nauwelijks (< 0.02); ruit, strepen en
  // bloemen rond 0.15. Alleen tellen als er naast de hoofdkleur echt andere kleur in zit.
  const others = 100 - (ranked[0]?.pct || 0);
  // Tinten van één kleurfamilie (kreukels, schaduw, een vervaagde spijkerbroek) zijn geen print.
  const oneFamily = COLOR_FAMILIES.some(f => kept.every(c => f.includes(c.id)));
  const print = !oneFamily && ((kept.length >= 3 && kept[0].pct < 60) || (busy > 0.12 && others >= 15));
  // useCenter: het stuk viel bijna helemaal weg tegen de achtergrond, ook een teken van te weinig contrast.
  return { colors, color: print ? 'print' : (colors[0]?.id || 'zwart'), lowContrast: useCenter };
}

const COLOR_FAMILIES = [
  ['denim', 'blauw', 'lichtblauw', 'navy', 'grijs'],
  ['wit', 'creme', 'beige', 'grijs'],
  ['zwart', 'navy', 'grijs'],
  ['bruin', 'beige', 'olijf'],
  ['rood', 'bordeaux', 'roze'],
];

// "Redmean"-afstand: simpel en dichter bij hoe ogen kleur zien dan gewone RGB-afstand.
function colorDistance([r1, g1, b1], [r2, g2, b2]) {
  const rm = (r1 + r2) / 2, dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function nearestColor(rgb) {
  let best = null, bestD = Infinity;
  for (const c of COLORS) {
    if (c.print) continue;
    const d = colorDistance(rgb, hexToRgb(c.hex));
    if (d < bestD) { bestD = d; best = c.id; }
  }
  return best;
}
