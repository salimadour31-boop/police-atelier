// Diagnostic / régression sur entrées réalistes (photos simulées, 12 MP, arabe, serif gras).
// Exporte l'OTF de chaque cas, puis tests/check_real.py vérifie attribution (IoU par glyphe
// contre la police source), métriques, avances, absence de glyphes géants, rendu hb-view.
import { chromium } from 'playwright-core'; import fs from 'node:fs'; import { spawn, execFileSync } from 'node:child_process';
const URL = process.argv[2] || 'http://127.0.0.1:8767/index.html';
const srv = URL.includes('127.0.0.1') ? spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], { stdio: 'ignore' }) : null;
await new Promise(r => setTimeout(r, 700));
const R = 'tests/fixtures/real/';
const CASES = [
  { name: 'photo-planche-latine', file: R + 'photo-planche-latine.jpg', mode: 'auto', ref: 'Handlee', expect: 'latin' },
  { name: 'photo-alphabet-caveat', file: R + 'photo-alphabet-caveat.jpg', mode: 'free', ref: 'Caveat', expect: 'free' },
  { name: 'serif-gras', file: R + 'serif-gras.png', mode: 'auto', ref: 'DejaVuSerifBold', expect: 'free' },
  { name: 'photo-planche-latine-sauvola', file: R + 'photo-planche-latine.jpg', mode: 'template', method: 'sauvola', ref: 'Handlee', expect: 'latin' },
  { name: 'negatif-serif', file: R + 'negatif-serif.png', mode: 'free', ref: 'DejaVuSerifBold', expect: 'free' },
  { name: 'alphabet-accents-ponct', file: R + 'photo-alphabet-accents.jpg', mode: 'free', ref: 'Averia', expect: 'free', alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789éèêàçùôîëïûœæ.,;:!?\'"-()' },
  { name: 'alphabet-accents-defaut', file: R + 'photo-alphabet-accents.jpg', mode: 'free', ref: 'Averia', expect: 'free', mismatch: true },
  { name: 'alphabet-serre-incline', file: R + 'photo-alphabet-serre.jpg', mode: 'free', ref: 'Averia', expect: 'free' },
  { name: 'quicksand', file: R + 'quicksand-alphabet.jpg', mode: 'free', ref: 'Quicksand', expect: 'free' },
  { name: 'quicksand-sans-Rr', file: R + 'quicksand-sans-Rr.jpg', mode: 'free', ref: 'Quicksand', expect: 'free', alphabet: 'ABCDEFGHIJKLMNOPQSTUVWXYZabcdefghijklmnopqstuvwxyz0123456789', derivedCheck: ['R', 'r'] },
  { name: 'lettre-unique', file: R + 'lettre-unique-B.png', mode: 'free', ref: 'Quicksand', expect: 'few' },
  { name: 'photo-planche-arabe', file: R + 'photo-planche-arabe.jpg', mode: 'auto', ref: 'NotoNaskh', expect: 'arabic' }
];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const out = [];
for (const c of CASES) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); const p = await ctx.newPage(); const errs = [];
  p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.selectOption('#mode', c.mode); if (c.method) await p.selectOption('#method', c.method); if (c.alphabet) await p.fill('#alphabet', c.alphabet);
  const t0 = Date.now(); await p.setInputFiles('#file', c.file);
  let r = { name: c.name };
  try {
    await p.waitForFunction(() => document.getElementById('counts').textContent || document.querySelector('#alerts .alert.warn, #alerts .alert.error'), null, { timeout: 120000 });
    r.ms = Date.now() - t0; r.status = await p.textContent('#status'); r.counts = await p.textContent('#counts');
    r.items = await p.evaluate(() => { const ex = PAApp.state.run && PAApp.state.run.extract; return ex ? ex.items.map(it => it.key) : []; });
    r.suspects = await p.evaluate(() => { const ex = PAApp.state.run && PAApp.state.run.extract; return ex ? ex.items.filter(it => it.suspect).map(it => it.key || '∅') : []; });
    r.missing = await p.evaluate(() => (PAApp.state.run && PAApp.state.run.extract.missing) || []);
    r.analysis = await p.evaluate(() => PAApp.state.analysis); r.metrics = await p.evaluate(() => PAApp.state.metrics);
    r.sources = await p.evaluate(() => Object.fromEntries(Object.entries(PAApp.state.G || {}).map(([k, g]) => [k, g.source + (g.from ? ':' + g.from : '')])));
    if (c.expect === 'few') { r.alerts = await p.$$eval('#alerts .alert', els => els.map(e => e.className.replace('alert ', '') + ': ' + e.textContent)); r.unassigned = await p.evaluate(() => PAApp.state.run.extract.items.filter(i => !i.key).length); throw new Error('skip'); }
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('#dlOTF')]); await d.saveAs(`tests/out/real-${c.name}.otf`);
    r.alerts = await p.$$eval('#alerts .alert', els => els.map(e => e.className.replace('alert ', '') + ': ' + e.textContent));
    if (c.expect !== 'arabic') r.preview = await p.evaluate(async () => {
      // rend « abcdef » avec la police construite : 6 amas d'encre attendus, pas de barre géante
      const f = window.__paFontName; await document.fonts.load(`100px "${f}"`);
      const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 400; const x = cv.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 1400, 400); x.fillStyle = '#000'; x.font = `100px "${f}"`; x.fillText('abcdef', 50, 250);
      const d = x.getImageData(0, 0, 1400, 400).data, col = new Array(1400).fill(0); let top = 400, bot = 0;
      for (let yy = 0; yy < 400; yy++) for (let xx = 0; xx < 1400; xx++) if (d[(yy * 1400 + xx) * 4] < 128) { col[xx] = 1; top = Math.min(top, yy); bot = Math.max(bot, yy); }
      let clusters = 0, gaps = [], run = 0; for (let xx = 0; xx < 1400; xx++) { if (col[xx] && (xx === 0 || !col[xx - 1])) { clusters++; if (run) gaps.push(run); } run = col[xx] ? 0 : run + 1; }
      return { clusters, inkHeight: bot - top, gaps: gaps.slice(0, 5), width: Math.round(x.measureText('abcdef').width) };
    });
    await p.screenshot({ path: `tests/out/real-${c.name}.png`, fullPage: true });
  } catch (e) { if (e.message !== 'skip') r.fail = e.message.split('\n')[0]; }
  r.errors = errs; out.push(Object.assign(r, { ref: c.ref, expect: c.expect, alphabet: c.alphabet, mismatch: !!c.mismatch, derivedCheck: c.derivedCheck })); await ctx.close();
}
await b.close(); if (srv) srv.kill();
fs.writeFileSync('tests/out/realistic.json', JSON.stringify(out, null, 1));
for (const r of out) console.log(r.name, r.ms + 'ms', '|', r.status, '|', r.counts, r.fail || '', r.errors.join(';'));
