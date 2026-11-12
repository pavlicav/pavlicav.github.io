// The 3D world, from the ad's narrator-game.js: the pastel sky with its party twin, the sea of clouds far
// below, the drifting blocks and the ringed planet, the iced cake blocks with sprinkles, and the effects
// (aura, rainbow trail, charge sparks, landing dust, respawn burst, shock rings, blob shadow). Here the
// clouds and the drifting blocks wrap round the camera, so the course can go on for ever.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TAU, clamp, lerp, smooth, range, easeOutCubic, frac, rng, canvasTexture, makeSky } from './util.js';
import { buildManul, poseManul } from './manul.js';
import { blockTop } from './course.js';

export const PASTEL = ['#ff9cc6', '#86e6c3', '#b7a0ff', '#ffc78a', '#8ccfff', '#fff08a'];
export const NEON = ['#ff2d95', '#00ffb0', '#8f5bff', '#ff8a00', '#00c2ff', '#ffe600'];
const DAY = { top: '#6fa4ff', mid: '#ffc2e0', bot: '#ffe6d6', fog: '#ffd6e6', hs: '#ffffff', hg: '#ffbfd9', sun: '#fff3e2' };
const PARTY = { top: '#1a0848', mid: '#c4308e', bot: '#ff8a5c', fog: '#a03a8e', hs: '#c7a2ff', hg: '#ff4fa0', sun: '#ffd2f2' };
const WRAP = 90;   // clouds and drifting blocks live in a 2*WRAP square round the camera

const wrap = (v, c) => c + ((((v - c) % (2 * WRAP)) + 3 * WRAP) % (2 * WRAP)) - WRAP;

export class World {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.NeutralToneMapping;
    const S = this.scene = new THREE.Scene();
    S.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    S.environmentIntensity = 0.5;
    this.cam = new THREE.PerspectiveCamera(58, 1, 0.1, 1000);
    this.sky = makeSky(THREE, DAY.top, DAY.mid, DAY.bot);
    const su = this.sky.material.uniforms;
    su.top2.value.set(PARTY.top); su.mid2.value.set(PARTY.mid); su.bot2.value.set(PARTY.bot);
    S.add(this.sky);
    S.fog = new THREE.Fog(DAY.fog, 30, 125);
    this.hemi = new THREE.HemisphereLight(DAY.hs, DAY.hg, 1.5); S.add(this.hemi);
    this.sun = new THREE.DirectionalLight(DAY.sun, 2.1); S.add(this.sun, this.sun.target);
    this.cols = Object.fromEntries(['fog', 'hs', 'hg', 'sun'].map((k) => [k, [new THREE.Color(DAY[k]), new THREE.Color(PARTY[k])]]));
    this.glowTex = canvasTexture(THREE, 128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    this.buildBlockKit();
    this.buildDecor();
    this.M = buildManul(S, DAY);
    this.buildFx();
    this.tmp = { c: new THREE.Color(), grey: new THREE.Color('#e8e4ee'), warm: new THREE.Color('#fff6ea'), pinkC: new THREE.Color('#ff6fb5'), lilac: new THREE.Color('#d9a0ff'), pinkP: new THREE.Color('#ff9ee0') };
  }

  /** compile every shader up front (hidden fx included), so no frame pays for it later */
  warm() {
    const hidden = [];
    this.scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    this.renderer.compile(this.scene, this.cam);
    for (const o of hidden) o.visible = false;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    const a = w / h;
    // keep at least the ad's sideways view (58 degrees tall on a 585x520 phone half), up to 80 degrees tall
    this.cam.fov = Math.min(80, Math.max(58, (2 * Math.atan(0.6236 / a) * 180) / Math.PI));
    this.cam.aspect = a; this.cam.updateProjectionMatrix();
  }

  // ---------- blocks ----------
  buildBlockKit() {
    this.geos = new Map();
    this.bodyMats = PASTEL.map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.25 }));
    this.goldMat = new THREE.MeshPhysicalMaterial({ color: '#ffd45e', roughness: 0.22, metalness: 0.35, clearcoat: 1, emissive: '#ff9d2e', emissiveIntensity: 0.25 });
    this.sprinkleGeo = new THREE.CapsuleGeometry(0.035, 0.12, 2, 6);
    this.sprinkleMats = NEON.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
    // rainbow kinetic sand, from the ad's right-hand phone: layered, speckled, crumbly
    const R = rng(909);
    const sand = (w, h, layers) => canvasTexture(THREE, w, h, (g) => {
      const rain = ['#ff8fb1', '#ffb36b', '#ffe27a', '#8fe39a', '#7fc8ff', '#b79bff'];
      for (let k = 0; k < layers; k++) { g.fillStyle = rain[k % rain.length]; g.fillRect(0, (k / layers) * h, w, h / layers + 1); }
      for (let k = 0; k < w * h * 0.35; k++) { g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.32)' : 'rgba(70,40,60,0.2)'; g.fillRect(R() * w, R() * h, 1 + R() * 1.5, 1 + R() * 1.5); }
    });
    this.sandMat = new THREE.MeshStandardMaterial({ map: sand(128, 128, 6), roughness: 1 });
    this.sandTop = sand(64, 64, 1);
    this.white = new THREE.Color('#ffffff');
    this.bm = new Map();
  }
  geo(w, h, d, r) { const k = `${w}_${h}_${d}_${r}`; if (!this.geos.has(k)) this.geos.set(k, new RoundedBoxGeometry(w, h, d, 3, r)); return this.geos.get(k); }

  makeBlock(b) {
    const s = Math.round(b.s * 5) / 5, h = Math.round(b.hgt * 5) / 5;
    const grp = new THREE.Group();
    const gold = b.kind === 'gold', sand = b.kind === 'sand';
    const body = new THREE.Mesh(this.geo(s, h, s, 0.26), gold ? this.goldMat : sand ? this.sandMat : this.bodyMats[b.col]); body.position.y = -h / 2 - 0.06; grp.add(body);
    const capMat = new THREE.MeshPhysicalMaterial({
      color: sand ? new THREE.Color('#fff4ea') : new THREE.Color(gold ? '#fff0a8' : PASTEL[b.col]).lerp(this.white, 0.55), roughness: sand ? 0.95 : 0.5, clearcoat: sand ? 0 : 0.5,
      map: sand ? this.sandTop : null,
      emissive: new THREE.Color(gold ? '#ffb000' : NEON[b.col]), emissiveIntensity: 0,
    });
    const cap = new THREE.Mesh(this.geo(s + 0.08, 0.26, s + 0.08, 0.12), capMat); cap.position.y = -0.13; grp.add(cap);
    // a few sprinkles on the icing
    if (!sand) {
      const R = rng(100 + b.i);
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Mesh(this.sprinkleGeo, this.sprinkleMats[(b.i + k) % 6]);
        sp.position.set((R() - 0.5) * s * 0.8, 0.005, (R() - 0.5) * s * 0.8); sp.rotation.set(Math.PI / 2, 0, R() * TAU);
        grp.add(sp);
      }
    }
    // moving blocks wear a neon stripe round the icing, so you can see they're different
    if (b.kind === 'move') {
      const band = new THREE.Mesh(this.geo(s + 0.1, 0.07, s + 0.1, 0.03), new THREE.MeshBasicMaterial({ color: NEON[b.col], fog: false }));
      band.position.y = -0.3; grp.add(band);
    }
    this.scene.add(grp);
    return { grp, cap: capMat, b };
  }

  /** keep meshes for blocks lo..hi, drop the rest */
  syncBlocks(blocks, lo, hi) {
    for (const [i, e] of this.bm) if (i < lo || i > hi) { this.scene.remove(e.grp); e.cap.dispose(); e.grp.children.forEach((c) => { if (c.material && c.material.isMeshBasicMaterial) c.material.dispose(); }); this.bm.delete(i); }
    for (let i = Math.max(0, lo); i <= Math.min(hi, blocks.length - 1); i++) if (!this.bm.has(i)) this.bm.set(i, this.makeBlock(blocks[i]));
  }

  // ---------- decor ----------
  buildDecor() {
    const R = rng(77), S = this.scene;
    // a sea of clouds far below
    this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffe3f0', emissiveIntensity: 0.35 });
    this.cloudData = [];
    const puffs = 300;
    this.clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), this.cloudMat, puffs);
    for (let k = 0; k < puffs; k++) { const s = 3 + R() * 6; this.cloudData.push({ x: (R() - 0.5) * 2 * WRAP, z: (R() - 0.5) * 2 * WRAP, y: -17 - R() * 5, s }); }
    this.clouds.frustumCulled = false; S.add(this.clouds);
    // little floating blocks off to the sides, for depth
    const nd = 80;
    this.deco = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.18), new THREE.MeshPhysicalMaterial({ roughness: 0.4, clearcoat: 0.6 }), nd);
    this.decoData = [];
    for (let k = 0; k < nd; k++) {
      this.decoData.push({ x: (R() - 0.5) * 2 * WRAP, y: -9 + R() * 16, z: (R() - 0.5) * 2 * WRAP, s: 0.6 + R() * 1.8, rx: R() * TAU, ry: R() * TAU, w: (R() - 0.5) * 0.8 });
      this.deco.setColorAt(k, new THREE.Color(PASTEL[k % 6]));
    }
    this.deco.frustumCulled = false; S.add(this.deco);
    // a big pastel ringed planet hanging in the sky
    const pt = canvasTexture(THREE, 64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#ffd3f1'); gr.addColorStop(0.5, '#cbb8ff'); gr.addColorStop(1, '#9fd6ff');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 9; k++) { g.fillStyle = `rgba(255,255,255,${0.1 + 0.12 * (k % 2)})`; g.fillRect(0, k * 29 + 6, w, 10); }
    });
    this.planet = new THREE.Group();
    this.planetMat = new THREE.MeshBasicMaterial({ map: pt, fog: false, transparent: true, opacity: 0.95 });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#fff1c4', transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false });
    const pl = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 32), this.planetMat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(40, 58, 96), ringMat); ring.rotation.set(1.2, 0.25, 0);
    this.planet.add(pl, ring); this.planet.rotation.z = 0.35;
    S.add(this.planet);
    // stars, for the party
    const sp = new Float32Array(500 * 3);
    for (let k = 0; k < 500; k++) {
      const a = R() * TAU, e = 0.05 + R() * 1.4, r = 340;
      sp[k * 3] = Math.cos(a) * Math.cos(e) * r; sp[k * 3 + 1] = Math.sin(e) * r; sp[k * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.frustumCulled = false; S.add(this.stars);
  }

  // ---------- fx ----------
  buildFx() {
    const S = this.scene;
    const spr = (col, add = true) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, depthWrite: false, fog: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.visible = false; S.add(s); return s;
    };
    this.dotTex = canvasTexture(THREE, 64, 64, (g) => {
      g.fillStyle = '#16121c'; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 21, 0, TAU); g.fill();
    });
    this.aura = spr('#ffcf5a'); this.aura2 = spr('#c26bff');
    this.trail = Array.from({ length: 42 }, (_, k) => spr(new THREE.Color().setHSL((0.14 - k * 0.028 + 1) % 1, 1, 0.55)));
    this.charge = Array.from({ length: 18 }, (_, k) => spr(k % 2 ? '#ffd86a' : '#d39bff'));
    this.dust = Array.from({ length: 9 }, () => spr('#ffffff', false));
    this.sandPuff = Array.from({ length: 12 }, (_, k) => spr(['#ff8fb1', '#ffe27a', '#8fe39a', '#7fc8ff', '#b79bff', '#ffb36b'][k % 6], false));
    this.burst = Array.from({ length: 14 }, (_, k) => spr(k % 2 ? '#ffffff' : '#8ff6ff'));
    this.arc = Array.from({ length: 26 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
      s.renderOrder = 5; s.visible = false; S.add(s); return s;
    });
    const ringGeo = new THREE.RingGeometry(0.86, 1, 64); ringGeo.rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: 3 }, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
      m.visible = false; S.add(m); return m;
    });
    // where a charged jump will come down
    this.target = new THREE.Group();
    const tRing = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.46, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const tRim = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.53, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#16121c', transparent: true, opacity: 0.8, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const tDisc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.3, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.target.add(tRim, tRing, tDisc); this.targetRing = tRing.material;
    this.target.traverse((o) => { o.renderOrder = 3; }); this.target.visible = false; S.add(this.target);
    const sh = canvasTexture(THREE, 128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(40,20,60,0.6)'); gr.addColorStop(0.6, 'rgba(40,20,60,0.3)'); gr.addColorStop(1, 'rgba(40,20,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const sg = new THREE.PlaneGeometry(1.5, 1.5); sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.shadow.renderOrder = 1; S.add(this.shadow);
  }

  // ---------- one frame ----------
  /**
   * v: everything the game knows this frame —
   *   t (seconds), party (0-1), bp (beat pulse 0-1), blocks, landed { i, t } (last landing),
   *   pose (manul pose), vel (THREE.Vector3), cam { pos: [x,y,z], look: [x,y,z] },
   *   fx { charge, trail: [[x,y,z]...], trailFade, dust: { k, at }, burst: { k, at }, rings: [{ k, at, big, col }],
   *        arc: [[x,y,z]...], target: { at, ok } | null, puff: { k, at } | null, shadowBlocks: [lo, hi] }
   */
  render(v) {
    const { t, party, bp, pose: m } = v, T = this.tmp;
    // sky, fog, light
    this.sky.material.uniforms.mixv.value = party;
    const C = (k) => T.c.copy(this.cols[k][0]).lerp(this.cols[k][1], party);
    this.scene.fog.color.copy(C('fog'));
    this.hemi.color.copy(C('hs')); this.hemi.groundColor.copy(C('hg')); this.sun.color.copy(C('sun'));
    this.hemi.intensity = 1.5 + bp * 0.5;
    const U = this.M.furU;
    U.sky.value.copy(C('hs')).lerp(T.grey, 0.6); U.ground.value.copy(C('hg')).lerp(T.grey, 0.55); U.sunCol.value.copy(C('sun')).lerp(T.warm, 0.6);
    this.cloudMat.emissive.set(DAY.fog).lerp(T.pinkC, party); this.cloudMat.color.set('#ffffff').lerp(T.lilac, party * 0.6);
    this.starMat.opacity = party * 0.9;
    this.planetMat.color.set('#ffffff').lerp(T.pinkP, party * 0.5);

    // blocks: bob, light up on landing and on the beat
    const top = [0, 0, 0];
    for (const [i, e] of this.bm) {
      blockTop(e.b, t, top);
      e.grp.position.set(top[0], top[1], top[2]);
      let em = bp * 0.55 + party * 0.1;
      if (v.landed && v.landed.i === i) em += 0.9 * Math.exp(-(t - v.landed.t) * 6);
      if (e.b.kind === 'gold') em += 0.3 + 0.2 * Math.sin(t * 6);
      if (e.b.crumbleAt != null && t > e.b.crumbleAt) em += 0.4 * (0.5 + 0.5 * Math.sin(t * 40));
      e.cap.emissiveIntensity = em;
    }

    // the camera first, so the wrapped decor centres on it
    const cam = this.cam;
    cam.position.set(...v.cam.pos);
    cam.lookAt(...v.cam.look);
    cam.updateMatrixWorld();
    const cx = cam.position.x, cz = cam.position.z, by = v.baseY;
    // clouds and drifting blocks wrap round the camera
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), eu = new THREE.Euler();
    this.cloudData.forEach((d, k) => {
      m4.compose(p.set(wrap(d.x, cx), d.y + by * 0.3, wrap(d.z, cz)), q.identity(), sc.set(d.s * 1.5, d.s * 0.5, d.s));
      this.clouds.setMatrixAt(k, m4);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    this.decoData.forEach((d, k) => {
      eu.set(d.rx + t * d.w, d.ry + t * d.w * 0.7, 0);
      let x = wrap(d.x, cx), z = wrap(d.z, cz);
      // keep them off the path: nothing drifts within 6 m of the manul
      const dx = x - m.x, dz = z - m.z, dd = Math.hypot(dx, dz);
      if (dd < 6 && Math.abs(d.y) < 4) { const k2 = 6 / Math.max(0.01, dd); x = m.x + dx * k2; z = m.z + dz * k2; }
      m4.compose(p.set(x, by + d.y + Math.sin(t * 0.8 + k) * 0.4, z), q.setFromEuler(eu), sc.setScalar(d.s));
      this.deco.setMatrixAt(k, m4);
    });
    this.deco.instanceMatrix.needsUpdate = true;
    this.sky.position.copy(cam.position);
    this.stars.position.copy(cam.position);
    this.planet.position.set(cam.position.x - 95, cam.position.y + 55, cam.position.z - 280);
    this.planet.rotation.y = t * 0.05;
    this.sun.position.set(m.x + 7, m.y + 14, m.z + 9); this.sun.target.position.set(m.x, m.y, m.z - 4);

    // the manul
    poseManul(this.M, m, t, v.vel);
    this.fx(v);

    // the shadow: on the highest block under the manul
    let best = null;
    for (const [, e] of this.bm) {
      const b = e.b; blockTop(b, t, top);
      if (Math.abs(m.x - top[0]) < b.s / 2 + 0.1 && Math.abs(m.z - top[2]) < b.s / 2 + 0.1 && top[1] <= m.y + 0.05 && (!best || top[1] > best[1])) best = [...top];
    }
    this.shadow.visible = !!best && !m.blink;
    if (best) {
      const hgt = m.y - best[1];
      this.shadow.position.set(m.x, best[1] + 0.012, m.z);
      this.shadow.scale.setScalar(Math.max(0.3, (1 - clamp(hgt / 5) * 0.55) * m.scale));
      this.shadow.material.opacity = 1 - clamp(hgt / 6);
    }

    this.renderer.render(this.scene, cam);
    // where the manul's head is on screen, for the HUD (0-1 across, 0-1 down)
    const hv = new THREE.Vector3(m.x, m.y + 1.25 * m.scale, m.z).project(cam);
    return [(hv.x + 1) / 2, (1 - hv.y) / 2, hv.z < 1];
  }

  fx(v) {
    const { t, pose: m, fx } = v;
    const bodyY = m.y + 0.68 * m.sy;
    // the aura
    const gl = m.glow;
    this.aura.visible = this.aura2.visible = gl > 0.01;
    if (gl > 0.01) {
      const s = (2.6 + 0.35 * Math.sin(t * 23)) * gl;
      this.aura.position.set(m.x, bodyY, m.z); this.aura.scale.setScalar(s); this.aura.material.opacity = 0.75 * gl;
      this.aura2.position.set(m.x, bodyY, m.z); this.aura2.scale.setScalar(s * 1.7); this.aura2.material.opacity = 0.45 * gl;
    }
    // the glowing trail behind a charged jump
    const tr = fx.trail;
    this.trail.forEach((s, k) => {
      const p = tr[k];
      s.visible = !!p && fx.trailFade > 0.01;
      if (!s.visible) return;
      s.position.set(p[0], p[1] + 0.68, p[2]);
      s.scale.setScalar(1.5 * (1 - k / this.trail.length) + 0.3);
      s.material.opacity = 0.75 * (1 - k / this.trail.length) * fx.trailFade;
    });
    // charge-up sparks rising round it
    const c = fx.charge || 0;
    this.charge.forEach((s, k) => {
      s.visible = c > 0.02;
      if (!s.visible) return;
      const u = frac(t * 1.7 + k / 18), a = k * 2.399 + t * 2;
      s.position.set(m.x + Math.cos(a) * (0.75 - u * 0.3), m.y + u * 2.2, m.z + Math.sin(a) * (0.75 - u * 0.3));
      s.scale.setScalar(0.22 + 0.1 * (k % 3)); s.material.opacity = c * (1 - u) * 0.9;
    });
    // landing dust
    const d = fx.dust;
    this.dust.forEach((s, k) => {
      s.visible = !!d && d.k < 0.4;
      if (!s.visible) return;
      const u = d.k / 0.4, a = (k / this.dust.length) * TAU + 0.3, r = 0.45 + 1.1 * easeOutCubic(u);
      s.position.set(d.at[0] + Math.cos(a) * r, d.at[1] + 0.1 + u * 0.25, d.at[2] + Math.sin(a) * r);
      s.scale.setScalar(0.35 + u * 0.35); s.material.opacity = 0.75 * (1 - u);
    });
    // sand crumbling away
    const pf = fx.puff;
    this.sandPuff.forEach((s, k) => {
      s.visible = !!pf && pf.k < 0.9;
      if (!s.visible) return;
      const u = pf.k / 0.9, a = (k / this.sandPuff.length) * TAU, r = 0.6 + 1.6 * easeOutCubic(u);
      s.position.set(pf.at[0] + Math.cos(a) * r, pf.at[1] - 0.4 - u * 1.5 + Math.sin(a * 3) * 0.3, pf.at[2] + Math.sin(a) * r);
      s.scale.setScalar(0.5 + u * 0.6); s.material.opacity = 0.8 * (1 - u);
    });
    // respawn burst
    const b = fx.burst;
    this.burst.forEach((s, k) => {
      s.visible = !!b && b.k < 0.5;
      if (!s.visible) return;
      const u = b.k / 0.5, a = (k / this.burst.length) * TAU, r = 0.3 + 1.6 * easeOutCubic(u);
      s.position.set(b.at[0] + Math.cos(a) * r, b.at[1] + 0.7 + Math.sin(a * 2) * 0.3 + u * 0.4, b.at[2] + Math.sin(a) * r);
      s.scale.setScalar(0.4 * (1 - u) + 0.1); s.material.opacity = 1 - u;
    });
    // shock rings
    this.rings.forEach((r, i) => {
      const e = fx.rings[i];
      r.visible = !!e && e.k < 0.6;
      if (!r.visible) return;
      const u = e.k / 0.6;
      r.position.set(e.at[0], e.at[1] + 0.05, e.at[2]);
      r.scale.setScalar((e.big ? 1.2 : 0.6) + (e.big ? 7 : 4) * easeOutCubic(u));
      r.material.color.set(e.col); r.material.opacity = 0.9 * (1 - u);
    });
    // the jump preview: dotted arc and a ring where it comes down
    const arc = fx.arc || [];
    this.arc.forEach((s, k) => {
      const p = arc[k];
      s.visible = !!p;
      if (!p) return;
      s.position.set(p[0], p[1] + 0.55, p[2]);
      s.scale.setScalar(0.2);
      s.material.color.set(fx.target && fx.target.ok ? (fx.target.gold ? '#ffe27a' : '#ffffff') : '#ff6b7a');
      s.material.opacity = 0.95 * (1 - (k / this.arc.length) * 0.4);
    });
    const tg = fx.target;
    this.target.visible = !!tg;
    if (tg) {
      this.target.position.set(tg.at[0], tg.at[1] + 0.03, tg.at[2]);
      this.target.scale.setScalar(1 + 0.12 * Math.sin(t * 14));
      this.targetRing.color.set(tg.ok ? (tg.gold ? '#ffd45e' : '#ffffff') : '#ff4d6a');
      this.targetRing.opacity = tg.ok ? 0.95 : 0.7;
    }
  }
}
