import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const relay = await spawnRelay(8790);
const url = `${BASE}/?test&fresh&relay=ws://localhost:8790`;
const launch = { args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] };
const browsers = [await chromium.launch(launch), await chromium.launch(launch)];
const [A, B] = await Promise.all(browsers.map(async (b) => (await b.newContext()).newPage()));
const errors = [];
for (const p of [A, B]) p.on('pageerror', (e) => errors.push(e.message));
let fail = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '✅' : '❌'} ${msg}`, extra); if (!ok) fail++; };

try {
  await Promise.all([A.goto(url), B.goto(url)]);
  await Promise.all([A.waitForFunction(() => window.__game?.state === 'globe'), B.waitForFunction(() => window.__game?.state === 'globe')]);
  const code = await A.evaluate(() => window.__game.test.coopCreate('Хост'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Гість'), code);
  // A host-side roster update can arrive a frame before the guest has applied
  // its room snapshot. Starting in that gap makes the test race the relay and
  // can leave the guest waiting forever on slower CI runners.
  await Promise.all([
    A.waitForFunction(() => window.__game.coop.session.roster.size === 2),
    B.waitForFunction(() => window.__game.coop.session.roster.size === 2),
  ]);
  await A.evaluate(() => { window.__game.test.coopSetMode('expedition'); window.__game.test.coopStartLevel(); });
  await Promise.all([
    A.waitForFunction(() => window.__game?.level?.expedition?.coop, null, { timeout: 45_000 }),
    B.waitForFunction(() => window.__game?.level?.expedition?.coop, null, { timeout: 45_000 }),
  ]);
  const first = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.level.expedition.current.id)));
  check(first[0] === first[1], 'обидва гравці стартують той самий вузол', first.join(' / '));

  await A.evaluate(() => window.__game._showVictory());
  await Promise.all([A.waitForSelector('#overlay-victory.show'), B.waitForSelector('#overlay-victory.show')]);
  await A.click('#btn-victory-next');
  await Promise.all([A.waitForSelector('#overlay-expedition.show'), B.waitForSelector('#overlay-expedition.show')]);
  await A.locator('#expedition-route button').first().click();
  await B.locator('#expedition-route button').last().click();
  await A.waitForFunction(() => window.__game.coop.session.expeditionVotes.size === 2);
  await A.click('#btn-expedition-go');
  await Promise.all([
    A.waitForFunction(() => window.__game?.level?.expedition?.step === 1),
    B.waitForFunction(() => window.__game?.level?.expedition?.step === 1),
  ]);
  const second = await Promise.all([A, B].map((p) => p.evaluate(() => ({ id: window.__game.level.expedition.current.id, build: window.__game.level.expedition.build }))));
  check(second[0].id === second[1].id, 'голосування синхронізує наступний вузол', JSON.stringify(second));
  check(second[0].build.length === 1 && second[1].build.length === 1, 'картка маршруту синхронна в обох збірках');
  check(errors.length === 0, 'у коопі немає JS-помилок', errors.join(' | '));
} catch (e) {
  fail++;
  console.error('❌', e.message.split('\n')[0]);
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  relay.kill();
  closeServer();
}

if (fail) process.exit(1);
console.log('\n🎉 КООП-ЕКСПЕДИЦІЯ ПРАЦЮЄ');
