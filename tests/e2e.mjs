// Test de bout en bout : Chrome sans tête (playwright-core), largeurs bureau et mobile.
// 1) alphabet DejaVu Sans rendu en image -> pipeline texte libre -> OTF
// 2) planche latine + planche arabe pré-remplies (DejaVu Sans) -> OTF combiné
// 3) mise en forme arabe (سلام، محمد) via FontFace, comparée aux formes isolées
// 4) validation fontTools / OTS / IoU (tests/validate.py)
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
const PORT = 8765, URL = `http://127.0.0.1:${PORT}/index.html`;
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
execFileSync('python3', ['tests/make_fixture.py']); fs.rmSync('tests/fixtures/alphabet.pgm', { force: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const results = { errors: [] }; let fail = false;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fail = true; };
async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') results.errors.push(`[${w}] ${m.text()}`); });
  page.on('pageerror', e => results.errors.push(`[${w}] ${e.message}`));
  await page.goto(URL); return page;
}
async function saveDownload(page, sel, path) { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); await d.saveAs(path); return path; }
async function sheetPNG(page, kind) {
  const b64 = await page.evaluate(async k => { await document.fonts.load('40px "DejaVu Sans"'); const c = document.createElement('canvas'); c.width = PA.SHEET.W; c.height = PA.SHEET.H; PA.drawTemplate(c.getContext('2d'), k, { font: 'DejaVu Sans', capRatio: 0.73 }); return c.toDataURL('image/png').split(',')[1]; }, kind);
  const p = `tests/out/sheet-${kind}.png`; fs.writeFileSync(p, Buffer.from(b64, 'base64')); return p;
}
const waitGlyphs = page => page.waitForFunction(() => document.getElementById('counts').textContent.length > 0, null, { timeout: 60000 });

// ---- bureau
const page = await open(1440, 1000);
await page.selectOption('#mode', 'free');
await page.setInputFiles('#file', 'tests/fixtures/alphabet.png');
await waitGlyphs(page);
results.freeStatus = await page.textContent('#status');
ok(/62/.test(results.freeStatus), 'texte libre : 62 glyphes segmentés — ' + results.freeStatus);
await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'docs/screenshot-desktop.png' });
await saveDownload(page, '#dlOTF', 'tests/out/free.otf');
await saveDownload(page, '#dlWOFF', 'tests/out/free.woff');
await saveDownload(page, '#dlJSON', 'tests/out/free.json');
await page.click('#resetAll');
// planches modèles
await page.selectOption('#mode', 'auto');
const latin = await sheetPNG(page, 'latin'), arabic = await sheetPNG(page, 'arabic');
await page.setInputFiles('#file', latin); await waitGlyphs(page);
results.latinStatus = await page.textContent('#status'); ok(/latin/.test(results.latinStatus), 'planche latine détectée — ' + results.latinStatus);
await page.click('#addSheet');
await page.setInputFiles('#file', arabic);
await page.waitForFunction(() => /arabic/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
results.arabicStatus = await page.textContent('#status'); ok(true, 'planche arabe détectée — ' + results.arabicStatus);
await page.waitForFunction(() => window.__paFontName && document.fonts.check(`20px "${window.__paFontName}"`));
await saveDownload(page, '#dlOTF', 'tests/out/full.otf');
results.counts = await page.textContent('#counts');
// mise en forme arabe : rendu du texte logique vs formes de présentation explicites
results.shaping = await page.evaluate(async () => {
  const f = window.__paFontName; await document.fonts.load(`80px "${f}"`);
  const draw = s => { const c = document.createElement('canvas'); c.width = 900; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 200); x.fillStyle = '#000'; x.font = `100px "${f}"`; x.direction = 'rtl'; x.textAlign = 'right'; x.fillText(s, 880, 140); return { d: x.getImageData(0, 0, 900, 200).data, w: x.measureText(s).width }; };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.d.length; i += 4) if (Math.abs(a.d[i] - b.d[i]) > 60) n++; return n; };
  const out = {};
  for (const [word, joined, isolated] of [['سلام', 'ﺳﻼﻡ', 'ﺱﻝﺍﻡ'], ['محمد', 'ﻣﺤﻤﺪ', 'ﻡﺡﻡﺩ']]) {
    const a = draw(word), j = draw(joined), i = draw(isolated);
    out[word] = { diffVsJoinedForms: diff(a, j), diffVsIsolatedForms: diff(a, i), width: Math.round(a.w), widthIsolated: Math.round(i.w), widthJoined: Math.round(j.w) };
  }
  return out;
});
for (const [w, r] of Object.entries(results.shaping)) ok(r.diffVsJoinedForms < r.diffVsIsolatedForms / 10, `mise en forme ${w} : ${JSON.stringify(r)}`);
// sans GSUB ? Chrome (HarfBuzz) n'utilise pas la cmap des formes de présentation : on vérifie aussi GSUB avec fontTools.
await page.locator('#preview').fill('سلام محمد — Azul ! Ḍ ɣ ɛ č é');
await page.screenshot({ path: 'docs/screenshot-arabe.png', fullPage: true });
// export des modèles PDF/PNG
await saveDownload(page, '[data-tpl=latin][data-fmt=pdf]', 'docs/planche-latine.pdf');
await saveDownload(page, '[data-tpl=arabic][data-fmt=pdf]', 'docs/planche-arabe.pdf');
await saveDownload(page, '[data-tpl=latin][data-fmt=png]', 'docs/planche-latine.png');
await saveDownload(page, '[data-tpl=arabic][data-fmt=png]', 'docs/planche-arabe.png');
// langues
for (const l of ['en', 'kab', 'fr']) await page.click(`[data-lang=${l}]`);
await page.check('#tif'); await page.click('[data-lang=kab]'); results.tifTitle = await page.textContent('#sec-input h2'); await page.uncheck('#tif'); await page.click('[data-lang=fr]');
// ---- mobile
const mob = await open(390, 844);
await mob.selectOption('#mode', 'free'); await mob.setInputFiles('#file', 'tests/fixtures/alphabet.png'); await waitGlyphs(mob);
const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(overflow <= 1, `mobile 390 px : pas de défilement horizontal (${overflow})`);
await mob.screenshot({ path: 'docs/screenshot-mobile.png', fullPage: false });
await browser.close(); server.kill();
ok(results.errors.length === 0, 'aucune erreur console ' + JSON.stringify(results.errors));
// ---- validation Python
const v = JSON.parse(execFileSync('python3', ['tests/validate.py', 'tests/out/free.otf:iou', 'tests/out/full.otf:iou:arabic']).toString());
results.validation = v;
for (const r of v) {
  ok(r.AZ && r.az && r.digits, `${r.file} : cmap A-Z a-z 0-9 ; ${r.glyphs} glyphes ; tables ${r.tables.join(' ')}`);
  ok(r.ots === true, `${r.file} : OTS ots-sanitize OK`);
  ok(r.iou_min > 0.8, `${r.file} : IoU min ${r.iou_min} / moyenne ${r.iou_mean} ${JSON.stringify(r.iou_worst)}`);
  if (r.gsub_features) ok(r.arabic_base && r.arabic_digits, `${r.file} : arabe — GSUB ${r.gsub_features.join(',')}, ${r.arabic_pres_forms} formes de présentation ; HarfBuzz ${JSON.stringify(r.harfbuzz)}`);
}
ok(fs.readFileSync('tests/out/free.woff').subarray(0, 4).toString() === 'wOFF', 'WOFF valide (signature)');
fs.writeFileSync('tests/out/results.json', JSON.stringify(results, null, 1));
console.log(fail ? 'ÉCHEC' : 'TOUT EST VERT'); process.exit(fail ? 1 : 0);
