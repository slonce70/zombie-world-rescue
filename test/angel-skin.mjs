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

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Ангел: магазин і скін');
const meta = await page.evaluate(async () => {
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const items = SHOP_ITEMS.filter((i) => i.cat === 'Ангел');
  let built = false, looksAngel = false;
  try {
    const rig = makeHero('angel', window.__game.save.hero);
    built = !!rig.group;
    looksAngel = rig.heroSkin === 'angel';
  } catch (e) { built = false; }
  return {
    skin: HERO_SKINS.angel || null,
    items: items.map((i) => ({ id: i.id, step: i.angelStep, crystalPrice: i.crystalPrice, max: i.max })),
    built,
    looksAngel,
  };
});
check(meta.skin && meta.skin.icon === '🪽', 'angel є у HERO_SKINS', JSON.stringify(meta.skin));
check(meta.built && meta.looksAngel, 'makeHero("angel") будується окремим скіном', JSON.stringify(meta));
check(meta.items.length === 3 && meta.items.every((i, idx) => i.id === `angel-action-${idx + 1}` && i.step === idx + 1 && i.crystalPrice === 20 && i.max === 1),
  'у вкладці Ангел є 3 послідовні акції по 20 кристалів', JSON.stringify(meta.items));

const shopFlow = await page.evaluate(() => {
  const g = window.__game;
  g.shop.open();
  const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Ангел');
  const tabOk = !!tab;
  if (tab) tab.click();
  const rendered = [...document.querySelectorAll('.shop-item')].map((i) => i.dataset.id);
  g.save.crystals = 60;
  g.save.skins = g.save.skins.filter((s) => s !== 'angel');
  g.save.activeSkin = 'classic';
  g.save.upgrades['angel-action-1'] = 0;
  g.save.upgrades['angel-action-2'] = 0;
  g.save.upgrades['angel-action-3'] = 0;

  g.test.shopBuy('angel-action-2');
  const lockedSecond = { crystals: g.save.crystals, step2: g.save.upgrades['angel-action-2'] || 0 };
  g.test.shopBuy('angel-action-1');
  const after1 = { crystals: g.save.crystals, step1: g.save.upgrades['angel-action-1'] || 0 };
  g.test.shopBuy('angel-action-3');
  const lockedThird = { crystals: g.save.crystals, step3: g.save.upgrades['angel-action-3'] || 0 };
  g.test.shopBuy('angel-action-2');
  g.test.shopBuy('angel-action-3');
  const afterAll = {
    crystals: g.save.crystals,
    steps: [1, 2, 3].map((n) => g.save.upgrades[`angel-action-${n}`] || 0),
    owned: g.save.skins.includes('angel'),
    active: g.save.activeSkin,
  };
  g.test.shopBuy('angel-action-3');
  const afterRepeat = { crystals: g.save.crystals, step3: g.save.upgrades['angel-action-3'] || 0 };
  g.shop.close();
  return { tabOk, rendered, lockedSecond, after1, lockedThird, afterAll, afterRepeat };
});
check(shopFlow.tabOk && shopFlow.rendered.join(',') === 'angel-action-1,angel-action-2,angel-action-3',
  'магазин має вкладку Ангел зі стрічкою акцій', JSON.stringify(shopFlow.rendered));
check(shopFlow.lockedSecond.crystals === 60 && shopFlow.lockedSecond.step2 === 0,
  'друга акція заблокована без першої', JSON.stringify(shopFlow.lockedSecond));
check(shopFlow.after1.crystals === 40 && shopFlow.after1.step1 === 1,
  'перша акція коштує 20 кристалів', JSON.stringify(shopFlow.after1));
check(shopFlow.lockedThird.crystals === 40 && shopFlow.lockedThird.step3 === 0,
  'третя акція заблокована без другої', JSON.stringify(shopFlow.lockedThird));
check(shopFlow.afterAll.crystals === 0 && shopFlow.afterAll.steps.every((n) => n === 1) && shopFlow.afterAll.owned && shopFlow.afterAll.active === 'angel',
  'усі 3 акції відкривають і одягають скін Ангел', JSON.stringify(shopFlow.afterAll));
check(shopFlow.afterRepeat.crystals === 0 && shopFlow.afterRepeat.step3 === 1,
  'куплену акцію не можна купити вдруге', JSON.stringify(shopFlow.afterRepeat));

console.log('▸ Ангел: іскри після вбивства');
const killFx = await page.evaluate(() => {
  const g = window.__game;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.save.activeSkin = 'angel';
  const hits = [];
  const oldBurst = g.level.effects.burst.bind(g.level.effects);
  g.level.effects.burst = (pos, color, count, opts = {}) => {
    hits.push({ color, count, life: opts.life || 0, y: Math.round(pos.y * 10) / 10 });
    return oldBurst(pos, color, count, opts);
  };
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('walker', p.x + 3, p.z);
  z.hp = z.maxHp = 10;
  z.damage(999, null, false);
  g.level.effects.burst = oldBurst;
  return hits;
});
check(killFx.some((fx) => fx.color === 0xffffff && fx.count >= 18 && fx.life >= 3),
  'у скіні Ангел після kill лишаються білі іскри на 3с', JSON.stringify(killFx));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 АНГЕЛ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
