import { P, buildGui, onChange } from "./params.js";
import { loadCorpus } from "./corpus/Corpus.js";
import { Stage } from "./vis/Stage.js";
import { ChainVis } from "./vis/ChainVis.js";
import { LinesVis } from "./vis/LinesVis.js";
import { ColocationVis } from "./vis/ColocationVis.js";
import { HoweVis } from "./vis/HoweVis.js";
import { IntroVis } from "./vis/IntroVis.js";
import { advanceTo, resetClock, now, idle } from "./vis/tween.js";
import { reseed, seed } from "./rng.js";

const MODES = ["all", "chain", "lines", "colocation", "howe", "intro"];
const modeFromHash = () => { const m = location.hash.slice(1); return MODES.includes(m) ? m : "all"; };

const stage = new Stage();
let corpus, vis;

/* ── the performance ───────────────────────────────────────────────────── */
const trace = [];                                        // what each step generated (for checking replays)
const traced = (m, f) => (w) => { const d = f(w); trace.push(`${Math.round(now())} ${m} ${JSON.stringify(d).slice(0, 80)}`); return d; };
const data0 = {
  chain: (word) => corpus.chains({ ...P.chain, seed: word || P.chain.seed.trim().toLowerCase() || null }),
  lines: (word) => corpus.lineTree({ ...P.lines, seed: word || P.lines.seed.trim().toLowerCase() || null }),
  colocation: (word) => corpus.collocations({ ...P.colocation, seed: word || P.colocation.seed.trim().toLowerCase() || null }),
  howe: () => corpus.howe(P.howe),
  intro: () => null,
};
const data = Object.fromEntries(Object.entries(data0).map(([m, f]) => [m, traced(m, f)]));
const lastWord = (mode, d) => {
  if (mode === "chain") { const c = d[d.length - 1]; return c[c.length - 1].connector; }
  if (mode === "lines" || mode === "colocation") return d[d.length - 1].word;
};

let run = 0;
async function play(mode) {
  const my = ++run, alive = () => my === run;
  try {
    if (mode !== "all") { while (alive()) await vis[mode].start(data[mode]()); return; }
    const order = () => [...(P.all.intro ? ["intro"] : []), "chain", "lines", "colocation", ...Array(P.all.howeRepeats).fill("howe")];
    let seq = order(), i = 0, word = null;
    while (alive()) {
      if (i >= seq.length) { seq = order(); i = 0; }
      const m = seq[i++], d = data[m](word);
      await vis[m].start(d);
      word = d ? lastWord(m, d) || word : word;
    }
  } catch (e) { console.error(e); }
}

/** start the performance from time 0 with a given seed (same seed + same params = same performance) */
function rebuild(s) {
  trace.length = 0;
  resetClock(0);
  reseed(s);
  run++;
  stage.clear();
  stage.camera.position.set(0, 0, -9);
  stage.camera.lookAt(0, 0, 0);
  const q = new URLSearchParams(location.search);          // the seed in the URL: a link replays this exact performance
  q.set("seed", s);
  history.replaceState(null, "", location.pathname + "?" + q + location.hash);
  play(modeFromHash());
}

/* ── transport: rate, pause, time ──────────────────────────────────────── */
const T = { paused: false, rate: Number(new URLSearchParams(location.search).get("rate")) || 1, seeking: false, furthest: 0, target: null };
let last = performance.now();
async function drive() {
  for (;;) {
    const t = await new Promise(requestAnimationFrame);
    const dt = Math.min(100, t - last);
    last = t;
    if (!T.paused && !T.seeking) await advanceTo(now() + dt * T.rate);
    T.furthest = Math.max(T.furthest, now());
    paint();
  }
}

async function seekLoop() {
  if (T.seeking) return;
  T.seeking = true;
  stage.hold = true;
  document.body.classList.add("seeking");
  await idle();
  while (T.target !== null) {
    const goal = T.target;
    T.target = null;
    if (goal < now()) rebuild(seed);                    // back in time: replay from the start, fast
    await advanceTo(goal);
    paint();
  }
  stage.hold = false;
  T.seeking = false;
  document.body.classList.remove("seeking");
  last = performance.now();
}
const seek = (ms) => { T.target = Math.max(0, ms); seekLoop(); };

const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const $ = (id) => document.getElementById(id);
const span = () => Math.max(T.furthest + 120000, 300000);
let dragging = false;
function paint() {
  const t = T.target ?? now();
  if (!dragging) { $("time").max = span(); $("time").value = t; }
  $("tlabel").textContent = `${fmt(t)} / ${fmt(T.furthest)}`;
  $("time").style.setProperty("--seen", `${(100 * T.furthest) / span()}%`);
  $("play").textContent = T.paused ? "▶" : "❚❚";
  $("rlabel").textContent = `${T.rate < 1 ? T.rate.toFixed(2) : T.rate.toFixed(T.rate % 1 ? 1 : 0)}×`;
  $("rate").value = Math.log2(T.rate);
}
function setRate(r) {
  T.rate = Math.min(32, Math.max(1 / 16, r));
  const q = new URLSearchParams(location.search);
  if (T.rate === 1) q.delete("rate"); else q.set("rate", +T.rate.toFixed(3));
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  paint();
}
const togglePause = () => { T.paused = !T.paused; document.body.classList.toggle("paused-ui", T.paused); last = performance.now(); paint(); };

function transport() {
  $("play").onclick = togglePause;
  $("rate").oninput = (e) => setRate(Math.pow(2, +e.target.value));
  $("rate").ondblclick = () => setRate(1);
  $("time").addEventListener("pointerdown", () => (dragging = true));
  addEventListener("pointerup", () => (dragging = false));
  $("time").oninput = (e) => seek(+e.target.value);
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.target.type === "text") return;
    const step = e.shiftKey ? 30000 : 5000;
    if (e.key === " ") { e.preventDefault(); togglePause(); }
    else if (e.key === "ArrowRight") seek(now() + step);
    else if (e.key === "ArrowLeft") seek(now() - step);
    else if (e.key === "Home") seek(0);
    else if (e.key === "]") setRate(T.rate * 2);
    else if (e.key === "[") setRate(T.rate / 2);
    else if (e.key === "\\" || e.key === "1") setRate(1);
    else if (e.key === "t") document.body.classList.toggle("hide-transport");
    else return;
    e.preventDefault();
  });
}

/* ── boot ──────────────────────────────────────────────────────────────── */
async function boot() {
  await stage.init("fonts/OpenBaskerville.ttf");
  corpus = await loadCorpus("corpus/dickinson.txt");
  vis = { chain: new ChainVis(stage), lines: new LinesVis(stage), colocation: new ColocationVis(stage), howe: new HoweVis(stage), intro: new IntroVis(stage) };
  window.__pc = { stage, corpus, P, T, seek, setRate, now, idle, trace, sig: () => { const out = []; stage.scene.traverse((o) => { if (o._line && o.children.some((c) => c.material && c.material.opacity > 0.5)) out.push((typeof o._line === "string" ? o._line : o._line.line).slice(0, 30)); }); const c = stage.camera.position; return JSON.stringify({ t: now(), cam: [c.x, c.y, c.z].map((v) => +v.toFixed(3)), lines: out.sort() }); } };
  const fresh = () => { T.furthest = 0; rebuild((Math.random() * 2 ** 31) | 0); };
  buildGui({ modes: MODES, current: modeFromHash(), onMode: (m) => { location.hash = m; }, onRestart: fresh, onPause: togglePause });
  onChange((g, k) => {
    if (g === "look" && ["textColor", "background", "fov"].includes(k)) stage.applyLook();
    if (g === "look" && ["fontSize", "letterSpacing", "lineHeight", "baseline"].includes(k)) fresh();
  });
  addEventListener("hashchange", fresh);
  transport();
  const s0 = Number(new URLSearchParams(location.search).get("seed"));
  rebuild(s0 || (Math.random() * 2 ** 31) | 0);
  drive();
}
boot();
