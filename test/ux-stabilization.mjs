import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } } });
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&lang=uk`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.state === 'globe');

const globe = await page.evaluate(() => ({
  actions: [...document.querySelectorAll('.globe-play-row > button')].map((button) => button.id),
  other: !!document.getElementById('globe-other'),
  expedition: !!document.getElementById('btn-expedition'),
  language: !!document.getElementById('btn-lang-globe'),
}));
check(JSON.stringify(globe.actions) === JSON.stringify(['btn-front', 'btn-solo', 'btn-coop'])
  && !globe.other && !globe.expedition && !globe.language,
'глобус має рівно три дії без popover, дубля Expedition і мови', JSON.stringify(globe));

await page.click('#btn-solo');
await page.waitForSelector('#overlay-solo.show');
const catalog = await page.evaluate(() => ({
  role: document.getElementById('overlay-solo').getAttribute('role'),
  title: document.getElementById('solo-title').textContent.trim(),
  recommended: [...document.querySelectorAll('.solo-recommended .solo-mode')]
    .map((mode) => ({ id: mode.dataset.mode, locked: mode.classList.contains('locked') })),
  open: document.querySelectorAll('.solo-category[open]').length,
  groups: Object.fromEntries([...document.querySelectorAll('.solo-category')].map((group) => [
    group.dataset.category,
    [...group.querySelectorAll('.solo-mode')].map((mode) => mode.dataset.mode),
  ])),
  expeditionLocked: document.querySelector('.solo-category [data-mode="expedition"]').classList.contains('locked'),
}));
const expectedGroups = {
  quick: ['knockout', 'radiation', 'pvp', 'bank', 'maze', 'zone-defense', 'soul-collector', 'defense', 'portal', 'turretwar', 'humans'],
  long: ['campaign', 'expedition', 'community', 'storm', 'arena', 'worldboss', 'infected', 'chapter3'],
};
check(catalog.role === 'dialog' && catalog.title === '🎮 РЕЖИМИ', 'каталог є діалогом РЕЖИМИ', JSON.stringify(catalog));
check(catalog.recommended.length === 4
  && new Set(catalog.recommended.map((mode) => mode.id)).size === catalog.recommended.length
  && catalog.recommended.every((mode) => !mode.locked),
'слоти «СЬОГОДНІ» — 4 унікальні доступні режими', JSON.stringify(catalog.recommended));
check(catalog.open === 0 && JSON.stringify(catalog.groups) === JSON.stringify(expectedGroups) && !catalog.expeditionLocked,
'дві категорії згорнуті, містять усі 19 режимів, Expedition доступна', JSON.stringify(catalog.groups));

await page.locator('.solo-category[data-category="quick"] > summary').click();
await page.locator('.solo-category[data-category="long"] > summary').click();
check(await page.locator('.solo-category[open]').count() === 1
  && await page.locator('.solo-category[data-category="long"][open]').count() === 1,
'accordion тримає відкритою лише одну категорію');
await page.keyboard.press('Escape');
check(!await page.locator('#overlay-solo').evaluate((el) => el.classList.contains('show'))
  && await page.evaluate(() => document.activeElement?.id) === 'btn-solo',
'Escape закриває каталог і повертає фокус');

await page.click('#btn-menu');
const menuSettings = await page.evaluate(() => ({
  entry: !!document.querySelector('#overlay-menu #btn-settings'),
  leaked: [...document.querySelectorAll('#overlay-menu #btn-quality, #overlay-menu #btn-lang, #overlay-menu #btn-map-size')].length,
}));
check(menuSettings.entry && menuSettings.leaked === 0, 'hamburger-меню має один вхід у налаштування', JSON.stringify(menuSettings));
await page.click('#btn-settings');
check(await page.locator('#overlay-settings').getAttribute('role') === 'dialog'
  && await page.evaluate(() => document.activeElement?.id) === 'btn-settings-back',
'налаштування відкриваються окремим діалогом з керованим фокусом');

const presets = await page.evaluate(() => {
  const game = window.__game;
  game.save.kidMode = false;
  game.save.strongZombies = false;
  game.save.toughZombies = true;
  game._renderDifficultySettings();
  const legacy = document.getElementById('settings-difficulty-current').textContent;
  const result = {};
  for (const id of ['kid', 'normal', 'hard', 'extreme']) {
    document.querySelector(`[data-difficulty="${id}"]`).click();
    const stored = JSON.parse(localStorage.getItem('zr-save-v1'));
    result[id] = {
      live: [game.save.kidMode, game.save.strongZombies, game.save.toughZombies],
      stored: [stored.kidMode, stored.strongZombies, stored.toughZombies],
      pressed: document.querySelector(`[data-difficulty="${id}"]`).getAttribute('aria-pressed'),
    };
  }
  return { legacy, result };
});
const expectedPresets = {
  kid: [true, false, false], normal: [false, false, false], hard: [false, true, false], extreme: [false, true, true],
};
check(presets.legacy === 'Власна', 'legacy-комбінація показується як Власна', presets.legacy);
check(Object.entries(expectedPresets).every(([id, tuple]) =>
  JSON.stringify(presets.result[id].live) === JSON.stringify(tuple)
  && JSON.stringify(presets.result[id].stored) === JSON.stringify(tuple)
  && presets.result[id].pressed === 'true'),
'чотири пресети оновлюють і зберігають три старі поля', JSON.stringify(presets.result));

await page.keyboard.press('Escape');
check(await page.locator('#overlay-menu').evaluate((el) => el.classList.contains('show'))
  && await page.evaluate(() => document.activeElement?.id) === 'btn-settings',
'Escape повертає з налаштувань у меню на кнопку Налаштування');
await page.locator('#overlay-menu .panel-close').click();

await page.setViewportSize({ width: 375, height: 844 });
const mobile = await page.evaluate(() => {
  const rect = (id) => document.getElementById(id).getBoundingClientRect();
  const front = rect('btn-front');
  const modes = rect('btn-solo');
  const coop = rect('btn-coop');
  return { front, modes, coop, row: document.querySelector('.globe-play-row').getBoundingClientRect() };
});
check(mobile.front.height >= 44 && mobile.modes.height >= 44 && mobile.coop.height >= 44,
'мобільні touch-зони не менші 44 px', JSON.stringify(mobile));
check(mobile.front.width > mobile.row.width * .9
  && Math.abs(mobile.modes.width - mobile.coop.width) < 2
  && Math.abs(mobile.modes.top - mobile.coop.top) < 2,
'на 375 px головна дія займає рядок, дві другорядні ділять наступний', JSON.stringify(mobile));

const realErrors = errors.filter((error) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(error));
check(realErrors.length === 0, 'без JS-помилок', realErrors.slice(0, 3).join(' | '));
await closeTest();
console.log(failed === 0 ? '🎉 UX STABILIZATION OK' : `❌ UX STABILIZATION FAILURES: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
