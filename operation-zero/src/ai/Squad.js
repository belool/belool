import { pick } from '../core/util.js';

// ================================================================
// SQUAD — coordenação de equipe: conhecimento compartilhado de alvos
// (comunicação), atribuição de papéis (supressão / flanco / assalto),
// objetivo do esquadrão e decisão coletiva de recuo.
// ================================================================

export class Squad {
  constructor(game, team, members, id) {
    this.game = game; this.team = team; this.id = id;
    this.members = [];
    this.known = new Map(); // inimigo -> { pos, t, reporter }
    this.goal = null;       // { x, z, type: 'attack'|'defend'|'patrol'|'follow', radius }
    this.roleTimer = 0;
    this.retreatUntil = 0;
    this.startCount = 0;
    for (const m of members) this.add(m);
  }
  add(c) { if (!this.members.includes(c)) { this.members.push(c); this.startCount++; if (c.brain) c.brain.squad = this; } }
  remove(c) { const i = this.members.indexOf(c); if (i >= 0) this.members.splice(i, 1); }
  get alive() { return this.members.filter((m) => m.alive); }
  get leader() { return this.alive[0]; }

  report(enemy, pos, reporter) {
    const prev = this.known.get(enemy);
    const fresh = !prev || this.game.time - prev.t > 6;
    this.known.set(enemy, { pos: pos.clone(), t: this.game.time, reporter });
    if (fresh && reporter?.brain) {
      const dir = compass(reporter.pos, pos);
      reporter.brain.say(pick([`Contato! ${dir}!`, `Inimigo avistado, ${dir}!`, `Hostil a ${dir}!`]), true);
    }
  }
  forget(enemy) { this.known.delete(enemy); }
  freshest() {
    let best = null;
    for (const [e, k] of this.known) {
      if (!e.alive || this.game.time - k.t > 20) { this.known.delete(e); continue; }
      if (!best || k.t > best.k.t) best = { e, k };
    }
    return best;
  }
  get retreating() { return this.game.time < this.retreatUntil; }

  update(dt) {
    this.roleTimer -= dt;
    const alive = this.alive;
    if (!alive.length) return;
    const f = this.freshest();
    if (this.roleTimer <= 0 && f) {
      this.roleTimer = 6 + Math.random() * 3;
      const t = this.game.ai.director.tactics;
      // Ordena por distância ao alvo; o mais próximo suprime, laterais flanqueiam
      const sorted = alive.slice().sort((a, b) => a.pos.distanceTo(f.k.pos) - b.pos.distanceTo(f.k.pos));
      sorted.forEach((m, i) => {
        if (!m.brain) return;
        let role = 'assault';
        if (i === 0) role = Math.random() < t.hold + 0.3 ? 'suppress' : 'assault';
        else if (Math.random() < t.flank) role = i % 2 ? 'flankL' : 'flankR';
        else if (Math.random() < t.push) role = 'assault';
        else role = 'suppress';
        if (m.brain.opts.boss) role = 'assault';
        m.brain.setRole(role);
      });
      // Recuo coletivo quando em grande desvantagem
      const knownEnemies = [...this.known.keys()].filter((e) => e.alive).length;
      if (this.startCount >= 3 && alive.length / this.startCount < 0.5 && knownEnemies >= alive.length && !this.retreating) {
        this.retreatUntil = this.game.time + 10;
        alive[0].brain?.say(pick(['Recuar! Recuar!', 'Estamos perdendo homens, recuem!', 'Reagrupar na retaguarda!']), true);
      }
    }
  }
}

export function compass(from, to) {
  const a = Math.atan2(to.x - from.x, -(to.z - from.z)); // 0 = norte (-z)
  const dirs = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
  const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return dirs[i];
}
