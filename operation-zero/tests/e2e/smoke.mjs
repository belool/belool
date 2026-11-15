// ================================================================
// Teste de ponta a ponta no navegador (Playwright + Chromium):
//  - abre o jogo, navega por todas as telas do menu
//  - inicia cada modo, simula partidas e verifica ausência de erros
//  - percorre a campanha inteira nos dois ramos de escolha
//  - roda o benchmark de desempenho
// Uso: npm run e2e   (ou: node tests/e2e/smoke.mjs [--bench-only])
// ================================================================
import { createRequire } from 'node:module';
import { serve } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 8799;
const benchOnly = process.argv.includes('--bench-only');
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };

const server = await serve(PORT);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.dismiss());
await page.goto(`http://localhost:${PORT}/index.html?test`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.world);

if (!benchOnly) {
  console.log('Menu');
  for (const screen of ['campaign', 'multiplayer', 'br', 'survival', 'arsenal', 'operator', 'progress', 'settings']) {
    await page.click(`[data-go="${screen}"]`);
    await page.waitForTimeout(150);
  }
  await page.click('[data-go="arsenal"]');
  for (const slot of ['secondary', 'equipment', 'primary']) { await page.click(`[data-slot="${slot}"]`); await page.waitForTimeout(80); }
  await page.click('[data-go="progress"]');
  for (const t of ['desafios', 'conquistas', 'ranking', 'armas', 'resumo']) { await page.click(`[data-t="${t}"]`); await page.waitForTimeout(60); }
  check(errors.length === 0, 'telas do menu sem erros ' + (errors[0] || ''));

  console.log('Modos de jogo');
  const modes = [
    ['Mata-mata 5x5', { mode: 'tdm', teamSize: 5, map: 'refinery', time: 14, weather: 'clear' }, 40],
    ['Mata-mata 10x10', { mode: 'tdm', teamSize: 10, map: 'district', time: 9, weather: 'fog' }, 30],
    ['Dominação', { mode: 'domination', teamSize: 6, map: 'forest', time: 7, weather: 'rain' }, 60],
    ['Captura', { mode: 'capture', teamSize: 5, map: 'desert', time: 13, weather: 'clear' }, 40],
    ['Sobrevivência', { mode: 'survival', map: 'fortress', time: 21, weather: 'storm' }, 40],
    ['Battle Royale (100)', { mode: 'br', map: 'island', players: 100, time: 15, weather: 'clear', seed: 3 }, 60],
  ];
  for (const [name, cfg, secs] of modes) {
    const r = await page.evaluate(async ({ cfg, secs }) => {
      const g = window.__game; g.manualFrames = true; g.godMode = true;
      g.startMatch(cfg);
      let sim = 0; const N = secs * 60;
      for (let i = 0; i < N && g.state === 'playing'; i++) {
        const a = performance.now(); g.simulate(1 / 60); sim += performance.now() - a;
        g.events.emit('frame', 1 / 60); g.input.endFrame();
        if (i % 300 === 0) await new Promise((res) => setTimeout(res, 0));
      }
      g.render();
      const cs = g.combatants;
      const out = { state: g.state, n: cs.length, shots: cs.reduce((a, c) => a + c.stats.shots, 0), kills: cs.reduce((a, c) => a + c.stats.kills, 0), sim: sim / N, hud: !!g.mode.hud().title };
      g.quitToMenu();
      return out;
    }, { cfg, secs });
    check(r.state === 'playing' && r.hud && r.n > 1, `${name}: partida rodando (${r.n} combatentes, ${r.shots} disparos, ${r.kills} abates, sim ${r.sim.toFixed(2)} ms/quadro)`);
    check(r.shots > 0 || r.kills > 0, `${name}: IA entrou em combate`); // no BR, combates distantes são simulados sem projéteis
  }
  check(errors.length === 0, 'modos sem erros de página ' + (errors[0] || ''));

  console.log('Campanha (dois ramos)');
  for (const [path, krane] of [[0, 0], [1, 1]]) {
    const missions = ['m1', 'm2', path === 0 ? 'm3a' : 'm3b', 'm4'];
    for (const mid of missions) {
      const r = await page.evaluate(async ({ mid, path, krane }) => {
        const g = window.__game; g.manualFrames = true; g.godMode = true;
        const { MISSIONS } = await import('/src/modes/campaignData.js');
        const M = MISSIONS[mid];
        let pending = null; const off = g.events.on('choice', (c) => { pending = c; });
        g.startMatch({ mode: 'campaign', mission: mid, checkpoint: 0, map: M.map, time: M.time, weather: M.weather, timeSpeed: 0 });
        const mode = g.mode;
        const step = (n) => { for (let i = 0; i < n; i++) { if (g.state === 'playing') g.simulate(1 / 60); g.events.emit('frame', 1 / 60); g.input.endFrame(); } };
        const tp = (x, z) => { const q = g.nav.nearestWalkable(x, z, 6); const [wx, wz] = g.nav.center(q[0], q[1]); g.player.pos.set(wx, 0, wz); };
        for (let guard = 0; guard < 40 && !mode.over; guard++) {
          const o = mode.obj; if (!o) { step(30); continue; }
          const idx = mode.idx;
          if (o.type === 'goto') tp(o.at[0], o.at[1]);
          if (o.type === 'eliminate' || o.type === 'boss') for (let k = 0; k < 40 && mode.idx === idx; k++) {
            for (const c of mode.aliveIn(o.groups)) c.takeDamage(c.krane ? c.maxHealth * 0.1 + 50 : 999, { attacker: g.player, region: 'chest', weapon: 'ar4' });
            step(30);
            if (pending) { const c = pending; pending = null; c.pick(krane); }
          }
          if (o.type === 'destroy') { for (const t of mode.targets) { tp(t.x, t.z); mode.interact(g.player); } tp(mode.targets[0].x, mode.targets[0].z - 15); step(60 * 8); }
          if (o.type === 'defend') { tp(o.at[0], o.at[1]); step(60 * (o.duration + 2)); }
          if (o.type === 'collect' || o.type === 'rescue') { tp(o.at[0], o.at[1]); mode.interact(g.player); }
          if (o.type === 'choice') { step(60 * 12); if (pending) { const c = pending; pending = null; c.pick(path); } }
          step(60);
        }
        off();
        const out = { over: mode.over, done: !!g.profile.campaign.completed[mid], choices: { ...g.profile.campaign.choices } };
        g.quitToMenu();
        return out;
      }, { mid, path, krane });
      check(r.over && r.done, `Missão ${mid} concluída (escolhas: ${JSON.stringify(r.choices)})`);
    }
    await page.evaluate(() => { const g = window.__game; g.profile.campaign = { unlocked: 1, completed: {}, choices: {}, checkpoint: null }; });
  }
  check(errors.length === 0, 'campanha sem erros de página ' + (errors[0] || ''));
}

console.log('Benchmark de desempenho');
const bench = await page.evaluate(async () => { const { runBenchmark } = await import('/src/core/Benchmark.js'); return runBenchmark(window.__game, undefined, { renderFrames: 5 }); });
console.table(bench.map((b) => ({ cenario: b.scenario, bots: b.bots, 'sim média ms': b.simAvgMs, 'sim p95 ms': b.simP95Ms, 'sim máx ms': b.simMaxMs, 'draw calls': b.drawCalls, abates: b.kills })));
for (const b of bench) check(b.simP95Ms < 8, `${b.scenario}: simulação p95 ${b.simP95Ms} ms < 8 ms (orçamento de 60 FPS)`);
check(errors.length === 0, 'sem erros de página ' + (errors[0] || ''));

await browser.close();
server.close();
console.log(failures ? `\n${failures} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(failures ? 1 : 0);
