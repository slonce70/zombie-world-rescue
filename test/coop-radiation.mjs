// ☢️🌐 Радіація в коопі: гість-mirror, прапор radiationMode їде на puppet-босі
// (o.rm у zs/captureState), фінал кожен детектить сам зі стану боса (патерн нокауту),
// +50 монет радіації нараховуються КОЖНОМУ локально.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8767;
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
// боси радіації аггряться миттєво — god PRE-ARM інтервалом ДО старту рівня
const prearm = (p) => p.evaluate(() => {
  window.__prearm = setInterval(() => { try { window.__game.test.god(); } catch (e) { /* рівень ще не готовий */ } }, 250);
});

try {
  console.log('▸ Радіація у кооп-лобі');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  const lobby = await A.evaluate(async () => {
    const g = window.__game;
    const { CAMPAIGN_ORDER } = await import('/src/countries.js');
    g.save.liberated = Object.fromEntries(CAMPAIGN_ORDER.slice(0, 11).map((c) => [c, true]));
    const code = await g.test.coopCreate('Тато');
    const lockedEl = document.querySelector('.lobby-mode[data-mode="radiation"]');
    const locked = !!lockedEl && lockedEl.classList.contains('locked');
    g.save.liberated = Object.fromEntries(CAMPAIGN_ORDER.slice(0, 12).map((c) => [c, true]));
    g.coop._renderLobby();
    const openEl = document.querySelector('.lobby-mode[data-mode="radiation"]');
    return { code, locked, open: !!openEl && openEl.classList.contains('pick') && !openEl.classList.contains('locked') };
  });
  check(lobby.locked, 'до 12 країн радіація в лобі заблокована', JSON.stringify(lobby));
  check(lobby.open, 'після 12 країн радіація доступна', JSON.stringify(lobby));

  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), lobby.code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await prearm(A);
  await prearm(B);
  await A.evaluate(() => {
    window.__game.test.coopSetMode('radiation');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.radiation && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.radiation && window.__game.level.net, null, { timeout: 45000 * SLOW });

  const shape = await B.evaluate(() => ({
    mirror: window.__game.level.mirror,
    modeId: window.__game.level.modeId,
    noShop: window.__game.level.noShop,
    remaining: window.__game.level.radiation.remaining(),
  }));
  check(shape.mirror && shape.modeId === 'radiation' && shape.noShop,
    'гість — mirror радіації з правилами режиму', JSON.stringify(shape));
  // головна пастка (аналог o.k нокауту): без прапора remaining()=0 → миттєва «перемога»
  check(shape.remaining === 1 && !(await B.evaluate(() => window.__game.level.radiation.over)),
    'гість бачить радіаційного боса (прапор radiationMode на місці)', `remaining=${shape.remaining}`);

  console.log('▸ Фінал: хост убиває боса — гість детектить перемогу сам');
  const radB0 = await B.evaluate(() => window.__game.save.radiationCoins || 0);
  const radA0 = await A.evaluate(() => window.__game.save.radiationCoins || 0);
  const tEnd = Date.now();
  let guestWon = false;
  while (Date.now() - tEnd < 40000 * SLOW) {
    await A.evaluate(() => {
      for (const z of window.__game.level.zombies.list) {
        if (z.radiationMode && z.state !== 'dead') z.damage(99999, null, false);
      }
    });
    await sleep(700 * SLOW);
    guestWon = await B.evaluate(() => {
      const g = window.__game;
      return !!(g.level && g.level.radiation && g.level.radiation.over && g.level.radiation.completed);
    });
    if (guestWon) break;
  }
  check(guestWon, 'гість отримав перемогу зі стану puppet-боса');
  const radB1 = await B.evaluate(() => window.__game.save.radiationCoins || 0);
  const radA1 = await A.evaluate(() => window.__game.save.radiationCoins || 0);
  check(radA1 - radA0 === 50, 'хост отримав +50 ☢️', `Δ=${radA1 - radA0}`);
  check(radB1 - radB0 === 50, 'гість отримав +50 ☢️ локально', `Δ=${radB1 - radB0}`);
  const overlayB = await B.evaluate(() => document.getElementById('overlay-arena-end').classList.contains('show'));
  check(overlayB, 'у гостя показано екран фіналу');
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await A.evaluate(() => clearInterval(window.__prearm)).catch(() => {});
  await B.evaluate(() => clearInterval(window.__prearm)).catch(() => {});
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 КООП-РАДІАЦІЯ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
