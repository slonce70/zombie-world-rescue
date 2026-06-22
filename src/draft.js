// 🎲 Оверлей «Прокачка»: пауза + 3 картки, один тап. Патерн як у Shop.
import { t } from './i18n.js';
import { COMBOS } from './runbuild.js';

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
    this.offered = level.runBuild.offer(level.zombies.rng);
    this.el.classList.add('show');
    this.game.input.exitLock();
    this._render();
    this.game.audio.click();
  }

  pick(idx) {
    if (!this.isOpen) return;
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
    this.elGrid.innerHTML = this.offered.map((card, i) => `
      <button class="draft-card tag-${card.tag}" data-i="${i}">
        <div class="draft-icon">${card.icon}</div>
        <div class="draft-name">${t(card.name)}</div>
      </button>`).join('');
    this.elGrid.querySelectorAll('.draft-card').forEach((el) => {
      el.addEventListener('click', () => this.pick(Number(el.dataset.i)));
    });
  }
}
