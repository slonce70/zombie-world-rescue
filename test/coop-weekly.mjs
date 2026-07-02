// 🗓️🤝 Командне випробування тижня: хост — джерело істини (ключ тижня у spec),
// гість грає режим зі spec навіть із «іншою» локальною датою; перемога дає
// +25💎 обом одноразово на тиждень; соло-флаг тижня не зачеплено.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8767;
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

try {
  console.log('▸ Командне випробування тижня');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 * SLOW });

  const code = await A.evaluate(async () => {
    const g = window.__game;
    g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
    // хост «живе» у тижні 777, режим тижня — дружній нокаут
    g._weekIndex = () => 777;
    g.weeklyCoopModeId = () => 'friendly-knockout';
    return g.test.coopCreate('Тато');
  });
  await B.evaluate((c) => {
    const g = window.__game;
    // гість «живе» в ІНШОМУ тижні — його локальна дата не має значення
    g._weekIndex = () => 555;
    return g.test.coopJoin(c, 'Влад');
  }, code);
  await A.waitForFunction(() => window.__game.coop.session.roster.size === 2, null, { timeout: 20000 * SLOW });
  // 🛡️ god ЗАЗДАЛЕГІДЬ: 20 аггро-зомбі нокауту можуть убити гравця за секунди
  // тротленого рендера, поки тест чекає state==='level' (реальний флейк)
  const preArmGod = () => {
    const iv = setInterval(() => {
      const g = window.__game;
      if (g.level && g.level.player) { g.level.player.respawnProtect = 1e9; clearInterval(iv); }
    }, 50);
  };
  await A.evaluate(preArmGod);
  await B.evaluate(preArmGod);
  await A.evaluate(() => {
    window.__game.test.coopSetMode('weekly-coop');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.knockout && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.knockout && window.__game.level.net, null, { timeout: 45000 * SLOW });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());

  const specs = {
    a: await A.evaluate(() => ({ w: window.__game.level.weekly?.w, variant: window.__game.level.knockout.variant })),
    b: await B.evaluate(() => ({ w: window.__game.level.weekly?.w, variant: window.__game.level.knockout.variant })),
  };
  check(specs.a.w === 777 && specs.b.w === 777, 'ключ тижня у ОБОХ — від хоста (777), не від локальної дати', JSON.stringify(specs));
  check(specs.a.variant === 'friendly' && specs.b.variant === 'friendly', 'режим тижня — дружній нокаут в обох', JSON.stringify(specs));

  // перемога: хост добиває зомбі; фінал у гостя локальний (детерміновані зомбі + zd)
  const cr0 = {
    a: await A.evaluate(() => window.__game.save.crystals || 0),
    b: await B.evaluate(() => window.__game.save.crystals || 0),
  };
  const t0 = Date.now();
  let bothWon = false;
  while (Date.now() - t0 < 40000 * SLOW) {
    await A.evaluate(() => {
      const g = window.__game;
      for (const z of g.level.zombies.list) {
        if (z.knockout && z.state !== 'dead') z.damage(99999, null, false);
      }
    });
    await sleep(700 * SLOW);
    const aWon = await A.evaluate(() => !!(window.__game.level?.knockout?.completed));
    const bWon = await B.evaluate(() => !!(window.__game.level?.knockout?.completed));
    if (aWon && bWon) { bothWon = true; break; }
  }
  check(bothWon, 'перемога зарахована обом');

  const rew = {
    a: await A.evaluate(() => ({
      dCr: (window.__game.save.crystals || 0), flag: !!window.__game.save.weekly['W777:coop'],
      solo: !!window.__game.save.weekly['W777:mode'],
    })),
    b: await B.evaluate(() => ({
      dCr: (window.__game.save.crystals || 0), flag: !!window.__game.save.weekly['W777:coop'],
      solo: !!window.__game.save.weekly['W777:mode'],
    })),
  };
  // +25 тижневих; нокаут-ящик може докинути свої +5💎 (roll) — тому діапазон
  const okCr = (d) => d >= 25 && d <= 35;
  check(okCr(rew.a.dCr - cr0.a) && rew.a.flag, 'хост: +25💎 тижня і флаг W777:coop', JSON.stringify({ ...rew.a, cr0: cr0.a }));
  check(okCr(rew.b.dCr - cr0.b) && rew.b.flag, 'гість: +25💎 тижня і флаг W777:coop', JSON.stringify({ ...rew.b, cr0: cr0.b }));
  check(!rew.a.solo && !rew.b.solo, 'соло-флаг тижня не зачеплено');

  // повторна видача заблокована флагом тижня
  const repeat = await A.evaluate(() => {
    const g = window.__game;
    const c0 = g.save.crystals || 0;
    g._grantWeeklyCoop({ weekly: { w: 777 } }, true);
    return (g.save.crystals || 0) - c0;
  });
  check(repeat === 0, 'повторна перемога того ж тижня — без кристалів', `Δ=${repeat}`);
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

const realErrs = errors.filter((e) => !e.includes('favicon'));
check(realErrs.length === 0, 'без JS-помилок консолі', realErrs.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 КОМАНДНИЙ ТИЖДЕНЬ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
