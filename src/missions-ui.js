// Missions in play: the Missions screen (Active / Done, one tracked mission, checklist, reward, Set course / Track / Drop), the mission
// board + crew dialogue, the tracked-objective HUD line + marker, and the glue that turns game moments into mission events:
// touchdown on a planet -> 'landed', stepping through a station hatch -> 'docked', talking, taking, reaching a marked spot.
import * as THREE from '../vendor/three.module.js';
import { G, toast, save } from './state.js';
import { In } from './input.js';
import { fmt } from './util.js';
import { systemAt } from './gen.js';
import { buildHuman, makeLook, outfitFor, animateHuman } from './people.js';
import * as M from './missions.js';
import { stationsFor, stationById, isCivil } from './stations.js';
import { StationsInSpace } from './station-space.js';
import { StationInterior } from './station-interior.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const K = a => `<kbd>${esc(In.label(a))}</kbd>`;
const CSS = `
#mtrack{position:absolute;right:18px;top:118px;max-width:340px;text-align:right;font:13px/1.35 system-ui,sans-serif;color:#ffe6b0;text-shadow:0 1px 3px #000;pointer-events:none}
#mtrack b{color:#ffc878;font-weight:700;letter-spacing:.04em;font-size:11px;text-transform:uppercase;display:block;opacity:.85}
#mtrack small{color:#c9b89a;display:block}
#mmark{position:absolute;left:0;top:0;transform:translate(-50%,-50%);pointer-events:none;font:12px system-ui,sans-serif;color:#ffd28a;text-align:center;text-shadow:0 1px 3px #000;display:none}
#mmark i{display:block;width:14px;height:14px;margin:0 auto 2px;border:2px solid #ffc878;transform:rotate(45deg);background:rgba(255,200,120,.18)}
#mprompt{position:absolute;left:50%;bottom:22%;transform:translateX(-50%);font:15px system-ui,sans-serif;color:#fff;background:rgba(10,14,20,.7);padding:6px 14px;border-radius:6px;display:none;pointer-events:none}
.mscreen .mcols{display:flex;gap:14px;min-height:300px}.mscreen .mlist{flex:0 0 38%;display:flex;flex-direction:column;gap:4px}
.mscreen .mlist .nav{padding:7px 9px;border-radius:5px;background:rgba(255,255,255,.05);cursor:pointer}.mscreen .mlist .nav.sel{background:rgba(255,200,120,.18);outline:1px solid #ffc87866}
.mscreen .mdet{flex:1}.mscreen .mdet p{font-style:italic;color:#e8dcc6;margin:6px 0 10px}
.mobj{list-style:none;padding:0;margin:0 0 10px}.mobj li{padding:3px 0;color:#8f8a80}.mobj li.done{text-decoration:line-through;color:#6f6a62}.mobj li.cur{color:#fff;font-weight:600}.mobj li.cur:before{content:'▸ ';color:#ffc878}.mobj li.opt{font-style:italic}
.mscreen .mrew{color:#ffc878;margin-bottom:10px}.mscreen .mbtns{display:flex;gap:8px;flex-wrap:wrap}
.moffer{border:1px solid #ffffff1a;border-radius:6px;padding:8px 10px;margin-bottom:8px}.moffer h3{margin:0 0 4px;font-size:15px}.moffer small{color:#c9b89a}
`;

export function initMissions(app) {
  const W = new MissionWorld(app); window.__rr && (window.__rr.missions = W.debug()); return W;
}

class MissionWorld {
  constructor(app) {
    this.app = app; this.ui = app.ui; this.stn = new StationInterior(app.camera); this.ssp = new StationsInSpace();
    this.prevMode = null; this.prevPlanet = null; this.pollT = 0; this.course = null; this.decor = null; this.decorKey = ''; this.busy = false; this.sel = null;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = document.getElementById('ui') || document.body;
    this.hud = document.createElement('div'); this.hud.id = 'mtrack'; root.appendChild(this.hud);
    this.mark = document.createElement('div'); this.mark.id = 'mmark'; this.mark.innerHTML = '<i></i><span></span>'; root.appendChild(this.mark);
    this.prompt = document.createElement('div'); this.prompt.id = 'mprompt'; root.appendChild(this.prompt);
    M.ensure();
  }
  get active() { const ui = this.ui; return !ui.busy && !ui.hail_ && (In.locked || In.scheme !== 'kb' || !!(window.__rr && window.__rr.forceActive)); }

  // ---------------- per frame ----------------
  update(dt, mode) {
    M.ensure(); const app = this.app, space = app.space, surf = app.surf; this.pollT -= dt;
    let prompt = '';
    if (mode === 'space' && space.sys) {
      const hit = this.ssp.update(space, dt, this.active);
      if (hit && !this.busy) this.dock(hit.st);
      const n = this.ssp.near; if (n && this.ssp.nearD < 2600 && !this.busy) prompt = this.ssp.nearD < 900 ? `${K('interact')} Dock at ${esc(n.st.name)}${n.st.kind === 'civil' ? '' : ' <small>(derelict — hostile)</small>'}` : `${esc(n.st.name)} · ${fmt(this.ssp.nearD)} m <small>— close in to dock</small>`;
      if (this.pollT <= 0) M.event('system', { sys: space.sys.index });
      if (this.course) { const c = this.course; c.t -= dt; const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(space.ship.pos, c.pos, V(0, 1, 0))); space.ship.quat.slerp(want, 1 - Math.exp(-3 * dt)); if (c.t <= 0) this.course = null; }
    }
    if (mode === 'foot' && surf.planet) {
      const loc = M.pLoc(G.sysIndex, surf.planet.i);
      if (this.prevMode !== 'foot' || this.prevPlanet !== surf.planet) { M.event('landed', { loc }); this.decorKey = ''; }
      this.prevPlanet = surf.planet; this.townBoard(surf);
      if (this.pollT <= 0) { const p = app.player.pos; M.event('system', { sys: G.sysIndex }); M.event('reach', { loc, test: o => { const s = this.spotXZ(o, surf); return Math.hypot(p.x - s.x, p.z - s.z) < s.r; } }); }
      this.decorate(surf, loc, dt);
    }
    if (mode !== 'foot') this.prevPlanet = null;
    if (this.pollT <= 0) this.pollT = 0.25;
    this.prevMode = mode;
    this.prompt.innerHTML = prompt; this.prompt.style.display = prompt && !this.ui.modal ? 'block' : 'none';
    this.drawHud(mode);
  }

  // ---------------- docking ----------------
  dock(st) {
    if (this.busy) return; this.busy = true; const app = this.app;
    app.fadeTo(() => {
      try {
        this.stn.enterStation(st); app.setMode('station'); const p = app.player; p.place(this.stn.scene, this.stn); p.dead = false;
        p.teleport(this.stn.spawn.x, this.stn.spawn.z, this.stn.spawn.yaw); p.vel.set(0, 0, 0); p.view.visible = true; this.ui.setHint('foot'); this.dockedId = st.id;
        G.sysIndex = st.sys; M.event('docked', { loc: M.sLoc(st) });
        toast(st.kind === 'civil' ? `Docked at ${st.name}. The mission board is by the hatch.` : `Boarded ${st.name}. Dead air and something moving. Stay sharp.`, st.kind === 'civil' ? 'good' : 'warn');
        app.lock();
      } finally { this.busy = false; }
    }, 500);
  }
  undock() {
    const app = this.app; if (this.busy) return; this.busy = true;
    app.fadeTo(() => {
      try {
        const st = stationById(G.seed, this.dockedId); const space = app.space;
        if (!space.sys || space.sys.index !== st.sys) space.enter(systemAt(G.seed, st.sys), { planetIndex: st.planet });
        app.setMode('space'); this.ssp.placeShip(space, st.id); app.player.view.visible = false; this.ui.setHint('space'); save(); toast(`Undocked from ${st.name}.`, '');
      } finally { this.busy = false; }
    }, 450);
  }
  xinteract(it, X) { const prev = X.S; X.S = this.stn; try { X.interact(it); } finally { X.S = prev; } }
  interact(it) {
    const a = it.act;
    if (a === 'st:undock') this.undock();
    else if (a === 'st:board') this.openBoard(it.data && it.data.station ? it.data.station : this.stn.st);
    else if (a === 'st:talk') this.talk(it.data);
    else if (a === 'st:take') { if (M.event('take', { mid: it.data.mid, oi: it.data.oi })) { this.stn.removeTake(it.data); } else toast('Not yours to take. Yet.', ''); }
  }

  // ---------------- planet side: town board, beacons, people at spots ----------------
  spotXZ(o, surf) {
    const sp = o.spot || {}; if (sp.ref && sp.ref !== 'wild' && surf.B && surf.B[sp.ref] && surf.B[sp.ref].door) { const b = surf.B[sp.ref]; return { x: b.door.x, z: b.door.z, r: sp.r || 6 }; }
    const ang = sp.ang ?? 1, dist = sp.dist ?? 140; return { x: Math.cos(ang) * dist, z: Math.sin(ang) * dist, r: sp.r || 9 };
  }
  townBoard(surf) {
    if (!surf.planet.settled || !surf.B || !surf.B.exchange) return; if (this.boardIt && surf.interactables.includes(this.boardIt)) return;
    const ex = surf.B.exchange; const sys = systemAt(G.seed, G.sysIndex); let st = stationsFor(sys).find(isCivil);
    if (!st) { for (let d = 1; d < 5 && !st; d++) for (const s of [G.sysIndex + d, G.sysIndex - d]) if (s >= 0 && !st) st = stationsFor(systemAt(G.seed, s)).find(isCivil); }
    if (!st) return;
    this.boardIt = { pos: V(ex.back.x + ex.dv[0] * 4.4, 1, ex.back.z + ex.dv[1] * 4.4), r: 2.4, label: 'Mission postings (Exchange desk)', act: 'st:board', data: { station: st } };
    surf.interactables.push(this.boardIt);
  }
  decorate(surf, loc, dt) {
    const S = M.ensure(); const key = surf.root.uuid + loc + JSON.stringify(S.active.map(m => m.objectives.map(o => o.done ? 1 : 0)));
    if (key !== this.decorKey) {
      this.decorKey = key;
      if (this.decor) { this.decor.g.parent && this.decor.g.parent.remove(this.decor.g); this.decor.its.forEach(it => { const i = this.decor.surf.interactables.indexOf(it); if (i >= 0) this.decor.surf.interactables.splice(i, 1); }); }
      const g = new THREE.Group(); surf.root.add(g); const its = [], people = []; this.decor = { g, its, people, surf };
      for (const m of S.active) {
        const cur = M.current(m);
        for (const o of m.objectives) {
          if (o.done || o.loc !== loc || !o.spot) continue; const s = this.spotXZ(o, surf), y = surf.heightAt(s.x, s.z);
          if (o.who) {
            const seed = (o.who.length * 7919 + 13) >>> 0, mesh = buildHuman(makeLook(seed), outfitFor('drifter', seed)); mesh.position.set(s.x + 1.5, y, s.z); g.add(mesh); people.push({ mesh, t: Math.random() * 5 });
            const it = { pos: V(s.x + 1.5, y + 1, s.z), r: 2.6, label: `Talk to ${o.who}`, act: 'st:talk', data: { name: o.who, role: o.role, loc } }; surf.interactables.push(it); its.push(it);
          }
          if (o === cur || o.optional) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 60, 8, 1, true), new THREE.MeshBasicMaterial({ color: o.optional ? 0x9fd8ff : 0xffc878, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); b.position.set(s.x, y + 30, s.z); g.add(b); }
        }
      }
    }
    if (this.decor) for (const p of this.decor.people) { p.t += dt; animateHuman(p.mesh, { dt, v: 0, idleT: p.t, gaze: { x: this.app.player.pos.x, y: this.app.player.pos.y + 1.6, z: this.app.player.pos.z } }); }
  }

  // ---------------- dialogue + board ----------------
  talk(n) {
    const ui = this.ui, loc = n.loc || this.stn.loc, who = n.name; if (n.talkT !== undefined) n.talkT = 4;
    const S = M.ensure(); let line = null;
    const m0 = S.active.find(m => m.objectives.some(o => !o.done && o.who === who && o.loc === loc));
    const o0 = m0 && m0.objectives.find(o => !o.done && o.who === who && o.loc === loc);
    const before = m0 ? m0.objectives.filter(o => o.done).length : 0;
    if (M.event('talk', { loc, who })) line = o0.line || (o0.kind === 'return' ? `"You did it. Here — every credit we said, and a little extra for not asking questions."` : `"Good. That's that, then."`);
    else if (o0) { const c = M.current(m0); line = `"${c ? 'First things first: ' + c.text.toLowerCase() + '.' : 'Not yet.'}"`; }
    void before;
    const giving = S.active.find(m => m.giver === who && m.giverLoc === loc && m.status === 'active');
    if (!line && giving) { const c = M.current(giving); line = `"${c ? 'Still waiting on you. ' + c.text + '.' : 'Thanks again.'}"`; }
    const offers = this.stn.st && this.stn.loc === loc && isCivil(this.stn.st) ? M.offersAt(this.stn.st) : [];
    const mine = offers.filter(m => m.giver === who);
    if (!line) line = mine.length ? mine[0].brief : `"${n.role === 'Bartender' ? 'What\'ll it be? If it\'s work you want, the board by the hatch has postings.' : n.role === 'Dock hand' ? 'Mind the clamps. Ship\'s secure.' : 'Busy shift. The board by the hatch has work, if you\'re asking.'}"`;
    const render = (txt) => {
      ui.open('mtalk', `${ui.head(who, esc(n.role || ''))}<div class="say"><i class="av" style="background:#ffc878"></i><p>${esc(txt)}</p></div><div class="choices"></div>`, 'talkpanel'); ui.wireClose();
      const ch = ui.panel.querySelector('.choices');
      for (const m of mine) if (!M.ensure().taken[m.id]) ch.append(ui.btn(`Accept: ${m.title} (${fmt(m.reward)} cr)`, () => { M.accept(m); render('"Good. Don\'t make me regret it."'); }, 'pri'));
      if (!mine.length && offers.length && !o0) ch.append(ui.btn('Any work going?', () => this.openBoard(this.stn.st)));
      ch.append(ui.btn('Goodbye.', () => ui.closeAll()));
    };
    render(line);
  }
  openBoard(st) {
    const ui = this.ui; const render = () => {
      const offers = M.offersAt(st);
      const rows = offers.map((m, i) => `<div class="moffer"><h3>${esc(m.title)} <small>· ${fmt(m.reward)} cr</small></h3><small>Posted by ${esc(m.giver)} (${esc(m.giverRole)}) at ${esc(st.name)}</small><p style="margin:6px 0;font-style:italic">${esc(m.brief)}</p><ul class="mobj">${m.objectives.slice(0, 4).map(o => `<li class="${o.optional ? 'opt' : ''}">${esc(o.text)}</li>`).join('')}${m.objectives.length > 4 ? '<li>…</li>' : ''}</ul><span class="rb" data-i="${i}"></span></div>`).join('');
      ui.open('mboard', `${ui.head('Mission board', `${esc(st.name)} · postings rotate every shift`)}<div class="rows">${rows || '<em>No postings right now. Check back next shift.</em>'}</div>`, 'tradepanel mscreen'); ui.wireClose();
      ui.panel.querySelectorAll('.rb[data-i]').forEach(rb => { const m = offers[+rb.dataset.i]; rb.append(ui.btn(`Accept (${fmt(m.reward)} cr)`, () => { M.accept(m); render(); }, 'pri')); });
    }; render();
  }

  // ---------------- Missions screen ----------------
  openScreen(tab = 'active') {
    const ui = this.ui; const render = (t) => {
      const S = M.ensure(), list = t === 'active' ? S.active : S.done; const trackedId = (M.tracked() || {}).id;
      if (!list.some(m => m.id === this.sel)) this.sel = (list.find(m => m.id === trackedId) || list[0] || {}).id;
      const m = list.find(x => x.id === this.sel);
      const items = list.map(x => `<div class="nav ${x.id === this.sel ? 'sel' : ''}" data-m="${esc(x.id)}">${x.id === trackedId && t === 'active' ? '◆ ' : ''}<b>${esc(x.title)}</b><br><small>${esc(x.giver)} · ${fmt(x.reward)} cr</small></div>`).join('') || `<em>${t === 'active' ? 'No missions. Mission boards sit beside station hatches and at town Exchange desks; station crews hand out work too.' : 'Nothing finished yet.'}</em>`;
      let det = '';
      if (m) {
        const cur = t === 'active' ? M.current(m) : null;
        det = `<h3>${esc(m.title)}</h3><small>${esc(m.giver)}${m.giverRole ? ' · ' + esc(m.giverRole) : ''}${m.giverLoc ? ' · ' + esc(M.locName(m.giverLoc)) : ''}</small>${m.brief ? `<p>${esc(m.brief)}</p>` : ''}
          <ul class="mobj">${m.objectives.map(o => `<li class="${o.done ? 'done' : o === cur ? 'cur' : ''} ${o.optional ? 'opt' : ''}">${esc(o.text)}${o.optional && o.bonus ? ` <small>(+${o.bonus} cr)</small>` : ''}</li>`).join('')}</ul>
          ${m.carry && m.carry.length ? `<small>Carrying: ${m.carry.map(esc).join(', ')}</small>` : ''}<div class="mrew">Reward: ${fmt(m.reward)} cr${t === 'done' ? ' · paid' : ''}</div><div class="mbtns"></div>`;
      }
      ui.open('missions', `${ui.head('Missions', `${S.active.length} active · ${S.done.length} done`)}<div class="tabs"><button class="${t === 'active' ? 'on' : ''}" data-t="active">Active</button><button class="${t === 'done' ? 'on' : ''}" data-t="done">Done</button><button data-j>Journal</button></div><div class="mcols"><div class="mlist">${items}</div><div class="mdet">${det}</div></div>`, 'tradepanel mscreen'); ui.wireClose();
      ui.panel.querySelectorAll('[data-t]').forEach(b => b.onclick = () => render(b.dataset.t));
      ui.panel.querySelector('[data-j]').onclick = () => ui.openJournal();
      ui.panel.querySelectorAll('[data-m]').forEach(d => d.onclick = () => { this.sel = d.dataset.m; render(t); });
      const bx = ui.panel.querySelector('.mbtns');
      if (bx && m && t === 'active') {
        if (m.id !== trackedId) bx.append(ui.btn('Track', () => { M.track(m.id); render(t); }, 'pri'));
        bx.append(ui.btn('Set course', () => { M.track(m.id); this.setCourse(m); }, m.id === trackedId ? 'pri' : ''));
        bx.append(ui.btn('Drop mission', () => { M.drop(m.id); render(t); }));
      }
    }; render(tab);
  }
  setCourse(m) {
    const o = M.current(m); if (!o) return; const app = this.app, mode = app.mode, space = app.space;
    const L = M.parseLoc(o.loc), sysT = o.kind === 'travel' ? o.sys : L ? L.sys : G.sysIndex;
    if (sysT !== G.sysIndex && (mode !== 'space' || !space.sys || space.sys.index !== sysT)) {
      if (mode !== 'space') { toast(`Course plotted to the ${systemAt(G.seed, sysT).name} system. Get to your ship.`, ''); return; }
      if (space.inLane) { toast('Leave the spaceway before you jump.', 'warn'); return; }
      if (G.fuel < 25) { toast('Not enough fuel to jump (25).', 'warn'); return; }
      this.ui.closeAll(); app.jump(sysT); return;
    }
    if (mode === 'space') { const pos = this.worldTarget('space', m, o); if (pos) { this.course = { pos, t: 2.5 }; this.ui.closeAll(); toast(`Course set: ${M.locName(o.loc)}.`, 'good'); } return; }
    toast(L && L.t === 's' && mode !== 'station' ? `Course set for ${M.locName(o.loc)}. Take off and follow the marker.` : 'Tracking. Follow the marker.', '');
    this.ui.closeAll();
  }

  // ---------------- HUD ----------------
  worldTarget(mode, m, o) {
    const app = this.app, L = M.parseLoc(o.loc); if (!L) return null;
    if (mode === 'space') { const sp = app.space; if (!sp.sys || sp.sys.index !== L.sys) return null; if (L.t === 'p') return sp.planetObjs[L.i] ? sp.planetObjs[L.i].pos.clone() : null; const so = this.ssp.byId(`${L.sys}:${L.i}`); return so ? so.pos.clone() : null; }
    if (mode === 'foot') { const surf = app.surf; if (L.t !== 'p' || L.sys !== G.sysIndex || !surf.planet || surf.planet.i !== L.i || !o.spot) return null; const s = this.spotXZ(o, surf); return V(s.x, surf.heightAt(s.x, s.z) + 2.2, s.z); }
    if (mode === 'station') { if (this.stn.loc === o.loc) return this.stn.targetPos(o, m); return V(-6.1, 1.6, this.stn.mine.z); }
    return null;
  }
  drawHud(mode) {
    const m = (mode === 'space' || mode === 'foot' || mode === 'station') && !this.ui.modal ? M.tracked() : null; const o = m && (M.current(m) || m.objectives.find(x => !x.done));
    if (!m || !o) { this.hud.innerHTML = ''; this.mark.style.display = 'none'; return; }
    const L = M.parseLoc(o.loc), here = mode === 'space' ? (this.app.space.sys || {}).index : G.sysIndex, tsys = o.kind === 'travel' ? o.sys : L ? L.sys : here;
    let hint = '';
    if (tsys !== here) hint = mode === 'space' ? `Jump to the ${systemAt(G.seed, tsys).name} system (${K('map')} jump map)` : 'Back to your ship, then jump';
    else if (mode === 'foot' && L && (L.t === 's' || L.i !== (this.app.surf.planet || {}).i)) hint = 'Take off — the marker waits in orbit';
    else if (mode === 'station' && this.stn.loc !== o.loc) hint = 'Undock at the hatch';
    else if (mode === 'space' && L && L.t === 'p' && o.kind !== 'land') hint = `Land on ${M.locName(o.loc)} (${K('land')})`;
    const key = [m.id, o.text, hint, In.scheme, In.brand].join('|');
    if (this._hk !== key) { this._hk = key; this.hud.innerHTML = `<b>◆ ${esc(m.title)}</b>${esc(o.text)}${hint ? `<small>${hint}</small>` : ''}<small style="opacity:.7">${K('journal')} missions</small>`; }
    const pos = this.worldTarget(mode, m, o);
    if (!pos) { this.mark.style.display = 'none'; return; }
    const cam = this.app.camera, p = pos.clone().project(cam); let x = p.x, y = p.y; const behind = p.z > 1;
    if (behind) { x = -x; y = -y; }
    const edge = behind || Math.abs(x) > 0.95 || Math.abs(y) > 0.9; if (edge) { const k = Math.max(Math.abs(x) / 0.95, Math.abs(y) / 0.9); x /= k; y /= k; }
    const from = mode === 'space' ? this.app.space.ship.pos : this.app.player.pos, d = pos.distanceTo(from);
    this.mark.style.display = 'block'; this.mark.style.left = ((x * 0.5 + 0.5) * innerWidth) + 'px'; this.mark.style.top = ((-y * 0.5 + 0.5) * innerHeight) + 'px';
    this.mark.lastChild.textContent = d > 1500 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
  }

  // ---------------- debug (window.__rr.missions) ----------------
  debug() {
    const W = this; return {
      M, W, get stn() { return W.stn; }, get ssp() { return W.ssp; }, open: () => W.openScreen(),
      stations: (i = G.sysIndex) => stationsFor(systemAt(G.seed, i)),
      give(tpl = 'survey', seed = 1) { const A = stationsFor(systemAt(G.seed, 0)).find(isCivil); const m = M.makeMission(tpl, seed, A); M.accept(m); return m; },
      dock(id = '0:0') { const st = stationById(G.seed, id); const sp = W.app.space; if (!sp.sys || sp.sys.index !== st.sys) { sp.enter(systemAt(G.seed, st.sys), { planetIndex: st.planet }); } G.sysIndex = st.sys; W.dock(st); return st.name; },
      land(i = 1, sys = G.sysIndex) { const s = systemAt(G.seed, sys); W.app.enterSurface(s.planets[i], s); return s.planets[i].name; },
      board() { W.openBoard(W.stn.st || stationsFor(systemAt(G.seed, 0)).find(isCivil)); },
      toStation() { const o = W.ssp.objs[0]; if (!o) return null; const s = W.app.space.ship; s.pos.copy(o.pos).add(o.pos.clone().sub(o.host.pos).normalize().multiplyScalar(1400)); s.quat.setFromRotationMatrix(new THREE.Matrix4().lookAt(s.pos, o.pos, V(0, 1, 0))); s.speed = 0; s.throttle = 0; return o.st.name; },
      next() { const m = M.tracked(); const o = m && M.current(m); if (!o) return null; const L = M.parseLoc(o.loc);
        if (o.kind === 'travel') { G.sysIndex = o.sys; M.event('system', { sys: o.sys }); }
        else if (o.kind === 'land') this.land(L.i, L.sys); else if (o.kind === 'enter') this.dock(`${L.sys}:${L.i}`);
        else if (o.kind === 'take') M.event('take', { mid: m.id, oi: m.objectives.indexOf(o) });
        else if (o.who) M.event('talk', { loc: o.loc, who: o.who }); else M.event('reach', { loc: o.loc, test: q => q === o });
        return o.text; },
    };
  }
}
