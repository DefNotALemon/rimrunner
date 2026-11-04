// Look: the one place that decides how Rimrunner's materials and light behave.
//  - LOOKS: art-direction presets (tone mapping, exposure, grime, wet, bloom, grade, light balance). Switch live: F6.
//  - Material source: 'scan' (CC0 ambientCG PBR sets, assets/materials) or 'proc' (procedural, derived maps). Switch live: F8.
//  - FX tier: 'high' (MSAA + bloom + grade), 'med' (grade only), 'off' (straight to canvas). Switch live: F7.
//  - Image based lighting: a procedural sky env, prefiltered with PMREM, re-baked as the day moves. Indoors it is faded out.
//  - enhance(): patches any MeshStandardMaterial with world-space grime, macro colour variation, triplanar detail normal/roughness
//    (so UV-less batched furniture and terrain get scan-quality micro detail too), puddles and wet sheen.
// See docs/MATERIALS.md for the full option menu.
import * as THREE from '../vendor/three.module.js';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';

const TONE = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping, filmic: THREE.CineonToneMapping };

export const LOOKS = {
  frontier: {
    name: 'Frontier Grit', blurb: 'Lived-in industrial colony. Warm sun, dusty air, dirty wall bases, rain streaks, worn paint. Filmic and a little desaturated.',
    tone: 'aces', exposure: 1.0, env: 0.85, hemi: 0.18, sun: 1.0, sunTint: [1, 0.96, 0.9], fog: 1.0,
    glow: [0.02, 0.03, 0.05], grime: 0.75, macro: 0.32, detailN: 1.0, detailR: 0.5, rough: 0.0, wet: 0.0, normal: 1.0, ao: 1.0, albedoSat: 1.0,
    bloom: [0.22, 0.6, 0.92], grade: { sat: 0.94, con: 1.06, tint: [1.02, 1.0, 0.97], vig: 0.22, grain: 0.03 }, lamp: 1.0, lampWarm: 0.0,
  },
  chrome: {
    name: 'Clean Chrome', blurb: 'Optimistic mid-century sci-fi. Bright, crisp, glossy: polished metal, little dirt, long clean reflections. Neutral tone mapping keeps paint colours true.',
    tone: 'neutral', exposure: 1.08, env: 1.25, hemi: 0.22, sun: 1.05, sunTint: [1, 0.98, 0.94], fog: 0.55,
    glow: [0.03, 0.04, 0.05], grime: 0.12, macro: 0.12, detailN: 0.55, detailR: 0.25, rough: -0.22, wet: 0.0, normal: 0.7, ao: 0.6, albedoSat: 1.1,
    bloom: [0.14, 0.5, 1.0], grade: { sat: 1.06, con: 1.03, tint: [1.0, 1.01, 1.03], vig: 0.12, grain: 0.0 }, lamp: 0.9, lampWarm: -0.2,
  },
  noir: {
    name: 'Neon Noir', blurb: 'Wet, moody, high contrast. Dim sun, puddled ground that mirrors the lamps, hot bloom on every emissive, teal shadows and amber highlights.',
    tone: 'agx', exposure: 0.92, env: 0.55, hemi: 0.12, sun: 0.78, sunTint: [0.9, 0.95, 1.0], fog: 1.8,
    glow: [0.12, 0.36, 0.6], grime: 0.9, macro: 0.35, detailN: 1.1, detailR: 0.45, rough: -0.08, wet: 1.0, normal: 1.1, ao: 1.2, albedoSat: 0.9,
    bloom: [0.55, 0.85, 0.7], grade: { sat: 1.12, con: 1.16, tint: [0.97, 1.0, 1.06], vig: 0.38, grain: 0.05 }, lamp: 1.5, lampWarm: 0.1,
  },
  painted: {
    name: 'Painted Matte', blurb: 'Stylised and soft, like gouache concept art. Flat colour fields, gentle detail, saturated shadows, almost no specular. Cheapest to run, friendliest to a low-poly look.',
    tone: 'neutral', exposure: 1.0, env: 1.0, hemi: 0.3, sun: 0.9, sunTint: [1, 0.97, 0.92], fog: 0.8,
    glow: [0.04, 0.04, 0.06], grime: 0.15, macro: 0.2, detailN: 0.3, detailR: 0.1, rough: 0.28, wet: 0.0, normal: 0.35, ao: 0.4, albedoSat: 1.25,
    bloom: [0.1, 0.5, 1.0], grade: { sat: 1.12, con: 0.98, tint: [1.02, 1.0, 0.98], vig: 0.1, grain: 0.0 }, lamp: 1.0, lampWarm: 0.0,
  },
};
export const LOOK_ORDER = ['frontier', 'chrome', 'noir', 'painted'];

// per-kind scan parameters: rep = how many times the 1K sheet repeats per boxUV tile (tile defaults to 2 m), metal = metalness multiplier,
// nrm = normal strength, rough = roughness multiplier on the scan, ao = AO map weight
const KINDS = {
  siding: { rep: 0.9, metal: 0, nrm: 1.0, rough: 1.0, ao: 0.8 }, brick: { rep: 1.0, metal: 0, nrm: 1.2, rough: 1.0, ao: 1.0 }, concrete: { rep: 0.7, metal: 0, nrm: 1.0, rough: 1.0, ao: 0.9 },
  metal: { rep: 0.8, metal: 1, nrm: 1.0, rough: 1.0, ao: 0.7 }, roof: { rep: 1.0, metal: 1, nrm: 1.2, rough: 1.0, ao: 1.0 }, floor: { rep: 0.8, metal: 0, nrm: 0.9, rough: 1.0, ao: 0.9 },
  asphalt: { rep: 0.6, metal: 0, nrm: 1.1, rough: 1.0, ao: 0.8 }, pavers: { rep: 0.8, metal: 0, nrm: 1.2, rough: 1.0, ao: 1.0 }, hull: { rep: 0.7, metal: 1, nrm: 1.0, rough: 1.0, ao: 0.8 },
  rust: { rep: 0.7, metal: 1, nrm: 1.0, rough: 1.0, ao: 0.9 }, tile: { rep: 1.0, metal: 0, nrm: 0.9, rough: 1.0, ao: 0.8 }, plaster: { rep: 0.7, metal: 0, nrm: 0.8, rough: 1.0, ao: 0.6 },
};
// procedural derivation parameters (nStr = normal strength on 0..1 luminance height; rough0/gain = base roughness and how much dark = rough)
const PROC = {
  siding: { nStr: 2.5, rough0: 0.62, gain: 0.5, metal: 0 }, brick: { nStr: 5, rough0: 0.8, gain: 0.5, metal: 0 }, concrete: { nStr: 3, rough0: 0.85, gain: 0.4, metal: 0 }, metal: { nStr: 1.5, rough0: 0.4, gain: 0.5, metal: 0.8 },
  roof: { nStr: 4, rough0: 0.5, gain: 0.4, metal: 0.7 }, floor: { nStr: 2.2, rough0: 0.6, gain: 0.5, metal: 0 }, asphalt: { nStr: 4, rough0: 0.88, gain: 0.3, metal: 0 }, pavers: { nStr: 5, rough0: 0.8, gain: 0.5, metal: 0 },
};

export const Look = {
  id: 'frontier', cfg: LOOKS.frontier, source: 'scan', tier: 'high', renderer: null, onChange: null, indoor: 0, autoTier: true, hooks: [], day: null,
  U: {   // shared uniforms: changing these retunes every patched material live, no recompiles
    grime: { value: 0.75 }, macro: { value: 0.3 }, detailN: { value: 1 }, detailR: { value: 0.5 }, rough: { value: 0 }, wet: { value: 0 }, ldA: { value: 0.35 },
  },
  _loader: new THREE.TextureLoader(), _tex: {}, _surf: [], _scans: {}, _envFor: new Map(), _frame: 0, _scenesSeen: new WeakMap(), _dimEnv: null, _ph: null,

  init(renderer) {
    this.renderer = renderer; this.pmrem = new THREE.PMREMGenerator(renderer); this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const q = new URLSearchParams(location.search); let saved = {}; try { saved = JSON.parse(localStorage.getItem('rimrunner_look') || '{}'); } catch (e) { }
    this.source = q.get('mat') || saved.source || 'scan'; this.tier = q.get('fx') || saved.tier || 'high';
    this.autoTier = !q.get('fx') && !navigator.webdriver;
    this.set(q.get('look') || saved.look || 'frontier', true);
    this._buildPost(); return this;
  },
  save() { try { localStorage.setItem('rimrunner_look', JSON.stringify({ look: this.id, source: this.source, tier: this.tier })); } catch (e) { } },
  set(id, quiet) {
    if (!LOOKS[id]) id = 'frontier'; this.id = id; const c = this.cfg = LOOKS[id], U = this.U;
    U.grime.value = c.grime; U.macro.value = c.macro; U.detailN.value = c.detailN; U.detailR.value = c.detailR; U.rough.value = c.rough; U.wet.value = c.wet;
    if (this.renderer) { this.renderer.toneMapping = TONE[c.tone]; this.renderer.toneMappingExposure = c.exposure; }
    if (this.bloom) { this.bloom.strength = c.bloom[0]; this.bloom.radius = c.bloom[1]; this.bloom.threshold = c.bloom[2]; }
    if (this.grade) { const g = c.grade, u = this.grade.uniforms; u.sat.value = g.sat; u.con.value = g.con; u.tint.value.set(...g.tint); u.vig.value = g.vig; u.grain.value = g.grain; }
    this._envFor.clear(); this._envKey = null;
    for (const m of this._surf) this._applyScanParams(m);
    this.save(); if (!quiet && this.onChange) this.onChange(`Look: ${c.name}`, c.blurb);
  },
  cycleLook() { const i = LOOK_ORDER.indexOf(this.id); this.set(LOOK_ORDER[(i + 1) % LOOK_ORDER.length]); },
  cycleTier() { const t = ['high', 'med', 'off']; this.setTier(t[(t.indexOf(this.tier) + 1) % 3]); this.autoTier = false; },
  setTier(t) { this.tier = t; this.save(); if (this.onChange) this.onChange(`Effects: ${t === 'high' ? 'High (MSAA + bloom + grade)' : t === 'med' ? 'Medium (grade only)' : 'Off'}`); },
  toggleSource() { this.source = this.source === 'scan' ? 'proc' : 'scan'; for (const m of this._surf) this._dress(m); this.save(); if (this.onChange) this.onChange(`Materials: ${this.source === 'scan' ? 'scanned PBR (CC0)' : 'procedural'}`); },

  // ---------- textures ----------
  _texture(url, srgb) {
    if (this._tex[url]) return this._tex[url];
    const t = this._tex[url] = { tex: null, avg: null, waiters: [] };
    this._loader.load(url, tx => {
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = this.maxAniso || 4; tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.tex = tx;
      if (srgb) { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'); x.drawImage(tx.image, 0, 0, 16, 16); const d = x.getImageData(0, 0, 16, 16).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4 * 255; t.avg = new THREE.Color().setRGB(r / n, g / n, b / n, THREE.SRGBColorSpace); }
      for (const f of t.waiters) f(t); t.waiters.length = 0;
    }, undefined, () => { t.failed = true; });
    return t;
  },
  _when(url, srgb, f) { const t = this._texture(url, srgb); if (t.tex) f(t); else if (!t.failed) t.waiters.push(f); },

  // ---------- surfMat materials (UV'd): procedural first, scans swapped in when loaded ----------
  dress(mat, kind, color, proc) {
    mat.userData.look = { kind, tint: new THREE.Color(color), proc, variant: 'uv' }; this._surf.push(mat); this._dress(mat);
  },
  _dress(mat) {
    const u = mat.userData.look, kind = u.kind, K = KINDS[kind];
    const useProc = () => { const p = u.proc; mat.map = p.map; mat.normalMap = p.normal; mat.roughnessMap = mat.metalnessMap = mat.aoMap = p.orm; mat.color.copy(u.tint); u.scanned = false; this._applyScanParams(mat); mat.needsUpdate = true; };
    if (this.source !== 'scan' || !K) return useProc();
    if (!u.scanned) useProc();   // visible immediately; replaced below when the sheets arrive
    const base = `assets/materials/${kind}_`; let got = 0; const sets = {};
    const done = () => {
      if (++got < 3 || this.source !== 'scan') return;
      for (const t of [sets.c, sets.n, sets.o]) t.tex.repeat.set(K.rep, K.rep);
      sets.o.tex.channel = 0; mat.map = sets.c.tex; mat.normalMap = sets.n.tex; mat.roughnessMap = mat.metalnessMap = mat.aoMap = sets.o.tex;
      u.avg = sets.c.avg; u.scanned = true; this._applyScanParams(mat); mat.needsUpdate = true;
    };
    this._when(base + 'c.jpg', true, t => { sets.c = t; done(); }); this._when(base + 'n.jpg', false, t => { sets.n = t; done(); }); this._when(base + 'o.jpg', false, t => { sets.o = t; done(); });
  },
  _applyScanParams(mat) {
    const u = mat.userData.look, c = this.cfg; if (!u) return;
    if (u.scanned) {
      const K = KINDS[u.kind], A = u.avg, T = u.tint; let r = T.r / Math.max(A.r, 0.02), g = T.g / Math.max(A.g, 0.02), b = T.b / Math.max(A.b, 0.02);
      if (K.metal) { const l = Math.max(0.4, r * 0.3 + g * 0.59 + b * 0.11); const k = 0.55; r = (1 - k) + k * r / l; g = (1 - k) + k * g / l; b = (1 - k) + k * b / l; const bright = 0.85 + 0.35 * Math.min(1, l); r *= bright; g *= bright; b *= bright; }   // metal colour is its reflectance: tint the hue, keep it bright
      mat.color.setRGB(Math.min(2.4, r), Math.min(2.4, g), Math.min(2.4, b));
      mat.roughness = Math.min(1, K.rough); mat.metalness = K.metal; mat.aoMapIntensity = K.ao * c.ao; mat.normalScale.set(K.nrm * c.normal, K.nrm * c.normal);
    } else {
      const P = PROC[u.kind] || u.proc.P || { metal: 0 }; mat.roughness = 1; mat.metalness = P.metal > 0 ? 1 : 0; mat.aoMapIntensity = 0.9 * c.ao; mat.normalScale.set(c.normal, c.normal);
    }
  },

  // ---------- procedural PBR derivation (fallback source): albedo luminance -> height -> normal / roughness / AO ----------
  derive(kind, canvas) {
    const P = PROC[kind] || { nStr: 2, rough0: 0.8, gain: 0.4, metal: 0 }, w = canvas.width, h = canvas.height;
    const src = canvas.getContext('2d').getImageData(0, 0, w, h).data, L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
    const blur = (a, r) => { const o = new Float32Array(w * h), t = new Float32Array(w * h), n = 2 * r + 1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += a[y * w + ((x + k + w) % w)]; t[y * w + x] = s / n; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[((y + k + h) % h) * w + x]; o[y * w + x] = s / n; } return o; };
    const H = blur(L, 1), B = blur(L, 5), nm = document.createElement('canvas'), om = document.createElement('canvas'); nm.width = om.width = w; nm.height = om.height = h;
    const nx = nm.getContext('2d'), ox = om.getContext('2d'), nI = nx.createImageData(w, h), oI = ox.createImageData(w, h), nd = nI.data, od = oI.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, dx = H[y * w + (x + 1) % w] - H[y * w + (x - 1 + w) % w], dy = H[((y + 1) % h) * w + x] - H[((y - 1 + h) % h) * w + x];
      let vx = -dx * P.nStr, vy = dy * P.nStr, vz = 1; const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
      nd[i * 4] = (vx * 0.5 + 0.5) * 255; nd[i * 4 + 1] = (vy * 0.5 + 0.5) * 255; nd[i * 4 + 2] = (vz * 0.5 + 0.5) * 255; nd[i * 4 + 3] = 255;
      od[i * 4] = Math.max(0, Math.min(1, 1 - Math.max(0, B[i] - L[i]) * 2.2)) * 255;   // cavity AO
      od[i * 4 + 1] = Math.max(0.12, Math.min(1, P.rough0 + (0.55 - L[i]) * P.gain)) * 255; od[i * 4 + 2] = P.metal * 255; od[i * 4 + 3] = 255;
    }
    nx.putImageData(nI, 0, 0); ox.putImageData(oI, 0, 0);
    const mk = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.channel = 0; return t; };
    return { normal: mk(nm), orm: mk(om) };
  },

  // ---------- material enhancer ----------
  _detail(name) {
    if (!this._ph) { this._ph = new THREE.DataTexture(new Uint8Array([128, 128, 150, 128]), 1, 1, THREE.RGBAFormat); this._ph.needsUpdate = true; }
    const slot = this._tex['d_' + name] || (this._tex['d_' + name] = { u: { value: this._ph } });
    if (!slot.asked) { slot.asked = true; this._when(`assets/materials/detail_${name}.png`, false, t => { t.tex.generateMipmaps = true; t.tex.minFilter = THREE.LinearMipmapLinearFilter; slot.u.value = t.tex; }); }
    return slot.u;
  },
  enhance(mat) {
    if (mat.userData.rrLook || mat.userData.look?.skip || !mat.isMeshStandardMaterial) return; if (mat.transparent && mat.opacity < 0.9) return;
    const detailTex = mat.map && mat.map.image && mat.map.image.width === 512 && !mat.userData.look && mat.vertexColors;   // terrain's cloud map
    const variant = mat.userData.look?.variant === 'uv' ? 'uv' : detailTex ? 'ground' : mat.metalness > 0.35 ? 'metal' : 'matte';
    mat.userData.rrLook = variant; const U = this.U;
    const tri = variant !== 'uv'; const dtex = tri ? this._detail(variant === 'ground' ? 'ground' : variant === 'metal' ? 'metal' : 'matte') : null;
    const scale = { ground: 0.22, metal: 0.8, matte: 0.7 }[variant];
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      Object.assign(sh.uniforms, { uLgrime: U.grime, uLmacro: U.macro, uLdN: U.detailN, uLdR: U.detailR, uLrough: U.rough, uLwet: U.wet, uLdA: U.ldA });
      if (tri) { sh.uniforms.tLD = dtex; sh.uniforms.uLdS = { value: scale }; }
      const def = (tri ? '#define LOOK_TRI\n' : '') + (variant === 'ground' ? '#define LOOK_GROUND\n' : '') + (variant === 'uv' ? '#define LOOK_UV\n' : '');
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLWp; varying vec3 vLWn;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          { vec4 lwp = vec4(transformed, 1.0); vec3 lwn = objectNormal;
          #ifdef USE_INSTANCING
            lwp = instanceMatrix * lwp; lwn = mat3(instanceMatrix) * lwn;
          #endif
          vLWp = (modelMatrix * lwp).xyz; vLWn = normalize(mat3(modelMatrix) * lwn); }`);
      sh.fragmentShader = def + sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 vLWp; varying vec3 vLWn;
        uniform float uLgrime, uLmacro, uLdN, uLdR, uLrough, uLwet, uLdA;
        #ifdef LOOK_TRI
        uniform sampler2D tLD; uniform float uLdS;
        #endif
        float lh(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float ln(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(lh(i),lh(i+vec3(1,0,0)),f.x), mix(lh(i+vec3(0,1,0)),lh(i+vec3(1,1,0)),f.x), f.y),
                     mix(mix(lh(i+vec3(0,0,1)),lh(i+vec3(1,0,1)),f.x), mix(lh(i+vec3(0,1,1)),lh(i+vec3(1,1,1)),f.x), f.y), f.z); }
        #ifdef LOOK_TRI
        vec4 triD(vec3 p, vec3 wn, float s, out vec3 pert){
          vec3 b = pow(abs(wn), vec3(4.0)); b /= (b.x+b.y+b.z+1e-5);
          vec4 x = texture2D(tLD, p.zy*s), y = texture2D(tLD, p.xz*s), z = texture2D(tLD, p.xy*s);
          vec3 tx = vec3(0.0, x.g*2.0-1.0, (x.r*2.0-1.0)*sign(wn.x)), ty = vec3((y.r*2.0-1.0)*sign(wn.y), 0.0, y.g*2.0-1.0), tz = vec3((z.r*2.0-1.0)*sign(wn.z), z.g*2.0-1.0, 0.0);
          pert = tx*b.x + ty*b.y + tz*b.z; return x*b.x + y*b.y + z*b.z; }
        #endif`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 lWn = normalize(vLWn); vec3 lPert = vec3(0.0); float lMask = 0.0, lGr = 0.0;
          { vec3 wp = vLWp;
            float mc = ln(wp*0.045)*0.55 + ln(wp*0.19)*0.3 + ln(wp*0.9)*0.15;
            diffuseColor.rgb *= 1.0 + (mc-0.5)*uLmacro*1.6;
            #ifdef LOOK_TRI
              vec4 d = triD(wp, lWn, uLdS, lPert);
              #ifdef LOOK_GROUND
                vec3 p2; vec4 d2 = triD(wp + 13.7, lWn, uLdS*3.9, p2); d = mix(d, d2, 0.5); lPert = (lPert + p2)*1.25;
                diffuseColor.rgb *= 0.55 + d.a*0.9;
              #else
                diffuseColor.rgb *= 1.0 + (d.a-0.5)*uLdA;
              #endif
              lGr = d.b;
            #endif
            #ifndef LOOK_GROUND
              float vert = 1.0 - abs(lWn.y);
              float low = 1.0 - smoothstep(0.0, 1.5, wp.y);
              float streak = ln(vec3(wp.x*2.3 + wp.z*2.1, wp.y*0.22, wp.x*0.4 - wp.z*0.4));
              float dirt = low*(0.45 + 0.55*ln(wp*2.7)) + smoothstep(0.55,0.95,streak)*0.55*vert*smoothstep(0.0,3.0,wp.y);
              diffuseColor.rgb *= 1.0 - clamp(dirt*uLgrime*0.55, 0.0, 0.8)*vert;
              lMask = low*uLgrime;
            #endif
            if (uLwet > 0.0) { float pud = smoothstep(0.44, 0.58, ln(vec3(wp.x*0.33, 0.0, wp.z*0.33))*0.7 + ln(wp*1.3)*0.3) * smoothstep(0.7, 0.96, lWn.y);
              diffuseColor.rgb *= 1.0 - pud*0.55*uLwet; if (pud > 0.0) lGr = -pud*uLwet; }
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          { float rr = roughnessFactor + uLrough;
            #ifdef LOOK_TRI
              rr += (lGr - 0.55)*uLdR*step(0.0, lGr);
            #endif
            rr += lMask*0.12 + (ln(vLWp*3.1)-0.5)*0.12*uLdR;
            if (lGr < 0.0) rr = mix(rr, 0.05, clamp(-lGr*1.6, 0.0, 1.0));
            roughnessFactor = clamp(rr, 0.04, 1.0); }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec3 wpert = lPert*uLdN*0.55;
            float fine = 0.0;
            vec3 g = vec3(ln(vLWp*14.0+vec3(5.2,0.,0.)), ln(vLWp*14.0+vec3(0.,9.1,0.)), ln(vLWp*14.0+vec3(0.,0.,3.3))) - 0.5;
            wpert += g*0.045*uLdN;
            normal = normalize(normal + (viewMatrix * vec4(wpert, 0.0)).xyz); }`);
    };
    mat.customProgramCacheKey = () => 'rrlook-' + variant + (mat.normalMap ? 'n' : '');
    mat.needsUpdate = true;
  },
  enhanceScene(scene) {
    scene.traverse(o => { const m = o.material; if (!m) return; if (Array.isArray(m)) m.forEach(x => this.enhance(x)); else this.enhance(m); });
  },

  // ---------- image based lighting ----------
  _envScene() {
    if (this._es) return this._es;
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGnd: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunK: { value: 1 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 uZen, uHor, uGnd, uSun, uSunCol; uniform float uSunK;
        void main(){ vec3 d = normalize(vD); float e = d.y; vec3 c = e > 0.0 ? mix(uHor, uZen, pow(e, 0.55)) : mix(uHor*0.7 + uGnd*0.3, uGnd, smoothstep(0.0, 0.3, -e));
          float s = max(dot(d, uSun), 0.0); c += uSunCol*(pow(s, 18.0)*0.35 + pow(s, 160.0)*2.0)*uSunK; gl_FragColor = vec4(c, 1.0); }` });
    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), m)); return this._es = { sc, m };
  },
  _bake(key, p) {
    if (this._envKey === key) return; this._envKey = key; const { sc, m } = this._envScene(), u = m.uniforms;
    u.uZen.value.copy(p.zen); u.uHor.value.copy(p.hor); u.uGnd.value.copy(p.gnd); u.uSun.value.copy(p.sun); u.uSunCol.value.copy(p.sunCol); u.uSunK.value = p.sunK;
    const rt = this.pmrem.fromScene(sc, 0, 1, 100); if (this._envRT) this._envRT.dispose(); this._envRT = rt; this.skyEnvTex = rt.texture;
  },
  dimEnv() {   // neutral low light for ship interiors / space so metal never goes pure black
    if (!this._dimEnv) { const { sc, m } = this._envScene(); const u = m.uniforms; u.uZen.value.setRGB(0.1, 0.12, 0.16); u.uHor.value.setRGB(0.16, 0.17, 0.2); u.uGnd.value.setRGB(0.07, 0.065, 0.06); u.uSunK.value = 0; u.uSunCol.value.setRGB(0, 0, 0); this._dimEnv = this.pmrem.fromScene(sc, 0, 1, 100).texture; this._envKey = null; }
    return this._dimEnv;
  },

  // ---------- per-frame light work for the planet surface (also used by lab.html) ----------
  // o: { L day level 0..1, sunDir, uSky, uHor (Colors), air bool, pal [r,g,b] ground colour, seed, indoor 0..1 }
  skyEnv(sc, o) {
    const c = this.cfg, L = o.L, air = o.air, I = o.indoor || 0;
    const key = `${this.id}|${o.seed}|${Math.round(L * 12)}|${Math.round(o.sunDir.x * 6)},${Math.round(o.sunDir.y * 6)},${Math.round(o.sunDir.z * 6)}`;
    if (this._envKey !== key) {
      const day = Math.max(0.02, L), pal = o.pal || [0.3, 0.27, 0.22];
      const zen = o.uSky.clone().multiplyScalar(air ? 0.75 * (0.1 + 0.9 * day) : 0.005), hor = o.uHor.clone().multiplyScalar(air ? 0.95 * (0.08 + 0.92 * day) : 0.01);
      if (air && L < 0.55 && L > 0.04) hor.lerp(new THREE.Color(1.0, 0.45, 0.18), (0.55 - Math.abs(L - 0.28) * 2) * 0.5);
      if (air) { const gl = c.glow, k = (1 - Math.min(1, L * 1.6)); hor.r += gl[0] * k; hor.g += gl[1] * k; hor.b += gl[2] * k; zen.r += gl[0] * k * 0.4; zen.g += gl[1] * k * 0.4; zen.b += gl[2] * k * 0.4; }   // night city/aurora glow so wet ground has something to mirror
      const gnd = new THREE.Color(pal[0], pal[1], pal[2]).multiplyScalar(0.55 * day * (air ? 1 : 0.6) + 0.01);
      this._bake(key, { zen, hor, gnd, sun: o.sunDir, sunCol: new THREE.Color(1, 0.88, 0.7).multiplyScalar(day), sunK: air ? 1 : 0.5 });
    }
    sc.environment = this.skyEnv_tex(); sc.environmentIntensity = c.env * (1 - 0.94 * I);
  },
  skyEnv_tex() { return this.skyEnvTex; },
  balance(hemi, sun, I = 0) {   // scale the base lights timeOfDay() just set by the look and by how indoors the player is
    const c = this.cfg; hemi.intensity *= c.hemi * (1 - 0.7 * I); sun.intensity *= c.sun; sun.color.multiply(new THREE.Color(...c.sunTint));
  },
  fogFor(sc, air, airThick) {   // exponential aerial perspective instead of a hard linear fog
    if (sc.fog && sc.fog.isFog) { const col = sc.fog.color; sc.fog = new THREE.FogExp2(col.getHex(), 1); sc.fog.color = col; }
    if (sc.fog && sc.fog.isFogExp2) sc.fog.density = (air ? (airThick > 0.7 ? 0.00034 : 0.00022) : 0.00003) * this.cfg.fog;
  },
  surfaceFrame(surf, p) {
    const L = surf.dayLevel ?? 1; this.day = L; let ind = 0;
    for (const b of surf.buildings || []) if (Math.abs(p.x - b.x) < b.w / 2 - 0.15 && Math.abs(p.z - b.z) < b.d / 2 - 0.15 && p.y < 6) { ind = 1; break; }
    this.indoor += (ind - this.indoor) * 0.12; const u = surf.sky.mat.uniforms, air = surf.air > 0.3;
    this.skyEnv(surf.scene, { L, sunDir: surf.sunDir, uSky: u.uSky.value, uHor: u.uHor.value, air, pal: surf.K?.pal?.[0], seed: surf.planet?.seed, indoor: this.indoor });
    this.balance(surf.hemi, surf.sun, this.indoor); this.fogFor(surf.scene, air, surf.air);
  },

  // ---------- post stack ----------
  _buildPost() {
    const r = this.renderer, size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt); this.composer.setPixelRatio(1); this.composer.setSize(size.x, size.y);
    this.rp = new RenderPass(null, null); this.composer.addPass(this.rp);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.6, 0.9); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, sat: { value: 1 }, con: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) }, vig: { value: 0.2 }, grain: { value: 0.03 }, t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, con, vig, grain, t; uniform vec3 tint; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126,0.7152,0.0722));
          c = mix(vec3(l), c, sat); c = (c - 0.5)*con + 0.5; c *= tint;
          vec2 q = vUv - 0.5; c *= 1.0 - vig*smoothstep(0.25, 0.85, dot(q,q)*2.0);
          c += (h(vUv*vec2(1731.0,1093.0) + t) - 0.5)*grain; gl_FragColor = vec4(max(c, 0.0), 1.0); }` });
    this.composer.addPass(this.grade); this.set(this.id, true);
  },
  resize(w, h) { if (!this.composer) return; const s = this.renderer.getDrawingBufferSize(new THREE.Vector2()); this.composer.setSize(s.x, s.y); this.bloom.resolution.set(s.x, s.y); },

  render(scene, camera, dt = 0.016) {
    const r = this.renderer; this._frame++; for (const h of this.hooks) h(dt);
    const seen = this._scenesSeen.get(scene);
    if (!seen || this._frame % 150 === 0) { this.enhanceScene(scene); this._scenesSeen.set(scene, true); }
    if (!scene.environment) { scene.environment = this.dimEnv(); scene.environmentIntensity = scene.userData.envK ?? 0.5; }
    // auto-drop quality if the machine can't hold ~40 fps (never when the user pinned a tier or under automation)
    if (this.autoTier) { this._ema = (this._ema ?? 0.016) * 0.97 + Math.min(dt, 0.1) * 0.03; if (this._ema > 0.026 && this.tier !== 'off') { this._slow = (this._slow || 0) + 1; if (this._slow > 90) { this._slow = 0; this._ema = 0.016; this.setTier(this.tier === 'high' ? 'med' : 'off'); } } else this._slow = 0; }
    if (this.tier === 'off' || !this.composer) { r.render(scene, camera); return; }
    this.rp.scene = scene; this.rp.camera = camera; this.bloom.enabled = this.tier === 'high'; this.grade.uniforms.t.value = (this._frame % 97) * 0.37;
    this.composer.render(dt);
  },
};
