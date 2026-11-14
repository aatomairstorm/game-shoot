import * as THREE from 'three';
import { moveBody, raycastWorld } from './collision.js';
import { createHero, createHammer, walkPose } from './models.js';
import { HEROES } from './heroes.js';
import { PLAYER_SPAWN } from './world.js';
import { LuciaKit, BenKit, FiaKit } from './kits.js';

const GRAVITY = 30;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function angleLerp(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}

export class Player {
  constructor(G, id) {
    this.G = G;
    this.id = id;
    this.hero = HEROES[id];
    this.pos = PLAYER_SPAWN.clone();
    this.vel = new THREE.Vector3();
    this.radius = 0.42; this.height = 1.9; this.onGround = true;
    this.maxHp = this.hero.hp; this.hp = this.maxHp;
    this.dead = false; this.deadT = 0;
    this.lastHurt = -99; this.hurtSound = 0;
    this.model = createHero(id);
    this.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    G.scene.add(this.model.root);
    this.facing = G.cam.yaw;
    this.moveAmt = 0; this.phase = 0;
    this.wish = new THREE.Vector3();
    this.mode = 'ground';
    this.lastWall = null;
    this.invuln = false;
    const Kits = { web: WebKit, thor: ThorKit, iron: IronKit, lucia: LuciaKit, ben: BenKit, fia: FiaKit };
    this.kit = new (Kits[id] || WebKit)(this);
    this.syncModel();
  }

  // Swap the visible character model (Omnitrix transformations).
  setModel(model) {
    this.G.scene.remove(this.model.root);
    this.model = model;
    model.root.traverse((o) => { if (o.isMesh && o.castShadow !== false) o.castShadow = true; });
    this.G.scene.add(model.root);
    this.syncModel();
  }

  dispose() {
    this.kit.dispose?.();
    this.G.scene.remove(this.model.root);
  }

  chestPos(out) { return out.set(this.pos.x, this.pos.y + 1.25, this.pos.z); }
  handPos(side, out) {
    this.model.root.updateMatrixWorld(true);
    return (side < 0 ? this.model.handL : this.model.handR).getWorldPosition(out);
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.y, this.vel.z); }

  takeDamage(amount, from) {
    if (this.dead || this.invuln) return;
    const G = this.G;
    this.kit.onDamaged?.(amount);
    this.hp -= amount * (this.kit.damageScale || 1);
    this.lastHurt = G.time;
    G.hud.damageFlash(amount / 6);
    G.fx.addShake(0.12);
    if (G.time - this.hurtSound > 0.12) { this.hurtSound = G.time; G.audio.hurt(); }
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.hp = 0;
    this.kit.onDeath?.();
    this.G.onPlayerDeath();
  }

  update(dt) {
    const G = this.G, inp = G.input;
    if (this.dead) {
      this.deadT += dt;
      this.vel.x *= 0.9; this.vel.z *= 0.9;
      this.vel.y -= GRAVITY * dt;
      moveBody(this, dt);
      this.model.body.rotation.x = -Math.min(1, this.deadT / 0.6) * 1.45;
      this.model.body.position.y = Math.min(1, this.deadT / 0.6) * 0.2;
      this.syncModel();
      return;
    }

    const yaw = G.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const ix = (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0);
    const iz = (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0);
    const w = this.wish.set(rx * ix + fx * iz, 0, rz * ix + fz * iz);
    if (w.lengthSq() > 0) w.normalize();

    this.mode = 'ground';
    this.kit.update(dt, w);

    if (this.mode === 'ground') {
      const sprint = this.kit.canSprint && (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight'));
      const sp = this.kit.speed * (sprint ? 1.45 : 1);
      if (this.onGround) {
        const k = Math.min(1, 14 * dt);
        this.vel.x += (w.x * sp - this.vel.x) * k;
        this.vel.z += (w.z * sp - this.vel.z) * k;
      } else if (ix || iz) {
        // Air control that never brakes existing momentum (e.g. after a grapple).
        const hs0 = Math.hypot(this.vel.x, this.vel.z);
        this.vel.x += w.x * sp * 2.2 * dt;
        this.vel.z += w.z * sp * 2.2 * dt;
        const hs1 = Math.hypot(this.vel.x, this.vel.z), cap = Math.max(hs0, sp);
        if (hs1 > cap) { this.vel.x *= cap / hs1; this.vel.z *= cap / hs1; }
      }
      this.vel.y -= GRAVITY * dt;
    }
    this.kit.afterPhysics?.(dt);

    const r = moveBody(this, dt, this.mode !== 'flight');
    this.lastWall = r.wall;
    if (r.landed) {
      this.kit.onLand?.(r.landSpeed);
      if (r.landSpeed > 15) G.fx.dust(this.pos, 10, 1);
    }

    if (G.time - this.lastHurt > 5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 5 * dt);
    this.animate(dt);
  }

  syncModel() {
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
  }

  animate(dt) {
    const G = this.G, m = this.model;
    this.facing = angleLerp(this.facing, G.cam.yaw, Math.min(1, 16 * dt));
    this.syncModel();
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const target = this.onGround ? Math.min(1, hs / 8) : 0;
    this.moveAmt += (target - this.moveAmt) * Math.min(1, 10 * dt);
    this.phase += dt * (hs * 1.05 + 1);
    walkPose(m, this.phase, this.moveAmt);
    m.body.rotation.set(0, 0, 0);
    if (!this.onGround && this.mode !== 'flight') {
      m.legL.rotation.x = 0.55; m.legR.rotation.x = -0.25;
      m.armL.rotation.x = -0.4; m.armR.rotation.x = -0.4;
      m.armL.rotation.z = -0.5; m.armR.rotation.z = 0.5;
    } else { m.armL.rotation.z = 0; m.armR.rotation.z = 0; }
    this.kit.animate?.(dt);
  }

  // Arm rotation (around x) that points the arm along the camera pitch.
  aimArm() { return Math.PI / 2 + this.G.cam.pitch; }
}

// ===================================================================
// WEB-SLINGER
// ===================================================================
class WebKit {
  constructor(p) {
    this.p = p;
    this.speed = 10.5; this.canSprint = true;
    this.fireCd = 0; this.grapple = null; this.grappleCd = 0;
    this.jumps = 0; this.shootAnim = 0; this.flip = 0;
    const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).rotateX(Math.PI / 2);
    this.rope = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xf4f8ff }));
    this.rope.visible = false; this.rope.frustumCulled = false;
    p.G.scene.add(this.rope);
    this.webGeo = new THREE.IcosahedronGeometry(0.15, 0);
    this.webMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8899aa, roughness: 0.4 });
  }

  dispose() { this.p.G.scene.remove(this.rope); }
  onDeath() { this.release(false); }

  update(dt, wish) {
    const p = this.p, G = p.G, inp = G.input;
    this.fireCd -= dt; this.grappleCd -= dt; this.shootAnim -= dt; this.flip -= dt;
    if (p.onGround && p.vel.y <= 0) this.jumps = 0;

    if (inp.pressed('Space')) {
      if (this.grapple) {
        this.release(false);
        p.vel.y = Math.max(p.vel.y, 11); this.jumps = 1; G.audio.jump();
      } else if (p.onGround) {
        p.vel.y = 12.5; p.onGround = false; this.jumps = 1; G.audio.jump();
      } else if (this.jumps < 2) {
        p.vel.y = 12; this.jumps = 2; this.flip = 0.5; G.audio.doubleJump();
        G.fx.burst(_a.copy(p.pos), 10, { color: 0xffffff, speed: 3, life: 0.4, size: 0.3, size1: 0.05 });
      }
    }
    if (inp.mouse.left && this.fireCd <= 0) this.fire();
    if (inp.pressed('Mouse2') || inp.pressed('KeyE')) {
      if (this.grapple) this.release(true); else if (this.grappleCd <= 0) this.tryGrapple();
    }
    if (this.grapple) { p.mode = 'custom'; this.updateGrapple(dt, wish); }
  }

  fire() {
    const p = this.p, G = p.G;
    const hand = p.handPos(1, new THREE.Vector3());
    const dir = _a.subVectors(G.aim.point, hand).normalize();
    G.projectiles.spawn({
      mesh: new THREE.Mesh(this.webGeo, this.webMat),
      pos: hand, vel: dir.clone().multiplyScalar(90), gravity: 3, radius: 0.2, life: 1.2, spin: 12,
      onTrail: (pos) => G.fx.trail(pos, 0xe8f4ff, 0.32, 0.22),
      onEnemy: (e, part, pos) => {
        const head = part === 'head';
        e.damage(head ? 22 : 12, { web: true, headshot: head });
        G.fx.burst(pos, 14, { color: 0xffffff, speed: 4, life: 0.4, size: 0.25, size1: 0.05 });
        G.audio.webHit(pos);
      },
      onWorld: (h) => G.fx.burst(h.point, 8, { color: 0xffffff, speed: 3, life: 0.4, size: 0.22, size1: 0.05 }),
    });
    this.fireCd = 0.22; this.shootAnim = 0.25;
    G.audio.webShot(); G.hud.recoil(4);
  }

  // Returns a grapple target for the current aim, or null.
  findAnchor() {
    const G = this.p.G;
    const w = G.aim.world;
    if (!w || w.ground || G.aim.worldDist > 45) return null;
    return w;
  }

  tryGrapple() {
    const p = this.p, G = p.G;
    const hit = this.findAnchor();
    const hand = p.handPos(1, new THREE.Vector3());
    if (!hit) {
      G.audio.grappleMiss();
      G.fx.beam(hand, _b.copy(hand).addScaledVector(G.aim.dir, 12), 0xffffff, 0.02, 0.15);
      G.hud.toast('Nessun appiglio entro 45 m', 'bad', 1200);
      this.grappleCd = 0.3;
      return;
    }
    const target = hit.point.clone();
    if (hit.box && Math.abs(hit.normal.y) < 0.5) {
      // Hit a wall near the top: aim the pull just over the roof edge to land on it.
      const top = hit.box.max.y;
      if (top - hit.point.y < 30) { target.y = top + 1.7; target.addScaledVector(hit.normal, -1.6); }
    } else if (hit.normal.y > 0.5) {
      target.y += 1.3;
    }
    this.grapple = { target, anchor: hit.point.clone(), normal: hit.normal.clone(), t: 0 };
    p.onGround = false;
    p.vel.y = Math.max(p.vel.y, 5);
    p.chestPos(_a);
    p.vel.addScaledVector(_b.subVectors(target, _a).normalize(), 8);
    G.audio.grapple();
    this.shootAnim = 0.3;
  }

  updateGrapple(dt, wish) {
    const p = this.p, g = this.grapple;
    g.t += dt;
    const chest = p.chestPos(_a);
    const to = _b.subVectors(g.target, chest);
    const dist = to.length();
    if (dist < 1.8 || g.t > 4) { this.release(true); return; }
    to.divideScalar(dist);
    p.vel.addScaledVector(to, 64 * dt);
    p.vel.y -= GRAVITY * 0.3 * dt;
    p.vel.addScaledVector(wish, 10 * dt);
    const along = p.vel.dot(to);
    _c.copy(p.vel).addScaledVector(to, -along);
    p.vel.addScaledVector(_c, -Math.min(1, 2.4 * dt));
    const sp = p.vel.length();
    if (sp > 36) p.vel.multiplyScalar(36 / sp);
    // Scale walls: when pressed against a wall below the target, climb.
    if (p.lastWall && g.target.y > p.pos.y + 0.5) p.vel.y = Math.max(p.vel.y, 15);
  }

  release(boost) {
    const p = this.p, g = this.grapple;
    if (!g) return;
    this.grapple = null;
    this.rope.visible = false;
    this.grappleCd = 0.25;
    if (boost) {
      p.vel.y = Math.max(p.vel.y * 0.5, 8);
      if (Math.abs(g.normal.y) < 0.5) { p.vel.x -= g.normal.x * 3; p.vel.z -= g.normal.z * 3; }
      const hs = Math.hypot(p.vel.x, p.vel.z);
      if (hs > 14) { p.vel.x *= 14 / hs; p.vel.z *= 14 / hs; }
    }
  }

  animate() {
    const p = this.p, m = p.model;
    if (this.shootAnim > 0 || this.grapple) {
      m.armR.rotation.x = this.grapple ? 2.7 : p.aimArm();
      m.armR.rotation.z = 0;
    }
    if (this.flip > 0) m.body.rotation.x = -(1 - this.flip / 0.5) * Math.PI * 2;
    if (this.grapple) {
      const hand = p.handPos(1, _a);
      const a = this.grapple.anchor;
      const len = hand.distanceTo(a);
      this.rope.position.copy(hand).add(a).multiplyScalar(0.5);
      this.rope.lookAt(a);
      this.rope.scale.set(0.035, 0.035, len);
      this.rope.visible = true;
    }
  }

  hud() {
    const p = this.p, G = p.G;
    const anchor = !this.grapple && this.findAnchor();
    return [
      { key: 'Click SX', name: 'Spara-Ragnatele', ratio: 1 - Math.max(0, this.fireCd) / 0.22, state: 'ready', text: 'Danno + rallenta' },
      this.grapple
        ? { key: 'Click DX / E', name: 'Rampino', ratio: 1, state: 'active', text: 'Agganciato! (Spazio per saltare)' }
        : { key: 'Click DX / E', name: 'Rampino', ratio: 1, state: anchor ? 'ready' : 'cool', text: anchor ? `Appiglio a ${Math.round(G.aim.worldDist)} m` : 'Mira un muro/tetto ≤ 45 m' },
    ];
  }

  status() { return this.jumps === 1 && !this.p.onGround ? 'Doppio salto disponibile' : 'Agilità: salto doppio attivo'; }
  crosshair() { return !this.grapple && this.findAnchor() ? 'grapple' : ''; }
}

// ===================================================================
// THUNDER WARRIOR
// ===================================================================
class ThorKit {
  constructor(p) {
    this.p = p;
    this.speed = 9; this.canSprint = true; this.damageScale = 0.85;
    this.state = 'hand';
    this.jumpCd = 0; this.superJump = false; this.throwAnim = 0;
    this.hammer = createHammer();
    this.hammer.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.holder = new THREE.Group();
    this.spin = new THREE.Group();
    this.holder.add(this.spin);
    p.G.scene.add(this.holder);
    this.hpos = new THREE.Vector3(); this.hvel = new THREE.Vector3();
    this.hitSet = new Set();
    this.flyT = 0; this.retSpeed = 0; this.dropping = false; this.idleSpark = 0;
    this.attachToHand();
  }

  dispose() { this.p.G.scene.remove(this.holder); }

  attachToHand() {
    this.p.model.handR.add(this.hammer);
    this.hammer.position.set(0, -0.02, 0);
    this.hammer.rotation.set(Math.PI, 0, 0);
    this.holder.visible = false;
    this.state = 'hand';
  }

  attachToHolder(stuck) {
    this.spin.add(this.hammer);
    this.hammer.rotation.set(0, 0, 0);
    this.hammer.position.set(0, stuck ? -0.75 : -0.35, 0);
    this.holder.visible = true;
  }

  update(dt) {
    const p = this.p, G = p.G, inp = G.input;
    this.jumpCd -= dt; this.throwAnim -= dt;
    if (inp.pressed('Space') && p.onGround && this.jumpCd <= 0) {
      p.vel.y = 33; p.onGround = false; this.superJump = true; this.jumpCd = 0.5;
      p.vel.x += p.wish.x * 4; p.vel.z += p.wish.z * 4;
      G.audio.superJump();
      G.fx.dust(p.pos, 18, 1.5);
      G.fx.shockwave(p.pos, 3, 0x9fe4ff, 0.35);
    }
    if (inp.pressed('Mouse0') && this.state === 'hand') this.throw();
    if ((inp.pressed('Mouse2') || inp.pressed('KeyE'))) {
      if (this.state === 'stuck' || this.state === 'flying') this.recall();
      else if (this.state === 'hand') G.hud.toast('Il martello è già in mano', '', 900);
    }
    this.updateHammer(dt);
  }

  throw() {
    const p = this.p, G = p.G;
    const start = p.handPos(1, new THREE.Vector3());
    start.y += 0.4;
    const dir = _a.subVectors(G.aim.point, start).normalize();
    this.hpos.copy(start);
    this.hvel.copy(dir).multiplyScalar(58);
    this.flyT = 0; this.dropping = false; this.state = 'flying';
    this.attachToHolder(false);
    this.holder.position.copy(this.hpos);
    this.throwAnim = 0.35;
    G.audio.hammerThrow(); G.hud.recoil(10);
  }

  recall() {
    const G = this.p.G;
    this.state = 'returning';
    this.hitSet.clear();
    this.retSpeed = 18;
    this.hvel.set(0, 9, 0);
    this.attachToHolder(false);
    this.spin.rotation.set(0, 0, 0);
    G.audio.recall();
    G.fx.lightning(this.hpos, _a.copy(this.hpos).add(_b.set(0, 4, 0)), 0xbfefff, 0.25, 0.8);
    G.fx.sparks(this.hpos, 0x9fe4ff, 16, 6);
  }

  stick(hit) {
    const G = this.p.G;
    this.hpos.copy(hit.point);
    this.state = 'stuck';
    this.attachToHolder(true);
    this.holder.position.copy(this.hpos);
    this.holder.quaternion.setFromUnitVectors(UP, hit.normal);
    this.spin.rotation.set(Math.PI, 0, 0);
    G.audio.hammerImpact(this.hpos);
    G.fx.sparks(this.hpos, 0xbfe8ff, 18, 8);
    G.fx.dust(this.hpos, 10, 0.8);
    if (this.hpos.distanceTo(this.p.pos) < 20) G.fx.addShake(0.12);
  }

  updateHammer(dt) {
    const p = this.p, G = p.G;
    if (this.state === 'hand') {
      this.idleSpark -= dt;
      if (this.idleSpark <= 0) {
        this.idleSpark = 0.4 + Math.random() * 0.8;
        const hp = this.hammer.getWorldPosition(_a);
        G.fx.burst(hp, 3, { color: 0x9fe4ff, speed: 2, life: 0.25, size: 0.1, size1: 0.02 });
      }
      return;
    }
    if (this.state === 'stuck') {
      this.idleSpark -= dt;
      if (this.idleSpark <= 0) {
        this.idleSpark = 0.25 + Math.random() * 0.5;
        G.fx.burst(_a.copy(this.hpos).addScaledVector(UP, 0.4), 4, { color: 0x9fe4ff, speed: 3, life: 0.25, size: 0.12, size1: 0.02 });
      }
      return;
    }
    const prev = _c.copy(this.hpos);
    if (this.state === 'flying') {
      this.flyT += dt;
      this.hvel.y -= (this.dropping ? 30 : this.flyT > 1.1 ? 18 : 2) * dt;
      const step = _a.copy(this.hvel).multiplyScalar(dt);
      const len = step.length();
      const dir = step.divideScalar(len || 1);
      const wh = raycastWorld(this.hpos, dir, len);
      if (!this.dropping) {
        const eh = G.enemies.raycast(this.hpos, dir, wh ? wh.t : len, 0.3);
        if (eh) {
          this.hpos.addScaledVector(dir, eh.t);
          const crit = eh.part === 'head';
          eh.enemy.damage(crit ? 110 : 55, { headshot: crit, knock: _b.copy(dir).multiplyScalar(7).add(UP.clone().multiplyScalar(4)), stun: 0.8 });
          G.fx.sparks(this.hpos, 0x9fe4ff, 22, 10);
          G.fx.explosion(this.hpos, 0.6, 'blue');
          G.audio.hammerImpact(this.hpos);
          G.fx.addShake(0.15);
          this.dropping = true;
          this.hvel.set(-dir.x * 3, 5, -dir.z * 3);
          this.holder.position.copy(this.hpos);
          return;
        }
      }
      if (wh) { this.stick(wh); return; }
      this.hpos.addScaledVector(dir, len);
      this.spin.rotation.x -= dt * 22;
      if (Math.random() < 0.7) G.fx.trail(this.hpos, 0x9fe4ff, 0.35, 0.25);
    } else if (this.state === 'returning') {
      const hand = p.handPos(1, _b);
      const to = _a.subVectors(hand, this.hpos);
      const d = to.length();
      if (d < 1.3) { this.catch(); return; }
      this.retSpeed = Math.min(85, this.retSpeed + 110 * dt);
      to.divideScalar(d).multiplyScalar(this.retSpeed);
      this.hvel.lerp(to, Math.min(1, (d < 8 ? 20 : 7) * dt));
      const from = prev.clone();
      this.hpos.addScaledVector(this.hvel, dt);
      if (_a.subVectors(hand, this.hpos).dot(_c.subVectors(hand, from)) < 0) { this.catch(); return; }
      // Bandits along the return path get smashed
      const seg = new THREE.Vector3().subVectors(this.hpos, from);
      const segLen2 = Math.max(1e-6, seg.lengthSq());
      for (const e of G.enemies.list) {
        if (!e.alive || this.hitSet.has(e)) continue;
        const ec = _b.set(e.pos.x, e.pos.y + 1.0, e.pos.z);
        const prev = from;
        const t = Math.max(0, Math.min(1, _c.subVectors(ec, prev).dot(seg) / segLen2));
        const cx = prev.x + seg.x * t, cy = prev.y + seg.y * t, cz = prev.z + seg.z * t;
        if (Math.hypot(ec.x - cx, ec.y - cy, ec.z - cz) < 1.7) {
          this.hitSet.add(e);
          const kn = this.hvel.clone().normalize().multiplyScalar(16); kn.y = 7;
          e.damage(75, { knock: kn, stun: 1.2 });
          G.fx.lightning(this.hpos, _c.set(e.pos.x, e.pos.y + 1.2, e.pos.z), 0xbfefff, 0.2, 0.7);
          G.fx.explosion(_c, 0.7, 'blue');
          G.audio.electric(e.pos);
          G.fx.addShake(0.2);
        }
      }
      this.spin.rotation.x -= dt * 30;
      G.fx.trail(this.hpos, 0x9fe4ff, 0.45, 0.3);
      if (Math.random() < 0.35) {
        _c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2.5).add(this.hpos);
        G.fx.lightning(this.hpos, _c, 0x9fe4ff, 0.08, 0.5);
      }
    }
    this.holder.position.copy(this.hpos);
    if (this.hvel.lengthSq() > 0.01) this.holder.lookAt(_a.copy(this.hpos).add(this.hvel));
  }

  catch() {
    const G = this.p.G;
    this.attachToHand();
    G.audio.hammerCatch();
    G.fx.sparks(this.p.handPos(1, _a), 0x9fe4ff, 12, 5);
    G.fx.addShake(0.08);
  }

  onLand(speed) {
    if (this.superJump || speed > 24) this.shockwave();
    this.superJump = false;
  }

  shockwave() {
    const p = this.p, G = p.G;
    const pos = p.pos.clone();
    G.fx.shockwave(pos, 10, 0x9fe4ff, 0.6);
    G.fx.shockwave(pos, 6, 0xffffff, 0.4);
    G.fx.dust(pos, 30, 4);
    G.fx.burst(_a.copy(pos).add(_b.set(0, 0.3, 0)), 30, { color: 0x9fe4ff, speed: 12, life: 0.4, size: 0.18, size1: 0.02, flat: true, up: 0.3 });
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      G.fx.lightning(_a.copy(pos).add(_b.set(0, 0.5, 0)), _c.set(pos.x + Math.cos(a) * 6, pos.y + 0.3, pos.z + Math.sin(a) * 6), 0xbfefff, 0.25, 0.9);
    }
    G.fx.flash(_a.copy(pos).add(_b.set(0, 1, 0)), 0x88ccff, 160, 0.3);
    G.audio.shockwave(pos);
    G.fx.addShake(0.6);
    G.enemies.inRadius(pos, 9, (e, d) => {
      const k = 1 - d / 9;
      const dir = new THREE.Vector3(e.pos.x - pos.x, 0, e.pos.z - pos.z);
      if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
      dir.normalize().multiplyScalar(8 + 10 * k);
      dir.y = 6 + 4 * k;
      e.damage(15 + 35 * k, { knock: dir, stun: 1.2 });
    });
  }

  animate() {
    const p = this.p, m = p.model, G = p.G;
    if (this.throwAnim > 0) {
      const k = this.throwAnim / 0.35;
      m.armR.rotation.x = Math.PI * 0.95 * k + p.aimArm() * (1 - k);
    } else if (this.state === 'returning') {
      m.armR.rotation.x = p.aimArm();
      m.armR.rotation.z = 0;
    }
    const hs = Math.hypot(p.vel.x, p.vel.z);
    m.cape.rotation.x = -(0.08 + Math.min(0.9, hs * 0.06 + Math.max(0, -p.vel.y) * 0.03)) + Math.sin(G.time * 7) * 0.04;
  }

  hud() {
    const S = this.state;
    return [
      { key: 'Click SX', name: 'Lancio Martello', ratio: S === 'hand' ? 1 : 0, state: S === 'hand' ? 'ready' : 'cool', text: S === 'hand' ? 'Pronto (testa = critico ×2)' : 'Martello lontano' },
      { key: 'Click DX / E', name: 'Richiamo', ratio: S === 'hand' ? 0 : 1, state: S === 'returning' ? 'active' : S === 'hand' ? 'cool' : 'ready', text: S === 'returning' ? 'In arrivo…' : S === 'hand' ? 'Già in mano' : 'Premi per richiamare' },
      { key: 'Spazio', name: 'Super-Salto', ratio: 1 - Math.max(0, this.jumpCd) / 0.5, state: this.superJump ? 'active' : 'ready', text: this.superJump ? 'Onda d’urto all’atterraggio' : 'Pronto' },
    ];
  }

  status() {
    const S = this.state;
    if (S === 'hand') return 'Martello: in mano';
    const d = Math.round(this.hpos.distanceTo(this.p.pos));
    return S === 'stuck' ? `Martello: conficcato a ${d} m` : S === 'flying' ? `Martello: in volo (${d} m)` : 'Martello: di ritorno!';
  }
  crosshair() { return ''; }
}

// ===================================================================
// IRON STRIKER
// ===================================================================
class IronKit {
  constructor(p) {
    this.p = p;
    this.speed = 8.5; this.canSprint = false;
    this.flying = false; this.lastSpace = -1;
    this.laserCd = 0; this.comicCd = 0; this.queue = 0; this.queueT = 0;
    this.palm = 0; this.thrust = 0; this.shootAnim = 0;
    this.poopGeo = new THREE.SphereGeometry(0.2, 10, 8);
    this.poopMat = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.35, metalness: 0.1 });
  }

  dispose() { this.p.G.audio.setThrust(0); }
  onDeath() { this.flying = false; this.p.G.audio.setThrust(0); }

  setFlying(on) {
    const p = this.p, G = p.G;
    if (on === this.flying) return;
    this.flying = on;
    if (on) {
      p.vel.y = Math.max(p.vel.y, 6); p.onGround = false;
      G.audio.flightOn();
      G.fx.burst(p.pos, 16, { colors: [0x9fe6ff, 0xffffff], speed: 5, life: 0.4, size: 0.3, size1: 0.05, flat: true });
      G.hud.toast('Volo attivato', '', 900);
    } else {
      G.audio.flightOff();
      G.hud.toast('Volo disattivato', '', 900);
    }
  }

  update(dt, wish) {
    const p = this.p, G = p.G, inp = G.input;
    this.laserCd -= dt; this.comicCd -= dt; this.shootAnim -= dt;
    if (inp.pressed('ShiftLeft') || inp.pressed('ShiftRight')) this.setFlying(!this.flying);
    if (inp.pressed('Space')) {
      if (!this.flying && G.time - this.lastSpace < 0.3) this.setFlying(true);
      else if (!this.flying && p.onGround) { p.vel.y = 10.5; p.onGround = false; G.audio.jump(); }
      this.lastSpace = G.time;
    }
    if (this.flying) {
      p.mode = 'flight';
      const up = inp.isDown('Space') ? 1 : 0;
      const down = inp.isDown('KeyC') || inp.isDown('ControlLeft') || inp.isDown('ControlRight') ? 1 : 0;
      const k = Math.min(1, 3.2 * dt);
      p.vel.x += (wish.x * 22 - p.vel.x) * k;
      p.vel.z += (wish.z * 22 - p.vel.z) * k;
      const ty = (up - down) * 13 + (up || down ? 0 : Math.sin(G.time * 2.4) * 0.35);
      p.vel.y += (ty - p.vel.y) * Math.min(1, 4 * dt);
    }
    if (inp.mouse.left && this.laserCd <= 0) this.fireLaser();
    if (inp.pressed('Mouse2') || inp.pressed('KeyE')) {
      if (this.comicCd <= 0) {
        this.comicCd = 5; this.queue = 5; this.queueT = 0;
        G.audio.fart();
        G.hud.toast('💨 Scarica posteriore!', '', 1200);
      } else G.hud.toast(`Scarica in ricarica (${this.comicCd.toFixed(1)} s)`, 'bad', 900);
    }
    if (this.queue > 0) {
      this.queueT -= dt;
      if (this.queueT <= 0) { this.shootPoop(); this.queue--; this.queueT = 0.08; }
    }
    const hs = Math.hypot(p.vel.x, p.vel.z);
    const target = this.flying ? 0.55 + 0.45 * Math.min(1, (hs + Math.abs(p.vel.y)) / 20) : !p.onGround && p.vel.y > 0 ? 0.6 : 0;
    this.thrust += (target - this.thrust) * Math.min(1, 8 * dt);
    G.audio.setThrust(this.thrust);
  }

  fireLaser() {
    const p = this.p, G = p.G;
    this.palm ^= 1;
    const hand = p.handPos(this.palm ? 1 : -1, new THREE.Vector3());
    const end = G.aim.point.clone();
    const dir = _a.subVectors(end, hand);
    const len = dir.length();
    dir.divideScalar(len || 1);
    let enemy = G.aim.enemy, part = G.aim.part;
    const block = raycastWorld(hand, dir, Math.max(0, len - 0.1));
    if (block) { end.copy(block.point); enemy = null; }
    G.fx.beam(hand, end, 0x6fe0ff, 0.075, 0.13);
    G.fx.explosion(end, 0.45, 'blue');
    if (enemy) {
      const head = part === 'head';
      enemy.damage(head ? 36 : 20, { headshot: head, knock: dir.clone().multiplyScalar(1.5) });
    }
    this.laserCd = 0.16; this.shootAnim = 0.2;
    G.audio.laser(); G.hud.recoil(5);
  }

  shootPoop() {
    const p = this.p, G = p.G;
    const yaw = this.p.facing;
    const back = _a.set(Math.sin(yaw), 0, Math.cos(yaw));
    const origin = new THREE.Vector3(p.pos.x, p.pos.y + 0.95, p.pos.z).addScaledVector(back, 0.35);
    const dir = new THREE.Vector3().copy(back).multiplyScalar(0.75);
    dir.y = this.flying ? -0.9 : -0.55;
    dir.x += (Math.random() - 0.5) * 0.35; dir.z += (Math.random() - 0.5) * 0.35;
    dir.normalize();
    const vel = dir.multiplyScalar(24).addScaledVector(p.vel, 0.5);
    const mesh = new THREE.Mesh(this.poopGeo, this.poopMat);
    mesh.scale.set(1, 0.8, 1.25);
    mesh.castShadow = true;
    G.projectiles.spawn({
      mesh, pos: origin, vel, gravity: 16, radius: 0.25, life: 4, spin: 9,
      onTrail: (pos) => { if (Math.random() < 0.5) G.fx.trail(pos, 0x6b5a24, 0.5, 0.5, false, 0.5); },
      onEnemy: (e, part, pos) => this.stink(pos, e),
      onWorld: (h) => this.stink(h.point),
      onExpire: (pos) => this.stink(pos),
    });
    G.fx.burst(origin, 5, { colors: [0x7a6a30, 0x5a4a20], additive: false, speed: 2, life: 0.7, size: 0.5, size1: 1.2, alpha: 0.5 });
  }

  stink(pos, direct) {
    const G = this.p.G;
    const at = pos.clone(); at.y = Math.max(at.y, 0.2);
    G.fx.explosion(at, 1, 'stink');
    G.audio.plop(at);
    if (direct) direct.damage(20, { stun: 3 });
    G.enemies.inRadius(at, 6, (e) => { if (e !== direct) e.damage(14, { stun: 3, quiet: true }); else e.stunT = Math.max(e.stunT, 3); });
    G.hazards.push({ pos: at, r: 6.5, t: 0, life: 6, emitT: 0 });
  }

  animate() {
    const p = this.p, m = p.model, G = p.G;
    const th = this.thrust;
    for (const f of m.flames) {
      f.visible = th > 0.05;
      if (f.visible) f.scale.set(0.8 + th * 0.4, (0.6 + th * 0.8) * (0.85 + Math.random() * 0.3), 0.8 + th * 0.4);
    }
    if (th > 0.05 && Math.random() < th) {
      const foot = m.legL.getWorldPosition(_a); foot.y -= 1.1;
      G.fx.trail(foot, 0x9fe6ff, 0.35 * th, 0.18);
      const foot2 = m.legR.getWorldPosition(_a); foot2.y -= 1.1;
      G.fx.trail(foot2, 0xffd890, 0.3 * th, 0.15);
    }
    if (this.flying) {
      const yaw = p.facing;
      const fwd = p.vel.x * -Math.sin(yaw) + p.vel.z * -Math.cos(yaw);
      m.body.rotation.x = -0.4 * Math.max(-0.5, Math.min(1, fwd / 22));
      m.legL.rotation.x = 0.05; m.legR.rotation.x = -0.05;
      m.armL.rotation.set(-0.25, 0, -0.18);
      m.armR.rotation.set(-0.25, 0, 0.18);
    }
    if (this.shootAnim > 0) {
      const arm = this.palm ? m.armR : m.armL;
      arm.rotation.x = p.aimArm(); arm.rotation.z = 0;
    }
  }

  hud() {
    return [
      { key: 'Shift', name: 'Volo Libero', ratio: 1, state: this.flying ? 'active' : 'ready', text: this.flying ? 'IN VOLO — Spazio ↑  C ↓' : 'Shift o Spazio ×2' },
      { key: 'Click SX', name: 'Raggi Repulsori', ratio: 1 - Math.max(0, this.laserCd) / 0.16, state: 'ready', text: 'Testa = danno extra' },
      { key: 'Click DX / E', name: 'Scarica Posteriore', ratio: 1 - Math.max(0, this.comicCd) / 5, state: this.comicCd > 0 ? 'cool' : 'ready', text: this.comicCd > 0 ? `Ricarica ${this.comicCd.toFixed(1)} s` : 'Pronta (stordisce)' },
    ];
  }

  status() { return this.flying ? `Quota ${Math.round(this.p.pos.y)} m` : 'Propulsori in standby'; }
  crosshair() { return ''; }
}
