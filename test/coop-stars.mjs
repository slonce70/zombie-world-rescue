// ⭐ Кооп-тест «Зірки разом» (v298): вторинна ціль і ⭐-зірки у кооп-кампанії —
// (а) обидва бачать ОДИН чип цілі (той самий тип, командний);
// (д) mid-join бачить чип цілі й актуальний тип зі state-синку;
// (б) форс виконання на ХОСТІ → подія `soc` → тік (so.done) у гостя;
// (в) перемога → у ОБОХ у сейві ⭐≥2 за країну (кожен нараховує СОБІ локально);
// (г) «гість падав» (свій лічильник падінь = 1) → у гостя нема ⭐3, а в хоста (0 падінь) є.
//
// Милосердя (mercy) лишається соло-only — у коопі його не чіпаємо (тут не перевіряємо).
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';
import { mkdirSync } from 'fs';
import { spawnRelay } from './_relay.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const RELAY_PORT = 8775; // унікальний серед coop*-тестів (зайняті: 8743…8773)
const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = await spawnRelay(RELAY_PORT);

const LAUNCH = {
  args: ['--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'],
};
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
let browserC = null;
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
  A.setDefaultTimeout(60000 * SLOW);
  B.setDefaultTimeout(60000 * SLOW);
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 * SLOW });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 20000 * SLOW });
  const code = await A.evaluate(() => window.__game.test.coopCreate('Тато'));
  await B.evaluate((c) => window.__game.test.coopJoin(c, 'Влад'), code);
  await sleep(400 * SLOW);
  // ⭐ форсимо КОМАНДНУ ціль «Убий N елітних» на ХОСТІ (детермінований пул кооп-цілей)
  await A.evaluate(() => window.__game.test.forceSecondary('elites'));
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 5, null, { timeout: 20000 * SLOW });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());
  const cid = await A.evaluate(() => window.__game.level.countryId);
  check('кооп-кампанія готова', !!cid, `код ${code}, країна ${cid}`);

  // ---- (а) обидва бачать ОДИН чип цілі того самого типу ----
  const soA = await A.evaluate(() => window.__game.test.secondaryState());
  const soB = await B.waitForFunction(() => {
    const s = window.__game.test.secondaryState();
    return s && s.id ? s : null;
  }, null, { timeout: 15000 * SLOW }).then((h) => h.jsonValue()).catch(() => null);
  check('(а) у хоста є вторинна ціль «elites»', !!(soA && soA.id === 'elites'), JSON.stringify(soA));
  check('(а) у гостя є та сама ціль (той самий id/target)',
    !!(soB && soB.id === soA.id && soB.target === soA.target), `хост ${JSON.stringify(soA)} / гість ${JSON.stringify(soB)}`);
  // чип рендериться у mission-list для гостя
  const chipB = await B.evaluate(() => {
    const g = window.__game;
    g.hud.update(0.016);
    const el = document.getElementById('mission-list');
    const chip = el ? el.querySelector('.mission.secondary') : null;
    return chip ? chip.textContent.trim() : null;
  });
  check('(а) чип цілі видно в HUD гостя', !!chipB, chipB || 'нема');

  // ---- (д) mid-join: третій гравець бачить чип цілі зі state-синку ----
  browserC = await browserB.newContext({ viewport: { width: 1280, height: 800 } });
  const C = await browserC.newPage();
  C.on('pageerror', (e) => errsC.push(e.message));
  C.on('console', (m) => { if (m.type() === 'error') errsC.push(m.text()); });
  C.setDefaultTimeout(60000 * SLOW);
  await C.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await C.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 * SLOW });
  let joinedC = false;
  for (let attempt = 1; attempt <= 3 && !joinedC; attempt++) {
    joinedC = await C.evaluate((c) => window.__game.test.coopJoin(c, 'Оля').then(() => true, (e) => (console.log('join fail:', e.message), false)), code);
    if (!joinedC) {
      console.log(`↻ джойн C не пройшов (спроба ${attempt}/3) — даємо хосту розвантажити backlog`);
      await sleep(2000 * SLOW);
    }
  }
  check('(д) третій гравець приєднався', joinedC);
  await C.waitForFunction(() => window.__game.state === 'level', null, { timeout: 30000 * SLOW });
  const soC = await C.waitForFunction(() => {
    const s = window.__game.test.secondaryState();
    return s && s.id ? s : null;
  }, null, { timeout: 20000 * SLOW }).then((h) => h.jsonValue()).catch(() => null);
  check('(д) mid-joiner бачить той самий чип цілі', !!(soC && soC.id === soA.id), JSON.stringify(soC));
  await browserC.close();
  browserC = null;
  await A.waitForFunction(() => window.__game.test.coopState().roster.length === 2, null, { timeout: 15000 * SLOW });

  // ---- (б) форс виконання на ХОСТІ → `soc` → тік (done) у гостя ----
  const doneHost = await A.evaluate(() => window.__game.test.forceSecondaryDone());
  check('(б) хост виконав командну ціль', doneHost === true);
  // ширше вікно: на задушеному раннері `soc` стає в чергу за бэклогом снапшотів гостя —
  // на CI подія доїжджала за ~50с при SLOW=4 (⭐2 гість зрештою отримував)
  const doneB = await B.waitForFunction(() => {
    const s = window.__game.test.secondaryState();
    return s && s.done ? true : null;
  }, null, { timeout: 30000 * SLOW }).then(() => true).catch(() => false);
  check('(б) у гостя ціль позначилась виконаною (подія soc)', doneB);

  // ---- (в)+(г) перемога: кожен нараховує зірки СОБІ; гість «падав» → без ⭐3 ----
  const starsBefore = await Promise.all([
    A.evaluate((c) => (window.__game.save.stars || {})[c] || 0, cid),
    B.evaluate((c) => (window.__game.save.stars || {})[c] || 0, cid),
  ]);
  // гість «падав» один раз за забіг (свій локальний лічильник); хост — жодного падіння
  await B.evaluate(() => { window.__game.level.stats.deaths = 1; window.__game.victoryShown = false; });
  await A.evaluate(() => {
    const g = window.__game;
    g.level.stats.deaths = 0;
    g.victoryShown = false;
    g._showVictory(); // хост-перемога: нараховує СОБІ + шле `vict` гостю (→ netVictory→_showVictory)
  });
  await B.waitForFunction(() => window.__game.victoryShown === true, null, { timeout: 30000 * SLOW });
  await sleep(300 * SLOW);
  const starsA = await A.evaluate((c) => window.__game.test.starState().stars[c] || 0, cid);
  const starsB = await B.evaluate((c) => window.__game.test.starState().stars[c] || 0, cid);
  check('(в) у ХОСТА ⭐≥2 за країну', starsA >= 2, `⭐ ${cid}=${starsA} (було ${starsBefore[0]})`);
  check('(в) у ГОСТЯ ⭐≥2 за країну', starsB >= 2, `⭐ ${cid}=${starsB} (було ${starsBefore[1]})`);
  check('(г) ХОСТ без падінь → отримав ⭐3 (усі три)', starsA === 3, `⭐ ${cid}=${starsA}`);
  check('(г) ГІСТЬ падав → ⭐3 НЕ дали (лише ⭐1+⭐2)', starsB === 2, `⭐ ${cid}=${starsB}`);

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  const realErrsC = errsC.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
  check('(д) консоль mid-joiner без throw', realErrsC.length === 0, realErrsC.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop-stars-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop-stars-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  if (browserC) await browserC.close().catch(() => {});
  relay.kill();
  closeServer();
}

console.log(failures === 0 ? '\n🎉 КООП «ЗІРКИ РАЗОМ» ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
