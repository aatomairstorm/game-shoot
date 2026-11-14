import * as THREE from 'three';
import { lineOfSight } from './collision.js';
import { createHero, createDragon, createNote, createLance } from './models.js';

const GRAVITY = 30;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _targets = [];

function camForward(G, out) {
  return out.set(-Math.sin(G.cam.yaw), 0, -Math.cos(G.cam.yaw));
}

function swirlTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) {
    const x = (i / 6) * 128;
    const gr = g.createLinearGradient(x, 0, x + 30, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(200,245,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x, 128); g.bezierCurveTo(x + 20, 80, x + 10, 40, x + 40, 0); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function runeTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.strokeStyle = 'rgba(255,220,120,1)'; g.fillStyle = 'rgba(255,230,150,1)';
  g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 96, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke();
  // Star and runes
  g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i * 2 * Math.PI * 2) / 6 / 2 * 2; g.lineTo(Math.cos(a + i * 2.094) * 96, Math.sin(a + i * 2.094) * 96); }
  g.stroke();
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2; g.lineTo(Math.cos(a) * 96, Math.sin(a) * 96); }
    g.stroke();
  }
  g.font = 'bold 16px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗ';
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    g.save(); g.rotate(a); g.fillText(runes[i], 0, -108); g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ===================================================================
// LUCIA — enchanting song + water vortex
// ===================================================================
export class LuciaKit {
  constructor(p) {
    this.p = p;
    this.speed = 9.5; this.canSprint = true;
    this.fireCd = 0; this.vortexCd = 0; this.charges = 2;
    this.vortexT = 0; this.vortexFade = 0; this.glide = false; this.singAnim = 0;
    const tex = swirlTexture();
    this.vortex = new THREE.Group();
    this.vMats = [];
    for (const [r0, r1, h, rep] of [[0.35, 1.6, 3.2, 2], [0.2, 1.1, 2.6, 3]]) {
      const t = tex.clone(); t.repeat.set(rep, 1); t.needsUpdate = true;
      const m = new THREE.MeshBasicMaterial({ map: t, color: 0x6fd8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 24, 1, true), m);
      mesh.position.y = -h / 2;
      this.vortex.add(mesh);
      this.vMats.push(m);
    }
    this.vortex.visible = false;
    p.G.scene.add(this.vortex);
  }

  dispose() { this.p.G.scene.remove(this.vortex); }

  update(dt) {
    const p = this.p, G = p.G, inp = G.input;
    this.fireCd -= dt; this.vortexCd -= dt; this.singAnim -= dt;
    if (p.onGround && this.vortexT <= 0) { this.charges = 2; this.glide = false; }
    if ((inp.pressed('Space') || inp.pressed('Mouse2') || inp.pressed('KeyE'))) this.castVortex();
    if (inp.mouse.left && this.fireCd <= 0) this.sing();
    if (this.vortexT > 0) {
      this.vortexT -= dt;
      p.vel.y = Math.max(p.vel.y, 27);
      p.onGround = false;
      if (Math.random() < 0.8) {
        _a.set(p.pos.x + (Math.random() - 0.5) * 1.5, p.pos.y - Math.random() * 2, p.pos.z + (Math.random() - 0.5) * 1.5);
        G.fx.trail(_a, Math.random() < 0.5 ? 0x8fe6ff : 0xffffff, 0.35, 0.6);
      }
      if (this.vortexT <= 0) this.vortexFade = 0.35;
    }
  }

  afterPhysics() {
    const p = this.p;
    // Slow, controlled descent after a vortex
    if (this.glide && !p.onGround && this.vortexT <= 0 && p.vel.y < -3.2) p.vel.y = -3.2;
  }

  castVortex() {
    const p = this.p, G = p.G;
    if (this.charges <= 0 || this.vortexCd > 0) return;
    this.charges--;
    this.vortexCd = 0.35;
    this.vortexT = 0.42;
    this.glide = true;
    p.vel.y = 30; p.onGround = false;
    G.audio.vortex();
    G.fx.burst(p.pos, 22, { colors: [0x8fe6ff, 0x4fb4ff, 0xffffff], speed: 6, life: 0.6, size: 0.35, size1: 0.05, flat: true, up: 0.4 });
    G.fx.shockwave(p.pos, 3.5, 0x6fd8ff, 0.4);
  }

  sing() {
    const p = this.p, G = p.G;
    const hand = p.handPos(1, new THREE.Vector3());
    hand.y += 0.3;
    const dir = _a.subVectors(G.aim.point, hand).normalize();
    G.projectiles.spawn({
      mesh: createNote(), align: true,
      pos: hand, vel: dir.clone().multiplyScalar(60), gravity: 0, radius: 0.35, life: 1.3,
      onTrail: (pos) => { if (Math.random() < 0.7) G.fx.trail(pos, Math.random() < 0.5 ? 0xff8ad8 : 0x8fe6ff, 0.4, 0.35); },
      onEnemy: (e, part, pos) => {
        G.fx.burst(pos, 14, { colors: [0xff8ad8, 0x8fe6ff, 0xffffff], speed: 4, life: 0.5, size: 0.3, size1: 0.05 });
        if (e.charm) e.charm(); else e.damage(60);
        G.hud.hitmarker(false, false);
      },
      onWorld: (h) => G.fx.burst(h.point, 10, { colors: [0xff8ad8, 0x8fe6ff], speed: 3, life: 0.4, size: 0.25, size1: 0.05 }),
    });
    this.fireCd = 0.42; this.singAnim = 0.35;
    G.audio.sing(); G.hud.recoil(4);
  }

  animate(dt) {
    const p = this.p, m = p.model, G = p.G;
    if (this.singAnim > 0) { m.armR.rotation.set(2.3, 0, 0.35); m.head.rotation.x = -0.2; } else m.head.rotation.x = 0;
    for (const [i, t] of m.tails.entries()) t.rotation.z = (i ? -1 : 1) * (0.1 + Math.min(0.6, Math.hypot(p.vel.x, p.vel.z) * 0.03)) + Math.sin(G.time * 5 + i) * 0.06;
    for (const t of m.tails) t.rotation.x = Math.min(0.9, Math.max(-0.4, p.vel.y * 0.04)) + 0.15;
    m.aura.material.opacity = 0.06 + Math.sin(G.time * 3) * 0.03 + (this.singAnim > 0 ? 0.08 : 0);
    m.pendant.scale.setScalar(1 + Math.sin(G.time * 6) * 0.15);
    if (this.glide && !p.onGround) { m.armL.rotation.set(0, 0, -1.2); if (this.singAnim <= 0) m.armR.rotation.set(0, 0, 1.2); }
    // Vortex column under the feet
    const vis = this.vortexT > 0 || this.vortexFade > 0;
    this.vortex.visible = vis;
    if (vis) {
      if (this.vortexT <= 0) this.vortexFade -= dt;
      const k = this.vortexT > 0 ? 1 : Math.max(0, this.vortexFade / 0.35);
      this.vortex.position.set(p.pos.x, p.pos.y + 0.2, p.pos.z);
      this.vortex.rotation.y += dt * 9;
      this.vortex.scale.set(1, 0.6 + k * 0.6, 1);
      for (const mt of this.vMats) { mt.opacity = 0.8 * k; mt.map.offset.y -= dt * 2.5; }
    }
  }

  hud() {
    return [
      { key: 'Click SX', name: 'Canto Incantatore', ratio: 1 - Math.max(0, this.fireCd) / 0.42, state: 'ready', text: 'Incanta e fa esplodere la testa' },
      { key: 'Spazio / Click DX', name: 'Vortice d’Onda', ratio: this.charges / 2, state: this.vortexT > 0 ? 'active' : this.charges > 0 ? 'ready' : 'cool', text: this.charges > 0 ? `${this.charges} slanci disponibili` : 'Atterra per ricaricare' },
    ];
  }

  status() { return this.glide && !this.p.onGround ? 'Discesa controllata' : 'Canto pronto'; }
  crosshair() { return ''; }
}

// ===================================================================
// BEN 10 — Omnitrix with three alien forms
// ===================================================================
const FORMS = ['ben', 'cannonbolt', 'xlr8', 'feedback'];
export const FORM_NAMES = { ben: 'Ben', cannonbolt: 'Palla Rotante', xlr8: 'XLR8', feedback: 'Feedback' };

export class BenKit {
  constructor(p) {
    this.p = p;
    this.form = 'ben';
    this.models = { ben: p.model };
    this.transformCd = 0;
    this.applyForm();
    this.fireCd = 0; this.punchAnim = 0; this.punchSide = 1;
    // Cannonbolt
    this.rolling = false; this.jumps = 0; this.hitCd = new Map();
    // XLR8
    this.dashT = 0; this.dashCd = 0; this.dashDir = new THREE.Vector3(); this.trail = []; this.trailHit = new Map();
    this.chain = null; this.finalCd = 0; this.wallRun = false;
    // Feedback
    this.energy = 40; this.comboCd = 0; this.comboIdx = 0; this.charging = false; this.chargeT = 0; this.lastSpace = -9; this.superUsed = false;
  }

  dispose() { this.p.G.audio.setThrust(0); this.p.invuln = false; }
  onDeath() { this.p.G.audio.setThrust(0); this.chain = null; }

  applyForm() {
    const f = this.form;
    this.speed = { ben: 9, cannonbolt: 8, xlr8: 17, feedback: 9.5 }[f];
    this.canSprint = f === 'ben' || f === 'feedback';
    this.damageScale = { ben: 1, cannonbolt: 0.65, xlr8: 1, feedback: 0.85 }[f];
  }

  transform(f) {
    const p = this.p, G = p.G;
    if (f === this.form || this.transformCd > 0 || this.chain) return;
    this.endRoll();
    this.dashT = 0; p.invuln = false; this.charging = false;
    this.form = f;
    if (!this.models[f]) this.models[f] = createHero(f);
    p.setModel(this.models[f]);
    this.applyForm();
    this.transformCd = 0.5;
    const c = p.chestPos(_a);
    G.fx.blast(c, 2.6, 0x66ff66, 0.45);
    G.fx.explosion(c, 1, 'green');
    G.fx.shockwave(p.pos, 4, 0x66ff66, 0.45);
    G.audio.omnitrix();
    G.hud.toast(`Omnitrix: ${FORM_NAMES[f]}!`, 'good', 1400);
  }

  update(dt, wish) {
    const p = this.p, G = p.G, inp = G.input;
    this.transformCd -= dt; this.fireCd -= dt; this.punchAnim -= dt; this.finalCd -= dt; this.dashCd -= dt; this.comboCd -= dt;
    if (inp.pressed('Digit1')) this.transform('cannonbolt');
    else if (inp.pressed('Digit2')) this.transform('xlr8');
    else if (inp.pressed('Digit3')) this.transform('feedback');
    else if (inp.pressed('KeyQ')) {
      const i = FORMS.indexOf(this.form);
      this.transform(FORMS[i === 0 ? 1 : (i % 3) + 1]);
    }
    this.updateTrail();
    if (this.form === 'ben') this.updateBen(dt);
    else if (this.form === 'cannonbolt') this.updateCannonbolt(dt, wish);
    else if (this.form === 'xlr8') this.updateXlr8(dt, wish);
    else this.updateFeedback(dt);
  }

  jump(v = 11.5) {
    const p = this.p;
    if (!p.onGround) return false;
    p.vel.y = v; p.onGround = false; p.G.audio.jump();
    return true;
  }

  // Short-range hit on everything in front of the player.
  meleeTargets(range, cosMin, cb) {
    const p = this.p, G = p.G;
    const fwd = camForward(G, _d);
    let n = 0;
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, dy = e.pos.y - p.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > range + (e.half || 0.4) || dy < -2.5 || dy > 2.5) continue;
      if (d > 0.5 && (dx * fwd.x + dz * fwd.z) / d < cosMin) continue;
      cb(e, d, fwd); n++;
    }
    return n;
  }

  // ---- Ben (human) ----
  updateBen() {
    const p = this.p, G = p.G, inp = G.input;
    if (inp.pressed('Space')) this.jump();
    if (inp.mouse.left && this.fireCd <= 0) {
      this.fireCd = 0.45; this.punchAnim = 0.2; this.punchSide *= -1;
      const n = this.meleeTargets(2.6, 0.4, (e, d, f) => e.damage(15, { knock: _b.copy(f).multiplyScalar(5).setY(2) }));
      if (n) G.audio.hammerCatch(); else G.audio.jump();
    }
    if (inp.pressed('Mouse2') || inp.pressed('KeyE')) G.hud.toast('Premi 1, 2, 3 o Q per trasformarti!', '', 1200);
  }

  // ---- Cannonbolt ----
  endRoll() {
    if (!this.rolling) return;
    this.rolling = false;
    const m = this.models.cannonbolt;
    if (m) { m.ball.visible = false; m.body.visible = true; }
    this.p.G.audio.setThrust(0);
  }

  updateCannonbolt(dt, wish) {
    const p = this.p, G = p.G, inp = G.input;
    const m = p.model;
    if (p.onGround && p.vel.y <= 0) this.jumps = 0;
    if (inp.pressed('Space') && this.jumps < 3) {
      p.vel.y = this.jumps === 0 ? 12 : 11; p.onGround = false; this.jumps++;
      if (this.jumps > 1) { G.audio.doubleJump(); G.fx.burst(p.pos, 10, { color: 0xffe080, speed: 3, life: 0.4, size: 0.3, size1: 0.05 }); } else G.audio.jump();
    }
    const want = inp.mouse.left;
    if (want && !this.rolling) {
      this.rolling = true; m.ball.visible = true; m.body.visible = false;
      G.audio.rollStart();
      G.fx.dust(p.pos, 10, 1);
    } else if (!want && this.rolling) this.endRoll();
    if (!this.rolling) return;

    p.mode = 'custom';
    const fwd = camForward(G, _a);
    const dir = wish.lengthSq() > 0 ? _b.copy(wish) : _b.copy(fwd);
    const k = Math.min(1, (p.onGround ? 3 : 1.2) * dt);
    p.vel.x += (dir.x * 30 - p.vel.x) * k;
    p.vel.z += (dir.z * 30 - p.vel.z) * k;
    p.vel.y -= GRAVITY * dt;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    G.audio.setThrust(Math.min(0.7, hs / 40));
    m.ball.rotation.x -= (hs * dt) / 1.0;
    if (p.onGround && hs > 10 && Math.random() < 0.4) G.fx.dust(p.pos, 1, 0.6);
    // Smash everything in the path
    if (hs < 7) return;
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, dy = e.pos.y - p.pos.y;
      if (dy < -1.8 || dy > 2.2 || Math.hypot(dx, dz) > 1.4 + (e.half || 0.4)) continue;
      if ((this.hitCd.get(e) || 0) > G.time) continue;
      this.hitCd.set(e, G.time + 0.7);
      const kn = new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize().multiplyScalar(18);
      kn.x += dx * 2; kn.z += dz * 2; kn.y = 9;
      e.damage(45 + hs * 1.6, { knock: kn, stun: 1.5 });
      _c.set(e.pos.x, e.pos.y + 1, e.pos.z);
      G.fx.sparks(_c, 0xffe080, 16, 9);
      G.fx.dust(e.pos, 8, 1);
      G.audio.hammerImpact(e.pos);
      G.fx.addShake(0.25);
    }
  }

  // ---- XLR8 ----
  updateXlr8(dt, wish) {
    const p = this.p, G = p.G, inp = G.input;
    if (this.chain) { this.updateChain(dt); return; }
    if (inp.pressed('Space')) this.jump(12);
    if (inp.pressed('Mouse0') && this.dashCd <= 0 && this.dashT <= 0) {
      const f = wish.lengthSq() > 0 ? wish : camForward(G, _a);
      this.dashDir.copy(f).normalize();
      this.dashT = 0.2; this.dashCd = 0.55;
      this.dashFrom = p.chestPos(new THREE.Vector3());
      p.invuln = true;
      G.audio.dash();
    }
    if (this.dashT > 0) {
      this.dashT -= dt;
      p.mode = 'custom';
      p.vel.set(this.dashDir.x * 62, 0, this.dashDir.z * 62);
      const c = p.chestPos(_a);
      this.trail.push({ x: c.x, y: p.pos.y, z: c.z, t: G.time + 1.6 });
      G.fx.trail(c, 0x3a8aff, 0.9, 1.4);
      G.fx.trail(_b.copy(c).setY(c.y - 0.6), 0x9fd8ff, 0.5, 1.2);
      if (this.dashT <= 0) {
        p.vel.multiplyScalar(0.3);
        p.invuln = false;
        G.fx.beam(this.dashFrom, p.chestPos(_b), 0x5aa8ff, 0.35, 0.5);
      }
      return;
    }
    if (inp.pressed('Mouse2') || inp.pressed('KeyE')) this.startFinal();
    // Passive wall-run: pushing into a wall climbs it
    this.wallRun = false;
    const w = p.lastWall;
    if (w && wish.lengthSq() > 0 && -(wish.x * w.x + wish.z * w.z) > 0.4) {
      this.wallRun = true;
      p.vel.y = Math.max(p.vel.y, 14);
      p.vel.x -= w.x * 3; p.vel.z -= w.z * 3;
      p.onGround = false;
      if (Math.random() < 0.6) G.fx.trail(_a.set(p.pos.x, p.pos.y + 0.2, p.pos.z), 0x3a8aff, 0.5, 0.5);
    }
  }

  updateTrail() {
    const G = this.p.G;
    if (!this.trail.length) return;
    while (this.trail.length && this.trail[0].t < G.time) this.trail.shift();
    for (const e of G.enemies.list) {
      if (!e.alive) continue;
      if ((this.trailHit.get(e) || 0) > G.time) continue;
      for (let i = 0; i < this.trail.length; i += 2) {
        const t = this.trail[i];
        if (Math.abs(e.pos.x - t.x) < 1.5 && Math.abs(e.pos.z - t.z) < 1.5 && Math.abs(e.pos.y - t.y) < 2.2) {
          this.trailHit.set(e, G.time + 1.2);
          e.damage(28, { stun: 1.6 });
          G.fx.lightning(_a.set(t.x, t.y + 1, t.z), _b.set(e.pos.x, e.pos.y + 1.2, e.pos.z), 0x5aa8ff, 0.2, 0.6);
          G.audio.zap(e.pos);
          break;
        }
      }
    }
  }

  startFinal() {
    const p = this.p, G = p.G;
    if (this.finalCd > 0) { G.hud.toast(`Mossa finale in ricarica (${this.finalCd.toFixed(1)} s)`, 'bad', 900); return; }
    const chest = p.chestPos(new THREE.Vector3());
    const list = G.enemies.targets(_targets).filter((e) => e.pos.distanceTo(p.pos) < 38 && lineOfSight(chest, _a.set(e.pos.x, e.pos.y + 1, e.pos.z)));
    if (!list.length) { G.hud.toast('Nessun nemico nell’area', 'bad', 900); return; }
    list.sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
    this.chain = { list: list.slice(0, 8), i: 0, t: 0, start: p.pos.clone() };
    this.finalCd = 9;
    p.invuln = true;
    G.audio.dash();
    G.hud.toast('MOSSA FINALE RAPIDA!', 'good', 1200);
  }

  updateChain(dt) {
    const p = this.p, G = p.G, C = this.chain;
    p.mode = 'custom';
    p.vel.set(0, 0, 0);
    C.t -= dt;
    if (C.t > 0) return;
    if (C.i >= C.list.length) {
      this.chain = null; p.invuln = false; p.vel.y = 4;
      return;
    }
    const e = C.list[C.i++];
    C.t = 0.1;
    if (!e.alive) return;
    const from = p.chestPos(new THREE.Vector3());
    const off = _a.set(p.pos.x - e.pos.x, 0, p.pos.z - e.pos.z);
    if (off.lengthSq() < 1e-4) off.set(1, 0, 0);
    off.normalize().multiplyScalar((e.half || 0.4) + 1.0);
    p.pos.set(e.pos.x + off.x, e.pos.y, e.pos.z + off.z);
    G.cam.yaw = Math.atan2(-(e.pos.x - p.pos.x), -(e.pos.z - p.pos.z));
    const to = p.chestPos(_b);
    G.fx.beam(from, to, 0x5aa8ff, 0.3, 0.45);
    G.fx.lightning(from, to, 0xbfe4ff, 0.25, 0.8);
    _c.set(e.pos.x, e.pos.y + 1.1, e.pos.z);
    G.fx.sparks(_c, 0x8fd0ff, 16, 9);
    const kn = off.clone().multiplyScalar(-6); kn.y = 5;
    e.damage(85, { knock: kn, stun: 1.3 });
    G.audio.zap(e.pos);
    G.fx.addShake(0.15);
  }

  // ---- Feedback ----
  onDamaged(amount) {
    if (this.form === 'feedback') this.energy = Math.min(100, this.energy + amount * 2.5);
  }

  updateFeedback(dt) {
    const p = this.p, G = p.G, inp = G.input;
    this.energy = Math.min(100, this.energy + 3 * dt);
    if (p.onGround && p.vel.y <= 0) this.superUsed = false;
    // Charged super jump: hold Space, or double tap
    if (inp.pressed('Space')) {
      if (G.time - this.lastSpace < 0.3 && !this.superUsed && !this.charging) this.superJump(1);
      else if (p.onGround) { this.charging = true; this.chargeT = 0; }
      this.lastSpace = G.time;
    }
    if (this.charging) {
      this.chargeT += dt;
      if (Math.random() < 0.5) {
        const sp = p.model.spikes[(Math.random() * p.model.spikes.length) | 0].getWorldPosition(_a);
        G.fx.burst(sp, 1, { color: 0x7dff6a, speed: 2, life: 0.2, size: 0.15, size1: 0.02 });
      }
      if (!inp.isDown('Space') || this.chargeT > 1.2) {
        const k = Math.min(1, this.chargeT / 0.9);
        this.charging = false;
        if (k < 0.18) this.jump(11.5); else this.superJump(k);
      }
    }
    if (inp.mouse.left && this.comboCd <= 0) this.combo();
    if (inp.pressed('Mouse2') || inp.pressed('KeyE')) this.release();
  }

  superJump(k) {
    const p = this.p, G = p.G;
    this.superUsed = true;
    p.vel.y = 15 + 27 * k; p.onGround = false;
    p.vel.x += p.wish.x * 5; p.vel.z += p.wish.z * 5;
    G.fx.shockwave(p.pos, 3 + 3 * k, 0x66ff66, 0.4);
    G.fx.burst(p.pos, 24, { colors: [0x7dff6a, 0xd8ffd0], speed: 8, life: 0.4, size: 0.2, size1: 0.02, flat: true, up: 0.3 });
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      G.fx.lightning(_a.copy(p.pos).setY(p.pos.y + 0.3), _b.set(p.pos.x + Math.cos(a) * 3, p.pos.y, p.pos.z + Math.sin(a) * 3), 0x7dff6a, 0.2, 0.7);
    }
    G.audio.superJump(); G.audio.zap(null);
  }

  combo() {
    const p = this.p, G = p.G;
    this.comboIdx = (this.comboIdx + 1) % 3;
    const fin = this.comboIdx === 2;
    this.comboCd = fin ? 0.5 : 0.28;
    this.punchAnim = 0.2; this.punchSide = this.comboIdx === 1 ? -1 : 1;
    const hand = p.handPos(this.punchSide, new THREE.Vector3());
    const n = this.meleeTargets(fin ? 5.5 : 4.5, 0.35, (e, d, f) => {
      const kn = _b.copy(f).multiplyScalar(fin ? 16 : 6); kn.y = fin ? 8 : 3;
      e.damage(fin ? 42 : 22, { knock: kn.clone(), stun: 1.4 });
      G.fx.lightning(hand, _c.set(e.pos.x, e.pos.y + 1.1, e.pos.z), 0x7dff6a, 0.2, 0.7);
      G.fx.sparks(_c, 0x9dff8a, 10, 7);
      this.energy = Math.min(100, this.energy + 6);
    });
    if (!n) {
      const f = camForward(G, _a);
      G.fx.lightning(hand, _c.copy(hand).addScaledVector(f, 3).add(_b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)), 0x7dff6a, 0.15, 0.7);
    }
    G.audio.zap(null);
  }

  release() {
    const p = this.p, G = p.G;
    if (this.energy < 25) { G.hud.toast('Energia insufficiente (min 25%)', 'bad', 900); return; }
    const e0 = this.energy;
    const R = 6 + e0 * 0.14, dmg = 35 + e0 * 1.3;
    const c = p.chestPos(new THREE.Vector3());
    G.fx.blast(c, R, 0x55ff77, 0.75);
    G.fx.blast(c, R * 0.6, 0xd8ffd0, 0.5);
    G.fx.shockwave(p.pos, R, 0x66ff66, 0.6);
    G.fx.explosion(c, 1.6, 'green');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      G.fx.lightning(c, _a.set(c.x + Math.cos(a) * R * 0.8, c.y + (Math.random() - 0.3) * 3, c.z + Math.sin(a) * R * 0.8), 0x9dff8a, 0.35, 1.2);
    }
    G.enemies.inRadius(c, R, (e, d) => {
      const k = 1 - d / R;
      const kn = new THREE.Vector3(e.pos.x - c.x, 0, e.pos.z - c.z);
      if (kn.lengthSq() < 1e-4) kn.set(1, 0, 0);
      kn.normalize().multiplyScalar(8 + 12 * k); kn.y = 6 + 4 * k;
      e.damage(dmg * (0.5 + 0.5 * k), { knock: kn, stun: 2 });
    });
    this.energy = 0;
    G.audio.bigZap();
    G.fx.addShake(0.7);
  }

  animate(dt) {
    const p = this.p, m = p.model, G = p.G;
    if (this.punchAnim > 0) {
      const arm = this.punchSide < 0 ? m.armL : m.armR;
      arm.rotation.set(p.aimArm(), 0, 0);
    }
    if (this.form === 'xlr8') {
      if (this.dashT > 0 || this.chain) m.body.rotation.x = -0.5;
      else if (this.wallRun) m.body.rotation.x = 0.35;
      m.tail.rotation.x = -1.2 + Math.sin(G.time * 8) * 0.1;
      m.root.visible = !(this.chain && this.chain.t > 0.05);
    } else if (this.form === 'feedback') {
      const glowK = 0.8 + (this.energy / 100) * 2.5 + (this.charging ? 2 : 0) + Math.sin(G.time * 12) * 0.3;
      m.spikes[0].material.emissiveIntensity = glowK;
      if (this.charging) { const k = Math.min(1, this.chargeT / 0.9); m.body.position.y = -0.25 * k; m.legL.rotation.x = 0.5 * k; m.legR.rotation.x = 0.5 * k; }
    } else if (this.form === 'cannonbolt' && this.rolling) {
      m.ball.rotation.y = 0;
    }
  }

  hud() {
    const omni = { key: '1 · 2 · 3 / Q', name: 'Omnitrix', ratio: this.transformCd > 0 ? 1 - this.transformCd / 0.5 : 1, state: 'ready', text: `Forma: ${FORM_NAMES[this.form]}` };
    const p = this.p;
    if (this.form === 'ben') return [omni, { key: 'Click SX', name: 'Pugno', ratio: 1 - Math.max(0, this.fireCd) / 0.45, state: 'ready', text: 'Trasformati per i poteri!' }];
    if (this.form === 'cannonbolt') {
      const hs = Math.hypot(p.vel.x, p.vel.z);
      return [omni,
        { key: 'Click SX (tieni)', name: 'Palla Rotante', ratio: Math.min(1, hs / 30), state: this.rolling ? 'active' : 'ready', text: this.rolling ? `${Math.round(hs * 3.6)} km/h` : 'Travolge i nemici' },
        { key: 'Spazio ×3', name: 'Triplo Salto', ratio: (3 - this.jumps) / 3, state: this.jumps < 3 ? 'ready' : 'cool', text: `${3 - this.jumps} salti rimasti` }];
    }
    if (this.form === 'xlr8') return [omni,
      { key: 'Click SX', name: 'Scatto Fulmineo', ratio: 1 - Math.max(0, this.dashCd) / 0.55, state: this.dashT > 0 ? 'active' : this.dashCd > 0 ? 'cool' : 'ready', text: 'Invulnerabile + scia di plasma' },
      { key: 'Click DX / E', name: 'Mossa Finale Rapida', ratio: 1 - Math.max(0, this.finalCd) / 9, state: this.chain ? 'active' : this.finalCd > 0 ? 'cool' : 'ready', text: this.finalCd > 0 ? `Ricarica ${this.finalCd.toFixed(1)} s` : 'Colpisce tutti nell’area' }];
    return [omni,
      { key: 'Click SX', name: 'Combo Elettrica', ratio: 1 - Math.max(0, this.comboCd) / 0.5, state: 'ready', text: `Colpo ${this.comboIdx + 1}/3` },
      { key: 'Click DX / E', name: 'Esplosione Elettrica', ratio: this.energy / 100, state: this.energy >= 25 ? 'ready' : 'cool', text: `Energia ${Math.round(this.energy)}%` },
      { key: 'Spazio (tieni)', name: 'Supersalto Caricato', ratio: this.charging ? Math.min(1, this.chargeT / 0.9) : 1, state: this.charging ? 'active' : 'ready', text: 'Tieni o doppio tap' }];
  }

  status() {
    if (this.form === 'xlr8') return this.wallRun ? 'Corsa sulle pareti!' : 'Passiva: corri contro un muro per scalarlo';
    if (this.form === 'feedback') return `Energia assorbita: ${Math.round(this.energy)}%`;
    if (this.form === 'cannonbolt') return 'Corazza: danni ridotti';
    return 'Omnitrix pronto: 1, 2, 3 o Q';
  }
  crosshair() { return ''; }
}

// ===================================================================
// FIA ROOD — holy lances, divine heal, dragon summon
// ===================================================================
export class FiaKit {
  constructor(p) {
    this.p = p;
    this.speed = 9.5; this.canSprint = true;
    this.fireCd = 0; this.side = 1; this.castAnim = 0;
    this.healCd = 0; this.circleT = 0;
    this.dragonCd = 0; this.dragonT = -1; this.dissolveT = 0; this.lastSpace = -9;
    const circle = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: runeTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI / 2;
    this.circle = new THREE.Group(); this.circle.add(circle); this.circle.visible = false;
    this.circleMat = circle.material;
    p.G.scene.add(this.circle);
    this.dragon = createDragon(); this.dragon.visible = false;
    p.G.scene.add(this.dragon);
  }

  dispose() { this.p.G.scene.remove(this.circle); this.p.G.scene.remove(this.dragon); }

  // Target closest to the crosshair inside a cone, with line of sight.
  pickTarget() {
    const p = this.p, G = p.G;
    if (G.aim.enemy && G.aim.enemy.kind !== 'barrel') return G.aim.enemy;
    const cam = G.camera.position, chest = p.chestPos(_c);
    let best = null, bestScore = Infinity;
    for (const e of G.enemies.targets(_targets)) {
      _a.set(e.pos.x, e.pos.y + 1.1, e.pos.z);
      const d = _a.distanceTo(cam);
      if (d > 75) continue;
      const cos = _b.subVectors(_a, cam).divideScalar(d).dot(G.aim.dir);
      if (cos < 0.9) continue;
      const score = (1 - cos) * 40 + d * 0.01;
      if (score < bestScore && lineOfSight(chest, _a)) { bestScore = score; best = e; }
    }
    return best;
  }

  update(dt, wish) {
    const p = this.p, G = p.G, inp = G.input;
    this.fireCd -= dt; this.healCd -= dt; this.dragonCd -= dt; this.castAnim -= dt;
    if (inp.pressed('Space')) {
      const dbl = G.time - this.lastSpace < 0.35;
      if (p.onGround && !dbl) { p.vel.y = 11.5; p.onGround = false; G.audio.jump(); }
      else this.summonDragon();
      this.lastSpace = G.time;
    }
    if (inp.mouse.left && this.fireCd <= 0) this.lance();
    if (inp.pressed('Mouse2') || inp.pressed('KeyE')) this.heal();
    if (this.dragonT >= 0) this.updateDragon(dt, wish);
    this.updateCircle(dt);
  }

  lance() {
    const p = this.p, G = p.G;
    this.side *= -1;
    const fwd = camForward(G, _a);
    const right = _b.set(-fwd.z, 0, fwd.x);
    const origin = new THREE.Vector3(p.pos.x, p.pos.y + 2.2, p.pos.z).addScaledVector(right, this.side * 0.8).addScaledVector(fwd, -0.2);
    const target = this.pickTarget();
    const aimAt = target ? _c.set(target.pos.x, target.pos.y + 1.1, target.pos.z) : G.aim.point;
    const vel = new THREE.Vector3().subVectors(aimAt, origin).normalize().multiplyScalar(52);
    G.fx.burst(origin, 8, { colors: [0xfff3b0, 0xffd34a], speed: 2, life: 0.4, size: 0.3, size1: 0.05 });
    const splash = (pos, direct) => {
      G.fx.explosion(pos, 0.8, 'gold');
      G.fx.shockwave(pos, 3, 0xffd860, 0.35);
      G.enemies.inRadius(pos, 3.2, (e) => { if (e !== direct) e.damage(12, { quiet: true, stun: 0.3 }); });
      G.audio.holyHit(pos);
    };
    G.projectiles.spawn({
      mesh: createLance(), align: true, pos: origin, vel, gravity: 0, radius: 0.3, life: 2.4,
      homing: target ? 10 : 0, target,
      onTrail: (pos) => G.fx.trail(pos, Math.random() < 0.5 ? 0xffe27a : 0xffffff, 0.35, 0.3),
      onEnemy: (e, part, pos) => {
        const head = part === 'head';
        e.damage(head ? 46 : 32, { headshot: head, stun: 0.4 });
        splash(pos, e);
      },
      onWorld: (h) => splash(h.point, null),
    });
    this.fireCd = 0.3; this.castAnim = 0.25;
    G.audio.holyShot(); G.hud.recoil(4);
  }

  heal() {
    const p = this.p, G = p.G;
    if (this.healCd > 0) { G.hud.toast(`Cura divina in ricarica (${this.healCd.toFixed(1)} s)`, 'bad', 900); return; }
    this.healCd = 10;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + 75);
    this.circleT = 1.8;
    this.circle.visible = true;
    G.fx.burst(p.chestPos(_a), 30, { colors: [0xffe27a, 0xfff3b0, 0x9dff9a], speed: 3, up: 1, life: 1.4, size: 0.25, size1: 0.03, gravity: -4, drag: 1, radius: 3 });
    G.fx.shockwave(p.pos, 4, 0xffd860, 0.6);
    G.audio.heal();
    G.hud.toast(`Cura Divina +${Math.round(p.hp - before)} HP`, 'good', 1400);
    for (const h of G.hostages || []) {
      if (h.freed || h.pos.distanceTo(p.pos) > 20) continue;
      _b.copy(h.pos); _b.y += 1.2;
      G.fx.burst(_b, 26, { colors: [0xffe27a, 0x9dff9a, 0xffffff], speed: 2.5, up: 1, life: 1.4, size: 0.25, size1: 0.03, gravity: -3, radius: 1.5 });
      G.fx.shockwave(h.pos, 2.5, 0xffd860, 0.6);
      G.hud.toast(`Ostaggio ${h.zone} rigenerato`, 'good', 1400);
    }
  }

  updateCircle(dt) {
    if (this.circleT <= 0) { this.circle.visible = false; return; }
    const p = this.p, G = p.G;
    this.circleT -= dt;
    const k = Math.max(0, this.circleT / 1.8);
    this.circle.position.set(p.pos.x, p.pos.y + 0.06, p.pos.z);
    this.circle.rotation.y += dt * 1.5;
    this.circle.scale.setScalar(0.6 + (1 - k) * 0.5 + Math.sin(G.time * 8) * 0.02);
    this.circleMat.opacity = Math.min(1, k * 2.5);
    if (Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
      G.fx.burst(_a.set(p.pos.x + Math.cos(a) * r, p.pos.y + 0.1, p.pos.z + Math.sin(a) * r), 1, { color: 0xffe27a, speed: 2.5, up: 1, life: 1, size: 0.18, size1: 0.02, gravity: -3, drag: 0.5 });
    }
  }

  summonDragon() {
    const p = this.p, G = p.G;
    if (this.dragonT >= 0) return;
    if (this.dragonCd > 0) { G.hud.toast(`Drago in ricarica (${this.dragonCd.toFixed(1)} s)`, 'bad', 900); return; }
    this.dragonT = 0;
    this.dissolveT = 0;
    this.dragon.visible = true;
    this.dragon.scale.setScalar(0.2);
    p.vel.y = Math.max(p.vel.y, 8); p.onGround = false;
    G.fx.explosion(_a.copy(p.pos).setY(p.pos.y - 0.5), 1.2, 'gold');
    G.audio.dragon();
  }

  updateDragon(dt, wish) {
    const p = this.p, G = p.G, inp = G.input;
    this.dragonT += dt;
    const lifting = this.dissolveT === 0 && (this.dragonT < 0.6 || (inp.isDown('Space') && this.dragonT < 2.0));
    const d = this.dragon;
    if (lifting) {
      p.mode = 'custom';
      p.vel.y += (19 - p.vel.y) * Math.min(1, 5 * dt);
      p.vel.x += (wish.x * 13 - p.vel.x) * Math.min(1, 3 * dt);
      p.vel.z += (wish.z * 13 - p.vel.z) * Math.min(1, 3 * dt);
      d.scale.setScalar(Math.min(1, d.scale.x + dt * 4));
    } else {
      if (this.dissolveT === 0) {
        this.dissolveT = 0.001;
        p.vel.y = Math.max(p.vel.y * 0.5, 5);
        G.fx.burst(d.position, 50, { colors: [0xffe27a, 0xfff3b0, 0xffc040], speed: 6, life: 1.1, size: 0.3, size1: 0.03, gravity: -2, drag: 1.2, radius: 4 });
      }
      this.dissolveT += dt;
      d.scale.setScalar(Math.max(0.01, 1 - this.dissolveT * 2.2));
      if (this.dissolveT > 0.45) { d.visible = false; this.dragonT = -1; this.dragonCd = 2.5; return; }
    }
    d.position.set(p.pos.x, p.pos.y - 0.7, p.pos.z);
    d.rotation.y = p.facing;
    d.rotation.x = lifting ? -0.25 : 0;
    const flap = Math.sin(this.dragonT * 13);
    d.wings[0].rotation.z = flap * 0.7; d.wings[1].rotation.z = -flap * 0.7;
    if (Math.random() < 0.6) G.fx.trail(_a.set(p.pos.x + (Math.random() - 0.5) * 3, p.pos.y - 0.7, p.pos.z + (Math.random() - 0.5) * 3), 0xffd34a, 0.3, 0.6);
  }

  animate(dt) {
    const p = this.p, m = p.model, G = p.G;
    if (this.castAnim > 0) { m.armR.rotation.set(p.aimArm() + 0.3, 0, 0); m.armL.rotation.set(p.aimArm() + 0.3, 0, 0); }
    if (this.circleT > 0) { m.armL.rotation.set(-2.6, 0, 0.3); m.armR.rotation.set(-2.6, 0, -0.3); }
    if (this.dragonT >= 0 && this.dissolveT === 0) { m.legL.rotation.x = 1.2; m.legR.rotation.x = 1.2; m.legL.rotation.z = -0.5; m.legR.rotation.z = 0.5; }
    else { m.legL.rotation.z = 0; m.legR.rotation.z = 0; }
    const hs = Math.hypot(p.vel.x, p.vel.z);
    m.cape.rotation.x = -(0.08 + Math.min(0.9, hs * 0.06 + Math.abs(p.vel.y) * 0.02)) + Math.sin(G.time * 6) * 0.04;
    m.halo.rotation.z += dt * 1.5;
    m.aura.material.opacity = 0.05 + Math.sin(G.time * 2.5) * 0.025 + (this.castAnim > 0 ? 0.05 : 0);
  }

  hud() {
    return [
      { key: 'Click SX', name: 'Lance di Luce Divina', ratio: 1 - Math.max(0, this.fireCd) / 0.3, state: 'ready', text: 'A ricerca automatica' },
      { key: 'Click DX / E', name: 'Cura Divina', ratio: 1 - Math.max(0, this.healCd) / 10, state: this.circleT > 0 ? 'active' : this.healCd > 0 ? 'cool' : 'ready', text: this.healCd > 0 ? `Ricarica ${this.healCd.toFixed(1)} s` : '+75 HP, rigenera ostaggi' },
      { key: 'Spazio ×2', name: 'Evocazione Drago', ratio: this.dragonT >= 0 ? 1 : 1 - Math.max(0, this.dragonCd) / 2.5, state: this.dragonT >= 0 ? 'active' : this.dragonCd > 0 ? 'cool' : 'ready', text: this.dragonT >= 0 ? 'Tieni Spazio per salire' : 'Il drago ti solleva sui tetti' },
    ];
  }

  status() { return this.dragonT >= 0 ? 'In volo sul drago' : 'Aura sacra attiva'; }
  crosshair() { return this.pickTarget() ? 'enemy' : ''; }
}
