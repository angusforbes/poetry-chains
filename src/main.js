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
import { advanceTo, resetClock, now } from "./vis/tween.js";
import { startRecording, stopRecording } from "./vis/timeline.js";
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

// How many animations a page plays:
//   controls pages: exactly PRELOAD, measured up front, so the timeline has a fixed end
//   plain pages: one (Howe: P.howe.runs), or forever for the whole piece
const PRELOAD = 5;
let run = 0, doneAt = null, marks = [];
async function play(m) {
  const my = ++run, alive = () => my === run;
  doneAt = null;
  marks = [];
  const limit = CFG.controls ? PRELOAD : CFG.once ? (m === "howe" ? P.howe.runs : 1) : Infinity;
  let count = 0;
  const one = async (k, w) => { marks.push({ t: now(), mode: k }); const d = data(k, w); await vis[k].start(d); count++; return d; };
  try {
    if (m !== "all") { while (alive() && count < limit) await one(m); }
    else {
      const order = () => [...(P.all.intro ? ["intro"] : []), "chain", "lines", "colocation", ...Array(P.all.howeRepeats).fill("howe")];
      let seq = order(), i = 0, word = null;
      while (alive() && count < limit) {
        if (i >= seq.length) { seq = order(); i = 0; }
        const k = seq[i++], d = await one(k, word);
        word = d ? lastWord(k, d) || word : word;
      }
    }
    if (alive() && count >= limit) doneAt = now();
  } catch (e) { console.error(e); }
}

/** start from time 0 with a seed: same seed + same parameters = the same performance */
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

/* ── controls pages: record the five animations once, then any moment is instant ─────────────── */
let REC = null;
const T = { paused: false, rate: Number(new URLSearchParams(location.search).get("rate")) || 1, t: 0, duration: 0, marks: [], dirty: true };

/** perform the whole thing silently, recording it; the result is the timeline */
async function record(s) {
  REC = null;                                         // playback stays out of the scene while it is rebuilt
  stage.hold = true;
  startRecording(now);
  rebuild(s);
  for (let t = 60000; doneAt === null && t < 3.6e6; t += 60000) await advanceTo(t);
  REC = stopRecording();
  T.duration = doneAt ?? now();
  T.marks = marks.map((x) => ({ ...x }));
  run++;                                              // the performance is over; the recording takes it from here
  stage.hold = false;
}

const initial = (target, channel) => {
  if (channel === "opacity") target.material.opacity = 0;
  else if (channel === "camera") target.position.set(0, 0, -9);
};
function show(t) {
  T.t = Math.max(0, Math.min(T.duration, t));
  REC.applyAt(T.t, initial);
  T.dirty = false;
  paint();
}

let last = performance.now();
async function drive() {
  for (;;) {
    const t = await new Promise(requestAnimationFrame);
    const dt = Math.min(100, t - last);
    last = t;
    if (!CFG.controls) { if (!window.__pcHold) await advanceTo(now() + dt); continue; }       // plain pages: the live performance
    if (!REC) continue;
    if (!T.paused) {
      let nt = T.t + dt * T.rate;
      if (nt >= T.duration) { nt = T.duration; setPaused(true); }
      show(nt);
    } else if (T.dirty) show(T.t);
  }
}

/* ── transport ─────────────────────────────────────────────────────────── */
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const $ = (id) => document.getElementById(id);
let dragging = false;
function paint() {
  const t = T.t, D = T.duration || 1;
  if (!dragging) $("time").value = t;
  $("time").max = D;
  $("time").style.setProperty("--done", `${(100 * t) / D}%`);
  $("rate").style.setProperty("--done", `${(100 * (Math.log2(T.rate) + 4)) / 9}%`);
  $("tlabel").textContent = `${fmt(t)} / ${fmt(T.duration)}`;
  const k = T.marks.filter((x) => x.t <= t + 1).length;
  $("which").textContent = T.marks.length ? `${T.marks[Math.max(0, k - 1)].mode} · ${Math.max(1, k)} of ${T.marks.length}` : "";
  if ($("marks").dataset.v !== String(T.duration) + T.marks.length) {
    $("marks").dataset.v = String(T.duration) + T.marks.length;
    $("marks").innerHTML = T.marks.map((x, i) => `<i style="left:${(100 * x.t) / D}%" title="${i + 1}. ${x.mode}"></i>`).join("");
  }
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
function setPaused(p) { T.paused = p; document.body.classList.toggle("paused-ui", p); last = performance.now(); paint(); }
function togglePause() {
  if (T.paused && T.t >= T.duration - 1) show(0);        // at the end: from the start again
  setPaused(!T.paused);
}
const seek = (ms) => show(ms);

function transport() {
  $("play").onclick = togglePause;
  $("rate").oninput = (e) => setRate(Math.pow(2, +e.target.value));
  $("rate").ondblclick = () => setRate(1);
  const time = $("time");
  time.step = "any";
  time.addEventListener("pointerdown", () => (dragging = true));
  addEventListener("pointerup", () => (dragging = false));
  time.oninput = (e) => show(+e.target.value);                // every input event draws that exact moment
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.target.type === "text") return;
    const step = e.shiftKey ? 30000 : e.altKey ? 1000 / 60 : 5000;
    if (e.key === " ") togglePause();
    else if (e.key === "ArrowRight") show(T.t + step);
    else if (e.key === "ArrowLeft") show(T.t - step);
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(T.duration);
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
  window.__pc = { stage, corpus, P, T, seek, show, setRate, now, trace, CFG, rec: () => REC, advanceTo,
    sig: () => { const out = []; stage.scene.traverseVisible((o) => { if (o._line && o.children.some((c) => c.visible && c.material && c.material.opacity > 0.5)) out.push((typeof o._line === "string" ? o._line : o._line.line).slice(0, 30)); }); const c = stage.camera.position; return JSON.stringify({ cam: [c.x, c.y, c.z].map((v) => +v.toFixed(3)), lines: out.sort() }); } };

  // a seed only comes from the URL if someone put it there (a shared link); otherwise every load is new
  const s0 = Number(new URLSearchParams(location.search).get("seed")) || ((Math.random() * 2 ** 31) | 0);

  if (!CFG.controls) { rebuild(s0); drive(); return; }

  const again = async (s, at = 0) => { await record(s); show(Math.min(at, T.duration)); };
  const fresh = async () => {
    const q = new URLSearchParams(location.search); q.delete("seed");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    setPaused(false);
    await again((Math.random() * 2 ** 31) | 0);
  };
  let rt;
  const remeasure = () => { clearTimeout(rt); rt = setTimeout(() => again(seed, T.t), 350); };   // same five, new setting, same moment
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
    if (g === "look" && ["textColor", "background", "fov"].includes(k)) { stage.applyLook(); T.dirty = true; }
    else remeasure();
  });
  if (!CFG.mode) addEventListener("hashchange", fresh);
  transport();
  await again(s0);
  drive();
}
boot();
