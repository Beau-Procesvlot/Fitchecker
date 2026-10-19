// Je look als Instagram-story: je eigen spiegelselfie naast de look van de app,
// als twee polaroids op crème papier. Klaar om te delen (1080 × 1920).

let storyLook = null, storyBlob = null;

function openStory(look) {
  storyLook = look;
  storyBlob = null;
  $('#story-preview').classList.add('hidden');
  $('#story-intro').classList.remove('hidden');
  $('#story-photo').textContent = 'Foto kiezen of maken';
  $('#story-photo').classList.add('primary');
  $('#story-share').classList.add('hidden');
  $('#story-sheet').showModal();
}
$('#story-look').onclick = () => looks[activeLook] && openStory(looks[activeLook]);
$('#story-close').onclick = () => $('#story-sheet').close();
$('#story-photo').onclick = () => { $('#story-file').value = ''; $('#story-file').click(); };

$('#story-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('#story-photo').disabled = true;
  $('#story-photo').textContent = 'Story maken…';
  try {
    const url = URL.createObjectURL(file);
    const canvas = await drawStory(storyLook, url);
    URL.revokeObjectURL(url);
    storyBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92));
    $('#story-img').src = URL.createObjectURL(storyBlob);
    $('#story-preview').classList.remove('hidden');
    $('#story-intro').classList.add('hidden');
    $('#story-share').classList.remove('hidden');
    $('#story-photo').classList.remove('primary');
  } catch {
    toast('Deze foto lukte niet. Probeer een andere.');
  }
  $('#story-photo').disabled = false;
  $('#story-photo').textContent = storyBlob ? 'Andere foto' : 'Foto kiezen of maken';
};

$('#story-share').onclick = async () => {
  if (!storyBlob) return;
  const file = new File([storyBlob], `fitchecker-look-${today()}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch { /* geannuleerd */ }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(storyBlob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
};

// ---------- Tekenen ----------
const storyImage = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});
function drawCover(g, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}
function drawContain(g, img, x, y, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}

// Een polaroid met punaise, scheef opgeplakt. inside(g, x, y, w, h) tekent de foto.
async function drawPolaroid(g, { x, y, w, h, rot, caption, pin }, inside) {
  const pad = 24, foot = 118;
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate(rot * Math.PI / 180);
  g.translate(-w / 2, -h / 2);
  g.shadowColor = 'rgba(40, 25, 10, .28)'; g.shadowBlur = 36; g.shadowOffsetY = 14;
  g.fillStyle = '#fbf8f2';
  g.fillRect(0, 0, w, h);
  g.shadowColor = 'transparent';
  g.save();
  g.beginPath(); g.rect(pad, pad, w - pad * 2, h - pad - foot); g.clip();
  await inside(g, pad, pad, w - pad * 2, h - pad - foot);
  g.restore();
  g.fillStyle = '#2a2a2a'; g.font = '600 70px Caveat'; g.textAlign = 'center';
  g.fillText(caption, w / 2, h - 42);
  // punaise
  g.fillStyle = pin; g.beginPath(); g.arc(w / 2, 8, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(w / 2 - 5, 3, 6, 0, Math.PI * 2); g.fill();
  g.restore();
}

// De look zoals in de app: het personage, of de flat-lay met de uitgeknipte stukken.
async function drawLookInto(g, look, x, y, w, h) {
  g.fillStyle = '#efe9dd';
  g.fillRect(x, y, w, h);
  if (lookView(look.parts) === 'personage') {
    try {
      const fig = await composePersonage(look.parts);
      if (fig) { drawContain(g, fig, x + w * 0.08, y + h * 0.04, w * 0.84, h * 0.92); return; }
    } catch { /* geen personage: dan de flat-lay */ }
  }
  // Zelfde verhoudingen als de flat-lay in de app (smal en hoog).
  const fw = Math.min(w * 0.92, h * 0.6), fh = fw / 0.6;
  const fx = x + (w - fw) / 2, fy = y + (h - fh) / 2;
  const layers = [];
  const p = look.parts;
  if (p.full) layers.push(['full', FLATLAY.full, 2]);
  if (p.base && p.mid) layers.push(['base', FLATLAY.base, 2], ['mid', FLATLAY.mid, 4]);
  else layers.push(['base', FLATLAY.single, 2], ['mid', FLATLAY.single, 4]);
  layers.push(['bottom', FLATLAY.bottom, 1], ['shoes', FLATLAY.shoes, 5], ['acc', FLATLAY.acc, 6]);
  layers.sort((a, b) => a[2] - b[2]);
  for (const [slot, box] of layers) {
    const it = p[slot];
    if (!it) continue;
    const bx = fx + box.left / 100 * fw, by = fy + box.top / 100 * fh, bw = box.width / 100 * fw, bh = box.height / 100 * fh;
    g.save();
    g.translate(bx + bw / 2, by + bh / 2);
    g.rotate((seeded(it.id, 'f') * 10 - 5) * Math.PI / 180);
    const src = cutoutOf(it) || it.photo;
    if (src) {
      const img = await storyImage(src).catch(() => null);
      if (img) drawContain(g, img, -bw / 2, -bh / 2, bw, bh);
    } else {
      g.fillStyle = colorById(it.color).hex || '#888';
      g.fillRect(-bw * 0.35, -bh * 0.35, bw * 0.7, bh * 0.7);
    }
    g.restore();
  }
}

// Tekst over meerdere regels, gecentreerd.
function wrapLines(g, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function drawStory(look, photoUrl) {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  await document.fonts.ready;
  const photo = await storyImage(photoUrl);

  g.fillStyle = '#f3efe6';
  g.fillRect(0, 0, W, H);
  g.textAlign = 'center';

  // Kop
  g.fillStyle = '#8a8378'; g.font = '600 30px Inter';
  g.fillText('F I T C H E C K E R', W / 2, 250);
  g.fillStyle = '#1a1a1a'; g.font = '400 132px "DM Serif Display"';
  g.fillText('Fit van vandaag', W / 2, 390);
  const date = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  const sit = lookCtx?.label?.replace(/ · morgen$/, '').split(' / ')[0].toLowerCase();
  const weather = lookCtx?.weatherText?.split(' · ')[0];
  g.fillStyle = '#4a453d'; g.font = '600 58px Caveat';
  g.fillText([date, sit, weather].filter(Boolean).join(' · '), W / 2, 470);

  // De twee polaroids: ik en de app.
  const pin = colorById(Object.values(look.parts)[0]?.color || 'zwart').hex || '#1a1a1a';
  await drawPolaroid(g, { x: 60, y: 560, w: 490, h: 760, rot: -4, caption: 'ik', pin: '#c0392b' },
    (g, x, y, w, h) => drawCover(g, photo, x, y, w, h));
  await drawPolaroid(g, { x: 530, y: 600, w: 490, h: 760, rot: 3.5, caption: 'de app', pin },
    (g, x, y, w, h) => drawLookInto(g, look, x, y, w, h));

  // Wat je draagt
  const names = MAIN_ORDER.filter(s => look.parts[s]).map(s => itemTitle(look.parts[s]).toLowerCase());
  g.fillStyle = '#2a2a2a'; g.font = '600 56px Caveat';
  wrapLines(g, names.join(' · '), W - 160).slice(0, 3).forEach((line, i) => g.fillText(line, W / 2, 1460 + i * 66));

  // Voet: de boodschap en de afzender
  g.fillStyle = '#1a1a1a'; g.font = 'italic 400 76px "DM Serif Display"';
  g.fillText('Draag wat je hebt.', W / 2, H - 250);
  g.fillStyle = '#8a8378'; g.font = '500 32px Inter';
  g.fillText('fitchecker · een app van Zonde.', W / 2, H - 185);
  return c;
}
