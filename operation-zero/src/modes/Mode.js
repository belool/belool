import { pick, rand } from '../core/util.js';

// ================================================================
// MODE — classe base de modos de jogo: spawns, respawn, placar,
// tempo, marcadores do minimapa e fim de partida.
// ================================================================

export const BOT_NAMES = ['Lobo', 'Falcão', 'Tigre', 'Cobra', 'Raio', 'Trovão', 'Sombra', 'Coruja', 'Viper', 'Brasa', 'Granito', 'Jaguar', 'Corvo', 'Fênix', 'Tanque', 'Ghost', 'Rex', 'Nômade', 'Ronin', 'Sabre', 'Atlas', 'Bravo', 'Delta', 'Eco', 'Fúria', 'Gelo', 'Hunter', 'Índio', 'Kilo', 'Lince', 'Mamba', 'Nevasca', 'Onça', 'Puma', 'Quartzo', 'Rocha', 'Sniper', 'Titã', 'Urso', 'Vulcão', 'Xamã', 'Zulu', 'Arpão', 'Bisão', 'Cacique', 'Dingo', 'Escorpião', 'Faraó', 'Gárgula', 'Harpia'];

export const ROLE_LOADOUTS = {
  rifleman: () => ({ primary: { id: pick(['ar4', 'kr47']), att: { optic: pick(['none', 'reddot']) } }, secondary: { id: 'p9' }, equipment: { frag: 1, smoke: 1, flash: 0 } }),
  smg: () => ({ primary: { id: pick(['vespa', 'mpx9']), att: { optic: 'reddot' } }, secondary: { id: 'p9' }, equipment: { frag: 1, smoke: 0, flash: 1 } }),
  breacher: () => ({ primary: { id: 'breacher' }, secondary: { id: 'r45' }, equipment: { frag: 1, smoke: 0, flash: 1 } }),
  marksman: () => ({ primary: { id: 'dmr14', att: { optic: 'acog' } }, secondary: { id: 'p9' }, equipment: { frag: 0, smoke: 1, flash: 0 } }),
  sniper: () => ({ primary: { id: 'longbow', att: { optic: 'sniper' } }, secondary: { id: 'vespa' }, equipment: { frag: 0, smoke: 1, flash: 0 } }),
  heavy: () => ({ primary: { id: 'titan', att: { grip: 'vertical' } }, secondary: { id: 'r45' }, equipment: { frag: 2, smoke: 0, flash: 0 } }),
};
export function randomRole(wave = 0) {
  const r = Math.random();
  if (r < 0.42) return 'rifleman';
  if (r < 0.62) return 'smg';
  if (r < 0.74) return 'breacher';
  if (r < 0.84) return 'marksman';
  if (r < 0.92) return 'heavy';
  return 'sniper';
}

export class Mode {
  constructor(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.over = false;
    this.timeLeft = cfg.timeLimit ?? 600;
    this.scores = { 0: 0, 1: 0 };
    this.respawns = [];
    this.respawnDelay = 4;
    this.teamBased = true;
    this.ranked = false;
    this.title = 'Partida';
    this.objective = '';
    this.names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    this.difficulty = cfg.difficulty || game.settings.difficulty || 'normal';
    this.unsubs = [];
    this.timers = [];
  }
  // Agenda uma ação em tempo de jogo (respeita pausa).
  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  dispose() { for (const u of this.unsubs) u(); }
  on(ev, fn) { this.unsubs.push(this.game.events.on(ev, fn)); }
  nextName() { const n = this.names.shift() || 'Bot'; this.names.push(n); return n; }
  get layout() { return this.game.layout; }

  // Escolhe o spawn do time mais distante dos inimigos vivos.
  spawnPoint(team) {
    const list = this.layout.spawns[team] || this.layout.spawns[0];
    let best = list[0], bestD = -1;
    for (const s of list) {
      let md = Infinity;
      for (const c of this.game.combatants) if (c.alive && c.team !== team) md = Math.min(md, Math.hypot(c.pos.x - s[0], c.pos.z - s[1]));
      md += Math.random() * 8;
      if (md > bestD) { bestD = md; best = s; }
    }
    const p = this.game.nav.nearestWalkable(best[0] + rand(-3, 3), best[1] + rand(-3, 3), 10);
    return p ? this.game.nav.center(p[0], p[1]) : best;
  }
  facingCenter(x, z) { return Math.atan2(x, z); }

  spawnBot(team, opts = {}) {
    const role = opts.role || randomRole();
    const [x, z] = opts.pos || this.spawnPoint(team);
    const ally = team === this.game.player?.team;
    const colors = ally ? this.game.profile.operator.colors : undefined;
    return this.game.spawnBot({
      team, x, z, yaw: this.facingCenter(x, z), name: opts.name || this.nextName(), role,
      loadout: opts.loadout || ROLE_LOADOUTS[role](), health: opts.health ?? 100, armor: opts.armor ?? 0,
      boss: opts.boss, scale: opts.scale, colors: opts.colors || colors,
      ai: { difficulty: opts.difficulty || this.difficulty, ally, ...(opts.ai || {}) },
    });
  }

  setupPlayer(team = 0, extra = {}) {
    const [x, z] = extra.pos || this.spawnPoint(team);
    return this.game.createPlayer(team, x, z, this.facingCenter(x, z), extra);
  }

  queueRespawn(c, delay = this.respawnDelay) { this.respawns.push({ c, t: delay }); }

  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    if (this.over) return;
    if (this.cfg.timeLimit !== 0 && this.timeLeft !== Infinity) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.onTimeUp(); }
    }
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      r.t -= dt;
      if (r.t <= 0) {
        this.respawns.splice(i, 1);
        const [x, z] = this.spawnPoint(r.c.team);
        r.c.respawn(x, z, this.facingCenter(x, z));
        if (r.c.isPlayer) this.game.viewmodel.build(r.c.weapon);
      }
    }
  }
  respawnTimeFor(c) { return this.respawns.find((r) => r.c === c)?.t ?? null; }
  onTimeUp() {
    const won = this.scores[0] > this.scores[1];
    this.finish(won, won ? 'VITÓRIA' : this.scores[0] === this.scores[1] ? 'EMPATE' : 'DERROTA', 'Tempo esgotado');
  }
  onKill(e) {}
  interact(p) {}
  prompt() { return null; }
  markers() { return []; }
  hud() { return { title: this.title, objective: this.objective, scores: this.teamBased ? this.scores : null, time: this.timeLeft }; }
  scoreboard() {
    const rows = this.game.combatants.map((c) => ({ name: c.name, team: c.team, k: c.stats.kills, d: c.stats.deaths, a: c.stats.assists, s: c.stats.score, me: c.isPlayer, alive: c.alive }));
    return rows.sort((a, b) => b.s - a.s || b.k - a.k);
  }
  finish(won, title, text, extra = {}) {
    if (this.over) return;
    this.over = true;
    // agendado em tempo de jogo: se o modo for descartado antes, nada acontece
    this.after(1.8, () => { if (this.game.mode === this) this.game.endMatch({ won, title, text, ranked: this.ranked, mode: this.cfg.mode, scoreboard: this.scoreboard(), ...extra }); });
    this.game.events.emit('matchEnding', { won, title });
  }
}
