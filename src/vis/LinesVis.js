// Port of LinesVis.coffee: a line, then every other line sharing one of its words, stacked and aligned
import { rand } from "../rng.js";
// on that word; one of them becomes the next line, and so on down the tree.
import { Vis } from "./Stage.js";
import { P } from "../params.js";

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class LinesVis extends Vis {
  async start(data) {
    this.linesObject = this.getParentObject();
    data = sanitizeData(data);
    let root = linesToTree(data);
    root = this.addObjects(root);
    root = this.positionObjects(root);
    await this.animateLines(root);
    await this.fadeAll(this.linesObject.children, 0, 2000);
    this.linesObject.remove(...this.linesObject.children);
  }

  async animateLines(root) {
    this.linesObject.add(root._text_object);
    this.fadeToArray(1, 1000)(root._text_object.children);
    await this.adjustCameraToFitWidth(root._text_object);
    return this.traverse(root);
  }

  async traverse(node) {
    if (!node.children || node.word === "") return;
    const next = node.children.filter((c) => c.children)[0];
    await this.fadeOutOthers(node._text_object);
    if (next) await this.fadeInChildWords(node);
    if (next) await this.chainedFadeInChildren(node, next);
    this.viewFullLines(node);
    await this.wait(P.lines.hold);
    if (next) return this.traverse(next);
  }

  viewFullLines(node) {
    const parent = node._text_object.parent;
    if (!parent) return;
    // the fully shown lines, and the shared word of every other line (the column): 2015 framed only the
    // full lines, so the column ran off the top and bottom of the screen for the whole level
    const visible = [];
    for (const line of parent.children) {
      const ms = line.children.filter((c) => c.isMesh);
      if (ms.every((c) => c.material.opacity > 0)) visible.push(line);
      else visible.push(...ms.filter((c) => c.material.opacity > 0));
    }
    if (!visible.length) return;
    const box = this.getBBoxFromSubset(parent, visible);
    return this.adjustCameraToFitBox(box);   // 1.3 in 2015: the framing default
  }

  async chainedFadeIn(array) {
    for (const curr of array) {
      this.fadeToArray(1, 1000)(curr._text_object.children);
      await this.viewFullLines(curr);
    }
  }

  chainedFadeInChildren(node, next) {
    const pos = node._positions_array, c = pos.indexOf(node), n = pos.indexOf(next);
    const arr = c < n ? pos.slice(c + 1, n + 1) : pos.slice(n, c).reverse();
    return this.chainedFadeIn(arr);
  }

  fadeInChildWords(node) {
    return Promise.all(node.children.map((child) => {
      this.linesObject.add(child._text_object);
      return this.fadeToArray(1, 1000)(this.getLetterObjectsForWord(child._text_object, node.word));
    }));
  }

  fadeOutOthers(object) {
    const others = object.parent.children.filter((c) => c !== object);
    return Promise.all(others.map((e) => this.fadeToArray(0, 1000)(e.children).then(() => object.parent && object.parent.remove(e))));
  }

  positionObjects(root) {
    const traverse = (parent) => {
      if (!parent.children) return;
      const arr = shuffle(parent.children.concat(parent));
      const pi = arr.indexOf(parent), py = parent._text_object.position.y;
      const py0 = (parent._text_object._p0 || parent._text_object.position).y;
      parent._positions_array = arr;
      arr.forEach((node, i) => {
        const o = node._text_object;
        const step = (i - pi) * (o._layout.height + P.lines.lineSpacing);
        o.position.y = py + step * P.look.leading;
        o._p0 = o._p0 || o.position.clone();
        o._p0.y = py0 + step;                                // at 100% leading: what the camera frames
      });
      parent.children.forEach(this.alignToNode(parent));
      parent.children.forEach(traverse);
    };
    traverse(root);
    return root;
  }

  alignToNode(parent) {
    return (child) => {
      const word = parent.word;
      const idx = [parent, child].map((n) => this.getWordIndex(n.line, word));
      const at = (n, i, k) => (i < 0 ? 0 : (k ? n._text_object.children[i]._p0 : n._text_object.children[i].position).x);
      const c = child._text_object, p = parent._text_object;
      c.position.x = p.position.x + (at(parent, idx[0]) - at(child, idx[1]));
      c._p0 = c._p0 || c.position.clone();
      c._p0.x = (p._p0 || p.position).x + (at(parent, idx[0], 1) - at(child, idx[1], 1));
    };
  }

  addObjects(node) {
    const t = (n) => { n._text_object = this.getLineObject(n.line); if (n.children) n.children.forEach(t); };
    t(node);
    return node;
  }
}

function linesToTree(lines) {
  lines = lines.map((l) => ({ line: l.line, word: l.word, sIdx: l.sIdx, eIdx: l.eIdx, children: l.lines.map((x) => ({ ...x })) }));
  return lines.reduceRight((prev, current) => {
    const i = current.children.map((c) => c.line).indexOf(prev.line);
    if (i >= 0) current.children[i] = prev; else current.children.push(prev);
    prev._parent = current;
    return current;
  });
}

function sanitizeData(data) {
  return data.map((e) => {
    if (e.sIdx === e.eIdx && e.line[e.sIdx] !== "") { e.word = e.line[e.sIdx]; e.eIdx = e.sIdx + 1; }
    return e;
  });
}
