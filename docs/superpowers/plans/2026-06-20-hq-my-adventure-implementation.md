# Штаб Рятівника — M1 «Моя пригода» Implementation Plan

> **Для агентів-виконавців:** ОБОВ'ЯЗКОВА ПІД-СКІЛ: `superpowers:subagent-driven-development` (рекомендовано) або `superpowers:executing-plans` — виконувати по одній задачі за раз із рев'ю між ними. Кроки позначені чекбоксами (`- [ ]`).
>
> **Це план ЛИШЕ для M1** з roadmap [2026-06-20-rescue-hq-roadmap.md](2026-06-20-rescue-hq-roadmap.md). M2–M7 свідомо відкладені й отримають власні плани, коли дійдемо. Кожна задача = самостійний відвантажуваний зріз із власною браузерною ШІ-перевіркою (десктоп + мобілка + скріни).

**Goal:** додати кнопку «🎖️ Штаб» на глобусі, що відкриває екран «Моя пригода»: мої цифри (lifetime-статистика), печаті країн, бестіарій ворогів і ранг Рятівника (престиж після 30 рівня) — закриваючи 3 діри (немає досягнень / мертвий XP після 30 / немає ендгейму) без жодної мережі та без 3D.

**Architecture:** новий оверлей `#overlay-hq` + новий модуль `src/ui/hq.js` (клас `RescueHQ`, рендерить `#hq-content`, дзеркало наявного `renderWardrobe`). Дані: нові поля сейва `save.stats` (числа) і `save.bestiary` (об'єкт-лічильник), що інкрементуються у ВЖЕ наявних bus-хендлерах ([src/main.js:961-999](../../../src/main.js)); престиж — чистий геттер у `Progress` поверх `PASS_MAX_LEVEL=30`. Печаті країн ВИВОДЯТЬСЯ з наявних `save.liberated/records/missionRuns` — нового стану майже нема.

**Tech Stack:** vanilla ES-модулі (БЕЗ бандлера), Three.js, PWA (`sw.js`), i18n uk/en/ru, headless-тести Playwright `node test/*.mjs`, браузерна ШІ-перевірка через MCP-браузер.

## Global Constraints (діють для КОЖНОЇ задачі — копіювати дослівно)

- **Без бандлера; новий `src/`-файл ОБОВ'ЯЗКОВО у `SHELL` у `sw.js`** (інакше офлайн/PWA ламається).
- **Ассети тільки кодом; БЕЗ 3D-рендеру в картки** (силует = окремий пайплайн, заборонено в M1). Іконки = емодзі/прапори/CSS.
- **i18n: ключ словника = український рядок.** Кожен видимий рядок через `t('…')`; додати в `src/i18n/en.js` і `src/i18n/ru.js`. EN/RU не бачать української.
- **Збереження прогресу священне.** Нові поля — у `_newSave()` ([src/main.js:323](../../../src/main.js)) І валідація форми в `_loadSave()` ([src/main.js:333](../../../src/main.js)); старий/зіпсований сейв НЕ кидає виняток.
- **Нуль мережі в M1.** Кооп не чіпаємо; у кінці підтвердити «нуль змін у коопі».
- **Версія у ТРЬОХ місцях:** `version.json`, `APP_VERSION` (`src/main.js:56`, 25→26), `CACHE` у `sw.js` (`zr-cache-v25`→`v26`). Гейт `node test/version-check.mjs`.
- **Дисципліна скоупу:** 5 малих зрізів, кожен показуємо окремо. Без 3D, без наліпок, без «Сьогодні»-рушія, без вкладки косметики.
- **УВАГА: паралельні сесії ШІ** — перед редагуванням звіряти файли заново, чужі зміни зливати.

---

## File Structure

- **Create** `src/ui/hq.js` — клас `RescueHQ(game)` з `render()`; рендерить три секції в `#hq-content`. Єдина відповідальність: UI Штабу.
- **Create** `test/update-hq.mjs` — Playwright-тест M1 (дзеркало `test/update4.mjs`).
- **Modify** `index.html` — кнопка `#btn-hq` (поряд із `#btn-wardrobe`, рядок 27) + оверлей `#overlay-hq` (поряд із `#overlay-wardrobe`, рядок 343).
- **Modify** `src/main.js` — `import { RescueHQ }`; `this.hq = new RescueHQ(this)`; дріт `#btn-hq`; поля сейва `stats`/`bestiary` в `_newSave`/`_loadSave`; інкременти в bus-хендлерах ([961-999](../../../src/main.js)).
- **Modify** `src/progress.js` — геттер `prestigeStars` + банер при новому порозі.
- **Modify** `styles.css` — компактні стилі `.hq-*`.
- **Modify** `src/i18n/en.js`, `src/i18n/ru.js` — переклади нових рядків.
- **Modify** `sw.js` — `src/ui/hq.js` у `SHELL`; `CACHE` → `v26`.
- **Modify** `version.json`, `README.md`.

---

## Verification protocol (виконувати наприкінці КОЖНОЇ задачі)

Сервер: `python3 -m http.server 8741` у теці гри.

1. **Headless:** `node test/update-hq.mjs` — нові перевірки зелені; `node test/smoke.mjs` — без регресій.
2. **Браузер ДЕСКТОП (скрін):** ШІ відкриває `http://localhost:8741`, проходить сценарій задачі, відкриває «Штаб», робить **скріншот**, підтверджує рендер/розкладку; виконує дію → `location.reload()` → стан вижив.
3. **Браузер МОБІЛКА (скріни):** `?touch` + портрет 390×844 і вузький ландшафт 664×390 — **скріншоти**; новий UI читабельний, НЕ налазить на ігрові кнопки/мінікарту/бос-бар, оверлей прокручується й закривається пальцем.
4. **i18n:** `?lang=en` і `?lang=ru` — на екрані Штабу НЕ видно української (скрін обох).
5. ⚠️ Слабкі ефекти (alpha < ~0.3) на зменшених скрінах не видно — для них порівнювати кадр з ефектом і без.

> Як ШІ відкриває гру у браузері: MCP-браузер (`Claude in Chrome` або `Claude Preview`) — `navigate` на URL, `resize` під мобільні вʼюпорти, `screenshot`. Якщо браузер-MCP недоступний — скіл `verify`/`run`.

---

## Task 1: Поля сейва `save.stats` + інкременти в bus-хендлерах

**Files:**
- Modify: `src/main.js` (`_newSave` ~323, `_loadSave` ~333, bus-хендлери 961-999)
- Test: `test/update-hq.mjs` (новий)

**Interfaces:**
- Produces: `save.stats = { killed, headshots, bosses, megaboxes, golden, bestCombo }` (усі `number`, дефолт 0). Інкрементуються у солo-грі при відповідних подіях.

- [ ] **Step 1: Написати тест, що падає.** Створити `test/update-hq.mjs` (шапка — копія `test/update4.mjs` рядки 1-31: `chromium`, `BASE`, `check`, `state`, `waitFor`, `loadCountry`). Додати:

```js
// ============ 🏅 M1: МОЇ ЦИФРИ (lifetime-статистика) ============
console.log('▸ Штаб: Мої цифри');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
let sv = await save();
check(sv.stats && sv.stats.killed === 0, `новий сейв: stats.killed = 0 (${sv.stats && sv.stats.killed})`);

// вбивство інкрементує killed
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  g.test.spawnZombie('walker', p.x + 5, p.z).damage(9999, null, false);
});
sv = await save();
check(sv.stats.killed === 1, `вбивство → stats.killed = 1 (${sv.stats.killed})`);

// золотий зомбі інкрементує golden
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  const z = g.test.spawnZombie('walker', p.x + 5, p.z); z.golden = true; z.damage(9999, null, false);
});
sv = await save();
check(sv.stats.golden >= 1, `золотий зомбі → stats.golden ≥ 1 (${sv.stats.golden})`);
check(sv.stats.killed === 2, `усього вбито 2 (${sv.stats.killed})`);

// збереження переживає reload
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
sv = await save();
check(sv.stats.killed >= 2, `stats переживає reload (${sv.stats.killed})`);
```

- [ ] **Step 2: Запустити — переконатись, що падає.**

Run: `python3 -m http.server 8741 &` потім `node test/update-hq.mjs`
Expected: FAIL — `сv.stats` undefined → `❌ новий сейв: stats.killed = 0 (undefined)`.

- [ ] **Step 3: Додати поля в `_newSave()`.** У `src/main.js` у return об'єкті `_newSave()` ([323](../../../src/main.js)) додати рядок:

```js
    stats: { killed: 0, headshots: 0, bosses: 0, megaboxes: 0, golden: 0, bestCombo: 0 },
```

- [ ] **Step 4: Валідація в `_loadSave()`.** У `src/main.js` всередині `if (s && typeof s === 'object') {` після рядка `out.stormBest = out.stormBest || {};` ([356](../../../src/main.js)) додати:

```js
        if (!out.stats || typeof out.stats !== 'object') out.stats = {};
        for (const k of ['killed', 'headshots', 'bosses', 'megaboxes', 'golden', 'bestCombo']) {
          if (typeof out.stats[k] !== 'number' || !isFinite(out.stats[k])) out.stats[k] = 0;
        }
```

- [ ] **Step 5: Інкременти у наявних bus-хендлерах.** У `src/main.js` у ПЕРШОМУ `zombieKilled`-хендлері ([969](../../../src/main.js)), одразу ПІСЛЯ гейта `if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;` додати:

```js
      this.save.stats.killed++;
      if (z.golden) this.save.stats.golden++;
```

У тому ж хендлері в гілці боса (рядок із `if (z.type === 'boss' && !level.storm) this.quests.onEvent('boss');`, [976](../../../src/main.js)) додати в той самий `if`:

```js
      if (z.type === 'boss' && !level.storm) { this.quests.onEvent('boss'); this.save.stats.bosses++; }
```

У `hitmarker`-хендлері ([979](../../../src/main.js)) розширити:

```js
    level.bus.on('hitmarker', (crit) => { if (crit) { this.quests.onEvent('headshot'); this.save.stats.headshots++; } });
```

У `megaboxOpened`-хендлері ([981](../../../src/main.js)) додати всередину:

```js
      this.save.stats.megaboxes++;
```

У ДРУГОМУ `zombieKilled`-хендлері (комбо, [987](../../../src/main.js)) після `if (c.n > c.best) c.best = c.n;` ([993](../../../src/main.js)) додати:

```js
      if (c.best > this.save.stats.bestCombo) this.save.stats.bestCombo = c.best;
```

> **Чому без зайвих `saveGame()`:** кожне вбивство викликає `this.progress.addXp(...)`, який наприкінці робить `saveGame()` (`progress.js`). Інкременти стоять у тому ж хендлері ДО/поряд із `addXp`, тож персистяться тим самим записом — нуль спаму localStorage. **Кооп-нота:** гейт на 971 відкидає чужі вбивства на хості → у M1 рахуємо ЛОКАЛЬНІ перемоги (чесно й достатньо; гостьові — окремий зріз через події `zd`).

- [ ] **Step 6: Запустити тест — проходить.**

Run: `node test/update-hq.mjs`
Expected: PASS — `✅ вбивство → stats.killed = 1`, `✅ золотий зомбі → stats.golden ≥ 1`, `✅ stats переживає reload`.

- [ ] **Step 7: Коміт.**

```bash
git add src/main.js test/update-hq.mjs
git commit -m "feat(hq): save.stats + інкременти lifetime-статистики у bus-хендлерах"
```

---

## Task 2: Кнопка «Штаб» + оверлей + секція «Мої цифри»

**Files:**
- Create: `src/ui/hq.js`
- Modify: `index.html` (кнопка + оверлей), `src/main.js` (import + instantiate + дріт), `styles.css`
- Test: `test/update-hq.mjs`

**Interfaces:**
- Consumes: `save.stats` (Task 1).
- Produces: `RescueHQ` з `render()`, що заповнює `#hq-content`; `game.hq`.

- [ ] **Step 1: Написати тест, що падає.** Додати в `test/update-hq.mjs`:

```js
// рендер Штабу показує цифри
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  g.test.spawnZombie('walker', p.x + 5, p.z).damage(9999, null, false);
  g.hq.render();
});
const hqHtml = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/Мої цифри|My Stats|Мои цифры/.test(hqHtml), 'Штаб рендерить секцію «Мої цифри»');
check(/hq-stat-n/.test(hqHtml), 'Штаб показує картки-цифри');
```

- [ ] **Step 2: Запустити — падає.** Run: `node test/update-hq.mjs`. Expected: FAIL — `g.hq` undefined.

- [ ] **Step 3: Створити `src/ui/hq.js`** (поки лише секція «Мої цифри»):

```js
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
```

- [ ] **Step 4: Кнопка + оверлей у `index.html`.** Після кнопки `#btn-wardrobe` (рядок 27) додати:

```html
      <button id="btn-hq" class="btn globe-act">🎖️ Штаб</button>
```

Після блоку `#overlay-wardrobe` (закриває рядок 351) додати:

```html
  <!-- Штаб Рятівника: Моя пригода -->
  <div id="overlay-hq" class="overlay">
    <div class="overlay-card panel-card wide">
      <div class="panel-header">
        <h2>🎖️ ШТАБ РЯТІВНИКА</h2>
        <button class="btn-x panel-close" data-close="overlay-hq">✕</button>
      </div>
      <div id="hq-content"></div>
    </div>
  </div>
```

> Кнопка-закриття працює сама: загальний хендлер `.panel-close[data-close]` ([main.js:210](../../../src/main.js)).

- [ ] **Step 5: Підключити в `src/main.js`.** Додати імпорт поряд з іншими `./ui/`-імпортами (грепни `from './ui/`):

```js
import { RescueHQ } from './ui/hq.js';
```

У конструкторі App, поряд із іншими UI-сінглтонами (грепни `new Shop(` / `new Wardrobe`-патерн або де створюється `this.shop`), додати:

```js
    this.hq = new RescueHQ(this);
```

Дріт кнопки — після хендлера `#btn-wardrobe` ([main.js:226-228](../../../src/main.js)):

```js
    document.getElementById('btn-hq').addEventListener('click', () => {
      this.audio.click();
      this.hq.render();
      this._showOverlay('overlay-hq');
    });
```

- [ ] **Step 6: Стилі в `styles.css`.** Додати компактний блок:

```css
.hq-h { margin: 14px 0 6px; font-size: 18px; }
.hq-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.hq-stat { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.08); border-radius: 12px; padding: 8px 10px; }
.hq-stat-i { font-size: 22px; }
.hq-stat-l { flex: 1; font-size: 13px; opacity: .85; }
.hq-stat-n { font-weight: 800; font-size: 18px; }
```

- [ ] **Step 7: Запустити тест — проходить.** Run: `node test/update-hq.mjs`. Expected: PASS — `✅ Штаб рендерить секцію «Мої цифри»`.

- [ ] **Step 8: Браузерна ШІ-перевірка** (Verification protocol). Фокус: на глобусі є кнопка «🎖️ Штаб»; клік відкриває оверлей зі шістьма картками-цифрами; десктоп-скрін; мобілка портрет+ландшафт (картки в сітку, не налазять); закриття ✕ працює на тачі.

- [ ] **Step 9: Коміт.**

```bash
git add src/ui/hq.js index.html src/main.js styles.css test/update-hq.mjs
git commit -m "feat(hq): кнопка Штаб + оверлей + секція «Мої цифри»"
```

---

## Task 3: Секція «Моя пригода» (печаті країн)

**Files:**
- Modify: `src/ui/hq.js` (метод `_adventureHtml` + виклик у `render`)
- Test: `test/update-hq.mjs`

**Interfaces:**
- Consumes: `save.liberated`, `save.records`, `save.missionRuns`, `COUNTRIES`/`CAMPAIGN_ORDER`/`isCountryOpen` ([src/countries.js](../../../src/countries.js)).

- [ ] **Step 1: Тест, що падає.** Додати в `test/update-hq.mjs`:

```js
// «Моя пригода»: печать «врятовано» з'являється для звільненої країни
await page.evaluate(() => { window.__game.save.liberated = { UKR: true }; window.__game.hq.render(); });
let advHtml = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-country/.test(advHtml), 'Штаб показує картки країн');
check(/🇺🇦/.test(advHtml), 'Україна — у списку пригоди');
const sealCount = (advHtml.match(/hq-country saved/g) || []).length;
check(sealCount >= 1, `звільнена країна має печать saved (${sealCount})`);
check(/locked/.test(advHtml), 'незвільнені країни затемнені (???)');
```

- [ ] **Step 2: Запустити — падає.** Run: `node test/update-hq.mjs`. Expected: FAIL — нема `hq-country`.

- [ ] **Step 3: Додати імпорт і метод у `src/ui/hq.js`.** Розширити імпорт:

```js
import { COUNTRIES, CAMPAIGN_ORDER, isCountryOpen } from '../countries.js';
```

У `render()` додати виклик:

```js
    root.innerHTML = this._statsHtml(this.game.save) + this._adventureHtml(this.game.save);
```

Додати метод:

```js
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
```

- [ ] **Step 4: Стилі в `styles.css`.** Додати:

```css
.hq-countries { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.hq-country { text-align: center; font-size: 30px; background: rgba(255,255,255,.07); border-radius: 12px; padding: 10px 6px; }
.hq-country.locked { opacity: .4; }
.hq-country.saved { outline: 2px solid #6fe06f; }
.hq-c-name { font-size: 12px; margin-top: 4px; }
.hq-c-seals { font-size: 13px; margin-top: 4px; }
```

- [ ] **Step 5: Запустити тест — проходить.** Run: `node test/update-hq.mjs`. Expected: PASS — `✅ звільнена країна має печать saved`.

- [ ] **Step 6: Браузерна ШІ-перевірка** (Verification protocol). Фокус: пройти UKR до перемоги в браузері → відкрити Штаб → картка України з печаттю ✅ (скрін); решта затемнені; мобілка — сітка країн не налазить.

- [ ] **Step 7: Коміт.**

```bash
git add src/ui/hq.js styles.css test/update-hq.mjs
git commit -m "feat(hq): секція «Моя пригода» — печаті країн"
```

---

## Task 4: Секція «Бестіарій» (картки ворогів, БЕЗ 3D)

**Files:**
- Modify: `src/main.js` (поле `save.bestiary` + інкремент), `src/ui/hq.js` (`_bestiaryHtml`), `styles.css`
- Test: `test/update-hq.mjs`

**Interfaces:**
- Produces: `save.bestiary = { <typeId>: count }`; секція бестіарію в `render`.

- [ ] **Step 1: Тест, що падає.** Додати в `test/update-hq.mjs`:

```js
// Бестіарій: добитий тип відкриває картку
await page.evaluate(() => {
  const g = window.__game; const p = g.level.player.pos;
  g.test.spawnZombie('tank', p.x + 5, p.z).damage(99999, null, false);
  g.hq.render();
});
const sv2 = await page.evaluate(() => window.__game.save);
check((sv2.bestiary.tank || 0) >= 1, `бестіарій рахує tank (${sv2.bestiary.tank})`);
const bHtml = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-beast/.test(bHtml), 'Штаб показує картки бестіарію');
check(/Бестіарій|Bestiary|Бестиарий/.test(bHtml), 'є заголовок «Бестіарій X/Y»');
```

- [ ] **Step 2: Запустити — падає.** Run: `node test/update-hq.mjs`. Expected: FAIL — `sv2.bestiary` undefined.

- [ ] **Step 3: Поле `bestiary` в сейв.** У `_newSave()` ([323](../../../src/main.js)) додати `bestiary: {},`. У `_loadSave()` поряд із валідацією stats (Task 1, Step 4) додати:

```js
        if (!out.bestiary || typeof out.bestiary !== 'object') out.bestiary = {};
```

- [ ] **Step 4: Інкремент у `zombieKilled`-хендлері.** У ПЕРШОМУ `zombieKilled` ([969](../../../src/main.js)) поряд із `this.save.stats.killed++;` (Task 1, Step 5) додати:

```js
      const bk = z.golden ? 'golden' : z.type;
      this.save.bestiary[bk] = (this.save.bestiary[bk] || 0) + 1;
```

- [ ] **Step 5: Метод `_bestiaryHtml` у `src/ui/hq.js`.** На початку файлу (після імпортів) додати таблицю (10 карток; описи мультяшні, без горору):

```js
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
```

У `render()` додати третю секцію:

```js
    root.innerHTML = this._statsHtml(this.game.save) + this._adventureHtml(this.game.save) + this._bestiaryHtml(this.game.save);
```

Додати метод:

```js
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
```

- [ ] **Step 6: Стилі в `styles.css`.** Додати:

```css
.hq-bestiary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.hq-beast { background: rgba(255,255,255,.07); border-radius: 12px; padding: 10px; text-align: center; }
.hq-beast.locked { opacity: .4; }
.hq-beast-i { font-size: 30px; }
.hq-beast-name { font-weight: 700; font-size: 14px; margin-top: 4px; }
.hq-beast-desc { font-size: 11px; opacity: .8; margin-top: 2px; }
.hq-beast-n { font-size: 11px; margin-top: 4px; opacity: .9; }
```

- [ ] **Step 7: Запустити тест — проходить.** Run: `node test/update-hq.mjs`. Expected: PASS — `✅ бестіарій рахує tank`.

- [ ] **Step 8: Браузерна ШІ-перевірка** (Verification protocol). Фокус: добити кілька різних типів у браузері → відкрита картка з описом + лічильник, невідкриті «???», заголовок «Бестіарій X/10» (скрін); `?lang=en`+`?lang=ru` — описи перекладені (скріни); мобілка — сітка читабельна.

- [ ] **Step 9: Коміт.**

```bash
git add src/main.js src/ui/hq.js styles.css test/update-hq.mjs
git commit -m "feat(hq): бестіарій — картки ворогів на емодзі"
```

---

## Task 5: Престиж після 30 рівня («Ранг Рятівника»)

**Files:**
- Modify: `src/progress.js` (геттер `prestigeStars` + банер), `src/ui/hq.js` (рядок престижу в `_statsHtml`)
- Test: `test/update-hq.mjs`

**Interfaces:**
- Consumes: `save.xp`, `xpForLevel`, `PASS_MAX_LEVEL` ([src/progress.js:40-43](../../../src/progress.js)).
- Produces: `Progress.prestigeStars` (геттер → ціле ≥ 0).

- [ ] **Step 1: Тест, що падає.** Додати в `test/update-hq.mjs`:

```js
// Престиж: XP понад поріг 30 рівня дає Зірки Рятівника
await page.evaluate(() => window.__game.test.addXp(200000));
const stars = await page.evaluate(() => window.__game.progress.prestigeStars);
check(stars >= 1, `XP понад максимум → prestigeStars ≥ 1 (${stars})`);
await page.evaluate(() => window.__game.hq.render());
const pHtml = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/Ранг Рятівника|Rescuer Rank|Ранг Спасателя/.test(pHtml), 'Штаб показує Ранг Рятівника');
```

- [ ] **Step 2: Запустити — падає.** Run: `node test/update-hq.mjs`. Expected: FAIL — `prestigeStars` undefined.

- [ ] **Step 3: Геттер у `Progress`.** У `src/progress.js` у класі `Progress` додати геттер (поріг сумарного XP за 30 рівнів рахується з наявного `xpForLevel`; крок престижу 600 XP):

```js
  // Сумарний XP, потрібний щоб ДОСЯГТИ максимального рівня пасу
  get _xpToCap() {
    let need = 0;
    for (let l = 1; l < PASS_MAX_LEVEL; l++) need += xpForLevel(l);
    return need;
  }

  // Нескінченний м'який престиж після стелі пасу. Без таймерів/FOMO — чистий статус.
  get prestigeStars() {
    const extra = this.xp - this._xpToCap;
    return extra > 0 ? Math.floor(extra / 600) : 0;
  }
```

- [ ] **Step 4: Банер при новому порозі.** У методі `addXp(n)` ([progress.js:81](../../../src/progress.js)), де вже рахуються `before`/`after` рівні, додати поряд перевірку престижу:

```js
    const prestigeBefore = this.prestigeStars; // ДО додавання XP (зчитати на початку addXp, до зміни save.xp)
    // …існуюче нарахування XP та рівнів…
    const prestigeAfter = this.prestigeStars;
    if (prestigeAfter > prestigeBefore) {
      game.hud.banner(t('🎖️ РАНГ РЯТІВНИКА {n}!', { n: prestigeAfter }), t('Так тримати, легендо!'), 4.2);
    }
```

> Розмісти `prestigeBefore` ПЕРШИМ рядком `addXp` (до `game.save.xp += n`), а перевірку — в кінці, після нарахування рівнів. Без покарань за пропуск днів.

- [ ] **Step 5: Рядок престижу в `_statsHtml`.** У `src/ui/hq.js` наприкінці `_statsHtml`, перед `return h;`, додати:

```js
    const stars = this.game.progress ? this.game.progress.prestigeStars : 0;
    h += `<div class="hq-prestige">${t('🎖️ Ранг Рятівника: {n} ⭐', { n: stars })}</div>`;
```

Стиль у `styles.css`:

```css
.hq-prestige { margin-top: 10px; font-weight: 800; font-size: 16px; text-align: center; }
```

- [ ] **Step 6: Запустити тест — проходить.** Run: `node test/update-hq.mjs`. Expected: PASS — `✅ XP понад максимум → prestigeStars ≥ 1`.

- [ ] **Step 7: Браузерна ШІ-перевірка** (Verification protocol). Фокус: накрутити XP (`__game.test.addXp`) → побачити «Ранг Рятівника N ⭐» у Штабі + банер (скрін); мобілка — рядок не обрізаний.

- [ ] **Step 8: Коміт.**

```bash
git add src/progress.js src/ui/hq.js styles.css test/update-hq.mjs
git commit -m "feat(hq): престиж після 30 рівня — Ранг Рятівника"
```

---

## Task 6: i18n, версія, PWA, README + фінальна перевірка

**Files:**
- Modify: `src/i18n/en.js`, `src/i18n/ru.js`, `sw.js`, `version.json`, `src/main.js` (`APP_VERSION`), `README.md`

- [ ] **Step 1: Переклади.** Зібрати всі нові українські рядки з `hq.js` і `progress.js` (заголовки секцій, підписи цифр, назви/описи бестіарію, рядки престижу). Для КОЖНОГО додати пару `'<укр>': '<переклад>'` у `src/i18n/en.js` і `src/i18n/ru.js` (формат існуючий: український рядок = ключ). Приклад:

```js
  '🏅 Мої цифри': '🏅 My Stats',
  'Зомбі переможено': 'Zombies defeated',
  '🗺️ Моя пригода': '🗺️ My Adventure',
  '📖 Бестіарій {got}/{tot}': '📖 Bestiary {got}/{tot}',
  '🎖️ Ранг Рятівника: {n} ⭐': '🎖️ Rescuer Rank: {n} ⭐',
```

(аналогічно ru.js: `'🏅 Мої цифри': '🏅 Мои цифры'` тощо).

- [ ] **Step 2: PWA SHELL.** У `sw.js` у масив `SHELL` додати рядок `'./src/ui/hq.js',` (поряд з іншими `./src/ui/`). Підняти `CACHE`: `const CACHE = 'zr-cache-v26';`.

- [ ] **Step 3: Бамп версії.** `version.json` → `{ "v": 26 }`. `src/main.js` рядок 56 → `const APP_VERSION = 26;`.

- [ ] **Step 4: Версія-гейт.** Run: `node test/version-check.mjs` (сервер :8741). Expected: PASS — `version.json` == `APP_VERSION` == 26.

- [ ] **Step 5: i18n-перевірка.** Run: `node test/i18n.mjs`. Expected: PASS — словники uk/en/ru без пропущених ключів.

- [ ] **Step 6: README.** Додати над поточним верхнім записом:

```markdown
**v26 «Штаб Рятівника: Моя пригода»**: нова кнопка «🎖️ Штаб» на глобусі — мої цифри (скільки зомбі/босів/золотих переможено, хедшоти, мегабокси, найкраще комбо), печаті країн (що врятовано, рекорди, скільки разів пройдено), бестіарій ворогів і **Ранг Рятівника** — нескінченні зірки за досвід ПІСЛЯ 30 рівня (мертвий XP оживає!). Усе локально, без 3D, без мережі.
```

- [ ] **Step 7: Повна браузерна ШІ-перевірка (фінал, зі скрінами).** Сценарій новачка у браузері: свіжий сейв `?fresh` → пройти UKR → відкрити Штаб → переконатися, що ВСІ три секції живі (цифри/печать України/відкриті картки бестіарію/ранг). **Скрін десктоп.** Потім **мобілка** портрет 390×844 і ландшафт 664×390 (скріни): нічого не налазить, оверлей прокручується. Потім `?lang=en` і `?lang=ru` (скріни): нуль української. `location.reload()` → весь прогрес Штабу вижив.

- [ ] **Step 8: Регресії + кооп-саніті.** Run: `node test/smoke.mjs`, `node test/update4.mjs`, `node test/e2e.mjs` (профільні; за повільного headless — `SLOW=4 node test/e2e.mjs`). Підтвердити «нуль змін у коопі» (мережеві файли не чіпалися). Якщо чіпався мобільний HUD — `node test/_touch-stress.mjs`.

- [ ] **Step 9: Адверсаріальне рев'ю.** `superpowers:requesting-code-review` — свіжий рев'ювер перевіряє: міграцію сейва (старий сейв без `stats`/`bestiary` не падає), коректність кооп-гейта, i18n-повноту, відсутність 3D/мережі, скоуп не розплився.

- [ ] **Step 10: Фінальний коміт.**

```bash
git add src/i18n/en.js src/i18n/ru.js sw.js version.json src/main.js README.md
git commit -m "chore(hq): i18n uk/en/ru + бамп v26 + PWA SHELL + README (Штаб: Моя пригода)"
```

---

## Self-Review (звірка плану — виконано автором)

- **Покриття M1-roadmap:** «Мої цифри»→Task 1+2 ✅; «Моя пригода» печаті→Task 3 ✅; бестіарій→Task 4 ✅; престиж після 30→Task 5 ✅; i18n/версія/PWA/верифікація→Task 6 ✅. Кнопка «Штаб»→Task 2 ✅.
- **Без плейсхолдерів:** кожен крок має реальний код (поля сейва, точні bus-хендлери з номерами рядків, повний `hq.js`, геттер престижу) та точні команди з очікуваним результатом.
- **Узгодженість типів:** `save.stats.{killed,headshots,bosses,megaboxes,golden,bestCombo}`, `save.bestiary[id]`, `RescueHQ.render()`, `prestigeStars` — названо однаково в усіх задачах. `_statsHtml` посилається на `prestigeStars` лише в Task 5 (де геттер і додається); до того секція престижу відсутня — нема forward-reference.
- **Браузерна ШІ-перевірка (вимога користувача):** винесена в «Verification protocol» і повторена у фінальному Task 6 Step 7 — десктоп + мобілка (портрет+ландшафт) + скріни + en/ru, для КОЖНОЇ задачі.
- **Безпека сейва:** валідація форми нових полів у `_loadSave` (Task 1 Step 4, Task 4 Step 3); тест на reload (Task 1). **Кооп:** локальні лічильники (гейт 971) — задокументовано, нуль мережевих змін.
- **Поза скоупом (свідомо):** 3D-силуети, наліпки, «Сьогодні»-рушій, вкладка косметики, кооп-зарахування гостьових вбивств — у наступні зрізи.

---

## Execution Handoff

План збережено. Два способи виконання:

1. **Subagent-Driven (рекомендовано)** — свіжий субагент на задачу + двостадійне рев'ю між задачами (`superpowers:subagent-driven-development`). Швидка ітерація, чисті чекпойнти.
2. **Inline** — батч у цій сесії з чекпойнтами (`superpowers:executing-plans`).

Починати з **Task 1**. Після кожної задачі — показати Владу працюючий шматок.
