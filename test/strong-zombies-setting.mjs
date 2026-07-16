import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Налаштування «Сильні зомбі»');
const setting = await page.evaluate(() => {
  const g = window.__game;
  const btn = document.getElementById('btn-strong-zombies');
  const before = {
    exists: !!btn,
    label: btn ? btn.textContent : '',
    save: !!g.save.strongZombies,
  };
  if (btn) btn.click();
  const afterOn = {
    label: btn ? btn.textContent : '',
    save: !!g.save.strongZombies,
    stored: JSON.parse(localStorage.getItem('zr-save-v1') || '{}').strongZombies,
  };
  if (btn) btn.click();
  const afterOff = {
    label: btn ? btn.textContent : '',
    save: !!g.save.strongZombies,
    stored: JSON.parse(localStorage.getItem('zr-save-v1') || '{}').strongZombies,
  };
  return { before, afterOn, afterOff };
});
check(setting.before.exists && setting.before.label.includes('Сильні зомбі') && setting.before.label.includes('викл'),
  'кнопка є в меню і стартує вимкнено', JSON.stringify(setting.before));
check(setting.afterOn.save === true && setting.afterOn.stored === true && setting.afterOn.label.includes('увімк'),
  'натискання вмикає сильних зомбі і зберігає в сейв', JSON.stringify(setting.afterOn));
check(setting.afterOff.save === false && setting.afterOff.stored === false && setting.afterOff.label.includes('викл'),
  'повторне натискання вимикає сильних зомбі', JSON.stringify(setting.afterOff));

const damage = await page.evaluate(() => {
  const g = window.__game;
  const level = g.level;
  const gadgets = level.gadgets;
  const player = level.player;
  const clearZombies = () => {
    for (const z of level.zombies.list) z.state = 'dead';
  };
  const spawnPressure = (x, z) => {
    clearZombies();
    const zb = g.test.spawnZombie('walker', x + 0.3, z);
    zb.state = 'chase';
    zb.aggroed = true;
    zb.stats.dmg = 10;
    return zb;
  };
  const round = (n) => Math.round(n * 100) / 100;
  const run = (kind, strong) => {
    g.save.strongZombies = strong;
    clearZombies();
    if (kind === 'turret') {
      while (gadgets.turrets.length) gadgets._removeTurret(0, false);
      gadgets.placeTurretAt(player.pos.x + 2, player.pos.z, 1, false, false);
      const obj = gadgets.turrets[0];
      obj.hp = 100;
      spawnPressure(obj.x, obj.z);
      gadgets._updateTurrets(1);
      return round(100 - obj.hp);
    }
    if (kind === 'watchtower') {
      while (gadgets.towers.length) gadgets._removeWatchtower(0, false);
      gadgets.placeWatchtowerAt(player.pos.x + 4, player.pos.z, 1);
      const obj = gadgets.towers[0];
      obj.hp = 100;
      spawnPressure(obj.x, obj.z);
      gadgets._updateTowers(1);
      return round(100 - obj.hp);
    }
    if (kind === 'healtotem') {
      while (gadgets.totems.length) gadgets._removeTotem(0, false);
      g.test.unlockGadget('healtotem');
      g.save.activeGadget = 'healtotem';
      g.test.gadgetCdReset();
      g.test.useGadget();
      const obj = gadgets.totems[0];
      obj.hp = 100;
      spawnPressure(obj.x, obj.z);
      gadgets._updateTotems(1);
      return round(100 - obj.hp);
    }
    while (gadgets.damageTotems.length) gadgets._removeDamageTotem(0, false);
    g.test.unlockGadget('damagetotem');
    g.save.activeGadget = 'damagetotem';
    g.test.gadgetCdReset();
    g.test.useGadget();
    const obj = gadgets.damageTotems[0];
    obj.hp = 100;
    spawnPressure(obj.x, obj.z);
    gadgets._updateDamageTotems(1);
    return round(100 - obj.hp);
  };
  const kinds = ['turret', 'watchtower', 'healtotem', 'damagetotem'];
  const out = {};
  for (const kind of kinds) out[kind] = { off: run(kind, false), on: run(kind, true) };
  return out;
});
for (const [kind, res] of Object.entries(damage)) {
  check(res.off === 8.5 && res.on === 17 && Math.round((res.on - res.off) * 100) / 100 === 8.5,
    `${kind}: сильні зомбі дають +10 raw damage до pressure шкоди`, JSON.stringify(res));
}

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 СИЛЬНІ ЗОМБІ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
