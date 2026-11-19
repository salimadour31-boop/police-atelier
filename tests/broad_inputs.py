"""Entrées variées « captures d'écran » pour la régression d'attribution (>90 % attendu)."""
import os, glob, json, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter
G = '/usr/share/fonts/truetype/sand-box/google/'
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from font_paths import google
def ttf(name, key, pref='Regular'):
    fs = sorted(glob.glob(G + name + '/*.ttf')); r = [f for f in fs if pref in os.path.basename(f) and 'Italic' not in f]
    if fs: return (r or [f for f in fs if 'Italic' not in f] or fs)[0]
    return GOOGLE[key]
GOOGLE = {'quicksand': google('quicksand', 'Quicksand[wght].ttf'), 'comfortaa': google('comfortaa', 'Comfortaa[wght].ttf'), 'poppins': google('poppins', 'Poppins-Regular.ttf'), 'montserrat': google('montserrat', 'Montserrat[wght].ttf'),
         'nunito': google('nunito', 'Nunito[wght].ttf'), 'lora': google('lora', 'Lora[wght].ttf'), 'merriweather': google('merriweather', 'Merriweather[opsz,wdth,wght].ttf'), 'roboto-slab': google('robotoslab', 'RobotoSlab[wght].ttf'), 'playfair': google('playfairdisplay', 'PlayfairDisplay[wght].ttf')}
FONTS = {'quicksand': ttf('Quicksand', 'quicksand'), 'comfortaa': ttf('Comfortaa', 'comfortaa'), 'poppins': ttf('Poppins', 'poppins'), 'montserrat': ttf('Montserrat', 'montserrat'),
         'nunito': ttf('Nunito', 'nunito'), 'lora': ttf('Lora', 'lora'), 'merriweather': ttf('Merriweather', 'merriweather'), 'roboto-slab': ttf('Roboto Slab', 'roboto-slab'), 'playfair': ttf('Playfair Display', 'playfair')}
U, L, D = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789'
LAYOUTS = {'3lignes': [U, L, D], '1ligne-espaces': [U + ' ' + L + ' ' + D], 'espacees': [' '.join(U), ' '.join(L), ' '.join(D)], '2lignes': [U + L[:6], L[6:] + ' ' + D]}
STYLES = {'blanc': ((255, 255, 255), (0, 0, 0)), 'sombre': ((24, 26, 32), (240, 240, 240)), 'couleur': ((250, 214, 120), (40, 30, 120)), 'bleu-blanc': ((30, 80, 200), (255, 255, 255))}
def render(font, lines, bg, fg, size=72, path=None, photo=False):
    f = ImageFont.truetype(font, size); pad = size
    w = max(int(f.getlength(l)) for l in lines) + 2 * pad; h = int(len(lines) * size * 1.6) + 2 * pad
    im = Image.new('RGB', (w, h), bg); d = ImageDraw.Draw(im)
    for i, l in enumerate(lines): d.text((pad, pad + i * size * 1.6), l, font=f, fill=fg)
    if photo: im = im.rotate(1.5, expand=True, fillcolor=bg).filter(ImageFilter.GaussianBlur(1.2))
    im.save(path, quality=85)
cases = []
for fn in FONTS:
    for lay in (LAYOUTS if fn in ('quicksand', 'poppins') else ['3lignes', '1ligne-espaces']):
        for st in (STYLES if fn in ('quicksand', 'comfortaa') else ['blanc', 'sombre']):
            name = f'{fn}-{lay}-{st}'; p = f'tests/fixtures/broad/{name}.png'
            render(FONTS[fn], LAYOUTS[lay], *STYLES[st], path=p); cases.append({'name': name, 'file': p})
for fn in ['quicksand', 'lora']:
    p = f'tests/fixtures/broad/{fn}-photo.jpg'; render(FONTS[fn], LAYOUTS['3lignes'], (235, 232, 225), (20, 20, 20), size=90, path=p, photo=True); cases.append({'name': fn + '-photo', 'file': p})
json.dump(cases, open('tests/fixtures/broad/cases.json', 'w'), indent=1)
print(len(cases), 'cas')
