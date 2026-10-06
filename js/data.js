// Vaste gegevens van de app: plekken op het lichaam, standaardcategorieën, kleuren, stijlen.

// Elke categorie hoort bij precies één plek. De outfit-generator werkt met plekken,
// zodat eigen categorieën ("mijn festivalshirts") vanzelf meedoen.
const SLOTS = [
  { id: 'base',   label: 'Bovenlijf – basis',      hint: 'T-shirt, top, blouse' },
  { id: 'mid',    label: 'Bovenlijf – eroverheen', hint: 'trui, hoodie, vest' },
  { id: 'bottom', label: 'Onderlijf',              hint: 'broek, rok, short' },
  { id: 'full',   label: 'Hele lichaam',           hint: 'jurk, jumpsuit' },
  { id: 'shoes',  label: 'Schoenen',               hint: '' },
  { id: 'outer',  label: 'Jas (optioneel)',        hint: 'jas, jack, blazer' },
  { id: 'acc',    label: 'Accessoires',            hint: 'sjaal, muts, tas' },
];

const DEFAULT_CATEGORIES = [
  ['tshirts', 'T-shirts', 'base'],
  ['tops', 'Tops', 'base'],
  ['blouses', 'Blouses', 'base'],
  ['overhemden', 'Overhemden', 'base'],
  ['polos', "Polo's", 'base'],
  ['truien', 'Truien', 'mid'],
  ['hoodies', 'Hoodies', 'mid'],
  ['vesten', 'Vesten', 'mid'],
  ['sweaters', 'Sweaters', 'mid'],
  ['spijkerbroeken', 'Spijkerbroeken', 'bottom'],
  ['broeken', 'Broeken', 'bottom'],
  ['rokken', 'Rokken', 'bottom'],
  ['shorts', 'Shorts', 'bottom'],
  ['joggingbroeken', 'Joggingbroeken', 'bottom'],
  ['jurken', 'Jurken', 'full'],
  ['jumpsuits', 'Jumpsuits', 'full'],
  ['sneakers', 'Sneakers', 'shoes'],
  ['laarzen', 'Laarzen', 'shoes'],
  ['nette-schoenen', 'Nette schoenen', 'shoes'],
  ['sandalen', 'Sandalen', 'shoes'],
  ['jassen', 'Jassen', 'outer'],
  ['jacks', 'Jacks', 'outer'],
  ['blazers', 'Blazers', 'outer'],
  ['sjaals', 'Sjaals', 'acc'],
  ['mutsen', 'Mutsen', 'acc'],
  ['petten', 'Petten', 'acc'],
  ['tassen', 'Tassen', 'acc'],
  ['riemen', 'Riemen', 'acc'],
  ['sieraden', 'Sieraden', 'acc'],
].map(([id, name, slot], order) => ({ id, name, slot, order }));

// Voor wie is de kast? Bij "man" verdwijnen deze categorieën uit de keuzes
// (behalve als er al iets in zit).
const GENDERS = [
  { id: 'man',   label: 'Man' },
  { id: 'vrouw', label: 'Vrouw' },
  { id: 'alles', label: 'Alles laten zien' },
];
const HIDDEN_FOR = {
  man: ['jurken', 'jumpsuits', 'rokken', 'blouses'],
  vrouw: [],
  alles: [],
};

// neutral: past bij alles. hue: kleurtoon in graden, voor kleurharmonie.
// tone: warme aardetinten en koele felle kleuren gaan minder goed samen.
const COLORS = [
  { id: 'zwart',      label: 'Zwart',       hex: '#1b1b1b', neutral: true },
  { id: 'wit',        label: 'Wit',         hex: '#f7f6f2', neutral: true },
  { id: 'creme',      label: 'Crème',       hex: '#efe6d2', neutral: true, tone: 'warm' },
  { id: 'grijs',      label: 'Grijs',       hex: '#8d8d8d', neutral: true },
  { id: 'beige',      label: 'Beige',       hex: '#d2b98f', neutral: true, tone: 'warm' },
  { id: 'bruin',      label: 'Bruin',       hex: '#6e4a2c', neutral: true, tone: 'warm' },
  { id: 'navy',       label: 'Navy',        hex: '#1f2b47', neutral: true },
  { id: 'denim',      label: 'Denim',       hex: '#4b6f9e', neutral: true },
  { id: 'lichtblauw', label: 'Lichtblauw',  hex: '#a9c8e8', hue: 205, tone: 'cool' },
  { id: 'blauw',      label: 'Blauw',       hex: '#2e6fd8', hue: 220, tone: 'cool' },
  { id: 'groen',      label: 'Groen',       hex: '#3f7d4e', hue: 135 },
  { id: 'olijf',      label: 'Olijf',       hex: '#6f7a3a', hue: 70 },
  { id: 'geel',       label: 'Geel',        hex: '#f1c40f', hue: 50 },
  { id: 'oranje',     label: 'Oranje',      hex: '#e67e22', hue: 28 },
  { id: 'rood',       label: 'Rood',        hex: '#c0392b', hue: 5 },
  { id: 'bordeaux',   label: 'Bordeaux',    hex: '#6d1f2c', hue: 350 },
  { id: 'roze',       label: 'Roze',        hex: '#e9a1b5', hue: 340 },
  { id: 'paars',      label: 'Paars',       hex: '#7d4aa0', hue: 280, tone: 'cool' },
  { id: 'print',      label: 'Print/streep', hex: '#999999', print: true,
    css: 'repeating-linear-gradient(45deg,#2b2b2b 0 5px,#e8e3da 5px 10px)' },
];

const WARMTH = [
  { id: 1, label: 'Dun' },
  { id: 2, label: 'Normaal' },
  { id: 3, label: 'Dik' },
];

const STYLES = [
  { id: 'casual', label: 'Casual' },
  { id: 'net',    label: 'Netjes' },
  { id: 'sport',  label: 'Sportief' },
  { id: 'feest',  label: 'Feest' },
];

const WEATHER = [
  { id: 'warm', label: 'Warm' },
  { id: 'mild', label: 'Mild' },
  { id: 'koud', label: 'Koud' },
];

// Pasvorm, voor de silhouet-regel: wijd met slank, niet wijd op wijd.
const FITS = [
  { id: 'slim',    label: 'Slim' },
  { id: 'normaal', label: 'Normaal' },
  { id: 'wijd',    label: 'Oversized / wijd' },
];
const FIT_SLOTS = ['base', 'mid', 'bottom', 'full', 'outer'];

// Netheid per categorie (0 sportief – 3 formeel). Stukken in een outfit horen
// ongeveer hetzelfde niveau te hebben. Eigen categorieën vallen terug op de stijl van het stuk.
const CATEGORY_FORMALITY = {
  joggingbroeken: 0, hoodies: 0, sneakers: 1, shorts: 0, petten: 0,
  tshirts: 1, tops: 1, sweaters: 1, spijkerbroeken: 1, sandalen: 1,
  truien: 1.5, vesten: 1.5, polos: 1.5, laarzen: 1.5, rokken: 1.5, jurken: 1.5, jumpsuits: 1.5, jacks: 1.5,
  blouses: 2, overhemden: 2, broeken: 2, jassen: 2,
  blazers: 3, 'nette-schoenen': 3,
};

// Situaties: eerst kies je het soort dag, dan wat je gaat doen.
// formality: 0 sportief, 1 casual, 2 netjes casual, 3 netjes.
const DAY_TYPES = [
  { id: 'normaal',   label: 'Normale dag',   hint: 'School, werk, sporten' },
  { id: 'bijzonder', label: 'Bijzondere dag', hint: 'Date, feestje, uitgaan' },
  { id: 'thuis',     label: 'Thuis chillen', hint: 'Weer maakt niet uit' },
];
const SITUATIONS = [
  { id: 'school',      day: 'normaal',   label: 'School / studie',       from: '07:30', to: '16:00', formality: 1 },
  { id: 'werk',        day: 'normaal',   label: 'Werk / bijbaan',        from: '09:00', to: '17:00', formality: 1, askFormality: true },
  { id: 'sport',       day: 'normaal',   label: 'Sporten',               from: '18:00', to: '19:30', formality: 0, indoor: true },
  { id: 'stad',        day: 'normaal',   label: 'Stad / boodschappen',   from: '12:00', to: '17:00', formality: 1 },
  { id: 'date',        day: 'bijzonder', label: 'Date',                  from: '19:00', to: '23:00', formality: 2, askFormality: true },
  { id: 'verjaardag',  day: 'bijzonder', label: 'Verjaardag / feestje',  from: '20:00', to: '00:00', formality: 2, party: true },
  { id: 'stap',        day: 'bijzonder', label: 'Avond op stap',         from: '22:00', to: '03:00', formality: 2, party: true },
  { id: 'etentje',     day: 'bijzonder', label: 'Etentje',               from: '19:00', to: '23:00', formality: 2, askFormality: true },
  { id: 'festival',    day: 'bijzonder', label: 'Festival',              from: '12:00', to: '23:00', formality: 1, party: true },
  { id: 'formeel',     day: 'bijzonder', label: 'Bruiloft / formeel',    from: '14:00', to: '00:00', formality: 3, party: true },
  { id: 'sollicitatie', day: 'bijzonder', label: 'Sollicitatie / presentatie', from: '09:00', to: '12:00', formality: 3 },
  { id: 'thuis',       day: 'thuis',     label: 'Thuis chillen',         from: '09:00', to: '22:00', formality: 0, indoor: true },
];
const FORMALITY_OPTIONS = [
  { id: 1, label: 'Casual' },
  { id: 2, label: 'Netjes casual' },
  { id: 3, label: 'Netjes' },
];
const TRANSPORT = [
  { id: 'fiets', label: 'Fiets' },
  { id: 'lopen', label: 'Lopen' },
  { id: 'ov',    label: 'OV' },
  { id: 'auto',  label: 'Auto' },
];

// Hoe voel je je? Elke stemming werkt als een paar zoekwoorden (zie KEYWORDS).
const MOODS = [
  { id: 'relaxed',  label: 'Relaxed',        words: 'comfy' },
  { id: 'stoer',    label: 'Stoer',          words: 'stoer' },
  { id: 'zeker',    label: 'Zelfverzekerd',  words: 'strak allblack' },
  { id: 'vrolijk',  label: 'Vrolijk',        words: 'kleurrijk' },
  { id: 'lowkey',   label: 'Lowkey',         words: 'rustig' },
  { id: 'feest',    label: 'Feestelijk',     words: 'feest' },
  { id: 'geen',     label: 'Maakt niet uit', words: '' },
];

// Zoekwoorden: wat je typt bij "Nog iets speciaals?". Elk woord geeft bepaalde stukken extra punten.
const KEYWORDS = {
  stoer:     { colors: ['zwart', 'denim', 'olijf', 'grijs'], cats: ['laarzen', 'jacks', 'spijkerbroeken'], label: 'stoer' },
  comfy:     { cats: ['hoodies', 'joggingbroeken', 'sneakers', 'sweaters', 'vesten'], fits: ['wijd'], label: 'comfy' },
  comfortabel: { alias: 'comfy' },
  relaxed:   { alias: 'comfy' },
  netjes:    { formality: 3, label: 'netjes' },
  chic:      { alias: 'netjes' },
  sjiek:     { alias: 'netjes' },
  kleurrijk: { accents: true, label: 'kleurrijk' },
  vrolijk:   { alias: 'kleurrijk' },
  rustig:    { neutral: true, label: 'rustig' },
  clean:     { alias: 'rustig' },
  minimal:   { alias: 'rustig' },
  basic:     { alias: 'rustig' },
  allblack:  { colors: ['zwart'], label: 'all black' },
  sportief:  { formality: 0, label: 'sportief' },
  warm:      { warmer: 2, label: 'extra warm' },
  luchtig:   { warmer: -2, label: 'luchtig' },
  oversized: { fits: ['wijd'], label: 'oversized' },
  baggy:     { alias: 'oversized' },
  strak:     { fits: ['slim'], label: 'strak' },
  feest:     { styles: ['feest'], label: 'feestelijk' },
  trendy:    { trendy: true, label: 'trendy' },
  trend:     { alias: 'trendy' },
  trends:    { alias: 'trendy' },
  hip:       { alias: 'trendy' },
  feestelijk: { alias: 'feest' },
};

const colorById = id => COLORS.find(c => c.id === id) || COLORS[0];
const colorCss = c => c.css || c.hex;
const slotById = id => SLOTS.find(s => s.id === id);
