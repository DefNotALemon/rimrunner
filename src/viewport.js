// Real windows for ship / station interiors. Every pane in a ship is ONE mesh with ONE shared ShaderMaterial that ray-casts the
// outside per fragment from the camera: the system's stars + nebula (same GLSL as the space dome), the sun and planets by their true
// direction and angular size, the ship's own hull silhouette (2D height map march), the player's docked ship, airlock tubes and, for
// stations, neighbouring modules. Infinity is direction-only (parallax-correct), nearby things have real positions in ship space.
// No render targets, no per-frame allocation; uniforms refresh in the pane mesh's onBeforeRender.
import * as THREE from '../vendor/three.module.js';
import { STAR_GLSL } from './starfield.js';
import { systemAt } from './gen.js';
import { PLANET_KINDS } from './data.js';
import { G } from './state.js';
import { rng } from './util.js';
import { stationsFor } from './stations.js';

const NP = 4, NB = 16;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const VERT = `attribute vec4 aUV; attribute vec3 aTint; attribute vec2 aGl;
varying vec3 vW; varying vec3 vN; varying vec4 vUV; varying vec3 vTint; varying vec2 vGl;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUV = aUV; vTint = aTint; vGl = aGl;
  gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = `precision highp float; precision highp int;
varying vec3 vW; varying vec3 vN; varying vec4 vUV; varying vec3 vTint; varying vec2 vGl;
uniform vec3 c1; uniform vec3 c2; uniform mat3 uRot;
uniform vec4 uSun; uniform vec3 uSunC;
uniform vec4 uPl[${NP}]; uniform vec3 uPa[${NP}]; uniform vec3 uPb[${NP}]; uniform vec4 uPc[${NP}]; uniform vec4 uPs[${NP}]; uniform int uNP;
uniform vec3 uBMin[${NB}]; uniform vec3 uBMax[${NB}]; uniform vec4 uBC[${NB}]; uniform int uNB;
uniform sampler2D uHull; uniform vec4 uHB; uniform vec2 uHY; uniform vec3 uHullC;
uniform float uLit; uniform float uTime; uniform vec3 uRefl; uniform vec4 uFl;
${STAR_GLSL}
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// ---------- far field: nebula, stars, sun, planets (direction only) ----------
vec3 farField(vec3 d){
  vec3 ds = uRot * d;
  vec3 col = vec3(0.004, 0.005, 0.012) + nebulaField(ds, c1, c2) + starField(ds);
  float cs = dot(d, uSun.xyz), ang = acos(clamp(cs, -1.0, 1.0)), R = uSun.w;
  col += uSunC * (smoothstep(R * 1.08, R * 0.92, ang) * 6.0 + 0.9 * exp(-ang / (R * 2.5 + 0.004)) + 0.12 * exp(-ang * 7.0));
  // planets: largest first wins (they were sorted by angular size, nearest/biggest is drawn on top)
  float best = 1e9;
  for (int i = 0; i < ${NP}; i++) { if (i >= uNP) break;
    vec3 pd = uPl[i].xyz; float pr = uPl[i].w, c = dot(d, pd); if (c < cos(min(pr * 1.6, 3.0))) continue;
    float sr = sin(min(pr, 1.5)); float b = c, disc = b * b - (1.0 - sr * sr);
    float aa = 0.0015 + pr * 0.004;
    vec3 sky = uPs[i].rgb; float air = uPc[i].w;
    if (disc > 0.0) {
      float t = b - sqrt(disc); vec3 n = normalize(d * t - pd);
      vec3 q = n * 3.0 + vec3(float(i) * 7.3);
      float h = sf_n3(q) * 0.6 + sf_n3(q * 2.7) * 0.3 + sf_n3(q * 8.0) * 0.1;
      vec3 base = mix(uPa[i], uPb[i], smoothstep(0.35, 0.7, h));
      float cl = smoothstep(0.55, 0.8, sf_n3(n * 5.0 + vec3(uTime * 0.002, 0.0, float(i)))) * air;
      base = mix(base, uPc[i].rgb, cl * 0.8);
      float lam = dot(n, uSun.xyz), lit = smoothstep(-0.08, 0.35, lam);
      vec3 pc = base * (uSunC * lit * 1.05 + 0.012);
      float city = uPs[i].w * (1.0 - lit) * (1.0 - cl) * smoothstep(0.62, 0.8, sf_n3(n * 22.0 + 4.0)) * smoothstep(0.3, 0.6, sf_n3(n * 4.0 + 9.0));
      pc += vec3(1.0, 0.7, 0.35) * city * 0.6;
      float rim = pow(1.0 - max(dot(n, -d), 0.0), 3.0);
      pc += sky * rim * air * smoothstep(-0.25, 0.4, lam) * 0.9;
      float edge = smoothstep(0.0, aa * 2.0, sqrt(disc));
      col = mix(col, pc, edge);
    } else if (air > 0.0) {   // thin atmosphere halo just outside the limb
      float ang2 = acos(clamp(c, -1.0, 1.0)) - pr; float hal = exp(-max(ang2, 0.0) / (pr * 0.04 + 0.002));
      vec3 sd = normalize(d - pd * c); col += sky * hal * air * 0.5 * smoothstep(-0.3, 0.5, dot(sd, uSun.xyz));
    }
  }
  return col;
}
// ---------- near field: solid things in ship space ----------
vec3 shadeSolid(vec3 p, vec3 n, vec3 d, vec3 base, float kind){
  vec2 f = abs(n.x) > 0.5 ? p.zy : abs(n.y) > 0.5 ? p.xz : p.xy;
  float sunL = max(dot(n, uSun.xyz), 0.0);
  vec3 bounce = uNP > 0 ? uPa[0] * 0.14 * max(dot(n, uPl[0].xyz), 0.0) : vec3(0.0);
  vec3 Lf = uFl.xyz - p; float dl = length(Lf); bounce += vec3(1.0, 0.92, 0.8) * uFl.w * max(dot(n, Lf / dl), 0.0) / (1.0 + dl * dl * 0.012);   // dock floodlights
  vec3 col;
  if (kind > 3.5 && kind < 4.5) {   // 4 = glowing glass / engine: emissive
    col = base;
  } else if (kind > 2.5) {   // 3 = solar array: dark cells, bright grid, sun glint
    vec2 g = abs(fract(f * vec2(0.5, 0.5)) - 0.5); float line = smoothstep(0.47, 0.49, max(g.x, g.y));
    col = mix(vec3(0.03, 0.05, 0.12), vec3(0.35), line) * (0.3 + uSunC * sunL);
    col += uSunC * pow(max(dot(reflect(d, n), uSun.xyz), 0.0), 60.0) * 1.5;
  } else {                   // 0 hull plating (+ some lit windows), 1 lit habitat, 2 ship paint, 5 plain plating
    vec2 pf = fract(f * vec2(0.5, 1.0)); float seam = min(min(pf.x, 1.0 - pf.x) * 2.0, min(pf.y, 1.0 - pf.y));
    float tone = 0.85 + 0.3 * h21(floor(f * vec2(0.5, 1.0)));
    col = base * tone * (0.08 + uSunC * sunL * 1.1 + bounce) * mix(0.55, 1.0, smoothstep(0.0, 0.04, seam));
    col += uSunC * pow(max(dot(reflect(d, n), uSun.xyz), 0.0), kind > 1.5 ? 30.0 : 12.0) * (kind > 1.5 ? 0.6 : 0.25);
    float lit = kind > 0.5 && kind < 1.5 ? 1.0 : (kind < 0.5 ? uLit * 0.6 : 0.0);
    if (lit > 0.0 && abs(n.y) < 0.5) {   // window rows
      vec2 wc = floor(f * vec2(0.8, 0.5)); vec2 wf = fract(f * vec2(0.8, 0.5));
      float on = step(1.0 - lit * 0.75, h21(wc + 3.1)) * step(0.2, wf.x) * step(wf.x, 0.8) * step(0.35, wf.y) * step(wf.y, 0.62);
      col += vec3(1.0, 0.78, 0.48) * on * 0.9;
    }
  }
  return col;
}
// ship hull silhouette: 2D height map (1 m cells), DDA march clipped to the hull's bounding box
float hullHit(vec3 o, vec3 d, out vec3 nrm){
  nrm = vec3(0.0);
  vec3 bmin = vec3(uHB.x, uHY.x, uHB.y), bmax = vec3(uHB.x + uHB.z, uHY.y, uHB.y + uHB.w);
  vec3 inv = 1.0 / (d + vec3(1e-6) * sign(d + vec3(1e-9)));
  vec3 t0 = (bmin - o) * inv, t1 = (bmax - o) * inv; vec3 tn = min(t0, t1), tf = max(t0, t1);
  float ta = max(max(tn.x, tn.y), max(tn.z, 0.0)), tb = min(min(tf.x, tf.y), tf.z);
  if (ta > tb) return -1.0;
  vec3 p = o + d * (ta + 1e-4) - vec3(uHB.x, 0.0, uHB.y);
  ivec2 c = ivec2(floor(p.xz)); ivec2 st = ivec2(d.x > 0.0 ? 1 : -1, d.z > 0.0 ? 1 : -1);
  vec2 tD = abs(1.0 / (d.xz + vec2(1e-6)));
  vec2 tM = vec2((d.x > 0.0 ? float(c.x + 1) - p.x : p.x - float(c.x)) * tD.x, (d.z > 0.0 ? float(c.y + 1) - p.z : p.z - float(c.y)) * tD.y);
  float tc = 0.0; int lastAx = -1; ivec2 sz = ivec2(uHB.zw);
  for (int k = 0; k < 96; k++) {
    if (c.x < 0 || c.y < 0 || c.x >= sz.x || c.y >= sz.y || ta + tc > tb) break;
    float h = texelFetch(uHull, c, 0).r * 12.75;
    float tx = min(tM.x, tM.y);
    if (h > 0.05) {
      float y0 = p.y + d.y * tc, y1 = p.y + d.y * tx;
      if (y0 >= uHY.x && y0 <= h) { nrm = lastAx == 0 ? vec3(-float(st.x), 0.0, 0.0) : lastAx == 1 ? vec3(0.0, 0.0, -float(st.y)) : vec3(0.0, sign(-d.y), 0.0); return ta + tc; }
      if ((y0 > h && y1 <= h) || (y0 < uHY.x && y1 >= uHY.x)) { float ty = y0 > h ? (h - p.y) / d.y : (uHY.x - p.y) / d.y; nrm = vec3(0.0, y0 > h ? 1.0 : -1.0, 0.0); return ta + max(ty, tc); }
    }
    if (tM.x < tM.y) { tc = tM.x; tM.x += tD.x; c.x += st.x; lastAx = 0; } else { tc = tM.y; tM.y += tD.y; c.y += st.y; lastAx = 1; }
  }
  return -1.0;
}
vec3 outside(vec3 o, vec3 d){
  float tBest = 1e9; vec3 nB = vec3(0.0), base = vec3(0.0); float kind = 0.0;
  for (int i = 0; i < ${NB}; i++) { if (i >= uNB) break;
    vec3 inv = 1.0 / (d + vec3(1e-6) * sign(d + vec3(1e-9)));
    vec3 t0 = (uBMin[i] - o) * inv, t1 = (uBMax[i] - o) * inv; vec3 tn = min(t0, t1), tf = max(t0, t1);
    float ta = max(max(tn.x, tn.y), tn.z), tb = min(min(tf.x, tf.y), tf.z);
    if (ta <= tb && ta > 0.0 && ta < tBest) { tBest = ta; nB = ta == tn.x ? vec3(-sign(d.x), 0.0, 0.0) : ta == tn.y ? vec3(0.0, -sign(d.y), 0.0) : vec3(0.0, 0.0, -sign(d.z)); base = uBC[i].rgb; kind = uBC[i].w; }
  }
  vec3 hn; float th = uHB.z > 0.0 ? hullHit(o, d, hn) : -1.0;
  if (th > 0.0 && th < tBest) { tBest = th; nB = hn; base = uHullC; kind = 0.0; }
  if (tBest < 1e8) return shadeSolid(o + d * tBest, nB, d, base, kind);
  return farField(d);
}
void main(){
  vec3 d = normalize(vW - cameraPosition), N = normalize(vN);
  if (dot(N, d) > 0.0) N = -N;                       // N faces the viewer (into the room)
  float u = vUV.x, v = vUV.y, w = vUV.z, hh = vUV.w;
  if (vGl.y > 0.5) { vec2 cq = vec2(u - w * 0.5, v - hh * 0.5); if (length(cq) > min(w, hh) * 0.5) discard; }
  vec3 o = vW + d * (0.36 / max(dot(d, -N), 0.05));   // start just beyond the hull plate (outside this wall's cell)
  vec3 col = outside(o, d) * vTint;
  // glass: room reflection (fresnel), soft streaks, grime toward the edges, drips
  float ndv = abs(dot(d, N)), fres = 0.035 + 0.45 * pow(1.0 - ndv, 5.0);
  float streak = 0.6 + 0.4 * smoothstep(0.3, 0.7, sf_n3(vec3((u + v * 0.6) * 1.3, 0.0, 3.0)));
  col = mix(col, uRefl * streak, fres) + uRefl * 0.02;
  float e = vGl.y > 0.5 ? min(w, hh) * 0.5 - length(vec2(u - w * 0.5, v - hh * 0.5)) : min(min(u, w - u), min(v, hh - v));
  float edge = 1.0 - smoothstep(0.0, 0.3, e);
  float nz = sf_n3(vW * vec3(2.3, 3.1, 2.3)) * sf_n3(vW * 8.7 + 1.7);
  float drip = smoothstep(0.75, 0.95, sf_n3(vec3(vW.x * 9.0 + vW.z * 9.0, vW.y * 0.6, 1.3))) * smoothstep(0.6, 0.0, v / max(hh, 0.1));
  float g = clamp(vGl.x * (edge * 0.55 + nz * 1.2 + drip * 0.5), 0.0, 0.85);
  col = mix(col, vec3(0.05, 0.048, 0.042) + uRefl * 0.25, g);
  gl_FragColor = vec4(col, 1.0);
}`;

let _mat = null;
/** the one shared viewport material (uniforms are refreshed per ship from the pane mesh's onBeforeRender) */
export function viewportMaterial() {
  if (_mat) return _mat;
  const arr = (n, f) => Array.from({ length: n }, f);
  _mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
    uniforms: {
      c1: { value: new THREE.Color(0x401060) }, c2: { value: new THREE.Color(0x103060) }, uRot: { value: new THREE.Matrix3() },
      uSun: { value: new THREE.Vector4(0, 1, 0, 0.02) }, uSunC: { value: new THREE.Color(1, 1, 1) },
      uPl: { value: arr(NP, () => new THREE.Vector4()) }, uPa: { value: arr(NP, () => new THREE.Vector3()) }, uPb: { value: arr(NP, () => new THREE.Vector3()) },
      uPc: { value: arr(NP, () => new THREE.Vector4()) }, uPs: { value: arr(NP, () => new THREE.Vector4()) }, uNP: { value: 0 },
      uBMin: { value: arr(NB, () => new THREE.Vector3()) }, uBMax: { value: arr(NB, () => new THREE.Vector3()) }, uBC: { value: arr(NB, () => new THREE.Vector4()) }, uNB: { value: 0 },
      uHull: { value: null }, uHB: { value: new THREE.Vector4() }, uHY: { value: new THREE.Vector2(-0.4, 4) }, uHullC: { value: new THREE.Color(0x555a60) },
      uLit: { value: 0 }, uTime: { value: 0 }, uRefl: { value: new THREE.Color(0.05, 0.055, 0.06) }, uFl: { value: new THREE.Vector4() },
    },
    vertexShader: VERT, fragmentShader: FRAG,
  });
  _mat.userData.look = { skip: true }; _mat.userData.keep = true;
  return _mat;
}

// ---------------- the outside world for one ship / station ----------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _v = new THREE.Vector3();
const planetCol = p => { const k = PLANET_KINDS[p.kind] || PLANET_KINDS.temperate; const pal = k.pal; return { a: pal[0], b: pal[2] || pal[1], c: pal[3] || pal[1], sky: new THREE.Color(k.sky || 0x88aadd), air: Math.min(1, k.air ?? p.air ?? 0) }; };

/** Build the environment record for a ship: where it hangs in its system, how it is turned, what is near it. */
export function spaceEnv(ship, S) {
  const st = S && S.st, r = rng((ship.seed ^ 0x51a7e) >>> 0);
  const sys = systemAt(G.seed ?? 1971, st ? st.sys : (G.sysIndex || 0));
  let pos, q0 = new THREE.Quaternion(), omega = 0, axis = V(0, 1, 0);
  if (st) {   // the station hangs where station-space.js puts it; interior -x (our dock) = the station's dock arm (+x)
    const host = sys.planets[st.planet] || sys.planets[0], hp = V(...host.pos), collR = host.radius;
    const atmoH = Math.min(5000, Math.max(1500, collR * 0.35 + 600)), dist = collR + atmoH * 2.1 + 900;
    const out = hp.clone().normalize(); if (!isFinite(out.x) || out.lengthSq() < 0.1) out.set(1, 0, 0);
    const dir = out.clone().applyAxisAngle(V(0, 1, 0), st.ang); dir.y += st.elev; dir.normalize();
    pos = hp.clone().addScaledVector(dir, dist);
    const o = new THREE.Object3D(); o.position.copy(pos); o.lookAt(hp); o.rotateY(Math.PI / 2); o.rotateY(Math.PI); q0.copy(o.quaternion);
  } else {    // a derelict / corp hull parked off one of the system's worlds, slowly tumbling
    const host = sys.planets[r.int(0, sys.planets.length - 1)], hp = V(...host.pos);
    const dir = V(r() - 0.5, (r() - 0.5) * 0.6, r() - 0.5).normalize();
    pos = hp.clone().addScaledVector(dir, host.radius * r.range(1.25, 2.6) + r.range(600, 2500));
    q0.setFromEuler(new THREE.Euler(r.range(-0.6, 0.6), r.range(0, 6.28), r.range(-0.6, 0.6)));
    axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    omega = ship.cls && ship.cls.calm ? 0 : r.range(0.004, 0.012) * (r() < 0.5 ? -1 : 1);
  }
  const sunD = pos.clone().negate(), sd = sunD.length(); sunD.normalize();
  const planets = sys.planets.map(p => { const pp = V(...p.pos).sub(pos), d = pp.length(); return { p, dir: pp.normalize(), ang: Math.asin(Math.min(0.999, p.radius / Math.max(d, p.radius * 1.001))) }; })
    .sort((a, b) => b.ang - a.ang).slice(0, NP).filter(o => o.ang > 0.0004);
  for (const o of planets) o.ang = Math.max(o.ang, 0.0025);
  const nc1 = new THREE.Color().setHSL((sys.seed % 360) / 360, 0.6, 0.3), nc2 = new THREE.Color().setHSL(((sys.seed >> 4) % 360) / 360, 0.6, 0.25);
  return { sys, st, pos, q0, omega, axis, sun: { dir: sunD, ang: Math.max(0.004, Math.asin(Math.min(0.5, sys.star.s / sd))), col: new THREE.Color(sys.star.c) }, planets, c1: nc1, c2: nc2,
    boxes: nearBoxes(ship, S, st, r), hull: hullTex(ship), lit: st ? (st.kind === 'civil' ? 1 : 0.05) : (ship.cls && ship.cls.calm ? 0.8 : Math.max(0.05, 0.45 - 0.08 * ((ship.contract && ship.contract.depth) || 1))),
    flood: (() => { const p = ship.ports[0]; return p ? new THREE.Vector4(p.dir === 'w' ? -4 : ship.W + 4, ship.H + 2.5, p.z + 4, st && st.kind !== 'civil' ? 0.3 : 1.6) : new THREE.Vector4(); })(),
    hullC: new THREE.Color(ship.corp ? ship.corp.dado : 0x4a4f58).lerp(new THREE.Color(0x6a7078), 0.5), t0: (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000 };
}
// 2D hull height map (R8, value*20 = metres): every inside-the-hull cell is solid up to its owner's ceiling + roof plate
function hullTex(ship) {
  const { nx, nz, own, owners, H } = ship, data = new Uint8Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) { const o = own[k]; if (o === -2) continue; const h = (o >= 0 ? owners[o].H : H) + 0.3; data[k] = Math.min(255, Math.round(h * 20)); }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType); t.needsUpdate = true; t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  let hm = 0; for (const o of owners) hm = Math.max(hm, o.H || 0); t.userData = { hmax: Math.max(H, hm) + 0.35 };
  return t;
}
// nearby solids as axis-aligned boxes in ship space: [min, max, rgb, kind]  kind 0 plating w/ windows, 1 lit habitat, 2 ship paint, 3 solar, 4 glow, 5 plain plating
function nearBoxes(ship, S, st, r) {
  const B = [], add = (x0, y0, z0, x1, y1, z1, col, kind = 0) => { if (B.length < NB) B.push({ min: V(x0, y0, z0), max: V(x1, y1, z1), col: new THREE.Color(col), kind }); };
  const H = ship.H, W = ship.W;
  for (const p of ship.ports) { const x0 = p.dir === 'w' ? -7 : W, x1 = p.dir === 'w' ? 0 : W + 7; add(x0, -0.35, p.z - 3.1, x1, H + 0.35, p.z + 3.1, 0x5a5f66, 5); }
  // your ship, docked broadside to the airlock tube at port 0 (bigger than the flight model so it reads at walking scale)
  const mine = ship.ports[0];
  if (mine) { const s = mine.dir === 'w' ? -1 : 1, X = v => mine.dir === 'w' ? -v : W + v, bx = (a, b, y0, y1, z0, z1, c, k) => add(Math.min(X(a), X(b)), y0, mine.z + z0, Math.max(X(a), X(b)), y1, mine.z + z1, c, k);
    void s;
    bx(7, 12.5, -1.6, 3.4, -8, 8, 0xc9ccd2, 2);          // fuselage
    bx(7.6, 11.9, -1.2, 3.0, -11.5, -8, 0xc9ccd2, 2);    // nose
    bx(8.2, 11.3, 2.4, 3.3, -11.2, -8.6, 0x6fd0ff, 4);    // canopy glass glow
    bx(12.5, 19, 0.2, 0.7, 1, 7, 0xe8742a, 2);           // outer wing
    bx(2.2, 7, 0.2, 0.7, 3.4, 7, 0xe8742a, 2);           // inner wing (clear of the tube)
    bx(8, 11.5, -1.3, 1.6, 8, 10.5, 0x2b2f38, 2);        // engine block
    bx(8.3, 11.2, -1.0, 1.3, 10.5, 10.62, 0x66ccff, 4);   // engine glow
    bx(9.4, 9.9, 3.4, 5.4, 4.5, 8, 0xe8742a, 2);          // tail fin
  }
  const zlo = ship.zlo, zhi = ship.zhi;
  if (st && st.kind === 'civil') {   // the rest of the port: habitat blocks, a truss, solar wings
    add(W * 0.15, -14, zhi + 22, W * 0.55, 9, zhi + 34, 0xb8b2a6, 1);
    add(W * 0.6, -6, zlo - 40, W * 0.95, 14, zlo - 26, 0xb8b2a6, 1);
    add(-60, 1.5, zhi + 9, W + 60, 3.2, zhi + 10.5, 0x4a5058, 0);
    add(-60, 1.5, zlo - 10.5, W + 60, 3.2, zlo - 9, 0x4a5058, 0);
    add(W * 0.3, 40, zlo - 30, W * 0.7, 41, zhi + 30, 0x1a2a4a, 3);
    add(W * 0.3, -41, zlo - 30, W * 0.7, -40, zhi + 30, 0x1a2a4a, 3);
    add(W + 20, -8, -6, W + 34, 10, 6, 0x4a5058, 1);
  } else if (st) {                   // derelict station: torn modules, dead panels
    add(W * 0.2, -10, zhi + 18, W * 0.5, 6, zhi + 30, 0x4a4640, 0);
    add(W * 0.55, -4, zlo - 34, W * 0.8, 9, zlo - 22, 0x2a2622, 0);
    add(W * 0.25, 38, zlo - 20, W * 0.6, 39, zhi + 10, 0x1a2230, 3);
  } else {                           // derelict: drifting debris near the hull
    for (let i = 0; i < 4; i++) { const sz = r.range(0.4, 2.2), x = r.range(-20, W + 20), side = r() < 0.5 ? zlo - r.range(4, 26) : zhi + r.range(4, 26), y = r.range(-6, 9);
      add(x - sz, y - sz * 0.5, side - sz * 0.7, x + sz, y + sz * 0.5, side + sz * 0.7, 0x3a3d42, 5); }
  }
  return B;
}

// ---------------- pane geometry + per-ship mesh ----------------
export class Viewports {
  constructor() { this.P = []; this.N = []; this.UV = []; this.T = []; this.GL = []; this.list = []; }
  _quad(c, ux, vy, n, w, h, tint, gl) {   // c = corner; ux,vy = axes (unit) ; n normal
    const p = (u, v) => [c.x + ux.x * u + vy.x * v, c.y + ux.y * u + vy.y * v, c.z + ux.z * u + vy.z * v];
    const vs = [[0, 0], [w, 0], [w, h], [0, 0], [w, h], [0, h]];
    for (const [u, v] of vs) { this.P.push(...p(u, v)); this.N.push(n.x, n.y, n.z); this.UV.push(u, v, w, h); this.T.push(tint[0], tint[1], tint[2]); this.GL.push(gl[0], gl[1]); }
  }
  /** vertical pane on a run wall. axis 'x': plane z=at, runs along x; axis 'z': plane x=at. sgn: the room side (normal points into it) */
  wall(axis, at, sgn, s0, s1, y0, y1, o = {}) {
    const tint = o.tint || [1, 1, 1], gl = [o.grime ?? 0.25, o.round ? 1 : 0];
    if (axis === 'x') this._quad(V(s0, y0, at), V(1, 0, 0), V(0, 1, 0), V(0, 0, sgn), s1 - s0, y1 - y0, tint, gl);
    else this._quad(V(at, y0, s0), V(0, 0, 1), V(0, 1, 0), V(sgn, 0, 0), s1 - s0, y1 - y0, tint, gl);
    this.list.push({ axis, at, sgn, s0, s1, y0, y1, round: !!o.round, kind: o.kind || '' });
  }
  /** ceiling skylight facing down */
  sky(x0, x1, z0, z1, y, o = {}) {
    this._quad(V(x0, y, z0), V(1, 0, 0), V(0, 0, 1), V(0, -1, 0), x1 - x0, z1 - z0, o.tint || [1, 1, 1], [o.grime ?? 0.2, 0]);
    this.list.push({ axis: 'y', at: y, sgn: -1, s0: x0, s1: x1, y0: z0, y1: z1, kind: 'sky' });
  }
  /** overlaps an existing pane on this wall? (for wall screens etc.) */
  hits(axis, at, s0, s1, tol = 0.6) { return this.list.some(p => p.axis === axis && Math.abs(p.at - at) < tol && s1 > p.s0 - 0.2 && s0 < p.s1 + 0.2); }
  flush(root, env) {
    if (!this.P.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.UV, 4)); g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.T, 3)); g.setAttribute('aGl', new THREE.Float32BufferAttribute(this.GL, 2));
    const m = new THREE.Mesh(g, viewportMaterial()); m.name = 'viewports'; m.userData.keep = true; m.userData.interior = true; m.castShadow = m.receiveShadow = false;
    m.vpEnv = env; m.onBeforeRender = paneTick; root.add(m);   // env not in userData: Object3D.copy JSON-clones userData
    VP.mesh = m; VP.env = env; VP.panes = this.list; return m;
  }
}

// uniforms for env (called every frame by the pane mesh; cheap when nothing moves)
let _applied = null;
function paneTick() { applyEnv(this.vpEnv); }
export function applyEnv(env, now) {
  if (!env) return; const U = viewportMaterial().uniforms;
  const t = (now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) - env.t0; U.uTime.value = t;
  const moving = env.omega !== 0;
  if (_applied === env && !moving) return;
  if (_applied !== env) {
    U.c1.value.copy(env.c1); U.c2.value.copy(env.c2); U.uSunC.value.copy(env.sun.col); U.uNP.value = env.planets.length;
    env.planets.forEach((o, i) => { const c = planetCol(o.p); U.uPa.value[i].set(...c.a); U.uPb.value[i].set(...c.b); U.uPc.value[i].set(c.c[0], c.c[1], c.c[2], c.air); U.uPs.value[i].set(c.sky.r, c.sky.g, c.sky.b, o.p.settled ? 1 : 0); });
    U.uNB.value = env.boxes.length; env.boxes.forEach((b, i) => { U.uBMin.value[i].copy(b.min); U.uBMax.value[i].copy(b.max); U.uBC.value[i].set(b.col.r, b.col.g, b.col.b, b.kind); });
    const h = env.hull; U.uHull.value = h; U.uHB.value.set(0, env.zlo ?? 0, h ? h.image.width : 0, h ? h.image.height : 0); U.uHY.value.set(-0.4, h ? h.userData.hmax : 4); U.uHullC.value.copy(env.hullC); U.uLit.value = env.lit;
    U.uRefl.value.copy(env.refl || _defRefl); U.uFl.value.copy(env.flood);
  }
  // ship -> space rotation (slow tumble for derelicts); sun / planet directions into ship space
  _q.setFromAxisAngle(env.axis, env.omega * t); _q2.copy(env.q0).multiply(_q); _qi.copy(_q2).invert();
  U.uRot.value.setFromMatrix4(_m4.makeRotationFromQuaternion(_q2));
  _v.copy(env.sun.dir).applyQuaternion(_qi); U.uSun.value.set(_v.x, _v.y, _v.z, env.sun.ang);
  env.planets.forEach((o, i) => { _v.copy(o.dir).applyQuaternion(_qi); U.uPl.value[i].set(_v.x, _v.y, _v.z, o.ang); });
  _applied = env;
}
const _defRefl = new THREE.Color(0.05, 0.055, 0.06);

// ---------------- window layout per space (each room type has its own look) ----------------
const STYLES = {
  plaza:     { strip: true, y0: 0.5, y1: 3.1, maxW: 11, mull: 1.7, sill: 0.25, grime: 0.18 },
  promenade: { strip: true, y0: 0.95, y1: 2.6, maxW: 7.5, mull: 1.9, sill: 0.18, grime: 0.22 },
  gallery:   { w: [1.6, 2.4], gap: [1.0, 2.0], y0: 0.7, y1: 2.8, mull: 0, transom: 2.2, grime: 0.25 },
  cor:       { w: [1.4, 2.6], gap: [1.6, 3.2], y0: 1.25, y1: 2.45, grime: 0.3 },
  crew:      { w: [0.72, 0.72], gap: [1.1, 1.6], y0: 1.4, y1: 2.12, round: true, grime: 0.28, tint: [1.02, 0.98, 0.92] },
  barracks:  { w: [0.62, 0.62], gap: [1.4, 2.0], y0: 1.5, y1: 2.12, round: true, grime: 0.35 },
  canteen:   { w: [2.6, 3.6], gap: [0.8, 1.4], y0: 0.95, y1: 2.5, mull: 1.3, sill: 0.3, grime: 0.22, tint: [1.02, 0.99, 0.94] },
  office:    { w: [2.2, 3.2], gap: [0.9, 1.6], y0: 1.0, y1: 2.55, mull: 1.1, grime: 0.15 },
  control:   { strip: true, y0: 1.6, y1: 2.85, maxW: 5.5, mull: 1.4, grime: 0.12, tint: [0.95, 1.0, 1.04] },
  lab:       { w: [1.6, 2.2], gap: [1.2, 2.0], y0: 1.15, y1: 2.45, grime: 0.06, tint: [0.95, 1.0, 1.03] },
  medbay:    { w: [1.4, 2.0], gap: [1.2, 2.0], y0: 1.2, y1: 2.4, grime: 0.04, tint: [0.96, 1.0, 1.02] },
  cooling:   { w: [0.42, 0.5], gap: [0.6, 0.9], y0: 0.8, y1: 2.9, grime: 0.55, tint: [0.88, 0.97, 1.05] },
  guardroom: { w: [1.6, 2.0], gap: [1.0, 1.6], y0: 1.55, y1: 1.92, bars: 0.22, grime: 0.3 },
};
/** where the windows of one hull run go: [{cc, w, y0, y1, style}] (keeps clear of door/port gaps) */
export function planWindows(r, { a, b, gaps, kind, type, top, gallery, dirt = 0 }) {
  const key = kind === 'plaza' ? 'plaza' : kind === 'cor' ? (gallery ? 'gallery' : b - a >= 12 ? 'promenade' : 'cor') : type;
  let st = STYLES[key]; if (!st) return [];
  if (key === 'promenade' && r() < 0.2) st = STYLES.cor;
  const y1 = Math.min(st.y1, top - 0.35), y0 = st.y0; if (y1 - y0 < 0.3) return [];
  let iv = [[a + 0.7, b - 0.7]];
  for (const g of gaps) { const lo = g[0] - g[1] / 2 - 0.7, hi = g[0] + g[1] / 2 + 0.7; iv = iv.flatMap(([x0, x1]) => x1 <= lo || x0 >= hi ? [[x0, x1]] : [[x0, Math.min(x1, lo)], [Math.max(x0, hi), x1]]); }
  iv = iv.filter(([x0, x1]) => x1 - x0 > 0.6);
  const out = [], mk = (cc, w) => out.push({ cc, w, y0, y1: st.round ? y0 + w : y1, st, grime: Math.min(0.9, (st.grime || 0.2) + dirt) });
  for (const [x0, x1] of iv) {
    const L = x1 - x0;
    if (st.strip) { if (L < 2.4) continue; const k = Math.ceil(L / st.maxW), w = (L - (k - 1) * 0.6) / k; for (let i = 0; i < k; i++) mk(x0 + w / 2 + i * (w + 0.6), w); continue; }
    const w0 = r.range(st.w[0], st.w[1]), gp = r.range(st.gap[0], st.gap[1]); if (L < w0) continue;
    const n = Math.max(1, Math.floor((L + gp) / (w0 + gp))), span = n * w0 + (n - 1) * gp, s = x0 + (L - span) / 2;
    for (let i = 0; i < n; i++) if (r() > 0.08) mk(s + w0 / 2 + i * (w0 + gp), w0);
  }
  return out;
}
/** draw a window's frame (into the static batch via put) and its pane (into vp). put(kind, col, s0, s1, y0, y1, d0, d1): d = depth into the room from the wall face */
export function drawWindow(v, put, trim, vp, axis, paneAt, sgn) {
  const { cc, w, y0, y1, st } = v, s0 = cc - w / 2, s1 = cc + w / 2, T = 0.09;
  if (st.round) {   // porthole: square plate with a round opening (the pane shader cuts the circle), bolt ring
    put('matte', trim, s0 - 0.14, s1 + 0.14, y0 - 0.14, y0 + 0.02, 0, T); put('matte', trim, s0 - 0.14, s1 + 0.14, y1 - 0.02, y1 + 0.14, 0, T);
    put('matte', trim, s0 - 0.14, s0 + 0.02, y0 - 0.14, y1 + 0.14, 0, T); put('matte', trim, s1 - 0.02, s1 + 0.14, y0 - 0.14, y1 + 0.14, 0, T);
    for (const [a, b] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) put('metal', 0x9aa2ac, s0 + a * w - 0.03, s0 + a * w + 0.03, y0 + b * w - 0.03, y0 + b * w + 0.03, 0.04, 0.065);
    put('matte', trim, s0, s1, y0, y1, 0, 0.04);   // backing plate: the shader cuts the circle out of the pane, the corners show this
  } else {
    put('matte', trim, s0 - 0.12, s0 + 0.03, y0 - 0.12, y1 + 0.12, 0, T); put('matte', trim, s1 - 0.03, s1 + 0.12, y0 - 0.12, y1 + 0.12, 0, T);
    put('matte', trim, s0 - 0.12, s1 + 0.12, y1 - 0.03, y1 + 0.12, 0, T); put('matte', trim, s0 - 0.12, s1 + 0.12, y0 - 0.12, y0 + 0.03, 0, T + (st.sill || 0));
    if (st.mull) { const n = Math.max(1, Math.round(w / st.mull)); for (let i = 1; i < n; i++) { const x = s0 + i * w / n; put('matte', trim, x - 0.035, x + 0.035, y0, y1, 0.06, 0.11); } }
    if (st.transom && y1 > st.transom + 0.3) put('matte', trim, s0, s1, st.transom - 0.03, st.transom + 0.03, 0.06, 0.11);
    if (st.bars) for (let x = s0 + st.bars; x < s1 - 0.05; x += st.bars) put('metal', 0x7a828c, x - 0.015, x + 0.015, y0, y1, 0.07, 0.1);
  }
  vp.wall(axis, paneAt, sgn, s0, s1, y0, y1, { tint: st.tint, grime: v.grime, round: st.round, kind: st === STYLES.plaza ? 'plaza' : '' });
}

// debug hook: window.__rr.viewports (installed lazily, main.js is not touched)
export const VP = { mesh: null, env: null, panes: [], material: viewportMaterial, apply: applyEnv,
  info() { const e = VP.env; return e && { panes: VP.panes.length, sys: e.sys.name, station: e.st ? e.st.name : null, sunAng: +e.sun.ang.toFixed(4), planets: e.planets.map(o => [o.p.name, o.p.kind, +o.ang.toFixed(4)]), boxes: e.boxes.length, omega: e.omega }; } };
export function newShipViewports(ship, S) {
  const env = spaceEnv(ship, S); env.zlo = ship.zlo;
  if (typeof window !== 'undefined' && window.__rr) window.__rr.viewports = VP;
  if (VP.env && VP.env.hull && VP.env !== env) VP.env.hull.dispose();
  return { vp: new Viewports(), env };
}
