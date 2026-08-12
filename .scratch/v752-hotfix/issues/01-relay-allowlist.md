# 01 — `?relay=` без перевірки віддає хмарний сейв чужому серверу

**What to build:** `relayUrl()` у `src/net/transport.js:12-25` повертає адресу з URL-параметра
`?relay=` як є — без allowlist, без перевірки схеми чи хоста. А `apiBase()` — це та сама адреса
для **всіх** HTTP-викликів: `cloudsave.js`, `league.js`, `lobby.js`, `community.js`,
`frontmetrics.js`.

Експлуатація не потребує кооперативу взагалі: `src/net/cloudsave.js:165-177` вішає
`pagehide`/`visibilitychange` → `navigator.sendBeacon(apiBase() + '/save/put', { cid, data })`.
Дитина відкрила підкинуте посилання на справжню гру й закрила вкладку — весь сейв і `cid`
поїхали на чужий сервер. `cid` — єдиний секрет хмари: хто його має, той власник прогресу.

Після цього тікета `?relay=` приймається тільки там, де це потрібно для розробки, а на
бойовому домені гра завжди говорить із власним сервером.

**Blocked by:** None — can start immediately.

**Status:** done

- [x] `?relay=` (і `localStorage['zr-relay']`, якщо він читається) приймається лише коли
      `location.hostname` — localhost / 127.0.0.1 / порожній (file://)
- [x] На будь-якому іншому хості параметр ігнорується, використовується вшита `DEFAULT_RELAY`
- [x] Локальна розробка не ламається: `npm run serve` + `npm run relay` працюють як раніше
- [x] Перевірка живе в одному місці (`relayUrl()`), а не дублюється по викликах
- [x] Тест: чужий хост відкидається, localhost приймається, бойовий домен дає `DEFAULT_RELAY`
- [x] Новий тест доданий у джобу `quick` (секундний, без браузера)

## Comments

Гард `relayAllowed()` стоїть першим рядком `relayUrl()` — усі виклики (`apiBase()` для
cloudsave/league/lobby/community/frontmetrics і `connect()` для WebSocket) ідуть через нього,
дублювання по викликах немає. `[::1]` додано поруч із `::1` — саме так браузер віддає
hostname для IPv6-літерала (той самий набір, що вже в `cloudsave.js:18`).

Локальна розробка: `npm run serve` віддає гру на `http://localhost:8741`, усі браузерні тести
ходять туди ж — hostname `localhost`, тож `?relay=ws://localhost:8742` діє як раніше
(покрито юнітом, живий браузер не запускався).
