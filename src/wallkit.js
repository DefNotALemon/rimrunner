// Wall kit: modular wall dressing (1 m / 2 m panels, rails, skirting, crown, pipes, racks, screens, wiring) in a handful of styles.
// Static pieces go into the caller's interior-kit Batch (merged vertex-coloured meshes). Anything alive (blinking LEDs, flickering
// lamps, animated monitors, sparks, steam) lives in a few shared-material meshes driven by ONE time uniform, so nothing is updated
// per mesh from JS. Pieces sit on a wall face in a local frame: s along the wall, y up, d out of the wall into the room.
import * as THREE from '../vendor/three.module.js';
import { STYLES, STYLE_OF_ROOM } from './wallstyles.js';

export { STYLE_OF_ROOM };
const UPV = new THREE.Vector3(0, 1, 0);
const _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color();
export const WK = { t: { value: 0 }, frames: 0 };
const tick = () => { WK.t.value = (performance.now() / 1000) % 7200; };

// ------------------------------------------------------------ unit geometry (non-indexed; boxes drop the back face that sits on the wall)
export const G = {};
(() => {
  const nb = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), P = nb.attributes.position, N = nb.attributes.normal, U = nb.attributes.uv, p = [], n = [], u = [];
  for (let i = 0; i < P.count; i += 3) { if (N.getZ(i) < -0.5) continue; for (let k = 0; k < 3; k++) { p.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k)); n.push(N.getX(i + k), N.getY(i + k), N.getZ(i + k)); u.push(U.getX(i + k), U.getY(i + k)); } }
  G.box = new THREE.BufferGeometry(); G.box.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); G.box.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); G.box.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  G.cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1).toNonIndexed(); G.cyl6 = new THREE.CylinderGeometry(1, 1, 1, 6, 1).toNonIndexed();
  G.quad = new THREE.PlaneGeometry(1, 1).toNonIndexed(); G.tor = new THREE.TorusGeometry(1, 0.14, 5, 12).toNonIndexed(); G.sph = new THREE.SphereGeometry(1, 8, 6).toNonIndexed();
})();

// ------------------------------------------------------------ shared animated materials (one program each, one shared time uniform)
const ANIM = `float wkH(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
float wkAnim(vec3 a,float t){float m=a.y,ph=a.x,sp=a.z;
 if(m<0.5)return 1.0;
 if(m<1.5)return 0.12+0.88*step(0.5,fract(t*sp+ph));
 if(m<2.5)return clamp(0.5+0.5*sin(t*sp*6.2832+ph*6.2832),0.08,1.0);
 if(m<3.5){float k=floor(t*7.0*sp+ph*40.0);float f=wkH(k);return f>0.8?0.1+0.35*wkH(k+1.7):0.88+0.12*wkH(k+3.1);}
 if(m<4.5){float k=floor(t*sp*3.0+ph*97.0);return 0.1+0.9*step(0.45,wkH(k));}
 return 1.0;}`;
function patchAnim(mat, mapped) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.wkT = WK.t;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aA;\nvarying vec3 vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA=aA;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float wkT;\nvarying vec3 vA;\n' + ANIM)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=wkAnim(vA,wkT);' + (mapped ? '\ndiffuseColor.rgb*=0.88+0.12*sin(vMapUv.y*260.0+wkT*6.0);' : ''));
  };
  mat.customProgramCacheKey = () => 'wkanim' + (mapped ? 1 : 0);
  return mat;
}
let LEDMAT = null; const ledMat = () => LEDMAT || (LEDMAT = patchAnim(new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), false));

// particles: sparks + steam, positions computed in the vertex shader from the shared time (no CPU per frame)
const PART_V = `attribute vec3 aN;attribute vec3 aE;varying float vAl;uniform float wkT;uniform float wkKind;
float ph(float x){return fract(sin(x*91.7+17.3)*43758.5453);}`;
function particleMat(spark) {
  const m = new THREE.PointsMaterial({ size: spark ? 0.045 : 0.5, sizeAttenuation: true, transparent: true, depthWrite: false, vertexColors: false, color: spark ? 0xffb050 : 0xb8c2c8, opacity: spark ? 1 : 0.5, blending: spark ? THREE.AdditiveBlending : THREE.NormalBlending });
  m.onBeforeCompile = sh => {
    sh.uniforms.wkT = WK.t; sh.uniforms.wkKind = { value: spark ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + PART_V)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
 float per=aE.y, cyc=fract(wkT/per+aE.x); float sd=aE.z; float age; float szm=1.0;
 if(wkKind>0.5){ age=cyc/0.1; if(age>1.0){vAl=0.0;szm=0.0;age=1.0;} else vAl=1.0-age*age;
   vec3 dir=normalize(aN*1.3+vec3(ph(sd)-0.5,ph(sd+2.1)*0.6-0.2,ph(sd+4.3)-0.5)*1.7);
   transformed+=dir*age*(1.0+ph(sd+7.0))*1.2+vec3(0.0,-3.2*age*age*0.35,0.0); }
 else { age=cyc; vAl=sin(age*3.14159)*0.9; szm=0.4+age*1.8; transformed+=aN*age*0.35+vec3(ph(sd)-0.5,0.0,ph(sd+1.0)-0.5)*0.15*age+vec3(0.0,age*0.9,0.0); }`)
      .replace('gl_PointSize = size;', 'gl_PointSize = size*szm;').replace('uniform float size;', 'uniform float size;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAl;').replace('#include <color_fragment>', '#include <color_fragment>\n float dd=length(gl_PointCoord-0.5); if(dd>0.5||vAl<0.01) discard; diffuseColor.a*=vAl*(1.0-dd*2.0);');
  };
  m.customProgramCacheKey = () => 'wkpart' + (spark ? 1 : 0);
  return m;
}

// animated screens: 7 content variants, each one canvas with four different "monitors" (2x2); quads sample one quadrant
export const SCREEN_VARIANTS = ['term', 'graph', 'bars', 'ecg', 'radar', 'sys', 'alert'];
const SCR = {};
const hh = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const DRAW = {
  term(x, t, q) { x.fillStyle = '#021208'; x.fillRect(0, 0, 256, 160); x.font = '9px monospace'; const off = Math.floor(t * 3 + q * 5);
    for (let i = 0; i < 12; i++) { const k = off + i; const len = 8 + (hh(k * 3.1) * 22 | 0); let s = '0x' + ((hh(k) * 65535) | 0).toString(16).padStart(4, '0') + ' '; for (let j = 0; j < len; j++) s += '0123456789ABCDEF'[(hh(k + j * 0.37) * 16) | 0]; x.fillStyle = hh(k + 9) > 0.85 ? '#ffd24a' : '#4dff9a'; x.fillText(s.slice(0, 40), 6, 14 + i * 12); }
    if (Math.floor(t * 2) % 2) { x.fillStyle = '#9bffc4'; x.fillRect(6, 150, 6, 8); } },
  graph(x, t, q) { x.fillStyle = '#04101c'; x.fillRect(0, 0, 256, 160); x.strokeStyle = '#12304a'; x.lineWidth = 1; for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 160); x.stroke(); } for (let i = 1; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(256, i * 32); x.stroke(); }
    for (const [c, a] of [['#38c8ff', 0], ['#ff9a3a', 1.7]]) { x.strokeStyle = c; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= 64; i++) { const px = i * 4, v = 80 + Math.sin(i * 0.23 + t * 0.9 + q + a) * 28 + Math.sin(i * 0.71 + t * 1.7 + a) * 14 + (hh(i + Math.floor(t * 4) * 7 + q) - 0.5) * 10; i ? x.lineTo(px, v) : x.moveTo(px, v); } x.stroke(); } },
  bars(x, t, q) { x.fillStyle = '#10080a'; x.fillRect(0, 0, 256, 160); for (let i = 0; i < 14; i++) { const v = 0.15 + 0.85 * Math.abs(Math.sin(t * (0.8 + hh(i + q) * 1.6) + i * 1.3 + q)); const h = v * 130; x.fillStyle = v > 0.82 ? '#ff4a3a' : v > 0.6 ? '#ffc23a' : '#58ff7a'; x.fillRect(10 + i * 17, 150 - h, 12, h); } },
  ecg(x, t, q) { x.fillStyle = '#021208'; x.fillRect(0, 0, 256, 160); x.strokeStyle = '#0b3a1c'; x.lineWidth = 1; for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, 160); x.stroke(); }
    x.strokeStyle = '#6dff9a'; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= 256; i += 2) { const ph = ((i / 256) * 2.2 - t * 0.7 * (0.9 + q * 0.1)) % 1, p = ph < 0 ? ph + 1 : ph; let v = 0; if (p > 0.1 && p < 0.16) v = 10; if (p > 0.22 && p < 0.25) v = -8; if (p >= 0.25 && p < 0.29) v = 60; if (p >= 0.29 && p < 0.33) v = -26; if (p > 0.45 && p < 0.57) v = 16 * Math.sin((p - 0.45) / 0.12 * Math.PI); const y = 90 - v; i ? x.lineTo(i, y) : x.moveTo(i, y); } x.stroke();
    x.fillStyle = '#6dff9a'; x.font = 'bold 22px monospace'; x.fillText(String(58 + ((hh(Math.floor(t * 0.7) + q) * 40) | 0)), 14, 30); },
  radar(x, t, q) { x.fillStyle = '#021310'; x.fillRect(0, 0, 256, 160); x.strokeStyle = '#0f5a48'; x.lineWidth = 1; for (const r of [25, 50, 75]) { x.beginPath(); x.arc(128, 80, r, 0, 7); x.stroke(); }
    const a = t * 1.6 + q; x.strokeStyle = '#4dffd0'; x.lineWidth = 2; x.beginPath(); x.moveTo(128, 80); x.lineTo(128 + Math.cos(a) * 78, 80 + Math.sin(a) * 78); x.stroke(); x.fillStyle = '#c8fff0'; for (let i = 0; i < 4; i++) { const ba = hh(i + q * 4) * 6.28, bd = 20 + hh(i * 3 + q) * 50; x.fillRect(128 + Math.cos(ba) * bd, 80 + Math.sin(ba) * bd, 4, 4); } },
  sys(x, t, q) { x.fillStyle = '#080c18'; x.fillRect(0, 0, 256, 160); for (let i = 0; i < 7; i++) { const v = 0.5 + 0.5 * Math.sin(t * (0.3 + hh(i + q * 9) * 0.9) + i * 2.1); x.fillStyle = '#16213a'; x.fillRect(30, 12 + i * 21, 200, 10); x.fillStyle = v > 0.85 ? '#ff6a4a' : '#4aa8ff'; x.fillRect(30, 12 + i * 21, 200 * v, 10); x.fillStyle = hh(i + Math.floor(t * 0.5) + q) > 0.3 ? '#58ff7a' : '#ff4a3a'; x.fillRect(10, 12 + i * 21, 10, 10); } },
  alert(x, t, q) { const on = Math.floor(t * 2 + q) % 2; x.fillStyle = on ? '#3a0606' : '#160404'; x.fillRect(0, 0, 256, 160); x.strokeStyle = '#ff3a2a'; x.lineWidth = 6; x.beginPath(); x.moveTo(128, 30); x.lineTo(180, 120); x.lineTo(76, 120); x.closePath(); x.stroke(); x.fillStyle = '#ff3a2a'; x.fillRect(125, 60, 6, 32); x.fillRect(125, 99, 6, 8);
    x.strokeStyle = 'rgba(255,60,40,.35)'; x.lineWidth = 3; for (let i = -4; i < 14; i++) { x.beginPath(); x.moveTo(i * 24, 0); x.lineTo(i * 24 - 60, 160); x.stroke(); } },
};
function scrMat(v) {
  if (SCR[v]) return SCR[v];
  const e = SCR[v] = { last: -9, tex: null, mat: null };
  try { const c = document.createElement('canvas'); c.width = 512; c.height = 320; e.cv = c; e.cx = c.getContext('2d'); e.tex = new THREE.CanvasTexture(c); e.tex.colorSpace = THREE.SRGBColorSpace; e.tex.minFilter = THREE.LinearFilter; e.tex.generateMipmaps = false; } catch (_) { e.tex = null; }
  e.mat = patchAnim(new THREE.MeshBasicMaterial({ vertexColors: true, map: e.tex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), true);
  e.redraw = now => { if (!e.cx || now - e.last < 0.34) return; e.last = now; try { for (let q = 0; q < 4; q++) { const x = e.cx; x.save(); x.translate((q & 1) * 256, (q >> 1) * 160); x.beginPath(); x.rect(0, 0, 256, 160); x.clip(); DRAW[v](x, now, q); x.restore(); } e.tex.needsUpdate = true; } catch (err) { console.warn('wallkit screen', v, err.message); e.cx = null; } };
  return e;
}

// decal atlas (alpha): streaks, soot, hazard, stains, scratches, leak
let DECAL = null;
function decalMat() {
  if (DECAL) return DECAL;
  let tex = null;
  try {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
    const cell = (i, f) => { x.save(); x.translate((i % 4) * 128, ((i / 4) | 0) * 128); x.beginPath(); x.rect(0, 0, 128, 128); x.clip(); f(); x.restore(); };
    cell(0, () => { for (let i = 0; i < 9; i++) { const px = 14 + i * 12 + hh(i) * 6, g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(90,50,20,0)'); g.addColorStop(0.2, `rgba(90,50,20,${0.35 + hh(i + 3) * 0.4})`); g.addColorStop(1, 'rgba(60,30,10,0)'); x.fillStyle = g; x.fillRect(px, 0, 2 + hh(i + 1) * 4, 128 * (0.5 + hh(i + 2) * 0.5)); } });
    cell(1, () => { const g = x.createRadialGradient(64, 100, 4, 64, 80, 70); g.addColorStop(0, 'rgba(0,0,0,.85)'); g.addColorStop(0.6, 'rgba(10,8,6,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
    cell(2, () => { x.fillStyle = '#e8b800'; x.fillRect(0, 36, 128, 56); x.fillStyle = '#16161a'; for (let i = -4; i < 12; i++) { x.beginPath(); x.moveTo(i * 20, 36); x.lineTo(i * 20 + 10, 36); x.lineTo(i * 20 - 12, 92); x.lineTo(i * 20 - 22, 92); x.closePath(); x.fill(); } });
    cell(3, () => { for (let i = 0; i < 5; i++) { const g = x.createRadialGradient(40 + i * 12, 70 + (i % 2) * 14, 2, 40 + i * 12, 70, 30 + hh(i) * 20); g.addColorStop(0, 'rgba(20,16,10,.5)'); g.addColorStop(1, 'rgba(20,16,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); } });
    cell(4, () => { x.strokeStyle = 'rgba(210,210,200,.5)'; x.lineWidth = 1; for (let i = 0; i < 14; i++) { x.beginPath(); const a = hh(i) * 128, b = hh(i + 5) * 128; x.moveTo(a, b); x.lineTo(a + 20 + hh(i + 2) * 40, b + (hh(i + 7) - 0.5) * 22); x.stroke(); } });
    cell(5, () => { const g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.5, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); });
    cell(6, () => { x.fillStyle = 'rgba(200,205,210,.9)'; x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 1; const dot = (px, py) => { x.beginPath(); x.arc(px, py, 2.4, 0, 7); x.fill(); x.stroke(); }; for (let i = 8; i <= 120; i += 14) { dot(i, 8); dot(i, 120); } for (let j = 22; j <= 106; j += 14) { dot(8, j); dot(120, j); } x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; x.strokeRect(2, 2, 124, 124); });
    cell(7, () => { for (let i = 0; i < 3; i++) { const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(40,70,60,0)'); g.addColorStop(0.15, 'rgba(40,70,60,.5)'); g.addColorStop(1, 'rgba(40,70,60,0)'); x.fillStyle = g; x.fillRect(30 + i * 30, 0, 5 + i * 2, 128); } });
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  } catch (_) { tex = null; }
  DECAL = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return DECAL;
}

// ------------------------------------------------------------ accumulators (per 24 m cell)
class Acc {
  constructor() { this.p = []; this.n = []; this.c = []; this.a = []; this.uv = []; }
  add(g, m, col, an, uvr) {
    _nm.getNormalMatrix(m); _c.set(col); const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z); _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); this.n.push(_n.x, _n.y, _n.z); this.c.push(_c.r, _c.g, _c.b);
      if (an) this.a.push(an[0], an[1], an[2]);
      if (uvr && U) this.uv.push(uvr[0] + U.getX(i) * (uvr[2] - uvr[0]), uvr[1] + U.getY(i) * (uvr[3] - uvr[1]));
    }
  }
  geo() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.a.length) g.setAttribute('aA', new THREE.Float32BufferAttribute(this.a, 3)); if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); return g;
  }
}
const CELL = 24;

// ------------------------------------------------------------ a wall face
export class Face {
  // (ox,oz): point on the finished wall surface at run coordinate 0; (nx,nz): unit normal into the room; (rx,rz): world direction of increasing run coordinate
  constructor(kit, ox, oz, nx, nz, rx, rz) {
    this.k = kit; this.ox = ox; this.oz = oz; this.nx = nx; this.nz = nz; this.ax = nz; this.az = -nx; this.sg = Math.round(this.ax * rx + this.az * rz) || 1;
    this.M = new THREE.Matrix4().makeBasis(new THREE.Vector3(this.ax, 0, this.az), UPV, new THREE.Vector3(nx, 0, nz)).setPosition(ox, 0, oz);
  }
  range(c0, c1) { const a = c0 * this.sg, b = c1 * this.sg; return a < b ? [a, b] : [b, a]; }
  tf(s, y, d, rx, ry, rz, sx, sy, sz) { _e.set(rx, ry, rz); _q.setFromEuler(_e); return _l.compose(_p.set(s, y, d), _q, _s.set(sx, sy, sz)).premultiply(this.M); }
  prim(kind, g, col, m) { this.k.bt.put(kind, g, m, col); this.k.stats.v += g.attributes.position.count; }
  box(kind, col, s0, s1, y0, y1, d0, d1) { this.prim(kind, G.box, col, this.tf((s0 + s1) / 2, (y0 + y1) / 2, (d0 + d1) / 2, 0, 0, 0, Math.max(s1 - s0, 1e-3), Math.max(y1 - y0, 1e-3), Math.max(d1 - d0, 1e-3))); }
  rbox(kind, col, s, y, d, w, h, t, rz) { this.prim(kind, G.box, col, this.tf(s, y, d, 0, 0, rz, w, h, t)); }   // box rotated about the wall normal
  cylS(kind, col, s0, s1, y, d, r, seg = 12) { this.prim(kind, seg > 8 ? G.cyl : G.cyl6, col, this.tf((s0 + s1) / 2, y, d, 0, 0, Math.PI / 2, r, Math.abs(s1 - s0), r)); }
  cylY(kind, col, s, d, y0, y1, r, seg = 12) { this.prim(kind, seg > 8 ? G.cyl : G.cyl6, col, this.tf(s, (y0 + y1) / 2, d, 0, 0, 0, r, y1 - y0, r)); }
  cylD(kind, col, s, y, d0, d1, r, seg = 12) { this.prim(kind, seg > 8 ? G.cyl : G.cyl6, col, this.tf(s, y, (d0 + d1) / 2, Math.PI / 2, 0, 0, r, d1 - d0, r)); }
  torus(kind, col, s, y, d, r) { this.prim(kind, G.tor, col, this.tf(s, y, d, 0, 0, 0, r, r, r * 1.2)); }
  tube(pts, r, col, kind = 'matte', n = 8) {   // pts: [[s,y,d],...] smooth wire
    const cu = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.4), g = new THREE.TubeGeometry(cu, n, r, 4, false).toNonIndexed();
    this.k.bt.put(kind, g, this.M, col); this.k.stats.v += g.attributes.position.count; g.dispose();
  }
  wire(s0, y0, s1, y1, d, sag, r, col) { const sm = (s0 + s1) / 2; this.tube([[s0, y0, d], [sm, Math.min(y0, y1) - sag, d + 0.02], [s1, y1, d]], r, col, 'matte', 7); }
  hang(s, y0, len, d, r, col, sway = 0.06) { this.tube([[s, y0, d], [s + sway, y0 - len * 0.4, d + 0.03], [s - sway * 0.6, y0 - len * 0.75, d + 0.05], [s + sway * 0.3, y0 - len, d + 0.04]], r, col, 'matte', 5); }
  // ---- alive pieces
  led(s, y, w, h, col, mode = 1, sp = 1, ph = 0, d = 0.02, dep = 0.012) { const flat = dep <= 0.008; this.k.acc(this.k.led, this.ox + this.ax * s, this.oz + this.az * s).add(flat ? G.quad : G.box, flat ? this.tf(s, y, d + dep, 0, 0, 0, w, h, 1) : this.tf(s, y, d + dep / 2, 0, 0, 0, w, h, dep), col, [ph, mode, sp]); this.k.stats.v += flat ? 6 : 30; this.k.stats.led++; }
  screen(s, y, w, h, variant, mode = 0, d = 0.04) {
    const k = this.k, q = (k.r() * 4) | 0, u0 = (q & 1) * 0.5, v0 = 0.5 * (1 - (q >> 1));
    this.k.acc(this.k.scr[variant] || (this.k.scr[variant] = new Map()), this.ox + this.ax * s, this.oz + this.az * s).add(G.quad, this.tf(s, y, d, 0, 0, 0, w, h, 1), mode === 3 ? 0xffffff : 0xe8e8e8, [k.r(), mode, 0.7 + k.r() * 0.6], [u0, v0, u0 + 0.5, v0 + 0.5]); k.stats.v += 6; k.stats.scr++;
  }
  decal(i, s, y, w, h, d = 0.02, col = 0xffffff) { this.k.acc(this.k.dec, this.ox + this.ax * s, this.oz + this.az * s).add(G.quad, this.tf(s, y, d, 0, 0, 0, w, h, 1), col, null, [(i % 4) / 4, 1 - (((i / 4) | 0) + 1) / 2, (i % 4) / 4 + 0.25, 1 - ((i / 4) | 0) / 2]); this.k.stats.v += 6; }
  spark(s, y, d = 0.06) { if (this.k.spk.length >= 40 * 8) return; const [wx, , wz] = [this.ox + this.ax * s + this.nx * d, 0, this.oz + this.az * s + this.nz * d], ph = this.k.r(), per = 1.8 + this.k.r() * 4.5, sd = this.k.r() * 100; for (let i = 0; i < 8; i++) this.k.spk.push([wx, y, wz, this.nx, 0.15, this.nz, ph, per, sd + i * 3.7]); }
  steam(s, y, d = 0.08) { if (this.k.stm.length >= 24 * 6) return; const wx = this.ox + this.ax * s + this.nx * d, wz = this.oz + this.az * s + this.nz * d, ph = this.k.r(), per = 2.2 + this.k.r() * 1.2, sd = this.k.r() * 100; for (let i = 0; i < 6; i++) this.k.stm.push([wx, y, wz, this.nx, 0.2, this.nz, ph + i / 6, per, sd + i * 5.1]); }
  fan(s, y, r, d = 0.05) {   // slow spinning blades (a few real meshes, rotated in onBeforeRender)
    if (this.k.fans.length >= 28) return; this.cylD('metal', 0x2a2d32, s, y, 0, 0.04, r * 1.08); this.cylD('matte', 0x0a0b0d, s, y, 0.04, 0.05, r);
    this.k.fans.push({ pos: [this.ox + this.ax * s + this.nx * (d + 0.02), y, this.oz + this.az * s + this.nz * (d + 0.02)], n: [this.nx, 0, this.nz], r, sp: 0.7 + this.k.r() * 1.2 }); this.k.stats.fans++;
  }
}

// ------------------------------------------------------------ the kit
export class WallKit {
  constructor(bt, r) { this.bt = bt; this.r = r; this.led = new Map(); this.scr = {}; this.dec = new Map(); this.spk = []; this.stm = []; this.fans = []; this.stats = { v: 0, led: 0, scr: 0, fans: 0, mods: 0 }; }
  acc(map, x, z) { const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL); let a = map.get(k); if (!a) map.set(k, a = new Acc()); return a; }
  face(ox, oz, nx, nz, rx, rz) { return new Face(this, ox, oz, nx, nz, rx, rz); }
  // dress the run range [c0,c1] of face f. o: {style, top, wall, dado, acc, dmg, dens}
  dress(f, c0, c1, o) {
    const st = STYLES[o.style] || STYLES.corp, r = this.r, top = o.top ?? 2.8;
    let [s0, s1] = f.range(c0, c1); s0 += 0.1; s1 -= 0.1; if (s1 - s0 < 0.45 || (top < 1.6 && !o.low)) return;
    const low = !!o.low, Q = { top: low ? 0.86 : top, yl: 0.14, yr0: low ? 0.74 : 1.02, yr1: low ? 0.82 : 1.12, yu0: low ? 0.82 : 1.12, yu1: low ? 0.82 : top - 0.14, wall: o.wall, dado: o.dado, acc: o.acc, dmg: o.dmg || 0, dens: o.dens ?? 0.6, r, kit: this, w: s1 - s0, s0, s1, st };
    const v0 = this.stats.v; st.base(f, s0, s1, Q);
    // modules: 2 m / 1 m panels, last one absorbs the remainder
    let c = s0; const list = [];
    while (s1 - c > 0.02) { let w = (s1 - c >= 2 && r() < 0.5) ? 2 : 1; if (s1 - c - w < 0.55) w = s1 - c; list.push([c, c + w]); c += w; }
    list.forEach(([a, b], i) => {
      this.stats.mods++; const m = { a, b, w: b - a, c: (a + b) / 2, i, n: list.length };
      st.panel(f, a + 0.012, b - 0.012, Q, m);
      if (low) return;
      if (r() < Q.dmg && m.w >= 0.9) { STYLES.derelict.breach(f, a, b, Q, m); return; }
      if (r() < Q.dens) st.feature(f, a, b, Q, m);
    });
    const bs = this.stats.by || (this.stats.by = {}); bs[o.style] = (bs[o.style] || 0) + this.stats.v - v0;
  }
  // ---- create the alive meshes
  flush(root) {
    const out = [], mk = (g, m, cull = true) => { const me = new THREE.Mesh(g, m); me.userData.keep = true; me.matrixAutoUpdate = false; me.frustumCulled = cull; root.add(me); out.push(me); return me; };
    for (const a of this.led.values()) { const m = mk(a.geo(), ledMat()); m.onBeforeRender = tick; }
    for (const [v, map] of Object.entries(this.scr)) { const e = scrMat(v); for (const a of map.values()) { const m = mk(a.geo(), e.mat); m.onBeforeRender = () => { tick(); e.redraw(WK.t.value); }; } }
    for (const a of this.dec.values()) mk(a.geo(), decalMat());
    const pts = (arr, spark) => { if (!arr.length) return; const g = new THREE.BufferGeometry(), P = [], N = [], E = []; for (const e of arr) { P.push(e[0], e[1], e[2]); N.push(e[3], e[4], e[5]); E.push(e[6], e[7], e[8]); }
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aN', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aE', new THREE.Float32BufferAttribute(E, 3)); const m = new THREE.Points(g, particleMat(spark)); m.userData.keep = true; m.frustumCulled = false; m.onBeforeRender = tick; m.renderOrder = 5; root.add(m); out.push(m); };
    pts(this.spk, true); pts(this.stm, false);
    if (this.fans.length) { const bg = new THREE.BoxGeometry(1, 1, 1), fm = new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.6, roughness: 0.5 });
      for (const f of this.fans) { const g = new THREE.Group(); g.position.set(...f.pos); g.rotation.y = Math.atan2(f.n[0], f.n[2]); for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(bg, fm); b.scale.set(f.r * 1.7, f.r * 0.32, 0.012); b.rotation.z = i * Math.PI / 3; g.add(b); } g.userData.keep = true; const sp = f.sp; g.onBeforeRender = tick; g.children.forEach(b => { b.userData.keep = true; }); g.userData.spin = sp; root.add(g); out.push(g); }
      WK.fans = (WK.fans || []).concat(this.fans.map((_, i) => out[out.length - this.fans.length + i])); startFans(); }
    this.led.clear(); this.scr = {}; this.dec.clear(); this.spk = []; this.stm = []; this.fans = [];
    return out;
  }
}
// fans spin from one tiny rAF loop that touches only live fan groups (few dozen)
let fansOn = false;
function startFans() {
  if (fansOn || typeof requestAnimationFrame === 'undefined') return; fansOn = true;
  const loop = () => { const t = performance.now() / 1000; if (WK.fans) { WK.fans = WK.fans.filter(g => g.parent); for (const g of WK.fans) { const sp = g.userData.spin; g.children.forEach((b, i) => { b.rotation.z = i * Math.PI / 3 + t * sp; }); } } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
export const hue = (c, k, j = 0) => { _c.set(c); const h = {}; _c.getHSL(h); _c.setHSL((h.h + j + 1) % 1, h.s, Math.max(0, Math.min(1, h.l * k))); return _c.getHex(); };
