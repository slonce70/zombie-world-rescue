// Cloudflare Worker + Durable Object: relay-сервер кооперативу.
// Кімната = один Durable Object (ім'я = код кімнати). Протокол ідентичний
// relay/dev-relay.mjs: {to, d} → {from, d}; службові relay/peer/err.
//
// Деплой:  cd worker && npx wrangler deploy
// Адреса потім вписується у src/net/transport.js (DEFAULT_RELAY).

const MAX_PLAYERS = 4;

// CORS: гра живе на github.io, Ліга — тут
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // 🏆 Ліга рекордів
    if (url.pathname.startsWith('/league/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const id = env.LEAGUE.idFromName('league');
      return env.LEAGUE.get(id).fetch(request);
    }
    // 🟢 Лобі: онлайн і відкриті кімнати
    if (url.pathname.startsWith('/lobby/')) {
      if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
      const id = env.LOBBY.idFromName('lobby');
      return env.LOBBY.get(id).fetch(request);
    }
    if (url.pathname !== '/ws') return new Response('zr-relay ok', { status: 200 });
    const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!code) return new Response('bad room', { status: 400 });
    const id = env.ROOM.idFromName(code);
    return env.ROOM.get(id).fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    // Hibernation API: сокети живуть, DO спить — простій кімнати безкоштовний
  }

  _peers() {
    const out = new Map();
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att) out.set(att.id, ws);
    }
    return out;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const create = url.searchParams.get('create') === '1';
    const resume = parseInt(url.searchParams.get('resume') || '0', 10);
    const peers = this._peers();

    let id;
    if (create) {
      if (peers.has(1)) return new Response('taken', { status: 409 });
      id = 1;
      await this.state.storage.put('nextId', 2);
      await this.state.storage.put('alive', true);
    } else {
      const alive = await this.state.storage.get('alive');
      if (!alive) return this._rejectSocket('noroom');
      if (peers.size >= MAX_PLAYERS) return this._rejectSocket('full');
      if (resume >= 2 && !peers.has(resume)) {
        id = resume;
      } else {
        id = (await this.state.storage.get('nextId')) || 2;
        await this.state.storage.put('nextId', id + 1);
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ id });
    server.send(JSON.stringify({
      t: 'relay', you: id, isHost: id === 1,
      peers: [...peers.keys()].filter((p) => p !== id),
    }));
    for (const [pid, sock] of peers) {
      if (pid !== id) this._safeSend(sock, JSON.stringify({ t: 'peer', id, on: true }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  // кімнати немає / повна: відповідаємо через сокет, щоб клієнт побачив код помилки
  _rejectSocket(codeStr) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.send(JSON.stringify({ t: 'err', code: codeStr }));
    server.close(1008, codeStr);
    return new Response(null, { status: 101, webSocket: client });
  }

  _safeSend(ws, data) {
    try { ws.send(data); } catch (e) { /* сокет уже мертвий */ }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch { return; }
    const att = ws.deserializeAttachment();
    if (!att) return;
    const peers = this._peers();
    // 📦 пачка {t:'b', m:[{to,d},…]}: групуємо по отримувачах, кожному — одне ws-повідомлення
    if (msg && msg.t === 'b' && Array.isArray(msg.m)) {
      const per = new Map(); // pid -> [d, …] у порядку надсилання
      for (const it of msg.m) {
        if (!it || it.d === undefined) continue;
        if (it.to === 0) {
          for (const pid of peers.keys()) {
            if (pid === att.id) continue;
            if (!per.has(pid)) per.set(pid, []);
            per.get(pid).push(it.d);
          }
        } else {
          const pid = it.to | 0;
          if (pid === att.id || !peers.has(pid)) continue;
          if (!per.has(pid)) per.set(pid, []);
          per.get(pid).push(it.d);
        }
      }
      for (const [pid, list] of per) {
        const sock = peers.get(pid);
        if (!sock) continue;
        this._safeSend(sock, JSON.stringify(
          list.length === 1 ? { from: att.id, d: list[0] } : { from: att.id, b: list }
        ));
      }
      return;
    }
    if (!msg || msg.d === undefined) return;
    const env = JSON.stringify({ from: att.id, d: msg.d });
    if (msg.to === 0) {
      for (const [pid, sock] of peers) if (pid !== att.id) this._safeSend(sock, env);
    } else {
      const target = peers.get(msg.to | 0);
      if (target) this._safeSend(target, env);
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att) return;
    const peers = this._peers();
    peers.delete(att.id);
    for (const [, sock] of peers) this._safeSend(sock, JSON.stringify({ t: 'peer', id: att.id, on: false }));
    if (att.id === 1) {
      // хост зник: даємо 90с на реконект, потім закриваємо кімнату алармом
      await this.state.storage.put('hostGoneAt', Date.now());
      await this.state.storage.setAlarm(Date.now() + 90_000);
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    const peers = this._peers();
    if (peers.has(1)) return; // хост повернувся
    for (const [, sock] of peers) {
      this._safeSend(sock, JSON.stringify({ t: 'err', code: 'hostgone' }));
      try { sock.close(1000, 'hostgone'); } catch (e) { /* ignore */ }
    }
    await this.state.storage.deleteAll();
  }
}


// ============================================================
// 🟢 Лобі: один DO на весь світ. Хто зараз у мультиплеєрі + відкриті кімнати.
// Все в пам'яті: клієнти пінгують кожні ~8с, записи живуть 40с — якщо DO
// перезапуститься, картина відновиться за один пінг. Нічого не платимо за сховище.
// ============================================================
const LOBBY_TTL = 40_000;
const LOBBY_MODES = new Set(['campaign', 'storm', 'arena']);

export class Lobby {
  constructor(state) {
    this.state = state;
    this.players = new Map(); // cid -> {nick, ts}
    this.rooms = new Map();   // code -> {cid, host, mode, country, n, state, build, ts}
  }

  _prune(now) {
    for (const [cid, p] of this.players) if (now - p.ts > LOBBY_TTL) this.players.delete(cid);
    for (const [code, r] of this.rooms) if (now - r.ts > LOBBY_TTL) this.rooms.delete(code);
  }

  _view(now) {
    this._prune(now);
    const players = [];
    for (const p of this.players.values()) {
      players.push(p.nick);
      if (players.length >= 60) break;
    }
    const rooms = [...this.rooms.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 20)
      .map(([code, r]) => ({
        code, host: r.host, mode: r.mode, country: r.country,
        n: r.n, state: r.state, build: r.build,
      }));
    return { online: this.players.size, players, rooms };
  }

  json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const now = Date.now();
    try {
      if (url.pathname === '/lobby/state') return this.json(this._view(now));
      if (url.pathname === '/lobby/ping' && request.method === 'POST') {
        const d = await request.json();
        const cid = String(d.cid || '').slice(0, 40);
        if (cid.length < 8) return this.json({ error: 'bad' }, 400);
        this.players.set(cid, { nick: cleanNickSrv(d.nick), ts: now });
        if (this.players.size > 500) this._prune(now);
        // хост закрив кімнату — прибираємо одразу, не чекаючи TTL
        if (d.close) {
          const code = String(d.close).toUpperCase().slice(0, 8);
          const r = this.rooms.get(code);
          if (r && r.cid === cid) this.rooms.delete(code);
        }
        // хост анонсує публічну кімнату
        if (d.room && d.room.code) {
          const code = String(d.room.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
          const mode = LOBBY_MODES.has(d.room.mode) ? d.room.mode : 'campaign';
          if (code) {
            this.rooms.set(code, {
              cid, host: cleanNickSrv(d.nick), mode,
              country: String(d.room.country || 'UKR').toUpperCase().slice(0, 4),
              n: Math.min(4, Math.max(1, d.room.n | 0)),
              state: d.room.state === 'game' ? 'game' : 'lobby',
              build: d.room.build | 0, ts: now,
            });
          }
        }
        return this.json(this._view(now));
      }
    } catch (e) {
      return this.json({ error: 'bad' }, 400);
    }
    return this.json({ error: 'notfound' }, 404);
  }
}


// ============================================================
// 🏆 Ліга рекордів: один DO на весь світ, SQLite-таблиця рекордів.
// Кращий результат на гравця (cid) у кожному режимі+країні.
// ============================================================
const MODES = { storm: 'desc', arena: 'asc' }; // як сортувати score

function cleanNickSrv(raw) {
  let s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 12) s = s.slice(0, 12);
  return s || 'Гравець';
}

export class League {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS entries (
      cid TEXT NOT NULL, mode TEXT NOT NULL, country TEXT NOT NULL,
      nick TEXT NOT NULL, score INTEGER NOT NULL, team TEXT NOT NULL, ts INTEGER NOT NULL,
      PRIMARY KEY (cid, mode, country)
    )`);
    this._lastSubmit = new Map(); // cid -> ts (анти-спам)
  }

  json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/league/submit' && request.method === 'POST') {
        return this.submit(await request.json());
      }
      if (url.pathname === '/league/top') {
        return this.top(url.searchParams);
      }
      // адмін: повне скидання таблиці (секрет простий — гра сімейна)
      if (url.pathname === '/league/reset' && request.method === 'POST') {
        const d = await request.json();
        if (d.key !== 'zr-admin-slonce-2026') return this.json({ error: 'no' }, 403);
        this.sql.exec('DELETE FROM entries');
        return this.json({ ok: true });
      }
    } catch (e) {
      return this.json({ error: 'bad' }, 400);
    }
    return this.json({ error: 'notfound' }, 404);
  }

  submit(d) {
    const cid = String(d.cid || '').slice(0, 40);
    const mode = String(d.mode || '');
    const country = String(d.country || '').slice(0, 4).toUpperCase();
    const nick = cleanNickSrv(d.nick);
    const score = Math.round(Number(d.score));
    if (!cid || cid.length < 8 || !MODES[mode] || !/^[A-Z]{3}$|^ALL$/.test(country)) {
      return this.json({ error: 'bad' }, 400);
    }
    // здоровий глузд: шторм — хвилі, арена — мілісекунди
    if (mode === 'storm' && !(score >= 1 && score <= 200)) return this.json({ error: 'score' }, 400);
    if (mode === 'arena' && !(score >= 30000 && score <= 3600000)) return this.json({ error: 'score' }, 400);
    // анти-спам: не частіше за раз на 10с НА РЕЖИМ (шторм і арена не заважають одне одному)
    const now = Date.now();
    const rlKey = `${cid}|${mode}|${country}`;
    const last = this._lastSubmit.get(rlKey) || 0;
    if (now - last < 10000) return this.json({ error: 'slow' }, 429);
    this._lastSubmit.set(rlKey, now);
    if (this._lastSubmit.size > 5000) this._lastSubmit.clear();
    const team = JSON.stringify((Array.isArray(d.team) ? d.team : []).slice(0, 4).map(cleanNickSrv));
    // тримаємо найкращий результат
    const cur = this.sql.exec(
      'SELECT score FROM entries WHERE cid = ? AND mode = ? AND country = ?', cid, mode, country
    ).toArray();
    const better = !cur.length || (MODES[mode] === 'desc' ? score > cur[0].score : score < cur[0].score);
    if (better) {
      this.sql.exec(
        `INSERT INTO entries (cid, mode, country, nick, score, team, ts) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (cid, mode, country) DO UPDATE SET nick = excluded.nick, score = excluded.score,
         team = excluded.team, ts = excluded.ts`,
        cid, mode, country, nick, score, team, now
      );
    } else {
      // нік міг змінитись — оновлюємо м'яко
      this.sql.exec('UPDATE entries SET nick = ? WHERE cid = ? AND mode = ? AND country = ?', nick, cid, mode, country);
    }
    return this.rankResponse(mode, country, cid);
  }

  top(params) {
    const mode = String(params.get('mode') || 'storm');
    const country = String(params.get('country') || 'UKR').slice(0, 4).toUpperCase();
    const cid = String(params.get('cid') || '');
    if (!MODES[mode]) return this.json({ error: 'bad' }, 400);
    return this.rankResponse(mode, country, cid);
  }

  rankResponse(mode, country, cid) {
    const ord = MODES[mode] === 'desc' ? 'DESC' : 'ASC';
    const top = this.sql.exec(
      `SELECT nick, score, team, ts, cid FROM entries WHERE mode = ? AND country = ?
       ORDER BY score ${ord}, ts ASC LIMIT 50`, mode, country
    ).toArray().map((r, i) => ({
      rank: i + 1, nick: r.nick, score: r.score,
      team: JSON.parse(r.team || '[]'), me: r.cid === cid,
    }));
    let me = null;
    if (cid) {
      const mine = this.sql.exec(
        'SELECT score FROM entries WHERE cid = ? AND mode = ? AND country = ?', cid, mode, country
      ).toArray();
      if (mine.length) {
        const myScore = mine[0].score;
        const beat = this.sql.exec(
          MODES[mode] === 'desc'
            ? 'SELECT COUNT(*) AS n FROM entries WHERE mode = ? AND country = ? AND score > ?'
            : 'SELECT COUNT(*) AS n FROM entries WHERE mode = ? AND country = ? AND score < ?',
          mode, country, myScore
        ).toArray();
        me = { rank: (beat[0].n | 0) + 1, score: myScore };
      }
    }
    return this.json({ top, me });
  }
}
