/* Police Atelier — family.js
 * Famille de styles à partir de la police tracée :
 *  - graisses par décalage réel du contour (dilatation / érosion euclidienne sur une trame fine,
 *    puis retracé en courbes de Bézier) — robuste : jamais d'auto-intersection ;
 *  - décalage horizontal ≠ vertical pour garder le contraste ;
 *  - compensation verticale : ligne de base, hauteur d'x, capitales et ascendantes conservées ;
 *  - garde-fou : si une contreforme se ferme (o, e, a… en Black) le décalage du glyphe est réduit ;
 *  - italique = inclinaison ~11° avec compensation optique ;
 *  - noms / OS-2 / macStyle pour le regroupement en famille (Regular/Bold/Italic/Bold Italic). */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** Classes de graisse : épaisseur de fût visée, en fraction de la hauteur des capitales */
  const WEIGHTS = [
    { name: 'Thin', cls: 100, stem: 0.045 }, { name: 'Light', cls: 300, stem: 0.08 },
    { name: 'Regular', cls: 400, stem: 0.115 }, { name: 'Medium', cls: 500, stem: 0.14 },
    { name: 'SemiBold', cls: 600, stem: 0.165 }, { name: 'Bold', cls: 700, stem: 0.19 },
    { name: 'ExtraBold', cls: 800, stem: 0.22 }, { name: 'Black', cls: 900, stem: 0.25 }];
  const ITALIC_ANGLE = 11;

  /** Graisse détectée de la police tracée : classe la plus proche de son fût mesuré */
  function detectWeight(analysis, metrics) {
    const r = (analysis && analysis.weight || 80) / (metrics.capHeight || 700);
    let best = 2, bd = Infinity;
    WEIGHTS.forEach((w, i) => { const d = Math.abs(Math.log(r / w.stem)); if (d < bd) { bd = d; best = i; } });
    return { index: best, ratio: r, name: WEIGHTS[best].name };
  }

  /** Transformée de distance euclidienne au carré (Felzenszwalb–Huttenlocher), cible = pixels à 1 */
  function edt(mask, w, h) {
    const INF = 1e20, f = new Float64Array(Math.max(w, h)), d = new Float64Array(Math.max(w, h)), v = new Int32Array(Math.max(w, h)), z = new Float64Array(Math.max(w, h) + 1);
    const out = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = mask[i] ? 0 : INF;
    const pass = (n, get, set) => {
      for (let q = 0; q < n; q++) f[q] = get(q);
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
      for (let q = 0; q < n; q++) set(q, d[q]);
    };
    for (let x = 0; x < w; x++) pass(h, y => out[y * w + x], (y, val) => { out[y * w + x] = val; });
    for (let y = 0; y < h; y++) pass(w, x => out[y * w + x], (x, val) => { out[y * w + x] = val; });
    return out;
  }

  const RES = 0.4; // px par unité (1000 unités ≈ 400 px)
  /** Décale un contour de dx (horizontal) et dy (vertical) unités ; >0 = plus gras, <0 = plus maigre */
  function offsetContours(contours, dx, dy) {
    if (!contours.length || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return contours;
    // anisotropie : on écrase la trame en y pour que le disque de rayon dx devienne une ellipse (dx, dy)
    const ky = Math.max(0.5, Math.min(2, dy && dx ? dx / dy : 1)), r = RES, rad = Math.abs(dx) * r;
    const b = PA.bboxOf(contours), pad = Math.abs(dx) + Math.abs(dy) + 40;
    const x0 = b.xMin - pad, y1 = b.yMax + pad;
    const w = Math.ceil((b.xMax - b.xMin + 2 * pad) * r), h = Math.ceil((b.yMax - b.yMin + 2 * pad) * r * ky);
    const bm = PA.rasterize(contours, w, h, (x, y) => [(x - x0) * r, (y1 - y) * r * ky]);
    const grow = dx > 0, mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = grow ? (bm.data[i] ? 1 : 0) : (bm.data[i] ? 0 : 1);
    const D = edt(mask, w, h), r2 = rad * rad, data = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = grow ? (D[i] <= r2 ? 1 : 0) : (D[i] > r2 ? 1 : 0);
    const rec = { contours: PA.traceBitmap({ w, h, data }, { error: 0.8 }).map(c => c.map(q => { const o = []; for (let i = 0; i < 8; i += 2) o.push(q[i] / r + x0, y1 - q[i + 1] / (r * ky)); return o; })) };
    PA.normalizeOrientation(rec);
    return rec.contours;
  }

  /** Correspondance verticale par morceaux : les bords des zones (déplacés de ±dy) reviennent à leur place */
  function verticalCompensate(contours, m, dy) {
    const A = [[m.descender - dy, m.descender], [-dy, 0], [m.xHeight + dy, m.xHeight], [m.capHeight + dy, m.capHeight], [Math.max(m.ascender, m.capHeight + 20) + dy, Math.max(m.ascender, m.capHeight + 20)]].sort((a, b) => a[0] - b[0]);
    const map = y => {
      if (y <= A[0][0]) return y + (A[0][1] - A[0][0]);
      for (let i = 1; i < A.length; i++) if (y <= A[i][0]) { const [a0, b0] = A[i - 1], [a1, b1] = A[i]; return a1 === a0 ? b0 : b0 + (y - a0) * (b1 - b0) / (a1 - a0); }
      const l = A[A.length - 1]; return y + (l[1] - l[0]);
    };
    return contours.map(c => c.map(q => [q[0], map(q[1]), q[2], map(q[3]), q[4], map(q[5]), q[6], map(q[7])]));
  }

  const holes = cs => cs.filter(c => PA.contourArea(c) < 0).length;
  /** Un glyphe à une autre graisse ; réduit le décalage si une contreforme se ferme ou si un trait disparaît */
  function weightGlyph(g, m, delta, contrast) {
    const h0 = holes(g.contours), n0 = g.contours.length - h0;
    let f = 1, out = g.contours, limited = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const dx = delta * f, dy = dx * (dx > 0 ? contrast : 1);
      out = offsetContours(g.contours, dx, dy);
      const h1 = holes(out), n1 = out.length - h1;
      if (h1 >= h0 && n1 >= n0 && out.length) { out = verticalCompensate(out, m, dy); break; }
      f *= 0.6; limited = true; out = g.contours;
    }
    const c = out; return Object.assign({}, g, { contours: c, bbox: PA.bboxOf(c), limited });
  }

  /** Inclinaison avec compensation optique (légère condensation, centrage sur la hauteur d'x) */
  function italicGlyph(g, m, angle = ITALIC_ANGLE) {
    const t = Math.tan(angle * Math.PI / 180);
    const c = PA.transform(g.contours, [0.98, 0, t, 1, -t * m.xHeight / 2, 0]);
    return Object.assign({}, g, { contours: c, bbox: PA.bboxOf(c) });
  }

  /** Noms et drapeaux de style (regroupement RIBBI + familles typographiques ID 16/17) */
  function styleInfo(family, wi, italic) {
    const W = WEIGHTS[wi], ribbi = W.name === 'Regular' || W.name === 'Bold';
    const typoSub = W.name === 'Regular' ? (italic ? 'Italic' : 'Regular') : W.name + (italic ? ' Italic' : '');
    const bold = W.name === 'Bold';
    const legacySub = (bold ? 'Bold' : 'Regular') + (italic ? ' Italic' : '');
    return {
      family, typoSub, weightName: W.name, italic, weightClass: W.cls,
      legacyFamily: ribbi ? family : family + ' ' + W.name,
      legacySub: legacySub === 'Regular Italic' ? 'Italic' : legacySub,
      full: family + ' ' + typoSub, ps: (family.replace(/[^A-Za-z0-9]/g, '') || 'PoliceAtelier') + '-' + typoSub.replace(/ /g, ''),
      fsSelection: (italic ? 1 : 0) | (bold ? 32 : 0) | (!italic && !bold ? 64 : 0),
      macStyle: (bold ? 1 : 0) | (italic ? 2 : 0), italicAngle: italic ? -ITALIC_ANGLE : 0
    };
  }

  /**
   * Construit un style. G : glyphes de la police tracée ; base : detectWeight(). Retourne {built, G, info}
   * (built = résultat de buildFont prêt pour fontBinary).
   */
  function buildStyle(G, metrics, analysis, settings, wi, italic, base, cache) {
    base = base || detectWeight(analysis, metrics);
    const cap = metrics.capHeight || 700, t0 = (analysis && analysis.weight) || 80;
    // delta = moitié de la différence d'épaisseur de fût visée (le contour bouge des deux côtés)
    const delta = (WEIGHTS[wi].stem - WEIGHTS[base.index].stem) * cap / 2;
    const contrast = 0.8; // le gras épaissit moins les horizontales : contraste préservé
    const key = wi + ':' + Math.round(delta);
    let Gw = cache && cache[key];
    if (!Gw) {
      Gw = {};
      for (const k in G) Gw[k] = Math.abs(delta) < 2 ? G[k] : weightGlyph(G[k], metrics, delta, contrast);
      if (cache) cache[key] = Gw;
    }
    const Gs = Gw;
    const info = styleInfo(settings.family || 'Police Atelier', wi, italic);
    const built = PA.buildFont(Gs, metrics, Object.assign({}, settings, { slant: italic ? ITALIC_ANGLE : 0, style: info.typoSub, weightClass: info.weightClass, styleInfo: info }),
      Object.assign({}, analysis, { weight: Math.max(10, t0 + 0.9 * delta) }));
    return { built, G: Gs, info, limited: Object.keys(Gw).filter(k => Gw[k].limited) };
  }

  Object.assign(PA, { WEIGHTS, ITALIC_ANGLE, detectWeight, edt, offsetContours, verticalCompensate, weightGlyph, italicGlyph, styleInfo, buildStyle });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
