// Floor plans for every building type: shops have a public sales floor plus staffed back-of-house rooms,
// homes have living/kitchen/bedrooms/bath, and the Commons is a dormitory block. All coordinates are building-local
// (u across the facade, v from back wall -D/2 to door wall +D/2); see interior-kit.js.
import * as THREE from '../vendor/three.module.js';
import { Ctx, signTex, marketTex } from './interior-kit.js';
import { gunMesh } from './models.js';

const PI = Math.PI;

// shop shell: sales floor in front, a partition with doorways, and a strip of back rooms
function shell(cx, S) {
  const vp = -cx.D / 2 + S.RD; cx.vp = vp; cx.wallCol = S.wall;
  cx.floor(cx.u0, cx.u1, vp + 0.1, cx.vf, S.floor[0], S.floor[1]);
  const gaps = [];
  S.rooms.forEach((rm, i) => {
    cx.floor(rm.u0, rm.u1, cx.vb, vp - 0.1, rm.fl[0], rm.fl[1]);
    gaps.push([rm.door, rm.dw || 1.2]); (rm.extra || []).forEach(g => gaps.push(g));
    if (i > 0) cx.wall('v', rm.u0, cx.vb, vp, [], { col: rm.wall ?? S.wall });
    cx.plaque(rm.door, vp + 0.115, rm.name, 0, 2.62, 1.0, rm.staff ? { bg: '#2a1010', fg: '#ff9a8a' } : {});
    const w = rm.u1 - rm.u0, n = Math.max(1, Math.round(w / 5));
    for (let k = 0; k < n; k++) cx.light(rm.u0 + (k + 0.5) * w / n, (cx.vb + vp) / 2, { w: Math.min(1.1, w - 1.2), d: 0.4, lamp: k === 0 });
  });
  cx.wall('u', vp, cx.u0, cx.u1, gaps);
  cx.rec.back = cx.P(0, vp + 1.4);
  const nu = Math.max(2, Math.round(cx.W / 5.5)), nv = Math.max(1, Math.round((cx.vf - vp - 0.1) / 4.5));
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) cx.light(cx.u0 + (i + 0.5) * (cx.u1 - cx.u0) / nu, vp + 0.1 + (j + 0.5) * (cx.vf - vp - 0.1) / nv, { w: 1.5, d: 0.5, lamp: (i + j) % 2 === 0 });
  return vp;
}

// ---------------------------------------------------------------- Rim Exchange (20 x 16)
function exchange(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  const vp = shell(cx, { RD: 5, wall: 0xd8d4c6, floor: ['floor', 0x8a7a60], rooms: [
    { name: 'VAULT', staff: 1, u0, u1: -5, door: -7.4, dw: 1.4, fl: ['concrete', 0x5a5e64], wall: 0x9aa0a6 },
    { name: 'ASSAY LAB', staff: 1, u0: -5, u1: 2, door: -2.0, fl: ['concrete', 0xb4b0a6] },
    { name: 'OFFICE', staff: 1, u0: 2, u1: 6.5, door: 4.25, fl: ['floor', 0x8a6a48] },
    { name: 'RESTROOM', u0: 6.5, u1, door: 8.2, dw: 1.1, fl: ['concrete', 0xaab4bc] },
  ] });
  // vault
  cx.put('depositwall', -7.4, vb + 0.15, 0, { w: 4.3 }); cx.put('depositwall', u0 + 0.15, -5.7, PI / 2, { w: 3.4 });
  cx.put('safe', -5.5, -6.5, -PI / 2); cx.put('safe', -5.5, -5.35, -PI / 2);
  cx.put('crates', -8.6, -4.0, 0, { n: 2, s: 0.7 });
  // assay lab
  cx.put('labbench', -3.3, vb + 0.45, 0, { w: 2.6 }); cx.put('labbench', 0.6, vb + 0.45, 0, { w: 2.6 });
  cx.put('scale', -2.6, vb + 0.45, 0, { y: 0.93, nocol: true });
  cx.put('cabinet', -4.65, -5.5, PI / 2); cx.put('cabinet', -4.65, -6.15, PI / 2); cx.put('stool', -1.0, -5.0);
  // office
  cx.put('desk', 5.2, vb + 0.5, 0, { w: 1.6 }); cx.put('chair', 5.2, vb + 1.55, PI); cx.put('cabinet', 2.4, -6.4, PI / 2); cx.put('cabinet', 2.4, -5.75, PI / 2); cx.put('plant', 2.7, -3.7);
  cx.rug(4.25, -5.3, 2.8, 2.0, 0x5a3a3a, 0x6a4a4a);
  // restroom
  cx.put('toilet', 9.15, vb + 0.4); cx.put('basin', 7.6, vb + 0.3);
  // sales floor
  cx.poster(1.1, vp + 0.115, 2.0, 3.4, 1.4, marketTex());
  cx.put('shelf', u0 + 0.25, 1.0, PI / 2, { len: 3, goods: ['ore', 'box'], r }); cx.put('shelf', u0 + 0.25, 5.0, PI / 2, { len: 3, goods: ['ore', 'cyl'], r });
  cx.put('shelf', u1 - 0.25, 1.0, -PI / 2, { len: 3, goods: ['ore', 'box'], r }); cx.put('shelf', u1 - 0.25, 5.0, -PI / 2, { len: 3, goods: ['box', 'ore'], r });
  cx.put('glasscase', -5.4, 3.2, 0, { w: 2.4, goods: 'ore' }); cx.put('glasscase', 5.4, 3.2, 0, { w: 2.4, goods: 'ore' });
  cx.put('bench', -6.2, vf - 0.4, PI, { w: 2.0, back: true, col: 0x5a4028 }); cx.put('bench', 6.2, vf - 0.4, PI, { w: 2.0, back: true, col: 0x5a4028 });
  cx.put('kiosk', -3.8, 5.6, 0); cx.put('kiosk', 3.8, 5.6, 0, { screen: 0xffd37a });
  cx.put('plant', -9.1, vf - 0.5); cx.put('plant', 9.1, vf - 0.5);
  cx.rug(0, 4.4, 7.5, 2.8, 0x2a3a5a, 0x3a4a6a);
}

// ---------------------------------------------------------------- Forge & Barrel (18 x 16)
function gunsmith(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  const vp = shell(cx, { RD: 5.5, wall: 0xcfcdc6, floor: ['floor', 0x6a5238], rooms: [
    { name: 'WORKSHOP', staff: 1, u0, u1: -1.5, door: -5.2, dw: 1.4, fl: ['concrete', 0x6a6a68] },
    { name: 'ARMORY', staff: 1, u0: -1.5, u1: 3.5, door: 0.0, dw: 1.2, fl: ['concrete', 0x555a60] },
    { name: 'TEST RANGE', u0: 3.5, u1, door: 6.2, dw: 1.3, fl: ['concrete', 0x77746c] },
  ] });
  // workshop
  cx.put('workbench', -7.2, vb + 0.5, 0, { w: 2.6 }); cx.put('workbench', -4.4, vb + 0.5, 0, { w: 2.2 }); cx.put('forge', -2.4, vb + 0.6, 0);
  cx.put('lathe', u0 + 0.5, -5.9, PI / 2); cx.put('anvil', -7.3, -3.7); cx.put('press', -2.5, -4.7, -PI / 2); cx.put('grinder', -3.0, -3.5);
  cx.put('crates', -2.6, -3.1, 0, { n: 2, s: 0.6, k: 1 });
  // armory
  cx.put('gunrack', 1.0, vb + 0.15, 0, { w: 3.4 }); cx.put('gunrack', -1.1, -5.4, PI / 2, { w: 2.6 }); cx.put('safe', 2.9, -3.6, -PI / 2);
  cx.put('crates', 2.6, -6.2, 0, { n: 2, s: 0.55, k: 2 }); cx.put('rack', 2.9, -5.1, -PI / 2, { w: 1.6, levels: 2 });
  // range: two firing booths, targets down the lane, sandbags
  cx.put('boothrail', 4.6, -3.9, 0, { w: 1.4 }); cx.put('boothrail', 8.0, -3.9, 0, { w: 1.4 });
  cx.put('target', 4.6, vb + 0.3, 0); cx.put('target', 6.2, vb + 0.3, 0); cx.put('target', 8.0, vb + 0.3, 0); cx.put('sandbags', 5.4, vb + 0.15, 0); cx.put('sandbags', 7.1, vb + 0.15, 0);
  cx.lb('matte', 0xb8b8b0, 3.6, u1, vb, vb + 0.06, 0.05, 0.08);
  // sales floor
  cx.rug(0, 4.4, 6.4, 3.4, 0x5a2a22, 0x7a3a2a);
  // gun wall on the left, ammo and accessories on the right
  { const bp = cx.P(u0 + 0.07, 3.3); const boardW = 5.6; const it = cx.put('gunrack', u0 + 0.18, 3.3, PI / 2, { w: boardW, nocol: true }); void it;
    ['pistol', 'coach', 'rifle', 'breacher', 'arc'].forEach((id, i) => { const g = gunMesh(id); g.scale.setScalar(2.2); const q = cx.P(u0 + 0.32, 3.3 - boardW / 2 + 0.6 + i * 1.1); g.position.set(q.x, 1.75, q.z); g.rotation.set(0, cx.rec.ry + PI / 2 + PI / 2, 0); cx.surf.root.add(g); }); void bp; cx.col(u0, u0 + 0.5, 3.3 - boardW / 2, 3.3 + boardW / 2, 2.2); }
  cx.put('shelf', u1 - 0.25, 2.0, -PI / 2, { len: 3, goods: ['box', 'cyl'], r }); cx.put('shelf', u1 - 0.25, 5.4, -PI / 2, { len: 3, goods: ['box', 'box'], r });
  cx.put('glasscase', -3.8, 5.2, 0, { w: 2.4, goods: 'gun' }); cx.put('glasscase', 3.8, 5.2, 0, { w: 2.4, goods: 'gun' });
  cx.put('noticeboard', -2.4, vp + 0.12 + 0.02, 0, { w: 1.2, nocol: true });
  cx.put('plant', -8.2, vf - 0.5); cx.put('plant', 4.4, vf - 0.5);
}

// ---------------------------------------------------------------- The Dry Dock cantina (20 x 16)
function cantina(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  const vp = shell(cx, { RD: 5, wall: 0xcdb6c6, floor: ['floor', 0x5a4030], rooms: [
    { name: 'KITCHEN', staff: 1, u0, u1: -3.5, door: -8.0, dw: 1.3, fl: ['concrete', 0xc4c8c4], extra: [[-5.2, 1.2, 'win']] },
    { name: 'CELLAR', staff: 1, u0: -3.5, u1: 4.5, door: 0.0, dw: 1.2, fl: ['concrete', 0x66625a] },
    { name: 'RESTROOMS', u0: 4.5, u1, door: 5.85, dw: 1.0, fl: ['concrete', 0xaab4bc], extra: [[8.5, 1.0]] },
  ] });
  // kitchen along back wall
  cx.put('fridge', -9.3, vb + 0.4, 0); cx.put('counterrun', -7.9, vb + 0.35, 0, { w: 1.8 }); cx.put('stove', -6.1, vb + 0.35, 0); cx.put('counterrun', -4.5, vb + 0.35, 0, { w: 1.5, sink: true });
  cx.put('island', -7.2, -5.0, 0, { w: 2.2 }); cx.put('barrel', -9.2, -3.7, 0, { col: 0x8a8a82 });
  // cellar
  cx.put('rack', -0.5, vb + 0.4, 0, { w: 3.0, goods: [0x2a6a3a, 0x7a3a1a, 0xaa6a1a] });
  for (let i = 0; i < 3; i++) cx.put('keg', -2.6, -6.6 + i * 1.05, PI / 2);
  cx.put('barrel', 3.5, -6.6); cx.put('barrel', 3.5, -5.7); cx.put('crates', 3.1, -4.2, 0, { n: 3, s: 0.65 });
  // restrooms: divider + two fixture sets
  cx.wall('v', 7.2, vb, vp, []);
  cx.put('toilet', 5.85, vb + 0.4); cx.put('basin', 4.95, -3.9, PI / 2); cx.put('toilet', 8.9, vb + 0.4); cx.put('basin', 9.55, -3.9, -PI / 2);
  // bar
  const vBar = vp + 4.0; const wood = 0x6a4a2e;
  for (const s of [-1, 1]) { const a = s > 0 ? 2.1 : -5.0, b = s > 0 ? 5.0 : -2.1; cx.lb('matte', wood, a, b, vBar - 0.45, vBar + 0.45, 0, 1.05); cx.lb('matte', 0x2a2018, a, b, vBar - 0.55, vBar + 0.55, 1.05, 1.11); cx.col(a, b, vBar - 0.45, vBar + 0.45, 1.1); }
  for (let i = 0; i < 8; i++) { const u = -4.3 + i * 1.2; if (Math.abs(u) < 0.7) continue; cx.put('stool', u, vBar + 0.95, 0, { nocol: true, col: 0x7a2a3a }); }
  // back bar: mirror + shelves of bottles on the partition face
  for (const [a, b] of [[-4.6, -0.9], [0.9, 4.4]]) {
    const m = (a + b) / 2; cx.art(m, vp + 0.14, 1.0, b - a, 1.5, 0xa8d0e8, 0, 'glass');
    cx.put('shelf', m, vp + 0.32, 0, { len: b - a - 0.2, levels: 3, goods: ['bottle'], r, nocol: true, y: 0.75 });
  }
  cx.col(-4.6, -0.9, vp + 0.1, vp + 0.5, 2.2); cx.col(0.9, 4.4, vp + 0.1, vp + 0.5, 2.2);
  // dance floor + band corner
  cx.lb('matte', 0x20202a, -2.6, 2.6, 3.6, 7.2, 0.05, 0.062); for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) cx.lb('emis', [0x7a2a8a, 0x2a6a8a][(i + j) % 4 === 0 ? 0 : 1], -2.6 + i * 1.04 + 0.04, -2.6 + (i + 1) * 1.04 - 0.04, 3.6 + j * 0.9 + 0.04, 3.6 + (j + 1) * 0.9 - 0.04, 0.062, 0.066);
  cx.put('drumkit', -7.6, 6.2, PI); cx.put('speaker', -9.2, 5.0, PI / 2); cx.put('speaker', -5.8, 6.9, PI); cx.put('micstand', -6.0, 5.2, PI, { nocol: true }); cx.rug(-7.6, 6.0, 3.6, 2.4, 0x3a1a3a);
  // tables
  [[-7.6, 0.6], [-7.6, 3.2], [-4.6, 5.3], [4.0, 6.8]].forEach(([u, v], i) => { cx.put('table', u, v, 0, { round: true, w: 1.0, col: 0x5a3a24 }); for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; cx.put('stool', u + Math.cos(a) * 0.82, v + Math.sin(a) * 0.82, 0, { nocol: true }); } });
  // booths on the right wall
  for (let i = 0; i < 3; i++) cx.put('booth', u1 - 1.2, 0.2 + i * 2.3, -PI / 2, { col: [0x7a2a3a, 0x2a4a6a, 0x3a5a3a][i] });
  cx.put('pooltable', 5.5, 5.0, 0); cx.put('jukebox', u1 - 0.5, vf - 0.55, -PI / 2);
  cx.put('table', 2.2, 7.0, 0, { round: true, w: 0.9 }); cx.put('plant', -9.2, vf - 0.5);
  const ne = cx.P(u0 + 0.12, 0); const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: signTex('OPEN ALL CYCLES', 384, 90, '#100818', '#ff6ae0') })); neon.position.set(ne.x, 2.6, ne.z); neon.rotation.y = cx.rec.ry + PI / 2; cx.surf.root.add(neon);
  const dg = cx.P(u1 - 0.1, 6.0); const dart = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshBasicMaterial({ color: 0x8a2a2a })); dart.position.set(dg.x, 1.7, dg.z); dart.rotation.y = cx.rec.ry - PI / 2; cx.surf.root.add(dart);
}

// ---------------------------------------------------------------- Outfitters (18 x 14)
function outfitter(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  const vp = shell(cx, { RD: 4.5, wall: 0xd8d0be, floor: ['floor', 0x8a6c48], rooms: [
    { name: 'STOCKROOM', staff: 1, u0, u1: -1.0, door: -5.5, dw: 1.4, fl: ['concrete', 0x77746c] },
    { name: 'FITTING', u0: -1.0, u1: 4.6, door: -0.065, dw: 0.9, fl: ['floor', 0x6a5a48], extra: [[1.8, 0.9], [3.665, 0.9]] },
    { name: 'OFFICE', staff: 1, u0: 4.6, u1, door: 6.7, dw: 1.1, fl: ['floor', 0x7a5a3a] },
  ] });
  // fitting cubicles
  cx.wall('v', 0.87, vb, vp, []); cx.wall('v', 2.73, vb, vp, []);
  for (const c of [-0.065, 1.8, 3.665]) { cx.put('fitting', c, vb + 0.25, 0, { nocol: true }); cx.put('curtain', c + 0.22, vp - 0.12, 0, { col: [0x7a2a3a, 0x2a4a6a, 0x3a5a3a][Math.round(c) + 1 < 0 ? 0 : (c > 3 ? 2 : 1)], w: 0.4, nocol: true }); }
  // stockroom
  cx.put('rack', -7.4, vb + 0.4, 0, { w: 2.6 }); cx.put('rack', -4.1, vb + 0.4, 0, { w: 2.2 }); cx.put('rack', u0 + 0.4, -4.3, PI / 2, { w: 2.4, levels: 2 });
  cx.put('crates', -2.2, -3.4, 0, { n: 3, s: 0.65 }); cx.put('crates', -2.3, -5.6, 0, { n: 2, s: 0.7, k: 2 });
  // office
  cx.put('desk', 7.2, vb + 0.5, 0, { w: 1.5 }); cx.put('chair', 7.2, vb + 1.5, PI); cx.put('cabinet', 5.0, -6.4, PI / 2); cx.put('cabinet', 5.0, -5.7, PI / 2); cx.put('rack', 6.5, -3.7, 0, { w: 1.6, levels: 2 }); cx.put('plant', 8.3, -3.8);
  // sales
  [[-5.0, 0.9, 0], [-5.0, 3.5, 1], [-5.0, 5.8, 2], [5.0, 3.5, 3], [5.0, 5.8, 4], [2.9, -0.7, 5]].forEach(([u, v, k]) => cx.put('clothrack', u, v, 0, { k }));
  cx.put('shelf', u0 + 0.25, 0.9, PI / 2, { len: 2.6, goods: ['cloth', 'box'], r }); cx.put('shelf', u0 + 0.25, 4.1, PI / 2, { len: 2.6, goods: ['cloth', 'cyl'], r });
  cx.put('shelf', u1 - 0.25, 3.6, -PI / 2, { len: 3, goods: ['cyl', 'box'], r }); cx.put('shelf', u1 - 0.25, 6.0, -PI / 2, { len: 2.0, goods: ['box', 'cyl'], r });
  cx.put('drum', u1 - 0.8, -1.4); cx.put('drum', u1 - 1.5, -1.0, 0, { col: 0x3a5a8a }); cx.put('drum', u1 - 0.8, -0.6, 0, { col: 0x4a6a3a });
  cx.put('mannequin', -3.2, vf - 0.7, 0, { col: 0x3a4a5a }); cx.put('mannequin', 3.2, vf - 0.7, 0, { col: 0x6a4a2e, col2: 0x3a3a3a });
  cx.rug(0, 4.2, 5, 2.8, 0x2a3a2a, 0x3a4a3a);
}

// ---------------------------------------------------------------- Rimway Patrol (18 x 14)
function patrol(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  const vp = shell(cx, { RD: 5, wall: 0xc4c9d0, floor: ['concrete', 0x8a8e94], rooms: [
    { name: 'HOLDING', staff: 1, u0, u1: -0.5, door: -1.6, dw: 1.3, fl: ['concrete', 0x5a5e64] },
    { name: 'INTERVIEW', staff: 1, u0: -0.5, u1: 4.0, door: 0.3, dw: 1.2, fl: ['concrete', 0x6a6e74], extra: [[3.3, 1.2, 'win']] },
    { name: 'LOCKERS', staff: 1, u0: 4.0, u1, door: 6.4, dw: 1.2, fl: ['concrete', 0x74787e] },
  ] });
  // holding cells behind bars
  const cw = (-0.6 - u0) / 3; const edges = [0, 1, 2, 3].map(i => u0 + i * cw); const barV = -3.9;
  cx.wall('v', edges[1], vb, barV, []); cx.wall('v', edges[2], vb, barV, []);
  cx.bars(u0, -0.6, barV, [[(edges[0] + edges[1]) / 2, 0.9], [(edges[1] + edges[2]) / 2, 0.9]]);
  for (let i = 0; i < 3; i++) { const L = edges[i], R = edges[i + 1]; cx.put('bunk', L + 0.7, vb + 1.2, 0, { frame: 0x4a4e54, blanket: 0x6a6e5a }); cx.put('cellstuff', R - 1.0, vb + 0.3, 0); cx.light((L + R) / 2, vb + 1.4, { w: 0.6, d: 0.3, lamp: i === 1, col: 0xd8e4ff }); }
  cx.put('bench', -6.3, -2.85, 0, { w: 1.6, metal: true, col: 0x5a5e64, nocol: false }); cx.put('locker', -3.3, -2.45, PI, { n: 1 });
  cx.lb('matte', 0xb02a2a, u0, -0.6, barV + 0.15, barV + 0.35, 0.05, 0.062);
  // interview room
  cx.put('table', 2.6, -5.0, 0, { w: 1.5, d: 0.8, col: 0x74787e }); cx.put('chair', 2.6, -4.15, PI, { col: 0x5a5e64 }); cx.put('chair', 2.6, -5.85, 0, { col: 0x5a5e64 }); cx.put('mirror', 3.95, -6.2, -PI / 2, { w: 0.01, h: 0.01, nocol: true });
  // lockers
  cx.put('locker', 6.6, vb + 0.25, 0, { n: 8 }); cx.put('gunrack', u1 - 0.3, -4.7, -PI / 2, { w: 2.8 }); cx.put('bench', 5.5, -4.9, 0, { w: 1.6, metal: true, col: 0x5a5e64 });
  // lobby
  [-3.5, -5.0, -6.5].forEach((u, i) => cx.poster(u, vp + 0.115, 1.7, 1.0, 1.35, signTex(i ? 'WANTED' : 'WANTED', 128, 170, '#d8c9a0', '#3a1010')));
  cx.put('noticeboard', 1.9, vp + 0.14, 0, { w: 1.4, nocol: true });
  cx.put('bench', u0 + 0.3, 1.2, PI / 2, { w: 2.4, back: true, metal: true, col: 0x4a4e54 }); cx.put('bench', u0 + 0.3, 4.3, PI / 2, { w: 2.4, back: true, metal: true, col: 0x4a4e54 });
  cx.put('desk', u1 - 0.5, 1.2, -PI / 2, { w: 1.6, screen: 0x6aa8ff }); cx.put('chair', u1 - 1.5, 1.2, PI / 2); cx.put('desk', u1 - 0.5, 3.9, -PI / 2, { w: 1.6, screen: 0x6aa8ff }); cx.put('chair', u1 - 1.5, 3.9, PI / 2);
  cx.put('locker', u1 - 0.3, 6.0, -PI / 2, { n: 3, col: 0x6a6e5a }); cx.put('flag', 7.4, vp + 0.5, 0);
  cx.put('coffeestn', -7.4, vf - 0.4, PI); cx.put('vending', -5.3, vf - 0.5, PI, { col: 0x3a4a6a });
  cx.rug(0, 4.4, 5.0, 2.6, 0x1a2438, 0x2a3a58);
}

// ---------------------------------------------------------------- For Lease unit (18 x 14)
function lease(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  const vp = shell(cx, { RD: 4, wall: 0xd4d6cc, floor: ['concrete', 0x9a9890], rooms: [
    { name: 'STORAGE', staff: 1, u0, u1: -3.5, door: -6.2, dw: 1.3, fl: ['concrete', 0x77746c] },
    { name: 'OFFICE', staff: 1, u0: -3.5, u1: 2.0, door: -0.7, dw: 1.2, fl: ['floor', 0x8a7a62] },
    { name: 'RESTROOM', u0: 2.0, u1: 5.5, door: 3.7, dw: 1.0, fl: ['concrete', 0xaab4bc] },
    { name: 'UTILITY', staff: 1, u0: 5.5, u1, door: 7.2, dw: 1.1, fl: ['concrete', 0x66625a] },
  ] });
  cx.put('rack', -6.2, vb + 0.4, 0, { w: 2.6, goods: [0x8a6a3e] }); cx.put('crates', -8.0, -4.2, 0, { n: 2, s: 0.7 });
  cx.put('desk', -1.4, vb + 0.5, 0, { w: 1.5, screen: false }); cx.put('chair', -1.4, vb + 1.5, PI); cx.put('dust', -3.0, -5.6, 0, { w: 0.9, d: 1.2, h: 0.9 });
  cx.put('toilet', 3.7, vb + 0.4); cx.put('basin', 2.5, -4.6, PI / 2);
  cx.put('drum', 8.2, -6.4, 0, { col: 0x8a8a82 }); cx.put('cabinet', 6.0, -6.4, PI / 2, { col: 0x5a6068 }); cx.put('paint', 6.2, -4.1);
  // the empty unit
  cx.poster(3.0, vp + 0.115, 1.9, 1.7, 0.6, signTex('FOR LEASE 400', 256, 90, '#e8e0c0', '#a02020'));
  cx.put('dust', -7.2, 1.2, 0, { w: 1.6, d: 0.9, h: 0.85 }); cx.put('dust', 7.1, 4.4, 0, { w: 2.0, d: 1.0, h: 1.0 }); cx.put('paint', -6.0, 5.6); cx.put('ladder', u0 + 0.3, 4.0, PI / 2); cx.put('crates', 7.0, 0.1, 0, { n: 2, s: 0.7, k: 1 }); cx.put('stool', 5.6, 6.2); cx.put('stool', 6.2, 6.6);
  cx.lb('matte', 0xb8b4a8, -2.6, 2.6, 5.0, 5.05, 0.05, 0.056);
}

// ---------------------------------------------------------------- Quarters (16 x 12)
const WALLS = [0xd8cfbc, 0xcfd6c8, 0xd6c6c0, 0xc8d0d8, 0xd9d4b8];
const SOFAS = [0x6a4a3a, 0x4a5a6a, 0x5a6a4a, 0x7a4a4a];
const BLANKETS = [0x4a5a7a, 0x7a4a4a, 0x4a7a5a, 0x8a7a4a, 0x6a4a7a];
function house(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  cx.wallCol = r.pick(WALLS); const vp = -cx.D / 2 + 4.6; cx.vp = vp; const sofa = r.pick(SOFAS);
  const rooms = [
    { name: 'MASTER', u0, u1: -2.4, door: -4.1, fl: ['floor', 0x8a6a48] }, { name: 'BATH', u0: -2.4, u1: 0.8, door: -0.8, dw: 1.0, fl: ['concrete', 0xa8b4bc] },
    { name: 'BED 2', u0: 0.8, u1: 4.3, door: 2.55, dw: 1.0, fl: ['floor', 0x9a7a52] }, { name: 'BED 3', u0: 4.3, u1, door: 6.1, dw: 1.0, fl: ['floor', 0x9a7a52] },
  ];
  cx.floor(u0, 1.6, vp + 0.1, vf, 'floor', 0x9a7a52); cx.floor(1.6, u1, vp + 0.1, vf, 'concrete', 0xc4c0b0);
  const gaps = [];
  rooms.forEach((rm, i) => { cx.floor(rm.u0, rm.u1, vb, vp - 0.1, rm.fl[0], rm.fl[1]); gaps.push([rm.door, rm.dw || 1.1]); if (i) cx.wall('v', rm.u0, vb, vp, []); cx.light((rm.u0 + rm.u1) / 2, (vb + vp) / 2, { w: 0.8, d: 0.4, lamp: i === 0 || i === 2 }); });
  cx.wall('u', vp, u0, u1, gaps); cx.rec.back = cx.P(0, vp + 1.4);
  cx.light(-4.5, 2.5, { w: 1.2 }); cx.light(4.5, 2.5, { w: 1.2 }); cx.light(0, 5.0, { w: 0.9, lamp: false });
  const bedTag = (i, n0) => { for (let k = n0; k < cx.beds.length; k++) cx.beds[k].room = i; };
  // master
  let n0 = cx.beds.length; cx.put('bed', -5.4, vb + 1.15, 0, { double: true, blanket: r.pick(BLANKETS) }); bedTag(0, n0);
  cx.put('nightstand', -6.75, vb + 0.4); cx.put('nightstand', -4.05, vb + 0.4); cx.put('wardrobe', u0 + 0.3, -3.0, PI / 2); cx.put('desk', -2.95, -4.5, -PI / 2, { w: 1.5 }); cx.put('chair', -3.75, -4.5, PI / 2);
  cx.rug(-5.4, -3.6, 3.6, 2.6, 0x6a3a3a, 0x7a4a4a);
  // bath
  cx.put('toilet', -1.7, vb + 0.4); cx.put('shower', 0.2, vb + 0.55, 0); cx.put('basin', -2.07, -3.6, PI / 2);
  // bed 2 / 3
  n0 = cx.beds.length; cx.put('bunk', 1.45, vb + 1.15, 0, { blanket: r.pick(BLANKETS) }); bedTag(2, n0); cx.put('locker', 3.95, -4.8, -PI / 2, { n: 2, col: 0x7a5a3a });
  n0 = cx.beds.length; cx.put('bunk', 7.3, vb + 1.15, 0, { blanket: r.pick(BLANKETS) }); bedTag(3, n0); cx.put('locker', 4.75, -4.8, PI / 2, { n: 2, col: 0x7a5a3a });
  cx.rug(2.55, -3.3, 1.8, 1.4, 0x4a5a6a); cx.rug(6.1, -3.3, 1.8, 1.4, 0x6a5a4a);
  // living room
  cx.rug(-5.4, 3.6, 4.4, 3.4, r.pick([0x6a3a3a, 0x3a4a6a, 0x4a5a3a]), 0x8a7a5a);
  cx.put('sofa', -3.8, 3.6, -PI / 2, { col: sofa }); cx.put('tv', -7.45, 3.6, PI / 2); cx.put('coffee', -5.7, 3.6, PI / 2); cx.put('armchair', -5.6, 1.4, 0.35, { col: r.pick(SOFAS) });
  cx.put('bookshelf', -6.3, vp + 0.1 + 0.17, 0, { w: 1.4 }); cx.put('bookshelf', -2.4, vp + 0.1 + 0.17, 0, { w: 1.0 }); cx.put('floorlamp', -7.3, 5.3); cx.put('plant', -7.3, -0.7);
  cx.put('bench', -2.5, vf - 0.35, PI, { w: 1.4, back: true }); cx.rug(0, vf - 0.7, 1.6, 0.8, 0x4a4036);
  // kitchen + dining
  cx.put('fridge', 7.5, -0.45, -PI / 2); cx.put('counterrun', 7.5, 1.0, -PI / 2, { w: 2.0 }); cx.put('stove', 7.5, 2.5, -PI / 2); cx.put('counterrun', 7.5, 3.95, -PI / 2, { w: 1.8, sink: true });
  cx.put('table', 4.4, 3.6, 0, { w: 1.9, d: 0.95 }); cx.put('chair', 3.95, 2.9, 0, {}); cx.put('chair', 4.85, 2.9, 0, {}); cx.put('chair', 3.95, 4.3, PI, {}); cx.put('chair', 4.85, 4.3, PI, {});
  cx.put('shelf', 4.3, vp + 0.1 + 0.2, 0, { len: 2.0, levels: 4, goods: ['box', 'cyl'], r, nocol: false }); cx.put('plant', 2.6, 5.2);
  // route a resident takes from the front door to a bed (world points)
  cx.rec.entry = cx.P(0, vf - 0.8); cx.rec.roomDoors = rooms.map(rm => rm.door);
  cx.rec.route = bed => { const du = cx.rec.roomDoors[bed.room]; return [cx.rec.entry, cx.P(0, vp + 1.0), cx.P(du, vp + 1.0), cx.P(du, vp - 1.0)]; };
}

// ---------------------------------------------------------------- Rimway Commons dormitory block (28 x 14)
function habitat(cx) {
  const r = cx.r, { u0, u1, vb, vf } = cx;
  cx.wallCol = 0xd2d0c6; const vp = -cx.D / 2 + 4.8; cx.vp = vp; const N = 7, cw = (u1 - u0) / N;
  cx.floor(u0, u1, vp + 0.1, vf, 'floor', 0x8a7458);
  const gaps = [];
  for (let i = 0; i < N; i++) {
    const L = u0 + i * cw, R = L + cw, c = (L + R) / 2; cx.floor(L, R, vb, vp - 0.1, 'floor', 0x6a5a48); gaps.push([c, 1.0]); if (i) cx.wall('v', L, vb, vp, []);
    cx.plaque(c, vp + 0.115, 'C' + (i + 1), 0, 2.62, 0.6);
    const n0 = cx.beds.length;
    cx.put('bunk', L + 0.72, vb + 1.2, 0, { blanket: r.pick(BLANKETS) }); cx.put('bunk', R - 0.72, vb + 1.2, 0, { blanket: r.pick(BLANKETS) }); cx.put('footlocker', c, vb + 0.3, 0);
    for (let k = n0; k < cx.beds.length; k++) cx.beds[k].room = i;
    cx.rug(c, -3.9, 1.3, 1.2, 0x5a4a3a);
    cx.light(c, (vb + vp) / 2, { w: 0.8, d: 0.35, lamp: i % 2 === 0 });
  }
  cx.wall('u', vp, u0, u1, gaps); cx.rec.back = cx.P(0, vp + 1.4);
  // service rooms across the front: kitchen (left), laundry, washroom (right)
  const vs = 2.8;
  cx.floor(u0, -8.0, vs, vf, 'concrete', 0xc4c8c4); cx.floor(3.0, 8.0, vs, vf, 'concrete', 0xb0b4b0); cx.floor(8.0, u1, vs, vf, 'concrete', 0xaab4bc); cx.floor(-8.0, 3.0, vs, vf, 'floor', 0x8a7458);
  cx.wall('u', vs, u0, -8.0, [[-9.0, 1.4]]); cx.wall('v', -8.0, vs, vf, [[4.7, 1.6, 'win']]);
  cx.wall('u', vs, 3.0, u1, [[3.8, 1.2], [12.6, 1.2]]); cx.wall('v', 3.0, vs, vf, []); cx.wall('v', 8.0, vs, vf, []);
  cx.plaque(-9.0, vs - 0.115, 'KITCHEN', PI, 2.62, 1.0); cx.plaque(3.8, vs - 0.115, 'LAUNDRY', PI, 2.62, 1.0); cx.plaque(12.6, vs - 0.115, 'WASH', PI, 2.62, 0.8);
  // kitchen
  cx.put('fridge', -13.4, vf - 0.4, PI); cx.put('counterrun', -11.9, vf - 0.35, PI, { w: 1.8 }); cx.put('stove', -10.1, vf - 0.35, PI); cx.put('counterrun', -8.9, vf - 0.35, PI, { w: 1.2, sink: true });
  cx.put('island', -12.0, 4.7, 0, { w: 2.2 }); cx.put('rack', u0 + 0.4, 3.9, PI / 2, { w: 1.6, levels: 2 });
  cx.light(-11, 4.8, { w: 1.2 });
  // laundry
  for (let i = 0; i < 4; i++) cx.put('washer', 4.1 + i * 0.85, vf - 0.4, PI); cx.put('table', 6.4, 4.0, 0, { w: 2.0, d: 0.9, col: 0x9a9a92 }); cx.put('cabinet', 7.6, 3.4, -PI / 2, { col: 0xa8acb2 }); cx.light(5.5, 4.8, { w: 1.2, lamp: false });
  // washroom
  for (let i = 0; i < 3; i++) cx.put('shower', 13.2 - i * 1.15, vf - 0.55, PI);
  cx.put('toilet', 9.4, vf - 0.4, PI); cx.put('toilet', 8.6, vf - 0.4, PI, { nocol: false }); cx.put('basin', u1 - 0.3, 4.2, -PI / 2); cx.put('basin', u1 - 0.3, 5.0, -PI / 2); cx.light(11, 4.8, { w: 1.2, lamp: false });
  // lobby / reception
  cx.put('counterrun', -4.2, 4.4, 0, { w: 3.0, body: 0x6a5a48, top: 0x2a2018 }); cx.put('locker', -6.6, vf - 0.3, PI, { n: 6, col: 0x8a7a5a }); cx.put('plant', -1.9, vf - 0.5); cx.put('plant', 1.9, vf - 0.5);
  cx.put('bench', 2.0, 3.6, PI / 2, { w: 1.8, back: true, col: 0x5a4028 }); cx.rug(0, 5.0, 3.2, 2.4, 0x4a3a2a, 0x6a5a3a);
  // canteen: two long tables with benches; lounge on the right
  [-11.0, -6.0].forEach(u => { cx.put('table', u, 0.9, 0, { w: 3.2, d: 0.95, col: 0x7a5a3a }); cx.put('bench', u, 0.1, PI, { w: 3.0, nocol: true }); cx.put('bench', u, 1.7, 0, { w: 3.0, nocol: true }); });
  cx.put('tv', 6.8, 2.45, PI); cx.put('sofa', 6.8, 0.0, 0, { col: 0x4a5a6a }); cx.put('coffee', 6.8, 1.3, 0); cx.put('armchair', 4.0, 1.2, -PI / 2, { col: 0x6a4a3a }); cx.put('armchair', 9.6, 1.2, PI / 2, { col: 0x6a4a3a });
  cx.put('bookshelf', 10.5, vs - 0.1 - 0.17, PI, { w: 1.2 }); cx.put('plant', 13.0, 0.2); cx.put('noticeboard', -3.0, vp + 0.14, 0, { w: 1.2, nocol: true });
  cx.rug(6.8, 1.0, 5.6, 3.0, 0x3a4a5a, 0x4a5a6a);
  [[-9, 0.5], [-2, 0.5], [3, 0.5], [10, 0.5], [-6, 2.0], [12, 2.0]].forEach(([u, v], i) => cx.light(u, v, { w: 1.4, d: 0.5, lamp: i % 2 === 0 }));
  cx.rec.entry = cx.P(0, vf - 0.8); cx.rec.roomDoors = Array.from({ length: N }, (_, i) => u0 + (i + 0.5) * cw);
  cx.rec.route = bed => { const du = cx.rec.roomDoors[bed.room]; return [cx.rec.entry, cx.P(0, -1.0), cx.P(du, -1.0), cx.P(du, vp - 1.0)]; };
}

const LAYOUT = { exchange, gunsmith, cantina, outfitter, patrol, lease, house, habitat };

export function furnishBuilding(surf, rec, r) {
  const fn = LAYOUT[rec.id]; if (!fn) return;
  const cx = new Ctx(surf, rec, r); fn(cx); cx.finish();
  rec.beds = cx.beds; rec.vp = cx.vp;
}
