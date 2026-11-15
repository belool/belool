// Service worker: o jogo funciona offline e pode ser instalado na tela inicial.
// Estratégia: rede primeiro (pega atualizações), cache como reserva.
const CACHE = 'operation-zero-v2';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'vendor/three.module.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/ai/AIBrain.js',
  'src/ai/AIManager.js',
  'src/ai/Director.js',
  'src/ai/Squad.js',
  'src/combat/Ballistics.js',
  'src/combat/Throwables.js',
  'src/combat/WeaponInstance.js',
  'src/combat/weapons.js',
  'src/core/Audio.js',
  'src/core/Benchmark.js',
  'src/core/Events.js',
  'src/core/Game.js',
  'src/core/Input.js',
  'src/core/Save.js',
  'src/core/util.js',
  'src/entities/Combatant.js',
  'src/entities/SoldierModel.js',
  'src/entities/Vehicle.js',
  'src/entities/Viewmodel.js',
  'src/fx/Effects.js',
  'src/main.js',
  'src/modes/BattleRoyale.js',
  'src/modes/Campaign.js',
  'src/modes/ClientMode.js',
  'src/modes/Mode.js',
  'src/modes/Multiplayer.js',
  'src/modes/Survival.js',
  'src/modes/campaignData.js',
  'src/modes/index.js',
  'src/net/Net.js',
  'src/progression/Progression.js',
  'src/ui/HUD.js',
  'src/ui/Menus.js',
  'src/ui/TouchControls.js',
  'src/world/MapBuilder.js',
  'src/world/NavGrid.js',
  'src/world/Textures.js',
  'src/world/Weather.js',
  'src/world/World.js',
  'src/world/maps.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/ws')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
