// The reader's own view of a three.js text piece: pan, zoom and spin, applied to the camera for each
// drawn frame only (the piece's camera, its recordings and scrubbing never see it). Made for any 3D text
// project: give it the canvas and it works on whatever camera you draw with.
//
//   mouse      drag pans · shift-drag spins · wheel / two-finger scroll pans (shift: spins)
//              ctrl/⌘-wheel or a trackpad pinch zooms about the pointer
//   touch      one finger pans (or spins, with `swap`) · two fingers pan and pinch-zoom
//   (setting)  double-click / double-tap puts the view back
//
// How it moves the camera. The piece's camera looks at a point `dist` ahead of it (camera.userData.dist;
// a camera without one looks at the plane z = 0, as the flat pieces do). That point is the pivot:
//   pan    moves the pivot (and the camera with it) along the screen's right and up, 1:1 with the finger
//   zoom   divides the distance to the pivot (0.3× .. 60×)
//   spin   turns the camera about the pivot, about the screen's own axes (a trackball): dragging right
//          turns the object toward the right, dragging down tips its top toward you
// All three are kept relative to the piece's camera, so the piece keeps moving and you keep your offset.
import * as THREE from "three";

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _f = new THREE.Vector3(), _piv = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), BACK = new THREE.Vector3(0, 0, 1);

export class ViewControls {
  /** el: the canvas. o.enabled(), o.dblReset(), o.swap() (drag spins, shift-drag pans): live settings.
   *  o.camera(): the camera being drawn. o.viewHeight(): the full view's height in CSS px.
   *  o.onChange(): after every change. o.onTouch(bool): a gesture begins or ends. */
  constructor(el, o) {
    this.el = el; this.o = o;
    this.view = { pan: new THREE.Vector3(), zoom: 1, spin: new THREE.Quaternion() };   // pan: in the piece camera's own frame
    this.touching = false;
    this.listen();
  }

  get changed() { const v = this.view; return v.pan.lengthSq() > 0 || v.zoom !== 1 || Math.abs(v.spin.w) < 1 - 1e-12; }
  reset() { this.view.pan.set(0, 0, 0); this.view.zoom = 1; this.view.spin.identity(); this.o.onChange?.(); }

  /** how far ahead the camera looks (its pivot) */
  static dist(cam) { return cam.userData.dist ?? Math.abs(cam.position.z); }

  /** move cam to the reader's view; returns a function that puts it back */
  apply(cam) {
    if (!this.changed) return () => {};
    const v = this.view, p = cam.position.clone(), q = cam.quaternion.clone(), near = cam.near, dist = cam.userData.dist;
    const d = ViewControls.dist(cam);
    _piv.copy(p).add(_f.set(0, 0, -1).applyQuaternion(q).multiplyScalar(d));          // what the camera looks at
    _piv.add(_v.copy(v.pan).applyQuaternion(q));                                     // panned
    cam.quaternion.multiply(v.spin);                                                 // spun about the pivot
    const dz = d / v.zoom;                                                           // zoomed
    cam.position.copy(_piv).add(_v.copy(BACK).applyQuaternion(cam.quaternion).multiplyScalar(dz));
    cam.userData.dist = dz;
    // close in, the text would be nearer than the near plane and cut away: bring the plane in too
    cam.near = Math.min(near, dz * 0.1); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    return () => {
      cam.position.copy(p); cam.quaternion.copy(q); cam.near = near; cam.updateProjectionMatrix();
      if (dist === undefined) delete cam.userData.dist; else cam.userData.dist = dist;
      cam.updateMatrixWorld(true);
    };
  }

  /** world units per CSS pixel at the pivot, as the reader sees it now */
  worldPerPx() {
    const cam = this.o.camera(), d = ViewControls.dist(cam) / this.view.zoom;
    return (2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / this.o.viewHeight() / (window.visualViewport ? visualViewport.scale : 1);
  }
  /** move the view by (ax, ay) world units along the screen's right and down: the content follows */
  panWorld(ax, ay) { this.view.pan.add(_v.set(-ax, ay, 0).applyQuaternion(this.view.spin)); }
  panBy(dx, dy) { const k = this.worldPerPx(); this.panWorld(dx * k, dy * k); }
  /** zoom by f about a point on screen (CSS px), keeping that point under the pointer */
  zoomAt(f, cx, cy) {
    const v = this.view, z = Math.min(60, Math.max(0.3, v.zoom * f));
    const r = this.el.getBoundingClientRect();
    const sx = cx - (r.left + r.width / 2), sy = cy - (r.top + r.height / 2);
    const before = this.worldPerPx();
    v.zoom = z;
    const after = this.worldPerPx();
    this.panWorld(sx * (after - before), sy * (after - before));
  }
  /** spin by a drag of (dx, dy) px: across the whole view's height is half a turn */
  spinBy(dx, dy) {
    const k = Math.PI / this.o.viewHeight();
    this.view.spin.multiply(_q.setFromAxisAngle(Y, -dx * k)).multiply(_q.setFromAxisAngle(X, -dy * k)).normalize();
  }

  listen() {
    const el = this.el, pts = new Map(), o = this.o;
    el.style.touchAction = "none";                                  // the page doesn't zoom or scroll: the piece does
    let tap = 0, prev = null, wheelEnd = 0;
    const touch = (b) => { if (this.touching !== b) { this.touching = b; o.onTouch?.(b); } };
    const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; };
    const spinning = (e) => !!e.shiftKey !== !!o.swap();
    el.addEventListener("pointerdown", (e) => {
      if (!o.enabled()) return;
      const t = performance.now();
      if (pts.size === 0 && t - tap < 300 && o.dblReset()) { this.reset(); tap = 0; return; }   // double tap
      if (pts.size === 0) tap = t;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      touch(true);
      prev = pts.size === 2 ? mid() : null;
      el.style.cursor = "grabbing";
    });
    el.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) { if (spinning(e)) this.spinBy(e.clientX - p.x, e.clientY - p.y); else this.panBy(e.clientX - p.x, e.clientY - p.y); }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) {
        const m = mid();
        if (prev) { this.panBy(m.x - prev.x, m.y - prev.y); if (prev.d > 0) this.zoomAt(m.d / prev.d, m.x, m.y); }
        prev = m;
      }
      o.onChange?.();
    });
    const end = (e) => {
      pts.delete(e.pointerId);
      prev = pts.size === 2 ? mid() : null;
      if (!pts.size) { touch(false); el.style.cursor = o.enabled() ? "grab" : ""; }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("dblclick", () => { if (o.dblReset()) this.reset(); });
    el.addEventListener("wheel", (e) => {
      if (!o.enabled()) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * unit * 0.005), e.clientX, e.clientY);
      else if (e.shiftKey) this.spinBy(-e.deltaX * unit, -e.deltaY * unit);   // (with shift, some browsers turn a vertical wheel into deltaX)
      else this.panBy(-e.deltaX * unit, -e.deltaY * unit);
      // a wheel has no "up": the gesture counts as over a moment after the last event
      touch(true);
      const my = (wheelEnd = performance.now());
      setTimeout(() => { if (wheelEnd === my && !pts.size) touch(false); }, 400);
      o.onChange?.();
    }, { passive: false });
    el.style.cursor = o.enabled() ? "grab" : "";
  }
}
