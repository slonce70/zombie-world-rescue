# 08 — Реліз v760: бамп версії й changelog

**What to build:** фінальний тікет релізу. Версія бампиться **в трьох місцях одразу**
(`CLAUDE.md`), інакше зламається авто-оновлення й офлайн-кеш:

- `src/main.js` — `APP_VERSION`
- `version.json` — поле `v`
- `sw.js` — `CACHE`

`PROTO_VERSION` у `src/net/protocol.js` **лишається 26**: формат кооп-повідомлень у цьому
релізі не змінюється (пети й Загін по дроту — це v770). Старі вкладки далі заходять у кімнати.

Нові ESM-модулі (листівка майже напевно додасть один) мусять потрапити в `SHELL` у `sw.js` —
гейт `node test/sw-cache.mjs`.

Changelog пишеться з погляду гравця, мовою, зрозумілою дитині й батькові.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07 — їде останнім.

**Status:** done

- [ ] `APP_VERSION`, `version.json`, `sw.js` CACHE = 760
- [ ] `PROTO_VERSION` лишився 26
- [ ] Нові модулі додані в `SHELL`
- [ ] `node test/version-sync.mjs` зелений
- [ ] `node test/sw-cache.mjs` зелений
- [ ] `node test/i18n-parity.mjs` зелений
- [ ] `CHANGELOG.md` має розділ v760 з людськими формулюваннями
