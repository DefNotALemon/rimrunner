// People, conversation, trade, quests, your shop, and the law on foot
import { rng, clamp, fmt } from './util.js';
import { ITEMS, TECH, PLANET_KINDS, JOBS } from './data.js';
import { G, toast, lvl, xp, addItem, removeItem, count, itemValue, takeAt, putAt } from './state.js';
import { makePerson, systemAt } from './gen.js';

const TRAIT = {
  dry: ['Don\'t get me started.', 'Dry as the lane dust, me.'], warm: ['Pull up a stool, friend.', 'Glad to see a new face.'], nervous: ['Keep your voice down, would you?', 'I\'ve had a rough month.'],
  proud: ['I do good work. Ask anyone.', 'Nobody on the Rim does it better.'], sly: ['Everything\'s for sale, friend. Everything.', 'I hear things. You hear things. We trade.'], tired: ['Long shift. Long year.', '*yawns* Sorry. What was it?'],
};
const KIND_DESC = {
  temperate: 'green and breathable, with real rain', desert: 'all dust and heat', frozen: 'frozen to the bone', volcanic: 'rivers of fire and sulfur air', barren: 'airless rock — bring your own oxygen',
  toxic: 'a poison-green hell, but rich', crystal: 'a singing crystal world nobody fully trusts', ocean: 'mostly water, with a few islands',
};
const SHAPE_DESC = { round: 'a plain sphere', oblate: 'squashed flat at the poles', lumpy: 'lumpy as a potato', ringed: 'wearing a ring', ringworld: 'a ringworld — somebody built it, nobody knows who', crystal: 'bristling with crystal spires', donut: 'shaped like a donut, honest', moonpair: 'a double world, two bodies orbiting each other', shard: 'a cloud of floating shards' };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Social {
  constructor() { this.questTimer = 40; this.shopTimer = 4; this.copCd = 0; this.reinforce = 0; }

  // ------- conversation -------
  topics(npc, surf) {
    const p = npc.prof, sys = surf.sys, T = [];
    T.push({ id: 'who', label: 'Who are you?' });
    T.push({ id: 'from', label: 'Where are you from?' });
    T.push({ id: 'news', label: 'What\'s going on around here?' });
    sys.planets.filter(x => x.i !== surf.planet.i).slice(0, 3).forEach(pl => T.push({ id: 'planet:' + pl.i, label: `Know anything about ${pl.name}?` }));
    T.push({ id: 'buyers', label: 'Who would buy my stuff?' });
    T.push({ id: 'law', label: 'How do the spaceways work? And the cops?' });
    if (['gunnut', 'mechanic', 'trader'].includes(p.job)) T.push({ id: 'craft', label: p.job === 'trader' ? 'What\'s selling well?' : 'How do I build better gear?' });
    T.push({ id: 'dig', label: 'Know any good places to dig?' });
    T.push({ id: 'work', label: 'Got any work?' });
    return T;
  }
  answer(npc, id, surf, hooks) {
    const p = npc.prof, sys = surf.sys, smart = p.smarts; p.met = true; xp('speech', 1);
    const r = rng(p.seed + id.length * 97);
    if (id === 'who') return `"${p.name}. I'm a ${p.jobLabel.toLowerCase()} here on ${surf.planet.name}." ${pick(TRAIT[p.trait])}`;
    if (id === 'from') {
      let origin = null, osys = systemAt(1971, 0); for (let i = 0; i < 14; i++) { const s = systemAt(1971, i); const f = s.planets.find(x => x.name === p.originName); if (f) { origin = f; osys = s; break; } }
      if (!origin) return `"${p.originName}, out past ${p.originSys}. You wouldn't have heard of it."`;
      return `"${origin.name}, in the ${osys.name} system. It's ${KIND_DESC[origin.kind]} — ${SHAPE_DESC[origin.shape]}. ${origin.settled ? 'Folk there get by.' : 'Nobody much lives there now. That\'s why I left.'}"`;
    }
    if (id === 'news') {
      const lines = [];
      const rich = sys.planets.filter(x => x.i !== surf.planet.i).sort((a, b) => b.radius - a.radius)[0];
      if (smart > 0.4) lines.push(`${rich.name} is the big one in this system — ${SHAPE_DESC[rich.shape]}.`);
      lines.push(smart > 0.5 ? `The Patrol clocks the spaceways at ${fmt(sys.lanes[0].limit)}. Go over it and somebody files a report.` : 'Watch your speed in the lanes. The squad cars are everywhere.');
      lines.push(G.shop ? `I hear you run the shop on ${G.shop.planetName}. Word travels.` : (surf.lease ? 'There\'s a vacant unit by the plaza — somebody should lease it.' : 'Quiet out here.'));
      lines.push(sys.uncharted ? 'Nobody\'s properly charted this system. You could make a name.' : 'This system\'s been charted since the old days.');
      return '"' + lines.join(' ') + '"';
    }
    if (id.startsWith('planet:')) {
      const pl = sys.planets[+id.split(':')[1]]; const rich = pl.rich.map(i => ITEMS[i].name);
      if (smart > 0.6) return `"${pl.name}? ${KIND_DESC[pl.kind]}. ${SHAPE_DESC[pl.shape][0].toUpperCase() + SHAPE_DESC[pl.shape].slice(1)}. Prospectors report ${rich.join(' and ')} in quantity. ${pl.air < 0.3 ? 'Thin air — pack oxygen.' : 'Breathable.'} ${pl.settled ? 'There\'s a town.' : 'No settlement.'}"`;
      if (smart > 0.35) return `"${pl.name}... ${KIND_DESC[pl.kind]}, I think. Somebody said ${rich[0]}."`;
      return `"${pl.name}? Rock. Maybe. I don't get out much."`;
    }
    if (id === 'buyers') {
      if (smart < 0.4) { return '"Me? I\'m no market-wise. Ask somebody sharper — the traders, the scholars."'; }
      const list = surf.npcs.filter(n => n !== npc && !n.customer && !n.lone && !G.knownBuyers[n.prof.id] && n.prof.id !== p.id).sort(() => Math.random() - 0.5).slice(0, smart > 0.7 ? 4 : 2);
      if (!list.length) return '"You\'ve met everyone who matters. Go see them."';
      const out = list.map(n => { G.knownBuyers[n.prof.id] = { name: n.prof.name, job: n.prof.jobLabel, planet: surf.planet.name, wants: Object.keys(n.prof.interest) }; return `${n.prof.name} (${n.prof.jobLabel}) pays well for ${Object.keys(n.prof.interest).join('/')}`; });
      toast('Journal updated: new buyers.', 'good'); return `"Let me think. ${out.join('. ')}. Tell them I sent you."`;
    }
    if (id === 'law') {
      const l = sys.lanes[0].limit;
      return smart > 0.35 ? `"Spaceways burn a third of the fuel and run ${(3.6).toFixed(1)}× faster, but they're policed. Limit's ${fmt(l)}. Over it, or fly reckless — near-misses, collisions, shooting in the lanes — and somebody files a report. A squad cruiser comes, hails you, fines you. Bad enough and it's an arrest. Run and they shoot." They shrug. "Jail's escapable, if you've got the hands for it."`
        : '"Don\'t speed in the lanes. They fine you. That\'s all I know."';
    }
    if (id === 'craft') {
      if (p.job === 'trader') { const best = Object.entries(ITEMS).filter(([k, v]) => v.cat === 'ore' || v.cat === 'exotic').sort((a, b) => b[1].value - a[1].value)[0]; return `"Hymnstone and platinum move fast, but you won't find them on rock worlds. ${ITEMS[best[0]].name} is the money right now. Refined stuff — plate, steel, alloy — beats raw ore by a mile."`; }
      const nxt = Object.entries(TECH).find(([k, t]) => !G.tech[k] && t.req.every(q => G.tech[q]));
      return nxt ? `"Next step for you is ${nxt[1].name}: ${nxt[1].desc} Costs ${fmt(nxt[1].cost)} cr and some materials. Use the research terminal."` : '"You\'ve outgrown me, friend."';
    }
    if (id === 'dig') {
      if (smart < 0.5) return '"Dig anywhere there\'s a glint. That\'s all I got."';
      const ok = hooks.markRich(); return ok ? `"Look for the glow on the ${ITEMS[ok].name} outcrops — I marked them for you. They're rich here."` : '"Nothing special I know about."';
    }
    return '...';
  }

  // ------- trading -------
  priceFor(npc, entry) {
    const it = ITEMS[entry.id]; const interest = npc.prof.interest[it.cat] ?? 0.0; const base = it.value * (entry.q || 1);
    if (it.cat === 'quest') return 0;
    const m = interest ? interest : 0.45;   // those who don't deal in it still lowball
    const sat = (npc.sat && npc.sat[entry.id]) || 0;
    return Math.max(1, Math.round(base * m * (0.85 + npc.prof.mood * 0.3) * (1 + 0.04 * lvl('trading')) * Math.max(0.35, 1 - sat * 0.07)));
  }
  budget(npc) { const age = G.time - (npc.budgetT || -1e9); if (age > 300) { npc.budgetT = G.time; npc.budget = Math.round(120 + npc.prof.smarts * 380 + (npc.prof.job === 'trader' ? 300 : 0)); npc.sat = {}; } return npc.budget; }
  sellTo(npc, entry, n = 1) {
    const unit = this.priceFor(npc, entry); const bud = this.budget(npc);
    if (!unit) { toast('They aren\'t interested.', 'warn'); return false; }
    if (bud < unit) { toast(`${npc.prof.name} is out of cash for now.`, 'warn'); return false; }
    npc.budget -= unit; npc.sat = npc.sat || {}; npc.sat[entry.id] = (npc.sat[entry.id] || 0) + 1;
    G.credits += unit; npc.prof.mood = clamp(npc.prof.mood + 0.02, 0, 1); xp('trading', 3); toast(`Sold for ${fmt(unit)} cr`, 'good'); return true;
  }

  // ------- quests -------
  genQuest(npc, surf) {
    const p = npc.prof, r = rng((p.seed + Math.floor(G.time)) >>> 0); const id = 'q' + G.uid++;
    const types = ['fetch', 'fetch', 'deliver', 'scout', 'gun'];
    if (p.job === 'gunnut' || p.job === 'drifter') types.push('gun', 'gun'); if (p.job === 'miner') types.push('fetch');
    const t = r.pick(types);
    const base = { id, type: t, giver: p.name, giverId: p.id, planetName: surf.planet.name, sysName: surf.sys.name, accepted: false, done: false };
    if (t === 'fetch') {
      const pool = surf.K.res.filter(i => ITEMS[i].kind === 'res'); const item = r.pick(pool.length ? pool : ['iron_ore']); const n = r.int(6, 16);
      return { ...base, need: { id: item, n }, reward: Math.round(n * ITEMS[item].value * 1.6 + 20), desc: `${p.name} needs ${n} ${ITEMS[item].name}.`, pitch: pick([`"Hey — you! You look like you dig. I need ${n} ${ITEMS[item].name}, and I pay better than the Exchange."`, `"Got a minute? The shipment fell through. ${n} ${ITEMS[item].name} gets you ${fmt(Math.round(n * ITEMS[item].value * 1.6 + 20))} credits."`]) };
    }
    if (t === 'gun') {
      const gid = r.pick(['pistol', 'pistol', 'coach', 'rifle'].filter(g => g === 'pistol' || G.tech.machining || r() < 0.3)); const reward = Math.round(ITEMS[gid].value * 1.7);
      return { ...base, type: 'gun', need: { gun: gid }, reward, desc: `${p.name} wants a ${ITEMS[gid].name}, hand-built.`, pitch: `"They say you can build guns. I want a ${ITEMS[gid].name} — a good one. ${fmt(reward)} credits when you hand it over."` };
    }
    if (t === 'deliver') {
      const others = surf.npcs.filter(n => n !== npc && !n.lone && !n.customer && n.prof.id !== p.id); if (!others.length) return this.genQuest(npc, surf);
      const tg = r.pick(others); const reward = r.int(60, 160);
      return { ...base, type: 'deliver', targetId: tg.prof.id, targetName: tg.prof.name, reward, desc: `Deliver a parcel from ${p.name} to ${tg.prof.name}.`, pitch: `"Hey, you with the pack. Take this to ${tg.prof.name} for me? Walk's not far. ${reward} credits."` };
    }
    const cand = surf.sys.planets.filter(x => x.i !== surf.planet.i && !G.visited[surf.sys.index + ':' + x.i]);
    if (!cand.length) return this.genQuest(npc, surf);
    const pl = r.pick(cand); const reward = Math.round(100 + pl.radius / 12);
    return { ...base, type: 'scout', sysIndex: surf.sys.index, planetI: pl.i, planetName2: pl.name, reward, desc: `Chart ${pl.name} for ${p.name}.`, pitch: `"You fly, right? Nobody's logged ${pl.name} and my cousin swears it has something worth finding. Fly by and chart it — ${reward} credits."` };
  }
  accept(q) {
    q.accepted = true; G.quests.push(q);
    if (q.type === 'deliver') { addItem('parcel', 1); }
    toast(`Quest accepted: ${q.desc}`, 'good');
  }
  // Called when talking to someone: returns {text, action}
  questsFor(npc, surf) {
    const out = [];
    for (const q of G.quests) {
      if (q.done) continue;
      if (q.type === 'fetch' && q.giverId === npc.prof.id && count(q.need.id) >= q.need.n) out.push({ q, label: `Hand over ${q.need.n} ${ITEMS[q.need.id].name} (+${fmt(q.reward)} cr)` });
      if (q.type === 'gun' && q.giverId === npc.prof.id) { const gs = this.findGun(q.need.gun); if (gs) out.push({ q, label: `Hand over the ${ITEMS[q.need.gun].name} (+${fmt(q.reward)} cr)`, gun: gs }); }
      if (q.type === 'deliver' && q.targetId === npc.prof.id && count('parcel') > 0) out.push({ q, label: `Deliver the parcel (+${fmt(q.reward)} cr)` });
      if (q.type === 'scout' && q.giverId === npc.prof.id && G.visited[q.sysIndex + ':' + q.planetI]) out.push({ q, label: `Report that ${q.planetName2} is charted (+${fmt(q.reward)} cr)` });
    }
    return out;
  }
  findGun(gid) {
    const P = G.pack; for (let i = 0; i < 2; i++) if (P.sides[i] && P.sides[i].id === gid) return { t: 'side', i };
    for (const face of ['front', 'back']) for (let i = 0; i < P[face].length; i++) { const s = P[face][i]; if (s && s.uid && s.id === gid) return { t: 'slot', face, i }; }
    return null;
  }
  complete(opt) {
    const q = opt.q; if (q.type === 'fetch') removeItem(q.need.id, q.need.n); if (q.type === 'deliver') removeItem('parcel', 1);
    if (q.type === 'gun') { const g = takeAt(opt.gun); G.rep += Math.round((g.q || 1) * 2); G.credits += Math.round(q.reward * (g.q || 1) * 0.8) - q.reward; }
    G.credits += q.reward; q.done = true; G.quests = G.quests.filter(x => x !== q); G.doneQuests++; G.rep += 1; xp('speech', 5); toast(`Quest complete: +${fmt(q.reward)} cr`, 'good');
  }

  updateQuests(dt, surf, player, ui) {
    if (!surf.planet.settled) return;
    this.questTimer -= dt;
    const approaching = surf.npcs.find(n => n.approach);
    if (approaching) {
      approaching.approachT = (approaching.approachT || 0) + dt;
      const d = Math.hypot(approaching.pos.x - player.pos.x, approaching.pos.z - player.pos.z);
      if (d < 4 && !approaching.called) { approaching.called = true; ui.bubble(approaching, approaching.pendingQuest.pitch.slice(0, 90) + '…'); }
      if (approaching.approachT > 50 && !approaching.talking) { approaching.approach = false; approaching.marker.visible = false; approaching.pendingQuest = null; approaching.called = false; approaching.approachT = 0; }
    } else if (this.questTimer <= 0 && G.quests.length < 4) {
      this.questTimer = 70 + Math.random() * 80;
      const cands = surf.npcs.filter(n => !n.dead && !n.customer && !n.prof.cop && n.wander && !n.lone && Math.hypot(n.pos.x - player.pos.x, n.pos.z - player.pos.z) < 70);
      if (cands.length) { const n = cands[Math.floor(Math.random() * cands.length)]; n.pendingQuest = this.genQuest(n, surf); n.approach = true; n.marker.visible = true; n.approachT = 0; n.called = false; toast('Someone is heading your way…'); }
    }
  }

  // ------- your shop -------
  leaseShop(surf) {
    if (G.shop || G.credits < 400) return false;
    G.credits -= 400; G.shop = { name: 'Rim Arms', planetKey: surf.sys.index + ':' + surf.planet.i, planetName: surf.planet.name, stock: [], till: 0, rep: 0, sold: 0, lost: 0, lastT: Date.now() };
    toast('Shop leased! Stock it from your pack and customers will find you.', 'good'); this.decorateShop(surf); return true;
  }
  shopHere(surf) { return G.shop && G.shop.planetKey === surf.sys.index + ':' + surf.planet.i; }
  decorateShop(surf) {
    const b = surf.B && surf.B.lease; if (!b || b.decorated) return;
    b.decorated = true; surf.interactables = surf.interactables.filter(i => i.act !== 'lease');
    surf.counter(b, 'Shop counter'); surf.interactables.push({ pos: { x: b.back.x + b.dv[0] * 1.2, y: 1, z: b.back.z + b.dv[1] * 1.2, distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); } }, r: 3.4, label: 'Shop desk', act: 'shop' });
    const THREE_ = surf.root.constructor; // shelf display refreshed in refreshShelf
    this.shelfB = b;
  }
  stockItem(entry, n, price) {   // move an item from the pack into the shop
    const S = G.shop; if (!S) return false;
    if (entry.gun) { S.stock.push({ id: entry.g.id, n: 1, price, q: entry.g.q, uid: entry.g.uid, gun: true }); }
    else { const ex = S.stock.find(s => s.id === entry.id && !s.gun && s.price === price); if (ex) ex.n += n; else S.stock.push({ id: entry.id, n, price }); }
    return true;
  }
  fairValue(s) { return ITEMS[s.id].value * (s.q || 1); }
  // One customer decision. Returns {sold, item, price} or null
  customerBuys(cust) {
    const S = G.shop; const avail = S.stock.filter(s => s.n > 0); if (!avail.length) { S.lost++; return null; }
    const wants = avail.map(s => { const fair = this.fairValue(s); const interest = (cust.interest[ITEMS[s.id].cat] ? 0.25 : 0); const p = clamp(1.7 - s.price / fair + interest, 0, 1); return { s, p }; }).sort((a, b) => b.p - a.p);
    const pick = wants[0]; if (Math.random() < pick.p) {
      const s = pick.s; s.n--; S.till += s.price; S.sold++; S.rep += s.price <= this.fairValue(s) * 1.25 ? 1.2 : 0.4; xp('trading', 2);
      if (s.n <= 0) S.stock = S.stock.filter(x => x !== s); return { item: s, price: s.price };
    }
    S.lost++; S.rep -= 0.1; return null;
  }
  customerRate() { const S = G.shop; if (!S) return 0; const variety = new Set(S.stock.filter(s => s.n > 0).map(s => s.id)).size; return S.stock.length ? clamp(0.12 + Math.sqrt(Math.max(0, S.rep)) * 0.07 + variety * 0.02, 0, 0.85) : 0; }
  updateShop(dt, surf, ui) {
    if (!G.shop) return;
    const here = this.shopHere(surf); this.shopTimer -= dt;
    if (this.shopTimer <= 0) {
      this.shopTimer = 7; if (here && surf.B && surf.B.lease && Math.random() < this.customerRate()) this.spawnCustomer(surf, ui);
      else if (!here) { /* offline accrual handled on return */ }
    }
  }
  spawnCustomer(surf, ui) {
    const b = surf.B.lease; const prof = makePerson(Math.floor(Math.random() * 1e9), surf.planet, surf.sys); const a = Math.random() * 6.283;
    const start = { x: Math.cos(a) * 44, z: Math.sin(a) * 44 }; const n = surf.spawnNPC(prof, { customer: true }); n.pos.set(start.x, 0, start.z);
    const counter = { x: b.back.x + b.dv[0] * 4.2, z: b.back.z + b.dv[1] * 4.2 };
    n.customer = { i: 0, path: [{ x: b.door.x, z: b.door.z }, { x: b.x + b.dv[0] * 1.5, z: b.z + b.dv[1] * 1.5 }, counter], done: (npc) => {
      const c = npc.customer; if (!c.bought) { c.bought = true; const res = this.customerBuys(prof); c.res = res; if (res) ui.sayShop(`${prof.name} bought ${ITEMS[res.item.id].name} for ${fmt(res.price)} cr`); c.path = [{ x: b.door.x, z: b.door.z }, { x: start.x, z: start.z }]; c.i = 0; c.leaving = true; c.done = (n2) => { surf.root.remove(n2.mesh); surf.npcs.splice(surf.npcs.indexOf(n2), 1); }; }
    } };
  }
  offlineSim(surf, minutes) {
    const S = G.shop; if (!S) return null; const ticks = Math.min(240, Math.floor(minutes * 60 / 7)); let sold = 0, income = 0;
    for (let i = 0; i < ticks; i++) if (Math.random() < this.customerRate()) { const r = this.customerBuys(makePerson(Math.floor(Math.random() * 1e9), surf.planet, surf.sys)); if (r) { sold++; income += r.price; } }
    return { sold, income, ticks };
  }

  // ------- the law on foot -------
  hit(npc, dmg, head, player, surf, ui) {
    if (npc.dead) return; npc.hp -= dmg; npc.fleeFrom = { x: player.pos.x, z: player.pos.z }; npc.fleeT = 0; npc.approach = false; npc.marker.visible = false;
    const witnessed = surf.npcs.some(n => n.prof.cop && !n.dead && Math.hypot(n.pos.x - npc.pos.x, n.pos.z - npc.pos.z) < 70);
    G.heat = Math.min(100, G.heat + 12);
    if (npc.prof.cop) { surf.npcs.filter(n => n.prof.cop).forEach(n => n.hostile = true); this.shotCop = true; }
    else if (witnessed || true) { surf.npcs.filter(n => n.prof.cop && !n.dead).forEach(n => { n.hostile = true; }); G.bounty += 40; }
    if (npc.hp <= 0) { npc.dead = true; npc.marker.visible = false; G.bounty += npc.prof.cop ? 500 : 350; toast(npc.prof.cop ? 'Officer down — bounty +500' : 'Murder — bounty +350', 'warn'); if (npc.talking) ui.closeAll(); }
    else if (!npc.prof.cop) ui.bubble(npc, pick(['"HEY! Back off!"', '"Somebody help!"', '"Are you insane?!"']));
  }
  updateCops(dt, surf, player, hooks) {
    this.copCd -= dt; const cops = surf.npcs.filter(n => n.prof.cop && !n.dead); const hostile = cops.filter(n => n.hostile);
    if (hostile.length && G.hp > 0 && surf.planet.settled) {
      for (const c of hostile) {
        const dx = player.pos.x - c.pos.x, dz = player.pos.z - c.pos.z, d = Math.hypot(dx, dz); c.approach = false; c.station = null; c.wander = false;
        if (d > 7 || (this.shotCop && d > 12)) { c.pos.x += dx / d * 3.4 * dt; c.pos.z += dz / d * 3.4 * dt; surf.face(c, dx, dz); }
        else surf.face(c, dx, dz);
        const gunOut = !!G.hand; c.fireT = (c.fireT || 1.5) - dt;
        if (this.shotCop || G.bounty >= 600) {   // shoot to kill
          if (d < 40 && c.fireT <= 0) { c.fireT = 1 + Math.random(); hooks.copFire(c, d); }
        } else if (d < 5 && !gunOut && this.copCd <= 0) { this.copCd = 999; hooks.arrestOnFoot('assaulting civilians'); }
        else if (d < 18 && !c.warned) { c.warned = true; hooks.bubbleFn(c, '"Drop the weapon and put your hands up!"'); }
        else if (d < 14 && gunOut && c.fireT <= 0) { c.fireT = 4; hooks.bubbleFn(c, '"Holster it! Last warning!"'); c.warns = (c.warns || 0) + 1; if (c.warns > 2) this.shotCop = true; }
      }
    } else if (!hostile.length && G.heat > 0) { /* cools in game */ }
    if (this.shotCop && !cops.length) { this.reinforce += dt; if (this.reinforce > 25) { this.reinforce = 0; this.shotCop = false; G.heat = 40; toast('The Patrol sends fresh officers…', 'warn'); const b = surf.B.patrol; const prof = makePerson(Math.floor(Math.random() * 1e9), surf.planet, surf.sys); prof.cop = true; const n = surf.spawnNPC(prof); n.pos.set(b.door.x, 0, b.door.z); n.hostile = true; } }
  }
}
