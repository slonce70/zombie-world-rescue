// 💾 Хмарний сейв: прогрес автоматично летить у SaveVault на zr-relay.
// Усі фейли тихі — гра НІКОЛИ не залежить від доступності хмари.
//  - після кожного saveGame() — пуш у хмару з дебаунсом (сервер приймає раз на 15с)
//  - на старті: якщо локальний сейв порожній, а в хмарі є прогрес за цим cid — беремо хмарний
//  - постійний код відновлення (8 знаків) повертає прогрес на будь-якому пристрої
import { apiBase } from './transport.js';
import { ensureCid } from './league.js';

const PUSH_DELAY_MS = 25_000;
const SAVE_KEY = 'zr-save-v1'; // тримати в синхроні з main.js

export function saveHasProgress(s) {
  if (!s || typeof s !== 'object') return false;
  return Object.keys(s.liberated || {}).length > 0
    || (s.xp | 0) > 0
    || Object.keys(s.missionRuns || {}).length > 0
    || Object.keys(s.stormBest || {}).length > 0;
}

export class CloudSave {
  constructor(game) {
    this.game = game;
    // тести не мають спамити продакшн-хмару; ?cloud вмикає її явно (з dev-relay)
    this.enabled = !game.testMode || game.params.has('cloud');
    this.lastOkTs = 0;   // коли востаннє успішно синхронізувались
    this._timer = null;
  }

  schedulePush() {
    if (!this.enabled) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this.push(); }, PUSH_DELAY_MS);
  }

  async push() {
    if (!this.enabled) return false;
    try {
      const res = await fetch(`${apiBase()}/save/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: ensureCid(this.game), data: JSON.stringify(this.game.save) }),
      });
      if (res.ok) { this.lastOkTs = Date.now(); return true; }
    } catch (e) { /* офлайн — нічого страшного */ }
    return false;
  }

  async pull() {
    try {
      const res = await fetch(`${apiBase()}/save/get?cid=${encodeURIComponent(ensureCid(this.game))}`);
      if (!res.ok) return null;
      return await res.json(); // {data, ts}
    } catch (e) {
      return null;
    }
  }

  // постійний код відновлення (створюється на сервері один раз)
  async fetchCode() {
    try {
      const res = await fetch(`${apiBase()}/save/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: ensureCid(this.game) }),
      });
      if (!res.ok) return null;
      return (await res.json()).code || null;
    } catch (e) {
      return null;
    }
  }

  // ввести код на новому пристрої → {cid, data} або null
  async claim(code) {
    try {
      const res = await fetch(`${apiBase()}/save/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // прийняти чужий сейв (з коду або файлу) і перезапустити гру
  adopt(rawJson) {
    try {
      const s = JSON.parse(rawJson);
      if (!s || typeof s !== 'object') return false;
      localStorage.setItem(SAVE_KEY, rawJson);
      location.reload();
      return true;
    } catch (e) {
      return false;
    }
  }

  // на старті: локальний прогрес → пуш; порожній локальний + хмарний прогрес → тягнемо хмару
  async bootSync() {
    if (!this.enabled) return;
    if (saveHasProgress(this.game.save)) { this.push(); return; }
    const cloud = await this.pull();
    if (!cloud || !cloud.data) return;
    try {
      if (saveHasProgress(JSON.parse(cloud.data))) this.adopt(cloud.data);
    } catch (e) { /* битий хмарний сейв — ігноруємо */ }
  }
}
