// Procedural systems, planets and people
import { rng, hashStr } from './util.js';
import { PLANET_KINDS, SHAPES, SYL, FIRST, LAST, JOBS } from './data.js';
import { makeLook, outfitFor } from './people.js';

export function makeName(r, parts = 3) {
  let s = ''; const n = r.int(2, parts); for (let i = 0; i < n; i++) s += r.pick(SYL);
  return s[0].toUpperCase() + s.slice(1);
}
const STAR_TYPES = [
  { n: 'Yellow dwarf', c: 0xfff1c0, s: 900 }, { n: 'Red dwarf', c: 0xff7a4a, s: 600 }, { n: 'Blue giant', c: 0x9cc4ff, s: 1800 },
  { n: 'Orange star', c: 0xffb35a, s: 800 }, { n: 'White star', c: 0xf4f8ff, s: 1100 },
];

const cache = {};
export function systemAt(seed, index) {
  const key = seed + ':' + index; if (cache[key]) return cache[key];
  const r = rng(hashStr(key));
  const star = r.pick(STAR_TYPES);
  const sys = { index, seed: hashStr(key), name: makeName(r) + (r.chance(0.5) ? '' : ' ' + r.pick(['Reach', 'Drift', 'Verge', 'Hollow', 'Rise'])), star, planets: [], lanes: [], uncharted: index !== 0 };
  const count = index === 0 ? 6 : r.int(4, 9);
  let dist = r.range(18000, 26000);
  for (let i = 0; i < count; i++) {
    const kindKey = index === 0 && i === 0 ? 'temperate' : r.pick(Object.keys(PLANET_KINDS));
    const kind = PLANET_KINDS[kindKey];
    const shape = index === 0 && i === 0 ? 'round' : r.pick(SHAPES);
    const radius = Math.exp(r.range(Math.log(250), Math.log(7000)));   // tiny rocks to gas-giant sized
    const ang = r.range(0, Math.PI * 2);
    const tilt = r.range(-0.08, 0.08);
    const pos = [Math.cos(ang) * dist, tilt * dist, Math.sin(ang) * dist];
    const settled = (index === 0 && i === 0) || (kind.air > 0.3 && r.chance(index === 0 ? 0.5 : 0.28)) || r.chance(0.12);
    const res = [...kind.res].sort(() => r() - 0.5);
    const planet = {
      i, name: makeName(r), kind: kindKey, shape, radius, pos, seed: hashStr(key + ':p' + i), settled,
      rich: res.slice(0, 2), common: kind.res, g: kind.g * (0.6 + Math.min(0.8, radius / 8000)), air: kind.air, temp: kind.temp,
      moons: shape === 'moonpair' ? 2 : r.chance(0.35) ? r.int(1, 2) : 0, ringTilt: r.range(-0.5, 0.5), spin: r.range(-0.02, 0.02),
      pop: settled ? r.int(30, 900) : 0, ring: shape === 'ringed',
    };
    if (planet.kind === 'barren') planet.air = 0;
    sys.planets.push(planet);
    dist += r.range(14000, 30000) + radius * 3;
  }
  // spaceways: lanes link the planets in orbit order, with the settled worlds as hubs
  for (let i = 0; i < sys.planets.length - 1; i++) sys.lanes.push({ a: i, b: i + 1, limit: 2000 });
  if (sys.planets.length > 3) sys.lanes.push({ a: 0, b: 3, limit: 2400 });
  cache[key] = sys; return sys;
}

export function makePerson(seed, planet, sys) {
  const r = rng(seed);
  const jobKey = r.pick(Object.keys(JOBS)); const job = JOBS[jobKey];
  const smarts = r.range(job.smarts[0], job.smarts[1]);
  const originSys = r.chance(0.6) ? sys : systemAt(1971, r.int(1, 12));
  const origin = originSys.planets[r.int(0, originSys.planets.length - 1)];
  const interest = {};
  for (const c of job.buys) interest[c] = r.range(1.1, 1.6);
  const trait = r.pick(['dry', 'warm', 'nervous', 'proud', 'sly', 'tired']);
  return {
    seed, name: r.pick(FIRST) + ' ' + r.pick(LAST), job: jobKey, jobLabel: job.label, smarts, interest, trait,
    outfit: outfitFor(jobKey, seed), originName: origin.name, originSys: originSys.name, mood: r.range(0.3, 0.8), met: false, id: 'n' + seed,
    look: makeLook(seed),
  };
}
