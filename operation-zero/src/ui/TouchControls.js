// ================================================================
// TOUCH CONTROLS — jogar no celular/tablet:
//  - joystick flutuante (metade esquerda): movimento analógico;
//    empurrar até o fim para frente = correr
//  - arrastar na metade direita: mirar/olhar (também arrastando o
//    dedo sobre o botão de tiro, como nos FPS mobile)
//  - botões: tiro (dois), mira (alterna), pular, agachar, recarregar,
//    granada, trocar granada, faca, trocar arma, modo de disparo,
//    interagir (contextual), lanterna, ordem, placar, mapa, loja, pausa
// Tudo vira eventos do Input, então o resto do jogo não muda.
// ================================================================

const ICON = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" stroke-width="2"/></svg>',
  ads: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
};

const BUTTONS = [
  // id, rótulo, classe de posição, ação
  ['fire', ICON.fire, 'b-fire', 'fire'],
  ['fireL', ICON.fire, 'b-fireL', 'fire'],
  ['ads', ICON.ads, 'b-ads', 'ads'],
  ['jump', 'PULAR', 'b-jump', 'jump'],
  ['crouch', 'AGACHAR', 'b-crouch', 'crouch'],
  ['reload', 'R', 'b-reload', 'reload'],
  ['grenade', '💣', 'b-grenade', 'grenade'],
  ['cycle', '⇄', 'b-cycle', 'cycleGrenade'],
  ['melee', '🗡', 'b-melee', 'melee'],
  ['swap', '1⇆2', 'b-swap', 'swap'],
  ['interact', 'E', 'b-interact', 'interact'],
];
const TOPBAR = [
  ['pause', '❚❚', 'pause'], ['map', 'MAPA', 'map'], ['score', 'PLACAR', 'scoreboard'],
  ['light', '🔦', 'flashlight'], ['mode', 'MODO', 'fireMode'], ['order', 'ORDEM', 'order'], ['shop', 'LOJA', 'inventory'],
];

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.root = document.createElement('div');
    this.root.id = 'touch';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="t-look"></div>
      <div class="t-stick hidden"><div class="t-knob"></div></div>
      <div class="t-stick-hint">MOVER</div>
      ${BUTTONS.map(([id, label, cls]) => `<div class="tbtn ${cls}" data-b="${id}">${label}</div>`).join('')}
      <div class="t-top">${TOPBAR.map(([id, label]) => `<div class="tbtn small" data-b="${id}">${label}</div>`).join('')}</div>
      <div class="t-rotate">Gire o aparelho para a horizontal</div>`;
    document.body.appendChild(this.root);
    this.stick = this.root.querySelector('.t-stick');
    this.knob = this.root.querySelector('.t-knob');
    this.btn = {};
    this.root.querySelectorAll('[data-b]').forEach((el) => { this.btn[el.dataset.b] = el; });
    this.pointers = new Map(); // pointerId -> { kind, ... }
    this.adsOn = false;
    // Bloqueia rolagem/zoom e os eventos de mouse emulados
    this.root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    this.root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('pointerdown', (e) => this.down(e));
    addEventListener('pointermove', (e) => this.move(e), { passive: true });
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e));
    game.events.on('frame', () => this.update());
    // Vibração (resposta tátil)
    const buzz = (ms) => { if (this.enabled && game.settings.haptics && navigator.vibrate && game.state === 'playing') try { navigator.vibrate(ms); } catch (e) { /* */ } };
    game.events.on('damage', (e) => { if (e.attacker === game.player && e.victim !== game.player) buzz(e.region === 'head' ? 18 : 8); else if (e.victim === game.player) buzz(Math.min(60, 15 + e.dmg)); });
    game.events.on('kill', (e) => { if (e.killer === game.player && e.victim !== game.player) buzz([25, 40, 25]); });
    game.events.on('shot', (e) => { if (e.who === game.player && ['sniper', 'shotgun', 'lmg'].includes(e.weapon.cls)) buzz(12); });
    // Giroscópio: girar o aparelho move a mira
    this.onMotion = (ev) => {
      const r = ev.rotationRate; if (!r) return;
      const dt = (ev.interval > 1 ? ev.interval / 1000 : ev.interval) || 1 / 60;
      const angle = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
      const D = Math.PI / 180;
      let yaw, pitch;
      if (angle === 90) { yaw = (r.beta || 0); pitch = (r.gamma || 0); }
      else if (angle === 270 || angle === -90) { yaw = -(r.beta || 0); pitch = -(r.gamma || 0); }
      else { yaw = (r.alpha || 0) * 0 + (r.gamma || 0); pitch = (r.beta || 0); }
      if (this.game.state !== 'playing') return;
      this.input.gyro.yaw += yaw * D * dt; this.input.gyro.pitch += pitch * D * dt;
    };
    if (game.settings.gyro) this.enableGyro(false);
    game.events.on('matchStart', () => this.reset());
    for (const ev of ['pause', 'matchEnd', 'choice', 'menu']) game.events.on(ev, () => { this.reset(); this.root.classList.add('hidden'); });
    this.applySettings();
  }

  // Liga o giroscópio (no iOS precisa de permissão, pedida a partir de um toque).
  async enableGyro(ask = true) {
    try {
      if (ask && typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') return false;
      }
      removeEventListener('devicemotion', this.onMotion);
      addEventListener('devicemotion', this.onMotion);
      return true;
    } catch (e) { return false; }
  }
  disableGyro() { removeEventListener('devicemotion', this.onMotion); }

  get enabled() {
    const m = this.game.settings.touchControls;
    return m === 'on' || (m === 'auto' && this.game.isTouchDevice);
  }
  applySettings() {
    const s = this.game.settings;
    this.root.style.setProperty('--tscale', s.touchScale ?? 1);
    this.root.style.setProperty('--topa', s.touchOpacity ?? 0.55);
    document.body.classList.toggle('touch', this.enabled);
  }
  reset() {
    this.pointers.clear();
    this.adsOn = false;
    this.input.mouse.left = this.input.mouse.right = false;
    this.input.touch.moveX = this.input.touch.moveY = 0;
    this.stick.classList.add('hidden');
    for (const el of Object.values(this.btn)) el.classList.remove('on', 'pressed');
  }

  down(e) {
    if (!this.enabled || this.game.state !== 'playing') return;
    e.preventDefault();
    const inp = this.input;
    const el = e.target.closest('[data-b]');
    const p = { kind: 'look', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
    if (el) {
      const b = el.dataset.b;
      el.classList.add('pressed');
      p.kind = 'btn'; p.b = b; p.el = el;
      if (b === 'fire' || b === 'fireL') { inp.mouse.left = true; inp.mouse.leftPressed = true; p.look = b === 'fire'; }
      else if (b === 'ads') { this.adsOn = !this.adsOn; inp.mouse.right = this.adsOn; }
      else if (b === 'swap') inp.mouse.wheel += 1;
      else if (b === 'pause') this.game.pause();
      else if (b === 'score') inp.hold('scoreboard', true);
      else if (b === 'map') inp.tap('map');
      else if (b === 'shop') inp.tap('inventory');
      else {
        const action = BUTTONS.find((x) => x[0] === b)?.[3] || TOPBAR.find((x) => x[0] === b)?.[2];
        if (action) inp.tap(action);
      }
    } else if (e.clientX < innerWidth * 0.42) {
      // joystick flutuante: nasce onde o dedo tocou
      p.kind = 'stick';
      this.stick.classList.remove('hidden');
      this.stick.style.left = `${e.clientX}px`; this.stick.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(-50%,-50%)';
    }
    inp.touch.active = true;
    this.pointers.set(e.pointerId, p);
    try { e.target.setPointerCapture?.(e.pointerId); } catch (_) { /* */ }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const inp = this.input;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (p.kind === 'stick') {
      const R = 56 * (this.game.settings.touchScale ?? 1);
      let ox = e.clientX - p.sx, oy = e.clientY - p.sy;
      const L = Math.hypot(ox, oy);
      if (L > R) { ox *= R / L; oy *= R / L; }
      inp.touch.moveX = ox / R; inp.touch.moveY = oy / R;
      this.knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
    } else if (p.kind === 'look' || p.look) {
      // olhar: converte arrasto em delta de "mouse"
      const k = 1.35 * (this.game.settings.touchSens ?? 1);
      inp.mouse.dx += dx * k; inp.mouse.dy += dy * k;
    }
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    const inp = this.input;
    if (p.kind === 'stick') {
      inp.touch.moveX = inp.touch.moveY = 0;
      this.stick.classList.add('hidden');
    } else if (p.kind === 'btn') {
      p.el.classList.remove('pressed');
      if (p.b === 'fire' || p.b === 'fireL') {
        const stillFiring = [...this.pointers.values()].some((q) => q.b === 'fire' || q.b === 'fireL');
        if (!stillFiring) inp.mouse.left = false;
      }
      if (p.b === 'score') inp.hold('scoreboard', false);
    }
  }

  update() {
    const g = this.game;
    const show = this.enabled && g.state === 'playing' && !!g.player && !g.shopOpen;
    this.root.classList.toggle('hidden', !show);
    document.body.classList.toggle('touch', this.enabled);
    if (!show) { if (this.pointers.size) this.reset(); this.input.touch.active = this.enabled && !!g.shopOpen; return; }
    this.input.touch.active = true;
    const p = g.player;
    // a mira alterna; desliga sozinha ao correr, recarregar ou morrer
    if (this.adsOn && (!p.alive || p.sprinting || p.weapon.reloading > 0)) { this.adsOn = false; this.input.mouse.right = false; }
    this.btn.ads.classList.toggle('on', this.adsOn);
    this.btn.crouch.classList.toggle('on', p.crouchT > 0.5);
    this.btn.light.classList.toggle('on', !!g.weather.flashlightOn);
    const prompt = g.mode?.prompt?.();
    this.btn.interact.classList.toggle('hidden', !prompt);
    this.btn.shop.classList.toggle('hidden', !(g.mode?.buy && g.mode.inBreak));
    this.btn.order.classList.toggle('hidden', !g.combatants.some((c) => c.alive && c.brain?.opts.ally));
    const inVehicle = !!p.vehicle;
    for (const id of ['fire', 'fireL', 'ads', 'reload', 'grenade', 'cycle', 'melee', 'swap', 'crouch']) this.btn[id].classList.toggle('hidden', inVehicle || !p.alive);
    this.btn.jump.textContent = inVehicle ? 'FREIO' : 'PULAR';
    if (inVehicle) this.input.hold('jump', [...this.pointers.values()].some((q) => q.b === 'jump'));
    this.btn.grenade.textContent = { frag: '💣', smoke: '☁', flash: '✸' }[p.grenadeType] + (p.grenades[p.grenadeType] || 0);
  }
}
