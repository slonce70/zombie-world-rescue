# 05 — Світ, Фронт і База

**Файли:** `test/terrain-geometry.mjs`, `test/living-front-browser.mjs`,
`test/worldfront-browser.mjs`, `test/living-hq.mjs`

Відомі симптоми:
- `terrain-geometry` — «UKR: river water follows terrain, max +2.37m»
- `living-front-browser` — падає з `TypeError: Cannot read properties of undefined
  (reading 'x')`, і це **найцікавіший випадок**: тест знімає список зомбі в один
  момент (`snapshot`), а пізніше зіставляє з ним поелементно (`restore`) — але список
  устигає вирости, і `baseline.actors[index]` виявляється порожнім. Тобто тест
  припускає, що зомбі не спавняться між двома точками. Це не «протухле очікування»,
  а хибне припущення тесту про світ.
- `living-hq` — «компас Бази оновлюється при повторному вході»

`living-front-browser` тримає джобу `front` — доки він червоний, червона вся джоба.

**Blocked by:** —

**Status:** ready-for-agent

- [ ] Кожен файл зелений локально
- [ ] `living-front-browser` більше не припускає сталості списку зомбі
- [ ] Для кожного сказано: тест відстав, тест хибний, чи гра була зламана
- [ ] Жодна перевірка не вихолощена
