# Mega Quest Season Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Season 1 of persistent mega-quests: six long-term goals with clear rewards, progress tracking, cloud-save safety, and a small quest-panel upgrade.

**Architecture:** Reuse the existing `DailyQuests`/`megaQuests` system instead of creating a new progression framework. Convert the current hardcoded mega reward into a small reward object handler, add five more quest definitions, and route one new `country` progress event from campaign victory. Keep UI rendering inside the existing quests panel.

**Tech Stack:** Vanilla JavaScript modules, Three.js game runtime, Playwright browser tests, static HTTP server via `npm run serve`.

---

## Scope

This plan implements the first complete “Season of Mega-Quests” release. It does not add a separate battle pass, timers, paid rewards, online season rotation, or a new database schema. The season is permanent and local/cloud-saved through the existing save object.

Season 1 quest list:

- `damage10000`: deal 10000 real damage. Reward: heal hypercharge, 10 crystals, 250 XP.
- `kills500`: defeat 500 zombies. Reward: shield hypercharge, 8 crystals, 250 XP.
- `headshots150`: land 150 headshots. Reward: stun ammo hypercharge, 10 crystals, 300 XP.
- `bosses10`: defeat 10 country bosses. Reward: turret hypercharge, 15 crystals, 400 XP.
- `megabox10`: open 10 Megaboxes. Reward: gold apple hypercharge, 12 crystals, 350 XP.
- `countries8`: liberate 8 countries. Reward: clone hypercharge, 20 crystals, 500 XP.

Rewards unlock hypercharges even if the base gadget is not owned yet. This matches the current `heal` hypercharge behavior: the hypercharge is stored in `save.gadgetHypers` and becomes useful when the gadget is later owned.

## File Structure

- Modify `src/progress.js`: own mega-quest definitions, reward labels, generic mega reward application, and progress sanitization.
- Modify `src/main.js`: render a compact mega-quest section, expose mega quest state in test API, and emit `country` events when a country is liberated.
- Modify `src/i18n/en.js`: add English translations for new quest titles and reward messages.
- Modify `src/i18n/ru.js`: add Russian translations for new quest titles and reward messages.
- Modify `src/net/cloudsave.js`: no production change expected unless tests reveal a missing progress gate; existing `megaQuests` gate should already cover new ids.
- Modify `test/mega-quest.mjs`: keep current damage quest regression green after reward refactor.
- Create `test/mega-season.mjs`: focused tests for Season 1 definitions, rewards, progress, pending count, and country event.
- Modify `test/cloudsave.mjs`: broaden `megaQuest` coverage from one id to a Season 1 id.
- Modify `README.md`, `version.json`, `src/main.js`, `sw.js`: release note and version bump after all tests pass.

## Implementation Tasks

### Task 1: Generic Mega-Quest Rewards

**Files:**
- Modify: `src/progress.js`
- Test: `test/mega-quest.mjs`

- [ ] **Step 1: Write the failing test expectation for generic reward shape**

In `test/mega-quest.mjs`, update the existing reward check to keep the same user-facing result while allowing the production code to stop hardcoding `heal`.

Replace:

```js
check(res.done.crystals === 10 && res.done.xp === 250 && res.done.hypers.includes('heal'),
  'нагорода: heal hypercharge, 10 кристалів, 250 XP', JSON.stringify(res.done));
```

with:

```js
check(res.done.crystals === 10 && res.done.xp === 250 && res.done.hypers.includes('heal'),
  'нагорода damage10000: heal hypercharge, 10 кристалів, 250 XP', JSON.stringify(res.done));
```

- [ ] **Step 2: Run the focused test to verify current behavior still passes before refactor**

Run this in Terminal A and leave it running:

```bash
npm run serve
```

Run this in Terminal B:

```bash
node test/mega-quest.mjs
```

Expected: PASS. This is a characterization check before refactoring the reward implementation.

- [ ] **Step 3: Replace the current single-quest definition with reward objects**

In `src/progress.js`, replace the current `MEGA_QUESTS` block with this:

```js
const MEGA_QUESTS = [
  {
    id: 'damage10000', icon: '⚡', ev: 'damage', target: 10000,
    title: () => t('МЕГА: нанеси {n} шкоди', { n: 10000 }),
    reward: {
      hypers: ['heal'],
      crystals: 10,
      xp: 250,
      label: () => t('⚡ Гіперзаряд Відновлення · 💎 10 · ⭐ 250 XP'),
    },
  },
];
```

- [ ] **Step 4: Update `megaList` to expose reward labels**

In `src/progress.js`, replace the current `megaList` getter with:

```js
  get megaList() {
    this.ensureMegaQuests();
    return MEGA_QUESTS.map((def) => {
      const q = this.game.save.megaQuests[def.id];
      return {
        ...def,
        title: def.title(),
        rewardText: def.reward.label(),
        progress: q.progress,
        done: q.done,
      };
    });
  }
```

- [ ] **Step 5: Update quest-panel rendering for `rewardText`**

In `src/main.js`, inside `renderQuestsPanel()`, replace:

```js
        <div class="quest-reward">${q.reward || t('🪙 120 монет · ⭐ 40 XP')}</div>
```

with:

```js
        <div class="quest-reward">${q.rewardText || t('🪙 120 монет · ⭐ 40 XP')}</div>
```

- [ ] **Step 6: Add generic reward helpers**

In `src/progress.js`, replace `_rewardMega(q)` with:

```js
  _rewardMega(q) {
    const game = this.game;
    const reward = q.reward || {};
    if (!Array.isArray(game.save.gadgetHypers)) game.save.gadgetHypers = [];
    for (const id of reward.hypers || []) {
      if (!game.save.gadgetHypers.includes(id)) game.save.gadgetHypers.push(id);
    }
    game.save.crystals = (game.save.crystals || 0) + (reward.crystals || 0);
    game.audio.questDone();
    game.hud.toast(t('⚡ Мега-квест виконано: {q}! {r}', { q: q.title, r: q.rewardText }));
    game.hud.banner(t('⚡ МЕГА-КВЕСТ!'), q.rewardText, 4.4);
    game.progress.addXp(reward.xp || 0);
  }
```

- [ ] **Step 7: Run the focused test**

Run:

```bash
node test/mega-quest.mjs
```

Expected: PASS, including:

```text
нагорода damage10000: heal hypercharge, 10 кристалів, 250 XP
overkill рахує тільки реальні HP, не сирі 99999 шкоди
```

- [ ] **Step 8: Commit**

```bash
git add src/progress.js src/main.js test/mega-quest.mjs
git commit -m "Refactor mega quest rewards"
```

### Task 2: Season 1 Quest Definitions

**Files:**
- Modify: `src/progress.js`
- Create: `test/mega-season.mjs`

- [ ] **Step 1: Write the failing Season 1 metadata test**

Create `test/mega-season.mjs` with:

```js
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
let failed = 0;
const errors = [];
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=UKR`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ Сезон мега-квестів');
const meta = await page.evaluate(() => {
  const g = window.__game;
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests();
  return {
    ids: g.quests.megaList.map((q) => q.id),
    targets: Object.fromEntries(g.quests.megaList.map((q) => [q.id, q.target])),
    rewards: Object.fromEntries(g.quests.megaList.map((q) => [q.id, q.rewardText])),
    pending: g.quests.pendingCount,
    dailyCount: g.quests.list.length,
  };
});

const expectedIds = ['damage10000', 'kills500', 'headshots150', 'bosses10', 'megabox10', 'countries8'];
check(expectedIds.every((id) => meta.ids.includes(id)) && meta.ids.length === expectedIds.length,
  'є 6 мега-квестів сезону', JSON.stringify(meta.ids));
check(meta.targets.damage10000 === 10000 && meta.targets.kills500 === 500 && meta.targets.headshots150 === 150,
  'цілі шкоди, перемог і хедшотів правильні', JSON.stringify(meta.targets));
check(meta.targets.bosses10 === 10 && meta.targets.megabox10 === 10 && meta.targets.countries8 === 8,
  'цілі босів, мегабоксів і країн правильні', JSON.stringify(meta.targets));
check(meta.rewards.kills500.includes('Щит') && meta.rewards.countries8.includes('Клон'),
  'нагороди показують конкретні гіперзаряди', JSON.stringify(meta.rewards));
check(meta.pending >= meta.dailyCount + 6,
  'бейдж квестів рахує щоденні і мега-квести', JSON.stringify({ pending: meta.pending, dailyCount: meta.dailyCount }));

if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 СЕЗОН МЕГА-КВЕСТІВ: МЕТА ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the metadata test to verify it fails**

Run:

```bash
node test/mega-season.mjs
```

Expected: FAIL because only `damage10000` exists.

- [ ] **Step 3: Add Season 1 definitions**

In `src/progress.js`, replace the `MEGA_QUESTS` array from Task 1 with:

```js
const MEGA_QUESTS = [
  {
    id: 'damage10000', icon: '⚡', ev: 'damage', target: 10000,
    title: () => t('МЕГА: нанеси {n} шкоди', { n: 10000 }),
    reward: {
      hypers: ['heal'],
      crystals: 10,
      xp: 250,
      label: () => t('⚡ Гіперзаряд Відновлення · 💎 10 · ⭐ 250 XP'),
    },
  },
  {
    id: 'kills500', icon: '🧟', ev: 'kill', target: 500,
    title: () => t('МЕГА: переможи {n} зомбі', { n: 500 }),
    reward: {
      hypers: ['shield'],
      crystals: 8,
      xp: 250,
      label: () => t('🛡️ Гіперзаряд Щита · 💎 8 · ⭐ 250 XP'),
    },
  },
  {
    id: 'headshots150', icon: '🎯', ev: 'headshot', target: 150,
    title: () => t('МЕГА: влучи в голову {n} разів', { n: 150 }),
    reward: {
      hypers: ['stunammo'],
      crystals: 10,
      xp: 300,
      label: () => t('💫 Гіперзаряд Оглушливих куль · 💎 10 · ⭐ 300 XP'),
    },
  },
  {
    id: 'bosses10', icon: '👑', ev: 'boss', target: 10,
    title: () => t('МЕГА: переможи {n} босів', { n: 10 }),
    reward: {
      hypers: ['turret'],
      crystals: 15,
      xp: 400,
      label: () => t('🤖 Гіперзаряд Турелі · 💎 15 · ⭐ 400 XP'),
    },
  },
  {
    id: 'megabox10', icon: '🎁', ev: 'megabox', target: 10,
    title: () => t('МЕГА: відкрий {n} мегабоксів', { n: 10 }),
    reward: {
      hypers: ['goldapple'],
      crystals: 12,
      xp: 350,
      label: () => t('🍏 Гіперзаряд Золотого яблука · 💎 12 · ⭐ 350 XP'),
    },
  },
  {
    id: 'countries8', icon: '🌍', ev: 'country', target: 8,
    title: () => t('МЕГА: звільни {n} країн', { n: 8 }),
    reward: {
      hypers: ['clone'],
      crystals: 20,
      xp: 500,
      label: () => t('👥 Гіперзаряд Клона · 💎 20 · ⭐ 500 XP'),
    },
  },
];
```

- [ ] **Step 4: Run metadata test to verify it passes**

Run:

```bash
node test/mega-season.mjs
```

Expected: PASS with `СЕЗОН МЕГА-КВЕСТІВ: МЕТА ПРОЙДЕНА`.

- [ ] **Step 5: Run existing damage quest regression**

Run:

```bash
node test/mega-quest.mjs
```

Expected: PASS. This confirms existing `damage10000` behavior survived the season expansion.

- [ ] **Step 6: Commit**

```bash
git add src/progress.js test/mega-season.mjs
git commit -m "Add mega quest season definitions"
```

### Task 3: Season Progress and Rewards Behavior

**Files:**
- Modify: `test/mega-season.mjs`
- Modify: `src/main.js`
- Modify: `src/progress.js`

- [ ] **Step 1: Add failing behavior tests for kill, boss, megabox, and country rewards**

Append this block to `test/mega-season.mjs` before the final error reporting block:

```js
const rewards = await page.evaluate(() => {
  const g = window.__game;
  g.save.xp = 0;
  g.save.crystals = 0;
  g.save.gadgetHypers = [];
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests();

  const drive = (ev, n) => g.test.questEvent(ev, { n });
  drive('kill', 499);
  const beforeKillDone = {
    q: { ...g.save.megaQuests.kills500 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };
  drive('kill', 1);
  const afterKillDone = {
    q: { ...g.save.megaQuests.kills500 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('boss', 10);
  const afterBosses = {
    q: { ...g.save.megaQuests.bosses10 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('megabox', 10);
  const afterMegaboxes = {
    q: { ...g.save.megaQuests.megabox10 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('country', 8);
  const afterCountries = {
    q: { ...g.save.megaQuests.countries8 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  drive('country', 8);
  const afterDuplicateCountry = {
    q: { ...g.save.megaQuests.countries8 },
    hypers: [...g.save.gadgetHypers],
    crystals: g.save.crystals,
    xp: g.save.xp,
  };

  return { beforeKillDone, afterKillDone, afterBosses, afterMegaboxes, afterCountries, afterDuplicateCountry };
});

check(rewards.beforeKillDone.q.progress === 499 && !rewards.beforeKillDone.q.done
  && rewards.beforeKillDone.crystals === 0 && rewards.beforeKillDone.xp === 0,
  'kills500 не видає нагороду на 499/500', JSON.stringify(rewards.beforeKillDone));
check(rewards.afterKillDone.q.done && rewards.afterKillDone.hypers.includes('shield')
  && rewards.afterKillDone.crystals === 8 && rewards.afterKillDone.xp === 250,
  'kills500 видає shield hyper, 8 crystals, 250 XP', JSON.stringify(rewards.afterKillDone));
check(rewards.afterBosses.q.done && rewards.afterBosses.hypers.includes('turret')
  && rewards.afterBosses.crystals === 23 && rewards.afterBosses.xp === 650,
  'bosses10 додає turret hyper, 15 crystals, 400 XP', JSON.stringify(rewards.afterBosses));
check(rewards.afterMegaboxes.q.done && rewards.afterMegaboxes.hypers.includes('goldapple')
  && rewards.afterMegaboxes.crystals === 35 && rewards.afterMegaboxes.xp === 1000,
  'megabox10 додає goldapple hyper, 12 crystals, 350 XP', JSON.stringify(rewards.afterMegaboxes));
check(rewards.afterCountries.q.done && rewards.afterCountries.hypers.includes('clone')
  && rewards.afterCountries.crystals === 55 && rewards.afterCountries.xp === 1500,
  'countries8 додає clone hyper, 20 crystals, 500 XP', JSON.stringify(rewards.afterCountries));
check(rewards.afterDuplicateCountry.crystals === 55 && rewards.afterDuplicateCountry.xp === 1500
  && rewards.afterDuplicateCountry.hypers.filter((x) => x === 'clone').length === 1,
  'countries8 не дублює нагороду після done', JSON.stringify(rewards.afterDuplicateCountry));
```

- [ ] **Step 2: Run behavior test**

Run:

```bash
node test/mega-season.mjs
```

Expected: PASS for `kill`, `boss`, `megabox`, and direct `country` event if Task 2 is complete.

- [ ] **Step 3: Add a failing test for real campaign country hook**

Append this block to `test/mega-season.mjs` before the final error reporting block:

```js
const countryHook = await page.evaluate(() => {
  const g = window.__game;
  g.save.megaQuests = null;
  g.quests.ensureMegaQuests();
  g.save.megaQuests.countries8.progress = 7;
  g.save.megaQuests.countries8.done = false;
  g.save.crystals = 0;
  g.save.xp = 0;
  g.save.gadgetHypers = [];
  g.level.country = { ...g.level.country, id: 'UKR', name: 'Україна', coinReward: 0 };
  g._onVictory();
  return {
    q: { ...g.save.megaQuests.countries8 },
    crystals: g.save.crystals,
    xp: g.save.xp,
    hypers: [...g.save.gadgetHypers],
  };
});
check(countryHook.q.done && countryHook.q.progress === 8 && countryHook.crystals === 20
  && countryHook.xp >= 500 && countryHook.hypers.includes('clone'),
  '_onVictory просуває country мега-квест', JSON.stringify(countryHook));
```

Run:

```bash
node test/mega-season.mjs
```

Expected: FAIL because `_onVictory()` does not yet call `this.quests.onEvent('country')`.

- [ ] **Step 4: Emit country event on campaign victory**

In `src/main.js`, inside `_onVictory()` near the existing country XP grant, find:

```js
    this.progress.addXp(XP_VALUES.country);
```

Replace it with:

```js
    this.progress.addXp(XP_VALUES.country);
    this.quests.onEvent('country');
```

- [ ] **Step 5: Run behavior test again**

Run:

```bash
node test/mega-season.mjs
```

Expected: PASS, including `_onVictory просуває country мега-квест`.

- [ ] **Step 6: Run campaign smoke around victory**

Run:

```bash
node test/campaign.mjs
```

Expected: PASS. If this test is slow but passing, keep it; country liberation is exactly what this task touched.

- [ ] **Step 7: Commit**

```bash
git add src/main.js test/mega-season.mjs
git commit -m "Track country mega quest progress"
```

### Task 4: Quest Panel Season Grouping

**Files:**
- Modify: `src/main.js`
- Modify: `styles.css`
- Modify: `test/mega-season.mjs`

- [ ] **Step 1: Add failing UI assertions**

Append this block to `test/mega-season.mjs` before final error reporting:

```js
const ui = await page.evaluate(() => {
  const g = window.__game;
  g.renderQuestsPanel();
  return {
    text: document.getElementById('quest-list').textContent,
    megaRows: document.querySelectorAll('#quest-list .quest-row.mega').length,
    headers: [...document.querySelectorAll('#quest-list .quest-section-title')].map((x) => x.textContent),
  };
});
check(ui.headers.some((x) => x.includes('Мега-квести')),
  'у панелі є секція Мега-квести', JSON.stringify(ui.headers));
check(ui.headers.some((x) => x.includes('Щоденні')),
  'у панелі є секція Щоденні', JSON.stringify(ui.headers));
check(ui.megaRows === 6,
  'усі 6 мега-квестів мають окремий mega row клас', JSON.stringify({ megaRows: ui.megaRows }));
check(ui.text.indexOf('Мега-квести') < ui.text.indexOf('Щоденні'),
  'мега-квести показані перед щоденними', ui.text);
```

Run:

```bash
node test/mega-season.mjs
```

Expected: FAIL because the panel currently has no section headers and no `mega` row class.

- [ ] **Step 2: Update quest-panel HTML**

In `src/main.js`, replace `renderQuestsPanel()` with:

```js
  renderQuestsPanel() {
    this.quests.ensureToday();
    this.quests.ensureMegaQuests();
    let html = `<div class="quest-section-title">${t('Мега-квести')}</div>`;
    for (const q of this.quests.megaList) {
      const pct = Math.round((q.progress / q.target) * 100);
      html += `<div class="quest-row mega ${q.done ? 'done' : ''}">
        <div class="quest-title">${q.icon} ${q.title} ${q.done ? '✅' : ''}</div>
        <div class="quest-reward">${q.rewardText}</div>
        <div class="quest-bar"><div style="width:${pct}%"></div></div>
        <div class="quest-prog">${q.progress} / ${q.target}</div>
      </div>`;
    }
    html += `<div class="quest-section-title">${t('Щоденні')}</div>`;
    for (const q of this.quests.list) {
      const pct = Math.round((q.progress / q.target) * 100);
      html += `<div class="quest-row ${q.done ? 'done' : ''}">
        <div class="quest-title">${q.icon} ${q.title} ${q.done ? '✅' : ''}</div>
        <div class="quest-reward">${t('🪙 120 монет · ⭐ 40 XP')}</div>
        <div class="quest-bar"><div style="width:${pct}%"></div></div>
        <div class="quest-prog">${q.progress} / ${q.target}</div>
      </div>`;
    }
    document.getElementById('quest-list').innerHTML = html;
  }
```

- [ ] **Step 3: Add minimal styles**

In `styles.css`, after the existing `.quest-prog` rule, add:

```css
.quest-section-title {
  color: #ffffff;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0;
  margin: 6px 2px 0;
  opacity: .92;
}
.quest-row.mega {
  border-color: rgba(255, 210, 82, .45);
  background: rgba(255, 210, 82, .08);
}
.quest-row.mega .quest-bar div {
  background: linear-gradient(90deg, #ffd252, #ff8f3d);
}
```

- [ ] **Step 4: Add i18n keys for section headers**

In `src/i18n/en.js`, add:

```js
"Мега-квести": "Mega Quests",
"Щоденні": "Daily",
```

In `src/i18n/ru.js`, add:

```js
"Мега-квести": "Мега-квесты",
"Щоденні": "Ежедневные",
```

- [ ] **Step 5: Run UI test and localization test**

Run:

```bash
node test/mega-season.mjs
node test/i18n.mjs
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main.js styles.css src/i18n/en.js src/i18n/ru.js test/mega-season.mjs
git commit -m "Group mega quests in quest panel"
```

### Task 5: Localization for Season Quest Text

**Files:**
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Test: `test/i18n.mjs`
- Test: `test/mega-season.mjs`

- [ ] **Step 1: Add all English quest and reward keys**

In `src/i18n/en.js`, add these entries near the existing quest translations:

```js
"МЕГА: переможи {n} зомбі": "MEGA: defeat {n} zombies",
"МЕГА: влучи в голову {n} разів": "MEGA: land {n} headshots",
"МЕГА: переможи {n} босів": "MEGA: defeat {n} bosses",
"МЕГА: відкрий {n} мегабоксів": "MEGA: open {n} Megaboxes",
"МЕГА: звільни {n} країн": "MEGA: liberate {n} countries",
"🛡️ Гіперзаряд Щита · 💎 8 · ⭐ 250 XP": "🛡️ Shield Hypercharge · 💎 8 · ⭐ 250 XP",
"💫 Гіперзаряд Оглушливих куль · 💎 10 · ⭐ 300 XP": "💫 Stun Bullets Hypercharge · 💎 10 · ⭐ 300 XP",
"🤖 Гіперзаряд Турелі · 💎 15 · ⭐ 400 XP": "🤖 Turret Hypercharge · 💎 15 · ⭐ 400 XP",
"🍏 Гіперзаряд Золотого яблука · 💎 12 · ⭐ 350 XP": "🍏 Golden Apple Hypercharge · 💎 12 · ⭐ 350 XP",
"👥 Гіперзаряд Клона · 💎 20 · ⭐ 500 XP": "👥 Clone Hypercharge · 💎 20 · ⭐ 500 XP",
"⚡ Мега-квест виконано: {q}! {r}": "⚡ Mega quest complete: {q}! {r}",
```

- [ ] **Step 2: Add all Russian quest and reward keys**

In `src/i18n/ru.js`, add these entries near the existing quest translations:

```js
"МЕГА: переможи {n} зомбі": "МЕГА: победи {n} зомби",
"МЕГА: влучи в голову {n} разів": "МЕГА: попади в голову {n} раз",
"МЕГА: переможи {n} босів": "МЕГА: победи {n} боссов",
"МЕГА: відкрий {n} мегабоксів": "МЕГА: открой {n} мегабоксов",
"МЕГА: звільни {n} країн": "МЕГА: освободи {n} стран",
"🛡️ Гіперзаряд Щита · 💎 8 · ⭐ 250 XP": "🛡️ Гиперзаряд Щита · 💎 8 · ⭐ 250 XP",
"💫 Гіперзаряд Оглушливих куль · 💎 10 · ⭐ 300 XP": "💫 Гиперзаряд Оглушающих пуль · 💎 10 · ⭐ 300 XP",
"🤖 Гіперзаряд Турелі · 💎 15 · ⭐ 400 XP": "🤖 Гиперзаряд Турели · 💎 15 · ⭐ 400 XP",
"🍏 Гіперзаряд Золотого яблука · 💎 12 · ⭐ 350 XP": "🍏 Гиперзаряд Золотого яблока · 💎 12 · ⭐ 350 XP",
"👥 Гіперзаряд Клона · 💎 20 · ⭐ 500 XP": "👥 Гиперзаряд Клона · 💎 20 · ⭐ 500 XP",
"⚡ Мега-квест виконано: {q}! {r}": "⚡ Мега-квест выполнен: {q}! {r}",
```

- [ ] **Step 3: Add a small language smoke to `test/mega-season.mjs`**

Append this block before final error reporting:

```js
await page.evaluate(() => localStorage.setItem('zr-lang', 'en'));
await page.reload({ waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });
const enMegaText = await page.evaluate(() => {
  window.__game.renderQuestsPanel();
  return document.getElementById('quest-list')?.textContent || '';
});
check(enMegaText.includes('Mega') || enMegaText.includes('MEGA:'),
  'мега-квести можуть відрендеритись англійською', enMegaText.slice(0, 160));
```

Then keep the real translation coverage in `test/i18n.mjs`; do not overbuild a second localization suite.

- [ ] **Step 4: Run tests**

Run:

```bash
node test/i18n.mjs
node test/mega-season.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.js src/i18n/ru.js test/mega-season.mjs
git commit -m "Localize mega quest season"
```

### Task 6: Cloud Save and Debug State Coverage

**Files:**
- Modify: `src/main.js`
- Modify: `test/cloudsave.mjs`
- Modify: `test/mega-season.mjs`

- [ ] **Step 1: Add mega quests to debug state**

In `src/main.js`, inside `test.state()`, after the existing `quests` field:

```js
        quests: g.quests.list.map((q) => ({ id: q.id, ev: q.ev, progress: q.progress, target: q.target, done: q.done })),
        megaQuests: g.quests.megaList.map((q) => ({ id: q.id, ev: q.ev, progress: q.progress, target: q.target, done: q.done })),
```

This replaces the single existing `quests` line with the two-line block above.

- [ ] **Step 2: Add failing debug-state assertion**

Append this block to `test/mega-season.mjs` before final error reporting:

```js
const stateShape = await page.evaluate(() => window.__game.test.state().megaQuests);
check(Array.isArray(stateShape) && stateShape.length === 6 && stateShape.some((q) => q.id === 'countries8'),
  'debug state містить megaQuests для тестів і майбутнього QA', JSON.stringify(stateShape));
```

Run:

```bash
node test/mega-season.mjs
```

Expected: PASS if Step 1 is done; FAIL if `megaQuests` was not exposed.

- [ ] **Step 3: Broaden cloud save test to a Season 1 id**

In `test/cloudsave.mjs`, replace:

```js
    out.megaQuest = saveHasProgress({ ...fresh, megaQuests: { damage10000: { progress: 1, done: false } } }) === true;
```

with:

```js
    out.megaQuest = saveHasProgress({ ...fresh, megaQuests: { countries8: { progress: 1, done: false } } }) === true;
```

- [ ] **Step 4: Run tests**

Run:

```bash
node test/mega-season.mjs
node test/cloudsave.mjs
```

Expected: PASS. `cloudsave` must still print `мега-квест → прогрес=true`.

- [ ] **Step 5: Commit**

```bash
git add src/main.js test/mega-season.mjs test/cloudsave.mjs
git commit -m "Cover mega quest save state"
```

### Task 7: Release Notes and Version Bump

**Files:**
- Modify: `README.md`
- Modify: `version.json`
- Modify: `src/main.js`
- Modify: `sw.js`

- [ ] **Step 1: Update README release note**

At the top of the changelog in `README.md`, above `v150`, add:

```markdown
**v151 «Сезон Мега-квестів»**: додано 6 постійних мега-квестів сезону: шкода, перемоги, хедшоти, боси, мегабокси й звільнені країни. Нагороди — гіперзаряди гаджетів, кристали та XP Зоряного шляху.
```

- [ ] **Step 2: Bump `version.json`**

Replace the full contents of `version.json` with:

```json
{ "v": 151 }
```

- [ ] **Step 3: Bump `APP_VERSION`**

In `src/main.js`, replace:

```js
const APP_VERSION = 150;
```

with:

```js
const APP_VERSION = 151;
```

- [ ] **Step 4: Bump service worker cache**

In `sw.js`, replace:

```js
const CACHE = 'zr-cache-v150';
```

with:

```js
const CACHE = 'zr-cache-v151';
```

- [ ] **Step 5: Run version sync**

Run:

```bash
node test/version-sync.mjs
```

Expected: PASS with `version.json.v=151`, `APP_VERSION=151`, and `SW_CACHE_V=151`.

- [ ] **Step 6: Commit**

```bash
git add README.md version.json src/main.js sw.js
git commit -m "Release mega quest season"
```

### Task 8: Final Verification and Integration

**Files:**
- No code changes expected.
- Verify all files touched by Tasks 1-7.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node test/mega-season.mjs
node test/mega-quest.mjs
node test/cloudsave.mjs
node test/i18n.mjs
node test/version-sync.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run combat and smoke regressions**

Run:

```bash
node test/update5.mjs
node test/coop-damage.mjs
npm test
git diff --check
```

Expected: all PASS, no whitespace errors.

- [ ] **Step 3: Inspect git state**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: clean working tree on the feature branch, with commits from Tasks 1-7 in order.

- [ ] **Step 4: Merge to main and push**

Run:

```bash
git switch main
git pull --ff-only origin main
git merge --ff-only codex/mega-quest-season
git push origin main
```

Expected: `main -> main` push succeeds.

- [ ] **Step 5: Stop local server**

Run:

```bash
lsof -iTCP:8741 -sTCP:LISTEN -n -P
```

If a local `python3 -m http.server 8741` from this work is still running, stop that PID:

```bash
pid=$(lsof -tiTCP:8741 -sTCP:LISTEN -n -P)
[ -z "$pid" ] || kill $pid
```

Run the `lsof` command again.

Expected: no process is listening on `8741`.

## Self-Review Checklist

- Spec coverage: The plan covers Season 1 definitions, generic rewards, UI grouping, country progress, localization, cloud-save/debug coverage, release notes, version sync, and final push.
- Placeholder scan: No unfinished markers, no unspecified “add tests,” and no vague copy-paste shortcuts. Each code step includes exact code or exact command.
- Type consistency: The plan consistently uses `rewardText`, `reward.hypers`, `reward.crystals`, `reward.xp`, `megaQuests`, `megaList`, and `pendingCount`.
- YAGNI check: The plan intentionally avoids online seasons, reset timers, paid tracks, new storage backends, or a new quest framework.
