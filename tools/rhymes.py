#!/usr/bin/env python3
"""Find the rhymes, off-rhymes and internal rhymes of a Dickinson poem, from sound (CMU Pronouncing Dictionary).

    python3 tools/rhymes.py 712 254 280         # adds "rhymes" to public/jevving/<n>.json

For every pair of words that could rhyme (line-end words within a stanza, and content words within a line or
between neighbouring lines) it compares their sounds from the last stressed vowel to the end:
  perfect      same stressed vowel and everything after it                       ("stop" / "stopped" excluded: same stem)
  slant        same final consonants, different vowel (Dickinson's off-rhyme)      ("seemed" / "Brain"? no; "chill" / "Tulle")
  vowel-end    both end in a vowel sound, similar vowels ("me" / "Immortality" / "away" / "Civility")
  assonance    same stressed vowel, different consonants                           ("feathers" / "never")
  weak         same final unstressed syllable ("Civility" / "Eternity")
Each pair gets a strength 0..1. Pairs in the doubtful middle are checked with Jev ("do these sound like a rhyme or
near-rhyme when read aloud?") when a TypeSafe key exists; its answer is averaged in. Pairs above a threshold are
joined into rhyme families (one colour each on the page). For each word the rhyming letters (the spelling of the
rhyming part) are marked, so the page can colour just those.

The dictionary is downloaded once to ~/.cache/cmudict/cmudict.dict (BSD licence; not stored in the repo).
"""
import json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
OUT = os.path.join(ROOT, "public/jevving")
DICT = os.path.expanduser("~/.cache/cmudict/cmudict.dict")
URL = "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict"
FAMILY_AT = 0.55          # a pair at least this strong joins a family
VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}
# vowels that sound close (for off-rhymes ending in a vowel)
NEAR = [{"IY", "IH", "EY"}, {"EY", "EH", "AY"}, {"AA", "AO", "AH", "OW"}, {"UW", "UH", "OW"}, {"AW", "OW", "AO"}, {"AE", "EH"}]

def load_dict():
    if not os.path.exists(DICT):
        os.makedirs(os.path.dirname(DICT), exist_ok=True)
        urllib.request.urlretrieve(URL, DICT)
    d = {}
    for line in open(DICT, encoding="latin-1"):
        parts = line.split("#")[0].split()
        if not parts: continue
        w = re.sub(r"\(\d+\)$", "", parts[0])
        d.setdefault(w, []).append(parts[1:])
    return d

CMU = load_dict()

def norm(w): return w.lower().replace("’", "'").strip("'")

def guess(w):
    """rough letter-to-sound for words the dictionary lacks: good enough for rhyme endings"""
    s = norm(w)
    s = re.sub(r"e$", "", s) if len(s) > 3 else s
    rules = [("tion", "SH AH0 N"), ("ight", "AY1 T"), ("ee", "IY1"), ("ea", "IY1"), ("oo", "UW1"), ("ou", "AW1"), ("ow", "OW1"),
             ("ay", "EY1"), ("ai", "EY1"), ("oa", "OW1"), ("y", "IY0"), ("ul", "UW1 L"), ("a", "AE1"), ("e", "EH1"), ("i", "IH1"),
             ("o", "AA1"), ("u", "AH1"), ("ck", "K"), ("ll", "L"), ("ss", "S"), ("th", "TH"), ("sh", "SH"), ("ch", "CH")]
    out, i = [], 0
    while i < len(s):
        for g, p in rules:
            if s.startswith(g, i): out += p.split(); i += len(g); break
        else:
            c = s[i].upper()
            out.append({"C": "K", "Q": "K", "X": "K S", "J": "JH"}.get(c, c)); i += 1
    ph = " ".join(out).split()
    ph = [x for k, x in enumerate(ph) if k == 0 or x != ph[k - 1] or x[:2] in VOWELS]   # "ll" is one L
    return [ph]

def prons(w):
    n = norm(w)
    for k in (n, n.rstrip("s")):
        if k in CMU: return CMU[k], False
    return guess(w), True

def tail(p):
    """(stressed vowel, sounds after it, final consonants, last vowel) of one pronunciation"""
    idx = [i for i, ph in enumerate(p) if ph[:2] in VOWELS]
    if not idx: return None
    st = [i for i in idx if p[i][-1] in "12"]
    k = st[-1] if st else idx[-1]
    last_v = idx[-1]
    return {"v": p[k][:2], "after": [x.rstrip("012") for x in p[k + 1:]], "coda": [x for x in p[last_v + 1:]],
            "lastv": p[last_v][:2], "lastsyl": [x.rstrip("012") for x in p[last_v - 1 if last_v > 0 and p[last_v - 1][:2] not in VOWELS else last_v:]],
            "n_after_vowels": sum(1 for i in idx if i > k)}

def near(a, b): return a == b or any(a in g and b in g for g in NEAR)

def compare(wa, wb, end=False):
    """best (strength, kind) over all pronunciation pairs; at line ends a repeated word is an identical rhyme"""
    if norm(wa) == norm(wb): return (0.7, "identical") if end else (0, "same")
    if norm(wa).startswith(norm(wb)) or norm(wb).startswith(norm(wa)): return 0, "stem"
    best = (0, "")
    for pa in prons(wa)[0]:
        for pb in prons(wb)[0]:
            a, b = tail(pa), tail(pb)
            if not a or not b: continue
            if a["v"] == b["v"] and a["after"] == b["after"]: c = (1.0, "perfect")
            elif a["coda"] and a["coda"] == b["coda"]:
                c = ((0.65 if len(a["coda"]) > 1 else 0.55) + (0.07 if near(a["lastv"], b["lastv"]) else 0), "slant")
            elif not a["coda"] and not b["coda"] and near(a["lastv"], b["lastv"]): c = (0.62 if a["lastv"] == b["lastv"] else 0.5, "vowel-end")
            elif a["lastsyl"] == b["lastsyl"] and len(a["lastsyl"]) > 1: c = (0.55, "weak")
            elif a["v"] == b["v"] and a["after"] and b["after"] and a["after"][0][:2] in VOWELS: c = (0.4, "assonance")
            elif a["v"] == b["v"]: c = (0.42, "assonance")
            else: continue
            best = max(best, c)
    return best

def rhyme_letters(w, n_after_vowels):
    """spelling of the rhyming part: from the vowel group that carries the stressed vowel to the end"""
    groups = [m.start() for m in re.finditer(r"[aeiouyAEIOUY]+", w)]
    if w.lower().endswith("e") and len(groups) > 1 and groups[-1] == len(w) - 1: groups = groups[:-1]   # silent e
    if not groups: return [0, len(w)]
    k = max(0, len(groups) - 1 - n_after_vowels)
    return [groups[k], len(w)]

def jev_judge(pairs):
    """Jev's ear for the doubtful pairs: {(a,b): p}. Silent (empty) without a key."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
        from jev_effects import Jev
        jev = Jev()
    except Exception as e:
        print("  (no Jev: %s)" % e); return {}
    out = {}
    for a, b, la, lb in pairs:
        ans = jev.ask({"poet": "Emily Dickinson", "first": {"word": a, "line": la}, "second": {"word": b, "line": lb}},
                      {"rhyme": {"type": "noul", "instructions":
                                 "Emily Dickinson often rhymes by sound only in part: slant rhymes (me / Immortality, away / Civility, "
                                 "chill / Tulle) count. Read both lines aloud. Do these two words answer each other as a rhyme or "
                                 "slant rhyme, rather than being unrelated endings?"}})
        p = ((ans or {}).get("rhyme") or {}).get("noul")
        if isinstance(p, (int, float)): out[(a, b)] = p
    jev.save()
    return out

STOP = set("a an the and or but of to in on at by for with from as is was were be been am are it its i me my he him his she her we us our "
           "you your they them their this that these those not no so if then than too all some".split())

def analyse(num):
    path = os.path.join(OUT, f"{num}.json")
    d = json.load(open(path))
    words, stanzas = d["words"], d["stanzas"]
    ends = {}                                         # (stanza, line) -> index of the line's last word
    for i, w in enumerate(words): ends[(w["stanza"], w["line"])] = i
    cands = []
    for (s, l), i in ends.items():                    # end rhymes within a stanza
        for (s2, l2), j in ends.items():
            if s2 == s and l2 > l: cands.append((i, j, "end"))
    for i, a in enumerate(words):                     # internal: content words in the same or the next line
        if norm(a["text"]) in STOP or a.get("gate", 1) < 0.3: continue
        for j in range(i + 1, len(words)):
            b = words[j]
            if b["stanza"] != a["stanza"] or b["line"] > a["line"] + 1: break
            if norm(b["text"]) in STOP or b.get("gate", 1) < 0.3: continue
            if ends.get((a["stanza"], a["line"])) == i and ends.get((b["stanza"], b["line"])) == j: continue
            cands.append((i, j, "internal"))
    pairs = []
    for i, j, where in cands:
        s, kind = compare(words[i]["text"], words[j]["text"], end=where == "end")
        if s <= 0: continue
        if where == "internal" and s < 0.75: continue       # internal: only strong sound links
        # ballad stanzas rhyme lines 2 and 4 (and often 1 and 3): an expected position makes a weak match likelier
        la, lb, n = words[i]["line"], words[j]["line"], len(stanzas[words[i]["stanza"]])
        bonus = 0.12 if where == "end" and n == 4 and (la, lb) in ((1, 3), (0, 2)) else 0
        pairs.append({"a": i, "b": j, "where": where, "kind": kind, "sound": s, "bonus": bonus, "strength": round(min(1, s + bonus), 3)})
    doubtful = [p for p in pairs if 0.35 <= p["sound"] < 0.8]
    judged = jev_judge([(words[p["a"]]["text"], words[p["b"]]["text"],
                         stanzas[words[p["a"]]["stanza"]][words[p["a"]]["line"]], stanzas[words[p["b"]]["stanza"]][words[p["b"]]["line"]])
                        for p in doubtful])
    for p in doubtful:
        k = (words[p["a"]]["text"], words[p["b"]]["text"])
        if k in judged: p["jev"] = round(judged[k], 3); p["strength"] = round(min(1, 0.55 * p["sound"] + 0.45 * judged[k] + p["bonus"]), 3)
    # families (union-find over strong pairs)
    parent = list(range(len(words)))
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for p in pairs:
        if p["strength"] >= FAMILY_AT: parent[find(p["a"])] = find(p["b"])
    # the same rhyme sound in different stanzas is one family (one highlighter): join perfect matches across groups
    members = sorted({x for p in pairs if p["strength"] >= FAMILY_AT for x in (p["a"], p["b"])})
    for ii, x in enumerate(members):
        for y in members[ii + 1:]:
            if find(x) != find(y) and compare(words[x]["text"], words[y]["text"])[0] >= 1.0: parent[find(x)] = find(y)
    # a word that repeats a rhyme word in the same stanza carries that rhyme too ("a Fir — / But the Fir is Where"):
    # it joins the family as an identical echo
    for x in list(members):
        for y, w in enumerate(words):
            if y != x and w["stanza"] == words[x]["stanza"] and norm(w["text"]) == norm(words[x]["text"]) and y not in members:
                a_, b_ = min(x, y), max(x, y)
                pairs.append({"a": a_, "b": b_, "where": "internal", "kind": "identical", "sound": 0.7, "bonus": 0, "strength": 0.7})
                parent[find(y)] = find(x); members.append(y)
    fams, fam_of = {}, {}
    for p in pairs:
        if p["strength"] < FAMILY_AT: continue
        for x in (p["a"], p["b"]):
            r = find(x); fams.setdefault(r, set()).add(x)
    order = sorted(fams, key=lambda r: min(fams[r]))
    for fi, r in enumerate(order):
        for x in fams[r]: fam_of[x] = fi
    def best_kind(x):
        ps = [p for p in pairs if x in (p["a"], p["b"]) and p["strength"] >= FAMILY_AT]
        p = max(ps, key=lambda p: p["strength"])
        return {"kind": p["kind"], "where": p["where"], "strength": p["strength"]}
    marks = {}
    for x in fam_of:
        pr, approx = prons(words[x]["text"])
        t = tail(pr[0]) or {"n_after_vowels": 0}
        marks[x] = rhyme_letters(words[x]["text"], t["n_after_vowels"])
    # the scheme: a letter per line end
    scheme, letter = {}, {}
    for (s, l), i in sorted(ends.items()):
        f = fam_of.get(i)
        if f is None: scheme[f"{s}.{l}"] = "·"; continue
        if f not in letter: letter[f] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[len(letter) % 26]
        scheme[f"{s}.{l}"] = letter[f]
    d["rhymes"] = {
        "pairs": [p for p in pairs if p["strength"] >= 0.35],
        "families": [sorted(fams[r]) for r in order],
        "word": {str(x): {"family": fam_of[x], "letters": marks[x], **best_kind(x)} for x in fam_of},
        "scheme": scheme,
    }
    json.dump(d, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{num}: {len(pairs)} pairs, {len(order)} families, {len(judged)} judged by Jev")
    for fi, r in enumerate(order):
        print("   ", fi, " / ".join(words[x]["text"] for x in sorted(fams[r])))

if __name__ == "__main__":
    for n in sys.argv[1:] or ["712"]: analyse(n)
