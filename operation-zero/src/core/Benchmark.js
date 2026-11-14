// ================================================================
// BENCHMARK — teste de desempenho reprodutível. Executa cenários
// (incluindo Battle Royale com 100 bots) medindo separadamente o
// tempo de simulação (IA, física, balística) e de renderização.
// Abra index.html?bench para rodar no navegador.
// ================================================================

export const BENCH_SCENARIOS = [
  { name: 'Mata-mata 5x5 (Refinaria)', cfg: { mode: 'tdm', teamSize: 5, map: 'refinery', time: 14, weather: 'clear' }, secs: 20 },
  { name: 'Mata-mata 10x10 (Distrito 9, neblina)', cfg: { mode: 'tdm', teamSize: 10, map: 'district', time: 9, weather: 'fog' }, secs: 20 },
  { name: 'Dominação 6x6 (Floresta, chuva)', cfg: { mode: 'domination', teamSize: 6, map: 'forest', time: 7, weather: 'rain' }, secs: 20 },
  { name: 'Battle Royale 100 jogadores (Ilha Zero)', cfg: { mode: 'br', map: 'island', players: 100, time: 15, weather: 'clear', seed: 11 }, secs: 30 },
];

const pct = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };

export async function runBenchmark(game, scenarios = BENCH_SCENARIOS, opts = {}) {
  const results = [];
  const wasManual = game.manualFrames;
  game.manualFrames = true;
  game.testMode = true;
  game.godMode = true;
  for (const sc of scenarios) {
    const t0 = performance.now();
    game.startMatch(sc.cfg);
    const load = performance.now() - t0;
    game.hud?.show(true); game.menus?.hide();
    const sims = [];
    const N = Math.round(sc.secs * 60);
    for (let i = 0; i < N && game.state === 'playing'; i++) {
      const a = performance.now();
      game.simulate(1 / 60);
      sims.push(performance.now() - a);
      game.events.emit('frame', 1 / 60); game.input.endFrame();
      if (i % 120 === 0) await new Promise((r) => setTimeout(r, 0)); // não travar a aba
    }
    const renders = [];
    const R = opts.renderFrames ?? 30;
    for (let i = 0; i < R; i++) {
      const a = performance.now();
      game.render();
      game.renderer.getContext().finish?.();
      renders.push(performance.now() - a);
    }
    // draw calls apenas da cena principal
    const info0 = game.renderer.info;
    info0.autoReset = false; info0.reset();
    game.renderer.render(game.scene, game.camera);
    const info = { calls: info0.render.calls, triangles: info0.render.triangles };
    info0.autoReset = true;
    results.push({
      scenario: sc.name, bots: game.combatants.length - 1, alive: game.combatants.filter((c) => c.alive).length,
      loadMs: +load.toFixed(0),
      simAvgMs: +(sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(3), simP95Ms: +pct(sims, 0.95).toFixed(3), simMaxMs: +Math.max(...sims).toFixed(2),
      renderAvgMs: +(renders.reduce((a, b) => a + b, 0) / renders.length).toFixed(2), drawCalls: info.calls, triangles: info.triangles,
      shots: game.combatants.reduce((a, c) => a + c.stats.shots, 0), kills: game.combatants.reduce((a, c) => a + c.stats.kills, 0),
    });
    game.quitToMenu();
  }
  game.manualFrames = wasManual;
  game.godMode = false;
  return results;
}
