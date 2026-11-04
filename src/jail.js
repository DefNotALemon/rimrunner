// Holding facility: serve your time, or pick the lock, grab your gear and slip past the guards
import * as THREE from '../vendor/three.module.js';
import { Surface } from './surface.js';
import { makeLook, OUTFITS, animateHuman } from './people.js';
import { G } from './state.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.05, ...o });

export class Jail extends Surface {
  heightAt() { return 0; }
  timeOfDay() { this.scene.background = new THREE.Color(0x050608); this.scene.fog.color.set(0x050608); this.scene.fog.near = 5; this.scene.fog.far = 70; }
  enter(info, sys, planet) {
    this.info = info; this.sys = sys; this.planet = { ...planet, settled: false, kind: 'barren', temp: 0.5, air: 1, g: 1, i: planet.i }; this.kind = 'barren';
    this.K = { res: [], sky: 0 }; this.air = 1; this.gravity = 1; this.root.clear(); this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = []; this.buildings = []; this.ceilH = 3.4;   // the cell block's ceiling: the third-person camera slides under it
    this.scene.remove(this.sky.mesh); this.scene.fog = new THREE.Fog(0x050608, 5, 70); this.sun.intensity = 0; this.hemi.intensity = 0.55; this.hemi.color.set(0x8a95a8); this.hemi.groundColor.set(0x303338);
    this.padPos = V(1000, 0, 1000); this.flatR = 9999; this.lamps = [];
    const concrete = std(0x6e7279), dark = std(0x2b2e33), floorM = std(0x45484d);
    const box = (x0, x1, z0, z1, h, mat, y0 = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), mat); m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2); m.castShadow = false; m.receiveShadow = true; this.root.add(m); return m; };
    const wall = (x0, x1, z0, z1) => { box(x0, x1, z0, z1, 3.4, concrete); this.colliders.push({ minx: x0, maxx: x1, minz: z0, maxz: z1, maxy: 3.4 }); };
    box(-14, 34, -16, 8, 0.2, floorM, -0.2);
    box(-14, 34, -16, 8, 0.2, dark, 3.4);   // ceiling
    // outer shell
    wall(-14, -13.6, -4, 4); wall(-14, 34, -4.4, -4); wall(-14, 34, 4, 4.4); wall(33.6, 34, -4, 4);
    // cell: x -13.6..-4, bars on the east side at x=-4 with a gap (the door) near z=0
    wall(-9, -8.6, -4, -1.2);   // short cell divider near neighbours (decor)
    const barMat = std(0x3d4148, { metalness: 0.8, roughness: 0.4 });
    this.bars = [];
    for (let z = -4; z <= 4; z += 0.45) { if (Math.abs(z) < 0.8) continue; const b = box(-4.05, -3.95, z - 0.04, z + 0.04, 3.4, barMat); void b; }
    this.colliders.push({ minx: -4.1, maxx: -3.9, minz: -4, maxz: -0.8, maxy: 3.4 }, { minx: -4.1, maxx: -3.9, minz: 0.8, maxz: 4, maxy: 3.4 });
    this.doorCol = { minx: -4.1, maxx: -3.9, minz: -0.8, maxz: 0.8, maxy: 3.4 }; this.colliders.push(this.doorCol);
    this.doorMesh = box(-4.05, -3.95, -0.8, 0.8, 3.4, std(0x7a2a2a, { metalness: 0.7 }));
    // cot and toilet in the cell
    box(-13.2, -11, -3.4, -2.2, 0.5, std(0x54504a)); this.colliders.push({ minx: -13.2, maxx: -11, minz: -3.4, maxz: -2.2, maxy: 0.5 });
    box(-13.2, -12.4, 2.8, 3.6, 0.5, std(0xb8bcc0)); this.colliders.push({ minx: -13.2, maxx: -12.4, minz: 2.8, maxz: 3.6, maxy: 0.5 });
    this.interactables.push({ pos: V(-12, 0.6, -2.8), r: 2.2, label: `Lie down and serve the sentence`, act: 'cot' });
    this.interactables.push({ pos: V(-5, 1, 0), r: 1.9, label: 'Pick the lock', act: 'celldoor' });
    // lights
    for (let x = -9; x < 33; x += 7) { const l = new THREE.PointLight(0xdfe8ff, 9, 13, 1.7); l.position.set(x, 3.0, 0); this.root.add(l); this.lamps.push(l); const f = box(x - 0.5, x + 0.5, -0.2, 0.2, 0.08, new THREE.MeshBasicMaterial({ color: 0xeaf2ff }), 3.28); void f; }
    // guard room (x 14..33) with desk and evidence locker
    wall(13.6, 14, -4, -1.6); wall(13.6, 14, 1.6, 4);
    box(24, 28, -1, 0.2, 1.0, std(0x5a4a38)); this.colliders.push({ minx: 24, maxx: 28, minz: -1, maxz: 0.2, maxy: 1.0 });
    const lk = box(30.4, 33.4, -3.6, -2.6, 2.0, std(0x3b5a7a, { metalness: 0.5 })); void lk; this.colliders.push({ minx: 30.4, maxx: 33.4, minz: -3.6, maxz: -2.6, maxy: 2 });
    this.interactables.push({ pos: V(31.5, 1, -1.8), r: 2.4, label: 'Evidence locker — your gear', act: 'evidence' });
    // exit
    const ex = box(33.5, 34.1, -1.1, 1.1, 2.6, std(0xb0a050, { emissive: 0x4a4210 })); void ex; this.interactables.push({ pos: V(32.8, 1, 0), r: 2.4, label: 'Exit to the street', act: 'jailexit' });
    // other inmates (decor): silhouettes in neighbouring cells
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.7), new THREE.MeshBasicMaterial({ map: textTex(`RIMWAY HOLDING — ${info.reason.toUpperCase()}`) })); sign.position.set(0, 2.7, -4.3); this.root.add(sign);
    // guards
    this.guards = [];
    const g1 = this.addGuard(10, 0, [[2, 0], [24, 0]]); const g2 = this.addGuard(27, 1.6, [[27, 1.6], [27, 2.6]]); g2.still = true; this.guards.push(g1, g2);
    this.timeLeft = info.sentence; this.caught = 0; this.cellOpen = false;
  }
  addGuard(x, z, path) {
    const look = makeLook(Math.floor(Math.random() * 1e6)); look.female = false; const prof = { look, cop: true, id: 'g' + Math.random(), name: 'Guard', smarts: 0.2, interest: {}, mood: 0.5, job: 'guard', jobLabel: 'Guard', outfit: JSON.parse(JSON.stringify(OUTFITS.guard)) };
    const n = this.spawnNPC(prof); n.guard = true; n.path = path; n.pi = 0; n.pos.set(x, 0, z); n.mesh.position.copy(n.pos); n.wander = false; n.alert = 0; return n;
  }
  openCell() { this.cellOpen = true; this.colliders = this.colliders.filter(c => c !== this.doorCol); this.doorMesh.visible = false; this.interactables = this.interactables.filter(i => i.act !== 'celldoor'); }
  update(dt, player, ui, hooks) {
    this.timeLeft -= dt; if (this.timeLeft <= 0 && !this.released) { this.released = true; hooks.release(); return; }
    for (const l of this.lamps) l.intensity = 8 + Math.sin(G.time * 17 + l.position.x) * (Math.random() < 0.02 ? 6 : 0.3);
    for (const g of this.guards) {
      if (g.ko) { animateHuman(g.mesh, { ko: true }); g.mesh.position.y = 0.12; g.alert = 0; continue; }
      const p = g.pos; let sp = 0;
      if (g.alert > 0.99) {   // chase
        const dx = player.pos.x - p.x, dz = player.pos.z - p.z, d = Math.hypot(dx, dz); if (d > 1.2) { p.x += dx / d * 4.6 * dt; p.z += dz / d * 4.6 * dt; sp = 4.6; this.face(g, dx, dz); } else if (!this.busted) { this.busted = true; hooks.busted(); }
      } else if (!g.still) {
        const t = g.path[g.pi]; const dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz); if (d < 0.5) g.pi = (g.pi + 1) % g.path.length; else { p.x += dx / d * 1.3 * dt; p.z += dz / d * 1.3 * dt; sp = 1.3; this.face(g, dx, dz); }
      } else { this.face(g, player.pos.x - p.x, player.pos.z - p.z); }
      // vision
      const to = V(player.pos.x - p.x, 0, player.pos.z - p.z), dist = to.length();
      const fwd = V(-Math.sin(g.mesh.rotation.y), 0, -Math.cos(g.mesh.rotation.y));
      const ang = dist > 0.1 ? fwd.dot(to.clone().normalize()) : 1;
      const inCell = player.pos.x < -4.2;
      const disguised = G.outfit && G.outfit.tags && G.outfit.tags.includes('police'); const range = (player.crouch ? 4.5 : 9) * (player.sprinting ? 1.5 : 1) * (disguised ? 0.22 : 1);
      if (!inCell && dist < range && ang > 0.35) { g.alert = Math.min(1, g.alert + dt * (1.6 + (range - dist) * 0.15)); } else g.alert = Math.max(0, g.alert - dt * 0.35);
      if (g.alert > 0.99 && !g.shouted) { g.shouted = true; ui.bubble(g, '"HEY! Prisoner out of her cell!"'); }
      if (g.alert < 0.3) g.shouted = false;
      this.collide(p, 0.35, 0); g.mesh.position.set(p.x, 0, p.z);
      if (g.ko) { animateHuman(g.mesh, { ko: true }); continue; }
      g.gait = (g.gait || 0) + sp * dt * 2.9; animateHuman(g.mesh, { phase: g.gait, speed: sp / 1.7, idleT: g.t || 0, arms: 'relaxed' }); g.t = (g.t || 0) + dt;
    }
    this.maxAlert = Math.max(0, ...this.guards.map(g => g.alert));
  }
}
function textTex(t) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#1b2230'; x.fillRect(0, 0, 512, 120); x.fillStyle = '#9fb4d8'; x.font = 'bold 30px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t.slice(0, 34), 256, 60);
  return new THREE.CanvasTexture(c);
}
