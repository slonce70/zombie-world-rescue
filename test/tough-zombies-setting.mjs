import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Пресет «Екстремальна» вмикає живучих зомбі');
const setting = await page.evaluate(() => {
  const g = window.__game;
  const btn = document.querySelector('[data-difficulty="extreme"]');
  const before = {
    exists: !!btn,
    save: !!g.save.toughZombies,
  };
  if (btn) btn.click();
  const afterOn = {
    save: !!g.save.toughZombies,
    strong: !!g.save.strongZombies,
    stored: JSON.parse(localStorage.getItem('zr-save-v1') || '{}').toughZombies,
    pressed: btn?.getAttribute('aria-pressed'),
  };
  document.querySelector('[data-difficulty="hard"]')?.click();
  const afterOff = {
    save: !!g.save.toughZombies,
    stored: JSON.parse(localStorage.getItem('zr-save-v1') || '{}').toughZombies,
  };
  return { before, afterOn, afterOff };
});
check(setting.before.exists && !setting.before.save, 'пресет існує, живучі зомбі стартують вимкнено', JSON.stringify(setting.before));
check(setting.afterOn.save === true && setting.afterOn.strong === true && setting.afterOn.stored === true && setting.afterOn.pressed === 'true',
  'Екстремальна вмикає сильних і живучих зомбі та зберігає сейв', JSON.stringify(setting.afterOn));
check(setting.afterOff.save === false && setting.afterOff.stored === false,
  'Складна залишає сильних, але вимикає живучих зомбі', JSON.stringify(setting.afterOff));

const hp = await page.evaluate(() => {
  const g = window.__game;
  const Z = g.level.zombies;
  const p = g.level.player;
  const clear = () => {
    for (const z of [...Z.list]) {
      z.gone = true;
      if (z.rig && z.rig.group && z.rig.group.parent) z.rig.group.parent.remove(z.rig.group);
    }
    Z.list = [];
    Z.boss = null;
  };
  const spawnHp = (type, tough) => {
    g.save.toughZombies = tough;
    clear();
    const z = g.test.spawnZombie(type, p.pos.x + 8, p.pos.z);
    return { hp: z.hp, maxHp: z.maxHp, statsHp: z.stats.hp };
  };
  const bossHp = (tough) => {
    g.save.toughZombies = tough;
    clear();
    const b = Z.spawnBoss();
    return { hp: b.hp, maxHp: b.maxHp, statsHp: b.stats.hp };
  };
  return {
    walker: { off: spawnHp('walker', false), on: spawnHp('walker', true) },
    tank: { off: spawnHp('tank', false), on: spawnHp('tank', true) },
    robot: { off: spawnHp('robot', false), on: spawnHp('robot', true) },
    boss: { off: bossHp(false), on: bossHp(true) },
  };
});
for (const [type, res] of Object.entries(hp)) {
  check(res.on.maxHp === res.off.maxHp + 100 && res.on.hp === res.off.hp + 100 && res.on.statsHp === res.on.maxHp,
    `${type}: живучі зомбі додають +100 HP`, JSON.stringify(res));
}

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ЖИВУЧІ ЗОМБІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
