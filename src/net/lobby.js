// 🟢 Клієнт Лобі: «хто онлайн» + список відкритих кімнат.
// Пінгуємо воркер кожні ~8с, поки відкрита модалка мультиплеєра або жива
// кооп-сесія. Всі фейли тихі — без інтернету панель просто каже «недоступно».
import { apiBase } from './transport.js';
import { ensureCid } from './league.js';
import { loadNick, cleanNick } from './coop.js';
import { t } from '../i18n.js';

const PING_MS = 8000;

export class LobbyClient {
  constructor(game) {
    this.game = game;
    this.data = null;        // останнє {online, players, rooms} або null
    this.onUpdate = null;    // (data|null) — оновити панель
    this.getRoom = null;     // () => {code, mode, country, n, state, build} | null
    this._timer = null;
    this._busy = false;
  }

  get active() { return !!this._timer; }

  start() {
    if (!this._timer) this._timer = setInterval(() => this._ping(), PING_MS);
    this._ping();
  }

  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  // разовий пінг поза розкладом (створили кімнату, стартував рівень…)
  refresh() { if (this.active) this._ping(); }

  // кімнату закрито — прибрати зі списку, не чекаючи TTL
  announceClose(code) { this._ping({ close: code }); }

  async _ping(extra = {}) {
    if (this._busy) return;
    this._busy = true;
    try {
      const body = {
        cid: ensureCid(this.game),
        nick: cleanNick(loadNick()) || t('Гравець'),
        ...extra,
      };
      const room = this.getRoom && this.getRoom();
      if (room) body.room = room;
      const res = await fetch(`${apiBase()}/lobby/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      this.data = res.ok ? await res.json() : null;
    } catch (e) {
      this.data = null;
    } finally {
      this._busy = false;
    }
    if (this.onUpdate) this.onUpdate(this.data);
  }
}
