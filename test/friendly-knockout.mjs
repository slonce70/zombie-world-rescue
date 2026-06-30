import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8761;
const RELAY = `ws://localhost:${RELAY_PORT}`;
const relay = await spawnRelay(RELAY_PORT);
const browserA = await chromium.launch({ args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const browserB = await chromium.launch({ args: ['--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
for (const p of [A, B]) {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
}

try {
  console.log('▸ Дружній нокаут у кооп-лобі');
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`, { waitUntil: 'domcontentloaded' });
  await A.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });

  const lobby = await A.evaluate(async () => {
    const g = window.__game;
    const seven = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true };
    g.save.liberated = seven;
    const code = await g.test.coopCreate('Тато');
    const lockedEl = document.querySelector('.lobby-mode[data-mode="friendly-knockout"]');
    const locked = !!lockedEl && lockedEl.classList.contains('locked');
    g.save.liberated = { ...seven, TUR: true };
    g.coop._renderLobby();
    const openEl = document.querySelector('.lobby-mode[data-mode="friendly-knockout"]');
    return {
      code,
      locked,
      open: !!openEl && openEl.classList.contains('pick') && !openEl.classList.contains('locked'),
      text: openEl?.textContent || '',
    };
  });
  check(lobby.locked, 'до 8 країн режим заблокований у лобі', JSON.stringify(lobby));
  check(lobby.open && /Дружній нокаут/.test(lobby.text), 'після 8 країн режим доступний у лобі', JSON.stringify(lobby));

  await B.evaluate((code) => window.__game.test.coopJoin(code, 'Влад'), lobby.code);
  await A.evaluate(() => {
    window.__game.test.coopSetMode('friendly-knockout');
    window.__game.test.coopStartLevel();
  });
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.knockout, null, { timeout: 45000 });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.knockout, null, { timeout: 45000 });
  const started = await A.evaluate(() => ({
    mode: window.__game.coop.session.mode,
    variant: window.__game.level.knockout.variant,
    target: window.__game.level.knockout.target,
    alive: window.__game.level.zombies.list.filter((z) => z.knockout && z.state !== 'dead').length,
    noGadgets: window.__game.level.noGadgets,
    noShop: window.__game.level.noShop,
    weapons: [...window.__game.level.player.weapons],
    cur: window.__game.level.player.cur,
  }));
  const guest = await B.evaluate(() => ({
    variant: window.__game.level.knockout.variant,
    target: window.__game.level.knockout.target,
    state: window.__game.coop.session.state,
  }));
  check(started.mode === 'friendly-knockout' && started.variant === 'friendly', 'хост стартує дружній нокаут', JSON.stringify(started));
  check(started.target === 20 && started.alive === 20, 'у дружньому нокауті 20 зомбі', JSON.stringify(started));
  check(started.noGadgets && started.noShop && started.weapons.length === 1 && started.cur === 'pistol',
    'правила нокауту лишаються: пістолет, без магазину і гаджетів', JSON.stringify(started));
  check(guest.state === 'level' && guest.variant === 'friendly' && guest.target === 20,
    'друг заходить у той самий дружній нокаут', JSON.stringify(guest));
} catch (e) {
  failed++;
  console.error('  ❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
  closeServer();
}

check(errors.length === 0, 'без JS-помилок консолі', errors.slice(0, 5).join(' | '));
console.log('');
console.log(failed === 0 ? '🎉 ДРУЖНІЙ НОКАУТ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
