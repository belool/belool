import * as THREE from 'three';
import { AIBrain } from './AIBrain.js';
import { Squad } from './Squad.js';
import { Director } from './Director.js';

// ================================================================
// AI MANAGER — percepção compartilhada (eventos de ruído), fila de
// pathfinding com orçamento por quadro, esquadrões e nível de detalhe
// (LOD) para centenas de bots em mapas grandes.
// ================================================================

export class AIManager {
  constructor(game) {
    this.game = game;
    this.brains = [];
    this.squads = [];
    this.noises = [];
    this.pathQueue = [];
    this.pathBudget = 6;
    this.director = new Director(game);
    this.callouts = [];
    this.lodDistance = 140; // além disso, IA simplificada
  }
  clear() { this.brains = []; this.squads = []; this.noises = []; this.pathQueue = []; this.director.reset(); }

  attach(c, opts = {}) {
    const b = new AIBrain(this.game, c, opts);
    c.brain = b;
    this.brains.push(b);
    return b;
  }
  detach(c) {
    const i = this.brains.indexOf(c.brain);
    if (i >= 0) this.brains.splice(i, 1);
    for (const s of this.squads) s.remove(c);
    c.brain = null;
  }

  // Agrupa combatentes de IA em esquadrões por equipe.
  formSquads(size = 4) {
    this.squads = [];
    const byTeam = new Map();
    for (const b of this.brains) {
      if (b.opts.noSquad) continue;
      if (!byTeam.has(b.c.team)) byTeam.set(b.c.team, []);
      byTeam.get(b.c.team).push(b.c);
    }
    for (const [team, list] of byTeam) {
      for (let i = 0; i < list.length; i += size) {
        const s = new Squad(this.game, team, list.slice(i, i + size), this.squads.length);
        this.squads.push(s);
      }
    }
  }
  squadOf(c) { return this.squads.find((s) => s.members.includes(c)); }

  addToSquad(c, size = 4) {
    let s = this.squads.find((q) => q.team === c.team && q.members.filter((m) => m.alive).length < size);
    if (!s) { s = new Squad(this.game, c.team, [], this.squads.length); this.squads.push(s); }
    s.add(c);
  }

  // Evento sonoro: tiros, passos, explosões, impactos.
  noise(pos, radius, type, source) {
    this.noises.push({ pos: pos.clone(), radius, type, source, t: this.game.time });
    if (source?.isPlayer && type === 'gunshot') this.director.onPlayerShot();
  }
  grenadeThrown(g) {
    for (const b of this.brains) b.onGrenade(g);
  }
  callout(c, text, important = false) {
    // Comunicação por rádio: aliados do jogador mostram/falam suas decisões
    const player = this.game.player;
    if (!player || c.team !== player.team || c === player) return;
    const now = this.game.time;
    if (this._lastCallout && now - this._lastCallout < (important ? 1.2 : 3.5)) return;
    this._lastCallout = now;
    this.game.events.emit('radio', { from: c.name, text });
  }

  requestPath(brain, tx, tz) {
    if (!this.pathQueue.includes(brain)) this.pathQueue.push(brain);
    brain.pendingTarget = [tx, tz];
  }

  update(dt) {
    const game = this.game;
    // ruídos expiram rápido
    const now = game.time;
    this.noises = this.noises.filter((n) => now - n.t < 0.3);
    // Pathfinding com orçamento
    let budget = this.pathBudget;
    while (budget-- > 0 && this.pathQueue.length) {
      const b = this.pathQueue.shift();
      if (!b.c.alive || !b.pendingTarget) continue;
      const [tx, tz] = b.pendingTarget;
      b.pendingTarget = null;
      const p = game.nav.findPath(b.c.pos.x, b.c.pos.z, tx, tz, game.map.large ? 8000 : 15000);
      b.setPath(p);
    }
    this.director.update(dt);
    for (const s of this.squads) s.update(dt);
    const pp = game.player?.pos;
    for (const b of this.brains) {
      if (!b.c.alive) continue;
      const far = pp && game.map.large && Math.hypot(b.c.pos.x - pp.x, b.c.pos.z - pp.z) > this.lodDistance;
      b.lod = far ? 1 : 0;
      for (const n of this.noises) if (n.t === now || now - n.t < dt * 1.5) b.hear(n);
      b.update(dt);
    }
  }
}
