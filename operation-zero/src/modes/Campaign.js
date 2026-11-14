import * as THREE from 'three';
import { Mode, ROLE_LOADOUTS, randomRole } from './Mode.js';
import { MISSIONS, CHARACTERS, epilogue } from './campaignData.js';
import { pick, rand } from '../core/util.js';

// ================================================================
// CAMPANHA — executor de missões orientado a dados: objetivos
// sequenciais (ir, eliminar, destruir, defender, coletar, resgatar,
// escolha, chefe), diálogos de rádio, aliados com personalidade,
// checkpoints salvos e escolhas que alteram as missões seguintes.
// ================================================================

const ALLY_ROLES = { rook: 'heavy', faisca: 'smg', lobo: 'rifleman', talia: 'marksman' };

export class Campaign extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.mission = MISSIONS[cfg.mission || 'm1'];
    this.title = `Missão ${this.mission.num} — ${this.mission.name}`;
    this.teamBased = false;
    this.timeLeft = Infinity;
    this.idx = cfg.checkpoint || 0;
    this.groups = {};
    this.allies = [];
    this.hostages = [];
    this.targets = [];
    this.choices = game.profile.campaign.choices;
    this.difficulty = cfg.difficulty || game.settings.difficulty;
  }

  setup() {
    const g = this.game, M = this.mission;
    for (const s of M.structures || []) this.addStructure(s);
    // posição inicial (checkpoint)
    let start = M.start;
    if (this.idx > 0) { const prev = M.objectives[this.idx - 1]; start = prev.at || prev.targets?.[0] || start; }
    const sp = g.nav.nearestWalkable(start[0], start[1], 15);
    const [px, pz] = sp ? g.nav.center(sp[0], sp[1]) : start;
    const p = g.createPlayer(0, px, pz, Math.atan2(px, pz), { regen: true });
    // aliados
    const allyIds = [...M.allies];
    if (M.id === 'm4' && this.choices.path === 'rescue') allyIds.push('lobo', 'talia');
    allyIds.forEach((id, i) => this.spawnAlly(id, px + (i + 1) * 1.5, pz - 2, i));
    // inimigos
    for (const [gid, gdef] of Object.entries(M.groups)) {
      const obj = gdef.obj ?? 99;
      const spawnAt = gdef.spawnAt ?? 0;
      if (obj < this.idx) continue;
      if (spawnAt <= this.idx && (gdef.spawnAt === undefined || spawnAt === this.idx || obj >= this.idx)) this.spawnGroup(gid);
    }
    g.ai.formSquads(4);
    for (const a of this.allies) { g.ai.squadOf(a)?.remove(a); a.brain.squad = null; }
    this.revealIntel = M.id === 'm4' && this.choices.path === 'convoy';
    this.on('kill', (e) => this.allyBanter(e));
    this.on('damage', (e) => { if (e.victim.charId && Math.random() < 0.15) this.line(e.victim.charId, 'hurt'); });
    this.startObjective(this.idx, true);
    g.events.emit('missionStart', { mission: M });
  }

  addStructure(s) {
    const w = this.game.world;
    let box;
    if (s.truck) {
      const [x, z] = s.truck;
      box = w.addBox(x, 1.4, z, 2.6, 2.8, 6.4, 'metal', { tint: 0x5a5a3a, destructible: true, explosiveOnly: true, hp: 250, tag: 'truck' });
    } else if (s.gate) {
      const [x, z] = s.gate;
      box = w.addBox(x, 2, z, 7.4, 4, 1, 'metal', { tint: 0x444a50, destructible: true, explosiveOnly: true, hp: 300, tag: 'gate' });
    }
    if (box) {
      w._makeMesh(box);
      this.game.nav.rasterize(w.boxes, 0.36, { minX: box.min.x, minZ: box.min.z, maxX: box.max.x, maxZ: box.max.z });
    }
  }

  spawnAlly(id, x, z, i) {
    const ch = CHARACTERS[id];
    const role = ALLY_ROLES[id] || 'rifleman';
    const c = this.spawnBot(0, { pos: [x, z], role, name: ch.short, health: 220, ai: { follow: true, followIdx: i, noSquad: true, difficulty: 'hard' } });
    c.charId = id;
    c.regen = true;
    this.allies.push(c);
    return c;
  }

  spawnGroup(gid) {
    const g = this.game, gdef = this.mission.groups[gid];
    const list = [];
    for (let i = 0; i < gdef.count; i++) {
      const a = (i / gdef.count) * Math.PI * 2;
      const r = gdef.count > 1 ? rand(1.5, gdef.spread) : 0;
      const q = g.nav.nearestWalkable(gdef.at[0] + Math.cos(a) * r, gdef.at[1] + Math.sin(a) * r, 10);
      if (!q) continue;
      const pos = g.nav.center(q[0], q[1]);
      const boss = gdef.boss;
      const role = boss?.role || gdef.roles?.[i] || randomRole();
      const c = this.spawnBot(1, {
        pos, role, boss: !!boss, name: boss?.name, health: boss?.health ?? 100, armor: boss?.armor ?? (this.mission.num >= 3 ? 25 : 0),
        ai: { guard: !!gdef.guard, holdPos: gdef.guard ? pos : null, goal: gdef.guard ? null : { x: gdef.at[0], z: gdef.at[1], type: 'patrol', radius: gdef.spread + 6 }, boss: !!boss, noRetreat: !!boss },
      });
      if (boss) { c.isBoss = true; c.krane = !!boss.krane; if (boss.krane) { c.damageTakenMul = 0.75; c.grenades.frag = 99; } }
      c.group = gid;
      list.push(c);
    }
    this.groups[gid] = (this.groups[gid] || []).concat(list);
    if (this.game.ai.squads.length) { for (const c of list) { c.brain.squad = null; this.game.ai.addToSquad(c, 4); } }
    return list;
  }

  get obj() { return this.mission.objectives[this.idx]; }

  say(lines) {
    if (!lines) return;
    lines.forEach(([who, text], i) => setTimeout(() => {
      if (this.game.mode !== this || (this.over && !this.outroOk)) return;
      const ch = CHARACTERS[who];
      this.game.events.emit('radio', { from: ch?.short || who, text, story: true });
      this.game.audio.play('radio');
      this.game.audio.say(text, ch?.voice ?? 0);
    }, i * 3600));
  }
  line(charId, kind) {
    const ch = CHARACTERS[charId];
    const l = ch?.lines?.[kind];
    if (!l) return;
    const now = this.game.time;
    if (now - (this.lastBanter || -99) < 6) return;
    this.lastBanter = now;
    this.game.events.emit('radio', { from: ch.short, text: pick(l) });
  }
  allyBanter(e) { if (e.killer?.charId && Math.random() < 0.5) this.line(e.killer.charId, 'kill'); }

  startObjective(i, initial = false) {
    const g = this.game, M = this.mission;
    this.idx = i;
    const o = this.obj;
    if (!o) return this.complete();
    // checkpoint salvo
    g.profile.campaign.checkpoint = { mission: M.id, obj: i };
    g.saveAll();
    if (!initial) g.events.emit('toast', { title: 'Novo objetivo', text: o.text, small: true });
    if (!initial) for (const [gid, gdef] of Object.entries(M.groups)) if (gdef.spawnAt === i && !this.groups[gid]) this.spawnGroup(gid);
    this.say(o.say);
    this.objState = { t: 0, planted: [], waveI: 0, waveT: 3 };
    if (o.type === 'destroy') this.targets = (o.targets || [o.at]).map((p) => ({ x: p[0], z: p[1], planted: false, done: false }));
    if (o.type === 'choice') this.after((o.say?.length || 0) * 3.6 + 0.5, () => this.openChoice(o));
    // movimenta aliados de IA "incapacitados" de volta
    for (const a of this.allies) if (!a.alive) { const p = g.player.pos; a.respawn(p.x + rand(-2, 2), p.z - 2, g.player.yaw); }
  }

  openChoice(o) {
    if (this.over || this.choiceOpen) return;
    this.choiceOpen = true;
    this.game.state = 'dialog';
    this.game.input.unlock();
    this.game.events.emit('choice', { title: o.text, options: o.options, pick: (k) => this.choose(o, k) });
  }
  choose(o, k) {
    const opt = o.options[k];
    Object.assign(this.choices, opt.set || {});
    this.game.profile.campaign.choices = this.choices;
    this.choiceOpen = false;
    this.game.state = 'playing';
    if (!this.game.testMode) this.game.input.lock();
    if (opt.onPick) opt.onPick();
    this.chosenNext = opt.next;
    this.advance();
  }

  advance() {
    this.game.progression.record({ type: 'objective', text: 'Objetivo concluído' });
    this.game.audio.play('capture', null, 0.7);
    this.startObjective(this.idx + 1);
  }

  complete() {
    const g = this.game, M = this.mission;
    const camp = g.profile.campaign;
    camp.completed[M.id] = true;
    camp.checkpoint = null;
    const next = this.chosenNext || M.next;
    if (next) camp.unlocked = Math.max(camp.unlocked, MISSIONS[next].num);
    if (next) camp.nextMission = next;
    g.progression.addXp(1000, 'Missão cumprida');
    if (M.id === 'm4') camp.completed.m4 = true;
    this.outroOk = true;
    this.say(M.outro);
    const text = M.id === 'm4' ? epilogue(this.choices).join('\n') : M.summary;
    this.finish(true, M.id === 'm4' ? 'OPERAÇÃO ZERO CONCLUÍDA' : 'MISSÃO CUMPRIDA', text, { campaign: { next, mission: M.id } });
  }

  aliveIn(gids) { return gids.flatMap((g) => this.groups[g] || []).filter((c) => c.alive); }

  update(dt) {
    super.update(dt);
    if (this.over) return;
    const g = this.game, p = g.player, o = this.obj;
    if (!o || !p) return;
    const st = this.objState;
    st.t += dt;
    const near = (pt, r) => Math.hypot(p.pos.x - pt[0], p.pos.z - pt[1]) < r;
    switch (o.type) {
      case 'goto':
        if (o.escort && this.hostages.length && this.hostages.every((h) => !h.alive)) return this.fail('A Equipe Sombra foi perdida.');
        if (near(o.at, o.r ?? 6)) this.advance();
        break;
      case 'eliminate':
        if (st.t > 1 && this.aliveIn(o.groups).length === 0) this.advance();
        break;
      case 'boss': {
        const boss = (this.groups.krane || [])[0];
        if (boss && boss.alive && !boss.surrendered) this.bossPhases(boss);
        if (boss && !boss.alive && !this.bossDone && !boss.surrendered) { this.bossDone = true; this.choices.krane = 'killed'; this.after(2.5, () => this.advance()); }
        break;
      }
      case 'destroy':
        if (this.targets.every((t) => t.done)) this.advance();
        break;
      case 'defend': {
        const inside = near(o.at, (o.r ?? 12) * 1.8);
        if (inside) st.d = (st.d || 0) + dt;
        st.waveT -= dt;
        const waves = o.waves || [];
        if (st.waveI < waves.length && st.waveT <= 0) {
          const w = waves[st.waveI++];
          st.waveT = o.duration / (waves.length + 0.5);
          const gid = `wave_${this.idx}_${st.waveI}`;
          this.mission.groups[gid] = { count: w.count, at: w.from, spread: 5, roles: w.roles, obj: this.idx };
          const list = this.spawnGroup(gid);
          for (const c of list) { c.brain.opts.goal = { x: o.at[0], z: o.at[1], type: 'attack', radius: 6 }; c.brain.opts.guard = false; }
          for (const s of g.ai.squads) if (s.team === 1 && s.members.some((m) => list.includes(m))) s.goal = { x: o.at[0], z: o.at[1], type: 'attack', radius: 6 };
          if (st.waveI === 1) this.say([['vega', 'Inimigos convergindo na sua posição!']]);
        }
        this.defendLeft = Math.max(0, o.duration - (st.d || 0));
        this.defendAway = !inside;
        if ((st.d || 0) >= o.duration) this.advance();
        break;
      }
      default: break;
    }
  }

  bossPhases(boss) {
    const g = this.game;
    const hp = boss.health / boss.maxHealth;
    this.bossPhase = this.bossPhase || 0;
    if (hp < 0.66 && this.bossPhase === 0) {
      this.bossPhase = 1;
      this.say([['krane', 'Guardas! Ao QG, agora!']]);
      this.mission.groups.reinf1 = { count: 4, at: [-30, 30], spread: 6, obj: this.idx };
      for (const c of this.spawnGroup('reinf1')) c.brain.opts.goal = { x: 0, z: 30, type: 'attack', radius: 8 };
    } else if (hp < 0.33 && this.bossPhase === 1) {
      this.bossPhase = 2;
      this.say([['krane', 'Vocês acham que isso acabou? Eu SOU esta guerra!']]);
      this.mission.groups.reinf2 = { count: 4, at: [30, 30], spread: 6, obj: this.idx, roles: ['breacher', 'breacher', 'heavy', 'smg'] };
      for (const c of this.spawnGroup('reinf2')) c.brain.opts.goal = { x: 0, z: 30, type: 'attack', radius: 8 };
      boss.speedMul = 1.25;
    } else if (hp < 0.12 && this.bossPhase === 2) {
      // Krane se rende: escolha final
      this.bossPhase = 3;
      boss.surrendered = true;
      boss.health = Math.max(boss.health, 30);
      boss.damageTakenMul = 0;
      g.ai.detach(boss);
      boss.intent.fire = false; boss.intent.forward = boss.intent.right = 0; boss.intent.crouch = true;
      for (const c of this.aliveIn(['guard', 'reinf1', 'reinf2'])) c.takeDamage(999, { attacker: null, region: 'chest' });
      this.say([['krane', 'Chega... chega! Eu me rendo. Você não é um assassino, soldado. É?'], ['vega', 'Zero, a decisão é sua.']]);
      this.after(7.5, () => this.openChoice({
        text: 'O General Krane se rendeu',
        options: [
          { label: 'Prender Krane', desc: 'Levá-lo a julgamento. Seus crimes serão expostos ao mundo.', set: { krane: 'capture' }, onPick: () => { boss.damageTakenMul = 0; } },
          { label: 'Executar Krane', desc: 'Encerrar a guerra aqui, esta noite. Sem julgamento, sem segredos revelados.', set: { krane: 'execute' }, onPick: () => { boss.damageTakenMul = 1; boss.takeDamage(9999, { attacker: g.player, region: 'head', weapon: g.player.weapon.id }); } },
        ],
      }));
    }
  }

  interact(p) {
    const o = this.obj;
    if (!o) return;
    const near = (x, z, r = 3) => Math.hypot(p.pos.x - x, p.pos.z - z) < r;
    if (o.type === 'destroy') {
      for (const t of this.targets) {
        if (t.planted || !near(t.x, t.z, 3.2)) continue;
        t.planted = true;
        this.game.throwables.plant(new THREE.Vector3(t.x, 0.6, t.z), 6, () => { t.done = true; });
        this.game.events.emit('toast', { title: 'C4 plantado', text: 'Afaste-se! Detonação em 6 segundos', small: true });
        this.game.audio.play('pin', null, 1);
        return;
      }
    } else if (o.type === 'collect' && near(o.at[0], o.at[1], 3.5)) {
      this.game.events.emit('toast', { title: 'Inteligência recuperada', text: 'Documentos de Krane obtidos', small: true });
      this.advance();
    } else if (o.type === 'rescue' && near(o.at[0], o.at[1], 5)) {
      (o.hostages || []).forEach((id, i) => {
        const h = this.spawnAlly(id, o.at[0] + i, o.at[1], this.allies.length);
        h.health = 120;
        this.hostages.push(h);
      });
      this.game.events.emit('toast', { title: 'Equipe Sombra libertada', text: 'Lobo e Tália se juntaram ao esquadrão', small: true });
      this.say([['talia', 'Me dá uma arma e me aponta pro inimigo.']]);
      this.advance();
    }
  }
  prompt() {
    const o = this.obj, p = this.game.player;
    if (!o || !p?.alive) return null;
    const near = (x, z, r = 3) => Math.hypot(p.pos.x - x, p.pos.z - z) < r;
    if (o.type === 'destroy') for (const t of this.targets) if (!t.planted && near(t.x, t.z, 3.2)) return '[E] Plantar C4';
    if (o.type === 'collect' && near(o.at[0], o.at[1], 3.5)) return '[E] Coletar documentos';
    if (o.type === 'rescue' && near(o.at[0], o.at[1], 5)) return '[E] Libertar prisioneiros';
    return null;
  }

  fail(reason) {
    this.finish(false, 'MISSÃO FALHOU', reason, { campaign: { retry: { mission: this.mission.id, checkpoint: this.idx } } });
  }
  onKill(e) {
    const g = this.game;
    if (e.killer?.isPlayer && e.victim.team === 1) e.killer.stats.score += 100;
    if (e.victim === g.player) return this.fail('Você foi abatido. Retome do último checkpoint.');
    if (e.victim.charId && !this.hostages.includes(e.victim)) {
      g.events.emit('radio', { from: 'Vega', text: `${e.victim.name} está fora de combate! Vai se recuperar no próximo objetivo.` });
    }
  }

  markers() {
    const o = this.obj, m = [];
    if (o) {
      if (o.type === 'destroy') for (const t of this.targets) { if (!t.done) m.push({ x: t.x, z: t.z, label: t.planted ? '!' : 'C4', color: '#ffcc33', always: true, objective: true }); }
      else if (o.at) m.push({ x: o.at[0], z: o.at[1], label: '★', color: '#ffcc33', always: true, objective: true, ring: o.type === 'defend' ? o.r : undefined });
      else if (o.groups) for (const c of this.aliveIn(o.groups)) if (c.isBoss) m.push({ x: c.pos.x, z: c.pos.z, label: '☠', color: '#ff3333', always: true, objective: true });
    }
    if (this.revealIntel) for (const c of this.game.combatants) if (c.alive && c.team === 1) m.push({ x: c.pos.x, z: c.pos.z, enemy: true, color: '#ff4444', dot: true });
    return m;
  }
  hud() {
    const o = this.obj;
    let objective = o ? o.text : '';
    if (o?.type === 'eliminate' || o?.type === 'boss') objective += ` (${this.aliveIn(o.groups).length} restantes)`;
    if (o?.type === 'destroy' && this.targets.length > 1) objective += ` (${this.targets.filter((t) => t.done).length}/${this.targets.length})`;
    if (o?.type === 'defend') objective += ` — ${Math.ceil(this.defendLeft ?? o.duration)}s${this.defendAway ? ' (VOLTE À ÁREA!)' : ''}`;
    const boss = (this.groups.krane || this.groups.saad || []).find((c) => c.alive && c.isBoss);
    return { title: this.title, objective, time: null, boss: boss ? { name: boss.name, hp: boss.health / boss.maxHealth } : null };
  }
}
