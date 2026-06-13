// 🏆 Панель Ліги: топ-50 світу по режимах і країнах + твоє місце.
import { fetchTop } from '../net/league.js';
import { t } from '../i18n.js';
import { COUNTRIES, CAMPAIGN_ORDER } from '../countries.js';

export class LeagueUI {
  constructor(game) {
    this.game = game;
    this.mode = 'storm';
    this.country = 'UKR';
    document.getElementById('btn-league').addEventListener('click', () => {
      game.audio.click();
      // показуємо останню звільнену країну за замовчуванням
      const lib = CAMPAIGN_ORDER.filter((c) => game.save.liberated[c]);
      if (lib.length && !lib.includes(this.country)) this.country = lib[lib.length - 1];
      game._showOverlay('overlay-league');
      this.render();
    });
  }

  async render() {
    const root = document.getElementById('league-content');
    // перемикачі
    let html = '<div class="league-tabs">';
    for (const [mid, label] of [['storm', t('⛈️ Шторм')], ['arena', t('👑 Арена')]]) {
      html += `<button class="league-tab ${this.mode === mid ? 'on' : ''}" data-mode="${mid}">${label}</button>`;
    }
    html += '</div>';
    if (this.mode === 'storm') {
      html += '<div class="league-countries">';
      for (const id of CAMPAIGN_ORDER) {
        html += `<button class="league-cty ${this.country === id ? 'on' : ''}" data-cty="${id}">${COUNTRIES[id].flag}</button>`;
      }
      html += '</div>';
    }
    html += t('<div id="league-list" class="league-list"><div class="league-loading">📡 Завантажуємо рекорди світу…</div></div>');
    root.innerHTML = html;
    root.querySelectorAll('.league-tab').forEach((el) => {
      el.addEventListener('click', () => {
        this.mode = el.dataset.mode;
        this.game.audio.click();
        this.render();
      });
    });
    root.querySelectorAll('.league-cty').forEach((el) => {
      el.addEventListener('click', () => {
        this.country = el.dataset.cty;
        this.game.audio.click();
        this.render();
      });
    });

    const country = this.mode === 'arena' ? 'ALL' : this.country;
    const data = await fetchTop(this.game, this.mode, country);
    const list = document.getElementById('league-list');
    if (!list) return;
    if (!data) {
      list.innerHTML = t('<div class="league-loading">📡 Ліга недоступна — перевір інтернет і спробуй ще раз</div>');
      return;
    }
    const fmt = (s) => (this.mode === 'arena'
      ? `${Math.floor(s / 60000)}:${String(Math.floor((s % 60000) / 1000)).padStart(2, '0')}`
      : t('хвиля {s}', { s }));
    let rows = '';
    for (const e of data.top) {
      const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `${e.rank}.`;
      const team = e.team && e.team.length > 1 ? ` <span class="league-team">🤝 ${this._esc(e.team.join(', '))}</span>` : '';
      rows += `<div class="league-row ${e.me ? 'me' : ''}">
        <span class="lr-rank">${medal}</span>
        <span class="lr-nick">${this._esc(e.nick)}${team}</span>
        <span class="lr-score">${fmt(e.score)}</span>
      </div>`;
    }
    if (!rows) rows = t('<div class="league-loading">Поки порожньо — стань ПЕРШИМ у світі! 🚀</div>');
    if (data.me && !data.top.some((e) => e.me)) {
      rows += `<div class="league-row me gap"><span class="lr-rank">${data.me.rank}.</span>
        <span class="lr-nick">${t('Ти')}</span><span class="lr-score">${fmt(data.me.score)}</span></div>`;
    }
    list.innerHTML = rows;
  }

  _esc(str) {
    return String(str).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  }
}
