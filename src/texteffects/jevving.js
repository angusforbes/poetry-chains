// /jevving/: a poem read through at a tempo, each word performed with the effects Jev gave it.
// Data: public/jevving/<n>.json from tools/jev_effects.py: per word, per layer (word alone, in its line, in its
// stanza), two scores per axis (+ pole, − pole) and a gate (does the word matter at all?).
import "./pages.css";
import { TextFX, AXES, resolve, weightsAt } from "./index.js";

const BASE = import.meta.env.BASE_URL;
new FontFace("Open Baskerville", `url(${BASE}fonts/OpenBaskerville.ttf)`).load().then((f) => document.fonts.add(f));
const $ = (s) => document.querySelector(s);
const tx = await TextFX.create($("#stage"), { fontUrl: `${BASE}fonts/OpenBaskerville.ttf` });

const LAYERS = ["word", "line", "stanza", "combined"];
// rhymes: a light highlighter per pair/group (which words rhyme), and the ink of the rhyming letters for the kind
const HIGHLIGHT = [[1.00, 0.94, 0.55], [0.72, 0.93, 0.70], [1.00, 0.78, 0.87], [0.74, 0.87, 1.00], [1.00, 0.85, 0.66],
                   [0.86, 0.80, 1.00], [0.70, 0.93, 0.88], [1.00, 0.80, 0.74], [0.90, 0.93, 0.62], [0.82, 0.90, 0.96]];
// the kind of rhyme is set in the type: exact rhymes bold, slant rhymes italic, the looser kinds underlined
const INK = [0.04, 0.04, 0.04];
const KIND = {
  perfect:     { ink: INK, bold: true, label: "perfect", note: "same vowel and ending: bold" },
  identical:   { ink: INK, bold: true, label: "identical", note: "the same word again: bold" },
  slant:       { ink: INK, italic: true, label: "slant", note: "same final consonants, different vowel: italic" },
  "vowel-end": { ink: INK, underline: true, label: "vowel ending", note: "both end on a similar vowel: underlined" },
  assonance:   { ink: INK, underline: true, label: "assonance", note: "same stressed vowel: underlined" },
  weak:        { ink: [0.12, 0.45, 0.45], underline: true, label: "weak", note: "only the last, unstressed syllable: underlined, teal" },
};
const kindCss = (k) => `color:${css(k.ink)};${k.bold ? "font-weight:bold;-webkit-text-stroke:0.35px currentColor;" : ""}${k.italic ? "font-style:italic;" : ""}${k.underline ? "text-decoration:underline;text-underline-offset:3px;" : ""}`;
const css = (c, a = 1) => `rgba(${c.map((x) => Math.round(x * 255)).join(",")},${a})`;
const S = { top: 3, rhymes: true, poem: null, layer: "combined", wpm: 70, playing: true, threshold: 0.18, cur: 0, sel: null, T: 0, words: [], built: -1 };
const params = new URLSearchParams(location.search);

// ── scores for a word at a layer → effect weights ──
function polesOf(w, layer) {
  if (layer === "combined") return { poles: w.poles, gate: w.gate };
  return { poles: w.layers[layer].poles, gate: w.layers[layer].gate };
}
function resolved(w, layer = S.layer) { const p = polesOf(w, layer); return resolve(p.poles, p.gate); }

// ── rhymes (from tools/rhymes.py): per word {family, letters [from, to]}, and how strong its best pair is ──
function rhymeOf(i) { return S.poem.rhymes?.word?.[i]; }
function rhymeStrength(i) {
  let best = 0;
  for (const p of S.poem.rhymes?.pairs || []) if (p.a === i || p.b === i) best = Math.max(best, p.strength);
  return best;
}
/** the tint for word i at time T: once read it keeps its family colour; when a later member of its family is
 *  read, every member flashes (a sonic callback). Slant rhymes are paler and flicker. */
function rhymeTint(i, T) {
  const r = S.rhymes && rhymeOf(i);
  if (!r || T < S.times[i]) return null;
  const fam = S.poem.rhymes.families[r.family];
  let flash = 0;
  for (const j of fam) { const dt = T - S.times[j]; if (dt >= 0 && dt < 1.8) flash = Math.max(flash, 1 - dt / 1.8); }
  const kind = KIND[r.kind] || KIND.perfect;
  return { from: r.letters[0], to: r.letters[1], color: kind.ink, amount: 0.9, bold: kind.bold, italic: kind.italic, underline: kind.underline,
           highlight: { from: r.letters[0], to: r.letters[1], color: HIGHLIGHT[r.family % HIGHLIGHT.length], alpha: Math.min(1, 0.55 + 0.45 * flash) } };
}

// ── timing: each word gets a beat, longer words a little more; its performance spans 2.5 beats ──
function schedule() {
  let t = 0;
  const beat = 60 / S.wpm;
  S.times = S.poem.words.map((w, i) => {
    const prev = S.poem.words[i - 1];
    if (prev && (prev.stanza !== w.stanza)) t += beat * 2.5; else if (prev && prev.line !== w.line) t += beat * 0.8;
    const at = t; t += beat * (0.75 + Math.min(0.9, w.text.length * 0.07)); return at;
  });
  S.total = t + beat * 3;
  S.perf = beat * 2.6;
}

// ── the stanza on the canvas: every segment of every line is a Word (words animate, punctuation stays) ──
function buildStanza(si) {
  tx.clear(); S.words = []; S.built = si;
  const lines = S.poem.stanzas[si];
  const ratio = Math.max(...lines.map((l) => tx.measure(l, 1)));
  const size = Math.min(64, (tx.width * 0.78) / ratio, (tx.height * 0.5) / (lines.length * 1.5));
  const lh = size * 1.5, top = tx.height * 0.3 - lh * 0.8;
  const byLine = S.poem.words.map((w, i) => ({ w, i })).filter(({ w }) => w.stanza === si);
  lines.forEach((line, li) => {
    const x0 = -tx.measure(line, size) / 2, y = top - li * lh;
    const ws = byLine.filter(({ w }) => w.line === li);
    let pos = 0;
    const seg = (a, b, idx) => {
      if (b <= a) return;
      const text = line.slice(a, b);
      if (!text.trim()) return;
      const word = tx.word(text, { x: x0 + tx.measure(line.slice(0, a), size), y, size });
      S.words.push({ word, idx });
    };
    for (const { w, i } of ws) { seg(pos, w.start, -1); seg(w.start, w.end, i); pos = w.end; }
    seg(pos, line.length, -1);
  });
}

// ── the poem as text, and the detail panel ──
function renderText() {
  const el = $("#poem"); el.innerHTML = "";
  S.poem.stanzas.forEach((lines, si) => {
    const st = document.createElement("div"); st.className = "stanza";
    lines.forEach((line, li) => {
      const ln = document.createElement("div"); ln.className = "line";
      const ws = S.poem.words.map((w, i) => ({ w, i })).filter(({ w }) => w.stanza === si && w.line === li);
      let pos = 0;
      for (const { w, i } of ws) {
        ln.append(line.slice(pos, w.start));
        const sp = document.createElement("span"); sp.className = "w"; sp.dataset.i = i;
        const r = S.rhymes && rhymeOf(i);
        if (r) {
          const k = document.createElement("span"); k.className = "rh"; k.textContent = w.text.slice(r.letters[0], r.letters[1]);
          k.style.cssText = kindCss(KIND[r.kind] || KIND.perfect); k.style.background = css(HIGHLIGHT[r.family % HIGHLIGHT.length]);
          k.title = `${(KIND[r.kind] || KIND.perfect).label} rhyme${r.where === "internal" ? ", internal" : ""}`;
          sp.append(w.text.slice(0, r.letters[0]), k, w.text.slice(r.letters[1]));
        } else sp.textContent = w.text;
        sp.style.setProperty("--g", w.gate.toFixed(2));
        sp.onclick = () => { S.sel = i; seek(i); detail(); };
        ln.append(sp); pos = w.end;
      }
      ln.append(line.slice(pos));
      const sch = S.rhymes && S.poem.rhymes?.scheme?.[`${si}.${li}`];
      if (sch) { const m = document.createElement("span"); m.className = "scheme"; m.textContent = sch; ln.append(m); }
      st.append(ln);
    });
    el.append(st);
  });
}

function bar(pos, neg, cls) {
  // bipolar: − pole grows left from the centre, + pole grows right; both filled = torn
  if (cls === "g") return `<span class="bar g"><i class="p" style="--x:${(pos * 100).toFixed(0)}"></i></span>`;
  return `<span class="bar"><i class="n" style="width:${(neg * 50).toFixed(1)}%"></i><i class="p" style="width:${(pos * 50).toFixed(1)}%"></i></span>`;
}
function detail() {
  const i = S.sel ?? S.cur, w = S.poem.words[i];
  if (!w) return;
  const lay = LAYERS.map((L) => polesOf(w, L));
  const r = resolved(w, "combined");
  let h = `<div class="dw">${w.text}</div><div class="muted dl">“${S.poem.stanzas[w.stanza][w.line]}”</div>
    <table><tr><th></th>${LAYERS.map((L) => `<th class="${L === S.layer ? "on" : ""}">${L}</th>`).join("")}</tr>
    <tr class="gate"><td>gate <small>matters?</small></td>${lay.map((p) => `<td>${bar(p.gate, 0, "g")}<em>${p.gate.toFixed(2)}</em></td>`).join("")}</tr>`;
  for (const a of AXES) {
    const tr = r.axes[a.id];
    const tag = tr.torn > 0.25 ? `<b class="torn">torn</b>` : "";
    h += `<tr><td><span class="nn">${a.neg.name}</span> ⟷ <span class="pn">${a.pos.name}</span>${tag}</td>${lay.map((p) => {
      const q = p.poles[a.id]; return `<td>${bar(q.pos * p.gate, q.neg * p.gate, "")}</td>`;
    }).join("")}</tr>`;
  }
  h += `</table>`;
  const rr = rhymeOf(i);
  if (rr) {
    const mates = (S.poem.rhymes.pairs || []).filter((p) => p.a === i || p.b === i).map((p) => {
      const o = S.poem.words[p.a === i ? p.b : p.a];
      return `${o.text} <span class="muted">${p.kind}${p.jev != null ? ", Jev " + p.jev.toFixed(2) : ""} → ${p.strength.toFixed(2)}</span>`;
    });
    h += `<div class="fx"><span style="background:${css(HIGHLIGHT[rr.family % HIGHLIGHT.length])};${kindCss(KIND[rr.kind] || KIND.perfect)}">rhymes with</span> ${mates.join(" · ")}</div>`;
  }
  const wts = weightsAt(r, 0.5, { threshold: S.threshold, top: S.top });
  const on = Object.entries(wts).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  h += `<div class="fx">${on.length ? on.map(([k, v]) => `${k} <span class="muted">${v.toFixed(2)}</span>`).join(" · ") : `<span class="muted">still</span>`}</div>`;
  $("#detail").innerHTML = h;
}

function highlight() {
  for (const el of document.querySelectorAll("#poem .w")) {
    el.classList.toggle("cur", +el.dataset.i === S.cur);
    el.classList.toggle("sel", +el.dataset.i === S.sel);
  }
}

function seek(i) { S.T = S.times[i] - 0.05; }

// ── load a poem ──
async function load(n) {
  S.poem = await (await fetch(`${BASE}jevving/${n}.json`)).json();
  S.cur = 0; S.sel = null; S.T = 0; S.built = -1;
  schedule(); renderText(); detail();
  history.replaceState(null, "", `?poem=${n}`);
}

// ── controls ──
const index = await (await fetch(`${BASE}jevving/index.json`)).json();
$("#poemsel").innerHTML = index.map((p) => `<option value="${p.number}">${p.title.replace(/ —$/, "")}</option>`).join("");
$("#poemsel").onchange = (e) => load(e.target.value);
for (const L of LAYERS) {
  const b = document.createElement("button"); b.textContent = L; b.dataset.l = L;
  b.onclick = () => { S.layer = L; syncLayer(); detail(); };
  $("#layers").append(b);
}
$("#key").innerHTML = Object.values(KIND).map((k) => `<span title="${k.note}" style="${kindCss(k)}">${k.label}</span>`).join(" · ")
  + ` <span class="muted">· highlighter colour = which words rhyme together</span>`;
function syncLayer() { for (const b of document.querySelectorAll("#layers button")) b.classList.toggle("on", b.dataset.l === S.layer); }
syncLayer();
$("#rhymes").onclick = () => { S.rhymes = !S.rhymes; $("#rhymes").classList.toggle("on", S.rhymes); renderText(); highlight(); detail(); };
$("#rhymes").classList.toggle("on", S.rhymes);
$("#play").onclick = () => { S.playing = !S.playing; $("#play").textContent = S.playing ? "pause" : "play"; };
$("#wpm").oninput = (e) => { S.wpm = +e.target.value; $("#wpmv").textContent = S.wpm + " words/min"; schedule(); S.T = S.times[S.cur]; };
$("#top").oninput = (e) => { S.top = +e.target.value; $("#topv").textContent = S.top; detail(); };
$("#thr").oninput = (e) => { S.threshold = +e.target.value; $("#thrv").textContent = S.threshold.toFixed(2); detail(); };
addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.key === " ") { e.preventDefault(); $("#play").click(); }
  if (e.key === "ArrowRight") seek(Math.min(S.poem.words.length - 1, S.cur + 1));
  if (e.key === "ArrowLeft") seek(Math.max(0, S.cur - 1));
});

const first = params.get("poem") || index[0].number;
$("#poemsel").value = first;
await load(first);

// ── frame ──
let last = performance.now() / 1000;
function frame() {
  const now = performance.now() / 1000, dt = Math.min(0.1, now - last); last = now;
  if (S.playing) S.T += dt;
  if (S.T > S.total) S.T = 0;
  let cur = 0;
  while (cur + 1 < S.times.length && S.times[cur + 1] <= S.T) cur++;
  if (cur !== S.cur) { S.cur = cur; highlight(); if (S.sel == null) detail(); }
  const si = S.poem.words[cur].stanza;
  if (si !== S.built) buildStanza(si);
  for (const { word, idx } of S.words) {
    if (idx < 0) { word.update({ t: 0, T: S.T }, {}); continue; }
    const t = (S.T - S.times[idx]) / S.perf;
    const w = S.poem.words[idx];
    const tint = rhymeTint(idx, S.T);
    word.highlight(tint && tint.highlight);
    if (t < 0 || t > 1) { word.update({ t: 0, T: S.T }, {}, t < 0 ? 0.55 : 1, tint); continue; }   // not yet read: faint
    word.update({ t, T: S.T - S.times[idx] }, weightsAt(resolved(w), S.T, { threshold: S.threshold, top: S.top }), 1, tint);
  }
  tx.render();
  requestAnimationFrame(frame);
}
highlight();
frame();
