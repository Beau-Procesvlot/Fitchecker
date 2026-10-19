// Plekken in je kast: 30 gratis, daarna eenmalig 20 extra plekken per keer, of onbeperkt.
// Staat nu UIT (PLEKKEN.active): iedereen heeft onbeperkt. Aanzetten = active op true.
// Bewust geen teller of hint vooraf: het aanbod komt pas op het moment dat je kast vol is.

const PLEKKEN = { active: false, free: 30, pack: 20, packPrice: '€2,99', allPrice: '€7,99' };

// Betalen. Nu alleen een test; later aansluiten op Apple (in-app aankoop via de App Store)
// of op een betaalcode via het web. De rest van de app hoeft dan niet te veranderen.
// Producten in Apple: 'extra20_1', 'extra20_2', … (elk pakket apart, zodat ze terugkomen
// op een nieuwe telefoon) en 'onbeperkt'.
const Store = {
  provider: 'test', // later: 'apple' of 'web'
  async buy(product) {
    if (this.provider === 'test') return confirm(`TEST, er wordt niets betaald.\n\nDoen alsof je ${product.label} koopt voor ${product.price}?`);
    return false;
  },
  // Eerder gekochte pakketten ophalen, bijvoorbeeld op een nieuwe telefoon: { packs, unlimited } of null.
  async restore() {
    return null;
  },
};

const slotsOn = () => PLEKKEN.active || !!state.profile.slotsTest;
// Voorbeeldstukken tellen niet mee.
const countedItems = () => state.items.filter(i => !i.demo).length;

function slotLimit() {
  if (!slotsOn()) return Infinity;
  const p = state.profile.purchases || {};
  if (p.unlimited) return Infinity;
  // Wie al meer stukken had toen de limiet aanging, raakt niets kwijt: dat aantal is zijn startpunt.
  if (state.profile.slotsBase == null) {
    state.profile.slotsBase = Math.max(PLEKKEN.free, countedItems());
    saveProfile();
  }
  return state.profile.slotsBase + PLEKKEN.pack * (p.packs || 0) + inviteBonus();
}
const hasRoom = () => countedItems() < slotLimit();

// Het aanbod. Geeft true als er (na een aankoop) weer plek is.
// waiting: hoeveel foto's er nog klaarstaan (bij meerdere tegelijk toevoegen).
let slotsResolve = null;
function askForSlots(waiting = 0) {
  return new Promise(resolve => {
    slotsResolve = resolve;
    $('#slots-text').textContent = `Er staan al ${countedItems()} stuks in je kast. Hoe meer erin staat, hoe beter je looks worden.`
      + (waiting > 1 ? ` Er wachten nog ${waiting} foto's.` : '');
    $('#slots-pack-price').textContent = `Eenmalig ${PLEKKEN.packPrice}.`;
    $('#slots-all-price').textContent = `Nooit meer vol, eenmalig ${PLEKKEN.allPrice}.`;
    renderSlotsInvite();
    $('#slots-sheet').showModal();
  });
}
function closeSlots(ok) {
  const resolve = slotsResolve;
  slotsResolve = null;
  $('#slots-sheet').close();
  resolve?.(ok);
}
// Ook wegvegen of wegtikken telt als "niet nu".
$('#slots-sheet').addEventListener('close', () => closeSlots(false));
$('#slots-later').onclick = () => closeSlots(false);

async function buySlots(kind) {
  const p = state.profile.purchases || {};
  const product = kind === 'all'
    ? { id: 'onbeperkt', label: 'een onbeperkte kast', price: PLEKKEN.allPrice }
    : { id: `extra20_${(p.packs || 0) + 1}`, label: `${PLEKKEN.pack} extra plekken`, price: PLEKKEN.packPrice };
  if (!await Store.buy(product)) return;
  state.profile.purchases = kind === 'all' ? { ...p, unlimited: true } : { ...p, packs: (p.packs || 0) + 1 };
  await saveProfile();
  closeSlots(true);
  toast(kind === 'all' ? 'Je kast is nu onbeperkt' : `${PLEKKEN.pack} plekken erbij`);
}
$('#slots-pack').onclick = () => buySlots('pack');
$('#slots-all').onclick = () => buySlots('all');

// Aankopen samenvoegen (herstellen of back-up terugzetten): nooit iets afpakken.
function mergePurchases(r) {
  if (!r) return false;
  const p = state.profile.purchases || {};
  state.profile.purchases = { packs: Math.max(p.packs || 0, r.packs || 0), unlimited: !!(p.unlimited || r.unlimited) };
  return true;
}
$('#slots-restore').onclick = async () => {
  if (!mergePurchases(await Store.restore())) { toast('Geen eerdere aankopen gevonden'); return; }
  await saveProfile();
  toast('Je aankopen zijn hersteld');
  if (hasRoom()) closeSlots(true);
};

// TEST: paywall aan/uit in de instellingen. Weghalen als het klaar is (ook de knop in index.html).
$('#slots-test').onclick = async () => {
  const on = !state.profile.slotsTest;
  state.profile.slotsTest = on;
  delete state.profile.slotsBase;
  delete state.profile.purchases;
  delete state.profile.friends;
  await saveProfile();
  renderInvite();
  toast(on ? `Paywall-test aan: je kast is vol bij ${slotLimit()} stuks` : 'Paywall-test uit: weer onbeperkt');
};
