// Wekelijkse tip: hooguit één keer per week, bij het openen van de app, een kleine tip.
// Ziet eruit als een iPhone-melding die van boven naar beneden schuift. Weg met het kruisje of door omhoog te vegen.
// (Dit is een melding in de app, geen pushmelding: die zou een server nodig hebben.)

const TIPS = [
  { title: 'Kast vullen zonder moeite', text: 'Maak ’s avonds, voordat je je omkleedt, een foto van wat je aanhad. Zo vult je kast zich vanzelf, stukje bij stukje.' },
  { title: 'Wat droeg je vandaag?', text: 'Tik op ‘Draag ik vandaag’ als je een look aantrekt. Dan weet de app wat je vergeet, en klopt je Wrapped aan het eind van de maand.' },
  { title: 'Iets vergeten?', text: 'Kijk eens bij het bord ‘Vergeten’ in je kast. Daar hangen stukken die al weken wachten op een comeback.' },
];
const TIP_EVERY = 7 * 86400000;

async function maybeTip() {
  const p = state.profile;
  if (!p.onboarded || !state.items.length) return;
  // De eerste tip komt een dag na het beginnen, niet meteen bij de eerste keer.
  if (!p.lastTipAt) { p.lastTipAt = Date.now() - TIP_EVERY + 86400000; await saveProfile(); return; }
  if (Date.now() - p.lastTipAt < TIP_EVERY) return;
  const i = (p.tipIndex || 0) % TIPS.length;
  p.lastTipAt = Date.now();
  p.tipIndex = i + 1;
  await saveProfile();
  showTip(TIPS[i]);
}

let tipHideTimer;
function showTip(tip) {
  const el = $('#tip-banner');
  clearTimeout(tipHideTimer);
  $('#tip-title').textContent = tip.title;
  $('#tip-text').textContent = tip.text;
  el.classList.remove('hidden', 'out');
  // Als popover ligt de melding ook boven een open scherm.
  if (el.showPopover) {
    el.popover = 'manual';
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  }
  el.classList.remove('in');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
}

function hideTip() {
  const el = $('#tip-banner');
  el.style.transform = '';
  el.classList.remove('in');
  el.classList.add('out');
  tipHideTimer = setTimeout(() => {
    if (el.hidePopover && el.matches(':popover-open')) el.hidePopover();
    el.classList.add('hidden');
  }, 350);
}

$('#tip-close').onclick = hideTip;

// Omhoog vegen = wegvegen, zoals bij een echte melding.
(() => {
  const el = $('#tip-banner');
  let startY = null, dy = 0;
  el.addEventListener('pointerdown', e => { if (e.target.closest('#tip-close')) return; startY = e.clientY; dy = 0; el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => {
    if (startY === null) return;
    dy = Math.min(0, e.clientY - startY);
    el.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (startY === null) return;
    startY = null;
    el.style.transition = '';
    if (dy < -30) hideTip(); else el.style.transform = '';
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
})();

// Even na het openen, en niet tijdens het welkomstscherm of Wrapped (dan pas als die dicht zijn).
document.addEventListener('DOMContentLoaded', () => setTimeout(function wait() {
  const busy = ['#welcome', '#wrapped'].map(s => $(s)).find(d => d.open);
  if (busy) busy.addEventListener('close', () => setTimeout(wait, 800), { once: true });
  else maybeTip();
}, 2500));
