import * as THREE from 'three';
import { Mode } from './Mode.js';
import { pick, rand } from '../core/util.js';

// Pontuação por abate (comum a todos os modos multijogador)
function scoreKill(mode, e) {
  if (e.killer && e.killer !== e.victim) {
    e.killer.stats.score += 100 + (e.headshot ? 50 : 0);
    if (e.killer.team !== e.victim.team) mode.scores[e.killer.team] = (mode.scores[e.killer.team] || 0) + (mode.killPoints ?? 1);
  }
  if (e.victim.isPlayer || !e.victim.isPlayer) mode.queueRespawn(e.victim);
  if (e.victim === mode.game.player) mode.game.events.emit('respawnIn', mode.respawnDelay);
}

// Gera combatentes de ambas as equipes e organiza esquadrões.
function populate(mode, teamSize) {
  const g = mode.game;
  const net = g.net;
  const online = net.isHost && mode.cfg.online;
  const hostTeam = online ? net.hostTeam() : 0;
  mode.setupPlayer(hostTeam);
  const humans = { 0: hostTeam === 0 ? 1 : 0, 1: hostTeam === 1 ? 1 : 0 };
  if (online) for (const t of [0, 1]) for (const info of net.humansFor(t)) {
    const [x, z] = mode.spawnPoint(t);
    net.spawnRemote(info, t, x, z, mode.facingCenter(x, z));
    humans[t]++;
  }
  // bots completam as equipes
  let follow = 0;
  for (let i = humans[hostTeam]; i < teamSize; i++) mode.spawnBot(hostTeam, { ai: { follow: follow < 2, followIdx: follow++ } });
  for (let i = humans[1 - hostTeam]; i < teamSize; i++) mode.spawnBot(1 - hostTeam);
  g.ai.formSquads(teamSize > 6 ? 4 : 3);
  // os dois primeiros aliados formam o esquadrão do jogador (sem squad do bot)
}

// ---------------------------------------------------------------
export class TeamDeathmatch extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.teamSize = cfg.teamSize || 5;
    this.title = `Mata-mata em equipes ${this.teamSize}x${this.teamSize}`;
    this.scoreLimit = cfg.scoreLimit || this.teamSize * 10;
    this.objective = `Primeira equipe a ${this.scoreLimit} abates vence`;
    this.ranked = true;
    this.goalTimer = 0;
  }
  setup() { populate(this, this.teamSize); }
  update(dt) {
    super.update(dt);
    this.goalTimer -= dt;
    if (this.goalTimer <= 0) {
      this.goalTimer = 25;
      const pts = Object.entries(this.layout.points).filter(([k]) => ['A', 'B', 'C'].includes(k)).map(([, v]) => v);
      for (const s of this.game.ai.squads) { const p = pick(pts); s.goal = { x: p[0], z: p[1], type: 'attack', radius: 14 }; }
    }
    if (!this.over) for (const t of [0, 1]) if (this.scores[t] >= this.scoreLimit) this.finish(t === 0, t === 0 ? 'VITÓRIA' : 'DERROTA', `${this.scores[0]} x ${this.scores[1]}`);
  }
  onKill(e) { scoreKill(this, e); }
}

// ---------------------------------------------------------------
export class Domination extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.teamSize = cfg.teamSize || 6;
    this.title = 'Dominação de território';
    this.scoreLimit = cfg.scoreLimit || 250;
    this.objective = 'Capture e mantenha os pontos A, B e C';
    this.killPoints = 0;
    this.ranked = true;
    this.zones = [];
    this.tick = 0;
  }
  setup() {
    for (const k of ['A', 'B', 'C']) {
      const [x, z] = this.layout.points[k];
      this.zones.push({ id: k, x, z, r: 6, owner: -1, progress: 0, mesh: this.makeFlag(x, z) });
    }
    populate(this, this.teamSize);
    this.assignGoals();
  }
  makeFlag(x, z) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4), new THREE.MeshStandardMaterial({ color: 0x999999 }));
    pole.position.y = 2; g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    flag.position.set(0.6, 3.5, 0); g.add(flag);
    g.position.set(x, 0, z);
    g.userData = { ring, flag };
    this.game.world.addVisual(g);
    return g;
  }
  assignGoals() {
    const squads = this.game.ai.squads;
    for (const s of squads) {
      const targets = this.zones.filter((z) => z.owner !== s.team);
      const own = this.zones.filter((z) => z.owner === s.team);
      let z;
      if (targets.length && (Math.random() < 0.75 || !own.length)) {
        const ld = s.leader;
        z = ld ? targets.sort((a, b) => Math.hypot(a.x - ld.pos.x, a.z - ld.pos.z) - Math.hypot(b.x - ld.pos.x, b.z - ld.pos.z))[Math.random() < 0.7 ? 0 : targets.length - 1] : pick(targets);
      } else z = pick(own.length ? own : this.zones);
      s.goal = { x: z.x, z: z.z, type: z.owner === s.team ? 'defend' : 'attack', radius: 4 };
    }
  }
  update(dt) {
    super.update(dt);
    if (this.over) return;
    const cols = { '-1': 0xffffff, 0: 0x4aa3ff, 1: 0xff4a4a };
    for (const z of this.zones) {
      const counts = { 0: 0, 1: 0 };
      for (const c of this.game.combatants) if (c.alive && Math.hypot(c.pos.x - z.x, c.pos.z - z.z) < z.r && c.pos.y < 3) counts[c.team]++;
      const diff = counts[0] - counts[1];
      if (diff !== 0 && !(counts[0] && counts[1])) {
        const before = z.owner;
        z.progress = Math.max(-1, Math.min(1, z.progress + Math.sign(diff) * Math.min(3, Math.abs(diff)) * 0.12 * dt));
        if (z.progress >= 1) z.owner = 0; else if (z.progress <= -1) z.owner = 1;
        else if ((z.owner === 0 && z.progress < 0) || (z.owner === 1 && z.progress > 0)) z.owner = -1;
        if (z.owner !== before && z.owner !== -1) this.onCapture(z, counts);
      }
      z.contested = counts[0] > 0 && counts[1] > 0;
      z.mesh.userData.flag.material.color.setHex(cols[z.owner]);
      z.mesh.userData.ring.material.color.setHex(z.contested ? 0xffcc33 : cols[z.owner]);
    }
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 2.5;
      for (const z of this.zones) if (z.owner >= 0) this.scores[z.owner]++;
      for (const t of [0, 1]) if (this.scores[t] >= this.scoreLimit) this.finish(t === 0, t === 0 ? 'VITÓRIA' : 'DERROTA', `${this.scores[0]} x ${this.scores[1]}`);
    }
    this.goalT = (this.goalT ?? 8) - dt;
    if (this.goalT <= 0) { this.goalT = 15; this.assignGoals(); }
  }
  onCapture(z, counts) {
    const g = this.game;
    g.audio.play('capture', null, 0.8);
    g.events.emit('toast', { title: `Ponto ${z.id} ${z.owner === g.player.team ? 'capturado' : 'perdido'}`, text: z.owner === g.player.team ? 'Mantenham a posição!' : 'Retomem o ponto!', small: true });
    const p = g.player;
    if (p.alive && z.owner === p.team && Math.hypot(p.pos.x - z.x, p.pos.z - z.z) < z.r) { g.progression.record({ type: 'capture' }); p.stats.score += 150; }
    for (const c of g.combatants) if (c.alive && !c.isPlayer && c.team === z.owner && Math.hypot(c.pos.x - z.x, c.pos.z - z.z) < z.r) c.stats.score += 150;
    this.assignGoals();
  }
  onKill(e) { scoreKill(this, e); }
  markers() { return this.zones.map((z) => ({ x: z.x, z: z.z, label: z.id, color: z.owner === -1 ? '#fff' : z.owner === 0 ? '#4aa3ff' : '#ff4a4a', ring: z.r, progress: z.progress, contested: z.contested })); }
  hud() { return { ...super.hud(), zones: this.zones.map((z) => ({ id: z.id, owner: z.owner, progress: z.progress, contested: z.contested })) }; }
}

// ---------------------------------------------------------------
// Captura de objetivo (maleta de inteligência): leve a maleta inimiga até sua base.
export class Capture extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.teamSize = cfg.teamSize || 5;
    this.title = 'Captura de objetivos';
    this.scoreLimit = cfg.scoreLimit || 3;
    this.objective = 'Roube a maleta inimiga e leve até a sua base';
    this.killPoints = 0;
    this.ranked = true;
    this.intel = {};
  }
  setup() {
    const P = this.layout.points;
    this.bases = { 0: P.baseA, 1: P.baseB };
    for (const t of [0, 1]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: t === 0 ? 0x2a6fd6 : 0xd62a2a, emissive: t === 0 ? 0x112244 : 0x441111 }));
      this.game.world.addVisual(mesh);
      const pad = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 32), new THREE.MeshBasicMaterial({ color: t === 0 ? 0x4aa3ff : 0xff4a4a, side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(this.bases[t][0], 0.05, this.bases[t][1]);
      this.game.world.addVisual(pad);
      this.intel[t] = { team: t, home: true, carrier: null, x: this.bases[t][0], z: this.bases[t][1], dropT: 0, mesh };
    }
    populate(this, this.teamSize);
    this.assign();
  }
  assign() {
    const squads = this.game.ai.squads;
    squads.forEach((s, i) => {
      const enemy = 1 - s.team;
      const ei = this.intel[enemy], own = this.intel[s.team];
      if (!own.home && !own.carrier) s.goal = { x: own.x, z: own.z, type: 'attack', radius: 2 };
      else if (own.carrier) s.goal = { x: own.carrier.pos.x, z: own.carrier.pos.z, type: 'attack', radius: 3 };
      else if (i % 2 === 0 || squads.filter((q) => q.team === s.team).length === 1) s.goal = { x: ei.x, z: ei.z, type: 'attack', radius: 2 };
      else s.goal = { x: own.x, z: own.z, type: 'defend', radius: 10 };
    });
    // carregadores de IA voltam para a base
    for (const t of [0, 1]) {
      const c = this.intel[t].carrier;
      if (c && c.brain) { const b = this.bases[c.team]; c.brain.opts.goal = { x: b[0], z: b[1], type: 'attack', radius: 1.5 }; c.brain.squad = null; }
    }
  }
  update(dt) {
    super.update(dt);
    if (this.over) return;
    for (const t of [0, 1]) {
      const I = this.intel[t];
      if (I.carrier) {
        if (!I.carrier.alive) { I.carrier = null; I.dropT = 20; this.game.events.emit('toast', { title: 'Maleta largada', text: '', small: true }); }
        else { I.x = I.carrier.pos.x; I.z = I.carrier.pos.z; }
      } else if (!I.home) {
        I.dropT -= dt;
        if (I.dropT <= 0) this.returnHome(I);
      }
      I.mesh.position.set(I.x, I.carrier ? I.carrier.pos.y + 1.3 : 0.5 + Math.sin(this.game.time * 3) * 0.1, I.z);
      I.mesh.rotation.y += dt;
      // contato
      for (const c of this.game.combatants) {
        if (!c.alive || c.pos.y > 3) continue;
        const d = Math.hypot(c.pos.x - I.x, c.pos.z - I.z);
        if (d > 1.6) continue;
        if (c.team !== t && !I.carrier && !this.carrying(c)) {
          I.carrier = c; I.home = false;
          this.game.events.emit('toast', { title: c.team === this.game.player.team ? 'Maleta inimiga capturada!' : 'Nossa maleta foi roubada!', text: c.name, small: true });
          this.game.audio.play('capture', null, 0.6);
          if (c.brain) { c.brain.say('Peguei a maleta! Me cubram!', true); }
          this.assign();
        } else if (c.team === t && !I.home && !I.carrier) { this.returnHome(I); c.stats.score += 100; }
      }
    }
    // entrega
    for (const t of [0, 1]) {
      const I = this.intel[1 - t];
      const c = I.carrier;
      if (!c || c.team !== t) continue;
      const b = this.bases[t];
      if (Math.hypot(c.pos.x - b[0], c.pos.z - b[1]) < 2.8 && this.intel[t].home) {
        this.scores[t]++;
        c.stats.score += 500;
        if (c.isPlayer) this.game.progression.record({ type: 'capture' });
        this.game.events.emit('toast', { title: t === this.game.player.team ? 'CAPTURA!' : 'O inimigo capturou a maleta', text: `${this.scores[0]} x ${this.scores[1]}` });
        this.game.audio.play('capture', null, 1);
        if (c.brain) c.brain.opts.goal = null;
        this.returnHome(I);
        if (this.scores[t] >= this.scoreLimit) this.finish(t === 0, t === 0 ? 'VITÓRIA' : 'DERROTA', `${this.scores[0]} x ${this.scores[1]}`);
      }
    }
    this.assignT = (this.assignT ?? 5) - dt;
    if (this.assignT <= 0) { this.assignT = 6; this.assign(); }
  }
  carrying(c) { return this.intel[0].carrier === c || this.intel[1].carrier === c; }
  returnHome(I) {
    if (I.carrier?.brain) I.carrier.brain.opts.goal = null;
    I.carrier = null; I.home = true; I.x = this.bases[I.team][0]; I.z = this.bases[I.team][1];
    this.assign();
  }
  onKill(e) { scoreKill(this, e); }
  markers() {
    const m = [];
    for (const t of [0, 1]) {
      const I = this.intel[t];
      m.push({ x: I.x, z: I.z, label: t === 0 ? '◆' : '◇', color: t === 0 ? '#4aa3ff' : '#ff4a4a', always: true });
      m.push({ x: this.bases[t][0], z: this.bases[t][1], label: t === 0 ? 'BASE' : 'INIMIGO', color: t === 0 ? '#4aa3ff' : '#ff4a4a', ring: 2.6 });
    }
    return m;
  }
  hud() {
    const p = this.game.player;
    const carrying = p && this.intel[1].carrier === p;
    return { ...super.hud(), objective: carrying ? 'Leve a maleta até a SUA base!' : this.objective };
  }
}
