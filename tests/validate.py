"""Validation des polices exportées : fontTools, OTS, couverture cmap, GSUB, IoU."""
import json, string, sys, subprocess
from fontTools.ttLib import TTFont
sys.path.insert(0, 'tests')
from iou import iou_all
REF = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def hb_shape(path, text):
    """Mise en forme HarfBuzz (si uharfbuzz est installé) : noms des glyphes obtenus."""
    import uharfbuzz as hb
    blob = hb.Blob.from_file_path(path); face = hb.Face(blob); font = hb.Font(face)
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(font, buf, {})
    order = TTFont(path).getGlyphOrder()
    return [order[i.codepoint] for i in buf.glyph_infos]

def check(path, iou_chars=None, arabic=False):
    f = TTFont(path)
    cmap = f.getBestCmap()
    r = {'file': path, 'tables': sorted(t.strip() for t in f.keys() if t != 'GlyphOrder'), 'glyphs': len(f.getGlyphOrder()),
         'AZ': all(ord(c) in cmap for c in string.ascii_uppercase), 'az': all(ord(c) in cmap for c in string.ascii_lowercase),
         'digits': all(ord(c) in cmap for c in string.digits), 'family': f['name'].getDebugName(1), 'style': f['name'].getDebugName(2)}
    for t in ('name', 'OS/2', 'hhea', 'post', 'cmap', 'CFF '): assert t in f, t
    assert r['AZ'] and r['az'] and r['digits'], 'cmap incomplet'
    try:
        import ots
        r['ots'] = ots.sanitize(path, '/tmp/ots_out.otf', capture_output=True).returncode == 0
    except Exception as e: r['ots'] = 'n/a: %s' % e
    if arabic:
        base = [0x627, 0x628, 0x62A, 0x633, 0x644, 0x645, 0x647, 0x648, 0x64A, 0x621, 0x629, 0x649]
        r['arabic_base'] = all(c in cmap for c in base)
        r['arabic_pres_forms'] = sum(1 for c in range(0xFE80, 0xFEFD) if c in cmap)
        r['arabic_digits'] = all(c in cmap for c in range(0x660, 0x66A))
        feats = sorted({fr.FeatureTag for fr in f['GSUB'].table.FeatureList.FeatureRecord}) if 'GSUB' in f else []
        r['gsub_features'] = feats
        assert {'init', 'medi', 'fina', 'rlig'} <= set(feats), feats
        try:
            r['harfbuzz'] = {w: hb_shape(path, w) for w in ('سلام', 'محمد')}
            assert r['harfbuzz']['سلام'] == ['uni0645', 'lam_alef.fina', 'uni0633.init'], r['harfbuzz']
        except ImportError: r['harfbuzz'] = 'uharfbuzz absent'
    if iou_chars:
        res = iou_all(REF, path, iou_chars); v = list(res.values())
        r['iou_min'] = round(min(v), 3); r['iou_mean'] = round(sum(v) / len(v), 3)
        r['iou_worst'] = [(k, round(x, 3)) for k, x in sorted(res.items(), key=lambda x: x[1])[:5]]
    return r
if __name__ == '__main__':
    out = []
    for arg in sys.argv[1:]:
        path, *flags = arg.split(':')
        out.append(check(path, string.ascii_letters + string.digits if 'iou' in flags else None, 'arabic' in flags))
    print(json.dumps(out, ensure_ascii=False, indent=1))

