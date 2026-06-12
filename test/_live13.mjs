// 🌐 Жива перевірка v13 через ПРОД Cloudflare: батчинг через прод-relay
// і Лобі DO (кімната в списку → вхід без кода → гра → закриття).
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const RELAY = 'wss://zr-relay.slonce70.workers.dev';
const API = 'https://zr-relay.slonce70.workers.dev';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ПРОД: ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lobbyState = async () => (await fetch(`${API}/lobby/state`)).json();
async function waitLobby(cond, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const st = await lobbyState();
    if (cond(st)) return st;
    await sleep(700);
  }
  return null;
}

const LAUNCH = {
  args: ['--use-angle=swiftshader', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
};
const browserA = await chromium.launch(LAUNCH);
const browserB = await chromium.launch(LAUNCH);
const A = await (await browserA.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const B = await (await browserB.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errsA = [];
const errsB = [];
A.on('pageerror', (e) => errsA.push(e.message));
B.on('pageerror', (e) => errsB.push(e.message));
A.on('console', (m) => { if (m.type() === 'error') errsA.push(m.text()); });
B.on('console', (m) => { if (m.type() === 'error') errsB.push(m.text()); });

let code = null;
try {
  A.setDefaultTimeout(60000);
  B.setDefaultTimeout(60000);
  await A.goto(`${BASE}/?test&fresh&relay=${RELAY}`);
  await B.goto(`${BASE}/?test&fresh&relay=${RELAY}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

  // хост: нік → публічна кімната
  await A.evaluate(() => localStorage.setItem('zr-nick', 'тест-тато'));
  await A.click('#btn-coop');
  await A.click('#btn-coop-create');
  await A.waitForSelector('#overlay-lobby.show', { timeout: 20000 });
  code = await A.evaluate(() => window.__game.coop.session.room);
  check('кімнату створено через прод-relay', !!code, code);

  let st = await waitLobby((s) => s.rooms.some((r) => r.code === code));
  check('кімната в прод-Лобі', !!st);

  // гість: бачить кімнату в панелі і заходить кнопкою
  await B.evaluate(() => localStorage.setItem('zr-nick', 'тест-влад'));
  await B.click('#btn-coop');
  await B.waitForSelector(`.cr-join[data-code="${code}"]`, { timeout: 25000 });
  await B.click(`.cr-join[data-code="${code}"]`);
  await B.waitForSelector('#overlay-lobby.show', { timeout: 20000 });
  const roster = await A.evaluate(() => window.__game.coop.session.roster.size);
  check('вхід без кода через прод', roster === 2, `у кімнаті: ${roster}`);

  // рівень: синхронізація через пачки
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level.net, null, { timeout: 40000 });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level.net, null, { timeout: 40000 });
  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 0, null, { timeout: 30000 });
  await A.waitForFunction(() => {
    const s = window.__game.test.coopState();
    return s.remotes.length === 1 && Math.abs(s.remotePos[s.remotes[0]].x) > 0.01;
  }, null, { timeout: 20000 });
  check('світ синхронний через прод (зомбі + позиції)', true);

  const a0 = await A.evaluate(() => { const t = window.__game.coop.session.transport; return { f: t.txFlushes, m: t.txMsgs }; });
  await sleep(8000);
  const a1 = await A.evaluate(() => { const t = window.__game.coop.session.transport; return { f: t.txFlushes, m: t.txMsgs }; });
  const rate = (a1.f - a0.f) / 8;
  const ratio = (a1.m - a0.m) / Math.max(1, a1.f - a0.f);
  check('батчинг на проді (≤13 send/с, ≥1.3 msg/send)', rate <= 13 && ratio >= 1.3, `${rate.toFixed(1)}/с ×${ratio.toFixed(2)}`);

  st = await waitLobby((s) => { const r = s.rooms.find((x) => x.code === code); return r && r.state === 'game'; });
  check('кімната «у грі» в прод-списку', !!st);

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консолі чисті', realErrsA.length === 0 && realErrsB.length === 0,
    [...realErrsA, ...realErrsB].slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ПРОД-ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  // прибрати кімнату зі списку, щоб діти не тицяли в тестову
  try {
    if (code) await A.evaluate(() => {
      const c = window.__game.coop;
      const r = c.session.room;
      c.session.leave();
      if (r) c.lobbyNet.announceClose(r);
    });
    await sleep(1200);
  } catch (e) { /* ignore */ }
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
}
const after = await lobbyState();
check('тестову кімнату прибрано', code && !after.rooms.some((r) => r.code === code));
console.log(failures === 0 ? '\n🎉 ПРОД v13 ПРАЦЮЄ' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
