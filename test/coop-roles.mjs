// 🎭 Кооп-ролі v1 (M2.3): дитина в лобі обирає роль (guard/medic/scout) — маленький САМО-баф.
// Перевіряємо: (а) ростер обох сторін несе ролі; (б) старт кампанії → guard maxHealth 125,
// medic revive-фактор 1.8с; (в) scout speedMult 1.08 у другому раунді; (г) роль зафіксована
// снапшотом на старті (зміна ролі посеред рівня не міняє maxHealth); (д) radiation — ролі НЕ
// діють (контракт 50 HP); (е) без JS-помилок.
import { setTimeout as sleep } from 'node:timers/promises';
import { openCoopTest, makeCheck } from './_browser.mjs';

const RELAY_PORT = 8767;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, RELAY, A, B, errors, closeTest } = await openCoopTest({ relayPort: RELAY_PORT });
let failed = 0;
const check = makeCheck(() => failed++);

// 🛡️ god ЗАЗДАЛЕГІДЬ (PRE-ARM): рівень будується асинхронно, поки тест чекає state==='level'
// зомбі можуть убити тротлений рендер за секунди. Ставимо god інтервалом ДО старту.
const preArmGod = (p) => p.evaluate(() => {
  window.__prearm = setInterval(() => { try { window.__game.test.god(); } catch (e) { /* рівень ще не готовий */ } }, 200);
});
const clearPrearm = (p) => p.evaluate(() => { if (window.__prearm) { clearInterval(window.__prearm); window.__prearm = null; } });
const roster = (p) => p.evaluate(() => [...window.__game.coop.session.roster.entries()]
  .map(([pid, r]) => ({ pid, nick: r.nick, role: r.role || null, ready: r.ready })));

try {
  console.log('▸ Кооп-ролі v1');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  // хост має звільнені країни (для кампанії/радіації)
  const code = await A.evaluate(async () => {
    const g = window.__game;
    const { CAMPAIGN_ORDER } = await import('/src/countries.js');
    g.save.liberated = Object.fromEntries(CAMPAIGN_ORDER.slice(0, 12).map((c) => [c, true]));
    // 🎯 моки календарних викликів (точні числа тут не потрібні, але прибираємо флейки дат)
    g.dailyChallengeId = () => '__none';
    g.weeklyChallengeId = () => '__none';
    return g.test.coopCreate('Тато');
  });
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await B.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });

  // ── готовність: false за замовчуванням, гість змінює лише себе, cfg скидає всіх ──
  check((await roster(A)).every((x) => x.ready === false), 'готовність ростера за замовчуванням false');
  await B.evaluate(() => window.__game.coop.session.setMyReady(true));
  await A.waitForFunction(() => {
    const r = window.__game.coop.session.roster;
    return r.get(1)?.ready === false && [...r.values()].find((x) => x.pid !== 1)?.ready === true;
  }, null, { timeout: 15000 * SLOW });
  const guestReady = await roster(A);
  check(guestReady.find((x) => x.pid === 1)?.ready === false && guestReady.find((x) => x.pid !== 1)?.ready === true,
    'ready-намір гостя змінює лише гостя', JSON.stringify(guestReady));
  await A.evaluate(() => window.__game.coop.session.setMyReady(true));
  await B.waitForFunction(() => [...window.__game.coop.session.roster.values()].every((x) => x.ready === true), null, { timeout: 15000 * SLOW });
  await A.evaluate(() => window.__game.coop.session.setCountry('POL'));
  await B.waitForFunction(() => [...window.__game.coop.session.roster.values()].every((x) => x.ready === false), null, { timeout: 15000 * SLOW });
  check((await roster(A)).every((x) => x.ready === false), 'зміна країни скидає готовність усіх');
  await A.evaluate(() => window.__game.coop.session.setMyReady(true));
  await B.evaluate(() => window.__game.coop.session.setMyReady(true));
  await A.waitForFunction(() => [...window.__game.coop.session.roster.values()].every((x) => x.ready === true), null, { timeout: 15000 * SLOW });
  await A.evaluate(() => window.__game.coop.session.setMode('storm'));
  await B.waitForFunction(() => [...window.__game.coop.session.roster.values()].every((x) => x.ready === false), null, { timeout: 15000 * SLOW });
  check((await roster(A)).every((x) => x.ready === false), 'зміна режиму скидає готовність усіх');

  // ── (а) вибір ролей у лобі → ростер обох сторін несе ролі ──
  await A.evaluate(() => window.__game.test.coopSetRole('guard'));
  await B.evaluate(() => window.__game.test.coopSetRole('medic'));
  // хост бачить B=medic; гість бачить A=guard (ребродкаст ростера)
  await A.waitForFunction(() => {
    const r = window.__game.coop.session.roster;
    return r.get(1)?.role === 'guard' && [...r.values()].some((x) => x.pid !== 1 && x.role === 'medic');
  }, null, { timeout: 15000 * SLOW });
  await B.waitForFunction(() => {
    const r = window.__game.coop.session.roster;
    const mine = r.get(window.__game.coop.session.myPid);
    return mine?.role === 'medic' && r.get(1)?.role === 'guard';
  }, null, { timeout: 15000 * SLOW });
  const rA = await roster(A);
  const rB = await roster(B);
  check(rA.find((x) => x.pid === 1)?.role === 'guard' && rA.some((x) => x.pid !== 1 && x.role === 'medic'),
    'хост бачить свою guard і B=medic у ростері', JSON.stringify(rA));
  check(rB.find((x) => x.pid === 1)?.role === 'guard' && rB.find((x) => x.pid !== 1)?.role === 'medic',
    'гість бачить A=guard і свою medic у ростері', JSON.stringify(rB));
  // сейв прес-налаштування збережено
  const savedRoles = {
    a: await A.evaluate(() => window.__game.save.coopRole),
    b: await B.evaluate(() => window.__game.save.coopRole),
  };
  check(savedRoles.a === 'guard' && savedRoles.b === 'medic', 'роль збережена у save.coopRole', JSON.stringify(savedRoles));

  // ── (б) старт кампанійного рівня → guard maxHealth 125, medic revive-фактор 1.8с ──
  await preArmGod(A);
  await preArmGod(B);
  await A.evaluate(() => {
    window.__game.test.coopSetMode('campaign');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net, null, { timeout: 45000 * SLOW });

  const roundA = await A.evaluate(() => ({
    maxHealth: window.__game.level.player.maxHealth,
    health: window.__game.level.player.health,
    coopRole: window.__game.level.coopRole,
  }));
  // 🎖️ хост звільнив усі 12 країн, тож до ролі додається ще й пасивка Китаю (+20 макс. HP,
  // src/countrypowers.js): 100 базових + 25 guard + 20 Велика стіна = 145.
  check(roundA.maxHealth === 145 && roundA.health === 145,
    'guard-хост: maxHealth 145 (100+25 guard+20 пасивка Китаю), health стартове теж 145', JSON.stringify(roundA));

  const roundB = await B.evaluate(() => ({
    maxHealth: window.__game.level.player.maxHealth,
    coopRole: window.__game.level.coopRole,
    // 🎭 revive-фактор медика: 1/1.8 (≈0.5556) проти 1/3 у звичайного гравця
    reviveRate: window.__game._coopReviveRate,
  }));
  // медик НЕ guard → maxHealth лишається базовим (100 без апгрейдів)
  check(roundB.coopRole === 'medic' && roundB.maxHealth === 100, 'medic-гість: без +HP (maxHealth 100)', JSON.stringify(roundB));
  check(Math.abs(roundB.reviveRate - (1 / 1.8)) < 1e-6,
    'medic-гість: revive-фактор = 1/1.8 (підйом за 1.8с замість 3с)', JSON.stringify(roundB));

  // ── (г) роль зафіксована СНАПШОТОМ: зміна ролі ПІСЛЯ старту не міняє maxHealth поточного рівня ──
  await A.evaluate(() => window.__game.test.coopSetRole('scout'));
  await sleep(500 * SLOW);
  const afterChange = await A.evaluate(() => ({
    maxHealth: window.__game.level.player.maxHealth,
    saved: window.__game.save.coopRole,
  }));
  check(afterChange.maxHealth === 145 && afterChange.saved === 'scout',
    'зміна ролі посеред рівня НЕ міняє maxHealth (снапшот на старті); сейв уже scout', JSON.stringify(afterChange));

  // повертаємось у лобі
  await clearPrearm(A);
  await clearPrearm(B);
  await A.evaluate(() => window.__game.endLevel());
  await A.waitForFunction(() => window.__game.coop.session.state === 'lobby', null, { timeout: 20000 * SLOW });
  await B.waitForFunction(() => window.__game.coop.session.state === 'lobby', null, { timeout: 20000 * SLOW });

  // ── (в) scout у другому раунді: speedMult ×1.08 застосований ──
  // A вже scout (змінив вище). B стане scout теж — перевіримо у хоста і гостя.
  await B.evaluate(() => window.__game.test.coopSetRole('scout'));
  await A.waitForFunction(() => {
    const r = window.__game.coop.session.roster;
    return r.get(1)?.role === 'scout' && [...r.values()].some((x) => x.pid !== 1 && x.role === 'scout');
  }, null, { timeout: 15000 * SLOW });
  await preArmGod(A);
  await preArmGod(B);
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net, null, { timeout: 45000 * SLOW });

  const scoutA = await A.evaluate(() => ({
    role: window.__game.level.coopRole,
    speedMult: window.__game.level.player.speedMult,
    pickupMult: window.__game.level.player.pickupMult,
  }));
  const scoutB = await B.evaluate(() => ({
    role: window.__game.level.coopRole,
    speedMult: window.__game.level.player.speedMult,
    pickupMult: window.__game.level.player.pickupMult,
  }));
  // без апгрейдів базовий speedMult = 1; scout → ×1.08. pickupMult 1.25.
  // 🎖️ у хоста звільнена ще й Іспанія → ×1.04 від пасивки «Порив кориди» (1.08 × 1.04 = 1.1232).
  check(scoutA.role === 'scout' && Math.abs(scoutA.speedMult - 1.08 * 1.04) < 1e-6 && Math.abs(scoutA.pickupMult - 1.25) < 1e-6,
    'scout-хост: speedMult 1.08 × 1.04 (пасивка Іспанії) + pickupMult 1.25', JSON.stringify(scoutA));
  check(scoutB.role === 'scout' && Math.abs(scoutB.speedMult - 1.08) < 1e-6 && Math.abs(scoutB.pickupMult - 1.25) < 1e-6,
    'scout-гість: speedMult 1.08 + pickupMult 1.25', JSON.stringify(scoutB));

  await clearPrearm(A);
  await clearPrearm(B);
  await A.evaluate(() => window.__game.endLevel());
  await A.waitForFunction(() => window.__game.coop.session.state === 'lobby', null, { timeout: 20000 * SLOW });
  await B.waitForFunction(() => window.__game.coop.session.state === 'lobby', null, { timeout: 20000 * SLOW });

  // ── (д) radiation-кімната: ролі НЕ діють (контракт 50 HP) ──
  // ставимо guard обом — у радіації маєм побачити 50 HP, не 75/125
  await A.evaluate(() => window.__game.test.coopSetRole('guard'));
  await B.evaluate(() => window.__game.test.coopSetRole('guard'));
  await A.waitForFunction(() => window.__game.coop.session.roster.get(1)?.role === 'guard', null, { timeout: 10000 * SLOW });
  await preArmGod(A);
  await preArmGod(B);
  await A.evaluate(() => {
    window.__game.test.coopSetMode('radiation');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.radiation, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net, null, { timeout: 45000 * SLOW });

  const radA = await A.evaluate(() => ({
    maxHealth: window.__game.level.player.maxHealth,
    coopRole: window.__game.level.coopRole,
    reviveRate: window.__game._coopReviveRate,
  }));
  check(radA.maxHealth === 50 && radA.coopRole == null,
    'радіація: ролі НЕ діють — guard-хост усе одно 50 HP (контракт)', JSON.stringify(radA));
  check(Math.abs(radA.reviveRate - (1 / 3)) < 1e-6, 'радіація: revive-фактор дефолтний 1/3 (не medic)', JSON.stringify(radA));

  await clearPrearm(A);
  await clearPrearm(B);
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await closeTest();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 КООП-РОЛІ ПРАЦЮЮТЬ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
