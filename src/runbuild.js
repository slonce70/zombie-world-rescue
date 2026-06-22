// 🎲 «Прокачка» — внутрі-забігова прокачка. БЕЗ ІМПОРТІВ (чиста логіка, тестується в node).
// Назви — голі україномовні рядки-джерела; t() на них кличе UI-шар (draft.js).
// apply() мутує лише поля player (перестворюється на старті рівня) — save.json НЕ чіпаємо.

export const CARD_POOL = [
  { id: 'dmg',    icon: '💥', tag: 'power', name: '+25% шкоди',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.25); } },
  { id: 'nades',  icon: '💣', tag: 'power', name: '+2 гранати',
    apply: (p) => { p.grenades += 2; } },
  { id: 'speed',  icon: '⚡', tag: 'speed', name: '+12% швидкості',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.12); } },
  { id: 'sprint', icon: '🏃', tag: 'speed', name: '+10% швидкості',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.10); } },
  { id: 'maxhp',  icon: '🛡️', tag: 'tank',  name: '+25 макс. HP і лікування',
    apply: (p) => { p.maxHealth += 25; p.health = p.maxHealth; } },
  { id: 'heal',   icon: '❤️', tag: 'tank',  name: 'Лікування вщент',
    apply: (p) => { p.health = p.maxHealth; } },
];

// 3 однотегові картки → комбо: гучний банер + реальний бонус. Кап тримає run-only силу в межах.
export const COMBOS = {
  power: { icon: '🔥', title: '🔥 СИЛАЧ! Шкода ще +50%',
    apply: (p) => { p.damageMult = Math.min(6, p.damageMult * 1.5); } },
  speed: { icon: '⚡', title: '⚡ БЛИСКАВКА! Ще +25% швидкості',
    apply: (p) => { p.speedMult = Math.min(2.2, p.speedMult * 1.25); } },
  tank:  { icon: '🛡️', title: '🛡️ ТАНК! +50 макс. HP',
    apply: (p) => { p.maxHealth += 50; p.health = p.maxHealth; } },
};

export class RunBuild {
  constructor() {
    this.tags = { power: 0, speed: 0, tank: 0 };
    this.picks = [];          // іконки обраних карток — для екрана фіналу
    this._combosFired = {};   // tag → true (комбо не повторюється)
  }

  // Застосувати картку до гравця. Повертає tag комбо, якщо цей пік добив 3-й
  // одного тега (і комбо ще не спрацьовувало), інакше null.
  apply(card, player) {
    card.apply(player);
    this.picks.push(card.icon);
    this.tags[card.tag] = (this.tags[card.tag] || 0) + 1;
    if (this.tags[card.tag] === 3 && !this._combosFired[card.tag] && COMBOS[card.tag]) {
      this._combosFired[card.tag] = true;
      COMBOS[card.tag].apply(player);
      return card.tag;
    }
    return null;
  }

  // 3 РІЗНІ картки з пулу (rng.int(a,b) включно — як у storm.js)
  offer(rng) {
    const pool = CARD_POOL.slice();
    const out = [];
    while (out.length < 3 && pool.length) {
      const i = rng.int(0, pool.length - 1);
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  // короткий рядок збірки, напр. "💥💥⚡🛡️"
  summary() { return this.picks.join(''); }
}
