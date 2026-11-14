const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyC', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyQ', 'Digit1', 'Digit2', 'Digit3']);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressedSet = new Set();
    this.mouse = { left: false, right: false };
    this.dx = 0; this.dy = 0;
    this.locked = false;
    this.enabled = false; // only capture keys while in-game

    addEventListener('keydown', (e) => {
      if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressedSet.add(e.code);
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); });
    addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) { this.mouse.left = true; this.pressedSet.add('Mouse0'); }
      if (e.button === 2) { this.mouse.right = true; this.pressedSet.add('Mouse2'); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Guard against occasional huge spikes some browsers emit on lock.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => this.reset());
  }

  isDown(c) { return this.down.has(c); }
  pressed(c) { return this.pressedSet.has(c); }
  reset() { this.down.clear(); this.pressedSet.clear(); this.mouse.left = this.mouse.right = false; this.dx = this.dy = 0; }
  endFrame() { this.pressedSet.clear(); this.dx = 0; this.dy = 0; }
}
