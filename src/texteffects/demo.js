// /texteffects/: try the 24 effects on any word. Twelve axes, each a slider from one pole's effect to the
// other's; "both" makes the axis torn (the word flickers between its two effects). Tour plays every effect.
import "./pages.css";
import { TextFX, AXES, EXAMPLES, resolve, weightsAt } from "./index.js";

const BASE = import.meta.env.BASE_URL;
const font = new FontFace("Open Baskerville", `url(${BASE}fonts/OpenBaskerville.ttf)`);
font.load().then((f) => document.fonts.add(f));

const $ = (s) => document.querySelector(s);
const tx = await TextFX.create($("#stage"), { fontUrl: `${BASE}fonts/OpenBaskerville.ttf` });

const state = { text: "dust", val: Object.fromEntries(AXES.map((a) => [a.id, 0])), torn: {}, dur: 3.2, size: 150, tour: false };
state.val.growth = -1;
let word = null;
function build() {
  if (word) tx.remove(word);
  const size = Math.min(state.size, (tx.width * 0.7) / Math.max(1, tx.measure(state.text, 1)));
  word = tx.word(state.text, { x: 0, y: tx.height * 0.12, size, align: "center" });
}

// ── panel ──
const rows = $("#axes");
for (const a of AXES) {
  const r = document.createElement("div");
  r.className = "axis";
  r.innerHTML = `<span class="pole neg" title="${a.neg.effect}: ${a.neg.q}">${a.neg.name} <small>${a.neg.effect}</small></span>
    <input type="range" min="-1" max="1" step="0.01" value="0">
    <span class="pole pos" title="${a.pos.effect}: ${a.pos.q}"><small>${a.pos.effect}</small> ${a.pos.name}</span>
    <button class="both" title="torn: both poles at once">both</button>`;
  const slider = r.querySelector("input"), both = r.querySelector(".both");
  slider.value = state.val[a.id];
  slider.oninput = () => { state.val[a.id] = +slider.value; state.tour = false; syncTour(); };
  both.onclick = () => { state.torn[a.id] = !state.torn[a.id]; both.classList.toggle("on", !!state.torn[a.id]); if (!state.val[a.id]) { state.val[a.id] = 0.8; slider.value = 0.8; } };
  const solo = (v, eff) => { setOnly(a.id, v); setWord(EXAMPLES[eff]); state.tour = false; syncTour(); };
  r.querySelector(".neg").onclick = () => solo(-1, a.neg.effect);
  r.querySelector(".pos").onclick = () => solo(1, a.pos.effect);
  a.slider = slider; a.both = both;
  rows.appendChild(r);
}
function setOnly(id, v) {
  for (const a of AXES) { state.val[a.id] = a.id === id ? v : 0; a.slider.value = state.val[a.id]; state.torn[a.id] = false; a.both.classList.remove("on"); }
}
function setWord(w) { state.text = w; $("#word").value = w; build(); T0 = clock(); }
$("#word").value = state.text;
$("#word").oninput = (e) => { state.text = e.target.value || " "; build(); };
$("#dur").oninput = (e) => { state.dur = +e.target.value; $("#durv").textContent = state.dur.toFixed(1) + " s"; };
$("#reset").onclick = () => { setOnly("", 0); };
$("#tour").onclick = () => { state.tour = !state.tour; tourStep = -1; syncTour(); };
function syncTour() { $("#tour").classList.toggle("on", state.tour); }

// ── tour: every effect on its example word, in axis order ──
const TOUR = AXES.flatMap((a) => [[a.id, -1, a.neg.effect], [a.id, 1, a.pos.effect]]);
let tourStep = -1;

// ── clock ──
const clock = () => performance.now() / 1000;
let T0 = clock();
build();
function frame() {
  const T = clock() - T0, t = (T % state.dur) / state.dur;
  if (state.tour) {
    const step = Math.floor(T / state.dur) % TOUR.length;
    if (step !== tourStep) { tourStep = step; const [id, v, eff] = TOUR[step]; setOnly(id, v); state.text = EXAMPLES[eff]; $("#word").value = state.text; build(); }
    $("#now").textContent = `${tourStep + 1} / ${TOUR.length} · ${TOUR[tourStep][2]}`;
  } else {
    const on = AXES.filter((a) => state.val[a.id]).map((a) => (state.torn[a.id] ? `${a.neg.effect} ⇄ ${a.pos.effect}` : state.val[a.id] > 0 ? a.pos.effect : a.neg.effect));
    $("#now").textContent = on.join(" + ") || "still";
  }
  const poles = Object.fromEntries(AXES.map((a) => {
    const v = state.val[a.id];
    return [a.id, state.torn[a.id] ? { pos: Math.abs(v), neg: Math.abs(v) } : { pos: Math.max(0, v), neg: Math.max(0, -v) }];
  }));
  word.update({ t, T }, weightsAt(resolve(poles), T, { threshold: 0 }));
  tx.render();
  requestAnimationFrame(frame);
}
addEventListener("resize", () => build());
frame();
