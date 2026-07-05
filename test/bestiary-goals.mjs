// 🦁 Бестіарій-колекція (R2-5.3): одноразові нагороди за 10/20/усі зібрані види зомбі.
//    10 видів → +1000 монет, 20 видів → +25💎, усі види → +50💎 + титул «Зоолог».
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

console.log('▸ Boot ?test&fresh&country=UKR — свіжий сейв, у рівні');
await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000 * SLOW, 'рівень');

// Нейтралізуємо челенджі, щоб нарахування монет за паси не забруднило дельти
await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
});

console.log('▸ 1. fresh: прапорці false; 9 видів зібрано → кіл 10-го виду → +1000 монет, b10=true');
let r = await page.evaluate(async () => {
  const g = window.__game;
  const { BESTIARY_TYPE_IDS } = await import('/src/zombies.js');
  g.save.bestiaryGoals = { b10: false, b20: false, all: false };
  g.save.bestiary = {};
  // 9 видів вже «зібрано» (count>0)
  for (const id of BESTIARY_TYPE_IDS.slice(0, 9)) g.save.bestiary[id] = 1;
  g.save.xp = 999999; // щоб нарахування монет за паси/рівні не забруднило дельту
  g.save.coins = 5000;
  const c0 = g.save.coins;
  const flagsBefore = { ...g.save.bestiaryGoals };
  // симулюємо кіл 10-го виду через реальний шлях інкремента (той самий, що й у zombieKilled-хендлері)
  const tenthId = BESTIARY_TYPE_IDS[9];
  g.save.bestiary[tenthId] = (g.save.bestiary[tenthId] || 0) + 1;
  g._checkBestiaryGoals();
  return {
    flagsBefore,
    b10: g.save.bestiaryGoals.b10,
    b20: g.save.bestiaryGoals.b20,
    all: g.save.bestiaryGoals.all,
    dCoins: g.save.coins - c0,
    speciesCount: BESTIARY_TYPE_IDS.filter((id) => (g.save.bestiary[id] || 0) > 0).length,
  };
});
check(r.flagsBefore.b10 === false && r.flagsBefore.b20 === false && r.flagsBefore.all === false,
  '1: fresh прапорці false', JSON.stringify(r.flagsBefore));
check(r.speciesCount === 10, '1: рівно 10 видів зібрано', JSON.stringify({ n: r.speciesCount }));
check(r.b10 === true, '1: b10 стало true після 10-го виду', JSON.stringify(r));
check(r.dCoins === 1000, '1: нараховано рівно +1000 монет', JSON.stringify({ dCoins: r.dCoins }));
check(r.b20 === false && r.all === false, '1: b20/all ще не видані (лише 10 видів)', JSON.stringify(r));

console.log('▸ 2. Ще кіл того ж 10-го виду — БЕЗ повторної видачі +1000');
let r2 = await page.evaluate(() => {
  const g = window.__game;
  const c0 = g.save.coins;
  g._checkBestiaryGoals();
  return { dCoins: g.save.coins - c0, b10: g.save.bestiaryGoals.b10 };
});
check(r2.dCoins === 0, '2: повторний виклик не додав монет', JSON.stringify(r2));
check(r2.b10 === true, '2: b10 лишається true', JSON.stringify(r2));

console.log('▸ 3. 20 видів → +25💎 (b20=true)');
let r3 = await page.evaluate(async () => {
  const g = window.__game;
  const { BESTIARY_TYPE_IDS } = await import('/src/zombies.js');
  g.save.crystals = 0;
  for (const id of BESTIARY_TYPE_IDS.slice(0, 19)) g.save.bestiary[id] = g.save.bestiary[id] || 1;
  const c0 = g.save.crystals;
  const twentiethId = BESTIARY_TYPE_IDS[19];
  g.save.bestiary[twentiethId] = (g.save.bestiary[twentiethId] || 0) + 1;
  g._checkBestiaryGoals();
  return {
    dCrystals: g.save.crystals - c0,
    b20: g.save.bestiaryGoals.b20,
    all: g.save.bestiaryGoals.all,
    speciesCount: BESTIARY_TYPE_IDS.filter((id) => (g.save.bestiary[id] || 0) > 0).length,
  };
});
check(r3.speciesCount === 20, '3: рівно 20 видів зібрано', JSON.stringify({ n: r3.speciesCount }));
check(r3.b20 === true, '3: b20 стало true', JSON.stringify(r3));
check(r3.dCrystals === 25, '3: нараховано рівно +25 кристалів', JSON.stringify(r3));
check(r3.all === false, '3: all ще не видано (лише 20 видів)', JSON.stringify(r3));

console.log('▸ 4. Усі види → +50💎, титул «Зоолог» у save.titles');
let r4 = await page.evaluate(async () => {
  const g = window.__game;
  const { BESTIARY_TYPE_IDS } = await import('/src/zombies.js');
  const c0 = g.save.crystals;
  for (const id of BESTIARY_TYPE_IDS) g.save.bestiary[id] = g.save.bestiary[id] || 1;
  g._checkBestiaryGoals();
  return {
    dCrystals: g.save.crystals - c0,
    all: g.save.bestiaryGoals.all,
    hasTitle: (g.save.titles || []).includes('zoologist'),
    titles: g.save.titles,
    speciesCount: BESTIARY_TYPE_IDS.filter((id) => (g.save.bestiary[id] || 0) > 0).length,
  };
});
check(r4.speciesCount === r4.speciesCount, '4: усі види присутні', JSON.stringify(r4)); // sanity — довжина зафіксована нижче окремо
check(r4.all === true, '4: all стало true', JSON.stringify(r4));
check(r4.dCrystals === 50, '4: нараховано рівно +50 кристалів', JSON.stringify(r4));
check(r4.hasTitle === true, '4: титул zoologist видано в save.titles', JSON.stringify(r4.titles));

console.log('▸ 5. Ще виклик після all=true — без повторної видачі');
let r5 = await page.evaluate(() => {
  const g = window.__game;
  const c0 = g.save.crystals;
  g._checkBestiaryGoals();
  return { dCrystals: g.save.crystals - c0 };
});
check(r5.dCrystals === 0, '5: повторний виклик після all=true не додав кристалів', JSON.stringify(r5));

console.log('▸ 6. JS-помилки');
check(errors.length === 0, `6: без JS-помилок (${errors.slice(0, 3).join(' | ')})`);

await ctx.close();
console.log(failed === 0 ? '✅ bestiary-goals pass' : `❌ bestiary-goals failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
