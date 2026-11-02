// Procedural material textures (neutral greys, tinted by material colour) and UV helpers
import * as THREE from '../vendor/three.module.js';
import { rng } from './util.js';

const cache = {};
function mk(key, w, h, draw, srgb = true) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return cache[key] = t;
}
const grey = v => `rgb(${v | 0},${v | 0},${v | 0})`;
function speckle(x, w, h, n, a0, a1, seed, light = false) { const r = rng(seed); for (let i = 0; i < n; i++) { x.fillStyle = light ? `rgba(255,255,255,${r.range(a0, a1)})` : `rgba(0,0,0,${r.range(a0, a1)})`; x.fillRect(r() * w, r() * h, r.range(1, 3), r.range(1, 3)); } }

export const tex = {
  siding: () => mk('siding', 256, 256, (x, w, h) => {
    const r = rng(11); x.fillStyle = grey(222); x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      x.fillStyle = grey(222 + r.range(-12, 8)); x.fillRect(0, y, w, 30); x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(0, y + 30, w, 2); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(0, y, w, 1.5);
      for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(0,0,0,${r.range(.03, .09)})`; x.fillRect(r() * w, y + r.range(2, 28), r.range(20, 110), 1); }
    }
    speckle(x, w, h, 500, .02, .06, 3);
  }),
  brick: () => mk('brick', 256, 256, (x, w, h) => {
    const r = rng(5); x.fillStyle = grey(170); x.fillRect(0, 0, w, h);
    for (let row = 0; row < 16; row++) for (let i = -1; i < 6; i++) { const ox = row % 2 ? 21 : 0; const v = 205 + r.range(-28, 18); x.fillStyle = grey(v); x.fillRect(i * 43 + ox + 2, row * 16 + 2, 39, 12); }
    speckle(x, w, h, 900, .03, .1, 6);
  }),
  concrete: () => mk('concrete', 256, 256, (x, w, h) => {
    const r = rng(8); x.fillStyle = grey(200); x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { x.fillStyle = grey(200 + r.range(-26, 26)) ; x.globalAlpha = .25; x.beginPath(); x.arc(r() * w, r() * h, r.range(8, 40), 0, 7); x.fill(); } x.globalAlpha = 1;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, 0, w, 2); x.fillRect(0, 0, 2, h); x.fillRect(0, h / 2, w, 1); x.fillRect(w / 2, 0, 1, h);
    speckle(x, w, h, 1500, .03, .12, 9); for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(0,0,0,.18)'; x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 8; k++) { px += r.range(-14, 14); py += r.range(4, 14); x.lineTo(px, py); } x.stroke(); }
  }),
  metal: () => mk('metal', 256, 256, (x, w, h) => {
    for (let i = 0; i < w; i += 16) { const g = x.createLinearGradient(i, 0, i + 16, 0); g.addColorStop(0, grey(150)); g.addColorStop(.5, grey(236)); g.addColorStop(1, grey(150)); x.fillStyle = g; x.fillRect(i, 0, 16, h); }
    const r = rng(2); for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(120,70,30,${r.range(.03, .12)})`; x.fillRect(r() * w, r() * h, r.range(2, 8), r.range(20, 80)); } speckle(x, w, h, 500, .03, .1, 4);
  }),
  roof: () => mk('roof', 256, 256, (x, w, h) => {
    x.fillStyle = grey(190); x.fillRect(0, 0, w, h); const r = rng(14);
    for (let i = 0; i < w; i += 32) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(i, 0, 2, h); x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(i + 2, 0, 1, h); x.fillStyle = grey(190 + r.range(-14, 10)); x.globalAlpha = .4; x.fillRect(i + 3, 0, 28, h); x.globalAlpha = 1; }
    speckle(x, w, h, 900, .03, .12, 15);
  }),
  floor: () => mk('floor', 256, 256, (x, w, h) => {
    const r = rng(20); for (let i = 0; i < 8; i++) { x.fillStyle = grey(190 + r.range(-26, 22)); x.fillRect(i * 32, 0, 31, h); x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(i * 32 + 31, 0, 1, h); const cuts = r.int(1, 3); for (let c = 0; c < cuts; c++) { x.fillRect(i * 32, r.range(0, h), 31, 1); } for (let g = 0; g < 12; g++) { x.fillStyle = `rgba(0,0,0,${r.range(.03, .08)})`; x.fillRect(i * 32 + r.range(2, 28), r.range(0, h), 1, r.range(30, 120)); } }
  }),
  asphalt: () => mk('asphalt', 256, 256, (x, w, h) => { x.fillStyle = grey(70); x.fillRect(0, 0, w, h); speckle(x, w, h, 2500, .05, .25, 21); speckle(x, w, h, 1200, .04, .18, 22, true); }),
  pavers: () => mk('pavers', 256, 256, (x, w, h) => {
    const r = rng(33); x.fillStyle = grey(110); x.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) for (let i = -1; i < 6; i++) { x.fillStyle = grey(176 + r.range(-24, 18)); x.fillRect(i * 48 + (row % 2 ? 24 : 0) + 2, row * 32 + 2, 44, 28); }
    speckle(x, w, h, 1500, .04, .14, 34);
  }),
  detail: () => mk('detail', 512, 512, (x, w, h) => {   // tileable cloudy noise for terrain
    const img = x.createImageData(w, h); const P = [4, 8, 16, 32, 64]; const lat = P.map((p, i) => { const r = rng(40 + i); return Array.from({ length: p * p }, () => r()); });
    const sm = t => t * t * (3 - 2 * t);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      let v = 0, a = .5; for (let o = 0; o < P.length; o++) { const p = P[o], fx = xx / w * p, fy = yy / h * p, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy), L = lat[o]; const g = (i, j) => L[((j % p) * p) + (i % p)]; v += a * ((g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty); a *= .55; }
      const c = Math.max(0, Math.min(255, 90 + v * 150)); const k = (yy * w + xx) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = c; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, false),
  window: (lit) => mk('window' + lit, 128, 160, (x, w, h) => {
    x.fillStyle = '#20252b'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, w, h); if (lit) { g.addColorStop(0, '#ffe7a8'); g.addColorStop(1, '#ffc66a'); } else { g.addColorStop(0, '#5a7a96'); g.addColorStop(.5, '#1c2b3a'); g.addColorStop(1, '#3c566e'); }
    x.fillStyle = g; x.fillRect(8, 8, w - 16, h - 16); x.fillStyle = '#20252b'; x.fillRect(w / 2 - 2, 8, 4, h - 16); x.fillRect(8, h / 2 - 2, w - 16, 4);
    if (lit) { x.fillStyle = 'rgba(120,60,30,.25)'; x.fillRect(8, 8, 22, h - 16); x.fillRect(w - 30, 8, 22, h - 16); } else { x.fillStyle = 'rgba(255,255,255,.14)'; x.beginPath(); x.moveTo(8, 8); x.lineTo(60, 8); x.lineTo(8, 70); x.fill(); }
  }),
};

// scale a box/plane geometry's UVs to physical size so textures tile at 'tile' metres per repeat
export function boxUV(geo, w, h, d, tile = 2) {
  const uv = geo.attributes.uv; const n = uv.count / 6;   // BoxGeometry: 6 faces
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x,-x,+y,-y,+z,-z
  for (let f = 0; f < 6; f++) for (let i = 0; i < n; i++) { const k = f * n + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  uv.needsUpdate = true; return geo;
}
const matCache = {};
export function surfMat(kind, color, extra = {}) {
  const key = kind + color + JSON.stringify(extra); if (matCache[key]) return matCache[key];
  const rough = { siding: .85, brick: .9, concrete: .95, metal: .45, roof: .6, floor: .7, asphalt: .95, pavers: .9 }[kind] ?? .8;
  return matCache[key] = new THREE.MeshStandardMaterial({ map: tex[kind](), color, roughness: rough, metalness: kind === 'metal' ? .55 : .02, ...extra });
}
