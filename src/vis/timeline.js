// Record a performance once, then show any moment of it instantly.
//
// While recording, two things are logged against the piece's clock:
//   - every transition as it starts: its target, channel, start time, duration, easing, and the update
//     function it built (which already holds its "from" and "to" values)
//   - every time an object joins or leaves a parent (Object3D.add / remove are wrapped for this)
// The frame at time T is then a pure function of T: show exactly the objects that were attached at T,
// and for every animated channel apply the latest transition that had started by T, at its progress then.
// Scrubbing is O(objects) per frame, in any direction, with no simulation.
import * as THREE from "three";

const origAdd = THREE.Object3D.prototype.add;
const origRemove = THREE.Object3D.prototype.remove;
let active = null;
let clockFn = () => 0;

THREE.Object3D.prototype.add = function (...objs) {
  if (objs.length !== 1) { for (const o of objs) this.add(o); return this; }
  const o = objs[0];
  origAdd.call(this, o);
  if (active && o.parent === this) active.link(o, this, clockFn());
  return this;
};
THREE.Object3D.prototype.remove = function (...objs) {
  if (objs.length !== 1) { for (const o of objs) this.remove(o); return this; }
  const o = objs[0], was = o.parent === this;
  origRemove.call(this, o);
  if (active && was) active.unlink(o, this, clockFn());
  return this;
};

export const recording = () => active;
export function startRecording(nowFn) { clockFn = nowFn; active = new Recording(); return active; }
export function stopRecording() { const r = active; active = null; r.finish(); return r; }

class Recording {
  constructor() { this.links = new Map(); this.tracks = new Map(); }

  link(child, parent, t) {
    let a = this.links.get(child);
    if (!a) this.links.set(child, (a = []));
    a.push({ parent, from: t, to: Infinity });
  }
  unlink(child, parent, t) {
    const a = this.links.get(child);
    if (!a) return;
    for (let i = a.length - 1; i >= 0; i--) if (a[i].parent === parent && a[i].to === Infinity) { a[i].to = t; break; }
  }
  /** called by the tween engine when a transition starts */
  segment(tw) {
    let m = this.tracks.get(tw.target);
    if (!m) this.tracks.set(tw.target, (m = new Map()));
    let s = m.get(tw.channel);
    if (!s) m.set(tw.channel, (s = []));
    s.push({ start: tw.start, dur: tw.duration, ease: tw.ease, update: tw.update });
  }

  finish() {
    this.linkList = [];
    for (const [c, a] of this.links) { const f = a.filter((x) => x.to > x.from); if (f.length) this.linkList.push([c, f]); }
    this.trackList = [];
    for (const [target, m] of this.tracks) for (const [channel, segs] of m) this.trackList.push({ target, channel, segs });
  }

  /** put the scene exactly as it was at time T */
  applyAt(T, initial) {
    for (const [c, ivs] of this.linkList) {
      let iv = null;
      for (const x of ivs) if (x.from <= T && T < x.to) { iv = x; break; }
      if (iv) { if (c.parent !== iv.parent) origAdd.call(iv.parent, c); c.visible = true; }
      else c.visible = false;
    }
    for (const tr of this.trackList) {
      const s = tr.segs;
      let lo = 0, hi = s.length - 1, k = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (s[mid].start <= T) { k = mid; lo = mid + 1; } else hi = mid - 1; }
      if (k < 0) { initial(tr.target, tr.channel); continue; }
      const g = s[k];
      const t = g.dur > 0 ? Math.min(1, Math.max(0, (T - g.start) / g.dur)) : 1;
      g.update(g.ease(t));
    }
  }
}
