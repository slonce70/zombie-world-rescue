// 🌍 v303 «Світ врятовано»: фінал кампанії (одноразова церемонія на глобусі) + вкладка
// «Герой» в Альбомі. Тригер виділено у публічний game._maybeWorldSaved() — тест підробляє
// 12/12 звільнених БЕЗ worldSaved і перевіряє: показ, +50💎, медаль 'WORLD', worldSaved=1,
// одноразовість, кнопку «Ура!» і лічильники профілю героя проти підробленого save.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let fail = 0;
const check = (ok, msg, x = '') => { console.log((ok ? '  ✅' : '  ❌') + ' ' + msg, x); if (!ok) fail++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// ---------- (1) тригер: 12/12 без worldSaved → церемонія + нагорода ----------
console.log('▸ Тригер: усі 12 країн вільні, worldSaved ще нема');
const first = await page.evaluate(async () => {
  const { CAMPAIGN_ORDER } = await import('/src/countries.js');
  const g = window.__game;
  g.save.liberated = {};
  for (const c of CAMPAIGN_ORDER) g.save.liberated[c] = true;
  g.save.worldSaved = 0;
  g.save.crystals = 10;
  g.save.medals = [];
  g.save.stars = { UKR: 3, POL: 2 };      // 5 зірок кампанії
  g.save.friends = { UKR: true };         // 1 врятований друг
  g.save.stats.killed = 123;
  const shown = g._maybeWorldSaved();
  return {
    shown,
    overlay: document.getElementById('overlay-worldsaved').classList.contains('show'),
    crystals: g.save.crystals,
    hasMedal: (g.save.medals || []).includes('WORLD'),
    worldSaved: g.save.worldSaved,
    nums: document.getElementById('worldsaved-nums').textContent,
    reward: document.getElementById('worldsaved-reward').textContent,
    confetti: document.getElementById('worldsaved-confetti').children.length,
  };
});
check(first.shown === true && first.overlay, 'оверлей «Світ врятовано» показано', JSON.stringify({ shown: first.shown, overlay: first.overlay }));
check(first.crystals === 60, '+50 кристалів (10 → 60)', String(first.crystals));
check(first.hasMedal && first.worldSaved === 1, "медаль 'WORLD' у save.medals і worldSaved=1", JSON.stringify({ hasMedal: first.hasMedal, worldSaved: first.worldSaved }));
check(/12\/12/.test(first.nums) && /123/.test(first.nums), 'рядок цифр: 12/12 країн і 123 переможено', first.nums);
check(/50/.test(first.reward), 'рядок нагороди згадує 💎 +50', first.reward);
check(first.confetti > 0, 'конфетті насипано', String(first.confetti));

// ---------- (2) одноразовість: повторний виклик нічого не робить ----------
console.log('▸ Одноразовість: повторний виклик не показує вдруге і не нараховує знову');
const second = await page.evaluate(() => {
  const g = window.__game;
  g._hideOverlay('overlay-worldsaved');
  const crystalsBefore = g.save.crystals;
  const shown = g._maybeWorldSaved();
  return {
    shown,
    overlay: document.getElementById('overlay-worldsaved').classList.contains('show'),
    crystalsDelta: g.save.crystals - crystalsBefore,
    worldMedals: (g.save.medals || []).filter((m) => m === 'WORLD').length,
  };
});
check(second.shown === false && !second.overlay, 'повторно оверлей НЕ показується', JSON.stringify(second));
check(second.crystalsDelta === 0, 'повторно кристали НЕ нараховуються', String(second.crystalsDelta));
check(second.worldMedals === 1, "медаль 'WORLD' не дублюється", String(second.worldMedals));

// ---------- (3) кнопка «Ура!» закриває ----------
console.log('▸ Кнопка «Ура!» закриває оверлей');
await page.evaluate(() => window.__game._showOverlay('overlay-worldsaved'));
await page.click('#btn-worldsaved-close');
const closed = await page.evaluate(() => !document.getElementById('overlay-worldsaved').classList.contains('show'));
check(closed, 'оверлей закрито кнопкою «Ура!»');

// ---------- (4) вкладка «Герой»: лічильники проти підробленого save ----------
console.log('▸ Альбом → вкладка Герой: профіль читає підроблений save');
await page.click('#btn-menu');
await page.waitForSelector('#overlay-menu.show', { timeout: 8000 });
await page.click('#btn-album');
await page.waitForSelector('#overlay-album.show', { timeout: 8000 });
const hero = await page.evaluate(() => {
  const g = window.__game;
  const pane = document.querySelector('#album-content .album-pane[data-tab="hero"]');
  return {
    isDefault: g._albumTab === 'hero',
    hasTab: !!document.querySelector('#album-content .album-tab[data-tab="hero"]'),
    text: pane ? pane.textContent.replace(/\s+/g, ' ') : '',
    worldMedalRevealed: !!(pane && [...pane.querySelectorAll('.album-card.revealed .album-portrait')].some((e) => e.textContent.includes('🌍'))),
  };
});
check(hero.hasTab && hero.isDefault, 'вкладка «Герой» існує і є дефолтною', JSON.stringify({ hasTab: hero.hasTab, isDefault: hero.isDefault }));
check(/5\/36/.test(hero.text), '⭐ зірки кампанії 5/36 у профілі', hero.text);
check(/12\/12/.test(hero.text), '🌍 країни світу 12/12 у профілі');
check(/123/.test(hero.text), '🧟 усього переможено 123 у профілі');
check(hero.worldMedalRevealed, 'медаль 🌍 «Рятівник світу» здобута (яскрава картка)');

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 3).join(' | '));
console.log(fail === 0 ? '\n🎉 СВІТ ВРЯТОВАНО OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
