// Attribution sur des entrées variées : chaque cas doit attribuer > 90 % de A-Z a-z 0-9, sans erreur console.
// usage : node tests/broad.mjs [url]
import { chromium } from 'playwright-core'; import fs from 'fs';
const url = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const cases = JSON.parse(fs.readFileSync('tests/fixtures/broad/cases.json', 'utf8'));
const extra = [{ name: 'planche-photo', file: 'tests/fixtures/real/photo-planche-latine.jpg', mode: 'template' }, { name: 'quicksand-alphabet-photo', file: 'tests/fixtures/real/quicksand-alphabet.jpg' }];
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); const errs = [];
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url); let bad = 0; const out = [];
for (const c of [...cases, ...extra]) {
  errs.length = 0;
  await p.evaluate(() => { document.getElementById('counts').textContent = ''; document.getElementById('alerts').innerHTML = ''; });
  await p.selectOption('#mode', c.mode || process.env.MODE || 'free');
  await p.setInputFiles('#file', c.file);
  try { await p.waitForFunction(() => document.getElementById('counts').textContent || document.querySelector('#alerts .alert'), null, { timeout: 60000 }); } catch { }
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const G = PAApp.state.G || {}, exp = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const traced = [...exp].filter(k => G[k] && G[k].source === 'traced').length, filled = [...exp].filter(k => G[k]).length;
    return { traced, filled, frac: traced / exp.length, alerts: [...document.querySelectorAll('#alerts .alert')].map(a => a.textContent.slice(0, 100)) };
  });
  r.name = c.name; r.errs = errs.slice(); const ok = r.frac > 0.9 && r.filled === 62 && !r.errs.length; if (!ok) bad++;
  console.log(ok ? '✓' : '✗', c.name.padEnd(36), (r.frac * 100).toFixed(0) + ' %', 'rempli', r.filled, ok ? '' : JSON.stringify(r.alerts) + r.errs.join(' '));
  out.push(r);
}
fs.writeFileSync('tests/out/broad.json', JSON.stringify(out, null, 1));
console.log(bad ? `${bad} échec(s)` : 'ATTRIBUTION LARGE : OK'); await b.close(); process.exit(bad ? 1 : 0);
