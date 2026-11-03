// One shared, camera-locked star + nebula function used by BOTH the planet sky dome (sky.js) and the space dome (space.js),
// so the star pattern is identical across the atmosphere/orbit hand-off (no pop), round (not square) and fully procedural (no load to fail).
import * as THREE from '../vendor/three.module.js';

// shared nebula tints (set per system by space.js, read by the planet sky)
export const NEB = { c1: new THREE.Color(0x401060), c2: new THREE.Color(0x103060) };

export const STAR_GLSL = `
float sf_h31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float sf_n3(vec3 q){ vec3 i=floor(q), f=fract(q); f=f*f*(3.-2.*f);
  return mix(mix(mix(sf_h31(i),sf_h31(i+vec3(1,0,0)),f.x),mix(sf_h31(i+vec3(0,1,0)),sf_h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(sf_h31(i+vec3(0,0,1)),sf_h31(i+vec3(1,0,1)),f.x),mix(sf_h31(i+vec3(0,1,1)),sf_h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 starField(vec3 d){
  vec3 sp = d*200.0, c = floor(sp), f = fract(sp)-0.5;
  float h = sf_h31(c);
  vec3 jit = vec3(sf_h31(c+1.3), sf_h31(c+2.7), sf_h31(c+4.9)) - 0.5;
  float dd = length(f - jit*0.4);
  float on = step(0.975, h) * (0.45 + 0.55*sf_h31(c+7.1));
  float core = smoothstep(0.5, 0.0, dd);
  vec3 tint = mix(vec3(1.0,0.86,0.72), vec3(0.74,0.84,1.0), sf_h31(c+9.0));
  return tint * on * core * sqrt(core) * 2.6;
}
vec3 nebulaField(vec3 p, vec3 c1, vec3 c2){
  float a = sf_n3(p*2.2)*.55 + sf_n3(p*4.4)*.3 + sf_n3(p*9.)*.15; a = smoothstep(.45,.95,a);
  return mix(c1,c2,sf_n3(p*1.3))*a*.55;
}`;

// Space dome: depth-test off, drawn first, re-centred on the camera every frame by the owner (position.copy(camera.position)).
export function makeSpaceDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { c1: { value: NEB.c1 }, c2: { value: NEB.c2 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w*0.99999; }',
    fragmentShader: `varying vec3 vDir; uniform vec3 c1; uniform vec3 c2;\n${STAR_GLSL}
      void main(){ vec3 d = normalize(vDir); gl_FragColor = vec4(vec3(0.004,0.005,0.012) + nebulaField(d,c1,c2) + starField(d), 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -100; m.name = 'spaceDome'; return m;
}
