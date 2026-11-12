// MANUL PARKOUR, playable. The ad's manul hops across its floating cake blocks, but now you drive it:
// turn and waddle on its tiny legs, hold to charge a jump (the ad's AURA charge-up), let go to jump. A full
// charge is the ad's impossible jump: a front flip, a rainbow trail, a shock ring. Come up short and it
// hangs on by its front paws with its back legs scrabbling, as in the ad; mash jump to climb up, or it falls,
// you get the giant L, and it respawns on the last block. Eight new blocks without a fall and the sky goes
// to the ad's party palette and the music to its phonk.
import * as THREE from 'three';
import { World } from './world.js';
import { Course, blockTop, SAND_HOLD } from './course.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';
import { restPose } from './manul.js';
import { TAU, clamp, lerp, smooth, smoother, range, easeOutBack, lerpAngle } from './util.js';

const G = 24;                       // the ad's fall gravity
const WALK = 2.9, TURN = 2.7;       // short legs
const CHARGE_T = 0.85;              // seconds to a full charge
const BIG = 0.7;                    // a charge this full is the impossible jump (gold blocks need one)
const R_BODY = 0.4, BODY_H = 1.0;   // the manul, for bumping into blocks
const EDGE = 0.14;                  // it can stand this far past an edge (it's a cat)
const MASH = 3, CLING_T = 1.3;      // taps to climb up, and how long it can hang on
const PARTY_AT = 8;                 // new blocks in a row for party mode
const SEED = 1986;
const vyOf = (c) => 6.6 + 5.4 * c, vhOf = (c) => 4.6 + 7.4 * c;
const FAILS = ['skill issue', 'legs: short', 'unc behavior', 'cooked', 'not a vibe', 'down bad'];

const fwdOf = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const rot = (vx, vz, d) => [vx * Math.cos(d) + vz * Math.sin(d), vz * Math.cos(d) - vx * Math.sin(d)];
const angDiff = (a, b) => ((((b - a) % TAU) + TAU * 1.5) % TAU) - TAU / 2;

function readBest() { try { return parseInt(localStorage.getItem('manul-parkour-best') || '0', 10) || 0; } catch { return 0; } }
function saveBest(n) { try { localStorage.setItem('manul-parkour-best', String(n)); } catch { /* private window */ } }
function readMusic() { try { return localStorage.getItem('manul-parkour-music') !== 'off'; } catch { return true; } }
function saveMusic(on) { try { localStorage.setItem('manul-parkour-music', on ? 'on' : 'off'); } catch { /* private window */ } }

export class Game {
  constructor({ gl, hud }) {
    this.world = new World(gl);
    this.hud = new Hud(hud);
    this.snd = new Sound();
    this.snd.musicOn = readMusic();
    document.getElementById('music')?.classList.toggle('off', !this.snd.musicOn);
    this.hudCanvas = hud;
    this.best = readBest();
    this.mode = 'title';
    this.t = 0; this.last = null;
    this.keys = new Set(); this.touch = !!window.matchMedia?.('(pointer: coarse)').matches;
    this.joy = null; this.jumpTouch = null; this.mouseJump = false;
    this.jumpLock = false; this.taps = 0;
    this.newRun();
    this.input();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.world.warm();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  newRun() {
    const C = this.course = new Course(SEED);
    C.ensure(30);
    const b1 = C.blocks[1];
    this.p = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: yawTo(b1.x, b1.z),
      ground: 0, off: [0, 0], coyote: 0, walk: 0, walkPh: 0, bv: [0, 0],
      air: null, cling: null, climb: null, dead: null, failing: false, noCling: 0,
      chargeT0: null, charge: 0, landT: null, landBig: false, respawnT: null,
    };
    this.cp = 0; this.maxBlock = 0; this.jumps = 0; this.aura = 0; this.streak = 0; this.ls = 0;
    this.party = false; this.partyV = 0; this.partyStart = null;
    this.land = null; this.newBestAt = null; this.bestAtStart = this.best; this.big = null;
    this.fxs = { dust: null, burst: null, rings: [], puff: null };
    this.trail = []; this.trailT = 0; this.trailFade = 0;
    this.cam = { yaw: this.p.yaw, a: [0, 0, 0], pull: 0, shakeT: -9, shakeAmp: 0 };
    this.startT = null; this.hintUntil = 0;
    this.snd.want = 'day';
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.world.resize(w, h); this.hud.resize(w, h);
    this.W = w; this.H = h;
  }

  // ---------------------------------------------------------------------------------------------------
  // input
  input() {
    const K = this.keys;
    const JUMP = ['Space', 'KeyJ', 'KeyZ'];
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault(); return; }
      this.touch = false;
      if (JUMP.includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'KeyM') { if (e.shiftKey) this.toggleMute(); else this.toggleMusic(); return; }
      if (e.code === 'KeyP' || e.code === 'Escape') { this.togglePause(); return; }
      if (JUMP.includes(e.code) || e.code === 'Enter') { if (this.press()) return; }
      K.add(e.code);
    });
    addEventListener('keyup', (e) => { K.delete(e.code); if (JUMP.includes(e.code) || e.code === 'Enter') this.jumpLock = false; });
    addEventListener('blur', () => { K.clear(); this.joy = this.jumpTouch = null; this.mouseJump = false; if (this.mode === 'play') this.togglePause(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'play') this.togglePause(true); });

    const el = this.hudCanvas;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      const touch = e.pointerType !== 'mouse';
      this.touch = touch;
      if (this.mode !== 'play') { this.press(); return; }
      if (touch && e.clientX < this.W * 0.45) this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      else { if (touch) this.jumpTouch = e.pointerId; else this.mouseJump = true; this.press(); }
    });
    el.addEventListener('pointermove', (e) => {
      const J = this.joy;
      if (J && e.pointerId === J.id) { J.dx = clamp((e.clientX - J.ox) / 55, -1, 1); J.dy = clamp((e.clientY - J.oy) / 55, -1, 1); }
    });
    const up = (e) => {
      if (this.joy && e.pointerId === this.joy.id) { this.joy = null; return; }
      if (e.pointerId === this.jumpTouch) this.jumpTouch = null;
      if (e.pointerType === 'mouse') this.mouseJump = false;
      this.jumpLock = false;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    document.getElementById('mute')?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMute(); });
    document.getElementById('music')?.addEventListener('click', (e) => { e.stopPropagation(); this.snd.start(); this.toggleMusic(); });
    document.getElementById('pause')?.addEventListener('click', (e) => { e.stopPropagation(); this.togglePause(); });
  }

  /** a jump press (key down or tap). true = it was used up starting or resuming */
  press() {
    this.snd.start();
    if (this.mode === 'title') { this.start(); this.jumpLock = true; return true; }
    if (this.mode === 'paused') { this.togglePause(false); this.jumpLock = true; return true; }
    if (this.p.cling) this.taps++;
    return false;
  }

  start() {
    this.mode = 'play'; this.startT = this.t; this.hintUntil = this.t + 9;
  }
  togglePause(on = this.mode !== 'paused') {
    if (this.mode === 'title') return;
    this.mode = on ? 'paused' : 'play';
    if (on) { this.snd.chargeStop(); this.p.chargeT0 = null; this.p.charge = 0; this.snd.ctx?.suspend(); }
    else { this.snd.ctx?.resume(); }
    document.getElementById('pause')?.classList.toggle('on', on);
  }
  toggleMute() { this.snd.setMuted(!this.snd.muted); document.getElementById('mute')?.classList.toggle('off', this.snd.muted); }
  toggleMusic() { const on = !this.snd.musicOn; this.snd.setMusic(on); saveMusic(on); document.getElementById('music')?.classList.toggle('off', !on); }

  controls() {
    const K = this.keys, J = this.joy;
    let turn = (K.has('ArrowLeft') || K.has('KeyA') ? 1 : 0) - (K.has('ArrowRight') || K.has('KeyD') ? 1 : 0);
    let fwd = (K.has('ArrowUp') || K.has('KeyW') ? 1 : 0) - (K.has('ArrowDown') || K.has('KeyS') ? 1 : 0);
    if (J) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
      turn -= dz(J.dx); fwd -= dz(J.dy);
    }
    const held = K.has('Space') || K.has('KeyJ') || K.has('KeyZ') || this.jumpTouch != null || this.mouseJump;
    return { turn: clamp(turn, -1, 1), fwd: clamp(fwd, -1, 1), held: held && !this.jumpLock };
  }

  // ---------------------------------------------------------------------------------------------------
  // the loop
  /** for tests: run the game for sec seconds with fixed controls, off the frame clock (set manual first) */
  sim(sec, c = {}) {
    const ctl = { turn: 0, fwd: 0, held: false, ...c }, h = 1 / 120;
    for (let k = 0; k < Math.round(sec / h); k++) { this.t += h; if (this.mode === 'play') this.step(h, ctl); this.after(h, ctl); }
  }

  frame(ts) {
    const now = ts / 1000;
    const dt = this.last == null ? 1 / 60 : Math.min(0.05, now - this.last);
    this.last = now;
    if (this.mode !== 'paused' && !this.manual) {
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
      const c = this.controls();
      for (let k = 0; k < n; k++) { this.t += h; if (this.mode === 'play') this.step(h, c); }
      this.after(dt, c);
    }
    this.snd.tick();
    this.draw(dt);
    requestAnimationFrame((ts2) => this.frame(ts2));
  }

  step(h, c) {
    const p = this.p, t = this.t, B = this.course.blocks;
    // sand that's been stood on drops away
    for (let i = Math.max(0, this.cp - 3); i <= Math.min(B.length - 1, this.cp + 6); i++) {
      const b = B[i];
      if (b.crumbleAt != null && !b.dropped && t > b.crumbleAt + SAND_HOLD) {
        b.dropped = true; this.snd.play('crumble');
        this.fxs.puff = { t0: t, at: blockTop(b, t) };
      }
    }
    if (p.dead) {
      p.vy -= G * h; p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
      if (t - p.dead.t0 > 1.0) this.respawn();
      return;
    }
    if (p.climb) return this.climbStep(h);
    if (p.cling) return this.clingStep(h);
    if (p.ground != null) this.groundStep(h, c); else this.airStep(h, c);
    this.chargeStep(c);
  }

  chargeStep(c) {
    const p = this.p, t = this.t;
    const canJump = p.ground != null || p.coyote > 0;
    if (c.held && canJump && p.respawnT != null && t - p.respawnT < 0.3) return;
    if (c.held && canJump) {
      if (p.chargeT0 == null) { p.chargeT0 = t; this.snd.chargeStart(); }
      p.charge = Math.min(1, (t - p.chargeT0) / CHARGE_T);
    } else if (p.chargeT0 != null) {
      if (!c.held && canJump) this.launch(p.charge);
      p.chargeT0 = null; p.charge = 0; this.snd.chargeStop();
    }
  }

  groundStep(h, c) {
    const p = this.p, t = this.t, b = this.course.blocks[p.ground];
    const top = blockTop(b, t), prev = blockTop(b, t - h);
    p.bv = [(top[0] - prev[0]) / h, (top[2] - prev[2]) / h];
    if (b.dropped) { this.leaveGround(0, 0); p.vy = -2; return; }
    const charging = p.chargeT0 != null;
    p.yaw += c.turn * TURN * h * (charging ? 0.6 : 1);
    // aim assist: while charging with no steering, ease round toward the next block
    if (charging && !c.turn) {
      const nb = this.course.blocks[p.ground + 1];
      if (nb) { const d = angDiff(p.yaw, yawTo(nb.x - p.x, nb.z - p.z)); if (Math.abs(d) < 0.6) p.yaw += clamp(d, -1.4 * h, 1.4 * h); }
    }
    const sp = WALK * c.fwd * (charging ? 0.35 : 1);
    const [fx, fz] = fwdOf(p.yaw);
    p.off[0] += fx * sp * h; p.off[1] += fz * sp * h;
    p.walk = sp; p.walkPh += Math.abs(sp) * h * 9;
    p.x = top[0] + p.off[0]; p.z = top[2] + p.off[1]; p.y = top[1];
    const hs = b.s / 2 + EDGE;
    if (Math.abs(p.off[0]) > hs || Math.abs(p.off[1]) > hs) this.leaveGround(fx * sp, fz * sp);
  }

  leaveGround(vx, vz) {
    const p = this.p;
    p.vx = vx + p.bv[0]; p.vz = vz + p.bv[1]; p.vy = 0;
    p.ground = null; p.coyote = 0.1; p.air = null;
  }

  launch(c) {
    const p = this.p, t = this.t;
    const [fx, fz] = fwdOf(p.yaw), vh = vhOf(c);
    const carry = Math.max(0, p.walk) * 0.3;
    p.vx = fx * (vh + carry) + p.bv[0]; p.vz = fz * (vh + carry) + p.bv[1]; p.vy = vyOf(c);
    const from = p.ground ?? this.cp;
    p.ground = null; p.coyote = 0;
    const big = c >= BIG;
    const pred = this.predict(p.x, p.y, p.z, p.vx, p.vy, p.vz, 0);
    p.air = { t0: t, c, big, T: pred.T, from };
    p.failing = false;
    this.snd.play(big ? 'bigjump' : 'jump', { c });
    if (big) { this.big = { t0: t, T: pred.T }; this.trail = []; this.trailFade = 1; }
  }

  airStep(h, c) {
    const p = this.p, t = this.t;
    p.coyote -= h;
    p.yaw += c.turn * TURN * 0.7 * h;
    [p.vx, p.vz] = rot(p.vx, p.vz, c.turn * TURN * 0.3 * h);
    const [fx, fz] = fwdOf(p.yaw), ac = 3.5 * c.fwd * h;
    p.vx += fx * ac; p.vz += fz * ac;
    const sp = Math.hypot(p.vx, p.vz); if (sp > 13) { p.vx *= 13 / sp; p.vz *= 13 / sp; }
    p.vy -= G * h;
    const py = p.y;
    p.x += p.vx * h; p.y += p.vy * h; p.z += p.vz * h;
    this.collide(py);
    if (p.ground == null && !p.cling && p.y < this.deathY()) this.die();
  }

  /** the blocks worth checking: a few behind the checkpoint to a few past it */
  near() { const c = Math.max(this.cp, this.p.air ? this.p.air.from : 0); return [Math.max(0, c - 3), Math.min(this.course.blocks.length - 1, c + 9)]; }

  collide(py) {
    const p = this.p, t = this.t, B = this.course.blocks, [lo, hi] = this.near();
    for (let i = lo; i <= hi; i++) {
      const b = B[i];
      if (b.dropped) continue;
      const top = blockTop(b, t), dx = p.x - top[0], dz = p.z - top[2], hs = b.s / 2;
      // coming down onto it
      if (p.vy <= 0 && py >= top[1] - 0.12 && p.y <= top[1] && Math.abs(dx) <= hs + EDGE && Math.abs(dz) <= hs + EDGE) return this.landOn(i, top);
      // into its side
      if (p.y < top[1] - 0.01 && p.y + BODY_H > top[1] - b.hgt && Math.abs(dx) < hs + R_BODY && Math.abs(dz) < hs + R_BODY) {
        const depth = top[1] - p.y;
        if (depth < 0.22 && p.vy <= 2) return this.landOn(i, top);   // just clipped the edge: up it goes
        const penX = hs + R_BODY - Math.abs(dx), penZ = hs + R_BODY - Math.abs(dz);
        const nx = penX < penZ ? Math.sign(dx) || 1 : 0, nz = penX < penZ ? 0 : Math.sign(dz) || 1;
        if (depth < 0.9 && p.vy < 3 && t > p.noCling) return this.grab(i, nx, nz, nx ? dz : dx);
        if (nx) { p.x += nx * penX; if (p.vx * nx < 0) p.vx = 0; } else { p.z += nz * penZ; if (p.vz * nz < 0) p.vz = 0; }
      }
    }
  }

  deathY() {
    const B = this.course.blocks, t = this.t;
    let lo = B[this.cp].y;   // its resting height: crumbled sand mustn't drag the floor down with it
    for (let i = this.cp + 1; i <= Math.min(B.length - 1, this.cp + 3); i++) lo = Math.min(lo, B[i].y);
    return lo - 3.2;
  }

  landOn(i, top) {
    const p = this.p, t = this.t, b = this.course.blocks[i];
    const hs = b.s / 2 + EDGE;
    p.ground = i; p.off = [clamp(p.x - top[0], -hs, hs), clamp(p.z - top[2], -hs, hs)];
    p.y = top[1]; p.vx = p.vy = p.vz = 0; p.coyote = 0;
    const big = !!(p.air && p.air.big), gold = b.kind === 'gold';
    p.air = null; p.failing = false;
    p.landT = t; p.landBig = big || gold;
    this.fxs.dust = { t0: t, at: [...top] };
    if (big || gold) { this.fxs.rings.push({ t0: t, at: [...top], big: true, col: '#ffd45e' }); this.cam.shakeT = t; this.cam.shakeAmp = 0.35; }
    this.snd.play('land', { big: big || gold });
    const gain = i > this.maxBlock;
    this.land = { t, i, gain, gold };
    if (gain) {
      this.jumps++; this.aura += gold ? 10 : 1; this.maxBlock = i; this.streak++;
      if (this.maxBlock > this.best) {
        this.best = this.maxBlock; saveBest(this.best);
        if (this.bestAtStart > 0 && this.newBestAt == null) { this.newBestAt = t; this.snd.play('best'); }
      }
      if (gold) this.snd.play('sparkle');
    }
    this.cp = i;
    if (b.kind === 'sand' && b.crumbleAt == null) b.crumbleAt = t + 0.35;
    if (!this.party && this.streak >= PARTY_AT) {
      this.party = true; this.partyStart = t; this.snd.want = 'party'; this.snd.play('aura');
      this.fxs.rings.push({ t0: t, at: [...top], big: true, col: '#ff5fd0' }); this.cam.shakeT = t; this.cam.shakeAmp = 0.25;
    }
    this.course.ensure(this.cp + 30);
  }

  grab(i, nx, nz, along) {
    const p = this.p, t = this.t;
    p.cling = { i, nx, nz, along, t0: t };
    p.vx = p.vy = p.vz = 0; p.yaw = Math.atan2(nx, nz);
    this.taps = 0;
    this.snd.play('cling');
  }

  clingPos(top, b, C, u) {
    const hs = b.s / 2, off = hs + 0.36, al = clamp(C.along, -hs + 0.2, hs - 0.2);
    const x = top[0] + (C.nx ? C.nx * off : al), z = top[2] + (C.nz ? C.nz * off : al);
    return [x, top[1] - 0.66 - 0.3 * smooth(u), z];
  }

  clingStep() {
    const p = this.p, t = this.t, C = p.cling, b = this.course.blocks[C.i], top = blockTop(b, t);
    const u = (t - C.t0) / CLING_T;
    const [x, y, z] = this.clingPos(top, b, C, u);
    p.x = x + Math.sin(t * 47) * 0.015; p.y = y + 0.03 * Math.sin(t * 38); p.z = z;
    if (this.taps > (C.seen || 0)) { C.seen = this.taps; this.snd.play('scrabble', { n: this.taps }); }
    if (this.taps >= MASH && !b.dropped) {
      const hs = b.s / 2, al = clamp(C.along, -hs + 0.2, hs - 0.2), inset = hs - Math.min(0.45, hs * 0.4);
      p.climb = { i: C.i, t0: t, from: [p.x, p.y, p.z], off: [C.nx ? C.nx * inset : al, C.nz ? C.nz * inset : al] };
      p.cling = null; this.snd.play('climb');
      return;
    }
    if (u >= 1 || b.dropped) {
      // legs too short: off it goes
      p.cling = null; p.noCling = t + 0.8; p.failing = true;
      p.vx = C.nx * 1.0; p.vz = C.nz * 1.0; p.vy = 0;
      p.air = null; p.coyote = 0;
    }
  }

  climbStep() {
    const p = this.p, t = this.t, K = p.climb, b = this.course.blocks[K.i], top = blockTop(b, t);
    const u = clamp((t - K.t0) / 0.3), k = smooth(u);
    const to = [top[0] + K.off[0], top[1], top[2] + K.off[1]];
    p.x = lerp(K.from[0], to[0], k); p.z = lerp(K.from[2], to[2], k); p.y = lerp(K.from[1], to[1], k) + 0.45 * Math.sin(Math.PI * u);
    if (u >= 1) { p.climb = null; p.x = to[0]; p.z = to[2]; this.landOn(K.i, top); }
  }

  die() {
    const p = this.p, t = this.t;
    p.dead = { t0: t, line: FAILS[this.ls % FAILS.length] };
    this.ls++; this.streak = 0; this.snd.play('fall'); this.snd.tapeStop();
    p.chargeT0 = null; p.charge = 0; this.snd.chargeStop();
    if (this.party) { this.party = false; this.snd.want = 'day'; }
  }

  respawn() {
    const p = this.p, t = this.t, B = this.course.blocks;
    for (const b of B) { b.crumbleAt = null; b.dropped = false; }
    const b = B[this.cp], top = blockTop(b, t), nb = B[this.cp + 1];
    Object.assign(p, { x: top[0], y: top[1], z: top[2], vx: 0, vy: 0, vz: 0, ground: this.cp, off: [0, 0], coyote: 0, air: null, cling: null, climb: null, dead: null, failing: false, respawnT: t, landT: null, landBig: false });
    p.yaw = nb ? yawTo(nb.x - b.x, nb.z - b.z) : p.yaw;
    this.cam.yaw = p.yaw; this.cam.a = [top[0], top[1], top[2]];
    this.fxs.burst = { t0: t, at: [...top] };
    this.fxs.rings.push({ t0: t, at: [...top], col: '#8ff6ff' });
    this.big = null;
    this.snd.play('respawn'); this.snd.musicBack();
  }

  /** where a jump from (x,y,z) at (vx,vy,vz) comes down: { T, at, ok, gold, pts } */
  predict(x, y, z, vx, vy, vz, dt0, pts = null) {
    const B = this.course.blocks, [lo, hi] = this.near(), h = 1 / 60, t0 = this.t + dt0;
    let py = y;
    for (let k = 1; k < 150; k++) {
      const t = t0 + k * h;
      x += vx * h; z += vz * h; py = y; vy -= G * h; y += vy * h;
      if (pts && k % 3 === 0) pts.push([x, y, z]);
      for (let i = lo; i <= hi; i++) {
        const b = B[i]; if (b.dropped || i === this.p.ground && k < 4) continue;
        const top = blockTop(b, t), dx = Math.abs(x - top[0]), dz = Math.abs(z - top[2]), hs = b.s / 2;
        if (vy <= 0 && py >= top[1] - 0.12 && y <= top[1] && dx <= hs + EDGE && dz <= hs + EDGE) return { T: k * h, at: [x, top[1], z], ok: true, gold: b.kind === 'gold' };
        if (y < top[1] - 0.25 && y + BODY_H > top[1] - b.hgt && dx < hs + R_BODY && dz < hs + R_BODY) return { T: k * h, at: [x, y, z], ok: false };
      }
      if (y < this.deathY()) return { T: k * h, at: [x, y, z], ok: false };
    }
    return { T: 150 * h, at: [x, y, z], ok: false };
  }

  // ---------------------------------------------------------------------------------------------------
  // per frame: camera, trail, party, music
  after(dt, c) {
    const p = this.p, t = this.t, C = this.cam;
    // the trail behind an impossible jump
    if (p.air && p.air.big) {
      this.trailT += dt;
      while (this.trailT > 0.024) { this.trailT -= 0.024; this.trail.unshift([p.x, p.y, p.z]); }
      this.trail.length = Math.min(this.trail.length, 42);
    } else this.trailFade = Math.max(0, this.trailFade - dt / 0.6);
    if (this.big && !(p.air && p.air.big)) { if (t - this.big.t0 > this.big.T + 0.2) this.big = null; }
    // party
    this.partyV += ((this.party ? 1 : 0) - this.partyV) * (1 - Math.exp(-dt * 3));
    // the camera follows from behind and a little to the side, like the ad's
    if (!p.dead) {
      const rate = p.ground != null ? 4.5 : p.cling || p.climb ? 3 : 1.6;
      C.yaw = lerpAngle(C.yaw, p.yaw, 1 - Math.exp(-dt * rate));
      const kx = 1 - Math.exp(-dt * 9), ky = 1 - Math.exp(-dt * (p.ground != null ? 7 : 3));
      C.a[0] += (p.x - C.a[0]) * kx; C.a[2] += (p.z - C.a[2]) * kx; C.a[1] += (p.y - C.a[1]) * ky;
    }
    const pullT = Math.max(smooth(p.charge), p.air && p.air.big ? 1 : 0);
    C.pull += (pullT - C.pull) * (1 - Math.exp(-dt * 4));
    if (this.mode === 'play' && t > this.hintUntil - 1 && this.jumps < 2) this.hintUntil = t + 1;
  }

  view() {
    const p = this.p, t = this.t, C = this.cam;
    const sw = this.startT == null ? 0 : smoother(range(t, this.startT, this.startT + 0.9));
    const title = this.mode === 'title' || this.startT == null;
    const yaw = C.yaw + Math.PI * (1 - sw) + (title ? 0.45 * Math.sin(t * 0.35) : 0);
    const bx = Math.sin(yaw), bz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const D = lerp(2.8, 5.0 + C.pull * 2.0, sw), Hh = lerp(0.95, 2.35 + C.pull * 0.9, sw), side = lerp(0.35, 1.0, sw);
    const e = Math.exp(-(t - C.shakeT) * 7) * C.shakeAmp, shx = Math.sin(t * 83) * e, shy = Math.cos(t * 71) * e;
    const lookDown = p.dead ? 1.9 * smooth(range(t, p.dead.t0, p.dead.t0 + 0.45)) : 0;
    const [fx, fz] = fwdOf(C.yaw), ah = lerp(0, 1.4, sw) + C.pull * 1.2;
    return {
      pos: [C.a[0] + bx * D + rx * side + shx, C.a[1] + Hh + shy, C.a[2] + bz * D + rz * side],
      look: [C.a[0] + fx * ah, C.a[1] + lerp(0.85, 0.05, sw) - lookDown, C.a[2] + fz * ah],
    };
  }

  pose() {
    const p = this.p, t = this.t, o = restPose();
    o.x = p.x; o.y = p.y; o.z = p.z; o.yaw = p.yaw; o.lp = t * 14;
    if (p.dead) {
      const dt = t - p.dead.t0;
      o.pitch = -0.5 + 5.5 * dt; o.roll = 1.6 * dt; o.legs = 'flail'; o.lp = t * 30; o.air = 1;
    } else if (p.cling) {
      const u = (t - p.cling.t0) / CLING_T;
      o.pitch = -0.5; o.legs = 'scrabble'; o.lp = t * 44; o.sy = 1.04; o.roll = 0.07 * Math.sin(t * 21); o.cling = u;
    } else if (p.climb) {
      const u = clamp((t - p.climb.t0) / 0.3);
      o.pitch = lerp(-0.5, 0.1, u); o.legs = 'scrabble'; o.lp = t * 44; o.cling = 1;
    } else if (p.ground != null) {
      const c = p.charge, k = p.landT != null ? t - p.landT : 9;
      o.sy = 1 - (p.landT != null ? 0.3 * Math.exp(-k * 10) * Math.cos(k * 22) : 0) - 0.3 * c + 0.03 * Math.sin(t * 60) * c;
      o.jitter = c; o.tailUp = c; o.glow = c * c;
      if (c > 0.01) o.legs = 'brace';
      else if (Math.abs(p.walk) > 0.1) { o.legs = 'walk'; o.lp = p.walkPh; o.y += Math.abs(Math.sin(p.walkPh)) * 0.035; o.roll = 0.05 * Math.sin(p.walkPh); }
      if (p.landBig) o.glow = Math.max(o.glow, 1 - smooth(range(t, p.landT, p.landT + 1.3)));
      if (p.respawnT != null) {
        const rk = t - p.respawnT;
        o.scale = easeOutBack(clamp(rk / 0.28), 2.5);
        o.blink = rk < 0.32 && Math.floor(rk * 28) % 2 === 1;
      }
    } else {
      o.air = 1; o.legs = p.failing ? 'flail' : 'air'; if (p.failing) o.lp = t * 30;
      if (p.air) {
        const u = clamp((t - p.air.t0) / Math.max(0.2, p.air.T));
        o.sy = 1 + 0.22 * Math.sin(Math.PI * clamp(u * 1.8)) * (1 - u);
        o.pitch = lerp(-0.32, 0.22, smooth(u));
        if (p.air.big) { o.spin = -TAU * smoother(range(u, 0.14, 0.8)); o.glow = 1; o.pitch = 0; o.sy = 1; }
      } else o.pitch = clamp(-p.vy * 0.03, -0.32, 0.4);
    }
    return o;
  }

  draw(dt) {
    const p = this.p, t = this.t, B = this.course.blocks;
    this.world.syncBlocks(B, this.cp - 4, this.cp + 18);
    const beat = this.snd.beat(), bt = beat >= 0 ? beat : t * (140 / 60);
    const bp = this.partyV * Math.exp(-(bt - Math.floor(bt)) * 5);
    // the jump preview while charging
    let arc = null, target = null;
    if (p.chargeT0 != null && this.mode === 'play') {
      const c = p.charge, [fx, fz] = fwdOf(p.yaw), vh = vhOf(c), carry = Math.max(0, p.walk) * 0.3;
      arc = [];
      target = this.predict(p.x, p.y, p.z, fx * (vh + carry) + p.bv[0], vyOf(c), fz * (vh + carry) + p.bv[1], 0, arc);
      arc.length = Math.min(arc.length, 26);
    }
    const fx = this.fxs, k = (e) => (e ? t - e.t0 : 9);
    fx.rings = fx.rings.filter((r) => t - r.t0 < 0.6).slice(-3);
    const vel = new THREE.Vector3(p.vx, p.vy, p.vz);
    if (p.ground != null) vel.set(p.bv[0] + fwdOf(p.yaw)[0] * p.walk, 0, p.bv[1] + fwdOf(p.yaw)[1] * p.walk);
    const head = this.world.render({
      t, party: this.partyV, bp, pose: this.pose(), vel, cam: this.view(), landed: this.land,
      baseY: this.cam.a[1],
      fx: {
        charge: p.charge, trail: this.trail, trailFade: this.trailFade,
        dust: fx.dust && { k: k(fx.dust), at: fx.dust.at }, burst: fx.burst && { k: k(fx.burst), at: fx.burst.at },
        puff: fx.puff && { k: k(fx.puff), at: fx.puff.at },
        rings: fx.rings.map((r) => ({ k: t - r.t0, at: r.at, big: r.big, col: r.col })),
        arc, target: target && { at: target.at, ok: target.ok, gold: target.gold },
      },
    });
    this.hud.draw({
      t, mode: this.mode, head, jumps: this.jumps, best: this.best, aura: this.aura, streak: this.streak, partyAt: PARTY_AT,
      party: this.party, bp, partyStart: this.partyStart, land: this.land, newBestAt: this.newBestAt,
      dead: p.dead, respawnT: p.respawnT, charge: p.charge, bigAt: BIG, big: this.big,
      cling: p.cling && { taps: this.taps, need: MASH, u: clamp((t - p.cling.t0) / CLING_T) },
      hint: this.mode === 'play' ? clamp(this.hintUntil - t) * clamp((t - (this.startT ?? 0) - 0.8) * 2) : 0,
      touch: this.touch, joy: this.joy, jumpHeld: this.jumpTouch != null,
    });
  }
}
