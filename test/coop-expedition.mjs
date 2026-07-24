import { makeCheck, openCoopTest } from './_browser.mjs';

const RELAY_PORT = 8790;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const launch = { args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] };
const { BASE, RELAY, A, B, closeTest } = await openCoopTest({ relayPort: RELAY_PORT, launch, captureErrors: false });
const url = `${BASE}/?test&fresh&relay=${RELAY}`;
for (const page of [A, B]) page.setDefaultTimeout(60_000 * SLOW);
const errors = [];
for (const p of [A, B]) p.on('pageerror', (e) => errors.push(e.message));
let fail = 0;
const check = makeCheck(() => fail++);

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
  await A.evaluate(() => window.__game.test.coopSetRole('guard'));
  await B.evaluate(() => {
    window.__game.save.specialistXp.scout = 100;
    window.__game.test.coopSetRole('scout');
  });
  await A.waitForFunction(() => [...window.__game.coop.session.roster.values()].some((r) => r.role === 'scout' && r.rank === 2));
  await A.evaluate(() => { window.__game.test.coopSetMode('expedition'); window.__game.test.coopStartLevel(); });
  await Promise.all([
    A.waitForFunction(() => window.__game?.level?.expedition?.coop, null, { timeout: 45_000 }),
    B.waitForFunction(() => window.__game?.level?.expedition?.coop, null, { timeout: 45_000 }),
  ]);
  const first = await Promise.all([A, B].map((p) => p.evaluate(() => window.__game.level.expedition.current.id)));
  check(first[0] === first[1], 'обидва гравці стартують той самий вузол', first.join(' / '));
  const specialists = await Promise.all([A, B].map((p) => p.evaluate(() => ({
    shared: window.__game.level.expedition.specialist,
    id: window.__game.level.specialist.id,
    rank: window.__game.level.specialist.rank,
  }))));
  check(specialists[0].shared == null && specialists[1].shared == null, 'спільний маршрут не містить спеціаліста', JSON.stringify(specialists));
  check(specialists[0].id === 'guard' && specialists[1].id === 'scout' && specialists[1].rank === 2,
    'кожен клієнт застосовує власного спеціаліста й ранг', JSON.stringify(specialists));
  const charges = await Promise.all([A, B].map((p, index) => p.evaluate((hits) => {
    const g = window.__game;
    for (let i = 0; i < hits; i++) g.level.bus.emit('hitmarker', false, 'pistol');
    return g.level.specialist.charge;
  }, index ? 20 : 6)));
  check(charges[0] === 100 && charges[1] === 100, 'Super заряджається локально з різною швидкістю', charges.join(' / '));
  await A.keyboard.press('c');
  await A.waitForFunction(() => window.__game.level.specialist.charge === 0);
  check(!await A.locator('#overlay-ping').evaluate((el) => el.classList.contains('show')),
    'C використовує Super у кооп-Експедиції, не відкриваючи колесо пінгів');

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
  await A.evaluate(() => {
    const g = window.__game;
    const run = { ...g.save.expedition, status: 'won', step: 4, wins: 5, current: null, choices: [], reward: { coins: 550, crystals: 10, claimed: true } };
    g.save.expedition = run;
    g._claimExpeditionMastery(run);
    g.coop.session.syncExpedition(run);
    g.saveGame();
  });
  await B.waitForFunction(() => window.__game.save.specialistXp.scout === 200);
  const mastery = await Promise.all([A, B].map((p) => p.evaluate(() => ({
    xp: window.__game.save.specialistXp,
    claims: window.__game.save.specialistClaims.length,
  }))));
  check(mastery[0].xp.guard === 100 && mastery[1].xp.scout === 200 && mastery.every((x) => x.claims === 1),
    'terminal co-op XP кожен отримує своєму спеціалісту один раз', JSON.stringify(mastery));
  check(errors.length === 0, 'у коопі немає JS-помилок', errors.join(' | '));
} catch (e) {
  fail++;
  console.error('❌', e.message.split('\n')[0]);
} finally {
  await closeTest();
}

if (fail) process.exit(1);
console.log('\n🎉 КООП-ЕКСПЕДИЦІЯ ПРАЦЮЄ');
