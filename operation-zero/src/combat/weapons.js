// ================================================================
// DADOS DO ARSENAL — definição de armas, acessórios e munições.
// Tudo orientado a dados: adicionar uma arma = adicionar uma entrada.
// ================================================================

export const WEAPON_CLASSES = {
  pistol: 'Pistola', ar: 'Fuzil de assalto', smg: 'Submetralhadora',
  sniper: 'Rifle de precisão', dmr: 'Fuzil de atirador', shotgun: 'Escopeta', lmg: 'Metralhadora pesada',
  melee: 'Corpo a corpo',
};

// velocity m/s | range = alcance com dano total (m) | pen = poder de penetração
// recoil: vert/horiz em graus por tiro; recovery graus/s
// spread em graus: hip (quadril), ads (mirando), move (adicional em movimento)
export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Faca de combate', cls: 'melee', damage: 55, rpm: 100, mode: 'melee', mag: 0, reserve: 0,
    reload: 0, velocity: 0, range: 2.2, minMul: 1, pen: 0, pellets: 1, headMul: 2,
    spread: { hip: 0, ads: 0, move: 0 }, recoil: { vert: 0, horiz: 0, recovery: 10 },
    adsZoom: 1, adsTime: 0.1, moveMul: 1.08, unlock: 1, slot: 'secondary', sound: { freq: 400, noise: 0.1, decay: 0.05, gain: 0.2 },
    vm: { len: 0.25, h: 0.03, w: 0.02, color: 0x999999 },
  },
  p9: {
    id: 'p9', name: 'P-9 Sentinela', cls: 'pistol', damage: 26, rpm: 400, mode: 'semi', mag: 15, reserve: 60,
    reload: 1.4, reloadEmpty: 1.8, velocity: 360, range: 18, minMul: 0.6, pen: 9, pellets: 1, headMul: 2.2,
    spread: { hip: 1.6, ads: 0.4, move: 1.2 }, recoil: { vert: 1.6, horiz: 0.5, recovery: 22 },
    adsZoom: 1.2, adsTime: 0.12, moveMul: 1.0, unlock: 1, slot: 'secondary',
    sound: { freq: 900, noise: 0.7, decay: 0.12, gain: 0.55 }, vm: { len: 0.2, h: 0.12, w: 0.04, color: 0x2a2a2a },
  },
  r45: {
    id: 'r45', name: 'Raptor .45', cls: 'pistol', damage: 48, rpm: 160, mode: 'semi', mag: 7, reserve: 35,
    reload: 1.9, reloadEmpty: 2.3, velocity: 420, range: 25, minMul: 0.6, pen: 14, pellets: 1, headMul: 2.2,
    spread: { hip: 2.2, ads: 0.35, move: 1.6 }, recoil: { vert: 4.2, horiz: 1.2, recovery: 18 },
    adsZoom: 1.25, adsTime: 0.15, moveMul: 0.98, unlock: 6, slot: 'secondary',
    sound: { freq: 500, noise: 0.9, decay: 0.2, gain: 0.75 }, vm: { len: 0.26, h: 0.14, w: 0.045, color: 0x777766 },
  },
  ar4: {
    id: 'ar4', name: 'AR-4 Vanguarda', cls: 'ar', damage: 30, rpm: 780, mode: 'auto', mag: 30, reserve: 150,
    reload: 2.1, reloadEmpty: 2.6, velocity: 880, range: 45, minMul: 0.72, pen: 22, pellets: 1, headMul: 2,
    spread: { hip: 3.0, ads: 0.25, move: 2.2 }, recoil: { vert: 0.85, horiz: 0.45, recovery: 12 },
    adsZoom: 1.35, adsTime: 0.22, moveMul: 0.92, unlock: 1, slot: 'primary', fireModes: ['auto', 'burst', 'semi'],
    sound: { freq: 700, noise: 0.85, decay: 0.14, gain: 0.6 }, vm: { len: 0.72, h: 0.14, w: 0.055, color: 0x2d3035, stock: true, mag: 'curved' },
  },
  kr47: {
    id: 'kr47', name: 'KR-47 Tempestade', cls: 'ar', damage: 37, rpm: 610, mode: 'auto', mag: 30, reserve: 150,
    reload: 2.4, reloadEmpty: 2.9, velocity: 715, range: 40, minMul: 0.7, pen: 26, pellets: 1, headMul: 2,
    spread: { hip: 3.3, ads: 0.35, move: 2.4 }, recoil: { vert: 1.25, horiz: 0.75, recovery: 10 },
    adsZoom: 1.35, adsTime: 0.25, moveMul: 0.9, unlock: 4, slot: 'primary', fireModes: ['auto', 'semi'],
    sound: { freq: 520, noise: 0.95, decay: 0.17, gain: 0.7 }, vm: { len: 0.78, h: 0.15, w: 0.06, color: 0x5a3b22, stock: true, mag: 'curved' },
  },
  vespa: {
    id: 'vespa', name: 'Vespa SMG', cls: 'smg', damage: 22, rpm: 950, mode: 'auto', mag: 32, reserve: 192,
    reload: 1.8, reloadEmpty: 2.2, velocity: 400, range: 16, minMul: 0.55, pen: 10, pellets: 1, headMul: 1.8,
    spread: { hip: 2.2, ads: 0.6, move: 1.0 }, recoil: { vert: 0.55, horiz: 0.55, recovery: 16 },
    adsZoom: 1.25, adsTime: 0.15, moveMul: 1.0, unlock: 1, slot: 'primary', fireModes: ['auto', 'semi'],
    sound: { freq: 1100, noise: 0.7, decay: 0.09, gain: 0.5 }, vm: { len: 0.5, h: 0.13, w: 0.05, color: 0x1f2329, mag: 'straight' },
  },
  mpx9: {
    id: 'mpx9', name: 'MPX-9 Fantasma', cls: 'smg', damage: 25, rpm: 820, mode: 'auto', mag: 30, reserve: 180,
    reload: 1.9, reloadEmpty: 2.3, velocity: 420, range: 20, minMul: 0.6, pen: 11, pellets: 1, headMul: 1.8,
    spread: { hip: 2.4, ads: 0.45, move: 1.1 }, recoil: { vert: 0.65, horiz: 0.4, recovery: 15 },
    adsZoom: 1.3, adsTime: 0.17, moveMul: 0.99, unlock: 8, slot: 'primary', fireModes: ['auto', 'burst', 'semi'],
    sound: { freq: 950, noise: 0.75, decay: 0.1, gain: 0.5 }, vm: { len: 0.55, h: 0.13, w: 0.05, color: 0x3b4234, stock: true, mag: 'straight' },
  },
  breacher: {
    id: 'breacher', name: 'Breacher 12', cls: 'shotgun', damage: 17, rpm: 70, mode: 'pump', mag: 8, reserve: 32,
    reload: 0.55, reloadPerShell: true, velocity: 380, range: 9, minMul: 0.25, pen: 6, pellets: 9, headMul: 1.5,
    spread: { hip: 6.5, ads: 4.8, move: 1.0 }, recoil: { vert: 6, horiz: 1.5, recovery: 12 },
    adsZoom: 1.15, adsTime: 0.2, moveMul: 0.95, unlock: 3, slot: 'primary',
    sound: { freq: 300, noise: 1, decay: 0.3, gain: 0.95 }, vm: { len: 0.85, h: 0.12, w: 0.06, color: 0x3a2a1c, stock: true, pump: true },
  },
  longbow: {
    id: 'longbow', name: 'Longbow .338', cls: 'sniper', damage: 115, rpm: 45, mode: 'bolt', mag: 5, reserve: 25,
    reload: 3.0, reloadEmpty: 3.6, velocity: 940, range: 150, minMul: 0.85, pen: 45, pellets: 1, headMul: 2.5,
    spread: { hip: 7, ads: 0.02, move: 4 }, recoil: { vert: 7, horiz: 1.2, recovery: 8 },
    adsZoom: 6, adsTime: 0.38, moveMul: 0.85, unlock: 5, slot: 'primary', defaultOptic: 'sniper',
    sound: { freq: 250, noise: 1, decay: 0.45, gain: 1 }, vm: { len: 1.1, h: 0.13, w: 0.05, color: 0x2f3a2a, stock: true, mag: 'box' },
  },
  dmr14: {
    id: 'dmr14', name: 'DMR-14 Ceifador', cls: 'dmr', damage: 58, rpm: 300, mode: 'semi', mag: 15, reserve: 75,
    reload: 2.4, reloadEmpty: 2.9, velocity: 850, range: 80, minMul: 0.8, pen: 32, pellets: 1, headMul: 2.2,
    spread: { hip: 4, ads: 0.1, move: 2.5 }, recoil: { vert: 2.6, horiz: 0.8, recovery: 10 },
    adsZoom: 3, adsTime: 0.3, moveMul: 0.88, unlock: 10, slot: 'primary', defaultOptic: 'acog',
    sound: { freq: 400, noise: 1, decay: 0.3, gain: 0.85 }, vm: { len: 0.95, h: 0.14, w: 0.055, color: 0x6b5a3a, stock: true, mag: 'box' },
  },
  titan: {
    id: 'titan', name: 'Titan M-60', cls: 'lmg', damage: 34, rpm: 650, mode: 'auto', mag: 100, reserve: 200,
    reload: 5.0, reloadEmpty: 5.5, velocity: 850, range: 55, minMul: 0.75, pen: 34, pellets: 1, headMul: 1.8,
    spread: { hip: 4.5, ads: 0.5, move: 3.5 }, recoil: { vert: 0.9, horiz: 0.85, recovery: 9 },
    adsZoom: 1.4, adsTime: 0.4, moveMul: 0.78, unlock: 12, slot: 'primary',
    sound: { freq: 450, noise: 1, decay: 0.2, gain: 0.8 }, vm: { len: 1.0, h: 0.18, w: 0.08, color: 0x23262a, stock: true, mag: 'drum', bipod: true },
  },
};

// Acessórios: mods aplicados multiplicativamente sobre os atributos.
export const ATTACHMENTS = {
  optic: {
    none: { name: 'Mira de ferro', unlock: 1 },
    reddot: { name: 'Red Dot', unlock: 2, adsZoom: 1.45, adsTime: 1.05 },
    acog: { name: 'Luneta 3x', unlock: 7, adsZoom: 3, adsTime: 1.2, spreadAds: 0.7 },
    sniper: { name: 'Luneta 6x', unlock: 5, adsZoom: 6, adsTime: 1.35, spreadAds: 0.5, scope: true },
  },
  muzzle: {
    none: { name: 'Nenhum', unlock: 1 },
    suppressor: { name: 'Supressor', unlock: 3, noise: 0.3, velocity: 0.9, range: 0.9, flash: false },
    compensator: { name: 'Compensador', unlock: 4, recoilVert: 0.78 },
    brake: { name: 'Freio de boca', unlock: 9, recoilHoriz: 0.7, noise: 1.2 },
  },
  grip: {
    none: { name: 'Nenhum', unlock: 1 },
    vertical: { name: 'Empunhadura vertical', unlock: 2, recoilVert: 0.85, recoilHoriz: 0.85 },
    angled: { name: 'Empunhadura angular', unlock: 5, adsTime: 0.8, recoilVert: 0.93 },
    laser: { name: 'Mira laser', unlock: 8, spreadHip: 0.65 },
  },
  mag: {
    standard: { name: 'Padrão', unlock: 1 },
    extended: { name: 'Carregador estendido', unlock: 6, mag: 1.5, reload: 1.15 },
    fast: { name: 'Carregador rápido', unlock: 11, reload: 0.75 },
  },
};

export const AMMO_TYPES = {
  fmj: { name: 'FMJ (padrão)', damage: 1, pen: 1, unlock: 1 },
  ap: { name: 'Perfurante (AP)', damage: 0.9, pen: 2.0, unlock: 7, color: 0x66ccff },
  hp: { name: 'Ponta oca (HP)', damage: 1.2, pen: 0.4, unlock: 9, color: 0xff8844 },
};

export const EQUIPMENT = {
  frag: { name: 'Granada de fragmentação', fuse: 3.0, radius: 7.5, damage: 140, unlock: 1 },
  smoke: { name: 'Granada de fumaça', fuse: 1.6, radius: 6, duration: 18, unlock: 2 },
  flash: { name: 'Granada de atordoamento', fuse: 1.5, radius: 12, unlock: 4 },
};

export const CAMOS = [
  { id: 'none', name: 'Padrão', color: null, req: null },
  { id: 'desert', name: 'Deserto', color: 0xb8a070, req: { kills: 15 } },
  { id: 'forest', name: 'Floresta', color: 0x4a5e34, req: { kills: 40 } },
  { id: 'urban', name: 'Urbano', color: 0x8a8d92, req: { kills: 80 } },
  { id: 'arctic', name: 'Ártico', color: 0xe6eef2, req: { headshots: 25 } },
  { id: 'crimson', name: 'Carmesim', color: 0x8b1a1a, req: { headshots: 60 } },
  { id: 'gold', name: 'Ouro', color: 0xd4af37, req: { kills: 200 } },
];

// Calcula os atributos finais de uma arma com acessórios e munição.
export function computeStats(weaponId, att = {}, ammo = 'fmj') {
  const d = WEAPONS[weaponId];
  if (!d) throw new Error('Arma desconhecida: ' + weaponId);
  const a = {
    optic: ATTACHMENTS.optic[att.optic || d.defaultOptic || 'none'] || ATTACHMENTS.optic.none,
    muzzle: ATTACHMENTS.muzzle[att.muzzle || 'none'] || ATTACHMENTS.muzzle.none,
    grip: ATTACHMENTS.grip[att.grip || 'none'] || ATTACHMENTS.grip.none,
    mag: ATTACHMENTS.mag[att.mag || 'standard'] || ATTACHMENTS.mag.standard,
  };
  const am = AMMO_TYPES[ammo] || AMMO_TYPES.fmj;
  const mods = Object.values(a);
  const prod = (k) => mods.reduce((m, x) => m * (x[k] ?? 1), 1);
  const s = {
    ...d,
    attachments: { optic: att.optic || d.defaultOptic || 'none', muzzle: att.muzzle || 'none', grip: att.grip || 'none', mag: att.mag || 'standard' },
    ammo,
    damage: d.damage * am.damage,
    pen: d.pen * am.pen,
    mag: d.mag ? Math.round(d.mag * prod('mag')) : 0,
    reload: d.reload * prod('reload'),
    reloadEmpty: (d.reloadEmpty || d.reload) * prod('reload'),
    velocity: d.velocity * prod('velocity'),
    range: d.range * prod('range'),
    adsTime: d.adsTime * prod('adsTime'),
    adsZoom: Math.max(d.adsZoom, a.optic.adsZoom || 1),
    noise: prod('noise'),
    suppressed: a.muzzle === ATTACHMENTS.muzzle.suppressor,
    scope: !!a.optic.scope,
    optic: att.optic || d.defaultOptic || 'none',
    recoil: {
      vert: d.recoil.vert * prod('recoilVert'),
      horiz: d.recoil.horiz * prod('recoilHoriz'),
      recovery: d.recoil.recovery,
    },
    spread: {
      hip: d.spread.hip * prod('spreadHip'),
      ads: d.spread.ads * prod('spreadAds'),
      move: d.spread.move,
    },
    tracerColor: am.color || 0xffd27a,
  };
  s.fireInterval = 60 / d.rpm;
  return s;
}

// Dano em função da distância (queda linear após o alcance efetivo).
export function damageAtRange(stats, dist) {
  if (dist <= stats.range) return stats.damage;
  const t = Math.min(1, (dist - stats.range) / (stats.range * 1.5));
  return stats.damage * (1 - t * (1 - stats.minMul));
}

// Multiplicadores de dano por região corporal.
export const REGION_MUL = { head: 1, chest: 1, stomach: 0.9, arm: 0.7, leg: 0.65 };
export function regionDamage(stats, base, region) {
  if (region === 'head') return base * stats.headMul;
  return base * (REGION_MUL[region] ?? 1);
}

// Materiais: densidade = custo de penetração por centímetro.
export const MATERIALS = {
  concrete: { name: 'Concreto', density: 2.6, color: 0x8c8c88, sound: 'hard', spark: false },
  brick: { name: 'Tijolo', density: 2.0, color: 0x8a4b35, sound: 'hard', spark: false },
  metal: { name: 'Metal', density: 3.4, color: 0x5d646b, sound: 'metal', spark: true },
  sheetmetal: { name: 'Chapa metálica', density: 1.6, color: 0x7a8288, sound: 'metal', spark: true },
  wood: { name: 'Madeira', density: 0.45, color: 0x8a6239, sound: 'wood', spark: false },
  glass: { name: 'Vidro', density: 0.2, color: 0x9fd0e6, sound: 'glass', spark: false },
  sandbag: { name: 'Saco de areia', density: 1.4, color: 0xa89366, sound: 'soft', spark: false },
  dirt: { name: 'Terra', density: 5, color: 0x6b5a3e, sound: 'soft', spark: false },
  rock: { name: 'Rocha', density: 5, color: 0x77736c, sound: 'hard', spark: false },
  foliage: { name: 'Folhagem', density: 0.05, color: 0x2f5a2a, sound: 'soft', spark: false, seeThrough: false },
  flesh: { name: 'Corpo', density: 0.9 },
};

// Custo de atravessar 'thickness' metros de material.
export function penetrationCost(material, thickness) {
  const m = MATERIALS[material] || MATERIALS.concrete;
  return m.density * thickness * 100;
}
