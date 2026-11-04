// Weapon wheel (RDR2-style): hold the pack button out of every menu -> time slows, the world dims, a three-slot wheel
// opens (two main weapons on top, sidearm at the bottom). Aim the mouse / right stick at a slot; let go to draw it.
// A quick tap of the same button still opens/closes the backpack (main.js decides tap vs hold).
import { ITEMS, GUN } from './data.js';
import { G, count, allGuns, canHolster, holdFrom, addItem } from './state.js';
import { In } from './input.js';
import { sfx } from './audio.js';
import { gunSVG } from './ui.js';

export const HOLD_S = 0.22;          // shorter than this = tap (backpack), longer = wheel
const SLOW = 0.3;                    // world time scale while the wheel is open
const R0 = 70, R1 = 190;             // ring radii (px, in the 440 px SVG)
// slot centres, angles clockwise from straight up: top-left, top-right, bottom
const SLOTS = [{ a: -60, name: 'Main' }, { a: 60, name: 'Main' }, { a: 180, name: 'Sidearm' }];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function sector(a0, a1, r0, r1) {   // annular sector path, degrees clockwise from up, centre (220,220)
  const p = (a, r) => { const t = (a - 90) * Math.PI / 180; return `${(220 + Math.cos(t) * r).toFixed(1)} ${(220 + Math.sin(t) * r).toFixed(1)}`; };
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${p(a0, r1)} A${r1} ${r1} 0 ${big} 1 ${p(a1, r1)} L${p(a1, r0)} A${r0} ${r0} 0 ${big} 0 ${p(a0, r0)} Z`;
}

export class WeaponWheel {
  constructor() {
    this.open = false; this.vis = 0; this.timeScale = 1; this.sel = -1; this.cur = { x: 0, y: 0 }; this.order = [null, null, null]; this.slots = [];
    this.sticky = false;   // touch: stays open after the PACK button is let go, tap a slot to draw it
    const e = this.el = document.createElement('div'); e.id = 'wheel';
    e.innerHTML = `<svg viewBox="0 0 440 440"></svg><div class="wc"></div>`;
    document.body.appendChild(e);
    this.svg = e.querySelector('svg'); this.center = e.querySelector('.wc');
    e.addEventListener('pointerdown', ev => {
      const r = this.svg.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * 440 - 220, y = (ev.clientY - r.top) / r.height * 440 - 220;
      const s = Math.hypot(x, y) > R0 * 0.8 && Math.hypot(x, y) < R1 * 1.15 ? this.pick(x, y) : -1;
      if (s >= 0 && this.slots[s]) { this.sel = s; this.close(true); } else if (this.sticky) this.close(false);
      ev.preventDefault();
    });
  }

  // who goes where: up to two main guns on top (long guns first), one sidearm (pistol / coach gun) at the bottom.
  // Slots remember their gun between openings so a weapon doesn't jump around when you draw it.
  build() {
    const guns = [];
    if (G.hand) guns.push({ g: G.hand, loc: { t: 'hand' } });
    for (const e of allGuns()) guns.push(e);
    const byUid = new Map(guns.map(e => [e.g.uid, e]));
    const slots = [null, null, null], used = new Set();
    const put = (i, e) => { slots[i] = e; used.add(e.g.uid); };
    this.order.forEach((u, i) => { const e = byUid.get(u); if (e && !used.has(u) && (i < 2 || canHolster(e.g.id))) put(i, e); });
    const free = () => guns.filter(e => !used.has(e.g.uid));
    if (!slots[2]) { const s = free().find(e => canHolster(e.g.id)); if (s) put(2, s); }        // sidearm
    for (const pass of [e => !canHolster(e.g.id), () => true]) for (let i = 0; i < 2; i++) if (!slots[i]) { const m = free().find(pass); if (m) put(i, m); }
    this.order = slots.map(e => e ? e.g.uid : null);
    this.slots = slots;
  }

  pick(x, y) { let a = Math.atan2(x, -y) * 180 / Math.PI; return a >= -120 && a < 0 ? 0 : a >= 0 && a < 120 ? 1 : 2; }

  begin(touch = false) {
    this.build(); this.open = true; this.sticky = touch; this.cur = { x: 0, y: 0 };
    this.sel = this.slots.findIndex(e => e && e.loc.t === 'hand');   // starts on what's in your hand
    In.take(); sfx('ui', 0.5); this.render();
    document.body.classList.add('wheel');
  }
  close(equip) {
    if (!this.open) return; this.open = false; document.body.classList.remove('wheel');
    const e = equip && this.sel >= 0 ? this.slots[this.sel] : null;
    if (e && e.loc.t !== 'hand') {
      if (G.held) { const left = addItem(G.held.id, G.held.n || 1); G.held = left ? { ...G.held, n: left } : null; }
      if (!G.held) { holdFrom(e.loc); sfx('zip', 0.6); this.onDraw && this.onDraw(); }
    }
  }

  // dtReal: unscaled frame time. Consumes look input so the camera holds still while choosing.
  update(dtReal) {
    this.timeScale += ((this.open ? SLOW : 1) - this.timeScale) * Math.min(1, dtReal * 12);
    this.vis += ((this.open ? 1 : 0) - this.vis) * Math.min(1, dtReal * 16);
    this.el.style.opacity = this.vis.toFixed(3); this.el.style.display = this.vis > 0.01 ? 'block' : 'none';
    this.el.style.setProperty('--ws', (0.88 + 0.12 * this.vis).toFixed(3));
    if (!this.open) return;
    const l = In.take(); const k = In.scheme === 'pad' ? 0.02 : 0.012;
    this.cur.x += l.x * k; this.cur.y += l.y * k;
    const m = Math.hypot(this.cur.x, this.cur.y); if (m > 1) { this.cur.x /= m; this.cur.y /= m; }
    if (m > 0.35) { const s = this.pick(this.cur.x, this.cur.y); if (s !== this.sel && this.slots[s]) { this.sel = s; sfx('ui', 0.25); } }
    this.render();
  }

  render() {
    let h = `<defs><radialGradient id="wg"><stop offset="0.35" stop-color="rgba(10,14,22,.82)"/><stop offset="1" stop-color="rgba(10,14,22,.55)"/></radialGradient></defs>`;
    SLOTS.forEach((s, i) => {
      const e = this.slots[i], on = i === this.sel && e;
      h += `<path class="ws${on ? ' on' : ''}${e ? '' : ' empty'}" d="${sector(s.a - 58, s.a + 58, R0, R1)}"/>`;
      const t = (s.a - 90) * Math.PI / 180, r = (R0 + R1) / 2, cx = 220 + Math.cos(t) * r, cy = 220 + Math.sin(t) * r;
      if (e) h += `<g transform="translate(${(cx - 34).toFixed(1)} ${(cy - 40).toFixed(1)}) scale(${on ? 1.22 : 1})">${gunSVG(e.g.id).replace('<svg', '<svg width="68" height="68"')}</g>`;
      const sub = e ? `${e.g.mag ?? GUN[ITEMS[e.g.id].gun].mag}/${GUN[ITEMS[e.g.id].gun].mag}` : 'empty';
      h += `<text x="${cx.toFixed(1)}" y="${(cy + 38).toFixed(1)}" class="wl">${s.name.toUpperCase()}</text><text x="${cx.toFixed(1)}" y="${(cy + 54).toFixed(1)}" class="wm">${sub}</text>`;
    });
    if (this.cur.x || this.cur.y) { const a = Math.atan2(this.cur.x, -this.cur.y); h += `<circle class="wdot" cx="${(220 + Math.sin(a) * (R0 - 10)).toFixed(1)}" cy="${(220 - Math.cos(a) * (R0 - 10)).toFixed(1)}" r="4"/>`; }
    this.svg.innerHTML = h;
    const e = this.sel >= 0 ? this.slots[this.sel] : null;
    const how = this.sticky ? 'Tap a weapon' : In.scheme === 'pad' ? `Right stick · release <kbd>${In.label('pack')}</kbd>` : `Mouse · release <kbd>${In.label('pack')}</kbd>`;
    this.center.innerHTML = e ? `<b>${esc(ITEMS[e.g.id].name)}</b><span>${e.loc.t === 'hand' ? 'In hand' : 'Draw'} · ${count('ammo')} ammo boxes</span><small>${how}</small>`
      : `<b>${this.slots.some(Boolean) ? 'Weapons' : 'No weapons'}</b><small>${how}</small>`;
  }
}
