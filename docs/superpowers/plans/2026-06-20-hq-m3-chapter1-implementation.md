# M3 «Глава 1: Я рятівник» Implementation Plan

> Execute via `superpowers:subagent-driven-development`. Part of roadmap. Builds on M1/M2 (shipped v26/v27).

**Goal:** a soft, fixed onboarding chain that gently guides a newcomer through the core loop (enter country → kill zombies → do a mission → try a gadget → beat the boss), with a step-complete toast, a chapter-complete banner + medal, and a checklist section in the Штаб. No new HUD layout (toasts only), no network, no 3D.

**Architecture:** new `Chapter` class (`src/chapter.js`) with a fixed `CHAPTER1` of 5 steps keyed to events that already fire. `game.chapter.onEvent(ev)` is called from the SAME `src/main.js` bus handlers that drive stats/quests, plus a `startLevel` hook for `enterLevel` and a `gadgetUsed` bus handler. Progress in `save.chapter`; earned medal in `save.medals`. Штаб renders the checklist.

## Global Constraints (verbatim)
- Без бандлера; новий `src/chapter.js` → додати у `sw.js` SHELL. БЕЗ 3D.
- i18n: нові рядки через `t('…')` + en/ru (Task 3).
- Збереження священне: `save.chapter` і `save.medals` у `_newSave()` І валідація в `_loadSave()`.
- Нуль мережі. Без змін у HUD-розкладці (тільки тости/банер — наявні системи).
- Версія 3x: v27→v28 (version.json/APP_VERSION/sw.js CACHE).
- Скоуп: ЛИШЕ одна глава з 5 кроків; без глав 2-3, без рушія next-step-карток.

## File Structure
- Create `src/chapter.js` (`CHAPTER1`, `class Chapter`). Add to `sw.js` SHELL.
- Modify `src/main.js`: import + `this.chapter = new Chapter(this)`; `save.chapter`/`save.medals` in `_newSave`/`_loadSave`; hooks in bus handlers + `startLevel` + a `gadgetUsed` listener.
- Modify `src/ui/hq.js`: `_chapterHtml(save)` section.
- Modify `styles.css`, `src/i18n/en.js`, `ru.js`, `version.json`, `sw.js`, `README.md`.
- Test: `test/update-hq-m3.mjs`.

## Verification protocol (each task)
Server :8741. `node test/update-hq-m3.mjs` + `node test/smoke.mjs`. Controller does browser desktop+mobile at Task 3 if the preview env works; else headless+review is the floor.

---

## Task 1: `Chapter` system + save + hooks

**Files:** create `src/chapter.js`; modify `src/main.js`; test `test/update-hq-m3.mjs`.

**Interfaces produced:** `CHAPTER1`, `class Chapter` with `onEvent(ev, n=1)`, `stepDone(step)`, `allDone`, `state`; `save.chapter = { p:{}, done:false }`; `save.medals = []`.

- [ ] **Step 1: Create `src/chapter.js`:**
```js
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
```
- [ ] **Step 2: Failing test.** `test/update-hq-m3.mjs` (mirror update4 header). Drive the chapter via the test API or direct calls:
```js
console.log('▸ M3: Глава 1 «Я рятівник»');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
// fresh: chapter has no progress
let sv = await save();
check(sv.chapter && sv.chapter.done === false, 'нова глава: не пройдена');
// drive all steps via chapter.onEvent
await page.evaluate(() => {
  const ch = window.__game.chapter;
  ch.onEvent('enterLevel'); ch.onEvent('kill', 10); ch.onEvent('mission'); ch.onEvent('gadget'); ch.onEvent('boss');
});
sv = await save();
check(sv.chapter.done === true, 'усі 5 кроків → главу пройдено');
check(Array.isArray(sv.medals) && sv.medals.includes('rescuer'), 'видано медаль «rescuer»');
// persists
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
check((await save()).chapter.done === true, 'глава лишається пройденою після reload');
```
- [ ] **Step 3: RED.** `node test/update-hq-m3.mjs` → FAIL (`window.__game.chapter` undefined).
- [ ] **Step 4: Save fields.** In `_newSave()` add `chapter: { p: {}, done: false }, medals: [],`. In `_loadSave()` (after bestiary validation): 
```js
        if (!out.chapter || typeof out.chapter !== 'object') out.chapter = { p: {}, done: false };
        if (!out.chapter.p || typeof out.chapter.p !== 'object') out.chapter.p = {};
        if (!Array.isArray(out.medals)) out.medals = [];
```
- [ ] **Step 5: Instantiate + hooks in `src/main.js`.** Add `import { Chapter } from './chapter.js';` (near other imports). In the constructor where `this.hq = new RescueHQ(this)` is, add `this.chapter = new Chapter(this);`. In `startLevel(countryId, opts)` (~line 736), after the level is successfully built (e.g. right after `this.level = level;` ~1065, or at the end of startLevel success path) add: `if (this.chapter) this.chapter.onEvent('enterLevel');`. In the bus-handler block (~961-1005):
  - In the `zombieKilled` XP handler, after `this.quests.onEvent('kill', …)`: `this.chapter.onEvent('kill');` and in the boss branch (`z.type === 'boss' && !level.storm`): `this.chapter.onEvent('boss');`
  - In the `missionDone` handler: add `this.chapter.onEvent('mission');`
  - Add a new handler `level.bus.on('gadgetUsed', () => this.chapter.onEvent('gadget'));`
- [ ] **Step 6: GREEN.** `node test/update-hq-m3.mjs` → PASS. Then `node test/smoke.mjs`.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(hq): глава 1 «Я рятівник» — система глав + медаль + хуки подій"`

---

## Task 2: Штаб «Глава 1» checklist section

**Files:** `src/ui/hq.js`, `styles.css`, test `test/update-hq-m3.mjs`.

- [ ] **Step 1: Failing test.** Append:
```js
console.log('▸ M3: Глава у Штабі');
await page.evaluate(() => { window.__game.save.chapter = { p: { enterLevel:1, kill:3 }, done:false }; window.__game.hq.render(); });
let hq = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-chapter/.test(hq), 'Штаб показує секцію глави');
check(/Я рятівник|I'm a Rescuer|Я спасатель/.test(hq), 'є назва глави');
check((hq.match(/hq-step/g) || []).length === 5, 'рівно 5 кроків');
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: `_chapterHtml` in `src/ui/hq.js`.** Add `import { CHAPTER1 } from '../chapter.js';`. Add method:
```js
  _chapterHtml(save) {
    const ch = save.chapter || { p: {}, done: false };
    const p = ch.p || {};
    const doneAll = !!ch.done;
    let h = `<h3 class="hq-h">${t('📖 Глава 1: Я рятівник')} ${doneAll ? '🎖️' : ''}</h3><div class="hq-chapter">`;
    for (const st of CHAPTER1.steps) {
      const done = (p[st.id] || 0) >= st.target;
      const prog = st.target > 1 ? ` (${Math.min(p[st.id] || 0, st.target)}/${st.target})` : '';
      h += `<div class="hq-step ${done ? 'done' : ''}"><span class="hq-step-c">${done ? '✅' : '⬜'}</span><span class="hq-step-i">${st.icon}</span><span class="hq-step-t">${st.title}${prog}</span></div>`;
    }
    h += '</div>';
    if (doneAll) h += `<div class="hq-medal">${t('🎖️ {m} — отримано!', { m: CHAPTER1.medalName })}</div>`;
    return h;
  }
```
Append in `render()` (after `_adventureHtml`, before `_bestiaryHtml` — onboarding sits with adventure): `... + this._adventureHtml(save) + this._chapterHtml(save) + this._bestiaryHtml(save)`.
- [ ] **Step 4: CSS.**
```css
.hq-chapter { display:flex; flex-direction:column; gap:6px; }
.hq-step { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,.06); border-radius:10px; padding:7px 10px; }
.hq-step.done { background:rgba(111,224,111,.14); }
.hq-step-i { font-size:18px; }
.hq-step-t { font-size:13px; }
.hq-medal { margin-top:8px; font-weight:800; color:#f5c542; text-align:center; }
```
- [ ] **Step 5: GREEN.** `node test/update-hq-m3.mjs`.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(hq): секція «Глава 1» у Штабі"`

---

## Task 3: i18n + v28 + README + final

**Files:** `src/i18n/en.js`, `ru.js`, `version.json`, `src/main.js`, `sw.js` (CACHE + SHELL `./src/chapter.js`), `README.md`.

- [ ] **Step 1: i18n.** Grep new `t('` keys in `src/chapter.js` and `src/ui/hq.js` (chapter ones) and add en+ru entries to both dicts (placeholders `{s}{n}{m}` intact). Keys include: `Глава 1: Я рятівник`, `Медаль «Рятівник-початківець»`, `Вирушай рятувати країну`, `Переможи 10 зомбі`, `Виконай завдання`, `Спробуй гаджет (кнопка F)`, `Переможи боса країни`, `✅ {s}  Далі: {n}`, `✅ {s}`, `🎖️ ГЛАВУ ПРОЙДЕНО!`, `Ти отримав {m}!`, `📖 Глава 1: Я рятівник`, `🎖️ {m} — отримано!`.
- [ ] **Step 2: PWA + version.** `sw.js`: add `'./src/chapter.js',` to SHELL; CACHE `zr-cache-v27`→`v28`. `version.json`→28. `src/main.js` APP_VERSION→28.
- [ ] **Step 3: README.** `**v28 «Глава пригоди»**: …` note above v27.
- [ ] **Step 4: Gates.** `node test/version-check.mjs`, `node test/i18n.mjs`, `node test/update-hq-m3.mjs`, `node test/update-hq.mjs`, `node test/update-hq-m2.mjs`, `node test/smoke.mjs` — all green.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore(hq): i18n + бамп v28 + PWA SHELL + README (Глава пригоди)"`

---

## Self-Review
- Coverage: chapter system+save+hooks (T1), Штаб section (T2), i18n/version/PWA (T3).
- Save migration: `chapter`/`medals` validated; old save → defaults.
- Events verified to fire: enterLevel(startLevel hook), kill/boss(zombieKilled), mission(missionDone), gadget(gadgetUsed). All real.
- No network, no 3D, no HUD layout change (toasts/banner only).
