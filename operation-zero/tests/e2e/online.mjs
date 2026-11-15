// ================================================================
// Teste do multijogador online: dois navegadores (anfitrião e cliente)
// conectados pelo servidor de salas. Verifica saguão, partida, disparos
// do cliente causando dano no anfitrião, morte/renascimento do cliente,
// saque no Battle Royale e loja cooperativa na Sobrevivência.
// Uso: node tests/e2e/online.mjs
// ================================================================
import { createRequire } from 'node:module';
import { serve } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 8798;
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) failures++; };

const server = await serve(PORT, '127.0.0.1');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 450 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.goto(`http://localhost:${PORT}/index.html?test`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.world);
  await page.evaluate(() => { window.__game.manualFrames = true; });
  return page;
}
const A = await open('anfitrião'), B = await open('cliente');
// avança os dois jogos alternadamente (as mensagens trafegam entre os passos)
async function run(secs) {
  const steps = Math.round(secs * 20);
  for (let i = 0; i < steps; i++) {
    for (const P of [A, B]) await P.evaluate(() => { const g = window.__game; for (let k = 0; k < 3; k++) { if (g.state === 'playing') g.simulate(1 / 60); g.events.emit('frame', 1 / 60); g.input.endFrame(); } });
    await new Promise((r) => setTimeout(r, 5));
  }
}

console.log('Saguão');
const code = await A.evaluate(async () => (await window.__game.net.hostRoom('Anfitriao')).code);
check(/^[A-Z0-9]{5}$/.test(code), `sala criada (${code})`);
await B.evaluate(async (code) => { await window.__game.net.joinRoom(code, 'Convidado'); }, code);
await A.waitForFunction(() => window.__game.net.lobby.players.length === 2);
await B.waitForFunction(() => window.__game.net.lobby.players.length === 2);
const teams = await A.evaluate(() => window.__game.net.lobby.players.map((p) => p.team));
check(teams[0] !== teams[1], `jogadores em equipes opostas no mata-mata (${teams})`);

async function startMatch(patch) {
  await A.evaluate((patch) => { const n = window.__game.net; n.setLobby(patch); n.startHostMatch(); }, patch);
  await B.waitForFunction(() => window.__game.state === 'playing' && window.__game.netClient, null, { timeout: 30000 });
  await run(1);
}

console.log('Mata-mata 5x5 online');
await startMatch({ modeKey: 'tdm5', map: 'refinery', time: 14, weather: 'clear' });
const info = await B.evaluate(() => { const g = window.__game; return { n: g.combatants.length, proxies: g.mode.proxies.size, team: g.player.team }; });
const hostInfo = await A.evaluate(() => { const g = window.__game; return { n: g.combatants.length, remote: g.combatants.filter((c) => c.remote).length }; });
check(info.n === hostInfo.n && hostInfo.n === 10, `mesmos 10 combatentes nos dois lados (cliente ${info.n}, anfitrião ${hostInfo.n}, remotos ${hostInfo.remote})`);
// cliente anda: anfitrião vê a nova posição
const before = await B.evaluate(() => { const g = window.__game; g.player.intent; g.input.keys.add('KeyW'); return g.player.pos.toArray(); });
await run(1.5);
const moved = await B.evaluate(() => { const g = window.__game; g.input.keys.delete('KeyW'); return g.player.pos.toArray(); });
await run(0.3);
const seen = await A.evaluate(() => window.__game.combatants.find((c) => c.remote).pos.toArray());
const dist = Math.hypot(moved[0] - before[0], moved[2] - before[2]);
check(dist > 3 && Math.hypot(seen[0] - moved[0], seen[2] - moved[2]) < 0.6, `movimento do cliente sincronizado (andou ${dist.toFixed(1)} m)`);
// cliente atira em um inimigo à queima-roupa: o anfitrião aplica o dano
const hit = await (async () => {
  // área aberta conhecida da refinaria; os demais bots ficam longe da linha de tiro
  await B.evaluate(() => { const p = window.__game.player; p.pos.set(30, 0, -60); p.vel.set(0, 0, 0); });
  await run(0.4);
  const target = await A.evaluate(() => {
    const g = window.__game; const r = g.combatants.find((c) => c.remote);
    const e = g.combatants.find((c) => c.team !== r.team && c.alive && !c.remote && !c.isPlayer);
    for (const c of g.combatants) if (c.brain) { c.brain.update = () => { c.intent.forward = c.intent.right = 0; c.intent.fire = false; }; if (c !== e) c.pos.set(-60 + c.id, 0, 60); }
    e.pos.set(30, 0, -65); e.health = 1000; e.maxHealth = 1000; e.spawnProtect = 0; e.alive = true;
    if (g.player.team === r.team || true) g.player.pos.set(-50, 0, 50);
    return { id: e.id, x: e.pos.x, z: e.pos.z };
  });
  await run(0.4);
  await B.evaluate((t) => { const g = window.__game; const p = g.player; p.yaw = Math.atan2(-(t.x - p.pos.x), -(t.z - p.pos.z)); p.pitch = -0.06; g.input.mouse.left = true; g.input.mouse.leftPressed = true; }, target);
  await run(1);
  await B.evaluate(() => { window.__game.input.mouse.left = false; });
  await run(0.5);
  return A.evaluate((id) => { const g = window.__game; const e = g.combatants.find((c) => c.id === id); return { hp: e.health, hits: g.combatants.find((c) => c.remote).stats.hits }; }, target.id);
})();
check(hit.hp < 1000 && hit.hits > 0, `tiros do cliente causam dano autoritativo no anfitrião (${hit.hits} acertos, vida ${Math.round(hit.hp)})`);
const markers = await B.evaluate(() => window.__game.player.stats.hits);
check(markers > 0, `cliente recebeu confirmação de acerto (${markers})`);
// anfitrião abate o cliente; cliente morre e renasce
await A.evaluate(() => { const g = window.__game; const r = g.combatants.find((c) => c.remote); r.spawnProtect = 0; r.takeDamage(999, { attacker: g.player, region: 'head', weapon: 'ar4' }); });
await run(0.5);
const dead = await B.evaluate(() => !window.__game.player.alive);
check(dead, 'cliente vê a própria morte');
await run(5);
const alive = await B.evaluate(() => window.__game.player.alive && window.__game.player.health === 100);
check(alive, 'cliente renasce após o tempo de espera');
const sync = await B.evaluate(() => { const g = window.__game; return { feed: document.querySelectorAll('#killfeed .kf').length, shots: g.ballistics.list.length + 0 }; });
check(sync.feed > 0, 'feed de abates replicado no cliente');
// anfitrião sai da partida: cliente volta ao saguão
await A.evaluate(() => window.__game.quitToMenu());
await run(0.3);
check(await B.evaluate(() => window.__game.state === 'menu'), 'cliente volta ao menu quando o anfitrião encerra');

console.log('Battle Royale online');
await startMatch({ modeKey: 'br', time: 15, weather: 'clear' });
const br = await B.evaluate(() => { const g = window.__game; return { parachute: g.player.parachute, y: g.player.pos.y, loot: g.mode.lootItems.length }; });
check(br.parachute && br.y > 100 && br.loot > 100, `cliente salta de paraquedas e recebe ${br.loot} itens de saque`);
// coloca o cliente sobre uma arma no chão e coleta
const lootPos = await A.evaluate(() => { const g = window.__game; const it = g.mode.loot.find((x) => x.type === 'weapon' && !x.taken && x.y < 1); return [it.x, it.y, it.z, it.id]; });
await B.evaluate((l) => { const g = window.__game; g.player.parachute = false; g.player.pos.set(l[0], l[1], l[2]); }, lootPos);
await run(0.4);
await B.evaluate(() => window.__game.mode.interact());
await run(0.5);
const got = await B.evaluate(() => window.__game.player.weapons.map((w) => w.id));
check(got.includes(lootPos[3]), `saque coletado pelo cliente (${got.join(', ')})`);
const taken = await B.evaluate(() => window.__game.mode.lootItems.filter((x) => x.taken).length);
check(taken >= 1, 'item some do chão para o cliente');
await A.evaluate(() => window.__game.quitToMenu());
await run(0.3);

console.log('Sobrevivência cooperativa');
await startMatch({ modeKey: 'survival', map: 'fortress', time: 20, weather: 'clear' });
const sv = await A.evaluate(() => { const g = window.__game; return g.combatants.filter((c) => c.remote && c.team === 0).length; });
check(sv === 1, 'cliente entra na mesma equipe');
await A.evaluate(() => { window.__game.mode.points = 5000; });
await run(0.5);
await B.evaluate(() => window.__game.mode.buy('w_titan'));
await run(0.5);
const titan = await B.evaluate(() => window.__game.player.weapons[0].id);
check(titan === 'titan', `compra na loja aplicada ao cliente (${titan})`);
await run(10);
const wave = await B.evaluate(() => window.__game.mode.hud().wave);
check(wave >= 1, `ondas sincronizadas no cliente (onda ${wave})`);
// fim de jogo replicado
await A.evaluate(() => { const g = window.__game; for (const c of g.combatants) if (c.remote || c.isPlayer) { c.spawnProtect = 0; g.godMode = false; c.takeDamage(9999, { attacker: null, region: 'head' }); } });
await run(3);
check(await B.evaluate(() => window.__game.state === 'results'), 'tela de resultados no cliente ao fim da partida');

check(errors.length === 0, 'sem erros de página ' + (errors.slice(0, 3).join(' | ')));
await browser.close();
server.close();
console.log(failures ? `\n${failures} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(failures ? 1 : 0);
