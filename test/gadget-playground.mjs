import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const SAVE_KEY = 'zr-save-v1';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Полігон гаджетів');
const before = await page.evaluate((saveKey) => {
  const g = window.__game;
  g.save.gadgetsOwned = ['heal'];
  g.save.activeGadget = 'heal';
  g.saveGame();
  const savedJson = localStorage.getItem(saveKey);
  const schedulePushCount = 0;
  if (g.cloud) {
    g.cloud.schedulePush = () => { window.__playgroundSchedulePushCount++; };
    window.__playgroundSchedulePushCount = schedulePushCount;
  }
  g.renderWardrobe();
  g._showOverlay('overlay-wardrobe');
  [...document.querySelectorAll('#wardrobe-content .ward-tab')]
    .find((t) => t.textContent.trim() === 'Гаджети')?.click();
  const btn = document.querySelector('#wardrobe-content [data-action="gadget-playground"]');
  const meteorTry = document.querySelector('#wardrobe-content .ward-card[data-kind="gadget"][data-id="meteor"] [data-action="gadget-try"]');
  return {
    hasButton: !!btn,
    hasMeteorTry: !!meteorTry,
    text: btn?.textContent.trim() || '',
    meteorText: meteorTry?.textContent.trim() || '',
    owned: [...g.save.gadgetsOwned],
    active: g.save.activeGadget,
    coins: g.save.coins,
    xp: g.save.xp || 0,
    liberated: JSON.stringify(g.save.liberated),
    missionRuns: JSON.stringify(g.save.missionRuns),
    stats: JSON.stringify(g.save.stats),
    quests: JSON.stringify(g.quests.list.map((q) => ({ id: q.id, progress: q.progress, done: q.done }))),
    chapter: JSON.stringify(g.save.chapter || null),
    hints: JSON.stringify(g.save.hints || {}),
    savedJson,
    savedHints: JSON.stringify(JSON.parse(savedJson || '{}').hints || {}),
    savedActive: JSON.parse(savedJson || '{}').activeGadget,
    schedulePushCount: window.__playgroundSchedulePushCount || 0,
  };
}, SAVE_KEY);
check(before.savedActive === 'heal', 'normal save перед полігоном пише localStorage', before.savedJson || 'null');
check(before.hasButton && /Полігон гаджетів|Спробувати гаджети/.test(before.text), 'кнопка є у вкладці Гаджети', before.text);
check(before.hasMeteorTry && /Спробувати/.test(before.meteorText), 'кнопка Спробувати є на картці метеорита', before.meteorText);
if (!before.hasButton) {
  console.log(`💥 ПРОВАЛЕНО: ${failed}`);
  await browser.close();
  process.exit(1);
}

await page.click('#wardrobe-content .ward-card[data-kind="gadget"][data-id="meteor"] [data-action="gadget-try"]');
await page.waitForFunction(() => window.__game?.level?.playground === true, null, { timeout: 30000 });

const started = await page.evaluate(async () => {
  const g = window.__game;
  const { GADGETS } = await import('/src/extras.js');
  const ids = Object.keys(GADGETS);
  const initialActive = g.level.gadgets.active;
  const selected = ids.map((id) => {
    g.test.playgroundSelectGadget(id);
    return g.level.gadgets.active;
  });
  return {
    playground: g.level.playground,
    country: g.level.countryId,
    ids,
    first: ids[0],
    initialActive,
    selected,
    saveOwned: [...g.save.gadgetsOwned],
    saveActive: g.save.activeGadget,
    levelActive: g.level.gadgets.active,
  };
});
check(started.playground && started.country === 'UKR', 'стартує UKR playground', JSON.stringify(started));
check(started.initialActive === 'meteor', 'картка запускає полігон з обраним гаджетом', JSON.stringify(started));
check(JSON.stringify(started.selected) === JSON.stringify(started.ids),
  'усі гаджети можна вибрати в полігоні', JSON.stringify(started.selected));
check(started.saveOwned.length === 1 && started.saveOwned[0] === 'heal' && started.saveActive === 'heal',
  'save gadgetsOwned/activeGadget не змінено під час вибору', JSON.stringify(started));

const challenge = await page.evaluate(() => {
  const g = window.__game;
  g.test.playgroundSelectGadget('shield');
  g.hud.update(0);
  const start = { ...g.level.gadgetChallenge, hud: document.querySelector('#gadget-chips')?.textContent.trim() || '' };
  g.test.gadgetCdReset();
  g.test.useGadget();
  g.test.useGadget();
  g.hud.update(0);
  const mid = { ...g.level.gadgetChallenge, hud: document.querySelector('#gadget-chips')?.textContent.trim() || '' };
  g.test.useGadget();
  g.hud.update(0);
  const done = { ...g.level.gadgetChallenge, hud: document.querySelector('#gadget-chips')?.textContent.trim() || '' };
  g.test.playgroundSelectGadget('meteor');
  g.hud.update(0);
  const reset = { ...g.level.gadgetChallenge, hud: document.querySelector('#gadget-chips')?.textContent.trim() || '' };
  return { start, mid, done, reset };
});
check(challenge.start.title && challenge.start.progress === 0 && challenge.start.target === 3 && /0\/3/.test(challenge.start.hud),
  'challenge стартує у HUD з 0/3', JSON.stringify(challenge.start));
check(challenge.mid.progress === 2 && !challenge.mid.done && /2\/3/.test(challenge.mid.hud),
  'challenge рахує використання поточного гаджета', JSON.stringify(challenge.mid));
check(challenge.done.progress === 3 && challenge.done.done && /ГОТОВО/.test(challenge.done.hud),
  'challenge завершується після target', JSON.stringify(challenge.done));
check(challenge.reset.progress === 0 && challenge.reset.target === 3 && !challenge.reset.done && /0\/3/.test(challenge.reset.hud),
  'challenge скидається при виборі іншого гаджета', JSON.stringify(challenge.reset));

const practice = await page.evaluate((saveKey) => {
  const g = window.__game;
  g.test.playgroundSelectGadget('shield');
  g.test.gadgetCdReset();
  const used1 = g.test.useGadget();
  const cd1 = g.level.gadgets.cd;
  const used2 = g.test.useGadget();
  const cd2 = g.level.gadgets.cd;
  g.level.player.respawnProtect = 0;
  g.level.player.gadgetShield = 0;
  g.level.player.health = 100;
  g.level.player.takeDamage(99999, g.level.player.pos.x + 1, g.level.player.pos.z);
  return {
    used1, used2, cd1, cd2, health: g.level.player.health, deathT: g.deathT,
    hints: JSON.stringify(g.save.hints || {}),
    savedJson: localStorage.getItem(saveKey),
    savedHints: JSON.stringify(JSON.parse(localStorage.getItem(saveKey) || '{}').hints || {}),
    schedulePushCount: window.__playgroundSchedulePushCount || 0,
  };
}, SAVE_KEY);
check(practice.used1 && practice.used2 && practice.cd2 <= 0.5, 'гаджет можна повторити без навчального cooldown-блоку', JSON.stringify(practice));
check(practice.health > 0 && practice.deathT < 0, 'пошкодження не вбиває у полігоні', JSON.stringify(practice));
check(practice.hints === before.hints, 'полігон не мутує in-memory save.hints', JSON.stringify({ before: before.hints, after: practice.hints }));
check(practice.savedHints === before.savedHints, 'полігон не персистить save.hints у SAVE_KEY', JSON.stringify({ before: before.savedHints, after: practice.savedHints }));
check(practice.savedJson === before.savedJson, 'полігон не переписує localStorage SAVE_KEY', JSON.stringify({ before: before.savedJson, after: practice.savedJson }));
check(practice.schedulePushCount === before.schedulePushCount, 'полігон не викликає cloud.schedulePush', JSON.stringify(practice));

const afterProgress = await page.evaluate((beforeSnap) => {
  const g = window.__game;
  g.level.addCoins(99);
  g.level.bus.emit('zombieKilled', { type: 'walker' });
  g.level.bus.emit('hordeEnd');
  g.level.bus.emit('missionDone', { title: 'test', reward: 99 });
  g._showVictory();
  const after = {
    owned: [...g.save.gadgetsOwned],
    active: g.save.activeGadget,
    coins: g.save.coins,
    xp: g.save.xp || 0,
    liberated: JSON.stringify(g.save.liberated),
    missionRuns: JSON.stringify(g.save.missionRuns),
    stats: JSON.stringify(g.save.stats),
    quests: JSON.stringify(g.quests.list.map((q) => ({ id: q.id, progress: q.progress, done: q.done }))),
    chapter: JSON.stringify(g.save.chapter || null),
  };
  return { before: beforeSnap, after };
}, before);
check(JSON.stringify(afterProgress.after) === JSON.stringify({
  owned: before.owned,
  active: before.active,
  coins: before.coins,
  xp: before.xp,
  liberated: before.liberated,
  missionRuns: before.missionRuns,
  stats: before.stats,
  quests: before.quests,
  chapter: before.chapter,
}), 'полігон не пише монети/XP/quests/stats/liberated/missionRuns/chapter', JSON.stringify(afterProgress));

const exited = await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  return { owned: [...g.save.gadgetsOwned], active: g.save.activeGadget, state: g.state };
});
check(exited.state === 'globe' && exited.active === 'heal' && exited.owned.length === 1 && exited.owned[0] === 'heal',
  'після виходу activeGadget не зіпсовано', JSON.stringify(exited));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ПОЛІГОН ГАДЖЕТІВ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
