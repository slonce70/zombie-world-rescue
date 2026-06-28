import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// засіюємо сейв, щоб трофеї/герой були з даних
await page.evaluate(async () => {
  const g = window.__game;
  const { MEGA_QUEST_MIN_LEVEL, xpForLevel } = await import('/src/progress.js');
  let megaXp = 0;
  for (let n = 1; n < MEGA_QUEST_MIN_LEVEL; n++) megaXp += xpForLevel(n);
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true };
  g.save.worldBosses = { radiation: true, ice: true };
  g.save.records = { UKR: 123456 };
  g.save.missionRuns = { UKR: 2, POL: 1 };
  g.save.bestiary = { walker: 4, boss: 1, ghost: 1 };
  g.save.stats.killed = 99;
  g.save.stats.bosses = 7;
  g.save.stats.megaboxes = 3;
  g.save.stats.bestCombo = 12;
  g.save.xp = megaXp;
  g.save.skins = ['classic', 'custom', 'gold', 'wizard', 'military'];
  g.save.activeSkin = 'custom';
  g.save.hero = { shirt: 0xe14b4b, pants: 0x2d3436, skin: 0xffc9a3 };
  g.save.megaQuests = {
    damage10000: { progress: 10000, done: true },
    kills500: { progress: 250, done: false },
    headshots150: { progress: 15, done: false },
  };
  g.quests.ensureMegaQuests();
  g.saveGame();
});

await page.click('#btn-menu');
check(await page.textContent('#btn-hq').then((s) => /База|Base|База/.test(s || '')), 'кнопка меню називає це базою');
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 10000 });

console.log('▸ Вхід у Базу');
check(!!await page.$('#btn-hqbase'), 'кнопка входу в Базу існує');
check(await page.textContent('#btn-hqbase').then((s) => /Баз|Base/.test(s || '')), 'кнопка має зрозумілий текст бази');

await page.click('#btn-hqbase');
await page.waitForFunction(() => window.__game && window.__game.state === 'hqbase', null, { timeout: 10000 });
check(await page.evaluate(() => window.__game.state) === 'hqbase', 'клік входить у state=hqbase');
check(!!await page.$('#hqbase-ui'), 'UI Живого Штабу показано');
check(await page.textContent('#hqbase-ui').then((s) => /Країни.*5|Countries.*5|Страны.*5/.test(s || '')), 'UI бази показує кількість врятованих країн');
check(await page.textContent('#hqbase-ui').then((s) => /Бестіарій.*3|Bestiary.*3|Бестиарий.*3/.test(s || '')), 'UI бази показує відкритий бестіарій');
check(!!await page.$('#btn-hqbase-wardrobe'), 'у базі є швидка кнопка Гардероба');
check(!!await page.$('#btn-hqbase-panel'), 'у базі є швидка кнопка панелі бази');
check(!!await page.$('#btn-hqbase-quests'), 'у базі є швидка кнопка Квестів');
check(await page.textContent('#hqbase-ui').then((s) => /Скіни.*5|Skins.*5|Скины.*5/.test(s || '')), 'UI бази показує кількість скінів');
check(await page.textContent('#hqbase-ui').then((s) => /Зал.*4|Hall.*4|Зал.*4/.test(s || '')), 'UI бази показує зал слави');
check(await page.textContent('#hqbase-mega-list').then((s) => /МЕГА|MEGA/.test(s || '')), 'UI бази показує мега-квести');

console.log('▸ 3D-сцена і трофеї з сейва');
const st = await page.evaluate(() => window.__game.hqbase.debugState());
check(st.children >= 12, `Живий Штаб має 3D-обʼєкти (${st.children})`);
check(st.countryTrophies >= 3, `показано трофеї звільнених країн (${st.countryTrophies})`);
check(st.beastTrophies >= 3, `показано відкритий бестіарій (${st.beastTrophies})`);
check(st.worldBossTrophies >= 2, `показано трофеї світових босів (${st.worldBossTrophies})`);
check(st.megaQuestRows >= 6, `показано дошку мега-квестів (${st.megaQuestRows})`);
check(st.skinDisplays >= 5, `показано колекцію скінів (${st.skinDisplays})`);
check(st.hallPlaques >= 4, `показано зал слави (${st.hallPlaques})`);
check(st.hallTrophies >= 4, `зал слави має trophy-моделі, не box-заглушки (${st.hallTrophies})`);
check(st.hasHero === true, 'манекен героя створено з поточного скіна');
const canvasOk = await page.evaluate(() => { const c = document.getElementById('game-canvas'); return !!c && c.width > 0 && c.height > 0; });
check(canvasOk, 'canvas живий після входу');

console.log('▸ Тренувальна арена і манекени шкоди');
const beforeTarget = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
await page.evaluate(() => window.__game.hqbase.hitFirstTarget());
const afterTarget = await page.evaluate(() => window.__game.hqbase.debugState().hitCount);
check(afterTarget === beforeTarget + 1, `мішень реагує (${beforeTarget} → ${afterTarget})`);

const beforeDummy = await page.evaluate(() => window.__game.hqbase.debugState());
await page.evaluate(() => window.__game.hqbase.hitFirstDummy());
const afterDummy = await page.evaluate(() => window.__game.hqbase.debugState());
check(beforeDummy.dummyCount >= 3, `манекени створено (${beforeDummy.dummyCount})`);
check(await page.evaluate(() => window.__game.hqbase.dummies.every((dummy) => {
  const head = dummy.children.find((child) => child.userData?.isHqDummyHead);
  return head && head.position.x === 0 && head.position.y === 0.95 && head.position.z === 0;
})), 'голови манекенів стоять локально на тілах');
check(afterDummy.damageTotal === beforeDummy.damageTotal + 25, `манекен рахує шкоду (${beforeDummy.damageTotal} → ${afterDummy.damageTotal})`);
check(await page.textContent('#hqbase-ui').then((s) => /Шкода.*25|Damage.*25|Урон.*25/.test(s || '')), 'UI бази показує шкоду по манекенах');

console.log('▸ Вихід (кнопка + Escape) і чистка');
await page.click('#btn-hqbase-exit');
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 10000 });
check(await page.evaluate(() => window.__game.state) === 'globe', 'вихід кнопкою повертає на глобус');
check(await page.evaluate(() => window.__game.hqbase.debugState().children) === 0, 'сцену очищено при виході');

// повторний вхід + Escape
await page.click('#btn-menu');
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 10000 });
await page.click('#btn-hqbase');
await page.waitForFunction(() => window.__game.state === 'hqbase', null, { timeout: 10000 });
// мішень знову клікабельна після повторного входу
const re = await page.evaluate(() => { window.__game.hqbase.hitFirstTarget(); return window.__game.hqbase.debugState().hitCount; });
check(re === 1, 'після повторного входу мішень знову реагує');
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__game.state === 'globe', null, { timeout: 10000 });
check(await page.evaluate(() => window.__game.hqbase.debugState().ready) === false, 'Escape виходить і чистить active-state');

await page.click('#btn-menu');
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 10000 });
await page.click('#btn-hqbase');
await page.waitForFunction(() => window.__game.state === 'hqbase', null, { timeout: 10000 });
await page.click('#btn-hqbase-quests');
await page.waitForSelector('#overlay-quests.show', { timeout: 10000 });
check(await page.textContent('#quest-list').then((s) => /Мега-квести|Mega quests|Мега-квесты/.test(s || '')), 'кнопка Квести відкриває мега-квести');
await page.click('[data-close="overlay-quests"]');
await page.waitForFunction(() => !document.getElementById('overlay-quests').classList.contains('show'), null, { timeout: 10000 });

console.log('');
const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.slice(0, 8).join('\n'));

console.log(failed === 0 ? '🎉 ЖИВИЙ ШТАБ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
