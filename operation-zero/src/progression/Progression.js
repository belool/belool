import { WEAPONS, ATTACHMENTS, AMMO_TYPES, CAMOS, EQUIPMENT } from '../combat/weapons.js';

// ================================================================
// PROGRESSION — XP, níveis, desbloqueios, camuflagens, desafios,
// conquistas e ranking competitivo (MMR com divisões).
// Lógica pura (testável em Node); a persistência fica no Save.
// ================================================================

export const MAX_LEVEL = 50;
export const XP = { kill: 100, headshot: 50, assist: 40, melee: 75, explosive: 50, longshot: 40, capture: 150, objective: 250, win: 600, loss: 200, wave: 120, survive: 80, mission: 1000 };

export function xpForLevel(level) { // XP total necessário para atingir o nível
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(800 + l * 180 + l * l * 6);
  return total;
}
export function levelFromXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export const RANKS = [
  { name: 'Recruta', min: 0, color: '#8a8a8a' },
  { name: 'Bronze', min: 900, color: '#b07a4a' },
  { name: 'Prata', min: 1100, color: '#c0c6cc' },
  { name: 'Ouro', min: 1300, color: '#e3b341' },
  { name: 'Platina', min: 1500, color: '#5fd3c4' },
  { name: 'Diamante', min: 1700, color: '#6fa8ff' },
  { name: 'Elite Zero', min: 1950, color: '#ff5555' },
];
export function rankOf(points) { let r = RANKS[0]; for (const k of RANKS) if (points >= k.min) r = k; return r; }
// Variação de MMR: vitória/derrota + desempenho individual
export function rankDelta(won, kills, deaths, score) {
  const kd = (kills + 1) / (deaths + 1);
  let d = won ? 22 : -18;
  d += Math.max(-8, Math.min(10, (kd - 1) * 6));
  d += Math.min(6, score / 1500);
  return Math.round(d);
}

export const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'Primeiro sangue', desc: 'Consiga seu primeiro abate.', test: (p) => p.stats.kills >= 1 },
  { id: 'centurion', name: 'Centurião', desc: '100 abates no total.', test: (p) => p.stats.kills >= 100 },
  { id: 'marksman', name: 'Olho de águia', desc: '50 tiros na cabeça.', test: (p) => p.stats.headshots >= 50 },
  { id: 'veteran', name: 'Veterano', desc: 'Alcance o nível 10.', test: (p) => levelFromXp(p.xp) >= 10 },
  { id: 'legend', name: 'Lenda', desc: 'Alcance o nível 30.', test: (p) => levelFromXp(p.xp) >= 30 },
  { id: 'survivor', name: 'Sobrevivente', desc: 'Chegue à onda 10 no Modo Sobrevivência.', test: (p) => p.stats.bestWave >= 10 },
  { id: 'last_one', name: 'Último de pé', desc: 'Vença uma partida de Battle Royale.', test: (p) => p.stats.brWins >= 1 },
  { id: 'campaign_done', name: 'Operação Zero', desc: 'Conclua a campanha.', test: (p) => !!p.campaign.completed.m4 },
  { id: 'gold_camo', name: 'Toque de Midas', desc: 'Desbloqueie a camuflagem Ouro em qualquer arma.', test: (p) => Object.values(p.weaponStats).some((w) => w.kills >= 200) },
  { id: 'ranked', name: 'Competidor', desc: 'Alcance a divisão Ouro no ranking.', test: (p) => p.rankPoints >= 1300 },
];

const CHALLENGE_POOL = [
  { id: 'kills_ar', text: 'Abata {n} inimigos com fuzis de assalto', n: 25, xp: 1500, match: (e) => e.cls === 'ar' && e.type === 'kill' },
  { id: 'kills_smg', text: 'Abata {n} inimigos com submetralhadoras', n: 20, xp: 1500, match: (e) => e.cls === 'smg' && e.type === 'kill' },
  { id: 'kills_sniper', text: 'Abata {n} inimigos com rifles de precisão', n: 10, xp: 1800, match: (e) => (e.cls === 'sniper' || e.cls === 'dmr') && e.type === 'kill' },
  { id: 'kills_shotgun', text: 'Abata {n} inimigos com escopetas', n: 12, xp: 1500, match: (e) => e.cls === 'shotgun' && e.type === 'kill' },
  { id: 'headshots', text: 'Acerte {n} tiros na cabeça', n: 15, xp: 1600, match: (e) => e.type === 'kill' && e.headshot },
  { id: 'grenade', text: 'Abata {n} inimigos com explosivos', n: 5, xp: 1400, match: (e) => e.type === 'kill' && e.explosive },
  { id: 'melee', text: 'Abata {n} inimigos com a faca', n: 3, xp: 1400, match: (e) => e.type === 'kill' && e.melee },
  { id: 'capture', text: 'Capture {n} objetivos', n: 5, xp: 1500, match: (e) => e.type === 'capture' },
  { id: 'wins', text: 'Vença {n} partidas', n: 3, xp: 2000, match: (e) => e.type === 'win' },
  { id: 'waves', text: 'Sobreviva a {n} ondas', n: 10, xp: 1500, match: (e) => e.type === 'wave' },
  { id: 'longshot', text: 'Abata {n} inimigos a mais de 50 m', n: 8, xp: 1600, match: (e) => e.type === 'kill' && e.dist > 50 },
];

export function newChallenges(seed = Date.now()) {
  const pool = CHALLENGE_POOL.slice();
  const out = [];
  let s = seed % 2147483647;
  for (let i = 0; i < 3; i++) {
    s = (s * 48271) % 2147483647;
    const c = pool.splice(s % pool.length, 1)[0];
    out.push({ id: c.id, text: c.text.replace('{n}', c.n), n: c.n, progress: 0, xp: c.xp, done: false });
  }
  return { list: out, date: new Date(seed).toDateString() };
}

export class Progression {
  constructor(profile, events) {
    this.p = profile;
    this.events = events;
    this.matchXp = 0;
    this.matchLog = [];
    if (!this.p.challenges || this.p.challenges.date !== new Date().toDateString()) this.p.challenges = newChallenges();
  }
  get level() { return levelFromXp(this.p.xp); }
  levelProgress() {
    const l = this.level, a = xpForLevel(l), b = xpForLevel(l + 1);
    return l >= MAX_LEVEL ? 1 : (this.p.xp - a) / (b - a);
  }
  isUnlocked(kind, id) {
    const L = this.level;
    if (kind === 'weapon') return (WEAPONS[id]?.unlock ?? 99) <= L;
    if (kind === 'ammo') return (AMMO_TYPES[id]?.unlock ?? 99) <= L;
    if (kind === 'equipment') return (EQUIPMENT[id]?.unlock ?? 99) <= L;
    for (const cat of Object.keys(ATTACHMENTS)) if (kind === cat) return (ATTACHMENTS[cat][id]?.unlock ?? 99) <= L;
    return false;
  }
  camoUnlocked(weaponId, camoId) {
    const c = CAMOS.find((x) => x.id === camoId);
    if (!c || !c.req) return true;
    const ws = this.p.weaponStats[weaponId] || { kills: 0, headshots: 0 };
    if (c.req.kills) return ws.kills >= c.req.kills;
    if (c.req.headshots) return ws.headshots >= c.req.headshots;
    return false;
  }
  addXp(amount, reason) {
    const before = this.level;
    this.p.xp += amount;
    this.matchXp += amount;
    this.events?.emit('xp', { amount, reason });
    const after = this.level;
    if (after > before) {
      const unlocks = [];
      for (const [id, w] of Object.entries(WEAPONS)) if (w.unlock > before && w.unlock <= after) unlocks.push(w.name);
      for (const cat of Object.values(ATTACHMENTS)) for (const a of Object.values(cat)) if (a.unlock > before && a.unlock <= after) unlocks.push(a.name);
      for (const a of Object.values(AMMO_TYPES)) if (a.unlock > before && a.unlock <= after) unlocks.push('Munição ' + a.name);
      this.events?.emit('levelup', { level: after, unlocks });
    }
  }
  // Registra eventos do jogador: kill, capture, win, wave...
  record(e) {
    const p = this.p;
    if (e.type === 'kill') {
      p.stats.kills++;
      if (e.headshot) p.stats.headshots++;
      if (e.weapon) {
        const ws = (p.weaponStats[e.weapon] ||= { kills: 0, headshots: 0 });
        const before = CAMOS.filter((c) => this.camoUnlocked(e.weapon, c.id)).length;
        ws.kills++; if (e.headshot) ws.headshots++;
        const after = CAMOS.filter((c) => this.camoUnlocked(e.weapon, c.id)).length;
        if (after > before) this.events?.emit('toast', { title: 'Camuflagem desbloqueada', text: `${CAMOS[after - 1].name} — ${WEAPONS[e.weapon]?.name}` });
      }
      let xp = XP.kill;
      if (e.headshot) xp += XP.headshot;
      if (e.melee) xp += XP.melee;
      if (e.explosive) xp += XP.explosive;
      if (e.dist > 50) xp += XP.longshot;
      this.addXp(xp, e.headshot ? 'Tiro na cabeça' : e.melee ? 'Abate com faca' : 'Abate');
    } else if (e.type === 'death') p.stats.deaths++;
    else if (e.type === 'assist') this.addXp(XP.assist, 'Assistência');
    else if (e.type === 'capture') this.addXp(XP.capture, 'Objetivo capturado');
    else if (e.type === 'objective') this.addXp(XP.objective, e.text || 'Objetivo concluído');
    else if (e.type === 'wave') this.addXp(XP.wave, 'Onda superada');
    // desafios
    const ch = p.challenges?.list || [];
    for (const c of ch) {
      if (c.done) continue;
      const def = CHALLENGE_POOL.find((d) => d.id === c.id);
      if (def && def.match(e)) {
        c.progress++;
        if (c.progress >= c.n) { c.done = true; this.addXp(c.xp, 'Desafio: ' + c.text); this.events?.emit('toast', { title: 'Desafio concluído!', text: c.text }); }
      }
    }
    this.checkAchievements();
  }
  checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (this.p.achievements[a.id]) continue;
      if (a.test(this.p)) { this.p.achievements[a.id] = Date.now(); this.events?.emit('toast', { title: 'Conquista desbloqueada', text: a.name }); }
    }
  }
}
