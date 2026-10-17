/* Police Atelier — app.js : interface (glisser-déposer, réglages, attribution,
 * grille de glyphes, éditeur, aperçu FontFace, exports). Tout est local. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {
    lang: 'fr', tif: false, srcGray: null, workGray: null, run: null,
    committed: {},          // glyphes tracés des feuilles déjà ajoutées
    G: {}, metrics: null, analysis: null, font: null, otf: null,
    settings: { adjust: {} }, selected: null, persp: null, pick: null, faceN: 0
  };

  // ---------- langue ----------
  function applyLang() {
    document.documentElement.lang = state.lang === 'kab' ? 'kab' : state.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = PA.t(state.lang, el.dataset.i18n, state.tif); });
    document.querySelectorAll('.langs button').forEach(b => b.classList.toggle('on', b.dataset.lang === state.lang));
    if (!$('preview').dataset.touched) $('preview').value = PA.t(state.lang, 'previewText', false);
    renderStats();
  }
  document.querySelectorAll('.langs button').forEach(b => b.onclick = () => { state.lang = b.dataset.lang; applyLang(); });
  $('tif').onchange = e => { state.tif = e.target.checked; applyLang(); };
  const tr = k => PA.t(state.lang, k, state.tif);

  // ---------- modèles ----------
  document.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
    const c = document.createElement('canvas'); c.width = PA.SHEET.W; c.height = PA.SHEET.H;
    PA.drawTemplate(c.getContext('2d'), b.dataset.tpl);
    const name = `police-atelier-planche-${b.dataset.tpl}`;
    if (b.dataset.fmt === 'png') c.toBlob(bl => download(bl, name + '.png'), 'image/png');
    else c.toBlob(async bl => { const j = new Uint8Array(await bl.arrayBuffer()); download(PA.jpegToPDF(j, c.width, c.height), name + '.pdf'); }, 'image/jpeg', 0.92);
  });
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }

  // ---------- chargement ----------
  const drop = $('drop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') $('file').click(); });
  $('file').onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; };

  async function loadFile(file) {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas'), f = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    state.srcGray = PA.toGray(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    state.workGray = state.srcGray; state.persp = null;
    if (PA.hasRTL($('alphabet').value)) $('alphabet').dir = 'rtl';
    processImage();
  }

  // ---------- traitement ----------
  function opts() {
    return {
      mode: $('mode').value, alphabet: $('alphabet').value, black: +$('black').value, white: +$('white').value,
      thresh: $('threshAuto').checked ? null : +$('thresh').value, invert: $('invert').checked ? true : 'auto',
      despeckle: +$('despeckle').value, deskew: $('deskew').checked
    };
  }
  function processImage() {
    if (!state.workGray) return;
    try { state.run = PA.run(state.workGray, opts()); }
    catch (e) { setStatus(e.message === 'template-not-found' ? tr('notFound') : String(e)); return; }
    $('threshOut').textContent = state.run.cleaned.thresh; if ($('threshAuto').checked) $('thresh').value = state.run.cleaned.thresh;
    const ex = state.run.extract;
    setStatus(`${ex.kind === 'free' ? tr('freeFound') : tr('tplFound') + ' (' + ex.kind + ')'} — ${state.run.glyphs.length} ${tr('glyphsFound')}${ex.rtl ? ' — ' + tr('rtl') : ''}${state.run.cleaned.skew ? ` — deskew ${state.run.cleaned.skew}°` : ''}`);
    $('addSheet').disabled = false;
    drawViews(); rebuild();
  }
  ['black', 'white', 'despeckle', 'deskew', 'invert', 'thresh', 'mode'].forEach(id => $(id).addEventListener('change', processImage));
  $('threshAuto').onchange = e => { $('thresh').disabled = e.target.checked; processImage(); };
  $('alphabet').addEventListener('change', () => { $('alphabet').dir = PA.hasRTL($('alphabet').value) ? 'rtl' : 'ltr'; processImage(); });
  $('rerun').onclick = processImage;
  $('addSheet').onclick = () => { // fige les glyphes de cette image ; la prochaine image s'ajoute
    if (!state.run) return; for (const g of state.run.glyphs) state.committed[g.key] = g;
    state.run = null; $('addSheet').disabled = true; setStatus('✓'); rebuild();
  };
  function setStatus(s) { $('status').textContent = s; }

  // ---------- vues ----------
  function grayToCanvas(cv, img, binary) {
    cv.width = img.w; cv.height = img.h; const ctx = cv.getContext('2d'), id = ctx.createImageData(img.w, img.h);
    for (let i = 0; i < img.data.length; i++) { const v = binary ? (img.data[i] ? 20 : 235) : img.data[i]; id.data[4 * i] = id.data[4 * i + 1] = id.data[4 * i + 2] = v; id.data[4 * i + 3] = 255; }
    ctx.putImageData(id, 0, 0); return ctx;
  }
  function drawViews() {
    const ctx = grayToCanvas($('srcCanvas'), state.workGray, false);
    if (state.pick) { ctx.fillStyle = '#ffb347'; state.pick.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); }); }
    if (!state.run) return;
    const ex = state.run.extract, b = grayToCanvas($('binCanvas'), ex.bin, true);
    b.lineWidth = Math.max(1.5, ex.bin.w / 800); b.font = `${Math.max(12, ex.bin.w / 70)}px system-ui`;
    ex.items.forEach((it, i) => {
      const c = it.comp, gen = it.key ? '#5ad1c4' : '#ff6b6b';
      b.strokeStyle = state.pickItem === i ? '#ffb347' : gen; b.strokeRect(c.x0 - 2, c.y0 - 2, c.x1 - c.x0 + 4, c.y1 - c.y0 + 4);
      b.fillStyle = gen; b.fillText(it.key ? PA.labelOf(it.key) : '?', c.x0, c.y0 - 4);
    });
  }
  const canvasPoint = (cv, e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };

  // perspective : 4 clics (haut-gauche, haut-droit, bas-droit, bas-gauche)
  $('perspBtn').onclick = () => { if (!state.srcGray) return; state.workGray = state.srcGray; state.pick = []; drawViews(); };
  $('perspReset').onclick = () => { state.pick = null; state.workGray = state.srcGray; processImage(); };
  $('srcCanvas').addEventListener('click', e => {
    if (!state.pick) return; state.pick.push(canvasPoint($('srcCanvas'), e)); drawViews();
    if (state.pick.length === 4) {
      const p = state.pick, d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const W = Math.round(Math.max(d(p[0], p[1]), d(p[3], p[2]))), H = Math.round(Math.max(d(p[0], p[3]), d(p[1], p[2])));
      state.workGray = PA.warpPerspective(state.srcGray, p, W, H, 255); state.pick = null; processImage();
    }
  });
  // attribution manuelle
  $('binCanvas').addEventListener('click', e => {
    if (!state.run) return; const [x, y] = canvasPoint($('binCanvas'), e);
    const i = state.run.extract.items.findIndex(it => x >= it.comp.x0 - 3 && x <= it.comp.x1 + 3 && y >= it.comp.y0 - 3 && y <= it.comp.y1 + 3);
    if (i < 0) return; state.pickItem = i; $('assign').hidden = false; $('assignInput').value = state.run.extract.items[i].key || ''; $('assignInput').focus(); drawViews();
  });
  function reassign(val) {
    const ex = state.run.extract, it = ex.items[state.pickItem]; if (!it) return;
    it.key = val || null; $('assign').hidden = true; state.pickItem = null;
    if (ex.kind === 'free') PA.assignBaselines(ex.items);
    state.run.glyphs = ex.items.filter(t => t.key).map(t => PA.vectorize(ex.bin, t));
    drawViews(); rebuild();
  }
  $('assignOk').onclick = () => reassign($('assignInput').value.trim());
  $('assignInput').addEventListener('keydown', e => { if (e.key === 'Enter') reassign($('assignInput').value.trim()); });
  $('assignIgnore').onclick = () => reassign(null);

  // ---------- construction ----------
  function tracedSet() { const T = Object.assign({}, state.committed); if (state.run) for (const g of state.run.glyphs) T[g.key] = g; return T; }
  let timer = null; const rebuildSoon = () => { clearTimeout(timer); timer = setTimeout(rebuild, 120); };
  function rebuild() {
    const T = tracedSet(), list = Object.values(T);
    if (!list.length) { state.G = {}; renderGrid(); renderStats(); return; }
    state.metrics = state.settings.metrics || PA.detectMetrics(list);
    state.analysis = PA.analyseStructure(list, state.metrics) || state.settings.analysis || null;
    const G = Object.assign({}, T);
    PA.synthesize(G, state.metrics, state.analysis);
    state.G = G;
    Object.assign(state.settings, { family: $('family').value || 'Ma Police', style: $('style').value || 'Regular', version: $('version').value || '1.000', spacing: +$('spacing').value / 100, tracking: +$('tracking').value });
    const { font } = PA.buildFont(G, state.metrics, state.settings, state.analysis);
    state.font = font; state.otf = font.toArrayBuffer();
    // validation : relecture de l'OTF
    try { const re = opentype.parse(state.otf); $('valid').textContent = `✓ ${tr('statusBuilt')} : ${re.glyphs.length} glyphes, ${tr('valid')}.`; }
    catch (e) { $('valid').textContent = '⚠ ' + e.message; }
    loadPreviewFont(); renderGrid(); renderStats(); renderEditor();
    ['dlOTF', 'dlWOFF', 'dlJSON'].forEach(id => $(id).disabled = false);
  }
  async function loadPreviewFont() {
    const name = 'PAPreview' + (++state.faceN);
    try {
      const face = new FontFace(name, state.otf.slice(0)); await face.load();
      document.fonts.add(face); if (state.face) document.fonts.delete(state.face); state.face = face;
      $('preview').style.fontFamily = `"${name}", system-ui`; window.__paFontName = name;
    } catch (e) { $('valid').textContent += ' ⚠ FontFace : ' + e.message; }
  }
  ['spacing', 'tracking', 'family', 'style', 'version'].forEach(id => $(id).addEventListener('input', rebuildSoon));
  $('psize').oninput = e => $('preview').style.fontSize = e.target.value + 'px';
  $('preview').addEventListener('input', () => $('preview').dataset.touched = '1');

  // ---------- grille & éditeur ----------
  function drawGlyph(cv, g, guides) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, m = state.metrics; ctx.clearRect(0, 0, W, H);
    const top = Math.max(m.ascender, g.bbox.yMax) + 60, bot = Math.min(m.descender, g.bbox.yMin) - 40, s = H / (top - bot);
    const a = state.settings.adjust[g.key] || {}, sc = a.scale ?? 1;
    const ox = W / 2 - ((g.bbox.xMax + g.bbox.xMin) / 2) * s * sc;
    const X = x => ox + x * s * sc, Y = y => (top - (y * sc + (a.dy || 0))) * s;
    if (guides) { ctx.strokeStyle = '#2c3340'; ctx.lineWidth = 1; for (const y of [0, m.xHeight, m.capHeight, m.descender, m.ascender]) { ctx.beginPath(); ctx.moveTo(0, (top - y) * s); ctx.lineTo(W, (top - y) * s); ctx.stroke(); } }
    ctx.beginPath();
    for (const c of g.contours) { if (!c.length) continue; ctx.moveTo(X(c[0][0]), Y(c[0][1])); for (const q of c) ctx.bezierCurveTo(X(q[2]), Y(q[3]), X(q[4]), Y(q[5]), X(q[6]), Y(q[7])); ctx.closePath(); }
    ctx.fillStyle = g.source === 'generated' ? '#ff8f8f' : g.source === 'derived' ? '#b7c5ff' : '#ece8df'; ctx.fill('nonzero');
  }
  function renderGrid() {
    const grid = $('grid'); grid.innerHTML = '';
    const keys = Object.keys(state.G), n = { traced: 0, derived: 0, generated: 0 };
    const order = [...PA.REQUIRED, ...PA.FRENCH, ...PA.KABYLE, 'ɛ', 'ɣ', ...PA.UPPER_EXTRA, ...PA.ARABIC_SHEET, 'لا.fina'];
    keys.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    for (const k of keys) {
      const g = state.G[k]; n[g.source]++;
      const d = document.createElement('div'); d.className = 'cell ' + g.source + (state.selected === k ? ' sel' : ''); d.title = `${k} — ${tr(g.source)}${g.from ? ' (' + g.from + ')' : ''}`;
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 72; drawGlyph(cv, g, false);
      d.append(cv); const lab = document.createElement('div'); lab.className = 'k'; lab.textContent = PA.labelOf(k) + (g.source !== 'traced' ? ' •' : ''); d.append(lab);
      d.onclick = () => { state.selected = k; renderGrid(); renderEditor(); };
      grid.append(d);
    }
    $('counts').textContent = keys.length ? `${keys.length} glyphes — ${tr('traced')} ${n.traced} · ${tr('derived')} ${n.derived} · ${tr('generated')} ${n.generated}` : '';
  }
  function renderEditor() {
    const k = state.selected, g = state.G[k]; $('editor').hidden = !g; if (!g) return;
    const a = state.settings.adjust[k] || {};
    $('edKey').textContent = `« ${PA.labelOf(k)} »  U+${(PA.glyphInfo(k).unicodes[0] || 0).toString(16).toUpperCase()}`;
    $('edSrc').textContent = `${tr(g.source)}${g.from ? ' — ' + g.from : ''}`;
    $('edDy').value = a.dy || 0; $('edScale').value = Math.round((a.scale ?? 1) * 100); $('edLsb').value = a.lsb || 0; $('edRsb').value = a.rsb || 0;
    drawGlyph($('glyphCanvas'), g, true);
  }
  [['edDy', 'dy', 1], ['edScale', 'scale', 0.01], ['edLsb', 'lsb', 1], ['edRsb', 'rsb', 1]].forEach(([id, key, f]) => $(id).addEventListener('input', e => {
    const k = state.selected; if (!k) return; const a = state.settings.adjust[k] = state.settings.adjust[k] || {}; a[key] = +e.target.value * f;
    drawGlyph($('glyphCanvas'), state.G[k], true); rebuildSoon();
  }));

  function renderStats() {
    const s = state.analysis, m = state.metrics, dl = (id, rows) => { $(id).innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(''); };
    if (!m) { dl('stats', []); dl('metrics', []); return; }
    dl('stats', s ? [[tr('weight'), `${s.weight} ${tr('units')}`], [tr('contrast'), `${s.contrast} (${s.thin}–${s.thick})`], [tr('slant'), `${s.slant}°`], [tr('xratio'), s.xRatio], [tr('serif'), s.serif == null ? '—' : (s.serif ? tr('yes') : tr('no')) + ` (${s.serifVotes})`]] : []);
    dl('metrics', [['unitsPerEm', 1000], ['Cap height', m.capHeight], ['x-height', m.xHeight], ['Ascender', m.ascender], ['Descender', m.descender]]);
  }

  // ---------- export ----------
  const fileBase = () => (state.settings.family || 'police').replace(/[^\w-]+/g, '') + '-' + (state.settings.style || 'Regular').replace(/[^\w-]+/g, '');
  $('dlOTF').onclick = () => download(new Blob([state.otf], { type: 'font/otf' }), fileBase() + '.otf');
  $('dlWOFF').onclick = async () => {
    const deflate = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    download(new Blob([await PA.toWOFF(state.otf, deflate)], { type: 'font/woff' }), fileBase() + '.woff');
  };
  $('dlJSON').onclick = () => {
    const traced = Object.values(tracedSet()).map(g => ({ key: g.key, contours: g.contours.map(c => c.map(s => s.map(v => Math.round(v * 10) / 10))) }));
    const proj = { app: 'police-atelier', format: 1, settings: Object.assign({}, state.settings, { metrics: state.metrics, analysis: state.analysis }), glyphs: traced };
    download(new Blob([JSON.stringify(proj)], { type: 'application/json' }), fileBase() + '.json');
  };
  $('openJSON').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const p = JSON.parse(await f.text());
    state.committed = {}; for (const g of p.glyphs) { const r = { key: g.key, contours: g.contours, source: 'traced' }; r.bbox = PA.bboxOf(r.contours); state.committed[g.key] = r; }
    state.settings = Object.assign({ adjust: {} }, p.settings); state.run = null;
    $('family').value = state.settings.family || ''; $('style').value = state.settings.style || ''; $('version').value = state.settings.version || '1.000';
    $('spacing').value = Math.round((state.settings.spacing ?? 1) * 100); $('tracking').value = state.settings.tracking || 0;
    rebuild(); e.target.value = '';
  };
  $('resetAll').onclick = () => { state.committed = {}; state.run = null; state.settings = { adjust: {} }; state.selected = null; state.srcGray = state.workGray = null; rebuild(); setStatus(tr('noImage')); };

  window.PAApp = { state, loadFile, processImage, rebuild };
  applyLang();
})();
