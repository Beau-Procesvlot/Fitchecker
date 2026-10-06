// Trendbestand: wat er dit seizoen speelt, vertaald naar regels die de app kan herkennen
// aan wat hij van je kleding weet (kleur, pasvorm, categorie, warmte, netheid).
// Elk seizoen samen opzoeken en bijwerken. Buiten de geldigheidsperiode doen de trends niet mee.
//
// Bronnen herfst/winter 2026 (opgezocht 6 oktober 2026): Mango, Net-a-Porter, JOOR, ASOS,
// Esquire Middle East, Opumo, Harrods, H&M, Elle België, FashionUnited.

const TRENDS = {
  season: 'Herfst/winter 2026',
  validFrom: '2026-09-01',
  validTo: '2027-02-28',
  rules: [
    {
      id: 'bordeaux',
      label: 'Bordeaux',
      text: 'Bordeaux en oxblood zijn dé kleuren van dit seizoen.',
      test: c => c.has('bordeaux'),
    },
    {
      id: 'choco-ecru',
      label: 'Chocolade & ecru',
      text: 'Chocoladebruin met ecru of crème: het nieuwe neutrale palet.',
      test: (c, p) => c.has('bruin') && (c.has('creme') || c.has('beige') || c.has('wit')) && !p.coolAccent,
    },
    {
      id: 'diepe-kleur',
      label: 'Diepe kleuren',
      text: kleur => `${kleur} is een trendkleur dit seizoen: diep en warm.`,
      test: (c, p) => p.accent && ['olijf', 'groen', 'paars', 'geel', 'lichtblauw'].includes(p.accent),
    },
    {
      id: 'relaxed-verzorgd',
      label: 'Relaxed & verzorgd',
      text: 'Een ruime broek met een verzorgde bovenkant: relaxed, maar doordacht.',
      test: (c, p) => p.bottom?.fit === 'wijd' && p.top && p.top.fit !== 'wijd' && itemFormality(p.top) >= 1.5,
    },
    {
      id: 'sport-net',
      label: 'Sportief × netjes',
      text: 'Sportief gecombineerd met iets nets, zoals een hoodie op een pantalon: dé mix van dit seizoen.',
      test: (c, p) => p.formalities.some(f => f <= 0.5) && p.formalities.some(f => f >= 2),
    },
    {
      id: 'knit',
      label: 'Grof gebreid',
      text: 'Dikke, grof gebreide truien en vesten zijn helemaal terug.',
      test: (c, p) => p.mid && ['truien', 'vesten'].includes(p.mid.categoryId) && p.mid.warmth === 3,
    },
    {
      id: 'preppy',
      label: 'Preppy laagjes',
      text: 'Preppy: een overhemd of polo onder je trui.',
      test: (c, p) => p.base && ['overhemden', 'polos', 'blouses'].includes(p.base.categoryId) && p.mid && ['truien', 'sweaters', 'vesten'].includes(p.mid.categoryId),
    },
  ],
};

const TREND_COLOR_NAMES = { olijf: 'Olijfgroen', groen: 'Flessengroen', paars: 'Aubergine', geel: 'Botergeel', lichtblauw: 'Hemelsblauw' };

// Doen de trends nu mee? (Alleen binnen het seizoen waarvoor ze zijn opgezocht.)
function trendsActive() {
  const d = today();
  return d >= TRENDS.validFrom && d <= TRENDS.validTo;
}

// Welke trends zitten er in deze look?
function lookTrends(parts) {
  if (!trendsActive()) return [];
  const items = Object.values(parts);
  // Kleurtrends tellen alleen op de kleding zelf: een bruine riem of gele sjaal maakt nog geen trendlook.
  const clothes = items.filter(i => !['shoes', 'acc'].includes(slotOf(i)));
  const colors = new Set(clothes.flatMap(itemColors));
  const accents = [...colors].map(colorById).filter(c => !c.neutral && !c.print);
  const p = {
    top: parts.mid || parts.base,
    mid: parts.mid, base: parts.base, bottom: parts.bottom,
    formalities: items.filter(i => slotOf(i) !== 'acc').map(itemFormality),
    accent: accents.length === 1 ? accents[0].id : null,
    coolAccent: accents.some(c => c.tone === 'cool'),
  };
  return TRENDS.rules.filter(r => r.test(colors, p)).map(r => ({
    id: r.id, label: r.label,
    text: typeof r.text === 'function' ? r.text(TREND_COLOR_NAMES[p.accent] || 'Deze kleur') : r.text,
  }));
}
