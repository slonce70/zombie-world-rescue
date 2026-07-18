import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { ensureWebServer } from './_server.mjs';

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
    game.frontui.render();
    game.openFront();
    return id;
  });
  const card = await page.locator('.front-operation').first().textContent();
  if (!card.includes('🧱 2/3') || !card.includes('👥 70%')) throw new Error(`Country state missing from Front card: ${card}`);
  if (shots) await page.screenshot({ path: `${shots}/living-front-board.png` });

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
    return {
      damage: level.frontCountryState.damage,
      rubble: level.frontDamage?.children.length || 0,
      eventId,
      populationGain: game.save.front.world.countries[level.countryId].population - before,
    };
  });
  if (shots) await page.screenshot({ path: `${shots}/living-front-level.png` });
  if (levelState.damage !== 2 || levelState.rubble !== 12 || levelState.eventId !== 'survivor' || levelState.populationGain !== 5) {
    throw new Error(`Living country runtime failed: ${JSON.stringify(levelState)}`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('✅ Living Front country damage, rubble and survivor recovery work in browser');
} finally {
  await browser.close();
  close();
}
