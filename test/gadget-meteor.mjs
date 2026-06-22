// ☄️ Гаджет «Метеорит»: викликає метеорит на НАЙБЛИЖЧОГО зомбі — 135 шкоди згори
// (обходить фронтальний щит і нагрудник). Перезарядка 45с.
import { chromium } from 'playwright';
const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Гаджет «Метеорит» (нагорода Зоряного шляху 33)');
const meta = await page.evaluate(async () => {
  const { GADGETS } = await import('/src/extras.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const { PASS_REWARDS, PASS_MAX_LEVEL } = await import('/src/progress.js');
  const G = GADGETS.meteor; const r33 = PASS_REWARDS[33];
  return {
    meta: G && { cd: G.cd, icon: G.icon },
    inShop: SHOP_ITEMS.some((i) => i.id === 'meteor'),
    cap: PASS_MAX_LEVEL,
    reward33: r33 && { type: r33.type, id: r33.id },
  };
});
check(meta.meta && meta.meta.cd === 45 && meta.meta.icon === '☄️', 'мета гаджета: 45с cd, ☄️', JSON.stringify(meta.meta));
check(meta.cap === 33, 'Зоряний шлях продовжено до 33', String(meta.cap));
check(!meta.inShop, 'метеорит НЕ продається в магазині (лише нагорода шляху)');
check(meta.reward33 && meta.reward33.type === 'gadget' && meta.reward33.id === 'meteor', 'нагорода рівня 33 = гаджет «Метеорит»', JSON.stringify(meta.reward33));

// 🎖️ розблокування: рівень 33 видає метеорит БЕЗКОШТОВНО (як лазер@28)
const grant = await page.evaluate(() => {
  const g = window.__game;
  g.save.xp = 0;
  const before = g.save.gadgetsOwned.includes('meteor');
  g.test.addXp(30000); // > сумарного XP до рівня 33
  return { before, level: g.progress.level, owned: g.save.gadgetsOwned.includes('meteor') };
});
check(grant.level >= 33, `досягнуто рівня 33 (${grant.level})`);
check(!grant.before && grant.owned, 'рівень 33 ВИДАВ гаджет «Метеорит» безкоштовно', JSON.stringify(grant));

// === удар: 135 рівно по найближчому зомбі ===
const hit = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  g.test.unlockGadget('meteor'); g.test.gadgetCdReset();
  // ставимо tank (230 HP — переживе 135) впритул, щоб він був найближчим
  const tank = g.level.zombies.spawn('tank', p.pos.x + 2, p.pos.z + 1, {});
  // знаходимо найближчого тією ж логікою, що й гаджет
  let near = null, bd = 1e9;
  for (const zb of g.level.zombies.list) { if (zb.state === 'dead') continue; const d = Math.hypot(zb.x - p.pos.x, zb.z - p.pos.z); if (d < bd) { bd = d; near = zb; } }
  const nid = near.nid, hp0 = near.hp, isTank = near === tank;
  g.test.useGadget();
  const flying = g.level.effects._meteors.length;
  for (let i = 0; i < 9; i++) g.level.effects.update(0.15); // >0.85с — приземлення
  const after = g.level.zombies.byNid(nid);
  return { flying, isTank, dmg: hp0 - (after ? after.hp : hp0), landed: g.level.effects._meteors.length };
});
check(hit.flying >= 1, 'метеорит вилетів (у польоті)', JSON.stringify(hit));
check(hit.dmg === 135, 'завдав рівно 135 шкоди найближчому', JSON.stringify(hit));
check(hit.landed === 0, 'метеорит приземлився (зник із польоту)', JSON.stringify(hit));

// === обхід щита: падіння згори ігнорує фронтальний щит ===
const shield = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  g.test.gadgetCdReset();
  // щитоносець впритул — тепер він найближчий
  const sh = g.level.zombies.spawn('shield', p.pos.x + 1, p.pos.z, {});
  const shieldHp0 = sh.shieldHp, bodyHp0 = sh.hp, nid = sh.nid;
  g.test.useGadget();
  for (let i = 0; i < 9; i++) g.level.effects.update(0.15);
  const after = g.level.zombies.byNid(nid);
  return { shieldHp0, bodyHp0, shieldHpAfter: sh.shieldHp, bodyDmg: bodyHp0 - (after ? after.hp : bodyHp0), dead: !after || after.state === 'dead' };
});
check(shield.shieldHpAfter === shield.shieldHp0, 'щит НЕ постраждав — метеорит б\'є згори, повз фронтальний щит', JSON.stringify(shield));
check(shield.bodyDmg === 135, 'тіло щитоносця отримало 135 (обхід щита)', JSON.stringify(shield));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 МЕТЕОРИТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
