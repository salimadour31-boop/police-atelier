/* Police Atelier — analyse.js
 * Analyse de la structure : graisse (épaisseur de trait), contraste, inclinaison,
 * rapport hauteur d'x / capitales, présence d'empattements ; et détection des
 * métriques (ligne de base, hauteur d'x, capitales, ascendantes, descendantes). */
(function (root) {
  const PA = root.PA = root.PA || {};
  const med = a => PA.median(a);
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

  /** Transformée de distance de chanfrein 3-4 (valeurs ≈ 3 × distance au fond) */
  function distanceTransform(bin) {
    const { w, h, data } = bin, D = new Float32Array(w * h), INF = 1e9;
    for (let i = 0; i < D.length; i++) D[i] = data[i] ? INF : 0;
    const g = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : D[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!D[i]) continue; D[i] = Math.min(D[i], g(x - 1, y) + 3, g(x, y - 1) + 3, g(x - 1, y - 1) + 4, g(x + 1, y - 1) + 4); }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!D[i]) continue; D[i] = Math.min(D[i], g(x + 1, y) + 3, g(x, y + 1) + 3, g(x + 1, y + 1) + 4, g(x - 1, y + 1) + 4); }
    return D;
  }
  /** Épaisseurs locales (en px) mesurées sur les crêtes de la transformée de distance */
  function strokeSamples(bin) {
    const D = distanceTransform(bin), { w, h } = bin, out = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const v = D[y * w + x]; if (!v) continue;
      let ridge = true;
      for (let dy = -1; dy <= 1 && ridge; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && D[(y + dy) * w + x + dx] > v) { ridge = false; break; }
      if (ridge) out.push(2 * v / 3 - 1);
    }
    return out.filter(t => t > 0.5);
  }

  const DESC = new Set('gjpqyçɣǧ,;'.split('')), XLET = new Set('acemnorsuvwxz'.split('')), ASC = new Set('bdfhklt'.split(''));
  const FLATCAP = new Set('BDEFHIKLMNPRTUVWXYZ'.split(''));
  const STEM = ['I', 'l', 'i', 'H', 'T', 'K', 'n', 'm', 'h', 'r'];

  /** Métriques en unités (repère police) à partir des glyphes tracés {key, bbox:{yMin,yMax}} */
  function detectMetrics(glyphs) {
    const by = f => glyphs.filter(g => g.source === 'traced' && f(g.key));
    const tops = s => s.map(g => g.bbox.yMax), bots = s => s.map(g => g.bbox.yMin);
    const caps = by(k => FLATCAP.has(k)), xs = by(k => XLET.has(k)), asc = by(k => ASC.has(k)), desc = by(k => DESC.has(k) && /[a-zɣǧç]/.test(k));
    const capHeight = caps.length ? med(tops(caps)) : (xs.length ? med(tops(xs)) / 0.7 : 700);
    const xHeight = xs.length ? med(tops(xs)) : capHeight * 0.7;
    const ascender = asc.length ? Math.max(capHeight, med(tops(asc))) : capHeight * 1.05;
    const descender = desc.length ? med(bots(desc)) : -0.3 * capHeight;
    return { capHeight: Math.round(capHeight), xHeight: Math.round(xHeight), ascender: Math.round(ascender), descender: Math.round(Math.min(-20, descender)), baseline: 0 };
  }

  /** Analyse de structure. glyphs : records avec .bitmap (px) et .scale (unités/px) */
  function analyseStructure(glyphs, metrics) {
    const traced = glyphs.filter(g => g.source === 'traced' && g.bitmap);
    if (!traced.length) return null;
    const samples = [];
    for (const g of traced) for (const t of strokeSamples(g.bitmap)) samples.push(t * g.scale);
    const weight = med(samples);
    const thin = pct(samples, 0.15), thick = pct(samples, 0.85);
    const contrast = thin > 0 ? thick / thin : 1;
    // inclinaison : cisaillement maximisant la netteté du profil vertical
    let bestA = 0, bestS = -1;
    for (let a = -25; a <= 25; a += 1) {
      const t = Math.tan(a * Math.PI / 180); let S = 0;
      for (const g of traced) {
        const { w, h, data } = g.bitmap, hist = new Map(); let n = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) { const k = Math.round(x - (h - y) * t); hist.set(k, (hist.get(k) || 0) + 1); n++; }
        let s = 0; for (const v of hist.values()) s += v * v; S += s / Math.max(1, n * n);
      }
      if (S > bestS) { bestS = S; bestA = a; }
    }
    // empattements : pied plus large que le fût sur les lettres à fût simple
    let votes = 0, n = 0;
    for (const g of traced.filter(g => STEM.includes(g.key))) {
      const { w, h, data } = g.bitmap, run = y => { let best = 0, c = 0; for (let x = 0; x < w; x++) { c = data[y * w + x] ? c + 1 : 0; best = Math.max(best, c); } return best; };
      const foot = Math.max(run(h - 3), run(h - 4)), mid = run(Math.round(h * 0.55));
      n++; if (mid > 0 && foot > 1.7 * mid) votes++;
    }
    return {
      weight: Math.round(weight), contrast: +contrast.toFixed(2), slant: bestA,
      xRatio: +(metrics.xHeight / metrics.capHeight).toFixed(3), serif: n ? votes / n >= 0.5 : null, serifVotes: `${votes}/${n}`,
      thin: Math.round(thin), thick: Math.round(thick)
    };
  }
  Object.assign(PA, { distanceTransform, strokeSamples, detectMetrics, analyseStructure, DESC, XLET });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
