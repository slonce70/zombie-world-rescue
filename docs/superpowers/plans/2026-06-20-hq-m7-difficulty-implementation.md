# M7 «Світ у вогні» (optional difficulty stars) Implementation Plan

> Execute via `superpowers:subagent-driven-development`. Builds on M1-M4+M6 (v26-v30). Optional, opt-in star difficulty: identity at star 1 (campaign/e2e untouched). Mutators/elites and coop-sync deferred — SOLO MVP.

**Goal:** after freeing a country, a kid can replay it at higher «зірок складності» (★1-5): zombies (and the boss) get more HP/damage/numbers, and you earn bonus coins — endless challenge for kids who play a lot. Optional and off by default (★1), so younger kids and the campaign are unaffected.

**Architecture:** `save.diffStar` (1-5, default 1). `ZombieManager` multiplies its `this.diff` by a star factor that is IDENTITY at star 1 (so star 1 == current behavior exactly). The boss hp also scales by the star hp factor. `level.diffStar` is set at level start ONLY for a SOLO campaign replay of an already-liberated country (first clears, storm, arena, and ALL coop = star 1 — no desync). A ★ selector in the Штаб sets `save.diffStar`; a start toast + victory coin bonus when star>1. No HUD layout change (toast only).

## Global Constraints (verbatim)
- IDENTITY at star 1: at `diffStar===1` the star factor MUST be exactly 1 for hp/dmg/counts AND boss — campaign/e2e behavior unchanged.
- Опційно й безпечно: перший прохід незвільненої країни, Шторм, Арена, і БУДЬ-ЯКИЙ кооп → завжди star 1 (нуль розсинхрону; кооп-складність відкладено).
- Без мутаторів/елітів (відкладено). БЕЗ 3D. Без HUD-розкладки (тільки тост + Штаб).
- i18n: нові рядки через `t('…')` + en/ru (Task 3). Збереження: `save.diffStar` validated.
- Версія 3x: v30→v31.

## File Structure
- Modify `src/zombies.js`: star factor on `this.diff` (~line 50) + boss hp scale (~line 313).
- Modify `src/main.js`: `save.diffStar` in `_newSave`/`_loadSave`; set `level.diffStar` in `startLevel`/`_buildLevel` BEFORE zombies init; start toast; victory coin bonus.
- Modify `src/ui/hq.js`: ★ selector section.
- Modify `styles.css`, `src/i18n/en.js`, `ru.js`, `version.json`, `sw.js` CACHE, `README.md`.
- Test: `test/update-hq-m7.mjs`.

## Verification protocol
Server :8741. `node test/update-hq-m7.mjs` + `node test/smoke.mjs`. **Task 3 runs `SLOW=4 node test/e2e.mjs`** (default star 1 — campaign must be byte-identical in behavior) + `SLOW=4 node test/coop.mjs` (coop forced star 1 — no regression/desync).

---

## Task 1: `save.diffStar` + star multiplier (identity at 1) + boss scale + level wiring

**Files:** `src/zombies.js`, `src/main.js`, test `test/update-hq-m7.mjs`.

**Interfaces produced:** `save.diffStar` (int 1-5); `level.diffStar`; star-scaled `this.diff` + boss hp.

- [ ] **Step 1: Star factor in `ZombieManager`** (`src/zombies.js`, replace line 50). 
```js
    const _base = (level.country && level.country.difficulty) || { hp: 1, dmg: 1, counts: 1 };
    const _star = Math.max(1, Math.min(5, level.diffStar || 1));
    this.diffStar = _star;
    this.diff = _star > 1
      ? { hp: _base.hp * (1 + 0.6 * (_star - 1)), dmg: _base.dmg * (1 + 0.25 * (_star - 1)), counts: _base.counts * (1 + 0.2 * (_star - 1)) }
      : _base;
```
(At star 1 → `this.diff === _base`, identical to today.)
- [ ] **Step 2: Boss hp scale** (`src/zombies.js`, spawnBoss ~line 310-313). After `b.maxHp = bossHp;` multiply by the star hp factor (softer for boss to avoid a bullet-sponge): 
```js
    const _bs = this.diffStar > 1 ? (1 + 0.5 * (this.diffStar - 1)) : 1;
    b.maxHp = Math.round(bossHp * _bs); b.hp = b.maxHp;
```
(Verify the exact local var name for boss hp at that line; apply the multiplier to both maxHp and hp.)
- [ ] **Step 3: Failing test.** `test/update-hq-m7.mjs` (mirror update4 header). Drive star via `level.diffStar` + a fresh ZombieManager, OR via a test hook. Simplest real assertion — spawn a walker at star 1 vs star 3 and compare maxHp:
```js
console.log('▸ M7: Світ у вогні (зірки складності)');
await loadCountry('UKR');
const hpAt = (star) => page.evaluate((s) => {
  const g = window.__game; g.level.diffStar = s;
  // rebuild zombie manager diff from new star (re-instantiate or recompute)
  const Z = g.level.zombies.constructor;
  const zm = new Z(g.level, 12345);
  const p = g.level.player.pos; const z = zm.spawn('walker', p.x + 6, p.z);
  const hp = z.maxHp; z.rig && g.level.scene.remove(z.rig.group);
  return hp;
}, star);
const hp1 = await hpAt(1); const hp3 = await hpAt(3);
check(hp3 > hp1 * 1.5, `★3 робить зомбі міцнішими (${hp1} → ${hp3})`);
check((await page.evaluate(() => window.__game.save.diffStar)) === 1, 'дефолтна складність — ★1');
// star 1 identical to base difficulty
check(hp1 === Math.round(20 * 1), `★1 = базова HP (walker ${hp1})`); // adjust to walker base hp from TYPE_STATS
```
(The implementer should read `TYPE_STATS.walker.hp` and assert the exact star-1 value; the key checks are: ★3 > ★1×1.5, and default save.diffStar===1.)
- [ ] **Step 4: RED.** `node test/update-hq-m7.mjs`.
- [ ] **Step 5: save.diffStar + level wiring.** In `_newSave()`: `diffStar: 1,`. In `_loadSave()`: `if (typeof out.diffStar !== 'number' || !(out.diffStar >= 1 && out.diffStar <= 5)) out.diffStar = 1;`. In `startLevel(countryId, opts)` / where the `level` object is built, set BEFORE the ZombieManager is created:
```js
    const soloReplay = !opts.storm && !opts.arena && !(this.coop && this.coop.session && this.coop.session.state !== 'idle') && !!(this.save.liberated && this.save.liberated[countryId]);
    level.diffStar = soloReplay ? (this.save.diffStar || 1) : 1;
```
(Confirm the exact level-build order so `level.diffStar` is set before `new ZombieManager(level, ...)`. If zombies are created inside `_buildLevel`, set `level.diffStar` at the top of that function.)
- [ ] **Step 6: GREEN.** `node test/update-hq-m7.mjs` + `node test/smoke.mjs`.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(diff): зірки складності — множник на this.diff (ідентичний на ★1) + бос; соло-реплей"`

---

## Task 2: Штаб ★ selector + start toast + victory coin bonus

**Files:** `src/ui/hq.js`, `src/main.js`, `styles.css`, test `test/update-hq-m7.mjs`.

- [ ] **Step 1: Failing test.** Append: render Штаб, assert a ★ selector with 5 options; clicking ★4 sets `save.diffStar=4`:
```js
console.log('▸ M7: ★ селектор у Штабі');
await page.evaluate(() => { window.__game.save.diffStar = 1; window.__game.hq.render(); });
const stars = await page.evaluate(() => document.querySelectorAll('#hq-content .hq-star').length);
check(stars === 5, `у Штабі 5 кнопок зірок (${stars})`);
await page.evaluate(() => { const b = document.querySelector('#hq-content .hq-star[data-star="4"]'); if (b) b.click(); });
check((await page.evaluate(() => window.__game.save.diffStar)) === 4, 'клік ★4 ставить save.diffStar=4');
```
- [ ] **Step 2: RED.**
- [ ] **Step 3: `_difficultyHtml` in `src/ui/hq.js`.** Add a section (e.g. after `_goalHtml`) with title `t('⭐ Складність (для перепроходження)')` and 5 buttons `.hq-star[data-star="N"]` highlighting the current `save.diffStar`; a short note `t('Вище зірка — міцніші вороги й більше монет. Перший прохід і кооп — завжди ★1.')`. Wire clicks (in hq render or a handler) → `save.diffStar = N`, `saveGame()`, re-render. (Mirror how other hq sections wire clicks; if hq has no click-wiring yet, add a small one scoped to `.hq-star`.)
- [ ] **Step 4: Start toast + victory bonus (`src/main.js`).** When a level starts with `level.diffStar > 1`, `hud.toast(t('⭐ Складність {n} — вороги міцніші, монет більше!', { n: level.diffStar }))`. At country-clear victory reward, when `level.diffStar > 1` add bonus coins (e.g. `bonus = Math.round(baseReward * 0.25 * (level.diffStar - 1))`) and toast it. (Find the victory coin-award site; keep star-1 reward unchanged.)
- [ ] **Step 5: CSS.** `.hq-star{font-size:22px;background:rgba(255,255,255,.08);border:none;border-radius:8px;padding:4px 8px;margin:2px;cursor:pointer;opacity:.5}.hq-star.on{opacity:1;background:#f5c542}`
- [ ] **Step 6: GREEN.** `node test/update-hq-m7.mjs`.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(diff): ★ селектор у Штабі + тост старту + бонус монет за складність"`

---

## Task 3: i18n + v31 + README + local e2e/coop + final

- [ ] **Step 1: i18n.** en+ru for all new keys (selector title/note, start toast, victory bonus, etc.). No leak.
- [ ] **Step 2: version.** version.json→31; APP_VERSION→31; sw.js CACHE→`zr-cache-v31`.
- [ ] **Step 3: README.** `**v31 «Світ у вогні»**: …` above v30.
- [ ] **Step 4: Gates.** `node test/version-check.mjs`, `node test/i18n.mjs`, `node test/update-hq-m7.mjs`, `node test/smoke.mjs`, **`SLOW=4 node test/e2e.mjs`** (star 1 → campaign unchanged), **`SLOW=4 node test/coop.mjs`** (coop forced star 1 → no regression). Retry a flaky timing failure once; a real assertion failure → STOP and report.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore(diff): i18n + бамп v31 + README (Світ у вогні)"`

---

## Self-Review
- Coverage: star multiplier+boss+wiring (T1), Штаб selector+toast+bonus (T2), i18n/version/e2e/coop (T3).
- IDENTITY at star 1 (this.diff === base) → campaign & e2e untouched; coop forced star 1 → no desync (verified by coop gate).
- Save: diffStar validated 1-5. No mutators/elites (deferred). No HUD layout change (toast only). No netcode change.
