// Port of HoweVis.coffee (after Susan Howe): lines scattered in small rotated groups, the camera
// widening to hold them all.
import * as THREE from "three";
import { Vis } from "./Stage.js";
import { P } from "../params.js";

export class HoweVis extends Vis {
  async start(text) {
    const H = P.howe;
    const parent = new THREE.Object3D();
    parent.scale.multiplyScalar(this.scaleText);
    this.scene.add(parent);
    const rot = () => Math.random() * THREE.MathUtils.degToRad(H.rotation);
    let x = Math.random() * H.spreadX, y = Math.random() * H.spreadX, rz = rot(), lh = Math.random() * H.lineStep, n = 0;
    const lines = [];
    for (const line of text) {
      const o = this.getLineObject(line);
      if (Math.random() > 1 - H.newGroup || n > H.groupLines) {
        x = Math.random() * H.spreadX; y = Math.random() * H.spreadY; rz = rot(); lh = Math.random() * H.lineStep; n = 0;
      } else y -= lh;
      o.rotateZ(rz); o.translateX(x); o.translateY(y);
      n++;
      lines.push(o);
    }
    for (const o of lines) {
      parent.add(o);
      this.fadeToArray(1, 1000)(o.children);
      const box = this.getBBox(parent);
      const c = box.getCenter(new THREE.Vector3());
      await this.panCameraToPosition3(new THREE.Vector3(c.x, c.y, c.z + this.getZoomDistanceFromBox(box, H.zoom)), 1000, true);
    }
    await this.wait(H.hold);
    await this.fadeAll(parent.children, 0, 1000);
    parent.remove(...parent.children);
    this.scene.remove(parent);
  }
}
