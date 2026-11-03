// Rimrunner — main loop and glue
import * as THREE from '../vendor/three.module.js';
import { In, initInput, pollInput } from './input.js';
import { G, resetGame, save, load, toast, addItem, newPack, addGun, lvl, xp, count, uid, stowHand } from './state.js';
import { systemAt } from './gen.js';
import { Space } from './space.js';
import { Surface } from './surface.js';
import { Jail } from './jail.js';
import { Player, onDeath } from './player.js';
import { Social } from './social.js';
import { UI } from './ui.js';
import { PackWorld } from './packworld.js';
import { Atmo } from './atmo.js';
import { audioInit, sfx } from './audio.js';
import { Look } from './look.js';
import { ExtractShip, Meta, metaLoad, metaSave, makeOffers } from './extract.js';
import { Extraction } from './extract-ui.js';
import { pickContract } from './ships.js';
import { ITEMS } from './data.js';
import { fmt, clamp } from './util.js';
import { auditScene } from './audit.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
Look.init(renderer); Look.onChange = (t, b) => toast(b ? `${t} — ${b}` : t, '');   // materials + lighting + post (src/look.js); F6 look, F7 effects, F8 material source
addEventListener('keydown', e => { if (e.repeat) return; if (e.code === 'F6') { e.preventDefault(); Look.cycleLook(); } else if (e.code === 'F7') { e.preventDefault(); Look.cycleTier(); } else if (e.code === 'F8') { e.preventDefault(); Look.toggleSource(); } });
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 2e6);
function resize() { renderer.setSize(innerWidth, innerHeight, false); Look.resize(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
initInput(canvas);

const social = new Social();
let mode = 'title', started = false, surf = new Surface(camera), jail = new Jail(camera), xs = new ExtractShip(camera), player = new Player(camera), sys = null, planetNow = null, paused = false;
const R = window.__rr = { G, forceActive: false, get mode() { return mode; }, get player() { return player; }, get surf() { return surf; }, get space() { return space; }, get ui() { return ui; }, get pack() { return pack; }, get jail() { return jail; }, goToJail: (i) => goToJail(i), get xs() { return xs; }, get X() { return X; }, Meta, In, social, camera, renderer };

// ---------- hooks for the UI ----------
function lock() { try { const r = canvas.requestPointerLock?.(); r && r.catch && r.catch(() => {}); } catch (e) {} }
const hooks = {
  social,
  packOpen: b => { player.packOpen = b; },
  use: id => player.use(id), xp, onClose: () => { if (started && In.scheme === 'kb') lock(); },
  talkEnd: () => ui.talkEnded(),
  talk: (npc, m) => { startTalk(npc, m); },
  markRich: () => markRich(), clearCops: () => { social.shotCop = false; surf.npcs.filter(n => n.prof.cop).forEach(n => { n.hostile = false; n.warned = false; n.warns = 0; }); },
  restore: () => restoreGear(), jump: i => doJump(i),
};
const ui = new UI(hooks);
const pack = new PackWorld(camera, { dropItem: (h, pos) => surf.dropItem(h, pos) });
G.dropped = g => { surf.dropGun(g, { x: player.pos.x + Math.sin(player.yaw) * -1.2, z: player.pos.z + Math.cos(player.yaw) * -1.2 }); };

const X = new Extraction({
  S: xs, get player() { return player; }, ui, pack, fadeTo, lock, openLoot: ctx => pack.openLoot(ctx, player),
  setMode: m => { mode = m; started = true; },
  resetPack: () => { player.packOpen = false; if (pack.blocking) pack.requestClose(); if (G.held) G.held = null; },
  toTitle: () => { mode = 'title'; started = false; document.getElementById('title').style.display = ''; },
});
const space = new Space(camera, {
  land: (p, out, fwd) => descend(p, out, fwd), hail: h => ui.hail(h), closeHail: () => { ui.closeHail(); if (In.scheme === 'kb') lock(); },
  jail: info => goToJail(info), disabled: () => { toast('Ship disabled! Systems dead…', 'warn'); setTimeout(towed, 3200); },
});
const atmo = new Atmo(camera, surf, {
  toSpace: (out, fwd) => { if (mode !== 'atmo') return; mode = 'space'; atmo.detach(); space.reenter(sys, planetNow.i, out); ui.setHint('space'); save(); toast('Clear of the atmosphere.', ''); },
  landed: (x, z, yaw, pad) => { surf.parkShip(x, z, yaw, !!pad); mode = 'foot'; player.place(surf.scene, surf); const c = Math.cos(yaw), s = Math.sin(yaw); player.teleport(x + 14 * c + 4 * s, z - 14 * s + 4 * c, -Math.PI / 2); ui.setHint('foot'); player.view.visible = true; save(); },
});
R.atmo = atmo;
// audit hooks (read-only): __rr.audit() reports glitch classes for the scene currently shown; __rr.go('space'|'atmo'|'foot'|'jail') jumps modes for testing
R.curScene = () => mode === 'space' ? space.scene : mode === 'atmo' || mode === 'foot' ? surf.scene : mode === 'jail' ? jail.scene : mode === 'extract' ? xs.scene : titleSpace ? titleSpace.scene : null;
R.audit = (sc) => auditScene(sc || R.curScene(), camera, renderer, mode);
R.go = (m) => {
  if (m === 'space') { sys = sys || systemAt(G.seed, G.sysIndex || 0); if (mode === 'atmo') atmo.detach(); space.enter(sys, { planetIndex: 0 }); mode = 'space'; started = true; ui.setHint('space'); player.view.visible = false; }
  else if (m === 'atmo') { sys = sys || systemAt(G.seed, 0); const pl = sys.planets.find(p => p.air > 0.3) || sys.planets[0]; space.enter(sys, { planetIndex: 0 }); planetNow = pl; surf.enter(pl, sys); atmo.enterFromSpace(space.forward(), new THREE.Vector3(0, 1, 0)); mode = 'atmo'; started = true; player.view.visible = false; }
  else if (m === 'foot') { enterSurface(planetNow || (sys = sys || systemAt(G.seed, 0)).planets[0], sys); }
  return mode;
};

// ---------- transitions ----------
function fadeTo(fn, ms = 450) {
  ui.fade.style.opacity = 1; setTimeout(() => { fn(); setTimeout(() => { ui.fade.style.opacity = 0; }, 150); }, ms);
}
function enterSurface(planet, system, spawn) {
  sys = system; planetNow = planet; G.sysIndex = system.index; G.planetIndex = planet.i;
  ui.closeHail(); space.endLaw(null, G.bounty > 0);
  surf.enter(planet, system); player.place(surf.scene, surf); mode = 'foot';
  const p = surf.padPos; player.teleport(p.x + 15, p.z + 4, -Math.PI / 2);   // face +x, toward the town
  if (spawn === 'patrol' && surf.B) player.teleport(surf.B.patrol.door.x, surf.B.patrol.door.z, 0);
  if (G.shop && social.shopHere(surf)) {
    social.decorateShop(surf);
    const mins = (Date.now() - G.shop.lastT) / 60000; if (mins > 0.3) { const r = social.offlineSim(surf, mins); if (r && r.sold) toast(`While you were away: ${r.sold} sales, ${fmt(r.income)} cr in the till.`, 'good'); }
    G.shop.lastT = Date.now();
  }
  ui.setHint('foot'); player.view.visible = true; save();
  if (planet.air < 0.3) toast('Thin atmosphere — your oxygen drains outside the dome. Keep canisters.', 'warn');
}
function descend(planet, out, fwd) {
  if (G.shop) G.shop.lastT = G.shop.lastT || Date.now();
  fadeTo(() => {
    sys = space.sys; planetNow = planet; G.sysIndex = sys.index; G.planetIndex = planet.i; ui.closeHail(); space.endLaw(null, G.bounty > 0);
    surf.enter(planet, sys); atmo.enterFromSpace(fwd, out); mode = 'atmo'; player.view.visible = false; ui.setHint('space'); ui.statMode = 'atmo';
    if (G.shop && social.shopHere(surf)) { social.decorateShop(surf); G.shop.lastT = Date.now(); }
    toast(`Entering ${planet.name}'s atmosphere. ${planet.settled ? 'Set down on a pad (auto-land) or anywhere flat.' : 'Land anywhere flat — pads mark outposts.'}`, '');
  }, 500);
}
function landOn(planet) { descend(planet, atmo.outDir, space.forward()); }
function takeOff() {
  if (G.shop) G.shop.lastT = Date.now();
  if (surf.planet && G.fuel < 3) toast('Fuel is nearly empty. Buy fuel at the Outfitters.', 'warn');
  fadeTo(() => { mode = 'atmo'; atmo.takeoff(); player.view.visible = false; ui.setHint('space'); save(); }, 400);
}
function doJump(i) {
  G.fuel -= 25; fadeTo(() => { const s = systemAt(G.seed, i); sys = s; G.sysIndex = i; space.enter(s, { planetIndex: 0 }); space.ship.speed = 400; toast(`Jumped to the ${s.name} system${s.uncharted ? ' (uncharted)' : ''}.`, 'good'); save(); }, 700);
}
function towed() {
  if (mode !== 'space') return;
  if (space.law.state === 'fight' || space.law.state === 'chase') { space.arrest('disabled in a firefight'); return; }
  const settled = space.planetObjs.filter(p => p.p.settled).sort((a, b) => a.pos.distanceTo(space.ship.pos) - b.pos.distanceTo(space.ship.pos))[0] || space.planetObjs[0];
  G.credits = Math.max(0, G.credits - 100); G.hull = 40; G.fuel = Math.max(G.fuel, 20); toast('A tow rig hauled you in. −100 cr.', 'warn');
  fadeTo(() => enterSurface(settled.p, space.sys));
}
function goToJail(info) {
  fadeTo(() => {
    G.confiscated = { pack: G.pack, hand: G.hand }; G.pack = newPack(0); G.hand = null; G.hunger = Math.max(G.hunger, 60); G.thirst = Math.max(G.thirst, 60); G.hp = Math.max(G.hp, 50);
    const settled = space.planetObjs ? space.planetObjs.filter(p => p.p.settled).sort((a, b) => a.pos.distanceTo(space.ship.pos) - b.pos.distanceTo(space.ship.pos))[0] : null;
    planetNow = settled ? settled.p : planetNow || sys.planets[0];
    jail.enter(info, sys, planetNow); player.place(jail.scene, jail); player.teleport(-9, 0, -Math.PI / 2); player.vel.set(0, 0, 0); mode = 'jail'; jail.released = false; jail.busted = false; surf._jailRef = true;
    player.view.visible = true; ui.setHint('foot');
    toast(`Arrested: ${info.reason}. Sentence ${info.sentence}s, fee ${fmt(info.fee)} cr. Your gear was impounded.`, 'warn');
    setTimeout(() => toast('You can wait it out — or pick the lock, grab your gear and sneak out.', ''), 3500);
  }, 600);
}
function restoreGear() {
  const c = G.confiscated; if (!c) return;
  const cur = G.pack; G.pack = c.pack; G.hand = c.hand; G.confiscated = null;
  for (const f of ['front', 'back']) cur[f].forEach(e => { if (e) { if (e.uid) addGun(e); else addItem(e.id, e.n); } });
  Object.entries(cur.pocket).forEach(([id, n]) => addItem(id, n)); cur.sides.forEach(g => g && addGun(g));
  toast('Belongings returned.', 'good');
}
function releasePlayer(escaped) {
  fadeTo(() => {
    if (!escaped) { const fee = jail.info.fee; if (G.credits >= fee) G.credits -= fee; else { G.bounty = fee - G.credits; G.credits = 0; } restoreGear(); G.bounty = G.credits > 0 ? 0 : G.bounty; G.heat = 0; toast(`Released. Fee ${fmt(fee)} cr paid.`, 'good'); }
    else { G.heat = 60; G.bounty += 250; toast('You slipped out! The Patrol is on the lookout.', 'warn'); }
    enterSurface(planetNow, sys, 'patrol');
    if (escaped) { social.shotCop = false; surf.npcs.filter(n => n.prof.cop).forEach(n => { n.hostile = true; n.warned = true; }); }
  }, 500);
}
function startTalk(npc, m) {
  if (npc.dead) return; ui.closeAll(); ui.openTalk(npc, surf, social, m);
}
function markRich() {
  const rich = surf.planet.rich; const nodes = surf.nodes.filter(n => n.alive && rich.includes(n.id)); if (!nodes.length) return null;
  nodes.slice(0, 8).forEach(n => { if (n.marked) return; n.marked = true; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 40, 6), new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); b.position.copy(n.pos); b.position.y += 20; surf.root.add(b); });
  return nodes[0].id;
}
onDeath(() => {
  if (mode === 'extract') { X.onDeath(); return; }
  if (mode === 'jail') { player.dead = false; G.hp = 50; return; }
  const cops = surf.npcs.some(n => n.prof.cop && n.hostile && !n.dead);
  fadeTo(() => {
    player.dead = false; G.hp = 55; G.hunger = Math.max(G.hunger, 40); G.thirst = Math.max(G.thirst, 40); G.oxygen = 100;
    if (cops || G.bounty >= 300) { goToJail({ reason: 'taken down in a firefight', fee: 150 + Math.round(G.bounty * 0.5), sentence: 40 }); return; }
    const lost = Math.round(G.credits * 0.1); G.credits -= lost; toast(`You black out and wake at the clinic. −${fmt(lost)} cr.`, 'warn');
    enterSurface(planetNow, sys);
  });
});

// ---------- game start ----------
function startGame(cont) {
  audioInit(); document.getElementById('title').style.display = 'none'; started = true;
  if (cont && load()) { sys = systemAt(G.seed, G.sysIndex); const pl = sys.planets[G.planetIndex] || sys.planets[0]; if (G.heat > 40) G.heat = 0; enterSurface(pl, sys); toast('Save loaded.', 'good'); }
  else {
    localStorage.removeItem('rimrunner_save_v1'); Object.assign(G, { credits: 350, hp: 100, hunger: 100, thirst: 100, oxygen: 100, tech: { fieldcraft: true }, skills: { mining: 0, gunsmith: 0, trading: 0, piloting: 0, lockpick: 0, speech: 0 }, rep: 0, heat: 0, bounty: 0, quests: [], knownBuyers: {}, shop: null, fuel: 100, hull: 100, ship: { coils: 0, tank: 0 }, visited: {}, charted: 0, time: 0, confiscated: null });
    resetGame(); sys = systemAt(G.seed, 0); G.time = 520; enterSurface(sys.planets[0], sys);
    setTimeout(() => toast(`Welcome to ${sys.planets[0].name}, runner. Mine some rock, talk to people, build something.`, 'good'), 600);
    setTimeout(() => toast(`Hold ${In.label('focus')} on a person to talk. ${In.label('pack')} opens your pack.`), 3500);
  }
  lock(); setInterval(() => { if (started) save(); }, 20000);
}
function titleControls() {
  const L = a => `<kbd>${In.label(a)}</kbd>`; const stick = In.scheme === 'kb' ? 'Mouse + WASD' : In.scheme === 'pad' ? 'Sticks' : 'Touch sticks';
  document.getElementById('tcontrols').innerHTML = `<div><b>On foot</b> ${stick} move/look · ${L('sprint')} sprint · ${L('crouch')} crouch · ${L('jump')} jump · hold ${L('focus')} focus on a person · ${L('aim')} aim (draws pistol) · ${L('fire')} fire / mine · ${L('pack')} backpack · ${L('interact')} use · ${L('holster')} holster · ${L('reload')} reload · ${L('view')} view</div>
  <div><b>Flight</b> ${stick} steer · ${L('sprint')} boost · ${L('jump')} brake · ${L('fire')} fire · ${L('land')} land · ${L('map')} jump map · stay under the spaceway limit</div><div><small>Controls follow whatever you last used (keyboard, gamepad or touch).</small></div>`;
}
In.onScheme(titleControls); titleControls();
document.getElementById('newgame').onclick = () => startGame(false);
const cont = document.getElementById('continue'); if (localStorage.getItem('rimrunner_save_v1')) cont.style.display = 'inline-block'; cont.onclick = () => startGame(true);
document.getElementById('extraction').onclick = () => { audioInit(); document.getElementById('title').style.display = 'none'; mode = 'hub'; started = true; X.openHub(); };
R.xstart = (classId = 'server_m', seed = 1234, depth = 0, corpId) => { audioInit(); document.getElementById('title').style.display = 'none'; started = true; R.forceActive = true; X.startRun(pickContract(seed, depth, { classId, corpId })); };
{ const q = new URLSearchParams(location.search); if (q.has('extract')) { const cl = q.get('class'); setTimeout(() => { if (cl) R.xstart(cl, +(q.get('seed') || 1234), +(q.get('depth') || 0), q.get('corp') || undefined); else document.getElementById('extraction').click(); }, 250); } }
document.getElementById('debugstart')?.addEventListener('click', () => startGame(false));
if (location.search.includes('autostart')) { setTimeout(() => startGame(false), 200); R.forceActive = true; }

// ---------- interaction ----------
// true if a wall-height collider blocks the line from the player's chest to the target (so you can't loot through walls)
function wallBetween(S, ax, az, bx, bz) {
  for (const c of S.colliders || []) {
    if (!(c.maxy >= 1.8)) continue;
    if (ax > c.minx && ax < c.maxx && az > c.minz && az < c.maxz) continue; if (bx > c.minx && bx < c.maxx && bz > c.minz && bz < c.maxz) continue;
    let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [o, d, lo, hi] of [[ax, dx, c.minx, c.maxx], [az, dz, c.minz, c.maxz]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
      let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
    }
    if (t0 <= t1) return true;
  }
  return false;
}
function nearestInteract() {
  const S = mode === 'jail' ? jail : mode === 'extract' ? xs : surf; const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.6, player.pos.z); const f = player.camForward(); let best = null, bs = 1e9;
  for (const it of S.interactables) {
    const dx = it.pos.x - player.pos.x, dz = it.pos.z - player.pos.z, d = Math.hypot(dx, dz); if (d > it.r + 0.3 || Math.abs(it.pos.y - player.pos.y) > 3.5) continue;
    const to = new THREE.Vector3(dx, 0, dz).normalize(); const facing = d < 1.6 ? 1 : f.clone().setY(0).normalize().dot(to);
    if (facing < 0.1) continue; if (it.container && wallBetween(S, player.pos.x, player.pos.z, it.pos.x, it.pos.z)) continue; const sc = d - facing * 1.5; if (sc < bs) { bs = sc; best = { it }; }
  }
  for (const n of S.npcs) {
    if (n.customer) continue; const dx = n.pos.x - player.pos.x, dz = n.pos.z - player.pos.z, d = Math.hypot(dx, dz);
    if (n.dead || n.ko) { if (d < 2.4 && !n.stripped) { const sc = d - 1; if (sc < bs) { bs = sc; best = { strip: n }; } } continue; }
    if (d > 3.4) continue;
    const to = new THREE.Vector3(dx, 0, dz).normalize(); const facing = f.clone().setY(0).normalize().dot(to);
    // sneak up behind someone (crouched) to choke them out
    const nf = new THREE.Vector3(-Math.sin(n.mesh.rotation.y), 0, -Math.cos(n.mesh.rotation.y)); const behind = nf.dot(new THREE.Vector3(-dx, 0, -dz).normalize()) < -0.35;
    if (player.crouch && behind && d < 1.9 && !n.talking && !n.hostile && !n.guard && facing > 0.3) { best = { choke: n }; bs = -9; continue; }
    if (facing < 0.55) continue; const sc = d - facing * 2 - 0.5; if (sc < bs) { bs = sc; best = { npc: n }; }
  }
  return best;
}
function chokeOut(n) {
  n.ko = true; n.koT = 120; n.talking = false; n.approach = false; n.marker.visible = false; sfx('ui', 0.8);
  const seen = surf.npcs.some(c => c !== n && !c.dead && !c.ko && Math.hypot(c.pos.x - n.pos.x, c.pos.z - n.pos.z) < 28 && (c.prof.cop || Math.random() < 0.35));
  if (seen) { surf.npcs.filter(c => c.prof.cop && !c.dead).forEach(c => { c.hostile = true; }); G.bounty += 60; toast('Someone saw that. Bounty +60.', 'warn'); } else toast('Choked out, quietly. They\'ll wake in a couple of minutes.', 'good');
  xp('stealth', 10);
}
function stripNPC(n) {
  if (n.stripped) return; const mine = JSON.parse(JSON.stringify(G.outfit)); const theirs = JSON.parse(JSON.stringify(n.prof.outfit));
  (G.wardrobe = G.wardrobe || []).push(mine); G.wardrobe = G.wardrobe.slice(-6); player.wear(theirs); surf.stripNPC(n); sfx('zip', 0.6);
  toast(`Took the ${theirs.name}.${(theirs.tags || []).includes('police') ? ' Guards and cops will mostly look past you now.' : ''}`, 'good');
}
function doInteract(t) {
  if (t.choke) { chokeOut(t.choke); return; }
  if (t.strip) { stripNPC(t.strip); return; }
  if (t.npc) { if (t.npc.guard) { ui.bubble(t.npc, '"Back to your cell."'); return; } startTalk(t.npc, t.npc.approach && t.npc.pendingQuest ? 'quest' : undefined); return; }
  const it = t.it;
  if (it.act.startsWith('x')) { X.interact(it); return; }
  switch (it.act) {
    case 'board': if (G.hp > 0) { stowForFlight(); takeOff(); } break;
    case 'wardrobe': { const w = G.wardrobe || []; if (!w.length) { toast('Your wardrobe is empty. Take clothes off people who won\'t miss them.', ''); break; } const next = w.shift(); w.push(JSON.parse(JSON.stringify(G.outfit))); G.wardrobe = w; player.wear(next); toast(`Changed into: ${next.name}.`, 'good'); break; }
    case 'lockers': ui.openLockers(); break;
    case 'bench': ui.openBench('craft'); break;
    case 'tech': ui.openBench('tech'); break;
    case 'outfitter': ui.openOutfitter(); break;
    case 'patrol': ui.openPatrol(); break;
    case 'lease': if (social.leaseShop(surf)) { sfx('coin'); } else toast(G.shop ? 'You already lease a shop on ' + G.shop.planetName + '.' : 'You need 400 cr to lease this unit.', 'warn'); break;
    case 'shop': ui.openShop(social, surf); break;
    case 'pickup': { const g = it.data.g; if (addGun(g)) { surf.root.remove(it.data.m); surf.interactables = surf.interactables.filter(x => x !== it); toast(`Picked up ${ITEMS[g.id].name}.`, 'good'); } else toast('No side mount or holster slot free.', 'warn'); break; }
    case 'pickupItem': { const h = it.data.h; if (G.hand || G.held) { toast('Your hand is full.', 'warn'); break; } surf.root.remove(it.data.m); surf.interactables = surf.interactables.filter(x => x !== it); G.held = { id: h.id, n: h.n, item: true }; toast(`Picked up ${ITEMS[h.id].name}.`, 'good'); break; }
    case 'cot': toast('You lie on the cot. Time passes…'); jail.timeLeft = Math.max(0, jail.timeLeft - 6); break;
    case 'celldoor': ui.lockpick(lvl('lockpick'), ok => { if (ok) { jail.openCell(); toast('Click. The cell door swings open.', 'good'); xp('lockpick', 20); } else { toast('The pick snapped. Try again.', 'warn'); jail.timeLeft += 4; xp('lockpick', 4); } }); break;
    case 'evidence': if (G.confiscated) { restoreGear(); } else toast('Locker is empty.'); break;
    case 'jailexit': if (G.confiscated) toast('You still need your gear! (Or leave it behind — reclaim it later at a Patrol desk for 300 cr.)', 'warn'); releasePlayer(true); break;
  }
}
function stowForFlight() { if (pack.blocking) pack.requestClose(); if (G.held) { addItem(G.held.id, G.held.n || 1); G.held = null; } if (G.hand) stowHand(); }

// ---------- main loop ----------
let last = performance.now(), lastPrompt = null;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  pollInput();
  const P = In.pressed;
  const locked = In.locked || In.scheme !== 'kb' || R.forceActive;
  if (started && mode !== 'hub') {
    if (P.back) { if (ui.modal && ui.modal !== 'closing') ui.closeAll(); else if (pack.blocking) pack.requestClose(); }
    if (!ui.hail_ && mode !== 'title') {
      if (P.pack && (mode === 'foot' || mode === 'jail')) { if (pack.isOpen || pack.phase === 'opening' || pack.phase === 'lowering') pack.requestClose(); else if (pack.phase === 'idle' && !ui.modal) pack.begin(player); }
      if (P.pack && mode === 'space' && !ui.modal) ui.openLockers(); else if (P.pack && mode === 'space' && ui.modal === 'lockers') ui.closeAll();
      if (P.journal) { if (ui.modal === 'journal') ui.closeAll(); else if (!ui.modal) ui.openJournal(); }
      if (P.map && mode === 'space') { if (ui.modal === 'map') ui.closeAll(); else if (!ui.modal) ui.openMap(space, !space.inLane); }
    }
    ui.navigate(); ui.updateLock(dt);
    const active = locked && !ui.busy && !ui.hail_;
    paused = !locked && mode !== 'title';
    document.body.classList.toggle('paused', paused && !ui.busy && !ui.hail_);
    if (P.antenna && active && mode === 'extract') xs.placeAntenna(player);
    if (mode === 'space') {
      if (active && P.view) space.cockpit = !space.cockpit;
      space.update(dt, active);
      ui.update(dt, { mode, player, space, surf, prompt: space.hud.canLand ? `<kbd>${In.label('land')}</kbd> Land on ${esc(space.hud.nearName)}` : '', camera });
      camera.updateMatrixWorld(true); Look.render(space.scene, camera, dt);
    } else if (mode === 'atmo') {
      if (active && P.view) atmo.cockpit = !atmo.cockpit;
      atmo.update(dt, active);
      if (mode === 'atmo') {
        surf.update(dt, { pos: atmo.ship.pos, yaw: 0 }, ui, {});
        ui.update(dt, { mode: 'space', player, space: atmo, surf, prompt: atmo.hud.extra || '', camera });
        camera.updateMatrixWorld(true); Look.render(surf.scene, camera, dt);
      }
    } else if (mode === 'foot' || mode === 'jail' || mode === 'extract') {
      const S = mode === 'jail' ? jail : mode === 'extract' ? xs : surf; const xm = mode === 'extract';
      const act2 = active && !(xm && xs.stunT > 0);
      const ctx = { active: act2, npcs: xm ? xs.enemies : S.npcs, surf: S, hitNPC: (n, d, h) => xm ? xs.hitEnemy(n, d, h) : social.hit(n, d, h, player, S, ui), onMined: () => {} };
      player.update(dt, ctx);
      if (pack.scene !== S.scene) { if (pack.scene) [pack.group, pack.ring, pack.label].forEach(o => pack.scene.remove(o)); pack.attach(S.scene); }
      camera.updateMatrixWorld(true); pack.update(dt, player, ctx);
      S.update(dt, player, ui, { release: () => releasePlayer(false), busted: () => bust(), doom: () => X.finish(false, 'The station tore itself apart before you undocked.') });
      const t = act2 && !pack.blocking ? nearestInteract() : null;
      if (act2 && !pack.blocking) {
        if (P.interact && t) doInteract(t);
        for (let i = 0; i < 4; i++) if (P['q' + (i + 1)] && player.focus > 0.5) ui.quick(i);
        if (P.use && !P.interact) player.eatNow();
      }
      if (mode === 'foot') {
        social.updateQuests(dt, S, player, ui); social.updateShop(dt, S, ui);
        social.updateCops(dt, S, player, { copFire: (c, d) => { sfx('shot', 0.5); if (Math.random() < clamp(0.55 - d * 0.01, 0.1, 0.5)) { G.hp -= 7; player.hurtT = 0.4; if (G.hp <= 0 && !player.dead) player.dead = true; } }, arrestOnFoot: r => goToJail({ reason: r, fee: 150 + Math.round(G.bounty * 0.5), sentence: 35 }), bubbleFn: (n, m) => ui.bubble(n, m) });
        if (P.land) { /* nothing */ }
        const nx = nearestInteract; void nx;
        // after stepping near the ship with E: board
      }
      let prompt = pack.isOpen ? (pack.hover ? '' : '') + `<small><kbd>${In.label('interact')}</kbd> take / place · <kbd>${In.label('sprint')}</kbd>+<kbd>${In.label('interact')}</kbd> whole stack · <kbd>${In.label('reload')}</kbd> drop · <kbd>${In.label('holster')}</kbd> stow · <kbd>${In.label('pack')}</kbd> close</small>` : ''; if (t && !ui.focusNpc) prompt = t.choke ? `<kbd>${In.label('interact')}</kbd> Choke out (they can't see you)` : t.strip ? `<kbd>${In.label('interact')}</kbd> Take their clothes (${esc(t.strip.prof.outfit.name)})` : t.npc ? `<kbd>${In.label('interact')}</kbd> Talk to ${t.npc.prof.met ? esc(t.npc.prof.name) : 'stranger'}` : `<kbd>${In.label('interact')}</kbd> ${esc(t.it.label)}`;
      if (mode === 'jail') prompt = prompt || `<small>Sentence: ${Math.ceil(jail.timeLeft)}s</small>`; if (mode === 'jail' && jail.maxAlert > 0.05) prompt += ` <span class="alert">GUARD SUSPICIOUS ${(jail.maxAlert * 100) | 0}%</span>`;
      ui.update(dt, { mode: mode === 'jail' || xm ? 'foot' : mode, player, space, surf: xm ? xs : mode === 'jail' ? { ...jail, planet: { ...jail.planet, name: 'Rimway Holding', kind: 'facility' }, air: 1 } : surf, prompt, camera });
      if (xm) X.updateHud(player);
      Look.render(S.scene, camera, dt);
    }
  } else { renderTitle(dt); if (mode === 'hub') X.hubNav(); }
  In.consume();
  requestAnimationFrame(frame);
}
function bust() {
  jail.info.sentence += 20; jail.info.fee += 100; toast('Caught! Back in the cell, sentence extended.', 'warn');
  fadeTo(() => { const info = jail.info; const left = jail.timeLeft + 20; jail.enter(info, sys, planetNow); jail.timeLeft = left; jail.busted = false; player.teleport(-9, 0, -Math.PI / 2); });
}
function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// title backdrop: a slowly rotating system
let titleSpace = null, titleT = 0;
function renderTitle(dt) {
  if (!titleSpace) { titleSpace = new Space(camera, { land() { }, hail() { }, closeHail() { }, jail() { }, disabled() { } }); titleSpace.enter(systemAt(G.seed, 0), { planetIndex: 1 }); titleSpace.ship.throttle = 0; }
  titleT += dt; titleSpace.ship.speed = 0; titleSpace.model.visible = true; camera.fov = 60;
  const po = titleSpace.planetObjs[1]; const a = titleT * 0.05; camera.position.copy(po.pos).add(new THREE.Vector3(Math.cos(a) * po.collR * 2.6, po.collR * 0.5, Math.sin(a) * po.collR * 2.6)); camera.lookAt(po.pos); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  titleSpace.stars.position.copy(camera.position); titleSpace.neb.position.copy(camera.position); titleSpace.model.visible = false; titleSpace.streaks.visible = false;
  Look.render(titleSpace.scene, camera, dt);
}
requestAnimationFrame(frame);
