#!/usr/bin/env python3
"""Generate the page HTML files: the whole piece and each mode, plain and /controls. Run from the repo root."""
import os

TRANSPORT = '''<div id="transport">
  <button id="play" title="space">pause</button>
  <label title="[ and ] halve and double · 1 resets · double-click resets">speed <input id="rate" type="range" min="-4" max="5" step="0.01" value="0"><span id="rlabel">1×</span></label>
  <div id="timewrap"><input id="time" type="range" min="0" max="300000" step="10" value="0" title="drag to move through it · ← → five seconds · shift thirty · Home to the start"><div id="marks"></div></div>
  <span id="which"></span>
  <span id="tlabel">0:00 / 0:00</span>
  <span id="seekmsg">finding the place…</span>
</div>
'''
TPL = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>html, body {{ margin: 0; height: 100%; overflow: hidden; background: #fff; }} canvas {{ display: block; }}</style>
</head>
<body>
{transport}{config}<script type="module" src="/src/main.js"></script>
</body>
</html>
'''
NAMES = {"chain": "Poetry Chains", "lines": "Lines", "colocation": "Collocation Nets", "howe": "Howe", "all": "Poetry Chains & Collocation Nets"}

for mode, title in NAMES.items():
    for controls in (False, True):
        d = f"{mode}/controls" if controls else mode
        os.makedirs(d, exist_ok=True)
        once = "false" if mode == "all" else "true"
        cfg = f'<script>window.PC_CONFIG = {{ mode: "{mode}", once: {once}, controls: {"true" if controls else "false"} }};</script>\n'
        open(f"{d}/index.html", "w").write(TPL.format(title=f"{title} · Emily Dickinson", transport=TRANSPORT if controls else "", config=cfg))
# the root: the whole piece with controls, #chain etc. pick a mode
open("index.html", "w").write(TPL.format(title="Poetry Chains · Emily Dickinson", transport=TRANSPORT, config=""))
print("wrote", len(NAMES) * 2 + 1, "pages")
