// Кадри нового контенту оновлення 3 для візуальної перевірки
import { chromium } from 'playwright';

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const look = (x, z, yaw, pitch = -0.1) => page.evaluate(([a, b, c, d]) => {
  window.__game.test.teleport(a, b);
  window.__game.test.setAim(c, d);
}, [x, z, yaw, pitch]);
const shot = async (name, wait = 900) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `shots/u3-${name}.png` });
  console.log('✓', name);
};

// ===== НІМЕЧЧИНА =====
await page.goto('http://localhost:8741/?test&fresh&country=DEU');
await page.waitForTimeout(9000);
await page.evaluate(() => window.__game.test.god());

await look(0, 80, 0, 0.02);
await shot('lm-gate', 1400);

await look(40, 124, 1.25, -0.03);
await shot('lm-autobahn');

await look(35, -1, 0, -0.06);
await shot('lm-beergarden');

await look(0, 46, Math.PI, -0.04); // погляд на місто з півночі
await shot('lm-autumn-town');

// щитоносець з тріщинами зблизька
await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  g.test.teleport(0, 150);
  const z = g.test.spawnZombie('shield', 0, 144.5);
  z.sleeping = true;
  z.rig.group.rotation.y = Math.PI; // обличчям на південь, до гравця
  const dir = { x: 0, y: 0, z: -1 };
  z.damage(110, dir, false); // 150→40: видно обидві стадії тріщин
  g.test.setAim(0, -0.05);
});
await shot('shield-cracks', 1200);

// ===== ФРАНЦІЯ =====
await page.goto('http://localhost:8741/?test&fresh&country=FRA');
await page.waitForTimeout(9000);
await page.evaluate(() => window.__game.test.god());

await look(58, 12, 0, 0.32);
await shot('lm-eiffel', 1400);

await look(-64, 44, 0, -0.08);
await shot('lm-lavender');

await look(12, 9, Math.PI, -0.04); // фасад кафе дивиться на північ
await shot('lm-cafe');

await look(70, 58, 0, -0.08);
await shot('lm-vineyard');

// ===== ЗБРОЯ ВІД 1-Ї ОСОБИ =====
await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(5000);
  for (const id of ['smg', 'magnum', 'sniper']) g.test.shopBuy(id);
  g.test.giveWeapon('bazooka');
  g.test.teleport(0, 60);
  g.test.setAim(0, -0.02);
});
for (const w of ['smg', 'magnum', 'sniper', 'bazooka']) {
  await page.evaluate((id) => window.__game.level.player.switchWeapon(id), w);
  await shot(`fp-${w}`, 700);
}

// ===== ГЕРОЙ ЗІ СПОРЯДЖЕННЯМ (3-тя особа) =====
await page.evaluate(() => {
  const g = window.__game;
  for (const id of ['vest', 'helmet', 'sneakers']) g.test.shopBuy(id);
  g.test.teleport(0, 100);
  g.test.setAim(2.6, -0.1);
  g.level.player.firstPerson = false;
  g.level.player._applyView();
  g.level.player._camInit = false;
});
await shot('hero-gear', 2500);

// ===== МАГАЗИН =====
await page.evaluate(() => {
  window.__game.level.player.firstPerson = true;
  window.__game.level.player._applyView();
  window.__game.shop.open();
});
await shot('shop-ui', 800);

await browser.close();
