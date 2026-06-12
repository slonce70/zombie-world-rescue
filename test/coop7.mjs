// 🤝⚔️ Кооп-тест 7: складність ×N гравців (HP/шкода зомбі і босів),
// чип кода кімнати в HUD, вхід ТРЕТЬОГО гравця зі списку кімнат прямо в гру,
// будь-яка країна у кооп-лобі після України.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';

const BASE = 'http://localhost:8741';
const RELAY_PORT = 8753;
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = spawn('node', ['relay/dev-relay.mjs'], {
  env: { ...process.env, PORT: String(RELAY_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await sleep(600);

const LAUNCH = {
  args: ['--use-angle=swiftshader', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
};
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
let browserC = null;
let C = null;
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errsA = [];
const errsB = [];
const errsC = [];
A.on('pageerror', (e) => errsA.push(e.message));
B.on('pageerror', (e) => errsB.push(e.message));
A.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text()); });
B.on('console', (m) => { if (m.type() === 'error') errsB.push(m.text()); });

try {
  for (const P of [A, B]) P.setDefaultTimeout(90000);
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  for (const P of [A, B]) {
    await P.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 60000 });
  }

  // хост звільнив лише Україну — у лобі має відкритись ВЕСЬ світ
  await A.evaluate(() => {
    window.__game.save.liberated = { UKR: true };
    window.__game.saveGame();
  });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(500);

  // 1. кооп-лобі: Туреччина доступна одразу після України
  const turPick = await A.evaluate(() => {
    const el = document.querySelector('#lobby-countries .lobby-country[data-id="TUR"]');
    return el && el.classList.contains('pick') && !el.classList.contains('locked');
  });
  check('кооп-лобі: після України можна обрати Туреччину', turPick === true);

  // 2. старт удвох: зомбі ×2 з ПЕРШОГО спавна
  await A.evaluate(() => window.__game.test.coopSetCountry('UKR'));
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level.net, null, { timeout: 90000 });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level.net, null, { timeout: 90000 });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());
  // чекаємо, поки гість надішле першу позицію (хост побачить його у level.players)
  await A.waitForFunction(() => window.__game.test.coopState().remotes.length === 1, null, { timeout: 20000 });

  const mul2 = await A.evaluate(() => window.__game.level.zombies.coopMul());
  check('двоє у грі → множник ×2', mul2 === 2, `×${mul2}`);
  const walker2 = await A.evaluate(() => {
    const z = window.__game.level.zombies.list.find((zz) => zz.type === 'walker' && !zz.elite && !zz.golden && zz.state !== 'dead');
    return z ? { mhp: z.maxHp, base: z.stats.hp } : null;
  });
  check('початковий зомбі має ×2 HP', walker2 && walker2.mhp === walker2.base * 2, JSON.stringify(walker2));
  const boss2 = await A.evaluate(() => {
    const zm = window.__game.level.zombies;
    const cfg = window.__game.level.country.boss.hp;
    const b = zm.spawnBoss();
    const hp = b.maxHp;
    zm.despawnBoss();
    return { hp, want: cfg * 2 };
  });
  check('бос удвох ×2 HP', boss2.hp === boss2.want, JSON.stringify(boss2));

  // 3. чип кода кімнати в HUD у обох
  const chipA = await A.evaluate(() => {
    const el = document.getElementById('coop-room');
    return { vis: el.style.display !== 'none', text: el.textContent };
  });
  const chipB = await B.evaluate(() => document.getElementById('coop-room').textContent);
  check('чип кімнати видно хосту (код + 2/4 + ×2)',
    chipA.vis && chipA.text.includes(code) && chipA.text.includes('2/4') && chipA.text.includes('×2'), chipA.text);
  check('чип кімнати видно гостю', chipB.includes(code) && chipB.includes('2/4'), chipB);

  // 4. ТРЕТІЙ гравець заходить у гру, що ВЖЕ ЙДЕ, зі списку кімнат
  browserC = await chromium.launch(LAUNCH);
  C = await (await browserC.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  C.on('pageerror', (e) => errsC.push(e.message));
  C.on('console', (m) => { if (m.type() === 'error') errsC.push(m.text()); });
  C.setDefaultTimeout(90000);
  await C.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await C.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 60000 });
  await C.evaluate(() => localStorage.setItem('zr-nick', 'Бабуся'));
  await C.click('#btn-coop');
  await C.waitForSelector(`.cr-join[data-code="${code}"]`, { timeout: 25000 });
  const rowState = await C.evaluate((cd) => {
    const row = document.querySelector(`.cr-join[data-code="${cd}"]`).closest('.coop-room');
    return row.textContent;
  }, code);
  check('у списку видно, що кімната «у грі»', rowState.includes('у грі'), rowState.trim());
  await C.click(`.cr-join[data-code="${code}"]`);
  await C.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.net, null, { timeout: 90000 });
  await C.evaluate(() => window.__game.test.god());
  await C.waitForFunction(() => window.__game.test.coopState().aliveZombies > 0, null, { timeout: 60000 });
  check('третій гравець у бою посеред гри (mid-join зі списку)', true);

  // 5. тепер команда з 3 → нові зомбі ×3, чип 3/4
  await sleep(800);
  const mul3 = await A.evaluate(() => window.__game.level.zombies.coopMul());
  check('троє у грі → множник ×3', mul3 === 3, `×${mul3}`);
  const fresh3 = await A.evaluate(() => {
    const L = window.__game.level;
    const z = L.zombies.spawn('walker', L.player.pos.x + 25, L.player.pos.z + 25, {});
    const out = { mhp: z.maxHp, base: z.stats.hp };
    z.gone = true;
    return out;
  });
  check('новий зомбі утрьох ×3 HP', fresh3.mhp === fresh3.base * 3, JSON.stringify(fresh3));
  const chip3 = await A.evaluate(() => document.getElementById('coop-room').textContent);
  check('чип оновився до 3/4 і ×3', chip3.includes('3/4') && chip3.includes('×3'), chip3);

  const realA = errsA.filter((e) => !e.includes('favicon'));
  const realB = errsB.filter((e) => !e.includes('favicon'));
  const realC = errsC.filter((e) => !e.includes('favicon'));
  check('консолі чисті (всі троє)', realA.length + realB.length + realC.length === 0,
    [...realA, ...realB, ...realC].slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop7-fail-A.png' }).catch(() => {});
  if (C) await C.screenshot({ path: 'shots/coop7-fail-C.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  if (browserC) await browserC.close().catch(() => {});
  relay.kill();
}

console.log(failures === 0 ? '\n🎉 КООП ×N + MID-JOIN ЗІ СПИСКУ ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
