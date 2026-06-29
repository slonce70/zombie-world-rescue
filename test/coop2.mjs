// 🤝 Кооп-тест 2: місії через наміри гостя, гранати, нагороди всім,
// перемога на обох екранах, повернення в лобі, відвал гостя
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8745;
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

const pressE = async (page) => {
  await page.evaluate(() => window.__game.test.key('KeyE', true));
  await sleep(150);
  await page.evaluate(() => window.__game.test.key('KeyE', false));
  await sleep(150);
};

try {
  A.setDefaultTimeout(60000);
  B.setDefaultTimeout(60000);
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(400);
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 10, null, { timeout: 15000 });
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
  await sleep(600);
  const barnA = await A.evaluate(() => ({
    opened: window.__game.level.missions.missions[0].opened,
    civ: window.__game.level.missions.civilians.length,
  }));
  const barnB = await B.evaluate(() => ({
    opened: !!window.__game.level.world.barnOpened,
    civ: window.__game.level.missions.civilians.length,
  }));
  check('хост відчинив хлів за наміром гостя', barnA.opened === true);
  check('у хоста зʼявились цивільні', barnA.civ === 3, `${barnA.civ}`);
  check('у гостя хлів відчинено і цивільні є', barnB.opened && barnB.civ === 3, JSON.stringify(barnB));

  // рятувальна місія завершується за ~2с
  await A.waitForFunction(() => window.__game.level.missions.missions[0].state === 'done', null, { timeout: 8000 });
  await sleep(600);
  const coinsB1 = await B.evaluate(() => window.__game.save.coins);
  const doneB = await B.evaluate(() => window.__game.level.missions.missions[0].state);
  check('місія «порятунок» виконана у гостя теж', doneB === 'done');
  check('гість отримав нагороду місії (+80)', coinsB1 >= 130, `монет: ${coinsB1}`);

  // ---- 2. граната гостя вибухає в усіх ----
  await B.evaluate(() => { window.__game.level.player.grenades = 2; });
  await B.evaluate(() => window.__game.test.throwGrenade());
  const appearedA = await A.waitForFunction(() => window.__game.level.effects.grenadesLive.length === 1, null, { timeout: 10000 }).then(() => true).catch(() => false);
  const appearedB = await B.waitForFunction(() => window.__game.level.effects.grenadesLive.length === 1, null, { timeout: 10000 }).then(() => true).catch(() => false);
  check('граната гостя зʼявилась на обох екранах', appearedA && appearedB, `A:${appearedA} B:${appearedB}`);
  const goneA = await A.waitForFunction(() => window.__game.level.effects.grenadesLive.length === 0, null, { timeout: 20000 }).then(() => true).catch(() => false);
  const goneB = await B.waitForFunction(() => window.__game.level.effects.grenadesLive.length === 0, null, { timeout: 20000 }).then(() => true).catch(() => false);
  check('вибух прибрав гранату всюди', goneA && goneB, `A:${goneA} B:${goneB}`);

  // ---- 3. мегабокс відкриває хост — анімація і в гостя ----
  const mb = await A.evaluate(() => {
    const m = window.__game.level.megabox;
    return { x: m.x, z: m.z };
  });
  await A.evaluate((m) => window.__game.test.teleport(m.x + 1.5, m.z), mb);
  await sleep(500);
  await pressE(A);
  await A.waitForFunction(() => window.__game.level.megabox.opened, null, { timeout: 8000 }).catch(() => {});
  const mbA = await A.evaluate(() => window.__game.level.megabox.opened);
  const mbB = await B.waitForFunction(() => window.__game.level.megabox && window.__game.level.megabox.opened, null, { timeout: 10000 }).then(() => true).catch(() => false);
  check('мегабокс відкрито у хоста', mbA === true);
  check('мегабокс відкрито у гостя (подія)', mbB === true);

  // ---- 4. решта місій + бос → перемога на обох ----
  await A.evaluate(() => {
    window.__game.test.completeMission('tower');
    window.__game.test.completeMission('warehouse');
  });
  // відкладені орди добиваємо, щойно вони стартують, поки арена не відкриється
  for (let i = 0; i < 30; i++) {
    const unlocked = await A.evaluate(() => {
      window.__game.test.finishHorde();
      return window.__game.level.missions.bossUnlocked;
    });
    if (unlocked) break;
    await sleep(1200);
  }
  await A.waitForFunction(() => window.__game.level.missions.bossUnlocked, null, { timeout: 8000 });
  const arena = await A.evaluate(() => {
    const a = window.__game.level.world.layout.arena;
    return { x: a.x, z: a.z };
  });
  await A.evaluate((a) => window.__game.test.teleport(a.x, a.z), arena);
  await A.waitForFunction(() => window.__game.level.missions.bossStarted, null, { timeout: 8000 });
  await B.waitForFunction(() => !!window.__game.level.zombies.boss, null, { timeout: 12000 }).catch(() => {});
  const bossB = await B.evaluate(() => {
    const b = window.__game.level.zombies.boss;
    return b ? { hp: b.hp, type: b.type } : null;
  });
  check('бос зʼявився у гостя', !!bossB, JSON.stringify(bossB));
  await A.evaluate(() => window.__game.test.damageBoss(99999));
  await A.waitForFunction(() => window.__game.victoryShown, null, { timeout: 15000 });
  await B.waitForFunction(() => window.__game.victoryShown, null, { timeout: 15000 });
  const libA = await A.evaluate(() => !!window.__game.save.liberated.UKR);
  const libB = await B.evaluate(() => !!window.__game.save.liberated.UKR);
  check('перемога на обох екранах', true);
  check('країну звільнено ОБОМ гравцям', libA && libB, `A:${libA} B:${libB}`);
  await B.screenshot({ path: 'shots/coop-05-victory-guest.png' });

  // ---- 5. на глобус → обидва в лобі, кімната жива ----
  await A.evaluate(() => document.getElementById('btn-victory-globe').click());
  await sleep(1500);
  const stA = await A.evaluate(() => ({ state: window.__game.state, coop: window.__game.test.coopState() }));
  const stB = await B.evaluate(() => ({ state: window.__game.state, coop: window.__game.test.coopState() }));
  check('хост повернувся в лобі', stA.state === 'globe' && stA.coop.state === 'lobby', `${stA.state}/${stA.coop.state}`);
  check('гість повернувся в лобі автоматично', stB.state === 'globe' && stB.coop.state === 'lobby', `${stB.state}/${stB.coop.state}`);
  check('кімната жива, ростер цілий', stA.coop.roster.length === 2 && stB.coop.roster.length === 2);
  await A.screenshot({ path: 'shots/coop-06-back-to-lobby.png' });

  // ---- 6. другий рівень з того ж лобі ----
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 10, null, { timeout: 15000 });
  check('другий рівень з того ж лобі працює', true);

  // ---- 7. гість зникає — хост живе далі ----
  await browserB.close();
  await A.waitForFunction(() => window.__game.test.coopState().roster.length === 1, null, { timeout: 15000 }).catch(() => {});
  const afterDrop = await A.evaluate(() => ({
    roster: window.__game.test.coopState().roster.length,
    remotes: window.__game.test.coopState().remotes.length,
    state: window.__game.state,
  }));
  check('хост помітив відвал гостя і грає далі', afterDrop.roster === 1 && afterDrop.remotes === 0 && afterDrop.state === 'level', JSON.stringify(afterDrop));

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
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

console.log(failures === 0 ? '\n🎉 КООП-ТЕСТ 2 ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
