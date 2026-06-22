# «Прокачка» Beat 1 — Implementation Plan (соло-Шторм: драфт + екран кінця забігу)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дати грі внутрі-забігову криву сили: у соло-Штормі на паузі після кожної відбитої хвилі гравець обирає 1 з 3 карток-апгрейдів, що діють ЛИШЕ цей забіг; забіг завжди завершується екраном зі зібраною «збіркою».

**Architecture:** Чиста логіка збірки живе у новому `src/runbuild.js` (БЕЗ імпортів → тестується в node без браузера). UI-оверлей і пауза — у новому `src/draft.js`, що повторює патерн `Shop` (DOM `#draft` + клас `.show` + `input.exitLock()`). Пауза вже є в грі: головний цикл морозить симуляцію, коли `blocked` — додаємо туди `draft.isOpen`. Тригер — у `storm.js` на моменті «хвилю відбито». Усі ефекти карток мутують поля `player`, які перестворюються на старті рівня, тож `save.json` НЕ чіпається (run-only автоматично). Кооп НЕ чіпаємо (тригер і `runBuild` — лише `!level.net`).

**Tech Stack:** Vanilla ES-modules (без бандлера), Three.js з `vendor/`, Playwright headless для e2e (`node test/<name>.mjs`, статик-сервер на `:8741`), браузерлесс node-тести для чистої логіки.

## Global Constraints

- **Без бандлера**: лише plain ES-modules з відносними імпортами; жодних нових залежностей.
- **Run-only, НЕ писати в save**: картки мутують лише `level.player.*` (перестворюється у `startLevel`); жодного запису в `this.save.*` чи `saveGame()`. Це інваріант — порушення = баг.
- **Тільки соло-Шторм у Beat 1**: тригер драфту і створення `runBuild` гейтуються `!level.net`. Кооп-драфт — окремий beat (host-authoritative), поза цим планом.
- **Протокол НЕ змінюється**: жодних змін у `src/net/protocol.js`; `PROTO_VERSION` лишається. (Beat 1 нічого не шле по мережі.)
- **i18n-паритет**: кожен новий україномовний рядок-джерело, що йде в `t()`, отримує запис у `src/i18n/en.js` І `src/i18n/ru.js` (інакше EN/RU-дитина бачить українську). `runbuild.js` тримає назви як ГОЛІ україномовні рядки; `t()` на них викликає лише UI-шар (`draft.js`).
- **Тач-first**: картки драфту — великі тап-кнопки; жодних клавіатурних підказок на сенсорі.
- **Версія при релізі**: наприкінці (Task 4) синхронно бампнути `version.json` (`v`), `APP_VERSION` (`src/main.js`), `sw.js` (`zr-cache-vNN`). НЕ бампати `PROTO_VERSION`. Гейт: `node test/version-sync.mjs`.
- **Запуск тестів**: статик-сервер `python3 -m http.server 8741` має жити для Playwright-тестів. Шторм у тестах стартуємо НЕ через URL, а викликом `window.__game.test.startStorm('UKR')` після виходу на глобус (`?storm` в URL не обробляється; патерн — `test/update4.mjs:324`).

---

## File Structure

- **Create `src/runbuild.js`** — чиста логіка: `CARD_POOL`, `COMBOS`, клас `RunBuild` (лічильник тегів, застосування картки до гравця, видача 3 карток, детект комбо). Без імпортів.
- **Create `src/draft.js`** — клас `Draft`: оверлей `#draft`, пауза, рендер 3 карток, обробка піку, банер комбо. Імпортує `t` з `i18n.js` і `COMBOS` з `runbuild.js`.
- **Create `test/runbuild.mjs`** — браузерлесс node-тест чистої логіки (як `version-sync.mjs`).
- **Create `test/draft.mjs`** — Playwright: оверлей паузить сим і застосовує картку.
- **Create `test/draft-storm.mjs`** — Playwright: відбита хвиля відкриває драфт; екран кінця показує збірку.
- **Modify `index.html`** — додати оверлей `#draft` (поряд із `#shop`, ~рядок 514).
- **Modify `styles.css`** — стилі `.draft-card` + кольори тегів.
- **Modify `src/main.js`** — імпорти; `this.draft = new Draft(this)` у конструкторі; `level.runBuild = new RunBuild()` у `startLevel` (соло-Шторм); `|| this.draft.isOpen` у `blocked` (рядок 2030); рядок «збірка» в `_endStormRun` (~1762).
- **Modify `src/storm.js`** — тригер `level.game.draft.open()` після «хвилю відбито» (~рядок 155).
- **Modify `src/i18n/en.js` + `src/i18n/ru.js`** — переклади назв карток/комбо.
- **Modify `version.json`, `src/main.js` (APP_VERSION), `sw.js`** — бамп версії (Task 4).

---

### Task 1: Чиста логіка `RunBuild` + пул карток (без UI, браузерлесс-тест)

**Files:**
- Create: `src/runbuild.js`
- Test: `test/runbuild.mjs`

**Interfaces:**
- Produces:
  - `CARD_POOL: Array<{ id:string, icon:string, tag:'power'|'speed'|'tank', name:string, apply:(player)=>void }>`
  - `COMBOS: Record<'power'|'speed'|'tank', { icon:string, title:string, apply:(player)=>void }>`
  - `class RunBuild { tags:{power:number,speed:number,tank:number}; picks:string[]; apply(card, player): 'power'|'speed'|'tank'|null; offer(rng): card[]; summary(): string }`
  - `player` тут — будь-який об'єкт із полями `damageMult, speedMult, maxHealth, health, grenades` (реальний `Player` їх має: `src/player.js:49,50,83`).
  - `rng` — об'єкт із `int(a,b)` (включно), як `level.zombies.rng` (`src/storm.js:218`).

- [ ] **Step 1: Написати падаючий тест**

Create `test/runbuild.mjs`:

```js
// Чиста логіка драфту «Прокачка» — БЕЗ браузера (як version-sync.mjs).
// runbuild.js не має імпортів, тож вантажиться у node напряму.
import { CARD_POOL, COMBOS, RunBuild } from '../src/runbuild.js';

let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const mkPlayer = () => ({ damageMult: 1, speedMult: 1, maxHealth: 100, health: 100, grenades: 2 });

// пул має ≥3 картки і покриває 3 теги
check(CARD_POOL.length >= 3, 'у пулі ≥3 карток', CARD_POOL.length);
check(['power', 'speed', 'tank'].every((tg) => CARD_POOL.some((c) => c.tag === tg)), 'усі 3 теги присутні');

// offer() дає рівно 3 РІЗНІ картки
const off = new RunBuild().offer({ int: () => 0 });
check(off.length === 3, 'драфт пропонує 3 картки', off.length);
check(new Set(off.map((c) => c.id)).size === 3, 'усі 3 — різні');

// power-картка піднімає шкоду; не пише в жоден save (сигнатура apply(card, player) — без save)
const p = mkPlayer();
const rb = new RunBuild();
const dmg = CARD_POOL.find((c) => c.tag === 'power' && /шкод/i.test(c.name)) || CARD_POOL.find((c) => c.tag === 'power');
check(rb.apply(dmg, p) === null, '1 картка — ще не комбо');
check(p.damageMult > 1, 'шкода зросла після картки', p.damageMult);

// 3 однотегові → комбо спрацьовує РІВНО на 3-й і дає доп.бонус
const p2 = mkPlayer();
const rb2 = new RunBuild();
rb2.apply(dmg, p2);
rb2.apply(dmg, p2);
const before = p2.damageMult;
const combo = rb2.apply(dmg, p2);
check(combo === 'power', '3-тя power-картка → комбо power', combo);
check(p2.damageMult > before * 1.25, 'комбо дало бонус понад звичайну картку', p2.damageMult);
check(rb2.apply(dmg, p2) === null, '4-та — комбо НЕ повторюється');

// summary() — непорожній рядок іконок зібраної збірки
check(typeof rb2.summary() === 'string' && rb2.summary().length > 0, 'summary() дає рядок збірки', rb2.summary());

console.log(fail === 0 ? '\n🎉 RUNBUILD OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `node test/runbuild.mjs`
Expected: FAIL — `Cannot find module '../src/runbuild.js'` (файл ще не створено).

- [ ] **Step 3: Створити мінімальну реалізацію**

Create `src/runbuild.js`:

```js
// 🎲 «Прокачка» — внутрі-забігова прокачка. БЕЗ ІМПОРТІВ (чиста логіка, тестується в node).
// Назви — голі україномовні рядки-джерела; t() на них кличе UI-шар (draft.js).
// apply() мутує лише поля player (перестворюється на старті рівня) — save.json НЕ чіпаємо.

export const CARD_POOL = [
  { id: 'dmg',    icon: '💥', tag: 'power', name: '+25% шкоди',
    apply: (p) => { p.damageMult = Math.min(4, p.damageMult * 1.25); } },
  { id: 'nades',  icon: '💣', tag: 'power', name: '+2 гранати',
    apply: (p) => { p.grenades += 2; } },
  { id: 'speed',  icon: '⚡', tag: 'speed', name: '+12% швидкості',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.12); } },
  { id: 'sprint', icon: '🏃', tag: 'speed', name: '+10% швидкості',
    apply: (p) => { p.speedMult = Math.min(1.8, p.speedMult * 1.10); } },
  { id: 'maxhp',  icon: '🛡️', tag: 'tank',  name: '+25 макс. HP і лікування',
    apply: (p) => { p.maxHealth += 25; p.health = p.maxHealth; } },
  { id: 'heal',   icon: '❤️', tag: 'tank',  name: 'Лікування вщент',
    apply: (p) => { p.health = p.maxHealth; } },
];

// 3 однотегові картки → комбо: гучний банер + реальний бонус. Кап тримає run-only силу в межах.
export const COMBOS = {
  power: { icon: '🔥', title: '🔥 СИЛАЧ! Шкода ще +50%',
    apply: (p) => { p.damageMult = Math.min(6, p.damageMult * 1.5); } },
  speed: { icon: '⚡', title: '⚡ БЛИСКАВКА! Ще +25% швидкості',
    apply: (p) => { p.speedMult = Math.min(2.2, p.speedMult * 1.25); } },
  tank:  { icon: '🛡️', title: '🛡️ ТАНК! +50 макс. HP',
    apply: (p) => { p.maxHealth += 50; p.health = p.maxHealth; } },
};

export class RunBuild {
  constructor() {
    this.tags = { power: 0, speed: 0, tank: 0 };
    this.picks = [];          // іконки обраних карток — для екрана фіналу
    this._combosFired = {};   // tag → true (комбо не повторюється)
  }

  // Застосувати картку до гравця. Повертає tag комбо, якщо цей пік добив 3-й
  // одного тега (і комбо ще не спрацьовувало), інакше null.
  apply(card, player) {
    card.apply(player);
    this.picks.push(card.icon);
    this.tags[card.tag] = (this.tags[card.tag] || 0) + 1;
    if (this.tags[card.tag] === 3 && !this._combosFired[card.tag] && COMBOS[card.tag]) {
      this._combosFired[card.tag] = true;
      COMBOS[card.tag].apply(player);
      return card.tag;
    }
    return null;
  }

  // 3 РІЗНІ картки з пулу (rng.int(a,b) включно — як у storm.js)
  offer(rng) {
    const pool = CARD_POOL.slice();
    const out = [];
    while (out.length < 3 && pool.length) {
      const i = rng.int(0, pool.length - 1);
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  // короткий рядок збірки, напр. "💥💥⚡🛡️"
  summary() { return this.picks.join(''); }
}
```

- [ ] **Step 4: Запустити — переконатися, що проходить**

Run: `node test/runbuild.mjs`
Expected: PASS — `🎉 RUNBUILD OK`, exit 0.

- [ ] **Step 5: Закомітити**

```bash
git add src/runbuild.js test/runbuild.mjs
git commit -m "feat(prokachka): чиста логіка RunBuild + пул карток (browserless-тест)"
```

---

### Task 2: Оверлей `#draft` + контролер паузи (без тригера Шторму)

**Files:**
- Modify: `index.html` (додати `#draft` біля `#shop`, ~рядок 514)
- Modify: `styles.css` (стилі карток)
- Create: `src/draft.js`
- Modify: `src/main.js` (імпорти, `this.draft`, `level.runBuild` у `startLevel`, `blocked`)
- Test: `test/draft.mjs`

**Interfaces:**
- Consumes: `RunBuild`, `COMBOS` (Task 1); `game.input.exitLock()/request()`, `game.audio.click()/purchase()/levelUp()`, `game.hud.banner(title, sub, dur)` (`src/hud.js:101`), `game.level.player`, `game.level.zombies.rng`, `game.paused`.
- Produces: `class Draft { isOpen:boolean; offered:card[]; open():void; pick(idx:number):void }` як `game.draft`.

- [ ] **Step 1: Додати оверлей у `index.html`**

Знайти `<div id="shop" class="overlay">` (рядок ~514). БЕЗПОСЕРЕДНЬО ПЕРЕД ним вставити:

```html
  <div id="draft" class="overlay">
    <div class="overlay-card draft-card-wrap">
      <h2>🎲 Прокачка — обери одну!</h2>
      <div id="draft-grid" class="draft-grid"></div>
    </div>
  </div>
```

- [ ] **Step 2: Додати стилі в `styles.css`**

У кінець `styles.css` додати:

```css
/* 🎲 Драфт «Прокачка» — великі тап-картки, кольори за тегом */
.draft-grid { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
.draft-card {
  width: 150px; min-height: 150px; padding: 16px 12px; border-radius: 18px;
  border: 3px solid rgba(255,255,255,.25); background: rgba(20,16,40,.85);
  color: #fff; font: inherit; cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; transition: transform .08s;
}
.draft-card:active { transform: scale(.94); }
.draft-card .draft-icon { font-size: 48px; line-height: 1; }
.draft-card .draft-name { font-size: 16px; font-weight: 700; text-align: center; }
.draft-card.tag-power { border-color: #ff5a4d; box-shadow: 0 0 18px rgba(255,90,77,.4); }
.draft-card.tag-speed { border-color: #ffd23d; box-shadow: 0 0 18px rgba(255,210,61,.4); }
.draft-card.tag-tank  { border-color: #4db8ff; box-shadow: 0 0 18px rgba(77,184,255,.4); }
```

- [ ] **Step 3: Написати падаючий тест**

Create `test/draft.mjs`:

```js
// Оверлей «Прокачка» паузить симуляцію і застосовує обрану картку (соло-Шторм).
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
// Шторм стартуємо явно (URL ?storm НЕ обробляється; патерн із test/update4.mjs:324)
await page.evaluate(() => window.__game.test.startStorm('UKR'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.storm, null, { timeout: 30000 });
await page.waitForTimeout(400);

// runBuild створено для соло-Шторму
const hasRb = await page.evaluate(() => !!window.__game.level.runBuild);
check(hasRb, 'runBuild створено в соло-Штормі');

// відкриваємо драфт напряму → оверлей показано, isOpen=true, 3 картки в DOM
const opened = await page.evaluate(() => {
  window.__game.draft.open();
  return {
    isOpen: window.__game.draft.isOpen,
    shown: document.getElementById('draft').classList.contains('show'),
    cards: document.querySelectorAll('#draft-grid .draft-card').length,
  };
});
check(opened.isOpen && opened.shown, 'драфт відкрито (isOpen + .show)', JSON.stringify(opened));
check(opened.cards === 3, 'у драфті рівно 3 картки', opened.cards);

// поки драфт відкрито — симуляція ЗАМЕРЗЛА (час рівня не тече за 2 кадри)
const frozen = await page.evaluate(async () => {
  const g = window.__game;
  const t0 = g.level.stats.time;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return g.level.stats.time === t0;
});
check(frozen, 'симуляція на паузі, поки драфт відкрито');

// тиснемо першу картку → стат гравця змінився, оверлей сховано, isOpen=false
const picked = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const snap = { dmg: p.damageMult, spd: p.speedMult, maxhp: p.maxHealth, nades: p.grenades, hp: p.health };
  g.level.player._snapBefore = snap;
  g.draft.pick(0);
  const changed = p.damageMult !== snap.dmg || p.speedMult !== snap.spd
    || p.maxHealth !== snap.maxhp || p.grenades !== snap.nades || p.health !== snap.hp;
  return { changed, isOpen: g.draft.isOpen, shown: document.getElementById('draft').classList.contains('show'), picks: g.level.runBuild.picks.length };
});
check(picked.changed, 'пік картки змінив стат гравця', JSON.stringify(picked));
check(!picked.isOpen && !picked.shown, 'після піку драфт закрито');
check(picked.picks === 1, 'runBuild зафіксував 1 пік', picked.picks);

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 DRAFT OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
```

- [ ] **Step 4: Запустити — переконатися, що падає**

Переконайся, що сервер живе: `python3 -m http.server 8741 &` (у теці проєкту).
Run: `node test/draft.mjs`
Expected: FAIL — `window.__game.draft` is undefined (контролер ще не створено).

- [ ] **Step 5: Створити контролер `src/draft.js`**

Create `src/draft.js`:

```js
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
```

- [ ] **Step 6: Підключити в `src/main.js`**

(a) Додати імпорти поряд з іншими (біля `import { Shop } ...`):

```js
import { Draft } from './draft.js';
import { RunBuild } from './runbuild.js';
```

(b) У конструкторі `Game`, ОДРАЗУ ПІСЛЯ рядка `this.shop = new Shop(this);`, додати:

```js
    this.draft = new Draft(this);
```

(c) У `startLevel`, ОДРАЗУ ПІСЛЯ блоку Шторму (рядки 1195-1196: `level.storm = new StormMode(level); level.missions = level.storm;`), додати:

```js
      // 🎲 «Прокачка» — внутрі-забігова прокачка лише в СОЛО-Штормі (кооп — окремий beat)
      if (!level.net) level.runBuild = new RunBuild();
```

(d) Знайти рядок 2030 (умова `blocked`) і додати `|| this.draft.isOpen` до соло-гілки:

```js
      const blocked = isCoop ? this.victoryShown : (this.paused || this.shop.isOpen || this.draft.isOpen || this.victoryShown);
```

- [ ] **Step 7: Запустити — переконатися, що проходить**

Run: `node test/draft.mjs`
Expected: PASS — `🎉 DRAFT OK`, exit 0.

- [ ] **Step 8: Закомітити**

```bash
git add index.html styles.css src/draft.js src/main.js test/draft.mjs
git commit -m "feat(prokachka): оверлей драфту + пауза (контролер Draft)"
```

---

### Task 3: Тригер Шторму + рядок «збірка» на екрані кінця забігу + i18n

**Files:**
- Modify: `src/storm.js` (тригер після «хвилю відбито», ~рядок 155)
- Modify: `src/main.js` (`_endStormRun` ~1762: рядок «Твоя збірка»)
- Modify: `src/i18n/en.js`, `src/i18n/ru.js` (переклади нових рядків)
- Test: `test/draft-storm.mjs`

**Interfaces:**
- Consumes: `level.game.draft.open()` (Task 2), `level.runBuild` (Task 2), `level.storm` (`src/storm.js`).
- Produces: нічого нового назовні; завершує фічу.

- [ ] **Step 1: Написати падаючий тест**

Create `test/draft-storm.mjs`:

```js
// Відбита хвиля Шторму відкриває драфт; екран кінця забігу показує зібрану збірку.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let fail = 0;
const check = (c, m, x = '') => { console.log((c ? '✅' : '❌') + ' ' + m, x); if (!c) fail++; };
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/?test&fresh&seed=1`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });
// Шторм стартуємо явно (URL ?storm НЕ обробляється; патерн із test/update4.mjs:324)
await page.evaluate(() => window.__game.test.startStorm('UKR'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level && window.__game.level.storm, null, { timeout: 30000 });
await page.waitForTimeout(400);

// очищаємо хвилю: вбиваємо всіх зомбі хвилі, потім жени сим напряму, доки драфт не відкриється
const draftOpened = await page.evaluate(async () => {
  const g = window.__game;
  for (const z of g.level.zombies.list) { if (z._stormWave) { z.state = 'dead'; z.hp = 0; } }
  // драйв симуляції напряму (RAF у headless майже стоїть): storm.update бачить alive===0 → драфт
  for (let i = 0; i < 30 && !g.draft.isOpen; i++) g.level.storm.update(0.1);
  return g.draft.isOpen;
});
check(draftOpened, 'відбита хвиля відкрила драфт');

// беремо картку
await page.evaluate(() => window.__game.draft.pick(0));
const afterPick = await page.evaluate(() => ({ open: window.__game.draft.isOpen, picks: window.__game.level.runBuild.picks.length }));
check(!afterPick.open && afterPick.picks === 1, 'картку взято, драфт закрито', JSON.stringify(afterPick));

// завершуємо забіг (смерть) → екран кінця показує рядок «Твоя збірка»
const ended = await page.evaluate(() => {
  const g = window.__game;
  g.level.player.health = 0;
  g.level.bus.emit('playerDied');
  return {
    shown: document.getElementById('overlay-storm-end').classList.contains('show'),
    hasBuild: document.getElementById('storm-stats').innerHTML.includes(g.level.runBuild.summary()),
  };
});
check(ended.shown, 'екран кінця Шторму показано');
check(ended.hasBuild, 'екран кінця показує зібрану збірку');

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 2).join(' | '));
console.log(fail === 0 ? '\n🎉 DRAFT-STORM OK' : `\n❌ ПРОВАЛЕНО: ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Запустити — переконатися, що падає**

Run: `node test/draft-storm.mjs`
Expected: FAIL на `відбита хвиля відкрила драфт` (тригера ще нема) і на `hasBuild` (рядок збірки ще не додано).

- [ ] **Step 3: Додати тригер у `src/storm.js`**

У методі `update`, у блоці «хвилю відбито», ОДРАЗУ ПІСЛЯ рядка `this._spawnWaveSoon = 6;` (рядок 155) додати:

```js
      // 🎲 «Прокачка»: пауза між хвилями — вибір 1 з 3 (лише соло-Шторм)
      if (!level.net && level.runBuild && level.game.draft) level.game.draft.open();
```

- [ ] **Step 4: Додати рядок «Твоя збірка» в `src/main.js` (`_endStormRun`)**

У методі `_endStormRun`, знайти присвоєння `document.getElementById('storm-stats').innerHTML = ...` (рядок 1762). БЕЗПОСЕРЕДНЬО ПЕРЕД ним додати:

```js
    const rb = level.runBuild;
    const buildRow = rb && rb.picks.length
      ? `<div class="stat"><span class="stat-icon">🎲</span><span class="stat-name">${t('Твоя збірка')}</span><span class="stat-val">${rb.summary()}</span></div>`
      : '';
```

Потім у самому шаблоні `innerHTML` додати `${buildRow}` ОДРАЗУ ПІСЛЯ рядка з `🧟` (зомбі переможено), перед рядком рекорду. Тобто блок стає:

```js
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      ${buildRow}
      <div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">${t('Рекорд')} (${this.level.country.name})</span><span class="stat-val">${t('хвиля')} ${best.wave}</span></div>`;
```

- [ ] **Step 5: Запустити — переконатися, що проходить**

Run: `node test/draft-storm.mjs`
Expected: PASS — `🎉 DRAFT-STORM OK`, exit 0.

- [ ] **Step 6: Додати переклади i18n (паритет en/ru)**

Це нові рядки-джерела, що йдуть у `t()`: назви карток (`runbuild.js`), заголовки комбо (`runbuild.js`), `'Збірка {s}'`, `'Твоя збірка'`.

У `src/i18n/en.js` додати (поряд з іншими записами):

```js
"+25% шкоди": "+25% damage",
"+2 гранати": "+2 grenades",
"+12% швидкості": "+12% speed",
"+10% швидкості": "+10% speed",
"+25 макс. HP і лікування": "+25 max HP and heal",
"Лікування вщент": "Full heal",
"🔥 СИЛАЧ! Шкода ще +50%": "🔥 BRUISER! +50% more damage",
"⚡ БЛИСКАВКА! Ще +25% швидкості": "⚡ LIGHTNING! +25% more speed",
"🛡️ ТАНК! +50 макс. HP": "🛡️ TANK! +50 max HP",
"Збірка {s}": "Build {s}",
"Твоя збірка": "Your build",
"🎲 Прокачка — обери одну!": "🎲 Power-up — pick one!",
```

У `src/i18n/ru.js` додати ті самі КЛЮЧІ з російськими значеннями:

```js
"+25% шкоди": "+25% урона",
"+2 гранати": "+2 гранаты",
"+12% швидкості": "+12% скорости",
"+10% швидкості": "+10% скорости",
"+25 макс. HP і лікування": "+25 макс. HP и лечение",
"Лікування вщент": "Полное лечение",
"🔥 СИЛАЧ! Шкода ще +50%": "🔥 СИЛАЧ! Урон ещё +50%",
"⚡ БЛИСКАВКА! Ще +25% швидкості": "⚡ МОЛНИЯ! Ещё +25% скорости",
"🛡️ ТАНК! +50 макс. HP": "🛡️ ТАНК! +50 макс. HP",
"Збірка {s}": "Сборка {s}",
"Твоя збірка": "Твоя сборка",
"🎲 Прокачка — обери одну!": "🎲 Прокачка — выбери одну!",
```

> ПАСТКА Edit-тула (з пам'яті проєкту): якщо `old_string` ловить escape-послідовності — прав через `python3` у Bash, не Edit.

Також у `index.html` заголовок `🎲 Прокачка — обери одну!` — статичний україномовний рядок; його перекладе `translateHtml` за тим самим ключем, який щойно додано в обидва словники. Окремих дій не треба.

- [ ] **Step 7: Прогнати i18n-гейт + повну батарею фічі**

```bash
node test/i18n.mjs
node test/runbuild.mjs && node test/draft.mjs && node test/draft-storm.mjs
```
Expected: усі PASS.

- [ ] **Step 8: Закомітити**

```bash
git add src/storm.js src/main.js src/i18n/en.js src/i18n/ru.js test/draft-storm.mjs
git commit -m "feat(prokachka): тригер драфту в Штормі + збірка на екрані кінця + i18n"
```

---

### Task 4: Реліз — бамп версії + регресія

**Files:**
- Modify: `version.json`, `src/main.js` (`APP_VERSION`), `sw.js` (`zr-cache-vNN`)

**Interfaces:** жодних — лише реліз-гігієна.

- [ ] **Step 1: Бамп версії (синхронно у 3 місцях)**

Поточна версія — `82` буде наступною (звір `version.json` → постав `+1`). Онови ОДНЕ значення в кожному файлі:
- `version.json`: `{ "v": 82 }`
- `src/main.js`: `APP_VERSION` → `82` (знайти `const APP_VERSION = ...` / `APP_VERSION =`)
- `sw.js`: рядок кешу → `zr-cache-v82`

НЕ чіпати `PROTO_VERSION` (мережа не змінилась).

- [ ] **Step 2: Гейт синхронізації версій**

Run: `node test/version-sync.mjs`
Expected: PASS — version.json ↔ APP_VERSION узгоджені.

- [ ] **Step 3: Блокуючий гейт + фіча-тести**

```bash
node test/version-sync.mjs && node test/smoke.mjs && node test/i18n.mjs && node test/save-migration.mjs
node test/runbuild.mjs && node test/draft.mjs && node test/draft-storm.mjs
```
Expected: усі PASS. (Сервер на :8741 має жити для Playwright-тестів.)

- [ ] **Step 4: Закомітити**

```bash
git add version.json src/main.js sw.js
git commit -m "🎲 v82 «Прокачка» — драфт 1-з-3 у соло-Штормі (beat 1)"
```

---

## Self-Review

**1. Покриття спеки (Beat 1 = соло-Шторм: драфт + екран кінця):**
- Драфт 1-з-3 на паузі → Task 2 (оверлей+пауза) + Task 3 (тригер Шторму). ✅
- Run-only, без запису save → інваріант у `runbuild.js.apply` (мутує лише player); `runBuild` живе на `level`, гине з рівнем; перевірено тестом `draft.mjs` (стат гравця змінено, save не торкаємось). ✅
- Синергія-теги + комбо-банер → `COMBOS` + `RunBuild.apply` (Task 1), банер у `Draft.pick` (Task 2), тест комбо в `runbuild.mjs`. ✅
- Екран кінця показує збірку (і на поразку — Шторм завжди завершується смертю) → Task 3 рядок «Твоя збірка», тест `draft-storm.mjs`. ✅
- Тільки соло (кооп deferred) → гейти `!level.net` у `startLevel` і `storm.js`. ✅
- i18n-паритет → Task 3 Step 6 (en+ru). ✅
- Версія при релізі → Task 4. ✅

**2. Скан заглушок:** немає «TBD/TODO/handle edge cases» — кожен крок має реальний код і точну команду з очікуваним результатом. ✅

**3. Узгодженість типів:** `RunBuild.apply(card, player) → tag|null`, `offer(rng) → card[]`, `summary() → string` — однаково вживані в Task 1 (тест), Task 2 (`Draft.pick/open`), Task 3 (`_endStormRun`, `draft-storm.mjs`). `card.name` — голий рядок усюди; `t(card.name)` лише в `Draft._render`. `COMBOS[tag].title` — голий рядок; `t()` у `Draft.pick`. ✅

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-22-prokachka-beat1.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — я диспатчу свіжого субагента на кожну задачу, рев'ю між задачами, швидка ітерація.

**2. Inline Execution** — виконую задачі в цій сесії через executing-plans, пакетне виконання з чекпойнтами.

**Який підхід?**
