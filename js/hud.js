import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class HUD {
  constructor() {
    this.root = $('hud');
    this.hpFill = $('hp-fill'); this.hpText = $('hp-text');
    this.heroName = $('hero-name'); this.status = $('status-line');
    this.hostages = $('hostage-count'); this.bandits = $('bandit-count');
    this.toasts = $('toasts'); this.cross = $('crosshair'); this.hit = $('hitmarker');
    this.interact = $('interact'); this.ring = $('interact-ring'); this.interactText = $('interact-text');
    this.powersEl = $('powers'); this.hintsEl = $('hints'); this.vignette = $('damage-vignette');
    this.markersEl = $('markers');
    this.markers = new Map();
    this.cache = {};
    this.spread = 0; this.recoilV = 0; this.dmg = 0;
    this.powerEls = [];
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  set(key, el, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else el.style[prop] = value;
  }

  setupHero(hero) {
    this.cache = {};
    this.heroName.textContent = hero.name;
    this.heroName.style.color = hero.color;
    this.root.style.setProperty('--accent', hero.color);
    this.hintsEl.innerHTML = hero.hints.map(([k, t]) => `<span><b>${k}</b>${t}</span>`).join('');
    this.powersEl.innerHTML = '';
    this.powerEls = [];
    this.toasts.innerHTML = '';
    this.dmg = 0; this.vignette.style.opacity = 0;
  }

  setPowers(list) {
    if (this.powerEls.length !== list.length) {
      this.powersEl.innerHTML = '';
      this.powerEls = list.map(() => {
        const el = document.createElement('div');
        el.className = 'power';
        el.innerHTML = '<span class="pk"></span><div class="pn"></div><div class="ps"></div><div class="pm"><i></i></div>';
        this.powersEl.appendChild(el);
        return { el, k: el.querySelector('.pk'), n: el.querySelector('.pn'), s: el.querySelector('.ps'), m: el.querySelector('.pm i'), c: {} };
      });
    }
    list.forEach((p, i) => {
      const P = this.powerEls[i];
      const upd = (key, val, fn) => { if (P.c[key] !== val) { P.c[key] = val; fn(val); } };
      upd('k', p.key, (v) => (P.k.textContent = v));
      upd('n', p.name, (v) => (P.n.textContent = v));
      upd('s', p.text || '', (v) => (P.s.textContent = v));
      upd('st', p.state, (v) => (P.el.className = 'power ' + v));
      upd('r', Math.round(p.ratio * 100), (v) => (P.m.style.width = v + '%'));
    });
  }

  setHP(hp, max) {
    const k = Math.max(0, hp / max);
    this.set('hpw', this.hpFill, 'width', (k * 100).toFixed(1) + '%');
    this.set('hpt', this.hpText, 'text', `${Math.ceil(Math.max(0, hp))} / ${max}`);
    const low = k < 0.3;
    if (this.cache.low !== low) { this.cache.low = low; this.hpFill.classList.toggle('low', low); }
  }

  setCounts(saved, total, bandits) {
    this.set('hc', this.hostages, 'text', `${saved}/${total}`);
    this.set('bc', this.bandits, 'text', String(bandits));
  }

  setStatus(t) { this.set('st', this.status, 'text', t); }

  setCrosshair(mode) {
    if (this.cache.cm === mode) return;
    this.cache.cm = mode;
    this.cross.className = mode || '';
  }

  toast(msg, type = '', ms = 2200) {
    if (this.toasts.childElementCount > 4) this.toasts.firstChild.remove();
    const last = this.toasts.lastChild;
    if (last && last.textContent === msg && !last.classList.contains('out')) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    this.toasts.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 450);
  }

  hitmarker(kill, head) {
    const h = this.hit;
    h.className = '';
    void h.offsetWidth; // restart animation
    h.className = 'show' + (kill ? ' kill' : head ? ' head' : '');
  }

  damageFlash(amount = 1) { this.dmg = Math.min(1, this.dmg + 0.35 * amount); }
  recoil(px) { this.recoilV = Math.min(26, this.recoilV + px); }

  setInteract(visible, progress = 0, text) {
    if (this.cache.iv !== visible) { this.cache.iv = visible; this.interact.classList.toggle('hidden', !visible); }
    if (!visible) return;
    this.set('ip', this.ring, 'strokeDashoffset', String(264 * (1 - Math.min(1, progress))));
    if (text) this.set('it', this.interactText, 'html', text);
  }

  update(dt, moveSpeed) {
    this.recoilV = Math.max(0, this.recoilV - dt * 60);
    const target = 8 + Math.min(10, moveSpeed * 0.6) + this.recoilV;
    this.spread += (target - this.spread) * Math.min(1, dt * 14);
    this.cross.style.setProperty('--s', this.spread.toFixed(1) + 'px');
    this.dmg = Math.max(0, this.dmg - dt * 1.2);
    this.set('vg', this.vignette, 'opacity', this.dmg.toFixed(2));
  }

  marker(id) {
    let m = this.markers.get(id);
    if (!m) {
      const el = document.createElement('div');
      el.className = 'marker';
      el.innerHTML = `<div class="mk-icon">${id}</div><div class="mk-dist"></div><div class="mk-arrow-wrap"><div class="mk-arrow"></div></div>`;
      this.markersEl.appendChild(el);
      m = { el, dist: el.querySelector('.mk-dist'), arrow: el.querySelector('.mk-arrow-wrap'), c: {} };
      this.markers.set(id, m);
    }
    return m;
  }

  updateMarkers(hostages, camera, from) {
    const w = innerWidth, h = innerHeight, margin = 60;
    for (const hs of hostages) {
      const m = this.marker(hs.zone);
      if (hs.freed) { m.el.style.display = 'none'; continue; }
      m.el.style.display = '';
      const dist = from.distanceTo(hs.pos);
      _v.copy(hs.pos); _v.y += 2.9;
      _v.project(camera);
      const behind = _v.z > 1;
      let x = _v.x, y = _v.y;
      if (behind) { x = -x; y = -y; if (Math.abs(y) < 0.05) y = -1; }
      let sx = (x * 0.5 + 0.5) * w, sy = (-y * 0.5 + 0.5) * h;
      const edge = behind || sx < margin || sx > w - margin || sy < margin || sy > h - margin;
      const cx = w / 2, cy = h / 2;
      const dx = sx - cx, dy = sy - cy;
      if (edge) {
        const s = Math.min((w / 2 - margin) / Math.max(1e-6, Math.abs(dx)), (h / 2 - margin) / Math.max(1e-6, Math.abs(dy)));
        sx = cx + dx * s; sy = cy + dy * s;
        m.arrow.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
      }
      if (m.c.edge !== edge) { m.c.edge = edge; m.el.classList.toggle('edge', edge); }
      m.el.style.left = sx.toFixed(0) + 'px';
      m.el.style.top = sy.toFixed(0) + 'px';
      const txt = `${hs.name} · ${Math.round(dist)} m`;
      if (m.c.t !== txt) { m.c.t = txt; m.dist.textContent = txt; }
    }
  }

  clearMarkers() { this.markersEl.innerHTML = ''; this.markers.clear(); }
}
