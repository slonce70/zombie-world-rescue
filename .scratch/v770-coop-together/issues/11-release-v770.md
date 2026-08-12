# 11 — Реліз v770

**What to build:** зібрати реліз.

- `APP_VERSION` у `src/main.js`, `version.json`, `CACHE` у `sw.js` → 770
  (гейт `node test/version-sync.mjs`);
- `PROTO_VERSION` = 27 приїхав тікетом 04 — перевірити, що бамп на місці;
- нові ESM-модулі (якщо зʼявились) — у `SHELL` у `sw.js`
  (гейт `node test/sw-cache.mjs`);
- `CHANGELOG.md` — секція v770 дитячою українською, як v752 і v760;
- перевірити текст відмови старому клієнту (`why: 'build'`, `src/net/coop.js:744`):
  дитина мусить прочитати «онови сторінку», а не побачити мовчазний збій.

**Blocked by:** усі попередні

**Status:** ready-for-agent

- [ ] Три місця версії збігаються
- [ ] `node test/version-sync.mjs`, `node test/sw-cache.mjs`, `node test/i18n-parity.mjs` зелені
- [ ] CHANGELOG написаний для дитини, а не для розробника
- [ ] Стара вкладка отримує зрозуміле повідомлення
