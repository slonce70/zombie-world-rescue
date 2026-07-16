import { makeCheck } from './_browser.mjs';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
let failed = 0;
const check = makeCheck(() => failed++);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const screenshotDir = process.env.FRONT_SCREENSHOTS || '';
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
const screenshot = async (name) => {
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: true });
};

try {
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30_000 });

  const metrics = await page.evaluate(async () => {
    const game = window.__game;
    const mod = await import('/src/net/frontmetrics.js');
    const originalFetch = window.fetch;
    const originalParams = game.params;
    const originalSaveGame = game.saveGame;
    game.save.front = game.save.front || { stats: { firstSeenDay: '2020-01-01', sent: [] } };
    game.save.front.stats = { firstSeenDay: '2020-01-01', sent: [] };
    game.saveGame = () => {};
    localStorage.removeItem(mod.FRONT_METRICS_KEY);
    game.params = new URLSearchParams('metrics=0');
    const zeroDisabled = !mod.frontMetricsEnabled(game);
    await mod.sendFrontReturns(game);
    const disabledUnsent = game.save.front.stats.sent.length === 0;
    game.params = new URLSearchParams('metrics=1');
    window.fetch = async () => ({ ok: false });
    await mod.sendFrontReturns(game);
    const failedUnsent = game.save.front.stats.sent.length === 0;
    window.fetch = async () => ({ ok: true });
    await mod.sendFrontReturns(game);
    const successSent = game.save.front.stats.sent.includes('return_d1')
      && game.save.front.stats.sent.includes('return_d7');
    window.fetch = originalFetch;
    game.params = originalParams;
    game.saveGame = originalSaveGame;
    game.save.front = null;
    return { zeroDisabled, disabledUnsent, failedUnsent, successSent };
  });
  check(Object.values(metrics).every(Boolean), 'Front return metrics require explicit opt-in and record only successful sends', JSON.stringify(metrics));

  const board = await page.evaluate(() => {
    const game = window.__game;
    game.save.liberated = { UKR: true, POL: true, DEU: true };
    game.save.friends = { UKR: true, POL: true, DEU: true };
    game.save.front = null;
    game._ensureFront();
    game.frontui.render();
    return game.getFrontViewModel();
  });
  check(board.board.length === 3, 'veteran unlock creates three operations');
  check(new Set(board.board.map((op) => op.country)).size === 3, 'operations use three distinct liberated countries');
  check(board.specialists.find((item) => item.id === 'UKR').available, 'rescued medic is selectable');
  check(await page.locator('#btn-front').isVisible(), 'Front CTA is visible after unlock');

  await page.evaluate(() => window.__game.openFront());
  check(await page.locator('#overlay-front').getAttribute('aria-hidden') === 'false', 'Front overlay opens accessibly');
  check(await page.locator('.front-operation').count() === 3, 'board renders recommended plus alternatives');
  check(await page.locator('.front-operation').first().evaluate((node) => node.classList.contains('recommended')), 'recommended operation leads the board');
  check(await page.locator('#btn-front-go').isVisible(), 'primary action remains visible at 1280x720');
  await screenshot('front-board-1280x720');

  await page.locator('[data-specialist-id="POL"]').click();
  check(await page.locator('.front-op-intel').count() === 3, 'Scout reveals commander intel before the operation starts');

  const radioStageChips = await page.evaluate(() => {
    const game = window.__game;
    game.save.front.projects.radio = 2;
    game.frontui.render();
    return document.querySelectorAll('.front-op-stages [data-stage-id]').length;
  });
  check(radioStageChips === 9, 'Radio Tower level 2 reveals all three stages for every operation');
  await page.evaluate(() => {
    const game = window.__game;
    game.save.front.projects.radio = 0;
    game.frontui.render();
  });

  const initial = await page.evaluate(() => {
    const game = window.__game;
    game.selectFrontProject('workshop');
    const vm = game.getFrontViewModel();
    const operation = vm.board.find((item) => item.recommended);
    return { id: operation.id, threat: operation.threat, coins: game.save.coins, crystals: game.save.crystals };
  });

  for (let stage = 0; stage < 3; stage++) {
    await page.evaluate(async ({ operationId, first }) => {
      const game = window.__game;
      const activeId = game.save.front.active && game.save.front.active.operationId;
      await game.startFrontOperation(activeId || operationId, first ? 'UKR' : undefined);
    }, { operationId: initial.id, first: stage === 0 });
    await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.operation, null, { timeout: 30_000 });
    const stageState = await page.evaluate(() => {
      const game = window.__game;
      const level = game.level;
      game.renderer.render(level.scene, level.player.camera);
      const callsBefore = game.renderer.info.render.calls;
      const before = level.zombies.list.filter((zombie) => zombie.frontEncounter).length;
      game._enterFrontPhase(level, 1);
      const pressure = level.zombies.list.filter((zombie) => zombie.frontEncounter).length - before;
      game._onFrontObjectiveComplete(level);
      const objectiveAdvanced = level.operation.stage < 2
        ? game.save.front.active && game.save.front.active.stage === level.operation.stage + 1
        : level.zombies.list.some((zombie) => zombie.frontCommander);
      game._enterFrontPhase(level, 3);
      game.renderer.render(level.scene, level.player.camera);
      return {
        stage: level.operation.stage,
        missionCount: Array.isArray(level.missions && level.missions.missions) ? level.missions.missions.length : null,
        campaignBossUnlocked: !!(level.missions && level.missions.bossUnlocked),
        support: level.operationEffects.support,
        phases: level.frontDirector.plan.phases.map((phase) => phase.id),
        objectiveAdvanced,
        pressure,
        pressureBudget: level.frontDirector.plan.phases[1].spawnBudget,
        rewardDrop: level.frontRewardDrop,
        drawDelta: game.renderer.info.render.calls - callsBefore,
      };
    });
    check(stageState.stage === stage, `stage ${stage + 1} restores canonical index`);
    check(stageState.support === 'medkit', 'medic has a visible medical support object');
    check(stageState.missionCount === (stage === 2 ? 0 : 1), `stage ${stage + 1} has one short objective (commander-only finale)`);
    check(!stageState.campaignBossUnlocked, 'Front stage does not unlock the ordinary campaign boss');
    check(stageState.phases.join(',') === 'quiet,pressure,spike,reward', 'Encounter Director has four deterministic phases');
    check(stageState.objectiveAdvanced,
      stage === 2 ? 'commander-only finale spawns immediately' : 'objective completion finishes the short stage immediately');
    if (stageState.stage === 0) {
      check(stageState.pressure === stageState.pressureBudget, 'pressure phase executes its deterministic spawn budget');
      check(stageState.rewardDrop, 'reward phase creates a safe supply drop');
      check(stageState.drawDelta <= 10, 'Front stage stays inside the +10 draw-call budget');
      await screenshot('front-active-1280x720');
    }
    if (stage === 2) {
      await page.evaluate(() => {
        const game = window.__game;
        const commander = game.level.zombies.list.find((zombie) => zombie.frontCommander);
        game.level.bus.emit('zombieKilled', commander);
      });
      await page.waitForFunction(() => window.__game.victoryShown, null, { timeout: 5_000 });
      const commanderFinished = await page.evaluate(() => {
        const game = window.__game;
        return !game.save.front.active && game.save.front.board.some((item) => item.status === 'claimed');
      });
      check(commanderFinished, 'defeating the final commander completes and claims the operation');
    }
    await page.evaluate(() => window.__game.endLevel());
    await page.waitForFunction(() => window.__game.state === 'globe');
  }

  const completed = await page.evaluate((operationId) => {
    const game = window.__game;
    const selected = game.save.front.board.find((item) => item.id === operationId);
    return {
      active: game.save.front.active,
      status: selected && selected.status,
      restored: selected && game.save.front.restored[selected.country],
      project: game.save.front.projects.workshop,
      progress: game.save.front.projectProgress,
      coins: game.save.coins,
      crystals: game.save.crystals,
      claims: game.save.front.claims.slice(),
    };
  }, initial.id);
  check(completed.active === null && completed.status === 'claimed', 'three stages finish and claim the operation once');
  check(completed.restored === 1 && completed.progress === 1, 'victory changes country and advances locked Base project');
  check(completed.coins === initial.coins + 200 + initial.threat * 50, 'operation coins are canonical');
  check(completed.crystals === initial.crystals + 1 + initial.threat, 'operation crystals are canonical');
  check(completed.claims.filter((id) => id.endsWith(':operation')).length === 1, 'operation reward has one stable claim id');
  await page.evaluate(() => window.__game.openFront());
  await screenshot('front-victory-consequence-1280x720');
  await page.evaluate(() => window.__game.frontui.close());

  const retry = await page.evaluate(async () => {
    const game = window.__game;
    const op = game.save.front.board.find((item) => item.status === 'available');
    await game.startFrontOperation(op.id, 'DEU');
    game._finishFrontStage(false);
    game.endLevel();
    const afterFail = game.save.front.active && game.save.front.active.status;
    game.abandonFrontOperation();
    return { afterFail, active: game.save.front.active, status: game.save.front.board.find((item) => item.id === op.id).status };
  });
  check(retry.afterFail === 'ready', 'failure restarts current stage without escalation');
  check(retry.active === null && retry.status === 'available', 'abandon returns operation without penalty');

  await page.evaluate(async () => {
    const game = window.__game;
    const op = game.save.front.board.find((item) => item.status === 'available');
    await game.startFrontOperation(op.id, 'dispatcher');
    game.saveGame();
  });
  await page.goto(`${BASE}/?test`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30_000 });
  const restored = await page.evaluate(() => window.__game.save.front.active);
  check(restored && restored.status === 'ready', 'reload restarts only the current stage');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { window.__game.frontui.render(); window.__game.frontui.open(); });
  const mobile = await page.locator('.front-card').boundingBox();
  check(mobile && mobile.width <= 390, 'Front board fits a 390px portrait viewport');
  check(await page.locator('#btn-front-go').isVisible(), 'primary touch action remains visible on mobile');
  await screenshot('front-board-390x844');

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    const game = window.__game;
    game.frontui.close();
    game.enterHQBase();
  });
  const hq = await page.evaluate(() => window.__game.hqbase.frontProjectProps);
  await screenshot('front-hq-1280x720');
  await page.evaluate(() => window.__game.exitHQBase());
  check(hq >= 4 && hq <= 10, 'HQ renders the Front map/projects inside the +15 draw-call budget', String(hq));

  const realErrors = errors.filter((message) => !/Failed to load resource|status of \d{3}|net::|ERR_|favicon/i.test(message));
  check(realErrors.length === 0, 'no browser JS errors', realErrors.join(' | '));
} catch (error) {
  failed++;
  console.error('  ❌ worldfront-browser crashed:', error.stack || error.message);
} finally {
  await browser.close();
  if (closeServer) await closeServer();
}

if (failed) process.exit(1);
console.log('\n✅ worldfront-browser: all checks passed');
