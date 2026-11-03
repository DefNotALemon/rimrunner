// Extraction mode: procedural ship layouts. Pure data (no three.js) so it can be tested headless with node.
// A ship is a seeded cell map: tapered hull, kinked spine + ribs + rings, ducts, plazas, rooms packed in the gaps (see generateShip).
// CLASS decides size, room mix, loot and who guards it; CORP decides the look and the security that answers.
import { rng } from './util.js';

export const CORPS = {
  halcyon:  { name: 'Halcyon Dataworks', short: 'HALCYON', tag: 'clean white labs, teal glass', wall: 0xbcc7ce, dado: 0x6a808a, floor: 0x2b363c, floor2: 0x35434b, trim: 0x2a8fa0, accent: 0x38e0d0, light: 0xdaf4ff, sign: ['#0d2a30', '#6ff0e0'], sec: 'drone' },
  kessel:   { name: 'Kessel-Voss Industrial', short: 'KESSEL-VOSS', tag: 'grimy hazard-yellow heavy metal', wall: 0x9d947f, dado: 0x5a4c3c, floor: 0x3d372f, floor2: 0x312d27, trim: 0xe0a020, accent: 0xff8a1a, light: 0xffd9a0, sign: ['#2a1d08', '#ffc23a'], sec: 'mixed' },
  meridian: { name: 'Meridian Defense Systems', short: 'MERIDIAN', tag: 'olive-drab military, red stencil', wall: 0x7a8570, dado: 0x434a3c, floor: 0x2a2d30, floor2: 0x34383b, trim: 0xb02a2a, accent: 0xff3b3b, light: 0xffe6d0, sign: ['#1a1d16', '#ff5a4a'], sec: 'soldier' },
  orbitex:  { name: 'Orbitex Syndicate', short: 'ORBITEX', tag: 'dark purple luxury, chrome', wall: 0x5a5078, dado: 0x2f2846, floor: 0x211c2e, floor2: 0x2a2438, trim: 0xb78cff, accent: 0xd04bff, light: 0xe6d0ff, sign: ['#140e22', '#d6a8ff'], sec: 'drone' },
  tallow:   { name: 'Tallow & Ward Chemical', short: 'TALLOW & WARD', tag: 'pale green clinical, spill stains', wall: 0xc9d6bf, dado: 0x4c6a46, floor: 0x33433a, floor2: 0x2a372f, trim: 0x7bd04a, accent: 0xb6ff3a, light: 0xeaffd0, sign: ['#10200c', '#b6ff3a'], sec: 'mixed' },
};

// weights: which corps tend to own which families
const OWN = {
  server:  { halcyon: 5, orbitex: 3, meridian: 1, kessel: 1 },
  chem:    { tallow: 5, kessel: 2, halcyon: 1 },
  factory: { kessel: 5, orbitex: 2, halcyon: 2, meridian: 2 },
  armory:  { meridian: 6, kessel: 1 },
  prison:  { meridian: 4, orbitex: 2, kessel: 2 },
};

// room type -> [min w, max w, weight]; 'vault' and 'control' are forced in
const ROOMS = {
  server:  { serverhall: [12, 22, 5], control: [8, 12, 2], cooling: [8, 14, 2], power: [8, 12, 2], storage: [8, 12, 2], crew: [8, 12, 2], lab: [8, 12, 1] },
  chem:    { tankhall: [12, 20, 4], chemlab: [8, 14, 3], reactor: [8, 12, 2], storage: [8, 12, 2], crew: [8, 12, 2], medbay: [8, 10, 1], control: [8, 10, 1] },
  factory: { assembly: [14, 24, 5], foundry: [10, 16, 2], storage: [8, 14, 3], office: [8, 10, 1], crew: [8, 12, 2], power: [8, 12, 2], control: [8, 10, 1] },
  armory:  { armoryhall: [10, 18, 5], barracks: [8, 12, 2], guardroom: [8, 10, 2], storage: [8, 12, 2], range: [10, 14, 1], control: [8, 10, 1] },
  prison:  { cellblock: [12, 20, 5], guardroom: [8, 10, 2], canteen: [8, 12, 2], medbay: [8, 10, 1], storage: [8, 10, 1], control: [8, 10, 1] },
};
const VAULT = { server: 'vault', chem: 'vault', factory: 'vault', armory: 'vault', prison: 'evidence' };

export const CLASSES = {
  server_m:   { label: 'Server Station', size: 'medium', family: 'server', corridors: 2, W: [64, 80], band: [11, 14], ports: [1, 2], minDepth: 0, danger: 1.0, loot: 1.0, ai: 'drone', time: 14 },
  chem_s:     { label: 'Chemical Production Station', size: 'small', family: 'chem', corridors: 1, W: [44, 58], band: [11, 13], ports: [1, 1], minDepth: 0, danger: 0.9, loot: 0.9, ai: 'mixed', time: 11 },
  chem_m:     { label: 'Chemical Production Station', size: 'medium', family: 'chem', corridors: 2, W: [60, 76], band: [11, 14], ports: [1, 2], minDepth: 1, danger: 1.1, loot: 1.1, ai: 'mixed', time: 14 },
  factory_chip: { label: 'Chip Fabrication Plant', size: 'small', family: 'factory', corridors: 1, W: [48, 64], band: [12, 14], ports: [1, 1], minDepth: 0, danger: 1.0, loot: 1.1, ai: 'drone', time: 12, loot_t: 'chip' },
  factory_robot: { label: 'Robot Factory', size: 'medium', family: 'factory', corridors: 2, W: [70, 90], band: [12, 15], ports: [1, 2], minDepth: 1, danger: 1.3, loot: 1.2, ai: 'drone', time: 15, loot_t: 'robot' },
  factory_gun: { label: 'Gun Works', size: 'medium', family: 'factory', corridors: 2, W: [70, 90], band: [12, 15], ports: [1, 2], minDepth: 2, danger: 1.3, loot: 1.3, ai: 'mixed', time: 15, loot_t: 'gun' },
  factory_metal: { label: 'Metalworks', size: 'large', family: 'factory', corridors: 3, W: [90, 120], band: [12, 15], ports: [2, 3], minDepth: 2, danger: 1.2, loot: 1.3, ai: 'mixed', time: 20, loot_t: 'metal' },
  server_l:   { label: 'Server Station', size: 'large', family: 'server', corridors: 3, W: [96, 126], band: [12, 15], ports: [2, 3], minDepth: 2, danger: 1.5, loot: 1.5, ai: 'drone', time: 22 },
  armory_m:   { label: 'Military Armory', size: 'medium', family: 'armory', corridors: 2, W: [64, 84], band: [11, 14], ports: [1, 2], minDepth: 3, danger: 2.0, loot: 1.8, ai: 'soldier', time: 16 },
  prison_m:   { label: 'Prison Station', size: 'medium', family: 'prison', corridors: 2, W: [64, 84], band: [11, 14], ports: [2, 2], minDepth: 3, danger: 1.7, loot: 1.4, ai: 'mixed', time: 16 },
  armory_l:   { label: 'Fortress Armory', size: 'large', family: 'armory', corridors: 3, W: [100, 130], band: [12, 15], ports: [2, 3], minDepth: 5, danger: 2.6, loot: 2.4, ai: 'soldier', time: 24 },
  prison_l:   { label: 'Maximum-Security Prison', size: 'large', family: 'prison', corridors: 3, W: [100, 130], band: [12, 15], ports: [2, 3], minDepth: 5, danger: 2.4, loot: 2.0, ai: 'mixed', time: 24 },
  server_b:   { label: 'Server Behemoth', size: 'behemoth', family: 'server', corridors: 5, W: [190, 240], band: [13, 16], ports: [3, 4], minDepth: 6, danger: 3.0, loot: 3.2, ai: 'drone', time: 34 },
  factory_b:  { label: 'Foundry Behemoth', size: 'behemoth', family: 'factory', corridors: 5, W: [190, 240], band: [13, 16], ports: [3, 4], minDepth: 7, danger: 3.2, loot: 3.4, ai: 'mixed', time: 36, loot_t: 'metal' },
};

export const ROOM_LABEL = {
  serverhall: 'SERVER HALL', control: 'CONTROL', cooling: 'COOLING PLANT', power: 'POWER ROOM', storage: 'STORAGE', crew: 'CREW QUARTERS', lab: 'RESEARCH LAB', vault: 'DATA VAULT',
  tankhall: 'TANK HALL', chemlab: 'CHEM LAB', reactor: 'REACTOR', medbay: 'MEDBAY', assembly: 'ASSEMBLY LINE', foundry: 'FOUNDRY', office: 'OFFICE', armoryhall: 'ARMS HALL', barracks: 'BARRACKS',
  guardroom: 'GUARD ROOM', range: 'TEST RANGE', cellblock: 'CELL BLOCK', canteen: 'CANTEEN', evidence: 'EVIDENCE VAULT', dock: 'DOCK',
};
const VAULT_TYPES = new Set(['vault', 'evidence']);
export const isVault = t => VAULT_TYPES.has(t);

const REASONS = ['reactor fault, crew unresponsive', 'hull breach on the dock ring', 'lockdown after a security incident', 'distress beacon, no voice contact', 'power failure, life support cycling', 'mutiny reported, then silence', 'abandoned mid-shift, beacon still pinging', 'coolant leak, evacuation in progress'];
const NOUN = { server: 'Data Station', chem: 'Chem Station', factory: 'Works', armory: 'Armory', prison: 'Penal Station' };

function wpick(r, table) { const e = Object.entries(table); let t = e.reduce((a, [, w]) => a + w, 0), x = r() * t; for (const [k, w] of e) { x -= w; if (x <= 0) return k; } return e[0][0]; }

/** classIds available at this depth, weighted toward newer ones */
export function classesFor(depth) { return Object.keys(CLASSES).filter(k => CLASSES[k].minDepth <= depth); }

export function pickContract(seed, depth, force = {}) {
  const r = rng(seed ^ 0x51ed);
  const ids = classesFor(depth);
  const classId = force.classId || ids[Math.floor(r() * ids.length)];
  const c = CLASSES[classId];
  const corpId = force.corpId || wpick(r, OWN[c.family]);
  const code = String.fromCharCode(65 + r.int(0, 25)) + String.fromCharCode(65 + r.int(0, 25)) + '-' + r.int(1000, 9999);
  const risk = Math.min(5, Math.max(1, Math.round(c.danger + depth * 0.15)));
  return { seed, depth, classId, corpId, code, name: `${CORPS[corpId].short} ${NOUN[c.family]} ${code}`, reason: r.pick(REASONS), risk, payout: Math.round((260 + depth * 90) * c.loot) };
}

// Ceiling heights per room type (metres). Halls are tall, crew spaces low, so the skyline of a ship changes as you walk it.
const CEIL = { serverhall: 5.2, tankhall: 6.0, assembly: 6.2, foundry: 5.8, reactor: 7.0, cellblock: 5.0, armoryhall: 4.6, cooling: 4.8, canteen: 4.4, range: 4.8, chemlab: 4.0, lab: 4.0, storage: 3.9, vault: 3.4, evidence: 3.4, crew: 3.3, barracks: 3.4, guardroom: 3.4, control: 3.8, power: 4.4, medbay: 3.6, office: 3.4 };
const sm = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;

/**
 * Build the layout for a contract. Metres, +x runs along the ship, the player's ship docks on the west end.
 *
 * Not a grid of bands any more. The ship is a cell map (1 m cells):
 *   1. a hull silhouette (independent top / bottom profiles: tapered bow, swollen midships, pods, cargo notches)
 *   2. a kinked spine corridor, irregular rib corridors (some dead-end), ring corridors that make loops,
 *      narrow maintenance ducts and open plazas
 *   3. rooms packed into what is left by growing rectangles from random corners, so no two regions line up
 *   4. doors / wide arches by adjacency (room to room as well as room to corridor), vault single-entry, unreachable rooms dropped
 * Walls are then derived from the cell ownership, so the renderer needs no knowledge of the layout style.
 */
export function generateShip(contract) {
  const r = rng(contract.seed);
  const c = CLASSES[contract.classId], corp = CORPS[contract.corpId];
  const W = Math.round(r.range(c.W[0], c.W[1]) / 2) * 2, E = 5, H = 3.6, nC = c.corridors;
  const halfMax = ({ 1: 17, 2: 24, 3: 33, 5: 50 }[nC] || 24) + r.int(-2, 3);
  const gh = nC === 1 ? 8 : 10;                         // dock vestibule half-height
  const endH = Math.min(halfMax, Math.max(gh + 3, Math.round(halfMax * r.range(0.5, 0.66))));
  const noseH = Math.min(halfMax, Math.max(gh + 3, Math.round(halfMax * r.range(0.45, 0.62))));

  // ---- 1. hull silhouette: one half-width profile per side
  const profile = () => {
    const full = halfMax * r.range(0.86, 1.0), h = new Array(W);
    const bumps = []; const nb = r.int(nC >= 2 ? 1 : 0, nC >= 3 ? 4 : 2);
    for (let i = 0; i < nb; i++) { const len = r.int(12, 28), x0 = r.int(Math.round(W * 0.16), Math.max(Math.round(W * 0.16) + 1, Math.round(W * 0.78) - len)); bumps.push([x0, x0 + len, r.chance(0.7) ? r.int(3, Math.max(4, Math.round(halfMax * 0.28))) : -r.int(3, 6)]); }
    let x = 0;
    while (x < W) {
      const len = r.int(5, 11), xm = Math.min(W - 1, x + (len >> 1)), t = xm / W; let v;
      if (xm < 8) v = endH; else if (xm >= W - 10) v = noseH;
      else if (t < 0.14) v = endH; else if (t < 0.38) v = lerp(endH, full, sm((t - 0.14) / 0.24)); else if (t < 0.72) v = full; else v = lerp(full, noseH, sm((t - 0.72) / 0.28));
      if (xm >= 8 && xm < W - 10) for (const b of bumps) if (xm >= b[0] && xm < b[1]) v += b[2];
      v = Math.round(Math.max(xm < 8 || xm >= W - 10 ? gh + 3 : 9, Math.min(halfMax + 11, v)));
      for (let i = x; i < Math.min(W, x + len); i++) h[i] = v; x += len;
    }
    return h;
  };
  const top = profile(), bot = profile();
  const nx = W; const zlo = -Math.max(...bot), zhi = Math.max(...top), nz = zhi - zlo;
  const idx = (i, j) => j * nx + i;
  const own = new Int16Array(nx * nz).fill(-2);       // -2 outside the hull, -1 free interior, -3 solid fill, >=0 owner id
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const z = zlo + j; if (z >= -bot[i] && z < top[i]) own[idx(i, j)] = -1; }
  const owners = [{ kind: 'cor', H }];                  // 0 = the corridor network
  const inside = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && own[idx(i, j)] !== -2;
  const carve = (x0, x1, z0, z1, id, over) => { let n = 0; for (let i = Math.max(0, x0); i < Math.min(nx, x1); i++) for (let j = Math.max(0, z0 - zlo); j < Math.min(nz, z1 - zlo); j++) { const o = own[idx(i, j)]; if (o === -1 || (over && o === 0)) { own[idx(i, j)] = id; n++; } } return n; };
  const carves = [];                                    // rects for decor (lamps, pipes, ribs)
  const rec = (kind, x0, x1, z0, z1, extra = {}) => carves.push({ kind, x0, x1, z0, z1, ...extra });
  const reach = (i, j0, j1, dir, w) => { let n = 0; for (let j = j0; dir > 0 ? j < nz : j >= 0; j += dir) { let ok = true; for (let k = 0; k < w; k++) if (!inside(i + k, j)) ok = false; if (!ok) break; n++; } return n; };

  // ---- 2a. spine: kinked, always returns to z=0 so both docks line up
  const cw = r.int(3, 4), segs = []; let x = 0, zc = 0;
  while (x < W) {
    let xe = Math.min(W, x + (x === 0 ? r.int(18, 28) : r.int(16, 32))); if (W - xe < 14) xe = W;
    segs.push({ x0: x, x1: xe, z: zc });
    const z0 = Math.round(zc - cw / 2); carve(x, xe, z0, z0 + cw, 0); rec('spine', x, xe, z0, z0 + cw, { dir: 'x' });
    if (xe >= W) break;
    let mt = 99, mb = 99; for (let xx = xe; xx < Math.min(W, xe + 30); xx++) { mt = Math.min(mt, top[xx]); mb = Math.min(mb, bot[xx]); }
    let nz2 = xe > W - 36 ? 0 : zc + (r.chance(0.5) ? 1 : -1) * r.int(3, 9);
    nz2 = xe > W - 36 ? 0 : Math.max(-(mb - 8), Math.min(mt - 8, nz2));
    const z1 = Math.round(nz2 - cw / 2); carve(xe - cw, xe, Math.min(z0, z1), Math.max(z0, z1) + cw, 0); rec('spine', xe - cw, xe, Math.min(z0, z1), Math.max(z0, z1) + cw, { dir: 'z' });
    zc = nz2; x = xe;
  }
  const spineAt = xx => { for (const s of segs) if (xx >= s.x0 && xx < s.x1) return s.z; return 0; };
  carve(0, E, -gh, gh, 0); carve(W - E, W, -gh, gh, 0); rec('gallery', 0, E, -gh, gh); rec('gallery', W - E, W, -gh, gh);

  // ---- 2b. ribs: irregular side corridors, some stop short and dead-end
  const ribs = []; const stashes = []; let rx = E + r.int(9, 14);
  while (rx < W - E - 9) {
    const rw = r.chance(0.65) ? 3 : 4, sz = spineAt(rx), sTop = Math.round(sz - cw / 2) + cw, sBot = Math.round(sz - cw / 2);
    const rb = { x0: rx, x1: rx + rw, up: 0, dn: 0 };
    for (const dir of [1, -1]) {
      if (!r.chance(nC === 1 ? 0.85 : 0.9)) continue;
      const jStart = (dir > 0 ? sTop : sBot - 1) - zlo, full = reach(rx, jStart, 0, dir, rw);
      let len = full; if (full > 12 && r.chance(0.3)) len = Math.floor(full * r.range(0.4, 0.72)); else if (full > 6 && r.chance(0.4)) len = full - r.int(1, 3);
      if (len < 4) continue;
      const za = dir > 0 ? sTop : sBot - len, zb = dir > 0 ? sTop + len : sBot; carve(rx, rx + rw, za, zb, 0); rec('rib', rx, rx + rw, za, zb, { dir: 'z' });
      if (dir > 0) rb.up = len; else rb.dn = len;
      if (len < full - 3 && len >= 6) stashes.push({ x: rx + rw / 2, z: dir > 0 ? zb - 0.8 : za + 0.8, rot: dir > 0 ? Math.PI : 0 });
    }
    if (rb.up || rb.dn) ribs.push(rb);
    rx += r.int(15, 25);
  }
  // ring corridors close loops between neighbouring ribs
  if (halfMax >= 20) for (let k = 0; k + 1 < ribs.length; k++) {
    if (!r.chance(0.55)) continue; const A = ribs[k], B = ribs[k + 1], up = r.chance(0.5), la = up ? A.up : A.dn, lb = up ? B.up : B.dn; if (Math.min(la, lb) < 12) continue;
    const sz = spineAt(A.x1), base = up ? Math.round(sz - cw / 2) + cw : Math.round(sz - cw / 2), off = Math.floor(Math.min(la, lb) * r.range(0.5, 0.75)), zl = up ? base + off : base - off - 3;
    let ok = true; for (let i = A.x1; i < B.x0; i++) for (let z = zl; z < zl + 3; z++) if (!inside(i, z - zlo)) ok = false; if (!ok) continue;
    carve(A.x1, B.x0, zl, zl + 3, 0); rec('ring', A.x1, B.x0, zl, zl + 3, { dir: 'x' });
  }
  // promenades: hull-side hallways with a view, wherever the hull runs straight for a while and a rib reaches it
  if (nC >= 2) for (const side of r.chance(0.5) ? [1, -1] : [r.chance(0.5) ? 1 : -1]) {
    const hz = i => side > 0 ? top[i] : bot[i]; let i = E + 6;
    while (i < W - E - 6) { let j = i; while (j + 1 < W - E - 6 && hz(j + 1) === hz(i)) j++;
      if (j - i >= 13 && r() < 0.8) { const za = side > 0 ? hz(i) - 3 : -hz(i), x0 = i + 1, x1 = j; if (ribs.some(rb => rb.x0 >= x0 - 2 && rb.x1 <= x1 + 2 && (side > 0 ? rb.up : rb.dn) >= hz(i) - 7)) { carve(x0, x1, za, za + 3, 0); rec('ring', x0, x1, za, za + 3, { dir: 'x' }); } }
      i = j + 1; }
  }
  // maintenance ducts: narrow, low, hatch-doored shortcuts between ribs
  const ducts = [];
  if (nC >= 2) for (let n = r.int(nC >= 3 ? 1 : 0, nC >= 3 ? 3 : 2), tries = 0; n > 0 && tries < 20 && ribs.length > 1; tries++) {
    const k = r.int(0, ribs.length - 2), A = ribs[k], B = ribs[k + 1], up = r.chance(0.5), la = up ? A.up : A.dn, lb = up ? B.up : B.dn; if (Math.min(la, lb) < 10 || B.x0 - A.x1 < 5) continue;
    const sz = spineAt(A.x1), base = up ? Math.round(sz - cw / 2) + cw : Math.round(sz - cw / 2), off = r.int(4, Math.floor(Math.min(la, lb) * 0.8)), zl = up ? base + off : base - off - 2;
    let ok = true; for (let i = A.x1; i < B.x0; i++) for (let z = zl - 1; z < zl + 3; z++) if (!inside(i, z - zlo) || own[idx(i, z - zlo)] !== -1) ok = false; if (!ok) continue;
    const id = owners.length; owners.push({ kind: 'duct', H: 2.7 }); carve(A.x1, B.x0, zl, zl + 2, id); ducts.push(id); rec('duct', A.x1, B.x0, zl, zl + 2, { dir: 'x', id }); n--;
  }
  // plazas: open double-height squares where the spine passes
  const plazas = []; const nP = nC >= 5 ? 2 : nC >= 2 ? 1 : 0;
  for (let n = 0; n < nP; n++) {
    const pw = nC >= 3 ? r.int(12, 16) : r.int(10, 13), ph = nC >= 3 ? r.int(12, 16) : r.int(10, 13);
    const px = Math.round(W * (nP === 2 ? (n ? r.range(0.66, 0.78) : r.range(0.3, 0.42)) : r.range(0.4, 0.6)) - pw / 2), sz = spineAt(px + (pw >> 1)), pz = Math.round(sz - ph / 2);
    let ok = true; for (let i = px; i < px + pw; i++) for (let z = pz; z < pz + ph; z++) if (!inside(i, z - zlo) || own[idx(i, z - zlo)] < -1 || own[idx(i, z - zlo)] > 0) ok = false; if (!ok || px < E + 3 || px + pw > W - E - 3) continue;
    const id = owners.length; owners.push({ kind: 'plaza', H: 6.4 }); carve(px, px + pw, pz, pz + ph, id, true); plazas.push(id); rec('plaza', px, px + pw, pz, pz + ph, { id });
  }

  // plazas cut the spine: keep only corridor pieces that still join the dock through a plaza (>=2 cells of contact), free the rest for rooms
  { const comp = new Int32Array(nx * nz).fill(-1), par = []; let nc = 0; const find = a => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
    for (let k = 0; k < own.length; k++) if (own[k] === 0 && comp[k] < 0) { const st = [k]; comp[k] = nc; par[nc] = nc; while (st.length) { const q = st.pop(), i = q % nx, j = (q / nx) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const kk = jj * nx + ii; if (own[kk] === 0 && comp[kk] < 0) { comp[kk] = nc; st.push(kk); } } } nc++; }
    const pn = new Map(); plazas.forEach((p, i) => { pn.set(p, nc + i); par[nc + i] = nc + i; });
    const touch = new Map();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const o = own[idx(i, j)]; if (!pn.has(o)) continue; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; if (own[idx(ii, jj)] === 0) { const key = pn.get(o) + ',' + comp[idx(ii, jj)]; touch.set(key, (touch.get(key) || 0) + 1); } } }
    for (const [key, n] of touch) if (n >= 2) { const [p, cc] = key.split(',').map(Number); par[find(p)] = find(cc); }
    const main = find(comp[idx(2, -zlo)]);   // the dock vestibule cell at (2, z=0)
    for (let k = 0; k < own.length; k++) if (own[k] === 0 && find(comp[k]) !== main) own[k] = -1;
    for (let q = plazas.length - 1; q >= 0; q--) if (find(pn.get(plazas[q])) !== main) { for (let k = 0; k < own.length; k++) if (own[k] === plazas[q]) own[k] = -1; plazas.splice(q, 1); }
  }

  // ---- 3. pack rooms into the remaining space: random corner, random size, no shared grid
  const table = ROOMS[c.family], weights = Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v[2]]));
  const rooms = [];
  const isFree = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && own[idx(i, j)] === -1;
  const pack = (minW, minH, closet) => {
    const failed = new Set();
    for (let guard = 0; guard < 4000; guard++) {
      const cand = [];
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (own[idx(i, j)] === -1) for (let o = 0; o < 4; o++) {
        const sx = o & 1 ? 1 : -1, sz = o & 2 ? 1 : -1;
        if (!isFree(i - sx, j) && !isFree(i, j - sz) && !failed.has(idx(i, j) * 4 + o)) cand.push([i, j, sx, sz, o]);
      }
      if (!cand.length) break;
      const [i, j, sx, sz, o] = cand[Math.floor(r() * cand.length)];
      let type, w, h;
      if (closet) { type = 'storage'; w = r.int(3, 5); h = r.int(3, 5); }
      else { type = wpick(r, weights); const [mn, mx] = table[type]; w = Math.round(r.range(mn, mx)); h = Math.round(r.range(5, Math.min(mx, 13))); if (r.chance(0.4)) [w, h] = [h, w]; }
      let L = 0; while (isFree(i + sx * L, j)) L++;
      w = Math.min(w, L); if (L - w < 4) w = L;
      let M = 0; const rowFree = m => { for (let k = 0; k < w; k++) if (!isFree(i + sx * k, j + sz * m)) return false; return true; };
      while (rowFree(M)) M++;
      h = Math.min(h, M); if (M - h < 4) h = M;
      if (w < minW || h < minH) { failed.add(idx(i, j) * 4 + o); continue; }
      const xa = sx > 0 ? i : i - w + 1, ja = sz > 0 ? j : j - h + 1, id = owners.length;
      for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) own[idx(xa + a, ja + b)] = id;
      const rm = { id: rooms.length, type, x0: xa, x1: xa + w, z0: zlo + ja, z1: zlo + ja + h, doors: [], loot: 0, enemies: 0, shield: false, oid: id };
      rm.H = CEIL[type] || H; owners.push({ kind: 'room', room: rm, H: rm.H }); rooms.push(rm);
    }
  };
  pack(5, 5, false); pack(3, 3, true);
  for (let k = 0; k < own.length; k++) if (own[k] === -1) own[k] = -3;
  // big-floor room types need room to breathe: a narrow pocket becomes an ordinary small room instead
  { const small = Object.fromEntries(Object.entries(table).filter(([k, v]) => v[0] <= 10 && k !== 'control').map(([k, v]) => [k, v[2]]));
    for (const m of rooms) if (table[m.type] && table[m.type][0] >= 10 && Math.min(m.x1 - m.x0, m.z1 - m.z0) < 8) { m.type = wpick(r, small); m.H = CEIL[m.type] || H; owners[m.oid].H = m.H; } }

  // ---- 4. adjacency runs, doors, vaults
  const getRuns = () => {
    const runs = [];
    for (let i = 0; i <= nx; i++) { let cur = null;
      for (let j = 0; j <= nz; j++) {
        const a = i > 0 && j < nz ? own[idx(i - 1, j)] : -2, b = i < nx && j < nz ? own[idx(i, j)] : -2;
        const ok = a !== b && !(a < 0 && b < 0);
        if (cur && ok && cur.o1 === a && cur.o2 === b) { cur.b = zlo + j + 1; continue; }
        if (cur) runs.push(cur); cur = ok ? { axis: 'z', at: i, a: zlo + j, b: zlo + j + 1, o1: a, o2: b } : null;
      } }
    for (let j = 0; j <= nz; j++) { let cur = null;
      for (let i = 0; i <= nx; i++) {
        const a = j > 0 && i < nx ? own[idx(i, j - 1)] : -2, b = j < nz && i < nx ? own[idx(i, j)] : -2;
        const ok = a !== b && !(a < 0 && b < 0);
        if (cur && ok && cur.o1 === a && cur.o2 === b) { cur.b = i + 1; continue; }
        if (cur) runs.push(cur); cur = ok ? { axis: 'x', at: zlo + j, a: i, b: i + 1, o1: a, o2: b } : null;
      } }
    return runs;
  };
  let runs = getRuns();
  const doors = [], cnt = new Map(), kindOf = o => o < 0 ? 'void' : owners[o].kind;
  const addDoor = (run, w, arch, extra = {}) => {
    for (let t = 0; t < 12; t++) {
      const lo = run.a + w / 2 + 0.45, hi = run.b - w / 2 - 0.45; if (hi < lo - 1e-6) return null;
      const u = Math.round((lo + r() * (hi - lo)) * 2) / 2; if (u < lo - 1e-6 || u > hi + 1e-6) continue;
      if (doors.some(d => d.axis === run.axis && d.at === run.at && Math.abs(d.u - u) < (d.w + w) / 2 + 0.8)) continue;
      const d = { axis: run.axis, at: run.at, u, w, arch, o1: run.o1, o2: run.o2, ...extra }; doors.push(d); cnt.set(run.o1, (cnt.get(run.o1) || 0) + 1); cnt.set(run.o2, (cnt.get(run.o2) || 0) + 1); return d;
    } return null;
  };
  const pairRuns = (a, b, minLen) => runs.filter(q => ((q.o1 === a && q.o2 === b) || (q.o1 === b && q.o2 === a)) && q.b - q.a >= minLen);
  const adjacent = (o, minLen) => { const out = new Map(); for (const q of runs) { if (q.b - q.a < minLen) continue; const other = q.o1 === o ? q.o2 : q.o2 === o ? q.o1 : null; if (other === null || other < 0) continue; (out.get(other) || out.set(other, []).get(other)).push(q); } return out; };
  // plazas open wide onto the corridors; ducts get hatches
  for (const p of plazas) for (const q of pairRuns(p, 0, 2)) addDoor(q, Math.min(q.b - q.a - 0.9, 5.5), true);
  for (const dd of ducts) { const rs = pairRuns(dd, 0, 2); const seen = new Set(); for (const q of rs) { const k = q.axis + q.at; if (seen.has(k)) continue; seen.add(k); addDoor(q, 1.4, false, { hatch: true }); } }
  // pick vaults before anything else so they stay single-entry
  const roomCand = rooms.filter(m => (m.x1 - m.x0) * (m.z1 - m.z0) >= 40 && m.x0 > W * 0.5);
  const hullTouch = m => { const a = adjacent(m.oid, 1); for (const q of runs) if ((q.o1 === m.oid && q.o2 === -2) || (q.o2 === m.oid && q.o1 === -2)) return true; return false; };
  const vaults = []; const wantV = nC >= 3 ? 2 : 1;
  const pool = (roomCand.length ? roomCand : rooms).slice().sort(() => r() - 0.5).sort((p, q) => (hullTouch(q) ? 1 : 0) - (hullTouch(p) ? 1 : 0));
  for (const m of pool) { if (vaults.length >= wantV) break; m.type = VAULT[c.family]; m.H = CEIL[m.type]; owners[m.oid].H = m.H; vaults.push(m); }
  if (!rooms.some(m => m.type === 'control')) { const q = rooms.filter(m => !isVault(m.type) && m.x1 - m.x0 >= 5); (q.length ? r.pick(q) : rooms[0]).type = 'control'; }
  for (const m of rooms) m.H = CEIL[m.type] || H, owners[m.oid].H = m.H;
  const connected = new Set([0, ...plazas, ...ducts]);
  const connect = (m, minLen) => {
    const adj = adjacent(m.oid, minLen); let opts = [];
    for (const cap of [3, 99]) { opts = [];
      for (const [o, rs] of adj) { const k = kindOf(o); if (k === 'duct') continue; if (k === 'room' && (!connected.has(o) || isVault(owners[o].room.type) || (cnt.get(o) || 0) >= cap)) continue; if (k === 'room' || connected.has(o)) opts.push([o, rs, k === 'room' ? 1 : 3]); }
      if (opts.length) break; }
    if (!opts.length) return false;
    const tot = opts.reduce((s, q) => s + q[2], 0); let x0 = r() * tot, pick = opts[0]; for (const q of opts) { x0 -= q[2]; if (x0 <= 0) { pick = q; break; } }
    const rs = pick[1].slice().sort((a, b) => (b.b - b.a) - (a.b - a.a)); const run = rs[0];
    if (!addDoor(run, 1.9, false)) return false;
    connected.add(m.oid);
    // roomy rooms get a second way in, on another run or well apart
    if (!isVault(m.type) && (m.x1 - m.x0) * (m.z1 - m.z0) > 90 && r.chance(0.7) && (cnt.get(m.oid) || 0) < 3) { const alt = [...adj.values()].flat().filter(q => connected.has(q.o1 === m.oid ? q.o2 : q.o1)); if (alt.length) addDoor(r.pick(alt), 1.9, false); }
    return true;
  };
  const normal = rooms.filter(m => !isVault(m.type));
  for (let pass = 0; pass < 14; pass++) { let any = false; for (const m of normal.slice().sort(() => r() - 0.5)) { if (connected.has(m.oid)) continue; if (connect(m, 3)) any = true; } if (!any) break; }
  for (const m of normal) if (!connected.has(m.oid)) connect(m, 2.4);
  for (let pass = 0; pass < 6; pass++) { let any = false; for (const m of normal) if (!connected.has(m.oid) && connect(m, 2.4)) any = true; if (!any) break; }
  for (const v of vaults.slice()) { if (!connect(v, 3)) { v.type = 'storage'; v.H = CEIL.storage; owners[v.oid].H = v.H; vaults.splice(vaults.indexOf(v), 1); const q = connect(v, 3); } }
  // extra doors / wide arches between neighbouring rooms: loops and open suites
  const seenPair = new Set();
  for (const q of runs) {
    if (q.o1 < 0 || q.o2 < 0 || kindOf(q.o1) !== 'room' || kindOf(q.o2) !== 'room' || q.b - q.a < 3) continue; const A = owners[q.o1].room, B = owners[q.o2].room; if (isVault(A.type) || isVault(B.type)) continue;
    const k = Math.min(q.o1, q.o2) + ',' + Math.max(q.o1, q.o2); if (seenPair.has(k)) continue; seenPair.add(k);
    if (!connected.has(q.o1) || !connected.has(q.o2) || (cnt.get(q.o1) || 0) >= 3 || (cnt.get(q.o2) || 0) >= 3) continue;
    if (r.chance(0.16) && A.type !== 'control' && B.type !== 'control' && q.b - q.a >= 5) addDoor(q, Math.min(q.b - q.a - 1.6, r.range(3.5, 6)), true);
    else if (r.chance(0.22)) addDoor(q, 1.9, false);
  }
  // drop anything the doors never reached
  const adjD = new Map(); for (const d of doors) { (adjD.get(d.o1) || adjD.set(d.o1, []).get(d.o1)).push(d.o2); (adjD.get(d.o2) || adjD.set(d.o2, []).get(d.o2)).push(d.o1); }
  const seen = new Set([0]), stack = [0]; while (stack.length) { const o = stack.pop(); for (const n of adjD.get(o) || []) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
  for (const m of rooms.slice()) if (!seen.has(m.oid)) { for (let k = 0; k < own.length; k++) if (own[k] === m.oid) own[k] = -3; rooms.splice(rooms.indexOf(m), 1); }
  for (let k = 0; k < vaults.length;) if (!rooms.includes(vaults[k])) vaults.splice(k, 1); else k++;
  for (const id of [...ducts, ...plazas]) if (!seen.has(id)) for (let k = 0; k < own.length; k++) if (own[k] === id) own[k] = -3;
  rooms.forEach((m, i) => m.id = i);
  runs = getRuns();
  const liveDoors = doors.filter(d => (d.o1 < 0 || seen.has(d.o1)) && (d.o2 < 0 || seen.has(d.o2)));
  for (const d of liveDoors) for (const [o, other] of [[d.o1, d.o2], [d.o2, d.o1]]) if (o >= 0 && owners[o].kind === 'room') {
    const m = owners[o].room, lower = o === d.o1;   // lower side = south (axis x) / west (axis z) of the wall
    m.doors.push({ axis: d.axis, at: d.at, u: d.u, w: d.w, arch: d.arch, side: d.axis === 'x' ? (lower ? 'n' : 's') : (lower ? 'e' : 'w'), z: d.axis === 'x' ? d.at : d.u, other });
  }
  for (const m of rooms) m.shield = isVault(m.type) || m.type === 'control';
  // ports on the dock vestibules: 0 is the player's
  const nPorts = r.int(c.ports[0], c.ports[1]), sp = 6.0, near = r.chance(0.4);
  const ports = [{ id: 0, mine: true, x: 0, z: 0, dir: 'w' }];
  const wFree = [sp, -sp], eFree = [0, sp, -sp];
  for (let i = 1; i < nPorts; i++) { if (near && wFree.length) ports.push({ id: i, mine: false, x: 0, z: wFree.shift(), dir: 'w', adjacent: true }); else if (eFree.length) ports.push({ id: i, mine: false, x: W, z: eFree.shift(), dir: 'e' }); else if (wFree.length) ports.push({ id: i, mine: false, x: 0, z: wFree.shift(), dir: 'w', adjacent: true }); }
  // loot + enemy budgets per room
  for (const m of rooms) {
    const area = (m.x1 - m.x0) * (m.z1 - m.z0), base = Math.max(1, Math.round(area / 55));
    const lootBias = isVault(m.type) ? 2.4 : m.type === 'storage' || m.type === 'armoryhall' || m.type === 'serverhall' ? 1.3 : m.type === 'crew' || m.type === 'barracks' ? 0.9 : 1;
    m.loot = Math.max(1, Math.round(base * lootBias * (0.7 + c.loot * 0.2)));
    const en = isVault(m.type) ? 1.4 : m.type === 'guardroom' || m.type === 'barracks' ? 1.0 : 0.45;
    m.enemies = r() < en * c.danger * 0.5 ? Math.max(1, Math.round(en * c.danger * 0.8 + r())) : 0;
  }
  for (const m of rooms) if (m.x0 < E + 14) m.enemies = 0;     // the dock stays calm
  const alive = plazas.filter(p => seen.has(p)), stashOK = stashes.filter(q => own[idx(Math.floor(q.x), Math.floor(q.z) - zlo)] === 0);
  return { contract, seed: contract.seed, classId: contract.classId, corpId: contract.corpId, cls: c, corp, W, Z: nz, E, CW: cw, H, rooms, ports, vaults, doors: liveDoors, runs, own, nx, nz, owners, carves: carves.filter(cv => cv.kind !== 'plaza' || alive.includes(cv.id)), stashes: stashOK, plazas: alive, ducts: ducts.filter(d => seen.has(d)), gh, zlo, zhi, time: Math.round(c.time * 60 * (1 - Math.min(0.3, contract.depth * 0.02))), nPorts: ports.length };
}

/** Loot tables: [id, weight, minTier]. Tier shifts weight toward richer items. */
export const LOOT = {
  server:  [['data_chip', 8, 0], ['circuit', 6, 0], ['wire', 6, 0], ['drive', 7, 0], ['cell', 3, 1], ['wafer', 2, 2], ['core', 1.2, 3], ['ammo', 3, 0], ['medkit', 2, 0]],
  chem:    [['reagent', 9, 0], ['water', 4, 0], ['medkit', 3, 0], ['o2_tank', 3, 0], ['silica', 3, 0], ['carbon', 3, 0], ['cell', 2, 1], ['stimpack', 2, 1], ['ammo', 2, 0]],
  chip:    [['wafer', 7, 0], ['circuit', 8, 0], ['data_chip', 5, 0], ['cell', 3, 0], ['core', 1.2, 2], ['ammo', 2, 0]],
  robot:   [['servo', 8, 0], ['circuit', 5, 0], ['cell', 4, 0], ['ai_core', 1.5, 2], ['gunpart', 3, 1], ['steel', 3, 0], ['ammo', 3, 0], ['medkit', 1.5, 0]],
  gun:     [['gunpart', 8, 0], ['barrel', 6, 0], ['ammo', 8, 0], ['hpistol', 1.5, 1], ['shotgun', 1.3, 1], ['coach', 1.5, 0], ['rifle', 1.1, 2], ['pulsepistol', 0.8, 3]],
  metal:   [['steel', 7, 0], ['iron_plate', 8, 0], ['alloy', 3, 1], ['titanium_ore', 3, 1], ['gunpart', 3, 0], ['servo', 2, 1], ['platinum', 1, 3], ['ammo', 2, 0]],
  armory:  [['ammo', 9, 0], ['gunpart', 5, 0], ['barrel', 4, 0], ['hpistol', 2, 0], ['shotgun', 2, 0], ['rifle', 2, 1], ['pulsepistol', 1.2, 2], ['pulsecarbine', 1.0, 3], ['scatter', 0.8, 4], ['railrifle', 0.5, 5], ['medkit', 3, 0], ['armor_plate', 2, 0]],
  prison:  [['ration', 4, 0], ['medkit', 3, 0], ['ammo', 5, 0], ['keycard', 2, 0], ['stimpack', 2, 0], ['gunpart', 2, 0], ['coach', 1, 0], ['data_chip', 3, 0]],
};
export const VAULT_LOOT = {
  server: [['core', 6, 0], ['wafer', 5, 0], ['schematic', 3, 1], ['ai_core', 1, 3]], chem: [['reagent', 5, 0], ['stimpack', 4, 0], ['schematic', 3, 1], ['hymnstone', 0.6, 3]],
  factory: [['ai_core', 5, 0], ['schematic', 4, 0], ['alloy', 4, 0], ['platinum', 2, 2]], armory: [['railrifle', 2, 2], ['pulsecarbine', 3, 1], ['scatter', 3, 1], ['armor_plate', 4, 0], ['schematic', 3, 0]],
  prison: [['keycard', 4, 0], ['schematic', 3, 0], ['ruby', 3, 0], ['pulsepistol', 2, 1]],
};
export function rollLoot(r, ship, vault, tier) {
  const fam = ship.cls.family; const t = vault ? VAULT_LOOT[fam] : LOOT[ship.cls.loot_t || fam] || LOOT[fam];
  const tbl = t.filter(e => e[2] <= tier + (vault ? 2 : 0));
  let tot = 0; for (const e of tbl) tot += e[1]; let x = r() * tot; for (const e of tbl) { x -= e[1]; if (x <= 0) return e[0]; } return tbl[0][0];
}
