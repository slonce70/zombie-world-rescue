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

// === площа 7×7: 135 усім у зоні, поза зоною — нікому (детерміновано, в ізольованій точці) ===
const aoe = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  const cx = p.pos.x + 40, cz = p.pos.z + 40; // подалі від орди — лише наші tank-и
  const mk = (dx, dz) => g.level.zombies.spawn('tank', cx + dx, cz + dz, {}); // 230 HP — переживуть 135
  const list = [mk(0, 0), mk(3.4, 0), mk(3.4, 3.4), mk(5, 0)]; // центр, край, кут (у зоні), 5м (поза)
  const hp0 = list.map((z) => z.hp);
  g.level.gadgets._meteorAoE(cx, cz); // прямий удар по площі в точці (cx,cz)
  return { dmg: list.map((z, i) => hp0[i] - z.hp) };
});
check(aoe.dmg[0] === 135 && aoe.dmg[1] === 135 && aoe.dmg[2] === 135, 'усі троє в зоні 7×7 (центр/край/кут) отримали 135', JSON.stringify(aoe.dmg));
check(aoe.dmg[3] === 0, 'зомбі за межами 7×7 (5 м) НЕ постраждав', JSON.stringify(aoe.dmg));

// === обхід щита: удар згори ігнорує фронтальний щит (у зоні AoE) ===
const shield = await page.evaluate(() => {
  const g = window.__game; const p = g.level.player;
  const cx = p.pos.x - 40, cz = p.pos.z - 40;
  const sh = g.level.zombies.spawn('shield', cx, cz, {});
  const shieldHp0 = sh.shieldHp, bodyHp0 = sh.hp;
  g.level.gadgets._meteorAoE(cx, cz);
  return { shieldHp0, shieldHpAfter: sh.shieldHp, bodyDmg: bodyHp0 - sh.hp, dead: sh.state === 'dead' };
});
check(shield.shieldHpAfter === shield.shieldHp0, 'щит НЕ постраждав — метеорит б\'є згори, повз фронтальний щит', JSON.stringify(shield));
check(shield.bodyDmg === 135, 'тіло щитоносця отримало 135 (обхід щита)', JSON.stringify(shield));

// === візуал: метеорит реально вилітає й приземляється ===
const fly = await page.evaluate(() => {
  const g = window.__game;
  g.test.unlockGadget('meteor'); g.test.gadgetCdReset();
  g.level.zombies.spawn('tank', g.level.player.pos.x + 2, g.level.player.pos.z + 1, {});
  g.test.useGadget();
  const flying = g.level.effects._meteors.length;
  for (let i = 0; i < 12; i++) g.level.effects.update(0.15); // >1.3с — приземлення
  return { flying, landed: g.level.effects._meteors.length };
});
check(fly.flying >= 1, 'метеорит вилетів (у польоті)', JSON.stringify(fly));
check(fly.landed === 0, 'метеорит приземлився (зник із польоту)', JSON.stringify(fly));

console.log('');
if (errors.length) { console.log('❌ ПОМИЛКИ КОНСОЛІ:'); for (const e of errors.slice(0, 10)) console.log('  ', e); failed += errors.length; }
console.log(failed === 0 ? '🎉 МЕТЕОРИТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
