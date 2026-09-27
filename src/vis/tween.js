// A tiny transition engine standing in for the d3 v3 transitions the original used.
// - cubic-in-out easing (d3 v3's default)
// - "from" values are read when a tween starts, after its delay (like d3's tween factories)
// - a new tween on the same target+channel interrupts the old one (like d3 v3 transitions on one node)
// - one shared clock, so everything can pause, resume and be cancelled together

export const cubicInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const CANCELLED = Symbol("cancelled");

const active = new Set();
const byKey = new WeakMap();                  // target -> Map(channel -> tween)
let clock = 0, last = performance.now(), paused = false;

export const isPaused = () => paused;
export function setPaused(p) { paused = p; }
export const now = () => clock;

function tick(t) {
  const dt = Math.min(100, t - last);          // a background tab should not jump the piece forward
  last = t;
  if (!paused) clock += dt;
  for (const tw of [...active]) step(tw);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function step(tw) {
  if (clock < tw.start) return;
  if (!tw.started) {
    tw.started = true;
    if (tw.target && tw.channel) {
      let m = byKey.get(tw.target);
      if (!m) byKey.set(tw.target, (m = new Map()));
      const prev = m.get(tw.channel);
      if (prev && prev !== tw) finish(prev, true);
      m.set(tw.channel, tw);
    }
    tw.update = tw.init ? tw.init() : null;
  }
  const t = tw.duration > 0 ? Math.min(1, (clock - tw.start) / tw.duration) : 1;
  if (tw.update) tw.update(tw.ease(t));
  if (t >= 1) finish(tw, false);
}

function finish(tw, interrupted) {
  if (!active.has(tw)) return;
  active.delete(tw);
  const m = tw.target && byKey.get(tw.target);
  if (m && m.get(tw.channel) === tw) m.delete(tw.channel);
  tw.resolve(interrupted ? "interrupted" : "end");
}

/** tween({ duration, delay, init: () => (t) => {...}, target, channel }) → Promise that resolves at the end */
export function tween({ duration = 250, delay = 0, init = null, target = null, channel = null, ease = cubicInOut }) {
  return new Promise((resolve, reject) => {
    active.add({ start: clock + Math.max(0, delay), duration: Math.max(0, duration), init, target, channel, ease, resolve, reject, started: false });
  });
}

export const wait = (ms) => tween({ duration: ms });

/** stop everything: pending promises reject with CANCELLED so running sequences unwind */
export function cancelAll() {
  for (const tw of [...active]) { active.delete(tw); tw.reject(CANCELLED); }
}
