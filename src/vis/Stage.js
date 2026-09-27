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
    this.renderer.setSize(this.viewW(), innerHeight);
    document.body.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(P.look.fov, this.viewW() / innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.lookAt(0, 0, 0);
    this.textColor = new THREE.Color(P.look.textColor);     // one Color shared by every letter: live recolouring
    this.applyLook();
    addEventListener("resize", () => this.layout());
    const buf = await (await fetch(fontUrl)).arrayBuffer();
    const _ot = await import("opentype.js");
    this.font = (_ot.default || _ot).parse(buf.slice(0));
    const gen = new SlugGenerator();
    gen.fullRange = true;                            // default is ASCII only: no em dashes or curly quotes
    this.slug = await gen.generateFromBuffer(buf.slice(0));
    this.glyphs = new Map();
    this.hold = false;                                // true while seeking: nothing half-built gets drawn
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
    let x = 0, prev = null;
    for (const ch of chars) {
      const g = f.charToGlyph(ch);
      if (prev) x += f.getKerningValue(prev, g) * s;
      const m = this.letterMesh(ch);
      m.position.x = -x;
      line.add(m);
      x += (g.advanceWidth || 0) * s + P.look.letterSpacing;
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

  viewW() { return Math.max(200, innerWidth - this.inset); }
  /** fit canvas and cameras to the space left beside the settings panel */
  layout(inset = this.inset) {
    this.inset = inset;
    for (const c of new Set([this.camera, this.viewCamera].filter(Boolean))) { c.aspect = this.viewW() / innerHeight; c.updateProjectionMatrix(); }
    this.renderer.setSize(this.viewW(), innerHeight);
    if (this.onLayout) this.onLayout();
  }

  /** a fresh scene and camera to build into (the view keeps showing the old ones until swapped) */
  fresh() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(P.look.fov, this.viewW() / innerHeight, 0.1, 1000);
    this.camera.position.set(0, 0, CAMERA_Z);
    this.camera.lookAt(0, 0, 0);
  }
  showBuilt() { this.viewScene = this.scene; this.viewCamera = this.camera; }

  clear() {
    for (const c of [...this.scene.children]) this.scene.remove(c);
  }
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

  getBBox(object) {
    object.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(object);
  }
  getBBoxFromSubset(parent, array) {
    const box = new THREE.Box3();
    parent.updateWorldMatrix(true, true);
    for (const c of array) box.union(new THREE.Box3().setFromObject(c));
    return box;
  }
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
  getZoomDistanceFromBox(box, scale) {
    const w = Math.abs(box.min.x - box.max.x), h = Math.abs(box.min.y - box.max.y);
    return -((w > h ? w : h) / 2) / Math.tan(this.hFov()) * scale;
  }
  /** scale may be a number or a function (a live setting); by default the framing setting */
  scaleOf(scale) { return typeof scale === "function" ? scale() : scale || P.look.fitMargin; }
  fitTo(box, distFn, duration, dx = 0) {
    const c = box.getCenter(new THREE.Vector3());
    return this.panCameraToPosition3(() => new THREE.Vector3(c.x + dx, c.y, c.z + distFn()), duration || 1000, true);
  }
  adjustCameraToFit(obj, scale, duration) { const b = this.getBBox(obj); return this.fitTo(b, () => this.getZoomDistanceFromBox(b, this.scaleOf(scale)), duration); }
  adjustCameraToFitWidth(obj, scale, duration) { const b = this.getBBox(obj); return this.fitTo(b, () => this.getZoomDistanceFromBoxWidth(b, this.scaleOf(scale)), duration); }
  adjustCameraToFitBox(box, scale, duration) { return this.fitTo(box, () => this.getZoomDistanceFromBox(box, this.scaleOf(scale)), duration); }

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
    const xs = [existing, other].map((e) => { const i = this.getWordIndex(e._letters().join(""), word); return i < 0 ? 0 : e.children[i].position.x; });
    other.position.x += xs[0] - xs[1];
  }
}
