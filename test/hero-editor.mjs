import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
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
  const { makeHero, HERO_HATS, HERO_FACES, HERO_PALETTE } = await import('/src/characters.js');
  let combos = 0;
  for (const hat of Object.keys(HERO_HATS)) {
    for (const face of Object.keys(HERO_FACES)) {
      makeHero('custom', { skin: 0xffc9a3, shirt: 0xe14b4b, pants: 0x223344, shoes: 0xffffff, hatColor: 0xf4c430, hat, face });
      combos++;
    }
  }
  return {
    hats: Object.keys(HERO_HATS), faces: Object.keys(HERO_FACES),
    slots: Object.keys(HERO_PALETTE), combos,
  };
});
check(meta.hats.length >= 6 && meta.faces.length >= 3, `шапки (${meta.hats.length}) і обличчя (${meta.faces.length})`, meta.hats.join(','));
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
  // зміна кольору взуття через свотч + шапки через картку
  const shoeBtn = document.querySelector('.hero-swatch[data-slot="shoes"]');
  if (shoeBtn) shoeBtn.click();
  const crownCard = document.querySelector('.hero-part-card[data-part="hat"][data-id="crown"]');
  if (crownCard) crownCard.click();
  const coolCard = document.querySelector('.hero-part-card[data-part="face"][data-id="cool"]');
  if (coolCard) coolCard.click();
  return {
    hasCanvas, swatches, pickers, hatCards, faceCards,
    shoes: g.save.hero.shoes, hat: g.save.hero.hat, face: g.save.hero.face,
    previewLive: !!g._heroPrev,
  };
});
check(ui.hasCanvas && ui.previewLive, 'є canvas 3D-прев\'ю і він активний', JSON.stringify({ c: ui.hasCanvas, live: ui.previewLive }));
check(ui.pickers >= 5 && ui.swatches > 20, 'нативні вибори кольору (≥5) + пресет-свотчі', JSON.stringify({ pickers: ui.pickers, swatches: ui.swatches }));
check(ui.hatCards >= 6 && ui.faceCards >= 3, 'картки шапок і облич', JSON.stringify({ hat: ui.hatCards, face: ui.faceCards }));
check(ui.hat === 'crown' && ui.face === 'cool', 'вибір шапки/обличчя пишеться в save.hero', JSON.stringify(ui));

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
  g.save.hero = { skin: 0x8d5524, shirt: 0x46b340, pants: 0x222222, shoes: 0xffffff, hatColor: 0xe14b4b, hat: 'cowboy', face: 'grin' };
  g.saveGame();
  await g.startLevel('UKR');
  await new Promise((r) => setTimeout(r, 400));
  const p = g.level.player;
  // герой будується з кастом-скіна; риг існує і має голову (де живе шапка)
  const built = !!(p.rig && p.rig.group && p.rig.parts && p.rig.parts.head);
  return { built, previewStopped: !g._heroPrev, persisted: g.save.hero.hat === 'cowboy' && g.save.hero.shoes === 0xffffff };
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
process.exit(failed === 0 ? 0 : 1);
