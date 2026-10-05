// Achtergrond-werker voor het uitknippen. Het AI-model rekent hier, los van de rest van de app,
// zodat het scherm niet bevriest terwijl er een stuk wordt uitgeknipt.
import * as lib from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm';

const CONFIG = { model: 'isnet_quint8', output: { format: 'image/png' } };

self.onmessage = async e => {
  const { id, type, blob } = e.data;
  try {
    if (type === 'preload') {
      await lib.preload({
        ...CONFIG,
        progress: (key, current, total) => self.postMessage({ id, type: 'progress', key, current, total }),
      });
      self.postMessage({ id, type: 'done' });
    } else if (type === 'cut') {
      const remove = lib.removeBackground || lib.default;
      const out = await remove(blob, CONFIG);
      self.postMessage({ id, type: 'done', blob: out });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err?.message || err) });
  }
};
