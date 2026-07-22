import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, closeTest } = await openBrowserTest({ launch: { headless: true }, context: { viewport: { width: 1280, height: 720 } }, captureErrors: false });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(`${BASE}/?test&fresh&seed=400`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.state === 'globe');
  await page.click('#btn-solo');
  await page.locator('.solo-category[data-category="operations"] > summary').click();
  await page.click('.solo-category[data-category="operations"] .solo-mode[data-mode="expedition"]');
  await page.waitForSelector('#overlay-expedition.show');
  const opened = await page.evaluate(() => ({ run: window.__game.save.expedition, text: document.querySelector('#expedition-route').textContent }));
  check(opened.run?.status === 'active' && opened.run?.step === 0, 'нова експедиція відкриває перший етап');
  check(opened.text.includes('Порятунок'), 'маршрут показує тип етапу');
  check(await page.locator('#expedition-specialists [data-specialist]').count() === 3, 'доступні три спеціалісти');
  const specialistHitArea = await page.locator('[data-specialist="scout"]').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height, pressed: el.getAttribute('aria-pressed') };
  });
  check(specialistHitArea.width >= 44 && specialistHitArea.height >= 44, 'картка спеціаліста має доступну touch-зону', JSON.stringify(specialistHitArea));
  await page.click('[data-specialist="scout"]');
  const selected = await page.evaluate(() => ({ run: window.__game.save.expedition.specialist, last: window.__game.save.coopRole }));
  check(selected.run === 'scout' && selected.last === 'scout', 'вибір спеціаліста зберігається', JSON.stringify(selected));

  await page.click('#btn-expedition-go');
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level?.expedition);
  const first = await page.evaluate(() => ({
    step: window.__game.level.expedition.step,
    build: window.__game.level.runBuild.ids,
    specialist: window.__game.level.specialist,
    weapons: window.__game.level.player.weapons,
  }));
  check(first.step === 0 && Array.isArray(first.build), 'етап стартує з серіалізованою збіркою');
  check(first.specialist.id === 'scout' && first.weapons.includes('smg'), 'на рівні застосовано набір Розвідника', JSON.stringify(first));
  const pickup = await page.evaluate(() => {
    window.__game._trySuperPickup(window.__game.level);
    return window.__game.level.superPickup;
  });
  check(pickup == null, 'звичайний Super-пікап не з’являється в Експедиції');
  const superState = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 20; i++) g.level.bus.emit('hitmarker', false, 'smg');
    g.hud.update(0);
    const charged = g.level.specialist.charge;
    const label = document.getElementById('tb-gadget').getAttribute('aria-label');
    const used = g.level.gadgets.use();
    return { charged, label, used, after: g.level.specialist.charge, protect: g.level.player.respawnProtect };
  });
  check(superState.charged === 100 && /100%/.test(superState.label), 'Super заряджається влучаннями й показується в HUD', JSON.stringify(superState));
  check(superState.used && superState.after === 0 && superState.protect >= 1, 'Super Розвідника витрачає заряд і дає ривок', JSON.stringify(superState));
  const otherSupers = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player;
    g.level.specialist = { id: 'medic', rank: 1, charge: 100, maxCharge: 100, active: true };
    p.healMult = 1.25;
    p.health = p.maxHealth - 80;
    const before = p.health;
    const medicUsed = g.level.gadgets.use();
    const healed = p.health - before;
    g.level.specialist.charge = 100;
    p.health = p.maxHealth;
    const fullUsed = g.level.gadgets.use();
    const fullCharge = g.level.specialist.charge;
    g.level.specialist = { id: 'guard', rank: 3, charge: 100, maxCharge: 100, active: true };
    const guardUsed = g.level.gadgets.use();
    const shield = p.gadgetShield;
    g.level.specialist = { id: 'guard', rank: 1, charge: 100, maxCharge: 100, active: false };
    const radiationUsed = g.level.gadgets.use();
    return { medicUsed, healed, fullUsed, fullCharge, guardUsed, shield, radiationUsed, radiationCharge: g.level.specialist.charge };
  });
  check(otherSupers.medicUsed && otherSupers.healed === 62.5, 'Super Медика враховує множник лікування', JSON.stringify(otherSupers));
  check(!otherSupers.fullUsed && otherSupers.fullCharge === 100, 'невдалий Super не витрачає заряд', JSON.stringify(otherSupers));
  check(otherSupers.guardUsed && otherSupers.shield === 100, 'ранг 3 Захисника дає щит 100', JSON.stringify(otherSupers));
  check(!otherSupers.radiationUsed && otherSupers.radiationCharge === 100, 'radiation-контракт вимикає Super', JSON.stringify(otherSupers));
  await page.evaluate(() => { window.__game.level.specialist = { id: 'scout', rank: 1, charge: 0, maxCharge: 100, active: true }; });

  await page.evaluate(() => window.__game._showVictory());
  await page.waitForSelector('#overlay-victory.show');
  await page.click('#btn-victory-next');
  await page.waitForSelector('#overlay-expedition.show');
  check(await page.locator('#expedition-specialists [data-specialist]:disabled').count() === 3, 'після першої перемоги спеціаліст зафіксований');
  const choiceCount = await page.locator('#expedition-route button.expedition-node').count();
  check(choiceCount === 2, 'після перемоги доступні два маршрути');
  await page.locator('#expedition-route button.expedition-node').first().click();
  const chosen = await page.evaluate(() => window.__game.save.expedition);
  check(chosen.status === 'active' && chosen.step === 1 && chosen.build.length === 1, 'вибір маршруту зберігає картку й наступний етап');
  const mastery = await page.evaluate(() => {
    const g = window.__game;
    g.save.expedition = { ...g.save.expedition, status: 'won', step: 4, wins: 5, current: null, choices: [], reward: { coins: 550, crystals: 10, claimed: true } };
    g.renderExpedition();
    const once = g.save.specialistXp.scout;
    g.renderExpedition();
    return { once, twice: g.save.specialistXp.scout, claims: g.save.specialistClaims.length, text: document.getElementById('expedition-mastery').textContent };
  });
  check(mastery.once === 100 && mastery.twice === 100 && mastery.claims === 1, 'майстерність terminal result нараховується один раз', JSON.stringify(mastery));
  check(errors.length === 0, 'у браузері немає JS-помилок', errors.join(' | '));
} finally {
  await closeTest();
}

if (fail) process.exit(1);
console.log('\n🎉 ЕКСПЕДИЦІЯ У БРАУЗЕРІ ПРАЦЮЄ');
