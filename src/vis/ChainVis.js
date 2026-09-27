// Port of ChainVis.coffee: lines drop in one under another, each aligned on the word it shares with the
// line above; the camera refits as the chain grows; at the end only the last connecting word stays,
// and the next chain grows out of it.
import { Vis } from "./Stage.js";
import { P } from "../params.js";

export class ChainVis extends Vis {
  async start(data) {
    let last;
    for (const chain of data) {
      last = await this.addChain(chain, last);
      await this.wait(P.chain.hold);
      last = await this.endChain(last);
    }
    const p = this.getParentObject();
    await this.fadeAll(p.children, 0, 2000);
    p.remove(...p.children);
  }

  async endChain(lastObject) {
    const siblings = lastObject.parent.children.filter((c) => c !== lastObject);
    this.fadeAll(siblings, 0, 1000);
    await this.adjustCameraToFit(lastObject);
    lastObject.parent.remove(...siblings);
    const lastWord = lastObject._line.connector;
    const letters = this.getLetterObjectsForWord(lastObject, lastWord, (o) => o._line.line);
    const others = this.getSiblingsFromSubset(lastObject, letters);
    await this.fadeToArray(0, 1000)(others);
    lastObject.remove(...others);
    this.adjustCameraToFit(lastObject);
    lastObject.name = "last_word";
    return lastObject;
  }

  async addChain(text, lastObject) {
    const processed = this.processChain(text);
    let objs = processed.map((line) => { const o = this.getLineObject(line.line); o._line = line; return o; });
    if (lastObject) {
      const lastWord = lastObject._letters().join("");
      this.alignObjectsByWord(lastObject, objs[0], lastWord);
      objs.forEach((o) => o.position.copy(objs[0].position));
      this.fadeToArray(0, 1000)(lastObject.children).then(() => lastObject.parent && lastObject.parent.remove(lastObject));
    }
    objs.forEach((o, i) => { o.position.y += -i * (o._layout.height + P.chain.lineGap) * P.look.leading; });
    objs = objs.map(positionLines);
    const chainObject = this.getParentObject();
    let curr;
    for (curr of objs) {
      chainObject.add(curr);
      const word = curr._line.prev_connector;
      if (word) {
        const one = this.getLetterObjectsForWord(curr, word, (o) => o._line.line);
        await this.fadeToArray(1, 1000)(one);
      }
      this.adjustCameraToFit(chainObject);
      await this.fadeToArray(1, 1000)(curr.children);
    }
    return curr;
  }

  processChain(chain) {
    return chain.map((obj, i, arr) => {
      obj.connector_index = obj.line.toLowerCase().indexOf(obj.connector.toLowerCase());
      if (i > 0) {
        const prev = arr[i - 1];
        obj.prev_connector = prev.connector;
        obj.my_prev_connector_index = this.getWordIndex(obj.line, prev.connector);
        obj.prev_connector_index = prev.connector_index;
      }
      return obj;
    });
  }
}

function positionLines(line, index, array) {
  if (index === 0) return line;
  const prev = array[index - 1];
  const a = prev.children[prev._line.connector_index], b = line.children[line._line.my_prev_connector_index];
  line.position.x = prev.position.x + (a ? a.position.x : 0) - (b ? b.position.x : 0);
  return line;
}
