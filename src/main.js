// Entry point for every page. A page sets window.PC_CONFIG before loading this:
//   { mode: "chain" | "lines" | "colocation" | "howe", once: true, controls: true | false }
// Without a config (the root page) it behaves like the 2015 piece: #all or #<mode>, looping, with controls.
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
import "./ui.css";

const MODES = ["all", "chain", "lines", "colocation", "howe", "intro"];
const modeFromHash = () => { const m = location.hash.slice(1); return MODES.includes(m) ? m : "all"; };
const CFG = Object.assign({ mode: null, once: false, controls: true }, window.PC_CONFIG || {});
const mode = () => CFG.mode || modeFromHash();
const BASE = import.meta.env.BASE_URL;

const stage = new Stage();
let corpus, vis;

/* ── the performance ───────────────────────────────────────────────────── */
const trace = [];
const gen = {
  chain: (word) => corpus.chains({ ...P.chain, seed: word || P.chain.seed.trim().toLowerCase() || null }),
  lines: (word) => corpus.lineTree({ ...P.lines, seed: word || P.lines.seed.trim().toLowerCase() || null }),
  colocation: (word) => corpus.collocations({ ...P.colocation, seed: word || P.colocation.seed.trim().toLowerCase() || null }),
  howe: () => corpus.howe(P.howe),
  intro: () => null,
};
const data = (m, w) => { const d = gen[m](w); trace.push(`${Math.round(now())} ${m} ${JSON.stringify(d).slice(0, 80)}`); return d; };
const lastWord = (m, d) => {
  if (m === "chain") { const c = d[d.length - 1]; return c[c.length - 1].connector; }
  if (m === "lines" || m === "colocation") return d[d.length - 1].word;
};

let run = 0, doneAt = null;
async function play(m) {
  const my = ++run, alive = () => my === run;
  doneAt = null;
  try {
    if (CFG.once) {
      const runs = m === "howe" ? P.howe.runs : 1;           // Howe is short: its page plays several scatters in a row
      for (let i = 0; i < runs && alive(); i++) await vis[m].start(data(m));
      if (alive()) doneAt = now();
      return;
    }
    if (m !== "all") { while (alive()) await vis[m].start(data(m)); return; }
    const order = () => [...(P.all.intro ? ["intro"] : []), "chain", "lines", "colocation", ...Array(P.all.howeRepeats).fill("howe")];
    let seq = order(), i = 0, word = null;
    while (alive()) {
      if (i >= seq.length) { seq = order(); i = 0; }
      const k = seq[i++], d = data(k, word);
      await vis[k].start(d);
      word = d ? lastWord(k, d) || word : word;
    }
  } catch (e) { console.error(e); }
}

/** start from time 0 with a seed: same seed + same parameters = the same performance, frame for frame */
function rebuild(s) {
  trace.length = 0;
  resetClock(0);
  reseed(s);
  run++;
  stage.clear();
  stage.camera.position.set(0, 0, -9);
  stage.camera.lookAt(0, 0, 0);
  play(mode());
}

/** once-only pages: run the whole animation silently to learn its length, then rewind */
async function measure(s) {
  T.seeking = true;                                     // keep the live clock out of the way
  await idle();
  stage.hold = true;
  rebuild(s);
  for (let t = 60000; doneAt === null && t < 3.6e6; t += 60000) await advanceTo(t);
  const d = doneAt;
  rebuild(s);
  stage.hold = false;
  T.seeking = false;
  last = performance.now();
  return d;
}

/* ── transport ─────────────────────────────────────────────────────────── */
const q0 = new URLSearchParams(location.search);
const T = { paused: false, rate: Number(q0.get("rate")) || 1, seeking: false, furthest: 0, target: null, duration: null };
let last = performance.now();
async function drive() {
  for (;;) {
    const t = await new Promise(requestAnimationFrame);
    const dt = Math.min(100, t - last);
    last = t;
    if (!T.paused && !T.seeking) {
      let goal = now() + dt * T.rate;
      if (T.duration !== null && goal >= T.duration) { goal = T.duration; T.paused = true; document.body.classList.add("paused-ui"); }
      await advanceTo(goal);
    }
    T.furthest = Math.max(T.furthest, now());
    if (CFG.controls) paint();
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
const seek = (ms) => { T.target = Math.max(0, T.duration !== null ? Math.min(ms, T.duration) : ms); seekLoop(); };

const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const $ = (id) => document.getElementById(id);
const span = () => T.duration ?? Math.max(T.furthest + 120000, 300000);
let dragging = false;
function paint() {
  const t = T.target ?? now();
  if (!dragging) { $("time").max = span(); $("time").value = t; }
  $("tlabel").textContent = `${fmt(t)} / ${fmt(T.duration ?? T.furthest)}`;
  $("time").style.setProperty("--done", `${(100 * t) / span()}%`);
  $("rate").style.setProperty("--done", `${(100 * (Math.log2(T.rate) + 4)) / 9}%`);
  $("play").textContent = T.paused ? "play" : "pause";
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
function togglePause() {
  if (T.paused && T.duration !== null && now() >= T.duration - 1) seek(0);       // at the end: play again from the start
  T.paused = !T.paused;
  document.body.classList.toggle("paused-ui", T.paused);
  last = performance.now();
  paint();
}

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
    if (e.key === " ") togglePause();
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
  if (CFG.controls) {                                     // the controls are set in the piece's own typeface
    const f = new FontFace("Open Baskerville", `url(${BASE}fonts/OpenBaskerville.ttf)`);
    document.fonts.add(f); f.load().catch(() => {});
  }
  await stage.init(BASE + "fonts/OpenBaskerville.ttf");
  corpus = await loadCorpus(BASE + "corpus/dickinson.txt");
  vis = { chain: new ChainVis(stage), lines: new LinesVis(stage), colocation: new ColocationVis(stage), howe: new HoweVis(stage), intro: new IntroVis(stage) };
  window.__pc = { stage, corpus, P, T, seek, setRate, now, idle, trace, CFG,
    sig: () => { const out = []; stage.scene.traverse((o) => { if (o._line && o.children.some((c) => c.material && c.material.opacity > 0.5)) out.push((typeof o._line === "string" ? o._line : o._line.line).slice(0, 30)); }); const c = stage.camera.position; return JSON.stringify({ t: now(), cam: [c.x, c.y, c.z].map((v) => +v.toFixed(3)), lines: out.sort() }); } };

  // a seed only comes from the URL if someone put it there (a shared link); otherwise every load is new
  const s0 = Number(q0.get("seed")) || ((Math.random() * 2 ** 31) | 0);

  if (!CFG.controls) {
    document.getElementById("transport")?.remove();
    rebuild(s0);
    drive();
    return;
  }

  const fresh = async () => {
    T.furthest = 0;
    const q = new URLSearchParams(location.search); q.delete("seed");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    const s = (Math.random() * 2 ** 31) | 0;
    if (CFG.once) { T.paused = false; T.duration = await measure(s); document.body.classList.remove("paused-ui"); }
    else rebuild(s);
  };
  const linkHere = () => {
    const q = new URLSearchParams(location.search); q.set("seed", seed);
    history.replaceState(null, "", location.pathname + "?" + q + location.hash);
    navigator.clipboard?.writeText(location.href).catch(() => {});
  };
  buildGui({
    modes: CFG.mode ? [CFG.mode] : MODES, current: mode(),
    groups: CFG.mode && CFG.mode !== "all" ? ["look", CFG.mode] : null,
    extra: [["copy a link to this one", linkHere]],
    onMode: (m) => { location.hash = m; }, onRestart: fresh, onPause: togglePause,
  });
  onChange((g, k) => {
    if (g === "look" && ["textColor", "background", "fov"].includes(k)) stage.applyLook();
    else if (CFG.once) T.duration = null;                // the length is no longer known exactly; "new animation" re-measures
    if (g === "look" && ["fontSize", "letterSpacing", "lineHeight", "baseline"].includes(k)) fresh();
  });
  if (!CFG.mode) addEventListener("hashchange", fresh);
  transport();
  if (CFG.once) T.duration = await measure(s0); else rebuild(s0);
  drive();
}
boot();
