import { P, buildGui, onChange } from "./params.js";
import { loadCorpus } from "./corpus/Corpus.js";
import { Stage } from "./vis/Stage.js";
import { ChainVis } from "./vis/ChainVis.js";
import { LinesVis } from "./vis/LinesVis.js";
import { ColocationVis } from "./vis/ColocationVis.js";
import { HoweVis } from "./vis/HoweVis.js";
import { IntroVis } from "./vis/IntroVis.js";
import { cancelAll, CANCELLED, setPaused, isPaused } from "./vis/tween.js";

const MODES = ["all", "chain", "lines", "colocation", "howe", "intro"];
const modeFromHash = () => { const m = location.hash.slice(1); return MODES.includes(m) ? m : "all"; };

const stage = new Stage();
let corpus, vis, run = 0;

// generators, fed from the current parameters every time new data is needed
const data = {
  chain: (word) => corpus.chains({ ...P.chain, seed: word || P.chain.seed.trim().toLowerCase() || null }),
  lines: (word) => corpus.lineTree({ ...P.lines, seed: word || P.lines.seed.trim().toLowerCase() || null }),
  colocation: (word) => corpus.collocations({ ...P.colocation, seed: word || P.colocation.seed.trim().toLowerCase() || null }),
  howe: () => corpus.howe(P.howe),
  intro: () => null,
};
const lastWord = (mode, d) => {
  if (mode === "chain") { const c = d[d.length - 1]; return c[c.length - 1].connector; }
  if (mode === "lines" || mode === "colocation") return d[d.length - 1].word;
};

async function play(mode) {
  const my = ++run;
  const alive = () => my === run;
  try {
    if (mode !== "all") {
      while (alive()) { await vis[mode].start(data[mode]()); }   // single modes loop, like leaving a page open
      return;
    }
    // "all": the original's order, each mode seeded with the word the previous one ended on
    const order = () => [...(P.all.intro ? ["intro"] : []), "chain", "lines", "colocation", ...Array(P.all.howeRepeats).fill("howe")];
    let seq = order(), i = 0, word = null;
    while (alive()) {
      if (i >= seq.length) { seq = order(); i = 0; }
      const m = seq[i++];
      const d = data[m](word);
      await vis[m].start(d);
      word = d ? lastWord(m, d) || word : word;
    }
  } catch (e) {
    if (e !== CANCELLED) console.error(e);
  }
}

function restart(mode = modeFromHash()) {
  cancelAll();
  run++;
  stage.clear();
  stage.camera.position.set(0, 0, -9);
  stage.camera.lookAt(0, 0, 0);
  setPaused(false);
  requestAnimationFrame(() => play(mode));
}

async function boot() {
  await stage.init("fonts/OpenBaskerville.ttf");
  corpus = await loadCorpus("corpus/dickinson.txt");
  vis = { chain: new ChainVis(stage), lines: new LinesVis(stage), colocation: new ColocationVis(stage), howe: new HoweVis(stage), intro: new IntroVis(stage) };
  window.__pc = { stage, corpus, P };
  buildGui({
    modes: MODES, current: modeFromHash(),
    onMode: (m) => { location.hash = m; },
    onRestart: () => restart(),
    onPause: () => setPaused(!isPaused()),
  });
  onChange((g, k) => {
    if (g === "look" && ["textColor", "background", "fov"].includes(k)) stage.applyLook();
    if (g === "look" && ["fontSize", "letterSpacing", "lineHeight", "baseline"].includes(k)) restart();   // layout changes need fresh text
  });
  addEventListener("hashchange", () => restart());
  play(modeFromHash());
}
boot();
