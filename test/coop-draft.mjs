// 🎲🌐 Кооп-драфт «Прокачки» у Штормі: хост роздає набори (dro), гість бачить
// оверлей зі своїм набором, вибір застосовує стат ЛОКАЛЬНО (без drp).
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8763;
const RELAY = `ws://localhost:${RELAY_PORT}`;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const relay = await spawnRelay(RELAY_PORT);
const LAUNCH = { args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] };
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const p of [A, B]) {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
}

try {
  console.log('▸ Кооп-драфт у Штормі');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  const code = await A.evaluate(async () => {
    const g = window.__game;
    g.save.liberated = { UKR: true };
    return g.test.coopCreate('Тато');
  });
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await A.evaluate(() => {
    window.__game.test.coopSetMode('storm');
    window.__game.test.coopSetCountry('UKR');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.storm && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.storm && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());

  const hasRunBuild = await B.evaluate(() => !!window.__game.level.runBuild);
  check(hasRunBuild, 'runBuild існує і в гостя (кооп-Шторм)');

  // loop-refire: вбиваємо зомбі хвилі у хоста, поки драфт не відкриється в ОБОХ
  // (dro може затриматись у пачці на тротленому раннері)
  const t0 = Date.now();
  let bothOpen = false;
  while (Date.now() - t0 < 60000 * SLOW) {
    await A.evaluate(() => {
      const g = window.__game;
      for (const z of g.level.zombies.list) {
        if (z._stormWave && z.state !== 'dead') z.damage(99999, null, false);
      }
    });
    await sleep(700 * SLOW);
    const aOpen = await A.evaluate(() => window.__game.draft.isOpen);
    const bOpen = await B.evaluate(() => window.__game.draft.isOpen);
    if (aOpen && bOpen) { bothOpen = true; break; }
  }
  check(bothOpen, 'драфт відкрився і в хоста, і в гостя');

  const validate = (d) => d.ids.length === 3 && new Set(d.ids).size === 3 && d.ids.every((id) => d.pool.includes(id));
  const offerA = await A.evaluate(async () => {
    const { CARD_POOL } = await import('/src/runbuild.js');
    return { ids: window.__game.draft.offered.map((c) => c.id), pool: CARD_POOL.map((c) => c.id) };
  });
  const offerB = await B.evaluate(async () => {
    const { CARD_POOL } = await import('/src/runbuild.js');
    return { ids: window.__game.draft.offered.map((c) => c.id), pool: CARD_POOL.map((c) => c.id) };
  });
  check(validate(offerA), 'хост: 3 різні валідні картки', JSON.stringify(offerA.ids));
  check(validate(offerB), 'гість: 3 різні валідні картки', JSON.stringify(offerB.ids));

  // вибір гостя застосовується ЛОКАЛЬНО (жодного мережевого підтвердження)
  const pickB = await B.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    const before = {
      dmg: p.damageMult, spd: p.speedMult, nades: p.grenades,
      maxHp: p.maxHealth, hp: p.health, steal: p.lifeSteal || 0, armor: p.armor,
    };
    g.draft.pick(0);
    const after = {
      dmg: p.damageMult, spd: p.speedMult, nades: p.grenades,
      maxHp: p.maxHealth, hp: p.health, steal: p.lifeSteal || 0, armor: p.armor,
    };
    return {
      before, after,
      changed: JSON.stringify(before) !== JSON.stringify(after),
      picks: g.level.runBuild.picks.length,
      open: g.draft.isOpen,
    };
  });
  check(pickB.changed && pickB.picks === 1 && !pickB.open,
    'пік гостя застосував стат локально і закрив оверлей', JSON.stringify(pickB));

  const pickA = await A.evaluate(() => {
    const g = window.__game;
    g.draft.pick(0);
    return { picks: g.level.runBuild.picks.length, open: g.draft.isOpen };
  });
  check(pickA.picks === 1 && !pickA.open, 'пік хоста теж працює', JSON.stringify(pickA));
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 КООП-ДРАФТ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
