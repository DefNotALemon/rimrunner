// Detailed town buildings and props (siding / brick / concrete / metal styles, windows, awnings, roof clutter, furnished interiors)
import * as THREE from '../vendor/three.module.js';
import { rng } from './util.js';
import { tex, boxUV, surfMat } from './textures.js';
import { gunMesh } from './models.js';
import { ITEMS } from './data.js';
import { signTex } from './interior-kit.js';
import { furnishBuilding } from './interiors.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0.05, ...o });
const DARK = std(0x1e2227, { roughness: 0.6, metalness: 0.4 });
const WOOD = std(0x6a4a2e, { roughness: 0.85 });
const STEEL = std(0x8a9098, { roughness: 0.4, metalness: 0.7 });

class B {
  constructor(surf) { this.s = surf; this.windowMats = surf.windowMats; }
  box(x0, x1, y0, y1, z0, z1, mat, o = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0; const g = new THREE.BoxGeometry(w, h, d); boxUV(g, w, h, d, o.tile || 2);
    const m = new THREE.Mesh(g, mat); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = o.shadow !== false; m.receiveShadow = true; this.s.root.add(m);
    if (o.col) this.s.colliders.push({ minx: x0, maxx: x1, minz: z0, maxz: z1, maxy: y1 }); return m;
  }
  add(mesh, x, y, z, ry = 0) { mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = false; mesh.receiveShadow = true; this.s.root.add(mesh); return mesh; }
}

export function makeBuilding(surf, b) {
  const K = new B(surf); const r = rng(Math.floor(b.x * 31 + b.z * 17 + 7));
  const T = 0.32, H = b.h || (b.kind === 'house' ? 3.2 : 3.8), DW = 1.15;
  const style = b.style || 'siding'; const wallMat = surfMat(style, b.color); const trim = std(b.trim ?? 0x2a2f36, { roughness: 0.6 });
  const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
  const dv = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[b.door]; const sd = [dv[1], -dv[0]];   // outward / sideways
  const P = (u, v) => ({ x: b.x + sd[0] * u + dv[0] * v, z: b.z + sd[1] * u + dv[1] * v });   // local: u across, v outward
  const ry = Math.atan2(dv[0], dv[1]);
  const wallSeg = (a0, a1, fixed, horiz, y0 = 0, y1 = H, col = true) => { if (a1 - a0 < 0.04) return; if (horiz) K.box(a0, a1, y0, y1, fixed - T / 2, fixed + T / 2, wallMat, { col }); else K.box(fixed - T / 2, fixed + T / 2, y0, y1, a0, a1, wallMat, { col }); };
  const side = (s, a0, a1, fixed, horiz) => {
    if (b.door === s) { const c = horiz ? b.x : b.z; wallSeg(a0, c - DW, fixed, horiz); wallSeg(c + DW, a1, fixed, horiz); wallSeg(c - DW, c + DW, fixed, horiz, 2.5, H, false); }
    else wallSeg(a0, a1, fixed, horiz);
  };
  side('n', x0, x1, z0, true); side('s', x0, x1, z1, true); side('w', z0, z1, x0, false); side('e', z0, z1, x1, false);
  // plinth + corner posts
  const pl = 0.42; const pm = surfMat('concrete', 0x8a8a86);
  K.box(x0 - 0.12, x1 + 0.12, 0, pl, z0 - 0.12, z0 + 0.1, pm, { shadow: false }); K.box(x0 - 0.12, x1 + 0.12, 0, pl, z1 - 0.1, z1 + 0.12, pm, { shadow: false }); K.box(x0 - 0.12, x0 + 0.1, 0, pl, z0, z1, pm, { shadow: false }); K.box(x1 - 0.1, x1 + 0.12, 0, pl, z0, z1, pm, { shadow: false });
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) K.box(cx - 0.17, cx + 0.17, 0, H + 0.1, cz - 0.17, cz + 0.17, trim, { shadow: true });
  // floor / ceiling
  K.box(x0, x1, -0.05, 0.03, z0, z1, surfMat('floor', b.floor ?? 0x9a7a58), { shadow: false, tile: 2 });
  const nRoof0 = surf.root.children.length;   // everything added from here to the windows is roof-level (hidden by cutaway debug views)
  K.box(x0, x1, H - 0.04, H + 0.03, z0, z1, surfMat('concrete', 0x9a9a98), { shadow: false });
  // ceiling beams
  const longX = b.w >= b.d; const nb = Math.floor((longX ? b.w : b.d) / 3);
  for (let i = 1; i < nb; i++) { const t = (i / nb); if (longX) K.box(x0 + t * b.w - 0.1, x0 + t * b.w + 0.1, H - 0.22, H - 0.04, z0 + 0.15, z1 - 0.15, WOOD, { shadow: false }); else K.box(x0 + 0.15, x1 - 0.15, H - 0.22, H - 0.04, z0 + t * b.d - 0.1, z0 + t * b.d + 0.1, WOOD, { shadow: false }); }
  // roof
  if (style === 'siding' || b.kind === 'house') {
    const rise = 1.5, span = longX ? b.d : b.w, len = longX ? b.w : b.d; const sh = new THREE.Shape(); sh.moveTo(-span / 2 - 0.5, 0); sh.lineTo(0, rise); sh.lineTo(span / 2 + 0.5, 0); sh.lineTo(span / 2 + 0.5, -0.12); sh.lineTo(-span / 2 - 0.5, -0.12); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: len + 1.0, bevelEnabled: false }); g.translate(0, 0, -(len + 1.0) / 2);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.35, uv.getY(i) * 0.35);
    const roof = new THREE.Mesh(g, surfMat('roof', b.roof ?? 0x6a3a2a)); roof.position.set(b.x, H + 0.03, b.z); if (longX) roof.rotation.y = Math.PI / 2; roof.castShadow = true; roof.receiveShadow = true; surf.root.add(roof);
    const rl = rise; if (r() < 0.8) { const ch = K.box(b.x + (r() - .5) * b.w * .4 - .3, b.x + (r() - .5) * b.w * .4 + .3, H, H + rise + 0.9, b.z - .3 + (r() - .5) * b.d * .3, b.z + .3 + (r() - .5) * b.d * .3, surfMat('brick', 0x8a4a3a)); void ch; void rl; }
  } else {
    K.box(x0 - 0.35, x1 + 0.35, H + 0.03, H + 0.3, z0 - 0.35, z1 + 0.35, surfMat('concrete', 0x7a7c80));
    const pa = 0.55; K.box(x0 - 0.35, x1 + 0.35, H + 0.3, H + 0.3 + pa, z0 - 0.35, z0 - 0.2, wallMat); K.box(x0 - 0.35, x1 + 0.35, H + 0.3, H + 0.3 + pa, z1 + 0.2, z1 + 0.35, wallMat); K.box(x0 - 0.35, x0 - 0.2, H + 0.3, H + 0.3 + pa, z0, z1, wallMat); K.box(x1 + 0.2, x1 + 0.35, H + 0.3, H + 0.3 + pa, z0, z1, wallMat);
    // roof clutter
    const ry0 = H + 0.3;
    for (let i = 0; i < r.int(1, 3); i++) { const px = b.x + (r() - .5) * (b.w - 3), pz = b.z + (r() - .5) * (b.d - 3); K.box(px - .7, px + .7, ry0, ry0 + .8, pz - .6, pz + .6, std(0xa8adb4, { metalness: .5, roughness: .5 })); const fan = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .05, 14), DARK); K.add(fan, px, ry0 + .83, pz); }
    for (let i = 0; i < r.int(2, 4); i++) { const px = b.x + (r() - .5) * (b.w - 2), pz = b.z + (r() - .5) * (b.d - 2); const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1 + r() * 1.2, 8), STEEL); K.add(pipe, px, ry0 + .6, pz); const cap = new THREE.Mesh(new THREE.ConeGeometry(.16, .12, 8), STEEL); K.add(cap, px, ry0 + 1.2 + (pipe.geometry.parameters.height - 1), pz); }
    if (r() < .7) { const mp = b.x + (r() - .5) * (b.w - 3), mz = b.z + (r() - .5) * (b.d - 3); const mast = new THREE.Mesh(new THREE.CylinderGeometry(.04, .06, 4, 6), STEEL); K.add(mast, mp, ry0 + 2, mz); const dish = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * .4), std(0xdcdcdc, { side: THREE.DoubleSide })); dish.rotation.x = -1.1; K.add(dish, mp, ry0 + 3.6, mz); const bl = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); K.add(bl, mp, ry0 + 4.05, mz); (surf.blinkers = surf.blinkers || []).push(bl); }
    if (r() < .5) for (let i = 0; i < 3; i++) { const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, .05, 1), std(0x1a2a5a, { metalness: .6, roughness: .25 })); panel.rotation.x = -.35; K.add(panel, b.x - b.w / 4 + i * 1.8 - 1, ry0 + .45, b.z + b.d / 4); }
    if (r() < .5) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 1.8, 14), std(0x9a8a70, { roughness: .6, metalness: .3 })); K.add(tank, b.x + b.w / 4, ry0 + 2.1, b.z - b.d / 4); for (const [lx, lz] of [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.2, 5), STEEL); K.add(lg, b.x + b.w / 4 + lx, ry0 + .6, b.z - b.d / 4 + lz); } }
  }
  for (let i = nRoof0; i < surf.root.children.length; i++) surf.root.children[i].userData.roof = true;
  // windows
  const glassMat = (lit) => { const m = new THREE.MeshStandardMaterial({ map: tex.window(lit), emissiveMap: tex.window(true), emissive: 0xffffff, emissiveIntensity: lit ? 0.4 : 0.0, roughness: 0.15, metalness: 0.2 }); (lit ? surf.windowMats : surf.windowMatsDark).push(m); return m; };
  const winGeo = new THREE.PlaneGeometry(1.15, 1.45), frameGeo = new THREE.BoxGeometry(1.35, 1.65, 0.14), sillGeo = new THREE.BoxGeometry(1.5, 0.1, 0.28);
  const placeWin = (px, pz, nx, nz) => {
    const a = Math.atan2(nx, nz); const lit = r() < 0.75; const g = new THREE.Mesh(winGeo, glassMat(lit)); g.position.set(px + nx * 0.2, 1.7, pz + nz * 0.2); g.rotation.y = a; surf.root.add(g);
    const f = new THREE.Mesh(frameGeo, trim); f.position.set(px + nx * 0.12, 1.7, pz + nz * 0.12); f.rotation.y = a; f.castShadow = true; surf.root.add(f);
    const s = new THREE.Mesh(sillGeo, trim); s.position.set(px + nx * 0.2, 0.84, pz + nz * 0.2); s.rotation.y = a; surf.root.add(s);
    const g2 = new THREE.Mesh(winGeo, g.material); g2.position.set(px - nx * 0.05, 1.7, pz - nz * 0.05); g2.rotation.y = a + Math.PI; surf.root.add(g2);
  };
  const winsAlong = (len, center, skipDoor) => { const n = Math.max(1, Math.floor((len - 1.5) / 3.4)); const out = []; for (let i = 0; i < n; i++) { const u = (i + 0.5) / n * len - len / 2; if (skipDoor && Math.abs(u) < DW + 1) continue; out.push(u); } return out; };
  const faces = [['n', 0, -1, b.w, true], ['s', 0, 1, b.w, true], ['w', -1, 0, b.d, false], ['e', 1, 0, b.d, false]];
  const rear = { n: 's', s: 'n', e: 'w', w: 'e' }[b.door]; const resid = b.kind === 'house' || b.kind === 'habitat';
  for (const [s, nx, nz, len, horiz] of faces) {
    if (!resid && s === rear) continue;
    for (const u of winsAlong(len, 0, b.door === s)) {
      const px = horiz ? b.x + u : (nx > 0 ? x1 : x0) + nx * T / 2, pz = horiz ? (nz > 0 ? z1 : z0) + nz * T / 2 : b.z + u;
      if (b.kind === 'house' && r() < 0.15) continue; placeWin(px, pz, nx, nz);
    }
  }
  // door: frame, open leaf, awning, steps, sign
  const D = P(0, b.door === 'n' || b.door === 's' ? (b.d / 2) : (b.w / 2)); const dx = D.x, dz = D.z;
  const fr = (u, w2, h2, y) => { const p = P(u, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2); const m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.4), trim); m.position.set(p.x, y, p.z); m.rotation.y = ry; m.castShadow = true; surf.root.add(m); };
  fr(-DW - 0.08, 0.16, 2.55, 1.28); fr(DW + 0.08, 0.16, 2.55, 1.28); fr(0, DW * 2 + 0.3, 0.16, 2.58);
  { const hinge = P(-DW + 0.05, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 0.02); const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.35, 0.07), std(b.doorColor ?? 0x4a3a2a, { roughness: .7 })); const pv = new THREE.Group(); pv.position.set(hinge.x, 1.2, hinge.z); pv.rotation.y = ry + 1.25; leaf.position.set(0.5, 0, 0); pv.add(leaf); const hdl = new THREE.Mesh(new THREE.SphereGeometry(.04, 6, 6), STEEL); hdl.position.set(0.88, 0, 0.05); pv.add(hdl); pv.traverse(o => o.isMesh && (o.castShadow = true)); surf.root.add(pv); }
  const A = P(0, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 0.9);   // awning
  const aw = new THREE.Mesh(new THREE.BoxGeometry(DW * 2 + 2.2, 0.08, 2.0), std(b.awning ?? 0x7a2a2a, { roughness: .8 })); aw.position.set(A.x, 3.05, A.z); aw.rotation.set(0, ry, 0); aw.rotateX(0.18); aw.castShadow = true; surf.root.add(aw);
  for (const u of [-DW - 0.9, DW + 0.9]) { const p = P(u, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 1.7); const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 8), trim); post.position.set(p.x, 1.45, p.z); post.castShadow = true; surf.root.add(post); }
  const stp = P(0, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 0.75); const step = new THREE.Mesh(new THREE.BoxGeometry(DW * 2 + 0.6, 0.2, 1.3), pm); step.position.set(stp.x, 0.1, stp.z); step.rotation.y = ry; step.receiveShadow = true; surf.root.add(step);
  const sgp = P(0, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 0.2); const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.0), new THREE.MeshStandardMaterial({ map: signTex(b.name.toUpperCase(), 384, 90, b.sign || '#1b2028', b.fg || '#ffd37a'), emissiveMap: signTex(b.name.toUpperCase(), 384, 90, b.sign || '#1b2028', b.fg || '#ffd37a'), emissive: 0xffffff, emissiveIntensity: 0.35 }));
  sg.position.set(sgp.x, H - 0.35, sgp.z); sg.rotation.y = ry; surf.root.add(sg); (surf.signs = surf.signs || []).push(sg);
  const board = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.15, 0.12), trim); board.position.set(sgp.x - dv[0] * 0.08, H - 0.35, sgp.z - dv[1] * 0.08); board.rotation.y = ry; surf.root.add(board);
  // porch lamps
  for (const u of [-DW - 0.5, DW + 0.5]) { const p = P(u, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 0.25); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0 })); bulb.position.set(p.x, 2.7, p.z); surf.root.add(bulb); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.28), DARK); arm.position.set(p.x - dv[0] * 0.12, 2.8, p.z - dv[1] * 0.12); arm.rotation.y = ry; surf.root.add(arm); (surf.bulbs = surf.bulbs || []).push(bulb); }
  // wall details: drain pipe, electrical box, vents
  { const p = P(b.w / 2 - 0.5 * (b.door === 'n' || b.door === 's' ? 1 : 0) - 0.4, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 0.12); const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, H, 8), STEEL); pipe.position.set(p.x, H / 2, p.z); surf.root.add(pipe); const eb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.15), std(0x7a7e84, { metalness: .5 })); eb.position.set(p.x + sd[0] * -0.9, 1.5, p.z + sd[1] * -0.9); eb.rotation.y = ry; surf.root.add(eb); }
  // (interior lighting is built per room in interiors.js and driven by Surface's pooled lights)
  const door = { x: P(0, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 2.5).x, z: P(0, (b.door === 'n' || b.door === 's' ? b.d : b.w) / 2 + 2.5).z };
  const back = { x: b.x - dv[0] * (b.w / 2 - 2) * (b.door === 'e' || b.door === 'w' ? 1 : 0) - dv[0] * 0, z: b.z - dv[1] * (b.d / 2 - 2) };
  if (b.door === 'e' || b.door === 'w') { back.x = b.x - dv[0] * (b.w / 2 - 2); back.z = b.z; } else { back.x = b.x; back.z = b.z - dv[1] * (b.d / 2 - 2); }
  const rec = { ...b, door, back, dv, x0, x1, z0, z1, H, P, ry, K };
  furnishBuilding(surf, rec, r);
  return rec;
}

// ---------- town dressing: roads, plaza, props ----------
export function dressTown(surf, r) {
  const root = surf.root; const hfy = (x, z) => surf.heightAt(x, z);
  // plaza + roads
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(21, 48), surfMat('pavers', 0xb8b0a0)); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true; const uv = plaza.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - .5) * 42 / 3, (uv.getY(i) - .5) * 42 / 3); root.add(plaza);
  const road = (x0, z0, x1, z1, w) => { const len = Math.hypot(x1 - x0, z1 - z0); const g = new THREE.PlaneGeometry(w, len); const m = new THREE.Mesh(g, surfMat('asphalt', 0xb0b0b0)); m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(x1 - x0, z1 - z0) + Math.PI; m.position.set((x0 + x1) / 2, 0.015, (z0 + z1) / 2); m.receiveShadow = true; const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w / 4, u.getY(i) * len / 4); root.add(m);
    for (let t = 0; t < len; t += 6) { const mk = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 2.6), new THREE.MeshBasicMaterial({ color: 0xd8c860 })); mk.rotation.x = -Math.PI / 2; mk.rotation.z = m.rotation.z; mk.position.set(x0 + (x1 - x0) * t / len, 0.025, z0 + (z1 - z0) * t / len); root.add(mk); } };
  road(-60, -2, 60, -2, 7); road(0, -22, 0, 26, 6); road(-44, 6, -22, 4, 5);
  // props
  const barrel = (x, z, c = 0x3a5a8a) => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .9, 14), std(c, { metalness: .5, roughness: .45 })); b.position.y = .45; g.add(b); for (const y of [.2, .7]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.325, .02, 6, 14), STEEL); ring.rotation.x = Math.PI / 2; ring.position.y = y; g.add(ring); } g.position.set(x, hfy(x, z), z); g.traverse(o => o.isMesh && (o.castShadow = true)); root.add(g); surf.colliders.push({ minx: x - .32, maxx: x + .32, minz: z - .32, maxz: z + .32, maxy: .9 }); };
  const crate = (x, z, s = 1, ry = 0) => { const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), std(0x8a6a3e, { roughness: .9 })); c.position.set(x, hfy(x, z) + s / 2, z); c.rotation.y = ry; c.castShadow = true; c.receiveShadow = true; root.add(c); for (const sx of [-1, 1]) { const sl = new THREE.Mesh(new THREE.BoxGeometry(.04, s + .02, s + .02), std(0x4a3418)); sl.position.set(c.position.x + Math.cos(ry) * sx * s * .4, c.position.y, c.position.z - Math.sin(ry) * sx * s * .4); sl.rotation.y = ry; root.add(sl); } surf.colliders.push({ minx: x - s * .7, maxx: x + s * .7, minz: z - s * .7, maxz: z + s * .7, maxy: s }); };
  const bench = (x, z, ry) => { const g = new THREE.Group(); const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, .06, .45), WOOD); seat.position.y = .45; g.add(seat); const back = new THREE.Mesh(new THREE.BoxGeometry(1.6, .4, .05), WOOD); back.position.set(0, .75, .2); g.add(back); for (const s of [-.7, .7]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.06, .45, .4), DARK); l.position.set(s, .22, 0); g.add(l); } g.position.set(x, hfy(x, z), z); g.rotation.y = ry; g.traverse(o => o.isMesh && (o.castShadow = true)); root.add(g); surf.colliders.push({ minx: x - .85, maxx: x + .85, minz: z - .3, maxz: z + .3, maxy: .5 }); };
  for (let i = 0; i < 6; i++) { const a = i * 1.047 + .3; bench(Math.cos(a) * 12.5, Math.sin(a) * 12.5, -a + Math.PI / 2 + Math.PI); }
  [[-34, -20], [-33.4, -19.4], [-12, -19], [14, -21], [38, -19], [40, 22], [-6, 27], [18, 26], [-33, 23], [-35, 22.2]].forEach(([x, z], i) => { if (i % 2) crate(x, z, 0.8 + (i % 3) * .15, i); else barrel(x, z, [0x3a5a8a, 0xc8422a, 0x4a6a3a][i % 3]); });
  // shipping containers
  [[-52, 20, 0x8a3a2a], [-52, 27, 0x2a5a8a], [60, -18, 0x4a6a3a]].forEach(([x, z, c], i) => { const cm = new THREE.Mesh(new THREE.BoxGeometry(12, 2.6, 2.5), surfMat('metal', c)); const g = cm.geometry; boxUV(g, 12, 2.6, 2.5, 2.4); cm.position.set(x, hfy(x, z) + 1.3, z); cm.rotation.y = i === 2 ? 0.3 : 0; cm.castShadow = true; cm.receiveShadow = true; root.add(cm); surf.colliders.push({ minx: x - 6.1, maxx: x + 6.1, minz: z - 1.3, maxz: z + 1.3, maxy: 2.6 }); });
  // power poles with cables
  const poles = []; for (let i = 0; i < 6; i++) { const x = -60 + i * 24, z = -9; const p = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, 8, 8), WOOD); p.position.set(x, hfy(x, z) + 4, z); p.castShadow = true; root.add(p); const cb = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 1.8), WOOD); cb.position.set(x, hfy(x, z) + 7.6, z); root.add(cb); poles.push(new THREE.Vector3(x, hfy(x, z) + 7.55, z)); }
  for (let i = 0; i < poles.length - 1; i++) for (const o of [-.8, .8]) { const a = poles[i], bb = poles[i + 1]; const pts = []; for (let t = 0; t <= 1; t += .1) pts.push(new THREE.Vector3(a.x + (bb.x - a.x) * t, a.y + (bb.y - a.y) * t - Math.sin(t * Math.PI) * .6, a.z + o)); const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x111111 })); root.add(ln); }
  surf.colliders.push(...poles.map(p => ({ minx: p.x - .15, maxx: p.x + .15, minz: p.z - .15, maxz: p.z + .15, maxy: 8 })));
  // radio tower
  { const x = 74, z = 18; const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .78; const leg = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 30, 5), STEEL); leg.position.set(Math.cos(a) * .9, 15, Math.sin(a) * .9); leg.rotation.set(Math.sin(a) * .03, 0, -Math.cos(a) * .03); g.add(leg); } for (let y = 3; y < 30; y += 4) { const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .025, 4, 4), STEEL); ring.rotation.x = Math.PI / 2; ring.rotation.z = .78; ring.position.y = y; g.add(ring); } const lt = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); lt.position.y = 30.3; g.add(lt); (surf.blinkers = surf.blinkers || []).push(lt); g.position.set(x, hfy(x, z), z); root.add(g); surf.colliders.push({ minx: x - 1, maxx: x + 1, minz: z - 1, maxz: z + 1, maxy: 30 }); }
  // monument
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.7, 20), surfMat('concrete', 0x9a9a98)); base.position.y = .35; base.receiveShadow = true; root.add(base);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(.7, 6, 6), std(0xc0c6d0, { metalness: .8, roughness: .25 })); spire.position.y = 3.7; spire.castShadow = true; root.add(spire); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, .06, 8, 36), new THREE.MeshBasicMaterial({ color: 0x37e6c9 })); ring.rotation.x = Math.PI / 2; ring.position.y = 3.2; root.add(ring); surf.monRing = ring;
  surf.colliders.push({ minx: -2.4, maxx: 2.4, minz: -2.4, maxz: 2.4, maxy: 6 });
}
