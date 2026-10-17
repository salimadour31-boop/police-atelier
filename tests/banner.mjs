// Rien d'attribuable automatiquement : bandeau + « Attribuer dans l'ordre » doit remplir la police
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto(url);
const empty0 = await p.textContent('#grid');
await p.selectOption('#mode', 'free'); await p.setInputFiles('#file', 'tests/fixtures/real/lettre-unique-B.png');
await p.waitForSelector('#assignInOrder', { timeout: 30000 }); const banner = await p.textContent('.alert.banner');
await p.click('#assignInOrder'); await p.waitForFunction(() => document.getElementById('counts').textContent);
const filled = await p.evaluate(() => [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].filter(k => PAApp.state.G[k]).length);
const manq = await p.$$eval('#grid .cell.missing', e => e.length);
console.log({ empty0: empty0.slice(0, 60), banner: banner.slice(0, 80), filled, manq, errs });
await b.close(); process.exit(filled === 62 && !errs.length && !/manquant/.test(empty0) ? 0 : 1);
