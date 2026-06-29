// Локальний relay-сервер для розробки кооперативу.
// Той самий протокол, що й у Cloudflare-воркера (worker/relay-worker.js):
//   підключення: ws://localhost:8742/ws?room=КОД&create=1 (хост) | ?room=КОД (гість)
//   клієнт → relay: {to: 0|id, d: <будь-що>}   (0 = усім іншим)
//   relay → клієнт: {from: id, d: <будь-що>}
//   службові:       {t:'relay', you, isHost, peers:[...]}, {t:'peer', id, on}, {t:'err', code}
// Хост завжди отримує id 1. Кімната живе, поки живий хост (грейс 90с на реконект).
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { cleanNickSrv } from '../worker/nick.mjs';

const PORT = parseInt(process.env.PORT || '8742', 10);
const BOOT_TOKEN = `${process.pid}-${Date.now().toString(36)}`;
const MAX_PLAYERS = 4;
const HOST_GRACE_MS = 30_000;

const rooms = new Map(); // code -> { sockets: Map<id, ws>, nextId, hostTimer }

// 🏆 локальна Ліга в пам'яті — щоб розробка повністю працювала офлайн
const league = new Map(); // `${cid}|${mode}|${country}` -> {nick, score, team, ts}

// 💾 локальний хмарний сейв у пам'яті (дзеркало SaveVault DO з воркера)
const saves = new Map();     // cid -> {data, ts}
const saveLinks = new Map(); // code -> cid (постійний код відновлення)
const LINK_ALPHABET = 'ABCDEFHJKLMNPRSTUVWXYZ23456789';

// 🟢 локальне Лобі в пам'яті (дзеркало Lobby DO з воркера)
const LOBBY_TTL = 40_000;
const lobbyPlayers = new Map(); // cid -> {nick, ts}
const lobbyProfiles = new Map(); // cid -> {nick, countries, coins, crystals, kills, star, title, ts}
const lobbyRooms = new Map();   // code -> {cid, host, mode, country, n, state, build, ts}
let lobbyDay = '';              // 📅 унікальні гравці за сьогодні (дзеркало Lobby DO)
let lobbyToday = new Set();
function recordToday(now, cid) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== lobbyDay) { lobbyDay = day; lobbyToday = new Set(); }
  if (cid && lobbyToday.size < 100000) lobbyToday.add(cid);
}

function lobbyView(now) {
  for (const [cid, p] of lobbyPlayers) if (now - p.ts > LOBBY_TTL) lobbyPlayers.delete(cid);
  for (const [code, r] of lobbyRooms) if (now - r.ts > LOBBY_TTL) lobbyRooms.delete(code);
  if (lobbyProfiles.size > 800) {
    const old = [...lobbyProfiles.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < old.length - 800; i++) lobbyProfiles.delete(old[i][0]);
  }
  return {
    online: lobbyPlayers.size,
    today: lobbyToday.size,
    players: [...lobbyPlayers.values()].slice(0, 60).map((p) => p.nick),
    profiles: [...lobbyProfiles.values()].sort((a, b) => b.ts - a.ts).slice(0, 60),
    rooms: [...lobbyRooms.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, 20)
      .map(([code, r]) => ({ code, host: r.host, mode: r.mode, country: r.country, n: r.n, state: r.state, build: r.build })),
  };
}

function safeInt(v, min, max) {
  v = Math.floor(Number(v) || 0);
  return Math.max(min, Math.min(max, v));
}

function cleanProfile(nick, raw = {}, ts) {
  return {
    nick,
    countries: safeInt(raw.countries, 0, 99),
    coins: safeInt(raw.coins, 0, 999999),
    crystals: safeInt(raw.crystals, 0, 99999),
    kills: safeInt(raw.kills, 0, 999999),
    star: safeInt(raw.star || 1, 1, 40),
    title: String(raw.title || '').replace(/<[^>]*>/g, '').replace(/[<>]/g, '').slice(0, 24),
    ts,
  };
}

function lobbyPing(d) {
  const now = Date.now();
  const cid = String(d.cid || '').slice(0, 40);
  if (cid.length < 8) return null;
  const nick = cleanNickSrv(d.nick);
  lobbyPlayers.set(cid, { nick, ts: now });
  lobbyProfiles.set(cid, cleanProfile(nick, d.profile, now));
  recordToday(now, cid);
  if (d.close) {
    const code = String(d.close).toUpperCase().slice(0, 8);
    const r = lobbyRooms.get(code);
    if (r && r.cid === cid) lobbyRooms.delete(code);
  }
  if (d.room && d.room.code) {
    const code = String(d.room.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const existing = lobbyRooms.get(code);
    if (code && (!existing || existing.cid === cid)) {
      lobbyRooms.set(code, {
        cid, host: nick,
        mode: ['campaign', 'storm', 'arena'].includes(d.room.mode) ? d.room.mode : 'campaign',
        country: String(d.room.country || 'UKR').toUpperCase().slice(0, 4),
        n: Math.min(4, Math.max(1, d.room.n | 0)),
        state: d.room.state === 'game' ? 'game' : 'lobby',
        build: d.room.build | 0, ts: now,
      });
    }
  }
  return lobbyView(now);
}
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function leagueTop(mode, country, cid) {
  const rows = [...league.entries()]
    .filter(([k]) => k.endsWith(`|${mode}|${country}`))
    .map(([k, v]) => ({ cid: k.split('|')[0], ...v }))
    .sort((a, b) => (mode === 'arena' ? a.score - b.score : b.score - a.score))
    .slice(0, 50)
    .map((r, i) => ({ rank: i + 1, nick: r.nick, score: r.score, team: r.team, me: r.cid === cid }));
  const mine = league.get(`${cid}|${mode}|${country}`);
  const me = mine ? { rank: rows.findIndex((r) => r.me) + 1 || rows.length + 1, score: mine.score } : null;
  return { top: rows, me };
}

function readBody(req, cb, res) {
  let body = '';
  req.on('data', (ch) => { body += ch; });
  req.on('end', () => {
    try { cb(JSON.parse(body)); } catch (e) {
      res.writeHead(400, CORS);
      res.end('{"error":"bad"}');
    }
  });
}

function jsonRes(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(obj));
}

const httpServer = createServer((req, res) => {
  if (req.url && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, pid: process.pid, boot: BOOT_TOKEN }));
    return;
  }
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/league/') && !url.pathname.startsWith('/lobby/') && !url.pathname.startsWith('/save/')) {
    res.writeHead(200, CORS);
    res.end('zr-dev-relay ok');
    return;
  }
  // 💾 хмарний сейв (як SaveVault у воркері)
  if (url.pathname === '/save/put' && req.method === 'POST') {
    readBody(req, (d) => {
      const cid = String(d.cid || '').slice(0, 40);
      if (cid.length < 8 || typeof d.data !== 'string' || !d.data) return jsonRes(res, { error: 'bad' }, 400);
      try { JSON.parse(d.data); } catch (e) { return jsonRes(res, { error: 'bad' }, 400); }
      saves.set(cid, { data: d.data, ts: Date.now() });
      jsonRes(res, { ok: true, ts: Date.now() });
    }, res);
    return;
  }
  if (url.pathname === '/save/get') {
    const cid = String(url.searchParams.get('cid') || '');
    const s = saves.get(cid);
    if (!s) return jsonRes(res, { error: 'none' }, 404);
    jsonRes(res, { data: s.data, ts: s.ts });
    return;
  }
  if (url.pathname === '/save/link' && req.method === 'POST') {
    readBody(req, (d) => {
      const cid = String(d.cid || '');
      if (!saves.has(cid)) return jsonRes(res, { error: 'none' }, 404);
      for (const [code, c] of saveLinks) if (c === cid) return jsonRes(res, { code });
      let code = '';
      do {
        code = '';
        const buf = new Uint32Array(8);
        crypto.getRandomValues(buf);
        for (const b of buf) code += LINK_ALPHABET[b % LINK_ALPHABET.length];
      } while (saveLinks.has(code));
      saveLinks.set(code, cid);
      jsonRes(res, { code });
    }, res);
    return;
  }
  if (url.pathname === '/save/claim' && req.method === 'POST') {
    readBody(req, (d) => {
      const code = String(d.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const cid = saveLinks.get(code);
      const s = cid && saves.get(cid);
      if (!s) return jsonRes(res, { error: 'none' }, 404);
      jsonRes(res, { cid, data: s.data, ts: s.ts });
    }, res);
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  if (url.pathname === '/lobby/state') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify(lobbyView(Date.now())));
    return;
  }
  if (url.pathname === '/lobby/ping' && req.method === 'POST') {
    let body = '';
    req.on('data', (ch) => { body += ch; });
    req.on('end', () => {
      try {
        const view = lobbyPing(JSON.parse(body));
        if (!view) { res.writeHead(400, CORS); res.end('{"error":"bad"}'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify(view));
      } catch (e) {
        res.writeHead(400, CORS);
        res.end('{"error":"bad"}');
      }
    });
    return;
  }
  if (url.pathname === '/league/top') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify(leagueTop(url.searchParams.get('mode') || 'storm',
      (url.searchParams.get('country') || 'UKR').toUpperCase(), url.searchParams.get('cid') || '')));
    return;
  }
  if (url.pathname === '/league/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', (ch) => { body += ch; });
    req.on('end', () => {
      try {
        const d = JSON.parse(body);
        const key = `${d.cid}|${d.mode}|${String(d.country).toUpperCase()}`;
        const cur = league.get(key);
        const better = !cur || (d.mode === 'arena' ? d.score < cur.score : d.score > cur.score);
        if (better) league.set(key, { nick: cleanNickSrv(d.nick), score: Math.round(d.score), team: d.team || [], ts: Date.now() });
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify(leagueTop(d.mode, String(d.country).toUpperCase(), d.cid)));
      } catch (e) {
        res.writeHead(400, CORS);
        res.end('{"error":"bad"}');
      }
    });
    return;
  }
  res.writeHead(404, CORS);
  res.end('{"error":"notfound"}');
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.on('error', (e) => {
  console.error('[relay] listen FAILED', e && e.code || e);
  process.exit(1); // напр. EADDRINUSE: не лишаємо тести підключатися до сироти
});
httpServer.listen(PORT, () => console.log(`[relay] BOOT ${BOOT_TOKEN}`));
console.log(`[relay] ws://localhost:${PORT}/ws?room=CODE (+ /league/*)`);

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const create = url.searchParams.get('create') === '1';
  const resumeId = parseInt(url.searchParams.get('resume') || '0', 10);
  const resumeKey = url.searchParams.get('resumeKey') || '';
  if (!code) { send(ws, { t: 'err', code: 'badroom' }); ws.close(); return; }

  let room = rooms.get(code);
  if (create) {
    if (room && room.sockets.has(1)) { send(ws, { t: 'err', code: 'taken' }); ws.close(); return; }
    if (!room) { room = { sockets: new Map(), nextId: 2, hostTimer: null, keys: new Map() }; rooms.set(code, room); }
  } else if (!room) {
    send(ws, { t: 'err', code: 'noroom' }); ws.close(); return;
  }
  if (!room.keys) room.keys = new Map();

  let id, validResume = false;
  if (create) id = 1;
  else if ((resumeId === 1 || resumeId >= 2) && resumeKey && room.keys.get(resumeId) === resumeKey) {
    // resume чесний лише з правильним секретом слота (дзеркалить воркер: анти-перехоплення pid)
    validResume = true;
    if (!room.sockets.has(resumeId) && room.sockets.size >= MAX_PLAYERS) { send(ws, { t: 'err', code: 'full' }); ws.close(); return; }
    id = resumeId;
  } else {
    if (room.sockets.size >= MAX_PLAYERS) { send(ws, { t: 'err', code: 'full' }); ws.close(); return; }
    id = room.nextId++;
  }

  if (id === 1 && room.hostTimer) { clearTimeout(room.hostTimer); room.hostTimer = null; }
  const key = validResume ? room.keys.get(id) : (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  room.keys.set(id, key);
  const replaced = validResume ? room.sockets.get(id) : null;
  room.sockets.set(id, ws);
  send(ws, { t: 'relay', you: id, isHost: id === 1, rk: key, peers: [...room.sockets.keys()].filter((p) => p !== id) });
  if (replaced) replaced.close(1000, 'resume');
  for (const [pid, sock] of room.sockets) if (pid !== id) send(sock, { t: 'peer', id, on: true });
  console.log(`[relay] ${code}: +${id} (${room.sockets.size} у кімнаті)`);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    // 📦 пачка {t:'b', m:[{to,d},…]}: групуємо по отримувачах (як у воркері)
    if (msg && msg.t === 'b' && Array.isArray(msg.m)) {
      const per = new Map();
      for (const it of msg.m) {
        if (!it || it.d === undefined) continue;
        if (it.to === 0) {
          for (const pid of room.sockets.keys()) {
            if (pid === id) continue;
            if (!per.has(pid)) per.set(pid, []);
            per.get(pid).push(it.d);
          }
        } else {
          const pid = it.to | 0;
          if (pid === id || !room.sockets.has(pid)) continue;
          if (!per.has(pid)) per.set(pid, []);
          per.get(pid).push(it.d);
        }
      }
      for (const [pid, list] of per) {
        const sock = room.sockets.get(pid);
        if (sock && sock.readyState === 1) {
          sock.send(JSON.stringify(list.length === 1 ? { from: id, d: list[0] } : { from: id, b: list }));
        }
      }
      return;
    }
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
