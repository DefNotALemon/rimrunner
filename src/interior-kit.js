// Interior kit: batched furniture + partition walls + item library for building interiors.
// Everything static inside a building is merged into a handful of vertex-coloured meshes (one per material kind),
// so a fully furnished multi-room building costs ~6 draw calls instead of hundreds.
// Local frame of a building: u runs across the facade, v runs from the back wall (-D/2) to the door wall (+D/2).
// An item's local +z faces +v (towards the street door); rot=Math.PI faces the back wall, +PI/2 faces +u, -PI/2 faces -u.
import * as THREE from '../vendor/three.module.js';
import { surfMat } from './textures.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _nm = new THREE.Matrix3(), _c = new THREE.Color();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UNIT = {};
const unit = (key, make) => UNIT[key] || (UNIT[key] = make().toNonIndexed());
const uBox = () => unit('box', () => new THREE.BoxGeometry(1, 1, 1));
const uCyl = (seg, ratio) => unit(`cyl${seg}:${ratio}`, () => new THREE.CylinderGeometry(ratio, 1, 1, seg));
const uSph = seg => unit('sph' + seg, () => new THREE.SphereGeometry(1, seg, Math.max(4, (seg * 0.7) | 0)));

const MATS = {
  matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.04 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.75 }),
  glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.38, depthWrite: false }),
  emis: new THREE.MeshBasicMaterial({ vertexColors: true }),
};

export class Batch {
  constructor() { this.k = {}; }
  put(kind, g, m, color) {
    const d = this.k[kind] || (this.k[kind] = { p: [], n: [], c: [] });
    _nm.getNormalMatrix(m); _c.set(color);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m); d.p.push(_v.x, _v.y, _v.z);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); d.n.push(_n.x, _n.y, _n.z);
      d.c.push(_c.r, _c.g, _c.b);
    }
  }
  flush(root) {
    const out = [];
    for (const [kind, d] of Object.entries(this.k)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(d.c, 3));
      const m = new THREE.Mesh(g, MATS[kind]); m.receiveShadow = kind !== 'emis' && kind !== 'glass'; m.castShadow = false; m.userData.interior = true; root.add(m); out.push(m);
    }
    this.k = {}; return out;
  }
}

class Item {
  constructor(cx, u, v, rot, y) { this.cx = cx; const p = cx.P(u, v); this.base = new THREE.Matrix4().makeRotationY(cx.rec.ry + rot).setPosition(p.x, y, p.z); }
  _put(kind, g, x, yc, z, sx, sy, sz, col, o) {
    _e.set(o?.rx || 0, o?.ry || 0, o?.rz || 0); _q.setFromEuler(_e);
    const loc = new THREE.Matrix4().compose(_p.set(x, yc, z), _q, _s.set(sx, sy, sz)); loc.premultiply(this.base); this.cx.bt.put(kind, g, loc, col);
  }
  box(col, x, y0, z, w, h, d, kind = 'matte', o) { this._put(kind, uBox(), x, y0 + h / 2, z, w, h, d, col, o); }
  cyl(col, x, y0, z, r, h, kind = 'matte', o) { this._put(kind, uCyl(o?.seg || 10, o?.top ?? 1), x, y0 + h / 2, z, r, h, r, col, o); }
  cylc(col, x, yc, z, r, len, axis = 'x', kind = 'matte', o) { this._put(kind, uCyl(o?.seg || 10, 1), x, yc, z, r, len, r, col, axis === 'x' ? { rz: Math.PI / 2 } : { rx: Math.PI / 2 }); }
  sph(col, x, yc, z, r, kind = 'matte', o) { this._put(kind, uSph(o?.seg || 8), x, yc, z, r, o?.sy ? r * o.sy : r, r, col); }
}

const texCache = {};
export function signTex(text, w = 384, h = 90, bg = '#1b2028', fg = '#ffd37a') {
  const key = [text, w, h, bg, fg].join('|'); if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, bg); g.addColorStop(1, '#0a0c10'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = Math.max(2, h / 22); x.strokeRect(h / 18, h / 18, w - h / 9, h - h / 9);
  x.fillStyle = fg; x.font = `bold ${Math.min(h * 0.51, 460 / Math.max(6, text.length) * 1.7 * (w / 384))}px "Arial Black", Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + h / 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return texCache[key] = t;
}
export function marketTex() { if (texCache.market) return texCache.market; const c = document.createElement('canvas'); c.width = 340; c.height = 140; const x = c.getContext('2d'); x.fillStyle = '#1a2a20'; x.fillRect(0, 0, 340, 140); x.fillStyle = '#7dd86a'; x.font = 'bold 14px monospace'; x.fillText('RIM EXCHANGE — SPOT', 10, 20); ['IRON ORE   6', 'COPPER ORE 9', 'TITANIUM  22', 'COBALT    28', 'PLATINUM  70', 'HYMNSTONE 220'].forEach((s, i) => x.fillText(s + (i % 2 ? '  ▲' : '  ▼'), 10, 44 + i * 16)); x.strokeStyle = '#7dd86a'; x.beginPath(); x.moveTo(190, 120); for (let i = 0; i < 12; i++) x.lineTo(190 + i * 12, 100 - Math.sin(i * 0.9) * 22 - i * 3); x.stroke(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return texCache.market = t; }
let barsMat = null;
function getBarsMat() {
  if (barsMat) return barsMat;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d'); x.clearRect(0, 0, 128, 256); x.fillStyle = '#9aa2ac';
  for (let i = 0; i < 8; i++) x.fillRect(i * 16 + 5, 0, 6, 256);
  x.fillStyle = '#7c848e'; x.fillRect(0, 8, 128, 10); x.fillRect(0, 238, 128, 10); x.fillRect(0, 120, 128, 6);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return barsMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
}

const TRIM = 0x3a3f46, BASE = 0x2e2924;

export class Ctx {
  constructor(surf, rec, r) {
    this.surf = surf; this.rec = rec; this.r = r; this.K = rec.K; this.P = rec.P; this.bt = new Batch();
    const ns = rec.dv[1] !== 0;   // (rec.door is the street-side spot; dv says which wall the door is in)
    this.W = ns ? rec.w : rec.d; this.D = ns ? rec.d : rec.w; this.H = rec.H; this.Hc = rec.H - 0.04;
    this.u0 = -this.W / 2 + 0.16; this.u1 = this.W / 2 - 0.16; this.vb = -this.D / 2 + 0.16; this.vf = this.D / 2 - 0.16;
    this.wallCol = 0xd6d0c2; this.beds = []; this.rooms = []; this.waypoints = {};
  }
  // ---- geometry helpers (local -> world AABB) ----
  wb(kind, col, x0, x1, y0, y1, z0, z1) {
    const m = new THREE.Matrix4().compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q.identity(), _s.set(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0)));
    this.bt.put(kind, uBox(), m, col);
  }
  aabb(u0, u1, v0, v1) { const A = this.P(u0, v0), B = this.P(u1, v1); return { x0: Math.min(A.x, B.x), x1: Math.max(A.x, B.x), z0: Math.min(A.z, B.z), z1: Math.max(A.z, B.z) }; }
  lb(kind, col, u0, u1, v0, v1, y0, y1) { const a = this.aabb(u0, u1, v0, v1); this.wb(kind, col, a.x0, a.x1, y0, y1, a.z0, a.z1); }
  col(u0, u1, v0, v1, h) { const a = this.aabb(u0, u1, v0, v1); this.surf.colliders.push({ minx: a.x0, maxx: a.x1, minz: a.z0, maxz: a.z1, maxy: h }); }
  solid(u, v, w, d, h) { this.col(u - w / 2, u + w / 2, v - d / 2, v + d / 2, h); }
  floor(u0, u1, v0, v1, kind, color, tile = 2) { const a = this.aabb(u0, u1, v0, v1); return this.K.box(a.x0, a.x1, 0.03, 0.05, a.z0, a.z1, surfMat(kind, color), { shadow: false, tile }); }
  rug(u, v, w, d, col, border) { this.lb('matte', col, u - w / 2, u + w / 2, v - d / 2, v + d / 2, 0.05, 0.062); if (border !== undefined) this.lb('matte', border, u - w / 2 + 0.25, u + w / 2 - 0.25, v - d / 2 + 0.25, v + d / 2 - 0.25, 0.062, 0.066); }

  // paint the inner faces of the four outer walls (plaster above a darker wainscot) so rooms don't read as bare siding/brick/concrete
  paintShell(col, dado) {
    const { u0, u1, vb, vf, Hc } = this, t = 0.025, y = 1.0;
    const strip = (a, b, c, d) => { this.lb('matte', dado, a, b, c, d, 0, y); this.lb('matte', col, a, b, c, d, y, Hc); this.lb('matte', 0x3a3028, a - (b - a > 0.5 && c === d ? 0 : 0), b, c, d, y, y + 0.05); };
    strip(u0, u0 + t, vb, vf); strip(u1 - t, u1, vb, vf); strip(u0, u1, vb, vb + t);
    const dw = 1.15; strip(u0, -dw, vf - t, vf); strip(dw, u1, vf - t, vf); this.lb('matte', col, -dw, dw, vf - t, vf, 2.5, Hc);
  }
  // ---- walls ----
  // axis 'u': wall runs along u at fixed v. axis 'v': wall runs along v at fixed u. gaps: [centre, width, 'win'?]
  wall(axis, at, a, b, gaps = [], o = {}) {
    const t = o.t || 0.2, col = o.col ?? this.wallCol, y1 = o.h ?? this.Hc;
    const box = (kind, c, s0, s1, y0, yy1, ex = 0) => axis === 'u' ? this.lb(kind, c, s0, s1, at - t / 2 - ex, at + t / 2 + ex, y0, yy1) : this.lb(kind, c, at - t / 2 - ex, at + t / 2 + ex, s0, s1, y0, yy1);
    const colr = (s0, s1, h) => axis === 'u' ? this.col(s0, s1, at - t / 2, at + t / 2, h) : this.col(at - t / 2, at + t / 2, s0, s1, h);
    const seg = (s0, s1) => { if (s1 - s0 < 0.03) return; box('matte', col, s0, s1, 0, y1); box('matte', o.base ?? BASE, s0, s1, 0, 0.12, 0.015); colr(s0, s1, y1); };
    let cur = a; const gs = gaps.slice().sort((p, q) => p[0] - q[0]);
    for (const [c, w, kind] of gs) {
      const g0 = c - w / 2, g1 = c + w / 2; seg(cur, g0);
      box('matte', col, g0, g1, 2.25, y1);
      box('matte', o.trim ?? TRIM, g0 - 0.07, g0, 0, 2.25, 0.02); box('matte', o.trim ?? TRIM, g1, g1 + 0.07, 0, 2.25, 0.02);
      if (kind === 'win') { box('matte', col, g0, g1, 0, 0.95); box('glass', 0xa8d0e8, g0, g1, 0.95, 2.25, -t / 2 + 0.05); colr(g0, g1, 2.25); }
      cur = g1;
    }
    seg(cur, b);
  }
  gapsTo(arr) { return arr; }

  // ---- lights / signs ----
  light(u, v, o = {}) {
    const w = o.w ?? 1.1, d = o.d ?? 0.5, y = this.Hc;
    this.lb('metal', 0x2a2f36, u - w / 2 - 0.05, u + w / 2 + 0.05, v - d / 2 - 0.05, v + d / 2 + 0.05, y - 0.06, y);
    this.lb('emis', o.col ?? 0xfff0c8, u - w / 2, u + w / 2, v - d / 2, v + d / 2, y - 0.09, y - 0.05);
    if (o.lamp !== false) { const p = this.P(u, v); (this.surf.roomLamps = this.surf.roomLamps || []).push({ x: p.x, y: this.H - 0.8, z: p.z, col: o.pool ?? 0xffe2b0 }); }
  }
  plaque(u, v, text, rot = 0, y = 2.62, w = 0.95, o = {}) {
    const p = this.P(u, v); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.25), new THREE.MeshBasicMaterial({ map: signTex(text, 192, 48, o.bg || '#1b2028', o.fg || '#ffd37a') }));
    m.position.set(p.x, y, p.z); m.rotation.y = this.rec.ry + rot; this.surf.root.add(m); return m;
  }
  poster(u, v, y, w, h, map, rot = 0) { const p = this.P(u, v); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map })); m.position.set(p.x, y, p.z); m.rotation.y = this.rec.ry + rot; this.surf.root.add(m); return m; }
  bars(u0, u1, v, gaps = [], o = {}) {   // jail bars along u at fixed v; gaps are open doorways
    const mat = getBarsMat(); const h = o.h ?? 2.5; let cur = u0; const gs = gaps.slice().sort((a, b) => a[0] - b[0]);
    const seg = (s0, s1) => { if (s1 - s0 < 0.05) return; const len = s1 - s0; const g = new THREE.PlaneGeometry(len, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i)); const p = this.P((s0 + s1) / 2, v); const m = new THREE.Mesh(g, mat); m.position.set(p.x, h / 2, p.z); m.rotation.y = this.rec.ry; this.surf.root.add(m); this.col(s0, s1, v - 0.05, v + 0.05, h); };
    for (const [c, w] of gs) { seg(cur, c - w / 2); this.lb('metal', 0x7c848e, c - w / 2 - 0.05, c + w / 2 + 0.05, v - 0.06, v + 0.06, h - 0.1, h + 0.05); cur = c + w / 2; }
    seg(cur, u1); this.lb('metal', 0x7c848e, u0, u1, v - 0.06, v + 0.06, h - 0.1, h);
  }
  // ---- items ----
  put(name, u, v, rot = 0, o = {}) {
    const fn = F[name]; if (!fn) throw new Error('unknown interior item ' + name);
    const it = new Item(this, u, v, rot, o.y || 0); const [w, d, h] = fn(it, o, this, this.r) || [0, 0, 0];
    if (h > 0 && !o.nocol) { const sw = Math.abs(Math.sin(rot)) > 0.5; this.solid(u, v, sw ? d : w, sw ? w : d, h); }
    if (name === 'bed' || name === 'bunk') {
      const sw = Math.abs(Math.sin(rot)) > 0.5; const n = name === 'bunk' ? 2 : (o.double ? 2 : 1); const p = this.P(u, v);
      this.beds.push({ u, v, n, x: p.x, z: p.z, side: this.P(u + (sw ? 0 : 0.9), v + (sw ? 0.9 : 0)) });
    }
    return [w, d, h];
  }
  art(u, v, y, w, h, col, rot = 0, kind = 'matte') { const it = new Item(this, u, v, rot, 0); it.box(col, 0, y, 0, w, h, 0.04, kind); }   // thin panel on a wall
  finish() { return this.bt.flush(this.surf.root); }
}

// ------------------------------------------------------------------ item library
const WOOD = 0x6a4a2e, DWOOD = 0x3e2a1a, LWOOD = 0x9a7a52, STEEL = 0x9aa0a8, DARK = 0x23272d, WHITE = 0xe8e6e0, CREAM = 0xe8e0cc;
const pick = (o, k, d) => o[k] ?? d;

function legs(it, w, d, h, col, t = 0.06, inset = 0.06) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) it.box(col, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), t, h, t); }

export const F = {
  // ---- sleeping ----
  bed(it, o) {
    const w = o.double ? 1.6 : 0.95, d = 2.1, sheet = o.sheet ?? 0xe8e4da, bl = o.blanket ?? 0x4a5a7a;
    it.box(WOOD, 0, 0.1, 0, w, 0.18, d); it.box(sheet, 0, 0.28, 0.02, w - 0.1, 0.2, d - 0.12); it.box(bl, 0, 0.46, 0.36, w - 0.08, 0.07, d * 0.62 - 0.1);
    const pw = o.double ? 0.62 : 0.5; for (const s of (o.double ? [-1, 1] : [0])) it.box(0xf2efe8, s * w * 0.24, 0.48, -d / 2 + 0.3, pw, 0.12, 0.38);
    it.box(DWOOD, 0, 0.1, -d / 2 + 0.03, w, 0.95, 0.06); return [w, d, 0.6];
  },
  bunk(it, o) {
    const w = 0.95, d = 2.1, sheet = o.sheet ?? 0xdcd8cc, bl = o.blanket ?? 0x4a5a7a, wood = o.frame ?? 0x5a4a3a;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) it.box(wood, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), 0.08, 1.85, 0.08);
    for (const y of [0.32, 1.17]) { it.box(wood, 0, y, 0, w, 0.06, d); it.box(sheet, 0, y + 0.06, 0.02, w - 0.1, 0.15, d - 0.12); it.box(bl, 0, y + 0.2, 0.4, w - 0.1, 0.05, d * 0.58); it.box(0xf0ede6, 0, y + 0.2, -d / 2 + 0.3, 0.5, 0.1, 0.36); }
    it.box(wood, w / 2 - 0.04, 1.45, 0, 0.04, 0.25, d - 0.1);   // guard rail
    for (let i = 0; i < 4; i++) it.box(wood, -w / 2 + 0.1, 0.25 + i * 0.3, d / 2 + 0.04, 0.05, 0.05, 0.05 + 0.0, 'matte'); // ladder pegs
    it.box(wood, -w / 2 + 0.1, 0.1, d / 2 + 0.04, 0.04, 1.3, 0.04);
    return [w, d + 0.1, 1.85];
  },
  cot(it, o) { it.box(0x4a5a3a, 0, 0.0, 0, 0.8, 0.4, 1.9, 'matte'); it.box(o.blanket ?? 0x7a6a4a, 0, 0.4, 0.2, 0.74, 0.08, 1.3); return [0.8, 1.9, 0.45]; },
  nightstand(it, o) { it.box(WOOD, 0, 0, 0, 0.5, 0.52, 0.42); it.box(DWOOD, 0, 0.3, 0.215, 0.4, 0.01, 0.01); it.cyl(0x2a2f36, 0.1, 0.52, 0, 0.07, 0.05); it.cyl(0xffe0a0, 0.1, 0.57, 0, 0.1, 0.18, 'emis', { top: 0.7 }); return [0.5, 0.42, 0.52]; },
  wardrobe(it, o) { it.box(o.col ?? 0x7a5a3a, 0, 0, 0, 1.2, 2.0, 0.6); it.box(DWOOD, 0, 0, 0.305, 0.02, 1.9, 0.01); it.box(0xcaa860, -0.08, 1.0, 0.31, 0.03, 0.2, 0.03); it.box(0xcaa860, 0.08, 1.0, 0.31, 0.03, 0.2, 0.03); return [1.2, 0.6, 2.0]; },
  locker(it, o) { const n = o.n || 1; const cols = o.col ?? 0x5d6e7e; for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.46; it.box(cols, x, 0, 0, 0.44, 1.85, 0.5, 'metal'); it.box(0x20262c, x, 1.4, 0.255, 0.3, 0.2, 0.01); it.box(0xd8dce0, x + 0.12, 0.95, 0.26, 0.03, 0.14, 0.03); } return [0.46 * n, 0.5, 1.85]; },
  footlocker(it, o) { it.box(o.col ?? 0x4a3a2a, 0, 0, 0, 0.9, 0.45, 0.5); it.box(0xcaa860, 0, 0.32, 0.255, 0.1, 0.06, 0.01); return [0.9, 0.5, 0.45]; },
  // ---- living ----
  sofa(it, o) { const c = o.col ?? 0x6a4a3a, w = o.w ?? 2.2; it.box(c, 0, 0.0, 0, w, 0.42, 0.9); it.box(c, 0, 0.42, -0.36, w, 0.45, 0.18); for (const s of [-1, 1]) it.box(c, s * (w / 2 - 0.1), 0.42, 0.05, 0.2, 0.25, 0.75); it.box(c, 0, 0.42, 0.1, w - 0.4, 0.14, 0.65); it.box(DARK, 0, 0, 0, w - 0.1, 0.08, 0.8); return [w, 0.95, 0.88]; },
  armchair(it, o) { const c = o.col ?? 0x4a5a4a; it.box(c, 0, 0, 0, 0.9, 0.42, 0.85); it.box(c, 0, 0.42, -0.34, 0.9, 0.45, 0.18); for (const s of [-1, 1]) it.box(c, s * 0.38, 0.42, 0.05, 0.16, 0.25, 0.7); it.box(c, 0, 0.42, 0.1, 0.6, 0.12, 0.62); return [0.9, 0.85, 0.88]; },
  coffee(it, o) { const w = o.w ?? 1.1, d = o.d ?? 0.6; it.box(WOOD, 0, 0.36, 0, w, 0.05, d); legs(it, w, d, 0.36, DWOOD, 0.05, 0.05); return [w, d, 0.42]; },
  tv(it, o) { it.box(DWOOD, 0, 0, 0, 1.5, 0.5, 0.45); it.box(0x101418, 0, 0.7, 0, 1.2, 0.7, 0.05, 'matte'); it.box(o.screen ?? 0x3a6a8a, 0, 0.73, 0.03, 1.12, 0.62, 0.01, 'emis'); it.box(DARK, 0, 0.5, 0, 0.3, 0.2, 0.15); return [1.5, 0.45, 1.1]; },
  bookshelf(it, o) { const w = o.w ?? 1.2; it.box(WOOD, 0, 0, 0, w, 2.0, 0.34); it.box(0x1c140c, 0, 0.05, -0.14, w - 0.1, 1.9, 0.04); for (const s of [-1, 1]) it.box(WOOD, s * (w / 2 - 0.02), 0, 0, 0.04, 2.0, 0.34); it.box(WOOD, 0, 1.95, 0, w, 0.05, 0.34); for (let l = 0; l < 5; l++) { it.box(WOOD, 0, 0.05 + l * 0.4, 0.02, w - 0.06, 0.04, 0.32); let x = -w / 2 + 0.1; while (x < w / 2 - 0.15) { const bw = 0.05 + Math.abs(Math.sin(x * 37 + l)) * 0.06; it.box([0x8a2a2a, 0x2a5a8a, 0x3a6a3a, 0xc8a040, 0x5a3a6a, 0xd8d0c0][Math.abs((x * 100 + l * 7) | 0) % 6], x + bw / 2, 0.09 + l * 0.4, 0.04, bw, 0.28 + Math.abs(Math.sin(x * 11)) * 0.05, 0.22); x += bw + 0.01; } } return [w, 0.34, 2.0]; },
  plant(it, o) { it.cyl(0x8a5a3a, 0, 0, 0, 0.22, 0.4, 'matte', { top: 0.8 }); it.sph(o.col ?? 0x3a7a3a, 0, 0.85, 0, 0.42, 'matte', { sy: 1.2 }); it.sph(0x2f6a30, 0.15, 1.15, 0.1, 0.28); return [0.5, 0.5, 1.4]; },
  floorlamp(it, o) { it.cyl(DARK, 0, 0, 0, 0.16, 0.04); it.cyl(DARK, 0, 0, 0, 0.025, 1.55); it.cyl(0xffe6b0, 0, 1.45, 0, 0.2, 0.3, 'emis', { top: 0.7 }); return [0.35, 0.35, 1.7]; },
  rugplain: null,
  // ---- dining / kitchen ----
  table(it, o) { const w = o.w ?? 1.8, d = o.d ?? 0.9, h = 0.76; if (o.round) { it.cyl(o.col ?? WOOD, 0, h - 0.05, 0, w / 2, 0.05, 'matte', { seg: 16 }); it.cyl(DWOOD, 0, 0, 0, 0.06, h - 0.05); it.cyl(DWOOD, 0, 0, 0, w / 4, 0.04); return [w, w, h]; } it.box(o.col ?? WOOD, 0, h - 0.05, 0, w, 0.05, d); legs(it, w, d, h - 0.05, DWOOD); return [w, d, h]; },
  chair(it, o) { const c = o.col ?? 0x7a5a3a; it.box(c, 0, 0.42, 0, 0.42, 0.05, 0.42); legs(it, 0.42, 0.42, 0.42, DWOOD, 0.04, 0.03); it.box(c, 0, 0.47, -0.19, 0.42, 0.45, 0.04); return [0.45, 0.45, 0]; },
  stool(it, o) { it.cyl(o.col ?? 0x3a2a1c, 0, 0.52, 0, 0.19, 0.05, 'matte', { seg: 10 }); it.cyl(STEEL, 0, 0, 0, 0.03, 0.52, 'metal'); it.cyl(STEEL, 0, 0, 0, 0.15, 0.03, 'metal'); return [0.4, 0.4, 0]; },
  counterrun(it, o) { const w = o.w ?? 2, d = 0.65; it.box(o.body ?? 0xe0dccc, 0, 0, 0, w, 0.86, d); it.box(o.top ?? 0x3a3f46, 0, 0.86, 0.01, w + 0.02, 0.05, d + 0.04); if (o.sink) { it.box(STEEL, 0, 0.88, 0.04, 0.6, 0.04, 0.4, 'metal'); it.box(0x20262c, 0, 0.9, 0.04, 0.5, 0.02, 0.32); it.cyl(STEEL, 0, 0.91, -0.22, 0.02, 0.28, 'metal'); } for (let i = 0; i < Math.floor(w / 0.5); i++) it.box(0x8a8a82, -w / 2 + 0.25 + i * 0.5, 0.45, d / 2 + 0.005, 0.38, 0.02, 0.01); return [w, d, 0.91]; },
  stove(it, o) { it.box(0xd8d8d8, 0, 0, 0, 0.9, 0.9, 0.65, 'metal'); it.box(0x14181c, 0, 0.9, 0.0, 0.9, 0.03, 0.65); for (const [x, z] of [[-0.2, -0.15], [0.2, -0.15], [-0.2, 0.15], [0.2, 0.15]]) it.cyl(0x40454c, x, 0.93, z, 0.1, 0.015); it.box(0x14181c, 0, 0.25, 0.331, 0.7, 0.45, 0.01); it.box(0xb0b4b8, 0, 0.62, 0.34, 0.6, 0.03, 0.03, 'metal'); it.box(0xc8c8c8, 0, 1.0, -0.25, 0.8, 0.3, 0.15, 'metal'); return [0.9, 0.65, 0.95]; },
  fridge(it, o) { it.box(o.col ?? 0xdfe3e6, 0, 0, 0, 0.85, 1.85, 0.72, 'metal'); it.box(0x2a2f36, 0, 1.2, 0.365, 0.8, 0.02, 0.01); it.box(0x8a9098, 0.34, 1.35, 0.375, 0.03, 0.4, 0.03, 'metal'); it.box(0x8a9098, 0.34, 0.5, 0.375, 0.03, 0.5, 0.03, 'metal'); return [0.85, 0.72, 1.85]; },
  island(it, o) { const w = o.w ?? 2.2, d = 0.95; it.box(0x6a5a4a, 0, 0, 0, w, 0.88, d); it.box(0xd8d4c8, 0, 0.88, 0, w + 0.1, 0.05, d + 0.1); return [w + 0.1, d + 0.1, 0.93]; },
  // ---- bathroom ----
  toilet(it, o) { it.box(WHITE, 0, 0, -0.08, 0.38, 0.4, 0.5, 'metal'); it.box(WHITE, 0, 0.4, -0.25, 0.4, 0.4, 0.2, 'metal'); it.box(0xf6f6f2, 0, 0.4, 0.0, 0.4, 0.04, 0.45); return [0.42, 0.65, 0.8]; },
  basin(it, o) { it.box(WHITE, 0, 0.8, 0, 0.55, 0.12, 0.42, 'metal'); it.box(0xcfd4d8, 0, 0.2, -0.12, 0.12, 0.6, 0.12); it.cyl(STEEL, 0, 0.92, -0.14, 0.02, 0.18, 'metal'); it.box(0xa8d0e8, 0, 1.1, -0.2, 0.6, 0.8, 0.02, 'glass'); return [0.6, 0.45, 1.0]; },
  shower(it, o) { it.box(0xc8ccd0, 0, 0, 0, 1.0, 0.1, 1.0); it.box(0xa8d0e8, 0.5, 0.1, 0, 0.03, 1.9, 1.0, 'glass'); it.box(0xa8d0e8, 0, 0.1, 0.5, 1.0, 1.9, 0.03, 'glass'); it.cyl(STEEL, -0.4, 0.8, -0.45, 0.02, 1.2, 'metal'); it.cyl(STEEL, -0.35, 2.0, -0.4, 0.12, 0.03, 'metal'); return [1.0, 1.0, 2.0]; },
  washer(it, o) { it.box(0xe4e6e8, 0, 0, 0, 0.7, 0.95, 0.68, 'metal'); it.cyl(0x2a3a4a, 0, 0.35, 0.34, 0.22, 0.02, 'matte', { rx: Math.PI / 2 }); it.box(0x3a4a5a, 0.18, 0.85, 0.34, 0.2, 0.06, 0.01); return [0.7, 0.68, 0.95]; },
  // ---- office / lab / utility ----
  desk(it, o) { const w = o.w ?? 1.5, d = 0.75; it.box(o.col ?? 0x7a6a56, 0, 0.72, 0, w, 0.05, d); it.box(0x5a4a3a, -w / 2 + 0.25, 0, 0, 0.45, 0.72, d - 0.05); it.box(0x5a4a3a, w / 2 - 0.04, 0, 0, 0.04, 0.72, d - 0.05); if (o.screen !== false) { it.box(0x15191d, 0.1, 0.77, -0.15, 0.6, 0.36, 0.04, 'matte', { rx: -0.08 }); it.box(o.screen ?? 0x4fd1ff, 0.1, 0.8, -0.125, 0.54, 0.3, 0.01, 'emis', { rx: -0.08 }); it.box(DARK, 0.1, 0.77, -0.15, 0.08, 0.1, 0.08); it.box(0x2a2f36, 0.1, 0.77, 0.1, 0.45, 0.02, 0.15); } return [w, d, 0.77]; },
  cabinet(it, o) { it.box(o.col ?? 0x8a9098, 0, 0, 0, 0.5, 1.3, 0.6, 'metal'); for (let i = 0; i < 3; i++) { it.box(0x6a7078, 0, 0.1 + i * 0.4, 0.305, 0.44, 0.34, 0.01); it.box(0xd8dce0, 0, 0.3 + i * 0.4, 0.315, 0.12, 0.03, 0.02); } return [0.5, 0.6, 1.3]; },
  workbench(it, o) { const w = o.w ?? 2.4, d = 0.85; it.box(0x7a5a38, 0, 0.88, 0, w, 0.07, d); it.box(0x40454c, 0, 0.0, 0, w - 0.1, 0.1, d - 0.1); for (const s of [-1, 1]) it.box(0x40454c, s * (w / 2 - 0.1), 0, 0, 0.08, 0.88, d - 0.1, 'metal'); it.box(0x5a4a3a, 0, 0.3, 0, w - 0.3, 0.04, d - 0.2);
    it.box(0x6a7078, 0.4, 0.95, 0.05, 0.22, 0.12, 0.2, 'metal'); it.box(0xb02a2a, -0.5, 0.95, 0.1, 0.12, 0.12, 0.2); it.box(0xb8bcc2, 0, 0.955, 0.2, 0.6, 0.02, 0.1, 'metal'); it.box(0x6a4a2e, -0.9, 0.95, 0.0, 0.3, 0.1, 0.2);
    it.box(0x8a6a44, 0, 1.15, -d / 2 + 0.02, w, 0.9, 0.03); for (let i = 0; i < 6; i++) it.box(STEEL, -w / 2 + 0.3 + i * (w - 0.6) / 5, 1.3 + (i % 2) * 0.3, -d / 2 + 0.07, 0.04, 0.3 + (i % 3) * 0.08, 0.04, 'metal'); return [w, d, 0.95]; },
  lathe(it, o) { it.box(0x3a5a7a, 0, 0, 0, 2.0, 0.9, 0.7, 'metal'); it.box(0x8a9098, 0, 0.9, 0, 1.9, 0.12, 0.5, 'metal'); it.box(0x20262c, -0.7, 0.95, 0.05, 0.4, 0.4, 0.4); it.cylc(0xb8bcc2, 0.0, 1.1, 0.05, 0.06, 1.0, 'x', 'metal'); it.box(0xc84a2a, 0.75, 1.0, 0.25, 0.2, 0.3, 0.2); return [2.0, 0.7, 1.4]; },
  anvil(it, o) { it.cyl(0x5a4028, 0, 0, 0, 0.28, 0.5, 'matte', { top: 0.8 }); it.box(0x30343a, 0, 0.5, 0, 0.7, 0.14, 0.26, 'metal'); it.box(0x30343a, 0.42, 0.52, 0, 0.2, 0.08, 0.14, 'metal'); return [0.7, 0.4, 0.65]; },
  forge(it, o) { it.box(0x7a4a3a, 0, 0, 0, 1.6, 1.0, 1.0); it.box(0x20120c, 0, 0.85, 0.1, 1.2, 0.2, 0.7); it.box(0xff7a2a, 0, 0.9, 0.1, 1.0, 0.04, 0.5, 'emis'); it.box(0x7a4a3a, 0, 1.0, -0.35, 1.0, 1.9, 0.3); it.box(0x20262c, 0, 1.9, -0.35, 0.7, 0.9, 0.2, 'metal'); return [1.6, 1.0, 1.0]; },
  press(it, o) { it.box(0xc84a2a, 0, 0, 0, 0.6, 0.9, 0.5, 'metal'); it.box(0x40454c, 0, 0.9, -0.1, 0.2, 0.7, 0.2, 'metal'); it.box(0xb8bcc2, 0, 1.2, 0.12, 0.1, 0.5, 0.1, 'metal'); return [0.6, 0.5, 1.6]; },
  grinder(it, o) { it.cyl(0x40454c, 0, 0, 0, 0.14, 0.95, 'metal'); it.cylc(0x888a90, 0, 1.05, 0, 0.22, 0.08, 'x', 'metal'); it.box(0x40454c, 0, 0.9, 0, 0.5, 0.15, 0.3, 'metal'); return [0.5, 0.4, 1.3]; },
  crates(it, o) { const r = o.r; const n = o.n || 3; const cols = [0x8a6a3e, 0x7a5a30, 0x9a7a48, 0x4a5a3a]; let h = 0; const s = o.s || 0.8; for (let i = 0; i < n; i++) { const x = i === 0 ? 0 : (i === 1 ? s * 0.9 : s * 0.1), y = i === 2 ? s : 0; const z = i === 2 ? 0 : 0; it.box(cols[(i + (o.k || 0)) % 4], x, y, z, s, s, s, 'matte', { ry: i * 0.12 }); it.box(0x4a3418, x, y + s * 0.45, z, s + 0.02, 0.06, s + 0.02, 'matte', { ry: i * 0.12 }); } return [s * 2, s, s * (n > 2 ? 2 : 1)]; },
  barrel(it, o) { it.cyl(o.col ?? 0x6a4a2e, 0, 0, 0, 0.34, 0.9, 'matte', { seg: 12 }); for (const y of [0.15, 0.7]) it.cyl(0x30343a, 0, y, 0, 0.35, 0.04, 'metal', { seg: 12 }); return [0.7, 0.7, 0.9]; },
  keg(it, o) { it.cylc(o.col ?? 0x5a4028, 0, 0.42, 0, 0.4, 0.9, 'z', 'matte', { seg: 12 }); for (const z of [-0.28, 0.28]) it.cylc(0x30343a, 0, 0.42, z, 0.415, 0.05, 'z', 'metal', { seg: 12 }); it.cyl(STEEL, 0, 0.3, 0.47, 0.03, 0.12, 'metal'); return [0.82, 0.92, 0.82]; },
  drum(it, o) { it.cyl(o.col ?? 0xc8422a, 0, 0, 0, 0.3, 0.9, 'metal', { seg: 12 }); for (const y of [0.2, 0.7]) it.cyl(0x8a2a1a, 0, y, 0, 0.31, 0.03, 'metal', { seg: 12 }); return [0.62, 0.62, 0.9]; },
  rack(it, o) {    // pallet racking: uprights + shelves with boxes
    const w = o.w ?? 2.4, d = 0.7, lv = o.levels ?? 3, hh = 0.55 + lv * 0.62; const r = o.r;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) it.box(0x2a5a8a, sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04), 0.07, hh, 0.07, 'metal');
    const cols = o.goods ?? [0xb98c52, 0x8a6a3a, 0xa04a3a, 0x3a6aa0, 0x5a7a4a];
    for (let l = 0; l < lv; l++) { const y = 0.15 + l * 0.62; it.box(0xd8782a, 0, y, 0, w, 0.06, d, 'metal'); let x = -w / 2 + 0.1; let k = 0; while (x < w / 2 - 0.35) { const bw = 0.3 + ((k * 37 + l * 11) % 5) * 0.05; if (((k * 13 + l * 7) % 7) !== 0) it.box(cols[(k + l) % cols.length], x + bw / 2, y + 0.06, ((k + l) % 3 - 1) * 0.05, bw, 0.28 + ((k * 7) % 4) * 0.05, 0.4); x += bw + 0.06; k++; } }
    return [w, d, hh];
  },
  shelf(it, o) {   // retail shelf unit with goods ('goods' = array of kinds: 'box','cyl','ore','bottle')
    const len = o.len ?? 3, lv = o.levels ?? 3, goods = o.goods ?? ['box']; const rr = o.r || Math.random;
    for (const s of [-1, 1]) it.box(WOOD, s * len / 2, 0, 0, 0.06, lv * 0.5 + 0.2, 0.4);
    it.box(0x2a1c10, 0, 0.08, -0.18, len, lv * 0.5 + 0.1, 0.03);
    for (let l = 0; l < lv; l++) {
      it.box(WOOD, 0, 0.2 + l * 0.5, 0, len, 0.05, 0.4);
      for (let i = 0; i < Math.floor(len / 0.3); i++) {
        if (rr() < 0.18) continue; const g = goods[(i + l) % goods.length]; const x = -len / 2 + 0.2 + i * 0.3, y = 0.25 + l * 0.5;
        if (g === 'box') it.box([0xb98c52, 0x8a6a3a, 0xa04a3a, 0x3a6aa0, 0x3a8a5a][(i * 3 + l) % 5], x, y, 0, 0.22, 0.16 + (i % 3) * 0.05, 0.18);
        else if (g === 'cyl') it.cyl([0xdcdcdc, 0x58b4ff, 0x9fe8ff][(i + l) % 3], x, y, 0, 0.07, 0.26, 'metal');
        else if (g === 'ore') it.sph([0x8a6a58, 0xc27a4a, 0x9aa3b5, 0x3b6fd6, 0xe0314b][(i * 2 + l) % 5], x, y + 0.1, 0, 0.1, 'metal', { seg: 5 });
        else if (g === 'bottle') it.cyl([0x2a6a3a, 0x7a3a1a, 0x8aaacc, 0xaa6a1a][(i + l) % 4], x, y, 0, 0.045, 0.3, 'glass');
        else if (g === 'cloth') it.box([0x3a4a6a, 0x6a3a3a, 0x4a6a4a, 0x8a7a5a, 0x2a2f36][(i + l) % 5], x, y, 0, 0.26, 0.1 + (i % 2) * 0.05, 0.3);
      }
    }
    return [len, 0.4, lv * 0.5 + 0.2];
  },
  glasscase(it, o) { const w = o.w ?? 2.0, d = 0.65; it.box(0x3a3f46, 0, 0, 0, w, 0.5, d); it.box(0xa8d0e8, 0, 0.5, 0, w, 0.5, d, 'glass'); it.box(0x20262c, 0, 0.5, 0, w, 0.03, d - 0.04); it.box(0x3a3f46, 0, 1.0, 0, w + 0.04, 0.05, d + 0.04); const gd = o.goods; if (gd === 'ore') for (let i = 0; i < 6; i++) it.sph([0xc27a4a, 0x3b6fd6, 0xe0314b, 0x9aa3b5][i % 4], -w / 2 + 0.25 + i * (w - 0.5) / 5, 0.6, 0, 0.09, 'metal', { seg: 5 }); else if (gd === 'gun') for (let i = 0; i < 3; i++) it.box(0x2a2f36, -w / 3 + i * w / 3, 0.53, 0, 0.5, 0.05, 0.14, 'metal'); return [w + 0.04, d + 0.04, 1.05]; },
  safe(it, o) { it.box(0x3a4048, 0, 0, 0, 0.95, 1.2, 0.8, 'metal'); it.box(0x20262c, 0, 0.1, 0.405, 0.78, 1.0, 0.02); it.cyl(0xc8b060, 0, 0.55, 0.43, 0.1, 0.04, 'metal', { rx: Math.PI / 2 }); return [0.95, 0.8, 1.2]; },
  depositwall(it, o) {   // safe-deposit box wall, faces +z
    const w = o.w ?? 3, h = o.h ?? 2.4; it.box(0x4a5058, 0, 0, 0, w, h, 0.3, 'metal');
    for (let i = 0; i < Math.floor(w / 0.38); i++) for (let j = 0; j < Math.floor(h / 0.3); j++) { const x = -w / 2 + 0.22 + i * 0.38, y = 0.08 + j * 0.3; it.box(0x6a7078, x, y, 0.152, 0.34, 0.26, 0.01, 'metal'); it.box(0xcaa860, x, y + 0.11, 0.165, 0.05, 0.04, 0.02, 'metal'); }
    return [w, 0.3, h];
  },
  vaultdoor(it, o) { it.cylc(0x6a7078, 0, 1.15, 0, 1.05, 0.28, 'z', 'metal', { seg: 24 }); it.cylc(0x8a9098, 0, 1.15, 0.16, 0.8, 0.06, 'z', 'metal', { seg: 24 }); it.cylc(0xc8b060, 0, 1.15, 0.22, 0.22, 0.1, 'z', 'metal'); for (let i = 0; i < 4; i++) it.box(0xc8b060, 0, 1.15, 0.22, 1.5, 0.07, 0.07, 'metal', { rz: i * Math.PI / 4 }); return [0, 0, 0]; },
  labbench(it, o) { const w = o.w ?? 2.6; it.box(0x5a6068, 0, 0, 0, w, 0.88, 0.8, 'metal'); it.box(0x20262c, 0, 0.88, 0, w + 0.04, 0.05, 0.84); for (let i = 0; i < 4; i++) it.cyl([0xa8d0e8, 0xe8c070, 0xa0e0a0, 0xe0a0a0][i], -w / 2 + 0.3 + i * 0.35, 0.93, 0.05, 0.06, 0.18 + (i % 2) * 0.06, 'glass', { top: 0.6 }); it.box(0xcfd4d8, w / 2 - 0.45, 0.93, 0.0, 0.2, 0.3, 0.25, 'metal'); it.cylc(0x30343a, w / 2 - 0.45, 1.2, 0.02, 0.05, 0.2, 'z', 'metal'); it.box(0xff9a3a, 0.4, 0.93, 0.1, 0.4, 0.12, 0.3, 'metal'); return [w, 0.8, 0.95]; },
  scale(it, o) { it.box(STEEL, 0, 0, 0, 0.55, 0.1, 0.4, 'metal'); it.cyl(STEEL, 0, 0.1, 0, 0.18, 0.04, 'metal'); it.box(0x14181c, 0, 0.14, 0.15, 0.2, 0.06, 0.03); it.box(0x7dd86a, 0, 0.15, 0.17, 0.14, 0.03, 0.01, 'emis'); return [0.55, 0.4, 0.2]; },
  // ---- shop / display ----
  clothrack(it, o) { const r = o.r || Math.random; it.cyl(STEEL, 0, 0, 0, 0.3, 0.03, 'metal'); it.cyl(STEEL, 0, 0, 0, 0.025, 1.6, 'metal'); it.cyl(STEEL, 0, 1.5, 0, 0.62, 0.025, 'metal', { seg: 16 }); const cols = [0x3a4a6a, 0x6a3a3a, 0x4a6a4a, 0x8a7a5a, 0xc8a040, 0x5a3a6a, 0x2a2f36]; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; it.box(cols[(i * 5 + (o.k || 0)) % cols.length], Math.cos(a) * 0.5, 0.75, Math.sin(a) * 0.5, 0.06 + 0.1 * Math.abs(Math.sin(a)), 0.75, 0.1 + 0.1 * Math.abs(Math.cos(a)), 'matte', { ry: -a }); } return [1.3, 1.3, 1.6]; },
  mannequin(it, o) { it.cyl(DARK, 0, 0, 0, 0.25, 0.03); it.cyl(STEEL, 0, 0, 0, 0.02, 0.8, 'metal'); it.cyl(o.col ?? 0x3a4a3a, 0, 0.8, 0, 0.18, 0.55, 'matte', { top: 1.15 }); it.cyl(o.col2 ?? 0x2a2f36, 0, 0.35, 0, 0.14, 0.5, 'matte'); it.sph(0xd8d0c4, 0, 1.55, 0, 0.1); for (const s of [-1, 1]) it.cyl(o.col ?? 0x3a4a3a, s * 0.24, 0.85, 0, 0.04, 0.5); return [0.5, 0.5, 1.7]; },
  fitting(it, o) {   // fitting cubicle furniture (mirror, bench, hooks); faces +z
    it.box(0xa8d0e8, 0, 0.5, -0.0, 0.8, 1.5, 0.03, 'glass'); it.box(0x5a4a3a, 0, 0, 0.0, 0.8, 0.45, 0.35); it.box(0xcaa860, -0.3, 1.9, 0.02, 0.04, 0.04, 0.06); it.box(0xcaa860, 0.3, 1.9, 0.02, 0.04, 0.04, 0.06); return [0.8, 0.35, 0.45];
  },
  curtain(it, o) { it.box(o.col ?? 0x7a2a3a, 0, 0.1, 0, o.w ?? 0.55, 2.1, 0.05); it.cylc(STEEL, 0, 2.22, 0, 0.02, (o.w ?? 0.55) + 0.2, 'x', 'metal'); return [0, 0, 0]; },
  bench(it, o) { const w = o.w ?? 2.2; it.box(o.col ?? 0x3a3f46, 0, 0.42, 0, w, 0.06, 0.5, o.metal ? 'metal' : 'matte'); for (const s of [-1, 1]) it.box(DARK, s * (w / 2 - 0.08), 0, 0, 0.06, 0.42, 0.45); if (o.back) it.box(o.col ?? 0x3a3f46, 0, 0.5, -0.22, w, 0.4, 0.05); return [w, 0.5, 0.45]; },
  booth(it, o) {   // wall booth: back bench + table + two stools; faces +z (away from wall)
    const c = o.col ?? 0x7a2a3a; it.box(c, 0, 0, -0.85, 2.0, 0.42, 0.55); it.box(c, 0, 0.42, -1.08, 2.0, 0.5, 0.12); it.box(DWOOD, 0, 0.76, -0.1, 1.5, 0.05, 0.8); it.cyl(DWOOD, 0, 0, -0.1, 0.06, 0.76);
    for (const s of [-0.5, 0.5]) { it.cyl(0x3a2a1c, s, 0, 0.7, 0.19, 0.5); } it.cyl(0xe8d098, 0.2, 0.81, -0.1, 0.06, 0.18, 'glass'); return [2.0, 2.4, 0.95];
  },
  pooltable(it, o) { it.box(0x3a2418, 0, 0.0, 0, 2.7, 0.8, 1.5); it.box(0x2a7a4a, 0, 0.8, 0, 2.4, 0.05, 1.2); for (const [x, z] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7], [0, -0.72], [0, 0.72]]) it.cyl(0x101010, x, 0.8, z, 0.07, 0.07); for (let i = 0; i < 6; i++) it.sph([0xe84a2a, 0xe8d03a, 0x2a4ac8, 0xf0f0f0][i % 4], 0.5 + (i % 3) * 0.12, 0.88, -0.1 + Math.floor(i / 3) * 0.12, 0.035); return [2.8, 1.6, 0.85]; },
  jukebox(it, o) { it.box(0x7a2a3a, 0, 0, 0, 0.95, 1.5, 0.6, 'metal'); it.cylc(0x2a2f36, 0, 1.45, 0.0, 0.47, 0.58, 'z', 'metal'); it.box(0xffb84a, 0, 0.8, 0.31, 0.6, 0.4, 0.01, 'emis'); it.box(0x6ad0ff, 0, 1.2, 0.31, 0.5, 0.12, 0.01, 'emis'); return [0.95, 0.6, 1.9]; },
  speaker(it, o) { it.box(0x1c1f24, 0, 0, 0, 0.6, 1.2, 0.5); it.cyl(0x40454c, 0, 0.25, 0.26, 0.2, 0.02, 'metal', { rx: Math.PI / 2 }); it.cyl(0x40454c, 0, 0.85, 0.26, 0.12, 0.02, 'metal', { rx: Math.PI / 2 }); return [0.6, 0.5, 1.2]; },
  drumkit(it, o) { it.cyl(0x8a2a2a, 0, 0.0, 0, 0.35, 0.5, 'matte', { seg: 14 }); it.cyl(0x8a2a2a, -0.55, 0.45, 0.25, 0.22, 0.25, 'matte', { seg: 12 }); it.cyl(0x8a2a2a, 0.55, 0.45, 0.25, 0.22, 0.25, 'matte', { seg: 12 }); it.cyl(0xd8c060, -0.9, 0.9, 0.0, 0.25, 0.015, 'metal', { seg: 14 }); it.cyl(0xd8c060, 0.9, 0.9, 0.0, 0.25, 0.015, 'metal', { seg: 14 }); it.cyl(STEEL, -0.9, 0, 0, 0.012, 0.9, 'metal'); it.cyl(STEEL, 0.9, 0, 0, 0.012, 0.9, 'metal'); it.cyl(0x3a2a1c, 0, 0, -0.9, 0.2, 0.5); return [2.2, 1.8, 0.7]; },
  micstand(it, o) { it.cyl(DARK, 0, 0, 0, 0.18, 0.03); it.cyl(DARK, 0, 0, 0, 0.012, 1.5); it.sph(0x30343a, 0, 1.55, 0.05, 0.05); return [0.3, 0.3, 0]; },
  kiosk(it, o) { it.box(0x2a2f38, 0, 0, 0, 0.7, 1.05, 0.5, 'metal'); it.box(0x101418, 0, 1.0, 0.0, 0.62, 0.45, 0.06, 'matte', { rx: -0.35 }); it.box(o.screen ?? 0x7dd86a, 0, 1.02, 0.03, 0.54, 0.38, 0.01, 'emis', { rx: -0.35 }); return [0.7, 0.5, 1.4]; },
  vending(it, o) { it.box(o.col ?? 0x2a5a8a, 0, 0, 0, 0.9, 1.85, 0.8, 'metal'); it.box(0xa8d0e8, -0.1, 0.5, 0.405, 0.55, 1.1, 0.01, 'glass'); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) it.box([0xc8422a, 0xe8c030, 0x3a8a5a, 0x3a6aa0][(i + j) % 4], -0.3 + j * 0.2, 0.6 + i * 0.25, 0.39, 0.12, 0.16, 0.04); it.box(0x14181c, 0.32, 1.0, 0.41, 0.18, 0.5, 0.01); return [0.9, 0.8, 1.85]; },
  coffeestn(it, o) { it.box(WOOD, 0, 0, 0, 1.2, 0.85, 0.55); it.box(0x2a2f36, -0.25, 0.85, 0, 0.35, 0.4, 0.35, 'metal'); it.box(0xe8e4da, 0.25, 0.85, 0.05, 0.3, 0.1, 0.3); for (const x of [0.15, 0.3, 0.45]) it.cyl(0xf0eee8, x - 0.0, 0.95, 0.05, 0.04, 0.08); return [1.2, 0.55, 1.25]; },
  poolsign: null,
  ladder(it, o) { for (const s of [-1, 1]) it.box(0xc8a040, s * 0.25, 0, 0, 0.04, 1.8, 0.04, 'metal', { rx: -0.2 }); for (let i = 0; i < 6; i++) it.box(0xc8a040, 0, 0.25 + i * 0.28, -0.08 - i * 0.056 + 0.0, 0.5, 0.03, 0.04, 'metal'); return [0.6, 0.5, 1.8]; },
  paint(it, o) { for (let i = 0; i < (o.n || 3); i++) { it.cyl([0xc8c0b0, 0x3a6a8a, 0x8a3a2a][i % 3], (i % 2) * 0.3, 0, (i >> 1) * 0.3, 0.12, 0.22, 'metal'); } return [0.7, 0.5, 0.25]; },
  dust(it, o) { it.box(0xc9c8c0, 0, 0, 0, o.w ?? 1.2, o.h ?? 0.8, o.d ?? 0.8, 'matte', { ry: 0.2 }); return [o.w ?? 1.2, o.d ?? 0.8, o.h ?? 0.8]; },
  target(it, o) { it.box(0x3a3f46, 0, 0, 0, 0.06, 1.3, 0.06, 'metal'); it.box(0xe8e4d0, 0, 0.6, 0.05, 0.6, 1.0, 0.02); it.cyl(0xc82a2a, 0, 0.9, 0.065, 0.2, 0.01, 'matte', { rx: Math.PI / 2 }); it.cyl(0xe8e4d0, 0, 0.9, 0.07, 0.12, 0.01, 'matte', { rx: Math.PI / 2 }); it.cyl(0xc82a2a, 0, 0.9, 0.075, 0.05, 0.01, 'matte', { rx: Math.PI / 2 }); return [0.7, 0.2, 0]; },
  boothrail(it, o) { const w = o.w ?? 1.4; it.box(0x3a3f46, 0, 0, 0, w, 1.0, 0.45, 'metal'); it.box(0x20262c, 0, 1.0, 0, w + 0.06, 0.05, 0.5); return [w, 0.5, 1.05]; },
  sandbags(it, o) { for (let j = 0; j < 3; j++) for (let i = 0; i < 4 - j; i++) it.box(0x9a8a60, -0.6 + j * 0.15 + i * 0.32, j * 0.17, 0, 0.3, 0.16, 0.22, 'matte', { ry: (i + j) * 0.1 }); return [1.3, 0.3, 0.5]; },
  gunrack(it, o) {   // wall rack of long guns; faces +z
    const w = o.w ?? 3.4; it.box(0x4a3a2a, 0, 0.9, 0, w, 1.3, 0.05); for (const y of [1.25, 1.75]) it.box(0x2a2018, 0, y, 0.05, w, 0.05, 0.06);
    for (let i = 0; i < Math.floor(w / 0.36); i++) { const x = -w / 2 + 0.25 + i * 0.36; for (const y of [1.0, 1.5]) { it.box(0x20242a, x, y - 0.0, 0.1, 0.05, 0.62 + (i % 2) * 0.1, 0.05, 'metal'); it.box(0x6a4a2e, x, y - 0.38, 0.1, 0.07, 0.22, 0.06); } } return [w, 0.2, 2.2];
  },
  clockface(it, o) { it.cyl(0x2a2f36, 0, 1.8, 0.02, 0.2, 0.04, 'matte', { rx: Math.PI / 2 }); it.cyl(0xf0eee0, 0, 1.8, 0.045, 0.17, 0.01, 'matte', { rx: Math.PI / 2 }); return [0, 0, 0]; },
  noticeboard(it, o) { const w = o.w ?? 1.8; it.box(0x5a4028, 0, 1.0, 0, w + 0.1, 1.2, 0.04); it.box(0xb89a68, 0, 1.05, 0.03, w, 1.1, 0.02); for (let i = 0; i < 7; i++) it.box([0xf2efe0, 0xe8d890, 0xd8e0e8][i % 3], -w / 2 + 0.2 + (i * 0.23) % (w - 0.3), 1.2 + ((i * 3) % 4) * 0.2, 0.05, 0.17, 0.22, 0.01); return [0, 0, 0]; },
  cellstuff(it, o) { it.box(0xa8acb2, 0, 0, 0, 0.45, 0.4, 0.4, 'metal'); it.box(0xa8acb2, 0, 0.4, -0.1, 0.4, 0.4, 0.15, 'metal'); it.box(0xa8acb2, 0.5, 0.6, 0, 0.4, 0.2, 0.3, 'metal'); return [1.0, 0.4, 0.9]; },
  flag(it, o) { it.cyl(STEEL, 0, 0, 0, 0.04, 3.0, 'metal'); it.cyl(0xc8b060, 0, 3.0, 0, 0.06, 0.08, 'metal'); it.box(o.col ?? 0x1d2c6a, 0.5, 1.9, 0, 0.95, 0.6, 0.02); it.box(0xe8e4d0, 0.25, 2.05, 0.015, 0.2, 0.2, 0.01); return [0.2, 0.2, 3]; },
  stanchion(it, o) { it.cyl(0xc8b060, 0, 0, 0, 0.14, 0.03, 'metal'); it.cyl(0xc8b060, 0, 0, 0, 0.025, 0.95, 'metal'); it.sph(0xc8b060, 0, 0.97, 0, 0.05, 'metal'); return [0.3, 0.3, 0]; },
  pedestal(it, o) { it.cyl(0x9a9a92, 0, 0, 0, 0.3, 0.9, 'matte', { seg: 12, top: 0.8 }); it.cyl(0xd8d4c8, 0, 0.9, 0, 0.34, 0.05, 'matte', { seg: 12 }); it.sph(o.col ?? 0xc27a4a, 0, 1.08, 0, 0.14, 'metal', { seg: 5 }); return [0.7, 0.7, 0.95]; },
  mirror(it, o) { it.box(0x3a2a1c, 0, 1.0, 0, o.w ?? 1.0, o.h ?? 1.4, 0.04); it.box(0xa8d0e8, 0, 1.05, 0.03, (o.w ?? 1.0) - 0.1, (o.h ?? 1.4) - 0.1, 0.01, 'glass'); return [0, 0, 0]; },
};
delete F.rugplain; delete F.poolsign;

// one shared material for the inside face of every window: white glass + dark frame/mullions, tinted by Surface.timeOfDay() to match sky/night
let _iw = null;
export function innerWindowMat() {
  if (_iw) return _iw;
  const c = document.createElement('canvas'); c.width = 140; c.height = 170; const x = c.getContext('2d');
  x.fillStyle = '#34383e'; x.fillRect(0, 0, 140, 170); x.fillStyle = '#ffffff'; x.fillRect(10, 10, 120, 150);
  x.fillStyle = '#34383e'; x.fillRect(67, 10, 6, 150); x.fillRect(10, 82, 120, 6);
  x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(10, 10, 120, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return _iw = new THREE.MeshBasicMaterial({ map: t, color: 0xa9cdee });
}
