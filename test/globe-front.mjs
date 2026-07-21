import { openBrowserTest } from './_browser.mjs';

const { BASE: base, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader', '--no-sandbox'] }, context: { viewport: { width: 1280, height: 720 } }, captureErrors: false });

try {
  await page.goto(`${base}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe');
  const result = await page.evaluate(() => {
    const game = window.__game;
    game.save.liberated = {};
    game.save.front = null;
    let campaignTarget = null;
    let campaignPickerOpen = false;
    if (typeof game.continueRescue === 'function') {
      game.continueRescue();
      campaignTarget = document.activeElement?.dataset.id;
      campaignPickerOpen = document.getElementById('overlay-solo').classList.contains('show');
      game._hideOverlay('overlay-solo');
    }
    game.save.liberated = { UKR: true, POL: true, DEU: true };
    game.save.front = null;
    game._ensureFront();
    const ids = game.save.front.board.map((operation) => operation.id);
    const countries = game.save.front.board.map((operation) => operation.country);
    const recommendedOperationId = game.getFrontViewModel().recommendedOperationId;
    game.continueRescue();
    const frontOpened = document.getElementById('overlay-front').classList.contains('show');
    const recommendedSelected = game.frontui.selectedOperationId === recommendedOperationId;
    game.frontui.close();
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
      campaignPickerOpen,
      campaignTarget,
      frontOpened,
      recommendedSelected,
      primaryLabel: document.getElementById('front-cta-label').textContent,
      otherButtons: document.querySelectorAll('#globe-other #btn-solo, #globe-other #btn-coop, #globe-other #btn-expedition').length,
      repaintTracked: game.globe._paintedFront === game.save.front,
    };
  });

  if (result.attacked !== 'attacked' || result.rebuilding !== 'rebuilding' || !result.saved
      || !result.campaignPickerOpen || result.campaignTarget !== 'UKR'
      || !result.frontOpened || !result.recommendedSelected || result.primaryLabel !== 'Продовжити порятунок'
      || result.otherButtons !== 3
      || !result.attackedLine.includes('Під атакою') || !result.attackedLine.includes('Орда атакує')
      || !result.attackedLine.includes('Зупинити атаку')
      || !result.rebuildingLine.includes('Відбудова') || !result.rebuildingLine.includes('повертається до життя')
      || !result.rebuildingLine.includes('Продовжити відбудову')
      || result.attackedLine.includes('🧱') || result.attackedLine.includes('👥')
      || result.rebuildingLine.includes('🧱') || result.rebuildingLine.includes('👥')
      || !result.repaintTracked) {
    throw new Error(`Living Front globe states failed: ${JSON.stringify(result)}`);
  }
  console.log('✅ Front globe exposes semantic country decisions and the campaign fallback');
} finally {
  await closeTest();
}
