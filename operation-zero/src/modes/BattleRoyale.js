import * as THREE from 'three';
import { Mode, ROLE_LOADOUTS } from './Mode.js';
import { WeaponInstance } from '../combat/WeaponInstance.js';
import { WEAPONS } from '../combat/weapons.js';
import { Vehicle } from '../entities/Vehicle.js';
import { pick, rand, clamp } from '../core/util.js';

// ================================================================
// BATTLE ROYALE — até 100 participantes, mapa grande, saque, zona
// progressivamente reduzida, paraquedas, veículos e equipamentos.
// Bots distantes rodam em IA LOD (simulação abstrata) para desempenho.
// ================================================================

const LOOT_WEAPONS = ['p9', 'r45', 'vespa', 'mpx9', 'ar4', 'kr47', 'breacher', 'dmr14', 'longbow', 'titan'];
const PHASES = [
  { wait: 70, shrink: 50, frac: 0.62, dps: 1 },
  { wait: 55, shrink: 40, frac: 0.55, dps: 2 },
  { wait: 45, shrink: 35, frac: 0.5, dps: 4 },
  { wait: 40, shrink: 30, frac: 0.45, dps: 7 },
  { wait: 30, shrink: 25, frac: 0.35, dps: 10 },
  { wait: 25, shrink: 25, frac: 0, dps: 15 },
];

export class BattleRoyale extends Mode {
  constructor(game, cfg) {
    super(game, cfg);
    this.title = 'Battle Royale';
    this.teamBased = false;
    this.timeLeft = Infinity;
    this.count = clamp(cfg.players || 60, 10, 100);
    this.objective = 'Saqueie, sobreviva e seja o último de pé';
    this.loot = [];
    this.phase = -1; this.phaseT = 0; this.shrinking = false;
    this.placement = 0;
  }
  setup() {
    const g = this.game, S = g.map.size;
    // zona inicial
    this.zone = { x: 0, z: 0, r: S * 1.45 };
    this.next = { ...this.zone };
    this.from = { ...this.zone };
    this.phaseT = 40; // tempo até a primeira contração
    // saque
    const geoW = new THREE.BoxGeometry(0.9, 0.18, 0.25), geoS = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const mats = {
      weapon: new THREE.MeshStandardMaterial({ color: 0xffc040, emissive: 0x553300 }),
      ammo: new THREE.MeshStandardMaterial({ color: 0x55aa55, emissive: 0x113311 }),
      armor: new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x112244 }),
      med: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x442222 }),
      grenade: new THREE.MeshStandardMaterial({ color: 0x667744, emissive: 0x222211 }),
    };
    const spots = g.builder.lootSpots.slice();
    for (let i = 0; i < 160; i++) { const p = g.nav.randomWalkable(); if (p) spots.push([p[0], 0, p[1]]); }
    for (const s of spots) {
      const r = Math.random();
      const type = r < 0.4 ? 'weapon' : r < 0.62 ? 'ammo' : r < 0.77 ? 'armor' : r < 0.9 ? 'med' : 'grenade';
      const item = { type, x: s[0], y: s[1], z: s[2] };
      if (type === 'weapon') item.id = pick(LOOT_WEAPONS);
      if (type === 'grenade') item.id = pick(['frag', 'frag', 'smoke', 'flash']);
      if (type === 'armor') item.amount = pick([50, 50, 100]);
      item.mesh = new THREE.Mesh(type === 'weapon' ? geoW : geoS, mats[type]);
      item.mesh.position.set(item.x, item.y + 0.4, item.z);
      g.world.addVisual(item.mesh);
      this.loot.push(item);
    }
    // muralha da zona
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 220, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a8cff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    wall.position.y = 100;
    g.world.addVisual(wall);
    this.wall = wall;
    // veículos
    for (const t of g.layout.towns || []) {
      if (Math.random() < 0.7) {
        const p = g.nav.nearestWalkable(t.x + rand(-30, 30), t.z + rand(-30, 30), 12);
        if (p) { const [x, z] = g.nav.center(p[0], p[1]); g.vehicles.push(new Vehicle(g, x, z, rand(0, 6), pick([0x4a5a3a, 0x6a5a3a, 0x3a4a5a]))); }
      }
    }
    // jogador: salto de paraquedas
    const [px, pz] = g.nav.randomWalkable() || [0, 0];
    const p = g.createPlayer(0, px, pz, rand(0, 6), { loadout: { primary: null, secondary: null, equipment: { frag: 0, smoke: 0, flash: 0 } }, regen: false });
    p.weapons = [];
    p.pos.y = 140; p.parachute = true;
    g.viewmodel.build(p.weapon);
    // jogadores online: cada um salta de um ponto aleatório, em sua própria equipe
    const net = g.net;
    const remotes = net.isHost && this.cfg.online ? net.humansFor(0) : [];
    remotes.forEach((info) => {
      const [x, z] = g.nav.randomWalkable() || [0, 0];
      const c = net.spawnRemote(info, 5000 + info.id, x, z, rand(0, 6), { loadout: { equipment: { frag: 0, smoke: 0, flash: 0 } }, regen: false, y: 140, parachute: true });
      c.weapons = [];
    });
    this.count = Math.max(this.count, remotes.length + 2);
    // bots já em solo (pousaram), cada um em sua própria equipe
    for (let i = 0; i < this.count - 1 - remotes.length; i++) {
      const pos = g.nav.randomWalkable();
      const armed = Math.random() < 0.12;
      const c = this.spawnBot(10 + i, { pos, loadout: armed ? { primary: { id: pick(['p9', 'vespa', 'r45']) }, equipment: {} } : { equipment: {} }, ai: { noSquad: true } });
      c.regen = false;
      c.brain.opts.goal = null;
    }
    this.lootT = 0;
  }

  aliveCount() { return this.game.combatants.filter((c) => c.alive).length; }
  inZone(x, z) { return Math.hypot(x - this.zone.x, z - this.zone.z) <= this.zone.r; }

  update(dt) {
    super.update(dt);
    if (this.over) return;
    const g = this.game;
    // fases da zona
    this.phaseT -= dt;
    if (this.phaseT <= 0) {
      if (!this.shrinking) {
        this.phase = Math.min(this.phase + 1, PHASES.length - 1);
        const ph = PHASES[this.phase];
        this.from = { ...this.zone };
        const nr = this.zone.r * ph.frac;
        const off = (this.zone.r - nr) * Math.random() * 0.8, a = Math.random() * Math.PI * 2;
        let nx = this.zone.x + Math.cos(a) * off, nz = this.zone.z + Math.sin(a) * off;
        const S = g.map.size - 20;
        nx = clamp(nx, -S + nr * 0.5, S - nr * 0.5); nz = clamp(nz, -S + nr * 0.5, S - nr * 0.5);
        this.next = { x: nx, z: nz, r: nr };
        this.shrinking = true; this.phaseT = ph.shrink; this.shrinkDur = ph.shrink;
        g.events.emit('toast', { title: 'A zona está se fechando!', text: `Fase ${this.phase + 1}`, small: true });
        g.audio.play('zone');
      } else {
        this.shrinking = false;
        this.zone = { ...this.next };
        this.phaseT = PHASES[Math.min(this.phase + 1, PHASES.length - 1)].wait;
      }
    }
    if (this.shrinking) {
      const k = 1 - this.phaseT / this.shrinkDur;
      this.zone.x = this.from.x + (this.next.x - this.from.x) * k;
      this.zone.z = this.from.z + (this.next.z - this.from.z) * k;
      this.zone.r = this.from.r + (this.next.r - this.from.r) * k;
    }
    this.wall.position.x = this.zone.x; this.wall.position.z = this.zone.z;
    this.wall.scale.set(Math.max(0.1, this.zone.r), 1, Math.max(0.1, this.zone.r));
    const dps = this.phase >= 0 ? PHASES[this.phase].dps : 0.5;
    for (const c of g.combatants) {
      if (!c.alive) continue;
      if (!this.inZone(c.pos.x, c.pos.z)) {
        c.zoneT = (c.zoneT || 0) + dt;
        if (c.zoneT > 1) { c.zoneT = 0; c.takeDamage(dps, { attacker: null, region: 'chest', weapon: 'zone', zone: true }); }
      }
    }
    // saque e objetivos dos bots
    this.lootT -= dt;
    if (this.lootT <= 0) {
      this.lootT = 1.0;
      for (const c of g.combatants) {
        if (!c.alive || c.isPlayer || !c.brain) continue;
        const b = c.brain;
        // pega saque próximo automaticamente
        for (const it of this.loot.slice()) {
          if (it.taken || g.time < (it.noPick || 0)) continue;
          if (it.type === 'weapon' && c.weapons.length >= 2) continue;
          if (Math.hypot(it.x - c.pos.x, it.z - c.pos.z) < 2 && Math.abs(it.y - c.pos.y) < 2) this.take(c, it);
        }
        const needWeapon = !c.weapons.length || (c.weapons.length < 2 && Math.random() < 0.3);
        const zoneD = Math.hypot(c.pos.x - this.next.x, c.pos.z - this.next.z);
        if (zoneD > this.next.r * 0.85 || !this.inZone(c.pos.x, c.pos.z)) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * this.next.r * 0.6;
          b.opts.goal = { x: this.next.x + Math.cos(a) * r, z: this.next.z + Math.sin(a) * r, type: 'attack', radius: 10 };
        } else if (needWeapon) {
          let best = null, bd = 90;
          for (const it of this.loot) {
            if (it.taken || it.type !== 'weapon') continue;
            const d = Math.hypot(it.x - c.pos.x, it.z - c.pos.z);
            if (d < bd && it.y < 1) { bd = d; best = it; }
          }
          b.opts.goal = best ? { x: best.x, z: best.z, type: 'attack', radius: 0.5 } : null;
        } else if (b.opts.goal && Math.random() < 0.1) b.opts.goal = null;
      }
    }
    // animação do saque
    const t = g.time;
    const pp = g.player.pos;
    for (const it of this.loot) {
      if (it.taken) continue;
      const near = Math.abs(it.x - pp.x) < 90 && Math.abs(it.z - pp.z) < 90;
      it.mesh.visible = near;
      if (near) { it.mesh.rotation.y = t * 1.5; it.mesh.position.y = it.y + 0.4 + Math.sin(t * 2 + it.x) * 0.08; }
    }
  }

  nearestLoot(c, r = 2.2) {
    let best = null, bd = r;
    for (const it of this.loot) {
      if (it.taken || this.game.time < (it.noPick || 0)) continue;
      const d = Math.hypot(it.x - c.pos.x, it.z - c.pos.z) + Math.abs(it.y - c.pos.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  nearestVehicle(c, r = 3.5) { return this.game.vehicles.find((v) => v.alive && !v.driver && v.pos.distanceTo(c.pos) < r); }

  take(c, it) {
    it.taken = true;
    if (this.game.net.isHost) this.game.net.queue.push(['lt', this.loot.indexOf(it)]);
    this.game.world.root.remove(it.mesh);
    const g = this.game;
    if (it.type === 'weapon') {
      const w = new WeaponInstance(it.id, { optic: WEAPONS[it.id].defaultOptic || (Math.random() < 0.4 ? 'reddot' : 'none') }, 'fmj');
      w.reserve = w.stats.mag * 2;
      if (c.weapons.length < 2) { c.weapons.push(w); c.slot = c.weapons.length - 1; }
      else {
        // troca a arma atual e larga a antiga no chão
        const old = c.weapons[c.slot];
        c.weapons[c.slot] = w;
        this.drop(c, { type: 'weapon', id: old.id });
      }
      if (c.isPlayer) g.events.emit('weaponChanged', c);
    } else if (it.type === 'ammo') { for (const w of c.weapons) w.addAmmo(2); }
    else if (it.type === 'armor') c.armor = Math.min(100, c.armor + it.amount);
    else if (it.type === 'med') c.health = Math.min(c.maxHealth, c.health + 50);
    else if (it.type === 'grenade') c.grenades[it.id] = (c.grenades[it.id] || 0) + 1;
    if (c.isPlayer) { g.audio.play('reload_end', null, 0.6); g.events.emit('toast', { title: 'Item coletado', text: this.lootName(it), small: true }); }
    if (c.remote) g.net.sendLoadout(c);
  }
  lootName(it) {
    return it.type === 'weapon' ? WEAPONS[it.id].name : it.type === 'ammo' ? 'Munição' : it.type === 'armor' ? `Colete (+${it.amount})` : it.type === 'med' ? 'Kit médico (+50)' : { frag: 'Granada de fragmentação', smoke: 'Granada de fumaça', flash: 'Granada de atordoamento' }[it.id];
  }
  drop(c, spec) {
    const item = { ...spec, x: c.pos.x + rand(-1, 1), y: Math.max(0, c.pos.y), z: c.pos.z + rand(-1, 1), noPick: this.game.time + 3 };
    const mat = new THREE.MeshStandardMaterial({ color: spec.type === 'weapon' ? 0xffc040 : 0x55aa55, emissive: 0x332200 });
    item.mesh = new THREE.Mesh(spec.type === 'weapon' ? new THREE.BoxGeometry(0.9, 0.18, 0.25) : new THREE.BoxGeometry(0.35, 0.35, 0.35), mat);
    item.mesh.position.set(item.x, item.y + 0.4, item.z);
    this.game.world.addVisual(item.mesh);
    this.loot.push(item);
    if (this.game.net.isHost) this.game.net.queue.push(['la', item.type, item.id || '', Math.round(item.x * 100) / 100, Math.round(item.y * 100) / 100, Math.round(item.z * 100) / 100]);
  }

  interact(p) {
    if (p.vehicle) { p.vehicle.exit(p); this.game.viewmodel.build(p.weapon); return; }
    const it = this.nearestLoot(p);
    if (it) { this.take(p, it); return; }
    const v = p.remote ? null : this.nearestVehicle(p);
    if (v) { v.enter(p); this.game.vehCamYaw = 0; this.game.audio.play('engine', null, 0.6); }
  }
  prompt(p = this.game.player) {
    if (!p?.alive) return null;
    if (p.vehicle) return '[E] Sair do veículo  ·  W/S acelerar  ·  A/D esterçar  ·  Espaço freio';
    if (p.parachute) return 'Paraquedas: use WASD para planar até o solo';
    const it = this.nearestLoot(p);
    if (it) return `[E] Pegar: ${this.lootName(it)}`;
    if (!p.remote && this.nearestVehicle(p)) return '[E] Dirigir jipe';
    return null;
  }

  onKill(e) {
    const g = this.game;
    const v = e.victim;
    if (e.killer && e.killer !== v) e.killer.stats.score += 100;
    // espólio do derrotado
    if (!v.isPlayer) {
      for (const w of v.weapons) if (Math.random() < 0.7) this.drop(v, { type: 'weapon', id: w.id });
      if (Math.random() < 0.6) this.drop(v, { type: 'ammo' });
      this.after(15, () => { if (g.combatants.includes(v)) g.removeCombatant(v); });
    }
    const alive = this.aliveCount();
    if (v === g.player && alive > 1 && g.combatants.some((c) => c.alive && c.human)) {
      // online: o anfitrião eliminado continua simulando a partida para os outros
      this.placement = alive + 1;
      this.recordBoard(this.placement);
      g.events.emit('toast', { title: 'ELIMINADO', text: `#${this.placement} — a partida continua para os outros jogadores` });
    } else if (v === g.player) {
      this.placement = alive + 1;
      this.recordBoard(this.placement);
      this.finish(false, 'ELIMINADO', `Você ficou em #${this.placement} de ${this.count}`, { br: { placement: this.placement } });
    } else if (alive === 1 && !g.player.alive) {
      const w = g.combatants.find((c) => c.alive);
      this.finish(false, 'FIM DA PARTIDA', `${w?.name || '?'} venceu entre ${this.count} combatentes`, { br: { placement: this.placement } });
    } else if (alive === 1 && g.player.alive) {
      this.placement = 1;
      g.profile.stats.brWins++;
      this.recordBoard(1);
      this.finish(true, 'VITÓRIA! #1', `Último de pé entre ${this.count} combatentes`, { br: { placement: 1 } });
    }
  }
  recordBoard(place) {
    const prof = this.game.profile, p = this.game.player;
    const b = prof.leaderboards.br;
    b.push({ name: prof.operator.callsign, place, kills: p.stats.kills, of: this.count, date: new Date().toLocaleDateString('pt-BR') });
    b.sort((a, c) => a.place - c.place || c.kills - a.kills);
    b.length = Math.min(b.length, 10);
  }
  markers() {
    const m = [{ x: this.zone.x, z: this.zone.z, ring: this.zone.r, color: '#3a8cff', zone: true }];
    if (this.shrinking || this.phase >= 0) m.push({ x: this.next.x, z: this.next.z, ring: this.next.r, color: '#ffffff', zone: true });
    for (const v of this.game.vehicles) if (v.alive) m.push({ x: v.pos.x, z: v.pos.z, label: '🚙', color: '#ddd', small: true });
    return m;
  }
  hud() {
    return { title: this.title, objective: this.inZone(this.game.player.pos.x, this.game.player.pos.z) ? this.objective : 'VOCÊ ESTÁ FORA DA ZONA! Corra para a área segura.', alive: this.aliveCount(), kills: this.game.player.stats.kills, zoneT: Math.ceil(this.phaseT), shrinking: this.shrinking, time: null };
  }
}
