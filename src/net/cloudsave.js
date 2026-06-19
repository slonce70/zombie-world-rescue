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
      if (res.ok) {
        this.lastOkTs = Date.now();
        // запам'ятовуємо серверний ts цього сейва: bootSync порівнюватиме його з хмарним
        const j = await res.json().catch(() => null);
        if (j && j.ts) {
          this.game.save.cloudTs = j.ts;
          try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.save)); } catch (e) { /* ignore */ }
        }
        return true;
      }
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

  // на старті: узгоджуємо локальний і хмарний сейви БЕЗ втрати новішого прогресу.
  // Правило: якщо хмара має прогрес, записаний ПІЗНІШЕ за наш останній пуш (cloud.ts > save.cloudTs),
  // беремо хмару; інакше пушимо локальний. Так старий пристрій не затирає свіжий прогрес.
  async bootSync() {
    if (!this.enabled) return;
    const local = this.game.save;
    const localHas = saveHasProgress(local);
    const cloud = await this.pull();
    let cloudObj = null;
    if (cloud && cloud.data) { try { cloudObj = JSON.parse(cloud.data); } catch (e) { /* битий хмарний */ } }
    const cloudHas = cloudObj && saveHasProgress(cloudObj);
    if (!cloudHas) { if (localHas) this.push(); return; }   // у хмарі порожньо → пушимо своє
    // При adopt штампуємо серверний ts щоб наступний bootSync не тягнув хмару знову
    const adoptWithTs = (data) => {
      try {
        const s = JSON.parse(data);
        s.cloudTs = cloud.ts | 0;
        this.adopt(JSON.stringify(s));
      } catch (e) { this.adopt(data); }
    };
    if (!localHas) { adoptWithTs(cloud.data); return; }      // локально порожньо → беремо хмару
    // обидва мають прогрес: вирішує серверний час
    if ((cloud.ts | 0) > (local.cloudTs | 0)) adoptWithTs(cloud.data); // хмара новіша за наш останній пуш
    else this.push();                                                    // ми не старіші → пушимо своє
  }
}
