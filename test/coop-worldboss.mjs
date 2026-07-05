// 🌋🌐 Світовий бос у коопі: host-authoritative, гість-mirror. Бос їде на puppet-і
// через o.wb (zs/captureState), фінал кожен детектить сам зі стану puppet-боса
// (патерн radiation), кооп-бонус +150 монет нараховується КОЖНОМУ локально.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8771;
const RELAY = `ws://localhost:${RELAY_PORT}`;
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const relay = await spawnRelay(RELAY_PORT);
const LAUNCH = { args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] };
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const p of [A, B]) {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
}
// світові боси аггряться миттєво (як радіація) — god PRE-ARM інтервалом ДО старту рівня
const prearm = (p) => p.evaluate(() => {
  window.__prearm = setInterval(() => { try { window.__game.test.god(); } catch (e) { /* рівень ще не готовий */ } }, 250);
});

try {
  console.log('▸ Світовий бос у кооп-лобі');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  const lobby = await A.evaluate(async () => {
    const g = window.__game;
    const { CAMPAIGN_ORDER } = await import('/src/countries.js');
    // 3 країни < 4 → світовий бос заблокований
    g.save.liberated = Object.fromEntries(CAMPAIGN_ORDER.slice(0, 3).map((c) => [c, true]));
    const code = await g.test.coopCreate('Тато');
    const lockedEl = document.querySelector('.lobby-mode[data-mode="worldboss"]');
    const locked = !!lockedEl && lockedEl.classList.contains('locked');
    // 4 країни → відкрито
    g.save.liberated = Object.fromEntries(CAMPAIGN_ORDER.slice(0, 4).map((c) => [c, true]));
    g.coop._renderLobby();
    const openEl = document.querySelector('.lobby-mode[data-mode="worldboss"]');
    return { code, locked, open: !!openEl && openEl.classList.contains('pick') && !openEl.classList.contains('locked') };
  });
  check(lobby.locked, 'до 4 країн світовий бос у лобі заблокований', JSON.stringify(lobby));
  check(lobby.open, 'після 4 країн світовий бос доступний', JSON.stringify(lobby));

  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), lobby.code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  await prearm(A);
  await prearm(B);
  await A.evaluate(() => {
    window.__game.test.coopSetMode('worldboss');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.worldBoss && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.worldBoss && window.__game.level.net, null, { timeout: 45000 * SLOW });

  // (а) spec.wb однаковий обом (бос тижня від хоста, не локальний weeklyBossId у гостя)
  const wbA = await A.evaluate(() => window.__game.level.worldBoss.id);
  const wbB = await B.evaluate(() => window.__game.level.worldBoss.id);
  check(wbA === wbB, 'spec.wb однаковий обом сторонам', `A=${wbA} B=${wbB}`);

  // (б) гість — mirror worldboss з правилами режиму
  const shape = await B.evaluate(() => ({
    mirror: window.__game.level.mirror,
    modeId: window.__game.level.modeId,
    noShop: window.__game.level.noShop,
    authority: window.__game.level.net.authority,
  }));
  check(shape.mirror && shape.modeId === 'worldboss' && shape.noShop && !shape.authority,
    'гість — mirror світового боса з правилами режиму', JSON.stringify(shape));

  // (в) гість бачить puppet-боса (o.wb) і HUD hp — головна пастка: без прапора
  // level.zombies.boss=null → healthbar порожній і remaining()=0 (миттєва «перемога»)
  await B.waitForFunction(() => {
    const g = window.__game;
    const b = g.level.zombies.boss;
    return !!(b && b.worldBoss && b.state !== 'dead') && g.level.worldBoss.remaining() === 1;
  }, null, { timeout: 30000 * SLOW });
  const guestBoss = await B.evaluate(() => {
    const g = window.__game;
    const b = g.level.zombies.boss;
    return {
      wb: b?.worldBoss || null,
      hp: b?.hp || 0,
      maxHp: b?.maxHp || 0,
      remaining: g.level.worldBoss.remaining(),
      over: g.level.worldBoss.over,
      barShown: document.getElementById('bossbar')?.classList.contains('show') || false,
    };
  });
  check(guestBoss.wb === wbA && guestBoss.remaining === 1 && !guestBoss.over,
    'гість бачить puppet-боса (o.wb на місці)', JSON.stringify(guestBoss));
  check(guestBoss.hp > 0 && guestBoss.maxHp > 1000 && guestBoss.barShown,
    'гість має бос-хелсбар із HP puppet-а', JSON.stringify(guestBoss));

  console.log('▸ Фінал: хост зносить боса — гість детектить перемогу сам');
  const coinsA0 = await A.evaluate(() => window.__game.save.coins || 0);
  const coinsB0 = await B.evaluate(() => window.__game.save.coins || 0);
  const readGuestEnd = (p, c0) => p.evaluate((coins0) => {
    const g = window.__game;
    const overlay = document.getElementById('overlay-arena-end');
    return {
      over: !!g.level?.worldBoss?.over,
      completed: !!g.level?.worldBoss?.completed,
      overlay: !!overlay?.classList.contains('show'),
      dCoins: (g.save.coins || 0) - coins0,
      cleared: !!(g.save.worldBosses && g.save.worldBosses[g.level?.worldBoss?.id]),
    };
  }, c0);
  const tEnd = Date.now();
  let guestWon = false;
  let guestEnd = null;
  while (Date.now() - tEnd < 90000 * SLOW) {
    // хост зносить боса напряму (test-урон): гість детектить смерть puppet-а
    await A.evaluate(() => {
      for (const z of window.__game.level.zombies.list) {
        if (z.worldBoss && z.state !== 'dead') z.damage(999999, null, false);
      }
    });
    await sleep(700 * SLOW);
    guestEnd = await readGuestEnd(B, coinsB0);
    guestWon = !!(guestEnd.completed || guestEnd.overlay);
    if (guestWon) break;
  }
  check(guestWon, 'гість отримав перемогу зі стану puppet-боса', JSON.stringify(guestEnd));

  // (г) ОБОМ — save.worldBosses[id] записаний
  const clearedA = await A.evaluate(() => !!(window.__game.save.worldBosses && window.__game.save.worldBosses[window.__game.level.worldBoss.id]));
  check(clearedA && guestEnd.cleared, 'save.worldBosses[id] записаний обом', `host=${clearedA} guest=${guestEnd.cleared}`);

  // (г) кооп-бонус +150 монет прийшов обом локально (roster>1)
  const coinsA1 = await A.evaluate(() => window.__game.save.coins || 0);
  const coinsB1 = await B.evaluate(() => window.__game.save.coins || 0);
  // хост: +нагорода боса (firstClear) +150 кооп; перевіряємо, що кооп-бонус є (≥150)
  check(coinsA1 - coinsA0 >= 150, 'хост отримав кооп-бонус (+150 монет)', `Δ=${coinsA1 - coinsA0}`);
  check(coinsB1 - coinsB0 >= 150, 'гість отримав кооп-бонус (+150 монет) локально', `Δ=${coinsB1 - coinsB0}`);

  const overlayB = await B.evaluate(() => document.getElementById('overlay-arena-end').classList.contains('show'));
  check(overlayB, 'у гостя показано екран фіналу');
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await A.evaluate(() => clearInterval(window.__prearm)).catch(() => {});
  await B.evaluate(() => clearInterval(window.__prearm)).catch(() => {});
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 КООП-WORLDBOSS ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
