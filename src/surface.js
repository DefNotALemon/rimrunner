// Planet surface: terrain, settlements, resource nodes, day/night, ship pad
import * as THREE from '../vendor/three.module.js';
import { rng, fbm, noise3, clamp, lerp } from './util.js';
import { PLANET_KINDS, ITEMS } from './data.js';
import { G } from './state.js';
import { buildPlayerShip, buildPerson, gunMesh } from './models.js';
import { makePerson } from './gen.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });

function signCanvas(text, w = 256, h = 64, bg = '#1b2028', fg = '#ffd37a') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = fg; x.lineWidth = 3; x.strokeRect(3, 3, w - 6, h - 6);
  x.fillStyle = fg; x.font = `bold ${h * 0.46}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Surface {
  constructor(camera) {
    this.camera = camera; this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3226, 0.7); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220; this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = [];
    this.dummyStars = null;
  }

  heightAt(x, z) {
    const P = this.planet; if (!P) return 0;
    const f = this.freq, a = this.amp;
    let h = (fbm(x * f, 0.37, z * f, P.seed, 5) - 0.45) * a + (fbm(x * f * 4, 5.1, z * f * 4, P.seed + 9, 3) - 0.5) * a * 0.12;
    if (this.kind === 'volcanic') h += Math.max(0, 1 - Math.abs(noise3(x * 0.008, 0, z * 0.008, P.seed + 4) - 0.5) * 7) * a * 0.5;
    if (this.kind === 'desert') h = h * 0.6 + Math.sin(x * 0.04 + fbm(x * 0.01, 0, z * 0.01, P.seed, 2) * 6) * 1.5;
    const d = Math.hypot(x - this.flatC.x, z - this.flatC.z);
    const k = clamp((d - this.flatR) / this.flatBlend, 0, 1); const s = k * k * (3 - 2 * k);
    return lerp(0, h, s);
  }

  enter(planet, sys) {
    this.planet = planet; this.sys = sys; this.kind = planet.kind; const K = PLANET_KINDS[planet.kind];
    this.K = K; this.air = planet.air; this.gravity = clamp(planet.g, 0.25, 1.5);
    this.root.clear(); this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = []; this.buildings = [];
    this.freq = 0.006 * (planet.shape === 'lumpy' ? 1.5 : 1); this.amp = (planet.kind === 'ocean' ? 14 : 40) * (planet.kind === 'barren' ? 1.2 : 1) * (planet.shape === 'lumpy' ? 1.6 : 1);
    this.flatC = V(0, 0, 0); this.flatR = planet.settled ? 78 : 22; this.flatBlend = planet.settled ? 55 : 40;
    const r = rng(planet.seed ^ 0x5151);
    // terrain
    const SZ = 900, SEG = 260; const g = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3); const pal = K.pal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = this.heightAt(x, z); pos.setY(i, h);
      const t = clamp((h / this.amp) * 1.3 + 0.45 + (fbm(x * 0.05, 0, z * 0.05, planet.seed + 2, 3) - 0.5) * 0.5, 0, 0.999) * (pal.length - 1); const ii = Math.floor(t), k = t - ii;
      col[i * 3] = lerp(pal[ii][0], pal[ii + 1][0], k); col[i * 3 + 1] = lerp(pal[ii][1], pal[ii + 1][1], k); col[i * 3 + 2] = lerp(pal[ii][2], pal[ii + 1][2], k);
      if (Math.hypot(x, z) < this.flatR + 4 && planet.settled) { col[i * 3] *= 0.8; col[i * 3 + 1] *= 0.78; col[i * 3 + 2] *= 0.76; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })); this.terrain.receiveShadow = true; this.root.add(this.terrain);
    if (planet.kind === 'ocean' || (planet.kind === 'volcanic')) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(SZ * 2, SZ * 2), new THREE.MeshStandardMaterial({ color: planet.kind === 'ocean' ? 0x1d5f9c : 0xff5a10, roughness: 0.25, metalness: 0.3, transparent: planet.kind === 'ocean', opacity: 0.85, emissive: planet.kind === 'volcanic' ? 0xff3a00 : 0x000000, emissiveIntensity: 0.8 }));
      w.rotation.x = -Math.PI / 2; w.position.y = planet.kind === 'ocean' ? -2.5 : -6; this.root.add(w);
    }
    // sky
    this.skyCol = new THREE.Color(K.sky); this.scene.fog = new THREE.Fog(0x000000, 60, planet.air > 0.3 ? 520 : 1400);
    if (!this.stars) {
      const n = 1800, p = new Float32Array(n * 3); const rr = rng(3);
      for (let i = 0; i < n; i++) { const u = rr() * 2 - 1, t = rr() * 6.283, s = Math.sqrt(1 - u * u); p.set([s * Math.cos(t) * 800, Math.abs(u) * 800, s * Math.sin(t) * 800], i * 3); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, color: 0xffffff, fog: false, transparent: true, depthWrite: false })); this.stars.frustumCulled = false;
    }
    this.root.add(this.stars);
    // a big sibling planet in the sky
    const sib = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(...K.pal[1]).multiplyScalar(0.6), fog: false })); sib.position.set(-300, 220, -600); this.root.add(sib); this.sibling = sib;
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: this.sys.star.c, fog: false })); this.root.add(this.sunMesh);
    // decorations
    this.scatter(r);
    // resource nodes
    const common = K.res; const weights = common.map(id => (planet.rich.includes(id) ? 3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 70; i++) {
      let w = r() * total, id = common[0]; for (let k = 0; k < common.length; k++) { w -= weights[k]; if (w <= 0) { id = common[k]; break; } }
      const ang = r() * 6.283, d = r.range(this.flatR + 8, 300); const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      this.addNode(id, x, z, planet.rich.includes(id) ? r.range(1.2, 2.2) : r.range(0.7, 1.4), r);
    }
    // settlement
    this.padPos = planet.settled ? V(-40, 0, 8) : V(8, 0, 6);
    this.buildShip(); this.shop = null; this.lease = null;
    if (planet.settled) this.buildTown(r);
    else if (r.chance(0.5)) this.addLoneWanderer(r);
    this.timeOfDay();
  }

  addNode(id, x, z, size, r) {
    const it = ITEMS[id]; const col = new THREE.Color(it.color);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 * size, 0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.4, emissive: col, emissiveIntensity: id === 'hymnstone' || id === 'ruby' ? 0.5 : 0.08, flatShading: true }));
    m.scale.set(1, r.range(0.7, 1.3), r.range(0.8, 1.2)); const y = this.heightAt(x, z); m.position.set(x, y + 0.5 * size, z); m.rotation.set(r(), r(), r()); m.castShadow = true;
    this.root.add(m); this.nodes.push({ m, id, pos: m.position.clone(), hp: 1, size, alive: true });
  }

  scatter(r) {
    const P = this.planet, K = this.K; const life = P.kind === 'temperate' || P.kind === 'ocean' ? 1 : P.kind === 'toxic' || P.kind === 'desert' ? 0.35 : P.kind === 'crystal' ? 0.6 : 0.12;
    const mk = (geo, mat, n, fn) => {
      const im = new THREE.InstancedMesh(geo, mat, n); const d = new THREE.Object3D(); let c = 0;
      for (let i = 0; i < n; i++) {
        const x = r.range(-420, 420), z = r.range(-420, 420); if (Math.hypot(x, z) < this.flatR + 3) continue; const h = this.heightAt(x, z); if (P.kind === 'ocean' && h < -2) continue;
        fn(d, x, h, z); d.updateMatrix(); im.setMatrixAt(c++, d.matrix);
      }
      im.count = c; im.castShadow = true; im.receiveShadow = true; this.root.add(im);
    };
    const rockMat = std(new THREE.Color(...K.pal[2]).multiplyScalar(0.7), { flatShading: true });
    mk(new THREE.DodecahedronGeometry(1, 0), rockMat, 420, (d, x, h, z) => { const s = r.range(0.4, 3.2); d.position.set(x, h + s * 0.3, z); d.scale.set(s, s * r.range(0.5, 1), s * r.range(0.7, 1.2)); d.rotation.set(r(), r(), r()); });
    if (life > 0.1) {
      const leaf = P.kind === 'toxic' ? 0x8aa020 : P.kind === 'desert' ? 0x6a7a30 : P.kind === 'crystal' ? 0xa070e0 : 0x2f6a35;
      mk(new THREE.ConeGeometry(1.8, 6, 7), std(leaf), Math.floor(380 * life), (d, x, h, z) => { const s = r.range(0.7, 1.6); d.position.set(x, h + 3 * s, z); d.scale.setScalar(s); d.rotation.set(0, r() * 6, 0); });
      mk(new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6), std(0x4a3524), Math.floor(380 * life), (d, x, h, z) => { d.position.set(x, h + 1, z); d.scale.setScalar(1); });
    }
    if (P.kind === 'crystal') mk(new THREE.ConeGeometry(0.7, 5, 5), new THREE.MeshStandardMaterial({ color: 0xb78cff, emissive: 0x6a3cc0, emissiveIntensity: 0.6, roughness: 0.2 }), 140, (d, x, h, z) => { const s = r.range(0.6, 2.4); d.position.set(x, h + 2 * s, z); d.scale.setScalar(s); d.rotation.set(r.range(-0.3, 0.3), 0, r.range(-0.3, 0.3)); });
  }

  buildShip() {
    const g = new THREE.Group(); const m = buildPlayerShip(); m.scale.setScalar(1.15); m.position.y = 3.1; m.rotation.y = Math.PI / 2 * 0; g.add(m);
    const leg = std(0x3b4048); for (const [x, z] of [[-3, -4], [3, -4], [-3, 4], [3, 4]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2.6, 6), leg); l.position.set(x, 1.3, z); g.add(l); }
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.3, 32), std(0x555a63)); pad.position.y = 0.05; pad.receiveShadow = true; g.add(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.12, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffb020 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const y = this.heightAt(this.padPos.x, this.padPos.z); g.position.set(this.padPos.x, y, this.padPos.z); this.root.add(g); this.shipG = g;
    this.colliders.push({ minx: this.padPos.x - 3.4, maxx: this.padPos.x + 3.4, minz: this.padPos.z - 6, maxz: this.padPos.z + 6, maxy: 7, id: 'ship' });
    const px = this.padPos.x, pz = this.padPos.z;
    this.interactables.push({ pos: V(px + 6, 1, pz), r: 3.2, label: 'Board ship', act: 'board' });
    this.interactables.push({ pos: V(px + 6, 1, pz + 6), r: 3, label: 'Ship lockers', act: 'lockers' });
    this.addBench(px + 8, pz - 6, 'Field Bench', 'bench');
    this.addBench(px + 11, pz - 3, 'Research Terminal', 'tech', true);
  }
  addBench(x, z, label, act, terminal) {
    const y = this.heightAt(x, z); const g = new THREE.Group();
    if (!terminal) { const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1), std(0x7a5a3a)); top.position.y = 1; g.add(top); for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.8), std(0x3a3f46)); l.position.set(s * 1, 0.5, 0); g.add(l); } const vice = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), std(0xb02a2a)); vice.position.set(0.7, 1.15, 0); g.add(vice); }
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), std(0x2a2f38)); b.position.y = 0.55; g.add(b); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: 0x4fd1ff })); sc.position.set(0, 1.25, 0.2); sc.rotation.x = -0.3; g.add(sc); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(x, y, z); this.root.add(g); this.colliders.push({ minx: x - 1.1, maxx: x + 1.1, minz: z - 0.6, maxz: z + 0.6, maxy: 1.2 });
    this.interactables.push({ pos: V(x, y + 1, z + 0.9), r: 2.2, label, act });
  }

  wallBox(minx, maxx, minz, maxz, h, mat, y0 = 0) {
    const w = maxx - minx, d = maxz - minz; const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set((minx + maxx) / 2, y0 + h / 2, (minz + maxz) / 2);
    m.castShadow = true; m.receiveShadow = true; this.root.add(m); this.colliders.push({ minx, maxx, minz, maxz, maxy: y0 + h });
  }

  building(b) {
    const T = 0.35, H = 3.6, DW = 1.1;   // wall thickness, height, half door width
    const wallMat = std(b.color), trim = std(0x20242b);
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    const side = (s, a0, a1, fixed, horiz) => {   // horizontal wall (along x) at z=fixed, or vertical (along z) at x=fixed
      const hasDoor = b.door === s;
      const seg = (u0, u1) => { if (u1 - u0 < 0.05) return; if (horiz) this.wallBox(u0, u1, fixed - T / 2, fixed + T / 2, H, wallMat); else this.wallBox(fixed - T / 2, fixed + T / 2, u0, u1, H, wallMat); };
      if (hasDoor) { const c = horiz ? b.x : b.z; seg(a0, c - DW); seg(c + DW, a1);
        // lintel above door
        const lm = new THREE.Mesh(new THREE.BoxGeometry(horiz ? DW * 2 : T, H - 2.6, horiz ? T : DW * 2), wallMat); lm.position.set(horiz ? c : fixed, 2.6 + (H - 2.6) / 2, horiz ? fixed : c); this.root.add(lm);
      } else seg(a0, a1);
    };
    side('n', x0, x1, z0, true); side('s', x0, x1, z1, true); side('w', z0, z1, x0, false); side('e', z0, z1, x1, false);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.8, 0.3, b.d + 0.8), trim); roof.position.set(b.x, H + 0.15, b.z); roof.castShadow = true; this.root.add(roof);
    this.colliders.push({ minx: x0, maxx: x1, minz: z0, maxz: z1, maxy: 99, roof: true, miny: H });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(b.w, 0.1, b.d), std(0x55524c)); floor.position.set(b.x, 0.03, b.z); floor.receiveShadow = true; this.root.add(floor);
    const lamp = new THREE.PointLight(0xffe2b0, 14, 16, 1.6); lamp.position.set(b.x, 3, b.z); this.root.add(lamp);
    // sign above door
    const dv = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[b.door]; const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.1), new THREE.MeshBasicMaterial({ map: signCanvas(b.name.toUpperCase(), 320, 76, b.sign || '#1b2028', b.fg || '#ffd37a') }));
    sg.position.set(b.x + dv[0] * (b.w / 2 + 0.05), 3.0, b.z + dv[1] * (b.d / 2 + 0.05)); sg.rotation.y = Math.atan2(dv[0], dv[1]); this.root.add(sg);
    const door = { x: b.x + dv[0] * (b.w / 2 + 2.5), z: b.z + dv[1] * (b.d / 2 + 2.5) };
    const back = { x: b.x - dv[0] * (b.w / 2 - 2), z: b.z - dv[1] * (b.d / 2 - 2) };
    const rec = { ...b, door, back, dv, x0, x1, z0, z1 }; this.buildings.push(rec); return rec;
  }

  buildTown(r) {
    const specs = [
      { id: 'exchange', name: 'Rim Exchange', x: -26, z: -28, w: 15, d: 11, door: 's', color: 0x7a6a50, sign: '#3a2a10' },
      { id: 'gunsmith', name: 'Forge & Barrel', x: 0, z: -28, w: 16, d: 12, door: 's', color: 0x5a5f66, sign: '#3a1010', fg: '#ff9a6a' },
      { id: 'cantina', name: 'The Dry Dock', x: 27, z: -28, w: 15, d: 12, door: 's', color: 0x6a4a42, sign: '#201030', fg: '#ff8ae0' },
      { id: 'lease', name: 'For Lease', x: -24, z: 32, w: 13, d: 10, door: 'n', color: 0x6a7a68, sign: '#10281c', fg: '#7aff9a' },
      { id: 'patrol', name: 'Rimway Patrol', x: 2, z: 33, w: 14, d: 10, door: 'n', color: 0x3d4552, sign: '#0c1a3c', fg: '#6aa8ff' },
      { id: 'outfitter', name: 'Outfitters', x: 28, z: 32, w: 14, d: 10, door: 'n', color: 0x7a5a3a, sign: '#2a1c08' },
    ];
    this.B = {}; specs.forEach(s => { this.B[s.id] = this.building(s); });
    // houses (decor)
    for (const [x, z, d] of [[52, 0, 'w'], [-56, -4, 'e'], [54, 24, 'w']]) this.building({ id: 'house', name: 'Quarters', x, z, w: 9, d: 9, door: d, color: r.pick([0x8a7a6a, 0x6a7a8a, 0x8a6a6a]), sign: '#222' });
    // plaza lamps + fountain-ish monument
    const mon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 1.2, 12), std(0x8a8f98)); mon.position.y = 0.6; mon.castShadow = true; this.root.add(mon);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 5, 6), std(0xc0c6d0, { metalness: 0.7, roughness: 0.3 })); spire.position.y = 3.6; spire.castShadow = true; this.root.add(spire);
    this.colliders.push({ minx: -2.2, maxx: 2.2, minz: -2.2, maxz: 2.2, maxy: 6 });
    for (let a = 0; a < 8; a++) { const x = Math.cos(a * 0.785) * 16, z = Math.sin(a * 0.785) * 16; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4, 6), std(0x30343c)); p.position.set(x, 2, z); this.root.add(p); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })); bulb.position.set(x, 4.1, z); this.root.add(bulb); const pl = new THREE.PointLight(0xffd9a0, 0, 20, 1.6); pl.position.set(x, 4, z); this.root.add(pl); (this.lamps = this.lamps || []).push(pl); }
    this.lamps = this.lamps || [];
    // interiors
    const gs = this.B.gunsmith; this.addBench(gs.back.x - 3, gs.back.z, 'Gunsmith Workbench', 'bench'); this.addBench(gs.back.x + 3, gs.back.z, 'Research Terminal', 'tech', true);
    const ex = this.B.exchange; this.counter(ex, 'Exchange Desk');
    const of = this.B.outfitter; this.counter(of, 'Outfitter Counter'); this.interactables.push({ pos: V(of.back.x, 1, of.back.z + 1.4 * (of.dv[1] > 0 ? 1 : -1)), r: 3, label: 'Buy supplies & refuel', act: 'outfitter' });
    const pa = this.B.patrol; this.counter(pa, 'Patrol Desk'); this.interactables.push({ pos: V(pa.back.x, 1, pa.back.z), r: 3.4, label: 'Clear bounty / pay fines', act: 'patrol' });
    const ls = this.B.lease; this.lease = ls; this.interactables.push({ pos: V(ls.x, 1, ls.z), r: 4, label: 'Lease this shop (400 cr)', act: 'lease', data: ls });
    this.counter(this.B.cantina, 'Bar');
    // people
    const n = clamp(6 + Math.floor(this.planet.pop / 120), 6, 14); const seedBase = this.planet.seed;
    const roles = ['exchange', 'gunsmith', 'cantina', 'outfitter', 'patrol'];
    for (let i = 0; i < n; i++) {
      const prof = makePerson(seedBase * 7 + i * 31, this.planet, this.sys);
      const npc = this.spawnNPC(prof);
      if (i < 5) { npc.station = this.B[roles[i]]; npc.home = { x: npc.station.back.x + (i % 2 ? 1.2 : -1.2), z: npc.station.back.z }; if (i === 4) prof.cop = true; }
      else npc.wander = true;
      const hp = npc.home || this.randPlaza(r); npc.pos.set(hp.x, this.heightAt(hp.x, hp.z), hp.z); npc.mesh.position.copy(npc.pos);
    }
  }
  counter(b, label) {
    const cx = b.back.x - b.dv[0] * 1.8 + (b.dv[1] ? 0 : 0), cz = b.back.z - b.dv[1] * 1.8;
    const horiz = b.dv[1] !== 0; const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 4.2 : 0.9, 1.05, horiz ? 0.9 : 4.2), std(0x6a4a2e)); m.position.set(b.back.x + b.dv[0] * 2.6, 0.55, b.back.z + b.dv[1] * 2.6); m.castShadow = true; this.root.add(m);
    this.colliders.push({ minx: m.position.x - (horiz ? 2.1 : 0.45), maxx: m.position.x + (horiz ? 2.1 : 0.45), minz: m.position.z - (horiz ? 0.45 : 2.1), maxz: m.position.z + (horiz ? 0.45 : 2.1), maxy: 1.1 });
    b.counterMesh = m; return m;
  }
  randPlaza(r) { const a = r() * 6.283, d = r.range(5, 30); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }

  spawnNPC(prof, opts = {}) {
    const mesh = buildPerson(prof.look, { badge: prof.cop || opts.cop, pants: prof.cop ? 0x1c2638 : undefined }); mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.root.add(mesh);
    const npc = { prof, mesh, pos: V(), vel: V(), target: null, wait: Math.random() * 3, t: Math.random() * 10, state: 'idle', hostile: false, hp: 60, ...opts };
    // quest marker
    const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: signCanvasTex('!'), transparent: true, depthTest: false })); mk.scale.set(0.5, 0.5, 1); mk.position.y = 2.2; mk.visible = false; mesh.add(mk); npc.marker = mk;
    this.npcs.push(npc); return npc;
  }
  addLoneWanderer(r) {
    const prof = makePerson(this.planet.seed * 3 + 5, this.planet, this.sys); const n = this.spawnNPC(prof); n.wander = true; n.lone = true;
    n.pos.set(this.padPos.x + 25, 0, this.padPos.z + 12); n.pos.y = this.heightAt(n.pos.x, n.pos.z); n.mesh.position.copy(n.pos);
  }

  // push a circle out of colliders
  collide(p, rad, feetY) {
    for (const c of this.colliders) {
      if (c.roof) continue;
      if (c.maxy !== undefined && feetY >= c.maxy - 0.05) continue;
      const cx = clamp(p.x, c.minx, c.maxx), cz = clamp(p.z, c.minz, c.maxz); const dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 < rad * rad) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (rad - d) / d; p.x += dx * k; p.z += dz * k; }
        else { const l = p.x - c.minx, rr = c.maxx - p.x, t = p.z - c.minz, b = c.maxz - p.z, m = Math.min(l, rr, t, b); if (m === l) p.x = c.minx - rad; else if (m === rr) p.x = c.maxx + rad; else if (m === t) p.z = c.minz - rad; else p.z = c.maxz + rad; }
      }
    }
  }
  // distance to nearest wall in direction (for leaning); returns {dist, nx, nz}
  wallProbe(x, z, dx, dz, maxd = 1.0) {
    let best = null;
    for (let s = 0.2; s <= maxd; s += 0.1) {
      const px = x + dx * s, pz = z + dz * s;
      for (const c of this.colliders) { if (c.roof || (c.maxy !== undefined && c.maxy < 1.6)) continue; if (px > c.minx && px < c.maxx && pz > c.minz && pz < c.maxz) return { dist: s, nx: -dx, nz: -dz }; }
    }
    return best;
  }

  dropGun(g, pos) {
    const m = gunMesh(g.id); m.scale.setScalar(1.6); const y = this.heightAt(pos.x, pos.z) + 0.25; m.position.set(pos.x, y, pos.z); m.rotation.y = Math.random() * 6; this.root.add(m);
    const it = { pos: V(pos.x, y, pos.z), r: 2, label: `Pick up ${ITEMS[g.id].name}`, act: 'pickup', data: { g, m } }; this.interactables.push(it); this.pickups.push(it);
  }

  timeOfDay() {
    const t = (G.time / 600 + 0.3) % 1; const el = Math.sin(t * Math.PI * 2); this.dayLevel = clamp(el * 1.6 + 0.3, 0, 1);
    const L = this.dayLevel; const K = this.K; const air = this.air > 0.3;
    const sky = air ? new THREE.Color(0x03050c).lerp(this.skyCol, L) : new THREE.Color(0x000000);
    if (air && L < 0.5 && L > 0.05) sky.lerp(new THREE.Color(0xff8a50), (0.5 - Math.abs(L - 0.25) * 2) * 0.25);
    this.scene.background = sky; this.scene.fog.color.copy(air ? sky : new THREE.Color(0x04050a));
    this.hemi.intensity = 0.3 + 1.7 * L * (air ? 1 : 0.55); this.hemi.color.copy(air ? this.skyCol : new THREE.Color(0x778899));
    this.sun.intensity = 2.6 * L + 0.05; this.sun.color.set(L < 0.45 ? 0xffb070 : 0xfff3df);
    const ang = t * Math.PI * 2; this.sunDir = V(Math.cos(ang) * 0.8, Math.max(0.05, el), Math.sin(ang) * 0.4).normalize();
    this.stars.material.opacity = air ? clamp(1 - L * 1.5, 0, 1) : 1; this.stars.visible = this.stars.material.opacity > 0.02;
    if (this.sunMesh) { this.sunMesh.position.copy(this.sunDir).multiplyScalar(700); this.sunMesh.visible = el > -0.1; }
    for (const l of this.lamps || []) l.intensity = (1 - L) * 25;
  }

  update(dt, player) {
    this.timeOfDay();
    this.sun.position.copy(player.pos).addScaledVector(this.sunDir, 120); this.sun.target.position.copy(player.pos);
    if (this.sibling) this.sibling.position.set(-300 + player.pos.x * 0.9, 220, -600 + player.pos.z * 0.9);
    this.stars.position.copy(player.pos);
    // NPC movement
    for (const n of this.npcs) this.updateNPC(n, dt, player);
    // respawn depleted nodes slowly
    for (const nd of this.nodes) if (!nd.alive) { nd.t = (nd.t || 0) + dt; if (nd.t > 240) { nd.alive = true; nd.m.visible = true; nd.t = 0; nd.hp = 1; } }
  }

  updateNPC(n, dt, player) {
    n.t += dt;
    const p = n.pos;
    let sp = 0;
    if (n.dead) { n.mesh.rotation.x = lerp(n.mesh.rotation.x, -Math.PI / 2, 0.1); return; }
    if (n.approach && !n.talking) {   // walk toward the player with a quest
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > 3) { p.x += dx / d * 2.4 * dt; p.z += dz / d * 2.4 * dt; sp = 2.4; this.face(n, dx, dz); } else this.face(n, dx, dz);
    } else if (n.fleeFrom) {
      const dx = p.x - n.fleeFrom.x, dz = p.z - n.fleeFrom.z, d = Math.hypot(dx, dz) || 1; p.x += dx / d * 5 * dt; p.z += dz / d * 5 * dt; sp = 5; this.face(n, dx, dz); n.fleeT = (n.fleeT || 0) - dt; if (n.fleeT < -6) n.fleeFrom = null;
    } else if (n.customer) {
      const c = n.customer; const tg = c.path[c.i]; if (tg) { const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz); if (d < 0.6) { c.i++; if (c.i >= c.path.length) { c.done && c.done(n); } } else { p.x += dx / d * 1.8 * dt; p.z += dz / d * 1.8 * dt; sp = 1.8; this.face(n, dx, dz); } }
    } else if (n.talking) { this.face(n, player.pos.x - p.x, player.pos.z - p.z); }
    else if (n.station && !n.wander) { /* stands at post */ if (n.home) { const dx = n.home.x - p.x, dz = n.home.z - p.z, d = Math.hypot(dx, dz); if (d > 0.4) { p.x += dx / d * 1.5 * dt; p.z += dz / d * 1.5 * dt; sp = 1.5; this.face(n, dx, dz); } else this.face(n, -n.station.dv[0], -n.station.dv[1] + (n.station.dv[1] ? 0 : 0)); } }
    else if (n.wander) {
      n.wait -= dt;
      if (!n.target && n.wait <= 0) { const a = Math.random() * 6.283, d = 6 + Math.random() * (n.lone ? 12 : 26); n.target = n.lone ? { x: this.padPos.x + 25 + Math.cos(a) * d, z: this.padPos.z + 12 + Math.sin(a) * d } : { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
      if (n.target) { const dx = n.target.x - p.x, dz = n.target.z - p.z, d = Math.hypot(dx, dz); if (d < 0.8) { n.target = null; n.wait = 2 + Math.random() * 6; } else { p.x += dx / d * 1.35 * dt; p.z += dz / d * 1.35 * dt; sp = 1.35; this.face(n, dx, dz); } }
    }
    this.collide(p, 0.35, 0); p.y = this.heightAt(p.x, p.z); n.mesh.position.copy(p);
    // walk cycle
    n.gait = (n.gait || 0) + sp * dt * 2.2; const sw = Math.sin(n.gait) * Math.min(1, sp) * 0.7; const u = n.mesh.userData;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw; u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8;
    n.mesh.children.forEach(c => { if (c === u.head) c.position.y = 1.62 + Math.sin(n.t * 1.7) * 0.004; });
    n.moving = sp > 0.1;
  }
  face(n, dx, dz) { if (Math.abs(dx) + Math.abs(dz) < 0.001) return; const a = Math.atan2(-dx, -dz); let d = a - n.mesh.rotation.y; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; n.mesh.rotation.y += d * 0.15; }
}

function signCanvasTex(txt) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#ffd24a'; x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fill();
  x.fillStyle = '#222'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 32, 35); return new THREE.CanvasTexture(c);
}
