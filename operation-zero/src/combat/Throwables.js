import * as THREE from 'three';
import { EQUIPMENT } from './weapons.js';

// ================================================================
// THROWABLES / EXPLOSIVES — granadas com física de quique, explosões
// com dano radial + oclusão, fumaça que bloqueia visão e flashbang.
// ================================================================

export class Throwables {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.smokes = [];
    const geo = new THREE.SphereGeometry(0.07, 8, 6);
    this.mats = {
      frag: new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.6 }),
      smoke: new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.6 }),
      flash: new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.6 }),
      c4: new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.6 }),
    };
    this.geo = geo;
  }
  clear() {
    for (const g of this.list) this.game.scene.remove(g.mesh);
    this.list.length = 0; this.smokes.length = 0;
  }

  throw(thrower, type, origin, dir, power = 18) {
    if (this.game.netClient && thrower?.isPlayer) {
      // cliente online: o anfitrião cria a granada real
      this.game.net.send({ k: 'throw', ty: type, o: [origin.x, origin.y, origin.z], d: [dir.x, dir.y, dir.z] });
      this.game.audio.play('pin', null, 0.6);
      return null;
    }
    const mesh = new THREE.Mesh(this.geo, this.mats[type] || this.mats.frag);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.game.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(power);
    vel.y += 3;
    if (thrower?.vel) vel.add(thrower.vel.clone().multiplyScalar(0.5));
    const g = { type, thrower, mesh, pos: origin.clone(), vel, fuse: EQUIPMENT[type]?.fuse ?? 3, bounced: 0 };
    this.list.push(g);
    this.game.audio.play('pin', origin, 0.6);
    this.game.ai?.grenadeThrown(g);
    return g;
  }

  // Carga explosiva plantada (objetivos de missão).
  plant(pos, fuse, onBoom) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.2), this.mats.c4);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.list.push({ type: 'c4', mesh, pos: pos.clone(), vel: new THREE.Vector3(), fuse, static: true, onBoom });
  }

  update(dt) {
    const world = this.game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.fuse -= dt;
      if (!g.static) {
        g.vel.y -= 16 * dt;
        const sp = g.vel.length();
        if (sp > 0.01) {
          const d = g.vel.clone().divideScalar(sp);
          const step = sp * dt;
          const hit = world.raycast(g.pos, d, step + 0.08);
          if (hit) {
            g.pos.copy(hit.point).addScaledVector(hit.normal, 0.09);
            g.vel.reflect(hit.normal).multiplyScalar(0.42);
            if (hit.normal.y > 0.7 && Math.abs(g.vel.y) < 1.2) { g.vel.y = 0; g.vel.x *= 0.85; g.vel.z *= 0.85; }
            if (sp > 3 && g.bounced++ < 6) this.game.audio.play('bounce', g.pos, 0.5);
          } else g.pos.addScaledVector(d, step);
        }
        if (g.pos.y < 0.07) { g.pos.y = 0.07; g.vel.y = Math.abs(g.vel.y) * 0.3; g.vel.x *= 0.9; g.vel.z *= 0.9; }
        g.mesh.position.copy(g.pos);
        g.mesh.rotation.x += g.vel.length() * dt * 2;
      }
      if (g.fuse <= 0) {
        this.list.splice(i, 1);
        this.game.scene.remove(g.mesh);
        this.detonate(g);
      }
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t -= dt;
      s.r = Math.min(s.maxR, s.r + dt * 4);
      if (Math.random() < dt * 8 && s.t > 2) this.game.fx.smokeCloud(s.pos, s.r);
      if (s.t <= 0) this.smokes.splice(i, 1);
    }
  }

  detonate(g) {
    const game = this.game;
    if (g.type === 'frag' || g.type === 'c4') {
      const e = g.type === 'c4' ? { radius: 9, damage: 300 } : EQUIPMENT.frag;
      game.explode(g.pos, { radius: e.radius, damage: e.damage, attacker: g.thrower, source: g.type });
      g.onBoom?.();
    } else if (g.type === 'smoke') {
      this.smokes.push({ pos: g.pos.clone().setY(1.2), r: 1, maxR: EQUIPMENT.smoke.radius, t: EQUIPMENT.smoke.duration });
      game.audio.play('impact_soft', g.pos, 1);
      for (let k = 0; k < 6; k++) game.fx.smokeCloud(g.pos, 2);
    } else if (g.type === 'flash') {
      game.fx.flash(g.pos, 0xffffff, 80, 30, 0.25);
      game.audio.play('flashbang', g.pos, 1.2);
      for (const c of game.combatants) {
        if (!c.alive) continue;
        const eye = c.eyePos();
        const dist = eye.distanceTo(g.pos);
        if (dist > EQUIPMENT.flash.radius) continue;
        if (!game.world.lineOfSight(g.pos.clone().setY(g.pos.y + 0.3), eye)) continue;
        const to = g.pos.clone().sub(eye).normalize();
        const facing = Math.max(0, to.dot(c.forward()));
        const k = (1 - dist / EQUIPMENT.flash.radius) * (0.35 + 0.65 * facing);
        c.flashed = Math.max(c.flashed, 4.5 * k);
        if (c.isPlayer && k > 0.2) game.audio.play('ring', null, k);
      }
      game.ai?.noise(g.pos, 40, 'explosion', g.thrower);
    }
  }

  // A fumaça bloqueia a linha de visão?
  blocks(a, d, len) {
    for (const s of this.smokes) {
      const lx = s.pos.x - a.x, ly = s.pos.y - a.y, lz = s.pos.z - a.z;
      const t = Math.max(0, Math.min(len, lx * d.x + ly * d.y + lz * d.z));
      const px = a.x + d.x * t - s.pos.x, py = a.y + d.y * t - s.pos.y, pz = a.z + d.z * t - s.pos.z;
      if (px * px + py * py * 0.5 + pz * pz < s.r * s.r * 0.8) return true;
    }
    return false;
  }
}
