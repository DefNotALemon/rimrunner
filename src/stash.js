// Hands-on containers: chests, lockers, cases and cabinets open where they stand (lid lifts, door swings, drawer slides out)
// with the contents lying inside as real 3D items. Aim at one and click to reach out and grab it into the bag on your
// shoulder. A full bag never grabs: the centre of the screen says INVENTORY FULL and the item shakes. The pack stays on your back.
// DISPLAYS (S.displays, storage.js): loot shelves and open containers (pallet, tool board, salvage bin) need no search: their
// items are built when you come near and you grab them straight off the tier. Glass med cabinets show their contents but open first.
import * as THREE from '../vendor/three.module.js';
import { G, toast, addItem, addGun, uid } from './state.js';
import { ITEMS, describe } from './data.js';
import { itemMesh } from './models.js';
import { In } from './input.js';
import { sfx } from './audio.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const ease = k => k * k * (3 - 2 * k);
const REACH = 3.4;   // walk further than this from an open container and it shuts again
const SHOW_R = 16, HIDE_R = 19;   // display items are built / shown within SHOW_R of the player, hidden past HIDE_R
const hash = (a, b, i) => { const v = Math.sin(a * 12.9898 + b * 78.233 + i * 37.719) * 43758.5453; return v - Math.floor(v); };
// does the segment a->b cross a collider (walls, other props)? the collider holding b (the item's own shelf/bin) is ignored
function blocked(S, a, b) {
  for (const c of (S && S.colliders) || []) {
    if (c.roof) continue; const top = c.maxy ?? 99;
    if (b.x > c.minx && b.x < c.maxx && b.z > c.minz && b.z < c.maxz) continue; if (a.x > c.minx && a.x < c.maxx && a.z > c.minz && a.z < c.maxz && a.y < top) continue;
    let t0 = 0, t1 = 1;
    for (const [o, d, lo, hi] of [[a.x, b.x - a.x, c.minx, c.maxx], [a.y, b.y - a.y, -1, top], [a.z, b.z - a.z, c.minz, c.maxz]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
      let p = (lo - o) / d, q = (hi - o) / d; if (p > q) [p, q] = [q, p]; t0 = Math.max(t0, p); t1 = Math.min(t1, q); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1) return true;
  }
  return false;
}

// where the contents lie, in the container's local space (front is +z): shelves of [y, innerHalfWidth]
function layoutFor(c) {
  const k = c.k, kind = c.kind;
  if (kind === 'locker' || kind === 'rack') return { shelves: kind === 'rack' ? [0.02] : [0.02, 0.92], w: k.w / 2 - 0.07, z: 0 };
  if (kind === 'safe') return { shelves: [0.02, 0.52], w: k.w / 2 - 0.1, z: 0 };
  return { shelves: [kind === 'drawer' ? 0.015 : 0], w: k.w / 2 - 0.1, z: 0 };
}
function slotPos(c, i, n) {
  const L = layoutFor(c), ns = L.shelves.length, per = Math.ceil(Math.max(n, 1) / ns), s = Math.min(ns - 1, Math.floor(i / per)), j = i - s * per;
  const inRow = s === ns - 1 ? n - s * per : per, step = Math.min(0.28, (L.w * 2) / Math.max(inRow, 1));
  return V((j - (inRow - 1) / 2) * step, L.shelves[s], L.z);
}

export class Stash {
  constructor(camera) {
    this.camera = camera; this.ray = new THREE.Raycaster(); this.ray.far = REACH + 1; this.cur = null; this.anims = new Set(); this.fly = []; this.prompt = '';
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.006, 6, 28), new THREE.MeshBasicMaterial({ color: 0x66f0ff, depthTest: false, transparent: true })); this.ring.renderOrder = 20; this.ring.visible = false;
    this.msgT = 0; this.msg = null; this.hoverItem = null;
  }
  attach(scene) { if (this.scene === scene) return; if (this.scene) this.scene.remove(this.ring); scene.add(this.ring); this.scene = scene; }
  get active() { return !!this.cur; }

  // ---- open / close ----
  toggle(c, onEmpty) { if (this.cur === c) this.close(); else this.open(c, onEmpty); }
  open(c, onEmpty) {
    if (this.cur && this.cur !== c) this.close();
    if (!c.rig) return false;
    this.cur = c; c.onEmpty = onEmpty; c.rig.want = 1; this.anims.add(c); this.build(c); sfx('zip', 0.5); return true;
  }
  close() { const c = this.cur; if (!c) return; this.cur = null; c.rig.want = 0; this.anims.add(c); this.hoverItem = null; this.ring.visible = false; this.prompt = ''; this.tagShow(); sfx('zip', 0.4); }
  closeAll() { this.close(); }

  // items as real objects lying in the open container (or on a shelf): every item rests exactly on its floor/tier top
  build(c) {
    for (const it of c.itemObjs || []) it.group.parent && it.group.parent.remove(it.group);
    c.itemObjs = []; const R = c.rig, ents = c.entries || (c.entries = []);
    const n = ents.length, tiers = c.tiers && c.tiers.length ? c.tiers : null, per = tiers ? tiers.map(() => []) : null;
    ents.forEach((e, i) => {
      if (!e) return; const g = new THREE.Group(); const m = itemMesh(e.id); const isGun = ITEMS[e.id].kind === 'gun';
      let box = new THREE.Box3().setFromObject(m, true), sz = box.getSize(V()); let sc;
      if (tiers) {   // long side along the tier, a little random yaw for loose things
        const t = e.tier >= 0 && e.tier < tiers.length ? e.tier : i % tiers.length, tl = tiers[t].x1 - tiers[t].x0;
        if (sz.z > sz.x) m.rotation.y = Math.PI / 2;
        const L = Math.max(sz.x, sz.z, 0.01); sc = isGun ? Math.min(1, (tl - 0.06) / L, (R.k.gunMax || 0.5) / L) : 1.5;
        if (!isGun) m.rotation.y += (hash(c.x, c.z, i) - 0.5) * 0.5;
        per[t].push({ g, e });
      } else sc = isGun ? Math.min(1, (R.k.w - 0.14) / Math.max(sz.x, sz.z, 0.01), 0.5 / Math.max(sz.x, sz.z, 0.01)) : 1.5;
      m.scale.multiplyScalar(sc);
      box = new THREE.Box3().setFromObject(m, true); sz = box.getSize(V());
      m.position.x -= (box.min.x + box.max.x) / 2; m.position.z -= (box.min.z + box.max.z) / 2; m.position.y -= box.min.y;   // centred, bottom on y=0
      g.add(m); g.userData.sz = sz;
      if (!tiers) { const p = slotPos(c, i, n); g.position.copy(p); g.userData.base = p.clone(); }
      const hh = Math.max(0.12, sz.y) + 0.04, hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.17, sz.x), hh, Math.max(0.17, sz.z)), HIT); hit.position.y = hh / 2 - 0.01; hit.userData.entry = e; g.add(hit);
      R.tray.add(g); c.itemObjs.push({ group: g, hit, entry: e, shake: 0 });
    });
    if (tiers) per.forEach((L, t) => {   // spread each tier's items evenly along it
      const T = tiers[t], len = T.x1 - T.x0, W = L.reduce((a, o) => a + o.g.userData.sz.x, 0), gap = (len - W) / (L.length + 1); let x = T.x0 + gap;
      L.forEach((o, j) => { const sz = o.g.userData.sz, room = Math.max(0, (T.z1 - T.z0 - sz.z) / 2), zc = (T.z0 + T.z1) / 2 + (hash(c.z, c.x, t * 7 + j) - 0.5) * 1.2 * room;
        o.g.position.set(x + sz.x / 2, T.y, zc); o.g.userData.base = o.g.position.clone(); x += sz.x + gap; });
    });
  }

  // ---- per frame (call BEFORE player.update so a grab click is not also a shot) ----
  update(dt, player, ctx) {
    for (const c of [...this.anims]) {
      const R = c.rig, d = R.want - R.t, step = dt / 0.55; R.t = Math.abs(d) <= step ? R.want : R.t + Math.sign(d) * step;
      const e = ease(R.t); R.apply(e); const showing = R.t > 0.35 || !!c.show; for (const it of c.itemObjs || []) it.group.visible = showing;
      if (R.t === R.want) this.anims.delete(c);
    }
    this.flyUpdate(dt);
    if (this.msgT > 0) { this.msgT -= dt; if (this.msg) { this.msg.style.opacity = Math.min(1, this.msgT * 3); if (this.msgT <= 0) this.msg.style.display = 'none'; } }
    this.hoverItem = null; this.ring.visible = false; this.prompt = '';
    const S = ctx && ctx.surf; this.lod(dt, player, S);
    this.hoverPick = null;
    const c = this.cur; if (!c) { this.hoverDisplays(player, ctx, S); if (!this.hoverItem) this.hoverPickups(player, ctx, S); this.tagShow(); return; }
    if (Math.hypot(player.pos.x - c.x, player.pos.z - c.z) > REACH) { this.close(); return; }
    for (const it of c.itemObjs) { if (it.shake > 0) { it.shake -= dt; const k = Math.sin(it.shake * 60) * 0.015 * Math.min(1, it.shake * 4); it.group.position.x = it.group.userData.base.x + k; } else it.group.position.x = it.group.userData.base.x; }
    if (c.rig.t < 0.9) { this.tagShow(); return; }
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera); const hits = this.ray.intersectObjects(c.itemObjs.map(i => i.hit), false);
    if (hits.length) {
      const it = c.itemObjs.find(i => i.hit === hits[0].object); this.hover(it);
      this.prompt = `<b>${this.nameOf(it.entry)}</b> <small><kbd>${In.label('fire')}</kbd> grab · <kbd>${In.label('sprint')}</kbd>+<kbd>${In.label('fire')}</kbd> one · <kbd>${In.label('interact')}</kbd> close</small>`;
      if (In.pressed.fire) { this.grab(c, it, !!In.down.sprint); In.pressed.fire = false; In.down.fire = false; }
    } else this.prompt = `<small><kbd>${In.label('interact')}</kbd> close</small>`;
    this.tagShow();
  }
  nameOf(e) { return ITEMS[e.id].name + (e.uid ? '' : (e.n > 1 ? ` ×${e.n}` : '')); }
  hover(it) { this.hoverItem = it; this.ring.visible = true; it.hit.getWorldPosition(this.ring.position); this.ring.position.y += 0.04; this.ring.quaternion.copy(this.camera.quaternion); }

  // ---- displays: shelves + open containers. Items exist only near the player; aim + fire grabs, no search, no menu ----
  lod(dt, player, S) {
    if (!S || !S.displays || !S.displays.length) return; if ((this.lodT = (this.lodT || 0) - dt) > 0 && this.lodS === S) return; this.lodT = 0.25; this.lodS = S;
    for (const d of S.displays) {
      const q = Math.hypot(player.pos.x - d.x, player.pos.z - d.z);
      if (q < SHOW_R && !d.itemObjs) this.build(d);
      if (d.itemObjs) d.rig.tray.visible = q < SHOW_R || (q < HIDE_R && d.rig.tray.visible);
    }
  }
  hoverDisplays(player, ctx, S) {
    if (!S || !S.displays || ctx.active === false || ctx.wheel || In.down.aim || player.dead) return;
    const near = S.displays.filter(d => d.open && d.itemObjs && d.itemObjs.length && d.rig.tray.visible && Math.hypot(player.pos.x - d.x, player.pos.z - d.z) < REACH + Math.max(d.k.w, d.k.d) / 2);
    if (!near.length) return;
    const hs = []; for (const d of near) for (const it of d.itemObjs) hs.push(it.hit);
    const cp = this.camera.position, cd = Math.hypot(cp.x - player.pos.x, cp.z - player.pos.z);   // third person: the lens sits behind you
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera); this.ray.far = REACH + cd; const hits = this.ray.intersectObjects(hs, false); this.ray.far = REACH + 1;
    if (!hits.length || Math.hypot(hits[0].point.x - player.pos.x, hits[0].point.z - player.pos.z) > REACH) return;
    const h = hits[0], d = near.find(q => q.itemObjs.some(i => i.hit === h.object)), it = d.itemObjs.find(i => i.hit === h.object);
    const ip = it.group.getWorldPosition(V()); ip.y += 0.05; if (blocked(S, this.camera.position, ip)) return;   // aim at the item's body, not the hit box rim
    this.hover(it); this.hoverFrom = d;
    for (const o of d.itemObjs) { if (o.shake > 0) { o.shake -= 1 / 60; o.group.position.x = o.group.userData.base.x + Math.sin(o.shake * 60) * 0.015 * Math.min(1, o.shake * 4); } else if (o.group.userData.base) o.group.position.x = o.group.userData.base.x; }
    if (In.pressed.fire) { this.grab(d, it, !!In.down.sprint); In.pressed.fire = false; In.down.fire = false; }
  }
  // ---- loose pickups (dropped guns/items lying on the ground, S.pickups): aim at one and pull the trigger to pick it up ----
  hoverPickups(player, ctx, S) {
    if (!S || !S.pickups || !S.pickups.length || !ctx || !ctx.pickup || ctx.active === false || ctx.wheel || In.down.aim || player.dead) return;
    const live = new Set(S.interactables || []); S.pickups = S.pickups.filter(p => { if (live.has(p)) return true; if (p.data && p.data.hit) p.data.hit.parent && p.data.hit.parent.remove(p.data.hit); return false; });
    const near = S.pickups.filter(p => Math.hypot(player.pos.x - p.pos.x, player.pos.z - p.pos.z) < REACH + 0.5 && Math.abs(p.pos.y - player.pos.y) < 3);
    if (!near.length) return;
    for (const p of near) if (!p.data.hit) {   // a generous invisible box round the mesh, so small things on the floor are easy to aim at
      const m = p.data.m; m.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m, true), sz = b.getSize(V()), cen = b.getCenter(V());
      const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, sz.x + 0.1), Math.max(0.25, sz.y + 0.1), Math.max(0.3, sz.z + 0.1)), HIT);
      hit.position.copy(cen); if (m.parent) m.parent.worldToLocal(hit.position); (m.parent || S.root).add(hit); hit.updateMatrixWorld(true);
      const e = p.data.g ? p.data.g : { id: p.data.h.id, n: p.data.h.n }; p.data.hit = hit; p.data.ho = { group: hit, hit, entry: e, shake: 0, pick: p };
    }
    const cp = this.camera.position, cd = Math.hypot(cp.x - player.pos.x, cp.z - player.pos.z);
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera); this.ray.far = REACH + cd; const hits = this.ray.intersectObjects(near.map(p => p.data.hit), false); this.ray.far = REACH + 1;
    if (!hits.length || Math.hypot(hits[0].point.x - player.pos.x, hits[0].point.z - player.pos.z) > REACH) return;
    const p = near.find(q => q.data.hit === hits[0].object), ip = p.data.hit.getWorldPosition(V()); if (blocked(S, cp, ip)) return;
    this.hover(p.data.ho); this.hoverPick = p;
    if (In.pressed.fire) { In.pressed.fire = false; In.down.fire = false; ctx.pickup(p); if (!(S.interactables || []).includes(p)) { this.hoverItem = null; this.hoverPick = null; this.ring.visible = false; p.data.hit.parent && p.data.hit.parent.remove(p.data.hit); } }
  }
  // hover tag under the crosshair: name, what it is, how to take it
  tagShow() {
    const it = this.hoverItem;
    if (!this.tag) { if (!it || typeof document === 'undefined' || !document.body) return; const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:50%;top:56%;transform:translateX(-50%);max-width:340px;padding:6px 12px;border-radius:6px;background:rgba(8,12,18,.62);color:#e8f4ff;font:600 15px/1.25 system-ui,sans-serif;text-align:center;pointer-events:none;z-index:29;display:none'; document.body.appendChild(d); this.tag = d; }
    if (!it) { if (this.tagOn) { this.tag.style.display = 'none'; this.tagOn = false; } return; }
    const key = it.entry.id + ':' + (it.entry.n || 1) + (this.cur ? 'c' : it.pick ? 'p' : 'd');
    if (this.tagKey !== key) { this.tagKey = key; this.tag.innerHTML = `${this.nameOf(it.entry)}<div style="font:400 13px system-ui;color:#b8c8d8;margin-top:2px">${describe(it.entry.id)}</div>` + (this.cur ? '' : `<div style="font:500 12px system-ui;color:#8fe8ff;margin-top:3px">${it.pick ? `${In.label('fire')} pick up` : `${In.label('fire')} grab · ${In.label('sprint')}+${In.label('fire')} one`}</div>`); }
    if (!this.tagOn) { this.tag.style.display = 'block'; this.tagOn = true; }
  }

  grab(c, it, one) {
    const e = it.entry, def = ITEMS[e.id]; let taken = 0, total = e.uid ? 1 : (e.n || 1);
    if (e.uid) { taken = addGun(e) ? 1 : 0; }
    else {
      const want = one ? 1 : total;
      if (def.kind === 'small') taken = want;
      else { const probe = JSON.parse(JSON.stringify(G.pack)); const left = addItem(e.id, want, probe); taken = want - left; }
      if (taken > 0) addItem(e.id, taken);
    }
    if (taken <= 0) { this.fullMsg(def.name); it.shake = 0.45; sfx('hit', 0.3); return; }
    // reach out: the whole item (or a copy for a partial stack) flies to the bag over the shoulder
    const whole = e.uid || taken >= total; this.flyItem(it, whole ? null : taken);
    if (whole) { c.entries[c.entries.indexOf(e)] = null; c.itemObjs.splice(c.itemObjs.indexOf(it), 1); }
    else { e.n = total - taken; }
    if (!e.uid && taken < (one ? 1 : total)) this.fullMsg(def.name);
    sfx('ui', 0.7);
    if (!c.entries.some(Boolean)) { c.entries = []; this.afterEmpty = 0.7; this.emptyOf = c; setTimeout(() => { if (this.cur === c) this.close(); c.onEmpty && c.onEmpty(); }, 700); }
  }

  flyItem(it, partial) {
    const src = it.group, w = src.getWorldPosition(V()); const mesh = src.children[0].clone(true);
    this.scene.add(mesh); mesh.position.copy(w); mesh.quaternion.copy(src.getWorldQuaternion(new THREE.Quaternion())); mesh.scale.copy(src.children[0].scale);
    if (!partial) src.parent && src.parent.remove(src);
    this.fly.push({ m: mesh, t: 0, from: w.clone() });
  }
  flyUpdate(dt) {
    const cam = this.camera; const f = V(0, 0, -1).applyQuaternion(cam.quaternion), r = V(1, 0, 0).applyQuaternion(cam.quaternion);
    for (let i = this.fly.length - 1; i >= 0; i--) {
      const a = this.fly[i]; a.t += dt / 0.42; const k = Math.min(1, a.t), e = ease(k);
      const to = cam.position.clone().addScaledVector(r, 0.42).addScaledVector(f, -0.32).add(V(0, -0.28, 0));
      a.m.position.copy(a.from).lerp(to, e); a.m.position.y += Math.sin(k * Math.PI) * 0.22; a.m.scale.multiplyScalar(1 - dt * 1.4); a.m.rotation.y += dt * 9;
      if (k >= 1) { this.scene.remove(a.m); this.fly.splice(i, 1); }
    }
  }
  fullMsg(name) {
    if (!this.msg) {
      const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:50%;top:44%;transform:translate(-50%,-50%);font:800 40px/1.1 system-ui,sans-serif;letter-spacing:.12em;color:#ff6a5a;text-shadow:0 2px 12px #000,0 0 18px rgba(255,80,60,.5);pointer-events:none;z-index:30;text-align:center;display:none';
      document.body.appendChild(d); this.msg = d;
    }
    this.msg.innerHTML = `INVENTORY FULL<div style="font:600 16px system-ui;letter-spacing:.04em;color:#ffd0c8;margin-top:6px">${name} stays where it is</div>`;
    this.msg.style.display = 'block'; this.msg.style.opacity = 1; this.msgT = 1.6;
  }
}
