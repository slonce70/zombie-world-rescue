# Правила роботи в цьому репозиторії

## Тести: коротко і по суті

**Не запускати багатогодинні набори.** `npm run test:release` (187 тестів) і
`npm run test:coop-release` (26 кооп-тестів) виконуються 2–3 години на ноутбуці —
це марна трата часу в діалозі. Їх ганяє CI за `workflow_dispatch`.

Локально запускати лише **точкові тести, що стосуються зміни**:

```bash
node test/<конкретний-тест>.mjs      # 1–3 хв
node test/version-sync.mjs           # секунди
node test/i18n-parity.mjs            # секунди
node test/sw-cache.mjs               # секунди
```

Якщо зміна велика — швидше **перевірити в реальному браузері**, ніж ганяти
батарею: `npm run serve` (порт 8741) + `npm run relay` і подивитись руками.

Деплой блокують дві джоби CI — `quick` і `smoke` (`deploy-pages` має
`needs: [quick, smoke]`):

- `quick` (ліміт 12 хвилин, Chromium не ставиться) — тільки секундні гейти без
  браузера: `version-sync`, `sw-cache`, `i18n-parity`, `community-schema`,
  `community-api` і швидкі доменні юніти одним `node --test` (`worldfront-unit`,
  `worldevents`, `expedition-unit`, `season-unit`, `squad-unit`,
  `combat-momentum-unit`). Новий чистий доменний юніт — сюди.
- `smoke` (ліміт 20 хвилин, з Chromium) — `npm test` (`test/smoke.mjs`),
  `combat-reborn`, `save-migration`. Новий браузерний тест сюди додавати лише
  якщо він укладається в хвилину.

Довгі браузерні й кооп-батареї лишаються ручними (`workflow_dispatch`):
`expedition`, `front`, `e2e`, `release-gate`, `coop-gate`.

## Що вже червоне не з нашої вини

Борг попередніх релізів: `test/soul-collector.mjs` і `test/radiation-mode.mjs`
падають тими самими перевірками, що й на baseline (зафіксовано в коміті
`603e052`). «Фронт» (`test/worldfront-unit.mjs`) до цього переліку більше не
належить — його полагоджено у v750.

Перед тим як «лагодити» червоний тест, перевір baseline:

```bash
git worktree add /tmp/baseline HEAD && cd /tmp/baseline && node test/<тест>.mjs
```

Якщо падає й там — це борг попереднього релізу, а не регресія поточної роботи.

## Реліз

- Версію бампити в трьох місцях одразу: `src/main.js` (`APP_VERSION`),
  `version.json`, `sw.js` (`CACHE`). Гейт — `node test/version-sync.mjs`.
- `PROTO_VERSION` у `src/net/protocol.js` бампиться разом з `APP_VERSION`,
  якщо змінився формат кооп-повідомлень.
- Нові ESM-модулі додавати в `SHELL` у `sw.js` — інакше офлайн зламається
  (`node test/sw-cache.mjs`).
- Нові рядки `t('…')` мусять зʼявитись у `src/i18n/en.js` і `src/i18n/ru.js`.
- GitHub Pages деплоїться автоматично при push у `main` після джоб `quick` і `smoke`.
  Cloudflare Worker (`worker/`) деплоїться **окремо** через `wrangler deploy`.

## Мова

Українська — мова оригіналу коду й UI. `en.js`/`ru.js` — переклади.
Коментарі в коді українською, як у решті проєкту.

## Agent skills

### Issue tracker

Локальний markdown: спеки й тікети живуть у `.scratch/<feature-slug>/`.
Див. `docs/agents/issue-tracker.md`.

### Triage labels

Стандартний словник із пʼяти ролей. Див. `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` і `docs/adr/` у корені репозиторію.
Див. `docs/agents/domain.md`.
