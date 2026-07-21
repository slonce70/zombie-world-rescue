import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { ensureWebServer } from './_server.mjs';

const EN = readFileSync(new URL('../src/i18n/en.js', import.meta.url), 'utf8');
const RU = readFileSync(new URL('../src/i18n/ru.js', import.meta.url), 'utf8');

const { base, close } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const shots = process.env.FRONT_SCREENSHOTS || '';
if (shots) mkdirSync(shots, { recursive: true });

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe');
  const countryId = await page.evaluate(() => {
    const game = window.__game;
    game.save.liberated = { UKR: true };
    game.save.front = null;
    game._ensureFront();
    const id = game.save.front.board[0].country;
    game.save.front.world.countries[id] = { damage: 2, population: 70 };
    game.save.front.restored[id] = 3;
    game.frontui.render();
    game.openFront();
    return id;
  });
  const recommended = page.locator('.front-operation.recommended');
  if (await recommended.count() !== 1) throw new Error('Front must expose exactly one recommended country card');
  const primary = await recommended.locator('.front-operation-choice').textContent();
  const details = await recommended.locator('details.front-details').textContent();
  for (const meaning of ['ЩО СТАЛОСЯ', 'НАСТУПНА ОПЕРАЦІЯ', 'Поразка не забере вже відновлений район.']) {
    if (!primary.includes(meaning)) throw new Error(`Country decision is missing "${meaning}": ${primary}`);
  }
  if (primary.includes('🧱 2/3') || primary.includes('👥 70%')) throw new Error(`Raw counters leaked into the primary decision: ${primary}`);
  if (!details.includes('🧱 2/3') || !details.includes('👥 70%')) throw new Error(`Country details are missing raw state: ${details}`);
  if (await recommended.locator('.front-op-stages [data-stage-id]').count() !== 3) throw new Error('Recommended operation must name all three phases');
  if (await page.locator('#btn-front-together').count() !== 1 || await page.locator('#btn-front-solo').count() !== 1) {
    throw new Error('Front must expose together and solo actions');
  }
  const translations = {
    'ЩО СТАЛОСЯ': ['WHAT HAPPENED', 'ЧТО ПРОИЗОШЛО'],
    'НАСТУПНА ОПЕРАЦІЯ': ['NEXT OPERATION', 'СЛЕДУЮЩАЯ ОПЕРАЦИЯ'],
    'Поразка не забере вже відновлений район.': [
      'Defeat will not take away a district that has already been restored.',
      'Поражение не отнимет уже восстановленный район.',
    ],
  };
  for (const [key, [en, ru]] of Object.entries(translations)) {
    if (!EN.includes(`${JSON.stringify(key)}: ${JSON.stringify(en)}`)
        || !RU.includes(`${JSON.stringify(key)}: ${JSON.stringify(ru)}`)) {
      throw new Error(`Missing exact EN/RU mapping for ${key}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileCard = await recommended.boundingBox();
  if (!mobileCard || mobileCard.width > 390 || !await page.locator('#btn-front-together').isVisible() || !await page.locator('#btn-front-solo').isVisible()) {
    throw new Error(`Country decision does not fit mobile: ${JSON.stringify(mobileCard)}`);
  }
  if (shots) await page.screenshot({ path: `${shots}/living-front-board-mobile.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
  if (shots) await page.screenshot({ path: `${shots}/living-front-board.png` });

  await page.click('#btn-front-together');
  const together = await page.evaluate(() => ({
    active: window.__game.save.front.active?.status,
    coopOpen: document.getElementById('overlay-coop').classList.contains('show'),
    state: window.__game.state,
  }));
  if (together.active !== 'ready' || !together.coopOpen || together.state !== 'globe') {
    throw new Error(`Together action must prepare without starting solo: ${JSON.stringify(together)}`);
  }
  await page.evaluate(() => window.__game._hideOverlay('overlay-coop'));

  await page.evaluate(async (id) => {
    const game = window.__game;
    game.frontui.close();
    game._forceMissionSet = ['rescue', 'repair', 'clear', 'collect'];
    await game.startLevel(id);
  }, countryId);
  await page.waitForFunction(() => window.__game?.state === 'level');
  const levelState = await page.evaluate(() => {
    const game = window.__game;
    const level = game.level;
    const before = game.save.front.world.countries[level.countryId].population;
    level.missions._maybeStartLivingWorld(level.missions.missions[0]);
    const eventId = level.missions.livingWorld && level.missions.livingWorld.id;
    level.player.pos.x = level.missions.livingWorld.x;
    level.player.pos.z = level.missions.livingWorld.z;
    level.missions._updateLivingWorld(0, { pressed: () => true, justPressed: new Set(['KeyE']) }, true);
    const guard = level.frontLivingCity.citizens.find((citizen) => citizen.job === 'guard');
    const defenderTarget = level.zombies.spawn('walker', guard.rig.group.position.x + 2, guard.rig.group.position.z);
    const beforeGuardHit = defenderTarget.hp;
    guard.hitT = 0;
    game._updateLivingCity(level, 0.1);
    return {
      damage: level.frontCountryState.damage,
      rubble: level.frontDamage?.children.length || 0,
      eventId,
      populationGain: game.save.front.world.countries[level.countryId].population - before,
      cityJobs: [...new Set(level.frontLivingCity.citizens.map((citizen) => citizen.job))].sort(),
      guardDamage: beforeGuardHit - defenderTarget.hp,
    };
  });
  if (shots) await page.screenshot({ path: `${shots}/living-front-level.png` });
  if (levelState.damage !== 2 || levelState.rubble !== 12 || levelState.eventId !== 'survivor' || levelState.populationGain !== 5
    || levelState.cityJobs.join(',') !== 'builder,guard,resident' || levelState.guardDamage !== 12) {
    throw new Error(`Living country runtime failed: ${JSON.stringify(levelState)}`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('✅ Living Front country damage, rubble and survivor recovery work in browser');
} finally {
  await browser.close();
  close();
}
