// 🤝 Кооп-тест 4: підняття пораненого тіммейта (в обидва боки) + песик друзям
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8749;
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
  // у хоста є песик — ще ДО створення кімнати (v63: улюбленці через save.pets/activePet)
  await A.evaluate(() => { const g = window.__game; if (!g.save.pets.includes('dog')) g.save.pets.push('dog'); g.save.activePet = 'dog'; g.saveGame(); });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(400);
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 10, null, { timeout: 20000 });
  check('рівень готовий', true, `код ${code}`);

  // ---- 1. 🐶 гість бачить песика хоста ----
  await B.waitForFunction(() => {
    const rp = window.__game.level.net.remotes.get(1);
    return rp && rp.pet && rp.pet.group.visible;
  }, null, { timeout: 12000 }).catch(() => {});
  const dogB = await B.evaluate(() => {
    const rp = window.__game.level.net.remotes.get(1);
    return rp && rp.pet ? rp.pet.group.visible : false;
  });
  check('песик хоста видимий гостю', dogB === true);

  // ---- 2. 💀→💚 гість падає, хост піднімає ----
  // ставимо їх поруч
  const hp0 = await A.evaluate(() => ({ x: window.__game.level.player.pos.x, z: window.__game.level.player.pos.z }));
  await B.evaluate((p) => window.__game.test.teleport(p.x + 2, p.z), hp0);
  await sleep(700);
  await B.evaluate(() => {
    const p = window.__game.level.player;
    p.respawnProtect = 0;
    p.takeDamage(9999, p.pos.x + 1, p.pos.z);
  });
  await sleep(400);
  const downedB = await B.evaluate(() => ({
    hp: window.__game.level.player.health,
    deathT: window.__game.deathT,
  }));
  check('гість поранений: лежить і чекає (20с)', downedB.hp <= 0 && downedB.deathT > 15, JSON.stringify(downedB));
  // хост бачить тіло
  await A.waitForFunction(() => {
    const rp = window.__game.level.net.remotes.get(2);
    return rp && rp.health <= 0;
  }, null, { timeout: 8000 });
  // хост біля тіла тримає E
  await sleep(300);
  const promptA = await A.evaluate(() => {
    const p = window.__game.level.missions.prompt;
    return p ? p.text : null;
  });
  check('хост бачить підказку «підніми Влада»', !!promptA && promptA.includes('підніми'), promptA || 'нема');
  await A.screenshot({ path: 'shots/coop-08-revive-prompt.png' });
  // тримаємо E, поки гість не встане
  await A.evaluate(() => window.__game.test.key('KeyE', true));
  const t0 = Date.now();
  let revOk = false;
  while (Date.now() - t0 < 12000) {
    await sleep(300);
    const hp = await B.evaluate(() => window.__game.level.player.health);
    if (hp > 0) { revOk = true; break; }
  }
  await A.evaluate(() => window.__game.test.key('KeyE', false));
  const afterRev = await B.evaluate(() => ({
    hp: window.__game.level.player.health,
    max: window.__game.level.player.maxHealth,
    deathT: window.__game.deathT,
  }));
  check('хост підняв гостя (50% HP, без телепорта)', revOk && afterRev.hp === Math.ceil(afterRev.max * 0.5) && afterRev.deathT < 0, JSON.stringify(afterRev));

  // ---- 3. 💀→💚 навпаки: хост падає, гість піднімає ----
  await A.evaluate(() => {
    const p = window.__game.level.player;
    p.respawnProtect = 0;
    p.takeDamage(9999, p.pos.x + 1, p.pos.z);
  });
  await sleep(400);
  const downedA = await A.evaluate(() => ({ hp: window.__game.level.player.health, deathT: window.__game.deathT }));
  check('хост поранений і чекає', downedA.hp <= 0 && downedA.deathT > 15, JSON.stringify(downedA));
  await B.waitForFunction(() => {
    const rp = window.__game.level.net.remotes.get(1);
    return rp && rp.health <= 0;
  }, null, { timeout: 8000 });
  await B.evaluate(() => window.__game.test.key('KeyE', true));
  const t1 = Date.now();
  let revOk2 = false;
  while (Date.now() - t1 < 12000) {
    await sleep(300);
    const hp = await A.evaluate(() => window.__game.level.player.health);
    if (hp > 0) { revOk2 = true; break; }
  }
  await B.evaluate(() => window.__game.test.key('KeyE', false));
  const afterRev2 = await A.evaluate(() => ({ hp: window.__game.level.player.health, deathT: window.__game.deathT }));
  check('гість підняв хоста', revOk2 && afterRev2.hp > 0 && afterRev2.deathT < 0, JSON.stringify(afterRev2));

  // ---- 4. без друга поруч — звичайний респавн біля бази ----
  await B.evaluate(() => {
    window.__game.test.teleport(120, 120); // далеко від хоста
    const p = window.__game.level.player;
    p.respawnProtect = 0;
    p.takeDamage(9999, p.pos.x + 1, p.pos.z);
    window.__game.deathT = 1.5; // не чекаємо всі 20с у тесті
  });
  await B.waitForFunction(() => window.__game.level.player.health > 0, null, { timeout: 15000 });
  const spawned = await B.evaluate(() => {
    const p = window.__game.level.player;
    const S = window.__game.level.world.layout.SPAWN;
    return { full: p.health === p.maxHealth, atBase: Math.hypot(p.pos.x - S.x, p.pos.z - S.z) < 10 };
  });
  check('самотня смерть → респавн біля бази з повним HP', spawned.full && spawned.atBase, JSON.stringify(spawned));

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop4-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop4-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

console.log(failures === 0 ? '\n🎉 КООП-ТЕСТ 4 (підняття + песик) ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
