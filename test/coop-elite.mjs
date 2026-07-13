// 👹 Кооп-тест «Еліти разом» (v296): елітна хвиля в кооп-кампанії —
// (а) у гостя існують puppet-еліти з еліт-прапорами; (б) телеграф-банер на ОБОХ;
// (в) по зачистці нагорода (монети+кристали) нарахована ОБОМ локально; (г) mid-join
// третьої сторінки ПОСЕРЕД активної хвилі — smoke: welcome+state, консоль без throw.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { mkdirSync } from 'fs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8769; // унікальний серед coop*-тестів (зайняті: 8743/45/47/52/63/65/67/68)
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = await spawnRelay(RELAY_PORT);

const LAUNCH = {
  args: ['--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'],
};
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
let browserC = null;
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errsA = [];
const errsB = [];
const errsC = [];
A.on('pageerror', (e) => errsA.push(e.message));
B.on('pageerror', (e) => errsB.push(e.message));
A.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text()); });
B.on('console', (m) => { if (m.type() === 'error') errsB.push(m.text()); });

// перехоплюємо банер «Елітна хвиля» до форсу — HUD-хендлер може згаснути раніше, ніж ми прочитаємо
const armBannerSpy = (page) => page.evaluate(() => {
  window.__eliteBanner = null;
  const g = window.__game;
  const orig = g.hud.banner.bind(g.hud);
  // прокидаємо ВСІ аргументи (v300 додав 4-й opts із prio — гасити його не можна)
  g.hud.banner = (...args) => {
    if (String(args[0]).includes('Елітна хвиля')) window.__eliteBanner = args[0];
    return orig(...args);
  };
});

try {
  A.setDefaultTimeout(60000);
  B.setDefaultTimeout(60000);
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 * SLOW });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 * SLOW });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(400 * SLOW);
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 5, null, { timeout: 20000 * SLOW });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());
  check('кооп-кампанія готова', true, `код ${code}`);

  // ---- 1. хост форсить елітну хвилю → банер+еліти в обох ----
  await armBannerSpy(A);
  await armBannerSpy(B);
  const spawned = await A.evaluate(() => window.__game.test.forceEliteWave());
  check('хост заспавнив 2–4 еліти', spawned >= 2 && spawned <= 4, `${spawned}`);

  // (а) puppet-еліти у гостя з прапором elite
  const eliteSeen = await B.waitForFunction(
    () => window.__game.level.zombies.list.filter((z) => z.elite && z.state !== 'dead').length,
    null, { timeout: 15000 * SLOW },
  ).then((h) => h.jsonValue()).catch(() => 0);
  check('(а) у гостя є puppet-еліти з прапором elite', eliteSeen >= 2, `еліт-puppet'ів: ${eliteSeen}`);
  const eliteVis = await B.evaluate(() => {
    const es = window.__game.level.zombies.list.filter((z) => z.elite && z.state !== 'dead');
    return { withAura: es.filter((z) => z.eliteAura).length, withIcon: es.filter((z) => z.eliteIcon).length, total: es.length };
  });
  check('(а) еліт-puppet\'и мають ауру та іконку', eliteVis.withAura === eliteVis.total && eliteVis.withIcon === eliteVis.total, JSON.stringify(eliteVis));

  // (б) телеграф-банер на ОБОХ
  const bannerA = await A.evaluate(() => window.__eliteBanner);
  const bannerB = await B.waitForFunction(() => window.__eliteBanner, null, { timeout: 10000 * SLOW })
    .then((h) => h.jsonValue()).catch(() => null);
  check('(б) банер елітної хвилі у хоста', !!bannerA, bannerA || 'нема');
  check('(б) банер елітної хвилі у гостя (ev ew)', !!bannerB, bannerB || 'нема');

  // ---- 2. зачистка → нагорода ОБОМ (в) ----
  const before = async (page) => page.evaluate(() => ({ coins: window.__game.save.coins, cry: window.__game.save.crystals || 0 }));
  const a0 = await before(A);
  const b0 = await before(B);
  // хост убиває всіх еліт хвилі (гасимо щити/панцирі, щоб дійшло до тіла)
  await A.evaluate(() => {
    const Z = window.__game.level.zombies;
    for (const z of [...Z.list]) {
      if (z.eliteWave) { z.shieldHp = 0; z.chestHp = 0; z.damage(999999, { x: 1, z: 0 }, false); }
    }
  });
  // хост нараховує собі синхронно з eliteWaveCleared; гість — по ev `ewc`
  const aRewarded = await A.waitForFunction(
    (c0) => (window.__game.save.crystals || 0) >= c0 + 3 ? window.__game.save.crystals : false,
    a0.cry, { timeout: 15000 * SLOW },
  ).then((h) => h.jsonValue()).catch(() => (a0.cry));
  const bRewarded = await B.waitForFunction(
    (c0) => (window.__game.save.crystals || 0) >= c0 + 3 ? window.__game.save.crystals : false,
    b0.cry, { timeout: 15000 * SLOW },
  ).then((h) => h.jsonValue()).catch(() => (b0.cry));
  const a1 = await before(A);
  const b1 = await before(B);
  check('(в) хост нарахував скриню собі', aRewarded >= a0.cry + 3 && a1.coins >= a0.coins + 120,
    `монети +${a1.coins - a0.coins}, кристали +${a1.cry - a0.cry}`);
  check('(в) гість нарахував скриню собі (ev ewc)', bRewarded >= b0.cry + 3 && b1.coins >= b0.coins + 120,
    `монети +${b1.coins - b0.coins}, кристали +${b1.cry - b0.cry}`);

  // ---- 3. (г) mid-join ПОСЕРЕД активної хвилі — smoke ----
  await armBannerSpy(A);
  const spawned2 = await A.evaluate(() => window.__game.test.forceEliteWave());
  check('друга хвиля активна для mid-join', spawned2 >= 2, `${spawned2}`);
  await B.waitForFunction(() => window.__game.level.zombies.list.some((z) => z.elite && z.state !== 'dead'),
    null, { timeout: 12000 * SLOW }).catch(() => {});

  browserC = await chromium.launch(LAUNCH);
  const C = await (await browserC.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  C.on('pageerror', (e) => errsC.push(e.message));
  C.on('console', (m) => { if (m.type() === 'error') errsC.push(m.text()); });
  C.setDefaultTimeout(60000);
  await C.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await C.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 * SLOW });
  // джойн посеред хвилі може впертись у welcome-таймаут на задушеному раннері — до 3 спроб (як coop3)
  let joinedC = false;
  for (let attempt = 1; attempt <= 3 && !joinedC; attempt++) {
    joinedC = await C.evaluate((c) => window.__game.test.coopJoin(c, 'Оля').then(() => true, (e) => (console.log('join fail:', e.message), false)), code);
    if (!joinedC) console.log(`↻ джойн C не пройшов (спроба ${attempt}/3) — повторюємо`);
  }
  check('(г) третій гравець приєднався посеред хвилі', joinedC);
  await C.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  const cSync = await C.waitForFunction(() => window.__game.level?.net?._ready === true, null, { timeout: 20000 * SLOW })
    .then(() => true).catch(() => false);
  check('(г) welcome+state застосувались (світ синхронний)', cSync);
  const cElite = await C.evaluate(() => window.__game.level.zombies.list.filter((z) => z.elite && z.state !== 'dead').length);
  check('(г) mid-joiner бачить еліт-puppet\'ів зі state-синку', cElite >= 1, `${cElite}`);

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  const realErrsC = errsC.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
  check('(г) консоль mid-joiner без throw', realErrsC.length === 0, realErrsC.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop-elite-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop-elite-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  if (browserC) await browserC.close().catch(() => {});
  relay.kill();
  closeServer();
}

console.log(failures === 0 ? '\n🎉 КООП «ЕЛІТИ РАЗОМ» ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
