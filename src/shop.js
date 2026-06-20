// Магазин (клавіша B): вкладки категорій, зброя, гаджети, спорядження, прокачування
import { GADGETS } from './extras.js';
import { t, keyHint } from './i18n.js';

export const SHOP_ITEMS = [
  // --- припаси ---
  { id: 'medkit', icon: '🩹', name: t('Аптечка'), desc: t('+50 здоров’я зараз'), price: 50, max: Infinity, cat: t('Припаси') },
  { id: 'ammo', icon: '🔋', name: t('Патрони'), desc: t('Набої для всієї зброї'), price: 40, max: Infinity, cat: t('Припаси') },
  { id: 'grenade', icon: '💣', name: t('Граната'), desc: () => t('+1 граната ({k})', { k: keyHint('кнопка 💣', 'G — кинути') }), price: 35, max: Infinity, cat: t('Припаси') },
  { id: 'rocket', icon: '🧨', name: t('Ракета'), desc: t('+1 ракета для базуки'), price: 60, max: Infinity, cat: t('Припаси'), needsBazooka: true },
  { id: 'armorplate', icon: '🛡️', name: t('Бронепластина'), desc: t('+40 броні зараз'), price: 80, max: Infinity, cat: t('Припаси') },
  // --- гаджети: купуєш НАЗАВЖДИ, обираєш один у Гардеробі, клавіша F ---
  // desc — функції: GADGETS.*.desc можуть бути сенсор-залежними (читаємо у момент показу)
  { id: 'shield', icon: GADGETS.shield.icon, name: GADGETS.shield.name, desc: () => GADGETS.shield.desc + t(' · перезарядка {n}с', { n: GADGETS.shield.cd }), price: GADGETS.shield.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'heal', icon: GADGETS.heal.icon, name: GADGETS.heal.name, desc: () => GADGETS.heal.desc + t(' · перезарядка {n}с', { n: GADGETS.heal.cd }), price: GADGETS.heal.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'tramp', icon: GADGETS.tramp.icon, name: GADGETS.tramp.name, desc: () => GADGETS.tramp.desc + t(' · перезарядка {n}с', { n: GADGETS.tramp.cd }), price: GADGETS.tramp.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'wall', icon: GADGETS.wall.icon, name: GADGETS.wall.name, desc: () => GADGETS.wall.desc + t(' · перезарядка {n}с', { n: GADGETS.wall.cd }), price: GADGETS.wall.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'turret', icon: GADGETS.turret.icon, name: GADGETS.turret.name, desc: () => GADGETS.turret.desc + t(' · перезарядка {n}с', { n: GADGETS.turret.cd }), price: GADGETS.turret.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'dog', icon: '🐶', name: t('Песик Дружок'), desc: t('Збирає монети і гавкає на сюрпризи!'), price: 350, max: 1, cat: t('Гаджети й друзі') },
  // --- зброя ---
  { id: 'smg', icon: '🌀', name: t('Швидкостріл'), desc: () => t('Дуже швидка черга ({k})', { k: keyHint('кнопка 🔁', 'клавіша 4') }), price: 250, max: 1, cat: t('Зброя'), weapon: true },
  { id: 'magnum', icon: '🤠', name: t('Магнум'), desc: () => t('Могутній револьвер ({k})', { k: keyHint('кнопка 🔁', 'клавіша 5') }), price: 350, max: 1, cat: t('Зброя'), weapon: true },
  { id: 'sniper', icon: '🎯', name: t('Снайперка'), desc: () => t('Пробиває 3 зомбі наскрізь ({k})', { k: keyHint('кнопка 🔁', 'клавіша 6') }), price: 500, max: 1, cat: t('Зброя'), weapon: true },
  // --- спорядження (видно на герої — клавіша V!) ---
  { id: 'vest', icon: '🦺', name: t('Бронежилет'), desc: t('+50 броні щорівня, видно на герої'), price: 200, max: 2, cat: t('Спорядження') },
  { id: 'helmet', icon: '⛑️', name: t('Шолом'), desc: t('-15% будь-якої шкоди'), price: 250, max: 1, cat: t('Спорядження') },
  { id: 'sneakers', icon: '👟', name: t('Кросівки-ракети'), desc: t('Вищий стрибок і +трохи швидкості'), price: 220, max: 1, cat: t('Спорядження') },
  // --- прокачування ---
  { id: 'maxhp', icon: '❤️', name: t('Міцність'), desc: t('+25 макс. здоров’я'), price: 120, max: 4, cat: t('Прокачування') },
  { id: 'speed', icon: '⚡', name: t('Швидкість'), desc: t('+10% до швидкості'), price: 100, max: 3, cat: t('Прокачування') },
  { id: 'damage', icon: '💥', name: t('Шкода'), desc: t('+15% до шкоди'), price: 150, max: 3, cat: t('Прокачування') },
];

// Поточна «Моя ціль»: товар, на який гравець збирає монети (або null).
export function goalInfo(game) {
  const id = game.save && game.save.goal;
  if (!id) return null;
  const item = SHOP_ITEMS.find((i) => i.id === id);
  if (!item) return null;
  const need = item.price;
  const have = game.save.coins || 0;
  return { item, need, have, remaining: Math.max(0, need - have), done: have >= need };
}

export class Shop {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.el = document.getElementById('shop');
    this.elCoins = document.getElementById('shop-coins');
    this.elGrid = document.getElementById('shop-grid');
    document.getElementById('shop-close').addEventListener('click', () => this.close());
  }

  open() {
    if (!this.game.level) return;
    this.isOpen = true;
    this.el.classList.add('show');
    this.game.input.exitLock();
    this.render();
    this.game.audio.click();
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('show');
    this.game.audio.click();
    if (this.game.level && !this.game.paused) this.game.input.request();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  // ⛈️ у Штормі припаси дорожчають: +12% за кожну відбиту хвилю
  priceOf(item) {
    const level = this.game.level;
    if (level && level.storm && item.cat === t('Припаси')) {
      return Math.ceil(item.price * (1 + 0.12 * Math.max(0, level.storm.wave - 1)));
    }
    return item.price;
  }

  getCount(item) {
    if (item.weapon) return this.game.save.weapons.includes(item.id) ? 1 : 0;
    if (item.gadget) return this.game.save.gadgetsOwned.includes(item.id) ? 1 : 0;
    return this.game.save.upgrades[item.id] || 0;
  }

  render() {
    const save = this.game.save;
    this.elCoins.textContent = save.coins;
    const hasBazooka = save.weapons.includes('bazooka');
    // вкладки категорій
    const cats = [...new Set(SHOP_ITEMS.map((i) => i.cat))];
    if (!cats.includes(this.activeTab)) this.activeTab = cats[0];
    const tabsEl = document.getElementById('shop-tabs');
    tabsEl.innerHTML = cats.map((c) =>
      `<button class="shop-tab ${c === this.activeTab ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('');
    tabsEl.querySelectorAll('.shop-tab').forEach((el) => {
      el.addEventListener('click', () => {
        this.activeTab = el.dataset.cat;
        this.game.audio.click();
        this.render();
      });
    });
    let html = '';
    for (const item of SHOP_ITEMS) {
      if (item.cat !== this.activeTab) continue;
      const count = this.getCount(item);
      const maxed = count >= item.max;
      const locked = item.needsBazooka && !hasBazooka;
      const price = this.priceOf(item);
      const afford = save.coins >= price;
      const lvl = item.max !== Infinity && item.max > 1 ? ` <span class="shop-lvl">${count}/${item.max}</span>` : '';
      const surge = price > item.price ? ' <span class="shop-surge">📈</span>' : '';
      const priceLabel = locked ? '🔒' : maxed ? (item.weapon || item.gadget ? t('Є!') : t('МАКС')) : price + surge + ' <span class="coin-icon">₴</span>';
      const desc = locked ? t('Спершу знайди базуку в аеродропі! 🪂')
        : (typeof item.desc === 'function' ? item.desc() : item.desc);
      // ціль можна ставити лише на те, на що варто збирати: не консумабли, не куплене, не locked
      const goalOk = item.cat !== t('Припаси') && !maxed && !locked;
      const isGoal = save.goal === item.id;
      const goalBtn = goalOk ? `<button class="shop-goal-btn ${isGoal ? 'on' : ''}" data-goal="${item.id}" title="${t('Зробити ціллю')}">🎯</button>` : '';
      html += `
        <div class="shop-item ${maxed || locked ? 'maxed' : afford ? '' : 'poor'} ${isGoal ? 'goal' : ''}" data-id="${item.id}">
          ${goalBtn}
          <div class="shop-icon">${item.icon}</div>
          <div class="shop-name">${item.name}${lvl}</div>
          <div class="shop-desc">${desc}</div>
          <div class="shop-price">${priceLabel}</div>
        </div>`;
    }
    this.elGrid.innerHTML = html;
    this.elGrid.querySelectorAll('.shop-item').forEach((el) => {
      el.addEventListener('click', () => this.buy(el.dataset.id));
    });
    this.elGrid.querySelectorAll('.shop-goal-btn').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const gid = el.dataset.goal;
        this.game.save.goal = (this.game.save.goal === gid) ? null : gid;
        this.game.audio.click();
        this.game.saveGame();
        this.render();
      });
    });
    // шапка «Моя ціль»
    const gi = goalInfo(this.game);
    const goalEl = document.getElementById('shop-goal');
    if (goalEl) goalEl.textContent = gi
      ? (gi.done ? t('🎯 Ціль: {i} {n} — можна купити! 🎉', { i: gi.item.icon, n: gi.item.name })
                 : t('🎯 Ціль: {i} {n} — ще {r} ₴', { i: gi.item.icon, n: gi.item.name, r: gi.remaining }))
      : t('🎯 Обери ціль — тисни 🎯 на товарі');
  }

  buy(id) {
    const game = this.game;
    const save = game.save;
    const item = SHOP_ITEMS.find((i) => i.id === id);
    const player = game.level && game.level.player;
    if (!item || !player) return;
    const count = this.getCount(item);
    const price = this.priceOf(item);
    if (count >= item.max || save.coins < price
      || (item.needsBazooka && !save.weapons.includes('bazooka'))) {
      game.audio.denied();
      return;
    }
    // аптечка при повному HP — не продаємо
    if (id === 'medkit' && player.health >= player.maxHealth) {
      game.audio.denied();
      game.hud.toast(t('Здоров’я і так повне! 💪'));
      return;
    }
    // бронепластина при повній броні — теж ні
    if (id === 'armorplate' && player.armor >= player.maxArmor) {
      game.audio.denied();
      game.hud.toast(t('Броня вже повна! 🛡️'));
      return;
    }
    save.coins -= price;
    if (item.max !== Infinity && !item.weapon && !item.gadget) save.upgrades[id] = count + 1;
    switch (id) {
      case 'medkit': player.heal(50); break;
      case 'maxhp':
        player.maxHealth += 25;
        player.health += 25;
        break;
      case 'speed':
        player.speedMult = (1 + 0.1 * save.upgrades.speed) * (save.upgrades.sneakers ? 1.08 : 1);
        break;
      case 'damage': player.damageMult = 1 + 0.15 * save.upgrades.damage; break;
      case 'ammo': player.addAmmo(90); break;
      case 'grenade': player.grenades++; break;
      case 'rocket': player.addRockets(1); break;
      case 'armorplate': player.addArmor(40); break;
      case 'smg':
      case 'magnum':
      case 'sniper':
        game.unlockWeapon(id);
        game.hud.toast(t('{i} {n} тепер твій! Назавжди!', { i: item.icon, n: item.name }));
        break;
      case 'vest':
        player.applyGear(save.upgrades);
        player.armor = Math.min(player.maxArmor, player.armor + 50);
        game.hud.toast(t('🦺 Бронежилет одягнено! Подивись на себе — {k}', { k: keyHint('кнопка 📷', 'клавіша V') }));
        break;
      case 'helmet':
        player.applyGear(save.upgrades);
        game.hud.toast(t('⛑️ Шолом одягнено! Подивись на себе — {k}', { k: keyHint('кнопка 📷', 'клавіша V') }));
        break;
      case 'sneakers':
        player.applyGear(save.upgrades);
        player.speedMult = (1 + 0.1 * (save.upgrades.speed || 0)) * 1.08;
        game.hud.toast(t('👟 Кросівки-ракети! Стрибай вище — {k}', { k: keyHint('кнопка ⬆️', 'Space') }));
        break;
      case 'shield':
      case 'heal':
      case 'tramp':
      case 'wall':
      case 'turret':
        if (!save.gadgetsOwned.includes(id)) save.gadgetsOwned.push(id);
        if (!save.activeGadget) save.activeGadget = id;
        game.hud.toast(t('{i} {n} — твій назавжди! Клавіша F (обрати інший — Гардероб 🎒)', { i: item.icon, n: item.name }));
        break;
      case 'dog':
        game.spawnPet();
        game.hud.toast(t('🐶 Дружок тепер з тобою! Він збирає монети сам'));
        break;
    }
    game.audio.purchase();
    game.saveGame();
    // F42: ціль очищаємо лише коли товар РЕАЛЬНО вичерпано (getCount >= max), а не після
    // першої з кількох покупок багаторівневого апгрейда. Одноразові (max:1, зброя, гаджети)
    // одразу досягають max — поведінка для них незмінна.
    if (game.save.goal === id && this.getCount(item) >= item.max) {
      game.save.goal = null;
      game.hud.toast(t('🎯 Ціль досягнута! Обери нову в магазині'));
      game.saveGame();
    }
    this.render();
  }
}
