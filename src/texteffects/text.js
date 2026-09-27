// Words made of Slug letters (every glyph its own mesh, as in the rest of Poetry Chains), animated by FX.
// Standalone: its own renderer and orthographic camera in CSS pixels, so it never touches src/vis/Stage.js.
//
//   const tx = await TextFX.create(container, { fontUrl })
//   const w = tx.word("dust", { x: 0, y: 0, size: 96, align: "center" })
//   w.update({ t: 0.4, T: 1.2 }, { crumble: 0.8 })     // t = 0..1 through the word, T = seconds
//   tx.render()
import * as THREE from "three";
import { SlugGenerator } from "../slug/SlugGenerator.js";
import { SlugGeometry } from "../slug/SlugGeometry.js";
import { injectSlug } from "../slug/SlugMaterial.js";
import { FX, envelope } from "./effects.js";

const INK = [0.04, 0.04, 0.04];
const MAX_GHOSTS = 10;

// ── accumulator: what the effects write into, per letter ──
class Acc {
  reset() {
    this.x = 0; this.y = 0; this.rz = 0; this.sx = 1; this.sy = 1; this.op = 1; this.still = 0;
    this.inkR = 0; this.inkG = 0; this.inkB = 0; this.inkW = 0;
    this.ghosts = []; this.dots = []; this.lines = []; this.star = null;
    return this;
  }
  ink(c, amt) { if (amt <= 0) return; this.inkR += c[0] * amt; this.inkG += c[1] * amt; this.inkB += c[2] * amt; this.inkW += amt; }
  ghost(dx, dy, sx, sy, alpha, color) { if (alpha > 0.003 && this.ghosts.length < MAX_GHOSTS) this.ghosts.push({ dx, dy, sx, sy, alpha, color }); }
  dot(x, y, size, alpha, color) { if (alpha > 0.01 && size > 0.1) this.dots.push(x, y, size, alpha, color); }
  line(x0, y0, x1, y1, alpha, color) { if (alpha > 0.01) this.lines.push(x0, y0, x1, y1, alpha, color); }
  color() {
    if (this.inkW <= 0) return INK;
    const k = Math.min(1, this.inkW), w = this.inkW;
    return [INK[0] + (this.inkR / w - INK[0]) * k, INK[1] + (this.inkG / w - INK[1]) * k, INK[2] + (this.inkB / w - INK[2]) * k];
  }
}

// ── dots and hairlines: one buffer each, rebuilt every frame (stateless effects) ──
const DOT_VS = `attribute float size; attribute vec4 rgba; varying vec4 vC; uniform float dpr;
void main(){ vC = rgba; gl_PointSize = size * dpr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const DOT_FS = `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.3, r)); }`;
const LINE_VS = `attribute vec4 rgba; varying vec4 vC; void main(){ vC = rgba; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const LINE_FS = `varying vec4 vC; void main(){ gl_FragColor = vC; }`;

class Batch {
  constructor(kind, max) {
    this.kind = kind; this.max = max; this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.rgba = new Float32Array(max * 4); this.size = new Float32Array(max);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("rgba", new THREE.BufferAttribute(this.rgba, 4));
    if (kind === "dots") g.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: kind === "dots" ? DOT_VS : LINE_VS, fragmentShader: kind === "dots" ? DOT_FS : LINE_FS,
      uniforms: { dpr: { value: window.devicePixelRatio } }, transparent: true, depthTest: false, depthWrite: false,
    });
    this.obj = kind === "dots" ? new THREE.Points(g, mat) : new THREE.LineSegments(g, mat);
    this.obj.frustumCulled = false; this.obj.renderOrder = 2; this.geom = g;
  }
  begin() { this.n = 0; }
  push(x, y, c, a, size = 0) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = 0;
    this.rgba[i * 4] = c[0]; this.rgba[i * 4 + 1] = c[1]; this.rgba[i * 4 + 2] = c[2]; this.rgba[i * 4 + 3] = Math.min(1, a);
    this.size[i] = size;
  }
  end() {
    for (const k of ["position", "rgba", "size"]) if (this.geom.attributes[k]) this.geom.attributes[k].needsUpdate = true;
    this.geom.setDrawRange(0, this.n);
  }
}

export class TextFX {
  static async create(container, { fontUrl, background = "#ffffff" } = {}) {
    const tx = new TextFX();
    await tx.init(container, fontUrl, background);
    return tx;
  }

  async init(container, fontUrl, background) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(background);
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1000, 1000);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    const buf = await (await fetch(fontUrl)).arrayBuffer();
    const ot = await import("opentype.js");
    this.font = (ot.default || ot).parse(buf.slice(0));
    const gen = new SlugGenerator();
    gen.fullRange = true;                            // default is ASCII only: no em dashes or curly quotes
    this.slug = await gen.generateFromBuffer(buf.slice(0));
    this.glyphs = new Map();
    this.words = new Set();
    this.dots = new Batch("dots", 20000);
    this.lines = new Batch("lines", 40000);
    this.scene.add(this.dots.obj, this.lines.obj);
  }

  resize() {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    Object.assign(this.camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  glyph(ch, size) {
    const key = ch + "|" + size;
    if (this.glyphs.has(key)) return this.glyphs.get(key);
    const d = this.slug.codePoints.get(ch.codePointAt(0));
    let g = null;
    if (d && d.width > 0 && d.height > 0) {
      const s = size / this.font.unitsPerEm;
      g = new SlugGeometry(1);
      g.addGlyph(d, d.bearingX * s, d.bearingY * s, d.width * s, d.height * s, 0, 0);
      g.updateBuffers();
    }
    this.glyphs.set(key, g);
    return g;
  }

  mesh(geom) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
    mat.color.setRGB(...INK, THREE.SRGBColorSpace);
    injectSlug(mat, this.slug);
    const m = new THREE.Mesh(geom, mat);
    m.frustumCulled = false;
    return m;
  }

  /** width of a string at a size, with the font's advances and kerning */
  measure(text, size) {
    const s = size / this.font.unitsPerEm; let x = 0, prev = null;
    for (const ch of text) { const g = this.font.charToGlyph(ch); if (prev) x += this.font.getKerningValue(prev, g) * s; x += (g.advanceWidth || 0) * s; prev = g; }
    return x;
  }

  word(text, opts = {}) { const w = new Word(this, text, opts); this.words.add(w); return w; }
  remove(w) { this.words.delete(w); this.scene.remove(w.group); }
  clear() { for (const w of [...this.words]) this.remove(w); }

  /** draw: collects every word's dots/lines, then renders */
  render() {
    this.dots.begin(); this.lines.begin();
    for (const w of this.words) w.flush(this.dots, this.lines);
    this.dots.end(); this.lines.end();
    this.renderer.render(this.scene, this.camera);
  }
}

export class Word {
  constructor(tx, text, { x = 0, y = 0, size = 72, align = "left" } = {}) {
    this.tx = tx; this.text = text; this.size = size;
    const f = tx.font, s = size / f.unitsPerEm;
    this.group = new THREE.Group();
    tx.scene.add(this.group);
    const capH = (f.tables.os2?.sCapHeight || f.unitsPerEm * 0.66) * s;
    this.letters = [];
    let px = 0, prev = null;
    const chars = [...text];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i], g = f.charToGlyph(ch);
      if (prev) px += f.getKerningValue(prev, g) * s;
      const adv = (g.advanceWidth || 0) * s;
      const geom = tx.glyph(ch, size);
      const pivot = new THREE.Group();
      const main = geom ? tx.mesh(geom) : null;
      if (main) { main.position.set(-adv / 2, -capH * 0.45, 0); pivot.add(main); }
      this.group.add(pivot);
      this.letters.push({ ch, geom, pivot, main, ghosts: [], L: { i, n: chars.length, x: px, y: 0, w: adv, h: capH } });
      px += adv; prev = g;
    }
    this.width = px; this.capH = capH;
    for (const l of this.letters) { l.L.cx = px / 2; l.L.wordW = px; }
    this.acc = this.letters.map(() => new Acc());
    this.place(x, y, align);
    this.update({ t: 0, T: 0 }, {});
  }

  place(x, y, align = "left") {
    this.x = align === "center" ? x - this.width / 2 : align === "right" ? x - this.width : x;
    this.y = y;
    this.group.position.set(this.x, this.y, 0);
  }

  /** clock {t 0..1, T seconds, e? envelope}, weights {effectId: 0..1}, opacity (whole word) */
  update(clock, weights, opacity = 1) {
    const c = { t: clock.t, T: clock.T, e: clock.e ?? envelope(clock.t) };
    const active = Object.entries(weights).filter(([id, s]) => s > 0.001 && FX[id]);
    this.stars = [];
    for (let i = 0; i < this.letters.length; i++) {
      const l = this.letters[i], a = this.acc[i].reset();
      for (const [id, s] of active) FX[id](l.L, Math.min(1, s), c, a);
      const damp = 1 - 0.85 * a.still;
      const cx = l.L.x + l.L.w / 2, cy = l.L.h * 0.45;
      l.pivot.position.set(cx + a.x * damp, cy + a.y * damp, 0);
      l.pivot.rotation.z = a.rz * damp;
      l.pivot.scale.set(a.sx, a.sy, 1);
      const col = a.color(), op = Math.max(0, Math.min(1, a.op)) * opacity;
      if (l.main) { l.main.material.color.setRGB(...col, THREE.SRGBColorSpace); l.main.material.opacity = op; }
      this.ghosts(l, a, col, op);
      if (a.star) this.stars.push(a.star);
    }
  }

  ghosts(l, a, col, op) {
    if (!l.geom) return;
    while (l.ghosts.length < a.ghosts.length) {
      const m = this.tx.mesh(l.geom); m.position.copy(l.main.position); l.pivot.add(m); l.ghosts.push(m);
    }
    for (let k = 0; k < l.ghosts.length; k++) {
      const m = l.ghosts[k], g = a.ghosts[k];
      if (!g) { m.visible = false; continue; }
      m.visible = true;
      m.position.set(l.main.position.x * g.sx + g.dx, l.main.position.y * g.sy + g.dy, 0);
      m.scale.set(g.sx, g.sy, 1);
      m.material.color.setRGB(...(g.color || col), THREE.SRGBColorSpace);
      m.material.opacity = Math.min(1, g.alpha) * op;
    }
  }

  /** push this word's dots and hairlines (in word space) into the shared batches */
  flush(dots, lines) {
    const ox = this.x, oy = this.y;
    for (const a of this.acc) {
      for (let k = 0; k < a.dots.length; k += 5) dots.push(ox + a.dots[k], oy + a.dots[k + 1], a.dots[k + 4], a.dots[k + 3], a.dots[k + 2]);
      for (let k = 0; k < a.lines.length; k += 6) {
        lines.push(ox + a.lines[k], oy + a.lines[k + 1], a.lines[k + 5], a.lines[k + 4]);
        lines.push(ox + a.lines[k + 2], oy + a.lines[k + 3], a.lines[k + 5], a.lines[k + 4]);
      }
    }
    // constellation: join the stars into a figure
    const st = this.stars || [];
    for (let k = 1; k < st.length; k++) {
      const [x0, y0, a0] = st[k - 1], [x1, y1, a1] = st[k];
      lines.push(ox + x0, oy + y0, [0.25, 0.3, 0.55], 0.35 * Math.min(a0, a1));
      lines.push(ox + x1, oy + y1, [0.25, 0.3, 0.55], 0.35 * Math.min(a0, a1));
    }
  }
}
