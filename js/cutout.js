// Uitknippen: de achtergrond van kledingfoto's weghalen, op de telefoon zelf.
// - Een foto die de iPhone al heeft uitgeknipt (PNG met doorzichtige achtergrond) wordt direct gebruikt (zie photo.js).
// - Andere foto's knipt een AI-model uit (@imgly/background-removal, AGPL-licentie). Eenmalig ~53 MB downloaden;
//   de foto's zelf verlaten de telefoon niet.
// Het uitknippen gebeurt op de achtergrond, na het opslaan, één stuk tegelijk.

const Cutout = (() => {
  const LIB_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';
  const CONFIG = { model: 'isnet_quint8', output: { format: 'image/png' } };
  let lib = null;
  let running = false;
  const queue = []; // [{ id, side: 'front' | 'back' }]
  let done = 0;

  async function loadLib() {
    if (!lib) lib = await import(LIB_URL);
    return lib;
  }

  // Bij voorkeur in een aparte werker (het scherm blijft dan reageren). Lukt dat niet,
  // dan op de gewone manier.
  let worker = null, workerFailed = false, nextId = 1;
  const pending = new Map();
  function getWorker() {
    if (worker || workerFailed) return worker;
    try {
      worker = new Worker('js/cutout-worker.js', { type: 'module' });
      worker.onmessage = e => {
        const p = pending.get(e.data.id);
        if (!p) return;
        if (e.data.type === 'progress') p.onProgress?.(e.data.key, e.data.current, e.data.total);
        else { pending.delete(e.data.id); e.data.type === 'error' ? p.reject(new Error(e.data.message)) : p.resolve(e.data.blob); }
      };
      worker.onerror = () => { workerFailed = true; worker = null; for (const p of pending.values()) p.reject(new Error('werker')); pending.clear(); };
    } catch { workerFailed = true; worker = null; }
    return worker;
  }
  function ask(type, payload, onProgress) {
    const w = getWorker();
    if (!w) return null;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress });
      w.postMessage({ id, type, ...payload });
    });
  }

  // ---------- Toestemming en downloaden ----------
  function askPermission() {
    return new Promise(resolve => {
      $('#cutout-progress').classList.add('hidden');
      $('#cutout-actions').classList.remove('hidden');
      $('#cutout-yes').onclick = () => resolve(true);
      $('#cutout-no').onclick = () => { $('#cutout-sheet').close(); resolve(false); };
      if (!$('#cutout-sheet').open) $('#cutout-sheet').showModal();
    });
  }

  async function prepare() {
    $('#cutout-actions').classList.add('hidden');
    $('#cutout-progress').classList.remove('hidden');
    const bar = $('#cutout-bar'), label = $('#cutout-progress-label');
    const parts = {};
    const progress = (key, current, total) => {
      parts[key] = [current, total];
      const [c, t] = Object.values(parts).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
      bar.style.width = `${Math.round((c / Math.max(t, 1)) * 100)}%`;
      label.textContent = `${Math.round(c / 1048576)} van ${Math.round(t / 1048576)} MB`;
    };
    try {
      const viaWorker = ask('preload', {}, progress);
      if (viaWorker) await viaWorker.catch(async () => { workerFailed = true; await (await loadLib()).preload({ ...CONFIG, progress }); });
      else await (await loadLib()).preload({ ...CONFIG, progress });
      state.profile.cutoutReady = true;
      await saveProfile();
      $('#cutout-sheet').close();
      return true;
    } catch (err) {
      label.textContent = 'Downloaden lukte niet. Probeer het later opnieuw, via Instellingen.';
      setTimeout(() => $('#cutout-sheet').close(), 2500);
      return false;
    }
  }

  // Klaar om te knippen? Vraagt de eerste keer om toestemming voor de download.
  async function ensureReady() {
    if (state.profile.cutoutReady) return true;
    if (state.profile.cutoutDeclined && !ensureReady.force) return false;
    const yes = await askPermission();
    if (!yes) { state.profile.cutoutDeclined = true; await saveProfile(); return false; }
    state.profile.cutoutDeclined = false;
    return prepare();
  }

  // ---------- Knippen ----------
  async function cut(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    let out = null;
    const viaWorker = ask('cut', { blob });
    // Lukt één foto niet, dan is dat een echte fout. Alleen als de werker helemaal niet kan
    // draaien, valt de app terug op de gewone manier.
    if (viaWorker) out = await viaWorker.catch(err => { if (!workerFailed) throw err; return null; });
    if (!out) {
      const l = await loadLib();
      out = await (l.removeBackground || l.default)(blob, CONFIG);
    }
    const img = await loadImage(out);
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);
    return trimCutout(cv);
  }

  function itemFor(job) { return state.items.find(i => i.id === job.id); }
  const keyOf = side => (side === 'back' ? 'cutoutBack' : 'cutout');
  const srcOf = (it, side) => (side === 'back' ? it.photoBack : it.photo);

  function showStatus() {
    const left = queue.length + (running ? 1 : 0);
    $('#cutout-status').classList.toggle('hidden', !running);
    $('#cutout-status').textContent = `Uitknippen… nog ${left}`;
  }

  async function run() {
    if (running || !queue.length) return;
    // Eerst toestemming vragen, maar pas als je klaar bent met toevoegen (niet midden in een reeks foto's).
    if (!state.profile.cutoutReady) while ($('#item-form').open) await new Promise(r => setTimeout(r, 700));
    if (!(await ensureReady())) { queue.length = 0; return; }
    running = true;
    while (queue.length) {
      const job = queue.shift();
      showStatus();
      const it = itemFor(job);
      if (!it || !srcOf(it, job.side) || it[keyOf(job.side)]) continue;
      try {
        const result = await cut(srcOf(it, job.side));
        const fresh = itemFor(job);
        if (!fresh || srcOf(fresh, job.side) !== srcOf(it, job.side)) continue; // foto intussen vervangen
        const update = { ...fresh, [keyOf(job.side)]: result ? result.dataUrl : 'mislukt' };
        // Kleuren opnieuw herkennen op het uitgeknipte stuk: nauwkeuriger dan met achtergrond.
        if (result && !fresh.colorManual) {
          const side = detectColors(result.canvas);
          if (job.side === 'back') update.colorsBack = side.colors;
          else { update.colorsFront = side.colors; update.color = side.color; } // het uitgeknipte stuk is betrouwbaarder
          update.colors = mergeFrontBack(update.colorsFront || fresh.colorsFront || fresh.colors, update.colorsBack || fresh.colorsBack);
        }
        await saveItem(update);
        done++;
      } catch (err) {
        console.warn('Uitknippen mislukt', err);
        // Geen internet (model nog niet binnen)? Dan niet als mislukt onthouden: bij de volgende start opnieuw.
        if (!navigator.onLine) continue;
        const fresh = itemFor(job);
        if (fresh) await saveItem({ ...fresh, [keyOf(job.side)]: 'mislukt' });
      }
    }
    running = false;
    showStatus();
    if (done) { toast(`${done} ${done === 1 ? 'stuk' : 'stukken'} uitgeknipt`); done = 0; }
    if (typeof rerenderKeepScroll === 'function' && looks.length) rerenderKeepScroll();
    if (typeof renderSettings === 'function' && !$('#tab-instellingen').classList.contains('hidden')) renderSettings();
  }

  // ---------- Direct knippen bij het toevoegen ----------
  // Het model stil op de achtergrond binnenhalen (de toestemming is al gegeven in de fototips).
  let preloading = null;
  const progressListeners = new Set();
  function preloadQuiet() {
    if (state.profile.cutoutReady) return Promise.resolve(true);
    if (!preloading) {
      preloading = (async () => {
        const parts = {};
        const progress = (key, current, total) => {
          parts[key] = [current, total];
          const [c, t] = Object.values(parts).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
          progressListeners.forEach(fn => fn(c, t));
        };
        try {
          const viaWorker = ask('preload', {}, progress);
          if (viaWorker) await viaWorker.catch(async () => { workerFailed = true; await (await loadLib()).preload({ ...CONFIG, progress }); });
          else await (await loadLib()).preload({ ...CONFIG, progress });
          state.profile.cutoutReady = true;
          state.profile.cutoutDeclined = false;
          await saveProfile();
          return true;
        } catch {
          preloading = null; // later opnieuw proberen
          return false;
        }
      })();
    }
    return preloading;
  }

  // Eén foto meteen uitknippen. Geeft { dataUrl, canvas } of null (geen model, geen internet, mislukt).
  // onProgress(binnen, totaal) in bytes, alleen zolang het model nog downloadt.
  async function cutNow(dataUrl, onProgress) {
    if (onProgress) progressListeners.add(onProgress);
    try {
      if (!(await preloadQuiet())) return null;
      return await cut(dataUrl);
    } catch {
      return null;
    } finally {
      if (onProgress) progressListeners.delete(onProgress);
    }
  }

  function enqueue(item) {
    if (!item) return;
    if (item.photo && !item.cutout) queue.push({ id: item.id, side: 'front' });
    if (item.photoBack && !item.cutoutBack) queue.push({ id: item.id, side: 'back' });
    run();
  }

  // De hele kast: alle stukken met een foto maar nog zonder uitgeknipte versie.
  // retry: ook stukken die eerder mislukten opnieuw proberen (alleen als je er zelf om vraagt).
  async function enqueueAll(retry = true) {
    ensureReady.force = retry;
    for (const i of state.items) {
      if (retry && i.cutout === 'mislukt') i.cutout = null;
      if (retry && i.cutoutBack === 'mislukt') i.cutoutBack = null;
      enqueue(i);
    }
    ensureReady.force = false;
  }

  return { enqueue, enqueueAll, cutNow, preloadQuiet, isBusy: () => running };
})();

// Snijdt de lege (doorzichtige) rand weg en verkleint naar max 700 px. Geeft null als er
// vrijwel niets over is (dan is het uitknippen mislukt).
function trimCutout(cv) {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = cv;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1, solid = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        solid++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || solid < (w * h) / 4 * 0.03) return null;
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const scale = Math.min(1, 700 / Math.max(cw, ch));
  const out = document.createElement('canvas');
  out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
  out.getContext('2d').drawImage(cv, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL('image/png'), canvas: out };
}
