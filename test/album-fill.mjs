// 📖🥚 R5 (v291) «Колекція та яйця»: наповнення альбому. Три вкладки (Скіни/Петси/Еліти)
// рендерять реальні картки (кількість = реєстри); силует+підказка для невідкритого;
// лічильники убитих еліт з бестіарію; «наступна ціль» підсвічена; рівень петса на картці.
import { openBrowserTest } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 900 } }, pageErrorPrefix: '' });

let failed = 0;
const check = (ok, msg, d = '') => { console.log(ok ? '  ✅' : '  ❌', msg, d); if (!ok) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// ---------- 🧢 Скіни ----------
console.log('▸ Вкладка Скіни: картка на кожен HERO_SKINS, силует+підказка, X/Y, наступна ціль');
const skins = await page.evaluate(async () => {
  const { HERO_SKINS } = await import('/src/characters.js');
  const g = window.__game;
  g._albumTab = 'skins';
  g.renderAlbum();
  const pane = document.querySelector('#album-content .album-pane[data-tab="skins"]');
  return {
    total: Object.keys(HERO_SKINS).length,
    cards: pane.querySelectorAll('.album-card').length,
    counter: pane.querySelector('.album-counter')?.textContent || '',
    silhouettes: pane.querySelectorAll('.album-portrait.silhouette').length,
    hints: pane.querySelectorAll('.album-hint').length,
    next: pane.querySelectorAll('.album-card.next').length,
    nextBadge: !!pane.querySelector('.album-next'),
    hintText: pane.querySelector('.album-hint')?.textContent || '',
  };
});
check(skins.cards === skins.total && skins.total > 0, 'скіни: картка на кожен HERO_SKINS', JSON.stringify(skins));
check(new RegExp(`/${skins.total}`).test(skins.counter), 'скіни: лічильник X/Y', skins.counter);
check(skins.silhouettes > 0 && skins.hints > 0, 'скіни: силует + чесна підказка для невідкритих', JSON.stringify(skins));
check(skins.hintText.length > 0, 'скіни: підказка непорожня (звідки здобути)', skins.hintText);
check(skins.next === 1 && skins.nextBadge, 'скіни: рівно одна «наступна ціль»', JSON.stringify(skins));

// ---------- 🐾 Петси ----------
console.log('▸ Вкладка Петси: картка на кожен PETS, рядок яєць із шансами, рівень петса');
const pets = await page.evaluate(async () => {
  const { PETS } = await import('/src/characters.js');
  const g = window.__game;
  g.save.pets = ['dog'];
  g.save.petLevels = { dog: 2 };
  g._albumTab = 'pets';
  g.renderAlbum();
  const pane = document.querySelector('#album-content .album-pane[data-tab="pets"]');
  const dogCard = pane.querySelector('.album-card.revealed[data-id="dog"]');
  return {
    total: Object.keys(PETS).length,
    cards: pane.querySelectorAll('.album-card').length,
    counter: pane.querySelector('.album-counter')?.textContent || '',
    eggRow: !!pane.querySelector('.album-egg-row'),
    odds: pane.querySelector('.album-egg-odds')?.textContent || '',
    lvlText: dogCard?.querySelector('.album-lvl')?.textContent || '',
    feedBtn: !!dogCard?.querySelector('.album-feed-btn'),
    silhouettes: pane.querySelectorAll('.album-portrait.silhouette').length,
    hints: pane.querySelectorAll('.album-hint').length,
    next: pane.querySelectorAll('.album-card.next').length,
  };
});
check(pets.cards === pets.total && pets.total > 0, 'петси: картка на кожен PETS', JSON.stringify(pets));
check(pets.eggRow && /%/.test(pets.odds), 'петси: рядок яєць із надрукованими шансами', pets.odds);
check(/2/.test(pets.lvlText) && pets.feedBtn, 'петси: РІВЕНЬ петса на картці + кнопка Годувати', JSON.stringify(pets));
check(pets.silhouettes > 0 && pets.hints > 0, 'петси: силует + підказка для невідкритих', JSON.stringify(pets));
check(pets.next === 1, 'петси: рівно одна «наступна ціль»', JSON.stringify(pets));

// ---------- 👹 Еліти ----------
console.log('▸ Вкладка Еліти: 4 типи, лічильник убитих із бестіарію, силует+підказка');
const elites = await page.evaluate(() => {
  const g = window.__game;
  g.save.bestiary = { shield: 5 };
  g._albumTab = 'elites';
  g.renderAlbum();
  const pane = document.querySelector('#album-content .album-pane[data-tab="elites"]');
  const shieldCard = pane.querySelector('.album-card.revealed[data-id="shield"]');
  return {
    cards: pane.querySelectorAll('.album-card').length,
    counter: pane.querySelector('.album-counter')?.textContent || '',
    killCount: shieldCard?.querySelector('.album-count')?.textContent || '',
    silhouettes: pane.querySelectorAll('.album-portrait.silhouette').length,
    hints: pane.querySelectorAll('.album-hint').length,
    next: pane.querySelectorAll('.album-card.next').length,
  };
});
check(elites.cards === 4, 'еліти: 4 картки (shield/splitter/exploder/golden)', String(elites.cards));
check(/5/.test(elites.killCount), 'еліти: лічильник убитих «Переможено: 5»', elites.killCount);
check(/1\/4/.test(elites.counter), 'еліти: лічильник 1/4', elites.counter);
check(elites.silhouettes === 3 && elites.hints === 3, 'еліти: силует+підказка для невбитих', JSON.stringify(elites));
check(elites.next === 1, 'еліти: рівно одна «наступна ціль»', JSON.stringify(elites));

check(errors.length === 0, `без JS-помилок (${errors.slice(0, 2).join(' | ')})`);
console.log(failed === 0 ? '🎉 ALBUM-FILL OK' : `❌ ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
