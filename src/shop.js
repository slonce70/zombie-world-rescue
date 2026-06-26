// Магазин (клавіша B): вкладки категорій, зброя, гаджети, спорядження, прокачування
import { GADGETS, TOWER_SKINS } from './extras.js';
import { HERO_SKINS, PETS } from './characters.js';
import { t, keyHint } from './i18n.js';

export const SHOP_ITEMS = [
  // --- припаси ---
  { id: 'grenade', icon: '💣', name: t('Граната'), desc: () => t('+1 граната ({k})', { k: keyHint('кнопка 💣', 'G — кинути') }), price: 35, max: Infinity, cat: t('Припаси') },
  { id: 'rocket', icon: '🧨', name: t('Ракета'), desc: t('+1 ракета для базуки'), price: 60, max: Infinity, cat: t('Припаси'), needsBazooka: true },
  { id: 'armorplate', icon: '🛡️', name: t('Бронепластина'), desc: t('+40 броні зараз'), price: 80, max: Infinity, cat: t('Припаси') },
  { id: 'coins500', icon: '💰', name: t('500 монет'), desc: t('Обмін кристалів на монети'), price: 0, crystalPrice: 10, coinBundle: 500, max: Infinity, cat: t('Ресурси') },
  { id: 'coins1000', icon: '💰', name: t('1000 монет'), desc: t('Обмін кристалів на монети'), price: 0, crystalPrice: 21, coinBundle: 1000, max: Infinity, cat: t('Ресурси') },
  { id: 'coins5100', icon: '💰', name: t('5100 монет'), desc: t('Обмін кристалів на монети'), price: 0, crystalPrice: 100, coinBundle: 5100, max: Infinity, cat: t('Ресурси') },
  { id: 'passxp25', icon: '⭐', name: t('25 XP'), desc: t('Досвід для Зоряного шляху'), price: 0, crystalPrice: 10, passXp: 25, max: Infinity, cat: t('Ресурси') },
  { id: 'starterpack', icon: '🎒', name: t('Стартовий набір'), desc: t('+2 гранати, +1 ракета для базуки, +30 патронів'), price: 500, crystalPrice: 10, max: Infinity, cat: t('Набори') },
  { id: 'propack', icon: '🏆', name: t('Профі набір'), desc: t('Золотий скін, +5 гранат, +3 ракети, +250 XP, +90 патронів'), price: 3500, crystalPrice: 35, max: Infinity, cat: t('Набори') },
  { id: 'militarypack', icon: '🪖', name: t('Військовий набір'), desc: t('Військовий скін, +5 гранат, +5 ракет, +120 патронів'), price: 1000, crystalPrice: 20, max: Infinity, cat: t('Набори') },
  // --- гаджети: купуєш НАЗАВЖДИ, обираєш один у Гардеробі, клавіша F ---
  // desc — функції: GADGETS.*.desc можуть бути сенсор-залежними (читаємо у момент показу)
  { id: 'shield', icon: GADGETS.shield.icon, name: GADGETS.shield.name, desc: () => GADGETS.shield.desc + t(' · перезарядка {n}с', { n: GADGETS.shield.cd }), price: GADGETS.shield.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'shield-hyper', icon: '⚡', name: t('Гіперзаряд: Щит'), desc: t('Постійне покращення щита: 100 HP'), price: 5000, max: 1, cat: t('Гіперзаряди'), hyper: 'shield', needsGadget: 'shield' },
  { id: 'heal', icon: GADGETS.heal.icon, name: GADGETS.heal.name, desc: () => GADGETS.heal.desc + t(' · перезарядка {n}с', { n: GADGETS.heal.cd }), price: GADGETS.heal.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'tramp', icon: GADGETS.tramp.icon, name: GADGETS.tramp.name, desc: () => GADGETS.tramp.desc + t(' · перезарядка {n}с', { n: GADGETS.tramp.cd }), price: GADGETS.tramp.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'wall', icon: GADGETS.wall.icon, name: GADGETS.wall.name, desc: () => GADGETS.wall.desc + t(' · перезарядка {n}с', { n: GADGETS.wall.cd }), price: GADGETS.wall.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'turret', icon: GADGETS.turret.icon, name: GADGETS.turret.name, desc: () => GADGETS.turret.desc + t(' · перезарядка {n}с', { n: GADGETS.turret.cd }), price: GADGETS.turret.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'turret-hyper', icon: '⚡', name: t('Гіперзаряд: Турель'), desc: t('Постійне покращення турелі: 100 HP і 25 шкоди за постріл'), price: 5000, max: 1, cat: t('Гіперзаряди'), hyper: 'turret', needsGadget: 'turret' },
  { id: 'clone', icon: GADGETS.clone.icon, name: GADGETS.clone.name, desc: () => GADGETS.clone.desc + t(' · перезарядка {n}с', { n: GADGETS.clone.cd }), price: GADGETS.clone.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'clone-hyper', icon: '⚡', name: t('Гіперзаряд: Клон'), desc: t('Постійне покращення: спавнить 2 клони'), price: 5000, max: 1, cat: t('Гіперзаряди'), hyper: 'clone', needsGadget: 'clone' },
  { id: 'healtotem', icon: GADGETS.healtotem.icon, name: GADGETS.healtotem.name, desc: () => GADGETS.healtotem.desc + t(' · перезарядка {n}с', { n: GADGETS.healtotem.cd }), price: 0, crystalPrice: 20, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'damagetotem', icon: GADGETS.damagetotem.icon, name: GADGETS.damagetotem.name, desc: () => GADGETS.damagetotem.desc + t(' · перезарядка {n}с', { n: GADGETS.damagetotem.cd }), price: 0, crystalPrice: 25, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'watchtower', icon: GADGETS.watchtower.icon, name: GADGETS.watchtower.name, desc: () => GADGETS.watchtower.desc + t(' · перезарядка {n}с', { n: GADGETS.watchtower.cd }), price: GADGETS.watchtower.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'xray', icon: GADGETS.xray.icon, name: GADGETS.xray.name, desc: () => GADGETS.xray.desc + t(' · перезарядка {n}с', { n: GADGETS.xray.cd }), price: GADGETS.xray.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'infammo', icon: GADGETS.infammo.icon, name: GADGETS.infammo.name, desc: () => GADGETS.infammo.desc + t(' · перезарядка {n}с', { n: GADGETS.infammo.cd }), price: GADGETS.infammo.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'invisibility', icon: GADGETS.invisibility.icon, name: GADGETS.invisibility.name, desc: () => GADGETS.invisibility.desc + t(' · перезарядка {n}с', { n: GADGETS.invisibility.cd }), price: 0, crystalPrice: 5, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'stunammo', icon: GADGETS.stunammo.icon, name: GADGETS.stunammo.name, desc: () => GADGETS.stunammo.desc + t(' · перезарядка {n}с', { n: GADGETS.stunammo.cd }), price: GADGETS.stunammo.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'stunammo-hyper', icon: '⚡', name: t('Гіперзаряд: Оглушливі кулі'), desc: t('Постійне покращення: зомбі оглушаються на 1 секунду'), price: 5000, max: 1, cat: t('Гіперзаряди'), hyper: 'stunammo', needsGadget: 'stunammo' },
  { id: 'teleport', icon: GADGETS.teleport.icon, name: GADGETS.teleport.name, desc: () => GADGETS.teleport.desc + t(' · перезарядка {n}с', { n: GADGETS.teleport.cd }), price: GADGETS.teleport.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'goldapple', icon: GADGETS.goldapple.icon, name: GADGETS.goldapple.name, desc: () => GADGETS.goldapple.desc + t(' · перезарядка {n}с', { n: GADGETS.goldapple.cd }), price: GADGETS.goldapple.price, max: 1, cat: t('Гаджети й друзі'), gadget: true },
  { id: 'goldapple-hyper', icon: '⚡', name: t('Гіперзаряд: Золоте яблуко'), desc: t('Постійне покращення яблука: +40 HP'), price: 5000, max: 1, cat: t('Гіперзаряди'), hyper: 'goldapple', needsGadget: 'goldapple' },
  { id: 'meteor-hyper', icon: '⚡', name: t('Гіперзаряд: Метеорит'), desc: t('Після падіння лишає вогонь: 5 HP кожні 0.5с'), price: 5000, max: 1, cat: t('Гіперзаряди'), hyper: 'meteor', needsGadget: 'meteor' },
  // ☄️ Метеорит НЕ продається — лише нагорода Зоряного шляху рівня 33 (PASS_REWARDS)
  // 🐾 улюбленці генеруються з реєстру PETS: собака 350 (стартовий), решта 1500
  ...Object.entries(PETS).map(([id, m]) => ({ id, icon: m.icon, name: m.name, desc: m.desc, price: id === 'dog' ? 350 : 1500, max: 1, cat: t('Гаджети й друзі'), pet: true })),
  // 🏅 золотий скін для гаджета-башти (камʼяний дається за Францію — не в магазині)
  { id: 'tower_gold', icon: TOWER_SKINS.gold.icon, name: TOWER_SKINS.gold.name, desc: t('Золотий скін для гаджета-башти'), price: 2344, max: 1, cat: t('Гаджети й друзі'), towerSkin: 'gold' },
  // --- зброя ---
  { id: 'smg', icon: '🌀', name: t('Швидкостріл'), desc: () => t('Дуже швидка черга ({k})', { k: keyHint('кнопка 🔁', 'клавіша 4') }), price: 2500, max: 1, cat: t('Зброя'), weapon: true },
  { id: 'magnum', icon: '🤠', name: t('Магнум'), desc: () => t('Могутній револьвер ({k})', { k: keyHint('кнопка 🔁', 'клавіша 5') }), price: 2500, max: 1, cat: t('Зброя'), weapon: true },
  { id: 'sniper', icon: '🎯', name: t('Снайперка'), desc: () => t('Пробиває 3 зомбі наскрізь ({k})', { k: keyHint('кнопка 🔁', 'клавіша 6') }), price: 2500, max: 1, cat: t('Зброя'), weapon: true },
  // 🔥 Вогнемет (рівень 25) і 🔫 Лазер (рівень 28) — нагороди за ЗІРКОВИЙ РІВЕНЬ, у магазині їх НЕМАЄ.
  // --- скіни героя ---
  { id: 'frogskin', icon: HERO_SKINS.frog.icon, name: HERO_SKINS.frog.name, desc: t('Скін героя за кристали'), price: 0, crystalPrice: 15, max: 1, cat: t('Скіни'), skin: 'frog' },
  { id: 'superskin', icon: HERO_SKINS.super.icon, name: HERO_SKINS.super.name, desc: t('Скін героя за кристали'), price: 0, crystalPrice: 15, max: 1, cat: t('Скіни'), skin: 'super' },
  { id: 'militaryskin', icon: HERO_SKINS.military.icon, name: HERO_SKINS.military.name, desc: t('Скін героя за кристали'), price: 0, crystalPrice: 15, max: 1, cat: t('Скіни'), skin: 'military' },
  { id: 'wizardskin', icon: HERO_SKINS.wizard.icon, name: HERO_SKINS.wizard.name, desc: t('Скін героя за кристали'), price: 0, crystalPrice: 25, max: 1, cat: t('Скіни'), skin: 'wizard' },
  { id: 'muscleskin', icon: HERO_SKINS.muscle.icon, name: HERO_SKINS.muscle.name, desc: t('Скін героя за кристали'), price: 0, crystalPrice: 20, max: 1, cat: t('Скіни'), skin: 'muscle' },
  { id: 'goldskin', icon: HERO_SKINS.gold.icon, name: HERO_SKINS.gold.name, desc: t('Золотий скін на героя'), price: 2500, max: 1, cat: t('Скіни'), skin: 'gold' },
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
  const need = item.crystalPrice || item.price;
  const have = item.crystalPrice ? (game.save.crystals || 0) : (game.save.coins || 0);
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
    if (this.game.level.storm || this.game.level.knockout) {
      this.isOpen = false;
      this.el.classList.remove('show');
      this.game.audio.denied();
      this.game.hud.toast(this.game.level.knockout ? t('У Нокауті магазину немає') : t('У Штормі магазину немає'));
      return;
    }
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

  priceOf(item) {
    return item.price;
  }

  getCount(item) {
    if (item.weapon) return this.game.save.weapons.includes(item.id) ? 1 : 0;
    if (item.gadget) return this.game.save.gadgetsOwned.includes(item.id) ? 1 : 0;
    if (item.hyper) return (this.game.save.gadgetHypers || []).includes(item.hyper) ? 1 : 0;
    if (item.skin) return this.game.save.skins.includes(item.skin) ? 1 : 0;
    if (item.pet) return this.game.save.pets.includes(item.id) ? 1 : 0;
    if (item.towerSkin) return (this.game.save.towerSkins || []).includes(item.towerSkin) ? 1 : 0;
    return this.game.save.upgrades[item.id] || 0;
  }

  render() {
    const save = this.game.save;
    this.elCoins.textContent = `${save.coins} · 💎 ${save.crystals || 0}`;
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
      const lockedGadget = item.needsGadget && !save.gadgetsOwned.includes(item.needsGadget);
      const price = this.priceOf(item);
      const afford = save.coins >= price && (!item.crystalPrice || (save.crystals || 0) >= item.crystalPrice);
      const lvl = item.max !== Infinity && item.max > 1 ? ` <span class="shop-lvl">${count}/${item.max}</span>` : '';
      const surge = price > item.price ? ' <span class="shop-surge">📈</span>' : '';
      const priceLabel = (locked || lockedGadget) ? '🔒' : maxed ? (item.weapon || item.gadget || item.skin ? t('Є!') : t('МАКС'))
        : item.crystalPrice && price ? `${price} <span class="coin-icon">₴</span> + ${item.crystalPrice} 💎`
        : item.crystalPrice ? `${item.crystalPrice} 💎` : price + surge + ' <span class="coin-icon">₴</span>';
      const desc = locked ? t('Спершу знайди базуку в аеродропі! 🪂')
        : lockedGadget ? t('Спершу купи базовий гаджет')
        : (typeof item.desc === 'function' ? item.desc() : item.desc);
      // ціль можна ставити лише на те, на що варто збирати: не консумабли, не куплене, не locked
      const goalOk = item.cat !== t('Припаси') && !(item.crystalPrice && price) && !maxed && !locked && !lockedGadget;
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
                 : t('🎯 Ціль: {i} {n} — ще {r} {u}', { i: gi.item.icon, n: gi.item.name, r: gi.remaining, u: gi.item.crystalPrice ? '💎' : '₴' }))
      : t('🎯 Обери ціль — тисни 🎯 на товарі');
  }

  buy(id) {
    const game = this.game;
    if (game.level && (game.level.storm || game.level.knockout)) {
      game.audio.denied();
      game.hud.toast(game.level.knockout ? t('У Нокауті магазину немає') : t('У Штормі магазину немає'));
      return;
    }
    const save = game.save;
    const item = SHOP_ITEMS.find((i) => i.id === id);
    const player = game.level && game.level.player;
    if (!item || !player) return;
    const count = this.getCount(item);
    const price = this.priceOf(item);
    if (count >= item.max || save.coins < price || (item.crystalPrice && (save.crystals || 0) < item.crystalPrice)
      || (item.needsBazooka && !save.weapons.includes('bazooka'))
      || (item.needsGadget && !save.gadgetsOwned.includes(item.needsGadget))) {
      game.audio.denied();
      return;
    }
    // бронепластина при повній броні — теж ні
    if (id === 'armorplate' && player.armor >= player.maxArmor) {
      game.audio.denied();
      game.hud.toast(t('Броня вже повна! 🛡️'));
      return;
    }
    if (item.crystalPrice) save.crystals -= item.crystalPrice;
    if (price) save.coins -= price;
    if (item.max !== Infinity && !item.weapon && !item.gadget && !item.pet && !item.towerSkin && !item.hyper && !item.skin) save.upgrades[id] = count + 1;
    if (item.skin) {
      if (!save.skins.includes(item.skin)) save.skins.push(item.skin);
      save.activeSkin = item.skin;
      game.hud.toast(t('{i} {n} — одягнено! Обрати інший — Гардероб 🎒', { i: item.icon, n: item.name }));
    }
    if (item.pet) {
      if (!save.pets.includes(id)) save.pets.push(id);
      save.activePet = id; // куплений улюбленець одразу стає активним і з'являється поряд
      game.spawnPet();
      game.hud.toast(t('{i} {n} — тепер з тобою! Обрати іншого — Гардероб 🎒', { i: item.icon, n: item.name }));
    }
    if (item.towerSkin) {
      if (!save.towerSkins) save.towerSkins = ['default'];
      if (!save.towerSkins.includes(item.towerSkin)) save.towerSkins.push(item.towerSkin);
      save.activeTowerSkin = item.towerSkin; // одразу активуємо куплений скін башти
      game.hud.toast(t('{i} {n} — обрано! Постав башту (гаджет) 🗼', { i: item.icon, n: item.name }));
    }
    if (item.hyper) {
      if (!Array.isArray(save.gadgetHypers)) save.gadgetHypers = [];
      if (!save.gadgetHypers.includes(item.hyper)) save.gadgetHypers.push(item.hyper);
      game.hud.toast(t('{i} {n} активовано назавжди!', { i: item.icon, n: item.name }));
    }
    switch (id) {
      case 'maxhp':
        player.maxHealth += 25;
        player.health += 25;
        break;
      case 'speed':
        player.speedMult = (1 + 0.1 * save.upgrades.speed) * (save.upgrades.sneakers ? 1.08 : 1);
        break;
      case 'damage': player.damageMult = 1 + 0.15 * save.upgrades.damage; break;
      case 'grenade': player.grenades++; break;
      case 'rocket': player.addRockets(1); break;
      case 'armorplate': player.addArmor(40); break;
      case 'starterpack':
        player.grenades += 2;
        player.addRockets(1);
        player.addAmmo(30);
        game.hud.toast(t('🎒 Стартовий набір: +2 гранати, +1 ракета, +30 патронів'));
        break;
      case 'propack':
        if (!save.skins.includes('gold')) save.skins.push('gold');
        save.activeSkin = 'gold';
        player.grenades += 5;
        player.addRockets(3);
        player.addAmmo(90);
        game.progress.addXp(250);
        game.hud.toast(t('🏆 Профі набір: золотий скін, +5 гранат, +3 ракети, +250 XP, +90 патронів'));
        break;
      case 'militarypack':
        if (!save.skins.includes('military')) save.skins.push('military');
        save.activeSkin = 'military';
        player.grenades += 5;
        player.addRockets(5);
        player.addAmmo(120);
        game.hud.toast(t('🪖 Військовий набір: військовий скін, +5 гранат, +5 ракет, +120 патронів'));
        break;
      case 'coins500':
      case 'coins1000':
      case 'coins5100':
        save.coins += item.coinBundle;
        game.hud.toast(t('💰 +{n} монет', { n: item.coinBundle }));
        break;
      case 'passxp25':
        game.progress.addXp(item.passXp);
        game.hud.toast(t('⭐ +{n} XP Зоряного шляху', { n: item.passXp }));
        break;
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
      case 'clone':
      case 'healtotem':
      case 'damagetotem':
      case 'watchtower':
      case 'xray':
      case 'infammo':
      case 'invisibility':
      case 'stunammo':
      case 'teleport':
      case 'goldapple':
        if (!save.gadgetsOwned.includes(id)) save.gadgetsOwned.push(id);
        if (!save.activeGadget) save.activeGadget = id;
        game.hud.toast(t('{i} {n} — твій назавжди! {k} (обрати інший — Гардероб 🎒)', { i: item.icon, n: item.name, k: keyHint('кнопка 🧰', 'Клавіша F') }));
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
