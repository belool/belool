import * as THREE from 'three';
import { angleWrap, clamp, rand, pick } from '../core/util.js';
import { compass } from './Squad.js';

// ================================================================
// AI BRAIN — máquina de estados tática por soldado.
// Estados: patrol, investigate, hunt, combat, cover, flank, retreat,
// follow (aliados), hold, objective.
// Percepção: visão (FOV, distância, luz do dia, neblina, fumaça),
// audição (tiros, passos, explosões), dano e tiros próximos (supressão).
// ================================================================

export const DIFFICULTY = {
  easy: { name: 'Recruta', reaction: 0.85, err0: 0.07, errMin: 0.017, errDecay: 0.2, turn: 3.2, view: 0.75, burstMul: 0.7, dmgTaken: 1.15 },
  normal: { name: 'Regular', reaction: 0.55, err0: 0.05, errMin: 0.0105, errDecay: 0.32, turn: 4.5, view: 0.9, burstMul: 1, dmgTaken: 1 },
  hard: { name: 'Veterano', reaction: 0.35, err0: 0.04, errMin: 0.0068, errDecay: 0.45, turn: 6.5, view: 1, burstMul: 1.2, dmgTaken: 0.9 },
  elite: { name: 'Elite', reaction: 0.22, err0: 0.03, errMin: 0.0045, errDecay: 0.6, turn: 9, view: 1.1, burstMul: 1.4, dmgTaken: 0.85 },
};

const V = new THREE.Vector3(), V2 = new THREE.Vector3();

export class AIBrain {
  constructor(game, c, opts = {}) {
    this.game = game; this.c = c; this.opts = opts;
    this.diff = DIFFICULTY[opts.difficulty || 'normal'];
    c.damageTakenMul *= c.team === game.player?.team ? 0.8 : this.diff.dmgTaken;
    this.squad = null;
    this.reset();
  }
  reset() {
    this.state = this.opts.guard ? 'hold' : 'patrol';
    this.role = 'assault';
    this.target = null; this.targetVisible = false; this.visibleSince = 0;
    this.lastSeen = null; // { pos, t }
    this.path = null; this.pathIdx = 0; this.moveGoal = null; this.pendingTarget = null; this.repath = 0;
    this.perceiveT = Math.random() * 0.3; this.thinkT = Math.random() * 0.5;
    this.reaction = 0; this.err = this.diff.err0; this.errVec = new THREE.Vector2(); this.errT = 0;
    this.burst = 0; this.burstPause = 0;
    this.strafe = 0; this.strafeT = 0;
    this.inCover = false; this.coverPos = null;
    this.flankPoint = null;
    this.investigate = null;
    this.stuckT = 0; this.lastProgress = this.c.pos.clone(); this.stuckCount = 0;
    this.lookYaw = this.c.yaw; this.idleT = 0;
    this.retreatUntil = 0;
    this.suppressUntil = 0;
    this.lastThrow = -99;
    this.peekT = 0;
    this.urgent = false;
    this.lod = 0; this.abstractT = Math.random();
    this.holdPos = this.opts.holdPos ? [...this.opts.holdPos] : null;
  }
  setRole(r) {
    if (this.role === r) return;
    this.role = r;
    if (r === 'flankL' || r === 'flankR') { this.flankPoint = null; this.say(r === 'flankL' ? 'Flanqueando pela esquerda!' : 'Flanqueando pela direita!'); }
    if (r === 'suppress' && Math.random() < 0.4) this.say('Fogo de supressão!');
  }
  say(text, important) { this.game.ai.callout(this.c, text, important); }

  // ----- Percepção -------------------------------------------------
  isEnemy(o) { return o !== this.c && o.alive && o.team !== this.c.team; }

  viewDistance(target) {
    const w = this.game.weather;
    const day = w?.dayFactor ?? 1;
    let d = 140 * this.diff.view;
    let light = 0.3 + day * 0.7;
    if (target.isPlayer && w?.flashlightOn) light = 1;
    if (this.game.time - target.lastShot < 1.2 && !target.weapon.stats.suppressed) light = 1;
    d *= light;
    const fog = this.game.scene.fog?.density ?? 0;
    d /= 1 + fog * 60;
    if (target.crouchT > 0.5 && this.game.time - target.lastShot > 2) d *= 0.75;
    return Math.max(18, d);
  }

  perceive() {
    const c = this.c, game = this.game;
    const eye = c.eyePos(new THREE.Vector3());
    const fwd = c.forward(new THREE.Vector3());
    let best = null, bestScore = -Infinity;
    const flashed = c.flashed > 0.6;
    for (const e of game.combatants) {
      if (!this.isEnemy(e)) continue;
      const dx = e.pos.x - c.pos.x, dz = e.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 200) continue;
      if (flashed && d > 3) continue;
      const maxD = this.viewDistance(e);
      if (d > maxD) continue;
      V.set(dx, e.pos.y + e.height * 0.8 - eye.y, dz).normalize();
      const inFov = V.dot(fwd) > 0.2 || d < 7 || (this.state === 'combat' && V.dot(fwd) > -0.2);
      if (!inFov) continue;
      const tgt = e.eyePos(V2); tgt.y -= 0.1;
      let vis = game.world.lineOfSight(eye, tgt);
      if (!vis) vis = game.world.lineOfSight(eye, e.chestPos(V2));
      if (!vis) continue;
      this.squad?.report(e, e.pos, c);
      // pontuação: perto, ameaçando, jogador tem leve prioridade
      let score = -d;
      if (e === this.target) score += 15;
      if (e.isPlayer || e.human) score += 6;
      if (game.time - e.lastShot < 2) score += 8;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    const was = this.targetVisible;
    if (best) {
      if (best !== this.target || !was) {
        // tempo de reação ao adquirir o alvo
        const d = best.pos.distanceTo(c.pos);
        this.reaction = this.diff.reaction * (0.6 + Math.min(1, d / 60)) * (this.state === 'combat' ? 0.5 : 1) * rand(0.8, 1.2);
        this.err = Math.max(this.err, this.diff.err0 * (best !== this.target ? 1 : 0.6));
        if (this.state !== 'combat' && this.state !== 'retreat') this.state = 'combat';
      }
      this.target = best; this.targetVisible = true;
      this.lastSeen = { pos: best.pos.clone(), t: game.time };
    } else {
      this.targetVisible = false;
      if (this.target && !this.target.alive) {
        if (this.target.lastKiller === this.c) this.say(pick(['Alvo abatido!', 'Inimigo neutralizado!', 'Abatido!']));
        this.target = null;
      }
    }
  }

  hear(n) {
    const c = this.c;
    if (n.source === c || (n.source && n.source.team === c.team)) return;
    const d = n.pos.distanceTo(c.pos);
    if (d > n.radius) return;
    if (this.state === 'combat' && this.targetVisible) return;
    if (n.type === 'gunshot' && n.source && d < n.radius * 0.6) {
      // tiro ouvido revela a posição aproximada do atirador
      const approx = n.source.pos.clone().add(new THREE.Vector3(rand(-6, 6), 0, rand(-6, 6)).multiplyScalar(d / n.radius));
      this.squad?.report(n.source, approx, null);
      this.investigate = approx;
    } else this.investigate = n.pos.clone();
    if (this.state === 'patrol' || this.state === 'follow' || this.state === 'hold') {
      this.state = this.opts.guard && d > 25 ? 'hold' : 'investigate';
      if (Math.random() < 0.3) this.say(n.type === 'gunshot' ? 'Tiros! Fiquem atentos!' : 'Ouvi alguma coisa...');
    }
    this.lookAt(this.investigate);
  }
  onNearMiss(shooter, from) {
    if (shooter && this.isEnemy(shooter)) {
      this.squad?.report(shooter, shooter.pos.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4))), null);
      if (!this.targetVisible) { this.lookAt(shooter.pos); this.investigate = shooter.pos.clone(); if (this.state !== 'retreat') this.state = 'combat'; if (!this.target) this.target = shooter; }
    }
    this.err = Math.min(this.diff.err0 * 1.5, this.err + 0.02);
    if (this.c.suppression > 0.9 && !this.inCover && Math.random() < 0.6) this.thinkT = 0;
  }
  onDamaged(info) {
    const a = info.attacker;
    if (a && this.isEnemy(a)) {
      this.squad?.report(a, a.pos, null);
      if (!this.targetVisible) { this.target = a; this.lastSeen = { pos: a.pos.clone(), t: this.game.time }; this.lookAt(a.pos); }
      if (this.state !== 'retreat') this.state = 'combat';
    }
    this.thinkT = Math.min(this.thinkT, 0.1);
    if (this.c.health < this.c.maxHealth * 0.5 && Math.random() < 0.3) this.say(pick(['Fui atingido!', 'Estou ferido!', 'Preciso de cobertura!']), true);
  }
  onGrenade(g) {
    if (g.thrower === this.c || g.type !== 'frag') return;
    // reage alguns décimos depois: foge da granada
    setTimeout(() => {
      if (!this.c.alive || !this.game.throwables.list.includes(g)) return;
      const d = g.pos.distanceTo(this.c.pos);
      if (d < 9) {
        this.say('Granada!', true);
        const away = this.c.pos.clone().sub(g.pos).setY(0).normalize().multiplyScalar(10);
        this.moveTo(this.c.pos.x + away.x, this.c.pos.z + away.z, true);
        this.urgent = true;
        this.inCover = false;
      }
    }, 250 + Math.random() * 300);
  }
  lookAt(p) { if (p) this.lookYaw = Math.atan2(-(p.x - this.c.pos.x), -(p.z - this.c.pos.z)); }

  // ----- Navegação --------------------------------------------------
  moveTo(x, z, urgent = false) {
    this.urgent = urgent;
    if (this.moveGoal && Math.hypot(this.moveGoal[0] - x, this.moveGoal[1] - z) < 1.5 && (this.path || this.pendingTarget)) return;
    this.moveGoal = [x, z];
    this.game.ai.requestPath(this, x, z);
  }
  stop() { this.path = null; this.moveGoal = null; this.pendingTarget = null; }
  setPath(p) { this.path = p; this.pathIdx = 0; this.stuckT = 0; this.lastProgress.copy(this.c.pos); }
  arrived(r = 1.2) { return !this.moveGoal || Math.hypot(this.moveGoal[0] - this.c.pos.x, this.moveGoal[1] - this.c.pos.z) < r; }

  // Escolhe cobertura contra uma ameaça (ou longe dela, em recuo).
  findCover(threatPos, mode = 'near') {
    const c = this.c, game = this.game;
    const radius = mode === 'retreat' ? 35 : 18;
    const cands = game.nav.coverCandidates(c.pos.x, c.pos.z, radius, 40);
    if (!cands.length) return null;
    const range = c.weapon.stats.range;
    const taken = (this.squad?.alive || []).filter((m) => m !== c && m.brain?.coverPos).map((m) => m.brain.coverPos);
    const scored = cands.map((p) => {
      const dt = threatPos ? Math.hypot(p.x - threatPos.x, p.z - threatPos.z) : 20;
      let s = -p.d * 0.4;
      if (mode === 'retreat') s += dt * 0.5;
      else { s -= Math.abs(dt - Math.min(40, range * 0.9)) * 0.15; if (dt < 6) s -= 10; }
      if (threatPos) {
        // não aproximar-se atravessando a linha de fogo
        const toThreatMe = Math.hypot(c.pos.x - threatPos.x, c.pos.z - threatPos.z);
        if (mode !== 'retreat' && dt < toThreatMe - 10) s -= 4;
      }
      if (taken.some((t) => Math.hypot(t[0] - p.x, t[1] - p.z) < 2)) s -= 8;
      return { p, s };
    }).sort((a, b) => b.s - a.s).slice(0, 10);
    if (!threatPos) return scored[0]?.p;
    const te = new THREE.Vector3(threatPos.x, threatPos.y + 1.6, threatPos.z);
    for (const { p } of scored) {
      // coberto quando agachado? (cabeça a ~1,0 m)
      const hidden = !game.world.lineOfSight(te, new THREE.Vector3(p.x, 1.0, p.z));
      if (hidden) return p;
    }
    return null;
  }

  // ----- Decisão ---------------------------------------------------
  think() {
    const c = this.c, game = this.game, t = game.time;
    const tactics = game.ai.director.tactics;
    const sq = this.squad;
    // Alvo perdido há muito tempo
    if (this.target && (!this.target.alive || (this.lastSeen && t - this.lastSeen.t > 25))) { this.target = null; }
    if (this.state === 'retreat') {
      if (t > this.retreatUntil || this.arrived(1.5) && t > this.retreatUntil - 4) { this.state = this.target ? 'combat' : 'patrol'; this.inCover = true; }
      return;
    }
    const lowHp = c.health < c.maxHealth * 0.3 && !this.opts.boss && !this.opts.noRetreat;
    if ((this.target || sq?.freshest()) && (lowHp || sq?.retreating) && !this.opts.noRetreat) {
      const threat = this.lastSeen?.pos || sq?.freshest()?.k.pos;
      const cov = this.findCover(threat, 'retreat');
      if (cov) {
        this.state = 'retreat'; this.retreatUntil = t + 8;
        this.coverPos = [cov.x, cov.z];
        this.moveTo(cov.x, cov.z, true);
        if (lowHp) this.say(pick(['Recuando para me tratar!', 'Saindo da linha de fogo!']), true);
        if (c.grenades.smoke > 0 && tactics.smoke > 0.3 && Math.random() < 0.5 && threat) this.throwAt(threat, 'smoke', 0.5);
        return;
      }
    }
    if (this.state === 'combat' || this.target) {
      this.state = 'combat';
      this.combatThink();
      return;
    }
    // Sem alvo direto: conhecimento do esquadrão
    const f = sq?.freshest();
    if (f && t - f.k.t < 12) {
      this.state = 'hunt';
      this.lookAt(f.k.pos);
      this.moveTo(f.k.pos.x + rand(-4, 4), f.k.pos.z + rand(-4, 4), false);
      return;
    }
    if (this.investigate) {
      this.state = 'investigate';
      this.moveTo(this.investigate.x, this.investigate.z, false);
      if (this.arrived(2.5)) { this.investigate = null; this.state = 'patrol'; this.idleT = 3; }
      return;
    }
    this.idleBehaviour();
  }

  idleBehaviour() {
    const c = this.c, game = this.game;
    // Ordens do jogador para aliados
    if (this.opts.ally && game.player?.alive) {
      const order = game.squadOrder || 'follow';
      if (order === 'hold' && this.holdPos) { this.state = 'hold'; if (!this.arrived(2)) this.moveTo(this.holdPos[0], this.holdPos[1]); return; }
      if (order === 'attack' && game.squadOrderPos) { this.state = 'objective'; this.moveTo(game.squadOrderPos[0] + rand(-3, 3), game.squadOrderPos[1] + rand(-3, 3)); return; }
      if (this.opts.follow) {
        this.state = 'follow';
        const p = game.player.pos;
        const idx = this.opts.followIdx ?? 0;
        const ang = game.player.yaw + Math.PI + (idx - 1) * 0.6;
        const fx = p.x - Math.sin(ang) * -4 * (1 + idx * 0.4), fz = p.z - Math.cos(ang) * -4 * (1 + idx * 0.4);
        if (Math.hypot(p.x - c.pos.x, p.z - c.pos.z) > 7) this.moveTo(fx, fz, Math.hypot(p.x - c.pos.x, p.z - c.pos.z) > 18);
        else { this.stop(); this.lookYaw = game.player.yaw + (idx - 1) * 0.8; }
        return;
      }
    }
    if (this.opts.guard || this.state === 'hold') {
      this.state = 'hold';
      if (this.holdPos && Math.hypot(this.holdPos[0] - c.pos.x, this.holdPos[1] - c.pos.z) > 3) this.moveTo(this.holdPos[0], this.holdPos[1]);
      else if (Math.random() < 0.3) this.lookYaw += rand(-1.5, 1.5);
      return;
    }
    const goal = this.squad?.goal || this.opts.goal;
    if (goal) {
      this.state = 'objective';
      const gx = goal.x, gz = goal.z, r = goal.radius ?? 6;
      if (Math.hypot(gx - c.pos.x, gz - c.pos.z) > r || !this.moveGoal) {
        if (!this.moveGoal || this.arrived(2) || Math.hypot(this.moveGoal[0] - gx, this.moveGoal[1] - gz) > r * 1.5) {
          const p = game.nav.randomWalkable(Math.random, [gx, gz], r) || [gx, gz];
          this.moveTo(p[0], p[1], goal.type === 'attack');
        }
      } else if (Math.random() < 0.25) { this.lookYaw += rand(-1.2, 1.2); }
      return;
    }
    // Patrulha aleatória
    this.state = 'patrol';
    this.idleT -= 0.5;
    if ((this.arrived(2) || !this.moveGoal) && this.idleT <= 0) {
      const p = game.nav.randomWalkable(Math.random, [c.pos.x, c.pos.z], 25);
      if (p) this.moveTo(p[0], p[1]);
      this.idleT = rand(2, 6);
    }
  }

  combatThink() {
    const c = this.c, game = this.game, t = game.time;
    const tactics = game.ai.director.tactics;
    const tgt = this.target;
    const lastPos = this.lastSeen?.pos || tgt?.pos;
    if (!lastPos) { this.state = 'patrol'; return; }
    const dist = Math.hypot(lastPos.x - c.pos.x, lastPos.z - c.pos.z);
    const range = c.weapon.stats.range;
    const unseenFor = this.lastSeen ? t - this.lastSeen.t : 99;
    // Granada em alvo entrincheirado / campeiro
    if (unseenFor > 1.5 && unseenFor < 8 && dist > 8 && dist < 30 && c.grenades.frag > 0 && t - this.lastThrow > 10 && Math.random() < tactics.grenade * 0.6) {
      this.throwAt(lastPos, 'frag');
      this.say('Granada saindo!', true);
      return;
    }
    // Sob supressão pesada: procurar cobertura
    if (c.suppression > 0.8 && !this.inCover && Math.random() < 0.7) {
      const cov = this.findCover(lastPos, 'near');
      if (cov) { this.coverPos = [cov.x, cov.z]; this.moveTo(cov.x, cov.z, true); this.inCover = false; this.coverGoal = true; return; }
    }
    if (this.coverGoal && this.coverPos) {
      if (this.arrived(1.0)) { this.inCover = true; this.coverGoal = false; this.stop(); this.peekT = rand(0.8, 2); }
      else return;
    }
    switch (this.role) {
      case 'flankL': case 'flankR': {
        if (!this.flankPoint) {
          const dx = c.pos.x - lastPos.x, dz = c.pos.z - lastPos.z;
          const L = Math.hypot(dx, dz) || 1;
          const side = this.role === 'flankL' ? 1 : -1;
          const px = -dz / L * side, pz = dx / L * side;
          const off = clamp(dist * 0.6, 10, 22);
          const fp = game.nav.nearestWalkable(lastPos.x + px * off + dx / L * 6, lastPos.z + pz * off + dz / L * 6, 8);
          this.flankPoint = fp ? game.nav.center(fp[0], fp[1]) : null;
          if (!this.flankPoint) { this.role = 'assault'; break; }
        }
        this.inCover = false;
        this.moveTo(this.flankPoint[0], this.flankPoint[1], !this.targetVisible);
        if (this.arrived(2.5) || (this.targetVisible && dist < 14)) { this.role = 'assault'; this.flankPoint = null; }
        break;
      }
      case 'suppress': {
        if (!this.inCover) {
          const cov = this.findCover(lastPos, 'near');
          if (cov && Math.hypot(cov.x - c.pos.x, cov.z - c.pos.z) < 14) { this.coverPos = [cov.x, cov.z]; this.moveTo(cov.x, cov.z, true); this.coverGoal = true; }
          else this.stop();
        }
        if (!this.targetVisible && unseenFor < 4) this.suppressUntil = t + 1.5;
        if (unseenFor > 9) this.role = 'assault';
        break;
      }
      default: { // assault
        if (c.weapon.isMelee) { this.inCover = false; this.moveTo(lastPos.x, lastPos.z, true); break; }
        const pref = clamp(range * 0.8, 8, 45) * (tactics.hold > 0.5 ? 1.2 : 1);
        if (!this.targetVisible) {
          this.inCover = false;
          // avança para última posição conhecida (caça)
          this.moveTo(lastPos.x + rand(-3, 3), lastPos.z + rand(-3, 3), unseenFor < 5 && tactics.push > 0.3);
        } else if (dist > pref) {
          this.inCover = false;
          const cov = this.findCover(lastPos, 'near');
          if (cov && Math.hypot(cov.x - lastPos.x, cov.z - lastPos.z) < dist - 3) { this.coverPos = [cov.x, cov.z]; this.moveTo(cov.x, cov.z); this.coverGoal = true; }
          else this.moveTo(lastPos.x, lastPos.z);
        } else if (dist < pref * 0.4 && tactics.hold > 0.5 && !this.opts.boss) {
          // jogador agressivo: manter distância
          const away = c.pos.clone().sub(lastPos).setY(0).normalize().multiplyScalar(8);
          this.moveTo(c.pos.x + away.x, c.pos.z + away.z);
        } else {
          this.stop();
          if (!this.inCover && Math.random() < 0.35) {
            const cov = this.findCover(lastPos, 'near');
            if (cov && Math.hypot(cov.x - c.pos.x, cov.z - c.pos.z) < 8) { this.coverPos = [cov.x, cov.z]; this.moveTo(cov.x, cov.z); this.coverGoal = true; }
          }
        }
      }
    }
    if (this.opts.boss && c.grenades.frag > 0 && t - this.lastThrow > 7 && dist < 28 && dist > 7 && Math.random() < 0.4) this.throwAt(lastPos, 'frag');
  }

  throwAt(p, type, distMul = 1) {
    const c = this.c;
    const dx = p.x - c.pos.x, dz = p.z - c.pos.z;
    const d = Math.hypot(dx, dz) * distMul;
    this.lastThrow = this.game.time;
    c.yaw = Math.atan2(-dx, -dz);
    const v = 16;
    const s = clamp((16 * d) / (v * v), 0, 1);
    c.pitch = clamp(0.5 * Math.asin(s) - 0.18, -0.2, 0.9);
    c.intent.throw = type;
    c.intent.throwPower = v;
  }

  // ----- Execução por quadro ---------------------------------------
  update(dt) {
    const c = this.c, it = c.intent, game = this.game;
    it.forward = 0; it.right = 0; it.sprint = false; it.fire = false; it.firePressed = false; it.ads = false; it.jump = false;
    if (this.lod === 1) return this.abstractUpdate(dt);
    this.perceiveT -= dt; this.thinkT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.18 + Math.random() * 0.12; this.perceive(); }
    if (this.thinkT <= 0) { this.thinkT = 0.45 + Math.random() * 0.35; this.think(); }
    if (c.flashed > 0.4) {
      // atordoado: tropeça e atira a esmo
      it.forward = Math.sin(game.time * 3) * 0.5; it.right = Math.cos(game.time * 2);
      c.yaw += Math.sin(game.time * 5) * dt * 2;
      return;
    }
    this.followPath(dt);
    this.aimAndShoot(dt);
    // Agachar em cobertura e espiar para atirar
    const crouchPref = this.inCover || (this.state === 'combat' && this.targetVisible && c.weapon.stats.cls === 'sniper');
    if (this.inCover) {
      this.peekT -= dt;
      if (this.peekT <= 0) { this.peeking = !this.peeking; this.peekT = this.peeking ? rand(1.2, 2.6) : rand(0.6, 1.6); }
      it.crouch = !this.peeking || (this.targetVisible && this.c.crouchT > 0.5 && this.peekStillVisible());
      if (c.weapon.mag < c.weapon.stats.mag * 0.4 && !this.targetVisible) { it.reload = true; it.crouch = true; }
    } else it.crouch = crouchPref;
    // recarga tática fora de combate
    if (!this.target && c.weapon.mag < c.weapon.stats.mag * 0.5) it.reload = true;
    // regeneração lenta fora de perigo
    if (game.time - c.lastDamage > 8 && c.health < c.maxHealth) c.health = Math.min(c.maxHealth, c.health + dt * 6);
  }
  peekStillVisible() { return this.targetVisible; }

  followPath(dt) {
    const c = this.c, it = c.intent;
    let moveX = 0, moveZ = 0;
    if (this.path && this.pathIdx < this.path.length) {
      const [wx, wz] = this.path[this.pathIdx];
      const dx = wx - c.pos.x, dz = wz - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) { this.pathIdx++; if (this.pathIdx >= this.path.length) { this.path = null; } }
      else { moveX = dx / d; moveZ = dz / d; }
      // detecção de travamento
      this.stuckT += dt;
      if (this.stuckT > 1.4) {
        if (c.pos.distanceTo(this.lastProgress) < 0.6) {
          this.stuckCount++;
          it.jump = true;
          if (this.moveGoal) this.game.ai.requestPath(this, this.moveGoal[0], this.moveGoal[1]);
          if (this.stuckCount > 3) { this.path = null; this.moveGoal = null; this.stuckCount = 0; }
        } else this.stuckCount = 0;
        this.stuckT = 0; this.lastProgress.copy(c.pos);
      }
    }
    // Separação entre aliados
    for (const o of this.game.combatants) {
      if (o === c || !o.alive || o.team !== c.team) continue;
      const dx = c.pos.x - o.pos.x, dz = c.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.4 && d2 > 1e-4) { const d = Math.sqrt(d2); moveX += dx / d * 0.6; moveZ += dz / d * 0.6; }
    }
    // Strafe durante tiroteio
    if (this.state === 'combat' && this.targetVisible && !this.inCover && !this.path && this.burstPause > 0) {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1); this.strafeT = rand(0.6, 1.8); }
      const ry = c.yaw;
      moveX += Math.cos(ry) * this.strafe * 0.7; moveZ += -Math.sin(ry) * this.strafe * 0.7;
    }
    const len = Math.hypot(moveX, moveZ);
    if (len > 0.05) {
      moveX /= Math.max(1, len); moveZ /= Math.max(1, len);
      const s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      it.forward = -(moveX * s + moveZ * co);
      it.right = moveX * co - moveZ * s;
      it.sprint = this.urgent && !this.targetVisible && it.forward > 0.5;
      if (!this.target || !this.targetVisible) this.lookYaw = Math.atan2(-moveX, -moveZ);
    }
  }

  aimAndShoot(dt) {
    const c = this.c, it = c.intent, game = this.game;
    const tgt = this.target;
    let aimPoint = null;
    const suppressing = !this.targetVisible && game.time < this.suppressUntil && this.lastSeen;
    if (tgt && this.targetVisible) {
      aimPoint = tgt.chestPos(new THREE.Vector3());
      if (this.diff.reaction < 0.4 && Math.random() < 0.002) aimPoint = tgt.eyePos(new THREE.Vector3());
      // antecipação de alvo em movimento
      const lead = c.weapon.stats.velocity > 0 ? c.pos.distanceTo(tgt.pos) / c.weapon.stats.velocity : 0;
      aimPoint.addScaledVector(tgt.vel, lead);
    } else if (suppressing) {
      aimPoint = this.lastSeen.pos.clone(); aimPoint.y += 1.2;
    } else if (this.lastSeen && this.target && game.time - this.lastSeen.t < 6) {
      aimPoint = this.lastSeen.pos.clone(); aimPoint.y += 1.3;
    }
    const eye = c.eyePos(new THREE.Vector3());
    let yawT = this.lookYaw, pitchT = 0;
    if (aimPoint) {
      const dx = aimPoint.x - eye.x, dy = aimPoint.y - eye.y, dz = aimPoint.z - eye.z;
      yawT = Math.atan2(-dx, -dz);
      pitchT = Math.atan2(dy, Math.hypot(dx, dz));
    }
    const turn = this.diff.turn * dt * (c.flashed > 0 ? 0.3 : 1);
    const dyaw = angleWrap(yawT - c.yaw);
    c.yaw += clamp(dyaw, -turn, turn);
    c.pitch += clamp(pitchT - c.pitch, -turn, turn);
    // Erro de mira: diminui com tempo de rastreio; aumenta com supressão/movimento
    const moving = Math.hypot(c.vel.x, c.vel.z) > 1 ? 1 : 0;
    const tgtMoving = tgt ? Math.min(1, Math.hypot(tgt.vel.x, tgt.vel.z) / 5) : 0;
    const errTarget = this.diff.errMin * (1 + moving * 0.5 + c.suppression * 1.2 + tgtMoving * 0.5) * (this.opts.ally ? 0.9 : 1);
    this.err += (errTarget - this.err) * Math.min(1, this.diff.errDecay * dt * 6);
    this.errT -= dt;
    if (this.errT <= 0) { this.errT = 0.25; this.errVec.set(rand(-1, 1), rand(-1, 1)).multiplyScalar(this.err); }
    c.aimError.copy(this.errVec);
    // Disparo
    this.reaction -= dt;
    const w = c.weapon;
    if (!aimPoint || (!this.targetVisible && !suppressing) || this.reaction > 0) { this.burst = 0; return; }
    const dist = aimPoint.distanceTo(eye);
    if (dist > Math.max(50, w.stats.range * 2.2) && !suppressing) return;
    if (w.isMelee && dist > 2.3) return;
    if (Math.abs(dyaw) > 0.12 + (w.stats.cls === 'shotgun' ? 0.1 : 0)) return;
    if (this.friendlyInLine(eye, aimPoint)) return;
    if (dist > 12 || w.stats.cls === 'sniper' || w.stats.cls === 'dmr') it.ads = true;
    if (this.inCover && this.c.crouchT > 0.5 && !this.targetVisible && !suppressing) return;
    this.burstPause -= dt;
    if (this.burstPause > 0) return;
    const mode = w.fireMode;
    if (mode === 'auto') {
      it.fire = true;
      if (w.cooldown <= 0 && w.mag > 0) this.burst++;
      const maxBurst = Math.round((dist < 12 ? 8 : dist < 30 ? 5 : 3) * this.diff.burstMul);
      if (this.burst >= maxBurst) { this.burst = 0; this.burstPause = rand(0.2, 0.5) * (dist / 20 + 0.6); }
    } else {
      it.firePressed = w.canFire();
      if (it.firePressed) this.burstPause = mode === 'bolt' ? rand(0.9, 1.6) : rand(0.18, 0.45) * (1 + dist / 40);
    }
  }

  friendlyInLine(eye, p) {
    const c = this.c;
    const dx = p.x - eye.x, dz = p.z - eye.z;
    const L = Math.hypot(dx, dz) || 1;
    for (const o of this.game.combatants) {
      if (o === c || !o.alive || o.team !== c.team) continue;
      const ox = o.pos.x - eye.x, oz = o.pos.z - eye.z;
      const along = (ox * dx + oz * dz) / L;
      if (along < 0 || along > L) continue;
      if (Math.abs(ox * dz - oz * dx) / L < 0.8) return true;
    }
    return false;
  }

  // IA simplificada para bots distantes (LOD): movimento e combate estatístico.
  abstractUpdate(dt) {
    const c = this.c, game = this.game;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 1 + Math.random();
      const goal = this.squad?.goal || this.opts.goal;
      if (goal && (!this.moveGoal || this.arrived(4))) {
        const p = game.nav.randomWalkable(Math.random, [goal.x, goal.z], goal.radius ?? 20);
        if (p) this.moveTo(p[0], p[1]);
      } else if (!this.moveGoal || this.arrived(3)) {
        const p = game.nav.randomWalkable(Math.random, [c.pos.x, c.pos.z], 40);
        if (p) this.moveTo(p[0], p[1]);
      }
    }
    this.abstractT -= dt;
    if (this.abstractT <= 0) {
      this.abstractT = 1.5;
      for (const e of game.combatants) {
        if (!this.isEnemy(e) || e.isPlayer || e.human) continue;
        const d = e.pos.distanceTo(c.pos);
        if (d > 30) continue;
        const w = c.weapon;
        if (w.isMelee && d > 2) continue;
        const hitChance = clamp(1 - d / 40, 0.1, 0.6) * 0.6;
        if (Math.random() < hitChance) {
          e.takeDamage(w.stats.damage * rand(0.5, 1.5), { attacker: c, region: Math.random() < 0.12 ? 'head' : 'chest', weapon: w.id, abstract: true, dist: d });
          if (game.audio.far(c.pos) < 260) game.audio.shot(w.stats.sound, c.pos, w.stats.suppressed);
        }
        c.yaw = Math.atan2(-(e.pos.x - c.pos.x), -(e.pos.z - c.pos.z));
        break;
      }
    }
    // movimento ao longo do caminho (sem colisão fina)
    this.followPath(dt);
  }
}
