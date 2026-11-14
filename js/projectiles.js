import * as THREE from 'three';
import { raycastWorld } from './collision.js';

const _look = new THREE.Vector3();
const dir = new THREE.Vector3();

// Generic player projectiles (webs, stink bombs).
export class Projectiles {
  constructor(G) {
    this.G = G;
    this.list = [];
  }

  spawn(o) {
    o.pos = o.pos.clone();
    o.vel = o.vel.clone();
    o.gravity = o.gravity ?? 0;
    o.radius = o.radius ?? 0.15;
    o.life = o.life ?? 3;
    if (o.mesh) { o.mesh.position.copy(o.pos); this.G.scene.add(o.mesh); }
    this.list.push(o);
    return o;
  }

  update(dt) {
    const G = this.G;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      if (p.homing && p.target) {
        if (p.target.alive) {
          const t = p.target;
          const ty = t.head && t.headR > 0 ? (t.pos.y + t.head.y) * 0.5 + 0.2 : t.pos.y + 0.8;
          dir.set(t.pos.x - p.pos.x, ty - p.pos.y, t.pos.z - p.pos.z).normalize();
          const sp = p.vel.length();
          p.vel.lerp(dir.multiplyScalar(sp), Math.min(1, p.homing * dt)).setLength(sp);
        } else p.target = null;
      }
      if (p.mesh && p.align) p.mesh.lookAt(_look.copy(p.pos).add(p.vel));
      dir.copy(p.vel).multiplyScalar(dt);
      const len = dir.length();
      if (len > 1e-6) {
        dir.divideScalar(len);
        const wh = raycastWorld(p.pos, dir, len);
        const eh = G.enemies.raycast(p.pos, dir, wh ? wh.t : len, p.radius);
        if (eh) {
          p.pos.addScaledVector(dir, eh.t);
          p.onEnemy?.(eh.enemy, eh.part, p.pos, dir);
          this.remove(i);
          continue;
        }
        if (wh) {
          p.pos.copy(wh.point);
          p.onWorld?.(wh, dir);
          this.remove(i);
          continue;
        }
        p.pos.addScaledVector(dir, len);
      }
      if (p.mesh) {
        p.mesh.position.copy(p.pos);
        if (p.spin) { p.mesh.rotation.x += dt * p.spin; p.mesh.rotation.y += dt * p.spin * 0.7; }
      }
      p.onTrail?.(p.pos);
      if (p.life <= 0) { p.onExpire?.(p.pos); this.remove(i); }
    }
  }

  remove(i) {
    const p = this.list[i];
    if (p.mesh) this.G.scene.remove(p.mesh);
    this.list.splice(i, 1);
  }

  clear() { for (let i = this.list.length - 1; i >= 0; i--) this.remove(i); }
}
