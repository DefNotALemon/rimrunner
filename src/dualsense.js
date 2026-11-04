// DualSense (PS5 pad) extras: gyro aim, rumble and adaptive triggers over WebHID (Chrome / Edge),
// plus a vibrationActuator rumble fallback for every other pad / browser. input.js reads DS.pad (a
// standard-mapped virtual gamepad built from the raw HID report) and drains DS gyro motion.
// Report layout (USB 0x01 / Bluetooth 0x31, offsets after the report-id byte, +1 on Bluetooth):
//   0-5 LX LY RX RY L2 R2 | 7 hat+face | 8 shoulders/menu/sticks | 9 PS/touchpad/mute
//   15-20 gyro pitch/yaw/roll (int16) | 21-26 accel | 27 sensor clock (uint32, 1/3 us)
import { G } from './state.js';
import { ITEMS, GUN } from './data.js';

const SONY = 0x054c, PIDS = [0x0ce6, 0x0df2]; // DualSense, DualSense Edge
const LS_KEY = 'rimrunner_dualsense_v1';
const D2R = Math.PI / 180;

export const DS = {
  dev: null, bt: false, last: 0, pad: null, seq: 0,
  rate: [0, 0, 0],            // calibrated gyro, deg/s (pitch, yaw, roll)
  bias: [0, 0, 0], scale: 1 / 16.2, calBias: [0, 0, 0],
  still: 0, acc: { yaw: 0, pitch: 0 }, lastTs: null,
  gain: 1.5,                  // camera degrees per controller degree while gyro-aiming
  motor: { strong: 0, weak: 0, until: 0 }, trig: { r: 'off', l: 'off' }, sentKey: '', gp: null,
  get live() { return !!this.dev && performance.now() - this.last < 400; },
  supported: typeof navigator !== 'undefined' && !!navigator.hid,
};
const prefs = (() => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } })();
if (typeof prefs.gain === 'number') DS.gain = prefs.gain;
const savePrefs = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch {} };

// ---------- connect ----------
const isDS = d => d.vendorId === SONY && PIDS.includes(d.productId);
async function open(dev) {
  if (DS.dev === dev) return;
  try { if (!dev.opened) await dev.open(); } catch (e) { console.warn('DualSense open failed', e); return; }
  DS.dev = dev;
  DS.bt = dev.collections.some(c => (c.outputReports || []).some(r => r.reportId === 0x31));
  dev.oninputreport = onReport;
  // reading calibration also flips a Bluetooth pad from its short report into the full 0x31 report
  try {
    const v = await dev.receiveFeatureReport(0x05);
    const b = v.getUint8(0) === 0x05 && v.byteLength >= 41 ? 1 : 0, s = o => v.getInt16(b + o - 1, true);
    const pp = s(7), pm = s(9), sp = s(19) + s(21);
    const k = sp / (pp - pm);
    if (k > 0.03 && k < 0.12) DS.scale = k;
    DS.calBias = [s(1), s(3), s(5)];
  } catch (e) { /* defaults are fine */ }
  DS.sentKey = ''; send(true);
  hidePanel();
  prefs.granted = true; savePrefs();
}
export async function requestDualSense() {
  if (!navigator.hid) return false;
  try { const [d] = await navigator.hid.requestDevice({ filters: PIDS.map(productId => ({ vendorId: SONY, productId })) }); if (d) await open(d); }
  catch (e) { console.warn(e); }
  return !!DS.dev;
}

// ---------- input report -> virtual standard pad + gyro ----------
const HAT = [[1, 0, 0, 0], [1, 0, 0, 1], [0, 0, 0, 1], [0, 1, 0, 1], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [1, 0, 1, 0]]; // up down left right
function onReport(e) {
  const v = e.data; let o;
  if (e.reportId === 0x01 && v.byteLength >= 60) o = 0; else if (e.reportId === 0x31 && v.byteLength >= 60) o = 1; else return;
  const u = i => v.getUint8(o + i), ax = i => { const a = (u(i) - 128) / 127; return Math.max(-1, Math.min(1, a)); };
  const b0 = u(7), b1 = u(8), b2 = u(9), hat = HAT[b0 & 15] || [0, 0, 0, 0], l2 = u(4) / 255, r2 = u(5) / 255;
  const on = [b0 & 0x20, b0 & 0x40, b0 & 0x10, b0 & 0x80, b1 & 1, b1 & 2, (b1 & 4) || l2 > 0.12, (b1 & 8) || r2 > 0.12, b1 & 0x10, b1 & 0x20, b1 & 0x40, b1 & 0x80, hat[0], hat[1], hat[2], hat[3], b2 & 1, b2 & 2];
  const val = on.map(x => (x ? 1 : 0)); val[6] = l2; val[7] = r2;
  DS.pad = { id: 'DualSense (WebHID 054c)', mapping: 'standard', hid: true, connected: true, axes: [ax(0), ax(1), ax(2), ax(3)], buttons: on.map((x, i) => ({ pressed: !!x, value: val[i] })) };
  DS.last = performance.now();
  // gyro: calibrated deg/s, slow auto-bias while the pad sits still, integrate by the sensor clock
  const raw = [v.getInt16(o + 15, true), v.getInt16(o + 17, true), v.getInt16(o + 19, true)];
  const ts = v.getUint32(o + 27, true);
  let dt = DS.lastTs === null ? 0 : ((ts - DS.lastTs) >>> 0) / 3e6; DS.lastTs = ts;
  if (!(dt > 0 && dt < 0.05)) dt = 0;
  const r = raw.map((x, i) => (x - DS.calBias[i]) * DS.scale);
  const quiet = r.every((x, i) => Math.abs(x - DS.bias[i]) < 2.5);
  DS.still = quiet ? DS.still + dt : 0;
  if (DS.still > 0.4) for (let i = 0; i < 3; i++) DS.bias[i] += (r[i] - DS.bias[i]) * Math.min(1, dt * 2);
  DS.rate = r.map((x, i) => x - DS.bias[i]);
  // soft tier: tiny rates (hand tremor) are scaled down, real turns pass 1:1
  const soft = x => { const a = Math.abs(x), t = 1.2; return a >= t * 2 ? x : x * Math.max(0, (a - t * 0.5) / (t * 1.5)); };
  DS.acc.pitch += soft(DS.rate[0]) * dt * D2R;   // + = nose up
  DS.acc.yaw += soft(DS.rate[1]) * dt * D2R;     // + = turned left (counter-clockwise from above)
}
// radians turned since the last call; the caller decides whether to use them
export function drainGyro() { const a = DS.acc; DS.acc = { yaw: 0, pitch: 0 }; return a; }

// ---------- output: rumble + adaptive triggers ----------
// Trigger effects (11 bytes each): DualSense firmware modes 0x21 feedback, 0x25 weapon, 0x05 off
function trigBytes(kind) {
  const t = new Uint8Array(11);
  const feedback = (pos, str) => { let zones = 0, force = 0; for (let i = pos; i < 10; i++) { zones |= 1 << i; force += ((str - 1) & 7) * 2 ** (3 * i); } t[0] = 0x21; t[1] = zones & 255; t[2] = zones >> 8; for (let k = 0; k < 4; k++) t[3 + k] = Math.floor(force / 2 ** (8 * k)) & 255; };
  const weapon = (s, e, str) => { const z = (1 << s) | (1 << e); t[0] = 0x25; t[1] = z & 255; t[2] = z >> 8; t[3] = str - 1; };
  if (kind === 'semi') weapon(4, 7, 6);
  else if (kind === 'heavy') weapon(3, 7, 8);
  else if (kind === 'auto') feedback(3, 3);
  else if (kind === 'ship') feedback(4, 2);
  else if (kind === 'aim') feedback(2, 2);
  else t[0] = 0x05;
  return t;
}
let CRC;
function crc32(bytes) {
  if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}
let sending = false, again = false, stopTimer = 0;
function send(force) {
  const d = DS.dev; if (!d) return;
  const now = performance.now(), m = DS.motor, on = now < m.until;
  const strong = on ? Math.round(m.strong * 255) : 0, weak = on ? Math.round(m.weak * 255) : 0;
  const key = [strong, weak, DS.trig.r, DS.trig.l].join();
  if (!force && key === DS.sentKey) return;
  if (sending) { again = true; return; }
  DS.sentKey = key;
  const c = new Uint8Array(47);
  c[0] = 0x01 | 0x02 | 0x04 | 0x08;   // rumble (compat), haptics select, right + left trigger effect
  c[2] = weak; c[3] = strong;
  c[10] = 0; c.set(trigBytes(DS.trig.r), 10); c.set(trigBytes(DS.trig.l), 21);
  c[38] = 0x04;                       // newer firmware rumble emulation
  let id, data;
  if (DS.bt) {
    id = 0x31; data = new Uint8Array(77); data[0] = (DS.seq++ & 15) << 4; data[1] = 0x10; data.set(c, 2);
    const crc = crc32(new Uint8Array([0xA2, 0x31, ...data.subarray(0, 73)]));
    data[73] = crc & 255; data[74] = (crc >>> 8) & 255; data[75] = (crc >>> 16) & 255; data[76] = crc >>> 24;
  } else { id = 0x02; data = new Uint8Array(62); data.set(c, 0); }
  sending = true;
  d.sendReport(id, data).catch(e => { if (!DS._warned) { DS._warned = true; console.warn('DualSense output', e); } })
    .finally(() => { sending = false; if (again) { again = false; send(); } });
  if (on) { clearTimeout(stopTimer); stopTimer = setTimeout(() => send(), m.until - now + 5); }
}

// strong = low-frequency (left) motor, weak = high-frequency (right) motor, 0..1
export function rumble(strong, weak, ms) {
  const now = performance.now(), m = DS.motor;
  if (now < m.until) { m.strong = Math.max(m.strong, strong); m.weak = Math.max(m.weak, weak); m.until = Math.max(m.until, now + ms); }
  else { m.strong = strong; m.weak = weak; m.until = now + ms; }
  if (DS.live) { send(); return; }
  const gp = DS.gp; if (!gp) return;
  try {
    if (gp.vibrationActuator?.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
    else gp.hapticActuators?.[0]?.pulse?.(Math.min(1, Math.max(strong, weak)), ms);
  } catch {}
}
export const haptic = {
  tap() { rumble(0, 0.32, 28); },                                 // any pad button
  shot(k = 0.5) { rumble(0.3 + 0.65 * k, 0.55 + 0.4 * k, 55 + 110 * k); }, // k = weapon kick 0..1
  hit(k = 0.5) { rumble(0.5 + 0.5 * k, 0.2, 120 + 160 * k); },
};

// adaptive trigger state follows what R2 does right now; called every frame from pollInput
export function tickDualSense(aiming) {
  if (!DS.dev) return;
  const mode = window.__rr?.mode;
  let r = 'off', l = 'off';
  if (mode === 'space' || mode === 'atmo') r = 'ship';
  else if (mode === 'foot' || mode === 'jail' || mode === 'extract' || mode === 'station') {
    const g = G.hand && ITEMS[G.hand.id] && GUN[ITEMS[G.hand.id].gun];
    if (g) { r = g.pellets > 4 || g.rate >= 0.6 ? 'heavy' : g.rate < 0.2 ? 'auto' : 'semi'; l = 'aim'; }
  }
  if (r !== DS.trig.r || l !== DS.trig.l) { DS.trig.r = r; DS.trig.l = l; send(); }
}

// ---------- one-time permission panel (WebHID needs a click) ----------
let panel = null;
function hidePanel() { if (panel) { panel.remove(); panel = null; } }
export function offerDualSense() {
  if (DS.dev || panel || prefs.never || DS._offered) return;
  if (prefs.granted && performance.now() - initT < 4000) return;   // an already-allowed pad is still opening
  DS._offered = true;
  panel = document.createElement('div');
  panel.id = 'dsPanel';
  panel.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9999;max-width:330px;padding:12px 14px;border-radius:10px;background:rgba(12,16,22,.92);color:#e8eef5;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);border:1px solid rgba(120,170,255,.35)';
  if (DS.supported) {
    panel.innerHTML = '<b>DualSense found</b><br>Turn on gyro aiming (hold L2), rumble and adaptive triggers? The browser asks once.' +
      '<div style="margin-top:8px;display:flex;gap:8px"><button data-k="go" style="flex:1;padding:6px;border:0;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer">Connect DualSense</button><button data-k="no" style="padding:6px 10px;border:0;border-radius:6px;background:#334;color:#ccd;cursor:pointer">Not now</button></div>';
  } else {
    panel.innerHTML = '<b>DualSense found</b><br>Buttons and sticks work here. Gyro aiming and adaptive triggers need Chrome or Edge, which can talk to the pad directly.' +
      '<div style="margin-top:8px;display:flex;gap:8px"><button data-k="never" style="flex:1;padding:6px;border:0;border-radius:6px;background:#334;color:#ccd;cursor:pointer">Got it</button></div>';
  }
  panel.addEventListener('click', e => {
    const k = e.target?.dataset?.k; if (!k) return;
    if (k === 'go') requestDualSense().then(ok => { if (ok) hidePanel(); });
    if (k === 'no') hidePanel();
    if (k === 'never') { prefs.never = true; savePrefs(); hidePanel(); }
  });
  document.body.appendChild(panel);
  setTimeout(hidePanel, 30000);
}

let initT = 0;
export function initDualSense() {
  initT = performance.now();
  window.__ds = { DS, rumble, haptic, request: requestDualSense, setGain(g) { DS.gain = prefs.gain = g; savePrefs(); } };
  if (!navigator.hid) return;
  navigator.hid.getDevices().then(ds => { const d = ds.find(isDS); if (d) open(d); }).catch(() => {});
  navigator.hid.addEventListener('connect', e => { if (isDS(e.device)) open(e.device); });
  navigator.hid.addEventListener('disconnect', e => { if (e.device === DS.dev) { DS.dev = null; DS.pad = null; } });
}
