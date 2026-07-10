// 🌟 Кооп-тест «Сила разом» (v297): супер-пікап у кооп-кампанії —
// (а) зірку-дзеркало видно ОБОМ; (г) mid-join бачить непідібрану зірку зі state-синку;
// (б) гість підбирає її (наведений тест-хуком) → сила активна В ГОСТЯ, у хоста лише банер;
// (в) при Магніт-бурі гостя монети за нормальним радіусом реально злітаються до нього (хост-лут).
//
// Порядок (а)→(г)→(б)→(в) навмисний: супер один на рівень, тож mid-join мусить статись, ПОКИ
// зірка ще не підібрана — інакше другого спавну не буде.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { mkdirSync } from 'fs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8773; // унікальний серед coop*-тестів (зайняті: 8743…8771)
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

// перехоплюємо банер «⭐ … схопив …» — HUD-хендлер може згаснути раніше, ніж ми прочитаємо
const armBannerSpy = (page) => page.evaluate(() => {
  window.__superBanner = null;
  const g = window.__game;
  const orig = g.hud.banner.bind(g.hud);
  g.hud.banner = (title, sub, dur) => {
    if (String(title).includes('схопив')) window.__superBanner = title;
    return orig(title, sub, dur);
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

  // ---- (а) хост спавнить супер (форс «магніт») → зірку видно обом ----
  const spawnedA = await A.evaluate(() => {
    window.__game.test.forceSuperPower('magnet');
    return window.__game.test.spawnSuper();
  });
  check('хост заспавнив супер-пікап', spawnedA);
  const starA = await A.evaluate(() => {
    const sp = window.__game.level.superPickup;
    return sp ? { x: Math.round(sp.x * 10) / 10, z: Math.round(sp.z * 10) / 10, nid: sp.nid } : null;
  });
  check('у хоста зірка з мережевим nid', !!(starA && starA.nid), JSON.stringify(starA));
  const starB = await B.waitForFunction(() => {
    const sp = window.__game.level.superPickup;
    return sp ? { x: Math.round(sp.x * 10) / 10, z: Math.round(sp.z * 10) / 10, mirror: sp.mirror } : null;
  }, null, { timeout: 12000 * SLOW }).then((h) => h.jsonValue()).catch(() => null);
  check('(а) у гостя є дзеркальна зірка (ev spx)', !!starB, JSON.stringify(starB));
  check('(а) позиція зірки збігається в обох', !!(starA && starB
    && Math.abs(starA.x - starB.x) < 0.3 && Math.abs(starA.z - starB.z) < 0.3),
    `хост ${JSON.stringify(starA)} / гість ${JSON.stringify(starB)}`);
  check('(а) у гостя зірка — дзеркало (grab вимкнено)', !!(starB && starB.mirror));

  // ---- (г) третій гравець приєднується, ПОКИ зірка непідібрана → бачить її зі state ----
  browserC = await chromium.launch(LAUNCH);
  const C = await (await browserC.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  C.on('pageerror', (e) => errsC.push(e.message));
  C.on('console', (m) => { if (m.type() === 'error') errsC.push(m.text()); });
  C.setDefaultTimeout(60000);
  await C.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await C.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 * SLOW });
  let joinedC = false;
  for (let attempt = 1; attempt <= 3 && !joinedC; attempt++) {
    joinedC = await C.evaluate((c) => window.__game.test.coopJoin(c, 'Оля').then(() => true, (e) => (console.log('join fail:', e.message), false)), code);
    if (!joinedC) console.log(`↻ джойн C не пройшов (спроба ${attempt}/3) — повторюємо`);
  }
  check('(г) третій гравець приєднався', joinedC);
  await C.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  // 30с×SLOW як у (б): на задушеному CI-раннері з 3 браузерами state.spu доїжджає
  // mid-joiner'у за 60-80с через бэклог снапшотів (main-ран 2026-07-07 пройшов
  // за ~80с впритул, ран PR #73 схибив на тих самих 80с)
  const starC = await C.waitForFunction(() => {
    const sp = window.__game.level.superPickup;
    return sp ? { x: Math.round(sp.x * 10) / 10, z: Math.round(sp.z * 10) / 10 } : null;
  }, null, { timeout: 30000 * SLOW }).then((h) => h.jsonValue()).catch(() => null);
  check('(г) mid-joiner бачить непідібрану зірку (state.spu)', !!starC, JSON.stringify(starC));

  // ---- (б) гість наводиться на зірку → підбір host-authoritative → сила В ГОСТЯ ----
  await armBannerSpy(A);
  await B.evaluate((s) => window.__game.test.teleport(s.x, s.z), starB);
  // ширше вікно: підбір — потрійний мережевий круг (позиція гостя → хост-детект → spg →
  // активація в гостя); на задушеному CI-раннері 12с×SLOW не вистачало (main-ран 2026-07-07)
  const bPower = await B.waitForFunction(
    () => (window.__game.test.superState() ? window.__game.test.superState().type : null),
    null, { timeout: 30000 * SLOW },
  ).then((h) => h.jsonValue()).catch(() => null);
  check('(б) сила активна В ГОСТЯ (magnet)', bPower === 'magnet', `superState=${bPower}`);
  const aPower = await A.evaluate(() => window.__game.test.superState());
  check('(б) у ХОСТА сили нема (superState null)', aPower === null, JSON.stringify(aPower));
  const aBanner = await A.waitForFunction(() => window.__superBanner, null, { timeout: 15000 * SLOW })
    .then((h) => h.jsonValue()).catch(() => null);
  check('(б) у ХОСТА банер «схопив»', !!aBanner, aBanner || 'нема');
  const bGone = await B.evaluate(() => !window.__game.level.superPickup);
  check('(б) зірка зникла в гостя після підбору', bGone);

  // ---- (в) Магніт-буря гостя: монети поза нормальним радіусом (10u) реально злітаються ----
  const bCoins0 = await B.evaluate(() => window.__game.save.coins);
  // хост спавнить фізичні монети кільцем ~10u навколо гостя (нормальний магніт-радіус монети = 5u,
  // тож без ∞-супермагніту вони б не долетіли) — так ізолюємо саме силу гостя.
  await A.evaluate((s) => {
    const eff = window.__game.level.effects;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      eff.spawnCoin(s.x + Math.cos(a) * 10, s.z + Math.sin(a) * 10, 5);
    }
  }, starB);
  const bCoins1 = await B.waitForFunction(
    (c0) => (window.__game.save.coins > c0 ? window.__game.save.coins : false),
    bCoins0, { timeout: 30000 * SLOW },
  ).then((h) => h.jsonValue()).catch(() => bCoins0);
  check('(в) монети магніт-бурі гостя зараховано (хост-лут → pid гостя)', bCoins1 > bCoins0,
    `монети гостя ${bCoins0} → ${bCoins1}`);

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  const realErrsC = errsC.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
  check('(г) консоль mid-joiner без throw', realErrsC.length === 0, realErrsC.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop-super-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop-super-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  if (browserC) await browserC.close().catch(() => {});
  relay.kill();
  closeServer();
}

console.log(failures === 0 ? '\n🎉 КООП «СИЛА РАЗОМ» ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
