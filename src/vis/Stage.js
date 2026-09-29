// Renderer, camera and text, with the helpers the original Main.coffee gave every visualisation.
// Conventions are kept from 2015 so the ported code (and its numbers) mean the same thing:
// the camera sits at z = -9 looking toward +z, the text parent is scaled by 0.005, one mesh per letter.
import * as THREE from "three";
import { SlugGenerator } from "../slug/SlugGenerator.js";
import { SlugGeometry } from "../slug/SlugGeometry.js";
import { injectSlug } from "../slug/SlugMaterial.js";
import { P } from "../params.js";
import { tween, wait as waitRaw } from "./tween.js";

const CAMERA_Z = -9;
const SCALE_TEXT = 0.005;

export class Stage {
  async init(fontUrl) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.inset = 0;                                   // width taken by the settings panel on the right
    this.renderer.setSize(this.viewW(), this.viewH());
    document.body.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { position: "fixed", left: "0px", top: "0px" });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(P.look.fov, this.viewW() / this.viewH(), 0.1, 1000);
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.lookAt(0, 0, 0);
    this.textColor = new THREE.Color(P.look.textColor);     // one Color shared by every letter: live recolouring
    this.applyLook();
    addEventListener("resize", () => this.layout());
    // pinch zoom (phones): see zoomView()
    if (window.visualViewport) for (const e of ["resize", "scroll"]) visualViewport.addEventListener(e, () => this.zoomView());
    const buf = await (await fetch(fontUrl)).arrayBuffer();
    const _ot = await import("opentype.js");
    this.font = (_ot.default || _ot).parse(buf.slice(0));
    const gen = new SlugGenerator();
    gen.fullRange = true;                            // default is ASCII only: no em dashes or curly quotes
    this.slug = await gen.generateFromBuffer(buf.slice(0));
    this.glyphs = new Map();
    this.hold = false;                                // true while seeking: nothing half-built gets drawn
    this.layoutVersion = 0;                           // bumped whenever tracking or leading is applied live
    this.layoutPos = (o, p, out) => out.copy(p);      // where an object sits under the current layout
    // what is drawn (view*) can differ from what is being built (scene/camera): a new recording is made
    // in a fresh scene while the previous one keeps playing
    this.renderer.setAnimationLoop(() => { if (!this.hold) this.renderer.render(this.viewScene || this.scene, this.viewCamera || this.camera); });
  }

  applyLook() {
    this.renderer.setClearColor(P.look.background);
    this.textColor.set(P.look.textColor);
    document.body.style.background = P.look.background;
    for (const c of new Set([this.camera, this.viewCamera].filter(Boolean))) if (c.fov !== P.look.fov) { c.fov = P.look.fov; c.updateProjectionMatrix(); }
  }

  get em() { return P.look.fontSize / this.font.unitsPerEm; }

  glyphGeometry(ch) {
    const key = ch + "|" + P.look.fontSize;
    let g = this.glyphs.get(key);
    if (g !== undefined) return g;
    const d = this.slug.codePoints.get(ch.codePointAt(0));
    g = null;
    if (d && d.width > 0 && d.height > 0) {
      const s = this.em;
      g = new SlugGeometry(1);
      g.addGlyph(d, d.bearingX * s, d.bearingY * s, d.width * s, d.height * s, 0, 0);
      g.updateBuffers();
    }
    this.glyphs.set(key, g);
    return g;
  }

  letterMesh(ch) {
    const geom = this.glyphGeometry(ch);
    let obj;
    if (geom) {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      mat.color = this.textColor;
      injectSlug(mat, this.slug);
      obj = new THREE.Mesh(geom, mat);
    } else {
      obj = new THREE.Object3D();                  // spaces keep their slot so string index = child index
      obj.material = { opacity: 0 };
    }
    obj.scale.set(-1, 1, 1);                         // seen from behind (camera at -z), so mirror x back
    obj._letter = ch;
    return obj;
  }

  /** one Object3D per line, one child per character, laid out with the font's advances and kerning */
  lineObject(text) {
    const s = this.em, f = this.font, chars = [...text];
    const line = new THREE.Object3D();
    // _p0: where each letter would sit at 0% tracking; the camera frames that (see snapshot)
    let x = 0, x0 = 0, prev = null;
    for (const ch of chars) {
      const g = f.charToGlyph(ch);
      if (prev) { const k = f.getKerningValue(prev, g) * s; x += k; x0 += k; }
      const m = this.letterMesh(ch);
      m.position.x = -x;
      m._p0 = new THREE.Vector3(-x0, 0, 0);
      line.add(m);
      x += (g.advanceWidth || 0) * s + P.look.letterSpacing;
      x0 += (g.advanceWidth || 0) * s;
      prev = g;
    }
    line._line = text;
    line._layout = { height: P.look.baseline, width: x, lineHeight: P.look.lineHeight };
    line._letters = function () { return this.children.map((d) => d._letter); };
    return line;
  }

  parentObject() {
    let o = this.scene.getObjectByName("parent");
    if (o) return o;
    o = new THREE.Object3D();
    o.scale.multiplyScalar(SCALE_TEXT);
    o.name = "parent";
    this.scene.add(o);
    return o;
  }

  // the page's own size (the layout viewport): unlike innerWidth, it doesn't shrink when a phone zooms in
  viewW() { return Math.max(200, (document.documentElement.clientWidth || innerWidth) - this.inset); }
  viewH() { return document.documentElement.clientHeight || innerHeight; }
  /** fit canvas and cameras to the space left beside the settings panel */
  layout(inset = this.inset) {
    this.inset = inset;
    for (const c of new Set([this.camera, this.viewCamera].filter(Boolean))) c.aspect = this.viewW() / this.viewH();
    this.zoomView();
    if (this.onLayout) this.onLayout();
  }
  /** Pinch zoom on a phone magnifies the page, and a canvas would be magnified as a bitmap (pixelated).
   *  So while zoomed in, the canvas covers only the part of the page on screen, at the screen's own
   *  resolution, and the cameras draw only that part of the full view (a view offset). The zoom is the
   *  reader's; the letters (Slug: drawn from their outlines) stay sharp at any zoom, at a constant cost. */
  zoomView() {
    const vv = window.visualViewport, W = this.viewW(), H = this.viewH(), dpr = window.devicePixelRatio || 1;
    const zoomed = !!vv && vv.scale > 1.01;
    const r = this.renderer, st = r.domElement.style;
    if (zoomed) {
      const x = Math.max(0, vv.offsetLeft), y = Math.max(0, vv.offsetTop);
      const w = Math.min(vv.width, W - x), h = Math.min(vv.height, H - y);
      r.setPixelRatio(dpr * vv.scale);
      r.setSize(w, h);
      st.left = x + "px"; st.top = y + "px";
      this.zoom = { W, H, x, y, w, h };
    } else {
      r.setPixelRatio(dpr);
      r.setSize(W, H);
      st.left = st.top = "0px";
      this.zoom = null;
    }
    for (const c of new Set([this.camera, this.viewCamera].filter(Boolean))) this.viewOffset(c);
  }
  viewOffset(c) {
    const z = this.zoom;
    if (z) c.setViewOffset(z.W, z.H, z.x, z.y, z.w, z.h); else c.clearViewOffset();
    c.updateProjectionMatrix();
  }

  /** a fresh scene and camera to build into (the view keeps showing the old ones until swapped) */
  fresh() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(P.look.fov, this.viewW() / this.viewH(), 0.1, 1000);
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.lookAt(0, 0, 0);
    this.viewOffset(this.camera);
  }
  showBuilt() { this.viewScene = this.scene; this.viewCamera = this.camera; }

  clear() {
    for (const c of [...this.scene.children]) this.scene.remove(c);
  }
}

/* ── boxes that can be recomputed ─────────────────────────────────────── */
function snapshot(objs) {
  const leaves = [];
  for (const root of objs) root.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.geometry.boundingBox) return;
    const chain = [];
    for (let a = m; a && !a.isScene; a = a.parent) chain.push({ o: a, p: (a._p0 || a.position).clone(), q: a.quaternion.clone(), s: a.scale.clone() });
    leaves.push({ bb: m.geometry.boundingBox, chain: chain.reverse() });
  });
  return { leaves, ver: -1, box: null };
}
const _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _p = new THREE.Vector3(), _b = new THREE.Box3();
/** the box of a snapshot's glyphs as laid out at 100% leading and 0% tracking: the camera frames that,
 *  so changing tracking or leading changes the spacing, never the size of the letters */
function boxOf(snap) {
  if (snap.box) return snap.box;
  const box = new THREE.Box3();
  for (const leaf of snap.leaves) {
    _m.identity();
    for (const a of leaf.chain) _m.multiply(_l.compose(a.p, a.q, a.s));
    box.union(_b.copy(leaf.bb).applyMatrix4(_m));
  }
  return (snap.box = box);
}

/** The helpers of Main.coffee, shared by every visualisation. */
export class Vis {
  constructor(stage) { this.stage = stage; }
  get camera() { return this.stage.camera; }
  get scene() { return this.stage.scene; }
  get speed() { return P.look.speed; }
  get scaleText() { return SCALE_TEXT; }
  getParentObject() { return this.stage.parentObject(); }
  getLineObject(text) { return this.stage.lineObject(text); }
  wait(ms) { return waitRaw(ms * this.speed); }

  // A box also remembers which glyphs it framed and how they were placed (position, rotation, scale of
  // each glyph and all its ancestors), so it can be recomputed later when tracking or leading move them.
  getBBox(object) {
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    box._snap = snapshot([object]);
    return box;
  }
  getBBoxFromSubset(parent, array) {
    const box = new THREE.Box3();
    parent.updateWorldMatrix(true, true);
    for (const c of array) box.union(new THREE.Box3().setFromObject(c));
    box._snap = snapshot(array);
    return box;
  }
  /** a box as its glyphs sit now (tracking and leading applied); plain boxes are returned as they are */
  liveBox(box) { return box._snap ? boxOf(box._snap) : box; }
  getSiblingsFromSubset(parent, array) { return parent.children.filter((c) => !array.includes(c)); }

  /* ── camera ── */
  // A camera move stores what it frames, not where it ends: its target is recomputed from the current
  // settings (framing, lens, window shape) every time the camera is placed, so those settings are live.
  panCameraToPosition3(target, duration, ignoreGlobal) {
    const zOff = ignoreGlobal ? 0 : CAMERA_Z;
    const cam = this.camera;
    const goal = typeof target === "function" ? target : () => target;
    const to = () => { const v = goal(); return new THREE.Vector3(v.x, v.y, v.z + zOff); };
    return tween({
      duration: (duration || 1000) * this.speed, target: cam, channel: "camera", meta: { to },
      init: () => { const a = cam.position.clone(); return (t) => cam.position.lerpVectors(a, to(), t); },
    });
  }
  hFov() { const v = THREE.MathUtils.degToRad(this.camera.fov); return Math.atan(Math.tan(v / 2) * this.camera.aspect); }
  getZoomDistanceFromBoxWidth(box, scale) { return -(Math.abs(box.min.x - box.max.x) / 2) / Math.tan(this.hFov()) * scale; }
  // 2015 measured the height against the horizontal field of view too, so tall text ran off the top and
  // bottom of a wide window; each side is now checked against its own
  getZoomDistanceFromBox(box, scale) {
    const w = Math.abs(box.min.x - box.max.x), h = Math.abs(box.min.y - box.max.y);
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    return -Math.max(w / 2 / Math.tan(this.hFov()), h / 2 / Math.tan(v)) * scale;
  }
  /** scale may be a number or a function (a live setting); by default the framing setting */
  scaleOf(scale) { return typeof scale === "function" ? scale() : scale || P.look.fitMargin; }
  /** distFn(box): how far back to stand for that box. The box is recomputed from its glyphs under the
   *  current layout (tracking, leading), so the camera follows those settings too. */
  fitTo(box, distFn, duration, dx = 0) {
    const stage = this.stage;
    const current = () => (box._snap ? boxOf(box._snap) : box);
    return this.panCameraToPosition3(() => { const b = current(), c = b.getCenter(new THREE.Vector3()); return new THREE.Vector3(c.x + dx, c.y, c.z + distFn(b)); }, duration || 1000, true);
  }
  adjustCameraToFit(obj, scale, duration) { return this.fitTo(this.getBBox(obj), (b) => this.getZoomDistanceFromBox(b, this.scaleOf(scale)), duration); }
  adjustCameraToFitWidth(obj, scale, duration) { return this.fitTo(this.getBBox(obj), (b) => this.getZoomDistanceFromBoxWidth(b, this.scaleOf(scale)), duration); }
  adjustCameraToFitBox(box, scale, duration) { return this.fitTo(box, (b) => this.getZoomDistanceFromBox(b, this.scaleOf(scale)), duration); }

  /* ── fades: every letter staggered; resolves when the first letter finishes, as d3's each("end") did ── */
  fadeToArray(to, duration) {
    return (array) => {
      if (!array.length) return Promise.resolve();
      const dur = (duration ?? 1000) * (P.look.fadeDuration / 1000) * this.speed;   // fadeDuration rescales the original 1000/2000 ms fades
      // only the first letter carries a promise: it always finishes first, and d3's each("end") resolved there
      const ps = array.map((obj, i) => tween({
        duration: dur, delay: i * P.look.letterStagger * this.speed, target: obj, channel: "opacity", silent: i > 0,
        init: () => { const from = obj.material.opacity; return (t) => { obj.material.opacity = from + (to - from) * t; }; },
      }));
      // 2015: a fade counted as done when its first letter was (fine at a 10 ms stagger). A longer stagger
      // also waits for the extra time, so every letter finishes before the line moves on or is removed.
      const extra = Math.max(0, P.look.letterStagger - 10) * (array.length - 1) * this.speed;
      return extra > 0 ? Promise.all([ps[0], waitRaw(dur + extra)]) : ps[0];
    };
  }
  fadeAll(objects, to, duration) { return Promise.all(objects.map((c) => this.fadeToArray(to, duration)(c.children))); }

  /* ── words inside lines ── */
  getWordIndex(line, word) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return line.search(new RegExp(word === "—" ? esc : `\\b${esc}\\b`, "i"));
  }
  getLetterObjectsForWord(textObject, word, accessor) {
    const line = accessor ? accessor(textObject) : textObject._line;
    const b = this.getWordIndex(line, word);
    return b < 0 ? [] : textObject.children.slice(b, b + word.length);
  }
  alignObjectsByWord(existing, other, word) {
    other.position.copy(existing.position);
    other._p0 = (existing._p0 || existing.position).clone();
    const idx = [existing, other].map((e) => this.getWordIndex(e._letters().join(""), word));
    const at = (e, i, k) => (i < 0 ? 0 : (k ? e.children[i]._p0 || e.children[i].position : e.children[i].position).x);
    other.position.x += at(existing, idx[0]) - at(other, idx[1]);
    other._p0.x += at(existing, idx[0], 1) - at(other, idx[1], 1);
  }
}
