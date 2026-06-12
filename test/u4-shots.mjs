// Скриншоти оновлення 4 для візуального контролю
import { chromium } from 'playwright';
const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const load = async (extra = '&country=UKR') => {
  await page.goto(`${BASE}/?test&fresh${extra}`);
  if (extra.includes('country')) {
    await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level, null, { timeout: 30000 });
  } else {
    await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  }
};
const shot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots/u4-${name}.png` });
  console.log('📸', name);
};

// 1. скіни: герой у 3-й особі, камера дивиться на нього
for (const skin of ['ninja', 'astro', 'super', 'frog', 'robot', 'pirate']) {
  await load();
  await page.evaluate((sk) => {
    const g = window.__game;
    g.test.setSkin(sk);
  }, skin);
  await load('&country=UKR'); // перезібрати рівень зі скіном... fresh скине сейв!
  await page.evaluate((sk) => {
    const g = window.__game;
    // одягаємо скін прямо в рівні: пересоздаємо ріг
    g.test.setSkin(sk);
    const p = g.level.player;
    p.firstPerson = false;
    p._applyView();
    g.test.teleport(0, 150);
    p.yaw = Math.PI; // герой обличчям до камери? камера за спиною... покрутимо пітч
    p.pitch = -0.15;
  }, skin);
  await shot(`skin-${skin}`);
}

// 2. танець «курча» + конфеті
await load();
await page.evaluate(() => {
  const g = window.__game;
  g.test.setDance('chicken');
  g.test.teleport(0, 150);
  g.test.dance();
});
await shot('dance-chicken');

// 3. мегабокс зблизька
await load();
await page.evaluate(() => {
  const g = window.__game;
  const mb = g.level.megabox;
  g.test.teleport(mb.x + 3, mb.z + 3);
  const p = g.level.player;
  p.yaw = Math.atan2(-(mb.x - p.pos.x), -(mb.z - p.pos.z));
  p.pitch = -0.1;
});
await shot('megabox');

// 4. пес поруч із героєм (3-тя особа)
await load();
await page.evaluate(async () => {
  const g = window.__game;
  g.test.givePet();
  g.test.teleport(0, 150);
  const p = g.level.player;
  p.firstPerson = false;
  p._applyView();
  await new Promise((r) => setTimeout(r, 1500));
});
await shot('dog');

// 5. на самокаті
await load();
await page.evaluate(() => {
  const g = window.__game;
  g.test.mountScooter(0);
  g.test.key('KeyW', true);
});
await page.waitForTimeout(1200);
await page.evaluate(() => window.__game.test.key('KeyW', false));
await shot('scooter');

// 6. гаджети: батут + барикада
await load();
await page.evaluate(() => {
  const g = window.__game;
  g.test.giveGadgets(1, 1);
  g.test.teleport(0, 152);
  g.test.placeTramp();
  const p = g.level.player;
  p.yaw += 0.9;
  g.test.placeWall();
  p.firstPerson = false;
  p._applyView();
  p.yaw += 1.2;
  p.pitch = -0.12;
});
await shot('gadgets');

// 7. шторм: стіна + HUD
await load();
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated.UKR = true;
  g.saveGame();
  g.test.startStorm('UKR');
});
await page.waitForFunction(() => window.__game.level && window.__game.level.storm, null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  // стаємо так, щоб бачити стіну шторму
  g.level.storm.r = 40;
  g.test.teleport(10, 0);
  g.level.player.yaw = Math.PI / 2;
  g.level.player.pitch = 0.05;
});
await shot('storm');

// 8. панелі глобуса
await page.goto(`${BASE}/?test`);
await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__game;
  g.test.addXp ? g.progress.addXp(500) : null;
  g.renderPassPanel();
  document.getElementById('overlay-pass').classList.add('show');
});
await shot('pass-panel');
await page.evaluate(() => {
  document.getElementById('overlay-pass').classList.remove('show');
  const g = window.__game;
  g.renderQuestsPanel();
  document.getElementById('overlay-quests').classList.add('show');
});
await shot('quests-panel');
await page.evaluate(() => {
  document.getElementById('overlay-quests').classList.remove('show');
  const g = window.__game;
  g.renderWardrobe();
  document.getElementById('overlay-wardrobe').classList.add('show');
});
await shot('wardrobe');
await page.evaluate(() => document.getElementById('overlay-wardrobe').classList.remove('show'));
await shot('globe-buttons');

await browser.close();
console.log('DONE');
