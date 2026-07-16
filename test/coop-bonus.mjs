// 🤝 Кооп-бонус за перемогу: гра РАЗОМ (roster>1) дає обом сторонам локально
// +150🪙 (завжди) і +1💎 (раз на день, за coopBonusDay). Лічильник coopWins росте
// щоразу. Друга перемога того ж дня — лише монети, без кристала. Плюс: у бою чип
// кімнати містить кнопку «поділитись» 📤. Wire-протокол не чіпаємо.
import { setTimeout as sleep } from 'node:timers/promises';
import { openCoopTest, makeCheck } from './_browser.mjs';

const RELAY_PORT = 8767;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, RELAY, A, B, errors, closeTest } = await openCoopTest({ relayPort: RELAY_PORT });
let failed = 0;
const check = makeCheck(() => failed++);

// PRE-ARM god: у кооп-бою орда може вбити гравця, поки тест чекає state==='level'
// (реальний флейк ~50% без цього — як у coop-turretwar/coop-weekly)
const preArmGod = () => {
  const iv = setInterval(() => { try { window.__game.test.god(); } catch (e) { /* ще нема рівня */ } }, 250);
  window.__preArmGod = iv;
};

// читаємо ключові цифри сейва + dayKey (те саме джерело, що й гра)
const readSave = (p) => p.evaluate(() => {
  const g = window.__game;
  return {
    coins: g.save.coins || 0,
    crystals: g.save.crystals || 0,
    coopWins: g.save.coopWins || 0,
    coopBonusDay: g.save.coopBonusDay || '',
    dayKey: g.gift.dayKey(),
  };
});

// провести кооп-рівень до перемоги хостовим шляхом (усі місії → бос → добити).
// Повертає true, щойно ОБИДВА побачили victoryShown. Модель — coop2.mjs.
async function playToVictory() {
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.net, null, { timeout: 45000 * SLOW });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());
  // усі ОСНОВНІ місії виконуємо в хоста (гість дізнається через події)
  await A.evaluate(() => {
    for (const m of window.__game.level.missions.missions) {
      if (!m.optional && m.state !== 'done') window.__game.test.completeMission(m.id);
    }
  });
  // добиваємо відкладені орди, поки не відкриється арена боса
  for (let i = 0; i < 40; i++) {
    const unlocked = await A.evaluate(() => {
      window.__game.test.finishHorde();
      return window.__game.level.missions.bossUnlocked;
    });
    if (unlocked) break;
    await sleep(800 * SLOW);
  }
  await A.waitForFunction(() => window.__game.level.missions.bossUnlocked, null, { timeout: 12000 * SLOW });
  // хост заходить на арену — стартує бос
  const arena = await A.evaluate(() => {
    const a = window.__game.level.world.layout.arena;
    return { x: a.x, z: a.z };
  });
  await A.evaluate((a) => window.__game.test.teleport(a.x, a.z), arena);
  await A.waitForFunction(() => window.__game.level.missions.bossStarted, null, { timeout: 10000 * SLOW });
  await A.waitForFunction(() => !!window.__game.level.zombies.boss, null, { timeout: 10000 * SLOW });
  await A.evaluate(() => window.__game.test.damageBoss(99999));
  await A.waitForFunction(() => window.__game.victoryShown, null, { timeout: 15000 * SLOW });
  await B.waitForFunction(() => window.__game.victoryShown, null, { timeout: 15000 * SLOW });
}

try {
  console.log('▸ Кооп-бонус за перемогу');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  // мок челенджів (щоб денний/тижневий не домішував своїх нагород);
  // країни ВЖЕ звільнені на обох — щоб перша-перемога-країни (кристали глави/зараження,
  // квест 'country') не домішувала кристалів і лишила чистим саме кооп-бонус.
  // ⚠️ xp НЕ роздуваємо: рівень ≥32 відкрив би мега-квести, а вони докидають кристали
  // хостові за 'kill/megabox' під час місій — це замаскувало б рівно +1 кооп-кристал.
  const ALL_LIB = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
  for (const p of [A, B]) {
    await p.evaluate((lib) => {
      const g = window.__game;
      g.dailyChallengeId = () => '__none';
      g.weeklyChallengeId = () => '__none';
      g.save.liberated = { ...lib };
    }, ALL_LIB);
  }

  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await A.evaluate(preArmGod);
  await B.evaluate(preArmGod);

  const before = { a: await readSave(A), b: await readSave(B) };
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await playToVictory();

  // ---- г) чип кімнати містить share-елемент 📤 ----
  const chip = {
    a: await A.evaluate(() => {
      const el = document.getElementById('coop-room');
      return { has: !!el.querySelector('[data-share]'), text: el.textContent };
    }),
    b: await B.evaluate(() => {
      const el = document.getElementById('coop-room');
      return { has: !!el.querySelector('[data-share]'), text: el.textContent };
    }),
  };
  check(chip.a.has && chip.a.text.includes('📤'), 'чип хоста має кнопку 📤', JSON.stringify(chip.a));
  check(chip.b.has && chip.b.text.includes('📤'), 'чип гостя має кнопку 📤', JSON.stringify(chip.b));

  // ---- б) перша перемога: coopWins=1, +150🪙, +1💎, coopBonusDay=dayKey ----
  const w1 = { a: await readSave(A), b: await readSave(B) };
  const okFirst = (b0, w) =>
    w.coopWins === 1
    && (w.coins - b0.coins) >= 150
    && (w.crystals - b0.crystals) === 1
    && w.coopBonusDay === w.dayKey;
  check(okFirst(before.a, w1.a), 'хост: coopWins=1, +150🪙, +1💎, день=dayKey', JSON.stringify({ b0: before.a, w1: w1.a }));
  check(okFirst(before.b, w1.b), 'гість: coopWins=1, +150🪙, +1💎, день=dayKey', JSON.stringify({ b0: before.b, w1: w1.b }));

  // ---- на глобус → обидва в лобі, кімната жива ----
  await A.evaluate(() => document.getElementById('btn-victory-globe').click());
  await A.waitForFunction(() => window.__game.state === 'globe' && window.__game.coop.session.state === 'lobby', null, { timeout: 20000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'globe' && window.__game.coop.session.state === 'lobby', null, { timeout: 20000 * SLOW });
  // victoryShown скидається на новому рівні; перевіримо перед стартом
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 15000 * SLOW });

  // ---- в) друга перемога того ж дня: coopWins=2, +150🪙, БЕЗ кристала ----
  const mid = { a: await readSave(A), b: await readSave(B) };
  await A.evaluate(preArmGod);
  await B.evaluate(preArmGod);
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await playToVictory();
  const w2 = { a: await readSave(A), b: await readSave(B) };
  const okSecond = (m, w) =>
    w.coopWins === 2
    && (w.coins - m.coins) >= 150
    && (w.crystals - m.crystals) === 0
    && w.coopBonusDay === w.dayKey;
  check(okSecond(mid.a, w2.a), 'хост: 2-га перемога того ж дня — coopWins=2, +150🪙, 0💎', JSON.stringify({ mid: mid.a, w2: w2.a }));
  check(okSecond(mid.b, w2.b), 'гість: 2-га перемога того ж дня — coopWins=2, +150🪙, 0💎', JSON.stringify({ mid: mid.b, w2: w2.b }));
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await closeTest();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 КООП-БОНУС ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
