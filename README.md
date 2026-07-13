# 🧟 Операція: Порятунок Світу

3D-екшен проти зомбі просто у браузері: кампанія на 12 країн і фінальний острів, кооператив до 4 гравців, Шторм, Ліга, хмарний сейв і PWA.

🎮 **Грати:** https://slonce70.github.io/zombie-world-rescue/

Працює на комп'ютері, телефоні та планшеті. Інтерфейс доступний українською, англійською і російською.

## Поточна версія

**v307** — стабілізація коопу та релізного контуру:

- недовірені дані ростера канонізуються на вході; prototype-ключі не можуть викликати skin/pet builders;
- production `?test` не читає й не записує реальний cloud-save;
- `coop-elite` чекає готовності state-sync, а не випадкової кількості зомбі;
- усі тести входять у блокуючі автоматично знайдені CI shards;
- GitHub Pages розгортається тільки після зелених release, coop, smoke та e2e jobs.

Історія змін: [CHANGELOG.md](CHANGELOG.md). Архітектурні спеки: [docs/](docs/).

Версія релізу синхронізується у `version.json`, `APP_VERSION` та service-worker cache. Кооп-протокол у v307 не змінювався (`PROTO_VERSION = 14`).

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
npm run test:release
```

Релізні ранери автоматично знаходять `test/*.mjs`. Для локального відтворення CI shard:

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
