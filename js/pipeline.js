/* Police Atelier — pipeline.js
 * Enchaîne : nettoyage -> (planche modèle | texte libre) -> segmentation ->
 * attribution -> vectorisation -> normalisation en unités (unitsPerEm 1000). */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** Nettoyage de l'image grise. opts: black, white, thresh (null=Otsu), invert ('auto'|bool), despeckle, deskew */
  function clean(gray, opts = {}) {
    let g = PA.levels(gray, opts.black ?? 0, opts.white ?? 255);
    const inv = opts.invert === 'auto' || opts.invert == null ? PA.looksInverted(g) : !!opts.invert;
    let t = opts.thresh ?? PA.otsu(g);
    let bin = PA.threshold(g, t, inv), skew = 0;
    if (opts.deskew) {
      skew = PA.estimateSkew(bin);
      if (Math.abs(skew) >= 0.5) { g = PA.rotate(g, -skew, inv ? 0 : 255); bin = PA.threshold(g, t, inv); }
    }
    const minA = opts.despeckle ?? Math.max(3, Math.round(gray.w * gray.h / 400000));
    bin = PA.despeckle(bin, minA);
    return { gray: g, bin, thresh: t, inverted: inv, skew };
  }

  /** Repère les 4 marques d'angle d'une planche modèle -> coins [TL,TR,BR,BL] (centres) ou null */
  function detectTemplate(bin) {
    const comps = PA.components(bin);
    const big = comps.filter(c => {
      const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
      return w > bin.w * 0.012 && Math.abs(w / h - 1) < 0.3 && c.area / (w * h) > 0.85;
    });
    if (big.length < 4) return null;
    const cx = c => (c.x0 + c.x1) / 2, cy = c => (c.y0 + c.y1) / 2;
    const pick = f => big.reduce((a, b) => f(b) > f(a) ? b : a);
    const tl = pick(c => -cx(c) - cy(c)), tr = pick(c => cx(c) - cy(c)), br = pick(c => cx(c) + cy(c)), bl = pick(c => -cx(c) + cy(c));
    if (new Set([tl, tr, br, bl]).size < 4) return null;
    const ar = [tl, tr, br, bl].map(c => c.x1 - c.x0); if (Math.max(...ar) > 2 * Math.min(...ar)) return null;
    // les marques doivent couvrir l'essentiel de l'image
    if ((cx(tr) - cx(tl)) < bin.w * 0.4 || (cy(bl) - cy(tl)) < bin.h * 0.4) return null;
    return [[cx(tl), cy(tl)], [cx(tr), cy(tr)], [cx(br), cy(br)], [cx(bl), cy(bl)]];
  }

  /** Coordonnées canoniques des centres des marques */
  function markerCenters() { const S = PA.SHEET, m = S.margin + S.marker / 2; return [[m, m], [S.W - m, m], [S.W - m, S.H - m], [m, S.H - m]]; }

  /** Redresse la planche et lit chaque case. Renvoie {kind, items:[{key, comp, baseline, scale}], bin} */
  function extractTemplate(cleaned, corners) {
    const S = PA.SHEET, mc = markerCenters();
    // on étend le quadrilatère des centres de marques aux bords de la planche
    const Hm = PA.homography(mc, corners);
    const map = (x, y) => { const z = Hm[6] * x + Hm[7] * y + 1; return [(Hm[0] * x + Hm[1] * y + Hm[2]) / z, (Hm[3] * x + Hm[4] * y + Hm[5]) / z]; };
    const full = [map(0, 0), map(S.W, 0), map(S.W, S.H), map(0, S.H)];
    const fill = cleaned.inverted ? 0 : 255;
    const g = PA.warpPerspective(cleaned.gray, full, S.W, S.H, fill);
    const bin = PA.despeckle(PA.threshold(g, cleaned.thresh, cleaned.inverted), 6);
    // repère d'identification : carré plein au centre haut = planche arabe
    let ink = 0; for (let y = S.margin; y < S.margin + S.marker; y++) for (let x = S.W / 2 - 28; x < S.W / 2 + 28; x++) ink += bin.data[(y | 0) * S.W + (x | 0)];
    const kind = ink > S.marker * 56 * 0.6 ? 'arabic' : 'latin';
    const L = PA.layout(kind), items = [];
    for (const cell of L.cells) {
      const r = cell.inner, sub = { w: Math.round(r.w), h: Math.round(r.h), data: new Uint8Array(Math.round(r.w) * Math.round(r.h)) };
      for (let y = 0; y < sub.h; y++) for (let x = 0; x < sub.w; x++) sub.data[y * sub.w + x] = bin.data[(Math.round(r.y) + y) * S.W + Math.round(r.x) + x];
      const comps = PA.components(sub).filter(c => c.area >= 8 && !(touchesBorder(c, sub) && c.area < 40));
      if (!comps.length) continue;
      const g0 = comps[0]; for (const c of comps.slice(1)) mergeComp(g0, c);
      // conversion en coordonnées de la planche
      const ox = Math.round(r.x), oy = Math.round(r.y);
      g0.pixels = g0.pixels.map(p => { const x = p % sub.w, y = (p - x) / sub.w; return (y + oy) * S.W + x + ox; });
      g0.x0 += ox; g0.x1 += ox; g0.y0 += oy; g0.y1 += oy;
      items.push({ key: cell.key, comp: g0, baseline: cell.base, scale: 700 / (cell.base - cell.cap) });
    }
    return { kind, items, bin, gray: g };
  }
  const touchesBorder = (c, b) => c.x0 <= 0 || c.y0 <= 0 || c.x1 >= b.w - 1 || c.y1 >= b.h - 1;
  function mergeComp(a, b) { a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1); a.area += b.area; const p = new Int32Array(a.pixels.length + b.pixels.length); p.set(a.pixels); p.set(b.pixels, a.pixels.length); a.pixels = p; }

  /** Texte libre : segmente, ordonne (RTL si l'alphabet est arabe), attribue dans l'ordre */
  function extractFree(cleaned, alphabet) {
    const chars = Array.from(alphabet.replace(/\s+/g, ''));
    const rtl = PA.hasRTL(alphabet);
    let comps = PA.segment(cleaned.bin);
    if (rtl) { // inversion de l'ordre à l'intérieur de chaque ligne
      const lines = new Map(); comps.forEach(c => { if (!lines.has(c.line)) lines.set(c.line, []); lines.get(c.line).push(c); });
      comps = [...lines.keys()].sort((a, b) => a - b).flatMap(k => lines.get(k).reverse());
    }
    const items = comps.map((c, i) => ({ key: chars[i] || null, comp: c, line: c.line }));
    assignBaselines(items);
    // échelle : capitales plates -> 700, sinon hauteur d'x -> 500, sinon médiane -> 700
    const hs = f => items.filter(it => it.key && f(it.key)).map(it => it.comp.y1 - it.comp.y0 + 1);
    const caps = hs(k => /[BDEFHIKLMNPRTUVWXYZ]/.test(k) && k.length === 1), xs = hs(k => PA.XLET.has(k));
    const scale = caps.length ? 700 / PA.median(caps) : xs.length ? 500 / PA.median(xs) : 700 / (PA.median(items.map(it => it.comp.y1 - it.comp.y0 + 1)) || 1);
    items.forEach(it => it.scale = scale);
    return { kind: 'free', items, bin: cleaned.bin, gray: cleaned.gray, rtl };
  }
  /** Ligne de base de chaque ligne : médiane des bas des glyphes sans descendante */
  function assignBaselines(items) {
    const byLine = new Map(); items.forEach(it => { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); });
    for (const list of byLine.values()) {
      const ok = list.filter(it => it.key && !PA.DESC.has(it.key) && !/[-'"*+=~^,.]/.test(it.key));
      const b = PA.median((ok.length ? ok : list).map(it => it.comp.y1 + 1));
      list.forEach(it => it.baseline = b);
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

  /** Pipeline complet pour une image. Renvoie {mode, glyphs:[records], extract, cleaned} */
  function run(gray, opts = {}) {
    const cleaned = clean(gray, opts);
    let ex = null;
    if (opts.mode !== 'free') { const corners = detectTemplate(cleaned.bin); if (corners) ex = extractTemplate(cleaned, corners); }
    if (!ex) { if (opts.mode === 'template') throw new Error('template-not-found'); ex = extractFree(cleaned, opts.alphabet || PA.LATIN_SHEET.slice(0, 62).join('')); }
    const glyphs = ex.items.filter(it => it.key).map(it => vectorize(ex.bin, it, opts));
    return { mode: ex.kind, glyphs, extract: ex, cleaned };
  }

  Object.assign(PA, { clean, detectTemplate, markerCenters, extractTemplate, extractFree, assignBaselines, vectorize, normalizeOrientation, bboxOf, run });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
