// Your own ship (the Rimrunner, after the Space Ranger Workhorse): the place you live between Extraction jobs. No hub menu:
// you walk it. Cockpit (contract screens, helm, comms) / cabin (bunk, galley) / airlock bay (side hatch, security panel, suit
// rack) / armory (gun rack, fabricator) / hold (owner-locked strongbox behind a vault door).
// Two contexts, one layout:  TRANSIT = HomeSpace (mode 'home', only the ship)   DOCKED = the same build welded onto the
// target's port-0 tube inside ExtractShip (mode 'extract'). Local coords = world x, z relative to the hatch (oz).
// Security: the hatch opens for the owner only; NPCs path against a hatch that is always solid in their nav, anything hostile
// that ends up inside is pushed back out, rival runners that try the lock are logged (alarm + turret are fabricator upgrades),
// and the hold has no NPC code path at all: only the owner's hand opens it. See docs/HOMESHIP.md.
import * as THREE from '../vendor/three.module.js';
import { Surface } from './surface.js';
import { G, toast, addItem, addGun, uid } from './state.js';
import { ITEMS, GUN } from './data.js';
import { sfx } from './audio.js';
import { fmt } from './util.js';
import { CLASSES, CORPS } from './ships.js';
import { gunMesh } from './models.js';
import { batchStatic } from './batch.js';
import { In } from './input.js';
import { ExtractShip, ENEMY, Meta, metaSave, makeOffers, packValue, startingKit, ARMOR, SHOP_GUNS, SHOP_KIT, KEEP } from './extract.js';

let incMod = null, capMod = null;   // optional modules (incident flavour, crew captions); the ship works without them
import('./incidents.js').then(m => { incMod = m; }).catch(() => {});
import('./crew-ui.js').then(m => { capMod = m; }).catch(() => {});

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const HX0 = -12.0, HX1 = -7.3, HZ0 = -12, HZ1 = 12, WH = 2.35, CROWN = 0.7, CX = (HX0 + HX1) / 2, HW = (HX1 - HX0) / 2;
const DOOR_X = -9.65, HOLD_N = 24;
export const SPAWN = { transit: { x: -9.65, z: -6.0, yaw: 0 }, bunk: { x: -10.2, z: -5.5, yaw: 0 }, hatch: { x: -8.0, z: 0, yaw: -Math.PI / 2 } };
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const hex = n => '#' + n.toString(16).padStart(6, '0');

// palette (design: charcoal navy / gunmetal / aged cream / hazard orange, cyan controls, security red)
const MC = {};
const mat = (k, c, o = {}) => MC[k] || (MC[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.35, ...o }));
const M = {
  navy: () => mat('navy', 0x111923, { roughness: 0.7 }), gun: () => mat('gun', 0x26323b, { metalness: 0.55 }), cream: () => mat('cream', 0xd9d4c3, { roughness: 0.75, metalness: 0.1 }),
  orange: () => mat('orange', 0xe97828, { roughness: 0.55, metalness: 0.2 }), floor: () => mat('floor', 0x1b2129, { roughness: 0.85, metalness: 0.45 }), rib: () => mat('rib', 0x2e3338, { metalness: 0.6 }),
  leather: () => mat('leather', 0x3a2c22, { roughness: 0.8, metalness: 0 }), crown: () => mat('crown', 0xcfc9b8, { roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }),
  cyan: () => MC.cyan || (MC.cyan = new THREE.MeshBasicMaterial({ color: 0x67d7e8 })), red: () => MC.red || (MC.red = new THREE.MeshBasicMaterial({ color: 0xd94a47 })),
  warm: () => MC.warm || (MC.warm = new THREE.MeshBasicMaterial({ color: 0xffe2b8 })), glass: () => MC.glass || (MC.glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.9, side: THREE.DoubleSide, depthWrite: false })),
};
// the crown's squircle section from the east wall top over to the west wall top
function profile(inset = 0) { const P = []; for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI, c = Math.cos(t), s = Math.sin(t); P.push([CX + (HW - inset) * Math.sign(c) * Math.abs(c) ** 0.5, WH + (CROWN - inset) * Math.abs(s) ** 0.5]); } return P; }
function ribbon(P, z0, z1) {
  const pos = []; for (const [x, y] of P) pos.push(x, y, z0, x, y, z1);
  const idx = []; for (let k = 0; k < P.length - 1; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function capGeo(P) { const s = new THREE.Shape(); s.moveTo(P[0][0], WH); P.forEach(([x, y]) => s.lineTo(x, y)); s.lineTo(P[P.length - 1][0], WH); return new THREE.ShapeGeometry(s); }

function screen(w, h, cw = 512, ch = 288) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d', { willReadFrequently: true });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t })); m.userData.keep = true;
  let sig = '';
  m.userData.draw = (lines, accent = '#67d7e8', bg = '#081018') => {
    const s = JSON.stringify([lines, accent, bg]); if (s === sig) return; sig = s;
    x.fillStyle = bg; x.fillRect(0, 0, cw, ch); x.strokeStyle = accent; x.lineWidth = 6; x.strokeRect(6, 6, cw - 12, ch - 12);
    let y = 22; lines.forEach((l, i) => { const sz = l.s || (i === 0 ? 40 : 28); x.font = `${i === 0 ? 'bold ' : ''}${sz}px "Rajdhani", "Arial Narrow", Arial, sans-serif`; x.fillStyle = l.c || (i === 0 ? accent : '#d9d4c3'); x.textBaseline = 'top'; x.fillText(String(l.t ?? l), 24, y); y += sz + 10; });
    t.needsUpdate = true;
  };
  return m;
}

/** Builds the ship under `root`. oz: world z of the hatch. docked: welded to a target's tube of height tubeH. */
export function buildHome(root, { oz = 0, docked = false, tubeH = 3 } = {}) {
  const g = new THREE.Group(); g.name = 'homeship'; root.add(g);
  const cols = [], its = [], lamps = [];
  const box = (m, x0, x1, y0, y1, z0, z1, keep) => { const o = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2 + oz); o.castShadow = false; o.receiveShadow = true; if (keep) o.userData.keep = true; g.add(o); return o; };
  const col = (x0, x1, z0, z1, maxy = 3.2) => { const c = { minx: x0, maxx: x1, minz: z0 + oz, maxz: z1 + oz, maxy }; cols.push(c); return c; };
  const it = (x, z, label, act, r = 1.0) => { const o = { pos: V(x, 1, z + oz), r, label, act }; its.push(o); return o; };
  const add = (o, x, y, z) => { o.position.set(x, y, z + oz); g.add(o); return o; };

  // shell: deck, walls, crown, ribs, caps
  box(M.floor(), HX0, HX1, -0.06, 0, HZ0, HZ1); box(M.gun(), -10.05, -9.25, 0, 0.004, HZ0 + 0.3, HZ1 - 0.3);
  box(M.orange(), -7.3, -7.0, -0.06, 0.004, -1.0, 1.0);   // hatch threshold (bridges the tube floor)
  box(M.navy(), HX0 - 0.15, HX0, 0, WH, HZ0, HZ1); col(HX0 - 0.3, HX0, HZ0, HZ1);
  for (const [z0, z1] of [[HZ0, -1.0], [1.0, HZ1]]) { box(M.navy(), HX1, HX1 + 0.3, 0, WH, z0, z1); col(HX1, HX1 + 0.3, z0, z1); }
  box(M.navy(), HX1, HX1 + 0.3, 2.2, WH, -1.0, 1.0);
  if (docked && tubeH > WH) box(M.gun(), HX1, HX1 + 0.3, WH - 0.01, tubeH + 0.3, -3.1, 3.1);   // collar plate up to the tube ceiling
  box(M.cream(), HX0, HX0 + 0.02, 0.9, 0.95, HZ0, HZ1); box(M.cream(), HX1 - 0.02, HX1, 0.9, 0.95, HZ0, -1.05); box(M.cream(), HX1 - 0.02, HX1, 0.9, 0.95, 1.05, HZ1);   // dado rails
  const crown = new THREE.Mesh(ribbon(profile(), HZ0 + oz, HZ1 + oz), M.crown()); g.add(crown);
  for (let z = HZ0 + 0.4; z < HZ1 - 0.3; z += 0.76) {
    g.add(new THREE.Mesh(ribbon(profile(0.06), z - 0.04 + oz, z + 0.04 + oz), M.rib()));
    box(M.rib(), HX0, HX0 + 0.06, 0, WH, z - 0.04, z + 0.04);
    if (Math.abs(z) > 1.25 && !(z > 3.5 && z < 6.5)) box(M.rib(), HX1 - 0.06, HX1, 0, WH, z - 0.04, z + 0.04);
  }
  for (const z of [-9.5, -4, 1, 5, 9.5]) { box(M.warm(), CX - 0.3, CX + 0.3, 2.98, 3.02, z - 0.6, z + 0.6); lamps.push({ x: CX, z: z + oz, home: true }); }
  // bow: low bulkhead + canopy glass under the crown, mullions
  box(M.navy(), HX0, HX1, 0, 1.0, HZ0, HZ0 + 0.15); col(HX0, HX1, HZ0 - 0.2, HZ0 + 0.15);
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(HX1 - HX0, WH - 1.0), M.glass()); gl.userData.keep = true; add(gl, CX, (WH + 1.0) / 2, HZ0 + 0.05);
  const gc = new THREE.Mesh(capGeo(profile()), M.glass()); gc.userData.keep = true; gc.position.z = HZ0 + 0.05 + oz; g.add(gc);
  for (const x of [-10.9, -8.4]) box(M.gun(), x - 0.05, x + 0.05, 1.0, 2.95, HZ0 + 0.02, HZ0 + 0.1);
  box(M.gun(), HX0, HX1, WH - 0.04, WH + 0.04, HZ0 + 0.02, HZ0 + 0.1);
  // stern: wall + cap + the (sealed) stern hatch frame
  box(M.navy(), HX0, HX1, 0, WH, HZ1 - 0.15, HZ1); col(HX0, HX1, HZ1 - 0.15, HZ1 + 0.2);
  const sc = new THREE.Mesh(capGeo(profile()), M.crown()); sc.position.z = HZ1 - 0.15 + oz; g.add(sc);
  box(M.orange(), -10.4, -8.9, 2.15, 2.25, HZ1 - 0.2, HZ1 - 0.15); box(M.orange(), -10.4, -10.3, 0, 2.2, HZ1 - 0.2, HZ1 - 0.15); box(M.orange(), -9.0, -8.9, 0, 2.2, HZ1 - 0.2, HZ1 - 0.15);
  // partitions: cockpit (z -7, open door) and hold (z 7, vault door)
  for (const [z, gw] of [[-7, 1.2], [7, 1.4]]) {
    const a = DOOR_X - gw / 2, b = DOOR_X + gw / 2;
    box(M.cream(), HX0, a, 0, WH, z - 0.1, z + 0.1); box(M.cream(), b, HX1, 0, WH, z - 0.1, z + 0.1); box(M.cream(), a, b, 2.2, WH, z - 0.1, z + 0.1);
    col(HX0, a, z - 0.1, z + 0.1); col(b, HX1, z - 0.1, z + 0.1);
    for (const s of [-1, 1]) { const pc = new THREE.Mesh(capGeo(profile()), M.crown()); pc.position.z = z + s * 0.1 + oz; g.add(pc); }
    box(M.orange(), a - 0.08, a, 0, 2.2, z - 0.12, z + 0.12); box(M.orange(), b, b + 0.08, 0, 2.2, z - 0.12, z + 0.12); box(M.orange(), a - 0.08, b + 0.08, 2.2, 2.28, z - 0.12, z + 0.12);
  }
  // hatch: owner-only sliding door in the starboard wall (+ orange frame)
  box(M.orange(), HX1 - 0.04, HX1, 0, 2.2, -1.12, -1.0); box(M.orange(), HX1 - 0.04, HX1, 0, 2.2, 1.0, 1.12); box(M.orange(), HX1 - 0.04, HX1, 2.2, 2.3, -1.12, 1.12);
  const hm = box(M.cream(), -7.2, -7.1, 0, 2.2, -1.0, 1.0, true); const hs = box(M.red(), -7.22, -7.21, 1.3, 1.36, -0.25, 0.25, true); hs.position.x = -7.215;
  hm.add(hs); hs.position.set(-0.015, 0.23, 0);   // status strip rides the door
  const hatch = { mesh: hm, base: hm.position.z, col: col(HX1, HX1 + 0.3, -1.0, 1.0), strip: hs, open: 0 };
  // vault door into the hold
  const vm = box(M.gun(), DOOR_X - 0.7, DOOR_X + 0.7, 0, 2.2, 6.95, 7.05, true); const vs = box(M.red(), -0.3, 0.3, 1.1, 1.18, 0, 0.02, true); vm.add(vs); vs.position.set(0, 0.06, -0.07);
  const vault = { mesh: vm, base: vm.position.x, col: col(DOOR_X - 0.7, DOOR_X + 0.7, 6.9, 7.1), strip: vs, open: 0 };

  // ---- cockpit ----
  box(M.navy(), HX0 + 0.3, HX1 - 0.3, 0, 0.95, HZ0 + 0.15, HZ0 + 0.85); box(M.gun(), HX0 + 0.25, HX1 - 0.25, 0.95, 1.0, HZ0 + 0.1, HZ0 + 0.95); col(HX0 + 0.25, HX1 - 0.25, HZ0, HZ0 + 0.95, 1.0);
  const nav = [-11.0, -10.05, -9.1, -8.15].map((x, i) => { const s = screen(0.82, 0.48); s.rotation.x = -0.35; add(s, x, 1.28, HZ0 + 0.55); box(M.gun(), x - 0.45, x + 0.45, 1.0, 1.06, HZ0 + 0.4, HZ0 + 0.7); return { s, it: it(x, HZ0 + 1.55, '', 'h:course:' + i, 0.75) }; });
  for (const x of [-10.9, -8.4]) { box(M.gun(), x - 0.08, x + 0.08, 0, 0.42, -9.5, -9.3); box(M.leather(), x - 0.32, x + 0.32, 0.42, 0.55, -9.7, -9.1); box(M.leather(), x - 0.32, x + 0.32, 0.55, 1.25, -9.1, -8.95); col(x - 0.34, x + 0.34, -9.75, -8.9, 1.25); }
  box(M.gun(), DOOR_X - 0.18, DOOR_X + 0.18, 0, 0.95, -9.6, -9.25); box(M.cyan(), DOOR_X - 0.12, DOOR_X + 0.12, 0.95, 0.97, -9.55, -9.3); col(DOOR_X - 0.2, DOOR_X + 0.2, -9.62, -9.23, 1.0);
  const helm = it(DOOR_X, -8.75, '', 'h:helm', 0.8);
  const comms = screen(0.9, 0.55); comms.rotation.y = Math.PI / 2; add(comms, HX0 + 0.02, 1.5, -8.1); box(M.gun(), HX0, HX0 + 0.06, 1.15, 1.85, -8.6, -7.6);
  const commsIt = it(HX0 + 0.7, -8.1, '', 'h:comms', 0.9);
  // ---- cabin ----
  box(M.gun(), HX0, HX0 + 1.1, 0, 0.45, -6.6, -4.4); box(M.leather(), HX0 + 0.05, HX0 + 1.05, 0.45, 0.62, -6.55, -4.45); box(M.cream(), HX0, HX0 + 1.1, 1.55, 1.6, -6.6, -4.4); box(M.warm(), HX0 + 0.02, HX0 + 0.05, 1.3, 1.36, -6.3, -4.7);
  col(HX0, HX0 + 1.1, -6.6, -4.4, 0.62); lamps.push({ x: HX0 + 0.6, z: -5.5 + oz, warm: true, home: true });
  const bunk = it(HX0 + 1.6, -5.5, '', 'h:bunk', 0.9);
  box(M.navy(), HX1 - 0.9, HX1, 0, 0.92, -6.5, -4.5); box(M.cream(), HX1 - 0.95, HX1, 0.92, 0.97, -6.55, -4.45); box(M.gun(), HX1 - 0.6, HX1 - 0.3, 0.97, 1.2, -6.0, -5.6); col(HX1 - 0.95, HX1, -6.55, -4.45, 0.97);
  box(M.gun(), HX0, HX0 + 0.8, 0, 0.72, -3.4, -2.2); box(M.leather(), HX0, HX0 + 0.5, 0.42, 0.55, -3.9, -3.45); col(HX0, HX0 + 0.8, -3.9, -2.2, 0.75);   // dinette
  // ---- airlock bay ----
  const sec = screen(0.6, 0.42); sec.rotation.y = -Math.PI / 2; add(sec, HX1 - 0.02, 1.45, -2.2); const secIt = it(HX1 - 0.65, -2.2, '', 'h:security', 0.8);
  for (let k = 0; k < 3; k++) { const z = -1.1 + k * 1.1; box(M.orange(), HX0, HX0 + 0.35, 0.6, 1.75, z - 0.25, z + 0.25); box(M.gun(), HX0, HX0 + 0.38, 1.75, 1.95, z - 0.12, z + 0.12); }
  box(M.gun(), HX0, HX0 + 0.06, 2.0, 2.05, -1.5, 1.5); col(HX0, HX0 + 0.42, -1.45, 1.45, 2.0);
  // ---- armory ----
  box(M.gun(), HX0, HX0 + 0.08, 0.6, 2.1, 3.4, 6.6); for (let r = 0; r < 4; r++) box(M.rib(), HX0 + 0.08, HX0 + 0.14, 0.88 + r * 0.38, 0.92 + r * 0.38, 3.4, 6.6);
  const rackG = new THREE.Group(); rackG.userData.keep = true; g.add(rackG); col(HX0, HX0 + 0.35, 3.4, 6.6, 2.1);
  const rackIt = it(HX0 + 0.9, 5.0, '', 'h:rack', 1.0);
  box(M.navy(), HX1 - 0.8, HX1, 0, 1.75, 3.8, 6.2); box(M.cream(), HX1 - 0.82, HX1 - 0.8, 0.2, 0.9, 4.0, 6.0); box(M.cyan(), HX1 - 0.83, HX1 - 0.82, 0.25, 0.3, 4.1, 5.9); col(HX1 - 0.85, HX1, 3.8, 6.2, 1.75);
  const fab = screen(0.75, 0.42); fab.rotation.y = -Math.PI / 2; add(fab, HX1 - 0.82, 1.3, 5.0);
  const fabDial = it(HX1 - 1.35, 4.3, '', 'h:fabnext', 0.7), fabPrint = it(HX1 - 1.35, 5.7, '', 'h:fabprint', 0.7);
  // ---- hold ----
  box(M.gun(), HX0 + 0.1, HX0 + 1.5, 0, 1.15, 9.6, 11.6); box(M.orange(), HX0 + 0.1, HX0 + 1.5, 1.15, 1.2, 9.6, 11.6); const led = box(M.cyan(), HX0 + 1.5, HX0 + 1.52, 0.85, 0.95, 10.4, 10.8, true);
  col(HX0 + 0.05, HX0 + 1.55, 9.55, 11.65, 1.2); const holdIt = it(HX0 + 2.1, 10.6, '', 'h:hold', 1.0);
  for (const [z0, z1, h] of [[8.0, 9.2, 0.9], [9.4, 10.6, 1.3], [10.8, 11.7, 0.7]]) { box(M.cream(), HX1 - 1.0, HX1 - 0.05, 0, h, z0, z1); box(M.orange(), HX1 - 1.01, HX1 - 0.04, h - 0.06, h - 0.02, z0, z1); col(HX1 - 1.0, HX1, z0, z1, h); }

  batchStatic(g, 0);
  const bld = { x0: HX0, x1: HX1, z0: HZ0 + oz, z1: HZ1 + oz, h: 2.45 };
  return { g, cols, its, lamps, bld, hatch, vault, nav, helm, comms, commsIt, bunk, sec, secIt, rackG, rackIt, fab, fabDial, fabPrint, led, holdIt, oz };
}

/** Transit: the ship alone in space (mode 'home'). */
export class HomeSpace extends Surface {
  heightAt() { return 0; }
  timeOfDay() { }
  enterHome(run) {
    this.run = run; this.planet = { name: 'Your ship', kind: 'in transit', settled: false, temp: 0.5, air: 1, g: 1, seed: 7, i: 0 }; this.kind = 'barren'; this.sys = { name: '—' };
    this.K = { res: [], sky: 0 }; this.air = 1; this.gravity = 1; this.root.clear(); this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = []; this.buildings = []; this.displays = [];
    this.scene.remove(this.sky.mesh); this.sun.intensity = 0; this.scene.background = new THREE.Color(0x010204); this.scene.fog = null; this.hemi.intensity = 0.55; this.hemi.color.set(0xdfe8f0); this.hemi.groundColor.set(0x2a2d33);
    this.padPos = V(1e4, 0, 1e4); this.flatR = 9999; this.ceilH = 2.45;
    const H = this.H = buildHome(this.root, { oz: 0 }); this.colliders.push(...H.cols); this.interactables.push(...H.its); this.buildings.push(H.bld);
    this.lights = H.lamps.map(l => { const p = new THREE.PointLight(l.warm ? 0xffb070 : 0xfff2e0, l.warm ? 5 : 9, 9, 1.5); p.position.set(l.x, 2.7, l.z); this.root.add(p); p.userData.l = l; return p; });
    this.root.add(starDome()); this.streaks = streakField(); this.root.add(this.streaks);
    return this;
  }
  update(dt, player) { this.run.tick(dt, player); }
}
function starDome() {
  const n = 2400, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); p.set([Math.cos(a) * r * 400, u * 400, Math.sin(a) * r * 400], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false })); m.userData.keep = true; m.frustumCulled = false; return m;
}
function streakField() {
  const n = 160, p = new Float32Array(n * 6); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const L = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, fog: false })); L.userData = { keep: true, seeds: Array.from({ length: n }, () => [CX + (Math.random() - 0.5) * 80, 1.5 + (Math.random() - 0.5) * 60, -Math.random() * 300]) }; L.frustumCulled = false; return L;
}

// ======================================================================= run controller =======================================================================
export class HomeRun {
  /** app: { X (Extraction), xs (ExtractShip), getMode() } */
  constructor(app) {
    this.X = app.X; this.xs = app.xs; this.getMode = app.getMode; this.home = null; this.burn = null; this.D = null; this.fabI = 0; this.alarmT = 0; this.hudT = 0; this.rackSig = '';
    const X = this.X;
    X.openHub = note => this.goHome(SPAWN.transit, note, true);   // the old hub is gone: you are aboard your ship
    X.startRun = c => this.dock(c, SPAWN.hatch);                    // debug boot (?extract&class=...) docks straight in
    X.finish = (ok, why) => this.finish(ok, why);
    X.onDeath = () => this.finish(false, 'You went down aboard. Everything you carried is gone.');
    window.__rr && (window.__rr.homeship = this);
  }
  get app() { return this.X.app; }
  get player() { return this.X.app.player; }
  ensure() { if (!Array.isArray(Meta.hold)) Meta.hold = []; while (Meta.hold.length < HOLD_N) Meta.hold.push(null); Meta.secLog = Meta.secLog || []; if (!Meta.offers) Meta.offers = makeOffers(); }
  inHome(p, oz) { return p.x < HX1 + 0.3 && p.x > HX0 - 0.3 && Math.abs(p.z - oz) < HZ1 + 0.3; }

  // ---------------- transit ----------------
  goHome(spawn = SPAWN.transit, note, boot) {
    this.ensure(); const X = this.X, app = this.app;
    if (boot && Meta.docked) { Meta.chain = 0; Meta.deaths++; Meta.last = { name: Meta.docked.name, ok: false, why: 'The link dropped mid-job. Your hold is intact; what you carried is gone.', kills: 0, time: 0 }; Meta.docked = null; metaSave(); }
    X.closeHub(); X.hubOpen = false; X.hide(); document.getElementById('title').style.display = 'none';
    if (!this.home) this.home = new HomeSpace(app.player.camera || this.xs.camera); this.home.enterHome(this); this.rackSig = '';
    app.resetPack(); startingKit(); G.hp = 100;
    app.setMode('home'); const p = this.player; p.place(this.home.scene, this.home); p.dead = false; p.teleport(spawn.x, spawn.z, spawn.yaw); p.vel.set(0, 0, 0); p.view.visible = true; app.ui.setHint('foot');
    this.X.hudEl.style.display = 'block'; document.body.classList.add('xrun'); this.burn = null;
    const L = Meta.last; if (note) X.note = note;
    if (L && !boot) setTimeout(() => toast('SHIP AI: ' + this.debrief(L), L.ok ? 'good' : 'warn'), 700);
    else if (boot) setTimeout(() => toast(`Aboard your ship. Contracts are on the cockpit screens; ${In.label('interact')} to burn for one.`, ''), 900);
    app.lock();
  }
  course(i) {
    if (this.getMode() !== 'home') { toast('Undock first (helm).', ''); return; }
    if (this.burn) { toast(`Already burning for ${this.burn.c.name}.`, ''); return; }
    const c = Meta.offers[i]; if (!c) return; this.burn = { c, t: 6 }; sfx('ui', 0.9); toast(`Course laid in: ${c.name}. Docking in a few seconds. Walk to the hatch.`, 'good');
  }
  dock(c, spawnLocal) {
    const X = this.X, app = this.app, S = this.xs;
    app.fadeTo(() => {
      this.burn = null; if (app.pack.blocking) app.pack.requestClose(); if (app.stash.active) app.stash.close();
      const lp = spawnLocal || (this.getMode() === 'home' ? { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw } : SPAWN.hatch);
      if (this.getMode() !== 'home') { app.resetPack(); startingKit(); }
      delete S.rebuildNav; delete S.updateEnemy;
      if (incMod) try { incMod.attachIncident(c, CORPS, CLASSES[c.classId].family); } catch (e) {}
      if (capMod) try { capMod.clearCaptions(); } catch (e) {}
      c.homeDock = true; X.log = [];
      S.enter(c, { doom: () => X.finish(false, incMod && c.incident ? incMod.incOf(c).doom(c) : 'The station tore itself apart before you undocked.'), log: m => X.log.push(m) });
      S.onGive = (id, e) => X.openTray(e ? `${e.who.name} hands you something` : ITEMS[id].name, X.entriesOf([id]), () => {});
      this.attachDocked();
      app.setMode('extract'); const p = this.player; p.place(S.scene, S); p.dead = false; p.teleport(lp.x, lp.z + S.mine.z, lp.yaw); p.vel.set(0, 0, 0);
      X.active = true; X.hudEl.style.display = 'block'; document.body.classList.add('xrun'); app.ui.setHint('foot'); p.view.visible = true;
      Meta.docked = { name: c.name }; metaSave(); sfx('zip', 1);
      toast(`Docked at ${c.name}. Your hatch opens for you only. Undock from the helm.`, 'good');
      app.lock();
    }, 500);
  }
  attachDocked() {
    const S = this.xs, oz = S.mine.z;
    S.interactables = S.interactables.filter(i => i.act !== 'xconsole' && i.act !== 'xextract');
    S.root.children.filter(o => o.isMesh && (Math.abs(o.position.x + 5.4) < 0.01 || Math.abs(o.position.x + 6.9) < 0.01) && Math.abs(o.position.z - oz) < 2.6).forEach(o => S.root.remove(o));
    const D = this.D = buildHome(S.root, { oz, docked: true, tubeH: S.ship.H || 3 }); this.rackSig = '';
    S.colliders.push(...D.cols); S.interactables.push(...D.its); S.lamps.push(...D.lamps); (S.buildings = S.buildings || []).push(D.bld); S.root.add(starDome());
    // NPC nav always sees the hatch shut, whatever the door is doing for the owner
    S.rebuildNav = () => { const had = S.colliders.includes(D.hatch.col); if (!had) S.colliders.push(D.hatch.col); S.nav.build(S.colliders, new Set()); if (!had) S.colliders = S.colliders.filter(c => c !== D.hatch.col); };
    S.rebuildNav();
    S.updateEnemy = (e, dt, p) => (e.raid ? this.raidStep(e, dt, p) : ExtractShip.prototype.updateEnemy.call(S, e, dt, p));
    this.turret = null;
    if (Meta.turret) { const t = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.25, 12), M.gun()); t.add(b); const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), M.rib()); barrel.position.set(0, -0.12, -0.25); t.add(barrel); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.red()); eye.position.set(0, -0.1, -0.02); t.add(eye); t.position.set(-3.5, (S.ship.H || 3) - 0.2, oz); S.root.add(t); this.turret = { g: t, fireT: 0 }; }
  }

  // ---------------- per frame ----------------
  frame(dt) { const m = this.getMode(); if (m === 'extract' && this.D && this.X.active) this.tick(dt, this.player, true); }
  tick(dt, player, docked = false) {
    this.ensure(); G.hunger = G.thirst = Math.max(35, G.hunger); G.oxygen = 100; const H = docked ? this.D : this.home.H, oz = H.oz;
    if (!docked) {
      if (G.hp < 100) G.hp = Math.min(100, G.hp + dt * 4);
      if (this.burn) { this.burn.t -= dt; if (this.burn.t <= 0 && !this.burn.go) { this.burn.go = true; this.dock(this.burn.c); } }
      this.streaks(dt);
      for (const l of this.home.lights) l.color.set(this.alarmT > 0 ? 0xff3030 : l.userData.l.warm ? 0xffb070 : 0xfff2e0);
      this.hud(dt);
    }
    // doors: the hatch opens for the owner only (and only when there is something on the other side); the vault for the owner
    const p = player.pos, near = (x, z, r) => !player.dead && Math.hypot(p.x - x, p.z - (z + oz)) < r;
    this.door(docked, H.hatch, docked && near(-7.15, 0, 2.3), 'z', dt);
    this.door(docked, H.vault, near(DOOR_X, 7, 2.2), 'x', dt);
    if (docked) {
      const S = this.xs;
      for (const e of S.enemies) {
        if (e.dead || e.def.survivor) continue;
        if (this.inHome(e.pos, oz)) { e.pos.x = -6.5; e.mesh.position.x = -6.5; e.path = null; if (!this._pushed) { this._pushed = true; this.log(`${e.def.name} reached the hatch line and was turned back.`); } }
        if (!e.raidChecked) { e.raidChecked = true; if (e.def === ENEMY.rival && this.holdValue() > 0 && Math.random() < 0.6) e.raid = { st: 'go', t: 0, pathT: 0 }; }
      }
      this.runTurret(dt);
      for (const l of S.lamps) if (l.home) l.tint = this.alarmT > 0 ? 0xff3030 : null;
    }
    this.alarmT = Math.max(0, this.alarmT - dt);
    H.led.material = this.holdValue() > 0 ? M.cyan() : M.red();
    this.labels(H, docked); this.refreshRack(H);
  }
  door(docked, d, want, ax, dt) {
    const S = docked ? this.xs : this.home; d.open += ((want ? 1 : 0) - d.open) * Math.min(1, dt * 6);
    if (ax === 'z') d.mesh.position.z = d.base + d.open * 2.0; else d.mesh.position.x = d.base - d.open * 1.45;
    d.strip.material = want ? M.cyan() : M.red();
    const has = S.colliders.includes(d.col);
    if (d.open > 0.6 && has) S.colliders = S.colliders.filter(c => c !== d.col); else if (d.open < 0.3 && !has) S.colliders.push(d.col);
    if (!d.was && want) sfx('zip', 0.5); d.was = want;
  }
  streaks(dt) {
    const L = this.home.streaks, on = this.burn ? Math.min(1, (6 - this.burn.t) / 1.5) : 0, a = L.geometry.attributes.position; L.material.opacity = on * 0.8; if (!on) return;
    L.userData.seeds.forEach((s, i) => { s[2] += dt * 260 * on; if (s[2] > 60) s[2] = -300; a.setXYZ(i * 2, s[0], s[1], s[2]); a.setXYZ(i * 2 + 1, s[0], s[1], s[2] - 6 - 20 * on); }); a.needsUpdate = true;
  }
  // a rival runner who fancies your haul: walks to your hatch, works the lock (it holds), gives up
  raidStep(e, dt, player) {
    const S = this.xs, R = e.raid, oz = S.mine.z; e.t += dt; if (e.dead) return;
    const d = Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z);
    if (d < 14 && S.los(e.pos, player.pos)) { const was = R.st; e.raid = null; if (was === 'pick' || !e.neutral) { e.neutral = false; e.state = 'hunt'; e.alerted = true; } return ExtractShip.prototype.updateEnemy.call(S, e, dt, player); }
    if (R.st === 'go') {
      const tx = -4.6, tz = oz; if (Math.hypot(e.pos.x - tx, e.pos.z - tz) < 1.3) { R.st = 'pick'; R.t = 0; this.tamper(e); return; }
      R.pathT -= dt; if (R.pathT <= 0 || !e.path) { e.path = S.nav.find(e.pos.x, e.pos.z, tx, tz, false, 40000); e.pi = 0; R.pathT = 1.2; if (!e.path) { R.fail = (R.fail || 0) + 1; if (R.fail > 4) e.raid = null; } }
      if (e.path && e.pi < e.path.length) S.follow(e, dt, e.def.speed * 0.8); else S.idleAnim(e, dt);
    } else if (R.st === 'pick') {
      S.faceTo(e, HX1 - e.pos.x, 0, dt); S.idleAnim(e, dt); R.t += dt;
      if (R.t > 8) { e.raid = null; if (Meta.alarm) S.ai(`${e.def.name} gave up on your hatch. The lock held.`); this.log(`${e.def.name} gave up. Nothing taken.`); if (e.neutral) { e.state = 'roam'; e.path = null; } else e.state = 'hunt'; }
    }
  }
  tamper(e) { this.log(`${e.def.name} worked the hatch lock. It held.`); if (Meta.alarm) { this.alarmT = 6; this.xs.ai('Someone is working your hatch lock. It is holding.', 'warn'); sfx('hit', 0.4); } }
  log(msg) { Meta.secLog = Meta.secLog || []; Meta.secLog.unshift(`${mmss(this.xs.t || 0)} ${msg}`); Meta.secLog = Meta.secLog.slice(0, 6); metaSave(); }
  runTurret(dt) {
    const T = this.turret; if (!T) return; const S = this.xs; T.fireT -= dt; if (T.fireT > 0) return; T.fireT = 0.15;
    const from = T.g.position; let best = null, bd = 9;
    for (const e of S.enemies) { if (e.dead || e.def.survivor || (e.neutral && !(e.raid && e.raid.st === 'pick'))) continue; const d = Math.hypot(e.pos.x - from.x, e.pos.z - from.z); if (d < bd && S.los(from, e.pos)) { bd = d; best = e; } }
    if (!best) return; T.g.lookAt(best.pos.x, from.y, best.pos.z); T.g.rotateY(Math.PI);
    S.tracer(from.clone().add(V(0, -0.15, 0)), V(best.pos.x, best.pos.y + 1.2, best.pos.z), 0x67d7e8); sfx('laser', 0.35); S.hitEnemy(best, 14, false); T.fireT = 0.45;
  }

  // ---------------- the hold (owner only: there is no NPC code path into it) ----------------
  holdValue() { let v = 0; for (const e of Meta.hold || []) if (e && ITEMS[e.id] && ITEMS[e.id].kind !== 'gun' && !KEEP.has(e.id)) v += ITEMS[e.id].value * (e.n || 1); return v; }
  openHold() {
    this.ensure(); const app = this.app; if (app.pack.phase !== 'idle') return;
    app.pack.openLoot({ title: 'Ship hold', cols: 6, items: Meta.hold.slice(), onCloseAll: all => { Meta.hold = all.map(e => e || null); metaSave(); } }, this.player);
  }

  // ---------------- run end: no menu, you are aboard ----------------
  finish(ok, why) {
    const X = this.X, S = this.xs; if (!X.active) return;
    const p = this.player, alive = !p.dead && G.hp > 0, aboard = this.D && this.inHome(p.pos, this.D.oz);
    if (!ok && alive && aboard) { ok = true; why = 'emergency'; }
    X.active = false; S.over = true; const c = S.contract, pv = packValue(), guns = [];
    const note = { name: c.name, ok, kills: S.kills, time: S.t, why };
    if (ok) {
      const story = c.story, jobDone = !S.job || S.job.done, payout = jobDone ? (story ? story.reward : c.payout) : 0, nRes = (S.rescued || []).length, rescueCr = nRes * (c.incident === 'lockdown' ? 180 : 120);
      const hv = this.holdValue(); Meta.credits += pv.value + hv + payout + rescueCr; Object.assign(note, { value: pv.value + hv, hold: hv, payout, jobDone, rescued: nRes, rescueCr });
      const kit = {}; const keep = (id, n) => { kit[id] = Math.min(id === 'antenna' ? 6 : 15, (kit[id] || 0) + n); };
      for (const it of pv.list) { if (it.gun && !Meta.owned.includes(it.id)) { Meta.owned.push(it.id); guns.push(ITEMS[it.id].name); } if (it.keep) keep(it.id, it.n); }
      for (const e of Meta.hold) { if (!e || !ITEMS[e.id]) continue; if (ITEMS[e.id].kind === 'gun') { if (!Meta.owned.includes(e.id)) { Meta.owned.push(e.id); guns.push(ITEMS[e.id].name); } } else if (KEEP.has(e.id)) keep(e.id, e.n || 1); }
      Meta.kit = kit; Meta.hold = Array(HOLD_N).fill(null);
      Meta.chain++; Meta.best = Math.max(Meta.best, Meta.chain); Meta.extracted++;
      if (story && jobDone) { Meta.story[story.id] = true; if (story.unlocks === 'radio') { Meta.radio = true; X.note = 'Police radio unlocked: prison and armory break-ins are now on the board.'; } }
    } else { Meta.chain = 0; Meta.deaths++; Meta.kit = { ammo: 4, medkit: 1, ration: 1, water: 1, antenna: 1 }; Meta.credits -= Math.round(Meta.credits * 0.1); note.why = why || 'You died aboard. Everything you carried is gone.'; }
    if (capMod) try { capMod.clearCaptions(); } catch (e) {}
    Meta.runs++; note.guns = guns; Meta.last = note; Meta.offers = makeOffers(); Meta.docked = null; metaSave();
    const lp = ok && aboard ? { x: p.pos.x, z: p.pos.z - this.D.oz, yaw: p.yaw } : SPAWN.bunk;
    this.app.fadeTo(() => { this.D = null; this.turret = null; this.goHome(lp); }, ok ? 450 : 700);
  }
  debrief(L) {
    if (L.ok) return `${L.why === 'emergency' ? 'Emergency undock, you were aboard. ' : 'Undocked. '}Broker took the haul for ${fmt(L.value || 0)} cr${L.hold ? ` (${fmt(L.hold)} from the hold)` : ''}, job ${L.jobDone === false ? 'not done (unpaid)' : fmt(L.payout || 0) + ' cr'}${L.rescued ? `, ${L.rescued} crew rescued (+${fmt(L.rescueCr)})` : ''}.${L.guns && L.guns.length ? ' New on the rack: ' + L.guns.join(', ') + '.' : ''}`;
    return `${L.why || 'Lost.'} I pulled you out and patched you up in your bunk. The hold is untouched.`;
  }

  // ---------------- interactions (h:*) ----------------
  interact(it) {
    const [, k, v] = it.act.split(':'), docked = this.getMode() === 'extract', S = this.xs;
    switch (k) {
      case 'course': this.course(+v); break;
      case 'helm':
        if (docked) { if (this.inHome(this.player.pos, this.D.oz)) this.finish(true); }
        else if (this.burn) toast('Mid-burn. Hold on.', '');
        else if (Meta.credits < 50) toast('A long-range scan costs 50 cr.', 'warn');
        else { Meta.credits -= 50; Meta.runs++; Meta.offers = makeOffers(); metaSave(); sfx('ui', 0.8); toast('SHIP AI: scanned for new distress calls. Check the screens.', 'good'); }
        break;
      case 'comms': if (docked) this.X.interact({ act: 'xconsole' }); else toast('SHIP AI: ' + (Meta.last ? this.debrief(Meta.last) : 'No jobs flown yet. Pick a contract at the cockpit screens.'), ''); break;
      case 'bunk': if (docked) toast('No sleeping on the clock.', ''); else { this.X.hide(); document.body.classList.remove('xrun'); try { document.exitPointerLock(); } catch (e) {} this.app.toTitle(); } break;
      case 'security': toast('SECURITY: ' + (Meta.secLog.length ? Meta.secLog.slice(0, 3).join(' · ') : 'No tampering logged. Hatch and hold open for you only.'), Meta.secLog.length ? 'warn' : ''); break;
      case 'rack': this.rack(docked); break;
      case 'fabnext': { const L = this.fabList(); this.fabI = (this.fabI + 1) % Math.max(1, L.length); sfx('ui', 0.5); break; }
      case 'fabprint': this.print(docked); break;
      case 'hold': this.openHold(); break;
    }
  }
  rack(docked) {
    if (docked) { toast('Rack is locked while docked. Swap guns between jobs.', ''); return; }
    if (packValue().value > 0) { toast('Stow your haul in the hold first.', 'warn'); return; }
    const o = Meta.owned, i = o.indexOf(Meta.primary); Meta.primary = o[(i + 1) % o.length]; metaSave(); startingKit(); sfx('zip', 0.6); toast(`Took the ${ITEMS[Meta.primary].name} off the rack.`, 'good');
  }
  fabList() {
    const L = [];
    for (const [id, cost] of SHOP_KIT) L.push({ k: 'kit', id, cost, name: ITEMS[id].name, note: `carry ${Meta.kit[id] || 0}` });
    for (const [id, cost, need] of SHOP_GUNS) if (!Meta.owned.includes(id) && Meta.best >= need) L.push({ k: 'gun', id, cost, name: ITEMS[id].name, note: `${GUN[ITEMS[id].gun].dmg} dmg · ${GUN[ITEMS[id].gun].mag} mag` });
    const nA = ARMOR[Meta.armor + 1]; if (nA) L.push({ k: 'armor', cost: nA.cost, name: nA.n, note: `${Math.round(nA.red * 100)}% off bullets` });
    if (!Meta.alarm) L.push({ k: 'alarm', cost: 300, name: 'Hatch tamper alarm', note: 'tells you when someone works your lock' });
    if (!Meta.turret) L.push({ k: 'turret', cost: 1200, name: 'Airlock sentry turret', note: 'shoots whoever comes for your hatch' });
    return L;
  }
  print(docked) {
    const L = this.fabList(); this.fabI = Math.min(this.fabI, L.length - 1); const e = L[this.fabI]; if (!e) return;
    if (Meta.credits < e.cost) { toast(`Need ${fmt(e.cost)} cr.`, 'warn'); return; }
    if (e.k === 'kit') { const cap = e.id === 'antenna' ? 6 : 15; if (!docked && (Meta.kit[e.id] || 0) >= cap) { toast('Carrying the most you can.', ''); return; } if (addItem(e.id, 1) > 0) { toast('No room in your pack.', 'warn'); return; } if (!docked) Meta.kit[e.id] = (Meta.kit[e.id] || 0) + 1; }
    else if (e.k === 'gun') { Meta.owned.push(e.id); if (docked) addGun({ id: e.id, q: 1, uid: uid(), mag: GUN[ITEMS[e.id].gun].mag }); else if (!packValue().value) { Meta.primary = e.id; startingKit(); } }
    else if (e.k === 'armor') Meta.armor++;
    else if (e.k === 'alarm') Meta.alarm = true;
    else if (e.k === 'turret') { Meta.turret = true; toast('Turret printed. It mounts outside your hatch next time you dock.', 'good'); }
    Meta.credits -= e.cost; metaSave(); sfx('coin', 0.8); toast(`Printed: ${e.name}. −${fmt(e.cost)} cr.`, 'good');
  }
  labels(H, docked) {
    const of = Meta.offers || [], b = this.burn;
    H.nav.forEach((n, i) => {
      const c = of[i]; n.it.label = docked ? 'Contract screen (undock first)' : !c ? 'No signal' : b ? `Burning for ${b.c.name}` : `Burn for ${c.name} — ${CLASSES[c.classId].label}, pays ${fmt(c.story ? c.story.reward : c.payout)} cr`;
      if (!c) { n.s.userData.draw(['NO SIGNAL', { t: 'scan from the helm', c: '#6a7380' }], '#3a4450'); return; }
      const cl = CLASSES[c.classId], co = CORPS[c.corpId], acc = hex(co.accent), me = b && b.c === c, inc = incMod && c.incident ? (() => { try { return incMod.incOf(c); } catch (e) { return null; } })() : null;
      n.s.userData.draw([cl.label, { t: `${co.short} · ${cl.size.toUpperCase()}${c.story ? ' · STORY' : ''}`, c: acc }, '★'.repeat(c.risk) + '☆'.repeat(5 - c.risk), `pays ${fmt(c.story ? c.story.reward : c.payout)} cr`, me ? { t: `DOCKING ${Math.ceil(b.t)}s`, c: '#67d7e8' } : { t: `${mmss(cl.time * 60)} ${inc ? inc.clock.toLowerCase() : 'to cascade'}`, c: '#93a1b5' }], me ? '#67d7e8' : acc);
    });
    H.helm.label = docked ? (this.inHome(this.player.pos, H.oz) ? 'Helm — undock and sell the haul' : 'Helm') : b ? 'Helm (burning)' : 'Helm — long-range scan for new contracts (50 cr)';
    H.commsIt.label = docked ? (this.xs.medic ? 'Comms — medic status' : 'Comms — call a medic (150 cr)') : 'Comms — ship AI debrief';
    H.comms.userData.draw(['SHIP AI', `bank ${fmt(Meta.credits)} cr`, `chain ${Meta.chain} · best ${Meta.best}`, `${Meta.extracted} out · ${Meta.deaths} lost`, Meta.last ? { t: Meta.last.ok ? `last: OUT · ${Meta.last.name}` : `last: LOST · ${Meta.last.name}`, c: Meta.last.ok ? '#7dd86a' : '#d94a47', s: 22 } : '']);
    H.bunk.label = docked ? 'Bunk' : 'Bunk — sleep (back to title)';
    H.secIt.label = 'Security panel — log';
    H.sec.userData.draw(['SECURITY', { t: 'HATCH: OWNER ONLY', c: '#7dd86a' }, { t: 'HOLD: OWNER ONLY', c: '#7dd86a' }, `alarm ${Meta.alarm ? 'ON' : '—'} · turret ${Meta.turret ? 'ON' : '—'}`, { t: Meta.secLog[0] || 'no tampering', c: Meta.secLog[0] ? '#d94a47' : '#93a1b5', s: 20 }], this.alarmT > 0 ? '#d94a47' : '#67d7e8');
    H.rackIt.label = docked ? 'Gun rack (locked while docked)' : `Gun rack — swap primary (${ITEMS[Meta.primary].name})`;
    const L = this.fabList(); this.fabI = Math.min(this.fabI, Math.max(0, L.length - 1)); const e = L[this.fabI];
    H.fabDial.label = 'Fabricator — next blueprint'; H.fabPrint.label = e ? `Fabricator — print ${e.name} (${fmt(e.cost)} cr)` : 'Fabricator';
    H.fab.userData.draw(e ? ['FABRICATOR', { t: e.name, c: '#ffb347' }, e.note, `${fmt(e.cost)} cr · bank ${fmt(Meta.credits)}`, { t: `${this.fabI + 1}/${L.length}`, c: '#6a7380', s: 20 }] : ['FABRICATOR', 'nothing to print']);
    const hv = this.holdValue(); H.holdIt.label = `Hold strongbox${hv ? ` — ${fmt(hv)} cr stowed` : ''} (owner lock)`;
  }
  refreshRack(H) {
    const sig = Meta.owned.join(',') + '|' + Meta.primary + '|' + H.oz; if (sig === this.rackSig) return; this.rackSig = sig; const g = H.rackG; g.clear();
    Meta.owned.forEach((id, i) => { const m = gunMesh(id); m.scale.setScalar(1.6); const pri = id === Meta.primary; m.position.set(HX0 + (pri ? 0.32 : 0.22), 0.95 + (i % 4) * 0.38, 3.9 + Math.floor(i / 4) * 1.2 + H.oz); m.rotation.y = Math.PI / 2; g.add(m); if (pri) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.6), M.cyan()); bar.position.set(HX0 + 0.1, m.position.y - 0.12, m.position.z); g.add(bar); } });
  }
  hud(dt) {
    if ((this.hudT -= dt) > 0) return; this.hudT = 0.25; const b = this.burn, hv = this.holdValue();
    this.X.hudEl.innerHTML = `<div class="xl1"><b>YOUR SHIP</b> <small>${b ? 'burning' : 'in transit'}</small></div><div class="xl2">${b ? `DOCKING <b>${mmss(b.t)}</b> <small>${esc(b.c.name)}</small>` : '<small>pick a job at the cockpit screens</small>'}</div><div class="xl3">Bank <b>${fmt(Meta.credits)}</b> cr · chain ${Meta.chain} · hold <b>${fmt(hv)}</b> cr · ${ARMOR[Meta.armor].n}</div>`;
    const cr = document.getElementById('creds'); if (cr) cr.innerHTML = `<b>${fmt(Meta.credits)}</b> cr bank`;
  }
}
