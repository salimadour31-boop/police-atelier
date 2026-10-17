// Remplit les planches avec des polices « manuscrites » OFL (entrée de test uniquement).
import { chromium } from 'playwright-core'; import fs from 'node:fs'; import { spawn } from 'node:child_process';
const srv = spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const p = await b.newPage();
await p.goto('http://127.0.0.1:8766/index.html'); fs.mkdirSync('tests/out', { recursive: true });
for (const [kind, font, ratio, name] of [['latin', 'Handlee', 0.72, 'hand'], ['arabic', 'Noto Naskh Arabic', 0.9, 'naskh']]) {
  const b64 = await p.evaluate(async ([k, f, r]) => { await document.fonts.load(`40px "${f}"`); const c = document.createElement('canvas'); c.width = PA.SHEET.W; c.height = PA.SHEET.H; PA.drawTemplate(c.getContext('2d'), k, { font: f, capRatio: r }); return c.toDataURL('image/png').split(',')[1]; }, [kind, font, ratio]);
  fs.writeFileSync(`tests/out/sheet-${kind}-${name}.png`, Buffer.from(b64, 'base64'));
}
await b.close(); srv.kill();
