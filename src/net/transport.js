// Транспорт кооперативу: один WebSocket до relay-сервера.
// Relay тупий: пересилає {to, d} → {from, d}, кімната = код. Хост має id 1.
// URL relay: ?relay=... → localStorage zr-relay → DEFAULT_RELAY (Cloudflare Worker).

const DEFAULT_RELAY = 'wss://zr-relay.slonce70.workers.dev';

export function relayUrl() {
  const p = new URLSearchParams(location.search).get('relay');
  if (p) return p;
  try {
    const s = localStorage.getItem('zr-relay');
    if (s) return s;
  } catch (e) { /* ignore */ }
  return DEFAULT_RELAY;
}

export class Transport {
  constructor() {
    this.ws = null;
    this.you = 0;
    this.isHost = false;
    this.room = null;
    this.connected = false;
    this.onMessage = null;   // (fromId, data)
    this.onPeer = null;      // (id, on)
    this.onOpen = null;      // ({you, isHost, peers})
    this.onClose = null;     // (reason)
    this._closing = false;
  }

  connect(room, { create = false, resume = 0 } = {}) {
    this._closing = false;
    this.room = room;
    const base = relayUrl().replace(/\/+$/, '');
    if (base.includes('YOUR-ACCOUNT')) return Promise.reject(new Error('norelay'));
    const url = `${base}/ws?room=${encodeURIComponent(room)}${create ? '&create=1' : ''}${resume ? `&resume=${resume}` : ''}`;
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
        if (msg.from !== undefined && this.onMessage) this.onMessage(msg.from, msg.d);
      };
      ws.onclose = () => {
        const was = this.connected;
        this.connected = false;
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('closed')); }
        else if (was && !this._closing && this.onClose) this.onClose('lost');
      };
      ws.onerror = () => { /* onclose прийде слідом */ };
    });
  }

  send(to, data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ to, d: data }));
    }
  }

  broadcast(data) { this.send(0, data); }

  close() {
    this._closing = true;
    this.connected = false;
    if (this.ws) { try { this.ws.close(); } catch (e) { /* ignore */ } }
    this.ws = null;
  }
}
