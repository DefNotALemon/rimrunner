// Station interiors for the open world: a docked orbital port (peaceful, lit, crewed) or a derelict (Extraction's hostile classes).
// Reuses the Extraction layout generator (ships.js) + builder (shipbuild.js) through ExtractShip, minus the run timer, director and hunger lock.
import * as THREE from '../vendor/three.module.js';
import { ExtractShip } from './extract.js';
import { generateShip, isVault } from './ships.js';
import { buildShip } from './shipbuild.js';
import { Nav } from './nav.js';
import { populateCrew, cullCrew } from './crew.js';
import { buildHuman, makeLook, outfitFor, animateHuman, setTrait } from './people.js';
import { signTex } from './interior-kit.js';
import { rng, hashStr } from './util.js';
import { G } from './state.js';
import { FIRST, LAST } from './data.js';
import { systemAt } from './gen.js';
import { stationContract } from './stations.js';
import { sLoc, peopleAt, itemsAt } from './missions.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MAT = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.35, roughness: 0.55, ...o });
const JOB_OF = { Bartender: 'trader', Quartermaster: 'mechanic', 'Dock hand': 'mechanic', Patron: 'drifter', Surveyor: 'scholar', 'Freight broker': 'trader', 'Insurance adjuster': 'scholar', 'Worried sibling': 'farmer', Passenger: 'drifter', Fixer: 'trader', 'Port clerk': 'trader' };

export class StationInterior extends ExtractShip {
  /** st: a station from stations.js */
  enterStation(st, worldSeed = G.seed) {
    const contract = stationContract(st); this.st = st; this.loc = sLoc(st); this.civil = st.kind === 'civil';
    this.hooks = { log() {}, doom() {} }; this.contract = contract; const ship = this.ship = generateShip(contract); this.r = rng(contract.seed ^ 0x5eed);
    this.planet = { name: st.name, kind: this.civil ? 'station' : 'derelict', settled: this.civil, temp: 0.5, air: 1, g: 1, seed: contract.seed, i: 0 }; this.kind = 'barren';
    this.sys = { name: systemAt(worldSeed, st.sys).name, index: st.sys };
    this.K = { res: [], sky: 0 }; this.air = 1; this.gravity = 1; this.root.clear(); this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = []; this.buildings = [];
    this.scene.remove(this.sky.mesh); this.sun.intensity = 0;
    if (this.civil) { this.scene.background = new THREE.Color(0x06080c); this.scene.fog = new THREE.Fog(0x06080c, 24, 160); this.hemi.intensity = 1.15; this.hemi.color.set(0xfff0e0); this.hemi.groundColor.set(0x40382f); }
    else { this.scene.background = new THREE.Color(0x020306); this.scene.fog = new THREE.Fog(0x020306, 14, 120); this.hemi.intensity = 0.55; this.hemi.color.set(0x9fb0c8); this.hemi.groundColor.set(0x2a2d33); }
    this.padPos = V(1e4, 0, 1e4); this.flatR = 9999;
    if (!this.pool) { this.pool = []; for (let i = 0; i < 9; i++) { const l = new THREE.PointLight(0xffffff, 0, 22, 1.4); this.scene.add(l); this.pool.push(l); } }
    buildShip(ship, this);
    Object.assign(this, { enemies: [], proj: [], fx: [], antennas: [], stunT: 0, t: 0, over: false, alarm: false, stormT: -1, medic: null, hauled: 0, opened: 0, kills: 0, lampT: 0, events: [], crew: [], survivors: [], crewList: [] });
    this.nav = new Nav(-9, ship.zlo - 9, ship.W + 9, ship.zhi + 9); this.rebuildNav();
    this.mine = ship.ports[0]; this.spawn = { x: -3.4, z: this.mine.z, yaw: -Math.PI / 2 };
    this.used = new Set(); this.bar = null; this.barPos = null; this.boardPos = null;
    if (!this.civil) { this.populate(); populateCrew(this); }
    // the hatch back to your ship
    this.interactables.push({ pos: V(-6.1, 1, this.mine.z), r: 2.0, label: 'Hatch — undock', act: 'st:undock' });
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.3, 2.0), MAT(0x4a5360, { emissive: 0x103020 })); hatch.position.set(-6.9, 1.15, this.mine.z); this.root.add(hatch);
    if (this.civil) this.furnish();
    this.placeMissionStuff();
    return this;
  }
  // ---------- rooms + spots ----------
  roomsBy(pred) { return this.ship.rooms.filter(pred).sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0)); }
  backRoom() { const c = this.ship.rooms.filter(m => m.type === 'crew'); return c.sort((a, b) => b.x0 - a.x0)[0] || this.ship.rooms[this.ship.rooms.length - 1]; }
  spotIn(m, fromEnd) {
    if (!m || !m.spots) return null; const list = fromEnd ? m.spots.slice().reverse() : m.spots;
    for (const s of list) { const k = Math.round(s.x * 10) + ',' + Math.round(s.z * 10); if (this.used.has(k)) continue; if (this.colliders.some(c => s.x > c.minx - 0.35 && s.x < c.maxx + 0.35 && s.z > c.minz - 0.35 && s.z < c.maxz + 0.35)) continue; this.used.add(k); return s; }
    return null;
  }
  anySpot(pref) { for (const m of [...pref, ...this.roomsBy(m => !isVault(m.type))]) { const s = this.spotIn(m); if (s) return { s, m }; } return null; }
  free(x0, x1, z0, z1) { return !this.colliders.some(c => x1 > c.minx && x0 < c.maxx && z1 > c.minz && z0 < c.maxz); }
  // ---------- civil port: bar, board, crew ----------
  furnish() {
    const r = rng(this.contract.seed ^ 0xba12), ship = this.ship;
    const bar = this.roomsBy(m => m.type === 'canteen')[0] || this.roomsBy(m => !isVault(m.type) && m !== this.backRoom())[0]; this.bar = bar;
    // counter 1.6 m out from a wall, clear of that wall's doors, bartender behind it (tries all four walls, x-runs first)
    if (bar) {
      let placed = null;
      const walls = [['x', bar.z0, 1], ['x', bar.z1, -1], ['z', bar.x0, 1], ['z', bar.x1, -1]];
      for (const [ax, w, dir] of walls) {
        if (placed) break; const lo = ax === 'x' ? bar.x0 : bar.z0, hi = ax === 'x' ? bar.x1 : bar.z1; if (hi - lo < 7.5) continue;
        for (const off of [0, -1, 1, -2, 2, -3, 3]) {
          const c = (lo + hi) / 2 + off; if (c - 2.2 < lo + 1.6 || c + 2.2 > hi - 1.6) continue;
          if (bar.doors.some(d => d.axis === ax && Math.abs(d.at - w) < 0.01 && Math.abs(d.u - c) < 2.2 + d.w / 2 + 1.2)) continue;
          const n0 = Math.min(w + dir * 0.25, w + dir * 2.1), n1 = Math.max(w + dir * 0.25, w + dir * 2.1);
          const ok = ax === 'x' ? this.free(c - 2.4, c + 2.4, n0, n1) : this.free(n0, n1, c - 2.4, c + 2.4);
          if (ok) { placed = { ax, c, w, dir }; break; }
        }
      }
      if (placed) {
        const { ax, c, w, dir } = placed, cn = w + dir * 1.6; const P = (u, n, y) => ax === 'x' ? [u, y, n] : [n, y, u];
        const g = new THREE.Group(); this.root.add(g); const rotY = ax === 'x' ? 0 : Math.PI / 2;
        const add = (geo, mat, u, n, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(...P(u, n, y)); m.rotation.y = rotY; g.add(m); return m; };
        add(new THREE.BoxGeometry(4.4, 1.02, 0.62), MAT(0x5a3a26, { roughness: 0.7 }), c, cn, 0.51);
        add(new THREE.BoxGeometry(4.6, 0.06, 0.82), MAT(0x2a2018, { roughness: 0.35 }), c, cn, 1.05);
        add(new THREE.BoxGeometry(4.3, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb050 }), c, cn + dir * 0.32, 0.9);
        add(new THREE.BoxGeometry(3.6, 0.05, 0.3), MAT(0x3a2a20), c, w + dir * 0.32, 1.55);
        for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 8), MAT([0x3a7a40, 0x8a4a20, 0xc0c0a0, 0x305a8a][i % 4], { metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.85 }), c - 1.6 + i * 0.4, w + dir * 0.32, 1.72);
        if (ax === 'x') this.colliders.push({ minx: c - 2.3, maxx: c + 2.3, minz: cn - 0.41, maxz: cn + 0.41, maxy: 1.1 }); else this.colliders.push({ minx: cn - 0.41, maxx: cn + 0.41, minz: c - 2.3, maxz: c + 2.3, maxy: 1.1 });
        const [bx, , bz] = P(c + 0.6, w + dir * 0.85, 0); const face = ax === 'x' ? (dir > 0 ? Math.PI : 0) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        const bt = this.addPerson({ name: `${r.pick(FIRST)} ${r.pick(LAST)}`, role: 'Bartender', seed: this.contract.seed + 11 }, bx, bz, face, 'counter');
        const [fx, , fz] = P(c + 0.6, cn + dir * 1.1, 0); bt.it.pos.set(fx, 1, fz); bt.it.r = 2.2;   // talk across the counter
        const [px, , pz] = P(c, cn + dir * 1.2, 0); this.barPos = { x: px, z: pz };
      } else { const sp = this.spotIn(bar); if (sp) this.addPerson({ name: `${r.pick(FIRST)} ${r.pick(LAST)}`, role: 'Bartender', seed: this.contract.seed + 11 }, sp.x, sp.z, r.range(0, 6.28)); }
    }
    // mission board kiosk in the dock gallery, beside the hatch path
    const gz = this.mine.z; let k = null;
    for (const dz of [3.4, -3.4, 4.6, -4.6]) { const x = 2.6, z = gz + dz; if (Math.abs(z) < ship.gh - 1 && this.free(x - 0.7, x + 0.7, z - 0.5, z + 0.5)) { k = { x, z, face: dz > 0 ? 1 : -1 }; break; } }
    if (k) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.25, 0.3), MAT(0x2b3038)); post.position.set(k.x, 0.625, k.z); this.root.add(post);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshBasicMaterial({ map: signTex('MISSION BOARD', 384, 220, '#0d1a20', '#ffc878') }));
      scr.position.set(k.x, 1.65, k.z - k.face * 0.05); scr.rotation.y = k.face > 0 ? Math.PI : 0; scr.rotation.x = 0; this.root.add(scr);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.82, 0.08), MAT(0x1a1d22)); frame.position.set(k.x, 1.65, k.z + k.face * 0.0); this.root.add(frame);
      scr.position.z = k.z - k.face * 0.045;
      this.colliders.push({ minx: k.x - 0.5, maxx: k.x + 0.5, minz: k.z - 0.2, maxz: k.z + 0.2, maxy: 2.1 });
      this.interactables.push({ pos: V(k.x, 1, k.z - k.face * 0.9), r: 2.0, label: 'Mission board', act: 'st:board' }); this.boardPos = { x: k.x, z: k.z };
    }
    // a dock hand at the gallery, a couple of patrons, a clerk
    const g = { spots: [{ x: 3.6, z: gz - 5.5 }, { x: 1.2, z: gz + 5.6 }] };
    const dh = this.spotIn(g); if (dh) this.addPerson({ name: `${r.pick(FIRST)} ${r.pick(LAST)}`, role: 'Dock hand', seed: this.contract.seed + 12 }, dh.x, dh.z, r.range(0, 6.28));
    for (let i = 0; i < 2; i++) { const p = this.anySpot(bar ? [bar] : []); if (p) this.addPerson({ name: `${r.pick(FIRST)} ${r.pick(LAST)}`, role: 'Patron', seed: this.contract.seed + 20 + i }, p.s.x, p.s.z, r.range(0, 6.28)); }
    const off = this.roomsBy(m => m.type === 'office')[0]; const cs = off && this.spotIn(off); if (cs) this.addPerson({ name: `${r.pick(FIRST)} ${r.pick(LAST)}`, role: 'Port clerk', seed: this.contract.seed + 30 }, cs.x, cs.z, r.range(0, 6.28), 'console');
  }
  addPerson(p, x, z, yaw, work) {
    const seed = p.seed >>> 0, look = makeLook(seed), outfit = outfitFor(JOB_OF[p.role] || 'drifter', seed);
    const mesh = buildHuman(look, outfit); setTrait(mesh, ['dry', 'warm', 'nervous', 'proud', 'sly', 'tired'][seed % 6]); mesh.position.set(x, 0, z); mesh.rotation.y = yaw; this.root.add(mesh);
    const n = { name: p.name, role: p.role, mission: p.m, giver: !!p.giver, mesh, pos: V(x, 0, z), yaw0: yaw, work, t0: (seed % 100) / 10, talkT: 0, look };
    this.colliders.push({ minx: x - 0.3, maxx: x + 0.3, minz: z - 0.3, maxz: z + 0.3, maxy: 1.8, npc: true });
    n.it = { pos: V(x, 1, z), r: 2.4, label: `Talk to ${p.name}`, act: 'st:talk', data: n }; this.interactables.push(n.it);
    if (p.m && !p.giver || p.marker) { const mk = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffc878, transparent: true, depthTest: false })); mk.scale.set(0.16, 0.16, 1); mk.position.y = 2.15; mesh.add(mk); }
    this.crew.push(n); return n;
  }
  // ---------- mission people + items ----------
  placeMissionStuff() {
    const loc = this.loc;
    for (const p of peopleAt(loc)) {
      if (this.crew.some(c => c.name === p.who)) { const c = this.crew.find(c => c.name === p.who); c.mission = p.m; continue; }
      const pref = p.role === 'Bartender' && this.bar ? [this.bar] : this.bar ? [this.bar] : [];
      if (p.role === 'Bartender') { const bt = this.crew.find(c => c.role === 'Bartender'); if (bt) { bt.name = p.who; bt.it.label = `Talk to ${p.who}`; bt.mission = p.m; continue; } }
      const s = this.anySpot(pref); if (!s) continue; this.addPerson({ name: p.who, role: p.role, seed: p.seed, m: p.m, giver: p.giver }, s.s.x, s.s.z, Math.random() * 6.28);
    }
    for (const it of itemsAt(loc)) {
      const room = this.civil ? this.backRoom() : (this.roomsBy(m => m.type === 'control')[0] || this.roomsBy(m => isVault(m.type))[0] || this.ship.rooms[0]);
      const s = this.spotIn(room, true) || (this.anySpot([]) || {}).s; if (!s) continue;
      const g = new THREE.Group(); g.position.set(s.x, 0, s.z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.42), MAT(it.o.item.includes('recorder') ? 0xd06a1a : 0x39424c, { metalness: 0.6 })); box.position.y = 0.18; g.add(box);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.02), new THREE.MeshBasicMaterial({ color: 0x55ff88 })); led.position.set(0, 0.3, 0.215); g.add(led);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.25, depthWrite: false })); beam.position.y = 1.3; g.add(beam);
      this.root.add(g);
      const iti = { pos: V(s.x, 0.6, s.z), r: 1.9, label: `Take the ${it.o.item}`, act: 'st:take', data: { mid: it.m.id, oi: it.oi, g } }; this.interactables.push(iti);
    }
  }
  removeTake(data) { this.root.remove(data.g); this.interactables = this.interactables.filter(i => i.data !== data); }
  /** world position of a person / item for the HUD marker */
  targetPos(o, m) {
    if (o.who) { const c = this.crew.find(c => c.name === o.who); if (c) return V(c.pos.x, 2.1, c.pos.z); }
    if (o.kind === 'take') { const oi = m.objectives.indexOf(o); const it = this.interactables.find(i => i.act === 'st:take' && i.data.mid === m.id && i.data.oi === oi); if (it) return V(it.pos.x, 1.2, it.pos.z); }
    return null;
  }
  // ---------- per-frame (no run timer, no director, no hunger lock) ----------
  update(dt, player) {
    this.t += dt; this.stunT = Math.max(0, this.stunT - dt);
    this.lampT -= dt; if (this.lampT <= 0) { this.lampT = 0.12; this.placeLights(player.pos); }
    if (!this.civil) {
      for (const e of this.enemies) if (!e.dead) this.updateEnemy(e, dt, player);
      this._cullT = (this._cullT || 0) - dt; if (this._cullT <= 0) { this._cullT = 0.5; cullCrew(this, player.pos); }
      for (const e of this.enemies) if (e.dead && e.mesh && !e.settled) this.deadAnim(e, dt);
      for (const p of this.proj) { p.life -= dt; p.m.position.addScaledVector(p.vel, dt); const px = p.m.position.x, pz = p.m.position.z; let hitW = false; for (const c of this.colliders) { if (px > c.minx && px < c.maxx && pz > c.minz && pz < c.maxz && p.m.position.y < (c.maxy ?? 9)) { hitW = true; break; } }
        const dp = Math.hypot(px - player.pos.x, p.m.position.y - (player.pos.y + 1), pz - player.pos.z); if (hitW || dp < 0.7 || p.life <= 0) { this.boom(p.m.position.clone(), p.splash, p.dmg, player); this.root.remove(p.m); p.dead = true; } }
      this.proj = this.proj.filter(p => !p.dead);
      for (const f of this.fx) { f.t -= dt; if (f.mat) f.mat.opacity = Math.max(0, f.t / (f.t0 || 0.09)); if (f.grow) f.o.scale.setScalar(f.grow * (1 - f.t / f.t0) + 0.1); if (f.t <= 0) { this.root.remove(f.o); f.gone = true; } }
      this.fx = this.fx.filter(f => !f.gone);
      if (player.muzzle > (this._mz || 0) + 0.3 && player.muzzle > 0.9) this.alertAround(player.pos.x, player.pos.z, 30); this._mz = player.muzzle;
    }
    for (const n of this.crew) {
      const d = Math.hypot(player.pos.x - n.pos.x, player.pos.z - n.pos.z); n.talkT = Math.max(0, n.talkT - dt);
      if (d < 4.5 && !n.work) { const a = Math.atan2(-(player.pos.x - n.pos.x), -(player.pos.z - n.pos.z)); let df = a - n.mesh.rotation.y; while (df > Math.PI) df -= 6.283; while (df < -Math.PI) df += 6.283; n.mesh.rotation.y += df * Math.min(1, dt * 3); }
      if (d < 26) animateHuman(n.mesh, { dt, v: 0, idleT: this.t + n.t0, work: n.work, talk: n.talkT > 0 ? 1 : 0, gaze: d < 6 ? { x: player.pos.x, y: player.pos.y + 1.6, z: player.pos.z } : null, arms: 'relaxed' });
    }
  }
}
