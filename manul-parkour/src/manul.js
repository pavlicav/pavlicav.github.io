// The manul from Brain Break's MANUL PARKOUR (ads/brain-break/src/panels/narrator-game.js), lifted as-is:
// the same fur shells and shaders, the same painted textures from the same seeds, the same round body, flat
// head, low ears, yellow eyes under heavy lids, white muzzle, ringed tail and four tiny legs.
// Only the posing moved out of the ad's render() into poseManul(), so a player can drive it.
import * as THREE from 'three';
import { TAU, lerp, rng, canvasTexture } from './util.js';

// ---------------------------------------------------------------------------------------------------
// fur: stacked shells, each a little further out, keeping fewer strands the further out it is
const FUR_VS = `
uniform float h; uniform float len; uniform vec3 drift;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position + normal * h * len, 1.0);
  w.xyz += drift * h * h;
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FUR_FS = `
uniform float h; uniform sampler2D noise; uniform sampler2D col; uniform vec2 rep; uniform vec3 tip;
uniform vec3 L; uniform vec3 sky; uniform vec3 ground; uniform vec3 sunCol; uniform float glow; uniform vec3 glowCol;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  float n = texture2D(noise, vUv * rep + vec2(0.0, h * 0.012)).r;
  if (h > 0.001 && n < h * 0.9 + 0.06) discard;
  vec3 base = texture2D(col, vUv).rgb;
  vec3 c = mix(base * 0.5, base, smoothstep(0.0, 0.45, h));
  c = mix(c, tip, smoothstep(0.6, 1.0, h) * 0.45);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float wrap = clamp((dot(N, L) + 0.45) / 1.45, 0.0, 1.0);
  vec3 amb = mix(ground, sky, N.y * 0.5 + 0.5);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
  vec3 o = c * (amb * 0.62 + sunCol * wrap * 0.95) + rim * tip * 0.45 * h;
  o += glowCol * glow * (0.3 + rim * 1.6) * (0.4 + h);
  gl_FragColor = vec4(o, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function furTextures() {
  const R = rng(4242);
  // strands: a random value per texel
  const N = 128, data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { const v = Math.floor(R() * 255); data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  const noise = new THREE.DataTexture(data, N, N);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.magFilter = noise.minFilter = THREE.LinearFilter; noise.generateMipmaps = false; noise.needsUpdate = true;
  const speckle = (g, w, h, n, cols) => { for (let k = 0; k < n; k++) { g.fillStyle = cols[Math.floor(R() * cols.length)]; g.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 3); } };
  // body: greyer back, buff flanks, cream belly, faint stripes over the hips (u 0.25 = the back end)
  const body = canvasTexture(THREE, 256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#8e857b'); gr.addColorStop(0.45, '#a8977f'); gr.addColorStop(0.8, '#c9b493'); gr.addColorStop(1, '#ddd0b6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['rgba(255,255,255,0.18)', 'rgba(60,50,40,0.18)', 'rgba(140,120,95,0.3)']);
    g.fillStyle = 'rgba(70,58,46,0.42)';
    for (let k = -3; k <= 3; k++) { if (!k) continue; g.save(); g.translate(64 + k * 13, 46); g.rotate(k * 0.05); g.fillRect(-3, -26, 6, 40); g.restore(); }
  });
  // head: front (u 0.75) has the forehead spots, pale eye rings, cheek stripes and a white muzzle
  const head = canvasTexture(THREE, 256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#8f867c'); gr.addColorStop(0.5, '#a99a87'); gr.addColorStop(1, '#d9ccb4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 700, ['rgba(255,255,255,0.18)', 'rgba(60,50,40,0.2)']);
    const fx = 192;
    g.fillStyle = '#efe7d9'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(fx + s * 17, 60, 13, 9, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#f3eee6'; g.beginPath(); g.ellipse(fx, 84, 22, 14, 0, 0, TAU); g.fill();
    g.fillStyle = '#2f2822'; for (let k = 0; k < 14; k++) { g.beginPath(); g.arc(fx + (R() - 0.5) * 34, 26 + R() * 18, 1.4 + R() * 1.4, 0, TAU); g.fill(); }
    g.strokeStyle = '#3a312a'; g.lineWidth = 3.2; g.lineCap = 'round';
    for (const s of [-1, 1]) for (const dy of [0, 9]) { g.beginPath(); g.moveTo(fx + s * 28, 60 + dy); g.quadraticCurveTo(fx + s * 42, 66 + dy, fx + s * 56, 76 + dy); g.stroke(); }
  });
  // tail: thick, dark rings and a black tip (the tip is the top of the canvas)
  const tail = canvasTexture(THREE, 64, 128, (g, w, h) => {
    g.fillStyle = '#9d8e7b'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 200, ['rgba(255,255,255,0.2)', 'rgba(60,50,40,0.2)']);
    g.fillStyle = '#2f2721';
    g.fillRect(0, 0, w, 20);
    for (const yy of [32, 50, 68, 86]) g.fillRect(0, yy, w, 8);
  });
  return { noise, body, head, tail };
}

function fur(furU, geo, colTex, len, rep, shells) {
  const grp = new THREE.Group();
  for (let k = 0; k < shells; k++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...furU, h: { value: k / (shells - 1) }, len: { value: len }, rep: { value: new THREE.Vector2(...rep) }, col: { value: colTex } },
      vertexShader: FUR_VS, fragmentShader: FUR_FS,
    });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 2 + k;
    grp.add(m);
  }
  return grp;
}

/** builds the manul into the scene. day = the light colours the fur starts with ({ hs, hg, sun }) */
export function buildManul(scene, day) {
  const T = furTextures();
  const furU = {
    noise: { value: T.noise }, tip: { value: new THREE.Color('#f1ebe1') }, L: { value: new THREE.Vector3(0.45, 0.8, 0.4).normalize() },
    sky: { value: new THREE.Color(day.hs) }, ground: { value: new THREE.Color(day.hg) }, sunCol: { value: new THREE.Color(day.sun) },
    glow: { value: 0 }, glowCol: { value: new THREE.Color('#ffc84a') }, drift: { value: new THREE.Vector3(0, -0.05, 0) },
  };
  const root = new THREE.Group(), squash = new THREE.Group(), tilt = new THREE.Group();
  root.add(squash); squash.add(tilt); tilt.position.y = 0.68;
  scene.add(root);
  // the round body
  const body = fur(furU, new THREE.SphereGeometry(0.5, 40, 28), T.body, 0.17, [2.6, 1.3], 16);
  body.scale.set(1.0, 0.84, 1.1); tilt.add(body);
  // the big flat head, ears low on the sides
  const head = new THREE.Group(); head.position.set(0, 0.3, -0.5); tilt.add(head);
  const skull = fur(furU, new THREE.SphereGeometry(0.4, 40, 28), T.head, 0.12, [2.4, 1.2], 14);
  skull.scale.set(1.25, 0.88, 0.88); head.add(skull);
  const earM = new THREE.MeshStandardMaterial({ color: '#6c6157', roughness: 0.9 });
  const earIn = new THREE.MeshStandardMaterial({ color: '#d8c5ad', roughness: 0.9 });
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.52, 0.1, 0.04); ear.rotation.set(0, 0, -s * 1.05); ear.scale.setScalar(1.35); head.add(ear);
    const e1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.13, 14), earM); e1.scale.z = 0.5; ear.add(e1);
    const e2 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 12), earIn); e2.scale.z = 0.3; e2.position.set(0, -0.01, -0.03); ear.add(e2);
  }
  const iris = new THREE.MeshPhysicalMaterial({ color: '#e9cf3c', roughness: 0.15, clearcoat: 1, emissive: '#5a4300', emissiveIntensity: 0.3 });
  const black = new THREE.MeshStandardMaterial({ color: '#0e0b09', roughness: 0.2 });
  const lidM = new THREE.MeshStandardMaterial({ color: '#4e453d', roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: '#f3eee5', roughness: 1 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(s * 0.17, 0.04, -0.4); head.add(eye);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), iris));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 10), black); pupil.position.z = -0.05; pupil.scale.z = 0.5; eye.add(pupil);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); hl.position.set(-0.02, 0.025, -0.072); eye.add(hl);
    // the heavy, unimpressed lid
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.084, 24, 12, 0, TAU, 0, 1.36), lidM);
    lid.rotation.set(0.05, 0, s * 0.32); eye.add(lid);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshStandardMaterial({ color: '#8f625c', roughness: 0.5 }));
  nose.scale.set(1.3, 0.8, 0.8); nose.position.set(0, -0.06, -0.44); head.add(nose);
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), white); m.position.set(s * 0.066, -0.14, -0.39); head.add(m); }
  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), white); chin.position.set(0, -0.21, -0.36); head.add(chin);
  // the thick ringed tail
  const tail = new THREE.Group(); tail.position.set(0, -0.08, 0.5); tilt.add(tail);
  const tg = new THREE.CapsuleGeometry(0.15, 0.55, 8, 20); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 0.42);
  tail.add(fur(furU, tg, T.tail, 0.12, [1.1, 1.1], 14));
  // four tiny legs
  const legM = new THREE.MeshStandardMaterial({ color: '#968775', roughness: 1 });
  const pawM = new THREE.MeshStandardMaterial({ color: '#5f544a', roughness: 1 });
  const legs = [[-0.22, -0.26], [0.22, -0.26], [-0.24, 0.27], [0.24, 0.27]].map(([lx, lz]) => {
    const p = new THREE.Group(); p.position.set(lx, -0.38, lz); tilt.add(p);
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.12, 4, 10), legM); l.position.y = -0.15; p.add(l);
    const pw = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), pawM); pw.position.set(0, -0.25, -0.02); pw.scale.set(1, 0.6, 1.25); p.add(pw);
    return p;
  });
  return { root, squash, tilt, head, tail, legs, furU, iris };
}

/** a fresh pose: the same fields the ad's manulAt() fills in */
export const restPose = () => ({ x: 0, y: 0, z: 0, yaw: 0, sy: 1, pitch: 0, roll: 0, spin: 0, legs: 'idle', lp: 0, glow: 0, scale: 1, blink: false, jitter: 0, tailUp: 0, air: 0, cling: null });

/** puts the manul in pose o at time g; vel = its velocity, for the fur's lag (the ad's render(), lines 509-536) */
export function poseManul(M, o, g, vel) {
  M.root.position.set(o.x, o.y, o.z); M.root.rotation.y = o.yaw;
  M.root.visible = !o.blink;
  M.root.scale.setScalar(Math.max(0.001, o.scale));
  const sy = o.sy, sxz = 1 / Math.sqrt(Math.max(0.3, sy));
  M.squash.scale.set(sxz, sy, sxz);
  M.tilt.rotation.set(o.pitch + o.spin, 0, o.roll);
  M.tilt.position.x = o.jitter ? Math.sin(g * 71) * 0.05 * o.jitter : 0;
  M.legs.forEach((leg, k) => {
    const front = k < 2;
    let r = 0;
    if (o.legs === 'idle') r = 0.12 * Math.sin(o.lp + k * 1.6);
    else if (o.legs === 'walk') r = 0.7 * Math.sin(o.lp + (k === 0 || k === 3 ? 0 : Math.PI));   // diagonal pairs: the game's one addition
    else if (o.legs === 'air') r = front ? -0.75 : 0.65;
    else if (o.legs === 'scrabble') r = (front ? -1.3 : 0) + 1.1 * Math.sin(o.lp + k * 1.9);
    else if (o.legs === 'flail') r = 1.3 * Math.sin(o.lp * (1 + k * 0.17) + k * 2);
    else if (o.legs === 'brace') r = front ? -0.3 : 0.4;
    leg.rotation.x = r;
  });
  M.tail.rotation.set(o.air ? -0.15 : lerp(0.42, -0.75, o.tailUp || 0), 0.28 * Math.sin(g * 3.1), 0);
  M.head.rotation.set(o.cling != null ? 0.25 : 0, 0, 0);
  // fur lags behind the motion
  const d = vel.clone().multiplyScalar(-0.012); if (d.length() > 0.14) d.setLength(0.14);
  M.furU.drift.value.set(d.x, d.y - 0.05, d.z);
  M.furU.glow.value = o.glow * (0.85 + 0.15 * Math.sin(g * 31));
  M.iris.emissiveIntensity = 0.3 + o.glow * 2;
}
