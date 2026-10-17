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
    const hs = comps.map(c => c.y1 - c.y0 + 1); const ma = median(comps.map(c => c.area)) || 1;
    // hauteur de référence : seulement les « corps » (les petites pièces faussent la médiane)
    const mh = median(comps.filter(c => c.area >= 0.5 * ma).map(c => c.y1 - c.y0 + 1)) || median(hs) || 1;
    let list = comps.map(c => Object.assign({}, c, { body: [c.x0, c.y0, c.x1, c.y1] })); // body : boîte d'origine, avant fusion
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
        const [bx0, by0, bx1, by1] = b.body; // on compare au corps de la lettre, pas aux signes déjà fusionnés
        const ov = Math.min(a.x1, bx1) - Math.max(a.x0, bx0) + 1;
        const cx = (a.x0 + a.x1) / 2, bcx = (bx0 + bx1) / 2;
        // écart horizontal (0 si chevauchement) : les points manuscrits sont souvent décalés
        const hgap = ov > 0 ? 0 : -ov;
        if (hgap > 0.35 * mh) continue;
        const gap = a.y1 < by0 ? by0 - a.y1 : (a.y0 > by1 ? a.y0 - by1 : 0);
        if (gap > 0.6 * mh) continue;
        if (gap === 0 && ov > 0) continue; // chevauchement vertical : lettres voisines
        if (gap === 0) continue;
        const d = gap + Math.abs(cx - bcx) * 0.8 + hgap;
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best >= 0) { mergeInto(list[best], a); dead.add(i); }
    }
    list = list.filter((c, i) => !dead.has(i));
    // « " » : deux petites marques voisines, même taille, même hauteur -> fusion
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; if (!a || !b) continue;
      const ha = a.y1 - a.y0 + 1, hb = b.y1 - b.y0 + 1;
      if (ha > 0.5 * mh || hb > 0.5 * mh || a.area > 0.3 * ma || b.area > 0.3 * ma) continue;
      const hgap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
      const vov = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (hgap > 0 && hgap < 0.22 * mh && vov > 0.6 * Math.min(ha, hb) && Math.abs(ha - hb) < 0.35 * Math.max(ha, hb) && a.parts == null && b.parts == null) { mergeInto(a, b); a.parts = 2; list[j] = null; }
    }
    return list.filter(Boolean);
  }
  // deux marques de taille voisine empilées (« : », « = »)
  function similarStack(a, b) {
    const ra = a.area / Math.max(1, b.area);
    return ra > 0.5 && ra < 2 && Math.abs((a.x0 + a.x1) - (b.x0 + b.x1)) < (b.x1 - b.x0 + 1);
  }

  /** Regroupe en lignes puis trie dans l'ordre de lecture (haut→bas, gauche→droite) */
  function readingOrder(glyphs) {
    // 1) lignes par regroupement 1D des centres des « corps » (composantes de taille normale),
    //    coupure là où l'écart entre centres consécutifs dépasse 0,55 × hauteur médiane ;
    // 2) chaque petite composante (point, accent, ponctuation) rejoint la ligne dont la bande
    //    verticale est la plus proche ; 3) tri gauche→droite dans chaque ligne.
    if (!glyphs.length) return [];
    const hs = glyphs.map(g => g.y1 - g.y0 + 1), mh = median(hs) || 1;
    const bodies = glyphs.filter(g => g.y1 - g.y0 + 1 >= 0.45 * mh);
    const cy = g => (g.y0 + g.y1) / 2;
    const sorted = [...(bodies.length ? bodies : glyphs)].sort((a, b) => cy(a) - cy(b));
    const lines = [];
    for (const g of sorted) {
      const L = lines[lines.length - 1];
      if (L && cy(g) - L.lastCy < 0.55 * mh) { L.items.push(g); L.lastCy = cy(g); }
      else lines.push({ items: [g], lastCy: cy(g) });
    }
    for (const L of lines) { L.top = median(L.items.map(g => g.y0)); L.bot = median(L.items.map(g => g.y1)); L.cy = (L.top + L.bot) / 2; }
    const inBody = new Set(sorted);
    for (const g of glyphs) {
      if (inBody.has(g)) continue;
      let best = lines[0], bd = Infinity;
      for (const L of lines) { const c = cy(g), d = c < L.top ? L.top - c : c > L.bot ? c - L.bot : 0; if (d < bd) { bd = d; best = L; } }
      best.items.push(g);
    }
    lines.sort((a, b) => a.cy - b.cy);
    const out = [];
    lines.forEach((L, li) => { L.items.sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1)); L.items.forEach(g => { g.line = li; out.push(g); }); });
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
