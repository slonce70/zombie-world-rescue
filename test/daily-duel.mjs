// 🤝 Дуель дня в браузері: ДОВОДИМО, що однаковий день дає ОДНАКОВУ карту двом
// гравцям з різними налаштуваннями, і що результат обох видно на спільній дошці.
// Порівняння їде наявним каналом лобі (/lobby/ping → поле duel), окремого немає.
// node test/daily-duel.mjs
import { openBrowserTest, makeCheck } from './_browser.mjs';
import { spawnRelay } from './_relay.mjs';

const PORT = 8778;
let fail = 0;
const check = makeCheck(() => fail++);
const relay = await spawnRelay(PORT);
const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } }, captureConsole: false, pageErrorPrefix: '' });
const url = (nick) => `${BASE}/?test&fresh&seed=1&relay=ws://localhost:${PORT}&nick=${encodeURIComponent(nick)}`;

async function boot(nick) {
  await page.goto(url(nick), { waitUntil: 'commit', timeout: 60000 });
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
  await page.evaluate((n) => { localStorage.setItem('zr-nick', n); }, nick);
}

// Знімок УСЬОГО, що робить карту картою: межі, майданчики місій, колайдери,
// перешкоди для куль і точка старту гравця. Округлення — щоб не ловити шум float.
const SNAPSHOT = `(() => {
  const w = window.__game.level.world;
  const r = (n) => Math.round(n * 1000) / 1000;
  const pts = (list) => list.map((c) => [r(c.x), r(c.z), r(c.r || 0)]).join('|');
  return JSON.stringify({
    layout: Object.entries(w.layout).map(([k, v]) => k + ':' + (typeof v === 'object' ? JSON.stringify(v) : v)).sort(),
    colliders: pts(w.colliders),
    occluders: pts(w.occluders),
    nColliders: w.colliders.length,
    spawn: [r(window.__game.level.player.pos.x), r(window.__game.level.player.pos.z)],
    ground: [r(w.groundH(0, 0)), r(w.groundH(37, -19)), r(w.groundH(-64, 88))],
  });
})()`;

// Один прогін «випробування дня» з довільними налаштуваннями гравця.
async function playDuel({ mapSize, mapStyle, quality, daily = 'bank', nick = 'Влад' }) {
  await boot(nick);
  await page.evaluate(({ mapSize, mapStyle, quality, daily }) => {
    const g = window.__game;
    g.save.mapSize = mapSize;
    g.save.mapStyle = mapStyle;
    g.save.quality = quality;
    g.quests.list.forEach((q) => { q.done = true; });
    g.saveGame();
    g.dailyChallengeId = () => daily;
    g.weeklyChallengeId = () => '__none';
    g.test.startBank();
  }, { mapSize, mapStyle, quality, daily });
  await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.bank, null, { timeout: 30000 });
  return page.evaluate(SNAPSHOT);
}

// 1️⃣ Той самий день у двох гравців з ПРОТИЛЕЖНИМИ налаштуваннями карти і графіки
const a = await playDuel({ mapSize: 'huge', mapStyle: 'stone', quality: 'fast', nick: 'Влад' });
const usedA = await page.evaluate(() => ({ size: window.__game.level.mapSize, style: window.__game.level.mapStyle }));
// добіг до кінця — результат летить у лобі тим самим пінгом, що й денний топ Шторму
await page.evaluate(() => { window.__game.level.stats.time = 83; window.__game._endBankRun(true); });
await page.waitForTimeout(1200);

const b = await playDuel({ mapSize: 'small', mapStyle: 'lakes', quality: 'high', nick: 'Тарас' });
const usedB = await page.evaluate(() => ({ size: window.__game.level.mapSize, style: window.__game.level.mapStyle }));

check(a === b, 'ОДНАКОВИЙ ДЕНЬ → ОДНАКОВА КАРТА, попри протилежні налаштування гравців',
  a === b ? `(${a.length} символів знімка)` : 'знімки світу розійшлись');
check(usedA.size === 'standard' && usedA.style === 'classic' && usedB.size === 'standard' && usedB.style === 'classic',
  'режим дня йде на фіксованій карті, а не на налаштуваннях сейва', JSON.stringify({ usedA, usedB }));

// 2️⃣ Контроль: без піна дня ті самі налаштування дають ІНШУ карту.
// Без цього перевірка вище була б порожньою — «однаково» могло б означати
// «налаштування взагалі ні на що не впливають».
const control = await playDuel({ mapSize: 'huge', mapStyle: 'stone', quality: 'fast', daily: '__none', nick: 'Тарас' });
check(control !== a, 'контроль: поза дуеллю налаштування карти таки міняють світ (перевірка не порожня)');

// 3️⃣ Спроба програшу теж їде на дошку — програш не карається
await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => 'bank';
  g._endBankRun(false);
});
await page.waitForTimeout(1200);

// одразу після забігу дитина бачить порівняння, не шукаючи його в меню
const toast = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((n) => n.textContent).join(' | '));
check(/Дуель дня/.test(toast) && toast.includes('Влад') && toast.includes('1:23'),
  'після забігу одразу видно тост «ти — так, друг — так»', toast.replace(/\s+/g, ' ').slice(0, 160));

// 4️⃣ Дошка лобі: обидва результати видно, і зрозуміло, хто як пройшов
const board = await page.evaluate(async (p) => {
  const r = await fetch(`http://localhost:${p}/lobby/state`);
  return (await r.json()).duel;
}, PORT);
const vlad = board.find((e) => e.nick === 'Влад');
const taras = board.find((e) => e.nick === 'Тарас');
check(!!vlad && vlad.m === 'bank' && vlad.w === true && vlad.ms === 83000, 'перемога Влада на спільній дошці з часом 1:23', JSON.stringify(vlad));
check(!!taras && taras.w === false, 'той, хто не пройшов, теж видно — його спроба не зникає', JSON.stringify(taras));

// 5️⃣ Той самий блок у меню «Грати»: обидва рядки намальовані, свій — підсвічений
await page.evaluate(() => {
  const g = window.__game;
  g.dailyChallengeId = () => 'bank';
  g.endLevel();
  g.renderSoloMenu();
});
await page.waitForFunction(() => {
  const el = document.getElementById('duel-board');
  return el && !el.hidden && el.querySelectorAll('.duel-row').length >= 2;
}, null, { timeout: 10000 }).catch(() => {});
const ui = await page.evaluate(() => {
  const el = document.getElementById('duel-board');
  return el ? { hidden: el.hidden, text: el.textContent, rows: el.querySelectorAll('.duel-row').length, me: el.querySelectorAll('.duel-row.me').length } : null;
});
check(!!ui && !ui.hidden && ui.rows >= 2, 'дошка дуелі намальована в меню «Грати»', JSON.stringify(ui && ui.rows));
check(!!ui && ui.text.includes('1:23') && ui.text.includes('Влад') && ui.text.includes('Тарас'),
  'у меню видно, хто як пройшов', ui ? ui.text.replace(/\s+/g, ' ').slice(0, 160) : '');
// ⭐ ставить лише сервер (прапорець me за cid), а GET /lobby/state його не має —
// тож у меню зірки немає взагалі. Вгадувати «мій рядок» за збігом ніка не можна:
// двоє друзів можуть назватись однаково, і дитину підсвітило б чужим часом.
check(!!ui && ui.me === 0, 'жодного рядка не підсвічено навмання — зірку дає тільки сервер', JSON.stringify(ui && ui.me));
// а на дошці з пінга (де me є) свій рядок таки позначений — це видно з тоста вище
check(!!ui && ui.text.includes('Тарас'), 'себе дитина впізнає за власним іменем, а не за здогадкою');
check(!!ui && !/програв|поразк|Поразк/.test(ui.text), 'жодних принизливих формулювань — програш не карається');

check(errors.length === 0, 'без помилок у консолі', errors.slice(0, 3).join(' | '));

await closeTest();
relay.kill();
console.log(fail ? `\n❌ ПРОВАЛЕНО ${fail}` : '\n🎉 ДУЕЛЬ ДНЯ: карта однакова, результат спільний');
process.exit(fail ? 1 : 0);
