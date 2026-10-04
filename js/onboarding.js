// Welkomstscherm bij de eerste keer: koukleum-schuifje en locatie toestaan.
// In fase 4 komt het moodboard hier als extra stap bij.

let welcomeStep = 0;

function koukleumLabel(v) {
  return { '-2': 'Ik heb het altijd warm', '-1': 'Ik heb het snel warm', 0: 'Gemiddeld', 1: 'Ik heb het snel koud', 2: 'Ik ben een echte koukleum' }[v];
}

function openWelcome() {
  welcomeStep = 0;
  $('#w-koukleum').value = state.profile.koukleum;
  renderWelcome();
  $('#welcome').showModal();
}

function renderWelcome() {
  document.querySelectorAll('#welcome .w-step').forEach((s, i) => s.classList.toggle('hidden', i !== welcomeStep));
  document.querySelectorAll('#welcome .w-dots span').forEach((d, i) => d.classList.toggle('on', i === welcomeStep));
  $('#w-koukleum-label').textContent = koukleumLabel($('#w-koukleum').value);
}

$('#w-koukleum').oninput = renderWelcome;
$('#w-start').onclick = () => { welcomeStep = 1; renderWelcome(); };
$('#w-koukleum-next').onclick = async () => {
  state.profile.koukleum = +$('#w-koukleum').value;
  await saveProfile();
  welcomeStep = 2;
  renderWelcome();
};

async function finishWelcome() {
  state.profile.onboarded = true;
  await saveProfile();
  $('#welcome').close();
  maybeOpenPlanner();
}

$('#w-location').onclick = async () => {
  $('#w-location').disabled = true;
  $('#w-location').textContent = 'Even zoeken…';
  try {
    await DB.setMeta('location', await Weather.askLocation());
    toast('Locatie gevonden');
  } catch (err) {
    toast(err.message);
  }
  $('#w-location').disabled = false;
  $('#w-location').textContent = 'Locatie toestaan';
  finishWelcome();
};
$('#w-skip').onclick = finishWelcome;
$('#settings-welcome').onclick = openWelcome;
// Het welkomstscherm kan niet per ongeluk weggetikt worden.
$('#welcome').addEventListener('cancel', e => e.preventDefault());
