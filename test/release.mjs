// Повний non-coop релізний гейт. Список не дублюємо: кожен новий test/*.mjs
// автоматично стає блокуючим, якщо він не helper/runner або окремий smoke/e2e тест.
import { readdirSync } from 'fs';
import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ensureWebServer } from './_server.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const BETWEEN_TESTS_MS = Number(process.env.RELEASE_BETWEEN_TESTS_MS || 250);
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL || 1);
const SHARD_INDEX = Number(process.env.SHARD_INDEX || 0);
const DEDICATED = new Set([
  'cloudsave.mjs', 'e2e.mjs', 'i18n.mjs', 'save-migration.mjs', 'smoke.mjs',
  'version-check.mjs', 'version-sync.mjs',
]);
const RUNNERS = new Set(['quick-release.mjs', 'release.mjs']);

if (!Number.isInteger(SHARD_TOTAL) || SHARD_TOTAL < 1
  || !Number.isInteger(SHARD_INDEX) || SHARD_INDEX < 0 || SHARD_INDEX >= SHARD_TOTAL) {
  console.error(`Invalid shard: SHARD_INDEX=${SHARD_INDEX}, SHARD_TOTAL=${SHARD_TOTAL}`);
  process.exit(2);
}

const all = readdirSync(TEST_DIR)
  .filter((file) => file.endsWith('.mjs'))
  .filter((file) => !file.startsWith('_'))
  .filter((file) => !file.startsWith('coop'))
  .filter((file) => file !== 'relay-reconnect.mjs')
  .filter((file) => !DEDICATED.has(file) && !RUNNERS.has(file))
  .sort();
const suite = all.filter((_, index) => index % SHARD_TOTAL === SHARD_INDEX);

console.log(`Release shard ${SHARD_INDEX + 1}/${SHARD_TOTAL}: ${suite.length}/${all.length} tests`);
for (const file of suite) console.log(`  - ${file}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(TEST_DIR, file)], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

const { close: closeServer } = await ensureWebServer({ quiet: false });
const failed = [];
try {
  for (const file of suite) {
    console.log(`\n═══ ${file} ═══`);
    if (await run(file)) failed.push(file);
    if (BETWEEN_TESTS_MS > 0) await sleep(BETWEEN_TESTS_MS);
  }
} finally {
  closeServer();
}

if (failed.length) {
  console.error(`\nRelease shard failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nRelease shard ${SHARD_INDEX + 1}/${SHARD_TOTAL} passed`);
