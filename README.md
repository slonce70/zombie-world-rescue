# 🧟 Операція: Порятунок Світу

3D-екшен проти зомбі просто у браузері: кампанія на 12 країн, «Живий фронт», Експедиції, кооператив до 4 гравців, Шторм, Ліга, хмарний сейв і PWA.

🎮 **Грати:** https://slonce70.github.io/zombie-world-rescue/

Працює на комп'ютері, телефоні та планшеті. Інтерфейс доступний українською, англійською і російською.

## Поточна версія

**v504** — велике бойове оновлення «Нестримний»:

- тримай серію вбивств і відкривай три рівні бойового імпульсу: x5, x10 та x20;
- отримуй реальні бонуси до швидкості, шкоди, темпу вогню й перезарядки;
- стеж за живою шкалою часу: без нового вбивства серія та сила згаснуть;
- заробляй більше монет і бий власний рекорд комбо.

На x20 герой стає «Нестримним»: +50% шкоди, +25% швидкості та +40% темпу стрільби й перезарядки. Система працює у звичайних боях кампанії без нових кнопок — однаково на комп'ютері й телефоні.

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
