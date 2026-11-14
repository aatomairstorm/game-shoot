import * as THREE from 'three';
import { createHostage, sitPose, glow } from './models.js';

const beamGeo = new THREE.CylinderGeometry(2.4, 2.4, 160, 32, 1, true).translate(0, 80, 0);
const coreGeo = new THREE.CylinderGeometry(0.5, 0.5, 160, 16, 1, true).translate(0, 80, 0);
const ringGeo = new THREE.RingGeometry(2.3, 2.75, 48).rotateX(-Math.PI / 2);

export class Hostage {
  constructor(G, zone, facing = 0) {
    this.G = G;
    this.zone = zone.label;
    this.name = zone.name;
    this.pos = zone.pos.clone();
    this.freed = false;
    this.progress = 0;
    this.t = Math.random() * 10;
    this.freeT = 0;
    this.model = createHostage();
    sitPose(this.model);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = facing;
    G.scene.add(this.model.root);

    this.beam = new THREE.Group();
    this.beam.position.copy(this.pos);
    this.beamMat = glow(0xffb43a, 0.13); this.beamMat.side = THREE.DoubleSide;
    this.coreMat = glow(0xffe2a0, 0.3); this.coreMat.side = THREE.DoubleSide;
    this.ringMat = glow(0xffb43a, 0.8); this.ringMat.side = THREE.DoubleSide;
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.y = 0.06;
    this.beam.add(new THREE.Mesh(beamGeo, this.beamMat), new THREE.Mesh(coreGeo, this.coreMat), this.ring);
    G.scene.add(this.beam);
  }

  free() {
    if (this.freed) return;
    this.freed = true;
    const m = this.model;
    m.ropes.visible = false;
    m.gag.visible = false;
    m.body.position.set(0, 0, 0);
    m.legL.rotation.x = m.legR.rotation.x = 0;
    m.chair.position.z = 0.6;
    m.chair.rotation.x = 0.25;
    for (const mat of [this.beamMat, this.coreMat, this.ringMat]) mat.color.set(0x4cff8a);
    this.G.audio.freed();
    const p = this.pos.clone(); p.y += 1.2;
    this.G.fx.burst(p, 40, { colors: [0x4cff8a, 0xffffff, 0xffe27a], speed: 7, life: 1.0, size: 0.25, size1: 0.05, gravity: 6, drag: 1.2 });
  }

  update(dt) {
    this.t += dt;
    const m = this.model;
    if (!this.freed) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      this.beamMat.opacity = 0.1 + pulse * 0.07;
      this.coreMat.opacity = 0.22 + pulse * 0.15;
      this.ring.scale.setScalar(1 + pulse * 0.08);
      // Struggle on the chair
      m.body.rotation.z = Math.sin(this.t * 2.3) * 0.06;
      m.head.rotation.y = Math.sin(this.t * 0.9) * 0.5;
    } else {
      this.freeT += dt;
      m.body.rotation.z = 0;
      m.armR.rotation.set(Math.PI - 0.2 + Math.sin(this.t * 9) * 0.35, 0, 0.2);
      m.armL.rotation.set(Math.PI - 0.2 - Math.sin(this.t * 9) * 0.35, 0, -0.2);
      m.body.position.y = Math.abs(Math.sin(this.t * 6)) * 0.15;
      const k = Math.max(0, 1 - this.freeT / 4);
      this.beamMat.opacity = 0.16 * k; this.coreMat.opacity = 0.35 * k; this.ringMat.opacity = 0.8 * k;
      if (k <= 0) this.beam.visible = false;
    }
    this.ring.rotation.y += dt;
  }

  dispose() {
    this.G.scene.remove(this.model.root);
    this.G.scene.remove(this.beam);
  }
}
