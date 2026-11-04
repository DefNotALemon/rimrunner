// Missions (Starfield-style): a titled job from a named giver, a brief in their voice, a reward and an ordered objective checklist.
// Pure data + rules (no three.js, no DOM): mission-world.js wires events from the game, missions-ui.js draws it.
//
// Objective kinds:  travel {sys} · land {loc=planet} · enter {loc=station} · reach {loc, spot} · talk {loc, who}
//                   take {loc, item} · deliver {loc, item, who | spot} · return {loc, who=giver}
// loc keys:  'p<sys>:<planet i>' for a planet surface, 's<sys>:<k>' for a station interior.
import { rng, hashStr } from './util.js';
import { G, toast } from './state.js';
import { systemAt } from './gen.js';
import { FIRST, LAST } from './data.js';
import { stationsFor } from './stations.js';

export const pLoc = (sys, i) => `p${sys}:${i}`;
export const sLoc = st => `s${st.sys}:${st.k}`;
export function parseLoc(loc) { const m = /^([ps])(\d+):(\d+)$/.exec(loc || ''); return m ? { t: m[1], sys: +m[2], i: +m[3] } : null; }
export function locName(loc, worldSeed = G.seed) {
  const L = parseLoc(loc); if (!L) return '?'; const sys = systemAt(worldSeed, L.sys);
  return L.t === 'p' ? (sys.planets[L.i] || {}).name : (stationsFor(sys)[L.i] || {}).name;
}

export function ensure() {
  if (!G.missions || !Array.isArray(G.missions.active)) G.missions = { active: [], done: [], tracked: null, taken: {} };
  return G.missions;
}

// ---------- generation ----------
const person = (r) => `${r.pick(FIRST)} ${r.pick(LAST)}`;
function near(worldSeed, sysIndex, pred) {   // the closest system (this one first) with a station matching pred
  for (let d = 0; d <= 4; d++) for (const s of d ? [sysIndex + d, sysIndex - d] : [sysIndex]) {
    if (s < 0) continue; const sys = systemAt(worldSeed, s); const c = stationsFor(sys).filter(pred); if (c.length) return { sys, list: c };
  } return null;
}
function landTarget(r, sys, avoid, wantSettled) {
  let c = sys.planets.filter(p => p.i !== avoid && (wantSettled == null || !!p.settled === wantSettled));
  if (!c.length) c = sys.planets.filter(p => p.i !== avoid); if (!c.length) c = sys.planets;
  return r.pick(c);
}
const wild = r => ({ ref: 'wild', ang: r.range(0, Math.PI * 2), dist: Math.round(r.range(110, 190)), r: 9 });
const travel = (sys, cur) => sys.index !== cur ? [{ kind: 'travel', sys: sys.index, text: `Travel to the ${sys.name} system` }] : [];

export const TEMPLATES = {
  survey(r, A, g, w) {
    const sys = systemAt(w, A.sys), P = landTarget(r, sys, A.planet, false), site = wild(r), extra = wild(r);
    return { title: 'Ground Truth', giverRole: 'Surveyor', reward: r.int(26, 40) * 10,
      brief: `"${P.name} reads clean on every scan and I don't believe a word of it. Put a survey beacon down at the site I've marked, then come back and tell me what you saw. Don't touch anything glowing."`,
      obj: [{ kind: 'land', loc: pLoc(sys.index, P.i), text: `Land on ${P.name}` },
        { kind: 'reach', loc: pLoc(sys.index, P.i), spot: site, text: 'Plant the survey beacon at the marked site' },
        { kind: 'reach', loc: pLoc(sys.index, P.i), spot: extra, optional: true, bonus: 80, text: 'Optional: log the second anomaly' },
        { kind: 'enter', loc: sLoc(A), text: `Dock at ${A.name}` },
        { kind: 'return', loc: sLoc(A), who: g, text: `Report back to ${g}` }] };
  },
  pickup(r, A, g, w, cur) {
    const fb = near(w, A.sys, s => s.kind === 'civil' && s.id !== A.id) || { sys: systemAt(w, A.sys), list: [A] };
    const B = r.pick(fb.list), sys = fb.sys, P = landTarget(r, sys, B.planet, true), qm = person(r), item = r.pick(['sealed coolant crate', 'med-supply crate', 'crate of seed stock', 'lockbox of payroll chits']);
    return { title: 'Station Pickup', giverRole: 'Freight broker', reward: r.int(24, 36) * 10 + (sys.index !== A.sys ? 150 : 0),
      brief: `"Easy money, runner. ${qm} at ${B.name} is holding a ${item} for me. Collect it, fly it down to ${P.name} and leave it at the drop point. Don't open it. I'll know."`,
      obj: [...travel(sys, A.sys), { kind: 'enter', loc: sLoc(B), text: `Dock at ${B.name}` },
        { kind: 'talk', loc: sLoc(B), who: qm, role: 'Quartermaster', line: `"You're the broker's runner? It's in the back room, in the case with the green light. Mind the lockers, they stick."`, text: `Talk to ${qm}` },
        { kind: 'take', loc: sLoc(B), item, text: `Collect the ${item} from the back room` },
        { kind: 'land', loc: pLoc(sys.index, P.i), text: `Land on ${P.name}` },
        { kind: 'deliver', loc: pLoc(sys.index, P.i), item, spot: P.settled ? { ref: 'exchange', r: 6 } : wild(r), text: `Leave the ${item} at the drop point` }] };
  },
  blackbox(r, A, g, w, cur) {
    const fd = near(w, A.sys, s => s.kind === 'derelict'); const D = fd ? r.pick(fd.list) : A, sys = fd ? fd.sys : systemAt(w, A.sys);
    const P = landTarget(r, systemAt(w, A.sys), -1, true);
    return { title: 'Black Box', giverRole: 'Insurance adjuster', reward: r.int(40, 60) * 10,
      brief: `"${D.name} went quiet nine days ago and the company wants its flight recorder before the scrappers find it. Something aboard is still running security, so go armed. Hand the recorder to the Patrol desk on ${P.name}, then come and get paid."`,
      obj: [...travel(sys, A.sys), { kind: 'enter', loc: sLoc(D), text: `Board ${D.name}` },
        { kind: 'take', loc: sLoc(D), item: 'flight recorder', text: 'Recover the flight recorder' },
        { kind: 'take', loc: sLoc(D), item: 'crew manifest', optional: true, bonus: 90, text: 'Optional: find the crew manifest' },
        ...travel(systemAt(w, A.sys), sys.index), { kind: 'land', loc: pLoc(A.sys, P.i), text: `Land on ${P.name}` },
        { kind: 'deliver', loc: pLoc(A.sys, P.i), item: 'flight recorder', spot: P.settled ? { ref: 'patrol', r: 6 } : wild(r), text: 'Hand the recorder to the Patrol' },
        { kind: 'enter', loc: sLoc(A), text: `Dock at ${A.name}` }, { kind: 'return', loc: sLoc(A), who: g, text: `Collect your fee from ${g}` }] };
  },
  missing(r, A, g, w) {
    const fb = near(w, A.sys, s => s.kind === 'civil' && s.id !== A.id) || { sys: systemAt(w, A.sys), list: [A] };
    const B = r.pick(fb.list), sys = fb.sys, P = landTarget(r, sys, -1, false), lost = person(r), bar = person(r);
    return { title: 'Missing Person', giverRole: 'Worried sibling', reward: r.int(30, 45) * 10,
      brief: `"My brother ${lost} took a hopper down to ${P.name} for salvage and never called back. Last anyone saw him he was drinking at ${B.name}. Please. Find him."`,
      obj: [...travel(sys, A.sys), { kind: 'enter', loc: sLoc(B), text: `Dock at ${B.name}` },
        { kind: 'talk', loc: sLoc(B), who: bar, role: 'Bartender', line: `"${lost.split(' ')[0]}? Paid his tab in hymnstone dust and asked about the old relay on ${P.name}. I put the spot in your nav."`, text: `Ask ${bar} the bartender about ${lost}` },
        { kind: 'land', loc: pLoc(sys.index, P.i), text: `Land on ${P.name}` },
        { kind: 'talk', loc: pLoc(sys.index, P.i), who: lost, role: 'Stranded salvager', spot: wild(r), line: `"Oh thank the Rim. Hopper's dead, radio's dead, I've been eating ration paste for a week. Tell my sister I'm coming home."`, text: `Find ${lost}` },
        { kind: 'enter', loc: sLoc(A), text: `Dock at ${A.name}` }, { kind: 'return', loc: sLoc(A), who: g, text: `Tell ${g} the news` }] };
  },
  passenger(r, A, g, w) {
    const sys = systemAt(w, A.sys), P = landTarget(r, sys, A.planet, null);
    const fb = near(w, A.sys, s => s.kind === 'civil' && s.id !== A.id) || { sys, list: [A] }; const B = r.pick(fb.list), sis = person(r);
    return { title: 'Passenger', giverRole: 'Passenger', reward: r.int(22, 34) * 10,
      brief: `"I need a ride down to ${P.name} and no questions. My sister ${sis} at ${B.name} settles my debts; she'll pay you when you tell her I got there."`,
      obj: [{ kind: 'land', loc: pLoc(sys.index, P.i), text: `Fly ${g} down to ${P.name}` },
        ...(P.settled ? [{ kind: 'reach', loc: pLoc(sys.index, P.i), spot: { ref: 'cantina', r: 7 }, optional: true, bonus: 60, text: `Optional: walk ${g.split(' ')[0]} to the cantina` }] : []),
        ...travel(fb.sys, A.sys), { kind: 'enter', loc: sLoc(B), text: `Dock at ${B.name}` },
        { kind: 'talk', loc: sLoc(B), who: sis, role: 'Fixer', line: `"Down safe? Good. Here, for your trouble. And you never met either of us."`, text: `Tell ${sis} the job's done` }] };
  },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** one mission posted at civil station A */
export function makeMission(tpl, seed, A, worldSeed = G.seed) {
  const r = rng(hashStr(`m:${tpl}:${seed}`)), g = person(r);
  const t = TEMPLATES[tpl](r, A, g, worldSeed, A.sys);
  return { id: `${tpl}#${A.id}#${seed}`, tpl, title: t.title, giver: g, giverRole: t.giverRole, giverLoc: sLoc(A), giverSeed: hashStr(g + seed), brief: t.brief, reward: t.reward,
    objectives: t.obj.map(o => ({ ...o, done: false })), carry: [], status: 'offered' };
}
/** what the board / crew at a civil station offer right now (rotates every in-game ~20 min) */
export function offersAt(A, worldSeed = G.seed, time = G.time) {
  const S = ensure(), day = Math.floor((time || 0) / 1200), out = [];
  for (let k = 0; k < 3; k++) {
    const seed = hashStr(`${A.id}:${day}:${k}`), tpl = TEMPLATE_IDS[(seed + k) % TEMPLATE_IDS.length];
    const m = makeMission(tpl, seed, A, worldSeed);
    if (S.taken[m.id]) continue; out.push(m);
  }
  return out;
}

// ---------- state ----------
export function current(m) { return m.objectives.find(o => !o.done && !o.optional) || null; }
export function tracked() { const S = ensure(); return S.active.find(m => m.id === S.tracked) || S.active[0] || null; }
export function accept(m) {
  const S = ensure(); if (S.taken[m.id]) return false;
  m.status = 'active'; S.active.push(m); S.taken[m.id] = 1; S.tracked = m.id;
  toast(`Mission accepted: ${m.title}`, 'good'); const c = current(m); if (c) toast(`New objective: ${c.text}`, '');
  return true;
}
export function drop(id) { const S = ensure(); const m = S.active.find(x => x.id === id); if (!m) return; S.active = S.active.filter(x => x !== m); if (S.tracked === id) S.tracked = S.active[0] ? S.active[0].id : null; toast(`Mission dropped: ${m.title}`, 'warn'); }
export function track(id) { ensure().tracked = id; }

function complete(m) {
  const S = ensure(); const bonus = m.objectives.filter(o => o.optional && o.done).reduce((a, o) => a + (o.bonus || 0), 0);
  G.credits += m.reward + bonus; G.rep = (G.rep || 0) + 2; m.status = 'done';
  S.active = S.active.filter(x => x !== m); S.done.unshift({ id: m.id, title: m.title, giver: m.giver, reward: m.reward + bonus, objectives: m.objectives.map(o => ({ text: o.text, done: o.done, optional: o.optional })) }); S.done = S.done.slice(0, 30);
  if (S.tracked === m.id) S.tracked = S.active[0] ? S.active[0].id : null;
  toast(`Mission complete: ${m.title}. +${m.reward + bonus} cr`, 'good');
}
function tick(m, o) {
  o.done = true;
  if (o.kind === 'take' && o.item) m.carry.push(o.item);
  if (o.kind === 'deliver' && o.item) m.carry = m.carry.filter(i => i !== o.item);
  toast(`${o.optional ? 'Optional objective' : 'Objective'} complete: ${o.text}`, 'good');
  const c = current(m); if (!c) complete(m); else if (!o.optional) toast(`Next: ${c.text}`, '');
}
/**
 * Feed a game event; returns how many objectives ticked.
 *  system {sys} · landed {loc} · docked {loc} · talk {loc, who} · take {mid, oi} · reach {loc, test(o) -> bool}
 */
export function event(type, d = {}) {
  const S = ensure(); let n = 0;
  for (const m of S.active.slice()) {
    let progressed = true;
    while (progressed && m.status === 'active') {
      progressed = false; const cur = current(m);
      const cands = m.objectives.filter(o => !o.done && (o === cur || o.optional));
      for (const o of cands) {
        let hit = false;
        if (type === 'system') hit = o.kind === 'travel' && o.sys === d.sys;
        else if (type === 'landed') hit = o.kind === 'land' && o.loc === d.loc;
        else if (type === 'docked') hit = o.kind === 'enter' && o.loc === d.loc;
        else if (type === 'talk') hit = (o.kind === 'talk' || o.kind === 'return' || (o.kind === 'deliver' && o.who)) && o.loc === d.loc && o.who === d.who && (o.kind !== 'deliver' || m.carry.includes(o.item));
        else if (type === 'take') hit = o.kind === 'take' && d.mid === m.id && m.objectives.indexOf(o) === d.oi;
        else if (type === 'reach') hit = (o.kind === 'reach' || (o.kind === 'deliver' && o.spot && m.carry.includes(o.item))) && o.loc === d.loc && !!(d.test && d.test(o));
        if (hit) { tick(m, o); n++; break; }
      }
      // standing state that is already true ticks straight away (e.g. you accept a job in the system you must travel to)
      const c2 = current(m); if (m.status === 'active' && c2 && c2.kind === 'travel' && c2.sys === G.sysIndex && d.here !== false) { tick(m, c2); n++; progressed = true; }
    }
  }
  return n;
}
/** NPCs that must exist at a location (mission targets + givers of offered/active missions) */
export function peopleAt(loc) {
  const S = ensure(), out = [];
  for (const m of S.active) for (const o of m.objectives) if (!o.done && o.loc === loc && o.who && (o.kind === 'talk' || o.kind === 'return' || o.kind === 'deliver')) out.push({ who: o.who, role: o.role || m.giverRole, seed: hashStr(o.who), m, o, spot: o.spot });
  for (const m of S.active) if (m.giverLoc === loc && !out.some(p => p.who === m.giver)) out.push({ who: m.giver, role: m.giverRole, seed: m.giverSeed, m, giver: true });
  return out;
}
/** items waiting to be picked up at a location */
export function itemsAt(loc) {
  const S = ensure(), out = [];
  for (const m of S.active) m.objectives.forEach((o, oi) => { if (!o.done && o.kind === 'take' && o.loc === loc) out.push({ m, o, oi }); });
  return out;
}
