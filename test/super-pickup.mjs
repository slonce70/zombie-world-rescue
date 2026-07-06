// 🌟 «Момент могутності» (v288): 1×/соло-рівень падає супер-пікап (після 2-ї місії
// АБО на елітній хвилі). Схопив → одна з двох сил (🔥 Шквал / 🧲 Магніт-буря) з
// відліком на HUD; сила згасає сама. Перевіряємо спавн, активацію, згасання, «1 на рівень».
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '  ✅' : '  ❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?test&fresh&seed=1&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.level && !!window.__game.level.missions, null, { timeout: 30000 });
await page.waitForTimeout(400);

console.log('▸ Соло-кампанія — рівень має право на супер-пікап');
const elig = await page.evaluate(() => ({
  eligible: !!window.__game.level.superEligible,
  net: !!window.__game.level.net,
}));
check(elig.eligible && !elig.net, 'level.superEligible у соло-кампанії', JSON.stringify(elig));

console.log('▸ Спавн на 2-й зданій місії (не раніше)');
const spawn = await page.evaluate(() => {
  const g = window.__game;
  g.test.forceSuperPower('shkval'); // детермінізм для асертів
  g.level.bus.emit('missionDone', { title: 'm1', reward: 0 });
  const afterOne = g.test.state().superSpawned;
  g.level.bus.emit('missionDone', { title: 'm2', reward: 0 });
  const s = g.test.state();
  return { afterOne, spawned: s.superSpawned, pickup: s.superPickup };
});
check(spawn.afterOne === false, 'після 1-ї місії пікапа ще нема', String(spawn.afterOne));
check(spawn.spawned === true, 'після 2-ї місії — супер-пікап зʼявився', String(spawn.spawned));
check(spawn.pickup && spawn.pickup.type === 'shkval', 'пікап існує на мапі (forceSuperPower)', JSON.stringify(spawn.pickup));

console.log('▸ Тільки ОДИН пікап на рівень (повторні тригери — no-op)');
const once = await page.evaluate(() => {
  const g = window.__game;
  const before = g.test.state().superPickup;
  g.level.bus.emit('missionDone', { title: 'm3', reward: 0 }); // 3-тя місія
  g.level.bus.emit('eliteWaveWarning');                        // + елітна хвиля
  g._trySuperPickup(g.level);                                   // + прямий виклик
  const after = g.test.state().superPickup;
  return { same: !!before && !!after && before.x === after.x && before.z === after.z };
});
check(once.same, 'повторні тригери не плодять другий пікап', JSON.stringify(once));

console.log('▸ Грабіж активує силу (🔥 Шквал) із відліком');
const grab = await page.evaluate(() => {
  const g = window.__game;
  const ok = g.test.grabSuper();
  const st = g.test.superState();
  const p = g.level.player;
  return {
    ok,
    st,
    cleared: g.test.state().superPickup === null,
    infAmmoFires: (() => { p.cur = 'rifle'; p.ammo.rifle.mag = 0; return !!(p.superPower && p.superPower.type === 'shkval'); })(),
  };
});
check(grab.ok, 'grabSuper() спрацював', String(grab.ok));
check(grab.st && grab.st.type === 'shkval' && grab.st.t > 0 && grab.st.dur === 12, 'сила активна: 🔥 Шквал 12с', JSON.stringify(grab.st));
check(grab.cleared, 'пікап зник із мапи після грабежу', String(grab.cleared));

console.log('▸ Сила згасає сама (таймер → 0) + тост «скінчилась»');
const expire = await page.evaluate(() => {
  const g = window.__game;
  let ended = false;
  g.level.bus.on('superPowerEnd', () => { ended = true; });
  g.level.player.superPower.t = 0.12;          // підводимо до згасання
  g.level.player._updateBuffTimers(0.2);       // крок симуляції таймерів → 0
  return { ended, st: g.test.superState() };
});
check(expire.st === null, 'після відліку superPower скинуто', JSON.stringify(expire.st));
check(expire.ended === true, 'подія superPowerEnd спрацювала', String(expire.ended));

console.log('▸ Магніт-буря: тип магніт, +швидкість, супер-магніт активний');
const magnet = await page.evaluate(() => {
  const g = window.__game;
  g.level.superSpawned = false; g.level.superPickup = null; // штучно дозволяємо ще один для перевірки типу
  g.test.forceSuperPower('magnet');
  g._trySuperPickup(g.level);
  g.test.grabSuper();
  const superMagnet = g.level.effects.getSuperMagnet();
  const st = g.test.superState();
  return { st, superMagnet };
});
check(magnet.st && magnet.st.type === 'magnet' && magnet.st.dur === 15, 'сила активна: 🧲 Магніт-буря 15с', JSON.stringify(magnet.st));
check(magnet.superMagnet === true, 'getSuperMagnet() → монети з усієї мапи', String(magnet.superMagnet));

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 3).join(' | '));
console.log(fail === 0 ? '\n🎉 SUPER-PICKUP OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
closeServer();
process.exit(fail ? 1 : 0);
