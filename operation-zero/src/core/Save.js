// ================================================================
// SAVE — persistência local (perfil, progresso, configurações,
// campanha e placares). Versionado para migrações futuras.
// ================================================================

const KEY = 'operation-zero-save-v1';
const memory = {};

function storage() {
  try { if (typeof localStorage !== 'undefined') { localStorage.setItem('__oz', '1'); localStorage.removeItem('__oz'); return localStorage; } } catch (e) { /* bloqueado */ }
  return { getItem: (k) => memory[k] ?? null, setItem: (k, v) => { memory[k] = v; }, removeItem: (k) => { delete memory[k]; } };
}

export const DEFAULT_SETTINGS = {
  quality: 'high', renderScale: 1, shadows: true, shadowRes: 2048, viewDistance: 1, particles: 1, fov: 80,
  sensitivity: 1, adsSensitivity: 0.75, invertY: false, master: 0.8, sfx: 0.9, ambient: 0.6, voice: 0.8, voiceTTS: true,
  showFps: true, crosshair: true, fogMul: 1, timeSpeed: 1, difficulty: 'normal',
};

export function defaultProfile() {
  return {
    version: 1,
    name: 'Operador',
    xp: 0,
    rankPoints: 1000, // MMR do ranking competitivo
    stats: { kills: 0, deaths: 0, headshots: 0, matches: 0, wins: 0, shots: 0, hits: 0, playTime: 0, brWins: 0, bestWave: 0 },
    weaponStats: {},  // id -> { kills, headshots }
    loadout: {
      primary: { id: 'ar4', att: { optic: 'none', muzzle: 'none', grip: 'none', mag: 'standard' }, ammo: 'fmj', camo: 'none' },
      secondary: { id: 'p9', att: {}, ammo: 'fmj', camo: 'none' },
      equipment: { frag: 2, smoke: 1, flash: 1 },
    },
    operator: { colors: { uniform: 0x4b5a3a, vest: 0x3a4430, helmet: 0x3f4a33, visor: 0x55aaff }, callsign: 'Zero' },
    achievements: {},
    challenges: null,
    campaign: { unlocked: 1, completed: {}, choices: {}, checkpoint: null },
    leaderboards: { survival: [], br: [] },
  };
}

export const Save = {
  load() {
    const st = storage();
    let data = null;
    try { data = JSON.parse(st.getItem(KEY) || 'null'); } catch (e) { data = null; }
    const prof = defaultProfile();
    if (!data) return { profile: prof, settings: { ...DEFAULT_SETTINGS } };
    return {
      profile: deepMerge(prof, data.profile || {}),
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    };
  },
  write(profile, settings) {
    try { storage().setItem(KEY, JSON.stringify({ profile, settings, savedAt: Date.now() })); return true; } catch (e) { return false; }
  },
  reset() { storage().removeItem(KEY); },
};

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) {
    out[k] = typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}
