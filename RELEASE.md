# Релізний runbook

## 1. Підготовка

```bash
git status --short --branch
npm ci
npx playwright install chromium
node test/version-sync.mjs
node test/sw-cache.mjs
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

Повне відтворення CI:

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
npx wrangler deploy --tag v307 --message "v307 $sha"
```

Worker має бути backward-compatible з попереднім клієнтом. При production-регресії виконати `npx wrangler rollback <previous-version-id>`.

## 4. Gated Pages deploy

Перед першим merge із custom workflow один раз перемкнути Pages:

```bash
gh api repos/slonce70/zombie-world-rescue/pages -X PUT -f build_type=workflow
gh api repos/slonce70/zombie-world-rescue/pages --jq .build_type
```

Після merge push у `main` запускає blocking release/coop/smoke/e2e jobs. `deploy-pages` стартує лише після їхнього успіху.

## 5. Production acceptance

```bash
curl -fsS "https://slonce70.github.io/zombie-world-rescue/version.json?ts=$(date +%s)"
cd worker && npx wrangler deployments list
```

Перевірити запуск гри без console errors, створення/вхід у кооп-кімнату та санітизацію тимчасового lobby profile. Тимчасові lobby-записи мають зникнути після TTL.

## 6. Tag і GitHub Release

Тільки після live-перевірки:

```bash
git tag v307
git push origin v307
gh release create v307 --target main --title "v307 — Стабільний реліз" --notes-file CHANGELOG.md --latest
```

Для аварійного виправлення Pages не зменшувати версію cache: зробити revert, підняти номер і випустити наступний patch через ті самі гейти.
