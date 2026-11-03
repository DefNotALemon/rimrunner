// Static batching: merges the hundreds of loose building meshes (walls, window frames, props, roofs) into a few draw calls per
// 32 m map cell + material. Positions are baked to world space, so only call this on geometry that never moves.
import * as THREE from '../vendor/three.module.js';

const CELL = 32;
// materials made one-per-mesh (std(...) etc.) that look identical are folded into one; anything with a different look keeps its own batch
const tid = (t) => t ? t.uuid : '-';
function matSig(m) {
  return [m.type, m.color ? m.color.getHex() : '', m.roughness, m.metalness, m.emissive ? m.emissive.getHex() : '', m.emissiveIntensity, tid(m.map), tid(m.emissiveMap), tid(m.normalMap), tid(m.roughnessMap), m.side, m.vertexColors ? 1 : 0, m.flatShading ? 1 : 0, m.alphaTest, m.polygonOffset ? m.polygonOffsetFactor : 0, m.envMapIntensity, m.wireframe ? 1 : 0, m.fog === false ? 0 : 1].join(',');
}
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _inv = new THREE.Matrix4();

// root: parent group (identity transform). from: first child index to consider. skip: Set of meshes that must stay separate.
// smallShadow: meshes with a bounding radius below this stop casting sun shadows (they only cost shadow-pass draw time).
export function batchStatic(root, from, skip = new Set(), { smallShadow = 0.28, noShadowIn = [] } = {}) {
  root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert();
  const groups = new Map(); const dead = [];
  const visit = (o, parentOk) => {
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && parentOk && !skip.has(o) && !o.userData.keep && o.visible && o.geometry && o.geometry.attributes.position && o.geometry.attributes.normal && !(o.material.transparent) && !Array.isArray(o.material)) {
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const m = new THREE.Matrix4().multiplyMatrices(_inv, o.matrixWorld);
      const c = g.boundingSphere.center.clone().applyMatrix4(m); const sc = Math.max(Math.abs(m.getMaxScaleOnAxis()), 1e-6); const rad = g.boundingSphere.radius * sc;
      let cast = o.castShadow;
      if (cast && rad < smallShadow) cast = false;
      if (cast && c.y < 3.2) for (const f of noShadowIn) if (c.x > f.minx && c.x < f.maxx && c.z > f.minz && c.z < f.maxz) { cast = false; break; }
      const hasUV = !!g.attributes.uv, hasCol = !!g.attributes.color;
      const key = [matSig(o.material), cast ? 1 : 0, o.receiveShadow ? 1 : 0, hasUV ? 1 : 0, hasCol ? 1 : 0, Math.floor(c.x / CELL), Math.floor(c.z / CELL), o.material.side].join('|');
      let e = groups.get(key); if (!e) groups.set(key, e = { mat: o.material, cast, recv: o.receiveShadow, hasUV, hasCol, items: [] });
      e.items.push({ g, m }); dead.push(o); return;
    }
    if (o.isGroup || o.type === 'Object3D') { const ok = parentOk && !o.userData.keep && o.visible; for (const ch of o.children) visit(ch, ok); }
  };
  const kids = root.children.slice(from); for (const k of kids) visit(k, true);
  let merged = 0;
  for (const e of groups.values()) {
    let nv = 0, ni = 0; for (const { g } of e.items) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = e.hasUV ? new Float32Array(nv * 2) : null, C = e.hasCol ? new Float32Array(nv * 3) : null;
    const I = new Uint32Array(ni); let vo = 0, io = 0;
    for (const { g, m } of e.items) {
      _nm.getNormalMatrix(m); const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color;
      for (let i = 0; i < pa.count; i++) {
        _v.fromBufferAttribute(pa, i).applyMatrix4(m); P[(vo + i) * 3] = _v.x; P[(vo + i) * 3 + 1] = _v.y; P[(vo + i) * 3 + 2] = _v.z;
        _n.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize(); N[(vo + i) * 3] = _n.x; N[(vo + i) * 3 + 1] = _n.y; N[(vo + i) * 3 + 2] = _n.z;
        if (UV) { UV[(vo + i) * 2] = ua.getX(i); UV[(vo + i) * 2 + 1] = ua.getY(i); }
        if (C) { C[(vo + i) * 3] = ca.getX(i); C[(vo + i) * 3 + 1] = ca.getY(i); C[(vo + i) * 3 + 2] = ca.getZ(i); }
      }
      // a negative-determinant transform flips winding; undo it so faces don't vanish
      const flip = m.determinant() < 0;
      if (g.index) { for (let i = 0; i < g.index.count; i += 3) { const a = g.index.getX(i), b = g.index.getX(i + 1), c = g.index.getX(i + 2); I[io++] = vo + a; I[io++] = vo + (flip ? c : b); I[io++] = vo + (flip ? b : c); } }
      else for (let i = 0; i < pa.count; i += 3) { I[io++] = vo + i; I[io++] = vo + i + (flip ? 2 : 1); I[io++] = vo + i + (flip ? 1 : 2); }
      vo += pa.count;
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(P, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (UV) bg.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); if (C) bg.setAttribute('color', new THREE.BufferAttribute(C, 3));
    bg.setIndex(new THREE.BufferAttribute(I, 1)); bg.computeBoundingSphere();
    const mesh = new THREE.Mesh(bg, e.mat); mesh.castShadow = e.cast; mesh.receiveShadow = e.recv; mesh.matrixAutoUpdate = false; mesh.userData.batched = true; root.add(mesh); merged += e.items.length;
  }
  const geos = new Set();
  for (const o of dead) { geos.add(o.geometry); o.parent && o.parent.remove(o); }
  for (const g of geos) g.dispose();
  // drop now-empty groups so the scene graph stays small
  const prune = (o) => { for (const ch of o.children.slice()) { if (ch.isGroup || ch.type === 'Object3D') { prune(ch); if (!ch.children.length) o.remove(ch); } } };
  for (const k of kids) if ((k.isGroup || k.type === 'Object3D') && !k.children.length) root.remove(k); else if (k.isGroup) prune(k);
  return { merged, batches: groups.size };
}
