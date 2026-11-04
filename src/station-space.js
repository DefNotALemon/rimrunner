// Stations in flight: meshes hung in orbit around their planet, a soft collision shell, and the docking approach.
// Space.enter() clears space.root, so StationsInSpace.sync() rebuilds whenever the system (or its scene) changes. No edits to space.js needed.
import * as THREE from '../vendor/three.module.js';
import { stationsFor } from './stations.js';
import { clamp } from './util.js';
import { In } from './input.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const DOCK_R = 900, SHELL_R = 210;

function lit(c, e = 0) { return new THREE.MeshStandardMaterial({ color: c, metalness: 0.6, roughness: 0.45, emissive: e || 0x000000, emissiveIntensity: e ? 1 : 0 }); }
export function buildStationMesh(st) {
  const g = new THREE.Group(), civ = st.kind === 'civil';
  const hull = lit(civ ? 0xb8b2a6 : 0x4a4640), dark = lit(civ ? 0x4a5058 : 0x2a2622), glow = new THREE.MeshBasicMaterial({ color: civ ? 0xffc878 : 0x552a1a });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 120, 24), hull); g.add(hub);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(34, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark); cap.position.y = 60; g.add(cap);
  const cap2 = cap.clone(); cap2.rotation.x = Math.PI; cap2.position.y = -60; g.add(cap2);
  const ring = new THREE.Group(); g.add(ring); g.userData.ring = ring;
  const segs = civ ? 24 : 24;
  for (let i = 0; i < segs; i++) {
    if (!civ && (i === 5 || i === 6 || i === 15)) continue;   // derelict: torn ring
    const a = i / segs * Math.PI * 2, m = new THREE.Mesh(new THREE.BoxGeometry(40, 26, 30), i % 3 ? hull : dark); m.position.set(Math.cos(a) * 160, 0, Math.sin(a) * 160); m.rotation.y = -a; ring.add(m);
    if (civ && i % 2 === 0) { const w = new THREE.Mesh(new THREE.BoxGeometry(30, 3, 31), glow); w.position.copy(m.position); w.rotation.y = -a; ring.add(w); }
  }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4, sp = new THREE.Mesh(new THREE.BoxGeometry(130, 8, 8), dark); sp.position.set(Math.cos(a) * 95, 0, Math.sin(a) * 95); sp.rotation.y = -a; ring.add(sp); }
  // docking arm with a lit approach light toward +x
  const arm = new THREE.Mesh(new THREE.BoxGeometry(70, 12, 12), dark); arm.position.set(0, 40, 0); arm.rotation.z = 0; arm.position.x = 60; g.add(arm);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(10, 2.4, 8, 20), new THREE.MeshBasicMaterial({ color: civ ? 0x66ffaa : 0x663322 })); mouth.position.set(98, 40, 0); mouth.rotation.y = Math.PI / 2; g.add(mouth); g.userData.mouth = mouth;
  // solar wings
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(18, 2, 120), new THREE.MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.3, roughness: 0.3, emissive: 0x050a18 })); p.position.set(0, s * 70, 0); p.rotation.x = Math.PI / 2; p.position.z = 0; p.scale.set(1, 1, 1); g.add(p); }
  const blink = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a2a })); blink.position.y = 96; g.add(blink); g.userData.blink = blink;
  if (civ) { const l = new THREE.PointLight(0xffd8a0, 4, 1400, 1); l.position.set(0, 0, 0); g.add(l); }
  return g;
}
function label(text, civ) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d'); x.font = 'bold 50px sans-serif'; x.fillStyle = civ ? '#ffd28a' : '#c08a70'; x.textAlign = 'center'; x.fillText('⬡ ' + text, 256, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sp.scale.set(5, 1, 1); return sp;
}

export class StationsInSpace {
  constructor() { this.objs = []; this.sys = null; this.root = null; this.near = null; this.nearD = Infinity; }
  sync(space) {
    if (this.sys === space.sys && this.root === space.root && this.objs.every(o => o.g.parent === space.root)) return;
    this.sys = space.sys; this.root = space.root; this.objs = [];
    for (const st of stationsFor(space.sys)) {
      const host = space.planetObjs[st.planet]; if (!host) continue;
      const atmoH = clamp(host.collR * 0.35 + 600, 1500, 5000), dist = host.collR + atmoH * 2.1 + 900;
      const out = host.pos.clone().normalize(); if (!isFinite(out.x) || out.lengthSq() < 0.1) out.set(1, 0, 0);
      const dir = out.clone().applyAxisAngle(V(0, 1, 0), st.ang); dir.y += st.elev; dir.normalize();
      const pos = host.pos.clone().addScaledVector(dir, dist);
      const g = buildStationMesh(st); g.position.copy(pos); g.lookAt(host.pos); g.rotateY(Math.PI / 2); space.root.add(g);
      const lb = label(st.name, st.kind === 'civil'); lb.position.copy(pos).add(V(0, 260, 0)); lb.scale.multiplyScalar(260); space.root.add(lb);
      this.objs.push({ st, g, pos, out: dir.clone(), host });
    }
  }
  byId(id) { return this.objs.find(o => o.st.id === id) || null; }
  /** call after space.update; returns the station to dock with this frame, or null */
  update(space, dt, active) {
    this.sync(space); const s = space.ship; let near = null, nd = Infinity;
    for (const o of this.objs) {
      const ring = o.g.userData.ring; if (ring) ring.rotation.y += o.st.spin * dt * (o.st.kind === 'civil' ? 1 : 0.3);
      const b = o.g.userData.blink; if (b) b.visible = Math.floor(performance.now() / 600) % 2 === 0;
      const d = s.pos.distanceTo(o.pos); if (d < nd) { nd = d; near = o; }
      if (d < SHELL_R) { const n = s.pos.clone().sub(o.pos).normalize(); s.pos.copy(o.pos).addScaledVector(n, SHELL_R); s.speed *= 0.2; }
    }
    this.near = near; this.nearD = nd;
    if (!near || nd > DOCK_R || space.disabled || space.law.state !== 'none' && space.law.state !== 'dispatched') return null;
    const slow = Math.abs(s.speed) < 140;
    if (active && In.pressed.interact) return near;
    if (slow && nd < SHELL_R + 70 && !this._auto) { this._auto = true; return near; }   // drifting into the dock arm auto-docks
    if (nd > SHELL_R + 200) this._auto = false;
    return null;
  }
  /** after undocking: park the ship just off the dock arm, facing away */
  placeShip(space, id) {
    this.sync(space); const o = this.byId(id); if (!o) return; const s = space.ship;
    const away = o.pos.clone().sub(o.host.pos).normalize();
    s.pos.copy(o.pos).addScaledVector(away, SHELL_R + 260);
    s.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), away.clone(), V(0, 1, 0)));
    s.speed = 0; s.throttle = 0.05; this._auto = true; space.entering = false;
    space.camera.position.copy(s.pos).add(V(0, 8, 30).applyQuaternion(s.quat));
  }
}
