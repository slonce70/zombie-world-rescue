import { mkdirSync } from 'node:fs';
import { openBrowserTest } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
mkdirSync('test-results', { recursive: true });

try {
  await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  const globe = await page.evaluate(() => {
    const game = window.__game;
    game.save.moonRegions = { MARE: true, TYCHO: true, COPERNICUS: true, POLARIS: true };
    game.globe.setMode('mars');
    return {
      mode: game.globe.mode,
      regions: game.globe.features.map((feature) => feature.id),
      ship: game.globe.spaceShip.visible,
      atmosphere: game.globe.atmo.visible,
      title: document.querySelector('.globe-top h1').textContent,
      next: document.getElementById('btn-moon-globe').textContent,
    };
  });
  if (globe.mode !== 'mars' || globe.regions.length !== 4 || !globe.ship || globe.atmosphere
    || !globe.title.includes('МАРС') || globe.next.includes('Європа')) {
    throw new Error(`Mars globe failed: ${JSON.stringify(globe)}`);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/space-campaign-mars-globe.png' });

  await page.evaluate(() => window.__game.startLevel('MOON', { spaceWorld: 'MARS', moonRegion: 'ARSIA' }));
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game?.level?.spaceWorld?.id === 'MARS', null, { timeout: 30000 });
  const level = await page.evaluate(() => {
    const game = window.__game;
    return {
      world: game.level.spaceWorld.id,
      region: game.level.moonRegion.id,
      name: game.level.country.name,
      banner: game.level.country.banner,
      boss: game.level.country.boss.name,
      ground: game.level.world.biome.grass1,
      missions: (game.level.missions.delegate?.missions || game.level.missions.missions || []).map((mission) => mission.type),
      zombies: game.level.zombies.list.length,
    };
  });
  if (level.world !== 'MARS' || level.region !== 'ARSIA' || !level.name.includes('Арсія')
    || !level.banner.includes('Марсіанський') || level.banner.includes('місячн') || !level.boss.includes('АРЕСА')
    || level.ground !== 0xa7472e || level.missions.length !== 4 || level.zombies < 1) {
    throw new Error(`Mars landing failed: ${JSON.stringify(level)}`);
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/space-campaign-mars-level.png' });
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log('✅ Mars globe, ship, distinct biome and planetary mission landing work');
} finally {
  await closeTest();
}
