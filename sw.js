// Service Worker: гра встановлюється на телефон і працює ОФЛАЙН.
// Стратегія: network-first з кеш-фолбеком — онлайн завжди свіже
// (авто-оновлення через version.json не ламається), офлайн — з кеша.
const CACHE = 'zr-cache-v305';

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
  './src/livingworld.js',
  './src/effects.js',
  './src/hud.js',
  './src/shop.js',
  './src/draft.js',
  './src/runbuild.js',
  './src/globe.js',
  './src/utils.js',
  './src/countries.js',
  './src/chapter.js',
  './src/titles.js',
  './src/stars.js',
  './src/friends.js',
  './src/eggs.js',
  './src/weeklycamp.js',
  './src/touch.js',
  './src/progress.js',
  './src/extras.js',
  './src/storm.js',
  './src/sandstorm.js',
  './src/bossrush.js',
  './src/knockout.js',
  './src/defense.js',
  './src/pvp.js',
  './src/bank.js',
  './src/portal.js',
  './src/maze.js',
  './src/humans.js',
  './src/souls.js',
  './src/worldboss.js',
  './src/radiationmode.js',
  './src/roomkit.js',
  './src/renderkit.js',
  './src/characters.js',
  './src/story/countryStories.js',
  './src/story/npcs.js',
  './src/story/storymissions.js',
  './src/maps/ukraine.js',
  './src/maps/poland.js',
  './src/maps/germany.js',
  './src/maps/france.js',
  './src/maps/spain.js',
  './src/maps/portugal.js',
  './src/maps/italy.js',
  './src/maps/turkey.js',
  './src/maps/sweden.js',
  './src/maps/egypt.js',
  './src/maps/japan.js',
  './src/maps/china.js',
  './src/maps/lostisland.js',
  './src/maps/lab.js',
  './src/turretwar.js',
  './src/modes.js',
  './src/rewards.js',
  './src/testapi.js',
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
  './src/ui/album.js',
  './src/ui/endscreens.js',
  './src/hqbase.js',
  './src/i18n.js',
  './src/i18n/en.js',
  './src/i18n/ru.js',
  './worker/nick.mjs',
  // 🎙️ озвучка Лесі трьома мовами (Gemini TTS): assets/voice/<мова>/<id>.m4a
  // явні літерали — test/sw-cache.mjs звіряє кожен шлях з диском
  './assets/voice/uk/wave.m4a',
  './assets/voice/uk/victory.m4a',
  './assets/voice/uk/defeat.m4a',
  './assets/voice/uk/levelup.m4a',
  './assets/voice/uk/boss.m4a',
  './assets/voice/uk/heal.m4a',
  './assets/voice/uk/combo.m4a',
  './assets/voice/uk/golden.m4a',
  './assets/voice/uk/airdrop.m4a',
  './assets/voice/uk/horde.m4a',
  './assets/voice/uk/megabox.m4a',
  './assets/voice/uk/quest.m4a',
  './assets/voice/uk/powerup.m4a',
  './assets/voice/uk/mission.m4a',
  './assets/voice/uk/boss-ukr.m4a',
  './assets/voice/uk/boss-pol.m4a',
  './assets/voice/uk/boss-deu.m4a',
  './assets/voice/uk/boss-fra.m4a',
  './assets/voice/uk/boss-esp.m4a',
  './assets/voice/uk/boss-prt.m4a',
  './assets/voice/uk/boss-ita.m4a',
  './assets/voice/uk/boss-tur.m4a',
  './assets/voice/uk/boss-swe.m4a',
  './assets/voice/uk/boss-egy.m4a',
  './assets/voice/uk/boss-jpn.m4a',
  './assets/voice/uk/boss-chn.m4a',
  './assets/voice/uk/boss-lost.m4a',
  './assets/voice/uk/boss-lab.m4a',
  './assets/voice/en/wave.m4a',
  './assets/voice/en/victory.m4a',
  './assets/voice/en/defeat.m4a',
  './assets/voice/en/levelup.m4a',
  './assets/voice/en/boss.m4a',
  './assets/voice/en/heal.m4a',
  './assets/voice/en/combo.m4a',
  './assets/voice/en/golden.m4a',
  './assets/voice/en/airdrop.m4a',
  './assets/voice/en/horde.m4a',
  './assets/voice/en/megabox.m4a',
  './assets/voice/en/quest.m4a',
  './assets/voice/en/powerup.m4a',
  './assets/voice/en/mission.m4a',
  './assets/voice/en/boss-ukr.m4a',
  './assets/voice/en/boss-pol.m4a',
  './assets/voice/en/boss-deu.m4a',
  './assets/voice/en/boss-fra.m4a',
  './assets/voice/en/boss-esp.m4a',
  './assets/voice/en/boss-prt.m4a',
  './assets/voice/en/boss-ita.m4a',
  './assets/voice/en/boss-tur.m4a',
  './assets/voice/en/boss-swe.m4a',
  './assets/voice/en/boss-egy.m4a',
  './assets/voice/en/boss-jpn.m4a',
  './assets/voice/en/boss-chn.m4a',
  './assets/voice/en/boss-lost.m4a',
  './assets/voice/en/boss-lab.m4a',
  './assets/voice/ru/wave.m4a',
  './assets/voice/ru/victory.m4a',
  './assets/voice/ru/defeat.m4a',
  './assets/voice/ru/levelup.m4a',
  './assets/voice/ru/boss.m4a',
  './assets/voice/ru/heal.m4a',
  './assets/voice/ru/combo.m4a',
  './assets/voice/ru/golden.m4a',
  './assets/voice/ru/airdrop.m4a',
  './assets/voice/ru/horde.m4a',
  './assets/voice/ru/megabox.m4a',
  './assets/voice/ru/quest.m4a',
  './assets/voice/ru/powerup.m4a',
  './assets/voice/ru/mission.m4a',
  './assets/voice/ru/boss-ukr.m4a',
  './assets/voice/ru/boss-pol.m4a',
  './assets/voice/ru/boss-deu.m4a',
  './assets/voice/ru/boss-fra.m4a',
  './assets/voice/ru/boss-esp.m4a',
  './assets/voice/ru/boss-prt.m4a',
  './assets/voice/ru/boss-ita.m4a',
  './assets/voice/ru/boss-tur.m4a',
  './assets/voice/ru/boss-swe.m4a',
  './assets/voice/ru/boss-egy.m4a',
  './assets/voice/ru/boss-jpn.m4a',
  './assets/voice/ru/boss-chn.m4a',
  './assets/voice/ru/boss-lost.m4a',
  './assets/voice/ru/boss-lab.m4a',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Required shell: якщо файл зник із релізу, install має впасти, а не сховати битий офлайн.
    await Promise.all(SHELL.map((u) => cache.add(u)));
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
