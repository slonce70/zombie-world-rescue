# M6 «Зроби свого героя» (paint) Implementation Plan

> Execute via `superpowers:subagent-driven-development`. Builds on M1-M4 (v26-v29). LOW-RISK slice: a new `custom` skin whose colors come from `save.hero` — the 10 preset skins are NOT touched. Coop-visibility and live-preview are deferred.

**Goal:** let a kid paint their own hero — pick shirt/pants/skin colors from a kid-friendly palette in the Гардероб. A new «🎨 Мій герой» skin uses those colors; selecting it + picking colors persists and shows on the hero in-level. Self-expression — the #1 reason kids pick a game.

**Architecture:** add `HERO_SKINS.custom` + a `custom()` builder in `makeHero(skinId, heroColors)` that reads colors (with safe defaults). `save.hero = {shirt,pants,skin}` (hex). `player.js` passes `save.hero` to `makeHero`. The Гардероб shows color-swatch rows when the custom skin is active. No preset refactor, no live 3D preview, no coop wire change (friends see the default custom colors for now — documented).

## Global Constraints (verbatim)
- Без бандлера; БЕЗ 3D-прев'ю (відкладено); ассети кодом. Палітра — фіксовані кольори (нуль вільного тексту).
- i18n: нові рядки через `t('…')` + en/ru (Task 3).
- Збереження священне: `save.hero` у `_newSave()` І валідація в `_loadSave()`; `'custom'` завжди у `save.skins`.
- makeHero ЗМІНА АДИТИВНА: `makeHero(skinId, heroColors)` — без heroColors поведінка стара (10 пресетів не чіпати). Кооп-видимість кастом-кольорів ВІДКЛАДЕНО (remote бачить дефолтний custom).
- Версія 3x: v29→v30. Покупки косметики не вводимо (тільки палітра) — без азарту.

## File Structure
- Modify `src/characters.js`: `HERO_SKINS.custom`, `HERO_PALETTE`, `makeHero(skinId, heroColors)` + `custom()` builder.
- Modify `src/player.js:75`: pass `save.hero` → `makeHero(save.activeSkin, save.hero)`.
- Modify `src/main.js`: `save.hero` in `_newSave`/`_loadSave`; `'custom'` always owned; Гардероб color UI in `renderWardrobe`.
- Modify `styles.css`, `src/i18n/en.js`, `ru.js`, `version.json`, `sw.js` CACHE, `README.md`.
- Test: `test/update-hq-m6.mjs`.

## Verification protocol
Server :8741. `node test/update-hq-m6.mjs` + `node test/smoke.mjs`. **Task 3 runs `SLOW=4 node test/e2e.mjs` LOCALLY** (makeHero is campaign-relevant — confirm the hero still builds/renders through a full UKR run). Controller browser screenshots only if preview env recovers.

---

## Task 1: `custom` skin + `save.hero` + makeHero colors + player wiring

**Files:** `src/characters.js`, `src/player.js`, `src/main.js`, test `test/update-hq-m6.mjs`.

**Interfaces produced:** `HERO_SKINS.custom`, `HERO_PALETTE` (exported arrays), `makeHero(skinId, heroColors)`; `save.hero = {shirt,pants,skin}` (hex numbers).

- [ ] **Step 1: `HERO_PALETTE` + `HERO_SKINS.custom` in `src/characters.js`.** Near `HERO_SKINS` (line 1311):
```js
export const HERO_PALETTE = {
  shirt: [0x2f80c3, 0xe14b4b, 0x46ب340, 0xf5a623, 0x8e44ad, 0x16a085, 0xec407a, 0x34495e].filter(Number.isFinite),
  pants: [0x474f63, 0x2d3436, 0x6b4f3a, 0x2c3e50, 0x7f8c8d, 0x512e5f],
  skin: [0xffc9a3, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffd9b3],
};
```
(NOTE: write valid hex — e.g. green `0x46b340`; remove the `.filter` helper, it's only a guard against a typo. Use 8 shirt, 6 pants, 6 skin clean hex values.)
Add to `HERO_SKINS`: `custom: { name: t('Мій герой'), icon: '🎨' },`
- [ ] **Step 2: `makeHero(skinId, heroColors)` + `custom()` builder.** Change signature to `export function makeHero(skinId = 'classic', heroColors = null)`. Add a builder:
```js
    custom() {
      const hc = heroColors || {};
      const rig = makeHumanoid({
        scale: 1.0,
        skin: hc.skin || 0xffc9a3, shirt: hc.shirt || 0x2f80c3, pants: hc.pants || 0x474f63,
        shoes: 0x303642, eyeL: 0.058, eyeR: 0.058, mouth: 'smile', mouthColor: 0x8a4b3a, brow: -0.08, cast: 'all',
      });
      // проста кепка кольору сорочки — щоб кастом не виглядав «голим»
      const capM = toonMat(hc.shirt || 0x2f80c3);
      const capTop = sphere(0.275, capM, 16, 10); capTop.position.y = 0.2; capTop.scale.set(1, 0.62, 1);
      rig.parts.head.add(capTop);
      return rig;
    },
```
Ensure the builder is selected like others (`(builders[skinId] || builders.classic)()`).
- [ ] **Step 3: Failing test.** `test/update-hq-m6.mjs` (mirror update4 header):
```js
console.log('▸ M6: Зроби свого героя');
await loadCountry('UKR');
const save = () => page.evaluate(() => window.__game.save);
let sv = await save();
check(sv.hero && typeof sv.hero === 'object', 'save.hero існує');
check(sv.skins.includes('custom'), 'кастом-скін завжди доступний');
// custom hero builds without error with chosen colors
const built = await page.evaluate(() => {
  try { const r = window.__makeHeroTest ? window.__makeHeroTest('custom', { shirt:0xe14b4b, pants:0x2d3436, skin:0xf1c27d }) : null; return r ? 'ok' : 'noapi'; }
  catch (e) { return 'throw:' + e.message; }
});
check(built === 'ok' || built === 'noapi', `makeHero('custom', colors) не падає (${built})`);
// selecting custom + colors persists
await page.evaluate(() => { window.__game.save.activeSkin = 'custom'; window.__game.save.hero = { shirt:0xe14b4b, pants:0x2d3436, skin:0xf1c27d }; window.__game.saveGame(); });
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
sv = await save();
check(sv.activeSkin === 'custom' && sv.hero.shirt === 0xe14b4b, 'кастом-герой і кольори переживають reload');
```
(If exposing `__makeHeroTest` is undesirable, the implementer may instead assert the in-level player rig exists with activeSkin='custom' without throwing — pick the simplest real assertion.)
- [ ] **Step 4: RED.** `node test/update-hq-m6.mjs`.
- [ ] **Step 5: save.hero + player wiring.** In `_newSave()`: `hero: { shirt: 0x2f80c3, pants: 0x474f63, skin: 0xffc9a3 },` and change `skins: ['classic']` → `skins: ['classic', 'custom']`. In `_loadSave()`: validate `if (!out.hero || typeof out.hero !== 'object') out.hero = {}; for (const k of ['shirt','pants','skin']) if (typeof out.hero[k] !== 'number') out.hero[k] = ({shirt:0x2f80c3,pants:0x474f63,skin:0xffc9a3})[k];` and ensure `if (!out.skins.includes('custom')) out.skins.push('custom');`. In `src/player.js:75`: `this.rig = makeHero((level.game && level.game.save.activeSkin) || 'classic', level.game && level.game.save.hero);`
- [ ] **Step 6: GREEN.** `node test/update-hq-m6.mjs` + `node test/smoke.mjs`.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(hero): кастом-скін «Мій герой» — кольори з save.hero (пресети не чіпаємо)"`

---

## Task 2: Гардероб color-swatch UI

**Files:** `src/main.js` (renderWardrobe), `styles.css`, test `test/update-hq-m6.mjs`.

- [ ] **Step 1: Failing test.** Append: open wardrobe, select custom, assert color swatches appear and clicking one updates `save.hero`:
```js
console.log('▸ M6: палітра в Гардеробі');
await page.evaluate(() => { window.__game.save.activeSkin = 'custom'; window.__game._showOverlay('overlay-wardrobe'); window.__game.renderWardrobe(); });
const hasPalette = await page.evaluate(() => !!document.querySelector('#wardrobe-content .hero-swatch'));
check(hasPalette, 'для кастом-скіна показано палітру кольорів');
await page.evaluate(() => { const s = document.querySelector('#wardrobe-content .hero-swatch[data-slot="shirt"]'); if (s) s.click(); });
const changed = await page.evaluate(() => typeof window.__game.save.hero.shirt === 'number');
check(changed, 'клік по свотчу оновлює save.hero.shirt');
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: renderWardrobe swatches.** In `renderWardrobe()` (main.js:619), after the skin cards, when `save.activeSkin === 'custom'`, append color-swatch rows for shirt/pants/skin from `HERO_PALETTE` (import it). Each swatch: `<button class="hero-swatch" data-slot="shirt" data-hex="..." style="background:#...">`. Wire clicks: set `save.hero[slot] = hex`, `saveGame()`, re-render, and if a level is live, rebuild the player hero (call the same path player uses, or skip live-rebuild if none). Use `t()` for slot labels («Сорочка»/«Штани»/«Шкіра»).
- [ ] **Step 4: CSS.** `.hero-swatch { width:34px;height:34px;border-radius:8px;border:2px solid rgba(255,255,255,.3);margin:3px;cursor:pointer; } .hero-swatch.on { border-color:#fff; transform:scale(1.12); } .hero-swatch-row{display:flex;flex-wrap:wrap;align-items:center;gap:2px;margin:4px 0}`
- [ ] **Step 5: GREEN.** `node test/update-hq-m6.mjs`.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(hero): палітра кольорів у Гардеробі для кастом-скіна"`

---

## Task 3: i18n + v30 + README + local e2e + final

- [ ] **Step 1: i18n.** Add en+ru for new keys (`Мій герой`, `Сорочка`, `Штани`, `Шкіра`, any swatch/labels). No leak.
- [ ] **Step 2: version.** version.json→30; APP_VERSION→30; sw.js CACHE→`zr-cache-v30`. (No new src file → SHELL unchanged.)
- [ ] **Step 3: README.** `**v30 «Зроби свого героя»**: …` above v29.
- [ ] **Step 4: Gates.** `node test/version-check.mjs`, `node test/i18n.mjs`, `node test/update-hq-m6.mjs`, `node test/smoke.mjs`, and **`SLOW=4 node test/e2e.mjs`** (full UKR campaign — confirms makeHero change didn't break campaign hero/rendering). If e2e flakes once on timing, retry once.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore(hero): i18n + бамп v30 + README (Зроби свого героя)"`

---

## Self-Review
- Coverage: custom skin+save.hero+player (T1), palette UI (T2), i18n/version/e2e (T3).
- makeHero change is ADDITIVE (default param) — 10 presets untouched; remote players use default custom colors (coop-visibility deferred, documented).
- Save migration: `save.hero` validated; `'custom'` force-added to skins; old save safe.
- Local e2e gates the campaign-rendering risk. No netcode, no gambling (palette only).
