// 💾🚑 v15 «Надійний світ»: хмарний сейв, код відновлення, файл-копія,
// аварійний екран. Сам піднімає dev-relay (у ньому — dev-SaveVault).
import { chromium } from 'playwright';
import { spawnRelay } from './_relay.mjs';

const BASE = 'http://localhost:8741';
const RELAY_PORT = 8753;
const API = `http://localhost:${RELAY_PORT}`;
const URL_PARAMS = `?test&fresh&cloud&relay=ws://localhost:${RELAY_PORT}`;

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = await spawnRelay(RELAY_PORT);

const LAUNCH = { args: ['--use-angle=swiftshader'] };
const browser = await chromium.launch(LAUNCH);

// ---------- REST-рівень dev-SaveVault ----------
console.log('▸ SaveVault REST');
{
  const cid = 'test-cid-0123456789';
  const data = JSON.stringify({ coins: 999, liberated: { UKR: true }, cid });
  let r = await fetch(`${API}/save/put`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid, data }),
  });
  check('put приймає сейв', r.ok);
  r = await (await fetch(`${API}/save/get?cid=${cid}`)).json();
  check('get повертає той самий сейв', r.data === data);
  r = await (await fetch(`${API}/save/link`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid }),
  })).json();
  const code = r.code;
  check('link видає код на 8 знаків', typeof code === 'string' && code.length === 8, code);
  const r2 = await (await fetch(`${API}/save/link`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid }),
  })).json();
  check('код ПОСТІЙНИЙ: повторний запит — той самий', r2.code === code);
  const claimed = await (await fetch(`${API}/save/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })).json();
  check('claim повертає cid і сейв', claimed.cid === cid && claimed.data === data);
  const bad = await fetch(`${API}/save/claim`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'AAAAAAAA' }),
  });
  check('claim з вигаданим кодом — 404', bad.status === 404);
  const put2 = await fetch(`${API}/save/put`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid, data: 'не json' }),
  });
  check('put відкидає не-JSON', !put2.ok);
}

// ---------- Фільтр ніків (світ бачить Лобі й Лігу — лайка ріжеться сервером) ----------
console.log('▸ Фільтр ніків');
{
  const ping = (cid, nick) => fetch(`${API}/lobby/ping`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid, nick }),
  }).then((r) => r.json());
  let v = await ping('nick-bad-0123456789', 'Xyi123');
  check('поганий нік → «Гравець»', v.players.includes('Гравець') && !v.players.includes('Xyi123'));
  v = await ping('nick-ok-0123456789', 'Владик');
  check('нормальний нік не чіпаємо', v.players.includes('Владик'));
}

// ---------- F24/F27: saveHasProgress бачить ВЕСЬ прогрес (не лише 4 старі поля) ----------
// Раніше кастом-герой/ціль/монети/медалі тощо лишались «невидимими» → claim/імпорт тихо
// перезаписував без попередження, а bootSync міг adopt-нути хмару поверх живого локального.
console.log('▸ F24: saveHasProgress бачить новий прогрес');
{
  const ctxU = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const U = await ctxU.newPage();
  await U.goto(`${BASE}/?test&fresh`);
  await U.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
  const res = await U.evaluate(async () => {
    const { saveHasProgress, DEFAULT_HERO, NEW_SAVE_COINS } = await import('/src/net/cloudsave.js');
    const fresh = window.__game._newSave();
    const out = {};
    out.freshIsEmpty = saveHasProgress(fresh) === false; // свіжий сейв = «нема що втрачати»
    const hero = { ...fresh, hero: { ...DEFAULT_HERO, shirt: 0x123456 } };
    out.customHero = saveHasProgress(hero) === true;
    out.goal = saveHasProgress({ ...fresh, goal: 'sniper' }) === true;
    out.coins = saveHasProgress({ ...fresh, coins: NEW_SAVE_COINS + 100 }) === true;
    out.startCoinsNotProgress = saveHasProgress({ ...fresh, coins: NEW_SAVE_COINS }) === false;
    out.medals = saveHasProgress({ ...fresh, medals: ['hero'] }) === true;
    out.bestiary = saveHasProgress({ ...fresh, bestiary: { walker: 3 } }) === true;
    out.stats = saveHasProgress({ ...fresh, stats: { ...fresh.stats, killed: 1 } }) === true;
    out.diffStar = saveHasProgress({ ...fresh, diffStar: 3 }) === true;
    out.gadget = saveHasProgress({ ...fresh, gadgetsOwned: ['shield'] }) === true;
    out.chapter = saveHasProgress({ ...fresh, chapter: { p: { kill: 5 }, done: false } }) === true;
    return out;
  });
  check('свіжий сейв ≠ прогрес (false)', res.freshIsEmpty);
  check('стартові 50 монет ≠ прогрес', res.startCoinsNotProgress);
  check('кастом-герой → прогрес=true', res.customHero);
  check('ціль → прогрес=true', res.goal);
  check('монети понад стартові → прогрес=true', res.coins);
  check('медалі → прогрес=true', res.medals);
  check('бестіарій → прогрес=true', res.bestiary);
  check('stats.killed>0 → прогрес=true', res.stats);
  check('diffStar>1 → прогрес=true', res.diffStar);
  check('куплений гаджет → прогрес=true', res.gadget);
  check('прогрес глави → прогрес=true', res.chapter);
  await ctxU.close();
}

// ---------- Гравець А: грає, пушить у хмару, бере код ----------
console.log('▸ Гравець А: прогрес → хмара → код');
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const A = await ctxA.newPage();
const errorsA = [];
A.on('pageerror', (e) => errorsA.push(e.message));
await A.goto(`${BASE}/${URL_PARAMS}`);
await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
const codeA = await A.evaluate(async () => {
  const g = window.__game;
  g.save.coins = 7777;
  g.save.liberated.UKR = true;
  g.save.xp = 500;
  g.saveGame();
  await g.cloud.push();
  return g.cloud.fetchCode();
});
check('А отримав код відновлення', typeof codeA === 'string' && codeA.length === 8, codeA);
const cidA = await A.evaluate(() => window.__game.save.cid);

// панель: відкривається кнопкою (v34: кнопки тепер у ☰-меню — спершу відкриваємо його)
await A.click('#btn-menu');
await sleep(300);
await A.click('#btn-progress');
await sleep(700);
const panelVisible = await A.evaluate(() => document.getElementById('overlay-progress').classList.contains('show'));
check('панель «Мій прогрес» відкривається', panelVisible);
await A.click('#btn-cloud-code');
await A.waitForFunction(() => /-/.test(document.getElementById('cloud-code').textContent), null, { timeout: 5000 });
const shownCode = await A.evaluate(() => document.getElementById('cloud-code').textContent);
check('код показано у форматі XXXX-XXXX', shownCode.replace('-', '') === codeA, shownCode);

// ---------- Гравець Б (чистий пристрій): відновлення за кодом ----------
console.log('▸ Гравець Б: чистий браузер + код = прогрес А');
const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const B = await ctxB.newPage();
// ?fresh не даємо: інакше adopt-нутий сейв знову зітреться після перезавантаження
await B.goto(`${BASE}/?test&cloud&relay=ws://localhost:${RELAY_PORT}`);
await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
B.on('dialog', (d) => d.accept());
await B.click('#btn-menu');
await sleep(300);
await B.click('#btn-progress');
await B.fill('#cloud-code-input', codeA);
await Promise.all([
  B.waitForNavigation({ timeout: 10000 }).catch(() => null), // adopt → location.reload()
  B.click('#btn-cloud-claim'),
]);
// adopt робить ще один location.reload() — чекаємо саме цільовий стан як boolean,
// щоб не тримати JSHandle з контексту, який може зникнути під час фінального reload.
await B.waitForFunction(({ codeCid }) => {
  const g = window.__game;
  return !!(g && g.state === 'globe' && g.save
    && g.save.coins === 7777
    && g.save.liberated.UKR
    && g.save.cid === codeCid);
}, { codeCid: cidA }, { timeout: 25000, polling: 300 });
const restored = await B.evaluate(() => ({
  coins: window.__game.save.coins,
  ukr: !!window.__game.save.liberated.UKR,
  cid: window.__game.save.cid,
}));
check('Б відновив монети і країну', restored.coins === 7777 && restored.ukr);
check('Б успадкував cid (далі синхрон той самий)', restored.cid === cidA);

// ---------- bootSync: порожній локальний сейв із тим самим cid → хмара сама підтягується ----------
console.log('▸ bootSync: «почистив браузер» (cid зберігся через відновлення)');
const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const C = await ctxC.newPage();
await C.goto(`${BASE}/?test&cloud&relay=ws://localhost:${RELAY_PORT}`);
await C.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await C.evaluate((cid) => {
  localStorage.setItem('zr-save-v1', JSON.stringify({ cid })); // свіжий сейв, але cid відомий
}, cidA);
await C.reload();
await C.waitForFunction(
  () => window.__game && window.__game.save && window.__game.save.coins === 7777,
  null, { timeout: 25000 }
).catch(() => null);
const cCoins = await C.evaluate(() => window.__game.save.coins);
check('bootSync сам підтягнув хмарний прогрес', cCoins === 7777, `coins=${cCoins}`);

// ---------- файл-копія (панель А досі відкрита) ----------
console.log('▸ Файл-копія');
const dlPromise = A.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await A.click('#btn-save-export');
const dl = await dlPromise;
check('експорт качає zr-progres.json', !!dl && dl.suggestedFilename() === 'zr-progres.json');

// ---------- аварійний екран ----------
console.log('▸ Аварійний екран');
const ctxE = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const E = await ctxE.newPage();
await E.goto(`${BASE}/?test&fresh`);
await E.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
await E.evaluate(() => setTimeout(() => { throw new Error('тестовий вибух'); }, 0));
await E.waitForFunction(
  () => document.getElementById('overlay-crash').classList.contains('show'),
  null, { timeout: 5000 }
).catch(() => null);
const crash = await E.evaluate(() => ({
  shown: document.getElementById('overlay-crash').classList.contains('show'),
  info: document.getElementById('crash-info').textContent,
}));
check('помилка показує аварійний екран', crash.shown);
check('на екрані видно текст помилки', crash.info.includes('тестовий вибух'), crash.info.slice(0, 60));

console.log('');
check('у А не було JS-помилок', errorsA.length === 0, errorsA.slice(0, 3).join(' | '));
console.log(failures === 0 ? '🎉 ХМАРНИЙ СЕЙВ ПРАЦЮЄ' : `❌ ПРОВАЛЕНО: ${failures}`);
await browser.close();
relay.kill();
process.exit(failures === 0 ? 0 : 1);
