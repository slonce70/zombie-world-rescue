// Relay-протокол: reconnect має замінювати старий сокет тим самим pid навіть у повній кімнаті.
import { spawn } from 'child_process';
import WebSocket from 'ws';

const PORT = 8756;
const ROOM = 'EDGE';
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const relay = spawn('node', ['relay/dev-relay.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await sleep(600);

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

  const replacement = await connect('&resume=2');
  opened.push(replacement.ws);
  check('resume у повній кімнаті повертає той самий pid', replacement.msg.t === 'relay' && replacement.msg.you === 2,
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
