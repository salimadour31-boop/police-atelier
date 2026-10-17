// Chaque fichier JS de l'application doit être syntaxiquement valide (une apostrophe non échappée casse tout le site)
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), { execFileSync } = require('child_process');
for (const f of fs.readdirSync(__dirname + '/../js')) test('syntaxe ' + f, () => { execFileSync(process.execPath, ['--check', __dirname + '/../js/' + f]); assert.ok(true); });
