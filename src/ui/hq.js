// Штаб Рятівника: екран «Моя пригода» — мої цифри, печаті країн, бестіарій, ранг.
// Дзеркало renderWardrobe: будує innerHTML у #hq-content. Жодного 3D.
import { t } from '../i18n.js';

export class RescueHQ {
  constructor(game) { this.game = game; }

  render() {
    const root = document.getElementById('hq-content');
    if (!root) return;
    root.innerHTML = this._statsHtml(this.game.save);
  }

  _statsHtml(save) {
    const s = save.stats || {};
    const rows = [
      ['🧟', t('Зомбі переможено'), s.killed || 0],
      ['🎯', t('Влучань у голову'), s.headshots || 0],
      ['👑', t('Босів переможено'), s.bosses || 0],
      ['🌟', t('Золотих зомбі'), s.golden || 0],
      ['🦙', t('Мегабоксів відкрито'), s.megaboxes || 0],
      ['🔥', t('Найкраще комбо'), s.bestCombo || 0],
    ];
    let h = `<h3 class="hq-h">${t('🏅 Мої цифри')}</h3><div class="hq-stats">`;
    for (const [i, label, n] of rows) {
      h += `<div class="hq-stat"><span class="hq-stat-i">${i}</span><span class="hq-stat-l">${label}</span><span class="hq-stat-n">${n}</span></div>`;
    }
    h += '</div>';
    return h;
  }
}
