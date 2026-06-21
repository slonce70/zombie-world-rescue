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

console.log('▸ Гаджет «Телепортація»');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const G = GADGETS.teleport;
  return {
    gadget: G && { cd: G.cd, price: G.price, icon: G.icon },
    shop: SHOP_ITEMS.some((i) => i.id === 'teleport' && i.gadget && i.price === 1000),
  };
});
check(meta.gadget && meta.gadget.cd === 45 && meta.gadget.price === 1000 && meta.gadget.icon === '🪄',
  'мета: 45с cd, 1000 монет, 🪄', JSON.stringify(meta));
check(meta.shop, 'товар є в магазині');

const tp = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.test.unlockGadget('teleport');
  g.test.gadgetCdReset();
  g.test.teleport(0, 150); // відкрите місце
  p.yaw = 0; // вперед = -z
  p.vel.set(3, 0, 3);
  const before = { x: p.pos.x, z: p.pos.z };
  const used = g.test.useGadget();
  const after = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  const groundY = g.level.world.groundH(after.x, after.z);
  return {
    used,
    cd: g.level.gadgets.cd,
    moved: Math.hypot(after.x - before.x, after.z - before.z),
    forward: before.z - after.z, // мав рушити у -z
    onGround: p.onGround,
    vel: Math.hypot(p.vel.x, p.vel.y, p.vel.z),
    offGround: Math.abs(after.y - groundY),
  };
});
check(tp.used && tp.cd === 45, 'телепорт спрацьовує і ставить cd 45с', JSON.stringify(tp));
check(tp.moved > 12 && tp.moved <= 21, 'гравець стрибнув уперед (≈20м, не далі)', JSON.stringify(tp));
check(tp.forward > 2, 'стрибок у напрямку погляду (-z)', JSON.stringify(tp));
check(tp.onGround && tp.offGround < 0.5, 'приземлився на землю', JSON.stringify(tp));
check(tp.vel === 0, 'швидкість обнулена після телепорту', JSON.stringify(tp));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ТЕЛЕПОРТАЦІЯ ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
