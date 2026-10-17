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
    const baseSB = Math.round((30 + 0.5 * t) * (settings.spacing ?? 1));
    const track = settings.tracking || 0, adj = settings.adjust || {};
    const notdef = new ot.Path(); notdef.moveTo(50, 0); notdef.lineTo(450, 0); notdef.lineTo(450, 700); notdef.lineTo(50, 700); notdef.close();
    notdef.moveTo(100, 50); notdef.lineTo(100, 650); notdef.lineTo(400, 650); notdef.lineTo(400, 50); notdef.close();
    const glyphs = [new ot.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: notdef }),
      new ot.Glyph({ name: 'space', unicode: 32, advanceWidth: Math.round((settings.spaceWidth || 260) + track) })];
    glyphs[1].unicodes = [32, 0xA0];
    const index = {};
    let yMax = metrics.ascender, yMin = metrics.descender;
    const keys = Object.keys(G).sort((a, b) => a.localeCompare(b));
    for (const key of keys) {
      const g = G[key], a = adj[key] || {}, s = a.scale ?? 1;
      let contours = PA.transform(g.contours, [s, 0, 0, s, 0, a.dy || 0]);
      const b = PA.bboxOf(contours), js = joinSides(key);
      const lsb = js.includes('L') ? 0 : baseSB + (a.lsb || 0) + track / 2;
      const rsb = js.includes('R') ? 0 : baseSB + (a.rsb || 0) + track / 2;
      contours = PA.translate(contours, lsb - b.xMin, 0);
      const path = new ot.Path();
      for (const c of contours) {
        if (!c.length) continue;
        path.moveTo(Math.round(c[0][0]), Math.round(c[0][1]));
        for (const q of c) path.curveTo(Math.round(q[2]), Math.round(q[3]), Math.round(q[4]), Math.round(q[5]), Math.round(q[6]), Math.round(q[7]));
        path.close();
      }
      yMax = Math.max(yMax, b.yMax); yMin = Math.min(yMin, b.yMin);
      const info = glyphInfo(key);
      const gl = new ot.Glyph({ name: info.name, unicode: info.unicodes[0], advanceWidth: Math.max(0, Math.round(lsb + (b.xMax - b.xMin) + rsb)), path });
      gl.unicodes = info.unicodes;
      index[key] = glyphs.length; glyphs.push(gl);
    }
    const font = new ot.Font({
      familyName: settings.family || 'Police Atelier', styleName: settings.style || 'Regular',
      unitsPerEm: 1000, ascender: Math.round(Math.max(yMax, metrics.ascender)), descender: Math.round(Math.min(yMin, metrics.descender)),
      designer: settings.designer || ' ', version: 'Version ' + (settings.version || '1.000'),
      description: 'Créée avec Police Atelier', license: settings.license || 'Licence choisie par l\'auteur·rice',
      weightClass: settings.weightClass || weightFromStroke(t), glyphs,
      tables: { os2: { sxHeight: metrics.xHeight, sCapHeight: metrics.capHeight } }
    });
    addArabicGSUB(font, index);
    return { font, index };
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

  Object.assign(PA, { glyphInfo, joinSides, buildFont, addArabicGSUB, toWOFF });
  if (typeof module !== 'undefined') module.exports = PA;
})(typeof self !== 'undefined' ? self : globalThis);
