"""Rend l'alphabet d'une police libre (DejaVu Sans, OFL/Bitstream Vera) en image : entrée de test uniquement."""
import sys
from PIL import Image, ImageDraw, ImageFont
font_path = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
out = sys.argv[2] if len(sys.argv) > 2 else 'tests/fixtures/alphabet.png'
f = ImageFont.truetype(font_path, 110)
lines = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', '0123456789']
img = Image.new('L', (1700, 900), 255); d = ImageDraw.Draw(img)
for i, l in enumerate(lines):
    d.text((60, 40 + i * 165), '  '.join(l) if False else l.replace('', ' ').strip(), font=f, fill=0)
img.save(out)
img.save(out.replace('.png', '.pgm'))
print(out)
