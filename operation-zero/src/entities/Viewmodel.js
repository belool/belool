import * as THREE from 'three';
import { CAMOS } from '../combat/weapons.js';
import { clamp, smooth } from '../core/util.js';

// ================================================================
// VIEWMODEL — arma em primeira pessoa, procedural a partir dos dados
// da arma (comprimento, carregador, coronha, acessórios, camuflagem).
// Animações: balanço, passos, corrida, mira, recuo, recarga, ferrolho,
// troca de arma, faca e lançamento de granada.
// ================================================================

export class Viewmodel {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xdde6ff, 0x3a3020, 2.2);
    this.scene.add(this.hemi);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    this.dir = new THREE.DirectionalLight(0xffffff, 2.2);
    this.dir.position.set(1, 2, 1);
    this.scene.add(this.dir);
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.82);
    this.scene.add(this.root);
    this.sway = new THREE.Vector2(); this.bobT = 0; this.kick = 0; this.kickRot = 0;
    this.switchT = 0; this.meleeT = 0; this.throwT = 0;
    this.current = null;
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    game.events.on('shot', (e) => { if (e.who.isPlayer) this.onShot(e.weapon); });
    game.events.on('melee', (c) => { if (c.isPlayer) this.meleeT = 0.4; });
    game.events.on('throw', (e) => { if (e.who.isPlayer) this.throwT = 0.6; });
    game.events.on('weaponChanged', (c) => { if (c.isPlayer) this.build(c.weapon); });
  }

  build(w) {
    this.root.clear();
    this.current = w;
    if (!w) return;
    const s = w.stats, vm = s.vm || {};
    const camo = CAMOS.find((c) => c.id === w.camo);
    const bodyColor = camo?.color ?? vm.color ?? 0x2a2a2a;
    const body = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.55, metalness: 0.15 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x3a342c, roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x4b5a3a, roughness: 0.95 });
    const gun = new THREE.Group();
    this.gun = gun;
    const B = (w_, h, d, m, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w_, h, d), m); me.position.set(x, y, z); gun.add(me); return me; };
    const C = (r, len, m, x, y, z) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), m); me.rotation.x = Math.PI / 2; me.position.set(x, y, z); gun.add(me); return me; };
    const len = vm.len ?? 0.6, h = vm.h ?? 0.12, wd = vm.w ?? 0.05;
    this.sightY = h * 0.5 + 0.035;
    if (s.cls === 'melee') {
      B(0.03, 0.04, 0.12, dark, 0, -0.02, 0.05);
      const blade = B(0.008, 0.035, 0.2, new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 0.9, roughness: 0.25 }), 0, 0, -0.11);
      blade.rotation.x = 0.05;
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0, -0.25); gun.add(this.muzzle);
      this.rest = new THREE.Vector3(0.2, -0.2, -0.35);
    } else if (s.cls === 'pistol') {
      B(wd, h * 0.45, len, body, 0, h * 0.25, -len / 2 + 0.06);
      B(wd * 0.9, h * 0.7, 0.06, dark, 0, -h * 0.2, 0.0).rotation.x = -0.25;
      B(wd * 0.7, 0.012, 0.02, dark, 0, h * 0.5, -len + 0.08);
      this.mag = B(wd * 0.7, h * 0.5, 0.04, dark, 0, -h * 0.45, 0.005);
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, h * 0.25, -len + 0.03); gun.add(this.muzzle);
      this.rest = new THREE.Vector3(0.17, -0.17, -0.38);
      this.sightY = h * 0.5 + 0.01;
    } else {
      B(wd, h * 0.6, len * 0.55, body, 0, 0, -len * 0.2);                         // receptor
      C(0.013, len * 0.5, dark, 0, h * 0.05, -len * 0.62);                       // cano
      B(wd * 1.1, h * 0.5, len * 0.28, body, 0, -0.005, -len * 0.55);           // guarda-mão
      if (vm.stock) B(wd * 0.9, h * 0.75, len * 0.3, body, 0, -h * 0.12, len * 0.2);
      B(wd * 0.8, h * 0.7, 0.05, dark, 0, -h * 0.5, 0.02).rotation.x = -0.3;     // empunhadura
      const magKind = vm.mag || 'straight';
      const ext = w.attachments.mag === 'extended' ? 1.4 : 1;
      if (magKind === 'drum') { this.mag = C(0.07, 0.07, dark, 0, -h * 0.55, -len * 0.25); this.mag.rotation.set(0, 0, Math.PI / 2); }
      else if (magKind === 'box') this.mag = B(wd * 0.8, h * 0.5 * ext, 0.06, dark, 0, -h * 0.5 - h * 0.15 * (ext - 1), -len * 0.2);
      else if (magKind === 'curved') { this.mag = B(wd * 0.75, h * 0.9 * ext, 0.07, dark, 0, -h * 0.65 - h * 0.25 * (ext - 1), -len * 0.22); this.mag.rotation.x = 0.25; }
      else this.mag = B(wd * 0.75, h * 0.8 * ext, 0.05, dark, 0, -h * 0.6 - h * 0.25 * (ext - 1), -len * 0.22);
      if (vm.pump) { this.pump = B(wd * 1.3, h * 0.45, len * 0.2, dark, 0, -h * 0.25, -len * 0.55); }
      if (vm.bipod) { B(0.01, 0.01, 0.2, dark, 0.03, -h * 0.3, -len * 0.7); B(0.01, 0.01, 0.2, dark, -0.03, -h * 0.3, -len * 0.7); }
      // acessórios
      const att = w.attachments;
      let muzzleZ = -len * 0.87;
      if (att.muzzle === 'suppressor') { C(0.022, 0.18, dark, 0, h * 0.05, muzzleZ - 0.09); muzzleZ -= 0.18; }
      else if (att.muzzle === 'compensator' || att.muzzle === 'brake') { C(0.018, 0.05, dark, 0, h * 0.05, muzzleZ - 0.025); muzzleZ -= 0.05; }
      if (att.grip === 'vertical') B(0.025, 0.08, 0.025, dark, 0, -h * 0.55, -len * 0.5);
      if (att.grip === 'angled') B(0.025, 0.04, 0.07, dark, 0, -h * 0.35, -len * 0.5).rotation.x = 0.5;
      if (att.grip === 'laser') { B(0.02, 0.02, 0.06, dark, 0.035, 0, -len * 0.5); }
      const optic = w.stats.optic;
      if (optic === 'reddot') {
        B(0.04, 0.008, 0.06, dark, 0, h * 0.32, -len * 0.15);
        const frame = B(0.045, 0.04, 0.006, dark, 0, h * 0.32 + 0.025, -len * 0.18);
        frame.material = dark;
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
        dot.position.set(0, h * 0.32 + 0.025, -len * 0.18 + 0.004); gun.add(dot);
        this.sightY = h * 0.32 + 0.025;
      } else if (optic === 'acog' || optic === 'sniper') {
        const r = optic === 'sniper' ? 0.022 : 0.018, L = optic === 'sniper' ? 0.3 : 0.14;
        C(r, L, dark, 0, h * 0.35 + r, -len * 0.18);
        this.sightY = h * 0.35 + r;
      } else {
        B(0.008, 0.02, 0.008, dark, 0, h * 0.35, -len * 0.75);
        B(0.025, 0.02, 0.008, dark, 0, h * 0.35, -len * 0.05);
        this.sightY = h * 0.35 + 0.008;
      }
      this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, h * 0.05, muzzleZ); gun.add(this.muzzle);
      this.rest = new THREE.Vector3(0.16, -0.165, -0.3);
    }
    // braços (manga + luva)
    const arm = (x, z, rot) => {
      const g = new THREE.Group();
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.35), sleeve); sl.position.z = 0.2; g.add(sl);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.09), glove); g.add(gl);
      g.position.set(x, -0.05, z); g.rotation.y = rot;
      gun.add(g);
      return g;
    };
    arm(0.02, 0.05, -0.15);
    if (s.cls !== 'pistol' && s.cls !== 'melee') this.leftArm = arm(-0.04, -len * 0.5, 0.35);
    else this.leftArm = s.cls === 'pistol' ? arm(-0.015, 0.06, 0.25) : null;
    // flash do cano
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), this.flashMat);
    this.flash.position.copy(this.muzzle.position).add(new THREE.Vector3(0, 0, -0.04));
    gun.add(this.flash);
    this.flash2 = this.flash.clone(); this.flash2.rotation.y = Math.PI / 2; gun.add(this.flash2);
    this.adsPos = new THREE.Vector3(0, -this.sightY, -0.24 - (s.scope ? 0.05 : 0));
    gun.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.root.add(gun);
    this.switchT = 0.45;
  }

  onShot(stats) {
    this.kick = 1;
    this.kickRot = stats.recoil.vert * 0.02 + 0.02;
    this.flashT = stats.suppressed ? 0 : 0.045;
    this.flash.rotation.z = Math.random() * 3;
  }

  muzzleWorld() {
    if (!this.muzzle) return this.game.camera.getWorldPosition(new THREE.Vector3());
    this.root.updateMatrixWorld(true);
    const p = this.muzzle.getWorldPosition(new THREE.Vector3());
    // espaço da câmera de viewmodel -> mundo
    return this.game.camera.localToWorld(p);
  }

  update(dt, player, mouseDX, mouseDY) {
    if (!this.current || !player) return;
    const day = this.game.weather?.dayFactor ?? 1;
    const fl = this.game.weather?.flashlightOn ? 0.35 : 0;
    this.hemi.intensity = 0.5 + day * 1.7 + fl;
    this.dir.intensity = 0.4 + day * 1.8 + fl * 2;
    const w = player.weapon;
    if (w !== this.current) this.build(w);
    const gun = this.gun;
    const ads = player.ads;
    // balanço do mouse
    this.sway.x = smooth(this.sway.x, clamp(-mouseDX * 0.0006, -0.04, 0.04), 10, dt);
    this.sway.y = smooth(this.sway.y, clamp(mouseDY * 0.0006, -0.04, 0.04), 10, dt);
    // bob
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (player.onGround) this.bobT += dt * hs * (player.sprinting ? 1.6 : 1.9);
    const bobAmp = (player.sprinting ? 0.022 : 0.01) * Math.min(1, hs / 4) * (1 - ads * 0.85);
    const bx = Math.sin(this.bobT) * bobAmp, by = -Math.abs(Math.cos(this.bobT)) * bobAmp;
    // posição base -> mira
    const rest = this.rest;
    const pos = new THREE.Vector3().lerpVectors(rest, this.adsPos, ads);
    pos.x += bx + this.sway.x * (1 - ads * 0.7);
    pos.y += by + this.sway.y * (1 - ads * 0.7);
    // recuo
    this.kick = Math.max(0, this.kick - dt * 12);
    pos.z += this.kick * (0.05 - ads * 0.02);
    // corrida
    const sprint = player.sprinting ? 1 : 0;
    this.sprintT = smooth(this.sprintT || 0, sprint, 10, dt);
    pos.x -= this.sprintT * 0.06; pos.y -= this.sprintT * 0.04;
    // troca de arma
    this.switchT = Math.max(0, this.switchT - dt);
    pos.y -= (this.switchT / 0.45) * 0.3;
    // recarga
    let reloadRot = 0;
    if (w.reloading > 0) {
      const t = 1 - w.reloading / Math.max(0.01, w.reloadTotal);
      const k = Math.sin(Math.min(1, t) * Math.PI);
      pos.y -= k * 0.08; pos.x -= k * 0.03; reloadRot = k * 0.6;
      if (this.mag) this.mag.position.y = this.magBaseY() - (t < 0.5 ? t * 0.4 : (1 - t) * 0.4) * (w.stats.reloadPerShell ? 0 : 1);
    } else if (this.mag) this.mag.position.y = this.magBaseY();
    // ferrolho / bomba
    if (w.needsBolt > 0 && this.pump) this.pump.position.z = -w.stats.vm.len * 0.55 + Math.sin((1 - w.needsBolt / (w.stats.fireInterval * 0.9)) * Math.PI) * 0.08;
    let rx = this.kick * this.kickRot * (1 - ads * 0.5) + reloadRot * 0.5 + this.sprintT * 0.2;
    let ry = this.sprintT * 0.8 + this.sway.x * 2;
    let rz = reloadRot * 0.4 + this.sprintT * 0.2;
    // faca
    if (this.meleeT > 0) {
      this.meleeT -= dt;
      const k = Math.sin((1 - this.meleeT / 0.4) * Math.PI);
      pos.z -= k * 0.25; pos.x -= k * 0.1; ry -= k * 0.6;
    }
    if (this.throwT > 0) { this.throwT -= dt; pos.y -= Math.sin((1 - this.throwT / 0.6) * Math.PI) * 0.25; }
    gun.position.copy(pos);
    gun.rotation.set(rx, ry, rz);
    // flash
    this.flashT = (this.flashT || 0) - dt;
    this.flashMat.opacity = this.flashT > 0 ? 1 : 0;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.6);
    // escondido ao usar luneta
    this.root.visible = !(w.stats.scope && ads > 0.92);
  }
  magBaseY() {
    if (this._magBase === undefined || this._magFor !== this.mag) { this._magBase = this.mag.position.y; this._magFor = this.mag; }
    return this._magBase;
  }
}
