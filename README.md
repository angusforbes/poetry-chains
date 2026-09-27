# Poetry Chains (2026 port)

A port of [PoetryChains](https://github.com/CreativeCodingLab/PoetryChains) (Angus Forbes with Paul Murray, ELO 2015)
to current three.js, with glyphs drawn by the Slug algorithm, the Java corpus engine rewritten in JavaScript,
and every hard-coded number turned into a live parameter. Defaults are the 2015 values: untouched, it looks and moves the same.

- `npm install` then `npm run dev` → http://127.0.0.1:8890/ (`#chain`, `#lines`, `#colocation`, `#howe`, `#intro`, or `#all`)
- Transport (bottom): pause (space), speed slider (`[` `]` halve/double, `1` resets), time slider to scrub (← → 5 s, shift 30 s, Home). `t` hides it.
  Every performance is seeded (`?seed=` in the URL) and replays exactly, which is how scrubbing backwards works.
- Parameters: the panel top right (or `h` to hide it). Every change is written to the URL, so a state is a link.
  `space` pauses, `r` restarts.
- `src/corpus/Corpus.js`: the Java backend (Parser, ChainMaker, NetMaker, LineMaker, HoweMaker), same randomness.
- `src/vis/`: the five visualisations, ported from the CoffeeScript; `tween.js` stands in for d3 v3 transitions.
- `src/slug/`: vendored from [three-slug](https://github.com/manthrax/JSlug) (MIT/Apache, see LICENSE-MIT and NOTICE);
  local changes: opentype.js 2 import, and the 200 px sharpness cap raised (it blurred large glyphs).
- `public/fonts/OpenBaskerville.ttf`: built from the Open Baskerville UFO sources with fontmake (OFL; cubic → quadratic for Slug).
- `public/corpus/dickinson.txt`: the corpus shipped with the original.
