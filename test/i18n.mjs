import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let failed = 0;
const check = (ok, msg, x = '') => { console.log(ok ? '  ✅' : '  ❌', msg, x); if (!ok) failed++; };

// 1. украинский (явно: headless-браузер має navigator.language=en — автодетект дасть en)
await page.goto('http://localhost:8741/?test&fresh');
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await page.evaluate(() => localStorage.setItem('zr-lang', 'uk'));
await page.reload();
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
let txt = await page.evaluate(() => ({
  play: document.getElementById('btn-solo').textContent.trim(),
  lang: document.getElementById('btn-lang').textContent.trim(),
}));
check(txt.play === '🎮 ГРАТИ', 'uk: кнопка ГРАТИ', txt.play); // канарковий точний рядок (uk-baseline)
check(txt.lang.includes('Українська'), 'uk: кнопка мови', txt.lang);
const uk = { play: txt.play, lang: txt.lang };

// 2. английский
await page.evaluate(() => localStorage.setItem('zr-lang', 'en'));
await page.reload();
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
txt = await page.evaluate(() => ({
  play: document.getElementById('btn-solo').textContent.trim(),
  coop: document.getElementById('btn-coop').textContent.trim(),
  ward: document.getElementById('btn-wardrobe').textContent.trim(),
  htmlLang: document.documentElement.lang,
  shopName: window.__game.shop ? 'ok' : 'no',
}));
check(txt.play.toUpperCase().includes('PLAY'), 'en: PLAY', txt.play);
check(txt.play !== uk.play, 'en: play відрізняється від uk', txt.play);
check(txt.coop.toUpperCase().includes('PLAY') && txt.coop.toUpperCase().includes('TOGETHER'), 'en: PLAY TOGETHER', txt.coop);
check(txt.ward.toLowerCase().includes('wardrobe'), 'en: Wardrobe', txt.ward);
check(txt.htmlLang === 'en', 'en: html lang', txt.htmlLang);
// игровой уровень на английском: названия миссий
await page.evaluate(() => window.__game.startLevel('UKR'));
await page.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
const mEn = await page.evaluate(() => window.__game.level.missions.getHudList().map((m) => m.title));
check(mEn.some((s) => /Rescue|Repair|Clear/.test(s)), 'en: місії перекладено', mEn.join(' | ').slice(0, 90));
await page.screenshot({ path: 'shots/i18n-en-level.png' });

// 3. русский
await page.evaluate(() => localStorage.setItem('zr-lang', 'ru'));
await page.goto('http://localhost:8741/?test&fresh');
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
txt = await page.evaluate(() => ({
  play: document.getElementById('btn-solo').textContent.trim(),
  prog: document.getElementById('btn-progress').textContent.trim(),
}));
check(txt.play.includes('ИГРАТЬ'), 'ru: ИГРАТЬ', txt.play);
check(txt.play !== uk.play, 'ru: play відрізняється від uk', txt.play);
check(txt.prog.toLowerCase().includes('прогресс') || txt.prog.toLowerCase().includes('прогрес'), 'ru: Прогресс', txt.prog);
await page.evaluate(() => window.__game.startLevel('UKR'));
await page.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 });
const mRu = await page.evaluate(() => window.__game.level.missions.getHudList().map((m) => m.title));
check(mRu.some((s) => /Спаси|Почини|Зачисти/.test(s)), 'ru: миссии переведены', mRu.join(' | ').slice(0, 90));
await page.screenshot({ path: 'shots/i18n-ru-level.png' });

check(errs.length === 0, 'без JS-ошибок', errs.slice(0, 2).join('|'));
console.log(failed === 0 ? '🎉 ЛОКАЛІЗАЦІЯ ПРАЦЮЄ' : `❌ ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
