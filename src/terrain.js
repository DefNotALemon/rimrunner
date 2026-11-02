// Endless terrain: analytic heightfield, CPU clipmap rings, biome shading, tiled tree/rock/grass scatter
import * as THREE from '../vendor/three.module.js';
import { fbm, noise3, clamp, lerp, rng, hashStr } from './util.js';
import { tex } from './textures.js';

export class HeightField {
  constructor(planet, kind, K) {
    this.P = planet; this.kind = kind; this.K = K; this.seed = planet.seed;
    this.freq = 0.0045 * (planet.shape === 'lumpy' ? 1.4 : 1); this.amp = (kind === 'ocean' ? 55 : kind === 'barren' ? 120 : 95) * (planet.shape === 'lumpy' ? 1.5 : 1) * (0.7 + Math.min(1.2, planet.radius / 3500));
    this.flats = [];   // {x,z,r,blend}
    this.water = kind === 'ocean' ? -1.5 : kind === 'volcanic' ? -3 : -9999;
  }
  raw(x, z, oct = 5) {
    const f = this.freq, a = this.amp, s = this.seed;
    let h = (fbm(x * f, 0.37, z * f, s, oct) - 0.45) * a;
    if (oct > 3) h += (fbm(x * f * 5, 5.1, z * f * 5, s + 9, 3) - 0.5) * a * 0.09;
    // ridged mountains
    const m = 1 - Math.abs(noise3(x * f * 0.7, 2.2, z * f * 0.7, s + 4) * 2 - 1); h += Math.pow(m, 3) * a * 0.55 * clamp((fbm(x * f * 0.25, 9, z * f * 0.25, s + 7, 2) - 0.4) * 3, 0, 1);
    if (this.kind === 'volcanic') h += Math.max(0, 1 - Math.abs(noise3(x * 0.006, 0, z * 0.006, s + 4) - 0.5) * 7) * a * 0.5;
    if (this.kind === 'desert') h = h * 0.55 + Math.sin(x * 0.03 + fbm(x * 0.008, 0, z * 0.008, s, 2) * 7) * 3;
    if (this.kind === 'ocean') h = h * 0.6 - 6;
    return h;
  }
  at(x, z, oct = 5) {
    let h = this.raw(x, z, oct);
    for (const F of this.flats) { const d = Math.hypot(x - F.x, z - F.z); const k = clamp((d - F.r) / F.blend, 0, 1); const sm = k * k * (3 - 2 * k); h = lerp(F.h ?? 0, h, sm); }
    return h;
  }
}

const CELLS = 64;
const RINGS = [1.5, 4, 12, 40, 130, 520];

export class Terrain {
  constructor(parent, hf) {
    this.hf = hf; this.parent = parent; this.rings = []; const K = hf.K; this.pal = K.pal;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.detail(), roughness: 0.96, metalness: 0 });
    this.mat.map.colorSpace = THREE.NoColorSpace;
    RINGS.forEach((cell, i) => {
      const n = CELLS + 1; const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * n * 2), 2)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
      const idx = []; for (let z = 0; z < CELLS; z++) for (let x = 0; x < CELLS; x++) { const a = z * n + x, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, this.mat); mesh.frustumCulled = false; mesh.receiveShadow = i < 3; parent.add(mesh);
      this.rings.push({ cell, mesh, cx: 1e9, cz: 1e9, step: cell * (i < 2 ? 6 : 8), uvs: [0.28, 0.1, 0.04, 0.012, 0.004, 0.0012][i], oct: [5, 5, 4, 3, 2, 2][i], i });
    });
    this.tmpC = new THREE.Color();
  }
  groundColor(h, ny, x, z, out) {
    const hf = this.hf, pal = this.pal; const t = clamp((h / hf.amp) * 1.15 + 0.42 + (fbm(x * 0.02, 0, z * 0.02, hf.seed + 2, 2) - 0.5) * 0.35, 0, 0.999) * (pal.length - 1);
    const ii = Math.floor(t), k = t - ii; let r = lerp(pal[ii][0], pal[ii + 1][0], k), g = lerp(pal[ii][1], pal[ii + 1][1], k), b = lerp(pal[ii][2], pal[ii + 1][2], k);
    const slope = 1 - ny; if (slope > 0.12) { const m = clamp((slope - 0.12) * 3.4, 0, 0.85); const rock = pal[2]; r = lerp(r, rock[0] * 0.8 + 0.08, m); g = lerp(g, rock[1] * 0.75 + 0.07, m); b = lerp(b, rock[2] * 0.75 + 0.07, m); }
    if (hf.water > -999 && h < hf.water + 1.8) { const m = clamp(1 - (h - hf.water + 1) / 3, 0, 1); r = lerp(r, 0.8, m * 0.6); g = lerp(g, 0.74, m * 0.6); b = lerp(b, 0.55, m * 0.6); }
    const v = 0.9 + noise3(x * 0.15, 1, z * 0.15, 5) * 0.2; out[0] = r * v; out[1] = g * v; out[2] = b * v;
  }
  build(R, cx, cz) {
    const n = CELLS + 1, cell = R.cell, half = CELLS * cell / 2; const g = R.mesh.geometry; const pos = g.attributes.position.array, col = g.attributes.color.array, uv = g.attributes.uv.array, nor = g.attributes.normal.array;
    const x0 = cx - half, z0 = cz - half; const drop = R.cell * 0.1 * (R.i > 0 ? 1 : 0); const c3 = [0, 0, 0];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; const x = x0 + i * cell, z = z0 + j * cell; let h = this.hf.at(x, z, R.oct);
      pos[k * 3] = x; pos[k * 3 + 1] = h - drop; pos[k * 3 + 2] = z; uv[k * 2] = x * R.uvs; uv[k * 2 + 1] = z * R.uvs;
    }
    // normals (central differences on the grid)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i; const hl = pos[(j * n + Math.max(0, i - 1)) * 3 + 1], hr = pos[(j * n + Math.min(n - 1, i + 1)) * 3 + 1], hd = pos[(Math.max(0, j - 1) * n + i) * 3 + 1], hu = pos[(Math.min(n - 1, j + 1) * n + i) * 3 + 1];
      let nx = hl - hr, nz = hd - hu, ny = 2 * cell; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
      this.groundColor(pos[k * 3 + 1] + drop, ny, pos[k * 3], pos[k * 3 + 2], c3); col[k * 3] = c3[0]; col[k * 3 + 1] = c3[1]; col[k * 3 + 2] = c3[2];
    }
    // skirts
    for (let t = 0; t < n; t++) for (const k of [t, (n - 1) * n + t, t * n, t * n + n - 1]) pos[k * 3 + 1] -= cell * 0.7;
    for (const a of ['position', 'color', 'uv', 'normal']) g.attributes[a].needsUpdate = true;
    R.cx = cx; R.cz = cz;
  }
  update(x, z, force) {
    let work = 0;
    for (const R of this.rings) {
      const sx = Math.round(x / R.step) * R.step, sz = Math.round(z / R.step) * R.step;
      if (force || sx !== R.cx || sz !== R.cz) { if (work < 2 || force || R.cx > 1e8) { this.build(R, sx, sz); work++; } }
    }
  }
  rebuildAll() { for (const R of this.rings) R.cx = 1e9; }
}

// ---- merged geometry helper ----
function merge(parts) {
  const pos = [], nor = [], col = [];
  for (const { geo, color, m } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m || new THREE.Matrix4()); const p = g.attributes.position, nn = g.attributes.normal; const c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i)); col.push(c.r, c.g, c.b); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
const M4 = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

const TILE = 70, TR = 4;
export class Scatter {
  constructor(parent, hf, kind) {
    this.hf = hf; this.kind = kind; this.cx = 1e9; this.cz = 1e9; this.visible = true;
    const life = { temperate: 1, ocean: 0.5, toxic: 0.55, desert: 0.12, frozen: 0.35, crystal: 0.5, volcanic: 0.05, barren: 0 }[kind];
    this.life = life;
    const leaf = { temperate: 0x2f6a35, ocean: 0x3a7a3a, toxic: 0x9aaa22, desert: 0x6a7a30, frozen: 0x3d6a58, crystal: 0xb78cff, volcanic: 0x3a2a22 }[kind] || 0x2f6a35;
    const pine = merge([{ geo: new THREE.CylinderGeometry(.18, .3, 3, 6), color: 0x4a3524, m: M4(0, 1.5, 0) }, { geo: new THREE.ConeGeometry(2.4, 4, 8), color: leaf, m: M4(0, 4, 0) }, { geo: new THREE.ConeGeometry(1.8, 3.4, 8), color: leaf, m: M4(0, 6, 0) }, { geo: new THREE.ConeGeometry(1.2, 3, 8), color: leaf, m: M4(0, 8, 0) }]);
    const round = merge([{ geo: new THREE.CylinderGeometry(.2, .38, 4, 6), color: 0x5a4330, m: M4(0, 2, 0) }, { geo: new THREE.IcosahedronGeometry(2.4, 1), color: leaf, m: M4(0, 5.4, 0, 1, .85, 1) }, { geo: new THREE.IcosahedronGeometry(1.7, 1), color: leaf, m: M4(1.2, 4.4, .6) }, { geo: new THREE.IcosahedronGeometry(1.6, 1), color: leaf, m: M4(-1.1, 6.2, -.5) }]);
    const rockG = new THREE.IcosahedronGeometry(1, 1); const rp = rockG.attributes.position; for (let i = 0; i < rp.count; i++) { const s = 0.75 + noise3(rp.getX(i) * 2, rp.getY(i) * 2, rp.getZ(i) * 2, 3) * 0.55; rp.setXYZ(i, rp.getX(i) * s, rp.getY(i) * s * 0.8, rp.getZ(i) * s); } rockG.computeVertexNormals();
    const rock = merge([{ geo: rockG, color: new THREE.Color(...hf.K.pal[2]).multiplyScalar(0.8) }]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: kind === 'crystal' });
    const mk = (g, cap, shadow) => { const im = new THREE.InstancedMesh(g, mat, cap); im.count = 0; im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; parent.add(im); return im; };
    this.pine = mk(pine, 1800, true); this.round = mk(round, 1400, true); this.rock = mk(rock, 2400, true);
    // grass tufts: two crossed alpha cards
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); const r = rng(5);
    for (let i = 0; i < 16; i++) { x.strokeStyle = `hsl(${r.range(80, 110)},${r.range(40, 60)}%,${r.range(25, 48)}%)`; x.lineWidth = 2; x.beginPath(); const bx = 6 + i * 3.4; x.moveTo(bx, 64); x.quadraticCurveTo(bx + r.range(-6, 6), 34, bx + r.range(-10, 10), r.range(6, 28)); x.stroke(); }
    const gt = new THREE.CanvasTexture(c); gt.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.PlaneGeometry(1.1, 0.8); card.translate(0, .4, 0); const card2 = card.clone(); card2.rotateY(Math.PI / 2);
    const gg = merge([{ geo: card, color: 0xffffff }, { geo: card2, color: 0xffffff }]); const uvs = []; for (let i = 0; i < 2; i++) uvs.push(0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const gmat = new THREE.MeshStandardMaterial({ map: gt, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: new THREE.Color(...hf.K.pal[0]).lerp(new THREE.Color(0x5a8a3a), 0.5) });
    this.grass = new THREE.InstancedMesh(gg, gmat, 5000); this.grass.count = 0; this.grass.frustumCulled = false; parent.add(this.grass);
    this.d = new THREE.Object3D(); this.col = new THREE.Color();
  }
  setVisible(v) { this.visible = v; for (const m of [this.pine, this.round, this.rock, this.grass]) m.visible = v; }
  update(x, z, avoid) {
    if (!this.visible) return;
    const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE); if (tx === this.cx && tz === this.cz) return; this.cx = tx; this.cz = tz;
    let np = 0, nr = 0, nk = 0, ng = 0; const d = this.d, hf = this.hf; const life = this.life;
    for (let j = -TR; j <= TR; j++) for (let i = -TR; i <= TR; i++) {
      const X = tx + i, Z = tz + j; const r = rng(hashStr(X + ',' + Z + ':' + hf.seed)); const near = Math.abs(i) <= 2 && Math.abs(j) <= 2;
      const nTrees = Math.floor(life * r.range(0, 26) * (0.5 + fbmLite(X, Z, hf.seed))), nRocks = r.int(1, 8), nGrass = near && life > 0.15 ? Math.floor(life * r.range(30, 90)) : 0;
      const place = (cnt, fn, cap, nCur) => { let c = nCur; for (let q = 0; q < cnt && c < cap; q++) { const px = (X + r()) * TILE, pz = (Z + r()) * TILE; if (avoid && avoid(px, pz)) continue; const h = hf.at(px, pz, 3); if (h < hf.water + 0.6) continue; if (fn(px, h, pz, c)) c++; } return c; };
      np = place(Math.floor(nTrees * (this.kind === 'temperate' || this.kind === 'frozen' ? 0.55 : 0.2)), (px, h, pz, ci) => { const s = r.range(.7, 1.5); d.position.set(px, h - 0.2, pz); d.rotation.set(0, r() * 6.28, 0); d.scale.set(s, s * r.range(.9, 1.3), s); d.updateMatrix(); this.pine.setMatrixAt(ci, d.matrix); this.col.setScalar(r.range(.75, 1.1)); this.pine.setColorAt(ci, this.col); return true; }, 1800, np);
      nr = place(Math.floor(nTrees * 0.45), (px, h, pz, ci) => { const s = r.range(.8, 1.4); d.position.set(px, h - 0.2, pz); d.rotation.set(0, r() * 6.28, 0); d.scale.set(s, s * r.range(.8, 1.2), s); d.updateMatrix(); this.round.setMatrixAt(ci, d.matrix); this.col.setScalar(r.range(.7, 1.1)); this.round.setColorAt(ci, this.col); return true; }, 1400, nr);
      nk = place(nRocks, (px, h, pz, ci) => { const s = r() < .12 ? r.range(2, 6) : r.range(.35, 1.5); d.position.set(px, h + s * .25, pz); d.rotation.set(r() * 3, r() * 6, r() * 3); d.scale.set(s, s * r.range(.6, 1.1), s * r.range(.7, 1.3)); d.updateMatrix(); this.rock.setMatrixAt(ci, d.matrix); this.col.setScalar(r.range(.7, 1.15)); this.rock.setColorAt(ci, this.col); return true; }, 2400, nk);
      ng = place(nGrass, (px, h, pz, ci) => { const s = r.range(.6, 1.5); d.position.set(px, h - 0.05, pz); d.rotation.set(0, r() * 6.28, 0); d.scale.set(s, s * r.range(.7, 1.3), s); d.updateMatrix(); this.grass.setMatrixAt(ci, d.matrix); return true; }, 5000, ng);
    }
    for (const [m, n] of [[this.pine, np], [this.round, nr], [this.rock, nk], [this.grass, ng]]) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
function fbmLite(x, z, s) { return noise3(x * 0.21, 3, z * 0.21, s + 11); }
