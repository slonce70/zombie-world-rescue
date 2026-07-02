// 🧪 Глава 3 «Лігво Вірусу»: анлок-гейт, локація LAB, МЕГА-СЛИЗНЯК (щит-фази,
// призов крапель), нагороди першої перемоги (медаль/пет/💎) і компас.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

// до анлоку: картка заблокована, старт відмовляє, компас мовчить про Главу 3
const lockInfo = await page.evaluate(() => {
  const g = window.__game;
  g.renderSoloMenu();
  const card = document.querySelector('.solo-mode[data-mode="chapter3"]');
  const started = g.startChapter3();
  return { locked: card && card.classList.contains('locked'), started, state: g.state };
});
check(lockInfo.locked && lockInfo.started === false && lockInfo.state === 'globe', 'до Глави 2 + Острова — режим заблоковано', JSON.stringify(lockInfo));

// анлок: усі країни + LOST + Глава 2 done → картка відкрита, компас кличе у Главу 3
const openInfo = await page.evaluate(async () => {
  const g = window.__game;
  const { CAMPAIGN_ORDER } = await import('/src/countries.js');
  for (const id of CAMPAIGN_ORDER) g.save.liberated[id] = true;
  g.save.liberated.LOST = true;
  g.save.infected = { cleared: { POL: 1, DEU: 1, FRA: 1 }, done: true };
  g.saveGame();
  g.renderSoloMenu();
  const card = document.querySelector('.solo-mode[data-mode="chapter3"]');
  const compass = g._nextActionInfo();
  return { locked: card.classList.contains('locked'), icon: compass.icon, text: compass.text };
});
check(!openInfo.locked && openInfo.icon === '🧪', 'після анлоку картка відкрита, компас кличе у Лігво', JSON.stringify(openInfo));

// старт: рівень LAB будується, місії є, зомбі живі
await page.evaluate(() => window.__game.startChapter3());
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.countryId === 'LAB', null, { timeout: 60000 });
await page.waitForFunction(() => window.__game.level && window.__game.level.stats.time > 0.5, null, { timeout: 30000 }); // живий рендер, не кадр завантаження
const lab = await page.evaluate(() => {
  const g = window.__game;
  return {
    country: g.level.country.name,
    missions: g.level.missions.getHudList().length,
    zombies: g.level.zombies.list.filter((z) => z.state !== 'dead').length,
    modeId: g.level.modeId,
    calls: g.renderer.info.render.calls,
  };
});
check(lab.missions > 0 && lab.zombies > 0 && lab.modeId === 'campaign', 'LAB — кампанія з місіями і зомбі', JSON.stringify(lab));
// бюджет 420 — це UKR-сценарій mobile-perf (density 1.3); фінальні рівні щільніші:
// LOST міряється ~660 calls. Гейт LAB — паритет із LOST, не гірше (виміряно 654 vs 661).
// Глобальний перф-борг «менше акторів/instancing» — окрема задача з аудиту v232.
check(lab.calls <= 700, 'draw calls не гірше Острова Динозаврів (≤700)', lab.calls);

// бос: стиль slime, 9000 HP, щит-фази і призов крапель
const boss = await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.zombies.spawnBoss();
  g.test.god();
  // цілі присипляємо, щоб update не відволікався
  for (const z of g.level.zombies.list) if (z !== b) z.sleeping = true;
  return { style: b.bossStyle, hp: b.maxHp };
});
check(boss.style === 'slime' && boss.hp === 9000, 'МЕГА-СЛИЗНЯК: стиль slime, 9000 HP', JSON.stringify(boss));

const phases = await page.evaluate(() => {
  const g = window.__game;
  const zm = g.level.zombies;
  const b = zm.boss;
  // драйвимо симуляцію напряму: headless RAF ~стоїть (пастка ігрового часу)
  const seen = { on: false, off: false };
  for (let i = 0; i < 300; i++) {
    zm.update(0.06);
    if (b.worldBossShield) seen.on = true;
    else if (seen.on) seen.off = true;
    if (seen.on && seen.off) break;
  }
  // шкода під щитом ×0.25 (готовий шлях worldBossShield у _damage)
  b.worldBossShield = true;
  const hp0 = b.hp;
  zm._damage(b, 100, null, false, {});
  const underShield = hp0 - b.hp;
  b.worldBossShield = false;
  const hp1 = b.hp;
  zm._damage(b, 100, null, false, {});
  const open = hp1 - b.hp;
  return { ...seen, underShield, open };
});
check(phases.on && phases.off, 'слизовий щит вмикається і спадає фазами', JSON.stringify(phases));
check(phases.underShield === 25 && phases.open === 100, 'щит ріже шкоду ×0.25', JSON.stringify(phases));

const minions = await page.evaluate(() => {
  const g = window.__game;
  const zm = g.level.zombies;
  const b = zm.boss;
  const n0 = zm.list.filter((z) => z.state !== 'dead').length;
  b.hp = Math.floor(b.maxHp * 0.7); // поріг 75% → призов
  zm.update(0.06);
  const n1 = zm.list.filter((z) => z.state !== 'dead').length;
  return { dN: n1 - n0 };
});
check(minions.dN === 6, 'на порозі 75% бос призиває 6 крапель', JSON.stringify(minions));

// перемога: медаль, пет, кристали; компас перемикається далі
const win = await page.evaluate(() => {
  const g = window.__game;
  const cr0 = g.save.crystals || 0;
  g._showVictory();
  return {
    lib: !!g.save.liberated.LAB,
    medal: g.save.medals.includes('chapter3'),
    pet: g.save.pets.includes('slimepet'),
    dCr: (g.save.crystals || 0) - cr0,
    compassIcon: g._nextActionInfo().icon,
    victoryH1: document.querySelector('#overlay-victory h1').textContent,
  };
});
check(win.lib && win.medal && win.pet && win.dCr === 25, 'перша перемога: медаль + Доктор Слизняк + 💎 25', JSON.stringify(win));
check(win.victoryH1.includes('ЛІГВО'), 'екран перемоги з титулом Глави 3', win.victoryH1);
check(win.compassIcon !== '🧪', 'компас після Глави 3 веде далі (тиждень/день)', win.compassIcon);

// повторна перемога не дублює нагороди; пет не продається в магазині
const again = await page.evaluate(async () => {
  const g = window.__game;
  const cr0 = g.save.crystals || 0;
  g.victoryShown = false;
  g._showVictory();
  const { SHOP_ITEMS } = await import('/src/shop.js').catch(() => ({ SHOP_ITEMS: null }));
  const inShop = SHOP_ITEMS ? SHOP_ITEMS.some((i) => i.id === 'slimepet') : null;
  return { dCr: (g.save.crystals || 0) - cr0, pets: g.save.pets.filter((p) => p === 'slimepet').length, inShop };
});
check(again.dCr === 0 && again.pets === 1, 'повторна перемога не дублює нагороди', JSON.stringify(again));
check(again.inShop === false || again.inShop === null, 'slimepet не продається в магазині', String(again.inShop));

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 CHAPTER3 OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
