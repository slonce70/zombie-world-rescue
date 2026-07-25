# v700 — Операции сообщества

Issues: [#110 shared schema](https://github.com/slonce70/zombie-world-rescue/issues/110),
[#111 runtime safety](https://github.com/slonce70/zombie-world-rescue/issues/111),
[#112 Community API](https://github.com/slonce70/zombie-world-rescue/issues/112),
[#113 catalog/solo](https://github.com/slonce70/zombie-world-rescue/issues/113),
[#114 co-op](https://github.com/slonce70/zombie-world-rescue/issues/114),
[#115 release](https://github.com/slonce70/zombie-world-rescue/issues/115).

## Цель

Операции сообщества превращают существующий редактор карт в безопасный цикл, где
игроки создают ценность друг для друга:

> создать карту → проверить прохождением → опубликовать неизменяемую ревизию →
> поделиться точной ссылкой → пройти соло или вместе → получить реакции и
> статистику → попасть в замороженную подборку недели.

Обновление переиспользует `startLevel`, `CustomMapMode`, Worker REST API, Lobby и
host-authoritative co-op. Новый движок, аккаунты, валюта, чат и свободный UGC не
добавляются.

## 1. Продуктовый контракт

### Доступ

- Карточка «Операции сообщества» всегда доступна в группе `operations`.
- Любой игрок может проходить Base- и Plus-карты без покупки редактора.
- Базовый редактор автоматически открывается после первой освобождённой страны
  через существующий `save.upgrades.mapeditor`.
- `mapeditorplus` остаётся монетной целью за 15 000 и открывает второй слот и
  Plus-контент.
- Чужие карты никогда не записываются в `customMap`, `customMap2` или новый
  permanent save key.

### Публикация и ревизии

- На один CID существует максимум две логические карты: по одной на slot `0` и
  `1`.
- У логической карты стабильный `mapId` из восьми безопасных символов.
- Каждая публикация создаёт новую неизменяемую числовую `revision`.
- Повторная публикация того же slot сохраняет `mapId`, повышает revision и
  начинает статистику новой ревизии с нуля.
- Точная ссылка: `?community=AB7K2MNP&r=3`. Ссылка без `r` открывает текущую
  ревизию.
- Старые exact links работают после republish, пока карта не unpublished,
  quarantined или disabled.
- Название строится только из фиксированных enum: biome, primary quest и map ID.
  Свободного названия, описания и публичного ника автора нет.
- Publish доступен только после успешного локального проверочного прохождения
  exact snapshot. Proof живёт только в памяти клиента и является UX-гейтом, а не
  серверным античитом.
- Автор может снять карту с публикации. Все старые ссылки намеренно перестают
  работать; следующая публикация создаёт новую ревизию под прежним `mapId`.

### Реакции, жалобы и модерация

Разрешена одна реакция на player/revision с возможностью заменить или удалить:

- `fun`;
- `challenging`;
- `beautiful`.

Причины жалобы ограничены enum:

- `inappropriate`;
- `broken`;
- `spam`.

После трёх уникальных жалоб логическая карта становится `quarantined`, исчезает
из каталогов и exact links для остальных и остаётся видимой владельцу во вкладке
`My`. Republish запрещён до admin restore. Минимальный admin endpoint использует
существующий `ADMIN_KEY` и поддерживает restore/disable; отдельная moderation UI
не входит в v700.

### Weekly

- Worker вычисляет UTC `weekId` и при первом запросе недели один раз фиксирует до
  шести exact `mapId + revision`.
- Кандидаты — активные текущие ревизии; сортировка:
  `externalCompletions * 2 + reactions`, затем свежесть.
- В подборке максимум одна карта одного owner hash.
- Подборка не дополняется и не заменяется посреди недели.
- Первая победа на чужой карте из weekly выдаёт 25 существующих кристаллов один
  раз на server week ID.
- Идемпотентность обеспечивают SQL `weekly_claims` и локальный
  `save.weekly["community:<weekId>"]`.
- Собственная карта не даёт награду и реакцию.

### Статистика автора

В `My` для текущей ревизии показываются:

- внешние run-сессии;
- уникальные внешние игроки, завершившие карту;
- три счётчика реакций;
- номер ревизии;
- статус active/unpublished/quarantined/disabled.

Публичные профили, рейтинг авторов, подписчики и creator payouts не добавляются.

## 2. Безопасная схема карты

Один pure ESM-модуль `worker/community-schema.mjs` используется браузером,
Worker и dev relay. Он не зависит от DOM, Three.js, локализации, Cloudflare
storage или Node APIs.

Экспорты:

- `COMMUNITY_SCHEMA_VERSION = 1`;
- allowlists объектов, quests, zombie types, reactions и reports;
- Base/Plus limits и радиусы объектов;
- `sanitizeCustomMap(raw)` для мягкой миграции локального save;
- `validateCustomMap(raw, { profile, mapSize })` для строгих внешних границ;
- `validateCustomPlacement(map, candidate, { plus, mapSize })` для editor;
- `deriveCustomMapTier(map)`;
- `sanitizeCommunitySnapshot(raw)`;
- `communityWeekId(timestamp)`.

Разрешённые поля карты:

- root: только `biome`, `objects`;
- object: `type`, `x`, `z`, `ry`;
- task дополнительно: `quest`;
- zombie дополнительно: `zombieType`.

Разрешённые значения:

- biome: `summer`, `snow`;
- object type: `house`, `tree`, `lake`, `zombie`, `rock`, `task`, `airdrop`,
  `church`, `largehouse`;
- quest: `rescue`, `collect`, `repair`, `lights`, `elites`, `warehouse`,
  `rebuild`;
- zombie type: `walker`, `runner`, `tank`, `spitter`, `shield`, `moonbrute`.

Инварианты:

- числа — только finite number; numeric strings, clamp и тихое исправление на
  внешней границе запрещены;
- draft допускает 0–3 tasks, publication/community требует 1–3;
- Base — максимум 120 объектов, Plus — 140;
- `airdrop <= 2`, `church <= 1`, `largehouse <= 5`;
- boundary, spawn clearance и overlap учитывают фактический `mapSize`;
- strict validator отклоняет payload целиком при первом нарушении;
- tier выводится из содержимого: Plus при snow, >120 объектов, airdrop/church,
  rebuild или zombie type, отличном от walker.

Опубликованный snapshot фиксирует всё, что влияет на прохождение:

```js
cm: {
  v: 1,
  id: mapId,
  revision,
  tier,
  mapSize,
  mapStyle,
  data: sanitizedMap,
}
```

## 3. Серверный контракт

### Durable Object

`worker/community.mjs` экспортирует SQLite Durable Object `Community`.
`worker/relay-worker.js` реэкспортирует класс и маршрутизирует `/community/*` в
один глобальный instance `env.COMMUNITY.idFromName("community")`. В
`worker/wrangler.toml` добавляются binding `COMMUNITY` и additive migration `v6`.
KV, R2 и новые dependencies не нужны.

### Identity и privacy

- Identity — существующий CID, проверяемый существующим regex.
- В SQL записывается только `SHA-256(cid)` через Web Crypto; raw CID не хранится.
- CID, owner hash и map payload не возвращаются в list response, URL или Lobby
  summary.
- Server не проверяет Plus entitlement: tier вычисляется из карты.
- Mutation endpoints применяют production-origin CORS, endpoint body limits,
  rate limits и exact field allowlists.

### SQLite

- `maps`: stable identity, owner hash/slot, current revision и status;
- `revisions`: immutable validated snapshot metadata и canonical JSON;
- `revision_stats`: external runs/completions, reactions и reports;
- `runs`: idempotent run sessions;
- `completions`: unique player/revision completion gate;
- `reactions`: одна реакция player/revision;
- `reports`: одна жалоба player/revision;
- `weekly_entries`: frozen exact entries;
- `weekly_claims`: idempotent reward claim.

Publish, reaction swap, first external run/completion, quarantine threshold,
weekly freeze и weekly claim выполняются транзакционно.

### REST API

Identity-bearing запросы используют POST, чтобы CID не попадал в query string.

- `GET /community/health`;
- `POST /community/publish` `{cid, slot, map, mapSize, mapStyle}`;
- `POST /community/unpublish` `{cid, mapId}`;
- `POST /community/list` `{cid, tab}`;
- `POST /community/map` `{cid, mapId, revision?}`;
- `POST /community/run/start` `{cid, mapId, revision, runId, coop}`;
- `POST /community/complete` `{cid, mapId, revision, runId, coop}`;
- `POST /community/react` `{cid, mapId, revision, reaction|null}`;
- `POST /community/report` `{cid, mapId, revision, reason}`;
- `POST /community/admin/status` `{key, mapId, status}`.

Каталоги `weekly|new|popular|my` возвращают максимум 20 items без map payload.
`external_runs` растёт один раз при первом non-owner participant в run,
`external_completions` — один раз на уникальный non-owner player/revision.
Reaction разрешена только после completion exact revision.

### Limits и dev relay

- Community publish body: 32 KiB.
- Canonical map payload должен помещаться в WS limit 64 KiB.
- SaveVault payload повышается с 24 до 64 KiB, wrapper — до 96 KiB.
- Dev relay принимает endpoint-specific body limits: 4 KiB для старых API,
  32 KiB для community, 96 KiB для SaveVault.
- Publish: короткий cooldown на slot и не более 10 публикаций/CID/UTC-day;
  дополнительный IP ceiling повторяет существующий in-memory pattern.
- `relay/dev-relay.mjs` зеркалит production API и использует тот же strict schema.

## 4. Клиентский контракт

Новые модули:

- `src/net/community.js` — fail-soft API client через существующие `apiBase()` и
  `ensureCid()`;
- `src/ui/communityui.js` — каталог, deep links, verify/publish, solo/co-op start,
  result, reactions, reports и `My`;
- `src/ui/share.js` — общий fallback
  `navigator.share → clipboard.writeText → toast`.

### UI

- В `src/modes.js` добавляется 19-я карточка `community` в `operations`.
- Отдельный catalog dialog содержит tabs Weekly/New/Popular/My и явные состояния
  loading/empty/error/retry.
- Отдельный result dialog содержит stats и контекстные Publish/Retry/Catalog/
  Room/Share/Reaction/Report actions.
- Карта каталога — `<article>` с отдельными native buttons, без вложенных buttons.
- Dialogs имеют `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape, focus
  return, `aria-live="polite"`, `aria-pressed`, `:focus-visible` и touch targets
  не меньше 44 px.
- Украинский остаётся source language; exact keys добавляются в en/ru.

### Verify → publish

1. Editor строго валидирует saved snapshot с текущими mapSize/mapStyle.
2. Snapshot сохраняется в slot и memory-only `pendingPublish`.
3. Запускается exact local run с `level.noProgress=true`.
4. Publish появляется только после успешного completion.
5. API возвращает stable mapId/revision и exact share link.
6. Death, exit и reload уничтожают pending proof.

### Deep links и offline

Boot route priority: `coopjoin > community > country`.

- `?community=CODE&r=N` загружает exact snapshot до создания World.
- Invalid/unavailable remote map показывает controlled error и никогда не
  fallback-ится на local slot.
- Share URL содержит только map ID и revision.
- Потеря сети не прерывает уже загруженный run; start/complete/react работают
  fail-soft и могут быть повторены с тем же idempotency key.
- Weekly reward начисляется только после подтверждения Worker.
- Локальный editor и local maps остаются доступны offline; remote library в PWA
  или save не создаётся.

## 5. Runtime и прогрессия

### Ранняя trust boundary

`Game._buildLevel()` различает local slot, author verification и remote snapshot.
Remote payload строго проверяется до чтения biome/mapSize/mapStyle и создания
World/Zombies. Remote invalid завершается controlled error без local fallback.
Snapshot tier/mapSize/mapStyle обязательны для solo, host и guest.

### `level.noProgress`

Editor, local custom play, verification и community run устанавливают:

- `noProgress = true`;
- `noShop = true`;
- `noCoinDrops = true`.

Root guards предотвращают изменение coins, XP, daily/weekly quest progress,
chapter/campaign progress, bestiary, permanent stats, missionRuns, stars,
records и unlock rewards. Combo остаётся визуальным. Custom airdrop даёт только
run-local heal/ammo. `saveGame()` не становится global no-op: editor должен
сохранять карту, а подтверждённая weekly reward — прогресс.

### Tier, authority и result

`CustomMapMode` разделяет:

- `editorPlus` — право размещать Plus content;
- `tier` — правила exact snapshot;
- `authority/mirror` — право менять dynamic mission state.

Published Plus не зависит от save зрителя. Custom boss death сначала вызывает
`CustomMapMode.onBossDied()` и community result, не campaign victory/rewards.
Идемпотентный `_endCommunityMap(won)` показывает отдельный result и не вызывает
campaign/solo-mode/co-op-win reward paths.

## 6. Co-op wire contract

`PROTO_VERSION` повышается с 23 до 24. Каждый start spec получает `runId`,
созданный общим helper в `src/net/protocol.js`.

Community snapshot передаётся в `cfg`, `welcome` и `start`. Full map не попадает
в invite URL или public Lobby response. Lobby announce содержит только mode,
`country=CUSTOM`, build/room/host/player count.

### Trust и reconnect

- Guest принимает session commands только от host `pid=1`.
- Malformed `cm` отклоняется без local fallback.
- После reconnect host повторно отправляет текущий start.
- Тот же `runId` не rebuild-ит level и запрашивает full state.
- Новый `runId` завершает старый level и строит новый.
- Guard общий для campaign, Expedition, Front и community.

### Host authority

Host и guest строят одинаковые static props/colliders, но только authority
создаёт и меняет zombies, tasks, airdrops, boss и completion.

`CustomMapMode` реализует существующий mission contract:

- `netState()`;
- `netFullState()`;
- `applyNet()`;
- `applyNetFull()`.

Guest interactions используют один новый `kind: "cmap"` в `HostNet._onUse()`.
Host проверяет integer indexes, phase, one-shot state и distance через existing
`near`; координатам guest не доверяет. Hold interactions используют `PF.HOLDE`.
Mid-join/reconnect восстанавливают task state, masks, airdrops, boss и done.

Каждый participant отправляет собственный `/community/complete` с exact revision
и общим runId, чтобы получить индивидуальный reaction gate и eligible weekly
reward.

## 7. Acceptance gates

### Schema/API

1. Exact keys, finite numbers, enum, counts, scaled boundary, spawn clearance и
   overlap проверяются одним shared module.
2. Publish slot создаёт revision 1; republish сохраняет mapId и создаёт revision
   2; old exact revision неизменна.
3. Второй slot создаёт второй mapId; третья логическая карта невозможна.
4. Unpublish скрывает все старые links; следующая публикация активирует только
   новую revision.
5. CID и owner hash отсутствуют во всех public responses.
6. Reaction create/change/remove и report dedup/quarantine корректны и
   идемпотентны.
7. Weekly frozen, одна карта на owner, reward только non-owner и один раз/week.
8. Catalog возвращает максимум 20 items без map payload.

### Browser solo

1. Fresh player проходит опубликованную Base/Plus карту без editor entitlement.
2. Base editor открывается после первой страны; Plus остаётся за 15 000.
3. Invalid/empty map нельзя проверить и опубликовать.
4. Publish появляется только после победы и не переживает reload.
5. Exact old revision работает после republish; invalid remote не fallback-ится.
6. Remote map не попадает в save/localStorage.
7. Real custom `bossDied` открывает community result, не campaign victory.
8. Non-weekly custom/community run не меняет permanent save.
9. Weekly reward выдаётся один раз; own map не даёт reward/reaction.
10. Offline/error/retry, focus, Escape, live regions и touch sizes проверены.

### Co-op/adversarial

1. Host/guest получают одинаковый strict snapshot, tier, mapSize/mapStyle и runId.
2. Guest не создаёт dynamic mission state.
3. One-shot/hold interactions host-authoritative и distance-checked.
4. Mission masks/progress/airdrop/boss/done синхронизируются snapshots.
5. Same-run reconnect не rebuild-ит; new-run reconnect rebuild-ит.
6. Mid-join восстанавливает exact mission/boss state.
7. Guest не может подделать `cfg/start/lvlend/end/vict` для другого guest.
8. Public Lobby не содержит full map или CID.
9. Каждый participant получает собственный completion response.

### Release

- Максимальный save с двумя 140-object maps проходит 64 KiB Worker/dev relay
  round-trip.
- i18n parity, version sync и SW shell зелёные.
- Focused community schema/API tests входят в quick CI.
- Полные `test:release` и `test:coop-release` обязательны перед merge.
- Worker migration v6 деплоится первым из проверенного PR head; Pages — после
  успешного health/backward-compatibility gate.

## 8. Rollback

- Client regression: выпустить patch с новым, не уменьшенным cache version;
  Community DO и данные оставить.
- Worker regression: сначала отключить v700 client path, затем выполнить
  `wrangler rollback <previous-id>`.
- Migration v6 additive; таблицы при rollback не удаляются.
- Community API fail-soft: editor, campaign и старые co-op modes продолжают
  работать.

## 9. Не входит в v700

- OAuth/email/password accounts и server entitlement Plus.
- Новая валюта, creator payouts и Battle Pass.
- Свободные titles/descriptions/comments/chat/images/URLs/scripts.
- Публичные author nicks/profiles/followers/leaderboards.
- Search, tags, thumbnails и pagination больше 20.
- Offline library, remote maps в save и remix чужой карты.
- Proof-of-play как античит и сложный recommendation algorithm.
- Автозамена quarantined weekly entry и moderation dashboard.
- Новый router, transport, state machine или mission engine.
