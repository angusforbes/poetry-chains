// Every number the original hard-coded, as a parameter. Defaults are the original values, so an
// untouched page looks and moves exactly like the 2015 piece.
// Values live in the URL query (?speed=0.5&chain.lineGap=40) so any state is a shareable link.
import GUI from "lil-gui";

export const SCHEMA = {
  look: {
    speed:        { v: 0.9,   min: 0.05, max: 4, step: 0.05, label: "time scale (× all durations)" },
    textColor:    { v: "#0a0a0a", color: true, label: "text colour" },
    background:   { v: "#ffffff", color: true, label: "background" },
    fov:          { v: 70,    min: 10, max: 120, step: 1, label: "camera field of view" },
    fitMargin:    { v: 1.3,   min: 0.5, max: 4, step: 0.05, label: "camera fit margin" },
    fadeDuration: { v: 1000,  min: 0, max: 5000, step: 50, label: "letter fade (ms, base 1000)" },
    letterStagger:{ v: 10,    min: 0, max: 200, step: 1, label: "stagger per letter (ms)" },
    letterSpacing:{ v: 0,     min: -20, max: 60, step: 1, label: "letter spacing" },
    fontSize:     { v: 72,    min: 24, max: 200, step: 1, label: "font size (layout units)" },
    lineHeight:   { v: 82,    min: 20, max: 300, step: 1, label: "line height" },
    baseline:     { v: 56,    min: 10, max: 300, step: 1, label: "baseline" },
  },
  chain: {
    seed:      { v: "",   text: true, label: "seed word (blank = random)" },
    minDepth:  { v: 5,    min: 1, max: 12, step: 1, label: "min lines per chain" },
    maxDepth:  { v: 10,   min: 1, max: 16, step: 1, label: "max lines per chain" },
    numChains: { v: 5,    min: 1, max: 20, step: 1, label: "chains in a row" },
    lineGap:   { v: 20,   min: 0, max: 200, step: 1, label: "gap between lines" },
    hold:      { v: 10000, min: 0, max: 30000, step: 250, label: "hold each chain (ms)" },
  },
  lines: {
    seed:       { v: "",  text: true, label: "seed word (blank = random)" },
    iterations: { v: 6,   min: 1, max: 12, step: 1, label: "levels" },
    maxLines:   { v: 20,  min: 2, max: 60, step: 1, label: "max lines per level" },
    lineSpacing:{ v: 40,  min: 0, max: 200, step: 1, label: "line spacing" },
    hold:       { v: 3000, min: 0, max: 20000, step: 250, label: "hold per level (ms)" },
  },
  colocation: {
    seed:          { v: "",   text: true, label: "seed word (blank = rare word)" },
    nets:          { v: 8,    min: 1, max: 20, step: 1, label: "hops" },
    maxCollocates: { v: 10,   min: 1, max: 30, step: 1, label: "max collocates per word" },
    minWordLength: { v: 3,    min: 1, max: 8, step: 1, label: "min word length" },
    rankLo:        { v: 10000, min: 0, max: 11000, step: 100, label: "random seed rank from" },
    rankHi:        { v: 18000, min: 0, max: 18000, step: 100, label: "random seed rank to" },
    radius:        { v: 600,  min: 100, max: 2000, step: 10, label: "ring radius" },
    maxSizeScale:  { v: 2,    min: 1, max: 6, step: 0.1, label: "max word scale (by count)" },
    moveDuration:  { v: 2000, min: 100, max: 8000, step: 100, label: "spread duration (ms)" },
    fitScale:      { v: 1.7,  min: 0.5, max: 5, step: 0.05, label: "camera fit" },
    hold:          { v: 3000, min: 0, max: 20000, step: 250, label: "hold at end (ms)" },
  },
  howe: {
    minLines:     { v: 8,    min: 1, max: 40, step: 1, label: "min lines" },
    maxLines:     { v: 18,   min: 1, max: 60, step: 1, label: "max lines" },
    newGroup:     { v: 0.2,  min: 0, max: 1, step: 0.01, label: "chance of a new group" },
    groupLines:   { v: 6,    min: 1, max: 20, step: 1, label: "max lines per group" },
    spreadX:      { v: 1000, min: 0, max: 5000, step: 50, label: "spread x" },
    spreadY:      { v: 500,  min: 0, max: 5000, step: 50, label: "spread y" },
    lineStep:     { v: 150,  min: 0, max: 600, step: 5, label: "max line step" },
    rotation:     { v: 360,  min: 0, max: 360, step: 1, label: "max rotation (°)" },
    zoom:         { v: 2.5,  min: 0.5, max: 8, step: 0.1, label: "camera fit" },
    hold:         { v: 3000, min: 0, max: 20000, step: 250, label: "hold at end (ms)" },
  },
  all: {
    intro:       { v: true, bool: true, label: "include intro" },
    howeRepeats: { v: 6,    min: 0, max: 12, step: 1, label: "Howe rounds per cycle" },
    introHold:   { v: 15000, min: 0, max: 60000, step: 500, label: "intro hold (ms)" },
  },
};

export const P = {};
for (const [g, fields] of Object.entries(SCHEMA)) { P[g] = {}; for (const [k, f] of Object.entries(fields)) P[g][k] = f.v; }

// URL → params
const q = new URLSearchParams(location.search);
for (const [key, val] of q) {
  const [g, k] = key.includes(".") ? key.split(".") : ["look", key];
  const f = SCHEMA[g] && SCHEMA[g][k];
  if (!f) continue;
  P[g][k] = f.text || f.color ? val : f.bool ? val === "1" || val === "true" : Number(val);
}

function writeUrl() {
  const q = new URLSearchParams();
  for (const [g, fields] of Object.entries(SCHEMA))
    for (const [k, f] of Object.entries(fields))
      if (P[g][k] !== f.v) q.set(g === "look" ? k : `${g}.${k}`, f.bool ? (P[g][k] ? "1" : "0") : P[g][k]);
  const s = q.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}

const listeners = [];
export const onChange = (fn) => listeners.push(fn);

export function buildGui({ modes, current, onMode, onRestart, onPause }) {
  const gui = new GUI({ title: "Poetry Chains · parameters" });
  gui.domElement.style.setProperty("--width", "300px");
  const ctl = { mode: current, restart: onRestart, pause: () => onPause(), reset: () => { history.replaceState(null, "", location.pathname + location.hash); location.reload(); } };
  gui.add(ctl, "mode", modes).name("mode").onChange(onMode);
  gui.add(ctl, "restart").name("restart now (↻)");
  gui.add(ctl, "pause").name("pause / resume (space)");
  gui.add(ctl, "reset").name("reset all to 2015 defaults");
  for (const [g, fields] of Object.entries(SCHEMA)) {
    const folder = gui.addFolder(g);
    if (g !== "look" && g !== current && !(current === "all")) folder.close();
    for (const [k, f] of Object.entries(fields)) {
      const c = f.color ? folder.addColor(P[g], k) : f.text || f.bool ? folder.add(P[g], k) : folder.add(P[g], k, f.min, f.max, f.step);
      c.name(f.label).onChange(() => { writeUrl(); listeners.forEach((fn) => fn(g, k, P[g][k])); });
    }
  }
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "h") gui.show(gui._hidden);
    if (e.key === " ") { e.preventDefault(); onPause(); }
    if (e.key === "r") onRestart();
  });
  gui.close();
  return gui;
}
