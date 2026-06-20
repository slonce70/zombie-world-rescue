# Mobile-First Overhaul (v34) Implementation Plan

> Execute via `superpowers:subagent-driven-development`. Fixes critical mobile UX reported from real phone play + reworks kid mode. Verify UI visually with `node test/_shot.mjs <url> <w> <h> <out.png>` (Playwright screenshot — the preview MCP is broken this session) + `node test/_touch-stress.mjs` (overlap geometry) + headless functional tests.

**Goal:** make the game usable & pleasant on phones/tablets: (1) declutter the globe menu so countries are tappable + add a country LIST; (2) never show keyboard keys (E/Shift) on touch — show touch buttons; (3) kid mode = gentle AIM ASSIST only (no auto-fire, not guaranteed headshots).

**Problem evidence (current v33, captured):** on touch the 9 globe-side buttons render as a centered row OVER the globe, covering Ukraine's tooltip and blocking country taps; landscape is worse (globe fully buried). Mission prompts say «Тримай E» on touch (no E key on phones). Kid mode auto-fires + locks aim (cheat feel).

## Global Constraints (verbatim)
- БЕЗ клавіатурних підказок на тачі — НІДЕ. Кожна підказка з клавішею → `keyHint(touch, key)` або `{k}=interactKey()`. На тачі: екранна кнопка/іконка (взаємодія = ✋, кнопка `#tb-interact`).
- Режим Малюк: ЛИШЕ м'яка допомога прицілу (слабкий доворот до тулуба найближчого зомбі), БЕЗ автовогню, БЕЗ гарантованого хедшоту. Дитина сама тисне «вогонь».
- Декларутер глобуса: другорядні кнопки — у меню (☰), глобус лишається клікабельним; додати список країн (тап → грати). Працює і на тачі, і на десктопі (одна розкладка, чистіша).
- Десктоп не має зламатися (перевіряти і десктоп-, і мобільні скріни).
- i18n uk/en/ru, нові рядки через `t()` + en/ru. Версія 3x: v33→v34.
- Без змін мережі/протоколу.

## File Structure
- Modify `src/player.js`: kid-mode (`_kidAimAssist` ~581, trigger ~449, call ~279-280).
- Modify `src/missionpool.js` + `src/main.js`: E-prompts → `interactKey()` templated; add `interactKey` (i18n.js).
- Modify `src/i18n.js`: `export function interactKey()`.
- Modify `index.html`: globe top gets `#btn-menu` (☰); secondary buttons move into `#overlay-menu` drawer; add `#country-list` strip; keep ГРАТИ/ГРАТИ РАЗОМ.
- Modify `src/main.js`: wire `#btn-menu`/drawer; render `#country-list` (tap → startLevel); update kid-mode coach text.
- Modify `styles.css`, `src/i18n/en.js`, `ru.js`, `version.json`, `sw.js`, `README.md`.
- Tests: `test/update-mobile.mjs` (kid-mode no-auto-fire, touch E→✋, country-list tap, menu drawer).

## Verification protocol
Server :8741. Per task: `node test/update-mobile.mjs` + `node test/smoke.mjs`. UI tasks: `node test/_touch-stress.mjs` (no overlaps) + `node test/_shot.mjs "http://localhost:8741/?touch&lang=uk" 844 390 /tmp/x.png` and `... 640 900 ...` and desktop `... 1280 800 ...` — controller reads PNGs to confirm declutter/no-overlap visually.

---

## Task 1: Kid mode → gentle aim assist (no auto-fire, no forced headshot)

**Files:** `src/player.js`, `src/main.js` (coach text), test `test/update-mobile.mjs`.

- [ ] **Step 1: Failing test.** `test/update-mobile.mjs` (mirror update4 header). Load `?test&fresh&country=UKR&touch`, enable kid mode (`window.__game.save.kidMode = true`), spawn a zombie directly ahead in the cone, advance ~1s WITHOUT any fire input, assert NO shot was fired (kid mode must NOT auto-fire):
```js
console.log('▸ Mobile: режим Малюк — без автовогню');
await page.goto(`${BASE}/?test&fresh&country=UKR&touch`);
await waitFor(async () => (await page.evaluate(()=>window.__game&&window.__game.state))==='level',30000,'level');
const shotsBefore = await page.evaluate(() => window.__game.level.stats.shotsFired);
await page.evaluate(() => {
  const g = window.__game; g.save.kidMode = true;
  const p = g.level.player; const fwd = p.forwardVec({x:0,y:0,z:0});
  g.test.spawnZombie('walker', p.pos.x - Math.sin(p.yaw)*8, p.pos.z - Math.cos(p.yaw)*8);
});
await page.waitForTimeout(1500);
const shotsAfter = await page.evaluate(() => window.__game.level.stats.shotsFired);
check(shotsAfter === shotsBefore, `режим Малюк НЕ стріляє сам (${shotsBefore}→${shotsAfter})`);
```
- [ ] **Step 2: RED.** `node test/update-mobile.mjs` (currently auto-fires → shotsAfter > before → FAIL).
- [ ] **Step 3: Rework `_kidAimAssist`** (`src/player.js:581`). Remove the auto-fire line `this._kidFire = true;` (line ~612). Make the assist GENTLE: lower the lerp rate from 9 to ~4 for yaw and ~3 for pitch; keep targeting the TORSO (`height*0.55`) — NOT the head; optionally narrow effect to closer targets. Keep it touch+kidMode only. Update the comment to say "лише м'який доворот, дитина сама стріляє".
- [ ] **Step 4: Remove `_kidFire` trigger.** At `src/player.js:449`, drop `this._kidFire ||` from the fire trigger (so fire only happens on real input). Leave `this._kidFire` field assignment at 279 (now always false) or remove it cleanly.
- [ ] **Step 5: Coach text.** Wherever kid-mode is described (grep `автоприціл`/`автовогон`/kid coach in main.js/hud), change to «🐣 Малюк: допомога з прицілом (стріляй сам кнопкою 🔫)» — no claim of auto-fire.
- [ ] **Step 6: GREEN.** `node test/update-mobile.mjs` + `node test/smoke.mjs` + `node test/update4.mjs` (kid-mode regression if covered).
- [ ] **Step 7: Commit.** `git add -A && git commit -m "fix(kid): режим Малюк — лише м'яка допомога прицілу, без автовогню й гарант-хедшоту"`

---

## Task 2: No keyboard keys on touch — E→✋ everywhere

**Files:** `src/i18n.js`, `src/missionpool.js`, `src/main.js`, test `test/update-mobile.mjs`.

- [ ] **Step 1: `interactKey()` in `src/i18n.js`.** Add: `export function interactKey() { return keyHint('✋', 'E'); }` (touch → ✋, keyboard → E).
- [ ] **Step 2: Failing test.** Append: load `?test&fresh&country=UKR&touch`, drive the game to a mission prompt (or call the prompt builder), assert the visible prompt contains ✋ and NOT a standalone «E». Simplest robust assertion: after entering UKR (touch), read the active mission `prompt.text` and check `/✋/.test(text) && !/\bE\b/.test(text)` for at least the first interact prompt. (If reaching a live prompt is flaky, assert `interactKey()` returns ✋ under touch via a small exposed check, AND that a sample mission prompt string built under touch contains ✋.)
- [ ] **Step 3: RED.**
- [ ] **Step 4: Convert all E-prompts.** In `src/missionpool.js` replace raw `t('Тримай E — …')` / `t('Натисни E — …')` with templated `t('Тримай {k} — …', { k: interactKey() })` / `t('Натисни {k} — …', { k: interactKey() })`. Cover BOTH the config block (lines ~42-79: prompt/deliverPrompt) AND the inline prompts in the solo path (~799, 835, 883, 910, 992, 1026) AND the coop-mirror path (~1553, 1560, 1569, 1579, 1594, 1184). Import `interactKey` from `./i18n.js`. In `src/main.js:1378` revive prompt: `t('💚 Тримай {k} — підніми {n}!', { k: interactKey(), n })`. Grep `'Тримай E\|'Натисни E` after to confirm none remain raw.
- [ ] **Step 5: GREEN.** `node test/update-mobile.mjs` + `node test/update6.mjs`/`update11.mjs` (mission tests) + `node test/smoke.mjs`.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "fix(i18n): жодних клавіш на тачі — підказки взаємодії E→✋ (місії, реанімація)"`

---

## Task 3: Globe declutter — ☰ menu drawer + country list

**Files:** `index.html`, `src/main.js`, `styles.css`, test `test/update-mobile.mjs`.

- [ ] **Step 1: Failing test.** Append: load `?test&fresh&touch` (globe), assert: (a) a `#btn-menu` (☰) exists; (b) the secondary buttons live inside `#overlay-menu` (drawer), not loose over the globe; (c) `#country-list` exists with ≥6 country items; (d) clicking a playable country item calls startLevel (spy `window.__game.startLevel`). E.g.:
```js
console.log('▸ Mobile: глобус — меню + список країн');
await page.goto(`${BASE}/?test&fresh&touch`);
await waitFor(async () => (await page.evaluate(()=>window.__game&&window.__game.state))==='globe',30000,'globe');
check(await page.evaluate(()=>!!document.getElementById('btn-menu')), 'є кнопка меню ☰');
const inDrawer = await page.evaluate(()=>!!document.querySelector('#overlay-menu #btn-wardrobe'));
check(inDrawer, 'другорядні кнопки — у висувному меню');
const n = await page.evaluate(()=>document.querySelectorAll('#country-list .country-item').length);
check(n >= 6, `список країн має ≥6 країн (${n})`);
await page.evaluate(()=>{ window.__startArg=null; const o=window.__game.startLevel.bind(window.__game); window.__game.startLevel=(c,opt)=>{window.__startArg=c; return; }; const it=document.querySelector('#country-list .country-item[data-id="UKR"]'); if(it) it.click(); });
check(await page.evaluate(()=>window.__startArg)==='UKR', 'тап по країні в списку запускає рівень');
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: index.html restructure.** In `#globe-ui`: add `<button id="btn-menu" class="btn">☰ Меню</button>` to `.globe-top` (corner). Move the 9 `.globe-act` buttons OUT of `.globe-side` into a new drawer `<div id="overlay-menu" class="overlay"><div class="overlay-card panel-card"><div class="panel-header"><h2>☰ Меню</h2><button class="btn-x panel-close" data-close="overlay-menu">✕</button></div> …the 9 buttons… </div></div>`. Add `<div id="country-list"></div>` in `.globe-bottom` (above the play row). Keep ГРАТИ / ГРАТИ РАЗОМ / liberated count.
- [ ] **Step 4: main.js wiring.** Wire `#btn-menu` → `_showOverlay('overlay-menu')`. The 9 buttons keep their existing IDs/handlers (they now live in the drawer — handlers unchanged). Add `renderCountryList()`: for each `CAMPAIGN_ORDER` country build `<div class="country-item" data-id="ID">flag name + badge(🔴/✅/🔒)</div>`; wire tap → if playable `startLevel(id)` else denied toast (mirror globe.js `_click` logic). Call `renderCountryList()` in `_showGlobeUI` (and after a level/liberation updates). For locked countries show 🔒 and don't start.
- [ ] **Step 5: CSS (declutter).** Style `#country-list` as a horizontal-scroll strip (or wrap grid) of `.country-item` chips that does NOT overlap the globe; `#btn-menu` in a top corner. Remove/empty the old `.globe-side` centered-row styles so nothing floats over the globe center. Ensure on touch (`body.touch-mode`) and small landscape the globe area is clear and the play row + country list fit. Keep desktop tidy.
- [ ] **Step 6: GREEN + visual.** `node test/update-mobile.mjs` + `node test/_touch-stress.mjs` (must be fully OK). Then `node test/_shot.mjs "http://localhost:8741/?touch&lang=uk" 844 390 /tmp/g-land.png`, `... 640 900 /tmp/g-port.png`, `... 1280 800 /tmp/g-desk.png` — controller reads all three and confirms: no buttons over the globe center, country list visible & tappable, ГРАТИ reachable, desktop still tidy. Iterate CSS until clean.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(globe): декларутер — кнопки у ☰-меню + список країн; глобус знову клікабельний"`

---

## Task 4: i18n + v34 + README + final verification

- [ ] **Step 1: i18n.** en+ru for all new keys (kid coach, `Тримай {k} — …`/`Натисни {k} — …` templates, `☰ Меню`, country-list labels/badges, etc.). No leak; `{k}`/`{n}` intact.
- [ ] **Step 2: version.** version.json→34; APP_VERSION→34; sw.js CACHE→`zr-cache-v34`.
- [ ] **Step 3: README.** `**v34 «Мобільний-first»**: …` above v33 (decluttered globe with ☰-menu + tappable country list; no keyboard hints on phones; kid mode = gentle aim help, not auto-fire).
- [ ] **Step 4: Gates.** `node test/version-sync.mjs`, `node test/i18n.mjs`, `node test/update-mobile.mjs`, `node test/_touch-stress.mjs`, `node test/smoke.mjs`, `SLOW=4 node test/e2e.mjs` (campaign still works), and re-shoot mobile+desktop globe for the record.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore(mobile): i18n + бамп v34 + README (Мобільний-first)"`

---

## Self-Review
- Coverage: kid-mode (T1), touch E-hints (T2), globe declutter+country list (T3), i18n/version/e2e (T4).
- No keyboard keys on touch (grep confirms no raw 'Тримай E'/'Натисни E'); kid mode no auto-fire (test); globe tappable + country list (test + visual shots); desktop not broken (desktop shot).
- Visual verification via `_shot.mjs` (preview MCP broken) + `_touch-stress` geometry.
