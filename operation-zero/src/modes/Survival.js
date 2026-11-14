import { Mode, ROLE_LOADOUTS, randomRole } from './Mode.js';
import { pick, rand } from '../core/util.js';
import { WEAPONS } from '../combat/weapons.js';

// ================================================================
// SOBREVIVÊNCIA — ondas crescentes, dificuldade progressiva, chefes a
// cada 5 ondas, loja de melhorias entre ondas e placar local.
// ================================================================

export const SHOP = [
  { id: 'ammo', name: 'Reabastecer munição', cost: 250, apply: (p) => p.weapons.forEach((w) => w.refill()) },
  { id: 'armor', name: 'Colete balístico (+100 armadura)', cost: 500, apply: (p) => { p.armor = 100; } },
  { id: 'heal', name: 'Kit médico (vida cheia)', cost: 300, apply: (p) => { p.health = p.maxHealth; } },
  { id: 'vital', name: 'Treinamento físico (+25 vida máx.)', cost: 1200, apply: (p) => { p.maxHealth += 25; p.health = p.maxHealth; } },
  { id: 'frag', name: 'Granada de fragmentação', cost: 300, apply: (p) => { p.grenades.frag++; } },
  { id: 'flash', name: 'Granada de atordoamento', cost: 200, apply: (p) => { p.grenades.flash++; } },
  { id: 'smoke', name: 'Granada de fumaça', cost: 150, apply: (p) => { p.grenades.smoke++; } },
  { id: 'dmg', name: 'Munição aprimorada (+15% dano)', cost: 1500, apply: (p, m) => { m.dmgMul += 0.15; p.dmgBoost = m.dmgMul; } },
  { id: 'w_kr47', name: 'Arma: KR-47 Tempestade', cost: 1500, weapon: 'kr47' },
  { id: 'w_mpx9', name: 'Arma: MPX-9 Fantasma', cost: 1500, weapon: 'mpx9' },
  { id: 'w_breacher', name: 'Arma: Breacher 12', cost: 1300, weapon: 'breacher' },
  { id: 'w_dmr14', name: 'Arma: DMR-14 Ceifador', cost: 1800, weapon: 'dmr14' },
  { id: 'w_titan', name: 'Arma: Titan M-60', cost: 2500, weapon: 'titan' },
  { id: 'w_longbow', name: 'Arma: Longbow .338', cost: 2200, weapon: 'longbow' },
  { id: 'ally', name: 'Contratar aliado (mercenário)', cost: 2000, ally: true },
];

export class Survival extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.title = 'Sobrevivência';
    this.teamBased = false;
    this.timeLeft = Infinity;
    this.wave = 0;
    this.toSpawn = 0;
    this.spawnT = 0;
    this.breakT = 8;
    this.points = 500;
    this.score = 0;
    this.dmgMul = 1;
    this.inBreak = true;
    this.objective = 'Prepare-se. A primeira onda está chegando.';
  }
  setup() {
    const P = this.layout.points;
    const c = P.B || [0, 0];
    this.center = c;
    this.setupPlayer(0, { pos: this.game.nav.center(...this.game.nav.nearestWalkable(c[0], c[1])), regen: true });
  }
  get enemiesAlive() { return this.game.combatants.filter((c) => c.alive && c.team === 1).length; }

  startWave() {
    this.wave++;
    this.inBreak = false;
    this.toSpawn = 4 + this.wave * 2 + Math.floor(this.wave * this.wave * 0.15);
    this.spawnT = 0;
    this.objective = `Onda ${this.wave}: elimine todos os inimigos`;
    this.game.audio.play('wave', null, 0.8);
    this.game.events.emit('toast', { title: `ONDA ${this.wave}`, text: this.wave % 5 === 0 ? 'Um comandante blindado se aproxima!' : `${this.toSpawn} hostis a caminho` });
    if (this.wave % 5 === 0) this.spawnEnemy(true);
    // limpa corpos antigos
    for (const c of this.game.combatants.slice()) if (!c.alive && !c.isPlayer && c.deadTime > 5) this.game.removeCombatant(c);
  }
  spawnEnemy(boss = false) {
    const nav = this.game.nav, S = this.game.map.size - 6;
    const p = this.game.player.pos;
    let pos = null;
    for (let i = 0; i < 30 && !pos; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(45, S);
      const q = nav.nearestWalkable(Math.cos(a) * r, Math.sin(a) * r, 6);
      if (q) { const w = nav.center(q[0], q[1]); if (Math.hypot(w[0] - p.x, w[1] - p.z) > 35) pos = w; }
    }
    if (!pos) pos = this.spawnPoint(1);
    const w = this.wave;
    const role = boss ? 'heavy' : w < 3 ? pick(['rifleman', 'smg']) : randomRole();
    const diff = w < 4 ? 'easy' : w < 8 ? 'normal' : w < 13 ? 'hard' : 'elite';
    const c = this.spawnBot(1, {
      pos, role, difficulty: diff, boss,
      health: boss ? 600 + w * 60 : 100 + Math.max(0, w - 5) * 8, armor: boss ? 100 : w > 6 ? 30 : 0,
      ai: { goal: { x: p.x, z: p.z, type: 'attack', radius: 8 }, noRetreat: boss || w > 10, boss },
      name: boss ? 'Comandante Blindado' : undefined,
    });
    if (boss) { c.isBoss = true; c.damageTakenMul *= 0.85; }
    c.brain.squad = null;
    this.game.ai.addToSquad(c, 4);
  }
  update(dt) {
    super.update(dt);
    if (this.over) return;
    const g = this.game, p = g.player;
    if (this.inBreak) {
      this.breakT -= dt;
      this.objective = `Intervalo: ${Math.ceil(this.breakT)}s — pressione [I] para abrir a loja (${this.points} pts)`;
      if (this.breakT <= 0) this.startWave();
      return;
    }
    this.spawnT -= dt;
    if (this.toSpawn > 0 && this.spawnT <= 0 && this.enemiesAlive < 6 + this.wave) {
      this.spawnEnemy(); this.toSpawn--; this.spawnT = Math.max(0.6, 2.5 - this.wave * 0.12);
    }
    // inimigos sempre sabem aproximadamente onde o jogador está
    this.huntT = (this.huntT ?? 0) - dt;
    if (this.huntT <= 0) {
      this.huntT = 4;
      for (const s of g.ai.squads) if (s.team === 1) s.goal = { x: p.pos.x + rand(-6, 6), z: p.pos.z + rand(-6, 6), type: 'attack', radius: 8 };
    }
    if (this.toSpawn <= 0 && this.enemiesAlive === 0) {
      this.inBreak = true;
      this.breakT = 20;
      const bonus = 300 + this.wave * 100;
      this.points += bonus; this.score += bonus;
      g.progression.record({ type: 'wave' });
      g.events.emit('toast', { title: `Onda ${this.wave} superada!`, text: `+${bonus} pontos` });
      p.weapons.forEach((w) => w.addAmmo(2));
    }
  }
  onKill(e) {
    const g = this.game;
    if (e.victim === g.player) {
      this.finish(false, 'FIM DE JOGO', `Você sobreviveu a ${Math.max(0, this.wave - 1)} ondas — ${this.score} pontos`, { survival: { wave: this.wave, score: this.score } });
      this.recordBoard();
      return;
    }
    if (e.victim.team === 1 && e.killer && e.killer.team === 0) {
      const pts = (e.victim.isBoss ? 1000 : 100) + (e.headshot ? 50 : 0) + (e.melee ? 100 : 0);
      if (e.killer.isPlayer) { this.points += pts; this.score += pts; e.killer.stats.score += pts; }
    }
    if (e.victim.team === 0 && !e.victim.isPlayer) this.after(8, () => { if (this.game.combatants.includes(e.victim)) this.game.removeCombatant(e.victim); });
  }
  recordBoard() {
    const prof = this.game.profile;
    prof.stats.bestWave = Math.max(prof.stats.bestWave, this.wave - 1);
    const b = prof.leaderboards.survival;
    b.push({ name: prof.operator.callsign, wave: this.wave - 1, score: this.score, map: this.game.map.name, date: new Date().toLocaleDateString('pt-BR') });
    b.sort((a, c) => c.score - a.score);
    b.length = Math.min(b.length, 10);
  }
  buy(id) {
    const item = SHOP.find((s) => s.id === id);
    const p = this.game.player;
    if (!item || this.points < item.cost || !p.alive) return false;
    this.points -= item.cost;
    if (item.weapon) {
      p.weapons[0] = new (p.weapons[0].constructor)(item.weapon, { optic: WEAPONS[item.weapon].defaultOptic || 'reddot' }, 'fmj');
      p.slot = 0;
      this.game.events.emit('weaponChanged', p);
    } else if (item.ally) {
      const c = this.spawnBot(0, { pos: [p.pos.x + 2, p.pos.z + 2], role: randomRole(), ai: { follow: true, followIdx: this.game.combatants.filter((x) => x.team === 0).length - 1 } });
      c.brain.opts.noSquad = true;
    } else item.apply(p, this);
    this.game.audio.play('ui');
    return true;
  }
  hud() { return { title: this.title, objective: this.objective, time: null, wave: this.wave, points: this.points, enemies: this.enemiesAlive + this.toSpawn }; }
}
