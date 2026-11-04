// Wall styles for wallkit.js. Each style = { base(f,s0,s1,Q): continuous run parts (backing, skirting, rail, crown, pipe lanes),
// panel(f,a,b,Q,m): the plates of one 1-2 m module, feature(f,a,b,Q,m): one weighted prop piece for the module }.
// Frame: s along the wall, y up, d out of the wall. Everything protrudes <= 0.25 m; nothing is coplanar with the wall or with a neighbour.
import * as THREE from '../vendor/three.module.js';

const _c = new THREE.Color(), _d = new THREE.Color();
const sh = (c, k) => _c.set(c).multiplyScalar(k).getHex();
const mix = (a, b, t) => { _d.set(b); return _c.set(a).lerp(_d, t).getHex(); };
const jit = (c, r, a = 0.05) => sh(c, 1 + (r() - 0.5) * 2 * a);
const WIRES = [0xc83a2a, 0x2a5ac8, 0xe0b020, 0x1c1c20, 0x2aa84a, 0xd8d8d0, 0xc86a1a];

// ------------------------------------------------------------------ shared building blocks
function backing(f, s0, s1, Q, col, y0 = Q.yl) { f.box('matte', sh(col, 0.4), s0, s1, y0, Q.yu1, -0.04, 0.006); }
function skirt(f, s0, s1, col, h = 0.14) { f.box('metal', col, s0, s1, 0, h, -0.01, 0.04); f.box('metal', sh(col, 1.25), s0, s1, h, h + 0.012, -0.01, 0.046); }
function rail(f, s0, s1, Q, col, glow) { f.box('matte', col, s0, s1, Q.yr0, Q.yr1, -0.01, 0.032); if (glow != null) f.box('emis', glow, s0, s1, 1.06, 1.08, 0.032, 0.036); }
function crown(f, s0, s1, Q, col, glow) { f.box('matte', col, s0, s1, Q.yu1, Q.top, -0.01, 0.05); if (glow != null) f.box('emis', glow, s0, s1, Q.yu1 + 0.04, Q.yu1 + 0.08, 0.05, 0.054); }
function brackets(f, s0, s1, y, d, r, col) { for (let s = Math.ceil(s0) + 0.02; s < s1; s += 1) if (s > s0 + 0.04) f.box('metal', col, s - 0.025, s + 0.025, y - r - 0.03, y + r + 0.03, 0.0, d); }
function tray(f, s0, s1, y, Q) {   // cable tray with cable bundles along it
  f.box('metal', 0x3a3f46, s0, s1, y, y + 0.02, 0.02, 0.22); f.box('metal', 0x3a3f46, s0, s1, y, y + 0.1, 0.2, 0.22); f.box('metal', 0x3a3f46, s0, s1, y, y + 0.1, 0.02, 0.04); brackets(f, s0, s1, y, 0.04, 0.0, 0x2a2e34);
  for (let i = 0; i < 4; i++) f.cylS('matte', Q.r.pick(WIRES), s0 + 0.03, s1 - 0.03, y + 0.045, 0.06 + i * 0.04, 0.018, 6);
}
function monitor(f, s, y, w, h, variant, mode = 0) {
  const b = 0.03; f.box('metal', 0x1a1c20, s - w / 2 - b, s - w / 2, y - h / 2 - b, y + h / 2 + b, 0, 0.05); f.box('metal', 0x1a1c20, s + w / 2, s + w / 2 + b, y - h / 2 - b, y + h / 2 + b, 0, 0.05);
  f.box('metal', 0x1a1c20, s - w / 2, s + w / 2, y + h / 2, y + h / 2 + b, 0, 0.05); f.box('metal', 0x1a1c20, s - w / 2, s + w / 2, y - h / 2 - b, y - h / 2, 0, 0.05);
  f.box('matte', 0x050608, s - w / 2, s + w / 2, y - h / 2, y + h / 2, 0, 0.034); f.screen(s, y, w, h, variant, mode, 0.036);
}
function lampBar(f, s, y0, y1, col, Q, flick) { f.box('metal', 0x30343a, s - 0.05, s + 0.05, y0 - 0.02, y1 + 0.02, 0, 0.03); if (flick) f.led(s, (y0 + y1) / 2, 0.06, y1 - y0, col, 3, 0.6 + Q.r() * 0.8, Q.r(), 0.03, 0.006); else f.box('emis', col, s - 0.03, s + 0.03, y0, y1, 0.03, 0.036); }
function louvre(f, s, y, w, h, col) { f.box('metal', 0x2a2d32, s - w / 2 - 0.03, s + w / 2 + 0.03, y - h / 2 - 0.03, y + h / 2 + 0.03, 0, 0.03); for (let i = 0; i < 5; i++) f.box('matte', col, s - w / 2, s + w / 2, y - h / 2 + 0.02 + i * h / 5, y - h / 2 + 0.02 + i * h / 5 + h / 9, 0.03, 0.05); }
function junction(f, s, y, Q, big) {
  const w = big ? 0.44 : 0.3, h = big ? 0.55 : 0.36; f.box('metal', 0x383d44, s - w / 2, s + w / 2, y, y + h, 0, 0.12); f.box('matte', 0x23262b, s - w / 2 + 0.03, s + w / 2 - 0.03, y + 0.03, y + h - 0.03, 0.12, 0.13); f.box('metal', 0x8a9098, s + w / 2 - 0.09, s + w / 2 - 0.05, y + h * 0.4, y + h * 0.6, 0.13, 0.15);
  f.led(s - w / 2 + 0.07, y + h - 0.08, 0.035, 0.035, 0x4aff7a, 1, 0.3 + Q.r() * 0.6, Q.r(), 0.13); f.led(s - w / 2 + 0.14, y + h - 0.08, 0.035, 0.035, 0xffa030, 4, 1, Q.r(), 0.13);
  f.cylY('metal', 0x555b63, s - 0.06, 0.06, y + h, Q.yu1, 0.022, 8); f.cylY('metal', 0x555b63, s + 0.07, 0.06, y + h, Q.yu1, 0.022, 8);
  if (Q.r() < 0.7) f.hang(s, y, 0.25 + Q.r() * 0.4, 0.07, 0.016, Q.r.pick(WIRES));
}
function hatch(f, s, y, w, h, Q) { f.box('metal', sh(Q.dado, 0.6), s - w / 2, s + w / 2, y, y + h, 0, 0.035); f.box('metal', 0x15171a, s - w / 2 + 0.04, s + w / 2 - 0.04, y + 0.04, y + h - 0.04, 0.035, 0.04); f.box('metal', 0xa0a6ae, s + w / 2 - 0.15, s + w / 2 - 0.07, y + h * 0.5 - 0.03, y + h * 0.5 + 0.03, 0.04, 0.07); f.led(s - w / 2 + 0.1, y + h - 0.1, 0.04, 0.04, 0x4aff7a, 1, 0.4, Q.r(), 0.04); }
function gauge(f, s, y, Q) { f.box('metal', 0x2a2d32, s - 0.115, s + 0.115, y - 0.115, y + 0.115, 0, 0.05); f.cylD('matte', 0xe6e4da, s, y, 0.05, 0.058, 0.09); const a = Q.r.range(-1.2, 1.2); f.rbox('matte', 0xc8281c, s + Math.sin(a) * 0.03, y + Math.cos(a) * 0.03, 0.062, 0.012, 0.075, 0.006, -a); f.cylD('metal', 0x15171a, s, y, 0.058, 0.07, 0.012, 8); f.box('emis', Q.r() < 0.5 ? 0x4aff7a : 0xffb030, s + 0.07, s + 0.095, y - 0.095, y - 0.08, 0.05, 0.054); }
function hazardDecal(f, s, y, w) { f.decal(2, s, y, w, w * 0.5 > 0.5 ? 0.5 : w * 0.5, 0.021); }
function tint(Q, base, k, r) { return jit(mix(base, Q.st.tintC || base, Q.st.tintK || 0), r, k); }

// ------------------------------------------------------------------ pieces (shared across styles)
const P = {};
P.lightbar = (f, a, b, Q, m) => lampBar(f, m.c, 1.5, Math.min(2.4, Q.yu1 - 0.15), Q.lightCol || 0xe4efff, Q, Q.r() < 0.12 + Q.dmg * 1.5);
P.vent = (f, a, b, Q, m) => louvre(f, m.c, Math.min(2.05, Q.yu1 - 0.35), Math.min(0.6, m.w - 0.3), 0.3, 0x0e1012);
P.monitor = (f, a, b, Q, m) => { const w = Math.min(1.1, m.w - 0.3); monitor(f, m.c, Math.min(1.75, Q.yu1 - 0.45), w, w * 0.6, Q.r.pick(Q.st.scr || ['graph', 'term', 'sys']), Q.r() < 0.1 ? 3 : 0); };
P.extinguisher = (f, a, b, Q, m) => { const s = m.c; f.box('metal', 0x555b63, s - 0.05, s + 0.05, 0.98, 1.0, 0.0, 0.045); f.box('metal', 0x555b63, s - 0.05, s + 0.05, 0.62, 0.64, 0.0, 0.045); f.cylY('metal', 0xc02a1e, s, 0.1, 0.4, 0.98, 0.065); f.cylY('metal', 0x222428, s, 0.1, 0.98, 1.08, 0.025); f.box('metal', 0x222428, s - 0.02, s + 0.04, 1.04, 1.07, 0.09, 0.15); f.hang(s + 0.06, 1.0, 0.35, 0.16, 0.012, 0x15171a, 0.02); };
P.switch = (f, a, b, Q, m) => { const s = m.c; f.box('matte', 0xcfcabb, s - 0.05, s + 0.05, 1.28, 1.44, 0, 0.022); f.led(s, 1.4, 0.035, 0.025, 0x4aff7a, 2, 0.3, Q.r(), 0.022, 0.008); f.box('metal', 0x23262b, s - 0.02, s + 0.02, 1.31, 1.36, 0.022, 0.03);
  f.box('matte', 0xcfcabb, s - 0.06, s + 0.06, 0.4, 0.52, 0, 0.022); f.box('matte', 0x14161a, s - 0.04, s - 0.025, 0.44, 0.48, 0.022, 0.026); f.box('matte', 0x14161a, s + 0.025, s + 0.04, 0.44, 0.48, 0.022, 0.026); };
P.conduit = (f, a, b, Q, m) => { const s = m.c + (Q.r() - 0.5) * 0.3; f.cylY('metal', 0x7a8088, s, 0.04, Q.yu0, Q.yu1, 0.022, 8); for (let y = Q.yu0 + 0.3; y < Q.yu1 - 0.1; y += 0.7) f.box('metal', 0x555b63, s - 0.04, s + 0.04, y, y + 0.05, 0.0, 0.06); junction(f, s + 0.2 * (Q.r() < 0.5 ? -1 : 1), 1.35, Q, false); };
P.hatch = (f, a, b, Q, m) => hatch(f, m.c, 1.25, Math.min(0.75, m.w - 0.25), 0.85, Q);
P.junction = (f, a, b, Q, m) => junction(f, m.c, 1.35, Q, m.w > 1.3);
P.hazard = (f, a, b, Q, m) => hazardDecal(f, m.c, 1.5, m.w - 0.15);
P.fan = (f, a, b, Q, m) => f.fan(m.c, Math.min(2.0, Q.yu1 - 0.4), Math.min(0.26, m.w * 0.3));
P.rack = (f, a, b, Q, m) => {
  const n = m.w >= 1.7 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const w = m.w / n, s0 = a + k * w + 0.03, s1 = a + (k + 1) * w - 0.03, yt = Math.min(2.45, Q.yu1 - 0.12), r = Q.r;
    f.box('metal', 0x242830, s0, s0 + 0.05, 0.3, yt, 0, 0.13); f.box('metal', 0x242830, s1 - 0.05, s1, 0.3, yt, 0, 0.13); f.box('metal', 0x242830, s0, s1, yt - 0.05, yt, 0, 0.13); f.box('metal', 0x242830, s0, s1, 0.3, 0.36, 0, 0.13);
    f.box('matte', 0x08090b, s0 + 0.05, s1 - 0.05, 0.36, yt - 0.05, 0, 0.03);
    for (let y = 0.4; y < yt - 0.16; y += 0.14) {
      if (r() < 0.12) continue; const dp = 0.075 + r() * 0.025; f.box('metal', sh(0x30353d, 0.8 + r() * 0.5), s0 + 0.055, s1 - 0.055, y, y + 0.12, 0.03, dp);
      const lc = [0x4aff7a, 0x4aff7a, 0xffb030, 0x38a8ff][(r() * 4) | 0]; f.led(s1 - 0.1, y + 0.06, 0.028, 0.02, lc, r() < 0.5 ? 4 : r() < 0.5 ? 1 : 0, 0.4 + r() * 1.4, r(), dp, 0.004);
      if (r() < 0.45) f.led(s1 - 0.17, y + 0.06, 0.028, 0.02, 0xff5a3a, 4, 0.8 + r(), r(), dp, 0.004);
      
    }
    if (r() < 0.4) f.hang(s0 + 0.2 + r() * (w - 0.4), 0.8 + r() * 0.8, 0.3 + r() * 0.5, 0.1, 0.014, r.pick(WIRES), 0.04);
  }
};
P.patch = (f, a, b, Q, m) => {
  const s = m.c, w = Math.min(m.w - 0.2, 0.9), r = Q.r, yc = 1.5; f.box('metal', 0x15171a, s - w / 2, s + w / 2, yc - 0.22, yc + 0.22, 0, 0.05);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 8; i++) { const x = s - w / 2 + 0.07 + i * (w - 0.14) / 7; f.box('matte', 0x050506, x - 0.02, x + 0.02, yc - 0.17 + row * 0.13, yc - 0.12 + row * 0.13, 0.05, 0.056); f.led(x, yc - 0.1 + row * 0.13, 0.016, 0.012, [0x4aff7a, 0xffb030, 0x4aff7a, 0x38a8ff][(i + row) & 3], 4, 0.5 + r() * 1.5, r(), 0.05, 0.005); }
  for (let i = 0; i < 4; i++) f.wire(s - w / 2 + 0.1 + i * 0.2, yc - 0.17, s - w / 2 + 0.2 + i * 0.2, yc - 0.17, 0.056, 0.2 + i * 0.07, 0.012, r.pick(WIRES));
};
P.console = (f, a, b, Q, m) => {
  const s = m.c, w = m.w - 0.15, r = Q.r, v = ['term', 'graph', 'sys', 'bars', 'radar'];
  f.box('metal', 0x2a2e35, s - w / 2, s + w / 2, 0.8, 0.86, 0.0, 0.27); f.box('metal', 0x1c1f24, s - w / 2, s + w / 2, 0.0, 0.8, 0.0, 0.2); f.box('metal', 0x3a3f46, s - w / 2, s + w / 2, 0.86, 0.9, 0.24, 0.27);
  for (let i = 0; i < 9; i++) f.box('matte', 0x0e0f12, s - 0.34 + i * 0.075, s - 0.29 + i * 0.075, 0.86, 0.875, 0.1, 0.2);
  for (let i = 0; i < 6; i++) f.led(s - 0.3 + i * 0.1, 0.875, 0.025, 0.006, [0x4aff7a, 0xffb030, 0xff5a3a, 0x38a8ff][i & 3], r() < 0.5 ? 4 : 2, 0.5 + r(), r(), 0.1, 0.006);
  const ww = Math.min(1.0, w * 0.45); monitor(f, s, 1.42, ww, ww * 0.6, r.pick(v)); if (w > 1.6) { monitor(f, s - ww / 2 - 0.45, 1.36, 0.55, 0.34, r.pick(v), 0); monitor(f, s + ww / 2 + 0.45, 1.36, 0.55, 0.34, r.pick(v), r() < 0.2 ? 3 : 0); }
  f.box('metal', 0x23262b, s - 0.05, s + 0.05, 0.9, 1.1, 0, 0.06);
};
P.screenwall = (f, a, b, Q, m) => { const w = (m.w - 0.15) / 2; for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) monitor(f, a + 0.075 + w * (i + 0.5), 1.3 + j * 0.62, w - 0.08, (w - 0.08) * 0.58, Q.r.pick(Q.st.scr || ['graph', 'term', 'sys', 'bars', 'radar']), Q.r() < 0.12 ? 3 : 0); };
P.brace = (f, a, b, Q, m) => { const w = m.w - 0.2, h = Math.min(1.3, Q.yu1 - 1.4), L = Math.hypot(w, h), an = Math.atan2(h, w), y = 1.2 + h / 2; for (const sg of [1, -1]) f.rbox('metal', sh(Q.dado, 0.8), m.c, y, 0.026, L, 0.07, 0.022, sg * an); };
P.pipev = (f, a, b, Q, m) => { for (const o of [-0.15, 0.1]) { f.cylY('metal', Q.r.pick([0x6a7076, Q.acc, 0x8a6a3a]), m.c + o, 0.09, 0.14, Q.yu1, 0.055); for (const y of [0.55, 1.5, 2.2]) if (y < Q.yu1 - 0.1) f.cylY('metal', 0x2a2d32, m.c + o, 0.09, y, y + 0.05, 0.075); f.box('metal', 0x2a2d32, m.c + o - 0.07, m.c + o + 0.07, 0.8, 0.85, 0, 0.09); } };
P.cagelamp = (f, a, b, Q, m) => { const s = m.c, y = Math.min(2.2, Q.yu1 - 0.35); f.box('metal', 0x2a2d32, s - 0.12, s + 0.12, y - 0.12, y + 0.12, 0, 0.04); f.led(s, y, 0.14, 0.14, 0xffc060, Q.r() < 0.3 ? 3 : Q.r() < 0.5 ? 2 : 0, 0.5 + Q.r() * 0.6, Q.r(), 0.04, 0.05); for (const o of [-0.1, 0, 0.1]) f.box('metal', 0x15171a, s + o - 0.006, s + o + 0.006, y - 0.12, y + 0.12, 0.09, 0.1); f.box('metal', 0x15171a, s - 0.12, s + 0.12, y - 0.006, y + 0.006, 0.09, 0.1); };
P.valve = (f, a, b, Q, m) => { const s = m.c, yt = Q.lanes ? Q.lanes[0] : Q.yu1 - 0.15; f.cylY('metal', 0x6a7076, s, 0.14, 1.3, yt, 0.032, 8); f.box('metal', 0x555b63, s - 0.08, s + 0.08, 1.45, 1.6, 0.06, 0.2); f.cylD('metal', 0x8a9098, s, 1.52, 0.2, 0.26, 0.018, 8); f.torus('matte', 0xc0301e, s, 1.52, 0.255, 0.12); for (let k = 0; k < 4; k++) f.rbox('matte', 0xc0301e, s, 1.52, 0.255, 0.22, 0.016, 0.016, k * Math.PI / 4 + 0.4); if (Q.r() < 0.4) f.led(s + 0.15, 1.7, 0.03, 0.03, 0xffb030, 1, 0.5, Q.r(), 0.2, 0.01); };
P.gauges = (f, a, b, Q, m) => { gauge(f, m.c - 0.17, 1.65, Q); gauge(f, m.c + 0.17, 1.65, Q); f.cylS('metal', 0x555b63, m.c - 0.17, m.c + 0.17, 1.4, 0.07, 0.025, 8); };
P.loom = (f, a, b, Q, m) => { const y = Math.min(2.15, Q.yu1 - 0.45); for (const s of [a + 0.08, b - 0.08]) f.box('metal', 0x383d44, s - 0.03, s + 0.03, y - 0.04, y + 0.04, 0, 0.07); for (let i = 0; i < 3; i++) f.wire(a + 0.08, y - i * 0.01, b - 0.08, y - i * 0.01, 0.07 + i * 0.012, 0.2 + Q.r() * 0.25, 0.014, Q.r.pick(WIRES)); };
P.steamvent = (f, a, b, Q, m) => { const s = m.c; f.cylD('metal', 0x6a7076, s, 1.5, 0.04, 0.2, 0.04, 8); f.cylD('metal', 0x2a2d32, s, 1.5, 0.2, 0.23, 0.055, 8); f.box('metal', 0x2a2d32, s - 0.08, s + 0.08, 1.4, 1.6, 0, 0.05); f.steam(s, 1.5, 0.26); };
P.manifold = (f, a, b, Q, m) => { const s = m.c, hy = Math.min(2.4, Q.yu1 - 0.3); f.box('metal', 0x3a4047, s - 0.14, s + 0.14, 0.9, hy, 0, 0.16); f.box('emis', sh(Q.acc, 0.8), s - 0.1, s + 0.1, 1.2, 1.25, 0.16, 0.164); f.led(s, hy - 0.2, 0.12, 0.05, Q.acc, 2, 0.35, Q.r(), 0.16, 0.006); for (const y of [1.0, 1.4, 1.8]) if (y < hy - 0.1) f.cylS('metal', 0x6a7076, s - 0.4, s - 0.14, y, 0.08, 0.035, 8); gauge(f, s, 1.62, Q); };
P.outlets = (f, a, b, Q, m) => { const s = m.c; f.box('metal', 0xcfd6da, s - 0.3, s + 0.3, 1.2, 1.4, 0, 0.025); [0x2aa84a, 0xe8e8e0, 0xe0b020].forEach((c, i) => { f.cylD('matte', c, s - 0.2 + i * 0.2, 1.3, 0.025, 0.045, 0.045, 10); f.cylD('matte', 0x15171a, s - 0.2 + i * 0.2, 1.3, 0.045, 0.05, 0.02, 8); }); };
P.dispenser = (f, a, b, Q, m) => { const s = m.c; f.box('matte', 0xe8eeee, s - 0.07, s + 0.07, 1.25, 1.5, 0, 0.1); f.box('metal', 0x8ab0b8, s - 0.05, s + 0.05, 1.25, 1.3, 0.1, 0.12); f.led(s, 1.42, 0.03, 0.02, 0x44d0ff, 2, 0.3, Q.r(), 0.1, 0.006); f.box('metal', 0xcfd6da, s + 0.2, s + 0.5, 1.3, 1.5, 0, 0.05); };
P.cabinet = (f, a, b, Q, m) => { const s = m.c, w = Math.min(0.9, m.w - 0.2); f.box('matte', 0xe8eef0, s - w / 2, s + w / 2, 1.5, Math.min(2.3, Q.yu1 - 0.2), 0, 0.2); f.box('glass', 0xa8d0e8, s - w / 2 + 0.05, s + w / 2 - 0.05, 1.55, Math.min(2.25, Q.yu1 - 0.25), 0.2, 0.205); for (let i = 0; i < 3; i++) f.box('matte', Q.r.pick([0xe8c070, 0xa0e0a0, 0x88b8e0, 0xe0a0a0]), s - w / 2 + 0.09 + i * 0.2, s - w / 2 + 0.2 + i * 0.2, 1.6, 1.8, 0.04, 0.16); };
P.lightpanel = (f, a, b, Q, m) => { const s = m.c, w = Math.min(0.8, m.w - 0.25); f.box('metal', 0x9aa4a8, s - w / 2 - 0.02, s + w / 2 + 0.02, 1.58, 1.9, 0, 0.03); f.box('emis', 0xc4dce6, s - w / 2, s + w / 2, 1.6, 1.88, 0.03, 0.034); };
P.grate = (f, a, b, Q, m) => { const s = m.c, w = Math.min(0.9, m.w - 0.25), y0 = 1.2, y1 = Math.min(2.0, Q.yu1 - 0.3); f.box('matte', 0x08090a, s - w / 2, s + w / 2, y0, y1, 0, 0.03); for (let y = y0 + 0.04; y < y1; y += 0.07) f.box('metal', 0x555b63, s - w / 2, s + w / 2, y, y + 0.03, 0.03, 0.06); f.box('metal', 0x3a3f46, s - w / 2 - 0.03, s - w / 2, y0, y1, 0, 0.065); f.box('metal', 0x3a3f46, s + w / 2, s + w / 2 + 0.03, y0, y1, 0, 0.065); };
P.worklamp = (f, a, b, Q, m) => { const s = m.c, y = Math.min(2.3, Q.yu1 - 0.3); f.box('metal', 0x2a2d32, s - 0.1, s + 0.1, y - 0.07, y + 0.07, 0, 0.06); f.led(s, y, 0.14, 0.09, 0xffa030, Q.r() < 0.25 ? 3 : 2, 0.25 + Q.r() * 0.3, Q.r(), 0.06, 0.04); };
P.coil = (f, a, b, Q, m) => { const s = m.c; for (let i = 0; i < 3; i++) f.hang(s - 0.15 + i * 0.15, Math.min(2.4, Q.yu1 - 0.2), 0.9 + Q.r() * 0.7, 0.06 + i * 0.02, 0.02, Q.r.pick(WIRES), 0.08); f.box('metal', 0x2a2d32, s - 0.25, s + 0.25, Math.min(2.4, Q.yu1 - 0.2), Math.min(2.4, Q.yu1 - 0.2) + 0.08, 0, 0.1); };
P.frame = (f, a, b, Q, m) => { const s = m.c, w = Math.min(0.7, m.w - 0.3), h = w * 0.75, y = 1.75; const wood = Q.r.pick([0x4a3020, 0x2a2018, 0x6a5030, 0x1c1c20]); f.box('matte', wood, s - w / 2 - 0.04, s + w / 2 + 0.04, y - h / 2 - 0.04, y + h / 2 + 0.04, 0, 0.03); f.box('matte', 0xe8e2d0, s - w / 2, s + w / 2, y - h / 2, y + h / 2, 0.03, 0.034);
  const c1 = Q.r.pick([0x3a6a8a, 0x8a4a3a, 0x4a7a4a, 0xc8a050, 0x5a4a7a]); f.box('matte', c1, s - w / 2 + 0.05, s + w / 2 - 0.05, y - h / 2 + 0.05, y, 0.034, 0.038); f.box('matte', Q.r.pick([0xd8c070, 0xb86a4a, 0x7a9ab8]), s - w / 4, s + w / 4, y, y + h / 2 - 0.08, 0.034, 0.038); };
P.sconce = (f, a, b, Q, m) => { const s = m.c, y = 1.85; f.box('metal', 0x5a4a30, s - 0.05, s + 0.05, y - 0.12, y + 0.12, 0, 0.05); f.cylY('matte', 0xf0e0b8, s, 0.12, y - 0.1, y + 0.16, 0.08, 10); f.led(s, y + 0.03, 0.1, 0.18, 0xffd090, Q.r() < 0.3 ? 3 : 2, 0.1 + Q.r() * 0.1, Q.r(), 0.13, 0.01); };
P.shelfpiece = (f, a, b, Q, m) => { const s = m.c, w = Math.min(0.9, m.w - 0.2); f.box('matte', 0x5a3a22, s - w / 2, s + w / 2, 1.5, 1.54, 0, 0.2); for (let i = 0; i < 5; i++) f.box('matte', Q.r.pick([0x8a2a2a, 0x2a5a8a, 0x3a6a3a, 0xc8a040, 0x5a3a6a, 0xd8d0c0]), s - w / 2 + 0.05 + i * (w - 0.1) / 5, s - w / 2 + 0.05 + i * (w - 0.1) / 5 + 0.05, 1.54, 1.54 + 0.15 + Q.r() * 0.08, 0.04, 0.16); f.box('metal', 0x3a2a18, s - w / 2, s - w / 2 + 0.03, 1.44, 1.5, 0, 0.15); f.box('metal', 0x3a2a18, s + w / 2 - 0.03, s + w / 2, 1.44, 1.5, 0, 0.15); };
P.switchhome = P.switch;

// ------------------------------------------------------------------ styles
function plates(f, a, b, Q, up, lo, rr, sd) { const r = rr || Q.r; if (lo != null) f.box('matte', jit(lo, r, 0.06), a, b, 0.16, Q.yr0 - 0.02, 0, 0.016); if (up != null && Q.yu1 - 0.02 > 1.2) f.box('matte', jit(up, r, 0.05), a, b, 1.14, Q.yu1 - 0.02, 0, 0.016); void sd; }
function pick(Q, table, m) {
  const ok = table.filter(t => m.w >= (t[2] || 0) && m.w <= (t[3] || 9)); let tot = 0; for (const t of ok) tot += t[1]; let x = Q.r() * tot; for (const t of ok) { x -= t[1]; if (x <= 0) return P[t[0]]; } return ok.length ? P[ok[0][0]] : null;
}
const mk = (def) => ({ ...def, feature(f, a, b, Q, m) { const fn = pick(Q, def.table, m); if (fn) fn(f, a, b, Q, m); } });

export const STYLES = {
  corp: mk({
    scr: ['graph', 'sys', 'term'], tintC: 0xdfe6ee, tintK: 0.12,
    base(f, s0, s1, Q) { backing(f, s0, s1, Q, Q.dado); skirt(f, s0, s1, sh(Q.dado, 0.55)); rail(f, s0, s1, Q, mix(Q.acc, Q.dado, 0.6), Q.acc); crown(f, s0, s1, Q, sh(Q.dado, 0.5), mix(Q.acc, 0xffffff, 0.5)); },
    panel(f, a, b, Q) { plates(f, a, b, Q, mix(Q.wall, 0xeef2f4, 0.12), mix(Q.dado, Q.wall, 0.15)); },
    table: [['lightbar', 2], ['vent', 1], ['monitor', 1.6, 0.9], ['extinguisher', 0.7], ['switch', 1], ['conduit', 1], ['hatch', 0.7], ['frame', 0.5]],
  }),
  industrial: mk({
    scr: ['sys', 'bars', 'graph'],
    base(f, s0, s1, Q) { backing(f, s0, s1, Q, sh(Q.dado, 0.8)); skirt(f, s0, s1, 0x2a2d32, 0.18); rail(f, s0, s1, Q, sh(Q.dado, 0.45)); crown(f, s0, s1, Q, 0x23262b); if (Q.yu1 > 2.4 && Q.r() < 0.5) tray(f, s0, s1, Q.yu1 - 0.45, Q); },
    panel(f, a, b, Q, m) { plates(f, a, b, Q, sh(Q.wall, 0.82), sh(Q.dado, 0.95)); f.decal(6, m.c, (0.16 + Q.yr0 - 0.02) / 2, b - a, Q.yr0 - 0.18, 0.0185, 0xffffff); if (Q.yu1 > 1.5) f.decal(6, m.c, (1.14 + Q.yu1 - 0.02) / 2, b - a, Q.yu1 - 1.16, 0.0185, 0xffffff); if (Q.r() < 0.35) f.decal(Q.r.pick([0, 5, 3]), m.c, 1.0, m.w, 1.2, 0.02, 0xaaaaaa); },
    table: [['brace', 1.1, 1.4], ['junction', 1.2], ['pipev', 1.2], ['cagelamp', 1], ['vent', 0.8], ['hazard', 0.8], ['hatch', 0.6], ['extinguisher', 0.5], ['fan', 0.5], ['lightbar', 0.8]],
  }),
  server: mk({
    scr: ['term', 'graph', 'sys', 'bars', 'radar'], lightCol: 0xb8d8ff,
    base(f, s0, s1, Q) { backing(f, s0, s1, Q, mix(0x4a5c78, Q.wall, 0.3)); skirt(f, s0, s1, 0x1f242c); rail(f, s0, s1, Q, 0x2c3440, null); crown(f, s0, s1, Q, 0x15181d, sh(Q.acc, 0.7)); if (Q.yu1 >= 3.0) tray(f, s0, s1, Q.yu1 - 0.34, Q); },
    panel(f, a, b, Q) { plates(f, a, b, Q, mix(0x2a3446, Q.wall, 0.2), mix(0x262e3a, Q.dado, 0.3)); },
    table: [['rack', 3.5, 0, 1.45], ['rack', 3, 1.45], ['console', 1.2, 1.7], ['screenwall', 0.9, 1.7], ['patch', 1, 0.9, 1.45], ['lightbar', 0.35]],
  }),
  engineering: mk({
    scr: ['sys', 'graph', 'bars'],
    base(f, s0, s1, Q) {
      backing(f, s0, s1, Q, sh(Q.dado, 0.8)); skirt(f, s0, s1, 0x2a2d32, 0.16); rail(f, s0, s1, Q, sh(Q.dado, 0.5)); crown(f, s0, s1, Q, 0x23262b); const r = Q.r;
      const y1 = Q.yu1 - 0.14, y2 = Q.yu1 - 0.4; Q.lanes = [y1]; f.cylS('metal', jit(0x6a7076, r), s0, s1, y1, 0.14, 0.09); brackets(f, s0, s1, y1, 0.14, 0.09, 0x2a2d32); for (let s = Math.ceil(s0) + 0.5; s < s1 - 0.1; s += 3) f.cylS('metal', 0x2a2d32, s - 0.03, s + 0.03, y1, 0.14, 0.105);
      f.cylS('metal', jit(Q.acc, r, 0.2), s0, s1, y2, 0.09, 0.05); brackets(f, s0, s1, y2, 0.09, 0.05, 0x2a2d32);
      const yb = 1.28; for (let i = 0; i < 3; i++) f.cylS('metal', [0xc83a2a, 0x2a5ac8, 0xd8d8d0][i], s0, s1, yb + i * 0.05, 0.05 + (i & 1) * 0.02, 0.022, 8); for (let s = Math.ceil(s0) + 0.3; s < s1; s += 1) f.box('metal', 0x23262b, s - 0.02, s + 0.02, yb - 0.04, yb + 0.14, 0, 0.1);
    },
    panel(f, a, b, Q) { plates(f, a, b, Q, mix(Q.wall, 0x70787f, 0.3), mix(Q.dado, 0x30343a, 0.3)); },
    table: [['valve', 1.5], ['gauges', 1.3], ['loom', 1.3], ['steamvent', 0.9], ['manifold', 0.9, 0.9, 1.5], ['junction', 0.9], ['fan', 0.5], ['cagelamp', 0.4], ['hazard', 0.4]],
  }),
  medical: mk({
    scr: ['ecg', 'graph', 'ecg'], lightCol: 0xf0fcff,
    base(f, s0, s1, Q) { backing(f, s0, s1, Q, 0x8a9a9e); skirt(f, s0, s1, 0xa0aeb2); rail(f, s0, s1, Q, mix(Q.acc, 0xffffff, 0.2), null); crown(f, s0, s1, Q, 0xcfd8dc, 0xeafcff);
      f.cylS('metal', 0xd0d6da, s0, s1, 0.9, 0.08, 0.02, 8); for (let s = Math.ceil(s0) + 0.2; s < s1; s += 1) f.box('metal', 0xaab2b8, s - 0.015, s + 0.015, 0.87, 0.93, 0.018, 0.08); },
    panel(f, a, b, Q) { plates(f, a, b, Q, 0xe8eef0, mix(Q.dado, 0xdfeaec, 0.35)); },
    table: [['monitor', 2, 0.9], ['dispenser', 1], ['outlets', 1], ['cabinet', 1.2], ['lightpanel', 1], ['switch', 0.6], ['extinguisher', 0.3]],
  }),
  duct: mk({
    scr: ['sys', 'alert', 'term'],
    base(f, s0, s1, Q) { backing(f, s0, s1, Q, 0x484e56); skirt(f, s0, s1, 0x2a2d32, 0.18); rail(f, s0, s1, Q, 0x3a3f46); crown(f, s0, s1, Q, 0x2a2d32);
      for (let s = s0 + 0.15; s < s1 - 0.05; s += 0.5) f.box('metal', 0x555b63, s - 0.035, s + 0.035, 0.2, Q.yu1, 0.016, 0.055); tray(f, s0, s1, Math.min(1.85, Q.yu1 - 0.3), Q); },
    panel(f, a, b, Q) { plates(f, a, b, Q, jit(0x4a5058, Q.r, 0.1), jit(0x3a4046, Q.r, 0.1)); },
    table: [['grate', 1.4], ['worklamp', 1.2], ['hazard', 0.7], ['fan', 0.9], ['coil', 0.8], ['junction', 1], ['pipev', 0.6]],
  }),
  home: mk({
    scr: ['term'], tintC: 0x000000, tintK: 0,
    base(f, s0, s1, Q) { backing(f, s0, s1, Q, Q.dado, 0.1); skirt(f, s0, s1, sh(Q.dado, 0.6), 0.16); rail(f, s0, s1, Q, sh(Q.dado, 1.2)); crown(f, s0, s1, Q, sh(Q.wall, 0.85)); },
    panel(f, a, b, Q) { const n = Math.max(2, Math.round((b - a) / 0.2)), w = (b - a) / n; for (let i = 0; i < n; i++) f.box('matte', jit(Q.dado, Q.r, 0.07), a + i * w + 0.006, a + (i + 1) * w - 0.006, 0.16, Q.yr0 - 0.02, 0, 0.014); if (Q.yu1 > 1.3) for (let s = a + 0.12; s < b; s += 0.25) f.box('matte', sh(Q.wall, 0.94), s, s + 0.04, 1.14, Q.yu1 - 0.02, 0, 0.004); },
    table: [['frame', 2], ['sconce', 1.4], ['shelfpiece', 1], ['switch', 0.8], ['conduit', 0.2]],
  }),
};
STYLES.lite = { base(f, s0, s1, Q) { backing(f, s0, s1, Q, Q.dado); skirt(f, s0, s1, sh(Q.dado, 0.55)); rail(f, s0, s1, Q, mix(Q.acc, Q.dado, 0.6), Q.acc); crown(f, s0, s1, Q, sh(Q.dado, 0.5), null); }, panel(f, a, b, Q) { plates(f, a, b, Q, mix(Q.wall, 0xeef2f4, 0.12), mix(Q.dado, Q.wall, 0.15)); }, feature() {} };
STYLES.derelict = {
  ...mk({
    scr: ['alert', 'term', 'sys'],
    base(f, s0, s1, Q) { STYLES.industrial.base(f, s0, s1, Q); },
    panel(f, a, b, Q, m) { plates(f, a, b, Q, mix(Q.wall, 0x5a3a28, 0.45), mix(Q.dado, 0x4a2e20, 0.45)); const r = Q.r; if (r() < 0.6) f.decal(0, m.c, 1.5, m.w, 1.4, 0.02, 0xcc9a70); if (r() < 0.35) f.decal(1, m.c, 1.9, m.w, 1.0, 0.021, 0xffffff); if (r() < 0.3) f.decal(7, m.c, 1.0, m.w, 1.2, 0.022, 0xa0c0b0); },
    table: [['coil', 1.5], ['junction', 1], ['cagelamp', 0.8], ['loom', 1], ['steamvent', 0.7], ['monitor', 0.8, 0.9], ['pipev', 0.8]],
  }),
  breach(f, a, b, Q, m) {
    const s = m.c, r = Q.r, w = Math.min(m.w - 0.25, 0.95), y0 = 1.2 + r() * 0.35, y1 = Math.min(Q.yu1 - 0.15, y0 + 0.65 + r() * 0.4);
    f.box('matte', 0x040405, s - w / 2, s + w / 2, y0, y1, 0.0, 0.03);
    for (let i = 0; i < 5; i++) { const side = i < 2 ? -1 : i < 4 ? 1 : 0, rz = (r() - 0.5) * 0.7; if (side) f.rbox('metal', sh(Q.wall, 0.55), s + side * (w / 2 + 0.03), y0 + (y1 - y0) * (0.2 + 0.6 * ((i & 1) ? 0.3 : 0.7)), 0.05, 0.1, 0.35 + r() * 0.3, 0.025, rz); else f.rbox('metal', sh(Q.wall, 0.5), s + (r() - 0.5) * w * 0.6, y1 + 0.02, 0.055, 0.3 + r() * 0.2, 0.08, 0.025, (r() - 0.5) * 0.5); }
    for (let i = 0; i < 5; i++) f.hang(s - w / 2 + 0.08 + i * (w - 0.16) / 4, y1 - 0.04, 0.35 + r() * 0.9, 0.03, 0.013 + r() * 0.008, r.pick(WIRES), (r() - 0.5) * 0.14);
    f.led(s, y0 + 0.12, 0.12, 0.05, 0xff8a30, 3, 1.3, r(), 0.03, 0.01);
    if (r() < 0.75) f.spark(s + (r() - 0.5) * w * 0.5, y0 + 0.25 + r() * 0.3, 0.08); if (r() < 0.2) f.steam(s, y0 + 0.1, 0.1);
    f.decal(1, s, y1 + 0.2, w + 0.5, 0.8, 0.021, 0xffffff);
  },
};

// room type -> wall style (ships)
export const STYLE_OF_ROOM = {
  serverhall: 'server', control: 'server', cooling: 'engineering', power: 'engineering', storage: 'industrial', crew: 'corp', lab: 'medical', vault: 'industrial', evidence: 'industrial',
  tankhall: 'engineering', chemlab: 'medical', reactor: 'engineering', medbay: 'medical', assembly: 'industrial', foundry: 'engineering', office: 'corp', armoryhall: 'industrial',
  barracks: 'corp', guardroom: 'corp', range: 'industrial', cellblock: 'industrial', canteen: 'corp',
};
