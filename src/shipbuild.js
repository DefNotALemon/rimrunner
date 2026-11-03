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

export function buildShip(ship, S) {
  const r = rng(ship.seed ^ 0x77aa), corp = ship.corp, H = ship.H, W = ship.W;
  const bt = new Batch(); S.lamps = []; S.containers = []; S.doors = []; S.portDoors = [];
  const jit = (col, a = 0.06) => { _c.set(col); const k = 1 + (r() - 0.5) * a * 2; return _c.setRGB(Math.min(1, _c.r * k), Math.min(1, _c.g * k), Math.min(1, _c.b * k)).getHex(); };
  const box = (kind, col, x0, x1, y0, y1, z0, z1) => { _m.compose(_p.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q.identity(), _s.set(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0))); bt.put(kind, UB, _m, col); };
  const cyl = (kind, col, cx, cz, rad, y0, y1) => { _m.compose(_p.set(cx, (y0 + y1) / 2, cz), _q.identity(), _s.set(rad, y1 - y0, rad)); bt.put(kind, UC, _m, col); };
  const cylX = (kind, col, x0, x1, cy, cz, rad) => { _q.setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)); _m.compose(_p.set((x0 + x1) / 2, cy, cz), _q, _s.set(rad, x1 - x0, rad)); bt.put(kind, UC, _m, col); };
  const cylZ = (kind, col, z0, z1, cy, cx, rad) => { _q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)); _m.compose(_p.set(cx, cy, (z0 + z1) / 2), _q, _s.set(rad, z1 - z0, rad)); bt.put(kind, UC, _m, col); };
  const col = (x0, x1, z0, z1, h) => S.colliders.push({ minx: x0, maxx: x1, minz: z0, maxz: z1, maxy: h });
  const lamp = (x, z, on = true) => { box(on ? 'emis' : 'matte', on ? corp.light : 0x1a1c20, x - 0.8, x + 0.8, H - 0.07, H, z - 0.22, z + 0.22); if (on) S.lamps.push({ x, z }); };

  // ---------------- shell ----------------
  const ZL = ship.zlo, ZH = ship.zhi, E = ship.E;
  box('matte', corp.floor, -0.3, W + 0.3, -0.3, 0, ZL - 0.3, ZH + 0.3);                         // deck
  box('matte', 0x16181b, -0.3, W + 0.3, H, H + 0.3, ZL - 0.3, ZH + 0.3);                        // ceiling
  // wall helper: axis 'x' = runs along x at fixed z=at; axis 'z' = runs along z at fixed x=at. gaps [[centre,width],...]
  function wall(axis, at, a, b, gaps = [], o = {}) {
    const t = o.t || 0.3, hh = o.h || H, wc = o.col ?? corp.wall, dc = o.dado ?? corp.dado;
    const bx = (kind, c, s0, s1, y0, y1, ex = 0) => axis === 'x' ? box(kind, c, s0, s1, y0, y1, at - t / 2 - ex, at + t / 2 + ex) : box(kind, c, at - t / 2 - ex, at + t / 2 + ex, y0, y1, s0, s1);
    const cl = (s0, s1, h) => axis === 'x' ? col(s0, s1, at - t / 2, at + t / 2, h) : col(at - t / 2, at + t / 2, s0, s1, h);
    const seg = (s0, s1) => { if (s1 - s0 < 0.04) return; bx('matte', jit(wc), s0, s1, 1.05, hh); bx('matte', jit(dc), s0, s1, 0, 1.05, 0.02); bx('matte', corp.trim, s0, s1, 1.05, 1.11, 0.03); cl(s0, s1, hh); };
    let cur = a;
    for (const [c, w] of gaps.slice().sort((p, q) => p[0] - q[0])) {
      const g0 = c - w / 2, g1 = c + w / 2; seg(cur, g0);
      bx('matte', jit(wc), g0, g1, 2.4, hh); bx('matte', corp.trim, g0, g1, 2.34, 2.4, 0.04);
      bx('matte', corp.trim, g0 - 0.1, g0, 0, 2.4, 0.04); bx('matte', corp.trim, g1, g1 + 0.1, 0, 2.4, 0.04);
      cur = g1;
    }
    seg(cur, b);
  }
  // hull
  const portsW = ship.ports.filter(p => p.dir === 'w').map(p => [p.z, 2.6]), portsE = ship.ports.filter(p => p.dir === 'e').map(p => [p.z, 2.6]);
  wall('x', ZL, 0, W, [], { t: 0.5, col: jit(corp.dado), dado: 0x15181c }); wall('x', ZH, 0, W, [], { t: 0.5, col: jit(corp.dado), dado: 0x15181c });
  wall('z', 0, ZL, ZH, portsW, { t: 0.5, col: jit(corp.dado), dado: 0x15181c }); wall('z', W, ZL, ZH, portsE, { t: 0.5, col: jit(corp.dado), dado: 0x15181c });
  // corridors: walls with door gaps
  ship.cors.forEach((k, i) => { wall('x', k.z0, E, W - E, ship.gaps[i].s); wall('x', k.z1, E, W - E, ship.gaps[i].n); });
  // band end walls + room dividers (per band only; corridors run through the end galleries)
  for (const b of ship.bands) {
    wall('z', E, b.z0, b.z1); wall('z', W - E, b.z0, b.z1);
    for (const m of b.rooms) if (m.x1 < W - E - 0.5) wall('z', m.x1, b.z0, b.z1, [], { t: 0.25 });
  }
  // floor tiles + guide strips in corridors / galleries
  const acc = new THREE.Color(corp.accent).multiplyScalar(0.55).getHex();
  ship.cors.forEach(k => {
    for (let x = 0; x < W; x += 4) box('matte', ((x / 4) | 0) % 2 ? corp.floor2 : corp.floor, x, Math.min(W, x + 4), 0, 0.012, k.z0 + 0.08, k.z1 - 0.08);
    box('emis', acc, 0, W, 0.012, 0.02, k.z0 + 0.2, k.z0 + 0.26); box('emis', acc, 0, W, 0.012, 0.02, k.z1 - 0.26, k.z1 - 0.2);
    for (let x = 4; x < W - 3; x += 7.5) lamp(x, k.zc, r() > 0.1);
  });
  for (const gx of [0, W - E]) { box('matte', corp.floor2, gx, gx + E, 0, 0.012, ZL, ZH); for (let z = ZL + 4; z < ZH - 2; z += 7) lamp(gx + E / 2, z, r() > 0.1); }
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
  // corp banner in the entry gallery
  { const tx = signTex(corp.name.toUpperCase(), 768, 130, corp.sign[0], corp.sign[1]); const bn = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.0), new THREE.MeshBasicMaterial({ map: tx })); const mp = ship.ports[0]; bn.position.set(E - 0.2, 2.9, mp.z + (mp.z > ship.zlo + 6 ? -6 : 6)); bn.rotation.y = -Math.PI / 2; S.root.add(bn); }

  // ---------------- rooms ----------------
  for (const m of ship.rooms) {
    const label = ROOM_LABEL[m.type] || m.type.toUpperCase();
    box('matte', m.type === 'vault' || m.type === 'evidence' ? 0x2a2c33 : jit(corp.floor2, 0.12), m.x0, m.x1, 0, 0.012, m.z0, m.z1);
    // lanes (kept clear) + door zones
    const lanes = m.doors.map(d => [d.u - 1.25, d.u + 1.25, m.z0, m.z1]);
    const occ = [];
    const isFree = (x0, x1, z0, z1, pad = 0.15) => {
      if (x0 < m.x0 + 0.45 || x1 > m.x1 - 0.45 || z0 < m.z0 + 0.45 || z1 > m.z1 - 0.45) return false;
      for (const l of lanes) if (x1 > l[0] - pad && x0 < l[1] + pad) return false;
      for (const o of occ) if (x1 > o[0] - pad && x0 < o[1] + pad && z1 > o[2] - pad && z0 < o[3] + pad) return false;
      return true;
    };
    const claim = (x0, x1, z0, z1, h = 0) => { occ.push([x0, x1, z0, z1]); if (h) col(x0, x1, z0, z1, h); };
    const prop = (cx, cz, w, d, h, draw) => { const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2; if (!isFree(x0, x1, z0, z1)) return false; claim(x0, x1, z0, z1, h); draw && draw(cx, cz, x0, x1, z0, z1); return true; };
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
      case 'vault': case 'evidence': for (let x = m.x0 + 1.2; x < m.x1 - 1; x += 1.8) if (r() > 0.4) prop(x, m.z0 + 0.9, 1.0, 0.8, 1.2, (cx, cz) => box('metal', 0x383c44, cx - 0.5, cx + 0.5, 0, 1.2, cz - 0.4, cz + 0.4)); prop((m.x0 + m.x1) / 2, (m.z0 + m.z1) / 2, 1.4, 1.4, 1.0, (x, z) => { box('metal', 0x2a2d33, x - 0.7, x + 0.7, 0, 0.8, z - 0.7, z + 0.7); box('emis', corp.accent, x - 0.5, x + 0.5, 0.8, 0.86, z - 0.5, z + 0.5); S.lamps.push({ x, z, tint: corp.accent }); }); break;
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
            const cx = x + cw / 2; if (lanes.some(l => cx + cw / 2 > l[0] - 0.3 && cx - cw / 2 < l[1] + 0.3)) continue;
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
    // ceiling light panels
    const nl = Math.max(1, Math.round((m.x1 - m.x0) / 7)); for (let i = 0; i < nl; i++) lamp(m.x0 + (i + 0.5) * (m.x1 - m.x0) / nl, (m.z0 + m.z1) / 2, r() > (isVault(m.type) ? 0.35 : 0.14));
    // spots for enemies
    m.spots = []; for (let t = 0; t < 60 && m.spots.length < 8; t++) { const x = r.range(m.x0 + 1.2, m.x1 - 1.2), z = r.range(m.z0 + 1.2, m.z1 - 1.2); if (isFree(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 0.2)) m.spots.push({ x, z }); }
    // doors: room sign on the corridor side
    if (m.x1 - m.x0 >= 9) for (const d of m.doors) {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.4), new THREE.MeshBasicMaterial({ map: signTex(label, 384, 90, corp.sign[0], corp.sign[1]) }));
      sg.position.set(d.u, 2.62, d.z + (d.side === 's' ? -0.18 : 0.18)); sg.rotation.y = d.side === 's' ? Math.PI : 0; S.root.add(sg);
    }
    // vault doors are sealed until cracked
    if (isVault(m.type)) for (const d of m.doors) {
      const zc = d.z; const slab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 0.22), new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.85, roughness: 0.3, emissive: 0x300808 })); slab.position.set(d.u, 1.2, zc); S.root.add(slab);
      const cc = { minx: d.u - 1.0, maxx: d.u + 1.0, minz: zc - 0.12, maxz: zc + 0.12, maxy: H }; S.colliders.push(cc);
      const vd = { room: m, mesh: slab, col: cc, open: false, pos: V(d.u, 1.1, zc + (d.side === 's' ? -1.1 : 1.1)) }; S.doors.push(vd);
      S.interactables.push({ pos: vd.pos, r: 1.9, label: `${ROOM_LABEL[m.type]} door — sealed`, act: 'xvault', data: vd });
    }
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
