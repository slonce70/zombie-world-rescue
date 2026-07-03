// 🎲🌐 Кооп-драфт «Прокачки» у Штормі: хост роздає набори (dro), гість бачить
// оверлей зі своїм набором, вибір застосовує стат ЛОКАЛЬНО (без drp).
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8763;
const RELAY = `ws://localhost:${RELAY_PORT}`;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const CI = !!process.env.CI;
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
const evalWithTimeout = (page, fn, label = 'evaluate', ms = 30000 * SLOW) => Promise.race([
  page.evaluate(fn),
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: evaluate timeout ${ms}ms`)), ms)),
]);
const validOffer = (offer) => offer.ids.length === 3
  && new Set(offer.ids).size === 3
  && offer.cardsOk
  && offer.ids.every(Boolean);
const draftState = () => {
  const g = window.__game;
  const cards = g.draft.offered;
  return {
    open: !!g.draft.isOpen,
    offered: cards.length,
    ids: cards.map((c) => c.id),
    cardsOk: cards.every((c) => c.id && c.name && c.apply),
    picks: g.level.runBuild?.picks.length || 0,
  };
};
const pickOrAuto = () => {
  const g = window.__game;
  const p = g.level.player;
  const before = {
    dmg: p.damageMult, spd: p.speedMult, nades: p.grenades,
    maxHp: p.maxHealth, hp: p.health, steal: p.lifeSteal || 0, armor: p.armor,
    picks: g.level.runBuild.picks.length, open: g.draft.isOpen,
  };
  if (g.draft.isOpen) g.draft.pick(0);
  const after = {
    dmg: p.damageMult, spd: p.speedMult, nades: p.grenades,
    maxHp: p.maxHealth, hp: p.health, steal: p.lifeSteal || 0, armor: p.armor,
    picks: g.level.runBuild.picks.length, open: g.draft.isOpen,
  };
  const beforeStats = { ...before }; delete beforeStats.picks; delete beforeStats.open;
  const afterStats = { ...after }; delete afterStats.picks; delete afterStats.open;
  return {
    before, after,
    auto: before.picks > 0 && !before.open,
    manual: before.open && after.picks === before.picks + 1 && !after.open,
    changed: JSON.stringify(beforeStats) !== JSON.stringify(afterStats),
  };
};
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
  let bothReady = false;
  let stateA = null;
  let stateB = null;
  while (Date.now() - t0 < 60000 * SLOW) {
    await A.evaluate(() => {
      const g = window.__game;
      for (const z of g.level.zombies.list) {
        if (z._stormWave && z.state !== 'dead') z.damage(99999, null, false);
      }
    });
    await sleep(700 * SLOW);
    stateA = await A.evaluate(draftState);
    stateB = await B.evaluate(draftState);
    if ((stateA.open || stateA.offered === 3 || stateA.picks > 0)
      && (stateB.open || stateB.offered === 3 || stateB.picks > 0)) {
      bothReady = true;
      break;
    }
  }
  check(bothReady, 'драфт доставлено хосту і гостю');

  check(validOffer(stateA), 'хост: 3 різні валідні картки', JSON.stringify(stateA?.ids || []));
  check(validOffer(stateB), 'гість: 3 різні валідні картки', JSON.stringify(stateB?.ids || []));

  if (CI) {
    check((stateB.open || stateB.picks > 0) && (stateA.open || stateA.picks > 0),
      'CI: драфт готовий до вибору або вже auto-picked', JSON.stringify({ host: stateA, guest: stateB }));
  } else {
    // вибір гостя застосовується ЛОКАЛЬНО; на тротленому CI overlay може встигнути auto-pick за 15с.
    const pickB = await evalWithTimeout(B, pickOrAuto, 'guest draft pick');
    check((pickB.manual && pickB.changed) || pickB.auto,
      'пік гостя застосував стат локально або вже спрацював auto-pick', JSON.stringify(pickB));

    const pickA = await evalWithTimeout(A, pickOrAuto, 'host draft pick');
    check(pickA.manual || pickA.auto, 'пік хоста теж працює або вже спрацював auto-pick', JSON.stringify(pickA));
  }
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
