// Локальний relay-сервер для розробки кооперативу.
// Той самий протокол, що й у Cloudflare-воркера (worker/relay-worker.js):
//   підключення: ws://localhost:8742/ws?room=КОД&create=1 (хост) | ?room=КОД (гість)
//   клієнт → relay: {to: 0|id, d: <будь-що>}   (0 = усім іншим)
//   relay → клієнт: {from: id, d: <будь-що>}
//   службові:       {t:'relay', you, isHost, peers:[...]}, {t:'peer', id, on}, {t:'err', code}
// Хост завжди отримує id 1. Кімната живе, поки живий хост (грейс 90с на реконект).
import { WebSocketServer } from 'ws';

const PORT = parseInt(process.env.PORT || '8742', 10);
const MAX_PLAYERS = 4;
const HOST_GRACE_MS = 90_000;

const rooms = new Map(); // code -> { sockets: Map<id, ws>, nextId, hostTimer }

const wss = new WebSocketServer({ port: PORT });
console.log(`[relay] ws://localhost:${PORT}/ws?room=CODE`);

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const create = url.searchParams.get('create') === '1';
  const resumeId = parseInt(url.searchParams.get('resume') || '0', 10);
  if (!code) { send(ws, { t: 'err', code: 'badroom' }); ws.close(); return; }

  let room = rooms.get(code);
  if (create) {
    if (room && room.sockets.has(1)) { send(ws, { t: 'err', code: 'taken' }); ws.close(); return; }
    if (!room) { room = { sockets: new Map(), nextId: 2, hostTimer: null }; rooms.set(code, room); }
  } else if (!room) {
    send(ws, { t: 'err', code: 'noroom' }); ws.close(); return;
  }

  let id;
  if (create) id = 1;
  else if (resumeId >= 2 && !room.sockets.has(resumeId)) id = resumeId; // реконект гостя зі старим id
  else id = room.nextId++;
  if (!create && room.sockets.size >= MAX_PLAYERS) { send(ws, { t: 'err', code: 'full' }); ws.close(); return; }

  if (id === 1 && room.hostTimer) { clearTimeout(room.hostTimer); room.hostTimer = null; }
  room.sockets.set(id, ws);
  send(ws, { t: 'relay', you: id, isHost: id === 1, peers: [...room.sockets.keys()].filter((p) => p !== id) });
  for (const [pid, sock] of room.sockets) if (pid !== id) send(sock, { t: 'peer', id, on: true });
  console.log(`[relay] ${code}: +${id} (${room.sockets.size} у кімнаті)`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg == null || msg.d === undefined) return;
    const env = JSON.stringify({ from: id, d: msg.d });
    if (msg.to === 0) {
      for (const [pid, sock] of room.sockets) if (pid !== id && sock.readyState === 1) sock.send(env);
    } else {
      const target = room.sockets.get(msg.to | 0);
      if (target && target.readyState === 1) target.send(env);
    }
  });

  ws.on('close', () => {
    if (room.sockets.get(id) !== ws) return; // вже замінений реконектом
    room.sockets.delete(id);
    for (const [, sock] of room.sockets) send(sock, { t: 'peer', id, on: false });
    console.log(`[relay] ${code}: -${id} (${room.sockets.size} лишилось)`);
    if (id === 1) {
      // хост зник: даємо час на реконект, потім закриваємо кімнату
      room.hostTimer = setTimeout(() => {
        for (const [, sock] of room.sockets) { send(sock, { t: 'err', code: 'hostgone' }); sock.close(); }
        rooms.delete(code);
        console.log(`[relay] ${code}: кімнату закрито`);
      }, HOST_GRACE_MS);
    } else if (room.sockets.size === 0 && !room.hostTimer) {
      rooms.delete(code);
    }
  });
});
