// Matlib: the shared material kit for walls, ships, interiors. One palette, one texel density, one update loop.
// API (all cached; call as often as you like): see docs/MATERIALS.md
//   panelMat(style, color)   painted/bare/organic surfaces with normal+rough+metal+AO.  styles: STYLES
//   uvMeters(geo, matrix?)   rewrite any geometry's UVs to world metres (box projection) so neighbours line up
//   emissiveMat(color, mode) glowing LED / strip / lamp.  modes: led strip pulse blink warn flicker
//   screenTexture(kind, v) / screenMat(kind, v)  animated canvas screens sharing one 6 Hz loop.  kinds: SCREENS
//   decalTextures() / decalMat(name, o) / decalMesh(name, w, h, o) / decalNumber(text, o)  alpha overlays
//   pipeMat(kind, color) + pipeGeo(r, len)   wireMat(color) + cableGeo(a, b, o)   glassMat(tint)   PAL colours
import * as THREE from '../vendor/three.module.js';
import { rng } from './util.js';
import { Look } from './look.js';

export const TD = 256;   // texels per metre for every 1 m texture (2 m textures use 512): equal density everywhere

// ---------- palette: one family so any two segments sit together ----------
export const PAL = {
  hull: 0x9aa5b1, hullDark: 0x5d6873, trim: 0x39424d, ink: 0x1d2228, white: 0xd8dde1, cream: 0xcfc8b8,
  accent: 0xd9822b, safety: 0xe2b422, teal: 0x2f8f8a, blue: 0x3b6ea5, green: 0x4f9a5f, red: 0xb5382d,
  rust: 0x8a5535, copper: 0xb8734a, brass: 0xc9a24a, carpet: 0x7b8aa3, wood: 0x9a7650, concrete: 0xa7a8a6, tile: 0xdadcd8, rubber: 0x4a4d52,
  led: { green: 0x4dff7a, cyan: 0x45e0ff, amber: 0xffb02e, red: 0xff3b30, white: 0xfff1d0, blue: 0x4a7dff, magenta: 0xff4fd8 },
};

// ---------- procedural PBR layers ----------
const g8 = v => { v = Math.max(0, Math.min(255, v | 0)); return `rgb(${v},${v},${v})`; };
class Layers {   // paint once, get colour + height + roughness + metal together. values: css colour for C, 0..255 for H/R/M, null = untouched
  constructor(S) { this.S = S; this.cv = [0, 1, 2, 3].map(() => { const c = document.createElement('canvas'); c.width = c.height = S; return c; }); this.cx = this.cv.map(c => c.getContext('2d', { willReadFrequently: true })); }
  paint(fn, vals, a = 1) { for (let i = 0; i < 4; i++) { if (vals[i] == null) continue; const x = this.cx[i]; x.globalAlpha = a; const s = i === 0 ? vals[0] : g8(vals[i]); x.fillStyle = s; x.strokeStyle = s; fn(x); } for (const x of this.cx) x.globalAlpha = 1; }
  rect(x, y, w, h, c, hv, rv, mv, a) { this.paint(cx => cx.fillRect(x, y, w, h), [c, hv, rv, mv], a); }
  circle(x, y, r, c, hv, rv, mv, a) { this.paint(cx => { cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill(); }, [c, hv, rv, mv], a); }
  line(x1, y1, x2, y2, lw, c, hv, rv, mv, a) { this.paint(cx => { cx.lineWidth = lw; cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke(); }, [c, hv, rv, mv], a); }
  pixels(fn) {   // fn(x, y) -> [r,g,b, h, rough, metal] per pixel
    const S = this.S, im = [0, 1, 2, 3].map(i => this.cx[i].createImageData(S, S)), d = im.map(i => i.data);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = fn(x, y), k = (y * S + x) * 4; d[0][k] = v[0]; d[0][k + 1] = v[1]; d[0][k + 2] = v[2]; d[0][k + 3] = 255; for (let j = 1; j < 4; j++) { const q = v[2 + j]; d[j][k] = d[j][k + 1] = d[j][k + 2] = q; d[j][k + 3] = 255; } }
    for (let i = 0; i < 4; i++) this.cx[i].putImageData(im[i], 0, 0);
  }
}
function fbm(S, seed, oct = 4, base = 4) {   // tileable value noise, 0..1
  const out = new Float32Array(S * S); let amp = 0.5, tot = 0; const r = rng(seed); const sm = t => t * t * (3 - 2 * t);
  for (let o = 0; o < oct; o++, amp *= 0.5) {
    const p = base << o, lat = Float32Array.from({ length: p * p }, () => r()); tot += amp;
    for (let y = 0; y < S; y++) { const fy = y / S * p, iy = Math.floor(fy), ty = sm(fy - iy); for (let x = 0; x < S; x++) { const fx = x / S * p, ix = Math.floor(fx), tx = sm(fx - ix);
      const a = lat[(iy % p) * p + ix % p], b = lat[(iy % p) * p + (ix + 1) % p], c = lat[((iy + 1) % p) * p + ix % p], d = lat[((iy + 1) % p) * p + (ix + 1) % p];
      out[y * S + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty); } }
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
function boxBlur(a, S, r) {   // wrapped separable box blur, O(n) running sums
  const t = new Float32Array(S * S), o = new Float32Array(S * S), n = 2 * r + 1;
  for (let y = 0; y < S; y++) { const row = y * S; let s = 0; for (let k = -r; k <= r; k++) s += a[row + (k + S) % S]; for (let x = 0; x < S; x++) { t[row + x] = s / n; s += a[row + (x + r + 1) % S] - a[row + (x - r + S) % S]; } }
  for (let x = 0; x < S; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[((k + S) % S) * S + x]; for (let y = 0; y < S; y++) { o[y * S + x] = s / n; s += t[((y + r + 1) % S) * S + x] - t[((y - r + S) % S) * S + x]; } }
  return o;
}
function bake(L, nStr, aoK) {   // layers -> { map, normal, orm } three textures
  const S = L.S, hd = L.cx[1].getImageData(0, 0, S, S).data, rd = L.cx[2].getImageData(0, 0, S, S).data, md = L.cx[3].getImageData(0, 0, S, S).data;
  const H = new Float32Array(S * S); for (let i = 0; i < S * S; i++) H[i] = hd[i * 4] / 255; const B = boxBlur(H, S, 4), Hs = boxBlur(H, S, 1);
  const nc = document.createElement('canvas'), oc = document.createElement('canvas'); nc.width = nc.height = oc.width = oc.height = S;
  const nx = nc.getContext('2d'), ox = oc.getContext('2d'), nI = nx.createImageData(S, S), oI = ox.createImageData(S, S), nd = nI.data, od = oI.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, dx = Hs[y * S + (x + 1) % S] - Hs[y * S + (x - 1 + S) % S], dy = Hs[((y + 1) % S) * S + x] - Hs[((y - 1 + S) % S) * S + x];
    let vx = -dx * nStr, vy = dy * nStr, vz = 1; const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
    nd[i * 4] = (vx * 0.5 + 0.5) * 255; nd[i * 4 + 1] = (vy * 0.5 + 0.5) * 255; nd[i * 4 + 2] = (vz * 0.5 + 0.5) * 255; nd[i * 4 + 3] = 255;
    od[i * 4] = Math.max(0, Math.min(1, 1 - Math.max(0, B[i] - H[i]) * aoK)) * 255; od[i * 4 + 1] = Math.max(16, rd[i * 4]); od[i * 4 + 2] = md[i * 4]; od[i * 4 + 3] = 255;
  }
  nx.putImageData(nI, 0, 0); ox.putImageData(oI, 0, 0);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Look.maxAniso || 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.channel = 0; return t; };
  return { map: mk(L.cv[0], true), normal: mk(nc), orm: mk(oc) };
}
const J = (r, n) => r.range(-n, n);

// ---------- styles: tile = metres per repeat ----------
const STYLES = {
  panel: { tile: 1, S: 256, color: PAL.hull, nStr: 4, aoK: 3, draw(L, r) {   // painted wall panels 2x2, grooved seams, corner bolts, scratches
    L.rect(0, 0, 256, 256, '#d6d9dc', 128, 150, 0);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const v = 200 + J(r, 12) | 0; L.rect(i * 128, j * 128, 128, 128, `rgb(${v},${v + 2},${v + 5})`, 128, 150 + J(r, 18), 0, 0.9);
      L.rect(i * 128 + 4, j * 128 + 4, 120, 2, '#fff', 150, null, null, 0.35); L.rect(i * 128 + 4, j * 128 + 4, 2, 120, '#fff', 150, null, null, 0.2); L.rect(i * 128 + 4, j * 128 + 122, 120, 2, '#000', 100, null, null, 0.25); }
    L.rect(0, 0, 256, 4, '#3a3f45', 30, 210, 0); L.rect(0, 0, 4, 256, '#3a3f45', 30, 210, 0); L.rect(0, 128, 256, 4, '#3a3f45', 30, 210, 0); L.rect(128, 0, 4, 256, '#3a3f45', 30, 210, 0);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) for (const [ox, oy] of [[14, 14], [114, 14], [14, 114], [114, 114]]) { const x = i * 128 + ox, y = j * 128 + oy; L.circle(x, y + 1.5, 5, '#000', 120, 255, 0, 0.3); L.circle(x, y, 4.5, '#aab0b8', 215, 70, 230); L.circle(x - 1, y - 1, 1.6, '#fff', 240, 40, 255, 0.8); L.line(x, y + 5, x + J(r, 2), y + 24, 3, '#6a4a30', null, null, null, 0.1); }
    for (let i = 0; i < 16; i++) { const x = r() * 256, y = r() * 256, a = r() * 6.28, l = r.range(8, 46); L.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1, '#e8ecf0', 112, 90, 190, r.range(0.25, 0.6)); }
    for (let i = 0; i < 400; i++) L.rect(r() * 256, r() * 256, 1, 1, r.chance(0.5) ? '#000' : '#fff', null, null, null, r.range(0.04, 0.12)); } },
  plate: { tile: 1, S: 256, color: PAL.hullDark, nStr: 5, aoK: 3, draw(L, r) {   // one heavy plate: raised field, rivet rim, weld seam on the edge
    L.rect(0, 0, 256, 256, '#cdd0d4', 120, 130, 40); L.rect(14, 14, 228, 228, '#d8dbdf', 150, 140, 40);
    L.rect(14, 14, 228, 2, '#fff', 170, null, null, 0.4); L.rect(14, 240, 228, 2, '#000', 90, null, null, 0.3);
    for (let i = 0; i < 8; i++) for (const p of [[i * 32 + 16, 7], [i * 32 + 16, 249], [7, i * 32 + 16], [249, i * 32 + 16]]) { L.circle(p[0], p[1] + 1, 4, '#000', 110, 255, 0, 0.35); L.circle(p[0], p[1], 3.6, '#9aa0a8', 200, 80, 220); L.circle(p[0] - 1, p[1] - 1, 1.2, '#fff', 230, 50, 255, 0.7); }
    for (let x = 0; x < 256; x += 5) { L.circle(x, 1, 3, '#7a7e84', 160, 120, 200); }
    for (let i = 0; i < 24; i++) { const x = r.range(20, 236), y = r.range(20, 236), a = r() * 6.28, l = r.range(6, 40); L.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 1, '#f0f2f4', 112, 80, 220, r.range(0.2, 0.55)); }
    for (let i = 0; i < 500; i++) L.rect(r() * 256, r() * 256, 1, 1, '#000', null, null, null, r.range(0.04, 0.14)); } },
  ribbed: { tile: 1, S: 256, color: PAL.hull, nStr: 6, aoK: 4, draw(L, r) {   // vertical corrugation, 8 ribs per metre
    for (let i = 0; i < 8; i++) { const x = i * 32; for (let k = 0; k < 32; k++) { const s = Math.sin(k / 32 * Math.PI), v = 150 + s * 70 | 0; L.rect(x + k, 0, 1, 256, `rgb(${v},${v + 2},${v + 6})`, 60 + s * 160, 190 - s * 80, 40); } }
    for (let i = 0; i < 18; i++) { const x = r() * 256; L.line(x, r() * 256, x + J(r, 2), r() * 256, 1, '#ffd9b0', null, 120, 200, r.range(0.05, 0.14)); }
    L.rect(0, 0, 256, 3, '#222', 30, 210, 0); L.rect(0, 126, 256, 4, '#222', 30, 210, 0); for (let i = 0; i < 800; i++) L.rect(r() * 256, r() * 256, 1, 1, '#000', null, null, null, r.range(0.04, 0.12)); } },
  steel: { tile: 1, S: 256, color: 0xc4c8ce, nStr: 1.5, aoK: 1, draw(L, r) {   // brushed steel, horizontal grain, seam at the tile edge
    L.rect(0, 0, 256, 256, '#c2c6cc', 128, 95, 255);
    for (let i = 0; i < 900; i++) { const y = r() * 256, x = r() * 256, l = r.range(30, 160), lt = r.chance(0.5); L.line(x, y, x + l, y, 1, lt ? '#fff' : '#555', 128 + (lt ? 6 : -6), 95 + (lt ? -18 : 22), 255, r.range(0.05, 0.16)); }
    L.rect(0, 0, 256, 3, '#222', 40, 160, 255); for (let i = 0; i < 8; i++) L.line(r() * 256, r() * 256, r() * 256, r() * 256, 1, '#fff', 118, 60, 255, 0.12); } },
  diamond: { tile: 1, S: 256, color: 0xaeb3ba, nStr: 7, aoK: 5, draw(L, r) {   // tread plate
    L.rect(0, 0, 256, 256, '#a9aeb6', 90, 120, 255);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const cx = i * 32 + (j % 2 ? 16 : 0), cy = j * 32 + 16, a = (i + j) % 2 ? 0.8 : -0.8;
      for (const wr of [-256, 0, 256]) L.paint(x => { x.save(); x.translate(cx + wr, cy); x.rotate(a); x.beginPath(); x.ellipse(0, 0, 11, 3.4, 0, 0, 7); x.fill(); x.restore(); }, ['#d0d4da', 230, 85, 255]); }
    for (let i = 0; i < 700; i++) L.rect(r() * 256, r() * 256, 1, 1, '#000', null, null, null, r.range(0.05, 0.16)); } },
  concrete: { tile: 2, S: 512, color: PAL.concrete, nStr: 3, aoK: 3, draw(L, r) {   // poured wall: soft mottling, pores, form-tie holes on a 1 m grid, cold joints at the tile edge
    const n = fbm(512, 5, 5, 4), n2 = fbm(512, 6, 3, 16); L.pixels((x, y) => { const v = 150 + (n[y * 512 + x] - 0.5) * 70 + (n2[y * 512 + x] - 0.5) * 24; return [v, v, v - 2, 120 + n2[y * 512 + x] * 30, 205 + n[y * 512 + x] * 30, 0]; });
    for (let i = 0; i < 160; i++) L.circle(r() * 512, r() * 512, r.range(0.8, 2.6), '#000', 70, 240, 0, r.range(0.2, 0.55));
    for (let i = 0; i < 4; i++) { const x = (i % 2) * 256 + 128, y = (i >> 1) * 256 + 128; L.circle(x, y, 9, '#111', 40, 255, 0, 0.8); L.circle(x, y, 13, '#222', 90, 240, 0, 0.3); L.circle(x, y, 6, '#000', 20, 255, 0, 0.8); }
    L.rect(0, 0, 512, 3, '#222', 50, 230, 0, 0.8); L.rect(0, 0, 3, 512, '#222', 50, 230, 0, 0.8); L.rect(0, 256, 512, 2, '#222', 70, 230, 0, 0.5);
    for (let i = 0; i < 7; i++) { let x = r() * 512, y = r() * 512; for (let k = 0; k < 9; k++) { const nx = x + J(r, 14), ny = y + r.range(4, 16); L.line(x, y, nx, ny, 1, '#111', 60, 240, 0, 0.5); x = nx; y = ny; } } } },
  tile: { tile: 1, S: 256, color: PAL.tile, nStr: 5, aoK: 4, draw(L, r) {   // glazed 25 cm tiles, dark grout, glossy, a few chips
    L.rect(0, 0, 256, 256, '#6e6f6c', 60, 235, 0);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = 228 + J(r, 7) | 0; L.rect(i * 64 + 2, j * 64 + 2, 60, 60, `rgb(${v},${v},${v - 2})`, 150, 55 + J(r, 12), 0); L.rect(i * 64 + 2, j * 64 + 2, 60, 2, '#fff', 165, null, null, 0.5);
      if (r.chance(0.12)) L.circle(i * 64 + r.range(6, 58), j * 64 + r.range(6, 58), r.range(1, 3), '#8a8a85', 90, 200, 0, 0.8); }
    for (let i = 0; i < 300; i++) L.rect(r() * 256, r() * 256, 1, 1, '#000', null, 70, null, r.range(0.03, 0.1)); } },
  carpet: { tile: 2, S: 512, color: PAL.carpet, nStr: 1.2, aoK: 1.5, draw(L, r) {   // commercial loop pile with a faint woven stripe
    const hs = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    L.pixels((x, y) => { const f = hs(x >> 1, y), band = (y >> 6) & 1 ? 8 : 0, v = 150 + band + f * 80, hh = 80 + f * 110; return [v, v, v, hh, 245, 0]; });
    L.rect(0, 0, 512, 2, '#000', 100, 245, 0, 0.2); } },
  wood: { tile: 2, S: 512, color: PAL.wood, nStr: 3, aoK: 3, draw(L, r) {   // 8 planks 25 cm wide, staggered joints, flowing grain
    const gn = fbm(512, 9, 3, 8);
    for (let p = 0; p < 8; p++) {
      const y0 = p * 64, tone = 200 + J(r, 22) | 0, cut = r.range(120, 400); const jointX = [0, cut];
      for (let seg = 0; seg < 2; seg++) { const x0 = jointX[seg], x1 = seg ? 512 : cut, t = tone + J(r, 14) | 0; L.rect(x0, y0, x1 - x0, 64, `rgb(${t},${t - 6},${t - 14})`, 130, 150, 0);
        for (let k = 0; k < 26; k++) { const yy = y0 + 3 + r() * 58, l = r.range(60, 300), xs = x0 + r() * Math.max(10, x1 - x0 - 60); L.paint(cx => { cx.lineWidth = r.range(0.6, 1.6); cx.beginPath(); cx.moveTo(xs, yy); for (let s = 1; s <= 6; s++) cx.lineTo(xs + l * s / 6, yy + (gn[(Math.floor(yy) % 512) * 512 + Math.floor(xs + l * s / 6) % 512] - 0.5) * 6); cx.stroke(); }, ['#3a2410', 95, 175, null], r.range(0.08, 0.28)); }
        L.rect(x0, y0, x1 - x0, 2, '#2a1a0c', 40, 220, 0, 0.9); L.rect(x0, y0 + 2, x1 - x0, 1, '#fff', 150, null, null, 0.15); L.rect(x0, y0, 2, 64, '#2a1a0c', 40, 220, 0, 0.9); if (r.chance(0.3)) L.circle(x0 + r.range(30, x1 - x0 - 30), y0 + 32, 3, '#3a2410', 90, 200, 0, 0.6); }
    } } },
  rubber: { tile: 1, S: 256, color: PAL.rubber, nStr: 5, aoK: 4, draw(L, r) {   // coin-stud rubber floor
    L.rect(0, 0, 256, 256, '#bdbdbd', 110, 225, 0);
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { const x = i * 21.33 + (j % 2 ? 10.7 : 0) + 4, y = j * 21.33 + 10; for (const ox of [-256, 0, 256]) { L.circle(x + ox, y, 7.2, '#f0f0f0', 215, 200, 0); L.circle(x + ox - 1.5, y - 1.5, 3, '#fff', 235, 170, 0, 0.35); } }
    for (let i = 0; i < 1400; i++) L.rect(r() * 256, r() * 256, 1, 1, r.chance(0.5) ? '#000' : '#fff', null, null, null, r.range(0.05, 0.15)); } },
  hazard: { tile: 1, S: 256, color: 0xffffff, nStr: 2.5, aoK: 2, draw(L, r) {   // diagonal safety stripes, chipped to bare metal
    const n = fbm(256, 12, 4, 8), n2 = fbm(256, 13, 2, 32);
    L.pixels((x, y) => { const s = (x + y) % 64, yel = s < 32, chip = n[y * 256 + x] > 0.64 && n2[y * 256 + x] > 0.45, wear = n[y * 256 + x];
      if (chip) return [120, 120, 124, 90, 110, 255]; const e = Math.min(s % 32, 32 - s % 32) < 1.2 ? 0.6 : 1; const k = 0.88 + wear * 0.18;
      return yel ? [236 * e * k, 180 * e * k, 28 * e * k, 140, 120 + wear * 50, 0] : [26 * k, 26 * k, 28 * k, 125, 130 + wear * 40, 0]; });
    for (let i = 0; i < 10; i++) L.line(r() * 256, r() * 256, r() * 256, r() * 256, 1, '#ccc', 100, 80, 220, 0.3); } },
  rust: { tile: 2, S: 512, color: 0xffffff, nStr: 4, aoK: 3, draw(L, r) {   // derelict plate: bare steel, orange scale, flaking dark patches
    const a = fbm(512, 21, 5, 4), b = fbm(512, 22, 4, 12), c = fbm(512, 23, 3, 32);
    L.pixels((x, y) => { const i = y * 512 + x, rust = Math.max(0, Math.min(1, (a[i] - 0.38) * 3.2)), flake = b[i] > 0.62 ? 1 : 0, grain = c[i];
      let R = 118 + grain * 20, G = 120 + grain * 20, B = 124 + grain * 20, h = 128, ro = 90, me = 255;   // steel
      const rr = 150 + b[i] * 70 - flake * 90, rg = 74 + b[i] * 40 - flake * 40, rb = 36 + b[i] * 20 - flake * 18;
      R = R + (rr - R) * rust; G = G + (rg - G) * rust; B = B + (rb - B) * rust; h = 128 - rust * 30 + b[i] * 40 * rust - flake * 40; ro = 90 + rust * 140; me = 255 * (1 - rust * 0.85);
      return [R, G, B, h, ro, me]; });
    for (let i = 0; i < 14; i++) { const x = r() * 512; L.line(x, r() * 512, x + J(r, 6), r() * 512, r.range(2, 6), '#3a2210', 100, 230, 0, r.range(0.05, 0.15)); }
    L.rect(0, 0, 512, 3, '#1a1008', 50, 240, 0, 0.8); L.rect(0, 0, 3, 512, '#1a1008', 50, 240, 0, 0.8);
    for (let i = 0; i < 4; i++) { const x = (i % 2) * 256 + 24, y = (i >> 1) * 256 + 24; L.circle(x, y, 7, '#2a1a10', 170, 220, 100); } } },
};
export { STYLES };
const SCALE_STYLE_NAMES = Object.keys(STYLES);

const bakeCache = {}, matCache = {};
function styleMaps(style) {
  const S = STYLES[style]; if (!S) throw new Error('matlib: unknown style ' + style); if (bakeCache[style]) return bakeCache[style];
  const L = new Layers(S.S), r = rng(style.length * 977 + style.charCodeAt(0)); S.draw(L, r); const b = bake(L, S.nStr, S.aoK);
  for (const t of [b.map, b.normal, b.orm]) t.repeat.set(1 / S.tile, 1 / S.tile); return bakeCache[style] = b;
}
export function panelMat(style = 'panel', color) {   // UVs must be metres: use uvMeters(geo). color tints the albedo (hazard/rust default to their own colours)
  const S = STYLES[style]; if (!S) { style = 'panel'; } const sty = STYLES[style]; const col = new THREE.Color(color ?? sty.color); const key = style + col.getHex(); if (matCache[key]) return matCache[key];
  const b = styleMaps(style), m = new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normal, roughnessMap: b.orm, metalnessMap: b.orm, aoMap: b.orm, color: col, roughness: 1, metalness: 1 });
  Look.dress(m, 'mat_' + style, col, { map: b.map, normal: b.normal, orm: b.orm, P: { metal: 1 } });
  m.userData.matlib = { style, tile: sty.tile }; return matCache[key] = m;
}
export function styleNames() { return SCALE_STYLE_NAMES.slice(); }

// Box-project UVs into world metres (dominant normal axis). Pass the object's world matrix (or a translate matrix) to make neighbouring segments continue the pattern.
export function uvMeters(geo, matrix, unit = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal; if (!n) geo.computeVertexNormals(); const nn = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2), v = new THREE.Vector3(), nv = new THREE.Vector3(), nm = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); nv.fromBufferAttribute(nn, i); if (matrix) { v.applyMatrix4(matrix); nv.applyMatrix3(nm); }
    const ax = Math.abs(nv.x), ay = Math.abs(nv.y), az = Math.abs(nv.z);
    if (ay >= ax && ay >= az) { uv[i * 2] = v.x / unit; uv[i * 2 + 1] = v.z / unit; } else if (ax >= az) { uv[i * 2] = v.z / unit; uv[i * 2 + 1] = v.y / unit; } else { uv[i * 2] = v.x / unit; uv[i * 2 + 1] = v.y / unit; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}

// ---------- shared update loop (called by Look.render through Look.hooks) ----------
const animated = [], screens = {}; let T = 0, screenAcc = 0;
function tick(dt) {
  T += dt; const night = Look.day == null ? 0.4 : 1 - Look.day, boost = 1 + 0.35 * night;
  for (const e of animated) { const t = T + e.phase; let k = 1;
    switch (e.mode) { case 'pulse': k = 0.5 + 0.5 * Math.sin(t * 2.4); k = 0.25 + 0.75 * k; break; case 'blink': k = Math.sin(t * 5.0) > 0 ? 1 : 0.05; break; case 'warn': k = Math.sin(t * 11) > 0.1 ? 1 : 0.04; break;
      case 'flicker': k = (Math.sin(t * 43) * Math.sin(t * 17.3) > 0.55 ? 0.35 : 1) * (0.9 + 0.1 * Math.sin(t * 90)); break; case 'strip': k = 0.92 + 0.08 * Math.sin(t * 0.7); break; default: k = 1; }
    e.m.emissiveIntensity = e.base * k * boost; }
  screenAcc += dt; const gap = Look.tier === 'off' ? 0.5 : 0.17; if (screenAcc >= gap) { const sdt = screenAcc; screenAcc = 0; for (const k in screens) { const s = screens[k]; s.draw(s.ctx, T + s.phase, s.st, sdt); s.tex.needsUpdate = true; } }
}
(Look.hooks || (Look.hooks = [])).push(tick);

// ---------- emissive LEDs / strips ----------
const EMODES = { led: 1.7, strip: 1.3, pulse: 1.9, blink: 2.0, warn: 2.1, flicker: 1.7, lamp: 2.6 };
export function emissiveMat(color = PAL.led.cyan, mode = 'led', o = {}) {
  const col = new THREE.Color(color), key = `${col.getHex()}|${mode}|${o.phase || 0}|${o.intensity || 0}`; if (matCache[key]) return matCache[key];
  const base = o.intensity ?? EMODES[mode] ?? 2.6, m = new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.18), emissive: col, emissiveIntensity: base, roughness: 0.35, metalness: 0 });
  m.userData.look = { skip: true }; if (mode !== 'led' && mode !== 'lamp' || true) animated.push({ m, mode, base, phase: o.phase ?? (col.getHex() % 97) * 0.37 }); return matCache[key] = m;
}

// ---------- animated screens ----------
const TINTS = [[110, 255, 150], [90, 220, 255], [255, 178, 70], [255, 110, 100]];   // green, cyan, amber, red-ish
export const SCREENS = {
  terminal: (cx, t, s, dt, tn) => { s.lines ||= Array.from({ length: 14 }, () => hexLine(s.r)); s.acc = (s.acc || 0) + dt; while (s.acc > 0.34) { s.acc -= 0.34; s.lines.shift(); s.lines.push(hexLine(s.r)); }
    bg(cx, tn, 0.05); cx.font = '10px monospace'; cx.textBaseline = 'top'; s.lines.forEach((l, i) => { cx.fillStyle = col(tn, 0.35 + 0.65 * i / s.lines.length); cx.fillText(l, 6, 4 + i * 11); }); if (Math.sin(t * 6) > 0) { cx.fillStyle = col(tn, 1); cx.fillRect(6, 4 + 14 * 11, 6, 9); } scan(cx); },
  graph: (cx, t, s, dt, tn) => { s.v ||= Array.from({ length: 64 }, () => 0.5); s.acc = (s.acc || 0) + dt; while (s.acc > 0.17) { s.acc -= 0.17; s.v.shift(); s.v.push(Math.max(0.08, Math.min(0.92, s.v[s.v.length - 1] + (s.r() - 0.5) * 0.28))); }
    bg(cx, tn, 0.05); cx.strokeStyle = col(tn, 0.18); cx.lineWidth = 1; for (let i = 1; i < 6; i++) { cx.beginPath(); cx.moveTo(0, i * 27); cx.lineTo(256, i * 27); cx.stroke(); } for (let i = 1; i < 8; i++) { cx.beginPath(); cx.moveTo(i * 32, 0); cx.lineTo(i * 32, 160); cx.stroke(); }
    cx.strokeStyle = col(tn, 1); cx.lineWidth = 2; cx.beginPath(); s.v.forEach((v, i) => cx[i ? 'lineTo' : 'moveTo'](i * 4, 150 - v * 140)); cx.stroke(); cx.fillStyle = col(tn, 0.22); cx.lineTo(252, 160); cx.lineTo(0, 160); cx.fill(); scan(cx); },
  radar: (cx, t, s, dt, tn) => { bg(cx, tn, 0.04); const X = 128, Y = 80, R = 70; cx.strokeStyle = col(tn, 0.4); cx.lineWidth = 1; for (const k of [0.33, 0.66, 1]) { cx.beginPath(); cx.arc(X, Y, R * k, 0, 7); cx.stroke(); } cx.beginPath(); cx.moveTo(X - R, Y); cx.lineTo(X + R, Y); cx.moveTo(X, Y - R); cx.lineTo(X, Y + R); cx.stroke();
    const a = t * 2.1; for (let i = 0; i < 24; i++) { cx.strokeStyle = col(tn, 0.9 * (1 - i / 24)); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(X, Y); cx.lineTo(X + Math.cos(a - i * 0.04) * R, Y + Math.sin(a - i * 0.04) * R); cx.stroke(); }
    s.blips ||= Array.from({ length: 5 }, () => [s.r() * 6.28, s.r() * 0.9 + 0.1]); for (const [ba, bd] of s.blips) { const d = ((a - ba) % 6.283 + 6.283) % 6.283, f = Math.max(0, 1 - d / 3); cx.fillStyle = col(tn, f); cx.beginPath(); cx.arc(X + Math.cos(ba) * R * bd, Y + Math.sin(ba) * R * bd, 3, 0, 7); cx.fill(); } scan(cx); },
  bars: (cx, t, s, dt, tn) => { s.v ||= Array.from({ length: 16 }, () => s.r()); bg(cx, tn, 0.05); s.v = s.v.map(v => Math.max(0.05, Math.min(1, v + (s.r() - 0.5) * 0.5))); s.v.forEach((v, i) => { const h = v * 130; for (let y = 0; y < h; y += 8) { cx.fillStyle = col(tn, y > 100 ? 0.5 : 1); cx.fillRect(10 + i * 15, 150 - y - 6, 11, 6); } }); scan(cx); },
  status: (cx, t, s, dt, tn) => { s.cells ||= Array.from({ length: 6 * 10 }, () => s.r()); bg(cx, tn, 0.06); if (s.r() < 0.5) s.cells[(s.r() * s.cells.length) | 0] = s.r(); s.cells.forEach((v, i) => { const x = 14 + (i % 10) * 23, y = 12 + ((i / 10) | 0) * 17; cx.fillStyle = v > 0.82 ? 'rgb(255,90,70)' : col(tn, 0.2 + 0.8 * (v > 0.3 ? 1 : 0.15)); cx.fillRect(x, y, 18, 11); });
    const p = (t * 0.12) % 1; cx.fillStyle = col(tn, 0.3); cx.fillRect(14, 126, 228, 12); cx.fillStyle = col(tn, 1); cx.fillRect(14, 126, 228 * p, 12); cx.fillRect(14, 144, 120 * (0.5 + 0.5 * Math.sin(t * 0.6)), 6); scan(cx); },
  wave: (cx, t, s, dt, tn) => { bg(cx, tn, 0.04); cx.strokeStyle = col(tn, 1); cx.lineWidth = 2; cx.beginPath(); for (let x = 0; x < 256; x += 2) { const u = x / 256, y = 80 + (Math.sin(u * 20 - t * 5) * 30 * Math.sin(u * 3.1 + t) + Math.sin(u * 47 + t * 9) * 8) * (0.5 + 0.5 * Math.sin(t * 0.8)); cx[x ? 'lineTo' : 'moveTo'](x, y); } cx.stroke(); cx.strokeStyle = col(tn, 0.2); cx.beginPath(); cx.moveTo(0, 80); cx.lineTo(256, 80); cx.stroke(); scan(cx); },
  static: (cx, t, s) => { s.im ||= cx.createImageData(256, 160); const d = s.im.data; for (let i = 0; i < d.length; i += 4) { const v = s.r() * 150 + 20; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } cx.putImageData(s.im, 0, 0); },
  idle: (cx, t, s, dt, tn) => { bg(cx, tn, 0.04); const k = 0.4 + 0.2 * Math.sin(t * 1.3); cx.fillStyle = col(tn, k); cx.beginPath(); cx.arc(128, 80, 16, 0, 7); cx.fill(); cx.strokeStyle = col(tn, k * 0.6); cx.lineWidth = 3; cx.beginPath(); cx.arc(128, 80, 28, 0, 7); cx.stroke(); },
};
const hexLine = r => { let s = ''; const n = 5 + (r() * 22 | 0); for (let i = 0; i < n; i++) s += r() < 0.15 ? ' ' : '0123456789ABCDEF'[(r() * 16) | 0]; return (r() < 0.3 ? '> ' : '  ') + s; };
let _tn = TINTS[0]; const col = (tn, a) => `rgba(${tn[0]},${tn[1]},${tn[2]},${a})`;
const bg = (cx, tn, k) => { cx.fillStyle = `rgb(${tn[0] * k | 0},${tn[1] * k | 0},${tn[2] * k | 0})`; cx.fillRect(0, 0, 256, 160); };
const scan = cx => { cx.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < 160; y += 3) cx.fillRect(0, y, 256, 1); };
export function screenTexture(kind = 'terminal', variant = 0) {   // shared per (kind, variant); sRGB canvas, redrawn by the shared loop
  if (!SCREENS[kind]) kind = 'terminal'; const key = kind + '#' + variant; if (screens[key]) return screens[key].tex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const cx = c.getContext('2d'), r = rng(variant * 131 + kind.length * 17 + kind.charCodeAt(0)), tn = TINTS[variant % TINTS.length];
  const st = { r }, f = SCREENS[kind], draw = (x, t, s, dt) => f(x, t, s, dt, tn);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; screens[key] = { ctx: cx, tex, st, draw, phase: variant * 3.1 }; draw(cx, 0, st, 0.1); tex.needsUpdate = true; return tex;
}
export function screenMat(kind = 'terminal', variant = 0, intensity = 1.5) {   // plane/box face material: dark glass that emits the animated canvas
  const key = `screen|${kind}|${variant}|${intensity}`; if (matCache[key]) return matCache[key]; const t = screenTexture(kind, variant);
  const m = new THREE.MeshStandardMaterial({ color: 0x050607, map: null, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: intensity, roughness: 0.18, metalness: 0.1 }); m.userData.look = { skip: true }; return matCache[key] = m;
}

// ---------- decals (alpha overlays; place 2-3 mm off the wall) ----------
const decalCache = {};
function dcanvas(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
const DECALS = {
  streak: () => dcanvas(128, 256, (x, w, h) => { const r = rng(3); for (let i = 0; i < 9; i++) { const px = r.range(8, w - 8), len = r.range(60, h - 10), wd = r.range(2, 9), g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(30,22,14,${r.range(0.28, 0.5)})`); g.addColorStop(0.7, 'rgba(30,22,14,0.12)'); g.addColorStop(1, 'rgba(30,22,14,0)'); x.fillStyle = g; x.fillRect(px - wd / 2, 0, wd, len); } }),
  stripe: () => dcanvas(256, 64, (x, w, h) => { x.fillStyle = '#e2b422'; x.fillRect(0, 0, w, h); x.fillStyle = '#1b1b1c'; for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 48, 0); x.lineTo(i * 48 + 24, 0); x.lineTo(i * 48 + 24 - 64, h); x.lineTo(i * 48 - 64, h); x.fill(); } x.fillStyle = '#1b1b1c'; x.fillRect(0, 0, w, 4); x.fillRect(0, h - 4, w, 4); const r = rng(7); for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(0,0,0,${r.range(0.05, 0.25)})`; x.fillRect(r() * w, r() * h, r.range(1, 5), 1); } }),
  vent: () => dcanvas(256, 256, (x, w, h) => { x.fillStyle = '#4a5058'; x.fillRect(0, 0, w, h); x.fillStyle = '#1a1d21'; x.fillRect(14, 14, w - 28, h - 28); for (let i = 0; i < 9; i++) { const y = 22 + i * 24; const g = x.createLinearGradient(0, y, 0, y + 16); g.addColorStop(0, '#8a9098'); g.addColorStop(1, '#3a3f46'); x.fillStyle = g; x.fillRect(18, y, w - 36, 15); } x.fillStyle = '#9aa0a8'; for (const [px, py] of [[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7]]) { x.beginPath(); x.arc(px, py, 3.5, 0, 7); x.fill(); } }),
  fan: () => dcanvas(256, 256, (x, w, h) => { x.fillStyle = '#454b53'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill(); x.fillStyle = '#14171a'; x.beginPath(); x.arc(128, 128, 108, 0, 7); x.fill(); x.strokeStyle = '#7e858e'; x.lineWidth = 5; for (let r = 24; r < 108; r += 21) { x.beginPath(); x.arc(128, 128, r, 0, 7); x.stroke(); } for (let a = 0; a < 6.28; a += 0.5236) { x.beginPath(); x.moveTo(128, 128); x.lineTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); x.stroke(); } x.fillStyle = '#5c636b'; x.beginPath(); x.arc(128, 128, 14, 0, 7); x.fill(); }),
  arrow: () => dcanvas(128, 128, (x) => { x.fillStyle = '#e8e2cc'; x.beginPath(); x.moveTo(20, 80); x.lineTo(64, 24); x.lineTo(108, 80); x.lineTo(88, 80); x.lineTo(64, 50); x.lineTo(40, 80); x.fill(); x.globalAlpha = 0.8; x.beginPath(); x.moveTo(20, 112); x.lineTo(64, 56); x.lineTo(108, 112); x.lineTo(88, 112); x.lineTo(64, 82); x.lineTo(40, 112); x.fill(); }),
  warn: () => dcanvas(128, 128, (x) => { x.fillStyle = '#e2b422'; x.beginPath(); x.moveTo(64, 10); x.lineTo(120, 108); x.lineTo(8, 108); x.closePath(); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 6; x.lineJoin = 'round'; x.stroke(); x.fillStyle = '#111'; x.fillRect(58, 42, 12, 36); x.beginPath(); x.arc(64, 91, 7, 0, 7); x.fill(); }),
  scorch: () => dcanvas(256, 256, (x) => { const g = x.createRadialGradient(128, 140, 4, 128, 128, 120); g.addColorStop(0, 'rgba(8,6,5,0.85)'); g.addColorStop(0.5, 'rgba(12,9,7,0.45)'); g.addColorStop(1, 'rgba(12,9,7,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); const r = rng(5); for (let i = 0; i < 18; i++) { x.strokeStyle = `rgba(10,8,6,${r.range(0.2, 0.5)})`; x.lineWidth = r.range(1, 3); x.beginPath(); x.moveTo(128, 140); const a = r() * 6.28, l = r.range(40, 120); x.lineTo(128 + Math.cos(a) * l, 140 + Math.sin(a) * l - 20); x.stroke(); } }),
  oil: () => dcanvas(256, 256, (x) => { const r = rng(11); for (let i = 0; i < 6; i++) { const cx = 128 + J(r, 40), cy = 128 + J(r, 40), rad = r.range(30, 80), g = x.createRadialGradient(cx, cy, 2, cx, cy, rad); g.addColorStop(0, 'rgba(14,12,10,0.65)'); g.addColorStop(0.7, 'rgba(14,12,10,0.3)'); g.addColorStop(1, 'rgba(14,12,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); } }),
  plate: () => dcanvas(256, 128, (x, w, h) => { x.fillStyle = '#8c9299'; x.fillRect(0, 0, w, h); x.fillStyle = '#c9ced4'; x.fillRect(5, 5, w - 10, h - 10); x.fillStyle = '#1d2024'; const r = rng(17); for (let i = 0; i < 70; i++) { const bw = r.range(1, 4); x.fillRect(16 + i * 3.1, 70, bw, 40); } for (let i = 0; i < 4; i++) { x.fillRect(16, 16 + i * 12, r.range(60, 170), 6); } x.fillStyle = '#5c6168'; for (const [px, py] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]]) { x.beginPath(); x.arc(px, py, 2.5, 0, 7); x.fill(); } }),
  scratches: () => dcanvas(256, 256, (x) => { const r = rng(23); for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(235,238,242,${r.range(0.1, 0.4)})`; x.lineWidth = r.range(0.6, 1.4); const px = r() * 256, py = r() * 256, a = r.range(-0.5, 0.5) + (r.chance(0.5) ? 0 : 1.57), l = r.range(15, 90); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); } }),
  grime: () => dcanvas(256, 256, (x) => { const r = rng(29); for (let i = 0; i < 40; i++) { const cx = r() * 256, cy = r() * 256, rad = r.range(20, 60), g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, `rgba(25,20,14,${r.range(0.06, 0.16)})`); g.addColorStop(1, 'rgba(25,20,14,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); } }),
};
export function decalTextures() { const o = {}; for (const k in DECALS) o[k] = decalCache[k] || (decalCache[k] = DECALS[k]()); return o; }
export function decalMat(name, o = {}) {   // transparent, depthWrite off, polygon offset: stays flush without z-fighting
  const key = `decal|${name}|${o.opacity ?? 1}|${o.color ?? ''}|${o.emissive ?? ''}`; if (matCache[key]) return matCache[key]; const t = decalTextures()[name]; if (!t) throw new Error('matlib: unknown decal ' + name);
  const m = new THREE.MeshStandardMaterial({ map: t, color: o.color ?? 0xffffff, transparent: true, opacity: o.opacity ?? 1, depthWrite: false, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, emissive: o.emissive ?? 0x000000, emissiveMap: o.emissive != null ? t : null });
  m.userData.look = { skip: true }; return matCache[key] = m;
}
export function decalMesh(name, w, h, o) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(name, o)); }   // face +z; rotate/offset it 2-3 mm off the wall
export function decalNumber(text = '01', o = {}) {   // stencil digits, e.g. bay/frame numbers. Only 0-9 - / A-F style codes; never room names.
  const key = `num|${text}|${o.color ?? '#e8e2cc'}`; if (matCache[key]) return matCache[key]; const w = 64 * Math.max(2, text.length);
  const t = dcanvas(w, 128, (x) => { x.font = 'bold 100px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = o.color ?? '#e8e2cc'; x.fillText(text, w / 2, 70); const r = rng(text.length * 7 + 1); for (let i = 0; i < 90; i++) { x.globalCompositeOperation = 'destination-out'; x.fillStyle = `rgba(0,0,0,${r.range(0.2, 0.7)})`; x.fillRect(r() * w, r() * 128, r.range(1, 4), r.range(1, 3)); } x.globalCompositeOperation = 'source-over'; });
  const m = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); m.userData.look = { skip: true }; m.userData.aspect = w / 128; return matCache[key] = m;
}

// ---------- pipes and cables ----------
let pipeTex = null;
function pipeMaps() {
  if (pipeTex) return pipeTex; const L = new Layers(256); const r = rng(41);
  L.rect(0, 0, 256, 256, '#c8ccd2', 128, 100, 235);   // u = round the pipe, v = along (1 m); a flange band + bolts at v=0, weld ring at v=.5
  for (let i = 0; i < 700; i++) { const x = r() * 256, y = r() * 256; L.line(x, y, x, y + r.range(20, 120), 1, r.chance(0.5) ? '#fff' : '#444', 128, 100, 235, r.range(0.05, 0.14)); }
  L.rect(0, 0, 256, 18, '#9aa0a8', 200, 80, 255); L.rect(0, 18, 256, 2, '#000', 80, null, null, 0.4); for (let i = 0; i < 8; i++) { L.circle(i * 32 + 16, 9, 5, '#6a7078', 235, 70, 255); L.circle(i * 32 + 15, 8, 1.6, '#fff', 250, 50, 255, 0.8); }
  L.rect(0, 126, 256, 5, '#a0a6ae', 170, 130, 240); L.rect(0, 131, 256, 2, '#000', 80, null, null, 0.3);
  const b = bake(L, 3, 3); for (const t of [b.map, b.normal, b.orm]) t.repeat.set(1, 1); return pipeTex = b;
}
export function pipeMat(kind = 'steel', color) {   // kind: steel painted copper insulated.  Use with pipeGeo()
  const D = { steel: [0xc4c8ce, 0.3, 0.75], painted: [PAL.accent, 0.5, 0.0], copper: [PAL.copper, 0.32, 0.8], insulated: [0xc9c6bd, 0.85, 0] }[kind] || [0xc4c8ce, 0.25, 1];
  const col = new THREE.Color(color ?? D[0]), key = `pipe|${kind}|${col.getHex()}`; if (matCache[key]) return matCache[key]; const b = pipeMaps();
  const m = new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normal, aoMap: b.orm, color: col, roughness: Math.max(D[1], 0.15), metalness: D[2] }); m.normalScale.set(0.8, 0.8);
  if (kind === 'insulated') m.roughnessMap = b.orm; m.userData.look = { kind: 'pipe', variant: 'uv', tint: col, skip: true }; return matCache[key] = m;
}
export function pipeGeo(radius = 0.06, length = 1, seg = 14) {   // UV: u wraps once, v is metres along -> flange every metre; axis is +Y
  const g = new THREE.CylinderGeometry(radius, radius, length, seg, 1, false); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * length); uv.needsUpdate = true; return g;
}
export function wireMat(color = 0x1c1e22) {   // rubber-sheathed cable: ribbed micro-normal, satin
  const col = new THREE.Color(color), key = 'wire|' + col.getHex(); if (matCache[key]) return matCache[key];
  const L = new Layers(64); for (let y = 0; y < 64; y += 4) { L.rect(0, y, 64, 3, '#d8d8d8', 190, 120, 0); L.rect(0, y + 3, 64, 1, '#000', 90, 160, 0, 0.5); } const b = bake(L, 3, 2);
  for (const t of [b.map, b.normal, b.orm]) t.repeat.set(1, 6);
  const m = new THREE.MeshStandardMaterial({ map: b.map, normalMap: b.normal, color: col, roughness: 0.5, metalness: 0 }); m.userData.look = { skip: true }; return matCache[key] = m;
}
export function cableGeo(a, b, o = {}) {   // sagging cable between two THREE.Vector3; tube UV v is metres/0.17 so ribs stay evenly spaced
  const sag = o.sag ?? 0.12, r = o.radius ?? 0.012, mid = a.clone().add(b).multiplyScalar(0.5); mid.y -= sag * a.distanceTo(b);
  const curve = new THREE.CatmullRomCurve3([a.clone(), mid, b.clone()]), g = new THREE.TubeGeometry(curve, o.seg ?? 14, r, 6, false), uv = g.attributes.uv; const len = curve.getLength();
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len); return g;
}

// ---------- glass ----------
export function glassMat(tint = 0x9fd0e0, opacity = 0.22) {
  const col = new THREE.Color(tint), key = `glass|${col.getHex()}|${opacity}`; if (matCache[key]) return matCache[key];
  const m = new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }); m.userData.look = { skip: true }; return matCache[key] = m;
}

export const Matlib = { TD, PAL, STYLES, SCREENS, panelMat, styleNames, uvMeters, emissiveMat, screenTexture, screenMat, decalTextures, decalMat, decalMesh, decalNumber, pipeMat, pipeGeo, wireMat, cableGeo, glassMat, tick };
