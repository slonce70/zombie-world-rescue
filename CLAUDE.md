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

Job `quick` у CI має ліміт 12 хвилин — туди додавати лише секундні гейти
(схема, API, версії, i18n). Браузерні й кооп-тести живуть у `release`/`coop-gate`.

## Що вже червоне не з нашої вини

У гілці v610 частина тестів червона (меч, боси Іспанії/Франції, зірки, Фронт).
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
- GitHub Pages деплоїться автоматично при push у `main` після job `quick`.
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
