// 🪬 Зомбі-шаман + тотем безсмертя:
//  - шаман (125 HP) воскресає ОДИН раз (перша смерть не вбиває), друга — вбиває;
//  - тотем-пікап будується й дає гравцю заряд воскресіння;
//  - гравець із тотемом воскресає замість гинути (раз), потім гине.
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

// POL: difficulty.dmg 1.15 > 1 → шаман дозволений (гейт як у привида)
await page.goto(`${BASE}/?test&fresh&country=POL`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Зомбі-шаман: воскресіння');
const shaman = await page.evaluate(async () => {
  const out = { errors: [] };
  const { TYPE_STATS } = await import('/src/zombies.js').catch(() => ({}));
  const g = window.__game; const Z = g.level.zombies;
  out.allowShaman = Z._allowShaman;        // у POL має бути true
  out.statHp = Z.list && null;
  try {
    const z = Z.spawn('shaman', g.level.player.pos.x + 20, g.level.player.pos.z, {});
    out.built = z.type === 'shaman' && z.rig.ztype === 'shaman';
    out.maxHp = z.maxHp; out.hp0 = z.hp; out.revived0 = z.revivedOnce;
    // перша «смерть» — має ВОСКРЕСНУТИ
    z.damage(99999, null, false);
    out.afterKill1 = { state: z.state, hp: z.hp, revived: z.revivedOnce };
    // друга смерть — має ЗАГИНУТИ
    z.damage(99999, null, false);
    out.afterKill2 = { state: z.state };
  } catch (e) { out.errors.push('shaman: ' + e.message); }
  // меш тотема будується без помилок
  try {
    const before = Z.list.length;
    g.level.effects.spawnPickup(g.level.player.pos.x + 3, g.level.player.pos.z + 3, 'totem');
    out.totemMeshOk = true;
  } catch (e) { out.errors.push('totem-mesh: ' + e.message); }
  return out;
});
check(shaman.allowShaman === true, 'шаман дозволений у POL (гейт dmg>1)', String(shaman.allowShaman));
check(shaman.built, 'spawn(shaman) будує риг із тотемом', shaman.errors.join('|'));
check(shaman.maxHp >= 125, 'шаман ~125 HP (×складність)', String(shaman.maxHp));
check(shaman.afterKill1 && shaman.afterKill1.state !== 'dead' && shaman.afterKill1.revived === true && shaman.afterKill1.hp === shaman.maxHp,
  '1-ша смерть → ВОСКРЕС (живий, повне HP, revivedOnce)', JSON.stringify(shaman.afterKill1));
check(shaman.afterKill2 && shaman.afterKill2.state === 'dead', '2-га смерть → загинув остаточно', JSON.stringify(shaman.afterKill2));
check(shaman.totemMeshOk, 'пікап тотема будується без помилок', shaman.errors.join('|'));

console.log('▸ Тотем безсмертя: рятунок гравця');
const revive = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  // підбір тотема через onPickup-колбек (як у реальному підборі)
  const c0 = p.reviveCharges || 0;
  g.level.effects.onPickup('totem', 1);
  const c1 = p.reviveCharges;
  // летальний удар із зарядом → має ВОСКРЕСНУТИ (не померти)
  p.respawnProtect = 0; p.health = p.maxHealth;
  let died = false; const off = () => { died = true; };
  g.level.bus.on('playerDied', off);
  p.takeDamage(99999, p.pos.x + 1, p.pos.z);
  const afterRevive = { health: p.health, charges: p.reviveCharges, protect: p.respawnProtect, died };
  // ще один летальний без заряду → має ПОМЕРТИ
  p.respawnProtect = 0; p.health = p.maxHealth; died = false;
  p.takeDamage(99999, p.pos.x + 1, p.pos.z);
  const afterDeath = { health: p.health, died };
  return { c0, c1, afterRevive, afterDeath };
});
check(revive.c1 === revive.c0 + 1, 'підбір тотема дає +1 заряд воскресіння', JSON.stringify({ c0: revive.c0, c1: revive.c1 }));
check(revive.afterRevive.health > 0 && !revive.afterRevive.died && revive.afterRevive.charges === 0 && revive.afterRevive.protect > 0,
  'тотем урятував: гравець живий (~50% HP), заряд витрачено, невразливість', JSON.stringify(revive.afterRevive));
check(revive.afterDeath.health === 0 && revive.afterDeath.died, 'без заряду — гравець гине штатно', JSON.stringify(revive.afterDeath));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 ШАМАН + ТОТЕМ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
