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
import { tween, wait } from "./tween.js";

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ADV = 0.45;          // an average letter advance, in ems, for estimating where a line would reach

const Z = new THREE.Vector3(0, 0, 1), DEG = Math.PI / 180;

export class CrossingsVis extends Vis {
  /** turn(): ± degrees each new line may turn from the line it crosses (0: across and down only).
   *  Crossings (Howe) uses it: turns add up, so later lines can stand at steep angles. */
  constructor(stage, { turn = () => 0, colour = null } = {}) { super(stage); this.turn = turn; this.colour = colour; this.inks = []; }

  /** Tone (Crossings (Howe)): every line gets its own black or grey (tone 0 = black .. 1 = the lightest
   *  grey setting) and its own hue, a turn of the colour wheel from the line it crosses; "colour" mixes
   *  from the grey toward that hue (0% by default: blacks and greys only). All applied live. */
  tint(obj, hue, tone, end = null) {
    if (!this.colour) return;
    const c = new THREE.Color();
    this.inks.push({ c, hue, tone, end });                         // end: "first" or "last" line of its crossing
    this.recolour(this.inks.at(-1));
    for (const m of obj.children) if (m.isMesh) m.material.color = c;
    obj._hue = hue;
  }
  recolour(one) {
    const K = this.colour(), ink = new THREE.Color(P.look.textColor), hue = new THREE.Color();
    for (const x of one ? [one] : this.inks) {
      // in greys, the first and last line of a crossing can be kept black (the ink colour)
      const black = !K.colourOn && ((x.end === "first" && K.firstBlack) || (x.end === "last" && K.lastBlack));
      x.c.copy(ink).lerp(new THREE.Color(1, 1, 1), black ? 0 : x.tone * K.greyest / 100);   // its black or grey
      if (!K.colourOn) continue;
      hue.setHSL(x.hue, K.saturation / 100, K.lightness / 100, THREE.SRGBColorSpace);
      x.c.lerp(hue, K.amount / 100);
    }
  }
  async start({ corpus }) {
    const C = P.crossings, em = P.look.fontSize;
    this.parent = this.getParentObject();
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
    if (!C.follow) await this.fitTo(page, (b) => this.getZoomDistanceFromBox(b, this.scaleOf()), 10);

    const shown = new Set(), used = new Set(), placed = [];
    const skip = (w) => !w || !w.word || w.word === "—" || w.rank <= C.skipCommon || w.word.length < C.minLetters;

    // the first line, across, somewhere near the middle
    const seedWord = C.seed.trim().toLowerCase() && corpus.words.get(C.seed.trim().toLowerCase());
    const pool = seedWord ? [...new Set(seedWord.lines)] : corpus.lines;
    // a first line with at least one word that leads to another line
    const leads = (l) => l.words.some((w) => !skip(w) && new Set(w.lines).size > 1);
    let line0 = pool[Math.floor(rand() * pool.length)];
    for (let k = 0; k < 50 && !leads(line0); k++) line0 = pool[Math.floor(rand() * pool.length)];
    const obj0 = this.makeLine(line0, false, 0, drawWords());
    if (this.colour) this.tint(obj0, rand(), rand(), "first");
    const w0 = line0.text.length * ADV * em;
    this.place(obj0, new THREE.Vector3(w0 / 2 + (rand() - 0.5) * halfW * 0.4, (rand() - 0.5) * halfH * 0.6, 0));
    shown.add(line0);
    if (C.follow) { this.parent.add(obj0); this.follow([obj0], obj0, 10); }
    await this.inkIn(obj0, placed, null, 1);
    const centres = [{ x: -obj0._p0.x + w0 / 2, y: obj0._p0.y }];  // where each line sits (screen x, text units)

    // Growth: as soon as a line is written, it sets off 1..3 new lines (from different words of it, or
    // twice through the same word), until the crossing has C.maxLines lines. Each new line starts after its own
    // delay and is written at its own pace, so they begin and end at different times.
    this.cam = { busy: null, dirty: false, last: null, lines: () => placed.filter(Boolean) };
    const grow = async (from, depth) => {
      const births = [];
      const count = C.branchMin + Math.floor(rand() * (C.branchMax - C.branchMin + 1));
      for (let b = 0; b < count && placed.length < C.maxLines; b++) {
        const rowStep = drawRows();
        const pick = this.choose(corpus, from.line, from.obj, from.across, from.arrived, { shown, used, skip, rowStep, halfW, halfH, em, centres });
        if (!pick) break;
        shown.add(pick.next);
        centres.push(pick.centre);
        used.add(pick.word);
        placed.push(null);                                          // its place in the count, until it is added
        births.push({ pick, rowStep, last: placed.length === C.maxLines });   // the line that fills the crossing
      }
      await Promise.all(births.map(async ({ pick, rowStep, last }) => {
        const { word } = pick;
        const nobj = this.makeLine(pick.next, from.across, rowStep, drawWords());   // across → down, down → across
        nobj.rotation.z = pick.rot;
        // the new line's copy of the word on the old one's, a little off register (each turned with its line)
        const a = this.wordAnchor(from.obj, word.word), b = this.wordAnchor(nobj, word.word);
        const ra = from.obj.rotation.z, rb = pick.rot;
        for (const k of ["pos", "p0"]) { a[k].applyAxisAngle(Z, ra); b[k].applyAxisAngle(Z, rb); }
        const mis = C.misregister;
        const off = new THREE.Vector3((rand() - 0.5) * 2 * mis, (rand() - 0.5) * 2 * mis, 0);
        nobj.position.copy(from.obj.position).add(a.pos).sub(b.pos).add(off.clone().multiply(new THREE.Vector3(1, P.look.leading, 1)));
        nobj._p0 = (from.obj._p0 || from.obj.position).clone().add(a.p0).sub(b.p0).add(off);
        // its own pace: around the usual (±paceVary), or, for a share of lines, much slower
        let pace = Math.pow(2, (rand() * 2 - 1) * Math.log2(1 + C.paceVary / 100));   // e.g. ±60%: ×0.63 .. ×1.6
        const slow = rand() < C.slowShare / 100, u = rand();
        if (slow) pace = C.slowest / 100 + u * (0.6 - C.slowest / 100);     // e.g. ×0.2 .. ×0.6
        const delay = C.stepHold + rand() * C.startSpread;
        if (this.colour) this.tint(nobj, (from.obj._hue + 1 / 6 + rand() * 2 / 3) % 1, rand(), last ? "last" : null);   // hue 60°..300° from its parent
        const t = { line: pick.next, obj: nobj, across: !from.across, arrived: word };
        trail.push(t);
        await this.wait(delay);
        placed.splice(placed.indexOf(null), 1);
        if (C.olderInk < 100) this.fadeAll(placed.filter(Boolean), C.olderInk / 100, 1000);
        await this.inkIn(nobj, placed, word.word, pace);
        if (C.follow) this.lineDone(nobj);
        return grow(t, depth + 1);
      }));
    };
    const trail = [{ line: line0, obj: obj0, across: true, arrived: null }];
    await grow(trail[0], 0);
    // every branch came to a dead end before the crossing was full: grow again from the latest line
    // that still leads somewhere new, until it is full or nothing does
    for (let k = trail.length - 1; placed.length < C.maxLines && k >= 0; k--) {
      const n = placed.length;
      await grow(trail[k], 0);
      if (placed.length > n) k = trail.length;
    }
    if (C.follow) { await this.cam.busy; await this.follow(placed.filter(Boolean), null, C.camMove * 1.5); }   // at the end: the whole poem
    await this.wait(C.hold);
    await this.fadeAll(this.parent.children, 0, 2000);
    this.parent.remove(...this.parent.children);
  }

  /** The camera waits for the writing. When a line has been written, it looks: if any line (written or
   *  being written) is out of the frame, it makes one move to fit them all; while that move lasts, lines
   *  that finish only mark it to look again when the move is over. So lines may run out of the frame for
   *  a while, and the camera never jumps ahead of them. */
  lineDone(obj) {
    const cam = this.cam;
    cam.dirty = true; cam.last = obj;
    if (cam.busy) return;
    cam.busy = (async () => {
      while (cam.dirty) {
        cam.dirty = false;
        const lines = cam.lines();
        if (this.outOfFrame(lines)) await this.follow(lines, cam.last, P.crossings.camMove);
      }
      cam.busy = null;
    })();
  }
  /** does any glyph of these lines (as laid out now) reach past the frame from where the camera is? */
  outOfFrame(lines) {
    const box = this.liveBox(this.getBBoxFromSubset(this.parent, lines)), cam = this.camera, v = new THREE.Vector3();
    cam.updateMatrixWorld(true);
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
    obj.position.copy(p0);
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
    const base = obj._p0 || obj.position, rot = obj.rotation.z, t = this.turn();
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
}
