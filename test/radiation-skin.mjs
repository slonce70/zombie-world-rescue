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
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

console.log('▸ Радіаційний: магазин і скін');
const meta = await page.evaluate(async () => {
  const { HERO_SKINS, makeHero } = await import('/src/characters.js');
  const { SHOP_ITEMS } = await import('/src/shop.js');
  const item = SHOP_ITEMS.find((i) => i.id === 'radiationskin');
  let built = false, looksRadiation = false;
  try {
    const rig = makeHero('radiation', window.__game.save.hero);
    built = !!rig.group;
    looksRadiation = rig.heroSkin === 'radiation';
  } catch (e) { built = false; }
  return {
    skin: HERO_SKINS.radiation || null,
    item: item && { id: item.id, cat: item.cat, crystalPrice: item.crystalPrice, max: item.max, skin: item.skin },
    built,
    looksRadiation,
  };
});
check(meta.skin && meta.skin.icon === '☢️', 'radiation є у HERO_SKINS', JSON.stringify(meta.skin));
check(meta.built && meta.looksRadiation, 'makeHero("radiation") будується окремим скіном з маскою', JSON.stringify(meta));
check(meta.item && meta.item.cat === 'Радіація' && meta.item.crystalPrice === 100 && meta.item.max === 1 && meta.item.skin === 'radiation',
  'у магазині є комплект Радіаційний за 100 кристалів', JSON.stringify(meta.item));

const shopFlow = await page.evaluate(() => {
  const g = window.__game;
  g.shop.open();
  const tab = [...document.querySelectorAll('.shop-tab')].find((t) => t.textContent === 'Радіація');
  const tabOk = !!tab;
  if (tab) tab.click();
  const rendered = [...document.querySelectorAll('.shop-item')].map((i) => i.dataset.id);
  g.save.crystals = 100;
  g.save.skins = g.save.skins.filter((s) => s !== 'radiation');
  g.save.activeSkin = 'classic';

  g.test.shopBuy('radiationskin');
  const afterBuy = {
    crystals: g.save.crystals,
    owned: g.save.skins.includes('radiation'),
    active: g.save.activeSkin,
  };
  g.test.shopBuy('radiationskin');
  const afterRepeat = { crystals: g.save.crystals, ownedCount: g.save.skins.filter((s) => s === 'radiation').length };
  g.shop.close();
  return { tabOk, rendered, afterBuy, afterRepeat };
});
check(shopFlow.tabOk && shopFlow.rendered.join(',') === 'radiationskin',
  'магазин має вкладку Радіація з одним комплектом Радіаційний', JSON.stringify(shopFlow.rendered));
check(shopFlow.afterBuy.crystals === 0 && shopFlow.afterBuy.owned && shopFlow.afterBuy.active === 'radiation',
  'купівля за 100 кристалів відкриває і одягає Радіаційний', JSON.stringify(shopFlow.afterBuy));
check(shopFlow.afterRepeat.crystals === 0 && shopFlow.afterRepeat.ownedCount === 1,
  'куплений комплект не можна купити вдруге', JSON.stringify(shopFlow.afterRepeat));

console.log('▸ Радіаційний: калюжа після вбивства');
const killFx = await page.evaluate(() => {
  const g = window.__game;
  for (const z of g.level.zombies.list) z.state = 'dead';
  g.save.activeSkin = 'radiation';
  const floors = [];
  const bursts = [];
  const oldGround = g.level.effects.groundGlow.bind(g.level.effects);
  const oldBurst = g.level.effects.burst.bind(g.level.effects);
  g.level.effects.groundGlow = (pos, color, size, life) => {
    floors.push({ color, size, life, y: Math.round(pos.y * 10) / 10 });
    return oldGround(pos, color, size, life);
  };
  g.level.effects.burst = (pos, color, count, opts = {}) => {
    bursts.push({ color, count, life: opts.life || 0, y: Math.round(pos.y * 10) / 10 });
    return oldBurst(pos, color, count, opts);
  };
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('walker', p.x + 3, p.z);
  z.hp = z.maxHp = 10;
  z.damage(999, null, false);
  const glow = g.level.effects.groundGlows.at(-1);
  const visible = glow ? {
    depthTest: glow.mesh.material.depthTest,
    opacity: glow.mesh.material.opacity,
    renderOrder: glow.mesh.renderOrder,
  } : null;
  g.level.effects.groundGlow = oldGround;
  g.level.effects.burst = oldBurst;
  return { floors, bursts, visible };
});
check(killFx.floors.some((fx) => fx.color === 0x77ff55 && fx.size >= 3 && fx.life === 3)
  && killFx.bursts.some((fx) => fx.color === 0x77ff55 && fx.count >= 12 && fx.life >= 3)
  && killFx.visible && killFx.visible.depthTest === false && killFx.visible.opacity >= 0.75 && killFx.visible.renderOrder >= 30,
  'після kill лишається зелена калюжа радіації на 3с', JSON.stringify(killFx));

console.log('▸ Радіаційний: анімація відродження');
const reviveFx = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  g.save.activeSkin = 'radiation';
  const floors = [];
  const bursts = [];
  const oldGround = g.level.effects.groundGlow.bind(g.level.effects);
  const oldBurst = g.level.effects.burst.bind(g.level.effects);
  g.level.effects.groundGlow = (pos, color, size, life) => {
    floors.push({ color, size, life, y: Math.round(pos.y * 10) / 10 });
    return oldGround(pos, color, size, life);
  };
  g.level.effects.burst = (pos, color, count, opts = {}) => {
    bursts.push({ color, count, life: opts.life || 0, y: Math.round(pos.y * 10) / 10 });
    return oldBurst(pos, color, count, opts);
  };
  p.health = 0;
  p.respawn();
  const glow = g.level.effects.groundGlows.at(-1);
  const visible = glow ? {
    depthTest: glow.mesh.material.depthTest,
    opacity: glow.mesh.material.opacity,
    renderOrder: glow.mesh.renderOrder,
    y: Math.round(glow.mesh.position.y * 100) / 100,
  } : null;
  g.level.effects.groundGlow = oldGround;
  g.level.effects.burst = oldBurst;
  return { floors, bursts, visible, health: p.health };
});
check(reviveFx.health > 0
  && reviveFx.floors.some((fx) => fx.color === 0x77ff55 && fx.size === 7 && fx.life === 5)
  && reviveFx.bursts.some((fx) => fx.color === 0x77ff55 && fx.count >= 24 && fx.life >= 5)
  && reviveFx.visible && reviveFx.visible.depthTest === false && reviveFx.visible.opacity >= 0.75 && reviveFx.visible.renderOrder >= 30,
  'після відродження є радіаційна зона 7x7 і зелені іскри 5с', JSON.stringify(reviveFx));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РАДІАЦІЙНИЙ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
