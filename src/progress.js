// Прогресія акаунта: зірковий досвід (XP), «Зоряний шлях» (безкоштовний пасс),
// щоденні завдання. Все зберігається в сейві й живе ПОВЕРХ рівнів.
import { RNG } from './utils.js';
import { t, keyHint, getLang } from './i18n.js';

// ---------- Зоряний шлях ----------
// нагороди за рівні: монети, танці, скіни, гаджети, сліди куль
export const PASS_REWARDS = {
  2: { type: 'coins', n: 100, icon: '💰', name: t('100 монет') },
  3: { type: 'dance', id: 'spin', icon: '🌪️', name: t('Танець «Дзиґа»') },
  4: { type: 'gadget', id: 'tramp', icon: '🦘', name: t('Гаджет «Кишеньковий батут»') },
  5: { type: 'skin', id: 'ninja', icon: '🥷', name: t('Скін «Ніндзя»') },
  6: { type: 'coins', n: 150, icon: '💰', name: t('150 монет') },
  7: { type: 'tracer', id: 'gold', icon: '✨', name: t('Золоті кулі') },
  8: { type: 'gadget', id: 'wall', icon: '🧱', name: t('Гаджет «Барикада»') },
  9: { type: 'dance', id: 'robot', icon: '🤖', name: t('Танець «Робот»') },
  10: { type: 'skin', id: 'astro', icon: '👨‍🚀', name: t('Скін «Космонавт»') },
  11: { type: 'coins', n: 200, icon: '💰', name: t('200 монет') },
  12: { type: 'coins', n: 200, icon: '💰', name: t('200 монет') },
  13: { type: 'dance', id: 'wave', icon: '🌊', name: t('Танець «Хвиля»') },
  14: { type: 'skin', id: 'pirate', icon: '🏴‍☠️', name: t('Скін «Пірат»') },
  15: { type: 'coins', n: 250, icon: '💰', name: t('250 монет') },
  16: { type: 'tracer', id: 'rainbow', icon: '🌈', name: t('Веселкові кулі') },
  17: { type: 'coins', n: 250, icon: '💰', name: t('250 монет') },
  18: { type: 'coins', n: 300, icon: '💰', name: t('300 монет') },
  19: { type: 'coins', n: 350, icon: '💰', name: t('350 монет') },
  20: { type: 'skin', id: 'robot', icon: '🤖', name: t('Скін «Робот»') },
  // Оновлення 9: шлях продовжується до 30
  21: { type: 'coins', n: 400, icon: '💰', name: t('400 монет') },
  22: { type: 'tracer', id: 'neon', icon: '🟢', name: t('Неонові кулі') },
  23: { type: 'coins', n: 450, icon: '💰', name: t('450 монет') },
  24: { type: 'coins', n: 500, icon: '💰', name: t('500 монет') },
  25: { type: 'skin', id: 'legend', icon: '🏆', name: t('Скін «Легенда»') },
  26: { type: 'coins', n: 550, icon: '💰', name: t('550 монет') },
  27: { type: 'coins', n: 600, icon: '💰', name: t('600 монет') },
  28: { type: 'coins', n: 650, icon: '💰', name: t('650 монет') },
  29: { type: 'coins', n: 700, icon: '💰', name: t('700 монет') },
  30: { type: 'tracer', id: 'royal', icon: '👑', name: t('Королівські кулі + слава') },
  // шлях продовжено до 33 — ФІНАЛ = гаджет «Метеорит» (інакше його не дістати)
  31: { type: 'coins', n: 750, icon: '💰', name: t('750 монет') },
  32: { type: 'coins', n: 800, icon: '💰', name: t('800 монет') },
  33: { type: 'gadget', id: 'meteor', icon: '☄️', name: t('Гаджет «Метеорит»') },
};
export const PASS_MAX_LEVEL = 33;

// скільки XP треба, щоб перейти з рівня n на n+1
export function xpForLevel(n) { return 80 + 40 * (n - 1); }

// XP за події
export const XP_VALUES = {
  kill: 2, killBig: 5, killGolden: 20, killBoss: 120,
  mission: 25, horde: 20, country: 150, quest: 40, megabox: 15,
};

export class Progress {
  constructor(game) {
    this.game = game;
  }

  get xp() { return this.game.save.xp || 0; }

  // рівень із загального XP
  get level() {
    let xp = this.xp;
    let lvl = 1;
    while (lvl < PASS_MAX_LEVEL && xp >= xpForLevel(lvl)) {
      xp -= xpForLevel(lvl);
      lvl++;
    }
    return lvl;
  }

  // прогрес до наступного рівня 0..1
  levelFrac() {
    let xp = this.xp;
    let lvl = 1;
    while (lvl < PASS_MAX_LEVEL && xp >= xpForLevel(lvl)) {
      xp -= xpForLevel(lvl);
      lvl++;
    }
    if (lvl >= PASS_MAX_LEVEL) return 1;
    return xp / xpForLevel(lvl);
  }

  // Сумарний XP, потрібний щоб ДОСЯГТИ максимального рівня пасу
  get _xpToCap() {
    let need = 0;
    for (let l = 1; l < PASS_MAX_LEVEL; l++) need += xpForLevel(l);
    return need;
  }

  // Нескінченний м'який престиж після стелі пасу. Без таймерів/FOMO — чистий статус.
  get prestigeStars() {
    const extra = this.xp - this._xpToCap;
    return extra > 0 ? Math.floor(extra / 600) : 0;
  }

  addXp(n) {
    if (n <= 0) return;
    const game = this.game;
    const prestigeBefore = this.prestigeStars; // ДО додавання XP (до зміни save.xp)
    const before = this.level;
    game.save.xp = (game.save.xp || 0) + n;
    const after = this.level;
    for (let lvl = before + 1; lvl <= after; lvl++) this._grantLevel(lvl);
    const prestigeAfter = this.prestigeStars;
    if (prestigeAfter > prestigeBefore) {
      game.hud.banner(t('🎖️ РАНГ РЯТІВНИКА {n}!', { n: prestigeAfter }), t('Так тримати, легендо!'), 4.2);
    }
    // 🔥 вогнемет@25 / 🔫 лазер@28 — нагороди за зірковий рівень (ОКРЕМО від PASS_REWARDS)
    if (after > before) this._checkWeaponUnlocks();
    game.saveGame();
  }

  // 🎖️ Зброя за ЗІРКОВИЙ РІВЕНЬ: вогнемет@25, лазер@28. Окремо від PASS_REWARDS.
  // Викликається з addXp (при підвищенні рівня) і на boot (catch-up для тих, хто вже ≥25/28).
  _checkWeaponUnlocks() {
    const g = this.game, lvl = this.level;
    const grant = (need, id, name) => {
      if (lvl >= need && !(g.save.weapons || []).includes(id)) {
        if (!g.save.weapons) g.save.weapons = [];
        g.save.weapons.push(id);
        if (g.level && g.level.player) g.level.player.giveWeapon(id, false);
        if (g.hud) g.hud.banner(t('🎖️ ЗІРКОВИЙ РІВЕНЬ {n}!', { n: need }), t('Нова зброя: {w}! Перемкни її 🔁', { w: name }), 4.4);
        g.saveGame();
      }
    };
    grant(25, 'flamethrower', t('🔥 ВОГНЕМЕТ'));
    grant(28, 'laser', t('🔫 ЛАЗЕР'));
    // 🛡️ скін «Лицар» — за зірковий рівень 30 (фінал шляху; royal-трасер на 30 лишається)
    if (lvl >= 30 && !(g.save.skins || []).includes('knight')) {
      if (!g.save.skins) g.save.skins = [];
      g.save.skins.push('knight');
      if (g.hud) g.hud.banner(t('🎖️ ЗІРКОВИЙ РІВЕНЬ 30!'), t('Скін «Лицар» 🛡️ — одягни в Гардеробі!'), 4.4);
      g.saveGame();
    }
  }

  _grantLevel(lvl) {
    const game = this.game;
    const r = PASS_REWARDS[lvl];
    game.audio.levelUp();
    if (!r) {
      game.hud.banner(t('🎖️ ЗІРКОВИЙ РІВЕНЬ {lvl}!', { lvl }), t('Так тримати!'));
      return;
    }
    let sub = t('Нагорода: {i} {n}', { i: r.icon, n: r.name });
    if (r.type === 'coins') {
      game.save.coins += r.n;
    } else if (r.type === 'gadget') {
      if (game.save.gadgetsOwned.includes(r.id)) {
        game.save.coins += 150;
        sub = t('Нагорода: гаджет уже є — тримай 💰 150 монет!');
      } else {
        game.save.gadgetsOwned.push(r.id);
        if (!game.save.activeGadget) game.save.activeGadget = r.id;
        sub += t(' — {k}!', { k: keyHint('кнопка 🦘', 'клавіша F') });
      }
    } else if (r.type === 'skin') {
      if (!game.save.skins.includes(r.id)) game.save.skins.push(r.id);
      sub += t(' — одягни в Гардеробі 🎒');
    } else if (r.type === 'dance') {
      if (!game.save.dances.includes(r.id)) game.save.dances.push(r.id);
      sub += t(' — обери в Гардеробі 🎒');
    } else if (r.type === 'tracer') {
      if (!game.save.tracers.includes(r.id)) game.save.tracers.push(r.id);
      game.save.activeTracer = r.id;
      if (game.level) game.level.effects.tracerStyle = r.id;
    }
    game.hud.banner(t('🎖️ ЗІРКОВИЙ РІВЕНЬ {lvl}!', { lvl }), sub, 4.2);
  }
}

// ---------- Щоденні завдання ----------
// Пул завдань. check-події надходять із гри через onEvent(type, data).
const QUEST_POOL = [
  { id: 'kills', icon: '🧟', target: 40, title: (n) => t('Перемоги {n} зомбі', { n }), ev: 'kill' },
  { id: 'killsWeapon', icon: '🔫', target: 15, weaponPick: true, ev: 'kill' },
  { id: 'headshots', icon: '🎯', target: 12, title: (n) => t('Влучи в голову {n} разів', { n }), ev: 'headshot' },
  { id: 'coins', icon: '💰', target: 250, title: (n) => t('Назбирай {n} монет', { n }), ev: 'coins' },
  { id: 'pickups', icon: '🎁', target: 8, title: (n) => t('Підбери {n} знахідок', { n }), ev: 'pickup' },
  { id: 'shields', icon: '🛡', target: 2, title: (n) => t('Зламай {n} щити щитоносців', { n }), ev: 'shield' },
  { id: 'megabox', icon: '🦙', target: 1, title: () => t('Відкрий Мегабокс'), ev: 'megabox' },
  { id: 'dance', icon: '💃', target: 1, title: () => t('Станцюй переможний танець (N)'), ev: 'dance' },
  { id: 'golden', icon: '🏆', target: 1, title: () => t('Дожени золотого зомбі'), ev: 'golden' },
  { id: 'boss', icon: '👑', target: 1, title: () => t('Переможи боса будь-якої країни'), ev: 'boss' },
  { id: 'horde', icon: '🌊', target: 2, title: (n) => t('Відбий {n} орди', { n }), ev: 'horde' },
];
const QUEST_REWARD_COINS = 120;
const WEAPON_NAMES = {
  pistol: t('пістолета'), rifle: t('автомата'), shotgun: t('дробовика'),
  smg: t('швидкостріла'), magnum: t('магнума'), sniper: t('снайперки'), bazooka: t('базуки'),
};

export class DailyQuests {
  constructor(game) {
    this.game = game;
    this.ensureToday();
  }

  todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // перерахувати заголовок квеста з його полів (для пере-локалізації після зміни мови)
  _resolveTitle(q) {
    const def = QUEST_POOL.find((p) => p.id === q.id);
    if (!def) return q.title;
    if (def.weaponPick) return t('Перемоги {n} зомбі з {w}', { n: q.target, w: WEAPON_NAMES[q.weapon] || t('зброї') });
    return def.title(q.target);
  }

  // генеруємо 3 завдання дня (детерміновано від дати) або підхоплюємо збережені
  ensureToday(forceKey = null) {
    const key = forceKey || this.todayKey();
    const saved = this.game.save.quests;
    const lang = getLang();
    if (saved && saved.date === key && Array.isArray(saved.list) && saved.list.length) {
      // та сама доба — лише пере-локалізуємо заголовки, якщо мову змінили (вони зберігаються рядком)
      if (saved.lang !== lang) {
        for (const q of saved.list) q.title = this._resolveTitle(q);
        saved.lang = lang;
        this.game.saveGame();
      }
      return;
    }
    // 🕒 анти-фарм: переведення годинника НАЗАД не дає нових квестів — лише рух уперед.
    // Ключі формату YYYY-MM-DD порівнюються лексикографічно = хронологічно.
    const maxKey = (saved && saved.maxKey) || (saved && saved.date) || '';
    if (!forceKey && key < maxKey && saved && Array.isArray(saved.list) && saved.list.length) {
      // набір квестів заморожено анти-фармом, але мова інтерфейсу може йти за активною
      if (saved.lang !== lang) {
        for (const q of saved.list) q.title = this._resolveTitle(q);
        saved.lang = lang;
        this.game.saveGame();
      }
      return;
    }
    // сід із дати
    let seed = 0;
    for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rng = new RNG(seed);
    const pool = [...QUEST_POOL];
    const owned = ['pistol', ...(this.game.save.weapons || [])];
    const list = [];
    while (list.length < 3 && pool.length) {
      const q = pool.splice(rng.int(0, pool.length - 1), 1)[0];
      const quest = { id: q.id, ev: q.ev, icon: q.icon, target: q.target, progress: 0, done: false };
      if (q.weaponPick) {
        quest.weapon = owned[rng.int(0, owned.length - 1)];
        quest.title = t('Перемоги {n} зомбі з {w}', { n: q.target, w: WEAPON_NAMES[quest.weapon] || t('зброї') });
      } else {
        quest.title = q.title(q.target);
      }
      list.push(quest);
    }
    this.game.save.quests = { date: key, list, lang, maxKey: key > maxKey ? key : maxKey };
    this.game.saveGame();
  }

  get list() {
    return (this.game.save.quests && this.game.save.quests.list) || [];
  }

  get doneCount() { return this.list.filter((q) => q.done).length; }

  // подія з гри: просуваємо відповідні завдання
  onEvent(ev, data = {}) {
    this.ensureToday();
    let changed = false;
    for (const q of this.list) {
      if (q.done || q.ev !== ev) continue;
      if (q.weapon && data.weapon !== q.weapon) continue;
      q.progress += (data.n || 1);
      changed = true;
      if (q.progress >= q.target) {
        q.progress = q.target;
        q.done = true;
        this._reward(q);
      }
    }
    if (changed) this.game.saveGame();
  }

  _reward(q) {
    const game = this.game;
    game.save.coins += QUEST_REWARD_COINS;
    game.audio.questDone();
    game.hud.toast(t('📅 Завдання виконано: {i} {q}! +{c} монет, +40 ⭐', { i: q.icon, q: q.title, c: QUEST_REWARD_COINS }));
    game.progress.addXp(40);
  }
}
