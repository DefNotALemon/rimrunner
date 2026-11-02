// Tiny WebAudio synth: no asset files needed
let ctx = null, master = null;
export function audioInit() {
  if (ctx) { ctx.state === 'suspended' && ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination); } catch (e) {}
}
function noiseBuf() { const b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
let nb;
export function sfx(kind, vol = 1) {
  if (!ctx) return; const t = ctx.currentTime;
  const g = ctx.createGain(); g.connect(master);
  if (kind === 'shot' || kind === 'shotgun' || kind === 'rifle') {
    nb = nb || noiseBuf(); const s = ctx.createBufferSource(); s.buffer = nb; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'shotgun' ? 1400 : 3200;
    const dur = kind === 'shotgun' ? 0.28 : 0.16; g.gain.setValueAtTime(vol * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(f); f.connect(g); s.start(t); s.stop(t + dur);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); const og = ctx.createGain(); og.gain.setValueAtTime(vol * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.14); o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.15);
  } else if (kind === 'laser') {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.12); g.gain.setValueAtTime(vol * 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13); o.connect(g); o.start(t); o.stop(t + 0.14);
  } else if (kind === 'step') {
    nb = nb || noiseBuf(); const s = ctx.createBufferSource(); s.buffer = nb; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500 + Math.random() * 200; g.gain.setValueAtTime(vol * 0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07); s.connect(f); f.connect(g); s.start(t); s.stop(t + 0.08);
  } else if (kind === 'ui' || kind === 'coin' || kind === 'good' || kind === 'warn') {
    const o = ctx.createOscillator(); o.type = kind === 'warn' ? 'square' : 'triangle'; const f0 = { ui: 640, coin: 1200, good: 880, warn: 180 }[kind]; o.frequency.setValueAtTime(f0, t); if (kind === 'coin' || kind === 'good') o.frequency.setValueAtTime(f0 * 1.5, t + 0.06);
    g.gain.setValueAtTime(vol * 0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16); o.connect(g); o.start(t); o.stop(t + 0.18);
  } else if (kind === 'mine') {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90 + Math.random() * 30; g.gain.setValueAtTime(vol * 0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g); o.start(t); o.stop(t + 0.13);
  } else if (kind === 'siren') {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(600, t); o.frequency.linearRampToValueAtTime(900, t + 0.4); g.gain.setValueAtTime(vol * 0.06, t); g.gain.linearRampToValueAtTime(0, t + 0.45); o.connect(g); o.start(t); o.stop(t + 0.46);
  } else if (kind === 'zip') {
    nb = nb || noiseBuf(); const s = ctx.createBufferSource(); s.buffer = nb; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(2400, t + 0.3); g.gain.setValueAtTime(vol * 0.2, t); g.gain.linearRampToValueAtTime(0, t + 0.32); s.connect(f); f.connect(g); s.start(t); s.stop(t + 0.35);
  }
}
