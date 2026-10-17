// Tests unitaires (node --test) : tracé, segmentation, métriques, analyse, synthèse, export.
const test = require('node:test'), assert = require('node:assert');
for (const f of ['imageproc', 'segment', 'trace', 'chars', 'analyse', 'assign', 'pipeline', 'synth', 'fontbuild']) require(`../js/${f}.js`);
const PA = globalThis.PA; globalThis.opentype = require('../vendor/opentype.min.js');
const blank = (w, h) => ({ w, h, data: new Uint8Array(w * h) });
const disc = (b, cx, cy, r, v = 1) => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (Math.hypot(x - cx, y - cy) <= r) b.data[y * b.w + x] = v; };
const rect = (b, x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b.data[y * b.w + x] = 1; };

test('tracé : anneau -> 2 contours de sens opposés, IoU > 0.95', () => {
  const b = blank(80, 80); disc(b, 40, 40, 30); disc(b, 40, 40, 15, 0);
  const c = PA.traceBitmap(b); assert.strictEqual(c.length, 2);
  const a = c.map(PA.contourArea); assert.ok(a[0] * a[1] < 0, 'sens opposés');
  assert.ok(PA.iou(b, PA.rasterize(c, 80, 80)) > 0.95);
});
test('tracé : carré -> angles conservés (IoU > 0.95)', () => {
  const b = blank(60, 60); rect(b, 10, 10, 50, 50);
  const c = PA.traceBitmap(b); assert.strictEqual(c.length, 1);
  assert.ok(PA.iou(b, PA.rasterize(c, 60, 60)) > 0.95);
});
test('tracé : orientation CFF après normalisation (extérieur > 0, trou < 0)', () => {
  const b = blank(80, 80); disc(b, 40, 40, 30); disc(b, 40, 40, 15, 0);
  const r = PA.vectorize(b, { comp: PA.components(b)[0], baseline: 80, scale: 10 });
  const areas = r.contours.map(PA.contourArea).sort((x, y) => x - y);
  assert.ok(areas[0] < 0 && areas[1] > 0);
});
test('segmentation : le point du i est fusionné, ordre de lecture sur 2 lignes', () => {
  const b = blank(200, 200);
  rect(b, 10, 30, 20, 80); disc(b, 15, 18, 5);     // i (ligne 1)
  rect(b, 50, 20, 60, 80);                         // l (ligne 1)
  rect(b, 10, 130, 40, 180); rect(b, 60, 130, 90, 180); // ligne 2
  const g = PA.segment(b);
  assert.strictEqual(g.length, 4);
  assert.deepStrictEqual(g.map(x => x.line), [0, 0, 1, 1]);
  assert.ok(g[0].y0 <= 13, 'le point appartient au i');
  assert.ok(g[2].x0 < g[3].x0);
});
test('segmentation : composantes 8-connexes', () => {
  const b = blank(10, 10); b.data[0] = 1; b.data[11] = 1; b.data[99] = 1;
  assert.strictEqual(PA.components(b).length, 2);
});
test('imageproc : Otsu sépare encre et papier, deskew retrouve ~5°', () => {
  const g = { w: 300, h: 200, data: new Uint8Array(300 * 200).fill(240) };
  for (let k = 0; k < 4; k++) for (let x = 20; x < 280; x++) for (let t = 0; t < 6; t++) g.data[(40 + k * 40 + t) * 300 + x] = 20;
  const t = PA.otsu(g); assert.ok(t >= 20 && t < 240);
  const rot = PA.rotate(g, -5, 240), s = PA.estimateSkew(PA.threshold(rot, t));
  assert.ok(Math.abs(Math.abs(s) - 5) <= 1, 'skew ' + s);
  assert.ok(Math.abs(PA.estimateSkew(PA.threshold(PA.rotate(rot, -s, 240), t))) <= 0.5, 'redressement');
});
test('métriques : hauteur d\'x, capitales, descendantes', () => {
  const mk = (key, yMin, yMax) => ({ key, source: 'traced', bbox: { yMin, yMax, xMin: 0, xMax: 100 } });
  const m = PA.detectMetrics([mk('H', 0, 700), mk('E', 0, 702), mk('x', 0, 500), mk('o', -10, 510), mk('n', 0, 500), mk('p', -200, 500), mk('b', 0, 740)]);
  assert.strictEqual(m.capHeight, 702); assert.strictEqual(m.xHeight, 500); assert.strictEqual(m.descender, -200); assert.strictEqual(m.ascender, 740);
});
test('analyse : graisse d\'un trait de 12 px ≈ 12', () => {
  const b = blank(60, 120); rect(b, 20, 10, 32, 110);
  const s = PA.analyseStructure([{ key: 'l', source: 'traced', bitmap: b, scale: 1 }], { xHeight: 500, capHeight: 700 });
  assert.ok(Math.abs(s.weight - 12) <= 2, 'weight ' + s.weight); assert.strictEqual(s.slant, 0);
});
test('synthèse : A-Z a-z 0-9 toujours présents, accents composés, formes arabes générées', () => {
  const m = { capHeight: 700, xHeight: 500, ascender: 740, descender: -200 };
  const G = { o: PA.generate('o', m, 80), b: PA.generate('b', m, 80), 'ب': PA.generate('o', m, 80) };
  G.o.source = G.b.source = 'traced'; G['ب'].key = 'ب'; G['ب'].source = 'traced';
  PA.synthesize(G, m, { weight: 80 });
  for (const c of [...PA.UPPER, ...PA.LOWER, ...PA.DIGITS]) assert.ok(G[c], c);
  assert.strictEqual(G.d.source, 'derived'); assert.strictEqual(G.O.source, 'derived');
  assert.ok(G['é'] && G['ḍ'] && G['ɛ'] && G['ɣ'] && G['œ']);
  assert.ok(G['ب.init'] && G['ب.medi'] && G['ب.fina']); assert.strictEqual(G['ب.init'].source, 'generated');
});
test('police : OTF relu, cmap complète, GSUB arabe', () => {
  const m = { capHeight: 700, xHeight: 500, ascender: 740, descender: -200 };
  const G = { 'ل': PA.generate('l', m, 80), 'ا': PA.generate('I', m, 80) }; G['ل'].key = 'ل'; G['ا'].key = 'ا';
  PA.synthesize(G, m, { weight: 80 });
  const { font } = PA.buildFont(G, m, { family: 'Test' }, { weight: 80 });
  const re = opentype.parse(font.toArrayBuffer());
  for (const c of 'AZaz09') assert.ok(re.charToGlyphIndex(c) > 0, c);
  assert.ok(re.charToGlyphIndex('\uFEFB') > 0, 'lam-alif');
  const feats = re.tables.gsub.features.map(f => f.tag); for (const f of ['init', 'medi', 'fina', 'rlig']) assert.ok(feats.includes(f), f);
});
test('WOFF : en-tête et tables', async () => {
  const zlib = require('node:zlib');
  const m = { capHeight: 700, xHeight: 500, ascender: 740, descender: -200 }, G = {}; PA.synthesize(G, m, { weight: 80 });
  const otf = PA.buildFont(G, m, {}, { weight: 80 }).font.toArrayBuffer();
  const w = await PA.toWOFF(otf, async u => new Uint8Array(zlib.deflateSync(u)));
  const v = new DataView(w); assert.strictEqual(v.getUint32(0), 0x774F4646); assert.strictEqual(v.getUint32(8), w.byteLength);
});
test('attribution : une tache en tête ne décale pas l\'alphabet (alignement)', () => {
  // ligne « a b g » (x, x, descendante) précédée d'un point parasite
  const mk = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0), line: 0 });
  const comps = [mk(0, 40, 4, 44), mk(10, 50, 40, 100), mk(50, 20, 80, 100), mk(90, 50, 120, 130), mk(130, 20, 140, 100)];
  const al = PA.align(comps, ['a', 'b', 'g', 'l']);
  assert.deepStrictEqual(al.pairs.map(p => p.key), [null, 'a', 'b', 'g', 'l']);
  assert.strictEqual(al.extra.length, 1); assert.ok(!al.exact);
});
test('attribution : caractère manquant signalé, pas de glissement', () => {
  const mk = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, area: (x1 - x0) * (y1 - y0), line: 0 });
  const comps = [mk(10, 50, 40, 100), mk(90, 50, 120, 130), mk(130, 20, 140, 100)]; // a, g, l (b absent)
  const al = PA.align(comps, ['a', 'b', 'g', 'l']);
  assert.deepStrictEqual(al.pairs.map(p => p.key), ['a', 'g', 'l']); assert.deepStrictEqual(al.missing, ['b']);
});
test('vraisemblance : petite marque attribuée à une lettre = suspect', () => {
  const c = { feat: [0.2, -0.05] }; assert.strictEqual(PA.plausibility(c, 'H').ok, false);
  assert.strictEqual(PA.plausibility({ feat: [0.68, 0] }, 'g').why, 'noDesc');
  assert.strictEqual(PA.plausibility({ feat: [1, 0] }, 'H').ok, true);
});
test('segmentation : tréma (deux points) fusionné, guillemet double en une pièce', () => {
  const b = blank(200, 120);
  rect(b, 20, 50, 50, 100); disc(b, 27, 38, 4); disc(b, 43, 38, 4);   // ë simplifié
  rect(b, 90, 20, 96, 45); rect(b, 102, 20, 108, 45);                  // "
  rect(b, 130, 20, 140, 100);                                          // l
  for (const x of [150, 165, 180]) rect(b, x, 50, x + 10, 100);        // autres lettres
  const g = PA.segment(b); assert.strictEqual(g.length, 6, 'ë, ", l + 3');
});
