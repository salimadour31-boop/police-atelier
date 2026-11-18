// Tests unitaires : découpe des lettres attachées (splitTouching) et rotation exacte d'image (rot90).
const test = require('node:test'), assert = require('node:assert');
for (const f of ['imageproc', 'segment', 'trace', 'chars', 'analyse', 'assign', 'pipeline']) require(`../js/${f}.js`);
const PA = globalThis.PA;
const blank = (w, h) => ({ w, h, data: new Uint8Array(w * h) });
const fill = (b, x0, y0, x1, y1, v = 1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) b.data[y * b.w + x] = v; };
const line = (b, x0, y0, x1, y1, t) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  for (let s = 0; s <= n; s++) for (let dy = 0; dy < t; dy++) for (let dx = 0; dx < t; dx++) {
    const x = Math.round(x0 + (x1 - x0) * s / n) + dx, y = Math.round(y0 + (y1 - y0) * s / n) + dy;
    if (x >= 0 && x < b.w && y >= 0 && y < b.h) b.data[y * b.w + x] = 1;
  }
};

test('splitTouching : deux lettres jointes par un pont fin sont séparées', () => {
  const b = blank(300, 260);
  fill(b, 10, 100, 39, 159);            // première lettre
  fill(b, 43, 100, 82, 159);            // seconde lettre
  fill(b, 40, 125, 42, 127);            // pont de 3 px de haut (jonction)
  fill(b, 130, 100, 169, 159); fill(b, 180, 100, 219, 159); // deux lettres normales
  const out = PA.splitTouching(PA.components(b));
  assert.strictEqual(out.length, 4, '3 comps -> 4 pieces');
  const wide = out.filter(c => c.x1 - c.x0 + 1 > 60);
  assert.strictEqual(wide.length, 0, 'plus aucun bloc large');
});

test('splitTouching : un mot entier collé est découpé en lettres', () => {
  const b = blank(340, 260);
  fill(b, 200, 100, 239, 159); fill(b, 242, 100, 281, 159); fill(b, 284, 100, 323, 159);
  fill(b, 240, 130, 241, 135); fill(b, 282, 130, 283, 135); // deux ponts de 6 px
  const out = PA.splitTouching(PA.components(b));
  assert.strictEqual(out.length, 3);
  assert.ok(out.every(c => c.x1 - c.x0 + 1 < 60), 'chaque pièce tient dans une lettre');
});

test('splitTouching : un W seul (diagonales, pas de tige pleine) reste entier', () => {
  const b = blank(340, 260);
  line(b, 200, 100, 220, 159, 5); line(b, 220, 159, 240, 100, 5); line(b, 240, 100, 260, 159, 5); line(b, 260, 159, 280, 100, 5);
  const out = PA.splitTouching(PA.components(b));
  assert.strictEqual(out.length, 1, 'le W ne doit pas être coupé aux sommets');
});

test('splitTouching : un U creux (vallée large) reste entier', () => {
  const b = blank(340, 260);
  line(b, 200, 100, 200, 152, 6); line(b, 274, 100, 274, 152, 6); line(b, 200, 152, 274, 152, 6);
  const out = PA.splitTouching(PA.components(b));
  assert.strictEqual(out.length, 1);
});

test('splitTouching : lettres séparées ou composantes courtes non touchées', () => {
  const b = blank(300, 260);
  fill(b, 10, 100, 40, 159); fill(b, 70, 100, 100, 159);
  fill(b, 130, 100, 134, 108); // tout petit rectangle // tout petit rectangle
  const out = PA.splitTouching(PA.components(b));
  assert.strictEqual(out.length, 3);
});

test('rot90 : quart de tour exact, dimensions échangées, tout pixel conservé', () => {
  const b = blank(5, 3);
  fill(b, 1, 0, 1, 2); fill(b, 4, 2, 4, 2);
  const cw = PA.rot90(b, true), ccw = PA.rot90(b, false);
  assert.strictEqual(cw.w, 3); assert.strictEqual(cw.h, 5);
  assert.strictEqual(ccw.w, 3); assert.strictEqual(ccw.h, 5);
  const nInk = img => img.data.reduce((s, v) => s + (v ? 1 : 0), 0);
  assert.strictEqual(nInk(cw), nInk(b), 'aucun pixel perdu (horaire)');
  assert.strictEqual(nInk(ccw), nInk(b), 'aucun pixel perdu (anti-horaire)');
  // horaire : (1,0) -> (ligne 1, col 2) ; anti-horaire : (1,0) -> (ligne 3, col 0)
  assert.strictEqual(cw.data[1 * 3 + 2], 1, 'horaire : (1,0) -> (1,2)');
  assert.strictEqual(ccw.data[3 * 3 + 0], 1, 'anti-horaire : (1,0) -> (3,0)');
  const twice = PA.rot90(PA.rot90(b, true), true), exact = true;
  // 180° canonique : (x,y) -> (w-1-x, h-1-y), aucun pixel perdu ni déplacé
  const b180 = blank(b.w, b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) b180.data[(b.h - 1 - y) * b.w + (b.w - 1 - x)] = b.data[y * b.w + x];
  assert.strictEqual(twice.w, b180.w); assert.strictEqual(twice.h, b180.h);
  for (let i = 0; i < b180.data.length; i++) assert.strictEqual(twice.data[i], b180.data[i], 'deux quarts de tour = 180° exact');
});

test('detectTemplateRotated : planche détectée droite et retournée, rien sans planche', () => {
  const SHEET = PA.SHEET;
  const sheet = () => {
    const g = blank(SHEET.W, SHEET.H);
    const m = SHEET.margin, s = SHEET.marker;
    for (const [x, y] of [[m, m], [SHEET.W - m - s, m], [SHEET.W - m - s, SHEET.H - m - s], [m, SHEET.H - m - s]]) fill(g, x, y, x + s, y + s);
    return g;
  };
  const found0 = PA.detectTemplateRotated({ gray: sheet(), bin: sheet() });
  assert.ok(found0 && found0.corners.length === 4, 'planche droite détectée');
  assert.strictEqual(found0.rotation, 0);
  const ccw = PA.rot90(sheet(), false);
  const found90 = PA.detectTemplateRotated({ gray: ccw, bin: ccw });
  assert.ok(found90, 'planche tournée détectée ; le retournement éventuel est corrigé plus tard');
  assert.strictEqual(found90.rotation, 90);
  assert.strictEqual(PA.detectTemplateRotated({ gray: blank(600, 400), bin: blank(600, 400) }), null, 'aucune planche -> null');
});

test("planche tournée : le pipeline lit les mêmes cases, warnings avec l'angle réel", () => {
  const SHEET = PA.SHEET, L = PA.layout('latin');
  const sheet = () => {
    const g = blank(SHEET.W, SHEET.H);
    g.data.fill(255);
    const m = SHEET.margin, s = SHEET.marker;
    for (const [x, y] of [[m, m], [SHEET.W - m - s, m], [SHEET.W - m - s, SHEET.H - m - s], [m, SHEET.H - m - s]]) fill(g, x, y, x + s, y + s, 0);
    for (const cell of L.cells) fill(g, Math.round(cell.inner.x) + 8, Math.round(cell.base) - 26, Math.round(cell.inner.x) + 68, Math.round(cell.base), 0);
    return g;
  };
  const opts = { mode: 'template', alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', method: 'otsu', invert: 'auto', thresh: null, despeckle: 12, deskew: true };
  const upright = PA.run(sheet(), opts);
  assert.ok(!upright.warnings.some(w => w.code === 'rotated'), 'planche droite : pas de bandeau rotation');
  assert.strictEqual(upright.glyphs.length, L.cells.length, 'toutes les cases lues');
  for (const [deg, build] of [
    [90, g => PA.rot90(g, false)],
    [180, g => PA.rot90(PA.rot90(g, true), true)],
    [270, g => PA.rot90(g, true)],
  ]) {
    const r = PA.run(build(sheet()), opts);
    const rot = r.warnings.filter(w => w.code === 'rotated');
    assert.ok(rot.length === 1, deg + '° : un seul bandeau de rotation');
    assert.strictEqual(rot[0].deg, deg, deg + '° : angle annoncé correct');
    assert.strictEqual(r.glyphs.length, upright.glyphs.length, deg + '° : autant de cases lues qu\'à l\'endroit');
    assert.deepStrictEqual(r.glyphs.map(g => g.key), upright.glyphs.map(g => g.key), deg + '° : mêmes caractères aux mêmes cases');
  }
});
