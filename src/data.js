// Rimrunner static data: items, recipes, tech tree, world tables
export const GUN = {
  pistol:   { cls: 'pistol', dmg: 22, rate: 0.28, mag: 12, spread: 0.012, pellets: 1, range: 90 },
  coach:    { cls: 'smallshotgun', dmg: 11, rate: 0.7, mag: 2, spread: 0.07, pellets: 7, range: 35 },
  rifle:    { cls: 'long', dmg: 38, rate: 0.5, mag: 8, spread: 0.004, pellets: 1, range: 220 },
  breacher: { cls: 'long', dmg: 12, rate: 0.9, mag: 6, spread: 0.06, pellets: 10, range: 45 },
  arc:      { cls: 'long', dmg: 16, rate: 0.09, mag: 30, spread: 0.02, pellets: 1, range: 120 },
  // ported from Space Ranger's ArmsDB (damage/interval/mag/range kept, spread degrees * 0.0055)
  hpistol:  { cls: 'pistol', dmg: 36, rate: 0.32, mag: 7, spread: 0.014, pellets: 1, range: 140 },
  shotgun:  { cls: 'long', dmg: 8, rate: 0.85, mag: 6, spread: 0.034, pellets: 9, range: 90 },
  pulsepistol: { cls: 'pistol', dmg: 17, rate: 0.2, mag: 20, spread: 0.016, pellets: 1, range: 110 },
  pulsecarbine: { cls: 'long', dmg: 14, rate: 0.1, mag: 40, spread: 0.016, pellets: 1, range: 130 },
  scatter:  { cls: 'long', dmg: 9, rate: 0.7, mag: 8, spread: 0.04, pellets: 6, range: 70 },
  railrifle: { cls: 'long', dmg: 85, rate: 0.9, mag: 5, spread: 0.003, pellets: 1, range: 400 },
};

// kind: res (stacks in flap slots), small (front pocket, unlimited), gun (side mounts / holster slot), food
export const ITEMS = {
  iron_ore:   { name: 'Iron Ore', kind: 'res', stack: 40, value: 6, color: '#8a6a58', cat: 'ore' },
  copper_ore: { name: 'Copper Ore', kind: 'res', stack: 40, value: 9, color: '#c27a4a', cat: 'ore' },
  silica:     { name: 'Silica Sand', kind: 'res', stack: 40, value: 5, color: '#d9cfa2', cat: 'ore' },
  carbon:     { name: 'Carbon Chunk', kind: 'res', stack: 40, value: 7, color: '#35353d', cat: 'ore' },
  ice:        { name: 'Ice Block', kind: 'res', stack: 40, value: 5, color: '#a8dcff', cat: 'ore' },
  titanium_ore:{ name: 'Titanium Ore', kind: 'res', stack: 30, value: 22, color: '#9aa3b5', cat: 'ore' },
  cobalt:     { name: 'Cobalt Nodule', kind: 'res', stack: 30, value: 28, color: '#3b6fd6', cat: 'ore' },
  platinum:   { name: 'Platinum Vein', kind: 'res', stack: 20, value: 70, color: '#e8ecf2', cat: 'ore' },
  hymnstone:  { name: 'Hymnstone', kind: 'res', stack: 10, value: 220, color: '#b66bff', cat: 'exotic' },
  iron_plate: { name: 'Iron Plate', kind: 'res', stack: 40, value: 16, color: '#b3b6bd', cat: 'parts' },
  steel:      { name: 'Steel Bar', kind: 'res', stack: 30, value: 34, color: '#c9d0d8', cat: 'parts' },
  alloy:      { name: 'Ti-Alloy Plate', kind: 'res', stack: 20, value: 80, color: '#8fb1c9', cat: 'parts' },
  wire:       { name: 'Copper Wire', kind: 'small', value: 14, color: '#d98b52', cat: 'parts' },
  lens:       { name: 'Ground Lens', kind: 'small', value: 20, color: '#cfe9ff', cat: 'parts' },
  circuit:    { name: 'Circuit Board', kind: 'small', value: 44, color: '#3fbf7f', cat: 'parts' },
  cell:       { name: 'Power Cell', kind: 'small', value: 60, color: '#ffd23f', cat: 'parts' },
  gunpart:    { name: 'Gun Parts Kit', kind: 'small', value: 40, color: '#7d8590', cat: 'parts' },
  ammo:       { name: 'Ammo Box', kind: 'small', value: 12, color: '#c9a227', cat: 'ammo' },
  ruby:       { name: 'Raw Ruby', kind: 'small', value: 90, color: '#e0314b', cat: 'gem' },
  data_chip:  { name: 'Data Chip', kind: 'small', value: 30, color: '#4fd1ff', cat: 'data' },
  parcel:     { name: 'Sealed Parcel', kind: 'small', value: 0, color: '#c8a46b', cat: 'quest' },
  ration:     { name: 'Ration Bar', kind: 'food', stack: 20, value: 8, color: '#b98c52', cat: 'food', use: { hunger: 35 } },
  water:      { name: 'Water Flask', kind: 'food', stack: 20, value: 6, color: '#58b4ff', cat: 'food', use: { thirst: 40 } },
  medkit:     { name: 'Medkit', kind: 'food', stack: 10, value: 40, color: '#ff5a5a', cat: 'med', use: { health: 50 } },
  o2_tank:    { name: 'O2 Canister', kind: 'food', stack: 10, value: 30, color: '#9fe8ff', cat: 'med', use: { oxygen: 60 } },
  pack_frame: { name: 'Pack Frame Upgrade', kind: 'small', value: 150, color: '#b8793a', cat: 'tool' },
  coil:       { name: 'Spaceway Coil', kind: 'small', value: 400, color: '#37e6c9', cat: 'tool' },
  tank_ext:   { name: 'Fuel Tank Ext.', kind: 'small', value: 300, color: '#e85a2b', cat: 'tool' },
  fuel:       { name: 'Fuel Rod', kind: 'small', value: 25, color: '#7bff6a', cat: 'fuel' },
  pistol:  { name: 'Rim Pistol', kind: 'gun', gun: 'pistol', value: 120, color: '#8c939c', cat: 'gun' },
  coach:   { name: 'Coach Gun', kind: 'gun', gun: 'coach', value: 220, color: '#7a5a3a', cat: 'gun' },
  rifle:   { name: 'Prospector Rifle', kind: 'gun', gun: 'rifle', value: 420, color: '#6d7a68', cat: 'gun' },
  breacher:{ name: 'Breacher Shotgun', kind: 'gun', gun: 'breacher', value: 560, color: '#855a4a', cat: 'gun' },
  arc:     { name: 'Arc Carbine', kind: 'gun', gun: 'arc', value: 1400, color: '#48d6ff', cat: 'gun' },
  hpistol: { name: 'Heavy Pistol', kind: 'gun', gun: 'hpistol', value: 300, color: '#7d848c', cat: 'gun' },
  shotgun: { name: 'Pump Shotgun', kind: 'gun', gun: 'shotgun', value: 380, color: '#6e5a40', cat: 'gun' },
  pulsepistol: { name: 'Pulse Pistol', kind: 'gun', gun: 'pulsepistol', value: 700, color: '#5fd0ff', cat: 'gun' },
  pulsecarbine: { name: 'Pulse Carbine', kind: 'gun', gun: 'pulsecarbine', value: 1200, color: '#5fd0ff', cat: 'gun' },
  scatter: { name: 'Scatter Pulse', kind: 'gun', gun: 'scatter', value: 1500, color: '#7ae0ff', cat: 'gun' },
  railrifle: { name: 'Rail Rifle', kind: 'gun', gun: 'railrifle', value: 2600, color: '#b8c4d0', cat: 'gun' },
  // extraction-mode loot (value only matters when sold on extraction)
  drive:   { name: 'Storage Drive', kind: 'small', value: 55, color: '#7fa3c8', cat: 'loot' },
  core:    { name: 'Server Core', kind: 'small', value: 320, color: '#38e0d0', cat: 'loot' },
  wafer:   { name: 'Chip Wafer', kind: 'small', value: 95, color: '#b0a8ff', cat: 'loot' },
  reagent: { name: 'Reagent Vial', kind: 'small', value: 48, color: '#b6ff3a', cat: 'loot' },
  servo:   { name: 'Servo Actuator', kind: 'small', value: 70, color: '#c0c6d0', cat: 'loot' },
  ai_core: { name: 'Robot Core', kind: 'small', value: 420, color: '#ff6a3a', cat: 'loot' },
  barrel:  { name: 'Barrel Blank', kind: 'small', value: 85, color: '#8a9098', cat: 'loot' },
  schematic: { name: 'Corp Schematic', kind: 'small', value: 260, color: '#e8d27a', cat: 'loot' },
  keycard: { name: 'Keycard', kind: 'small', value: 120, color: '#ff4a6a', cat: 'loot' },
  armor_plate: { name: 'Armor Plate', kind: 'small', value: 140, color: '#6a7480', cat: 'loot' },
  stimpack: { name: 'Stim Pack', kind: 'food', stack: 10, value: 70, color: '#ffa04a', cat: 'med', use: { health: 30, thirst: 15 } },
  antenna: { name: 'Relay Antenna', kind: 'small', value: 40, color: '#ffe36a', cat: 'tool' },
};

// Tech tree: the survival-craft upgrade path (Scrap Age -> Exotic).
export const TECH = {
  fieldcraft:  { name: 'Fieldcraft', tier: 0, cost: 0, items: {}, req: [], desc: 'Rations, water, medkits, ammo, a scrap pistol.' },
  smelting:    { name: 'Smelting', tier: 1, cost: 120, items: { iron_ore: 10 }, req: ['fieldcraft'], desc: 'Iron plate, copper wire, lenses, Pack Frames. Bench Mk1.' },
  machining:   { name: 'Machining', tier: 2, cost: 400, items: { iron_plate: 8 }, req: ['smelting'], desc: 'Steel, gun parts, Coach Gun, Prospector Rifle, fuel rods. Bench Mk2.' },
  electronics: { name: 'Electronics', tier: 2, cost: 450, items: { wire: 6, silica: 10 }, req: ['smelting'], desc: 'Circuits, power cells, O2 canisters, data chips.' },
  alloys:      { name: 'Alloys', tier: 3, cost: 1200, items: { steel: 6, titanium_ore: 8 }, req: ['machining'], desc: 'Ti-Alloy, Breacher, Fuel Tank Ext. Bench Mk3.' },
  spaceways:   { name: 'Spaceway Coils', tier: 3, cost: 1500, items: { circuit: 4, cell: 2 }, req: ['electronics'], desc: 'Coils raise your lane speed leeway and cut lane fuel burn.' },
  plasma:      { name: 'Plasma Arms', tier: 4, cost: 4000, items: { alloy: 6, cobalt: 10, circuit: 6 }, req: ['alloys', 'electronics'], desc: 'Arc Carbine. Bench Mk4.' },
  exotic:      { name: 'Hymn Engineering', tier: 5, cost: 12000, items: { hymnstone: 3, platinum: 10 }, req: ['plasma', 'spaceways'], desc: 'Hymnstone fittings, deep jumps. Bench Mk5.' },
};

export const RECIPES = [
  { out: 'ration', n: 2, in: { carbon: 1, ice: 1 }, tech: 'fieldcraft' },
  { out: 'water', n: 2, in: { ice: 2 }, tech: 'fieldcraft' },
  { out: 'medkit', n: 1, in: { carbon: 2, silica: 1 }, tech: 'fieldcraft' },
  { out: 'ammo', n: 2, in: { iron_ore: 1, carbon: 1 }, tech: 'fieldcraft' },
  { out: 'pistol', n: 1, in: { iron_ore: 6, carbon: 2 }, tech: 'fieldcraft', skill: 'gunsmith' },
  { out: 'iron_plate', n: 1, in: { iron_ore: 2 }, tech: 'smelting' },
  { out: 'wire', n: 2, in: { copper_ore: 1 }, tech: 'smelting' },
  { out: 'lens', n: 1, in: { silica: 3 }, tech: 'smelting' },
  { out: 'pack_frame', n: 1, in: { iron_plate: 6, wire: 4 }, tech: 'smelting' },
  { out: 'steel', n: 1, in: { iron_plate: 2, carbon: 1 }, tech: 'machining' },
  { out: 'gunpart', n: 1, in: { steel: 1, iron_plate: 2 }, tech: 'machining' },
  { out: 'fuel', n: 1, in: { carbon: 3, ice: 1 }, tech: 'machining' },
  { out: 'coach', n: 1, in: { gunpart: 2, steel: 2 }, tech: 'machining', skill: 'gunsmith' },
  { out: 'rifle', n: 1, in: { gunpart: 3, steel: 3, lens: 1 }, tech: 'machining', skill: 'gunsmith' },
  { out: 'circuit', n: 1, in: { wire: 3, silica: 2 }, tech: 'electronics' },
  { out: 'cell', n: 1, in: { wire: 2, cobalt: 1, carbon: 1 }, tech: 'electronics' },
  { out: 'o2_tank', n: 1, in: { ice: 3, iron_plate: 1 }, tech: 'electronics' },
  { out: 'data_chip', n: 1, in: { circuit: 1, silica: 1 }, tech: 'electronics' },
  { out: 'alloy', n: 1, in: { steel: 2, titanium_ore: 2 }, tech: 'alloys' },
  { out: 'breacher', n: 1, in: { gunpart: 4, alloy: 2, steel: 2 }, tech: 'alloys', skill: 'gunsmith' },
  { out: 'tank_ext', n: 1, in: { alloy: 3, steel: 4 }, tech: 'alloys' },
  { out: 'coil', n: 1, in: { circuit: 4, cell: 2, wire: 6 }, tech: 'spaceways' },
  { out: 'arc', n: 1, in: { gunpart: 6, alloy: 4, cell: 4, circuit: 4 }, tech: 'plasma', skill: 'gunsmith' },
];

export const PACK_SLOTS = [4, 6, 8, 10];
export const PACK_NAMES = ['Scrap Satchel', 'Ranger Pack', 'Haul Pack', 'Expedition Frame'];

export const PLANET_KINDS = {
  temperate: { air: 1, temp: 0.5, g: 1.0, pal: [[0.18, 0.4, 0.2], [0.35, 0.5, 0.25], [0.55, 0.5, 0.4], [0.9, 0.9, 0.95]], sky: 0x6fa8e8, res: ['iron_ore', 'silica', 'copper_ore', 'carbon', 'ice'] },
  desert:    { air: 0.7, temp: 0.9, g: 0.9, pal: [[0.76, 0.6, 0.35], [0.82, 0.68, 0.42], [0.6, 0.42, 0.28], [0.9, 0.8, 0.6]], sky: 0xe3b27a, res: ['iron_ore', 'silica', 'copper_ore', 'titanium_ore'] },
  frozen:    { air: 0.6, temp: 0.05, g: 0.8, pal: [[0.8, 0.9, 0.98], [0.65, 0.78, 0.9], [0.5, 0.6, 0.7], [1, 1, 1]], sky: 0x9fc4e8, res: ['ice', 'silica', 'cobalt', 'carbon'] },
  volcanic:  { air: 0.5, temp: 1.0, g: 1.15, pal: [[0.12, 0.1, 0.1], [0.3, 0.12, 0.08], [0.7, 0.22, 0.05], [0.2, 0.2, 0.22]], sky: 0x8a3a22, res: ['iron_ore', 'carbon', 'titanium_ore', 'platinum'] },
  barren:    { air: 0, temp: 0.4, g: 0.45, pal: [[0.42, 0.4, 0.4], [0.55, 0.52, 0.5], [0.3, 0.3, 0.32], [0.7, 0.68, 0.66]], sky: 0x000000, res: ['iron_ore', 'silica', 'titanium_ore', 'cobalt', 'ice'] },
  toxic:     { air: 0.2, temp: 0.6, g: 1.05, pal: [[0.42, 0.55, 0.15], [0.6, 0.65, 0.2], [0.35, 0.3, 0.4], [0.8, 0.85, 0.5]], sky: 0xb8c24a, res: ['carbon', 'copper_ore', 'cobalt', 'ruby'] },
  crystal:   { air: 0.1, temp: 0.3, g: 0.6, pal: [[0.4, 0.2, 0.6], [0.6, 0.35, 0.85], [0.3, 0.7, 0.85], [0.95, 0.85, 1]], sky: 0x2a1448, res: ['hymnstone', 'ruby', 'platinum', 'silica'] },
  ocean:     { air: 1, temp: 0.55, g: 1.0, pal: [[0.1, 0.25, 0.5], [0.85, 0.8, 0.6], [0.25, 0.5, 0.3], [0.9, 0.95, 1]], sky: 0x5ab0e0, res: ['silica', 'ice', 'carbon', 'copper_ore'] },
};

export const SHAPES = ['round', 'oblate', 'lumpy', 'ringed', 'ringworld', 'crystal', 'donut', 'moonpair', 'shard'];

export const SYL = ['ka', 've', 'ro', 'mi', 'tal', 'sen', 'dor', 'ix', 'ul', 'an', 'zo', 'be', 'ra', 'ni', 'ot', 'hel', 'quo', 'vash', 'mor', 'ter', 'lu', 'gan'];
export const FIRST = ['Ada', 'Brek', 'Cole', 'Dax', 'Edda', 'Finn', 'Gala', 'Hob', 'Ines', 'Jax', 'Kell', 'Lio', 'Mara', 'Nox', 'Orla', 'Pike', 'Quin', 'Rho', 'Sable', 'Teo', 'Uma', 'Vik', 'Wren', 'Yara', 'Zed'];
export const LAST = ['Okafor', 'Brandt', 'Vance', 'Mireles', 'Tanaka', 'Holloway', 'Reyes', 'Kowalski', 'Duarte', 'Nilsson', 'Ashby', 'Quill', 'Marrow', 'Teague', 'Voss', 'Pryce'];
export const JOBS = {
  trader:   { label: 'Trader', buys: ['ore', 'parts', 'food'], smarts: [0.6, 0.95] },
  miner:    { label: 'Miner', buys: ['food', 'ammo', 'med'], smarts: [0.3, 0.6] },
  mechanic: { label: 'Mechanic', buys: ['parts', 'tool', 'fuel'], smarts: [0.5, 0.85] },
  gunnut:   { label: 'Gun Hobbyist', buys: ['gun', 'ammo'], smarts: [0.3, 0.7] },
  scholar:  { label: 'Scholar', buys: ['data', 'exotic', 'gem'], smarts: [0.7, 1.0] },
  jeweler:  { label: 'Jeweler', buys: ['gem', 'exotic', 'ore'], smarts: [0.5, 0.9] },
  cook:     { label: 'Cook', buys: ['food', 'ore'], smarts: [0.2, 0.55] },
  drifter:  { label: 'Drifter', buys: ['food', 'ammo', 'gun'], smarts: [0.1, 0.5] },
};

// Hover descriptions shown under an item's name when you look at it in your bag or a loot tray.
export const DESC = {
  iron_ore: 'Rusty, heavy rock. Smelts into plate.', copper_ore: 'Green-streaked ore. Draws out into wire.', silica: 'Fine sand that melts into lenses and glass.', carbon: 'Black, brittle chunks. Fuel and steel-making.', ice: 'Clear frozen water, still cold in the pack.',
  titanium_ore: 'Light, strong ore. Worth hauling.', cobalt: 'Blue-grey nodules. Alloys and plasma parts.', platinum: 'Dense white metal. Fetches a fine price.', hymnstone: 'A humming violet crystal. Nobody agrees what it is.',
  iron_plate: 'Flat stamped plate, ready for the bench.', steel: 'Hard bar stock from a smelter.', alloy: 'Titanium-alloy plate. Light and tough.', wire: 'A coil of bare copper wire.', lens: 'Ground glass, clear as water.', circuit: 'A green board with soldered chips. Every machine wants one.',
  cell: 'A sealed power cell, still holding charge.', gunpart: 'Springs, pins and a bolt carrier. Gunsmith bait.', ammo: 'A box of mixed rounds. Fits most of your guns.', ruby: 'An uncut red stone with a nasty glint.', data_chip: 'A coded chip. Somebody paid to keep this private.', parcel: 'A sealed parcel, not yours to open.',
  ration: 'A dense bar. Tastes like regret, fills you up.', water: 'A flask of clean water.', medkit: 'Bandages, sealant and a stim. Patches you up.', o2_tank: 'A canister of breathable air.', pack_frame: 'A stiffer frame. Fits more flaps on your pack.', coil: 'A spaceway coil for your ship.', tank_ext: 'An extra fuel tank for your ship.', fuel: 'A glowing fuel rod.',
  pistol: 'Reliable rim sidearm. Light rounds, light kick.', coach: 'Short double barrel. Devastating up close.', rifle: 'Long reach, steady aim.', breacher: 'Wide-bore shotgun that clears doorways.', arc: 'Rapid-fire arc carbine. Hums when it charges.',
  hpistol: 'A hand cannon from Space Ranger stock. Slow, loud, hits hard.', shotgun: 'Pump shotgun. Nine pellets a pull.', pulsepistol: 'Fires bolts of light. About forty to a cell.', pulsecarbine: 'Fast pulse bolts, hold to fire. Runs hot.', scatter: 'The energy shotgun: six bolts at once.', railrifle: 'A magnet coil throws a slug through almost anything.',
  drive: 'A corporate storage drive. Encrypted, valuable to the right buyer.', core: 'The heart of a server rack. Heavy and warm.', wafer: 'A silicon wafer, thin as a coin and worth plenty.', reagent: 'A sealed vial of lab reagent. Do not shake.', servo: 'A precise little robot joint motor.', ai_core: 'A robot brain. Still blinking.', barrel: 'A rough barrel blank for a gunsmith.',
  schematic: 'A corporate design file on a hard card. Rival firms would kill for it.', keycard: 'Opens a vault door without tripping the alarm.', armor_plate: 'A hardened plate. Sells well; armor comes from the dealer.', stimpack: 'A quick shot of combat stim. Heals and steadies you.', antenna: 'A relay antenna. Drop one to extend your ship AI link on a behemoth.',
};
export const describe = id => { const it = ITEMS[id]; return DESC[id] || (it.cat === 'ore' ? 'Raw rock from the ground.' : it.cat === 'gun' ? 'A firearm.' : it.cat === 'loot' ? 'Salvage worth selling.' : 'Something useful.'); };
