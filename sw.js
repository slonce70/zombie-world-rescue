// Service Worker: гра встановлюється на телефон і працює ОФЛАЙН.
// Стратегія: network-first з кеш-фолбеком — онлайн завжди свіже
// (авто-оновлення через version.json не ламається), офлайн — з кеша.
const CACHE = 'zr-cache-v84';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './version.json',
  './manifest.json',
  './vendor/three.module.js',
  './assets/countries.geo.json',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './src/main.js',
  './src/input.js',
  './src/audio.js',
  './src/world.js',
  './src/player.js',
  './src/zombies.js',
  './src/missionpool.js',
  './src/effects.js',
  './src/hud.js',
  './src/shop.js',
  './src/globe.js',
  './src/utils.js',
  './src/countries.js',
  './src/chapter.js',
  './src/touch.js',
  './src/progress.js',
  './src/extras.js',
  './src/storm.js',
  './src/bossrush.js',
  './src/characters.js',
  './src/maps/ukraine.js',
  './src/maps/poland.js',
  './src/maps/germany.js',
  './src/maps/france.js',
  './src/maps/spain.js',
  './src/maps/italy.js',
  './src/maps/turkey.js',
  './src/maps/egypt.js',
  './src/maps/japan.js',
  './src/maps/china.js',
  './src/maps/lostisland.js',
  './src/net/protocol.js',
  './src/net/transport.js',
  './src/net/coop.js',
  './src/net/host.js',
  './src/net/client.js',
  './src/net/remoteplayer.js',
  './src/net/league.js',
  './src/net/lobby.js',
  './src/net/cloudsave.js',
  './src/ui/coopui.js',
  './src/ui/leagueui.js',
  './src/ui/saveui.js',
  './src/ui/hq.js',
  './src/hqbase.js',
  './src/i18n.js',
  './src/i18n/en.js',
  './src/i18n/ru.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // best-effort: один битий файл не валить установку
    await Promise.allSettled(SHELL.map((u) => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // чужі домени (relay, Ліга) — не чіпаємо
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      // тихо оновлюємо кеш у фоні
      if (fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(e.request, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
