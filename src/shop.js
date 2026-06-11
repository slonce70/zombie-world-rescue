// Магазин (клавіша B): аптечка, прокачування, патрони
export const SHOP_ITEMS = [
  { id: 'medkit', icon: '🩹', name: 'Аптечка', desc: '+50 здоров’я зараз', price: 50, max: Infinity },
  { id: 'maxhp', icon: '❤️', name: 'Міцність', desc: '+25 макс. здоров’я', price: 120, max: 4 },
  { id: 'speed', icon: '⚡', name: 'Швидкість', desc: '+10% до швидкості', price: 100, max: 3 },
  { id: 'damage', icon: '💥', name: 'Шкода', desc: '+15% до шкоди', price: 150, max: 3 },
  { id: 'ammo', icon: '🔋', name: 'Патрони', desc: '+90 набоїв автомата і +12 дробовика', price: 40, max: Infinity },
  { id: 'grenade', icon: '💣', name: 'Граната', desc: '+1 граната (G — кинути)', price: 35, max: Infinity },
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

  getCount(id) {
    return this.game.save.upgrades[id] || 0;
  }

  render() {
    const save = this.game.save;
    this.elCoins.textContent = save.coins;
    let html = '';
    for (const item of SHOP_ITEMS) {
      const count = this.getCount(item.id);
      const maxed = count >= item.max;
      const afford = save.coins >= item.price;
      const lvl = item.max !== Infinity ? ` <span class="shop-lvl">${count}/${item.max}</span>` : '';
      html += `
        <div class="shop-item ${maxed ? 'maxed' : afford ? '' : 'poor'}" data-id="${item.id}">
          <div class="shop-icon">${item.icon}</div>
          <div class="shop-name">${item.name}${lvl}</div>
          <div class="shop-desc">${item.desc}</div>
          <div class="shop-price">${maxed ? 'МАКС' : item.price + ' <span class="coin-icon">₴</span>'}</div>
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
    const count = this.getCount(id);
    if (count >= item.max || save.coins < item.price) {
      game.audio.denied();
      return;
    }
    // аптечка при повному HP — не продаємо
    if (id === 'medkit' && player.health >= player.maxHealth) {
      game.audio.denied();
      game.hud.toast('Здоров’я і так повне! 💪');
      return;
    }
    save.coins -= item.price;
    if (item.max !== Infinity) save.upgrades[id] = count + 1;
    switch (id) {
      case 'medkit': player.heal(50); break;
      case 'maxhp':
        player.maxHealth += 25;
        player.health += 25;
        break;
      case 'speed': player.speedMult = 1 + 0.1 * save.upgrades.speed; break;
      case 'damage': player.damageMult = 1 + 0.15 * save.upgrades.damage; break;
      case 'ammo': player.addAmmo(90); break;
      case 'grenade': player.grenades++; break;
    }
    game.audio.purchase();
    game.saveGame();
    this.render();
  }
}
