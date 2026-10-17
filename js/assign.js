/* Police Atelier — assign.js
 * Attribution robuste des caractères en texte libre.
 * Chaque composante est décrite par sa position par rapport à la ligne de base de sa ligne
 * (haut et bas relatifs à la hauteur des capitales de la ligne). Chaque caractère attendu a
 * un profil (capitale, minuscule à ascendante/descendante, ponctuation…). Un alignement par
 * programmation dynamique (type distance d'édition) apparie les deux suites en autorisant
 * des composantes en trop (non attribuées) et des caractères manquants, au lieu d'attribuer
 * aveuglément dans l'ordre. Les appariements peu plausibles sont marqués « suspects ». */
(function (root) {
  const PA = root.PA = root.PA || {};

  /** Profil attendu [haut, bas] en fraction de la hauteur des capitales (bas > 0 : sous la ligne de base) */
  function expected(ch) {
    if (!ch) return null;
    const base = ch.normalize('NFD')[0], hasAbove = /[\u0300-\u0308\u030A\u030C]/.test(ch.normalize('NFD')), hasBelow = /[\u0323\u0327]/.test(ch.normalize('NFD'));
    let t, b;
    if (/[A-Z0-9]/.test(base)) { t = 1; b = base === 'Q' ? 0.12 : base === 'J' ? 0.05 : 0; }
    else if (/[bdfhkl]/.test(base)) { t = 1.03; b = 0; }
    else if (base === 't') { t = 0.88; b = 0; }
    else if (base === 'i') { t = 0.98; b = 0; }
    else if (base === 'j') { t = 0.98; b = 0.28; }
    else if (/[gpqyɣ]/.test(base)) { t = 0.68; b = 0.28; }
    else if (/[a-zɛœæ]/.test(base)) { t = 0.68; b = 0; }
    else if (/[ÆŒƐƔ]/.test(base)) { t = 1; b = base === 'Ɣ' ? 0.2 : 0; }
    else return ({ '.': [0.15, 0], ',': [0.15, 0.15], ';': [0.68, 0.15], ':': [0.68, 0], '!': [1, 0], '?': [1, 0], "'": [1, -0.62], '"': [1, -0.62],
      '-': [0.42, -0.28], '_': [-0.02, 0.12], '(': [1.05, 0.2], ')': [1.05, 0.2], '/': [1.02, 0.1], '«': [0.6, -0.1], '»': [0.6, -0.1], '*': [1, -0.5],
      '+': [0.75, -0.1], '=': [0.55, -0.2] })[ch] || null;
    if (hasAbove) t = /[A-Z]/.test(base) ? 1.25 : Math.max(t, 0.98);
    if (hasBelow) b = Math.max(b, 0.2);
    return [t, b];
  }
  /** Nombre de contre-formes attendu (null = variable selon les polices) */
  const HOLES = { A: 1, B: 2, D: 1, O: 1, P: 1, Q: 1, R: 1, a: 1, b: 1, d: 1, e: 1, o: 1, p: 1, q: 1, '0': 1, '6': 1, '8': 2, '9': 1, 'œ': 2, 'æ': 2 };
  function expectedHoles(ch) {
    if (!ch) return null; if (/^[g4&@%#]$/.test(ch)) return null;
    if (HOLES[ch] != null) return HOLES[ch];
    const base = ch.normalize('NFD')[0];
    if (base !== ch) return HOLES[base] ?? 0;
    return /^[A-Za-z0-9.,;:!?'"()\-\/+=*_«»ɛɣ]$/.test(ch) ? 0 : null;
  }
  /** Contre-formes mesurées (boucles « trou » du tracé, en ignorant les pores minuscules) */
  function countHoles(bin, comp) {
    const bm = PA.cropGlyph(bin, comp, 1), minA = Math.max(3, 0.015 * (comp.x1 - comp.x0 + 1) * (comp.y1 - comp.y0 + 1));
    return PA.marchingSquares(bm).filter(l => PA.signedArea(l) < -minA).length;
  }
  const charClass = ch => { const e = expected(ch); if (!e) return '?'; return e[0] < 0.5 ? 'mark' : e[1] > 0.1 ? 'desc' : e[0] > 0.9 ? 'tall' : 'x'; };

  /** Mesure [haut, bas] de chaque composante par rapport à sa ligne */
  function measure(comps) {
    const byLine = new Map(); comps.forEach(c => { if (!byLine.has(c.line)) byLine.set(c.line, []); byLine.get(c.line).push(c); });
    const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    for (const list of byLine.values()) {
      const mh = PA.median(list.map(c => c.y1 - c.y0 + 1));
      const bodies = list.filter(c => c.y1 - c.y0 + 1 >= 0.5 * mh);
      const base = PA.median((bodies.length ? bodies : list).map(c => c.y1 + 1));
      const H = Math.max(1, pct((bodies.length ? bodies : list).map(c => base - c.y0), 0.8));
      for (const c of list) c.feat = [(base - c.y0) / H, (c.y1 + 1 - base) / H];
    }
  }

  /** Alignement composantes ↔ caractères. Renvoie {pairs:[{comp, key, cost, suspect}], missing:[ch], extra:[comp], exact} */
  function align(comps, chars, opts = {}) {
    measure(comps);
    if (opts.bin) for (const c of comps) if (c.holes == null) c.holes = countHoles(opts.bin, c);
    const n = comps.length, m = chars.length, GAP = opts.gap ?? 0.9;
    const cost = (c, ch) => {
      const e = expected(ch); if (!e) return 0.25;
      const eh = expectedHoles(ch), hc = (eh == null || c.holes == null) ? 0 : 0.4 * Math.min(2, Math.abs(eh - c.holes));
      return Math.abs(c.feat[0] - e[0]) + 1.2 * Math.abs(c.feat[1] - e[1]) + hc;
    };
    // composantes en trop au début ou à la fin (tache, ligne non demandée) : pénalité réduite
    const END = opts.endGap ?? 0.3;
    const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1)), B = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
    for (let i = 1; i <= n; i++) { D[i][0] = i * END; B[i][0] = 1; }
    for (let j = 1; j <= m; j++) { D[0][j] = j * GAP; B[0][j] = 2; }
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
      const d = D[i - 1][j - 1] + cost(comps[i - 1], chars[j - 1]), up = D[i - 1][j] + (j === m ? END : GAP), left = D[i][j - 1] + GAP;
      if (d <= up && d <= left) { D[i][j] = d; B[i][j] = 0; } else if (up <= left) { D[i][j] = up; B[i][j] = 1; } else { D[i][j] = left; B[i][j] = 2; }
    }
    const pairs = [], missing = [], extra = [];
    for (let i = n, j = m; i > 0 || j > 0;) {
      const b = B[i][j];
      if (i > 0 && j > 0 && b === 0) { const c = cost(comps[i - 1], chars[j - 1]); pairs.push({ comp: comps[i - 1], key: chars[j - 1], cost: c, suspect: c > (opts.suspect ?? 0.5) }); i--; j--; }
      else if (i > 0 && (j === 0 || b === 1)) { extra.push(comps[i - 1]); pairs.push({ comp: comps[i - 1], key: null, cost: GAP, suspect: true }); i--; }
      else { missing.push(chars[j - 1]); j--; }
    }
    pairs.reverse(); missing.reverse(); extra.reverse();
    return { pairs, missing, extra, exact: !missing.length && !extra.length };
  }

  /** Contrôle de vraisemblance d'une attribution (utilisé aussi après correction manuelle) */
  function plausibility(comp, key) {
    const e = expected(key); if (!e || !comp.feat) return { ok: true };
    const c = Math.abs(comp.feat[0] - e[0]) + 1.2 * Math.abs(comp.feat[1] - e[1]);
    let why = null;
    if (e[0] > 0.5 && comp.feat[0] < 0.35) why = 'tiny';
    else if (/^[gjpqyɣ]$/.test(key) && comp.feat[1] < 0.06) why = 'noDesc';
    else if (e[1] < 0.05 && comp.feat[1] > 0.2) why = 'unexpectedDesc';
    else if (comp.holes != null && expectedHoles(key) != null && Math.abs(comp.holes - expectedHoles(key)) >= 1 && c > 0.25) why = 'holes';
    else if (c > 0.6) why = 'shape';
    return { ok: !why, why, cost: c };
  }

  Object.assign(PA, { expected, expectedHoles, countHoles, charClass, measure, align, plausibility });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
