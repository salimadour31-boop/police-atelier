"""Contrôle des polices issues des entrées réalistes."""
import json, string, subprocess, sys
sys.path.insert(0, 'tests')
from iou import raster
from fontTools.ttLib import TTFont
G = '/usr/share/fonts/truetype/sand-box/google/'
REF = {'Handlee': G + 'Handlee/Handlee-Regular.ttf', 'Caveat': G + 'Caveat/Caveat-VariableFont_wght.ttf',
       'DejaVuSerifBold': '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 'NotoNaskh': G + 'Noto Naskh Arabic/NotoNaskhArabic-VariableFont_wght.ttf', 'Averia': G + 'Averia Serif Libre/AveriaSerifLibre-Regular.ttf', 'Quicksand': G + 'Quicksand/' + [f for f in __import__('os').listdir(G + 'Quicksand') if f.endswith('.ttf')][0]}
def iou(a, b): return float((a & b).sum() / max(1, (a | b).sum()))
res = json.load(open('tests/out/realistic.json')); summary = []
few = [r for r in res if r['expect'] == 'few']; res = [r for r in res if r['expect'] != 'few']
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
        chars = (r.get('alphabet') or string.ascii_letters + string.digits); scores = {}
        traced = set(k for k in (r.get('items') or []) if k)
        for ch in chars:
            if ch not in traced: continue
            a, b = raster(REF[r['ref']], ch), raster(path, ch)
            scores[ch] = round(iou(a, b), 2) if a is not None and b is not None else 0
        v = list(scores.values()) or [0]
        s.update(traced=len(scores), iou_mean=round(sum(v) / len(v), 3), iou_min=min(v), bad=sorted([k for k, x in scores.items() if x < 0.6]), worst=sorted(scores.items(), key=lambda x: x[1])[:6])
        # largeur des approches : rapport encre / avance pour quelques lettres
        txt = "Voix ambiguë d'un cœur qui au zéphyr préfère les jattes de kiwis. 0123"
        # lignes de base et hauteurs : lettres posées à y≈0, capitales plates cohérentes
        def bnds(ch):
            bp = BoundsPen(gs); gs[cmap[ord(ch)]].draw(bp); return bp.bounds
        off = {ch: round(bnds(ch)[1]) for ch in 'abcdefhiklmnrtuvwxzABDEFHKLMNRTZ' if ch in traced}
        s['baseline_off_max'] = max([abs(v) for v in off.values()] or [0]); s['baseline_bad'] = [k for k, v in off.items() if abs(v) > 45]
        caps = [bnds(ch)[3] for ch in 'BDEFHIKLMNPRTUVWXYZ' if ch in traced]
        if caps:
            m = sorted(caps)[len(caps) // 2]; s['cap_spread'] = round((max(caps) - min(caps)) / m, 3)
        s['preview'] = r.get('preview')
        for ch in (r.get('derivedCheck') or []):
            a, b = raster(REF[r['ref']], ch), raster(path, ch)
            s.setdefault('derived', {})[ch] = [round(iou(a, b), 2), (r.get('sources') or {}).get(ch)]
    else:
        txt = 'سلام محمد ٠١٢٣'
    subprocess.run(['hb-view', path, txt, '--font-size=90', '-o', f"tests/out/hb-{r['name']}.png", '--margin=20'], check=False)
    summary.append(s)
print(json.dumps(summary, ensure_ascii=False, indent=1)); json.dump(summary, open('tests/out/check_real.json', 'w'), ensure_ascii=False, indent=1)
# --- assertions de régression
fail = []
r_by = {r['name']: r for r in res}
for s in summary:
    s['suspects'] = r_by[s['name']].get('suspects'); s['missing'] = r_by[s['name']].get('missing')
    if 'error' in s: fail.append(f"{s['name']}: OTF illisible {s['error']}"); continue
    if s['giant']: fail.append(f"{s['name']}: glyphes géants {s['giant']}")
    if 'iou_mean' in s:
        if s['traced'] < 60 and not r_by[s['name']].get('mismatch'): fail.append(f"{s['name']}: seulement {s['traced']} glyphes tracés")
        thin = s['name'].startswith('quicksand')  # traits fins : l'IoU pénalise fortement 1-2 px d'écart
        if s['iou_min'] < (0.45 if thin else 0.55) or s['iou_mean'] < (0.72 if thin else 0.78): fail.append(f"{s['name']}: IoU {s['iou_mean']} / {s['iou_min']} (mauvaise attribution ?)")
        if s['baseline_bad']: fail.append(f"{s['name']}: lignes de base décalées {s['baseline_bad']}")
        p = s.get('preview') or {}
        if p.get('clusters') != 6 or p.get('inkHeight', 999) > 130: fail.append(f"{s['name']}: aperçu « abcdef » anormal {p}")
for r in res:
    if r.get('mismatch') and not any('countMismatch' in a or 'attendus' in a for a in (r.get('alerts') or [])): fail.append(f"{r['name']}: écart de nombre non signalé {r.get('alerts')}")
for r in res:
    if r.get('fail'): fail.append(f"{r['name']}: {r['fail']}")
    if r['errors']: fail.append(f"{r['name']}: erreurs console {r['errors']}")
    if r['expect'] in ('latin', 'arabic') and f"({r['expect']})" not in (r.get('status') or ''): fail.append(f"{r['name']}: planche non détectée — {r.get('status')}")
for s in summary:
    for ch, (v, src) in (s.get('derived') or {}).items():
        if not (src or '').startswith('derived') or v < 0.4: fail.append(f"{s['name']}: {ch} mal dérivé ({src}, IoU {v})")
for r in few:  # image d'une seule lettre : rien d'attribué automatiquement, message clair
    if r.get('unassigned') != 1 or not any('fewShapes' in a or 'Seulement' in a for a in r.get('alerts') or []) or any('error' in a and 'banner' not in a for a in r.get('alerts') or []) or not any('banner' in a for a in r.get('alerts') or []): fail.append(f"{r['name']}: {r.get('unassigned')} {r.get('alerts')}")
print('\n'.join(fail) if fail else 'RÉGRESSIONS RÉALISTES : OK'); sys.exit(1 if fail else 0)
