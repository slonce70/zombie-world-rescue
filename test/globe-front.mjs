import { openBrowserTest } from './_browser.mjs';

const { BASE: base, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader', '--no-sandbox'] }, context: { viewport: { width: 1280, height: 720 } }, captureErrors: false });

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

    const attacked = state(countries[0]);
    const attackedLine = game.globe._frontStatusLine(countries[0]);
    complete(ids[0]);
    const rebuilding = state(countries[0]);
    const rebuildingLine = game.globe._frontStatusLine(countries[0]);
    while (state(countries[0]) !== 'saved') complete(game.save.front.board.find((operation) => operation.country === countries[0]).id);
    for (const country of countries.slice(1)) while (state(country) !== 'saved') complete(game.save.front.board.find((operation) => operation.country === country).id);
    const saved = countries.every((country) => state(country) === 'saved');
    game.globe._paintedFront = null;
    game.globe.update(0);
    return {
      attacked,
      rebuilding,
      saved,
      attackedLine,
      rebuildingLine,
      repaintTracked: game.globe._paintedFront === game.save.front,
    };
  });

  if (result.attacked !== 'attacked' || result.rebuilding !== 'rebuilding' || !result.saved
      || !result.attackedLine.includes('⚠️') || !result.rebuildingLine.includes('🛰️') || !result.repaintTracked) {
    throw new Error(`Living Front globe states failed: ${JSON.stringify(result)}`);
  }
  console.log('✅ Living Front attacked, rebuilding and saved states reach the globe');
} finally {
  await closeTest();
}
