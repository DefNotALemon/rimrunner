// Extraction mode: procedural ship layouts. Pure data (no three.js) so it can be tested headless with node.
// A ship is a seeded stack of long corridors with bands of rooms between them, joined by end galleries.
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

/** Build the layout for a contract. Everything is in metres; +x runs along the ship, the player ship docks on the west end. */
export function generateShip(contract) {
  const r = rng(contract.seed);
  const c = CLASSES[contract.classId], corp = CORPS[contract.corpId];
  const W = Math.round(r.range(c.W[0], c.W[1]) / 2) * 2, E = 5, CW = 3.4, H = 3.6, nC = c.corridors;
  const bands = [], cors = []; let z = 0;
  for (let b = 0; b <= nC; b++) {
    const D = r.range(c.band[0], c.band[1]); bands.push({ z0: z, z1: z + D, rooms: [] }); z += D;
    if (b < nC) { cors.push({ z0: z, z1: z + CW, zc: z + CW / 2 }); z += CW; }
  }
  const Z = z, dz = Z / 2;
  for (const b of bands) { b.z0 -= dz; b.z1 -= dz; } for (const k of cors) { k.z0 -= dz; k.z1 -= dz; k.zc -= dz; }
  const table = ROOMS[c.family];
  const rooms = [];
  bands.forEach((b, bi) => {
    let x = E; const xEnd = W - E;
    while (xEnd - x > 6) {
      const type = wpick(r, Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v[2]])));
      const [mn, mx] = table[type]; let w = Math.round(r.range(mn, mx));
      if (xEnd - (x + w) < 8) w = xEnd - x;
      const rm = { id: rooms.length, band: bi, type, x0: x, x1: x + w, z0: b.z0, z1: b.z1, doors: [], loot: 0, enemies: 0, shield: false };
      b.rooms.push(rm); rooms.push(rm); x += w;
    }
  });
  // force a vault (outermost, far end) and control rooms
  const far = rooms.filter(m => m.x0 > W * 0.55 && (m.band === 0 || m.band === nC)); const vr = (far.length ? r.pick(far) : r.pick(rooms)); vr.type = VAULT[c.family];
  const vaults = [vr]; if (nC >= 3) { const v2 = r.pick(rooms.filter(m => m !== vr && m.x1 - m.x0 >= 8)); v2.type = VAULT[c.family]; vaults.push(v2); }
  if (!rooms.some(m => m.type === 'control')) { const m = r.pick(rooms.filter(q => !isVault(q.type))); m.type = 'control'; }
  for (const m of rooms) { m.shield = isVault(m.type) || m.type === 'control'; }
  // doors: each room opens onto an adjacent corridor (big rooms: both sides)
  const gaps = cors.map(() => ({ s: [], n: [] }));   // wall lines of each corridor (south wall, north wall)
  for (const m of rooms) {
    const sides = []; if (m.band > 0) sides.push('s'); if (m.band < nC) sides.push('n');
    let use = sides.length === 2 ? (m.x1 - m.x0 > 13 || r.chance(0.35) ? ['s', 'n'] : [r.pick(sides)]) : sides;
    if (isVault(m.type)) use = [use[0]];
    for (const s of use) {
      const u = (m.x0 + m.x1) / 2 + r.range(-1.2, 1.2);
      if (s === 's') { m.doors.push({ side: 's', u, z: m.z0 }); gaps[m.band - 1].n.push([u, 1.9]); }   // room's south wall = corridor (band-1) north wall
      else { m.doors.push({ side: 'n', u, z: m.z1 }); gaps[m.band].s.push([u, 1.9]); }                 // room's north wall = corridor (band) south wall
    }
  }
  // ports: 0 is the player's, on the west gallery at the centre corridor
  const nPorts = r.int(c.ports[0], c.ports[1]); const near = r.chance(0.4);
  const mid = cors[Math.floor((nC - 1) / 2)] || cors[0];
  const ports = [{ id: 0, mine: true, x: 0, z: mid.zc, dir: 'w' }];
  for (let i = 1; i < nPorts; i++) {
    if (near) ports.push({ id: i, mine: false, x: 0, z: (cors[i % cors.length].zc + (i > cors.length ? 2.2 : 0)), dir: 'w', adjacent: true });
    else if (i === 1) ports.push({ id: i, mine: false, x: W, z: mid.zc, dir: 'e' });
    else { const k = cors[(i * 2) % cors.length]; ports.push({ id: i, mine: false, x: i % 2 ? W : 0, z: k.zc + (i % 2 ? 0 : 0.0), dir: i % 2 ? 'e' : 'w' }); }
  }
  // dedupe ports that landed on the same spot
  for (let i = 1; i < ports.length; i++) for (let j = 0; j < i; j++) if (ports[i].dir === ports[j].dir && Math.abs(ports[i].z - ports[j].z) < 2.4) ports[i].z += (ports[i].z < 0 ? 2.8 : -2.8);
  // loot + enemy budgets per room
  const roomDanger = c.danger;
  for (const m of rooms) {
    const area = (m.x1 - m.x0) * (m.z1 - m.z0), base = Math.max(1, Math.round(area / 55));
    const lootBias = isVault(m.type) ? 2.4 : m.type === 'storage' || m.type === 'armoryhall' || m.type === 'serverhall' ? 1.3 : m.type === 'crew' || m.type === 'barracks' ? 0.9 : 1;
    m.loot = Math.max(1, Math.round(base * lootBias * (0.7 + c.loot * 0.2)));
    const en = isVault(m.type) ? 1.4 : m.type === 'guardroom' || m.type === 'barracks' ? 1.0 : 0.45;
    m.enemies = r() < en * roomDanger * 0.5 ? Math.max(1, Math.round(en * roomDanger * 0.8 + r())) : 0;
  }
  // keep the entry gallery and the first rooms calm
  for (const m of rooms) if (m.x0 < E + 14) m.enemies = 0;
  return { contract, seed: contract.seed, classId: contract.classId, corpId: contract.corpId, cls: c, corp, W, Z, E, CW, H, bands, cors, rooms, gaps, ports, vaults, zlo: -dz, zhi: dz, time: Math.round(c.time * 60 * (1 - Math.min(0.3, contract.depth * 0.02))), nPorts: ports.length };
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
