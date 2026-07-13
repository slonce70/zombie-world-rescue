# 🧟 Операція: Порятунок Світу

3D-екшен проти зомбі просто у браузері: кампанія на 12 країн, «Живий фронт», Експедиції, кооператив до 4 гравців, Шторм, Ліга, хмарний сейв і PWA.

🎮 **Грати:** https://slonce70.github.io/zombie-world-rescue/

Працює на комп'ютері, телефоні та планшеті. Інтерфейс доступний українською, англійською і російською.

## Поточна версія

**v500** — велике оновлення «Живий фронт»:

- після першої звільненої країни відкривається навчальна операція, після трьох — дошка з трьома загрозами;
- кожна операція має три етапи, детермінований Encounter Director, видимого спеціаліста та спільну `RunBuild`-збірку;
- перемога відбудовує країну, будує Rescue Outpost і просуває Медпункт, Майстерню або Радіовежу на Базі;
- нагороди обчислює pure reducer і захищає стабільними claim ID; поразка й abandon не забирають прогрес;
- co-op Front синхронізується хостом через `PROTO_VERSION = 16`, включно з reconnect і блокуванням forged guest rewards;
- статистика лишається локальною; агрегована відправка доступна лише через явний opt-in або `?metrics=1`.

Історія змін: [CHANGELOG.md](CHANGELOG.md). Архітектурні спеки: [docs/](docs/).

Версія релізу синхронізується у `version.json`, `APP_VERSION` та service-worker cache. Front wire format використовує `PROTO_VERSION = 16`.

## Швидкий старт

Потрібні Node.js 22+ і Chromium для Playwright.

```bash
npm ci
npx playwright install chromium
npm run serve
```

Відкрий `http://localhost:8741`.

Для локального коопу в другому терміналі:

```bash
npm run relay
```

Гра приймає `?relay=ws://localhost:8742`. Тестові сценарії використовують `?test&fresh`; dev cloud-save вмикається тільки явним `&cloud` на localhost.

## Перевірки

```bash
npm test
node test/version-sync.mjs
node test/coop-nick.mjs
node test/cloudsave.mjs
npm run test:front
npm run test:release
```

Релізні ранери автоматично знаходять `test/*.mjs`. PR/push блокують focused smoke, Expedition і Front gates; повна батарея і real-combat e2e йдуть щоночі та вручну. Для локального відтворення повного soak shard:

```bash
SHARD_INDEX=0 SHARD_TOTAL=4 SLOW=4 node test/release.mjs
SHARD_INDEX=0 SHARD_TOTAL=4 SLOW=4 RETRY=1 node test/coop-release.mjs
```

Повний порядок публікації та production-перевірки описано у [RELEASE.md](RELEASE.md).

## Архітектура

- Статичний клієнт: JavaScript modules, Three.js, HTML/CSS; збірка не потрібна.
- PWA: `sw.js`, `manifest.json`, shell cache з версією релізу.
- Кооп: host-authoritative модель; клієнти обмінюються намірами, снапшотами та подіями через `src/net/`.
- Production relay: Cloudflare Worker + Durable Objects у `worker/`; WebSocket endpoint — `wss://zr-relay.slonce70.workers.dev`.
- Worker також обслуговує Лігу, публічне лобі та SaveVault. Його деплой окремий від GitHub Pages.
- GitHub Pages: custom Actions workflow; production deploy виконується лише після всіх блокуючих тестів.

## Керування

- `WASD` — рух, миша — приціл, ЛКМ — вогонь.
- `R` — перезарядка, `E` — взаємодія, `G` — граната, `B` — магазин.
- На touch-пристроях гра показує віртуальні органи керування автоматично.

## Ліцензія

[ISC](LICENSE).
