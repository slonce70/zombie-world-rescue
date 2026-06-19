// 🟢📦 Кооп-тест 6: лобі-сервіс і батчинг повідомлень.
// UX: нік одразу → панель з онлайном/кімнатами; публічна кімната видна другому
// гравцю і відкривається кнопкою «Зайти» без кода; закриття прибирає її зі списку.
// Транспорт: повідомлення летять пачками (~10 ws-send/с замість 25+).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { spawnRelay } from './_relay.mjs';

const BASE = 'http://localhost:8741';
const RELAY_PORT = 8752;
mkdirSync(new URL('../shots', import.meta.url).pathname, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lobbyState = async () => (await fetch(`http://localhost:${RELAY_PORT}/lobby/state`)).json();
// чекаємо умову на стані лобі (пінги летять раз на ~8с)
async function waitLobby(cond, timeout = 15000) {
  const t0 = Date.now();
  let st = null;
  while (Date.now() - t0 < timeout) {
    st = await lobbyState();
    if (cond(st)) return st;
    await sleep(500);
  }
  return null;
}

const relay = await spawnRelay(RELAY_PORT);

const LAUNCH = {
  args: ['--use-angle=swiftshader', '--disable-dev-shm-usage', '--no-sandbox', '--disable-background-timer-throttling',
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

try {
  A.setDefaultTimeout(60000);
  B.setDefaultTimeout(60000);
  await A.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await B.goto(`${BASE}/?test&fresh&relay=ws://localhost:${RELAY_PORT}`);
  await A.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });
  await B.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

  // ---------- UX: нік одразу ----------
  await A.click('#btn-coop');
  await A.waitForSelector('#overlay-coop.show');
  const step1 = await A.evaluate(() => ({
    nick: document.getElementById('coop-step-nick').style.display !== 'none',
    main: document.getElementById('coop-step-main').style.display !== 'none',
  }));
  check('новий гравець: спершу екран ніка', step1.nick && !step1.main, JSON.stringify(step1));
  await A.screenshot({ path: 'shots/coop6-step-nick.png' });

  // регресія: буква E друкується в полі (фікс v9)
  await A.click('#coop-nick');
  await A.keyboard.type('TATOE');
  const typed = await A.evaluate(() => document.getElementById('coop-nick').value);
  check('буква E друкується у ніку', typed === 'TATOE', `value="${typed}"`);

  await A.click('#btn-coop-nick');
  const step2 = await A.evaluate(() => ({
    nick: document.getElementById('coop-step-nick').style.display !== 'none',
    main: document.getElementById('coop-step-main').style.display !== 'none',
    me: document.getElementById('coop-me-nick').textContent,
  }));
  check('після ніка — головна панель, нік збережено', !step2.nick && step2.main && step2.me === 'TATOE', JSON.stringify(step2));

  // ---------- публічна кімната в лобі-сервісі ----------
  await A.evaluate(() => { document.getElementById('coop-public').checked = true; window.__game.coop.publicOn = true; });
  await A.click('#btn-coop-create');
  await A.waitForSelector('#overlay-lobby.show');
  const code1 = await A.evaluate(() => window.__game.coop.session.room);
  let st = await waitLobby((s) => s.rooms.some((r) => r.code === code1));
  check('кімната зʼявилась у лобі-сервісі', !!st, st ? '' : 'не дочекались');
  if (st) {
    const r = st.rooms.find((x) => x.code === code1);
    check('кімната з ніком/режимом/лічильником', r.host === 'TATOE' && r.mode === 'campaign' && r.n === 1 && r.state === 'lobby', JSON.stringify(r));
    check('онлайн рахується', st.online >= 1 && st.players.includes('TATOE'), JSON.stringify({ online: st.online, players: st.players }));
  }

  // тумблер у кімнатному лобі видно хосту
  const pubRow = await A.evaluate(() => document.getElementById('lobby-public-row').style.display !== 'none');
  check('тумблер публічності в лобі кімнати', pubRow);
  await A.screenshot({ path: 'shots/coop6-room-lobby.png' });

  // закриття кімнати прибирає її зі списку одразу
  await A.click('#btn-lobby-leave');
  st = await waitLobby((s) => !s.rooms.some((r) => r.code === code1), 6000);
  check('закрита кімната зникла зі списку', !!st);

  // ---------- другий гравець бачить кімнату і заходить без кода ----------
  await A.click('#btn-coop');
  await A.waitForSelector('#overlay-coop.show');
  const straightMain = await A.evaluate(() => document.getElementById('coop-step-main').style.display !== 'none');
  check('зі збереженим ніком — одразу панель', straightMain);
  await A.click('#btn-coop-create');
  await A.waitForSelector('#overlay-lobby.show');
  const code2 = await A.evaluate(() => window.__game.coop.session.room);

  await B.evaluate(() => localStorage.setItem('zr-nick', 'Влад'));
  await B.click('#btn-coop');
  await B.waitForSelector('#overlay-coop.show');
  await B.waitForSelector(`.cr-join[data-code="${code2}"]`, { timeout: 20000 });
  const sideB = await B.evaluate(() => ({
    online: document.getElementById('coop-online-n').textContent,
    players: document.getElementById('coop-players').textContent,
    room: document.querySelector('.coop-room .cr-info b').textContent,
  }));
  check('гість бачить онлайн ≥ 2 і гравців', parseInt(sideB.online, 10) >= 2 && sideB.players.includes('TATOE') && sideB.players.includes('Влад'), JSON.stringify(sideB));
  check('у списку кімнат — кімната хоста', sideB.room === 'TATOE');
  await B.screenshot({ path: 'shots/coop6-browser.png' });

  await B.click(`.cr-join[data-code="${code2}"]`);
  await B.waitForSelector('#overlay-lobby.show');
  await sleep(500);
  const rosterA = await A.evaluate(() => window.__game.coop.session.roster.size);
  const rosterB = await B.evaluate(() => window.__game.coop.session.roster.size);
  check('вхід без кода: у кімнаті двоє', rosterA === 2 && rosterB === 2, `A:${rosterA} B:${rosterB}`);
  st = await waitLobby((s) => { const r = s.rooms.find((x) => x.code === code2); return r && r.n === 2; });
  check('лічильник кімнати оновився до 2/4', !!st);

  // ---------- рівень: усе синхронно через пачки ----------
  await A.evaluate(() => window.__game.test.coopStartLevel());
  await A.waitForFunction(() => window.__game.state === 'level' && window.__game.level.net, null, { timeout: 40000 });
  await B.waitForFunction(() => window.__game.state === 'level' && window.__game.level.net, null, { timeout: 40000 });
  await A.evaluate(() => window.__game.test.god());
  await B.evaluate(() => window.__game.test.god());

  await B.waitForFunction(() => window.__game.test.coopState().aliveZombies > 0, null, { timeout: 30000 });
  check('зомбі долетіли гостю (події в пачках)', true);
  await A.waitForFunction(() => {
    const s = window.__game.test.coopState();
    return s.remotes.length === 1 && Math.abs(s.remotePos[s.remotes[0]].x) > 0.01;
  }, null, { timeout: 20000 });
  check('хост бачить гостя (позиції в пачках)', true);

  st = await waitLobby((s) => { const r = s.rooms.find((x) => x.code === code2); return r && r.state === 'game'; });
  check('кімната у списку позначена «у грі»', !!st);

  // батчинг: фактичних ws.send значно менше за логічні повідомлення
  const sample = async (P) => P.evaluate(() => {
    const t = window.__game.coop.session.transport;
    return { f: t.txFlushes, m: t.txMsgs };
  });
  const a0 = await sample(A);
  const b0 = await sample(B);
  await sleep(8000);
  const a1 = await sample(A);
  const b1 = await sample(B);
  const aRate = (a1.f - a0.f) / 8;
  const bRate = (b1.f - b0.f) / 8;
  const aRatio = (a1.m - a0.m) / Math.max(1, a1.f - a0.f);
  const bRatio = (b1.m - b0.m) / Math.max(1, b1.f - b0.f);
  check('хост: ≤13 ws-send/с', aRate <= 13, `${aRate.toFixed(1)}/с, пачка ×${aRatio.toFixed(2)}`);
  check('гість: ≤11 ws-send/с', bRate <= 11, `${bRate.toFixed(1)}/с, пачка ×${bRatio.toFixed(2)}`);
  check('пачки реально працюють (≥1.3 msg/send)', aRatio >= 1.3 && bRatio >= 1.3, `A×${aRatio.toFixed(2)} B×${bRatio.toFixed(2)}`);

  // постріл гостя крізь пачку: зомбі вмирає, кіл зараховано гостю
  const killsB0 = await B.evaluate(() => window.__game.level.stats.kills);
  await B.evaluate(() => {
    const g = window.__game;
    const z = g.level.zombies.list.find((zz) => zz.state !== 'dead');
    if (z) g.level.net.shotReport('pistol', { x: z.x, y: 1, z: z.z }, [[z.nid, 9999, 0]]);
  });
  await B.waitForFunction((k0) => window.__game.level.stats.kills > k0, killsB0, { timeout: 8000 });
  check('постріл гостя вбиває зомбі (кіл зараховано)', true);

  const realErrsA = errsA.filter((e) => !e.includes('favicon'));
  const realErrsB = errsB.filter((e) => !e.includes('favicon'));
  check('консоль хоста чиста', realErrsA.length === 0, realErrsA.slice(0, 3).join(' | '));
  check('консоль гостя чиста', realErrsB.length === 0, realErrsB.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
  await A.screenshot({ path: 'shots/coop6-fail-A.png' }).catch(() => {});
  await B.screenshot({ path: 'shots/coop6-fail-B.png' }).catch(() => {});
} finally {
  await browserA.close().catch(() => {});
  await browserB.close().catch(() => {});
  relay.kill();
}

console.log(failures === 0 ? '\n🎉 ЛОБІ + БАТЧИНГ ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
