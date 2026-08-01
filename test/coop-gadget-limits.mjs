// 🛡️🌐 Канал гаджетів у коопі: хост не вірить гостю на слово.
// Чесний гість ставить свої речі як завжди; та сама сторона, що шле пачку
// повідомлень, отримує рівно дозволене — решта тихо зникає (звʼязок не рветься).
// Право на картковий слід іде від ПІДТВЕРДЖЕНОГО вибору гостя (`dpk`) або спільної
// збірки забігу; посилення гаджета — від гіперзаряду, який гість оголосив при вході.
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
    meteors: window.__mt.n,
    meteorHyper: window.__mt.hyper,
    roomWalls: gd.walls.length,
  };
};

// 5 РІЗНИХ точок поруч із гостем, у які світ справді пускає гаджет (світ у обох той самий).
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
      if (out.length === 5) return out;
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
  // ☄️ метеорит: гіпер-версія лишає вогнище вже після падіння, тож ловимо саме
  // рішення хоста — з яким `hyper` він викликав метеорит гостя
  window.__mt = { n: 0, hyper: null };
  const origMeteor = gd.hostMeteor.bind(gd);
  gd.hostMeteor = (x, z, hyper) => {
    window.__mt.n++;
    window.__mt.hyper = !!hyper;
    return origMeteor(x, z, hyper);
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
  // ⚡ гість чесно купив гіперзаряд ТУРЕЛІ (і тільки її) — оголошення їде в hello
  await B.evaluate((c) => {
    window.__game.save.gadgetHypers = ['turret'];
    return window.__game.test.coopJoin(c, 'Влад');
  }, code);
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
  check(spots.length === 5, 'знайшли 5 вільних місць для гаджетів поруч із гостем', String(spots.length));
  const [sWall, sTramp, sBurst, sFire, sRoom] = spots;
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

  // ── 5. Хост роздав набір, гість ОБРАВ картку (dpk, PROTO 26) ──────────────
  await A.evaluate((p) => window.__game.level.netEv('dro', p, ['firetrail']), pid);
  const picked = await waitFor(() => B.evaluate(() => {
    const g = window.__game;
    const i = g.draft.isOpen ? g.draft.offered.findIndex((c) => c.id === 'firetrail') : -1;
    if (i < 0) return false;
    g.draft.pick(i); // рівно те, що робить тап по картці: стат локально + dpk хосту
    return true;
  }), 20000 * SLOW, 'гість обирає картку');
  check(picked, 'гість отримав набір і обрав із нього картку');
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
  check(honest.strong === false, 'картку взяли раз — слід лишається слабким попри hyper=1', JSON.stringify(honest));

  // ── 6. Пачка слідів: не по обʼєкту на повідомлення ─────────────────────────
  await B.evaluate((s) => {
    for (let i = 0; i < 60; i++) window.__send('firetrail', s.x, s.z, true);
  }, sFire);
  await sleep(700 * SLOW);
  const burst = await view();
  check(burst.made - honest.made <= 4, 'пачка з 60 слідів додала лічені одиниці',
    JSON.stringify({ honest: honest.made, burst: burst.made }));
  check(burst.fires <= 12, 'одночасно живих плям не більше за стелю', JSON.stringify(burst));

  // ── 6b. Чесно куплений гіперзаряд гостя знову працює ──────────────────────
  // (гість оголосив у hello тільки 'turret'; батут колайдера не лишає, тож його місце вільне)
  await B.evaluate((s) => window.__send('turret', s.x, s.z, true), sTramp);
  await until((v) => v.turrets >= 1, 'турель гостя');
  const turret = await A.evaluate((p) => {
    const g = window.__game;
    const gd = g.level.gadgets;
    const guest = gd.turrets.find((tu) => tu.ownerPid === p);
    // еталон: така сама турель, поставлена ХОСТОМ і свідомо без гіперзаряду
    const q = g.level.player.pos;
    const s = g.level.world.collide(q.x + 2.4, q.z, 0.7);
    gd.placeTurretAt(s.x, s.z, 1, false);
    const own = gd.turrets.find((tu) => tu.ownerPid === 1);
    return {
      guest: guest ? { hp: guest.hp, dmg: guest.dmg } : null,
      plain: own ? { hp: own.hp, dmg: own.dmg } : null,
      declared: (g.coop.session.roster.get(p) || {}).hyp,
    };
  }, pid);
  check(!!turret.guest, 'турель гостя стала у хоста', JSON.stringify(turret));
  check(Array.isArray(turret.declared) && turret.declared.length === 1 && turret.declared[0] === 'turret',
    'хост знає оголошений гіперзаряд гостя і тільки його', JSON.stringify(turret.declared));
  // у гіпер-турелі шкода 25 замість 14 (а hp у неї МЕНШЕ — за hp гіпер не впізнати)
  check(!!turret.guest && !!turret.plain && turret.guest.dmg > turret.plain.dmg,
    'куплений гіперзаряд повернувся: турель гостя сильніша за звичайну', JSON.stringify(turret));

  // ── 6c. А метеорит гіперзарядженим НЕ стає: цього гіперзаряду гість не оголошував
  await B.evaluate((s) => window.__send('meteor', s.x, s.z, true), sFire);
  await until((v) => v.meteors >= 1, 'метеорит гостя');
  const meteor = await view();
  check(meteor.meteorHyper === false, 'метеорит без оголошеного гіперзаряду лишається звичайним',
    JSON.stringify({ meteors: meteor.meteors, hyper: meteor.meteorHyper }));

  // ── 6c′. МЕЖА ДОВІРИ: оголошення хост приймає на слово ─────────────────────
  // Модифікований клієнт може оголосити гіперзаряд, якого НЕ купував: каталог
  // магазину перевіряє форму (чи існує такий id), а не володіння. Фіксуємо саме
  // фактичну поведінку — хост будує посилену версію. Це ПРИЙНЯТИЙ РОЗМІН, не баг:
  // закрити його можна лише довіреним джерелом покупок (тікет 05, «Межа довіри»).
  // Якщо колись зʼявиться перевірка володіння — цей тест впаде і змусить вирішити
  // свідомо, а не мовчки.
  const forged = await B.evaluate(async () => {
    const { PROTO_VERSION } = await import('/src/net/protocol.js');
    const s = window.__game.coop.session;
    // те саме hello, тільки з дописаним чужим гіперзарядом (resume — щоб хост не
    // перебудовував гостю рівень); у сейві гостя метеорита як не було, так і немає
    s.transport.send(1, {
      t: 'hello', ...s.myInfo(), hyp: ['turret', 'meteor'],
      build: window.__APP_VERSION, proto: PROTO_VERSION, resume: 1,
    }, true);
    return { save: (window.__game.save.gadgetHypers || []).slice() };
  });
  check(!forged.save.includes('meteor'), 'гість цього гіперзаряду НЕ купував', JSON.stringify(forged.save));
  const accepted = await waitFor(() => A.evaluate((p) => {
    const r = window.__game.coop.session.roster.get(p) || {};
    return Array.isArray(r.hyp) && r.hyp.includes('meteor');
  }, pid), 15000 * SLOW, 'хост прийняв оголошення');
  check(accepted, 'хост записав оголошений гіперзаряд у ростер');
  // другий метеорит: чекаємо власне вікно частоти (18с), пересилаючи запит
  const again = await waitFor(async () => {
    await B.evaluate((sp) => window.__send('meteor', sp.x, sp.z, true), sFire);
    await sleep(1500 * SLOW);
    return (await view()).meteors > meteor.meteors;
  }, 45000 * SLOW, 'другий метеорит');
  const trusted = await view();
  check(again && trusted.meteorHyper === true,
    'МЕЖА ДОВІРИ: оголошений, але не куплений гіперзаряд хост приймає на слово',
    JSON.stringify({ meteors: trusted.meteors, hyper: trusted.meteorHyper }));

  // ── 6d. Стеля КІМНАТИ: обʼєкти чужого (зниклого) номера гравця теж рахуються ─
  const roomMax = 48;
  const honestWalls = (await view()).walls; // барикади гостя, які дожили досюди
  await A.evaluate((max) => {
    const gd = window.__game.level.gadgets;
    const q = window.__game.level.player.pos;
    // ownerPid 3 — «гість, який уже вийшов»: його барикади лишаються у світі
    window.__ghost = [];
    while (gd.walls.length < max) {
      gd.placeWallAt(q.x + 40, q.z + 40, 0, 3); // далеко від гравців: колайдери нікому не заважають
      window.__ghost.push(gd.walls[gd.walls.length - 1].nid);
    }
  }, roomMax);
  await B.evaluate((s) => window.__send('wall', s.x, s.z, false), sRoom);
  await sleep(1200 * SLOW);
  const full = await view();
  check(full.roomWalls >= roomMax && full.walls === honestWalls,
    'кімната повна — нової барикади гостя немає, попри чисті персональні ліміти',
    JSON.stringify({ room: full.roomWalls, guest: full.walls }));

  // прибираємо «чужі» барикади — і та сама барикада гостя проходить (контроль:
  // блокувала саме стеля кімнати, а не частота)
  await A.evaluate(() => {
    const gd = window.__game.level.gadgets;
    for (const nid of window.__ghost.slice().reverse()) {
      const i = gd.walls.findIndex((w) => w.nid === nid);
      if (i >= 0) gd._removeWall(i, false);
    }
  });
  await B.evaluate((s) => window.__send('wall', s.x, s.z, false), sRoom);
  const freed = await until((v) => v.walls > honestWalls, 'барикада гостя після звільнення кімнати');
  check(freed, 'коли кімната звільнилась — та сама барикада стає');

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

  // ── 7b. Стара вкладка (PROTO 25) у кімнату не потрапляє й бачить пояснення ─
  const older = await A.evaluate(() => {
    const s = window.__game.coop.session;
    const sent = [];
    const orig = s.transport.send.bind(s.transport);
    s.transport.send = (to, d, urgent) => { sent.push(d); return orig(to, d, urgent); };
    // hello від клієнта попередньої версії: та сама збірка, старий протокол
    s._hostHello(4, { t: 'hello', nick: 'Стара вкладка', proto: 25, build: window.__APP_VERSION });
    s.transport.send = orig;
    return { sent, msg: window.__game.coop._connErr(new Error('build:750')) };
  });
  check(older.sent.some((d) => d && d.t === 'reject' && d.why === 'build'),
    'хост відмовляє клієнту зі старим протоколом', JSON.stringify(older.sent));
  check(typeof older.msg === 'string' && older.msg.length > 0 && /R|обнов|Обнов|версі/i.test(older.msg),
    'гість бачить зрозуміле пояснення, а не мовчазний збій', older.msg);

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
