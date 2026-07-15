import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(ok ? '  ✅' : '  ❌', label, detail);
  if (!ok) failed++;
};

try {
  console.log('▸ Бойовий імпульс: browser integration');
  await page.goto(`${BASE}/?test&fresh&country=UKR`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
  const result = await page.evaluate(() => {
    const g = window.__game;
    const p = g.level.player.pos;
    g.test.god();
    g.level.combo.n = 0; g.level.combo.t = 0; g.level.combo.best = 0; g.level.combo.tier = 0;
    for (let i = 0; i < 20; i++) {
      const z = g.test.spawnZombie('walker', p.x + 8 + i * 0.2, p.z + 8);
      z.damage(99999, null, false);
    }
    return { combo: g.level.combo.n, tier: g.level.combo.tier, time: g.level.combo.t };
  });
  await page.waitForFunction(() => document.getElementById('combo')?.dataset.tier === '3');
  const ui = await page.evaluate(() => {
    const el = document.getElementById('combo');
    const g = window.__game;
    g.level.player.reloading = 1;
    g.level.player._updateWeaponFiring(0.1, { justClicked: false }, false);
    const reloadLeft = g.level.player.reloading;
    g.level.player.reloading = 0;
    g.level.player.cur = 'pistol';
    g.level.player.ammo.pistol.mag = 12;
    g.level.player._shoot();
    const pistolShootCd = g.level.player.shootCd;
    g.level.player.damageMult = 2;
    g.level.player.cur = 'bazooka';
    g.level.player.ammo.bazooka.mag = 1;
    g.level.player._shoot();
    const rocket = g.level.effects.rockets[g.level.effects.rockets.length - 1];
    const victim = g.test.spawnZombie('walker', g.level.player.pos.x + 20, g.level.player.pos.z);
    victim.hp = 2000; victim.maxHp = 2000; victim.shieldHp = 0; victim.chestHp = 0;
    g.level.effects.onExplosion(victim.x, victim.y, victim.z, 4.5, rocket.dmg, 1, { finalDamage: rocket.finalDamage });
    return {
      text: el.textContent,
      shown: el.classList.contains('show'),
      tier: el.dataset.tier,
      meter: el.style.getPropertyValue('--combo-left'),
      reloadLeft,
      shootCd: pistolShootCd,
      rocketDamage: rocket.dmg,
      rocketFinalDamage: rocket.finalDamage,
      rocketDrop: 2000 - victim.hp,
    };
  });
  check(result.combo === 20 && result.tier === 3 && result.time === 6, '20 убивств відкривають III поріг', JSON.stringify(result));
  check(ui.shown && ui.tier === '3' && ui.text.includes('x20') && ui.text.includes('MAX'), 'HUD показує Нестримного й MAX', ui.text);
  check(parseInt(ui.meter, 10) > 90, 'HUD показує живий таймер серії', ui.meter);
  check(Math.abs(ui.reloadLeft - 0.86) < 0.001, 'III поріг реально прискорює перезарядку ×1.4', ui.reloadLeft);
  check(Math.abs(ui.shootCd - (60 / 320 / 1.4)) < 0.001, 'III поріг реально прискорює темп вогню ×1.4', ui.shootCd);
  check(ui.rocketDamage === 660 && ui.rocketFinalDamage && ui.rocketDrop === 660,
    'базука застосовує damageMult × momentum рівно один раз', JSON.stringify({ damage: ui.rocketDamage, drop: ui.rocketDrop }));
  await page.screenshot({ path: 'test-results/combat-momentum-v504.png' });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => {
    document.body.classList.add('touch-mode');
    window.__game.hud.clearBanners();
  });
  await page.waitForTimeout(200);
  const mobile = await page.evaluate(() => {
    const combo = document.getElementById('combo').getBoundingClientRect();
    const minimap = document.getElementById('minimap').getBoundingClientRect();
    const ammo = document.getElementById('ammo').getBoundingClientRect();
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      inViewport: combo.left >= 0 && combo.right <= innerWidth && combo.top >= 0 && combo.bottom <= innerHeight,
      clearOfControls: !overlaps(combo, minimap) && !overlaps(combo, ammo),
    };
  });
  check(mobile.inViewport && mobile.clearOfControls, 'мобільний комбо-HUD у viewport і не перекриває керування', JSON.stringify(mobile));
  await page.screenshot({ path: 'test-results/combat-momentum-v504-mobile.png' });
  check(errors.length === 0, 'немає browser errors', errors.join(' | '));
} finally {
  await browser.close();
  await closeServer();
}

console.log(failed ? `\n❌ Browser: ${failed} помилок` : '\n🎉 БОЙОВИЙ ІМПУЛЬС BROWSER OK');
process.exit(failed ? 1 : 0);
