// A copy of manul_parkour/shared/util.js (the ad's helpers), so the game stands on its own.
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOutBack = (t, s = 1.70158) => { t = clamp(t); const c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
export const easeInBack = (t, s = 1.70158) => { t = clamp(t); return (s + 1) * t * t * t - s * t * t; };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeOutElastic = (t) => {
  t = clamp(t);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
};
export const easeOutBounce = (t) => {
  t = clamp(t);
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
// 0 -> 1 -> 0 over [a, b]
export const arc = (t, a, b) => { const u = (t - a) / (b - a); return u <= 0 || u >= 1 ? 0 : 4 * u * (1 - u); };
export const pulse = (t, a, b, fade = 0.15) => Math.min(range(t, a, a + fade), 1 - range(t, b - fade, b));
export const frac = (x) => x - Math.floor(x);
export const lerpAngle = (a, b, t) => {
  let d = ((b - a) % TAU + TAU * 1.5) % TAU - TAU / 2;
  return a + d * t;
};
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function canvasTexture(THREE, w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (opts.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...opts.repeat); }
  return tex;
}
// gradient sky dome shader, shared by scenes
export function makeSky(THREE, top, mid, bottom) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bot: { value: new THREE.Color(bottom) },
      top2: { value: new THREE.Color(top) }, mid2: { value: new THREE.Color(mid) }, bot2: { value: new THREE.Color(bottom) },
      mixv: { value: 0 },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, mid, bot, top2, mid2, bot2; uniform float mixv; varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 a = mix(mid, top, smoothstep(0.0, 0.55, h)); a = mix(bot, a, smoothstep(-0.25, 0.02, h));
        vec3 b = mix(mid2, top2, smoothstep(0.0, 0.55, h)); b = mix(bot2, b, smoothstep(-0.25, 0.02, h));
        gl_FragColor = vec4(mix(a, b, mixv), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), mat);
  mesh.renderOrder = -1;
  return mesh;
}
