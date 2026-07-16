import { openBrowserTest, makeCheck } from './_browser.mjs';

let fail = 0;
const check = makeCheck(() => fail++);
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, captureConsole: false, pageErrorPrefix: '' });

await page.goto(`${BASE}/?test&fresh&seed=5`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated.UKR = true;
  g.saveGame();
  g.startLevel('POL');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.countryId === 'POL', null, { timeout: 60000 });

const live = await page.evaluate(() => {
  const g = window.__game;
  const ms = g.level.missions;
  // StoryMissions locks later story objectives, so exercise the dynamic mission
  // that actually owns Living World instead of trying to skip the story order.
  const delegate = ms.delegate || ms;
  const eligible = delegate.missions.find((m) => m.slotIndex > 0);
  delegate._complete(eligible.id);
  const ev = ms.livingWorld;
  const markers = ms.getMarkers().filter((m) => m.icon === '🌍').length;
  const beforeCoins = g.save.coins;
  const beforeXp = g.save.xp || 0;
  if (ev.state === 'fight') {
    for (const z of ev.spawned) z.state = 'dead';
    ms.update(0.016, g.input, false);
  } else {
    ms._completeLivingWorld();
  }
  return {
    id: ev.id,
    markers,
    cleared: !ms.livingWorld,
    coins: g.save.coins - beforeCoins,
    xp: (g.save.xp || 0) - beforeXp,
  };
});

check(['survivor', 'crate', 'goldHorde'].includes(live.id), 'Living World подія створилась', JSON.stringify(live));
check(live.markers === 1, 'подія має маркер на мінімапі', live.markers);
check(live.cleared && live.coins > 0 && live.xp > 0, 'подія завершується і дає монети та XP', JSON.stringify(live));
check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));

console.log(fail === 0 ? '\n🎉 LIVING WORLD BROWSER OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await closeTest();
process.exit(fail ? 1 : 0);
