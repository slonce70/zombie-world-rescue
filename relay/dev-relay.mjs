// Локальний relay-сервер для розробки кооперативу.
// Той самий протокол, що й у Cloudflare-воркера (worker/relay-worker.js):
//   підключення: ws://localhost:8742/ws?room=КОД&create=1 (хост) | ?room=КОД (гість)
//   клієнт → relay: {to: 0|id, d: <будь-що>}   (0 = усім іншим)
//   relay → клієнт: {from: id, d: <будь-що>}
//   службові:       {t:'relay', you, isHost, peers:[...]}, {t:'peer', id, on}, {t:'err', code}
// Хост завжди отримує id 1. Кімната живе, поки живий хост (грейс 90с на реконект).
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { cleanNickSrv, cleanCountrySrv } from '../worker/nick.mjs';
import { cleanProfileSrv, safeInt } from '../worker/profile.mjs';
import { routeBatch } from '../worker/route.mjs';
import {
  COMMUNITY_CID_RE,
  COMMUNITY_PUBLISH_BODY_BYTES,
  MemoryCommunity,
} from '../worker/community.mjs';

const PORT = parseInt(process.env.PORT || '8742', 10);
const HOST = process.env.RELAY_HOST || '127.0.0.1';
const BOOT_TOKEN = `${process.pid}-${Date.now().toString(36)}`;
const MAX_PLAYERS = 4;
const HOST_GRACE_MS = 30_000;
const MAX_WS_BYTES = 65536;
const MAX_BATCH_ITEMS = 128;
const MAX_BODY_BYTES = 4 * 1024;
const SAVE_MAX_BYTES = 64 * 1024;
const SAVE_BODY_BYTES = 96 * 1024;

const rooms = new Map(); // code -> { sockets: Map<id, ws>, nextId, hostTimer }
const community = new MemoryCommunity({
  adminKey: process.env.ADMIN_KEY || '',
  cooldownMs: process.env.COMMUNITY_PUBLISH_COOLDOWN_MS == null
    ? undefined : Number(process.env.COMMUNITY_PUBLISH_COOLDOWN_MS),
});

// 🏆 локальна Ліга в пам'яті — щоб розробка повністю працювала офлайн
const league = new Map(); // `${cid}|${mode}|${country}` -> {nick, score, team, ts}

// 💾 локальний хмарний сейв у пам'яті (дзеркало SaveVault DO з воркера)
const saves = new Map();     // cid -> {data, ts}
const saveLinks = new Map(); // code -> cid (постійний код відновлення)
const LINK_ALPHABET = 'ABCDEFHJKLMNPRSTUVWXYZ23456789';
const SAVE_PUT_COOLDOWN = parseInt(process.env.SAVE_PUT_COOLDOWN || '15000', 10);
const SAVE_PUT_IP_MAX = parseInt(process.env.SAVE_PUT_IP_MAX || '30', 10);
const saveLastPut = new Map(); // cid -> ts
const savePutIp = new Map();   // ip -> {n,t0}

// 🟢 локальне Лобі в пам'яті (дзеркало Lobby DO з воркера)
const LOBBY_TTL = 40_000;
const LOBBY_MODES = new Set(['campaign', 'expedition', 'storm', 'arena', 'radiation', 'turretwar', 'worldboss',
  'front', 'community-map', 'friendly-knockout', 'friendly-defense', 'friendly-zone-defense', 'weekly-coop']);
const lobbyPlayers = new Map(); // cid -> {nick, ts}
const lobbyProfiles = new Map(); // cid -> {nick, countries, coins, crystals, kills, star, prestige, title, ts}
const lobbyRooms = new Map();   // code -> {cid, host, mode, country, n, state, build, ts}
let lobbyDay = '';              // 📅 унікальні гравці за сьогодні (дзеркало Lobby DO)
let lobbyToday = new Set();
function recordToday(now, cid) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== lobbyDay) { lobbyDay = day; lobbyToday = new Set(); }
  if (cid && lobbyToday.size < 100000) lobbyToday.add(cid);
}
// 🏆 «топ-3 сьогодні» (дзеркало Lobby DO): кращі штормові результати за добу
let lobbyTop3 = [];            // [{nick, score}] за спаданням
let lobbyTop3Day = '';
function recordDayScore(now, nick, score) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== lobbyTop3Day) { lobbyTop3Day = day; lobbyTop3 = []; }
  if (!Number.isFinite(Number(score)) || Number(score) < 1) return; // сміттєвий скор ігноруємо
  const cleaned = cleanNickSrv(nick);
  const sc = safeInt(score, 1, 200);
  if (!cleaned) return;
  // один запис на нік — КРАЩИЙ (дзеркало Lobby DO): слабший забіг не затирає рекорд
  const prev = lobbyTop3.find((e) => e.nick === cleaned);
  const best = prev ? Math.max(prev.score, sc) : sc;
  const list = lobbyTop3.filter((e) => e.nick !== cleaned);
  list.push({ nick: cleaned, score: best });
  list.sort((a, b) => b.score - a.score);
  lobbyTop3 = list.slice(0, 3);
}
// 🤝 дошка «дуелі дня» (дзеркало mergeDuel у Lobby DO): результати режиму дня за добу.
// Логіка дослівно та сама — один запис на пару «cid+режим» (власник запису — cid пінга,
// нік лише підпис), і це краща спроба дня. Стелі на мережу тут немає: dev-relay крутиться
// на одній машині, де IP в усіх однаковий, — вона лишається ділом воркера.
const DUEL_BOARD_MAX = 16;
const DUEL_MS_MAX = 3_600_000;
const DUEL_MODES = new Set(['knockout', 'defense', 'zone-defense', 'pvp', 'bank',
  'portal', 'maze', 'humans', 'soul-collector', 'radiation', 'turretwar']);
let lobbyDuel = [];
let lobbyDuelDay = '';
function recordDuel(now, cid, nick, raw) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== lobbyDuelDay) { lobbyDuelDay = day; lobbyDuel = []; }
  const cleaned = cleanNickSrv(nick);
  const mode = String(raw.mode || '').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 20);
  if (!cid || !cleaned || !DUEL_MODES.has(mode)) return;
  const msRaw = Math.floor(Number(raw.ms));
  const next = { nick: cleaned, m: mode, ms: Number.isFinite(msRaw) ? Math.max(0, Math.min(DUEL_MS_MAX, msRaw)) : 0, w: !!raw.won, c: cid };
  const better = (a, b) => (a.w !== b.w ? a.w : ((a.ms || Infinity) < (b.ms || Infinity)));
  const prev = lobbyDuel.find((e) => e.c === cid && e.m === mode);
  if (prev && !better(next, prev)) return;
  lobbyDuel = lobbyDuel.filter((e) => e !== prev).concat([next])
    .sort((a, b) => (b.w ? 1 : 0) - (a.w ? 1 : 0) || ((a.ms || Infinity) - (b.ms || Infinity)))
    .slice(0, DUEL_BOARD_MAX);
}
// 🌍 лічильник світу (дзеркало Lobby DO): скільки людей врятували сьогодні.
// Стелі — ті самі, що у воркері; тут усе в памʼяті, бо dev-relay і так без сховища.
const SAVED_PER_PING = 60;
const SAVED_PER_DAY = 500;
let lobbySaved = 0;
let lobbySavedDay = '';
let lobbySavedByCid = new Map();
function recordSaved(now, cid, raw) {
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== lobbySavedDay) { lobbySavedDay = day; lobbySaved = 0; lobbySavedByCid = new Map(); }
  const already = lobbySavedByCid.get(cid) | 0;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return;
  const add = Math.max(0, Math.min(n, SAVED_PER_PING, SAVED_PER_DAY - already));
  if (!add) return;
  lobbySavedByCid.set(cid, already + add);
  lobbySaved += add;
}

function lobbyView(now) {
  for (const [cid, p] of lobbyPlayers) if (now - p.ts > LOBBY_TTL) lobbyPlayers.delete(cid);
  for (const [code, r] of lobbyRooms) if (now - r.ts > LOBBY_TTL) lobbyRooms.delete(code);
  if (lobbyProfiles.size > 800) {
    const old = [...lobbyProfiles.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < old.length - 800; i++) lobbyProfiles.delete(old[i][0]);
  }
  const day = new Date(now).toISOString().slice(0, 10);
  if (day !== lobbyTop3Day) { lobbyTop3Day = day; lobbyTop3 = []; } // добова ротація як у DO
  if (day !== lobbySavedDay) { lobbySavedDay = day; lobbySaved = 0; lobbySavedByCid = new Map(); }
  if (day !== lobbyDuelDay) { lobbyDuelDay = day; lobbyDuel = []; }
  return {
    online: lobbyPlayers.size,
    today: lobbyToday.size,
    top3: lobbyTop3,
    worldSaved: lobbySaved,
    worldSavedWeek: lobbySaved, // dev-relay історії не тримає: тиждень = сьогодні
    duel: lobbyDuel.map(({ c, ...row }) => row), // c (cid власника) назовні не їде
    players: [...lobbyPlayers.values()].slice(0, 60).map((p) => p.nick),
    profiles: [...lobbyProfiles.values()].sort((a, b) => b.ts - a.ts).slice(0, 60),
    rooms: [...lobbyRooms.entries()].sort((a, b) => b[1].ts - a[1].ts).slice(0, 20)
      .map(([code, r]) => ({ code, host: r.host, mode: r.mode, country: r.country, n: r.n, state: r.state, build: r.build })),
  };
}

// 📇 правила чистки профілю (і safeInt) — спільні з воркером у worker/profile.mjs

function lobbyPing(d) {
  const now = Date.now();
  const cid = String(d.cid || '').slice(0, 40);
  if (cid.length < 8) return null;
  const nick = cleanNickSrv(d.nick);
  lobbyPlayers.set(cid, { nick, ts: now });
  lobbyProfiles.set(cid, cleanProfileSrv(nick, d.profile, now));
  recordToday(now, cid);
  if (d.day && typeof d.day === 'object') recordDayScore(now, d.day.nick || nick, d.day.score);
  if (d.duel && typeof d.duel === 'object') recordDuel(now, cid, d.duel.nick || nick, d.duel);
  if (d.saved) recordSaved(now, cid, d.saved);
  if (d.close) {
    const code = String(d.close).toUpperCase().slice(0, 8);
    const r = lobbyRooms.get(code);
    if (r && r.cid === cid) lobbyRooms.delete(code);
  }
  if (d.room && d.room.code) {
    const code = String(d.room.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const mode = LOBBY_MODES.has(d.room.mode) ? d.room.mode : 'campaign';
    const existing = lobbyRooms.get(code);
    if (code && (!existing || existing.cid === cid)) {
      lobbyRooms.set(code, {
        cid, host: nick, mode,
        country: mode === 'community-map' ? 'CUSTOM' : cleanCountrySrv(d.room.country),
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

function readBody(req, limit, cb, res) {
  const chunks = [];
  let bytes = 0;
  let tooBig = false;
  req.on('data', (chunk) => {
    if (tooBig) return;
    bytes += chunk.length;
    if (bytes > limit) {
      tooBig = true;
      res.writeHead(413, CORS);
      res.end('{"error":"big"}');
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (tooBig) return;
    const raw = Buffer.concat(chunks).toString('utf8');
    try { cb(JSON.parse(raw), raw); } catch (e) {
      res.writeHead(400, CORS);
      res.end('{"error":"bad"}');
    }
  });
}

async function fetchRes(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}

function jsonRes(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(obj));
}

function savePutAllowed(ip) {
  const now = Date.now();
  let r = savePutIp.get(ip);
  if (!r || now - r.t0 > 60_000) { r = { n: 0, t0: now }; savePutIp.set(ip, r); }
  if (savePutIp.size > 2000) savePutIp.clear();
  return ++r.n <= SAVE_PUT_IP_MAX;
}

const httpServer = createServer(async (req, res) => {
  if (req.url && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, pid: process.pid, boot: BOOT_TOKEN }));
    return;
  }
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/community/')) {
    const headers = new Headers({
      'CF-Connecting-IP': req.socket.remoteAddress || 'x',
    });
    if (req.headers.origin) headers.set('Origin', req.headers.origin);
    if (req.method !== 'POST') {
      await fetchRes(res, await community.fetch(new Request(`http://local${url.pathname}`, {
        method: req.method, headers,
      })));
      return;
    }
    readBody(req, COMMUNITY_PUBLISH_BODY_BYTES, (_body, raw) => {
      headers.set('Content-Type', req.headers['content-type'] || 'application/json');
      headers.set('Content-Length', String(Buffer.byteLength(raw)));
      void community.fetch(new Request(`http://local${url.pathname}`, {
        method: req.method, headers, body: raw,
      })).then((response) => fetchRes(res, response));
    }, res);
    return;
  }
  if (!url.pathname.startsWith('/league/') && !url.pathname.startsWith('/lobby/') && !url.pathname.startsWith('/save/')) {
    res.writeHead(200, CORS);
    res.end('zr-dev-relay ok');
    return;
  }
  // 💾 хмарний сейв (як SaveVault у воркері)
  if (url.pathname === '/save/put' && req.method === 'POST') {
    readBody(req, SAVE_BODY_BYTES, (d) => {
      const ip = req.socket.remoteAddress || 'x';
      if (!savePutAllowed(ip)) return jsonRes(res, { error: 'rate' }, 429);
      const cid = typeof d.cid === 'string' && COMMUNITY_CID_RE.test(d.cid) ? d.cid : '';
      if (!cid || typeof d.data !== 'string' || !d.data
        || Buffer.byteLength(d.data, 'utf8') > SAVE_MAX_BYTES) return jsonRes(res, { error: 'bad' }, 400);
      try { JSON.parse(d.data); } catch (e) { return jsonRes(res, { error: 'bad' }, 400); }
      const now = Date.now();
      const last = saveLastPut.get(cid) || 0;
      if (now - last < SAVE_PUT_COOLDOWN) return jsonRes(res, { error: 'slow' }, 429);
      saveLastPut.set(cid, now);
      if (saveLastPut.size > 5000) saveLastPut.clear();
      saves.set(cid, { data: d.data, ts: now });
      jsonRes(res, { ok: true, ts: now });
    }, res);
    return;
  }
  if (url.pathname === '/save/get') {
    const rawCid = url.searchParams.get('cid') || '';
    const cid = COMMUNITY_CID_RE.test(rawCid) ? rawCid : '';
    if (!cid) return jsonRes(res, { error: 'bad' }, 400);
    const s = saves.get(cid);
    if (!s) return jsonRes(res, { error: 'none' }, 404);
    jsonRes(res, { data: s.data, ts: s.ts });
    return;
  }
  if (url.pathname === '/save/link' && req.method === 'POST') {
    readBody(req, SAVE_BODY_BYTES, (d) => {
      const cid = typeof d.cid === 'string' && COMMUNITY_CID_RE.test(d.cid) ? d.cid : '';
      if (!cid) return jsonRes(res, { error: 'bad' }, 400);
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
    readBody(req, SAVE_BODY_BYTES, (d) => {
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
    readBody(req, MAX_BODY_BYTES, (d) => {
      const view = lobbyPing(d);
      if (!view) { res.writeHead(400, CORS); res.end('{"error":"bad"}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify(view));
    }, res);
    return;
  }
  if (url.pathname === '/league/top') {
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify(leagueTop(url.searchParams.get('mode') || 'storm',
      (url.searchParams.get('country') || 'UKR').toUpperCase(), url.searchParams.get('cid') || '')));
    return;
  }
  if (url.pathname === '/league/submit' && req.method === 'POST') {
    readBody(req, MAX_BODY_BYTES, (d) => {
      // клампимо так само, як League DO у воркері (тести шлють сюди сміття свідомо)
      const mode = String(d.mode || '');
      const country = String(d.country || '').slice(0, 4).toUpperCase();
      const score = Math.round(Number(d.score));
      // дедуп ніків команди (дзеркало League DO): «Влад + Влад» після реконекту — брехня
      const team = [...new Set((Array.isArray(d.team) ? d.team : []).map(cleanNickSrv).filter(Boolean))].slice(0, 4);
      const bounds = { storm: [1, 200], coopstorm: [1, 200], arena: [30000, 3600000] }[mode];
      if (!bounds || !(score >= bounds[0] && score <= bounds[1])) return jsonRes(res, { error: 'score' }, 400);
      // командний режим має сенс лише коли грали ≥2 РІЗНІ ніки
      if (mode === 'coopstorm' && team.length < 2) return jsonRes(res, { error: 'team' }, 400);
      const key = `${d.cid}|${mode}|${country}`;
      const cur = league.get(key);
      const better = !cur || (mode === 'arena' ? score < cur.score : score > cur.score);
      if (better) league.set(key, { nick: cleanNickSrv(d.nick), score, team, ts: Date.now() });
      else if (cur) cur.nick = cleanNickSrv(d.nick); // нік міг змінитись — оновлюємо м'яко
      jsonRes(res, leagueTop(mode, country, d.cid));
    }, res);
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
httpServer.listen(PORT, HOST, () => console.log(`[relay] BOOT ${BOOT_TOKEN}`));
console.log(`[relay] ws://${HOST}:${PORT}/ws?room=CODE (+ /league/*)`);

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
    if (raw.length > MAX_WS_BYTES) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    // 📦 пачка {t:'b', m:[{to,d},…]}: групуємо по отримувачах (як у воркері)
    if (msg && msg.t === 'b' && Array.isArray(msg.m)) {
      for (const { pid, msg: env2 } of routeBatch(msg.m, id, [...room.sockets.keys()], (p) => room.sockets.has(p), MAX_BATCH_ITEMS)) {
        const sock = room.sockets.get(pid);
        if (sock && sock.readyState === 1) sock.send(JSON.stringify(env2));
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
