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
    fontSize:     { v: 72,    min: 24, max: 200, step: 1, label: "type size" , hidden: true },
    lineHeight:   { v: 82,    min: 20, max: 300, step: 1, label: "line height" },
    baseline:     { v: 56,    min: 10, max: 300, step: 1, label: "baseline" , hidden: true },
    leading:      { v: 1,     min: 0.25, max: 3, step: 0.01, label: "leading", hidden: true },
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
  // Crossings (2026, standalone page only): Howe × Lines, across and down like a crossword that is not clean
  crossings: {
    seed:       { v: "",   text: true, label: "begin with the word" },
    waves:      { v: 4,    min: 1, max: 12, step: 1, label: "waves" },
    branchMin:  { v: 1,    min: 1, max: 6, step: 1, label: "fewest new lines per line" },
    branchMax:  { v: 3,    min: 1, max: 6, step: 1, label: "most new lines per line" },
    maxLines:   { v: 60,   min: 2, max: 200, step: 1, label: "most lines" },
    paceVary:   { v: 60,   min: 0, max: 200, step: 1, label: "pace varies" },
    startSpread:{ v: 3000, min: 0, max: 20000, step: 50, label: "start spread" },
    skipCommon: { v: 60,   min: 0, max: 500, step: 5, label: "skip the commonest words" },
    minLetters: { v: 3,    min: 1, max: 8, step: 1, label: "shortest word" },
    cramped:    { v: 67,   min: 0, max: 100, step: 1, label: "cramped share" },
    rowTight:   { v: 35,   min: 5, max: 100, step: 1, label: "tightest list rows" },
    wordTight:  { v: -100, min: -300, max: 100, step: 5, label: "tightest word spaces" },
    widest:     { v: 200,  min: 100, max: 400, step: 5, label: "widest spacing" },
    wobble:     { v: 30,   min: 0, max: 300, step: 5, label: "list wobble" },
    misregister:{ v: 10,   min: 0, max: 120, step: 1, label: "off register" },
    spread:     { v: 60,   min: 0, max: 100, step: 1, label: "toward open space" },
    keepOnPage: { v: 85,   min: 0, max: 100, step: 1, label: "keep to the page" },
    chance:     { v: 1.5,  min: 0, max: 10, step: 0.1, label: "chance" },
    pageWidth:  { v: 4200, min: 1000, max: 20000, step: 100, label: "page width" },
    follow:     { v: true, bool: true, label: "camera follows" },
    lean:       { v: 15,   min: 0, max: 100, step: 1, label: "lean toward the newest" },
    camMove:    { v: 3000, min: 100, max: 20000, step: 50, label: "camera move" },
    olderInk:   { v: 100,  min: 0, max: 100, step: 1, label: "older lines ink" },
    stepHold:   { v: 700,  min: 0, max: 10000, step: 50, label: "pause between lines" },
    hold:       { v: 6000, min: 0, max: 30000, step: 250, label: "linger" },
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
      if (P[g][k] !== f.v) q.set(g === "look" ? k : `${g}.${k}`, f.bool ? (P[g][k] ? "1" : "0") : typeof P[g][k] === "number" ? +P[g][k].toFixed(4) : P[g][k]);
  return q;
}

function writeUrl() {
  const q = new URLSearchParams();
  for (const [g, fields] of Object.entries(SCHEMA))
    for (const [k, f] of Object.entries(fields))
      if (P[g][k] !== f.v) q.set(g === "look" ? k : `${g}.${k}`, f.bool ? (P[g][k] ? "1" : "0") : typeof P[g][k] === "number" ? +P[g][k].toFixed(4) : P[g][k]);
  const s = q.toString();
  history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash);
}

const listeners = [];
export const onChange = (fn) => listeners.push(fn);

/* ── the panel: settings named for what you see, in seconds and percentages ──────────────────────
   Each control reads and writes the underlying parameters above (which keep their 2015 names, so links
   stay valid). s = seconds at tempo 1 (the pieces run at 0.9 × their 2015 durations). */
const sp = () => P.look.speed;
const PANEL = {
  writing: { of: "look", controls: [
    // 0 = off: no letter-by-letter writing, every letter of a line fades in at once
    { label: "hand speed (letters/s)", keys: [["look", "letterStagger"]], min: 0, max: 500, step: 1,
      name: (v) => (v === 0 ? "hand speed · off" : "hand speed (letters/s)"),
      get: () => (P.look.letterStagger <= 0 ? 0 : 1000 / (P.look.letterStagger * sp())),
      set: (v) => (P.look.letterStagger = v <= 0 ? 0 : 1000 / (v * sp())) },
    { label: "ink-in (s)", keys: [["look", "fadeDuration"]], min: 0, max: 5, step: 0.05,
      get: () => (P.look.fadeDuration * sp()) / 1000, set: (v) => (P.look.fadeDuration = (v * 1000) / sp()) },
  ] },
  camera: { of: "look", controls: [
    { label: "fill (%)", keys: [["look", "fitMargin"]], min: 20, max: 150, step: 1, get: () => 100 / P.look.fitMargin, set: (v) => (P.look.fitMargin = 100 / v) },
  ] },
  page: { of: "look", controls: [
    { color: ["look", "textColor"], label: "ink" },
    { color: ["look", "background"], label: "paper" },
    { label: "leading (%)", keys: [["look", "leading"]], min: 25, max: 300, step: 1, get: () => P.look.leading * 100, set: (v) => (P.look.leading = v / 100) },
    { label: "tracking (%)", keys: [["look", "letterSpacing"]], min: -20, max: 80, step: 1,
      get: () => (P.look.letterSpacing / P.look.fontSize) * 100, set: (v) => (P.look.letterSpacing = (v * P.look.fontSize) / 100) },
  ] },
  chain: { of: "chain", controls: [
    { text: ["chain", "seed"], label: "begin with the word" },
    { label: "shortest chain (lines)", keys: [["chain", "minDepth"]], min: 1, max: 12, step: 1, get: () => P.chain.minDepth, set: (v) => (P.chain.minDepth = v) },
    { label: "longest chain (lines)", keys: [["chain", "maxDepth"]], min: 1, max: 16, step: 1, get: () => P.chain.maxDepth, set: (v) => (P.chain.maxDepth = v) },
    { label: "chains in a row", keys: [["chain", "numChains"]], min: 1, max: 20, step: 1, get: () => P.chain.numChains, set: (v) => (P.chain.numChains = v) },
    { label: "pause after each (s)", keys: [["chain", "hold"]], min: 0, max: 30, step: 0.1, get: () => (P.chain.hold * sp()) / 1000, set: (v) => (P.chain.hold = (v * 1000) / sp()) },
  ] },
  lines: { of: "lines", controls: [
    { text: ["lines", "seed"], label: "begin with the word" },
    { label: "depth (levels)", keys: [["lines", "iterations"]], min: 1, max: 12, step: 1, get: () => P.lines.iterations, set: (v) => (P.lines.iterations = v) },
    { label: "lines per level", keys: [["lines", "maxLines"]], min: 2, max: 60, step: 1, get: () => P.lines.maxLines, set: (v) => (P.lines.maxLines = v) },
    { label: "pause after each level (s)", keys: [["lines", "hold"]], min: 0, max: 20, step: 0.1, get: () => (P.lines.hold * sp()) / 1000, set: (v) => (P.lines.hold = (v * 1000) / sp()) },
  ] },
  colocation: { of: "colocation", controls: [
    { text: ["colocation", "seed"], label: "begin with the word" },
    { label: "rarity from (rank)", keys: [["colocation", "rankLo"]], min: 0, max: 11000, step: 100, get: () => P.colocation.rankLo, set: (v) => (P.colocation.rankLo = v) },
    { label: "rarity to (rank)", keys: [["colocation", "rankHi"]], min: 0, max: 18000, step: 100, get: () => P.colocation.rankHi, set: (v) => (P.colocation.rankHi = v) },
    { label: "steps", keys: [["colocation", "nets"]], min: 1, max: 20, step: 1, get: () => P.colocation.nets, set: (v) => (P.colocation.nets = v) },
    { label: "words per ring", keys: [["colocation", "maxCollocates"]], min: 1, max: 30, step: 1, get: () => P.colocation.maxCollocates, set: (v) => (P.colocation.maxCollocates = v) },
    { label: "shortest word (letters)", keys: [["colocation", "minWordLength"]], min: 1, max: 8, step: 1, get: () => P.colocation.minWordLength, set: (v) => (P.colocation.minWordLength = v) },
    { label: "ring size (%)", keys: [["colocation", "radius"]], min: 20, max: 330, step: 1, get: () => P.colocation.radius / 6, set: (v) => (P.colocation.radius = v * 6) },
    { label: "largest word (%)", keys: [["colocation", "maxSizeScale"]], min: 100, max: 600, step: 5, get: () => P.colocation.maxSizeScale * 100, set: (v) => (P.colocation.maxSizeScale = v / 100) },
    { label: "unfolding (s)", keys: [["colocation", "moveDuration"]], min: 0.1, max: 8, step: 0.1, get: () => P.colocation.moveDuration / 1000, set: (v) => (P.colocation.moveDuration = v * 1000) },
    { label: "fill (%)", keys: [["colocation", "fitScale"]], min: 20, max: 150, step: 1, get: () => 100 / P.colocation.fitScale, set: (v) => (P.colocation.fitScale = 100 / v) },
    { label: "pause at the end (s)", keys: [["colocation", "hold"]], min: 0, max: 20, step: 0.1, get: () => (P.colocation.hold * sp()) / 1000, set: (v) => (P.colocation.hold = (v * 1000) / sp()) },
  ] },
  howe: { of: "howe", controls: [
    { label: "fewest lines", keys: [["howe", "minLines"]], min: 1, max: 40, step: 1, get: () => P.howe.minLines, set: (v) => (P.howe.minLines = v) },
    { label: "most lines", keys: [["howe", "maxLines"]], min: 1, max: 60, step: 1, get: () => P.howe.maxLines, set: (v) => (P.howe.maxLines = v) },
    { label: "new-cluster chance (%)", keys: [["howe", "newGroup"]], min: 0, max: 100, step: 1, get: () => P.howe.newGroup * 100, set: (v) => (P.howe.newGroup = v / 100) },
    { label: "cluster size (lines)", keys: [["howe", "groupLines"]], min: 1, max: 20, step: 1, get: () => P.howe.groupLines, set: (v) => (P.howe.groupLines = v) },
    { label: "scatter (%)", keys: [["howe", "spreadX"], ["howe", "spreadY"]], min: 0, max: 500, step: 5, get: () => P.howe.spreadX / 10, set: (v) => { P.howe.spreadX = v * 10; P.howe.spreadY = v * 5; } },
    { label: "cluster leading (%)", keys: [["howe", "lineStep"]], min: 0, max: 400, step: 5, get: () => P.howe.lineStep / 1.5, set: (v) => (P.howe.lineStep = v * 1.5) },
    { label: "tilt (°)", keys: [["howe", "rotation"]], min: 0, max: 360, step: 1, get: () => P.howe.rotation, set: (v) => (P.howe.rotation = v) },
    { label: "fill (%)", keys: [["howe", "zoom"]], min: 10, max: 150, step: 1, get: () => 100 / P.howe.zoom, set: (v) => (P.howe.zoom = 100 / v) },
    { label: "pause at the end (s)", keys: [["howe", "hold"]], min: 0, max: 20, step: 0.1, get: () => (P.howe.hold * sp()) / 1000, set: (v) => (P.howe.hold = (v * 1000) / sp()) },
  ] },
  crossings: { of: "crossings", standalone: true, controls: [
    { text: ["crossings", "seed"], label: "begin with the word" },
    { label: "waves", keys: [["crossings", "waves"]], min: 1, max: 12, step: 1, get: () => P.crossings.waves, set: (v) => (P.crossings.waves = v) },
    { label: "fewest new lines per line", keys: [["crossings", "branchMin"]], min: 1, max: 6, step: 1, get: () => P.crossings.branchMin, set: (v) => (P.crossings.branchMin = Math.min(v, P.crossings.branchMax)) },
    { label: "most new lines per line", keys: [["crossings", "branchMax"]], min: 1, max: 6, step: 1, get: () => P.crossings.branchMax, set: (v) => (P.crossings.branchMax = Math.max(v, P.crossings.branchMin)) },
    { label: "most lines on the page", keys: [["crossings", "maxLines"]], min: 2, max: 200, step: 1, get: () => P.crossings.maxLines, set: (v) => (P.crossings.maxLines = v) },
    { label: "starts spread over (s)", keys: [["crossings", "startSpread"]], min: 0, max: 20, step: 0.1, get: () => (P.crossings.startSpread * sp()) / 1000, set: (v) => (P.crossings.startSpread = (v * 1000) / sp()) },
    { label: "pace varies (± %)", keys: [["crossings", "paceVary"]], min: 0, max: 200, step: 1, get: () => P.crossings.paceVary, set: (v) => (P.crossings.paceVary = v) },
    { label: "skip the commonest (words)", keys: [["crossings", "skipCommon"]], min: 0, max: 500, step: 5, get: () => P.crossings.skipCommon, set: (v) => (P.crossings.skipCommon = v) },
    { label: "shortest word (letters)", keys: [["crossings", "minLetters"]], min: 1, max: 8, step: 1, get: () => P.crossings.minLetters, set: (v) => (P.crossings.minLetters = v) },
    // spacing per line, % of normal: list rows (100% = lines set solid) and the spaces between words
    // (0% = words touching; below, they run into each other); "cramped share" of lines are under 100%
    { label: "cramped share (%)", keys: [["crossings", "cramped"]], min: 0, max: 100, step: 1, get: () => P.crossings.cramped, set: (v) => (P.crossings.cramped = v) },
    { label: "list rows, tightest (%)", keys: [["crossings", "rowTight"]], min: 5, max: 100, step: 1, get: () => P.crossings.rowTight, set: (v) => (P.crossings.rowTight = v) },
    { label: "word spaces, tightest (%)", keys: [["crossings", "wordTight"]], min: -300, max: 100, step: 5, get: () => P.crossings.wordTight, set: (v) => (P.crossings.wordTight = v) },
    { label: "widest spacing (%)", keys: [["crossings", "widest"]], min: 100, max: 400, step: 5, get: () => P.crossings.widest, set: (v) => (P.crossings.widest = v) },
    { label: "list wobble (%)", keys: [["crossings", "wobble"]], min: 0, max: 400, step: 5, get: () => (P.crossings.wobble / P.look.fontSize) * 100, set: (v) => (P.crossings.wobble = (v * P.look.fontSize) / 100) },
    { label: "off register (%)", keys: [["crossings", "misregister"]], min: 0, max: 150, step: 1, get: () => (P.crossings.misregister / P.look.fontSize) * 100, set: (v) => (P.crossings.misregister = (v * P.look.fontSize) / 100) },
    { label: "toward open space (%)", keys: [["crossings", "spread"]], min: 0, max: 100, step: 1, get: () => P.crossings.spread, set: (v) => (P.crossings.spread = v) },
    { label: "keep to the page (%)", keys: [["crossings", "keepOnPage"]], min: 0, max: 100, step: 1, get: () => P.crossings.keepOnPage, set: (v) => (P.crossings.keepOnPage = v) },
    { label: "chance (%)", keys: [["crossings", "chance"]], min: 0, max: 100, step: 1, get: () => P.crossings.chance * 10, set: (v) => (P.crossings.chance = v / 10) },
    { label: "page width (lines)", keys: [["crossings", "pageWidth"]], min: 1, max: 15, step: 0.1, get: () => P.crossings.pageWidth / 1200, set: (v) => (P.crossings.pageWidth = v * 1200) },
    { bool: ["crossings", "follow"], label: "camera follows the writing" },
    { label: "lean toward the newest line (%)", keys: [["crossings", "lean"]], min: 0, max: 100, step: 1, get: () => P.crossings.lean, set: (v) => (P.crossings.lean = v) },
    { label: "camera move (s)", keys: [["crossings", "camMove"]], min: 0.1, max: 20, step: 0.1, get: () => (P.crossings.camMove * sp()) / 1000, set: (v) => (P.crossings.camMove = (v * 1000) / sp()) },
    { label: "older lines ink (%)", keys: [["crossings", "olderInk"]], min: 0, max: 100, step: 1, get: () => P.crossings.olderInk, set: (v) => (P.crossings.olderInk = v) },
    { label: "pause between lines (s)", keys: [["crossings", "stepHold"]], min: 0, max: 10, step: 0.05, get: () => (P.crossings.stepHold * sp()) / 1000, set: (v) => (P.crossings.stepHold = (v * 1000) / sp()) },
    { label: "pause at the end (s)", keys: [["crossings", "hold"]], min: 0, max: 30, step: 0.1, get: () => (P.crossings.hold * sp()) / 1000, set: (v) => (P.crossings.hold = (v * 1000) / sp()) },
  ] },
  all: { of: "all", controls: [
    { bool: ["all", "intro"], label: "title card" },
    { label: "Howe scatters per cycle", keys: [["all", "howeRepeats"]], min: 0, max: 12, step: 1, get: () => P.all.howeRepeats, set: (v) => (P.all.howeRepeats = v) },
    { label: "title card pause (s)", keys: [["all", "introHold"]], min: 0, max: 60, step: 0.1, get: () => (P.all.introHold * sp()) / 1000, set: (v) => (P.all.introHold = (v * 1000) / sp()) },
  ] },
};
const roundTo = (x, step) => { const d = String(step).split(".")[1]?.length || 0; return +(Math.round(x / step) * step).toFixed(d); };

export function buildGui({ modes, current, onMode, onRestart, onPause, groups = null, extra = null, onPanel = null }) {
  const gui = new GUI({ title: "settings" });
  const ctl = { mode: current, restart: onRestart, pause: () => onPause(), reset: () => { history.replaceState(null, "", location.pathname + location.hash); location.reload(); } };
  if (modes.length > 1) gui.add(ctl, "mode", modes).name("mode").onChange(onMode);
  gui.add(ctl, "restart").name(groups ? "a new one" : "start again");
  if (extra) for (const [label, fn] of extra) { const o = { f: () => fn(c) }; const c = gui.add(o, "f").name(label); }
  gui.add(ctl, "reset").name("back to the 2015 settings");
  const fire = (keys) => { writeUrl(); for (const [g, k] of keys) listeners.forEach((fn) => fn(g, k, P[g][k])); };
  for (const [name, sec] of Object.entries(PANEL)) {
    if (groups ? !groups.includes(sec.of) : sec.standalone) continue;   // standalone pages' settings stay off the root page
    const folder = gui.addFolder(name);
    if (sec.of !== "look" && sec.of !== current && current !== "all") folder.close();
    for (const c of sec.controls) {
      const direct = c.color || c.text || c.bool;
      if (direct) {
        const [g, k] = direct;
        (c.color ? folder.addColor(P[g], k) : folder.add(P[g], k)).name(c.label).onChange(() => fire([direct]));
        continue;
      }
      const o = {};
      Object.defineProperty(o, "v", { get: () => roundTo(c.get(), c.step), set: (v) => c.set(v) });
      const ctl = folder.add(o, "v", c.min, c.max, c.step).name(c.name ? c.name(o.v) : c.label);
      ctl.onChange(() => { if (c.name) ctl.name(c.name(o.v)); fire(c.keys); });
    }
  }
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "h") gui.show(gui._hidden);
    if (e.key === "r") onRestart();
  });
  gui.close();
  // open, the panel takes the right side of the window and the piece is refitted into what is left
  gui.onOpenClose((g) => { if (g === gui && onPanel) onPanel(!gui._closed); });
  return gui;
}
