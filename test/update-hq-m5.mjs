// 📣 Тест M5 Task 1: безпечні пінги — гість→хост і хост→гість як тости.
// Дзеркалить харнес test/coop.mjs (власний dev-relay + два браузери, хост створює
// кімнату через __game.test.coopCreate, гість приєднується coopJoin, старт рівня).
import { setTimeout as sleep } from 'node:timers/promises';
import { openCoopTest, waitFor as waitForAsync } from './_browser.mjs';
import { mkdirSync } from 'fs';

const RELAY_PORT = 8749; // окремий порт від coop.mjs (8743), щоб тести не билися
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const waitFor = (fn, timeoutMs, label) => waitForAsync(fn, timeoutMs * SLOW, label, 300);

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
const { BASE, RELAY, A: hostPage, B: guestPage, closeTest } = await openCoopTest({ relayPort: RELAY_PORT, launch: LAUNCH, captureErrors: false });
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
  await hostPage.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 * SLOW });
  await guestPage.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 * SLOW });
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
  await hostPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 * SLOW });
  await guestPage.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 * SLOW });
  check('обидва увійшли в рівень', true);

  // гість має дочекатися повного стану від хоста (щоб net жив на обох боках)
  // ширше вікно: на задушеному раннері пінг стає в чергу ЗА бэклогом стану — якщо
  // прогрів не завершився, доставка тоста вилазить за вікно waitFor нижче
  await guestPage.waitForFunction(() => {
    const s = window.__game.test.coopState();
    return s.aliveZombies > 5;
  }, null, { timeout: 30000 * SLOW }).catch(() => {});

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
  }, 15000, 'host received ping toast'); // CI: тост доїжджав за ~33с при SLOW=4 — вікно 60с
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
  const got2 = await waitFor(async () => (await guestPage.evaluate(() => window.__pings || [])).some((m) => /Сюди|Here|Сюда/.test(m)), 15000, 'guest received host ping');
  check('гість отримав пінг хоста як тост', got2,
    JSON.stringify(await guestPage.evaluate(() => window.__pings || [])));

  // ============ 🎡 КОЛЕСО СТІКЕРІВ (Task 2: UI) ============
  // 7. відкриваємо колесо на хості — має бути 12 кнопок-стікерів
  await hostPage.evaluate(() => window.__game.coop.openPingWheel && window.__game.coop.openPingWheel());
  const n = await hostPage.evaluate(() => document.querySelectorAll('#ping-wheel .ping-btn').length);
  check('колесо стікерів має 12 штук', n === 12, `${n}`);
  const open = await hostPage.evaluate(() => document.getElementById('overlay-ping').classList.contains('show'));
  check('оверлей пінгів відкрито', open === true);
  // клік по фразі #1 шле пінг і закриває оверлей
  await hostPage.evaluate(() => { window.__pings = []; const h = window.__game.hud; const o = h.toast.bind(h); h.toast = (m) => { window.__pings.push(m); return o(m); }; });
  // ⏱️ анти-спам стікерів — 1.2 с по НАСТІННОМУ годиннику (sendPing у net/coop.js),
  // а хост щойно сам відправив пінг у кроці 6. Коли труби вже прогріті, тост гостю
  // доїжджає за 0.3 с (саме так було на CI), клік потрапляє всередину вікна — і пінг
  // мовчки зʼїдається, хоча кнопка спрацювала. Чекаємо, поки вікно вийде.
  await sleep(1300);
  await hostPage.evaluate(() => document.querySelectorAll('#ping-wheel .ping-btn')[1].click());
  const sent = await waitFor(async () => (await hostPage.evaluate(() => window.__pings || [])).some((m) => /Ти:/.test(m)), 4000, 'click sent ping');
  check('клік по фразі шле пінг', sent);
  const closed = await hostPage.evaluate(() => !document.getElementById('overlay-ping').classList.contains('show'));
  check('оверлей закрився після кліку', closed === true);

  // 8. помилки консолі
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
  await closeTest();
}

console.log(failures === 0 ? '\n🎉 M5 ПІНГ-ТЕСТ ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
