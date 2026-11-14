import * as THREE from 'three';
import { damageAtRange, regionDamage, penetrationCost } from './weapons.js';
import { raySphere, rayAABB } from '../core/util.js';

// ================================================================
// BALLISTICS — projéteis simulados (velocidade, gravidade, queda),
// penetração de materiais, dano por região corporal, near-miss
// (supressão da IA) e dano a objetos destrutíveis.
// ================================================================

const G = 9.81;
const tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3();

export class Ballistics {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  clear() { this.list.length = 0; }

  fire(shooter, origin, dir, stats, opts = {}) {
    this.list.push({
      shooter, team: shooter?.team,
      pos: origin.clone(), vel: dir.clone().multiplyScalar(stats.velocity),
      start: origin.clone(),
      power: stats.pen, power0: stats.pen,
      stats, traveled: 0, life: 3, tracer: opts.tracer !== false,
      color: stats.tracerColor, weaponId: stats.id, dmgMul: opts.dmgMul ?? 1,
      hitSet: new Set(), nearSet: new Set(),
    });
  }

  update(dt) {
    const game = this.game;
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      const prev = p.pos.clone();
      p.vel.y -= G * dt;
      const step = p.vel.length() * dt;
      tmpD.copy(p.vel).normalize();
      const alive = this._segment(p, prev, tmpD, step);
      if (!alive || p.life <= 0 || p.traveled > 1200) { list.splice(i, 1); continue; }
      if (alive === 2) continue; // ricochete: posição já atualizada
      p.pos.copy(prev).addScaledVector(tmpD, step);
      p.traveled += step;
      if (p.tracer && p.traveled > 3) {
        const tail = p.pos.clone().addScaledVector(tmpD, -Math.min(step, 6));
        game.fx.streak(tail, p.pos, p.color, 1);
      }
    }
  }

  // Processa um segmento do projétil. Retorna false se o projétil parou.
  _segment(p, o, d, len) {
    const game = this.game;
    const hits = game.world.raycastAll(o, d, len);
    // personagens
    for (const c of game.combatants) {
      if (!c.alive || c === p.shooter || p.hitSet.has(c)) continue;
      const dx = c.pos.x - o.x, dz = c.pos.z - o.z;
      // descarte rápido
      const along = dx * d.x + dz * d.z;
      if (along < -2 || along > len + 2) continue;
      const perp = Math.abs(dx * d.z - dz * d.x);
      if (perp > 2.5) continue;
      // near-miss: projétil passando perto de um inimigo -> supressão
      if (c.team !== p.team && perp < 2.2 && !p.nearSet.has(c)) { p.nearSet.add(c); c.onNearMiss?.(p.shooter, o); }
      const hb = c.hitboxes();
      let best = null;
      for (const h of hb) {
        let t = null;
        if (h.r) t = raySphere(o.x, o.y, o.z, d.x, d.y, d.z, h.c.x, h.c.y, h.c.z, h.r, len);
        else { const r = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, h.min, h.max, len); if (r) t = r[0]; }
        if (t !== null && (!best || t < best.t)) best = { t, region: h.region };
      }
      if (best) hits.push({ t: best.t, combatant: c, region: best.region });
    }
    hits.sort((a, b) => a.t - b.t);
    for (const h of hits) {
      const point = new THREE.Vector3().copy(o).addScaledVector(d, h.t);
      const dist = p.traveled + h.t;
      if (h.combatant) {
        const c = h.combatant;
        p.hitSet.add(c);
        const ratio = Math.max(0.25, p.power / p.power0);
        const base = damageAtRange(p.stats, dist) * ratio * p.dmgMul;
        const dmg = regionDamage(p.stats, base, h.region);
        c.takeDamage(dmg, { attacker: p.shooter, region: h.region, dir: d.clone(), point, weapon: p.weaponId, dist });
        game.fx.blood(point, d, h.region === 'head' ? 2 : 1);
        game.audio.play('impact_flesh', point, 0.7);
        p.power -= 14; // corpo humano absorve muita energia
        if (p.power <= 4) return false;
        continue;
      }
      // Mundo
      const normal = new THREE.Vector3();
      if (h.axis >= 0) normal.setComponent(h.axis, h.sign); else normal.copy(d).negate();
      const thickness = Math.min(h.tExit, 50) - h.t;
      const cost = penetrationCost(h.mat, thickness);
      if (h.box) game.world.damageBox(h.box, damageAtRange(p.stats, dist) * 0.6, false, point, p.shooter);
      game.fx.impact(point, normal, h.mat);
      if (game.audio.far(point) < 50) game.audio.impact(h.mat, point);
      // Ruído de impacto atrai atenção da IA próxima
      if (Math.random() < 0.3) game.ai?.noise(point, 10, 'impact', p.shooter);
      if (h.ground || cost > p.power) {
        // ricochete raro em ângulo raso
        const cosA = Math.abs(d.dot(normal));
        if (cosA < 0.18 && p.power > 10 && h.mat !== 'dirt') {
          p.vel.reflect(normal).multiplyScalar(0.5);
          p.power *= 0.4;
          p.pos.copy(point).addScaledVector(normal, 0.02);
          p.traveled += h.t;
          return 2;
        }
        return false;
      }
      p.power -= cost;
      const exit = new THREE.Vector3().copy(o).addScaledVector(d, Math.min(h.tExit, len));
      if (h.tExit < len) game.fx.impact(exit, normal.clone().negate(), h.mat);
      // desvio leve e perda de velocidade ao atravessar
      p.vel.multiplyScalar(0.85);
      p.vel.x += (Math.random() - 0.5) * 8; p.vel.y += (Math.random() - 0.5) * 8; p.vel.z += (Math.random() - 0.5) * 8;
    }
    return true;
  }
}
