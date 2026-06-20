// 📣 Тест M5 Task 1: безпечні пінги — гість→хост і хост→гість як тости.
// Дзеркалить харнес test/coop.mjs (власний dev-relay + два браузери, хост створює
// кімнату через __game.test.coopCreate, гість приєднується coopJoin, старт рівня).
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { spawnRelay } from './_relay.mjs';

const BASE = 'http://localhost:8741';
const RELAY_PORT = 8749; // окремий порт від coop.mjs (8743), щоб тести не билися
const RELAY = `ws://localhost:${RELAY_PORT}`;
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await sleep(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

// власний relay на окремому порту — тест самодостатній
const relay = await spawnRelay(RELAY_PORT);

const LAUNCH = {
  args: [
    '--use-angle=swiftshader',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
};
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
const hostPage = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const guestPage = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errsA = [];
const errsB = [];
hostPage.on('pageerror', (e) => errsA.push(e.message));
guestPage.on('pageerror', (e) => errsB.push(e.message));
hostPage.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text()); });
guestPage.on('console', (m) => { if (m.type() === 'error') errsB.push(m.text()); });

try {
  // 1. обидва на глобусі
  hostPage.setDefaultTimeout(60000);
  guestPage.setDefaultTimeout(60000);
  await hostPage.goto(`${BASE}/?test&fresh&relay=${RELAY}`);
  await guestPage.goto(`${BASE}/?test&fresh&relay=${RELAY}`);
  await hostPage.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 });
  await guestPage.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 });
  check('обидва клієнти на глобусі', true);

  // 2. хост створює кімнату
  const code = await hostPage.evaluate(() => window.__game.test.coopCreate('Тато'));
  check('кімнату створено', typeof code === 'string' && code.length === 4, `код ${code}`);

  // 3. гість приєднується
  await guestPage.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(500);
  const rosterA = await hostPage.evaluate(() => window.__game.test.coopState().roster);
  const rosterB = await guestPage.evaluate(() => window.__game.test.coopState().roster);
  check('хост бачить 2 гравців у ростері', rosterA.length === 2, JSON.stringify(rosterA));
  check('гість бачить 2 гравців у ростері', rosterB.length === 2, JSON.stringify(rosterB));

  // 4. хост стартує Україну
  await hostPage.evaluate(() => {
    window.__game.test.coopSetCountry('UKR');
    window.__game.test.coopStartLevel();
  });
  await hostPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
  await guestPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
  check('обидва увійшли в рівень', true);

  // гість має дочекатися повного стану від хоста (щоб net жив на обох боках)
  await guestPage.waitForFunction(() => {
    const s = window.__game.test.coopState();
    return s.aliveZombies > 5;
  }, null, { timeout: 15000 }).catch(() => {});

  // ============ 📣 ПІНГИ ============
  // 5. шпигуємо за тостами хоста; гість шле пінг #1 (Допоможи!)
  await hostPage.evaluate(() => {
    window.__pings = [];
    const h = window.__game.hud;
    const o = h.toast.bind(h);
    h.toast = (m) => { window.__pings.push(m); return o(m); };
  });
  await guestPage.evaluate(() => window.__game.coop.session.sendPing(1));
  const got = await waitFor(async () => {
    const arr = await hostPage.evaluate(() => window.__pings || []);
    return arr.some((m) => /Допоможи|Help|Помоги/.test(m));
  }, 8000, 'host received ping toast');
  check('хост отримав пінг гостя як тост', got,
    JSON.stringify(await hostPage.evaluate(() => window.__pings || [])));

  // 6. шпигуємо за тостами гостя; хост шле пінг #0 (Сюди!)
  await guestPage.evaluate(() => {
    window.__pings = [];
    const h = window.__game.hud;
    const o = h.toast.bind(h);
    h.toast = (m) => { window.__pings.push(m); return o(m); };
  });
  await hostPage.evaluate(() => window.__game.coop.session.sendPing(0));
  const got2 = await waitFor(async () => (await guestPage.evaluate(() => window.__pings || [])).some((m) => /Сюди|Here|Сюда/.test(m)), 8000, 'guest received host ping');
  check('гість отримав пінг хоста як тост', got2,
    JSON.stringify(await guestPage.evaluate(() => window.__pings || [])));

  // 7. помилки консолі
  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message);
  await hostPage.screenshot({ path: 'shots/m5-fail-A.png' }).catch(() => {});
  await guestPage.screenshot({ path: 'shots/m5-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close();
  await browserB.close();
  relay.kill();
}

console.log(failures === 0 ? '\n🎉 M5 ПІНГ-ТЕСТ ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
