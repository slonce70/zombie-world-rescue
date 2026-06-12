// Прогресія акаунта: зірковий досвід (XP), «Зоряний шлях» (безкоштовний пасс),
// щоденні завдання. Все зберігається в сейві й живе ПОВЕРХ рівнів.
import { RNG } from './utils.js';

// ---------- Зоряний шлях ----------
// нагороди за рівні: монети, танці, скіни, гаджети, сліди куль
export const PASS_REWARDS = {
  2: { type: 'coins', n: 100, icon: '💰', name: '100 монет' },
  3: { type: 'dance', id: 'spin', icon: '🌪️', name: 'Танець «Дзиґа»' },
  4: { type: 'gadget', id: 'tramp', icon: '🦘', name: 'Гаджет «Кишеньковий батут»' },
  5: { type: 'skin', id: 'ninja', icon: '🥷', name: 'Скін «Ніндзя»' },
  6: { type: 'coins', n: 150, icon: '💰', name: '150 монет' },
  7: { type: 'tracer', id: 'gold', icon: '✨', name: 'Золоті кулі' },
  8: { type: 'gadget', id: 'wall', icon: '🧱', name: 'Гаджет «Барикада»' },
  9: { type: 'dance', id: 'robot', icon: '🤖', name: 'Танець «Робот»' },
  10: { type: 'skin', id: 'astro', icon: '👨‍🚀', name: 'Скін «Космонавт»' },
  11: { type: 'coins', n: 200, icon: '💰', name: '200 монет' },
  12: { type: 'coins', n: 200, icon: '💰', name: '200 монет' },
  13: { type: 'dance', id: 'wave', icon: '🌊', name: 'Танець «Хвиля»' },
  14: { type: 'skin', id: 'pirate', icon: '🏴‍☠️', name: 'Скін «Пірат»' },
  15: { type: 'coins', n: 250, icon: '💰', name: '250 монет' },
  16: { type: 'tracer', id: 'rainbow', icon: '🌈', name: 'Веселкові кулі' },
  17: { type: 'coins', n: 250, icon: '💰', name: '250 монет' },
  18: { type: 'coins', n: 300, icon: '💰', name: '300 монет' },
  19: { type: 'coins', n: 350, icon: '💰', name: '350 монет' },
  20: { type: 'skin', id: 'robot', icon: '🤖', name: 'Скін «Робот»' },
  // Оновлення 9: шлях продовжується до 30
  21: { type: 'coins', n: 400, icon: '💰', name: '400 монет' },
  22: { type: 'tracer', id: 'neon', icon: '🟢', name: 'Неонові кулі' },
  23: { type: 'coins', n: 450, icon: '💰', name: '450 монет' },
  24: { type: 'coins', n: 500, icon: '💰', name: '500 монет' },
  25: { type: 'skin', id: 'legend', icon: '🏆', name: 'Скін «Легенда»' },
  26: { type: 'coins', n: 550, icon: '💰', name: '550 монет' },
  27: { type: 'coins', n: 600, icon: '💰', name: '600 монет' },
  28: { type: 'coins', n: 650, icon: '💰', name: '650 монет' },
  29: { type: 'coins', n: 700, icon: '💰', name: '700 монет' },
  30: { type: 'tracer', id: 'royal', icon: '👑', name: 'Королівські кулі + слава' },
};
export const PASS_MAX_LEVEL = 30;

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

  addXp(n) {
    if (n <= 0) return;
    const game = this.game;
    const before = this.level;
    game.save.xp = (game.save.xp || 0) + n;
    const after = this.level;
    for (let lvl = before + 1; lvl <= after; lvl++) this._grantLevel(lvl);
    game.saveGame();
  }

  _grantLevel(lvl) {
    const game = this.game;
    const r = PASS_REWARDS[lvl];
    game.audio.levelUp();
    if (!r) {
      game.hud.banner(`🎖️ ЗІРКОВИЙ РІВЕНЬ ${lvl}!`, 'Так тримати!');
      return;
    }
    let sub = `Нагорода: ${r.icon} ${r.name}`;
    if (r.type === 'coins') {
      game.save.coins += r.n;
    } else if (r.type === 'gadget') {
      if (game.save.gadgetsOwned.includes(r.id)) {
        game.save.coins += 150;
        sub = 'Нагорода: гаджет уже є — тримай 💰 150 монет!';
      } else {
        game.save.gadgetsOwned.push(r.id);
        if (!game.save.activeGadget) game.save.activeGadget = r.id;
        sub += ' — клавіша F!';
      }
    } else if (r.type === 'skin') {
      if (!game.save.skins.includes(r.id)) game.save.skins.push(r.id);
      sub += ' — одягни в Гардеробі 🎒';
    } else if (r.type === 'dance') {
      if (!game.save.dances.includes(r.id)) game.save.dances.push(r.id);
      sub += ' — обери в Гардеробі 🎒';
    } else if (r.type === 'tracer') {
      if (!game.save.tracers.includes(r.id)) game.save.tracers.push(r.id);
      game.save.activeTracer = r.id;
      if (game.level) game.level.effects.tracerStyle = r.id;
    }
    game.hud.banner(`🎖️ ЗІРКОВИЙ РІВЕНЬ ${lvl}!`, sub, 4.2);
  }
}

// ---------- Щоденні завдання ----------
// Пул завдань. check-події надходять із гри через onEvent(type, data).
const QUEST_POOL = [
  { id: 'kills', icon: '🧟', target: 40, title: (t) => `Перемоги ${t} зомбі`, ev: 'kill' },
  { id: 'killsWeapon', icon: '🔫', target: 15, weaponPick: true, ev: 'kill' },
  { id: 'headshots', icon: '🎯', target: 12, title: (t) => `Влучи в голову ${t} разів`, ev: 'headshot' },
  { id: 'coins', icon: '💰', target: 250, title: (t) => `Назбирай ${t} монет`, ev: 'coins' },
  { id: 'pickups', icon: '🎁', target: 8, title: (t) => `Підбери ${t} знахідок`, ev: 'pickup' },
  { id: 'shields', icon: '🛡', target: 2, title: (t) => `Зламай ${t} щити щитоносців`, ev: 'shield' },
  { id: 'megabox', icon: '🦙', target: 1, title: () => 'Відкрий Мегабокс', ev: 'megabox' },
  { id: 'dance', icon: '💃', target: 1, title: () => 'Станцюй переможний танець (N)', ev: 'dance' },
  { id: 'golden', icon: '🏆', target: 1, title: () => 'Дожени золотого зомбі', ev: 'golden' },
  { id: 'boss', icon: '👑', target: 1, title: () => 'Переможи боса будь-якої країни', ev: 'boss' },
  { id: 'horde', icon: '🌊', target: 2, title: (t) => `Відбий ${t} орди`, ev: 'horde' },
];
const QUEST_REWARD_COINS = 120;
const WEAPON_NAMES = {
  pistol: 'пістолета', rifle: 'автомата', shotgun: 'дробовика',
  smg: 'швидкостріла', magnum: 'магнума', sniper: 'снайперки', bazooka: 'базуки',
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

  // генеруємо 3 завдання дня (детерміновано від дати) або підхоплюємо збережені
  ensureToday(forceKey = null) {
    const key = forceKey || this.todayKey();
    const saved = this.game.save.quests;
    if (saved && saved.date === key && Array.isArray(saved.list) && saved.list.length) return;
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
        quest.title = `Перемоги ${q.target} зомбі з ${WEAPON_NAMES[quest.weapon] || 'зброї'}`;
      } else {
        quest.title = q.title(q.target);
      }
      list.push(quest);
    }
    this.game.save.quests = { date: key, list };
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
    game.hud.toast(`📅 Завдання виконано: ${q.icon} ${q.title}! +${QUEST_REWARD_COINS} монет, +40 ⭐`);
    game.progress.addXp(40);
  }
}
