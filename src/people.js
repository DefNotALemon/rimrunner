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
const cloth = (c, o = {}) => M(c, { map: fabric(), roughness: 0.92, ...o });

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
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.098, 20, 16), skin); hd.scale.set(0.92, 1.12, 1.02); hd.position.y = 0.09; hd.castShadow = true; headG.add(hd);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), skin); jaw.scale.set(0.95 * L.jaw, 0.8, 1); jaw.position.set(0, 0.015, -0.015); headG.add(jaw);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.045 * L.nose, 6), skin); nose.rotation.x = -Math.PI / 2 - 0.25; nose.position.set(0, 0.07, -0.098); headG.add(nose);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.012, 0.02), M(L.hairColor)); brow.position.set(0, 0.123, -0.09); headG.add(brow);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), M(0xf4f2ee, { roughness: 0.3 })); eye.position.set(s * 0.036, 0.1, -0.087); headG.add(eye);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0072, 10), M(L.eye, { roughness: 0.2 })); iris.position.set(s * 0.036, 0.1, -0.1005); iris.rotation.y = Math.PI; headG.add(iris);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin); ear.scale.set(0.4, 1, 0.7); ear.position.set(s * 0.093, 0.085, 0.005); headG.add(ear);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), M(0x7a3a3a)); mouth.position.set(0, 0.032, -0.093); headG.add(mouth);
  const hairMat = M(L.hairColor, { roughness: 0.9 }); const hairG = new THREE.Group(); headG.add(hairG); J.hair = hairG;
  const cap = (r, a0, a1, sy = 1.15) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, a0, a1), hairMat); m.scale.set(0.95, sy, 1.06); m.position.y = 0.09; m.castShadow = true; return m; };
  const hs = L.hair;
  if (hs === 'short') hairG.add(cap(0.104, 0, Math.PI * 0.56)); else if (hs === 'buzz') hairG.add(cap(0.1, 0, Math.PI * 0.5)); else if (hs === 'crop') { hairG.add(cap(0.103, 0, Math.PI * 0.52)); const f = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), hairMat); f.position.set(0, 0.17, -0.07); hairG.add(f); }
  else if (hs === 'long') { hairG.add(cap(0.106, 0, Math.PI * 0.62)); const b = new THREE.Mesh(capsule(0.07, 0.22), hairMat); b.scale.set(1.2, 1, 0.55); b.position.set(0, -0.02, 0.075); hairG.add(b); }
  else if (hs === 'bob') { hairG.add(cap(0.106, 0, Math.PI * 0.62)); const b = new THREE.Mesh(capsule(0.08, 0.09), hairMat); b.scale.set(1.25, 1, 0.9); b.position.set(0, 0.03, 0.03); hairG.add(b); }
  else if (hs === 'ponytail') { hairG.add(cap(0.104, 0, Math.PI * 0.56)); const b = new THREE.Mesh(capsule(0.025, 0.2), hairMat); b.position.set(0, 0.07, 0.12); b.rotation.x = 0.4; hairG.add(b); }
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
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.034), skin); palm.position.y = -0.05; palm.castShadow = true; hand.add(palm);
    const th = new THREE.Mesh(capsule(0.011, 0.04, 4), skin); th.position.set(-s * 0.036, -0.04, -0.012); th.rotation.z = s * 0.3; hand.add(th);
    const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.028), skin); fingers.position.y = -0.11; hand.add(fingers);
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
  root.userData = { J, look, outfit: null, clothG: new THREE.Group(), S, B };
  root.add(root.userData.clothG);
  root.scale.setScalar(S);
  setOutfit(root, outfit || OUTFITS.ranger);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return root;
}

// ---- clothing layers ----
export function setOutfit(h, outfit) {
  const U = h.userData; const J = U.J; U.outfit = outfit;
  // remove old
  for (const o of [...(U.cloth || [])]) o.parent && o.parent.remove(o); U.cloth = [];
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
    if (t.kind === 'uniform') {
      for (const s of [-1, 1]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.045), acc); ep.position.set(s * 0.17 * B, 0.58, 0); add(J.spine, ep); }
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 5), M(0xe6c44a, { metalness: 0.8, roughness: 0.3 })); badge.rotation.x = Math.PI / 2; badge.position.set(0.075 * B, 0.42, -0.112); add(J.spine, badge);
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.158 * B, 0.158 * B, 0.045, 18), M(0x15151a, { roughness: 0.5 })); belt.scale.z = 0.7; belt.position.y = 0.03; add(J.spine, belt);
      const hol = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.07), M(0x15151a)); hol.position.set(0.16 * B, -0.02, 0); add(J.spine, hol);
    }
    if (t.kind === 'coat') {   // skirt is two open half-shells riding on the thighs: front/back panels swing and fold with each leg instead of one rigid tube the legs poke through
      const cm = cloth(t.color, { side: THREE.DoubleSide });
      for (const s of [-1, 1]) { const hipJ = new THREE.Group(); hipJ.position.set(0, -0.06, 0); J.hips.add(hipJ); U.cloth.push(hipJ); (U.skirt = U.skirt || {})[s < 0 ? 0 : 1] = hipJ; const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * B, 0.27 * B, 0.46 * S, 14, 1, true, s < 0 ? Math.PI - 0.04 : -0.04, Math.PI + 0.08), cm); sk.scale.z = 0.72; sk.position.set(-s * 0.095 * B, 0.11 - 0.23 * S, 0); add(hipJ, sk); }
    } else U.skirt = null;
    if (t.kind === 'overalls') { for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.01), acc); st.position.set(s * 0.07 * B, 0.44, -0.105); st.rotation.z = s * 0.1; add(J.spine, st); } const bib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.01), mat); bib.position.set(0, 0.28, -0.106); add(J.spine, bib); }
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
      if (b.kind === 'cargo') { const pk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.09), mat); pk.position.set(s * 0.075 * B, -thighLen * 0.5, 0); add(hip, pk); }
    }
    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.153 * B, 0.155 * B, 0.04, 16), M(0x2a2218, { roughness: 0.6 })); waist.scale.z = 0.7; waist.position.y = 0.045; if (!short) add(J.hips, waist);
  }
  const sh = outfit.shoes;
  if (sh) {
    const mat = M(sh.color, { roughness: 0.55 });
    for (const s of [-1, 1]) {
      const foot = J[s < 0 ? 'footL' : 'footR']; const kn = J[s < 0 ? 'kneeL' : 'kneeR'];
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.27), mat); f.position.set(0, -0.03, -0.065); add(foot, f);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.02, 0.28), M(0x151515)); sole.position.set(0, -0.067, -0.065); add(foot, sole);
      if (sh.kind === 'boots') { const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.17, 10), mat); shaft.position.y = 0.04; add(foot, shaft); }
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
      if (hd.kind === 'copcap') { const bd = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.005, 5), M(0xe6c44a, { metalness: .8, roughness: .3 })); bd.rotation.x = Math.PI / 2; bd.position.set(0, 0.16, -0.112); add(J.head, bd); const band = new THREE.Mesh(new THREE.CylinderGeometry(0.107, 0.107, 0.025, 16), M(0x0a0e18)); band.position.y = 0.13; band.scale.set(.97, 1, 1.08); add(J.head, band); }
    } else if (hd.kind === 'hat') { const br = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.008, 18), mat); br.position.y = 0.135; add(J.head, br); const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.09, 14), mat); cr.position.y = 0.18; add(J.head, cr); }
    else if (hd.kind === 'helmet') { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.114, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), mat); dome.scale.set(1, 1.05, 1.1); dome.position.y = 0.115; add(J.head, dome); const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 16), mat); rim.position.y = 0.118; rim.scale.z = 1.12; add(J.head, rim); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.03), M(0xfff6d0, { emissive: 0xfff0b0, emissiveIntensity: 0.8 })); lamp.position.set(0, 0.17, -0.12); add(J.head, lamp); }
    else if (hd.kind === 'beanie') { const dome = new THREE.Mesh(new THREE.SphereGeometry(0.106, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth(hd.color)); dome.scale.set(0.97, 1.1, 1.07); dome.position.y = 0.105; add(J.head, dome); }
  }
  // hide hair under hard headwear
  J.hair.visible = !(hd && (hd.kind === 'helmet' || hd.kind === 'copcap' || hd.kind === 'hat'));
  // hair partially under caps/beanies
  if (hd && (hd.kind === 'cap' || hd.kind === 'beanie')) J.hair.scale.set(1, 0.9, 1);
  else J.hair.scale.set(1, 1, 1);
  h.traverse(o => { if (o.isMesh) o.castShadow = true; });
}

// ---- animation ----
// o: {phase (radians), speed (0..1.4), crouch (0..1), arms ('relaxed'|'gun'|'lowgun'), aim (0..1), pitch, lean (-1..1), idleT, ko}
// Leg rig numbers: thigh/shin lengths are in the body's local space; SOLE is how far the boot/foot mesh hangs below the ankle joint.
const HIP_DROP = 0.06, SOLE = 0.078, TOE = 0.19, HEEL = 0.06;
export function animateHuman(h, o) {
  if (h.rotation.order !== 'YXZ') h.rotation.order = 'YXZ';   // yaw first, then tip over about the body's own axis
  const J = h.userData.J; const S = h.userData.S || 1; const sp = Math.min(1.3, o.speed || 0), p = o.phase || 0, c = Math.min(1, Math.max(0, o.crouch || 0));
  const T = 0.45 * S, Sh = 0.43 * S, base = HIP_DROP + SOLE + T + Sh;   // hip height that puts the soles exactly on the floor when standing
  if (o.ko) {   // limp pose: lying prone (or supine for sleepers), limbs relaxed, head turned so the face never digs into the floor
    h.rotation.x = o.supine ? Math.PI / 2 : -Math.PI / 2;
    J.hips.position.set(0, base, 0); J.hips.rotation.set(0, 0, 0); J.spine.rotation.set(0, 0, 0);
    J.legL.rotation.set(o.supine ? 0.06 : 0.1, 0, 0.1); J.legR.rotation.set(o.supine ? -0.05 : -0.08, 0, -0.1); J.kneeL.rotation.x = o.supine ? -0.12 : -0.3; J.kneeR.rotation.x = o.supine ? -0.18 : -0.15; J.footL.rotation.x = J.footR.rotation.x = 0;
    J.armL.rotation.set(o.supine ? 0.05 : -0.15, 0, 0.32); J.armR.rotation.set(o.supine ? 0.05 : -0.15, 0, -0.32); J.armL.rotation.y = J.armR.rotation.y = 0; J.elbowL.rotation.x = J.elbowR.rotation.x = o.supine ? 0.25 : 0.4;
    if (o.supine) { J.armL.rotation.set(0.35, 0, 0.12); J.armR.rotation.set(0.35, 0, -0.12); J.elbowL.rotation.x = J.elbowR.rotation.x = 1.5; J.armL.rotation.y = -0.5; J.armR.rotation.y = 0.5; }   // hands folded on the chest
    J.head.rotation.set(0, o.supine ? 0.15 : 1.15, o.supine ? 0 : 0.1); return;
  }
  if (h.rotation.x !== 0) h.rotation.x = 0;
  // --- legs: swing + knee lift, then the hips ride on whichever foot is planted so soles touch the floor and never sink
  const amp = 0.46 * sp, flex = 0.1 * Math.min(1, sp);
  const wa = [Math.sin(p) * amp, -Math.sin(p) * amp];
  const wk = [Math.max(0, Math.sin(p + 1.4)) * 1.0 * sp + flex, Math.max(0, Math.sin(p + 1.4 + Math.PI)) * 1.0 * sp + flex];
  const CD = 0.3, CB = 0.1, hh = T + Sh - CD, Lc = Math.hypot(hh, CB);   // crouch: hip joint 30 cm lower and 10 cm behind the ankles, so the knees travel forward over the toes like a real squat
  const kC = Math.PI - Math.acos((T * T + Sh * Sh - Lc * Lc) / (2 * T * Sh)), aC = Math.acos((T * T + Lc * Lc - Sh * Sh) / (2 * T * Lc)) + Math.atan2(CB, hh);
  const A = [0, 0], K = [0, 0], F = [0, 0]; let ext = 0;
  for (let i = 0; i < 2; i++) {
    A[i] = wa[i] * (1 - c * 0.7) + aC * c; K[i] = wk[i] * (1 - c) + kC * c;
    F[i] = K[i] - A[i] - Math.max(0, -A[i]) * 0.5 * (1 - c);   // keep the sole level; roll onto the toes off the back foot
    const th = A[i] - K[i] + F[i], drop = SOLE * Math.cos(th) + (th < 0 ? TOE * Math.sin(-th) : HEEL * Math.sin(th));   // lowest point of the foot given its pitch (toe-down digs the toe in, so lift the hips to match)
    ext = Math.max(ext, T * Math.cos(A[i]) + Sh * Math.cos(A[i] - K[i]) + drop - SOLE);
  }
  J.hips.position.y = base - (T + Sh) + ext + Math.sin((o.idleT || 0) * 1.7) * 0.002 * (1 - c);
  J.hips.position.x = Math.sin(p) * 0.012 * sp; J.hips.position.z = CB * c;
  J.hips.rotation.y = Math.sin(p) * 0.09 * sp; J.hips.rotation.x = c * 0.0; J.hips.rotation.z = 0;
  J.spine.rotation.x = -c * 0.36 - sp * 0.05; J.spine.rotation.y = -Math.sin(p) * 0.11 * sp; J.spine.rotation.z = 0;
  J.legL.rotation.x = A[0]; J.legR.rotation.x = A[1];
  const sk = h.userData.skirt; if (sk) { sk[0].rotation.x = A[0] * 0.5; sk[1].rotation.x = A[1] * 0.5; }   // coat panels follow the thighs at half angle: they swing and fold instead of staying rigid or barrelling forward J.legL.rotation.z = 0.03; J.legR.rotation.z = -0.03;
  J.kneeL.rotation.x = -K[0]; J.kneeR.rotation.x = -K[1]; J.footL.rotation.x = F[0]; J.footR.rotation.x = F[1];
  const swing = Math.sin(p) * 0.75 * sp;
  const idle = Math.sin((o.idleT || 0) * 1.5) * 0.015;
  const mode = o.arms || 'relaxed';
  if (mode === 'relaxed') { const ar = 1 - c * 0.6; J.armL.rotation.x = -swing * 0.8 * ar + c * 0.15; J.armR.rotation.x = swing * 0.8 * ar + c * 0.15; J.armL.rotation.z = 0.08 + idle + c * 0.1; J.armR.rotation.z = -0.08 - idle - c * 0.1; J.elbowL.rotation.x = 0.12 + Math.max(0, -swing) * 0.5 + c * 0.5; J.elbowR.rotation.x = 0.12 + Math.max(0, swing) * 0.5 + c * 0.5; J.armL.rotation.y = J.armR.rotation.y = 0; }
  else if (mode === 'gun' || mode === 'lowgun') {
    const up = mode === 'gun' ? (o.aim ?? 1) : 0; const pitch = o.pitch || 0;
    J.armR.rotation.x = 0.1 * (1 - up) + (1.25 + pitch * 0.8) * up - swing * 0.2 * (1 - up); J.armR.rotation.z = -0.06; J.armR.rotation.y = 0; J.elbowR.rotation.x = 0.3 + 0.5 * (1 - up);
    J.armL.rotation.x = -swing * 0.8 * (1 - up) + (1.1 + pitch * 0.8) * up; J.armL.rotation.z = 0.08 + (0.28 * up); J.armL.rotation.y = 0.45 * up; J.elbowL.rotation.x = 0.12 + 1.0 * up;
    if (c > 0) { J.armR.rotation.x += c * 0.35 * (1 - up) + c * 0.42 * up; J.armL.rotation.x += c * 0.3 * (1 - up) + c * 0.42 * up; }   // the torso leans forward, so lift the arms to keep the weapon level
  } else if (mode === 'wallhands') { J.armL.rotation.x = -0.6; J.armR.rotation.x = -0.6; J.armL.rotation.y = -0.5; J.armR.rotation.y = 0.5; J.elbowL.rotation.x = 1.3; J.elbowR.rotation.x = 1.3; }
  J.head.rotation.x = (o.look || 0) * 0.5 + c * 0.3; J.head.rotation.y = 0; J.head.rotation.z = 0;
}

export const GUN_ATTACH = (gunMesh) => { gunMesh.rotation.set(-Math.PI / 2, 0, 0); gunMesh.position.set(0, -0.08, -0.015); return gunMesh; };
