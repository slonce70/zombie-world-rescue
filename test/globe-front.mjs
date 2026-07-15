import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base, close } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe');
  const result = await page.evaluate(() => {
    const game = window.__game;
    game.save.liberated = { UKR: true, POL: true, DEU: true };
    game.save.front = null;
    game._ensureFront();
    const ids = game.save.front.board.map((operation) => operation.id);
    const countries = game.save.front.board.map((operation) => operation.country);
    const state = (id) => game.globe._frontState(id)?.state;
    const complete = (operationId) => {
      game._applyFrontTransition({ type: 'START_OPERATION', operationId, specialist: 'dispatcher' });
      for (let stage = 0; stage < 3; stage++) {
        game._applyFrontTransition({ type: 'START_STAGE' });
        game._applyFrontTransition({ type: 'COMPLETE_STAGE', build: [] });
      }
      game._applyFrontTransition({ type: 'CLAIM_OPERATION' });
    };

    const threat = state(countries[0]);
    const threatLine = game.globe._frontStatusLine(countries[0]);
    complete(ids[0]);
    const restoring = state(countries[0]);
    const restoringLine = game.globe._frontStatusLine(countries[0]);
    complete(ids[1]);
    complete(ids[2]);
    const safe = countries.every((country) => state(country) === 'safe');
    game.globe._paintedFront = null;
    game.globe.update(0);
    return {
      threat,
      restoring,
      safe,
      threatLine,
      restoringLine,
      repaintTracked: game.globe._paintedFront === game.save.front,
    };
  });

  if (result.threat !== 'threat' || result.restoring !== 'restoring' || !result.safe
      || !result.threatLine.includes('⚠️') || !result.restoringLine.includes('🛰️') || !result.repaintTracked) {
    throw new Error(`Living Front globe states failed: ${JSON.stringify(result)}`);
  }
  console.log('✅ Living Front threat, restoration and safe states reach the globe');
} finally {
  await browser.close();
  close();
}
