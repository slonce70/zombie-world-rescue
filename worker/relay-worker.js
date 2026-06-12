// Cloudflare Worker + Durable Object: relay-сервер кооперативу.
// Кімната = один Durable Object (ім'я = код кімнати). Протокол ідентичний
// relay/dev-relay.mjs: {to, d} → {from, d}; службові relay/peer/err.
//
// Деплой:  cd worker && npx wrangler deploy
// Адреса потім вписується у src/net/transport.js (DEFAULT_RELAY).

const MAX_PLAYERS = 4;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
    if (!msg || msg.d === undefined) return;
    const att = ws.deserializeAttachment();
    if (!att) return;
    const env = JSON.stringify({ from: att.id, d: msg.d });
    const peers = this._peers();
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
