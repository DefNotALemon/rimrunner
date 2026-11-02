// Input: keyboard+mouse, gamepad (brand-aware), touch. Auto-detects the active scheme live; prompts follow it.
const KEYS = {
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'], interact: ['KeyE'], pack: ['Tab'],
  focus: ['KeyQ'], holster: ['KeyH'], reload: ['KeyR'], journal: ['KeyJ'], map: ['KeyM'], land: ['KeyL'], drive: ['KeyK'],
  q1: ['Digit1'], q2: ['Digit2'], q3: ['Digit3'], q4: ['Digit4'], back: ['Escape'], use: ['KeyG'], tech: ['KeyT'], view: ['KeyV'],
};
const PAD = { jump: 0, crouch: 1, interact: 2, pack: 3, focus: 4, holster: 5, aim: 6, fire: 7, map: 8, journal: 9, sprint: 10, land: 11, view: 11, q1: 12, q2: 15, q3: 13, q4: 14 };
const PADNAMES = {
  xbox:   { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  ps:     { 0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right' },
  switch: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: '−', 9: '+', 10: 'L-Stick', 11: 'R-Stick', 12: 'Up', 13: 'Down', 14: 'Left', 15: 'Right' },
};
const KBNAMES = { jump: 'Space', sprint: 'Shift', crouch: 'C', interact: 'E', pack: 'Tab', focus: 'Q (hold)', holster: 'H', reload: 'R', journal: 'J', map: 'M', land: 'L', drive: 'K', q1: '1', q2: '2', q3: '3', q4: '4', back: 'Esc', use: 'G', tech: 'T', view: 'V', aim: 'Right Mouse', fire: 'Left Mouse' };
const TOUCHNAMES = { jump: 'JUMP', sprint: 'RUN', crouch: 'DUCK', interact: 'USE', pack: 'PACK', focus: 'FOCUS', holster: 'HOLSTER', reload: 'RELOAD', journal: 'LOG', map: 'MAP', land: 'LAND', drive: 'DRIVE', q1: 'tap option', q2: 'tap option', q3: 'tap option', q4: 'tap option', back: 'BACK', use: 'EAT', tech: 'TECH', view: 'VIEW', aim: 'AIM', fire: 'FIRE' };

export const In = {
  scheme: 'kb', brand: 'xbox', down: {}, pressed: {}, move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, locked: false,
  listeners: [], _padPrev: {},
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
  addEventListener('gamepadconnected', e => { In.brand = /054c|dualsense|dualshock|playstation|wireless controller/i.test(e.gamepad.id) ? 'ps' : /057e|switch|pro controller|joy-con/i.test(e.gamepad.id) ? 'switch' : 'xbox'; });
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
  // gamepad
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp) continue;
    const dz = v => Math.abs(v) < 0.15 ? 0 : v;
    const ax = dz(gp.axes[0]), ay = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
    let any = ax || ay || rx || ry;
    for (const a in PAD) {
      const b = gp.buttons[PAD[a]]; const d = !!b && b.pressed; const was = !!In._padPrev[a];
      if (d && !was) { In.pressed[a] = true; any = true; }
      if (d) In.down[a] = true; else if (was) In.down[a] = false;
      In._padPrev[a] = d;
    }
    if (any) { In.brand = /054c|dualsense|dualshock|playstation|wireless controller/i.test(gp.id) ? 'ps' : /057e|switch|pro controller|joy-con/i.test(gp.id) ? 'switch' : 'xbox'; In.setScheme('pad'); }
    if (In.scheme === 'pad') { x += ax; y += ay; In.look.x += rx * 18; In.look.y += ry * 18; }
    break;
  }
  if (In.scheme === 'touch') { x += touchMove.x; y += touchMove.y; }
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  In.move.x = x; In.move.y = y;
  In.back = !!(In.pressed.back);
}
