// Sky dome: gradient atmosphere, sun, clouds, stars; fades to space with altitude
import * as THREE from '../vendor/three.module.js';

const frag = `
varying vec3 vDir;
uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uHor; uniform float uSpace; uniform float uDay; uniform float uTime; uniform float uCloud; uniform float uAir; uniform vec3 uSunCol;
float h31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm2(vec2 p){ float a=.5, r=0.; for(int i=0;i<5;i++){ r+=a*n2(p); p=p*2.03+vec2(7.1,3.3); a*=.5; } return r; }
void main(){
  vec3 d = normalize(vDir);
  float el = d.y;
  float sunEl = uSun.y;
  float day = uDay;
  vec3 zen = uSky * (0.15 + 0.85*day);
  vec3 hor = uHor * (0.12 + 0.88*day);
  float tw = clamp(1.0 - abs(sunEl)*2.6, 0.0, 1.0) * uAir;
  float facing = pow(max(dot(normalize(vec3(d.x,0.0,d.z)+1e-4), normalize(vec3(uSun.x,0.0,uSun.z)+1e-4)),0.0), 2.0);
  hor = mix(hor, vec3(1.0,0.46,0.2)*0.9, clamp(tw*0.7*facing+tw*0.25, 0.0, 1.0));
  float k = pow(clamp(el,0.0,1.0), 0.42);
  vec3 col = mix(hor, zen, k);
  if (el < 0.0) col = mix(hor, hor*0.55, clamp(-el*6.0,0.0,1.0));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(sd, 900.0)*6.0 + pow(sd, 60.0)*0.5*day + pow(sd, 6.0)*0.12*day) * uAir;
  if (el > 0.02 && uCloud > 0.01) {
    vec2 p = d.xz/(el+0.18)*1.4 + vec2(uTime*0.004, uTime*0.0015);
    float c = fbm2(p*1.2);
    float cov = smoothstep(0.52 - uCloud*0.22, 0.78, c);
    float shade = 0.55 + 0.45*clamp(uSun.y+0.4, 0.0, 1.0);
    vec3 cc = mix(vec3(0.62,0.66,0.74), vec3(1.0), clamp(fbm2(p*3.0+4.0)*1.3,0.0,1.0)) * shade * (0.25+0.75*day);
    cc = mix(cc, vec3(1.0,0.6,0.35)*shade, tw*0.5);
    col = mix(col, cc, cov * smoothstep(0.02,0.25,el) * 0.9);
  }
  vec3 sp = floor(d*320.0);
  float st = step(0.9965, h31(sp)) * (0.5+0.5*h31(sp+3.0));
  float starVis = clamp(1.0 - day*uAir*1.25, 0.0, 1.0);
  vec3 space = vec3(0.004,0.005,0.012) + vec3(st)*vec3(1.0,0.95,0.9);
  col += vec3(st) * starVis * (1.0-uSpace);
  col = mix(col, space, uSpace);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSky: { value: new THREE.Color(0x5a8fd8) }, uHor: { value: new THREE.Color(0xbcd6f0) }, uSpace: { value: 0 }, uDay: { value: 1 }, uTime: { value: 0 }, uCloud: { value: 0.5 }, uAir: { value: 1 }, uSunCol: { value: new THREE.Color(1, .92, .75) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w*0.99999; }',
      fragmentShader: frag,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -100;
    this.air = 1;
  }
  set(planetSky, air, cloud) {
    const base = new THREE.Color(planetSky); const u = this.mat.uniforms;
    u.uSky.value.copy(base).lerp(new THREE.Color(0x1a3c8a), 0.35); u.uHor.value.copy(base).lerp(new THREE.Color(0xffffff), 0.55);
    u.uAir.value = air > 0.3 ? 1 : 0.0; u.uCloud.value = air > 0.5 ? cloud : 0; this.air = air;
  }
  update(camPos, sunDir, day, alt, time) {
    const u = this.mat.uniforms; this.mesh.position.copy(camPos); u.uSun.value.copy(sunDir); u.uDay.value = day; u.uTime.value = time;
    u.uSpace.value = this.air > 0.3 ? Math.min(1, Math.max(0, (alt - 2500) / 3500)) : 1;
    u.uSunCol.value.set(1, 0.92 - (1 - day) * 0.3, 0.75 - (1 - day) * 0.3);
  }
}
