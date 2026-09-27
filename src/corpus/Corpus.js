// Port of the PoetryChains Java backend (Parser, ChainMaker, NetMaker, LineMaker, HoweMaker).
import { rand } from "../rng.js";
// Behaviour follows the Java closely, including its randomness: behaviorism's Utils.randomInt(min, max)
// is Math.round(min + random * (max - min)), so both ends are inclusive at half weight.

export const randomInt = (min, max) => Math.round(min + rand() * (max - min));
export const randomElement = (list, lo = 0, hi = list.length - 1) =>
  list[Math.max(0, Math.min(list.length - 1, randomInt(lo, Math.min(hi, list.length - 1))))];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function randomElements(collection, n) {
  const list = shuffle([...collection]);
  return list.length < n ? null : list.slice(0, n);
}

class Word {
  constructor(word) {
    this.word = word;
    this.total = 0;
    this.rank = 0;
    this.lines = [];               // with repeats, like the Java List
    this.collocations = new Map(); // Word -> count
  }
  toString() { return this.word; }
}

export class Corpus {
  constructor(text) {
    this.poems = [];
    this.lines = [];
    this.words = new Map();
    this.rankedWords = [];
    this.load(text);
    this.rankWords();
  }

  // Parser.loadInPoems + parseLineIntoWords + collocateWords
  load(text) {
    let poem = null, stanza = null, newStanza = true, stanzaNum = 1, idx = 1;
    for (const str of text.split(/\r?\n/)) {
      const n = /^\s*\d+\s*$/.test(str) ? parseInt(str, 10) : -1;
      if (n > 0) { poem = { title: String(n), stanzas: [] }; this.poems.push(poem); continue; }
      if (str.length < 1) { newStanza = true; continue; }
      if (newStanza) { stanzaNum++; stanza = { num: stanzaNum, poem, lines: [] }; poem.stanzas.push(stanza); newStanza = false; }
      const line = { n: idx++, text: str, stanza, poem, words: [] };
      this.lines.push(line);
      stanza.lines.push(line);
      const colloc = [];
      for (const tok of str.trim().split(/\s+/)) {
        if (!tok) continue;
        let w = tok.toLowerCase().trim();
        if (w !== "—") w = w.replace(/^[^a-zA-Z]+/, "").replace(/[^a-zA-Z]+$/, "");
        let word = this.words.get(w);
        if (!word) { word = new Word(w); this.words.set(w, word); }
        colloc.push(word);
        word.total++;
        line.words.push(word);
        word.lines.push(line);
      }
      for (const word of colloc) {
        let self = false;
        for (const c of colloc) {
          if (c === word && !self) { self = true; continue; }
          word.collocations.set(c, (word.collocations.get(c) || 0) + 1);
        }
      }
    }
  }

  rankWords() {
    this.rankedWords = [...this.words.values()].sort((a, b) => b.total - a.total);
    this.rankedWords.forEach((w, i) => (w.rank = i + 1));
  }

  // words the visualisations can find again in the raw line text
  usable(w) { return w && w.word !== ""; }
  randomWord() {
    const all = [...this.words.values()];
    let w; do { w = all[Math.floor(rand() * all.length)]; } while (!this.usable(w));
    return w;
  }

  /* ── chains (ChainMaker / Parser.connectWords / searchFor) ─────────────── */
  chains({ seed = null, minDepth = 5, maxDepth = 10, numChains = 5, maxAttempts = 400 } = {}) {
    const chains = [];
    let r1 = (seed && this.words.get(seed)) || this.randomWord();
    let r2 = this.randomWord();
    for (let i = 0; i < numChains; i++) {
      let chain = this.connect(r1, r2, minDepth, maxDepth), tries = 0;
      while (!chain && tries++ < maxAttempts) { r2 = this.randomWord(); chain = this.connect(r1, r2, minDepth, maxDepth); }
      if (!chain) break;
      chain.last = r2;
      chains.push(chain);
      r1 = r2;
      r2 = this.randomWord();
    }
    // PoetryChain.printChainJSON
    return chains.map((c) => c.lines.map((line, i) => ({
      title: line.poem.title, line: line.text,
      connector: i < c.lines.length - 1 ? c.words[i].word : (c.last ? c.last.word : ""),
    })));
  }

  connect(start, end, minDepth, maxDepth) {
    for (let i = 0; i < 10; i++) {
      const [source, target, reverse] = i % 2 === 0 ? [end, start, false] : [start, end, true];
      const path = [], connectors = [];
      const found = this.search(0, randomInt(minDepth, maxDepth), source, target, path, connectors, new Set(), new Set());
      if (reverse) { path.reverse(); connectors.reverse(); }
      if (found) return { lines: path, words: connectors };
    }
    return null;
  }

  search(depth, maxDepth, start, target, path, connectors, seenWords, seenLines) {
    if (depth > maxDepth) return false;
    // the Java shuffled start.lines in place; a copy keeps the corpus unchanged, so a seed replays exactly
    for (const line of shuffle([...start.lines])) {
      if (seenLines.has(line)) continue;
      if (line.words.includes(target)) {
        if (depth !== maxDepth - 1) continue;
        path.push(line);
        return true;
      }
      seenLines.add(line);
      const ws = [...line.words].sort((a, b) => a.total - b.total);   // sortWordsByRank(-1): rarest first
      for (const word of ws) {
        if (seenWords.has(word)) continue;
        seenWords.add(word);
        if (word === start || !this.usable(word)) continue;
        if (this.search(depth + 1, maxDepth, word, target, path, connectors, seenWords, seenLines)) {
          path.push(line);
          connectors.push(word);
          return true;
        }
      }
    }
    return false;
  }

  /* ── collocation nets (NetMaker / CollocationNet) ───────────────────────── */
  collocations({ seed = null, nets = 8, maxCollocates = 10, minWordLength = 3, rankLo = 10000, rankHi = 18000 } = {}) {
    const lowFreq = () => {
      const r = this.rankedWords.filter((w) => this.usable(w));
      return randomElement(r, Math.min(rankLo, r.length - 1), Math.min(rankHi, r.length - 1));
    };
    let w = (seed && this.words.get(seed)) || lowFreq();
    const out = [];
    for (let i = 0; i < nets; i++) {
      const set = [...w.collocations.keys()];
      let colos = randomElements(set, Math.min(maxCollocates, set.length)) || [];
      colos = colos.filter((c) => c.word.length >= minWordLength && c.collocations.size > 1);
      out.push({ word: w.word, colocations: colos.map((c) => ({ val: c.word, amt: w.collocations.get(c) })) });
      if (!colos.length) break;
      w = colos[Math.floor(rand() * colos.length)];
    }
    return out;
  }

  /* ── line trees (LineMaker) ─────────────────────────────────────────────── */
  lineTree({ seed = null, iterations = 6, maxLines = 20 } = {}) {
    const startIdx = (line, w) => { let i = 0; for (const x of line.words) { if (x === w) return i; i += x.word.length + 1; } return -1; };
    let lines = this.lines, seedLine = null;
    const sw = seed && this.words.get(seed);
    if (sw) seedLine = randomElements(sw.lines, 1)[0];
    const out = [];
    for (let i = 0; i < iterations; i++) {
      const line = i === 0 && seedLine ? seedLine : lines[Math.floor(rand() * lines.length)];
      let word, unique, guard = 0;
      for (;;) {
        word = line.words[Math.floor(rand() * line.words.length)];
        unique = [...new Set(word.lines)];
        if ((unique.length > 1 && this.usable(word)) || ++guard > 200) break;
      }
      const s = startIdx(line, word);
      lines = shuffle(unique).slice(0, Math.min(unique.length, maxLines - 1));
      out.push({ line: line.text, word: word.word, sIdx: s, eIdx: s + word.word.length,
        lines: lines.map((l) => { const a = startIdx(l, word); return { line: l.text, sIdx: a, eIdx: a + word.word.length }; }) });
    }
    return out;
  }

  /* ── Howe (HoweMaker) ───────────────────────────────────────────────────── */
  howe({ minLines = 8, maxLines = 18 } = {}) {
    return randomElements(this.lines, randomInt(minLines, maxLines)).map((l) => l.text);
  }
}

export async function loadCorpus(url) {
  const text = await (await fetch(url)).text();
  return new Corpus(text.replace(/⊔/g, "—").replace(/--/g, "—"));
}
