# Poetry Chains

Animated walks through the collected poems of Emily Dickinson: a 2026 port of
[PoetryChains](https://github.com/CreativeCodingLab/PoetryChains) (Angus Forbes with Paul Murray, shown at
ELO 2015, Lydgalleriet, Bergen) to current three.js, with every letter drawn by the Slug GPU font algorithm.

## The pieces

Each plays one animation and stops; reload for a new one.

| | plain | with controls |
|---|---|---|
| **Poetry Chains**: lines linked by the words they share | [chain](https://angusforbes.github.io/poetry-chains/chain/) | [chain/controls](https://angusforbes.github.io/poetry-chains/chain/controls/) |
| **Lines**: every line that shares a word, stacked on it | [lines](https://angusforbes.github.io/poetry-chains/lines/) | [lines/controls](https://angusforbes.github.io/poetry-chains/lines/controls/) |
| **Collocation Nets**: a word and the words that keep its company | [colocation](https://angusforbes.github.io/poetry-chains/colocation/) | [colocation/controls](https://angusforbes.github.io/poetry-chains/colocation/controls/) |
| **Howe**: scattered, rotated lines, after Susan Howe (5 in a row) | [howe](https://angusforbes.github.io/poetry-chains/howe/) | [howe/controls](https://angusforbes.github.io/poetry-chains/howe/controls/) |

| **The whole piece**: every mode in the original order, looping forever | [all](https://angusforbes.github.io/poetry-chains/all/) | [all/controls](https://angusforbes.github.io/poetry-chains/all/controls/) |

The [root page](https://angusforbes.github.io/poetry-chains/) is the whole piece with controls
(`#chain`, `#lines`, `#colocation`, `#howe`, `#intro` pick one).

## Text effects and Jevving

- **[texteffects](https://angusforbes.github.io/poetry-chains/texteffects/)**: a letter-effects library
  (`src/texteffects/`, Slug letters like the rest of the piece) with fourteen valence axes, each with an effect at
  either pole (joy Bounce ↔ sorrow Liquid, ascent Rise ↔ descent Sink, heat Burn ↔ cold Freeze, force Embolden ↔
  hush Whisper, growth Bloom ↔ decay Crumble, life Pulse ↔ death Evaporate, calm Drift ↔ fear Tremble, slow
  Stretch ↔ sudden Shatter, together Attract ↔ apart Repel, future Foreshadow ↔ memory Echo, vastness
  Constellation ↔ closeness Focus, gust Gust ↔ rest Settle, percussion Beat ↔ resonance Ring, certainty Engrave ↔
  doubt Unravel), each with its own ink colour; effects move letters, copies of letters and soft dots only. The page lets you try any word.
- **[jevving](https://angusforbes.github.io/poetry-chains/jevving/)**: a poem read through at a tempo, each word
  performed with the effects [Jev](https://typesafe.ai) gave it. Each pole is scored separately, in three contexts
  (the word alone, in its line, in its stanza), plus a gate ("does this word matter here?") so words like "the"
  stay still; a word that is high on both poles is torn and flickers between the two effects. Scores are
  precomputed by `tools/jev_effects.py <poem numbers>` into `public/jevving/` (needs a TypeSafe key; cached).

## Controls (the /controls pages)

- **Parameter panel** (top right): every number the 2015 piece hard-coded, with the 2015 value as default.
  Changes are written to the URL, so a setting is a link. "Link to this animation" copies a URL that replays
  exactly this run.
- **Share sequence** (in the panel): copies a link to the plain page, no controls, that plays exactly these five
  animations with these settings and this speed (`?seed=…&animations=5&…`). "Copy a link to this one" does the
  same but keeps the controls.
- **Transport** (bottom): pause (space), speed from 1/16× to 32× (`[` `]`, `1` resets), and a time slider that
  scrubs anywhere in the animation (← → 5 s, shift 30 s, Home). `t` hides it, `r` makes a new animation.

The controls pages perform their five animations once, silently, on load, recording every transition
(letter fades, camera moves, word spreads) and every time a line or letter enters or leaves the scene
(`src/vis/timeline.js`). Any moment is then drawn straight from the recording, so the time slider shows
every frame instantly in either direction. Runs are seeded, so the recording matches the live performance
exactly.

## How it's made

- `src/corpus/Corpus.js`: the original Java backend (Parser, ChainMaker, NetMaker, LineMaker, HoweMaker) in
  JavaScript, same algorithms and randomness, running in the browser.
- `src/vis/`: the five visualisations, ported from the original CoffeeScript. `tween.js` replaces the
  d3 v3 transitions with a virtual clock that can pause, change rate and seek.
- `src/slug/`: vendored from [three-slug](https://github.com/manthrax/JSlug) (MIT/Apache-2.0), with two
  changes: opentype.js 2 import, and the 200 px sharpness cap raised (it blurred large glyphs).
- `public/fonts/OpenBaskerville.ttf`: the typeface of the original, built from the
  [Open Baskerville](https://github.com/klepas/open-baskerville) sources with fontmake (quadratic outlines,
  as Slug needs). SIL Open Font License.

## Run it

```
npm install
npm run dev        # http://127.0.0.1:8890/
npm run build      # static sites in dist/, one folder per page
```

Pushing to `main` rebuilds and deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Licence

MIT, as the original (© 2015 EVL Creative Coding Research Group at UIC). Third-party parts keep their own
licences; see `LICENSE`.
