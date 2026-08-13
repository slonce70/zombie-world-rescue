// 🤝 Кооп-тест 2: місії через наміри гостя, reliable-гранати та megabox event.
import { openCoopTest } from './_browser.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'fs';

const RELAY_PORT = 8745;
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const T = (ms) => Math.round(ms * SLOW);


const LAUNCH = {
  args: ['--use-angle=swiftshader', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
};
const { BASE, A, B, closeTest } = await openCoopTest({ relayPort: RELAY_PORT, launch: LAUNCH, captureErrors: false });
const errsA = [];
const errsB = [];
A.on('pageerror', (e) => errsA.push(e.message));
B.on('pageerror', (e) => errsB.push(e.message));
A.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text()); });
B.on('console', (m) => { if (m.type() === 'error') errsB.push(m.text()); });

const pressE = async (page) => {
  await page.evaluate(() => window.__game.test.key('KeyE', true));
  await sleep(150);
  await page.evaluate(() => window.__game.test.key('KeyE', false));
  await sleep(150);
};

try {
  A.setDefaultTimeout(T(60000));
  B.setDefaultTimeout(T(60000));
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: T(20000) });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: T(20000) });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(400);
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level', null, { timeout: T(30000) });
  await B.waitForFunction(() => window.__game.state === 'level', null, { timeout: T(30000) });
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 10, null, { timeout: T(15000) });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());
  check('кімната і рівень готові', true, `код ${code}`);

  // ---- 1. гість відчиняє хлів (E-намір → хост → подія) ----
  const barn = await A.evaluate(() => {
    const d = window.__game.level.world.barnDoorCollider;
    return { x: d.x, z: d.z };
  });
  await B.evaluate((b) => window.__game.test.teleport(b.x, b.z - 1.5), barn);
  await sleep(600);
  // підказка з'явилась у дзеркалі?
  const promptB = await B.evaluate(() => {
    const p = window.__game.level.missions.prompt;
    return p ? p.text : null;
  });
  check('гість бачить підказку біля хліва', !!promptB && promptB.includes('хлів'), promptB || 'нема');
  for (let i = 0; i < 5; i++) {
    await pressE(B);
    const ok = await A.evaluate(() => window.__game.level.missions.missions[0].opened);
    if (ok) break;
    await sleep(800);
  }
  const barnA = await A.evaluate(() => ({
    opened: window.__game.level.missions.missions[0].opened,
    civ: window.__game.level.missions.civilians.length,
  }));
  const barnB = await B.waitForFunction(() => {
    const g = window.__game;
    const state = { opened: !!g.level.world.barnOpened, civ: g.level.missions.civilians.length };
    return state.opened && state.civ === 3 ? state : false;
  }, null, { timeout: T(20000) }).then((h) => h.jsonValue()).catch(async () => B.evaluate(() => ({
    opened: !!window.__game.level.world.barnOpened,
    civ: window.__game.level.missions.civilians.length,
  })));
  check('хост відчинив хлів за наміром гостя', barnA.opened === true);
  check('у хоста зʼявились цивільні', barnA.civ === 3, `${barnA.civ}`);
  check('у гостя хлів відчинено і цивільні є', barnB.opened && barnB.civ === 3, JSON.stringify(barnB));

  // рятувальна місія завершується за ~2с
  await A.waitForFunction(() => window.__game.level.missions.missions[0].state === 'done', null, { timeout: T(20000) });
  // ГОНКА: хост завершує місію і шле подію 'md' (нагорода +80) гостю асинхронно.
  // Раніше тут був фіксований sleep(600) + читання монет гостя — під SLOW=2 подія 'md'
  // інколи долітала ПІЗНІШЕ за 600мс, тож монети читались як 50 (нагорода вже в дорозі, ще не застосована).
  // Чекаємо саме на стан ГОСТЯ: і 'done', і нараховану нагороду — детерміновано, без гонки.
  const missionB = await B.waitForFunction(() => {
    const g = window.__game;
    return g.level.missions.missions[0].state === 'done' && g.save.coins >= 130
      ? { state: 'done', coins: g.save.coins }
      : false;
  }, null, { timeout: T(20000) }).then((h) => h.jsonValue()).catch(async () => B.evaluate(() => ({
    state: window.__game.level.missions.missions[0].state,
    coins: window.__game.save.coins,
  })));
  check('місія «порятунок» виконана у гостя теж', missionB.state === 'done');
  check('гість отримав нагороду місії (+80)', missionB.coins >= 130, `монет: ${missionB.coins}`);

  // ---- 2. граната гостя вибухає в усіх ----
  // ⏱️ Дві пастки на CPU-задушеному runner, обидві полагоджені тут:
  //  1) запал гранати — 2 ІГРОВІ секунди (`spawnGrenade`, fuse 2.0) = 40 кадрів хоста;
  //     при частці кадру на секунду це хвилини реального часу. Прискорюємо запал САМЕ
  //     цієї гранати одразу в момент спавну (а не після двох очікувань, як було) —
  //     мережний шлях (хост `_explodeAt` → `bm` → гість `netExplosion`) лишається
  //     продакшн-кодом і перевіряється чесно;
  //  2) `waitForFunction` опитує сторінку по rAF, тож між двома опитуваннями на CI
  //     проходять десятки секунд — одиночна змінна «останній gid» встигала змінитись.
  //     Складаємо ВСІ gid у список: подія більше не може проскочити повз перевірку.
  await A.evaluate(() => {
    const net = window.__game.level.net;
    const effects = window.__game.level.effects;
    window.__guestNadeGid = null;
    window.__explodedGids = [];
    const spawn = net.spawnNetGrenade.bind(net);
    net.spawnNetGrenade = (pos, vel, pid) => {
      const gid = net._nextId;
      const result = spawn(pos, vel, pid);
      if (pid === 2) {
        window.__guestNadeGid = gid;
        const nade = effects.grenadesLive.find((g) => g.gid === gid);
        if (nade) nade.fuse = 0.05;
      }
      return result;
    };
    const explode = effects._explodeAt.bind(effects);
    effects._explodeAt = (pos, radius, damage, meta) => {
      if (meta && meta.gid) window.__explodedGids.push(meta.gid);
      return explode(pos, radius, damage, meta);
    };
  });
  await B.evaluate(() => {
    const effects = window.__game.level.effects;
    window.__guestNadeGid = null;
    window.__explodedGids = [];
    const spawn = effects.spawnNetGrenade.bind(effects);
    effects.spawnNetGrenade = (gid, ...args) => {
      window.__guestNadeGid = gid;
      return spawn(gid, ...args);
    };
    const explode = effects.netExplosion.bind(effects);
    effects.netExplosion = (x, y, z, radius, gid, barrels) => {
      window.__explodedGids.push(gid);
      return explode(x, y, z, radius, gid, barrels);
    };
  });
  // teleport — test hook, тому сам не генерує input ticks. Ставимо актуальну позицію
  // в queue; urgent nade флашить її перед наміром гранати у тій самій WS-пачці.
  const thrown = await B.evaluate(() => {
    window.__game.level.player.grenades = 2;
    window.__game.level.player.grenadeCd = 0;
    window.__game.level.net._sendP();
    return window.__game.test.throwGrenade();
  });
  check('гість справді кинув гранату', thrown === true);
  // Намір гранати їде з кадром гостя, а хост його теж обробляє в кадрі — на CI це
  // десятки секунд. Тому тут не свій куций таймаут, а спільний для файлу (T(60000)).
  const gidA = await A.waitForFunction(() => window.__guestNadeGid)
    .then((h) => h.jsonValue()).catch(() => null);
  const gidB = await B.waitForFunction((gid) => window.__guestNadeGid === gid, gidA)
    .then(() => gidA).catch(() => null);
  check('конкретна граната гостя зʼявилась на обох екранах', !!gidA && gidB === gidA, `A:${gidA} B:${gidB}`);
  const explodedA = await A.waitForFunction((gid) => window.__explodedGids.includes(gid), gidA)
    .then(() => true).catch(() => false);
  const explodedB = await B.waitForFunction((gid) => window.__explodedGids.includes(gid), gidA)
    .then(() => true).catch(() => false);
  check('вибух конкретного gid дійшов на обидві сторони', explodedA && explodedB, `A:${explodedA} B:${explodedB}`);

  // ---- 3. мегабокс відкриває хост — анімація і в гостя ----
  const mb = await A.evaluate(() => {
    const m = window.__game.level.megabox;
    return { x: m.x, z: m.z };
  });
  await A.evaluate((m) => window.__game.test.teleport(m.x + 1.5, m.z), mb);
  await sleep(500);
  await pressE(A);
  await A.waitForFunction(() => window.__game.level.megabox.opened, null, { timeout: T(8000) }).catch(() => {});
  const mbA = await A.evaluate(() => window.__game.level.megabox.opened);
  const mbB = await B.waitForFunction(() => window.__game.level.megabox && window.__game.level.megabox.opened, null, { timeout: T(10000) }).then(() => true).catch(() => false);
  check('мегабокс відкрито у хоста', mbA === true);
  check('мегабокс відкрито у гостя (подія)', mbB === true);

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message);
  await A.screenshot({ path: 'shots/coop2-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop2-fail-B.png' }).catch(() => {});
} finally {
  await closeTest();
}

console.log(failures === 0 ? '\n🎉 КООП-ТЕСТ 2 ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
