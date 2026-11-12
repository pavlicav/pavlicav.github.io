// The course: floating pastel blocks over the sky void, laid out the way the ad lays them (narrator-game.js
// gamePlan): each block a few metres on from the last, the heading wandering and drifting back, the height
// wandering and drifting back to zero. Here it never ends, and it gets harder as it goes:
//   normal  pastel cake blocks with sprinkles (smaller and farther apart the further you get)
//   gold    the ad's "impossible jump": far and high, only a charged jump makes it
//   move    slides from side to side
//   sand    rainbow kinetic sand: crumbles a moment after you land on it
import { clamp, rng } from './util.js';

export class Course {
  constructor(seed = 1986) {
    this.R = rng(seed);
    this.blocks = [{ i: 0, x: 0, y: 0, z: 0, s: 3.2, hgt: 1.8, col: 0, kind: 'start' }];
    this.x = 0; this.y = 0; this.z = 0; this.hd = 0; this.col = 0;
    this.nextGold = 9;
  }

  ensure(n) { while (this.blocks.length < n) this.add(); }

  add() {
    const R = this.R, i = this.blocks.length, d = clamp((i - 6) / 70);
    let dist, dy, s, kind = 'normal', hgt = 1.3 + R() * 1.0;
    const prevKind = this.blocks[i - 1].kind;
    // gold only after a still block, so the big charge can be judged
    if (i >= this.nextGold && (prevKind === 'normal' || prevKind === 'start')) {
      dist = 7.7 + R() * 1.1 + d * 0.9; dy = 1.0 + R() * 0.35; s = 2.4; kind = 'gold'; hgt = 1.6;
      this.hd += (R() - 0.5) * 0.3 - this.hd * 0.3;
      this.nextGold = i + 11 + Math.floor(R() * 6);
    } else {
      dist = 3.1 + R() * 1.0 + d * 1.5;
      dy = (R() - 0.5) * (1.1 + d * 0.7) - this.y * 0.22;
      this.hd += (R() - 0.5) * 0.9 - this.hd * 0.3;
      s = Math.max(1.4, (2.1 + R() * 0.7) * (1 - 0.3 * d));
      const prev = prevKind;
      if (i > 14 && prev !== 'move' && prev !== 'gold' && R() < 0.12 + 0.22 * d) kind = 'move';
      else if (i > 22 && prev !== 'sand' && R() < 0.1 + 0.2 * d) kind = 'sand';
    }
    // the block after a gold one comes back down a little, so the landing isn't followed by a wall
    if (this.blocks[i - 1].kind === 'gold') dy = Math.min(dy, -0.2);
    this.x += Math.sin(this.hd) * dist; this.z -= Math.cos(this.hd) * dist; this.y += dy;
    this.col = (this.col + 1 + Math.floor(R() * 5)) % 6;
    const b = { i, x: this.x, y: this.y, z: this.z, s, hgt, col: this.col, kind };
    if (kind === 'move') {
      // slides across the path
      b.ax = Math.cos(this.hd); b.az = Math.sin(this.hd);
      b.amp = 0.9 + R() * 0.9 * (0.5 + d); b.w = 1.1 + R() * 0.7; b.ph = R() * 6.283;
    }
    this.blocks.push(b);
    return b;
  }
}

/** where block b's top centre is at time t (and how far it's fallen if it's sand that crumbled) */
export function blockTop(b, t, out = [0, 0, 0]) {
  let x = b.x, y = b.y, z = b.z;
  if (b.kind !== 'gold' && b.kind !== 'start') y += 0.07 * Math.sin(t * 1.3 + b.i * 2.1);
  if (b.kind === 'move') { const o = b.amp * Math.sin(t * b.w + b.ph); x += b.ax * o; z += b.az * o; }
  if (b.crumbleAt != null) {
    const k = t - b.crumbleAt;
    if (k > 0) { x += Math.sin(t * 61) * 0.05 * Math.min(1, k * 3); z += Math.cos(t * 53) * 0.05 * Math.min(1, k * 3); }
    const f = k - SAND_HOLD;
    if (f > 0) y -= 0.5 * 26 * f * f;
  }
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

/** sand: how long it holds after you land on it, before it drops */
export const SAND_HOLD = 0.75;
export const SAND_WARN = 0.35;   // it starts to shake this long after the landing; it drops at WARN + HOLD
