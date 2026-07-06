// 📖 R4 (v290) «Альбом»: кнопка на глобусі відкриває оверлей; секція «Друзі» — 12 карток
// (одна на країну кампанії); нерятовані — силует + чесна підказка; після порятунку картка
// відкривається; лічильник 🤝 X/12 оновлюється; вкладки скінів/петсів/еліт — заглушки «Скоро!».
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg, d = '') => { console.log(ok ? '  ✅' : '  ❌', msg, d); if (!ok) failed++; };

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
await page.evaluate(() => { window.__game.save.friends = {}; });

// відкриваємо альбом кнопкою в меню
await page.click('#btn-menu');
await page.waitForSelector('#overlay-menu.show', { timeout: 8000 });
await page.click('#btn-album');
await page.waitForSelector('#overlay-album.show', { timeout: 8000 });
check(true, 'альбом відкривається кнопкою 📖');

// R5: інші вкладки теж наповнені картками — асерти друзів скоупимо на вкладку Друзі
let st = await page.evaluate(() => ({
  cards: document.querySelectorAll('#album-content .album-pane[data-tab="friends"] .album-card').length,
  locked: document.querySelectorAll('#album-content .album-pane[data-tab="friends"] .album-card.locked').length,
  silhouettes: document.querySelectorAll('#album-content .album-pane[data-tab="friends"] .album-portrait.silhouette').length,
  hints: document.querySelectorAll('#album-content .album-pane[data-tab="friends"] .album-hint').length,
  counter: document.querySelector('#album-content .album-pane[data-tab="friends"] .album-counter')?.textContent || '',
  tabs: [...document.querySelectorAll('#album-content .album-tab')].map((b) => b.getAttribute('data-tab')),
  q: document.querySelector('#album-content .album-pane[data-tab="friends"] .album-card.locked .album-name')?.textContent || '',
}));
check(st.cards === 12, '12 карток друзів (по країні кампанії)', String(st.cards));
check(st.locked === 12 && st.silhouettes === 12, 'нерятовані — тёмний силует', JSON.stringify(st));
check(st.hints === 12 && st.q === '???', 'нерятовані — «???» + чесна підказка де схований', JSON.stringify(st));
check(/0\/12/.test(st.counter), 'лічильник 🤝 0/12', st.counter);
check(st.tabs.length === 4 && st.tabs.join(',') === 'friends,skins,pets,elites', '4 вкладки: Друзі + скіни/петси/еліти', JSON.stringify(st.tabs));

// R5: вкладки скінів/петсів/еліт наповнені (не заглушки). Петси показують реальні картки + рядок яєць.
await page.click('#album-content .album-tab[data-tab="pets"]');
const petsPane = await page.evaluate(() => ({
  cards: document.querySelectorAll('#album-content .album-pane[data-tab="pets"] .album-card').length,
  eggRow: !!document.querySelector('#album-content .album-pane[data-tab="pets"] .album-egg-row'),
  noSoon: !document.querySelector('#album-content .album-pane[data-tab="pets"] .album-soon'),
}));
check(petsPane.cards > 0 && petsPane.eggRow && petsPane.noSoon, 'вкладка Петси наповнена (картки + рядок яєць, без «Скоро!»)', JSON.stringify(petsPane));

// рятуємо друга → картка країни відкривається, лічильник росте
st = await page.evaluate(() => {
  window.__game.save.friends = { UKR: true };
  window.__game._albumTab = 'friends';
  window.__game.renderAlbum();
  const card = document.querySelector('#album-content .album-card[data-cid="UKR"]');
  return {
    revealed: !!(card && card.classList.contains('revealed')),
    name: card ? card.querySelector('.album-name')?.textContent : '',
    role: card ? !!card.querySelector('.album-role') : false,
    flag: card ? !!card.querySelector('.album-flag') : false,
    counter: document.querySelector('#album-content .album-pane[data-tab="friends"] .album-counter')?.textContent || '',
    locked: document.querySelectorAll('#album-content .album-pane[data-tab="friends"] .album-card.locked').length,
  };
});
check(st.revealed && st.name && st.name !== '???', 'після порятунку картка UKR відкрита з імʼям', JSON.stringify(st));
check(st.role && st.flag, 'відкрита картка показує роль і прапор країни', JSON.stringify(st));
check(/1\/12/.test(st.counter), 'лічильник оновився 🤝 1/12', st.counter);
check(st.locked === 11, 'решта 11 друзів лишаються схованими', JSON.stringify(st));

check(errors.length === 0, `без JS-помилок (${errors.slice(0, 2).join(' | ')})`);
console.log(failed === 0 ? '🎉 ALBUM OK' : `❌ ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
