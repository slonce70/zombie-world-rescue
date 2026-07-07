// 💾 Хмарний сейв: прогрес автоматично летить у SaveVault на zr-relay.
// Усі фейли тихі — гра НІКОЛИ не залежить від доступності хмари.
//  - після кожного saveGame() — пуш у хмару з дебаунсом (сервер приймає раз на 15с)
//  - на старті: якщо локальний сейв порожній, а в хмарі є прогрес за цим cid — беремо хмарний
//  - постійний код відновлення (8 знаків) повертає прогрес на будь-якому пристрої
import { apiBase } from './transport.js';
import { ensureCid } from './league.js';

const PUSH_DELAY_MS = 25_000;
export const SAVE_KEY = 'zr-save-v1';
export const SAVE_CONFLICT_KEY = 'zr-save-conflict-v1';
const SHIPPED_ORIGIN = 'https://slonce70.github.io';

// 🎨 Дефолтний герой і стартові монети — ЄДИНЕ ДЖЕРЕЛО для _newSave (main.js) і
// для saveHasProgress. Якщо порівнювати «чи кастомний герой» з інлайн-числами в
// двох місцях, вони розійдуться при будь-якій зміні палітри. Тримаємо тут, бо саме
// тут живе захист від перезапису прогресу.
export const DEFAULT_HERO = {
  shirt: 0x2f80c3, pants: 0x474f63, skin: 0xffc9a3, shoes: 0x303642, hatColor: 0x2f80c3,
  hat: 'cap', face: 'smile', body: 'regular', hair: 'none', accessory: 'none', back: 'pack',
};
export const NEW_SAVE_COINS = 50;

export const liberatedIds = (liberated = {}) => Object.keys(liberated || {}).filter((id) => !!liberated[id]);
export const liberatedCount = (liberated = {}) => liberatedIds(liberated).length;
export const hasLiberated = (liberated = {}, id) => !!(liberated && liberated[id]);

// Drift guard for permanent save/progress keys. Any new top-level permanent key in
// _newSave() should either be added here if it can protect real progress, or be
// explicitly listed as non-progress in the focused cloudsave test.
export const SAVE_PROGRESS_KEYS = Object.freeze([
  'liberated', 'xp', 'passLvl', 'missionRuns', 'stormBest', 'worldBosses',
  'modeBest', 'modeWins', 'modeRewards', 'weekly',
  'coins', 'crystals', 'upgrades', 'bestiary', 'bestiaryGoals',
  'chapter', 'infected', 'megaQuests', 'medals', 'stats',
  'goal', 'hero', 'skins', 'dances', 'tracers', 'titles',
  'souls', 'soulLevel', 'gadgetsOwned', 'gadgetHypers', 'pets',
  'towerSkins', 'diffStar', 'weapons', 'radiationCoins', 'cloneSkins', 'activeCloneSkin',
  'gift', 'weeklyGoal', 'donations', 'donStars',
  'coopWins', 'coopBonusDay',
  // ⭐ R3 «Зірки та милосердя»: зірки країн, видані пороги-нагороди, лічильник милосердя
  'stars', 'starClaims', 'mercyDeaths',
  // 🤝 R4 «Врятовані друзі»: врятовані НПС і день останнього «щоденного дякую» табору
  'friends', 'friendThanks',
  // 🥚 R5 «Колекція та яйця»: яйця, видані пороги (зірки/друзі), корм і рівні петсів
  'eggs', 'eggClaims', 'friendEggClaims', 'petFood', 'petLevels',
  // 🏕️ R4 (v299) «Табір кличе»: тижневий квест табору (тиждень/квест/прогрес/забрано)
  'weeklyCamp',
  // 🌍 v303 «Світ врятовано»: одноразовий прапорець фіналу кампанії (усі 12 країн вільні)
  'worldSaved',
]);

// ЄДИНА функція-джерело «чи в цьому сейві є що втрачати». Її бачать і захист
// імпорту/claim (adopt + confirm-діалоги в saveui), і newest-wins у bootSync.
// F24+F27: раніше рахувались лише 4 поля (liberated/xp/missionRuns/stormBest), тож
// дитина, яка зробила кастом-героя / поставила ціль / накопичила монети ДО першого
// вбивства, мала saveHasProgress=false → claim/імпорт ТИХО перезаписував без
// попередження, а bootSync міг adopt-нути хмару поверх живого локального.
export function saveHasProgress(s) {
  if (!s || typeof s !== 'object') return false;
  const hero = s.hero && typeof s.hero === 'object' ? { ...DEFAULT_HERO, ...s.hero } : null;
  const heroChanged = s.hero && typeof s.hero === 'object'
    && Object.keys(DEFAULT_HERO).some((k) => hero[k] !== DEFAULT_HERO[k]);
  return liberatedCount(s.liberated) > 0
    || (s.xp | 0) > 0
    || Object.keys(s.missionRuns || {}).length > 0
    || Object.keys(s.stormBest || {}).length > 0
    || Object.keys(s.worldBosses || {}).length > 0
    || Object.keys(s.modeBest || {}).length > 0             // рекорди соло-режимів
    || Object.keys(s.modeWins || {}).length > 0             // перемоги/віхи соло-режимів (modeRewards похідні)
    || Object.keys(s.weekly || {}).length > 0               // недільні нагороди (weekly-випробування/бос тижня)
    || (s.coins | 0) > NEW_SAVE_COINS                       // більше за стартові монети
    || (s.crystals | 0) > 0                                  // преміальна валюта зі скінів
    || Object.keys(s.upgrades || {}).length > 0             // куплені прокачування
    || Object.keys(s.bestiary || {}).length > 0             // бачені вороги
    || !!(s.bestiaryGoals && (s.bestiaryGoals.b10 || s.bestiaryGoals.b20 || s.bestiaryGoals.all)) // видані нагороди бестіарію
    || (s.chapter && (s.chapter.done || Object.keys(s.chapter.p || {}).length > 0))
    || (s.infected && (s.infected.done || Object.keys(s.infected.cleared || {}).length > 0))
    || Object.values(s.megaQuests || {}).some((q) => q && ((q.progress | 0) > 0 || q.done))
    || (s.medals || []).length > 0                          // медалі
    || (s.stats && (s.stats.killed | 0) > 0)               // хоч одне вбивство в статистиці
    || (s.stats && (s.stats.coinsSpent | 0) > 0)           // витрати монет для титулів
    || (s.stats && ((s.stats.cloneUses | 0) > 0 || (s.stats.gadgetUses | 0) > 0 || (s.stats.damageDealt | 0) > 0))
    || !!s.goal                                             // поставлена ціль
    || heroChanged                                          // кастом-герой ≠ дефолт
    || (s.skins || []).length > 2                           // більше за ['classic','custom']
    || (s.dances || []).length > 1                          // більше за ['shuffle']
    || (s.tracers || []).length > 1                         // більше за ['classic']
    || (s.titles || []).length > 0 || !!s.activeTitle        // відкриті/активні титули
    || (s.souls | 0) > 0 || (s.soulLevel | 0) > 1            // шлях душ
    || (s.gadgetsOwned || []).length > 0                    // куплені гаджети
    || (s.gadgetHypers || []).length > 0                    // постійні гіперзаряди гаджетів
    || (s.pets || []).length > 0                            // куплені улюбленці
    || (s.towerSkins || []).length > 1                      // куплені скіни башти
    || (s.diffStar | 0) > 1                                 // піднята складність
    || (s.radiationCoins | 0) > 0                            // валюта режиму Радіація
    || (s.cloneSkins || []).length > 0 || (!!s.activeCloneSkin && s.activeCloneSkin !== 'ninja')
    || !!(s.gift && (s.gift.streak | 0) > 0)                 // стрик подарунка дня — щоб зміна пристрою не обнуляла його
    || (s.stars && typeof s.stars === 'object' && Object.values(s.stars).some((v) => (v | 0) > 0)) // ⭐ зароблені зірки країн
    || (s.friends && typeof s.friends === 'object' && Object.values(s.friends).some((v) => !!v)) // 🤝 врятовані друзі
    || (s.eggs | 0) > 0                                     // 🥚 зароблені яйця петсів
    || (Array.isArray(s.eggClaims) && s.eggClaims.length > 0) // видані пороги-яйця (зірки)
    || (Array.isArray(s.friendEggClaims) && s.friendEggClaims.length > 0) // видані пороги-яйця (друзі)
    || (s.petFood | 0) > 0                                  // 🍖 корм для росту петсів
    || (s.petLevels && typeof s.petLevels === 'object' && Object.values(s.petLevels).some((v) => (v | 0) > 1)) // рівні петсів
    || (s.weeklyCamp && typeof s.weeklyCamp === 'object' && ((s.weeklyCamp.p | 0) > 0 || !!s.weeklyCamp.claimed)) // 🏕️ прогрес/нагорода тижневого квесту табору
    || (s.worldSaved | 0) > 0                               // 🌍 фінал кампанії пройдено (усі 12 країн вільні)
    || (Array.isArray(s.weapons) && s.weapons.some((id) => id !== 'pistol')); // здобута/розблокована зброя
}

export class CloudSave {
  constructor(game) {
    this.game = game;
    // тести/localhost не мають спамити продакшн-хмару; ?cloud вмикає її явно (з dev-relay)
    this.enabled = game.params.has('cloud') || (typeof location !== 'undefined' && location.origin === SHIPPED_ORIGIN);
    this.lastOkTs = 0;   // коли востаннє успішно синхронізувались
    this.lastFailTs = 0;
    this.lastFailStatus = 0;
    this._timer = null;
    // дебаунс 25с не встигає при швидкому закритті вкладки → флашимо стан при відході зі сторінки,
    // щоб остання нагорода не загубилась при переході телефон↔планшет
    if (typeof addEventListener === 'function') {
      const flush = () => {
        if (!this.enabled) return;
        clearTimeout(this._timer);
        try {
          const body = JSON.stringify({ cid: ensureCid(this.game), data: JSON.stringify(this.game.save) });
          if (navigator.sendBeacon) navigator.sendBeacon(`${apiBase()}/save/put`, new Blob([body], { type: 'application/json' }));
          else this.push();
        } catch (e) { /* ignore */ }
      };
      addEventListener('pagehide', flush);
      addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
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
        this.lastFailTs = 0;
        this.lastFailStatus = 0;
        // запам'ятовуємо серверний ts цього сейва: bootSync порівнюватиме його з хмарним.
        // ВАЖЛИВО: /save/put МАЄ повертати {ts} — без цього cloudTs залишається 0 і
        // bootSync при наступному запуску може знову взяти хмарний сейв. Самолікується
        // щойно сервер почне повертати ts (не критично, але рекомендована поведінка сервера).
        const j = await res.json().catch(() => null);
        if (j && j.ts) {
          this.game.save.cloudTs = j.ts;
          delete this.game.save._cloudDirty;
          try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.save)); } catch (e) { /* ignore */ }
        }
        return true;
      }
      this.lastFailTs = Date.now();
      this.lastFailStatus = res.status || 0;
    } catch (e) { /* офлайн — нічого страшного */ }
    if (!this.lastFailTs) {
      this.lastFailTs = Date.now();
      this.lastFailStatus = 0;
    }
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

  // прийняти чужий сейв (з коду або файлу) і перезапустити гру.
  // opts.justImported — F25: файл-імпорт ставить прапорець, який наступний bootSync
  // спожиє ОДИН раз: пропустить adopt-хмари і форсне push, щоб імпортований файл став
  // найновішим у хмарі (інакше новіший хмарний ts тихо перезаписав би щойно імпортоване).
  adopt(rawJson, opts = {}) {
    try {
      const s = JSON.parse(rawJson);
      if (!s || typeof s !== 'object') return false;
      // захист від випадкового імпорту порожнього/обрізаного файлу поверх реального прогресу
      if (!saveHasProgress(s) && saveHasProgress(this.game.save)) return false;
      if (opts.justImported) {
        s._justImported = true;
        localStorage.setItem(SAVE_KEY, JSON.stringify(s));
      } else {
        localStorage.setItem(SAVE_KEY, rawJson);
      }
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
    const local = this.game.save;
    // F25: щойно імпортований файл має стати найновішим у хмарі — пропускаємо adopt раз і пушимо.
    // Прапорець споживаємо навіть коли хмара вимкнена, щоб він не «залип» у localStorage.
    if (local._justImported) {
      delete local._justImported;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(local)); } catch (e) { /* ignore */ }
      if (this.enabled) this.push();
      return;
    }
    if (!this.enabled) return;
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
        s.cloudTs = Number(cloud.ts) || 0;
        this.adopt(JSON.stringify(s));
      } catch (e) { this.adopt(data); }
    };
    if (!localHas) { adoptWithTs(cloud.data); return; }      // локально порожньо → беремо хмару
    // обидва мають прогрес: вирішує серверний час
    if ((Number(cloud.ts) || 0) > (Number(local.cloudTs) || 0)) {
      if (local._cloudDirty) {
        try {
          localStorage.setItem(SAVE_CONFLICT_KEY, JSON.stringify({
            ts: Number(cloud.ts) || 0,
            save: cloudObj,
          }));
        } catch (e) { /* ignore */ }
        this.lastFailTs = Date.now();
        this.lastFailStatus = 409;
        return;
      }
      adoptWithTs(cloud.data); // хмара новіша за наш останній пуш
    } else this.push();                                                    // ми не старіші → пушимо своє
  }
}
