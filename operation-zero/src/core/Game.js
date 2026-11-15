import * as THREE from 'three';
import { Events } from './Events.js';
import { AudioSys } from './Audio.js';
import { Input } from './Input.js';
import { Save } from './Save.js';
import { mulberry32, clamp, lerp, rand } from './util.js';
import { World } from '../world/World.js';
import { MapBuilder } from '../world/MapBuilder.js';
import { NavGrid } from '../world/NavGrid.js';
import { MAPS } from '../world/maps.js';
import { Weather } from '../world/Weather.js';
import { getTexture } from '../world/Textures.js';
import { Effects } from '../fx/Effects.js';
import { Ballistics } from '../combat/Ballistics.js';
import { Throwables } from '../combat/Throwables.js';
import { Combatant, MOVE } from '../entities/Combatant.js';
import { Viewmodel } from '../entities/Viewmodel.js';
import { AIManager } from '../ai/AIManager.js';
import { Progression, XP, rankDelta } from '../progression/Progression.js';
import { createMode } from '../modes/index.js';
import { Net } from '../net/Net.js';
import { ClientMode } from '../modes/ClientMode.js';

// ================================================================
// GAME — orquestra todos os sistemas: renderização, laço principal,
// carregamento de mapas, partidas, explosões, câmera e salvamento.
// ================================================================

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    const saved = Save.load();
    this.profile = saved.profile;
    this.settings = saved.settings;
    this.isTouchDevice = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0;
    // primeira execução em celular: perfil gráfico mais leve
    if (saved.fresh && this.isTouchDevice) Object.assign(this.settings, { quality: 'medium', renderScale: 0.8, shadowRes: 1024, particles: 0.7, viewDistance: 0.7, fov: 75 });
    this.events = new Events();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.05, 1500);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.audio = new AudioSys();
    this.input = new Input(canvas);
    this.fx = new Effects(this);
    this.weather = new Weather(this);
    this.viewmodel = new Viewmodel(this);
    this.ballistics = new Ballistics(this);
    this.throwables = new Throwables(this);
    this.ai = new AIManager(this);
    this.progression = new Progression(this.profile, this.events);
    this.combatants = [];
    this.vehicles = [];
    this.combatantClass = Combatant;
    this.player = null;
    this.mode = null;
    this.world = null;
    this.net = new Net(this);
    this.netClient = null;
    this.state = 'menu';
    this.time = 0;
    this.shake = 0;
    this.friendlyFire = false;
    this.perf = { fps: 0, frame: 0, sim: 0, render: 0, acc: 0, frames: 0 };
    this.smokeBlocks = (a, d, len) => this.throwables.blocks(a, d, len);
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.testMode && !this.shopOpen) this.pause();
    };
    this.events.on('worldChanged', ({ box }) => {
      if (!this.nav) return;
      this.nav.rasterize(this.world.boxes, 0.36, { minX: box.min.x, minZ: box.min.z, maxX: box.max.x, maxZ: box.max.z });
    });
    this.events.on('kill', (e) => this.onKill(e));
    addEventListener('resize', () => this.resize());
    this.applySettings();
    this.resize();
    this.last = performance.now();
    this.loop = this.loop.bind(this);
  }

  start() { requestAnimationFrame(this.loop); }

  applySettings() {
    const s = this.settings;
    const q = { low: 0.65, medium: 0.85, high: 1, ultra: 1 }[s.quality] ?? 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, s.quality === 'ultra' ? 2 : 1.25) * s.renderScale * q);
    this.renderer.shadowMap.enabled = s.shadows;
    const res = s.quality === 'low' ? 1024 : s.quality === 'ultra' ? 4096 : s.shadowRes;
    if (this.weather.sun.shadow.mapSize.x !== res) {
      this.weather.sun.shadow.mapSize.set(res, res);
      this.weather.sun.shadow.map?.dispose(); this.weather.sun.shadow.map = null;
    }
    this.weather.sun.castShadow = s.shadows;
    this.fx.density = s.particles;
    this.camera.far = 400 + 1100 * s.viewDistance;
    this.camera.updateProjectionMatrix();
    Object.assign(this.audio.vol, { master: s.master, sfx: s.sfx, ambient: s.ambient, voice: s.voice });
    this.audio.voiceTTS = s.voiceTTS;
    this.audio.applyVolumes();
    // materiais precisam recompilar quando sombras mudam
    this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
  }
  saveAll() { Save.write(this.profile, this.settings); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.viewmodel.camera.aspect = w / h; this.viewmodel.camera.updateProjectionMatrix();
    this.fx.setScale(h / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }

  // ---------------- Carregamento de mapa / partida ----------------
  loadMap(mapId, seed = 1337) {
    this.unloadMap();
    const map = MAPS[mapId];
    this.map = map;
    const S = map.size;
    this.world = new World(this);
    this.world.bounds = { minX: -S, maxX: S, minZ: -S, maxZ: S };
    this.world.groundMat = map.ground.mat;
    const rng = mulberry32(seed + mapId.length * 101);
    const B = new MapBuilder(this.world, rng);
    this.layout = map.build(B);
    this.builder = B;
    B.finish(map.theme);
    this.world.build();
    // chão
    const tex = getTexture(map.ground.kind, map.ground.tint).clone();
    tex.needsUpdate = true;
    const gsize = S * 2 + 600;
    tex.repeat.set(gsize / 4, gsize / 4);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gsize, gsize), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.world.addVisual(ground);
    this.nav = new NavGrid(-S, -S, S, S, 1);
    this.nav.rasterize(this.world.boxes, 0.36);
    this.weather.setLamps(B.lamps);
    if (this.weather.sun.shadow.camera) {
      const r = map.large ? 70 : 60;
      Object.assign(this.weather.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r });
      this.weather.sun.shadow.camera.updateProjectionMatrix();
    }
  }
  unloadMap() {
    for (const c of this.combatants) c.destroy();
    this.combatants = [];
    for (const v of this.vehicles || []) v.destroy();
    this.vehicles = [];
    this.player = null;
    this.ai.clear();
    this.ballistics.clear();
    this.throwables.clear();
    this.fx.clear();
    this.world?.dispose();
    this.world = null; this.nav = null;
    this.mode?.dispose?.();
    this.mode = null;
  }

  startMatch(cfg) {
    this.audio.init();
    this.audio.stopVoices();
    this.cfg = cfg;
    this.loadMap(cfg.map, cfg.seed ?? 1337);
    this.weather.set(cfg.weather ?? this.map.defaults.weather, cfg.time ?? this.map.defaults.time);
    this.weather.timeSpeed = (cfg.timeSpeed ?? this.settings.timeSpeed) / 60;
    this.weather.flashlightOn = false;
    this.time = 0;
    this.squadOrder = 'follow';
    this.friendlyFire = false;
    this.mode = createMode(this, cfg);
    this.mode.setup();
    this.state = 'playing';
    this.matchStart = performance.now();
    this.progression.matchXp = 0;
    this.events.emit('matchStart', cfg);
    if (!this.testMode) this.input.lock();
  }

  // Cliente online: carrega o mesmo mapa (mesma semente) e cria o jogador local.
  startClientMatch(cfg, you, ents, extra) {
    this.audio.init();
    this.audio.stopVoices();
    this.cfg = cfg;
    this.loadMap(cfg.map, cfg.seed ?? 1337);
    this.weather.set(cfg.weather ?? this.map.defaults.weather, cfg.time ?? this.map.defaults.time);
    this.weather.timeSpeed = (cfg.timeSpeed ?? this.settings.timeSpeed) / 60;
    this.time = 0;
    this.mode = new ClientMode(this, cfg, extra);
    const p = this.createPlayer(you.team, you.x, you.z, you.yaw, { regen: false, loadout: { equipment: {} } });
    p.pos.y = you.y || 0; p.parachute = !!you.parachute;
    this.mode.setup(ents, you);
    this.mode.applyLoadout(you.loadout);
    this.state = 'playing';
    this.matchStart = performance.now();
    this.progression.matchXp = 0;
    this.events.emit('matchStart', cfg);
    if (!this.testMode) this.input.lock();
  }

  createPlayer(team, x, z, yaw = 0, extra = {}) {
    const p = new Combatant(this, { isPlayer: true, team, x, z, yaw, name: this.profile.operator.callsign || 'Você', loadout: extra.loadout || this.profile.loadout, health: extra.health ?? 100, armor: extra.armor ?? 0, regen: extra.regen ?? true });
    this.player = p;
    this.combatants.push(p);
    this.viewmodel.build(p.weapon);
    return p;
  }
  spawnBot(o) {
    const c = new Combatant(this, o);
    this.combatants.push(c);
    this.ai.attach(c, o.ai || {});
    return c;
  }
  removeCombatant(c) {
    const i = this.combatants.indexOf(c);
    if (i >= 0) this.combatants.splice(i, 1);
    this.ai.detach(c);
    c.destroy();
  }

  // ---------------- Explosões ----------------
  explode(pos, o) {
    const radius = o.radius ?? 7, damage = o.damage ?? 120;
    this.fx.explosion(pos, radius);
    this.audio.play('explosion', pos, 1);
    if (this.netClient) return; // no cliente, explosões são só visuais (o anfitrião aplica o dano)
    if (this.net.isHost) this.net.queueBoom(pos, radius);
    this.ai.noise(pos, 160, 'explosion', o.attacker);
    const tmp = new THREE.Vector3();
    const origin = pos.clone(); origin.y += 0.4;
    for (const c of this.combatants) {
      if (!c.alive) continue;
      c.chestPos(tmp);
      const d = tmp.distanceTo(pos);
      if (c.isPlayer) this.shake = Math.max(this.shake, clamp(1.4 - d / (radius * 3), 0, 1.2));
      if (d > radius) continue;
      if (!this.world.lineOfSight(origin, tmp) && !this.world.lineOfSight(origin, c.eyePos(new THREE.Vector3()))) continue;
      const k = Math.pow(1 - d / radius, 1.2);
      c.takeDamage(damage * k, { attacker: o.attacker, region: 'chest', dir: tmp.clone().sub(pos).normalize(), point: tmp.clone(), weapon: o.source || 'frag', explosive: true, dist: o.attacker ? o.attacker.pos.distanceTo(c.pos) : 0 });
      c.suppression = 1.5;
    }
    for (const v of this.vehicles) {
      const d = v.pos.distanceTo(pos);
      if (d < radius) v.damage(damage * 2.5 * (1 - d / radius), o.attacker);
    }
    const boxes = this.world.query(pos.x - radius, pos.y - radius, pos.z - radius, pos.x + radius, pos.y + radius, pos.z + radius, []);
    for (const b of boxes) {
      if (!b.destructible || b.removed) continue;
      const cx = clamp(pos.x, b.min.x, b.max.x), cy = clamp(pos.y, b.min.y, b.max.y), cz = clamp(pos.z, b.min.z, b.max.z);
      const d = Math.hypot(cx - pos.x, cy - pos.y, cz - pos.z);
      if (d > radius) continue;
      this.world.damageBox(b, damage * 2.2 * (1 - d / radius) + 20, true, null, o.attacker);
    }
  }

  // ---------------- Eventos de combate ----------------
  onKill(e) {
    const p = this.player;
    if (!p) return;
    if (e.killer === p && e.victim !== p) {
      const cls = this.weaponClassOf(e.weapon);
      this.progression.record({ type: 'kill', weapon: e.weapon, cls, headshot: e.headshot, melee: e.melee, explosive: e.explosive, dist: e.dist });
      this.ai.director.onPlayerKill(e);
      this.audio.play(e.headshot ? 'headshot' : 'kill', null, 0.8);
    }
    if (e.victim === p) this.progression.record({ type: 'death' });
    this.mode?.onKill(e);
  }
  weaponClassOf(id) {
    const w = this.player?.weapons.find((x) => x.id === id);
    return w?.stats.cls || (id === 'knife' ? 'melee' : id === 'frag' || id === 'c4' || id === 'barrel' ? 'explosive' : '');
  }

  endMatch(result) {
    if (this.state === 'results') return;
    this.state = 'results';
    this.input.unlock();
    this.audio.stopVoices();
    const p = this.player;
    const prof = this.profile;
    prof.stats.matches++;
    if (result.won) { prof.stats.wins++; this.progression.addXp(XP.win, 'Vitória'); this.progression.record({ type: 'win' }); }
    else this.progression.addXp(XP.loss, 'Participação');
    if (p) { prof.stats.shots += p.stats.shots; prof.stats.hits += p.stats.hits; }
    prof.stats.playTime += (performance.now() - this.matchStart) / 1000;
    let rank = null;
    if (result.ranked && p) {
      const d = rankDelta(result.won, p.stats.kills, p.stats.deaths, p.stats.score);
      prof.rankPoints = Math.max(0, prof.rankPoints + d);
      rank = d;
    }
    this.progression.checkAchievements();
    this.saveAll();
    this.events.emit('matchEnd', { ...result, xp: this.progression.matchXp, rankDelta: rank });
  }

  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.events.emit('pause'); }
  resume() { if (this.state !== 'paused') return; this.state = 'playing'; this.input.lock(); this.events.emit('resume'); this.last = performance.now(); }
  quitToMenu() {
    if (this.net.isHost && this.net.lobby.inMatch) { this.net.to('all', { k: 'abort' }); this.net.lobby.inMatch = false; this.net.broadcastLobby(); }
    this.netClient = null;
    this.unloadMap();
    this.state = 'menu';
    this.input.unlock();
    this.audio.stopVoices();
    this.events.emit('menu');
    this.setupMenuScene();
  }

  setupMenuScene() {
    this.loadMap('fortress', 7);
    this.weather.set('clear', 17.8);
    this.weather.timeSpeed = 0;
    this.menuT = 0;
  }

  // ---------------- Controle do jogador ----------------
  updatePlayer(dt) {
    const p = this.player;
    if (!p) return;
    const inp = this.input, s = this.settings;
    const it = p.intent;
    if (!p.alive) { it.forward = it.right = 0; it.fire = false; return; }
    if (p.vehicle) {
      let thr = (inp.down('forward') ? 1 : 0) - (inp.down('back') ? 1 : 0);
      let st = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
      if (inp.touch.active) { thr = clamp(thr - inp.touch.moveY, -1, 1); st = clamp(st + inp.touch.moveX, -1, 1); }
      p.vehicle.control(thr, st, inp.down('jump'), dt);
      this.vehCamYaw = (this.vehCamYaw ?? 0) - inp.mouse.dx * 0.003;
      this.vehCamPitch = clamp((this.vehCamPitch ?? -0.25) - inp.mouse.dy * 0.003, -0.9, 0.3);
      if (inp.hit('interact')) this.mode?.interact?.(p);
      return;
    }
    const w = p.weapon;
    const zoom = lerp(1, w.stats.adsZoom, p.ads);
    const sens = 0.0022 * s.sensitivity * (p.ads > 0.5 ? s.adsSensitivity / Math.sqrt(zoom) : 1);
    p.yaw -= inp.mouse.dx * sens;
    p.pitch -= inp.mouse.dy * sens * (s.invertY ? -1 : 1);
    p.pitch = clamp(p.pitch, -1.5, 1.5);
    it.forward = (inp.down('forward') ? 1 : 0) - (inp.down('back') ? 1 : 0);
    it.right = (inp.down('right') ? 1 : 0) - (inp.down('left') ? 1 : 0);
    it.sprint = inp.down('sprint');
    if (inp.touch.active) {
      // joystick analógico; empurrado até o fim para frente = correr
      it.forward = clamp(it.forward - inp.touch.moveY, -1, 1);
      it.right = clamp(it.right + inp.touch.moveX, -1, 1);
      if (-inp.touch.moveY > 0.85 && Math.hypot(inp.touch.moveX, inp.touch.moveY) > 0.95) it.sprint = true;
    }
    if (inp.hit('crouch')) this.crouchToggle = !this.crouchToggle;
    if (it.sprint && it.forward > 0) this.crouchToggle = false;
    it.crouch = this.crouchToggle || inp.down('crouch2');
    if (inp.hit('jump')) { it.jump = true; this.crouchToggle = false; }
    it.fire = inp.mouse.left;
    if (inp.mouse.leftPressed) it.firePressed = true;
    if (!inp.mouse.left && w.stats.mode !== 'burst') it.firePressed = false;
    it.ads = inp.mouse.right;
    if (inp.hit('reload')) it.reload = true;
    if (inp.hit('slot1')) it.switchTo = 0;
    if (inp.hit('slot2')) it.switchTo = 1;
    if (inp.mouse.wheel) it.switchTo = (p.slot + 1) % Math.max(1, p.weapons.length);
    if (inp.hit('grenade')) it.throw = p.grenadeType;
    if (inp.hit('cycleGrenade')) {
      const types = ['frag', 'smoke', 'flash'].filter((t) => p.grenades[t] > 0);
      if (types.length) { const i = types.indexOf(p.grenadeType); p.grenadeType = types[(i + 1) % types.length]; this.audio.play('ui'); }
    }
    if (inp.hit('melee')) it.melee = true;
    if (inp.hit('fireMode') && w.cycleFireMode()) { this.audio.play('ui'); this.events.emit('toast', { title: 'Modo de disparo', text: { auto: 'Automático', burst: 'Rajada', semi: 'Semiautomático' }[w.fireMode], small: true }); }
    if (inp.hit('flashlight')) this.weather.toggleFlashlight();
    if (inp.hit('interact')) this.mode?.interact?.(p);
    if (inp.hit('order')) this.cycleSquadOrder();
  }

  cycleSquadOrder() {
    const allies = this.combatants.filter((c) => c.alive && c.team === this.player.team && c.brain?.opts.ally);
    if (!allies.length) return;
    const order = { follow: 'hold', hold: 'attack', attack: 'follow' }[this.squadOrder || 'follow'];
    this.squadOrder = order;
    if (order === 'hold') for (const a of allies) a.brain.holdPos = [a.pos.x, a.pos.z];
    if (order === 'attack') {
      const hit = this.world.raycast(this.camera.getWorldPosition(new THREE.Vector3()), this.player.forward(), 200);
      const pt = hit?.point || this.player.pos.clone().addScaledVector(this.player.forward(), 30);
      this.squadOrderPos = [pt.x, pt.z];
    }
    for (const a of allies) { a.brain.thinkT = 0; a.brain.moveGoal = null; }
    const txt = { follow: 'Esquadrão: comigo!', hold: 'Esquadrão: manter posição!', attack: 'Esquadrão: atacar posição marcada!' }[order];
    this.events.emit('radio', { from: this.player.name, text: txt });
    this.audio.play('radio');
  }

  // ---------------- Laço principal ----------------
  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.manualFrames) { this.last = now; return; } // testes automatizados controlam os quadros
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.frame(dt);
  }

  frame(dt) {
    const t0 = performance.now();
    this.audio.beginFrame();
    if (this.state === 'playing') this.simulate(dt);
    else if (this.state === 'menu') this.menuCamera(dt);
    else if (this.state === 'results' || this.state === 'paused') this.weather.update(0, this.camera.position);
    const t1 = performance.now();
    this.render();
    const t2 = performance.now();
    this.events.emit('frame', dt);
    this.input.endFrame();
    const pf = this.perf;
    pf.acc += dt; pf.frames++;
    pf.sim = lerp(pf.sim, t1 - t0, 0.05); pf.render = lerp(pf.render, t2 - t1, 0.05);
    if (pf.acc >= 0.5) { pf.fps = pf.frames / pf.acc; pf.acc = 0; pf.frames = 0; }
  }

  simulate(dt) {
    this.time += dt;
    if (this.manualFrames) this.audio.beginFrame();
    this.updatePlayer(dt);
    this.mode.update(dt);
    if (!this.netClient) this.ai.update(dt);
    for (const c of this.combatants) c.update(dt);
    if (!this.netClient) for (const v of this.vehicles) v.update(dt);
    this.ballistics.update(dt);
    this.throwables.update(dt);
    this.fx.update(dt);
    this.updateCamera(dt);
    this.weather.update(dt, this.camera.position);
    this.viewmodel.update(dt, this.player, this.input.mouse.dx, this.input.mouse.dy);
    if (this.netClient) this.net.clientTick(dt); else this.net.hostTick(dt);
    // culling de modelos distantes
    const cp = this.camera.position;
    const maxD = this.map.large ? 260 : 400;
    for (const c of this.combatants) {
      if (!c.model) continue;
      const d = Math.hypot(c.pos.x - cp.x, c.pos.z - cp.z);
      c.model.group.visible = d < maxD && (c.alive || c.deadTime < 20);
    }
  }

  updateCamera(dt) {
    const p = this.player, cam = this.camera;
    if (!p) return;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (p.alive && p.vehicle) {
      const v = p.vehicle;
      const yaw = v.yaw + (this.vehCamYaw || 0), pitch = this.vehCamPitch ?? -0.25;
      const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      cam.position.copy(v.pos).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(back, 8);
      cam.rotation.set(pitch, yaw, 0);
      if (cam.fov !== this.settings.fov) { cam.fov = this.settings.fov; cam.updateProjectionMatrix(); }
    } else if (p.alive) {
      p.eyePos(cam.position);
      // bob leve
      const hs = Math.hypot(p.vel.x, p.vel.z);
      this.bobT = (this.bobT || 0) + dt * hs * 1.8;
      cam.position.y += Math.sin(this.bobT * 2) * 0.025 * Math.min(1, hs / 5) * (1 - p.ads);
      const sh = this.shake * 0.04;
      cam.rotation.set(p.pitch + rand(-sh, sh), p.yaw + rand(-sh, sh), rand(-sh, sh) * 0.5 + (p.intent.right || 0) * -0.012 * (1 - p.ads));
      const w = p.weapon;
      const zoom = lerp(1, w.stats.adsZoom, p.ads);
      const fov = (2 * Math.atan(Math.tan((this.settings.fov * Math.PI) / 360) / zoom) * 180) / Math.PI;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); this.fx.setScale(innerHeight / (2 * Math.tan((fov * Math.PI) / 360))); }
    } else {
      // câmera de morte: cai e observa o assassino
      cam.position.lerp(new THREE.Vector3(p.pos.x, p.pos.y + 0.4, p.pos.z), Math.min(1, dt * 3));
      const k = p.lastKiller;
      if (k && k.alive) {
        const dx = k.pos.x - cam.position.x, dz = k.pos.z - cam.position.z, dy = k.pos.y + 1.4 - cam.position.y;
        const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
        cam.rotation.set(lerp(cam.rotation.x, pitch, dt * 3), yaw, 0.3);
      } else cam.rotation.z = lerp(cam.rotation.z, 0.4, dt * 2);
    }
    const fwd = p.forward();
    this.audio.setListener(cam.position, fwd);
  }

  menuCamera(dt) {
    if (!this.world) return;
    this.menuT = (this.menuT || 0) + dt * 0.04;
    const r = 70;
    this.camera.position.set(Math.cos(this.menuT) * r, 28, Math.sin(this.menuT) * r);
    this.camera.lookAt(0, 2, 0);
    this.camera.fov = 60; this.camera.updateProjectionMatrix();
    this.weather.update(dt, this.camera.position);
    this.fx.update(dt);
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if ((this.state === 'playing' || this.state === 'paused') && this.player?.alive && !this.player.vehicle && this.viewmodel.current) {
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }
  }
}
