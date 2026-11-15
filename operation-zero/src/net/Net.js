import * as THREE from 'three';
import { Events } from '../core/Events.js';
import { WeaponInstance } from '../combat/WeaponInstance.js';
import { computeStats } from '../combat/weapons.js';

// ================================================================
// NET — multijogador online com anfitrião autoritativo.
//  - Um navegador é o ANFITRIÃO: roda IA, dano, regras do modo.
//  - CLIENTES controlam o próprio movimento/mira localmente (sem atraso
//    perceptível) e enviam intenções: posição, disparos, granadas, uso.
//  - O anfitrião envia "snapshots" (20 Hz) com o estado do mundo e
//    eventos (tiros, abates, explosões, destruição), e o estado pessoal
//    (vida, armadura...) de cada cliente.
//  - O servidor (tools/serve.mjs) apenas cria salas e repassa mensagens.
// ================================================================

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
export const ONLINE_MODES = {
  tdm5: { name: 'Mata-mata 5x5', cfg: { mode: 'tdm', teamSize: 5 } },
  tdm10: { name: 'Mata-mata 10x10', cfg: { mode: 'tdm', teamSize: 10 } },
  dom: { name: 'Dominação 6x6', cfg: { mode: 'domination', teamSize: 6 } },
  cap: { name: 'Captura 5x5', cfg: { mode: 'capture', teamSize: 5 } },
  survival: { name: 'Sobrevivência cooperativa', cfg: { mode: 'survival' } },
  br: { name: 'Battle Royale', cfg: { mode: 'br', map: 'island', players: 60 } },
};

export class Net {
  constructor(game) {
    this.game = game;
    this.ev = new Events();
    this.ws = null;
    this.role = null;      // 'host' | 'client' | null
    this.id = null; this.hostId = null; this.code = null;
    this.peers = new Map(); // (anfitrião) id -> { id, name, team, c }
    this.lobby = { players: [], modeKey: 'tdm5', map: 'refinery', time: 14, weather: 'clear', difficulty: 'normal', inMatch: false };
    this.queue = [];       // eventos a enviar no próximo snapshot
    this.snapT = 0; this.hudT = 0; this.sbT = 0; this.inT = 0;
    this.known = new Set();
    this.ping = 0;
    this.attachHooks();
  }
  get isHost() { return this.role === 'host'; }
  get isClient() { return this.role === 'client'; }
  get connected() { return this.ws && this.ws.readyState === 1; }

  // ---------------------------------------------------- conexão
  connect() {
    if (this.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); }
      catch (e) { return reject(e); }
      const t = setTimeout(() => { try { ws.close(); } catch (e) { /* */ } reject(new Error('timeout')); }, 4000);
      ws.onopen = () => { clearTimeout(t); this.ws = ws; resolve(); this.pingLoop(); };
      ws.onerror = () => { clearTimeout(t); reject(new Error('Servidor online indisponível')); };
      ws.onclose = () => { this.ws = null; if (this.role) this.onDisconnect(); };
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.onRaw(m); };
    });
  }
  raw(o) { if (this.connected) this.ws.send(JSON.stringify(o)); }
  to(to, d, ex) { this.raw({ t: 'to', to, d, ex }); }
  pingLoop() {
    clearInterval(this.pingI);
    this.pingI = setInterval(() => this.raw({ t: 'ping', at: performance.now() }), 2000);
  }
  async hostRoom(name) {
    await this.connect();
    this.raw({ t: 'host', name });
    return this.wait('room');
  }
  async joinRoom(code, name) {
    await this.connect();
    this.raw({ t: 'join', code, name });
    return this.wait('joined');
  }
  wait(type) {
    return new Promise((resolve, reject) => {
      const offA = this.ev.on(type, (m) => { offA(); offB(); resolve(m); });
      const offB = this.ev.on('error', (m) => { offA(); offB(); reject(new Error(m.msg)); });
    });
  }
  leave() {
    this.raw({ t: 'leave' });
    this.role = null; this.code = null; this.peers.clear();
    this.lobby.players = [];
    this.game.netClient = null;
  }
  onDisconnect() {
    const wasClient = this.isClient;
    this.role = null; this.peers.clear();
    this.game.netClient = null;
    this.ev.emit('closed', {});
    if (wasClient && this.game.state !== 'menu') this.game.quitToMenu();
  }

  onRaw(m) {
    switch (m.t) {
      case 'room':
        this.role = 'host'; this.id = m.id; this.hostId = m.id; this.code = m.code;
        this.lobby.players = [{ id: m.id, name: this.game.profile.operator.callsign, team: 0, host: true }];
        this.ev.emit('room', m); this.ev.emit('lobby', this.lobby);
        break;
      case 'joined':
        this.role = 'client'; this.id = m.id; this.hostId = m.hostId; this.code = m.code;
        this.to('host', { k: 'hello', loadout: this.game.profile.loadout });
        this.ev.emit('joined', m);
        break;
      case 'error': this.ev.emit('error', m); break;
      case 'pong': this.ping = performance.now() - m.at; break;
      case 'peer': this.hostAddPeer(m.id, m.name); break;
      case 'peerLeft': this.hostRemovePeer(m.id); break;
      case 'hostLeft':
        this.ev.emit('hostLeft', {});
        this.role = null; this.game.netClient = null;
        if (this.game.state !== 'menu') this.game.quitToMenu();
        this.game.events.emit('toast', { title: 'Conexão encerrada', text: 'O anfitrião saiu da sala.' });
        break;
      case 'msg':
        if (this.isHost) this.hostMsg(m.from, m.d); else this.clientMsg(m.d);
        break;
      default: break;
    }
  }

  // ---------------------------------------------------- saguão (anfitrião)
  hostAddPeer(id, name) {
    const p0 = this.lobby.players;
    const t0 = p0.filter((p) => p.team === 0).length, t1 = p0.filter((p) => p.team === 1).length;
    p0.push({ id, name, team: t0 <= t1 ? (t0 === t1 ? 1 : 0) : 1 });
    this.broadcastLobby();
    this.game.events.emit('toast', { title: 'Jogador entrou', text: name, small: true });
  }
  hostRemovePeer(id) {
    const p = this.lobby.players.find((x) => x.id === id);
    this.lobby.players = this.lobby.players.filter((x) => x.id !== id);
    this.broadcastLobby();
    const peer = this.peers.get(id);
    this.peers.delete(id);
    if (peer?.c && this.game.combatants.includes(peer.c)) {
      // quem cai vira bot para não desequilibrar a partida
      const c = peer.c;
      c.remote = false; c.human = false; c.name += ' (bot)';
      this.game.ai.attach(c, { difficulty: 'normal', ally: c.team === this.game.player?.team });
      this.game.ai.addToSquad(c, 4);
    }
    if (p) this.game.events.emit('toast', { title: 'Jogador saiu', text: p.name, small: true });
  }
  setLobby(patch) { Object.assign(this.lobby, patch); this.broadcastLobby(); }
  swapTeam(id) {
    const p = this.lobby.players.find((x) => x.id === id);
    if (p) { p.team = p.team ? 0 : 1; this.broadcastLobby(); }
  }
  broadcastLobby() {
    if (!this.isHost) return;
    this.to('all', { k: 'lobby', lobby: this.lobby });
    this.ev.emit('lobby', this.lobby);
  }

  // Monta a configuração da partida a partir do saguão.
  matchConfig() {
    const L = this.lobby, M = ONLINE_MODES[L.modeKey];
    const cfg = { ...M.cfg, map: M.cfg.map || L.map, time: L.time, weather: L.weather, difficulty: L.difficulty, seed: Math.floor(Math.random() * 1e6), online: true };
    if (cfg.mode === 'br') cfg.players = Math.max(L.players.length, 60);
    return cfg;
  }
  humansFor(team) {
    const cfg = this.game.cfg || {};
    return this.lobby.players.filter((p) => !p.host && (cfg.mode === 'survival' || cfg.mode === 'br' || p.team === team));
  }
  hostTeam() { return this.lobby.players.find((p) => p.host)?.team ?? 0; }

  // Cria o combatente de um jogador remoto (chamado pelos modos).
  spawnRemote(info, team, x, z, yaw = 0, extra = {}) {
    const g = this.game;
    const c = new (g.combatantClass)(g, { team, x, z, yaw, name: info.name, loadout: extra.loadout || info.loadout || defaultLoadout(), health: 100, regen: extra.regen ?? true });
    c.remote = true; c.human = true; c.peerId = info.id;
    if (extra.y) c.pos.y = extra.y;
    if (extra.parachute) c.parachute = true;
    g.combatants.push(c);
    this.peers.set(info.id, { ...info, team, c, lastIn: 0 });
    return c;
  }

  startHostMatch() {
    const g = this.game;
    const cfg = this.matchConfig();
    this.peers.clear(); this.known.clear(); this.queue = [];
    this.lobby.inMatch = true;
    g.startMatch(cfg);
    // informa cada cliente
    const ents = g.combatants.map((c) => this.entInfo(c));
    for (const c of g.combatants) this.known.add(c.id);
    const extra = {};
    if (g.mode.loot) extra.loot = g.mode.loot.map((it) => [it.type, it.id || '', r2(it.x), r2(it.y), r2(it.z), it.taken ? 1 : 0]);
    if (g.vehicles.length) extra.veh = g.vehicles.map((v) => [r2(v.pos.x), r2(v.pos.z), r3(v.yaw)]);
    for (const peer of this.peers.values()) {
      const c = peer.c;
      this.to(peer.id, { k: 'start', cfg, extra, ents, you: { id: c.id, team: c.team, x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw, parachute: !!c.parachute, loadout: this.loadoutOf(c) } });
    }
    this.broadcastLobby();
  }
  entInfo(c) { return [c.id, c.name, c.team, c.isBoss ? 1 : 0, c.model ? r2(c.model.group.scale.x) : 1]; }
  loadoutOf(c) {
    return { weapons: c.weapons.map((w) => ({ id: w.id, att: w.attachments, ammo: w.ammoType, camo: w.camo, mag: w.mag, reserve: w.reserve })), slot: c.slot, grenades: { ...c.grenades } };
  }
  sendLoadout(c) { if (this.isHost && c?.remote) this.to(c.peerId, { k: 'loadout', l: this.loadoutOf(c) }); }

  // ---------------------------------------------------- mensagens no anfitrião
  hostMsg(from, d) {
    const g = this.game;
    const peer = this.peers.get(from);
    const c = peer?.c;
    if (d.k === 'hello') {
      const lp = this.lobby.players.find((x) => x.id === from);
      if (lp && d.loadout) lp.loadout = d.loadout;
      return this.broadcastLobby();
    }
    if (!c || g.state === 'menu') return;
    switch (d.k) {
      case 'in': {
        if (!c.alive) return;
        c.pos.set(d.p[0], d.p[1], d.p[2]); c.vel.set(d.v[0], d.v[1], d.v[2]);
        c.yaw = d.a[0]; c.pitch = d.a[1]; c.height = d.h; c.ads = d.ads ? 1 : 0; c.onGround = !!d.og;
        c.sprinting = !!d.sp; c.parachute = !!d.pc; c.slot = d.sl ?? c.slot;
        peer.lastIn = g.time;
        break;
      }
      case 'shot': {
        if (!c.alive) return;
        let w = c.weapons.find((x) => x.id === d.w);
        if (!w) { w = new WeaponInstance(d.w, d.att || {}, d.am || 'fmj'); }
        const s = w.stats;
        const o = new THREE.Vector3(d.o[0], d.o[1], d.o[2]);
        if (o.distanceTo(c.eyePos()) > 3) o.copy(c.eyePos());
        c.lastShot = g.time; c.stats.shots++;
        for (const dir of d.d.slice(0, 12)) g.ballistics.fire(c, o, new THREE.Vector3(dir[0], dir[1], dir[2]).normalize(), s, { tracer: true, dmgMul: c.dmgBoost || 1 });
        const muzzle = c.muzzleWorld();
        if (!s.suppressed) { g.fx.muzzle(muzzle, c.forward(), 1); g.fx.flash(muzzle, 0xffb060, 4, 8, 0.05); }
        g.audio.shot(s.sound, c.pos, s.suppressed);
        g.ai.noise(c.pos, s.suppressed ? 22 : 110 * (s.noise || 1), 'gunshot', c);
        break;
      }
      case 'throw':
        if (!c.alive || !(c.grenades[d.ty] > 0)) return;
        c.grenades[d.ty]--;
        g.throwables.throw(c, d.ty, new THREE.Vector3(...d.o), new THREE.Vector3(...d.d).normalize(), 19);
        break;
      case 'melee': if (c.alive) { c.yaw = d.a[0]; c.pitch = d.a[1]; c.melee(); } break;
      case 'use': if (c.alive) g.mode?.interact?.(c); break;
      case 'buy': g.mode?.buy?.(d.id, c); break;
      case 'streak': if (c.alive && ['uav', 'artillery', 'barrage'].includes(d.type)) g.executeStreak(d.type, c, d.t ? new THREE.Vector3(d.t[0], d.t[1], d.t[2]) : null); break;
      default: break;
    }
  }

  // ---------------------------------------------------- ganchos do anfitrião
  attachHooks() {
    const ev = this.game.events;
    ev.on('kill', (e) => { if (this.isHost) this.queue.push(['k', e.killer?.id || 0, e.victim.id, e.weapon || '', e.headshot ? 1 : 0, e.melee ? 1 : 0, e.explosive ? 1 : 0, Math.round(e.dist || 0)]); });
    ev.on('damage', (e) => {
      if (!this.isHost || !(e.attacker?.remote || e.victim.remote)) return;
      this.queue.push(['h', e.attacker?.id || 0, e.victim.id, Math.round(e.dmg), e.region === 'head' ? 1 : 0, e.victim.health <= 0 ? 1 : 0]);
    });
    ev.on('worldChanged', ({ box }) => { if (this.isHost) this.queue.push(['x', this.game.world.boxes.indexOf(box)]); });
    ev.on('matchEnding', (e) => {
      if (!this.isHost) return;
      const m = this.game.mode;
      let winner = -1;
      if (m.teamBased) winner = m.scores[0] > m.scores[1] ? 0 : m.scores[1] > m.scores[0] ? 1 : -1;
      else if (this.game.cfg.mode === 'br') winner = this.game.combatants.find((c) => c.alive)?.team ?? -1;
      this.pendingEnd = { winner, mode: this.game.cfg.mode, text: e.title };
    });
    ev.on('matchEnd', (r) => {
      if (!this.isHost) return;
      this.lobby.inMatch = false;
      const sb = this.game.mode?.scoreboard() || [];
      this.flush();
      this.to('all', { k: 'end', end: this.pendingEnd || { winner: -1, mode: r.mode }, text: r.text, sb });
      this.pendingEnd = null;
      this.broadcastLobby();
    });
  }
  queueShot(shooter, o, d, stats) {
    this.queue.push(['s', shooter?.id || 0, r2(o.x), r2(o.y), r2(o.z), r3(d.x), r3(d.y), r3(d.z), stats.tracerColor, stats.id]);
  }
  queueBoom(p, r) { this.queue.push(['b', r2(p.x), r2(p.y), r2(p.z), r]); }
  queueRespawn(c) { if (this.isHost && c.remote) this.to(c.peerId, { k: 'respawn', p: [c.pos.x, c.pos.y, c.pos.z], yaw: c.yaw, l: this.loadoutOf(c) }); }

  // Chamado a cada quadro de simulação no anfitrião.
  hostTick(dt) {
    if (!this.isHost || !this.peers.size) { this.queue.length = 0; return; }
    const g = this.game;
    const many = g.combatants.length > 40;
    this.snapT -= dt; this.hudT -= dt; this.sbT -= dt;
    if (this.snapT <= 0) { this.snapT = many ? 0.1 : 0.05; this.flush(); }
    if (this.hudT <= 0) {
      this.hudT = 0.25;
      const m = g.mode;
      const hud = safe(m.hud());
      const mk = safe(m.markers());
      let sb = null;
      if (this.sbT <= 0) { this.sbT = 1; sb = m.scoreboard(); }
      for (const peer of this.peers.values()) this.to(peer.id, { k: 'hud', hud, mk, pr: m.prompt?.(peer.c) || null, sb });
    }
  }
  flush() {
    const g = this.game;
    const cs = [], add = [], del = [];
    const ids = new Set();
    for (const c of g.combatants) {
      ids.add(c.id);
      if (!this.known.has(c.id)) { this.known.add(c.id); add.push(this.entInfo(c)); }
      cs.push([c.id, r2(c.pos.x), r2(c.pos.y), r2(c.pos.z), r3(c.yaw), r3(c.pitch), r2(c.height), c.alive ? 1 : 0, r2(c.vel.x), r2(c.vel.z), c.lastShot > g.time - 0.2 ? 1 : 0, c.ads > 0.5 ? 1 : 0]);
    }
    for (const id of this.known) if (!ids.has(id)) { del.push(id); this.known.delete(id); }
    const gr = g.throwables.list.map((t) => [r2(t.pos.x), r2(t.pos.y), r2(t.pos.z), t.type]);
    const sm = g.throwables.smokes.map((s) => [r2(s.pos.x), r2(s.pos.y), r2(s.pos.z), r2(s.r), r2(s.t)]);
    const veh = g.vehicles.map((v) => [r2(v.pos.x), r2(v.pos.y), r2(v.pos.z), r3(v.yaw), v.alive ? 1 : 0]);
    const ev = this.queue; this.queue = [];
    for (const peer of this.peers.values()) {
      const c = peer.c;
      const me = { hp: Math.ceil(c.health), mh: c.maxHealth, ar: Math.round(c.armor), al: c.alive ? 1 : 0, fl: r2(c.flashed), sp: r2(c.suppression), gr: c.grenades };
      const evs = ev.filter((e) => !(e[0] === 's' && e[1] === c.id) && !(e[0] === 'h' && e[1] !== c.id && e[2] !== c.id));
      this.to(peer.id, { k: 'snap', t: r2(g.time), cs, add: add.length ? add : undefined, del: del.length ? del : undefined, me, gr, sm, veh, ev: evs });
    }
  }

  // ---------------------------------------------------- cliente
  clientMsg(d) {
    const g = this.game;
    switch (d.k) {
      case 'lobby': this.lobby = d.lobby; this.ev.emit('lobby', this.lobby); break;
      case 'abort':
        if (g.netClient) { g.quitToMenu(); g.events.emit('toast', { title: 'Partida encerrada', text: 'O anfitrião saiu da partida.' }); }
        break;
      case 'start':
        this.game.netClient = this;
        this.ev.emit('starting', d);
        g.startClientMatch(d.cfg, d.you, d.ents, d.extra || {});
        break;
      default:
        if (g.netClient && g.mode?.netMessage) g.mode.netMessage(d);
    }
  }
  // Envio das intenções do jogador local (30 Hz)
  clientTick(dt) {
    if (!this.isClient) return;
    const p = this.game.player;
    if (!p || !p.alive) return;
    this.inT -= dt;
    if (this.inT > 0) return;
    this.inT = 1 / 30;
    this.to('host', { k: 'in', p: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], v: [r2(p.vel.x), r2(p.vel.y), r2(p.vel.z)], a: [r3(p.yaw), r3(p.pitch)], h: r2(p.height), ads: p.ads > 0.5 ? 1 : 0, og: p.onGround ? 1 : 0, sp: p.sprinting ? 1 : 0, pc: p.parachute ? 1 : 0, sl: p.slot });
  }
  localShot(c, o, dirs, s) {
    if (!this.isClient || !c.isPlayer) return;
    this.to('host', { k: 'shot', o: [r2(o.x), r2(o.y), r2(o.z)], d: dirs.map((d) => [r3(d.x), r3(d.y), r3(d.z)]), w: s.id, att: s.attachments, am: s.ammo });
  }
  send(d) { if (this.isClient) this.to('host', d); }
}

export function defaultLoadout() {
  return { primary: { id: 'ar4', att: { optic: 'reddot' } }, secondary: { id: 'p9' }, equipment: { frag: 2, smoke: 1, flash: 1 } };
}
function safe(o) { return JSON.parse(JSON.stringify(o ?? null, (k, v) => (typeof v === 'number' ? (isFinite(v) ? Math.round(v * 100) / 100 : null) : v))); }
export { computeStats };
