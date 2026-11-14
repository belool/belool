import * as THREE from 'three';
import { clamp } from '../core/util.js';

// ================================================================
// VEHICLE — jipe dirigível (Battle Royale). Entrar/sair com [E],
// W/S acelera/freia, A/D esterça, Espaço freio de mão.
// Atropelamento causa dano; explosões destroem o veículo.
// ================================================================

export class Vehicle {
  constructor(game, x, z, yaw = 0, tint = 0x4a5a3a) {
    this.game = game;
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = yaw; this.speed = 0; this.steer = 0;
    this.hp = 500; this.alive = true;
    this.driver = null;
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.7, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const add = (geo, m, x_, y, z_) => { const me = new THREE.Mesh(geo, m); me.position.set(x_, y, z_); me.castShadow = true; g.add(me); return me; };
    add(new THREE.BoxGeometry(2, 0.7, 4.2), body, 0, 0.85, 0);
    add(new THREE.BoxGeometry(1.9, 0.6, 1.4), body, 0, 1.45, 0.4);
    add(new THREE.BoxGeometry(1.8, 0.5, 0.08), new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.5 }), 0, 1.45, -0.32);
    this.wheels = [];
    for (const [wx, wz] of [[-1, -1.4], [1, -1.4], [-1, 1.4], [1, 1.4]]) {
      const w = add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), dark, wx, 0.42, wz);
      w.rotation.z = Math.PI / 2; this.wheels.push(w);
    }
    g.rotation.order = 'YXZ';
    this.group = g;
    game.scene.add(g);
    this.sync();
  }
  sync() { this.group.position.copy(this.pos); this.group.rotation.y = this.yaw; }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  control(throttle, steer, brake, dt) {
    const max = 24, accel = throttle > 0 ? 9 : 14;
    if (throttle) this.speed += throttle * accel * dt;
    else this.speed *= Math.exp(-dt * 0.6);
    if (brake) this.speed *= Math.exp(-dt * 4);
    this.speed = clamp(this.speed, -8, max);
    this.steer += (steer - this.steer) * Math.min(1, dt * 6);
    this.yaw -= this.steer * dt * clamp(this.speed / 8, -1, 1) * 1.4;
  }

  update(dt) {
    if (!this.alive) return;
    if (!this.driver) this.control(0, 0, true, dt);
    const f = this.forward();
    this.vel.x = f.x * this.speed; this.vel.z = f.z * this.speed;
    this.vel.y -= 18 * dt;
    const before = this.pos.clone();
    this.game.world.moveCharacter(this.pos, this.vel, 1.3, 1.6, dt, true, 0.6);
    const moved = this.pos.distanceTo(before) / Math.max(dt, 1e-3);
    if (Math.abs(this.speed) > 4 && moved < Math.abs(this.speed) * 0.5) {
      // colisão: perde velocidade e sofre dano leve
      if (Math.abs(this.speed) > 12) this.damage(Math.abs(this.speed) * 2, null);
      this.speed *= -0.25;
      this.game.audio.play('break', this.pos, 0.4);
    }
    for (const w of this.wheels) w.rotation.x += this.speed * dt / 0.42;
    // atropelamento
    if (Math.abs(this.speed) > 6) {
      for (const c of this.game.combatants) {
        if (!c.alive || c === this.driver || c.vehicle) continue;
        if (Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) < 2.0) {
          c.takeDamage(Math.abs(this.speed) * 7, { attacker: this.driver, region: 'chest', weapon: 'vehicle', dir: f });
          c.vel.addScaledVector(f, Math.abs(this.speed) * 0.6); c.vel.y = 4;
        }
      }
    }
    if (this.driver && Math.random() < dt * 3) this.game.audio.play('engine', this.pos, 0.3 + Math.abs(this.speed) / 30);
    this.sync();
  }
  damage(d, attacker) {
    if (!this.alive) return;
    this.hp -= d;
    if (this.hp <= 0) {
      this.alive = false;
      const drv = this.driver;
      if (drv) this.exit(drv);
      this.game.explode(this.pos.clone().setY(1), { radius: 6, damage: 120, attacker, source: 'vehicle' });
      this.group.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.color.setHex(0x111111); } });
    }
  }
  enter(c) { if (this.driver || !this.alive) return false; this.driver = c; c.vehicle = this; return true; }
  exit(c) {
    if (this.driver !== c) return;
    this.driver = null; c.vehicle = null;
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const p = this.pos.clone().addScaledVector(side, -2.4);
    c.pos.set(p.x, this.pos.y + 0.2, p.z); c.vel.set(0, 0, 0);
  }
  destroy() { this.game.scene.remove(this.group); }
}
