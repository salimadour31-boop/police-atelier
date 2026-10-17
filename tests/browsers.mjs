// Fumée multi-navigateurs : Chrome, Firefox, WebKit (≈ Safari), bureau + mobile.
// Usage : node tests/browsers.mjs [URL]  — capture erreurs console, requêtes échouées, export.
import { chromium, firefox, webkit } from 'playwright-core';
import fs from 'node:fs';
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const img = process.argv[3] || 'tests/fixtures/alphabet.png';
const report = []; let bad = 0;
for (const [name, type, opt] of [['chrome', chromium, { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }], ['firefox', firefox, {}], ['webkit', webkit, {}]]) {
  const browser = await type.launch(opt);
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', r => errs.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
    page.on('response', r => { if (r.status() >= 400) errs.push(`http ${r.status()}: ${r.url()}`); });
    await page.goto(URL, { waitUntil: 'load' });
    await page.selectOption('#mode', 'free');
    await page.setInputFiles('#file', img);
    let counts = '', dl = {};
    try {
      await page.waitForFunction(() => document.getElementById('counts').textContent, null, { timeout: 60000 });
      counts = await page.textContent('#counts');
      for (const id of ['dlOTF', 'dlWOFF']) {
        const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#' + id)]);
        const p = await d.path(); dl[id] = p ? fs.statSync(p).size : 0;
      }
    } catch (e) { errs.push('test: ' + e.message.split('\n')[0]); }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const r = { browser: name, width: w, counts, downloads: dl, overflow, valid: await page.textContent('#valid'), errors: errs };
    if (errs.length || !counts || overflow > 1) bad++;
    report.push(r); console.log(JSON.stringify(r));
    await ctx.close();
  }
  await browser.close();
}
fs.mkdirSync('tests/out', { recursive: true }); fs.writeFileSync('tests/out/browsers.json', JSON.stringify(report, null, 1));
console.log(bad ? `PROBLÈMES : ${bad}` : 'OK sur tous les navigateurs'); process.exit(bad ? 1 : 0);
