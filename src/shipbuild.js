// Extraction mode: turn a ship layout (ships.js) into batched geometry, colliders, loot containers and lights.
import * as THREE from '../vendor/three.module.js';
import { Batch, signTex } from './interior-kit.js';
import { rng } from './util.js';
import { rollLoot, ROOM_LABEL, isVault } from './ships.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UB = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), UC = new THREE.CylinderGeometry(1, 1, 1, 14).toNonIndexed();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export const CONT = {   // container kinds: size w,h,d + what the player sees in the prompt
  crate:  { w: 0.95, h: 0.75, d: 0.7, label: 'Search crate' },
  locker: { w: 0.62, h: 1.9, d: 0.55, label: 'Search locker' },
  case:   { w: 0.8, h: 0.5, d: 0.5, label: 'Open case' },
  safe:   { w: 0.9, h: 1.1, d: 0.8, label: 'Crack the safe', locked: true },
  rack:   { w: 1.7, h: 1.3, d: 0.35, label: 'Search weapon rack' },
  drawer: { w: 0.8, h: 1.1, d: 0.6, label: 'Search cabinet' },
};
const ROOM_CONT = {
  serverhall: ['drawer', 'locker'], control: ['locker', 'case'], cooling: ['crate', 'case'], power: ['crate', 'locker'], storage: ['crate', 'crate', 'case', 'locker'], crew: ['locker', 'locker', 'case'],
  lab: ['drawer', 'case'], vault: ['safe', 'safe', 'case'], tankhall: ['crate', 'case'], chemlab: ['drawer', 'case', 'locker'], reactor: ['crate', 'case'], medbay: ['drawer', 'case'],
  assembly: ['crate', 'case', 'crate'], foundry: ['crate', 'case'], office: ['drawer', 'locker'], armoryhall: ['rack', 'rack', 'crate', 'case'], barracks: ['locker', 'locker', 'case'],
  guardroom: ['locker', 'rack', 'drawer'], range: ['crate', 'case'], cellblock: ['case', 'drawer'], canteen: ['crate', 'locker'], evidence: ['safe', 'drawer', 'drawer', 'locker'],
};

const mixc = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
// every room type has its own look; the corp palette is blended in so a Halcyon armory still reads as Halcyon
const RS = {
  serverhall: { wall: 0x5f7a99, dado: 0x1f2b3d, floor: 0x161d29, acc: 0x38a8ff, light: 0xbcdcff, fs: 'grate' },
  control:    { wall: 0x3d4552, dado: 0x1c2028, floor: 0x181b22, acc: 0x44ffcc, light: 0x9fd8ff, fs: 'tile' },
  cooling:    { wall: 0x5d8a90, dado: 0x1f4a52, floor: 0x1d3036, acc: 0x4ae8ff, light: 0xc4f6ff, fs: 'stripes' },
  power:      { wall: 0x8a7a4a, dado: 0x3a3320, floor: 0x24211a, acc: 0xffd23f, light: 0xffeab0, fs: 'hazard' },
  storage:    { wall: 0x7d776a, dado: 0x3f3a30, floor: 0x2c2a26, acc: 0xd8a24a, light: 0xffe2b8, fs: 'plain' },
  crew:       { wall: 0xb09a7a, dado: 0x5a4636, floor: 0x3a2f28, acc: 0xff9a5a, light: 0xffd4a0, fs: 'carpet' },
  lab:        { wall: 0xdfe8ec, dado: 0x8fa6b0, floor: 0x9aa8b0, acc: 0x7affd8, light: 0xf2fbff, fs: 'checker' },
  vault:      { wall: 0x3a3d46, dado: 0x15171c, floor: 0x101216, acc: 0xff3b3b, light: 0xff9a8a, fs: 'hazard' },
  evidence:   { wall: 0x4a4f58, dado: 0x1c1e24, floor: 0x14161a, acc: 0xffb030, light: 0xffe0a0, fs: 'hazard' },
  tankhall:   { wall: 0x6f8a62, dado: 0x2f4a2a, floor: 0x26332a, acc: 0xb6ff3a, light: 0xe4ffc0, fs: 'stripes' },
  chemlab:    { wall: 0xcfe0c0, dado: 0x6a8a5a, floor: 0x8fa088, acc: 0xff77cc, light: 0xf4ffe8, fs: 'checker' },
  reactor:    { wall: 0x70483a, dado: 0x2c1a14, floor: 0x1e1512, acc: 0xff7a2a, light: 0xffb070, fs: 'grate' },
  medbay:     { wall: 0xe8eef0, dado: 0x7ab0b8, floor: 0xc4d0d4, acc: 0x44d0ff, light: 0xffffff, fs: 'tile' },
  assembly:   { wall: 0x8a8f94, dado: 0x4a4d52, floor: 0x2a2c30, acc: 0xffc020, light: 0xfff0c8, fs: 'hazard' },
  foundry:    { wall: 0x5a3a30, dado: 0x2a1812, floor: 0x1a1210, acc: 0xff5a1a, light: 0xff9a60, fs: 'grate' },
  office:     { wall: 0xa89478, dado: 0x6a5238, floor: 0x4a4038, acc: 0xffe0a0, light: 0xfff2d8, fs: 'carpet' },
  armoryhall: { wall: 0x5f6a55, dado: 0x2e3528, floor: 0x24281f, acc: 0xff4a3a, light: 0xffe8d0, fs: 'plain' },
  barracks:   { wall: 0x77806a, dado: 0x3a4032, floor: 0x2c3028, acc: 0xffb050, light: 0xffe4c0, fs: 'stripes' },
  guardroom:  { wall: 0x56627a, dado: 0x242b3a, floor: 0x1e222c, acc: 0x4a8aff, light: 0xcadcff, fs: 'tile' },
  range:      { wall: 0x6a6a64, dado: 0x2e2e2a, floor: 0x222220, acc: 0xff4a3a, light: 0xfff0e0, fs: 'stripes' },
  cellblock:  { wall: 0x7c8088, dado: 0x3c4046, floor: 0x2a2d32, acc: 0xff8a2a, light: 0xdce4ff, fs: 'plain' },
  canteen:    { wall: 0xd8d2c0, dado: 0xc0642a, floor: 0xb8b0a0, acc: 0xff9a3a, light: 0xfff0d0, fs: 'checker' },
};
export function buildShip(ship, S) {
  const r = rng(ship.seed ^ 0x77aa), corp = ship.corp, H = ship.H, W = ship.W;
  const bt = new Batch(); S.lamps = []; S.containers = []; S.doors = []; S.portDoors = [];
  const jit = (col, a = 0.06) => { _c.set(col); const k = 1 + (r() - 0.5) * a * 2; return _c.setRGB(Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k)).getHex(); };
  const box = (kind, col, x0, x1, y0, y1, z0, z1) => { _m.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q.identity(), _s.set(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0))); bt.put(kind, UB, _m, col); };
  const cyl = (kind, col, cx, cz, rad, y0, y1) => { _m.compose(_p.set(cx, (y0 + y1) / 2, cz), _q.identity(), _s.set(rad, y1 - y0, rad)); bt.put(kind, UC, _m, col); };
  const cylX = (kind, col, x0, x1, cy, cz, rad) => { _q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)); _m.compose(_p.set((x0 + x1) / 2, cy, cz), _q, _s.set(rad, x1 - x0, rad)); bt.put(kind, UC, _m, col); };
  const cylZ = (kind, col, z0, z1, cy, cx, rad) => { _q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); _m.compose(_p.set(cx, cy, (z0 + z1) / 2), _q, _s.set(rad, z1 - z0, rad)); bt.put(kind, UC, _m, col); };
  const col = (x0, x1, z0, z1, h) => S.colliders.push({ minx: x0, maxx: x1, minz: z0, maxz: z1, maxy: h });
  let curLight = corp.light, curH = H;
  const lamp = (x, z, on = true) => { box(on ? 'emis' : 'matte', on ? curLight : 0x1a1c20, x - 0.8, x + 0.8, curH - 0.07, curH, z - 0.22, z + 0.22); if (on) S.lamps.push({ x, z, tint: curLight }); };

  // ---------------- shell ----------------
  // The layout is a cell map (ships.js): walls are derived from who owns the cells on each side of every cell edge.
  const E = ship.E, own = ship.own, nx = ship.nx, nz = ship.nz, ZL = ship.zlo, owners = ship.owners;
  const gap0 = (o, d = 0) => o >= 0 ? owners[o].H : d;
  const roomOf = o => (o >= 0 && owners[o].kind === 'room') ? owners[o].room : null;
  // pre-pass: every room's look (hue-shifted blend of room type and corp palette)
  for (const m of ship.rooms) {
    const rs = RS[m.type] || RS.storage, vr = (r() - 0.5) * 0.16;
    const sh = c => { const k = new THREE.Color(c); const h = {}; k.getHSL(h); return k.setHSL((h.h + vr + 1) % 1, h.s, h.l).getHex(); };
    m.rs = rs; m.theme = { wall: sh(mixc(rs.wall, corp.wall, 0.3)), dado: sh(mixc(rs.dado, corp.dado, 0.3)), floor: sh(mixc(rs.floor, corp.floor2, 0.25)), acc: mixc(rs.acc, corp.accent, 0.25), light: mixc(rs.light, corp.light, 0.25) };
  }
  // wall helper: axis 'x' = runs along x at fixed z=at; axis 'z' = runs along z at fixed x=at. gaps [[centre,width,arch],...]
  const posts = new Map();   // wall vertices -> {x: has an x-run end, z: has a z-run end, t, h}
  const vert = (axis, at, s, t, hh) => { const x = axis === 'x' ? s : at, z = axis === 'x' ? at : s, k = x + ',' + z; const p = posts.get(k) || posts.set(k, { x, z, ax: false, az: false, t: 0, h: 0 }).get(k); if (axis === 'x') p.ax = true; else p.az = true; p.t = Math.max(p.t, t); p.h = Math.max(p.h, hh); };
  function wallRun(run) {
    const { axis, at, a, b, o1, o2 } = run, hull = o1 === -2 || o2 === -2, t = hull ? 0.5 : 0.3;
    const hh = Math.max(gap0(o1), gap0(o2)) || H, wc = hull ? jit(corp.dado) : jit(corp.wall), dc = hull ? 0x15181c : jit(corp.dado);
    const gaps = []; for (const d of ship.doors) if (d.axis === axis && d.at === at && d.u > a && d.u < b) gaps.push([d.u, d.w, d.arch]);
    for (const p of ship.ports) if (axis === 'z' && at === (p.dir === 'w' ? 0 : W) && p.z > a && p.z < b) gaps.push([p.z, 2.6, false]);
    // glass partitions: hallways look into the rooms and plazas they pass
    if (!hull && b - a >= 6) { const k1 = o1 >= 0 ? owners[o1].kind : '', k2 = o2 >= 0 ? owners[o2].kind : '', pub = x => x === 'cor' || x === 'plaza', rm = roomOf(o1) || roomOf(o2);
      if (((pub(k1) && k2 === 'room') || (pub(k2) && k1 === 'room')) && !isVault(rm.type) && r() < 0.8) for (let c = a + 2.5; c < b - 2; c += r.range(4.5, 6.5)) if (!gaps.some(g => Math.abs(g[0] - c) < g[1] / 2 + 1.5)) gaps.push([c, 2.0, 'win']); }
    gaps.sort((p, q) => p[0] - q[0]);
    const bx = (kind, c, s0, s1, y0, y1, off0, off1) => axis === 'x' ? box(kind, c, s0, s1, y0, y1, at + off0, at + off1) : box(kind, c, at + off0, at + off1, y0, y1, s0, s1);
    const cl = (s0, s1) => axis === 'x' ? col(s0, s1, at - t / 2, at + t / 2, hh) : col(at - t / 2, at + t / 2, s0, s1, hh);
    const sides = [];   // painted faces: room interiors get their own dado / wall / accent
    for (const [o, sgn] of [[o1, -1], [o2, 1]]) { const m = roomOf(o); if (m) sides.push({ m, sgn, off0: sgn < 0 ? -t / 2 - 0.03 : t / 2, off1: sgn < 0 ? -t / 2 : t / 2 + 0.03 }); }
    // wall extent along the run, interrupted by gaps
    const seg = (s0, s1) => {
      if (s1 - s0 < 0.04) return;
      bx('matte', wc, s0, s1, 1.05, hh, -t / 2, t / 2); bx('matte', dc, s0, s1, 0, 1.05, -t / 2 - 0.02, t / 2 + 0.02); if (!hull) bx('matte', corp.trim, s0, s1, 1.05, 1.11, -t / 2 - 0.045, t / 2 + 0.045); cl(s0, s1);
      for (const sd of sides) { const th = sd.m.theme, ac = new THREE.Color(th.acc).multiplyScalar(0.6).getHex(), top = Math.min(sd.m.H, hh);
        bx('matte', th.dado, s0, s1, 0, 1.05, sd.off0, sd.off1); bx('matte', th.wall, s0, s1, 1.05, top, sd.off0, sd.off1); bx('matte', ac, s0, s1, 1.05, 1.1, sd.off0 - 0.005 * sd.sgn, sd.off1 - 0.005 * sd.sgn); if (top > 2.8) bx('matte', ac, s0, s1, 2.7, 2.76, sd.off0 - 0.005 * sd.sgn, sd.off1 - 0.005 * sd.sgn); }
    };
    let cur = a;
    for (const [c, w, arch] of gaps) {
      const g0 = c - w / 2, g1 = c + w / 2, hy = arch ? 3.0 : 2.4; seg(cur, g0);
      if (arch === 'win') {
        bx('matte', wc, g0, g1, 2.3, hh, -t / 2, t / 2); bx('matte', dc, g0, g1, 0, 1.0, -t / 2 - 0.02, t / 2 + 0.02); bx('matte', wc, g0, g1, 0.99, 1.0, -t / 2, t / 2);
        bx('glass', 0xa8d0e8, g0, g1, 1.0, 2.3, -0.02, 0.02); for (const f of [g0, g1 - 0.06]) bx('matte', corp.trim, f, f + 0.06, 1.0, 2.3, -t / 2 - 0.03, t / 2 + 0.03); bx('matte', corp.trim, g0, g1, 1.0, 1.06, -t / 2 - 0.04, t / 2 + 0.04); bx('matte', corp.trim, g0, g1, 2.24, 2.3, -t / 2 - 0.04, t / 2 + 0.04); bx('matte', corp.trim, (g0 + g1) / 2 - 0.02, (g0 + g1) / 2 + 0.02, 1.0, 2.3, -0.03, 0.03);
        for (const sd of sides) { bx('matte', sd.m.theme.dado, g0, g1, 0, 1.0, sd.off0, sd.off1); bx('matte', sd.m.theme.wall, g0, g1, 2.3, Math.min(sd.m.H, hh), sd.off0, sd.off1); }
        cl(g0, g1); cur = g1; continue; }
      bx('matte', wc, g0, g1, hy, hh, -t / 2, t / 2); bx('matte', corp.trim, g0, g1, hy - 0.06, hy, -t / 2 - 0.04, t / 2 + 0.04);
      bx('matte', corp.trim, g0 - 0.1, g0, 0, hy, -t / 2 - 0.04, t / 2 + 0.04); bx('matte', corp.trim, g1, g1 + 0.1, 0, hy, -t / 2 - 0.04, t / 2 + 0.04);
      for (const sd of sides) bx('matte', sd.m.theme.wall, g0, g1, hy, Math.min(sd.m.H, hh), sd.off0, sd.off1);
      cur = g1;
    }
    seg(cur, b);
    vert(axis, at, a, t, hh); vert(axis, at, b, t, hh);
    // viewports: hull walls of spaces with a view show the stars
    if (hull && b - a >= 4) {
      const inner = o1 === -2 ? o2 : o1, m = roomOf(inner), k = inner >= 0 ? owners[inner].kind : '', sgn = o1 === -2 ? 1 : -1;
      const ok = k === 'plaza' || k === 'cor' ? true : m && ['crew', 'canteen', 'office', 'control', 'lab', 'medbay', 'barracks', 'cooling', 'guardroom'].includes(m.type);
      if (ok) { const n = Math.floor((b - a) / (k === 'cor' || k === 'plaza' ? 4.5 : 6)) || 1;
        for (let q = 0; q < n; q++) { const cc = a + (q + 0.5) * (b - a) / n, w = Math.min(r.range(1.8, 3.4), (b - a) / n - 1.4); if (w < 1.2 || r() < (k === 'cor' || k === 'plaza' ? 0.08 : 0.25)) continue; if (gaps.some(g => Math.abs(g[0] - cc) < g[1] / 2 + w / 2 + 0.6)) continue;
          const f0 = sgn < 0 ? -t / 2 - 0.06 : t / 2, f1 = sgn < 0 ? -t / 2 : t / 2 + 0.06, g0 = sgn < 0 ? -t / 2 - 0.04 : t / 2 + 0.01, g1 = sgn < 0 ? -t / 2 - 0.01 : t / 2 + 0.04;
          bx('matte', corp.trim, cc - w / 2 - 0.1, cc + w / 2 + 0.1, 1.2, 2.5, f0, f1); bx('emis', 0x01030a, cc - w / 2, cc + w / 2, 1.3, 2.4, g0, g1);
          for (let s = 0; s < 7; s++) { const sx = cc + r.range(-w / 2 + 0.1, w / 2 - 0.1), sy = r.range(1.4, 2.3); bx('emis', r() < 0.2 ? 0xffd9a0 : 0xcfe0ff, sx, sx + 0.05, sy, sy + 0.05, sgn < 0 ? g0 - 0.01 : g1, sgn < 0 ? g0 : g1 + 0.01); } } }
    }
  }
  for (const run of ship.runs) wallRun(run);
  for (const p of posts.values()) if (p.ax && p.az) { const s = p.t + 0.08; box('matte', corp.wall, p.x - s / 2, p.x + s / 2, 0, p.h, p.z - s / 2, p.z + s / 2); }
  // floors + ceilings of everything that isn't a room (corridors, plazas, ducts)
  const acc = new THREE.Color(corp.accent).multiplyScalar(0.55).getHex();
  { const open = []; // merged ceiling rects: rows of identical runs collapse
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx;) {
      const o = own[j * nx + i]; if (o < 0 || owners[o].kind === 'room') { i++; continue; }
      let i1 = i; while (i1 < nx && own[j * nx + i1] === o) i1++;
      const k = owners[o].kind, z0 = ZL + j;
      for (let x = i; x < i1;) { const xe = Math.min(i1, (x & ~3) + 4), alt = ((x >> 2) + (j >> 2)) & 1;
        const fc = k === 'plaza' ? mixc(alt ? corp.floor2 : corp.floor, corp.accent, 0.07) : k === 'duct' ? (alt ? 0x1b1d20 : 0x17191c) : (alt ? corp.floor2 : corp.floor);
        box('matte', fc, x, xe, 0, 0.012, z0, z0 + 1); x = xe; }
      if (k === 'duct') for (let x = i + 0.5; x < i1; x += 1.0) box('emis', new THREE.Color(corp.accent).multiplyScalar(0.18).getHex(), x, x + 0.05, 0.012, 0.02, z0 + 0.1, z0 + 0.9);
      open.push([o, i, i1, j]); i = i1;
    }
    // ceilings: stack identical runs from consecutive rows
    const live = new Map(), flushOpen = (maxJ) => { for (const [key, v] of live) if (v.last < maxJ) { const o = v.o, hc = owners[o].H; box('matte', 0x16181b, v.i0, v.i1, hc, hc + 0.3, ZL + v.j0, ZL + v.last + 1); live.delete(key); } };
    for (let j = 0; j <= nz; j++) { for (const q of open.filter(q => q[3] === j)) { const key = q[0] + ',' + q[1] + ',' + q[2], v = live.get(key); if (v && v.last === j - 1) v.last = j; else { if (v) { const hc = owners[v.o].H; box('matte', 0x16181b, v.i0, v.i1, hc, hc + 0.3, ZL + v.j0, ZL + v.last + 1); } live.set(key, { o: q[0], i0: q[1], i1: q[2], j0: j, last: j }); } } flushOpen(j); }
    flushOpen(nz + 2);
  }
  // corridor dressing from the carve records: lamps, ceiling ribs, pipe runs, a guide line down the spine
  const ownAt = (x, z) => { const i = Math.floor(x), j = Math.floor(z - ZL); return i < 0 || j < 0 || i >= nx || j >= nz ? -2 : own[j * nx + i]; };
  const lampDir = (x, z, dir, on, hc) => { box(on ? 'emis' : 'matte', on ? corp.light : 0x1a1c20, dir === 'x' ? x - 0.8 : x - 0.22, dir === 'x' ? x + 0.8 : x + 0.22, hc - 0.07, hc, dir === 'x' ? z - 0.22 : z - 0.8, dir === 'x' ? z + 0.22 : z + 0.8); if (on) S.lamps.push({ x, z, tint: corp.light }); };
  for (const cv of ship.carves) {
    if (cv.kind === 'plaza' || cv.kind === 'gallery') continue;
    const len = cv.dir === 'x' ? cv.x1 - cv.x0 : cv.z1 - cv.z0, wd = cv.dir === 'x' ? cv.z1 - cv.z0 : cv.x1 - cv.x0, mid = cv.dir === 'x' ? (cv.z0 + cv.z1) / 2 : (cv.x0 + cv.x1) / 2, hc = cv.kind === 'duct' ? 2.7 : H;
    const at = s => cv.dir === 'x' ? [s, mid] : [mid, s], s0 = cv.dir === 'x' ? cv.x0 : cv.z0;
    const wantO = cv.kind === 'duct' ? cv.id : 0;
    for (let s = s0 + 3.5; s < s0 + len - 1.5; s += cv.kind === 'duct' ? 6 : 7.5) { const [x, z] = at(s); if (ownAt(x, z) === wantO) lampDir(x, z, cv.dir, r() > (cv.kind === 'duct' ? 0.45 : 0.1), hc); }
    if (cv.kind !== 'duct') for (let s = s0 + 2; s < s0 + len - 1; s += 6) { const [x, z] = at(s); if (ownAt(x, z) === 0) box('matte', jit(corp.dado), cv.dir === 'x' ? x - 0.12 : x - wd / 2 + 0.05, cv.dir === 'x' ? x + 0.12 : x + wd / 2 - 0.05, hc - 0.16, hc, cv.dir === 'x' ? z - wd / 2 + 0.05 : z - 0.12, cv.dir === 'x' ? z + wd / 2 - 0.05 : z + 0.12); }
    if (len > 8) { const side = r() < 0.5 ? -1 : 1, off = side * (wd / 2 - 0.35), s1 = s0 + 1.5, s2 = s0 + len - 1.5, rad = cv.kind === 'duct' ? 0.07 : r.range(0.08, 0.14);
      if (cv.dir === 'x') { cylX('metal', jit(0x6a7076), s1, s2, hc - 0.3, mid + off, rad); if (r() < 0.6) cylX('metal', jit(corp.trim), s1, s2, hc - 0.55, mid + off, 0.05); } else { cylZ('metal', jit(0x6a7076), s1, s2, hc - 0.3, mid + off, rad); if (r() < 0.6) cylZ('metal', jit(corp.trim), s1, s2, hc - 0.55, mid + off, 0.05); } }
    if (cv.kind === 'spine' && cv.dir === 'x') for (let s = cv.x0 + 1; s < cv.x1 - 1; s += 2) { const z = mid; if (ownAt(s + 0.5, z) === 0) box('emis', acc, s, s + 1, 0.012, 0.02, z - 0.04, z + 0.04); }
  }
  // dock vestibules: a distinct floor + frame so arriving reads as a place
  for (const gx of [0, W - E]) { box('matte', corp.floor2, gx, gx + E, 0.012, 0.02, -ship.gh, ship.gh); for (const z of [-ship.gh + 2.5, 0, ship.gh - 2.5]) lampDir(gx + E / 2, z, 'x', r() > 0.1, H); }
  // plazas: open double-height squares with pillars, a planted dais, a ring balcony and a skylight
  for (const cv of ship.carves) if (cv.kind === 'plaza') {
    const { x0, x1, z0, z1 } = cv, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hp = ship.owners[cv.id].H;
    box('emis', new THREE.Color(corp.light).multiplyScalar(0.8).getHex(), cx - 3, cx + 3, hp - 0.05, hp, cz - 3, cz + 3); S.lamps.push({ x: cx, z: cz, tint: corp.light }); S.lamps.push({ x: x0 + 3, z: z0 + 3, tint: corp.light }); S.lamps.push({ x: x1 - 3, z: z1 - 3, tint: corp.light });
    cyl('metal', jit(0x3a4048), cx, cz, 1.6, 0, 0.4); cyl('emis', acc, cx, cz, 1.64, 0.22, 0.27); cyl('matte', 0x23403a, cx, cz, 1.2, 0.4, 0.46); col(cx - 1.6, cx + 1.6, cz - 1.6, cz + 1.6, 0.46);
    for (const [px, pz] of [[x0 + 3.2, z0 + 3.2], [x1 - 3.2, z0 + 3.2], [x0 + 3.2, z1 - 3.2], [x1 - 3.2, z1 - 3.2]]) { cyl('metal', jit(corp.dado), px, pz, 0.38, 0, hp); cyl('matte', corp.trim, px, pz, 0.43, 1.0, 1.08); cyl('matte', corp.trim, px, pz, 0.43, hp - 0.4, hp - 0.32); col(px - 0.4, px + 0.4, pz - 0.4, pz + 0.4, hp); }
    // balcony rim along the walls: overhead depth, high enough to walk under
    const by = 3.35; for (const [a0, a1, b0, b1] of [[x0, x1, z0 + 0.0, z0 + 1.0], [x0, x1, z1 - 1.0, z1], [x0, x0 + 1.0, z0, z1], [x1 - 1.0, x1, z0, z1]]) { box('metal', jit(0x3a4048), a0, a1, by, by + 0.14, b0, b1); }
    for (const [a0, a1, b0, b1] of [[x0 + 1.0, x1 - 1.0, z0 + 1.0, z0 + 1.04], [x0 + 1.0, x1 - 1.0, z1 - 1.04, z1 - 1.0], [x0 + 1.0, x0 + 1.04, z0 + 1.0, z1 - 1.0], [x1 - 1.04, x1 - 1.0, z0 + 1.0, z1 - 1.0]]) { box('metal', 0x555b63, a0, a1, by + 0.14, by + 1.0, b0, b1); box('emis', acc, a0, a1, by + 1.0, by + 1.04, b0, b1); }
  }
  // port doors + airlock chambers
  ship.ports.forEach(p => {
    const sgn = p.dir === 'w' ? -1 : 1, bx0 = p.dir === 'w' ? -7 : W, bx1 = p.dir === 'w' ? 0 : W + 7, wx = p.dir === 'w' ? 0 : W;
    box('matte', 0x23262b, bx0, bx1, -0.3, 0, p.z - 2.8, p.z + 2.8); box('matte', 0x15181c, bx0, bx1, H, H + 0.3, p.z - 2.8, p.z + 2.8);
    const wc = jit(corp.dado), t = 0.3;
    box('matte', wc, bx0, bx1, 0, H, p.z - 2.8 - t, p.z - 2.8); box('matte', wc, bx0, bx1, 0, H, p.z + 2.8, p.z + 2.8 + t); box('matte', wc, p.dir === 'w' ? bx0 - t : bx1, p.dir === 'w' ? bx0 : bx1 + t, 0, H, p.z - 2.8 - t, p.z + 2.8 + t);
    col(bx0, bx1, p.z - 2.8 - t, p.z - 2.8, H); col(bx0, bx1, p.z + 2.8, p.z + 2.8 + t, H); col(p.dir === 'w' ? bx0 - t : bx1, p.dir === 'w' ? bx0 : bx1 + t, p.z - 2.8 - t, p.z + 2.8 + t, H);
    box('emis', p.mine ? 0x66ffaa : 0xff5a3a, (p.dir === 'w' ? -3.6 : W + 3) , (p.dir === 'w' ? -3 : W + 3.6), H - 0.08, H, p.z - 0.5, p.z + 0.5); S.lamps.push({ x: p.dir === 'w' ? -3.3 : W + 3.3, z: p.z });
    if (!p.mine) {   // sealed hatch in the hull wall until a ship docks here
      const hm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 2.6), new THREE.MeshStandardMaterial({ color: 0x4a1f1a, metalness: 0.6, roughness: 0.5, emissive: 0x501008 })); hm.position.set(wx, 1.3, p.z); S.root.add(hm);
      const cc = { minx: wx - 0.25, maxx: wx + 0.25, minz: p.z - 1.3, maxz: p.z + 1.3, maxy: H }; S.colliders.push(cc);
      S.portDoors.push({ port: p, mesh: hm, col: cc });
    }
    // sign
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), new THREE.MeshBasicMaterial({ map: signTex(p.mine ? 'YOUR SHIP — PORT 0' : `PORT ${p.id}`, 384, 90, '#101418', p.mine ? '#6fffb0' : '#ff7a5a') }));
    sg.position.set(p.dir === 'w' ? 0.28 : W - 0.28, 2.75, p.z); sg.rotation.y = p.dir === 'w' ? Math.PI / 2 : -Math.PI / 2; S.root.add(sg);
  });
  // corp banner on the dock vestibule wall
  { const tx = signTex(corp.name.toUpperCase(), 768, 130, corp.sign[0], corp.sign[1]); const bn = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.8), new THREE.MeshBasicMaterial({ map: tx })); bn.position.set(E / 2, 2.9, ship.gh - 0.22); bn.rotation.y = Math.PI; S.root.add(bn); }

  // ---------------- rooms ----------------
  for (const m of ship.rooms) {
    const rs = m.rs, th = m.theme, H = m.H;
    curLight = th.light; curH = m.H;
    const fl = (x0, x1, z0, z1, c, y1 = 0.012, y0 = 0) => box('matte', c, x0, x1, y0, y1, z0, z1);
    fl(m.x0, m.x1, m.z0, m.z1, th.floor);
    { const fs = rs.fs, c2 = new THREE.Color(th.floor).offsetHSL(0, 0, 0.07).getHex(), dim = new THREE.Color(th.acc).multiplyScalar(0.35).getHex();
      if (fs === 'checker') for (let x = m.x0, i = 0; x < m.x1; x += 2, i++) for (let z = m.z0, j = 0; z < m.z1; z += 2, j++) { if ((i + j) & 1) fl(x, Math.min(m.x1, x + 2), z, Math.min(m.z1, z + 2), c2, 0.016, 0.012); }
      else if (fs === 'stripes') for (let x = m.x0 + 1.2; x < m.x1 - 0.6; x += 2.4) fl(x, Math.min(m.x1, x + 1.2), m.z0, m.z1, c2, 0.016, 0.012);
      else if (fs === 'grate') for (let x = m.x0 + 0.8; x < m.x1 - 0.4; x += 1.6) box('emis', dim, x, x + 0.08, 0.012, 0.02, m.z0 + 0.3, m.z1 - 0.3);
      else if (fs === 'hazard') { const b = new THREE.Color(th.acc).multiplyScalar(0.5).getHex(); for (const [a, bb, c, d] of [[m.x0 + 0.3, m.x1 - 0.3, m.z0 + 0.3, m.z0 + 0.5], [m.x0 + 0.3, m.x1 - 0.3, m.z1 - 0.5, m.z1 - 0.3], [m.x0 + 0.3, m.x0 + 0.5, m.z0 + 0.3, m.z1 - 0.3], [m.x1 - 0.5, m.x1 - 0.3, m.z0 + 0.3, m.z1 - 0.3]]) fl(a, bb, c, d, b, 0.018, 0.012); }
      else if (fs === 'carpet') fl(m.x0 + 0.9, m.x1 - 0.9, m.z0 + 0.9, m.z1 - 0.9, mixc(th.floor, th.acc, 0.14), 0.02, 0.012);
      else if (fs === 'tile') { for (let x = m.x0 + 1; x < m.x1; x += 2) fl(x, x + 0.04, m.z0, m.z1, c2, 0.016, 0.012); } }
    // lanes (kept clear) + door zones
    const lanes = [], pts = m.doors.map(d => ({ x: d.axis === 'x' ? d.u : d.side === 'w' ? m.x0 + 1.2 : m.x1 - 1.2, z: d.axis === 'x' ? (d.side === 's' ? m.z0 + 1.2 : m.z1 - 1.2) : d.u }));
    m.doors.forEach((d, i) => { const p = pts[i], q = pts[0], h = d.w / 2 + 0.4;   // a clear stub at every door, and an L-shaped through-path from the first door to each other one
      lanes.push(d.axis === 'x' ? [p.x - h, p.x + h, p.z - 1.5, p.z + 1.5] : [p.x - 1.5, p.x + 1.5, p.z - h, p.z + h]);
      if (i) lanes.push([Math.min(p.x, q.x) - 1.2, Math.max(p.x, q.x) + 1.2, q.z - 1.2, q.z + 1.2], [p.x - 1.2, p.x + 1.2, Math.min(p.z, q.z) - 1.2, Math.max(p.z, q.z) + 1.2]); });
    const hitLane = (x0, x1, z0, z1, pad = 0) => lanes.some(l => x1 > l[0] - pad && x0 < l[1] + pad && z1 > l[2] - pad && z0 < l[3] + pad);
    const occ = [];
    const isFree = (x0, x1, z0, z1, pad = 0.15) => {
      if (x0 < m.x0 + 0.45 || x1 > m.x1 - 0.45 || z0 < m.z0 + 0.45 || z1 > m.z1 - 0.45) return false;
      if (hitLane(x0, x1, z0, z1, pad)) return false;
      for (const o of occ) if (x1 > o[0] - pad && x0 < o[1] + pad && z1 > o[2] - pad && z0 < o[3] + pad) return false;
      return true;
    };
    const claim = (x0, x1, z0, z1, h = 0) => { occ.push([x0, x1, z0, z1]); if (h) col(x0, x1, z0, z1, h); };
    const pend = [];   // props are drawn after a walkability check, so clutter can never wall a room off
    const prop = (cx, cz, w, d, h, draw) => { const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2; if (!isFree(x0, x1, z0, z1)) return false; const rc = [x0, x1, z0, z1]; occ.push(rc); pend.push({ rc, h, draw, cx, cz }); return true; };
    const ledStrip = (cx, cz, w, y, zf, n = 3) => { for (let i = 0; i < n; i++) { const c = [corp.accent, 0x44ff88, 0xffb030, 0x44ff88][(i + ((cx * 7 + cz * 3) | 0)) & 3]; box('emis', c, cx - w / 2 + 0.1, cx + w / 2 - 0.1, y + i * 0.5, y + i * 0.5 + 0.05, cz + zf, cz + zf + 0.02 * Math.sign(zf)); } };
    // props
    const rack = (cx, cz, face) => prop(cx, cz, 0.9, 0.9, 2.1, (x, z) => { box('metal', jit(0x3a414b), x - 0.45, x + 0.45, 0, 2.1, z - 0.45, z + 0.45); box('matte', jit(0x14161a), x - 0.4, x + 0.4, 0.1, 2.0, z + face * 0.45, z + face * 0.47); ledStrip(x, z, 0.8, 0.35, face * 0.47, 4); });
    const terminal = (cx, cz, face) => prop(cx, cz, 1.3, 0.8, 1.0, (x, z) => { box('metal', jit(0x2b2f36), x - 0.65, x + 0.65, 0, 0.85, z - 0.4, z + 0.4); box('metal', 0x15171a, x - 0.5, x + 0.5, 0.85, 1.5, z - 0.04, z + 0.04); box('emis', corp.accent, x - 0.44, x + 0.44, 0.92, 1.44, z + face * 0.045, z + face * 0.05); });
    const bench = (cx, cz, w = 1.8, d = 0.8, h = 0.95, c = 0x3c4046) => prop(cx, cz, w, d, h, (x, z, x0, x1, z0, z1) => { box('metal', jit(c), x0, x1, 0.7, h, z0, z1); box('matte', 0x25282d, x0 + 0.05, x1 - 0.05, 0, 0.7, z0 + 0.05, z1 - 0.05); });
    const tank = (cx, cz, rad, h, c = corp.accent) => prop(cx, cz, rad * 2, rad * 2, h, (x, z) => { cyl('metal', jit(0x7a838c), x, z, rad, 0, h); box('matte', 0x23262a, x - rad - 0.02, x + rad + 0.02, h * 0.3, h * 0.3 + 0.12, z - rad - 0.02, z + rad + 0.02); cyl('emis', new THREE.Color(c).multiplyScalar(0.7).getHex(), x, z, rad + 0.015, h * 0.55, h * 0.55 + 0.08); });
    const shelf = (cx, cz, w, d) => prop(cx, cz, w, d, 2.0, (x, z, x0, x1, z0, z1) => { box('metal', jit(0x4a4f57), x0, x1, 0, 2.0, z0, z1); for (let y = 0.3; y < 2; y += 0.55) { box('matte', jit([0x6a5a3a, 0x3a5a6a, 0x5a3a3a][(r() * 3) | 0]), x0 + 0.08, x1 - 0.08, y, y + 0.35, z0 + 0.06, z1 - 0.06); } });
    const bunk = (cx, cz, w = 2.1, d = 1.0) => prop(cx, cz, w, d, 1.9, (x, z, x0, x1, z0, z1) => { box('metal', 0x2f3238, x0, x1, 0, 1.9, z0, z0 + 0.06); box('matte', jit(0x59606a), x0 + 0.05, x1 - 0.05, 0.4, 0.55, z0 + 0.06, z1 - 0.02); box('matte', jit(0x59606a), x0 + 0.05, x1 - 0.05, 1.3, 1.45, z0 + 0.06, z1 - 0.02); box('matte', 0xcfc7b4, x0 + 0.1, x0 + 0.5, 0.55, 0.65, z0 + 0.15, z1 - 0.15); });
    const machine = (cx, cz) => prop(cx, cz, 2.2, 2.2, 2.4, (x, z) => { box('metal', jit(0x4a4f57), x - 1.0, x + 1.0, 0, 0.9, z - 1.0, z + 1.0); cyl('metal', 0x7a8088, x, z, 0.35, 0.9, 2.2); cylX('metal', 0x6a7078, x, x + 1.0, 2.0, z, 0.12); box('emis', corp.accent, x + 0.9, x + 1.05, 1.9, 2.1, z - 0.1, z + 0.1); });
    const furnace = (cx, cz) => prop(cx, cz, 2.4, 2.0, 2.4, (x, z) => { box('metal', jit(0x3a2e28), x - 1.2, x + 1.2, 0, 2.4, z - 1.0, z + 1.0); box('emis', 0xff7a1a, x - 0.7, x + 0.7, 0.5, 1.3, z - 1.02, z - 0.98); box('emis', 0xff7a1a, x - 0.7, x + 0.7, 0.5, 1.3, z + 0.98, z + 1.02); S.lamps.push({ x, z, warm: true }); });
    const pipes = (x0, x1, z) => { cylX('metal', jit(0x6a7076), x0, x1, 2.85, z, 0.11); cylX('metal', jit(corp.trim), x0, x1, 3.1, z + 0.28, 0.08); };
    const decor = []; void decor;
    // container placement (loot)
    const kinds = ROOM_CONT[m.type] || ['crate', 'case'];
    const nLoot = m.loot; const wantVault = isVault(m.type);
    m.containers = [];
    const placeContainer = (kindName) => {
      const k = CONT[kindName]; const faces = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      for (let tries = 0; tries < 40; tries++) {
        const side = (r() * 4) | 0; let x, z, rot;   // hug a wall
        if (side === 0) { z = m.z0 + 0.5 + k.d / 2; x = r.range(m.x0 + 1, m.x1 - 1); rot = 0; } else if (side === 1) { z = m.z1 - 0.5 - k.d / 2; x = r.range(m.x0 + 1, m.x1 - 1); rot = Math.PI; }
        else if (side === 2) { x = m.x0 + 0.5 + k.d / 2; z = r.range(m.z0 + 1, m.z1 - 1); rot = Math.PI / 2; } else { x = m.x1 - 0.5 - k.d / 2; z = r.range(m.z0 + 1, m.z1 - 1); rot = -Math.PI / 2; }
        const odd = Math.abs(Math.sin(rot)) > 0.5, w = odd ? k.d : k.w, d = odd ? k.w : k.d;
        if (!isFree(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0.1)) continue;
        claim(x - w / 2, x + w / 2, z - d / 2, z + d / 2, k.h);
        return { x, z, rot, k, kindName };
      } return null;
    };
    for (let i = 0; i < nLoot; i++) {
      const kn = wantVault ? (i === 0 ? 'safe' : r.pick(['safe', 'case', 'drawer'])) : kinds[i % kinds.length];
      const spot = placeContainer(kn); if (!spot) continue;
      const tier = Math.min(5, ship.contract.depth); const n = kn === 'safe' ? r.int(2, 3) : kn === 'rack' ? r.int(1, 2) : r.int(1, 2); const items = [];
      for (let j = 0; j < n; j++) items.push(rollLoot(r, ship, wantVault || kn === 'safe', tier));
      const c = makeContainer(S, spot, corp, items, m); S.containers.push(c); m.containers.push(c);
    }
    // furniture by room type
    switch (m.type) {
      case 'serverhall': for (let z = m.z0 + 1.6; z < m.z1 - 1.2; z += 3.4) { const face = ((z - m.z0) / 3.4 | 0) % 2 ? -1 : 1; for (let x = m.x0 + 1.1; x < m.x1 - 0.9; x += 1.0) rack(x, z, face); } break;
      case 'control': for (let x = m.x0 + 1.4; x < m.x1 - 1; x += 1.7) terminal(x, m.z1 - 1.1, -1); for (let x = m.x0 + 1.4; x < m.x1 - 1; x += 1.7) terminal(x, m.z0 + 1.1, 1); bench((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 3.2, 1.4, 0.9, 0x2b2f36); break;
      case 'cooling': for (let x = m.x0 + 1.8; x < m.x1 - 1.4; x += 2.8) { tank(x, (m.z0 + m.z1) / 2 - 2.2, 0.9, 2.8, 0x4ac8ff); tank(x, (m.z0 + m.z1) / 2 + 2.2, 0.9, 2.8, 0x4ac8ff); } pipes(m.x0 + 0.5, m.x1 - 0.5, m.z0 + 1.2); pipes(m.x0 + 0.5, m.x1 - 0.5, m.z1 - 1.2); break;
      case 'power': for (let x = m.x0 + 1.4; x < m.x1 - 1.2; x += 1.5) for (const z of [m.z0 + 1.2, m.z1 - 1.2]) prop(x, z, 1.2, 1.0, 1.8, (cx, cz) => { box('metal', jit(0x2d3138), cx - 0.6, cx + 0.6, 0, 1.8, cz - 0.5, cz + 0.5); box('emis', 0xffd23f, cx - 0.4, cx + 0.4, 1.2, 1.3, cz - 0.52 * Math.sign(cz - (m.z0 + m.z1) / 2), cz - 0.5 * Math.sign(cz - (m.z0 + m.z1) / 2)); }); break;
      case 'storage': for (let z = m.z0 + 2; z < m.z1 - 1.5; z += 3.6) for (let x = m.x0 + 1.5; x < m.x1 - 1.3; x += 2.2) if (r() > 0.25) shelf(x, z, 1.9, 0.6); break;
      case 'crew': case 'barracks': for (let z = m.z0 + 1.2; z < m.z1 - 1; z += 2.6) for (let x = m.x0 + 1.5; x < m.x1 - 1.4; x += 2.7) if (r() > 0.2) bunk(x, z); bench((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 2.4, 1.0, 0.8); break;
      case 'lab': case 'chemlab': for (let x = m.x0 + 1.3; x < m.x1 - 1; x += 2.0) { bench(x, m.z0 + 1.0, 1.8, 0.8); bench(x, m.z1 - 1.0, 1.8, 0.8); } bench((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 3, 1.2, 0.95); for (let x = m.x0 + 1.2; x < m.x1 - 1; x += 2.6) if (r() > 0.4) box('emis', r() > 0.5 ? corp.accent : 0xff77aa, x - 0.1, x + 0.1, 0.96, 1.25, m.z0 + 0.95, m.z0 + 1.15); break;
      case 'vault': case 'evidence': if (m.z1 - m.z0 >= 7 && m.x1 - m.x0 >= 7) for (let x = m.x0 + 1.2; x < m.x1 - 1; x += 1.8) if (r() > 0.4) prop(x, m.z0 + 0.9, 1.0, 0.8, 1.2, (cx, cz) => box('metal', 0x383c44, cx - 0.5, cx + 0.5, 0, 1.2, cz - 0.4, cz + 0.4)); if (Math.min(m.x1 - m.x0, m.z1 - m.z0) >= 6.5) prop((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 1.4, 1.4, 1.0, (x, z) => { box('metal', 0x2a2d33, x - 0.7, x + 0.7, 0, 0.8, z - 0.7, z + 0.7); box('emis', corp.accent, x - 0.5, x + 0.5, 0.8, 0.86, z - 0.5, z + 0.5); S.lamps.push({ x, z, tint: corp.accent }); }); break;
      case 'tankhall': for (let z = m.z0 + 2.4; z < m.z1 - 1.6; z += 4.2) for (let x = m.x0 + 2.2; x < m.x1 - 1.6; x += 4.0) tank(x, z, 1.4, 3.2, corp.accent); pipes(m.x0 + 0.5, m.x1 - 0.5, (m.z0 + m.z1) / 2); break;
      case 'reactor': prop((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 3.0, 3.0, 3.2, (x, z) => { cyl('metal', 0x2d3238, x, z, 1.5, 0, 0.5); cyl('emis', corp.accent, x, z, 0.8, 0.5, 3.0); cyl('metal', 0x2d3238, x, z, 1.3, 3.0, 3.2); S.lamps.push({ x, z, tint: corp.accent }); }); pipes(m.x0 + 0.5, m.x1 - 0.5, m.z0 + 1.1); break;
      case 'medbay': for (let x = m.x0 + 1.4; x < m.x1 - 1.2; x += 2.4) bench(x, m.z0 + 1.2, 1.0, 2.0, 0.6, 0xdde5e9); break;
      case 'assembly': for (let x = m.x0 + 1.6; x < m.x1 - 1.6; x += 5) machine(x, (m.z0 + m.z1) / 2 - 3.3); bench((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, Math.max(4, m.x1 - m.x0 - 3), 1.1, 0.9, 0x363a40); for (let x = m.x0 + 1.6; x < m.x1 - 1.6; x += 5) machine(x, (m.z0 + m.z1) / 2 + 3.3); break;
      case 'foundry': for (let x = m.x0 + 2; x < m.x1 - 1.5; x += 3.6) { furnace(x, m.z0 + 1.7); if (r() > 0.4) furnace(x, m.z1 - 1.7); } bench((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 3.4, 1.3, 0.8, 0x3a3430); break;
      case 'office': for (let x = m.x0 + 1.6; x < m.x1 - 1.2; x += 2.8) bench(x, (m.z0 + m.z1) / 2, 1.8, 0.9, 0.85, 0x4a4338); break;
      case 'armoryhall': for (let z = m.z0 + 2; z < m.z1 - 1.5; z += 3.5) for (let x = m.x0 + 1.6; x < m.x1 - 1.4; x += 2.3) if (r() > 0.4) bench(x, z, 1.7, 0.7, 0.9, 0x3a3f36); break;
      case 'guardroom': bench((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 2.6, 1.2, 0.9, 0x3a3f36); for (let x = m.x0 + 1.2; x < m.x1 - 1; x += 1.8) terminal(x, m.z1 - 1.0, -1); break;
      case 'range': for (let x = m.x0 + 3; x < m.x1 - 1.5; x += 2.6) prop(x, m.z1 - 1.0, 0.8, 0.2, 1.8, (cx, cz) => { box('matte', 0x6a5a3a, cx - 0.4, cx + 0.4, 0.2, 1.8, cz - 0.1, cz + 0.1); box('emis', 0xff4a3a, cx - 0.15, cx + 0.15, 1.1, 1.4, cz - 0.11, cz - 0.1); }); break;
      case 'canteen': for (let z = m.z0 + 1.8; z < m.z1 - 1.4; z += 2.6) for (let x = m.x0 + 1.8; x < m.x1 - 1.4; x += 3.2) bench(x, z, 2.2, 0.9, 0.78, 0x59606a); break;
      case 'cellblock': {   // cells along both long walls, barred on the aisle side, one gap each
        const cw = 3.0; for (const side of [-1, 1]) {
          const zw = side < 0 ? m.z0 : m.z1, zb = side < 0 ? m.z0 + 3.2 : m.z1 - 3.2;
          for (let x = m.x0 + 0.7; x + cw < m.x1 - 0.5; x += cw) {
            const cx = x + cw / 2; if (hitLane(cx - cw / 2, cx + cw / 2, Math.min(zw, zb), Math.max(zw, zb), 0.3)) continue;
            if (!isFree(x, x + cw, Math.min(zw, zb) + (side < 0 ? 0.45 : 0), Math.max(zw, zb) - (side > 0 ? 0.45 : 0), 0.05)) continue;
            claim(x, x + cw, Math.min(zw, zb), Math.max(zw, zb), 0);
            for (let bxx = x; bxx < x + cw; bxx += 0.28) { if (Math.abs(bxx + 0.14 - cx) < 0.55) continue; box('metal', 0x8a929c, bxx, bxx + 0.05, 0, H - 0.4, zb - 0.03, zb + 0.03); }
            col(x, cx - 0.55, zb - 0.04, zb + 0.04, H); col(cx + 0.55, x + cw, zb - 0.04, zb + 0.04, H); box('metal', 0x8a929c, x, x + cw, 2.3, 2.4, zb - 0.04, zb + 0.04);
            col(x - 0.05, x + 0.05, Math.min(zw, zb), Math.max(zw, zb), H); box('matte', corp.dado, x - 0.05, x + 0.05, 0, H - 0.4, Math.min(zw, zb), Math.max(zw, zb));
            const bz = side < 0 ? zw + 0.9 : zw - 0.9; box('matte', 0x59606a, x + 0.2, x + 2.0, 0.3, 0.55, bz - 0.5, bz + 0.5); col(x + 0.2, x + 2.0, bz - 0.5, bz + 0.5, 0.55);
          }
        } break;
      }
    }
    // per-room extras so no two rooms read the same: wall screens, ceiling ducts, pillars
    { const nScr = r.int(1, 3); for (let i = 0; i < nScr; i++) { const back = r() < 0.5, zf = back ? m.z1 - 0.2 : m.z0 + 0.2, x = r.range(m.x0 + 1.4, m.x1 - 1.4); if (hitLane(x - 0.9, x + 0.9, zf - 0.3, zf + 0.3)) continue; const w = r.range(0.8, 1.6); box('metal', 0x15171a, x - w / 2 - 0.05, x + w / 2 + 0.05, 1.45, 2.05, back ? zf - 0.02 : zf - 0.02, back ? zf + 0.02 : zf + 0.02); box('emis', new THREE.Color(th.acc).multiplyScalar(r.range(0.5, 0.9)).getHex(), x - w / 2, x + w / 2, 1.5, 2.0, back ? zf - 0.04 : zf + 0.0, back ? zf - 0.0 : zf + 0.04); }
      if (r() < 0.6) { const zz = r.range(m.z0 + 1.4, m.z1 - 1.4); cylX('metal', mixc(th.dado, 0x888888, 0.4), m.x0 + 0.3, m.x1 - 0.3, H - 0.4, zz, r.range(0.1, 0.22)); if (r() < 0.5) cylX('metal', th.acc, m.x0 + 0.3, m.x1 - 0.3, H - 0.65, zz + 0.4, 0.06); }
      if (m.x1 - m.x0 > 13 && !['serverhall', 'tankhall', 'cellblock', 'vault', 'evidence'].includes(m.type) && r() < 0.6) for (const fx of [0.3, 0.7]) prop(m.x0 + (m.x1 - m.x0) * fx, (m.z0 + m.z1) / 2 + r.range(-2, 2), 0.55, 0.55, H, (x, z) => { box('metal', mixc(th.dado, 0x777777, 0.3), x - 0.27, x + 0.27, 0, H, z - 0.27, z + 0.27); box('emis', new THREE.Color(th.acc).multiplyScalar(0.6).getHex(), x - 0.28, x + 0.28, 1.0, 1.06, z - 0.28, z + 0.28); }); }
    // ceiling light panels
    box('matte', 0x16181b, m.x0, m.x1, H, H + 0.3, m.z0, m.z1);
    { const tall = m.z1 - m.z0 > (m.x1 - m.x0) * 1.3, len = tall ? m.z1 - m.z0 : m.x1 - m.x0, nl = Math.max(1, Math.round(len / 7));
      for (let i = 0; i < nl; i++) { const s2 = (i + 0.5) * len / nl; if (tall) lampDir((m.x0 + m.x1) / 2, m.z0 + s2, 'z', r() > (isVault(m.type) ? 0.35 : 0.14), H); else lamp(m.x0 + s2, (m.z0 + m.z1) / 2, r() > (isVault(m.type) ? 0.35 : 0.14)); } }
    // tall halls: an overhead gantry along one wall, high enough to walk under: a second level you can see but not reach
    if (H >= 4.6 && m.x1 - m.x0 >= 9 && m.z1 - m.z0 >= 7) { const gy = H - 1.45, north = r() < 0.5, g0 = north ? m.z1 - 1.5 : m.z0 + 0.45, g1 = north ? m.z1 - 0.45 : m.z0 + 1.5, rail = north ? g0 : g1;
      box('metal', jit(0x3a4048), m.x0 + 0.5, m.x1 - 0.5, gy, gy + 0.12, g0, g1); box('metal', 0x555b63, m.x0 + 0.5, m.x1 - 0.5, gy + 0.12, gy + 1.0, rail - 0.02, rail + 0.02); box('emis', new THREE.Color(th.acc).multiplyScalar(0.7).getHex(), m.x0 + 0.5, m.x1 - 0.5, gy + 1.0, gy + 1.04, rail - 0.03, rail + 0.03);
      for (let x = m.x0 + 2; x < m.x1 - 1; x += 4.5) box('metal', 0x2f3238, x - 0.05, x + 0.05, gy + 0.12, H, north ? g1 - 0.06 : g0, north ? g1 : g0 + 0.06); }

    // spots for enemies
    // walkability: 0.3 m grid, obstacles inflated by body radius; every door must reach every other door, else drop props until it does
    const gs = 0.3, gw = Math.ceil((m.x1 - m.x0) / gs), gd = Math.ceil((m.z1 - m.z0) / gs); let reach = null;
    const flood = () => { const bl = new Uint8Array(gw * gd), inf = 0.55;
      for (const o of occ) { const i0 = Math.max(0, Math.floor((o[0] - inf - m.x0) / gs)), i1 = Math.min(gw - 1, Math.floor((o[1] + inf - m.x0) / gs)), j0 = Math.max(0, Math.floor((o[2] - inf - m.z0) / gs)), j1 = Math.min(gd - 1, Math.floor((o[3] + inf - m.z0) / gs)); for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bl[j * gw + i] = 1; }
      for (let j = 0; j < gd; j++) for (let i = 0; i < gw; i++) if (i * gs < 0.45 || j * gs < 0.45 || (gw - i) * gs < 0.45 || (gd - j) * gs < 0.45) bl[j * gw + i] = 1;
      const pts = m.doors.map(d => { const x = d.axis === 'x' ? d.u : d.side === 'w' ? m.x0 + 0.8 : m.x1 - 0.8, z = d.axis === 'x' ? (d.side === 's' ? m.z0 + 0.8 : m.z1 - 0.8) : d.u; return [Math.min(gw - 1, Math.max(0, Math.floor((x - m.x0) / gs))), Math.min(gd - 1, Math.max(0, Math.floor((z - m.z0) / gs)))]; });
      for (const [i, j] of pts) bl[j * gw + i] = 0;   // the doorway itself is always open
      const seen = new Uint8Array(gw * gd), st = []; if (pts.length) { st.push(pts[0][1] * gw + pts[0][0]); seen[st[0]] = 1; }
      while (st.length) { const q = st.pop(), i = q % gw, j = (q / gw) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= gw || jj >= gd) continue; const k = jj * gw + ii; if (!seen[k] && !bl[k]) { seen[k] = 1; st.push(k); } } }
      reach = seen; return pts.every(([i, j]) => seen[j * gw + i]); };
    for (let guard = 0; guard < 200 && pend.length && !flood(); guard++) { const k = (r() * pend.length) | 0, p = pend.splice(k, 1)[0]; occ.splice(occ.indexOf(p.rc), 1); }
    for (const p of pend) { if (p.h) col(p.rc[0], p.rc[1], p.rc[2], p.rc[3], p.h); p.draw && p.draw(p.cx, p.cz, p.rc[0], p.rc[1], p.rc[2], p.rc[3]); }
    flood();
    m.spots = []; for (let t = 0; t < 160 && m.spots.length < 8; t++) { const x = r.range(m.x0 + 1.0, m.x1 - 1.0), z = r.range(m.z0 + 1.0, m.z1 - 1.0); if (isFree(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 0.2) && reach && reach[Math.floor((z - m.z0) / gs) * gw + Math.floor((x - m.x0) / gs)]) m.spots.push({ x, z }); }
    // vault doors are sealed until cracked
    if (isVault(m.type)) for (const d of m.doors) {
      const ax = d.axis === 'x', px = ax ? d.u : d.at, pz = ax ? d.at : d.u;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(ax ? d.w + 0.1 : 0.22, 2.4, ax ? 0.22 : d.w + 0.1), new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.85, roughness: 0.3, emissive: 0x300808 })); slab.position.set(px, 1.2, pz); S.root.add(slab);
      const cc = ax ? { minx: px - d.w / 2 - 0.05, maxx: px + d.w / 2 + 0.05, minz: pz - 0.12, maxz: pz + 0.12, maxy: H } : { minx: px - 0.12, maxx: px + 0.12, minz: pz - d.w / 2 - 0.05, maxz: pz + d.w / 2 + 0.05, maxy: H }; S.colliders.push(cc);
      const out = { s: [0, -1.1], n: [0, 1.1], w: [-1.1, 0], e: [1.1, 0] }[d.side];
      const vd = { room: m, mesh: slab, col: cc, open: false, pos: V(px + out[0], 1.1, pz + out[1]) }; S.doors.push(vd);
      S.interactables.push({ pos: vd.pos, r: 1.9, label: `${ROOM_LABEL[m.type]} door — sealed`, act: 'xvault', data: vd });
    }
  }
  // stashes tucked at the dead ends of ribs: the reward for going the long way round
  for (const st of ship.stashes) {
    const kn = r.pick(['case', 'crate', 'locker']), k = CONT[kn], tier = Math.min(5, ship.contract.depth), items = []; for (let j = 0; j < r.int(1, 2); j++) items.push(rollLoot(r, ship, false, tier));
    const c = makeContainer(S, { x: st.x, z: st.z, rot: st.rot, k, kindName: kn }, corp, items, null); S.containers.push(c);
  }
  bt.flush(S.root);
}

const _mats = {};
const cm = (k, f) => _mats[k] || (_mats[k] = f());
export function makeContainer(S, spot, corp, items, room) {
  const { x, z, rot, k, kindName } = spot; const g = new THREE.Group();
  const body = cm('b' + kindName + corp.short, () => new THREE.MeshStandardMaterial({ color: kindName === 'safe' ? 0x31353c : kindName === 'crate' ? 0x6b5a3c : new THREE.Color(corp.trim).multiplyScalar(0.55).getHex(), metalness: kindName === 'crate' ? 0.1 : 0.6, roughness: 0.5 }));
  const main = new THREE.Mesh(new THREE.BoxGeometry(k.w, k.h, k.d), body); main.position.y = k.h / 2; g.add(main);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: k.locked ? 0xff3030 : 0x55ff88 })); led.position.set(0, k.h - 0.12, k.d / 2 + 0.011); g.add(led);
  if (kindName === 'rack') { const gm = new THREE.MeshStandardMaterial({ color: 0x1c1e22, metalness: 0.7, roughness: 0.4 }); for (let i = 0; i < 3; i++) { const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.8), gm); gun.rotation.y = Math.PI / 2; gun.position.set(0, 0.4 + i * 0.28, k.d / 2 + 0.06); g.add(gun); } }
  if (kindName === 'safe') { const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0xb0b6be, metalness: 0.9 })); dial.rotation.x = Math.PI / 2; dial.position.set(0, k.h * 0.6, k.d / 2 + 0.02); g.add(dial); }
  g.position.set(x, 0, z); g.rotation.y = rot; S.root.add(g);
  const c = { g, led, x, z, kind: kindName, k, items, opened: false, locked: !!k.locked, room };
  S.interactables.push({ pos: V(x, 0.9, z), r: Math.max(1.5, k.w + 0.6), label: k.label, act: 'xloot', data: c, container: c });
  return c;
}
