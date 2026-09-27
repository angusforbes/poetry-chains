#!/usr/bin/env python3
"""Score every word of a Dickinson poem for the 20 text effects with Jev, at three layers of context.

    python3 tools/jev_effects.py 712 254 280        # poem numbers in public/corpus/dickinson.txt

Twelve valence axes (src/texteffects/catalog.js), each pole scored separately (0..4 -> 0..1), so a torn word
(both poles high) is not the same as a neutral one (both low). Layers (one Jev request per unique unit:
28 pole questions + 1 gate):
  word    the word alone
  line    the word inside its line
  stanza  the word inside its stanza (with the poem's first line as a title)
The gate asks whether the word, in that context, carries imagery or feeling worth animating at all; function
words ("the", "and") fail it, so they end up neutral. combined = mix of the three layers (weights LAYER_W),
multiplied by the mixed gate. The page derives direction (pos - neg) and ambivalence (min) from these.

Writes public/jevving/<number>.json (served with the site) and caches every answer in tools/.jev-cache.json
(keyed by sha1(model, state, questions)), so re-runs are free. Needs a TypeSafe key: TYPESAFE_API_KEY or
~/.pi/agent/secrets/typesafe_api_key. The key is never written anywhere.
"""
import hashlib, json, os, re, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
CORPUS = os.path.join(ROOT, "public/corpus/dickinson.txt")
OUT = os.path.join(ROOT, "public/jevving")
CACHE_F = os.path.join(ROOT, "tools/.jev-cache.json")
MODEL = "jev-latest"
LEVELS = ["not at all", "slightly", "moderately", "strongly", "overwhelmingly"]
LAYER_W = {"word": 0.2, "line": 0.4, "stanza": 0.4}

src = open(os.path.join(ROOT, "src/texteffects/catalog.js")).read()
block = src.split("// BEGIN-CATALOG")[1].split("// END-CATALOG")[0]
AXES = json.loads(block[block.index("["):block.rindex("]") + 1])
POLES = [(a["id"], side, a[side]) for a in AXES for side in ("pos", "neg")]

def key():
    k = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if k: return k
    return open(os.path.expanduser("~/.pi/agent/secrets/typesafe_api_key")).read().strip()

class Jev:
    def __init__(self):
        self.key = key()
        self.cache = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}
        self.lock = threading.RLock(); self.calls = self.hits = 0

    def ask(self, state, questions):
        h = hashlib.sha1(json.dumps([MODEL, state, questions], sort_keys=True).encode()).hexdigest()
        if h in self.cache:
            self.hits += 1; return self.cache[h]
        body = json.dumps({"state": state, "model": MODEL, "questions": questions}).encode()
        for i in range(6):
            req = urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=body,
                                         headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    ans = json.load(r)["answers"]; break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 529) and i < 5: time.sleep(2 ** i + 1); continue
                raise RuntimeError(f"jev {e.code}: {e.read()[:300]!r}")
            except (urllib.error.URLError, TimeoutError):
                time.sleep(2 ** i + 1)
        else:
            raise RuntimeError("jev: no answer after retries")
        with self.lock:
            self.cache[h] = ans; self.calls += 1
            if self.calls % 25 == 0: self.save()
        return ans

    def save(self):
        with self.lock:
            json.dump(self.cache, open(CACHE_F + ".tmp", "w")); os.replace(CACHE_F + ".tmp", CACHE_F)

def poem(number):
    text = open(CORPUS, encoding="utf-8").read()
    m = re.search(rf"(?m)^{number}\n\n(.*?)(?=\n\n\n+\d+\n|\Z)", text, re.S)
    if not m: sys.exit(f"poem {number} not found")
    stanzas = [[l for l in s.split("\n") if l.strip()] for s in m.group(1).strip().split("\n\n")]
    return [s for s in stanzas if s]

WORD = re.compile(r"[A-Za-z][A-Za-z’']*")

def questions(word):
    q = {f"{ax}.{side}": {"type": "score", "criteria": LEVELS,
                          "instructions": f'Read as a performer would: how strongly does the word "{word}", as used here, feel {p["q"]}?'}
         for ax, side, p in POLES}
    q["gate"] = {"type": "noul", "instructions":
                 f'Does the word "{word}", as used here, carry imagery, feeling or meaning strong enough to deserve a visual '
                 f'effect when the poem is read? Function words (the, and, of, to, a, it, his, was, but) and plain '
                 f'connectives do not.'}
    return q

def scores(ans):
    val = lambda k: round(min(1, max(0, (ans.get(k) or {}).get("score", 0) / (len(LEVELS) - 1))), 3)
    poles = {a["id"]: {"pos": val(f'{a["id"]}.pos'), "neg": val(f'{a["id"]}.neg')} for a in AXES}
    g = (ans.get("gate") or {}).get("noul")
    return {"poles": poles, "gate": round(g if isinstance(g, (int, float)) else 0, 3)}

def main():
    nums = sys.argv[1:] or ["712"]
    jev = Jev(); os.makedirs(OUT, exist_ok=True)
    for num in nums:
        st = poem(num); title = st[0][0]
        tokens, jobs = [], {}
        for si, stanza in enumerate(st):
            for li, line in enumerate(stanza):
                for m in WORD.finditer(line):
                    w = m.group(0)
                    tok = {"text": w, "stanza": si, "line": li, "start": m.start(), "end": m.end()}
                    states = {"word": {"word": w},
                              "line": {"word": w, "line": line},
                              "stanza": {"word": w, "stanza": "\n".join(stanza), "poem": f"Emily Dickinson, “{title}”"}}
                    tok["_states"] = states
                    for layer, s in states.items():
                        jobs[json.dumps([s, w], sort_keys=True)] = (s, w)
                    tokens.append(tok)
        print(f"{num}: {len(tokens)} words, {len(jobs)} requests ({sum(1 for k in jobs if hashlib.sha1(json.dumps([MODEL, jobs[k][0], questions(jobs[k][1])], sort_keys=True).encode()).hexdigest() in jev.cache)} cached)", flush=True)
        results = {}
        with ThreadPoolExecutor(6) as pool:
            futs = {k: pool.submit(jev.ask, s, questions(w)) for k, (s, w) in jobs.items()}
            for i, (k, f) in enumerate(futs.items()):
                results[k] = scores(f.result())
                if (i + 1) % 25 == 0: print(f"  {i + 1}/{len(futs)}", flush=True)
        jev.save()
        for tok in tokens:
            states = tok.pop("_states")
            layers = {L: results[json.dumps([s, tok["text"]], sort_keys=True)] for L, s in states.items()}
            gate = sum(LAYER_W[L] * layers[L]["gate"] for L in layers)
            poles = {a["id"]: {side: round(sum(LAYER_W[L] * layers[L]["poles"][a["id"]][side] for L in layers), 3)
                               for side in ("pos", "neg")} for a in AXES}
            tok.update(layers=layers, gate=round(gate, 3), poles=poles)
        out = {"number": int(num), "title": title, "author": "Emily Dickinson", "model": MODEL,
               "layerWeights": LAYER_W, "generated": int(time.time()), "stanzas": st, "words": tokens}
        json.dump(out, open(os.path.join(OUT, f"{num}.json"), "w"), ensure_ascii=False, separators=(",", ":"))
        print(f"  wrote public/jevving/{num}.json ({jev.calls} new requests, {jev.hits} cached)", flush=True)
    idx = sorted(int(f[:-5]) for f in os.listdir(OUT) if f.endswith(".json") and f[:-5].isdigit())
    json.dump([{"number": n, "title": json.load(open(os.path.join(OUT, f"{n}.json")))["title"]} for n in idx],
              open(os.path.join(OUT, "index.json"), "w"), ensure_ascii=False)

if __name__ == "__main__":
    main()
