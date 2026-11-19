// Tests crénage élargi : liste étendue (Tx) et balayage des profils hors liste (7x), garde-fous.
const test = require('node:test'), assert = require('node:assert');
globalThis.opentype = require('../vendor/opentype.min.js');
for (const f of ['imageproc', 'segment', 'trace', 'chars', 'analyse', 'assign', 'pipeline', 'synth', 'fontbuild']) require(`../js/${f}.js`);
const PA = globalThis.PA;

const line = (x0, y0, x1, y1) => [[x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + 2 * (x1 - x0) / 3, y0 + 2 * (y1 - y0) / 3, x1, y1]];
const rect = (x0, y0, x1, y1) => [...line(x0, y0, x1, y0), ...line(x1, y0, x1, y1), ...line(x1, y1, x0, y1), ...line(x0, y1, x0, y0)];
const finals = {
  H: { adv: 800, contours: [rect(100, 0, 600, 700)] },
  T: { adv: 800, contours: [rect(100, 600, 700, 700), rect(350, 0, 450, 600)] },
  '7': { adv: 800, contours: [rect(100, 600, 700, 700), [...line(650, 600, 150, 0)]] },
  x: { adv: 800, contours: [[...line(150, 0, 650, 500)], [...line(650, 0, 150, 500)]] },
  n: { adv: 800, contours: [rect(200, 0, 600, 700)] }
};
const index = {};
Object.keys(finals).forEach((k, i) => { index[k] = i + 2; });
const OLD = new Set(('AV AW AY AT AC AG AO AQ AU Av Aw Ay VA WA YA TA LT LV LW LY Ly L\' FA F. F, PA P. P, TA Ta Tc Te To Tr Ts Tu Tw Ty Ti T. T, ' +
  'Va Ve Vo Vu Wa We Wo Ya Ye Yo Yu Y. Y, V. V, W. W, RT RV RW RY Ka Ke Ko Kv Ky ky av aw ay ov ow oy ox va ve vo wa we wo ya ye yo y. y, v. v, w. w, r. r, f. f,').split(' ').filter(x => x.length === 2));

test('liste élargie : Tx (absent de la liste d\'origine) est créné négativement', () => {
  assert.ok(!OLD.has('Tx'), "Tx ne devrait pas être dans la liste d'origine");
  const kern = PA.autoKern(finals, index, 80);
  const map = new Map(kern.map(k => [k[3], k[2]]));
  assert.ok(map.has('Tx'), 'Tx manquant, paires : ' + [...map.keys()].join(','));
  const v = map.get('Tx');
  assert.ok(v <= -10 && v >= -120 && v % 5 === 0, 'valeur Tx = ' + v);
});

test('balayage : 7x (contact haut/bas courbe, hors liste) est créné', () => {
  assert.ok(!OLD.has('7x') && !PA.KERN_PAIRS.includes('7x'), '7x ne devrait être dans aucune liste');
  const kern = PA.autoKern(finals, index, 80);
  const map = new Map(kern.map(k => [k[3], k[2]]));
  assert.ok(map.has('7x'), '7x manquant, paires : ' + [...map.keys()].join(','));
  const v = map.get('7x');
  assert.ok(v <= -10 && v >= -120 && v % 5 === 0, 'valeur 7x = ' + v);
});

test('garde-fou : une paire uniforme (Hn) n\'est pas crénée', () => {
  const kern = PA.autoKern(finals, index, 80);
  assert.ok(!kern.some(k => k[3] === 'Hn'), 'Hn ne devrait pas être créné');
});

test('sans référence (aucun fût droit) : balayage sans crash, vide', () => {
  assert.deepEqual(PA.autoKern({}, {}, 80), []);
});

test('GPOS : le script arabe (arab) est couvert par kern', () => {
  const bin = PA.gposTable([[2, 3, -50]]);
  const has = t => { const tag = [...t].map(c => c.charCodeAt(0)); for (let i = 0; i + 4 <= bin.length; i++) if (tag.every((c, j) => bin[i + j] === c)) return true; return false; };
  assert.ok(has('arab'), 'script arab absent du ScriptList');
  assert.ok(has('latn'), 'script latn absent du ScriptList');
});

test('arabe : forme isolée → ponctuation arabe/latine est crénée, valeurs bornées', () => {
  const m = { capHeight: 700, xHeight: 500, ascender: 740, descender: -200 };
  const rec = (key, c) => PA.makeRec(key, c, 'traced');
  const G = {
    'د': rec('د', [rect(150, 0, 650, 400)]),
    'م': rec('م', [rect(150, 0, 650, 350)]),
    'ب': rec('ب', [rect(150, 0, 650, 500), rect(250, 40, 420, 120)]),
    'ا': rec('ا', [rect(380, 0, 520, 600)])
  };
  PA.synthesize(G, m, { weight: 80 });
  const built = PA.buildFont(G, m, { family: 'T' }, { weight: 80 });
  const rev = {}; for (const k in built.index) rev[built.index[k]] = k;
  const ar = built.kern.filter(x => PA.isArabicKey(rev[x[0]]) || PA.isArabicKey(rev[x[1]]));
  assert.ok(ar.length >= 2, 'aucune paire arabe : ' + built.kern.length);
  for (const [a, b, v] of ar) { assert.ok(v <= -10 && v >= -120 && v % 5 === 0, 'valeur ' + v); assert.ok(rev[a] && rev[b]); }
  const seeded = ar.find(x => !rev[x[0]].includes('.') && /[\u060c\u061b\u061f/.!?;:,]/.test(rev[x[1]]));
  assert.ok(seeded, 'aucune paire forme isolée + ponctuation');
});
