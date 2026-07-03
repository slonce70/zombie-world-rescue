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
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Покращення Радіаційного');
const meta = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'radiationupgrade');
  return item && {
    id: item.id,
    cat: item.cat,
    crystalPrice: item.crystalPrice,
    max: item.max,
    needsSkin: item.needsSkin,
  };
});
check(meta && meta.cat === 'Радіація' && meta.crystalPrice === 45 && meta.max === 1 && meta.needsSkin === 'radiation',
  'у Радіації є покращення скіна за 45 кристалів і воно потребує скін', JSON.stringify(meta));

const buyFlow = await page.evaluate(() => {
  const g = window.__game;
  g.save.crystals = 45;
  g.save.skins = g.save.skins.filter((s) => s !== 'radiation');
  g.save.upgrades.radiationupgrade = 0;
  g.test.shopBuy('radiationupgrade');
  const denied = { crystals: g.save.crystals, bought: !!g.save.upgrades.radiationupgrade };
  g.save.skins.push('radiation');
  g.test.shopBuy('radiationupgrade');
  const bought = { crystals: g.save.crystals, bought: !!g.save.upgrades.radiationupgrade };
  return { denied, bought };
});
check(buyFlow.denied.crystals === 45 && !buyFlow.denied.bought
  && buyFlow.bought.crystals === 0 && buyFlow.bought.bought,
  'покращення не купується без скіна, а зі скіном купується за 45 кристалів', JSON.stringify(buyFlow));

const fx = await page.evaluate(() => {
  const THREE = window.THREE || null;
  const g = window.__game;
  const p = g.level.player.pos;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.save.activeSkin = 'radiation';
  g.save.upgrades.radiationupgrade = 1;

  const oldBurst = g.level.effects.burst.bind(g.level.effects);
  const bursts = [];
  g.level.effects.burst = (pos, color, count, opts = {}) => {
    bursts.push({ color, count, life: opts.life || 0, up: opts.up ?? 3 });
    return oldBurst(pos, color, count, opts);
  };
  const corpse = g.test.spawnZombie('walker', p.x + 4, p.z);
  corpse.hp = corpse.maxHp = 1;
  corpse.damage(999, null, false);
  const victim = g.test.spawnZombie('walker', corpse.x, corpse.z);
  victim.hp = victim.maxHp = 100;
  g.level.effects.update(1.05);
  const puddleHp = victim.hp;

  bursts.length = 0;
  g.level.bus.emit('zombieDamaged', 10, victim);
  const withUpgradeDrops = bursts.filter((b) => b.color === 0x77ff55);

  bursts.length = 0;
  g.save.upgrades.radiationupgrade = 0;
  g.level.bus.emit('zombieDamaged', 10, victim);
  const withoutUpgradeDrops = bursts.filter((b) => b.color === 0x77ff55);
  g.level.effects.burst = oldBurst;
  return { puddleHp, withUpgradeDrops, withoutUpgradeDrops };
});
check(fx.puddleHp <= 95,
  'радіаційна калюжа після покращення наносить 5 HP за секунду', JSON.stringify(fx));
check(fx.withUpgradeDrops.length > 0 && fx.withoutUpgradeDrops.length === 0,
  'після влучання зброєю з зомбі падають краплі радіації тільки з покращенням', JSON.stringify(fx));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ПОКРАЩЕННЯ РАДІАЦІЙНОГО ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
