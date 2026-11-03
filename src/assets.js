// Real CC0 glTF models (Poly Haven, Kenney, Quaternius; see docs/LICENSES.md). Loaded once, cloned per use.
// Everything degrades to the old procedural meshes in models.js until a file has loaded, and for good if it fails (logged, never thrown).
import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';

const PH = (id) => `assets/models/polyhaven/${id}/${id}.gltf`, QU = (id) => `assets/models/quaternius/${id}.glb`;
// Guns are normalised: longest axis -> z, muzzle toward -z, origin at the grip (rear ~30% of length, mid height), scaled to `len` metres.
export const GUN_MODELS = {
  pistol:      { url: QU('pistol'), len: 0.2 },
  hpistol:     { url: QU('hpistol'), len: 0.24 },
  pulsepistol: { url: QU('pulsepistol'), len: 0.21 },
  coach:       { url: QU('coach'), len: 0.46 },
  rifle:       { url: QU('rifle'), len: 0.95 },
  breacher:    { url: QU('breacher'), len: 0.72 },
  shotgun:     { url: QU('shotgun'), len: 0.95 },
  arc:         { url: QU('arc'), len: 0.7 },
  pulsecarbine:{ url: QU('pulsecarbine'), len: 0.6 },
  scatter:     { url: QU('scatter'), len: 0.8 },
  railrifle:   { url: QU('railrifle'), len: 0.95 },
};
// Loose items: `size` = longest dimension in metres, optional tint multiplies the base colour (rocks take the ore colour).
export const ITEM_MODELS = {
  _rockA: { url: PH('moon_rock_01'), size: 0.08 }, _rockB: { url: PH('moon_rock_03'), size: 0.075 }, _rockC: { url: PH('moon_rock_05'), size: 0.07 }, _rockD: { url: PH('stone_01'), size: 0.08 },
  ammo: { url: PH('ammo_box'), size: 0.1 }, ration: { url: PH('long_life_food'), size: 0.09 }, water: { url: PH('can_rusted'), size: 0.1, tint: 0x9cc8ff },
  fuel: { url: PH('small_oil_can_01'), size: 0.1, tint: 0xb6ff9a },
};
export const ASSET = { version: 0, failed: [] };
const loader = new GLTFLoader(); const store = new Map();   // url -> THREE.Group | null
function load(url) {
  return new Promise((res) => loader.load(url, (g) => {
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const m = o.material; if (m) { if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 8; } m.side = THREE.FrontSide; } } });
    store.set(url, g.scene); ASSET.version++; res(true);
  }, undefined, (e) => { console.warn('[assets] failed', url, e && e.message); ASSET.failed.push(url); store.set(url, null); res(false); }));
}
export function preloadAssets() { const urls = new Set([...Object.values(GUN_MODELS), ...Object.values(ITEM_MODELS)].map(m => m.url)); return Promise.all([...urls].map(load)); }

const _b = new THREE.Box3(), _s = new THREE.Vector3(), _c = new THREE.Vector3();
function cloneModel(url) {
  const src = store.get(url); if (!src) return null; const c = src.clone(true);
  c.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); }); return c;
}
export function gunModel(id) {
  const cfg = GUN_MODELS[id]; if (!cfg) return null; const raw = cloneModel(cfg.url); if (!raw) return null;
  const wrap = new THREE.Group(); wrap.add(raw); raw.rotation.y = Math.PI / 2;     // Quaternius guns point +x; game convention is muzzle toward -z
  wrap.updateMatrixWorld(true); _b.setFromObject(raw); _b.getSize(_s); raw.scale.multiplyScalar(cfg.len / Math.max(_s.x, _s.y, _s.z));
  wrap.updateMatrixWorld(true); _b.setFromObject(raw); _b.getSize(_s); _b.getCenter(_c);
  raw.position.set(-_c.x, -(_b.max.y - _s.y * 0.38), -(_b.max.z - _s.z * 0.3));      // origin at the grip: 30% in from the rear, a little below the top
  wrap.userData.glb = true; return wrap;
}
export function itemModel(id, hex) {
  const cfg = ITEM_MODELS[id]; if (!cfg) return null; const raw = cloneModel(cfg.url); if (!raw) return null;
  const wrap = new THREE.Group(); wrap.add(raw); wrap.updateMatrixWorld(true); _b.setFromObject(raw); _b.getSize(_s); const k = cfg.size / Math.max(_s.x, _s.y, _s.z); raw.scale.multiplyScalar(k);
  wrap.updateMatrixWorld(true); _b.setFromObject(raw); _b.getCenter(_c); raw.position.set(-_c.x, -_b.min.y, -_c.z);
  const tint = hex != null ? hex : cfg.tint; if (tint != null) raw.traverse((o) => { if (o.isMesh) { for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.color.multiply(new THREE.Color(tint)); } });
  wrap.userData.glb = true; return wrap;
}
