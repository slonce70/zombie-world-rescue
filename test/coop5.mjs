// ⛈️🤝 Кооп-тест 5: Шторм разом — дзеркало кола, масштаб хвиль,
// «лежи і чекай підняття», фінал «всі впали»
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:8741';
const RELAY_PORT = 8751;
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = spawn('node', ['relay/dev-relay.mjs'], {
  env: { ...process.env, PORT: String(RELAY_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await sleep(600);

const LAUNCH = {
  args: ['--use-angle=swiftshader', '--disable-background-timer-throttling',
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
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
  // хост уже звільнив Україну
  await A.evaluate(() => {
    window.__game.save.liberated = { UKR: true };
    window.__game.saveGame();
  });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(400);

  // 1. режим «Шторм» у лобі
  await A.evaluate(() => {
    window.__game.test.coopSetMode('storm');
    window.__game.test.coopSetCountry('UKR');
  });
  await sleep(500);
  const modeB = await B.evaluate(() => window.__game.coop.session.mode);
  check('гість бачить режим «Шторм»', modeB === 'storm');

  // 2. старт: обидва у штормі
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level.storm, null, { timeout: 40000 });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level.storm, null, { timeout: 40000 });
  check('обидва у Штормі', true);
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());

  // 3. масштаб хвилі: 2 гравці → (5+3)×1.6 = 13
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 5, null, { timeout: 20000 });
  const waveSize = await A.evaluate(() => window.__game.level.zombies.list.filter((z) => z.state !== 'dead' && z._stormWave).length);
  check('хвиля масштабована на 2 гравців (≈13)', waveSize >= 12 && waveSize <= 14, `зомбі у хвилі: ${waveSize}`);

  // 4. коло синхронне
  await sleep(2500);
  const rA = await A.evaluate(() => Math.round(window.__game.level.storm.r));
  const rB = await B.evaluate(() => Math.round(window.__game.level.storm.r));
  check('радіус кола синхронний (±3)', Math.abs(rA - rB) <= 3, `A:${rA} B:${rB}`);
  const waveB = await B.evaluate(() => window.__game.level.storm.wave);
  check('номер хвилі долетів гостю', waveB === 1, `wave ${waveB}`);

  // 5. гість падає → лежить і чекає (без авто-респавна)
  const hostPos = await A.evaluate(() => ({ x: window.__game.level.player.pos.x, z: window.__game.level.player.pos.z }));
  await B.evaluate((p) => window.__game.test.teleport(p.x + 2, p.z), hostPos);
  await sleep(600);
  await B.evaluate(() => {
    const p = window.__game.level.player;
    p.respawnProtect = 0;
    p.takeDamage(9999, p.pos.x + 1, p.pos.z);
  });
  await sleep(600);
  const downB = await B.evaluate(() => ({ hp: window.__game.level.player.health, deathT: window.__game.deathT, over: window.__game.level.storm.over }));
  check('гість лежить (deathT великий, забіг триває)', downB.hp <= 0 && downB.deathT > 900 && !downB.over, JSON.stringify(downB));

  // 6. хост піднімає — гра триває
  await A.evaluate(() => window.__game.test.key('KeyE', true));
  const t0 = Date.now();
  let revived = false;
  while (Date.now() - t0 < 15000) {
    await sleep(300);
    const hp = await B.evaluate(() => window.__game.level.player.health);
    if (hp > 0) { revived = true; break; }
  }
  await A.evaluate(() => window.__game.test.key('KeyE', false));
  check('хост підняв гостя у штормі', revived);

  // 7. всі впали → фінал у ОБОХ
  await B.evaluate(() => {
    const p = window.__game.level.player;
    p.respawnProtect = 0;
    p.takeDamage(9999, p.pos.x + 1, p.pos.z);
  });
  await A.evaluate(() => {
    const p = window.__game.level.player;
    p.respawnProtect = 0;
    p.takeDamage(9999, p.pos.x + 1, p.pos.z);
  });
  await A.waitForFunction(() => window.__game.level && window.__game.level.storm.over, null, { timeout: 15000 });
  await B.waitForFunction(() => window.__game.level && window.__game.level.storm.over, null, { timeout: 15000 });
  const endA = await A.evaluate(() => ({
    overlay: document.getElementById('overlay-storm-end').classList.contains('show'),
    retryHidden: document.getElementById('btn-storm-retry').style.display === 'none',
    best: window.__game.save.stormBest.UKR ? window.__game.save.stormBest.UKR.wave : 0,
  }));
  const endB = await B.evaluate(() => ({
    overlay: document.getElementById('overlay-storm-end').classList.contains('show'),
    best: window.__game.save.stormBest.UKR ? window.__game.save.stormBest.UKR.wave : 0,
  }));
  check('фінал шторму показано обом', endA.overlay && endB.overlay);
  check('кнопку «Ще раз» приховано в коопі', endA.retryHidden);
  check('рекорд записано обом', endA.best >= 1 && endB.best >= 1, `A:${endA.best} B:${endB.best}`);
  await B.screenshot({ path: 'shots/coop-storm-end.png' });

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop5-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop5-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
}

console.log(failures === 0 ? '\n🎉 КООП-ШТОРМ ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
