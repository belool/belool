import { TeamDeathmatch, Domination, Capture } from './Multiplayer.js';
import { Survival } from './Survival.js';
import { BattleRoyale } from './BattleRoyale.js';
import { Campaign } from './Campaign.js';

export const MODES = {
  campaign: { cls: Campaign, name: 'Campanha' },
  tdm: { cls: TeamDeathmatch, name: 'Mata-mata em equipes' },
  domination: { cls: Domination, name: 'Dominação' },
  capture: { cls: Capture, name: 'Captura de objetivos' },
  survival: { cls: Survival, name: 'Sobrevivência' },
  br: { cls: BattleRoyale, name: 'Battle Royale' },
};

export function createMode(game, cfg) {
  const M = MODES[cfg.mode];
  if (!M) throw new Error('Modo desconhecido: ' + cfg.mode);
  return new M.cls(game, cfg);
}
