/* Police Atelier — trace.js
 * Vectorisation maison :
 *  1) suivi de contour « marching squares » sur le bitmap binaire (iso 0,5 :
 *     les sommets sont les milieux des arêtes entre pixel encre et pixel fond) ;
 *     l'orientation est cohérente : contours extérieurs et contre-formes
 *     (trous) tournent en sens opposés, ce qui donne le bon remplissage ;
 *  2) détection des angles ;
 *  3) ajustement de courbes de Bézier cubiques par moindres carrés
 *     (méthode de type Schneider, subdivision récursive + reparamétrage de Newton).
 * Un contour = tableau de segments [x0,y0, c1x,c1y, c2x,c2y, x3,y3]. */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** Extrait les boucles fermées (polylignes) d'un bitmap binaire */
  function marchingSquares(bin) {
    const { w, h, data } = bin;
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h) ? data[y * w + x] : 0;
    const W = w + 1, out = new Map(); // sommet -> liste d'arêtes sortantes
    const edges = [];
    const add = (x0, y0, x1, y1) => {
      const e = { x0, y0, x1, y1, used: false }; edges.push(e);
      const k = y0 * W + x0; if (!out.has(k)) out.set(k, []); out.get(k).push(e);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!data[y * w + x]) continue;
      if (!at(x, y - 1)) add(x, y, x + 1, y);
      if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) add(x, y + 1, x, y);
    }
    const loops = [];
    for (const e0 of edges) {
      if (e0.used) continue;
      const pts = []; let e = e0;
      while (e && !e.used) {
        e.used = true;
        pts.push([(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2]); // milieu = interpolation iso 0,5
        const cand = (out.get(e.y1 * W + e.x1) || []).filter(c => !c.used);
        if (cand.length <= 1) { e = cand[0]; continue; }
        // point-selle : on tourne à gauche en priorité (8-connexité de l'encre)
        const dx = e.x1 - e.x0, dy = e.y1 - e.y0;
        const score = c => { const cx = c.x1 - c.x0, cy = c.y1 - c.y0; const cr = dx * cy - dy * cx; return cr < 0 ? 0 : (cr === 0 ? 1 : 2); };
        cand.sort((a, b) => score(a) - score(b)); e = cand[0];
      }
      if (pts.length >= 4) loops.push(pts);
    }
    return loops;
  }

  /** Aire signée (repère image : >0 = extérieur, <0 = trou) */
  function signedArea(pts) {
    let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return s / 2;
  }

  // --- petits outils vectoriels
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], addv = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, s) => [a[0] * s, a[1] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const len = a => Math.hypot(a[0], a[1]), norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const dist = (a, b) => len(sub(a, b));

  /** Détection des angles par la méthode du k-cosinus */
  function findCorners(pts, k, maxCos) {
    const n = pts.length, cosv = new Float64Array(n), corners = [];
    for (let i = 0; i < n; i++) {
      const a = norm(sub(pts[(i - k + n) % n], pts[i])), b = norm(sub(pts[(i + k) % n], pts[i]));
      cosv[i] = dot(a, b); // -1 = droit, ~0 = angle droit
    }
    for (let i = 0; i < n; i++) {
      if (cosv[i] < maxCos) continue;
      let isMax = true;
      for (let j = 1; j <= k; j++) if (cosv[(i + j) % n] > cosv[i] || cosv[(i - j + n) % n] >= cosv[i]) { isMax = false; break; }
      if (isMax) corners.push(i);
    }
    return corners;
  }

  /** Lissage léger (ne déplace pas les angles) */
  function smooth(pts, fixed, iters) {
    let p = pts.map(q => q.slice()); const n = p.length;
    for (let it = 0; it < iters; it++) {
      const q = p.map(v => v.slice());
      for (let i = 0; i < n; i++) {
        if (fixed.has(i)) continue;
        const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
        q[i] = [(a[0] + 2 * p[i][0] + b[0]) / 4, (a[1] + 2 * p[i][1] + b[1]) / 4];
      }
      p = q;
    }
    return p;
  }

  // ---------- ajustement de Bézier (moindres carrés) ----------
  const bez = (c, t) => { const u = 1 - t; return [u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0], u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1]]; };
  const bezD = (c, t) => { const u = 1 - t; return [3 * (u * u * (c[1][0] - c[0][0]) + 2 * u * t * (c[2][0] - c[1][0]) + t * t * (c[3][0] - c[2][0])), 3 * (u * u * (c[1][1] - c[0][1]) + 2 * u * t * (c[2][1] - c[1][1]) + t * t * (c[3][1] - c[2][1]))]; };
  const bezDD = (c, t) => { const u = 1 - t; return [6 * (u * (c[2][0] - 2 * c[1][0] + c[0][0]) + t * (c[3][0] - 2 * c[2][0] + c[1][0])), 6 * (u * (c[2][1] - 2 * c[1][1] + c[0][1]) + t * (c[3][1] - 2 * c[2][1] + c[1][1]))]; };

  function chordParams(p) { const u = [0]; for (let i = 1; i < p.length; i++) u.push(u[i - 1] + dist(p[i], p[i - 1])); const L = u[u.length - 1] || 1; return u.map(v => v / L); }

  function generateBezier(p, u, t1, t2) {
    const a = p[0], b = p[p.length - 1];
    let C00 = 0, C01 = 0, C11 = 0, X0 = 0, X1 = 0;
    for (let i = 0; i < p.length; i++) {
      const t = u[i], s = 1 - t, b1 = 3 * t * s * s, b2 = 3 * t * t * s;
      const A1 = mul(t1, b1), A2 = mul(t2, b2);
      C00 += dot(A1, A1); C01 += dot(A1, A2); C11 += dot(A2, A2);
      const tmp = sub(p[i], addv(mul(a, s * s * s + b1), mul(b, b2 + t * t * t)));
      X0 += dot(A1, tmp); X1 += dot(A2, tmp);
    }
    const det = C00 * C11 - C01 * C01;
    let al = det ? (X0 * C11 - X1 * C01) / det : 0, ar = det ? (C00 * X1 - C01 * X0) / det : 0;
    const segL = dist(a, b), eps = 1e-6 * segL;
    if (al < eps || ar < eps) { al = ar = segL / 3; } // repli heuristique
    return [a, addv(a, mul(t1, al)), addv(b, mul(t2, ar)), b];
  }

  function maxError(p, c, u) {
    let m = 0, idx = p.length >> 1;
    for (let i = 1; i < p.length - 1; i++) { const d = dist(bez(c, u[i]), p[i]); if (d > m) { m = d; idx = i; } }
    return [m, idx];
  }
  function reparam(p, c, u) {
    return u.map((t, i) => {
      const d = sub(bez(c, t), p[i]), d1 = bezD(c, t), d2 = bezDD(c, t);
      const den = dot(d1, d1) + dot(d, d2); if (!den) return t;
      return Math.min(1, Math.max(0, t - dot(d, d1) / den));
    });
  }

  function fitCubic(p, t1, t2, err, out, depth = 0) {
    if (p.length === 2) { const l = dist(p[0], p[1]) / 3; out.push([p[0], addv(p[0], mul(t1, l)), addv(p[1], mul(t2, l)), p[1]]); return; }
    let u = chordParams(p), c = generateBezier(p, u, t1, t2), [e, split] = maxError(p, c, u);
    if (e < err) { out.push(c); return; }
    if (e < err * 4) for (let i = 0; i < 6; i++) {
      u = reparam(p, c, u); c = generateBezier(p, u, t1, t2); [e, split] = maxError(p, c, u);
      if (e < err) { out.push(c); return; }
    }
    if (depth > 12) { out.push(c); return; }
    split = Math.max(1, Math.min(p.length - 2, split));
    const tc = norm(sub(p[split - 1], p[split + 1]));
    fitCubic(p.slice(0, split + 1), t1, tc, err, out, depth + 1);
    fitCubic(p.slice(split), mul(tc, -1), t2, err, out, depth + 1);
  }

  /** Vectorise une boucle polygonale en segments cubiques */
  function fitLoop(raw, opts = {}) {
    const n = raw.length;
    const size = Math.max(...raw.map(q => q[0])) - Math.min(...raw.map(q => q[0])) + Math.max(...raw.map(q => q[1])) - Math.min(...raw.map(q => q[1]));
    const k = opts.k || Math.max(2, Math.min(6, Math.round(size / 60) + 2));
    let corners = findCorners(raw, k, opts.cornerCos ?? -0.55);
    const fixed = new Set(); corners.forEach(c => { for (let d = -1; d <= 1; d++) fixed.add((c + d + n) % n); });
    const pts = smooth(raw, fixed, opts.smooth ?? 2);
    let breaks = corners.slice();
    if (breaks.length < 2) { // pas assez d'angles : on coupe en 4 parts régulières
      const add = [0, n >> 2, n >> 1, (3 * n) >> 2].filter(i => !breaks.some(b => Math.abs(b - i) < 3));
      breaks = [...breaks, ...add].sort((a, b) => a - b);
    }
    const isCorner = new Set(corners);
    const tangentAt = (i, forward) => {
      if (isCorner.has(i)) {
        const j = forward ? (i + k) % n : (i - k + n) % n; return norm(sub(pts[j], pts[i]));
      }
      const t = norm(sub(pts[(i + 2) % n], pts[(i - 2 + n) % n]));
      return forward ? t : mul(t, -1);
    };
    const err = opts.error ?? 0.8;
    const segs = [];
    for (let b = 0; b < breaks.length; b++) {
      const s = breaks[b], e = breaks[(b + 1) % breaks.length];
      const sec = []; for (let i = s; ; i = (i + 1) % n) { sec.push(pts[i]); if (i === e && sec.length > 1) break; if (sec.length > n + 1) break; }
      if (sec.length < 2) continue;
      const tmp = []; fitCubic(sec, tangentAt(s, true), tangentAt(e, false), err, tmp);
      segs.push(...tmp);
    }
    return segs.map(c => [c[0][0], c[0][1], c[1][0], c[1][1], c[2][0], c[2][1], c[3][0], c[3][1]]);
  }

  /** Bitmap -> contours de Bézier (repère image, sens : extérieurs aire>0) */
  function traceBitmap(bin, opts = {}) {
    const loops = marchingSquares(bin).filter(l => Math.abs(signedArea(l)) >= (opts.minArea ?? 3));
    return loops.map(l => fitLoop(l, opts));
  }

  /** Aire signée approximative d'un contour de Bézier (échantillonnage) */
  function contourArea(segs) {
    const p = []; for (const s of segs) { const c = [[s[0], s[1]], [s[2], s[3]], [s[4], s[5]], [s[6], s[7]]]; for (let t = 0; t < 1; t += 0.125) p.push(bez(c, t)); }
    return signedArea(p);
  }
  function reverseContour(segs) { return segs.slice().reverse().map(s => [s[6], s[7], s[4], s[5], s[2], s[3], s[0], s[1]]); }

  /** Rastérise des contours (règle non nulle) dans un bitmap w×h — utile aux tests et à l'IoU */
  function rasterize(contours, w, h, tf = (x, y) => [x, y]) {
    const polys = contours.map(segs => { const p = []; for (const s of segs) { const c = [[s[0], s[1]], [s[2], s[3]], [s[4], s[5]], [s[6], s[7]]]; for (let t = 0; t < 1; t += 1 / 16) p.push(tf(...bez(c, t))); } return p; });
    const d = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const yc = y + 0.5, xs = [];
      for (const p of polys) for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        if ((a[1] <= yc) !== (b[1] <= yc)) xs.push([a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), b[1] > a[1] ? 1 : -1]);
      }
      xs.sort((a, b) => a[0] - b[0]);
      let wn = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wn += xs[i][1];
        if (wn !== 0) for (let x = Math.max(0, Math.ceil(xs[i][0] - 0.5)); x < Math.min(w, Math.ceil(xs[i + 1][0] - 0.5)); x++) d[y * w + x] = 1;
      }
    }
    return { w, h, data: d };
  }

  function iou(a, b) { let i = 0, u = 0; for (let k = 0; k < a.data.length; k++) { if (a.data[k] && b.data[k]) i++; if (a.data[k] || b.data[k]) u++; } return u ? i / u : 1; }

  Object.assign(PA, { marchingSquares, signedArea, findCorners, fitCubic, fitLoop, traceBitmap, contourArea, reverseContour, rasterize, iou });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
