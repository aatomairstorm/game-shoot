import * as THREE from 'three';

const cache = new Map();
const memo = (k, make) => { let g = cache.get(k); if (!g) { g = make(); cache.set(k, g); } return g; };
export const box = (w, h, d) => memo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const sph = (r, ws = 16, hs = 12) => memo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const cyl = (rt, rb, h, s = 12) => memo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const cone = (r, h, s = 12) => memo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.08, ...o });
export const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

export function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  return o;
}

// Front of every character faces -Z. Feet at y = 0, about 2m tall.
export function humanoid(c) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const P = { root, body };
  const leg = (s) => {
    const g = new THREE.Group();
    g.position.set(0.15 * s, 0.88, 0);
    g.add(mesh(box(0.22, 0.76, 0.26), c.legs, 0, -0.38, 0));
    g.add(mesh(box(0.25, 0.16, 0.36), c.boots, 0, -0.8, -0.04));
    body.add(g);
    return g;
  };
  P.legL = leg(-1); P.legR = leg(1);
  body.add(mesh(box(0.56, 0.2, 0.3), c.pelvis || c.legs, 0, 0.92, 0));
  P.torso = mesh(box(0.62, 0.62, 0.34), c.torso, 0, 1.31, 0);
  body.add(P.torso);
  body.add(mesh(box(0.16, 0.1, 0.16), c.neck || c.head, 0, 1.66, 0));
  P.head = new THREE.Group();
  P.head.position.set(0, 1.82, 0);
  body.add(P.head);
  P.headMesh = mesh(sph(0.2), c.head);
  P.headMesh.scale.set(1, 1.1, 1);
  P.head.add(P.headMesh);
  const arm = (s) => {
    const g = new THREE.Group();
    g.position.set(0.4 * s, 1.56, 0);
    g.add(mesh(box(0.17, 0.6, 0.19), c.arms, 0, -0.3, 0));
    const hand = new THREE.Group();
    hand.position.set(0, -0.64, 0);
    hand.add(mesh(sph(0.095), c.hands));
    g.add(hand);
    body.add(g);
    return [g, hand];
  };
  [P.armL, P.handL] = arm(-1);
  [P.armR, P.handR] = arm(1);
  return P;
}

export function walkPose(P, phase, amt) {
  const s = Math.sin(phase) * amt;
  P.legL.rotation.x = s * 0.8;
  P.legR.rotation.x = -s * 0.8;
  P.armL.rotation.x = -s * 0.6;
  P.armR.rotation.x = s * 0.6;
  P.body.position.y = Math.abs(Math.cos(phase)) * 0.06 * amt;
}

// ---------- Heroes ----------
function webSlinger() {
  const red = std(0xc4161f, { roughness: 0.45 }), blue = std(0x1d3a9e, { roughness: 0.45 }), black = std(0x111111);
  const P = humanoid({ torso: red, legs: blue, arms: red, hands: red, boots: red, head: red, pelvis: blue });
  P.body.add(mesh(box(0.06, 0.5, 0.3), blue, -0.3, 1.28, 0), mesh(box(0.06, 0.5, 0.3), blue, 0.3, 1.28, 0));
  // spider emblem
  P.body.add(mesh(box(0.08, 0.15, 0.02), black, 0, 1.4, -0.175, false));
  for (const s of [-1, 1]) for (const k of [-1, 1]) {
    const l = mesh(box(0.16, 0.015, 0.015), black, s * 0.08, 1.4 + k * 0.04, -0.178, false);
    l.rotation.z = s * k * 0.5; P.body.add(l);
  }
  // web lines on suit
  const lineMat = std(0x2a0508);
  for (let i = 0; i < 4; i++) P.body.add(mesh(box(0.63, 0.01, 0.35), lineMat, 0, 1.08 + i * 0.13, 0, false));
  const eyeW = std(0xf4f7ff, { emissive: 0x445566, roughness: 0.2 });
  for (const s of [-1, 1]) {
    const rim = mesh(sph(0.075), black, s * 0.085, 0.03, -0.155, false); rim.scale.set(1.05, 1.35, 0.4); rim.rotation.z = -s * 0.5;
    const e = mesh(sph(0.065), eyeW, s * 0.085, 0.03, -0.165, false); e.scale.set(1, 1.3, 0.35); e.rotation.z = -s * 0.5;
    P.head.add(rim, e);
  }
  return P;
}

function thunderWarrior() {
  const armor = std(0x2a2f38, { roughness: 0.35, metalness: 0.6 }), silver = std(0xc8ccd4, { roughness: 0.25, metalness: 0.9 });
  const skin = std(0xe2b08c), leg = std(0x1d2026), boot = std(0x4a3426), hair = std(0xe0b84a, { roughness: 0.8 });
  const P = humanoid({ torso: armor, legs: leg, arms: skin, hands: skin, boots: boot, head: skin, pelvis: leg });
  for (const [x, y] of [[-0.14, 1.45], [0.14, 1.45], [-0.14, 1.22], [0.14, 1.22]]) {
    const d = mesh(cyl(0.075, 0.075, 0.03, 16), silver, x, y, -0.175, false);
    d.rotation.x = Math.PI / 2; P.body.add(d);
  }
  for (const a of [P.armL, P.armR]) a.add(mesh(box(0.2, 0.22, 0.22), silver, 0, -0.45, 0));
  for (const s of [-1, 1]) P.body.add(mesh(box(0.22, 0.12, 0.3), silver, s * 0.38, 1.6, 0));
  P.head.add(mesh(box(0.42, 0.34, 0.2), hair, 0, 0.0, 0.12));
  P.head.add(mesh(box(0.3, 0.12, 0.16), hair, 0, -0.17, -0.1));
  const helm = mesh(sph(0.215, 16, 8), silver, 0, 0.05, 0); helm.scale.set(1, 0.75, 1);
  P.head.add(helm);
  for (const s of [-1, 1]) {
    const w = mesh(box(0.03, 0.18, 0.12), silver, s * 0.22, 0.12, 0.02); w.rotation.z = -s * 0.5; P.head.add(w);
  }
  const eye = std(0x3399ff, { emissive: 0x1166ff, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) P.head.add(mesh(box(0.05, 0.025, 0.02), eye, s * 0.07, 0.02, -0.2, false));
  const capeGeo = new THREE.PlaneGeometry(0.66, 1.25, 1, 4);
  capeGeo.translate(0, -0.625, 0);
  const cape = new THREE.Mesh(capeGeo, std(0xb0141c, { side: THREE.DoubleSide, roughness: 0.8 }));
  cape.castShadow = true;
  P.cape = new THREE.Group();
  P.cape.position.set(0, 1.62, 0.2);
  P.cape.add(cape);
  P.body.add(P.cape);
  return P;
}

function ironStriker() {
  const red = std(0xa8121a, { roughness: 0.25, metalness: 0.75 }), gold = std(0xd8a43a, { roughness: 0.25, metalness: 0.85 });
  const P = humanoid({ torso: red, legs: gold, arms: red, hands: gold, boots: red, head: red, pelvis: red });
  const core = std(0xbff4ff, { emissive: 0x6fe8ff, emissiveIntensity: 2.5 });
  const reactor = mesh(cyl(0.08, 0.08, 0.03, 20), core, 0, 1.42, -0.18, false);
  reactor.rotation.x = Math.PI / 2; P.body.add(reactor);
  P.body.add(mesh(box(0.44, 0.24, 0.04), gold, 0, 1.17, -0.17, false));
  for (const s of [-1, 1]) P.body.add(mesh(box(0.24, 0.14, 0.32), red, s * 0.38, 1.6, 0));
  P.head.add(mesh(box(0.26, 0.28, 0.06), gold, 0, -0.02, -0.17, false));
  for (const s of [-1, 1]) P.head.add(mesh(box(0.08, 0.025, 0.02), core, s * 0.06, 0.04, -0.205, false));
  for (const l of [P.legL, P.legR]) l.add(mesh(box(0.24, 0.3, 0.28), red, 0, -0.55, 0));
  // Thruster flames (feet + palms)
  P.flames = [];
  const flameMat = glow(0x8fe6ff, 0.9), coreMat = glow(0xfff2c0, 0.95);
  const flame = (parent, y) => {
    const g = new THREE.Group(); g.position.y = y;
    const outer = new THREE.Mesh(cone(0.13, 0.7, 12), flameMat); outer.rotation.x = Math.PI; outer.position.y = -0.35;
    const inner = new THREE.Mesh(cone(0.07, 0.45, 10), coreMat); inner.rotation.x = Math.PI; inner.position.y = -0.22;
    g.add(outer, inner); g.visible = false; parent.add(g); P.flames.push(g);
  };
  flame(P.legL, -0.9); flame(P.legR, -0.9); flame(P.handL, -0.08); flame(P.handR, -0.08);
  for (const h of [P.handL, P.handR]) h.add(mesh(cyl(0.05, 0.05, 0.02, 12), core, 0, -0.09, 0, false));
  return P;
}

export function createHero(id) {
  const P = id === 'web' ? webSlinger() : id === 'thor' ? thunderWarrior() : ironStriker();
  return P;
}

export function createHammer() {
  const g = new THREE.Group();
  const leather = std(0x5a3a22, { roughness: 0.85 }), steel = std(0x7d8590, { roughness: 0.3, metalness: 0.85 });
  g.add(mesh(cyl(0.035, 0.042, 0.52, 10), leather, 0, 0.26, 0));
  g.add(mesh(sph(0.05), steel, 0, 0, 0));
  g.add(mesh(box(0.38, 0.22, 0.22), steel, 0, 0.6, 0));
  const rune = std(0x9fdcff, { emissive: 0x3aa8ff, emissiveIntensity: 1.2 });
  g.add(mesh(box(0.2, 0.02, 0.23), rune, 0, 0.6, 0, false));
  for (const s of [-1, 1]) g.add(mesh(box(0.04, 0.24, 0.24), steel, s * 0.2, 0.6, 0));
  return g;
}

// ---------- Bandit ----------
const BANDIT_COLORS = [0x3b4a2f, 0x4d3c2a, 0x2f3540, 0x5a2a2a];
export function createBandit(variant = 0) {
  const torso = std(BANDIT_COLORS[variant % 4], { roughness: 0.85 });
  const head = std(0x1a1a1a, { roughness: 0.8 });
  const pants = std(0x2b2f3a, { roughness: 0.9 }), skin = std(0xc89070), boots = std(0x1c1c1c);
  const P = humanoid({ torso, legs: pants, arms: torso, hands: skin, boots, head, pelvis: pants });
  P.flashMats = [torso, head];
  const band = std(0xb01818);
  P.head.add(mesh(box(0.42, 0.09, 0.42), band, 0, 0.06, 0, false));
  P.head.add(mesh(box(0.22, 0.05, 0.02), skin, 0, 0.0, -0.205, false));
  P.body.add(mesh(box(0.64, 0.08, 0.36), std(0x3a2a18), 0, 1.06, 0, false));
  // Rifle
  const gun = new THREE.Group();
  const gm = std(0x1b1d20, { roughness: 0.4, metalness: 0.7 });
  gun.add(mesh(box(0.08, 0.13, 0.62), gm, 0, 0, 0));
  gun.add(mesh(box(0.06, 0.2, 0.1), gm, 0, -0.14, -0.08));
  gun.add(mesh(box(0.07, 0.11, 0.24), std(0x5a3e24), 0, -0.03, 0.4));
  const barrel = mesh(cyl(0.022, 0.022, 0.38, 8), gm, 0, 0.02, -0.5);
  barrel.rotation.x = Math.PI / 2; gun.add(barrel);
  P.muzzle = new THREE.Group(); P.muzzle.position.set(0, 0.02, -0.72); gun.add(P.muzzle);
  P.flash = new THREE.Mesh(sph(0.12, 8, 6), glow(0xffc860, 1));
  P.flash.scale.set(1, 1, 2.2); P.flash.visible = false; P.muzzle.add(P.flash);
  gun.position.set(0.12, 1.3, -0.32);
  P.body.add(gun);
  P.gun = gun;
  P.armR.rotation.set(1.25, 0, 0.1);
  P.armL.rotation.set(1.35, 0, 0.55);
  // Web net (shown when webbed)
  P.net = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 }));
  P.net.position.y = 1.1; P.net.scale.set(0.9, 1.45, 0.9); P.net.visible = false;
  P.root.add(P.net);
  // Stun stars
  P.stars = new THREE.Group(); P.stars.position.y = 2.25; P.stars.visible = false;
  const starMat = glow(0xfff060, 1);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), starMat);
    const a = (i / 4) * Math.PI * 2; s.position.set(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    P.stars.add(s);
  }
  P.root.add(P.stars);
  return P;
}

// ---------- Hostage ----------
export function createHostage() {
  const shirt = std(0xdcd4c4), pants = std(0x34598c), skin = std(0xe2b090), hair = std(0x4a2e1c);
  const P = humanoid({ torso: shirt, legs: pants, arms: shirt, hands: skin, boots: std(0x3a2a1a), head: skin, pelvis: pants });
  P.head.add(mesh(box(0.4, 0.14, 0.4), hair, 0, 0.14, 0.02));
  P.gag = mesh(box(0.42, 0.06, 0.42), std(0xeeeeee), 0, -0.05, 0, false);
  P.head.add(P.gag);
  const chair = new THREE.Group();
  const wood = std(0x6b4a2c);
  chair.add(mesh(box(0.55, 0.06, 0.5), wood, 0, 0.5, 0));
  chair.add(mesh(box(0.55, 0.6, 0.06), wood, 0, 0.82, 0.24));
  for (const [x, z] of [[-0.24, -0.21], [0.24, -0.21], [-0.24, 0.21], [0.24, 0.21]]) chair.add(mesh(box(0.05, 0.5, 0.05), wood, x, 0.25, z));
  P.root.add(chair);
  P.chair = chair;
  const ropeMat = std(0x9c7a4a, { roughness: 1 });
  P.ropes = new THREE.Group();
  for (const y of [1.15, 1.35]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 6, 20), ropeMat);
    r.rotation.x = Math.PI / 2; r.position.y = y - 0.38; r.scale.set(1, 0.65, 1);
    P.ropes.add(r);
  }
  P.root.add(P.ropes);
  return P;
}

export function sitPose(P) {
  P.body.position.set(0, -0.36, 0.05);
  P.legL.rotation.x = P.legR.rotation.x = Math.PI / 2;
  P.armL.rotation.set(-0.5, 0, -0.25);
  P.armR.rotation.set(-0.5, 0, 0.25);
}
