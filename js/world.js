import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addBox, addRamp } from './collision.js';

export const ZONES = {
  A: { pos: new THREE.Vector3(-58, 0, 51), label: 'A', name: 'Magazzino' },
  B: { pos: new THREE.Vector3(55, 22, -50), label: 'B', name: 'Torre' },
};
export const PLAYER_SPAWN = new THREE.Vector3(0, 0, 16);

// Automatic turrets: x, y (surface height), z
export const TURRET_SPOTS = [
  [-66, 6.45, 46], [-55, 0, 25], [60.5, 22, -50], [61, 11, -35], [24, 16, -29],
  [-41, 18, -5], [-13, 26, 23], [0, 20, -112], [112, 18, 40], [30, 0, -78],
];
// Red explosive barrels
export const BARREL_SPOTS = [
  [-48, 42], [-68, 33], [-44, 36.5], [48, -66], [42, -56], [14, -8.4], [-12, 30], [64.6, 41],
  [30, -10], [0, -98], [100, -88], [110, 62], [-100, 2], [-60, 108], [40, 100], [-8, -66],
];

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function speckle(g, w, h, n, colors, rnd, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    g.globalAlpha = 0.25 + rnd() * 0.5;
    const s = 1 + rnd() * size;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
  g.globalAlpha = 1;
}

function makeTextures() {
  const rnd = seeded(1337);
  const T = {};
  T.asphalt = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#3b3f45'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, ['#2c2f34', '#4a4f56', '#55595f', '#30343a'], rnd, 2);
    g.strokeStyle = 'rgba(20,22,25,.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgba(15,16,18,.35)';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 30, 10 + rnd() * 20, rnd() * 3, 0, 7); g.fill(); }
  });
  T.concrete = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8d8a84'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4000, ['#7a776f', '#a09d96', '#6e6b65'], rnd, 2);
    g.strokeStyle = 'rgba(60,58,55,.5)'; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  });
  T.roof = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5b5d61'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, ['#4b4d51', '#6a6c70', '#444649'], rnd, 3);
    g.strokeStyle = 'rgba(30,30,32,.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  });
  T.tiles = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a948a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const v = 140 + ((rnd() * 30) | 0);
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30);
    }
  });
  T.metal = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4f55'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#363a3f'; g.lineWidth = 3;
    for (let i = 0; i < w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, h); g.stroke(); }
    g.fillStyle = '#e0b020'; g.fillRect(0, 0, w, 14); g.fillStyle = '#111';
    for (let i = 0; i < w; i += 28) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 14, 0); g.lineTo(i + 4, 14); g.lineTo(i - 10, 14); g.fill(); }
  });
  T.barrier = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#c9c5bc'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, ['#a8a49b', '#dad6ce'], rnd, 2);
    g.fillStyle = '#c4231c';
    for (let x = -32; x < w + 32; x += 32) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 16, 8); g.lineTo(x + 32, 28); g.lineTo(x + 16, 28); g.fill(); }
  });
  T.crate = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#9c6c38'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6e4a24'; g.lineWidth = 3;
    for (let y = 0; y < h; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = 10; g.strokeStyle = '#7c522a'; g.strokeRect(5, 5, w - 10, h - 10);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
  });
  T.container = ['#b4372b', '#2f6b9a', '#3f7a3a', '#c98a1f'].map((col) => canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) {
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, 0, 3, h);
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 5, 0, 2, h);
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    speckle(g, w, h, 600, ['#5a3a20', '#3a2a1a'], rnd, 3);
  }));

  // Facades: 4x4 window grid (one tile = 16m wide, 14m tall), with emissive lit windows.
  const walls = ['#a39581', '#6d7b89', '#9b5f48', '#8a8f7a'];
  T.facade = []; T.lit = [];
  walls.forEach((wc) => {
    const litCells = [];
    T.facade.push(canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = wc; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, ['rgba(0,0,0,.4)', 'rgba(255,255,255,.3)'], rnd, 2);
      for (let r = 0; r < 4; r++) {
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, r * 128 + 124, w, 4);
        for (let c = 0; c < 4; c++) {
          const x = c * 128 + 26, y = r * 128 + 30;
          const gr = g.createLinearGradient(x, y, x + 76, y + 70);
          gr.addColorStop(0, '#2a3d52'); gr.addColorStop(0.55, '#16222f'); gr.addColorStop(1, '#4a6680');
          g.fillStyle = '#d8d4cc'; g.fillRect(x - 4, y - 4, 84, 78);
          g.fillStyle = gr; g.fillRect(x, y, 76, 70);
          g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 36, y, 4, 70);
          g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x - 6, y + 72, 88, 6);
          litCells.push([x, y, rnd() < 0.32]);
        }
      }
    }));
    T.lit.push(canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (const [x, y, on] of litCells) {
        if (!on) continue;
        const v = 0.55 + rnd() * 0.45;
        g.fillStyle = `rgba(255,${(200 * v) | 0},${(120 * v) | 0},${v})`;
        g.fillRect(x, y, 76, 70);
      }
    }));
  });
  return T;
}

function repeatTex(t, rx, ry) {
  const c = t.clone();
  c.repeat.set(rx, ry);
  return c;
}

export function buildWorld(scene) {
  const T = makeTextures();
  const rnd = seeded(4242);
  const shadowObjs = [];

  const add = (mesh, cast = true, receive = true) => {
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    scene.add(mesh); shadowObjs.push(mesh);
    return mesh;
  };

  // ---------- Sky, fog and lights (only 2 lights in the whole scene) ----------
  scene.background = new THREE.Color(0x8fa6bf);
  scene.fog = new THREE.Fog(0xa7b4c2, 160, 560);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(700, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { sunDir: { value: new THREE.Vector3(0.55, 0.35, -0.75).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sunDir; varying vec3 vP;
        void main(){
          float h = clamp(vP.y, -0.1, 1.0);
          vec3 top = vec3(0.16,0.32,0.58), mid = vec3(0.55,0.66,0.80), hor = vec3(0.98,0.78,0.58);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.75, h));
          float s = max(dot(vP, sunDir), 0.0);
          c += vec3(1.0,0.75,0.45) * pow(s, 18.0) * 0.6 + vec3(1.0,0.95,0.85) * pow(s, 900.0) * 3.0;
          gl_FragColor = vec4(c, 1.0);
        }`,
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a4a3c, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0bb, 2.9);
  sun.position.set(55, 70, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ---------- Ground ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(330, 330), new THREE.MeshStandardMaterial({ map: repeatTex(T.asphalt, 33, 33), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  add(ground, false, true);

  const flat = (w, d, x, z, tex, rx, ry, y = 0.03, color = 0xffffff) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: repeatTex(tex, rx, ry), roughness: 0.9, color, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
    return add(m, false, true);
  };

  // Road markings
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8d36a, polygonOffset: true, polygonOffsetFactor: -3 });
  const dash = new THREE.PlaneGeometry(0.25, 3);
  const dashAt = (x, z, rotZ) => {
    const m = new THREE.Mesh(dash, lineMat); m.rotation.x = -Math.PI / 2; m.rotation.z = rotZ; m.position.set(x, 0.035, z);
    add(m, false, true);
  };
  for (let z = -138; z <= 138; z += 6) {
    if (Math.abs(z) < 18) continue;
    dashAt(30, z, 0);
    if (Math.abs(z) < 100) dashAt(-100, z, 0);
  }
  for (let x = -138; x <= 138; x += 6) {
    if (Math.abs(x) < 18 || (x < -38 && x > -100)) continue;
    dashAt(x, 42, Math.PI / 2);
    dashAt(x, -88, Math.PI / 2);
  }

  // ---------- Materials ----------
  const mats = {
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ map: repeatTex(T.concrete, 20, 2), roughness: 0.9, color: 0xb0aca4 }),
    crate: new THREE.MeshStandardMaterial({ map: T.crate, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x6c737c, roughness: 0.45, metalness: 0.6 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.5, metalness: 0.5 }),
    ac: new THREE.MeshStandardMaterial({ color: 0xa8adb3, roughness: 0.5, metalness: 0.4 }),
    tank: new THREE.MeshStandardMaterial({ color: 0xdedbd4, roughness: 0.4, metalness: 0.3 }),
    ramp: new THREE.MeshStandardMaterial({ map: T.metal, roughness: 0.6, metalness: 0.4 }),
    containers: T.container.map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.3 })),
    barrel: [new THREE.MeshStandardMaterial({ color: 0xb02a20, roughness: 0.5, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0x2a5aa0, roughness: 0.5, metalness: 0.4 })],
    lampPole: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.6 }),
    lampBulb: new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd890, emissiveIntensity: 2 }),
    barrier: new THREE.MeshStandardMaterial({ map: T.barrier, roughness: 0.85 }),
  };

  const solidBox = (w, h, d, x, y, z, mat, data) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    add(m);
    addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, data);
    return m;
  };

  // ---------- Buildings ----------
  const buildings = [];
  function building(cx, cz, w, d, h, variant, opts = {}) {
    const mk = (rx) => new THREE.MeshStandardMaterial({
      map: repeatTex(T.facade[variant], rx, h / 14), emissiveMap: repeatTex(T.lit[variant], rx, h / 14),
      emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.82, metalness: 0.05,
    });
    const mx = mk(d / 16), mz = mk(w / 16);
    const roofM = new THREE.MeshStandardMaterial({ map: repeatTex(T.roof, w / 8, d / 8), roughness: 0.95 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mx, mx, roofM, roofM, mz, mz]);
    mesh.position.set(cx, h / 2, cz);
    add(mesh);
    addBox(cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2, { building: true });
    // Cornice (visual)
    const cor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), mats.darkMetal);
    cor.position.set(cx, h - 0.2, cz); add(cor);
    // Sidewalk
    flat(w + 5, d + 5, cx, cz, T.concrete, (w + 5) / 3, (d + 5) / 3, 0.025, 0xb8b4ac);

    const ph = opts.parapet ?? 0.45;
    const t = 0.35;
    if (ph > 0) {
      solidBox(w, ph, t, cx, h, cz - d / 2 + t / 2, mats.concrete);
      solidBox(w, ph, t, cx, h, cz + d / 2 - t / 2, mats.concrete);
      solidBox(t, ph, d - 2 * t, cx - w / 2 + t / 2, h, cz, mats.concrete);
      solidBox(t, ph, d - 2 * t, cx + w / 2 - t / 2, h, cz, mats.concrete);
    }
    if (!opts.noProps) {
      const n = 1 + ((rnd() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const px = cx + (rnd() - 0.5) * (w - 6), pz = cz + (rnd() - 0.5) * (d - 6);
        solidBox(2, 1.2, 1.5, px, h, pz, mats.ac);
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), mats.darkMetal);
        fan.position.set(px, h + 1.25, pz); add(fan);
      }
      if (rnd() < 0.6) {
        const px = cx + (rnd() - 0.5) * (w - 7), pz = cz + (rnd() - 0.5) * (d - 7);
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 16), mats.tank);
        tank.position.set(px, h + 1.0 + 1.1, pz); add(tank);
        for (const [ox, oz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), mats.darkMetal);
          leg.position.set(px + ox, h + 0.5, pz + oz); add(leg);
        }
        addBox(px - 1.2, h, pz - 1.2, px + 1.2, h + 3.2, pz + 1.2);
      }
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4, 6), mats.darkMetal);
      ant.position.set(cx + w / 2 - 1.5, h + 2, cz + d / 2 - 1.5); add(ant);
    }
    buildings.push({ cx, cz, w, d, h });
    return mesh;
  }

  function ramp(r, width, thin = false) {
    const len = r.axis === 'x' ? r.maxX - r.minX : r.maxZ - r.minZ;
    let geo, m;
    if (thin) {
      // Elevated walkway: a thin slab sheared along its slope.
      geo = new THREE.BoxGeometry(r.axis === 'x' ? len : width, 0.3, r.axis === 'x' ? width : len);
      const pos = geo.attributes.position;
      const slope = (r.dir * r.h) / len;
      for (let i = 0; i < pos.count; i++) {
        const c = r.axis === 'x' ? pos.getX(i) : pos.getZ(i);
        pos.setY(i, pos.getY(i) + slope * (c + len / 2));
      }
      geo.computeVertexNormals();
      m = new THREE.Mesh(geo, mats.ramp);
      m.position.set((r.minX + r.maxX) / 2, (r.dir > 0 ? r.base : r.base + r.h) - 0.15, (r.minZ + r.maxZ) / 2);
    } else {
      geo = new THREE.BoxGeometry(r.axis === 'x' ? len : width, r.h, r.axis === 'x' ? width : len);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const c = r.axis === 'x' ? pos.getX(i) : pos.getZ(i);
        const lowEnd = r.dir > 0 ? c < 0 : c > 0;
        if (lowEnd && pos.getY(i) > 0) pos.setY(i, -r.h / 2 + 0.05);
      }
      geo.computeVertexNormals();
      m = new THREE.Mesh(geo, mats.ramp);
      m.position.set((r.minX + r.maxX) / 2, r.base + r.h / 2, (r.minZ + r.maxZ) / 2);
    }
    add(m);
    addRamp(r);
    // Side rails
    const railGeo = new THREE.CylinderGeometry(0.05, 0.05, Math.hypot(len, r.h), 6);
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2;
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, mats.lampPole);
      rail.position.set(cx + (r.axis === 'z' ? s * width / 2 : 0), r.base + r.h / 2 + 1, cz + (r.axis === 'x' ? s * width / 2 : 0));
      const ang = Math.atan2(r.h, len) * r.dir;
      if (r.axis === 'x') rail.rotation.z = Math.PI / 2 + ang; else rail.rotation.x = Math.PI / 2 - ang;
      add(rail, true, false);
    }
    if (thin) {
      // Support pylons every ~12 m
      const n = Math.max(1, Math.floor(len / 12));
      for (let i = 1; i <= n; i++) {
        const k = i / (n + 1);
        const x = r.axis === 'x' ? r.minX + len * k : cx, z = r.axis === 'z' ? r.minZ + len * k : cz;
        const top = r.base + (r.dir > 0 ? k : 1 - k) * r.h - 0.3;
        solidBox(0.5, top, 0.5, x, 0, z, mats.darkMetal);
      }
    }
  }

  const barricade = (x, z, rot = false) => {
    const w = rot ? 0.7 : 3.2, d = rot ? 3.2 : 0.7;
    solidBox(w, 0.35, d, x, 0, z, mats.concrete);
    solidBox(rot ? 0.45 : 3.2, 0.8, rot ? 3.2 : 0.45, x, 0.35, z, mats.barrier);
  };

  const laserTraps = [];
  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const laserGeo = new THREE.BoxGeometry(1, 0.05, 0.05);
  function laserTrap(ax, az, bx, bz, period = 3, offset = 0) {
    solidBox(0.35, 2.1, 0.35, ax, 0, az, mats.darkMetal);
    solidBox(0.35, 2.1, 0.35, bx, 0, bz, mats.darkMetal);
    const len = Math.hypot(bx - ax, bz - az);
    const beams = [];
    for (const y of [0.45, 1.05, 1.65]) {
      const b = new THREE.Mesh(laserGeo, laserMat);
      b.position.set((ax + bx) / 2, y, (az + bz) / 2);
      b.scale.x = len;
      b.rotation.y = -Math.atan2(bz - az, bx - ax);
      scene.add(b);
      beams.push(b);
    }
    for (const [x, z] of [[ax, az], [bx, bz]]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.4), new THREE.MeshBasicMaterial({ color: 0xff3040 }));
      lamp.position.set(x, 2.15, z); scene.add(lamp);
      beams.push(lamp);
    }
    laserTraps.push({ a: new THREE.Vector2(ax, az), b: new THREE.Vector2(bx, bz), beams, period, offset, on: true });
  }

  const container = (x, z, rot, ci, y = 0) => {
    const w = rot ? 2.44 : 6.1, d = rot ? 6.1 : 2.44, h = 2.6;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.containers[ci % 4]);
    mesh.position.set(x, y + h / 2, z); add(mesh);
    addBox(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
  };
  const crate = (x, z, s = 1.4, y = 0) => solidBox(s, s, s, x, y, z, mats.crate);
  const barrel = (x, z, ci = 0) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.25, 14), mats.barrel[ci]);
    b.position.set(x, 0.625, z); add(b);
    addBox(x - 0.45, 0, z - 0.45, x + 0.45, 1.25, z + 0.45);
  };
  const lamp = (x, z) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6, 8), mats.lampPole);
    pole.position.set(x, 3, z); add(pole, true, false);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), mats.lampPole);
    arm.position.set(x + 0.6, 6, z); add(arm, true, false);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), mats.lampBulb);
    bulb.position.set(x + 1.2, 5.9, z); scene.add(bulb);
    addBox(x - 0.15, 0, z - 0.15, x + 0.15, 6, z + 0.15);
  };
  const fuelTank = (x, z) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 9, 28), mats.tank);
    t.position.set(x, 4.5, z); add(t);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.55, 3.55, 0.6, 28), mats.barrel[0]);
    band.position.set(x, 6.5, z); add(band);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 3.5, 1.2, 28), mats.tank);
    top.position.set(x, 9.6, z); add(top);
    addBox(x - 3.1, 0, z - 3.1, x + 3.1, 9, z + 3.1);
  };

  // Perimeter walls
  const H = 144;
  solidBox(2 * H + 4, 9, 2, 0, 0, -H - 1, mats.wall);
  solidBox(2 * H + 4, 9, 2, 0, 0, H + 1, mats.wall);
  solidBox(2, 9, 2 * H, -H - 1, 0, 0, mats.wall);
  solidBox(2, 9, 2 * H, H + 1, 0, 0, mats.wall);

  // City buildings (inner district)
  building(-50, -45, 18, 14, 14, 0);
  building(-20, -55, 14, 12, 9, 2);
  building(-45, 0, 14, 16, 18, 1);
  building(-15, 20, 10, 10, 26, 3);
  building(20, 25, 14, 20, 12, 0);
  building(55, 25, 18, 14, 8, 2);
  building(20, -25, 12, 12, 16, 1);
  building(-10, -20, 12, 8, 6, 3);
  building(60, 70, 20, 14, 10, 1);
  building(-5, 72, 16, 10, 7, 2);
  building(-80, 75, 14, 14, 13, 0);
  building(82, -2, 12, 18, 15, 3);

  // Outer districts
  building(-120, -110, 20, 16, 16, 1);
  building(-90, -120, 14, 14, 11, 2);
  building(0, -115, 24, 14, 20, 0);
  building(35, -118, 14, 14, 13, 3);
  building(110, -110, 16, 16, 24, 1);
  building(120, -65, 14, 18, 12, 2);
  building(115, 40, 18, 14, 18, 0);
  building(118, 95, 16, 18, 9, 3);
  building(70, 120, 20, 12, 14, 2);
  building(20, 118, 14, 14, 8, 1);
  building(-40, 118, 18, 14, 17, 3);
  building(-115, 30, 14, 20, 21, 1);
  building(-118, -30, 16, 14, 10, 0);
  building(-118, 110, 12, 12, 12, 2);

  // Zone B: tower with terrace + annex
  building(55, -50, 16, 16, 22, 1, { parapet: 1.1, noProps: true });
  building(55, -37, 16, 10, 11, 0, { parapet: 0.45, noProps: true });

  // Ramps from the street
  ramp({ minX: 25, maxX: 47, minZ: -40, maxZ: -34, axis: 'x', dir: 1, base: 0, h: 11 }, 6);
  ramp({ minX: 50, maxX: 56, minZ: 2, maxZ: 18, axis: 'z', dir: 1, base: 0, h: 8 }, 6);
  ramp({ minX: -28, maxX: -16, minZ: -23, maxZ: -17, axis: 'x', dir: 1, base: 0, h: 6 }, 6);
  ramp({ minX: -9, maxX: -1, minZ: 77, maxZ: 89, axis: 'z', dir: -1, base: 0, h: 7 }, 6);
  ramp({ minX: -110, maxX: -94, minZ: -32, maxZ: -27, axis: 'x', dir: -1, base: 0, h: 10 }, 5);
  ramp({ minX: 15, maxX: 20, minZ: 95, maxZ: 111, axis: 'z', dir: 1, base: 0, h: 8 }, 5);

  // Elevated walkways between rooftops
  ramp({ minX: -41, maxX: -27, minZ: -51.5, maxZ: -49.2, axis: 'x', dir: -1, base: 9, h: 5 }, 2.3, true);
  ramp({ minX: 27, maxX: 46, minZ: 23.5, maxZ: 26.5, axis: 'x', dir: -1, base: 8, h: 4 }, 3, true);
  ramp({ minX: -4, maxX: 14, minZ: -22.5, maxZ: -19.5, axis: 'x', dir: 1, base: 6, h: 10 }, 3, true);
  ramp({ minX: 27, maxX: 60, minZ: 118.5, maxZ: 121.5, axis: 'x', dir: -1, base: 8, h: 6 }, 3, true);
  ramp({ minX: -117.5, maxX: -114.5, minZ: -23, maxZ: 20, axis: 'z', dir: 1, base: 10, h: 11 }, 3, true);
  ramp({ minX: -110, maxX: -97, minZ: -117, maxZ: -114, axis: 'x', dir: -1, base: 11, h: 5 }, 3, true);
  ramp({ minX: 12, maxX: 28, minZ: -118, maxZ: -115, axis: 'x', dir: -1, base: 13, h: 7 }, 3, true);

  // Concrete barricades
  for (const [x, z, r] of [
    [-60, 21, 0], [-49, 21, 0], [-36, 40, 1], [-36, 47, 1], [44, -72, 0], [56, -74, 0], [66, -72, 0],
    [36, -48, 1], [30, -60, 1], [26, 60, 0], [-30, 92, 0], [0, -92, 0], [8, -92, 0], [100, -40, 1],
    [98, 22, 1], [-92, -62, 0], [-88, 44, 1], [62, 100, 0], [-20, 100, 0], [120, 10, 1], [-130, 70, 0],
  ]) barricade(x, z, !!r);

  // Laser trap gates (blinking)
  laserTrap(-58, 30.3, -52, 30.3, 3.2, 0);
  laserTrap(-40.3, 41, -40.3, 49, 2.6, 1.1);
  laserTrap(32, -58, 32, -46, 3.0, 0.6);
  laserTrap(-12, -92, -4, -92, 2.4, 0.3);
  laserTrap(96, 58, 104, 58, 2.8, 1.5);
  laserTrap(-104, 50, -96, 50, 3.4, 0.9);

  // Zone A: walled courtyard with open warehouse shed
  flat(30, 30, -55, 45, T.concrete, 10, 10, 0.03, 0xa8a49b);
  const cw = (w, d, x, z) => solidBox(w, 3.5, d, x, 0, z, mats.wall);
  cw(30, 0.6, -55, 59.7);
  cw(0.6, 30, -69.7, 45);
  cw(12, 0.6, -64, 30.3); cw(12, 0.6, -46, 30.3);
  cw(0.6, 11, -40.3, 35.5); cw(0.6, 11, -40.3, 54.5);
  for (const [px, pz] of [[-66, 45], [-50, 45], [-66, 57], [-50, 57], [-58, 45], [-58, 57]]) solidBox(0.5, 6, 0.5, px, 0, pz, mats.metal);
  solidBox(18, 0.45, 14, -58, 6, 51, mats.ramp);
  crate(-52, 36); crate(-52, 37.4, 1.4); crate(-52, 36, 1.2, 1.4);
  crate(-63, 38); crate(-64.5, 38);
  crate(-46, 48); crate(-46, 49.5); crate(-46, 48, 1.2, 1.4);
  crate(-66, 52, 1.4); crate(-62, 55, 1.2);
  barrel(-47, 43.2, 1);
  container(-62, 33.5, false, 0);

  // Central plaza + fountain
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(16, 48), new THREE.MeshStandardMaterial({ map: repeatTex(T.tiles, 6, 6), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; add(plaza, false, true);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.2, 0.8, 32), mats.concrete);
  basin.position.set(0, 0.4, 0); add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.1, 32), new THREE.MeshStandardMaterial({ color: 0x3a8ab8, roughness: 0.1, metalness: 0.3, emissive: 0x0a2a40 }));
  water.position.set(0, 0.72, 0); scene.add(water);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 16), mats.concrete);
  pillar.position.set(0, 1.2, 0); add(pillar);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.6, 0.5, 20), mats.concrete);
  bowl.position.set(0, 2.5, 0); add(bowl);
  addBox(-2.85, 0, -2.85, 2.85, 0.8, 2.85);
  addBox(-4, 0, -1.66, 4, 0.8, 1.66);
  addBox(-1.66, 0, -4, 1.66, 0.8, 4);
  addBox(-0.6, 0, -0.6, 0.6, 2.75, 0.6);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    lamp(Math.cos(a) * 15, Math.sin(a) * 15);
  }

  // Industrial props & cover
  container(30, -5, false, 1); container(30, -2.4, false, 2); container(30, -3.7, false, 3, 2.6);
  container(-25, 40, true, 0); container(-22, 40, true, 1);
  container(10, 50, false, 2); container(40, 45, true, 3); container(70, -14, true, 0); container(70, -14, true, 2, 2.6);
  container(-75, -20, false, 1); container(-30, -35, true, 3); container(-75, 20, true, 2);
  container(38, -62, false, 0); container(38, -59.4, false, 3);
  fuelTank(78, -55); fuelTank(78, -40); fuelTank(-82, -50);
  crate(8, 8); crate(9.4, 8); crate(8.7, 8, 1.2, 1.4);
  crate(-9, -6); crate(-10.4, -6.6); crate(12, -10); crate(-8, 10);
  crate(44, -48); crate(44, -46.6); crate(44, -48, 1.2, 1.4);
  crate(64, -64); crate(66, -64); crate(45, -26);
  crate(35, 15); crate(-30, 10); crate(-30, 11.4); crate(5, 35); crate(6.4, 35);
  crate(-35, -60); crate(60, 45); crate(70, 50); crate(-60, 15); crate(-62, -25);
  barrel(15, -7, 1); barrel(49.2, -67, 1); barrel(64, 40, 1);

  // Zone B roof cover
  const roofY = 22;
  crate(50.5, -45, 1.3, roofY); crate(59.5, -55, 1.3, roofY); crate(59.5, -45.5, 1.3, roofY);
  solidBox(3, 1.2, 0.6, 51, roofY, -55.5, mats.metal);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 8, 6), mats.darkMetal);
  tower.position.set(61.5, roofY + 4, -42.5); add(tower);

  // Distant skyline (visual only)
  const skyMat = [0, 1, 2, 3].map((v) => new THREE.MeshStandardMaterial({ map: repeatTex(T.facade[v], 1.5, 3), emissiveMap: repeatTex(T.lit[v], 1.5, 3), emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.9 }));
  for (let i = 0; i < 52; i++) {
    const a = (i / 52) * Math.PI * 2 + rnd() * 0.1;
    const r = 190 + rnd() * 70;
    const w = 16 + rnd() * 20, h = 30 + rnd() * 70;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat[i % 4]);
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    m.rotation.y = rnd() * Math.PI;
    add(m, false, false);
  }

  mergeStatic(scene, shadowObjs);
  return { sun, hemi, buildings, laserTraps };
}

// Bake every static single-material mesh into one mesh per (material, shadow flags) to cut draw calls.
function mergeStatic(scene, meshes) {
  const groups = new Map();
  for (const m of meshes) {
    if (Array.isArray(m.material)) continue;
    m.updateMatrixWorld(true);
    const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [], src: [] }));
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    g.geos.push(geo);
    g.src.push(m);
  }
  for (const g of groups.values()) {
    if (g.geos.length < 2) continue;
    const allIndexed = g.geos.every((x) => x.index);
    const geos = allIndexed ? g.geos : g.geos.map((x) => (x.index ? x.toNonIndexed() : x));
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    for (const m of g.src) scene.remove(m);
    for (const x of g.geos) x.dispose();
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast; mesh.receiveShadow = g.receive;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
}

// Enemy spawn definitions
export function enemySpawns() {
  const towerRoof = { minX: 48.5, maxX: 61.5, minZ: -56.5, maxZ: -43.5, y: 22 };
  const annexRoof = { minX: 48, maxX: 62, minZ: -41, maxZ: -33, y: 11 };
  const shedRoof = { minX: -66, maxX: -50, minZ: 45, maxZ: 57, y: 6.45 };
  const b5Roof = { minX: 14, maxX: 26, minZ: 16, maxZ: 34, y: 12 };
  const b1Roof = { minX: -58, maxX: -42, minZ: -51, maxZ: -39, y: 14 };
  const n7Roof = { minX: 107, maxX: 123, minZ: 34, maxZ: 46, y: 18 };
  const n12Roof = { minX: -121, maxX: -109, minZ: 21, maxZ: 39, y: 21 };
  return [
    // Zone A
    { x: -50, z: 40, r: 5 }, { x: -62, z: 41, r: 5 }, { x: -47, z: 53, r: 4 }, { x: -63, z: 50, r: 3 },
    { x: -54, z: 34, r: 4 },
    { x: -58, y: 6.45, z: 50, platform: shedRoof },
    { x: -54, z: 47, r: 3, boss: 'armored' },
    // Zone B
    { x: 52.5, y: 22, z: -44.5, platform: towerRoof }, { x: 57.5, y: 22, z: -44.5, platform: towerRoof },
    { x: 49.5, y: 22, z: -53, platform: towerRoof }, { x: 58, y: 22, z: -52.5, platform: towerRoof },
    { x: 55, y: 11, z: -36, platform: annexRoof },
    { x: 42, z: -52, r: 5 }, { x: 55, z: -66, r: 6 },
    { x: 51.5, y: 22, z: -49.5, platform: towerRoof, boss: 'commander' },
    // Patrols
    { x: 6, z: 22, r: 8 }, { x: 22, z: 2, r: 8 }, { x: -26, z: -6, r: 7 }, { x: 36, z: 52, r: 8 }, { x: -5, z: -40, r: 8 },
    { x: 20, y: 12, z: 25, platform: b5Roof }, { x: -50, y: 14, z: -45, platform: b1Roof },
    // Outer districts
    { x: 0, z: -96, r: 8 }, { x: 95, z: -92, r: 8 }, { x: 100, z: 72, r: 8 }, { x: -95, z: 62, r: 8 },
    { x: -92, z: -82, r: 8 }, { x: 48, z: 104, r: 8 },
    { x: 115, y: 18, z: 42, platform: n7Roof }, { x: -115, y: 21, z: 26, platform: n12Roof },
  ];
}
