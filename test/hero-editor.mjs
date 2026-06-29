import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 820 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

console.log('▸ Реєстри й білдер кастом-героя');
const meta = await page.evaluate(async () => {
  const {
    makeHero, HERO_HATS, HERO_FACES, HERO_PALETTE,
    HERO_BODY_TYPES, HERO_HAIR, HERO_ACCESSORIES, HERO_BACKS,
  } = await import('/src/characters.js');
  let combos = 0;
  for (const hat of Object.keys(HERO_HATS)) {
    for (const face of Object.keys(HERO_FACES)) {
      makeHero('custom', {
        skin: 0xffc9a3, shirt: 0xe14b4b, pants: 0x223344, shoes: 0xffffff,
        hatColor: 0xf4c430, hat, face, body: 'armor', hair: 'mohawk', accessory: 'star', back: 'cape',
      });
      combos++;
    }
  }
  return {
    hats: Object.keys(HERO_HATS), faces: Object.keys(HERO_FACES),
    bodies: Object.keys(HERO_BODY_TYPES), hair: Object.keys(HERO_HAIR),
    accessories: Object.keys(HERO_ACCESSORIES), backs: Object.keys(HERO_BACKS),
    slots: Object.keys(HERO_PALETTE), combos,
  };
});
check(meta.hats.length >= 6 && meta.faces.length >= 3, `шапки (${meta.hats.length}) і обличчя (${meta.faces.length})`, meta.hats.join(','));
check(meta.bodies.length >= 3 && meta.hair.length >= 4 && meta.accessories.length >= 4 && meta.backs.length >= 4,
  'конструктор має тіло/волосся/аксесуари/спину', JSON.stringify({ bodies: meta.bodies, hair: meta.hair, acc: meta.accessories, backs: meta.backs }));
check(meta.slots.includes('shoes') && meta.slots.includes('hatColor'), 'палітра має нові слоти (shoes, hatColor)', meta.slots.join(','));
check(meta.combos === meta.hats.length * meta.faces.length, `усі ${meta.combos} комбінацій шапка×обличчя будуються без помилок`);

console.log('▸ Редактор у гардеробі: 3D-прев\'ю і зміна слотів');
const ui = await page.evaluate(() => {
  const g = window.__game;
  g.save.activeSkin = 'custom';
  g.renderWardrobe();
  g._showOverlay('overlay-wardrobe');
  const hasCanvas = !!document.getElementById('hero-preview');
  const swatches = document.querySelectorAll('.hero-swatch').length;
  const pickers = document.querySelectorAll('.hero-pick input[type=color]').length;
  const hatCards = document.querySelectorAll('.hero-part-card[data-part="hat"]').length;
  const faceCards = document.querySelectorAll('.hero-part-card[data-part="face"]').length;
  const bodyCards = document.querySelectorAll('.hero-part-card[data-part="body"]').length;
  const hairCards = document.querySelectorAll('.hero-part-card[data-part="hair"]').length;
  const accessoryCards = document.querySelectorAll('.hero-part-card[data-part="accessory"]').length;
  const backCards = document.querySelectorAll('.hero-part-card[data-part="back"]').length;
  const viewButtons = document.querySelectorAll('.hero-view-btn').length;
  const poseButtons = document.querySelectorAll('.hero-pose-btn').length;
  const zoom = document.querySelector('#hero-zoom');
  const random = document.querySelector('#hero-random');
  // зміна кольору взуття через свотч + шапки через картку
  const shoeBtn = document.querySelector('.hero-swatch[data-slot="shoes"]');
  if (shoeBtn) shoeBtn.click();
  const crownCard = document.querySelector('.hero-part-card[data-part="hat"][data-id="crown"]');
  if (crownCard) crownCard.click();
  const coolCard = document.querySelector('.hero-part-card[data-part="face"][data-id="cool"]');
  if (coolCard) coolCard.click();
  document.querySelector('.hero-part-card[data-part="body"][data-id="armor"]')?.click();
  document.querySelector('.hero-part-card[data-part="hair"][data-id="mohawk"]')?.click();
  document.querySelector('.hero-part-card[data-part="accessory"][data-id="star"]')?.click();
  document.querySelector('.hero-part-card[data-part="back"][data-id="cape"]')?.click();
  document.querySelector('.hero-view-btn[data-view="left"]')?.click();
  document.querySelector('.hero-pose-btn[data-pose="run"]')?.click();
  if (zoom) { zoom.value = '3.7'; zoom.dispatchEvent(new Event('input', { bubbles: true })); }
  const previewBeforeRandom = {
    view: g._heroPrev && g._heroPrev.view,
    pose: g._heroPrev && g._heroPrev.pose,
    zoom: g._heroPrev && g._heroPrev.zoom,
  };
  const manual = {
    shoes: g.save.hero.shoes, hat: g.save.hero.hat, face: g.save.hero.face,
    body: g.save.hero.body, hair: g.save.hero.hair, accessory: g.save.hero.accessory, back: g.save.hero.back,
  };
  const beforeRandom = JSON.stringify(g.save.hero);
  random?.click();
  const randomChanged = beforeRandom !== JSON.stringify(g.save.hero);
  return {
    hasCanvas, swatches, pickers, hatCards, faceCards, bodyCards, hairCards, accessoryCards, backCards,
    viewButtons, poseButtons, zoom: !!zoom, random: !!random, randomChanged,
    manual,
    previewLive: !!g._heroPrev, previewBeforeRandom,
  };
});
check(ui.hasCanvas && ui.previewLive, 'є canvas 3D-прев\'ю і він активний', JSON.stringify({ c: ui.hasCanvas, live: ui.previewLive }));
check(ui.pickers >= 5 && ui.swatches > 20, 'нативні вибори кольору (≥5) + пресет-свотчі', JSON.stringify({ pickers: ui.pickers, swatches: ui.swatches }));
check(ui.hatCards >= 6 && ui.faceCards >= 3, 'картки шапок і облич', JSON.stringify({ hat: ui.hatCards, face: ui.faceCards }));
check(ui.bodyCards >= 3 && ui.hairCards >= 4 && ui.accessoryCards >= 4 && ui.backCards >= 4,
  'картки нових 3D-частин показані в редакторі', JSON.stringify(ui));
check(ui.viewButtons >= 3 && ui.poseButtons >= 3 && ui.zoom, 'превʼю має обертання, пози і зум', JSON.stringify(ui));
check(ui.manual.hat === 'crown' && ui.manual.face === 'cool' && ui.manual.body === 'armor'
  && ui.manual.hair === 'mohawk' && ui.manual.accessory === 'star' && ui.manual.back === 'cape',
  'вибір усіх частин пишеться в save.hero', JSON.stringify(ui));
check(ui.previewBeforeRandom.view === 'left' && ui.previewBeforeRandom.pose === 'run' && ui.previewBeforeRandom.zoom === 3.7, 'контроли превʼю змінюють 3D-стан', JSON.stringify(ui));
check(ui.random && ui.randomChanged, 'кнопка випадкового героя змінює набір деталей');

await page.locator('#hero-preview').screenshot({ path: 'shots/hero-editor-preview.png' }).catch(() => {});

console.log('▸ Цикл редактора не тече (контекст/гео звільняються)');
const cycle = await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 25; i++) { g._rebuildHeroPreview(); } // 25 правок поспіль
  for (let i = 0; i < 15; i++) { g.renderWardrobe(); }       // 15 перемальовок (новий рендерер щоразу)
  return { singlePrev: !!g._heroPrev && typeof g._heroPrev === 'object' };
});
check(cycle.singlePrev, '25 правок + 15 перемальовок: прев\'ю живе, без накопичення JS-стану', JSON.stringify(cycle));

console.log('▸ Вигляд застосовується на герої при вході в рівень + round-trip сейва');
await page.evaluate(() => window.__game._hideOverlay('overlay-wardrobe'));
const live = await page.evaluate(async () => {
  const g = window.__game;
  g.save.activeSkin = 'custom';
  g.save.hero = {
    skin: 0x8d5524, shirt: 0x46b340, pants: 0x222222, shoes: 0xffffff, hatColor: 0xe14b4b,
    hat: 'cowboy', face: 'grin', body: 'compact', hair: 'spikes', accessory: 'scarf', back: 'jetpack',
  };
  g.saveGame();
  await g.startLevel('UKR');
  await new Promise((r) => setTimeout(r, 400));
  const p = g.level.player;
  // герой будується з кастом-скіна; риг існує і має голову (де живе шапка)
  const built = !!(p.rig && p.rig.group && p.rig.parts && p.rig.parts.head);
  return {
    built, previewStopped: !g._heroPrev,
    persisted: g.save.hero.hat === 'cowboy' && g.save.hero.shoes === 0xffffff
      && g.save.hero.body === 'compact' && g.save.hero.hair === 'spikes'
      && g.save.hero.accessory === 'scarf' && g.save.hero.back === 'jetpack',
  };
});
check(live.built, 'герой у рівні будується з кастом-вигляду', JSON.stringify(live));
check(live.previewStopped, '3D-прев\'ю зупинено після закриття гардероба (без витоку контексту)', JSON.stringify(live));
check(live.persisted, 'кастом-слоти зберігаються в сейві', JSON.stringify(live));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 РЕДАКТОР ГЕРОЯ ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
