// Procedural models: planets of many shapes, ships, squad-car police cruisers, people
import * as THREE from '../vendor/three.module.js';
import { rng, fbm, noise3 } from './util.js';
import { PLANET_KINDS } from './data.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2, ...o });
const mesh = (g, m) => { const x = new THREE.Mesh(g, m); return x; };

function paletteColor(pal, t) {
  const f = Math.min(pal.length - 1.001, Math.max(0, t * (pal.length - 1))); const i = Math.floor(f), k = f - i;
  return [pal[i][0] + (pal[i + 1][0] - pal[i][0]) * k, pal[i][1] + (pal[i + 1][1] - pal[i][1]) * k, pal[i][2] + (pal[i + 1][2] - pal[i][2]) * k];
}
function displacedSphere(radius, seed, amp, freq, pal, sy = 1, detail = 5, craters = false) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let h = fbm(x * freq + 10, y * freq + 10, z * freq + 10, seed, 5);
    let hh = h; if (craters) hh -= Math.max(0, 0.55 - Math.abs(noise3(x * 5, y * 5, z * 5, seed + 3) - 0.5) * 4) * 0.4;
    const r = 1 + (hh - 0.5) * amp;
    pos.setXYZ(i, x * r * radius, y * r * radius * sy, z * r * radius);
    const c = paletteColor(pal, Math.min(1, Math.max(0, hh * 1.1 + (Math.abs(y) > 0.85 ? 0.3 : 0))));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

// Returns {group, collR}: planets from perfect spheres to rings, donuts, shards, crystal clusters
export function buildPlanet(p) {
  const k = PLANET_KINDS[p.kind]; const r = rng(p.seed); const R = p.radius; const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05 });
  let collR = R;
  const detail = R > 2500 ? 6 : 5;
  const shape = p.shape;
  if (shape === 'round' || shape === 'ringed') grp.add(mesh(displacedSphere(R, p.seed, 0.12, 1.6, k.pal, 1, detail), mat));
  else if (shape === 'oblate') grp.add(mesh(displacedSphere(R, p.seed, 0.1, 1.4, k.pal, 0.62, detail), mat));
  else if (shape === 'lumpy') { grp.add(mesh(displacedSphere(R, p.seed, 0.7, 1.1, k.pal, 0.85, detail, true), mat)); collR = R * 0.95; }
  else if (shape === 'ringworld') {
    const g = new THREE.CylinderGeometry(R, R, R * 0.35, 96, 1, true); const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const n = fbm(pos.getX(i) / R * 4, pos.getY(i) / R * 4, pos.getZ(i) / R * 4, p.seed, 4); const c = paletteColor(k.pal, n); col.set(c, i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    grp.add(mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 })));
    const rim = mesh(new THREE.TorusGeometry(R, R * 0.012, 8, 96), std(0x889099)); rim.rotation.x = Math.PI / 2; rim.position.y = R * 0.175; grp.add(rim);
    const rim2 = rim.clone(); rim2.position.y = -R * 0.175; grp.add(rim2);
    grp.rotation.x = r.range(0.3, 1.1); collR = R * 0.5;
  } else if (shape === 'donut') {
    const g = new THREE.TorusGeometry(R, R * 0.42, 40, 96); const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const n = fbm(pos.getX(i) / R * 2, pos.getY(i) / R * 2, pos.getZ(i) / R * 2, p.seed, 5); col.set(paletteColor(k.pal, n), i * 3); const d = (n - 0.5) * 0.08 * R; pos.setXYZ(i, pos.getX(i) + d, pos.getY(i) + d, pos.getZ(i) + d); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    grp.add(mesh(g, mat)); grp.rotation.x = r.range(0.2, 1.3); collR = R * 0.42 + 1;
  } else if (shape === 'crystal') {
    const m2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(...k.pal[1]), roughness: 0.15, metalness: 0.4, emissive: new THREE.Color(...k.pal[2]).multiplyScalar(0.25), flatShading: true });
    grp.add(mesh(displacedSphere(R * 0.55, p.seed, 0.3, 1.5, k.pal, 1, 4), mat));
    for (let i = 0; i < 26; i++) {
      const h = R * r.range(0.5, 1.15), w = R * r.range(0.08, 0.2); const c = mesh(new THREE.ConeGeometry(w, h, 6), m2);
      const d = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize();
      c.position.copy(d).multiplyScalar(R * 0.5 + h * 0.35); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); grp.add(c);
    }
    collR = R * 0.9;
  } else if (shape === 'shard') {
    const m2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(...k.pal[1]), roughness: 0.85, flatShading: true });
    for (let i = 0; i < 16; i++) {
      const s = R * r.range(0.12, 0.42); const c = mesh(new THREE.DodecahedronGeometry(s, 0), m2); c.scale.set(r.range(0.6, 1.6), r.range(0.5, 1.2), r.range(0.6, 1.5));
      const a = r.range(0, Math.PI * 2), rad = R * r.range(0.4, 1.3); c.position.set(Math.cos(a) * rad, r.range(-R * 0.3, R * 0.3), Math.sin(a) * rad); c.rotation.set(r(), r(), r()); grp.add(c);
    }
    collR = R * 1.1;
  } else if (shape === 'moonpair') {
    grp.add(mesh(displacedSphere(R, p.seed, 0.1, 1.6, k.pal, 1, detail), mat));
    const m = mesh(displacedSphere(R * 0.55, p.seed + 5, 0.2, 2, k.pal, 1, 4), mat); m.position.set(R * 1.9, R * 0.2, 0); grp.add(m);
    collR = R;
  }
  if (p.air > 0.3 && (shape === 'round' || shape === 'oblate' || shape === 'ringed' || shape === 'moonpair')) {
    const atm = mesh(new THREE.SphereGeometry(R * 1.06, 48, 24), new THREE.MeshBasicMaterial({ color: k.sky, transparent: true, opacity: 0.18, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    grp.add(atm);
  }
  if (p.ring) {
    const g = new THREE.RingGeometry(R * 1.35, R * 2.3, 96, 1); const pos = g.attributes.position; const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const rr = Math.hypot(pos.getX(i), pos.getY(i)) / R; uv.setXY(i, (rr - 1.35) / 0.95, 0.5); }
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 4; const cx = cv.getContext('2d');
    for (let x = 0; x < 256; x++) { const a = noise3(x / 9, 0, 0, p.seed) * (x > 5 && x < 250 ? 1 : 0); cx.fillStyle = `rgba(${200 + (a * 40) | 0},${180 + (a * 40) | 0},${150},${0.15 + a * 0.6})`; cx.fillRect(x, 0, 1, 4); }
    const ring = mesh(g, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    ring.rotation.x = Math.PI / 2 + p.ringTilt; grp.add(ring); collR = Math.max(collR, R);
  }
  return { group: grp, collR };
}

export function buildPlayerShip() {
  const g = new THREE.Group();
  const hull = std(0xc9ccd2, { metalness: 0.5, roughness: 0.4 }), dark = std(0x2b2f38), accent = std(0xe8742a, { metalness: 0.3 });
  const body = mesh(new THREE.BoxGeometry(3.2, 1.8, 9), hull); g.add(body);
  const nose = mesh(new THREE.ConeGeometry(1.6, 4, 4), hull); nose.rotation.set(-Math.PI / 2, Math.PI / 4, 0); nose.position.z = -6.4; nose.scale.set(1, 1, 0.6); g.add(nose);
  const glass = mesh(new THREE.BoxGeometry(2.2, 0.9, 2.6), std(0x6fd0ff, { metalness: 0.9, roughness: 0.05, emissive: 0x0a3a55 })); glass.position.set(0, 1.1, -2.2); g.add(glass);
  for (const s of [-1, 1]) {
    const w = mesh(new THREE.BoxGeometry(6, 0.25, 3.6), accent); w.position.set(s * 4, -0.2, 1.6); w.rotation.z = s * -0.08; g.add(w);
    const e = mesh(new THREE.CylinderGeometry(0.7, 0.9, 3, 12), dark); e.rotation.x = Math.PI / 2; e.position.set(s * 2.4, -0.2, 4.4); g.add(e);
    const f = mesh(new THREE.ConeGeometry(0.62, 3, 12), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85 })); f.rotation.x = -Math.PI / 2; f.position.set(s * 2.4, -0.2, 7.2); f.name = 'flame'; g.add(f);
  }
  const fin = mesh(new THREE.BoxGeometry(0.2, 2, 2.5), accent); fin.position.set(0, 1.6, 3.5); g.add(fin);
  g.userData.radius = 8; return g;
}

function labelTexture(text, w = 256, h = 64, bg = '#10131a', fg = '#fff') {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = fg; c.font = `bold ${h * 0.62}px Arial Black, Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Police ships are squad cars with thrusters for wheels: black-and-white livery, roof light bar, POLICE doors.
export function buildSquadCar() {
  const g = new THREE.Group(); g.userData.radius = 9;
  const white = std(0xf2f4f7, { roughness: 0.35, metalness: 0.4 }), black = std(0x15171c, { roughness: 0.4, metalness: 0.5 });
  const lower = mesh(new THREE.BoxGeometry(5.4, 1.5, 13), black); lower.position.y = -0.4; g.add(lower);
  const upperFront = mesh(new THREE.BoxGeometry(5.4, 1.1, 13), white); upperFront.position.y = 0.9; g.add(upperFront);
  const cabin = mesh(new THREE.BoxGeometry(4.6, 1.5, 5.4), white); cabin.position.set(0, 2.1, 0.6); g.add(cabin);
  const wind = std(0x1c2a3a, { metalness: 0.95, roughness: 0.05, emissive: 0x08121c });
  const ws = mesh(new THREE.BoxGeometry(4.2, 1.1, 0.12), wind); ws.position.set(0, 2.1, -2.12); ws.rotation.x = 0.35; g.add(ws);
  const rs = ws.clone(); rs.position.z = 3.3; rs.rotation.x = -0.35; g.add(rs);
  for (const s of [-1, 1]) {
    const lbl = mesh(new THREE.PlaneGeometry(5.6, 1.1), new THREE.MeshBasicMaterial({ map: labelTexture('POLICE', 256, 50, '#f2f4f7', '#12161d') })); lbl.position.set(s * 2.72, 0.9, 0.2); lbl.rotation.y = s * Math.PI / 2; g.add(lbl);
    const stripe = mesh(new THREE.BoxGeometry(0.05, 0.22, 12.8), std(0x2f6bff, { emissive: 0x112a66 })); stripe.position.set(s * 2.72, -0.1, 0); g.add(stripe);
    for (const z of [-4.2, 4.2]) {
      const pod = mesh(new THREE.CylinderGeometry(1.1, 1.3, 1.4, 16), black); pod.position.set(s * 3.2, -0.9, z); pod.rotation.z = Math.PI / 2; g.add(pod);
      const glow = mesh(new THREE.CircleGeometry(0.85, 16), new THREE.MeshBasicMaterial({ color: 0x7fd0ff })); glow.position.set(s * 3.95, -0.9, z); glow.rotation.y = s * Math.PI / 2; g.add(glow);
    }
  }
  const bar = mesh(new THREE.BoxGeometry(3.4, 0.35, 1), black); bar.position.set(0, 3.0, 0.6); g.add(bar);
  const red = mesh(new THREE.BoxGeometry(1.6, 0.5, 0.9), new THREE.MeshBasicMaterial({ color: 0xff2020 })); red.position.set(-0.85, 3.3, 0.6); g.add(red);
  const blue = mesh(new THREE.BoxGeometry(1.6, 0.5, 0.9), new THREE.MeshBasicMaterial({ color: 0x2060ff })); blue.position.set(0.85, 3.3, 0.6); g.add(blue);
  const rl = new THREE.PointLight(0xff2020, 0, 160, 2), bl = new THREE.PointLight(0x2060ff, 0, 160, 2); rl.position.set(-1, 3.8, 0.6); bl.position.set(1, 3.8, 0.6); g.add(rl, bl);
  g.userData.lights = { red, blue, rl, bl };
  const bumper = mesh(new THREE.BoxGeometry(5.6, 0.7, 0.5), black); bumper.position.set(0, -0.5, -6.6); g.add(bumper);
  for (const s of [-1, 1]) { const hl = mesh(new THREE.BoxGeometry(0.9, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff2c0 })); hl.position.set(s * 1.8, 0.4, -6.52); g.add(hl); }
  const plate = mesh(new THREE.PlaneGeometry(2, 0.5), new THREE.MeshBasicMaterial({ map: labelTexture('RR-911', 128, 32, '#e6d64a', '#111') })); plate.position.set(0, -0.4, 6.52); plate.rotation.y = Math.PI; g.add(plate);
  return g;
}

export function buildFreighter(seed) {
  const r = rng(seed); const g = new THREE.Group(); g.userData.radius = 14;
  const c = r.pick([0x8a5a3a, 0x4a6a8a, 0x6a8a4a, 0x8a8a8a]);
  const body = mesh(new THREE.BoxGeometry(5, 4, 26), std(c)); g.add(body);
  for (let i = 0; i < 3; i++) { const cr = mesh(new THREE.BoxGeometry(5.6, 3.2, 5), std(r.pick([0xaa4a2a, 0x2a6aaa, 0xaaaa2a, 0x666b73]))); cr.position.z = -8 + i * 8; g.add(cr); }
  const eng = mesh(new THREE.CylinderGeometry(1.4, 1.8, 3, 12), std(0x22262c)); eng.rotation.x = Math.PI / 2; eng.position.z = 14; g.add(eng);
  const f = mesh(new THREE.ConeGeometry(1.2, 4, 10), new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.8 })); f.rotation.x = -Math.PI / 2; f.position.z = 18; g.add(f);
  return g;
}

// A simple jointed person: used for NPCs, guards and the player's third-person body
export function buildPerson(look, opts = {}) {
  const g = new THREE.Group(); const sk = std(look.skin, { roughness: 0.8, metalness: 0 }), sh = std(look.shirt, { roughness: 0.9, metalness: 0 }), pa = std(opts.pants || 0x2c3340, { roughness: 0.9, metalness: 0 });
  const torso = mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), sh); torso.position.y = 1.15; g.add(torso);
  const head = mesh(new THREE.SphereGeometry(0.13, 14, 12), sk); head.position.y = 1.62; head.scale.set(0.95, 1.12, 1); g.add(head);
  const hair = mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), std(opts.hair || 0x2a1d14, { metalness: 0 })); hair.position.y = 1.64; g.add(hair);
  const mk = (x, w, h, m, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const l = mesh(new THREE.BoxGeometry(w, h, w), m); l.position.y = -h / 2; p.add(l); g.add(p); return p; };
  g.userData.legL = mk(-0.11, 0.17, 0.82, pa, 0.82); g.userData.legR = mk(0.11, 0.17, 0.82, pa, 0.82);
  g.userData.armL = mk(-0.3, 0.12, 0.6, sh, 1.42); g.userData.armR = mk(0.3, 0.12, 0.6, sh, 1.42);
  g.userData.head = head; g.userData.torso = torso;
  if (opts.badge) { const b = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), std(0xffd24a)); b.position.set(0.12, 1.3, -0.14); g.add(b); const cap = mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.08, 12), std(0x151a24)); cap.position.y = 1.74; g.add(cap); }
  g.scale.setScalar(look.height || 1);
  return g;
}

export function buildBackpackMesh() {
  const g = new THREE.Group(); const leather = std(0x6b4a2d, { roughness: 0.9, metalness: 0 });
  const body = mesh(new THREE.BoxGeometry(0.34, 0.46, 0.18), leather); g.add(body);
  const flap = mesh(new THREE.BoxGeometry(0.35, 0.18, 0.2), std(0x7b5636, { roughness: 0.9, metalness: 0 })); flap.position.y = 0.2; g.add(flap);
  const pocket = mesh(new THREE.BoxGeometry(0.26, 0.2, 0.06), std(0x5a3d24, { roughness: 0.9, metalness: 0 })); pocket.position.set(0, -0.08, 0.12); g.add(pocket);
  g.userData.sides = [new THREE.Group(), new THREE.Group()]; g.userData.sides[0].position.set(-0.22, 0, 0); g.userData.sides[1].position.set(0.22, 0, 0); g.add(...g.userData.sides);
  return g;
}

export function gunMesh(id, q = 1) {
  const g = new THREE.Group(); const metal = std(0x30343a, { metalness: 0.7, roughness: 0.35 });
  const col = std(new THREE.Color(id === 'arc' ? 0x2a4a5a : 0x3a3f46), { metalness: 0.7, roughness: 0.35 });
  const add = (w, h, d, x, y, z, m = metal) => { const b = mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  if (id === 'pistol') { add(0.035, 0.05, 0.2, 0, 0, -0.1, col); add(0.032, 0.1, 0.045, 0, -0.07, -0.02); }
  else if (id === 'coach') { add(0.05, 0.05, 0.34, 0, 0, -0.17); add(0.04, 0.09, 0.07, 0, -0.06, 0, std(0x6a4a2a)); }
  else if (id === 'rifle') { add(0.04, 0.06, 0.62, 0, 0, -0.3, col); add(0.045, 0.08, 0.2, 0, -0.01, 0.06, std(0x6a4a2a)); add(0.02, 0.04, 0.18, 0, 0.06, -0.2); }
  else if (id === 'breacher') { add(0.06, 0.07, 0.55, 0, 0, -0.26); add(0.05, 0.09, 0.22, 0, -0.01, 0.08, std(0x6a4a2a)); add(0.07, 0.04, 0.2, 0, -0.05, -0.2, std(0x7a5a3a)); }
  else { add(0.06, 0.08, 0.55, 0, 0, -0.26, col); const e = add(0.03, 0.03, 0.4, 0, 0.055, -0.3, new THREE.MeshBasicMaterial({ color: 0x48d6ff })); add(0.05, 0.1, 0.06, 0, -0.08, -0.02); }
  return g;
}
