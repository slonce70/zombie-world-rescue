// 🧛 Зомбі-вампір: 150 HP, швидкий НІЧНИЙ хижак (speed 1.7 / chase 4.0, dmg 14),
// БЕЗ дальнього бою і БЕЗ щита. Зʼявляється лише вночі (nightK>0.5): нічний спавнер
// у zombies.update() підсипає вампірів навколо гравця, доки живих < cap. Удень — пауза.
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

// FRA: ніч універсальна — вампір дозволений у будь-якій країні (гейт _allowVampire=true для всіх).
await page.goto(`${BASE}/?test&fresh&country=FRA`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Зомбі-вампір: статистики + риг');
const cfg = await page.evaluate(() => {
  const out = { errors: [] };
  const g = window.__game; const Z = g.level.zombies;
  out.allowVampire = Z._allowVampire; // має бути true у КОЖНІЙ країні
  out.diffHp = Z.diff.hp;             // множник складності (FRA)
  try {
    const z = Z.spawn('vampire', g.level.player.pos.x + 24, g.level.player.pos.z, {});
    out.built = z.type === 'vampire' && z.rig.ztype === 'vampire';
    out.maxHp = z.maxHp;              // 150 × diff.hp
    out.baseHp = z.stats.hp;          // 150 (база)
    out.dmg = z.stats.dmg;            // 14
    out.speed = z.stats.speed;        // 1.7
    out.chaseSpeed = z.stats.chaseSpeed; // 4.0
    out.coins = z.stats.coins;        // 24
    out.hasRanged = !!z.ranged;       // БЕЗ дальнього
    out.hasShield = z.shieldMax > 0;  // БЕЗ щита
    out.hasChest = z.chestMax > 0;    // БЕЗ нагрудника
  } catch (e) { out.errors.push('vampire: ' + e.message); }
  return out;
});
check(cfg.allowVampire === true, 'вампір дозволений у FRA (ніч універсальна)', String(cfg.allowVampire));
check(cfg.built, 'spawn(vampire) будує риг (type+ztype=vampire)', cfg.errors.join('|'));
check(cfg.baseHp === 150, 'база 150 HP', String(cfg.baseHp));
check(cfg.maxHp === Math.round(150 * cfg.diffHp), 'maxHp = 150 × складність', `${cfg.maxHp} vs ${Math.round(150 * cfg.diffHp)}`);
check(cfg.dmg === 14, 'удар зблизька — 14 шкоди', String(cfg.dmg));
check(cfg.speed === 1.7 && cfg.chaseSpeed === 4.0, 'швидкий: speed 1.7 / chase 4.0', `${cfg.speed}/${cfg.chaseSpeed}`);
check(cfg.coins === 24, '24 монети за вбивство', String(cfg.coins));
check(!cfg.hasRanged, 'НЕМАЄ дальнього бою (ranged)', String(cfg.hasRanged));
check(!cfg.hasShield && !cfg.hasChest, 'НЕМАЄ щита/нагрудника', `sh=${cfg.hasShield} ch=${cfg.hasChest}`);

// Лічильник ЖИВИХ вампірів (трупи/прибрані не рахуємо)
async function countVamps() {
  return page.evaluate(() => window.__game.level.zombies.list
    .filter((z) => z.type === 'vampire' && z.state !== 'dead' && !z.gone).length);
}
// Прибираємо всіх вампірів перед фазою, щоб рахувати лише новонароджених
async function clearVamps() {
  await page.evaluate(() => {
    const Z = window.__game.level.zombies;
    for (const z of Z.list) if (z.type === 'vampire') { z.gone = true; Z.scene.remove(z.rig.group); Z.byNidMap.delete(z.nid); }
    Z.list = Z.list.filter((z) => !z.gone);
    if (Z._vampT !== undefined) Z._vampT = 0; // скидаємо таймер нічного спавнера (поле _vampT з конструктора)
  });
}
// Ганяємо zombies.update(dt) симульований проміжок, тримаючи задану фазу циклу.
// Великими кроками dt перескакуємо ~7с-інтервал спавнера багато разів.
async function tick(nightK, seconds = 60, step = 0.5) {
  await page.evaluate(({ nightK, seconds, step }) => {
    const g = window.__game; const Z = g.level.zombies;
    g.level.player.health = g.level.player.maxHealth; // гравець живий — умова спавну
    let t = 0;
    while (t < seconds) { g.level.nightK = nightK; Z.update(step); t += step; }
  }, { nightK, seconds, step });
}

console.log('▸ Нічний гейт: ДЕНЬ (nightK=0) — нові вампіри НЕ спавняться');
await clearVamps();
await tick(0, 60);
const dayVamps = await countVamps();
check(dayVamps === 0, 'удень нічний спавнер НЕ додає вампірів', String(dayVamps));

console.log('▸ Нічний гейт: НІЧ (nightK=1) — спавняться до cap');
await clearVamps();
await tick(1, 90); // достатньо проходів спавнера, щоб дійти cap
const nightVamps = await countVamps();
check(nightVamps > 0, 'вночі зʼявляються вампіри', String(nightVamps));
check(nightVamps <= 6, 'не більше cap=6 живих вампірів', String(nightVamps));

console.log('▸ Контроль: ВНОЧІ (nightK=1) HP вампіра СТАБІЛЬНИЙ — не горить');
await clearVamps();
const nightHpBefore = await page.evaluate(() => {
  const g = window.__game; const Z = g.level.zombies;
  const z = Z.spawn('vampire', g.level.player.pos.x + 20, g.level.player.pos.z, {});
  return z.hp;
});
await tick(1, 6); // 6с ночі
const nightHpAfter = await page.evaluate(() => {
  const Z = window.__game.level.zombies;
  const z = Z.list.find((z) => z.type === 'vampire' && z.state !== 'dead' && !z.gone);
  return z ? z.hp : -1;
});
check(nightHpAfter >= nightHpBefore - 1, 'вночі HP вампіра не падає від сонця', `${nightHpBefore} → ${nightHpAfter}`);

console.log('▸ Світанок: наявні вампіри ЗГОРАЮТЬ на сонці (HP падає → гинуть)');
await clearVamps();
await tick(1, 30); // ніч: спавнимо кілька вампірів
const beforeDawn = await countVamps();
check(beforeDawn > 0, 'вночі є кого спалювати', String(beforeDawn));
const hpBeforeDawn = await page.evaluate(() => {
  const Z = window.__game.level.zombies;
  const z = Z.list.find((z) => z.type === 'vampire' && z.state !== 'dead' && !z.gone);
  return z ? z.hp : -1;
});
await tick(0, 1); // ДЕНЬ, 1с — HP має почати падати (40dps)
const hpDayShort = await page.evaluate(() => {
  const Z = window.__game.level.zombies;
  const z = Z.list.find((z) => z.type === 'vampire' && !z.gone);
  return z ? z.hp : -1;
});
check(hpDayShort < hpBeforeDawn, 'удень HP вампіра падає від горіння', `${hpBeforeDawn} → ${hpDayShort}`);
await tick(0, 8); // ДЕНЬ, ще 8с — усі мають згоріти насмерть
const afterDay = await countVamps();
check(afterDay === 0, 'удень вампіри згоряють і гинуть (count→0)', `${beforeDawn} → ${afterDay}`);

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ЗОМБІ-ВАМПІР ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
