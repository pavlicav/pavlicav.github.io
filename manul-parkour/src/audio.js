// Sound, from the ad's audio.js, played live instead of rendered offline: the same little synth kit and the
// same effects (boing, thud, boom, slide, pop, sparkle, crumble). The music is one track in two states, both
// on the ad's 140 BPM phonk grid in D minor, over the phonk's bass line (D D Bb A):
//   day    laid back: soft kick and claps, shaker, a warm pad, a soft sub, and a glockenspiel and marimba
//          melody made up fresh every four bars, so it never loops the same way twice
//   party  the drop: the ad's phonk, with the pitched cowbell riff, distorted 808, claps and hat rolls
// The music changes over at the next bar, so the drop lands on the one. A fall tape-stops it, as the ad
// does on "Short.", and it comes back with the respawn. Music can be switched off on its own.
import { rng } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const RIFF = [
  [[0, 74], [3, 74], [6, 77], [8, 74], [11, 69], [13, 72], [14, 74]],
  [[0, 74], [3, 74], [6, 77], [8, 79], [10, 77], [12, 76], [14, 72]],
  [[0, 70], [3, 70], [6, 74], [8, 70], [11, 77], [13, 74], [14, 70]],
  [[0, 69], [3, 69], [6, 73], [8, 76], [10, 73], [12, 69], [14, 76]],
];
const BASS = [38, 38, 34, 33];
// the day chords over that bass: Dm, Dm(add9), Bbmaj7, A7sus resolving
const PAD = [[62, 65, 69], [64, 65, 69], [62, 65, 69, 70], [61, 64, 69]];
// D minor pentatonic for the made-up melody, and the notes each bar's melody likes to land on
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81];
const HOME = [[0, 3, 5], [0, 3, 5], [1, 3, 6], [3, 4, 7]];
export const BEAT = 60 / 140, BAR = 4 * BEAT;
const MUSIC = 0.55;

export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.musicOn = true; this.stopped = false;
    this.mode = 'day'; this.want = 'day';
    this.barT = 0; this.bar = 0; this.gridT = 0;
  }

  /** must be called from a tap or key press (a test can pass its own OfflineAudioContext) */
  start(ctxIn) {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !ctxIn) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !ctxIn) return;
    const ctx = this.ctx = ctxIn || new AC();
    const master = this.master = ctx.createGain(); master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.1;
    master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain(); this.music.gain.value = this.musicLevel(); this.music.connect(master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(master);
    this.M = kit(ctx, this.music, 7);
    this.S = kit(ctx, this.sfxBus, 11);
    this.instruments();
    this.barT = this.gridT = ctx.currentTime + 0.1; this.bar = 0;
  }

  musicLevel() { return this.musicOn && !this.stopped ? MUSIC : 0; }
  fadeMusic(tc = 0.08) { if (this.music) this.music.gain.setTargetAtTime(this.musicLevel(), this.ctx.currentTime, tc); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02); }
  setMusic(on) { this.musicOn = on; this.fadeMusic(0.05); }
  get now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }
  /** the phonk's beat (fractional) for the visuals, or -1 when the drop isn't playing */
  beat() { return this.ctx && this.mode === 'party' && this.musicOn && !this.stopped ? (this.ctx.currentTime - this.gridT) / BEAT : -1; }

  /** the fall: the ad's tape stop, everything slurring down to nothing */
  tapeStop() {
    if (!this.ctx || this.ctx.state !== 'running' || this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    if (this.musicOn) {
      // the slur: a falling chord and a puff of noise sliding down, under the music fading out
      for (const m of [50, 57, 62]) this.M.tone(t, mtof(m), 0.55, { type: 'sawtooth', vol: 0.05, a: 0.005, hold: 0.25, glide: [mtof(m) * 0.12, 0.6], lp: 1200 });
      this.M.hiss(t, 0.5, 0.03, 'lowpass', 2400, { sweep: 120, hold: 0.1 });
    }
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(this.music.gain.value, t);
    this.music.gain.linearRampToValueAtTime(this.musicOn ? MUSIC * 0.8 : 0, t + 0.12);
    this.music.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  }
  /** back after the respawn, from the next bar */
  musicBack() {
    if (!this.ctx || !this.stopped) return;
    this.stopped = false;
    const t = this.ctx.currentTime, next = this.gridT + Math.ceil((t + 0.05 - this.gridT) / BAR) * BAR;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setValueAtTime(0, t);
    this.music.gain.setValueAtTime(0, next - 0.01);
    this.music.gain.linearRampToValueAtTime(this.musicLevel(), next + 0.02);
  }

  // ---------- music: called every frame, schedules a bar ahead ----------
  tick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.barT < now - 0.5) {
      // we were away (a hidden tab): pick up on the grid from now
      this.barT = this.gridT + Math.ceil((now + 0.05 - this.gridT) / BAR) * BAR;
      this.bar = Math.round((this.barT - this.gridT) / BAR);
    }
    while (this.barT < now + 0.3) this.scheduleBar();
  }

  scheduleBar() {
    if (this.want !== this.mode) {
      this.mode = this.want;
      if (this.mode === 'party') this.P.crash(this.barT, 0.14);
    }
    // nothing is scheduled while the music is off or stopped, so turning it back on starts clean at a bar
    if (this.musicOn && !this.stopped) {
      if (this.mode === 'day') this.chillBar(this.barT, this.bar); else this.phonkBar(this.barT, this.bar % 4);
    }
    this.barT += BAR; this.bar++;
  }

  instruments() {
    const { ctx, tone, hiss, out, env, shaper } = this.M;
    const P = this.P = {};
    P.glock = (t, m, vol = 0.07, pan = 0.15) => { tone(t, mtof(m), 0.9, { vol, pan, send: 0.3 }); tone(t, mtof(m) * 2.76, 0.22, { vol: vol * 0.35, pan }); tone(t, mtof(m) * 5.4, 0.07, { vol: vol * 0.2, pan }); };
    P.marimba = (t, m, vol = 0.13, pan = -0.12) => { tone(t, mtof(m), 0.38, { vol, pan }); tone(t, mtof(m) * 4, 0.04, { vol: vol * 0.35, pan }); tone(t, mtof(m) * 2, 0.12, { vol: vol * 0.22, type: 'triangle', pan }); };
    P.softKick = (t, vol = 0.5) => tone(t, 130, 0.22, { vol, glide: [48, 0.12] });
    P.shaker = (t, vol = 0.03, pan = 0.25) => hiss(t, 0.05, vol, 'highpass', 6500, { pan });
    P.clapSoft = (t, vol = 0.12) => { for (const dt of [0, 0.009, 0.018]) hiss(t + dt, dt === 0.018 ? 0.12 : 0.01, vol, 'bandpass', 1500, { q: 0.9, send: 0.15 }); };
    // a warm pad: two detuned triangles a note, slow in and out, rolled off
    P.pad = (t, ms, d, vol = 0.022) => { for (const m of ms) for (const det of [-7, 7]) tone(t, mtof(m), 0.7, { type: 'triangle', vol, a: 0.35, hold: d - 0.35, lp: 1300, detune: det, send: 0.35, pan: det / 30 }); };
    P.sub = (t, m, d, vol = 0.16) => tone(t, mtof(m), d * 0.5, { vol, a: 0.01, hold: d * 0.4, lp: 400 });
    P.cowbell = (t, m, vol = 0.07, pan = 0.1) => {
      const f = mtof(m);
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = f * 1.9; hp.Q.value = 1.2;
      const g = env(t, vol, 0.001, 0.32);
      for (const mul of [1, 1.48]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * mul; o.connect(hp); o.start(t); o.stop(t + 0.4); }
      out(hp.connect(g), { pan, send: 0.12 });
    };
    const sat = shaper(3.2); const satOut = ctx.createGain(); satOut.gain.value = 0.55;
    const lp808 = ctx.createBiquadFilter(); lp808.type = 'lowpass'; lp808.frequency.value = 1100;
    sat.connect(lp808).connect(satOut).connect(this.music);
    P.b808 = (t, m, d = 0.5, vol = 0.5) => {
      const f = mtof(m), o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      o.connect(env(t, vol, 0.003, d * 0.7, d * 0.3)).connect(sat); o.start(t); o.stop(t + d + 0.1);
    };
    P.kick = (t, vol = 0.7) => { tone(t, 160, 0.26, { vol, glide: [44, 0.11] }); hiss(t, 0.012, vol * 0.25, 'highpass', 3000); };
    P.clap = (t, vol = 0.22) => { for (const dt of [0, 0.011, 0.022]) hiss(t + dt, dt === 0.022 ? 0.16 : 0.012, vol, 'bandpass', 1700, { q: 0.9, send: 0.2 }); };
    P.hat = (t, vol = 0.05, open = false, pan = 0.2) => hiss(t, open ? 0.2 : 0.03, vol, 'highpass', 8200, { pan });
    P.crash = (t, vol = 0.12) => hiss(t, 1.6, vol, 'highpass', 5200, { send: 0.3 });
  }

  /** the day groove, bar n of a 16-bar cycle; the melody is made up per four bars from the bar number */
  chillBar(t0, n) {
    const P = this.P, s16 = BEAT / 4, r = n % 4, sec = n % 16, phrase = Math.floor(n / 4);
    // pad and sub every bar
    P.pad(t0, PAD[r], BAR, 0.034);
    P.sub(t0, BASS[r] + 12, BAR * 0.6, 0.24); P.sub(t0 + 10 * s16, BASS[r] + 12, BAR * 0.35, 0.17);
    // drums: just the kick for the first four bars of each sixteen, then the full groove; the last bar breathes
    P.softKick(t0, 0.6);
    if (sec >= 4) {
      P.softKick(t0 + 10 * s16, 0.44);
      if (sec !== 15) P.clapSoft(t0 + 8 * s16, 0.13);
      for (let k = 0; k < 8; k++) P.shaker(t0 + k * 2 * s16 + (k % 2 ? s16 * 0.18 : 0), k % 2 ? 0.024 : 0.036, k % 2 ? -0.2 : 0.25);
    }
    // the melody: every third phrase rests (the marimba noodles instead), the others wander the scale
    const R = rng(4000 + phrase * 31 + r);
    if (phrase % 3 === 2) {
      for (let k = 0; k < 4; k++) if (R() < 0.6) P.marimba(t0 + (k * 4 + 2) * s16, SCALE[HOME[r][k % 3]] - 12, 0.11, (k - 1.5) * 0.2);
      return;
    }
    let i = HOME[r][Math.floor(R() * 3)];
    for (let e = 0; e < 8; e++) {
      const last = e >= 6 && r === 3;
      if (last ? e === 6 : R() < (e % 2 ? 0.22 : 0.42)) {
        i = last ? HOME[r][0] : Math.max(0, Math.min(SCALE.length - 1, i + [-2, -1, -1, 1, 1, 2][Math.floor(R() * 6)]));
        const t = t0 + e * 2 * s16 + (e % 2 ? s16 * 0.18 : 0);
        P.glock(t, SCALE[i] + 12, 0.06, 0.2);
        P.marimba(t, SCALE[i], 0.1, -0.15);
      }
    }
  }

  phonkBar(t0, r) {
    const P = this.P, s16 = BEAT / 4;
    for (const [st, m] of RIFF[r]) P.cowbell(t0 + st * s16, m, 0.065, st % 2 ? -0.15 : 0.15);
    P.b808(t0, BASS[r], BEAT * 2.4, 0.5); P.b808(t0 + 10 * s16, BASS[r], BEAT * 1.2, 0.42);
    P.kick(t0); P.kick(t0 + 10 * s16, 0.55);
    P.clap(t0 + 8 * s16);
    for (let k = 0; k < 8; k++) P.hat(t0 + k * BEAT / 2, k % 2 ? 0.035 : 0.05);
    if (r === 3) for (let k = 0; k < 6; k++) P.hat(t0 + 12 * s16 + k * BEAT / 6, 0.04, false, -0.2);   // a triplet roll
    if (r === 1) P.hat(t0 + 14 * s16, 0.04, true);
  }

  // ---------- effects ----------
  play(kind, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const { tone, hiss } = this.S, t = this.ctx.currentTime + 0.005;
    const boom = (t, vol = 0.55) => { tone(t, 70, 1.5, { vol, glide: [38, 1.2], send: 0.5 }); tone(t, 140, 0.6, { vol: vol * 0.35, glide: [76, 0.5], send: 0.4 }); hiss(t, 0.25, vol * 0.3, 'lowpass', 900, { send: 0.4 }); };
    const pop = (t, f = 700, vol = 0.05, pan = 0) => tone(t, f, 0.07, { vol, glide: [f * 2.2, 0.05], pan });
    const sparkle = (t, vol = 0.04) => [98, 102, 105, 110, 114].forEach((m, k) => tone(t + k * 0.05, mtof(m), 0.4, { vol, send: 0.3, pan: (k - 2) * 0.2 }));
    const boing = (t, vol = 0.05, up = 1) => tone(t, 300, 0.18, { vol, type: 'triangle', glide: [300 * (1 + up), 0.12] });
    const thud = (t, vol = 0.12) => tone(t, 110, 0.12, { vol, glide: [55, 0.1] });
    const slide = (t, d = 0.7, vol = 0.05) => tone(t, 1400, d, { vol, type: 'sine', a: 0.02, hold: d * 0.7, glide: [180, d] });
    const clang = (t, vol = 0.07) => [1, 2.76, 5.4, 8.93].forEach((m, k) => tone(t, 520 * m, 0.6 / (k + 1), { vol: vol / (k + 1), send: 0.2 }));
    const crumble = (t, vol = 0.05) => { for (let k = 0; k < 7; k++) hiss(t + k * 0.03 + (k % 3) * 0.007, 0.02, vol * (1 - k / 9), 'bandpass', 2400 + (k % 4) * 700, { q: 2, pan: 0.35 }); };
    const ding = (t) => { tone(t, mtof(88), 0.35, { vol: 0.06, send: 0.1 }); tone(t + 0.11, mtof(93), 0.5, { vol: 0.06, send: 0.1 }); };
    switch (kind) {
      case 'jump': boing(t, 0.045, 0.6 + (o.c || 0) * 1.4); break;
      case 'bigjump': boing(t, 0.07, 2.5); sparkle(t + 0.2, 0.035); break;
      case 'land': thud(t, o.big ? 0.18 : 0.09); if (o.big) boom(t, 0.3); break;
      case 'fall': slide(t, 0.8, 0.05); break;
      case 'respawn': pop(t, 900, 0.05); break;
      case 'cling': clang(t, 0.04); break;
      case 'scrabble': pop(t, 500 + (o.n || 0) * 160, 0.05); break;
      case 'climb': pop(t, 700, 0.05); pop(t + 0.05, 1000, 0.04); break;
      case 'crumble': crumble(t, 0.06); break;
      case 'sparkle': sparkle(t, 0.04); break;
      case 'aura': boom(t, 0.45); sparkle(t + 0.05, 0.04); break;
      case 'best': ding(t); break;
      case 'pop': pop(t, 800, 0.04); break;
    }
  }

  /** the rising whine while a jump charges */
  chargeStart() {
    if (!this.ctx || this.ctx.state !== 'running' || this.chg) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.85);
    f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.08);
    o.connect(f).connect(g).connect(this.sfxBus); o.start(t);
    this.chg = { o, g };
  }
  chargeStop() {
    if (!this.chg) return;
    const t = this.ctx.currentTime, { o, g } = this.chg;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.04); o.stop(t + 0.06);
    this.chg = null;
  }
}

// ---------------------------------------------------------------------------------------- a tiny synth kit
// (the ad's kit(), for a live AudioContext)
function kit(ctx, dest, seed = 1) {
  const R = rng(seed), SR = ctx.sampleRate;
  const noise = ctx.createBuffer(1, SR * 2, SR);
  { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1; }
  // a small hall for sends
  const verb = ctx.createConvolver();
  { const len = Math.floor(SR * 2.2), ir = ctx.createBuffer(2, len, SR); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 3.2); } verb.buffer = ir; }
  const verbIn = ctx.createGain(); verbIn.gain.value = 0.35; verbIn.connect(verb).connect(dest);
  const out = (node, { pan = 0, vol = 1, send = 0 } = {}) => {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const g = ctx.createGain(); g.gain.value = vol;
    node.connect(g).connect(p).connect(dest);
    if (send) { const s = ctx.createGain(); s.gain.value = send; p.connect(s).connect(verbIn); }
    return g;
  };
  const env = (t, vol, a, d, hold = 0) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a);
    if (hold) g.gain.setValueAtTime(vol, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
    return g;
  };
  const tone = (t, f, d, { type = 'sine', vol = 0.2, a = 0.004, hold = 0, pan = 0, lp = 0, hp = 0, send = 0, glide = null, detune = 0 } = {}) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(glide[0], t + glide[1]);
    let n = o.connect(env(t, vol, a, d, hold));
    if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; n = n.connect(fl); }
    if (hp) { const fl = ctx.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = hp; n = n.connect(fl); }
    out(n, { pan, send }); o.start(t); o.stop(t + a + hold + d + 0.05);
    return o;
  };
  let nOff = 0;
  const hiss = (t, d, vol, type, freq, { q = 0.7, pan = 0, a = 0.002, send = 0, sweep = null, hold = 0 } = {}) => {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + a + hold + d);
    out(s.connect(f).connect(env(t, vol, a, d, hold)), { pan, send });
    nOff = (nOff + 0.137) % 1.7; s.start(t, nOff); s.stop(t + a + hold + d + 0.05);
    return f;
  };
  const shaper = (amt) => { const ws = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(amt * x) / Math.tanh(amt); } ws.curve = c; return ws; };
  return { ctx, out, env, tone, hiss, shaper, verbIn, noise, R };
}
