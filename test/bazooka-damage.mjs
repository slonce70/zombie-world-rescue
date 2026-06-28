import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1024, height: 768 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, x = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${x ? ' ' + x : ''}`); if (!ok) failed++; };
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

const result = await page.evaluate(async () => {
  const THREE = await import('three');
  const g = window.__game;
  const L = g.level;
  const spawnVictim = (x) => {
    const z = L.zombies.spawn('walker', x, 0, {});
    z.hp = 2000;
    z.maxHp = 2000;
    z.shieldHp = 0;
    z.chestHp = 0;
    return z;
  };
  L.player.damageMult = 2;
  L.player.buffs.rage = 0;

  const grenade = spawnVictim(20);
  L.effects.onExplosion(grenade.x, grenade.y, grenade.z, 4.5, 220, 1);
  const grenadeDrop = 2000 - grenade.hp;

  const rocket = spawnVictim(30);
  L.effects._explodeAt(new THREE.Vector3(rocket.x, rocket.y, rocket.z), 4.5, 440, { finalDamage: true });
  const rocketDrop = 2000 - rocket.hp;

  return { grenadeDrop, rocketDrop };
});

check(result.grenadeDrop === 440, 'звичайний вибух масштабується player.damageMult один раз', JSON.stringify(result));
check(result.rocketDrop === 440, 'finalDamage ракети не множиться вдруге', JSON.stringify(result));

const realErrors = errors.filter((e) => !/Failed to load resource|status of \d{3}|net::|ERR_/i.test(e));
check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`);
if (realErrors.length) console.log(realErrors.join('\n'));

await browser.close();
process.exit(failed === 0 && realErrors.length === 0 ? 0 : 1);
