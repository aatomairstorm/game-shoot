import * as THREE from 'three';
import { createBandit, walkPose, decorateBoss, createTurret, createExplosiveBarrel, bakeRig } from './models.js';
import { raycastWorld, rayBox, raySphere, moveBody, lineOfSight, nearBoxes, addBox, removeBox, STEP } from './collision.js';
import { TURRET_SPOTS, BARREL_SPOTS } from './world.js';

const GRAVITY = 30;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _box = { min: new THREE.Vector3(), max: new THREE.Vector3() };

const barBgGeo = new THREE.PlaneGeometry(1.0, 0.13);
const barFillGeo = new THREE.PlaneGeometry(0.96, 0.08).translate(0.48, 0, 0);
const _barColor = new THREE.Color();

function pointBlocked(x, z, y) {
  const list = nearBoxes(x, z, 0.6);
  for (const b of list) {
    if (x > b.min.x - 0.6 && x < b.max.x + 0.6 && z > b.min.z - 0.6 && z < b.max.z + 0.6 && b.max.y > y + STEP && b.min.y < y + 1.9) return true;
  }
  return false;
}

function makeBar(G, width = 1) {
  const bg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x4cff6a, transparent: true, depthWrite: false });
  const fill = new THREE.Mesh(barFillGeo, fillMat);
  fill.position.set(-0.48, 0, 0.002);
  bg.renderOrder = 8; fill.renderOrder = 9;
  const bar = new THREE.Group(); bar.add(bg, fill);
  bar.scale.set(width, 1, 1);
  G.scene.add(bar);
  return { bar, fill, fillMat };
}

// ===================================================================
// Bandit
// ===================================================================
export class Enemy {
  constructor(G, s, idx, scale = 1) {
    this.G = G;
    this.kind = 'bandit';
    this.scale = scale;
    this.pos = new THREE.Vector3(s.x, s.y || 0, s.z);
    this.home = this.pos.clone();
    this.platform = s.platform || null;
    this.patrolR = s.r ?? 6;
    this.yaw = Math.random() * Math.PI * 2;
    this.vel = new THREE.Vector3();
    this.radius = 0.4 * scale; this.height = 1.85 * scale; this.onGround = true;
    this.half = 0.36 * scale; this.bodyH = 1.64 * scale; this.headY = 1.82 * scale; this.headR = 0.27 * scale;
    this.barY = 2.35 * scale;
    this.maxHp = 100; this.hp = 100; this.alive = true;
    this.state = 'patrol';
    this.target = null; this.wait = Math.random() * 2;
    this.canSee = false; this.thinkT = Math.random() * 0.2;
    this.lastSeen = new THREE.Vector3();
    this.alertT = 0; this.reaction = 0;
    this.fireT = 0; this.burst = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0;
    this.webT = 0; this.webStacks = 0; this.stunT = 0; this.flashT = 0; this.muzzleT = 0;
    this.charmT = 0;
    this.deadT = 0; this.phase = Math.random() * 6; this.moveAmt = 0;
    this.bulletDmg = 4;
    this.model = createBandit(idx);
    if (s.boss) decorateBoss(this.model, s.boss);
    {
      const m = this.model;
      const baked = bakeRig([m.body, m.head, m.legL, m.legR, m.armL, m.armR, m.handL, m.handR, m.gun], new Set([m.headMesh]));
      m.flashMats = [baked, m.headMesh.material];
    }
    this.model.root.scale.setScalar(scale);
    this.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.scene.add(this.model.root);
    Object.assign(this, makeBar(G, scale > 1 ? 1.6 : 1));
    this.box = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    this.head = new THREE.Vector3();
    this.syncModel();
  }

  dispose() {
    this.G.scene.remove(this.model.root);
    this.G.scene.remove(this.bar);
  }

  updateHitbox() {
    const p = this.pos;
    this.box.min.set(p.x - this.half, p.y, p.z - this.half);
    this.box.max.set(p.x + this.half, p.y + this.bodyH, p.z + this.half);
    this.head.set(p.x, p.y + this.headY, p.z);
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
    const eye = _v.set(this.pos.x, this.pos.y + 1.7 * this.scale, this.pos.z);
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

  // Lucia's song: frozen while holding the head, then the head bursts.
  charm() {
    if (!this.alive || this.charmT > 0) return;
    this.charmT = 0.7;
    this.alert(0.2);
    this.G.audio.charm(this.pos);
  }

  onCharmEnd() {
    const G = this.G;
    const hp = this.head.clone();
    G.fx.explosion(hp, 1, 'pink');
    G.fx.shockwave(hp, 3.5, 0xff8ad8, 0.45);
    G.fx.shockwave(hp, 2.2, 0x8fe6ff, 0.35);
    G.audio.headPop(hp);
    this.model.head.visible = false;
    this.damage(9999, { headshot: true, silent: true });
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
    if (o.headshot && !o.silent) G.hud.toast('COLPO ALLA TESTA!', 'bad', 900);
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    this.alive = false;
    this.hp = 0;
    this.charmT = 0;
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

  // Extra per-type behaviour (bosses)
  special() {}

  update(dt, active) {
    const G = this.G, m = this.model;
    if (!this.alive) {
      if (!m.root.visible) return;
      this.deadT += dt;
      this.vel.x *= Math.max(0, 1 - 3 * dt); this.vel.z *= Math.max(0, 1 - 3 * dt);
      this.vel.y -= GRAVITY * dt;
      moveBody(this, dt);
      const k = Math.min(1, this.deadT / 0.55);
      m.body.rotation.x = k * (Math.PI / 2 - 0.08);
      m.body.position.y = k * 0.18;
      m.root.position.copy(this.pos);
      if (this.deadT > 10) {
        m.root.position.y -= Math.min(1, (this.deadT - 10) / 2) * 0.6 * this.scale;
        if (this.deadT > 12) m.root.visible = false;
      }
      return;
    }

    // Far, idle bandits only tick slowly (big map): skip animation and AI work.
    const pl = G.player;
    const far = pl && this.state !== 'combat' && Math.abs(pl.pos.x - this.pos.x) + Math.abs(pl.pos.z - this.pos.z) > 150;
    if (far && active) { this.syncModel(); return; }

    this.stunT = Math.max(0, this.stunT - dt);
    if (this.webT > 0) {
      this.webT -= dt;
      if (this.webT <= 0) { this.webStacks = 0; m.net.visible = false; }
    }
    if (this.charmT > 0) {
      this.charmT -= dt;
      if (this.charmT <= 0) { this.charmT = 0; this.onCharmEnd(); if (!this.alive) return; }
    }
    const charmed = this.charmT > 0;
    const immobile = this.stunT > 0 || this.webStacks >= 2 || charmed;
    const slow = this.webT > 0 ? 0.4 : 1;

    if (active) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) { this.thinkT = 0.15 + Math.random() * 0.05; this.perceive(); }
    } else {
      this.canSee = false;
    }

    let mx = 0, mz = 0, speed = 0;
    if (this.state === 'combat' && active && pl && !pl.dead) {
      const tx = this.canSee ? pl.pos.x : this.lastSeen.x, tz = this.canSee ? pl.pos.z : this.lastSeen.z;
      const dx = tx - this.pos.x, dz = tz - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d, nz = dz / d;
      if (!charmed) this.turnTo(Math.atan2(-dx, -dz), dt, 8);
      if (this.canSee) {
        this.reaction -= dt;
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 0.9 + Math.random() * 1.6; this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
        const radial = d > 24 ? 1 : d < 9 ? -0.8 : 0;
        mx = nx * radial + -nz * this.strafeDir * 0.8;
        mz = nz * radial + nx * this.strafeDir * 0.8;
        speed = 3.9;
        this.tryShoot(dt, immobile);
        this.special(dt, d, immobile);
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
    speed *= slow * this.speedMul();
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
    if (charmed) {
      // Hands on the head, swaying, pink notes circling
      m.armR.rotation.set(-2.7, 0, -0.6); m.armL.rotation.set(-2.7, 0, 0.6);
      m.body.rotation.z = Math.sin(G.time * 14) * 0.08;
      m.stars.visible = true; m.stars.rotation.y += dt * 9;
      m.starMat.color.setHex(0xff8ad8);
      m.headMesh.scale.setScalar(1 + (0.7 - this.charmT) * 0.5);
    } else {
      m.armR.rotation.set(1.25, 0, 0.1); m.armL.rotation.set(1.35, 0, 0.55); // keep rifle up
      m.headMesh.scale.set(1, 1.1, 1);
      if (immobile && this.stunT > 0) {
        m.body.rotation.z = Math.sin(G.time * 6) * 0.12;
        m.stars.visible = true; m.stars.rotation.y += dt * 5;
        m.starMat.color.setHex(0xfff060);
      } else { m.body.rotation.z = 0; m.stars.visible = false; }
    }
    if (this.webStacks >= 2) { m.legL.rotation.x = m.legR.rotation.x = 0; }
    this.animateExtra?.(dt);

    this.flashT -= dt;
    const fl = this.flashT > 0;
    if (fl !== this.wasFlash) {
      this.wasFlash = fl;
      for (const mat of m.flashMats) { mat.emissive.setHex(fl ? 0xff2020 : 0x000000); mat.emissiveIntensity = fl ? 0.9 : 0; }
    }
    this.muzzleT -= dt;
    m.flash.visible = this.muzzleT > 0;
    if (m.flash.visible) m.flash.rotation.z = Math.random() * 6;
    this.syncModel();
  }

  speedMul() { return 1; }

  turnTo(target, dt, rate) {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, rate * dt);
  }

  tryShoot(dt, immobile) {
    if (immobile || this.reaction > 0) return;
    this.fireT -= dt * (this.webT > 0 ? 0.5 : 1);
    if (this.fireT > 0) return;
    if (this.burst <= 0) this.burst = this.burstSize();
    this.shoot();
    this.burst--;
    this.fireT = this.burst > 0 ? this.burstGap() : this.burstPause();
  }

  burstSize() { return 3 + ((Math.random() * 3) | 0); }
  burstGap() { return 0.12; }
  burstPause() { return 1.0 + Math.random(); }

  shoot() {
    const G = this.G, pl = G.player;
    const muzzle = this.model.muzzle.getWorldPosition(_v4);
    const target = _v2.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
    const dist = muzzle.distanceTo(target);
    const ps = Math.hypot(pl.vel.x, pl.vel.y, pl.vel.z);
    const spread = 0.035 + Math.min(0.08, ps * 0.004) + dist * 0.0006;
    const dir = target.sub(muzzle).normalize();
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    G.enemies.bullets.spawn(muzzle, dir, this.bulletDmg, this.kind === 'boss');
    this.muzzleT = 0.05;
    G.audio.gunshot(this.pos, this.kind === 'boss');
  }
}

// ===================================================================
// Boss: bigger, tanky, stun-resistant, heavy bursts + shockwave slam
// ===================================================================
const BOSS_CFG = {
  armored: { name: 'BOSS CORAZZATO', scale: 1.6, hp: 1600, color: 0xff6a3a, slamR: 12, variant: 2 },
  commander: { name: 'BOSS COMANDANTE', scale: 1.4, hp: 1300, color: 0xb070ff, slamR: 13, variant: 0 },
};

export class Boss extends Enemy {
  constructor(G, s, idx) {
    const cfg = BOSS_CFG[s.boss];
    super(G, s, cfg.variant, cfg.scale);
    this.kind = 'boss';
    this.bossType = s.boss;
    this.cfg = cfg;
    this.name = cfg.name;
    this.maxHp = this.hp = cfg.hp;
    this.bulletDmg = 6;
    this.slamCd = 3; this.slamWind = 0;
    this.fillMat.color.setHex(cfg.color);
  }

  applyWeb() {
    // Webs only slow a boss down
    this.webStacks = 1; this.webT = 1.5;
    this.model.net.visible = true; this.model.net.material.opacity = 0.4;
  }

  charm() {
    if (!this.alive || this.charmT > 0) return;
    this.charmT = 0.35;
    this.G.audio.charm(this.pos);
  }

  onCharmEnd() {
    const G = this.G;
    G.fx.explosion(this.head, 1.4, 'pink');
    G.fx.shockwave(this.head, 4.5, 0xff8ad8, 0.45);
    G.audio.headPop(this.head);
    this.damage(160, { headshot: true });
  }

  damage(amount, o = {}) {
    // Resists instant stuns and most knockback
    const r = { ...o };
    if (r.stun) r.stun = Math.min(0.2, r.stun * 0.15);
    if (r.knock) r.knock = r.knock.clone().multiplyScalar(0.15);
    if (r.headshot && amount > 0) r.silent = r.silent || false;
    return super.damage(amount, r);
  }

  speedMul() { return this.slamWind > 0 ? 0 : 0.9; }
  burstSize() { return 8 + ((Math.random() * 4) | 0); }
  burstGap() { return 0.075; }
  burstPause() { return 1.3 + Math.random() * 0.6; }

  special(dt, dist, immobile) {
    const G = this.G, pl = G.player;
    this.slamCd -= dt;
    if (this.slamWind > 0) {
      this.slamWind -= dt;
      if (this.slamWind <= 0) this.slam();
      return;
    }
    if (!immobile && this.slamCd <= 0 && dist < this.cfg.slamR && Math.abs(pl.pos.y - this.pos.y) < 4) {
      this.slamWind = 0.65; this.slamCd = 5 + Math.random() * 2;
      G.audio.bossCharge(this.pos);
    }
  }

  slam() {
    const G = this.G, pl = G.player;
    const R = this.cfg.slamR;
    const col = this.bossType === 'armored' ? 0xff8a3a : 0xc080ff;
    G.fx.shockwave(this.pos, R, col, 0.6);
    G.fx.shockwave(this.pos, R * 0.6, 0xffffff, 0.4);
    G.fx.dust(this.pos, 26, 4);
    G.fx.blast(_v.set(this.pos.x, this.pos.y + 0.5, this.pos.z), 4, col, 0.4);
    G.audio.shockwave(this.pos);
    G.fx.addShake(0.5);
    if (!pl.dead) {
      const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < R && Math.abs(pl.pos.y - this.pos.y) < 3) {
        const k = 1 - d / R;
        pl.takeDamage(12 + 18 * k, this.pos);
        const n = d > 0.01 ? 1 / d : 0;
        pl.vel.x += dx * n * (10 + 10 * k); pl.vel.z += dz * n * (10 + 10 * k); pl.vel.y = Math.max(pl.vel.y, 8);
        pl.onGround = false;
      }
    }
  }

  animateExtra() {
    const m = this.model;
    if (this.slamWind > 0) {
      m.armL.rotation.set(-2.8, 0, 0.3); m.armR.rotation.set(-2.8, 0, -0.3);
      m.body.position.y = 0.15;
    }
  }
}

// ===================================================================
// Turret
// ===================================================================
export class Turret {
  constructor(G, [x, y, z]) {
    this.G = G;
    this.kind = 'turret';
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.maxHp = this.hp = 240;
    this.alive = true;
    this.stunT = 0; this.charmT = 0; this.webStacks = 0;
    this.half = 0.8; this.headR = 0.55;
    this.barY = 2.5;
    this.yaw = Math.random() * Math.PI * 2; this.pitchA = 0;
    this.scanDir = 1;
    this.canSee = false; this.thinkT = Math.random() * 0.2;
    this.fireT = 1; this.burst = 0; this.spinV = 0; this.flashT = 0; this.muzzleT = 0;
    this.laserT = 0; this.smokeT = 0;
    this.model = createTurret();
    this.model.root.position.copy(this.pos);
    G.scene.add(this.model.root);
    Object.assign(this, makeBar(G, 1.2));
    this.fillMat.color.setHex(0xff4a3a);
    this.box = { min: new THREE.Vector3(x - 0.8, y, z - 0.8), max: new THREE.Vector3(x + 0.8, y + 1.35, z + 0.8) };
    this.head = new THREE.Vector3(x, y + 1.5, z);
    this.collider = addBox(x - 0.8, y, z - 0.8, x + 0.8, y + 1.8, z + 0.8);
  }

  dispose() {
    this.G.scene.remove(this.model.root);
    this.G.scene.remove(this.bar);
    removeBox(this.collider);
  }

  alert() {}

  charm() {
    if (!this.alive || this.charmT > 0) return;
    this.charmT = 0.7;
    this.G.audio.charm(this.pos);
  }

  damage(amount, o = {}) {
    if (!this.alive) return false;
    const G = this.G;
    this.hp -= amount;
    this.flashT = 0.1;
    if (o.stun) this.stunT = Math.max(this.stunT, o.stun * 0.6);
    if (!o.quiet || this.hp <= 0) G.hud.hitmarker(this.hp <= 0, o.headshot);
    if (!o.silent && !o.quiet) G.audio.hit(o.headshot);
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    const G = this.G, m = this.model;
    this.alive = false; this.hp = 0;
    this.bar.visible = false;
    m.laser.visible = false; m.flash.visible = false;
    m.headMat.color.setHex(0x1a1a1a); m.headMat.emissive.setHex(0x000000);
    m.eye.visible = false;
    m.head.rotation.z = 0.5; m.pitch.rotation.x = -0.6; m.head.position.y = 1.3;
    G.fx.explosion(this.head, 1.4, 'fire');
    G.audio.explosion(this.head, 1.2);
    G.fx.addShake(0.2);
    G.onEnemyKilled(this);
  }

  update(dt, active) {
    const G = this.G, m = this.model, pl = G.player;
    if (!this.alive) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.3;
        G.fx.burst(this.head, 1, { colors: [0x2c2a28, 0x494540], additive: false, speed: 1, up: 1, life: 2, size: 0.6, size1: 2.2, alpha: 0.5, gravity: -1.5, fadeIn: true });
      }
      return;
    }
    if (pl && Math.abs(pl.pos.x - this.pos.x) + Math.abs(pl.pos.z - this.pos.z) > 160) return;
    this.stunT = Math.max(0, this.stunT - dt);
    if (this.charmT > 0) {
      this.charmT -= dt;
      if (this.charmT <= 0) {
        G.fx.explosion(this.head, 1.2, 'pink');
        G.fx.shockwave(this.head, 3, 0xff8ad8, 0.4);
        G.audio.headPop(this.head);
        this.damage(180, { headshot: true });
        if (!this.alive) return;
      }
    }
    const disabled = this.stunT > 0 || this.charmT > 0;

    if (active) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = 0.2;
        this.canSee = false;
        if (pl && !pl.dead) {
          const pc = _v2.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
          if (pc.distanceTo(this.head) < 60 && lineOfSight(_v.copy(this.head).setY(this.head.y + 0.4), pc)) this.canSee = true;
        }
      }
    } else this.canSee = false;

    let aimed = false;
    if (this.canSee && !disabled) {
      const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z;
      const targetYaw = Math.atan2(-dx, -dz);
      const d = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
      this.yaw += Math.sign(d) * Math.min(Math.abs(d), 2.6 * dt);
      const h = Math.hypot(dx, dz);
      const tp = Math.atan2(pl.pos.y + 1.1 - this.head.y, h);
      this.pitchA += (tp - this.pitchA) * Math.min(1, 6 * dt);
      aimed = Math.abs(d) < 0.12;
    } else if (!disabled) {
      this.yaw += this.scanDir * 0.5 * dt;
      this.pitchA *= 0.95;
    }
    m.head.rotation.y = this.yaw;
    m.pitch.rotation.x = this.pitchA;

    this.fireT -= dt;
    if (aimed && this.fireT <= 0) {
      if (this.burst <= 0) this.burst = 6;
      this.shoot();
      this.burst--;
      this.fireT = this.burst > 0 ? 0.09 : 1.5 + Math.random() * 0.6;
    }
    this.spinV += ((aimed ? 22 : 0) - this.spinV) * Math.min(1, 3 * dt);
    m.spin.rotation.z += this.spinV * dt;

    // Red laser pointer (re-measured every other frame)
    m.laser.visible = !disabled;
    this.laserT -= dt;
    if (!disabled && this.laserT <= 0) {
      this.laserT = 0.05;
      m.root.updateMatrixWorld(true);
      const o = m.muzzle.getWorldPosition(_v);
      const dir = _v3.set(0, 0, -1).applyQuaternion(m.muzzle.getWorldQuaternion(_q));
      const hit = raycastWorld(o, dir, 70);
      m.laser.scale.z = hit ? hit.t : 70;
    }

    this.flashT -= dt;
    m.headMat.emissive.setHex(this.flashT > 0 ? 0xff2020 : 0x000000);
    this.muzzleT -= dt;
    m.flash.visible = this.muzzleT > 0;
    m.eye.material.emissiveIntensity = disabled ? 0.3 : 2 + Math.sin(G.time * 10) * 1;
  }

  shoot() {
    const G = this.G, pl = G.player, m = this.model;
    m.root.updateMatrixWorld(true);
    const muzzle = m.muzzle.getWorldPosition(_v4);
    const dir = _v2.set(pl.pos.x, pl.pos.y + 1.0, pl.pos.z).sub(muzzle).normalize();
    const spread = 0.04;
    dir.x += (Math.random() - 0.5) * 2 * spread; dir.y += (Math.random() - 0.5) * 2 * spread; dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    G.enemies.bullets.spawn(muzzle, dir, 3, false);
    this.muzzleT = 0.05;
    G.audio.turretShot(this.pos);
  }
}
const _q = new THREE.Quaternion();

// ===================================================================
// Explosive barrel
// ===================================================================
export class Barrel {
  constructor(G, [x, z]) {
    this.G = G;
    this.kind = 'barrel';
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.alive = true; this.hp = 1; this.maxHp = 1;
    this.stunT = 0; this.charmT = 0; this.webStacks = 0;
    this.headR = 0; this.half = 0.45;
    this.fuse = -1;
    this.model = createExplosiveBarrel();
    this.model.position.copy(this.pos);
    this.model.rotation.y = Math.random() * 6;
    this.model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.scene.add(this.model);
    this.collider = addBox(x - 0.45, 0, z - 0.45, x + 0.45, 1.25, z + 0.45);
    this.box = this.collider;
    this.head = this.pos;
  }

  dispose() {
    this.G.scene.remove(this.model);
    removeBox(this.collider);
  }

  alert() {}
  charm() { this.damage(1); }

  damage() {
    if (!this.alive) return false;
    this.alive = false;
    this.fuse = 0.12;
    return true;
  }

  update(dt) {
    if (this.fuse < 0) return;
    this.fuse -= dt;
    if (this.fuse <= 0) { this.fuse = -1; this.explode(); }
  }

  explode() {
    const G = this.G, pl = G.player;
    const c = _v.set(this.pos.x, 0.8, this.pos.z).clone();
    this.model.visible = false;
    removeBox(this.collider);
    G.fx.explosion(c, 2.2, 'fire');
    G.fx.shockwave(this.pos, 7, 0xffa040, 0.5);
    G.audio.explosion(c, 1.6);
    G.fx.addShake(pl && pl.pos.distanceTo(c) < 25 ? 0.5 : 0.15);
    const R = 7.5;
    G.enemies.inRadius(c, R, (e, d) => {
      if (e === this) return;
      const k = 1 - d / R;
      const kn = new THREE.Vector3(e.pos.x - c.x, 0, e.pos.z - c.z);
      if (kn.lengthSq() < 1e-4) kn.set(1, 0, 0);
      kn.normalize().multiplyScalar(10 * k + 4); kn.y = 6 * k + 2;
      e.damage(40 + 90 * k, { knock: kn, stun: 1, quiet: e.kind === 'barrel' });
    });
    if (pl && !pl.dead) {
      const d = pl.pos.distanceTo(c);
      if (d < R) {
        pl.takeDamage(10 + 25 * (1 - d / R), c);
        pl.vel.y = Math.max(pl.vel.y, 7); pl.onGround = false;
      }
    }
  }
}

// ===================================================================
// Bullets
// ===================================================================
class Bullets {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.geo = new THREE.BoxGeometry(0.05, 0.05, 1.8);
    this.bigGeo = new THREE.BoxGeometry(0.12, 0.12, 2.4);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.bigMat = new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = [];
    this.bigPool = [];
  }

  spawn(origin, dir, dmg = 4, big = false) {
    const pool = big ? this.bigPool : this.pool;
    const mesh = pool.pop() || new THREE.Mesh(big ? this.bigGeo : this.geo, big ? this.bigMat : this.mat);
    mesh.visible = true;
    mesh.position.copy(origin);
    mesh.lookAt(_v.copy(origin).add(dir));
    this.G.scene.add(mesh);
    this.list.push({ pos: origin.clone(), dir: dir.clone(), speed: big ? 75 : 85, life: 1.4, mesh, whizzed: false, dmg, big });
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
        _box.min.set(pl.pos.x - 0.45, pl.pos.y, pl.pos.z - 0.45);
        _box.max.set(pl.pos.x + 0.45, pl.pos.y + 1.85, pl.pos.z + 0.45);
        const r = rayBox(b.pos, b.dir, _box, Math.min(step, hitT));
        if (r) { hitT = r.t; hitPlayer = true; }
        if (!b.whizzed) {
          _v.subVectors(pl.pos, b.pos);
          if (_v.lengthSq() < 9) { b.whizzed = true; G.audio.whiz(); }
        }
      }
      if (hitT < Infinity) {
        b.pos.addScaledVector(b.dir, hitT);
        if (hitPlayer) pl.takeDamage(b.dmg, b.pos);
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
    (b.big ? this.bigPool : this.pool).push(b.mesh);
    this.list.splice(i, 1);
  }

  clear() { for (let i = this.list.length - 1; i >= 0; i--) this.kill(i); }
}

// ===================================================================
// Manager
// ===================================================================
export class EnemyManager {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.bullets = new Bullets(G);
  }

  reset(spawns) {
    for (const e of this.list) e.dispose();
    this.list = spawns.map((s, i) => (s.boss ? new Boss(this.G, s, i) : new Enemy(this.G, s, i)));
    for (const t of TURRET_SPOTS) this.list.push(new Turret(this.G, t));
    for (const b of BARREL_SPOTS) this.list.push(new Barrel(this.G, b));
    this.bosses = this.list.filter((e) => e.kind === 'boss');
    this.bullets.clear();
  }

  // Bandits + bosses still standing
  get aliveCount() { let n = 0; for (const e of this.list) if (e.alive && (e.kind === 'bandit' || e.kind === 'boss')) n++; return n; }
  get turretCount() { let n = 0; for (const e of this.list) if (e.alive && e.kind === 'turret') n++; return n; }

  // Living combat targets (excludes barrels)
  targets(out = []) {
    out.length = 0;
    for (const e of this.list) if (e.alive && e.kind !== 'barrel') out.push(e);
    return out;
  }

  alertNearby(src, radius) {
    for (const e of this.list) {
      if (e === src || !e.alive || e.kind !== 'bandit' || e.state === 'combat') continue;
      if (e.pos.distanceTo(src.pos) < radius) e.alert(0.9);
    }
  }

  update(dt, active) {
    const L = this.list;
    for (const e of L) e.update(dt, active);
    // Soft separation between foot soldiers
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive || (a.kind !== 'bandit' && a.kind !== 'boss')) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || (b.kind !== 'bandit' && b.kind !== 'boss') || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius + 0.1;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
    this.bullets.update(active ? dt : 0);
  }

  updateBars(camera) {
    for (const e of this.list) {
      if (!e.alive || !e.bar) continue;
      const d = camera.position.distanceTo(e.pos);
      e.bar.visible = d < 70;
      if (!e.bar.visible) continue;
      e.bar.position.set(e.pos.x, e.pos.y + e.barY, e.pos.z);
      e.bar.quaternion.copy(camera.quaternion);
      const k = Math.max(0, e.hp / e.maxHp);
      e.fill.scale.x = Math.max(0.001, k);
      if (e.kind === 'bandit') {
        _barColor.setHSL(k * 0.33, 0.9, 0.5);
        e.fillMat.color.copy(_barColor);
      }
    }
  }

  // Ray against all living targets. pad widens hitboxes (for thick projectiles).
  raycast(o, d, maxT, pad = 0) {
    let best = maxT, hit = null, part = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.headR > 0) {
        const th = raySphere(o, d, e.head, e.headR + pad, best);
        if (th >= 0 && th < best) { best = th; hit = e; part = 'head'; }
      }
      _box.min.copy(e.box.min).subScalar(pad); _box.max.copy(e.box.max).addScalar(pad);
      _box.max.y = e.box.max.y; // padding must not let the body swallow head hits
      const r = rayBox(o, d, _box, best);
      if (r && r.t < best) { best = r.t; hit = e; part = 'body'; }
    }
    return hit ? { enemy: hit, t: best, part } : null;
  }

  inRadius(pos, radius, cb) {
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = _v3.set(e.pos.x, e.pos.y + 1, e.pos.z).distanceTo(pos);
      if (d <= radius) cb(e, d);
    }
  }
}
