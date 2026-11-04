// On-foot player: Space Ranger movement, immersive first-person body, lean/idle camera, focus, guns, mining, survival
import * as THREE from '../vendor/three.module.js';
import { clamp, damp, lerp } from './util.js';
import { In } from './input.js';
import { G, toast, quickPull, stowHand, removeItem, count, lvl, xp, addItem, canAdd } from './state.js';
import { ITEMS, GUN } from './data.js';
import { buildBackpackMesh, gunMesh, itemMesh } from './models.js';
import { ASSET } from './assets.js';
import { buildHuman, animateHuman, setOutfit, OUTFITS, makeLook, GUN_ATTACH } from './people.js';
import { sfx } from './audio.js';

// Space Ranger constants (Walk.cs / Character.Stance.cs)
const WALK = 4.38, SPRINT = 5.04, WALK_GO = 14, WALK_STOP = 14, JUMP_V = 3.8, GRAV = 9.8, CROUCH_MUL = 0.5, CROUCH_EASE = 0.25;
const EYE = 1.65, EYE_CROUCH = EYE * 0.65;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Player {
  constructor(camera) {
    this.cam = camera; this.pos = V(); this.vel = V(); this.yaw = 0; this.pitch = 0; this.bodyYaw = 0;
    this.onGround = true; this.crouchBlend = 0; this.crouch = false; this.gait = 0; this.bobAmt = 0; this.strafeLean = 0; this.landDip = 0; this.landDipV = 0; this.airFall = 0;
    this.lean = 0; this.leanDir = V(); this.leanKind = ''; this.idleT = 0; this.idleCam = 0; this.thirdPerson = false; this.orbit = 0;
    this.aim = 0; this.focus = 0; this.focusTarget = null; this.fov = 75; this.recoil = 0; this.fireCd = 0; this.reloadT = 0; this.pitchOff = 0; this.packOpen = false; this.sway = V(); this.lastGun = null;
    this.mineT = 0; this.mineNode = null; this.stepAcc = 0; this.holsterT = 0; this.exposure = 0; this.dead = false; this.hurtT = 0; this.muzzle = 0; this.stand = 0;
    if (!G.outfit) G.outfit = JSON.parse(JSON.stringify(OUTFITS.ranger));
    this.look = makeLook(4242); this.look.female = false;
    this.body = buildHuman(this.look, G.outfit);
    this.pack3 = buildBackpackMesh(); this.pack3.position.set(0, 0.3, 0.19); this.pack3.scale.setScalar(1.35); this.body.userData.J.spine.add(this.pack3);
    this.packMesh = buildBackpackMesh(); this.packMesh.scale.setScalar(1.7); this.packMesh.visible = false; this.packT = 0; this.gunUp = 0; this.gunUpT = 0;
    this.view = new THREE.Group(); this.cam.add(this.view);
    this.skin = new THREE.MeshStandardMaterial({ color: this.look.skin, roughness: 0.6 }); this.sleeve = new THREE.MeshStandardMaterial({ color: 0x3a5c3a, roughness: 0.92 }); this.skin.userData.look = this.sleeve.userData.look = { skip: true };
    const mkArm = () => { const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.029, 1, 10), this.sleeve); fore.geometry.translate(0, 0.5, 0); const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.1), this.skin); const fing = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.05), this.skin); fing.position.set(0, -0.005, -0.07); hand.add(fing); this.view.add(fore, hand); return { fore, hand }; };
    this.armL = mkArm(); this.armR = mkArm(); this.applyOutfitColors();
    this.gunHolder = new THREE.Group(); this.view.add(this.gunHolder);
    this.heldHolder = new THREE.Group(); this.view.add(this.heldHolder); this.heldId = null; this.packHidden = false; this.packFloor = null;
    this.flash = new THREE.PointLight(0xffc880, 0, 12, 2); this.view.add(this.flash); this.flash.position.set(0.2, -0.1, -1);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), new THREE.MeshBasicMaterial({ color: 0x66f0ff })); this.beam.visible = false;
    this.mark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.8 }));
    this.mark.visible = false;
    this.impacts = [];
    this.holdId = null; this.cd = {};
  }

  place(scene, surf) {
    this.surf = surf; scene.add(this.body); scene.add(this.packMesh); scene.add(this.beam); scene.add(this.mark); this.scene = scene; scene.add(this.cam);
    this.cam.position.set(0, 0, 0);
  }
  teleport(x, z, yaw = 0) {
    this.pos.set(x, this.surf.heightAt(x, z), z); this.vel.set(0, 0, 0); this.yaw = yaw; this.bodyYaw = yaw; this.onGround = true;
  }

  supportY(x, z, feetY) {
    let best = this.surf.heightAt(x, z);
    for (const c of this.surf.colliders) {
      if (c.roof || c.maxy === undefined || c.maxy > feetY + 0.45 || c.maxy > 3 || c.id === 'ship') continue;
      if (x > c.minx - 0.15 && x < c.maxx + 0.15 && z > c.minz - 0.15 && z < c.maxz + 0.15) best = Math.max(best, c.maxy);
    }
    return best;
  }

  update(dt, ctx) {
    // ctx: {active, npcs, focusable, surf, ui}
    const { active, surf } = ctx; const hasInput = active && !this.dead && !this.packOpen;
    this.packT = THREE_move(this.packT, this.packOpen ? 1 : 0, dt / 0.85);
    const look = In.take();
    const mv = hasInput ? In.move : { x: 0, y: 0 };
    const grav = GRAV * surf.gravity;
    const anyIn = hasInput && (Math.abs(mv.x) + Math.abs(mv.y) > 0.05 || Math.abs(look.x) + Math.abs(look.y) > 1 || In.down.fire || In.down.aim || In.down.jump);
    this.idleT = anyIn ? 0 : this.idleT + dt;
    if (anyIn || this.packOpen) { this.idleCam = damp(this.idleCam, 0, 10, dt); }
    else if (this.idleT > 12) this.idleCam = damp(this.idleCam, 1, 1.4, dt);
    // ------------- focus & aim state -------------
    const wantFocus = hasInput && In.down.focus; this.focus = damp(this.focus, wantFocus ? 1 : 0, 9, dt);
    const wantAim = hasInput && In.down.aim && !wantFocus;
    if (wantAim && G.held && !G.hand) { const left = addItem(G.held.id, G.held.n || 1); G.held = left ? { ...G.held, n: left } : null; }   // aiming puts what you're holding away
    if (wantAim && !G.hand && !this.reloading) { if (quickPull()) { sfx('zip', 0.6); this.holsterT = 0; } }
    this.aim = damp(this.aim, wantAim && G.hand ? 1 : 0, 12, dt);
    if (G.quickDrawn && G.hand && !wantAim && !In.down.fire) { this.holsterT += dt; if (this.holsterT > 3) { stowHand(); sfx('zip', 0.4); } } else if (wantAim) this.holsterT = 0;
    if (hasInput && In.pressed.holster && G.held) { const left = addItem(G.held.id, G.held.n || 1); G.held = left ? { ...G.held, n: left } : null; sfx('zip', 0.4); }
    else if (hasInput && In.pressed.holster) { if (G.hand) { stowHand(); sfx('zip', 0.5); } else if (quickPull()) sfx('zip', 0.5); }
    if (hasInput && In.pressed.view) this.thirdPerson = !this.thirdPerson;
    // ------------- look -------------
    const sens = 0.0022 * (1 - this.aim * 0.4) * (1 - this.focus * 0.45);
    const pitchMax = 1.5; this.yaw -= look.x * sens; this.pitch = clamp(this.pitch - look.y * sens, -pitchMax, pitchMax);
    if (this.focus > 0.3) this.updateFocusTarget(ctx); else this.focusTarget = null;
    if (this.focusTarget && this.focus > 0.5) {   // light RDR2-style assist: ease the view toward the person
      const t = this.focusTarget, dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z; const wantYaw = Math.atan2(-dx, -dz); let d = wantYaw - this.yaw; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
      this.yaw += d * Math.min(1, dt * 2.2); const dist = Math.hypot(dx, dz); this.pitch = damp(this.pitch, Math.atan2(1.55 - (this.pos.y + EYE), dist) * 1.0, 2.2, dt);
    }
    // ------------- stance -------------
    if (hasInput && In.pressed.crouch) this.crouch = !this.crouch;
    this.crouchBlend = THREE_move(this.crouchBlend, this.crouch ? 1 : 0, dt / CROUCH_EASE);
    // ------------- movement (Space Ranger) -------------
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fwdW = V(-sin, 0, -cos), rightW = V(cos, 0, -sin);
    const wish = fwdW.clone().multiplyScalar(-mv.y).addScaledVector(rightW, mv.x);
    const sprinting = hasInput && In.down.sprint && mv.y < -0.5 && !this.crouch && this.aim < 0.5 && this.focus < 0.3;
    this.sprinting = sprinting;
    const maxSpeed = (sprinting ? SPRINT : WALK) * lerp(1, CROUCH_MUL, this.crouchBlend) * (1 - this.aim * 0.3) * (1 - this.focus * 0.4) * (this.packOpen ? 0 : 1) * (this.leanSlow ?? 1);
    const target = wish.clone().multiplyScalar(maxSpeed * Math.min(1, wish.length()));
    const k = wish.lengthSq() > 0.0001 ? WALK_GO : WALK_STOP;
    let vH = V(this.vel.x, 0, this.vel.z);
    if (this.onGround) { vH.lerp(target, 1 - Math.exp(-k * dt)); vH.add(target.clone().sub(vH).clampLength(0, 2.5 * dt)); }
    else vH.lerp(target, 1 - Math.exp(-2.2 * dt));
    this.vel.x = vH.x; this.vel.z = vH.z;
    if (hasInput && In.pressed.jump && this.onGround) { if (this.crouch) this.crouch = false; else { this.vel.y = JUMP_V * (surf.gravity < 0.7 ? 1.5 : 1); this.onGround = false; } }
    this.vel.y -= grav * dt;
    this.pos.addScaledVector(this.vel, dt);
    const sy = this.supportY(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= sy + 0.001 && this.vel.y <= 0) {
      if (!this.onGround) { const hit = clamp((this.airFall - 1.5) / 8, 0, 1); if (this.airFall > 1.5) this.landDipV -= lerp(0.25, 1.6, hit); if (this.airFall > 9) { G.hp -= (this.airFall - 9) * 5; this.hurtT = 0.4; toast('Hard landing.', 'warn'); } this.airFall = 0; sfx('step', 1.4); }
      this.pos.y = sy; this.vel.y = 0; this.onGround = true;
    } else { this.onGround = false; if (this.vel.y < 0) this.airFall = Math.max(this.airFall, -this.vel.y); }
    // collision with walls
    const p2 = V(this.pos.x, 0, this.pos.z); surf.collide(p2, 0.34, this.pos.y); this.pos.x = p2.x; this.pos.z = p2.z;
    if (surf.planet.kind !== 'ocean') { /* terrain is walkable everywhere */ }
    // gait
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) { this.gait += speed * dt / 1.55; this.stepAcc += speed * dt; if (this.stepAcc > (sprinting ? 1.9 : 1.5)) { this.stepAcc = 0; sfx('step', sprinting ? 1.1 : 0.7 * (1 - this.crouchBlend * 0.6)); } }
    // ------------- body yaw + lean on walls -------------
    let dBody = this.yaw - this.bodyYaw; while (dBody > Math.PI) dBody -= 6.283; while (dBody < -Math.PI) dBody += 6.283;
    if (speed > 0.3 || this.aim > 0.3 || Math.abs(dBody) > 1.1) this.bodyYaw += dBody * Math.min(1, dt * (speed > 0.3 ? 10 : 6)); else this.bodyYaw += dBody * Math.min(1, dt * 0.8);
    this.updateLean(dt, surf, speed);
    // ------------- weapons / mining -------------
    this.updateWeapons(dt, ctx, hasInput);
    // ------------- survival -------------
    this.updateSurvival(dt, surf, speed);
    // ------------- camera & body -------------
    this.updateCamera(dt, speed, mv);
    this.updateBody(dt, speed);
    this.hurtT = Math.max(0, this.hurtT - dt);
  }

  updateLean(dt, surf, speed) {
    // idle against a wall: lean into it (side shoulder, forward lean, or back to the wall)
    let want = 0, kind = '', dir = null;
    if (this.idleT > 0.7 && this.onGround && speed < 0.2 && !this.packOpen && this.aim < 0.2) {
      let best = null;
      for (let a = 0; a < 8; a++) {
        const ang = a * Math.PI / 4 + this.bodyYaw; const dx = -Math.sin(ang), dz = -Math.cos(ang);
        const h = surf.wallProbe(this.pos.x, this.pos.z, dx, dz, 0.95);
        if (h && (!best || h.dist < best.dist)) best = { ...h, dx, dz, a };
      }
      if (best) {
        want = 1; dir = V(best.dx, 0, best.dz);
        const rel = ((best.a * 45) + 360) % 360;   // 0 = wall ahead, 90 = left, 180 = behind, 270 = right
        kind = rel < 30 || rel > 330 ? 'ahead' : rel > 150 && rel < 210 ? 'back' : rel < 180 ? 'left' : 'right';
      }
    }
    if (want) { this.leanDir.copy(dir); this.leanKind = kind; }
    this.lean = damp(this.lean, want, want ? 3.2 : 6, dt); this.leanSlow = 1;
    this.leaning = this.lean > 0.5;
  }

  updateFocusTarget(ctx) {
    const f = this.camForward(); let best = null, bs = 0.9;
    const eye = V(this.pos.x, this.pos.y + EYE, this.pos.z);
    for (const n of ctx.npcs) {
      if (n.dead || n.customer) continue; const to = V(n.pos.x, n.pos.y + 1.4, n.pos.z).sub(eye); const d = to.length(); if (d > 14) continue; to.normalize();
      const s = to.dot(f) - d * 0.004; if (s > bs) { bs = s; best = n; }
    }
    this.focusTarget = best;
  }
  // how far (0..1) the camera can sit along pivot->want before a wall/prop is in the way
  fitRoom(from, to) {
    const d = to.clone().sub(from), len = d.length(); if (len < 1e-4) return 1;
    let best = 1;
    for (const c of this.surf.colliders) {
      if (c.roof || c.id === 'ship') continue;
      const top = c.maxy ?? 99; if (top < from.y - 0.2 && top < to.y - 0.2) continue;
      const m = 0.3, x0 = c.minx - m, x1 = c.maxx + m, z0 = c.minz - m, z1 = c.maxz + m;
      let t0 = 0, t1 = 1;
      for (const [o, dd, lo, hi] of [[from.x, d.x, x0, x1], [from.z, d.z, z0, z1]]) {
        if (Math.abs(dd) < 1e-6) { if (o < lo || o > hi) { t0 = 2; break; } } else { let a = (lo - o) / dd, b = (hi - o) / dd; if (a > b) { const t = a; a = b; b = t; } t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
      }
      if (t0 <= t1 && t0 > 0 && t0 < best) best = t0;
    }
    return Math.max(0.12, best);
  }
  // where a shot fired from the body lands when the lens is somewhere else; also drives the sliding crosshair
  updateAimPoint(dt) {
    const cam = this.cam, tp = this.tp ?? 0; this.xh = this.xh || { x: 0, y: 0 };
    let tx = 0, ty = 0;
    this.aimDir = null;
    if (this.tpU > 0.02) {
      const f = V(0, 0, -1).applyQuaternion(cam.quaternion), range = 70;
      const hitC = this.rayWorld(cam.position, f, range, 0.6, 0.6);
      const target = cam.position.clone().addScaledVector(f, hitC);
      const origin = V(this.pos.x, this.pos.y + EYE - 0.05, this.pos.z), dir = target.clone().sub(origin); const dl = dir.length();
      if (dl > 0.5) {
        dir.divideScalar(dl); this.aimDir = dir;
        const wd = this.rayWorld(origin, dir, dl, 0.6); const land = origin.clone().addScaledVector(dir, Math.min(dl, wd));
        const pr = land.project(cam); tx = clamp(pr.x, -0.9, 0.9) * innerWidth / 2; ty = clamp(-pr.y, -0.9, 0.9) * innerHeight / 2;
        if (pr.z > 1) { tx = 0; ty = 0; }
      }
    }
    const k = 1 - Math.exp(-22 * dt); this.xh.x += (tx - this.xh.x) * k; this.xh.y += (ty - this.xh.y) * k;
  }
  camForward() { return V(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ')); }

  updateWeapons(dt, ctx, hasInput) {
    const g = G.hand; this.fireCd -= dt; this.muzzle = Math.max(0, this.muzzle - dt * 12); this.flash.intensity = this.muzzle * 8;
    this.recoil = damp(this.recoil, 0, 12, dt);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloading = false; if (g) g.mag = GUN[ITEMS[g.id].gun].mag; sfx('ui', 0.7); } }
    this.beam.visible = false; this.mark.visible = false;
    if (g) {
      const spec = GUN[ITEMS[g.id].gun]; if (g.mag === undefined) g.mag = spec.mag;
      if (hasInput && In.pressed.reload && g.mag < spec.mag && !this.reloading && count('ammo') > 0) { removeItem('ammo', 1); this.reloading = true; this.reloadT = 1.0; sfx('zip', 0.5); }
      const auto = spec.rate < 0.2;
      if (hasInput && this.focus < 0.3 && !this.reloading && this.fireCd <= 0 && (auto ? In.down.fire : In.pressed.fire || (In.down.fire && spec.rate < 0.5))) {
        if (g.mag > 0) this.shoot(g, spec, ctx);
        else if (In.pressed.fire) { toast(count('ammo') ? 'Empty — press ' + In.label('reload') + ' to reload.' : 'Out of ammo.', 'warn'); this.fireCd = 0.3; }
      }
    } else if (hasInput && In.down.fire && this.focus < 0.3) this.mine(dt, ctx);
    else { this.mineT = 0; }
    if (!(hasInput && In.down.fire)) this.mineT = Math.max(0, this.mineT - dt * 2);
  }

  shoot(g, spec, ctx) {
    this.fireCd = spec.rate; g.mag--; this.gunUpT = 2.5; this.recoil = Math.min(1.6, this.recoil + 0.5 + spec.pellets * 0.04); this.pitch += 0.012 * (1 + spec.pellets * 0.08) * (1 - this.aim * 0.4); this.yaw += (Math.random() - 0.5) * 0.004; this.muzzle = 1;
    sfx(spec.pellets > 4 ? 'shotgun' : g.id === 'rifle' ? 'rifle' : (g.id === 'arc' || g.id.startsWith('pulse') || g.id === 'scatter' || g.id === 'railrifle') ? 'laser' : 'shot', 1);
    const origin = V(this.pos.x, this.pos.y + EYE - 0.05, this.pos.z);
    const dmgMul = (g.q || 1) * (1 + 0.04 * lvl('gunsmith'));
    for (let i = 0; i < spec.pellets; i++) {
      const sp = spec.spread * (1 - this.aim * 0.55) * (this.crouch ? 0.8 : 1) * (1 + Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 5));
      const dir = (this.aimDir ? this.aimDir.clone().lerp(this.camForward(), 1 - this.tpU).normalize() : this.camForward()); dir.x += (Math.random() - 0.5) * sp * 2; dir.y += (Math.random() - 0.5) * sp * 2; dir.z += (Math.random() - 0.5) * sp * 2; dir.normalize();
      let hit = null, hd = spec.range;
      for (const n of ctx.npcs) {
        if (n.dead) continue; const c = V(n.pos.x, n.pos.y + 0.9, n.pos.z); const to = c.clone().sub(origin); const t = to.dot(dir); if (t < 0 || t > hd) continue;
        const closest = origin.clone().addScaledVector(dir, t); const dy = closest.y - n.pos.y; if (dy < -0.1 || dy > 1.85) continue;
        if (Math.hypot(closest.x - n.pos.x, closest.z - n.pos.z) < 0.42) { hit = n; hd = t; }
      }
      // world blocker
      const wd = this.rayWorld(origin, dir, hd); if (wd < hd) { hit = null; hd = wd; }
      const end = origin.clone().addScaledVector(dir, hd);
      if (hit) { const head = end.y - hit.pos.y > 1.5; ctx.hitNPC(hit, spec.dmg * dmgMul * (head ? 2 : 1), head); this.impact(end, 0xff4040); } else if (hd < spec.range) this.impact(end, 0xffe0a0);
    }
  }
  rayWorld(o, d, max, step = 0.35, t0 = 0.3) {
    const s = this.surf; let best = max;
    // terrain: coarse march
    for (let t = t0; t < best; t += step) { if (o.y + d.y * t < s.heightAt(o.x + d.x * t, o.z + d.z * t)) { best = t; break; } }
    // props and walls: exact slab test so thin walls can't be stepped through
    for (const c of s.colliders) {
      if (c.roof) continue;
      let a = t0, b = best;
      for (const [oo, dd, lo, hi] of [[o.x, d.x, c.minx, c.maxx], [o.z, d.z, c.minz, c.maxz]]) {
        if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { a = 2e9; break; } } else { let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } if (t1 > a) a = t1; if (t2 < b) b = t2; }
      }
      if (a <= b && a < best && o.y + d.y * a < (c.maxy ?? 99)) best = a;
    }
    return best;
  }
  impact(pos, col) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: col, transparent: true })); m.position.copy(pos); this.scene.add(m); this.impacts.push({ m, t: 0.25 });
  }

  mine(dt, ctx) {
    const o = V(this.pos.x, this.pos.y + EYE, this.pos.z), f = this.camForward(); let best = null, bd = 9;
    for (const nd of ctx.surf.nodes) {
      if (!nd.alive) continue; const to = nd.pos.clone().sub(o); const t = to.dot(f); if (t < 0.4 || t > 8) continue;
      const cl = o.clone().addScaledVector(f, t); if (cl.distanceTo(nd.pos) < 0.9 * nd.size + 0.3 && t < bd) { bd = t; best = nd; }
    }
    if (!best) { this.mineT = 0; return; }
    if (this.mineNode !== best) { this.mineNode = best; this.mineT = 0; }
    this.beam.visible = true; const a = o.clone().add(V(0.2, -0.3, 0).applyEuler(new THREE.Euler(0, this.yaw, 0))).addScaledVector(f, 0.4); const mid = a.clone().add(best.pos).multiplyScalar(0.5);
    this.beam.position.copy(mid); this.beam.scale.set(1 + Math.random(), a.distanceTo(best.pos), 1 + Math.random()); this.beam.quaternion.setFromUnitVectors(V(0, 1, 0), best.pos.clone().sub(a).normalize());
    this.mark.visible = true; this.mark.position.copy(best.pos);
    this.mineT += dt * (1 + 0.12 * lvl('mining')) / (0.9 * best.size + 0.4); this.mineFrac = this.mineT;
    this._mineSfx = (this._mineSfx || 0) - dt; if (this._mineSfx <= 0) { sfx('mine', 1); this._mineSfx = 0.12; }
    best.m.rotation.x += dt * 2; best.m.position.x = best.pos.x + (Math.random() - 0.5) * 0.03;
    if (this.mineT >= 1) {
      const n = Math.max(1, Math.round((1.6 + Math.random() * 2.4) * best.size * (1 + 0.1 * lvl('mining'))));
      const left = addItem(best.id, n); if (left === n) { toast('Pack is full — free some slots.', 'warn'); this.mineT = 0.9; return; }
      toast(`+${n - left} ${ITEMS[best.id].name}`, 'good'); sfx('coin', 0.7); xp('mining', 4);
      best.alive = false; best.m.visible = false; this.mineT = 0; this.mineNode = null; ctx.onMined && ctx.onMined(best);
    }
  }

  updateSurvival(dt, surf, speed) {
    const inTown = surf.planet.settled && Math.hypot(this.pos.x, this.pos.z) < 82; const nearShip = Math.hypot(this.pos.x - surf.padPos.x, this.pos.z - surf.padPos.z) < 13;
    const safe = inTown || nearShip;
    G.hunger = Math.max(0, G.hunger - dt * (speed > 4 ? 0.12 : 0.05)); G.thirst = Math.max(0, G.thirst - dt * (speed > 4 ? 0.18 : 0.08));
    // oxygen on thin worlds
    if (surf.air < 0.3 && !safe) { G.oxygen = Math.max(0, G.oxygen - dt * (surf.air < 0.05 ? 1.1 : 0.5) * (speed > 4 ? 1.4 : 1)); if (G.oxygen <= 0) { G.hp -= dt * 6; this.hurtT = 0.2; } }
    else G.oxygen = Math.min(100, G.oxygen + dt * 14);
    // exposure to cold / heat
    const T = surf.planet.temp; const extreme = T < 0.15 || T > 0.85; if (extreme && !safe) { this.exposure = Math.min(100, this.exposure + dt * 1.6); if (this.exposure >= 100) { G.hp -= dt * 3; this.hurtT = 0.1; } } else this.exposure = Math.max(0, this.exposure - dt * 8);
    G.temp = this.exposure;
    if (G.hunger <= 0 || G.thirst <= 0) G.hp -= dt * 1.2; else if (G.hp < 100 && G.hunger > 40 && G.thirst > 40) G.hp = Math.min(100, G.hp + dt * 0.5);
    if (G.hp <= 0 && !this.dead) { this.dead = true; ctxDie && ctxDie(); }
  }

  eatNow() {
    if (G.hp < 55 && count('medkit')) return this.use('medkit');
    if (G.oxygen < 40 && count('o2_tank')) return this.use('o2_tank');
    if (G.thirst <= G.hunger && count('water')) return this.use('water');
    if (count('ration')) return this.use('ration'); if (count('water')) return this.use('water');
    toast('Nothing to eat or drink.', 'warn');
  }
  use(id) {
    const it = ITEMS[id]; if (!it.use || !removeItem(id, 1)) return false;
    for (const [k, v] of Object.entries(it.use)) { const map = { hunger: 'hunger', thirst: 'thirst', health: 'hp', oxygen: 'oxygen' }; G[map[k]] = Math.min(100, G[map[k]] + v); }
    toast(`Used ${it.name}`, 'good'); sfx('ui', 0.8); return true;
  }

  updateCamera(dt, speed, mv) {
    const cam = this.cam; const s = this.surf;
    // bobbing from Space Ranger: dip at each heel strike, sway side to side, slight roll
    const feet = this.onGround; const want = feet ? clamp(speed / SPRINT, 0, 1.2) : 0; this.bobAmt = damp(this.bobAmt, want, want > this.bobAmt ? 6 : 9, dt);
    const p = Math.PI * 2 * this.gait; const boots = lerp(1, 0.6, this.crouchBlend) * (1 - this.aim * 0.6);
    const vAmp = lerp(0.007, 0.024, clamp(this.bobAmt, 0, 1)) * Math.min(1, this.bobAmt * 4) * boots, hAmp = lerp(0.009, 0.006, clamp(this.bobAmt, 0, 1)) * Math.min(1, this.bobAmt * 4) * boots;
    let eye = lerp(EYE, EYE_CROUCH, this.crouchBlend) - vAmp * Math.cos(2 * p); let side = hAmp * Math.sin(p);
    let roll = Math.sin(p) * 0.45 * Math.min(1, this.bobAmt * 3) * boots * 0.0175 * 1.0;
    let pitch = Math.cos(2 * p) * 0.18 * this.bobAmt * boots * 0.0175;
    const lateral = (this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw)) / SPRINT; this.strafeLean = damp(this.strafeLean, -lateral * 2.2, 7, dt); roll += this.strafeLean * 0.0175;
    // landing spring
    this.landDipV += (-140 * this.landDip - 17 * this.landDipV) * dt; this.landDip = clamp(this.landDip + this.landDipV * dt, -0.14, 0.05); eye += this.landDip; pitch += this.landDip * 9 * 0.0175;
    // breathing + immersive weight: slow figure-eight when still
    const br = Math.sin(G.time * 1.6) * 0.004 * (1 - this.bobAmt); eye += br;
    // leaning: shift the head toward the wall, roll away
    let ox = 0, oz = 0, lr = 0, lp = 0;
    if (this.lean > 0.01) {
      const L = this.lean; const d = this.leanDir; const k = { ahead: 0.0, left: 0.22, right: 0.22, back: 0.0 }[this.leanKind] ?? 0.2;
      ox = d.x * k * L; oz = d.z * k * L;
      if (this.leanKind === 'left') lr = -0.1 * L; else if (this.leanKind === 'right') lr = 0.1 * L;
      if (this.leanKind === 'ahead') { lp = -0.1 * L; eye -= 0.05 * L; ox = d.x * 0.1 * L; oz = d.z * 0.1 * L; } if (this.leanKind === 'back') { eye -= 0.08 * L; lp = 0.09 * L; }
      eye -= 0.04 * L;
    }
    // packOpen: dip the view toward the bag
    this.pitchOff = -this.packT * 0.95; eye -= this.packT * 0.62;
    const fovBase = 75; const wantFov = fovBase - this.aim * 22 - this.focus * 18 + (this.sprinting ? 5 : 0); this.fov = damp(this.fov, wantFov, 10, dt);
    const forward = V(0, 0, -1).applyAxisAngle(V(0, 1, 0), this.yaw);
    const e = V(this.pos.x, this.pos.y + eye, this.pos.z).addScaledVector(forward, 0.1 + (this.crouchBlend * 0.04)).add(V(Math.cos(this.yaw) * side + ox, 0, -Math.sin(this.yaw) * side + oz));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch + this.pitchOff + pitch + lp - this.recoil * 0.035, this.yaw, roll + lr, 'YXZ'));
    // third-person: V toggles an over-the-back orbit that eases in/out (no snap), tightens to an over-the-shoulder view when aiming,
    // and pulls in so it always fits the room (walls + ceiling) you are standing in.
    this.tpU = damp(this.tpU ?? 0, this.thirdPerson ? 1 : 0, 5, dt);
    this.aimC = damp(this.aimC ?? 0, G.hand ? this.aim : 0, 7, dt);
    const tp = Math.max(this.tpU, this.idleCam);
    this.tp = tp;
    if (tp > 0.01) {
      let tpPos, tpQuat;
      if (this.idleCam > 0.5 && !this.thirdPerson) {
        this.orbit += dt * 0.12 * this.idleCam;
        const base = this.yaw + this.orbit + Math.PI * 0.2 * this.idleCam;
        const pivot = V(this.pos.x, this.pos.y + 1.5, this.pos.z);
        const dir = V(Math.sin(base), 0.0, Math.cos(base)).multiplyScalar(3.6); dir.y = 0.35 + (this.pitch * -0.8) + 0.2;
        tpPos = pivot.clone().add(dir);
        tpQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(tpPos, pivot, V(0, 1, 0)));
      } else {
        const ac = this.aimC, f = this.camForward();
        const pivot = V(this.pos.x, e.y + 0.05, this.pos.z);
        const right = V(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        const dist = lerp(3.1, 1.25, ac), shoulder = lerp(0.3, 0.55, ac), up = lerp(0.3, 0.12, ac);
        const full = pivot.clone().addScaledVector(right, shoulder).addScaledVector(f, -dist); full.y += up;
        // fit to the room: shorten the pull-back until nothing is between the pivot and the lens
        const room = this.fitRoom(pivot, full);
        this.camFit = this.camFit ?? 1; this.camFit = damp(this.camFit, room, room < this.camFit ? 30 : 3.5, dt);
        if (this.camFit > room) this.camFit = room;
        tpPos = pivot.clone().lerp(full, this.camFit);
        const bd = this.surf.buildings?.find(b => this.pos.x > b.x0 && this.pos.x < b.x1 && this.pos.z > b.z0 && this.pos.z < b.z1);
        if (bd) tpPos.y = Math.min(tpPos.y, this.pos.y + (bd.h || 3.2) - 0.25);
        tpQuat = q;
      }
      cam.position.copy(e).lerp(tpPos, tp); cam.quaternion.copy(q).slerp(tpQuat, tp);
    } else { cam.position.copy(e); cam.quaternion.copy(q); this.camFit = 1; }
    // ground clip
    const gy = s.heightAt(cam.position.x, cam.position.z) + 0.15; if (cam.position.y < gy) cam.position.y = gy;
    cam.fov = this.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    this.updateAimPoint(dt);
    // viewmodel: lag behind look for weight (cyberpunk-mod feel)
    this._lastYaw = this._lastYaw ?? this.yaw; this._lastPitch = this._lastPitch ?? this.pitch;
    let dy = this.yaw - this._lastYaw; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; const dp = this.pitch - this._lastPitch; this._lastYaw = this.yaw; this._lastPitch = this.pitch;
    this.sway.x = damp(this.sway.x, clamp(dy * 3.2, -0.12, 0.12), 12, dt) + (-dy * 0.9); this.sway.y = damp(this.sway.y, clamp(-dp * 3.2, -0.1, 0.1), 12, dt) + (dp * 0.9);
    this.sway.x = clamp(this.sway.x, -0.14, 0.14); this.sway.y = clamp(this.sway.y, -0.12, 0.12);
    this.updateViewmodel(dt, speed, p);
  }

  updateViewmodel(dt, speed, p) {
    const g = G.hand; const id = g ? g.id : null;
    if (id !== this.holdId || this.holdVer !== ASSET.version) { this.gunHolder.clear(); this.holdId = id; this.holdVer = ASSET.version; if (id) { const m = gunMesh(id); this.gunHolder.add(m); this.gunMesh = m; } else this.gunMesh = null; this.drawT = 0; }
    this.view.visible = this.tp < 0.3;
    this.gunUpT = Math.max(0, this.gunUpT - dt);
    const wantUp = (this.aim > 0.2 || this.gunUpT > 0 || this.reloading) ? 1 : 0; this.gunUp = damp(this.gunUp, wantUp, 7, dt);
    const bob = Math.min(1, this.bobAmt) * (1 - this.aim * 0.7);
    const sx = this.sway.x, sy = this.sway.y, kick = this.recoil * 0.06; const rl = this.reloading ? Math.sin((1 - this.reloadT) * Math.PI) : 0;
    this.drawT = Math.min(1, (this.drawT || 0) + 0.06);
    const bobY = -Math.abs(Math.cos(p)) * 0.012 * bob, bobX = Math.sin(p) * 0.008 * bob;
    const aR = new THREE.Vector3(0.26, -0.5, 0.12), aL = new THREE.Vector3(-0.26, -0.5, 0.12);   // elbow anchors (below and behind the lens)
    let hR, hL;
    if (g) {
      const lowP = new THREE.Vector3(0.27, -0.5, -0.22), hipP = new THREE.Vector3(0.2, -0.2, -0.4), adsP = new THREE.Vector3(0, -0.115, -0.32);
      const pos = lowP.clone().lerp(hipP, this.gunUp).lerp(adsP, this.aim); const rotX = -1.15 * (1 - this.gunUp) - this.recoil * 0.05 + rl * 0.5;
      this.gunHolder.position.set(pos.x + sx + bobX, pos.y + sy + bobY - rl * 0.12 - (1 - this.drawT) * 0.3, pos.z + kick);
      this.gunHolder.rotation.set(rotX, -sx * 0.6 + (1 - this.aim) * 0.06 * this.gunUp, sx * 0.3);
      this.gunHolder.updateMatrix();
      const grips = { pistol: [[0, -0.07, -0.01], [0.012, -0.075, -0.035]], coach: [[0, -0.075, 0.0], [0, -0.035, -0.2]], rifle: [[0, -0.065, 0.0], [0, -0.045, -0.34]], breacher: [[0, -0.065, 0.0], [0, -0.05, -0.26]], arc: [[0, -0.085, 0.0], [0, -0.04, -0.3]] }[id];
      const gv = (v) => new THREE.Vector3(...v).applyMatrix4(this.gunHolder.matrix);
      hR = gv(grips[0]); const twoHand = this.gunUp > 0.4 || id !== 'pistol'; hL = twoHand ? gv(grips[1]) : new THREE.Vector3(-0.27, -0.58, -0.12);
      if (!twoHand) hL.lerp(gv(grips[1]), this.gunUp);
    } else {
      this.gunHolder.position.set(0, -2, 0);
      hL = new THREE.Vector3(-0.27 + sx, -0.62 + sy + bobY, -0.1); hR = new THREE.Vector3(0.27 + sx, -0.62 + sy - bobY, -0.1);
      if (this.beam.visible) hR = new THREE.Vector3(0.2, -0.26, -0.42);
      if (G.held) { hR = new THREE.Vector3(0.16 + sx, -0.27 + sy + bobY, -0.4); hL = new THREE.Vector3(-0.27 + sx, -0.62 + sy, -0.1); }
      hL.z += Math.sin(p) * 0.02 * bob; hR.z -= Math.sin(p) * 0.02 * bob;
    }
    const place = (arm, a, h, left) => {
      const d = h.clone().sub(a); const len = d.length(); arm.fore.position.copy(a); arm.fore.scale.set(1, len, 1); arm.fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      arm.hand.position.copy(h); arm.hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d.clone().setY(d.y * 0.6).normalize()); arm.hand.rotation.z += left ? -0.2 : 0.2;
    };
    place(this.armR, aR, hR, false); place(this.armL, aL, hL, true);
    const hid = G.held ? G.held.id : null;
    if (hid !== this.heldId || this.heldVer !== ASSET.version) { this.heldHolder.clear(); this.heldId = hid; this.heldVer = ASSET.version; if (hid) { const m = itemMesh(hid); m.scale.setScalar(2.2); this.heldHolder.add(m); } }
    this.heldHolder.visible = !!hid; if (hid) { this.heldHolder.position.copy(hR).add(new THREE.Vector3(0, 0.03, -0.02)); this.heldHolder.rotation.set(-0.5, 0.5 + Math.sin(G.time * 0.6) * 0.08, 0); }
  }

  updateBody(dt, speed) {
    const b = this.body, J = b.userData.J; b.position.copy(this.pos); this.pack3.position.y = 0.3 + this.crouchBlend * 0.04; b.rotation.order = 'YXZ'; b.rotation.y = this.bodyYaw;
    const full = this.tp > 0.3; J.head.visible = full; J.armL.visible = J.armR.visible = full;   // first person uses the viewmodel arms
    const gun = G.hand; let arms = 'relaxed'; if (gun) arms = this.gunUp > 0.5 ? 'gun' : 'lowgun'; else if (this.leaning) arms = 'wallhands';
    animateHuman(b, { phase: Math.PI * 2 * this.gait, speed: speed / 4.4, crouch: this.crouchBlend, arms, aim: this.gunUp, pitch: -this.pitch * 0.7, idleT: G.time, look: -this.pitch });
    if (this.beam.visible && !gun) { J.armR.rotation.x = 1.3; J.elbowR.rotation.x = 0.3; }
    b.rotation.z = 0; b.rotation.x = 0;
    if (this.lean > 0.01) { const L = this.lean; if (this.leanKind === 'right') b.rotation.z = -0.16 * L; else if (this.leanKind === 'left') b.rotation.z = 0.16 * L; else if (this.leanKind === 'back') { J.spine.rotation.x += 0.1 * L; J.legR.rotation.x -= 0.5 * L; J.kneeR.rotation.x -= 0.6 * L; } else J.spine.rotation.x -= 0.2 * L; J.legR.rotation.z -= 0.08 * L; }
    if (gun && (this.bodyGunId !== gun.id || this.bodyGunVer !== ASSET.version)) { this.bodyGunVer = ASSET.version; if (this.bodyGunMesh) this.bodyGunMesh.parent && this.bodyGunMesh.parent.remove(this.bodyGunMesh); this.bodyGunMesh = GUN_ATTACH(gunMesh(gun.id)); J.handR.add(this.bodyGunMesh); this.bodyGunId = gun.id; }
    else if (!gun && this.bodyGunMesh) { this.bodyGunMesh.parent && this.bodyGunMesh.parent.remove(this.bodyGunMesh); this.bodyGunMesh = null; this.bodyGunId = null; }
    // the backpack: on the shoulder, or lowered to the floor in front of you
    this.pack3.visible = this.packT < 0.04; this.syncPack3();
    const pm = this.packMesh; pm.visible = this.packT > 0.02 && !this.packHidden;
    if (this.packT > 0.02) {
      const t = this.packT, e = t * t * (3 - 2 * t); const f = new THREE.Vector3(-Math.sin(this.bodyYaw), 0, -Math.cos(this.bodyYaw)), rt = new THREE.Vector3(Math.cos(this.bodyYaw), 0, -Math.sin(this.bodyYaw));
      const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z).addScaledVector(f, -0.22); const gy = this.surf.heightAt(this.pos.x + f.x, this.pos.z + f.z);
      const to = new THREE.Vector3(this.pos.x, Math.max(gy, this.pos.y) + 0.2, this.pos.z).addScaledVector(f, 0.95).addScaledVector(rt, 0.1);
      this.packFloor = { x: to.x, y: Math.max(gy, this.pos.y) + 0.02, z: to.z, yaw: this.bodyYaw };
      pm.position.copy(from).lerp(to, e); pm.position.y += Math.sin(e * Math.PI) * 0.5; pm.rotation.set(-Math.PI / 2 * e, this.bodyYaw + (1 - e) * 0.0, 0, 'YXZ');
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) { const im = this.impacts[i]; im.t -= dt; im.m.material.opacity = im.t * 4; if (im.t <= 0) { this.scene.remove(im.m); this.impacts.splice(i, 1); } }
  }
  applyOutfitColors() { const o = G.outfit; if (!o) return; this.sleeve.color.set(o.top ? o.top.color : this.look.skin); }
  wear(outfit) { G.outfit = JSON.parse(JSON.stringify(outfit)); setOutfit(this.body, G.outfit); this.applyOutfitColors(); }
  syncPack3() {
    const sig = G.pack.sides.map(s => s ? s.id : '-').join(',') + G.pack.tier + ASSET.version; if (sig === this._packSig) return; this._packSig = sig;
    const sides = this.pack3.userData.sides; sides.forEach(s => s.clear());
    G.pack.sides.forEach((g, i) => { if (!g) return; const m = gunMesh(g.id); m.rotation.set(Math.PI / 2 + 0.1, 0, 0); m.rotation.y = 0; m.scale.setScalar(0.9); m.position.y = -0.1; sides[i].add(m); });
    this.pack3.scale.setScalar(1.35 + G.pack.tier * 0.08);
  }
}

let ctxDie = null; export function onDeath(fn) { ctxDie = fn; }
function THREE_move(a, b, d) { return a < b ? Math.min(b, a + d) : Math.max(b, a - d); }
