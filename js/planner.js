// "Wat wordt de look vandaag?": het scherm waarmee de app opent. Stap voor stap doorvragen.
// 1. Wat voor dag is het?  2. Wat ga je doen?  3. Hoe voel je je?  4. Nog even checken.

const plan = {
  day: null,          // 'normaal' | 'bijzonder' | 'thuis'
  situation: null,    // een item uit SITUATIONS of een eigen situatie
  mood: null,         // een id uit MOODS
  dayOffset: 0,       // 0 vandaag, 1 morgen
  from: '', to: '',
  transport: 'fiets',
  formality: 1,
  manualLevel: null,  // als het weer niet opgehaald kan worden
};

const allSituations = () => [...SITUATIONS, ...(state.profile.customSituations || [])];

function openPlanner() {
  renderPlanner();
  if (!$('#plan-dialog').open) $('#plan-dialog').showModal();
  $('#plan-dialog').scrollTop = 0;
}

// Bij het openen van de app: vragen wat de look wordt, tenzij je net al looks hebt gemaakt
// (binnen 2 uur) of je kast nog leeg is.
function maybeOpenPlanner() {
  const recent = Date.now() - (state.profile.lastPlanAt || 0) < 2 * 3600 * 1000;
  if (!recent && state.items.some(i => !i.inWash)) openPlanner();
}

function scrollToStep(id) {
  requestAnimationFrame(() => $(id).scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function renderPlanner() {
  // Stap 1
  $('#day-options').innerHTML = DAY_TYPES.map(d => `
    <button class="day-option ${plan.day === d.id ? 'on' : ''}" data-day="${d.id}">
      <strong>${d.label}</strong><span>${d.hint}</span>
    </button>`).join('');
  $('#day-options').querySelectorAll('button').forEach(b => b.onclick = () => {
    plan.day = b.dataset.day;
    plan.situation = null;
    if (plan.day === 'thuis') selectSituation(SITUATIONS.find(s => s.id === 'thuis'));
    else { renderPlanner(); scrollToStep('#step-act'); }
  });

  // Stap 2
  const showAct = plan.day && plan.day !== 'thuis';
  $('#step-act').classList.toggle('hidden', !showAct);
  if (showAct) {
    const list = allSituations().filter(s => s.day === plan.day);
    $('#act-chips').innerHTML = list.map(s => `<button type="button" class="chip ${plan.situation?.id === s.id ? 'on' : ''}" data-id="${s.id}">${esc(s.label)}</button>`).join('')
      + '<button type="button" class="chip add" id="add-situation">＋ Eigen situatie</button>';
    $('#act-chips').querySelectorAll('[data-id]').forEach(b => b.onclick = () => selectSituation(list.find(s => s.id === b.dataset.id)));
    $('#add-situation').onclick = () => openSituationEditor(plan.day);
  }

  // Stap 3: hoe voel je je?
  $('#step-mood').classList.toggle('hidden', !plan.situation);
  renderChips($('#mood-chips'), MOODS, id => plan.mood === id, id => {
    const first = !plan.mood;
    plan.mood = id;
    renderPlanner();
    if (first) scrollToStep('#step-details');
  });

  // Stap 4
  $('#step-details').classList.toggle('hidden', !plan.situation || !plan.mood);
  if (plan.situation && plan.mood) renderDetails();
}

function selectSituation(sit) {
  plan.situation = sit;
  plan.from = sit.from;
  plan.to = sit.to;
  plan.formality = sit.formality;
  plan.manualLevel = null;
  plan.mood = null;
  renderPlanner();
  scrollToStep('#step-mood');
}

function renderDetails() {
  const sit = plan.situation;
  const indoor = !!sit.indoor;
  renderChips($('#when-chips'), [{ id: 0, label: 'Vandaag' }, { id: 1, label: 'Morgen' }], id => plan.dayOffset === id, id => { plan.dayOffset = id; renderDetails(); });
  $('#row-transport').classList.toggle('hidden', indoor);
  renderChips($('#transport-chips'), TRANSPORT, id => plan.transport === id, id => { plan.transport = id; renderDetails(); });
  $('#row-formality').classList.toggle('hidden', !sit.askFormality);
  renderChips($('#formality-chips'), FORMALITY_OPTIONS, id => plan.formality === id, id => { plan.formality = id; renderDetails(); });
  renderSearchHint();
  // Weer handmatig, alleen als ophalen niet lukte.
  $('#row-manual').classList.toggle('hidden', !plan.weatherError);
  $('#manual-reason').textContent = plan.weatherError || '';
  renderChips($('#manual-chips'), WEATHER, id => plan.manualLevel === id, id => { plan.manualLevel = id; renderDetails(); });
}


// ---------- Zoekwoorden ----------
function parseSearch(text) {
  const s = { colors: [], cats: [], catWords: [], fits: [], styles: [], accents: false, neutral: false, warmer: 0, formality: undefined, recognized: [], unknown: [] };
  const words = text.toLowerCase().replace(/all black/g, 'allblack').split(/[^a-zà-ÿ]+/).filter(w => w.length > 2);
  for (const w of words) {
    let k = KEYWORDS[w];
    if (k?.alias) k = KEYWORDS[k.alias];
    if (k) {
      s.colors.push(...(k.colors || []));
      s.cats.push(...(k.cats || []));
      s.fits.push(...(k.fits || []));
      s.styles.push(...(k.styles || []));
      if (k.accents) s.accents = true;
      if (k.neutral) s.neutral = true;
      if (k.trendy) s.trendy = true;
      if (k.warmer) s.warmer += k.warmer;
      if (k.formality !== undefined) s.formality = k.formality;
      s.recognized.push(k.label);
      continue;
    }
    const color = COLORS.find(c => c.id === w || c.label.toLowerCase() === w || c.label.toLowerCase() + 'e' === w);
    if (color) { s.colors.push(color.id); s.recognized.push(color.label.toLowerCase()); continue; }
    // Categorieën: "rok" vindt "Rokken", "hoodie" vindt "Hoodies".
    const stem = w.replace(/(en|s)$/, '');
    if (state.categories.some(c => c.name.toLowerCase().includes(stem))) { s.catWords.push(stem); s.recognized.push(w); continue; }
    s.unknown.push(w);
  }
  return s;
}

function renderSearchHint() {
  const s = parseSearch($('#search').value);
  const parts = [];
  if (s.recognized.length) parts.push(`Begrepen: ${[...new Set(s.recognized)].join(', ')}`);
  if (s.unknown.length) parts.push(`<span class="faded">Niet herkend: ${s.unknown.join(', ')}</span>`);
  $('#search-hint').innerHTML = parts.join(' · ');
}
$('#search').oninput = renderSearchHint;

// ---------- Looks maken ----------
function stylesFor(sit, formality) {
  if (sit.id === 'sport') return ['sport'];
  if (sit.indoor) return ['casual', 'sport'];
  const styles = formality <= 1 ? ['casual'] : formality === 2 ? ['casual', 'net'] : ['net'];
  if (sit.party) styles.push('feest');
  return styles;
}

$('#plan-go').onclick = async () => {
  const sit = plan.situation;
  if (!sit) return;
  const ctx = {
    label: sit.label, sitId: sit.custom ? 'eigen' : sit.id, indoor: !!sit.indoor,
    formality: plan.formality, styles: stylesFor(sit, plan.formality),
    // De stemming telt mee als extra zoekwoorden.
    search: parseSearch(`${$('#search').value} ${MOODS.find(m => m.id === plan.mood)?.words || ''}`),
    level: 'mild', rain: false, windy: false, weatherText: '',
  };
  if (state.profile.transport !== plan.transport) {
    state.profile.transport = plan.transport;
    saveProfile();
  }

  if (sit.indoor) {
    ctx.weatherText = 'Binnen';
  } else if (plan.manualLevel) {
    ctx.level = plan.manualLevel;
    ctx.weatherText = WEATHER.find(w => w.id === plan.manualLevel).label;
  } else {
    $('#plan-go').disabled = true;
    $('#plan-go').textContent = 'Weer ophalen…';
    try {
      const w = await Weather.forWindow(plan.dayOffset, plan.from, plan.to);
      Object.assign(ctx, Weather.classify(w, { koukleum: state.profile.koukleum, transport: plan.transport }));
      ctx.weatherText = Weather.describe(w);
      ctx.minFeels = Math.round(w.minFeels);
      ctx.rainPct = w.rain;
      plan.weatherError = null;
    } catch (err) {
      plan.weatherError = `${err.message} Kies het weer zelf:`;
      $('#plan-go').disabled = false;
      $('#plan-go').textContent = 'Laat looks zien';
      renderDetails();
      scrollToStep('#row-manual');
      return;
    }
    $('#plan-go').disabled = false;
    $('#plan-go').textContent = 'Laat looks zien';
  }
  if (plan.dayOffset === 1) ctx.label += ' · morgen';

  state.profile.lastPlanAt = Date.now();
  saveProfile();
  $('#plan-dialog').close();
  const mood = plan.mood !== 'geen' ? MOODS.find(m => m.id === plan.mood)?.label.toLowerCase() : '';
  $('#plan-summary-text').textContent = [sit.label, mood, plan.dayOffset ? 'morgen' : 'vandaag', ctx.weatherText].filter(Boolean).join(' · ');
  showTab('outfit');
  generateLooks(ctx);
};

$('#plan-edit').onclick = openPlanner;
$('#open-planner').onclick = openPlanner;
$('#plan-close').onclick = () => $('#plan-dialog').close();

// ---------- Eigen situaties ----------
let sitDraft = null;
function openSituationEditor(day) {
  sitDraft = { day, formality: 1, when: 'dag' };
  $('#s-name').value = '';
  renderSituationEditor();
  $('#sit-editor').showModal();
}
function renderSituationEditor() {
  renderChips($('#s-day'), DAY_TYPES.filter(d => d.id !== 'thuis'), id => sitDraft.day === id, id => { sitDraft.day = id; renderSituationEditor(); });
  renderChips($('#s-when'), [{ id: 'dag', label: 'Overdag' }, { id: 'avond', label: "'s Avonds" }], id => sitDraft.when === id, id => { sitDraft.when = id; renderSituationEditor(); });
  renderChips($('#s-formality'), [{ id: 0, label: 'Sportief' }, ...FORMALITY_OPTIONS], id => sitDraft.formality === id, id => { sitDraft.formality = id; renderSituationEditor(); });
}
$('#s-cancel').onclick = () => $('#sit-editor').close();
$('#s-save').onclick = async () => {
  const label = $('#s-name').value.trim();
  if (!label) { $('#s-name').focus(); return; }
  const sit = { id: 'eigen-' + newId(), day: sitDraft.day, label, ...(sitDraft.when === 'avond' ? { from: '19:00', to: '00:00' } : { from: '08:00', to: '18:00' }), formality: sitDraft.formality, custom: true };
  state.profile.customSituations = [...(state.profile.customSituations || []), sit];
  await saveProfile();
  $('#sit-editor').close();
  plan.day = sit.day;
  selectSituation(sit);
  toast('Situatie toegevoegd');
};
