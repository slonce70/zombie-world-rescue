import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Магазин вимкнений у Штормі');
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated.UKR = true;
  g.saveGame();
  g.test.startStorm('UKR');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.storm, null, { timeout: 30000 });

const stormShop = await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  g.level.player.health = g.level.player.maxHealth - 60;
  g.test.giveCoins(500);
  const coins = g.save.coins;
  g.shop.open();
  const afterOpen = {
    open: g.shop.isOpen,
    shown: document.getElementById('shop').classList.contains('show'),
    keyHint: getComputedStyle(document.querySelector('#shop .keyboard-grid')).display,
    coins: g.save.coins,
  };
  g.shop.toggle();
  const afterToggle = {
    open: g.shop.isOpen,
    shown: document.getElementById('shop').classList.contains('show'),
    coins: g.save.coins,
  };
  g.test.shopBuy('grenade');
  return {
    afterOpen,
    afterToggle,
    afterBuy: {
      open: g.shop.isOpen,
      shown: document.getElementById('shop').classList.contains('show'),
      coins: g.save.coins,
    },
    coins,
  };
});
check(!stormShop.afterOpen.open && !stormShop.afterOpen.shown, 'open() не відкриває магазин у Штормі', JSON.stringify(stormShop.afterOpen));
check(stormShop.afterOpen.keyHint === 'none', 'підказка клавіші B схована у Штормі', JSON.stringify(stormShop.afterOpen));
check(!stormShop.afterToggle.open && !stormShop.afterToggle.shown, 'toggle() не відкриває магазин у Штормі', JSON.stringify(stormShop.afterToggle));
check(stormShop.afterBuy.coins === stormShop.coins && !stormShop.afterBuy.open && !stormShop.afterBuy.shown,
  'shopBuy() не купує і не відкриває магазин у Штормі', JSON.stringify(stormShop.afterBuy));

console.log('▸ Тач-кнопка магазину схована у Штормі');
await page.goto(`${BASE}/?test&fresh&seed=1&touch`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated.UKR = true;
  g.saveGame();
  g.test.startStorm('UKR');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.storm, null, { timeout: 30000 });
const stormTouchShop = await page.evaluate(() => {
  const el = document.getElementById('tb-shop');
  return { display: getComputedStyle(el).display, visible: el.offsetParent !== null };
});
check(stormTouchShop.display === 'none' && !stormTouchShop.visible,
  'кнопка 🛒 схована у Штормі', JSON.stringify(stormTouchShop));

console.log('▸ Магазин працює у кампанії');
await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && !window.__game.level.storm, null, { timeout: 30000 });
const campaignShop = await page.evaluate(() => {
  const g = window.__game;
  g.shop.open();
  return {
    open: g.shop.isOpen,
    shown: document.getElementById('shop').classList.contains('show'),
  };
});
check(campaignShop.open && campaignShop.shown, 'open() відкриває магазин у кампанії', JSON.stringify(campaignShop));

console.log('▸ Тач-кнопка магазину є у кампанії');
await page.goto(`${BASE}/?test&fresh&country=UKR&touch`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && !window.__game.level.storm, null, { timeout: 30000 });
const campaignTouchShop = await page.evaluate(() => {
  const el = document.getElementById('tb-shop');
  return { display: getComputedStyle(el).display, visible: el.offsetParent !== null };
});
check(campaignTouchShop.display !== 'none' && campaignTouchShop.visible,
  'кнопка 🛒 є у кампанії', JSON.stringify(campaignTouchShop));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 STORM-NO-SHOP OK' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
