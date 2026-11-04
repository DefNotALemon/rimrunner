// Hands-on containers: chests, lockers, cases and cabinets open where they stand (lid lifts, door swings, drawer slides out)
// with the contents lying inside as real 3D items. Aim at one and click to reach out and grab it into the bag on your
// shoulder. A full bag never grabs: the centre of the screen says INVENTORY FULL and the item shakes. The pack stays on your back.
import * as THREE from '../vendor/three.module.js';
import { G, toast, addItem, addGun, uid } from './state.js';
import { ITEMS } from './data.js';
import { itemMesh } from './models.js';
import { In } from './input.js';
import { sfx } from './audio.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const ease = k => k * k * (3 - 2 * k);
const REACH = 3.4;   // walk further than this from an open container and it shuts again

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
  close() { const c = this.cur; if (!c) return; this.cur = null; c.rig.want = 0; this.anims.add(c); this.hoverItem = null; this.ring.visible = false; this.prompt = ''; sfx('zip', 0.4); }
  closeAll() { this.close(); }

  // items as real objects lying in the open container
  build(c) {
    for (const it of c.itemObjs || []) it.group.parent && it.group.parent.remove(it.group);
    c.itemObjs = []; const R = c.rig, ents = c.entries || (c.entries = []);
    const n = ents.length;
    ents.forEach((e, i) => {
      if (!e) return; const g = new THREE.Group(); const m = itemMesh(e.id); const isGun = ITEMS[e.id].kind === 'gun';
      const box = new THREE.Box3().setFromObject(m), sz = box.getSize(V()); const sc = isGun ? Math.min(1, (R.k.w - 0.14) / Math.max(sz.x, sz.z, 0.01), 0.5 / Math.max(sz.x, sz.z, 0.01)) : 1.5;
      m.scale.multiplyScalar(sc); if (isGun && sz.x < sz.z) m.rotation.y = 0; g.add(m);
      const p = slotPos(c, i, n); g.position.copy(p); g.userData.base = p.clone();
      const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.17, sz.x * sc), 0.2, Math.max(0.17, sz.z * sc)), HIT); hit.position.y = 0.09; hit.userData.entry = e; g.add(hit);
      R.tray.add(g); c.itemObjs.push({ group: g, hit, entry: e, shake: 0 });
    });
  }

  // ---- per frame (call BEFORE player.update so a grab click is not also a shot) ----
  update(dt, player, ctx) {
    for (const c of [...this.anims]) {
      const R = c.rig, d = R.want - R.t, step = dt / 0.55; R.t = Math.abs(d) <= step ? R.want : R.t + Math.sign(d) * step;
      const e = ease(R.t); R.apply(e); const showing = R.t > 0.35; for (const it of c.itemObjs || []) it.group.visible = showing;
      if (R.t === R.want) this.anims.delete(c);
    }
    this.flyUpdate(dt);
    if (this.msgT > 0) { this.msgT -= dt; if (this.msg) { this.msg.style.opacity = Math.min(1, this.msgT * 3); if (this.msgT <= 0) this.msg.style.display = 'none'; } }
    this.hoverItem = null; this.ring.visible = false; this.prompt = '';
    const c = this.cur; if (!c) return;
    if (Math.hypot(player.pos.x - c.x, player.pos.z - c.z) > REACH) { this.close(); return; }
    for (const it of c.itemObjs) { if (it.shake > 0) { it.shake -= dt; const k = Math.sin(it.shake * 60) * 0.015 * Math.min(1, it.shake * 4); it.group.position.x = it.group.userData.base.x + k; } else it.group.position.x = it.group.userData.base.x; }
    if (c.rig.t < 0.9) return;
    this.ray.setFromCamera({ x: 0, y: 0 }, this.camera); const hits = this.ray.intersectObjects(c.itemObjs.map(i => i.hit), false);
    if (hits.length) {
      const it = c.itemObjs.find(i => i.hit === hits[0].object); this.hoverItem = it; const e = it.entry, def = ITEMS[e.id];
      this.ring.visible = true; it.hit.getWorldPosition(this.ring.position); this.ring.position.y += 0.04; this.ring.quaternion.copy(this.camera.quaternion);
      const name = def.name + (e.uid ? '' : (e.n > 1 ? ` ×${e.n}` : ''));
      this.prompt = `<b>${name}</b> <small><kbd>${In.label('fire')}</kbd> grab · <kbd>${In.label('sprint')}</kbd>+<kbd>${In.label('fire')}</kbd> one</small>`;
      if (In.pressed.fire) { this.grab(c, it, !!In.down.sprint); In.pressed.fire = false; In.down.fire = false; }
    } else this.prompt = `<small><kbd>${In.label('interact')}</kbd> close</small>`;
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
