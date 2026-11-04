// Modular humans: realistic-proportioned rig, face, hair, and swappable clothing layers (outfits can be stolen)
import * as THREE from '../vendor/three.module.js';
import { rng } from './util.js';

const SKINS = [0xf1cba5, 0xe0ac84, 0xc68a5c, 0x9a6540, 0x70452a, 0x4d2f1d, 0xf6d9bd];
const HAIRC = [0x1a1210, 0x2e1c10, 0x4b2e17, 0x7a5326, 0xb08a4a, 0xc8c0b0, 0x7a2a18, 0x20262e];
const HAIRS = ['short', 'buzz', 'long', 'ponytail', 'bald', 'afro', 'bob', 'crop'];

export function makeLook(seed) {
  const r = rng(seed >>> 0);
  return { skin: r.pick(SKINS), hair: r.pick(HAIRS), hairColor: r.pick(HAIRC), eye: r.pick([0x3a5a8a, 0x4a3320, 0x2f6a4a, 0x6a6a6a]), height: r.range(0.94, 1.07), bulk: r.range(0.9, 1.15), nose: r.range(0.8, 1.3), jaw: r.range(0.9, 1.1), female: r.chance(0.45), beard: r.chance(0.2), seed };
}

// outfit slots: top, bottom, shoes, head, gloves, extra. Each is {kind,color,accent} or null.
export const OUTFITS = {
  ranger: { name: 'Ranger kit', top: { kind: 'jacket', color: 0x3a5c3a, accent: 0xb08a4a }, bottom: { kind: 'cargo', color: 0x4a4636 }, shoes: { kind: 'boots', color: 0x2c2118 }, head: null, gloves: null, tags: ['civilian'] },
  underwear: { name: 'Underwear', top: null, bottom: { kind: 'shorts', color: 0xd9d4c8 }, shoes: null, head: null, gloves: null, tags: ['naked'] },
  police: { name: 'Patrol uniform', top: { kind: 'uniform', color: 0x1d2c4a, accent: 0xe6c44a }, bottom: { kind: 'pants', color: 0x131a28 }, shoes: { kind: 'boots', color: 0x0e0e10 }, head: { kind: 'copcap', color: 0x131a28, accent: 0xe6c44a }, gloves: null, tags: ['police', 'uniform'] },
  guard: { name: 'Guard uniform', top: { kind: 'uniform', color: 0x4a4f58, accent: 0xb0b6c0 }, bottom: { kind: 'pants', color: 0x2a2e36 }, shoes: { kind: 'boots', color: 0x15161a }, head: { kind: 'copcap', color: 0x2a2e36, accent: 0xb0b6c0 }, gloves: null, tags: ['police', 'guard', 'uniform'] },
  trader: { name: 'Trader coat', top: { kind: 'coat', color: 0x6a4a30, accent: 0xd9b36a }, bottom: { kind: 'pants', color: 0x2a2a30 }, shoes: { kind: 'shoes', color: 0x22180f }, head: { kind: 'hat', color: 0x3a2a1c }, gloves: null, tags: ['civilian'] },
  miner: { name: 'Miner overalls', top: { kind: 'overalls', color: 0xc47f2a, accent: 0x2a2a2a }, bottom: { kind: 'cargo', color: 0xc47f2a }, shoes: { kind: 'boots', color: 0x2c2118 }, head: { kind: 'helmet', color: 0xe8c238 }, gloves: { kind: 'gloves', color: 0x2a2a2a }, tags: ['worker'] },
  mechanic: { name: 'Mechanic coveralls', top: { kind: 'overalls', color: 0x3a5a8a, accent: 0xc8c8c8 }, bottom: { kind: 'pants', color: 0x3a5a8a }, shoes: { kind: 'boots', color: 0x1c1c1c }, head: { kind: 'cap', color: 0x2a3a5a }, gloves: { kind: 'gloves', color: 0x3a3a3a }, tags: ['worker'] },
  gunnut: { name: 'Hunter jacket', top: { kind: 'jacket', color: 0x5a4a2a, accent: 0xff7a20 }, bottom: { kind: 'cargo', color: 0x3a3a2a }, shoes: { kind: 'boots', color: 0x2a2018 }, head: { kind: 'cap', color: 0xff7a20 }, gloves: null, tags: ['civilian'] },
  scholar: { name: 'Scholar robe', top: { kind: 'coat', color: 0x4a3a6a, accent: 0xcaa0ff }, bottom: { kind: 'pants', color: 0x23202e }, shoes: { kind: 'shoes', color: 0x1a1618 }, head: null, gloves: null, tags: ['civilian'] },
  jeweler: { name: 'Jeweler vest', top: { kind: 'vest', color: 0x1f3a2a, accent: 0xe8c24a }, bottom: { kind: 'pants', color: 0x16161a }, shoes: { kind: 'shoes', color: 0x16161a }, head: null, gloves: null, tags: ['civilian'] },
  cook: { name: 'Cook whites', top: { kind: 'apron', color: 0xe9e6de, accent: 0xb03030 }, bottom: { kind: 'pants', color: 0x2a2a2a }, shoes: { kind: 'shoes', color: 0x222222 }, head: { kind: 'beanie', color: 0xe9e6de }, gloves: null, tags: ['worker'] },
  drifter: { name: 'Drifter poncho', top: { kind: 'coat', color: 0x6a6a5a, accent: 0x3a3a30 }, bottom: { kind: 'cargo', color: 0x3a3630 }, shoes: { kind: 'boots', color: 0x3a2a1c }, head: { kind: 'beanie', color: 0x4a4a3a }, gloves: null, tags: ['civilian'] },
};
export function outfitFor(job, seed) {
  const r = rng(seed >>> 0 ^ 0x77); const base = OUTFITS[job] || OUTFITS.drifter; const o = JSON.parse(JSON.stringify(base));
  const tint = (c, k) => { const col = new THREE.Color(c); col.offsetHSL(r.range(-.03, .03) * k, r.range(-.08, .05) * k, r.range(-.06, .06) * k); return col.getHex(); };
  if (!base.tags.includes('police')) { for (const s of ['top', 'bottom', 'shoes', 'head']) if (o[s]) o[s].color = tint(o[s].color, 3); }
  return o;
}

const mats = {};
const M = (c, o = {}) => { const k = c + JSON.stringify(o); return mats[k] || (mats[k] = Object.assign(new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, metalness: 0, ...o }), { userData: { look: { skip: true } } })); };
let fabricTex = null;
function fabric() {
  if (fabricTex) return fabricTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) { x.fillStyle = `rgba(0,0,0,${0.05 + (i % 4 ? 0.04 : 0)})`; x.fillRect(i, 0, 1, 64); x.fillRect(0, i, 64, 1); }
  fabricTex = new THREE.CanvasTexture(c); fabricTex.wrapS = fabricTex.wrapT = THREE.RepeatWrapping; fabricTex.repeat.set(6, 6); fabricTex.colorSpace = THREE.SRGBColorSpace; return fabricTex;
}
const clothMats = {};
const cloth = (c, o = {}) => { const k = c + '|' + JSON.stringify(o); return clothMats[k] || (clothMats[k] = M(c, { map: fabric(), roughness: 0.92, ...o })); };

// torso lathe profile (radius, y) from hips (y=0) to shoulders
function torsoGeo(grow = 0, female = false) {
  const p = female ? [[.13, -.08], [.155, 0], [.165, .1], [.135, .27], [.15, .38], [.155, .46], [.11, .55], [.05, .59]] : [[.14, -.08], [.155, 0], [.155, .12], [.14, .28], [.165, .4], [.175, .48], [.12, .57], [.05, .6]];
  const pts = p.map(([r, y]) => new THREE.Vector2(r + grow, y)); const g = new THREE.LatheGeometry(pts, 20); g.scale(1.12, 1, 0.66); return g;
}
const capsule = (r, len, seg = 8) => new THREE.CapsuleGeometry(r, len, 4, seg);
function limb(parent, r0, r1, len, mat, y0 = 0) {   // tapered cylinder hanging down from pivot + round joint
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 10), mat); m.position.y = y0 - len / 2; m.castShadow = true; parent.add(m);
  const j = new THREE.Mesh(new THREE.SphereGeometry(r1, 10, 8), mat); j.position.y = y0 - len; j.castShadow = true; parent.add(j); return m;
}

export function buildHuman(look, outfit, opts = {}) {
  const root = new THREE.Group(); const L = look; const S = L.height; const B = L.bulk * (L.female ? 0.92 : 1);
  const skin = M(L.skin, { roughness: 0.62 }); const J = {};
  const hips = new THREE.Group(); hips.position.y = 0.93; root.add(hips); J.hips = hips;
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin); pelvis.scale.set(1.15 * B, 0.8, 0.8); pelvis.position.y = -0.04; hips.add(pelvis);
  const spine = new THREE.Group(); hips.add(spine); J.spine = spine;
  const torso = new THREE.Mesh(torsoGeo(0, L.female), skin); torso.scale.setScalar(1); torso.scale.x = B; torso.castShadow = true; spine.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 10), skin); neck.position.y = 0.6; spine.add(neck);
  const headG = new THREE.Group(); headG.position.y = 0.66; spine.add(headG); J.head = headG;
  // head
  headG.scale.setScalar(1.07);   // slightly large head: friendlier, more Roblox-like read at distance
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.098, 20, 16), skin); hd.scale.set(0.92, 1.12, 1.02); hd.position.y = 0.09; hd.castShadow = true; headG.add(hd);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), skin); jaw.scale.set(0.95 * L.jaw, 0.8, 1); jaw.position.set(0, 0.015, -0.015); headG.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045 * L.nose, 6), skin); nose.rotation.x = -Math.PI / 2 - 0.25; nose.position.set(0, 0.07, -0.098); headG.add(nose);
  const F = { eye: [], brow: [], iris: [] };
  const browMat = M(L.hairColor), irisM = irisMat(L.eye), eyeM = M(0xf4f2ee, { roughness: 0.3 });
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.0115, 0.02), browMat); brow.position.set(s * 0.037, 0.124, -0.09); brow.userData.keep = true; brow.userData.y0 = 0.124; headG.add(brow); F.brow.push(brow);
    const eg = new THREE.Group(); eg.position.set(s * 0.036, 0.1, -0.087); headG.add(eg); F.eye.push(eg);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 10, 8), eyeM); eye.userData.keep = true; eg.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0085, 12), irisM); iris.position.set(0, 0, -0.0135); iris.rotation.y = Math.PI; iris.userData.keep = true; eg.add(iris); F.iris.push(iris);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin); ear.scale.set(0.4, 1, 0.7); ear.position.set(s * 0.093, 0.085, 0.005); headG.add(ear);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), M(L.female ? 0x8a3a42 : 0x6a2e2e)); mouth.position.set(0, 0.032, -0.093); mouth.userData.keep = true; headG.add(mouth); F.mouth = mouth;
  const hairMat = M(L.hairColor, { roughness: 0.9 }); const hairG = new THREE.Group(); headG.add(hairG); J.hair = hairG;
  const tailG = new THREE.Group(); tailG.position.set(0, 0.13, 0.085); hairG.add(tailG); J.hairTail = tailG;   // long hair / ponytail pivot: swings with follow-through
  const cap = (r, a0, a1, sy = 1.15) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, a0, a1), hairMat); m.scale.set(0.95, sy, 1.06); m.position.y = 0.09; m.castShadow = true; return m; };
  const hs = L.hair;
  if (hs === 'short') hairG.add(cap(0.104, 0, Math.PI * 0.56)); else if (hs === 'buzz') hairG.add(cap(0.1, 0, Math.PI * 0.5)); else if (hs === 'crop') { hairG.add(cap(0.103, 0, Math.PI * 0.52)); const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), hairMat); f.position.set(0, 0.17, -0.07); hairG.add(f); }
  else if (hs === 'long') { hairG.add(cap(0.106, 0, Math.PI * 0.62)); const b = new THREE.Mesh(capsule(0.07, 0.22), hairMat); b.scale.set(1.2, 1, 0.55); b.position.set(0, -0.15, -0.01); tailG.add(b); }
  else if (hs === 'bob') { hairG.add(cap(0.106, 0, Math.PI * 0.62)); const b = new THREE.Mesh(capsule(0.08, 0.09), hairMat); b.scale.set(1.25, 1, 0.9); b.position.set(0, -0.1, -0.055); tailG.add(b); }
  else if (hs === 'ponytail') { hairG.add(cap(0.104, 0, Math.PI * 0.56)); const b = new THREE.Mesh(capsule(0.025, 0.2), hairMat); b.position.set(0, -0.08, 0.035); b.rotation.x = 0.4; tailG.add(b); }
  else if (hs === 'afro') { const a = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), hairMat); a.scale.set(1, 0.95, 1); a.position.set(0, 0.12, 0.02); hairG.add(a); }
  if (L.beard && !L.female) { const bd = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5), hairMat); bd.scale.set(0.98, 1, 1.04); bd.position.set(0, 0.04, -0.012); headG.add(bd); }
  // arms
  const armLen = 0.28 * S, foreLen = 0.26 * S;
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.2 * B, 0.52, 0); spine.add(sh); J[s < 0 ? 'armL' : 'armR'] = sh;
    limb(sh, 0.044 * B, 0.036 * B, armLen, skin, 0);
    const el = new THREE.Group(); el.position.y = -armLen; sh.add(el); J[s < 0 ? 'elbowL' : 'elbowR'] = el;
    limb(el, 0.036 * B, 0.027 * B, foreLen, skin, 0);
    const hand = new THREE.Group(); hand.position.y = -foreLen; el.add(hand); J[s < 0 ? 'handL' : 'handR'] = hand;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.09, 0.034), skin); palm.position.y = -0.05; palm.castShadow = true; hand.add(palm);
    const th = new THREE.Mesh(capsule(0.011, 0.04, 4), skin); th.position.set(-s * 0.036, -0.04, -0.012); th.rotation.z = s * 0.3; hand.add(th);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.055, 0.028), skin); fingers.position.set(0, -0.108, -0.008); fingers.rotation.x = 0.22; hand.add(fingers);
  }
  // legs
  const thighLen = 0.45 * S, shinLen = 0.43 * S;
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.095 * B, -0.06, 0); hips.add(hip); J[s < 0 ? 'legL' : 'legR'] = hip;
    limb(hip, 0.07 * B, 0.05, thighLen, skin, 0);
    const kn = new THREE.Group(); kn.position.y = -thighLen; hip.add(kn); J[s < 0 ? 'kneeL' : 'kneeR'] = kn;
    limb(kn, 0.05, 0.036, shinLen, skin, 0);
    const foot = new THREE.Group(); foot.position.y = -shinLen; kn.add(foot); J[s < 0 ? 'footL' : 'footR'] = foot;
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.22), skin); f.position.set(0, -0.025, -0.05); f.castShadow = true; foot.add(f);
  }
  root.userData = { J, look, outfit: null, clothG: new THREE.Group(), S, B, face: F, P: personality(look) };
  root.add(root.userData.clothG);
  bakeBody(root);
  root.scale.setScalar(S);
  setOutfit(root, outfit || OUTFITS.ranger);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}

// ---- clothing layers ----
export function setOutfit(h, outfit) {
  const U = h.userData; const J = U.J; U.outfit = outfit;
  // remove old
  for (const o of [...(U.cloth || [])]) o.parent && o.parent.remove(o); U.cloth = []; U.skirt = null;
  const add = (parent, mesh) => { parent.add(mesh); mesh.castShadow = true; U.cloth.push(mesh); return mesh; };
  const B = U.B, S = U.S; const fem = U.look.female;
  const armLen = 0.28 * S, foreLen = 0.26 * S, thighLen = 0.45 * S, shinLen = 0.43 * S;
  const sleeve = (kind, mat, long) => {
    for (const s of [-1, 1]) {
      const sh = J[s < 0 ? 'armL' : 'armR'], el = J[s < 0 ? 'elbowL' : 'elbowR'];
      const up = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * B, 0.043 * B, armLen * (long ? 1 : 0.55), 10), mat); up.position.y = -armLen * (long ? 0.5 : 0.275); add(sh, up);
      const sp = new THREE.Mesh(new THREE.SphereGeometry(0.05 * B, 10, 8), mat); sp.position.y = 0; add(sh, sp);
      if (long) { const lo = new THREE.Mesh(new THREE.CylinderGeometry(0.042 * B, 0.034 * B, foreLen * 0.94, 10), mat); lo.position.y = -foreLen * 0.47; add(el, lo); const jt = new THREE.Mesh(new THREE.SphereGeometry(0.043 * B, 10, 8), mat); add(el, jt); }
    }
  };
  const t = outfit.top;
  if (t) {
    const mat = cloth(t.color), acc = M(t.accent ?? t.color, { roughness: 0.6 });
    const body = new THREE.Mesh(torsoGeo(0.012, fem), mat); body.scale.x = B; add(J.spine, body);
    if (t.kind === 'jacket' || t.kind === 'uniform' || t.kind === 'coat') sleeve(t.kind, mat, true); else if (t.kind === 'overalls' || t.kind === 'apron') sleeve(t.kind, mat, t.kind === 'overalls'); else if (t.kind === 'vest') { /* bare arms */ }
    if (t.kind === 'jacket' || t.kind === 'uniform' || t.kind === 'coat') { const col = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 14), mat); col.rotation.x = Math.PI / 2; col.position.y = 0.59; add(J.spine, col); const zip = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.5, 0.01), acc); zip.position.set(0, 0.3, -0.108 * 1.0); add(J.spine, zip); }
    if (t.kind === 'jacket' || t.kind === 'uniform' || t.kind === 'coat') {
      const dk = M(new THREE.Color(t.color).multiplyScalar(0.62).getHex(), { roughness: 0.9 }), under = M(new THREE.Color(t.color).lerp(new THREE.Color(0xe8e4da), 0.7).getHex(), { roughness: 0.9 });
      for (const s of [-1, 1]) { const el = J[s < 0 ? 'elbowL' : 'elbowR']; const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036 * B, 0.036 * B, 0.03, 10), dk); cuff.position.y = -foreLen * 0.93; add(el, cuff); }
      if (t.kind !== 'coat') { const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 18), dk); hem.scale.set(1.13 * B, 1, 0.668); hem.position.y = -0.005; add(J.spine, hem); }
      const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.1, 0.02), under); shirt.position.set(0, 0.54, -0.083); add(J.spine, shirt);   // undershirt peeks out of the open collar
      if (t.kind === 'jacket') for (const s of [-1, 1]) { const pk = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.07, 0.014), dk); pk.position.set(s * 0.085 * B, 0.2, -0.101); add(J.spine, pk); }
    }
    if (t.kind === 'uniform') {
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.01), M(0xe9e6de)); tag.position.set(-0.07 * B, 0.44, -0.109); add(J.spine, tag);
      for (const s of [-1, 1]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.045), acc); ep.position.set(s * 0.17 * B, 0.58, 0); add(J.spine, ep); }
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 5), M(0xe6c44a, { metalness: 0.8, roughness: 0.3 })); badge.rotation.x = Math.PI / 2; badge.position.set(0.075 * B, 0.42, -0.112); add(J.spine, badge);
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158 * B, 0.158 * B, 0.045, 18), M(0x15151a, { roughness: 0.5 })); belt.scale.z = 0.7; belt.position.y = 0.03; add(J.spine, belt);
      const hol = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), M(0x15151a)); hol.position.set(0.16 * B, -0.02, 0); add(J.spine, hol);
    }
    if (t.kind === 'coat') {   // skirt is two open half-shells riding on the thighs: front/back panels swing and fold with each leg instead of one rigid tube the legs poke through
      const cm = cloth(t.color, { side: THREE.DoubleSide });
      for (let k = 0; k < 3; k++) { const bt = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), acc); bt.position.set(0.012, 0.12 + k * 0.12, -0.112); add(J.spine, bt); }
      const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.045, 18), acc); sash.scale.set(1.13 * B, 1, 0.668); sash.position.y = 0.03; add(J.spine, sash);
      for (const s of [-1, 1]) { const hipJ = new THREE.Group(); hipJ.position.set(0, -0.06, 0); J.hips.add(hipJ); U.cloth.push(hipJ); (U.skirt = U.skirt || {})[s < 0 ? 0 : 1] = hipJ; const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * B, 0.27 * B, 0.46 * S, 14, 1, true, s < 0 ? Math.PI - 0.04 : -0.04, Math.PI + 0.08), cm); sk.scale.z = 0.72; sk.position.set(0, 0.11 - 0.23 * S, 0); add(hipJ, sk); }
    } else U.skirt = null;
    if (t.kind === 'overalls') { for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.01), acc); st.position.set(s * 0.07 * B, 0.44, -0.105); st.rotation.z = s * 0.1; add(J.spine, st); } const bib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.01), mat); bib.position.set(0, 0.28, -0.106); add(J.spine, bib); const pkt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.008), acc); pkt.position.set(0, 0.26, -0.113); add(J.spine, pkt); for (const s of [-1, 1]) { const bn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), M(0xb8b8b0, { metalness: 0.8, roughness: 0.3 })); bn.position.set(s * 0.085 * B, 0.34, -0.113); add(J.spine, bn); } }
    if (t.kind === 'apron') { const ap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.46, 0.012), M(t.accent ?? 0xffffff)); ap.position.set(0, 0.2, -0.112); add(J.spine, ap); }
    if (t.kind === 'vest') { const v = new THREE.Mesh(torsoGeo(0.02, fem), cloth(t.color)); v.scale.x = B; v.scale.y = 0.9; add(J.spine, v); const sh = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 12), acc); sh.rotation.x = Math.PI / 2; sh.position.y = 0.55; add(J.spine, sh); }
    if (t.kind === 'tshirt') sleeve(t.kind, mat, false);
  }
  const b = outfit.bottom;
  if (b) {
    const mat = cloth(b.color); const short = b.kind === 'shorts';
    const hipb = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), mat); hipb.scale.set(1.15 * B, 0.78, 0.82); hipb.position.y = -0.045; add(J.hips, hipb);
    for (const s of [-1, 1]) {
      const hip = J[s < 0 ? 'legL' : 'legR'], kn = J[s < 0 ? 'kneeL' : 'kneeR'];
      const th = new THREE.Mesh(new THREE.CylinderGeometry(0.074 * B, short ? 0.062 : 0.054, thighLen * (short ? 0.5 : 0.98), 12), mat); th.position.y = -thighLen * (short ? 0.25 : 0.49); add(hip, th);
      if (!short) { const k2 = new THREE.Mesh(new THREE.SphereGeometry(0.056, 10, 8), mat); add(kn, k2); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.041, shinLen * 0.97, 12), mat); sh.position.y = -shinLen * 0.485; add(kn, sh); }
      if (!short) { const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.04, 10), M(new THREE.Color(b.color).multiplyScalar(0.7).getHex(), { roughness: 0.92 })); cf.position.y = -shinLen * 0.9; add(kn, cf); const bp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.01), M(new THREE.Color(b.color).multiplyScalar(0.8).getHex(), { roughness: 0.92 })); bp.position.set(s * 0.07 * B, -0.03, 0.103); add(J.hips, bp); }
      if (b.kind === 'cargo') { const pk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.09), mat); pk.position.set(s * 0.075 * B, -thighLen * 0.5, 0); add(hip, pk); }
    }
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.153 * B, 0.155 * B, 0.04, 16), M(0x2a2218, { roughness: 0.6 })); waist.scale.z = 0.7; waist.position.y = 0.045; if (!short) { add(J.hips, waist); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.026, 0.01), M(0xc8b070, { metalness: 0.85, roughness: 0.3 })); bk.position.set(0, 0.045, -0.109); add(J.hips, bk); }
  }
  const sh = outfit.shoes;
  if (sh) {
    const mat = M(sh.color, { roughness: 0.55 });
    for (const s of [-1, 1]) {
      const foot = J[s < 0 ? 'footL' : 'footR']; const kn = J[s < 0 ? 'kneeL' : 'kneeR'];
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.27), mat); f.position.set(0, -0.03, -0.065); add(foot, f);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.02, 0.28), M(0x151515)); sole.position.set(0, -0.067, -0.065); add(foot, sole);
      const toe = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.05, 0.075), M(new THREE.Color(sh.color).multiplyScalar(0.75).getHex(), { roughness: 0.5 })); toe.position.set(0, -0.042, -0.17); add(foot, toe);
      if (sh.kind === 'shoes') { const lc = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.09), M(0xe8e4da)); lc.position.set(0, 0.0, -0.085); lc.rotation.x = 0.28; add(foot, lc); }
      if (sh.kind === 'boots') { const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10), M(0x1a1a1a)); cuff.position.y = 0.115; add(foot, cuff); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.17, 10), mat); shaft.position.y = 0.04; add(foot, shaft); }
    }
  }
  const g = outfit.gloves;
  if (g) for (const s of [-1, 1]) { const hand = J[s < 0 ? 'handL' : 'handR']; const m = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.14, 0.04), M(g.color)); m.position.y = -0.065; add(hand, m); }
  const hd = outfit.head;
  if (hd) {
    const mat = M(hd.color, { roughness: 0.7 });
    if (hd.kind === 'cap' || hd.kind === 'copcap') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat); dome.scale.set(0.97, 1.05, 1.08); dome.position.y = 0.115; add(J.head, dome);
      const vis = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.008, 0.08), mat); vis.position.set(0, 0.125, -0.115); vis.rotation.x = 0.12; add(J.head, vis);
      if (hd.kind === 'cap') { const bn = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), mat); bn.position.y = 0.226; add(J.head, bn); }
      if (hd.kind === 'copcap') { const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.005, 5), M(0xe6c44a, { metalness: .8, roughness: .3 })); bd.rotation.x = Math.PI / 2; bd.position.set(0, 0.16, -0.112); add(J.head, bd); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.107, 0.107, 0.025, 16), M(0x0a0e18)); band.position.y = 0.13; band.scale.set(.97, 1, 1.08); add(J.head, band); }
    } else if (hd.kind === 'hat') { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.107, 0.107, 0.022, 14), M(0x14100c)); band.position.y = 0.147; add(J.head, band); const br = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.008, 18), mat); br.position.y = 0.135; add(J.head, br); const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.09, 14), mat); cr.position.y = 0.18; add(J.head, cr); }
    else if (hd.kind === 'helmet') { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.114, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), mat); dome.scale.set(1, 1.05, 1.1); dome.position.y = 0.115; add(J.head, dome); const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 16), mat); rim.position.y = 0.118; rim.scale.z = 1.12; add(J.head, rim); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.03), M(0xfff6d0, { emissive: 0xfff0b0, emissiveIntensity: 0.8 })); lamp.position.set(0, 0.17, -0.12); add(J.head, lamp); }
    else if (hd.kind === 'beanie') { const bg = new THREE.Group(); bg.position.y = 0.118; bg.rotation.x = 0.24; add(J.head, bg); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.108, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth(hd.color)); dome.scale.set(0.97, 1.08, 1.07); bg.add(dome); const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.109, 0.109, 0.038, 14), cloth(new THREE.Color(hd.color).multiplyScalar(0.8).getHex())); cf.position.y = 0.0; cf.scale.set(0.97, 1, 1.07); bg.add(cf); bg.children.forEach(m => m.castShadow = true); bg.userData.skip = true; }
  }
  // hide hair under hard headwear
  J.hair.visible = !(hd && (hd.kind === 'helmet' || hd.kind === 'copcap' || hd.kind === 'hat'));
  // hair partially under caps/beanies
  if (hd && (hd.kind === 'cap' || hd.kind === 'beanie')) J.hair.scale.set(1, 0.9, 1);
  else J.hair.scale.set(1, 1, 1);
  bakeCloth(U);
  h.traverse(o => { if (o.isMesh) o.castShadow = true; });
}

// ---- geometry baking: fewer draw calls per person (same-material meshes under one joint become one mesh) ----
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
function mergeGeos(meshes) {
  let nv = 0, ni = 0; for (const m of meshes) { nv += m.geometry.attributes.position.count; ni += m.geometry.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = nv < 65535 ? new Uint16Array(ni) : new Uint32Array(ni); let vo = 0, io = 0;
  for (const m of meshes) {
    m.updateMatrix(); const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv; _nm.getNormalMatrix(m.matrix);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m.matrix); pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); nor[(vo + i) * 3] = _n.x; nor[(vo + i) * 3 + 1] = _n.y; nor[(vo + i) * 3 + 2] = _n.z;
      if (UV) { uv[(vo + i) * 2] = UV.getX(i); uv[(vo + i) * 2 + 1] = UV.getY(i); }
    }
    const I = g.index; for (let i = 0; i < I.count; i++) idx[io + i] = I.getX(i) + vo; vo += P.count; io += I.count;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); out.computeBoundingBox(); return out;
}
// merge a parent's direct mesh children that share a material; returns [removed, added]
function mergeKids(parent, only) {
  const by = new Map(), removed = [], added = [];
  for (const ch of parent.children) { if (!ch.isMesh || ch.userData.keep || (only && !only.has(ch)) || !ch.geometry.index || !ch.geometry.attributes.normal) continue; if (!by.has(ch.material)) by.set(ch.material, []); by.get(ch.material).push(ch); }
  for (const [mat, list] of by) {
    if (list.length < 2) continue; const m = new THREE.Mesh(mergeGeos(list), mat); m.castShadow = true; parent.add(m); added.push(m);
    for (const l of list) { parent.remove(l); l.geometry.dispose(); removed.push(l); }
  }
  return [removed, added];
}
function bakeBody(root) { const J = root.userData.J; const seen = new Set(); for (const k in J) { const g = J[k]; if (!seen.has(g)) { seen.add(g); mergeKids(g); } } }
function bakeCloth(U) {
  const only = new Set(U.cloth), parents = new Set(); for (const o of U.cloth) if (o.isMesh && o.parent) parents.add(o.parent);
  for (const p of parents) { const [rm, ad] = mergeKids(p, only); if (rm.length) { const s = new Set(rm); U.cloth = U.cloth.filter(o => !s.has(o)); U.cloth.push(...ad); } }
}
const irisCache = {};
function irisMat(color) {
  if (irisCache[color]) return irisCache[color];
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const col = new THREE.Color(color), css = '#' + col.getHexString(), dk = '#' + col.clone().multiplyScalar(0.45).getHexString();
  const gr = x.createRadialGradient(32, 32, 4, 32, 32, 31); gr.addColorStop(0, css); gr.addColorStop(0.75, css); gr.addColorStop(1, dk); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#07070a'; x.beginPath(); x.arc(32, 32, 13, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(24, 23, 5, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return irisCache[color] = Object.assign(new THREE.MeshStandardMaterial({ map: t, roughness: 0.2 }), { userData: { look: { skip: true } } });
}

// ---- personality (seeded per person): gait, posture, gesture size, fidget habits ----
function personality(look) {
  const r = rng(((look && look.seed) >>> 0 ^ 0x51ed) >>> 0);
  return { off: r.range(0, 100), stride: r.range(0.92, 1.1), cad: r.range(0.93, 1.08), swagger: r.range(0.5, 1.6), arms: r.range(0.75, 1.25), slouch: r.range(-0.02, 0.07), headFwd: r.range(0, 0.06), talky: r.range(0.65, 1.35), fidget: r.range(0.6, 1.6), blink: r.range(2.2, 5), glance: r.range(0.7, 1.6), bounce: r.range(0.8, 1.25), tilt: r.range(-0.05, 0.05) };
}
const TRAITS = { tired: { slouch: 0.09, arms: 0.8, cad: 0.9, fidget: 0.6, bounce: 0.7 }, nervous: { fidget: 1.8, glance: 1.9, blink: 1.6, cad: 1.06 }, proud: { slouch: -0.05, swagger: 1.4, bounce: 1.1 }, warm: { talky: 1.3 }, sly: { tilt: 0.07, glance: 1.4 }, dry: { talky: 0.8 } };
export function setTrait(h, trait) { const P = h.userData.P, T = TRAITS[trait]; if (!T) return; for (const k in T) { if (k === 'blink') P.blink = Math.min(P.blink, 5) / T[k]; else if (k === 'slouch' || k === 'tilt') P[k] = T[k]; else P[k] *= T[k]; } }

// ---- animation ----
// o: {v (m/s, preferred) | speed (legacy v/1.7), crouch (0..1), arms ('relaxed'|'gun'|'lowgun'|'wallhands'), aim (0..1), pitch, look, idleT, dt,
//     strafe (-1..1, +right), back (0/1), air (bool), vy, ko, supine,
//     NPC life: talk (0..1), wave (0..1), sit (0..1), work ('counter'|'console'), gaze {x,y,z} world point, mood (-1 angry .. 1 raised/happy), fidget (false disables), robot:false}
// Leg rig numbers: thigh/shin lengths are in the body's local space; SOLE is how far the boot/foot mesh hangs below the ankle joint.
const HIP_DROP = 0.06, SOLE = 0.078, TOE = 0.206, HEEL = 0.076;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t, ease = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const approach = (c, t, d) => c < t ? Math.min(t, c + d) : Math.max(t, c - d), sstep = (x) => x * x * (3 - 2 * x);
const spring = (A, k, target, ks, dm, dt) => { A[k + 'V'] += (ks * (target - A[k]) - dm * A[k + 'V']) * dt; A[k] += A[k + 'V'] * dt; };
const NaNv = NaN;
// arm poses [Lx,Ly,Lz,Lelbow, Rx,Ry,Rz,Relbow]; NaN = leave the base pose alone
const POSE = {
  scratch: [NaNv, NaNv, NaNv, NaNv, 2.25, 0.0, -0.5, 2.4], cross: [0.5, 0.95, 0.3, 2.15, 0.5, -0.95, -0.3, 2.15], hips: [-0.3, 1.0, 0.65, 1.75, -0.3, -1.0, -0.65, 1.75],
  stretch: [2.9, 0, 0.3, 0.15, 2.9, 0, -0.3, 0.15], watch: [0.55, 0.85, 0.1, 1.95, NaNv, NaNv, NaNv, NaNv], lap: [0.45, 0.35, 0.1, 1.25, 0.45, -0.35, -0.1, 1.25],
};
const FID = ['scratch', 'cross', 'hips', 'stretch', 'watch', 'look', 'look', 'shift'];
const pb = new Float32Array(8), pg = new Float32Array(8), pl = new Float32Array(8), pw = new Float32Array(8), pt = new Float32Array(8);
const mixP = (P, Q, w) => { if (w <= 0.001) return; for (let i = 0; i < 8; i++) if (Q[i] === Q[i]) P[i] += (Q[i] - P[i]) * w; };
const newState = () => ({ init: false, tc: 0, t: 0, yaw: 0, turn: 0, v: 0, vPrev: 0, ph: 0, turnPh: 0, cr: 0, air: 0, wasAir: false, vyPrev: -4, lead: 0, land: 0, landT: 9, back: 0, strafe: 0, mRel: 1, mGun: 0, mLow: 0, mWall: 0, talk: 0, wave: 0, sit: 0, workC: 0, workK: 0, ko: 0, sup: 0, gz: 0, lyaw: 0, lpit: 0, glT: 1, gY: 0, gP: 0, fidT: 4, fidK: null, fidW: 0, fidD: 0, hit: 0, hitX: 0, blinkT: 0, nextBlink: 2, mouth: 0, brow: 0, sk: 0, skV: 0, hr: 0, hrV: 0, hz: 0, hzV: 0, pk: 0, pkV: 0, pb: 0, pbV: 0, sprint: 0 });
export function hitReact(h, strength = 1, fromX, fromZ) {   // flinch: pass the attacker's world x,z to lean away from it
  const A = h.userData.A || (h.userData.A = newState()); A.hit = Math.min(1.2, Math.max(A.hit, 0.5 * strength + 0.4));
  if (fromX !== undefined) { const a = Math.atan2(-(fromX - h.position.x), -(fromZ - h.position.z)) - h.rotation.y; A.hitX = Math.sin(wrap(a)); }
}

export function animateHuman(h, o = {}) {
  const U = h.userData, J = U.J, S = U.S || 1, P = U.P || (U.P = personality(U.look)), A = U.A || (U.A = newState());
  if (h.rotation.order !== 'YXZ') h.rotation.order = 'YXZ';   // yaw first, then tip over about the body's own axis
  let dt = o.dt; if (dt === undefined) { const now = performance.now(); dt = A.tc ? (now - A.tc) / 1000 : 0.016; A.tc = now; } dt = clamp(dt, 0.0005, 0.1);
  const first = !A.init; A.init = true; A.t += dt; const t = A.t + P.off;
  const T = 0.45 * S, Sh = 0.43 * S, base = HIP_DROP + SOLE + T + Sh;   // hip height that puts the soles exactly on the floor when standing
  // --- knocked out / asleep: smooth fall (and smooth get-up), then a limp pose
  const koWant = o.ko ? 1 : 0; if (first) { A.ko = koWant; A.sup = o.supine ? 1 : 0; }
  A.ko = approach(A.ko, koWant, dt / (koWant ? 0.5 : 0.9)); if (o.ko) A.sup = o.supine ? 1 : 0;
  const F = U.face;
  if (A.ko >= 1) { koPose(h, J, A, base, 1); if (F) faceUpdate(F, A, o, dt, t, P, true); h.rotation.x = A.sup ? Math.PI / 2 : -Math.PI / 2; return; }
  // --- state estimation: speed, turning, acceleration
  const yawRate = first ? 0 : wrap(h.rotation.y - A.yaw) / dt; A.yaw = h.rotation.y; A.turn = ease(A.turn, clamp(yawRate, -9, 9), 10, dt);
  let v = o.v !== undefined ? o.v : (o.speed || 0) * 1.7; if (o.air) v = Math.min(v, 99);
  A.vPrev = A.v; A.v = first ? v : ease(A.v, v, v > A.v ? 9 : 7, dt); const vS = A.v, acc = clamp((A.v - A.vPrev) / dt, -14, 14);
  const turnV = Math.abs(A.turn) > 0.7 && vS < 0.4 ? clamp(Math.abs(A.turn) * 0.16, 0, 0.8) : 0;   // turn in place: shuffle the feet
  const ve = Math.max(vS, turnV);
  const moveW = clamp(ve / 0.45, 0, 1), walkW = clamp(vS / 0.45, 0, 1);
  const run = clamp((vS - 3.0) / 2.6, 0, 1), jog = clamp((vS - 1.9) / 1.6, 0, 1);
  // --- weights
  const c0 = clamp(o.crouch || 0, 0, 1); A.cr = first ? c0 : ease(A.cr, c0, 22, dt);
  if (A.wasAir && !o.air && !first) { A.land = clamp(-A.vyPrev / 7, 0.3, 1); A.landT = 0; } A.wasAir = !!o.air; if (o.air) { A.vyPrev = o.vy !== undefined ? o.vy : -4; if (!A.air) A.lead = Math.sin(A.ph) > 0 ? 0 : 1; }
  A.landT += dt; const lt = A.landT, landK = A.land * (lt < 0.09 ? lt / 0.09 : Math.max(0, 1 - (lt - 0.09) / 0.34)) ** 1.5;
  A.air = first ? (o.air ? 1 : 0) : ease(A.air, o.air ? 1 : 0, 15, dt); const wa = A.air;
  const c = Math.max(A.cr, 0.6 * landK);
  A.sit = first ? (o.sit ? 1 : 0) : ease(A.sit, o.sit ? 1 : 0, 6, dt); const wsit = clamp(A.sit * 1.02, 0, 1) * (1 - wa);
  const mode = o.arms || 'relaxed';
  A.mRel = ease(A.mRel, mode === 'relaxed' ? 1 : 0, 9, dt); A.mGun = ease(A.mGun, mode === 'gun' ? 1 : 0, 9, dt); A.mLow = ease(A.mLow, mode === 'lowgun' ? 1 : 0, 9, dt); A.mWall = ease(A.mWall, mode === 'wallhands' ? 1 : 0, 9, dt);
  A.back = ease(A.back, o.back ? 1 : 0, 8, dt); A.strafe = ease(A.strafe, o.strafe || 0, 8, dt);
  const talkT = o.talk === true ? 1 : (o.talk || 0), waveT = o.wave === true ? 1 : (o.wave || 0);
  A.talk = ease(A.talk, talkT, 6, dt); A.wave = ease(A.wave, waveT, 7, dt);
  const wk = o.work; A.workC = ease(A.workC, wk === 'counter' ? 1 : 0, 6, dt); A.workK = ease(A.workK, wk === 'console' ? 1 : 0, 6, dt);
  const busy = A.talk + A.wave + A.workC + A.workK + wsit * 0.5;   // idle fidgets only when nothing else is going on
  const still = (1 - walkW) * (1 - c) * (1 - wa) * A.mRel * (1 - clamp(busy, 0, 1));
  // --- gait: own phase integrator so the step rate and stride match the ground speed (no foot skating)
  const cad = clamp(1.25 + 0.3 * ve, 1.3, 3.4) * P.cad * (1 - 0.3 * c), om = Math.PI * cad;   // radians/s of the full stride cycle
  A.ph += om * dt * (A.back > 0.5 ? -1 : 1) * (moveW > 0.02 ? 1 : 0);
  const p = A.ph, L = 0.88 * S;
  let amp = clamp(ve / (0.64 * om * L), 0, 0.5 + 0.38 * run) * P.stride * (1 - A.back * 0.2) * (1 - 0.25 * c) * (1 - 0.35 * Math.abs(A.strafe)); amp *= moveW;
  const lift = (0.55 + 0.35 * clamp(ve / 1.5, 0, 1) + 0.95 * run) * moveW * (1 - A.back * 0.2), flex = 0.1 * moveW + 0.08 * run;
  const dir = A.back > 0.5 ? -1 : 1, sw = Math.sin(p) * amp * dir, st = Math.abs(A.strafe);
  // --- idle breathing / weight shift (weighted so they vanish while walking)
  const br = Math.sin(t * 1.9), wsh = Math.sin(t * 0.43) * still * P.bounce;
  // --- legs: ground pose + air pose + sitting, then IK so the hips ride the lowest foot
  const gA0 = sw, gA1 = -sw;
  const k0 = Math.max(0, Math.sin(p * dir + 1.4)) * lift + flex + Math.max(0, wsh) * 0.14, k1 = Math.max(0, Math.sin(p * dir + 1.4 + Math.PI)) * lift + flex + Math.max(0, -wsh) * 0.14;
  const CD = 0.3, CB = 0.1, hh = T + Sh - CD, Lc = Math.hypot(hh, CB);   // crouch: hip joint 30 cm lower and 10 cm behind the ankles, so the knees travel forward over the toes like a real squat
  const kC = Math.PI - Math.acos((T * T + Sh * Sh - Lc * Lc) / (2 * T * Sh)), aC = Math.acos((T * T + Lc * Lc - Sh * Sh) / (2 * T * Lc)) + Math.atan2(CB, hh);
  const rising = clamp(((o.vy !== undefined ? o.vy : A.vyPrev) + 1) / 5, 0, 1), air = [[0.85 * rising + 0.3 * (1 - rising), 1.25 * rising + 0.45 * (1 - rising)], [-0.28 * rising - 0.05 * (1 - rising), 1.05 * rising + 0.2 * (1 - rising)]];
  const lat = st * moveW * 0.17, sx = lat * Math.sign(A.strafe || 1) * Math.sin(p), Zr = [0.03 - sx + wa * 0.05 + wsit * 0.06, -0.03 + sx - wa * 0.05 - wsit * 0.06];
  const Ar = [0, 0], Kr = [0, 0], Fr = [0, 0]; let ext = 0;
  for (let i = 0; i < 2; i++) {
    let a = (i ? gA1 : gA0) * (1 - c * 0.7) + aC * c, k = (i ? k1 : k0) * (1 - c) + kC * c;
    const ai = i === A.lead ? 0 : 1; a = lerp(a, air[ai][0], wa); k = lerp(k, air[ai][1], wa);
    a = lerp(a, 1.45, wsit); k = lerp(k, 1.5, wsit);
    Ar[i] = a; Kr[i] = k; Fr[i] = k - a - Math.max(0, -a) * 0.5 * (1 - c) * (1 - wa) * (1 - wsit);   // keep the sole level; roll onto the toes off the back foot
    const th = a - k + Fr[i], drop = SOLE * Math.cos(th) + (th < 0 ? TOE * Math.sin(-th) : HEEL * Math.sin(th));   // lowest point of the foot given its pitch
    ext = Math.max(ext, (T * Math.cos(a) + Sh * Math.cos(a - k)) * Math.cos(Zr[i]) + drop - SOLE);   // abducted legs (strafe) reach less far down
  }
  const hipsIK = base - (T + Sh) + ext;
  const hit = A.hit; A.hit = Math.max(0, A.hit - dt * 1.5); const hk = hit * hit;
  J.hips.position.y = lerp(hipsIK, base - 0.02, wa) - hk * 0.045 + (1 - c) * (1 - wsit) * Math.sin(t * 1.7) * 0.002;
  J.hips.position.x = Math.sin(p) * 0.012 * moveW * P.swagger * dir * 0 + wsh * 0.0; J.hips.position.z = CB * c;
  J.hips.rotation.y = -Math.sin(p) * 0.2 * amp * P.swagger * dir; J.hips.rotation.x = 0;
  J.hips.rotation.z = Math.cos(p) * 0.035 * moveW * P.swagger * (1 + run) * 0.5 + wsh * 0.04 + st * 0.0;
  // torso: lean into speed/accel, counter-rotate against the hips, arch on the breath
  const lean = (0.03 * clamp(ve / 1.5, 0, 1) + 0.26 * run + clamp(acc, -4, 6) * 0.012) * (1 - 0.5 * (A.mGun + A.mLow)) * (1 - wa * 0.5);
  J.spine.rotation.x = -c * 0.36 - lean + A.back * 0.05 + br * 0.011 * (1 - moveW * 0.6) + P.slouch * (1 - c) * (1 - A.mGun * 0.7) - 0.0;
  J.spine.rotation.y = Math.sin(p) * 0.3 * amp * dir * (0.7 + 0.3 * P.swagger);
  J.spine.rotation.z = -J.hips.rotation.z * 0.8 - A.strafe * 0.05 * moveW + P.tilt * still - wsh * 0.02;
  // legs
  J.legL.rotation.x = Ar[0]; J.legR.rotation.x = Ar[1];
  J.legL.rotation.z = Zr[0]; J.legR.rotation.z = Zr[1]; J.footL.rotation.z = -Zr[0]; J.footR.rotation.z = -Zr[1];   // keep the soles flat when the legs abduct
  J.legL.rotation.y = 0; J.legR.rotation.y = 0;
  J.kneeL.rotation.x = -Kr[0]; J.kneeR.rotation.x = -Kr[1]; J.footL.rotation.x = Fr[0]; J.footR.rotation.x = Fr[1];
  // --- arms: blend the base modes, then overlay fidget / talk / work / sit / wave / air
  const swing = Math.sin(p) * (0.35 + 0.5 * clamp(ve / 1.5, 0, 1) + 0.4 * run) * moveW * P.arms * dir * 0.9;
  const ar = 1 - c * 0.6, idle = Math.sin(t * 1.5) * 0.015, runE = 0.12 + run * 1.0 + jog * 0.2;
  // relaxed
  pb[0] = -swing * ar + c * 0.15 - 0.0; pb[1] = 0; pb[2] = 0.08 + idle + c * 0.1 + br * 0.008 + run * 0.12; pb[3] = runE + Math.max(0, -swing) * 0.5 + c * 0.5 + wsh * 0.0;
  pb[4] = swing * ar + c * 0.15; pb[5] = 0; pb[6] = -0.08 - idle - c * 0.1 - br * 0.008 - run * 0.12; pb[7] = runE + Math.max(0, swing) * 0.5 + c * 0.5;
  const sg = o.aim ?? 1, pitch = o.pitch || 0;
  const gunPose = (P8, up) => {
    P8[4] = 0.1 * (1 - up) + (1.25 + pitch * 0.8) * up - swing * 0.2 * (1 - up) + c * (0.35 * (1 - up) + 0.42 * up); P8[5] = 0; P8[6] = -0.06; P8[7] = 0.3 + 0.5 * (1 - up);
    P8[0] = -swing * 0.8 * (1 - up) + (1.1 + pitch * 0.8) * up + c * (0.3 * (1 - up) + 0.42 * up); P8[2] = 0.08 + 0.28 * up; P8[1] = 0.45 * up; P8[3] = 0.12 + 1.0 * up;
  };
  gunPose(pg, sg); gunPose(pl, 0);
  pw[0] = -0.6; pw[4] = -0.6; pw[1] = -0.5; pw[5] = 0.5; pw[2] = 0; pw[6] = 0; pw[3] = 1.3; pw[7] = 1.3;
  const tot = A.mRel + A.mGun + A.mLow + A.mWall || 1;
  for (let i = 0; i < 8; i++) pt[i] = (pb[i] * A.mRel + pg[i] * A.mGun + pl[i] * A.mLow + pw[i] * A.mWall) / tot;
  const rel = A.mRel / tot;   // overlays only ride on the relaxed base so they never fight the weapon hands
  // fidgets (seeded personality; idle NPCs only)
  if (o.fidget !== false && still > 0.5 && !first) {
    A.fidT -= dt * P.fidget; if (!A.fidK && A.fidT <= 0) { const r = rng((Math.floor(A.t * 7) * 2654435761 + (U.look.seed | 0)) >>> 0); A.fidK = FID[Math.floor(r() * FID.length)]; A.fidD = r.range(2.2, 4.5); A.fidW = 0; A.fidE = 0; }
  }
  if (A.fidK) { A.fidE += dt; const w = Math.min(sstep(clamp(A.fidE / 0.6, 0, 1)), sstep(clamp((A.fidD - A.fidE) / 0.7, 0, 1))); A.fidW = w * still; if (A.fidE > A.fidD) { A.fidK = null; A.fidT = 3 + (A.t * 13.7) % 5; A.fidW = 0; } } else A.fidW = 0;
  const fk = A.fidK, fw = A.fidW * rel;
  if (fk && POSE[fk]) mixP(pt, POSE[fk], fw);
  // talking gestures: beat-driven hand moves + nods
  const tw = A.talk * rel * (1 - wsit * 0.3), ta = P.talky;
  if (tw > 0.01) {
    const b1 = Math.max(0, Math.sin(t * 2.3)) ** 1.5, b2 = Math.max(0, Math.sin(t * 1.7 + 2)) ** 1.5, jit = Math.sin(t * 9) * 0.06;
    pg[4] = 0.6 + 0.55 * b1 * ta; pg[5] = -0.15 * b1; pg[6] = -0.22 - 0.2 * b1 * ta; pg[7] = 1.15 + 0.35 * b1 + jit;
    pg[0] = 0.35 + 0.5 * b2 * ta; pg[1] = 0.15; pg[2] = 0.18 + 0.12 * b2; pg[3] = 1.0 + 0.4 * b2 + jit * 0.7;
    mixP(pt, pg, tw);
  }
  // working: hands on the counter (sorting, writing) or a console (tapping)
  if (A.workC > 0.01) { pw[0] = 0.5 + Math.sin(t * 1.3) * 0.08; pw[1] = 0.3; pw[2] = 0.12; pw[3] = 0.95 + Math.sin(t * 2.4) * 0.12; pw[4] = 0.55 + Math.sin(t * 0.9 + 1) * 0.1; pw[5] = -0.3; pw[6] = -0.12; pw[7] = 1.0 + Math.max(0, Math.sin(t * 3.1)) * 0.2; mixP(pt, pw, A.workC * rel * (1 - A.talk * 0.5)); }
  if (A.workK > 0.01) { const tp = Math.sin(t * 11), tq = Math.sin(t * 9 + 1.3); pw[0] = 0.85; pw[1] = 0.25; pw[2] = 0.1; pw[3] = 1.2 + Math.max(0, tp) * 0.1; pw[4] = 0.85; pw[5] = -0.25; pw[6] = -0.1; pw[7] = 1.2 + Math.max(0, tq) * 0.1; mixP(pt, pw, A.workK * rel * (1 - A.talk * 0.5)); }
  if (wsit > 0.01) mixP(pt, POSE.lap, wsit * rel * (1 - A.workC) * (1 - A.workK) * (1 - A.talk * 0.7));
  if (A.wave > 0.01) { pw[0] = NaNv; pw[1] = NaNv; pw[2] = NaNv; pw[3] = NaNv; pw[4] = 2.45; pw[5] = Math.sin(t * 9) * 0.55; pw[6] = -0.42; pw[7] = 1.15 + Math.sin(t * 9 + 1) * 0.1; mixP(pt, pw, A.wave * rel); }
  if (wa > 0.01) { const u = rising; pl[0] = 0.9 * u - 0.1; pl[1] = 0; pl[2] = 0.3 + 0.7 * (1 - u); pl[3] = 0.6; pl[4] = 0.9 * u - 0.1; pl[5] = 0; pl[6] = -0.3 - 0.7 * (1 - u); pl[7] = 0.6; mixP(pt, pl, wa * rel); }
  if (landK > 0.01) { pw[0] = 0.7 * landK; pw[4] = 0.7 * landK; pw[1] = NaNv; pw[2] = 0.35 * landK + 0.08; pw[6] = -0.35 * landK - 0.08; pw[3] = 0.9 * landK; pw[5] = NaNv; pw[7] = 0.9 * landK; mixP(pt, pw, landK * rel * 0.6); }
  // hit flinch: arms fly up, torso recoils
  if (hk > 0.01) { pw[0] = 0.5; pw[4] = 0.5; pw[1] = NaNv; pw[5] = NaNv; pw[2] = 0.5; pw[6] = -0.5; pw[3] = 1.2; pw[7] = 1.2; mixP(pt, pw, clamp(hk, 0, 1) * rel); }
  J.armL.rotation.set(pt[0], pt[1], pt[2]); J.elbowL.rotation.x = pt[3]; J.armR.rotation.set(pt[4], pt[5], pt[6]); J.elbowR.rotation.x = pt[7];
  J.handL.rotation.set(-0.05 + A.workK * 0.15 * Math.max(0, Math.sin(t * 11)), 0, 0); J.handR.rotation.set(-0.05 + A.workK * 0.15 * Math.max(0, Math.sin(t * 9 + 1.3)), 0, A.wave * Math.sin(t * 9) * 0.35);
  // --- spine posture overlays
  const fs = fk && A.fidW > 0.01 ? A.fidW : 0;
  if (fs && fk === 'stretch') { J.spine.rotation.x += 0.2 * fs; J.head.rotation.x += 0.0; }
  if (fs && fk === 'watch') J.spine.rotation.x -= 0.06 * fs;
  if (fs && fk === 'shift') { J.hips.rotation.z += 0.07 * fs; J.spine.rotation.z -= 0.05 * fs; }
  if (A.workC > 0.01) J.spine.rotation.x -= 0.12 * A.workC; if (A.workK > 0.01) J.spine.rotation.x -= 0.06 * A.workK;
  if (A.talk > 0.01) { J.spine.rotation.y += Math.sin(t * 1.4) * 0.06 * A.talk; J.spine.rotation.x += Math.max(0, Math.sin(t * 2.3)) * -0.03 * A.talk; }
  if (hk > 0.01) { J.spine.rotation.x += 0.38 * hk; J.spine.rotation.z += A.hitX * 0.18 * hk; J.hips.position.z -= 0.0; }
  if (landK > 0.01) J.spine.rotation.x -= 0.1 * landK;
  if (wa > 0.01) J.spine.rotation.x += wa * (rising > 0.5 ? 0.05 : -0.05);
  // --- head: glances, gaze at a target, nods; stabilised against the torso so the view stays level
  let gYaw = 0, gPit = 0, gw = 0;
  if (o.gaze) { const dx = o.gaze.x - h.position.x, dz = o.gaze.z - h.position.z, rel2 = wrap(Math.atan2(-dx, -dz) - h.rotation.y - J.hips.rotation.y); if (Math.abs(rel2) < 2.3) { gw = 1; gYaw = clamp(rel2, -1.25, 1.25); const gy = o.gaze.y !== undefined ? o.gaze.y : h.position.y + 1.6 * S; gPit = clamp(Math.atan2(gy - (h.position.y + 1.55 * S), Math.hypot(dx, dz) + 0.01), -0.45, 0.45); } }
  if (o.headYaw !== undefined) { gw = 1; gYaw = clamp(o.headYaw, -1.15, 1.15); gPit = 0; }   // player: head follows the camera yaw
  A.gz = ease(A.gz, gw, 5, dt);
  A.glT -= dt * P.glance; if (A.glT <= 0) { const r = rng(((Math.floor(A.t * 11) + 1) * 2246822519 + (U.look.seed | 0)) >>> 0); A.gY = r() < 0.35 ? 0 : r.range(-0.75, 0.75); A.gP = r.range(-0.1, 0.12); A.glT = r.range(1.2, 4.5); }
  const gl = still * 0.8 + walkW * 0.25 * (1 - run);
  const lk = fk === 'look' ? A.fidW : 0, tY = lerp(A.gY * gl + (lk ? lk * Math.sin(A.fidE * 2.4) : 0), gYaw, A.gz), tP = lerp(A.gP * gl, gPit, A.gz);
  A.lyaw = ease(A.lyaw, tY, 7, dt); A.lpit = ease(A.lpit, tP, 7, dt);
  const twist = J.hips.rotation.y + J.spine.rotation.y; J.spine.rotation.y += A.lyaw * 0.22 * A.gz;
  const nod = A.talk * (Math.sin(t * 4.1) * 0.04 + Math.max(0, Math.sin(t * 2.3)) * 0.05) * P.talky;
  J.head.rotation.y = A.lyaw * (1 - 0.22 * A.gz) - twist * 0.85; J.head.rotation.z = -(J.hips.rotation.z + J.spine.rotation.z) * 0.8 + P.tilt * 0.6 + A.talk * Math.sin(t * 1.9) * 0.03;
  J.head.rotation.x = (o.look || 0) * 0.5 - J.spine.rotation.x * 0.78 + A.lpit + nod + P.headFwd * 0.5 * (1 - c) + (fk === 'watch' ? 0.35 * fs : 0) - wa * (rising > 0.5 ? 0 : 0.08) + (hk > 0.01 ? -0.3 * hk : 0) - 0.0 + (A.workC > 0.01 ? -0.22 * A.workC * (1 - A.gz) : 0);
  // --- secondary motion: coat panels, hair, backpack trail behind speed changes and turns
  spring(A, 'sk', clamp(acc * 0.025 + vS * 0.02, -0.05, 0.45), 90, 11, dt); spring(A, 'hr', clamp(-acc * 0.03 - vS * 0.03, -0.5, 0.1), 60, 6, dt); spring(A, 'hz', clamp(-A.turn * 0.06, -0.4, 0.4), 60, 6, dt);
  spring(A, 'pk', clamp(-acc * 0.012, -0.12, 0.12), 120, 10, dt); spring(A, 'pb', Math.abs(Math.sin(p)) * 0.014 * moveW * (1 + run) - landK * 0.02, 160, 12, dt);
  const sk = U.skirt; if (sk) { sk[0].rotation.x = Ar[0] * 0.5 - Math.max(0, A.sk) * 0.0 * 0; sk[1].rotation.x = Ar[1] * 0.5 - Math.max(0, A.sk); sk[0].rotation.z = sk[1].rotation.z = 0; }   // front panel hugs the leg; the back panel trails behind
  if (J.hairTail) { J.hairTail.rotation.x = A.hr * 1.4 - Math.abs(Math.sin(p)) * 0.1 * moveW + hit * 0.3 - A.lpit * 0.5; J.hairTail.rotation.z = A.hz * 1.2 + Math.sin(p) * 0.08 * moveW; }
  U.fx = { pack: A.pk, bounce: A.pb, run: run, moveW };
  if (A.ko > 0) koPose(h, J, A, base, sstep(A.ko));
  else if (h.rotation.x !== 0) h.rotation.x = 0;
  if (F) faceUpdate(F, A, o, dt, t, P, false);
}

// limp pose, blended in by k (0..1): prone (or supine for sleepers), limbs relaxed, head turned so the face never digs into the floor
function koPose(h, J, A, base, k) {
  const sup = A.sup, m = (r, x, y, z) => { r.x = lerp(r.x, x, k); r.y = lerp(r.y, y, k); r.z = lerp(r.z, z, k); };
  h.rotation.x = (sup ? Math.PI / 2 : -Math.PI / 2) * k;
  J.hips.position.set(lerp(J.hips.position.x, 0, k), lerp(J.hips.position.y, base, k), lerp(J.hips.position.z, 0, k)); m(J.hips.rotation, 0, 0, 0); m(J.spine.rotation, 0, 0, 0);
  m(J.legL.rotation, sup ? 0.06 : 0.1, 0, 0.1); m(J.legR.rotation, sup ? -0.05 : -0.08, 0, -0.1);
  J.kneeL.rotation.x = lerp(J.kneeL.rotation.x, sup ? -0.12 : -0.3, k); J.kneeR.rotation.x = lerp(J.kneeR.rotation.x, sup ? -0.18 : -0.15, k); J.footL.rotation.x = lerp(J.footL.rotation.x, 0, k); J.footR.rotation.x = lerp(J.footR.rotation.x, 0, k);
  if (sup) { m(J.armL.rotation, 0.35, -0.5, 0.12); m(J.armR.rotation, 0.35, 0.5, -0.12); J.elbowL.rotation.x = lerp(J.elbowL.rotation.x, 1.5, k); J.elbowR.rotation.x = lerp(J.elbowR.rotation.x, 1.5, k); }   // hands folded on the chest
  else { m(J.armL.rotation, -0.15, 0, 0.32); m(J.armR.rotation, -0.15, 0, -0.32); J.elbowL.rotation.x = lerp(J.elbowL.rotation.x, 0.4, k); J.elbowR.rotation.x = lerp(J.elbowR.rotation.x, 0.4, k); }
  m(J.head.rotation, 0, sup ? 0.15 : 1.15, sup ? 0 : 0.1);
  if (J.hairTail) { J.hairTail.rotation.x = lerp(J.hairTail.rotation.x, 0, k); J.hairTail.rotation.z = lerp(J.hairTail.rotation.z, 0, k); }
  const sk = h.userData.skirt; if (sk) { sk[0].rotation.x = lerp(sk[0].rotation.x, 0, k); sk[1].rotation.x = lerp(sk[1].rotation.x, 0, k); }
}

// face: blink, brows, mouth (talk / shock)
function faceUpdate(F, A, o, dt, t, P, asleep) {
  A.nextBlink -= dt; if (A.nextBlink <= 0 && A.blinkT <= 0) { A.blinkT = 0.17; A.nextBlink = P.blink * (0.5 + ((t * 7.31) % 1)); }
  let bl = 0; if (A.blinkT > 0) { A.blinkT -= dt; bl = Math.sin(Math.PI * clamp(1 - A.blinkT / 0.17, 0, 1)); }
  if (asleep || A.ko > 0.6) bl = Math.max(bl, clamp((A.ko - 0.6) * 4, 0, 1));
  const ey = 1 - 0.93 * bl; F.eye[0].scale.y = F.eye[1].scale.y = ey;
  const talk = A.talk * clamp(0.4 + 0.6 * Math.sin(t * 12.7) * Math.sin(t * 5.3 + 1), 0, 1), shock = clamp(A.hit * 1.6, 0, 1);
  const open = Math.max(talk, shock * 0.9, o.mouth || 0); A.mouth = ease(A.mouth, open, 24, dt);
  F.mouth.scale.set(1 - 0.3 * A.mouth + (o.smile || 0) * 0.35, 1 + 5.5 * A.mouth, 1); F.mouth.position.y = 0.032 - A.mouth * 0.004;
  const mood = o.mood !== undefined ? o.mood : 0, br = ease(A.brow, mood + shock * 1.0 + A.talk * Math.sin(t * 2.3) * 0.25, 10, dt); A.brow = br;
  for (let i = 0; i < 2; i++) { const s = i ? 1 : -1, b = F.brow[i]; b.position.y = 0.124 + br * 0.012; b.rotation.z = -s * Math.min(0, br) * 0.45 + s * Math.max(0, br) * 0.12; }
}

export const GUN_ATTACH = (gunMesh) => { gunMesh.rotation.set(-Math.PI / 2, 0, 0); gunMesh.position.set(0, -0.08, -0.015); return gunMesh; };
