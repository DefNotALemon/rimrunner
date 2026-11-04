// Input: keyboard+mouse, gamepad (brand-aware), touch. Auto-detects the active scheme live; prompts follow it.
// DualSense: buttons work everywhere (raw Firefox layout remapped below); gyro aim (hold L2), rumble and
// adaptive triggers come from dualsense.js over WebHID (Chrome/Edge). Other pads rumble via vibrationActuator.
import { DS, initDualSense, offerDualSense, drainGyro, tickDualSense, haptic } from './dualsense.js';
export { haptic };
const KEYS = {
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'], interact: ['KeyE'], pack: ['Tab'],
  focus: ['KeyQ'], holster: ['KeyH'], reload: ['KeyR'], journal: ['KeyJ'], map: ['KeyM'], land: ['KeyL'], drive: ['KeyK'],
  q1: ['Digit1'], q2: ['Digit2'], q3: ['Digit3'], q4: ['Digit4'], back: ['Escape'], use: ['KeyG'], tech: ['KeyT'], view: ['KeyV'], antenna: ['KeyB'],
};
const PAD = { jump: 0, crouch: 1, interact: 2, pack: 3, focus: 4, holster: 5, aim: 6, fire: 7, map: 8, journal: 9, sprint: 10, land: 11, view: 11, q1: 12, q2: 15, q3: 13, q4: 14, antenna: 12 };
const PADNAMES = {
  xbox:   { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  ps:     { 0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  switch: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 10: 'L-Stick', 11: 'R-Stick', 12: 'Up', 13: 'Down', 14: 'Left', 15: 'Right' },
};
const KBNAMES = { jump: 'Space', sprint: 'Shift', crouch: 'C', interact: 'E', pack: 'Tab', focus: 'Q (hold)', holster: 'H', reload: 'R', journal: 'J', map: 'M', land: 'L', drive: 'K', q1: '1', q2: '2', q3: '3', q4: '4', back: 'Esc', use: 'G', tech: 'T', view: 'V', antenna: 'B', aim: 'Right Mouse', fire: 'Left Mouse' };
const TOUCHNAMES = { jump: 'JUMP', sprint: 'RUN', crouch: 'DUCK', interact: 'USE', pack: 'PACK', focus: 'FOCUS', holster: 'HOLSTER', reload: 'RELOAD', journal: 'LOG', map: 'MAP', land: 'LAND', drive: 'DRIVE', q1: 'tap option', q2: 'tap option', q3: 'tap option', q4: 'tap option', back: 'BACK', use: 'EAT', tech: 'TECH', antenna: 'RELAY', view: 'VIEW', aim: 'AIM', fire: 'FIRE' };

export const In = {
  scheme: 'kb', brand: 'xbox', down: {}, pressed: {}, move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, locked: false,
  listeners: [], _padPrev: {}, _rawPrev: [], haptic,
  label(a) {
    if (this.scheme === 'touch') return TOUCHNAMES[a] || a;
    if (this.scheme === 'pad') { const i = PAD[a]; return i === undefined ? (a === 'back' ? PADNAMES[this.brand][1] : a) : PADNAMES[this.brand][i]; }
    return KBNAMES[a] || a;
  },
  onScheme(fn) { this.listeners.push(fn); },
  setScheme(s) { if (s !== this.scheme) { this.scheme = s; document.body.dataset.scheme = s; this.listeners.forEach(f => f(s)); } },
  consume() { const p = this.pressed; this.pressed = {}; return p; },
  take() { const l = this.look; this.look = { x: 0, y: 0 }; return l; },
};

const kbDown = {};
let touchMove = { x: 0, y: 0 };
export function initInput(canvas) {
  document.body.dataset.scheme = 'kb';
  const press = a => { if (!In.down[a]) In.pressed[a] = true; In.down[a] = true; };
  const release = a => { In.down[a] = false; };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Tab') e.preventDefault();
    In.setScheme('kb'); kbDown[e.code] = true;
    for (const a in KEYS) if (KEYS[a].includes(e.code)) press(a);
  });
  addEventListener('keyup', e => { kbDown[e.code] = false; for (const a in KEYS) if (KEYS[a].includes(e.code)) release(a); });
  canvas.addEventListener('mousedown', e => {
    if (!document.pointerLockElement && In.scheme !== 'touch') { canvas.requestPointerLock?.(); return; }
    In.setScheme('kb');
    if (e.button === 0) press('fire'); if (e.button === 2) press('aim'); if (e.button === 1) { e.preventDefault(); press('focus'); }
  });
  addEventListener('mouseup', e => { if (e.button === 0) release('fire'); if (e.button === 2) release('aim'); if (e.button === 1) release('focus'); });
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => { if (document.pointerLockElement) { In.setScheme('kb'); In.look.x += e.movementX; In.look.y += e.movementY; } });
  document.addEventListener('pointerlockchange', () => { In.locked = !!document.pointerLockElement; });
  addEventListener('gamepadconnected', e => { In.brand = brandOf(e.gamepad.id); });
  initDualSense();
  // touch
  const tp = document.getElementById('touch');
  addEventListener('touchstart', () => { In.setScheme('touch'); }, { passive: true });
  let lookId = null, lx = 0, ly = 0, stickId = null, sx = 0, sy = 0;
  canvas.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.4 && stickId === null) { stickId = t.identifier; sx = t.clientX; sy = t.clientY; }
      else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { touchMove = { x: Math.max(-1, Math.min(1, (t.clientX - sx) / 60)), y: Math.max(-1, Math.min(1, (t.clientY - sy) / 60)) }; }
      if (t.identifier === lookId) { In.look.x += (t.clientX - lx) * 1.6; In.look.y += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; }
    }
    e.preventDefault();
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; touchMove = { x: 0, y: 0 }; } if (t.identifier === lookId) lookId = null; } };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  if (tp) tp.querySelectorAll('button').forEach(b => {
    const a = b.dataset.a;
    b.addEventListener('touchstart', e => { press(a); e.preventDefault(); }, { passive: false });
    b.addEventListener('touchend', e => { release(a); e.preventDefault(); }, { passive: false });
  });
}

export function pollInput() {
  // movement from keyboard
  let x = (kbDown.KeyD || kbDown.ArrowRight ? 1 : 0) - (kbDown.KeyA || kbDown.ArrowLeft ? 1 : 0);
  let y = (kbDown.KeyS || kbDown.ArrowDown ? 1 : 0) - (kbDown.KeyW || kbDown.ArrowUp ? 1 : 0);
  // gamepad (all connected pads merged; the WebHID DualSense, when live, stands in for its Gamepad API twin)
  const gp = readPad();
  if (gp) {
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    const ax = dz(gp.axes[0]), ay = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
    let any = ax || ay || rx || ry, tapped = false;
    for (const a in PAD) {
      const b = gp.buttons[PAD[a]]; const d = !!b && b.pressed; const was = !!In._padPrev[a];
      if (d && !was) { In.pressed[a] = true; any = true; }
      if (d) In.down[a] = true; else if (was) In.down[a] = false;
      In._padPrev[a] = d;
    }
    gp.buttons.forEach((b, i) => { const d = !!b?.pressed, was = !!In._rawPrev[i]; if (d && !was) { any = true; if (i !== 6 && i !== 7) tapped = true; } In._rawPrev[i] = d; });
    if (any) { In.brand = gp.brand; In.setScheme('pad'); }
    if (In.scheme === 'pad') {
      x += ax; y += ay; In.look.x += rx * 18; In.look.y += ry * 18;
      if (tapped) haptic.tap();
    }
  }
  // gyro aim: while L2 (aim) is held the pad's own turning moves the view (look units: 0.0022 rad, x0.6 aimed)
  const gy = drainGyro();
  if (In.scheme === 'pad' && In.down.aim && DS.live) { const k = DS.gain / (0.0022 * 0.6); In.look.x -= gy.yaw * k; In.look.y -= gy.pitch * k; }
  tickDualSense(In.down.aim);
  if (In.scheme === 'touch') { x += touchMove.x; y += touchMove.y; }
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  In.move.x = x; In.move.y = y;
  In.back = !!(In.pressed.back);
}


const brandOf = id => /045e|xbox|xinput/i.test(id) ? 'xbox' : /054c|dualsense|dualshock|playstation|wireless controller/i.test(id) ? 'ps' : /057e|switch|pro controller|joy-con/i.test(id) ? 'switch' : 'xbox';
// Firefox (until its DualSense remap ships) gives Sony pads raw: buttons square,cross,circle,triangle,L1,R1,L2,R2,
// create,options,L3,R3,PS,touchpad; axes LX,LY,RX,L2,R2,RY ... hat on axis 9 (-1 up, clockwise in 2/7 steps).
function sonyRaw(gp) {
  const B = gp.buttons, A = gp.axes, b = i => B[i] || { pressed: false, value: 0 };
  const trig = (i, bi) => { const v = A[i] === undefined ? b(bi).value : (A[i] + 1) / 2; return { pressed: b(bi).pressed || v > 0.12, value: v }; };
  let up = 0, down = 0, left = 0, right = 0; const h = A[9];
  if (h !== undefined && h >= -1.05 && h <= 1.05) { const k = Math.round((h + 1) * 3.5) & 7; up = k === 7 || k <= 1; right = k >= 1 && k <= 3; down = k >= 3 && k <= 5; left = k >= 5 && k <= 7; }
  const d = v => ({ pressed: !!v, value: v ? 1 : 0 });
  return { buttons: [b(1), b(2), b(0), b(3), b(4), b(5), trig(3, 6), trig(4, 7), b(8), b(9), b(10), b(11), d(up), d(down), d(left), d(right), b(12), b(13)], axes: [A[0] || 0, A[1] || 0, A[2] || 0, A[5] || 0] };
}
function norm(gp) {
  const brand = brandOf(gp.id);
  if (gp.mapping !== 'standard' && brand === 'ps' && gp.axes.length >= 6) return { id: gp.id, brand, ...sonyRaw(gp), src: gp };
  return { id: gp.id, brand, buttons: [...gp.buttons], axes: [gp.axes[0] || 0, gp.axes[1] || 0, gp.axes[2] || 0, gp.axes[3] || 0], src: gp };
}
// One merged, standard-mapped pad: buttons OR'd, each stick taken from whichever pad pushes it hardest.
export function readPad() {
  const list = [];
  if (DS.live && DS.pad) list.push({ ...DS.pad, brand: 'ps', src: null });
  for (const gp of (navigator.getGamepads ? navigator.getGamepads() : [])) if (gp && gp.connected !== false) list.push(norm(gp));
  if (!list.length) return null;
  const out = { id: list[0].id, brand: list[0].brand, buttons: [], axes: [0, 0, 0, 0] }; let best = -1;
  for (const p of list) {
    let act = 0;
    p.buttons.forEach((b, i) => { const o = out.buttons[i] || (out.buttons[i] = { pressed: false, value: 0 }); if (b?.pressed) { o.pressed = true; act++; } o.value = Math.max(o.value, b?.value || 0); });
    for (const s of [0, 2]) { const m = Math.hypot(p.axes[s], p.axes[s + 1]); act += m > 0.3 ? 1 : 0; if (m > Math.hypot(out.axes[s], out.axes[s + 1])) { out.axes[s] = p.axes[s]; out.axes[s + 1] = p.axes[s + 1]; } }
    if (act > best) { best = act; out.id = p.id; out.brand = p.brand; if (p.src) DS.gp = p.src; }
  }
  if (out.brand === 'ps' && !DS.dev) offerDualSense();
  return out;
}
