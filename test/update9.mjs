// 🏆 Тести оновлення 9 «Ліга Шторму»: турель, щит-50, кооп-шторм передумови,
// нагороди, пасс-30, арена босів (блоки додаються по ходу)
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { mkdirSync } from 'fs';

const { base: BASE, close: closeServer } = await ensureWebServer();
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failed = 0;
const check = (ok, name) => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) failed++;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

// чекаємо N СИМУЛЯЦІЙНИХ секунд (SwiftShader під навантаженням повзе нерівно)
const simSleep = async (secs, timeout = 90000) => {
  const t0 = await page.evaluate(() => window.__game.level.stats.time);
  await page.waitForFunction((tt) => window.__game.level && window.__game.level.stats.time > tt, t0 + secs, { timeout });
};
// прогрів: чекаємо, поки рендер розженеться
const warmUp = async () => {
  await page.waitForFunction(() => window.__game.fps > 8, null, { timeout: 60000 }).catch(() => {});
};

// ===== 🤖 ТУРЕЛЬ =====
console.log('▸ Гаджет «Турель»');
await page.goto(`${BASE}/?test&fresh&country=UKR`);
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 40000 });
await warmUp();

const shopT = await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  g.test.giveCoins(1000);
  const before = g.save.coins;
  g.test.shopBuy('turret');
  return {
    owned: g.save.gadgetsOwned.includes('turret'),
    spent: before - g.save.coins,
  };
});
check(shopT.owned && shopT.spent === 1000, `купується в магазині за 1000₴ (витрачено ${shopT.spent})`);

const place = await page.evaluate(() => {
  const g = window.__game;
  g.save.activeGadget = 'turret';
  g.test.gadgetCdReset();
  g.test.useGadget();
  const t = g.level.gadgets.turrets[0];
  return t ? { hp: t.hp, life: t.life, n: g.level.gadgets.turrets.length } : null;
});
check(place && place.n === 1 && place.hp === 120 && place.life === 30, `ставиться (HP ${place && place.hp}, життя ${place && place.life}с)`);

// турель сама вбиває зомбі поруч (140 HP волоцюга ≤ 5с при 28 DPS... 70 базових HP UKR)
await page.evaluate(() => {
  const g = window.__game;
  const t = g.level.gadgets.turrets[0];
  window.__tz = g.test.spawnZombie('walker', t.x + 6, t.z);
  window.__tz.sleeping = false;
  window.__tzHp0 = window.__tz.hp;
  window.__tzKills0 = g.level.stats.kills;
});
await simSleep(1.5);
const hpMid = await page.evaluate(() => window.__tz.hp);
await simSleep(4.5);
const turretKill = await page.evaluate(() => ({
  hp0: window.__tzHp0,
  hpMid: window.__tzMidSaved ?? window.__tz.hp,
  dead: window.__tz.state === 'dead',
  kills: window.__game.level.stats.kills - window.__tzKills0,
}));
turretKill.hpMid = hpMid;
check(turretKill.hpMid < turretKill.hp0, `турель стріляє (HP зомбі ${turretKill.hp0} → ${turretKill.hpMid})`);
check(turretKill.dead && turretKill.kills === 1, 'турель добиває зомбі, кіл зараховано власнику');

// далекий зомбі (за межами 14м) — у безпеці
await page.evaluate(() => {
  const g = window.__game;
  const t = g.level.gadgets.turrets[0];
  window.__fz = g.test.spawnZombie('walker', t.x + 20, t.z);
  window.__fzHp0 = window.__fz.hp;
});
await simSleep(1.5);
const farSafe = await page.evaluate(() => {
  const ok = window.__fz.hp === window.__fzHp0;
  window.__fz.damage(99999, null, false);
  return { ok };
});
check(farSafe.ok, 'поза радіусом 14м не дістає');

// друга турель замінює першу (одна активна)
const oneActive = await page.evaluate(() => {
  const g = window.__game;
  g.test.gadgetCdReset();
  g.test.useGadget();
  return g.level.gadgets.turrets.length;
});
check(oneActive === 1, 'друга турель замінює першу (одна активна)');

// строк життя 30с вичерпується
await page.evaluate(() => { window.__game.level.gadgets.turrets[0].life = 0.4; });
await simSleep(1.0);
const expire = await page.evaluate(() => window.__game.level.gadgets.turrets.length);
check(expire === 0, 'після завершення часу турель зникає');

// ===== 🛡️ ЩИТ-50 =====
console.log('▸ Щит (нерф 255 → 50)');
const shield = await page.evaluate(() => {
  const g = window.__game;
  if (!g.save.gadgetsOwned.includes('shield')) g.test.unlockGadget('shield');
  g.save.activeGadget = 'shield';
  g.test.gadgetCdReset();
  g.test.useGadget();
  const p = g.level.player;
  const charge = p.gadgetShield;
  p.respawnProtect = 0;
  const hp0 = p.health;
  p.takeDamage(30, p.pos.x + 1, p.pos.z); // повністю в щит
  const afterSmall = { shield: p.gadgetShield, hp: p.health };
  p.takeDamage(40, p.pos.x + 1, p.pos.z); // 20 у щит, 20 в тіло (повз броню/шолом базово)
  return { charge, hp0, afterSmall, final: { shield: p.gadgetShield, hp: Math.round(p.health) } };
});
check(shield.charge === 50, `щит заряджається на 50 (${shield.charge})`);
check(shield.afterSmall.shield === 20 && shield.afterSmall.hp === shield.hp0, 'малий удар повністю з\'їдає щит');
check(shield.final.shield === 0 && shield.final.hp < shield.hp0, 'великий удар пробиває залишок щита в здоров\'я');

// ===== 🎖️ ПАСС ДО 30 + НОВА КОСМЕТИКА =====
console.log('▸ Зоряний шлях до стелі і косметика');
const pass = await page.evaluate(async () => {
  const g = window.__game;
  const { PASS_MAX_LEVEL } = await import('/src/progress.js');
  g.test.addXp(50000); // вистачає на стелю шляху
  return {
    level: g.progress.level,
    cap: PASS_MAX_LEVEL, // звіряємо з джерелом, не з літералом — не флакає при зміні стелі
    legend: g.save.skins.includes('legend'),
    neon: g.save.tracers.includes('neon'),
    royal: g.save.tracers.includes('royal'),
  };
});
check(pass.level === pass.cap, `рівень досягає стелі пасса (${pass.level}/${pass.cap})`);
check(pass.legend, 'рівень 25 видав скін «Легенда»');
check(pass.neon && pass.royal, 'нові трасери «Неон» і «Королівські» видано');

// нові скіни й танець рендеряться без помилок
const cosmetics = await page.evaluate(async () => {
  const g = window.__game;
  const slp = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const id of ['hunter', 'thunder', 'legend']) {
    g.test.setSkin(id);
    g.level.player.firstPerson = false;
    g.level.player._applyView();
    await slp(150);
  }
  g.test.setDance('lightning');
  g.test.dance();
  await slp(400);
  const dancing = g.level.player.emoting === 'lightning';
  g.test.stopDance();
  return { dancing };
});
check(cosmetics.dancing, 'танець «Блискавка» працює');

// ===== ⛈️ МАЙЛСТОУНИ ШТОРМУ =====
console.log('▸ Нагороди Шторму');
await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated.UKR = true;
  g.saveGame();
  g.endLevel();
  g.test.startStorm('UKR');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level.storm, null, { timeout: 40000 });
await warmUp();
const milestones = await page.evaluate(() => {
  const g = window.__game;
  g.level.storm.wave = 12; // ніби дожили до 12-ї
  const p = g.level.player;
  p.respawnProtect = 0;
  p.takeDamage(99999, p.pos.x + 1, p.pos.z);
  return {
    storm: g.save.tracers.includes('storm'),
    lightning: g.save.dances.includes('lightning'),
    hunter: g.save.skins.includes('hunter'),
    thunder: g.save.skins.includes('thunder'),
    flags: { ...g.save.stormRewards },
  };
});
check(milestones.storm && milestones.lightning && milestones.hunter, 'хвиля 12 видала трасер+танець+скін «Мисливець»');
check(!milestones.flags.thunder, 'нагорода «Громовідвід» ще закрита (треба хвилю 16)');

// ===== 👑 АРЕНА БОСІВ =====
console.log('▸ Арена босів');
await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, SWE: true, EGY: true, JPN: true, CHN: true };
  g.saveGame();
  g.test.startArena();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level.bossRush, null, { timeout: 40000 });
await warmUp();
await page.evaluate(() => window.__game.test.god());
// перший бос виходить після короткої паузи
await page.waitForFunction(() => window.__game.level.zombies.boss, null, { timeout: 30000 });
const firstBoss = await page.evaluate(() => ({
  style: window.__game.level.zombies.boss.bossStyle,
  hp: window.__game.level.zombies.boss.maxHp,
}));
check(firstBoss.style === 'king', `перший бос — Король (${firstBoss.style})`);
check(firstBoss.hp === Math.round(1800 * 0.8), `HP наростання: 80% від базового (${firstBoss.hp})`);

// проходимо всіх босів кампанії
const arenaRun = await page.evaluate(async () => {
  const g = window.__game;
  const { CAMPAIGN_ORDER } = await import('/src/countries.js');
  const slp = (ms) => new Promise((r) => setTimeout(r, ms));
  const styles = [];
  // реальний забіг триває хвилини — симулюємо чесний час, щоб пройти sanity Ліги
  g.level.stats.time = 95;
  const t0 = Date.now();
  while (g.level && g.level.bossRush && !g.level.bossRush.over && Date.now() - t0 < 120000) {
    const b = g.level.zombies.boss;
    if (b && b.state !== 'dead') {
      styles.push(b.bossStyle);
      g.test.damageBoss(999999);
    }
    // прискорюємо перерви
    if (g.level.bossRush.state === 'break') g.level.bossRush.breakT = Math.min(g.level.bossRush.breakT, 0.3);
    await slp(350);
  }
  return {
    styles: [...new Set(styles)],
    over: g.level.bossRush.over,
    completed: g.level.bossRush.completed,
    best: g.save.arenaBest,
    overlay: document.getElementById('overlay-arena-end').classList.contains('show'),
    bossText: document.querySelector('#arena-stats .stat .stat-val')?.textContent || '',
    total: CAMPAIGN_ORDER.length,
  };
});
check(arenaRun.over && arenaRun.completed, `усі ${arenaRun.total} босів переможено — забіг завершено`);
check(arenaRun.styles.length === 10, `усі стилі босів зустрілись (${arenaRun.styles.join(',')})`);
check(arenaRun.best > 0, `рекорд часу записано (${Math.round(arenaRun.best / 1000)}с)`);
check(arenaRun.overlay, 'фінальний екран Арени показано');
check(arenaRun.bossText === `${arenaRun.total} / ${arenaRun.total}`, `фінальний екран Арени показує ${arenaRun.total} босів (${arenaRun.bossText})`);
const arenaPlace = await page.waitForFunction(() => {
  const t = document.getElementById('arena-league-place').textContent;
  return t.includes('#') ? t : false;
}, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
check(!!arenaPlace, `результат у Лізі (${arenaPlace || 'нема'})`);
await page.screenshot({ path: 'shots/u9-arena-end.png' });

console.log('');
const realErrors = errors.filter((e) => !e.includes('favicon'));
if (realErrors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of realErrors.slice(0, 10)) console.log('  ', e);
  failed += realErrors.length;
} else {
  console.log('✅ Без помилок у консолі');
}
console.log(failed === 0 ? '🎉 БЛОК ТУРЕЛЬ/ЩИТ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
