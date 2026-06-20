// 🤝 F6: шкода зомбі по ОДНОМУ гравцю не залежить від розміру команди.
// Драйвимо РЕАЛЬНИЙ мелі-шлях зомбі (zombies.update → _hurt → player.takeDamage)
// у соло-рівні, фіксуємо падіння HP. Потім мокаємо level.players до 2 гравців
// (coopMul() → 2) і повторюємо: падіння HP має бути ІДЕНТИЧНИМ.
// Якщо хтось поверне `* this.coopMul()` у damage-вираз — друга доза стане ×2 і тест впаде.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';

let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

try {
  // соло-рівень України напряму
  await page.goto(`${BASE}/?test&fresh&country=UKR`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });

  // примусово завдаємо ОДИН мелі-удол walker'ом і повертаємо завдану дозу (падіння HP).
  // playersMock: null → соло (coopMul=1); масив фейкових гравців → coopMul=N.
  const measureMeleeHit = async (playersMock) =>
    page.evaluate((mock) => {
      const g = window.__game;
      const level = g.level;
      const zm = level.zombies;
      const player = level.player;

      // прибираємо все, що спотворило б читання: щит/броня/шолом/невразливість
      player.respawnProtect = 0;
      player.gadgetShield = 0;
      player.armor = 0;
      player.helmetMult = 1;
      player.buffs.bubble = 0;
      player.health = 999999;          // щоб удар не вбив і не уперся в 0
      player.maxHealth = 999999;

      // ставимо level.players (мок коопу) або лишаємо соло
      const prevPlayers = level.players;
      if (mock) {
        const p = player.pos;
        // два «гравці» в ОДНІЙ точці — walker гарантовано в радіусі удару обох
        const mk = () => ({ pos: { x: p.x, y: p.y, z: p.z }, health: 999999 });
        level.players = [mk(), mk()];
      } else {
        level.players = null;
      }
      const coopMul = zm.coopMul();

      // walker впритул до гравця
      const p = player.pos;
      const z = zm.spawn('walker', p.x + 0.3, p.z, {});
      // форсуємо стан атаки рівно перед спрацюванням удару (attackT>0.45, didHit=false)
      z.state = 'attack';
      z.attackT = 0.46;
      z.didHit = false;
      z.throwProj = false;
      z.x = p.x + 0.3; z.z = p.z;       // у радіусі attackR*1.35

      const hpBefore = player.health;
      zm.update(0.016);                  // один крок → мелі-гілка б'є
      const dealt = hpBefore - player.health;

      // прибираємо тестового зомбі, відновлюємо players
      z.state = 'dead'; z.gone = true;
      zm.list = zm.list.filter((zz) => zz !== z);
      if (zz_safe(z)) level.scene.remove(z.rig.group);
      level.players = prevPlayers;

      function zz_safe(zz) { return zz && zz.rig && zz.rig.group; }
      return { dealt: Math.round(dealt * 1000) / 1000, coopMul, didHit: z.didHit };
    }, playersMock);

  const solo = await measureMeleeHit(null);
  check(solo.coopMul === 1, `соло: coopMul()=1 (отримано ${solo.coopMul})`);
  check(solo.didHit === true, `соло: мелі-удар спрацював (didHit=${solo.didHit})`);
  check(solo.dealt > 0, `соло: walker завдав шкоди ${solo.dealt}`);

  const coop2 = await measureMeleeHit(true);
  check(coop2.coopMul === 2, `кооп-мок: coopMul()=2 (отримано ${coop2.coopMul})`);
  check(coop2.didHit === true, `кооп-мок: мелі-удар спрацював (didHit=${coop2.didHit})`);

  // ГОЛОВНА ПЕРЕВІРКА F6: при 2 гравцях шкода по одному == соло-шкоді
  check(
    Math.abs(coop2.dealt - solo.dealt) < 1e-6,
    `шкода walker не множиться на розмір команди: соло=${solo.dealt}, кооп(2)=${coop2.dealt}`
  );

  const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_|favicon/i.test(e));
  check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
  if (realErrors.length) console.log('CONSOLE ERRORS:\n' + realErrors.join('\n'));
} catch (e) {
  failed++;
  console.error('❌ ТЕСТ ВПАВ:', e.message);
} finally {
  await browser.close();
}

console.log(failed === 0 ? '\n🎉 COOP-DAMAGE: F6 ПІДТВЕРДЖЕНО' : `\n💥 COOP-DAMAGE провалів: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
