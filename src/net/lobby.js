// 🟢 Клієнт Лобі: «хто онлайн» + список відкритих кімнат.
// Пінгуємо воркер кожні ~8с, поки відкрита модалка мультиплеєра або жива
// кооп-сесія. Всі фейли тихі — без інтернету панель просто каже «недоступно».
import { apiBase } from './transport.js';
import { ensureCid } from './league.js';
import { liberatedCount } from './cloudsave.js';
import { loadNick, saveNick, cleanNick } from './coop.js';
import { t } from '../i18n.js';
import { syncTitles, titleName } from '../titles.js';

const PING_MS = 8000;

// 🌍 Лічильник світу: скільки людей УСІ гравці врятували (воркер віддає worldSaved
// за добу і worldSavedWeek за 7 діб).
//
// Показуємо ЛИШЕ тижневе число — і тому, і тому:
//  • порожній світ виглядає сумно. За один забіг фізично рятується щонайбільше ~11
//    людей на рівень (хлів/маєток/підземелля/корабель), тож добове число нижче сотні
//    означає «сьогодні грали один-двоє»: «світ урятував 14 людей» радше засмутить.
//  • число не сміє ПАДАТИ протягом дня. Перемикання «мало за добу → показую тиждень,
//    багато за добу → показую добу» падало рівно тоді, коли гравців більшало: ранок
//    day=50, week=400 → «400», обід day=120, week=470 → «120». Тижневе за день лише
//    росте, тож одна мірка на весь день — це й найпростіше, і єдине чесне.
// Поріг однаковий: поки світ за тиждень не набрав сотні, блока просто немає.
export const WORLD_MIN = 100;

// 12480 → «12 480»: діти читають великі числа групами по три.
const groups = (n) => String(n).replace(/\B(?=(\d{3})+$)/g, ' ');

// Готовий рядок для глобуса з відповіді лобі (або '' — тоді блок не показується:
// немає інтернету, немає даних, або світ за тиждень не набрав порога).
export function worldSavedText(d) {
  const week = Math.max(0, (d && d.worldSavedWeek) | 0);
  if (week >= WORLD_MIN) return t('🌍 За тиждень врятовано людей: {n}', { n: groups(week) });
  return '';
}

// 🤝 ДУЕЛЬ ДНЯ. Дошка результатів режиму дня приїжджає полем `duel` у тій самій
// відповіді лобі, що й топ-3 Шторму, — окремого каналу немає.
// Запис: {nick, m: <id режиму>, ms: <час, 0 = без часу>, w: <пройшов>}.
//
// Фільтруємо за режимом СВОГО дня: доба у воркері рахується за UTC, а режим дня —
// за локальною датою гравця, тож біля півночі в одній комірці можуть лежати два
// режими. Показуємо лише той, який дитина справді сьогодні грає.
export function duelRows(d, modeId) {
  const list = Array.isArray(d && d.duel) ? d.duel : [];
  return list
    .filter((e) => e && e.nick && e.m === modeId)
    .sort((a, b) => (b.w ? 1 : 0) - (a.w ? 1 : 0) || ((a.ms | 0) || Infinity) - ((b.ms | 0) || Infinity));
}

// Результат людською мовою: час, «пройдено» без часу, або «спроба».
// Програш НЕ карається і не називається поразкою — це гра для дітей, не рейтинг.
// Форми БЕЗРОДОВІ: рядок дошки читається як «Соломія — спроба», а не «Соломія —
// спробував». Чіпляти чоловічий рід до чужого імені не можна, а дублювати рід
// у словниках ні до чого — іменник просто не має цієї проблеми.
export function duelTime(ms, won) {
  if (!won) return t('спроба');
  const n = Math.max(0, ms | 0);
  if (!n) return t('пройдено');
  return `${Math.floor(n / 60000)}:${String(Math.floor((n % 60000) / 1000)).padStart(2, '0')}`;
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

  // нік, під яким гравець видно в лобі (і в дошці дуелі)
  nick() { return cleanNick(loadNick()) || t('Гравець'); }

  // 🤝 Чи має дитина СВОЄ імʼя. Нік зберігають лише кооп-шляхи, тож соліст, який
  // жодного разу не відкривав «ГРАТИ РАЗОМ», ніка не має ЗА КОНСТРУКЦІЄЮ — і всі
  // такі діти зливались в один рядок «Гравець» на дошці дуелі: чужий час світився
  // як власний. Тому дошка питає імʼя сама (див. _refreshDuelBoard у main.js),
  // а безіменна спроба на спільну дошку не їде взагалі.
  hasNick() { return cleanNick(loadNick()).length >= 2; }

  // імʼя з поля дошки дуелі — ті самі правила, що й на кроці ніка в коопі.
  // '' = не годиться і НЕ збережено. Окремо відкидаємо саме «Гравець»: cleanNick
  // підміняє ним лайку, і це рівно той злитий рядок, від якого дошка тікає.
  setNick(raw) {
    const nick = cleanNick(raw);
    if (nick.length < 2 || nick === t('Гравець')) return '';
    saveNick(nick);
    return nick;
  }

  // 🏆 «топ-3 сьогодні»: шлемо свій штормовий результат у денний рейтинг лобі.
  // Разовий пінг поза розкладом — навіть якщо панель зараз не пінгує (кінець забігу).
  announceDayScore(wave) {
    const score = Math.max(1, Math.min(200, wave | 0));
    this._ping({ day: { nick: this.nick(), score } });
  }

  // 🤝 Дуель дня: спроба в режимі дня. Той самий разовий пінг, що й денний топ —
  // у відповіді вже лежить оновлена дошка, тож окремого читання не треба.
  async announceDuel(mode, ms, won) {
    if (!this.hasNick()) return null; // без свого імені на дошці нікого не впізнати
    await this._ping({ duel: { nick: this.nick(), mode, ms: Math.max(0, ms | 0), won: !!won } });
    return this.data;
  }

  // 🌍 Внесок у лічильник світу: скільки людей справді звільнено на рівні.
  // Теж разовий пінг поза розкладом — рівень закінчився, панель лобі вже не пінгує.
  // Стелю тримає воркер (клієнт тут недовірене джерело), нам досить не слати сміття.
  // Відповідь ПОВЕРТАЄМО: у ній уже лежить свіжий worldSaved з нашим внеском, тож
  // глобусу не треба окремого читання (яке однаково програвало б гонку троттлу).
  async announceSaved(n) {
    const saved = Math.max(0, n | 0);
    if (!saved) return null; // нікого не врятували — воркер не турбуємо
    await this._ping({ saved });
    return this.data;
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
        nick: this.nick(),
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
