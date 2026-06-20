# M2 «Моя ціль» Implementation Plan

> **For agentic workers:** execute via `superpowers:subagent-driven-development`, one task at a time, review between. Checkbox steps.
> Part of roadmap [2026-06-20-rescue-hq-roadmap.md](2026-06-20-rescue-hq-roadmap.md). Builds on M1 (shipped v26).

**Goal:** let a kid pick ONE shop item as «Моя ціль», and show progress toward it («ще N монет» + чому корисний) — giving coins a clear purpose. Shown in the shop and in the Штаб. No network, no 3D.

**Architecture:** new save field `save.goal` (shop item id | null). A `goalInfo(game)` helper exported from `src/shop.js` resolves the goal item + remaining coins. The shop adds a «🎯» set/clear button per eligible item, a goal line in the header, and auto-clears the goal when that item is bought. The Штаб (`src/ui/hq.js`) shows a «🎯 Моя ціль» card first.

**Tech Stack:** vanilla ES, i18n uk/en/ru, PWA, headless tests Playwright.

## Global Constraints (verbatim, every task)
- Без бандлера; ассети кодом; БЕЗ 3D.
- i18n: нові рядки через `t('…')` + en/ru у Task 3.
- Збереження священне: `save.goal` у `_newSave()` І валідація в `_loadSave()` (старий сейв не падає).
- Нуль мережі (кооп не чіпаємо).
- Версія 3x: `version.json`/`APP_VERSION`(src/main.js:56, 26→27)/`sw.js` CACHE (v26→v27).
- Дисципліна скоупу: ціль — лише з товарів магазину; без авто-підказок, без HUD-індикатора (щоб не чіпати мобільний HUD-оверлап) — тільки магазин + Штаб.

## File Structure
- Modify `src/shop.js`: `export function goalInfo(game)`, goal button + header in `render()`, auto-clear in `buy()`.
- Modify `src/main.js`: `save.goal` in `_newSave`/`_loadSave`.
- Modify `src/ui/hq.js`: `_goalHtml(save)` first in `render()` (imports `goalInfo`).
- Modify `styles.css`: `.shop-goal-*`, `.hq-goal` styles.
- Modify `src/i18n/en.js`, `src/i18n/ru.js`, `version.json`, `sw.js`, `README.md`.
- Test: `test/update-hq-m2.mjs`.

## Verification protocol (end of each task)
Server `python3 -m http.server 8741`. 1) `node test/update-hq-m2.mjs` green + `node test/smoke.mjs`. 2) Controller does browser desktop+mobile screenshots at the end (Task 3): open shop, set goal, see header + Штаб card; mobile portrait + landscape; en/ru no Ukrainian leak.

---

## Task 1: `save.goal` + `goalInfo()` + shop goal button/header + auto-clear

**Files:** `src/main.js` (save), `src/shop.js`, `styles.css`, test `test/update-hq-m2.mjs`.

**Interfaces produced:** `save.goal: string|null`; `export function goalInfo(game)` → `{item, need, have, remaining, done}|null`.

- [ ] **Step 1: Failing test.** Create `test/update-hq-m2.mjs` (mirror `test/update4.mjs` header: chromium, BASE, check, waitFor, loadCountry). Add:
```js
console.log('▸ M2: Моя ціль — магазин');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
await page.evaluate(() => { window.__game.save.coins = 1000; window.__game.save.goal = null; window.__game.shop.open(); });
let goalBtn = await page.$('#shop [data-goal="vest"]');
check(!!goalBtn, 'у магазині є кнопка «🎯 ціль» для бронежилета');
await page.evaluate(() => document.querySelector('#shop [data-goal="vest"]').click());
check((await save()).goal === 'vest', 'клік 🎯 встановлює save.goal=vest');
const header = await page.evaluate(() => document.getElementById('shop-goal') && document.getElementById('shop-goal').textContent);
check(/Бронежилет|ціль|Ціль/i.test(header || ''), 'шапка магазину показує ціль');
// auto-clear on buy
await page.evaluate(() => window.__game.shop.buy('vest'));
check((await save()).goal === null, 'купівля цілі очищає save.goal');
// persist
await page.evaluate(() => { window.__game.save.goal = 'sniper'; window.__game.saveGame(); });
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
check((await save()).goal === 'sniper', 'ціль переживає reload');
```
- [ ] **Step 2: Run RED.** `node test/update-hq-m2.mjs` → FAIL (no goal button / save.goal undefined).
- [ ] **Step 3: save.goal.** In `_newSave()` add `goal: null,`. In `_loadSave()` (after stats/bestiary validation) add: `if (out.goal !== null && typeof out.goal !== 'string') out.goal = null;`
- [ ] **Step 4: `goalInfo` helper in `src/shop.js`** (after the `SHOP_ITEMS` array, before `class Shop`):
```js
// Поточна «Моя ціль»: товар, на який гравець збирає монети (або null).
export function goalInfo(game) {
  const id = game.save && game.save.goal;
  if (!id) return null;
  const item = SHOP_ITEMS.find((i) => i.id === id);
  if (!item) return null;
  const need = item.price;
  const have = game.save.coins || 0;
  return { item, need, have, remaining: Math.max(0, need - have), done: have >= need };
}
```
- [ ] **Step 5: Goal button + header in `Shop.render()`.** Goal-eligible = not a consumable, not maxed/owned, not locked: `const goalOk = item.cat !== t('Припаси') && !maxed && !locked;`. Inside the card template add (after the price div), when `goalOk`:
```js
const isGoal = this.game.save.goal === item.id;
const goalBtn = goalOk ? `<button class="shop-goal-btn ${isGoal ? 'on' : ''}" data-goal="${item.id}" title="${t('Зробити ціллю')}">🎯</button>` : '';
```
and append `${goalBtn}` inside the `.shop-item` div; add `${isGoal ? 'goal' : ''}` to the item's class list. Before the grid HTML, build a header line element. After `this.elGrid.innerHTML = html;` wire the goal buttons:
```js
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
```
Render the goal header into `#shop-goal` (add that element to `index.html` shop panel, OR build it in render and prepend). Simplest: in `render()` set `document.getElementById('shop-goal').textContent`:
```js
const gi = goalInfo(this.game);
const goalEl = document.getElementById('shop-goal');
if (goalEl) goalEl.textContent = gi
  ? (gi.done ? t('🎯 Ціль: {i} {n} — можна купити! 🎉', { i: gi.item.icon, n: gi.item.name })
             : t('🎯 Ціль: {i} {n} — ще {r} ₴', { i: gi.item.icon, n: gi.item.name, r: gi.remaining }))
  : t('🎯 Обери ціль — тисни 🎯 на товарі');
```
Add `import { GADGETS } ...` already present; add `goalInfo` is same-file (no import). In `index.html`, inside `#shop` panel header area add `<div id="shop-goal" class="shop-goal"></div>` (above `#shop-grid`). (If the implementer cannot find a clean spot, create the element in render and prepend to `elGrid.parentNode`.)
- [ ] **Step 6: Auto-clear on buy.** In `Shop.buy(id)`, after `game.saveGame();` near the end (after a successful purchase), add: `if (game.save.goal === id) { game.save.goal = null; game.hud.toast(t('🎯 Ціль досягнута! Обери нову в магазині')); game.saveGame(); }`
- [ ] **Step 7: CSS** (`styles.css`):
```css
.shop-goal { text-align:center; font-weight:700; margin:6px 0; opacity:.95; }
.shop-goal-btn { position:absolute; top:6px; right:6px; background:rgba(0,0,0,.25); border:none; border-radius:8px; padding:2px 6px; cursor:pointer; font-size:14px; opacity:.6; }
.shop-goal-btn.on { opacity:1; background:#f5c542; }
.shop-item.goal { outline:2px solid #f5c542; }
.shop-item { position:relative; }
```
- [ ] **Step 8: Run GREEN.** `node test/update-hq-m2.mjs` → PASS. Then `node test/smoke.mjs`.
- [ ] **Step 9: Commit.** `git add -A && git commit -m "feat(hq): «Моя ціль» — кнопка цілі в магазині + автоочищення при покупці"`

---

## Task 2: Штаб «🎯 Моя ціль» section

**Files:** `src/ui/hq.js`, `styles.css`, test `test/update-hq-m2.mjs`.

- [ ] **Step 1: Failing test.** Append:
```js
console.log('▸ M2: Моя ціль — Штаб');
await page.evaluate(() => { window.__game.save.coins = 120; window.__game.save.goal = 'vest'; window.__game.hq.render(); });
const hq = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-goal/.test(hq), 'Штаб має секцію «Моя ціль»');
check(/Бронежилет|Vest|Бронежилет/.test(hq) && /\d/.test(hq), 'ціль показує назву і скільки ще монет');
await page.evaluate(() => { window.__game.save.goal = null; window.__game.hq.render(); });
const hq2 = await page.evaluate(() => document.getElementById('hq-content').innerHTML);
check(/hq-goal/.test(hq2), 'без цілі — запрошення обрати ціль');
```
- [ ] **Step 2: RED.** `node test/update-hq-m2.mjs`.
- [ ] **Step 3: `_goalHtml` in `src/ui/hq.js`.** Add `import { goalInfo } from '../shop.js';` (top). Add method:
```js
  _goalHtml(save) {
    const gi = goalInfo(this.game);
    if (!gi) return `<h3 class="hq-h">${t('🎯 Моя ціль')}</h3><div class="hq-goal empty">${t('Обери ціль у магазині — тисни 🎯 на товарі, на який збираєш монети.')}</div>`;
    const line = gi.done
      ? t('Можна купити! 🎉')
      : t('Ще {r} монет', { r: gi.remaining });
    const desc = typeof gi.item.desc === 'function' ? gi.item.desc() : gi.item.desc;
    return `<h3 class="hq-h">${t('🎯 Моя ціль')}</h3><div class="hq-goal"><span class="hq-goal-i">${gi.item.icon}</span><div class="hq-goal-b"><div class="hq-goal-n">${gi.item.name}</div><div class="hq-goal-r">${line}</div><div class="hq-goal-d">${desc}</div></div></div>`;
  }
```
Prepend it in `render()`: `root.innerHTML = this._goalHtml(this.game.save) + this._statsHtml(...) + ...`
- [ ] **Step 4: CSS.**
```css
.hq-goal { display:flex; gap:10px; align-items:center; background:rgba(245,197,66,.12); border:1px solid rgba(245,197,66,.5); border-radius:12px; padding:10px; }
.hq-goal.empty { opacity:.8; font-size:13px; }
.hq-goal-i { font-size:30px; }
.hq-goal-n { font-weight:800; }
.hq-goal-r { font-weight:700; color:#f5c542; }
.hq-goal-d { font-size:12px; opacity:.8; }
```
- [ ] **Step 5: GREEN.** `node test/update-hq-m2.mjs`.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(hq): секція «Моя ціль» у Штабі"`

---

## Task 3: i18n + version v27 + README + final

**Files:** `src/i18n/en.js`, `src/i18n/ru.js`, `version.json`, `src/main.js`, `sw.js`, `README.md`.

- [ ] **Step 1: i18n.** Grep new `t('` keys in `src/shop.js` and `src/ui/hq.js` (the M2 ones: `Зробити ціллю`, `🎯 Ціль: {i} {n} — ще {r} ₴`, `🎯 Ціль: {i} {n} — можна купити! 🎉`, `🎯 Обери ціль — тисни 🎯 на товарі`, `🎯 Ціль досягнута! Обери нову в магазині`, `🎯 Моя ціль`, `Обери ціль у магазині — тисни 🎯 на товарі, на який збираєш монети.`, `Можна купити! 🎉`, `Ще {r} монет`). Add en+ru entries for ALL to both dicts, placeholders intact.
- [ ] **Step 2: version.** `version.json`→`{ "v": 27 }`; `src/main.js:56`→`const APP_VERSION = 27;`; `sw.js` CACHE→`zr-cache-v27`. (hq.js already in SHELL.)
- [ ] **Step 3: README.** Add `**v27 «Моя ціль»**: …` note above v26.
- [ ] **Step 4: Gates.** `node test/version-check.mjs`, `node test/i18n.mjs`, `node test/update-hq-m2.mjs`, `node test/update-hq.mjs`, `node test/smoke.mjs` — all green.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore(hq): i18n + бамп v27 + README (Моя ціль)"`

---

## Self-Review
- Coverage: goal field+helper (T1), shop button/header/auto-clear (T1), Штаб card (T2), i18n/version (T3).
- Save migration: `save.goal` validated; old save → null. 
- No network, no 3D, no HUD-overlap risk (shop+Штаб only).
- Browser verification (controller, after T3): desktop+mobile, set goal in shop → header + Штаб card; en/ru.
