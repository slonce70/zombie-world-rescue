# Релізний runbook

## 1. Підготовка

```bash
git status --short --branch
npm ci
npx playwright install chromium
node test/version-sync.mjs
node test/sw-cache.mjs
npm run test:front
```

Номер має збігатися у `version.json`, `src/main.js` (`APP_VERSION`) і `sw.js` (`CACHE`). `PROTO_VERSION` змінюється лише при зміні wire format.

## 2. Локальні гейти

```bash
node test/coop-nick.mjs
SLOW=2 node test/cloudsave.mjs
node test/save-migration.mjs
node test/i18n-parity.mjs
SLOW=2 node test/coop-elite.mjs
```

Повна soak-батарея та реальний UKR playthrough запускаються лише вручну через `workflow_dispatch`
(розкладу в workflow немає); вони не блокують production deploy через довгі мережеві та
real-combat сценарії:

```bash
for i in 0 1 2 3; do SHARD_INDEX=$i SHARD_TOTAL=4 SLOW=4 node test/release.mjs || exit 1; done
for i in 0 1 2 3; do SHARD_INDEX=$i SHARD_TOTAL=4 SLOW=4 RETRY=1 node test/coop-release.mjs || exit 1; done
SLOW=4 node test/e2e.mjs
```

## 3. PR і Worker

Після зеленого PR зафіксувати поточний Worker deployment ID, потім із перевіреного PR head:

```bash
sha=$(git rev-parse --short HEAD)
cd worker
npx wrangler deploy --tag v503 --message "v503 $sha"
```

Worker має бути backward-compatible з попереднім клієнтом. При production-регресії виконати `npx wrangler rollback <previous-version-id>`.

## 4. Gated Pages deploy

Перед першим merge із custom workflow один раз перемкнути Pages:

```bash
gh api repos/slonce70/zombie-world-rescue/pages -X PUT -f build_type=workflow
gh api repos/slonce70/zombie-world-rescue/pages --jq .build_type
```

Push у `main` (і будь-який PR) запускає рівно дві блокуючі джоби — `quick` і `smoke`.
`deploy-pages` має `needs: [quick, smoke]`, тобто стартує лише після успіху обох.

- **`quick`** (ліміт 12 хв, без Chromium) — `version-sync`, `sw-cache`, `i18n-parity`,
  `community-schema`, `community-api` і швидкі доменні юніти одним `node --test`:
  `worldfront-unit`, `worldevents`, `expedition-unit`, `season-unit`, `squad-unit`,
  `combat-momentum-unit`, `runbuild-unit`, `countrypowers-unit`, `tier2-unit`, `stars-unit`.
  Увесь набір локально — менше секунди.
- **`smoke`** (ліміт 20 хв, з Chromium) — `npm test` (`test/smoke.mjs`: глобус, вхід у рівень,
  рух, постріл, чиста консоль), `combat-reborn` і `save-migration`. Статичний сервер тести
  піднімають самі, окремий крок не потрібен. Локально всі три — близько хвилини.

Джоби `expedition`, `front`, `e2e`, `release-gate` і `coop-gate` **не блокують деплой**: усі вони
під `if: github.event_name == 'workflow_dispatch'` і запускаються лише вручну. Перед ручним
release/tag вони мають бути зеленими — це відповідальність релізера, а не CI.

## 5. Production acceptance

```bash
curl -fsS "https://slonce70.github.io/zombie-world-rescue/version.json?ts=$(date +%s)"
cd worker && npx wrangler deployments list
```

Перевірити запуск гри без console errors, створення/вхід у кооп-кімнату та санітизацію тимчасового lobby profile. Тимчасові lobby-записи мають зникнути після TTL.

## 6. Tag і GitHub Release

Тільки після live-перевірки:

```bash
git tag v503
git push origin v503
gh release create v503 --target main --title "v503 — Великий штурм замку" --notes-file CHANGELOG.md --latest
```

Для аварійного виправлення Pages не зменшувати версію cache: зробити revert, підняти номер і випустити наступний patch через ті самі гейти.
