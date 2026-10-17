"""Fabrique des entrées « réalistes » : photo de téléphone simulée (perspective, flou,
éclairage inégal, bruit, JPEG), alphabet à espacement irrégulier, police avec empattements.
Les polices OFL du système ne servent que d'entrée de test."""
import random, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
random.seed(4); np.random.seed(4)
FONTS = '/usr/share/fonts/truetype/sand-box/google/'

def phone_photo(sheet, out, W=4032, H=3024, q=62, angle_jitter=1.0):
    """Pose la feuille sur une table, perspective, flou, ombre, bruit, JPEG."""
    s = sheet.convert('RGB')
    canvas = Image.new('RGB', (W, H), (92, 74, 60))  # table
    # feuille placée en portrait dans un cadre paysage ? On garde le portrait : 3024x4032
    if sheet.height > sheet.width: W, H = H, W; canvas = Image.new('RGB', (W, H), (92, 74, 60))
    sw, sh = int(W * 0.84), int(W * 0.84 * sheet.height / sheet.width)
    if sh > H * 0.92: sh = int(H * 0.92); sw = int(sh * sheet.width / sheet.height)
    s = s.resize((sw, sh), Image.LANCZOS)
    ox, oy = (W - sw) // 2, (H - sh) // 2
    # quadrilatère de destination (perspective)
    j = lambda: random.uniform(-0.04, 0.04) * sw
    dst = [(ox + j(), oy + j()), (ox + sw + j(), oy + j() * 0.5), (ox + sw - abs(j()), oy + sh + j()), (ox + abs(j()), oy + sh + j())]
    coeffs = find_coeffs(dst, [(0, 0), (sw, 0), (sw, sh), (0, sh)])
    warped = s.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(0, 0, 0))
    mask = Image.new('L', (sw, sh), 255).transform((W, H), Image.PERSPECTIVE, coeffs, Image.BILINEAR, fillcolor=0)
    canvas.paste(warped, (0, 0), mask)
    a = np.asarray(canvas.filter(ImageFilter.GaussianBlur(2.2))).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    light = 0.62 + 0.38 * (xx / W) * 0.6 + 0.3 * (1 - yy / H)  # dégradé + ombre
    light *= 1 - 0.25 * np.exp(-(((xx - W * 0.3) / (W * 0.25)) ** 2 + ((yy - H * 0.7) / (H * 0.2)) ** 2))  # ombre de main
    a = a * light[..., None] * np.array([1.0, 0.97, 0.9])  # lumière chaude
    a += np.random.normal(0, 9, a.shape)
    Image.fromarray(np.clip(a, 0, 255).astype('uint8')).save(out, quality=q)

def find_coeffs(pa, pb):
    A = []
    for p1, p2 in zip(pa, pb):
        A.append([p1[0], p1[1], 1, 0, 0, 0, -p2[0] * p1[0], -p2[0] * p1[1]])
        A.append([0, 0, 0, p1[0], p1[1], 1, -p2[1] * p1[0], -p2[1] * p1[1]])
    return np.linalg.solve(np.array(A, float), np.array(pb, float).reshape(8)).tolist()

def alphabet_photo(font_path, out, size=120, uneven=True, photo=True, lines=None, W=2600, tilt=0, stray=False, spacing=1.6):
    f = ImageFont.truetype(font_path, size)
    lines = lines or ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', '0123456789']
    img = Image.new('L', (W, int(size * spacing * len(lines) + 260)), 255); d = ImageDraw.Draw(img)
    for i, l in enumerate(lines):
        x = 80
        for ch in l:
            dy = random.randint(-8, 8) if uneven else 0
            d.text((x, 80 + i * size * spacing + dy), ch, font=f, fill=0)
            x += d.textlength(ch, font=f) + (random.randint(int(size * 0.12), int(size * 0.55)) if uneven else size * 0.3)
    if stray:  # taches de stylo réalistes : un point avant la 1re lettre, une rature en marge
        d.ellipse((30, 120, 44, 134), fill=0); d.line((W - 160, 60, W - 90, 75), fill=0, width=5)
    if tilt: img = img.rotate(tilt, resample=Image.BICUBIC, fillcolor=255, expand=False)
    if photo:
        a = np.asarray(img.filter(ImageFilter.GaussianBlur(1.3))).astype(np.float32)
        H, Wd = a.shape; yy, xx = np.mgrid[0:H, 0:Wd]
        a = a * (0.55 + 0.45 * xx / Wd) + np.random.normal(0, 10, a.shape)
        Image.fromarray(np.clip(a, 0, 255).astype('uint8')).convert('RGB').save(out, quality=65)
    else: img.save(out)

if __name__ == '__main__':
    d = 'tests/fixtures/real/'
    import os; os.makedirs(d, exist_ok=True)
    phone_photo(Image.open('tests/out/sheet-latin-hand.png'), d + 'photo-planche-latine.jpg')
    phone_photo(Image.open('tests/out/sheet-arabic-naskh.png'), d + 'photo-planche-arabe.jpg', W=3000, H=2250)
    alphabet_photo(FONTS + 'Caveat/Caveat-VariableFont_wght.ttf', d + 'photo-alphabet-caveat.jpg', size=150)
    alphabet_photo('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', d + 'serif-gras.png', size=140, uneven=False, photo=False, W=2600)
    AV = FONTS + 'Averia Serif Libre/AveriaSerifLibre-Regular.ttf'
    FULL = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', '0123456789', 'éèêàçùôîëïûœæ', '.,;:!?\'"-()']
    alphabet_photo(AV, d + 'photo-alphabet-accents.jpg', size=110, lines=FULL, tilt=2.5, stray=True)
    alphabet_photo(AV, d + 'photo-alphabet-serre.jpg', size=110, lines=['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789'], tilt=-3, spacing=1.25, W=3400)
    QS = FONTS + 'Quicksand/' + [f for f in os.listdir(FONTS + 'Quicksand') if f.endswith('.ttf')][0]
    alphabet_photo(QS, d + 'quicksand-alphabet.jpg', size=120)
    alphabet_photo(QS, d + 'quicksand-sans-Rr.jpg', size=120, lines=['ABCDEFGHIJKLMNOPQ', 'STUVWXYZ', 'abcdefghijklmnopq', 'stuvwxyz', '0123456789'])
    # encre claire sur fond sombre (craie / négatif)
    im = Image.open(d + 'serif-gras.png').convert('L'); Image.eval(im, lambda v: 255 - v).save(d + 'negatif-serif.png')
    print('ok')
