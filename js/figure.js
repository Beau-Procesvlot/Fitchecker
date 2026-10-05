// Tijdelijke aankleedpop: een silhouet in de kleuren van de outfit.
// Wordt later vervangen door de eigen personages (fase 6).

const SKIN = '#d6b294';
const SHORT_BOTTOMS = ['shorts'];
const SKIRTS = ['rokken'];

// Een print tekent de pop in de hoofdkleur van het stuk; strepen alleen als er geen andere kleur bekend is.
function figureFill(it) {
  if (!it) return null;
  const c = colorById(it.color);
  if (!c.print) return c.hex;
  const main = it.colors?.find(x => x.id !== 'print');
  return main ? colorById(main.id).hex : 'url(#fig-print)';
}

function figureSVG(p) {
  const top = figureFill(p.mid || p.base || p.full) || SKIN;
  const sleeves = figureFill(p.mid || p.base) || (p.full ? SKIN : top);
  const shoes = figureFill(p.shoes) || '#3a3a3a';
  const catOf = it => it && categoryById(it.categoryId)?.id;
  const s = 'stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke"';

  let lower;
  if (p.full) {
    // Jurk of jumpsuit: één stuk van schouder tot knie.
    lower = `<rect x="38" y="164" width="9" height="66" rx="4" fill="${SKIN}" ${s}/>
      <rect x="53" y="164" width="9" height="66" rx="4" fill="${SKIN}" ${s}/>
      <path d="M31 46 Q50 40 69 46 L74 120 L80 170 L20 170 L26 120 Z" fill="${figureFill(p.full)}" ${s}/>`;
  } else {
    const legs = figureFill(p.bottom) || SKIN;
    const cat = catOf(p.bottom);
    if (SKIRTS.includes(cat)) {
      lower = `<rect x="38" y="150" width="9" height="80" rx="4" fill="${SKIN}" ${s}/>
        <rect x="53" y="150" width="9" height="80" rx="4" fill="${SKIN}" ${s}/>
        <path d="M33 114 L67 114 L76 168 L24 168 Z" fill="${legs}" ${s}/>`;
    } else if (SHORT_BOTTOMS.includes(cat)) {
      lower = `<rect x="37" y="150" width="11" height="80" rx="5" fill="${SKIN}" ${s}/>
        <rect x="52" y="150" width="11" height="80" rx="5" fill="${SKIN}" ${s}/>
        <path d="M33 114 L67 114 L67 156 L51 156 L50 132 L49 156 L33 156 Z" fill="${legs}" ${s}/>`;
    } else {
      lower = `<path d="M33 114 L67 114 L66 230 L52 230 L50 136 L48 230 L34 230 Z" fill="${legs}" ${s}/>`;
    }
    lower += `<path d="M31 46 Q50 40 69 46 L68 118 L32 118 Z" fill="${top}" ${s}/>`;
  }

  return `<svg viewBox="0 0 100 250" class="figure" role="img" aria-label="Aankleedpop met deze outfit">
    <defs>
      <pattern id="fig-print" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#e8e3da"/><rect width="4" height="8" fill="#2b2b2b"/>
      </pattern>
    </defs>
    <rect x="45" y="30" width="10" height="14" fill="${SKIN}" ${s}/>
    <ellipse cx="50" cy="20" rx="12" ry="14" fill="${SKIN}" ${s}/>
    <path d="M32 48 L20 112 L28 114 L38 62 Z" fill="${sleeves}" ${s}/>
    <path d="M68 48 L80 112 L72 114 L62 62 Z" fill="${sleeves}" ${s}/>
    <circle cx="24" cy="117" r="4" fill="${SKIN}" ${s}/>
    <circle cx="76" cy="117" r="4" fill="${SKIN}" ${s}/>
    ${lower}
    <ellipse cx="41" cy="234" rx="9" ry="5" fill="${shoes}" ${s}/>
    <ellipse cx="59" cy="234" rx="9" ry="5" fill="${shoes}" ${s}/>
  </svg>`;
}
