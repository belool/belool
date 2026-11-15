import { Game } from './core/Game.js';
import { HUD } from './ui/HUD.js';
import { Menus } from './ui/Menus.js';
import { TouchControls } from './ui/TouchControls.js';

// Ponto de entrada: cria o jogo, a interface e o cenário do menu.
const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
let game;
try {
  game = new Game(canvas);
} catch (e) {
  document.body.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#eee">Não foi possível iniciar o WebGL: ${e.message}</div>`;
  throw e;
}
game.testMode = params.has('test');
const hud = new HUD(game);
const menus = new Menus(game, hud);
game.hud = hud; game.menus = menus;
game.touch = new TouchControls(game);
game.setupMenuScene();
menus.showHome('home');
game.start();
canvas.addEventListener('click', () => {
  if (game.state === 'playing' && !game.input.locked && !game.shopOpen) game.input.lock();
});
window.__game = game;

// Celular/PWA: libera o áudio no primeiro toque, pausa ao sair do app e registra o service worker.
addEventListener('pointerdown', () => game.audio.init(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing' && !game.testMode) game.pause();
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !params.has('test') && !params.has('bench')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// index.html?bench — executa o teste de desempenho e mostra os resultados.
if (params.has('bench')) {
  import('./core/Benchmark.js').then(async ({ runBenchmark }) => {
    const res = await runBenchmark(game);
    window.__benchResult = res;
    const rows = res.map((r) => `<tr><td>${r.scenario}</td><td>${r.bots}</td><td>${r.simAvgMs}</td><td>${r.simP95Ms}</td><td>${r.renderAvgMs}</td><td>${r.drawCalls}</td><td>${r.kills}</td></tr>`).join('');
    const m = document.getElementById('modal');
    m.classList.remove('hidden');
    m.innerHTML = `<div class="mbox"><h2>Benchmark</h2><table style="width:100%;font-size:13px"><tr><th align=left>Cenário</th><th>Bots</th><th>Sim média (ms)</th><th>Sim p95</th><th>Render (ms)</th><th>Draw calls</th><th>Abates</th></tr>${rows}</table><div class="row" style="margin-top:14px"><button class="btn" onclick="location.href=location.pathname">Fechar</button></div></div>`;
  });
}
