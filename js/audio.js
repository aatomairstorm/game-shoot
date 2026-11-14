// Procedural sound effects via Web Audio API (no audio files).
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0 };
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0.6;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Looping thruster rumble, gain driven by setThrust()
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    this.thrFilter = c.createBiquadFilter();
    this.thrFilter.type = 'bandpass'; this.thrFilter.frequency.value = 500; this.thrFilter.Q.value = 0.7;
    this.thrGain = c.createGain(); this.thrGain.gain.value = 0;
    src.connect(this.thrFilter).connect(this.thrGain).connect(this.master);
    src.start();
  }

  setListener(p) { this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z; }

  att(pos) {
    if (!pos) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    return Math.pow(Math.max(0, 1 - d / 95), 1.6);
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx;
    if (!c || vol < 0.002) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, vol, ftype, f0, f1, q = 1, delay = 0, attack = 0.005) {
    const c = this.ctx;
    if (!c || vol < 0.002) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // ----- Sounds -----
  ui() { this.tone('triangle', 660, 990, 0.08, 0.12); }
  hover() { this.tone('sine', 880, 880, 0.04, 0.04); }
  jump() { this.tone('square', 220, 440, 0.12, 0.05); this.noise(0.12, 0.08, 'highpass', 1500, 3000); }
  doubleJump() { this.tone('square', 330, 760, 0.14, 0.05); this.noise(0.2, 0.1, 'bandpass', 2000, 5000, 2); }

  webShot() {
    this.noise(0.12, 0.22, 'highpass', 3500, 7000, 0.8);
    this.tone('triangle', 1400, 500, 0.09, 0.07);
  }
  grapple() {
    this.noise(0.28, 0.3, 'bandpass', 3000, 700, 1.5);
    this.tone('sine', 1100, 180, 0.3, 0.12);
  }
  grappleMiss() { this.tone('sine', 420, 200, 0.18, 0.08); }
  webHit(pos) { this.noise(0.15, 0.18 * this.att(pos), 'bandpass', 1200, 400, 2); }

  hammerThrow() {
    this.noise(0.45, 0.35, 'bandpass', 300, 1600, 2.5);
    this.tone('sawtooth', 140, 60, 0.3, 0.07);
  }
  hammerImpact(pos) {
    const a = this.att(pos);
    this.noise(0.5, 0.7 * a, 'lowpass', 900, 80, 1);
    this.tone('sine', 95, 38, 0.45, 0.55 * a);
  }
  electric(pos, vol = 1) {
    const a = this.att(pos) * vol;
    for (let i = 0; i < 6; i++) this.noise(0.04 + Math.random() * 0.05, 0.25 * a, 'highpass', 2500, 4000, 1, i * 0.04 + Math.random() * 0.03);
    this.tone('square', 62, 58, 0.3, 0.06 * a);
  }
  recall() {
    this.tone('sawtooth', 80, 420, 0.7, 0.09);
    this.noise(0.7, 0.2, 'bandpass', 400, 2400, 3);
    this.electric(null, 0.8);
  }
  hammerCatch() { this.tone('sine', 220, 110, 0.18, 0.25); this.noise(0.1, 0.25, 'lowpass', 1200, 300); }
  superJump() {
    this.noise(0.5, 0.35, 'lowpass', 300, 2600, 1);
    this.tone('sawtooth', 70, 260, 0.4, 0.1);
  }
  shockwave(pos) {
    const a = this.att(pos);
    this.noise(1.0, 0.9 * a, 'lowpass', 1400, 50, 0.8);
    this.tone('sine', 70, 28, 0.9, 0.7 * a);
    this.electric(pos, 0.6);
  }

  laser() {
    this.tone('sawtooth', 1900, 260, 0.16, 0.08);
    this.tone('sine', 2600, 900, 0.12, 0.08);
  }
  explosion(pos, size = 1) {
    const a = this.att(pos);
    this.noise(0.6 * size + 0.2, 0.6 * a, 'lowpass', 2200, 70, 0.8);
    this.tone('sine', 85, 30, 0.5 * size + 0.2, 0.45 * a);
  }
  flightOn() { this.tone('sawtooth', 120, 520, 0.5, 0.08); this.noise(0.5, 0.25, 'bandpass', 300, 1800, 1.2); }
  flightOff() { this.tone('sawtooth', 420, 110, 0.4, 0.07); }
  setThrust(level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.thrGain.gain.setTargetAtTime(level * 0.22, t, 0.08);
    this.thrFilter.frequency.setTargetAtTime(350 + level * 700, t, 0.1);
  }

  // Comic rear blast: wobbling low sawtooth through a resonant filter.
  fart() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const dur = 0.75 + Math.random() * 0.35;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(115 + Math.random() * 30, t);
    o.frequency.linearRampToValueAtTime(62, t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = 24 + Math.random() * 10;
    const lfoG = c.createGain(); lfoG.gain.value = 32;
    lfo.connect(lfoG).connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650; f.Q.value = 7;
    const am = c.createGain(); am.gain.value = 0.7;
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 13;
    const lfo2G = c.createGain(); lfo2G.gain.value = 0.3;
    lfo2.connect(lfo2G).connect(am.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.03);
    g.gain.setValueAtTime(0.5, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(am).connect(g).connect(this.master);
    for (const n of [o, lfo, lfo2]) { n.start(t); n.stop(t + dur + 0.05); }
    this.noise(dur, 0.18, 'bandpass', 220, 120, 2.5);
    this.tone('sine', 300, 900, 0.12, 0.06, dur + 0.05); // comic "squeak" at the end
  }
  plop(pos) {
    const a = this.att(pos);
    this.tone('sine', 320, 70, 0.22, 0.3 * a);
    this.noise(0.5, 0.4 * a, 'lowpass', 700, 90, 1.5);
  }

  gunshot(pos) {
    const a = this.att(pos);
    if (a < 0.01) return;
    this.noise(0.14, 0.32 * a, 'bandpass', 1700, 350, 0.7);
    this.tone('square', 150, 55, 0.07, 0.07 * a);
  }
  whiz() { this.noise(0.12, 0.07, 'bandpass', 4000, 1500, 4); }
  ricochet(pos) { this.noise(0.08, 0.1 * this.att(pos), 'highpass', 3000, 5000, 1); }
  hurt() { this.tone('sawtooth', 210, 110, 0.16, 0.12); this.noise(0.12, 0.15, 'lowpass', 1200, 300); }
  hit(head) { this.tone('triangle', head ? 1500 : 950, head ? 1500 : 950, 0.05, head ? 0.16 : 0.1); }
  enemyDeath(pos) { const a = this.att(pos); this.tone('sawtooth', 300, 70, 0.45, 0.12 * a); this.noise(0.3, 0.15 * a, 'lowpass', 900, 150); }
  enemyAlert(pos) { const a = this.att(pos); this.tone('square', 600, 600, 0.07, 0.05 * a); this.tone('square', 800, 800, 0.07, 0.05 * a, 0.09); }
  freed() { [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.25, 0.14, i * 0.09)); }
  victory() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone('square', f, f, 0.3, 0.07, i * 0.14)); }
  defeat() { [392, 349, 311, 262].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.45, 0.08, i * 0.25)); }
  tick() { this.tone('sine', 1200, 1200, 0.03, 0.03); }
}
