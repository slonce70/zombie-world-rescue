// 🎁 Подарунок дня: стрик-календар без покарань, фіксовані нагороди, персистентність, UI
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });

let failed = 0;
const check = (ok, msg, detail = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, detail);
  if (!ok) failed++;
};

async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(200);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

console.log('▸ Boot ?test&fresh — свіжий сейв, подарунок готовий');
await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус');

// нейтралізуємо челенджі, щоб addXp за монети паса не забруднив дельти монет/кристалів
await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
  g.save.xp = 999999; // вже на стелі паса — addXp не додасть монет за нові рівні
});

console.log('▸ 1. fresh → pending, claim +100 монет, streak 1');
let r = await page.evaluate(() => {
  const g = window.__game;
  const c0 = g.save.coins, x0 = g.save.crystals;
  const pending = g.gift.pending();
  const rew = g.gift.claim();
  return {
    pending, rew, dCoins: g.save.coins - c0, dCry: g.save.crystals - x0,
    streak: g.save.gift.streak, last: g.save.gift.last, week: g.save.gift.week,
    key: g.gift.dayKey(),
  };
});
check(r.pending === true, '1: pending === true на fresh');
check(r.dCoins === 100 && r.dCry === 0, '1: claim → +100 монет', JSON.stringify(r));
check(r.streak === 1, '1: streak === 1', JSON.stringify(r));
check(r.last === r.key, '1: last === dayKey()', JSON.stringify(r));
check(r.week === 1, '1: week === 1', JSON.stringify(r));

console.log('▸ 2. Той самий день — не pending, повторний claim === null, дельти 0');
r = await page.evaluate(() => {
  const g = window.__game;
  const c0 = g.save.coins, x0 = g.save.crystals;
  const pending = g.gift.pending();
  const rew = g.gift.claim();
  return { pending, rewNull: rew === null, dCoins: g.save.coins - c0, dCry: g.save.crystals - x0 };
});
check(r.pending === false, '2: pending === false того ж дня');
check(r.rewNull === true, '2: повторний claim === null');
check(r.dCoins === 0 && r.dCry === 0, '2: дельти 0', JSON.stringify(r));

console.log('▸ 3. forceKey завтра → streak 2, +150 монет');
r = await page.evaluate(() => {
  const g = window.__game;
  const k1 = g.gift.dayKey(new Date(Date.now() + 1 * 864e5));
  const c0 = g.save.coins;
  const pending = g.gift.pending(k1);
  const rew = g.gift.claim(k1);
  return { k1, pending, rew, dCoins: g.save.coins - c0, streak: g.save.gift.streak };
});
check(r.pending === true, '3: pending(k1) === true');
check(r.streak === 2, '3: streak === 2', JSON.stringify(r));
check(r.dCoins === 150, '3: +150 монет (тиждень1 день2)', JSON.stringify(r));

console.log('▸ 4. +3 дня від k1 (пропуск 2) → ЗАМОРОЗКА: streak 3, +3💎 (день 3)');
r = await page.evaluate(() => {
  const g = window.__game;
  const k3 = g.gift.dayKey(new Date(Date.now() + 4 * 864e5)); // k1 був +1, це +4 = k1+3
  const x0 = g.save.crystals, c0 = g.save.coins;
  const rew = g.gift.claim(k3);
  return { k3, rew, dCry: g.save.crystals - x0, dCoins: g.save.coins - c0, streak: g.save.gift.streak };
});
check(r.streak === 3, '4: streak === 3 (заморозка, НЕ скинуто)', JSON.stringify(r));
check(r.dCry === 3 && r.dCoins === 0, '4: +3💎 (тиждень1 день3)', JSON.stringify(r));

console.log('▸ 5. Clock-back: після k3, pending(k1) === false');
r = await page.evaluate(() => {
  const g = window.__game;
  const k1 = g.gift.dayKey(new Date(Date.now() + 1 * 864e5));
  return { pending: g.gift.pending(k1) };
});
check(r.pending === false, '5: pending(вчорашній ключ) === false');

console.log('▸ 6. Масштаб недель: streak 7 → нед.2 день1 +150; кап streak 28 → нед.4 день1 +250');
r = await page.evaluate(() => {
  const g = window.__game;
  const yesterday = g.gift.dayKey(new Date(Date.now() - 1 * 864e5));
  g.save.gift = { last: yesterday, streak: 7, week: 2 };
  const c0 = g.save.coins;
  g.gift.claim();
  const dW2 = g.save.coins - c0;
  // кап тижня 4
  g.save.gift = { last: yesterday, streak: 28, week: 4 };
  const c1 = g.save.coins;
  g.gift.claim();
  const dW4 = g.save.coins - c1;
  return { dW2, dW4 };
});
check(r.dW2 === 150, '6: streak7 → +150 (тиждень2 день1)', JSON.stringify(r));
check(r.dW4 === 250, '6: streak28 → +250 (кап тиждень4 день1)', JSON.stringify(r));

console.log('▸ 7. День 7: streak 6 → +300 монет І +10💎');
r = await page.evaluate(() => {
  const g = window.__game;
  const yesterday = g.gift.dayKey(new Date(Date.now() - 1 * 864e5));
  g.save.gift = { last: yesterday, streak: 6, week: 1 };
  const c0 = g.save.coins, x0 = g.save.crystals;
  g.gift.claim();
  return { dCoins: g.save.coins - c0, dCry: g.save.crystals - x0 };
});
check(r.dCoins === 300 && r.dCry === 10, '7: день7 бандл +300 монет +10💎', JSON.stringify(r));

console.log('▸ 8. Персистентність: reload ?test (без fresh) того ж дня → не pending');
// повертаємо стрик до дня 1, забираємо СЬОГОДНІ, зберігаємо
await page.evaluate(() => {
  const g = window.__game;
  const yesterday = g.gift.dayKey(new Date(Date.now() - 1 * 864e5));
  g.save.gift = { last: yesterday, streak: 0, week: 1 };
  g.gift.claim(); // забрали сьогодні
  g.saveGame();
});
await page.goto(`${BASE}/?test`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус після reload');
r = await page.evaluate(() => ({ pending: window.__game.gift.pending(), streak: window.__game.save.gift.streak }));
check(r.pending === false, '8: після reload того ж дня pending === false', JSON.stringify(r));
check(r.streak === 1, '8: стрик збережено (=1)', JSON.stringify(r));

console.log('▸ 9. UI: чіп при pending, модалка, claim → нагорода + чіп схований');
r = await page.evaluate(() => {
  const g = window.__game;
  const yesterday = g.gift.dayKey(new Date(Date.now() - 1 * 864e5));
  g.save.gift = { last: yesterday, streak: 0, week: 1 };
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
  g.save.xp = 999999;
  g._showGlobeUI(true);
  const chipShown = document.getElementById('gift-chip').classList.contains('show');
  g._openGiftModal();
  const overlayShown = document.getElementById('overlay-gift').classList.contains('show');
  const cells = document.querySelectorAll('#gift-grid .gift-cell').length;
  const today = document.querySelectorAll('#gift-grid .gift-cell.today').length;
  const c0 = g.save.coins;
  document.getElementById('btn-gift-claim').click();
  return {
    chipShown, overlayShown, cells, today,
    dCoins: g.save.coins - c0,
    chipHidAfter: !document.getElementById('gift-chip').classList.contains('show'),
    pendingAfter: g.gift.pending(),
  };
});
check(r.chipShown === true, '9: #gift-chip.show при pending', JSON.stringify(r));
check(r.overlayShown === true, '9: #overlay-gift видно після _openGiftModal', JSON.stringify(r));
check(r.cells === 7, '9: 7 клітинок у гріді', JSON.stringify(r));
check(r.today === 1, '9: рівно один сьогоднішній день підсвічено', JSON.stringify(r));
check(r.dCoins === 100, '9: клік Забрати → +100 монет (день1)', JSON.stringify(r));
check(r.chipHidAfter === true, '9: чіп схований після claim', JSON.stringify(r));
check(r.pendingAfter === false, '9: після claim більше не pending', JSON.stringify(r));

console.log('▸ 11. Битий gift.last (\'zzzz\') → shape-fix чистить, pending знову true');
await page.evaluate(() => {
  const g = window.__game;
  g.save.gift.last = 'zzzz'; // не YYYY-MM-DD і лексикографічно більше за будь-яку дату
  g.saveGame();
});
await page.goto(`${BASE}/?test`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус після reload (zzzz)');
r = await page.evaluate(() => ({ pending: window.__game.gift.pending(), last: window.__game.save.gift.last }));
check(r.pending === true, '11: після зіпсованого last shape-fix → pending === true', JSON.stringify(r));

console.log('▸ 12. Самолікування битого годинника: last +30 днів → pending true, стрик збережено');
await page.evaluate(() => {
  const g = window.__game;
  const far = g.gift.dayKey(new Date(Date.now() + 30 * 864e5));
  g.save.gift = { last: far, streak: 5, week: 1 };
  g.saveGame();
});
await page.goto(`${BASE}/?test`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус після reload (+30d)');
r = await page.evaluate(() => ({ pending: window.__game.gift.pending(), streak: window.__game.save.gift.streak }));
check(r.pending === true, '12: last у майбутньому (+30д) → самолікування → pending === true', JSON.stringify(r));
check(r.streak === 5, '12: стрик збережено (=5)', JSON.stringify(r));

console.log('▸ 13. Анти-фарм у межах толерантності: last +2 дні → НЕ лікуємо, pending false');
await page.evaluate(() => {
  const g = window.__game;
  const soon = g.gift.dayKey(new Date(Date.now() + 2 * 864e5));
  g.save.gift = { last: soon, streak: 3, week: 1 };
  g.saveGame();
});
await page.goto(`${BASE}/?test`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус після reload (+2d)');
r = await page.evaluate(() => ({ pending: window.__game.gift.pending() }));
check(r.pending === false, '13: +2 дні (≤7) → лок анти-фарму, pending === false', JSON.stringify(r));

console.log('▸ 14. JS-помилки');
check(errors.length === 0, `14: без JS-помилок (${errors.slice(0, 3).join(' | ')})`);

await ctx.close();
console.log(failed === 0 ? '✅ daily-gift pass' : `❌ daily-gift failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
