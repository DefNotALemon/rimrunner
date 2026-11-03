// The physical backpack: pulled off the shoulder, set on the floor, unzipped. Every item is a real 3D object in a real slot.
// Look at one and press USE to hold it. No menus.
import * as THREE from '../vendor/three.module.js';
import { ITEMS, GUN, PACK_SLOTS, PACK_NAMES, describe } from './data.js';
import { G, toast, addItem, addGun, removeItem, canHolster, isGun, isSmall, upgradePack, itemValue, stowHand, uid } from './state.js';
import { itemMesh, gunMesh } from './models.js';
import { In } from './input.js';
import { sfx } from './audio.js';
import { fmt } from './util.js';
import { ASSET } from './assets.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// one hand, one thing: guns live in G.hand (the rest of the game expects that), anything else in G.held
const HAND = { get v() { return G.hand || G.held || null; }, set v(x) { if (!x) { G.hand = null; G.held = null; } else if (x.uid) { G.hand = x; G.held = null; G.quickDrawn = false; } else { G.held = x; G.hand = null; } } };
let leatherT = null;
function leatherTex() {
  if (leatherT) return leatherT; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2.2, 0, 7); x.fill(); }
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 1); }
  leatherT = new THREE.CanvasTexture(c); leatherT.wrapS = leatherT.wrapT = THREE.RepeatWrapping; leatherT.colorSpace = THREE.SRGBColorSpace; return leatherT;
}
const leather = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, map: leatherTex(), roughness: 0.82, metalness: 0, ...o });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.85, roughness: 0.3 });
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const FT = 0.06;   // flap thickness

function layout(n) {   // slot grid across x [-0.27..0.27] and out along 0.07..0.55
  const cols = n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5, rows = Math.ceil(n / cols); const out = [];
  for (let i = 0; i < n; i++) { const c = i % cols, r = Math.floor(i / cols); out.push({ across: (c - (cols - 1) / 2) * 0.13, along: 0.08 + (r + 0.5) * (0.46 / rows) }); }
  return out;
}

export class PackWorld {
  constructor(camera, hooks) {
    this.camera = camera; this.hooks = hooks; this.phase = 'idle'; this.group = new THREE.Group(); this.group.visible = false; this.t = 0; this.items = []; this.pads = []; this.sig = '';
    this.ray = new THREE.Raycaster(); this.ray.far = 4; this.hover = null; this.prompt = '';
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.005, 6, 28), new THREE.MeshBasicMaterial({ color: 0x66f0ff, depthTest: false, transparent: true })); this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 20; this.ring.visible = false;
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 240; this.labelCv = cv; this.labelTex = new THREE.CanvasTexture(cv); this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTex, depthTest: false, transparent: true })); this.label.scale.set(0.62, 0.2325, 1); this.lootCtx = null; this.lootSlots = []; this.label.renderOrder = 21; this.label.visible = false;
  }
  attach(scene) { scene.add(this.group, this.ring, this.label); this.scene = scene; }
  get blocking() { return this.phase !== 'idle'; }
  get isOpen() { return this.phase === 'open'; }

  // ------ model ------
  build() {
    this.group.clear(); this.pads = []; this.items = []; this.flaps = {}; const P = G.pack; const n = PACK_SLOTS[P.tier];
    const body = leather(0x6b4a2d), dark = leather(0x2e2012), strapM = leather(0x3a2616, { roughness: 0.6 });
    const add = (g, m, x, y, z, parent = this.group) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
    add(new THREE.BoxGeometry(0.66, 0.05, 0.66), body, 0, 0.025, 0);                       // main body
    add(new THREE.BoxGeometry(0.58, 0.012, 0.58), dark, 0, 0.052, 0);                      // sunken pocket floor
    for (const [w, d, x, z] of [[0.66, 0.04, 0, -0.31], [0.66, 0.04, 0, 0.31], [0.04, 0.58, -0.31, 0], [0.04, 0.58, 0.31, 0]]) add(new THREE.BoxGeometry(w, 0.05, d), body, x, 0.07, z);
    add(new THREE.BoxGeometry(0.32, 0.05, 0.62), body, 0.47, 0.025, 0);                    // wing (carries the right side mount)
    for (const z of [-0.22, 0.22]) add(new THREE.BoxGeometry(0.04, 0.06, 0.07), strapM, -0.36, 0.05, z);
    for (const z of [-0.2, 0.2]) add(new THREE.BoxGeometry(0.04, 0.06, 0.07), strapM, 0.5, 0.075, z);
    // zipper track along the seam + pull
    this.zip = new THREE.Group(); this.group.add(this.zip); add(new THREE.BoxGeometry(0.66, 0.012, 0.014), leather(0x15110d, { map: null }), 0, 0.115, 0, this.zip);
    this.pull = add(new THREE.BoxGeometry(0.03, 0.014, 0.05), BRASS, 0.3, 0.13, 0, this.zip); const ringM = add(new THREE.TorusGeometry(0.014, 0.003, 6, 12), BRASS, 0.3, 0.135, 0.04, this.zip); ringM.rotation.x = Math.PI / 2;
    // flaps
    const mkFlap = (name, hinge, dir) => {
      const f = new THREE.Group(); f.position.set(...hinge); this.group.add(f); this.flaps[name] = f; f.userData = { dir, name };
      const panel = new THREE.Group();
      if (dir === 'x') { panel.position.set(-0.3, 0, 0); add(new THREE.BoxGeometry(0.6, FT, 0.66), body, 0, 0, 0, panel); }
      else panel.position.set(0, 0, dir === 'up' ? 0.3 : -0.3), add(new THREE.BoxGeometry(0.66, FT, 0.6), body, 0, 0, 0, panel);
      f.add(panel);
      for (const s of [-1, 1]) { const st = add(new THREE.BoxGeometry(dir === 'x' ? 0.6 : 0.05, 0.012, dir === 'x' ? 0.05 : 0.6), strapM, 0, FT / 2 + 0.004, 0, panel); if (dir === 'x') st.position.z = s * 0.2; else st.position.x = s * 0.2; }
      add(new THREE.BoxGeometry(0.05, 0.016, 0.035), BRASS, 0, FT / 2 + 0.012, 0, panel);
      // anchor: items live on the inner face; anchor axes == world axes once open
      const anchor = new THREE.Group(); anchor.position.set(0, -FT / 2 - 0.004, 0); if (dir === 'x') anchor.rotation.z = Math.PI; else anchor.rotation.x = Math.PI; f.add(anchor); f.userData.anchor = anchor;
      const inner = add(new THREE.BoxGeometry(dir === 'x' ? 0.58 : 0.62, 0.006, dir === 'x' ? 0.62 : 0.58), dark, 0, 0.003, 0, anchor);
      const cells = layout(n); f.userData.slots = [];
      cells.forEach((c, k) => {
        const px = dir === 'x' ? c.along : c.across, pz = dir === 'x' ? c.across : (dir === 'up' ? -c.along : c.along);
        const pad = add(new THREE.BoxGeometry(0.115, 0.004, 0.115), leather(0x20150c), px, 0.008, pz, anchor);
        for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.008, 0.012, 0.118), strapM, px + sx * 0.058, 0.01, pz, anchor);
        const hit = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.16, 0.125), HIT); hit.position.set(px, 0.08, pz); anchor.add(hit); hit.userData = { flap: name }; f.userData.slots.push({ px, pz, hit });
      }); return f;
    };
    mkFlap('upper', [0, 0.085, -0.3], 'up'); mkFlap('lower', [0, 0.085, 0.3], 'down'); mkFlap('back', [0.62, 0.075, 0], 'x');
    // slot index mapping: front[0..n-1] -> upper, front[n..2n-1] -> lower, back[0..n-1] -> back
    const bind = (f, face, off) => f.userData.slots.forEach((s, k) => { s.hit.userData.dst = { t: 'slot', face, i: off + k }; this.pads.push(s.hit); s.anchor = f.userData.anchor; s.dstIndex = off + k; s.face = face; });
    bind(this.flaps.upper, 'front', 0); bind(this.flaps.lower, 'front', n); bind(this.flaps.back, 'back', 0);
    // side mounts (guns lie on straps)
    this.sideAnchors = [V(-0.42, 0.1, 0), V(0.52, 0.11, 0)];
    this.sideAnchors.forEach((p, i) => { const hit = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.62), HIT); hit.position.copy(p); hit.position.y += 0.03; hit.userData = { dst: { t: 'side', i }, flap: i ? 'wing' : 'left' }; this.group.add(hit); this.pads.push(hit); });
    // pocket tray hit area
    this.trayHit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56), HIT); this.trayHit.position.set(0, 0.1, 0); this.trayHit.userData = { dst: { t: 'pocket' }, flap: 'tray' }; this.group.add(this.trayHit); this.pads.push(this.trayHit);
    this.itemRoot = new THREE.Group(); this.group.add(this.itemRoot); this.sig = ''; this.setOpenAmt(0);
    // loot tray: whatever you're searching is laid out beside the bag as real objects
    this.lootSlots = []; if (this.lootCtx) {
      const L = this.lootCtx, tray = new THREE.Group(); tray.position.set(-1.12, 0, 0.0); this.group.add(tray); this.lootAnchor = tray;
      const n = L.items.length, cols = Math.min(3, Math.max(2, n)), rows = Math.ceil(n / cols);
      add(new THREE.BoxGeometry(0.2 + cols * 0.15, 0.03, 0.2 + rows * 0.15), dark, 0, 0.015, 0, tray); add(new THREE.BoxGeometry(0.12 + cols * 0.15, 0.012, 0.12 + rows * 0.15), leather(0x3a2c1c), 0, 0.036, 0, tray);
      for (let i = 0; i < n; i++) {
        const c = i % cols, r = Math.floor(i / cols), px = (c - (cols - 1) / 2) * 0.15, pz = (r - (rows - 1) / 2) * 0.15;
        add(new THREE.BoxGeometry(0.12, 0.004, 0.12), leather(0x20150c), px, 0.044, pz, tray);
        const hit = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.13), HIT); hit.position.set(px, 0.12, pz); hit.userData = { dst: { t: 'loot', i }, flap: 'loot' }; tray.add(hit); this.pads.push(hit); this.lootSlots.push({ px, pz });
      }
    }
  }
  openAmt(name) { const t = this.t; const ofs = { upper: 0.28, lower: 0.34, back: 0.5 }[name]; return Math.min(1, Math.max(0, (t - ofs) / 0.32)); }
  setOpenAmt() {
    const t = this.t, e = k => k * k * (3 - 2 * k);
    const u = e(this.openAmt('upper')), l = e(this.openAmt('lower')), b = e(this.openAmt('back'));
    this.flaps.upper.rotation.x = -Math.PI * u; this.flaps.lower.rotation.x = Math.PI * l; this.flaps.back.rotation.z = -Math.PI * b;
    this.flaps.upper.position.y = 0.085 - 0.055 * u; this.flaps.lower.position.y = 0.085 - 0.055 * l; this.flaps.back.position.y = 0.075 - 0.045 * b;
    const zt = Math.min(1, t / 0.3); this.pull.position.x = 0.3 - 0.6 * zt; this.zip.children[2].position.x = this.pull.position.x; this.zip.visible = t < 0.97;
    this.pull.position.y = 0.13; this.itemRoot.visible = true;
  }

  // ------ items as physical objects ------
  refreshItems() {
    const P = G.pack; const sig = JSON.stringify([P.front, P.back, P.sides, P.pocket, P.tier, ASSET.version, HAND.v && HAND.v.id, this.lootCtx && this.lootCtx.items]); if (sig === this.sig) return; this.sig = sig;
    for (const it of this.items) it.parent && it.parent.remove(it); this.items = []; this.clusterHits && this.clusterHits.forEach(h => { h.parent && h.parent.remove(h); const k = this.pads.indexOf(h); if (k >= 0) this.pads.splice(k, 1); }); this.clusterHits = [];
    const place = (entry, parent, x, z, rot = 0, big = false) => {
      const g = new THREE.Group(); g.position.set(x, 0.01, z); parent.add(g); this.items.push(g);
      if (entry.uid) { const m = gunMesh(entry.id); const sc = GUN[ITEMS[entry.id].gun].cls === 'pistol' ? 0.6 : GUN[ITEMS[entry.id].gun].cls === 'smallshotgun' ? 0.38 : 1; m.scale.setScalar(big ? 1 : sc); m.rotation.z = Math.PI / 2; m.rotation.y = rot; m.position.y = 0.05; g.add(m); return g; }
      const k = Math.min(4, entry.n); for (let q = 0; q < k; q++) { const m = itemMesh(entry.id); m.position.set((q % 2) * 0.03 - 0.015, q * 0.012, Math.floor(q / 2) * 0.03 - 0.015); m.rotation.y = q * 1.7; g.add(m); }
      return g;
    };
    for (const f of Object.values(this.flaps)) for (const s of f.userData.slots) {
      const face = f.userData.name === 'back' ? 'back' : 'front'; const idx = f.userData.name === 'lower' ? s.dstIndex : s.dstIndex; const e = P[face][idx]; if (!e) continue;
      place(e, f.userData.anchor, s.px, s.pz);
    }
    if (this.lootCtx && this.lootAnchor) this.lootCtx.items.forEach((e, i) => { if (!e || !this.lootSlots[i]) return; const g = place(e, this.lootAnchor, this.lootSlots[i].px, this.lootSlots[i].pz); g.position.y = 0.05; });
    P.sides.forEach((g, i) => { if (!g) return; const it = place(g, this.group, this.sideAnchors[i].x, this.sideAnchors[i].z, Math.PI, true); it.position.y = this.sideAnchors[i].y - 0.04; it.userData.side = true; });
    // pocket pile
    const ids = Object.entries(P.pocket).filter(([, c]) => c > 0); const cols = 5;
    ids.forEach(([id, c], k) => {
      const x = (k % cols - (cols - 1) / 2) * 0.1, z = (Math.floor(k / cols) - 1) * 0.1; const g = new THREE.Group(); g.position.set(x, 0.06, z); this.itemRoot.add(g); this.items.push(g);
      const q = Math.min(5, c); for (let i = 0; i < q; i++) { const m = itemMesh(id); m.position.set((i % 3) * 0.022 - 0.022, i * 0.013, Math.floor(i / 3) * 0.025 - 0.01); m.rotation.y = i * 2.3; m.scale.setScalar(0.85); g.add(m); }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), HIT); hit.position.set(x, 0.1, z); hit.userData = { dst: { t: 'pocket', id }, flap: 'tray' }; this.group.add(hit); this.pads.push(hit); this.clusterHits.push(hit);
    });
  }

  // ------ state machine ------
  openLoot(ctx, player) { this.lootCtx = ctx; this.sig = ''; if (this.phase === 'idle') this.begin(player); }
  begin(player) { if (this.phase !== 'idle') return; this.phase = 'lowering'; player.packOpen = true; sfx('zip', 0.7); G.packWorldOpen = true; }
  requestClose() { if (this.phase === 'open' || this.phase === 'opening') { this.phase = 'closing'; sfx('zip', 0.7); } else if (this.phase === 'lowering') this.phase = 'lifting'; }
  update(dt, player, ctx) {
    this.prompt = ''; if (this.phase === 'idle') { this.group.visible = false; this.ring.visible = this.label.visible = false; return; }
    const f = player.packFloor;
    if (this.phase === 'lowering') { player.packOpen = true; if (player.packT >= 0.97 && f) { this.build(); this.group.position.set(f.x, f.y, f.z); this.group.rotation.y = f.yaw; this.group.visible = true; player.packHidden = true; this.t = 0; this.phase = 'opening'; this.refreshItems(); sfx('zip', 0.9); } }
    else if (this.phase === 'opening') { this.t = Math.min(1, this.t + dt / 1.5); this.setOpenAmt(); if (this.t >= 1) this.phase = 'open'; this.hoverCheck(player, false); }
    else if (this.phase === 'open') { this.refreshItems(); this.hoverCheck(player, true); this.act(player, ctx); }
    else if (this.phase === 'closing') { this.t = Math.max(0, this.t - dt / 1.1); this.setOpenAmt(); this.ring.visible = this.label.visible = false; if (this.t <= 0) { this.group.visible = false; player.packHidden = false; this.phase = 'lifting'; player.packOpen = false; this.pickupAnim = 0; } }
    else if (this.phase === 'lifting') { player.packOpen = false; if (player.packT <= 0.02) { this.phase = 'idle'; G.packWorldOpen = false; if (this.lootCtx) { const L = this.lootCtx; this.lootCtx = null; this.lootSlots = []; L.onClose && L.onClose(L.items.filter(Boolean)); } } }
    if (this.group.visible && this.phase !== 'closing') this.group.updateMatrixWorld(true);
  }

  // ------ aiming at things in the bag ------
  hoverCheck(player, live) {
    this.hover = null; this.ring.visible = false; this.label.visible = false; if (!live) return;
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera); const hits = this.ray.intersectObjects(this.pads, false);
    const ok = hits.filter(h => { const fl = h.object.userData.flap; return fl === 'loot' ? true : fl === 'tray' ? this.openAmt('lower') > 0.95 && this.openAmt('upper') > 0.95 : fl === 'left' ? true : fl === 'wing' ? this.openAmt('back') > 0.95 : this.openAmt(fl) > 0.95; });
    if (!ok.length) return;
    // prefer pocket clusters over the tray, and slots over everything beneath them
    ok.sort((a, b) => a.distance - b.distance + ((a.object.userData.dst.t === 'pocket' && !a.object.userData.dst.id) ? 0.05 : 0) - ((b.object.userData.dst.t === 'pocket' && !b.object.userData.dst.id) ? 0.05 : 0));
    const h = ok[0]; const dst = h.object.userData.dst; const world = h.object.getWorldPosition(V()); this.hover = { dst, pos: world, obj: h.object };
    const P = G.pack; let entry = null;
    if (dst.t === 'slot') entry = P[dst.face][dst.i]; else if (dst.t === 'side') entry = P.sides[dst.i]; else if (dst.t === 'pocket' && dst.id) entry = { id: dst.id, n: P.pocket[dst.id] }; else if (dst.t === 'loot') entry = this.lootCtx.items[dst.i];
    this.hover.entry = entry; const hand = HAND.v;
    let l1 = '', l2 = '', col = 0x66f0ff, l3 = '';
    const L = a => In.label(a);
    if (entry) {
      const it = ITEMS[entry.id]; l1 = it.name + (entry.uid ? ` (${((entry.q || 1) * 100) | 0}%)` : (entry.n > 1 ? ` ×${entry.n}` : '')); l3 = describe(entry.id); l2 = hand ? `[${L('interact')}] swap with hand` : `[${L('interact')}] hold${it.use ? ` · [${L('use')}] ${entry.id === 'pack_frame' ? 'install' : 'use'}` : ''}`;
      if (!hand && !entry.uid && entry.n > 1) l2 += ` · [${L('sprint')}+${L('interact')}] all`;
    } else if (hand) { l1 = `Put ${ITEMS[hand.id].name} here`; l2 = `[${L('interact')}] place`; col = 0x7dff8a; if (!this.fits(hand, dst)) { l2 = 'does not fit here'; col = 0xff6a5a; } }
    else { l1 = dst.t === 'pocket' ? 'Front pocket' : dst.t === 'side' ? 'Side mount' : dst.t === 'loot' ? 'Empty spot' : 'Empty slot'; l2 = ''; col = 0x889099; }
    this.ring.visible = true; this.ring.position.copy(world); this.ring.position.y = this.group.position.y + 0.13; this.ring.material.color.set(col);
    this.ring.scale.setScalar(dst.t === 'side' ? 1.4 : dst.t === 'pocket' && !dst.id ? 3.5 : 1); this.ring.rotation.z += 0.02;
    this.drawLabel(l1, l2, l3); this.label.position.copy(world); this.label.position.y = this.group.position.y + 0.1; this.popT = Math.min(1, (this.popT ?? 0) + 0.12); const e = 1 - Math.pow(1 - this.popT, 3); this.label.position.y += 0.1 + 0.26 * e; this.label.scale.set(0.62 * (0.55 + 0.45 * e), 0.2325 * (0.55 + 0.45 * e), 1); this.label.visible = true;
    this.prompt = l1 ? `<b>${l1}</b> ${l2 ? '<small>' + l2 + '</small>' : ''}` : '';
    if (this._lh !== (dst.t + (dst.i ?? dst.id ?? '') + (entry ? entry.id : ''))) { this._lh = dst.t + (dst.i ?? dst.id ?? '') + (entry ? entry.id : ''); this.popT = 0; }
  }
  drawLabel(a, b, desc = '') {
    const key = a + '|' + b + '|' + desc; if (key === this._lk) return; this._lk = key; const c = this.labelCv, x = c.getContext('2d'); x.clearRect(0, 0, 640, 240);
    x.fillStyle = 'rgba(8,12,20,.86)'; x.beginPath(); x.roundRect(8, 8, 624, 224, 20); x.fill(); x.strokeStyle = 'rgba(102,240,255,.55)'; x.lineWidth = 3; x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 46px sans-serif'; x.textAlign = 'left'; x.fillText(a, 28, 62);
    x.fillStyle = '#b9c7d8'; x.font = '29px sans-serif'; const words = desc.split(' '); let line = '', y = 108, lines = 0;
    for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > 584 && line) { x.fillText(line, 28, y); y += 36; line = w; lines++; } else line = t; }
    if (line) x.fillText(line, 28, y);
    x.fillStyle = '#ffd27a'; x.font = '26px sans-serif'; x.fillText(b, 28, 216); this.labelTex.needsUpdate = true;
  }

  // ------ pick up / place / use ------
  fits(hand, dst) {
    const it = ITEMS[hand.id];
    if (dst.t === 'loot') return true;
    if (dst.t === 'side') return !!hand.uid; if (dst.t === 'pocket') return !hand.uid && it.kind === 'small';
    if (dst.t === 'slot') { if (hand.uid) return canHolster(hand.id); return it.kind !== 'small'; } return false;
  }
  act(player, ctx) {
    const P = G.pack, hover = this.hover, hand = HAND.v;
    if (In.pressed.interact || In.pressed.fire) {
      const all = !!In.down.sprint;
      if (!hover) { if (hand) this.dropHand(player); return; }
      const dst = hover.dst, cur = hover.entry;
      if (cur && !hand) return this.takeFrom(dst, cur, all);
      if (cur && hand) {   // same stackable -> merge into it, else swap
        if (!hand.uid && !cur.uid && cur.id === hand.id) return this.putInto(dst, hand);
        const prev = hand; if (!this.fits(prev, dst.t === 'pocket' ? { t: 'pocket' } : dst)) { toast('That won\'t fit there.', 'warn'); return; }
        this.takeFrom(dst, cur, true); const taken = HAND.v; HAND.v = null; this.putInto(dst, prev); if (!HAND.v) HAND.v = taken; else { addItem(taken.id, taken.n || 1); HAND.v = HAND.v; } return;
      }
      if (!cur && hand) { if (!this.fits(hand, dst)) { toast('That won\'t fit there.', 'warn'); return; } return this.putInto(dst, hand); }
    }
    if (In.pressed.use) {
      const target = hand && !hand.uid ? { held: true, id: hand.id } : hover && hover.entry && !hover.entry.uid ? { dst: hover.dst, id: hover.entry.id } : null; if (!target) return;
      const id = target.id; const it = ITEMS[id];
      if (id === 'pack_frame') { if (target.held) { if (upgradePack()) { hand.n--; if (hand.n <= 0) HAND.v = null; this.build(); this.sig = ''; this.setOpenAmt(); sfx('good'); } } else if (this.take(target.dst, 1)) { if (upgradePack()) { this.build(); this.sig = ''; this.setOpenAmt(); sfx('good'); } else addItem(id, 1); } else toast('Pick it up first.', 'warn'); return; }
      if (it.use) { if (target.held) { player.use(id); } else { const fake = this.take(target.dst, 1); if (fake) { HAND.v = { id, n: 1, item: true }; player.use(id); } } return; }
      if (id === 'coil' || id === 'tank_ext') { const near = ctx.surf.shipPos && Math.hypot(player.pos.x - ctx.surf.shipPos.x, player.pos.z - ctx.surf.shipPos.z) < 20; if (!near) { toast('Take it to your ship to fit it.', 'warn'); return; } const slot = id === 'coil' ? 'coils' : 'tank'; if (G.ship[slot] >= 4) { toast('Ship slots are full.', 'warn'); return; } if (target.held) { hand.n--; if (hand.n <= 0) HAND.v = null; } else this.take(target.dst, 1); G.ship[slot]++; toast(id === 'coil' ? 'Spaceway coil fitted.' : 'Fuel tank extended.', 'good'); return; }
      if (id === 'fuel') { if (target.held) { hand.n--; if (hand.n <= 0) HAND.v = null; } else this.take(target.dst, 1); G.fuel = Math.min(100, G.fuel + 25); toast('Fuel rod loaded.', 'good'); }
    }
    if (In.pressed.reload && hand) this.dropHand(player);
    if (In.pressed.holster && hand) { if (hand.uid) stowHand(); else { const left = addItem(hand.id, hand.n || 1); HAND.v = left ? { ...hand, n: left } : null; } sfx('ui'); }
  }
  take(dst, n) {   // remove n units from a source (non-gun)
    const P = G.pack;
    if (dst.t === 'slot') { const e = P[dst.face][dst.i]; if (!e || e.uid) return false; e.n -= n; if (e.n <= 0) P[dst.face][dst.i] = null; return true; }
    if (dst.t === 'pocket' && dst.id) return removeItem(dst.id, n); return false;
  }
  takeFrom(dst, cur, all) {
    const P = G.pack; sfx('ui', 0.6);
    if (dst.t === 'loot') { const L = this.lootCtx; HAND.v = cur.uid ? cur : { id: cur.id, n: cur.n || 1, item: true }; L.items[dst.i] = null; G.quickDrawn = false; return; }
    if (cur.uid) { if (dst.t === 'side') { HAND.v = P.sides[dst.i]; P.sides[dst.i] = null; } else { HAND.v = P[dst.face][dst.i]; P[dst.face][dst.i] = null; } G.quickDrawn = false; return; }
    const n = all ? cur.n : 1; if (this.take(dst, n)) HAND.v = { id: cur.id, n, item: true };
  }
  putInto(dst, hand) {
    const P = G.pack; sfx('ui', 0.6);
    if (dst.t === 'loot') { const L = this.lootCtx, e = L.items[dst.i]; if (!e) { L.items[dst.i] = hand; HAND.v = null; } else if (!hand.uid && !e.uid && e.id === hand.id) { e.n = (e.n || 1) + (hand.n || 1); HAND.v = null; } return; }
    if (hand.uid) { if (dst.t === 'side') { if (P.sides[dst.i]) return; P.sides[dst.i] = hand; HAND.v = null; } else if (dst.t === 'slot') { if (P[dst.face][dst.i]) return; P[dst.face][dst.i] = hand; HAND.v = null; } return; }
    if (dst.t === 'pocket') { addItem(hand.id, hand.n, P); HAND.v = null; return; }
    if (dst.t === 'slot') { const e = P[dst.face][dst.i]; const stack = ITEMS[hand.id].stack || 20; if (!e) { P[dst.face][dst.i] = { id: hand.id, n: Math.min(stack, hand.n) }; hand.n -= Math.min(stack, hand.n); } else if (e.id === hand.id) { const a = Math.min(stack - e.n, hand.n); e.n += a; hand.n -= a; } if (hand.n <= 0) HAND.v = null; }
  }
  dropHand(player) {
    const h = HAND.v; if (!h) return; const f = V(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)); const pos = { x: player.pos.x + f.x * 1.9 + 0.5, z: player.pos.z + f.z * 1.9 };
    HAND.v = null; if (h.uid) G.dropped && G.dropped(h); else this.hooks.dropItem(h, pos); sfx('ui', 0.5);
  }
}
