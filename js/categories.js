// Tabblad "Instellingen": jouw voorkeuren, categorieën, eigen situaties en back-up.

async function renderSettings() {
  renderChips($('#set-gender'), GENDERS, id => state.profile.gender === id, async id => {
    state.profile.gender = id;
    await saveProfile();
    renderSettings();
    toast(id === 'man' ? 'Jurken, rokken, jumpsuits en blouses verborgen' : 'Alle categorieën zichtbaar');
  });
  $('#style-profile').innerHTML = styleProfileHTML();
  $('#second-life-list').innerHTML = secondLifeHTML();
  $('#style-redo').querySelector('span').textContent = state.profile.styleWeights ? 'Moodboard opnieuw doen' : 'Stel je stijl in met het moodboard';
  $('#trend-info').textContent = trendsActive()
    ? `Trends: ${TRENDS.season} (${TRENDS.rules.length} trends).`
    : `Het trendbestand (${TRENDS.season}) is verlopen. Tijd om de trends van dit seizoen op te zoeken.`;
  $('#set-koukleum').value = state.profile.koukleum;
  $('#set-koukleum-label').textContent = koukleumLabel(state.profile.koukleum);
  renderLocationStatus();

  const withPhoto = state.items.filter(i => i.photo);
  const cut = withPhoto.filter(i => cutoutOf(i));
  $('#cutout-info').textContent = !withPhoto.length
    ? `Voor je looks haalt de app de achtergrond van je kledingfoto's weg. Je hebt nog geen stukken met een foto.`
    : `${cut.length} van ${withPhoto.length} stukken met een foto zijn uitgeknipt${Cutout.isBusy() ? ' (bezig…)' : ''}.`;
  $('#cutout-all').classList.toggle('hidden', !withPhoto.length || cut.length === withPhoto.length);

  const own = state.profile.customSituations || [];
  $('#sit-list').innerHTML = own.length
    ? own.map(s => `<div class="settings-row"><span>${esc(s.label)} <span class="muted small">${DAY_TYPES.find(d => d.id === s.day).label.toLowerCase()} · ${s.from >= '17:00' ? "'s avonds" : 'overdag'}</span></span><button class="link" data-del="${s.id}">Verwijderen</button></div>`).join('')
    : '<p class="muted small">Nog geen eigen situaties. Voeg ze toe bij Looks, onder ‘Wat ga je doen?’.</p>';
  $('#sit-list').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    state.profile.customSituations = own.filter(s => s.id !== b.dataset.del);
    await saveProfile();
    renderSettings();
  });


  const cats = visibleCategories();
  $('#cat-list').innerHTML = SLOTS.map(slot => {
    const inSlot = cats.filter(c => c.slot === slot.id);
    return `<div class="settings-group">
      <p>${slot.label}</p>
      ${inSlot.map(c => {
        const n = state.items.filter(i => i.categoryId === c.id).length;
        return `<button class="settings-row" data-id="${c.id}"><span>${esc(c.name)}</span><span class="muted">${n || ''} ›</span></button>`;
      }).join('') || '<p class="muted small">Nog geen categorieën</p>'}
    </div>`;
  }).join('');
  $('#cat-list').querySelectorAll('[data-id]').forEach(b => b.onclick = () => openCategoryEditor(categoryById(b.dataset.id)));
}

let catDraft = null, catDone = null;

function openCategoryEditor(cat, onSaved) {
  catDraft = cat ? { ...cat } : { id: null, name: '', slot: 'base', order: 0 };
  catDone = onSaved || null;
  $('#cat-title').textContent = cat ? 'Categorie bewerken' : 'Nieuwe categorie';
  $('#c-name').value = catDraft.name;
  const count = cat ? state.items.filter(i => i.categoryId === cat.id).length : 0;
  $('#c-delete').classList.toggle('hidden', !cat);
  $('#c-delete').disabled = count > 0;
  $('#c-delete-hint').classList.toggle('hidden', count === 0);
  $('#c-delete-hint').textContent = `Er ${count === 1 ? 'zit nog 1 stuk' : `zitten nog ${count} stuks`} in deze categorie. Verplaats ${count === 1 ? 'het' : 'ze'} eerst.`;
  renderCategoryEditor();
  $('#cat-editor').showModal();
}

function renderCategoryEditor() {
  $('#c-slots').innerHTML = SLOTS.map(s => `
    <button type="button" class="slot-option ${catDraft.slot === s.id ? 'on' : ''}" data-slot="${s.id}">
      <strong>${s.label}</strong>${s.hint ? `<span>${s.hint}</span>` : ''}
    </button>`).join('');
  $('#c-slots').querySelectorAll('button').forEach(b => b.onclick = () => { catDraft.slot = b.dataset.slot; renderCategoryEditor(); });
}

$('#c-cancel').onclick = () => $('#cat-editor').close();
$('#c-save').onclick = async () => {
  const name = $('#c-name').value.trim();
  if (!name) { $('#c-name').focus(); return; }
  const dup = state.categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== catDraft.id);
  if (dup) { toast('Die categorie bestaat al'); return; }
  let saved;
  if (catDraft.id) {
    saved = { ...catDraft, name };
    state.categories = state.categories.map(c => c.id === saved.id ? saved : c);
  } else {
    saved = { id: 'c-' + newId(), name, slot: catDraft.slot, order: Math.max(0, ...state.categories.map(c => c.order)) + 1 };
    state.categories.push(saved);
  }
  await saveCategories();
  $('#cat-editor').close();
  renderSettings();
  renderKast();
  if (catDone) catDone(saved);
};
$('#c-delete').onclick = async () => {
  if (!confirm(`Categorie "${catDraft.name}" verwijderen?`)) return;
  state.categories = state.categories.filter(c => c.id !== catDraft.id);
  await saveCategories();
  $('#cat-editor').close();
  renderSettings();
};

$('#add-cat').onclick = () => openCategoryEditor(null);
$('#style-redo').onclick = () => openMoodboardSheet();
$('#cutout-all').onclick = () => { Cutout.enqueueAll(); setTimeout(renderSettings, 300); };
$('#settings-demo').onclick = loadDemo;

$('#set-koukleum').oninput = e => { $('#set-koukleum-label').textContent = koukleumLabel(e.target.value); };
$('#set-koukleum').onchange = async e => {
  state.profile.koukleum = +e.target.value;
  await saveProfile();
  toast('Opgeslagen');
};
// Laat zien welke locatie de app voor het weer gebruikt, met de temperatuur daar nu.
// Zo zie je meteen of het klopt.
async function renderLocationStatus() {
  const el = $('#set-location-status');
  const city = state.profile.city;
  const gps = await DB.getMeta('location');
  if (!city && !gps) { el.textContent = 'Nog geen locatie. Gebruik je locatie of kies een stad.'; return; }
  const where = city ? `${city.name}${city.area ? `, ${city.area}` : ''}` : `Via je telefoon (${gps.lat.toLocaleString('nl-NL')}; ${gps.lon.toLocaleString('nl-NL')})`;
  el.textContent = `${where} · even kijken…`;
  try {
    const n = await Weather.now();
    el.textContent = `${where} · nu ${n.temp}°`;
  } catch {
    el.textContent = `${where} · weer nu niet op te halen`;
  }
}

$('#set-location').onclick = async () => {
  try {
    await DB.setMeta('location', await Weather.askLocation());
    state.profile.city = null;
    await saveProfile();
    Weather.forget();
    toast('Locatie bijgewerkt');
  } catch (err) {
    toast(err.message);
  }
  renderLocationStatus();
};

let citySearchTimer;
$('#set-city').onclick = () => {
  $('#city-input').value = '';
  $('#city-results').innerHTML = '';
  $('#city-sheet').showModal();
};
$('#city-input').oninput = e => {
  clearTimeout(citySearchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $('#city-results').innerHTML = ''; return; }
  citySearchTimer = setTimeout(async () => {
    try {
      const results = await Weather.searchCity(q);
      $('#city-results').innerHTML = results.length
        ? results.map((r, i) => `<button class="settings-row" data-i="${i}"><span>${esc(r.name)} <span class="muted small">${esc(r.area)}</span></span><span class="muted">›</span></button>`).join('')
        : '<p class="muted small">Geen stad gevonden.</p>';
      $('#city-results').querySelectorAll('[data-i]').forEach(b => b.onclick = async () => {
        state.profile.city = results[+b.dataset.i];
        await saveProfile();
        Weather.forget();
        $('#city-sheet').close();
        toast(`Weer voor ${state.profile.city.name}`);
        renderLocationStatus();
      });
    } catch (err) {
      $('#city-results').innerHTML = `<p class="muted small">${esc(err.message)}</p>`;
    }
  }, 350);
};

// ---------- Back-up ----------
// Je hele kast als één bestand. Belangrijk op een iPhone: Safari wist websitegegevens
// als je de app 7 dagen niet opent (tenzij hij op je beginscherm staat).
$('#backup-save').onclick = async () => {
  const data = { app: 'fitchecker', version: 1, savedAt: new Date().toISOString(), items: state.items, categories: state.categories, profile: state.profile };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], `fitchecker-backup-${today()}.json`, { type: 'application/json' });
  // Op de iPhone opent dit het deelmenu (bewaren in Bestanden, AirDrop…).
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Fitchecker back-up' }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#backup-restore').onclick = () => $('#backup-file').click();
$('#backup-file').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'fitchecker' || !Array.isArray(data.items)) throw new Error();
    if (!confirm(`Back-up van ${new Date(data.savedAt).toLocaleDateString('nl-NL')} met ${data.items.length} stuks terugzetten? Stukken die al in je kast staan blijven bewaard.`)) return;
    for (const it of data.items) await saveItem(it);
    state.categories = [...state.categories, ...data.categories.filter(c => !categoryById(c.id))];
    await saveCategories();
    toast(`${data.items.length} stuks teruggezet`);
    renderSettings();
  } catch {
    toast('Dit is geen geldige Fitchecker-back-up');
  }
};
