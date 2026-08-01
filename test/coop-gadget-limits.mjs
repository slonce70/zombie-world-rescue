// 🛡️🌐 Канал гаджетів у коопі: хост не вірить гостю на слово.
// Чесний гість ставить свої речі як завжди; та сама сторона, що шле пачку
// повідомлень, отримує рівно дозволене — решта тихо зникає (звʼязок не рветься).
// Право на картковий слід виводиться з того, що хост САМ роздав (подія `dro`).
//
// Повідомлення шлемо urgent-каналом (як `sendNade`): транспорт інакше складає їх
// у пачку по 100 мс, і темп на боці хоста залежав би від тротлінгу фонової вкладки,
// а не від тесту. Створене хостом рахуємо лічильником на самому хості — так
// перевірка не залежить від того, чи встигла пляма догоріти до заміру.
import { setTimeout as sleep } from 'node:timers/promises';
import { openCoopTest, makeCheck, waitFor } from './_browser.mjs';

const RELAY_PORT = 8779;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, RELAY, A, B, errors, closeTest } = await openCoopTest({ relayPort: RELAY_PORT });
let failed = 0;
const check = makeCheck(() => failed++);

// що бачить ХОСТ у своєму світі (стеля рахується саме тут)
const hostView = (pid) => {
  const gd = window.__game.level.gadgets;
  return {
    walls: gd.walls.filter((w) => w.ownerPid === pid).length,
    hostWalls: gd.walls.filter((w) => w.ownerPid === 1).length,
    tramps: gd.tramps.filter((tr) => tr.ownerPid === pid).length,
    turrets: gd.turrets.filter((tu) => tu.ownerPid === pid).length,
    fires: gd._meteorFires.length,
    made: window.__ft.n,
    strong: window.__ft.strong,
  };
};

// 4 РІЗНІ точки поруч із гостем, у які світ справді пускає гаджет (світ у обох той самий).
// Точки рознесені на 2.6 м, щоб барикада (колайдери ±0.85 м + радіус 0.55) не перекривала
// сусідню: інакше перевірки були б беззмістовні — гаджет не ставав би через МІСЦЕ, а не
// через ліміт. Радіус тримаємо ≤4 м, добре в межах хостового гейта відстані (6 м).
const pickSpots = () => {
  const g = window.__game;
  const p = g.level.player.pos;
  const out = [];
  for (const r of [2.4, 3.2, 4]) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const s = g.level.world.collide(x, z, 0.7);
      if (Math.hypot(s.x - x, s.z - z) > 0.4) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 2.6)) continue;
      out.push({ x, z });
      if (out.length === 4) return out;
    }
  }
  return out;
};

// у гостя: шлемо повідомлення каналу гаджетів БЕЗ пакування в пачку
const armGuest = () => {
  window.__send = (kind, x, z, hyper) => window.__game.coop.session.transport.send(1, {
    t: 'gadget', kind, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yaw: 0, hyper: hyper ? 1 : 0,
  }, true);
};

// у хоста: лічильник створених слідів (пляма живе 2.4с — на «зараз живих» покладатись не можна)
const armHost = () => {
  const gd = window.__game.level.gadgets;
  window.__ft = { n: 0, strong: false };
  const orig = gd.hostFireTrail.bind(gd);
  gd.hostFireTrail = (x, z, strong) => {
    window.__ft.n++;
    window.__ft.strong = window.__ft.strong || !!strong;
    return orig(x, z, strong);
  };
};

try {
  console.log('▸ Кооп: ліміти каналу гаджетів');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  const code = await A.evaluate(async () => {
    const g = window.__game;
    g.save.liberated = { UKR: true };
    return g.test.coopCreate('Тато');
  });
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await A.evaluate(() => {
    window.__game.test.coopSetMode('storm');
    window.__game.test.coopSetCountry('UKR');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.storm && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.storm && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());
  await A.waitForFunction(() => window.__game.level.net.remotes.size === 1, null, { timeout: 30000 * SLOW });

  const pid = await A.evaluate(() => [...window.__game.level.net.remotes.keys()][0]);
  await A.evaluate(armHost);
  await B.evaluate(armGuest);
  const spots = await B.evaluate(pickSpots);
  check(spots.length === 4, 'знайшли 4 вільні місця для гаджетів поруч із гостем', String(spots.length));
  const [sWall, sTramp, sBurst, sFire] = spots;
  const view = () => A.evaluate(hostView, pid);
  // кадр хоста під софт-рендером буває довгим — на чесне чекаємо, а не спимо навмання
  const until = (fn, label) => waitFor(async () => fn(await view()), 12000 * SLOW, label);

  // ── 1. Чесна барикада + одразу пачка у ВІЛЬНЕ місце ────────────────────────
  await B.evaluate(([one, many]) => {
    window.__send('wall', one.x, one.z, false);
    for (let i = 0; i < 25; i++) window.__send('wall', many.x, many.z, false);
  }, [sWall, sBurst]);
  await until((v) => v.walls >= 1, 'чесна барикада гостя');
  await sleep(900 * SLOW);
  let now = await view();
  check(now.walls === 1, 'із «чесна + 25 у пачці» хост створив рівно одну барикаду', JSON.stringify(now));

  // ── 2. Інший тип має власний бюджет ────────────────────────────────────────
  await B.evaluate((s) => window.__send('tramp', s.x, s.z, false), sTramp);
  await until((v) => v.tramps >= 1, 'батут гостя');
  now = await view();
  check(now.tramps === 1, 'батут одразу після барикади стає — бюджети типів окремі', JSON.stringify(now));

  // ── 3. Невідомий тип у каналі ──────────────────────────────────────────────
  const before = await view();
  await B.evaluate((s) => {
    for (const kind of ['mine', 'clone', 'poisonpuddle', '']) window.__send(kind, s.x, s.z, false);
  }, sFire);
  await sleep(700 * SLOW);
  now = await view();
  check(now.walls === before.walls && now.tramps === before.tramps && now.turrets === before.turrets
    && now.made === before.made, 'невідомий тип нічого не створює', JSON.stringify(now));

  // ── 4. Картковий слід БЕЗ роздачі: хост такої картки гостю не давав ────────
  await B.evaluate(async (s) => {
    for (let i = 0; i < 12; i++) {
      window.__send('firetrail', s.x, s.z, true);
      await new Promise((r) => setTimeout(r, 60));
    }
  }, sFire);
  await sleep(700 * SLOW);
  now = await view();
  check(now.made === 0, 'слід від гостя без роздачі картки не створює вогню', JSON.stringify(now));

  // ── 4b. Спільна збірка забігу: право БЕЗ жодної роздачі ────────────────────
  // Кооп-Експедиція і Фронт віддають гостю ту саму збірку забігу, що й хосту, тож
  // хост звіряє слід із нею (`_sharedBuild`). Піднімати заради цього цілу експедицію
  // дорого — підставляємо хосту саме те поле, яке той режим і кладе на рівень.
  await A.evaluate(() => { window.__game.level.operation = { build: ['firetrail'] }; });
  await B.evaluate(async (s) => {
    for (let i = 0; i < 3; i++) {
      window.__send('firetrail', s.x, s.z, true);
      await new Promise((r) => setTimeout(r, 330));
    }
  }, sFire);
  await until((v) => v.made >= 3, 'слід за спільною збіркою');
  const shared = await view();
  check(shared.made === 3, 'слід за спільною збіркою проходить без жодної роздачі', JSON.stringify(shared));
  check(shared.strong === false, 'одне входження у збірці — слід слабкий попри hyper=1', JSON.stringify(shared));

  // збірки не стало — право зникло разом з нею
  await A.evaluate(() => { window.__game.level.operation = null; });
  await B.evaluate(async (s) => {
    for (let i = 0; i < 3; i++) {
      window.__send('firetrail', s.x, s.z, true);
      await new Promise((r) => setTimeout(r, 330));
    }
  }, sFire);
  await sleep(700 * SLOW);
  const dropped = await view();
  check(dropped.made === shared.made, 'без спільної збірки слід знову відхиляється', JSON.stringify(dropped));

  // ── 5. Хост роздав картку саме цьому гостю (та сама подія, що у Штормі) ────
  await A.evaluate((p) => window.__game.level.netEv('dro', p, ['firetrail']), pid);
  await sleep(600 * SLOW);
  await B.evaluate(async (s) => {
    for (let i = 0; i < 5; i++) {
      window.__send('firetrail', s.x, s.z, true);
      await new Promise((r) => setTimeout(r, 330));
    }
  }, sFire);
  await until((v) => v.made >= dropped.made + 5, 'пʼять чесних слідів');
  const honest = await view();
  check(honest.made - dropped.made === 5, 'чесний слід у Штормі падає без жодного пропуску', JSON.stringify(honest));
  check(honest.strong === false, 'картку роздали раз — слід лишається слабким попри hyper=1', JSON.stringify(honest));

  // ── 6. Пачка слідів: не по обʼєкту на повідомлення ─────────────────────────
  await B.evaluate((s) => {
    for (let i = 0; i < 60; i++) window.__send('firetrail', s.x, s.z, true);
  }, sFire);
  await sleep(700 * SLOW);
  const burst = await view();
  check(burst.made - honest.made <= 4, 'пачка з 60 слідів додала лічені одиниці',
    JSON.stringify({ honest: honest.made, burst: burst.made }));
  check(burst.fires <= 12, 'одночасно живих плям не більше за стелю', JSON.stringify(burst));

  // ── 7. Хост сам собі авторитет: його гаджети лімітом не зачеплені ──────────
  const hostPlaced = await A.evaluate(() => {
    const g = window.__game;
    const p = g.level.player.pos;
    const was = g.level.gadgets.walls.filter((w) => w.ownerPid === 1).length;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 2.4;
      const z = p.z + Math.sin(a) * 2.4;
      const s = g.level.world.collide(x, z, 0.7);
      if (Math.hypot(s.x - x, s.z - z) <= 0.4) g.level.gadgets.placeWallAt(s.x, s.z, 0, 1);
    }
    return { was, now: g.level.gadgets.walls.filter((w) => w.ownerPid === 1).length };
  });
  check(hostPlaced.now > hostPlaced.was, 'хост ставить свої барикади поспіль без обмежень',
    JSON.stringify(hostPlaced));

  // ── 8. Звʼязок цілий: гість і далі в кімнаті ───────────────────────────────
  const alive = await A.evaluate(() => ({
    remotes: window.__game.level.net.remotes.size,
    roster: window.__game.coop.session.roster.size,
  }));
  check(alive.remotes === 1 && alive.roster === 2, 'кімната не розірвалась через понадлімітні пакети',
    JSON.stringify(alive));
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await closeTest();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 ЛІМІТИ КАНАЛУ ГАДЖЕТІВ ПРАЦЮЮТЬ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
