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
  ember: [0.80, 0.27, 0.05], ice: [0.45, 0.64, 0.80], rose: [0.74, 0.30, 0.44], grey: [0.55, 0.53, 0.5],
  tear: [0.24, 0.38, 0.62], gold: [0.82, 0.58, 0.08], star: [0.25, 0.28, 0.62], sky: [0.35, 0.58, 0.82],
  deep: [0.10, 0.16, 0.36], sage: [0.36, 0.55, 0.40], violet: [0.46, 0.27, 0.60], crimson: [0.70, 0.08, 0.18],
  mist: [0.62, 0.60, 0.72], ochre: [0.72, 0.52, 0.18], blood: [0.55, 0.06, 0.08], coral: [0.88, 0.45, 0.35],
  slate: [0.36, 0.44, 0.52], teal: [0.10, 0.52, 0.55], sepia: [0.50, 0.36, 0.22], umber: [0.30, 0.20, 0.12],
  dusk: [0.52, 0.40, 0.50], moss: [0.30, 0.42, 0.22], storm: [0.30, 0.38, 0.46], drum: [0.52, 0.16, 0.10],
  bronze: [0.68, 0.48, 0.20],
};
// Effects draw only letters (and copies of letters) and soft dots: no hairlines or shapes.

export const FX = {
  // ── joy ↔ sorrow ──
  bounce(L, s, { t, T, e }, a) {
    const ph = T * 2.2 - L.i * 0.12;
    const hop = Math.abs(Math.sin(ph * Math.PI));
    a.y += s * e * L.h * 0.55 * hop;
    const squash = s * e * 0.18 * Math.max(0, 1 - hop * 4);   // squash on landing
    a.sx *= 1 + squash; a.sy *= 1 - squash;
    a.ink(COLORS.gold, 0.8 * s * e);
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
    a.ink(COLORS.sky, 0.75 * s * e);
  },
  sink(L, s, { t, T, e }, a) {
    const d = smooth(L.i / L.n * 0.3, 0.55 + L.i / L.n * 0.3, t) * e;
    a.y -= s * d * L.h * 1.1; a.rz += s * d * 0.08 * (rnd(L.i, 2) - 0.5);
    a.x += s * d * Math.sin(T * 3 + L.i) * 1.5;      // refracted wobble
    a.op *= 1 - 0.4 * s * d;
    a.ink(COLORS.deep, 0.85 * s * e);
    a.ghost(0, -L.h * 1.9 * d * s, 1, -0.6, 0.12 * s * d, COLORS.deep);   // a dim reflection below
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
    for (let k = 0; k < 7; k++)                      // frost: pale specks settling on the strokes
      a.dot(L.x + L.w * rnd(L.i, k, 4), L.h * rnd(L.i, k, 6), 1.2 + 1.6 * rnd(L.i, k, 8), 0.8 * grow, [0.85, 0.92, 1.0]);
    a.ghost(0, 0, 1.04, 1.04, 0.25 * grow, [0.8, 0.9, 1.0]);   // a pale rime around the letter
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
    a.ink(COLORS.mist, 0.85 * w);
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
    a.ink(COLORS.crimson, s * e * (0.35 + 0.55 * beat));
    a.ghost(0, 0, 1.18, 1.18, 0.18 * s * e * beat, COLORS.crimson);
  },
  evaporate(L, s, { t, e }, a) {
    const v = s * smooth(0.1 + 0.3 * L.i / L.n, 0.7, t) * (1 - smooth(0.82, 1, t));
    a.y += v * L.h * 1.3; a.op *= 1 - 0.85 * v;
    a.ink(COLORS.mist, 0.9 * v);
    for (let k = 1; k <= 4; k++) a.ghost(0, -k * 3 * v, 1 + 0.05 * k * v, 1 + 0.08 * k * v, 0.22 * v);   // a soft trail below
  },
  // ── calm ↔ fear ──
  drift(L, s, { T, e }, a) {
    const d = s * e;
    a.x += Math.sin(T * 0.7 + rnd(L.i, 1) * TAU) * L.h * 0.35 * d;
    a.y += Math.cos(T * 0.55 + rnd(L.i, 2) * TAU) * L.h * 0.3 * d;
    a.rz += Math.sin(T * 0.5 + rnd(L.i, 3) * TAU) * 0.12 * d;
    a.ink(COLORS.sage, 0.7 * d);
  },
  tremble(L, s, { T, e }, a) {
    const d = s * e;
    a.x += wob(L.i, 1, T, 13) * 1.8 * d + wob(L.i, 4, T, 23) * 0.8 * d;
    a.y += wob(L.i, 2, T, 17) * 1.8 * d;
    a.rz += wob(L.i, 3, T, 11) * 0.05 * d;
    a.ink(COLORS.violet, 0.7 * d);
  },
  // ── slow ↔ sudden ──
  stretch(L, s, { t, e }, a) {
    const pull = s * e * smooth(0.1, 0.55, t);
    const off = (L.i - (L.n - 1) / 2) * L.h * 0.55 * pull;
    a.x += off; a.sx *= 1 + 0.3 * pull; a.sy *= 1 - 0.12 * pull;
    a.ink(COLORS.ochre, 0.75 * s * e);
  },
  shatter(L, s, { t }, a) {
    const hit = 0.18, back = 0.72;
    const out = t < hit ? 0 : t < back ? 1 - Math.pow(1 - smooth(hit, hit + 0.12, t), 3) : 1 - smooth(back, 0.95, t);
    const ang = Math.atan2(L.h * 0.5, L.x + L.w / 2 - L.cx) + (rnd(L.i, 1) - 0.5) * 1.4;
    const dist = s * out * L.h * (1.2 + 1.2 * rnd(L.i, 2));
    a.x += Math.cos(ang) * dist * (L.x + L.w / 2 < L.cx ? -1 : 1) * Math.abs(Math.cos(ang)) + (L.x + L.w / 2 - L.cx) * 0.6 * s * out;
    a.y += Math.sin(ang) * dist * 0.8;
    a.rz += s * out * (rnd(L.i, 3) - 0.5) * 2.4;
    a.ink(COLORS.blood, 0.8 * s * Math.min(1, out * 2));
    for (let k = 0; k < 6; k++)                      // chips flung from the break
      a.dot(L.x + L.w * rnd(L.i, k, 7) + (rnd(L.i, k, 8) - 0.5) * 90 * s * out, L.h * rnd(L.i, k, 9) + (rnd(L.i, k, 10) - 0.5) * 90 * s * out,
        1.6 + 2 * rnd(L.i, k, 11), 0.8 * s * out, COLORS.blood);
  },
  // ── together ↔ apart ──
  attract(L, s, { t, e }, a) {
    const k = s * e * smooth(0.1, 0.5, t);
    a.x += (L.cx - (L.x + L.w / 2)) * 0.55 * k;
    a.sx *= 1 - 0.1 * k; a.rz += (L.cx - (L.x + L.w / 2)) * 0.0015 * k;
    a.ink(COLORS.coral, 0.75 * s * e);
  },
  repel(L, s, { t, e }, a) {
    const k = s * e * smooth(0.1, 0.5, t), d = (L.x + L.w / 2 - L.cx);
    a.x += d * 0.9 * k + Math.sign(d || 1) * L.h * 0.3 * k;
    a.y += (rnd(L.i, 5) - 0.5) * L.h * 0.5 * k; a.rz += Math.sign(d || 1) * 0.15 * k;
    a.ink(COLORS.slate, 0.75 * s * e);
  },
  // ── future ↔ memory ──
  foreshadow(L, s, { t, e }, a) {
    const come = smooth(0, 0.55, t);
    for (let k = 1; k <= 3; k++) a.ghost(L.h * 0.9 * k * (1 - come), 0, 1, 1, s * e * 0.35 / k * (1 - come * 0.8), COLORS.teal);
    a.op *= 1 - 0.6 * s * (1 - come);
    a.ink(COLORS.teal, 0.7 * s * e);
  },
  echo(L, s, { t, e }, a) {
    for (let k = 1; k <= 4; k++) {
      const lag = smooth(0.05 * k, 0.4 + 0.05 * k, t);
      a.ghost(-L.h * 0.35 * k * lag, 0, 1, 1, s * e * 0.45 * Math.pow(0.6, k), COLORS.sepia);
    }
    a.ink(COLORS.sepia, 0.6 * s * e);
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
    for (let m = 0; m < 3; m++)                      // a few faint far stars around each letter
      a.dot(L.x + L.w / 2 + tx * k + (rnd(L.i, m, 21) - 0.5) * L.h * 2 * k, L.h * 0.5 + ty * k + (rnd(L.i, m, 22) - 0.5) * L.h * 1.4 * k,
        1.2 + 1.4 * rnd(L.i, m, 23), k * 0.6 * (0.5 + 0.5 * Math.sin(T * 2.3 + m + L.i)), COLORS.star);
  },
  focus(L, s, { t, e }, a) {
    const k = s * e;
    a.x += (L.cx - (L.x + L.w / 2)) * 0.62 * k; a.sx *= 1 - 0.62 * k; a.sy *= 1 - 0.62 * k; a.y += L.h * 0.3 * k;
    a.ink(COLORS.moss, 0.7 * k);
    a.ghost(0, 0, 2.8, 2.8, 0.07 * k, COLORS.moss);   // the magnified letter, faint behind: as through a lens
  },
  // ── certainty ↔ doubt ──
  engrave(L, s, { t, e }, a) {
    const k = s * e;
    a.still = Math.max(a.still, 0.6 * k);
    a.y -= 1.2 * k;                                  // pressed in
    const set = smooth(0.1 + 0.5 * L.i / L.n, 0.2 + 0.5 * (L.i + 1) / L.n, t);   // letters set one by one, like type
    a.ghost(1.8 * k * set, -1.8 * k * set, 1, 1, 0.35 * k * set, [0.45, 0.42, 0.38]);   // hard shadow
    for (let m = 0; m < 4; m++) a.ghost(Math.cos(m * TAU / 4) * 0.7 * k * set, Math.sin(m * TAU / 4) * 0.7 * k * set, 1, 1, set * k);   // a little weight
    a.ink(COLORS.umber, 0.8 * k * set);
  },
  unravel(L, s, { t, T, e }, a) {
    const k = s * e, loose = smooth(0.15 + 0.2 * L.i / L.n, 0.55, t) * (1 - smooth(0.78, 0.96, t));
    a.op *= 1 - 0.55 * s * loose; a.rz += s * loose * 0.35 * (rnd(L.i) - 0.5); a.y -= s * loose * 4;
    a.x += s * loose * (rnd(L.i, 4) - 0.5) * L.h * 0.4;
    for (let m = 1; m <= 5; m++)                     // the letter frays: copies slipping loose, down and away
      a.ghost(m * 3 * s * loose, -m * 5 * s * loose + Math.sin(T * 2 + m + L.i) * 2 * s * loose, 1, 1, 0.18 * s * loose * (1 - m / 6), COLORS.dusk);
    a.ink(COLORS.dusk, 0.8 * k);
  },
  // ── gust ↔ rest ──
  gust(L, s, { t, T, e }, a) {
    const k = s * e;
    const g = 0.5 + 0.5 * Math.sin(T * 1.7 + L.i * 0.35) * (0.6 + 0.4 * Math.sin(T * 4.1 + L.i));   // gusting, uneven
    const blow = k * g * (0.4 + 0.6 * L.i / Math.max(1, L.n - 1));                                   // later letters blown further
    a.x += blow * L.h * 1.1; a.y += Math.sin(T * 3 + L.i * 1.3) * L.h * 0.25 * k;
    a.rz -= blow * (0.6 + 1.6 * rnd(L.i, 1)) * (rnd(L.i, 2) < 0.3 ? 2.5 : 1);                          // some tumble over
    a.sx *= 1 + 0.12 * blow; a.sy *= 1 - 0.08 * blow;
    a.ink(COLORS.storm, 0.75 * k);
    for (let m = 0; m < 3; m++) {                    // spray blown off ahead of the letter
      const ph = ((T * 0.9 + rnd(L.i, m, 30)) % 1);
      a.dot(L.x + L.w + ph * L.h * 3 * k, L.h * (0.2 + 0.6 * rnd(L.i, m, 31)) + Math.sin(ph * 5) * 6, 1.3, 0.5 * k * (1 - ph), COLORS.storm);
    }
  },
  settle(L, s, { t, T, e }, a) {
    const k = s * e;
    const land = smooth(0.05 + 0.25 * L.i / L.n, 0.45 + 0.25 * L.i / L.n, t);
    const drop = (1 - land) * L.h * 0.5 * s;          // each letter lowers gently into place …
    a.y += drop + Math.sin(land * Math.PI) * 2 * s;  // … with the smallest overshoot
    a.still = Math.max(a.still, 0.9 * k * land);     // then nothing moves
    a.op *= 1 - 0.3 * s * (1 - land);
    a.ink(COLORS.sepia, 0.55 * k);
  },
  // ── percussion ↔ resonance ──
  beat(L, s, { T, e }, a) {
    const k = s * e;
    const period = 0.62, ph = (T % period) / period;             // a steady footfall / drum
    const side = L.i % 2;                                        // alternate letters: left foot, right foot
    const phase = (ph + side * 0.5) % 1;
    const up = phase < 0.35 ? Math.sin(phase / 0.35 * Math.PI) : 0;
    const impact = phase >= 0.35 && phase < 0.5 ? 1 - (phase - 0.35) / 0.15 : 0;
    a.y += up * L.h * 0.28 * k - impact * L.h * 0.05 * k;
    a.sx *= 1 + impact * 0.14 * k; a.sy *= 1 - impact * 0.16 * k;
    a.ink(COLORS.drum, 0.8 * k);
    if (impact > 0) for (let m = 0; m < 3; m++)                  // a puff where it lands
      a.dot(L.x + L.w * (0.2 + 0.6 * rnd(L.i, m, 40)) + (rnd(L.i, m, 41) - 0.5) * 18 * (1 - impact), -2 - (1 - impact) * 6,
        1.5 + 1.5 * rnd(L.i, m, 42), 0.6 * k * impact, COLORS.umber);
  },
  ring(L, s, { T, e }, a) {
    const k = s * e;
    const period = 1.8;
    for (let m = 0; m < 3; m++) {                                // resonance spreading outward: the letter itself, larger and fainter
      const ph = ((T + m * period / 3) % period) / period;
      a.ghost(0, 0, 1 + ph * 0.9, 1 + ph * 0.9, 0.3 * k * (1 - ph), COLORS.bronze);
    }
    a.x += Math.sin(T * 40 + L.i) * 0.5 * k;                     // the hum
    a.ink(COLORS.bronze, 0.8 * k);
  },
};

export const EFFECT_IDS = Object.keys(FX);
