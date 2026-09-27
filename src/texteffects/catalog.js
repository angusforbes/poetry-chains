// Twelve valence axes, each with an effect at either pole. A word gets two independent scores per axis
// (how much of the + pole, how much of the − pole), so a word can be torn (both high) without looking
// neutral (both low). Shared by the library, the pages and tools/jev_effects.py (reads the JSON block).
// BEGIN-CATALOG
export const AXES = [
  {"id": "mood",   "pos": {"name": "joy",       "q": "joyful, light, playful or glad",                "effect": "bounce"},       "neg": {"name": "sorrow",    "q": "sad, tearful, mournful or melting",           "effect": "liquid"}},
  {"id": "height", "pos": {"name": "ascent",    "q": "rising, lifting, hopeful or heavenward",        "effect": "rise"},         "neg": {"name": "descent",   "q": "sinking, heavy, falling or going down",       "effect": "sink"}},
  {"id": "heat",   "pos": {"name": "heat",      "q": "hot, fiery, passionate or consuming",           "effect": "burn"},         "neg": {"name": "cold",      "q": "cold, frozen, numb or chill",                 "effect": "freeze"}},
  {"id": "force",  "pos": {"name": "force",     "q": "forceful, loud, emphatic or commanding",        "effect": "embolden"},     "neg": {"name": "hush",      "q": "quiet, hushed, secret or whispered",          "effect": "whisper"}},
  {"id": "growth", "pos": {"name": "growth",    "q": "growing, blooming, beautiful or opening",       "effect": "bloom"},        "neg": {"name": "decay",     "q": "decaying, fragile, crumbling or turning to dust", "effect": "crumble"}},
  {"id": "life",   "pos": {"name": "life",      "q": "alive, beating, breathing or vital",            "effect": "pulse"},        "neg": {"name": "death",     "q": "dying, departing, ghostly or vanishing",      "effect": "evaporate"}},
  {"id": "calm",   "pos": {"name": "calm",      "q": "calm, idle, peaceful or drifting",              "effect": "drift"},        "neg": {"name": "fear",      "q": "fearful, anxious, awed or trembling",         "effect": "tremble"}},
  {"id": "pace",   "pos": {"name": "slow",      "q": "slow, long, enduring or drawn out",             "effect": "stretch"},      "neg": {"name": "sudden",    "q": "sudden, violent, breaking or piercing",       "effect": "shatter"}},
  {"id": "bond",   "pos": {"name": "together",  "q": "about coming together, embrace or attraction",  "effect": "attract"},      "neg": {"name": "apart",     "q": "about separation, distance or being alone",   "effect": "repel"}},
  {"id": "time",   "pos": {"name": "future",    "q": "about the future, anticipation or what is coming", "effect": "foreshadow"}, "neg": {"name": "memory", "q": "about memory, the past, repetition or echoes", "effect": "echo"}},
  {"id": "scale",  "pos": {"name": "vastness",  "q": "vast, cosmic, infinite or eternal",             "effect": "constellation"}, "neg": {"name": "closeness", "q": "tiny, close, intimate or minute",            "effect": "focus"}},
  {"id": "belief", "pos": {"name": "certainty", "q": "certain, sure, settled or true",                "effect": "engrave"},      "neg": {"name": "doubt",     "q": "doubtful, uncertain, loosening or coming undone", "effect": "unravel"}}
];
// END-CATALOG

export const EFFECTS = AXES.flatMap((a) => [
  { id: a.pos.effect, axis: a.id, pole: +1, name: a.pos.name },
  { id: a.neg.effect, axis: a.id, pole: -1, name: a.neg.name },
]);

export const EXAMPLES = {
  bounce: "glad", liquid: "tears", rise: "soar", sink: "grave", burn: "fire", freeze: "chill",
  embolden: "Truth", whisper: "hush", bloom: "rose", crumble: "dust", pulse: "heart", evaporate: "soul",
  drift: "float", tremble: "dread", stretch: "forever", shatter: "broke", attract: "together", repel: "alone",
  foreshadow: "tomorrow", echo: "remember", constellation: "Eternity", focus: "Gossamer", engrave: "certain", unravel: "undone",
};

/** From per-pole scores {axis: {pos, neg}} (0..1) and a gate (0..1): direction, ambivalence and effect weights. */
export function resolve(poles, gate = 1) {
  const out = { axes: {}, weights: {} };
  for (const a of AXES) {
    const p = poles[a.id] || { pos: 0, neg: 0 };
    const pos = p.pos * gate, neg = p.neg * gate;
    const direction = pos - neg, torn = Math.min(pos, neg);
    out.axes[a.id] = { pos, neg, direction, torn };
    out.weights[a.pos.effect] = Math.max(0, direction) + torn;
    out.weights[a.neg.effect] = Math.max(0, -direction) + torn;
  }
  return out;
}

/** Effect weights at time T: a torn axis flickers between its two effects instead of playing both or neither.
 *  threshold: weights below it are dropped and the rest rescaled, so faint scores stay still. */
export function weightsAt(resolved, T, { threshold = 0.18, flicker = 1.3 } = {}) {
  const w = {};
  const f = 0.5 + 0.5 * Math.sin(T * Math.PI * flicker);
  const keep = (x) => (x <= threshold ? 0 : (x - threshold) / (1 - threshold));
  for (const a of AXES) {
    const r = resolved.axes[a.id];
    if (!r) continue;
    w[a.pos.effect] = keep(Math.max(0, r.direction) + r.torn * 2 * f);
    w[a.neg.effect] = keep(Math.max(0, -r.direction) + r.torn * 2 * (1 - f));
  }
  return w;
}
