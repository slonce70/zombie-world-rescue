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
  // шлях продовжено до 40; метеорит лишається великим подарунком на 33
  31: { type: 'coins', n: 750, icon: '💰', name: t('750 монет') },
  32: { type: 'coins', n: 800, icon: '💰', name: t('800 монет') },
  33: { type: 'gadget', id: 'meteor', icon: '☄️', name: t('Гаджет «Метеорит»') },
  34: { type: 'coins', n: 900, icon: '💰', name: t('900 монет') },
  35: { type: 'crystals', n: 15, icon: '💎', name: t('15 кристалів') },
  36: { type: 'coins', n: 1000, icon: '💰', name: t('1000 монет') },
  37: { type: 'coins', n: 1100, icon: '💰', name: t('1100 монет') },
  38: { type: 'coins', n: 1200, icon: '💰', name: t('1200 монет') },
  39: { type: 'coins', n: 1300, icon: '💰', name: t('1300 монет') },
  40: { type: 'coins', n: 1500, icon: '💰', name: t('1500 монет') },
  // v236: шлях продовжено до 65 — фінал: титул «Зоряний гравець»
  41: { type: 'coins', n: 1500, icon: '💰', name: t('1500 монет') },
  42: { type: 'coins', n: 1600, icon: '💰', name: t('1600 монет') },
  43: { type: 'coins', n: 1700, icon: '💰', name: t('1700 монет') },
  44: { type: 'coins', n: 1800, icon: '💰', name: t('1800 монет') },
  45: { type: 'hyper', id: 'mine', icon: '⚡', name: t('Гіперзаряд міни') },
  46: { type: 'coins', n: 1900, icon: '💰', name: t('1900 монет') },
  47: { type: 'coins', n: 2000, icon: '💰', name: t('2000 монет') },
  48: { type: 'coins', n: 2100, icon: '💰', name: t('2100 монет') },
  49: { type: 'coins', n: 2200, icon: '💰', name: t('2200 монет') },
  50: { type: 'crystals', n: 25, icon: '💎', name: t('25 кристалів') },
  51: { type: 'coins', n: 2300, icon: '💰', name: t('2300 монет') },
  52: { type: 'coins', n: 2400, icon: '💰', name: t('2400 монет') },
  53: { type: 'coins', n: 2500, icon: '💰', name: t('2500 монет') },
  54: { type: 'coins', n: 2600, icon: '💰', name: t('2600 монет') },
  55: { type: 'crystals', n: 30, icon: '💎', name: t('30 кристалів') },
  56: { type: 'coins', n: 2700, icon: '💰', name: t('2700 монет') },
  57: { type: 'coins', n: 2800, icon: '💰', name: t('2800 монет') },
  58: { type: 'coins', n: 2900, icon: '💰', name: t('2900 монет') },
  59: { type: 'coins', n: 3000, icon: '💰', name: t('3000 монет') },
  60: { type: 'crystals', n: 35, icon: '💎', name: t('35 кристалів') },
  61: { type: 'coins', n: 3200, icon: '💰', name: t('3200 монет') },
  62: { type: 'coins', n: 3400, icon: '💰', name: t('3400 монет') },
  63: { type: 'coins', n: 3600, icon: '💰', name: t('3600 монет') },
  64: { type: 'coins', n: 3800, icon: '💰', name: t('3800 монет') },
  65: { type: 'title', id: 'star_player', icon: '🌟', name: t('Титул «Зоряний гравець»') },
};
export const PASS_MAX_LEVEL = 65;
export const MEGA_QUEST_MIN_LEVEL = 32;

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
    if (n <= 0 || this.game.level?.noProgress) return;
    const game = this.game;
    const prestigeBefore = this.prestigeStars; // ДО додавання XP (до зміни save.xp)
    const before = this.level;
    game.save.xp = (game.save.xp || 0) + n;
    const after = this.level;
    for (let lvl = before + 1; lvl <= after; lvl++) this._grantLevel(lvl);
    if (after > before) game.save.passLvl = Math.max(game.save.passLvl || 0, after);
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

  // 🎁 catch-up продовженого шляху (40→65): гравець, що ВЖЕ перескочив стелю по XP,
  // при boot отримує нагороди пропущених рівнів разом — тихо + один підсумковий банер.
  // save.passLvl = останній ВИДАНИЙ рівень; легасі-сейв без поля: до старої стелі 40 все видано.
  grantBacklog() {
    const g = this.game;
    if (g.save.passLvl == null) g.save.passLvl = Math.min(this.level, 40);
    const lvl = this.level;
    if (lvl <= g.save.passLvl) return;
    // catch-up ЛИШЕ для продовження 40→65: рівні ≤40 завжди видавав addXp,
    // а «xp виставлено напряму» (тести/імпорт) не має ретро-сипати старі нагороди
    const from = Math.max(g.save.passLvl + 1, 41);
    if (lvl < from) { g.save.passLvl = lvl; return; }
    for (let l = from; l <= lvl; l++) this._grantLevel(l, { silent: true });
    g.save.passLvl = lvl;
    if (g.hud) g.hud.banner(t('🎖️ ЗОРЯНИЙ ШЛЯХ ПРОДОВЖЕНО!'), t('Рівні {a}–{b}: нагороди видано 🎁', { a: from, b: lvl }), 5);
    g.saveGame();
  }

  _grantLevel(lvl, opts = {}) {
    const game = this.game;
    const r = PASS_REWARDS[lvl];
    if (!opts.silent) game.audio.levelUp();
    if (!r) {
      if (!opts.silent) game.hud.banner(t('🎖️ ЗІРКОВИЙ РІВЕНЬ {lvl}!', { lvl }), t('Так тримати!'));
      return;
    }
    let sub = t('Нагорода: {i} {n}', { i: r.icon, n: r.name });
    if (r.type === 'coins') {
      game.save.coins += r.n;
    } else if (r.type === 'crystals') {
      game.save.crystals = (game.save.crystals || 0) + r.n;
    } else if (r.type === 'gadget') {
      if (game.save.gadgetsOwned.includes(r.id)) {
        game.save.coins += 150;
        sub = t('Нагорода: гаджет уже є — тримай 💰 150 монет!');
      } else {
        game.save.gadgetsOwned.push(r.id);
        if (!game.save.activeGadget) game.save.activeGadget = r.id;
        sub += t(' — {k}!', { k: keyHint('кнопка 🦘', 'клавіша F') });
      }
    } else if (r.type === 'hyper') {
      if (!Array.isArray(game.save.gadgetHypers)) game.save.gadgetHypers = [];
      if (!game.save.gadgetHypers.includes(r.id)) game.save.gadgetHypers.push(r.id);
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
    } else if (r.type === 'title') {
      // титул також захищений предикатом у titles.js (xp ≥ поріг рівня) —
      // syncTitles відновить його при клауд-імпорті навіть без цього push
      if (!game.save.titles.includes(r.id)) game.save.titles.push(r.id);
      sub += t(' — одягни в Гардеробі 🎒');
    }
    if (!opts.silent) game.hud.banner(t('🎖️ ЗІРКОВИЙ РІВЕНЬ {lvl}!', { lvl }), sub, 4.2);
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
export const MEGA_QUEST_REFRESH_MS = 2 * 24 * 60 * 60 * 1000;
const MEGA_QUESTS = [
  {
    id: 'damage10000', icon: '⚡', ev: 'damage', target: 10000,
    title: () => t('МЕГА: нанеси {n} шкоди', { n: 10000 }),
    reward: {
      hypers: ['heal'],
      crystals: 10,
      xp: 250,
      label: () => t('⚡ Гіперзаряд Відновлення · 💎 10 · ⭐ 250 XP'),
    },
  },
  {
    id: 'heal1000', icon: '💚', ev: 'heal', target: 1000,
    title: () => t('МЕГА: віднови {n} HP', { n: 1000 }),
    reward: {
      coins: 500,
      xp: 300,
      label: () => t('🪙 500 монет · ⭐ 300 XP'),
    },
  },
  {
    id: 'kills500', icon: '🧟', ev: 'kill', target: 500,
    title: () => t('МЕГА: переможи {n} зомбі', { n: 500 }),
    reward: {
      hypers: ['shield'],
      crystals: 8,
      xp: 250,
      label: () => t('🛡️ Гіперзаряд Щита · 💎 8 · ⭐ 250 XP'),
    },
  },
  {
    id: 'headshots150', icon: '🎯', ev: 'headshot', target: 150,
    title: () => t('МЕГА: влучи в голову {n} разів', { n: 150 }),
    reward: {
      hypers: ['stunammo'],
      crystals: 10,
      xp: 300,
      label: () => t('💫 Гіперзаряд Оглушливих куль · 💎 10 · ⭐ 300 XP'),
    },
  },
  {
    id: 'bosses10', icon: '👑', ev: 'boss', target: 10,
    title: () => t('МЕГА: переможи {n} босів', { n: 10 }),
    reward: {
      hypers: ['turret'],
      crystals: 15,
      xp: 400,
      label: () => t('🤖 Гіперзаряд Турелі · 💎 15 · ⭐ 400 XP'),
    },
  },
  {
    id: 'megabox10', icon: '🎁', ev: 'megabox', target: 10,
    title: () => t('МЕГА: відкрий {n} мегабоксів', { n: 10 }),
    reward: {
      hypers: ['goldapple'],
      crystals: 12,
      xp: 350,
      label: () => t('🍏 Гіперзаряд Золотого яблука · 💎 12 · ⭐ 350 XP'),
    },
  },
  {
    id: 'countries8', icon: '🌍', ev: 'country', target: 8,
    title: () => t('МЕГА: звільни {n} країн', { n: 8 }),
    reward: {
      hypers: ['clone'],
      crystals: 20,
      xp: 500,
      label: () => t('👥 Гіперзаряд Клона · 💎 20 · ⭐ 500 XP'),
    },
  },
  {
    id: 'gadget30', icon: '🧰', ev: 'gadget', target: 30,
    title: () => t('МЕГА: використай гаджет {n} разів', { n: 30 }),
    reward: {
      crystals: 30,
      label: () => t('💎 30 кристалів'),
    },
  },
  {
    id: 'titles3', icon: '🏷️', ev: 'titles', target: 3,
    title: () => t('МЕГА: збери {n} титули', { n: 3 }),
    current: (save) => (save.titles || []).length,
    reward: {
      coins: 5000,
      label: () => t('🪙 5000 монет'),
    },
  },
  {
    id: 'radiationBoss5', icon: '☢️', ev: 'radiationBoss', bossId: 'radiation', target: 5,
    title: () => t('МЕГА: переможи Боса Радіації {n} разів', { n: 5 }),
    reward: {
      title: 'radiation_player',
      crystals: 3,
      label: () => t('☢️ Титул «Радіаційний гравець» · 💎 3'),
    },
  },
  {
    id: 'magnumDamage5000', icon: '🔫', ev: 'damage', weapon: 'magnum', target: 5000,
    title: () => t('МЕГА: нанеси {n} шкоди з магнума', { n: 5000 }),
    reward: {
      crystals: 5,
      xp: 1000,
      label: () => t('⭐ 1000 XP · 💎 5'),
    },
  },
  {
    id: 'shotgunKills100', icon: '💥', ev: 'kill', weapon: 'shotgun', target: 100,
    title: () => t('МЕГА: переможи {n} зомбі з дробовика', { n: 100 }),
    reward: {
      xp: 500,
      label: () => t('⭐ 500 XP'),
    },
  },
];
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
    // 🎯 нові завдання дня — тост лише коли це НЕ найперший старт (saved вже був)
    // і HUD готовий. Спрацює і при переході опівночі посеред сесії (ensureToday → onEvent).
    if (saved && this.game.hud) this.game.hud.toast(t('🎯 Нові завдання дня!'));
    this.game.saveGame();
  }

  get list() {
    return (this.game.save.quests && this.game.save.quests.list) || [];
  }

  ensureMegaQuests(now = Date.now()) {
    const save = this.game.save;
    if (!save.megaQuests || typeof save.megaQuests !== 'object' || Array.isArray(save.megaQuests)) save.megaQuests = {};
    let changed = false;
    const rewards = [];
    for (const def of MEGA_QUESTS) {
      let q = save.megaQuests[def.id];
      if (!q || typeof q !== 'object') {
        q = save.megaQuests[def.id] = { progress: 0, done: false };
        changed = true;
      }
      else {
        q.progress = Math.max(0, Math.min(def.target, q.progress | 0));
        q.done = !!q.done || (!def.current && q.progress >= def.target);
      }
      if (q.done && !(q.doneAt > 0)) { q.doneAt = now; changed = true; }
      if (q.done && now - q.doneAt >= MEGA_QUEST_REFRESH_MS) {
        q.progress = 0;
        q.done = false;
        q.doneAt = 0;
        // 🏷️ квест із похідним прогресом (рахує наявне в сейві, як титули, що ніколи не
        // зникають) після рефрешу мусить вимагати НОВОГО прогресу — інакше він закривався б
        // сам собою кожні дві доби. Відмічаємо поточне значення як базу відліку.
        if (def.current) q.base = Math.max(0, def.current(save) | 0);
        changed = true;
      }
      if (!def.current) continue;
      // base відсутній у старих сейвах — там нуль, тобто рахунок як і був до цієї відмітки
      const current = Math.max(0, Math.min(def.target, (def.current(save) | 0) - (q.base | 0)));
      if (current > q.progress) { q.progress = current; changed = true; }
      if (!q.done && q.progress >= def.target && this.megaUnlocked) {
        q.done = true;
        q.doneAt = now;
        changed = true;
        rewards.push(def);
      }
    }
    for (const def of rewards) this._rewardMega({ ...def, title: def.title(), rewardText: def.reward.label() });
    if (changed) this.game.saveGame();
  }

  get megaList() {
    this.ensureMegaQuests();
    return MEGA_QUESTS.map((def) => {
      const q = this.game.save.megaQuests[def.id];
      return {
        ...def,
        title: def.title(),
        rewardText: def.reward.label(),
        progress: q.progress,
        done: q.done,
      };
    });
  }

  get megaUnlocked() { return this.game.progress.level >= MEGA_QUEST_MIN_LEVEL; }

  get megaUnlockLevel() { return MEGA_QUEST_MIN_LEVEL; }

  get pendingCount() {
    return this.list.filter((q) => !q.done).length + (this.megaUnlocked ? this.megaList.filter((q) => !q.done).length : 0);
  }

  // подія з гри: просуваємо відповідні завдання
  onEvent(ev, data = {}) {
    if (this.game.level?.noProgress) return;
    this.ensureToday();
    this.ensureMegaQuests();
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
    if (this.megaUnlocked) {
      for (const q of this.megaList) {
        const state = this.game.save.megaQuests[q.id];
        if (state.done || q.ev !== ev) continue;
        if (q.bossId && data.bossId !== q.bossId) continue;
        if (q.weapon && data.weapon !== q.weapon) continue;
        state.progress += (data.n || 1);
        changed = true;
        if (state.progress >= q.target) {
          state.progress = q.target;
          state.done = true;
          state.doneAt = Date.now();
          this._rewardMega(q);
        }
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

  _rewardMega(q) {
    const game = this.game;
    const reward = q.reward || {};
    if (!Array.isArray(game.save.gadgetHypers)) game.save.gadgetHypers = [];
    for (const id of reward.hypers || []) {
      if (!game.save.gadgetHypers.includes(id)) game.save.gadgetHypers.push(id);
    }
    game.save.coins = (game.save.coins || 0) + (reward.coins || 0);
    game.save.crystals = (game.save.crystals || 0) + (reward.crystals || 0);
    if (reward.title && !game.save.titles.includes(reward.title)) game.save.titles.push(reward.title);
    game.audio.questDone();
    game.hud.toast(t('⚡ Мега-квест виконано: {q}! {r}', { q: q.title, r: q.rewardText }));
    game.hud.banner(t('⚡ МЕГА-КВЕСТ!'), q.rewardText, 4.4);
    game.progress.addXp(reward.xp || 0);
  }
}

// ---------- 🎁 Подарунок дня ----------
// Дитячий календар нагород: 4 тижні × 7 днів. БЕЗ покарань за пропуск — стрик просто
// не рухається, наступний claim продовжує з того ж місця. День 7 — фіксований бандл
// («подарункова коробка»), НІЯКОГО RNG — без FOMO/казино. Формат нагороди:
// {coins:N} | {crystals:N} | {coins:N, crystals:M}.
export const GIFT_TABLE = [
  // тиждень 1
  [{ coins: 100 }, { coins: 150 }, { crystals: 3 }, { coins: 250 }, { crystals: 5 }, { coins: 400 }, { coins: 300, crystals: 10 }],
  // тиждень 2
  [{ coins: 150 }, { coins: 200 }, { crystals: 4 }, { coins: 300 }, { crystals: 6 }, { coins: 500 }, { coins: 400, crystals: 12 }],
  // тиждень 3
  [{ coins: 200 }, { coins: 300 }, { crystals: 5 }, { coins: 400 }, { crystals: 8 }, { coins: 600 }, { coins: 500, crystals: 15 }],
  // тиждень 4+ (кап)
  [{ coins: 250 }, { coins: 350 }, { crystals: 6 }, { coins: 500 }, { crystals: 10 }, { coins: 700 }, { coins: 600, crystals: 20 }],
];

export class DailyGift {
  constructor(game) {
    this.game = game;
    // shape-fix існуючого сейва (БЕЗ будь-якої видачі)
    const s = game.save;
    if (!s.gift || typeof s.gift !== 'object' || Array.isArray(s.gift)) s.gift = { last: '', streak: 0, week: 1 };
    if (typeof s.gift.last !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.gift.last)) s.gift.last = '';
    if (typeof s.gift.streak !== 'number' || !isFinite(s.gift.streak) || s.gift.streak < 0) s.gift.streak = 0;
    s.gift.streak = Math.floor(s.gift.streak);
    if (typeof s.gift.week !== 'number' || !isFinite(s.gift.week) || s.gift.week < 1) s.gift.week = 1;
  }

  // локальний 'YYYY-MM-DD' — ТОЙ САМИЙ формат, що DailyQuests.todayKey (НЕ UTC/toISOString)
  dayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // чи є подарунок готовий до отримання (нова доба вперед). Лексикографіка = хронологія.
  pending(forceKey = null) {
    const key = forceKey || this.dayKey();
    // самолікування зіпсованого годинника: last більш ніж на 7 діб у майбутньому →
    // трактуємо сейв як биту дату, чистимо last (стрик не чіпаємо, наступний claim збереже)
    const last = this.game.save.gift.last;
    if (last && /^\d{4}-\d{2}-\d{2}$/.test(last)) {
      const days = (new Date(last + 'T00:00:00') - new Date(key + 'T00:00:00')) / 86400000;
      // NaN-safe: неможлива «валідна за regex» дата (2026-99-99) дає Invalid Date → NaN,
      // а лексикографічно key > last стало б true аж наступного року — теж лікуємо
      if (!(days <= 7)) this.game.save.gift.last = '';
    }
    return key > this.game.save.gift.last;
  }

  // { day: 1..7, week: 1..4, reward, streak } для модалки — рахуємо ДО інкремента
  dayInfo(forceKey = null) {
    const g = this.game.save.gift;
    const streak = g.streak | 0;
    const day = (streak % 7) + 1;
    const week = Math.min(4, Math.floor(streak / 7) + 1);
    const reward = GIFT_TABLE[week - 1][day - 1];
    return { day, week, reward, streak };
  }

  // видати подарунок дня. Якщо !pending → null. Стрик росте на 1 (заморозка: пропуск
  // просто не рухає стрик, наступний claim продовжує з того ж місця).
  claim(forceKey = null) {
    const key = forceKey || this.dayKey();
    if (!this.pending(key)) return null;
    const info = this.dayInfo(key);
    const r = info.reward;
    const game = this.game;
    game.save.coins += r.coins || 0;
    game.save.crystals = (game.save.crystals || 0) + (r.crystals || 0);
    game.save.gift = { last: key, streak: info.streak + 1, week: info.week };
    game.saveGame();
    return r;
  }
}
