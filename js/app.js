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
    renderStats(); if (state.alerts) showAlerts(state.alerts);
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
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) { showAlerts([{ level: 'error', code: 'load', msg: e.message || String(e) }]); return; }
    const c = document.createElement('canvas'), f = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
    state.srcGray = PA.toGray(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    state.workGray = state.srcGray; state.persp = null;
    state.loadNote = f < 1 ? { level: 'info', code: 'resized', a: `${bmp.width}×${bmp.height}`, b: `${c.width}×${c.height}` } : null;
    if (bmp.close) bmp.close();
    if (PA.hasRTL($('alphabet').value)) $('alphabet').dir = 'rtl';
    processImage();
  }

  // ---------- traitement ----------
  function opts() {
    return {
      mode: $('mode').value, method: $('method').value, alphabet: $('alphabet').value, black: +$('black').value, white: +$('white').value,
      thresh: $('threshAuto').checked ? null : +$('thresh').value, invert: $('invert').checked ? true : 'auto',
      despeckle: +$('despeckle').value, deskew: $('deskew').checked
    };
  }
  /** Messages clairs (erreur / avertissement / info) au lieu d'exceptions */
  function fmt(str, o) { return str.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? ''); }
  function showAlerts(list) {
    state.alerts = list; const box = $('alerts'); box.innerHTML = '';
    for (const w of list) { const d = document.createElement('div'); d.className = 'alert ' + w.level; d.textContent = fmt(tr(w.code === 'resized' ? 'resized' : 'w_' + w.code), w); box.append(d); }
  }
  let busy = false;
  async function processImage() {
    if (!state.workGray || busy) return;
    busy = true; setStatus(tr('working')); document.body.classList.add('busy-cursor'); $('sec-clean').classList.add('busy');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); // laisse l'interface afficher la progression
    const alerts = state.loadNote ? [state.loadNote] : [];
    try {
      state.run = PA.run(state.workGray, opts());
      const ex = state.run.extract, w = state.run.warnings;
      if ($('mode').value === 'auto' && ex.kind === 'free') alerts.push({ level: 'info', code: 'notFoundAuto' });
      alerts.push(...w);
      if (state.run.cleaned.thresh !== 'sauvola') { $('threshOut').textContent = state.run.cleaned.thresh; if ($('threshAuto').checked) $('thresh').value = state.run.cleaned.thresh; }
      else $('threshOut').textContent = 'Sauvola';
      const label = ex.kind === 'free' ? tr('freeFound') : ex.kind === 'none' ? '—' : tr('tplFound') + ' (' + ex.kind + ')';
      setStatus(`${label} — ${state.run.glyphs.length} ${tr('glyphsFound')}${ex.rtl ? ' — ' + tr('rtl') : ''}${state.run.cleaned.skew ? ` — deskew ${state.run.cleaned.skew}°` : ''}`);
      $('addSheet').disabled = !state.run.glyphs.length;
      drawViews(); rebuild();
    } catch (e) {
      console.warn(e); alerts.push({ level: 'error', code: 'crash', msg: e.message || String(e) }); setStatus('');
    } finally {
      busy = false; $('sec-clean').classList.remove('busy'); showAlerts(alerts);
    }
  }
  ['black', 'white', 'despeckle', 'deskew', 'invert', 'thresh', 'mode', 'method'].forEach(id => $(id).addEventListener('change', processImage));
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
    const fs = Math.max(14, ex.bin.w / 60);
    b.lineWidth = Math.max(2, ex.bin.w / 700); b.font = `bold ${fs}px system-ui`; b.textBaseline = 'bottom';
    ex.items.forEach((it, i) => {
      // vert = attribué, orange = peu plausible, rouge = sans caractère
      const c = it.comp, col = !it.key ? '#ff5a5a' : it.suspect ? '#ffa53a' : '#2fb8a8';
      if (!it.key) { b.fillStyle = '#ff5a5a33'; b.fillRect(c.x0 - 2, c.y0 - 2, c.x1 - c.x0 + 4, c.y1 - c.y0 + 4); }
      b.strokeStyle = state.pickItem === i ? '#3b82f6' : col; b.lineWidth = state.pickItem === i ? Math.max(4, ex.bin.w / 400) : Math.max(2, ex.bin.w / 700);
      b.strokeRect(c.x0 - 2, c.y0 - 2, c.x1 - c.x0 + 4, c.y1 - c.y0 + 4);
      // étiquette sur fond plein, lisible sur l'image
      const lab = it.key ? PA.labelOf(it.key) : '?', tw = b.measureText(lab).width + 8;
      b.fillStyle = col; b.fillRect(c.x0 - 2, c.y0 - 4 - fs, tw, fs + 2); b.fillStyle = '#0d0f13'; b.fillText(lab, c.x0 + 2, c.y0 - 3);
    });
    renderReview();
  }
  /** Barre de vérification : prochaine boîte douteuse + caractères non trouvés */
  function needsReview() { return state.run ? state.run.extract.items.map((it, i) => [it, i]).filter(([it]) => !it.key || it.suspect).map(([, i]) => i) : []; }
  function renderReview() {
    const ex = state.run && state.run.extract; $('review').hidden = !ex || ex.kind !== 'free';
    if (!ex) return;
    const n = needsReview().length; $('nextReview').textContent = n ? fmt(tr('nextReview'), { n }) : tr('allReviewed'); $('nextReview').disabled = !n;
    const used = new Set(ex.items.map(it => it.key).filter(Boolean));
    const miss = Array.from($('alphabet').value.replace(/\s+/g, '')).filter(ch => !used.has(ch));
    const chips = $('missingChips'); chips.innerHTML = '';
    if (miss.length) { const l = document.createElement('span'); l.className = 'lab'; l.textContent = tr('missingLab'); chips.append(l); }
    for (const ch of miss) { const bt = document.createElement('button'); bt.textContent = ch; bt.onclick = () => { if (state.pickItem != null) reassign(ch); else openBox(needsReview()[0], ch); }; chips.append(bt); }
  }
  $('nextReview').onclick = () => { const l = needsReview(); if (l.length) openBox(l[0]); };
  /** Éditeur flottant posé sur la boîte : on tape le caractère, Entrée = valider et passer à la suivante */
  function openBox(i, preset) {
    if (i == null || !state.run) return; const it = state.run.extract.items[i]; if (!it) return;
    state.pickItem = i; drawViews();
    const cv = $('binCanvas'), r = cv.getBoundingClientRect(), vr = $('binView').getBoundingClientRect(), k = r.width / cv.width;
    const ed = $('boxEdit'); ed.hidden = false;
    let left = r.left - vr.left + it.comp.x0 * k, top = r.top - vr.top + (it.comp.y1 + 6) * k;
    left = Math.max(0, Math.min(left, vr.width - 170)); if (top > vr.height - 44) top = r.top - vr.top + it.comp.y0 * k - 46;
    ed.style.left = left + 'px'; ed.style.top = Math.max(0, top) + 'px';
    $('boxInput').value = preset ?? (it.key || ''); $('boxInput').focus(); $('boxInput').select();
  }
  function closeBox() { $('boxEdit').hidden = true; state.pickItem = null; drawViews(); }
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
  /** « Assigner depuis l'image » : le prochain clic sur une boîte lui donne ce caractère */
  function startAssign(k) {
    if (!state.run) { setStatus(tr('noImage')); return; }
    state.assignTarget = k; setStatus(fmt(tr('pickBoxFor'), { k })); $('binView').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('binCanvas').addEventListener('click', e => {
    if (!state.run) return; const [x, y] = canvasPoint($('binCanvas'), e);
    const items = state.run.extract.items;
    // la plus petite boîte qui contient le clic (les signes fusionnés agrandissent les boîtes)
    let best = -1, ba = Infinity;
    items.forEach((it, i) => { const c = it.comp; if (x >= c.x0 - 4 && x <= c.x1 + 4 && y >= c.y0 - 4 && y <= c.y1 + 4) { const a = (c.x1 - c.x0) * (c.y1 - c.y0); if (a < ba) { ba = a; best = i; } } });
    if (best >= 0 && state.assignTarget) { const k = state.assignTarget; state.assignTarget = null; state.pickItem = best; reassign(k); return; }
    if (best >= 0) openBox(best); else closeBox();
  });
  function reassign(val) {
    const ex = state.run.extract, i = state.pickItem, it = ex.items[i]; if (!it) return;
    // un même caractère ne peut désigner qu'une boîte : l'ancienne perd son attribution
    if (val) ex.items.forEach((o, j) => { if (j !== i && o.key === val) { o.key = null; o.suspect = true; } });
    it.key = val || null; it.suspect = false; it.manual = true;
    if (ex.kind === 'free') PA.assignBaselines(ex.items);
    state.run.glyphs = ex.items.filter(t => t.key).map(t => Object.assign(PA.vectorize(ex.bin, t), { suspect: !!t.suspect }));
    const next = needsReview().find(j => j > i) ?? needsReview()[0];
    rebuild();
    if (next != null) openBox(next); else closeBox();
  }
  $('boxOk').onclick = () => reassign($('boxInput').value.trim());
  $('boxNone').onclick = () => reassign(null);
  $('boxInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); reassign($('boxInput').value.trim()); }
    else if (e.key === 'Escape') closeBox();
  });

  // ---------- construction ----------
  function tracedSet() { const T = Object.assign({}, state.committed); if (state.run) for (const g of state.run.glyphs) T[g.key] = g; return T; }
  let timer = null; const rebuildSoon = () => { clearTimeout(timer); timer = setTimeout(rebuild, 120); };
  function rebuild() {
    const T = tracedSet(), list = Object.values(T);
    if (!list.length) { state.G = {}; renderGrid(); renderStats(); return; }
    state.metrics = state.settings.metrics || PA.detectMetrics(list);
    state.analysis = PA.analyseStructure(list, state.metrics) || state.settings.analysis || null;
    const G = Object.assign({}, T);
    try { PA.synthesize(G, state.metrics, state.analysis); }
    catch (e) { console.warn(e); showAlerts([...(state.alerts || []), { level: 'error', code: 'crash', msg: e.message }]); }
    state.G = G;
    state.famCache = {}; famInvalidate();
    Object.assign(state.settings, { kerning: $('kerning').checked, family: $('family').value || 'Ma Police', style: $('style').value || 'Regular', version: $('version').value || '1.000', spacing: +$('spacing').value / 100, tracking: +$('tracking').value });
    try { const built = PA.buildFont(G, state.metrics, state.settings, state.analysis); state.font = built.font; state.built = built; state.otf = PA.fontBinary(built); }
    catch (e) { console.warn(e); showAlerts([...(state.alerts || []), { level: 'error', code: 'crash', msg: e.message }]); return; }
    // validation : relecture de l'OTF
    try { const re = opentype.parse(state.otf); $('valid').textContent = `✓ ${tr('statusBuilt')} : ${re.glyphs.length} glyphes, ${tr('valid')}.`; }
    catch (e) { $('valid').textContent = '⚠ ' + e.message; }
    loadPreviewFont(); renderGrid(); renderStats(); renderEditor();
    ['dlOTF', 'dlWOFF', 'dlJSON', 'famPreview', 'famExport'].forEach(id => $(id).disabled = false);
    renderFamBase();
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
    ctx.fillStyle = COL[g.source] || '#fff'; ctx.fill('nonzero');
  }
  // couleurs de la grille (identiques à la légende) : tracé = crème, dérivé = bleu, généré = gris
  const COL = { traced: '#f3efe6', derived: '#7fa8ff', generated: '#7b8494' };
  function renderGrid() {
    const grid = $('grid'); grid.innerHTML = '';
    const keys = Object.keys(state.G), n = { traced: 0, derived: 0, generated: 0 };
    const order = [...PA.REQUIRED, ...PA.FRENCH, ...PA.KABYLE, 'ɛ', 'ɣ', ...PA.UPPER_EXTRA, ...PA.ARABIC_SHEET, 'لا.fina'];
    keys.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    // cases attendues mais absentes : affichées explicitement « manquant »
    const hasAr = keys.some(PA.isArabicKey), expectedKeys = [...PA.LATIN_SHEET, ...(hasAr ? PA.ARABIC_SHEET : [])];
    const all = [...keys, ...expectedKeys.filter(k => !state.G[k])];
    all.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    for (const k of all) {
      const g = state.G[k], d = document.createElement('div');
      if (!g) {
        d.className = 'cell missing'; d.title = `${k} — ${tr('missing')}`;
        d.innerHTML = `<div class="miss">${tr('missing')}</div><div class="k"></div>`; d.querySelector('.k').textContent = PA.labelOf(k);
        const bt = document.createElement('button'); bt.className = 'mini-btn'; bt.textContent = tr('assignFromImage'); bt.onclick = ev => { ev.stopPropagation(); startAssign(k); }; d.append(bt);
        grid.append(d); continue;
      }
      n[g.source]++;
      d.className = 'cell ' + g.source + (g.suspect ? ' suspect' : '') + (state.selected === k ? ' sel' : ''); d.title = `${k} — ${tr(g.source)}${g.from ? ' (' + g.from + ')' : ''}`;
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 72; drawGlyph(cv, g, false);
      d.append(cv); const lab = document.createElement('div'); lab.className = 'k'; lab.innerHTML = `<i class="dot ${g.source}"></i>`; lab.append(PA.labelOf(k)); d.append(lab);
      d.onclick = () => { state.selected = k; renderGrid(); renderEditor(); };
      grid.append(d);
    }
    $('counts').innerHTML = keys.length ? `${keys.length} glyphes — <i class="dot traced"></i>${tr('traced')} ${n.traced} · <i class="dot derived"></i>${tr('derived')} ${n.derived} · <i class="dot generated"></i>${tr('generated')} ${n.generated}` : '';
    if (keys.length && n.traced < 10) $('counts').innerHTML += ` — <b class="warnTxt">${tr('fewTraced')}</b>`;
  }
  function renderEditor() {
    const k = state.selected, g = state.G[k]; $('editor').hidden = !g; if (!g) return;
    const a = state.settings.adjust[k] || {};
    $('edKey').textContent = `« ${PA.labelOf(k)} »  U+${(PA.glyphInfo(k).unicodes[0] || 0).toString(16).toUpperCase()}`;
    $('edSrc').textContent = `${tr(g.source)}${g.from ? ' — ' + g.from : ''}`;
    $('edAssign').textContent = tr('assignFromImage'); $('edAssign').onclick = () => startAssign(k);
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
  // ---------- famille de styles ----------
  const famDefault = ['Light', 'Regular', 'Bold', 'Black'];
  PA.WEIGHTS.forEach((w, i) => {
    const l = document.createElement('label'); l.className = 'chk';
    l.innerHTML = `<input type="checkbox" value="${i}" ${famDefault.includes(w.name) ? 'checked' : ''}> ${w.name} <small>${w.cls}</small>`;
    $('famWeights').append(l);
  });
  function famInvalidate() { state.famStyles = null; $('famList').innerHTML = ''; $('famStatus').textContent = ''; }
  function renderFamBase() {
    if (!state.metrics) return; state.famBase = PA.detectWeight(state.analysis, state.metrics);
    $('famBase').textContent = fmt(tr('famBase'), { w: state.famBase.name, p: Math.round(state.famBase.ratio * 100) });
  }
  const famSel = () => [...$('famWeights').querySelectorAll('input:checked')].map(i => +i.value).flatMap(wi => $('famItalic').checked ? [[wi, false], [wi, true]] : [[wi, false]]);
  async function generateFamily() {
    if (state.famStyles) return state.famStyles;
    const sel = famSel(); if (!sel.length) { $('famStatus').textContent = tr('famNone'); return []; }
    const out = []; document.body.classList.add('busy-cursor');
    try {
      for (const [i, [wi, it]] of sel.entries()) {
        $('famStatus').textContent = `${tr('working')} ${i + 1}/${sel.length} — ${PA.WEIGHTS[wi].name}${it ? ' Italic' : ''}`;
        await new Promise(r => setTimeout(r, 15));
        const st = PA.buildStyle(state.G, state.metrics, state.analysis, state.settings, wi, it, state.famBase, state.famCache);
        const bin = PA.fontBinary(st.built); opentype.parse(bin); // relecture = validation
        out.push({ info: st.info, bin, limited: st.limited });
      }
    } catch (e) { console.warn(e); showAlerts([...(state.alerts || []), { level: 'error', code: 'crash', msg: e.message }]); return []; }
    finally { document.body.classList.remove('busy-cursor'); }
    state.famStyles = out; $('famStatus').textContent = fmt(tr('famDone'), { n: out.length });
    return out;
  }
  async function previewFamily() {
    const styles = await generateFamily(); $('famList').innerHTML = '';
    const sample = ($('preview').value.split('\n')[0] || '').slice(0, 60) || 'Hamburgefonstiv 0123';
    for (const s of styles) {
      const name = 'PAFam' + (++state.faceN), face = new FontFace(name, s.bin.slice(0));
      try { await face.load(); document.fonts.add(face); } catch (e) { console.warn(e); continue; }
      const row = document.createElement('div'); row.className = 'famRow';
      const lab = document.createElement('span'); lab.className = 'famLab'; lab.title = s.limited.join(' '); lab.textContent = s.info.typoSub + ' · ' + s.info.weightClass + (s.limited.length ? ' · ' + fmt(tr('famLimited'), { n: s.limited.length }) : '');
      const txt = document.createElement('div'); txt.className = 'famTxt'; txt.style.fontFamily = `"${name}", "Adobe Blank"`; txt.textContent = sample;
      row.append(lab, txt); $('famList').append(row);
    }
  }
  $('famPreview').onclick = previewFamily;
  $('famWeights').addEventListener('change', famInvalidate); $('famItalic').addEventListener('change', famInvalidate);
  $('kerning').addEventListener('change', rebuildSoon);
  $('famExport').onclick = async () => {
    const styles = await generateFamily(); if (!styles.length) return;
    const deflate = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    const files = [];
    for (const s of styles) {
      files.push({ name: `OTF/${s.info.ps}.otf`, data: s.bin });
      try { files.push({ name: `WOFF/${s.info.ps}.woff`, data: await PA.toWOFF(s.bin, deflate) }); } catch (e) { console.warn(e); }
    }
    files.push({ name: 'LISEZMOI.txt', data: new TextEncoder().encode(tr('famReadme')) });
    download(new Blob([PA.makeZip(files)], { type: 'application/zip' }), fileBase().replace(/-[^-]*$/, '') + '-famille.zip');
  };

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
