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

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ADV = 0.45;          // an average letter advance, in ems, for estimating where a line would reach

export class CrossingsVis extends Vis {
  async start({ corpus }) {
    const C = P.crossings, em = P.look.fontSize;
    this.parent = this.getParentObject();
    const rowStep = P.look.lineHeight + C.rowGap;                 // a list's rows, at 100% leading
    const aspect = this.camera.aspect || 1.6;
    const halfW = C.pageWidth / 2, halfH = C.pageWidth / aspect / 2;

    // the page: the camera frames it once and stays there
    const s = this.scaleText, page = new THREE.Box3(new THREE.Vector3(-halfW * s, -halfH * s, 0), new THREE.Vector3(halfW * s, halfH * s, 0));
    await this.fitTo(page, (b) => this.getZoomDistanceFromBox(b, this.scaleOf()), 10);

    const shown = new Set(), used = new Set(), placed = [];
    const skip = (w) => !w || !w.word || w.word === "—" || w.rank <= C.skipCommon || w.word.length < C.minLetters;

    // the first line, across, somewhere near the middle
    const seedWord = C.seed.trim().toLowerCase() && corpus.words.get(C.seed.trim().toLowerCase());
    const pool = seedWord ? [...new Set(seedWord.lines)] : corpus.lines;
    let line = pool[Math.floor(rand() * pool.length)];
    let obj = this.makeLine(line, false, rowStep);
    const w0 = line.text.length * ADV * em;
    this.place(obj, new THREE.Vector3(w0 / 2 + (rand() - 0.5) * halfW * 0.4, (rand() - 0.5) * halfH * 0.6, 0));
    shown.add(line);
    await this.inkIn(obj, placed);
    let across = true, arrived = null;
    const trail = [{ line, obj, across }];
    const centres = [{ x: -obj._p0.x + w0 / 2, y: obj._p0.y }];     // where each line sits (screen x, text units)

    for (let step = 1; step < C.steps; step++) {
      await this.wait(C.stepHold);
      const ctx = { shown, used, skip, rowStep, halfW, halfH, em, centres };
      let pick = this.choose(corpus, line, obj, across, arrived, ctx);
      // a dead end (no word here leads to a line not yet shown): go back to the latest line that has one
      for (let k = trail.length - 2; !pick && k >= 0; k--) {
        const t = trail[k];
        pick = this.choose(corpus, t.line, t.obj, t.across, null, ctx);
        if (pick) ({ line, obj, across } = t);
      }
      if (!pick) break;                                             // nowhere left to go: finished
      const { word, next } = pick;
      used.add(word);
      const down = across;                                          // the next line turns
      const nobj = this.makeLine(next, down, rowStep);
      // put the new line's copy of the word on the old one's, a little off register
      const a = this.wordAnchor(obj, word.word), b = this.wordAnchor(nobj, word.word);
      const mis = C.misregister;
      const off = new THREE.Vector3((rand() - 0.5) * 2 * mis, (rand() - 0.5) * 2 * mis, 0);
      nobj.position.copy(obj.position).add(a.pos).sub(b.pos).add(off.clone().multiply(new THREE.Vector3(1, P.look.leading, 1)));
      nobj._p0 = (obj._p0 || obj.position).clone().add(a.p0).sub(b.p0).add(off);
      if (C.olderInk < 100) this.fadeAll(placed, C.olderInk / 100, 1000);
      shown.add(next);
      await this.inkIn(nobj, placed, word.word);
      line = next; obj = nobj; across = !across; arrived = word;
      trail.push({ line, obj, across });
      centres.push(pick.centre);
    }
    await this.wait(C.hold);
    await this.fadeAll(this.parent.children, 0, 2000);
    this.parent.remove(...this.parent.children);
  }

  place(obj, p0) {
    obj._p0 = p0.clone();
    obj.position.copy(p0);
  }

  async inkIn(obj, placed, word) {
    this.parent.add(obj);
    placed.push(obj);
    const letters = obj.children;
    if (word) {                                                     // the shared word first, then the rest
      const w = this.getLetterObjectsForWord(obj, word);
      await this.fadeToArray(1, 1000)(w);
      return this.fadeToArray(1, 1000)(letters.filter((c) => !w.includes(c)));
    }
    return this.fadeToArray(1, 1000)(letters);
  }

  /** a line object; down = its words as a list, one per row, each row a little off the column */
  makeLine(line, down, rowStep) {
    const o = this.getLineObject(line.text);
    o._down = down;
    if (!down) return o;
    const C = P.crossings, text = line.text;
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
    const base = obj._p0 || obj.position;
    const seen = new Set();
    let best = null;
    for (const w of line.words) {
      if (skip(w) || used.has(w) || w === arrived || seen.has(w)) continue;
      seen.add(w);
      const fresh = [...new Set(w.lines)].filter((l) => !shown.has(l) && l !== line);
      if (!fresh.length) continue;
      const i = this.getWordIndex(line.text, w.word);
      if (i < 0) continue;
      const anchor = base.clone().add(obj.children[i]._p0);      // text units at 100%/0%; screen right is -x
      const ax = -anchor.x, ay = anchor.y;
      const sample = fresh.length > 8 ? shuffle(fresh.slice()).slice(0, 8) : fresh;
      for (const next of sample) {
        const j = this.getWordIndex(next.text, w.word);
        if (j < 0) continue;
        let x0, x1, y0, y1;
        if (across) {                                                // next goes down, as a list
          const words = next.text.split(/\s+/).filter(Boolean);
          const r = next.text.slice(0, j).split(/\s+/).filter(Boolean).length;
          x0 = ax; x1 = ax + Math.max(...words.map((x) => x.length)) * adv;
          y1 = ay + r * rowStep; y0 = ay - (words.length - 1 - r) * rowStep;
        } else {                                                     // next goes across
          x0 = ax - j * adv; x1 = x0 + next.text.length * adv; y0 = ay - em * 0.3; y1 = ay + em * 0.7;
        }
        // how far this line's middle is from the lines already there (by the nearest): open space scores
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const room = Math.min(...centres.map((c) => Math.hypot((c.x - cx) / halfW, (c.y - cy) / halfH))) / 0.5;
        const over = Math.max(0, -halfW - x0) + Math.max(0, x1 - halfW) + Math.max(0, -halfH - y0) + Math.max(0, y1 - halfH);
        const score = Math.log(1 + Math.min(fresh.length, 4)) * 2     // leads somewhere new (a few ways on is enough)
          - (over / (halfW * 0.25)) * (C.keepOnPage / 25)              // stays on the page
          + Math.min(room, 1) * (C.spread / 10)                        // toward open space
          + rand() * C.chance;                                         // and a little luck
        if (!best || score > best.score) best = { score, word: w, next, centre: { x: cx, y: cy } };
      }
    }
    return best;
  }
}
