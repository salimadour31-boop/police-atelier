// Tests export TTF : conversion cubique -> quadratique, glyf/loca relu par opentype.js et fontTools.
const test = require('node:test'), assert = require('node:assert');
for (const f of ['imageproc', 'segment', 'trace', 'chars', 'analyse', 'assign', 'pipeline', 'synth', 'fontbuild']) require(`../js/${f}.js`);
const PA = globalThis.PA; globalThis.opentype = require('../vendor/opentype.min.js');

const m = { capHeight: 700, xHeight: 500, ascender: 740, descender: -200 };
const buildTest = () => { const G = {}; PA.synthesize(G, m, { weight: 80 }); return PA.buildFont(G, m, { family: 'Test' }, { weight: 80 }); };

test('quad : une cubique est approchée à moins de 1,5 unité après découpe', () => {
  const quart = [0, 500, 0, 910, 410, 1000, 500, 1000];
  const cubic = t => { const u = 1 - t; return [u*u*u*quart[0] + 3*u*u*t*quart[2] + 3*u*t*t*quart[4] + t*t*t*quart[6], u*u*u*quart[1] + 3*u*u*t*quart[3] + 3*u*t*t*quart[5] + t*t*t*quart[7]]; };
  const quads = PA.fitQuad(quart);
  assert.ok(quads.length >= 1);
  const poly = [[quart[0], quart[1]]]; for (const q of quads) { const p0 = poly[poly.length - 1]; for (let i = 1; i <= 16; i++) { const t = i / 16, u = 1 - t; poly.push([u*u*p0[0] + 2*u*t*q.c[0] + t*t*q.e[0], u*u*p0[1] + 2*u*t*q.c[1] + t*t*q.e[1]]); } }
  let err = 0;
  for (let i = 0; i <= 64; i++) { const b = cubic(i / 64); let dmin = Infinity; for (const p of poly) dmin = Math.min(dmin, Math.hypot(b[0] - p[0], b[1] - p[1])); err = Math.max(err, dmin); }
  assert.ok(err < 1.5, 'écart max ' + err);
});

test('points TT : segmet rectiligne -> point on-curve, extrémités conservées', () => {
  const path = { commands: [
    { type: 'M', x: 10, y: 10 }, { type: 'C', x1: 40, y1: 10, x2: 60, y2: 10, x: 90, y: 10 },
    { type: 'C', x1: 120, y1: 10, x2: 150, y2: 90, x: 150, y: 120 }, { type: 'Z' }] };
  const c = PA.pathToTTPoints(path);
  assert.strictEqual(c.length, 1);
  const line = c[0].filter(p => p.on && p.x !== c[0][0].x).slice(0, 1);
  assert.strictEqual(c[0][1].on, true, 'segment rectiligne -> on');
  const last = c[0][c[0].length - 1];
  assert.strictEqual(last.x, 150); assert.strictEqual(last.y, 120);
  assert.strictEqual(last.on, true);
  assert.notStrictEqual(c[0][c[0].length - 1].x, c[0][0].x, 'fermeture sans doublon du départ');
  assert.ok(c[0].some(p => !p.on), 'courbe -> contrôle off-curve');
});

test('TTF : sfntVersion TrueType, glyf/loca/maxp 1.0, sans CFF, relu par opentype.js', () => {
  const built = buildTest();
  const ttf = PA.ttfBinary(built);
  const dv = new DataView(ttf);
  assert.strictEqual(dv.getUint32(0), 0x00010000, 'sfntVersion TrueType');
  const tags = []; for (let i = 0; i < dv.getUint16(4); i++) { const r = 12 + 16 * i; tags.push(String.fromCharCode(dv.getUint8(r), dv.getUint8(r + 1), dv.getUint8(r + 2), dv.getUint8(r + 3))); }
  assert.ok(!tags.includes('CFF '), 'pas de table CFF'); assert.ok(tags.includes('glyf') && tags.includes('loca'));
  const mp = tags.indexOf('maxp'), maxOff = dv.getUint32(12 + 16 * mp + 8);
  const mv = new DataView(ttf, maxOff);
  assert.strictEqual(mv.getUint32(0), 0x00010000, 'maxp version 1.0');
  assert.strictEqual(mv.getUint16(4), built.font.glyphs.length);
  const re = opentype.parse(ttf);
  for (const ch of 'AZaz09') assert.ok(re.charToGlyphIndex(ch) > 0, ch);
  const gl = re.charToGlyph('o').getPath(); assert.ok(gl.commands.length > 4, 'contours non vides');
});

test('TTF : cmap arabe + GSUB conservés, comme l\'OTF', () => {
  const G = { 'ل': PA.generate('l', m, 80), 'ا': PA.generate('I', m, 80) }; G['ل'].key = 'ل'; G['ا'].key = 'ا';
  PA.synthesize(G, m, { weight: 80 });
  const built = PA.buildFont(G, m, { family: 'Test' }, { weight: 80 });
  const re = opentype.parse(PA.ttfBinary(built));
  assert.ok(re.charToGlyphIndex('\uFEFB') > 0, 'lam-alif');
  const feats = re.tables.gsub.features.map(f => f.tag);
  for (const f of ['init', 'medi', 'fina', 'rlig']) assert.ok(feats.includes(f), f);
});

test('TTF : IoU > 0,9 entre OTF et TTF sur l\'alphabet', () => {
  const built = buildTest();
  const otf = PA.fontBinary(built), ttf = PA.ttfBinary(built);
  const io = opentype.parse(otf.slice(0)), it = opentype.parse(ttf.slice(0));
  const toContours = path => { const cs = []; let cur = null, l = null;
    for (const c of path.commands) {
      if (c.type === 'M') { cur = []; cs.push(cur); l = [c.x, c.y]; }
      else if (c.type === 'C') { cur.push([l[0], l[1], c.x1, c.y1, c.x2, c.y2, c.x, c.y]); l = [c.x, c.y]; }
      else if (c.type === 'Q') { cur.push([l[0], l[1], (l[0] + 2 * c.x1) / 3, (l[1] + 2 * c.y1) / 3, (2 * c.x1 + c.x) / 3, (2 * c.y1 + c.y) / 3, c.x, c.y]); l = [c.x, c.y]; }
      else if (c.type === 'L') { cur.push([l[0], l[1], l[0], l[1], c.x, c.y, c.x, c.y]); l = [c.x, c.y]; }
      else if (c.type === 'Z') { cur.push([l[0], l[1], l[0], l[1], cur[0][0], cur[0][1], cur[0][0], cur[0][1]]); }
    } return cs; };
  for (const ch of 'AOSgxerb0oq') {
    const a = PA.rasterize(toContours(io.charToGlyph(ch).getPath()), 200, 200);
    const b = PA.rasterize(toContours(it.charToGlyph(ch).getPath()), 200, 200);
    const v = PA.iou(a, b); assert.ok(v > 0.9, ch + ' IoU ' + v.toFixed(3));
  }
});
