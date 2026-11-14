import * as THREE from 'three';
import { buildWorld, enemySpawns, ZONES } from './world.js';
import { raycastWorld } from './collision.js';
import { FX } from './effects.js';
import { AudioFX } from './audio.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { Player } from './player.js';
import { Hostage } from './hostages.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { HEROES } from './heroes.js';
import { createHero, createHammer } from './models.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  $('loading').innerHTML = '<p>Il tuo browser non supporta WebGL: impossibile avviare il gioco.</p>';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1000);
scene.add(camera);

const G = {
  scene, camera, renderer,
  input: new Input(),
  audio: new AudioFX(),
  hud: new HUD(),
  fx: new FX(scene, camera),
  cam: { yaw: 0, pitch: -0.12 },
  aim: { point: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), enemy: null, part: null, world: null, worldDist: Infinity },
  state: 'menu',
  time: 0,
  player: null,
  hostages: [],
  hazards: [],
  saved: 0,
  endT: -1,
  heroId: 'web',
  stats: { start: 0, kills: 0 },
  wasLocked: false,
};
G.enemies = new EnemyManager(G);
G.projectiles = new Projectiles(G);
const world = buildWorld(scene);

G.onEnemyKilled = () => {
  G.stats.kills++;
  const left = G.enemies.aliveCount;
  if (G.state === 'playing') G.hud.toast(left > 0 ? `Bandito eliminato — ne restano ${left}` : 'Tutti i banditi eliminati!', 'good', 1500);
};
G.onPlayerDeath = () => {
  G.hud.toast('Sei stato sconfitto…', 'bad', 2000);
  G.audio.setThrust(0);
  G.endT = 2.2;
  G.endWin = false;
};

function resetEntities() {
  G.enemies.reset(enemySpawns());
  for (const h of G.hostages) h.dispose();
  G.hostages = [new Hostage(G, ZONES.A, Math.PI / 2), new Hostage(G, ZONES.B, Math.PI * 0.25)];
  G.projectiles.clear();
  G.fx.clear();
  G.hazards = [];
  G.hud.clearMarkers();
}
resetEntities();

// ---------- Menu & hero cards ----------
const preview = (() => {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  r.setPixelRatio(1);
  r.setSize(240, 280);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xdde8ff, 0x302820, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.6); d.position.set(2, 3, -3); s.add(d);
  const back = new THREE.DirectionalLight(0x88aaff, 1.5); back.position.set(-2, 2, 3); s.add(back);
  const cam = new THREE.PerspectiveCamera(32, 240 / 280, 0.1, 50);
  cam.position.set(0, 1.3, -4.4); cam.lookAt(0, 1.0, 0);
  const models = {};
  for (const id of Object.keys(HEROES)) {
    const m = createHero(id);
    if (id === 'thor') {
      const h = createHammer();
      m.handR.add(h); h.rotation.set(Math.PI, 0, 0);
    }
    if (id === 'iron') { for (const f of m.flames) f.visible = true; m.armL.rotation.z = -0.25; m.armR.rotation.z = 0.25; }
    m.root.visible = false;
    s.add(m.root);
    models[id] = m;
  }
  return { r, s, cam, models, ctx: {} };
})();

function buildMenu() {
  const wrap = $('hero-cards');
  wrap.innerHTML = '';
  for (const h of Object.values(HEROES)) {
    const card = document.createElement('div');
    card.className = 'hero-card' + (h.id === G.heroId ? ' selected' : '');
    card.style.setProperty('--hc', h.color);
    card.dataset.id = h.id;
    const stats = Object.entries(h.stats).map(([k, v]) => `<div class="stat"><span>${k}</span><div class="stat-bar"><i style="width:${v * 20}%"></i></div></div>`).join('');
    const powers = h.powers.map((p) => `<li><span class="kbd">${p.key}</span><div><div class="pw-name">${p.name}</div><div class="pw-desc">${p.desc}</div></div></li>`).join('');
    card.innerHTML = `
      <span class="sel-badge">SELEZIONATO</span>
      <div class="hero-top">
        <canvas class="hero-preview" width="240" height="280"></canvas>
        <div><div class="hero-name">${h.name}</div><div class="hero-tag">${h.tagline}</div>
        <div class="hero-stats">${stats}<div class="stat"><span>Vita</span><div class="stat-bar"><i style="width:${(h.hp / 150) * 100}%"></i></div></div></div></div>
      </div>
      <ul class="power-list">${powers}</ul>`;
    card.addEventListener('click', () => {
      G.audio.init(); G.audio.ui();
      G.heroId = h.id;
      document.querySelectorAll('.hero-card').forEach((c) => c.classList.toggle('selected', c.dataset.id === h.id));
    });
    card.addEventListener('dblclick', () => startGame(h.id));
    card.addEventListener('mouseenter', () => G.audio.hover());
    wrap.appendChild(card);
    preview.ctx[h.id] = card.querySelector('canvas').getContext('2d');
  }
}
buildMenu();

function renderPreviews(t) {
  for (const id of Object.keys(preview.models)) {
    const m = preview.models[id];
    for (const k of Object.keys(preview.models)) preview.models[k].root.visible = k === id;
    const sel = id === G.heroId;
    m.root.rotation.y = Math.sin(t * 0.7) * 0.6 + (sel ? t * 0.9 : 0);
    m.body.position.y = Math.sin(t * 2) * 0.03;
    if (id === 'thor') m.cape.rotation.x = -0.15 + Math.sin(t * 3) * 0.05;
    if (id === 'iron') for (const f of m.flames) f.scale.y = 0.6 + Math.random() * 0.3;
    preview.r.render(preview.s, preview.cam);
    const ctx = preview.ctx[id];
    ctx.clearRect(0, 0, 240, 280);
    ctx.drawImage(preview.r.domElement, 0, 0);
  }
}

// ---------- Flow ----------
function requestLock() {
  if (document.pointerLockElement === canvas) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (e) { /* pointer lock unavailable: play continues without it */ }
}

function showScreen(id) {
  for (const s of ['menu', 'pause', 'end']) $(s).classList.toggle('hidden', s !== id);
}

function startGame(id) {
  G.audio.init();
  G.audio.ui();
  resetEntities();
  if (G.player) G.player.dispose();
  G.heroId = id;
  G.cam.yaw = 0; G.cam.pitch = -0.12;
  G.player = new Player(G, id);
  G.saved = 0; G.endT = -1;
  G.stats = { start: G.time, kills: 0 };
  G.hud.setupHero(HEROES[id]);
  G.hud.show();
  showScreen(null);
  G.state = 'playing';
  G.input.enabled = true;
  G.input.reset();
  if (document.activeElement) document.activeElement.blur();
  requestLock();
  G.hud.toast('Libera i 2 ostaggi! Segui i fasci di luce.', '', 4000);
}

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.reset();
  G.audio.setThrust(0);
  showScreen('pause');
}

function resumeGame() {
  if (G.state !== 'paused') return;
  G.state = 'playing';
  showScreen(null);
  G.input.reset();
  requestLock();
}

function toMenu() {
  G.state = 'menu';
  G.input.enabled = false;
  G.audio.setThrust(0);
  if (document.pointerLockElement) document.exitPointerLock();
  if (G.player) { G.player.dispose(); G.player = null; }
  resetEntities();
  G.hud.hide();
  showScreen('menu');
}

function endGame(win) {
  G.state = win ? 'won' : 'lost';
  G.input.enabled = false;
  G.audio.setThrust(0);
  if (document.pointerLockElement) document.exitPointerLock();
  const t = Math.round(G.time - G.stats.start);
  const end = $('end');
  end.className = 'screen ' + (win ? 'win' : 'lose');
  $('end-title').textContent = win ? 'MISSIONE COMPIUTA' : 'GAME OVER';
  $('end-sub').textContent = win
    ? `${HEROES[G.heroId].name} ha liberato entrambi gli ostaggi!`
    : 'I banditi hanno avuto la meglio. Riprova!';
  $('end-stats').innerHTML = `
    <div><b>${G.saved}/2</b><span>Ostaggi salvati</span></div>
    <div><b>${G.stats.kills}</b><span>Banditi eliminati</span></div>
    <div><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><span>Tempo</span></div>`;
  if (win) G.audio.victory(); else G.audio.defeat();
}

$('btn-start').addEventListener('click', () => startGame(G.heroId));
$('btn-resume').addEventListener('click', resumeGame);
$('btn-pause-menu').addEventListener('click', () => { G.audio.ui(); toMenu(); });
$('btn-replay').addEventListener('click', () => startGame(G.heroId));
$('btn-change').addEventListener('click', () => { G.audio.ui(); toMenu(); });
canvas.addEventListener('click', () => { if (G.state === 'playing') requestLock(); });

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  G.input.locked = locked;
  if (locked) G.wasLocked = true;
  else if (G.state === 'playing' && G.wasLocked) pauseGame();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && G.state === 'playing' && !G.input.locked) pauseGame();
  if (e.code === 'Enter' && G.state === 'menu') startGame(G.heroId);
});
addEventListener('blur', () => { if (G.state === 'playing' && G.wasLocked) pauseGame(); });

function onResize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', onResize);

// ---------- Camera & aiming ----------
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const camDir = new THREE.Vector3(), camRight = new THREE.Vector3();
const _size = new THREE.Vector2();

function updateCamera(dt) {
  const pl = G.player;
  const { yaw, pitch } = G.cam;
  camDir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  camRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
  const pivot = _v.set(pl.pos.x, pl.pos.y + 1.7, pl.pos.z);
  const desired = _v2.copy(pivot).addScaledVector(camRight, 0.75).addScaledVector(camDir, -3.6);
  desired.y += 0.25;
  const toCam = _v3.subVectors(desired, pivot);
  const len = toCam.length();
  toCam.divideScalar(len);
  const hit = raycastWorld(pivot, toCam, len + 0.3);
  const dist = hit ? Math.max(0.3, hit.t - 0.3) : len;
  camera.position.copy(pivot).addScaledVector(toCam, dist);
  pl.model.root.visible = dist > 0.9;
  if (G.fx.shake > 0) {
    const s = G.fx.shake * 0.25;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  camera.lookAt(_v.copy(camera.position).add(camDir));
  const targetFov = 72 + Math.min(12, Math.max(0, pl.speed - 12) * 0.5);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
}

function computeAim() {
  const A = G.aim, pl = G.player;
  A.dir.copy(camDir);
  const o = camera.position;
  const chest = pl.chestPos(_v);
  const t0 = Math.max(0, _v2.subVectors(chest, o).dot(camDir) - 0.2);
  const start = _v3.copy(o).addScaledVector(camDir, t0);
  const wh = raycastWorld(start, camDir, 400);
  const maxT = wh ? wh.t : 400;
  const eh = G.enemies.raycast(start, camDir, maxT, 0.05);
  A.enemy = eh ? eh.enemy : null;
  A.part = eh ? eh.part : null;
  A.point.copy(start).addScaledVector(camDir, eh ? eh.t : maxT);
  A.world = wh;
  A.worldDist = wh ? wh.point.distanceTo(chest) : Infinity;
}

// ---------- Gameplay update ----------
function updateHazards(dt) {
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i];
    h.t += dt;
    if (h.t >= h.life) { G.hazards.splice(i, 1); continue; }
    const fade = 1 - h.t / h.life;
    h.emitT -= dt;
    if (h.emitT <= 0) {
      h.emitT = 0.06;
      const a = Math.random() * Math.PI * 2, r = Math.random() * h.r * 0.85;
      _v.set(h.pos.x + Math.cos(a) * r, h.pos.y + 0.4 + Math.random() * 1.5, h.pos.z + Math.sin(a) * r);
      G.fx.burst(_v, 1, { colors: [0x7a7a2a, 0x6b5a24, 0x8a8a3a, 0x5d6b22], additive: false, speed: 0.6, life: 2.2, size: 2.4, size1: 4.6, alpha: 0.4 * fade + 0.1, drag: 1, gravity: -0.25, fadeIn: true });
    }
    G.enemies.inRadius(h.pos, h.r, (e) => {
      e.stunT = Math.max(e.stunT, 0.6);
      e.damage(7 * dt, { quiet: true });
    });
  }
}

function updateHostageInteraction(dt) {
  const pl = G.player;
  let near = null;
  if (!pl.dead) {
    for (const h of G.hostages) {
      if (!h.freed && pl.pos.distanceTo(h.pos) < 3.2) { near = h; break; }
    }
  }
  for (const h of G.hostages) if (h !== near) h.progress = 0;
  if (!near) { G.hud.setInteract(false); return; }
  if (G.input.isDown('KeyF')) {
    const before = near.progress;
    near.progress += dt / 1.5;
    if (Math.floor(before * 6) !== Math.floor(near.progress * 6)) G.audio.tick();
    if (near.progress >= 1) {
      near.free();
      G.saved++;
      G.hud.toast(`Ostaggio ${near.zone} (${near.name}) liberato! ${G.saved}/2`, 'good', 3000);
      if (G.saved >= G.hostages.length) {
        G.hud.toast('Tutti gli ostaggi sono in salvo!', 'good', 3000);
        G.endT = 1.8; G.endWin = true;
      }
      G.hud.setInteract(false);
      return;
    }
  } else {
    near.progress = Math.max(0, near.progress - dt * 2);
  }
  G.hud.setInteract(true, near.progress, `Tieni premuto <b>F</b> per liberare l'ostaggio ${near.zone}`);
}

function updateHUD(dt) {
  const pl = G.player, hud = G.hud;
  hud.setHP(pl.hp, pl.maxHp);
  hud.setCounts(G.saved, G.hostages.length, G.enemies.aliveCount);
  hud.setPowers(pl.kit.hud());
  hud.setStatus(pl.kit.status());
  hud.setCrosshair(G.aim.enemy ? 'enemy' : pl.kit.crosshair());
  hud.update(dt, Math.hypot(pl.vel.x, pl.vel.z));
  hud.updateMarkers(G.hostages, camera, pl.pos);
}

function updatePlaying(dt) {
  const inp = G.input;
  if (inp.locked) {
    G.cam.yaw -= inp.dx * 0.0022;
    G.cam.pitch = THREE.MathUtils.clamp(G.cam.pitch - inp.dy * 0.0022, -1.25, 1.2);
  }
  G.player.update(dt);
  G.enemies.update(dt, true);
  G.projectiles.update(dt);
  updateHazards(dt);
  for (const h of G.hostages) h.update(dt);
  updateHostageInteraction(dt);
  updateCamera(dt);
  computeAim();
  G.audio.setListener(G.player.pos);
  G.enemies.updateBars(camera);
  updateHUD(dt);
  if (G.endT > 0) {
    G.endT -= dt;
    if (G.endT <= 0) endGame(G.endWin);
  }
}

function updateMenu(dt) {
  const a = G.time * 0.05;
  camera.position.set(Math.cos(a) * 105, 48 + Math.sin(G.time * 0.2) * 6, Math.sin(a) * 105);
  camera.lookAt(0, 6, 0);
  if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
  G.enemies.update(dt, false);
  for (const h of G.hostages) h.update(dt);
  G.enemies.updateBars(camera);
  if (G.state === 'menu') renderPreviews(G.time);
}

// ---------- Main loop ----------
let last = performance.now();
let firstFrame = true;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (G.state === 'playing') {
    G.time += dt;
    updatePlaying(dt);
    G.fx.update(dt);
  } else if (G.state === 'menu') {
    G.time += dt;
    updateMenu(dt);
    G.fx.update(dt);
  } else if (G.state === 'won' || G.state === 'lost') {
    G.time += dt;
    G.input.reset();
    G.enemies.update(dt, false);
    for (const h of G.hostages) h.update(dt);
    if (G.player) G.player.update(dt);
    G.fx.update(dt);
  }

  const focus = G.player && G.state !== 'menu' ? G.player.pos : _v.set(0, 0, 0);
  world.sun.target.position.set(Math.round(focus.x), 0, Math.round(focus.z));
  world.sun.position.set(world.sun.target.position.x + 55, 75, world.sun.target.position.z - 60);

  renderer.getDrawingBufferSize(_size);
  G.fx.setViewport(_size.y, camera.fov);
  renderer.render(scene, camera);
  G.input.endFrame();

  if (firstFrame) { firstFrame = false; $('loading').classList.add('hidden'); }
}
requestAnimationFrame(frame);

// Exposed for automated smoke tests (module export, not a global).
export { G };
