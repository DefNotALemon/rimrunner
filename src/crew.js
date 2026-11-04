// Ship crews: the people who were aboard before you. Dead ones lie where they fell (searchable, with a name and a cause),
// a few living ones are hiding and will talk. Pure additions to ExtractShip; extract.js calls populateCrew / updateSurvivor / cullCrew.
import * as THREE from '../vendor/three.module.js';
import { buildHuman, makeLook, OUTFITS, outfitFor, animateHuman } from './people.js';
import { isVault, ROOM_LABEL } from './ships.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// room type -> who works there: [role title, outfit key, weight]. Rooms not listed get no crew.
const STAFF = {
  serverhall: [['Systems tech', 'scholar'], ['Network tech', 'mechanic']], control: [['Watch officer', 'trader'], ['Controller', 'scholar'], ['Guard', 'guard']],
  cooling: [['Plant engineer', 'mechanic']], power: [['Power engineer', 'mechanic'], ['Electrician', 'miner']], reactor: [['Reactor tech', 'mechanic']],
  tankhall: [['Tank hand', 'miner'], ['Process operator', 'mechanic']], chemlab: [['Chemist', 'scholar'], ['Lab tech', 'scholar']], lab: [['Researcher', 'scholar'], ['Lab tech', 'scholar']],
  assembly: [['Line worker', 'miner'], ['Fitter', 'mechanic']], foundry: [['Smelter hand', 'miner']], storage: [['Loader', 'miner'], ['Stores clerk', 'drifter']],
  crew: [['Crewman', 'drifter'], ['Deckhand', 'mechanic'], ['Off-shift tech', 'scholar']], barracks: [['Guard', 'guard'], ['Guard', 'guard']], guardroom: [['Guard', 'guard']],
  armoryhall: [['Armourer', 'guard'], ['Guard', 'guard']], range: [['Guard', 'guard']], canteen: [['Cook', 'cook'], ['Crewman', 'drifter']], medbay: [['Medic', 'scholar'], ['Patient', 'drifter']],
  office: [['Clerk', 'jeweler'], ['Manager', 'trader']], cellblock: [['Prisoner', 'drifter'], ['Prisoner', 'drifter'], ['Guard', 'guard']],
};
// what a person carries, by outfit family (ids from data.js ITEMS)
const CARRY = {
  guard: ['ammo', 'ammo', 'medkit', 'ration', 'keycard', 'data_chip'], mechanic: ['ration', 'water', 'data_chip', 'steel'], miner: ['ration', 'water', 'ammo'], scholar: ['data_chip', 'data_chip', 'ration', 'stimpack'],
  cook: ['ration', 'ration', 'water'], trader: ['data_chip', 'ration'], jeweler: ['data_chip', 'water'], drifter: ['ration', 'water', 'medkit'],
};
const FIRST = 'ABCDEFGHJKLMNOPRSTVWYZ', LAST = ['Okafor', 'Brandt', 'Vasquez', 'Lindqvist', 'Mbeki', 'Tanaka', 'Kowalczyk', 'Reyes', 'Haddad', 'Novak', 'Osei', 'Petrov', 'Singh', 'Larsen', 'Moreau', 'Idowu', 'Castellan', 'Voss', 'Ibarra', 'Khan', 'Dubois', 'Yilmaz', 'Frost', 'Adeyemi'];

// ship mood from the contract's stated reason: density, blood, dead guards, living survivors
function moodOf(reason = '') {
  const s = reason.toLowerCase();
  if (s.includes('mutiny')) return { id: 'mutiny', dens: 1.25, blood: 1, guards: 0.5, surv: 1, notes: ['Shot at close range.', 'Defensive wounds on the forearms. Beaten, then shot.', 'Gunshot, upper chest. Still holding a wrench.', 'Shot in the back. They were running.'] };
  if (s.includes('security') || s.includes('lockdown')) return { id: 'lockdown', dens: 1.0, blood: 0.8, guards: 0.6, surv: 1, notes: ['Caught outside a sealed door. Gunshot.', 'Badge says unauthorised movement. Shot.', 'Fell with hands raised. Gunshot.', 'Locked out when the doors dropped. Never got further.'] };
  if (s.includes('reactor') || s.includes('coolant')) return { id: 'burn', dens: 0.9, blood: 0, guards: 0.1, surv: 1, notes: ['Flash burns down one side. Over before they knew.', 'Coolant scald on both hands. Crawled a few metres.', 'No wounds. Face-down by the door.', 'Radiation burns. Badge badly discoloured.'] };
  if (s.includes('breach')) return { id: 'breach', dens: 0.8, blood: 0, guards: 0.1, surv: 1, notes: ['Decompression. Eyes and lips swollen.', 'Reached for a pressure locker. Did not make it.', 'No wounds. Hull went in seconds.', 'Frost on the face. Frozen where they lay.'] };
  if (s.includes('power') || s.includes('life support')) return { id: 'gas', dens: 0.9, blood: 0, guards: 0.1, surv: 1, notes: ['No wounds. Air went bad slowly.', 'Slumped against a vent. Lips blue.', 'Last log: "O2 reading 11%". Nothing after.', 'Calm, lying down. It looked like sleep.'] };
  if (s.includes('abandon')) return { id: 'abandoned', dens: 0.3, blood: 0.1, guards: 0.1, surv: 0.4, notes: ['Left behind. Dehydration, probably.', 'Stayed with the job. Died at the post.'] };
  if (s.includes('evacuation')) return { id: 'evac', dens: 0.5, blood: 0.2, guards: 0.1, surv: 2, notes: ['Trampled at the muster point.', 'Caught between decks when the bulkhead closed.', 'Coolant scald. Crew carried them this far.'] };
  return { id: 'unknown', dens: 0.9, blood: 0.5, guards: 0.3, surv: 1, notes: ['No signs of a struggle. No obvious cause.', 'Gunshot, small calibre. Close range.', 'Something burned through the jacket.', 'Collapsed mid-step. Hands still open.'] };
}

let _blood = null;
function bloodMat() {
  if (_blood) return _blood;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(70,6,8,0.95)'); g.addColorStop(0.55, 'rgba(60,5,7,0.85)'); g.addColorStop(1, 'rgba(40,4,5,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(55,5,7,0.8)'; for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = 30 + Math.random() * 28; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1.5 + Math.random() * 4, 0, 6.28); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  _blood = new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.15, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  _blood.userData.look = { skip: true }; return _blood;
}
const _bloodGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function freeze(mesh) { mesh.updateMatrixWorld(true); mesh.traverse(o => { o.matrixAutoUpdate = false; }); }

function personName(r) { return `${FIRST[Math.floor(r() * FIRST.length)]}. ${r.pick(LAST)}`; }

/** Lay the dead and hide the living. Call once, right after populate(). */
export function populateCrew(S) {
  const r = S.r, ship = S.ship, mood = moodOf(S.contract.reason), d = S.contract.depth;
  S.crewList = []; S.survivors = [];
  const cap = { small: 5, medium: 9, large: 14, behemoth: 22 }[ship.cls.size] || 8;
  const picks = [];
  for (const m of ship.rooms) {
    if (isVault(m.type) || !STAFF[m.type] || !m.spots || m.spots.length < 2) continue;
    const area = (m.x1 - m.x0) * (m.z1 - m.z0), want = area / 55 * mood.dens * r.range(0.4, 1.3);
    let n = Math.floor(want) + (r() < want % 1 ? 1 : 0); n = Math.min(n, 3, m.spots.length - 1);
    // spots[0..enemies) are taken by live enemies; bodies use the back of the list
    for (let i = 0; i < n; i++) picks.push({ m, sp: m.spots[m.spots.length - 1 - i] });
  }
  while (picks.length > cap) picks.splice(Math.floor(r() * picks.length), 1);
  for (const { m, sp } of picks) {
    const staff = r.pick(STAFF[m.type]); let [role, key] = staff;
    if (key === 'guard' && r() > mood.guards + 0.55) { const alt = r.pick(['mechanic', 'drifter', 'scholar']); key = alt; role = alt === 'scholar' ? 'Technician' : alt === 'mechanic' ? 'Deckhand' : 'Crewman'; }
    placeBody(S, { role, key, x: sp.x, z: sp.z, mood, room: m, supine: m.type === 'crew' || m.type === 'barracks' ? r() < 0.8 : r() < 0.4 });
  }
  // survivors: hiding in quiet rooms, never in the vault, never more than a handful
  const nSurv = Math.min(4, Math.round((ship.cls.size === 'small' ? 0.6 : ship.cls.size === 'medium' ? 1.1 : ship.cls.size === 'large' ? 1.8 : 2.6) * mood.surv * r.range(0.5, 1.4)));
  const homes = ship.rooms.filter(m => !isVault(m.type) && ['crew', 'storage', 'medbay', 'cellblock', 'control', 'canteen', 'office', 'lab', 'chemlab', 'barracks'].includes(m.type) && m.spots && m.spots.length > 2 && m.x0 > 8);
  for (let i = 0; i < nSurv && homes.length; i++) {
    const m = homes.splice(Math.floor(r() * homes.length), 1)[0], sp = m.spots[m.spots.length - 1], staff = r.pick(STAFF[m.type]);
    spawnSurvivor(S, { role: staff[0] === 'Guard' ? 'Guard' : staff[0], key: staff[1], x: sp.x, z: sp.z, room: m, depth: d });
  }
}

function placeBody(S, o) {
  const r = S.r, look = makeLook((r() * 1e6) | 0), outfit = outfitFor(o.key, (r() * 1e6) | 0);
  const name = `${personName(r)}, ${o.role.toLowerCase()}`;
  const def = { name, human: true, outfit: o.key, hp: 1, armor: 0, speed: 0, prefer: 0, sight: 0, weapon: null, crew: true };
  const mesh = buildHuman(look, outfit), yaw = r() * Math.PI * 2;
  const e = { def, hp: 0, pos: V(o.x, 0, o.z), dead: true, state: 'dead', t: 0, gait: 0, path: null, pi: 0, mesh, settled: true, dieT: 9, room: o.room, neutral: false, marker: { visible: false }, rag: { ry: 0 } };
  mesh.position.set(o.x, 0, o.z); mesh.rotation.y = yaw; animateHuman(mesh, { ko: true, supine: o.supine }); mesh.position.y = 0.12;
  S.root.add(mesh); mesh.updateMatrixWorld(true); freeze(mesh); S.enemies.push(e);
  // blood pool under the torso, but only on ships where people were shot
  if (r() < o.mood.blood) {
    const hp = new THREE.Vector3(); mesh.userData.J.head.getWorldPosition(hp); const tx = hp.x - o.x, tz = hp.z - o.z;   // torso sits between the feet and the head
    const b = new THREE.Mesh(_bloodGeo, bloodMat()), sz = r.range(0.9, 1.6); b.scale.set(sz, 1, sz * r.range(0.7, 1.1)); b.position.set(o.x + tx * 0.55, 0.056, o.z + tz * 0.55); b.rotation.y = r() * 6.28; b.updateMatrix(); b.matrixAutoUpdate = false;
    S.root.add(b); e.blood = b; b.updateMatrixWorld(true);
  }
  const pool = CARRY[o.key] || CARRY.drifter, ids = [r.pick(pool)]; if (r() < 0.45) ids.push(r.pick(pool)); if (o.key === 'guard' && r() < 0.5) ids.push('ammo');
  const ids2 = ids.filter(id => id !== 'keycard' || (r() < 0.35 && S.ship.rooms.some(q => isVault(q.type))));
  e.salv = { ids: ids2.length ? ids2 : ['ration'], opened: false, note: r.pick(o.mood.notes) };
  e.opened = true;   // humans never split open
  S.interactables.push({ pos: V(o.x, 0.4, o.z), r: 2.1, label: `Search ${name}`, act: 'xsalvage', data: e });
  S.crewList.push(e); return e;
}

const SURV_LINES = [
  'Don\'t shoot. I only work here.', 'I\'ve been in this locker since the lights went. Are you a rescue?', 'You\'re not company. Good. Keep your voice down.', 'They went through the deck above. I counted. Take what you want, just let me sit.',
];
function spawnSurvivor(S, o) {
  const r = S.r, name = `${personName(r)}, ${o.role.toLowerCase()}`, look = makeLook((r() * 1e6) | 0), outfit = outfitFor(o.key, (r() * 1e6) | 0);
  const def = { name, human: true, survivor: true, outfit: o.key, hp: 45, armor: 0, speed: 3.0, prefer: 0, sight: 0, weapon: null };
  const e = S.spawnEnemy(def, o.x, o.z, { room: o.room }); S.root.remove(e.mesh);
  e.mesh = buildHuman(look, outfit); e.mesh.position.set(o.x, 0, o.z); e.mesh.rotation.y = r() * 6.28; S.root.add(e.mesh);
  e.state = 'cower'; e.talked = false; e.facing = e.mesh.rotation.y; e.survRoom = o.room;
  const it = { pos: V(o.x, 1, o.z), r: 2.4, label: `Talk to ${name}`, act: 'xcrew', data: e }; e.talkIt = it; S.interactables.push(it);
  animateHuman(e.mesh, { crouch: 0.95, speed: 0, idleT: 0 }); S.survivors.push(e); return e;
}

/** per-frame for a living survivor (called from updateEnemy before any combat logic) */
export function updateSurvivor(S, e, dt, player) {
  const dx = player.pos.x - e.pos.x, dz = player.pos.z - e.pos.z, d = Math.hypot(dx, dz); e.t += dt;
  if (d > 40) return;   // far away: frozen, costs nothing
  const hot = S.alarm || (d < 9 && player.muzzle > 0.5);
  if (e.talked && !hot) {   // calmed: stands, watches you
    const want = Math.atan2(dx, dz) + Math.PI; let da = want - e.mesh.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); e.mesh.rotation.y += da * Math.min(1, dt * 4);
    animateHuman(e.mesh, { idleT: e.t, crouch: 0, speed: 0 });
  } else { e.mesh.rotation.y += (e.facing - e.mesh.rotation.y) * Math.min(1, dt * 3); animateHuman(e.mesh, { crouch: 0.95, speed: 0, idleT: e.t }); }
}

/** the Talk interaction: a line, a real tip drawn from the live ship, maybe a gift. Returns { say, give } */
export function talk(S, e) {
  const r = S.r; if (e.dead) return null;
  e.talked = true; const ship = S.ship, here = S.spawn;
  let tip;
  const alive = S.enemies.filter(q => !q.dead && !q.def.survivor && q.room && !isVault(q.room.type));
  const by = {}; for (const q of alive) by[q.room.id] = (by[q.room.id] || 0) + 1;
  const worst = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  const vault = ship.rooms.find(m => isVault(m.type));
  const opts = [];
  if (vault && !S.vaultSeen) opts.push(() => `The vault? About ${Math.round(Math.hypot((vault.x0 + vault.x1) / 2 - here.x, (vault.z0 + vault.z1) / 2 - here.z) / 10) * 10} metres in from your hatch. Doors are sealed. You'll want a keycard.`);
  if (worst && worst[1] >= 2) opts.push(() => { const m = ship.rooms[worst[0]]; return `Stay out of the ${(ROOM_LABEL[m.type] || m.type).toLowerCase()}. I heard at least ${worst[1]} of them moving in there.`; });
  const med = ship.rooms.find(m => m.type === 'medbay');
  if (med) opts.push(() => `If you're hurt, there's a medbay about ${Math.round(Math.hypot((med.x0 + med.x1) / 2 - here.x, (med.z0 + med.z1) / 2 - here.z) / 5) * 5} metres in. The stims in there might still be good.`);
  opts.push(() => 'Move along the walls. They don\'t check the corners as often as they should.');
  tip = r.pick(opts)();
  const g = r(); const give = g < 0.3 ? 'medkit' : g < 0.5 ? 'ration' : g < 0.6 && vault ? 'keycard' : g < 0.8 ? 'data_chip' : null;
  if (give === 'keycard') S.vaultSeen = true;
  return { say: r.pick(SURV_LINES) + ' ' + tip, give };
}

/** hide far bodies: ~20 humans in view is the real frame-time cost on this renderer */
export function cullCrew(S, p) {
  if (!S.crewList) return;
  for (const e of S.crewList) { const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z), v = d < 55; if (e.mesh.visible !== v) e.mesh.visible = v; if (e.blood && e.blood.visible !== v) e.blood.visible = v; }
}
