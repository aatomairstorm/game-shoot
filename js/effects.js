import * as THREE from 'three';

const VERT = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
uniform float uScale;
varying float vA; varying vec3 vC;
void main(){
  vA = alpha; vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vA; varying vec3 vC;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5 || vA <= 0.0) discard;
  float a = smoothstep(0.5, 0.05, d) * vA;
  gl_FragColor = vec4(vC, a);
}`;

class Particles {
  constructor(scene, max, blending) {
    this.max = max;
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.fadeIn = new Uint8Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.active = 0;
  }

  emit(x, y, z, vx, vy, vz, o) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    const c = o.color;
    this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
    this.life[i] = this.maxLife[i] = o.life;
    this.s0[i] = o.size; this.s1[i] = o.size1 ?? o.size;
    this.a0[i] = o.alpha ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.fadeIn[i] = o.fadeIn ? 1 : 0;
    this.size[i] = o.size; this.alpha[i] = o.fadeIn ? 0 : this.a0[i];
    this.active = this.max;
  }

  update(dt) {
    if (!this.active) return;
    let any = 0;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      any++;
      const l = (this.life[i] -= dt);
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.grav[i] * dt; V[i3 + 2] *= dr;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      const k = 1 - Math.max(0, l) / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      let a = this.a0[i] * (1 - k);
      if (this.fadeIn[i]) a *= Math.min(1, k * 6);
      this.alpha[i] = l > 0 ? a : 0;
    }
    const at = this.geo.attributes;
    at.position.needsUpdate = at.pcolor.needsUpdate = at.size.needsUpdate = at.alpha.needsUpdate = true;
    if (!any) this.active = 0;
  }

  clear() { this.life.fill(0); this.alpha.fill(0); this.size.fill(0); this.active = 1; }
}

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).rotateX(Math.PI / 2);

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.add = new Particles(scene, 3500, THREE.AdditiveBlending);
    this.smoke = new Particles(scene, 1800, THREE.NormalBlending);
    this.shake = 0;

    this.beams = [];
    for (let i = 0; i < 20; i++) {
      const outer = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const inner = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      outer.add(inner); inner.scale.set(0.35, 0.35, 1);
      outer.visible = false; outer.frustumCulled = false;
      scene.add(outer);
      this.beams.push({ mesh: outer, inner, t: 0, life: 1, w: 0.05 });
    }

    this.bolts = [];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x9fe4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      line.visible = false; line.frustumCulled = false;
      scene.add(line);
      this.bolts.push({ line, t: 0, life: 0.2, a: new THREE.Vector3(), b: new THREE.Vector3(), jitter: 0.5 });
    }

    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.85, 1, 64).rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x9fe4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m);
      this.rings.push({ mesh: m, t: 0, life: 0.6, r: 8 });
    }

    // Fixed light pool: adding/removing lights at runtime would force shader recompiles.
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 22, 2);
      scene.add(l);
      this.lights.push({ light: l, t: 0, life: 0.2, peak: 0 });
    }
    this.lightCursor = 0;
  }

  setViewport(height, fov) {
    const s = height / (2 * Math.tan((fov * Math.PI) / 360));
    this.add.mat.uniforms.uScale.value = s;
    this.smoke.mat.uniforms.uScale.value = s;
  }

  burst(pos, n, o) {
    const sys = o.additive === false ? this.smoke : this.add;
    _c.set(o.color ?? 0xffffff);
    const colors = o.colors ? o.colors.map((c) => new THREE.Color(c)) : null;
    for (let i = 0; i < n; i++) {
      const sp = (o.speed ?? 5) * (0.35 + Math.random() * 0.65);
      let dx = Math.random() * 2 - 1, dy = Math.random() * 2 - 1, dz = Math.random() * 2 - 1;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx /= l; dy /= l; dz /= l;
      if (o.dir) { dx = dx * (o.spread ?? 0.5) + o.dir.x; dy = dy * (o.spread ?? 0.5) + o.dir.y; dz = dz * (o.spread ?? 0.5) + o.dir.z; }
      if (o.up) dy = Math.abs(dy) * o.up;
      const r = o.radius ?? 0;
      sys.emit(
        pos.x + (Math.random() - 0.5) * r, pos.y + (Math.random() - 0.5) * r * (o.flat ? 0.2 : 1), pos.z + (Math.random() - 0.5) * r,
        dx * sp, dy * sp, dz * sp,
        {
          color: colors ? colors[(Math.random() * colors.length) | 0] : _c,
          life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6),
          size: (o.size ?? 0.3) * (0.7 + Math.random() * 0.6), size1: o.size1 != null ? o.size1 * (0.7 + Math.random() * 0.6) : undefined,
          alpha: o.alpha ?? 1, gravity: o.gravity ?? 0, drag: o.drag ?? 1.5, fadeIn: o.fadeIn,
        }
      );
    }
  }

  trail(pos, color, size = 0.25, life = 0.3, additive = true, alpha = 0.9) {
    _c.set(color);
    (additive ? this.add : this.smoke).emit(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, { color: _c, life, size, size1: size * 0.3, alpha });
  }

  sparks(pos, color = 0xffc070, n = 14, speed = 9) {
    this.burst(pos, n, { color, speed, life: 0.35, size: 0.12, size1: 0.02, gravity: 14, drag: 1 });
  }

  dust(pos, n = 16, radius = 1.5) {
    this.burst(pos, n, { colors: [0x9a9286, 0x7d766c, 0xb0a898], additive: false, speed: 4, up: 0.4, life: 1.1, size: 0.9, size1: 2.4, alpha: 0.45, drag: 2.5, radius, flat: true });
  }

  explosion(pos, scale = 1, palette = 'fire') {
    if (palette === 'fire') {
      this.burst(pos, 26 * scale, { colors: [0xffd27a, 0xff8a2a, 0xffb648], speed: 7 * scale, life: 0.45, size: 1.1 * scale, size1: 0.2, drag: 3 });
      this.burst(pos, 14 * scale, { colors: [0x2c2a28, 0x494540, 0x605a52], additive: false, speed: 3 * scale, life: 1.4, size: 1.0 * scale, size1: 3 * scale, alpha: 0.55, drag: 2, gravity: -1.5, fadeIn: true });
      this.sparks(pos, 0xffc070, 16 * scale, 12 * scale);
      this.flash(pos, 0xff9a40, 140 * scale, 0.25);
    } else if (palette === 'blue') {
      this.burst(pos, 18 * scale, { colors: [0xbff4ff, 0x5fd0ff, 0xffffff], speed: 6 * scale, life: 0.35, size: 0.7 * scale, size1: 0.1, drag: 3 });
      this.sparks(pos, 0x9fe8ff, 10 * scale, 10);
      this.flash(pos, 0x66ccff, 90 * scale, 0.18);
    } else if (palette === 'stink') {
      this.burst(pos, 30 * scale, { colors: [0x6b5a24, 0x8a7a30, 0x5a4a1c, 0x7a8a2a], additive: false, speed: 6 * scale, life: 1.4, size: 1.2, size1: 3.5, alpha: 0.7, drag: 2.5, gravity: -0.5, fadeIn: true });
      this.burst(pos, 12, { colors: [0x5a3a1a, 0x3e2810], additive: false, speed: 9, life: 0.7, size: 0.25, size1: 0.2, gravity: 18, drag: 0.5, alpha: 1 });
    }
  }

  flash(pos, color, intensity = 80, life = 0.2) {
    const L = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    L.light.position.copy(pos);
    L.light.color.set(color);
    L.peak = intensity; L.t = 0; L.life = life;
    L.light.intensity = intensity;
  }

  beam(a, b, color = 0x66ddff, width = 0.06, life = 0.12) {
    const B = this.beams.find((x) => !x.mesh.visible) || this.beams[0];
    const len = a.distanceTo(b);
    B.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    B.mesh.lookAt(b);
    B.mesh.scale.set(width, width, len);
    B.mesh.material.color.set(color);
    B.mesh.material.opacity = 1; B.inner.material.opacity = 1;
    B.mesh.visible = true; B.t = 0; B.life = life;
  }

  lightning(a, b, color = 0x9fe4ff, life = 0.15, jitter = 0.6) {
    const L = this.bolts.find((x) => !x.line.visible) || this.bolts[(Math.random() * this.bolts.length) | 0];
    L.a.copy(a); L.b.copy(b); L.t = 0; L.life = life; L.jitter = jitter;
    L.line.material.color.set(color);
    L.line.visible = true;
    this._shapeBolt(L);
  }

  _shapeBolt(L) {
    const arr = L.line.geometry.attributes.position.array;
    const n = arr.length / 3;
    const len = L.a.distanceTo(L.b);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      _v.lerpVectors(L.a, L.b, k);
      const j = i === 0 || i === n - 1 ? 0 : L.jitter * Math.min(1, len / 4);
      arr[i * 3] = _v.x + (Math.random() - 0.5) * j;
      arr[i * 3 + 1] = _v.y + (Math.random() - 0.5) * j;
      arr[i * 3 + 2] = _v.z + (Math.random() - 0.5) * j;
    }
    L.line.geometry.attributes.position.needsUpdate = true;
  }

  shockwave(pos, radius = 8, color = 0x9fe4ff, life = 0.55) {
    const R = this.rings.find((x) => !x.mesh.visible) || this.rings[0];
    R.mesh.position.set(pos.x, pos.y + 0.15, pos.z);
    R.mesh.material.color.set(color);
    R.mesh.visible = true; R.t = 0; R.life = life; R.r = radius;
    R.mesh.scale.setScalar(0.1);
  }

  addShake(v) { this.shake = Math.min(1.2, Math.max(this.shake, v)); }

  update(dt) {
    this.add.update(dt);
    this.smoke.update(dt);
    for (const B of this.beams) {
      if (!B.mesh.visible) continue;
      B.t += dt;
      const k = 1 - B.t / B.life;
      if (k <= 0) { B.mesh.visible = false; continue; }
      B.mesh.material.opacity = k * 0.85; B.inner.material.opacity = k;
    }
    for (const L of this.bolts) {
      if (!L.line.visible) continue;
      L.t += dt;
      if (L.t >= L.life) { L.line.visible = false; continue; }
      L.line.material.opacity = 1 - L.t / L.life;
      if (Math.random() < 0.5) this._shapeBolt(L);
    }
    for (const R of this.rings) {
      if (!R.mesh.visible) continue;
      R.t += dt;
      const k = R.t / R.life;
      if (k >= 1) { R.mesh.visible = false; continue; }
      R.mesh.scale.setScalar(0.2 + R.r * (1 - Math.pow(1 - k, 3)));
      R.mesh.material.opacity = 1 - k;
    }
    for (const L of this.lights) {
      if (L.light.intensity <= 0) continue;
      L.t += dt;
      L.light.intensity = L.t >= L.life ? 0 : L.peak * (1 - L.t / L.life);
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  clear() {
    this.add.clear(); this.smoke.clear();
    for (const B of this.beams) B.mesh.visible = false;
    for (const L of this.bolts) L.line.visible = false;
    for (const R of this.rings) R.mesh.visible = false;
    for (const L of this.lights) L.light.intensity = 0;
    this.shake = 0;
  }
}
