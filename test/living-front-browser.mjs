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
    'Разом швидше ×{n}': ['Faster together ×{n}', 'Вместе быстрее ×{n}'],
    'Командир: ривок': ['Commander: charge', 'Командир: рывок'],
    'Командир: виклик підкріплень': ['Commander: summons reinforcements', 'Командир: вызывает подкрепление'],
    'Командир: щит і ривок': ['Commander: shield and charge', 'Командир: щит и рывок'],
    'Командир: невидимість': ['Commander: invisibility', 'Командир: невидимость'],
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
    game.save.front.board.find((operation) => operation.country === id).counterattack = true;
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
      citizens: level.frontLivingCity?.citizens.length || 0,
      pressure: level.frontPressure?.length || 0,
    };
  });
  const feedback = await page.evaluate(() => {
    const game = window.__game;
    const level = game.level;
    const repair = level.missions.missions.find((mission) => mission.type === 'repair');
    const point = repair.repairPoint || level.world.repairPoint;
    level.player.pos.x = point.x;
    level.player.pos.z = point.z;
    level.players = [{ pid: 2, health: 100, holdE: true, pos: { x: point.x, z: point.z } }];
    level.missions._up_repair(repair, 0.01, { down: () => true }, true);
    const teamwork = level.missions.prompt.text;

    let eliteSpawns = 0;
    let hordeCalls = 0;
    const banners = [];
    level.zombies.spawnEliteWave = () => { eliteSpawns++; return []; };
    game.audio.horde = () => { hordeCalls++; };
    game.hud.banner = (...args) => { banners.push(args); };
    level.operation = { stage: 0, threat: 1 };
    level.frontDirector = {
      plan: { phases: [{ id: 'quiet' }, { id: 'pressure' }, { id: 'spike', duration: 28, elite: true }, { id: 'reward' }] },
      phaseIndex: -1,
      remaining: 0,
    };
    game._enterFrontPhase(level, 2);
    const immediateSpawns = eliteSpawns;
    game._updateFrontDirector(level, 1.9);
    const earlyEliteSpawns = eliteSpawns;
    game._updateFrontDirector(level, 0.11);
    const eliteBanner = banners.at(-1);

    const commanderPlan = {
      id: 'pursuer', zombieType: 'gladiator', mechanics: ['charger'],
    };
    level.operation = { stage: 2, threat: 1 };
    level.frontDirector = {
      plan: {
        commander: commanderPlan,
        phases: [{ id: 'quiet' }, { id: 'pressure' }, { id: 'spike', duration: 28, spawnBudget: 0, commander: commanderPlan }, { id: 'reward' }],
      },
      phaseIndex: -1,
      remaining: 0,
    };
    game._enterFrontPhase(level, 2);
    const immediateCommanders = level.zombies.list.filter((zombie) => zombie.frontCommander).length;
    game._updateFrontDirector(level, 1.9);
    const earlyCommanders = level.zombies.list.filter((zombie) => zombie.frontCommander).length;
    const commanderBanner = banners.at(-1);
    game._updateFrontDirector(level, 0.11);
    const commanders = level.zombies.list.filter((zombie) => zombie.frontCommander).length;

    level.net = { authority: false };
    level.frontDirector = {
      plan: {
        commander: commanderPlan,
        phases: [{ id: 'quiet' }, { id: 'pressure' }, { id: 'spike', duration: 28, spawnBudget: 0, commander: commanderPlan }, { id: 'reward' }],
      },
      phaseIndex: -1,
      remaining: 0,
    };
    game._enterFrontPhase(level, 2);
    game._updateFrontDirector(level, 2.1);
    const guestCommanders = level.zombies.list.filter((zombie) => zombie.frontCommander).length;
    level.net = null;
    return {
      teamwork, immediateSpawns, earlyEliteSpawns, eliteSpawns, hordeCalls, eliteBanner,
      immediateCommanders, earlyCommanders, commanders, commanderBanner, guestCommanders,
    };
  });
  if (shots) await page.screenshot({ path: `${shots}/living-front-level.png` });
  if (levelState.damage !== 2 || levelState.rubble !== 12 || levelState.eventId !== 'survivor' || levelState.populationGain !== 5
    || levelState.citizens !== 0 || levelState.pressure !== 3) {
    throw new Error(`Living country runtime failed: ${JSON.stringify(levelState)}`);
  }
  if (!feedback.teamwork.includes('Разом швидше ×2')) throw new Error(`Co-op prompt hides teamwork: ${feedback.teamwork}`);
  if (feedback.immediateSpawns !== 0 || feedback.earlyEliteSpawns !== 0 || feedback.eliteSpawns !== 1
    || feedback.eliteBanner?.[3]?.prio !== 1
    || feedback.immediateCommanders !== 0 || feedback.earlyCommanders !== 0 || feedback.commanders !== 1
    || !feedback.commanderBanner?.[1]?.includes('Ривок') || feedback.commanderBanner?.[3]?.prio !== 1
    || feedback.guestCommanders !== feedback.commanders || feedback.hordeCalls !== 3) {
    throw new Error(`Spike warning must precede authority spawn by two seconds: ${JSON.stringify(feedback)}`);
  }

  const presentations = {};
  for (const state of ['peaceful', 'attacked', 'destroyed', 'rebuilding', 'saved']) {
    await page.goto(`${base}/?test&fresh&front-state=${state}`);
    await page.waitForFunction(() => window.__game?.state === 'globe');
    await page.evaluate(async (wanted) => {
      const game = window.__game;
      game.save.liberated = wanted === 'peaceful' ? { UKR: true, POL: true, DEU: true, FRA: true } : { UKR: true };
      game.save.front = null;
      const front = game._ensureFront();
      const operation = front.board[0];
      let country = operation.country;
      if (wanted === 'peaceful') {
        country = Object.keys(game.save.liberated).find((id) => !front.board.some((entry) => entry.country === id));
      } else if (wanted === 'attacked') {
        operation.status = 'available';
        front.world.countries[country] = { damage: 1, population: 70 };
        front.restored[country] = 0;
      } else if (wanted === 'destroyed') {
        operation.status = 'available';
        front.world.countries[country] = { damage: 3, population: 35 };
        front.restored[country] = 0;
      } else if (wanted === 'rebuilding') {
        operation.status = 'completed';
        front.world.countries[country] = { damage: 1, population: 75 };
        front.restored[country] = 1;
      } else {
        operation.status = 'claimed';
        front.world.countries[country] = { damage: 0, population: 100 };
        front.restored[country] = 3;
      }
      if (wanted === 'attacked') {
        // Зомбі спавняться і зникають між знімком і відновленням, тому пари
        // тримаємо за стабільним nid, а не за місцем у списку. Ті, що зʼявились
        // пізніше, стоять однаково в обох кадрах і в різниці викликів зникають.
        const snapshot = (list) => new Map(list.map((zombie) => [zombie.nid, {
          x: zombie.x, y: zombie.y, z: zombie.z,
          position: zombie.rig.group.position.toArray(),
          horde: zombie.horde, aggroed: zombie.aggroed, state: zombie.state,
        }]));
        const restore = (list, saved) => list.forEach((zombie) => {
          const value = saved.get(zombie.nid);
          if (!value) return;
          Object.assign(zombie, { x: value.x, y: value.y, z: value.z, horde: value.horde, aggroed: value.aggroed, state: value.state });
          zombie.rig.group.position.fromArray(value.position);
        });
        const originalDamage = game._addFrontDamage;
        game._addFrontDamage = (level, damage) => {
          game.__frontBaseline = { level, damage, actors: snapshot(level.zombies.list) };
        };
        game.__prepareFrontBaseline = () => {
          const baseline = game.__frontBaseline;
          baseline.presented = snapshot(baseline.level.zombies.list);
          baseline.frontPressure = baseline.level.frontPressure;
          restore(baseline.level.zombies.list, baseline.actors);
          baseline.level.frontPressure = null;
          game._addFrontDamage = originalDamage;
        };
        game.__applyFrontPresentation = () => {
          const baseline = game.__frontBaseline;
          originalDamage.call(game, baseline.level, baseline.damage);
          restore(baseline.level.zombies.list, baseline.presented);
          baseline.level.frontPressure = baseline.frontPressure;
        };
      }
      await game.startLevel(country);
    }, state);
    await page.waitForFunction(() => window.__game?.state === 'level');
    presentations[state] = await page.evaluate(() => {
      const game = window.__game;
      const level = window.__game.level;
      if (game.__prepareFrontBaseline) game.__prepareFrontBaseline();
      game.renderer.render(level.scene, level.player.camera);
      const baselineCalls = game.renderer.info.render.calls;
      if (game.__applyFrontPresentation) game.__applyFrontPresentation();
      game.renderer.render(level.scene, level.player.camera);
      const presentationCalls = game.renderer.info.render.calls - baselineCalls;
      const citizens = level.frontLivingCity?.citizens || [];
      let duplicateEvacuees = 0;
      if (level.frontCountryState?.state === 'destroyed') {
        const before = level.scene.children.length;
        level.operation = { template: 'evacuation', stage: 1, threat: 1, specialist: 'dispatcher' };
        level.operationEffects = { alliedObjectHealthMultiplier: 1, support: null };
        game._initFrontRuntime(level, game.save.front);
        duplicateEvacuees = level.scene.children.length - before;
      }
      return {
        semantic: level.frontCountryState?.state,
        presentationCalls,
        rubble: level.frontDamage?.children.length || 0,
        evacuees: level.frontEvacuees?.length || 0,
        outpost: level.frontOutpostDrawCalls || 0,
        tier: level.frontLivingCity?.tier || 0,
        citizens: citizens.length,
        pressure: level.frontPressure?.length || 0,
        quietPressure: (level.frontPressure || []).every((zombie) => !zombie.horde && !zombie.aggroed && zombie.state !== 'chase'),
        guards: citizens.filter((citizen) => citizen.job === 'guard').length,
        builders: citizens.filter((citizen) => citizen.job === 'builder').length,
        residents: citizens.filter((citizen) => citizen.job === 'resident').length,
        duplicateEvacuees,
      };
    });
  }
  const { peaceful, attacked, destroyed, rebuilding, saved } = presentations;
  if (peaceful.semantic !== 'peaceful' || peaceful.rubble !== 0 || peaceful.citizens !== 0 || peaceful.outpost !== 0
    || attacked.semantic !== 'attacked' || destroyed.semantic !== 'destroyed'
    || rebuilding.semantic !== 'rebuilding' || saved.semantic !== 'saved'
    || !(attacked.rubble > 0 && destroyed.rubble > attacked.rubble)
    || attacked.outpost !== 0 || attacked.citizens !== 0 || attacked.pressure !== 3 || !attacked.quietPressure
    || attacked.presentationCalls <= 0 || attacked.presentationCalls > 10
    || destroyed.evacuees === 0 || destroyed.outpost !== 0 || destroyed.duplicateEvacuees !== 0
    || rebuilding.rubble !== 0 || rebuilding.outpost === 0 || rebuilding.builders === 0
    || saved.rubble !== 0 || saved.tier !== 3 || saved.outpost <= rebuilding.outpost
    || saved.citizens <= rebuilding.citizens || saved.residents <= attacked.residents) {
    throw new Error(`Front states are not visibly distinct: ${JSON.stringify(presentations)}`);
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(`✅ Living Front states, warnings and +${attacked.presentationCalls} attacked presentation calls work in browser`);
} finally {
  await browser.close();
  close();
}
