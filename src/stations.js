// Open-world orbital stations: which systems have them, where they hang, and the Extraction-style layout contract each one uses.
// Pure data (no three.js) so missions + tests can use it headless. Meshes live in station-space.js, interiors in station-interior.js.
import { rng, hashStr } from './util.js';
import { systemAt, makeName } from './gen.js';
import { pickContract, CLASSES } from './ships.js';

const CIV = ['Port', 'Station', 'Exchange', 'Waystation', 'Hab', 'Dock', 'Spindle'];
const DER = ['Wreck', 'Hulk', 'Derelict'];
const DER_CLASS = ['chem_s', 'factory_chip', 'server_m'];

/** 0-2 stations per system near settled worlds; the start system always has a civil port at the home planet and a derelict. */
export function stationsFor(sys) {
  if (sys._stations) return sys._stations;
  const r = rng(hashStr('stations:' + sys.seed));
  const settled = sys.planets.filter(p => p.settled);
  const out = [];
  const add = (kind, planet) => {
    const k = out.length, seed = hashStr(`st:${sys.seed}:${k}`);
    const name = kind === 'civil' ? `${makeName(r, 2)} ${r.pick(CIV)}` : `${makeName(r, 2)} ${r.pick(DER)}`;
    const classId = kind === 'civil' ? 'station_civ' : DER_CLASS[r.int(0, DER_CLASS.length - 1)];
    out.push({ id: `${sys.index}:${k}`, sys: sys.index, k, kind, name, planet: planet.i, planetName: planet.name, seed, classId,
      ang: r.range(0.5, 2.6) * (r.chance(0.5) ? 1 : -1), elev: r.range(-0.25, 0.25), spin: r.range(0.04, 0.09) * (r.chance(0.5) ? 1 : -1) });
  };
  if (sys.index === 0) {
    add('civil', sys.planets[0]);
    const others = sys.planets.filter(p => p.i !== 0); add('derelict', others.length ? r.pick(others) : sys.planets[0]);
  } else {
    const n = settled.length ? r.int(0, 2) : (r.chance(0.35) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      if (i === 0 && settled.length) add('civil', r.pick(settled));
      else add('derelict', r.pick(sys.planets));
    }
  }
  sys._stations = out; return out;
}
export function stationById(worldSeed, id) {
  const [s, k] = String(id).split(':').map(Number); if (!(s >= 0)) return null;
  return stationsFor(systemAt(worldSeed, s))[k] || null;
}
/** the layout contract handed to ships.js generateShip */
export function stationContract(st) {
  if (st.kind === 'civil') return { seed: st.seed, depth: 0, classId: 'station_civ', corpId: 'rimway', code: 'RP-' + (st.seed % 9000 + 1000), name: st.name, reason: 'open for business', risk: 0, payout: 0, open: true };
  const c = pickContract(st.seed, 1, { classId: st.classId }); return { ...c, name: st.name, reason: c.reason, depth: 1 };
}
export const isCivil = st => st && st.kind === 'civil';
export const STATION_CLASSES = () => Object.keys(CLASSES).filter(k => k === 'station_civ' || DER_CLASS.includes(k));
