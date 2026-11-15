// ================================================================
// INPUT — teclado + mouse com Pointer Lock. Mapeamento configurável.
// ================================================================

export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', crouch: 'KeyC', crouch2: 'ControlLeft', jump: 'Space',
  reload: 'KeyR', interact: 'KeyE', grenade: 'KeyG', cycleGrenade: 'KeyX',
  melee: 'KeyV', fireMode: 'KeyB', flashlight: 'KeyF', scoreboard: 'Tab', map: 'KeyM',
  slot1: 'Digit1', slot2: 'Digit2', order: 'KeyQ', inventory: 'KeyI', streak: 'KeyT',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    // Estado virtual dos controles de toque (joystick analógico)
    this.touch = { active: false, moveX: 0, moveY: 0 };
    this.gyro = { yaw: 0, pitch: 0 }; // rotação acumulada do giroscópio (rad)
    this.locked = false;
    this.binds = { ...DEFAULT_BINDS };
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || (this.locked && (e.code === 'Space' || e.code.startsWith('Arrow')))) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (this.touch.active) return; // eventos de mouse emulados pelo toque
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange?.(this.locked);
    });
  }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(action) { return this.keys.has(this.binds[action]); }
  hit(action) { return this.pressed.has(this.binds[action]); }
  hitCode(code) { return this.pressed.has(code); }
  // Botões virtuais (toque): "aperta" uma ação como se fosse a tecla mapeada.
  tap(action) { const c = this.binds[action] || action; this.pressed.add(c); }
  hold(action, on) { const c = this.binds[action] || action; if (on) { if (!this.keys.has(c)) this.pressed.add(c); this.keys.add(c); } else this.keys.delete(c); }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0; this.mouse.leftPressed = false; this.mouse.wheel = 0;
  }
}
