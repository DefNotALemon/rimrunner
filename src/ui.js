// All the HTML UI: HUD, backpack, dialogue, trade, crafting, lockers, shop, hails, lockpicking, journal, map
import * as THREE from '../vendor/three.module.js';
import { ITEMS, GUN, TECH, RECIPES, PACK_NAMES, PACK_SLOTS } from './data.js';
import { G, toast, count, addItem, removeItem, itemValue, isGun, isSmall, canHolster, gunCls, holdFrom, stowHand, takeAt, putAt, allGuns, addGun, canResearch, research, canCraft, craft, upgradePack, lvl, benchTier, freeSlots, canAdd, uid } from './state.js';
import { In } from './input.js';
import { fmt, clamp } from './util.js';
import { systemAt } from './gen.js';
import { sfx } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function gunSVG(id, col) {
  const c = ITEMS[id].color || '#999';
  const shapes = {
    pistol: `<path d="M8 22h30v8H26v14h-9V30H8z" fill="${c}"/>`,
    coach: `<path d="M4 24h46v6H30l-6 14h-9l4-14H4z" fill="${c}"/><rect x="30" y="30" width="16" height="3" fill="#6a4a2a"/>`,
    rifle: `<path d="M2 24h50v5H34l-4 16h-9l3-16H2z" fill="${c}"/><rect x="40" y="29" width="14" height="5" fill="#6a4a2a"/><rect x="14" y="20" width="14" height="3" fill="#222"/>`,
    breacher: `<path d="M2 23h52v8H34l-4 14h-9l3-14H2z" fill="${c}"/><rect x="36" y="31" width="18" height="5" fill="#7a5a3a"/>`,
    arc: `<path d="M2 22h52v9H34l-4 14h-9l3-14H2z" fill="${c}"/><rect x="8" y="24" width="30" height="3" fill="#48d6ff"/>`,
  };
  return `<svg viewBox="0 0 56 56" class="gun">${shapes[id]}</svg>`;
}
const gunClsLabel = id => ({ pistol: 'Pistol', smallshotgun: 'Small shotgun', long: 'Long gun' }[gunCls(id)]);

export class UI {
  constructor(hooks) {
    this.hooks = hooks; this.modal = null; this.hail_ = null; this.bubbles = []; this.toasts = [];
    this.root = $('#ui'); this.mode = 'foot'; this.sel = null; this.focusNpc = null;
    G.toastFn = (m, k) => this.toast(m, k);
    this.hud = el('div', 'hud'); this.root.appendChild(this.hud);
    this.hud.innerHTML = `
      <div id="tl"><div id="creds"></div><div id="bars"></div><div id="statline"></div></div>
      <div id="toasts"></div>
      <div id="cross"></div><div id="prompt"></div><div id="mineBar"><i></i></div>
      <div id="focusUI"></div>
      <div id="gunHud"></div>
      <div id="flight"></div>
      <div id="hint"></div>
      <div id="wanted"></div>
      <div id="vig"></div><div id="hurt"></div><div id="idleHint"></div>`;
    this.panel = el('div', 'panel hidden'); this.root.appendChild(this.panel);
    this.hailEl = el('div', 'hail hidden'); this.root.appendChild(this.hailEl);
    this.fade = el('div', 'fade'); this.root.appendChild(this.fade);
    document.addEventListener('keydown', e => { if (this.modal && /^Digit[1-9]$/.test(e.code) && !e.repeat) { const b = this.panel.querySelectorAll('[data-k]'); const t = [...b].find(x => x.dataset.k === e.code.slice(5)); if (t) t.click(); } });
    document.addEventListener('keydown', e => { if (this.hail_ && /^Digit[1-9]$/.test(e.code) && !e.repeat) { const b = this.hailEl.querySelectorAll('[data-k]'); const t = [...b].find(x => x.dataset.k === e.code.slice(5)); if (t) t.click(); } });
    In.onScheme(() => this.refreshHint());
  }
  get busy() { return !!this.modal; }

  // ---------- toasts / bubbles / prompts ----------
  toast(msg, kind = '') {
    sfx(kind === 'warn' ? 'warn' : kind === 'good' ? 'good' : 'ui', 0.5);
    const t = el('div', 'toast ' + kind, esc(msg)); const box = $('#toasts'); box.appendChild(t); while (box.children.length > 5) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 4200); setTimeout(() => t.remove(), 4800);
  }
  bubble(npc, text) {
    const b = el('div', 'bubble', esc(text)); this.root.appendChild(b); this.bubbles.push({ el: b, npc, t: 5 }); if (npc.talking) { /* keep */ }
  }
  sayShop(msg) { this.toast('Shop: ' + msg, 'good'); }

  // ---------- HUD ----------
  update(dt, S) {
    const { mode, player, space, surf, prompt, camera } = S; this.mode = mode;
    $('#creds').innerHTML = `<b>${fmt(G.credits)}</b> cr`;
    const bar = (n, v, c) => `<div class="bar"><span>${n}</span><i style="width:${clamp(v, 0, 100)}%;background:${c}"></i></div>`;
    $('#bars').innerHTML = mode === 'space' ? bar('FUEL', G.fuel, '#e8742a') + bar('HULL', G.hull, '#7dd86a') : bar('HP', G.hp, '#e05050') + bar('FOOD', G.hunger, '#d9a441') + bar('WATER', G.thirst, '#58b4ff') + (S.surf && S.surf.air < 0.3 || G.oxygen < 99 ? bar('O2', G.oxygen, '#9fe8ff') : '') + (G.temp > 5 ? bar(S.surf && S.surf.planet.temp < 0.5 ? 'COLD' : 'HEAT', G.temp, '#ff9a5a') : '');
    const day = surf ? (() => { const t = (G.time / 600 + 0.3) % 1; return t < 0.08 ? 'Dawn' : t < 0.4 ? 'Day' : t < 0.5 ? 'Dusk' : 'Night'; })() : '';
    $('#statline').textContent = mode === 'space' ? `${space.sys.name} system${space.sys.uncharted ? ' · uncharted' : ''}` : `${surf.planet.name} · ${surf.planet.kind}${mode === 'foot' && surf.planet.air < 0.3 ? ' · thin air' : ''} · ${day}`;
    const cross = $('#cross'); cross.style.display = (mode === 'foot' && !this.modal && player.tp < 0.5) ? 'block' : 'none';
    const spread = mode === 'foot' ? (G.hand ? 10 + player.recoil * 14 - player.aim * 7 : 4) : 4; cross.style.setProperty('--s', spread + 'px'); cross.className = G.hand ? 'gun' : '';
    $('#vig').style.opacity = mode === 'foot' ? clamp(player.focus * 0.9 + player.aim * 0.2, 0, 1) : 0;
    $('#hurt').style.opacity = mode === 'foot' ? clamp(player.hurtT * 2.2 + (G.hp < 25 ? 0.25 : 0), 0, 0.7) : 0;
    const pr = $('#prompt'); pr.innerHTML = prompt && !this.modal ? prompt : ''; pr.style.display = prompt && !this.modal ? 'block' : 'none';
    const mb = $('#mineBar'); const mining = mode === 'foot' && player.mineT > 0.02 && player.beam.visible; mb.style.display = mining ? 'block' : 'none'; if (mining) mb.firstChild.style.width = clamp(player.mineT * 100, 0, 100) + '%';
    // gun hud
    const gh = $('#gunHud'); if (mode === 'foot' && G.hand) { const sp = GUN[ITEMS[G.hand.id].gun]; gh.innerHTML = `<div>${gunSVG(G.hand.id)}</div><b>${ITEMS[G.hand.id].name}</b><span>${G.hand.mag ?? sp.mag}/${sp.mag} · ${count('ammo')} boxes</span>`; gh.style.display = 'flex'; } else gh.style.display = 'none';
    // wanted
    const w = $('#wanted'); const stars = G.heat >= 80 ? 5 : G.heat >= 60 ? 4 : G.heat >= 40 ? 3 : G.heat >= 20 ? 2 : G.heat > 3 ? 1 : 0;
    const lawLabel = space && mode === 'space' ? { dispatched: 'CRUISER INBOUND', hailing: 'HAILED', chase: 'PURSUIT', fight: 'FIREFIGHT', pulled: 'STOPPED' }[space.law.state] || '' : '';
    w.innerHTML = (stars || G.bounty ? `<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span>` : '') + (G.bounty ? ` <span class="bounty">Bounty ${fmt(G.bounty)}</span>` : '') + (lawLabel ? ` <b class="lawl">${lawLabel}</b>` : '');
    // flight HUD
    const fl = $('#flight');
    if (mode === 'space') {
      const H = space.hud; const over = H.inLane && H.speed > H.limit * 1.04;
      fl.style.display = 'block'; fl.innerHTML = `
        <div class="spd ${over ? 'over' : ''}"><b>${fmt(H.speed)}</b><small>u/s</small></div>
        <div class="lane ${H.inLane ? 'in' : ''}">${H.inLane ? `SPACEWAY · LIMIT ${fmt(H.limit)}<br><small>${esc(H.inLane.name)}</small>` : 'OPEN SPACE'}</div>
        <div class="thr"><i style="height:${H.throttle * 100}%"></i></div>
        <div class="nearp">${esc(H.nearName)} <small>${esc(H.nearKind)} · alt ${fmt(Math.max(0, H.alt))}</small>${H.canLand ? `<br><b class="land">[${In.label('land')}] LAND</b>` : ''}${H.settled ? ' <small>⌂ settled</small>' : ''}</div>
        ${H.disabled ? '<div class="disabled">SHIP DISABLED</div>' : ''}`;
    } else fl.style.display = 'none';
    // bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]; b.t -= dt; const p = new THREE.Vector3(b.npc.pos.x, b.npc.pos.y + 2.1, b.npc.pos.z).project(camera);
      if (b.t <= 0 || p.z > 1) { b.el.remove(); this.bubbles.splice(i, 1); continue; }
      b.el.style.left = (p.x * 0.5 + 0.5) * innerWidth + 'px'; b.el.style.top = (-p.y * 0.5 + 0.5) * innerHeight + 'px'; b.el.style.opacity = Math.min(1, b.t);
    }
    // focus overlay
    this.updateFocus(S);
    $('#idleHint').style.display = mode === 'foot' && player.idleCam > 0.6 ? 'block' : 'none'; $('#idleHint').textContent = `Move to resume`;
  }
  refreshHint() {
    const L = a => `<kbd>${In.label(a)}</kbd>`;
    const foot = `${L('interact')} use · ${L('focus')} focus on people · ${L('aim')} aim / draw pistol · ${L('fire')} fire / mine · ${L('pack')} backpack · ${L('holster')} holster · ${L('reload')} reload · ${L('crouch')} crouch · ${L('sprint')} sprint · ${L('view')} view · ${L('use')} eat/drink · ${L('journal')} journal`;
    const sp = `Mouse/stick steer · W/S throttle · ${L('sprint')} boost · ${L('jump')} brake · ${L('fire')} fire · ${L('land')} land · ${L('map')} jump map · ${L('journal')} journal`;
    this.hintFoot = foot; this.hintSpace = sp;
  }
  setHint(mode) { this.refreshHint(); $('#hint').innerHTML = mode === 'space' ? this.hintSpace : this.hintFoot; }

  updateFocus(S) {
    const f = $('#focusUI'); const p = S.player;
    if (S.mode !== 'foot' || this.modal || p.focus < 0.5 || !p.focusTarget) { f.style.display = 'none'; this.focusNpc = null; return; }
    const n = p.focusTarget; this.focusNpc = n; const pr = n.prof;
    const quest = n.pendingQuest && n.approach;
    const opts = this.focusOptions(n);
    const key = JSON.stringify([pr.id, quest, In.scheme, In.brand, opts.map(o => o.label)]);
    f.style.display = 'block';
    if (this._fk !== key) {
      this._fk = key; f.innerHTML = `<div class="plate"><b>${esc(pr.met ? pr.name : (pr.cop ? 'Patrol Officer' : 'Stranger'))}</b><small>${esc(pr.met || pr.cop ? pr.jobLabel : 'Hold ' + In.label('focus'))}</small></div>` +
        `<div class="opts">${opts.map((o, i) => `<div class="opt"><kbd>${In.label('q' + (i + 1))}</kbd> ${esc(o.label)}</div>`).join('')}</div>`;
    }
    this.focusOpts = opts;
  }
  focusOptions(n) {
    const quest = n.pendingQuest && n.approach;
    return [
      { label: 'Greet', fn: () => { sfx('ui'); n.prof.mood = clamp(n.prof.mood + 0.04, 0, 1); this.bubble(n, n.prof.mood > 0.6 ? '"Well met."' : '"Mm. Hello."'); this.hooks.xp('speech', 1); } },
      { label: quest ? 'Hear them out' : 'Trade', fn: () => quest ? this.hooks.talk(n, 'quest') : this.openTrade(n) },
      { label: 'Ask about work', fn: () => this.hooks.talk(n, 'work') },
      { label: 'Talk…', fn: () => this.hooks.talk(n) },
    ];
  }
  quick(i) { if (this.focusOpts && this.focusOpts[i] && this.focusNpc) this.focusOpts[i].fn(); }

  // ---------- modal plumbing ----------
  open(name, html, cls = '') {
    this.modal = name; this.panel.className = 'panel ' + cls; this.panel.innerHTML = html; sfx('ui', 0.6); document.exitPointerLock?.();
    document.body.classList.add('modal');
  }
  closeAll() {
    if (this.modal === 'packwait') { clearTimeout(this.packTimer); this.hooks.packOpen(false); this.modal = null; document.body.classList.remove('modal'); this.hooks.onClose && this.hooks.onClose(); return; }
    if (!this.modal && this.panel.classList.contains('hidden')) return; this.lp = null; this.lpFail = 0; const wasPack = this.modal === 'pack';
    const fin = () => { this.modal = null; this.panel.className = 'panel hidden'; this.panel.innerHTML = ''; document.body.classList.remove('modal'); this.hooks.onClose && this.hooks.onClose(); };
    if (wasPack) { const b = $('.bag', this.panel); b && b.classList.remove('open', 'in'); this.hooks.packOpen(false); this.modal = 'closing'; setTimeout(fin, 380); } else fin();
    this.hooks.talkEnd && this.hooks.talkEnd();
  }
  btn(label, fn, cls = '', key) { const b = el('button', cls, (key ? `<kbd>${key}</kbd> ` : '') + label); if (key) b.dataset.k = key; b.onclick = () => { sfx('ui', 0.5); fn(); }; return b; }
  head(title, sub = '') { return `<div class="ph"><h2>${esc(title)}</h2><small>${sub}</small><button class="x" data-close>✕</button></div>`; }
  wireClose() { this.panel.querySelectorAll('[data-close]').forEach(b => b.onclick = () => this.closeAll()); }

  // ---------- item visuals ----------
  slotHTML(e, extra = '') {
    if (!e) return `<div class="slot empty ${extra}"></div>`;
    const it = ITEMS[e.id];
    if (e.uid) return `<div class="slot gunslot ${extra}" title="${esc(it.name)}">${gunSVG(e.id)}<span class="nm">${esc(it.name)}</span><span class="q">${((e.q || 1) * 100) | 0}%</span></div>`;
    return `<div class="slot ${extra}" title="${esc(it.name)}"><div class="sw" style="background:${it.color}"></div><span class="nm">${esc(it.name)}</span><span class="n">${e.n}</span></div>`;
  }

  // ---------- backpack ----------
  openPack() {
    // the pack comes off your shoulder and is set on the floor in front of you; the UI opens once it's down
    this.hooks.packOpen(true); this.packFace = 'front'; this.sel = null; this.modal = 'packwait'; document.exitPointerLock?.(); document.body.classList.add('modal'); sfx('zip', 0.7);
    this.packTimer = setTimeout(() => {
      if (this.modal !== 'packwait') return; this.open('pack', '', 'packwrap'); this.panel.style.setProperty('--bs', clamp((innerHeight - 250) / 470, 0.5, 1)); this.renderPack(true);
      requestAnimationFrame(() => { const b = $('.bag', this.panel); if (!b) return; b.classList.add('in'); setTimeout(() => b.classList.add('open'), 380); });
    }, 950);
  }
  renderPack(first) {
    const P = G.pack; const n = PACK_SLOTS[P.tier];
    const prevState = this.panel.querySelector('.bag'); const was = prevState ? prevState.className : 'bag';
    const flapSlots = face => `<div class="slots n${n}">${P[face].slice(0, n).map((e, i) => `<div data-face="${face}" data-i="${i}" class="nav">${this.slotHTML(e, this.sel && this.sel.t === 'slot' && this.sel.face === face && this.sel.i === i ? 'sel' : '')}</div>`).join('')}</div>`;
    const pocket = Object.entries(P.pocket).filter(([, c]) => c > 0);
    const sideHTML = i => `<div class="side s${i} nav" data-side="${i}">${P.sides[i] ? `<div class="slot gunslot ${this.sel && this.sel.t === 'side' && this.sel.i === i ? 'sel' : ''}">${gunSVG(P.sides[i].id)}<span class="nm">${esc(ITEMS[P.sides[i].id].name)}</span></div>` : '<div class="slot empty"><small>side mount</small></div>'}</div>`;
    const hand = G.hand;
    this.panel.innerHTML = `
      <div class="packtop">
        <div class="handbox"><small>IN HAND</small>${hand ? `<div class="hh">${gunSVG(hand.id)}<b>${esc(ITEMS[hand.id].name)}</b><span>${((hand.q || 1) * 100) | 0}%</span></div>` : '<div class="hh none">Empty hands<br><small>aim to draw your pistol</small></div>'}
          ${hand ? '<div class="hb"></div>' : ''}</div>
        <div class="packtitle"><h2>${esc(PACK_NAMES[P.tier])}</h2><small>${n} slots per flap · front pocket holds unlimited small items · 2 side mounts</small></div>
        <button class="x" data-close>✕</button>
      </div>
      <div class="bagstage"><div class="${was.includes('bag') ? was : 'bag'}" id="bagEl">
        <div class="bagface front">
          <div class="strap l"></div><div class="strap r"></div>
          <div class="flap"><div class="flaplabel">FRONT FLAP</div>${flapSlots('front')}</div>
          <div class="pocket"><div class="pocketlabel">FRONT POCKET <small>(small items, unlimited)</small></div><div class="pitems">${pocket.length ? pocket.map(([id, c]) => `<div class="pit nav ${this.sel && this.sel.t === 'pocket' && this.sel.id === id ? 'sel' : ''}" data-pocket="${id}"><i style="background:${ITEMS[id].color}"></i>${esc(ITEMS[id].name)} <b>×${c}</b></div>`).join('') : '<em>empty</em>'}</div></div>
          <div class="buckle"></div>
        </div>
        <div class="bagface back"><div class="flap open2"><div class="flaplabel">BACK FLAP</div>${flapSlots('back')}</div></div>
        ${sideHTML(0)}${sideHTML(1)}
      </div></div>
      <div class="packbar"><button id="flip">⟲ ${this.packFace === 'front' ? 'Back flap' : 'Front flap'}</button><div id="info"></div></div>`;
    this.wireClose();
    const bag = $('#bagEl', this.panel); if (this.packFace === 'back') bag.classList.add('flipped'); else bag.classList.remove('flipped');
    $('#flip', this.panel).onclick = () => { this.packFace = this.packFace === 'front' ? 'back' : 'front'; sfx('zip', 0.5); bag.classList.toggle('flipped'); $('#flip', this.panel).textContent = `⟲ ${this.packFace === 'front' ? 'Back flap' : 'Front flap'}`; };
    this.panel.querySelectorAll('[data-face]').forEach(d => d.onclick = () => { const face = d.dataset.face, i = +d.dataset.i; this.sel = P[face][i] ? { t: 'slot', face, i } : null; this.renderPack(); });
    this.panel.querySelectorAll('[data-side]').forEach(d => d.onclick = () => { const i = +d.dataset.side; this.sel = P.sides[i] ? { t: 'side', i } : null; this.renderPack(); });
    this.panel.querySelectorAll('[data-pocket]').forEach(d => d.onclick = () => { this.sel = { t: 'pocket', id: d.dataset.pocket }; this.renderPack(); });
    const hb = $('.hb', this.panel); if (hb) { hb.append(this.btn('Stow', () => { stowHand(); this.renderPack(); }), this.btn('Drop', () => { const g = G.hand; G.hand = null; G.dropped(g); this.renderPack(); })); }
    this.renderInfo();
  }
  renderInfo() {
    const box = $('#info', this.panel); if (!box) return; const P = G.pack; const s = this.sel; box.innerHTML = '';
    if (!s) { box.innerHTML = `<small>Select a slot, pocket item or side-mounted gun.</small>`; return; }
    let e = s.t === 'slot' ? P[s.face][s.i] : s.t === 'side' ? P.sides[s.i] : null; const id = s.t === 'pocket' ? s.id : e && e.id; if (!id) { box.textContent = ''; return; }
    const it = ITEMS[id]; const info = el('div', 'iinfo'); box.appendChild(info);
    if (isGun(id)) {
      const sp = GUN[it.gun];
      info.innerHTML = `<b>${esc(it.name)}</b> <small>${gunClsLabel(id)} · quality ${((e.q || 1) * 100) | 0}% · dmg ${sp.dmg}${sp.pellets > 1 ? '×' + sp.pellets : ''} · mag ${sp.mag} · worth ${fmt(itemValue(e))} cr</small>`;
      const loc = s.t === 'side' ? { t: 'side', i: s.i } : { t: 'slot', face: s.face, i: s.i };
      box.append(this.btn(G.hand ? 'Swap with hands' : 'Hold', () => { holdFrom(loc); this.sel = null; this.renderPack(); }, 'pri'));
      if (s.t === 'side' && canHolster(id)) box.append(this.btn('Holster in a slot', () => { const free = [...P.front.map((x, i) => ['front', i, x]), ...P.back.map((x, i) => ['back', i, x])].find(a => !a[2] && a[1] < PACK_SLOTS[P.tier]); if (!free) { toast('No free slot to holster in.', 'warn'); return; } const g = takeAt(loc); P[free[0]][free[1]] = g; this.sel = null; this.renderPack(); }));
      if (s.t === 'slot') box.append(this.btn('Mount on side', () => { const i = P.sides.findIndex(x => !x); if (i < 0) { toast('Both side mounts are in use.', 'warn'); return; } P.sides[i] = takeAt(loc); this.sel = null; this.renderPack(); }));
      box.append(this.btn('Drop', () => { const g = takeAt(loc); G.dropped(g); this.sel = null; this.renderPack(); }, 'warn'));
      return;
    }
    const c = s.t === 'pocket' ? P.pocket[id] : e.n;
    info.innerHTML = `<b>${esc(it.name)}</b> ×${c} <small>${esc(it.cat)} · ${fmt(it.value)} cr each${it.use ? ' · ' + Object.entries(it.use).map(([k, v]) => `+${v} ${k}`).join(' ') : ''}</small>`;
    if (it.use) box.append(this.btn('Use', () => { this.hooks.use(id); this.renderPack(); }, 'pri'));
    if (id === 'pack_frame') box.append(this.btn('Install on backpack', () => { if (upgradePack()) { this.sel = null; this.renderPack(); } else toast('Pack is at max size.', 'warn'); }, 'pri'));
    if (id === 'coil') box.append(this.btn('Fit to ship', () => { if (G.ship.coils >= 4) { toast('Ship coil slots are full.', 'warn'); return; } removeItem('coil', 1); G.ship.coils++; toast('Spaceway coil fitted.', 'good'); this.renderPack(); }, 'pri'));
    if (id === 'tank_ext') box.append(this.btn('Fit to ship', () => { if (G.ship.tank >= 4) { toast('Tank slots are full.', 'warn'); return; } removeItem('tank_ext', 1); G.ship.tank++; toast('Fuel tank extended.', 'good'); this.renderPack(); }, 'pri'));
    if (id === 'fuel') box.append(this.btn('Refuel ship (+25)', () => { removeItem('fuel', 1); G.fuel = Math.min(100, G.fuel + 25); this.renderPack(); }, 'pri'));
    if (id !== 'parcel') box.append(this.btn('Discard 1', () => { removeItem(id, 1); this.renderPack(); }, 'warn'));
  }

  // ---------- dialogue ----------
  openTalk(npc, surf, social, mode) {
    npc.talking = true; this.talkNpc = npc; const p = npc.prof;
    const render = (line, extra = []) => {
      const topics = social.topics(npc, surf); const quests = social.questsFor(npc, surf);
      const pend = npc.pendingQuest;
      let html = `${this.head(p.name, `${p.jobLabel} · from ${esc(p.originName)} · mood ${p.mood > 0.65 ? 'friendly' : p.mood > 0.4 ? 'neutral' : 'wary'}`)}<div class="say"><i class="av" style="background:#${p.look.shirt.toString(16).padStart(6, '0')}"></i><p>${line}</p></div><div class="choices"></div>`;
      this.open('talk', html, 'talkpanel'); this.wireClose();
      const ch = $('.choices', this.panel); let k = 1;
      const add = (label, fn, cls) => { ch.append(this.btn(label, fn, cls, k <= 9 ? String(k++) : undefined)); };
      if (pend && !pend.accepted) { add(`Accept: ${pend.desc} (${fmt(pend.reward)} cr)`, () => { social.accept(pend); npc.pendingQuest = null; npc.approach = false; npc.marker.visible = false; render(`"${p.trait === 'warm' ? 'Bless you.' : 'Good.'} Don't take too long."`); }, 'pri'); add('Not now', () => { npc.pendingQuest = null; npc.approach = false; npc.marker.visible = false; render('"Your loss."'); }); }
      for (const o of quests) add(o.label, () => { social.complete(o); render('"Pleasure doing business."'); }, 'pri');
      for (const t of topics) { if (t.id === 'work' && mode !== 'work') {/* normal */ } add(t.label, () => { if (t.id === 'work') { const q = npc.pendingQuest || (npc.givenQuest ? null : social.genQuest(npc, surf)); if (q && !q.accepted) { npc.pendingQuest = q; npc.givenQuest = true; render(q.pitch); } else render('"Nothing for you right now. Check back later."'); } else render(social.answer(npc, t.id, surf, this.hooks)); }); }
      add('Trade…', () => { this.openTrade(npc); });
      add('Goodbye.', () => { this.closeAll(); });
      if (extra.length) extra.forEach(f => f());
    };
    const first = mode === 'quest' && npc.pendingQuest ? npc.pendingQuest.pitch : mode === 'work' ? null : `"${p.trait === 'warm' ? 'Well hello there.' : p.trait === 'nervous' ? 'Oh! Uh—hi.' : p.trait === 'sly' ? 'Ah. A customer, or a problem?' : 'Yeah?'}"`;
    if (mode === 'work') {
      const q = npc.pendingQuest || social.genQuest(npc, surf); if (!npc.pendingQuest) npc.pendingQuest = q; render(q.pitch);
    } else render(first);
  }
  talkEnded() { if (this.talkNpc) { this.talkNpc.talking = false; this.talkNpc = null; } }

  openTrade(npc) {
    const social = this.hooks.social; npc.talking = true; this.talkNpc = npc; const p = npc.prof;
    const render = () => {
      const bud = social.budget(npc);
      const entries = [];
      for (const face of ['front', 'back']) G.pack[face].forEach((e, i) => { if (e) entries.push({ e, loc: { t: 'slot', face, i } }); });
      G.pack.sides.forEach((e, i) => { if (e) entries.push({ e, loc: { t: 'side', i } }); });
      Object.entries(G.pack.pocket).forEach(([id, c]) => { if (c > 0) entries.push({ e: { id, n: c }, pocket: true }); });
      const rows = entries.map((x, idx) => { const price = social.priceFor(npc, x.e.uid ? x.e : { id: x.e.id, q: 1 }); const interested = !!p.interest[ITEMS[x.e.id].cat]; return `<div class="row"><i style="background:${ITEMS[x.e.id].color}"></i><span>${esc(ITEMS[x.e.id].name)}${x.e.n ? ' ×' + x.e.n : ''}${x.e.uid ? ' (' + (((x.e.q || 1) * 100) | 0) + '%)' : ''}</span><em class="${interested ? 'want' : ''}">${interested ? 'wants · ' : ''}${price ? fmt(price) + ' cr' : '—'}</em><span class="rb" data-i="${idx}"></span></div>`; }).join('');
      this.open('trade', `${this.head('Trade with ' + p.name, `${p.jobLabel} · buys ${Object.keys(p.interest).join(', ')} · cash ${fmt(bud)} cr`)}<div class="rows">${rows || '<em>Nothing to sell.</em>'}</div><div class="packbar"><small>Smarter people know who else wants your goods — ask “Who would buy my stuff?”. Your trading skill: ${lvl('trading')}.</small></div>`, 'tradepanel'); this.wireClose();
      this.panel.querySelectorAll('.rb').forEach(rb => { const x = entries[+rb.dataset.i]; const ent = x.e.uid ? x.e : { id: x.e.id, q: 1 };
        rb.append(this.btn('Sell 1', () => { if (social.sellTo(npc, ent, 1)) { if (x.e.uid) takeAt(x.loc); else removeItem(x.e.id, 1); render(); } }));
        if (x.e.n > 1) rb.append(this.btn('Sell all', () => { let c = 0; const n = x.e.n; for (let i = 0; i < n; i++) { if (social.sellTo(npc, ent, 1)) { removeItem(x.e.id, 1); c++; } else break; } render(); }));
      });
    };
    render();
  }

  // ---------- bench / tech ----------
  openBench(tab = 'craft') {
    const render = (t) => {
      const tabs = `<div class="tabs"><button class="${t === 'craft' ? 'on' : ''}" data-t="craft">Craft</button><button class="${t === 'tech' ? 'on' : ''}" data-t="tech">Research</button></div>`;
      let body = '';
      if (t === 'craft') {
        const rows = RECIPES.map((r, i) => { const it = ITEMS[r.out]; const known = G.tech[r.tech]; const ing = Object.entries(r.in).map(([k, n]) => `<span class="${count(k) >= n ? 'ok' : 'no'}">${n} ${ITEMS[k].name} (${count(k)})</span>`).join(', ');
          return `<div class="row ${known ? '' : 'locked'}"><i style="background:${it.color}"></i><span><b>${esc(it.name)}</b>${r.n > 1 ? ' ×' + r.n : ''} <small>${known ? ing : 'Needs ' + TECH[r.tech].name}</small></span><span class="rb" data-i="${i}"></span></div>`; }).join('');
        body = `<div class="rows">${rows}</div>`;
      } else {
        const rows = Object.entries(TECH).map(([k, tt]) => { const done = G.tech[k]; const reqOk = tt.req.every(q => G.tech[q]); const items = Object.entries(tt.items).map(([i, n]) => `<span class="${count(i) >= n ? 'ok' : 'no'}">${n} ${ITEMS[i].name}</span>`).join(', ');
          return `<div class="row ${done ? 'done' : reqOk ? '' : 'locked'}"><i style="background:${done ? '#6ad06a' : reqOk ? '#e8c050' : '#555'}">T${tt.tier}</i><span><b>${esc(tt.name)}</b> <small>${esc(tt.desc)}${done ? '' : ` · ${fmt(tt.cost)} cr${items ? ', ' + items : ''}${reqOk ? '' : ' · needs ' + tt.req.map(q => TECH[q].name).join(' + ')}`}</small></span><span class="rb" data-k="${k}">${done ? '✓' : ''}</span></div>`; }).join('');
        body = `<div class="rows">${rows}</div>`;
      }
      this.open('bench', `${this.head(t === 'craft' ? 'Workbench' : 'Research Terminal', `Bench tier ${benchTier()} · gunsmithing ${lvl('gunsmith')} · ${fmt(G.credits)} cr`)}${tabs}${body}`, 'tradepanel'); this.wireClose();
      this.panel.querySelectorAll('[data-t]').forEach(b => b.onclick = () => render(b.dataset.t));
      this.panel.querySelectorAll('.rb[data-i]').forEach(rb => { const r = RECIPES[+rb.dataset.i]; if (G.tech[r.tech]) rb.append(this.btn('Craft', () => { craft(r); render(t); }, canCraft(r) ? 'pri' : '')); });
      this.panel.querySelectorAll('.rb[data-k]').forEach(rb => { const k = rb.dataset.k; if (!G.tech[k]) rb.append(this.btn('Research', () => { if (!research(k)) toast('Missing requirements.', 'warn'); render(t); }, canResearch(k) ? 'pri' : '')); });
    };
    render(tab);
  }

  // ---------- ship lockers ----------
  openLockers() {
    const render = () => {
      const pk = [];
      for (const face of ['front', 'back']) G.pack[face].forEach((e, i) => { if (e) pk.push({ e, src: { t: 'slot', face, i } }); });
      G.pack.sides.forEach((e, i) => { if (e) pk.push({ e, src: { t: 'side', i } }); });
      Object.entries(G.pack.pocket).forEach(([id, c]) => c > 0 && pk.push({ e: { id, n: c }, src: { t: 'pocket' } }));
      const lk = G.lockers.map((L, li) => `<div class="locker"><div class="lh">LOCKER ${li + 1}</div><div class="lslots">${L.map((e, i) => `<div class="nav" data-l="${li}" data-i="${i}">${this.slotHTML(e)}</div>`).join('')}</div></div>`).join('');
      const bagrows = pk.map((x, i) => `<div class="pk nav" data-p="${i}"><i style="background:${ITEMS[x.e.id].color}"></i>${esc(ITEMS[x.e.id].name)}${x.e.n ? ' ×' + x.e.n : ''} <small>→ locker</small></div>`).join('');
      this.open('lockers', `${this.head('Ship Lockers', 'click your pack item to stow it · click a locker item to take it back')}<div class="lockwrap"><div class="lbag"><h3>Backpack</h3>${bagrows || '<em>empty</em>'}</div><div class="lgrid">${lk}</div></div>`, 'lockpanel'); this.wireClose();
      this.panel.querySelectorAll('[data-p]').forEach(d => d.onclick = () => {
        const x = pk[+d.dataset.p]; const stash = (e) => { for (const L of G.lockers) { if (!e.uid) { const ex = L.find(s => s && s.id === e.id && !s.uid); if (ex) { ex.n += e.n; return true; } } } for (const L of G.lockers) { const i = L.indexOf(null); if (i >= 0) { L[i] = e; return true; } } return false; };
        if (x.e.uid) { const g = takeAt(x.src); if (!stash(g)) { putAt(x.src, g); toast('Lockers are full.', 'warn'); } }
        else { if (stash({ id: x.e.id, n: x.e.n })) removeItem(x.e.id, x.e.n); else toast('Lockers are full.', 'warn'); }
        render();
      });
      this.panel.querySelectorAll('[data-l]').forEach(d => d.onclick = () => {
        const L = G.lockers[+d.dataset.l], i = +d.dataset.i, e = L[i]; if (!e) return;
        if (e.uid) { if (addGun(e)) L[i] = null; else toast('No side mount or holster slot free.', 'warn'); }
        else { const left = addItem(e.id, e.n); if (left === 0) L[i] = null; else if (left < e.n) { e.n = left; toast('Pack is nearly full.', 'warn'); } else toast('Pack is full.', 'warn'); }
        render();
      });
    };
    render();
  }

  // ---------- your shop ----------
  openShop(social, surf) {
    const S = G.shop;
    const render = () => {
      const stock = S.stock.map((s, i) => { const it = ITEMS[s.id]; const fair = social.fairValue(s); const ratio = s.price / fair; return `<div class="row"><i style="background:${it.color}"></i><span><b>${esc(it.name)}</b> ×${s.n}${s.gun ? ' (' + (((s.q || 1) * 100) | 0) + '%)' : ''} <small>fair ${fmt(fair)} cr · ${ratio < 1.1 ? 'bargain' : ratio < 1.4 ? 'fair' : 'pricey'}</small></span><em>${fmt(s.price)} cr</em><span class="rb" data-s="${i}"></span></div>`; }).join('');
      const pack = [];
      for (const face of ['front', 'back']) G.pack[face].forEach((e, i) => { if (e) pack.push({ e, loc: { t: 'slot', face, i } }); });
      G.pack.sides.forEach((e, i) => { if (e) pack.push({ e, loc: { t: 'side', i } }); });
      Object.entries(G.pack.pocket).forEach(([id, c]) => c > 0 && pack.push({ e: { id, n: c }, pocket: true }));
      const add = pack.filter(x => x.e.id !== 'parcel').map((x, i) => `<div class="pk nav" data-a="${pack.indexOf(x)}"><i style="background:${ITEMS[x.e.id].color}"></i>${esc(ITEMS[x.e.id].name)}${x.e.n ? ' ×' + x.e.n : ''}</div>`).join('');
      this.open('shop', `${this.head(S.name + ' — ' + S.planetName, `reputation ${S.rep.toFixed(1)} · ${S.sold} sold · ~${(social.customerRate() * 100) | 0}% chance of a customer every 7 s`)}
        <div class="till"><b>Till: ${fmt(S.till)} cr</b> <span class="tb"></span></div>
        <div class="lockwrap"><div class="lbag"><h3>Add to shelves</h3>${add || '<em>pack empty</em>'}<small>Priced at 130% of value. Adjust below.</small></div><div class="lgrid"><h3>On the shelves</h3><div class="rows">${stock || '<em>Nothing stocked. No stock, no customers.</em>'}</div></div></div>`, 'lockpanel'); this.wireClose();
      $('.tb', this.panel).append(this.btn('Collect', () => { G.credits += S.till; S.till = 0; sfx('coin'); render(); }, 'pri'), this.btn('Rename', () => { const n = prompt('Shop name', S.name); if (n) { S.name = n.slice(0, 24); render(); } }));
      this.panel.querySelectorAll('[data-a]').forEach(d => d.onclick = () => {
        const x = pack[+d.dataset.a]; if (x.e.uid) { const g = takeAt(x.loc); social.stockItem({ gun: true, g }, 1, Math.round(ITEMS[g.id].value * (g.q || 1) * 1.3)); }
        else { const n = x.e.n; removeItem(x.e.id, n); social.stockItem({ id: x.e.id }, n, Math.round(ITEMS[x.e.id].value * 1.3)); }
        render();
      });
      this.panel.querySelectorAll('.rb[data-s]').forEach(rb => { const i = +rb.dataset.s, s = S.stock[i];
        rb.append(this.btn('−10%', () => { s.price = Math.max(1, Math.round(s.price * 0.9)); render(); }), this.btn('+10%', () => { s.price = Math.round(s.price * 1.1) + 1; render(); }), this.btn('Take back', () => { if (s.gun) addGun({ id: s.id, q: s.q, uid: s.uid }) || toast('No room.', 'warn'); else addItem(s.id, s.n); S.stock.splice(i, 1); render(); }));
      });
    };
    render();
  }

  // ---------- outfitter / patrol ----------
  openOutfitter() {
    const goods = [['ration', 12], ['water', 9], ['medkit', 55], ['o2_tank', 45], ['ammo', 16], ['fuel', 35]];
    const render = () => {
      this.open('outfit', `${this.head('Outfitters', `${fmt(G.credits)} cr`)}<div class="rows">${goods.map(([id, pr], i) => `<div class="row"><i style="background:${ITEMS[id].color}"></i><span><b>${ITEMS[id].name}</b></span><em>${pr} cr</em><span class="rb" data-g="${i}"></span></div>`).join('')}
        <div class="row"><i style="background:#e8742a"></i><span><b>Refuel ship</b> <small>fuel ${G.fuel.toFixed(0)}/100 · 2 cr per unit</small></span><em>${Math.ceil((100 - G.fuel) * 2)} cr</em><span class="rb" data-f></span></div>
        <div class="row"><i style="background:#7dd86a"></i><span><b>Repair hull</b> <small>hull ${G.hull.toFixed(0)}/100 · 3 cr per point</small></span><em>${Math.ceil((100 - G.hull) * 3)} cr</em><span class="rb" data-r></span></div></div>`, 'tradepanel'); this.wireClose();
      this.panel.querySelectorAll('[data-g]').forEach(rb => { const [id, pr] = goods[+rb.dataset.g]; rb.append(this.btn('Buy', () => { if (G.credits < pr) return toast('Not enough credits.', 'warn'); if (!canAdd(id, 1)) return toast('Pack is full.', 'warn'); G.credits -= pr; addItem(id, 1); sfx('coin'); render(); })); });
      $('[data-f]', this.panel).append(this.btn('Fill', () => { const c = Math.ceil((100 - G.fuel) * 2); if (G.credits < c) return toast('Not enough credits.', 'warn'); G.credits -= c; G.fuel = 100; sfx('coin'); render(); }));
      $('[data-r]', this.panel).append(this.btn('Repair', () => { const c = Math.ceil((100 - G.hull) * 3); if (G.credits < c) return toast('Not enough credits.', 'warn'); G.credits -= c; G.hull = 100; sfx('coin'); render(); }));
    };
    render();
  }
  openPatrol() {
    const render = () => {
      this.open('patrol', `${this.head('Rimway Patrol — Front Desk', 'fines, warrants and impounded property')}<div class="rows">
        <div class="row"><span><b>Outstanding bounty</b> <small>${G.bounty ? 'Pay it and the warrant is wiped.' : 'You\'re clean.'}</small></span><em>${fmt(G.bounty)} cr</em><span class="rb" data-b></span></div>
        <div class="row"><span><b>Impounded belongings</b> <small>${G.confiscated ? 'Reclaim what was taken at your last arrest.' : 'Nothing impounded.'}</small></span><em>${G.confiscated ? '300 cr' : '—'}</em><span class="rb" data-c></span></div></div>`, 'tradepanel'); this.wireClose();
      if (G.bounty) $('[data-b]', this.panel).append(this.btn('Pay', () => { if (G.credits < G.bounty) return toast('Not enough credits.', 'warn'); G.credits -= G.bounty; G.bounty = 0; G.heat = 0; this.hooks.clearCops(); sfx('coin'); render(); }));
      if (G.confiscated) $('[data-c]', this.panel).append(this.btn('Reclaim', () => { if (G.credits < 300) return toast('Not enough credits.', 'warn'); G.credits -= 300; this.hooks.restore(); render(); }));
    };
    render();
  }

  // ---------- journal ----------
  openJournal(tab = 'quests') {
    const render = (t) => {
      const tabs = ['quests', 'skills', 'contacts', 'ship'].map(x => `<button class="${t === x ? 'on' : ''}" data-t="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('');
      let body = '';
      if (t === 'quests') body = G.quests.length ? G.quests.map(q => `<div class="row"><span><b>${esc(q.desc)}</b><small>Reward ${fmt(q.reward)} cr · ${esc(q.planetName)}</small></span></div>`).join('') : '<em>No active quests. Wander the plaza — people notice a runner with a pack.</em>';
      if (t === 'skills') body = Object.keys(G.skills).map(k => `<div class="row"><span><b>${k[0].toUpperCase() + k.slice(1)}</b></span><em>Lv ${lvl(k)}</em><div class="meter"><i style="width:${(Math.sqrt(G.skills[k] / 30) % 1) * 100}%"></i></div></div>`).join('') + `<small>Mining boosts yields, gunsmithing boosts quality, trading boosts sale prices, piloting charts faster, lockpicking widens the sweet spot, speech helps with cops.</small>`;
      if (t === 'contacts') { const kb = Object.values(G.knownBuyers); body = kb.length ? kb.map(c => `<div class="row"><span><b>${esc(c.name)}</b> — ${esc(c.job)}<small>${esc(c.planet)} · buys ${esc(c.wants.join(', '))}</small></span></div>`).join('') : '<em>No contacts yet. Ask smart people “Who would buy my stuff?”.</em>'; }
      if (t === 'ship') body = `<div class="row"><span><b>Fuel</b></span><em>${G.fuel.toFixed(0)}/100</em></div><div class="row"><span><b>Hull</b></span><em>${G.hull.toFixed(0)}/100</em></div><div class="row"><span><b>Spaceway coils</b></span><em>${G.ship.coils}/4</em></div><div class="row"><span><b>Fuel tank ext.</b></span><em>${G.ship.tank}/4</em></div><div class="row"><span><b>Bounty</b></span><em>${fmt(G.bounty)}</em></div><div class="row"><span><b>Worlds charted</b></span><em>${G.charted}</em></div><div class="row"><span><b>Shop</b></span><em>${G.shop ? `${esc(G.shop.name)} · rep ${G.shop.rep.toFixed(1)}` : 'none'}</em></div>`;
      this.open('journal', `${this.head('Journal')}<div class="tabs">${tabs}</div><div class="rows">${body}</div>`, 'tradepanel'); this.wireClose();
      this.panel.querySelectorAll('[data-t]').forEach(b => b.onclick = () => render(b.dataset.t));
    };
    render(tab);
  }

  // ---------- map / jump ----------
  openMap(space, canJump) {
    const sys = space.sys; const rows = sys.planets.map(p => { const d = Math.hypot(p.pos[0] - space.ship.pos.x, p.pos[1] - space.ship.pos.y, p.pos[2] - space.ship.pos.z); return `<div class="row"><i style="background:rgb(${PLANET_COL(p)})"></i><span><b>${esc(p.name)}</b> <small>${p.kind} · ${p.shape} · r${fmt(p.radius)} · rich in ${p.rich.map(r => ITEMS[r].name).join(', ')} · ${p.settled ? 'settled' : 'uninhabited'}${G.visited[sys.index + ':' + p.i] ? ' · charted' : ''}</small></span><em>${fmt(d / 1000)}k</em></div>`; }).join('');
    const nb = []; for (let i = 1; i <= 6; i++) { const idx = sys.index + i; nb.push(systemAt(G.seed, idx)); if (sys.index - i >= 0) nb.push(systemAt(G.seed, sys.index - i)); }
    const jumps = nb.map((s, i) => `<div class="row"><span><b>${esc(s.name)}</b> <small>${s.star.n} · ${s.planets.length} planets${s.uncharted ? ' · uncharted' : ''}</small></span><em>${25} fuel</em><span class="rb" data-j="${s.index}"></span></div>`).join('');
    this.open('map', `${this.head(sys.name + ' system', `${sys.star.n} · ${sys.planets.length} planets · ${sys.lanes.length} spaceways`)}<h3>Planets</h3><div class="rows">${rows}</div><h3>Jump drive <small>${canJump ? 'costs 25 fuel — leave the lane first' : 'unavailable'}</small></h3><div class="rows">${jumps}</div>`, 'tradepanel'); this.wireClose();
    this.panel.querySelectorAll('[data-j]').forEach(rb => rb.append(this.btn('Jump', () => { if (!canJump) return toast('Not now.', 'warn'); if (G.fuel < 25) return toast('Not enough fuel to jump.', 'warn'); this.closeAll(); this.hooks.jump(+rb.dataset.j); })));
  }

  // ---------- hails ----------
  hail(h) {
    this.hail_ = h; document.exitPointerLock?.(); sfx('siren', 1);
    this.hailEl.classList.remove('hidden'); this.hailEl.innerHTML = `<div class="hh2"><span class="lights"><i></i><i></i></span> <b>${esc(h.title)}</b> <small>${esc(h.unit)}</small></div><p>${esc(h.text)}</p><div class="hopts"></div>`;
    const box = $('.hopts', this.hailEl); h.options.forEach((o, i) => box.append(this.btn(o.label, () => { o.fn(); }, i === 0 ? 'pri' : '', String(i + 1))));
    this.hailBeat = setInterval(() => sfx('siren', 0.6), 900);
  }
  closeHail() { this.hail_ = null; this.hailEl.classList.add('hidden'); this.hailEl.innerHTML = ''; clearInterval(this.hailBeat); }

  // ---------- lockpicking ----------
  lockpick(level, cb) {
    this.open('lock', `${this.head('Pick the lock', 'press ' + In.label('interact') + ' / tap when the pin is in the green')}<div class="lp"><div class="ring"><div class="zone"></div><div class="pin"></div></div><div class="lpt">Pins: <b id="lpn">0</b>/3</div></div>`, 'lockpick'); this.wireClose();
    const ring = $('.ring', this.panel), zone = $('.zone', this.panel), pin = $('.pin', this.panel); let a = 0, dir = 1, got = 0, zc = Math.random() * 360; const zw = 34 + level * 4; const speed = 200 + got * 40;
    const setZone = () => { zone.style.transform = `rotate(${zc - zw / 2}deg)`; zone.style.setProperty('--w', zw + 'deg'); };
    setZone(); this.lp = { cb, tick: (dt) => { a = (a + dir * (speed + got * 70) * dt + 360) % 360; pin.style.transform = `rotate(${a}deg)`; }, hit: () => {
      const d = Math.abs(((a - zc + 540) % 360) - 180); if (d < zw / 2) { got++; sfx('good'); $('#lpn', this.panel).textContent = got; zc = Math.random() * 360; dir = Math.random() < 0.5 ? 1 : -1; setZone(); if (got >= 3) { this.lp = null; this.closeAll(); cb(true); } } else { sfx('warn'); got = Math.max(0, got - 1); $('#lpn', this.panel).textContent = got; this.lpFail = (this.lpFail || 0) + 1; if (this.lpFail >= 3) { this.lpFail = 0; this.lp = null; this.closeAll(); cb(false); } }
    } };
    this.panel.onclick = (e) => { if (e.target.closest('.ring') && this.lp) this.lp.hit(); };
  }
  updateLock(dt) { if (this.lp) { this.lp.tick(dt); if (In.pressed.interact) this.lp.hit(); } }

  // ---------- gamepad / key navigation inside panels ----------
  navigate() {
    if (!this.modal && !this.hail_) return; const root = this.modal ? this.panel : this.hailEl;
    const items = [...root.querySelectorAll('button, .nav')].filter(e => e.offsetParent); if (!items.length) return;
    let cur = items.find(e => e.classList.contains('focus')) || null;
    const dirs = { q1: [0, -1], q3: [0, 1], q4: [-1, 0], q2: [1, 0] }; let moved = false;
    for (const k in dirs) if (In.pressed[k] && In.scheme === 'pad') {
      if (!cur) { cur = items[0]; moved = true; break; }
      const r = cur.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2; let best = null, bd = 1e9;
      for (const e of items) { if (e === cur) continue; const q = e.getBoundingClientRect(); const dx = q.x + q.width / 2 - cx, dy = q.y + q.height / 2 - cy; const along = dx * dirs[k][0] + dy * dirs[k][1]; if (along <= 2) continue; const perp = Math.abs(dx * dirs[k][1]) + Math.abs(dy * dirs[k][0]); const d = along + perp * 2; if (d < bd) { bd = d; best = e; } }
      if (best) cur = best; moved = true;
    }
    if (moved && cur) { items.forEach(e => e.classList.remove('focus')); cur.classList.add('focus'); cur.scrollIntoView({ block: 'nearest' }); }
    if (In.pressed.jump && In.scheme === 'pad' && cur) { cur.click(); }
  }
}
function PLANET_COL(p) { return { temperate: '80,160,90', desert: '210,170,100', frozen: '200,225,245', volcanic: '210,70,30', barren: '140,135,135', toxic: '160,180,50', crystal: '170,110,230', ocean: '60,120,200' }[p.kind]; }
