// 🎲 «Прокачка» — внутрі-забігова прокачка. БЕЗ ІМПОРТІВ (чиста логіка, тестується в node).
// Назви — голі україномовні рядки-джерела; t() на них кличе UI-шар (draft.js).
// apply() мутує лише поля player (перестворюється на старті рівня) — save.json НЕ чіпаємо.
// Рідкість: common (сірі, часто) / rare (сині, рідше) / epic (золоті, рідко і потужно).

export const RARITY_WEIGHT = { common: 6, rare: 3, epic: 1 };

export const CARD_POOL = [
  // 💥 power
  { id: 'dmg25',   icon: '💥', tag: 'power', rarity: 'common', name: '+25% шкоди',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.25); } },
  { id: 'nades2',  icon: '💣', tag: 'power', rarity: 'common', name: '+2 гранати',
    apply: (p) => { p.grenades += 2; } },
  { id: 'dmgnade', icon: '🧨', tag: 'power', rarity: 'common', name: '+15% шкоди і +1 граната',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.15); p.grenades += 1; } },
  { id: 'dmg40',   icon: '🔥', tag: 'power', rarity: 'rare', name: '+40% шкоди',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.4); } },
  { id: 'nades4',  icon: '🎆', tag: 'power', rarity: 'rare', name: '+4 гранати',
    apply: (p) => { p.grenades += 4; } },
  { id: 'dmg60',   icon: '☄️', tag: 'power', rarity: 'epic', name: '+60% шкоди',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.6); } },
  { id: 'boombag', icon: '🎒', tag: 'power', rarity: 'common', name: '+20% шкоди і +3 гранати',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.2); p.grenades += 3; } },
  { id: 'nades6',  icon: '🧯', tag: 'power', rarity: 'rare', name: '+6 гранат',
    apply: (p) => { p.grenades += 6; } },
  { id: 'dmgvamp', icon: '🩸', tag: 'power', rarity: 'epic', name: '+30% шкоди і +1 HP за вбивство',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.3); p.lifeSteal = (p.lifeSteal || 0) + 1; } },
  // ⚡ speed
  { id: 'spd12',   icon: '⚡', tag: 'speed', rarity: 'common', name: '+12% швидкості',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.12); } },
  { id: 'spdheal', icon: '🏃', tag: 'speed', rarity: 'common', name: '+8% швидкості і +25 HP лікування',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.08); p.health = Math.min(p.maxHealth, p.health + 25); } },
  { id: 'spd18',   icon: '💨', tag: 'speed', rarity: 'rare', name: '+18% швидкості',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.18); } },
  { id: 'spdfull', icon: '🌀', tag: 'speed', rarity: 'rare', name: '+10% швидкості і повне лікування',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.10); p.health = p.maxHealth; } },
  { id: 'spd25',   icon: '🌪️', tag: 'speed', rarity: 'epic', name: '+25% швидкості і +15% шкоди',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.25); p.damageMult = Math.min(4, p.damageMult * 1.15); } },
  { id: 'spdjump', icon: '🦘', tag: 'speed', rarity: 'common', name: '+10% швидкості і вищий стрибок',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.10); p.jumpPower += 1.2; } },
  { id: 'jumphi',  icon: '🚀', tag: 'speed', rarity: 'rare', name: '+15% швидкості і супер-стрибок',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.15); p.jumpPower += 2.2; } },
  { id: 'spdvamp', icon: '🦇', tag: 'speed', rarity: 'epic', name: '+18% швидкості і +1 HP за вбивство',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.18); p.lifeSteal = (p.lifeSteal || 0) + 1; } },
  // 🛡️ tank
  { id: 'maxhp25', icon: '🛡️', tag: 'tank', rarity: 'common', name: '+25 макс. HP і лікування',
    apply: (p) => { p.maxHealth += 25; p.health = p.maxHealth; } },
  { id: 'armor',   icon: '🦺', tag: 'tank', rarity: 'common', name: '+20 макс. HP і повна броня',
    apply: (p) => { p.maxHealth += 20; p.health = Math.min(p.maxHealth, p.health + 20); p.armor = p.maxArmor; } },
  { id: 'maxhp40', icon: '⛑️', tag: 'tank', rarity: 'rare', name: '+40 макс. HP і лікування',
    apply: (p) => { p.maxHealth += 40; p.health = p.maxHealth; } },
  { id: 'vamp',    icon: '🧛', tag: 'tank', rarity: 'rare', name: '+1 HP за кожне вбивство',
    apply: (p) => { p.lifeSteal = (p.lifeSteal || 0) + 1; } },
  { id: 'maxhp60', icon: '🏰', tag: 'tank', rarity: 'epic', name: '+60 макс. HP, лікування і броня',
    apply: (p) => { p.maxHealth += 60; p.health = p.maxHealth; p.armor = p.maxArmor; } },
  { id: 'shield30', icon: '🪖', tag: 'tank', rarity: 'common', name: '+30 макс. HP і повна броня',
    apply: (p) => { p.maxHealth += 30; p.health = p.maxHealth; p.armor = p.maxArmor; } },
  { id: 'vamp2',   icon: '🧛‍♂️', tag: 'tank', rarity: 'rare', name: '+40 макс. HP і +2 HP за вбивство',
    apply: (p) => { p.maxHealth += 40; p.health = p.maxHealth; p.lifeSteal = (p.lifeSteal || 0) + 2; } },
  { id: 'fortress', icon: '🏯', tag: 'tank', rarity: 'epic', name: '+50 макс. HP, броня і +2 HP за вбивство',
    apply: (p) => { p.maxHealth += 50; p.health = p.maxHealth; p.armor = p.maxArmor; p.lifeSteal = (p.lifeSteal || 0) + 2; } },
];

// 3 однотегові картки → комбо: гучний банер + реальний бонус. Кап тримає run-only силу в межах.
// 'cross' — крос-теговий бонус: коли є ≥1 картка КОЖНОГО з 3 тегів (спрацьовує раз).
export const COMBOS = {
  power: { icon: '🔥', title: '🔥 СИЛАЧ! Шкода ще +50%',
    apply: (p) => { p.damageMult = Math.min(6, p.damageMult * 1.5); } },
  speed: { icon: '⚡', title: '⚡ БЛИСКАВКА! Ще +25% швидкості',
    apply: (p) => { p.speedMult = Math.min(2.2, p.speedMult * 1.25); } },
  tank:  { icon: '🛡️', title: '🛡️ ТАНК! +50 макс. HP',
    apply: (p) => { p.maxHealth += 50; p.health = p.maxHealth; } },
  cross: { icon: '🌈', title: '🌈 УНІВЕРСАЛ! +10% шкоди, швидкості й HP',
    apply: (p) => {
      p.damageMult = Math.min(6, p.damageMult * 1.1);
      p.speedMult = Math.min(2.2, p.speedMult * 1.1);
      p.maxHealth += Math.round(p.maxHealth * 0.1);
      p.health = p.maxHealth;
    } },
};

export class RunBuild {
  constructor() {
    this.tags = { power: 0, speed: 0, tank: 0 };
    this.picks = [];          // іконки обраних карток — для екрана фіналу
    this.ids = [];            // серіалізований build для багаторівневої Експедиції
    this.taken = new Set();   // id взятих — не пропонуємо повторно, поки колода не скінчиться
    this._combosFired = {};   // tag → true (комбо не повторюється)
  }

  // Застосувати картку до гравця. Повертає ключ комбо, якщо цей пік його добив
  // (і воно ще не спрацьовувало): tag ('power'/'speed'/'tank') для 3-х однотегових
  // АБО 'cross' для крос-тегового (≥1 картка кожного тега). Інакше null.
  // Однотегове комбо має пріоритет, якщо обидва добилися цим самим піком.
  apply(card, player) {
    if (!card) return null;
    card.apply(player);
    this.picks.push(card.icon);
    this.ids.push(card.id);
    this.taken.add(card.id);
    this.tags[card.tag] = (this.tags[card.tag] || 0) + 1;
    let fired = null;
    if (this.tags[card.tag] === 3 && !this._combosFired[card.tag] && COMBOS[card.tag]) {
      this._combosFired[card.tag] = true;
      COMBOS[card.tag].apply(player);
      fired = card.tag;
    }
    if (!this._combosFired.cross && this.tags.power > 0 && this.tags.speed > 0 && this.tags.tank > 0) {
      this._combosFired.cross = true;
      COMBOS.cross.apply(player);
      if (!fired) fired = 'cross';
    }
    return fired;
  }

  restore(ids, player) {
    for (const id of ids || []) {
      const card = CARD_POOL.find((item) => item.id === id);
      if (card) this.apply(card, player);
    }
    return this;
  }

  // 3–4 РІЗНІ картки: четверта доступна лише через видимий бонус Снабженця у Front.
  // Взяті картки не повторюються; коли колода майже пуста — «перетасовується» заново.
  offer(rng, count = 3) {
    const offerCount = Math.max(3, Math.min(4, Math.floor(Number(count) || 3)));
    let pool = CARD_POOL.filter((c) => !this.taken.has(c.id));
    if (pool.length < offerCount) {
      this.taken.clear();
      pool = CARD_POOL.slice();
    }
    const out = [];
    while (out.length < offerCount && pool.length) {
      let total = 0;
      for (const c of pool) total += RARITY_WEIGHT[c.rarity] || RARITY_WEIGHT.common;
      let roll = rng.int(0, total - 1);
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        roll -= RARITY_WEIGHT[pool[i].rarity] || RARITY_WEIGHT.common;
        if (roll < 0) { idx = i; break; }
      }
      out.push(pool.splice(idx, 1)[0]);
    }
    return out;
  }

  // короткий рядок збірки, напр. "💥💥⚡🛡️"
  summary() { return this.picks.join(''); }
}
