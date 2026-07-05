// 🌟 «Пожертва рятівника»: нескінченний монетний стік — динамічна ціна ×1.5,
//    лічильник donations/donStars, титули за донації, XP/passLvl не чіпаються.
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

// Магазин потрібен у рівні (player має існувати) — стартуємо місію в UKR
console.log('▸ Boot ?test&fresh&country=UKR — свіжий сейв, у рівні');
await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000 * SLOW, 'рівень');

// Нейтралізуємо челенджі, щоб нарахування монет за паси не забруднило дельти
await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
});

console.log('▸ 1. fresh: ціна donate === 2000, купівля → -2000, donations/donStars === 1');
let r = await page.evaluate(async () => {
  const g = window.__game;
  const mod = await import('/src/shop.js');
  const donItem = mod.SHOP_ITEMS.find((i) => i.id === 'donate');
  g.save.coins = 20000;
  g.save.donations = 0;
  g.save.donStars = 0;
  const price0 = g.shop.priceOf(donItem);
  const passLvl0 = g.save.passLvl;
  const xp0 = g.save.xp;
  const c0 = g.save.coins;
  g.shop.buy('donate');
  const price1 = g.shop.priceOf(donItem);
  return {
    price0, price1,
    dCoins: g.save.coins - c0,
    donations: g.save.donations,
    donStars: g.save.donStars,
    passLvl0, passLvl1: g.save.passLvl,
    xp0, xp1: g.save.xp,
  };
});
check(r.price0 === 2000, '1: свіжа ціна donate === 2000', JSON.stringify({ price0: r.price0 }));
check(r.dCoins === -2000, '1: купівля списала рівно 2000 монет', JSON.stringify({ dCoins: r.dCoins }));
check(r.donations === 1, '1: donations === 1', JSON.stringify({ donations: r.donations }));
check(r.donStars === 1, '1: donStars === 1', JSON.stringify({ donStars: r.donStars }));

console.log('▸ 2. Ціна тепер 3000 (2000×1.5); друга покупка → -3000, donations === 2');
check(r.price1 === 3000, '2: ціна після 1 донації === 3000', JSON.stringify({ price1: r.price1 }));
let r2 = await page.evaluate(async () => {
  const g = window.__game;
  const mod = await import('/src/shop.js');
  const donItem = mod.SHOP_ITEMS.find((i) => i.id === 'donate');
  const priceNow = g.shop.priceOf(donItem);
  const c0 = g.save.coins;
  g.shop.buy('donate');
  return { priceNow, dCoins: g.save.coins - c0, donations: g.save.donations };
});
check(r2.priceNow === 3000, '2: поточна ціна перед 2-ю покупкою === 3000', JSON.stringify({ priceNow: r2.priceNow }));
check(r2.dCoins === -3000, '2: друга покупка списала рівно 3000', JSON.stringify({ dCoins: r2.dCoins }));
check(r2.donations === 2, '2: donations === 2', JSON.stringify({ donations: r2.donations }));

console.log('▸ 3. passLvl і xp НЕ змінилися після покупок');
check(r.passLvl0 === r.passLvl1, '3: passLvl незмінний', JSON.stringify({ before: r.passLvl0, after: r.passLvl1 }));
check(r.xp0 === r.xp1, '3: xp незмінний', JSON.stringify({ before: r.xp0, after: r.xp1 }));

console.log('▸ 4. Титул за 5 донацій: donations=5 → syncTitles → титул у save.titles');
r = await page.evaluate(async () => {
  const g = window.__game;
  const mod = await import('/src/titles.js');
  g.save.donations = 5;
  const changed = mod.syncTitles(g.save);
  return { changed, hasTitle: (g.save.titles || []).includes('generous_rescuer'), titles: g.save.titles };
});
check(r.hasTitle === true, '4: титул generous_rescuer видано за 5 донацій', JSON.stringify({ titles: r.titles }));

console.log('▸ 5. UI: картка donate видима у магазині, після покупки НЕ maxed');
r = await page.evaluate(() => {
  const g = window.__game;
  g.save.coins = 999999;
  g.shop.open();
  // перемкнути на вкладку «Ресурси», де живе donate
  const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Ресурси');
  if (tab) tab.click();
  const cardBefore = document.querySelector('.shop-item[data-id="donate"]');
  const visibleBefore = !!cardBefore;
  g.shop.buy('donate');
  const cardAfter = document.querySelector('.shop-item[data-id="donate"]');
  const visibleAfter = !!cardAfter;
  const maxed = cardAfter ? cardAfter.classList.contains('maxed') : true;
  const priceTxt = cardAfter ? (cardAfter.querySelector('.shop-price') || {}).textContent : '';
  g.shop.close();
  return { visibleBefore, visibleAfter, maxed, priceTxt };
});
check(r.visibleBefore === true, '5: картка donate видима у магазині', JSON.stringify({ v: r.visibleBefore }));
check(r.visibleAfter === true && r.maxed === false, '5: після покупки картка лишилась і НЕ maxed', JSON.stringify(r));

console.log('▸ 6. JS-помилки');
check(errors.length === 0, `6: без JS-помилок (${errors.slice(0, 3).join(' | ')})`);

await ctx.close();
console.log(failed === 0 ? '✅ prestige-donate pass' : `❌ prestige-donate failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
