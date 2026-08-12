# 04 — Гість оголошує Загін, хост його санітизує

**What to build:** склад Загону їде в кімнату так само, як пет і гіперзаряди —
гість оголошує, хост звіряє з каталогом і обмежує.

## Чиста функція

`src/squad.js` → `sanitizeSquadNet(ids)`:
- лише рядки, які є в `FRIENDS` і мають архетип (`squadArchetype`);
- без дублів;
- не більше `SQUAD_NET_MAX = 2` (стеля слотів у соло — `squadSlots`, максимум 2).

Чому окрема функція, а не наявна `sanitizeSquad(save)`: та читає сейв ГРАВЦЯ
(врятовані друзі), а хост сейва гостя не має і не повинен мати. Хост перевіряє
лише форму й каталог — рівно як `sanitizeHypers` у `src/net/coop.js`.

## Проведення

- `src/net/coop.js:189` (де `pet: save.activePet`) — додати `sq: sanitizeSquad(save)`;
- ростер (`rosterId`-блок, `:136`) — `squad: sanitizeSquadNet(own(src, 'sq'))`;
- `PROTO_VERSION` 26 → 27 у `src/net/protocol.js` з коментарем про причину.

Спавну тут ще немає — тільки дані. Тікет має бути зеленим сам по собі.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] `sanitizeSquadNet` ріже сміття, дублі й довжину
- [ ] Склад Загону гостя доїжджає в ростер хоста
- [ ] `PROTO_VERSION` = 27, коментар пояснює, що саме змінилось
- [ ] Юніт на `sanitizeSquadNet`, у `quick`
- [ ] `node test/coop.mjs`, `node test/coop-nick.mjs` зелені
