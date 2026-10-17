"""IoU entre glyphes rastérisés de la police de référence et de la police exportée."""
import sys, string
from PIL import Image, ImageDraw, ImageFont
import numpy as np
def raster(font_path, ch, size=300):
    f = ImageFont.truetype(font_path, size)
    im = Image.new('L', (size * 2, size * 2), 0); ImageDraw.Draw(im).text((size // 2, size // 2), ch, font=f, fill=255)
    a = np.array(im) > 127
    ys, xs = np.where(a)
    if not len(xs): return None
    c = Image.fromarray((a[ys.min():ys.max() + 1, xs.min():xs.max() + 1] * 255).astype('uint8'))
    return np.array(c.resize((96, 96), Image.BILINEAR)) > 127
def iou_all(ref, test, chars):
    res = {}
    for ch in chars:
        a, b = raster(ref, ch), raster(test, ch)
        if a is None or b is None: res[ch] = 0.0; continue
        res[ch] = float((a & b).sum() / max(1, (a | b).sum()))
    return res
if __name__ == '__main__':
    r = iou_all(sys.argv[1], sys.argv[2], string.ascii_letters + string.digits)
    v = list(r.values()); print('min %.3f mean %.3f' % (min(v), sum(v) / len(v)), sorted(r.items(), key=lambda x: x[1])[:5])
