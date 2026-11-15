import * as THREE from 'three';
import { Mode } from './Mode.js';
import { Combatant } from '../entities/Combatant.js';
import { Vehicle } from '../entities/Vehicle.js';
import { WeaponInstance } from '../combat/WeaponInstance.js';
import { WEAPONS } from '../combat/weapons.js';

// ================================================================
// CLIENT MODE — o "modo" de quem entrou numa sala online. Não roda
// regras nem IA: aplica os snapshots do anfitrião (entidades com
// interpolação, eventos, HUD, placar) e envia as ações do jogador.
// ================================================================

const TITLES = { tdm: 'Mata-mata online', domination: 'Dominação online', capture: 'Captura online', survival: 'Sobrevivência cooperativa', br: 'Battle Royale online' };

export class ClientMode extends Mode {
  constructor(game, cfg, extra) {
    super(game, cfg);
    this.net = game.net;
    this.title = TITLES[cfg.mode] || 'Online';
    this.teamBased = ['tdm', 'domination', 'capture'].includes(cfg.mode);
    this.timeLeft = Infinity;
    this.extra = extra;
    this.proxies = new Map();
    this.hudData = { title: this.title, objective: 'Conectado ao anfitrião' };
    this.mk = []; this.sb = []; this.pr = null;
    this.respawnT = null;
    this.grenadeMeshes = []; this.markerObjs = []; this.lootItems = [];
    this.vehicles = [];
  }

  setup(ents, you) {
    const g = this.game;
    this.myId = you.id;
    for (const e of ents) if (e[0] !== you.id) this.addProxy(e);
    g.player.netId = you.id;
    // saque do Battle Royale
    if (this.extra.loot) {
      const mats = { weapon: 0xffc040, ammo: 0x55aa55, armor: 0x4488ff, med: 0xffffff, grenade: 0x667744 };
      this.lootMats = Object.fromEntries(Object.entries(mats).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.25) })]));
      for (const l of this.extra.loot) this.addLoot(l);
    }
    for (const v of this.extra.veh || []) {
      const veh = new Vehicle(g, v[0], v[1], v[2]);
      veh.netStatic = true;
      g.vehicles.push(veh);
    }
    if (this.cfg.mode === 'br') {
      this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 220, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0x3a8cff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      this.wall.position.y = 100; this.wall.visible = false;
      g.world.addVisual(this.wall);
    }
  }

  addProxy(e) {
    const [id, name, team, boss, scale] = e;
    if (this.proxies.has(id) || id === this.myId) return;
    const g = this.game;
    const c = new Combatant(g, { team, name, boss: !!boss, scale: scale || undefined, x: 0, z: 0 });
    c.proxy = true; c.netId = id; c.regen = false;
    c.net = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, h: 1.8, fresh: true };
    g.combatants.push(c);
    this.proxies.set(id, c);
    return c;
  }
  ent(id) { return id === this.myId ? this.game.player : this.proxies.get(id) || null; }

  addLoot(l) {
    const [type, id, x, y, z, taken] = l;
    const geo = type === 'weapon' ? new THREE.BoxGeometry(0.9, 0.18, 0.25) : new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const mesh = new THREE.Mesh(geo, this.lootMats[type]);
    mesh.position.set(x, y + 0.4, z);
    mesh.visible = !taken;
    this.game.world.addVisual(mesh);
    this.lootItems.push({ type, id, x, y, z, mesh, taken: !!taken });
  }

  // ---------------------------------------------------- mensagens do anfitrião
  netMessage(d) {
    const g = this.game, p = g.player;
    if (!p) return;
    switch (d.k) {
      case 'snap': this.applySnap(d); break;
      case 'hud':
        this.hudData = d.hud || this.hudData; this.mk = d.mk || []; this.pr = d.pr;
        if (d.sb) this.sb = d.sb;
        if (this.hudData.scores) this.scores = this.hudData.scores;
        break;
      case 'loadout': this.applyLoadout(d.l); break;
      case 'respawn':
        p.respawn(d.p[0], d.p[2], d.yaw, d.p[1]);
        if (d.l) this.applyLoadout(d.l);
        this.respawnT = null;
        g.viewmodel.build(p.weapon);
        break;
      case 'end': this.onEnd(d); break;
      case 'uav': (g.uavUntil ||= {})[p.team] = g.time + d.secs; break;
      case 'uavWarn': g.events.emit('toast', { title: 'RADAR INIMIGO ATIVO', text: 'Eles sabem onde você está. Mantenha-se em movimento!' }); break;
      default: break;
    }
  }

  applyLoadout(l) {
    const p = this.game.player;
    p.weapons = l.weapons.map((w) => { const wi = new WeaponInstance(w.id, w.att || {}, w.ammo || 'fmj', w.camo || 'none'); wi.mag = w.mag; wi.reserve = w.reserve; return wi; });
    p.slot = Math.min(l.slot || 0, Math.max(0, p.weapons.length - 1));
    p.grenades = { ...l.grenades };
    this.game.events.emit('weaponChanged', p);
  }

  applySnap(d) {
    const g = this.game, p = g.player;
    for (const e of d.add || []) this.addProxy(e);
    for (const id of d.del || []) { const c = this.proxies.get(id); if (c) { this.proxies.delete(id); g.removeCombatant(c); } }
    for (const s of d.cs) {
      const [id, x, y, z, yaw, pitch, h, alive, vx, vz, firing, ads] = s;
      if (id === this.myId) continue;
      let c = this.proxies.get(id);
      if (!c) continue;
      const n = c.net;
      n.pos.set(x, y, z); n.vel.set(vx, 0, vz); n.yaw = yaw; n.pitch = pitch; n.h = h;
      if (n.fresh) { c.pos.copy(n.pos); c.yaw = yaw; n.fresh = false; }
      c.ads = ads;
      if (firing) c.lastShot = g.time;
      if (!alive && c.alive) { c.alive = false; c.deadTime = 0; c.model?.die(0, 0); }
      else if (alive && !c.alive) { c.alive = true; c.pos.copy(n.pos); if (c.model) { c.model.deathT = -1; c.model.group.rotation.x = 0; c.model.group.visible = true; } }
    }
    // estado pessoal
    const me = d.me;
    if (me) {
      p.health = me.hp; p.maxHealth = me.mh || 100; p.armor = me.ar; p.flashed = me.fl; p.grenades = me.gr || p.grenades;
      if (me.sp > p.suppression + 0.2) g.events.emit('suppressed', p);
      p.suppression = me.sp;
    }
    // granadas e fumaça (visual)
    while (this.grenadeMeshes.length < d.gr.length) {
      const m = new THREE.Mesh(g.throwables.geo, g.throwables.mats.frag); g.scene.add(m); this.grenadeMeshes.push(m);
    }
    this.grenadeMeshes.forEach((m, i) => { const q = d.gr[i]; m.visible = !!q; if (q) { m.position.set(q[0], q[1], q[2]); m.material = g.throwables.mats[q[3]] || g.throwables.mats.frag; } });
    g.throwables.smokes = d.sm.map((s) => ({ pos: new THREE.Vector3(s[0], s[1], s[2]), r: s[3], maxR: s[3], t: s[4] }));
    (d.veh || []).forEach((v, i) => {
      const veh = g.vehicles[i];
      if (!veh) return;
      veh.pos.set(v[0], v[1], v[2]); veh.yaw = v[3];
      if (!v[4] && veh.alive) { veh.alive = false; veh.group.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.color.setHex(0x111111); } }); }
      veh.sync();
    });
    for (const e of d.ev || []) this.applyEvent(e);
  }

  applyEvent(e) {
    const g = this.game, p = g.player;
    switch (e[0]) {
      case 's': { // disparo de outra pessoa: projétil cosmético + som
        const shooter = this.ent(e[1]);
        const o = new THREE.Vector3(e[2], e[3], e[4]), dir = new THREE.Vector3(e[5], e[6], e[7]);
        const stats = new WeaponInstance(WEAPONS[e[9]] ? e[9] : 'ar4').stats;
        g.ballistics.fire(shooter, o, dir, { ...stats, tracerColor: e[8] }, { cosmetic: true });
        if (shooter && g.time - (shooter._lastSnd || 0) > 0.03) {
          shooter._lastSnd = g.time;
          g.audio.shot(stats.sound, shooter.pos, stats.suppressed);
          if (shooter.model && !stats.suppressed) { const m = shooter.muzzleWorld(); g.fx.muzzle(m, dir, 1); }
        }
        break;
      }
      case 'k': {
        const killer = this.ent(e[1]) || (e[1] ? null : null), victim = this.ent(e[2]);
        if (!victim) break;
        if (victim === p) {
          p.alive = false; p.health = 0; p.deadTime = 0; p.lastKiller = killer; p.stats.deaths++;
          if (this.cfg.mode !== 'br') this.respawnT = this.respawnDelay;
        } else if (victim.alive) { victim.alive = false; victim.model?.die(0, 0); }
        if (killer === p && victim !== p) { p.stats.kills++; if (e[4]) p.stats.headshots++; p.stats.score += 100; }
        g.events.emit('kill', { killer, victim, weapon: e[3], headshot: !!e[4], melee: !!e[5], explosive: !!e[6], dist: e[7] });
        break;
      }
      case 'h': {
        const attacker = this.ent(e[1]), victim = this.ent(e[2]);
        if (attacker === p && victim) { p.stats.hits++; g.events.emit('damage', { attacker: p, victim: { health: e[5] ? 0 : 1, pos: victim.pos }, dmg: e[3], region: e[4] ? 'head' : 'chest' }); }
        if (victim === p) { p.lastDamage = g.time; g.events.emit('damage', { victim: p, attacker: attacker || null, dmg: e[3], region: e[4] ? 'head' : 'chest' }); }
        break;
      }
      case 'b': {
        const pos = new THREE.Vector3(e[1], e[2], e[3]);
        g.fx.explosion(pos, e[4]); g.audio.play('explosion', pos, 1);
        const d = pos.distanceTo(p.pos);
        g.shake = Math.max(g.shake, Math.max(0, 1.4 - d / (e[4] * 3)));
        break;
      }
      case 'x': { const b = g.world.boxes[e[1]]; if (b && !b.removed) g.world.destroyBox(b); break; }
      case 'lt': { const it = this.lootItems[e[1]]; if (it) { it.taken = true; it.mesh.visible = false; } break; }
      case 'la': this.addLoot([e[1], e[2], e[3], e[4], e[5], 0]); break;
      default: break;
    }
  }

  onEnd(d) {
    const g = this.game, p = g.player;
    this.over = true;
    const end = d.end || {};
    let won = false, title = 'FIM DE PARTIDA';
    if (end.winner === -1) { won = false; title = end.mode === 'survival' ? 'FIM DE JOGO' : 'EMPATE'; }
    else { won = end.winner === p.team; title = won ? (end.mode === 'br' ? 'VITÓRIA! #1' : 'VITÓRIA') : (end.mode === 'br' ? 'ELIMINADO' : 'DERROTA'); }
    const sb = (d.sb || []).map((r) => ({ ...r, me: r.id === this.myId }));
    g.endMatch({ won, title, text: d.text || '', ranked: end.mode !== 'survival', mode: this.cfg.mode, scoreboard: sb, net: true });
  }

  // ---------------------------------------------------- quadro
  update(dt) {
    const g = this.game;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    if (this.respawnT !== null) this.respawnT = Math.max(0, this.respawnT - dt);
    const t = g.time;
    for (const it of this.lootItems) if (!it.taken) { it.mesh.rotation.y = t * 1.5; }
    // zona do Battle Royale e marcadores 3D (bandeiras, maleta)
    const zone = this.mk.find((m) => m.zone);
    if (this.wall && zone) { this.wall.visible = true; this.wall.position.x = zone.x; this.wall.position.z = zone.z; this.wall.scale.set(Math.max(0.1, zone.ring), 1, Math.max(0.1, zone.ring)); }
    this.syncMarkers();
  }
  syncMarkers() {
    const list = this.mk.filter((m) => !m.zone && !m.dot && (m.ring || m.always));
    const g = this.game;
    while (this.markerObjs.length < list.length) {
      const grp = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      beacon.position.y = 1.2;
      grp.add(ring, beacon); g.world.addVisual(grp);
      this.markerObjs.push({ grp, ring, beacon });
    }
    this.markerObjs.forEach((o, i) => {
      const m = list[i];
      o.grp.visible = !!m;
      if (!m) return;
      o.grp.position.set(m.x, 0, m.z);
      o.ring.visible = !!m.ring; if (m.ring) o.ring.scale.setScalar(m.ring);
      o.beacon.visible = !m.ring;
      o.ring.material.color.set(m.color); o.beacon.material.color.set(m.color);
      o.beacon.rotation.y = this.game.time;
    });
  }

  hud() {
    const h = { ...this.hudData };
    const p = this.game.player;
    if (h.alive !== undefined) {
      h.kills = p.stats.kills;
      const zone = this.mk.find((m) => m.zone);
      if (zone && Math.hypot(p.pos.x - zone.x, p.pos.z - zone.z) > zone.ring) h.objective = 'VOCÊ ESTÁ FORA DA ZONA! Corra para a área segura.';
    }
    if (h.objective === 'Leve a maleta até a SUA base!') h.objective = 'Roube a maleta inimiga e leve até a sua base';
    return h;
  }
  markers() { return this.mk; }
  scoreboard() { return this.sb.map((r) => ({ ...r, me: r.id === this.myId })); }
  prompt() { return this.pr; }
  interact() { this.net.send({ k: 'use' }); }
  respawnTimeFor(c) { return c === this.game.player ? this.respawnT : null; }
  // Sobrevivência: loja cooperativa
  get inBreak() { return !!this.hudData.inBreak; }
  get breakT() { return this.hudData.breakT || 0; }
  get points() { return this.hudData.points || 0; }
  get buy() { return this.cfg.mode === 'survival' ? (id) => { this.net.send({ k: 'buy', id }); this.game.audio.play('ui'); return true; } : undefined; }
  onKill() {}
  finish() {}
  dispose() { super.dispose(); for (const m of this.grenadeMeshes) this.game.scene.remove(m); }
}
