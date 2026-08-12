// 🟢 Клієнт Лобі: «хто онлайн» + список відкритих кімнат.
// Пінгуємо воркер кожні ~8с, поки відкрита модалка мультиплеєра або жива
// кооп-сесія. Всі фейли тихі — без інтернету панель просто каже «недоступно».
import { apiBase } from './transport.js';
import { ensureCid } from './league.js';
import { liberatedCount } from './cloudsave.js';
import { loadNick, cleanNick } from './coop.js';
import { t } from '../i18n.js';
import { syncTitles, titleName } from '../titles.js';

const PING_MS = 8000;

// 🌍 Лічильник світу: скільки людей УСІ гравці врятували сьогодні (воркер віддає
// worldSaved за добу і worldSavedWeek за 7 діб).
//
// Порожній світ виглядає сумно: якщо за добу набралось менше за поріг, показуємо
// тижневе число замість добового. Поріг = 100 людей. За один забіг фізично рятується
// щонайбільше ~11 людей на рівень (хлів/маєток/підземелля/корабель), тобто навіть
// найдовша експедиція — це ~55. Добове число нижче сотні означає «сьогодні грали
// один-двоє» — таке «світ урятував 14 людей» радше засмутить, ніж підштовхне.
// Тижневе завжди ≥ добового, тож текст ніколи не показує менше число.
export const WORLD_DAY_MIN = 100;

// 12480 → «12 480»: діти читають великі числа групами по три.
const groups = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');

// Готовий рядок для глобуса з відповіді лобі (або '' — тоді блок не показується:
// немає інтернету, немає даних, або світ сьогодні й за тиждень нікого не врятував).
export function worldSavedText(d) {
  const day = Math.max(0, (d && d.worldSaved) | 0);
  const week = Math.max(0, (d && d.worldSavedWeek) | 0);
  if (day >= WORLD_DAY_MIN) return t('🌍 Сьогодні врятовано людей: {n}', { n: groups(day) });
  if (week > 0) return t('🌍 За тиждень врятовано людей: {n}', { n: groups(week) });
  return '';
}

// Одне читання лобі без пінг-циклу: на глобусі мультиплеєр не пінгує, а число
// показати треба. Фейл тихий — null, і блок просто ховається.
export async function fetchLobbyState() {
  try {
    const res = await fetch(`${apiBase()}/lobby/state`);
    return res.ok ? await res.json() : null;
  } catch (e) {
    return null;
  }
}

export class LobbyClient {
  constructor(game) {
    this.game = game;
    this.data = null;        // останнє {online, players, rooms} або null
    this.onUpdate = null;    // (data|null) — оновити панель
    this.getRoom = null;     // () => {code, mode, country, n, state, build} | null
    this._timer = null;
    this._busy = false;
    this._pendingExtra = null; // разовий вантаж (day/close), що чекає слоту між пінгами
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

  // 🏆 «топ-3 сьогодні»: шлемо свій штормовий результат у денний рейтинг лобі.
  // Разовий пінг поза розкладом — навіть якщо панель зараз не пінгує (кінець забігу).
  announceDayScore(wave) {
    const score = Math.max(1, Math.min(200, wave | 0));
    this._ping({ day: { nick: cleanNick(loadNick()) || t('Гравець'), score } });
  }

  // 🌍 Внесок у лічильник світу: скільки людей справді звільнено на рівні.
  // Теж разовий пінг поза розкладом — рівень закінчився, панель лобі вже не пінгує.
  // Стелю тримає воркер (клієнт тут недовірене джерело), нам досить не слати сміття.
  announceSaved(n) {
    const saved = Math.max(0, n | 0);
    if (!saved) return; // нікого не врятували — воркер не турбуємо
    this._ping({ saved });
  }

  async _ping(extra = {}) {
    if (this._busy) {
      // разовий вантаж (day/close) НЕ сміє загубитись, поки плановий пінг у польоті —
      // відкладаємо і донесемо одразу після завершення поточного запиту
      if (extra && Object.keys(extra).length) this._pendingExtra = { ...(this._pendingExtra || {}), ...extra };
      return;
    }
    this._busy = true;
    try {
      const body = {
        cid: ensureCid(this.game),
        nick: cleanNick(loadNick()) || t('Гравець'),
        profile: this._profile(),
        ...(this._pendingExtra || {}),
        ...extra,
      };
      this._pendingExtra = null;
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
    // накопичився відкладений вантаж, поки цей запит літав — шлемо одразу
    if (this._pendingExtra) this._ping();
  }

  _profile() {
    const s = this.game.save || {};
    syncTitles(s);
    return {
      countries: liberatedCount(s.liberated),
      coins: s.coins | 0,
      crystals: s.crystals | 0,
      kills: (s.stats && s.stats.killed) | 0,
      star: this.game.progress ? this.game.progress.level : 1,
      prestige: this.game.progress ? this.game.progress.prestigeStars : 0,
      title: titleName(s.activeTitle),
    };
  }
}
