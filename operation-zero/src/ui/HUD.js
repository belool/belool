import { WEAPONS, WEAPON_CLASSES, AMMO_TYPES } from '../combat/weapons.js';
import { SHOP } from '../modes/Survival.js';
import { clamp } from '../core/util.js';

// ================================================================
// HUD — interface durante a partida: vida/armadura, munição, mira
// dinâmica, marcador de acerto, direção de dano, feed de abates,
// rádio, objetivos, placar, bússola, minimapa, mapa grande e loja.
// ================================================================

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.hitT = 0; this.flashA = 0; this.dmgDirs = [];
    this.mm = $('minimap').getContext('2d');
    this.big = $('bigmapCanvas').getContext('2d');
    this.buildCompass();
    const ev = game.events;
    ev.on('damage', (e) => this.onDamage(e));
    ev.on('kill', (e) => this.onKill(e));
    ev.on('radio', (e) => this.radio(e.from, e.text, e.story));
    ev.on('toast', (e) => this.toast(e.title, e.text, e.small));
    ev.on('xp', (e) => this.xp(e.amount, e.reason));
    ev.on('levelup', (e) => { this.toast(`NÍVEL ${e.level}`, e.unlocks.length ? 'Desbloqueado: ' + e.unlocks.join(', ') : 'Continue lutando, operador.'); game.audio.play('levelup'); });
    ev.on('frame', () => this.update());
    ev.on('matchStart', () => this.reset());
    ev.on('suppressed', () => { this.supA = Math.min(0.8, (this.supA || 0) + 0.25); });
    this.frameN = 0;
  }
  show(v) { this.el.classList.toggle('hidden', !v); }
  reset() {
    for (const id of ['killfeed', 'radio', 'toasts', 'xpPop', 'dmgdirs']) $(id).innerHTML = '';
    $('shop').classList.add('hidden'); $('bigmap').classList.add('hidden'); $('scoreboard').classList.add('hidden');
    this.dmgDirs = [];
  }

  buildCompass() {
    const strip = $('compassStrip');
    const labels = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    let html = '';
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const lab = labels[n];
      html += `<span style="left:${(d + 360) * 4}px" class="${lab ? 'c' : ''}">${lab || (n % 45 === 0 ? '' : '·')}</span>`;
    }
    strip.innerHTML = html;
  }

  onDamage(e) {
    const g = this.game, p = g.player;
    if (e.attacker === p && e.victim !== p) {
      this.hitT = 0.18;
      const hm = $('hitmarker');
      hm.classList.toggle('kill', e.victim.health <= 0);
      if (e.region === 'head') g.audio.play('headshot', null, 0.4); else g.audio.play('hit', null, 0.4);
    }
    if (e.victim === p) {
      this.flashA = Math.min(0.9, this.flashA + e.dmg / 60);
      g.audio.play('hurt', null, 0.5);
      if (e.attacker && e.attacker !== p) {
        const dx = e.attacker.pos.x - p.pos.x, dz = e.attacker.pos.z - p.pos.z;
        this.dmgDirs.push({ ang: Math.atan2(-dx, -dz), t: 1.4 });
      }
    }
  }
  onKill(e) {
    const p = this.game.player;
    const cls = (c) => !c ? '' : c === p ? 'me' : p && c.team === p.team ? 'a' : 'e';
    const wname = e.melee ? 'faca' : e.explosive ? '💥' : WEAPONS[e.weapon]?.name || (e.weapon === 'zone' ? 'zona' : e.weapon === 'vehicle' ? 'atropelado' : '☠');
    const div = document.createElement('div');
    div.className = 'kf';
    div.innerHTML = `${e.killer && e.killer !== e.victim ? `<span class="${cls(e.killer)}">${esc(e.killer.name)}</span>` : ''}<span class="w">[${esc(wname)}${e.headshot ? ' ⌖' : ''}]</span><span class="${cls(e.victim)}">${esc(e.victim.name)}</span>`;
    $('killfeed').prepend(div);
    while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
    setTimeout(() => div.remove(), 7000);
    if (e.killer === p && e.victim !== p) this.hitT = 0.3;
  }
  radio(from, text, story) {
    const div = document.createElement('div');
    div.className = 'radio-msg' + (story ? ' story' : '');
    div.innerHTML = `<b>${esc(from)}:</b>${esc(text)}`;
    $('radio').append(div);
    while ($('radio').children.length > 4) $('radio').firstChild.remove();
    setTimeout(() => div.remove(), story ? 9000 : 5000);
  }
  toast(title, text, small) {
    const div = document.createElement('div');
    div.className = 'toast' + (small ? ' small' : '');
    div.innerHTML = `<div class="tt">${esc(title)}</div>${text ? `<div class="tx">${esc(text)}</div>` : ''}`;
    $('toasts').append(div);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => div.remove(), small ? 2600 : 4200);
  }
  xp(amount, reason) {
    if (this.game.state !== 'playing') return;
    const div = document.createElement('div');
    div.className = 'xp';
    div.textContent = `+${amount} XP  ${reason || ''}`;
    $('xpPop').append(div);
    setTimeout(() => div.remove(), 1400);
  }

  update() {
    const g = this.game;
    if (g.state !== 'playing' && g.state !== 'paused' && g.state !== 'dialog') return;
    const p = g.player;
    if (!p || !g.mode) return;
    const dt = 1 / 60;
    this.frameN++;
    const w = p.weapon;
    // mira dinâmica
    const spread = p.currentSpread(w);
    const px = Math.max(3, Math.tan(spread * DEG * 0.5) / Math.tan(g.camera.fov * DEG * 0.5) * innerHeight * 0.5);
    const ch = $('crosshair');
    const showCh = g.settings.crosshair && p.alive && !p.vehicle && p.ads < 0.6 && !p.sprinting;
    ch.style.opacity = showCh ? 1 : 0;
    if (showCh) {
      ch.children[0].style.top = `${-px - 9}px`; ch.children[1].style.top = `${px}px`;
      ch.children[2].style.left = `${-px - 9}px`; ch.children[3].style.left = `${px}px`;
    }
    this.hitT = Math.max(0, this.hitT - dt);
    $('hitmarker').style.opacity = this.hitT > 0 ? 1 : 0;
    // luneta
    $('scope').classList.toggle('hidden', !(w.stats.scope && p.ads > 0.92 && p.alive));
    // efeitos de tela
    this.flashA = Math.max(0, this.flashA - dt * 0.9);
    const low = p.health / p.maxHealth;
    $('vignette').style.opacity = Math.max(this.flashA, low < 0.35 ? (0.35 - low) * 2 : 0);
    this.supA = Math.max(0, (this.supA || 0) - dt * 0.6);
    $('suppress').style.opacity = this.supA;
    $('flashOverlay').style.opacity = clamp(p.flashed / 2.5, 0, 1);
    // direção do dano
    const dd = $('dmgdirs');
    this.dmgDirs = this.dmgDirs.filter((d) => (d.t -= dt) > 0);
    if (this.frameN % 2 === 0) {
      dd.innerHTML = this.dmgDirs.map((d) => `<div class="dmgdir" style="transform: rotate(${(-(d.ang - p.yaw)) / DEG}deg) translateY(-110px); opacity:${Math.min(1, d.t)}"></div>`).join('');
    }
    // vitais
    $('healthFill').style.width = `${clamp(p.health / p.maxHealth, 0, 1) * 100}%`;
    $('healthText').textContent = Math.ceil(p.health);
    $('healthFill').parentElement.classList.toggle('low', low < 0.35);
    $('armorFill').style.width = `${clamp(p.armor / p.maxArmor, 0, 1) * 100}%`;
    $('stance').textContent = p.vehicle ? 'Dirigindo' : p.parachute ? 'Paraquedas' : p.crouchT > 0.5 ? 'Agachado' : p.sprinting ? 'Correndo' : '';
    // munição
    $('weaponName').textContent = w.stats.name;
    $('mag').textContent = w.isMelee ? '—' : w.mag;
    $('reserve').textContent = w.isMelee ? '' : w.reserve;
    $('ammo').classList.toggle('low', !w.isMelee && w.mag <= Math.ceil(w.stats.mag * 0.25));
    const fm = { auto: 'AUTO', burst: 'RAJADA', semi: 'SEMI', bolt: 'FERROLHO', pump: 'BOMBA', melee: '' }[w.fireMode];
    $('weaponInfo').textContent = `${WEAPON_CLASSES[w.stats.cls] || ''}${fm ? ' · ' + fm : ''}${!w.isMelee ? ' · ' + AMMO_TYPES[w.ammoType].name : ''}`;
    $('grenades').innerHTML = ['frag', 'smoke', 'flash'].map((t) => `<span class="g ${p.grenadeType === t ? 'sel' : ''}">${{ frag: '💣', smoke: '☁', flash: '✸' }[t]} ${p.grenades[t] || 0}</span>`).join('');
    let hint = '';
    if (w.reloading > 0) hint = 'RECARREGANDO';
    else if (!w.isMelee && w.mag === 0 && w.reserve === 0) hint = 'SEM MUNIÇÃO';
    else if (!w.isMelee && w.mag <= Math.ceil(w.stats.mag * 0.2)) hint = '[R] RECARREGAR';
    $('reloadHint').textContent = p.alive ? hint : '';
    // modo
    const h = g.mode.hud();
    $('modeTitle').textContent = h.title || '';
    $('objective').textContent = h.objective || '';
    let scores = '';
    if (h.scores) scores = `<div class="s a">${h.scores[0]}</div><div class="s e">${h.scores[1]}</div>`;
    else if (h.wave !== undefined) scores = `<div class="s a">ONDA ${h.wave}</div><div class="s">${h.points} pts</div><div class="s e">${h.enemies} hostis</div>`;
    else if (h.alive !== undefined) scores = `<div class="s a">${h.alive} vivos</div><div class="s">${h.kills} abates</div><div class="s e">Zona ${h.shrinking ? 'fechando' : 'em'} ${h.zoneT}s</div>`;
    if ($('scores').innerHTML !== scores) $('scores').innerHTML = scores;
    $('timer').textContent = h.time !== null && h.time !== undefined && isFinite(h.time) ? fmtTime(h.time) : '';
    $('zones').innerHTML = h.zones ? h.zones.map((z) => `<div class="zone" style="border-color:${z.contested ? '#ffcc33' : z.owner === 0 ? 'var(--ally)' : z.owner === 1 ? 'var(--enemy)' : '#fff'}"><div class="p" style="width:${Math.abs(z.progress) * 100}%;background:${z.progress > 0 ? 'var(--ally)' : 'var(--enemy)'}"></div><span>${z.id}</span></div>`).join('') : '';
    const bb = $('bossbar');
    bb.classList.toggle('hidden', !h.boss);
    if (h.boss) { bb.querySelector('.bname').textContent = h.boss.name; bb.querySelector('.bfill').style.width = `${clamp(h.boss.hp, 0, 1) * 100}%`; }
    $('prompt').textContent = g.mode.prompt() || '';
    // bússola
    const heading = ((-p.yaw / DEG) % 360 + 360) % 360;
    $('compassStrip').style.left = `${210 - (heading + 360) * 4}px`;
    // morte
    const dead = !p.alive && !g.mode.over;
    $('death').classList.toggle('hidden', !dead);
    if (dead) {
      const rt = g.mode.respawnTimeFor(p);
      $('deathSub').textContent = rt !== null ? `Reaparecendo em ${Math.ceil(rt)}s` : p.lastKiller ? `Abatido por ${p.lastKiller.name}` : '';
    }
    // placar
    const tab = g.input.down('scoreboard') || g.mode.over;
    $('scoreboard').classList.toggle('hidden', !tab);
    if (tab && this.frameN % 15 === 0) this.renderScoreboard();
    // mapa grande
    if (g.input.hit('map')) $('bigmap').classList.toggle('hidden');
    if (!$('bigmap').classList.contains('hidden') && this.frameN % 6 === 0) this.drawMap(this.big, 720, true);
    if (this.frameN % 2 === 0) this.drawMap(this.mm, 220, false);
    // loja (sobrevivência)
    if (g.input.hit('inventory') && g.mode.buy) this.toggleShop();
    if (!$('shop').classList.contains('hidden') && this.frameN % 10 === 0) this.renderShop();
    // FPS
    if (g.settings.showFps && this.frameN % 15 === 0) $('fps').textContent = `${g.perf.fps.toFixed(0)} FPS · sim ${g.perf.sim.toFixed(1)}ms · render ${g.perf.render.toFixed(1)}ms · bots ${g.combatants.length - 1}`;
    else if (!g.settings.showFps) $('fps').textContent = '';
  }

  renderScoreboard() {
    const g = this.game;
    const rows = g.mode.scoreboard();
    const teamBased = g.mode.teamBased;
    const rowHtml = (r) => `<tr class="${r.me ? 'me' : ''} ${r.alive ? '' : 'dead'}"><td class="t${teamBased ? r.team : r.me ? 0 : 1}">${esc(r.name)}</td><td>${r.k}</td><td>${r.d}</td><td>${r.a}</td><td>${r.s}</td></tr>`;
    const head = '<tr><th>Operador</th><th>A</th><th>M</th><th>AS</th><th>Pontos</th></tr>';
    let html = `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>${esc(g.mode.title)}</b><span style="color:var(--dim)">${esc(g.map.name)}</span></div>`;
    if (teamBased) {
      for (const t of [0, 1]) html += `<div style="margin:8px 0 4px;color:${t === 0 ? 'var(--ally)' : 'var(--enemy)'};font-weight:700">${t === 0 ? 'FORÇA ZERO' : 'LEGIÃO KRANE'} — ${g.mode.scores[t]}</div><table>${head}${rows.filter((r) => r.team === t).map(rowHtml).join('')}</table>`;
    } else html += `<table>${head}${rows.slice(0, 20).map(rowHtml).join('')}</table>`;
    $('scoreboard').innerHTML = html;
  }

  toggleShop() {
    const g = this.game;
    const el = $('shop');
    const open = el.classList.contains('hidden');
    if (open && !g.mode.inBreak) { this.toast('Loja fechada', 'A loja só abre entre as ondas', true); return; }
    el.classList.toggle('hidden', !open);
    if (open) { g.input.unlock(); g.shopOpen = true; this.renderShop(); }
    else { g.shopOpen = false; g.input.lock(); }
  }
  renderShop() {
    const m = this.game.mode;
    if (!m.inBreak) { $('shop').classList.add('hidden'); this.game.shopOpen = false; this.game.input.lock(); return; }
    $('shop').innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">ARSENAL DE CAMPO</h2><button class="btn ghost" data-close>Fechar</button></div><div style="color:var(--dim)">Pontos: <b style="color:var(--accent)">${m.points}</b> · Próxima onda em ${Math.ceil(m.breakT)}s · [I] fechar</div>
      <div class="shop-items">${SHOP.map((s) => `<button data-buy="${s.id}" ${m.points < s.cost ? 'disabled' : ''}>${s.name}<b>${s.cost}</b></button>`).join('')}</div>`;
    $('shop').querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { m.buy(b.dataset.buy); this.renderShop(); });
    $('shop').querySelector('[data-close]').onclick = () => this.toggleShop();
  }

  drawMap(ctx, size, full) {
    const g = this.game, p = g.player;
    if (!p || !g.world) return;
    const S = g.map.size;
    ctx.clearRect(0, 0, size, size);
    const range = full ? S * 2.1 : g.map.large ? 160 : 110;
    const scale = size / range;
    ctx.save();
    if (full) { ctx.fillStyle = '#0d1310'; ctx.fillRect(0, 0, size, size); ctx.translate(size / 2, size / 2); }
    else {
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
      ctx.translate(size / 2, size / 2); ctx.rotate(p.yaw);
      ctx.translate(-p.pos.x * scale, -p.pos.z * scale);
    }
    // estruturas (cache por mapa)
    if (!this.mapCache || this.mapCache.world !== g.world || this.mapCache.full !== full || g.time - this.mapCache.t > 3) {
      this.mapCache = { world: g.world, full, t: g.time, boxes: g.world.boxes.filter((b) => !b.removed && b.max.y > 1 && (b.max.x - b.min.x) * (b.max.z - b.min.z) > 0.3) };
    }
    ctx.fillStyle = full ? 'rgba(170,180,170,.5)' : 'rgba(200,210,200,.38)';
    for (const b of this.mapCache.boxes) ctx.fillRect(b.min.x * scale, b.min.z * scale, Math.max(1, (b.max.x - b.min.x) * scale), Math.max(1, (b.max.z - b.min.z) * scale));
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.strokeRect(-S * scale, -S * scale, S * 2 * scale, S * 2 * scale);
    // marcadores do modo
    for (const m of g.mode.markers()) {
      ctx.save();
      if (m.ring) { ctx.strokeStyle = m.color; ctx.lineWidth = m.zone ? 2 : 1.5; ctx.beginPath(); ctx.arc(m.x * scale, m.z * scale, m.ring * scale, 0, Math.PI * 2); ctx.stroke(); }
      if (m.dot) { ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(m.x * scale, m.z * scale, 3, 0, 7); ctx.fill(); }
      if (m.label) {
        ctx.translate(m.x * scale, m.z * scale);
        if (!full) ctx.rotate(-p.yaw);
        ctx.fillStyle = m.color; ctx.font = `bold ${m.small ? 10 : 13}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(m.label, 0, 0);
      }
      ctx.restore();
    }
    // combatentes: aliados sempre; inimigos se dispararam recentemente sem supressor ou se avistados pelo esquadrão
    const now = g.time;
    for (const c of g.combatants) {
      if (!c.alive || c === p) continue;
      const ally = c.team === p.team;
      let show = ally;
      if (!ally) show = (now - c.lastShot < 1.5 && !c.weapon.stats.suppressed && Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) < 80) || (g.mode.teamBased && this.spotted(c));
      if (!show) continue;
      ctx.fillStyle = ally ? '#4aa3ff' : '#ff4a4a';
      ctx.beginPath(); ctx.arc(c.pos.x * scale, c.pos.z * scale, full ? 4 : 3.2, 0, 7); ctx.fill();
    }
    // jogador
    ctx.save();
    ctx.translate(p.pos.x * scale, p.pos.z * scale);
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    if (!full) { ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, 7); ctx.stroke(); }
  }
  spotted(c) {
    const g = this.game;
    for (const s of g.ai.squads) {
      if (s.team !== g.player.team) continue;
      const k = s.known.get(c);
      if (k && g.time - k.t < 2) return true;
    }
    return false;
  }
}

export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
