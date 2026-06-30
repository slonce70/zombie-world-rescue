// Глава пригоди: м'який онбординг-ланцюжок. Слухає ті самі події, що й quests/stats.
import { t } from './i18n.js';

export const CHAPTER1 = {
  id: 'rescuer',
  title: t('Глава 1: Я рятівник'),
  medalName: t('Медаль «Рятівник-початківець»'),
  steps: [
    { id: 'enterLevel', ev: 'enterLevel', target: 1, icon: '🌍', title: t('Вирушай рятувати країну') },
    { id: 'kill', ev: 'kill', target: 10, icon: '🧟', title: t('Переможи 10 зомбі') },
    { id: 'mission', ev: 'mission', target: 1, icon: '📋', title: t('Виконай завдання') },
    { id: 'gadget', ev: 'gadget', target: 1, icon: '🧰', title: t('Спробуй гаджет (кнопка F)') },
    { id: 'boss', ev: 'boss', target: 1, icon: '👑', title: t('Переможи боса країни') },
  ],
};

export const CHAPTER2_UNLOCK_COUNTRIES = 12;
export const CHAPTER2 = {
  id: 'infected',
  title: t('Глава 2: Заражені країни'),
  medalName: t('Медаль «Очищувач зараження»'),
  target: 3,
};

export class Chapter {
  constructor(game) { this.game = game; }
  get state() {
    let s = this.game.save.chapter;
    if (!s || typeof s !== 'object') { s = this.game.save.chapter = { p: {}, done: false }; }
    if (!s.p || typeof s.p !== 'object') s.p = {};
    return s;
  }
  stepDone(step) { return (this.state.p[step.id] || 0) >= step.target; }
  get allDone() { return CHAPTER1.steps.every((st) => this.stepDone(st)); }
  onEvent(ev, n = 1) {
    if (this.state.done) return;
    // 🎖️ F14: глава просувається ЛИШЕ в кампанії. У Шторм/Арені вбивства, вхід
    // у рівень тощо не зараховуються — інакше дитина «майже проходить» главу
    // поза кампанією (крок «бос» там не настає, тож вона ніколи б не завершилась чесно).
    const level = this.game.level;
    if (level && (level.storm || level.bossRush)) return;
    let changed = false;
    for (const st of CHAPTER1.steps) {
      if (st.ev !== ev || this.stepDone(st)) continue;
      this.state.p[st.id] = (this.state.p[st.id] || 0) + n;
      changed = true;
      if (this.stepDone(st)) this._stepComplete(st);
    }
    if (changed) {
      if (this.allDone && !this.state.done) this._chapterComplete();
      this.game.saveGame();
    }
  }
  _stepComplete(st) {
    if (this.allDone) return; // фінальний крок → банер, не тост
    const next = CHAPTER1.steps.find((s) => !this.stepDone(s));
    if (this.game.hud) this.game.hud.toast(next
      ? t('✅ {s}  Далі: {n}', { s: st.title, n: next.title })
      : t('✅ {s}', { s: st.title }));
  }
  _chapterComplete() {
    this.state.done = true;
    if (!Array.isArray(this.game.save.medals)) this.game.save.medals = [];
    if (!this.game.save.medals.includes(CHAPTER1.id)) this.game.save.medals.push(CHAPTER1.id);
    if (this.game.hud) this.game.hud.banner(t('🎖️ ГЛАВУ ПРОЙДЕНО!'), t('Ти отримав {m}!', { m: CHAPTER1.medalName }), 4.5);
    if (this.game.audio && this.game.audio.levelUp) this.game.audio.levelUp();
  }
}
