// Space: system scene, ship flight, spaceways (lanes), traffic, police and the law
import * as THREE from '../vendor/three.module.js';
import { makeSpaceDome } from './starfield.js';
import { rng, clamp, damp, fmt } from './util.js';
import { In } from './input.js';
import { G, toast, lvl, xp } from './state.js';
import { buildPlanet, buildPlayerShip, buildSquadCar, buildFreighter } from './models.js';

const CRUISE = 520, BOOST = 1150, LANE_MULT = 3.6;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Space {
  constructor(camera, hooks) {
    this.camera = camera; this.hooks = hooks; this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    this.ship = { pos: V(), quat: new THREE.Quaternion(), speed: 0, throttle: 0.3, boost: false, roll: 0 };
    this.model = buildPlayerShip(); this.scene.add(this.model);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.hud = {}; this.bolts = []; this.cops = []; this.traffic = []; this.cockpit = false;
    this.law = { state: 'none', offences: {}, maxSpeed: 0, warn: 0, hailT: 0, fightT: 0, lost: 0 };
    this.scene.add(new THREE.AmbientLight(0x6070a0, 0.55));
    this.sunLight = new THREE.PointLight(0xffffff, 3.2, 0, 0); this.scene.add(this.sunLight);
    this._mkStars(); this._mkStreaks();
    this.boltGeo = new THREE.BoxGeometry(0.6, 0.6, 14);
    this.disabled = false;
  }
  _mkStars() {
    // single camera-locked dome (stars + nebula) shared with sky.js; `stars` kept as an inert alias for older callers
    this.neb = makeSpaceDome(); this.scene.add(this.neb); this.stars = new THREE.Object3D();
  }
  _mkStreaks() {
    this.nStreak = 260; const g = new THREE.BufferGeometry(); this.streakPos = new Float32Array(this.nStreak * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    this.streakP = Array.from({ length: this.nStreak }, () => V((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 160, -Math.random() * 600));
    this.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaad8ff, transparent: true, opacity: 0.6, depthWrite: false }));
    this.streaks.frustumCulled = false; this.scene.add(this.streaks);
  }

  enter(sys, opts = {}) {
    this.sys = sys; this.root.clear(); this.cops.forEach(c => this.scene.remove(c.m)); this.cops = []; this.bolts.forEach(b => this.scene.remove(b.m)); this.bolts = [];
    this.traffic.forEach(t => this.scene.remove(t.m));
    this.traffic = []; this.planetObjs = []; this.lanes = [];
    this.law = { state: 'none', offences: {}, maxSpeed: 0, warn: 0, hailT: 0, fightT: 0, lost: 0 }; G.heat = Math.min(G.heat, G.bounty > 0 ? 25 : 0);
    const star = new THREE.Mesh(new THREE.SphereGeometry(sys.star.s, 32, 16), new THREE.MeshBasicMaterial({ color: sys.star.c })); this.root.add(star);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: sys.star.c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); glow.scale.setScalar(sys.star.s * 9); this.root.add(glow);
    this.sunLight.color.set(sys.star.c);
    this.neb.material.uniforms.c1.value.setHSL((sys.seed % 360) / 360, 0.6, 0.3); this.neb.material.uniforms.c2.value.setHSL(((sys.seed >> 4) % 360) / 360, 0.6, 0.25);
    sys.planets.forEach(p => {
      const b = buildPlanet(p); b.group.position.set(...p.pos); this.root.add(b.group);
      this.planetObjs.push({ p, g: b.group, collR: b.collR, pos: V(...p.pos) });
      if (p.settled) { const lbl = labelSprite(p.name); lbl.position.set(p.pos[0], p.pos[1] + p.radius * 1.5 + 200, p.pos[2]); lbl.scale.multiplyScalar(Math.max(500, p.radius * 0.8)); this.root.add(lbl); }
    });
    sys.lanes.forEach((l, li) => {
      const A = this.planetObjs[l.a], B = this.planetObjs[l.b]; const d = B.pos.clone().sub(A.pos); d.normalize();
      const a = A.pos.clone().addScaledVector(d, A.collR * 2.4 + 1500), b = B.pos.clone().addScaledVector(d, -(B.collR * 2.4 + 1500));
      const len = a.distanceTo(b); const lane = { a, b, d, len, limit: l.limit, name: `${A.p.name} — ${B.p.name}`, idx: li };
      this.lanes.push(lane);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, len, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x37e6c9, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
      tube.position.copy(a).add(b).multiplyScalar(0.5); tube.quaternion.setFromUnitVectors(V(0, 1, 0), d); this.root.add(tube);
      const gm = new THREE.MeshBasicMaterial({ color: 0x37e6c9 });
      for (let t = 0; t <= len; t += 3500) {
        const gate = new THREE.Mesh(new THREE.TorusGeometry(380, 9, 8, 40), gm); gate.position.copy(a).addScaledVector(d, t); gate.quaternion.setFromUnitVectors(V(0, 0, 1), d); this.root.add(gate);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(260, 70), new THREE.MeshBasicMaterial({ map: signTex(`LIMIT ${l.limit}`), transparent: true, side: THREE.DoubleSide })); sign.position.copy(gate.position).add(V(0, 330, 0)); sign.lookAt(sign.position.clone().add(d)); this.root.add(sign);
      }
    });
    const r = rng(sys.seed ^ 0xabc);
    for (let i = 0; i < Math.min(10, this.lanes.length * 2 + 2); i++) {
      const lane = this.lanes[i % this.lanes.length]; const m = buildFreighter(r.int(1, 99999)); this.scene.add(m);
      this.traffic.push({ m, lane, t: r() * lane.len, dir: r.chance(0.5) ? 1 : -1, speed: r.range(900, 1700), off: V(r.range(-90, 90), r.range(-60, 60), 0) });
    }
    const pi = opts.planetIndex ?? 0; const po = this.planetObjs[pi];
    const out = po.pos.clone().normalize(); if (!isFinite(out.x) || out.lengthSq() < 0.1) out.set(1, 0, 0);
    this.ship.pos.copy(po.pos).addScaledVector(out, po.collR * 1.3 + 700);
    const m = new THREE.Matrix4().lookAt(V(), out.clone().negate(), V(0, 1, 0)); this.ship.quat.setFromRotationMatrix(m);
    this.ship.quat.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));   // face away from the planet
    this.ship.speed = 40; this.ship.throttle = 0.12; this.lastPlanet = pi; this.camera.position.copy(this.ship.pos).add(V(0, 8, 30));
    this.disabled = false; this.entering = false;
  }
  // coming back up out of an atmosphere: appear above the planet on the side we left from
  reenter(sys, planetIndex, outDir) {
    this.enter(sys, { planetIndex }); const po = this.planetObjs[planetIndex]; const H = clamp(po.collR * 0.35 + 600, 1500, 5000); const s = this.ship;
    s.pos.copy(po.pos).addScaledVector(outDir, po.collR + H * 1.12);
    s.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(V(), outDir.clone().negate(), V(0, 1, 0))); s.quat.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
    s.speed = 180; s.throttle = 0.3; this.camera.position.copy(s.pos).add(V(0, 8, 30));
  }

  forward() { return V(0, 0, -1).applyQuaternion(this.ship.quat); }

  update(dt, active) {
    const s = this.ship, sys = this.sys; if (!sys) return;
    const H = this.hud; const prevLaneIdx = this.inLane ? this.inLane.idx : -1;
    G.time += dt;
    if (active && !this.disabled && this.law.state !== 'pulled') {
      const look = In.take(); const sens = 0.0021;
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-look.y * sens, -look.x * sens, 0, 'YXZ'));
      s.quat.multiply(rot);
      s.roll = damp(s.roll, -In.move.x, 6, dt);
      s.quat.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), s.roll * 1.4 * dt)).normalize();
      s.throttle = clamp(s.throttle - In.move.y * 0.55 * dt, 0, 1);
      s.boost = !!In.down.sprint && G.fuel > 0;
      if (In.down.jump) { s.throttle = Math.max(0, s.throttle - 1.4 * dt); s.speed *= (1 - 1.2 * dt); }
    } else { In.take(); if (this.law.state === 'pulled') s.throttle = 0; }
    const lane = this.findLane(); this.inLane = lane;
    if ((lane ? lane.idx : -1) !== prevLaneIdx) toast(lane ? `Spaceway: ${lane.name} (limit ${lane.limit})` : 'Left the spaceway', lane ? 'good' : '');
    const coil = G.ship.coils;
    const mult = lane ? LANE_MULT + coil * 0.15 : 1;
    const noFuel = G.fuel <= 0; const max = (s.boost ? BOOST : CRUISE) * mult;
    const target = (noFuel ? Math.min(s.throttle, 0.1) : s.throttle) * max * (this.disabled ? 0 : 1);
    s.speed = damp(s.speed, target, s.boost ? 0.9 : 0.6, dt);
    const fwd = this.forward();
    if (lane) {   // spaceway grip: gently centres you on the lane axis
      const along = s.pos.clone().sub(lane.a).dot(lane.d); const closest = lane.a.clone().addScaledVector(lane.d, along);
      s.pos.lerp(closest, 1 - Math.exp(-0.35 * dt));
    }
    s.pos.addScaledVector(fwd, s.speed * dt);
    const burn = (0.1 + 0.5 * Math.abs(s.speed) / 1000) * (lane ? 0.4 - 0.04 * coil : 1) * (s.boost ? 1.8 : 1);
    if (!this.disabled && G.fuel > 0) G.fuel = Math.max(0, G.fuel - burn * dt / (1 + G.ship.tank * 0.25));
    if (G.fuel <= 0 && !this._warnedFuel) { toast('Out of fuel — drifting on emergency thrusters.', 'warn'); this._warnedFuel = true; }
    if (G.fuel > 5) this._warnedFuel = false;
    let near = null, nd = Infinity;
    for (const po of this.planetObjs) {
      po.g.rotation.y += po.p.spin * dt;
      const d = s.pos.distanceTo(po.pos); const alt = d - po.collR;
      if (alt < nd) { nd = alt; near = po; }
      if (d < po.collR + 14 && po.p.shape !== 'ringworld' && po.p.shape !== 'donut') {
        const n = s.pos.clone().sub(po.pos).normalize(); s.pos.copy(po.pos).addScaledVector(n, po.collR + 15);
        if (s.speed > 120) { const dmg = Math.min(60, s.speed / 25); G.hull -= dmg; toast(`Hull strike! −${dmg | 0}`, 'warn'); this.addOffence('reckless', 'crash', 20); }
        s.speed *= 0.1;
      }
      const key = sys.index + ':' + po.p.i;
      if (alt < po.collR * 2 + 2500 && !G.visited[key]) {
        G.visited[key] = 1; G.charted++; const bonus = Math.round((60 + po.p.radius / 18) * (sys.uncharted ? 2 : 1)); G.credits += bonus;
        toast(`Charted ${po.p.name} — ${po.p.kind}, ${po.p.shape}. +${bonus} cr`, 'good'); xp('piloting', 6);
      }
    }
    this.near = near; this.nearAlt = nd;
    const atmoH = near ? clamp(near.collR * 0.35 + 600, 1500, 5000) : 0; this.atmoH = atmoH;
    if (near && nd < atmoH * 1.8) s.speed = Math.min(s.speed, Math.max(300, nd * 0.45));   // atmosphere drag
    const canLand = !!near && nd < atmoH * 1.8;
    if (!this.entering && !this.disabled && near && (nd < atmoH * 0.6 || (active && In.pressed.land && nd < atmoH * 1.8))) { this.entering = true; this.hooks.land(near.p, s.pos.clone().sub(near.pos).normalize(), this.forward()); }
    else if (active && In.pressed.land && !this.disabled && !this.entering) toast('Fly toward a planet to enter its atmosphere.', 'warn');
    const speed = Math.abs(s.speed); const limit = lane ? lane.limit : null;
    if (lane && speed > limit * 1.04) { this.law.maxSpeed = Math.max(this.law.maxSpeed, speed); this.addOffence('speeding', { limit, speed }, (speed / limit - 1) * 10 * dt); }
    G.heat = Math.max(0, G.heat - (this.law.state === 'none' || this.law.state === 'dispatched' ? 1.6 : 0.4) * dt);
    this.updateTraffic(dt); this.updateBolts(dt, active); this.updateLaw(dt);
    if (G.hull <= 0 && !this.disabled) { this.disabled = true; G.hull = 0; this.hooks.disabled && this.hooks.disabled(); }
    this.model.position.copy(s.pos); this.model.quaternion.copy(s.quat);
    this.model.rotateZ(-s.roll * 0.35); this.model.visible = !this.cockpit;
    this.model.traverse(o => { if (o.name === 'flame') o.scale.set(1, 1 + clamp(s.speed / 600, 0, 3) * (0.8 + Math.random() * 0.4), 1); });
    this.updateCamera(dt); this.updateStreaks(dt);
    this.neb.position.copy(this.camera.position);   // locked to the camera AFTER it moves, so the sky never swims
    Object.assign(H, {
      speed, limit, inLane: lane, fuel: G.fuel, hull: G.hull, throttle: s.throttle, boost: s.boost, nearName: near ? near.p.name : '', alt: nd, canLand,
      nearKind: near ? `${near.p.kind} ${near.p.shape}` : '', settled: !!(near && near.p.settled), heat: G.heat, law: this.law.state, cops: this.cops.length, disabled: this.disabled,
    });
  }

  findLane() {
    const p = this.ship.pos;
    for (const l of this.lanes) {
      const t = p.clone().sub(l.a).dot(l.d); if (t < -200 || t > l.len + 200) continue;
      if (p.distanceTo(l.a.clone().addScaledVector(l.d, t)) < 420) return l;
    }
    return null;
  }

  addOffence(kind, info, heat) {
    const o = this.law.offences;
    if (kind === 'speeding') { o.speeding = 1; o.speedInfo = info; } else o[kind] = (o[kind] || 0) + 1;
    if (heat) G.heat = Math.min(100, G.heat + heat);
  }

  updateTraffic(dt) {
    const p = this.ship.pos;
    for (const t of this.traffic) {
      t.t += t.dir * t.speed * dt; if (t.t < 0 || t.t > t.lane.len) { t.dir *= -1; t.t = clamp(t.t, 0, t.lane.len); }
      const pos = t.lane.a.clone().addScaledVector(t.lane.d, t.t).add(t.off); t.m.position.copy(pos);
      t.m.quaternion.setFromUnitVectors(V(0, 0, -1), t.lane.d.clone().multiplyScalar(t.dir));
      const d = pos.distanceTo(p);
      if (d < 18 && !t.hit) { t.hit = 3; G.hull -= 18; toast('Collision with civilian traffic!', 'warn'); this.addOffence('reckless', 'collision', 35); this.ship.speed *= 0.5; }
      else if (d < 110 && Math.abs(this.ship.speed) > 700 && !t.near) { t.near = 4; toast('Near miss — reckless flying.', 'warn'); this.addOffence('reckless', 'near miss', 14); xp('piloting', 2); }
      if (t.hit) t.hit -= dt; if (t.near) t.near -= dt;
    }
  }

  spawnCop(n = 0) {
    const m = buildSquadCar(); this.scene.add(m); const back = this.forward().negate();
    m.position.copy(this.ship.pos).addScaledVector(back, 3800 + n * 400).add(V(n * 200 - 100, 120, 0));
    const c = { m, hp: 70, fire: 1.5 + n, id: 'RR-' + (900 + n * 7 + Math.floor(Math.random() * 50)) };
    this.cops.push(c); return c;
  }

  updateLaw(dt) {
    const L = this.law, s = this.ship;
    if (L.state === 'none' && G.heat >= 38 && !this.disabled) { L.state = 'dispatched'; this.spawnCop(0); toast('You were reported. A cruiser is on your tail.', 'warn'); }
    for (const c of this.cops) {
      const fwd = this.forward(); const d = c.m.position.distanceTo(s.pos);
      const wantPos = s.pos.clone().addScaledVector(fwd, L.state === 'pulled' ? -10 : -140).add(V(L.state === 'pulled' ? 40 : 0, 20, 0));
      if (L.state === 'fight' || L.state === 'chase') wantPos.add(V(Math.sin(G.time * 0.7 + c.fire) * 220, Math.cos(G.time * 0.5) * 100, Math.cos(G.time * 0.6) * 200));
      const to = wantPos.sub(c.m.position); const dist = to.length();
      const sp = clamp(dist * 1.6 + Math.abs(s.speed), 0, 6000);
      c.m.position.addScaledVector(to.normalize(), Math.min(dist, sp * dt));
      const aim = (L.state === 'chase' || L.state === 'fight') ? s.pos.clone().sub(c.m.position) : fwd.clone();
      const look = new THREE.Matrix4().lookAt(V(), aim.normalize().negate(), V(0, 1, 0));
      c.m.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(look), 1 - Math.exp(-4 * dt));
      const li = c.m.userData.lights; const blink = Math.floor(G.time * 6) % 2;
      li.red.visible = !!blink; li.blue.visible = !blink; li.rl.intensity = blink ? 6 : 0; li.bl.intensity = blink ? 0 : 6;
      if ((L.state === 'chase' || L.state === 'fight') && d < 3000) {
        c.fire -= dt; if (c.fire <= 0) { c.fire = 0.9 + Math.random() * 0.8; this.fireBolt(c.m.position, s.pos.clone().add(V((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0)), false); }
      }
    }
    const cop = this.cops[0];
    if (L.state === 'dispatched' && cop && cop.m.position.distanceTo(s.pos) < 420) this.startHail();
    if (L.state === 'hailing') {
      L.hailT += dt; if (L.hailT > 14) { L.warn++; L.hailT = 0; this.hooks.closeHail(); if (L.warn >= 2) this.beginChase('ignored the hail'); else { toast('"Pull over now!"', 'warn'); this.startHail(true); } }
    }
    if (L.state === 'chase' || L.state === 'fight') {
      L.fightT += dt;
      if (this.cops.length && L.fightT > 18 && this.cops.length < 3 && G.heat > 55) { L.fightT = 0; this.spawnCop(this.cops.length); toast('Backup cruiser inbound.', 'warn'); }
      G.heat = Math.max(G.heat, 55);
      if (this.cops.length && this.cops.every(c => c.m.position.distanceTo(s.pos) > 7000)) { L.lost += dt; if (L.lost > 8) this.endLaw('You lost them. The warrant stays on file.', true); } else L.lost = 0;
      if (!this.cops.length && L.state !== 'none') this.endLaw('All cruisers down. Dispatch will send more… eventually.', true);
    }
  }

  offenceSummary() {
    const o = this.law.offences; const parts = []; let fine = 0;
    if (o.speeding) { const i = o.speedInfo || {}; const over = Math.max(0, this.law.maxSpeed - (i.limit || 2000)); parts.push(`speeding — clocked at ${fmt(this.law.maxSpeed)} in a ${fmt(i.limit || 2000)} zone`); fine += 60 + over * 0.12; }
    if (o.reckless) { parts.push(`reckless flying ×${o.reckless}`); fine += 90 * Math.min(4, o.reckless); }
    if (o.weapons) { parts.push('weapons discharge near a spaceway'); fine += 250; }
    if (!parts.length) { parts.push('a report of dangerous flying'); fine += 80; }
    return { text: parts.join('; '), fine: Math.round(fine + G.bounty) };
  }

  startHail(repeat) {
    const L = this.law; L.state = 'hailing'; L.hailT = 0; const cop = this.cops[0]; const sum = this.offenceSummary();
    const severe = G.heat >= 80 || G.bounty >= 500; const unit = cop ? cop.id : 'RR-911';
    if (severe) {
      this.hooks.hail({
        unit, title: 'ARREST WARRANT', text: `"Ship, this is Rimway Patrol ${unit}. You are wanted for ${sum.text}. Cut your engines and surrender, or we will use force."`,
        options: [{ label: 'Surrender — go to holding', fn: () => this.arrest('surrendered') }, { label: 'Fight it out', fn: () => this.beginChase('resisted arrest', true) }, { label: 'Run for it', fn: () => this.beginChase('fled arrest') }]
      }); return;
    }
    this.hooks.hail({
      unit, title: repeat ? 'SECOND WARNING' : 'PATROL HAIL', text: `"Attention vessel, this is Rimway Highway Patrol ${unit}. You've been reported for ${sum.text}. Cut your engines and stand by to be fined — ${fmt(sum.fine)} credits."`,
      options: [
        { label: `Comply — pay the fine (${fmt(sum.fine)} cr)`, fn: () => this.payFine(sum.fine) },
        { label: `Talk your way out (speech ${lvl('speech')})`, fn: () => this.talkOut(sum.fine) },
        { label: `Offer a bribe (${fmt(sum.fine * 2)} cr)`, fn: () => this.bribe(sum.fine * 2) },
        { label: 'Ignore them', fn: () => { this.hooks.closeHail(); L.state = 'hailing'; L.hailT = 8; toast('You keep flying. The siren gets louder.', 'warn'); } },
        { label: 'Floor it!', fn: () => this.beginChase('fled a stop') },
      ]
    });
  }
  settle(note) { this.law.offences = {}; this.law.maxSpeed = 0; this.law.state = 'pulled'; this.hooks.closeHail(); G.heat = 0; G.bounty = 0; toast(note, 'good'); setTimeout(() => this.endLaw(), 3500); }
  payFine(fine) {
    if (G.credits >= fine) { G.credits -= fine; this.settle(`Fine paid: ${fmt(fine)} cr. "Drive safe, runner."`); }
    else { this.hooks.closeHail(); toast('Can\'t cover the fine. "Then you\'re coming with me."', 'warn'); this.arrest('could not pay'); }
  }
  talkOut(fine) {
    const chance = 0.2 + lvl('speech') * 0.07; xp('speech', 10);
    if (Math.random() < chance) { const f = Math.round(fine * 0.4); if (G.credits >= f) { G.credits -= f; this.settle(`You talked them down to ${fmt(f)} cr.`); } else this.arrest('could not pay'); }
    else { G.heat += 15; this.hooks.closeHail(); toast('"Nice try." The fine goes up.', 'warn'); this.law.offences.reckless = (this.law.offences.reckless || 0) + 1; this.startHail(true); }
  }
  bribe(amt) {
    if (G.credits < amt) { toast('You can\'t afford that bribe.', 'warn'); return; }
    G.credits -= amt;
    if (Math.random() < 0.45 + lvl('speech') * 0.03) this.settle('"I never saw you." The report disappears.');
    else { this.hooks.closeHail(); toast('"Bribing an officer?" That earns you an arrest.', 'warn'); G.bounty += 300; this.arrest('attempted bribery'); }
  }
  beginChase(reason, fight) {
    const L = this.law; L.state = fight ? 'fight' : 'chase'; L.fightT = 0; G.bounty += 250; G.heat = Math.max(G.heat, 70); this.hooks.closeHail();
    toast(`You ${reason}. Cruisers are weapons-free!`, 'warn'); if (this.cops.length < 2) this.spawnCop(1);
  }
  arrest(reason) {
    this.hooks.closeHail(); const fee = Math.round(120 + G.bounty * 0.5 + Math.min(400, G.heat * 4));
    const sentence = 25 + Math.min(60, Math.round(G.heat / 2)); this.endLaw(null, false);
    this.hooks.jail({ reason, fee, sentence });
  }
  endLaw(msg, keepBounty) {
    this.cops.forEach(c => this.scene.remove(c.m)); this.cops = []; this.law = { state: 'none', offences: {}, maxSpeed: 0, warn: 0, hailT: 0, fightT: 0, lost: 0 };
    if (msg) toast(msg, ''); G.heat = keepBounty ? 30 : 0;
  }

  fireBolt(from, to, friendly) {
    const m = new THREE.Mesh(this.boltGeo, new THREE.MeshBasicMaterial({ color: friendly ? 0x7dffb0 : 0xff4d4d })); m.position.copy(from); this.scene.add(m);
    const dir = to.clone().sub(from).normalize(); m.quaternion.setFromUnitVectors(V(0, 0, -1), dir);
    this.bolts.push({ m, vel: dir.multiplyScalar(5200), life: 1.6, friendly });
  }
  updateBolts(dt, active) {
    const s = this.ship; this._fireCd = (this._fireCd || 0) - dt;
    if (active && In.down.fire && this._fireCd <= 0 && !this.disabled && this.law.state !== 'pulled') {
      this._fireCd = 0.14; const fw = this.forward(); In.haptic.shot(0.2);
      this.fireBolt(s.pos.clone().addScaledVector(fw, 14), s.pos.clone().addScaledVector(fw, 4000), true);
      if ((this.inLane || (this.near && this.nearAlt < 8000)) && !this._weap) { this._weap = 4; toast('Weapons discharge near a spaceway is reported.', 'warn'); this.addOffence('weapons', 'discharge', 28); }
    }
    if (this._weap) this._weap = Math.max(0, this._weap - dt);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.m.position.addScaledVector(b.vel, dt); b.life -= dt; let dead = b.life <= 0;
      if (b.friendly) for (const c of this.cops) if (b.m.position.distanceTo(c.m.position) < 14) {
        c.hp -= 25; dead = true; if (this.law.state === 'dispatched' || this.law.state === 'hailing') this.beginChase('opened fire on a cruiser', true);
        if (c.hp <= 0) { this.scene.remove(c.m); this.cops.splice(this.cops.indexOf(c), 1); G.bounty += 400; toast('Cruiser destroyed. Bounty +400.', 'warn'); } break;
      }
      if (!b.friendly && b.m.position.distanceTo(s.pos) < 10) { G.hull -= 7; dead = true; this.camShake = 0.5; toast('Taking fire!', 'warn'); }
      if (dead) { this.scene.remove(b.m); this.bolts.splice(i, 1); }
    }
  }

  updateCamera(dt) {
    const s = this.ship, cam = this.camera; const sp = clamp(Math.abs(s.speed) / 2500, 0, 1);
    cam.fov = damp(cam.fov, 68 + sp * 38 + (s.boost ? 6 : 0), 4, dt); cam.updateProjectionMatrix();
    this.camShake = Math.max(0, (this.camShake || 0) - dt * 2);
    if (this.cockpit) { cam.position.copy(s.pos).add(V(0, 1.5, -3).applyQuaternion(s.quat)); cam.quaternion.copy(s.quat); }
    else {
      const want = s.pos.clone().add(V(0, 7 + sp * 2, 30 + sp * 20).applyQuaternion(s.quat));
      cam.position.lerp(want, 1 - Math.exp(-9 * dt)); cam.quaternion.slerp(s.quat, 1 - Math.exp(-8 * dt));
    }
    if (this.camShake) cam.position.add(V(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(this.camShake * 2));
  }
  updateStreaks(dt) {
    const s = this.ship, speed = s.speed, len = clamp(Math.abs(speed) * 0.02, 0.2, 90); const pa = this.streakPos;
    this.streaks.material.opacity = clamp(Math.abs(speed) / 700, 0, 0.7);
    for (let i = 0; i < this.nStreak; i++) {
      const p = this.streakP[i]; p.z += speed * dt * 0.9; if (p.z > 60) p.set((Math.random() - 0.5) * 260, (Math.random() - 0.5) * 160, -560);
      const a = p.clone().applyQuaternion(s.quat).add(s.pos); const b = V(0, 0, len).applyQuaternion(s.quat).add(a);
      pa.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
  }
}

let _g;
function glowTex() {
  if (_g) return _g; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return _g = new THREE.CanvasTexture(c);
}
function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d'); x.font = 'bold 54px sans-serif'; x.fillStyle = '#9fe8ff'; x.textAlign = 'center'; x.fillText('◆ ' + text, 256, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); sp.scale.set(5, 1, 1); return sp;
}
function signTex(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 70; const x = c.getContext('2d'); x.fillStyle = '#10181c'; x.fillRect(0, 0, 256, 70); x.strokeStyle = '#37e6c9'; x.lineWidth = 5; x.strokeRect(3, 3, 250, 64);
  x.fillStyle = '#37e6c9'; x.font = 'bold 38px monospace'; x.textAlign = 'center'; x.fillText(text, 128, 48); return new THREE.CanvasTexture(c);
}
