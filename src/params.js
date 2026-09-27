// Every number the original hard-coded, as a parameter. Defaults are the original values, so an
// untouched page looks and moves exactly like the 2015 piece.
// Values live in the URL query (?speed=0.5&chain.lineGap=40) so any state is a shareable link.
import GUI from "lil-gui";

export const SCHEMA = {
  look: {
    speed:        { v: 0.9,   min: 0.05, max: 4, step: 0.05, label: "slowness" },
    textColor:    { v: "#0a0a0a", color: true, label: "ink" },
    background:   { v: "#ffffff", color: true, label: "paper" },
    fov:          { v: 70,    min: 10, max: 120, step: 1, label: "lens" },
    fitMargin:    { v: 1.3,   min: 0.5, max: 4, step: 0.05, label: "framing" },
    fadeDuration: { v: 1000,  min: 0, max: 5000, step: 50, label: "letter fade" },
    letterStagger:{ v: 10,    min: 0, max: 200, step: 1, label: "letter stagger" },
    letterSpacing:{ v: 0,     min: -20, max: 60, step: 1, label: "letter spacing" },
    fontSize:     { v: 72,    min: 24, max: 200, step: 1, label: "type size" },
    lineHeight:   { v: 82,    min: 20, max: 300, step: 1, label: "line height" },
    baseline:     { v: 56,    min: 10, max: 300, step: 1, label: "baseline" },
  },
  chain: {
    seed:      { v: "",   text: true, label: "begin with the word" },
    minDepth:  { v: 5,    min: 1, max: 12, step: 1, label: "fewest lines" },
    maxDepth:  { v: 10,   min: 1, max: 16, step: 1, label: "most lines" },
    numChains: { v: 5,    min: 1, max: 20, step: 1, label: "chains" },
    lineGap:   { v: 20,   min: 0, max: 200, step: 1, label: "line gap" },
    hold:      { v: 10000, min: 0, max: 30000, step: 250, label: "linger" },
  },
  lines: {
    seed:       { v: "",  text: true, label: "begin with the word" },
    iterations: { v: 6,   min: 1, max: 12, step: 1, label: "levels" },
    maxLines:   { v: 20,  min: 2, max: 60, step: 1, label: "lines per level" },
    lineSpacing:{ v: 40,  min: 0, max: 200, step: 1, label: "line spacing" },
    hold:       { v: 3000, min: 0, max: 20000, step: 250, label: "linger" },
  },
  colocation: {
    seed:          { v: "",   text: true, label: "begin with the word" },
    nets:          { v: 8,    min: 1, max: 20, step: 1, label: "hops" },
    maxCollocates: { v: 10,   min: 1, max: 30, step: 1, label: "companions" },
    minWordLength: { v: 3,    min: 1, max: 8, step: 1, label: "shortest word" },
    rankLo:        { v: 10000, min: 0, max: 11000, step: 100, label: "rarity from" },
    rankHi:        { v: 18000, min: 0, max: 18000, step: 100, label: "rarity to" },
    radius:        { v: 600,  min: 100, max: 2000, step: 10, label: "ring" },
    maxSizeScale:  { v: 2,    min: 1, max: 6, step: 0.1, label: "largest word" },
    moveDuration:  { v: 2000, min: 100, max: 8000, step: 100, label: "unfolding" },
    fitScale:      { v: 1.7,  min: 0.5, max: 5, step: 0.05, label: "framing" },
    hold:          { v: 3000, min: 0, max: 20000, step: 250, label: "linger" },
  },
  howe: {
    runs:         { v: 5,    min: 1, max: 20, step: 1, label: "scatters", plainOnly: true },   // plain Howe page only
    minLines:     { v: 8,    min: 1, max: 40, step: 1, label: "fewest lines" },
    maxLines:     { v: 18,   min: 1, max: 60, step: 1, label: "most lines" },
    newGroup:     { v: 0.2,  min: 0, max: 1, step: 0.01, label: "new-group chance" },
    groupLines:   { v: 6,    min: 1, max: 20, step: 1, label: "lines per group" },
    spreadX:      { v: 1000, min: 0, max: 5000, step: 50, label: "spread across" },
    spreadY:      { v: 500,  min: 0, max: 5000, step: 50, label: "spread down" },
    lineStep:     { v: 150,  min: 0, max: 600, step: 5, label: "line step" },
    rotation:     { v: 360,  min: 0, max: 360, step: 1, label: "turning" },
    zoom:         { v: 2.5,  min: 0.5, max: 8, step: 0.1, label: "framing" },
    hold:         { v: 3000, min: 0, max: 20000, step: 250, label: "linger" },
  },
  all: {
    intro:       { v: true, bool: true, label: "title card" },
    howeRepeats: { v: 6,    min: 0, max: 12, step: 1, label: "Howe scatters" },
    introHold:   { v: 15000, min: 0, max: 60000, step: 500, label: "title linger" },
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

/** the parameters that differ from the 2015 defaults, as URL query entries */
export function paramQuery() {
  const q = new URLSearchParams();
  for (const [g, fields] of Object.entries(SCHEMA))
    for (const [k, f] of Object.entries(fields))
      if (P[g][k] !== f.v) q.set(g === "look" ? k : `${g}.${k}`, f.bool ? (P[g][k] ? "1" : "0") : P[g][k]);
  return q;
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

export function buildGui({ modes, current, onMode, onRestart, onPause, groups = null, extra = null }) {
  const gui = new GUI({ title: "settings" });
  const ctl = { mode: current, restart: onRestart, pause: () => onPause(), reset: () => { history.replaceState(null, "", location.pathname + location.hash); location.reload(); } };
  if (modes.length > 1) gui.add(ctl, "mode", modes).name("mode").onChange(onMode);
  gui.add(ctl, "restart").name(groups ? "a new one" : "start again");
  if (extra) for (const [label, fn] of extra) { const o = { f: () => fn(c) }; const c = gui.add(o, "f").name(label); }
  gui.add(ctl, "reset").name("back to the 2015 settings");
  for (const [g, fields] of Object.entries(SCHEMA)) {
    if (groups && !groups.includes(g)) continue;
    const folder = gui.addFolder(g);
    if (g !== "look" && g !== current && !(current === "all")) folder.close();
    for (const [k, f] of Object.entries(fields)) {
      if (f.plainOnly) continue;
      const c = f.color ? folder.addColor(P[g], k) : f.text || f.bool ? folder.add(P[g], k) : folder.add(P[g], k, f.min, f.max, f.step);
      c.name(f.label).onChange(() => { writeUrl(); listeners.forEach((fn) => fn(g, k, P[g][k])); });
    }
  }
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "h") gui.show(gui._hidden);
    if (e.key === "r") onRestart();
  });
  gui.close();
  return gui;
}
