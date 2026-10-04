// Opslag in de browser (IndexedDB). Foto's zijn te groot voor localStorage.
// Als de browser opslag blokkeert, werkt alles in het geheugen en waarschuwt de app.

const DB = (() => {
  const mem = { items: new Map(), meta: new Map() };

  const ready = new Promise(resolve => {
    let done = false;
    const finish = db => { if (!done) { done = true; resolve(db); } };
    try {
      const req = indexedDB.open('kledingkast', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => finish(req.result);
      req.onerror = () => finish(null);
    } catch { finish(null); }
    setTimeout(() => finish(null), 4000);
  });

  async function run(store, mode, fn) {
    const db = await ready;
    if (!db) return fn(memStore(store));
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }

  // Zelfde vorm als een IndexedDB-store, maar dan in het geheugen.
  function memStore(name) {
    const m = mem[name];
    return {
      getAll: () => [...m.values()],
      get: key => m.get(key),
      put: (val, key) => m.set(key ?? val.id, val),
      delete: key => m.delete(key),
    };
  }

  return {
    persistent: ready.then(db => !!db),
    allItems: () => run('items', 'readonly', s => s.getAll()),
    putItem: item => run('items', 'readwrite', s => s.put(item)),
    deleteItem: id => run('items', 'readwrite', s => s.delete(id)),
    getMeta: key => run('meta', 'readonly', s => s.get(key)),
    setMeta: (key, val) => run('meta', 'readwrite', s => s.put(val, key)),
  };
})();
