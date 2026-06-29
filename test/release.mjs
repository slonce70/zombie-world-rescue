import { spawn } from 'child_process';

const PORT = 8741;
const BASE = `http://localhost:${PORT}`;
const BETWEEN_TESTS_MS = Number(process.env.RELEASE_BETWEEN_TESTS_MS || 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready() {
  try {
    const r = await fetch(`${BASE}/version.json`, { cache: 'no-store' });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function waitReady() {
  for (let i = 0; i < 50; i++) {
    if (await ready()) return;
    await sleep(100);
  }
  throw new Error(`http://localhost:${PORT}/version.json не відповів`);
}

let server = null;
if (!(await ready())) {
  server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'inherit' });
  await waitReady();
}

const suite = [
  ['node', ['test/version-sync.mjs']],
  ['node', ['test/runbuild.mjs']],
  ['node', ['test/sw-cache.mjs']],
  ['node', ['test/pwa-offline.mjs']],
  ['node', ['test/smoke.mjs']],
  ['node', ['test/shop-boxes.mjs']],
  ['node', ['test/shop-sections.mjs']],
  ['node', ['test/gadget-dash.mjs']],
  ['node', ['test/knockout.mjs']],
  ['node', ['test/defense.mjs']],
  ['node', ['test/overloaded-defense.mjs']],
  ['node', ['test/overloaded-pvp.mjs']],
  ['node', ['test/cloudsave.mjs'], { SLOW: process.env.RELEASE_CLOUDSAVE_SLOW || process.env.SLOW || '2' }],
  ['node', ['test/save-migration.mjs']],
  ['node', ['test/flows.mjs'], { SLOW: process.env.RELEASE_FLOWS_SLOW || process.env.SLOW || '4' }],
  ['node', ['test/i18n.mjs']],
  ['node', ['test/update-mobile.mjs']],
  ['node', ['test/mobile-perf.mjs']],
  ['node', ['test/visual-polish.mjs']],
  ['node', ['test/living-hq.mjs']],
  ['node', ['test/mega-season.mjs']],
  ['node', ['test/titles.mjs']],
  ['node', ['test/wardrobe-tabs.mjs']],
  ['node', ['test/bank.mjs']],
  ['node', ['test/draft.mjs']],
  ['node', ['test/draft-storm.mjs']],
  ['node', ['test/bazooka-damage.mjs']],
  ['node', ['test/lobby-profiles.mjs']],
  ['node', ['test/coop-privacy.mjs']],
];

function run(cmd, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

let code = 0;
try {
  for (const [cmd, args, env] of suite) {
    console.log(`\n$ ${cmd} ${args.join(' ')}`);
    code = await run(cmd, args, env);
    if (code) break;
    if (BETWEEN_TESTS_MS > 0) await sleep(BETWEEN_TESTS_MS);
  }
} finally {
  if (server) server.kill();
}

process.exit(code);
