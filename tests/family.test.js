// Tests unitaires : famille (décalage de contour, compensation verticale, noms/drapeaux), GPOS, ZIP
const test = require('node:test'), assert = require('node:assert');
globalThis.opentype = require('../vendor/opentype.min.js');
for (const f of ['imageproc', 'segment', 'trace', 'chars', 'analyse', 'assign', 'pipeline', 'synth', 'fontbuild', 'family', 'zip']) require('../js/' + f + '.js');
const PA = globalThis.PA, m = { capHeight: 700, xHeight: 500, ascender: 740, descender: -200 };
const area = cs => cs.reduce((a, c) => a + PA.contourArea(c), 0);

test('décalage : plus gras = plus d\'encre, contreforme de o conservée, hauteurs gardées', () => {
  const o = PA.generate('o', m, 80);
  const bold = PA.weightGlyph(o, m, 40, 0.8), thin = PA.weightGlyph(o, m, -25, 1);
  assert.ok(area(bold.contours) > area(o.contours) * 1.4, 'gras');
  assert.ok(area(thin.contours) < area(o.contours) * 0.8, 'maigre');
  for (const g of [bold, thin]) {
    assert.strictEqual(g.contours.filter(c => PA.contourArea(c) < 0).length, 1, 'contreforme');
    assert.ok(Math.abs(g.bbox.yMin - o.bbox.yMin) < 12 && Math.abs(g.bbox.yMax - o.bbox.yMax) < 12, 'hauteur d\'x conservée ' + JSON.stringify(g.bbox));
  }
});
test('garde-fou : un décalage énorme ne ferme pas la contreforme de e', () => {
  const e = PA.generate('e', m, 80), g = PA.weightGlyph(e, m, 120, 0.8);
  assert.ok(g.contours.filter(c => PA.contourArea(c) < 0).length >= 1); assert.ok(g.limited);
});
test('noms et drapeaux de style (regroupement RIBBI)', () => {
  const b = PA.styleInfo('Ma Police', 5, false), bi = PA.styleInfo('Ma Police', 5, true), l = PA.styleInfo('Ma Police', 1, false), r = PA.styleInfo('Ma Police', 2, true);
  assert.deepStrictEqual([b.legacyFamily, b.legacySub, b.fsSelection, b.macStyle, b.weightClass], ['Ma Police', 'Bold', 32, 1, 700]);
  assert.deepStrictEqual([bi.legacySub, bi.fsSelection, bi.macStyle, bi.italicAngle], ['Bold Italic', 33, 3, -11]);
  assert.deepStrictEqual([l.legacyFamily, l.legacySub, l.typoSub, l.fsSelection, l.ps], ['Ma Police Light', 'Regular', 'Light', 64, 'MaPolice-Light']);
  assert.deepStrictEqual([r.legacySub, r.typoSub, r.fsSelection], ['Italic', 'Italic', 1]);
});
test('style construit : GPOS kern lisible, OS/2 et post corrigés', () => {
  const G = {}; for (const k of 'AVTHnoay') G[k] = PA.generate(k, m, 80);
  const s = PA.buildStyle(G, m, { weight: 80 }, { family: 'Essai' }, 7, true);
  const f = opentype.parse(PA.fontBinary(s.built));
  assert.strictEqual(f.tables.os2.usWeightClass, 900); assert.strictEqual(f.tables.os2.fsSelection & 1, 1);
  assert.strictEqual(f.tables.post.italicAngle, -11); assert.strictEqual(f.tables.head.macStyle, 2);
  assert.ok(f.tables.gpos && f.tables.gpos.features.some(x => x.tag === 'kern'));
  const A = f.charToGlyphIndex('A'), V = f.charToGlyphIndex('V');
  assert.ok(f.getKerningValue(f.glyphs.get(A), f.glyphs.get(V)) < 0, 'AV crénée');
  assert.strictEqual(f.names.preferredFamily.en, 'Essai'); assert.strictEqual(f.names.preferredSubfamily.en, 'Black Italic');
});
test('ZIP : CRC-32 et structure', () => {
  assert.strictEqual(PA.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  const z = PA.makeZip([{ name: 'a.txt', data: new TextEncoder().encode('salut') }]);
  assert.strictEqual(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
});
