// 🏕️ R4 (v290) «Живий табір»: врятовані друзі зʼявляються ригами у сцені Бази; за ≥3 друзів
// «щоденне дякую» — тап по другові раз на день дає +20💰 (другий раз того ж дня — нічого).
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, pageErrorPrefix: '' });

let failed = 0;
const check = makeCheck(() => failed++);

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

// 3 врятованих друзів → «щоденне дякую» відкрите
await page.evaluate(() => {
  window.__game.save.friends = { UKR: true, POL: true, DEU: true };
  window.__game.save.coins = 100;
  window.__game.save.friendThanks = '';
  window.__game.saveGame();
});

await page.click('#btn-menu');
await page.waitForSelector('#overlay-menu.show', { timeout: 8000 });
await page.click('#btn-hq');
await page.waitForSelector('#overlay-hq.show', { timeout: 8000 });
await page.click('#btn-hqbase');
await page.waitForFunction(() => window.__game && window.__game.state === 'hqbase' && window.__game.hqbase.ready, null, { timeout: 12000 });

let st = await page.evaluate(() => window.__game.hqbase.debugState());
check(st.friendRigs === 3, 'у сцені Бази — ріги 3 врятованих друзів', JSON.stringify(st));
check(st.campProps === 2, 'намет + багаття зʼявляються (1+ друг)', JSON.stringify(st));

// щоденне дякую: перший тап +20, другий того ж дня — нічого
st = await page.evaluate(() => {
  const g = window.__game;
  const before = g.save.coins;
  const msg1 = g.hqbase.tapFirstFriend();
  const after1 = g.save.coins;
  const msg2 = g.hqbase.tapFirstFriend();
  const after2 = g.save.coins;
  return { before, after1, after2, day: g.save.friendThanks, msg1Warm: /дякую|thank|спасибо/i.test(msg1) };
});
check(st.after1 === st.before + 20, 'перше «щоденне дякую» дня дає +20💰', JSON.stringify(st));
check(st.after2 === st.after1, 'другий тап того ж дня — без нарахування', JSON.stringify(st));
check(!!st.day, 'день claim збережено (save.friendThanks)', JSON.stringify(st));
check(st.msg1Warm, 'репліка друга — тепла подяка', JSON.stringify(st));

// менше 3 друзів → щоденне дякую не відкрите (немає нарахування)
st = await page.evaluate(() => {
  const g = window.__game;
  g.exitHQBase();
  g.save.friends = { UKR: true, POL: true };
  g.save.friendThanks = '';
  g.save.coins = 100;
  g.enterHQBase();
  const before = g.save.coins;
  const msg = g.hqbase.tapFirstFriend();
  return { rigs: g.hqbase.debugState().friendRigs, before, after: g.save.coins, greeted: !!msg };
});
check(st.rigs === 2, 'за 2 друзів — 2 ріги у таборі', JSON.stringify(st));
check(st.after === st.before && st.greeted, 'за <3 друзів — лише репліка, без бонусу', JSON.stringify(st));

check(errors.length === 0, `без JS-помилок (${errors.slice(0, 2).join(' | ')})`);
console.log(failed === 0 ? '🎉 HQ-FRIENDS OK' : `❌ ПРОВАЛЕНО: ${failed}`);
await closeTest();
process.exit(failed === 0 ? 0 : 1);
