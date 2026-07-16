// 🗼🌐 Оборона турелі в коопі: гість-mirror, HP турелей їдуть снапшотом snap.m,
// молот гостя летить хосту подією twh (з клампом і перевіркою близькості),
// фінал вирішує хост подією twend.
import { setTimeout as sleep } from 'node:timers/promises';
import { openCoopTest, makeCheck } from './_browser.mjs';

const RELAY_PORT = 8768;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, RELAY, A, B, errors, closeTest } = await openCoopTest({ relayPort: RELAY_PORT });
let failed = 0;
const check = makeCheck(() => failed++);
// зомбі-хвилі йдуть на гравців — god PRE-ARM інтервалом ДО старту рівня
const prearm = (p) => p.evaluate(() => {
  window.__prearm = setInterval(() => { try { window.__game.test.god(); } catch (e) { /* рівень ще не готовий */ } }, 250);
});

try {
  console.log('▸ Оборона турелі у кооп-лобі');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  const lobby = await A.evaluate(async () => {
    const g = window.__game;
    const { CAMPAIGN_ORDER } = await import('/src/countries.js');
    g.save.liberated = Object.fromEntries(CAMPAIGN_ORDER.slice(0, 12).map((c) => [c, true]));
    const code = await g.test.coopCreate('Тато');
    g.coop._renderLobby();
    const el = document.querySelector('.lobby-mode[data-mode="turretwar"]');
    return { code, open: !!el && el.classList.contains('pick') && !el.classList.contains('locked') };
  });
  check(lobby.open, 'після 12 країн турельна війна доступна в лобі', JSON.stringify(lobby));

  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), lobby.code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await prearm(A);
  await prearm(B);
  await A.evaluate(() => {
    window.__game.test.coopSetMode('turretwar');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.turretwar && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.turretwar && window.__game.level.net, null, { timeout: 45000 * SLOW });
  // турель гравця не має впасти, поки тест міряє синк
  await A.evaluate(() => { window.__game.level.turretwar.playerHp = 99999; });

  const shape = await B.evaluate(() => ({
    mirror: window.__game.level.mirror,
    modeId: window.__game.level.modeId,
    weapon: window.__game.level.player.cur,
  }));
  check(shape.mirror && shape.modeId === 'turretwar' && shape.weapon === 'hammer',
    'гість — mirror турельної війни з молотом', JSON.stringify(shape));

  console.log('▸ Снапшот snap.m: HP турелей долітають гостю');
  await A.evaluate(() => { window.__game.level.turretwar.enemyHp = 321; });
  let synced = false;
  let seen = -1;
  const t0 = Date.now();
  while (Date.now() - t0 < 20000 * SLOW) {
    seen = await B.evaluate(() => window.__game.level.turretwar.enemyHp);
    if (seen === 321) { synced = true; break; }
    await sleep(400 * SLOW);
  }
  check(synced, 'enemyHp долетів гостю снапшотом', `гість бачить ${seen}`);

  console.log('▸ Молот гостя: подія twh зараховує шкоду в хоста');
  // гість стає впритул до зомбі-турелі й «б\'є» (стрибок shootCd ловить _hammerHit)
  await B.evaluate(() => {
    const tw = window.__game.level.turretwar;
    window.__game.test.teleport(tw.ex - 2, tw.cz);
  });
  await sleep(1200 * SLOW); // позиція гостя має долетіти хосту (перевірка близькості twh)
  const hpBefore = await A.evaluate(() => window.__game.level.turretwar.enemyHp);
  let hpAfter = hpBefore;
  const t1 = Date.now();
  while (Date.now() - t1 < 20000 * SLOW) {
    await B.evaluate(() => {
      const g = window.__game;
      g.level.turretwar._lastCd = 0;
      g.level.player.shootCd = 1; // імітуємо удар: стрибок shootCd угору
    });
    await sleep(500 * SLOW);
    hpAfter = await A.evaluate(() => window.__game.level.turretwar.enemyHp);
    if (hpAfter < hpBefore) break;
  }
  check(hpAfter < hpBefore && hpBefore - hpAfter <= 60 * 3,
    'удар молота гостя зарахований хостом (з клампом)', `${hpBefore} → ${hpAfter}`);

  console.log('▸ Фінал: хост зносить зомбі-турель — twend гостю');
  const coinsB0 = await B.evaluate(() => window.__game.save.coins);
  const readGuestEnd = (p) => p.evaluate((coins0) => {
    const g = window.__game;
    const overlay = document.getElementById('overlay-arena-end');
    return {
      over: !!g.level?.turretwar?.over,
      completed: !!g.level?.turretwar?.completed,
      overlay: !!overlay?.classList.contains('show'),
      dCoins: (g.save.coins || 0) - coins0,
    };
  }, coinsB0);
  await A.evaluate(() => { window.__game.level.turretwar.enemyHp = 0; });
  let guestWon = false;
  let guestEnd = null;
  const t2 = Date.now();
  while (Date.now() - t2 < 90000 * SLOW) {
    guestEnd = await readGuestEnd(B);
    guestWon = !!(guestEnd.completed || guestEnd.dCoins >= 150);
    if (guestWon) break;
    await sleep(500 * SLOW);
  }
  check(guestWon, 'гість отримав перемогу через twend', JSON.stringify(guestEnd));
  const coinsB1 = await B.evaluate(() => window.__game.save.coins);
  check(coinsB1 - coinsB0 >= 150, 'гість отримав нагороду локально (150+ монет)', `Δ=${coinsB1 - coinsB0}`);
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await A.evaluate(() => clearInterval(window.__prearm)).catch(() => {});
  await B.evaluate(() => clearInterval(window.__prearm)).catch(() => {});
  await closeTest();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 КООП-ТУРЕЛЬНА ВІЙНА ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
