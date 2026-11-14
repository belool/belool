import * as THREE from 'three';
import { WEAPONS, WEAPON_CLASSES, ATTACHMENTS, AMMO_TYPES, CAMOS, EQUIPMENT, computeStats } from '../combat/weapons.js';
import { MAPS, MAP_LIST } from '../world/maps.js';
import { WEATHER_TYPES } from '../world/Weather.js';
import { MISSIONS, CHARACTERS } from '../modes/campaignData.js';
import { DIFFICULTY } from '../ai/AIBrain.js';
import { levelFromXp, xpForLevel, rankOf, RANKS, ACHIEVEMENTS, MAX_LEVEL } from '../progression/Progression.js';
import { DEFAULT_SETTINGS, Save, defaultProfile } from '../core/Save.js';
import { SoldierModel } from '../entities/SoldierModel.js';
import { esc, fmtTime } from './HUD.js';

// ================================================================
// MENUS — menu principal, campanha (briefing), multijogador, BR,
// sobrevivência, arsenal (inventário/acessórios/camuflagens),
// operador (personalização com prévia 3D), progressão, configurações,
// pausa, resultados e escolhas de campanha.
// ================================================================

const $ = (id) => document.getElementById(id);

export class Menus {
  constructor(game, hud) {
    this.game = game; this.hud = hud;
    this.el = $('menu');
    this.screen = 'home';
    this.mp = { mode: 'tdm', teamSize: 5, map: 'refinery', time: 14, weather: 'clear', difficulty: game.settings.difficulty };
    this.br = { players: 60, time: 15, weather: 'clear', difficulty: 'normal' };
    this.sv = { map: 'district', time: 20, weather: 'fog' };
    this.arsenalSlot = 'primary';
    this.progTab = 'resumo';
    this.setTab = 'graficos';
    game.events.on('pause', () => this.showPause());
    game.events.on('resume', () => this.hide());
    game.events.on('matchEnd', (r) => this.showResults(r));
    game.events.on('choice', (c) => this.showChoice(c));
    game.events.on('menu', () => this.showHome());
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && game.state === 'paused' && !this.el.classList.contains('hidden')) { /* fica no pause */ }
    });
  }
  hide() { this.el.classList.add('hidden'); this.stopPreview(); }
  open(overlay = false) { this.el.classList.remove('hidden'); this.el.classList.toggle('overlay', overlay); }

  // ------------------------------------------------------------ casca
  showHome(screen = this.screen) {
    this.screen = screen;
    this.hud.show(false);
    this.open(false);
    const g = this.game, prof = g.profile;
    const lv = levelFromXp(prof.xp), rank = rankOf(prof.rankPoints);
    const a = xpForLevel(lv), b = xpForLevel(lv + 1);
    const items = [
      ['campaign', 'Campanha', 'História · 4 operações'],
      ['multiplayer', 'Multijogador', '5v5 · 10v10 · Dominação · Captura'],
      ['br', 'Battle Royale', 'Até 100 combatentes'],
      ['survival', 'Sobrevivência', 'Ondas infinitas'],
      ['arsenal', 'Arsenal', 'Armas · acessórios · camuflagens'],
      ['operator', 'Operador', 'Personalização'],
      ['progress', 'Progressão', 'Nível · desafios · ranking'],
      ['settings', 'Configurações', 'Gráficos · áudio · controles'],
    ];
    this.el.innerHTML = `
      <div class="side">
        <div class="logo">OPERATION<span>ZERO</span></div>
        <div class="tag">Combate tático em primeira pessoa</div>
        ${items.map(([id, t, s]) => `<button class="mbtn" data-go="${id}" style="${this.screen === id ? 'border-left-color:var(--accent)' : ''}">${t}<small>${s}</small></button>`).join('')}
        <div class="profile-chip">
          <div><b>${esc(prof.operator.callsign)}</b> <span style="color:${rank.color};float:right">${rank.name} · ${prof.rankPoints}</span></div>
          <div class="lv">Nível ${lv}${lv >= MAX_LEVEL ? ' (máx.)' : ''} · ${prof.xp - a} / ${b - a} XP</div>
          <div class="xpbar"><div style="width:${lv >= MAX_LEVEL ? 100 : ((prof.xp - a) / (b - a)) * 100}%"></div></div>
        </div>
      </div>
      <div class="content" id="mcontent"></div>`;
    this.el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { g.audio.init(); g.audio.play('ui'); this.showHome(b.dataset.go); });
    this.stopPreview();
    const c = $('mcontent');
    const fn = { home: this.renderWelcome, campaign: this.renderCampaign, multiplayer: this.renderMP, br: this.renderBR, survival: this.renderSurvival, arsenal: this.renderArsenal, operator: this.renderOperator, progress: this.renderProgress, settings: this.renderSettings }[screen] || this.renderWelcome;
    fn.call(this, c);
  }

  renderWelcome(c) {
    const camp = this.game.profile.campaign;
    c.innerHTML = `<h2>Bem-vindo, operador</h2>
      <div class="sub">A guerra contra a Legião de Krane decide o destino da região. Escolha sua frente de batalha.</div>
      <div class="grid">
        <div class="card" data-go="campaign"><span class="badge">HISTÓRIA</span><h3>${camp.checkpoint ? 'Continuar campanha' : 'Campanha'}</h3><p>${camp.checkpoint ? `Checkpoint salvo: ${esc(MISSIONS[camp.checkpoint.mission]?.name)}` : 'Quatro operações cinematográficas, aliados com personalidade e escolhas que mudam a história.'}</p></div>
        <div class="card" data-go="multiplayer"><span class="badge">EQUIPES</span><h3>Multijogador</h3><p>Mata-mata 5v5 e 10v10, dominação de território e captura de objetivos contra bots táticos.</p></div>
        <div class="card" data-go="br"><span class="badge">100</span><h3>Battle Royale</h3><p>Salte de paraquedas, saqueie, dirija e sobreviva à zona que encolhe.</p></div>
        <div class="card" data-go="survival"><span class="badge">ONDAS</span><h3>Sobrevivência</h3><p>Ondas crescentes, chefes blindados, loja de melhorias e placar de recordes.</p></div>
      </div>
      <h2 style="margin-top:32px;font-size:18px">Controles rápidos</h2>
      ${controlsHtml()}`;
    c.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => this.showHome(b.dataset.go));
  }

  // ------------------------------------------------------------ campanha
  renderCampaign(c) {
    const g = this.game, camp = g.profile.campaign;
    const path = camp.choices.path;
    const order = ['m1', 'm2', path === 'convoy' ? 'm3b' : path === 'rescue' ? 'm3a' : 'm3a', 'm4'];
    const cards = order.map((id) => {
      const m = MISSIONS[id];
      const unlocked = m.num <= camp.unlocked && (m.num !== 3 || path);
      const done = camp.completed[id];
      const branch = m.num === 3 && !path ? 'Definida pela sua escolha na Missão 2' : m.summary;
      return `<div class="card ${unlocked ? '' : 'locked'}" data-m="${unlocked ? id : ''}"><span class="badge">${done ? '✓ CONCLUÍDA' : `MISSÃO ${m.num}`}</span><h3>${esc(m.num === 3 && !path ? 'Missão 3 — ???' : m.name)}</h3><p>${esc(branch)}</p><p style="margin-top:8px;font-size:12px">${esc(MAPS[m.map].name)} · ${WEATHER_TYPES[m.weather].name} · ${String(Math.floor(m.time)).padStart(2, '0')}h</p></div>`;
    }).join('');
    const cp = camp.checkpoint;
    c.innerHTML = `<h2>Campanha — Operação Zero</h2>
      <div class="sub">Rook e Faísca seguem você em cada operação. Suas decisões ramificam a missão 3 e mudam o ataque final.</div>
      <div class="row">
        <div class="field"><label>Dificuldade</label><select id="cdiff">${Object.entries(DIFFICULTY).map(([k, d]) => `<option value="${k}" ${k === g.settings.difficulty ? 'selected' : ''}>${d.name}</option>`).join('')}</select></div>
        ${cp && MISSIONS[cp.mission] ? `<button class="btn" id="contBtn">Continuar: ${esc(MISSIONS[cp.mission].name)} (objetivo ${cp.obj + 1})</button>` : ''}
        <button class="btn ghost" id="resetCamp">Reiniciar campanha</button>
      </div>
      <div class="grid" style="margin-top:12px">${cards}</div>
      <h2 style="margin-top:30px;font-size:18px">Personagens</h2>
      <div class="chars">${['vega', 'rook', 'faisca', 'krane'].map((k) => `<div class="char"><b>${esc(CHARACTERS[k].name)}</b><p>${esc(CHARACTERS[k].bio)}</p></div>`).join('')}</div>
      ${path ? `<div class="sub">Sua escolha: <b style="color:var(--accent)">${path === 'rescue' ? 'Resgatar a Equipe Sombra' : 'Interceptar o comboio'}</b></div>` : ''}`;
    $('cdiff').onchange = (e) => { g.settings.difficulty = e.target.value; g.saveAll(); };
    c.querySelectorAll('[data-m]').forEach((el) => el.onclick = () => el.dataset.m && this.showBriefing(el.dataset.m, 0));
    if ($('contBtn')) $('contBtn').onclick = () => this.showBriefing(cp.mission, cp.obj);
    $('resetCamp').onclick = () => { if (confirm('Apagar o progresso da campanha e as escolhas?')) { g.profile.campaign = defaultProfile().campaign; g.saveAll(); this.showHome('campaign'); } };
  }

  showBriefing(id, checkpoint) {
    const m = MISSIONS[id], g = this.game;
    const c = $('mcontent');
    c.innerHTML = `<div class="briefing"><h2>Missão ${m.num} — ${esc(m.name)}</h2>
      <div class="sub">${esc(MAPS[m.map].name)} · ${WEATHER_TYPES[m.weather].name} · ${String(Math.floor(m.time)).padStart(2, '0')}h${checkpoint ? ` · retomando do objetivo ${checkpoint + 1}` : ''}</div>
      ${m.briefing.map(([who, text], i) => `<div class="brief-line" style="animation-delay:${i * 0.25}s"><div class="who">${esc(CHARACTERS[who].short)}</div><div>${esc(text)}</div></div>`).join('')}
      <div class="sub" style="margin-top:18px">Objetivos: ${m.objectives.map((o) => esc(o.text)).join(' → ')}</div>
      <div class="row" style="margin-top:18px"><button class="btn" id="goMission">Iniciar missão</button><button class="btn ghost" id="backCamp">Voltar</button></div></div>`;
    $('backCamp').onclick = () => this.showHome('campaign');
    $('goMission').onclick = () => this.launch({ mode: 'campaign', mission: id, checkpoint, map: m.map, time: m.time, weather: m.weather, timeSpeed: 0, difficulty: g.settings.difficulty });
    if (g.settings.voiceTTS) { g.audio.init(); g.audio.stopVoices(); m.briefing.slice(0, 2).forEach(([who, t]) => g.audio.say(t, CHARACTERS[who].voice)); }
  }

  // ------------------------------------------------------------ partidas
  matchOptions(o, opts = {}) {
    return `<div class="row">
      ${opts.map !== false ? `<div class="field"><label>Mapa</label><select data-o="map">${MAP_LIST.map((k) => `<option value="${k}" ${o.map === k ? 'selected' : ''}>${MAPS[k].name}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Horário: <span id="tlab">${String(Math.floor(o.time)).padStart(2, '0')}h</span></label><input type="range" min="0" max="23.5" step="0.5" value="${o.time}" data-o="time"></div>
      <div class="field"><label>Clima</label><select data-o="weather">${Object.entries(WEATHER_TYPES).map(([k, w]) => `<option value="${k}" ${o.weather === k ? 'selected' : ''}>${w.name}</option>`).join('')}</select></div>
      <div class="field"><label>Dificuldade da IA</label><select data-o="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<option value="${k}" ${o.difficulty === k ? 'selected' : ''}>${d.name}</option>`).join('')}</select></div>
    </div>${opts.map !== false ? `<div class="sub" id="mapdesc">${esc(MAPS[o.map]?.desc || '')}</div>` : ''}`;
  }
  bindOptions(c, o) {
    c.querySelectorAll('[data-o]').forEach((el) => {
      el.oninput = el.onchange = () => {
        const k = el.dataset.o;
        o[k] = el.type === 'range' ? Number(el.value) : el.value;
        if (k === 'time') c.querySelector('#tlab').textContent = String(Math.floor(o.time)).padStart(2, '0') + 'h';
        if (k === 'players') c.querySelector('#plab').textContent = o.players;
        if (k === 'map' && c.querySelector('#mapdesc')) c.querySelector('#mapdesc').textContent = MAPS[o.map].desc;
      };
    });
  }

  renderMP(c) {
    const o = this.mp;
    const modes = [
      ['tdm5', 'Mata-mata 5x5', 'Equipes de 5. Primeira a 50 abates vence.', { mode: 'tdm', teamSize: 5 }],
      ['tdm10', 'Mata-mata 10x10', 'Combate em larga escala, 20 combatentes.', { mode: 'tdm', teamSize: 10 }],
      ['dom', 'Dominação', 'Capture e mantenha A, B e C. 6x6.', { mode: 'domination', teamSize: 6 }],
      ['cap', 'Captura de objetivos', 'Roube a maleta inimiga e leve até sua base. 5x5.', { mode: 'capture', teamSize: 5 }],
    ];
    const selKey = o.mode === 'tdm' ? `tdm${o.teamSize}` : o.mode === 'domination' ? 'dom' : 'cap';
    c.innerHTML = `<h2>Multijogador</h2>
      <div class="sub">Partidas ranqueadas contra bots com IA tática. A simulação usa o mesmo modelo de "intenções" de um servidor autoritativo — pronta para receber uma camada de rede.</div>
      <div class="grid">${modes.map(([k, t, d]) => `<div class="card ${k === selKey ? 'sel' : ''}" data-mode="${k}"><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
      <div style="margin-top:18px">${this.matchOptions(o)}</div>
      <div class="row" style="margin-top:14px"><button class="btn" id="mpGo">Entrar na partida</button></div>`;
    c.querySelectorAll('[data-mode]').forEach((el) => el.onclick = () => { Object.assign(o, modes.find((m) => m[0] === el.dataset.mode)[3]); this.renderMP(c); });
    this.bindOptions(c, o);
    $('mpGo').onclick = () => this.launch({ ...o });
  }
  renderBR(c) {
    const o = this.br, prof = this.game.profile;
    c.innerHTML = `<h2>Battle Royale — Ilha Zero</h2>
      <div class="sub">Mapa de 640 × 640 m com vilas, zona industrial, florestas e túneis. Salte, saqueie armas, coletes, kits e granadas, use jipes e seja o último de pé. Bots distantes usam IA simplificada (LOD) para manter o desempenho.</div>
      <div class="row"><div class="field"><label>Participantes: <span id="plab">${o.players}</span></label><input type="range" min="20" max="100" step="5" value="${o.players}" data-o="players"></div></div>
      ${this.matchOptions(o, { map: false })}
      <div class="row" style="margin-top:14px"><button class="btn" id="brGo">Saltar</button></div>
      <h2 style="margin-top:26px;font-size:18px">Melhores colocações</h2>${board(prof.leaderboards.br, (r) => `#${r.place} de ${r.of} · ${r.kills} abates`)}`;
    this.bindOptions(c, o);
    $('brGo').onclick = () => this.launch({ mode: 'br', map: 'island', ...o, seed: Math.floor(Math.random() * 1e6) });
  }
  renderSurvival(c) {
    const o = this.sv, prof = this.game.profile;
    c.innerHTML = `<h2>Sobrevivência</h2>
      <div class="sub">Ondas cada vez maiores e mais letais. A cada 5 ondas, um comandante blindado. Entre as ondas, abra a loja com <kbd>I</kbd> para comprar munição, coletes, armas, melhorias e aliados.</div>
      ${this.matchOptions(o)}
      <div class="row" style="margin-top:14px"><button class="btn" id="svGo">Começar</button></div>
      <h2 style="margin-top:26px;font-size:18px">Recordes</h2>${board(prof.leaderboards.survival, (r) => `Onda ${r.wave} · ${r.score} pts · ${esc(r.map)}`)}`;
    this.bindOptions(c, o);
    $('svGo').onclick = () => this.launch({ mode: 'survival', ...o, difficulty: 'normal' });
  }

  launch(cfg) {
    const g = this.game;
    g.audio.init(); g.audio.play('ui');
    $('loading').classList.remove('hidden');
    $('loadingSub').textContent = `${MAPS[cfg.map]?.name || ''}`;
    this.lastCfg = cfg;
    setTimeout(() => {
      try {
        g.startMatch(cfg);
        this.hide();
        this.hud.show(true);
      } catch (e) {
        console.error(e);
        alert('Erro ao iniciar a partida: ' + e.message);
        g.quitToMenu();
      }
      $('loading').classList.add('hidden');
    }, 60);
  }

  // ------------------------------------------------------------ arsenal
  renderArsenal(c) {
    const g = this.game, prog = g.progression, L = g.profile.loadout;
    const slot = this.arsenalSlot;
    const tabs = `<div class="tabs">${[['primary', 'Primária'], ['secondary', 'Secundária'], ['equipment', 'Equipamentos']].map(([k, t]) => `<button class="tab ${slot === k ? 'on' : ''}" data-slot="${k}">${t}</button>`).join('')}</div>`;
    let body = '';
    if (slot === 'equipment') {
      const eq = L.equipment;
      body = `<div class="sub">Escolha até 4 granadas no total.</div><div class="list">${Object.entries(EQUIPMENT).map(([k, e]) => {
        const un = prog.isUnlocked('equipment', k);
        return `<div class="li"><div><b>${e.name}</b><div class="d">${un ? descEquip(k) : `Desbloqueia no nível ${e.unlock}`}</div></div><div class="row"><button class="btn ghost" data-eq="${k}" data-d="-1" ${un ? '' : 'disabled'}>−</button><b style="min-width:20px;text-align:center">${eq[k] || 0}</b><button class="btn ghost" data-eq="${k}" data-d="1" ${un ? '' : 'disabled'}>+</button></div></div>`;
      }).join('')}</div>`;
    } else {
      const cur = L[slot];
      const list = Object.values(WEAPONS).filter((w) => w.id !== 'knife' && (slot === 'secondary' ? w.slot === 'secondary' || w.cls === 'smg' : w.slot === 'primary'));
      const st = computeStats(cur.id, cur.att, cur.ammo);
      const bar = (lab, v) => `<div>${lab}</div><div class="b"><div style="width:${Math.max(3, Math.min(100, v))}%"></div></div>`;
      const att = cur.att || {};
      const selects = Object.entries(ATTACHMENTS).map(([cat, opts]) => {
        if (st.cls === 'pistol' && cat !== 'muzzle' && cat !== 'mag') return '';
        const label = { optic: 'Mira', muzzle: 'Cano', grip: 'Empunhadura', mag: 'Carregador' }[cat];
        const curV = att[cat] || (cat === 'optic' ? WEAPONS[cur.id].defaultOptic || 'none' : cat === 'mag' ? 'standard' : 'none');
        return `<div class="field"><label>${label}</label><select data-att="${cat}">${Object.entries(opts).map(([k, a]) => `<option value="${k}" ${curV === k ? 'selected' : ''} ${prog.isUnlocked(cat, k) ? '' : 'disabled'}>${a.name}${prog.isUnlocked(cat, k) ? '' : ` (nível ${a.unlock})`}</option>`).join('')}</select></div>`;
      }).join('');
      const ws = g.profile.weaponStats[cur.id] || { kills: 0, headshots: 0 };
      body = `<div class="grid">${list.map((w) => {
        const un = prog.isUnlocked('weapon', w.id);
        return `<div class="card ${cur.id === w.id ? 'sel' : ''} ${un ? '' : 'locked'}" data-w="${un ? w.id : ''}"><span class="badge">${WEAPON_CLASSES[w.cls]}</span><h3>${w.name}</h3><p>${un ? `${w.damage} dano · ${w.rpm} dpm · ${w.mag} cartuchos` : `Desbloqueia no nível ${w.unlock}`}</p></div>`;
      }).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px">
        <div><h3 style="margin:0">${st.name}</h3>
          <div class="wstats">${bar('Dano', st.damage / 1.2)}${bar('Cadência', st.rpm / 10)}${bar('Alcance', st.range / 1.5)}${bar('Precisão', 100 - st.spread.ads * 60 - st.spread.hip * 5)}${bar('Controle', 100 - st.recoil.vert * 12)}${bar('Mobilidade', st.moveMul * 100 - 20)}${bar('Penetração', st.pen * 1.6)}${bar('Mira (ADS)', 100 - st.adsTime * 180)}</div>
          <div class="sub" style="margin-top:8px">Carregador ${st.mag} · Recarga ${st.reload.toFixed(1)}s · Velocidade ${Math.round(st.velocity)} m/s · Zoom ${st.adsZoom.toFixed(1)}x${st.suppressed ? ' · Suprimida' : ''}</div>
          <div class="sub">${ws.kills} abates · ${ws.headshots} na cabeça</div>
        </div>
        <div>
          <div class="row">${selects}</div>
          <div class="row"><div class="field"><label>Munição</label><select data-ammo>${Object.entries(AMMO_TYPES).map(([k, a]) => `<option value="${k}" ${cur.ammo === k ? 'selected' : ''} ${prog.isUnlocked('ammo', k) ? '' : 'disabled'}>${a.name}${prog.isUnlocked('ammo', k) ? '' : ` (nível ${a.unlock})`}</option>`).join('')}</select></div></div>
          <label style="font-size:11px;color:var(--dim);letter-spacing:.12em">CAMUFLAGEM</label>
          <div class="swatches" style="margin-top:6px">${CAMOS.map((cm) => {
            const un = prog.camoUnlocked(cur.id, cm.id);
            const req = cm.req ? (cm.req.kills ? `${cm.req.kills} abates` : `${cm.req.headshots} tiros na cabeça`) : '';
            return `<div class="sw ${cur.camo === cm.id ? 'sel' : ''} ${un ? '' : 'locked'}" title="${cm.name}${un ? '' : ' — ' + req}" data-camo="${un ? cm.id : ''}" style="background:${cm.color ? '#' + cm.color.toString(16).padStart(6, '0') : 'repeating-linear-gradient(45deg,#333,#333 4px,#222 4px,#222 8px)'}"></div>`;
          }).join('')}</div>
        </div>
      </div>`;
    }
    c.innerHTML = `<h2>Arsenal</h2><div class="sub">Equipe armas, acessórios, munição e camuflagens. Itens são desbloqueados com nível e desempenho.</div>${tabs}${body}`;
    c.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => { this.arsenalSlot = b.dataset.slot; this.renderArsenal(c); });
    c.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { if (!b.dataset.w) return; L[slot] = { id: b.dataset.w, att: { optic: WEAPONS[b.dataset.w].defaultOptic || 'none' }, ammo: 'fmj', camo: 'none' }; g.saveAll(); this.renderArsenal(c); });
    c.querySelectorAll('[data-att]').forEach((s) => s.onchange = () => { L[slot].att = { ...(L[slot].att || {}), [s.dataset.att]: s.value }; g.saveAll(); this.renderArsenal(c); });
    c.querySelectorAll('[data-ammo]').forEach((s) => s.onchange = () => { L[slot].ammo = s.value; g.saveAll(); this.renderArsenal(c); });
    c.querySelectorAll('[data-camo]').forEach((s) => s.onclick = () => { if (!s.dataset.camo) return; L[slot].camo = s.dataset.camo; g.saveAll(); this.renderArsenal(c); });
    c.querySelectorAll('[data-eq]').forEach((b) => b.onclick = () => {
      const eq = L.equipment, k = b.dataset.eq, d = Number(b.dataset.d);
      const total = Object.values(eq).reduce((a, x) => a + x, 0);
      if (d > 0 && total >= 4) return;
      eq[k] = Math.max(0, (eq[k] || 0) + d); g.saveAll(); this.renderArsenal(c);
    });
  }

  // ------------------------------------------------------------ operador
  renderOperator(c) {
    const g = this.game, op = g.profile.operator;
    const palettes = {
      uniform: [0x4b5a3a, 0x5a4636, 0x3a3a46, 0x6b6b5a, 0x2a2f3a, 0x7a6a4a, 0x1d1d1d, 0x5a6a7a],
      vest: [0x3a4430, 0x2e2a26, 0x2a2a30, 0x4a4a3a, 0x1a1a1a, 0x5a4a30, 0x3a4a5a],
      helmet: [0x3f4a33, 0x3a332c, 0x30303a, 0x5a5a4a, 0x111111, 0x6a5a3a, 0x8a8a8a],
      visor: [0x55aaff, 0xff4433, 0xffcc33, 0x44ff88, 0xff44ff, 0xffffff],
    };
    c.innerHTML = `<h2>Operador</h2><div class="sub">Personalize seu indicativo e as cores do uniforme. Seus aliados de esquadrão usam o mesmo padrão.</div>
      <div style="display:flex;gap:28px;flex-wrap:wrap">
        <canvas id="opPreview" width="300" height="400" style="background:radial-gradient(#26313a,#0b0e12);border:1px solid var(--line)"></canvas>
        <div style="flex:1;min-width:280px">
          <div class="field"><label>Indicativo</label><input type="text" id="callsign" maxlength="16" value="${esc(op.callsign)}"></div>
          ${Object.entries(palettes).map(([k, cols]) => `<div style="margin-top:14px"><label style="font-size:11px;color:var(--dim);letter-spacing:.12em">${{ uniform: 'UNIFORME', vest: 'COLETE', helmet: 'CAPACETE', visor: 'VISOR' }[k]}</label><div class="swatches" style="margin-top:6px">${cols.map((col) => `<div class="sw ${op.colors[k] === col ? 'sel' : ''}" data-k="${k}" data-c="${col}" style="background:#${col.toString(16).padStart(6, '0')}"></div>`).join('')}</div></div>`).join('')}
        </div>
      </div>`;
    $('callsign').oninput = (e) => { op.callsign = e.target.value.trim().slice(0, 16) || 'Operador'; g.saveAll(); };
    c.querySelectorAll('[data-k]').forEach((s) => s.onclick = () => { op.colors[s.dataset.k] = Number(s.dataset.c); g.saveAll(); this.renderOperator(c); });
    this.startPreview($('opPreview'), op.colors);
  }
  startPreview(canvas, colors) {
    this.stopPreview();
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 300 / 400, 0.1, 50);
    cam.position.set(0, 1.2, 4.2); cam.lookAt(0, 0.95, 0);
    scene.add(new THREE.HemisphereLight(0xdde6ff, 0x332211, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(2, 3, 2); scene.add(d);
    const m = new SoldierModel(0, { colors });
    scene.add(m.group);
    let t = 0, alive = true;
    const loop = () => {
      if (!alive) return;
      t += 0.016;
      m.group.rotation.y = t * 0.6;
      m.animate(0.016, 0, 0, 0, false, true);
      r.render(scene, cam);
      requestAnimationFrame(loop);
    };
    loop();
    this.preview = () => { alive = false; r.dispose(); };
  }
  stopPreview() { if (this.preview) { this.preview(); this.preview = null; } }

  // ------------------------------------------------------------ progressão
  renderProgress(c) {
    const g = this.game, prof = g.profile, st = prof.stats;
    const tabs = [['resumo', 'Resumo'], ['desafios', 'Desafios'], ['conquistas', 'Conquistas'], ['ranking', 'Ranking'], ['armas', 'Armas']];
    let body = '';
    const lv = levelFromXp(prof.xp);
    if (this.progTab === 'resumo') {
      const acc = st.shots ? ((st.hits / st.shots) * 100).toFixed(1) : '0';
      body = `<div class="statgrid">
        ${[['Nível', lv], ['XP total', prof.xp], ['Abates', st.kills], ['Mortes', st.deaths], ['A/M', (st.kills / Math.max(1, st.deaths)).toFixed(2)], ['Tiros na cabeça', st.headshots], ['Precisão', acc + '%'], ['Partidas', st.matches], ['Vitórias', st.wins], ['Vitórias BR', st.brWins], ['Melhor onda', st.bestWave], ['Tempo de jogo', fmtTime(st.playTime)]].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}
      </div>
      <h3 style="margin-top:22px">Próximos desbloqueios</h3><div class="list">${upcoming(lv).map((u) => `<div class="li"><div>${esc(u.name)}</div><div class="d">Nível ${u.level}</div></div>`).join('') || '<div class="d">Tudo desbloqueado!</div>'}</div>`;
    } else if (this.progTab === 'desafios') {
      body = `<div class="sub">Desafios diários — renovam a cada dia.</div><div class="list">${(prof.challenges?.list || []).map((ch) => `<div class="li ${ch.done ? 'done' : ''}"><div><b>${esc(ch.text)}</b><div class="prog"><div style="width:${Math.min(100, (ch.progress / ch.n) * 100)}%"></div></div></div><div class="d">${ch.done ? '✓ Concluído' : `${ch.progress}/${ch.n}`} · ${ch.xp} XP</div></div>`).join('')}</div>`;
    } else if (this.progTab === 'conquistas') {
      body = `<div class="grid">${ACHIEVEMENTS.map((a) => `<div class="card ${prof.achievements[a.id] ? 'sel' : 'locked'}" style="cursor:default"><span class="badge">${prof.achievements[a.id] ? '✓' : '🔒'}</span><h3>${a.name}</h3><p>${a.desc}</p></div>`).join('')}</div>`;
    } else if (this.progTab === 'ranking') {
      const r = rankOf(prof.rankPoints);
      body = `<div class="stat" style="max-width:360px"><b style="color:${r.color}">${r.name}</b><span>${prof.rankPoints} pontos de ranking</span></div>
        <div class="sub" style="margin-top:12px">Partidas multijogador (mata-mata, dominação, captura) são ranqueadas: vitórias e desempenho individual (A/M e pontuação) alteram seus pontos.</div>
        <div class="list">${RANKS.map((k) => `<div class="li" style="${k === r ? 'border-color:' + k.color : ''}"><b style="color:${k.color}">${k.name}</b><span class="d">${k.min}+</span></div>`).join('')}</div>`;
    } else {
      body = `<div class="list">${Object.values(WEAPONS).filter((w) => w.id !== 'knife').map((w) => {
        const ws = prof.weaponStats[w.id] || { kills: 0, headshots: 0 };
        const camos = CAMOS.filter((cm) => g.progression.camoUnlocked(w.id, cm.id)).length;
        return `<div class="li"><div><b>${w.name}</b><div class="d">${WEAPON_CLASSES[w.cls]}</div></div><div class="d">${ws.kills} abates · ${ws.headshots} HS · ${camos}/${CAMOS.length} camuflagens</div></div>`;
      }).join('')}</div>`;
    }
    c.innerHTML = `<h2>Progressão</h2><div class="sub">Ganhe XP em todos os modos para subir de nível e desbloquear armas, acessórios e munições.</div>
      <div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${this.progTab === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</div>${body}`;
    c.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { this.progTab = b.dataset.t; this.renderProgress(c); });
  }

  // ------------------------------------------------------------ configurações
  renderSettings(c, inPause = false) {
    const g = this.game, s = g.settings;
    const tabs = [['graficos', 'Gráficos'], ['audio', 'Áudio'], ['controles', 'Controles'], ['jogo', 'Jogo']];
    const rng = (k, min, max, step, lab, fmt = (v) => v) => `<div class="li"><div>${lab}</div><div class="row"><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-s="${k}"><span style="min-width:44px" id="v_${k}">${fmt(s[k])}</span></div></div>`;
    const chk = (k, lab) => `<div class="li"><div>${lab}</div><input type="checkbox" data-s="${k}" ${s[k] ? 'checked' : ''}></div>`;
    const sel = (k, lab, opts) => `<div class="li"><div>${lab}</div><select data-s="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    let body = '';
    if (this.setTab === 'graficos') body = [
      sel('quality', 'Qualidade geral', [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['ultra', 'Ultra']]),
      rng('renderScale', 0.5, 1.5, 0.05, 'Escala de renderização', (v) => Math.round(v * 100) + '%'),
      chk('shadows', 'Sombras dinâmicas'),
      sel('shadowRes', 'Resolução das sombras', [[1024, '1024'], [2048, '2048'], [4096, '4096']]),
      rng('viewDistance', 0.3, 1, 0.05, 'Distância de visão', (v) => Math.round(v * 100) + '%'),
      rng('particles', 0.25, 1.5, 0.05, 'Densidade de partículas', (v) => Math.round(v * 100) + '%'),
      rng('fov', 60, 110, 1, 'Campo de visão (FOV)', (v) => v + '°'),
      rng('fogMul', 0.3, 1.5, 0.05, 'Intensidade da neblina', (v) => Math.round(v * 100) + '%'),
      chk('showFps', 'Mostrar FPS e métricas'),
      chk('crosshair', 'Mostrar mira'),
    ].join('');
    else if (this.setTab === 'audio') body = [
      rng('master', 0, 1, 0.05, 'Volume geral', pct), rng('sfx', 0, 1, 0.05, 'Efeitos', pct), rng('ambient', 0, 1, 0.05, 'Ambiente (chuva/vento)', pct), rng('voice', 0, 1, 0.05, 'Vozes', pct), chk('voiceTTS', 'Vozes sintetizadas nos diálogos (TTS)'),
    ].join('');
    else if (this.setTab === 'controles') body = [
      rng('sensitivity', 0.2, 3, 0.05, 'Sensibilidade do mouse', (v) => Number(v).toFixed(2)), rng('adsSensitivity', 0.2, 1.5, 0.05, 'Sensibilidade mirando', (v) => Number(v).toFixed(2)), chk('invertY', 'Inverter eixo Y'),
    ].join('') + `<div style="margin-top:16px">${controlsHtml()}</div>`;
    else body = [
      sel('difficulty', 'Dificuldade padrão', Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name])),
      rng('timeSpeed', 0, 10, 0.5, 'Velocidade do ciclo dia/noite (horas por minuto)', (v) => (Number(v) === 0 ? 'parado' : v + 'h/min')),
    ].join('') + `<div class="row" style="margin-top:20px"><button class="btn ghost" id="resetSave">Apagar todo o progresso</button><button class="btn ghost" id="resetSettings">Restaurar configurações</button></div>`;
    c.innerHTML = `<h2>Configurações</h2><div class="tabs">${tabs.map(([k, t]) => `<button class="tab ${this.setTab === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</div><div class="list">${body}</div>${inPause ? '<div class="row" style="margin-top:16px"><button class="btn" id="backPause">Voltar</button></div>' : ''}`;
    c.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { this.setTab = b.dataset.t; this.renderSettings(c, inPause); });
    c.querySelectorAll('[data-s]').forEach((el) => {
      el.oninput = el.onchange = () => {
        const k = el.dataset.s;
        let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        if (k === 'shadowRes') v = Number(v);
        s[k] = v;
        const lab = c.querySelector('#v_' + k);
        if (lab) lab.textContent = el.closest('.li').querySelector('span').textContent = formatSetting(k, v);
        if (k === 'timeSpeed' && g.weather) g.weather.timeSpeed = v / 60;
        g.applySettings(); g.resize(); g.saveAll();
      };
    });
    if ($('resetSave')) $('resetSave').onclick = () => { if (confirm('Apagar TODO o progresso (nível, desbloqueios, campanha)?')) { Save.reset(); location.reload(); } };
    if ($('resetSettings')) $('resetSettings').onclick = () => { Object.assign(s, DEFAULT_SETTINGS); g.applySettings(); g.saveAll(); this.renderSettings(c, inPause); };
    if ($('backPause')) $('backPause').onclick = () => this.showPause();
  }

  // ------------------------------------------------------------ pausa / resultados / escolha
  showPause() {
    this.open(true);
    const g = this.game;
    this.el.innerHTML = `<div class="side"><div class="logo">PAUSA</div><div class="tag">${esc(g.mode?.title || '')}</div>
      <button class="mbtn" id="pResume">Continuar</button>
      <button class="mbtn" id="pSettings">Configurações</button>
      ${g.cfg?.mode === 'campaign' ? '<button class="mbtn" id="pRestart">Reiniciar do checkpoint</button>' : '<button class="mbtn" id="pRestart">Reiniciar partida</button>'}
      <button class="mbtn" id="pQuit">Sair para o menu</button></div>
      <div class="content" id="mcontent"><h2>Controles</h2>${controlsHtml()}</div>`;
    $('pResume').onclick = () => { this.hide(); g.resume(); };
    $('pSettings').onclick = () => this.renderSettings($('mcontent'), true);
    $('pRestart').onclick = () => {
      const cfg = { ...g.cfg };
      if (cfg.mode === 'campaign') { const cp = g.profile.campaign.checkpoint; cfg.checkpoint = cp?.mission === cfg.mission ? cp.obj : 0; }
      this.launch(cfg);
    };
    $('pQuit').onclick = () => { g.quitToMenu(); };
  }

  showResults(r) {
    const g = this.game, p = g.player;
    this.hud.show(false);
    this.open(true);
    const st = p?.stats || { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, score: 0 };
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    const camp = r.campaign;
    const btns = [];
    if (camp?.retry) btns.push(['retry', 'Tentar novamente do checkpoint']);
    if (camp?.next) btns.push(['next', `Próxima missão: ${MISSIONS[camp.next].name}`]);
    if (!camp) btns.push(['again', 'Jogar novamente']);
    btns.push(['menu', 'Menu principal']);
    this.el.innerHTML = `<div class="content" style="max-width:900px;margin:0 auto">
      <div class="results-head ${r.won ? 'win' : 'lose'}">${esc(r.title)}</div>
      <div class="sub" style="white-space:pre-line;font-size:16px">${esc(r.text)}</div>
      <div class="statgrid">${[['Abates', st.kills], ['Mortes', st.deaths], ['Tiros na cabeça', st.headshots], ['Precisão', acc + '%'], ['XP ganho', '+' + (r.xp || 0)], ...(r.rankDelta !== null && r.rankDelta !== undefined ? [['Ranking', (r.rankDelta >= 0 ? '+' : '') + r.rankDelta]] : [])].map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('')}</div>
      ${r.scoreboard && r.mode !== 'campaign' ? `<div style="margin-top:18px;max-height:34vh;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">${r.scoreboard.slice(0, 20).map((x) => `<tr style="${x.me ? 'color:var(--accent);font-weight:700' : ''}"><td style="padding:3px 6px;border-left:3px solid ${x.team === 0 ? 'var(--ally)' : x.team === 1 ? 'var(--enemy)' : '#666'}">${esc(x.name)}</td><td>${x.k}/${x.d}/${x.a}</td><td>${x.s}</td></tr>`).join('')}</table></div>` : ''}
      <div class="row" style="margin-top:22px">${btns.map(([k, t], i) => `<button class="btn ${i ? 'ghost' : ''}" data-r="${k}">${esc(t)}</button>`).join('')}</div></div>`;
    this.el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => {
      const k = b.dataset.r;
      if (k === 'menu') g.quitToMenu();
      else if (k === 'again') this.launch({ ...this.lastCfg, seed: this.lastCfg.mode === 'br' ? Math.floor(Math.random() * 1e6) : this.lastCfg.seed });
      else if (k === 'retry') { const m = MISSIONS[camp.retry.mission]; this.launch({ mode: 'campaign', mission: m.id, checkpoint: camp.retry.checkpoint, map: m.map, time: m.time, weather: m.weather, timeSpeed: 0, difficulty: g.settings.difficulty }); }
      else if (k === 'next') { g.quitToMenu(); this.showHome('campaign'); this.showBriefing(camp.next, 0); }
    });
  }

  showChoice(c) {
    const modal = $('modal');
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="mbox"><h2>${esc(c.title)}</h2><div class="sub">Esta decisão é permanente e altera os acontecimentos da campanha.</div>
      <div class="opts">${c.options.map((o, i) => `<div class="card" data-i="${i}"><h3>${esc(o.label)}</h3><p>${esc(o.desc)}</p></div>`).join('')}</div></div>`;
    modal.querySelectorAll('[data-i]').forEach((el) => el.onclick = () => { modal.classList.add('hidden'); this.game.audio.play('ui'); c.pick(Number(el.dataset.i)); });
  }
}

function pct(v) { return Math.round(v * 100) + '%'; }
function formatSetting(k, v) {
  if (['master', 'sfx', 'ambient', 'voice', 'renderScale', 'viewDistance', 'particles', 'fogMul'].includes(k)) return Math.round(v * 100) + '%';
  if (k === 'fov') return v + '°';
  if (k === 'timeSpeed') return Number(v) === 0 ? 'parado' : v + 'h/min';
  return typeof v === 'number' ? v.toFixed(2) : v;
}
function descEquip(k) { return { frag: 'Explode após 3 s. Dano alto em área, destrói coberturas leves.', smoke: 'Cortina de fumaça que bloqueia a visão (inclusive da IA).', flash: 'Cega e atordoa quem estiver olhando para a explosão.' }[k]; }
function board(list, fmt) {
  if (!list?.length) return '<div class="sub">Nenhum registro ainda.</div>';
  return `<div class="list">${list.map((r, i) => `<div class="li"><div><b>#${i + 1} ${esc(r.name)}</b></div><div class="d">${fmt(r)} · ${esc(r.date)}</div></div>`).join('')}</div>`;
}
function upcoming(lv) {
  const out = [];
  for (const w of Object.values(WEAPONS)) if (w.unlock > lv) out.push({ name: w.name, level: w.unlock });
  for (const cat of Object.values(ATTACHMENTS)) for (const a of Object.values(cat)) if (a.unlock > lv) out.push({ name: a.name, level: a.unlock });
  for (const a of Object.values(AMMO_TYPES)) if (a.unlock > lv) out.push({ name: 'Munição ' + a.name, level: a.unlock });
  return out.sort((a, b) => a.level - b.level).slice(0, 6);
}
export function controlsHtml() {
  const rows = [['Mover', 'W A S D'], ['Correr', 'Shift'], ['Agachar (alternar / segurar)', 'C / Ctrl'], ['Pular', 'Espaço'], ['Atirar / Mirar', 'Mouse esq. / dir.'], ['Recarregar', 'R'], ['Trocar arma', '1 / 2 / roda'], ['Modo de disparo', 'B'], ['Granada / trocar tipo', 'G / X'], ['Faca', 'V'], ['Interagir / veículo', 'E'], ['Ordem ao esquadrão', 'Q'], ['Lanterna', 'F'], ['Placar', 'Tab'], ['Mapa', 'M'], ['Loja (Sobrevivência)', 'I'], ['Pausa', 'Esc']];
  return `<div class="controls">${rows.map(([a, k]) => `<div><span>${a}</span><span>${k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</span></div>`).join('')}</div>`;
}
