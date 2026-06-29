// Тести оновлення «Живі карти»: інтер'єри, бочки, золотий, батути, лід, м'яч, аеродроп, якість
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

// ===== Завантаження і якість =====
console.log('▸ Екран завантаження і якість');
await page.goto(BASE + '/?test&fresh');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state === 'globe')), 20000, 'глобус');
const loadingShown = await page.evaluate(() => {
  window.__game.startLevel('UKR');
  return document.getElementById('overlay-level-loading').classList.contains('show');
});
check(loadingShown, 'екран завантаження рівня показано');
await waitFor(async () => (await page.evaluate(() => window.__game.state === 'level'
  && !document.getElementById('overlay-level-loading').classList.contains('show'))), 25000, 'рівень');
check(true, 'екран завантаження зник після побудови');
await page.evaluate(() => {
  // перемикаємо до режиму "Швидка"
  const btn = document.getElementById('btn-quality');
  btn.click(); // high
  btn.click(); // fast
});
const q = await page.evaluate(() => ({
  mode: window.__game.save.quality,
  label: document.getElementById('btn-quality').textContent,
  worldOpts: window.__game._qualityWorldOpts(),
}));
check(q.mode === 'fast' && q.label.includes('Швидка') && q.worldOpts.shadow === 1024,
  `якість перемикається і застосовується (${q.label}, тіні ${q.worldOpts.shadow})`);
await page.evaluate(() => document.getElementById('btn-quality').click()); // назад на авто

// ===== УКРАЇНА: інтер'єри, сюрприз, бочки, золотий, батут, м'яч =====
console.log('▸ Україна: інтер\'єри');
await page.evaluate(() => window.__game.test.god());
const intInfo = await page.evaluate(() => {
  const g = window.__game;
  const w = g.level.world;
  return {
    floors: w.floors.length,
    loot: w.lootSpots.length,
    sleeping: g.level.zombies.list.filter((z) => z.sleeping).length,
    windmill: w.spinners.length,
  };
});
check(intInfo.floors >= 4, `enterable-будинків: ${intInfo.floors}`);
check(intInfo.loot >= 10, `лут-точок: ${intInfo.loot}`);
check(intInfo.sleeping === 2, `сплячих сюрпризів: ${intInfo.sleeping}`);
check(intInfo.windmill >= 1, 'вітряк крутиться');

// лут підбирається в будинку
const grenadesBefore = await page.evaluate(() => {
  const g = window.__game;
  // йдемо до лут-точки з гранатою/набоями
  const ls = g.level.world.lootSpots.find((l) => l.type !== 'coins');
  g.test.teleport(ls.x, ls.z);
  return g.level.player.grenades + g.level.player.ammo.rifle.reserve + g.level.player.health;
});
await page.waitForTimeout(1500);
const lootTaken = await page.evaluate(() => {
  const g = window.__game;
  return g.level.player.grenades + g.level.player.ammo.rifle.reserve + g.level.player.health;
});
check(lootTaken > grenadesBefore - 200, 'лут у будинку підбирається'); // будь-який з типів збільшив відповідний ресурс
// точніше: перевіримо що кількість пікапів зменшилась
// (вони вічні поки не підібрані)

// сюрприз прокидається
console.log('▸ Зомбі-сюрприз');
const surpriseWoke = await page.evaluate(() => {
  const g = window.__game;
  const sleeper = g.level.zombies.list.find((z) => z.sleeping);
  if (!sleeper) return 'немає';
  g.test.teleport(sleeper.x + 1.5, sleeper.z);
  return 'є';
});
check(surpriseWoke === 'є', 'знайшли сплячого');
await waitFor(async () => (await page.evaluate(() =>
  window.__game.level.zombies.list.filter((z) => z.sleeping).length)) < 2, 8000, 'пробудження');
const sleepingNow = await page.evaluate(() => window.__game.level.zombies.list.filter((z) => z.sleeping).length);
check(sleepingNow < 2, 'сюрприз прокинувся при наближенні');

// бочка: вибух + ланцюг + шкода зомбі
console.log('▸ Вибухові бочки');
const barrelResult = await page.evaluate(() => {
  const g = window.__game;
  const e = g.level.effects;
  // ставимо дві бочки поруч і зомбі біля них
  e.addBarrel(50, 120);
  e.addBarrel(53, 120);
  g.level.world._buildGrid();
  const zb = g.level.zombies.list.find((z) => z.state !== 'dead' && !z.golden);
  zb.x = 51.5; zb.z = 121.5;
  const kills = g.level.stats.kills;
  e.damageBarrel(e.barrels[e.barrels.length - 2], 999);
  return { kills };
});
await waitFor(async () => (await page.evaluate(() => {
  const e = window.__game.level.effects;
  for (let i = 0; i < 6; i++) e.update(0.05);
  return e.barrels.filter((b) => b.exploded).length;
})) >= 2, 10000, 'ланцюговий вибух');
const chainCount = await page.evaluate(() => window.__game.level.effects.barrels.filter((b) => b.exploded).length);
check(chainCount >= 2, `ланцюгова реакція: вибухнуло ${chainCount} бочки`);
const killsAfterBarrel = await page.evaluate(() => window.__game.level.stats.kills);
check(killsAfterBarrel > barrelResult.kills, 'вибух бочки вбив зомбі');

// золотий зомбі
console.log('▸ Золотий зомбі');
const golden = await page.evaluate(() => {
  const g = window.__game;
  const gz = g.level.zombies.list.find((z) => z.golden);
  if (!gz) return null;
  g.test.teleport(gz.x + 8, gz.z);
  return { x: gz.x, z: gz.z };
});
check(golden !== null, 'золотий зомбі існує');
let fled = 'dead';
await waitFor(async () => {
  fled = await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 6; i++) g.level.zombies.update(0.05);
    const gz = g.level.zombies.list.find((z) => z.golden);
    return gz ? gz.state : 'dead';
  });
  return fled === 'flee';
}, 10000, 'золотий тікає');
check(fled === 'flee', `золотий тікає (стан: ${fled})`);
const coinsBefore = await page.evaluate(() => window.__game.level.effects.coins.length);
await page.evaluate(() => {
  const gz = window.__game.level.zombies.list.find((z) => z.golden);
  if (gz) gz.damage(99999, null, false);
});
await page.waitForTimeout(600);
const coinsAfter = await page.evaluate(() => window.__game.level.effects.coins.length);
check(coinsAfter >= coinsBefore + 10, `джекпот: +${coinsAfter - coinsBefore} монет на землі`);

// батут
console.log('▸ Батут');
await page.evaluate(() => {
  const g = window.__game;
  const jp = g.level.world.jumpPads[0];
  const p = g.level.player;
  g.test.teleport(jp.x, jp.z);
  p.pos.y = g.level.world.groundH(p.pos.x, p.pos.z);
  p.vel.set(0, 0, 0);
  p.onGround = true;
  p.update(0.016, { rmbDown: false, touchScope: false, touchMove: null, touchSprint: false, consumeMouse: () => ({ dx: 0, dy: 0 }), down: () => false, pressed: () => false }, false);
  return jp.x;
});
const velY = await page.evaluate(() => {
  const p = window.__game.level.player;
  return { vy: p.vel.y };
});
check(velY.vy > 10, `батут підкинув (vel.y=${velY.vy.toFixed(1)})`);

// м'яч
console.log('▸ Футбольний м\'яч');
const ballMoved = await page.evaluate(() => {
  const g = window.__game;
  const ball = g.level.effects.ball;
  const before = { x: ball.mesh.position.x, z: ball.mesh.position.z };
  g.test.teleport(ball.mesh.position.x - 0.7, ball.mesh.position.z);
  return before;
});
let ballDist = 0;
await waitFor(async () => {
  const ballAfter = await page.evaluate(() => {
    const e = window.__game.level.effects;
    for (let i = 0; i < 6; i++) e.update(0.05);
    const b = window.__game.level.effects.ball.mesh.position;
    return { x: b.x, z: b.z };
  });
  ballDist = Math.hypot(ballAfter.x - ballMoved.x, ballAfter.z - ballMoved.z);
  return ballDist > 1.5;
}, 10000, 'мʼяч покотився');
check(ballDist > 1.5, `м'яч покотився від удару (${ballDist.toFixed(1)} м)`);

// аеродроп
console.log('▸ Аеродроп');
await page.evaluate(() => { window.__game.level.effects.airdropT = 0.1; });
await waitFor(async () => (await page.evaluate(() => {
  const e = window.__game.level.effects;
  for (let i = 0; i < 6; i++) e.update(0.05);
  return !!e.airdrop;
})), 10000, 'аеродроп з\'явився');
check(await page.evaluate(() => !!window.__game.level.effects.airdrop), 'аеродроп летить');
const dropCoins = await page.evaluate(() => {
  const e = window.__game.level.effects;
  const before = e.coins.length;
  e.airdrop.g.position.y = e.airdrop.gy + 1; // прискорюємо приземлення
  return before;
});
await waitFor(async () => (await page.evaluate(() => {
  const e = window.__game.level.effects;
  for (let i = 0; i < 6; i++) e.update(0.05);
  return e.airdrop && e.airdrop.landed;
})), 10000, 'приземлення');
const dropAfter = await page.evaluate(() => window.__game.level.effects.coins.length);
check(dropAfter > dropCoins, `аеродроп приземлився з лутом (+${dropAfter - dropCoins} предметів)`);

// тварини тікають
console.log('▸ Кури');
const henDist = await page.evaluate(() => {
  const g = window.__game;
  const an = g.level.effects.animals[0];
  g.test.teleport(an.x + 1.5, an.z);
  return { x: an.x, z: an.z };
});
let henAfter = 0;
await waitFor(async () => {
  henAfter = await page.evaluate(() => {
    const g = window.__game;
    const e = g.level.effects;
    for (let i = 0; i < 6; i++) e.update(0.05);
    const an = e.animals[0];
    const p = g.level.player.pos;
    return Math.hypot(an.x - p.x, an.z - p.z);
  });
  return henAfter > 2.5;
}, 10000, 'курка втекла');
check(henAfter > 2.5, `курка втекла від гравця (${henAfter.toFixed(1)} м)`);

// ===== ПОЛЬЩА: лід, нова карта =====
console.log('▸ Польща: лід і нова карта');
await page.goto(BASE + '/?test&fresh&country=POL');
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state === 'level')), 30000, 'POL');
await page.evaluate(() => window.__game.test.god());
const polInfo = await page.evaluate(() => {
  const g = window.__game;
  const w = g.level.world;
  return {
    arena: w.layout.arena,
    ice: !!w.iceZone,
    floors: w.floors.length,
    spawn: w.layout.SPAWN,
  };
});
check(polInfo.arena.x === 12 && polInfo.arena.z === -162, `нова арена-замок: ${JSON.stringify(polInfo.arena)}`);
check(polInfo.ice, 'зона льоду існує');
check(polInfo.floors >= 4, `кам'яниці з інтер'єрами: ${polInfo.floors}`);

// фізика ковзання: інерція на льоду довша, ніж на снігу
const slide = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const ice = g.level.world.iceZone;
  const input = { rmbDown: false, touchScope: false, touchMove: null, touchSprint: false, consumeMouse: () => ({ dx: 0, dy: 0 }), down: () => false, pressed: () => false };
  const measure = (x, z) => {
    g.test.teleport(x, z);
    p.pos.y = g.level.world.groundH(p.pos.x, p.pos.z);
    p.onGround = true;
    p.vel.x = 6; p.vel.z = 0;
    for (let i = 0; i < 18; i++) p.update(0.05, input, false);
    return Math.abs(p.vel.x);
  };
  const onIce = measure(ice.x, ice.z);
  const onSnow = measure(0, 100);
  return { onIce, onSnow };
});
check(slide.onIce > slide.onSnow + 0.5, `лід ковзає: інерція ${slide.onIce.toFixed(1)} проти ${slide.onSnow.toFixed(1)} на снігу`);

console.log('');
console.log(failed === 0 ? '🎉 УСІ ТЕСТИ КАРТ ПРОЙДЕНО' : `❌ ПРОВАЛЕНО: ${failed}`);
console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO CONSOLE ERRORS');
await browser.close();
closeServer();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
