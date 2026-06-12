// Магазин (клавіша B): вкладки категорій, зброя, гаджети, спорядження, прокачування
import { GADGETS } from './extras.js';

export const SHOP_ITEMS = [
  // --- припаси ---
  { id: 'medkit', icon: '🩹', name: 'Аптечка', desc: '+50 здоров’я зараз', price: 50, max: Infinity, cat: 'Припаси' },
  { id: 'ammo', icon: '🔋', name: 'Патрони', desc: 'Набої для всієї зброї', price: 40, max: Infinity, cat: 'Припаси' },
  { id: 'grenade', icon: '💣', name: 'Граната', desc: '+1 граната (G — кинути)', price: 35, max: Infinity, cat: 'Припаси' },
  { id: 'rocket', icon: '🧨', name: 'Ракета', desc: '+1 ракета для базуки', price: 60, max: Infinity, cat: 'Припаси', needsBazooka: true },
  { id: 'armorplate', icon: '🛡️', name: 'Бронепластина', desc: '+40 броні зараз', price: 80, max: Infinity, cat: 'Припаси' },
  // --- гаджети: купуєш НАЗАВЖДИ, обираєш один у Гардеробі, клавіша F ---
  { id: 'shield', icon: GADGETS.shield.icon, name: GADGETS.shield.name, desc: `${GADGETS.shield.desc} · перезарядка ${GADGETS.shield.cd}с`, price: GADGETS.shield.price, max: 1, cat: 'Гаджети й друзі', gadget: true },
  { id: 'heal', icon: GADGETS.heal.icon, name: GADGETS.heal.name, desc: `${GADGETS.heal.desc} · перезарядка ${GADGETS.heal.cd}с`, price: GADGETS.heal.price, max: 1, cat: 'Гаджети й друзі', gadget: true },
  { id: 'tramp', icon: GADGETS.tramp.icon, name: GADGETS.tramp.name, desc: `${GADGETS.tramp.desc} · перезарядка ${GADGETS.tramp.cd}с`, price: GADGETS.tramp.price, max: 1, cat: 'Гаджети й друзі', gadget: true },
  { id: 'wall', icon: GADGETS.wall.icon, name: GADGETS.wall.name, desc: `${GADGETS.wall.desc} · перезарядка ${GADGETS.wall.cd}с`, price: GADGETS.wall.price, max: 1, cat: 'Гаджети й друзі', gadget: true },
  { id: 'turret', icon: GADGETS.turret.icon, name: GADGETS.turret.name, desc: `${GADGETS.turret.desc} · перезарядка ${GADGETS.turret.cd}с`, price: GADGETS.turret.price, max: 1, cat: 'Гаджети й друзі', gadget: true },
  { id: 'dog', icon: '🐶', name: 'Песик Дружок', desc: 'Збирає монети і гавкає на сюрпризи!', price: 350, max: 1, cat: 'Гаджети й друзі' },
  // --- зброя ---
  { id: 'smg', icon: '🌀', name: 'Швидкостріл', desc: 'Дуже швидка черга (клавіша 4)', price: 250, max: 1, cat: 'Зброя', weapon: true },
  { id: 'magnum', icon: '🤠', name: 'Магнум', desc: 'Могутній револьвер (клавіша 5)', price: 350, max: 1, cat: 'Зброя', weapon: true },
  { id: 'sniper', icon: '🎯', name: 'Снайперка', desc: 'Пробиває 3 зомбі наскрізь (клавіша 6)', price: 500, max: 1, cat: 'Зброя', weapon: true },
  // --- спорядження (видно на герої — клавіша V!) ---
  { id: 'vest', icon: '🦺', name: 'Бронежилет', desc: '+50 броні щорівня, видно на герої', price: 200, max: 2, cat: 'Спорядження' },
  { id: 'helmet', icon: '⛑️', name: 'Шолом', desc: '-15% будь-якої шкоди', price: 250, max: 1, cat: 'Спорядження' },
  { id: 'sneakers', icon: '👟', name: 'Кросівки-ракети', desc: 'Вищий стрибок і +трохи швидкості', price: 220, max: 1, cat: 'Спорядження' },
  // --- прокачування ---
  { id: 'maxhp', icon: '❤️', name: 'Міцність', desc: '+25 макс. здоров’я', price: 120, max: 4, cat: 'Прокачування' },
  { id: 'speed', icon: '⚡', name: 'Швидкість', desc: '+10% до швидкості', price: 100, max: 3, cat: 'Прокачування' },
  { id: 'damage', icon: '💥', name: 'Шкода', desc: '+15% до шкоди', price: 150, max: 3, cat: 'Прокачування' },
];

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
    if (level && level.storm && item.cat === 'Припаси') {
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
      const priceLabel = locked ? '🔒' : maxed ? (item.weapon || item.gadget ? 'Є!' : 'МАКС') : price + surge + ' <span class="coin-icon">₴</span>';
      const desc = locked ? 'Спершу знайди базуку в аеродропі! 🪂' : item.desc;
      html += `
        <div class="shop-item ${maxed || locked ? 'maxed' : afford ? '' : 'poor'}" data-id="${item.id}">
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
      game.hud.toast('Здоров’я і так повне! 💪');
      return;
    }
    // бронепластина при повній броні — теж ні
    if (id === 'armorplate' && player.armor >= player.maxArmor) {
      game.audio.denied();
      game.hud.toast('Броня вже повна! 🛡️');
      return;
    }
    save.coins -= price;
    if (item.max !== Infinity && !item.weapon) save.upgrades[id] = count + 1;
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
        game.hud.toast(`${item.icon} ${item.name} тепер твій! Назавжди!`);
        break;
      case 'vest':
        player.applyGear(save.upgrades);
        player.armor = Math.min(player.maxArmor, player.armor + 50);
        game.hud.toast('🦺 Бронежилет одягнено! Подивись на себе — клавіша V');
        break;
      case 'helmet':
        player.applyGear(save.upgrades);
        game.hud.toast('⛑️ Шолом одягнено! Подивись на себе — клавіша V');
        break;
      case 'sneakers':
        player.applyGear(save.upgrades);
        player.speedMult = (1 + 0.1 * (save.upgrades.speed || 0)) * 1.08;
        game.hud.toast('👟 Кросівки-ракети! Стрибай вище — Space');
        break;
      case 'shield':
      case 'heal':
      case 'tramp':
      case 'wall':
      case 'turret':
        if (!save.gadgetsOwned.includes(id)) save.gadgetsOwned.push(id);
        if (!save.activeGadget) save.activeGadget = id;
        game.hud.toast(`${item.icon} ${item.name} — твій назавжди! Клавіша F (обрати інший — Гардероб 🎒)`);
        break;
      case 'dog':
        game.spawnPet();
        game.hud.toast('🐶 Дружок тепер з тобою! Він збирає монети сам');
        break;
    }
    game.audio.purchase();
    game.saveGame();
    this.render();
  }
}
