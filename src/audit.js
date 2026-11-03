// Scene audit: walks a three.js scene and reports glitch classes (inverted winding, bad normals/UVs, texture state, z-fight, layers, shadow setup...).
// Use from the console: `await __rr.audit()` (current mode scene) or `__rr.auditScene(scene)`. Pure read-only; no GPU work except one canvas probe per unique canvas map.
import * as THREE from '../vendor/three.module.js';

const V3 = THREE.Vector3;
const pathOf = (o) => { const p = []; for (let c = o; c && p.length < 6; c = c.parent) p.push(c.name || c.type); return p.join('<'); };
const matsOf = (m) => (Array.isArray(m.material) ? m.material : [m.material]).filter(Boolean);

// Winding vs. stored normals: fraction of triangles whose geometric (CCW) normal points against the averaged vertex normal.
export function windingReport(geo, cap = 30000) {
  const pos = geo.attributes.position, nor = geo.attributes.normal; if (!pos || !nor) return null;
  const idx = geo.index; const tris = idx ? idx.count / 3 : pos.count / 3; const step = Math.max(1, Math.floor(tris / cap));
  const a = new V3(), b = new V3(), c = new V3(), n = new V3(), ab = new V3(), ac = new V3(), vn = new V3(), tmp = new V3();
  let bad = 0, tot = 0, deg = 0;
  for (let t = 0; t < tris; t += step) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)); const l = n.length(); if (l < 1e-12) { deg++; continue; } n.divideScalar(l);
    vn.fromBufferAttribute(nor, i0); vn.add(tmp.fromBufferAttribute(nor, i1)).add(tmp.fromBufferAttribute(nor, i2)); if (vn.lengthSq() < 1e-8) continue;
    vn.normalize(); tot++; if (n.dot(vn) < -0.25) bad++;
  }
  return { bad, tot, deg, frac: tot ? bad / tot : 0 };
}
// Signed volume (positive = outward CCW winding on a closed mesh). Used when a geometry has no normals.
export function signedVolume(geo) {
  const pos = geo.attributes.position, idx = geo.index; if (!pos) return 0; const tris = idx ? idx.count / 3 : pos.count / 3;
  const a = new V3(), b = new V3(), c = new V3(); let v = 0;
  for (let t = 0; t < tris; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2); v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}
const canvasAlpha = (tex) => {
  const im = tex.image; if (!im || !im.getContext) return null; try { const s = document.createElement('canvas'); s.width = s.height = 32; const x = s.getContext('2d'); x.drawImage(im, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let mn = 255; for (let i = 3; i < d.length; i += 4) if (d[i] < mn) mn = d[i]; return mn; } catch (e) { return null; }
};

export function auditScene(scene, camera, renderer, label = 'scene') {
  const wp = new V3(); const F = [], add = (rule, sev, o, detail) => F.push({ rule, sev, name: o ? (o.name || o.type) : '', path: o ? pathOf(o) : '', geo: o && o.geometry ? o.geometry.type : '', at: o ? (o.getWorldPosition(wp), [wp.x, wp.y, wp.z].map(v => +v.toFixed(2))) : null, mat: o && o.material ? (Array.isArray(o.material) ? o.material[0] : o.material).name || '' : '', detail });
  const stats = { meshes: 0, tris: 0, points: 0, lines: 0, hidden: 0, instanced: 0, noCull: 0, lights: 0, shadowCasters: 0 };
  const seenGeo = new Map(), seenMat = new Set(), seenTex = new Map(), planes = [], boxes = [];
  const logDepth = !!(renderer && renderer.capabilities && renderer.capabilities.logarithmicDepthBuffer);
  scene.updateMatrixWorld(true);
  const camMask = camera ? camera.layers.mask : 1;
  scene.traverse((o) => {
    if (o.isLight) { stats.lights++; if (o.castShadow && o.shadow) { const s = o.shadow; if (!s.bias && !s.normalBias) add('SHADOW-BIAS', 'warn', o, 'castShadow with bias 0 and normalBias 0 (acne)'); if (s.bias > 0.002) add('SHADOW-BIAS', 'warn', o, `bias ${s.bias} (peter-panning)`); if (s.normalBias > 0.2) add('SHADOW-BIAS', 'warn', o, `normalBias ${s.normalBias} (peter-panning)`); } }
    if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
    if (!o.visible) stats.hidden++;
    if (!(o.layers.mask & camMask)) add('LAYER', 'err', o, `object layers ${o.layers.mask} do not intersect camera layers ${camMask}: never rendered`);
    if (o.frustumCulled === false) { stats.noCull++; const g = o.geometry; const t = g && g.attributes.position ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0; if (t > 3000 && !o.isPoints) add('NOCULL', 'info', o, `frustumCulled=false on ${t | 0} tris`); }
    if (o.isMesh) {
      stats.meshes++; if (o.isInstancedMesh) stats.instanced++; if (o.castShadow) stats.shadowCasters++;
      const g = o.geometry, mats = matsOf(o); if (!g || !g.attributes.position) { add('GEO', 'err', o, 'no position attribute'); return; }
      const pos = g.attributes.position; const nTri = (g.index ? g.index.count : pos.count) / 3; stats.tris += nTri * (o.isInstancedMesh ? o.count : 1);
      if (o.matrixWorld.determinant() < 0) add('NEGSCALE', 'info', o, 'negative-determinant world matrix (three flips frontFace; check double-flipped parents)');
      if (!seenGeo.has(g.uuid)) {
        const r = { o }; seenGeo.set(g.uuid, r);
        const arr = pos.array; let nan = false; for (let i = 0; i < arr.length; i += Math.max(3, (arr.length / 3000 | 0) * 3)) if (!isFinite(arr[i]) || !isFinite(arr[i + 1]) || !isFinite(arr[i + 2])) { nan = true; break; }
        if (nan) add('NAN', 'err', o, 'non-finite vertex position');
        const lit = mats.some(m => m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial || m.isMeshPhysicalMaterial);
        const dbl = mats.some(m => m.side === THREE.DoubleSide);
        if (lit && !g.attributes.normal) add('NO-NORMALS', 'err', o, 'lit material but geometry has no normals');
        else if (g.attributes.normal) {
          const w = windingReport(g);
          if (w && w.tot > 0 && w.frac > 0.05) add(dbl ? 'WIND-HIDDEN' : 'WIND', dbl ? 'warn' : 'err', o, `${w.bad}/${w.tot} tris wound against their normals (${(w.frac * 100).toFixed(0)}%)${dbl ? ' (masked by DoubleSide: lighting is wrong on those)' : ' -> see-through / inside-out'}`);
          if (w && w.deg > w.tot * 0.2 && w.deg > 20) add('DEGENERATE', 'info', o, `${w.deg} zero-area tris`);
          const na = g.attributes.normal.array; let zero = 0; const st = Math.max(3, (na.length / 3000 | 0) * 3); let cnt = 0; for (let i = 0; i < na.length; i += st) { cnt++; if (na[i] * na[i] + na[i + 1] * na[i + 1] + na[i + 2] * na[i + 2] < 1e-6) zero++; }
          if (zero > cnt * 0.02) add('ZERO-NORMALS', 'err', o, `${zero}/${cnt} sampled normals are zero`);
        } else if (!lit && !dbl && nTri < 20000) { const v = signedVolume(g); if (v < -1e-6) add('WIND-VOL', 'warn', o, `negative signed volume ${v.toFixed(4)} (inside-out if closed)`); }
        const needUV = mats.some(m => m.map || m.normalMap || m.roughnessMap || m.aoMap || m.bumpMap || m.alphaMap || m.emissiveMap);
        if (needUV && !g.attributes.uv) add('NO-UV', 'warn', o, 'material has texture maps but geometry has no uv (look.js triplanar may cover; plain map would smear)');
        if (g.attributes.uv) { const ua = g.attributes.uv.array; let bad = false; for (let i = 0; i < ua.length; i += Math.max(2, (ua.length / 2000 | 0) * 2)) if (!isFinite(ua[i])) { bad = true; break; } if (bad) add('NAN-UV', 'err', o, 'non-finite uv'); }
        if (mats.some(m => m.aoMap) && !g.attributes.uv1 && !g.attributes.uv2) { /* three r170 uses channel; fine */ }
      }
      mats.forEach((m) => {
        if (!seenMat.has(m.uuid)) {
          seenMat.add(m.uuid);
          const nm = m.name || m.type;
          if (m.transparent && m.depthWrite !== false && !m.alphaTest && m.opacity < 1 && !m.userData.audited) add('TRANSP-DEPTHWRITE', 'warn', o, `transparent material "${nm}" (opacity ${m.opacity}) writes depth: sorting holes`);
          if (m.transparent && !m.depthWrite && o.renderOrder === 0 && !m.blending !== THREE.AdditiveBlending && m.opacity < 0.999 && !o.parent?.isSprite) { /* ordering by distance is fine */ }
          if (m.map && !m.transparent && !m.alphaTest && m.map.image) { const mn = m.map.isCanvasTexture ? canvasAlpha(m.map) : null; if (mn !== null && mn < 250 && m.map.format === THREE.RGBAFormat) add('ALPHA-NO-CUTOUT', 'warn', o, `map "${nm}" has alpha<250 but material has no transparent/alphaTest (alpha ignored: black/white fringes)`); }
          if (m.side === THREE.DoubleSide && m.transparent && m.depthWrite !== false) add('DOUBLE-TRANSP', 'info', o, `DoubleSide + transparent + depthWrite "${nm}"`);
          if ((m.isMeshStandardMaterial) && m.flatShading && !o.geometry.attributes.normal) { /* fine */ }
          if (m.isShaderMaterial && logDepth && !/logdepthbuf|gl_FragDepth/.test((m.vertexShader || '') + (m.fragmentShader || '')) && !m.depthTest === false) add('SHADER-NO-LOGDEPTH', 'info', o, `ShaderMaterial "${nm}" does not write log depth but depthTest is on (inconsistent with scene)`);
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap', 'alphaMap']) {
            const t = m[k]; if (!t) continue; if (!seenTex.has(t.uuid)) seenTex.set(t.uuid, { t, k, o, m });
          }
        }
      });
      // collect planar quads / boxes for z-fight test (unbatched geometry only)
      if (!o.isInstancedMesh && o.visible && nTri <= 12) {
        const bb = new THREE.Box3().setFromObject(o); const sz = bb.getSize(new V3());
        const isBox = g.type === 'BoxGeometry' || nTri === 12; const rot = new THREE.Quaternion(); o.getWorldQuaternion(rot);
        const axis = Math.abs(rot.x * rot.y) + Math.abs(rot.z * rot.w) + Math.abs(rot.x * rot.z) + Math.abs(rot.y * rot.w) + Math.abs(rot.x * rot.w) + Math.abs(rot.y * rot.z);
        const aligned = axis < 1e-3 || Math.abs(Math.abs(rot.y) - Math.SQRT1_2) < 1e-3 && Math.abs(Math.abs(rot.w) - Math.SQRT1_2) < 1e-3 || Math.abs(Math.abs(rot.y) - 1) < 1e-3 || Math.abs(Math.abs(rot.w) - 1) < 1e-3;
        const dbl = mats.some(m => m.polygonOffset); if (isBox && aligned && !dbl && sz.x * sz.y * sz.z > 0) boxes.push({ o, bb: bb.clone() });
      }
    } else if (o.isPoints) { stats.points++; const g = o.geometry; if (g.attributes.position && o.material.sizeAttenuation === false && !o.material.map && !o.material.isShaderMaterial) add('POINTS-SQUARE', 'warn', o, `fixed-size PointsMaterial size ${o.material.size} without a sprite map: square points shimmer (area flips between ${Math.floor(o.material.size) ** 2} and ${Math.ceil(o.material.size) ** 2} px)`); }
    else if (o.isLine) stats.lines++;
  });
  // textures
  seenTex.forEach(({ t, k, o, m }) => {
    const nm = `${m.name || m.type}.${k}`; const im = t.image;
    const color = (k === 'map' || k === 'emissiveMap');
    if (!im) { add('TEX-NOIMAGE', 'err', o, `${nm}: texture has no image`); return; }
    const w = im.width || im.videoWidth || 0, h = im.height || im.videoHeight || 0;
    if (im.complete === false) add('TEX-LOADING', 'warn', o, `${nm}: image still loading`);
    if (w <= 1 && h <= 1 && w > 0) add('TEX-1PX', 'warn', o, `${nm}: 1x1 fallback texture (load failed or placeholder)`);
    if (t.version === 0 && im.complete !== false && !t.isCompressedTexture && !t.isDataTexture && !t.isCubeTexture) add('TEX-NOT-UPLOADED', 'err', o, `${nm}: version 0, needsUpdate was never set (renders black/white)`);
    if (color && t.colorSpace !== THREE.SRGBColorSpace && !t.isDataTexture) add('TEX-COLORSPACE', 'warn', o, `${nm}: colour map is ${t.colorSpace || 'none'}, expected srgb`);
    if (!color && k !== 'alphaMap' && t.colorSpace === THREE.SRGBColorSpace) add('TEX-COLORSPACE', 'warn', o, `${nm}: data map is tagged srgb`);
    const mip = t.minFilter === THREE.LinearMipmapLinearFilter || t.minFilter === THREE.LinearMipmapNearestFilter || t.minFilter === THREE.NearestMipmapLinearFilter || t.minFilter === THREE.NearestMipmapNearestFilter;
    if (!mip && w > 4 && !t.isDataTexture) add('TEX-NOMIP', 'warn', o, `${nm}: minFilter ${t.minFilter} has no mipmaps (shimmers at distance)`);
    if (mip && !t.generateMipmaps && !t.mipmaps?.length && !t.isCompressedTexture) add('TEX-MIP-MISSING', 'err', o, `${nm}: mipmap minFilter but generateMipmaps=false and no mips (renders black)`);
    if ((t.repeat.x !== 1 || t.repeat.y !== 1) && t.wrapS === THREE.ClampToEdgeWrapping && t.wrapT === THREE.ClampToEdgeWrapping) add('TEX-WRAP', 'warn', o, `${nm}: repeat ${t.repeat.x},${t.repeat.y} but wrap is ClampToEdge (smear)`);
    const uvMax = o.geometry.attributes.uv ? (() => { const a = o.geometry.attributes.uv.array; let mx = 0; for (let i = 0; i < a.length; i += Math.max(1, (a.length / 600 | 0))) mx = Math.max(mx, Math.abs(a[i])); return mx; })() : 0;
    if (uvMax * Math.max(t.repeat.x, t.repeat.y) > 1.01 && t.wrapS === THREE.ClampToEdgeWrapping) add('TEX-WRAP', 'warn', o, `${nm}: uv reaches ${uvMax.toFixed(1)} but wrapS is ClampToEdge`);
    if (t.anisotropy <= 1 && w >= 128 && (k === 'map')) add('TEX-ANISO', 'info', o, `${nm}: anisotropy ${t.anisotropy}`);
  });
  // z-fighting between coincident same-facing faces of axis-aligned boxes (cheap spatial hash)
  const EPS = 0.0015, OV = 0.02; const grid = new Map(); const cell = 4;
  boxes.forEach((b, i) => { for (let x = Math.floor(b.bb.min.x / cell); x <= Math.floor(b.bb.max.x / cell); x++) for (let y = Math.floor(b.bb.min.y / cell); y <= Math.floor(b.bb.max.y / cell); y++) for (let z = Math.floor(b.bb.min.z / cell); z <= Math.floor(b.bb.max.z / cell); z++) { const k = x + ',' + y + ',' + z; (grid.get(k) || grid.set(k, []).get(k)).push(i); } });
  const done = new Set(); let zf = 0;
  grid.forEach((list) => {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const ia = list[a], ib = list[b], key = ia < ib ? ia * 100003 + ib : ib * 100003 + ia; if (done.has(key)) continue; done.add(key);
      const A = boxes[ia].bb, B = boxes[ib].bb;
      for (const ax of ['x', 'y', 'z']) {
        const o1 = ax === 'x' ? ['y', 'z'] : ax === 'y' ? ['x', 'z'] : ['x', 'y']; const ov = o1.map(q => Math.min(A.max[q], B.max[q]) - Math.max(A.min[q], B.min[q]));
        if (ov[0] < OV || ov[1] < OV) continue;
        for (const side of ['min', 'max']) if (Math.abs(A[side][ax] - B[side][ax]) < EPS && Math.abs(A.max[ax] - A.min[ax]) > 0.002 && Math.abs(B.max[ax] - B.min[ax]) > 0.002) { zf++; if (zf <= 60) add('ZFIGHT', 'err', boxes[ia].o, `${ax}-${side} face coplanar with mesh at ${boxes[ib].o.getWorldPosition(new V3()).toArray().map(v => v.toFixed(2))} sz ${boxes[ib].bb.getSize(new V3()).toArray().map(v => v.toFixed(2))} (self sz ${A.getSize(new V3()).toArray().map(v => v.toFixed(2))}) (${ov.map(v => v.toFixed(2)).join('x')} m overlap) at ${A[side][ax].toFixed(3)}`); }
      }
    }
  });
  if (zf > 60) add('ZFIGHT', 'err', null, `+${zf - 60} more coplanar pairs`);
  // camera
  if (camera) {
    if (!logDepth && camera.far / camera.near > 1e5) add('CAMERA-RANGE', 'err', null, `near ${camera.near} far ${camera.far} without logarithmic depth: z-fighting at distance`);
    if (camera.near < 0.02) add('CAMERA-RANGE', 'warn', null, `near ${camera.near} is very small`);
  }
  const sums = {}; F.forEach(f => { sums[f.rule] = (sums[f.rule] || 0) + 1; });
  return { label, stats, textures: seenTex.size, materials: seenMat.size, geometries: seenGeo.size, counts: sums, errors: F.filter(f => f.sev === 'err').length, warns: F.filter(f => f.sev === 'warn').length, findings: F };
}
