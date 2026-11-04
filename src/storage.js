// Extraction storage: loot SHELVES (freestanding units + wall shelving) and the space-themed containers.
// ENCLOSED kinds (canister, cryo, evalocker, ammocan, pod, medcab) work like makeContainer's crates: search -> their own rig
// opens (cap twists off, lid lifts, door pops its seal...), contents lie inside. OPEN kinds (pallet, toolboard, bin) and every
// shelf show their loot from the start: no search, aim + fire grabs it into the shoulder bag (stash.js "displays").
// Shelf frames are static batched boxes (shipbuild's Batch); only the loose items are separate meshes, built near the player.
// Docs: docs/STORAGE.md.  Debug: window.__rr.storage
import * as THREE from '../vendor/three.module.js';
import { ITEMS, GUN } from './data.js';
import { uid } from './state.js';
import { rollLoot } from './ships.js';

// ---------------------------------------------------------------- kinds
// w,h,d footprint (front is +z), label = the search prompt. open: loot in plain sight. glass: you see it, but must open to grab.
export const STORE = {
  canister:  { w: 0.72, h: 0.9, d: 0.72, label: 'Unseal cargo canister' },
  cryo:      { w: 0.9, h: 0.52, d: 0.56, label: 'Open cryo case' },
  evalocker: { w: 0.84, h: 2.05, d: 0.64, label: 'Unseal suit locker' },
  ammocan:   { w: 0.62, h: 0.4, d: 0.36, label: 'Open ammo can' },
  pod:       { w: 0.92, h: 0.7, d: 0.92, label: 'Open supply pod' },
  medcab:    { w: 0.74, h: 1.86, d: 0.42, label: 'Open med cabinet', glass: true },
  pallet:    { w: 1.26, h: 0.6, d: 1.0, open: true },
  toolboard: { w: 1.32, h: 1.95, d: 0.38, open: true },
  bin:       { w: 1.0, h: 0.8, d: 0.72, open: true },
};
export const ENCLOSED = Object.keys(STORE).filter(k => !STORE[k].open), OPEN = Object.keys(STORE).filter(k => STORE[k].open);
export const SHELF = { shelfunit: { h: 1.95, tops: [0.12, 0.62, 1.12, 1.62] }, wallshelf: { h: 1.9, tops: [0.5, 1.0, 1.5] } };
// wall shelving per room type (count of tries), and rooms that also get a freestanding unit in the open floor
export const SHELF_ROOMS = { storage: 1, lab: 2, chemlab: 2, medbay: 2, power: 1, cooling: 1, reactor: 1, assembly: 1, foundry: 1, tankhall: 1, armoryhall: 2, guardroom: 1, range: 1, crew: 1, barracks: 1, canteen: 1, office: 1, control: 1 };
export const UNIT_ROOMS = { armoryhall: 1, assembly: 1, canteen: 1, medbay: 1, tankhall: 1 };

// ---------------------------------------------------------------- loot
// [id, weight, minTier]; p = chance the kind's own table is used instead of the ship family's
const KIND_LOOT = {
  ammocan:   [0.9, [['ammo', 10, 0], ['gunpart', 2, 0], ['barrel', 1, 1]]],
  medcab:    [0.9, [['medkit', 8, 0], ['stimpack', 4, 0], ['water', 3, 0], ['reagent', 2, 0]]],
  cryo:      [0.8, [['reagent', 6, 0], ['wafer', 3, 0], ['data_chip', 3, 0], ['stimpack', 2, 0], ['core', 1, 2], ['ai_core', 0.5, 3]]],
  evalocker: [0.8, [['o2_tank', 8, 0], ['armor_plate', 3, 0], ['medkit', 3, 0], ['cell', 3, 0], ['water', 2, 0]]],
  pod:       [0.85, [['ration', 8, 0], ['water', 7, 0], ['o2_tank', 3, 0], ['medkit', 2, 0], ['fuel', 1, 0]]],
  canister:  [0.5, [['cell', 4, 0], ['fuel', 3, 0], ['steel', 3, 0], ['alloy', 2, 1], ['reagent', 2, 0], ['core', 0.6, 2]]],
  toolboard: [0.85, [['wire', 6, 0], ['circuit', 4, 0], ['servo', 3, 0], ['cell', 3, 0], ['gunpart', 2, 0], ['lens', 2, 0]]],
  bin:       [0.85, [['iron_plate', 6, 0], ['steel', 4, 0], ['wire', 4, 0], ['carbon', 3, 0], ['servo', 2, 0], ['circuit', 2, 0]]],
  pallet:    [0.6, [['ration', 3, 0], ['water', 3, 0], ['iron_plate', 3, 0], ['steel', 2, 0], ['o2_tank', 2, 0], ['fuel', 1, 0], ['cell', 1, 0]]],
};
const GROUP = { medbay: 'med', lab: 'lab', chemlab: 'lab', power: 'maint', cooling: 'maint', reactor: 'maint', assembly: 'maint', foundry: 'maint', tankhall: 'maint', armoryhall: 'arms', guardroom: 'arms', range: 'arms', crew: 'crew', barracks: 'crew', canteen: 'crew', office: 'crew', control: 'crew', storage: 'cargo' };
const SHELF_LOOT = {
  med:   [0.75, [['medkit', 6, 0], ['stimpack', 3, 0], ['water', 4, 0], ['reagent', 2, 0]]],
  lab:   [0.65, [['reagent', 6, 0], ['wafer', 3, 0], ['data_chip', 4, 0], ['lens', 3, 0], ['circuit', 3, 0]]],
  maint: [0.7, [['wire', 6, 0], ['circuit', 3, 0], ['servo', 3, 0], ['cell', 3, 0], ['iron_plate', 4, 0], ['steel', 2, 0], ['fuel', 2, 0]]],
  arms:  [0.75, [['ammo', 8, 0], ['gunpart', 4, 0], ['barrel', 2, 0], ['medkit', 2, 0], ['armor_plate', 1, 1]]],
  crew:  [0.7, [['ration', 6, 0], ['water', 5, 0], ['data_chip', 2, 0], ['medkit', 2, 0], ['ammo', 2, 0]]],
  cargo: [0.35, [['ration', 3, 0], ['water', 3, 0], ['o2_tank', 2, 0], ['iron_plate', 3, 0], ['cell', 1, 0]]],
};
function pick(r, tbl, tier) { const t = tbl.filter(e => e[2] <= tier); let tot = 0; for (const e of t) tot += e[1]; let x = r() * tot; for (const e of t) { x -= e[1]; if (x <= 0) return e[0]; } return t[0][0]; }
export function rollFor(kind, r, ship, tier) { const kl = KIND_LOOT[kind]; return kl && r() < kl[0] ? pick(r, kl[1], tier) : rollLoot(r, ship, false, tier); }
export function rollShelf(roomType, r, ship, tier) { const sl = SHELF_LOOT[GROUP[roomType] || 'cargo']; return r() < sl[0] ? pick(r, sl[1], tier) : rollLoot(r, ship, false, Math.max(0, tier - 1)); }
export const entryOf = id => ITEMS[id].kind === 'gun' ? { id, q: 1, uid: uid(), mag: GUN[ITEMS[id].gun].mag } : { id, n: 1 };

// ---------------------------------------------------------------- shelves (static batched boxes, local space, front +z)
// per room look: frame/tier/lip colours + batch kinds; never a sign naming the room
export function shelfLook(type, th, corp) {
  const g = GROUP[type] || 'cargo', dim = c => new THREE.Color(c).multiplyScalar(0.55).getHex();
  switch (g) {
    case 'med':   return { frame: 0xe4eaec, fk: 'metal', tier: 0xcdd8dc, lip: dim(th.acc), decor: [0xf2f4f4, 0xd8e6ea, 0x9ad0dc] };
    case 'lab':   return { frame: 0xd8e0e4, fk: 'metal', tier: 0xb8c4ca, lip: dim(th.acc), decor: [0xe8eef0, 0x8fb8c4, 0xc8d0d4] };
    case 'maint': return { frame: 0x3a3f46, fk: 'metal', tier: 0x50565e, lip: 0xb8961c, decor: [0x2c3036, 0x7a3a22, 0x4a5058] };
    case 'arms':  return { frame: 0x4a5236, fk: 'metal', tier: 0x3a3f30, lip: dim(0xff4a3a), decor: [0x3c4430, 0x2a2e24, 0x5a5a48] };
    case 'crew':  return { frame: new THREE.Color(th.dado).lerp(new THREE.Color(0x444444), 0.3).getHex(), fk: 'matte', tier: new THREE.Color(th.wall).lerp(new THREE.Color(0x8a6a4a), 0.5).getHex(), lip: dim(th.acc), decor: [0xc8b89a, 0x6a7a8a, 0x9a5a4a] };
    default:      return { frame: 0xc8742a, fk: 'metal', tier: 0x6b5a3c, lip: dim(corp.accent), decor: [0x9a7a52, 0x8a6a42, 0x5a6a5a] };
  }
}
// boxes [kind, colour, x0, x1, y0, y1, z0, z1] + tiers {y (exact top), x0, x1, z0, z1} that items lie on
export function shelfParts(sp, L) {
  const { w, d } = sp, h = SHELF[sp.kind].h, B = [], T = [], put = (k, c, ...a) => B.push([k, c, ...a]);
  if (sp.kind === 'shelfunit') {   // four posts, plated tiers with a lip front and back, a cap plate; open from both sides
    const p = 0.045;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(L.fk, L.frame, sx < 0 ? -w / 2 : w / 2 - p, sx < 0 ? -w / 2 + p : w / 2, 0, h - 0.03, sz < 0 ? -d / 2 : d / 2 - p, sz < 0 ? -d / 2 + p : d / 2);
    put(L.fk, L.frame, -w / 2, w / 2, h - 0.03, h, -d / 2, d / 2);
    for (const y of SHELF.shelfunit.tops) {
      put('matte', L.tier, -w / 2 + p, w / 2 - p, y - 0.03, y, -d / 2 + 0.012, d / 2 - 0.012);
      for (const s of [-1, 1]) put('matte', L.lip, -w / 2 + p, w / 2 - p, y - 0.03, y + 0.015, s < 0 ? -d / 2 : d / 2 - 0.012, s < 0 ? -d / 2 + 0.012 : d / 2);
      for (const sx of [-1, 1]) put(L.fk, L.frame, sx < 0 ? -w / 2 : w / 2 - p, sx < 0 ? -w / 2 + p : w / 2, y - 0.06, y - 0.03, -d / 2 + p, d / 2 - p);   // end rails
      T.push({ y, x0: -w / 2 + p + 0.03, x1: w / 2 - p - 0.03, z0: -d / 2 + 0.04, z1: d / 2 - 0.04 });
    }
  } else {   // wall shelving: two uprights with feet, planks on brackets, struts back to the wall
    const ux = w / 2 - 0.14, uw = 0.05, bz = -d / 2;
    for (const s of [-1, 1]) {
      const x0 = s * ux - uw / 2, x1 = s * ux + uw / 2;
      put(L.fk, L.frame, x0, x1, 0, h, bz, bz + 0.05); put(L.fk, L.frame, x0, x1, 0, 0.05, bz + 0.05, d / 2 - 0.04);
      put(L.fk, L.frame, x0 + 0.01, x1 - 0.01, h - 0.09, h - 0.05, bz - 0.24, bz);
      for (const y of SHELF.wallshelf.tops) put(L.fk, L.frame, x0 + 0.01, x1 - 0.01, y - 0.15, y - 0.03, bz + 0.05, d / 2 - 0.05);
    }
    for (const y of SHELF.wallshelf.tops) {
      put('matte', L.tier, -w / 2, w / 2, y - 0.03, y, bz + 0.05, d / 2 - 0.012); put('matte', L.lip, -w / 2, w / 2, y - 0.03, y + 0.012, d / 2 - 0.012, d / 2);
      T.push({ y, x0: -w / 2 + 0.04, x1: w / 2 - 0.04, z0: bz + 0.08, z1: d / 2 - 0.04 });
    }
  }
  return { boxes: B, tiers: T };
}
// stock a shelf: n items, at most two per tier, each entry remembers its tier; empty tiers may get static clutter
export function stockShelf(r, tiers, roomType, ship, tier, lo, hi) {
  const n = r.int(lo, hi), ents = [], cnt = tiers.map(() => 0);
  for (let i = 0; i < n; i++) { let t = (r() * tiers.length) | 0; for (let k = 0; k < tiers.length && cnt[t] >= 2; k++) t = (t + 1) % tiers.length; if (cnt[t] >= 2) break; cnt[t]++; const e = entryOf(rollShelf(roomType, r, ship, tier)); e.tier = t; ents.push(e); }
  return ents;
}
export function shelfDecor(tiers, ents, L, r, top) {   // clutter boxes at one end of tiers that carry no loot (never under the cap)
  const B = [];
  tiers.forEach((t, i) => {
    if (ents.some(e => e.tier === i) || r() < 0.45) return; if (top && t.y > top - 0.42) return;
    const bw = r.range(0.22, 0.38), bd = Math.min(t.z1 - t.z0 - 0.04, r.range(0.22, 0.3)), bh = r.range(0.14, 0.28), left = r() < 0.5, zc = (t.z0 + t.z1) / 2;
    const x0 = left ? t.x0 + 0.02 : t.x1 - 0.02 - bw; B.push(['matte', r.pick(L.decor), x0, x0 + bw, t.y, t.y + bh, zc - bd / 2, zc + bd / 2]);
    if (r() < 0.4) { const w2 = bw * 0.7; B.push(['matte', r.pick(L.decor), x0 + 0.03, x0 + 0.03 + w2, t.y + bh, t.y + bh + 0.1, zc - bd / 2 + 0.03, zc + bd / 2 - 0.05]); }
  });
  return B;
}
// local rect -> world AABB for rotations that are multiples of 90 degrees (three.js rotation.y convention)
export function rotRect(sp, x0, x1, z0, z1) {
  const c = Math.round(Math.cos(sp.rot)), s = Math.round(Math.sin(sp.rot));
  const xs = [x0 * c + z0 * s, x1 * c + z0 * s, x0 * c + z1 * s, x1 * c + z1 * s], zs = [-x0 * s + z0 * c, -x1 * s + z0 * c, -x0 * s + z1 * c, -x1 * s + z1 * c];
  return [sp.x + Math.min(...xs), sp.x + Math.max(...xs), sp.z + Math.min(...zs), sp.z + Math.max(...zs)];
}
// the shelf as a display: an item tray on the shelf's transform; stash.js builds the items when you come near
export function makeShelfDisplay(S, sp, tiers, ents, room) {
  const tray = new THREE.Group(); tray.position.set(sp.x, 0, sp.z); tray.rotation.y = sp.rot; S.root.add(tray);
  const k = { w: sp.w, h: SHELF[sp.kind].h, d: sp.d, gunMax: 0.9 };
  const d = { kind: sp.kind, shelf: true, open: true, x: sp.x, z: sp.z, rot: sp.rot, k, tiers, entries: ents, items: ents.map(e => e.id), rig: { t: 1, want: 1, k, tray, apply() {} }, room, itemObjs: null };
  (S.displays || (S.displays = [])).push(d); return d;
}

// ---------------------------------------------------------------- containers (meshes, makeContainer-style rigs)
const UB = new THREE.BoxGeometry(1, 1, 1), UCY = new THREE.CylinderGeometry(1, 1, 1, 22), UHEX = new THREE.CylinderGeometry(1, 1, 1, 6), UTUBE = new THREE.CylinderGeometry(1, 1, 1, 22, 1, true);
const USPH = new THREE.SphereGeometry(1, 14, 10), UTOR = new THREE.TorusGeometry(1, 0.17, 6, 26);
const _M = {}, mat = (key, f) => _M[key] || (_M[key] = f());
const std = (key, color, metal = 0.5, rough = 0.5, o = {}) => mat(key, () => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...o }));
const glowM = c => mat('g' + c, () => new THREE.MeshBasicMaterial({ color: c }));
const glassM = () => mat('glass', () => new THREE.MeshStandardMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0.1, depthWrite: false }));
const dim = (c, k = 0.7) => new THREE.Color(c).multiplyScalar(k).getHex();
function part(par, geo, m, sx, sy, sz, x, y, z, sh = true) { const me = new THREE.Mesh(geo, m); me.scale.set(sx, sy, sz); me.position.set(x, y, z); me.castShadow = sh; me.receiveShadow = true; par.add(me); return me; }
const bx = (par, m, x0, x1, y0, y1, z0, z1, sh = true) => part(par, UB, m, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, sh);
const T = 0.04;
function shell(g, k, body, floor, t = T) {   // open-top box: floor slab, front/back, sides between them
  bx(g, floor, -k.w / 2, k.w / 2, 0, t, -k.d / 2, k.d / 2); bx(g, body, -k.w / 2, k.w / 2, t, k.h, k.d / 2 - t, k.d / 2); bx(g, body, -k.w / 2, k.w / 2, t, k.h, -k.d / 2, -k.d / 2 + t);
  bx(g, body, -k.w / 2, -k.w / 2 + t, t, k.h, -k.d / 2 + t, k.d / 2 - t); bx(g, body, k.w / 2 - t, k.w / 2, t, k.h, -k.d / 2 + t, k.d / 2 - t);
}
const row = (y, x, z0, z1) => ({ y, x0: -x, x1: x, z0, z1 });

const BUILD = {
  // mag-lock cargo canister: a tube on a flange; the cap twists a quarter turn, lifts and leans against the side
  canister(g, rig, c, k, corp, led) {
    const R = 0.3, body = std('can' + corp.short, new THREE.Color(corp.trim).lerp(new THREE.Color(0x8a9098), 0.6).getHex(), 0.75, 0.35), dark = std('dk', 0x2a2d33, 0.6, 0.5);
    const tube = mat('canT' + corp.short, () => { const m = body.clone(); m.side = THREE.DoubleSide; return m; });
    part(g, UCY, dark, 0.36, 0.08, 0.36, 0, 0.04, 0); part(g, UTUBE, tube, R, 0.74, R, 0, 0.08 + 0.37, 0);
    part(g, UCY, std('canIn', 0x3a4048, 0.4, 0.7), R - 0.005, 0.04, R - 0.005, 0, 0.52, 0, false);   // cradle floor, top 0.54
    for (const y of [0.3, 0.66]) part(g, UTUBE, glowM(dim(corp.accent, 0.8)), R + 0.008, 0.025, R + 0.008, 0, y, 0, false);   // open bands: a capped cylinder would fill the tube
    const rim = part(g, UTOR, dark, R, R, R, 0, 0.82, 0, false); rim.rotation.x = Math.PI / 2;
    led.position.set(0, 0.73, R + 0.004); g.add(led);
    const cap = new THREE.Group(); cap.rotation.order = 'ZYX'; g.add(cap);
    part(cap, UCY, body, R + 0.02, 0.07, R + 0.02, 0, 0.035, 0); part(cap, UCY, glowM(corp.accent), R + 0.024, 0.014, R + 0.024, 0, 0.03, 0, false); bx(cap, dark, -0.16, 0.16, 0.07, 0.11, -0.025, 0.025);
    rig.apply = e => { const a = Math.min(1, e / 0.35), b = Math.max(0, (e - 0.35) / 0.65); cap.position.set(-0.4 * b, 0.83 + 0.08 * a - 0.33 * b + 0.2 * Math.sin(b * Math.PI), 0); cap.rotation.set(0, a * Math.PI / 2, 1.5 * b); };
    c.tiers = [row(0.54, 0.17, -0.19, -0.01), row(0.54, 0.17, 0.01, 0.19)];
  },
  // cryo sample case: white case, foam bed, frosted lid on a back hinge, a breath of cold vapour as it opens
  cryo(g, rig, c, k, corp, led) {
    const white = std('cryoW', 0xdde5ea, 0.35, 0.4), trim = std('cryoT', 0x5a6a78, 0.6, 0.4);
    const frost = mat('frost', () => new THREE.MeshStandardMaterial({ color: 0xd8f2ff, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.1, emissive: 0x0a2a3a, depthWrite: false }));
    shell(g, k, white, trim); bx(g, std('foam', 0x24303a, 0, 0.95), -k.w / 2 + T, k.w / 2 - T, T, 0.3, -k.d / 2 + T, k.d / 2 - T);   // deep foam bed: samples sit high enough to see
    bx(g, glowM(0x3ab8e8), -k.w / 2 + 0.06, k.w / 2 - 0.06, 0.3, 0.32, k.d / 2, k.d / 2 + 0.006, false);
    const lid = new THREE.Group(); lid.position.set(0, k.h, -k.d / 2); g.add(lid);
    bx(lid, trim, -k.w / 2, k.w / 2, 0, 0.05, k.d - 0.06, k.d); bx(lid, trim, -k.w / 2, k.w / 2, 0, 0.05, 0, 0.06);
    for (const s of [-1, 1]) bx(lid, trim, s < 0 ? -k.w / 2 : k.w / 2 - 0.06, s < 0 ? -k.w / 2 + 0.06 : k.w / 2, 0, 0.05, 0.06, k.d - 0.06);
    bx(lid, frost, -k.w / 2 + 0.06, k.w / 2 - 0.06, 0.012, 0.038, 0.06, k.d - 0.06, false); bx(lid, white, -0.07, 0.07, -0.04, 0.03, k.d, k.d + 0.02);
    led.position.set(k.w / 2 - 0.1, k.h - 0.1, k.d / 2 + 0.006); g.add(led);
    const vap = new THREE.MeshBasicMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0, depthWrite: false }), puffs = [];
    for (let i = 0; i < 4; i++) { const p = part(g, USPH, vap, 0.1, 0.1, 0.1, (i - 1.5) * 0.18, k.h, (i & 1 ? 0.06 : -0.08), false); p.visible = false; puffs.push(p); }
    rig.apply = e => { lid.rotation.x = -1.9 * e; const s = Math.sin(e * Math.PI); vap.opacity = 0.32 * s; puffs.forEach((p, i) => { p.visible = s > 0.03; p.position.y = k.h - 0.03 + e * (0.28 + 0.07 * i); p.scale.setScalar(0.06 + 0.13 * e + 0.02 * i); }); };
    c.tiers = [row(0.3, k.w / 2 - 0.09, -k.d / 2 + 0.06, -0.01), row(0.3, k.w / 2 - 0.09, 0.01, k.d / 2 - 0.06)];
  },
  // pressurised EVA suit locker: a helmet behind a porthole; the door pops its seal outward, then swings
  evalocker(g, rig, c, k, corp, led) {
    const shellM = std('evaS', 0xc9ccc4, 0.45, 0.45), inner = std('evaI', 0x2a2f36, 0.3, 0.8), orange = std('evaO', 0xe07a28, 0.3, 0.6), suit = std('suit', 0xe8e6de, 0.1, 0.75);
    bx(g, inner, -k.w / 2, k.w / 2, 0, k.h - T, -k.d / 2, -k.d / 2 + T); bx(g, shellM, -k.w / 2, -k.w / 2 + T, 0, k.h - T, -k.d / 2, k.d / 2); bx(g, shellM, k.w / 2 - T, k.w / 2, 0, k.h - T, -k.d / 2, k.d / 2);
    bx(g, shellM, -k.w / 2, k.w / 2, k.h - T, k.h, -k.d / 2, k.d / 2); bx(g, inner, -k.w / 2 + T, k.w / 2 - T, 0, T, -k.d / 2 + T, k.d / 2);
    const dome = part(g, UCY, shellM, 0.09, k.w - 0.12, 0.09, 0, k.h + 0.03, -0.12); dome.rotation.z = Math.PI / 2;
    bx(g, inner, -k.w / 2 + T, k.w / 2 - T, 0.56, 0.59, -k.d / 2 + T, k.d / 2 - 0.02);
    bx(g, std('dk', 0x2a2d33, 0.6, 0.5), -k.w / 2 + T, k.w / 2 - T, 1.88, 1.91, -0.06, -0.03, false);
    part(g, USPH, suit, 0.15, 0.16, 0.15, 0, 1.62, -0.08); part(g, USPH, std('visor', 0x10202a, 0.9, 0.1), 0.12, 0.1, 0.06, 0, 1.62, 0.03, false);
    bx(g, suit, -0.19, 0.19, 1.02, 1.44, -0.22, 0.0); bx(g, glowM(dim(corp.accent, 0.8)), -0.06, 0.06, 1.26, 1.33, 0.0, 0.008, false);
    const hinge = new THREE.Group(); hinge.position.set(-k.w / 2, 0, k.d / 2); g.add(hinge);
    const th = 0.05, wc = k.w / 2, wy = 1.62, q = 0.11;
    bx(hinge, shellM, 0, k.w, 0, wy - q, -th, 0); bx(hinge, shellM, 0, k.w, wy + q, k.h, -th, 0); bx(hinge, shellM, 0, wc - q, wy - q, wy + q, -th, 0); bx(hinge, shellM, wc + q, k.w, wy - q, wy + q, -th, 0);
    bx(hinge, glassM(), wc - q, wc + q, wy - q, wy + q, -th * 0.6, -th * 0.4, false); const rimR = part(hinge, UTOR, orange, 0.15, 0.15, 0.15, wc, wy, 0.004, false); void rimR;
    bx(hinge, orange, 0.05, 0.11, 0.1, 1.3, 0, 0.004, false); bx(hinge, std('handle', 0xd8dce0, 0.8, 0.3), k.w - 0.1, k.w - 0.07, 0.9, 1.12, 0, 0.04);
    led.position.set(k.w - 0.13, k.h - 0.16, 0.006); hinge.add(led);
    rig.apply = e => { const a = Math.min(1, e / 0.22), b = Math.max(0, (e - 0.22) / 0.78); hinge.position.z = k.d / 2 + 0.035 * a; hinge.rotation.y = -1.9 * b; };
    c.tiers = [row(T, k.w / 2 - T - 0.04, -k.d / 2 + T + 0.04, k.d / 2 - 0.06), row(0.59, k.w / 2 - T - 0.04, -k.d / 2 + T + 0.04, k.d / 2 - 0.06)];
  },
  // ammo can: olive steel, a side lever unlatches first, then the lid flips back
  ammocan(g, rig, c, k, corp, led) {
    const olive = std('olive', 0x4b5530, 0.5, 0.6), dark = std('dk', 0x2a2d33, 0.6, 0.5);
    shell(g, k, olive, dark, 0.03); bx(g, std('canIn', 0x3a4048, 0.4, 0.7), -k.w / 2 + 0.03, k.w / 2 - 0.03, 0.03, 0.22, -k.d / 2 + 0.03, k.d / 2 - 0.03);   // packing insert, rounds on top
    bx(g, std('yband', 0xc8a028, 0.3, 0.6), -k.w / 2 + 0.04, k.w / 2 - 0.04, k.h - 0.11, k.h - 0.08, k.d / 2, k.d / 2 + 0.004, false);
    const lid = new THREE.Group(); lid.position.set(0, k.h, -k.d / 2); g.add(lid);
    bx(lid, olive, -k.w / 2 - 0.01, k.w / 2 + 0.01, 0, 0.04, 0, k.d + 0.01); bx(lid, dark, -0.1, 0.1, 0.04, 0.06, k.d / 2 - 0.015, k.d / 2 + 0.015);
    const lever = new THREE.Group(); lever.position.set(k.w / 2 + 0.012, k.h - 0.02, 0); g.add(lever); bx(lever, dark, -0.01, 0.01, -0.22, 0, -0.02, 0.02);
    led.position.set(-k.w / 2 + 0.1, k.h - 0.16, k.d / 2 + 0.006); g.add(led);
    rig.apply = e => { lever.rotation.x = 1.5 * Math.min(1, e / 0.3); lid.rotation.x = -1.85 * Math.max(0, (e - 0.3) / 0.7); };
    c.tiers = [row(0.22, k.w / 2 - 0.06, -k.d / 2 + 0.05, k.d / 2 - 0.05)];
  },
  // hex supply pod: six petals fold outward while the crown rides up on a piston
  pod(g, rig, c, k, corp, led) {
    const R = 0.45, body = std('podB', 0xb8c0c8, 0.55, 0.4), panel = std('podP', 0x8a949e, 0.6, 0.4), ring = glowM(dim(corp.accent, 0.85));
    part(g, UHEX, body, R, 0.3, R, 0, 0.15, 0); part(g, UHEX, std('podIn', 0x2c3238, 0.3, 0.8), R - 0.04, 0.01, R - 0.04, 0, 0.305, 0, false);
    part(g, UHEX, ring, R + 0.006, 0.03, R + 0.006, 0, 0.25, 0, false);
    const a = R * Math.cos(Math.PI / 6), petals = [];
    for (let j = 0; j < 6; j++) { const f = Math.PI / 6 + j * Math.PI / 3, pv = new THREE.Group(); pv.position.set(a * Math.sin(f), 0.31, a * Math.cos(f)); pv.rotation.y = f; g.add(pv);
      const hg = new THREE.Group(); pv.add(hg); bx(hg, panel, -R / 2, R / 2, 0, 0.34, -0.03, 0); bx(hg, ring, -0.05, 0.05, 0.24, 0.29, 0, 0.004, false); petals.push(hg); }
    const crown = new THREE.Group(); g.add(crown); part(crown, UHEX, body, R, 0.05, R, 0, 0.025, 0); part(crown, UHEX, glowM(corp.accent), 0.12, 0.012, 0.12, 0, 0.056, 0, false);
    const piston = part(g, UCY, std('chrome', 0xd0d4d8, 0.9, 0.2), 0.035, 1, 0.035, 0, 0.5, 0, false);
    led.position.set(0, 0.2, a + 0.004); g.add(led);
    rig.apply = e => { crown.position.y = 0.65 + 0.42 * e; const top = crown.position.y; piston.scale.y = top - 0.31; piston.position.y = (0.31 + top) / 2; for (const p of petals) p.rotation.x = 1.05 * e; };
    c.tiers = [row(0.31, 0.2, -0.26, -0.06), row(0.31, 0.2, 0.06, 0.26)];
  },
  // glass-door med cabinet: closed cupboard below, lit glass case above; contents are visible, the door must open to reach them
  medcab(g, rig, c, k, corp, led) {
    const white = std('medW', 0xeef2f2, 0.2, 0.35), dark = std('dk', 0x2a2d33, 0.6, 0.5), glass = glassM(), cross = glowM(0x3ad89a);
    bx(g, white, -k.w / 2, k.w / 2, 0, 0.82, -k.d / 2, k.d / 2); bx(g, dark, -0.004, 0.004, 0.06, 0.78, k.d / 2, k.d / 2 + 0.003, false);
    bx(g, cross, -k.w / 4 - 0.06, -k.w / 4 + 0.06, 0.5, 0.54, k.d / 2, k.d / 2 + 0.005, false); bx(g, cross, -k.w / 4 - 0.02, -k.w / 4 + 0.02, 0.46, 0.58, k.d / 2, k.d / 2 + 0.006, false);
    bx(g, white, -k.w / 2, k.w / 2, 0.82, k.h, -k.d / 2, -k.d / 2 + T); for (const s of [-1, 1]) bx(g, white, s < 0 ? -k.w / 2 : k.w / 2 - T, s < 0 ? -k.w / 2 + T : k.w / 2, 0.82, k.h - T, -k.d / 2 + T, k.d / 2);
    bx(g, white, -k.w / 2, k.w / 2, k.h - T, k.h, -k.d / 2 + T, k.d / 2); bx(g, std('medL', 0xbfe6e0, 0.1, 0.5), -k.w / 2 + T, k.w / 2 - T, 0.82, 0.835, -k.d / 2 + T, k.d / 2 - 0.05, false);
    bx(g, glass, -k.w / 2 + T, k.w / 2 - T, 1.3, 1.312, -k.d / 2 + T, k.d / 2 - 0.06, false); bx(g, glowM(0xf4fbff), -k.w / 2 + 0.08, k.w / 2 - 0.08, k.h - T - 0.012, k.h - T, -k.d / 2 + 0.08, -k.d / 2 + 0.12, false);
    const hinge = new THREE.Group(); hinge.position.set(-k.w / 2, 0, k.d / 2); g.add(hinge);
    bx(hinge, white, 0, 0.04, 0.84, k.h - 0.02, -0.03, 0); bx(hinge, white, k.w - 0.04, k.w, 0.84, k.h - 0.02, -0.03, 0); bx(hinge, white, 0.04, k.w - 0.04, 0.84, 0.88, -0.03, 0); bx(hinge, white, 0.04, k.w - 0.04, k.h - 0.06, k.h - 0.02, -0.03, 0);
    bx(hinge, glass, 0.04, k.w - 0.04, 0.88, k.h - 0.06, -0.02, -0.01, false); bx(hinge, std('handle', 0xd8dce0, 0.8, 0.3), k.w - 0.08, k.w - 0.06, 1.2, 1.4, 0, 0.03);
    led.position.set(k.w / 2 - 0.08, 0.76, k.d / 2 + 0.006); g.add(led);
    rig.apply = e => { hinge.rotation.y = -1.85 * e; };
    c.tiers = [row(0.835, k.w / 2 - T - 0.03, -k.d / 2 + T + 0.03, k.d / 2 - 0.07), row(1.312, k.w / 2 - T - 0.03, -k.d / 2 + T + 0.03, k.d / 2 - 0.08)];
  },
  // OPEN: cargo pallet with tie-down posts and straps; one strap hangs loose at the front so the load is reachable
  pallet(g, rig, c, k, corp, led) {
    const deck = std('palD', 0x3a3d42, 0.35, 0.6), run = std('dk', 0x2a2d33, 0.6, 0.5), post = std('palP', 0x8a9098, 0.7, 0.35), strap = std('strap', 0xe0782a, 0, 0.8);
    for (const z of [-k.d / 2 + 0.06, 0, k.d / 2 - 0.06]) bx(g, run, -k.w / 2, k.w / 2, 0, 0.1, z - 0.05, z + 0.05);
    bx(g, deck, -k.w / 2, k.w / 2, 0.1, 0.14, -k.d / 2, k.d / 2); bx(g, glowM(dim(corp.accent, 0.6)), -k.w / 2 + 0.08, k.w / 2 - 0.08, 0.105, 0.135, k.d / 2, k.d / 2 + 0.004, false);
    const px = k.w / 2 - 0.03, pz = k.d / 2 - 0.03;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, post, sx * px - 0.03, sx * px + 0.03, 0.14, 0.6, sz * pz - 0.03, sz * pz + 0.03);
    bx(g, strap, -px + 0.03, px - 0.03, 0.48, 0.53, -k.d / 2 + 0.015, -k.d / 2 + 0.03); for (const s of [-1, 1]) bx(g, strap, s * px - 0.0075, s * px + 0.0075, 0.48, 0.53, -pz + 0.03, pz - 0.03);
    bx(g, strap, -px - 0.025, -px + 0.025, 0.16, 0.5, pz + 0.03, pz + 0.04); bx(g, post, -px - 0.03, -px + 0.03, 0.2, 0.24, pz + 0.04, pz + 0.055);
    led.position.set(px - 0.12, 0.07, k.d / 2 - 0.006 + 0.012); led.visible = false; g.add(led);
    c.tiers = [row(0.14, k.w / 2 - 0.12, -k.d / 2 + 0.07, -0.03), row(0.14, k.w / 2 - 0.12, 0.03, k.d / 2 - 0.07)];
  },
  // OPEN: magnetic tool board: shadow-board outlines where the tools used to hang, a bench ledge and a magnet rail with loot
  toolboard(g, rig, c, k, corp, led) {
    const frame = std('tbF', 0x3a3f46, 0.7, 0.4), board = std('tbB', 0x5a6470, 0.3, 0.7), line = std('tbL', 0xd8dde0, 0.1, 0.6), bench = std('tbT', 0x6b5a3c, 0.1, 0.8), mag = std('tbM', 0x22262c, 0.8, 0.35), bz = -k.d / 2;
    for (const s of [-1, 1]) { const x0 = s < 0 ? -k.w / 2 : k.w / 2 - 0.05, x1 = x0 + 0.05; bx(g, frame, x0, x1, 0, k.h, bz, bz + 0.08); bx(g, frame, x0, x1, 0, 0.05, bz + 0.08, k.d / 2); }
    bx(g, bench, -k.w / 2 + 0.05, k.w / 2 - 0.05, 0.82, 0.86, bz + 0.02, k.d / 2); bx(g, glowM(dim(corp.accent, 0.6)), -k.w / 2 + 0.05, k.w / 2 - 0.05, 0.83, 0.85, k.d / 2, k.d / 2 + 0.004, false);
    bx(g, frame, -k.w / 2 + 0.05, k.w / 2 - 0.05, 0.25, 0.29, bz, bz + 0.05); bx(g, board, -k.w / 2 + 0.05, k.w / 2 - 0.05, 0.86, k.h - 0.02, bz + 0.02, bz + 0.04);
    for (const y of [1.1, 1.66, 1.82]) bx(g, mag, -k.w / 2 + 0.1, k.w / 2 - 0.1, y, y + 0.01, bz + 0.04, bz + 0.044, false);
    for (const [x, y0, y1, hw] of [[-0.42, 1.48, 1.78, 0.02], [-0.18, 1.5, 1.76, 0.03], [0.16, 0.95, 1.3, 0.02], [0.42, 1.47, 1.79, 0.025]]) { bx(g, line, x - hw, x + hw, y0, y1, bz + 0.044, bz + 0.047, false); bx(g, line, x - hw * 2.5, x + hw * 2.5, y1 - 0.05, y1, bz + 0.044, bz + 0.047, false); }
    bx(g, mag, -k.w / 2 + 0.05, k.w / 2 - 0.05, 1.38, 1.42, bz + 0.04, bz + 0.22); bx(g, glowM(corp.accent), -k.w / 2 + 0.05, k.w / 2 - 0.05, 1.385, 1.415, bz + 0.22, bz + 0.224, false);
    led.position.set(k.w / 2 - 0.12, 0.8, 0); led.visible = false; g.add(led);
    c.tiers = [row(0.86, k.w / 2 - 0.1, bz + 0.07, k.d / 2 - 0.03), row(1.42, k.w / 2 - 0.1, bz + 0.05, bz + 0.21)];
  },
  // OPEN: salvage bin: hazard-striped tub heaped with scrap; the good bits sit on top
  bin(g, rig, c, k, corp, led) {
    const body = std('binB', 0x6f7a3a, 0.5, 0.6), dark = std('dk', 0x2a2d33, 0.6, 0.5), rust = std('rust', 0x4a3a2c, 0.4, 0.9), t = 0.04;
    for (const z of [-k.d / 2 + 0.05, k.d / 2 - 0.15]) bx(g, dark, -k.w / 2 + 0.05, k.w / 2 - 0.05, 0, 0.06, z, z + 0.1);
    bx(g, body, -k.w / 2, k.w / 2, 0.06, 0.1, -k.d / 2, k.d / 2);
    bx(g, body, -k.w / 2, k.w / 2, 0.1, k.h, k.d / 2 - t, k.d / 2); bx(g, body, -k.w / 2, k.w / 2, 0.1, k.h, -k.d / 2, -k.d / 2 + t);
    bx(g, body, -k.w / 2, -k.w / 2 + t, 0.1, k.h, -k.d / 2 + t, k.d / 2 - t); bx(g, body, k.w / 2 - t, k.w / 2, 0.1, k.h, -k.d / 2 + t, k.d / 2 - t);
    bx(g, dark, -k.w / 2 - 0.01, k.w / 2 + 0.01, k.h - 0.03, k.h, k.d / 2, k.d / 2 + 0.02);
    for (let i = 0; i < 8; i++) { const x0 = -k.w / 2 + 0.04 + i * (k.w - 0.08) / 8; bx(g, (i & 1) ? dark : std('yband', 0xc8a028, 0.3, 0.6), x0, x0 + (k.w - 0.08) / 8, k.h - 0.16, k.h - 0.06, k.d / 2, k.d / 2 + 0.004, false); }
    bx(g, rust, -k.w / 2 + t, k.w / 2 - t, 0.1, 0.62, -k.d / 2 + t, k.d / 2 - t);
    for (const [x0, x1, h, z1] of [[-0.42, -0.2, 0.12, -0.14], [-0.16, 0.06, 0.07, -0.18], [0.1, 0.3, 0.15, -0.16], [0.31, 0.44, 0.09, -0.2]]) bx(g, [dark, std('scr', 0x6a5a48, 0.6, 0.6)][x0 > 0 ? 1 : 0], x0, x1, 0.62, 0.62 + h, -k.d / 2 + t, z1);
    led.position.set(0, 0.5, k.d / 2 + 0.006); led.visible = false; g.add(led);
    c.tiers = [row(0.62, k.w / 2 - 0.1, -0.1, k.d / 2 - t - 0.03)];
  },
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export function makeStore(S, spot, corp, items, room) {
  const { x, z, rot, k, kindName } = spot, g = new THREE.Group();
  const led = new THREE.Mesh(UB, new THREE.MeshBasicMaterial({ color: k.locked ? 0xff3030 : 0x55ff88 })); led.scale.set(0.08, 0.04, 0.012);
  const rig = { t: 0, want: 0, k, tray: new THREE.Group(), apply() {} };
  const c = { g, led, x, z, rot, kind: kindName, k, items, opened: false, locked: !!k.locked, room, rig, tiers: null };
  BUILD[kindName](g, rig, c, k, corp, led);
  g.add(rig.tray); g.position.set(x, 0, z); g.rotation.y = rot; S.root.add(g);
  c.entries = items.map(entryOf);
  if (!S.displays) S.displays = [];
  if (k.open) {   // loot in plain sight: no search prompt, grab straight away
    rig.t = rig.want = 1; rig.apply(1); c.open = true;
    c.onEmpty = () => { c.opened = true; S.opened = (S.opened || 0) + 1; };
    S.displays.push(c);
  } else {
    rig.apply(0); if (k.glass) { c.show = true; S.displays.push(c); }
    S.interactables.push({ pos: V(x, 0.9, z), r: Math.max(1.5, k.w + 0.6), label: k.label, act: 'xloot', data: c, container: c });
  }
  return c;
}

// ---------------------------------------------------------------- debug hook: window.__rr.storage
export function installStorageDebug(S) {
  const w = globalThis.window; if (!w || !w.__rr) return;
  w.__rr.storage = {
    get S() { return S; },
    list: () => (S.displays || []).map((d, i) => ({ i, kind: d.kind, open: !!d.open, x: +d.x.toFixed(1), z: +d.z.toFixed(1), room: d.room && d.room.type, items: (d.entries || []).filter(Boolean).map(e => e.id) })),
    stats() { const o = {}; for (const d of S.displays || []) o[d.kind] = (o[d.kind] || 0) + 1; for (const c of S.containers || []) if (STORE[c.kind] && !STORE[c.kind].open && !STORE[c.kind].glass) o[c.kind] = (o[c.kind] || 0) + 1; return o; },
    // stand in front of display i, facing it (front is +z in its local space)
    go(i) { const d = S.displays[i], p = w.__rr.player; if (!d || !p) return false; const fx = Math.sin(d.rot), fz = Math.cos(d.rot), off = d.k.d / 2 + 1.1; p.pos.x = d.x + fx * off; p.pos.z = d.z + fz * off; p.yaw = Math.atan2(fx, fz); p.pitch = -0.35; return true; },
    nearest(kind) { const p = w.__rr.player; let best = -1, bd = 1e9; (S.displays || []).forEach((d, i) => { if (kind && d.kind !== kind) return; const q = Math.hypot(d.x - p.pos.x, d.z - p.pos.z); if (q < bd) { bd = q; best = i; } }); return best; },
    kinds: { enclosed: ENCLOSED, open: OPEN, shelves: Object.keys(SHELF) },
  };
}
