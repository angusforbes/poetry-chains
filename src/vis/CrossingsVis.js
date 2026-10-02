// Crossings (2026, not in the 2015 piece): Howe × Lines. A line is written across; one of its words is
// chosen, and a different line that holds the same word is written through it, down, as a list of its
// words (one word per row, with room above and below). Then a word of that list is chosen and a line
// runs across through it, and so on: a crossword that is not clean. Lines stay and may overlap; the rows
// of a list wobble a little, and each crossing is slightly off register, so a shared word prints twice.
// The camera stays still on a page; the choice of word and line prefers words that lead somewhere new
// and placements that keep to the page.
//
// Every decision is made from the layout at 100% leading and 0% tracking (_p0) and from character
// counts, never from the live tracking or leading: the hidden variant recordings (live tracking and
// leading in main.js) must make exactly the same choices.
import * as THREE from "three";
import { rand } from "../rng.js";
import { Vis } from "./Stage.js";
import { P } from "../params.js";
import { tween, wait, now } from "./tween.js";
import { seed } from "../rng.js";
import { ViewControls } from "./ViewControls.js";

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ADV = 0.45;          // an average letter advance, in ems, for estimating where a line would reach

const Z = new THREE.Vector3(0, 0, 1), DEG = Math.PI / 180;
const Xa = new THREE.Vector3(1, 0, 0), Ya = new THREE.Vector3(0, 1, 0);
const TURN = new THREE.Quaternion().setFromAxisAngle(Ya, Math.PI);   // a line's front faces its own -z: a camera facing it is turned half round
const sineInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);
/** a second, independent stream of randomness (mulberry32), so 3D adds nothing to the flat piece's draws */
const stream = (k) => { let s = k >>> 0 || 1; return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export class CrossingsVis extends Vis {
  /** turn(): ± degrees each new line may turn from the line it crosses (0: across and down only).
   *  Crossings (Howe) uses it: turns add up, so later lines can stand at steep angles. */
  /** fade(): Crossings (Howe)'s settings for "one stays, the rest fade" (null: every new line stays) */
  /** depth(): Crossings in 3D: its settings (null: flat). See the 3D section at the end. */
  constructor(stage, { turn = () => 0, colour = null, fade = null, depth = null } = {}) {
    super(stage); this.turn = turn; this.colour = colour; this.fade = fade; this.depth = depth; this.inks = [];
    if (depth) stage.drawHooks.push((scene, cam) => this.drawHook(scene, cam));
  }

  /** Tone (Crossings (Howe)): every line gets its own black or grey (tone 0 = black .. 1 = the lightest
   *  grey setting) and its own hue, a turn of the colour wheel from the line it crosses; "colour" mixes
   *  from the grey toward that hue (0% by default: blacks and greys only). All applied live. */
  tint(obj, hue, tone, end = null, role = null) {
    if (!this.colour) return;
    const c = new THREE.Color();
    this.inks.push({ c, hue, tone, end, obj, role });            // role: "stay" or "fade" (fading on)                    // end: "first" or "last" line of its crossing
    this.recolour(this.inks.at(-1));
    for (const m of obj.children) if (m.isMesh) {
      m.material.color = c;
      // a light line can be light by transparency: its letters are drawn at obj._alpha × their opacity
      // (applied only while drawing, so fades, scrubbing and the live settings are untouched)
      m.onBeforeRender = () => { m._raw = m.material.opacity; m.material.opacity *= obj._alpha ?? 1; };
      m.onAfterRender = () => { m.material.opacity = m._raw; };
    }
    obj._hue = hue;
  }
  recolour(one) {
    const K = this.colour(), ink = new THREE.Color(P.look.textColor), hue = new THREE.Color();
    for (const x of one ? [one] : this.inks) {
      // in greys, the first and last line of a crossing can be kept black (the ink colour)
      const black = !K.colourOn && ((x.end === "first" && K.firstBlack) || (x.end === "last" && K.lastBlack));
      // two tones: a share of lines in the lightest grey, the rest black; otherwise any grey up to it
      let tone = K.twoTone ? (x.tone < K.greyShare / 100 ? 1 : 0) : x.tone;
      if (K.roleTone && x.role) tone = x.role === "fade" ? 1 : 0;   // lines that stay dark, fading lines light
      const light = black ? 0 : tone;                              // 0 = black .. 1 = the lightest
      x.obj._alpha = 1;
      if (K.byAlpha && !K.colourOn) {                              // in the ink colour, see-through
        x.c.copy(ink);
        x.obj._alpha = 1 - light * (1 - K.greyAlpha / 100);
        continue;
      }
      x.c.copy(ink).lerp(new THREE.Color(1, 1, 1), light * K.greyest / 100);   // its black or grey (shade)
      if (!K.colourOn) continue;
      hue.setHSL(x.hue, K.saturation / 100, K.lightness / 100, THREE.SRGBColorSpace);
      x.c.lerp(hue, K.amount / 100);
      x.obj._alpha = K.colourAlpha / 100;                           // colours are a little see-through too
    }
  }
  async start({ corpus }) {
    const C = P.crossings, em = P.look.fontSize;
    const D = this.depth ? this.depth() : null;
    this.running = !!D;
    this.parent = this.getParentObject();
    // 3D: each line's swing out of the page comes from its own stream (seeded by the run's seed and this
    // crossing's start), so the flat choices are exactly those of the flat piece with the same seed
    const tilt = D ? stream(seed * 7919 + Math.round(now())) : null;
    const follow = C.follow && !D;
    // Spacing is drawn afresh for every line and kept for the whole of it: the rows of a down list, the
    // spaces between the words of a line across. Mostly cramped (overlapping at the tight end), otherwise
    // from normal up to the widest (at most twice normal).
    const factor = (tight) => rand() < C.cramped / 100 ? tight + rand() * (1 - tight) : 1 + rand() * (C.widest / 100 - 1);
    const drawRows = () => P.look.lineHeight * factor(C.rowTight / 100);
    const drawWords = () => factor(C.wordTight / 100);
    const aspect = this.camera.aspect || 1.6;
    const halfW = C.pageWidth / 2, halfH = C.pageWidth / aspect / 2;

    // still camera: it frames the page once and stays there (following: see follow())
    const s = this.scaleText, page = new THREE.Box3(new THREE.Vector3(-halfW * s, -halfH * s, 0), new THREE.Vector3(halfW * s, halfH * s, 0));
    if (!C.follow && !D) await this.fitTo(page, (b) => this.getZoomDistanceFromBox(b, this.scaleOf()), 10);

    const shown = new Set(), used = new Set(), placed = [];
    const skip = (w) => !w || !w.word || w.word === "—" || w.rank <= C.skipCommon || w.word.length < C.minLetters;

    // the first line, across, somewhere near the middle
    const seedWord = C.seed.trim().toLowerCase() && corpus.words.get(C.seed.trim().toLowerCase());
    const pool = seedWord ? [...new Set(seedWord.lines)] : corpus.lines;
    // a first line with at least one word that leads to another line
    const leads = (l) => l.words.some((w) => !skip(w) && new Set(w.lines).size > 1);
    let line0 = pool[Math.floor(rand() * pool.length)];
    for (let k = 0; k < 50 && !leads(line0); k++) line0 = pool[Math.floor(rand() * pool.length)];
    const w0space = drawWords();                                    // drawn either way, so runs stay the same
    const obj0 = this.makeLine(line0, false, 0, C.firstPlain ? 1 : w0space);   // the first line: proper spacing
    if (this.colour) this.tint(obj0, rand(), rand(), "first", this.fade && this.fade().fading ? "stay" : null);
    const w0 = line0.text.length * ADV * em;
    this.place(obj0, new THREE.Vector3(w0 / 2 + (rand() - 0.5) * halfW * 0.4, (rand() - 0.5) * halfH * 0.6, 0));
    shown.add(line0);
    obj0._rot = 0;
    if (follow) { this.parent.add(obj0); this.follow([obj0], obj0, 10); }
    if (D) this.faceLine(obj0, 10);
    await this.inkIn(obj0, placed, null, 1);
    const centres = [{ x: -obj0._f0.x + w0 / 2, y: obj0._f0.y }];  // where each line sits (screen x, text units)

    // Growth: as soon as a line is written, it sets off 1..3 new lines (from different words of it, or
    // twice through the same word), until the crossing has C.maxLines lines. Each new line starts after its own
    // delay and is written at its own pace, so they begin and end at different times.
    // One stays, the rest fade (Crossings (Howe), a switch): of the new lines a line sets off, the first
    // stays and grows on; the others are written, fade away over their own time (e.g. 5..20 s) and set off
    // nothing. Only the lines that stay count toward the crossing's lines.
    const F = this.fade && this.fade().fading ? this.fade() : null;
    const fading = [];                                              // fading lines still on the page
    this.cam = { busy: null, moving: false, dirty: false, last: null, lines: () => [...placed.filter(Boolean), ...fading] };
    const grow = async (from, depth) => {
      const births = [];
      const [lo, hi] = F ? [F.branchMin, F.branchMax] : [C.branchMin, C.branchMax];
      const count = lo + Math.floor(rand() * (hi - lo + 1));
      for (let b = 0; b < count && (b > 0 && F || placed.length < C.maxLines); b++) {
        const rowStep = drawRows();
        const pick = this.choose(corpus, from.line, from.obj, from.across, from.arrived, { shown, used, skip, rowStep, halfW, halfH, em, centres });
        if (!pick) break;
        shown.add(pick.next);
        centres.push(pick.centre);
        if (F && b > 0) {                                           // fading lines lead nowhere: they use up no words
          births.push({ pick, rowStep, fades: F.fadeMin + rand() * (F.fadeMax - F.fadeMin) });
          continue;
        }
        used.add(pick.word);
        placed.push(null);                                          // its place in the count, until it is added
        births.push({ pick, rowStep, last: placed.length === C.maxLines });   // the line that fills the crossing
      }
      // the crossing waits for the lines that stay; fading lines go on in their own time (and are cleared
      // with everything else at the end, however far their fade has got)
      const jobs = births.map(async ({ pick, rowStep, last, fades }) => {
        const { word } = pick;
        const nobj = this.makeLine(pick.next, from.across, rowStep, drawWords());   // across → down, down → across
        nobj._rot = pick.rot;
        // the new line's copy of the word on the old one's, a little off register (each turned with its line)
        const a = this.wordAnchor(from.obj, word.word), b = this.wordAnchor(nobj, word.word);
        const ra = from.obj._rot, rb = pick.rot;
        const mis = C.misregister;
        const off = new THREE.Vector3((rand() - 0.5) * 2 * mis, (rand() - 0.5) * 2 * mis, 0);
        // the flat layout (where the flat piece would put it): the choices are made from that, in 3D too
        nobj._f0 = from.obj._f0.clone().add(a.p0.clone().applyAxisAngle(Z, ra)).sub(b.p0.clone().applyAxisAngle(Z, rb)).add(off);
        if (!D) {
          nobj.rotation.z = pick.rot;
          for (const k of ["pos", "p0"]) { a[k].applyAxisAngle(Z, ra); b[k].applyAxisAngle(Z, rb); }
          nobj.position.copy(from.obj.position).add(a.pos).sub(b.pos).add(off.clone().multiply(new THREE.Vector3(1, P.look.leading, 1)));
          nobj._p0 = nobj._f0.clone();
        } else {
          // 3D: the same turn within the crossed line's plane, then a swing out of it about the new line's
          // other axis (a list, running down, swings about its across axis; a line across about its up axis),
          // so the line leaves the page. Turns and swings add up from line to line, as a mobile's arms do.
          const swing = (tilt() * 2 - 1) * D.tilt * DEG;
          const q = from.obj.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Z, rb - ra))
            .multiply(new THREE.Quaternion().setFromAxisAngle(from.across ? Xa : Ya, swing));
          nobj.quaternion.copy(q);
          nobj._pivot = b.pos.clone();                              // where it crosses (for lines that turn to face you)
          for (const k of ["pos", "p0"]) { a[k].applyQuaternion(from.obj.quaternion); b[k].applyQuaternion(q); }
          const offQ = off.clone().applyQuaternion(from.obj.quaternion);
          nobj.position.copy(from.obj.position).add(a.pos).sub(b.pos).add(offQ.clone().multiply(new THREE.Vector3(1, P.look.leading, 1)));
          nobj._p0 = from.obj._p0.clone().add(a.p0).sub(b.p0).add(offQ);
        }
        // its own pace: around the usual (±paceVary), or, for a share of lines, much slower
        let pace = Math.pow(2, (rand() * 2 - 1) * Math.log2(1 + C.paceVary / 100));   // e.g. ±60%: ×0.63 .. ×1.6
        const slow = rand() < C.slowShare / 100, u = rand();
        if (slow) pace = C.slowest / 100 + u * (0.6 - C.slowest / 100);     // e.g. ×0.2 .. ×0.6
        let delay = C.stepHold + rand() * C.startSpread;
        if (F) {                                                    // fading on: lines that stay come sooner and quicker,
          const v = rand();                                         // fading lines come later and slower
          if (fades) pace = F.fadePaceMin / 100 + v * (F.fadePaceMax - F.fadePaceMin) / 100;
          else { pace = F.mainPaceMin / 100 + v * (F.mainPaceMax - F.mainPaceMin) / 100; delay = F.mainPause + rand() * F.mainSpread; }
        }
        if (this.colour) this.tint(nobj, (from.obj._hue + 1 / 6 + rand() * 2 / 3) % 1, rand(), last ? "last" : null, F ? (fades ? "fade" : "stay") : null);   // hue 60°..300° from its parent
        const t = { line: pick.next, obj: nobj, across: !from.across, arrived: word };
        if (fades) {                                                // written, then fades away, and is gone
          await this.wait(delay);
          await this.inkIn(nobj, fading, word.word, pace);
          if (follow) this.lineDone(nobj);
          await this.fadeOut(nobj, fades);
          if (fading.includes(nobj)) fading.splice(fading.indexOf(nobj), 1);
          if (nobj.parent) nobj.parent.remove(nobj);
          return;
        }
        trail.push(t);
        // 3D: the camera turns to face it as it begins (and, a setting, the writing waits until it has)
        const facing = D ? this.faceLine(nobj, D.camMove) : null;
        await (D && D.waitCam ? Promise.all([this.wait(delay), facing]) : this.wait(delay));
        placed.splice(placed.indexOf(null), 1);
        if (C.olderInk < 100) this.fadeAll(placed.filter(Boolean), C.olderInk / 100, 1000);
        await this.inkIn(nobj, placed, word.word, pace);
        if (follow) this.lineDone(nobj);
        return grow(t, depth + 1);
      });
      await Promise.all(jobs.filter((j, i) => !births[i].fades));
    };
    const trail = [{ line: line0, obj: obj0, across: true, arrived: null }];
    // the camera also watches what has been written so far: a slow line can run out of the frame long
    // before it is finished, and the camera moves as soon as written letters are out, not only at ends
    let growing = true;
    const watch = (async () => {
      while (follow && growing) {
        await this.wait(C.camCheck);
        if (growing) this.check();
      }
    })();
    await grow(trail[0], 0);
    // every branch came to a dead end before the crossing was full: grow again from the latest line
    // that still leads somewhere new, until it is full or nothing does
    for (let k = trail.length - 1; placed.length < C.maxLines && k >= 0; k--) {
      const n = placed.length;
      await grow(trail[k], 0);
      if (placed.length > n) k = trail.length;
    }
    growing = false;
    await watch;
    if (follow) { await this.cam.busy; await this.follow(placed.filter(Boolean), null, C.camMove * 1.5); }   // at the end: the whole poem
    if (D) await this.overview(placed.filter(Boolean), D);         // 3D: stand back and walk round it
    await this.wait(C.hold);
    await this.fadeAll(this.parent.children, 0, 2000);
    this.parent.remove(...this.parent.children);
  }

  /** The camera waits for the writing. When a line has been written, it looks: if any line (written or
   *  being written) is out of the frame, it makes one move to fit them all; while that move lasts, lines
   *  that finish only mark it to look again when the move is over. So lines may run out of the frame for
   *  a while, and the camera never jumps ahead of them. */
  lineDone(obj) { this.cam.last = obj; this.check(); }
  /** look now (or, during a move, as soon as it ends): if any written letter is out of the frame, make
   *  one move that fits every letter written so far (and, of finished lines, the whole line) */
  check() {
    const cam = this.cam;
    cam.dirty = true;
    if (cam.moving) return;
    cam.moving = true;                                             // set before the loop: it may finish at once
    cam.busy = (async () => {
      while (cam.dirty) {
        cam.dirty = false;
        const written = this.written(cam.lines());
        if (written.length && this.outOfFrame(written)) await this.follow(written, cam.last, P.crossings.camMove);
      }
      cam.moving = false;
    })();
  }
  /** what has been written: the letters that are at least half inked */
  written(lines) {
    const out = [];
    for (const l of lines) for (const m of l.children) if (m.isMesh && m.material.opacity >= 0.5) out.push(m);
    return out;
  }
  /** does any glyph of these lines (as laid out now) reach past the frame from where the camera is? */
  outOfFrame(lines) {
    const box = this.liveBox(this.getBBoxFromSubset(this.parent, lines)), v = new THREE.Vector3();
    // the whole view, not just the part a zoomed-in phone shows (the reader's zoom never moves the camera)
    const cam = this.camera.clone();
    cam.clearViewOffset(); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
      v.set(x, y, box.min.z).project(cam);
      if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return true;
    }
    return false;
  }

  /** One camera move: frame every line so far (the poem fills the frame), the centre leaning toward the
   *  line just written. The target is recomputed from the glyphs as they sit now, so tracking, leading,
   *  lens and fill stay live. */
  follow(lines, newest, duration) {
    const all = this.getBBoxFromSubset(this.parent, lines);
    const near = newest ? this.getBBoxFromSubset(this.parent, [newest]) : null;
    const C = P.crossings, v = new THREE.Vector3();
    return this.panCameraToPosition3(() => {
      const A = this.liveBox(all), c = A.getCenter(new THREE.Vector3());
      if (near) c.lerp(this.liveBox(near).getCenter(v), C.lean / 100);
      return new THREE.Vector3(c.x, c.y, c.z + this.getZoomDistanceFromBox(A, this.scaleOf() * (1 - C.lean / 400)));
    }, duration, true);
  }

  place(obj, p0) {
    obj._p0 = p0.clone();
    obj._f0 = p0.clone();
    obj.position.copy(p0);
  }

  /** fade a line out over ms (at tempo 1), its letters a little staggered */
  fadeOut(obj, ms) {
    const letters = obj.children.filter((m) => m.isMesh), dur = ms * this.speed, gap = Math.min(40, (dur * 0.2) / Math.max(1, letters.length));
    letters.forEach((m, i) => tween({ duration: dur, delay: i * gap, target: m, channel: "opacity", silent: true,
      init: () => { const from = m.material.opacity; return (t) => { m.material.opacity = from * (1 - t); }; } }));
    return wait(dur + gap * letters.length);
  }

  /** ink a line in, letter by letter, at pace × the usual speed (the shared word first, then the rest) */
  async inkIn(obj, placed, word, pace) {
    if (obj.parent !== this.parent) this.parent.add(obj);
    placed.push(obj);
    const letters = obj.children;
    if (word) {
      const w = this.getLetterObjectsForWord(obj, word);
      await this.ink(w, pace);
      return this.ink(letters.filter((c) => !w.includes(c)), pace);
    }
    return this.ink(letters, pace);
  }
  ink(array, pace) {
    if (!array.length) return Promise.resolve();
    const k = this.speed / pace, dur = P.look.fadeDuration * k, gap = P.look.letterStagger * k;
    array.forEach((obj, i) => tween({ duration: dur, delay: i * gap, target: obj, channel: "opacity", silent: true,
      init: () => { const from = obj.material.opacity; return (t) => { obj.material.opacity = from + (1 - from) * t; }; } }));
    return wait(dur + gap * (array.length - 1));                    // every letter has finished
  }

  /** a line object. Across: the spaces between its words × words (under 0 the words run into each other).
   *  Down: its words as a list, one per row, rowStep apart, each row a little off the column. */
  makeLine(line, down, rowStep, words = 1) {
    const o = this.getLineObject(line.text);
    o._down = down;
    const C = P.crossings, text = line.text;
    if (!down) {
      // each space's own width (at 0% tracking) stretched or shrunk: a fixed shift, so tracking stays live
      let shift = 0;
      for (let i = 0; i < text.length; i++) {
        const m = o.children[i];
        if (text[i] === " " && i + 1 < text.length) shift += (words - 1) * (Math.abs(o.children[i + 1]._p0.x - m._p0.x));
        else if (shift) { m.position.x -= shift; m._p0.x -= shift; }
      }
      return o;
    }
    let row = -1, start = null, wob = 0;
    for (let i = 0; i < text.length; i++) {
      const m = o.children[i];
      if (text[i] === " ") { start = null; continue; }
      if (start === null) {                                        // a new word: a new row
        row++; start = i; wob = (rand() - 0.5) * 2 * C.wobble;
        o.children[i]._rowStart = { x: m.position.x, x0: m._p0.x };
      }
      const r = o.children[start]._rowStart;
      m.position.x = m.position.x - r.x - wob;
      m._p0.x = m._p0.x - r.x0 - wob;
      m._p0.y = -row * rowStep;
      m.position.y = -row * rowStep * P.look.leading;
    }
    for (let i = 0; i < text.length; i++) if (text[i] === " ") { o.children[i].position.set(0, 0, 0); o.children[i]._p0.set(0, 0, 0); }
    o._rows = row + 1;
    return o;
  }

  /** where a word's first letter sits in its line object: live, and at 100% leading / 0% tracking */
  wordAnchor(obj, word) {
    const i = Math.max(0, this.getWordIndex(obj._line, word)), m = obj.children[i];
    return { pos: m.position.clone(), p0: m._p0.clone() };
  }

  /** the next word (from this line) and line (holding that word): new places first, and on the page */
  choose(corpus, line, obj, across, arrived, { shown, used, skip, rowStep, halfW, halfH, em, centres }) {
    const C = P.crossings, adv = ADV * em;
    const base = obj._f0, rot = obj._rot, t = this.turn();
    // this line's turn, relative to the one it crosses (drawn only when turning, so plain Crossings keeps its runs)
    const nrot = t ? rot + (rand() * 2 - 1) * t * DEG : rot;
    const cs = Math.cos(-nrot), sn = Math.sin(-nrot);               // on screen, x is mirrored: turn the other way
    const seen = new Set();
    let best = null;
    for (const w of line.words) {
      if (skip(w) || used.has(w) || w === arrived || seen.has(w)) continue;
      seen.add(w);
      const fresh = [...new Set(w.lines)].filter((l) => !shown.has(l) && l !== line);
      if (!fresh.length) continue;
      const i = this.getWordIndex(line.text, w.word);
      if (i < 0) continue;
      const anchor = base.clone().add(obj.children[i]._p0.clone().applyAxisAngle(Z, rot));   // 100%/0%; screen right is -x
      const ax = -anchor.x, ay = anchor.y;
      const sample = fresh.length > 8 ? shuffle(fresh.slice()).slice(0, 8) : fresh;
      for (const next of sample) {
        const j = this.getWordIndex(next.text, w.word);
        if (j < 0) continue;
        let x0, x1, y0, y1;                                          // its extent around the shared word, unturned
        if (across) {                                                // next goes down, as a list
          const words = next.text.split(/\s+/).filter(Boolean);
          const r = next.text.slice(0, j).split(/\s+/).filter(Boolean).length;
          x0 = 0; x1 = Math.max(...words.map((x) => x.length)) * adv;
          y1 = r * rowStep; y0 = -(words.length - 1 - r) * rowStep;
        } else {                                                     // next goes across
          x0 = -j * adv; x1 = x0 + next.text.length * adv; y0 = -em * 0.3; y1 = em * 0.7;
        }
        if (nrot) {                                                  // turned: the box around its turned corners
          const xs = [], ys = [];
          for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { xs.push(x * cs - y * sn); ys.push(x * sn + y * cs); }
          x0 = Math.min(...xs); x1 = Math.max(...xs); y0 = Math.min(...ys); y1 = Math.max(...ys);
        }
        x0 += ax; x1 += ax; y0 += ay; y1 += ay;
        // how far this line's middle is from the lines already there (by the nearest): open space scores
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const room = Math.min(...centres.map((c) => Math.hypot((c.x - cx) / halfW, (c.y - cy) / halfH))) / 0.5;
        const over = Math.max(0, -halfW - x0) + Math.max(0, x1 - halfW) + Math.max(0, -halfH - y0) + Math.max(0, y1 - halfH);
        const score = Math.log(1 + Math.min(fresh.length, 4)) * 2     // leads somewhere new (a few ways on is enough)
          - (over / (halfW * 0.25)) * (C.keepOnPage / 25)              // stays on the page
          + Math.min(room, 1) * (C.spread / 10)                        // toward open space
          + rand() * C.chance;                                         // and a little luck
        if (!best || score > best.score) best = { score, word: w, next, rot: nrot, centre: { x: cx, y: cy } };
      }
    }
    return best;
  }

  /* ── 3D (Crossings in 3D) ─────────────────────────────────────────────────────────────────────────
     The lines hang in space like the arms of a mobile: each turns within the plane of the line it
     crosses and swings out of it. The camera turns to face each line that stays as it begins, reading
     it head-on (upright with it, or level), arcing from one to the next and standing back a little on
     the way, so the sculpture shows its depth as it turns; at the end it stands back and walks round
     the whole. Its moves run on their own channel ("camera3": position, turn and how far ahead it
     looks), so recordings and scrubbing replay them exactly. */

  /** a line as it sits now: the middle of its letters (world), its turn, its width and height (world) */
  lineFrame(obj) {
    const box = new THREE.Box3(), b = new THREE.Box3();
    for (const m of obj.children) if (m.isMesh && m.geometry.boundingBox) { m.updateMatrix(); box.union(b.copy(m.geometry.boundingBox).applyMatrix4(m.matrix)); }
    obj.updateMatrix(); this.parent.updateMatrix();
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(this.parent.scale.x);
    const centre = box.getCenter(new THREE.Vector3()).applyMatrix4(obj.matrix).applyMatrix4(this.parent.matrix);
    return { centre, q: obj.quaternion.clone(), w: size.x, h: size.y };
  }
  /** how far back to stand for a w × h rectangle to just fill the frame */
  fitDist(w, h) { const v = THREE.MathUtils.degToRad(this.camera.fov) / 2; return Math.max(w / 2 / Math.tan(this.hFov()), h / 2 / Math.tan(v)); }
  /** the same view direction, turned so the camera is level (its up as near the world's up as it can be) */
  level(q) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), f, Ya));
  }
  /** One camera move: from where it is (and the point it looks at) to goal() = { pivot, q, d }: look at
   *  pivot from d away, turned q. Arcs about the moving pivot; swing: stands back by that share midway. */
  moveCamera(goal, duration, swing = 0, ease) {
    const cam = this.camera;
    return tween({ duration: duration * this.speed, target: cam, channel: "camera3", ease,
      init: () => {
        const d0 = ViewControls.dist(cam), q0 = cam.quaternion.clone();
        const p0 = cam.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(q0).multiplyScalar(d0));
        const g = goal(), q = new THREE.Quaternion(), p = new THREE.Vector3(), back = new THREE.Vector3();
        return (t) => {
          q.slerpQuaternions(q0, g.q, t);
          const d = (d0 + (g.d - d0) * t) * (1 + swing * Math.sin(Math.PI * t));
          p.lerpVectors(p0, g.pivot, t);
          cam.quaternion.copy(q);
          cam.position.copy(p).add(back.set(0, 0, 1).applyQuaternion(q).multiplyScalar(d));
          cam.userData.dist = d;
        };
      } });
  }
  /** turn to face a line head-on (or from the reading angle), near enough that it fills its share of the frame */
  faceLine(obj, duration) {
    const D = this.depth();
    return this.moveCamera(() => {
      const f = this.lineFrame(obj);
      let q = f.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Ya, D.angle * DEG)).multiply(TURN);
      if (!D.roll) q = this.level(q);
      return { pivot: f.centre, q, d: this.fitDist(f.w, f.h) * 100 / D.lineFill };
    }, duration, D.swing / 100);
  }
  /** the end: stand back (level) until the whole sculpture fits, then walk round it about the upright */
  async overview(lines, D) {
    this.parent.updateMatrixWorld(true);
    // every letter's corners; the walk goes round the upright through their middle, so the camera stands
    // back far enough for the widest reach from that upright (any side) and the tallest above or below it
    const pts = [], b = new THREE.Box3(), box = new THREE.Box3();
    for (const l of lines) for (const m of l.children) if (m.isMesh && m.geometry.boundingBox) {
      b.copy(m.geometry.boundingBox);
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) pts.push(new THREE.Vector3(x, y, 0).applyMatrix4(m.matrixWorld));
    }
    if (!pts.length) return;
    box.setFromPoints(pts);
    const c = box.getCenter(new THREE.Vector3());
    let reach = 0, tall = 0;
    for (const q of pts) { reach = Math.max(reach, Math.hypot(q.x - c.x, q.z - c.z)); tall = Math.max(tall, Math.abs(q.y - c.y)); }
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2, h = this.hFov();
    const d = Math.max(reach / Math.sin(h), reach + tall / Math.tan(v)) * 100 / D.endFill;
    const cam = this.camera, sphere = { center: c };
    await this.moveCamera(() => ({ pivot: c, q: this.level(cam.quaternion), d }), D.camMove * 1.5);
    if (!D.endSpin || !D.endSpinTime) return;
    const angle = D.endSpin * DEG;
    await tween({ duration: D.endSpinTime * this.speed, target: cam, channel: "camera3", ease: sineInOut,
      init: () => {
        const q0 = cam.quaternion.clone(), d = ViewControls.dist(cam), c = sphere.center.clone(), qo = new THREE.Quaternion(), back = new THREE.Vector3();
        return (t) => {
          cam.quaternion.copy(qo.setFromAxisAngle(Ya, angle * t)).multiply(q0);
          cam.position.copy(c).add(back.set(0, 0, 1).applyQuaternion(cam.quaternion).multiplyScalar(d));
          cam.userData.dist = d;
        };
      } });
  }
  /** each frame, with the camera as the reader sees it: lines that turn to face the reader (a share, 0 =
   *  a real object), and haze (lines farther than the point the camera looks at grow paler) */
  drawHook(scene, cam) {
    if (!this.running) return;
    const D = this.depth(), par = scene.getObjectByName("parent");
    if (!par) return;
    if (D.haze > 0) {
      const d = ViewControls.dist(cam), h = D.haze / 100;
      this.fog ??= new THREE.Fog(0xffffff, 1, 2);
      this.fog.color.set(P.look.background);
      this.fog.near = d * (1 - 0.4 * h);
      this.fog.far = this.fog.near + d * (0.3 + 6 * (1 - h) * (1 - h));
      scene.fog = this.fog;
    } else scene.fog = null;
    const f = D.facing / 100;
    if (f <= 0) return;
    const undo = [], B = new THREE.Quaternion(), p = new THREE.Vector3();
    for (const o of par.children) {
      if (!o._line || !o.visible) continue;
      const q0 = o.quaternion.clone(), x0 = o.position.clone();
      B.copy(cam.quaternion).multiply(TURN).multiply(new THREE.Quaternion().setFromAxisAngle(Z, o._rot || 0));
      o.quaternion.slerp(B, f);
      if (o._pivot) o.position.add(p.copy(o._pivot).applyQuaternion(q0)).sub(p.copy(o._pivot).applyQuaternion(o.quaternion));
      undo.push(() => { o.quaternion.copy(q0); o.position.copy(x0); });
    }
    return () => undo.forEach((u) => u());
  }
}
