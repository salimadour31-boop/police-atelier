/* Police Atelier — synth.js
 * Synthèse des glyphes manquants, par ordre de préférence :
 *   1) dérivation (miroir / rotation : b↔d, p↔q, n↔u, 6↔9, M↔W…) ;
 *   2) repli de casse (capitale réduite à la hauteur d'x, ou l'inverse) ;
 *   3) composition (lettre de base + signe diacritique détecté ou généré) ;
 *   4) générateur « squelette » : tracés au trait, épaissis à la graisse mesurée,
 *      puis vectorisés — toujours marqués « généré ».
 * Arabe : formes positionnelles manquantes créées à partir des formes existantes
 * (trait de liaison à la ligne de base, épaisseur de kashida mesurée). */
(function (root) {
  const PA = root.PA = root.PA || {};
  const R = Math.PI / 180;

  // ---------- transformations de contours ----------
  /** Applique une transformation affine [a,b,c,d,e,f] : x'=a x + c y + e, y'=b x + d y + f */
  function transform(contours, m) {
    const det = m[0] * m[3] - m[1] * m[2];
    return contours.map(c => {
      const t = c.map(s => { const o = []; for (let i = 0; i < 8; i += 2) o.push(m[0] * s[i] + m[2] * s[i + 1] + m[4], m[1] * s[i] + m[3] * s[i + 1] + m[5]); return o; });
      return det < 0 ? PA.reverseContour(t) : t; // un miroir inverse le sens : on le rétablit
    });
  }
  const translate = (c, dx, dy) => transform(c, [1, 0, 0, 1, dx, dy]);
  /** Ramène l'encre à x=0 */
  function toOrigin(contours) { const b = PA.bboxOf(contours); return translate(contours, -b.xMin, 0); }
  function makeRec(key, contours, source, from) { const c = toOrigin(contours); return { key, contours: c, source, from, bbox: PA.bboxOf(c) }; }
  const clone = c => c.map(x => x.map(s => s.slice()));

  // ---------- générateur squelette ----------
  function arc(cx, cy, rx, ry, a0, a1, n) {
    n = n || Math.max(8, Math.ceil(Math.abs(a1 - a0) / 10)); const p = [];
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * R; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return p;
  }
  const ell = (cx, cy, rx, ry) => arc(cx, cy, rx, ry, 0, 360, 48);
  const bowl = (x0, y0, y1, w) => { const h = y1 - y0, rx = Math.min(h / 2, w * 0.55), xr = x0 + w - rx; return [[x0, y1], [xr, y1], ...arc(xr, (y0 + y1) / 2, rx, h / 2, 90, -90), [x0, y0]]; };
  const dot = (x, y) => [[x, y], [x, y + 1]];

  /** Squelettes : renvoie {w, strokes} pour un caractère, selon les métriques m et la graisse t */
  function skeleton(ch, m, t) {
    const C = m.capHeight, X = m.xHeight, A = m.ascender, D = m.descender, h = t / 2;
    const S = (w, ...strokes) => ({ w, strokes });
    const arch = (x0, w, top) => [[x0, top * 0.5], ...arc(x0 + w / 2, top * 0.55, w / 2, top * 0.45, 180, 0), [x0 + w, 0]];
    const bigS = (w, H) => [...arc(w / 2, H * 0.75, w / 2, H * 0.25 - h / 2, 20, 270), ...arc(w / 2, H * 0.25, w / 2, H * 0.25 - h / 2, 90, -160)];
    const T = {
      A: S(600, [[0, 0], [300, C], [600, 0]], [[120, C * .3], [480, C * .3]]),
      B: S(560, [[0, 0], [0, C]], bowl(0, C / 2, C, 480), bowl(0, 0, C / 2, 560)),
      C: S(620, arc(310, C / 2, 310, C / 2, 45, 315)),
      D: S(620, [[0, 0], [0, C]], bowl(0, 0, C, 620)),
      E: S(500, [[500, C], [0, C], [0, 0], [500, 0]], [[0, C / 2], [400, C / 2]]),
      F: S(480, [[480, C], [0, C], [0, 0]], [[0, C / 2], [380, C / 2]]),
      G: S(640, [...arc(320, C / 2, 320, C / 2, 45, 360)], [[350, C / 2], [640, C / 2], [640, C * .1]]),
      H: S(600, [[0, 0], [0, C]], [[600, 0], [600, C]], [[0, C / 2], [600, C / 2]]),
      I: S(0, [[0, 0], [0, C]]),
      J: S(450, [[450, C], ...arc(225, C * .3, 225, C * .3, 0, -180)]),
      K: S(560, [[0, 0], [0, C]], [[560, C], [0, C * .35]], [[170, C * .5], [560, 0]]),
      L: S(480, [[0, C], [0, 0], [480, 0]]),
      M: S(720, [[0, 0], [0, C], [360, C * .2], [720, C], [720, 0]]),
      N: S(600, [[0, 0], [0, C], [600, 0], [600, C]]),
      O: S(680, ell(340, C / 2, 340, C / 2)),
      P: S(540, [[0, 0], [0, C]], bowl(0, C * .45, C, 540)),
      Q: S(680, ell(340, C / 2, 340, C / 2), [[400, C * .25], [700, -C * .05]]),
      R: S(560, [[0, 0], [0, C]], bowl(0, C * .45, C, 540), [[250, C * .45], [560, 0]]),
      S: S(520, bigS(520, C)),
      T: S(560, [[0, C], [560, C]], [[280, C], [280, 0]]),
      U: S(600, [[0, C], ...arc(300, C * .35, 300, C * .35, 180, 360), [600, C]]),
      V: S(600, [[0, C], [300, 0], [600, C]]),
      W: S(820, [[0, C], [205, 0], [410, C * .7], [615, 0], [820, C]]),
      X: S(580, [[0, C], [580, 0]], [[580, C], [0, 0]]),
      Y: S(580, [[0, C], [290, C / 2], [580, C]], [[290, C / 2], [290, 0]]),
      Z: S(540, [[0, C], [540, C], [0, 0], [540, 0]]),
      a: S(460, ell(230, X / 2, 230, X / 2), [[460, X], [460, 0]]),
      b: S(480, [[0, A], [0, 0]], ell(240, X / 2, 240, X / 2)),
      c: S(420, arc(210, X / 2, 210, X / 2, 40, 320)),
      d: S(480, ell(240, X / 2, 240, X / 2), [[480, A], [480, 0]]),
      e: S(460, [[0, X / 2], [460, X / 2], ...arc(230, X / 2, 230, X / 2, 0, 320)]),
      f: S(300, [...arc(240, A - 120, 120, 120, 30, 180), [120, 0]], [[0, X], [260, X]]),
      g: S(480, ell(240, X / 2, 240, X / 2), [[480, X], [480, D + 110], ...arc(240, D + 110, 240, 110, 0, -170)]),
      h: S(460, [[0, A], [0, 0]], arch(0, 460, X)),
      i: S(0, [[0, 0], [0, X]], dot(0, X + 150)),
      j: S(0, [[0, X], [0, D + 100], ...arc(-100, D + 100, 100, 100, 0, -110)], dot(0, X + 150)),
      k: S(440, [[0, A], [0, 0]], [[440, X], [0, X * .35]], [[130, X * .5], [440, 0]]),
      l: S(0, [[0, 0], [0, A]]),
      m: S(720, [[0, 0], [0, X]], arch(0, 360, X), arch(360, 360, X)),
      n: S(460, [[0, 0], [0, X]], arch(0, 460, X)),
      o: S(480, ell(240, X / 2, 240, X / 2)),
      p: S(480, [[0, X], [0, D]], ell(240, X / 2, 240, X / 2)),
      q: S(480, ell(240, X / 2, 240, X / 2), [[480, X], [480, D]]),
      r: S(300, [[0, 0], [0, X]], arc(300, X * .5, 300, X * .5, 180, 80)),
      s: S(400, bigS(400, X)),
      t: S(300, [[110, A * .85], [110, 80], ...arc(190, 80, 80, 80, 180, 300)], [[0, X], [280, X]]),
      u: S(460, [[0, X], ...arc(230, X * .45, 230, X * .45, 180, 360)], [[460, X], [460, 0]]),
      v: S(440, [[0, X], [220, 0], [440, X]]),
      w: S(660, [[0, X], [165, 0], [330, X * .7], [495, 0], [660, X]]),
      x: S(440, [[0, X], [440, 0]], [[440, X], [0, 0]]),
      y: S(440, [[0, X], [230, 0]], [[440, X], [110, D]]),
      z: S(420, [[0, X], [420, X], [0, 0], [420, 0]]),
      '0': S(500, ell(250, C / 2, 250, C / 2)),
      '1': S(400, [[100, C * .8], [280, C], [280, 0]]),
      '2': S(500, [...arc(250, C * .72, 250, C * .28 - h / 2, 160, -30), [0, 0], [500, 0]]),
      '3': S(500, arc(250, C * .75, 225, C * .25 - h / 2, 150, -90), arc(250, C * .27, 250, C * .27, 90, -150)),
      '4': S(500, [[380, 0], [380, C], [0, C * .3], [500, C * .3]]),
      '5': S(500, [[450, C], [80, C], [60, C * .58], ...arc(250, C * .32, 250, C * .32, 130, -150)]),
      '6': S(500, ell(250, C * .3, 250, C * .3), [[420, C], [20, C * .35]]),
      '7': S(500, [[0, C], [500, C], [170, 0]]),
      '8': S(500, ell(250, C * .76, 210, C * .24 - h / 2), ell(250, C * .27, 250, C * .27)),
      '9': S(500, ell(250, C * .7, 250, C * .3), [[500, C * .65], [100, 0]]),
      '.': S(0, dot(0, h)), ',': S(60, [[60, h], [0, -120]]),
      ';': S(60, [[60, h], [0, -120]], dot(60, X - h)), ':': S(0, dot(0, h), dot(0, X - h)),
      '!': S(0, [[0, C], [0, C * .3]], dot(0, h)),
      '?': S(420, [...arc(210, C * .75, 210, C * .25, 160, -60), [210, C * .4], [210, C * .28]], dot(210, h)),
      "'": S(0, [[0, C], [0, C * .72]]), '"': S(160, [[0, C], [0, C * .72]], [[160, C], [160, C * .72]]),
      '-': S(260, [[0, X / 2], [260, X / 2]]), '_': S(500, [[0, D / 2], [500, D / 2]]),
      '(': S(140, arc(400, C * .35, 400, C * .62, 160, 200)), ')': S(140, arc(-260, C * .35, 400, C * .62, 20, -20)),
      '/': S(320, [[0, D / 2], [320, C]]),
      '&': S(560, ell(230, C * .78, 140, C * .2), [[140, C * .62], [560, 0]], [...arc(230, C * .27, 230, C * .27, 60, 330), [560, C * .4]]),
      '@': S(760, arc(380, C * .35, 380, C * .45, 0, 330), ell(360, C * .32, 150, C * .18), [[520, C * .5], [520, C * .2], [760, C * .35]]),
      '#': S(560, [[160, 0], [220, C]], [[340, 0], [400, C]], [[0, C * .65], [560, C * .65]], [[0, C * .32], [560, C * .32]]),
      '%': S(600, ell(120, C * .78, 110, C * .2), ell(480, C * .22, 110, C * .2), [[60, 0], [540, C]]),
      '+': S(480, [[0, X / 2], [480, X / 2]], [[240, X / 2 - 240], [240, X / 2 + 240]]),
      '=': S(480, [[0, X * .65], [480, X * .65]], [[0, X * .3], [480, X * .3]]),
      '*': S(360, [[180, C], [180, C * .55]], [[20, C * .9], [340, C * .65]], [[340, C * .9], [20, C * .65]]),
      '«': S(420, [[200, X * .85], [0, X / 2], [200, X * .15]], [[420, X * .85], [220, X / 2], [420, X * .15]]),
      '»': S(420, [[0, X * .85], [200, X / 2], [0, X * .15]], [[220, X * .85], [420, X / 2], [220, X * .15]]),
      'ɛ': S(400, arc(220, X * .73, 190, X * .27 - h / 2, 40, 270), arc(220, X * .27, 210, X * .27, 90, 320)),
      'Ɛ': S(520, arc(280, C * .75, 240, C * .25 - h / 2, 40, 270), arc(280, C * .27, 270, C * .27, 90, 320)),
      'ɣ': S(440, [[0, X], [220, -60]], [[440, X], [220, -60]], ell(220, -130, 60, 70)),
      'Ɣ': S(560, [[0, C], [280, 0]], [[560, C], [280, 0]], ell(280, -90, 80, 90)),
      // chiffres arabes-indiens (formes simples)
      '٠': S(160, ell(80, X * .45, 80, 90)), '١': S(0, [[0, 0], [0, C * .8]]),
      '٢': S(360, [[60, 0], [60, C * .8], [360, C * .8], [360, C * .6]]), '٣': S(420, [[60, 0], [60, C * .8], [200, C * .8], [200, C * .6], [320, C * .8], [420, C * .8], [420, C * .6]]),
      '٤': S(360, [[360, C * .8], ...arc(250, C * .6, 150, C * .2, 90, 270), ...arc(250, C * .2, 150, C * .2, 90, 270), [360, 0]]),
      '٥': S(360, ell(180, C * .35, 180, C * .35)), '٦': S(360, [[0, C * .8], [360, C * .8], [360, 0]]),
      '٧': S(440, [[0, C * .8], [220, 0], [440, C * .8]]), '٨': S(440, [[0, 0], [220, C * .8], [440, 0]]),
      '٩': S(360, ell(150, C * .6, 150, C * .2), [[300, C * .6], [300, 0]])
    };
    return T[ch] || null;
  }

  /** Trace des segments épaissis (traits ronds) dans un bitmap puis vectorise -> contours en unités */
  function strokeOutline(sk, t) {
    const r = 0.25, pad = t, pts = sk.strokes.flat();
    const xMin = Math.min(...pts.map(p => p[0])) - pad, xMax = Math.max(...pts.map(p => p[0])) + pad;
    const yMin = Math.min(...pts.map(p => p[1])) - pad, yMax = Math.max(...pts.map(p => p[1])) + pad;
    const w = Math.ceil((xMax - xMin) * r) + 2, h = Math.ceil((yMax - yMin) * r) + 2, d = new Uint8Array(w * h);
    const hw = t / 2 * r;
    for (const s of sk.strokes) for (let i = 0; i < s.length - 1; i++) {
      const ax = (s[i][0] - xMin) * r, ay = (yMax - s[i][1]) * r, bx = (s[i + 1][0] - xMin) * r, by = (yMax - s[i + 1][1]) * r;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw - 1)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + hw + 1));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw - 1)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + hw + 1));
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1e-9;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5; let u = ((px - ax) * vx + (py - ay) * vy) / L2; u = Math.max(0, Math.min(1, u));
        if (Math.hypot(px - ax - u * vx, py - ay - u * vy) <= hw) d[y * w + x] = 1;
      }
    }
    const loops = PA.traceBitmap({ w, h, data: d }, { error: 0.7 });
    const rec = { contours: loops.map(c => c.map(q => { const o = []; for (let i = 0; i < 8; i += 2) o.push(q[i] / r + xMin, yMax - q[i + 1] / r); return o; })) };
    PA.normalizeOrientation(rec);
    return rec.contours;
  }

  function generate(key, m, t) {
    const sk = skeleton(key, m, t); if (!sk) return null;
    return makeRec(key, strokeOutline(sk, t), 'generated');
  }

  // ---------- signes diacritiques ----------
  const MARK_OF = { 'é': 'acute', 'è': 'grave', 'ê': 'circ', 'ë': 'diaer', 'ï': 'diaer', 'î': 'circ', 'û': 'circ', 'ô': 'circ', 'à': 'grave', 'ù': 'grave', 'ç': 'cedilla', 'č': 'caron', 'ǧ': 'caron', 'ḥ': 'dotbelow', 'ṛ': 'dotbelow', 'ṣ': 'dotbelow', 'ṭ': 'dotbelow', 'ẓ': 'dotbelow', 'ḍ': 'dotbelow' };
  const BASE_OF = k => { const d = k.normalize('NFD'); return d.length > 1 ? d[0] : null; };
  /** Repère les signes dans les glyphes tracés : contours au-dessus de la hauteur d'x (ou sous la ligne de base) */
  function extractMarks(G, m) {
    const marks = {};
    for (const [k, mk] of Object.entries(MARK_OF)) {
      const g = G[k]; if (!g || g.source !== 'traced') continue;
      const below = mk === 'cedilla' || mk === 'dotbelow';
      const parts = g.contours.filter(c => { const b = PA.bboxOf([c]); return below ? b.yMax < m.xHeight * 0.05 && (mk === 'dotbelow' || b.yMin < -10) : b.yMin > m.xHeight * 1.02; });
      // pour la cédille on exclut la descendante éventuelle (garde la plus petite pièce)
      if (parts.length && !marks[mk]) marks[mk] = { contours: clone(parts), source: 'traced', from: k };
    }
    const i = G['i'] || G['j'];
    if (i && i.source === 'traced') {
      const dots = i.contours.filter(c => PA.bboxOf([c]).yMin > m.xHeight * 1.02);
      if (dots.length) { marks.dot = { contours: clone(dots), source: 'traced', from: i.key }; if (!marks.dotbelow) marks.dotbelow = { contours: clone(dots), source: 'traced', from: i.key, moveBelow: true }; if (!marks.diaer) marks.diaer = { contours: [...clone(dots), ...translate(clone(dots), PA.bboxOf(dots).xMax - PA.bboxOf(dots).xMin + m.xHeight * 0.12, 0)], source: 'traced', from: i.key }; }
    }
    return marks;
  }
  function genMark(mk, m, t) {
    const X = m.xHeight, y = X + 60, W = Math.max(60, t * 0.8);
    const sk = {
      acute: [[[-40, y], [60, y + 140]]], grave: [[[40, y], [-60, y + 140]]], circ: [[[-100, y], [0, y + 120], [100, y]]],
      caron: [[[-100, y + 120], [0, y], [100, y + 120]]], diaer: [dot(-90, y + 40), dot(90, y + 40)], dot: [dot(0, y + 40)],
      dotbelow: [dot(0, -90 - t / 2)], cedilla: [[[0, 0], [0, -60], [60, -110], [0, -170], [-50, -170]]],
      madda: [[[-110, y + 40], [-50, y + 90], [40, y + 30], [110, y + 80]]], dots2: [dot(-70, y + 40), dot(70, y + 40)]
    }[mk];
    if (!sk) return null;
    return { contours: strokeOutline({ strokes: sk }, mk.startsWith('dot') || mk === 'diaer' ? W * 1.15 : t * 0.75), source: 'generated' };
  }
  /** Compose base + signe : centré horizontalement sur la base, posé au-dessus ou en dessous */
  function compose(key, base, mark, kind, m) {
    let bc = clone(base.contours);
    if ((base.key === 'i' || base.key === 'j') && kind !== 'dotbelow' && kind !== 'cedilla') bc = bc.filter(c => PA.bboxOf([c]).yMin <= m.xHeight * 1.02); // i sans point
    const bb = PA.bboxOf(bc), mb0 = PA.bboxOf(mark.contours), gap = m.xHeight * 0.1;
    const below = kind === 'cedilla' || kind === 'dotbelow';
    let mc = clone(mark.contours);
    const cx = (bb.xMin + bb.xMax) / 2 - (mb0.xMin + mb0.xMax) / 2;
    let dy;
    if (kind === 'cedilla') dy = (bb.yMin + 5) - mb0.yMax;
    else if (below) dy = (Math.min(bb.yMin, 0) - gap) - mb0.yMax;
    else dy = (bb.yMax + gap) - mb0.yMin;
    mc = translate(mc, cx, dy);
    const src = base.source === 'traced' && mark.source === 'traced' ? 'derived' : (base.source === 'generated' || mark.source === 'generated' ? 'generated' : 'derived');
    return makeRec(key, [...bc, ...mc], src, `${base.key} + ${kind}`);
  }

  // ---------- dérivations ----------
  const MIRROR = { b: ['d', 'h'], d: ['b', 'h'], p: ['q', 'h'], q: ['p', 'h'], '(': [')', 'h'], ')': ['(', 'h'], '«': ['»', 'h'], '»': ['«', 'h'], '/': null };
  const ROT = { b: 'q', q: 'b', d: 'p', p: 'd', n: 'u', u: 'n', '6': '9', '9': '6', M: 'W', W: 'M', 'N': 'N', 'Z': 'Z', 'S': 'S', 's': 's', 'z': 'z', 'o': 'o', 'O': 'O', 'x': 'x', 'X': 'X' };
  function derive(key, G, m) {
    const mir = MIRROR[key];
    if (mir && G[mir[0]] && G[mir[0]].source !== 'generated') {
      const g = G[mir[0]], b = g.bbox;
      return makeRec(key, transform(g.contours, [-1, 0, 0, 1, b.xMax + b.xMin, 0]), 'derived', `miroir de ${g.key}`);
    }
    for (const [src, dst] of Object.entries(ROT)) if (dst === key && src !== key && G[src] && G[src].source !== 'generated') {
      const g = G[src], b = g.bbox;
      // rotation de 180° autour du centre de la zone (b,d,p,q : autour de la hauteur d'x)
      const cy = /[bdpqnu]/.test(key) ? m.xHeight / 2 : (b.yMin + b.yMax) / 2;
      let c = transform(g.contours, [-1, 0, 0, -1, b.xMax + b.xMin, 2 * cy]);
      if (/[bdpq]/.test(key)) { const nb = PA.bboxOf(c); const asc = /[bd]/.test(key); c = translate(c, 0, asc ? (0 - Math.min(0, nb.yMin)) * 0 : 0); }
      return makeRec(key, c, 'derived', `rotation de ${g.key}`);
    }
    // repli de casse
    const other = key === key.toUpperCase() ? key.toLowerCase() : key.toUpperCase();
    if (other !== key && /^[A-Za-z]$/.test(key) && G[other] && G[other].source !== 'generated') {
      const g = G[other], s = key === key.toLowerCase() ? m.xHeight / m.capHeight : m.capHeight / m.xHeight;
      return makeRec(key, transform(g.contours, [s, 0, 0, s, 0, 0]), 'derived', `${g.key} mis à l'échelle`);
    }
    if ((key === 'Ɛ' || key === 'Ɣ') && G[key.toLowerCase()] && G[key.toLowerCase()].source !== 'generated') {
      const g = G[key.toLowerCase()], s = m.capHeight / m.xHeight;
      return makeRec(key, transform(g.contours, [s, 0, 0, s, 0, 0]), 'derived', `${g.key} mis à l'échelle`);
    }
    return null;
  }
  /** Ligatures-collages : œ = o+e, æ = a+e (et capitales) */
  function juxtapose(key, a, b, m) {
    const ov = Math.max(20, m.xHeight * 0.06);
    const bc = translate(b.contours, a.bbox.xMax - ov - b.bbox.xMin, 0);
    const src = a.source === 'generated' || b.source === 'generated' ? 'generated' : 'derived';
    return makeRec(key, [...clone(a.contours), ...bc], src, `${a.key}+${b.key}`);
  }

  // ---------- arabe ----------
  function joinStroke(rec, side, len, t) {
    const b = rec.bbox, o = t * 0.4, c = [];
    const rect = (x0, x1) => [[x0, 0, x0 + (x1 - x0) / 3, 0, x0 + 2 * (x1 - x0) / 3, 0, x1, 0], [x1, 0, x1, t / 3, x1, 2 * t / 3, x1, t], [x1, t, x1 - (x1 - x0) / 3, t, x1 - 2 * (x1 - x0) / 3, t, x0, t], [x0, t, x0, 2 * t / 3, x0, t / 3, x0, 0]];
    if (side.includes('L')) c.push(rect(b.xMin - len, b.xMin + o));
    if (side.includes('R')) c.push(rect(b.xMax - o, b.xMax + len));
    return c;
  }
  function synthArabic(G, m, t, report) {
    const AR = PA.AR, F = PA.FORMS, k = t * 0.85, len = Math.max(60, t * 1.2);
    const hasArabic = Object.keys(G).some(PA.isArabicKey);
    if (!hasArabic) return;
    const marks = { hamza: G['ء'] && G['ء'].source === 'traced' ? { contours: transform(G['ء'].contours, [0.55, 0, 0, 0.55, 0, 0]), source: 'traced' } : null };
    const above = (base, mk, key, belowFlag) => {
      if (!base || !mk) return null; const bb = base.bbox, mb = PA.bboxOf(mk.contours);
      const dy = belowFlag ? (bb.yMin - 40) - mb.yMax : (bb.yMax + 40) - mb.yMin;
      const r = makeRec(key, [...clone(base.contours), ...translate(clone(mk.contours), (bb.xMin + bb.xMax) / 2 - (mb.xMin + mb.xMax) / 2, dy)], mk.source === 'traced' ? 'derived' : 'generated', `${base.key} + hamza`);
      return r;
    };
    // 1) lettres hamzées / dérivées manquantes (formes isolées)
    const want = (key, f) => { if (!G[key]) { const r = f(); if (r) { G[key] = r; report.push(r); } } };
    const hz = marks.hamza || genMark('dot', m, t) && { contours: strokeOutline({ strokes: [[[0, 0], [-60, 40], [0, 90], [70, 70]]] }, t * 0.6), source: 'generated' };
    want('أ', () => above(G['ا'], hz, 'أ'));
    want('إ', () => above(G['ا'], hz, 'إ', true));
    want('آ', () => above(G['ا'], genMark('madda', m, t), 'آ'));
    want('ؤ', () => above(G['و'], hz, 'ؤ'));
    want('ى', () => G['ي'] ? makeRec('ى', G['ي'].contours.filter(c => { const b = PA.bboxOf([c]); return (b.xMax - b.xMin) > t * 2.5 || b.yMax > 0 && b.yMin > -t; }), 'derived', 'ي sans points') : null);
    want('ئ', () => above(G['ى'], hz, 'ئ'));
    want('ة', () => G['ه'] ? compose('ة', G['ه'], genMark('dots2', m, t), 'dots2', m) : null);
    // 2) formes positionnelles
    for (const l of Object.keys(AR)) {
      if (l === 'لا') continue;
      const keys = AR[l].map((_, i) => PA.arKey(l, F[i]));
      const have = keys.filter(x => G[x]);
      if (!have.length) continue;
      const isol = G[keys[0]] || G[have[0]];
      if (!G[keys[0]]) { G[keys[0]] = makeRec(keys[0], clone(isol.contours), 'derived', `depuis ${isol.key}`); report.push(G[keys[0]]); }
      const sides = { fina: 'R', init: 'L', medi: 'LR' };
      keys.slice(1).forEach((key, i) => {
        if (G[key]) return;
        const f = F[i + 1], src = (f === 'medi' && G[PA.arKey(l, 'init')]) ? G[PA.arKey(l, 'init')] : G[keys[0]];
        const add = f === 'medi' && src.key !== keys[0] ? 'R' : sides[f];
        const r = makeRec(key, [...clone(src.contours), ...joinStroke(src, add, len, k)], 'generated', `${src.key} + liaison`);
        G[key] = r; report.push(r);
      });
    }
    // 3) lam-alif
    const lamI = G['ل.init'], alefF = G['ا.fina'];
    if (lamI && alefF) {
      for (const [key, lam] of [['لا', lamI], ['لا.fina', G['ل.medi'] || lamI]]) if (!G[key]) {
        const c = [...translate(clone(alefF.contours), -alefF.bbox.xMin, 0), ...translate(clone(lam.contours), alefF.bbox.xMax - alefF.bbox.xMin - lam.bbox.xMin - k, 0)];
        G[key] = makeRec(key, c, 'generated', 'ا + ل'); report.push(G[key]);
      }
    }
    // 4) ponctuation arabe dérivée
    const rot = (key, src, m6) => want(key, () => G[src] ? makeRec(key, transform(G[src].contours, m6(G[src].bbox)), 'derived', `depuis ${src}`) : null);
    rot('،', ',', b => [-1, 0, 0, -1, b.xMax + b.xMin, b.yMax + b.yMin + 120]);
    rot('؛', ';', b => [1, 0, 0, -1, 0, b.yMax + b.yMin + 100]);
    rot('؟', '?', b => [-1, 0, 0, 1, b.xMax + b.xMin, 0]);
    for (const d of PA.AR_DIGITS) want(d, () => generate(d, m, t));
  }

  /** Complète la police. G : {clé: record}. Renvoie la liste des glyphes ajoutés. */
  function synthesize(G, m, analysis) {
    const t = Math.max(30, (analysis && analysis.weight) || Math.round(m.capHeight * 0.12));
    const added = [];
    const put = r => { if (r) { G[r.key] = r; added.push(r); } return r; };
    const marks = extractMarks(G, m);
    const getMark = mk => marks[mk] || (marks[mk] = genMark(mk, m, t));
    // passe 1 : bases (dérivation puis génération)
    const bases = [...PA.REQUIRED, 'ɛ', 'ɣ'];
    for (let pass = 0; pass < 2; pass++) for (const k of bases) if (!G[k]) { const r = derive(k, G, m); if (r) put(r); }
    for (const k of bases) if (!G[k]) put(generate(k, m, t));
    // passe 2 : composés (français, kabyle, capitales accentuées)
    const composed = [...PA.FRENCH, ...PA.KABYLE, ...PA.UPPER_EXTRA];
    for (const k of composed) {
      if (G[k]) continue;
      if (k === 'œ' || k === 'æ') { const a = G[k === 'œ' ? 'o' : 'a'], e = G['e']; if (a && e) put(juxtapose(k, a, e, m)); continue; }
      if (k === 'Œ' || k === 'Æ') { const a = G[k === 'Œ' ? 'O' : 'A'], e = G['E']; if (a && e) put(juxtapose(k, a, e, m)); continue; }
      if (k === 'Ɛ' || k === 'Ɣ') { put(derive(k, G, m) || generate(k, m, t)); continue; }
      const base = BASE_OF(k), mk = MARK_OF[k.toLowerCase()];
      if (base && mk && G[base]) put(compose(k, G[base], getMark(mk), mk, m));
    }
    synthArabic(G, m, t, added);
    return added;
  }

  Object.assign(PA, { transform, translate, toOrigin, makeRec, skeleton, strokeOutline, generate, extractMarks, genMark, compose, derive, synthesize });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
