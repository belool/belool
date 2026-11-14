// ================================================================
// DIRECTOR — observa o estilo do jogador e adapta a tática da IA.
// Perfis: campeiro (parado/atirando de longe), agressivo (avança,
// abates curtos), atirador (abates longos), granadeiro.
// ================================================================

export class Director {
  constructor(game) { this.game = game; this.reset(); }
  reset() {
    this.stillTime = 0; this.moveTime = 0;
    this.killsShort = 0; this.killsLong = 0; this.headshots = 0; this.kills = 0;
    this.shots = 0;
    this.profile = 'equilibrado';
    this.tactics = { flank: 0.35, grenade: 0.25, hold: 0.3, smoke: 0.15, push: 0.3 };
    this.lastPos = null;
  }
  onPlayerShot() { this.shots++; }
  onPlayerKill(e) {
    this.kills++;
    if (e.dist !== undefined) { if (e.dist < 15) this.killsShort++; else if (e.dist > 40) this.killsLong++; }
    if (e.headshot) this.headshots++;
  }
  update(dt) {
    const p = this.game.player;
    if (!p || !p.alive) return;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp < 0.5) this.stillTime += dt; else this.moveTime += dt;
    // Decaimento lento (memória recente pesa mais)
    const decay = Math.exp(-dt / 90);
    this.stillTime *= decay; this.moveTime *= decay;
    this.killsShort *= Math.exp(-dt / 120); this.killsLong *= Math.exp(-dt / 120);
    const total = this.stillTime + this.moveTime + 1e-3;
    const camping = this.stillTime / total;
    let profile = 'equilibrado';
    const t = { flank: 0.35, grenade: 0.25, hold: 0.3, smoke: 0.15, push: 0.3 };
    if (camping > 0.6 && total > 20) {
      profile = 'campeiro';
      t.flank = 0.7; t.grenade = 0.55; t.push = 0.5; t.hold = 0.15;
    } else if (this.killsShort > this.killsLong + 2) {
      profile = 'agressivo';
      t.hold = 0.65; t.flank = 0.25; t.push = 0.1; t.grenade = 0.4;
    } else if (this.killsLong > this.killsShort + 2) {
      profile = 'atirador';
      t.smoke = 0.55; t.flank = 0.6; t.push = 0.45; t.hold = 0.1;
    }
    this.profile = profile;
    this.tactics = t;
  }
}
