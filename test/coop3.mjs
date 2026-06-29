// 🤝 Кооп-тест 3: приєднання ПОСЕРЕД гри + реконект після розриву звʼязку
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { mkdirSync } from 'fs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8747;
// SLOW=N множить усі таймаути/вікна: на CI-ранері з софтверним рендером ігровий
// час тече ~4× повільніше, тож фіксовані очікування мають чекати пропорційно довше.
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
  args: ['--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
};
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errsA = [];
const errsB = [];
A.on('pageerror', (e) => errsA.push(e.message));
B.on('pageerror', (e) => errsB.push(e.message));
A.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text()); });
B.on('console', (m) => { if (m.type() === 'error') errsB.push(m.text()); });

try {
  A.setDefaultTimeout(60000);
  B.setDefaultTimeout(60000);
  // 1. хост стартує рівень САМ, гість ще навіть не в кімнаті
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 * SLOW });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  // хост встигає щось зробити: вбити 3 зомбі і відчинити хлів
  await A.evaluate(() => {
    const g = window.__game;
    g.test.god();
    const zs = g.level.zombies.list.filter((z) => z.state !== 'dead').slice(0, 3);
    for (const z of zs) z.damage(99999, null, false);
    g.level.missions.useBarn = g.level.missions.useBarn; // no-op
  });
  const hostZombies0 = await A.evaluate(() => window.__game.level.zombies.list.filter((z) => z.state !== 'dead').length);
  check('хост грає сам у кімнаті', true, `код ${code}, живих зомбі: ${hostZombies0}`);

  // 2. гість приєднується ПОСЕРЕД гри
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await B.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  check('гість одразу потрапив у рівень (mid-join)', true);
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 10, null, { timeout: 20000 * SLOW });
  const gz = await B.evaluate(() => window.__game.test.coopState().aliveZombies);
  const diff = Math.abs(gz - hostZombies0);
  check('стан долетів: зомбі збігаються (±5)', diff <= 5, `хост ${hostZombies0}, гість ${gz}`);
  const remB = await B.waitForFunction(() => window.__game.test.coopState().remotes.length === 1, null, { timeout: 10000 * SLOW }).then(() => true).catch(() => false);
  check('гість бачить хоста після mid-join', remB);

  // 3. розрив звʼязку гостя → автоматичний реконект із тим самим pid
  const pidBefore = await B.evaluate(() => window.__game.test.coopState().myPid);
  await B.evaluate(() => { window.__game.coop.session.transport.ws.close(); });
  await sleep(500 * SLOW);
  const lostSeen = await B.evaluate(() => window.__game.test.coopState().connected === false || window.__game.level.net.lost);
  check('гість помітив розрив', lostSeen);
  await B.waitForFunction(() => {
    const s = window.__game.test.coopState();
    return s.connected === true && !s.waiting;
  }, null, { timeout: 25000 * SLOW });
  const pidAfter = await B.evaluate(() => window.__game.test.coopState().myPid);
  check('реконект пройшов, pid збережено', pidAfter === pidBefore, `pid ${pidBefore} → ${pidAfter}`);
  // після реконекту стан знову свіжий
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 10, null, { timeout: 15000 * SLOW });
  check('після реконекту світ знову синхронний', true);

  // 4. гість все ще може діяти: вбити зомбі
  const gPos = await B.evaluate(() => ({ x: window.__game.level.player.pos.x, z: window.__game.level.player.pos.z }));
  await A.evaluate((p) => window.__game.test.spawnZombie('walker', p.x + 4, p.z), gPos);
  await sleep(1000 * SLOW);
  await B.evaluate(() => window.__game.test.god());
  const k0 = await B.evaluate(() => window.__game.level.stats.kills);
  for (let i = 0; i < 25 * SLOW; i++) {
    await B.evaluate(() => { window.__game.test.aimAtNearestZombie(); window.__game.test.mouse(true); });
    await sleep(120 * SLOW);
    await B.evaluate(() => { window.__game.test.mouse(false); });
    await sleep(120 * SLOW);
    const k = await B.evaluate(() => window.__game.level.stats.kills);
    if (k > k0) break;
  }
  await sleep(500 * SLOW);
  const k1 = await B.evaluate(() => window.__game.level.stats.kills);
  check('гість після реконекту далі воює', k1 > k0, `кіли ${k0} → ${k1}`);

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop3-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop3-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

console.log(failures === 0 ? '\n🎉 КООП-ТЕСТ 3 (mid-join + реконект) ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
