"""Valide chaque style d'une famille exportée (ZIP) : fontTools, OTS, noms/OS-2 pour le regroupement,
GPOS kern, contreformes ouvertes (o, e, a en Black) et graisse croissante ; rend une cascade hb-view."""
import sys, os, json, subprocess, zipfile, io
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
import ots
from PIL import Image, ImageDraw, ImageFont
import numpy as np
z = sys.argv[1] if len(sys.argv) > 1 else 'tests/out/famille.zip'
out = 'tests/out/famille'; os.makedirs(out, exist_ok=True)
zipfile.ZipFile(z).extractall(out)
otfs = sorted(f for f in os.listdir(out + '/OTF'))
rep, fail = [], []
def ink(path, text, size=200):
    f = ImageFont.truetype(path, size); im = Image.new('L', (size * 3, int(size * 1.6)), 0); ImageDraw.Draw(im).text((10, 10), text, font=f, fill=255)
    return np.array(im) > 127
def holes(path, ch):
    from scipy import ndimage
    a = ink(path, ch); lab, n = ndimage.label(~a); return n - 1  # composantes de fond hors fond extérieur
for fn in otfs:
    p = f'{out}/OTF/{fn}'; f = TTFont(p); n = f['name']
    r = {'file': fn, 'ots': ots.sanitize(p, '/tmp/ots_fam.otf', capture_output=True).returncode == 0,
         'weight': f['OS/2'].usWeightClass, 'fsSel': f['OS/2'].fsSelection, 'mac': f['head'].macStyle, 'italicAngle': f['post'].italicAngle,
         'id1': n.getDebugName(1), 'id2': n.getDebugName(2), 'id4': n.getDebugName(4), 'id6': n.getDebugName(6), 'id16': n.getDebugName(16), 'id17': n.getDebugName(17),
         'gpos_kern': 'GPOS' in f and any(fr.FeatureTag == 'kern' for fr in f['GPOS'].table.FeatureList.FeatureRecord),
         'ink': round(float(ink(p, 'Hamburg').mean()), 4)}
    cmap = f.getBestCmap(); r['cmap_ok'] = all(ord(c) in cmap for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
    r['holes'] = {c: holes(p, c) for c in 'oeaB8'}
    rep.append(r)
    if not r['ots'] or not r['cmap_ok']: fail.append(f'{fn}: OTS/cmap')
    if r['holes']['o'] < 1 or r['holes']['B'] < 2 or r['holes']['8'] < 2 or r['holes']['e'] < 1: fail.append(f'{fn}: contreforme fermée {r["holes"]}')
    it = 'Italic' in fn
    if it != bool(r['fsSel'] & 1) or it != bool(r['mac'] & 2) or (it and r['italicAngle'] >= 0): fail.append(f'{fn}: drapeaux italique')
    if r['id16'] is None or r['id1'] is None: fail.append(f'{fn}: noms 1/16')
# graisse croissante (droits)
ups = [r for r in rep if 'Italic' not in r['file']]; ups.sort(key=lambda r: r['weight'])
for a, b in zip(ups, ups[1:]):
    if b['ink'] <= a['ink'] * 1.05: fail.append(f"graisse non croissante {a['file']} {a['ink']} -> {b['file']} {b['ink']}")
# style linking : un seul Regular/Italic/Bold/Bold Italic par famille ID1
fams = {}
for r in rep: fams.setdefault(r['id1'], []).append(r['id2'])
for k, v in fams.items():
    if len(v) != len(set(v)): fail.append(f'ID1 {k} : sous-familles en double {v}')
# cascade hb-view
order = sorted(rep, key=lambda r: (r['weight'], 'Italic' in r['file']))
ims = []
for r in order:
    png = f'/tmp/wf-{r["file"]}.png'
    subprocess.run(['hb-view', f'{out}/OTF/{r["file"]}', f'{r["id17"]}  AVATAR Toyota LT abc 0123', '--font-size=56', '-o', png], check=True)
    ims.append(Image.open(png).convert('RGB'))
W = max(i.width for i in ims); im = Image.new('RGB', (W, sum(i.height for i in ims)), 'white'); y = 0
for i in ims: im.paste(i, (0, y)); y += i.height
im.save('docs/famille-cascade.png')
json.dump(rep, open('tests/out/validate_family.json', 'w'), indent=1, ensure_ascii=False)
for r in rep: print(r['file'], r['weight'], hex(r['fsSel']), r['mac'], r['italicAngle'], '|', r['id1'], '/', r['id2'], '|', r['id16'], '/', r['id17'], '| ots', r['ots'], 'kern', r['gpos_kern'], 'ink', r['ink'], r['holes'])
print('\n'.join(fail) if fail else 'FAMILLE : OK')
sys.exit(1 if fail else 0)
