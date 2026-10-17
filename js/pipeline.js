/* Police Atelier — pipeline.js
 * Enchaîne : nettoyage -> (planche modèle | texte libre) -> segmentation ->
 * attribution -> vectorisation -> normalisation en unités (unitsPerEm 1000). */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** Nettoyage : niveaux -> aplatissement de l'éclairage (fond divisé) -> seuil.
   *  opts: black, white, method ('otsu'|'sauvola'), thresh (manuel), invert ('auto'|bool), despeckle */
  function clean(gray, opts = {}) {
    const lv = PA.levels(gray, opts.black ?? 0, opts.white ?? 255);
    const block = Math.max(32, Math.round(Math.max(gray.w, gray.h) / 22));
    const g = PA.flatten(lv, block, opts.invert ?? 'auto'); // encre sombre sur blanc, éclairage uniforme
    let t = null, bin;
    if (opts.thresh != null) { t = opts.thresh; bin = PA.threshold(g, t, false); }
    else if (opts.method === 'sauvola') { bin = PA.sauvola(g, Math.max(15, Math.round(Math.min(g.w, g.h) / 25) | 1), 0.25); t = 'sauvola'; }
    else { t = Math.max(60, Math.min(185, PA.otsu(g))); bin = PA.threshold(g, t, false); }
    const minA = opts.despeckle ?? Math.max(3, Math.round(gray.w * gray.h / 400000));
    bin = PA.despeckle(bin, minA);
    return { gray: g, bin, thresh: t, numThresh: typeof t === 'number' ? t : 150, inverted: false, sourceInverted: g.inverted, skew: 0 };
  }
  function deskew(cleaned) {
    const skew = PA.estimateSkew(cleaned.bin);
    if (Math.abs(skew) < 0.5) return cleaned;
    const g = PA.rotate(cleaned.gray, -skew, 255);
    return Object.assign({}, cleaned, { gray: g, bin: PA.threshold(g, cleaned.numThresh, false), skew });
  }

  /** Repère les 4 marques d'angle -> coins [TL,TR,BR,BL] (centres) ou null.
   *  Teste les combinaisons de candidats carrés pleins et garde le plus grand
   *  quadrilatère convexe dont les proportions correspondent à la planche. */
  function detectTemplate(bin) {
    // travail à basse résolution pour la vitesse
    const f = Math.max(1, Math.max(bin.w, bin.h) / 1200), small = f > 1 ? downBin(bin, f) : bin;
    const big = Math.max(small.w, small.h);
    const cand = PA.components(small).filter(c => {
      const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, r = w / h;
      return w > big * 0.012 && w < big * 0.09 && r > 0.6 && r < 1.65 && c.area / (w * h) > 0.72;
    }).sort((a, b) => b.area - a.area).slice(0, 14);
    if (cand.length < 4) return null;
    const S = PA.SHEET, mc = markerCenters(), ratio = (mc[3][1] - mc[0][1]) / (mc[1][0] - mc[0][0]);
    const ctr = c => [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2];
    let best = null, bestA = 0;
    for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) for (let c = b + 1; c < cand.length; c++) for (let d = c + 1; d < cand.length; d++) {
      const set = [cand[a], cand[b], cand[c], cand[d]], sizes = set.map(q => Math.sqrt(q.area));
      if (Math.max(...sizes) > 1.9 * Math.min(...sizes)) continue;
      const P = set.map(ctr);
      const pick = fn => P.reduce((u, v) => fn(v) > fn(u) ? v : u);
      const tl = pick(p => -p[0] - p[1]), tr = pick(p => p[0] - p[1]), br = pick(p => p[0] + p[1]), bl = pick(p => -p[0] + p[1]);
      if (new Set([tl, tr, br, bl]).size < 4) continue;
      const q = [tl, tr, br, bl]; if (!convex(q)) continue;
      const wTop = dist(tl, tr), wBot = dist(bl, br), hL = dist(tl, bl), hR = dist(tr, br);
      const r = (hL + hR) / (wTop + wBot);
      if (r < ratio * 0.72 || r > ratio * 1.35) continue;
      const area = polyArea(q); if (area < big * big * 0.12) continue;
      // la taille des marques doit être cohérente avec la largeur de la planche
      const msz = sizes.reduce((x, y) => x + y) / 4, expect = (wTop + wBot) / 2 * S.marker / (S.W - 2 * S.margin - S.marker);
      if (msz < expect * 0.45 || msz > expect * 2.2) continue;
      if (area > bestA) { bestA = area; best = q; }
    }
    return best ? best.map(p => [p[0] * f, p[1] * f]) : null;
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const polyArea = q => Math.abs(q.reduce((s, p, i) => { const n = q[(i + 1) % q.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0) / 2);
  function convex(q) { let sg = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (!sg) sg = Math.sign(cr); else if (Math.sign(cr) !== sg) return false; } return true; }
  function downBin(bin, f) { // OU logique par blocs
    const W = Math.ceil(bin.w / f), H = Math.ceil(bin.h / f), d = new Uint8Array(W * H);
    for (let y = 0; y < bin.h; y++) { const yy = Math.floor(y / f) * W; for (let x = 0; x < bin.w; x++) if (bin.data[y * bin.w + x]) d[yy + Math.floor(x / f)] = 1; }
    // un bloc est encre s'il l'est majoritairement -> on refait avec comptage pour garder les marques pleines
    const cnt = new Float32Array(W * H), tot = new Float32Array(W * H);
    for (let y = 0; y < bin.h; y++) { const yy = Math.floor(y / f) * W; for (let x = 0; x < bin.w; x++) { const k = yy + Math.floor(x / f); tot[k]++; cnt[k] += bin.data[y * bin.w + x]; } }
    for (let i = 0; i < d.length; i++) d[i] = cnt[i] > tot[i] * 0.5 ? 1 : 0;
    return { w: W, h: H, data: d };
  }

  /** Coordonnées canoniques des centres des marques */
  function markerCenters() { const S = PA.SHEET, m = S.margin + S.marker / 2; return [[m, m], [S.W - m, m], [S.W - m, S.H - m], [m, S.H - m]]; }

  // lettres dont le bas repose sur la ligne de base (on peut caler leur ligne de base sur leur propre bas)
  const SNAP = /^[A-IK-PR-Za-fhik-ortuvwxz0-9éèêàùôîëïûœæčɛ!?%#&*+=«»]/;
  const NOSNAP = /[ḥṛṣṭẓḍçǧɣgjpqyQJ,;()\/@_'"\-ـ]|[جحخعغمنيىئسشصضقل]/;
  const canSnap = k => !!k && SNAP.test(k) && !NOSNAP.test(k); // l'arabe (points souscrits) n'est jamais calé

  /** Redresse la planche et lit chaque case. */
  function extractTemplate(cleaned, corners, warnings) {
    const S = PA.SHEET, mc = markerCenters();
    const Hm = PA.homography(mc, corners);
    const map = (x, y) => { const z = Hm[6] * x + Hm[7] * y + 1; return [(Hm[0] * x + Hm[1] * y + Hm[2]) / z, (Hm[3] * x + Hm[4] * y + Hm[5]) / z]; };
    const full = [map(0, 0), map(S.W, 0), map(S.W, S.H), map(0, S.H)];
    let g = PA.warpPerspective(cleaned.gray, full, S.W, S.H, 255);
    // seuil relatif au papier : les lignes guides grises (≈ 80-90 % du blanc) ne passent pas
    g = PA.flatten(g, 64, false);
    const t = Math.min(150, Math.max(70, PA.otsu(g)));
    const bin = PA.threshold(g, t, false);
    let ink = 0; for (let y = S.margin; y < S.margin + S.marker; y++) for (let x = S.W / 2 - 28; x < S.W / 2 + 28; x++) ink += bin.data[(y | 0) * S.W + (x | 0)];
    const kind = ink > S.marker * 56 * 0.5 ? 'arabic' : 'latin';
    const L = PA.layout(kind), raw = [];
    for (const cell of L.cells) {
      const r = cell.inner, ox = Math.round(r.x) + 3, oy = Math.round(r.y), sw = Math.round(r.w) - 6, sh = Math.round(r.h) - 4;
      const sub = { w: sw, h: sh, data: new Uint8Array(sw * sh) };
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) sub.data[y * sw + x] = bin.data[(oy + y) * S.W + ox + x];
      const comps = PA.components(sub).filter(c => {
        const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
        if (w > 0.6 * sw && h < 0.1 * sh) return false;            // ligne horizontale (guide, bord)
        if (h > 0.8 * sh && w < 0.08 * sw && touchesBorder(c, sub)) return false; // bord vertical
        if (touchesBorder(c, sub) && c.area < 60) return false;
        return c.area >= 5;
      });
      if (comps.length) raw.push({ cell, comps, ox, oy });
    }
    // bruit : pièces minuscules par rapport au glyphe médian
    const medA = PA.median(raw.map(r => Math.max(...r.comps.map(c => c.area)))) || 1;
    const items = [];
    for (const { cell, comps, ox, oy } of raw) {
      const keep = comps.filter(c => c.area >= Math.max(5, 0.012 * medA));
      if (!keep.length || Math.max(...keep.map(c => c.area)) < 0.06 * medA) continue; // case vide (taches)
      const g0 = Object.assign({}, keep[0]); for (const c of keep.slice(1)) mergeComp(g0, c);
      g0.pixels = g0.pixels.map(p => { const x = p % (Math.round(cell.inner.w) - 6), y = (p - x) / (Math.round(cell.inner.w) - 6); return (y + oy) * S.W + x + ox; });
      g0.x0 += ox; g0.x1 += ox; g0.y0 += oy; g0.y1 += oy;
      items.push({ key: cell.key, comp: g0, cell });
    }
    // ligne de base : propre bas pour les lettres « posées », sinon guide + décalage médian
    const offs = items.filter(it => canSnap(it.key)).map(it => it.comp.y1 + 1 - it.cell.base);
    const off = offs.length ? PA.median(offs) : 0;
    for (const it of items) it.baseline = canSnap(it.key) ? it.comp.y1 + 1 : it.cell.base + off;
    // échelle globale : hauteur médiane des capitales plates -> 700 (sinon alif, sinon guides)
    const capH = items.filter(it => /^[BDEFHIKLMNPRTUVWXYZ]$/.test(it.key)).map(it => it.comp.y1 - it.comp.y0 + 1);
    const alif = items.filter(it => it.key === 'ا' || it.key === 'ا.fina').map(it => it.comp.y1 - it.comp.y0 + 1);
    const scale = capH.length >= 3 ? 700 / PA.median(capH) : alif.length ? 700 / PA.median(alif) : 700 / (L.cells[0].base - L.cells[0].cap);
    items.forEach(it => it.scale = scale);
    if (items.length < L.cells.length * 0.3) warnings.push({ level: 'warn', code: 'fewCells', n: items.length, total: L.cells.length });
    return { kind, items, bin, gray: g };
  }
  const touchesBorder = (c, b) => c.x0 <= 0 || c.y0 <= 0 || c.x1 >= b.w - 1 || c.y1 >= b.h - 1;
  function mergeComp(a, b) { a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1); a.area += b.area; const p = new Int32Array(a.pixels.length + b.pixels.length); p.set(a.pixels); p.set(b.pixels, a.pixels.length); a.pixels = p; }

  /** Filtre des composantes parasites (texte libre) : bords d'image, traits de cadre, bruit */
  function filterComponents(comps, bin, alphabet) {
    if (!comps.length) return { kept: comps, removed: 0 };
    const mh = PA.median(comps.map(c => c.y1 - c.y0 + 1)), ma = PA.median(comps.map(c => c.area));
    const punct = /[.,;:'"\-·،]/.test(alphabet);
    const kept = comps.filter(c => {
      const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
      if (c.x0 <= 1 || c.y0 <= 1 || c.x1 >= bin.w - 2 || c.y1 >= bin.h - 2) return false;  // touche le bord : table, ombre
      if (h > 3 * mh || w > 5 * mh) return false;                                           // géant : cadre, tache
      if ((h / w > 9 && h > 1.6 * mh) || (w / h > 9 && w > 1.6 * mh)) return false;         // trait de cadre / grille
      if (c.area < (punct ? 0.015 : 0.05) * ma) return false;                               // poussière
      return true;
    });
    return { kept, removed: comps.length - kept.length };
  }

  /** Texte libre : segmente, filtre, ordonne (RTL si arabe), attribue dans l'ordre */
  function extractFree(cleaned, alphabet, warnings) {
    const chars = Array.from(alphabet.replace(/\s+/g, ''));
    const rtl = PA.hasRTL(alphabet);
    let comps = PA.components(cleaned.bin).filter(c => c.area >= 4);
    const f = filterComponents(comps, cleaned.bin, alphabet); comps = f.kept;
    comps = PA.readingOrder(PA.mergeMarks(comps));
    // 2e passe : après fusion, rejette encore les blocs aberrants
    const f2 = filterComponents(comps, cleaned.bin, alphabet); comps = PA.readingOrder(f2.kept);
    if (f.removed + f2.removed) warnings.push({ level: 'info', code: 'removed', n: f.removed + f2.removed });
    if (rtl) {
      const lines = new Map(); comps.forEach(c => { if (!lines.has(c.line)) lines.set(c.line, []); lines.get(c.line).push(c); });
      comps = [...lines.keys()].sort((a, b) => a - b).flatMap(k => lines.get(k).reverse());
    }
    if (comps.length !== chars.length) warnings.push({ level: 'warn', code: 'countMismatch', found: comps.length, expected: chars.length });
    const items = comps.map((c, i) => ({ key: chars[i] || null, comp: c, line: c.line }));
    assignBaselines(items);
    const hs = fn => items.filter(it => it.key && fn(it.key)).map(it => it.comp.y1 - it.comp.y0 + 1);
    const caps = hs(k => /^[BDEFHIKLMNPRTUVWXYZ]$/.test(k)), xs = hs(k => PA.XLET.has(k));
    const scale = caps.length ? 700 / PA.median(caps) : xs.length ? 500 / PA.median(xs) : 700 / (PA.median(items.map(it => it.comp.y1 - it.comp.y0 + 1)) || 1);
    items.forEach(it => it.scale = scale);
    return { kind: 'free', items, bin: cleaned.bin, gray: cleaned.gray, rtl };
  }
  /** Ligne de base par ligne (médiane), puis calage sur le propre bas des lettres posées */
  function assignBaselines(items) {
    const byLine = new Map(); items.forEach(it => { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); });
    for (const list of byLine.values()) {
      const ok = list.filter(it => canSnap(it.key));
      const b = PA.median((ok.length ? ok : list).map(it => it.comp.y1 + 1));
      const mh = PA.median(list.map(it => it.comp.y1 - it.comp.y0 + 1));
      list.forEach(it => { const own = it.comp.y1 + 1; it.baseline = canSnap(it.key) && Math.abs(own - b) < 0.3 * mh ? own : b; });
    }
  }

  /** Vectorise un item -> record de glyphe en unités (y vers le haut, encre commençant à x=0) */
  function vectorize(bin, it, opts = {}) {
    const bm = PA.cropGlyph(bin, it.comp, 1);
    const loops = PA.traceBitmap(bm, { error: opts.error ?? Math.max(0.6, (bm.h) / 120) });
    const s = it.scale, inkL = it.comp.x0;
    const contours = loops.map(segs => {
      const c = segs.map(q => { const o = []; for (let i = 0; i < 8; i += 2) { o.push((q[i] + bm.ox - inkL) * s, (it.baseline - (q[i + 1] + bm.oy)) * s); } return o; });
      return c;
    });
    const rec = { key: it.key, contours, source: 'traced', bitmap: bm, scale: s };
    normalizeOrientation(rec);
    rec.bbox = PA.bboxOf(rec.contours);
    return rec;
  }
  /** Sens CFF : extérieurs anti-horaires (aire > 0 en y vers le haut), trous horaires.
   *  On détermine la profondeur d'imbrication de chaque contour. */
  function normalizeOrientation(rec) {
    const polys = rec.contours.map(sample);
    rec.contours = rec.contours.map((c, i) => {
      const p = polys[i][0].slice(); let depth = 0;
      polys.forEach((q, j) => { if (j !== i && inside(p, q)) depth++; });
      const a = PA.contourArea(c), wantPos = depth % 2 === 0;
      return (a > 0) === wantPos ? c : PA.reverseContour(c);
    });
  }
  /** Échantillonne un contour de Bézier en polygone */
  function sample(c) { const p = []; for (const s of c) for (let k = 0; k < 8; k++) { const t = k / 8, u = 1 - t; p.push([u * u * u * s[0] + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6], u * u * u * s[1] + 3 * u * u * t * s[3] + 3 * u * t * t * s[5] + t * t * t * s[7]]); } return p; }
  function inside(p, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function bboxOf(contours) {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const c of contours) for (const s of c) for (let i = 0; i < 8; i += 2) { xMin = Math.min(xMin, s[i]); xMax = Math.max(xMax, s[i]); yMin = Math.min(yMin, s[i + 1]); yMax = Math.max(yMax, s[i + 1]); }
    if (xMin === Infinity) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
    return { xMin, yMin, xMax, yMax };
  }

  /** Pipeline complet pour une image. Ne lève pas d'exception pour les cas attendus :
   *  renvoie {mode, glyphs, extract, cleaned, warnings:[{level, code, ...}]} */
  function run(gray, opts = {}) {
    const warnings = [];
    let cleaned = clean(gray, opts), ex = null;
    {
      // on cherche toujours la planche : une planche lue « en texte libre » donnerait des glyphes faux
      const corners = detectTemplate(cleaned.bin);
      if (corners) { ex = extractTemplate(cleaned, corners, warnings); if (opts.mode === 'free') warnings.push({ level: 'info', code: 'tplInFree' }); }
      else if (opts.mode === 'template') { warnings.push({ level: 'error', code: 'notFound' }); return { mode: 'none', glyphs: [], extract: { kind: 'none', items: [], bin: cleaned.bin }, cleaned, warnings }; }
    }
    if (!ex) {
      if (opts.deskew !== false) cleaned = deskew(cleaned);
      ex = extractFree(cleaned, opts.alphabet || PA.LATIN_SHEET.slice(0, 62).join(''), warnings);
    }
    const glyphs = [];
    for (const it of ex.items.filter(it => it.key)) {
      const g = vectorize(ex.bin, it, opts);
      const b = g.bbox;
      if (b.yMax - b.yMin > 2600 || b.xMax - b.xMin > 3000 || !g.contours.length) { warnings.push({ level: 'warn', code: 'giant', key: it.key }); it.rejected = true; continue; }
      glyphs.push(g);
    }
    if (!glyphs.length) warnings.push({ level: 'error', code: 'noGlyph' });
    return { mode: ex.kind, glyphs, extract: ex, cleaned, warnings };
  }

  Object.assign(PA, { clean, deskew, filterComponents, canSnap, detectTemplate, markerCenters, extractTemplate, extractFree, assignBaselines, vectorize, normalizeOrientation, bboxOf, run });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
