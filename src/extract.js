// Extraction mode: the derelict you board (ExtractShip), the machines and crews on it, the ship-AI director, and the between-ship meta game.
import * as THREE from '../vendor/three.module.js';
import { Surface } from './surface.js';
import { G, toast, addItem, addGun, count, removeItem, newPack, uid } from './state.js';
import { ITEMS, GUN } from './data.js';
import { rng, clamp } from './util.js';
import { generateShip, pickContract, classesFor, CLASSES, CORPS, isVault, ROOM_LABEL } from './ships.js';
import { buildShip, makeContainer, CONT } from './shipbuild.js';
import { buildHuman, makeLook, OUTFITS, animateHuman } from './people.js';
import { sfx } from './audio.js';
import { Nav } from './nav.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const ARMOR = [{ n: 'No armor', red: 0, cost: 0 }, { n: 'Weave vest', red: 0.2, cost: 450 }, { n: 'Plated vest', red: 0.38, cost: 1400 }, { n: 'Combat rig', red: 0.55, cost: 3400 }];

// ---------------------------------------------------------------- persistent meta ----------------------------------------------------------------
const KEY = 'rimrunner_extract_v1';
export const SHOP_GUNS = [['pistol', 0, 0], ['coach', 220, 0], ['hpistol', 300, 0], ['shotgun', 380, 1], ['breacher', 560, 2], ['rifle', 420, 2], ['pulsepistol', 700, 3], ['pulsecarbine', 1200, 4], ['arc', 1400, 5], ['scatter', 1500, 5], ['railrifle', 2600, 7]];
export const SHOP_KIT = [['ammo', 12], ['medkit', 40], ['stimpack', 70], ['ration', 8], ['water', 6], ['antenna', 40]];
export const KEEP = new Set(['ammo', 'medkit', 'stimpack', 'ration', 'water', 'o2_tank', 'antenna']);
export const STORY = [
  { id: 'deadair', title: 'Dead Air', blurb: 'A Halcyon relay station went silent. Recover its black-box core and the police scanner crystal inside.', classId: 'server_m', corpId: 'halcyon', requires: 1, reward: 900, unlocks: 'radio' },
];
export const Meta = {
  credits: 200, chain: 0, best: 0, runs: 0, extracted: 0, deaths: 0, owned: ['pistol'], primary: 'pistol', armor: 0, kit: { ammo: 4, medkit: 1, ration: 1, water: 1, antenna: 1 }, radio: false, story: {}, last: null, offers: null, stash: 0,
};
export function metaLoad() { try { Object.assign(Meta, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {} }
export function metaSave() { try { localStorage.setItem(KEY, JSON.stringify(Meta)); } catch (e) {} }
export function metaReset() { localStorage.removeItem(KEY); Object.assign(Meta, { credits: 200, chain: 0, best: 0, runs: 0, extracted: 0, deaths: 0, owned: ['pistol'], primary: 'pistol', armor: 0, kit: { ammo: 4, medkit: 1, ration: 1, water: 1, antenna: 1 }, radio: false, story: {}, last: null, offers: null }); metaSave(); }
export function makeOffers() {
  const r = rng((Date.now() ^ (Meta.runs * 7919)) >>> 0), out = [];
  let ids = classesFor(Meta.best); if (Meta.radio) ids = [...new Set([...ids, 'armory_m', 'prison_m'])];
  for (let i = 0; i < 3; i++) { const classId = r.pick(ids); out.push(pickContract(r.int(1, 1e9), Meta.chain, { classId })); }
  for (const s of STORY) if (!Meta.story[s.id] && Meta.best >= s.requires) out.push({ ...pickContract(1000 + s.id.length * 77, Meta.chain, { classId: s.classId, corpId: s.corpId }), story: s });
  if (Meta.radio) out.forEach(o => { const f = CLASSES[o.classId].family; if (f === 'armory' || f === 'prison') o.radio = f === 'prison' ? 'break-out' : 'break-in'; });
  return out;
}

// ---------------------------------------------------------------- enemies ----------------------------------------------------------------
// Everything data-defined: add a row and a variant exists. weapon.kind: gun | taser | rocket.
export const ENEMY = {
  drone:    { name: 'Taser Drone', fly: true, hp: 42, armor: 0, speed: 5.4, prefer: 3.2, sight: 20, color: 0xc9d0d8, glow: 0x55c8ff, weapon: { kind: 'taser', dmg: 6, stun: 1.4, rate: 2.6, range: 4.6, acc: 0.9, wind: 0.55 } },
  walker:   { name: 'Security Walker', hp: 130, armor: 0.35, speed: 2.7, prefer: 13, sight: 26, color: 0x5a6068, glow: 0xff3b3b, weapon: { kind: 'gun', dmg: 9, rate: 0.5, burst: 3, gap: 2.0, range: 40, acc: 0.55 } },
  lmg:      { name: 'LMG Walker', hp: 210, armor: 0.42, speed: 2.0, prefer: 14, sight: 26, size: 1.12, color: 0x4a4f56, glow: 0xff7a1a, weapon: { kind: 'gun', dmg: 5, rate: 0.09, burst: 15, gap: 2.4, range: 36, acc: 0.38 } },
  wrist:    { name: 'Wristgun Runner', hp: 85, armor: 0.2, speed: 4.4, prefer: 7, sight: 24, size: 0.92, color: 0x6a5a58, glow: 0xffd23f, weapon: { kind: 'gun', dmg: 6, rate: 0.22, burst: 4, gap: 1.2, range: 18, acc: 0.6 } },
  rocketeer: { name: 'Rocket Walker', hp: 160, armor: 0.35, speed: 2.2, prefer: 18, sight: 30, size: 1.08, color: 0x6a4a3a, glow: 0xff4a1a, weapon: { kind: 'rocket', dmg: 46, splash: 3.4, rate: 3.6, range: 46, proj: 15, acc: 1 } },
  soldier:  { name: 'Corp Marine', human: true, outfit: 'guard', hp: 100, armor: 0.3, speed: 3.3, prefer: 14, sight: 28, weapon: { kind: 'gun', dmg: 8, rate: 0.42, burst: 3, gap: 1.7, range: 40, acc: 0.55 } },
  gunner:   { name: 'Marine Gunner', human: true, outfit: 'guard', hp: 120, armor: 0.35, speed: 2.7, prefer: 14, sight: 28, weapon: { kind: 'gun', dmg: 5, rate: 0.09, burst: 12, gap: 2.2, range: 34, acc: 0.4 } },
  rival:    { name: 'Rival Runner', human: true, outfit: 'ranger', hp: 90, armor: 0.12, speed: 3.6, prefer: 11, sight: 26, weapon: { kind: 'gun', dmg: 10, rate: 0.4, burst: 3, gap: 1.5, range: 36, acc: 0.5 } },
};
// nutjob programming: mix and match chassis, motion and weapon
const NUT_NAMES = ['SCRAPPER-9', 'HAPPY-FEET', 'MR. BOOM', 'LULLABY', 'DEAD-EYE DAN', 'TWITCH', 'AUNT MAGDA', 'LOOP-DE-LOOP'];
export function nutjob(r) {
  const base = ENEMY[r.pick(['wrist', 'walker', 'drone', 'rocketeer'])];
  const w = r.pick([{ kind: 'gun', dmg: 4, rate: 0.07, burst: 24, gap: 1.6, range: 30, acc: 0.35 }, { kind: 'gun', dmg: 22, rate: 0.9, burst: 1, gap: 0.5, range: 45, acc: 0.7 }, { kind: 'rocket', dmg: 32, splash: 4.4, rate: 1.6, range: 38, proj: 11, acc: 1 }, { kind: 'taser', dmg: 8, stun: 2.2, rate: 1.4, range: 15, acc: 0.8 }]);
  return { ...base, name: r.pick(NUT_NAMES), nut: true, hp: Math.round(base.hp * r.range(0.8, 1.6)), speed: base.speed * r.range(0.8, 1.7), size: r.range(0.9, 1.25), color: r.pick([0xa23ad8, 0xd8a23a, 0x3ad8a2, 0xd83a6a]), glow: 0xffffff, weapon: w, sight: 30 };
}

let _board = null;
function boardMat() {
  if (_board) return _board; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#0d5c3a'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#d8b040'; x.lineWidth = 2; for (let i = 0; i < 26; i++) { x.beginPath(); let px = Math.random() * 128, py = Math.random() * 128; x.moveTo(px, py); for (let k = 0; k < 4; k++) { if (Math.random() < 0.5) px += (Math.random() - 0.5) * 70; else py += (Math.random() - 0.5) * 70; x.lineTo(px, py); } x.stroke(); }
  x.fillStyle = '#e8c860'; for (let i = 0; i < 30; i++) x.fillRect(Math.random() * 124, Math.random() * 124, 4, 4); x.fillStyle = '#16171b'; for (let i = 0; i < 4; i++) x.fillRect(Math.random() * 90, Math.random() * 90, 22 + Math.random() * 12, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return _board = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.3 });
}
const MAT = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.65, roughness: 0.4, ...o });
function droneMesh(d) {
  const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), MAT(d.color)); body.position.y = 1.0; body.scale.set(1, 0.75, 1.1); g.add(body); g.userData.body = body;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 20), new THREE.MeshBasicMaterial({ color: d.glow })); ring.rotation.x = Math.PI / 2; ring.position.y = 1.0; g.add(ring); g.userData.ring = ring;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: d.glow })); eye.position.set(0, 1.0, -0.28); g.add(eye);
  g.userData.rotors = [];
  for (const [x, z] of [[0.38, 0.38], [-0.38, 0.38], [0.38, -0.38], [-0.38, -0.38]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.015, 12), new THREE.MeshBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.45 })); r.position.set(x, 1.12, z); g.add(r); g.userData.rotors.push(r); }
  for (const x of [-0.06, 0.06]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.22), MAT(0x333840)); p.position.set(x, 0.9, -0.36); g.add(p); }
  return g;
}
function walkerMesh(d) {
  const g = new THREE.Group(), s = d.size || 1, body = MAT(d.color), dark = MAT(0x22252a), glow = new THREE.MeshBasicMaterial({ color: d.glow });
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = false; parent.add(o); return o; };
  add(new THREE.BoxGeometry(0.72, 0.82, 0.44), body, 0, 1.3, 0); add(new THREE.BoxGeometry(0.5, 0.3, 0.3), dark, 0, 0.82, 0);
  add(new THREE.BoxGeometry(0.34, 0.28, 0.32), body, 0, 1.92, 0); add(new THREE.BoxGeometry(0.26, 0.07, 0.04), glow, 0, 1.94, -0.17);
  g.userData.legs = [-1, 1].map(sx => { const l = new THREE.Group(); l.position.set(sx * 0.2, 0.82, 0); add(new THREE.BoxGeometry(0.2, 0.84, 0.22), dark, 0, -0.42, 0, l); g.add(l); return l; });
  const arm = new THREE.Group(); arm.position.set(0.5, 1.55, 0); g.add(arm); add(new THREE.BoxGeometry(0.16, 0.5, 0.16), dark, 0, -0.2, 0, arm); g.userData.arm = arm;
  const w = d.weapon;
  if (w.kind === 'rocket') { const tube = add(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10), MAT(0x3a3f46), -0.44, 2.0, 0.0); tube.rotation.x = Math.PI / 2; add(new THREE.SphereGeometry(0.08, 8, 6), glow, -0.44, 2.0, -0.42); }
  const gun = add(new THREE.BoxGeometry(0.09, 0.09, d.name.startsWith('LMG') ? 0.95 : 0.7), dark, 0.5, 1.2, -0.45); if (d.name.startsWith('LMG')) add(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10), MAT(0x57504a), 0.5, 1.1, -0.2).rotation.z = Math.PI / 2; void gun;
  if (d.name === 'Wristgun Runner') add(new THREE.BoxGeometry(0.1, 0.1, 0.26), glow, -0.5, 1.15, -0.2);
  g.scale.setScalar(s); return g;
}

// ---------------------------------------------------------------- the derelict ----------------------------------------------------------------
export class ExtractShip extends Surface {
  heightAt() { return 0; }
  timeOfDay() { }
  enter(contract, hooks) {
    this.hooks = hooks; this.contract = contract; const ship = this.ship = generateShip(contract); this.r = rng(contract.seed ^ 0x5eed);
    this.planet = { name: contract.name, kind: 'derelict', settled: false, temp: 0.5, air: 1, g: 1, seed: contract.seed, i: 0 }; this.kind = 'barren'; this.sys = { name: '—' };
    this.K = { res: [], sky: 0 }; this.air = 1; this.gravity = 1; this.root.clear(); this.colliders = []; this.interactables = []; this.npcs = []; this.nodes = []; this.pickups = []; this.buildings = [];
    this.scene.remove(this.sky.mesh); this.scene.background = new THREE.Color(0x020306); this.scene.fog = new THREE.Fog(0x020306, 14, 120); this.sun.intensity = 0; this.hemi.intensity = 0.6; this.hemi.color.set(0x9fb0c8); this.hemi.groundColor.set(0x2a2d33);
    this.padPos = V(1e4, 0, 1e4); this.flatR = 9999;
    if (!this.pool) { this.pool = []; for (let i = 0; i < 9; i++) { const l = new THREE.PointLight(0xffffff, 0, 22, 1.4); this.scene.add(l); this.pool.push(l); } }
    buildShip(ship, this);
    this.enemies = []; this.proj = []; this.fx = []; this.antennas = []; this.stunT = 0; this.t = 0; this.over = false; this.alarm = false; this.stormT = -1; this.medic = null; this.hauled = 0; this.opened = 0; this.kills = 0; this.lampT = 0;
    // navigation
    this.nav = new Nav(-9, ship.zlo - 9, ship.W + 9, ship.zhi + 9); this.rebuildNav();
    this.mine = ship.ports[0]; this.spawn = { x: -3.4, z: this.mine.z, yaw: -Math.PI / 2 };
    this.buildEvents(); this.populate();
    // my ship's airlock: console + hatch
    const px = -5.4; this.interactables.push({ pos: V(px, 1, this.mine.z + 1.9), r: 2.2, label: 'Ship AI console — call a medic', act: 'xconsole' }, { pos: V(-6.1, 1, this.mine.z), r: 2.0, label: 'Hatch — undock and extract', act: 'xextract' });
    const con = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.5), MAT(0x2b3038)); con.position.set(px, 0.6, this.mine.z + 2.3); this.root.add(con); const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ color: 0x55ffcc })); scr.position.set(px, 1.0, this.mine.z + 2.04); scr.rotation.y = Math.PI; this.root.add(scr);
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.3, 2.0), MAT(0x4a5360, { emissive: 0x103020 })); hatch.position.set(-6.9, 1.15, this.mine.z); this.root.add(hatch);
  }
  rebuildNav() { const skip = new Set(); this.nav.build(this.colliders, skip); }
  // ---------------- director ----------------
  buildEvents() {
    const r = this.r, ship = this.ship, T = ship.time, ev = []; this.events = [];
    const sizeN = { small: 1, medium: 2, large: 3, behemoth: 5 }[ship.cls.size];
    const add = (kind, frac, lead, extra = {}) => ev.push({ kind, etaT: Math.round(T * frac), annT: Math.max(5, Math.round(T * frac) - lead), announced: false, done: false, ...extra });
    const others = ship.ports.filter(p => !p.mine);
    const n = 1 + sizeN + (this.contract.depth > 2 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const frac = 0.22 + (0.62 * (i + r()) / n), roll = r();
      if (roll < 0.4) add('transport', frac, r.int(50, 75), { port: others.length ? r.pick(others) : null });
      else if (roll < 0.75) add('security', frac, r.int(45, 70), { port: others.length ? r.pick(others) : null });
      else add('storm', frac, r.int(50, 70));
    }
    ev.sort((a, b) => a.etaT - b.etaT); this.events = ev;
  }
  populate() {
    const r = this.r, ship = this.ship, d = this.contract.depth;
    const list = [];
    for (const m of ship.rooms) { if (!m.enemies) continue; const n = Math.min(m.spots.length, Math.max(1, Math.round(m.enemies * (1 + d * 0.08)))); for (let i = 0; i < n; i++) list.push([m, m.spots[i]]); }
    const cap = { small: 14, medium: 22, large: 36, behemoth: 60 }[ship.cls.size] + d * 2;
    while (list.length > cap) list.splice(Math.floor(r() * list.length), 1);
    for (const [m, sp] of list) { if (!isVault(m.type) && !this.nav.find(this.spawn.x, this.spawn.z, sp.x, sp.z, false, 60000)) continue; this.spawnEnemy(this.pickEnemy(isVault(m.type) ? 1 : 0), sp.x, sp.z, { room: m }); }
  }
  pickEnemy(elite = 0) {
    const r = this.r, d = this.contract.depth + elite, ai = this.ship.cls.ai, corpSec = this.ship.corp.sec; const w = [];
    const A = (id, wt, min = 0) => { if (d >= min) w.push([id, wt]); };
    if (ai === 'drone' || ai === 'mixed') { A('drone', ai === 'drone' ? 5 : 2); A('walker', 2); A('lmg', 1.3, 2); A('wrist', 1.2, 2); A('rocketeer', 1, 3); A('nutjob', 0.7, 3); }
    if (ai === 'soldier' || ai === 'mixed') { A('soldier', ai === 'soldier' ? 5 : 2); A('gunner', 2, 1); A('rocketeer', 1, 3); if (ai === 'soldier') A('drone', 1); }
    void corpSec;
    let tot = w.reduce((a, e) => a + e[1], 0), x = r() * tot; for (const [id, wt] of w) { x -= wt; if (x <= 0) return id === 'nutjob' ? nutjob(r) : ENEMY[id]; } return ENEMY.walker;
  }
  spawnEnemy(def, x, z, o = {}) {
    const r = this.r, e = { def, hp: def.hp, pos: V(x, def.fly ? 0.55 : 0, z), dead: false, state: o.neutral ? 'roam' : 'idle', t: r() * 10, gait: 0, path: null, pi: 0, pathT: r() * 1.5, fireT: r.range(0.5, 2), burst: 0, alerted: !!o.alerted, neutral: !!o.neutral, prof: { cop: false }, room: o.room, last: null, strafe: r() < 0.5 ? 1 : -1, marker: { visible: false } };
    if (def.human) { e.mesh = buildHuman(makeLook((r() * 1e6) | 0), JSON.parse(JSON.stringify(OUTFITS[def.outfit]))); } else e.mesh = def.fly ? droneMesh(def) : walkerMesh(def);
    e.mesh.position.copy(e.pos); this.root.add(e.mesh); this.enemies.push(e); return e;
  }
  los(a, b) { return this.nav.los(a.x, a.z, b.x, b.z); }
  alertAround(x, z, rad) { for (const e of this.enemies) if (!e.dead && !e.neutral && Math.hypot(e.pos.x - x, e.pos.z - z) < rad) e.alerted = true; }
  hitEnemy(e, dmg, head) {
    if (e.dead) return; const red = e.def.armor * (head ? 0.3 : 1); e.hp -= dmg * (1 - red); e.alerted = true;
    if (e.neutral) { e.neutral = false; e.state = 'hunt'; for (const q of this.enemies) if (q.neutral && Math.hypot(q.pos.x - e.pos.x, q.pos.z - e.pos.z) < 22) { q.neutral = false; q.state = 'hunt'; } }
    this.alertAround(e.pos.x, e.pos.z, 14); e.flash = 0.08;
    if (e.hp <= 0) this.killEnemy(e);
  }
  killEnemy(e) {
    e.dead = true; this.kills++; e.dieT = 0; e.settled = false; sfx('good', 0.6);
    const r = this.r, human = e.def.human; const pool = human ? ['ammo', 'ammo', 'medkit', 'stimpack', r() < 0.12 ? 'pulsepistol' : 'hpistol'] : ['servo', 'cell', 'circuit', 'servo', r() < 0.15 ? 'ai_core' : 'cell'];
    const ids = [r.pick(pool)]; if (r() < 0.4) ids.push(r.pick(pool));
    e.rag = { vy: 0.6, rx: (Math.random() - 0.5) * 1.8, rz: (Math.random() - 0.5) * 1.8, side: Math.random() < 0.5 ? 1 : -1, legs: [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4], arm: (Math.random() - 0.5) * 2, ry: (Math.random() - 0.5) * 0.8 };
    e.salv = { ids, opened: false }; e.mesh.rotation.y += e.rag.ry;
    this.interactables.push({ pos: V(e.pos.x, 0.4, e.pos.z), r: 2.1, label: `${human ? 'Search' : 'Salvage'} ${e.def.name}`, act: 'xsalvage', data: e });
  }
  // ---------------- damage to the player ----------------
  hurt(player, dmg, kind = 'bullet') {
    const red = kind === 'storm' ? 0 : ARMOR[Meta.armor].red * (kind === 'taser' ? 0.5 : kind === 'rocket' ? 0.8 : 1);
    G.hp -= dmg * (1 - red); player.hurtT = 0.4; sfx('hit', 0.5);
  }
  shoot(e, player, d) {
    const w = e.def.weapon; const eyeY = e.pos.y + (e.def.fly ? 1.0 : 1.45) * (e.def.size || 1);
    const from = V(e.pos.x, eyeY, e.pos.z), tgt = V(player.pos.x, player.pos.y + (player.crouch ? 0.8 : 1.3), player.pos.z);
    const acc = clamp(w.acc * (1 - d / w.range * 0.7) * (player.crouch ? 0.8 : 1) * (player.sprinting ? 0.8 : 1), 0.04, 0.9);
    if (w.kind === 'rocket') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a2a })); m.position.copy(from); this.root.add(m);
      const dir = tgt.clone().sub(from).normalize(); this.proj.push({ m, vel: dir.multiplyScalar(w.proj), life: 6, dmg: w.dmg, splash: w.splash }); sfx('shotgun', 0.6); return;
    }
    const hit = Math.random() < acc; const end = hit ? tgt.clone() : tgt.clone().add(V((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 3));
    this.tracer(from, end, w.kind === 'taser' ? 0x66ccff : 0xffd070); sfx(w.kind === 'taser' ? 'laser' : 'shot', 0.35);
    if (hit) { this.hurt(player, w.dmg, w.kind); if (w.kind === 'taser') { this.stunT = Math.max(this.stunT, w.stun * (1 - ARMOR[Meta.armor].red * 0.5)); toast('TASED', 'warn'); } }
  }
  tracer(a, b, col) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col, transparent: true })); this.root.add(l); this.fx.push({ o: l, t: 0.09, mat: l.material });
  }
  boom(pos, splash, dmg, player) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8 })); m.position.copy(pos); this.root.add(m); this.fx.push({ o: m, t: 0.35, grow: splash, mat: m.material, t0: 0.35 }); sfx('shotgun', 1);
    const d = Math.hypot(player.pos.x - pos.x, player.pos.y + 1 - pos.y, player.pos.z - pos.z); if (d < splash) this.hurt(player, dmg * (1 - d / splash * 0.7), 'rocket');
  }
  // ---------------- per-frame ----------------
  update(dt, player, ui, hooks) {
    if (this.over) return;
    this.t += dt; this.stunT = Math.max(0, this.stunT - dt); G.hunger = G.thirst = 35; G.oxygen = 100;
    this.lampT -= dt; if (this.lampT <= 0) { this.lampT = 0.12; this.placeLights(player.pos); }
    for (const e of this.enemies) if (!e.dead) this.updateEnemy(e, dt, player);
    for (const e of this.enemies) if (e.dead && e.mesh && !e.settled) this.deadAnim(e, dt);
    for (const p of this.proj) { p.life -= dt; p.m.position.addScaledVector(p.vel, dt); const px = p.m.position.x, pz = p.m.position.z; let hitW = false; for (const c of this.colliders) { if (px > c.minx && px < c.maxx && pz > c.minz && pz < c.maxz && p.m.position.y < (c.maxy ?? 9)) { hitW = true; break; } }
      const dp = Math.hypot(px - player.pos.x, p.m.position.y - (player.pos.y + 1), pz - player.pos.z); if (hitW || dp < 0.7 || p.life <= 0) { this.boom(p.m.position.clone(), p.splash, p.dmg, player); this.root.remove(p.m); p.dead = true; } }
    this.proj = this.proj.filter(p => !p.dead);
    for (const f of this.fx) { f.t -= dt; if (f.mat) f.mat.opacity = Math.max(0, f.t / (f.t0 || 0.09)); if (f.grow) f.o.scale.setScalar(f.grow * (1 - f.t / f.t0) + 0.1); if (f.t <= 0) { this.root.remove(f.o); f.gone = true; } }
    this.fx = this.fx.filter(f => !f.gone);
    // gunshot noise wakes the neighbourhood
    if (player.muzzle > (this._mz || 0) + 0.3 && player.muzzle > 0.9) this.alertAround(player.pos.x, player.pos.z, G.hand && G.hand.id === 'pistol' ? 24 : 34); this._mz = player.muzzle;
    this.updateDirector(dt, player);
    for (const a of this.antennas) { a.t += dt; a.led.material.color.setHex(Math.sin(a.t * 5) > 0 ? 0xffe36a : 0x553a00); }
    // medic
    if (this.medic) { const m = this.medic; m.t -= dt; if (!m.here && m.t <= 0) { m.here = true; m.t = 70; const mesh = buildHuman(makeLook(4242), JSON.parse(JSON.stringify(OUTFITS.mechanic))); mesh.position.set(-3.2, 0, this.mine.z - 1.4); mesh.rotation.y = -Math.PI / 2; this.root.add(mesh); m.mesh = mesh; this.interactables.push({ pos: V(-3.2, 1, this.mine.z - 1.4), r: 2.2, label: 'Medic — patch me up', act: 'xmedic' }); toast('Medic has docked at your port.', 'good'); } else if (m.here && m.t <= 0) { this.root.remove(m.mesh); this.interactables = this.interactables.filter(i => i.act !== 'xmedic'); this.medic = null; toast('The medic undocked.', ''); } if (m && m.mesh) animateHuman(m.mesh, { idleT: this.t, arms: 'relaxed' }); }
    // storm
    if (this.stormT > 0) { this.stormT -= dt; const room = this.roomAt(player.pos.x, player.pos.z); const safe = player.pos.x < 0.5 || player.pos.x > this.ship.W - 0.5 || (room && room.shield); if (!safe) { G.hp -= 3.2 * dt; player.hurtT = 0.15; } if (this.stormT <= 0) toast('SHIP AI: ion storm has passed.', 'good'); }
    // deadline
    if (this.t >= this.ship.time && !this.over) { this.over = true; hooks.doom(); }
  }
  roomAt(x, z) { for (const m of this.ship.rooms) if (x > m.x0 && x < m.x1 && z > m.z0 && z < m.z1) return m; return null; }
  placeLights(p) {
    const L = this.lamps; const best = []; for (const l of L) { const d = (l.x - p.x) ** 2 + (l.z - p.z) ** 2; if (d < 900) best.push([d, l]); } best.sort((a, b) => a[0] - b[0]);
    const storm = this.stormT > 0 && Math.random() < 0.3; this.pool.forEach((pl, i) => { const b = best[i]; if (!b) { pl.intensity = 0; return; } const l = b[1]; pl.position.set(l.x, 3.0, l.z); pl.color.set(l.tint || (l.warm ? 0xff9a50 : this.ship.corp.light)); pl.intensity = storm ? 3 : 15 * (this.alarm ? 0.8 + 0.4 * Math.sin(this.t * 6) : 1); });
  }
  // a wreck falls, bounces and then just lies there until somebody picks it apart
  deadAnim(e, dt) {
    if (e.settled) return; e.dieT += dt; const m = e.mesh, rg = e.rag;
    if (e.def.human) { animateHuman(m, { ko: true }); m.position.y = 0.12; if (e.dieT > 0.6) e.settled = true; return; }
    if (e.def.fly) {
      rg.vy -= 9 * dt; e.pos.y += rg.vy * dt; if (e.pos.y <= 0.22) { e.pos.y = 0.22; if (Math.abs(rg.vy) > 1.2) { rg.vy *= -0.28; sfx('shot', 0.15); } else { rg.vy = 0; e.settled = true; } }
      m.position.y = e.pos.y; const k = Math.min(1, dt * 7); m.rotation.x += (rg.rx - m.rotation.x) * k; m.rotation.z += (rg.rz - m.rotation.z) * k; return;
    }
    const k = Math.min(1, e.dieT / 0.5), ek = 1 - (1 - k) * (1 - k), s = e.def.size || 1; m.rotation.z = rg.side * (Math.PI / 2) * 0.96 * ek; m.position.y = 0.3 * s * ek; m.position.x = e.pos.x + rg.side * 0.62 * s * ek;
    const L = m.userData.legs; if (L) { L[0].rotation.x = rg.legs[0] * ek; L[1].rotation.x = rg.legs[1] * ek; } if (m.userData.arm) m.userData.arm.rotation.x = rg.arm * ek;
    if (k >= 1) e.settled = true;
  }
  // ---------------- salvage: crack the wreck open ----------------
  exposeInnards(e) {
    if (e.opened || e.def.human) return; e.opened = true; const g = e.mesh, ud = g.userData, add = (o, p = g) => { p.add(o); return o; };
    const board = boardMat(), wireCols = [0xd83a3a, 0x3a7ad8, 0xe0c030, 0x3ad86a, 0xf0f0f0, 0xd87a1a], rnd = () => (Math.random() - 0.5);
    const wires = (n, cx, cy, cz, sx, sy, sz, parent) => { for (let i = 0; i < n; i++) { const pts = []; for (let k = 0; k < 4; k++) pts.push(V(cx + rnd() * sx * (k / 3 + 0.2), cy + Math.abs(rnd()) * sy * (k / 3 + 0.1) - (k === 3 ? sy * 0.3 : 0), cz + rnd() * sz * (k / 3 + 0.2))); const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.009 + Math.random() * 0.006, 5), new THREE.MeshStandardMaterial({ color: wireCols[(Math.random() * wireCols.length) | 0], roughness: 0.5 })); add(tube, parent); } };
    const chips = (n, w, d, y, parent) => { for (let i = 0; i < n; i++) { const cw = 0.03 + Math.random() * 0.05, ch = 0.03 + Math.random() * 0.04; const c = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.014, ch), new THREE.MeshStandardMaterial({ color: Math.random() < 0.25 ? 0x6a5a2a : 0x17181c, roughness: 0.4, metalness: 0.5 })); c.position.set(rnd() * w * 0.8, y, rnd() * d * 0.8); add(c, parent); } };
    const led = (x, y, z, col, parent) => { const o = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), new THREE.MeshBasicMaterial({ color: col })); o.position.set(x, y, z); return add(o, parent); };
    if (e.def.fly) {
      if (ud.body) ud.body.visible = false; if (ud.ring) ud.ring.material.color.setHex(0x331a1a);
      const shell = (top) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 8, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2), MAT(e.def.color, { side: THREE.DoubleSide })); m.scale.set(1, 0.75, 1.1); return m; };
      const bottom = add(shell(false)); bottom.position.y = 1.0;
      const hinge = add(new THREE.Group()); hinge.position.set(0, 1.0, 0.3); hinge.rotation.x = 2.05; const top = add(shell(true), hinge); top.position.z = -0.3;
      const bd = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.34), board)); bd.position.set(0, 1.0, -0.02); chips(7, 0.4, 0.34, 0.016, bd);
      const cell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xd8b030, metalness: 0.6, roughness: 0.4 }))); cell.rotation.z = Math.PI / 2; cell.position.set(0.08, 1.07, 0.05);
      wires(9, 0, 1.03, 0, 0.5, 0.18, 0.4, g); led(-0.12, 1.03, -0.1, 0x55ff88, g); led(0.14, 1.03, -0.1, 0xff4a3a, g); led(0, 1.03, 0.12, 0x55c8ff, g);
    } else {
      const torso = g.children[0]; torso.visible = false; const dark = MAT(0x2b2f35, { side: THREE.DoubleSide });
      const part = (w, h, d, x, y, z, m = dark) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); add(o); return o; };
      part(0.72, 0.82, 0.04, 0, 1.3, 0.2); part(0.04, 0.82, 0.44, -0.34, 1.3, 0); part(0.04, 0.82, 0.44, 0.34, 1.3, 0); part(0.72, 0.04, 0.44, 0, 0.9, 0); part(0.72, 0.04, 0.44, 0, 1.7, 0);
      const door = add(new THREE.Group()); door.position.set(-0.36, 1.3, -0.22); door.rotation.y = -2.1; const dp = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.8, 0.04), MAT(e.def.color)); dp.position.x = 0.36; add(dp, door);
      const b1 = part(0.52, 0.56, 0.02, 0, 1.32, 0.12, board); const b2 = part(0.3, 0.3, 0.02, 0.1, 1.3, -0.04, board); chips(8, 0.5, 0.5, 0.014, b1); b1.children.forEach(c => c.rotation.x = Math.PI / 2); chips(4, 0.28, 0.28, 0.014, b2); b2.children.forEach(c => c.rotation.x = Math.PI / 2);
      const core = part(0.14, 0.14, 0.14, -0.15, 1.32, -0.12, new THREE.MeshBasicMaterial({ color: e.def.glow })); void core;
      wires(14, 0, 1.3, 0, 0.6, 0.5, 0.4, g); led(-0.2, 1.62, 0.1, 0x55ff88, g); led(0.2, 1.05, 0.1, 0xff4a3a, g);
    }
    sfx('zip', 0.9);
  }
  updateEnemy(e, dt, player) {
    const d0 = e.def, w = d0.weapon, px = player.pos.x, pz = player.pos.z, dx = px - e.pos.x, dz = pz - e.pos.z, d = Math.hypot(dx, dz); e.t += dt;
    if ((e.state === 'idle' || e.state === 'roam') && !e.alerted && d > d0.sight + 6) { if (e.state === 'idle') return; }
    const los = d < 70 && this.los(e.pos, player.pos);
    if (e.state === 'idle' || e.state === 'roam') {
      if (!e.neutral && ((los && d < d0.sight * (player.crouch ? 0.6 : 1)) || e.alerted)) { e.state = 'hunt'; e.last = { x: px, z: pz }; if (!e.shouted) { e.shouted = true; this.alertAround(e.pos.x, e.pos.z, 12); } }
      else if (e.state === 'roam' && e.neutral) { e.pathT -= dt; if (!e.path || e.pi >= e.path.length) { if (e.pathT <= 0) { const m = this.r.pick(this.ship.rooms); const sp = m.spots[0] || { x: (m.x0 + m.x1) / 2, z: (m.z0 + m.z1) / 2 }; e.path = this.nav.find(e.pos.x, e.pos.z, sp.x, sp.z, false, 40000); e.pi = 0; e.pathT = this.r.range(4, 10); } } else this.follow(e, dt, d0.speed * 0.6); }
      else this.idleAnim(e, dt);
      return;
    }
    // hunt
    if (los) e.last = { x: px, z: pz };
    const tgt = e.last || { x: px, z: pz };
    const inRange = los && d <= w.range; const wantMove = !los || d > d0.prefer * 1.15 || (d0.fly && d > d0.prefer);
    e.pathT -= dt;
    if (wantMove && !(e.burst > 0 && !d0.fly && !d0.name.includes('Runner'))) {
      if (e.pathT <= 0 || !e.path) { e.path = this.nav.find(e.pos.x, e.pos.z, tgt.x, tgt.z, !!d0.fly, 40000); e.pi = 0; e.pathT = 0.9 + Math.random() * 0.5; }
      if (e.path && e.pi < e.path.length) this.follow(e, dt, d0.speed); else this.idleAnim(e, dt);
    } else if (d < d0.prefer * 0.55 && d0.fly) { /* drone backs off a bit */ this.step(e, -dx / d, -dz / d, d0.speed * 0.6, dt); this.faceTo(e, dx, dz, dt); this.anim(e, dt, d0.speed * 0.6); }
    else { this.faceTo(e, dx, dz, dt); if (d0.name.includes('Runner')) { this.step(e, -dz / (d || 1) * e.strafe, dx / (d || 1) * e.strafe, d0.speed * 0.5, dt); } this.anim(e, dt, d0.fly ? 1 : 0); }
    if (inRange) this.faceTo(e, dx, dz, dt);
    // firing
    e.fireT -= dt;
    if (w.kind === 'taser') this.taserLogic(e, player, d, dt);
    else if (inRange && e.fireT <= 0) {
      this.shoot(e, player, d);
      if (w.burst) { e.burst = e.burst > 0 ? e.burst - 1 : w.burst - 1; e.fireT = e.burst > 0 ? w.rate : w.gap + Math.random() * 0.6; } else e.fireT = w.rate + Math.random() * 0.5;
    }
    if (e.mesh.userData.rotors) e.mesh.userData.rotors.forEach(r => r.rotation.y += dt * 40);
    if (d0.fly) { e.pos.y = 0.55 + Math.sin(e.t * 3) * 0.08; e.mesh.position.y = e.pos.y; }
    if (e.flash > 0) e.flash -= dt;
  }
  // a drone only zaps when it is right on top of you, facing you, with a clean line to both chest and head
  clearLine(a, b) {
    const x0 = Math.min(a.x, b.x) - 0.3, x1 = Math.max(a.x, b.x) + 0.3, z0 = Math.min(a.z, b.z) - 0.3, z1 = Math.max(a.z, b.z) + 0.3, near = this.colliders.filter(c => !c.roof && c.maxx > x0 && c.minx < x1 && c.maxz > z0 && c.minz < z1);
    const n = Math.ceil(a.distanceTo(b) / 0.15);
    for (let k = 1; k < n; k++) { const t = k / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t; for (const c of near) if (x > c.minx - 0.05 && x < c.maxx + 0.05 && z > c.minz - 0.05 && z < c.maxz + 0.05 && y < (c.maxy ?? 99)) return false; }
    return true;
  }
  taserLogic(e, player, d, dt) {
    const w = e.def.weapon, dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z, ry = e.mesh.rotation.y, face = d > 0.01 ? (-Math.sin(ry) * dx - Math.cos(ry) * dz) / d : 1;
    let ok = d <= w.range && face > 0.86;
    if (ok) { const from = V(e.pos.x, e.pos.y + 1.0, e.pos.z); ok = this.clearLine(from, V(player.pos.x, player.pos.y + 1.3, player.pos.z)) && this.clearLine(from, V(player.pos.x, player.pos.y + (player.crouch ? 0.9 : 1.62), player.pos.z)); }
    const ring = e.mesh.userData.ring;
    if (e.wind > 0) { if (!ok) { e.wind = 0; e.fireT = 0.7; if (ring) ring.scale.setScalar(1); } else { e.wind -= dt; if (ring) ring.scale.setScalar(1 + (1 - e.wind / w.wind) * 0.5 + Math.sin(e.t * 50) * 0.08); if (e.wind <= 0) { this.shoot(e, player, d); e.fireT = w.rate; if (ring) ring.scale.setScalar(1); } } }
    else if (ok && e.fireT <= 0) { e.wind = w.wind; sfx('ui', 0.6); }
  }
  idleAnim(e, dt) { if (e.def.human) animateHuman(e.mesh, { idleT: e.t, arms: 'gun', aim: 0.7 }); else if (e.def.fly) { e.pos.y = 0.55 + Math.sin(e.t * 2) * 0.08; e.mesh.position.y = e.pos.y; e.mesh.userData.rotors.forEach(r => r.rotation.y += dt * 30); } }
  follow(e, dt, speed) {
    const p = e.path[e.pi]; const dx = p.x - e.pos.x, dz = p.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.45) { e.pi++; return; } this.step(e, dx / d, dz / d, speed, dt); this.faceTo(e, dx, dz, dt); this.anim(e, dt, speed);
  }
  step(e, ux, uz, speed, dt) { e.pos.x += ux * speed * dt; e.pos.z += uz * speed * dt; const p2 = V(e.pos.x, 0, e.pos.z); this.collide(p2, 0.38, e.def.fly ? 2.6 : 0); e.pos.x = p2.x; e.pos.z = p2.z; e.mesh.position.x = e.pos.x; e.mesh.position.z = e.pos.z; }
  faceTo(e, dx, dz, dt) { if (Math.abs(dx) + Math.abs(dz) < 0.001) return; const a = Math.atan2(-dx, -dz); let df = a - e.mesh.rotation.y; while (df > Math.PI) df -= 2 * Math.PI; while (df < -Math.PI) df += 2 * Math.PI; e.mesh.rotation.y += df * Math.min(1, dt * 9); }
  anim(e, dt, speed) {
    e.gait += speed * dt * 2.6;
    if (e.def.human) animateHuman(e.mesh, { phase: e.gait, speed: speed / 1.7, idleT: e.t, arms: 'gun', aim: 0.85 });
    else if (!e.def.fly) { const L = e.mesh.userData.legs, s = Math.sin(e.gait) * Math.min(1, speed / 2.5) * 0.7; L[0].rotation.x = s; L[1].rotation.x = -s; }
    else e.mesh.userData.rotors.forEach(r => r.rotation.y += dt * 40);
  }
  // ---------------- events ----------------
  linkOK(player) {
    if (this.ship.cls.size !== 'behemoth') return true; const p = player.pos; const R = 150;
    if (Math.hypot(p.x - this.mine.x, p.z - this.mine.z) < R) return true;
    return this.antennas.some(a => Math.hypot(p.x - a.x, p.z - a.z) < 85);
  }
  placeAntenna(player) {
    if (this.ship.cls.size !== 'behemoth') { toast('The ship AI reaches the whole station here — keep your relays for a behemoth.', ''); return; }
    if (!count('antenna')) { toast('No relay antennas in your pack.', 'warn'); return; }
    if (this.antennas.some(a => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) < 30)) { toast('Too close to another relay.', 'warn'); return; }
    removeItem('antenna', 1); const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6), MAT(0x888e98)); pole.position.y = 0.7; g.add(pole); const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe36a })); led.position.y = 1.45; g.add(led);
    g.position.set(player.pos.x, 0, player.pos.z); this.root.add(g); this.antennas.push({ x: player.pos.x, z: player.pos.z, led, t: 0 }); toast('Relay antenna deployed. Ship AI range extended.', 'good'); sfx('good', 0.6);
  }
  updateDirector(dt, player) {
    const link = this.linkOK(player), ship = this.ship, T = this.t;
    for (const e of this.events) {
      if (!e.announced && T >= e.annT && link) { e.announced = true; this.ai(this.describe(e)); }
      if (!e.done && T >= e.etaT) { e.done = true; this.fire(e, player, link); }
    }
    const left = ship.time - T; if (!this.warned1 && left < 120 && link) { this.warned1 = true; this.ai('Reactor cascade in 2:00. Get back to the ship.', 'warn'); } if (!this.warned2 && left < 30 && link) { this.warned2 = true; this.ai('30 seconds. Undock NOW.', 'warn'); }
    if (this.alarmEta && T >= this.alarmEta && !this.alarmFired) { this.alarmFired = true; this.fire({ kind: 'military' }, player, link); }
    this.link = link;
  }
  describe(e) {
    const p = e.port ? `Port ${e.port.id}` : 'an internal lock'; const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; const eta = mmss(Math.max(0, e.etaT - Math.floor(this.t)));
    return e.kind === 'transport' ? `Rimrunner pod inbound to ${p}, ETA ${eta}.` : e.kind === 'security' ? `${this.ship.corp.short} security cruiser inbound to ${p}, ETA ${eta}. Expect resistance.` : `Ion storm front, ETA ${eta}. Shielded rooms (vaults, control) will protect you; armor will not.`;
  }
  ai(msg, kind = '') { toast('SHIP AI: ' + msg, kind || 'good'); sfx('ui', 0.7); this.hooks && this.hooks.log && this.hooks.log(msg); }
  arrival(e, count, def, hostile = true) {
    const ship = this.ship; let sx, sz, port = e.port;
    if (port) { this.openPort(port); sx = port.dir === 'w' ? -3.5 : ship.W + 3.5; sz = port.z; } else { const m = this.r.pick(ship.rooms.filter(q => q.x0 > 20 && q.spots.length)); const sp = m.spots[0]; sx = sp.x; sz = sp.z; }
    for (let i = 0; i < count; i++) { const dd = typeof def === 'function' ? def() : def; this.spawnEnemy(dd, sx + (port ? (port.dir === 'w' ? 1 : -1) * (i % 2) * 1.2 : (i % 2)), sz + (i - count / 2) * 0.9, { alerted: hostile, neutral: !hostile }); }
  }
  openPort(p) { const pd = this.portDoors.find(q => q.port === p); if (!pd || pd.open) return; pd.open = true; pd.mesh.visible = false; this.colliders = this.colliders.filter(c => c !== pd.col); this.rebuildNav(); sfx('zip', 0.9); }
  fire(e, player, link) {
    const d = this.contract.depth;
    if (e.kind === 'transport') { const hostile = this.r() < 0.45; this.arrival(e, this.r.int(2, 3), ENEMY.rival, hostile); toast(`A pod docked${e.port ? ' at Port ' + e.port.id : ''}. ${hostile ? 'They came shooting.' : 'Rival runners — leave them alone and they might leave you alone.'}`, hostile ? 'warn' : ''); }
    else if (e.kind === 'security') { const sec = this.ship.corp.sec; const f = () => sec === 'soldier' ? ENEMY[this.r.pick(['soldier', 'soldier', 'gunner'])] : sec === 'drone' ? ENEMY[this.r.pick(['drone', 'drone', 'walker'])] : this.pickEnemy(); this.arrival(e, 2 + Math.floor(d / 2) + (this.ship.cls.size === 'behemoth' ? 2 : 0), f); toast(`${this.ship.corp.short} security has boarded${e.port ? ' at Port ' + e.port.id : ''}.`, 'warn'); }
    else if (e.kind === 'military') { this.arrival({ port: this.ship.ports.length > 1 ? this.r.pick(this.ship.ports.filter(p => !p.mine)) : null }, 3 + Math.floor(d / 2), () => ENEMY[this.r.pick(['soldier', 'gunner', 'soldier', 'rocketeer'])]); toast(`${this.ship.corp.short} marines are aboard. They were called by the alarm.`, 'warn'); }
    else if (e.kind === 'storm') { this.stormT = 30; toast('ION STORM — get into a shielded room (vault / control) or back to your ship! Armor will not help.', 'warn'); }
  }
  raiseAlarm() {
    if (this.alarm) return; this.alarm = true; this.alarmEta = this.t + 70; this.ai(`Alarm tripped. ${this.ship.corp.short} military response ETA 1:10.`, 'warn');
    for (const e of this.enemies) if (!e.dead && !e.neutral) e.alerted = true;
  }
}

// ---------------------------------------------------------------- the run controller ----------------------------------------------------------------
export function packValue(pack = G.pack) {
  let v = 0; const list = [];
  const note = (id, n, uidg) => { const it = ITEMS[id]; if (!it) return; if (it.kind === 'gun') list.push({ id, n: 1, gun: true }); else if (KEEP.has(id)) list.push({ id, n, keep: true }); else { v += it.value * n; list.push({ id, n, value: it.value * n }); } };
  for (const face of [pack.front, pack.back]) for (const s of face) if (s) note(s.id, s.uid ? 1 : s.n || 1);
  for (const [id, n] of Object.entries(pack.pocket)) if (n > 0) note(id, n);
  for (const g of pack.sides) if (g) note(g.id, 1);
  if (G.hand) note(G.hand.id, 1); if (G.held) note(G.held.id, G.held.n || 1);
  return { value: v, list };
}
export function startingKit() {
  G.pack = newPack(0); G.hand = null; G.held = null; G.lockers = G.lockers || []; G.hp = 100; G.hunger = G.thirst = 35; G.oxygen = 100;
  addGun({ id: Meta.primary, q: 1, uid: uid(), mag: GUN[ITEMS[Meta.primary].gun].mag }); if (Meta.primary !== 'pistol' && Meta.owned.includes('pistol')) addGun({ id: 'pistol', q: 1, uid: uid(), mag: 12 });
  for (const [id, n] of Object.entries(Meta.kit)) if (n > 0) addItem(id, n);
}
