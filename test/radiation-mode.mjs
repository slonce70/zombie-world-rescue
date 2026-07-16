import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest();
let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Режим Радіація');
const meta = await page.evaluate(async () => {
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const g = window.__game;
  g.endLevel();
  g.renderSoloMenu();
  const lockedBefore = !!document.querySelector('.solo-mode[data-mode="radiation"].locked');
  const item = SHOP_ITEMS.find((i) => i.id === 'radiationcloneskin');
  return {
    lockedBefore,
    item: item && { id: item.id, cat: item.cat, radiationPrice: item.radiationPrice, max: item.max, cloneSkin: item.cloneSkin },
  };
});
check(meta.lockedBefore, 'режим Радіація закритий до 12 країн', JSON.stringify(meta));
check(meta.item && meta.item.cat === 'Радіація' && meta.item.radiationPrice === 150 && meta.item.max === 1 && meta.item.cloneSkin === 'radiation',
  'у розділі Радіація є скін клонів за 150 монет радіації', JSON.stringify(meta.item));

await page.evaluate(() => {
  const g = window.__game;
  // моки проти протухання: ×2/×3 дня-тижня не мають множити +50 ☢️ (пастка mode-depth)
  g.dailyChallengeId = () => '__none';
  g.weeklyChallengeId = () => '__none';
  g.test.startRadiation();
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.radiation, null, { timeout: 60000 });

const started = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const z = g.level.zombies.list.find((x) => x.radiationMode && x.state !== 'dead');
  return {
    modeId: g.level.modeId,
    roomSize: g.level.radiation.roomSize,
    noShop: g.level.noShop,
    noGadgets: g.level.noGadgets,
    noPickups: g.level.noPickups,
    noCoinDrops: g.level.noCoinDrops,
    playerHp: p.maxHealth,
    weapons: [...p.weapons],
    cur: p.cur,
    shotgun: { mag: p.ammo.shotgun?.mag, reserve: p.ammo.shotgun?.reserve },
    zombie: z && { hp: z.hp, maxHp: z.maxHp, dmg: z.stats.dmg, style: z.bossStyle || z.style || z.zstyle },
    alive: g.level.radiation.remaining(),
  };
});
check(started.modeId === 'radiation' && started.roomSize === 50
  && started.noShop && started.noGadgets && started.noPickups && started.noCoinDrops,
  'режим створює кімнату 50x50 без магазину, гаджетів і пікапів', JSON.stringify(started));
check(started.playerHp === 50 && started.weapons.join(',') === 'shotgun' && started.cur === 'shotgun'
  && started.shotgun.mag + started.shotgun.reserve === 10,
  'гравець має 50 HP і тільки дробовик з 10 патронами', JSON.stringify(started));
check(started.alive === 1 && started.zombie && started.zombie.maxHp === 500 && started.zombie.dmg === 10,
  'у кімнаті один радіаційний зомбі: 500 HP і 10 шкоди', JSON.stringify(started));

const reward = await page.evaluate(() => {
  const g = window.__game;
  g.save.radiationCoins = 0;
  g.level.radiation.zombie.damage(99999, null, false);
  g.level.radiation.update(0.05);
  return {
    over: g.level.radiation.over,
    won: g.level.radiation.completed,
    radiationCoins: g.save.radiationCoins,
    wins: g.save.modeWins.radiation,
    title: document.querySelector('#overlay-arena-end h1')?.textContent || '',
    stats: document.getElementById('arena-stats')?.textContent || '',
  };
});
check(reward.over && reward.won && reward.radiationCoins === 50 && reward.wins === 1
  && reward.title.includes('РАДІАЦІ') && reward.stats.includes('50'),
  'перемога дає 50 монет радіації і фінальний екран', JSON.stringify(reward));

const shopFlow = await page.evaluate(() => {
  const g = window.__game;
  g.save.radiationCoins = 149;
  g.save.cloneSkins = [];
  g.save.activeCloneSkin = 'ninja';
  g.level.noShop = false;
  g.shop.open();
  const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Радіація');
  if (tab) tab.click();
  const beforeText = document.getElementById('shop-coins')?.textContent || '';
  const rendered = [...document.querySelectorAll('.shop-item')].map((i) => i.dataset.id);
  g.test.shopBuy('radiationcloneskin');
  const denied = { coins: g.save.radiationCoins, owned: g.save.cloneSkins.includes('radiation') };
  g.save.radiationCoins = 150;
  g.test.shopBuy('radiationcloneskin');
  const bought = { coins: g.save.radiationCoins, owned: g.save.cloneSkins.includes('radiation'), active: g.save.activeCloneSkin };
  g.test.unlockGadget('clone');
  g.level.noGadgets = false;
  g.level.gadgets.clones = [];
  g.save.activeGadget = 'clone';
  g.test.gadgetCdReset();
  g.test.useGadget();
  const clone = g.level.gadgets.clones[0];
  g.shop.close();
  return { beforeText, rendered, denied, bought, cloneSkin: clone?.rig?.heroSkin };
});
check(shopFlow.beforeText.includes('☢️') && shopFlow.rendered.includes('radiationcloneskin'),
  'магазин показує монети радіації і товар у вкладці Радіація', JSON.stringify(shopFlow));
check(shopFlow.denied.coins === 149 && !shopFlow.denied.owned
  && shopFlow.bought.coins === 0 && shopFlow.bought.owned && shopFlow.bought.active === 'radiation'
  && shopFlow.cloneSkin === 'radiation',
  'скін клонів купується за 150 монет радіації і застосовується до клона', JSON.stringify(shopFlow));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РЕЖИМ РАДІАЦІЯ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
