"""Contrôle des polices issues des entrées réalistes."""
import json, string, subprocess, sys
sys.path.insert(0, 'tests')
from iou import raster
from fontTools.ttLib import TTFont
G = '/usr/share/fonts/truetype/sand-box/google/'
REF = {'Handlee': G + 'Handlee/Handlee-Regular.ttf', 'Caveat': G + 'Caveat/Caveat-VariableFont_wght.ttf',
       'DejaVuSerifBold': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 'NotoNaskh': G + 'Noto Naskh Arabic/NotoNaskhArabic-VariableFont_wght.ttf'}
def iou(a, b): return float((a & b).sum() / max(1, (a | b).sum()))
res = json.load(open('tests/out/realistic.json')); summary = []
for r in res:
    path = f"tests/out/real-{r['name']}.otf"
    try:
        f = TTFont(path); gs0 = f.getGlyphSet()
        from fontTools.pens.recordingPen import RecordingPen
        for gn in f.getGlyphOrder(): gs0[gn].draw(RecordingPen())   # décode tous les charstrings CFF
    except Exception as e: summary.append({'name': r['name'], 'error': 'CFF/OTF corrompu : %r' % e}); continue
    cmap = f.getBestCmap(); hm = f['hmtx'].metrics; gs = f.getGlyphSet()
    from fontTools.pens.boundsPen import BoundsPen
    giant = []
    for ch in string.ascii_letters + string.digits:
        gn = cmap.get(ord(ch)); bp = BoundsPen(gs); gs[gn].draw(bp)
        if bp.bounds and (bp.bounds[3] - bp.bounds[1] > 1300 or bp.bounds[2] - bp.bounds[0] > 1300): giant.append(ch)
    s = {'name': r['name'], 'status': r.get('status'), 'counts': r.get('counts'), 'giant': giant}
    if r['expect'] != 'arabic':
        chars = string.ascii_letters + string.digits; scores = {}
        traced = set(k for k in (r.get('items') or []) if k)
        for ch in chars:
            if ch not in traced: continue
            a, b = raster(REF[r['ref']], ch), raster(path, ch)
            scores[ch] = round(iou(a, b), 2) if a is not None and b is not None else 0
        v = list(scores.values()) or [0]
        s.update(traced=len(scores), iou_mean=round(sum(v) / len(v), 3), iou_min=min(v), bad=sorted([k for k, x in scores.items() if x < 0.6]), worst=sorted(scores.items(), key=lambda x: x[1])[:6])
        # largeur des approches : rapport encre / avance pour quelques lettres
        txt = 'abcdef ABC Hamburgefonstiv 0123'
        # lignes de base et hauteurs : lettres posées à y≈0, capitales plates cohérentes
        def bnds(ch):
            bp = BoundsPen(gs); gs[cmap[ord(ch)]].draw(bp); return bp.bounds
        off = {ch: round(bnds(ch)[1]) for ch in 'abcdefhiklmnrtuvwxzABDEFHKLMNRTZ' if ch in traced}
        s['baseline_off_max'] = max([abs(v) for v in off.values()] or [0]); s['baseline_bad'] = [k for k, v in off.items() if abs(v) > 45]
        caps = [bnds(ch)[3] for ch in 'BDEFHIKLMNPRTUVWXYZ' if ch in traced]
        if caps:
            m = sorted(caps)[len(caps) // 2]; s['cap_spread'] = round((max(caps) - min(caps)) / m, 3)
        s['preview'] = r.get('preview')
    else:
        txt = 'سلام محمد ٠١٢٣'
    subprocess.run(['hb-view', path, txt, '--font-size=90', '-o', f"tests/out/hb-{r['name']}.png", '--margin=20'], check=False)
    summary.append(s)
print(json.dumps(summary, ensure_ascii=False, indent=1)); json.dump(summary, open('tests/out/check_real.json', 'w'), ensure_ascii=False, indent=1)
# --- assertions de régression
fail = []
for s in summary:
    if 'error' in s: fail.append(f"{s['name']}: OTF illisible {s['error']}"); continue
    if s['giant']: fail.append(f"{s['name']}: glyphes géants {s['giant']}")
    if 'iou_mean' in s:
        if s['traced'] < 60: fail.append(f"{s['name']}: seulement {s['traced']} glyphes tracés")
        if s['iou_min'] < 0.55 or s['iou_mean'] < 0.78: fail.append(f"{s['name']}: IoU {s['iou_mean']} / {s['iou_min']} (mauvaise attribution ?)")
        if s['baseline_bad']: fail.append(f"{s['name']}: lignes de base décalées {s['baseline_bad']}")
        p = s.get('preview') or {}
        if p.get('clusters') != 6 or p.get('inkHeight', 999) > 130: fail.append(f"{s['name']}: aperçu « abcdef » anormal {p}")
exp = {r['name']: r['expect'] for r in res}
for r in res:
    if r.get('fail'): fail.append(f"{r['name']}: {r['fail']}")
    if r['errors']: fail.append(f"{r['name']}: erreurs console {r['errors']}")
    if r['expect'] in ('latin', 'arabic') and f"({r['expect']})" not in (r.get('status') or ''): fail.append(f"{r['name']}: planche non détectée — {r.get('status')}")
print('\n'.join(fail) if fail else 'RÉGRESSIONS RÉALISTES : OK'); sys.exit(1 if fail else 0)
