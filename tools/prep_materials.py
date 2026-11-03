#!/usr/bin/env python3
"""Fetch CC0 ambientCG 1K-JPG sets and pack them for the game.
 assets/materials/<kind>_c.jpg   albedo (sRGB)
 assets/materials/<kind>_n.jpg   normal (GL, tangent space)
 assets/materials/<kind>_o.jpg   packed ORM: R=AO G=roughness B=metalness  (three.js reads G/B for rough/metal, R for aoMap)
 assets/materials/detail_<k>.png RGBA 512: R,G=normal xy  B=roughness  A=height   (world-space triplanar detail for UV-less batches)
Usage: python3 tools/prep_materials.py   (needs Pillow + curl + unzip)"""
import os, subprocess, sys, json
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'materials'); CACHE = os.path.expanduser('~/.hermes/cache/scratch/acg')
KINDS = {  # game kind -> ambientCG id
  'siding': 'Metal041A', 'brick': 'Bricks105', 'concrete': 'Concrete034', 'metal': 'Metal055A', 'roof': 'CorrugatedSteel009',
  'floor': 'WoodFloor043', 'asphalt': 'Asphalt031', 'pavers': 'Bricks113A', 'hull': 'Metal046B', 'rust': 'MetalPlates013',
  'tile': 'Tiles141', 'plaster': 'PaintedPlaster017'}
DETAIL = {'matte': 'Concrete034', 'metal': 'Metal046B', 'ground': 'Ground111', 'rock': 'Rock058'}
def fetch(i):
    d = f'{CACHE}/{i}'
    if not (os.path.isdir(d) and os.listdir(d)):
        os.makedirs(CACHE, exist_ok=True); z = f'{CACHE}/{i}.zip'
        subprocess.run(['curl', '-sL', '-m', '120', '-o', z, f'https://ambientcg.com/get?file={i}_1K-JPG.zip'], check=True)
        os.makedirs(d, exist_ok=True); subprocess.run(['unzip', '-qo', z, '-d', d], check=True); os.remove(z)
    return d
def ld(i, suffix, mode):
    p = f'{fetch(i)}/{i}_1K-JPG_{suffix}.jpg'
    return Image.open(p).convert(mode) if os.path.exists(p) else None
os.makedirs(OUT, exist_ok=True); credits = []
for kind, i in KINDS.items():
    c = ld(i, 'Color', 'RGB'); n = ld(i, 'NormalGL', 'RGB'); r = ld(i, 'Roughness', 'L'); ao = ld(i, 'AmbientOcclusion', 'L'); mt = ld(i, 'Metalness', 'L')
    s = c.size; black = Image.new('L', s, 0); white = Image.new('L', s, 255)
    orm = Image.merge('RGB', ((ao or white).resize(s), (r or Image.new('L', s, 200)).resize(s), (mt or black).resize(s)))
    c.save(f'{OUT}/{kind}_c.jpg', quality=86, subsampling=0, optimize=True)
    n.resize(s).save(f'{OUT}/{kind}_n.jpg', quality=92, subsampling=0, optimize=True)
    orm.save(f'{OUT}/{kind}_o.jpg', quality=90, subsampling=0, optimize=True); credits.append(f'{kind}: ambientCG {i} (CC0)')
for k, i in DETAIL.items():
    n = ld(i, 'NormalGL', 'RGB').resize((512, 512), Image.LANCZOS); r = ld(i, 'Roughness', 'L').resize((512, 512), Image.LANCZOS); h = ld(i, 'Displacement', 'L').resize((512, 512), Image.LANCZOS)
    Image.merge('RGBA', (*n.split()[:2], r, h)).save(f'{OUT}/detail_{k}.png', optimize=True); credits.append(f'detail_{k}: ambientCG {i} (CC0)')
open(f'{OUT}/CREDITS.txt', 'w').write('All textures CC0 1.0 from ambientCG.com (https://ambientcg.com/)\n' + '\n'.join(credits) + '\n')
print('done'); 
