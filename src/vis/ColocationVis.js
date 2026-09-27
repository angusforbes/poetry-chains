// Port of ColocationVis.coffee: a word, and around it on a ring the words that share its lines,
// sized by how often; one of them becomes the next centre.
import * as THREE from "three";
import { Vis } from "./Stage.js";
import { P } from "../params.js";
import { tween, wait as waitRaw } from "./tween.js";

export class ColocationVis extends Vis {
  async start(network) {
    const networkObject = this.getParentObject();
    const maxAmount = Math.max(1, ...network.flatMap((n) => n.colocations.map((c) => c.amt)));
    this.amountScale = (a) => (maxAmount === 1 ? 1 : 1 + ((a - 1) / (maxAmount - 1)) * (P.colocation.maxSizeScale - 1));
    let root = makeTree(network);
    root = this.setNetworkPositions(root, P.colocation.radius);
    await this.animate(root, networkObject);
    await this.wait(P.colocation.hold);
    await this.fadeAll(networkObject.children, 0, 1000);
    networkObject.remove(...networkObject.children);
  }

  async animate(root, networkObject) {
    networkObject.add(root._text_object);
    this.fadeToArray(1, 1000)(root._text_object.children);
    const traverse = async (node) => {
      const next = (node.children || []).filter((c) => c.children)[0];
      if (node.children) this.addChildren(node);
      await this.adjustCameraToFitWidth(node._text_object.parent, P.colocation.fitScale);
      await this.wait(1000);
      if (next) {
        await this.moveChildren(node, 1000);
        await this.wait(2000);
        await this.fadeOutSiblingsAndGrandparent(next);
        return traverse(next);
      }
    };
    return traverse(root);
  }

  addChildren(node) {
    for (const child of node.children) {
      child._text_object = child._text_object || this.getTextObject(child);
      node._text_object.parent.add(child._text_object);
      child._text_object.scale.multiplyScalar(this.amountScale(child.amt || 1));
    }
  }

  moveChildren(node, delay) {
    for (const child of node.children) {
      const o = child._text_object;
      const endPos = o.position.clone(), startPos = node._text_object.position.clone();
      const endSize = o.scale.clone(), startSize = new THREE.Vector3(0.01, 0.01, 0.01);
      o.position.copy(startPos); o.scale.copy(startSize);
      tween({
        duration: P.colocation.moveDuration, delay: Math.random() * delay, target: child, channel: "move",
        init: () => { this.fadeToArray(1, 3000)(o.children); return (t) => { o.position.lerpVectors(startPos, endPos, t); o.scale.lerpVectors(startSize, endSize, t); }; },
      });
    }
    return waitRaw(250);   // the original resolved on a bare d3.transition() (250 ms), not on the spread itself
  }

  fadeOutSiblingsAndGrandparent(node) {
    let others = node.parent.children.filter((c) => c !== node);
    if (node.parent.parent) others = others.concat(node.parent.parent);
    return Promise.all(others.map((r) => r._text_object && this.fadeToArray(0, 1000)(r._text_object.children)
      .then(() => r._text_object.parent && r._text_object.parent.remove(r._text_object))));
  }

  getTextObject(node) {
    const o = this.getLineObject(node.val);
    o.position.copy(node.position);
    return o;
  }

  setNetworkPositions(root, radius) {
    root.position = new THREE.Vector3();
    const traverse = (node) => {
      if (!node.children) { node._text_object = node._text_object || null; return; }
      const offset = node.parent ? getRadians(node.parent, node) : 0;
      const circle = node.parent ? [node.parent].concat(node.children) : node.children;
      const n = circle.length + 1;                       // d3.scale.ordinal().rangePoints([0, 2π]) over n+1 points
      circle.forEach((c, i) => {
        const rad = (n > 1 ? (i / (n - 1)) * 2 * Math.PI : 0) + offset;
        if (!c.position) c.position = new THREE.Vector3(radius * Math.cos(rad) + node.position.x, radius * Math.sin(rad) + node.position.y, 0);
      });
      node._text_object = this.getTextObject(node);
      node.children.forEach(traverse);
    };
    traverse(root);
    return root;
  }
}

const getRadians = (a, b) => Math.atan2(a.position.y - b.position.y, a.position.x - b.position.x);

function makeTree(network) {
  const nodes = network.map((d) => ({ val: d.word, children: d.colocations.map((c) => ({ ...c })) }));
  return nodes.reduceRight((child, parent) => {
    child.parent = parent;
    const i = parent.children.map((d) => d.val).indexOf(child.val);
    if (i >= 0) { child.amt = parent.children[i].amt; parent.children[i] = child; }
    else parent.children.push(child);
    return parent;
  });
}
