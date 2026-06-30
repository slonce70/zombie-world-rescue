import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Зомбі в перчатках: стати');
const cfg = await page.evaluate(() => {
  const g = window.__game;
  const z = g.test.spawnZombie('boxer', g.level.player.pos.x + 8, g.level.player.pos.z);
  return {
    type: z.type,
    ztype: z.rig.ztype,
    hp: z.hp,
    maxHp: z.maxHp,
    dmg: z.stats.dmg,
    punchEvery: z.stats.punchEvery,
    punchPush: z.stats.punchPush,
  };
});
check(cfg.type === 'boxer' && cfg.ztype === 'boxer', 'spawn(boxer) будує зомбі в перчатках', JSON.stringify(cfg));
check(cfg.hp === 125 && cfg.maxHp === 125, 'має 125 HP', JSON.stringify(cfg));
check(cfg.dmg === 7 && cfg.punchEvery === 3 && cfg.punchPush === 5, '7 шкоди, кожна 3 атака відштовхує на 5м', JSON.stringify(cfg));

console.log('▸ Третя атака відштовхує гравця');
const playerHit = await page.evaluate(() => {
  const g = window.__game;
  const Z = g.level.zombies;
  const p = g.level.player;
  for (const z of Z.list) z.state = 'dead';
  g.test.teleport(0, 0);
  p.maxHealth = 300; p.health = 300; p.armor = 0; p.gadgetShield = 0; p.respawnProtect = 0; p.vel.set(0, 0, 0);
  const z = g.test.spawnZombie('boxer', 0, -1.4);
  const hit = () => { z.state = 'attack'; z.attackT = 0; z.didHit = false; Z.update(0.3); };
  const z0 = p.pos.z;
  hit(); hit();
  const after2 = { hp: p.health, z: p.pos.z };
  hit();
  return { hp: p.health, z0, after2, after3: p.pos.z, hits: z.punchHits || 0 };
});
check(playerHit.after2.hp === 286 && Math.abs(playerHit.after2.z - playerHit.z0) < 0.2,
  'перші 2 атаки тільки наносять шкоду', JSON.stringify(playerHit));
check(playerHit.hp === 279 && playerHit.after3 - playerHit.after2.z >= 4.8 && playerHit.hits === 3,
  '3 атака відштовхує гравця приблизно на 5м', JSON.stringify(playerHit));

console.log('▸ Третя атака відштовхує клона');
const cloneHit = await page.evaluate(() => {
  const g = window.__game;
  const Z = g.level.zombies;
  for (const z of Z.list) z.state = 'dead';
  g.test.teleport(40, 40);
  const clone = { x: 0, y: g.level.world.groundH(0, 0), z: 0, hp: 100, takeDamage(d) { this.hp -= d; } };
  g.level.gadgets.clones = [clone];
  const z = g.test.spawnZombie('boxer', 0, -1.4);
  const hit = () => { z.state = 'attack'; z.attackT = 0; z.didHit = false; Z.update(0.3); };
  hit(); hit();
  const after2 = { hp: clone.hp, z: clone.z };
  hit();
  return { hp: clone.hp, after2, after3: clone.z, hits: z.punchHits || 0 };
});
check(cloneHit.after2.hp === 86 && Math.abs(cloneHit.after2.z) < 0.2,
  'перші 2 атаки по клону тільки наносять шкоду', JSON.stringify(cloneHit));
check(cloneHit.hp === 79 && cloneHit.after3 - cloneHit.after2.z >= 4.8 && cloneHit.hits === 3,
  '3 атака відштовхує клона приблизно на 5м', JSON.stringify(cloneHit));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЗОМБІ В ПЕРЧАТКАХ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
