// Extraction mode: hub (between-ship screen), in-run HUD, and the run controller.
import { G, toast, addItem, count, removeItem, lvl, uid } from './state.js';
import { ITEMS, GUN } from './data.js';
import { In } from './input.js';
import { sfx } from './audio.js';
import { fmt } from './util.js';
import { CORPS, CLASSES, ROOM_LABEL } from './ships.js';
import { Meta, metaSave, metaLoad, metaReset, makeOffers, packValue, startingKit, ARMOR, SHOP_GUNS, SHOP_KIT } from './extract.js';
import { talk as talkTo } from './crew.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const mmss = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const hex = n => '#' + n.toString(16).padStart(6, '0');

export class Extraction {
  constructor(app) {
    this.app = app; this.S = app.S; this.active = false; this.hubOpen = false; metaLoad();
    this.hub = document.createElement('div'); this.hub.id = 'xhub'; this.hub.style.display = 'none'; document.body.appendChild(this.hub);
    this.hudEl = document.createElement('div'); this.hudEl.id = 'xhud'; this.hudEl.style.display = 'none'; document.body.appendChild(this.hudEl);
    this.log = [];
    this.hub.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) this.act(b.dataset.a); });
  }
  // ---------------------------------------------------------------- hub ----------------------------------------------------------------
  openHub(note) {
    this.hubOpen = true; this.active = false; this.hudEl.style.display = 'none'; document.body.classList.remove('xrun', 'xstun');
    if (!Meta.offers) { Meta.offers = makeOffers(); metaSave(); }
    const tb = document.getElementById('toasts'); if (tb) tb.innerHTML = '';
    this.note = note || this.note; this.render(); this.hub.style.display = 'block';
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
  }
  closeHub() { this.hubOpen = false; this.hub.style.display = 'none'; }
  render() {
    const m = Meta, L = m.last, ar = ARMOR[m.armor];
    const gunBtns = m.owned.map(id => `<button data-a="primary:${id}" class="${m.primary === id ? 'pri' : ''}">${esc(ITEMS[id].name)}</button>`).join('');
    const gs = id => GUN[ITEMS[id].gun];
    const shop = SHOP_GUNS.filter(([id, cost, need]) => !m.owned.includes(id) && m.best >= need).map(([id, cost]) => `<div class="xrow"><span>${esc(ITEMS[id].name)} <small>${gs(id).dmg}${gs(id).pellets > 1 ? '×' + gs(id).pellets : ''} dmg · ${gs(id).mag} mag</small></span><button data-a="buygun:${id}" ${m.credits < cost ? 'disabled' : ''}>${fmt(cost)} cr</button></div>`).join('') || '<small>Nothing new in stock. Go deeper.</small>';
    const locked = SHOP_GUNS.filter(([id, c, need]) => !m.owned.includes(id) && m.best < need).length;
    const nextA = ARMOR[m.armor + 1];
    const kit = SHOP_KIT.map(([id, cost]) => `<div class="xrow"><span>${esc(ITEMS[id].name)} <small>carry ${m.kit[id] || 0}</small></span><button data-a="buykit:${id}" ${m.credits < cost ? 'disabled' : ''}>+1 · ${cost} cr</button></div>`).join('');
    const offers = (m.offers || []).map((c, i) => {
      const cl = CLASSES[c.classId], co = CORPS[c.corpId]; const stars = '★'.repeat(c.risk) + '☆'.repeat(5 - c.risk);
      return `<div class="xcard" style="border-color:${hex(co.accent)}"><div class="xct"><b>${esc(cl.label)}</b> <span class="xsz ${cl.size}">${cl.size.toUpperCase()}</span>${c.story ? ' <span class="xtag">STORY</span>' : ''}${c.radio ? ` <span class="xtag">RADIO · ${c.radio.toUpperCase()}</span>` : ''}</div>
      <div class="xcs" style="color:${hex(co.accent)}">${esc(co.name)} <small>— ${esc(co.tag)}</small></div><div class="xcb">${c.story ? esc(c.story.blurb) : 'Distress: ' + esc(c.reason)}</div>
      <div class="xcm"><span>${stars}</span><span>${cl.size === 'behemoth' ? 'AI range limited — bring relays' : 'AI covers the whole station'}</span><span>${mmss(cl.time * 60)} to cascade</span><span>pays ${fmt(c.story ? c.story.reward : c.payout)} cr</span></div>
      <button class="pri" data-a="go:${i}">Dock &amp; board</button></div>`;
    }).join('');
    const last = L ? `<div class="xlast ${L.ok ? 'ok' : 'bad'}"><b>${L.ok ? 'EXTRACTED' : 'LOST'}</b> — ${esc(L.name)}<br>${L.ok ? `Hauled ${fmt(L.value)} cr + contract ${fmt(L.payout)} cr` : esc(L.why || 'Everything you carried is gone.')}<br><small>${L.kills} down · ${mmss(L.time)} aboard${L.guns && L.guns.length ? ' · kept: ' + L.guns.map(esc).join(', ') : ''}</small></div>` : '<div class="xlast"><b>NEW CAREER</b><br>Dock, loot, shoot, get out. Anything you carry is lost if you die.</div>';
    this.hub.innerHTML = `<div class="xh"><div class="xtop"><h1>EXTRACTION</h1><span>Bank <b>${fmt(m.credits)}</b> cr</span><span>Chain <b>${m.chain}</b></span><span>Best <b>${m.best}</b></span><span>${m.extracted} out · ${m.deaths} lost</span><span class="sp"></span><button data-a="quit">Title</button></div>
      <div class="xcols"><div class="xcol"><h3>Ship AI debrief</h3>${last}${this.note ? `<div class="xnote">${esc(this.note)}</div>` : ''}
        <h3>Loadout</h3><div class="xguns">${gunBtns}</div>
        <div class="xrow"><span>Armor: <b>${ar.n}</b> <small>${Math.round(ar.red * 100)}% off bullets${m.armor ? ' · useless in a storm' : ''}</small></span>${nextA ? `<button data-a="armor" ${m.credits < nextA.cost ? 'disabled' : ''}>${nextA.n} · ${fmt(nextA.cost)} cr</button>` : '<small>maxed</small>'}</div>
        <h3>Supplies</h3>${kit}<h3>Arms dealer</h3>${shop}${locked ? `<small>${locked} more weapon${locked > 1 ? 's' : ''} unlock deeper in the chain.</small>` : ''}</div>
        <div class="xcol"><h3>Contracts <small>${m.radio ? '· police radio online' : ''}</small></h3>${offers}<div class="xrow"><button data-a="reroll" ${m.credits < 50 ? 'disabled' : ''}>Scan for other distress calls · 50 cr</button><button data-a="reset">Wipe career</button></div></div></div></div>`;
  }
  act(a) {
    const [k, v] = a.split(':'), m = Meta; sfx('ui', 0.6);
    if (k === 'primary') m.primary = v;
    else if (k === 'buygun') { const e = SHOP_GUNS.find(g => g[0] === v); if (e && m.credits >= e[1]) { m.credits -= e[1]; m.owned.push(v); m.primary = v; } }
    else if (k === 'buykit') { const e = SHOP_KIT.find(g => g[0] === v); if (e && m.credits >= e[1]) { m.credits -= e[1]; m.kit[v] = Math.min(v === 'antenna' ? 6 : 15, (m.kit[v] || 0) + 1); } }
    else if (k === 'armor') { const n = ARMOR[m.armor + 1]; if (n && m.credits >= n.cost) { m.credits -= n.cost; m.armor++; } }
    else if (k === 'reroll') { if (m.credits >= 50) { m.credits -= 50; m.runs++; m.offers = makeOffers(); } }
    else if (k === 'reset') { if (confirm('Wipe your whole extraction career?')) { metaReset(); Meta.offers = makeOffers(); } }
    else if (k === 'quit') { this.closeHub(); this.app.toTitle(); return; }
    else if (k === 'go') { const c = m.offers[+v]; if (c) { this.startRun(c); return; } }
    metaSave(); this.note = ''; this.render();
  }
  hubNav() {
    if (!this.hubOpen || In.scheme !== 'pad') return; const items = [...this.hub.querySelectorAll('button')].filter(e => !e.disabled && e.offsetParent); if (!items.length) return;
    let cur = items.find(e => e.classList.contains('focus')); const dirs = { q1: [0, -1], q3: [0, 1], q4: [-1, 0], q2: [1, 0] }; let moved = false;
    for (const k in dirs) if (In.pressed[k]) {
      if (!cur) { cur = items[0]; moved = true; break; } const r = cur.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2; let best = null, bd = 1e9;
      for (const e of items) { if (e === cur) continue; const q = e.getBoundingClientRect(), dx = q.x + q.width / 2 - cx, dy = q.y + q.height / 2 - cy, al = dx * dirs[k][0] + dy * dirs[k][1]; if (al <= 4) continue; const sc = Math.hypot(dx, dy) + Math.abs(dx * dirs[k][1] + dy * dirs[k][0]) * 2; if (sc < bd) { bd = sc; best = e; } }
      if (best) cur = best; moved = true;
    }
    if (moved && cur) { items.forEach(e => e.classList.remove('focus')); cur.classList.add('focus'); cur.scrollIntoView({ block: 'nearest' }); }
    if (In.pressed.jump && cur) cur.click();
  }
  // ---------------------------------------------------------------- run ----------------------------------------------------------------
  startRun(contract) {
    const { S, app } = this; this.log = [];
    app.fadeTo(() => {
      this.closeHub(); startingKit(); app.resetPack(); S.enter(contract, { doom: () => this.finish(false, 'The station tore itself apart before you undocked.'), log: m => this.log.push(m) });
      app.setMode('extract'); app.player.place(S.scene, S); app.player.dead = false; app.player.teleport(S.spawn.x, S.spawn.z, S.spawn.yaw); app.player.vel.set(0, 0, 0);
      this.active = true; this.hudEl.style.display = 'block'; document.body.classList.add('xrun'); app.ui.setHint('foot'); app.player.view.visible = true;
      toast(`Docked at ${contract.name}. ${contract.reason}.`, ''); setTimeout(() => toast(`The hatch behind you is your way out. ${S.ship.cls.size === 'behemoth' ? 'Behemoth: stay in range of your ship AI or drop relays (' + In.label('antenna') + ').' : 'Your ship AI will call arrivals.'}`, ''), 1800);
      app.lock();
    }, 550);
  }
  finish(ok, why) {
    if (!this.active) return; const { S } = this; this.active = false; S.over = true; const c = S.contract, pv = packValue(), guns = [];
    const note = { name: c.name, ok, kills: S.kills, time: S.t, why };
    if (ok) {
      const story = c.story; const payout = story ? story.reward : c.payout; Meta.credits += pv.value + payout; note.value = pv.value; note.payout = payout;
      for (const it of pv.list) if (it.gun && !Meta.owned.includes(it.id)) { Meta.owned.push(it.id); guns.push(ITEMS[it.id].name); }
      const kit = {}; for (const it of pv.list) if (it.keep) kit[it.id] = Math.min(it.id === 'antenna' ? 6 : 15, (kit[it.id] || 0) + it.n); Meta.kit = kit;
      Meta.chain++; Meta.best = Math.max(Meta.best, Meta.chain); Meta.extracted++;
      if (story) { Meta.story[story.id] = true; if (story.unlocks === 'radio') { Meta.radio = true; this.note = 'Police radio unlocked: prison and armory break-ins are now on the board.'; } }
    } else { Meta.chain = 0; Meta.deaths++; Meta.kit = { ammo: 4, medkit: 1, ration: 1, water: 1, antenna: 1 }; Meta.credits -= Math.round(Meta.credits * 0.1); note.why = why || 'You died aboard. Everything you carried is gone.'; }
    Meta.runs++; note.guns = guns; Meta.last = note; Meta.offers = makeOffers(); metaSave();
    this.app.fadeTo(() => { this.hide(); this.app.setMode('hub'); this.openHub(); }, 600);
  }
  onDeath() { this.finish(false, 'You went down aboard. Everything you carried is gone.'); }
  interact(it) {
    const { S } = this;
    switch (it.act) {
      case 'xextract': this.finish(true); break;
      case 'xconsole': if (S.medic) toast(S.medic.here ? 'The medic is waiting at your hatch.' : `Medic ETA ${mmss(S.medic.t)}.`, ''); else if (Meta.credits < 150) toast('A medic run costs 150 cr from your bank.', 'warn'); else { Meta.credits -= 150; metaSave(); S.medic = { t: 40, here: false }; toast('Medic called: ETA 0:40. Be at your hatch. −150 cr.', 'good'); } break;
      case 'xmedic': G.hp = 100; S.stunT = 0; toast('Patched up. Back to work.', 'good'); sfx('good', 0.8); break;
      case 'xloot': this.loot(it.data, it); break;
      case 'xsalvage': this.salvage(it.data, it); break;
      case 'xcrew': this.talk(it.data); break;
      case 'xvault': this.vault(it.data, it); break;
    }
  }
  entriesOf(ids) { return ids.map(id => ITEMS[id].kind === 'gun' ? { id, q: 1, uid: uid(), mag: GUN[ITEMS[id].gun].mag } : { id, n: 1 }); }
  // searching pulls your bag out in front of you with the contents laid beside it
  openTray(title, entries, onClose) { this.app.openLoot({ title, items: entries, onClose }); }
  loot(c, it) {
    if (c.opened) return; const { S, app } = this; const st = app.stash;
    if (st.cur === c) { st.close(); return; }
    const open = () => {
      if (!c.entries) c.entries = this.entriesOf(c.items);
      st.open(c, () => { c.opened = true; c.led.material.color.setHex(0x333840); S.interactables = S.interactables.filter(x => x !== it); S.opened++; });
    };
    if (c.locked) { app.ui.lockpick(lvl('lockpick'), ok => { if (ok) { c.locked = false; c.led.material.color.setHex(0x55ff88); open(); } else { toast('The pick snapped.', 'warn'); S.alertAround(c.x, c.z, 10); } }); } else open();
  }
  salvage(e, it) {
    const { S } = this; if (e.salv.opened) return; const sv = e.salv;
    if (sv.note && !sv.noted) { sv.noted = true; toast(sv.note, ''); }
    S.exposeInnards(e); if (!sv.entries) sv.entries = this.entriesOf(sv.ids);
    this.openTray(it.label, sv.entries, rest => { sv.entries = rest; if (!rest.length) { sv.opened = true; S.interactables = S.interactables.filter(x => x !== it); } });
  }
  talk(e) {
    const { S } = this; const t = talkTo(S, e); if (!t) return;
    toast(`${e.def.name}: "${t.say}"`, 'good');
    if (t.give && !e.gave) { e.gave = true; const ent = this.entriesOf([t.give]); this.openTray(`${e.def.name} hands you something`, ent, () => {}); }
  }
  vault(vd, it) {
    const { S, app } = this; if (vd.open) return;
    const openIt = silent => { vd.open = true; vd.mesh.visible = false; S.colliders = S.colliders.filter(c => c !== vd.col); S.interactables = S.interactables.filter(x => x !== it); S.rebuildNav(); sfx('zip', 0.9); if (!silent) S.raiseAlarm(); };
    if (count('keycard')) { removeItem('keycard', 1); toast('Keycard accepted. The vault door opens quietly.', 'good'); openIt(true); return; }
    app.ui.lockpick(lvl('lockpick'), ok => { if (ok) { toast('Cracked — and the alarm is screaming.', 'warn'); openIt(false); } else { toast('The pick snapped. The door registered the tampering.', 'warn'); S.alertAround(vd.pos.x, vd.pos.z, 25); } });
  }
  // ---------------------------------------------------------------- HUD ----------------------------------------------------------------
  updateHud(player) {
    if (!this.active) return; const S = this.S, ship = S.ship, left = ship.time - S.t, link = S.link !== false;
    const rows = [];
    if (link) { for (const e of S.events) if (e.announced && !e.done) rows.push(`<div class="xe ${e.kind}"><span>${e.kind === 'transport' ? 'POD' : e.kind === 'security' ? 'SECURITY' : 'ION STORM'}${e.port ? ' · PORT ' + e.port.id : ''}</span><b>${mmss(e.etaT - S.t)}</b></div>`); if (S.alarm && !S.alarmFired) rows.push(`<div class="xe military"><span>MILITARY RESPONSE</span><b>${mmss(S.alarmEta - S.t)}</b></div>`); }
    if (S.stormT > 0) rows.push(`<div class="xe storm"><span>STORM ACTIVE — SHIELDED ROOMS ONLY</span><b>${mmss(S.stormT)}</b></div>`);
    if (S.medic) rows.push(`<div class="xe medic"><span>MEDIC ${S.medic.here ? 'AT HATCH' : 'INBOUND'}</span><b>${mmss(S.medic.t)}</b></div>`);
    const pv = packValue(); const room = S.roomAt(player.pos.x, player.pos.z);
    this.hudEl.innerHTML = `<div class="xl1"><b>${esc(ship.corp.short)}</b> ${esc(ship.cls.label)} <small>${ship.cls.size}</small></div>
      <div class="xl2 ${left < 120 ? 'crit' : ''}">${link ? `CASCADE <b>${mmss(left)}</b>` : '<b class="nolink">NO LINK TO SHIP AI</b> <small>timers hidden — drop a relay (' + In.label('antenna') + ')</small>'}</div>${rows.join('')}
      <div class="xl3">Haul <b>${fmt(pv.value)}</b> cr · ${ARMOR[Meta.armor].n} · ${room ? ROOM_LABEL[room.type] + (room.shield ? ' (shielded)' : '') : player.pos.x < 0.2 ? 'YOUR SHIP' : 'Gallery'}${ship.cls.size === 'behemoth' ? ` · relays ${count('antenna')}` : ''}</div>`;
    document.body.classList.toggle('xstun', S.stunT > 0); const cr = document.getElementById('creds'); if (cr) cr.innerHTML = `<b>${fmt(Meta.credits)}</b> cr bank`; const sl = document.getElementById('statline'); if (sl) sl.textContent = `${ship.contract.name} · ${ship.cls.label}`;
  }
  hide() { this.active = false; this.hudEl.style.display = 'none'; document.body.classList.remove('xrun', 'xstun'); }
}
