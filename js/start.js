// Je kast vullen zonder dat het een klus wordt.
// 1. Begin met 5 stuks die je deze week draagt: daarna staat meteen je eerste look klaar.
// 2. Daarna elke dag één kleine opdracht ("Vandaag: je schoenen"), met hoe compleet je kast is.

const FIRST_LOOK_AT = 5;

// Een kast waar de app echt mee uit de voeten kan: samen ongeveer 30 stuks.
const KAST_TARGETS = {
  vrouw: { base: 8, mid: 5, bottom: 5, full: 3, shoes: 4, outer: 3, acc: 2 },
  man:   { base: 9, mid: 5, bottom: 7, shoes: 4, outer: 3, acc: 2 },
};
const kastTargets = () => KAST_TARGETS[state.profile.gender] || KAST_TARGETS.vrouw;
const ownItems = () => state.items.filter(i => !i.demo);
const slotCount = slot => ownItems().filter(i => slotOf(i) === slot).length;

function kastComplete() {
  let have = 0, want = 0;
  for (const [slot, n] of Object.entries(kastTargets())) { have += Math.min(n, slotCount(slot)); want += n; }
  return Math.round((have / want) * 100);
}

// De eerste 5: precies genoeg voor een look (een shirt, een broek of rok, schoenen).
function starterSteps() {
  const base = slotCount('base'), mid = slotCount('mid'), full = slotCount('full');
  return [
    { label: 'Een broek of rok', done: slotCount('bottom') + full >= 1 },
    { label: 'Een shirt of top, en een trui of hoodie', done: full >= 1 ? base + mid >= 1 : base >= 1 && base + mid >= 2 },
    { label: 'Een paar schoenen', done: slotCount('shoes') >= 1 },
    { label: 'Eén stuk dat je bijna vergeten was', done: ownItems().length >= FIRST_LOOK_AT },
  ];
}
const canMakeLook = () => slotCount('full') > 0 || (slotCount('base') > 0 && slotCount('bottom') > 0);

// ---------- Opdracht van vandaag ----------
const KAST_TASKS = {
  base:     ['Je shirts en tops', 'Leg ze een voor een plat neer en fotografeer ze. Een paar minuten werk.'],
  mid:      ['Je truien en hoodies', 'Mouwen langs het lijf, capuchon plat. Dan knipt de app ze het mooist uit.'],
  bottom:   ['Je broeken', 'Ook die ene broek die je nooit draagt: daar zitten de verrassende looks in.'],
  full:     ['Je jurken en jumpsuits', 'Plat neerleggen, helemaal in beeld.'],
  shoes:    ['Je schoenen', 'Zet ze op de grond en fotografeer ze een voor een, recht van boven.'],
  outer:    ['Je jassen', 'Dan weet de app wat je aan kunt als het koud wordt.'],
  acc:      ['Je tassen, sjaals en petten', 'De kleine dingen maken een look af.'],
  vergeten: ['3 stuks die je dit jaar niet droeg', 'Kijk achter in je kast. Juist die stukken geeft de app voorrang.'],
};

const TASK_PRIORITY = ['base', 'bottom', 'shoes', 'mid', 'outer', 'full', 'acc'];

function todaysTask() {
  const saved = state.profile.kastTask;
  if (saved?.date === today()) return saved;
  // Eerst de basis (shirts, broeken, schoenen) tot de helft, daarna het grootste gat.
  // Elke derde dag: de vergeten stukken.
  const t = kastTargets();
  const gaps = TASK_PRIORITY.filter(s => t[s] && slotCount(s) < t[s]);
  if (!gaps.length) return null;
  const ratio = s => slotCount(s) / t[s];
  const slot = gaps.find(s => ratio(s) < 0.5) || [...gaps].sort((a, b) => ratio(a) - ratio(b))[0];
  const n = t[slot];
  const forgotten = Math.floor(Date.now() / 86400000) % 3 === 2;
  const task = forgotten
    ? { date: today(), kind: 'vergeten', goal: 3, start: ownItems().length }
    : { date: today(), kind: slot, goal: Math.min(3, n - slotCount(slot)), start: slotCount(slot) };
  state.profile.kastTask = task;
  saveProfile();
  return task;
}
const taskDone = t => (t.kind === 'vergeten' ? ownItems().length : slotCount(t.kind)) - t.start;

// ---------- Kaart bovenaan de kast ----------
function renderStartCard() {
  const el = $('#start-card');
  const n = ownItems().length;
  const demo = state.items.some(i => i.demo);
  let html = '';

  if (n > 0 && n < FIRST_LOOK_AT && !demo) {
    const steps = starterSteps();
    html = `
      <p class="sc-kicker">Je eerste look</p>
      <h3 class="serif">Nog ${FIRST_LOOK_AT - n} ${FIRST_LOOK_AT - n === 1 ? 'stuk' : 'stuks'}</h3>
      <p class="muted small">Pak 5 stuks die je deze week draagt. Daarna stelt de app je eerste look samen.</p>
      <ul class="sc-steps">${steps.map(s => `<li class="${s.done ? 'done' : ''}">${esc(s.label)}</li>`).join('')}</ul>
      <button class="btn small primary" id="sc-add">Stuk toevoegen</button>`;
  } else if (n >= FIRST_LOOK_AT && state.profile.taskHiddenOn !== today() && state.profile.firstLookOn !== today()) {
    const pct = kastComplete();
    const task = pct < 100 && todaysTask();
    if (task) {
      const [title, hint] = KAST_TASKS[task.kind];
      const done = Math.min(task.goal, taskDone(task));
      const finished = done >= task.goal;
      const goalText = task.kind === 'vergeten' ? '' : ` · ${task.goal === 1 ? 'nog 1 stuk' : `${task.goal} stuks`}`;
      html = `
        <p class="sc-kicker">${finished ? 'Opdracht gedaan' : 'Opdracht van vandaag'}</p>
        <h3 class="serif">${finished ? 'Lekker bezig ✓' : esc(title) + goalText}</h3>
        <p class="muted small">${finished ? 'Morgen weer een nieuwe opdracht.' : esc(hint)}</p>
        ${finished ? '' : `<p class="sc-progress">${done} van ${task.goal}</p>`}
        <div class="sc-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <p class="sc-pct">Je kast is voor ${pct}% compleet</p>
        <div class="row">
          ${finished ? '' : '<button class="btn small primary" id="sc-add">Foto’s maken</button>'}
          <button class="btn small ghost" id="sc-later">${finished ? 'Sluiten' : 'Morgen'}</button>
        </div>`;
    }
  }

  el.classList.toggle('hidden', !html);
  el.innerHTML = html;
  $('#sc-add')?.addEventListener('click', () => startAdding());
  $('#sc-later')?.addEventListener('click', async () => {
    state.profile.taskHiddenOn = today();
    await saveProfile();
    renderStartCard();
  });
}

// ---------- Het wow-moment: na stuk 5 je eerste look ----------
async function maybeFirstLook() {
  if (state.profile.firstLookDone || ownItems().length < FIRST_LOOK_AT || !canMakeLook()) return;
  state.profile.firstLookDone = true;
  state.profile.firstLookOn = today(); // de eerste opdracht komt morgen
  await saveProfile();
  renderKast();
  renderFirstLookThanks();
  $('#first-look').showModal();
}
$('#fl-go').onclick = () => { $('#first-look').close(); openPlanner(); };

// Wie al een kast had voordat dit bestond, krijgt het wow-moment niet alsnog.
function initStart() {
  if (!state.profile.firstLookDone && ownItems().length >= FIRST_LOOK_AT) {
    state.profile.firstLookDone = true;
    saveProfile();
  }
}
