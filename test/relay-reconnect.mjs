// Relay-протокол: reconnect має замінювати старий сокет тим самим pid навіть у повній кімнаті.
import WebSocket from 'ws';
import { spawnRelay } from './_relay.mjs';

const PORT = 8756;
const ROOM = 'EDGE';
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = await spawnRelay(PORT);

const opened = [];
function connect(query) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws?room=${ROOM}${query}`);
    const messages = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (msg.t === 'relay' || msg.t === 'err') resolve({ ws, msg, messages });
    });
    ws.on('error', reject);
    ws.on('close', () => {});
  });
}

try {
  const host = await connect('&create=1');
  const g2 = await connect('');
  const g3 = await connect('');
  const g4 = await connect('');
  opened.push(host.ws, g2.ws, g3.ws, g4.ws);
  check('кімната заповнена 4 гравцями', host.msg.you === 1 && g2.msg.you === 2 && g3.msg.you === 3 && g4.msg.you === 4,
    `ids ${host.msg.you},${g2.msg.you},${g3.msg.you},${g4.msg.you}`);

  const g2key = g2.msg.rk;
  check('relay видає секрет слота (rk)', typeof g2key === 'string' && g2key.length >= 8, String(g2key));

  // 🔒 АДВЕРСАРІАЛЬНО: resume без правильного ключа НЕ перехоплює чужий слот
  const noKey = await connect('&resume=2');
  opened.push(noKey.ws);
  check('resume БЕЗ ключа не перехоплює слот (повна кімната → full)',
    noKey.msg.t === 'err' && noKey.msg.code === 'full', JSON.stringify(noKey.msg));
  const badKey = await connect('&resume=2&resumeKey=nonsense-key');
  opened.push(badKey.ws);
  check('resume з НЕВІРНИМ ключем не перехоплює слот (→ full)',
    badKey.msg.t === 'err' && badKey.msg.code === 'full', JSON.stringify(badKey.msg));
  // старий сокет pid=2 НЕ постраждав від спроб перехоплення
  check('живий гість pid=2 не вибитий хибним resume', g2.ws.readyState === WebSocket.OPEN);

  const replacement = await connect('&resume=2&resumeKey=' + encodeURIComponent(g2key));
  opened.push(replacement.ws);
  check('resume з ПРАВИЛЬНИМ ключем повертає той самий pid', replacement.msg.t === 'relay' && replacement.msg.you === 2,
    JSON.stringify(replacement.msg));

  let oldClosed = false;
  g2.ws.once('close', () => { oldClosed = true; });
  await sleep(500);
  check('старий сокет pid=2 закрито після заміни', oldClosed || g2.ws.readyState === WebSocket.CLOSED);

  replacement.ws.send(JSON.stringify({ to: 1, d: { t: 'resume-ping' } }));
  await sleep(300);
  const ping = host.messages.find((m) => m.from === 2 && m.d && m.d.t === 'resume-ping');
  check('новий сокет говорить від старого pid', !!ping);

  const peerOff = host.messages.find((m) => m.t === 'peer' && m.id === 2 && m.on === false);
  check('close старого сокета не шле peer-off для pid=2', !peerOff);

  const extra = await connect('');
  opened.push(extra.ws);
  check('новий пʼятий гравець усе ще отримує full', extra.msg.t === 'err' && extra.msg.code === 'full', JSON.stringify(extra.msg));

  // 🔌 ХОСТ (pid=1) теж reconnect’иться своїм ключем — авторитет повертається у межах грейсу
  const hostKey = host.msg.rk;
  check('relay видає секрет слота хосту (rk)', typeof hostKey === 'string' && hostKey.length >= 8, String(hostKey));
  const hostNoKey = await connect('&resume=1'); // без ключа — слот 1 не перехопити
  opened.push(hostNoKey.ws);
  check('resume=1 БЕЗ ключа не перехоплює хоста (→ full)', hostNoKey.msg.t === 'err' && hostNoKey.msg.code === 'full', JSON.stringify(hostNoKey.msg));
  const hostReconn = await connect('&resume=1&resumeKey=' + encodeURIComponent(hostKey));
  opened.push(hostReconn.ws);
  check('ХОСТ resume=1 з ключем повертає слот 1 (авторитет)', hostReconn.msg.t === 'relay' && hostReconn.msg.you === 1, JSON.stringify(hostReconn.msg));
  let hostOldClosed = false;
  host.ws.once('close', () => { hostOldClosed = true; });
  await sleep(500);
  check('старий сокет хоста закрито після resume=1', hostOldClosed || host.ws.readyState === WebSocket.CLOSED);
  const hostPeerOff = g3.messages.find((m) => m.t === 'peer' && m.id === 1 && m.on === false);
  check('reconnect хоста НЕ шле peer-off для pid=1 (гості не бачать «хост зник»)', !hostPeerOff);
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message);
} finally {
  for (const ws of opened) {
    try { ws.close(); } catch (e) { /* ignore */ }
  }
  relay.kill();
}

console.log(failures === 0 ? '\n🎉 RELAY RECONNECT EDGE ПРОЙДЕНО' : `\n💥 Провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
