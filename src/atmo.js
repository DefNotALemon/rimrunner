// Atmospheric flight over the endless terrain: descend from orbit, land anywhere (pads help takeoff), lift off and climb back to space
import * as THREE from '../vendor/three.module.js';
import { clamp, damp, fmt } from './util.js';
import { In } from './input.js';
import { G, toast, xp } from './state.js';
import { buildPlayerShip } from './models.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const CRUISE = 260, BOOST = 720, EXIT_ALT = 3600;
const ASSIST = { small: 22, medium: 30, large: 40, cargo: 36 };

export class Atmo {
  constructor(camera, surf, hooks) {
    this.camera = camera; this.surf = surf; this.hooks = hooks; this.model = buildPlayerShip(); this.model.scale.setScalar(1.15);
    this.ship = { pos: V(), quat: new THREE.Quaternion(), speed: 0, vy: 0, throttle: 0.3, roll: 0, boost: false };
    this.hud = {}; this.law = { state: 'none' }; this.sys = null; this.state = 'flying'; this.assist = null; this.outDir = V(0.8, 0.45, 0.4).normalize(); this.landT = 0; this.cockpit = false;
  }
  attach() { if (this.model.parent !== this.surf.root) this.surf.root.add(this.model); this.model.visible = true; if (this.surf.shipG) this.surf.shipG.visible = false; this.sys = this.surf.sys; }
  detach() { this.model.visible = false; if (this.surf.shipG) this.surf.shipG.visible = true; }

  // arriving from orbit: high over the approach side, heading for the settlement
  enterFromSpace(heading, outDir) {
    this.attach(); const h = V(heading.x, 0, heading.z); if (h.lengthSq() < 0.01) h.set(1, 0, 0); h.normalize();
    const s = this.ship; s.pos.set(-h.x * 3600, 2900, -h.z * 3600); s.speed = 330; s.throttle = 0.6; s.vy = 0; this.outDir.copy(outDir); this.state = 'flying';
    const fwd = V(h.x, -0.2, h.z).normalize(); s.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), fwd.clone().negate(), V(0, 1, 0)));
    this.camera.position.copy(s.pos).add(V(0, 8, 30));
  }
  // lifting off from a parked ship
  takeoff() {
    this.attach(); const S = this.surf, s = this.ship; const p = S.shipPos; const pad = S.padAt(p.x, p.z);
    s.pos.set(p.x, p.y + 3.4, p.z); s.quat.setFromEuler(new THREE.Euler(0, S.shipG.rotation.y, 0)); s.speed = 0; s.vy = 0; s.throttle = 0.25; this.state = 'lift'; this.liftT = 0;
    this.assist = pad ? ASSIST[pad.kind] : null;
    if (pad) toast(`Pad launch assist (${pad.kind} pad): free lift to 200 m.`, 'good'); else { toast('Unassisted lift-off from open ground: hold ' + In.label('jump') + ' to climb. Burns extra fuel.', 'warn'); G.fuel = Math.max(0, G.fuel - 4); }
  }
  groundAt(x, z) {
    let g = this.surf.heightAt(x, z);
    for (const f of this.surf.footprints || []) if (x > f.minx && x < f.maxx && z > f.minz && z < f.maxz) g = Math.max(g, f.top);
    return g;
  }
  forward() { return V(0, 0, -1).applyQuaternion(this.ship.quat); }

  update(dt, active) {
    const S = this.surf, s = this.ship, H = this.hud; G.time += dt;
    const ground = this.groundAt(s.pos.x, s.pos.z); const agl = s.pos.y - ground - 3.4;
    const landed = this.state === 'landing';
    if (active && !landed) {
      const look = In.take(); const sens = 0.0019;
      if (this.state !== 'lift' || agl > 25) {
        s.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-look.y * sens, -look.x * sens, 0, 'YXZ')));
        s.roll = damp(s.roll, -In.move.x, 6, dt); s.quat.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), s.roll * 1.2 * dt)).normalize();
      }
      s.throttle = clamp(s.throttle - In.move.y * 0.5 * dt, 0, 1); s.boost = !!In.down.sprint && G.fuel > 0;
      let vyWant = 0; if (In.down.jump) vyWant = 16; if (In.down.crouch) vyWant = -16; if (this.state === 'lift') { vyWant = this.assist ? this.assist : (In.down.jump ? 9 : 0); if (agl > 200 && this.assist) { this.state = 'flying'; toast('Assist complete. You have the stick.', ''); } else if (!this.assist && agl > 12) this.state = 'flying'; }
      s.vy = damp(s.vy, vyWant, 2.2, dt);
    } else In.take();
    // level out gently near the ground; keep the nose from digging in
    if (agl < 40 && this.state === 'flying' && !landed) { const f = this.forward(); if (f.y < -0.15) { s.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0).applyQuaternion(s.quat).multiplyScalar(1).normalize(), 0)); s.speed *= 1; } }
    const max = (s.boost ? BOOST : CRUISE) * (agl < 25 ? 0.5 : 1);
    const target = (G.fuel <= 0 ? Math.min(s.throttle, 0.12) : s.throttle) * max * (this.state === 'lift' && this.assist ? 0.15 : 1);
    s.speed = damp(s.speed, landed ? 0 : target, 0.7, dt);
    const fwd = this.forward();
    if (!landed) { s.pos.addScaledVector(fwd, s.speed * dt); s.pos.y += s.vy * dt; }
    // fuel (pad assist is free)
    const burn = (0.06 + 0.25 * Math.abs(s.speed) / 400 + Math.abs(s.vy) * 0.004) * (s.boost ? 1.8 : 1) * (this.state === 'lift' && this.assist ? 0 : 1);
    if (G.fuel > 0) G.fuel = Math.max(0, G.fuel - burn * dt / (1 + G.ship.tank * 0.25));
    // ground collision
    const minY = ground + 3.4;
    if (s.pos.y < minY && !landed) {
      const impact = Math.max(0, -s.vy) + Math.max(0, -fwd.y * s.speed);
      s.pos.y = minY; if (impact > 14 && this.state !== 'lift') { const dmg = Math.min(70, (impact - 14) * 2.2); G.hull -= dmg; toast(`Hard touchdown! Hull −${dmg | 0}`, 'warn'); s.speed *= 0.3; this.camShake = 0.6; }
      s.vy = Math.max(0, s.vy); if (this.state === 'flying' && s.speed > 60) { s.speed *= 1 - 1.5 * dt; }
    }
    // pad lock & landing
    const pad = S.padAt(s.pos.x, s.pos.z, 2.2); const nearest = S.nearestPad(s.pos.x, s.pos.z);
    const slope = this.slopeAt(s.pos.x, s.pos.z);
    const canPadLand = !!pad && agl < 160 && s.speed < 80;
    const canLand = (agl < 14 && s.speed < 40 && s.vy > -8 && slope < 0.3) || canPadLand;
    if (this.state === 'flying' && active && In.pressed.land) {
      if (canPadLand) { this.state = 'landing'; this.landT = 0; this.landPad = pad; this.landFrom = s.pos.clone(); toast(`Auto-landing on the ${pad.kind} pad.`, ''); }
      else if (canLand) this.touchDown(null);
      else toast(slope >= 0.3 && agl < 14 ? 'Too steep to land here.' : 'Descend lower and slow down to land. Pads auto-land you.', 'warn');
    }
    if (landed) { this.landT += dt; const t = clamp(this.landT / 3.2, 0, 1), e = t * t * (3 - 2 * t); const tx = this.landPad.x, tz = this.landPad.z; const gy = S.heightAt(tx, tz) + 3.4;
      s.pos.set(this.landFrom.x + (tx - this.landFrom.x) * e, this.landFrom.y + (gy - this.landFrom.y) * e, this.landFrom.z + (tz - this.landFrom.z) * e); s.speed = 0; if (t >= 1) this.touchDown(this.landPad); }
    // leaving the atmosphere
    if (s.pos.y > EXIT_ALT && !landed) { this.hooks.toSpace(this.outDir, fwd); return; }
    // visuals
    this.model.position.copy(s.pos); this.model.quaternion.copy(s.quat); this.model.rotateZ(-s.roll * 0.35); this.model.visible = !this.cockpit;
    this.model.traverse(o => { if (o.name === 'flame') o.scale.set(1, 1 + clamp((s.speed + Math.abs(s.vy) * 4) / 250, 0, 3) * (0.8 + Math.random() * 0.4), 1); });
    this.camShake = Math.max(0, (this.camShake || 0) - dt * 2);
    const sp = clamp(s.speed / 700, 0, 1); const cam = this.camera; cam.fov = damp(cam.fov, 70 + sp * 25, 4, dt); cam.updateProjectionMatrix();
    if (this.cockpit) { cam.position.copy(s.pos).add(V(0, 1.5, -3).applyQuaternion(s.quat)); cam.quaternion.copy(s.quat); }
    else { const want = s.pos.clone().add(V(0, 6, 26 + sp * 10).applyQuaternion(s.quat)); cam.position.lerp(want, 1 - Math.exp(-9 * dt)); cam.quaternion.slerp(s.quat, 1 - Math.exp(-8 * dt)); }
    if (cam.position.y < this.groundAt(cam.position.x, cam.position.z) + 1.5) cam.position.y = this.groundAt(cam.position.x, cam.position.z) + 1.5;
    if (this.camShake) cam.position.add(V(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(this.camShake * 2));
    // hud
    const tgt = nearest; let extra = '';
    if (tgt) { const dx = tgt.x - s.pos.x, dz = tgt.z - s.pos.z; extra += `<br><small>Nearest pad: ${tgt.kind} · ${fmt(Math.hypot(dx, dz))} m${tgt.main ? ' · your ship' : ''}</small>`; }
    if (S.planet.settled) { const d = Math.hypot(s.pos.x, s.pos.z); extra += `<br><small>Settlement: ${fmt(d)} m</small>`; }
    if (canPadLand) extra += `<br><b class="land">[${In.label('land')}] AUTO-LAND ON PAD</b>`; else if (canLand) extra += `<br><b class="land">[${In.label('land')}] LAND HERE</b>`;
    Object.assign(H, { speed: Math.abs(s.speed), limit: null, inLane: null, throttle: s.throttle, boost: s.boost, nearName: S.planet.name, nearKind: `${S.planet.kind} · alt ${fmt(Math.max(0, s.pos.y))} m · AGL ${fmt(Math.max(0, agl))} m`, alt: agl, canLand: false, settled: false, extra, disabled: false });
  }
  slopeAt(x, z) { const S = this.surf; const h = S.heightAt(x, z); return Math.max(Math.abs(S.heightAt(x + 6, z) - h), Math.abs(S.heightAt(x - 6, z) - h), Math.abs(S.heightAt(x, z + 6) - h), Math.abs(S.heightAt(x, z - 6) - h)) / 6; }
  touchDown(pad) {
    const s = this.ship; const x = pad ? pad.x : s.pos.x, z = pad ? pad.z : s.pos.z; const f = this.forward(); const yaw = Math.atan2(-f.x, -f.z);
    this.state = 'flying'; this.detach(); this.hooks.landed(x, z, pad ? 0 : yaw, pad); toast(pad ? `Landed on the ${pad.kind} pad.` : 'Landed on open ground. A pad gives free lift-off assist.', 'good'); xp('piloting', pad ? 4 : 8);
  }
}
