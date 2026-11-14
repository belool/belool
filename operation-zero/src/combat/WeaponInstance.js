import { computeStats } from './weapons.js';

// Estado de runtime de uma arma (munição, recarga, recuo, dispersão).
export class WeaponInstance {
  constructor(id, attachments = {}, ammo = 'fmj', camo = 'none') {
    this.id = id;
    this.attachments = attachments;
    this.ammoType = ammo;
    this.camo = camo;
    this.stats = computeStats(id, attachments, ammo);
    this.mag = this.stats.mag;
    this.reserve = this.stats.reserve;
    this.cooldown = 0;
    this.reloading = 0;     // tempo restante de recarga
    this.reloadTotal = 0;
    this.bloom = 0;         // dispersão acumulada por disparo contínuo
    this.recoilKick = 0;    // usado pela animação do viewmodel
    this.shotsInBurst = 0;
    this.fireMode = this.stats.mode;
    this.fireModeIdx = 0;
    this.needsBolt = 0;     // ação de ferrolho / bombeamento
    this.triggerHeld = false;
    this.burstLeft = 0;
  }
  get isMelee() { return this.stats.mode === 'melee'; }
  cycleFireMode() {
    const modes = this.stats.fireModes;
    if (!modes || modes.length < 2) return false;
    this.fireModeIdx = (this.fireModeIdx + 1) % modes.length;
    this.fireMode = modes[this.fireModeIdx];
    return true;
  }
  canFire() {
    return !this.isMelee ? this.cooldown <= 0 && this.reloading <= 0 && this.mag > 0 && this.needsBolt <= 0 : this.cooldown <= 0;
  }
  startReload() {
    if (this.isMelee || this.reloading > 0 || this.mag >= this.stats.mag || this.reserve <= 0) return false;
    const s = this.stats;
    this.reloadTotal = s.reloadPerShell ? s.reload : this.mag === 0 ? s.reloadEmpty : s.reload;
    this.reloading = this.reloadTotal;
    this.burstLeft = 0;
    return true;
  }
  cancelReload() { this.reloading = 0; }
  // Retorna true quando termina um ciclo de recarga.
  update(dt) {
    this.cooldown -= dt;
    this.needsBolt = Math.max(0, this.needsBolt - dt);
    this.bloom = Math.max(0, this.bloom - dt * 6);
    this.recoilKick = Math.max(0, this.recoilKick - dt * 8);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const s = this.stats;
        if (s.reloadPerShell) {
          this.mag++; this.reserve--;
          if (this.mag < s.mag && this.reserve > 0) { this.reloading = s.reload; this.reloadTotal = s.reload; }
        } else {
          const need = s.mag - this.mag;
          const take = Math.min(need, this.reserve);
          this.mag += take; this.reserve -= take;
        }
        return true;
      }
    }
    return false;
  }
  consume() {
    const s = this.stats;
    this.mag--;
    this.cooldown = s.fireInterval;
    this.bloom = Math.min(this.bloom + 1, 8);
    this.recoilKick = 1;
    if (s.mode === 'bolt' || s.mode === 'pump') this.needsBolt = s.fireInterval * 0.9;
    // Escopeta: disparo interrompe recarga cartucho a cartucho
    if (this.reloading > 0 && s.reloadPerShell) this.reloading = 0;
  }
  addAmmo(mags = 2) { this.reserve = Math.min(this.reserve + this.stats.mag * mags, this.stats.mag * 10 + this.stats.reserve); }
  refill() { this.mag = this.stats.mag; this.reserve = this.stats.reserve; }
}
