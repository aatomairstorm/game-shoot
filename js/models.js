import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();
const memo = (k, make) => { let g = cache.get(k); if (!g) { g = make(); cache.set(k, g); } return g; };
export const box = (w, h, d) => memo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export const sph = (r, ws = 16, hs = 12) => memo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
export const cyl = (rt, rb, h, s = 12) => memo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const cone = (r, h, s = 12) => memo(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));

export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.08, ...o });
export const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/**
 * Draw-call reduction: inside each rigid group, merge the plain (non-emissive, opaque) child meshes
 * into one mesh that carries the original colours as vertex colours. Returns the shared material.
 */
export function bakeRig(groups, skip = new Set(), matOpts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2, ...matOpts });
  for (const g of groups) {
    if (!g) continue;
    const meshes = g.children.filter((c) => c.isMesh && !skip.has(c) && !Array.isArray(c.material) && !c.material.transparent
      && c.material.isMeshStandardMaterial && c.material.emissive.getHex() === 0 && c.visible);
    if (meshes.length < 2) continue;
    let geos = meshes.map((m) => {
      m.updateMatrix();
      const geo = m.geometry.clone().applyMatrix4(m.matrix);
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      const n = geo.attributes.position.count, col = new Float32Array(n * 3), c = m.material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    });
    if (!geos.every((x) => x.index)) geos = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    const merged = mergeGeometries(geos, false);
    for (const x of geos) x.dispose();
    if (!merged) continue;
    for (const m of meshes) g.remove(m);
    const baked = new THREE.Mesh(merged, mat);
    baked.castShadow = true;
    g.add(baked);
  }
  return mat;
}

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
  switch (id) {
    case 'web': return webSlinger();
    case 'thor': return thunderWarrior();
    case 'iron': return ironStriker();
    case 'lucia': return lucia();
    case 'ben': return benHuman();
    case 'fia': return fiaRood();
    case 'cannonbolt': return cannonbolt();
    case 'xlr8': return xlr8();
    case 'feedback': return feedback();
    default: return webSlinger();
  }
}

// ---------- Lucia (mermaid idol) ----------
function lucia() {
  const skin = std(0xf6d3bf), pink = std(0xff8fc8, { roughness: 0.35, emissive: 0x6a1446, emissiveIntensity: 0.35 });
  const pearl = std(0xfff2fa, { roughness: 0.2, metalness: 0.3, emissive: 0x332233, emissiveIntensity: 0.3 });
  const hair = std(0xffe07a, { roughness: 0.55 }), boot = std(0xffffff, { roughness: 0.3 });
  const P = humanoid({ torso: pink, legs: skin, arms: skin, hands: skin, boots: boot, head: skin, pelvis: pink });
  P.torso.scale.set(0.82, 1, 0.85);
  P.armL.scale.set(0.8, 1, 0.8); P.armR.scale.set(0.8, 1, 0.8);
  P.legL.scale.set(0.8, 1, 0.8); P.legR.scale.set(0.8, 1, 0.8);
  // Layered skirt
  const sk1 = mesh(cyl(0.22, 0.5, 0.42, 20), pink, 0, 0.84, 0); P.body.add(sk1);
  const sk2 = mesh(cyl(0.3, 0.56, 0.12, 20), pearl, 0, 0.66, 0); P.body.add(sk2);
  P.body.add(mesh(box(0.44, 0.08, 0.3), pearl, 0, 1.08, 0, false));
  for (const s of [-1, 1]) {
    const puff = mesh(sph(0.13, 10, 8), pearl, s * 0.38, 1.56, 0); P.body.add(puff);
    const bow = mesh(box(0.14, 0.08, 0.04), pink, s * 0.07, 1.6, -0.19, false); bow.rotation.z = s * 0.4; P.body.add(bow);
  }
  // Hair: cap, bangs and two long twin tails
  const cap = mesh(sph(0.215, 16, 10), hair, 0, 0.05, 0.02); cap.scale.set(1.05, 1, 1.05); P.head.add(cap);
  P.head.add(mesh(box(0.36, 0.08, 0.08), hair, 0, 0.13, -0.17, false));
  P.tails = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.2, 0.12, 0.05);
    g.add(mesh(sph(0.07, 8, 6), pink, 0, 0, 0, false));
    const t1 = mesh(cyl(0.09, 0.05, 0.75, 10), hair, s * 0.06, -0.38, 0.02); t1.rotation.z = s * 0.12; g.add(t1);
    g.add(mesh(sph(0.075, 8, 6), hair, s * 0.1, -0.76, 0.03, false));
    P.head.add(g); P.tails.push(g);
  }
  const eye = std(0x3aa8ff, { emissive: 0x1060aa, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) P.head.add(mesh(sph(0.035, 8, 6), eye, s * 0.075, 0.0, -0.19, false));
  // Glowing shell pendant / microphone
  const glowMat = std(0xffd6f0, { emissive: 0xff70c8, emissiveIntensity: 2.2 });
  P.pendant = mesh(sph(0.07, 12, 8), glowMat, 0, 1.47, -0.2, false); P.pendant.scale.set(1, 1.2, 0.6);
  P.body.add(P.pendant);
  const mic = new THREE.Group();
  mic.add(mesh(cyl(0.025, 0.02, 0.22, 8), pearl, 0, -0.08, 0, false));
  mic.add(mesh(sph(0.06, 10, 8), glowMat, 0, -0.22, 0, false));
  mic.rotation.x = Math.PI; mic.position.y = -0.02;
  P.handR.add(mic);
  P.aura = new THREE.Mesh(sph(0.9, 16, 10), glow(0xff8ad8, 0.08)); P.aura.position.y = 1.1; P.aura.scale.set(0.8, 1.3, 0.8);
  P.root.add(P.aura);
  return P;
}

// ---------- Ben 10 ----------
function omnitrix(parent) {
  const band = mesh(cyl(0.11, 0.11, 0.14, 14), std(0x1a1a1a, { roughness: 0.4 }), 0, 0.18, 0, false);
  const dial = mesh(cyl(0.075, 0.075, 0.04, 14), std(0x7dff6a, { emissive: 0x2fe05a, emissiveIntensity: 2.5 }), 0, 0.18, -0.11, false);
  dial.rotation.x = Math.PI / 2;
  parent.add(band, dial);
  return dial;
}

function benHuman() {
  const skin = std(0xeec4a6), jacket = std(0x1f7a3a, { roughness: 0.7 }), shirt = std(0x1a1a1a), jeans = std(0x3a4d78), hair = std(0x5a3418, { roughness: 0.8 });
  const P = humanoid({ torso: jacket, legs: jeans, arms: jacket, hands: skin, boots: std(0x2a2a2a), head: skin, pelvis: jeans });
  P.body.add(mesh(box(0.22, 0.5, 0.02), shirt, 0, 1.3, -0.172, false));
  P.body.add(mesh(box(0.06, 0.5, 0.02), std(0xffffff), 0, 1.3, -0.174, false));
  const h = mesh(sph(0.215, 14, 8), hair, 0, 0.07, 0.02); h.scale.set(1.05, 0.85, 1.05); P.head.add(h);
  P.head.add(mesh(box(0.38, 0.1, 0.1), hair, 0, 0.15, -0.15, false));
  for (const s of [-1, 1]) P.head.add(mesh(sph(0.03, 8, 6), std(0x2a8a3a), s * 0.075, 0.0, -0.19, false));
  P.omni = omnitrix(P.armL);
  return P;
}

function cannonbolt() {
  const white = std(0xf2efe6, { roughness: 0.45 }), yellow = std(0xf2c230, { roughness: 0.35, metalness: 0.3 }), skin = std(0xe8e2d0);
  const P = humanoid({ torso: white, legs: white, arms: white, hands: yellow, boots: yellow, head: skin, pelvis: white });
  P.torso.visible = false;
  const belly = mesh(sph(0.62, 20, 14), white, 0, 1.25, 0); belly.scale.set(1, 0.95, 0.95); P.body.add(belly);
  const shell = mesh(sph(0.66, 20, 14, ), yellow, 0, 1.3, 0.12); shell.scale.set(1.02, 1.0, 0.85); P.body.add(shell);
  for (let i = -1; i <= 1; i++) P.body.add(mesh(box(1.2, 0.07, 0.2), std(0x2a2a2a), 0, 1.3 + i * 0.32, 0.62, false));
  P.head.position.y = 2.0;
  P.headMesh.scale.set(0.8, 0.8, 0.8);
  for (const s of [-1, 1]) P.head.add(mesh(sph(0.045, 8, 6), std(0x2fe05a, { emissive: 0x2fe05a, emissiveIntensity: 1 }), s * 0.07, 0.02, -0.15, false));
  for (const a of [P.armL, P.armR]) a.scale.set(1.3, 1, 1.3);
  P.omni = omnitrix(P.armL);
  P.omni.position.set(0, 0.0, 0);
  // Rolling ball form
  P.ball = new THREE.Group(); P.ball.position.y = 1.0; P.ball.visible = false;
  const bs = mesh(sph(1.0, 24, 16), yellow); P.ball.add(bs);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 6, 32), white);
    r.rotation.y = (i * Math.PI) / 3; P.ball.add(r);
  }
  const sym = mesh(cyl(0.25, 0.25, 0.06, 16), std(0x2fe05a, { emissive: 0x2fe05a, emissiveIntensity: 2 }), 0, 0, 0, false);
  sym.rotation.z = Math.PI / 2; sym.position.x = 1.0; P.ball.add(sym);
  P.root.add(P.ball);
  P.root.scale.setScalar(1.12);
  return P;
}

function xlr8() {
  const black = std(0x15171c, { roughness: 0.3, metalness: 0.4 }), blue = std(0x2a6cff, { roughness: 0.3, metalness: 0.3, emissive: 0x0a2a88, emissiveIntensity: 0.6 });
  const P = humanoid({ torso: blue, legs: black, arms: black, hands: black, boots: black, head: black, pelvis: black });
  P.body.add(mesh(box(0.3, 0.55, 0.36), black, 0, 1.3, 0));
  P.headMesh.scale.set(0.9, 1.0, 1.35);
  const visor = mesh(sph(0.2, 16, 8, ), std(0x8fd8ff, { emissive: 0x2a8aff, emissiveIntensity: 1.2, roughness: 0.1, transparent: true, opacity: 0.8 }), 0, 0.02, -0.12, false);
  visor.scale.set(0.95, 0.55, 0.9); P.head.add(visor);
  P.head.add(mesh(box(0.06, 0.06, 0.4), blue, 0, 0.2, 0.05, false));
  const tail = mesh(cone(0.1, 1.1, 8), black, 0, 0.95, 0.55); tail.rotation.x = -1.2; P.body.add(tail);
  P.tail = tail;
  // Wheel-balls under the feet
  P.wheels = [];
  for (const l of [P.legL, P.legR]) {
    const w = mesh(sph(0.13, 12, 8), std(0x6fb8ff, { emissive: 0x2a6cff, emissiveIntensity: 1.5 }), 0, -0.86, 0, false);
    l.add(w); P.wheels.push(w);
  }
  P.omni = omnitrix(P.body); P.omni.position.set(0, 1.0, -0.06);
  return P;
}

function feedback() {
  const black = std(0x101312, { roughness: 0.45 }), green = std(0x24d860, { emissive: 0x18c050, emissiveIntensity: 1.6 }), dark = std(0x1d3a24);
  const P = humanoid({ torso: black, legs: black, arms: black, hands: black, boots: dark, head: black, pelvis: black });
  P.body.add(mesh(box(0.1, 0.6, 0.02), green, 0, 1.3, -0.175, false));
  for (const s of [-1, 1]) P.body.add(mesh(box(0.025, 0.6, 0.02), green, s * 0.2, 1.3, -0.175, false));
  P.headMesh.scale.set(0.95, 1.15, 1);
  P.head.add(mesh(sph(0.065, 10, 8), std(0x7dff6a, { emissive: 0x2fe05a, emissiveIntensity: 3 }), 0, 0.03, -0.18, false));
  // Two long conductor antennae with plug tips
  P.antennae = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.1, 0.18, 0.05); g.rotation.set(0.5, 0, s * 0.35);
    g.add(mesh(cyl(0.022, 0.03, 0.95, 6), black, 0, 0.47, 0, false));
    const tip = mesh(cone(0.07, 0.16, 4), green, 0, 1.0, 0, false); g.add(tip);
    for (const k of [-1, 1]) g.add(mesh(box(0.02, 0.1, 0.02), green, k * 0.035, 1.12, 0, false));
    P.head.add(g); P.antennae.push(tip);
  }
  // Glowing conductor spikes on the hands
  P.spikes = [];
  for (const h of [P.handL, P.handR]) {
    for (const [x, z] of [[-0.05, -0.03], [0.05, -0.03], [0, 0.05]]) {
      const sp = mesh(cone(0.03, 0.2, 5), green, x, -0.15, z, false); sp.rotation.x = Math.PI; h.add(sp); P.spikes.push(sp);
    }
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.95, 0.15);
  const tl = mesh(cyl(0.03, 0.05, 1.1, 6), black, 0, -0.5, 0.25, false); tl.rotation.x = 0.5; tail.add(tl);
  tail.add(mesh(cone(0.08, 0.18, 4), green, 0, -0.98, 0.52, false));
  P.body.add(tail);
  P.omni = omnitrix(P.body); P.omni.position.set(0, 1.0, -0.06);
  return P;
}

// ---------- Fia Rood (saint knight) ----------
function fiaRood() {
  const white = std(0xf4f4f8, { roughness: 0.4 }), silver = std(0xd2d6de, { roughness: 0.2, metalness: 0.9 }), gold = std(0xe8b84a, { roughness: 0.25, metalness: 0.85 });
  const skin = std(0xf5d6c2), hair = std(0xd8302a, { roughness: 0.55 }), dark = std(0x2a2f3a);
  const P = humanoid({ torso: white, legs: white, arms: white, hands: std(0xffffff), boots: silver, head: skin, pelvis: white });
  P.torso.scale.set(0.85, 1, 0.9);
  P.body.add(mesh(box(0.5, 0.3, 0.05), silver, 0, 1.42, -0.17, false));
  P.body.add(mesh(box(0.06, 0.62, 0.02), gold, 0, 1.3, -0.2, false));
  P.body.add(mesh(box(0.56, 0.06, 0.34), gold, 0, 1.03, 0, false));
  // Coat tails
  const coat = mesh(cyl(0.3, 0.42, 0.55, 16, ), white, 0, 0.75, 0); P.body.add(coat);
  P.body.add(mesh(cyl(0.425, 0.425, 0.04, 16), gold, 0, 0.49, 0, false));
  for (const s of [-1, 1]) {
    P.body.add(mesh(box(0.24, 0.12, 0.32), silver, s * 0.38, 1.6, 0));
    P.body.add(mesh(box(0.26, 0.03, 0.34), gold, s * 0.38, 1.67, 0, false));
  }
  // Long red hair
  const hcap = mesh(sph(0.22, 14, 10), hair, 0, 0.05, 0.03); hcap.scale.set(1.05, 1, 1.05); P.head.add(hcap);
  P.head.add(mesh(box(0.38, 0.7, 0.12), hair, 0, -0.25, 0.16));
  P.head.add(mesh(box(0.34, 0.08, 0.08), hair, 0, 0.14, -0.17, false));
  for (const s of [-1, 1]) P.head.add(mesh(sph(0.033, 8, 6), std(0x2fa86a, { emissive: 0x106a3a, emissiveIntensity: 0.5 }), s * 0.075, 0.0, -0.19, false));
  // Sword at hip
  const sword = new THREE.Group(); sword.position.set(-0.32, 1.0, 0.05); sword.rotation.z = 0.35;
  sword.add(mesh(box(0.05, 0.8, 0.08), dark, 0, -0.35, 0, false));
  sword.add(mesh(box(0.2, 0.04, 0.08), gold, 0, 0.06, 0, false));
  sword.add(mesh(cyl(0.025, 0.025, 0.18, 6), dark, 0, 0.16, 0, false));
  P.body.add(sword);
  // Cape
  const capeGeo = new THREE.PlaneGeometry(0.62, 1.2, 1, 4); capeGeo.translate(0, -0.6, 0);
  const cape = new THREE.Mesh(capeGeo, std(0xffffff, { side: THREE.DoubleSide, roughness: 0.7 }));
  P.cape = new THREE.Group(); P.cape.position.set(0, 1.6, 0.19); P.cape.add(cape); P.body.add(P.cape);
  // Holy aura: halo ring + soft glow
  P.halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 6, 28), glow(0xffe27a, 0.9));
  P.halo.rotation.x = Math.PI / 2; P.halo.position.y = 0.33; P.head.add(P.halo);
  P.aura = new THREE.Mesh(sph(0.9, 16, 10), glow(0xffe08a, 0.07)); P.aura.position.y = 1.1; P.aura.scale.set(0.8, 1.3, 0.8);
  P.root.add(P.aura);
  return P;
}

export function createDragon() {
  const black = std(0x15161b, { roughness: 0.4, metalness: 0.3 }), gold = std(0xe2b040, { roughness: 0.25, metalness: 0.85, emissive: 0x3a2800, emissiveIntensity: 0.4 });
  const membrane = std(0x2a2230, { side: THREE.DoubleSide, roughness: 0.6, emissive: 0x2a1a00, emissiveIntensity: 0.3 });
  const g = new THREE.Group();
  const body = mesh(sph(0.8, 16, 12), black, 0, 0, 0); body.scale.set(0.9, 0.75, 1.9); g.add(body);
  g.add(mesh(box(0.08, 0.1, 2.6), gold, 0, 0.6, 0, false));
  const neck = mesh(cyl(0.25, 0.4, 1.4, 10), black, 0, 0.55, -1.6); neck.rotation.x = -0.9; g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 1.05, -2.25); g.add(head);
  head.add(mesh(box(0.45, 0.38, 0.8), black, 0, 0, 0));
  head.add(mesh(box(0.3, 0.2, 0.45), black, 0, -0.08, -0.55));
  for (const s of [-1, 1]) {
    const horn = mesh(cone(0.07, 0.6, 6), gold, s * 0.15, 0.3, 0.3, false); horn.rotation.x = 0.9; head.add(horn);
    head.add(mesh(sph(0.05, 6, 4), std(0xffd040, { emissive: 0xffa000, emissiveIntensity: 3 }), s * 0.16, 0.08, -0.3, false));
  }
  const tail = mesh(cone(0.35, 2.4, 8), black, 0, -0.1, 2.3); tail.rotation.x = Math.PI / 2 + 0.25; g.add(tail);
  g.add(mesh(cone(0.18, 0.4, 4), gold, 0, -0.38, 3.5, false));
  for (const s of [-1, 1]) for (const z of [-0.5, 0.6]) {
    const leg = mesh(cyl(0.12, 0.1, 0.7, 6), black, s * 0.45, -0.6, z); g.add(leg);
  }
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0); wingShape.lineTo(2.8, 0.5); wingShape.lineTo(3.4, -0.4); wingShape.lineTo(2.2, -0.6);
  wingShape.lineTo(1.6, -1.3); wingShape.lineTo(0.9, -0.8); wingShape.lineTo(0, -1.0); wingShape.lineTo(0, 0);
  const wingGeo = new THREE.ShapeGeometry(wingShape);
  wingGeo.rotateX(-Math.PI / 2);
  g.wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.5, 0.4, -0.5);
    const m = new THREE.Mesh(wingGeo, membrane); m.scale.set(s, 1, 1); w.add(m);
    const bone = mesh(cyl(0.04, 0.04, 3.4, 6), gold, s * 1.7, 0.02, -0.2, false); bone.rotation.z = Math.PI / 2; bone.rotation.y = s * -0.15; w.add(bone);
    g.add(w); g.wings.push(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- Boss decorations ----------
export function decorateBoss(P, type) {
  if (type === 'armored') {
    const plate = std(0x50555c, { roughness: 0.3, metalness: 0.85 }), red = std(0xa01818, { emissive: 0x500000, emissiveIntensity: 0.8 });
    P.body.add(mesh(box(0.74, 0.66, 0.44), plate, 0, 1.31, 0));
    for (const s of [-1, 1]) P.body.add(mesh(box(0.34, 0.24, 0.46), plate, s * 0.46, 1.62, 0));
    for (const l of [P.legL, P.legR]) l.add(mesh(box(0.3, 0.42, 0.34), plate, 0, -0.55, 0));
    const helm = mesh(box(0.48, 0.46, 0.48), plate, 0, 0.02, 0); P.head.add(helm);
    P.head.add(mesh(box(0.36, 0.06, 0.04), red, 0, 0.04, -0.25, false));
    // Minigun barrels around the rifle
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const b = mesh(cyl(0.03, 0.03, 0.7, 6), plate, Math.cos(a) * 0.07, 0.02 + Math.sin(a) * 0.07, -0.6, false);
      b.rotation.x = Math.PI / 2; P.gun.add(b);
    }
    P.flashMats.push(plate);
  } else {
    const coat = std(0x2b2f24, { roughness: 0.8 }), gold = std(0xe2b040, { metalness: 0.8, roughness: 0.3 }), red = std(0x9a1414);
    const c = mesh(cyl(0.36, 0.5, 0.95, 14), coat, 0, 0.82, 0); P.body.add(c);
    P.body.add(mesh(box(0.66, 0.66, 0.38), coat, 0, 1.31, 0));
    P.body.add(mesh(box(0.08, 0.66, 0.4), red, 0.12, 1.31, 0, false));
    for (const s of [-1, 1]) {
      P.body.add(mesh(box(0.3, 0.06, 0.34), gold, s * 0.4, 1.66, 0, false));
      for (let i = 0; i < 3; i++) P.body.add(mesh(box(0.012, 0.12, 0.012), gold, s * (0.3 + i * 0.07), 1.58, -0.17, false));
    }
    const cap = mesh(cyl(0.26, 0.22, 0.16, 14), coat, 0, 0.18, 0); P.head.add(cap);
    P.head.add(mesh(box(0.3, 0.03, 0.18), std(0x111111), 0, 0.11, -0.2, false));
    P.head.add(mesh(sph(0.04, 6, 4), gold, 0, 0.2, -0.2, false));
    P.flashMats.push(coat);
  }
}

// ---------- Turret ----------
export function createTurret() {
  const armor = std(0x3a3f46, { roughness: 0.35, metalness: 0.75 }), dark = std(0x1a1c20, { roughness: 0.4, metalness: 0.7 });
  const stripe = std(0xe0b020, { roughness: 0.5 });
  const T = { root: new THREE.Group() };
  T.root.add(mesh(box(1.6, 0.5, 1.6), armor, 0, 0.25, 0));
  T.root.add(mesh(box(1.62, 0.1, 1.62), stripe, 0, 0.5, 0, false));
  T.root.add(mesh(cyl(0.45, 0.6, 0.8, 12), armor, 0, 0.95, 0));
  T.head = new THREE.Group(); T.head.position.y = 1.5; T.root.add(T.head);
  T.headMat = std(0x4a5058, { roughness: 0.3, metalness: 0.8 });
  T.head.add(mesh(box(0.9, 0.6, 0.9), T.headMat, 0, 0, 0));
  T.head.add(mesh(box(0.92, 0.12, 0.6), dark, 0, 0.32, 0.1, false));
  T.eye = mesh(sph(0.09, 8, 6), std(0xff2020, { emissive: 0xff0000, emissiveIntensity: 3 }), 0.25, 0.15, -0.46, false);
  T.head.add(T.eye);
  T.pitch = new THREE.Group(); T.pitch.position.set(0, -0.02, -0.4); T.head.add(T.pitch);
  T.spin = new THREE.Group(); T.pitch.add(T.spin);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const b = mesh(cyl(0.05, 0.05, 1.1, 8), dark, Math.cos(a) * 0.09, Math.sin(a) * 0.09, -0.55, false);
    b.rotation.x = Math.PI / 2; T.spin.add(b);
  }
  T.spin.add(mesh(cyl(0.16, 0.16, 0.2, 10), armor, 0, 0, -0.2, false).rotateX(Math.PI / 2));
  T.muzzle = new THREE.Group(); T.muzzle.position.set(0, 0, -1.15); T.pitch.add(T.muzzle);
  T.flash = new THREE.Mesh(sph(0.16, 8, 6), glow(0xffc860, 1)); T.flash.scale.set(1, 1, 2.2); T.flash.visible = false; T.muzzle.add(T.flash);
  T.laser = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, -0.5), glow(0xff2020, 0.7));
  T.laser.frustumCulled = false;
  T.muzzle.add(T.laser);
  T.root.traverse((o) => { if (o.isMesh && o !== T.laser && o !== T.flash) o.castShadow = true; });
  T.headMat = bakeRig([T.root, T.head, T.spin], new Set([T.eye]), { metalness: 0.7, roughness: 0.35 });
  return T;
}

export function createExplosiveBarrel() {
  const red = std(0xc0201a, { roughness: 0.45, metalness: 0.4 }), dark = std(0x2a2a2a, { roughness: 0.5, metalness: 0.5 });
  const g = new THREE.Group();
  g.add(mesh(cyl(0.45, 0.45, 1.25, 14), red, 0, 0.625, 0));
  for (const y of [0.3, 0.95]) g.add(mesh(cyl(0.465, 0.465, 0.06, 14), dark, 0, y, 0, false));
  const label = mesh(box(0.42, 0.3, 0.02), std(0xffd020, { emissive: 0x332200, emissiveIntensity: 0.4 }), 0, 0.62, -0.45, false);
  g.add(label);
  g.add(mesh(box(0.12, 0.12, 0.02), std(0x111111), 0, 0.64, -0.465, false));
  g.add(mesh(cyl(0.08, 0.08, 0.06, 8), dark, 0.2, 1.27, 0, false));
  bakeRig([g], new Set(), { metalness: 0.4, roughness: 0.45 });
  return g;
}

// Small projectile meshes (shared geometry/materials: these are spawned every shot)
let noteParts = null, lanceParts = null;
export function createNote() {
  if (!noteParts) noteParts = {
    ring: new THREE.TorusGeometry(0.3, 0.05, 6, 20), ring2: new THREE.TorusGeometry(0.18, 0.04, 6, 16),
    pink: glow(0xff8ad8, 0.9), cyan: glow(0x8fe6ff, 0.9), white: glow(0xffffff, 1),
  };
  const N = noteParts;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(N.ring, N.pink), new THREE.Mesh(N.ring2, N.cyan));
  const note = new THREE.Group();
  note.add(new THREE.Mesh(sph(0.08, 8, 6), N.white));
  const stem = new THREE.Mesh(box(0.025, 0.25, 0.025), N.white); stem.position.set(0.07, 0.12, 0); note.add(stem);
  g.add(note);
  return g;
}

export function createLance() {
  if (!lanceParts) lanceParts = { tipGeo: new THREE.OctahedronGeometry(0.16), tip: glow(0xfff2b0, 1), core: glow(0xffd34a, 0.9) };
  const L = lanceParts;
  const g = new THREE.Group();
  const tip = new THREE.Mesh(L.tipGeo, L.tip); tip.scale.set(0.6, 0.6, 3.2); g.add(tip);
  const core = new THREE.Mesh(box(0.05, 0.05, 1.2), L.core); core.position.z = 0.45; g.add(core);
  return g;
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
  P.starMat = starMat;
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
