// Vrienden uitnodigen. Delen kan altijd; de beloning telt pas als de betaalmuur aanstaat.
// Zonder server werkt de beloning met een bedankcode: heeft je vriend 5 stuks in de kast,
// dan krijgt die een code om naar jou te sturen. Vul je die in, dan krijg je 10 extra plekken
// (hooguit 5 vrienden). Niet waterdicht, wel eerlijk genoeg voor een paar euro.

const INVITE = { bonus: 10, max: 5, url: 'https://beau-procesvlot.github.io/Fitchecker/' };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // zonder 0/O en 1/I

function randomCode(n) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map(v => CODE_CHARS[v % CODE_CHARS.length]).join('');
}
function installId() {
  if (!state.profile.installId) { state.profile.installId = randomCode(5); saveProfile(); }
  return state.profile.installId;
}
function codeCheck(id) {
  let h = 2166136261;
  for (const ch of 'zonde|fitchecker|' + id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h >>>= 0;
  let out = '';
  for (let i = 0; i < 3; i++) { out += CODE_CHARS[h % CODE_CHARS.length]; h = Math.floor(h / CODE_CHARS.length); }
  return out;
}
const thanksCode = () => `${installId()}-${codeCheck(installId())}`;
// "abcde-fgh", met of zonder streepje of spaties. Geeft het id van de vriend, of null.
function parseThanksCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8) return null;
  const id = s.slice(0, 5);
  return codeCheck(id) === s.slice(5) ? id : null;
}
const inviteBonus = () => Math.min(INVITE.max, (state.profile.friends || []).length) * INVITE.bonus;

async function shareInvite() {
  const text = 'Ik gebruik Fitchecker: de app maakt looks uit je eigen kast, met het weer erbij. Gratis en zonder account.';
  if (navigator.share) {
    try { await navigator.share({ title: 'Fitchecker', text, url: INVITE.url }); } catch { /* geannuleerd */ }
  } else {
    await navigator.clipboard?.writeText(`${text} ${INVITE.url}`).catch(() => {});
    toast('Link gekopieerd');
  }
}

async function shareThanksCode() {
  if (ownItems().length < FIRST_LOOK_AT) { toast(`Je bedankcode komt zodra je ${FIRST_LOOK_AT} stuks in je kast hebt`); return; }
  const text = `Thanks voor de Fitchecker-tip! Mijn bedankcode: ${thanksCode()}. Vul hem in bij Instellingen › Vrienden, dan krijg je ${INVITE.bonus} extra plekken.`;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch { /* geannuleerd */ }
  } else {
    await navigator.clipboard?.writeText(text).catch(() => {});
    toast(`Je code: ${thanksCode()} (gekopieerd)`);
  }
}

async function redeemThanksCode() {
  const raw = prompt('Bedankcode van je vriend:');
  if (raw == null) return;
  const id = parseThanksCode(raw);
  const friends = state.profile.friends || [];
  if (!id) { toast('Deze code klopt niet. Check hem nog even.'); return; }
  if (id === installId()) { toast('Dit is je eigen code. Stuur hem naar wie jou Fitchecker tipte.'); return; }
  if (friends.includes(id)) { toast('Deze code heb je al ingevuld'); return; }
  if (friends.length >= INVITE.max) { toast(`Je hebt al ${INVITE.max} vrienden uitgenodigd, het maximum`); return; }
  state.profile.friends = [...friends, id];
  await saveProfile();
  toast(`${INVITE.bonus} extra plekken erbij. Thanks voor het tippen!`);
  renderInvite();
}

// Instellingen › Vrienden
function renderInvite() {
  const on = slotsOn();
  const n = (state.profile.friends || []).length;
  $('#invite-rewards').classList.toggle('hidden', !on);
  $('#invite-info').textContent = on
    ? `Elke vriend die begint geeft jou ${INVITE.bonus} extra plekken in je kast (tot ${INVITE.max} vrienden${n ? `; je hebt er nu ${n}` : ''}). Heeft je vriend ${FIRST_LOOK_AT} stuks in de kast, dan krijgt die een bedankcode om naar jou te sturen.`
    : 'Ken je iemand met een volle kast en niks om aan te trekken? Tip Fitchecker.';
}
$('#invite-share').onclick = shareInvite;
$('#invite-redeem').onclick = redeemThanksCode;
$('#invite-mycode').onclick = shareThanksCode;

// In het scherm "Je eerste look staat klaar": getipt door iemand? Bedank diegene.
function renderFirstLookThanks() {
  $('#fl-thanks').classList.toggle('hidden', !slotsOn());
}
$('#fl-thanks-btn').onclick = shareThanksCode;

// Als je kast vol is: gratis plekken door een vriend te tippen.
$('#slots-invite').onclick = () => {
  closeSlots(false);
  shareInvite();
  toast('Heeft je vriend 5 stuks? Vul de bedankcode in bij Instellingen › Vrienden');
};
function renderSlotsInvite() {
  $('#slots-invite').classList.toggle('hidden', (state.profile.friends || []).length >= INVITE.max);
}
