// The 24 letter effects. Each is a pure function of time, so any moment can be drawn directly (scrubbable):
//
//   fx(L, s, c, acc)
//     L    the letter: { i, n, x, y, w, h, cx }  (x, y = rest position of the glyph origin in text px,
//          w = advance, h = cap height, cx = word centre x, i/n = index/count)
//     s    strength 0..1 (the effect's weight)
//     c    clock: { t: 0..1 through the word's performance, T: seconds, e: envelope 0..1..0 (in, hold, out) }
//     acc  accumulator for this letter: add offsets, multiply scale/opacity, push ghosts/particles/lines
//
// Offsets and rotations add, scales and opacity multiply, colours blend by weight; ghosts are extra copies of
// the letter, particles are dots, lines are hairlines (all in text px, relative to the word).

const TAU = Math.PI * 2;
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const envelope = (t, inn = 0.18, out = 0.78) => smooth(0, inn, t) * (1 - smooth(out, 1, t));
/** deterministic noise in [0,1) from integers */
export function rnd(a, b = 0, c = 0) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const wob = (i, k, T, f) => Math.sin(T * f * TAU + rnd(i, k) * TAU);

export const COLORS = {
  ember: [0.78, 0.25, 0.05], ice: [0.45, 0.62, 0.78], rose: [0.70, 0.30, 0.42], grey: [0.55, 0.53, 0.5],
  tear: [0.30, 0.40, 0.55], gold: [0.72, 0.55, 0.15], star: [0.25, 0.30, 0.55],
};

export const FX = {
  // ── joy ↔ sorrow ──
  bounce(L, s, { t, T, e }, a) {
    const ph = T * 2.2 - L.i * 0.12;
    const hop = Math.abs(Math.sin(ph * Math.PI));
    a.y += s * e * L.h * 0.55 * hop;
    const squash = s * e * 0.18 * Math.max(0, 1 - hop * 4);   // squash on landing
    a.sx *= 1 + squash; a.sy *= 1 - squash;
  },
  liquid(L, s, { t, T, e }, a) {
    const melt = s * e;
    a.sy *= 1 + 0.45 * melt * (0.6 + 0.4 * rnd(L.i, 7)); a.y -= L.h * 0.2 * melt;   // sag downward
    a.sx *= 1 - 0.08 * melt;
    a.ink(COLORS.tear, 0.55 * melt);
    for (let k = 0; k < 3; k++) {                    // drops that bead off the bottom and fall
      const period = 1.6 + rnd(L.i, k, 3), ph = ((T + rnd(L.i, k) * period) % period) / period;
      a.dot(L.x + L.w * (0.25 + 0.5 * rnd(L.i, k, 5)), -L.h * 0.2 * melt - ph * ph * L.h * 2.2,
        (2.2 + 2 * (1 - ph)) * melt, melt * (1 - ph), COLORS.tear);
    }
  },
  // ── ascent ↔ descent ──
  rise(L, s, { t, e }, a) {
    const lift = smooth(L.i / L.n * 0.4, 0.6 + L.i / L.n * 0.4, t) * e;
    a.y += s * lift * L.h * (1.1 + 0.5 * L.i / L.n); a.x += s * lift * L.w * 0.15 * L.i;
    a.op *= 1 - 0.25 * s * lift;
  },
  sink(L, s, { t, T, e }, a) {
    const d = smooth(L.i / L.n * 0.3, 0.55 + L.i / L.n * 0.3, t) * e;
    a.y -= s * d * L.h * 1.1; a.rz += s * d * 0.08 * (rnd(L.i, 2) - 0.5);
    a.x += s * d * Math.sin(T * 3 + L.i) * 1.5;      // refracted wobble
    a.op *= 1 - 0.55 * s * d;
    if (L.i === 0) a.line(L.x - 10, -L.h * 0.25, L.x + L.wordW + 10, -L.h * 0.25, 0.35 * s * e, COLORS.tear);   // the water line
  },
  // ── heat ↔ cold ──
  burn(L, s, { t, T, e }, a) {
    const b = s * e;
    a.ink(COLORS.ember, 0.85 * b);
    a.op *= 1 - 0.45 * b * smooth(0.3, 0.7, t);
    a.y += Math.sin(T * 9 + L.i) * 0.8 * b;
    for (let k = 0; k < 4; k++) {                    // embers rising and winking out
      const period = 1.1 + rnd(L.i, k, 9) * 0.8, ph = ((T + rnd(L.i, k) * period) % period) / period;
      a.dot(L.x + L.w * rnd(L.i, k, 1) + Math.sin(ph * 6 + k) * 4, ph * L.h * 2.4,
        (1.5 + 2.5 * rnd(L.i, k, 2)) * b, b * (1 - ph) * (ph < 0.1 ? ph * 10 : 1), COLORS.ember);
    }
  },
  freeze(L, s, { t, e }, a) {
    const f = s * e;
    a.ink(COLORS.ice, 0.8 * f);
    a.still = Math.max(a.still, f);                  // damps other motion (applied at the end)
    const grow = smooth(0.1, 0.6, t) * f;
    for (let k = 0; k < 3; k++) {                    // frost needles along the strokes
      const px = L.x + L.w * rnd(L.i, k, 4), py = L.h * rnd(L.i, k, 6), ang = rnd(L.i, k, 8) * TAU, len = 7 * grow;
      for (let r = 0; r < 3; r++) {
        const aa = ang + r * TAU / 3;
        a.line(px, py, px + Math.cos(aa) * len, py + Math.sin(aa) * len, 0.7 * grow, COLORS.ice);
      }
    }
  },
  // ── force ↔ hush ──
  embolden(L, s, { e }, a) {
    const w = s * e;
    const r = 1.6 * w;                               // thicker strokes: a tight ring of copies
    for (let k = 0; k < 8; k++) a.ghost(Math.cos(k * TAU / 8) * r, Math.sin(k * TAU / 8) * r, 1, 1, 1);
    a.sx *= 1 + 0.1 * w; a.sy *= 1 + 0.1 * w;
  },
  whisper(L, s, { T, e }, a) {
    const w = s * e;
    a.sx *= 1 - 0.35 * w; a.sy *= 1 - 0.35 * w;
    a.x += (L.i - (L.n - 1) / 2) * L.w * 0.35 * w; a.y += L.h * 0.15 * w;
    a.ink(COLORS.grey, 0.8 * w);
    a.x += wob(L.i, 1, T, 7) * 0.6 * w;
  },
  // ── growth ↔ decay ──
  bloom(L, s, { t, T, e }, a) {
    const open = smooth(L.i / L.n * 0.25, 0.35 + L.i / L.n * 0.25, t);
    const k = 1 - s * (1 - open) * 0.85;             // grows from almost nothing
    a.sx *= k * (1 + 0.1 * s * e * Math.sin(T * 2)); a.sy *= k * (1 + 0.1 * s * e * Math.sin(T * 2));
    a.rz += s * (1 - open) * 1.2;                   // unfurls
    a.ink(COLORS.rose, 0.7 * s * e);
    a.ghost(0, 0, 1.25, 1.25, 0.12 * s * e);          // soft glow
  },
  crumble(L, s, { t, e }, a) {
    const start = 0.15 + 0.35 * L.i / L.n, gone = smooth(start, start + 0.3, t) * (1 - smooth(0.8, 0.97, t));
    a.op *= 1 - s * gone;
    a.y -= s * gone * L.h * 0.15; a.rz += s * gone * 0.15 * (rnd(L.i) - 0.5);
    for (let k = 0; k < 14; k++) {                   // dust falls from where the letter was
      const born = start + 0.25 * rnd(L.i, k, 1), ph = Math.max(0, t - born) / 0.45;
      if (ph <= 0 || ph >= 1) continue;
      a.dot(L.x + L.w * rnd(L.i, k, 2) + (rnd(L.i, k, 3) - 0.5) * 20 * ph, L.h * rnd(L.i, k, 4) - ph * ph * L.h * 2,
        1.4 + 1.8 * rnd(L.i, k, 5), s * (1 - ph) * 0.85, COLORS.grey);
    }
  },
  // ── life ↔ death ──
  pulse(L, s, { T, e }, a) {
    const beat = Math.pow(Math.max(0, Math.sin(T * 1.3 * TAU)), 6);   // a heartbeat, not a sine
    const k = 1 + 0.16 * s * e * beat;
    a.sx *= k; a.sy *= k;
    a.ghost(0, 0, 1.18, 1.18, 0.18 * s * e * beat);
  },
  evaporate(L, s, { t, e }, a) {
    const v = s * smooth(0.1 + 0.3 * L.i / L.n, 0.7, t) * (1 - smooth(0.82, 1, t));
    a.y += v * L.h * 1.3; a.op *= 1 - 0.85 * v;
    for (let k = 1; k <= 4; k++) a.ghost(0, -k * 3 * v, 1 + 0.05 * k * v, 1 + 0.08 * k * v, 0.22 * v);   // a soft trail below
  },
  // ── calm ↔ fear ──
  drift(L, s, { T, e }, a) {
    const d = s * e;
    a.x += Math.sin(T * 0.7 + rnd(L.i, 1) * TAU) * L.h * 0.35 * d;
    a.y += Math.cos(T * 0.55 + rnd(L.i, 2) * TAU) * L.h * 0.3 * d;
    a.rz += Math.sin(T * 0.5 + rnd(L.i, 3) * TAU) * 0.12 * d;
  },
  tremble(L, s, { T, e }, a) {
    const d = s * e;
    a.x += wob(L.i, 1, T, 13) * 1.8 * d + wob(L.i, 4, T, 23) * 0.8 * d;
    a.y += wob(L.i, 2, T, 17) * 1.8 * d;
    a.rz += wob(L.i, 3, T, 11) * 0.05 * d;
  },
  // ── slow ↔ sudden ──
  stretch(L, s, { t, e }, a) {
    const pull = s * e * smooth(0.1, 0.55, t);
    const off = (L.i - (L.n - 1) / 2) * L.h * 0.55 * pull;
    a.x += off; a.sx *= 1 + 0.3 * pull; a.sy *= 1 - 0.12 * pull;
    if (L.i < L.n - 1)                               // taffy threads between letters
      a.line(L.x + L.w + off, L.h * 0.45, L.x + L.w + off + L.h * 0.55 * pull, L.h * 0.45, 0.5 * pull, [0.2, 0.2, 0.2]);
  },
  shatter(L, s, { t }, a) {
    const hit = 0.18, back = 0.72;
    const out = t < hit ? 0 : t < back ? 1 - Math.pow(1 - smooth(hit, hit + 0.12, t), 3) : 1 - smooth(back, 0.95, t);
    const ang = Math.atan2(L.h * 0.5, L.x + L.w / 2 - L.cx) + (rnd(L.i, 1) - 0.5) * 1.4;
    const dist = s * out * L.h * (1.2 + 1.2 * rnd(L.i, 2));
    a.x += Math.cos(ang) * dist * (L.x + L.w / 2 < L.cx ? -1 : 1) * Math.abs(Math.cos(ang)) + (L.x + L.w / 2 - L.cx) * 0.6 * s * out;
    a.y += Math.sin(ang) * dist * 0.8;
    a.rz += s * out * (rnd(L.i, 3) - 0.5) * 2.4;
    for (let k = 0; k < 3; k++) {                    // shards
      const sx = L.x + L.w * rnd(L.i, k, 7) + (rnd(L.i, k, 8) - 0.5) * 60 * s * out, sy = L.h * rnd(L.i, k, 9) + (rnd(L.i, k, 10) - 0.5) * 60 * s * out;
      const r = 4 + 4 * rnd(L.i, k, 11), rot = rnd(L.i, k, 12) * TAU + out * 3;
      for (let m = 0; m < 3; m++) {
        const a0 = rot + m * TAU / 3, a1 = rot + (m + 1) * TAU / 3;
        a.line(sx + Math.cos(a0) * r, sy + Math.sin(a0) * r, sx + Math.cos(a1) * r, sy + Math.sin(a1) * r, 0.8 * s * out, [0.1, 0.1, 0.1]);
      }
    }
  },
  // ── together ↔ apart ──
  attract(L, s, { t, e }, a) {
    const k = s * e * smooth(0.1, 0.5, t);
    a.x += (L.cx - (L.x + L.w / 2)) * 0.55 * k;
    a.sx *= 1 - 0.1 * k; a.rz += (L.cx - (L.x + L.w / 2)) * 0.0015 * k;
  },
  repel(L, s, { t, e }, a) {
    const k = s * e * smooth(0.1, 0.5, t), d = (L.x + L.w / 2 - L.cx);
    a.x += d * 0.9 * k + Math.sign(d || 1) * L.h * 0.3 * k;
    a.y += (rnd(L.i, 5) - 0.5) * L.h * 0.5 * k; a.rz += Math.sign(d || 1) * 0.15 * k;
  },
  // ── future ↔ memory ──
  foreshadow(L, s, { t, e }, a) {
    const come = smooth(0, 0.55, t);
    for (let k = 1; k <= 3; k++) a.ghost(L.h * 0.9 * k * (1 - come), 0, 1, 1, s * e * 0.35 / k * (1 - come * 0.8));
    a.op *= 1 - 0.6 * s * (1 - come);
  },
  echo(L, s, { t, e }, a) {
    for (let k = 1; k <= 4; k++) {
      const lag = smooth(0.05 * k, 0.4 + 0.05 * k, t);
      a.ghost(-L.h * 0.35 * k * lag, 0, 1, 1, s * e * 0.45 * Math.pow(0.6, k));
    }
  },
  // ── vastness ↔ closeness ──
  constellation(L, s, { t, T, e }, a) {
    const k = s * e;
    const ang = rnd(L.i, 1) * TAU, rad = L.h * (1.5 + 2 * rnd(L.i, 2));
    const tx = L.cx + Math.cos(ang) * rad - (L.x + L.w / 2), ty = Math.sin(ang) * rad * 0.7;
    a.x += tx * k; a.y += ty * k; a.sx *= 1 - 0.45 * k; a.sy *= 1 - 0.45 * k;
    a.ink(COLORS.star, 0.6 * k);
    const twinkle = 0.6 + 0.4 * Math.sin(T * 3 + L.i * 1.7);
    a.dot(L.x + L.w / 2 + tx * k, L.h * 0.5 + ty * k, 3.2 * k, k * twinkle, COLORS.star);
    a.star = [L.x + L.w / 2 + tx * k, L.h * 0.5 + ty * k, k];   // joined into a figure by the renderer
  },
  focus(L, s, { t, e }, a) {
    const k = s * e;
    a.x += (L.cx - (L.x + L.w / 2)) * 0.62 * k; a.sx *= 1 - 0.62 * k; a.sy *= 1 - 0.62 * k; a.y += L.h * 0.3 * k;
    if (L.i === 0) {                                 // the lens
      const r = (L.wordW * 0.3 + 12) * (0.6 + 0.4 * k), cy = L.h * 0.5, N = 40;
      for (let m = 0; m < N; m++) {
        const a0 = m / N * TAU, a1 = (m + 1) / N * TAU;
        a.line(L.cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, L.cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, 0.45 * k, [0.3, 0.3, 0.3]);
      }
    }
  },
  // ── certainty ↔ doubt ──
  engrave(L, s, { t, e }, a) {
    const k = s * e;
    a.still = Math.max(a.still, 0.6 * k);
    a.y -= 1.2 * k;                                  // pressed in
    a.ghost(1.6 * k, -1.6 * k, 1, 1, 0.3 * k, [0.45, 0.42, 0.38]);   // hard shadow
    const drawn = smooth(0.15 + 0.5 * L.i / L.n, 0.25 + 0.5 * (L.i + 1) / L.n, t) * e;
    if (drawn > 0) a.line(L.x, -L.h * 0.18, L.x + L.w * drawn, -L.h * 0.18, s * 0.9, [0.1, 0.1, 0.1]);   // ruled underline
  },
  unravel(L, s, { t, T, e }, a) {
    const k = s * e, loose = smooth(0.15 + 0.2 * L.i / L.n, 0.55, t) * (1 - smooth(0.78, 0.96, t));
    a.op *= 1 - 0.75 * s * loose; a.rz += s * loose * 0.2 * (rnd(L.i) - 0.5); a.y -= s * loose * 3;
    const N = 18, len = L.h * 2.2 * s * loose;       // the loose thread
    let px = L.x + L.w * 0.5, py = 0;
    for (let m = 1; m <= N; m++) {
      const f = m / N, nx = L.x + L.w * 0.5 + f * len * 0.8, ny = -f * len * 0.5 + Math.sin(f * 9 + T * 2 + L.i) * 6 * s * loose;
      a.line(px, py, nx, ny, 0.6 * s * loose * (1 - f * 0.5), [0.15, 0.15, 0.15]);
      px = nx; py = ny;
    }
  },
};

export const EFFECT_IDS = Object.keys(FX);
