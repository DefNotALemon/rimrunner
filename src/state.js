// Game state + backpack/inventory logic
import { ITEMS, GUN, PACK_SLOTS, TECH } from './data.js';
import { clamp } from './util.js';

export const G = {
  credits: 350, hp: 100, hunger: 100, thirst: 100, oxygen: 100, temp: 0,
  pack: null, hand: null, quickDrawn: false, tech: { fieldcraft: true },
  skills: { mining: 0, gunsmith: 0, trading: 0, piloting: 0, lockpick: 0, speech: 0 },
  rep: 0, heat: 0, bounty: 0, fines: [], quests: [], doneQuests: 0, knownBuyers: {}, shop: null,
  lockers: [], fuel: 100, hull: 100, ship: { coils: 0, tank: 0 }, seed: 1971, sysIndex: 0, planetIndex: 0,
  visited: {}, charted: 0, time: 0, uid: 1, confiscated: null,
  toastFn: null, dropped: null,
};
export const toast = (m, kind = '') => { G.toastFn && G.toastFn(m, kind); };
export const uid = () => G.uid++;

export function newPack(tier = 0) {
  const n = PACK_SLOTS[tier];
  // a school backpack: one zipper splits it into two halves of n slots each (front = base half, back = cover half); a small front pocket for unlimited small items; two side mounts
  return { tier, front: Array(n).fill(null), back: Array(n).fill(null), pocket: {}, sides: [null, null] };
}
export function newLockers() { return Array.from({ length: 6 }, () => Array(8).fill(null)); }
export function resetGame() {
  G.pack = newPack(0); G.lockers = newLockers(); G.hand = null; G.held = null;
  addGun({ id: 'pistol', q: 1, uid: uid() });
  addItem('ration', 3); addItem('water', 3); addItem('ammo', 4); addItem('medkit', 1);
}

export const isSmall = id => ITEMS[id].kind === 'small';
export const isGun = id => ITEMS[id].kind === 'gun';
export const gunCls = id => GUN[ITEMS[id].gun].cls;
export const canHolster = id => isGun(id) && gunCls(id) !== 'long';
export const itemValue = e => Math.round(ITEMS[e.id].value * (e.q || 1));

// ---- adding / counting ----
export function addItem(id, n = 1, into = G.pack) {
  const it = ITEMS[id];
  if (it.kind === 'gun') { let ok = 0; for (let i = 0; i < n; i++) if (addGun({ id, q: 1, uid: uid() }, into)) ok++; return n - ok; }
  if (it.kind === 'small') { into.pocket[id] = (into.pocket[id] || 0) + n; return 0; }   // the front pocket holds infinite small items
  const stack = it.stack || 20;
  for (const face of [into.front, into.back]) for (let i = 0; i < face.length && n > 0; i++) {
    const s = face[i]; if (s && s.id === id && !s.uid && s.n < stack) { const a = Math.min(n, stack - s.n); s.n += a; n -= a; }
  }
  for (const face of [into.front, into.back]) for (let i = 0; i < face.length && n > 0; i++) {
    if (!face[i]) { const a = Math.min(n, stack); face[i] = { id, n: a }; n -= a; }
  }
  return n;   // leftover that didn't fit
}
export function addGun(g, into = G.pack) {
  for (let i = 0; i < 2; i++) if (!into.sides[i]) { into.sides[i] = g; return true; }
  if (canHolster(g.id)) for (const face of [into.front, into.back]) for (let i = 0; i < face.length; i++) if (!face[i]) { face[i] = g; return true; }
  return false;
}
export function count(id, from = G.pack) {
  if (isSmall(id)) return from.pocket[id] || 0;
  let c = 0; for (const f of [from.front, from.back]) for (const s of f) if (s && s.id === id && !s.uid) c += s.n;
  return c;
}
export function removeItem(id, n, from = G.pack) {
  if (count(id, from) < n) return false;
  if (isSmall(id)) { from.pocket[id] -= n; if (!from.pocket[id]) delete from.pocket[id]; return true; }
  for (const f of [from.back, from.front]) for (let i = 0; i < f.length && n > 0; i++) {
    const s = f[i]; if (s && s.id === id && !s.uid) { const a = Math.min(n, s.n); s.n -= a; n -= a; if (!s.n) f[i] = null; }
  }
  return true;
}
export function freeSlots(p = G.pack) { return [...p.front, ...p.back].filter(s => !s).length; }
export function canAdd(id, n = 1) { return addItem(id, n, JSON.parse(JSON.stringify(G.pack))) === 0; }
export function allGuns() {
  const out = [];
  G.pack.sides.forEach((g, i) => g && out.push({ g, loc: { t: 'side', i } }));
  for (const face of ['front', 'back']) G.pack[face].forEach((g, i) => g && g.uid && out.push({ g, loc: { t: 'slot', face, i } }));
  return out;
}
export function takeAt(loc) {
  if (loc.t === 'side') { const g = G.pack.sides[loc.i]; G.pack.sides[loc.i] = null; return g; }
  const g = G.pack[loc.face][loc.i]; G.pack[loc.face][loc.i] = null; return g;
}
export function putAt(loc, g) { if (loc.t === 'side') G.pack.sides[loc.i] = g; else G.pack[loc.face][loc.i] = g; }
// Hold a stowed gun: swaps with what's in hand (the old gun takes the freed place if it fits there).
export function holdFrom(loc) {
  const g = takeAt(loc); const old = G.hand; G.hand = g; G.quickDrawn = false;
  if (old) {
    const fits = loc.t === 'side' || canHolster(old.id);
    if (fits) putAt(loc, old);
    else if (!addGun(old)) dropGun(old);
  }
  return g;
}
export function stowHand() {
  const g = G.hand; if (!g) return true;
  if (addGun(g)) { G.hand = null; G.quickDrawn = false; return true; }
  toast('No side mount or holster slot free.', 'warn'); return false;
}
export function dropGun(g) { toast(`Dropped the ${ITEMS[g.id].name}.`, 'warn'); G.dropped && G.dropped(g); }
// Aiming with empty hands pulls the pistol.
export function quickPull() {
  if (G.hand) return false;
  const pistols = allGuns().filter(e => gunCls(e.g.id) === 'pistol');
  if (!pistols.length) return false;
  holdFrom(pistols[0].loc); G.quickDrawn = true; return true;
}

// ---- skills ----
export const lvl = k => Math.min(10, Math.floor(Math.sqrt(G.skills[k] / 30)) + 1);
export function xp(k, a) {
  const b = lvl(k); G.skills[k] += a; if (lvl(k) > b) toast(`${k[0].toUpperCase() + k.slice(1)} skill up: level ${lvl(k)}`, 'good');
}
export const benchTier = () => Math.max(...Object.keys(G.tech).filter(k => G.tech[k]).map(k => TECH[k].tier));
export function canResearch(id) {
  const t = TECH[id]; if (G.tech[id]) return false;
  if (!t.req.every(r => G.tech[r])) return false;
  if (G.credits < t.cost) return false;
  return Object.entries(t.items).every(([i, n]) => count(i) >= n);
}
export function research(id) {
  if (!canResearch(id)) return false;
  const t = TECH[id]; G.credits -= t.cost; for (const [i, n] of Object.entries(t.items)) removeItem(i, n);
  G.tech[id] = true; toast(`Researched ${t.name}`, 'good'); return true;
}
export function canCraft(r) { return G.tech[r.tech] && Object.entries(r.in).every(([i, n]) => count(i) >= n); }
export function craft(r) {
  if (!canCraft(r)) return false;
  const it = ITEMS[r.out];
  if (it.kind === 'gun') { if (!G.pack.sides.includes(null) && !(canHolster(r.out) && freeSlots())) { toast('Nowhere to carry it — free a side mount.', 'warn'); return false; } }
  else if (it.kind !== 'small' && !canAdd(r.out, r.n)) { toast('Pack is full.', 'warn'); return false; }
  for (const [i, n] of Object.entries(r.in)) removeItem(i, n);
  if (it.kind === 'gun') { const q = clamp(0.8 + lvl('gunsmith') * 0.05 + Math.random() * 0.15, 0.6, 1.4); addGun({ id: r.out, q, uid: uid() }); xp('gunsmith', 25); toast(`Crafted ${it.name} (quality ${(q * 100) | 0}%)`, 'good'); }
  else { addItem(r.out, r.n); if (r.skill) xp(r.skill, 8); toast(`Crafted ${it.name} ×${r.n}`, 'good'); }
  return true;
}
export function upgradePack() {
  if (G.pack.tier >= 3 || !removeItem('pack_frame', 1)) return false;
  const p = G.pack; const old = PACK_SLOTS[p.tier]; p.tier++; const n = PACK_SLOTS[p.tier];
  while (p.front.length < n) p.front.push(null); while (p.back.length < n) p.back.push(null); void old;
  toast(`Pack upgraded: ${n} slots per half`, 'good'); return true;
}

// ---- save/load ----
export function save() {
  try { const o = { ...G }; delete o.toastFn; delete o.dropped; o.savedAt = Date.now(); localStorage.setItem('rimrunner_save_v1', JSON.stringify(o)); } catch (e) {}
}
export function load() {
  try { const s = JSON.parse(localStorage.getItem('rimrunner_save_v1')); if (!s || !s.pack) return false; Object.assign(G, s);
    const n = PACK_SLOTS[G.pack.tier], P = G.pack;   // migrate older layouts (single flap, three flaps, 10-slot tier) to two halves of n
    if (P.front.length !== n || P.back.length !== n) {
      const all = [...P.front, ...P.back].filter(Boolean); P.front = Array(n).fill(null); P.back = Array(n).fill(null);
      all.slice(0, 2 * n).forEach((e, k) => { (k < n ? P.front : P.back)[k % n] = e; });
      for (const e of all.slice(2 * n)) if (!e.uid) addItem(e.id, e.n || 1);   // overflow from the old 10-slot tier goes back in where it fits
    }
    return true; } catch (e) { return false; }
}
