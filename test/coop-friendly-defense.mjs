// 🛡️🌐 Дружня оборона в коопі: гість-mirror, стан вежі їде снапшотом snap.m,
// фінал вирішує хост подією dfend — гість бачить екран перемоги і нагороду.
import { setTimeout as sleep } from 'node:timers/promises';
import { openCoopTest, makeCheck } from './_browser.mjs';

const RELAY_PORT = 8765;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, RELAY, A, B, errors, closeTest } = await openCoopTest({ relayPort: RELAY_PORT });
let failed = 0;
const check = makeCheck(() => failed++);

try {
  console.log('▸ Дружня оборона у кооп-лобі');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  const lobby = await A.evaluate(async () => {
    const g = window.__game;
    const seven = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true };
    g.save.liberated = seven;
    const code = await g.test.coopCreate('Тато');
    const lockedEl = document.querySelector('.lobby-mode[data-mode="friendly-defense"]');
    const locked = !!lockedEl && lockedEl.classList.contains('locked');
    g.save.liberated = { ...seven, TUR: true };
    g.coop._renderLobby();
    const openEl = document.querySelector('.lobby-mode[data-mode="friendly-defense"]');
    const zoneEl = document.querySelector('.lobby-mode[data-mode="friendly-zone-defense"]');
    return {
      code,
      locked,
      open: !!openEl && openEl.classList.contains('pick') && !openEl.classList.contains('locked'),
      zoneOpen: !!zoneEl && !zoneEl.classList.contains('locked'),
    };
  });
  check(!lobby.locked, 'дружня оборона в лобі доступна без звільнених країн', JSON.stringify(lobby));
  check(lobby.open && lobby.zoneOpen, 'після 8 країн доступні оборона і зона', JSON.stringify(lobby));

  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), lobby.code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await A.evaluate(() => {
    window.__game.test.coopSetMode('friendly-defense');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.defense && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.defense && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());

  const shape = await B.evaluate(() => ({
    mirror: window.__game.level.mirror,
    variant: window.__game.level.defense.variant,
    modeId: window.__game.level.modeId,
    noShop: window.__game.level.noShop,
  }));
  check(shape.mirror && shape.variant === 'normal' && shape.modeId === 'friendly-defense' && shape.noShop,
    'гість — mirror дружньої оборони з правилами режиму', JSON.stringify(shape));

  // синхронізація вежі: хост міняє towerHp → гість бачить через снапшот (±2)
  await A.evaluate(() => { window.__game.level.defense.towerHp = 123; });
  let towerSynced = false;
  const t0 = Date.now();
  let towerB = -1;
  while (Date.now() - t0 < 20000 * SLOW) {
    towerB = await B.evaluate(() => window.__game.level.defense.towerHp);
    if (Math.abs(towerB - 123) <= 2) { towerSynced = true; break; }
    await sleep(400 * SLOW);
  }
  check(towerSynced, 'towerHp долетів гостю снапшотом', `гість бачить ${towerB}`);

  // фінал: хост добиває всіх зомбі оборони → перемога → dfend гостю
  const coinsB0 = await B.evaluate(() => window.__game.save.coins);
  const readGuestEnd = (p) => p.evaluate((coins0) => {
    const g = window.__game;
    const overlay = document.getElementById('overlay-arena-end');
    return {
      over: !!g.level?.defense?.over,
      completed: !!g.level?.defense?.completed,
      overlay: !!overlay?.classList.contains('show'),
      dCoins: (g.save.coins || 0) - coins0,
    };
  }, coinsB0);
  const tEnd = Date.now();
  let guestWon = false;
  let guestEnd = null;
  while (Date.now() - tEnd < 90000 * SLOW) {
    await A.evaluate(() => {
      const g = window.__game;
      const d = g.level.defense;
      d.wave = d.waveTotal; // без наступних хвиль
      d.spawned = d.target;
      for (const z of g.level.zombies.list) {
        if (z.defense && z.state !== 'dead') z.damage(99999, null, false);
      }
    });
    await sleep(700 * SLOW);
    guestEnd = await readGuestEnd(B);
    guestWon = !!(guestEnd.completed || guestEnd.dCoins >= 150);
    if (guestWon) break;
  }
  check(guestWon, 'гість отримав перемогу через dfend', JSON.stringify(guestEnd));
  const endB = await B.evaluate(() => ({
    overlay: document.getElementById('overlay-arena-end').classList.contains('show'),
    dCoins: window.__game.save.coins - 0,
  }));
  const coinsB1 = await B.evaluate(() => window.__game.save.coins);
  check(endB.overlay, 'у гостя показано екран фіналу');
  check(coinsB1 - coinsB0 >= 150, 'гість отримав нагороду локально (150+ монет)', `Δ=${coinsB1 - coinsB0}`);
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await closeTest();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 ДРУЖНЯ ОБОРОНА ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
