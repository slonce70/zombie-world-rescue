// Повний блокуючий кооп-гейт. Усі coop*.mjs автоматично входять до батареї;
// coop-damage/nick лишаються у швидкому smoke job, relay-reconnect входить сюди.
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SHARD_TOTAL = Number(process.env.SHARD_TOTAL || 1);
const SHARD_INDEX = Number(process.env.SHARD_INDEX || 0);
const slowFloor = Math.max(0, parseFloat(process.env.SLOW || '0') || 0);
const retries = Math.max(0, parseInt(process.env.RETRY || '0', 10) || 0);
const DEDICATED = new Set(['coop-damage.mjs', 'coop-nick.mjs', 'coop-release.mjs']);
const BASE_SLOW = {
  'coop3.mjs': 4,
  'coop-roles.mjs': 4,
  'coop-elite.mjs': 2,
  'coop-super.mjs': 2,
  'coop-stars.mjs': 2,
  'coop-draft.mjs': 2,
  'coop-friendly-defense.mjs': 2,
  'coop-weekly.mjs': 2,
  'coop-radiation.mjs': 2,
  'coop-turretwar.mjs': 2,
  'coop-bonus.mjs': 2,
  'coop-worldboss.mjs': 2,
  'coop-community.mjs': 2,
};

if (!Number.isInteger(SHARD_TOTAL) || SHARD_TOTAL < 1
  || !Number.isInteger(SHARD_INDEX) || SHARD_INDEX < 0 || SHARD_INDEX >= SHARD_TOTAL) {
  console.error(`Invalid shard: SHARD_INDEX=${SHARD_INDEX}, SHARD_TOTAL=${SHARD_TOTAL}`);
  process.exit(2);
}

const all = readdirSync(TEST_DIR)
  .filter((file) => (file.startsWith('coop') && file.endsWith('.mjs')) || file === 'relay-reconnect.mjs')
  .filter((file) => !DEDICATED.has(file))
  .sort();
const suite = all.filter((_, index) => index % SHARD_TOTAL === SHARD_INDEX);

console.log(`Coop shard ${SHARD_INDEX + 1}/${SHARD_TOTAL}: ${suite.length}/${all.length} tests`);
for (const file of suite) console.log(`  - ${file}`);

const failed = [];
for (const file of suite) {
  const effSlow = Math.max(BASE_SLOW[file] || 1, slowFloor);
  let ok = false;
  for (let attempt = 0; attempt <= retries && !ok; attempt++) {
    if (attempt > 0) console.log(`\nRetry ${file} (${attempt + 1}/${retries + 1})`);
    console.log(`\n═══ ${file} (SLOW=${effSlow}) ═══`);
    const result = spawnSync(process.execPath, [join(TEST_DIR, file)], {
      stdio: 'inherit',
      env: { ...process.env, SLOW: String(effSlow) },
    });
    ok = result.status === 0;
  }
  if (!ok) failed.push(file);
}

if (failed.length) {
  console.error(`\nCoop shard failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nCoop shard ${SHARD_INDEX + 1}/${SHARD_TOTAL} passed`);
