import { recording } from "./timeline.js";
// The piece's clock and transitions (standing in for the d3 v3 transitions of the original).
//
// Time is virtual: `clock` advances by (real time × rate), and can be paused, sped up, or jumped.
// It advances event by event: the clock stops at every moment a tween starts or ends, steps all tweens,
// and lets any resolved promises run (their continuations may schedule new tweens) before moving on.
// Normal playback and seeking use the same stepping, so a replay with the same seed makes the same
// decisions in the same order: that is what makes scrubbing possible.
//
// d3 v3 behaviour kept: cubic-in-out easing; "from" values are read when a tween starts (after its
// delay); a new tween on the same target+channel interrupts the old one.

export const cubicInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let active = new Set();
let byKey = new WeakMap();                   // target -> Map(channel -> tween)
let clock = 0;
let seq = 0;

export const now = () => clock;

/** tween({ duration, delay, init: () => (t) => {...}, target, channel, silent }) → Promise (none if silent) */
export function tween({ duration = 250, delay = 0, init = null, target = null, channel = null, ease = cubicInOut, silent = false, meta = null }) {
  const tw = { id: seq++, start: clock + Math.max(0, delay), duration: Math.max(0, duration), init, target, channel, ease, started: false, resolve: null, meta };
  active.add(tw);
  if (silent) return undefined;
  return new Promise((resolve) => { tw.resolve = resolve; });
}
export const wait = (ms) => tween({ duration: ms });

/** forget every pending transition; their promises never settle, so old sequences simply stop */
export function cancelAll() { active = new Set(); byKey = new WeakMap(); }
export function resetClock(t = 0) { cancelAll(); clock = t; }

function finish(tw, how) {
  if (!active.delete(tw)) return false;
  const m = tw.target && byKey.get(tw.target);
  if (m && m.get(tw.channel) === tw) m.delete(tw.channel);
  if (tw.resolve) { tw.resolve(how); return true; }
  return false;
}

/** step every tween to the current clock; returns true if any promise was resolved */
function stepAll() {
  let resolved = false;
  for (const tw of [...active]) {
    if (!active.has(tw) || clock < tw.start) continue;
    if (!tw.started) {
      tw.started = true;
      if (tw.target && tw.channel) {
        let m = byKey.get(tw.target);
        if (!m) byKey.set(tw.target, (m = new Map()));
        const prev = m.get(tw.channel);
        if (prev && prev !== tw && prev.id > tw.id) {
          // d3 v3: a transition scheduled earlier never overrides a newer one that is already running
          // (matters with long letter staggers: a delayed fade-in must not start after the fade-out)
          resolved = finish(tw, "interrupted") || resolved;
          continue;
        }
        if (prev && prev !== tw) resolved = finish(prev, "interrupted") || resolved;
        m.set(tw.channel, tw);
      }
      tw.update = tw.init ? tw.init() : null;
      const rec = recording();
      if (rec && tw.update && tw.target && tw.channel) rec.segment(tw);
    }
    // compare against the same end time nextEvent() uses: computing the fraction first can leave a tween at
    // 0.9999999 exactly at its end (fractional durations, e.g. a 46 ms stagger × 0.9), and it never finishes
    const t = clock >= tw.start + tw.duration ? 1 : (clock - tw.start) / tw.duration;
    if (tw.update) tw.update(tw.ease(t));
    if (t >= 1) resolved = finish(tw, "end") || resolved;
  }
  return resolved;
}

function nextEvent() {
  let n = Infinity;
  for (const tw of active) { const e = tw.started ? tw.start + tw.duration : tw.start; if (e < n) n = e; }
  return n;
}

// a macrotask boundary: every pending promise continuation has run by the time it fires
const mc = new MessageChannel();
const queue = [];
mc.port1.onmessage = () => queue.shift()();
const settle = () => new Promise((r) => { queue.push(r); mc.port2.postMessage(0); });

let busy = null;
/** advance the clock to T, visiting every event on the way (serialised: one advance at a time) */
export function advanceTo(T) {
  const run = async () => {
    // every step either starts or finishes at least one tween, so this always makes progress;
    // tweens created while stepping (e.g. inside an init) that are due now are simply picked up next time round
    for (let guard = 0; guard < 1e7; guard++) {
      const n = nextEvent();
      if (n > T) break;
      if (n > clock) clock = n;
      if (stepAll()) await settle();
    }
    if (T > clock) clock = T;
    if (stepAll()) await settle();
  };
  busy = (busy || Promise.resolve()).then(run);
  return busy;
}
export const idle = () => busy || Promise.resolve();
