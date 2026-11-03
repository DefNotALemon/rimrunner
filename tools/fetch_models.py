#!/usr/bin/env python3
"""Fetch the CC0 glTF models the game uses (see docs/LICENSES.md). Re-runnable; skips files that exist."""
import json, os, urllib.request
ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'models')
UA = {'User-Agent': 'rimrunner-fetch'}
PH = ['moon_rock_01', 'moon_rock_03', 'moon_rock_05', 'stone_01', 'can_rusted', 'ammo_box', 'long_life_food', 'small_oil_can_01']
def get(url, dst):
    if os.path.exists(dst) and os.path.getsize(dst) > 0: return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r, open(dst, 'wb') as f: f.write(r.read())
    print('ok', os.path.relpath(dst, ROOT))
for a in PH:   # Poly Haven, CC0, 1k textures
    g = json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + a, headers=UA)))['gltf']['1k']['gltf']
    get(g['url'], os.path.join(ROOT, 'polyhaven', a, a + '.gltf'))
    for rel, v in g['include'].items(): get(v['url'], os.path.join(ROOT, 'polyhaven', a, rel))
# Quaternius "Ultimate Guns Pack" (CC0) via poly.pizza CDN; ids picked from the bundle page
ids = json.load(open(os.path.join(ROOT, 'quaternius', '_poly_pizza_ids.json')))
for name, u in ids.items(): get('https://static.poly.pizza/%s.glb' % u, os.path.join(ROOT, 'quaternius', name + '.glb'))
