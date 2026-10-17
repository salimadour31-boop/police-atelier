/* Police Atelier — fontbuild.js
 * Construction de la police OpenType/CFF avec opentype.js (MIT) :
 * approches, chasse, réglages par glyphe, cmap, tables name/OS-2/hhea/post,
 * GSUB arabe (isol/init/medi/fina + rlig/liga lam-alif), export OTF et WOFF. */
(function (root) {
  const PA = root.PA = root.PA || {};
  const hex = n => n.toString(16).toUpperCase().padStart(4, '0');

  /** Unicodes et nom PostScript d'une clé de glyphe */
  function glyphInfo(key) {
    if (key === 'لا') return { name: 'lam_alef', unicodes: [0xFEFB] };
    if (key === 'لا.fina') return { name: 'lam_alef.fina', unicodes: [0xFEFC] };
    const mm = /^(.+)\.(init|medi|fina)$/.exec(key), base = mm ? mm[1] : key, form = mm ? mm[2] : null;
    const cp = base.codePointAt(0);
    if (PA.AR[base]) {
      const i = PA.FORMS.indexOf(form || 'isol'), pres = PA.AR[base][i];
      if (!form) return { name: 'uni' + hex(cp), unicodes: [cp, pres] };
      return { name: 'uni' + hex(cp) + '.' + form, unicodes: pres ? [pres] : [] };
    }
    return { name: 'uni' + hex(cp), unicodes: [cp] };
  }
  /** Côtés liants (approche nulle) d'une forme arabe */
  function joinSides(key) {
    if (key === 'لا.fina') return 'R';
    const f = (/\.(init|medi|fina)$/.exec(key) || [])[1]; return f === 'init' ? 'L' : f === 'fina' ? 'R' : f === 'medi' ? 'LR' : '';
  }

  /** Construit l'objet opentype.Font. settings : {family, style, version, spacing, tracking, weight, adjust:{clé:{dy,scale,lsb,rsb}}} */
  function buildFont(G, metrics, settings = {}, analysis) {
    const ot = root.opentype || (typeof require !== 'undefined' ? require('opentype.js') : null);
    const t = (analysis && analysis.weight) || 80;
    // approches proportionnelles à l'épaisseur du fût, réduites côté rond (o, c, e…)
    const baseSB = Math.round((20 + 0.6 * t) * (settings.spacing ?? 1));
    const ROUND_L = /^[CGOQcdeoqæœ0369@ɛƐ]$/, ROUND_R = /^[BDOPQbopceæœ068@9]$/;
    // côtés « ouverts » (diagonales, bras) : approche réduite davantage
    const OPEN_L = /^[AJTVWYjvwxy]$/, OPEN_R = /^[FPTVWYfrtvwxy7]$/;
    const sideF = (key, side) => (side === 'L' ? (OPEN_L.test(key) ? 0.5 : ROUND_L.test(key) ? 0.7 : 1) : (OPEN_R.test(key) ? 0.5 : ROUND_R.test(key) ? 0.7 : 1));
    const clampC = v => Math.max(-4000, Math.min(4000, Math.round(v)));
    const track = settings.tracking || 0, adj = settings.adjust || {};
    const notdef = new ot.Path(); notdef.moveTo(50, 0); notdef.lineTo(450, 0); notdef.lineTo(450, 700); notdef.lineTo(50, 700); notdef.close();
    notdef.moveTo(100, 50); notdef.lineTo(100, 650); notdef.lineTo(400, 650); notdef.lineTo(400, 50); notdef.close();
    const glyphs = [new ot.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: notdef }),
      new ot.Glyph({ name: 'space', unicode: 32, advanceWidth: Math.round((settings.spaceWidth || 260) + track) })];
    glyphs[1].unicodes = [32, 0xA0];
    const index = {}, finals = {};
    let yMax = metrics.ascender, yMin = metrics.descender;
    const keys = Object.keys(G).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const g = G[key], a = adj[key] || {}, s = a.scale ?? 1;
      let contours = PA.transform(g.contours, [s, 0, 0, s, 0, a.dy || 0]);
      const b = PA.bboxOf(contours), js = joinSides(key);
      const lsb = js.includes('L') ? 0 : Math.round(baseSB * sideF(key, 'L')) + (a.lsb || 0) + track / 2;
      const rsb = js.includes('R') ? 0 : Math.round(baseSB * sideF(key, 'R')) + (a.rsb || 0) + track / 2;
      contours = PA.translate(contours, lsb - b.xMin, 0);
      // italique : inclinaison APRÈS le calcul des approches sur le dessin droit (sinon les ascendantes inclinées élargissent la boîte)
      if (settings.slant) { const tn = Math.tan(settings.slant * Math.PI / 180); contours = PA.transform(contours, [1, 0, tn, 1, -tn * metrics.xHeight / 2, 0]); }
      const path = new ot.Path();
      for (const c of contours) {
        if (!c.length) continue;
        path.moveTo(clampC(c[0][0]), clampC(c[0][1]));
        for (const q of c) path.curveTo(clampC(q[2]), clampC(q[3]), clampC(q[4]), clampC(q[5]), clampC(q[6]), clampC(q[7]));
        path.close();
      }
      yMax = Math.max(yMax, Math.min(3000, b.yMax)); yMin = Math.min(yMin, Math.max(-2000, b.yMin));
      const info = glyphInfo(key);
      const gl = new ot.Glyph({ name: info.name, unicode: info.unicodes[0], advanceWidth: Math.max(0, Math.min(4000, Math.round(lsb + (b.xMax - b.xMin) + rsb))), path });
      gl.unicodes = info.unicodes;
      index[key] = glyphs.length; glyphs.push(gl); finals[key] = { contours, adv: gl.advanceWidth };
    }
    const font = new ot.Font({
      familyName: settings.family || 'Police Atelier', styleName: settings.style || 'Regular',
      unitsPerEm: 1000, ascender: Math.round(Math.max(yMax, metrics.ascender)), descender: Math.round(Math.min(yMin, metrics.descender)),
      designer: settings.designer || ' ', version: 'Version ' + (settings.version || '1.000'),
      description: 'Créée avec Police Atelier', license: settings.license || 'Licence choisie par l\'auteur·rice',
      weightClass: settings.weightClass || weightFromStroke(t), glyphs,
      tables: { os2: { sxHeight: metrics.xHeight, sCapHeight: metrics.capHeight } }
    });
    // noms de famille typographique (ID 16/17) : regroupement des graisses dans Font Book / Windows
    const st = settings.styleInfo;
    if (st) {
      const en = v => ({ en: v });
      font.names.fontFamily = en(st.legacyFamily); font.names.fontSubfamily = en(st.legacySub);
      font.names.fullName = en(st.full); font.names.postScriptName = en(st.ps);
      font.names.preferredFamily = en(st.family); font.names.preferredSubfamily = en(st.typoSub);
      font.names.uniqueID = en(st.ps + ';' + (settings.version || '1.000'));
    }
    addArabicGSUB(font, index);
    const kern = settings.kerning === false ? [] : autoKern(finals, index, t);
    return { font, index, kern, styleInfo: st, finals };
  }
  const weightFromStroke = t => Math.max(100, Math.min(900, Math.round((t / 1000 * 100 * 50 + 50) / 100) * 100));

  /** Ajoute les substitutions positionnelles et la ligature lam-alif */
  function addArabicGSUB(font, index) {
    // opentype.js exige l'ajout des fonctionnalités par ordre alphabétique
    const scripts = ['DFLT', 'arab'], letters = Object.keys(PA.AR).filter(l => l !== 'لا' && index[l] != null);
    const lig = [['ل.init', 'لا'], ['ل.medi', 'لا.fina']].filter(([lam, res]) => index[lam] != null && index['ا.fina'] != null && index[res] != null);
    let n = 0;
    for (const feat of ['fina', 'init', 'liga', 'medi', 'rlig']) for (const sc of scripts) {
      if (feat === 'liga' || feat === 'rlig') {
        // lam-alif : après les formes positionnelles, ل.init/medi + ا.fina -> ligature
        for (const [lam, res] of lig) { font.substitution.addLigature(feat, { sub: [index[lam], index['ا.fina']], by: index[res] }, sc); n++; }
      } else for (const l of letters) {
        const k = PA.arKey(l, feat); if (index[k] == null) continue;
        font.substitution.addSingle(feat, { sub: index[l], by: index[k] }, sc); n++;
      }
    }
    return n;
  }

  /* ---------- Crénage automatique (GPOS kern) ---------- */
  // paires courantes ; la valeur vient des profils réels des glyphes, pas d'une table figée
  const KERN_PAIRS = ('AV AW AY AT AC AG AO AQ AU Av Aw Ay VA WA YA TA LT LV LW LY Ly L\' FA F. F, PA P. P, TA Ta Tc Te To Tr Ts Tu Tw Ty Ti T. T, ' +
    'Va Ve Vo Vu Wa We Wo Ya Ye Yo Yu Y. Y, V. V, W. W, RT RV RW RY Ka Ke Ko Kv Ky ky av aw ay ov ow oy ox va ve vo wa we wo ya ye yo y. y, v. v, w. w, r. r, f. f,').split(' ').filter(x => x.length === 2);
  /** profil gauche/droit par bandes horizontales de 25 unités */
  function profile(contours) {
    const L = {}, R = {};
    for (const c of contours) for (const q of c) for (let i = 0; i <= 8; i++) {
      const t = i / 8, u = 1 - t, x = u * u * u * q[0] + 3 * u * u * t * q[2] + 3 * u * t * t * q[4] + t * t * t * q[6], y = u * u * u * q[1] + 3 * u * u * t * q[3] + 3 * u * t * t * q[5] + t * t * t * q[7];
      const b = Math.floor(y / 25); L[b] = Math.min(L[b] ?? 1e9, x); R[b] = Math.max(R[b] ?? -1e9, x);
    }
    return { L, R };
  }
  function pairGap(A, B) {
    // écart horizontal entre le bord droit de A et le bord gauche de B, bande par bande (bandes voisines tolérées)
    const gaps = [];
    for (const k in A.p.R) { const b = +k; let lb = Infinity; for (const d of [-1, 0, 1]) if (B.p.L[b + d] != null) lb = Math.min(lb, B.p.L[b + d]); if (lb < Infinity) gaps.push(A.adv - A.p.R[k] + lb); }
    return gaps.length ? { min: Math.min(...gaps), avg: gaps.reduce((a, b) => a + b, 0) / gaps.length, n: gaps.length } : null;
  }
  function autoKern(finals, index, t) {
    const P = {}; const get = k => finals[k] && (P[k] = P[k] || { adv: finals[k].adv, p: profile(finals[k].contours) });
    // référence : écart optique entre deux fûts droits (HH, nn)
    const ref = ['HH', 'nn', 'II'].map(s => get(s[0]) && pairGap(get(s[0]), get(s[1]))).find(Boolean);
    if (!ref) return [];
    const out = [];
    for (const pr of KERN_PAIRS) {
      const A = get(pr[0]), B = get(pr[1]); if (!A || !B) continue;
      const g = pairGap(A, B); if (!g) continue;
      // rapprocher l'écart moyen de la référence, sans que le point le plus proche descende sous 45 % de l'écart de référence
      let k = (ref.avg - g.avg) * 0.4;
      k = Math.max(k, ref.min * 0.45 - g.min);
      k = Math.round(Math.max(-120, Math.min(0, k)) / 5) * 5;
      if (k <= -10) out.push([index[pr[0]], index[pr[1]], k, pr]);
    }
    return out;
  }
  /** Table GPOS minimale : une recherche PairPos format 1 (XAdvance), fonction 'kern' pour DFLT et latn */
  function gposTable(kern) {
    const byFirst = new Map();
    for (const [a, b, v] of kern) { if (!byFirst.has(a)) byFirst.set(a, []); byFirst.get(a).push([b, v]); }
    const firsts = [...byFirst.keys()].sort((x, y) => x - y);
    const W = []; const u16 = v => W.push((v >> 8) & 255, v & 255);
    // --- sous-table PairPos ---
    const sub = []; const s16 = (arr, v) => arr.push((v >> 8) & 255, v & 255);
    const nF = firsts.length, headLen = 10 + 2 * nF;
    const sets = firsts.map(f => { const l = byFirst.get(f).sort((x, y) => x[0] - y[0]); const a = []; s16(a, l.length); for (const [b, v] of l) { s16(a, b); s16(a, v & 0xFFFF); } return a; });
    const cov = []; s16(cov, 1); s16(cov, nF); firsts.forEach(f => s16(cov, f));
    let off = headLen; const setOffs = sets.map(a => { const o = off; off += a.length; return o; });
    const covOff = off;
    s16(sub, 1); s16(sub, covOff); s16(sub, 0x0004); s16(sub, 0); s16(sub, nF); setOffs.forEach(o => s16(sub, o));
    sets.forEach(a => sub.push(...a)); sub.push(...cov);
    // --- listes ---
    const script = []; s16(script, 4); s16(script, 0); /* LangSys */ s16(script, 0); s16(script, 0xFFFF); s16(script, 1); s16(script, 0);
    const scriptList = []; s16(scriptList, 2); const sTags = ['DFLT', 'latn'];
    sTags.forEach((tg, i) => { for (const ch of tg) scriptList.push(ch.charCodeAt(0)); s16(scriptList, 2 + 6 * 2 + i * script.length); });
    sTags.forEach(() => scriptList.push(...script));
    const featList = []; s16(featList, 1); for (const ch of 'kern') featList.push(ch.charCodeAt(0)); s16(featList, 8); s16(featList, 0); s16(featList, 1); s16(featList, 0);
    const lookupList = []; s16(lookupList, 1); s16(lookupList, 4); s16(lookupList, 2); s16(lookupList, 0); s16(lookupList, 1); s16(lookupList, 8); lookupList.push(...sub);
    const hdr = 10; u16(1); u16(0); u16(hdr); u16(hdr + scriptList.length); u16(hdr + scriptList.length + featList.length);
    return new Uint8Array([...W, ...scriptList, ...featList, ...lookupList]);
  }

  /** Réécrit le binaire SFNT : ajoute GPOS et corrige les champs de style (macStyle, fsSelection, italicAngle, pente du caret) */
  function finalizeSfnt(ab, o = {}) {
    const v = new DataView(ab), n = v.getUint16(4), tabs = {};
    for (let i = 0; i < n; i++) { const r = 12 + 16 * i, tag = String.fromCharCode(...new Uint8Array(ab, r, 4)); tabs[tag] = new Uint8Array(ab.slice(v.getUint32(r + 8), v.getUint32(r + 8) + v.getUint32(r + 12))); }
    if (o.kern && o.kern.length) tabs.GPOS = gposTable(o.kern);
    const dv = t => new DataView(tabs[t].buffer, tabs[t].byteOffset, tabs[t].byteLength);
    if (o.macStyle != null) dv('head').setUint16(44, o.macStyle);
    if (o.fsSelection != null) dv('OS/2').setUint16(62, o.fsSelection);
    if (o.weightClass != null) dv('OS/2').setUint16(4, o.weightClass);
    if (o.italicAngle) {
      dv('post').setInt32(4, Math.round(o.italicAngle * 65536));
      dv('hhea').setInt16(18, 1000); dv('hhea').setInt16(20, Math.round(Math.tan(-o.italicAngle * Math.PI / 180) * 1000));
    }
    const tags = Object.keys(tabs).sort(), nt = tags.length;
    let total = 12 + 16 * nt; const offs = tags.map(t => { const o2 = total; total += (tabs[t].length + 3) & ~3; return o2; });
    const out = new ArrayBuffer(total), w = new DataView(out), u8 = new Uint8Array(out);
    const es = Math.floor(Math.log2(nt)); w.setUint32(0, v.getUint32(0)); w.setUint16(4, nt); w.setUint16(6, 16 * 2 ** es); w.setUint16(8, es); w.setUint16(10, nt * 16 - 16 * 2 ** es);
    const csum = (buf, off, len) => { let s = 0; const d = new DataView(buf); for (let i = 0; i < len; i += 4) s = (s + d.getUint32(off + i)) >>> 0; return s; };
    if (tabs.head) dv('head').setUint32(8, 0);
    tags.forEach((t, i) => { u8.set(tabs[t], offs[i]); const r = 12 + 16 * i; for (let j = 0; j < 4; j++) w.setUint8(r + j, t.charCodeAt(j)); w.setUint32(r + 4, csum(out, offs[i], (tabs[t].length + 3) & ~3)); w.setUint32(r + 8, offs[i]); w.setUint32(r + 12, tabs[t].length); });
    if (tabs.head) { const hi = tags.indexOf('head'); w.setUint32(offs[hi] + 8, (0xB1B0AFBA - csum(out, 0, total)) >>> 0); }
    return out;
  }
  /** Binaire OTF final d'une police construite par buildFont */
  function fontBinary(built) {
    const st = built.styleInfo || {};
    return finalizeSfnt(built.font.toArrayBuffer(), { kern: built.kern, macStyle: st.macStyle, fsSelection: st.fsSelection, weightClass: st.weightClass, italicAngle: st.italicAngle });
  }

  /** OTF -> WOFF 1.0 (tables compressées zlib) ; deflate : fonction Uint8Array->Promise<Uint8Array> (zlib) */
  async function toWOFF(otf, deflate) {
    const v = new DataView(otf), n = v.getUint16(4), tables = [];
    for (let i = 0; i < n; i++) {
      const o = 12 + 16 * i;
      tables.push({ tag: v.getUint32(o), sum: v.getUint32(o + 4), off: v.getUint32(o + 8), len: v.getUint32(o + 12) });
    }
    let total = 44 + 20 * n; const parts = [];
    for (const t of tables) {
      const raw = new Uint8Array(otf, t.off, t.len);
      let comp = await deflate(raw); if (comp.length >= raw.length) comp = raw;
      parts.push({ t, data: comp, off: total }); total += (comp.length + 3) & ~3;
    }
    const out = new ArrayBuffer(total), w = new DataView(out), u8 = new Uint8Array(out);
    w.setUint32(0, 0x774F4646); w.setUint32(4, v.getUint32(0)); w.setUint32(8, total); w.setUint16(12, n);
    w.setUint32(16, otf.byteLength); w.setUint16(20, 1); w.setUint16(22, 0);
    parts.forEach((p, i) => {
      const o = 44 + 20 * i; w.setUint32(o, p.t.tag); w.setUint32(o + 4, p.off); w.setUint32(o + 8, p.data.length); w.setUint32(o + 12, p.t.len); w.setUint32(o + 16, p.t.sum);
      u8.set(p.data, p.off);
    });
    return out;
  }

  Object.assign(PA, { autoKern, gposTable, finalizeSfnt, fontBinary, KERN_PAIRS, glyphInfo, joinSides, buildFont, addArabicGSUB, toWOFF });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
