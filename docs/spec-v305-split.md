# v305 — Розпил `src/main.js`

Суто **структурний** рефактор без зміни поведінки. `src/main.js` (6199 рядків) містив
кілька непов'язаних відповідальностей; їх винесено у 5 нових модулів. Гра працює
байт-у-байт так само; `main.js` схуднув до 4618 рядків (−1581).

## Правило делегатів (головне)

Методи класу `Game`, чиї тіла винесено, лишаються **тонкими делегатами** — назва й
сигнатура в `Game` ті самі, тіло — один рядок `return fn(this, …)`. Так ЖОДЕН зовнішній
call-site не змінюється: `net/client.js`, `src/net/host.js`, `ui/coopui.js`, DOM-обробники
в конструкторі, тест-хуки й самі тести кличуть ті самі `game._method(...)`.

У винесених тілах зроблено рівно одну заміну: `this.` → `game.` (перший параметр).
Код перенесено ВЕРБАТИМ разом з українськими коментарями; логіку/рядки UI не чіпали.

## Що куди переїхало

| Новий модуль | Що містить | Було в main.js (рядки) |
|---|---|---|
| `src/modes.js` | `SOLO_MODE_GROUPS`, `HARD_VARIANTS`, `MODE_RULES`, `MODIFIERS`, `WEEKLY_MODIFIER_POOL`, `modeIdFromOpts`, `MODE_START_OPTS`, `SOLO_MODES`, `DAILY_CHALLENGE_POOL`, `MODE_MILESTONES` | ~183–464 |
| `src/rewards.js` | `CHEST_REWARDS`, `SUPER_POWERS` + тіла: `grantEliteChestCoop`, `grantGoldenChestCoop`, `rollChestEgg`, `onFriendRescued`, `bumpCamp`, `refreshCampChip`, `openEggFromAlbum`, `feedPetFromAlbum`, `rollCoopSecondary`, `bumpSecondary`, `secondaryDoneToast`, `trySuperPickup`, `spawnSuperMirror`, `updateCoopSuper`, `grantSuperCoop`, `superBannerFor`, `activateSuperPower`, `openMegaboxReward`, `chestCeremony`, `closeChest`, `spawnChestConfetti`, `unlockWeapon` | 70–93 + 3580–4022 |
| `src/ui/album.js` | `renderAlbum`, `skinHint`, `petHint` | 1763–1995 |
| `src/ui/endscreens.js` | `showVictory`, `maybeWorldSaved`, `showWorldSaved`, `grantInfectedWin`, `awardStars`, `claimStarThresholds`, `renderVictoryStars` | 5303–5569 |
| `src/testapi.js` | `buildTestApi(game)` — увесь геттер `get test()` (`const g = this` → `const g = game`) | 5781–6196 |

## Форма експорту / делегатів

- Модульні функції беруть `game` першим аргументом:
  `export function grantEliteChestCoop(game) { … }`, `export function renderAlbum(game) { … }` тощо.
- У `Game` лишається делегат з оригінальним іменем методу:
  `_grantEliteChestCoop() { return grantEliteChestCoop(this); }`,
  `renderAlbum() { return renderAlbum(this); }`,
  `get test() { return buildTestApi(this); }`.
- Колізій немає: у делегата на кшталт `chestCeremony(opts) { return chestCeremony(this, opts); }`
  голе ім'я `chestCeremony` резолвиться у **імпортовану функцію** (лексична область модуля),
  а не в метод (методи доступні лише через `this.`), тож рекурсії не виникає.

## `MODE_RULES` / `MODIFIERS`

Раніше експортувались із `main.js`, але жоден зовнішній файл їх не імпортував.
Тепер `export`-и живуть у `src/modes.js`; `main.js` імпортує їх назад для власного вжитку
(`_buildLevel`, `weeklyModifier` тощо).

## Супутні правки

- `sw.js`: у SHELL додано `./src/modes.js`, `./src/rewards.js`, `./src/testapi.js`,
  `./src/ui/album.js`, `./src/ui/endscreens.js`; `CACHE` → `zr-cache-v305`.
- Версія (потрійний синхрон): `APP_VERSION = 305`, `version.json {"v":305}`, SW cache v305.
  `PROTO_VERSION` не чіпали.

## Верифікація

- `node --input-type=module --check` для всіх 6 файлів — зелено (репо `type:commonjs`,
  тож `.js`-модулі перевіряються як ESM через stdin).
- `test/version-sync.mjs`, `test/i18n-parity.mjs` — зелено.
- Браузерні: `test/album.mjs`, `test/world-saved.mjs`, `test/update10.mjs`, `test/i18n.mjs`
  (+ додатково `super-pickup`, `crate-toast`, `mode-depth`, `stars`) — зелено.
