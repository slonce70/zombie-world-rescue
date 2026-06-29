// 🤝 Кооп-тест: дві вкладки → кімната → лобі → спільний рівень → синхронізація
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { spawnRelay } from './_relay.mjs';

const PORT = 8741;
const BASE = `http://localhost:${PORT}`;
const RELAY_PORT = 8743;
const RELAY = `ws://localhost:${RELAY_PORT}`;
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
async function ready() {
  try {
    const r = await fetch(`${BASE}/version.json`, { cache: 'no-store' });
    return r.ok;
  } catch (e) {
    return false;
  }
}
async function waitReady() {
  for (let i = 0; i < 50; i++) {
    if (await ready()) return;
    await sleep(100);
  }
  throw new Error(`${BASE}/version.json не відповів`);
}

let server = null;
if (!(await ready())) {
  server = spawn('python3', ['-m', 'http.server', String(PORT)], { stdio: 'ignore' });
  process.on('exit', () => server?.kill());
  await waitReady();
}
// власний relay на окремому порту — тест самодостатній
const relay = await spawnRelay(RELAY_PORT);

// два ОКРЕМІ браузери: у headless фонова вкладка майже не отримує кадрів,
// а хост мусить крутити світ безперервно
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
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errsA = [];
const errsB = [];
A.on('pageerror', (e) => errsA.push(e.message));
B.on('pageerror', (e) => errsB.push(e.message));
A.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text()); });
B.on('console', (m) => { if (m.type() === 'error') errsB.push(m.text()); });

async function flushGuestPose() {
  await B.evaluate(() => {
    const net = window.__game && window.__game.level && window.__game.level.net;
    if (net && typeof net._sendP === 'function') {
      net._sendP();
      if (net.session && net.session.transport && typeof net.session.transport._flush === 'function') {
        net.session.transport._flush();
      }
    }
  });
}

async function flushHostSnapshot() {
  await A.evaluate(() => {
    const g = window.__game;
    const net = g && g.level && g.level.net;
    if (net && typeof net._snapshot === 'function' && net.session && net.session.transport) {
      net.session.transport.broadcast(net._snapshot(), true);
    }
  });
}

try {
  // 1. обидва на глобусі
  A.setDefaultTimeout(60000);
  B.setDefaultTimeout(60000);
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`);
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 });
  check('обидва клієнти на глобусі', true);

  // хост обирає улюбленця ДО створення кімнати — друг має побачити його поряд (повний синк)
  await A.evaluate(() => { const g = window.__game; if (!g.save.pets.includes('cat')) g.save.pets.push('cat'); g.save.activePet = 'cat'; });

  // 2. хост створює кімнату
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  check('кімнату створено', typeof code === 'string' && code.length === 4, `код ${code}`);
  await A.evaluate(() => { window.__game.coop._openLobby(); });
  await sleep(300);
  await A.screenshot({ path: 'shots/coop-01-lobby-host.png' });

  // 3. гість приєднується
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(500);
  const rosterA = await A.evaluate(() => window.__game.test.coopState().roster);
  const rosterB = await B.evaluate(() => window.__game.test.coopState().roster);
  check('хост бачить 2 гравців у ростері', rosterA.length === 2, JSON.stringify(rosterA));
  check('гість бачить 2 гравців у ростері', rosterB.length === 2, JSON.stringify(rosterB));
  await B.evaluate(() => { window.__game.coop._openLobby(); });
  await sleep(300);
  await B.screenshot({ path: 'shots/coop-02-lobby-guest.png' });

  // 4. хост стартує Україну
  await A.evaluate(() => {
    window.__game.test.coopSetCountry('UKR');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
  check('обидва увійшли в рівень', true);

  // 5. гість отримує стан: зомбі-маріонетки і предмети
  await B.waitForFunction(() => {
    const s = window.__game.test.coopState();
    return s.aliveZombies > 10 && s.items > 5;
  }, null, { timeout: 15000 }).catch(() => {});
  const sB = await B.evaluate(() => window.__game.test.coopState());
  check('гість отримав зомбі від хоста', sB.aliveZombies > 10, `зомбі: ${sB.aliveZombies}`);
  check('гість отримав предмети від хоста', sB.items > 5, `предметів: ${sB.items}`);
  // 🐾 повний синк: гість бачить улюбленця хоста (кошеня)
  check('гість бачить улюбленця хоста (кошеня)', Object.values(sB.remotePets).includes('cat'), JSON.stringify(sB.remotePets));

  // 6. обидва бачать одне одного
  await A.waitForFunction(() => window.__game.test.coopState().remotes.length === 1, null, { timeout: 8000 }).catch(() => {});
  const remA = await A.evaluate(() => window.__game.test.coopState().remotes);
  const remB = await B.evaluate(() => window.__game.test.coopState().remotes);
  check('хост бачить гостя в світі', remA.length === 1, JSON.stringify(remA));
  check('гість бачить хоста в світі', remB.length === 1, JSON.stringify(remB));

  // 7. рух хоста видно гостю
  const before = await B.evaluate(() => window.__game.test.coopState().remotePos[1]);
  await A.evaluate(() => window.__game.test.key('KeyW', true));
  await sleep(1500);
  await A.evaluate(() => window.__game.test.key('KeyW', false));
  let moved = 0;
  for (let i = 0; i < 20 && moved <= 2; i++) {
    await sleep(500);
    const after = await B.evaluate(() => window.__game.test.coopState().remotePos[1]);
    moved = before && after ? Math.hypot(after.x - before.x, after.z - before.z) : 0;
  }
  check('рух хоста синхронізується', moved > 2, `зсув ${moved.toFixed(1)}м`);

  // 8. ставимо гостя поруч із хостом, дивимось одне на одного (скріншоти)
  const hostPos = await A.evaluate(() => {
    const p = window.__game.level.player.pos;
    return { x: p.x, y: p.y, z: p.z };
  });
  await B.evaluate((hp) => {
    window.__game.test.teleport(hp.x + 3, hp.z + 1);
    window.__game.test.god();
  }, hostPos);
  for (let i = 0; i < 12 * SLOW; i++) {
    await flushGuestPose();
    await sleep(250);
    const hostHasGuest = await A.evaluate(() => {
      const r = window.__game.level && window.__game.level.net && window.__game.level.net.remotes.get(2);
      return !!(r && r.pos);
    });
    if (hostHasGuest) break;
  }
  await A.waitForFunction(() => {
    const r = window.__game.level && window.__game.level.net && window.__game.level.net.remotes.get(2);
    return !!(r && r.pos);
  }, null, { timeout: 15000 * SLOW }).catch(() => {});
  await B.waitForFunction(() => {
    const r = window.__game.level && window.__game.level.net && window.__game.level.net.remotes.get(1);
    return !!(r && r.pos);
  }, null, { timeout: 15000 * SLOW }).catch(() => {});
  // хост дивиться на гостя
  const hostCanAimGuest = await A.evaluate(() => {
    const g = window.__game;
    const rp = g.level.net.remotes.get(2);
    if (!rp || !rp.pos) return false;
    const p = g.level.player;
    const dx = rp.pos.x - p.pos.x, dz = rp.pos.z - p.pos.z;
    g.test.setAim(Math.atan2(-dx, -dz), 0);
    return true;
  });
  check('хост має позицію гостя для огляду', hostCanAimGuest);
  await sleep(400);
  await A.screenshot({ path: 'shots/coop-03-host-sees-guest.png' });
  const guestCanAimHost = await B.evaluate(() => {
    const g = window.__game;
    const rp = g.level.net.remotes.get(1);
    if (!rp || !rp.pos) return false;
    const p = g.level.player;
    const dx = rp.pos.x - p.pos.x, dz = rp.pos.z - p.pos.z;
    g.test.setAim(Math.atan2(-dx, -dz), 0);
    return true;
  });
  check('гість має позицію хоста для огляду', guestCanAimHost);
  await sleep(400);
  await B.screenshot({ path: 'shots/coop-04-guest-sees-host.png' });

  // 9. хост спавнить зомбі біля гостя; гість його перемагає → кредит гостю
  const gPos = await B.evaluate(() => {
    const p = window.__game.level.player.pos;
    return { x: p.x, z: p.z };
  });
  // свіжий базлайн прямо перед спавном + полінг: headless-кадри бувають 1-3fps,
  // фіксованих 700мс на снапшот не вистачає
  const beforeSpawn = await B.evaluate(() => window.__game.test.coopState().aliveZombies);
  await A.evaluate((gp) => {
    window.__game.test.god();
    window.__game.test.spawnZombie('walker', gp.x + 5, gp.z);
  }, gPos);
  let guestSeesNew = beforeSpawn;
  for (let i = 0; i < 20 && guestSeesNew <= beforeSpawn; i++) {
    await sleep(400);
    guestSeesNew = await B.evaluate(() => window.__game.test.coopState().aliveZombies);
  }
  check('новий зомбі долетів до гостя', guestSeesNew > beforeSpawn, `${beforeSpawn} → ${guestSeesNew}`);

  const killsBefore = await B.evaluate(() => window.__game.test.state().stats.kills);
  // гість розстрілює найближчого зомбі
  for (let i = 0; i < 30; i++) {
    const d = await B.evaluate(() => window.__game.test.aimAtNearestZombie());
    if (d === null) break;
    await B.evaluate(() => { window.__game.test.mouse(true); });
    await sleep(120);
    await B.evaluate(() => { window.__game.test.mouse(false); });
    await sleep(120);
    const k = await B.evaluate(() => window.__game.test.state().stats.kills);
    if (k > killsBefore) break;
  }
  await sleep(800);
  const killsAfter = await B.evaluate(() => window.__game.test.state().stats.kills);
  check('гість вполював зомбі (кредит за кіл)', killsAfter > killsBefore, `кіли: ${killsBefore} → ${killsAfter}`);

  // 10. зʼєднання живе. kill-credit вище ВЖЕ довів двосторонній канал (гість→хост→гість).
  // `waiting` — це real-time UI-вотчдог (показує оверлей після >4с тиші хоста) і перераховується
  // лише в rAF-циклі гостя; під тротлінгом rAF у headless він латчиться попри живий канал, тож
  // НЕ показовий у тесті. Перевіряємо саме transport.connected — справжній сигнал «онлайн»
  // (реальний обрив → connected=false → впаде).
  await flushHostSnapshot();
  await sleep(300 * SLOW);
  const wA = await A.evaluate(() => window.__game.test.coopState());
  const wB = await B.evaluate(() => window.__game.test.coopState());
  check('хост онлайн', wA.connected === true);
  check('гість онлайн', wB.connected === true);

  // 11. помилки консолі
  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message);
  await A.screenshot({ path: 'shots/coop-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close();
  await browserB.close();
  relay.kill();
  server?.kill();
}

console.log(failures === 0 ? '\n🎉 КООП-ТЕСТ ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
