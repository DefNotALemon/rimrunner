// Planet surface: endless terrain, sky, settlement, resource nodes, people. Also hosts atmospheric flight.
import * as THREE from '../vendor/three.module.js';
import { rng, clamp, lerp, hashStr } from './util.js';
import { PLANET_KINDS, ITEMS } from './data.js';
import { G } from './state.js';
import { buildPlayerShip, gunMesh } from './models.js';
import { makePerson } from './gen.js';
import { buildHuman, animateHuman, OUTFITS, outfitFor, setOutfit } from './people.js';
import { HeightField, Terrain, Scatter } from './terrain.js';
import { Sky } from './sky.js';
import { makeBuilding, dressTown } from './buildings.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });
const NODE_TILE = 90;

export class Surface {
  constructor(camera) {
    this.camera = camera; this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3226, 0.7); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 1; sc.far = 260; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.06;
    this.scene.add(this.sun, this.sun.target);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.sky = new Sky(); this.scene.add(this.sky.mesh);
    this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = []; this.buildings = [];
    this.nodeTiles = new Map(); this.depleted = {}; this.sunDir = V(0, 1, 0); this.alt = 0; this.flightMode = false;
  }

  heightAt(x, z) { return this.hf ? this.hf.at(x, z, 5) : 0; }

  enter(planet, sys, opts = {}) {
    this.planet = planet; this.sys = sys; this.kind = planet.kind; const K = PLANET_KINDS[planet.kind];
    this.K = K; this.air = planet.air; this.gravity = clamp(planet.g, 0.25, 1.5);
    this.root.clear(); this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = []; this.buildings = []; this.nodeTiles.clear(); this.depleted = {};
    this.windowMats = []; this.windowMatsDark = []; this.blinkers = []; this.bulbs = []; this.signs = []; this.interiorLamps = []; this.lamps = []; this.shipG = null; this.B = null; this.lease = null; this.shop = null;
    const hf = this.hf = new HeightField(planet, planet.kind, K);
    this.flatR = planet.settled ? 80 : 24;
    hf.flats.push({ x: 0, z: 0, r: this.flatR, blend: planet.settled ? 70 : 30, h: 0 });
    this.padPos = planet.settled ? V(-40, 0, 8) : V(10, 0, 6);
    this.terrain = new Terrain(this.root, hf); this.terrain.update(0, 0, true);
    this.scatter = new Scatter(this.root, hf, planet.kind); this.avoidFn = (x, z) => planet.settled && Math.hypot(x, z) < 92 || Math.hypot(x - this.padPos.x, z - this.padPos.z) < 18;
    if (hf.water > -999) {
      const ocean = planet.kind === 'ocean';
      this.water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), new THREE.MeshStandardMaterial({ color: ocean ? 0x1d6a9c : 0xff5a10, roughness: ocean ? 0.12 : 0.6, metalness: ocean ? 0.15 : 0, transparent: ocean, opacity: ocean ? 0.86 : 1, emissive: ocean ? 0x000000 : 0xff3a00, emissiveIntensity: ocean ? 0 : 0.9 }));
      this.water.rotation.x = -Math.PI / 2; this.water.position.y = hf.water; this.root.add(this.water);
    } else this.water = null;
    this.sky.set(K.sky, planet.air, 0.35 + Math.abs(Math.sin(planet.seed)) * 0.5); this.scene.add(this.sky.mesh);
    this.scene.fog = new THREE.Fog(0x888888, 150, planet.air > 0.3 ? 16000 : 60000);
    const r = rng(planet.seed ^ 0x5151);
    this.parkShip(this.padPos.x, this.padPos.z, 0, true);
    if (planet.settled) this.buildTown(r); else if (r.chance(0.5)) this.addLoneWanderer(r);
    this.updateNodes(opts.px ?? this.padPos.x, opts.pz ?? this.padPos.z);
    this.scatter.setVisible(true); this.scatter.cx = 1e9;
    this.timeOfDay(); this.terrain.update(opts.px ?? 0, opts.pz ?? 0, true);
  }

  updateNodes(px, pz) {
    const tx = Math.floor(px / NODE_TILE), tz = Math.floor(pz / NODE_TILE); const K = this.K, planet = this.planet;
    const common = K.res; const weights = common.map(id => (planet.rich.includes(id) ? 3 : 1)); const total = weights.reduce((a, b) => a + b, 0);
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const key = (tx + i) + ',' + (tz + j); if (this.nodeTiles.has(key)) continue;
      const r = rng(hashStr(key + ':' + planet.seed)); const list = []; const n = r.int(1, 4);
      for (let q = 0; q < n; q++) {
        const x = (tx + i + r()) * NODE_TILE, z = (tz + j + r()) * NODE_TILE; if (planet.settled && Math.hypot(x, z) < this.flatR + 6) continue; if (Math.hypot(x - this.padPos.x, z - this.padPos.z) < 16) continue;
        const y = this.heightAt(x, z); if (y < this.hf.water + 0.4) continue;
        let w = r() * total, id = common[0]; for (let k = 0; k < common.length; k++) { w -= weights[k]; if (w <= 0) { id = common[k]; break; } }
        const nk = key + ':' + q; const size = planet.rich.includes(id) ? r.range(1.2, 2.2) : r.range(0.7, 1.4);
        const it = ITEMS[id]; const col = new THREE.Color(it.color);
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 * size, 0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.4, emissive: col, emissiveIntensity: id === 'hymnstone' || id === 'ruby' ? 0.5 : 0.08, flatShading: true }));
        m.scale.set(1, r.range(0.7, 1.3), r.range(0.8, 1.2)); m.position.set(x, y + 0.5 * size, z); m.rotation.set(r(), r(), r()); m.castShadow = true; this.root.add(m);
        const node = { m, id, pos: m.position.clone(), hp: 1, size, alive: !(this.depleted[nk] > G.time - 240), key: nk }; m.visible = node.alive; list.push(node); this.nodes.push(node);
      }
      this.nodeTiles.set(key, list);
    }
    for (const [key, list] of this.nodeTiles) {
      const [a, b] = key.split(',').map(Number); if (Math.abs(a - tx) > 5 || Math.abs(b - tz) > 5) { for (const n of list) { this.root.remove(n.m); n.m.geometry.dispose(); const k = this.nodes.indexOf(n); if (k >= 0) this.nodes.splice(k, 1); } this.nodeTiles.delete(key); }
    }
  }
  markDepleted(node) { this.depleted[node.key] = G.time; }

  parkShip(x, z, yaw, atPad) {
    if (this.shipG) this.root.remove(this.shipG);
    const g = new THREE.Group(); const m = buildPlayerShip(); m.scale.setScalar(1.15); m.position.y = 3.1; g.add(m);
    const leg = std(0x3b4048); for (const [lx, lz] of [[-3, -4], [3, -4], [-3, 4], [3, 4]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2.6, 6), leg); l.position.set(lx, 1.3, lz); g.add(l); }
    const settledPad = this.planet.settled && atPad;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.3, 40), settledPad ? std(0x555a63) : std(0x2a2622, { roughness: 1 })); pad.position.y = 0.05; pad.receiveShadow = true; g.add(pad);
    if (settledPad) { const ring = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.12, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffb020 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const y = this.heightAt(x, z); g.position.set(x, y, z); g.rotation.y = yaw; this.root.add(g); this.shipG = g; this.shipPos = V(x, y, z); this.padPos = V(x, y, z);
    this.colliders = this.colliders.filter(c => c.id !== 'ship'); const cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
    this.colliders.push({ minx: x - 3.4 * cs - 6 * sn, maxx: x + 3.4 * cs + 6 * sn, minz: z - 6 * cs - 3.4 * sn, maxz: z + 6 * cs + 3.4 * sn, maxy: 7, id: 'ship' });
    this.interactables = this.interactables.filter(i => !i.ship);
    this.interactables.push({ pos: V(x + 6, y + 1, z), r: 3.2, label: 'Board ship', act: 'board', ship: true }, { pos: V(x + 6, y + 1, z + 6), r: 3, label: 'Ship lockers', act: 'lockers', ship: true });
    this.addBench(x + 8, z - 6, 'Field Bench', 'bench', false, true); this.addBench(x + 11, z - 3, 'Research Terminal', 'tech', true, true);
  }
  addBench(x, z, label, act, terminal, ship) {
    const y = this.heightAt(x, z); const g = new THREE.Group();
    if (!terminal) { const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1), std(0x7a5a3a)); top.position.y = 1; g.add(top); for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.8), std(0x3a3f46)); l.position.set(s * 1, 0.5, 0); g.add(l); } const vice = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.2), std(0xb02a2a)); vice.position.set(0.7, 1.15, 0); g.add(vice); const tools = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), std(0x888a90, { metalness: .7 })); tools.position.set(-0.5, 1.08, 0); g.add(tools); }
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.6), std(0x2a2f38, { metalness: .4 })); b.position.y = 0.55; g.add(b); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshBasicMaterial({ color: 0x4fd1ff })); sc.position.set(0, 1.25, 0.2); sc.rotation.x = -0.3; g.add(sc); }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(x, y, z); this.root.add(g); this.colliders.push({ minx: x - 1.1, maxx: x + 1.1, minz: z - 0.6, maxz: z + 0.6, maxy: 1.2 });
    const it = { pos: V(x, y + 1, z + 0.9), r: 2.2, label, act }; if (ship) it.ship = true; this.interactables.push(it);
  }

  building(b) { const rec = makeBuilding(this, b); this.buildings.push(rec); return rec; }
  buildTown(r) {
    const specs = [
      { id: 'exchange', name: 'Rim Exchange', x: -26, z: -28, w: 15, d: 11, door: 's', style: 'brick', color: 0xb5694c, awning: 0x2a5a7a, sign: '#3a2a10' },
      { id: 'gunsmith', name: 'Forge & Barrel', x: 0, z: -28, w: 16, d: 12, door: 's', style: 'metal', color: 0x8a9098, awning: 0x7a2a2a, sign: '#3a1010', fg: '#ff9a6a' },
      { id: 'cantina', name: 'The Dry Dock', x: 27, z: -28, w: 15, d: 12, door: 's', style: 'siding', color: 0x8a5a7a, roof: 0x3a2434, awning: 0x4a2a5a, sign: '#201030', fg: '#ff8ae0' },
      { id: 'lease', name: 'For Lease', x: -24, z: 32, w: 13, d: 10, door: 'n', style: 'siding', color: 0x8a9a7a, roof: 0x4a5a3a, awning: 0x3a5a3a, sign: '#10281c', fg: '#7aff9a' },
      { id: 'patrol', name: 'Rimway Patrol', x: 2, z: 33, w: 14, d: 10, door: 'n', style: 'concrete', color: 0x8a96a8, awning: 0x1d2c6a, sign: '#0c1a3c', fg: '#6aa8ff' },
      { id: 'outfitter', name: 'Outfitters', x: 28, z: 32, w: 14, d: 10, door: 'n', style: 'siding', color: 0xa07a50, roof: 0x5a3a22, awning: 0x7a5a2a, sign: '#2a1c08' },
    ];
    this.B = {}; specs.forEach(s => { this.B[s.id] = this.building(s); });
    for (const [x, z, d, c] of [[52, 0, 'w', 0x8a7a6a], [-56, -4, 'e', 0x6a7a8a], [54, 24, 'w', 0x8a6a6a]]) this.building({ id: 'house', kind: 'house', name: 'Quarters', x, z, w: 9, d: 9, door: d, style: 'siding', color: c, roof: r.pick([0x5a3a2a, 0x3a4a5a, 0x4a4a3a]), sign: '#222' });
    dressTown(this, r);
    for (let a = 0; a < 10; a++) { const x = Math.cos(a * 0.628) * 19, z = Math.sin(a * 0.628) * 19; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.4, 6), std(0x2a2e34, { metalness: .5 })); p.position.set(x, 2.2, z); p.castShadow = true; this.root.add(p); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), std(0x2a2e34)); arm.position.set(x + 0.4, 4.4, z); this.root.add(arm); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })); bulb.position.set(x + 0.8, 4.3, z); this.root.add(bulb); this.bulbs.push(bulb); if (a % 2 === 0) { const pl = new THREE.PointLight(0xffd9a0, 0, 22, 1.5); pl.position.set(x + 0.8, 4.1, z); this.root.add(pl); this.lamps.push(pl); } }
    const gs = this.B.gunsmith; this.addBench(gs.back.x - 3, gs.back.z, 'Gunsmith Workbench', 'bench'); this.addBench(gs.back.x + 3, gs.back.z, 'Research Terminal', 'tech', true);
    const ex = this.B.exchange; this.counter(ex, 'Exchange Desk');
    const of = this.B.outfitter; this.counter(of, 'Outfitter Counter'); this.interactables.push({ pos: V(of.back.x, 1, of.back.z + 1.4 * (of.dv[1] > 0 ? 1 : -1)), r: 3, label: 'Buy supplies & refuel', act: 'outfitter' });
    const pa = this.B.patrol; this.counter(pa, 'Patrol Desk'); this.interactables.push({ pos: V(pa.back.x, 1, pa.back.z), r: 3.4, label: 'Clear bounty / pay fines', act: 'patrol' });
    const ls = this.B.lease; this.lease = ls; this.interactables.push({ pos: V(ls.x, 1, ls.z), r: 4, label: 'Lease this shop (400 cr)', act: 'lease', data: ls });
    this.counter(this.B.cantina, 'Bar');
    const n = clamp(7 + Math.floor(this.planet.pop / 120), 7, 15); const seedBase = this.planet.seed;
    const roles = ['exchange', 'gunsmith', 'cantina', 'outfitter', 'patrol'];
    for (let i = 0; i < n; i++) {
      const prof = makePerson(seedBase * 7 + i * 31, this.planet, this.sys); if (i === 4) { prof.cop = true; prof.job = 'cop'; prof.jobLabel = 'Patrol Officer'; prof.outfit = JSON.parse(JSON.stringify(OUTFITS.police)); }
      const npc = this.spawnNPC(prof);
      if (i < 5) { npc.station = this.B[roles[i]]; npc.home = { x: npc.station.back.x + (i % 2 ? 1.2 : -1.2), z: npc.station.back.z }; } else npc.wander = true;
      const hp = npc.home || this.randPlaza(r); npc.pos.set(hp.x, this.heightAt(hp.x, hp.z), hp.z); npc.mesh.position.copy(npc.pos);
    }
  }
  counter(b, label) {
    const horiz = b.dv[1] !== 0; const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 4.2 : 0.9, 1.05, horiz ? 0.9 : 4.2), std(0x6a4a2e, { roughness: .7 })); m.position.set(b.back.x + b.dv[0] * 2.6, 0.55, b.back.z + b.dv[1] * 2.6); m.castShadow = true; m.receiveShadow = true; this.root.add(m);
    const top = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 4.4 : 1.1, 0.06, horiz ? 1.1 : 4.4), std(0x2a2018, { roughness: .4 })); top.position.set(m.position.x, 1.08, m.position.z); this.root.add(top);
    this.colliders.push({ minx: m.position.x - (horiz ? 2.1 : 0.45), maxx: m.position.x + (horiz ? 2.1 : 0.45), minz: m.position.z - (horiz ? 0.45 : 2.1), maxz: m.position.z + (horiz ? 0.45 : 2.1), maxy: 1.1 });
    b.counterMesh = m; return m;
  }
  randPlaza(r) { const a = r() * 6.283, d = r.range(5, 30); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }

  spawnNPC(prof, opts = {}) {
    const outfit = prof.outfit || (prof.outfit = outfitFor(prof.job, prof.seed));
    const mesh = buildHuman(prof.look, outfit); this.root.add(mesh);
    const npc = { prof, mesh, pos: V(), vel: V(), target: null, wait: Math.random() * 3, t: Math.random() * 10, state: 'idle', hostile: false, hp: 60, gait: Math.random() * 6, ...opts };
    const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: signCanvasTex('!'), transparent: true, depthTest: false })); mk.scale.set(0.5, 0.5, 1); mk.position.y = 2.2; mk.visible = false; mesh.add(mk); npc.marker = mk;
    this.npcs.push(npc); return npc;
  }
  addLoneWanderer() {
    const prof = makePerson(this.planet.seed * 3 + 5, this.planet, this.sys); const n = this.spawnNPC(prof); n.wander = true; n.lone = true;
    n.pos.set(this.padPos.x + 25, 0, this.padPos.z + 12); n.pos.y = this.heightAt(n.pos.x, n.pos.z); n.mesh.position.copy(n.pos);
  }
  stripNPC(n) { n.prof.outfit = JSON.parse(JSON.stringify(OUTFITS.underwear)); setOutfit(n.mesh, n.prof.outfit); n.stripped = true; }

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
  wallProbe(x, z, dx, dz, maxd = 1.0) {
    for (let s = 0.2; s <= maxd; s += 0.1) {
      const px = x + dx * s, pz = z + dz * s;
      for (const c of this.colliders) { if (c.roof || (c.maxy !== undefined && c.maxy < 1.6)) continue; if (px > c.minx && px < c.maxx && pz > c.minz && pz < c.maxz) return { dist: s, nx: -dx, nz: -dz }; }
    }
    return null;
  }
  dropGun(g, pos) {
    const m = gunMesh(g.id); m.scale.setScalar(1.6); const y = this.heightAt(pos.x, pos.z) + 0.25; m.position.set(pos.x, y, pos.z); m.rotation.y = Math.random() * 6; this.root.add(m);
    const it = { pos: V(pos.x, y, pos.z), r: 2, label: `Pick up ${ITEMS[g.id].name}`, act: 'pickup', data: { g, m } }; this.interactables.push(it); this.pickups.push(it);
  }

  timeOfDay() {
    const t = (G.time / 600 + 0.3) % 1; const el = Math.sin(t * Math.PI * 2); this.dayLevel = clamp(el * 1.6 + 0.3, 0, 1);
    const L = this.dayLevel; const air = this.air > 0.3;
    const ang = t * Math.PI * 2; this.sunDir = V(Math.cos(ang) * 0.8, Math.max(-0.2, el), Math.sin(ang) * 0.4).normalize();
    const u = this.sky.mat.uniforms; const horC = u.uHor.value.clone().multiplyScalar(0.1 + 0.9 * L);
    if (air && L < 0.5 && L > 0.05) horC.lerp(new THREE.Color(0xff8a50), (0.5 - Math.abs(L - 0.25) * 2) * 0.35);
    this.scene.fog.color.copy(air ? horC : new THREE.Color(0x04050a)); this.scene.background = null;
    this.hemi.intensity = 0.3 + 1.7 * L * (air ? 1 : 0.55); this.hemi.color.copy(air ? u.uSky.value.clone().lerp(new THREE.Color(0xffffff), 0.4) : new THREE.Color(0x778899));
    this.sun.intensity = 2.8 * Math.min(1, L * 1.3) + 0.05; this.sun.color.set(L < 0.45 ? 0xffb070 : 0xfff3df);
    const wl = (1 - L) * 1.1 + 0.05; for (const m of this.windowMats) m.emissiveIntensity = wl;
    for (const l of this.lamps) l.intensity = (1 - L) * 30;
    const blink = Math.floor(G.time * 1.5) % 2 === 0; for (const b of this.blinkers) b.visible = blink;
    for (const s of this.signs) s.material.emissiveIntensity = 0.25 + (1 - L) * 0.9;
  }

  update(dt, player) {
    this.timeOfDay();
    const p = player.pos;
    this.sun.position.copy(p).addScaledVector(this.sunDir, 120); this.sun.target.position.copy(p);
    const cam = this.camera; this.alt = Math.max(0, cam.position.y);
    this.sky.update(cam.position, this.sunDir, this.dayLevel, this.alt, G.time);
    this.terrain.update(cam.position.x, cam.position.z);
    if (this.alt < 400) this.scatter.update(cam.position.x, cam.position.z, this.avoidFn);
    this.scatter.setVisible(this.alt < 500);
    if (this.water) { this.water.position.x = cam.position.x; this.water.position.z = cam.position.z; }
    this.updateNodes(p.x, p.z);
    for (const n of this.npcs) this.updateNPC(n, dt, player);
    for (const nd of this.nodes) if (!nd.alive) { nd.t = (nd.t || 0) + dt; if (nd.t > 240) { nd.alive = true; nd.m.visible = true; nd.t = 0; nd.hp = 1; } }
  }

  updateNPC(n, dt, player) {
    n.t += dt; const p = n.pos; let sp = 0;
    if (n.dead || n.ko) { animateHuman(n.mesh, { ko: true, speed: 0 }); n.mesh.position.set(p.x, this.heightAt(p.x, p.z) + 0.12, p.z); return; }
    if (n.approach && !n.talking) {
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > 3) { p.x += dx / d * 2.4 * dt; p.z += dz / d * 2.4 * dt; sp = 2.4; this.face(n, dx, dz); } else this.face(n, dx, dz);
    } else if (n.fleeFrom) {
      const dx = p.x - n.fleeFrom.x, dz = p.z - n.fleeFrom.z, d = Math.hypot(dx, dz) || 1; p.x += dx / d * 5 * dt; p.z += dz / d * 5 * dt; sp = 5; this.face(n, dx, dz); n.fleeT = (n.fleeT || 0) - dt; if (n.fleeT < -6) n.fleeFrom = null;
    } else if (n.customer) {
      const c = n.customer; const tg = c.path[c.i]; if (tg) { const dx = tg.x - p.x, dz = tg.z - p.z, d = Math.hypot(dx, dz); if (d < 0.6) { c.i++; if (c.i >= c.path.length) { c.done && c.done(n); } } else { p.x += dx / d * 1.8 * dt; p.z += dz / d * 1.8 * dt; sp = 1.8; this.face(n, dx, dz); } }
    } else if (n.talking) { this.face(n, player.pos.x - p.x, player.pos.z - p.z); }
    else if (n.station && !n.wander) { if (n.home) { const dx = n.home.x - p.x, dz = n.home.z - p.z, d = Math.hypot(dx, dz); if (d > 0.4) { p.x += dx / d * 1.5 * dt; p.z += dz / d * 1.5 * dt; sp = 1.5; this.face(n, dx, dz); } else this.face(n, -n.station.dv[0], -n.station.dv[1]); } }
    else if (n.wander) {
      n.wait -= dt;
      if (!n.target && n.wait <= 0) { const a = Math.random() * 6.283, d = 6 + Math.random() * (n.lone ? 12 : 26); n.target = n.lone ? { x: this.padPos.x + 25 + Math.cos(a) * d, z: this.padPos.z + 12 + Math.sin(a) * d } : { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
      if (n.target) { const dx = n.target.x - p.x, dz = n.target.z - p.z, d = Math.hypot(dx, dz); if (d < 0.8) { n.target = null; n.wait = 2 + Math.random() * 6; } else { p.x += dx / d * 1.35 * dt; p.z += dz / d * 1.35 * dt; sp = 1.35; this.face(n, dx, dz); } }
    }
    this.collide(p, 0.35, 0); p.y = this.heightAt(p.x, p.z); n.mesh.position.copy(p);
    n.gait += sp * dt * 2.9;
    animateHuman(n.mesh, { phase: n.gait, speed: sp / 1.7, idleT: n.t, arms: 'relaxed' });
    n.moving = sp > 0.1;
  }
  face(n, dx, dz) { if (Math.abs(dx) + Math.abs(dz) < 0.001) return; const a = Math.atan2(-dx, -dz); let d = a - n.mesh.rotation.y; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; n.mesh.rotation.y += d * 0.15; }
}

function signCanvasTex(txt) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#ffd24a'; x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fill();
  x.fillStyle = '#222'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 32, 35); return new THREE.CanvasTexture(c);
}
