import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
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

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Розділи магазину');
const shop = await page.evaluate(() => {
  const g = window.__game;
  g.shop.open();
  const clickTab = (name) => {
    const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === name);
    if (!tab) return null;
    tab.click();
    return [...document.querySelectorAll('.shop-item')].map((i) => i.dataset.id);
  };
  const tabs = [...document.querySelectorAll('.shop-tab')].map((t) => t.textContent);
  const hyper = clickTab('Гіперзаряди') || [];
  const skins = clickTab('Скіни') || [];
  const gifts = clickTab('Подарунки') || [];
  g.shop.close();
  return { tabs, hyper, skins, gifts };
});

check(shop.tabs.includes('Гіперзаряди'), `є вкладка «Гіперзаряди»: ${shop.tabs.join(', ')}`);
check(shop.tabs.includes('Скіни'), `є вкладка «Скіни»: ${shop.tabs.join(', ')}`);
check(shop.tabs.includes('Подарунки'), `є вкладка «Подарунки»: ${shop.tabs.join(', ')}`);
check(shop.hyper.includes('turret-hyper') && shop.hyper.includes('stunammo-hyper') && !shop.hyper.includes('turret'),
  `гіперзаряди окремо від гаджетів: ${shop.hyper.join(', ')}`);
check(shop.skins.includes('goldskin') && shop.skins.includes('militaryskin') && !shop.skins.includes('vest'),
  `скіни окремо від спорядження: ${shop.skins.join(', ')}`);
check(shop.gifts.includes('coins500') && !shop.gifts.includes('medkit'),
  `подарунки окремо від припасів: ${shop.gifts.join(', ')}`);

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РОЗДІЛИ МАГАЗИНУ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
