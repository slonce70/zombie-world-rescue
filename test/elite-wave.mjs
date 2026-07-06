// 👹 Елітна хвиля (v287): кожна ~3-тя орда у СОЛО — банер «⚠️ Елітна хвиля!» за 3с +
// стінгер, 2–4 еліти; по зачистці падає скриня. 🎁 Церемонія скрині: DOM-оверлей
// зʼявляється й видає нагороду. Reuse для мегабокса й подарунка дня — теж церемонія.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Кожна ~3-тя орда у соло — елітна хвиля (банер + стінгер)');
const sched = await page.evaluate(() => {
  const g = window.__game; const mp = g.level.missions;
  const warns = [];
  // читаємо банер У МОМЕНТ попередження (HUD-хендлер спрацьовує на тому ж emit раніше за нас)
  g.level.bus.on('eliteWaveWarning', () => warns.push(document.getElementById('banner-title').textContent));
  const active = mp.missions.filter((m) => m.state === 'active').slice(0, 3);
  const seq = [];
  for (const m of active) {
    mp.pendingHorde = null;         // кожна нова орда — «свіжа» (у грі вони рознесені у часі)
    const before = warns.length;
    mp._complete(m.id);
    seq.push({ elite: !!(mp.pendingHorde && mp.pendingHorde.elite), warned: warns.length > before, t: mp.pendingHorde ? mp.pendingHorde.t : null });
  }
  return { seq, bannerTitle: warns[warns.length - 1] || '' };
});
check(sched.seq.length === 3, 'зіграно 3 орди', JSON.stringify(sched.seq.map((s) => s.elite)));
check(!sched.seq[0].elite && !sched.seq[1].elite, '1-ша й 2-га орди — звичайні', JSON.stringify(sched.seq));
check(sched.seq[2].elite === true, '3-тя орда — ЕЛІТНА', JSON.stringify(sched.seq[2]));
check(sched.seq[2].warned === true && sched.seq[2].t === 3, 'еліт-банер за 3с (pendingHorde.t=3)', JSON.stringify(sched.seq[2]));
check(sched.bannerTitle.includes('Елітна хвиля'), 'HUD показує банер «Елітна хвиля»', sched.bannerTitle);

console.log('▸ spawnEliteWave: 2–4 еліти, golden виключений');
const spawn = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies;
  for (const z of Z.list) { z.gone = true; Z.scene.remove(z.rig.group); Z.byNidMap.delete(z.nid); }
  Z.list = [];
  const list = Z.spawnEliteWave();
  return {
    count: list.length,
    allElite: list.every((z) => z.elite === true),
    types: list.map((z) => z.type),
    noGolden: list.every((z) => !z.golden),
    aggro: list.every((z) => z.aggroed && z.state === 'chase'),
  };
});
check(spawn.count >= 2 && spawn.count <= 4, 'спавнилось 2–4 еліти', String(spawn.count));
check(spawn.allElite, 'усі позначені як elite (аура+іконка)', JSON.stringify(spawn.types));
check(spawn.noGolden && spawn.types.every((t) => ['shield', 'splitter', 'exploder'].includes(t)), 'типи з пулу хвилі, без golden', JSON.stringify(spawn.types));
check(spawn.aggro, 'еліти одразу біжать на гравця', String(spawn.aggro));

console.log('▸ Зачистка хвилі → церемонія скрині + нагорода');
const cleared = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies;
  // ізолюємо: лишаємо тільки еліт-хвилю
  for (const z of Z.list) { z.gone = true; Z.scene.remove(z.rig.group); Z.byNidMap.delete(z.nid); }
  Z.list = [];
  const list = Z.spawnEliteWave();
  let evt = null;
  g.level.bus.on('eliteWaveCleared', (p) => { evt = p; });
  const coins0 = g.save.coins;
  const cry0 = g.save.crystals || 0;
  // вбиваємо всіх еліт (гасимо щити, щоб напевно дійшло до тіла)
  for (const z of list) { z.shieldHp = 0; z.damage(999999, { x: 1, z: 0 }, false); }
  Z.update(0.1); // детект зачистки
  const root = document.getElementById('chest-ceremony');
  return {
    evtFired: !!evt,
    shown: root.classList.contains('show'),
    coinsUp: g.save.coins - coins0,
    cryUp: (g.save.crystals || 0) - cry0,
  };
});
check(cleared.evtFired, 'подія eliteWaveCleared спрацювала', String(cleared.evtFired));
check(cleared.shown, '🎁 церемонія скрині зʼявилась (overlay show)', String(cleared.shown));
check(cleared.coinsUp >= 120 && cleared.cryUp >= 3, 'нагорода видана (монети + кристали)', JSON.stringify({ c: cleared.coinsUp, cr: cleared.cryUp }));

console.log('▸ Церемонія reuse: подарунок дня видає через скриню');
const gift = await page.evaluate(() => {
  const g = window.__game;
  g._closeChest && g._closeChest();
  // форсимо доступний подарунок
  g.gift.claim(); // спорожнити, якщо був
  g.save.giftClaimedDay = -1;
  const before = document.getElementById('chest-ceremony').classList.contains('show');
  let ok = false;
  try {
    g.chestCeremony({ title: '🎁 ТЕСТ', items: [{ icon: '🪙', n: 50 }, { icon: '💎', n: 5 }] });
    ok = document.getElementById('chest-ceremony').classList.contains('show');
  } catch (e) { /* ignore */ }
  const items = document.querySelectorAll('#chest-ceremony .chest-item').length;
  g._closeChest();
  return { before, ok, items };
});
check(gift.ok, 'chestCeremony() reusable — overlay показується', String(gift.ok));

console.log('▸ Мегабокс тепер теж через церемонію (openMegaboxReward)');
const mega = await page.evaluate(() => {
  const g = window.__game;
  g._closeChest && g._closeChest();
  g._megaForce = 0.5; // фонтан монет
  const c0 = g.save.coins;
  g.openMegaboxReward(g.level.player.pos.x, g.level.player.pos.z);
  const shown = document.getElementById('chest-ceremony').classList.contains('show');
  g._closeChest();
  return { shown };
});
check(mega.shown, 'openMegaboxReward → церемонія скрині', String(mega.shown));

console.log('▸ v294: соло-церемонія МОРОЗИТЬ сим (постріли не ковтаються, зомбі стоять)');
const freeze = await page.evaluate(() => {
  const g = window.__game;
  const Z = g.level.zombies;
  g._closeChest && g._closeChest();
  for (const z of [...Z.list]) { z.gone = true; Z.scene.remove(z.rig.group); Z.byNidMap.delete(z.nid); }
  Z.list = [];
  const zb = Z.spawn('walker', g.level.player.pos.x + 8, g.level.player.pos.z, {});
  zb.aggroed = true; zb.state = 'chase';
  const t0 = g.level.stats.time;
  const x0 = zb.x, z0 = zb.z;
  g.chestCeremony({ title: '🎁 ТЕСТ', items: [{ icon: '🪙', n: 50 }] }); // _chestState виставлено
  const chestOpen = !!g._chestState;
  for (let i = 0; i < 10; i++) g._step(0.1, true); // сим має бути заморожений (blocked)
  const tFrozen = g.level.stats.time;
  const movedFrozen = Math.hypot(zb.x - x0, zb.z - z0);
  g._closeChest();
  for (let i = 0; i < 10; i++) g._step(0.1, true); // після закриття сим знову йде
  const tAfter = g.level.stats.time;
  const movedAfter = Math.hypot(zb.x - x0, zb.z - z0);
  return { chestOpen, t0, tFrozen, tAfter, movedFrozen, movedAfter };
});
check(freeze.chestOpen, 'церемонія відкрита (_chestState виставлено)', String(freeze.chestOpen));
check(Math.abs(freeze.tFrozen - freeze.t0) < 1e-6, 'час рівня НЕ рухається під час церемонії', JSON.stringify(freeze));
check(freeze.movedFrozen < 1e-3, 'зомбі СТОЇТЬ доки церемонія відкрита (сим заморожено)', String(freeze.movedFrozen));
check(freeze.tAfter > freeze.tFrozen + 0.5 && freeze.movedAfter > 0.1, 'після закриття сим знову йде (час тикає, зомбі рушив)', JSON.stringify(freeze));

console.log('▸ v295: клавіатурний скіп церемонії (пробіл) працює без миші/pointer lock');
const kbSkip = await page.evaluate(() => {
  const g = window.__game;
  g._closeChest && g._closeChest();
  g.chestCeremony({ title: '🎁 ТЕСТ', items: [{ icon: '🪙', n: 5 }] });
  const root = document.getElementById('chest-ceremony');
  const shown = root.classList.contains('show');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); // 1-ше: burst/скіп анімації
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); // 2-ге: закриття
  return { shown, closed: !root.classList.contains('show'), stateGone: !g._chestState };
});
check(kbSkip.shown, 'церемонія показалась перед клавіатурним скіпом', String(kbSkip.shown));
check(kbSkip.closed && kbSkip.stateGone, 'подвійний Space пропускає й закриває церемонію', JSON.stringify(kbSkip));

console.log('▸ v294: у коопі openMegaboxReward показує БАНЕР, не блокуючу церемонію');
const coopMega = await page.evaluate(() => {
  const g = window.__game;
  g._closeChest && g._closeChest();
  const realNet = g.level.net;
  g.level.net = { authority: false }; // стаб коопу (реальні кооп-шляхи покриває coop.mjs)
  let bannerCalled = null;
  const origBanner = g.hud.banner.bind(g.hud);
  g.hud.banner = (title, sub, dur) => { bannerCalled = { title, sub, dur }; return origBanner(title, sub, dur); };
  g._megaForce = 0.5; // фонтан монет
  g.openMegaboxReward(g.level.player.pos.x, g.level.player.pos.z);
  const ceremonyShown = document.getElementById('chest-ceremony').classList.contains('show');
  g.hud.banner = origBanner;
  g.level.net = realNet;
  g._closeChest();
  return { bannerCalled: !!bannerCalled, banner: bannerCalled, ceremonyShown };
});
check(coopMega.bannerCalled, 'кооп-мегабокс → hud.banner викликано (неблокуючий до-v287 шлях)', JSON.stringify(coopMega.banner));
check(!coopMega.ceremonyShown, 'кооп-мегабокс НЕ показує fullscreen-церемонію', String(coopMega.ceremonyShown));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ЕЛІТНА ХВИЛЯ + СКРИНЯ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
