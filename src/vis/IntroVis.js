// Port of IntroVis.coffee: the title card.
import * as THREE from "three";
import { Vis } from "./Stage.js";
import { P } from "../params.js";

export class IntroVis extends Vis {
  async start() {
    const title = this.getLineObject("Poetry Chains & Collocation Nets");
    const author = this.getLineObject("by Angus Forbes, with Paul Murray");
    const l2 = this.getLineObject("A series of animated explorations");
    const l3 = this.getLineObject("through the collected poems of Emily Dickinson");
    const url = this.getLineObject("http://evl.uic.edu/creativecoding");
    title.position.y = 30;
    author.position.y = title.position.y - title._layout.height - 50; author.position.x = title.position.x - 50;
    l2.position.y = author.position.y - author._layout.height - 180; l2.position.x = title.position.x - 10;
    l3.position.y = l2.position.y - l2._layout.height - 10; l3.position.x = title.position.x - 50;
    url.position.y = l3.position.y - l2._layout.height - 200; url.position.x = title.position.x - 10;
    title.scale.multiplyScalar(1.5); author.scale.multiplyScalar(0.7); l2.scale.multiplyScalar(0.7); l3.scale.multiplyScalar(0.7); url.scale.multiplyScalar(0.5);
    const parent = new THREE.Object3D();
    parent.add(title, author, l2, l3, url);
    parent.scale.multiplyScalar(this.scaleText);
    this.scene.add(parent);
    const faded = this.fadeAll(parent.children, 1, 2500);
    const box = this.getBBox(parent);
    const panned = this.fitTo(box, () => this.getZoomDistanceFromBox(box, 1.2), 1, -0.2);
    await Promise.all([faded, panned]);
    await this.wait(P.all.introHold);
    await this.fadeAll(parent.children, 0, 1000);
    this.scene.remove(parent);
  }
}
