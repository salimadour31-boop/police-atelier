// Famille dans le navigateur : aperçu des 8 styles (bureau + mobile), export ZIP, aucune erreur console.
// usage : node tests/family_ui.mjs [url]  puis  python3 tests/validate_family.py
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); let bad = 0;
for (const [vw, vh, tag] of [[1300, 900, 'bureau'], [390, 844, 'mobile']]) {
  const p = await b.newPage({ viewport: { width: vw, height: vh } }); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.selectOption('#mode', 'free');
  await p.setInputFiles('#file', 'tests/fixtures/real/quicksand-alphabet.jpg');
  await p.waitForFunction(() => document.getElementById('counts').textContent, null, { timeout: 60000 });
  await p.click('#famPreview'); await p.waitForFunction(() => document.querySelectorAll('.famRow').length >= 8, null, { timeout: 120000 });
  await p.waitForTimeout(400);
  console.log(tag, '|', await p.textContent('#famStatus'), '| erreurs :', errs.length ? errs : 'aucune'); bad += errs.length;
  await p.locator('#sec-family').screenshot({ path: tag === 'bureau' ? 'docs/screenshot-famille.png' : 'tests/out/famille-mobile.png' });
  if (tag === 'bureau') { const [d] = await Promise.all([p.waitForEvent('download'), p.click('#famExport')]); await d.saveAs('tests/out/famille.zip'); }
}
await b.close(); process.exit(bad ? 1 : 0);
