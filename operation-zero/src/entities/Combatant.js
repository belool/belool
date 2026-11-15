import * as THREE from 'three';
import { WeaponInstance } from '../combat/WeaponInstance.js';
import { WEAPONS } from '../combat/weapons.js';
import { SoldierModel } from './SoldierModel.js';
import { clamp, rand } from '../core/util.js';

// ================================================================
// COMBATANT — ator único para jogador, aliados, inimigos e chefes.
// É controlado por "intenções" (intent) preenchidas por um controlador:
// PlayerController (teclado/mouse), AIBrain (IA) ou, no futuro, rede.
// Isso deixa a simulação pronta para multiplayer autoritativo.
// ================================================================

export const MOVE = { walk: 4.6, sprint: 7.0, crouch: 2.4, accel: 45, airAccel: 7, jump: 6.3, gravity: 18, radius: 0.35, stand: 1.8, crouchH: 1.2 };
const DEG = Math.PI / 180;
let NEXT_ID = 1;

export function newIntent() {
  return { forward: 0, right: 0, sprint: false, crouch: false, jump: false, fire: false, firePressed: false, ads: false, reload: false, switchTo: -1, throw: null, melee: false, interact: false };
}

export class Combatant {
  constructor(game, o) {
    this.game = game;
    this.id = NEXT_ID++;
    this.name = o.name || 'Soldado';
    this.team = o.team ?? 1;
    this.isPlayer = !!o.isPlayer;
    this.isBoss = !!o.boss;
    this.role = o.role || 'rifleman';
    this.pos = new THREE.Vector3(o.x ?? 0, o.y ?? 0, o.z ?? 0);
    this.vel = new THREE.Vector3();
    this.yaw = o.yaw ?? 0; this.pitch = 0;
    this.onGround = true;
    this.crouchT = 0;
    this.height = MOVE.stand;
    this.maxHealth = o.health ?? 100;
    this.health = this.maxHealth;
    this.armor = o.armor ?? 0;
    this.maxArmor = 100;
    this.alive = true;
    this.intent = newIntent();
    this.weapons = [];
    this.slot = 0;
    this.switchTimer = 0;
    this.knife = new WeaponInstance('knife');
    this.meleeTimer = 0;
    this.grenades = { frag: 2, smoke: 1, flash: 1, ...(o.grenades || {}) };
    this.grenadeType = 'frag';
    this.throwCooldown = 0;
    this.ads = 0; // 0..1 transição de mira
    this.recoilP = 0;
    this.flashed = 0;
    this.suppression = 0;
    this.lastDamage = -99;
    this.lastShot = -99;
    this.regen = o.regen ?? this.isPlayer;
    this.damageBy = new Map();
    this.stats = { kills: 0, deaths: 0, assists: 0, score: 0, headshots: 0, damage: 0, shots: 0, hits: 0 };
    this.spawnProtect = 0;
    this.speedMul = o.speedMul ?? 1;
    this.damageTakenMul = o.damageTakenMul ?? 1;
    this.stepAcc = 0;
    this.brain = null;
    this.deadTime = 0;
    this.aimError = new THREE.Vector2();
    this.flashlight = false;
    if (o.loadout) this.setLoadout(o.loadout);
    if (!this.isPlayer) {
      this.model = new SoldierModel(this.team, { scale: o.scale ?? (this.isBoss ? 1.18 : 1), colors: o.colors });
      game.scene.add(this.model.group);
      this.syncModel(0);
    }
  }

  setLoadout(l) {
    this.weapons = [];
    for (const k of ['primary', 'secondary']) {
      const w = l[k];
      if (w && WEAPONS[w.id]) this.weapons.push(new WeaponInstance(w.id, w.att || {}, w.ammo || 'fmj', w.camo || 'none'));
    }
    if (l.equipment) this.grenades = { frag: 0, smoke: 0, flash: 0, ...l.equipment };
    this.slot = 0;
    this.game.events.emit('weaponChanged', this);
  }
  get weapon() { return this.weapons[this.slot] || this.knife; }

  eyeHeight() { return this.height - 0.14; }
  eyePos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeHeight(), this.pos.z); }
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  chestPos(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z); }

  // Hitboxes por região corporal (em coordenadas de mundo).
  hitboxes() {
    const k = this.height / MOVE.stand, x = this.pos.x, y = this.pos.y, z = this.pos.z;
    const sc = this.isBoss ? 1.18 : 1;
    if (!this._hb) this._hb = [
      { region: 'head', c: new THREE.Vector3(), r: 0.15 },
      { region: 'chest', min: new THREE.Vector3(), max: new THREE.Vector3() },
      { region: 'stomach', min: new THREE.Vector3(), max: new THREE.Vector3() },
      { region: 'leg', min: new THREE.Vector3(), max: new THREE.Vector3() },
    ];
    const [h, c, s, l] = this._hb;
    h.c.set(x, y + 1.64 * k * sc, z); h.r = 0.15 * sc;
    const w = 0.24 * sc;
    c.min.set(x - w, y + 1.18 * k * sc, z - w); c.max.set(x + w, y + 1.5 * k * sc, z + w);
    s.min.set(x - w * 0.85, y + 0.88 * k * sc, z - w * 0.85); s.max.set(x + w * 0.85, y + 1.18 * k * sc, z + w * 0.85);
    l.min.set(x - 0.2 * sc, y, z - 0.2 * sc); l.max.set(x + 0.2 * sc, y + 0.88 * k * sc, z + 0.2 * sc);
    return this._hb;
  }

  update(dt) {
    if (!this.alive) {
      this.deadTime += dt;
      if (this.model) this.model.animate(dt, 0, 0, 0, false, true);
      return;
    }
    const it = this.intent;
    if (this.proxy) return this.updateProxy(dt);
    if (this.remote) return this.updateRemote(dt);
    if (this.vehicle) {
      this.pos.copy(this.vehicle.pos); this.pos.y += 0.7; this.vel.copy(this.vehicle.vel);
      this.onGround = true;
      if (this.model) this.model.group.visible = false;
      return;
    }
    this.flashed = Math.max(0, this.flashed - dt);
    this.suppression = Math.max(0, this.suppression - dt * 0.5);
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.throwCooldown -= dt;
    this.meleeTimer -= dt;
    // Regeneração de vida (modos arcade)
    if (this.regen && this.game.time - this.lastDamage > 5 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 25 * dt);
    this.updateMovement(dt);
    this.updateWeapon(dt);
    if (this.model) this.syncModel(dt);
  }

  // Cliente: representação interpolada de outro combatente (estado vem do anfitrião).
  updateProxy(dt) {
    const n = this.net;
    const k = 1 - Math.exp(-14 * dt);
    n.pos.addScaledVector(n.vel, dt); // extrapolação leve entre snapshots
    this.pos.lerp(n.pos, k);
    let dy = n.yaw - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * k; this.pitch += (n.pitch - this.pitch) * k;
    this.height = n.h; this.crouchT = (MOVE.stand - this.height) / (MOVE.stand - MOVE.crouchH);
    this.vel.copy(n.vel); this.onGround = true;
    if (!this.alive) this.deadTime += dt;
    if (this.model) this.syncModel(dt);
  }
  // Anfitrião: jogador remoto (posição/mira chegam pela rede; dano e regras ficam aqui).
  updateRemote(dt) {
    this.flashed = Math.max(0, this.flashed - dt);
    this.suppression = Math.max(0, this.suppression - dt * 0.5);
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.meleeTimer -= dt;
    if (this.regen && this.game.time - this.lastDamage > 5 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 25 * dt);
    this.crouchT = (MOVE.stand - this.height) / (MOVE.stand - MOVE.crouchH);
    if (this.model) this.syncModel(dt);
  }

  updateMovement(dt) {
    const it = this.intent;
    const w = this.weapon;
    // Escalada em andamento (pular sobre obstáculo baixo)
    if (this.vault) {
      const v = this.vault;
      v.t += dt;
      const k = Math.min(1, v.t / v.dur);
      this.pos.lerpVectors(v.from, v.to, k);
      this.pos.y += Math.sin(k * Math.PI) * 0.35;
      this.vel.set(0, 0, 0);
      if (k >= 1) { this.vault = null; this.onGround = true; this.vel.copy(v.dir).multiplyScalar(3); this.game.audio.play('land', this.isPlayer ? null : this.pos, 0.5); }
      it.jump = false;
      return;
    }
    // Deslizar: agachar durante a corrida
    if (it.slide && this.sprinting && this.onGround && !this.slideT) {
      this.slideT = 0.9;
      this.slideDir = new THREE.Vector3(this.vel.x, 0, this.vel.z).normalize();
      this.slideSpeed = Math.max(Math.hypot(this.vel.x, this.vel.z), MOVE.sprint) * 1.35;
      this.game.audio.play('slide', this.isPlayer ? null : this.pos, 0.7);
      this.game.events.emit('slide', this);
    }
    it.slide = false;
    if (this.slideT > 0) {
      this.slideT -= dt;
      this.slideSpeed -= 8.5 * dt;
      this.height += clamp(MOVE.crouchH - this.height, -dt * 8, dt * 8);
      this.crouchT = (MOVE.stand - this.height) / (MOVE.stand - MOVE.crouchH);
      // leve controle lateral
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      this.slideDir.x += (it.right * c) * dt * 1.5; this.slideDir.z += (-it.right * s) * dt * 1.5; this.slideDir.normalize();
      this.vel.x = this.slideDir.x * this.slideSpeed; this.vel.z = this.slideDir.z * this.slideSpeed;
      if (it.jump) { this.slideT = 0; this.vel.y = MOVE.jump; this.onGround = false; }
      it.jump = false;
      this.vel.y -= MOVE.gravity * dt;
      const was = this.onGround;
      this.onGround = this.game.world.moveCharacter(this.pos, this.vel, MOVE.radius, this.height, dt, was);
      if (this.slideT <= 0 || this.slideSpeed < 3 || Math.hypot(this.vel.x, this.vel.z) < 2.5) this.slideT = 0;
      this.sprinting = false;
      return;
    }
    // Agachar (altura suave)
    const wantCrouch = it.crouch;
    let targetH = wantCrouch ? MOVE.crouchH : MOVE.stand;
    if (!wantCrouch && this.height < MOVE.stand - 0.01) {
      // verifica espaço para levantar
      const above = this.game.world.query(this.pos.x - 0.3, this.pos.y + this.height, this.pos.z - 0.3, this.pos.x + 0.3, this.pos.y + MOVE.stand + 0.05, this.pos.z + 0.3, []);
      if (above.some((b) => !b.removed && !b.noCollide)) targetH = this.height;
    }
    this.height += clamp(targetH - this.height, -dt * 5, dt * 5);
    this.crouchT = (MOVE.stand - this.height) / (MOVE.stand - MOVE.crouchH);
    // Velocidade alvo
    const sprinting = it.sprint && it.forward > 0.3 && !it.ads && this.crouchT < 0.3;
    this.sprinting = sprinting && this.onGround;
    let speed = this.crouchT > 0.5 ? MOVE.crouch : sprinting ? MOVE.sprint : MOVE.walk;
    speed *= (w.stats.moveMul ?? 1) * this.speedMul;
    if (this.ads > 0.5) speed *= 0.62;
    if (this.suppression > 0.6 && !this.isPlayer) speed *= 0.85;
    let fx = it.right, fz = -it.forward;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = fx * c + fz * s, wz = -fx * s + fz * c;
    const tx = wx * speed, tz = wz * speed;
    const acc = (this.onGround ? MOVE.accel : MOVE.airAccel) * dt;
    this.vel.x += clamp(tx - this.vel.x, -acc, acc);
    this.vel.z += clamp(tz - this.vel.z, -acc, acc);
    if (it.jump && this.onGround && this.crouchT < 0.5) {
      if (!(this.isPlayer && this.tryVault())) { this.vel.y = MOVE.jump; this.onGround = false; this.game.events.emit('jump', this); }
    }
    it.jump = false;
    // Paraquedas (Battle Royale): queda planada
    if (this.parachute) {
      this.vel.y = Math.max(this.vel.y - MOVE.gravity * dt, -9);
      this.vel.x = wx * 16; this.vel.z = wz * 16;
    } else this.vel.y -= MOVE.gravity * dt;
    const wasGround = this.onGround;
    const vy = this.vel.y;
    this.onGround = this.game.world.moveCharacter(this.pos, this.vel, MOVE.radius, this.height, dt, wasGround);
    if (this.onGround && !wasGround) {
      if (this.parachute) this.parachute = false;
      if (vy < -6) this.game.audio.play('land', this.pos, 0.6);
      if (vy < -13 && !this.parachuteGrace) this.takeDamage((-vy - 13) * 9, { attacker: null, region: 'leg', fall: true });
    }
    // passos
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1) {
      this.stepAcc += hs * dt;
      const stride = this.sprinting ? 2.4 : 1.9;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const quiet = this.crouchT > 0.5;
        if (this.isPlayer || this.game.audio.far(this.pos) < 30) this.game.audio.play('step', this.isPlayer ? null : this.pos, quiet ? 0.3 : this.sprinting ? 1 : 0.6);
        if (!quiet) this.game.ai?.noise(this.pos, this.sprinting ? 18 : 9, 'step', this);
      }
    }
  }

  // Escalar: obstáculo à frente com topo entre 0,45 m e 1,35 m e espaço livre em cima.
  tryVault() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const W = this.game.world, p = this.pos;
    // procura o obstáculo entre 0,45 m e 1,2 m à frente
    let hits = [];
    for (const d of [0.45, 0.7, 0.95, 1.2]) {
      const px = p.x + f.x * d, pz = p.z + f.z * d;
      hits = W.query(px - 0.22, p.y + 0.3, pz - 0.22, px + 0.22, p.y + 1.4, pz + 0.22, []).filter((b) => !b.removed && !b.noCollide);
      if (hits.length) break;
    }
    if (!hits.length) return false;
    const top = Math.max(...hits.map((b) => b.max.y));
    const rise = top - p.y;
    if (rise < 0.45 || rise > 1.35) return false;
    // prefere aterrissar além do obstáculo; se for largo, sobe nele
    for (const dist of [2.0, 1.6, 1.05]) {
      const tx = p.x + f.x * dist, tz = p.z + f.z * dist;
      const landY = dist > 1.5 ? p.y : top;
      const blocked = W.query(tx - 0.3, landY + 0.02, tz - 0.3, tx + 0.3, landY + MOVE.stand, tz + 0.3, []).some((b) => !b.removed && !b.noCollide);
      const overTop = W.query(p.x - 0.3, top + 0.02, p.z - 0.3, p.x + 0.3, top + 1.0, p.z + 0.3, []).some((b) => !b.removed && !b.noCollide);
      if (blocked || overTop) continue;
      if (dist > 1.5 && W.query(tx - 0.3, landY - 0.05, tz - 0.3, tx + 0.3, landY + 0.01, tz + 0.3, []).length === 0 && landY > 0.05) continue;
      this.vault = { t: 0, dur: dist > 1.5 ? 0.45 : 0.35, from: p.clone(), to: new THREE.Vector3(tx, landY + 0.01, tz), dir: f };
      this.game.events.emit('vault', this);
      return true;
    }
    return false;
  }

  updateWeapon(dt) {
    const it = this.intent;
    // Troca de arma
    if (it.switchTo >= 0 && it.switchTo !== this.slot && this.weapons[it.switchTo]) {
      this.weapon.cancelReload();
      this.slot = it.switchTo;
      this.switchTimer = 0.45;
      this.game.events.emit('weaponChanged', this);
    }
    it.switchTo = -1;
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    const w = this.weapon;
    if (w.update(dt)) {
      if (this.isPlayer) this.game.audio.play('reload_end', null, 0.6);
    }
    for (const other of this.weapons) if (other !== w) other.cooldown -= dt;
    // Mira (ADS)
    const adsTarget = it.ads && w.reloading <= 0 && !this.sprinting && this.switchTimer <= 0 ? 1 : 0;
    this.ads = clamp(this.ads + (adsTarget ? 1 : -1) * dt / Math.max(0.05, w.stats.adsTime), 0, 1);
    // Recuperação de recuo
    if (this.recoilP > 0) {
      const rec = Math.min(this.recoilP, w.stats.recoil.recovery * DEG * dt * (it.fire ? 0.35 : 1));
      this.pitch -= rec; this.recoilP -= rec;
    }
    // Recarga
    if (it.reload) { if (w.startReload()) this._onReloadStart(w); it.reload = false; }
    if (w.mag === 0 && w.reserve > 0 && w.reloading <= 0 && w.cooldown <= 0 && !w.isMelee && (it.fire || !this.isPlayer)) { if (w.startReload()) this._onReloadStart(w); }
    // Corpo a corpo
    if (it.melee && this.meleeTimer <= 0) { this.melee(); it.melee = false; }
    // Granadas
    if (it.throw && this.throwCooldown <= 0) {
      const type = it.throw === true ? this.grenadeType : it.throw;
      if (this.grenades[type] > 0) {
        this.grenades[type]--;
        this.throwCooldown = 1.0;
        const eye = this.eyePos();
        const f = this.forward();
        f.y += 0.18; f.normalize();
        this.game.throwables.throw(this, type, eye.addScaledVector(f, 0.6), f, this.isPlayer ? 19 : (it.throwPower ?? 16));
        this.game.events.emit('throw', { who: this, type });
      }
    }
    it.throw = null;
    // Disparo
    if (this.switchTimer > 0 || this.sprinting) { it.firePressed = false; return; }
    if (w.isMelee) { if (it.firePressed) this.melee(); it.firePressed = false; return; }
    const mode = w.fireMode;
    let shoot = false;
    if (mode === 'auto') shoot = it.fire;
    else if (mode === 'burst') {
      if (it.firePressed && w.burstLeft <= 0) w.burstLeft = 3;
      shoot = w.burstLeft > 0;
    } else shoot = it.firePressed;
    if (shoot) {
      if (w.canFire()) {
        this.shoot(w);
        if (mode === 'burst') w.burstLeft--;
        if (mode === 'semi' || mode === 'bolt' || mode === 'pump') it.firePressed = false;
      } else if (w.mag === 0 && it.firePressed) {
        if (this.isPlayer) this.game.audio.play('empty', null, 0.5);
        w.burstLeft = 0;
        it.firePressed = false;
      }
    }
    if (w.needsBolt > 0 && w.needsBolt < 0.05 && this.isPlayer) this.game.audio.play('bolt', null, 0.4);
  }

  _onReloadStart(w) {
    this.game.audio.play('reload', this.isPlayer ? null : this.pos, 0.6);
    this.game.events.emit('reload', this);
  }

  currentSpread(w) {
    const s = w.stats;
    const moving = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / MOVE.walk);
    let sp = s.spread.hip * (1 - this.ads) + s.spread.ads * this.ads;
    sp += s.spread.move * moving * (1 - this.ads * 0.6);
    sp += w.bloom * 0.18 * (1 - this.ads * 0.7) * (s.cls === 'shotgun' ? 0 : 1);
    if (this.crouchT > 0.5) sp *= 0.75;
    if (!this.onGround) sp += 4;
    return sp;
  }

  shoot(w) {
    const s = w.stats;
    w.consume();
    this.lastShot = this.game.time;
    this.stats.shots++;
    const eye = this.eyePos();
    const fwd = this.forward();
    const spread = this.currentSpread(w) * DEG;
    // Aim error externo (IA)
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const dirs = [];
    for (let i = 0; i < s.pellets; i++) {
      const r = Math.sqrt(Math.random()) * spread * 0.5, a = Math.random() * Math.PI * 2;
      const d = fwd.clone()
        .addScaledVector(right, Math.cos(a) * Math.tan(r) + this.aimError.x)
        .addScaledVector(up, Math.sin(a) * Math.tan(r) + this.aimError.y)
        .normalize();
      dirs.push(d);
      this.game.ballistics.fire(this, eye, d, s, { tracer: i === 0 || Math.random() < 0.3, dmgMul: this.dmgBoost || 1 });
    }
    if (this.game.netClient) this.game.net.localShot(this, eye, dirs, s);
    // cápsula ejetada (só perto da câmera)
    if (s.cls !== 'melee' && s.mode !== 'bolt' && (this.isPlayer || this.game.audio.far(this.pos) < 25)) {
      const ej = this.muzzleWorld().addScaledVector(fwd, this.isPlayer ? -0.3 : -0.4).addScaledVector(right, this.isPlayer ? 0.12 : 0.05);
      this.game.fx.casing(ej, right, s.cls === 'shotgun' ? 0xa83a2a : 0xc9a24a);
    }
    // Recuo
    const k = (1 - this.ads * 0.25) * (this.crouchT > 0.5 ? 0.82 : 1) * (this.isPlayer ? 1 : 0.4);
    const vk = s.recoil.vert * DEG * k * rand(0.85, 1.15);
    this.pitch = clamp(this.pitch + vk, -1.45, 1.45);
    this.recoilP += vk;
    this.yaw += s.recoil.horiz * DEG * k * rand(-1, 1);
    // Efeitos e ruído
    const muzzle = this.muzzleWorld();
    if (!s.suppressed) {
      this.game.fx.muzzle(muzzle, fwd, s.cls === 'shotgun' || s.cls === 'sniper' ? 1.6 : 1);
      this.game.fx.flash(muzzle, 0xffb060, this.isPlayer ? 3 : 4, 8, 0.05);
    }
    this.game.audio.shot(s.sound, this.isPlayer ? null : this.pos, s.suppressed);
    this.game.ai?.noise(this.pos, s.suppressed ? 22 : 110 * (s.noise || 1), 'gunshot', this);
    this.game.events.emit('shot', { who: this, weapon: s });
  }

  muzzleWorld() {
    if (this.isPlayer && this.game.viewmodel) return this.game.viewmodel.muzzleWorld();
    if (this.model) { this.model.group.updateMatrixWorld(); return this.model.muzzle.getWorldPosition(new THREE.Vector3()); }
    return this.eyePos();
  }

  melee() {
    this.meleeTimer = 0.6;
    this.game.audio.play('melee', this.isPlayer ? null : this.pos, 0.7);
    this.game.events.emit('melee', this);
    if (this.game.netClient) { if (this.isPlayer) this.game.net.send({ k: 'melee', a: [this.yaw, this.pitch] }); return; }
    const eye = this.eyePos(), f = this.forward();
    let best = null, bd = 2.4;
    for (const c of this.game.combatants) {
      if (!c.alive || c === this || c.team === this.team) continue;
      const to = c.chestPos().sub(eye);
      const d = to.length();
      if (d > bd) continue;
      if (to.normalize().dot(f) < 0.5) continue;
      best = c; bd = d;
    }
    if (best) {
      // Ataque pelas costas é letal
      const back = Math.cos(best.yaw - this.yaw) > 0.5;
      best.takeDamage(back ? 300 : 55, { attacker: this, region: 'chest', dir: f, point: best.chestPos(), weapon: 'knife', melee: true });
      this.game.fx.blood(best.chestPos(), f, 2);
    }
  }

  onNearMiss(shooter, from) {
    this.suppression = Math.min(1.5, this.suppression + 0.35);
    if (this.brain) this.brain.onNearMiss(shooter, from);
    if (this.isPlayer) this.game.events.emit('suppressed', this);
  }

  takeDamage(dmg, info) {
    if (!this.alive || this.spawnProtect > 0 || this.game.godMode && this.isPlayer || this.game.netClient) return;
    const atk = info.attacker;
    if (atk && atk !== this && atk.team === this.team && !this.game.friendlyFire) return;
    dmg *= this.damageTakenMul;
    if (this.armor > 0 && !info.fall) {
      const absorbed = Math.min(this.armor, dmg * 0.55);
      this.armor -= absorbed; dmg -= absorbed;
    }
    this.health -= dmg;
    this.lastDamage = this.game.time;
    if (atk) { this.damageBy.set(atk, (this.damageBy.get(atk) || 0) + dmg); atk.stats.damage += dmg; atk.stats.hits++; }
    this.game.events.emit('damage', { victim: this, dmg, ...info });
    if (this.brain) this.brain.onDamaged(info);
    if (this.health <= 0) this.die(info);
  }

  die(info) {
    this.alive = false;
    this.health = 0;
    this.deadTime = 0;
    this.stats.deaths++;
    const killer = info.attacker;
    this.lastKiller = killer;
    this.streak = 0;
    if (killer && killer !== this) {
      killer.stats.kills++;
      if (info.region === 'head') killer.stats.headshots++;
    }
    for (const [a, d] of this.damageBy) if (a !== killer && a.alive && d >= 25) a.stats.assists++;
    this.damageBy.clear();
    if (this.model) this.model.die(info.dir?.x ?? 0, info.dir?.z ?? 0);
    this.game.events.emit('kill', { killer, victim: this, weapon: info.weapon, headshot: info.region === 'head', melee: info.melee, explosive: info.explosive, dist: info.dist });
  }

  respawn(x, z, yaw = 0, y = 0) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.recoilP = 0;
    this.health = this.maxHealth; this.alive = true; this.height = MOVE.stand;
    this.flashed = 0; this.suppression = 0; this.spawnProtect = 2;
    for (const w of this.weapons) w.refill();
    if (this.model) { this.model.deathT = -1; this.model.group.rotation.x = 0; this.model.group.visible = true; }
    this.brain?.reset();
    if (this.remote) this.game.net.queueRespawn(this);
  }

  syncModel(dt) {
    const m = this.model;
    m.group.position.copy(this.pos);
    m.group.rotation.y = this.yaw;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    m.animate(dt, hs, this.crouchT, this.pitch, this.ads > 0.5, this.onGround);
  }

  destroy() {
    if (this.model) this.game.scene.remove(this.model.group);
  }
}
