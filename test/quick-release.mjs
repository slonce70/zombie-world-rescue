import { spawn } from 'child_process';

const BETWEEN_TESTS_MS = Number(process.env.QUICK_RELEASE_BETWEEN_TESTS_MS || 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const suite = [
  ['node', ['test/version-sync.mjs']],
  ['node', ['test/sw-cache.mjs']],
  ['node', ['test/save-migration.mjs']],
  ['node', ['test/cloudsave.mjs'], { SLOW: process.env.QUICK_RELEASE_CLOUDSAVE_SLOW || process.env.SLOW || '1' }],
  ['node', ['test/smoke.mjs']],
  ['node', ['test/bank.mjs']],
  ['node', ['test/zone-defense.mjs']],
  ['node', ['test/humans-vs-zombies.mjs']],
  ['node', ['test/overloaded-humans.mjs']],
];

function run(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

let code = 0;
for (const [cmd, args, env] of suite) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  code = await run(cmd, args, env);
  if (code) break;
  if (BETWEEN_TESTS_MS > 0) await sleep(BETWEEN_TESTS_MS);
}

process.exit(code);
