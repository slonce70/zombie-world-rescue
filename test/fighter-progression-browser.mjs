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
    status: document.getElementById('fighter-status').textContent,
  }));
  check(initial.title.includes('Захисник') && initial.role.includes('Танк')
    && initial.level.includes('1') && initial.stats.includes('0%')
    && initial.upgrade.includes('1000') && initial.status.includes('C'),
  'картка відкриває профіль рівня 1 і підказує Super на C', JSON.stringify(initial));

  await page.click('#btn-fighter-upgrade');
  const denied = await page.evaluate(() => ({
    level: window.__game.save.fighterLevels.guard,
    coins: window.__game.save.coins,
  }));
  check(denied.level === 1 && denied.coins === 50,
    'недостатньо монет не змінює рівень або баланс', JSON.stringify(denied));

  await page.evaluate(() => { window.__game.save.coins = 1000; });
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
    stats: document.getElementById('fighter-stats').textContent,
    abilities: document.getElementById('fighter-abilities').textContent,
    placeholders: [...document.querySelectorAll('#fighter-abilities [data-pending]')].length,
    gadgets: [...document.querySelectorAll('[data-bastion-gadget]')].map((el) => ({
      id: el.dataset.bastionGadget, pressed: el.getAttribute('aria-pressed'), disabled: el.disabled,
    })),
    hyper: document.querySelector('[data-bastion-hyper]') && {
      disabled: document.querySelector('[data-bastion-hyper]').disabled,
      text: document.querySelector('[data-bastion-hyper]').textContent,
    },
    selectDisabled: document.getElementById('btn-fighter-select').disabled,
    upgradeDisabled: document.getElementById('btn-fighter-upgrade').disabled,
  }));
  check(bastion.title.includes('Бастіон') && bastion.role.includes('Танк')
    && bastion.stats.includes('50') && bastion.abilities.includes('Кулаки')
    && bastion.abilities.includes('Суперкулак') && bastion.placeholders === 0
    && bastion.abilities.includes('5') && bastion.gadgets.length === 2
    && bastion.gadgets.every(({ disabled }) => disabled) && bastion.hyper?.disabled
    && !bastion.selectDisabled && !bastion.upgradeDisabled,
  'Бастіон показує точні характеристики й готовий бойовий набір', JSON.stringify(bastion));

  await page.evaluate(() => {
    window.__game.save.fighterLevels.bastion = 3;
    window.__game.save.coins = 999;
    window.__game.renderExpeditionFighter();
  });
  await page.click('[data-bastion-gadget="healing-punch"]');
  const deniedGadget = await page.evaluate(() => ({
    coins: window.__game.save.coins,
    owned: window.__game.save.bastionGadgetsOwned,
  }));
  check(deniedGadget.coins === 999 && deniedGadget.owned.length === 0,
    'гаджет не купується без 1000 монет', JSON.stringify(deniedGadget));

  await page.evaluate(() => { window.__game.save.coins = 1000; });
  await page.click('[data-bastion-gadget="healing-punch"]');
  const boughtHealing = await page.evaluate(() => ({
    coins: window.__game.save.coins,
    owned: window.__game.save.bastionGadgetsOwned,
  }));
  check(boughtHealing.coins === 0 && boughtHealing.owned.includes('healing-punch'),
    'Лікувальні кулаки купуються за 1000 монет', JSON.stringify(boughtHealing));

  await page.evaluate(() => { window.__game.save.coins = 1000; });
  await page.click('[data-bastion-gadget="provoke"]');
  const gadget = await page.evaluate(() => ({
    coins: window.__game.save.coins,
    owned: window.__game.save.bastionGadgetsOwned,
    saved: window.__game.save.bastionGadget,
    pressed: document.querySelector('[data-bastion-gadget="provoke"]').getAttribute('aria-pressed'),
  }));
  check(gadget.coins === 0 && gadget.owned.includes('provoke')
    && gadget.saved === 'provoke' && gadget.pressed === 'true',
  'Провокація купується за 1000 монет і вибирається', JSON.stringify(gadget));

  await page.evaluate(() => {
    window.__game.save.fighterLevels.bastion = 5;
    window.__game.save.coins = 5000;
    window.__game.renderExpeditionFighter();
  });
  await page.click('[data-bastion-hyper]');
  const boughtHyper = await page.evaluate(() => ({
    coins: window.__game.save.coins,
    owned: window.__game.save.bastionHyperOwned,
  }));
  check(boughtHyper.coins === 0 && boughtHyper.owned,
    'Hypercharge купується на рівні 5 за 5000 монет', JSON.stringify(boughtHyper));

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

  console.log('▸ 🌀 Імпульс грабельний');
const impulse = await page.evaluate(async () => {
  const g = window.__game;
  g.openExpedition();
  const card = document.querySelector('[data-specialist="impulse"]');
  const state = { exists: !!card, disabled: !!card?.disabled, text: card?.textContent.replace(/\s+/g, ' ').trim() };
  card?.click();
  document.getElementById('btn-fighter-select')?.click();
  document.getElementById('btn-expedition-go')?.click();
  for (let i = 0; i < 80 && g.state !== 'level'; i++) await new Promise((r) => setTimeout(r, 250));
  const level = g.level;
  if (!level?.specialist) return { ...state, started: false };
  const p = level.player;
  const alive = level.zombies.list.filter((z) => z.state !== 'dead').slice(0, 3);
  for (const z of alive) { z.x = p.pos.x + 2; z.z = p.pos.z; z.y = p.pos.y; z.hp = 5000; z.slowT = 0; z.slowMul = 1; }
  level.specialist.charge = 100;
  const used = level.gadgets.useSpecialistSuper();
  return {
    ...state, started: true, id: level.specialist.id, weapons: [...p.weapons], used,
    slowed: alive.filter((z) => z.slowT > 0 && z.slowMul < 1).length,
    damaged: alive.filter((z) => z.hp < 5000).length,
  };
});
check(impulse.exists && !impulse.disabled && !/Очікує/.test(impulse.text || ''),
  'картка Імпульса доступна для вибору', JSON.stringify(impulse));
check(impulse.started && impulse.id === 'impulse' && impulse.weapons.includes('staff')
  && impulse.used && impulse.slowed === 3 && impulse.damaged === 3,
'🌀 Імпульсна хвиля сповільнює і бʼє всіх поруч', JSON.stringify(impulse));

check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));
} finally {
  await closeTest();
}

if (fail) process.exit(1);
console.log('\n🎉 ПРОФІЛІ ТА ПРОКАЧКА БІЙЦІВ ПРАЦЮЮТЬ');
