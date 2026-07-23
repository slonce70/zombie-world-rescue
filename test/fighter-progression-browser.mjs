import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, closeTest } = await openBrowserTest({
  launch: { headless: true },
  context: { viewport: { width: 1280, height: 800 } },
  captureErrors: false,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  await page.goto(`${BASE}/?test&fresh&seed=609`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.state === 'globe');
  await page.evaluate(() => window.__game.openExpedition());
  await page.waitForSelector('#overlay-expedition.show');

  check(await page.locator('#expedition-specialists [data-specialist]').count() === 5,
    'Експедиція показує п’ятьох бійців');

  await page.click('[data-specialist="guard"]');
  await page.waitForSelector('#overlay-fighter.show');
  const initial = await page.evaluate(() => ({
    title: document.getElementById('fighter-title').textContent,
    role: document.getElementById('fighter-role').textContent,
    level: document.getElementById('fighter-level').textContent,
    stats: document.getElementById('fighter-stats').textContent,
    upgrade: document.getElementById('btn-fighter-upgrade').textContent,
  }));
  check(initial.title.includes('Захисник') && initial.role.includes('Танк')
    && initial.level.includes('1') && initial.stats.includes('0%')
    && initial.upgrade.includes('250'), 'картка відкриває профіль рівня 1', JSON.stringify(initial));

  await page.click('#btn-fighter-upgrade');
  const denied = await page.evaluate(() => ({
    level: window.__game.save.fighterLevels.guard,
    coins: window.__game.save.coins,
  }));
  check(denied.level === 1 && denied.coins === 50,
    'недостатньо монет не змінює рівень або баланс', JSON.stringify(denied));

  await page.evaluate(() => { window.__game.save.coins = 250; });
  await page.click('#btn-fighter-upgrade');
  const bought = await page.evaluate(() => ({
    level: window.__game.save.fighterLevels.guard,
    coins: window.__game.save.coins,
    crystals: window.__game.save.crystals,
    text: document.getElementById('fighter-level').textContent,
  }));
  check(bought.level === 2 && bought.coins === 0 && bought.crystals === 0
    && bought.text.includes('2'), 'купівля рівня списує точну ціну один раз', JSON.stringify(bought));

  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.activeElement?.dataset.specialist) === 'guard',
    'Escape повертає фокус на картку бійця');

  await page.click('[data-specialist="bastion"]');
  await page.waitForSelector('#overlay-fighter.show');
  const bastion = await page.evaluate(() => ({
    title: document.getElementById('fighter-title').textContent,
    role: document.getElementById('fighter-role').textContent,
    placeholders: [...document.querySelectorAll('#fighter-abilities [data-pending]')].length,
    selectDisabled: document.getElementById('btn-fighter-select').disabled,
    upgradeDisabled: document.getElementById('btn-fighter-upgrade').disabled,
  }));
  check(bastion.title.includes('Бастіон') && bastion.role.includes('Танк')
    && bastion.placeholders === 4 && bastion.selectDisabled && bastion.upgradeDisabled,
  'Бастіон видимий без вигаданої бойової механіки або витрати валюти', JSON.stringify(bastion));

  await page.setViewportSize({ width: 375, height: 844 });
  const mobile = await page.evaluate(() => {
    const card = document.querySelector('#overlay-fighter .fighter-card').getBoundingClientRect();
    const buttons = ['btn-fighter-select', 'btn-fighter-upgrade'].map((id) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    return { card: { top: card.top, bottom: card.bottom, height: card.height }, buttons };
  });
  check(mobile.card.top >= 0 && mobile.card.bottom <= 844
    && mobile.buttons.every(({ width, height }) => width >= 44 && height >= 44),
  'на 375×844 профіль прокручується у viewport, а кнопки мають touch-зони 44×44', JSON.stringify(mobile));

  check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));
} finally {
  await closeTest();
}

if (fail) process.exit(1);
console.log('\n🎉 ПРОФІЛІ ТА ПРОКАЧКА БІЙЦІВ ПРАЦЮЮТЬ');
