// Штаб Рятівника: екран «Моя пригода» — мої цифри, печаті країн, бестіарій, ранг.
// Дзеркало renderWardrobe: будує innerHTML у #hq-content. Жодного 3D.
import { t } from '../i18n.js';
import { COUNTRIES, CAMPAIGN_ORDER, isCountryOpen } from '../countries.js';
import { goalInfo } from '../shop.js';
import { CHAPTER1 } from '../chapter.js';

const BESTIARY = [
  { id: 'walker', icon: '🧟', name: t('Волоцюга'), desc: t('Повільний, зате їх багато!') },
  { id: 'runner', icon: '🏃', name: t('Бігун'), desc: t('Мчить на тебе — не лови ґав!') },
  { id: 'tank', icon: '🦣', name: t('Здоровань'), desc: t('Великий і живучий, б’є боляче.') },
  { id: 'shield', icon: '🛡', name: t('Щитоносець'), desc: t('Ховається за щитом — зайди ззаду!') },
  { id: 'ironclad', icon: '🦾', name: t('Броньовик'), desc: t('Залізний нагрудник, та голова вразлива.') },
  { id: 'gunner', icon: '🔫', name: t('Стрілець'), desc: t('Тримає дистанцію і стріляє.') },
  { id: 'snowman', icon: '⛄', name: t('Сніговик'), desc: t('Кидається сніжками!') },
  { id: 'spitter', icon: '🤮', name: t('Плювака'), desc: t('Плюється отрутою — ухиляйся.') },
  { id: 'mummy', icon: '🧻', name: t('Мумія'), desc: t('Повільна, але жилава і боляче хапає.') },
  { id: 'golden', icon: '🌟', name: t('Золотий зомбі'), desc: t('Тікає від тебе — дожени і отримай джекпот!') },
];

export class RescueHQ {
  constructor(game) { this.game = game; }

  render() {
    const root = document.getElementById('hq-content');
    if (!root) return;
    root.innerHTML = this._goalHtml(this.game.save) + this._statsHtml(this.game.save) + this._adventureHtml(this.game.save) + this._chapterHtml(this.game.save) + this._bestiaryHtml(this.game.save);
  }

  _goalHtml(save) {
    const gi = goalInfo(this.game);
    if (!gi) return `<h3 class="hq-h">${t('🎯 Моя ціль')}</h3><div class="hq-goal empty">${t('Обери ціль у магазині — тисни 🎯 на товарі, на який збираєш монети.')}</div>`;
    const line = gi.done
      ? t('Можна купити! 🎉')
      : t('Ще {r} монет', { r: gi.remaining });
    const desc = typeof gi.item.desc === 'function' ? gi.item.desc() : gi.item.desc;
    return `<h3 class="hq-h">${t('🎯 Моя ціль')}</h3><div class="hq-goal"><span class="hq-goal-i">${gi.item.icon}</span><div class="hq-goal-b"><div class="hq-goal-n">${gi.item.name}</div><div class="hq-goal-r">${line}</div><div class="hq-goal-d">${desc}</div></div></div>`;
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
    const stars = this.game.progress ? this.game.progress.prestigeStars : 0;
    h += `<div class="hq-prestige">${t('🎖️ Ранг Рятівника: {n} ⭐', { n: stars })}</div>`;
    return h;
  }

  _adventureHtml(save) {
    let h = `<h3 class="hq-h">${t('🗺️ Моя пригода')}</h3><div class="hq-countries">`;
    for (const id of CAMPAIGN_ORDER) {
      const c = COUNTRIES[id];
      if (!isCountryOpen(save.liberated, id)) { h += `<div class="hq-country locked">❓<div class="hq-c-name">???</div></div>`; continue; }
      const saved = !!(save.liberated && save.liberated[id]);
      const rec = save.records && save.records[id];
      const runs = (save.missionRuns && save.missionRuns[id]) || 0;
      const seals = [saved ? '✅' : '⬜', rec ? '⏱' : '⬜', runs > 0 ? `🔁${runs}` : '⬜'].join(' ');
      h += `<div class="hq-country ${saved ? 'saved' : ''}">${c.flag}<div class="hq-c-name">${c.name}</div><div class="hq-c-seals">${seals}</div></div>`;
    }
    h += '</div>';
    return h;
  }

  _chapterHtml(save) {
    const ch = save.chapter || { p: {}, done: false };
    const p = ch.p || {};
    const doneAll = !!ch.done;
    let h = `<h3 class="hq-h">${t('📖 Глава 1: Я рятівник')} ${doneAll ? '🎖️' : ''}</h3><div class="hq-chapter">`;
    for (const st of CHAPTER1.steps) {
      const done = (p[st.id] || 0) >= st.target;
      const prog = st.target > 1 ? ` (${Math.min(p[st.id] || 0, st.target)}/${st.target})` : '';
      h += `<div class="hq-step ${done ? 'done' : ''}"><span class="hq-st-c">${done ? '✅' : '⬜'}</span><span class="hq-st-i">${st.icon}</span><span class="hq-st-t">${st.title}${prog}</span></div>`;
    }
    h += '</div>';
    if (doneAll) h += `<div class="hq-medal">${t('🎖️ {m} — отримано!', { m: CHAPTER1.medalName })}</div>`;
    return h;
  }

  _bestiaryHtml(save) {
    const b = save.bestiary || {};
    const got = BESTIARY.filter((e) => (b[e.id] || 0) > 0).length;
    let h = `<h3 class="hq-h">${t('📖 Бестіарій {got}/{tot}', { got, tot: BESTIARY.length })}</h3><div class="hq-bestiary">`;
    for (const e of BESTIARY) {
      const n = b[e.id] || 0;
      if (n > 0) h += `<div class="hq-beast"><span class="hq-beast-i">${e.icon}</span><div class="hq-beast-name">${e.name}</div><div class="hq-beast-desc">${e.desc}</div><div class="hq-beast-n">${t('переможено {n}', { n })}</div></div>`;
      else h += `<div class="hq-beast locked"><span class="hq-beast-i">❓</span><div class="hq-beast-name">???</div></div>`;
    }
    h += '</div>';
    return h;
  }
}
