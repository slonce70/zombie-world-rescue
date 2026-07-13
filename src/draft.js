// 🎲 Оверлей «Прокачка»: пауза + 3 картки, один тап. Патерн як у Shop.
import { t } from './i18n.js';
import { CARD_POOL, COMBOS } from './runbuild.js';

export class Draft {
  constructor(game) {
    this.game = game;
    this.isOpen = false;
    this.offered = [];
    this.el = document.getElementById('draft');
    this.elGrid = document.getElementById('draft-grid');
  }

  open() {
    const level = this.game.level;
    if (!level || !level.runBuild || this.isOpen) return;
    this.isOpen = true;                       // → головний цикл blocked: сим завмирає
    const count = level.operationEffects && level.operationEffects.cardOfferCount;
    this.offered = level.runBuild.offer(level.zombies.rng, count);
    this.el.classList.add('show');
    this.game.input.exitLock();
    this._render();
    this.game.audio.click();
  }

  // 🌐 кооп: набір карток приходить від хоста (id з CARD_POOL). Гра НЕ завмирає
  // (draft.isOpen не входить у blocked коопу) — 15с на вибір, далі авто-пік
  // першої картки, щоб оверлей не висів у наступну хвилю.
  openNet(ids) {
    const level = this.game.level;
    if (!level || !level.runBuild || this.isOpen) return;
    this.offered = ids.map((id) => CARD_POOL.find((c) => c.id === id)).filter(Boolean);
    if (!this.offered.length) return;
    this.isOpen = true;
    this.el.classList.add('show');
    this.game.input.exitLock();
    this._render();
    this.game.audio.click();
    this._expire = setTimeout(() => this.pick(0), 15000);
  }

  // закрити без вибору (кінець рівня в коопі, поки оверлей ще висів)
  close() {
    if (this._expire) { clearTimeout(this._expire); this._expire = null; }
    this.isOpen = false;
    this.el.classList.remove('show');
  }

  pick(idx) {
    if (!this.isOpen) return;
    if (this._expire) { clearTimeout(this._expire); this._expire = null; }
    const level = this.game.level;
    const card = this.offered[idx];
    if (!card || !level) return;
    const combo = level.runBuild.apply(card, level.player);
    this.isOpen = false;
    this.el.classList.remove('show');
    this.game.audio.purchase();
    if (combo && COMBOS[combo]) {
      this.game.hud.banner(t(COMBOS[combo].title), t('Збірка {s}', { s: level.runBuild.summary() }), 3.5);
      this.game.audio.levelUp();
    }
    if (level && !this.game.paused) this.game.input.request();
  }

  _render() {
    const badge = (r) => r === 'epic' ? `<div class="draft-rarity">💫 ${t('ЕПІЧНА')}</div>`
      : r === 'rare' ? `<div class="draft-rarity">⭐ ${t('РІДКІСНА')}</div>` : '';
    this.elGrid.innerHTML = this.offered.map((card, i) => `
      <button class="draft-card tag-${card.tag} rarity-${card.rarity || 'common'}" data-i="${i}">
        ${badge(card.rarity)}
        <div class="draft-icon">${card.icon}</div>
        <div class="draft-name">${t(card.name)}</div>
      </button>`).join('');
    this.elGrid.querySelectorAll('.draft-card').forEach((el) => {
      el.addEventListener('click', () => this.pick(Number(el.dataset.i)));
    });
  }
}
