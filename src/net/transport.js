// Транспорт кооперативу: один WebSocket до relay-сервера.
// Relay тупий: пересилає {to, d} → {from, d}, кімната = код. Хост має id 1.
// URL relay: ?relay=... → localStorage zr-relay → DEFAULT_RELAY (Cloudflare Worker).
//
// 📦 Батчинг: вихідні повідомлення збираються в пачку і летять раз на ~100мс
// (або миттєво для службових). Це втричі менше запитів до Durable Object —
// тобто втричі дешевша кімната — а плавність тримає клієнтська інтерполяція.

const DEFAULT_RELAY = 'wss://zr-relay.slonce70.workers.dev';
const BATCH_MS = 100;

export function relayUrl() {
  const p = new URLSearchParams(location.search).get('relay');
  if (p) return p;
  try {
    const s = localStorage.getItem('zr-relay');
    if (s) return s;
  } catch (e) { /* ignore */ }
  return DEFAULT_RELAY;
}

// ws(s):// → http(s):// — для HTTP-ендпоінтів воркера (Ліга, Лобі)
export function apiBase() {
  return relayUrl().replace(/^ws/, 'http').replace(/\/+$/, '');
}

export class Transport {
  constructor() {
    this.ws = null;
    this.you = 0;
    this.isHost = false;
    this.room = null;
    this.connected = false;
    this.resumeKey = ''; // секрет слота від relay — echo-ається при reconnect (анти-перехоплення pid)
    this.onMessage = null;   // (fromId, data)
    this.onPeer = null;      // (id, on)
    this.onOpen = null;      // ({you, isHost, peers})
    this.onClose = null;     // (reason)
    this._closing = false;
    // батчинг
    this._q = [];
    this._timer = null;
    this._lastFlush = 0;
    // лічильники для тестів/діагностики
    this.txFlushes = 0;      // фактичні ws.send
    this.txMsgs = 0;         // логічні повідомлення
  }

  connect(room, { create = false, resume = 0 } = {}) {
    this._closing = false;
    this.room = room;
    this._q.length = 0;
    const base = relayUrl().replace(/\/+$/, '');
    if (base.includes('YOUR-ACCOUNT')) return Promise.reject(new Error('norelay'));
    const url = `${base}/ws?room=${encodeURIComponent(room)}${create ? '&create=1' : ''}${resume ? `&resume=${resume}` : ''}${resume && this.resumeKey ? `&resumeKey=${encodeURIComponent(this.resumeKey)}` : ''}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(new Error('badurl'));
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; ws.close(); reject(new Error('timeout')); }
      }, 10000);
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'relay') {
          this.you = msg.you;
          this.isHost = msg.isHost;
          if (msg.rk) this.resumeKey = msg.rk; // запам'ятовуємо секрет слота для майбутнього reconnect
          this.connected = true;
          if (!settled) { settled = true; clearTimeout(timer); resolve(msg); }
          if (this.onOpen) this.onOpen(msg);
          return;
        }
        if (msg.t === 'err') {
          this.connected = false;
          if (!settled) { settled = true; clearTimeout(timer); reject(new Error(msg.code)); }
          else if (this.onClose) this.onClose(msg.code);
          return;
        }
        if (msg.t === 'peer') {
          if (this.onPeer) this.onPeer(msg.id, msg.on);
          return;
        }
        if (msg.from === undefined || !this.onMessage) return;
        // пачка від relay: {from, b: [d, d, …]} — у порядку надсилання.
        // Кожне повідомлення — у власному try/catch: одне зіпсоване/вороже не має
        // обривати решту пачки чи кидати виняток з ws.onmessage.
        if (Array.isArray(msg.b)) {
          for (const d of msg.b) {
            try { this.onMessage(msg.from, d); } catch (e) { console.warn('[net] dropped bad message', e); }
          }
        } else if (msg.d !== undefined) {
          try { this.onMessage(msg.from, msg.d); } catch (e) { console.warn('[net] dropped bad message', e); }
        }
      };
      ws.onclose = () => {
        const was = this.connected;
        this.connected = false;
        this._clearTimer();
        this._q.length = 0;
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('closed')); }
        else if (was && !this._closing && this.onClose) this.onClose('lost');
      };
      ws.onerror = () => { /* onclose прийде слідом */ };
    });
  }

  // urgent=true — службові (hello/welcome/start/state…): пачка летить одразу
  send(to, data, urgent = false) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this._q.push([to, data]);
    this.txMsgs++;
    const now = performance.now();
    if (urgent || now - this._lastFlush >= BATCH_MS) {
      this._flush();
      return;
    }
    // у фоновій вкладці таймер троттлиться, але там флаш підхоплює
    // наступний send (хост шле снапшоти 12 разів/с — пачка не застрягне)
    if (!this._timer) {
      this._timer = setTimeout(() => this._flush(), Math.max(10, BATCH_MS - (now - this._lastFlush)));
    }
  }

  broadcast(data, urgent = false) { this.send(0, data, urgent); }

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  _flush() {
    this._clearTimer();
    if (!this._q.length) return;
    if (!this.ws || this.ws.readyState !== 1) { this._q.length = 0; return; }
    this._lastFlush = performance.now();
    const payload = this._q.length === 1
      ? { to: this._q[0][0], d: this._q[0][1] }
      : { t: 'b', m: this._q.map(([to, d]) => ({ to, d })) };
    this.ws.send(JSON.stringify(payload));
    this.txFlushes++;
    this._q.length = 0;
  }

  close() {
    this._closing = true;
    this._flush();
    this.connected = false;
    this._clearTimer();
    if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } }
    this.ws = null;
  }
}
