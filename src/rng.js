// Seeded randomness for everything that shapes a performance (corpus choices, layout jitter),
// so a run can be replayed exactly: seeking backwards = reset the seed, rebuild, fast-forward.
// three.js keeps using Math.random for its own ids; that never affects what is shown.
let s = 1;
export let seed = 1;
export function reseed(v) { seed = v >>> 0 || 1; s = seed; }
export function rand() {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
