// The HUD, drawn the way the ad draws its game HUD (narrator.js hud() and narrator-art.js text()): Bungee
// and Press Start 2P with thick dark outlines and drop shadows, "+1 AURA" over the manul's head, a giant
// red L, "skill issue", RESPAWN, the AURA charge bar, IMPOSSIBLE JUMP and "+∞ AURA".
// Everything is laid out in the ad's units (the game half of a phone is 585 x 520), scaled to the window.
import { TAU, clamp, lerp, range, smooth, easeOutBack, easeOutCubic } from './util.js';

export const INK = '#16121c';
const EMOJI = '"Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji"';
const F = (w, px, fam = 'Montserrat') => `${w} ${px}px ${fam}, ${EMOJI}, sans-serif`;
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const pop = (t, t0, d = 0.18, s = 2.4) => (t < t0 ? 0 : easeOutBack(clamp((t - t0) / d), s));
const slam = (t, t0, from = 2.2, d = 0.12) => (t < t0 ? 0 : lerp(from, 1, easeOutCubic(clamp((t - t0) / d))));
const kick = (t, t0, amt = 0.3, k = 11) => (t < t0 ? 1 : 1 + amt * Math.exp(-(t - t0) * k));
function shake(t, t0, amp, decay = 8) {
  if (t < t0) return [0, 0];
  const e = amp * Math.exp(-(t - t0) * decay), f = Math.floor(t * 30);
  return [e * (hash(f) - 0.5) * 2, e * (hash(f + 77) - 0.5) * 2];
}

/** chunky outlined caption text (the ad's text()) */
function text(g, s, x, y, o = {}) {
  const px = o.px ?? 60;
  g.save();
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  if (o.sc != null) g.scale(o.sc, o.sc * (o.sy ?? 1));
  if (o.a != null) g.globalAlpha *= clamp(o.a);
  g.font = F(o.w ?? 900, px, o.fam);
  g.textAlign = o.align ?? 'center'; g.textBaseline = o.base ?? 'middle'; g.lineJoin = 'round';
  if (o.maxW) { const mw = g.measureText(s).width; if (mw > o.maxW) g.scale(o.maxW / mw, o.maxW / mw); }
  const lw = o.stroke === null ? 0 : o.lw ?? px * 0.16;
  if (o.shadow !== false) {
    const d = o.shadow ?? px * 0.07;
    g.fillStyle = g.strokeStyle = o.shadowCol ?? INK;
    if (lw) { g.lineWidth = lw; g.strokeText(s, d, d); }
    g.fillText(s, d, d);
  }
  if (o.glow) { g.shadowColor = o.glowCol ?? o.fill ?? '#fff'; g.shadowBlur = o.glow; }
  if (lw) { g.lineWidth = lw; g.strokeStyle = o.stroke ?? INK; g.strokeText(s, 0, 0); g.shadowBlur = 0; }
  g.fillStyle = o.fill ?? '#fff'; g.fillText(s, 0, 0);
  g.restore();
}
function emo(g, ch, x, y, size, { rot = 0, a = 1 } = {}) {
  if (size <= 0.5 || a <= 0) return;
  g.save(); g.translate(x, y); g.rotate(rot); g.globalAlpha *= clamp(a);
  g.font = `${size}px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 0, 0);
  g.restore();
}
const PS = '"Press Start 2P"';

export class Hud {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.resize(1, 1); }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    // the ad's 585 x 520 game half, fitted to the window; on a phone, sized to its width instead
    this.k = Math.max(Math.min(w / 585, h / 520) * 0.92, Math.min(w / 430, 1));
    const cs = getComputedStyle(document.documentElement);
    this.safeT = parseFloat(cs.paddingTop) || 0; const safeB = this.safeB = parseFloat(cs.paddingBottom) || 0;
    this.dpr = dpr; this.VW = w / this.k; this.VH = (h - this.safeT - safeB) / this.k; this.w = w; this.h = h;
  }

  draw(s) {
    const g = this.g, { VW, VH } = this, t = s.t;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    g.setTransform(this.dpr * this.k, 0, 0, this.dpr * this.k, 0, this.dpr * this.safeT);
    const hx = s.head[0] * VW, hy = (s.head[1] * this.h - this.safeT) / this.k;

    if (s.mode === 'title') return this.title(g, s);

    // title + counters
    const bob = Math.sin(t * 5) * 2;
    text(g, 'MANUL PARKOUR', 22, 46 + bob, { fam: 'Bungee', w: 400, px: 31, align: 'left', fill: '#fff', stroke: '#2a1458', lw: 8, shadow: 4, shadowCol: '#ff4fa8', rot: -0.03 });
    text(g, `AURA ${s.aura}`, 26, 84, { fam: PS, w: 400, px: 12, align: 'left', fill: '#ffe14d', stroke: '#2a1458', lw: 5, shadow: 2 });
    if (!s.party) {
      // the streak towards party mode
      for (let k = 0; k < s.partyAt; k++) {
        g.fillStyle = INK; g.beginPath(); g.roundRect(26 + k * 15, 98, 11, 11, 3); g.fill();
        g.fillStyle = k < s.streak ? '#ff4fd8' : 'rgba(255,255,255,0.35)'; g.beginPath(); g.roundRect(27.5 + k * 15, 99.5, 8, 8, 2); g.fill();
      }
      text(g, 'PARTY', 30 + s.partyAt * 15, 104, { fam: PS, w: 400, px: 8, align: 'left', fill: '#fff', stroke: INK, lw: 4, shadow: 1, a: 0.85 });
    } else {
      text(g, 'PHONK MODE', 26, 104, { fam: PS, w: 400, px: 9, align: 'left', fill: '#ff4fd8', stroke: INK, lw: 4, shadow: 1, a: 0.6 + 0.4 * (s.bp || 0) });
    }
    const R = VW - 22;
    text(g, 'JUMPS', R, 36, { fam: PS, w: 400, px: 12, align: 'right', fill: '#fff', stroke: '#2a1458', lw: 5, shadow: 2 });
    const jk = s.land ? kick(t, s.land.t, 0.35, 12) : 1;
    text(g, String(s.jumps).padStart(2, '0'), R, 66, { fam: 'Bungee', w: 400, px: 34, align: 'right', fill: '#ffe14d', stroke: '#2a1458', lw: 8, shadow: 3, sc: jk });
    text(g, `BEST ${s.best}`, R, 96, { fam: PS, w: 400, px: 9, align: 'right', fill: '#fff', stroke: '#2a1458', lw: 4, shadow: 1, a: 0.9 });
    if (s.newBestAt != null && t - s.newBestAt < 1.6) text(g, 'NEW BEST!', R - 40, 116, { fam: PS, w: 400, px: 10, fill: '#8ff6ff', stroke: INK, lw: 5, shadow: 2, sc: pop(t, s.newBestAt, 0.2), a: 1 - range(t, s.newBestAt + 1.2, s.newBestAt + 1.6) });

    // +1 AURA on every new block (gold gets more)
    if (s.land && s.land.gain) {
      const k = t - s.land.t, d = s.land.gold ? 1.3 : 0.75;
      if (k < d) {
        const u = k / d, a = 1 - smooth(range(u, 0.6, 1));
        if (s.land.gold) {
          const sc = pop(t, s.land.t, 0.2, 3) * (1 + 0.06 * Math.sin(t * 30));
          const gr = g.createLinearGradient(VW / 2 - 120, 0, VW / 2 + 120, 0);
          ['#ff4fd8', '#ffe14d', '#4dffb8', '#4dc3ff'].forEach((c, i) => gr.addColorStop(i / 3, c));
          text(g, '+∞ AURA', VW / 2, VH * 0.36 - 30 * easeOutCubic(u), { fam: 'Bungee', w: 400, px: 50, fill: gr, stroke: '#2a1458', lw: 10, shadow: 4, a, sc, glow: 30, glowCol: '#ffd34d' });
        } else {
          const y = Math.max(140, hy - 26) - 44 * easeOutCubic(u), sc = pop(t, s.land.t, 0.16, 2.6);
          text(g, '+1 AURA', clamp(hx, 90, VW - 90), y, { fam: 'Bungee', w: 400, px: 24, fill: '#ffe14d', stroke: '#3a1a00', lw: 6, shadow: 2, a, sc, rot: (s.jumps % 2 ? 0.08 : -0.08) });
        }
      }
    }

    // party mode kicks in: +1000 AURA
    if (s.partyStart != null && t - s.partyStart < 1.5) {
      const k = t - s.partyStart, a = 1 - range(k, 1.1, 1.5), [sx, sy] = shake(t, s.partyStart, 8, 6);
      text(g, '+1000', VW / 2 + sx, VH * 0.2 + sy, { fam: 'Bungee', w: 400, px: 64, fill: '#fff', stroke: '#2a1458', lw: 12, shadow: 5, shadowCol: '#ff4fa8', sc: slam(t, s.partyStart, 2.4, 0.14), a, glow: 34, glowCol: '#c26bff' });
      text(g, 'AURA', VW / 2 + sx, VH * 0.2 + 62 + sy, { fam: 'Bungee', w: 400, px: 44, fill: '#ffe14d', stroke: '#2a1458', lw: 10, shadow: 4, sc: slam(t, s.partyStart + 0.12, 2.4, 0.14), a, glow: 26, glowCol: '#ffd34d' });
    }

    // the fail: L
    if (s.dead) {
      const t0 = s.dead.t0, sc = slam(t, t0, 2.6, 0.12), [sx, sy] = shake(t, t0, 10, 6);
      const lx = Math.min(VW * 0.24, 150), ly = VH * 0.42;
      text(g, 'L', lx + sx, ly + sy, { fam: 'Bungee', w: 400, px: 190, fill: '#ff2a3d', stroke: '#fff', lw: 14, shadow: 8, sc, rot: -0.1 });
      emo(g, '💀', lx + 85 + sx, ly - 67 + sy, 60 * pop(t, t0 + 0.1), { rot: 0.2 });
      text(g, s.dead.line, lx + 10, ly + 101, { fam: PS, w: 400, px: 15, fill: '#fff', stroke: INK, lw: 5, shadow: 2, a: range(t, t0 + 0.15, t0 + 0.25) });
      // the run that just ended
      const runA = range(t, t0 + 0.3, t0 + 0.4);
      text(g, `${s.dead.jumps} JUMPS  ${s.dead.aura} AURA`, lx + 10, ly + 128, { fam: PS, w: 400, px: 11, fill: '#ffe14d', stroke: INK, lw: 5, shadow: 2, a: runA });
      if (s.dead.newBest) text(g, 'NEW BEST!', lx + 10, ly + 150, { fam: PS, w: 400, px: 11, fill: '#8ff6ff', stroke: INK, lw: 5, shadow: 2, a: runA, sc: pop(t, t0 + 0.3, 0.2) });
    }
    if (s.respawnT != null && t - s.respawnT < 0.45 && Math.floor((t - s.respawnT) * 12) % 2 === 0)
      text(g, 'RESPAWN', clamp(hx, 110, VW - 110), hy - 40, { fam: PS, w: 400, px: 16, fill: '#8ff6ff', stroke: INK, lw: 6, shadow: 2 });

    // charging: the AURA bar over its head
    if (s.charge > 0.001) {
      const c = s.charge, bx = clamp(hx, 110, VW - 110) - 80, by = Math.max(150, hy - 58);
      g.save();
      g.fillStyle = INK; g.beginPath(); g.roundRect(bx - 4, by - 4, 168, 22, 8); g.fill();
      // where "impossible" starts
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(bx + 160 * s.bigAt, by, 160 * (1 - s.bigAt), 14);
      const gr = g.createLinearGradient(bx, 0, bx + 160, 0); gr.addColorStop(0, '#c26bff'); gr.addColorStop(1, '#ffd34d');
      g.fillStyle = gr; g.shadowColor = '#ffd34d'; g.shadowBlur = 14 * c; g.beginPath(); g.roundRect(bx, by, Math.max(4, 160 * c), 14, 6); g.fill();
      g.restore();
      const max = c >= 1;
      text(g, max ? 'AURA MAX' : 'AURA', bx + 80, by - 16, { fam: PS, w: 400, px: 12, fill: max ? '#fff' : '#ffe14d', stroke: INK, lw: 5, shadow: 2, sc: max ? 1 + 0.08 * Math.sin(t * 30) : 1, glow: max ? 16 : 0, glowCol: '#ffd34d' });
    }
    // the impossible jump's banner
    if (s.big) {
      const u = clamp((t - s.big.t0) / s.big.T);
      text(g, 'IMPOSSIBLE JUMP', VW / 2, VH * 0.27, { fam: 'Bungee', w: 400, px: 30, fill: '#fff', stroke: '#c26bff', lw: 8, shadow: 3, shadowCol: '#2a1458', sc: pop(t, s.big.t0, 0.2) * (1 + 0.04 * Math.sin(t * 25)), a: 1 - range(u, 0.85, 1), glow: 20, glowCol: '#ffd34d', maxW: VW - 40 });
    }
    // hanging on: legs too short, mash to climb
    if (s.cling) {
      const x = clamp(hx, 110, VW - 110), y = Math.max(150, hy - 60);
      text(g, s.touch ? 'TAP TAP TAP!' : 'MASH SPACE!', x, y, { fam: 'Bungee', w: 400, px: 22, fill: '#fff', stroke: '#ff2a3d', lw: 7, shadow: 2, sc: 1 + 0.07 * Math.sin(t * 28) });
      for (let k = 0; k < s.cling.need; k++) {
        g.fillStyle = INK; g.beginPath(); g.arc(x - 18 + k * 18, y + 24, 7, 0, TAU); g.fill();
        g.fillStyle = k < s.cling.taps ? '#ffe14d' : 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(x - 18 + k * 18, y + 24, 5, 0, TAU); g.fill();
      }
      // the grip running out
      g.fillStyle = INK; g.fillRect(x - 40, y + 38, 80, 6);
      g.fillStyle = '#ff2a3d'; g.fillRect(x - 39, y + 39, 78 * (1 - s.cling.u), 4);
    }

    // the short-video caption, bottom left
    const cy = VH - 46;
    text(g, '@vizzle.vision', 20, cy, { fam: 'Inter', w: 800, px: 19, align: 'left', fill: '#fff', stroke: null, shadow: 2, shadowCol: 'rgba(0,0,0,0.35)' });
    text(g, 'facts only no cap 🧠 part 2  #manul #parkour', 20, cy + 24, { fam: 'Inter', w: 600, px: 14, align: 'left', fill: '#fff', stroke: null, shadow: 1.5, shadowCol: 'rgba(0,0,0,0.35)', maxW: VW - 30 - 165 / this.k });

    // the first few seconds: how to play
    if (s.hint > 0.01) {
      const msg = s.touch ? 'drag to steer  ·  hold JUMP, let go to jump' : '← → turn   ↑ ↓ walk   hold SPACE to charge, let go to jump';
      const hy2 = s.touch && s.pad ? (s.pad.y - s.pad.r - this.safeT) / this.k - 26 : VH - 97;
      g.save(); g.globalAlpha = s.hint;
      g.font = F(700, 13, 'Inter'); const w = Math.min(VW - 40, g.measureText(msg).width + 28);
      g.fillStyle = 'rgba(22,18,28,0.72)'; g.beginPath(); g.roundRect(VW / 2 - w / 2, hy2 - 15, w, 30, 15); g.fill();
      g.restore();
      text(g, msg, VW / 2, hy2, { fam: 'Inter', w: 700, px: 13, fill: '#fff', stroke: null, shadow: false, a: s.hint, maxW: VW - 64 });
    }

    if (s.touch) this.sticks(g, s);
    if (s.mode === 'paused') this.paused(g, s);
  }

  sticks(g, s) {
    const k = this.k, J = s.joy;
    if (J) {
      g.save(); g.globalAlpha = 0.55;
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(J.ox / k, (J.oy - this.safeT) / k, 52, 0, TAU); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(J.ox / k + J.dx * 40, (J.oy - this.safeT) / k + J.dy * 40, 22, 0, TAU); g.fill();
      g.restore();
    }
    // the jump button, bottom centre (red with an X while a slide-off has cancelled it)
    const P = s.pad, x = P.x / k, y = (P.y - this.safeT) / k, r = P.r / k, c = s.charge;
    g.save(); g.globalAlpha = s.jumpHeld ? 0.85 : 0.5;
    g.fillStyle = s.jumpCancel ? '#ff2a3d' : INK; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (c > 0) { g.fillStyle = '#ffd34d'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r - 4, -Math.PI / 2, -Math.PI / 2 + TAU * c); g.closePath(); g.fill(); }
    g.restore();
    if (s.jumpCancel) {
      g.save(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round'; const d = r * 0.32;
      g.beginPath(); g.moveTo(x - d, y - d); g.lineTo(x + d, y + d); g.moveTo(x + d, y - d); g.lineTo(x - d, y + d); g.stroke(); g.restore();
    } else text(g, 'JUMP', x, y + 1, { fam: PS, w: 400, px: 11, fill: '#fff', stroke: INK, lw: 4, shadow: false });
  }

  title(g, s) {
    const { VW, VH } = this, t = s.t;
    const gr = g.createLinearGradient(0, 0, 0, VH);
    gr.addColorStop(0, 'rgba(42,20,88,0.55)'); gr.addColorStop(0.45, 'rgba(42,20,88,0.05)'); gr.addColorStop(1, 'rgba(42,20,88,0.6)');
    g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    const bob = Math.sin(t * 3) * 4;
    text(g, 'MANUL', VW / 2, VH * 0.17 + bob, { fam: 'Bungee', w: 400, px: 74, fill: '#fff', stroke: '#2a1458', lw: 14, shadow: 7, shadowCol: '#ff4fa8', rot: -0.04, sc: pop(t, 0.1, 0.3), maxW: VW - 40 });
    text(g, 'PARKOUR', VW / 2, VH * 0.17 + 70 + bob, { fam: 'Bungee', w: 400, px: 62, fill: '#ffe14d', stroke: '#2a1458', lw: 13, shadow: 6, shadowCol: '#ff4fa8', rot: -0.04, sc: pop(t, 0.25, 0.3), maxW: VW - 40 });
    text(g, 'legs: short.  aura: infinite.', VW / 2, VH * 0.17 + 122, { fam: PS, w: 400, px: 11, fill: '#fff', stroke: INK, lw: 5, shadow: 2, a: range(t, 0.5, 0.8), maxW: VW - 30 });
    if (s.best > 0) text(g, `BEST ${s.best}`, VW / 2, VH * 0.17 + 146, { fam: PS, w: 400, px: 10, fill: '#8ff6ff', stroke: INK, lw: 5, shadow: 2, a: range(t, 0.5, 0.8) });
    const lines = s.touch
      ? ['drag anywhere: steer (drag up to walk)', 'hold JUMP to charge, let go to jump', 'slide off JUMP to cancel', 'hanging on? tap tap tap to climb']
      : ['← →  turn       ↑ ↓  walk', 'hold SPACE to charge, let go to jump', 'come up short? mash SPACE to climb', 'M  music on/off      P  pause'];
    const y0 = VH - 92 - lines.length * 20;
    g.save(); g.globalAlpha = range(t, 0.7, 1);
    g.fillStyle = 'rgba(22,18,28,0.66)'; g.beginPath(); g.roundRect(VW / 2 - Math.min(190, VW / 2 - 14), y0 - 22, Math.min(380, VW - 28), lines.length * 20 + 26, 14); g.fill();
    g.restore();
    lines.forEach((l, i) => text(g, l, VW / 2, y0 + i * 20, { fam: 'Inter', w: 700, px: 13, fill: '#fff', stroke: null, shadow: false, a: range(t, 0.7, 1), maxW: VW - 50 }));
    if (Math.floor(t * 2.2) % 2 === 0 && t > 0.9)
      text(g, s.touch ? 'TAP TO START' : 'PRESS SPACE', VW / 2, VH - 50, { fam: PS, w: 400, px: 16, fill: '#ffe14d', stroke: INK, lw: 6, shadow: 3 });
  }

  paused(g, s) {
    const { VW, VH } = this;
    g.fillStyle = 'rgba(22,18,28,0.55)'; g.fillRect(0, 0, VW, VH);
    text(g, 'PAUSED', VW / 2, VH * 0.42, { fam: 'Bungee', w: 400, px: 54, fill: '#fff', stroke: '#2a1458', lw: 11, shadow: 5, shadowCol: '#ff4fa8' });
    text(g, s.touch ? 'tap to keep going' : 'P to keep going', VW / 2, VH * 0.42 + 54, { fam: PS, w: 400, px: 12, fill: '#ffe14d', stroke: INK, lw: 5, shadow: 2 });
  }
}
