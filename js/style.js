// Stijl leren: je stijlprofiel (uit het moodboard), je duimpjes, en wat de app al heeft voorgesteld.
// Alles wordt vertaald naar wat de app al van je kleding weet: kleur, pasvorm, categorie en netheid.
// Je hoeft je kleding dus niet opnieuw te taggen.

const STYLE_PROFILES = [
  { id: 'clean',     label: 'Clean / minimal',      hint: 'Neutraal, strak, weinig print', dots: ['#1b1b1b', '#f7f6f2', '#8d8d8d'] },
  { id: 'street',    label: 'Streetwear',           hint: 'Oversized, hoodies, sneakers',  dots: ['#8d8d8d', '#1b1b1b', '#4b6f9e'] },
  { id: 'oldmoney',  label: 'Old money / klassiek', hint: 'Beige, navy, netjes',           dots: ['#d2b98f', '#1f2b47', '#efe6d2'] },
  { id: 'sporty',    label: 'Sporty',               hint: 'Sportief en comfy',             dots: ['#f7f6f2', '#8d8d8d', '#2e6fd8'] },
  { id: 'vintage',   label: 'Vintage',              hint: 'Bruin, olijf, bordeaux, wijd',  dots: ['#6e4a2c', '#6f7a3a', '#6d1f2c'] },
  { id: 'y2k',       label: 'Y2K',                  hint: 'Baggy jeans, lichte kleuren',   dots: ['#e9a1b5', '#a9c8e8', '#4b6f9e'] },
  { id: 'edgy',      label: 'Edgy / stoer',         hint: 'Zwart, denim, laarzen',         dots: ['#1b1b1b', '#4b6f9e', '#8d8d8d'] },
  { id: 'kleurrijk', label: 'Kleurrijk',            hint: 'Opvallende kleuren',            dots: ['#c0392b', '#f1c40f', '#3f7d4e'] },
];

// Hoe goed past een look bij een stijl? 0 (niet) … 1 (helemaal).
function styleMatch(styleId, parts) {
  const items = Object.values(parts);
  const main = items.filter(i => slotOf(i) !== 'acc');
  const colors = [...new Set(items.flatMap(itemColors))];
  const accents = colors.map(colorById).filter(c => !c.neutral && !c.print).length;
  const prints = items.filter(i => i.color === 'print').length;
  const share = list => (main.length ? main.filter(i => list.includes(i.categoryId)).length / main.length : 0);
  const colorShare = list => (colors.length ? colors.filter(c => list.includes(c)).length / colors.length : 0);
  const anyWide = main.some(i => i.fit === 'wijd');
  const top = parts.mid || parts.base, bottom = parts.bottom;
  const avgFormality = main.reduce((s, i) => s + itemFormality(i), 0) / Math.max(1, main.length);
  let m = 0;
  switch (styleId) {
    case 'clean': m = (accents === 0 ? 0.6 : accents === 1 ? 0.3 : 0) + (prints ? 0 : 0.2) + (anyWide ? 0 : 0.2); break;
    case 'street': m = share(['hoodies', 'sneakers', 'joggingbroeken', 'petten', 'spijkerbroeken', 'sweaters']) * 0.6 + (anyWide ? 0.4 : 0); break;
    case 'oldmoney': m = colorShare(['beige', 'navy', 'creme', 'bruin', 'wit']) * 0.5 + (share(['blazers', 'overhemden', 'polos', 'broeken', 'nette-schoenen', 'truien']) > 0 ? 0.3 : 0) + (avgFormality >= 1.5 ? 0.2 : 0); break;
    case 'sporty': m = main.length ? main.filter(i => i.styles.includes('sport')).length / main.length : 0; break;
    case 'vintage': m = (colors.some(c => ['bruin', 'olijf', 'bordeaux', 'creme', 'geel'].includes(c)) ? 0.5 : 0) + (bottom?.fit === 'wijd' ? 0.3 : 0) + (colors.includes('denim') ? 0.2 : 0); break;
    case 'y2k': m = (colors.some(c => ['roze', 'lichtblauw'].includes(c)) ? 0.5 : 0) + (bottom?.fit === 'wijd' && top?.fit === 'slim' ? 0.5 : bottom?.fit === 'wijd' ? 0.25 : 0); break;
    case 'edgy': m = colorShare(['zwart', 'denim', 'grijs']) * 0.6 + (share(['laarzen', 'jacks']) > 0 ? 0.4 : 0); break;
    case 'kleurrijk': m = accents >= 2 ? 1 : accents === 1 ? 0.5 : 0; break;
  }
  return Math.max(0, Math.min(1, m));
}

// Je stijlprofiel geeft punten aan looks die erbij passen.
function profileScore(parts) {
  const w = state.profile.styleWeights;
  if (!w) return 0;
  return Object.entries(w).reduce((s, [id, weight]) => s + weight * styleMatch(id, parts), 0) * 2.5;
}

// De stijl die het best bij een look past (voor de uitleg), alleen als die ook in je profiel zit.
function topStyleFor(parts) {
  const w = state.profile.styleWeights;
  if (!w) return null;
  const best = Object.entries(w).map(([id, weight]) => ({ id, s: weight * styleMatch(id, parts) })).sort((a, b) => b.s - a.s)[0];
  return best && best.s > 0.12 ? STYLE_PROFILES.find(p => p.id === best.id) : null;
}

function normalizeWeights(w) {
  const total = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.max(0, v) / total]));
}

// ---------- Duimpjes ----------
const feedback = () => (state.profile.feedback ||= { pairs: {}, formality: 0, colorSigs: {} });
const pairKey = (a, b) => [a.id, b.id].sort().join('|');
const colorSig = parts => [...new Set(Object.values(parts).flatMap(itemColors))].filter(c => !colorById(c).neutral).sort().join('+');

function mainPairs(parts) {
  const main = Object.entries(parts).filter(([s]) => s !== 'acc').map(([, it]) => it);
  const pairs = [];
  for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) pairs.push(pairKey(main[i], main[j]));
  return pairs;
}

// Wat je eerder vond van (combinaties in) deze look.
function feedbackScore(parts) {
  const f = feedback();
  let s = mainPairs(parts).reduce((a, k) => a + (f.pairs[k] || 0), 0);
  const sig = colorSig(parts);
  if (sig) s += f.colorSigs[sig] || 0;
  return Math.max(-6, Math.min(4, s));
}

function shiftStyles(parts, amount) {
  const w = state.profile.styleWeights;
  if (!w) return;
  for (const p of STYLE_PROFILES) w[p.id] = Math.max(0, (w[p.id] || 0) + amount * styleMatch(p.id, parts));
  state.profile.styleWeights = normalizeWeights(w);
}

async function rateLook(look, up) {
  const f = feedback();
  for (const k of mainPairs(look.parts)) f.pairs[k] = (f.pairs[k] || 0) + (up ? 0.6 : -0.4);
  shiftStyles(look.parts, up ? 0.05 : -0.03);
  look.rated = up ? 'up' : 'down';
  await saveProfile();
}

// "Waarom niet?" bij een duim omlaag (optioneel).
const DISLIKE_REASONS = [
  { id: 'kleuren', label: 'De kleuren' },
  { id: 'netjes', label: 'Te netjes' },
  { id: 'casual', label: 'Te casual' },
  { id: 'stijl', label: 'Niet mijn stijl' },
  { id: 'combi', label: 'Deze stukken samen niet' },
];
async function explainDislike(look, reason) {
  const f = feedback();
  if (reason === 'kleuren') { const sig = colorSig(look.parts); if (sig) f.colorSigs[sig] = (f.colorSigs[sig] || 0) - 1.5; }
  if (reason === 'netjes') f.formality = Math.max(-1.5, f.formality - 0.3);
  if (reason === 'casual') f.formality = Math.min(1.5, f.formality + 0.3);
  if (reason === 'stijl') shiftStyles(look.parts, -0.08);
  if (reason === 'combi') for (const k of mainPairs(look.parts)) f.pairs[k] = (f.pairs[k] || 0) - 1.5;
  look.reason = reason;
  await saveProfile();
}

// ---------- Wat is er al voorgesteld? ----------
// Zo schuiven vergeten stukken vanzelf naar voren, ook als je niet elke dag "Draag ik vandaag" aantikt.
let suggested = {};
async function loadSuggested() { suggested = (await DB.getMeta('suggested')) || {}; }
function markSuggested(lookList) {
  for (const l of lookList) for (const it of Object.values(l.parts)) suggested[it.id] = today();
  DB.setMeta('suggested', suggested);
}
function daysSinceSuggested(it) {
  const d = suggested[it.id];
  return d ? Math.min(60, (new Date(today()) - new Date(d)) / 86400000) : 60;
}
