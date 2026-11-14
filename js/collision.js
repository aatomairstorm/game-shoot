import * as THREE from 'three';

// Collision world: axis-aligned boxes plus linear ramps, with a uniform grid for point queries.
export const STEP = 0.55;
export const WORLD_HALF = 142.5;
export const boxes = [];
export const ramps = [];

const CELL = 10;
const grid = new Map();
let queryId = 0;
const near = [];
const cellKey = (ix, iz) => (ix + 512) * 1024 + (iz + 512);

function gridInsert(b) {
  const x0 = Math.floor(b.min.x / CELL), x1 = Math.floor(b.max.x / CELL);
  const z0 = Math.floor(b.min.z / CELL), z1 = Math.floor(b.max.z / CELL);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const k = cellKey(ix, iz);
    let c = grid.get(k);
    if (!c) grid.set(k, (c = []));
    c.push(b);
  }
}

// Candidate boxes overlapping the square (x±r, z±r). Returned array is reused.
export function nearBoxes(x, z, r) {
  near.length = 0;
  const q = ++queryId;
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
    const c = grid.get(cellKey(ix, iz));
    if (!c) continue;
    for (let i = 0; i < c.length; i++) {
      const b = c[i];
      if (b._q === q) continue;
      b._q = q;
      near.push(b);
    }
  }
  return near;
}

export function addBox(minX, minY, minZ, maxX, maxY, maxZ, data = {}) {
  const b = { min: new THREE.Vector3(minX, minY, minZ), max: new THREE.Vector3(maxX, maxY, maxZ), _q: 0, ...data };
  boxes.push(b);
  gridInsert(b);
  return b;
}

export function removeBox(b) {
  const i = boxes.indexOf(b);
  if (i < 0) return;
  boxes.splice(i, 1);
  for (const c of grid.values()) {
    const j = c.indexOf(b);
    if (j >= 0) c.splice(j, 1);
  }
}

// r: { minX, maxX, minZ, maxZ, axis: 'x'|'z', dir: 1|-1, base, h }
export function addRamp(r) {
  const len = r.axis === 'x' ? r.maxX - r.minX : r.maxZ - r.minZ;
  r.slope = (r.dir * r.h) / len;
  r.y0 = r.dir > 0 ? r.base : r.base + r.h; // height at min coordinate
  r.normal = r.axis === 'x' ? new THREE.Vector3(-r.slope, 1, 0).normalize() : new THREE.Vector3(0, 1, -r.slope).normalize();
  ramps.push(r);
  return r;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rampHeightAt(r, x, z) {
  const cx = clamp(x, r.minX, r.maxX), cz = clamp(z, r.minZ, r.maxZ);
  return r.y0 + r.slope * (r.axis === 'x' ? cx - r.minX : cz - r.minZ);
}

// Highest walkable surface under (x,z) that is not above y + STEP.
export function groundHeight(x, z, y, radius = 0.45) {
  let best = 0;
  const m = radius * 0.6;
  const list = nearBoxes(x, z, m);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (x < b.min.x - m || x > b.max.x + m || z < b.min.z - m || z > b.max.z + m) continue;
    const top = b.max.y;
    if (top <= y + STEP && top > best) best = top;
  }
  for (let i = 0; i < ramps.length; i++) {
    const r = ramps[i];
    if (x < r.minX - m || x > r.maxX + m || z < r.minZ - m || z > r.maxZ + m) continue;
    const h = rampHeightAt(r, x, z);
    if (h <= y + STEP + 0.25 && h > best) best = h;
  }
  return best;
}

export function ceilingHeight(x, z, y, height, radius = 0.45) {
  let best = Infinity;
  const m = radius * 0.7;
  const list = nearBoxes(x, z, m);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (x < b.min.x - m || x > b.max.x + m || z < b.min.z - m || z > b.max.z + m) continue;
    if (b.min.y >= y + height - 0.05 && b.min.y < best) best = b.min.y;
  }
  return best;
}

const _push = new THREE.Vector3();

function pushOut(p, r, minX, maxX, minZ, maxZ) {
  const cx = clamp(p.x, minX, maxX), cz = clamp(p.z, minZ, maxZ);
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    p.x += dx * k; p.z += dz * k;
    _push.x += dx * k; _push.z += dz * k;
  } else {
    const a = p.x - minX, b = maxX - p.x, c = p.z - minZ, e = maxZ - p.z;
    const mn = Math.min(a, b, c, e);
    const ox = p.x, oz = p.z;
    if (mn === a) p.x = minX - r; else if (mn === b) p.x = maxX + r; else if (mn === c) p.z = minZ - r; else p.z = maxZ + r;
    _push.x += p.x - ox; _push.z += p.z - oz;
  }
  return true;
}

// Push a vertical cylinder (feet at p) out of walls. Returns the push normal or null.
export function resolveHorizontal(p, r, h) {
  _push.set(0, 0, 0);
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    const list = nearBoxes(p.x, p.z, r + 0.5);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (p.y + h <= b.min.y + 0.05 || p.y >= b.max.y - STEP) continue;
      if (pushOut(p, r, b.min.x, b.max.x, b.min.z, b.max.z)) hit = true;
    }
    for (let i = 0; i < ramps.length; i++) {
      const rp = ramps[i];
      if (p.x < rp.minX - r || p.x > rp.maxX + r || p.z < rp.minZ - r || p.z > rp.maxZ + r) continue;
      // Ramp sides act as walls only where the surface is well above the feet.
      if (rampHeightAt(rp, p.x, p.z) <= p.y + STEP + 0.25 || p.y + h <= rp.base) continue;
      if (pushOut(p, r, rp.minX, rp.maxX, rp.minZ, rp.maxZ)) hit = true;
    }
  }
  if (!hit) return null;
  const l = Math.hypot(_push.x, _push.z);
  if (l < 1e-6) return null;
  return _push.set(_push.x / l, 0, _push.z / l);
}

/**
 * Integrate a body { pos, vel, radius, height, onGround } with collisions.
 */
export function moveBody(b, dt, snap = true) {
  const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
  const steps = Math.min(16, Math.max(1, Math.ceil((speed * dt) / 0.3)));
  const h = dt / steps;
  let landed = false, landSpeed = 0, wall = null;
  let grounded = b.onGround;
  for (let i = 0; i < steps; i++) {
    const prevY = b.pos.y;
    b.pos.x += b.vel.x * h;
    b.pos.z += b.vel.z * h;
    const n = resolveHorizontal(b.pos, b.radius, b.height);
    if (n) {
      wall = (wall || new THREE.Vector3()).copy(n);
      const dot = b.vel.x * n.x + b.vel.z * n.z;
      if (dot < 0) { b.vel.x -= n.x * dot; b.vel.z -= n.z * dot; }
    }
    b.pos.y += b.vel.y * h;
    if (b.vel.y > 0) {
      const c = ceilingHeight(b.pos.x, b.pos.z, prevY, b.height, b.radius);
      if (b.pos.y + b.height > c) { b.pos.y = c - b.height; b.vel.y = 0; }
    }
    const g = groundHeight(b.pos.x, b.pos.z, Math.max(prevY, b.pos.y), b.radius);
    if (b.vel.y <= 0 && b.pos.y <= g) {
      if (!grounded) { landed = true; landSpeed = Math.max(landSpeed, -b.vel.y); }
      b.pos.y = g; b.vel.y = 0; grounded = true;
    } else if (snap && grounded && b.vel.y <= 0 && b.pos.y - g < 0.4) {
      b.pos.y = g; b.vel.y = 0;
    } else {
      grounded = false;
    }
  }
  b.onGround = grounded;
  if (b.pos.x > WORLD_HALF) { b.pos.x = WORLD_HALF; b.vel.x = Math.min(0, b.vel.x); }
  if (b.pos.x < -WORLD_HALF) { b.pos.x = -WORLD_HALF; b.vel.x = Math.max(0, b.vel.x); }
  if (b.pos.z > WORLD_HALF) { b.pos.z = WORLD_HALF; b.vel.z = Math.min(0, b.vel.z); }
  if (b.pos.z < -WORLD_HALF) { b.pos.z = -WORLD_HALF; b.vel.z = Math.max(0, b.vel.z); }
  if (b.pos.y > 140) { b.pos.y = 140; b.vel.y = Math.min(0, b.vel.y); }
  return { landed, landSpeed, wall };
}

// ---------- Ray queries ----------
const AX = ['x', 'y', 'z'];

export function rayBox(o, d, b, maxT) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  for (let i = 0; i < 3; i++) {
    const k = AX[i];
    const oi = o[k], di = d[k], mn = b.min[k], mx = b.max[k];
    if (Math.abs(di) < 1e-9) {
      if (oi < mn || oi > mx) return null;
      continue;
    }
    let t1 = (mn - oi) / di, t2 = (mx - oi) / di, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis === -1) return null; // origin inside the box
  return { t: tmin, axis, sign };
}

export function raySphere(o, d, c, r, maxT) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0 || t > maxT) return -1;
  return t;
}

function rayRamp(o, d, r, maxT) {
  const c = r.axis;
  const minC = c === 'x' ? r.minX : r.minZ;
  const denom = d.y - r.slope * d[c];
  if (Math.abs(denom) < 1e-9) return -1;
  const t = (r.y0 + r.slope * (o[c] - minC) - o.y) / denom;
  if (t < 0 || t > maxT) return -1;
  const x = o.x + d.x * t, z = o.z + d.z * t;
  if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) return -1;
  return t;
}

export function raycastWorld(o, d, maxT) {
  let best = maxT, hit = null;
  const normal = new THREE.Vector3();
  if (d.y < -1e-6) {
    const t = -o.y / d.y;
    if (t >= 0 && t < best) { best = t; hit = 'ground'; normal.set(0, 1, 0); }
  }
  for (let i = 0; i < boxes.length; i++) {
    const r = rayBox(o, d, boxes[i], best);
    if (r && r.t < best) {
      best = r.t; hit = boxes[i];
      normal.set(0, 0, 0); normal[AX[r.axis]] = r.sign;
    }
  }
  for (let i = 0; i < ramps.length; i++) {
    const t = rayRamp(o, d, ramps[i], best);
    if (t >= 0 && t < best) { best = t; hit = ramps[i]; normal.copy(ramps[i].normal); }
  }
  if (!hit) return null;
  return {
    t: best,
    point: new THREE.Vector3(o.x + d.x * best, o.y + d.y * best, o.z + d.z * best),
    normal,
    box: hit !== 'ground' && hit.min ? hit : null,
    ground: hit === 'ground',
  };
}

// True when the segment a→b is unobstructed by world geometry.
const _d = new THREE.Vector3();
export function lineOfSight(a, b) {
  _d.subVectors(b, a);
  const len = _d.length();
  if (len < 1e-4) return true;
  _d.divideScalar(len);
  return raycastWorld(a, _d, len - 0.05) === null;
}
