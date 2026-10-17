/* Police Atelier — segment.js
 * Segmentation en composantes connexes (8-connexité), fusion des points
 * (i, j), accents, cédilles et points souscrits, regroupement en lignes et
 * tri dans l'ordre de lecture. */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** Composantes connexes : [{x0,y0,x1,y1,area,pixels:Int32Array}] (x1,y1 inclusifs) */
  function components(bin) {
    const { w, h, data } = bin, lab = new Int32Array(w * h), out = [];
    const stack = new Int32Array(w * h);
    let id = 0;
    for (let i = 0; i < data.length; i++) {
      if (!data[i] || lab[i]) continue;
      id++; let sp = 0; stack[sp++] = i; lab[i] = id;
      const px = []; let x0 = w, y0 = h, x1 = -1, y1 = -1;
      while (sp) {
        const p = stack[--sp]; px.push(p);
        const x = p % w, y = (p - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (data[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; }
        }
      }
      out.push({ x0, y0, x1, y1, area: px.length, pixels: Int32Array.from(px) });
    }
    return out;
  }

  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

  function mergeInto(a, b) { // b fusionné dans a
    a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
    a.area += b.area; a.parts = (a.parts || 1) + (b.parts || 1);
    const p = new Int32Array(a.pixels.length + b.pixels.length); p.set(a.pixels); p.set(b.pixels, a.pixels.length); a.pixels = p;
  }

  /** Fusionne les petites composantes (points, accents) avec la lettre la plus proche
   *  qui les recouvre horizontalement, au-dessus ou en dessous. */
  function mergeMarks(comps) {
    const hs = comps.map(c => c.y1 - c.y0 + 1); const mh = median(hs) || 1, ma = median(comps.map(c => c.area)) || 1;
    let list = comps.map(c => Object.assign({}, c));
    // ordre : petites d'abord
    const order = list.map((c, i) => i).sort((i, j) => list[i].area - list[j].area);
    const dead = new Set();
    for (const i of order) {
      const a = list[i]; if (dead.has(i)) continue;
      const ah = a.y1 - a.y0 + 1, aw = a.x1 - a.x0 + 1;
      if (!(a.area < 0.3 * ma && ah < 0.5 * mh)) continue; // pas une marque
      let best = -1, bestD = Infinity;
      for (let j = 0; j < list.length; j++) {
        if (j === i || dead.has(j)) continue;
        const b = list[j];
        if (b.area < a.area * 1.15 && !(similarStack(a, b))) continue;
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
        const cx = (a.x0 + a.x1) / 2;
        if (ov < 0.4 * aw && !(cx >= b.x0 && cx <= b.x1)) continue;
        const gap = a.y1 < b.y0 ? b.y0 - a.y1 : (a.y0 > b.y1 ? a.y0 - b.y1 : 0);
        if (gap > 0.55 * mh) continue;
        if (gap === 0 && ov > 0) continue; // chevauchement vertical : lettres voisines
        const d = gap + Math.abs(cx - (b.x0 + b.x1) / 2) * 0.3;
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best >= 0) { mergeInto(list[best], a); dead.add(i); }
    }
    return list.filter((c, i) => !dead.has(i));
  }
  // deux marques de taille voisine empilées (« : », « = »)
  function similarStack(a, b) {
    const ra = a.area / Math.max(1, b.area);
    return ra > 0.5 && ra < 2 && Math.abs((a.x0 + a.x1) - (b.x0 + b.x1)) < (b.x1 - b.x0 + 1);
  }

  /** Regroupe en lignes puis trie dans l'ordre de lecture (haut→bas, gauche→droite) */
  function readingOrder(glyphs) {
    const mh = median(glyphs.map(g => g.y1 - g.y0 + 1)) || 1;
    const sorted = [...glyphs].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const lines = [];
    for (const g of sorted) {
      const cy = (g.y0 + g.y1) / 2;
      let line = lines.find(L => Math.abs(cy - L.cy) < 0.6 * mh);
      if (!line) { line = { cy, items: [] }; lines.push(line); }
      line.items.push(g);
      line.cy = median(line.items.map(t => (t.y0 + t.y1) / 2));
    }
    lines.sort((a, b) => a.cy - b.cy);
    const out = [];
    lines.forEach((L, li) => { L.items.sort((a, b) => a.x0 - b.x0); L.items.forEach(g => { g.line = li; out.push(g); }); });
    return out;
  }

  /** Extrait le bitmap d'un glyphe (avec marge de 1 px) */
  function cropGlyph(bin, g, pad = 1) {
    const w = g.x1 - g.x0 + 1 + 2 * pad, h = g.y1 - g.y0 + 1 + 2 * pad, d = new Uint8Array(w * h);
    for (const p of g.pixels) {
      const x = p % bin.w, y = (p - x) / bin.w;
      d[(y - g.y0 + pad) * w + (x - g.x0 + pad)] = 1;
    }
    return { w, h, data: d, ox: g.x0 - pad, oy: g.y0 - pad };
  }

  /** Pipeline complet de segmentation */
  function segment(bin, opts = {}) {
    let comps = components(bin).filter(c => c.area >= (opts.minArea || 4));
    comps = mergeMarks(comps);
    return readingOrder(comps);
  }

  Object.assign(PA, { components, mergeMarks, readingOrder, cropGlyph, segment, median });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
