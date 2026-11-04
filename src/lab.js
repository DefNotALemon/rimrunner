// Material lab: every surface kind, metals, ground and a lamp under each Look, side by side. Same Look code as the game.
import * as THREE from '../vendor/three.module.js';
import { Look, LOOKS, LOOK_ORDER } from './look.js';
import { surfMat, boxUV, tex } from './textures.js';
import * as ML from './matlib.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
Look.init(renderer); Look.autoTier = false;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(50, 1, 0.1, 4000);
const sky = new THREE.Color(0x5a8fd8).lerp(new THREE.Color(0x1a3c8a), 0.35), hor = new THREE.Color(0x9fd0f0);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3226, 0.7), sun = new THREE.DirectionalLight(0xfff0d8, 2.4); scene.add(hemi, sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 14; sc.bottom = -10; sc.near = 1; sc.far = 80; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { z: { value: sky.clone() }, h: { value: hor.clone() } }, vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'varying vec3 d; uniform vec3 z,h; void main(){ float e=normalize(d).y; gl_FragColor=vec4(mix(h,z,pow(max(e,0.),0.5)),1.); }' });
const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), skyMat); scene.add(dome);
scene.fog = new THREE.Fog(0x9fd0f0, 150, 1200);

// ground: terrain-style (vertex colour x cloud map) beside asphalt + pavers
const g = new THREE.PlaneGeometry(60, 40, 30, 20); g.rotateX(-Math.PI / 2); { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = 0.34; c[i * 3 + 1] = 0.4; c[i * 3 + 2] = 0.22; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); const uv = g.attributes.uv; for (let i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 4); }
const gm = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.detail(), roughness: 0.96 }); gm.map.colorSpace = THREE.NoColorSpace;
const ground = new THREE.Mesh(g, gm); ground.receiveShadow = true; scene.add(ground);
const slab = (kind, color, x, z, w, d) => { const geo = boxUV(new THREE.BoxGeometry(w, 0.08, d), w, 0.08, d, 2); const m = new THREE.Mesh(geo, surfMat(kind, color)); m.position.set(x, 0.04, z); m.receiveShadow = true; scene.add(m); return m; };
slab('asphalt', 0xb0b0b0, 0, 8, 28, 6); slab('pavers', 0xb8b0a0, -8, 14, 12, 5); slab('floor', 0x9a7a58, 8, 14, 12, 5);

// wall samples
const KINDS = [['siding', 0xc9c4b8], ['siding', 0x4a7a9a], ['brick', 0xb86a4a], ['concrete', 0x9a9a98], ['plaster', 0xd8d2c4], ['roof', 0x6a3a2a], ['metal', 0x8a3a2a], ['hull', 0xb8bcc4], ['rust', 0xb08a6a], ['tile', 0xd0d0d0], ['floor', 0x9a7a58], ['pavers', 0xb8b0a0]];
const cvs = (t) => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(10,12,16,.7)'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#e6eef6'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.fillText(t, 128, 42); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
KINDS.forEach(([k, col], i) => {
  const x = (i - 5.5) * 2.5, w = 2.3, h = 3.2, d = 0.4; const geo = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 2);
  const m = new THREE.Mesh(geo, surfMat(k, col)); m.position.set(x, h / 2, -2); m.castShadow = m.receiveShadow = true; scene.add(m);
  const lb = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: cvs(k), transparent: true })); lb.position.set(x, 0.2, -1.78); scene.add(lb);
});

// matlib kit (cam 'Kit'): every panel style, LED modes, screens, decals, pipes, cables, glass
{
  const names = ML.styleNames();
  names.forEach((n, i) => { const w = 1.5, h = 2, d = 0.3, geo = ML.uvMeters(new THREE.BoxGeometry(w, h, d), new THREE.Matrix4().makeTranslation((i - 6) * 1.7, h / 2, -12)); const m = new THREE.Mesh(geo, ML.panelMat(n)); m.position.set((i - 6) * 1.7, h / 2, -12); m.castShadow = m.receiveShadow = true; scene.add(m);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: cvs(n), transparent: true })); lb.position.set((i - 6) * 1.7, 0.18, -11.83); scene.add(lb); });
  const row = new THREE.Group(); row.position.z = -10; scene.add(row); let x = -10;
  const box = (mat, w, h, d, px, py) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, 0); row.add(m); return m; };
  for (const mode of ['led', 'strip', 'pulse', 'blink', 'warn', 'flicker']) { box(ML.emissiveMat(ML.PAL.led.cyan, mode), 0.5, 0.18, 0.18, x, 0.5); box(ML.emissiveMat(ML.PAL.led.amber, mode), 0.5, 0.18, 0.18, x, 0.2); x += 0.7; }
  x += 0.4; for (const k of Object.keys(ML.SCREENS)) { const f = box(ML.panelMat('plate', ML.PAL.trim), 1.0, 0.8, 0.08, x, 0.8); const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), ML.screenMat(k, Object.keys(ML.SCREENS).indexOf(k))); sc.position.set(x, 0.8, 0.045); row.add(sc); x += 1.1; }
  x += 0.3; const dn = Object.keys(ML.decalTextures()); const wallM = ML.panelMat('panel'); for (const k of dn) { const wall = box(wallM, 0.8, 0.8, 0.05, x, 0.6); wall.geometry = ML.uvMeters(new THREE.BoxGeometry(0.8, 0.8, 0.05), new THREE.Matrix4().makeTranslation(x, 0.6, -10)); const d = ML.decalMesh(k, k === 'stripe' || k === 'plate' ? 0.8 : 0.7, k === 'stripe' ? 0.2 : k === 'plate' ? 0.4 : 0.7); d.position.set(x, 0.6, 0.03); row.add(d); x += 0.9; }
  const dm = ML.decalNumber('04-B'); const dd = new THREE.Mesh(new THREE.PlaneGeometry(0.8 * dm.userData.aspect / 2, 0.4), dm); dd.position.set(x, 0.6, 0.03); row.add(dd); box(wallM, 0.9, 0.9, 0.05, x, 0.6).position.z = 0; x += 1.2;
  for (const [k, c] of [['steel'], ['painted'], ['copper'], ['insulated']]) { const p = new THREE.Mesh(ML.pipeGeo(0.07, 1.4), ML.pipeMat(k)); p.position.set(x, 0.7, 0.2); row.add(p); x += 0.3; }
  for (const c of [0x1c1e22, PAL_C(0xb5382d), PAL_C(0xe2b422)]) { const cb = new THREE.Mesh(ML.cableGeo(new THREE.Vector3(x, 1.4, 0.2), new THREE.Vector3(x + 1.2, 1.4, 0.2), { radius: 0.02, sag: 0.25 }), ML.wireMat(c)); row.add(cb); x += 0.0; }
  const gl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.04), ML.glassMat()); gl.position.set(x + 1.6, 0.7, 0.2); row.add(gl);
}
function PAL_C(c) { return c; }
// material balls: polished / brushed / painted / rough / wet-ish dielectric
const ball = (x, o) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.7, 48, 32), new THREE.MeshStandardMaterial(o)); m.position.set(x, 0.7, 2.6); m.castShadow = m.receiveShadow = true; scene.add(m); };
ball(-6, { color: 0xdde2ea, metalness: 1, roughness: 0.06 }); ball(-4.2, { color: 0xc8ccd2, metalness: 1, roughness: 0.32 }); ball(-2.4, { color: 0xb8863a, metalness: 1, roughness: 0.2 }); ball(-0.6, { color: 0x2a5a8a, metalness: 0.05, roughness: 0.25 });
ball(1.2, { color: 0xa83a2a, metalness: 0.0, roughness: 0.6 }); ball(3.0, { color: 0xe8e4da, metalness: 0.0, roughness: 0.9 }); ball(4.8, { color: 0x30343a, metalness: 0.6, roughness: 0.5 });
// emissive window box + lamp post for night
const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.1), new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0xffc66a, emissiveIntensity: 1.0 })); win.position.set(7.5, 1.5, 5.8); scene.add(win);
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.4, 8), new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.5, roughness: 0.5 })); post.position.set(-10, 2.2, 7); post.castShadow = true; scene.add(post);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })); bulb.position.set(-10, 4.5, 7); scene.add(bulb);
const lamp = new THREE.PointLight(0xffe2b0, 0, 28, 1.6); lamp.position.set(-10, 4.4, 7); scene.add(lamp);
const lamp2 = new THREE.PointLight(0xff6a9a, 0, 16, 1.6); lamp2.position.set(10, 3.2, 9); scene.add(lamp2);

// day cycle (same formulas as Surface.timeOfDay)
let L = 0.8; const sunDir = new THREE.Vector3();
function tod(v) {
  const el = -0.35 + v * 1.35; L = Math.max(0, Math.min(1, el * 1.6 + 0.3)); sunDir.set(0.5, Math.max(-0.2, el), 0.3).normalize();
  const horC = hor.clone().multiplyScalar(0.1 + 0.9 * L); if (L < 0.5 && L > 0.05) horC.lerp(new THREE.Color(0xff8a50), (0.5 - Math.abs(L - 0.25) * 2) * 0.35);
  skyMat.uniforms.h.value.copy(horC); skyMat.uniforms.z.value.copy(sky).multiplyScalar(0.15 + 0.85 * L); scene.fog.color.copy(horC);
  hemi.intensity = 0.3 + 1.7 * L; hemi.color.copy(sky.clone().lerp(new THREE.Color(0xffffff), 0.4)); sun.intensity = 2.8 * Math.min(1, L * 1.3) + 0.05; sun.color.set(L < 0.45 ? 0xffb070 : 0xfff3df);
  win.material.emissiveIntensity = (1 - L) * 3 + 0.05; lamp.intensity = (1 - L) * 60 * Look.cfg.lamp; lamp2.intensity = (1 - L) * 40 * Look.cfg.lamp; bulb.visible = L < 0.6;
  lamp.color.setHex(0xffe2b0).offsetHSL(Look.cfg.lampWarm * -0.03, 0, 0);
  sun.position.copy(sunDir).multiplyScalar(60); sun.target.position.set(0, 0, 4);
  document.getElementById('tl').textContent = L > 0.7 ? '· day' : L > 0.35 ? '· low sun' : L > 0.12 ? '· dusk' : '· night';
  Look.day = L; Look.skyEnv(scene, { L, sunDir, uSky: sky, uHor: hor, air: true, pal: [0.34, 0.4, 0.22], seed: 1, indoor: 0 }); Look.balance(hemi, sun, 0);
}
// UI
const $ = id => document.getElementById(id), mkBtn = (host, label, v, fn) => { const b = document.createElement('button'); b.textContent = label; b.dataset.v = v; b.onclick = () => fn(v); host.appendChild(b); return b; };
LOOK_ORDER.forEach(id => mkBtn($('looks'), LOOKS[id].name, id, v => { Look.set(v); refresh(); }));
for (const b of $('src').children) b.onclick = () => { if (Look.source !== b.dataset.v) Look.toggleSource(); refresh(); };
for (const b of $('fx').children) b.onclick = () => { Look.setTier(b.dataset.v); refresh(); };
const CAMS = { Walls: [[0, 5.5, 21], [0, 1.4, -2]], 'Close wall': [[-4.5, 1.6, 1.6], [-4.5, 1.5, -2]], Metals: [[0, 1.8, 8], [-0.5, 0.8, 2.6]], Ground: [[2, 1.4, 14], [0, 0, 6]], Overview: [[0, 9, 22], [0, 0.5, 2]], Kit: [[0, 6.5, 5], [0, 1.2, -11]], 'Kit close': [[-8, 2.4, -6], [-8, 1.1, -11]], 'Kit panels': [[0, 3.2, -4.5], [0, 1.0, -12]], Lamp: [[-6, 2.2, 13], [-10, 2, 7]] };
let orb = { th: 0, ph: 0, r: 0, c: new THREE.Vector3() }; function goCam(n) { const [p, t] = CAMS[n]; const v = new THREE.Vector3(...p).sub(new THREE.Vector3(...t)); orb.c.set(...t); orb.r = v.length(); orb.th = Math.atan2(v.x, v.z); orb.ph = Math.asin(v.y / orb.r); }
for (const n in CAMS) mkBtn($('cams'), n, n, goCam); goCam('Walls');
$('tod').oninput = e => { Look._envKey = null; tod(+e.target.value); }; Look.onChange = () => { refresh(); tod(+$('tod').value); };
function refresh() { for (const b of $('looks').children) b.classList.toggle('on', b.dataset.v === Look.id); for (const b of $('src').children) b.classList.toggle('on', b.dataset.v === Look.source); for (const b of $('fx').children) b.classList.toggle('on', b.dataset.v === Look.tier); $('blurb').textContent = Look.cfg.blurb; }
const q = new URLSearchParams(location.search); if (q.get('t')) $('tod').value = q.get('t'); if (q.get('cam') && CAMS[q.get('cam')]) goCam(q.get('cam'));
// orbit
let drag = null; canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointerup', () => drag = null); canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.pan) { const right = new THREE.Vector3(Math.cos(orb.th), 0, -Math.sin(orb.th)); orb.c.addScaledVector(right, -dx * 0.01 * orb.r * 0.1); orb.c.y += dy * 0.01 * orb.r * 0.1; } else { orb.th -= dx * 0.005; orb.ph = Math.max(-0.2, Math.min(1.4, orb.ph + dy * 0.005)); } });
canvas.addEventListener('wheel', e => { e.preventDefault(); orb.r = Math.max(1.2, Math.min(80, orb.r * (1 + e.deltaY * 0.001))); }, { passive: false });
function resize() { renderer.setSize(innerWidth, innerHeight, false); Look.resize(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } addEventListener('resize', resize); resize();
let last = performance.now(); refresh(); tod(+$('tod').value);
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  camera.position.set(orb.c.x + Math.sin(orb.th) * Math.cos(orb.ph) * orb.r, orb.c.y + Math.sin(orb.ph) * orb.r, orb.c.z + Math.cos(orb.th) * Math.cos(orb.ph) * orb.r); camera.lookAt(orb.c); dome.position.copy(camera.position); if (innerWidth > 900) camera.setViewOffset(innerWidth, innerHeight, -150, 0, innerWidth, innerHeight); else camera.clearViewOffset();
  Look.render(scene, camera, dt); requestAnimationFrame(frame);
}
window.__lab = { Look, scene, camera, orb, tod, goCam }; requestAnimationFrame(frame);
