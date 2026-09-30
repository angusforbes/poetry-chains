import * as THREE from "three";
// Entry point for every page. A page sets window.PC_CONFIG before loading this:
//   { mode: "chain" | "lines" | "colocation" | "howe", once: true, controls: true | false }
// Without a config (the root page) it behaves like the 2015 piece: #all or #<mode>, looping, with controls.
import { P, buildGui, onChange, paramQuery } from "./params.js";
import { loadCorpus } from "./corpus/Corpus.js";
import { Stage } from "./vis/Stage.js";
import { ChainVis } from "./vis/ChainVis.js";
import { LinesVis } from "./vis/LinesVis.js";
import { ColocationVis } from "./vis/ColocationVis.js";
import { HoweVis } from "./vis/HoweVis.js";
import { IntroVis } from "./vis/IntroVis.js";
import { CrossingsVis } from "./vis/CrossingsVis.js";
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
  crossings: () => ({ corpus, toJSON: () => "crossings" }),
  "crossings-howe": () => ({ corpus, toJSON: () => "crossings-howe" }),   // it chooses as it goes (it needs the layout)
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
const PANEL_W = 320;                                     // the settings column on the right, when open
let run = 0, doneAt = null, marks = [];
async function play(m) {
  const my = ++run, alive = () => my === run;
  doneAt = null;
  marks = [];
  const asked = Number(new URLSearchParams(location.search).get("animations"));   // a shared sequence says how many
  const limit = CFG.controls ? PRELOAD : asked > 0 ? asked : CFG.once ? (m === "howe" ? P.howe.runs : 1) : Infinity;
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
  LAYOUT.ready = false; LAYOUT.gen++;                  // a recording is always made at plain positions
  stage.layoutPos = (o, p, out) => out.copy(p);
  stage.layoutVersion++;
  startRecording(now);
  rebuild(s);
  for (let t = 60000; doneAt === null && t < 4.32e7; t += 60000) await advanceTo(t);
  REC = stopRecording();
  T.duration = doneAt ?? now();
  T.marks = marks.map((x) => ({ ...x }));
  run++;                                              // the performance is over; the recording takes it from here
  stage.hold = false;
}

/* ── live tracking and leading ─────────────────────────────────────────────────────────────────
   Every position in the piece moves in straight proportion to tracking (letter spacing) and to leading
   (line spacing): letters sit at sums of advances plus i × spacing, lines at multiples of the line step,
   and alignments on shared words are differences of those. So after the main recording, two more are made
   (a little more tracking, a little more leading) in a hidden scene, and matched object by object; the
   difference per unit is each object's rate. Any value is then a position = base + rate × change. */
const LAYOUT = { ready: false, v0: null, base: new Map(), rate: new Map(), gen: 0 };
const VARIANTS = [["letterSpacing", 10], ["leading", 0.5]];
const layoutValues = () => [P.look.letterSpacing, P.look.leading];

function captureBase() {
  LAYOUT.ready = false;
  LAYOUT.gen++;
  LAYOUT.v0 = layoutValues();
  LAYOUT.base = new Map(REC.linkList.map(([c]) => [c, c.position.clone()]));
  LAYOUT.rate = new Map();
  stage.layoutPos = (o, p, out) => out.copy(p);
  stage.layoutVersion++;
}

/** record once more into a fresh hidden scene (the visible one keeps playing) */
async function recordVariant(s) {
  const keep = { scene: stage.scene, camera: stage.camera, doneAt, marks, trace: [...trace] };
  stage.viewScene = keep.scene; stage.viewCamera = keep.camera;
  stage.fresh();
  startRecording(now);
  rebuild(s);
  for (let t = 60000; doneAt === null && t < 4.32e7; t += 60000) await advanceTo(t);
  const rec = stopRecording();
  run++;
  stage.scene = keep.scene; stage.camera = keep.camera; stage.viewScene = stage.viewCamera = null;
  doneAt = keep.doneAt; marks = keep.marks; trace.length = 0; trace.push(...keep.trace);
  return rec;
}

async function learnLayout(s, gen) {
  const rates = VARIANTS.map(() => new Map());
  for (let i = 0; i < VARIANTS.length; i++) {
    const [k, d] = VARIANTS[i], was = P.look[k];
    P.look[k] = LAYOUT.v0[i] + d;
    const rec = await recordVariant(s);
    P.look[k] = was;
    if (gen !== LAYOUT.gen) return;                      // a newer recording replaced this one
    const A = REC.linkList, B = rec.linkList;
    if (A.length !== B.length || A.some(([a], j) => a._letter !== B[j][0]._letter)) { console.warn("layout: recordings differ, live tracking/leading off"); return; }
    A.forEach(([a], j) => { const r = B[j][0].position.clone().sub(LAYOUT.base.get(a)).divideScalar(d); if (r.lengthSq() > 1e-12) rates[i].set(a, r); });
  }
  LAYOUT.rate = rates;
  LAYOUT.ready = true;
  applyLayout();
}

function applyLayout() {
  if (!LAYOUT.ready) return;
  const dv = layoutValues().map((v, i) => v - LAYOUT.v0[i]);
  const R = LAYOUT.rate;
  stage.layoutPos = (o, p, out) => { out.copy(p); for (let i = 0; i < R.length; i++) { const r = R[i].get(o); if (r) out.addScaledVector(r, dv[i]); } return out; };
  for (const [o, p0] of LAYOUT.base) stage.layoutPos(o, p0, o.position);
  stage.layoutVersion++;
  T.dirty = true;
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
    if (!CFG.controls) { if (!window.__pcHold) await advanceTo(now() + dt * T.rate); continue; }   // plain pages: the live performance
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
  vis = { chain: new ChainVis(stage), lines: new LinesVis(stage), colocation: new ColocationVis(stage), howe: new HoweVis(stage), intro: new IntroVis(stage), crossings: new CrossingsVis(stage),
    "crossings-howe": new CrossingsVis(stage, { turn: () => P["crossings-howe"].turn, colour: () => P["crossings-howe"], fade: () => P["crossings-howe"] }) };
  window.__pc = { THREE, stage, corpus, P, T, seek, show, setRate, now, trace, CFG, rec: () => REC, advanceTo, layout: () => LAYOUT.ready, applyLayout,
    // how far the visible text (letters at least half inked) reaches past the screen edges, in NDC (0 = fits)
    overflow: () => {
      const cam = (stage.viewCamera || stage.camera).clone(), box = new THREE.Box3(), v = new THREE.Vector3(); let any = false, worst = 0, side = "";
      cam.clearViewOffset(); cam.updateProjectionMatrix();
      stage.scene.updateMatrixWorld(true); cam.updateMatrixWorld(true);
      stage.scene.traverseVisible((o) => { if (o.isMesh && o.material.opacity > 0.5 && o.geometry.boundingBox) { box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) { v.set(x, y, box.min.z).project(cam); const e = Math.max(Math.abs(v.x), Math.abs(v.y)) - 1; if (e > worst) { worst = e; side = Math.abs(v.x) > Math.abs(v.y) ? "x" : "y"; } any = true; } } });
      return any ? { worst, side } : null;
    },
    sig2: () => { const out = []; stage.scene.updateMatrixWorld(true); stage.scene.traverseVisible((o) => { if (o._line && o.children.some((c) => c.visible && c.material && c.material.opacity > 0.5)) { const m = o.children.find((c) => c.isMesh); const w = m.getWorldPosition(new THREE.Vector3()); out.push(`${(typeof o._line === "string" ? o._line : o._line.line).slice(0, 12)}@${w.x.toFixed(3)},${w.y.toFixed(3)}`); } }); const c = stage.camera.position; return JSON.stringify({ cam: [c.x, c.y, c.z].map((v) => +v.toFixed(3)), lines: out.sort() }); },
    sig: () => { const out = []; stage.scene.traverseVisible((o) => { if (o._line && o.children.some((c) => c.visible && c.material && c.material.opacity > 0.5)) out.push((typeof o._line === "string" ? o._line : o._line.line).slice(0, 30)); }); const c = stage.camera.position; return JSON.stringify({ cam: [c.x, c.y, c.z].map((v) => +v.toFixed(3)), lines: out.sort() }); } };

  // a seed only comes from the URL if someone put it there (a shared link); otherwise every load is new
  const s0 = Number(new URLSearchParams(location.search).get("seed")) || ((Math.random() * 2 ** 31) | 0);

  if (!CFG.controls) { rebuild(s0); drive(); return; }

  // recordings share one clock, so they run one at a time
  let queue = Promise.resolve();
  const serial = (fn) => (queue = queue.then(fn, fn));
  const again = (s, at = 0) => serial(async () => {
    await record(s);
    captureBase();
    show(Math.min(at, T.duration));
    const gen = LAYOUT.gen;
    serial(() => learnLayout(s, gen));                  // in the background: playback carries on
  });
  const fresh = async () => {
    const q = new URLSearchParams(location.search); q.delete("seed");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    setPaused(false);
    await again((Math.random() * 2 ** 31) | 0);
  };
  let rt;
  const remeasure = () => { clearTimeout(rt); rt = setTimeout(() => again(seed, T.t), 350); };   // same five, new setting, same moment
  const copied = async (c, url, label) => {
    let ok = true;
    try { await navigator.clipboard.writeText(url); } catch { ok = false; }
    c.name(ok ? "copied ✓" : "copy failed: see the address bar");
    if (!ok) history.replaceState(null, "", url);
    setTimeout(() => c.name(label), 2200);
  };
  const LINK = "copy a link to this one (with controls)";
  const linkHere = (c) => {
    const q = new URLSearchParams(location.search); q.set("seed", seed);
    history.replaceState(null, "", location.pathname + "?" + q + location.hash);
    copied(c, location.href, LINK);
  };
  // the plain page for this mode, with exactly these settings, this seed and these five: just for viewing
  const SHARE = "share sequence (no controls)";
  const shareSequence = (c) => {
    const q = paramQuery();
    q.set("seed", seed);
    q.set("animations", PRELOAD);
    if (T.rate !== 1) q.set("rate", +T.rate.toFixed(3));
    copied(c, `${location.origin}${BASE}${mode()}/?${q}`, SHARE);
  };
  buildGui({
    modes: CFG.mode ? [CFG.mode] : MODES, current: mode(),
    groups: CFG.groups || (CFG.mode && CFG.mode !== "all" ? ["look", CFG.mode] : null),
    extra: [[SHARE, shareSequence], [LINK, linkHere]],
    onMode: (m) => { location.hash = m; }, onRestart: fresh, onPause: togglePause,
    onPanel: (open) => { document.body.classList.toggle("panel-open", open); stage.layout(open ? PANEL_W : 0); },
  });
  document.documentElement.style.setProperty("--panel-w", PANEL_W + "px");
  stage.onLayout = () => { T.dirty = true; };
  onChange((g, k) => {
    const liveCamera = (g === "look" && ["fov", "fitMargin"].includes(k)) || (g === "colocation" && k === "fitScale") || (g === "howe" && k === "zoom") || (g === "crossings" && k === "lean");
    const recolour = (g === "crossings-howe" && ["roleTone", "byAlpha", "greyAlpha", "greyest", "twoTone", "greyShare", "firstBlack", "lastBlack", "colourOn", "colourAlpha", "amount", "saturation", "lightness"].includes(k)) || (g === "look" && k === "textColor");
    if (recolour && vis["crossings-howe"]) vis["crossings-howe"].recolour();   // the lines' own colours, live
    if (g === "look" && k === "drag") { stage.renderer.domElement.style.cursor = P.look.drag ? "grab" : ""; if (!P.look.drag) stage.pan.x = stage.pan.y = 0; return; }
    if (g === "look" && ["textColor", "background", "fov"].includes(k)) { stage.applyLook(); T.dirty = true; }
    else if (recolour) T.dirty = true;
    else if (liveCamera) T.dirty = true;
    else if (g === "look" && (k === "letterSpacing" || k === "leading")) { if (LAYOUT.ready) applyLayout(); else remeasure(); }
    else remeasure();
  });
  if (!CFG.mode) addEventListener("hashchange", fresh);
  transport();
  await again(s0);
  drive();
}
boot();
