import * as THREE from 'three';
import { createBandit, walkPose } from './models.js';
import { raycastWorld, rayBox, raySphere, moveBody, lineOfSight, boxes, STEP } from './collision.js';

const GRAVITY = 30;
const HALF = 0.36, BODY_H = 1.64, HEAD_Y = 1.82, HEAD_R = 0.27;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

const barBgGeo = new THREE.PlaneGeometry(1.0, 0.13);
const barFillGeo = new THREE.PlaneGeometry(0.96, 0.08).translate(0.48, 0, 0);
const _barColor = new THREE.Color();

function pointBlocked(x, z, y) {
  for (const b of boxes) {
    if (x > b.min.x - 0.6 && x < b.max.x + 0.6 && z > b.min.z - 0.6 && z < b.max.z + 0.6 && b.max.y > y + STEP && b.min.y < y + 1.9) return true;
  }
  return false;
}

export class Enemy {
  constructor(G, s, idx) {
    this.G = G;
    this.pos = new THREE.Vector3(s.x, s.y || 0, s.z);
    this.home = this.pos.clone();
    this.platform = s.platform || null;
    this.patrolR = s.r ?? 6;
    this.yaw = Math.random() * Math.PI * 2;
    this.vel = new THREE.Vector3();
    this.radius = 0.4; this.height = 1.85; this.onGround = true;
    this.maxHp = 100; this.hp = 100; this.alive = true;
    this.state = 'patrol';
    this.target = null; this.wait = Math.random() * 2;
    this.canSee = false; this.thinkT = Math.random() * 0.2;
    this.lastSeen = new THREE.Vector3();
    this.alertT = 0; this.reaction = 0;
    this.fireT = 0; this.burst = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
    this.webT = 0; this.webStacks = 0; this.stunT = 0; this.flashT = 0; this.muzzleT = 0;
    this.deadT = 0; this.phase = Math.random() * 6; this.moveAmt = 0;
    this.model = createBandit(idx);
    this.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.scene.add(this.model.root);
    const bg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0x4cff6a, transparent: true, depthWrite: false });
    this.fill = new THREE.Mesh(barFillGeo, this.fillMat);
    this.fill.position.set(-0.48, 0, 0.002);
    bg.renderOrder = 8; this.fill.renderOrder = 9;
    this.bar = new THREE.Group(); this.bar.add(bg, this.fill);
    G.scene.add(this.bar);
    this.box = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    this.head = new THREE.Vector3();
    this.syncModel();
  }

  dispose() {
    this.G.scene.remove(this.model.root);
    this.G.scene.remove(this.bar);
  }

  get chest() { return _v3.set(this.pos.x, this.pos.y + 1.2, this.pos.z); }

  updateHitbox() {
    const p = this.pos;
    this.box.min.set(p.x - HALF, p.y, p.z - HALF);
    this.box.max.set(p.x + HALF, p.y + BODY_H, p.z + HALF);
    this.head.set(p.x, p.y + HEAD_Y, p.z);
  }

  pickPatrolTarget() {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * this.patrolR;
      let x = this.home.x + Math.cos(a) * r, z = this.home.z + Math.sin(a) * r;
      if (this.platform) {
        const P = this.platform;
        x = THREE.MathUtils.clamp(x, P.minX + 0.8, P.maxX - 0.8);
        z = THREE.MathUtils.clamp(z, P.minZ + 0.8, P.maxZ - 0.8);
      }
      if (!pointBlocked(x, z, this.home.y)) return new THREE.Vector3(x, this.home.y, z);
    }
    return this.home.clone();
  }

  alert(reaction = 0.6) {
    const G = this.G;
    if (this.state !== 'combat') {
      this.reaction = reaction + Math.random() * 0.3;
      G.audio.enemyAlert(this.pos);
    }
    this.state = 'combat';
    this.lastSeen.copy(G.player.pos);
    this.alertT = 8;
  }

  perceive() {
    const G = this.G, pl = G.player;
    this.canSee = false;
    if (!pl || pl.dead) return;
    const eye = _v.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    const pc = _v2.set(pl.pos.x, pl.pos.y + 1.2, pl.pos.z);
    const d = eye.distanceTo(pc);
    if (d > 58) return;
    const dx = (pc.x - eye.x) / d, dz = (pc.z - eye.z) / d;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const inFov = dx * fx + dz * fz > 0.15 || d < 9 || this.state === 'combat';
    if (!inFov) return;
    if (!lineOfSight(eye, pc)) return;
    this.canSee = true;
    const wasCombat = this.state === 'combat';
    this.alert(0.45);
    if (!wasCombat) G.enemies.alertNearby(this, 26);
  }

  applyWeb() {
    this.webStacks = Math.min(3, this.webStacks + 1);
    this.webT = this.webStacks >= 2 ? 2.8 : 3.2;
    this.model.net.visible = true;
    this.model.net.scale.set(0.75 + this.webStacks * 0.12, 1.25 + this.webStacks * 0.15, 0.75 + this.webStacks * 0.12);
    this.model.net.material.opacity = this.webStacks >= 2 ? 0.95 : 0.55;
  }

  damage(amount, o = {}) {
    if (!this.alive) return false;
    const G = this.G;
    this.hp -= amount;
    this.flashT = 0.12;
    if (o.knock) { this.vel.add(o.knock); if (o.knock.y > 0) this.onGround = false; }
    if (o.stun) this.stunT = Math.max(this.stunT, o.stun);
    if (o.web) this.applyWeb();
    if (G.player && !G.player.dead) this.alert(0.25);
    if (!o.quiet || this.hp <= 0) G.hud.hitmarker(this.hp <= 0, o.headshot);
    if (!o.silent && !o.quiet) G.audio.hit(o.headshot);
    if (o.headshot) G.hud.toast('COLPO ALLA TESTA!', 'bad', 900);
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.bar.visible = false;
    this.model.net.visible = false;
    this.model.stars.visible = false;
    this.model.flash.visible = false;
    this.G.audio.enemyDeath(this.pos);
    this.G.onEnemyKilled(this);
  }

  syncModel() {
    const m = this.model;
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.yaw;
    this.updateHitbox();
  }

  update(dt, active) {
    const G = this.G, m = this.model;
    if (!this.alive) {
      this.deadT += dt;
      this.vel.x *= Math.max(0, 1 - 3 * dt); this.vel.z *= Math.max(0, 1 - 3 * dt);
      this.vel.y -= GRAVITY * dt;
      moveBody(this, dt);
      const k = Math.min(1, this.deadT / 0.55);
      m.body.rotation.x = k * (Math.PI / 2 - 0.08);
      m.body.position.y = k * 0.18;
      m.root.position.copy(this.pos);
      if (this.deadT > 10 && m.root.visible) {
        m.root.position.y -= Math.min(1, (this.deadT - 10) / 2) * 0.6;
        if (this.deadT > 12) m.root.visible = false;
      }
      return;
    }

    this.stunT = Math.max(0, this.stunT - dt);
    if (this.webT > 0) {
      this.webT -= dt;
      if (this.webT <= 0) { this.webStacks = 0; m.net.visible = false; }
    }
    const immobile = this.stunT > 0 || this.webStacks >= 2;
    const slow = this.webT > 0 ? 0.4 : 1;

    if (active) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) { this.thinkT = 0.15 + Math.random() * 0.05; this.perceive(); }
    } else {
      this.canSee = false;
    }

    let mx = 0, mz = 0, speed = 0;
    const pl = G.player;
    if (this.state === 'combat' && active && pl && !pl.dead) {
      const tx = this.canSee ? pl.pos.x : this.lastSeen.x, tz = this.canSee ? pl.pos.z : this.lastSeen.z;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d, nz = dz / d;
      this.turnTo(Math.atan2(-dx, -dz), dt, 8);
      if (this.canSee) {
        this.reaction -= dt;
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 0.9 + Math.random() * 1.6; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
        const radial = d > 24 ? 1 : d < 9 ? -0.8 : 0;
        mx = nx * radial + -nz * this.strafeDir * 0.8;
        mz = nz * radial + nx * this.strafeDir * 0.8;
        speed = 3.9;
        this.tryShoot(dt, immobile);
      } else {
        this.alertT -= dt;
        if (d > 1.5) { mx = nx; mz = nz; speed = 4.2; }
        if (this.alertT <= 0) { this.state = 'patrol'; this.target = null; }
      }
    } else {
      if (this.state === 'combat' && (!pl || pl.dead || !active)) { this.state = 'patrol'; this.target = null; }
      if (this.wait > 0) this.wait -= dt;
      else {
        if (!this.target) this.target = this.pickPatrolTarget();
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) { this.target = null; this.wait = 1 + Math.random() * 2.5; }
        else { mx = dx / d; mz = dz / d; speed = 2.1; this.turnTo(Math.atan2(-dx, -dz), dt, 4); }
      }
    }

    if (immobile) speed = 0;
    speed *= slow;
    const ml = Math.hypot(mx, mz);
    if (ml > 1e-3) { mx /= ml; mz /= ml; }
    if (this.onGround) {
      const k = Math.min(1, 10 * dt);
      this.vel.x += (mx * speed - this.vel.x) * k;
      this.vel.z += (mz * speed - this.vel.z) * k;
    }
    this.vel.y -= GRAVITY * dt;
    const wasGround = this.onGround;
    const prev = _v.copy(this.pos);
    const r = moveBody(this, dt);
    if (this.platform && this.onGround) {
      const P = this.platform;
      if (Math.abs(this.pos.y - P.y) < 0.6 && wasGround) {
        this.pos.x = THREE.MathUtils.clamp(this.pos.x, P.minX, P.maxX);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z, P.minZ, P.maxZ);
      } else if (Math.abs(this.pos.y - P.y) >= 0.6) {
        // Knocked off the roof: becomes a ground unit around the landing spot.
        this.platform = null; this.home.copy(this.pos); this.target = null;
      }
    }
    if (r.landed && r.landSpeed > 8) G.fx.dust(this.pos, 8, 1);
    if (r.wall && this.state === 'patrol') this.target = null;

    const moved = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z) / Math.max(dt, 1e-4);
    this.moveAmt += (Math.min(1, moved / 3.5) - this.moveAmt) * Math.min(1, 8 * dt);
    this.phase += dt * (4 + moved * 2.2);
    walkPose(m, this.phase, this.moveAmt);
    m.armR.rotation.x = 1.25; m.armL.rotation.x = 1.35; // keep rifle up
    if (immobile && this.stunT > 0) {
      m.body.rotation.z = Math.sin(G.time * 6) * 0.12;
      m.stars.visible = true; m.stars.rotation.y += dt * 5;
    } else { m.body.rotation.z = 0; m.stars.visible = false; }
    if (this.webStacks >= 2) { m.legL.rotation.x = m.legR.rotation.x = 0; }

    this.flashT -= dt;
    const fl = this.flashT > 0;
    for (const mat of m.flashMats) { mat.emissive.setHex(fl ? 0xff2020 : 0x000000); mat.emissiveIntensity = fl ? 0.9 : 0; }
    this.muzzleT -= dt;
    m.flash.visible = this.muzzleT > 0;
    if (m.flash.visible) m.flash.rotation.z = Math.random() * 6;
    this.syncModel();
  }

  turnTo(target, dt, rate) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, rate * dt);
  }

  tryShoot(dt, immobile) {
    if (immobile || this.reaction > 0) return;
    this.fireT -= dt * (this.webT > 0 ? 0.5 : 1);
    if (this.fireT > 0) return;
    if (this.burst <= 0) this.burst = 3 + ((Math.random() * 3) | 0);
    this.shoot();
    this.burst--;
    this.fireT = this.burst > 0 ? 0.12 : 1.0 + Math.random() * 1.0;
  }

  shoot() {
    const G = this.G, pl = G.player;
    const muzzle = this.model.muzzle.getWorldPosition(new THREE.Vector3());
    const target = _v2.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
    const dist = muzzle.distanceTo(target);
    // Lead slightly less than perfect; faster targets are harder to hit.
    const ps = Math.hypot(pl.vel.x, pl.vel.y, pl.vel.z);
    const spread = 0.035 + Math.min(0.08, ps * 0.004) + dist * 0.0006;
    const dir = target.sub(muzzle).normalize();
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    G.enemies.bullets.spawn(muzzle, dir);
    this.muzzleT = 0.05;
    G.audio.gunshot(this.pos);
  }
}

class Bullets {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.geo = new THREE.BoxGeometry(0.05, 0.05, 1.8);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = [];
  }

  spawn(origin, dir) {
    const mesh = this.pool.pop() || new THREE.Mesh(this.geo, this.mat);
    mesh.visible = true;
    mesh.position.copy(origin);
    mesh.lookAt(_v.copy(origin).add(dir));
    this.G.scene.add(mesh);
    this.list.push({ pos: origin.clone(), dir: dir.clone(), speed: 85, life: 1.4, mesh, whizzed: false });
  }

  update(dt) {
    const G = this.G, pl = G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      const step = b.speed * dt;
      b.life -= dt;
      let hitT = Infinity, hitPlayer = false;
      const wh = raycastWorld(b.pos, b.dir, step);
      if (wh) hitT = wh.t;
      if (pl && !pl.dead) {
        const box = { min: _v2.set(pl.pos.x - 0.45, pl.pos.y, pl.pos.z - 0.45), max: _v3.set(pl.pos.x + 0.45, pl.pos.y + 1.85, pl.pos.z + 0.45) };
        const r = rayBox(b.pos, b.dir, box, Math.min(step, hitT));
        if (r) { hitT = r.t; hitPlayer = true; }
        if (!b.whizzed) {
          _v.subVectors(pl.pos, b.pos);
          if (_v.lengthSq() < 9) { b.whizzed = true; G.audio.whiz(); }
        }
      }
      if (hitT < Infinity) {
        b.pos.addScaledVector(b.dir, hitT);
        if (hitPlayer) pl.takeDamage(4, b.pos);
        else { G.fx.sparks(b.pos, 0xffd080, 5, 5); if (Math.random() < 0.3) G.audio.ricochet(b.pos); }
        this.kill(i);
        continue;
      }
      b.pos.addScaledVector(b.dir, step);
      b.mesh.position.copy(b.pos);
      if (b.life <= 0) this.kill(i);
    }
  }

  kill(i) {
    const b = this.list[i];
    b.mesh.visible = false;
    this.G.scene.remove(b.mesh);
    this.pool.push(b.mesh);
    this.list.splice(i, 1);
  }

  clear() { for (let i = this.list.length - 1; i >= 0; i--) this.kill(i); }
}

export class EnemyManager {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.bullets = new Bullets(G);
  }

  reset(spawns) {
    for (const e of this.list) e.dispose();
    this.list = spawns.map((s, i) => new Enemy(this.G, s, i));
    this.bullets.clear();
  }

  get aliveCount() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  alertNearby(src, radius) {
    for (const e of this.list) {
      if (e === src || !e.alive || e.state === 'combat') continue;
      if (e.pos.distanceTo(src.pos) < radius) e.alert(0.9);
    }
  }

  update(dt, active) {
    const L = this.list;
    for (const e of L) e.update(dt, active);
    // Soft separation between bandits
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.81 && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (0.9 - d) * 0.5;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
    this.bullets.update(active ? dt : 0);
  }

  updateBars(camera) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = camera.position.distanceTo(e.pos);
      e.bar.visible = d < 70;
      if (!e.bar.visible) continue;
      e.bar.position.set(e.pos.x, e.pos.y + 2.35, e.pos.z);
      e.bar.quaternion.copy(camera.quaternion);
      const k = Math.max(0, e.hp / e.maxHp);
      e.fill.scale.x = Math.max(0.001, k);
      _barColor.setHSL(k * 0.33, 0.9, 0.5);
      e.fillMat.color.copy(_barColor);
    }
  }

  // Ray against all living bandits. pad widens hitboxes (for thick projectiles).
  raycast(o, d, maxT, pad = 0) {
    let best = maxT, hit = null, part = null;
    const bx = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    for (const e of this.list) {
      if (!e.alive) continue;
      const th = raySphere(o, d, e.head, HEAD_R + pad, best);
      if (th >= 0 && th < best) { best = th; hit = e; part = 'head'; }
      bx.min.copy(e.box.min).subScalar(pad); bx.max.copy(e.box.max).addScalar(pad);
      bx.max.y = e.box.max.y; // padding must not let the body swallow head hits
      const r = rayBox(o, d, bx, best);
      if (r && r.t < best) { best = r.t; hit = e; part = 'body'; }
    }
    return hit ? { enemy: hit, t: best, part } : null;
  }

  inRadius(pos, radius, cb) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = _v.set(e.pos.x, e.pos.y + 1, e.pos.z).distanceTo(pos);
      if (d <= radius) cb(e, d);
    }
  }
}

export { HEAD_R, HEAD_Y };
