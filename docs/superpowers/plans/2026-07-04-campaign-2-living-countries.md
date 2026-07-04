# Campaign 2.0: Living Countries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the first three campaign countries into short story episodes with NPC guidance, country-specific objectives, replay Night Raid, and safe fallback for unconverted countries and co-op.

**Architecture:** Add a focused `src/story/` layer that implements the same runtime contract as `DynamicMissions`: `update()`, `getHudList()`, `getMarkers()`, `get(id)`, `prompt`, `civilians`, `bossUnlocked`, and `bossStarted`. `src/main.js` selects `StoryMissions` only for solo campaign runs in Ukraine, Poland, and Egypt; all other modes keep the existing `DynamicMissions` path. Story definitions are declarative, while `StoryMissions` owns runtime state, NPC prompts, objective completion, rewards, horde triggers, and boss unlock.

**Tech Stack:** Browser JavaScript modules, Three.js scene objects through existing helpers, Playwright browser tests, Node module tests, existing version/PWA release checks.

---

## File Structure

- Create `src/story/countryStories.js`: country story definitions, objective IDs, NPC copy, replay modifier metadata, and selector helpers.
- Create `src/story/npcs.js`: small NPC spawn helpers using existing `makeCivilian()`, `updateRig()`, and `setAnim()`.
- Create `src/story/storymissions.js`: runtime engine for story objectives, prompts, markers, waves, rewards, boss unlock, replay Night Raid, and cleanup.
- Modify `src/main.js`: import story selector/runtime, choose story missions only for solo campaign converted countries, expose test helpers, and keep `DynamicMissions` fallback.
- Modify `src/hud.js`: show one compact current story objective line without changing the existing mission list contract.
- Modify `styles.css`: style the compact story objective line.
- Modify `src/maps/ukraine.js`, `src/maps/poland.js`, `src/maps/egypt.js`: add lightweight `storySites` anchors near existing landmarks.
- Create `test/story-campaign2.mjs`: fast module-level tests for story definitions and selector behavior.
- Create `test/story-campaign2-browser.mjs`: Playwright test for Ukraine, Poland, Egypt story flow, fallback, replay Night Raid, and co-op fallback.
- Modify `test/campaign.mjs`: complete story missions through the public test helper when a country uses `StoryMissions`.
- Modify `version.json`, `src/main.js`, `sw.js`, and `README.md`: release version and visible docs update after feature verification.

---

### Task 1: Story Definitions And Selector

**Files:**
- Create: `src/story/countryStories.js`
- Test: `test/story-campaign2.mjs`

- [ ] **Step 1: Write the failing selector/data test**

Create `test/story-campaign2.mjs` with this initial content:

```js
import assert from 'node:assert/strict';
import {
  STORY_COUNTRY_IDS,
  getCountryStory,
  shouldUseStoryMissions,
  storyPreview,
} from '../src/story/countryStories.js';

assert.deepEqual(STORY_COUNTRY_IDS, ['UKR', 'POL', 'EGY']);

const ukr = getCountryStory('UKR');
assert.equal(ukr.id, 'UKR');
assert.equal(ukr.npc.kind, 'medic');
assert.deepEqual(ukr.objectives.map((o) => o.id), ['ukr-rescue', 'ukr-signal', 'ukr-defense']);

const pol = getCountryStory('POL');
assert.equal(pol.objectives[0].kind, 'activate');
assert.equal(pol.objectives[0].count, 3);
assert.equal(pol.objectives[1].site, 'railDepot');

const egy = getCountryStory('EGY');
assert.equal(egy.objectives[0].kind, 'fetch');
assert.equal(egy.objectives[0].count, 2);
assert.equal(egy.objectives[1].kind, 'survive');

assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), true);
assert.equal(shouldUseStoryMissions({ countryId: 'POL', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), true);
assert.equal(shouldUseStoryMissions({ countryId: 'DEU', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'storm', isGuest: false, isCoop: false, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: true, isCoop: true, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: true, isPlayground: false }), false);
assert.equal(shouldUseStoryMissions({ countryId: 'UKR', modeId: 'campaign', isGuest: false, isCoop: false, isPlayground: true }), false);

assert.deepEqual(storyPreview('UKR'), ['🆘', '📡', '🛡️']);
assert.deepEqual(storyPreview('DEU'), null);

console.log('✅ story campaign 2 definitions pass');
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node test/story-campaign2.mjs
```

Expected result:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../src/story/countryStories.js
```

- [ ] **Step 3: Add story definitions and selector helpers**

Create `src/story/countryStories.js`:

```js
import { t } from '../i18n.js';

export const STORY_COUNTRY_IDS = ['UKR', 'POL', 'EGY'];

const STORIES = {
  UKR: {
    id: 'UKR',
    title: () => t('Село Сонячне'),
    npc: {
      id: 'ukr-medic',
      kind: 'medic',
      site: 'village',
      name: () => t('Медик Олена'),
      intro: () => t('Село тримається, але людям потрібен герой. Почни з порятунку біля хліва.'),
    },
    objectives: [
      {
        id: 'ukr-rescue',
        kind: 'rescue',
        icon: '🆘',
        site: 'barn',
        title: () => t('Врятуй людей із хліва'),
        start: () => t('Люди сховалися в хліві. Відкрий двері й виведи їх.'),
        done: () => t('Люди врятовані. Медик допоможе біля села.'),
        reward: 90,
        horde: 10,
      },
      {
        id: 'ukr-signal',
        kind: 'hold',
        icon: '📡',
        site: 'tower',
        title: () => t('Віднови сигнал села'),
        prompt: () => t('Тримай E — запусти сигнал'),
        start: () => t('Без сигналу інші рятівники не знайдуть село.'),
        done: () => t('Сигнал пішов! Тепер захисти площу.'),
        hold: 2.4,
        reward: 110,
        horde: 14,
      },
      {
        id: 'ukr-defense',
        kind: 'defense',
        icon: '🛡️',
        site: 'village',
        title: () => t('Оборони сільську площу'),
        start: () => t('Зомбі почули сигнал. Тримай площу до кінця атаки.'),
        done: () => t('Село в безпеці. Арена боса відкрита.'),
        seconds: 22,
        reward: 130,
        horde: 0,
      },
    ],
  },
  POL: {
    id: 'POL',
    title: () => t('Крижане депо'),
    npc: {
      id: 'pol-keeper',
      kind: 'granny',
      site: 'townSquare',
      name: () => t('Доглядачка депо'),
      intro: () => t('Місто замерзає, а поїзд стоїть. Запали вогнища й відкрий шлях до депо.'),
    },
    objectives: [
      {
        id: 'pol-bonfires',
        kind: 'activate',
        icon: '🔥',
        site: 'bonfires',
        title: () => t('Запали 3 вогнища'),
        prompt: () => t('Тримай E — запали вогнище'),
        start: () => t('Без тепла люди не дійдуть до евакуації.'),
        done: () => t('Вогнища горять. Тепер запускай поїзд.'),
        count: 3,
        hold: 1.8,
        reward: 110,
        horde: 10,
      },
      {
        id: 'pol-train',
        kind: 'hold',
        icon: '🚂',
        site: 'railDepot',
        title: () => t('Запусти рятувальний поїзд'),
        prompt: () => t('Тримай E — заведи поїзд'),
        start: () => t('Депо поруч. Якщо поїзд рушить, люди матимуть шанс.'),
        done: () => t('Поїзд готовий. Але біля замку засідка.'),
        hold: 2.8,
        reward: 130,
        horde: 16,
      },
      {
        id: 'pol-castle',
        kind: 'survive',
        icon: '🏰',
        site: 'castleRuin',
        title: () => t('Зачисть засідку в руїнах'),
        start: () => t('Зомбі перекрили шлях біля замку. Вибий їх.'),
        done: () => t('Шлях відкритий. Бос чекає на арені.'),
        count: 8,
        reward: 150,
        horde: 0,
      },
    ],
  },
  EGY: {
    id: 'EGY',
    title: () => t('Таємниця піраміди'),
    npc: {
      id: 'egy-guide',
      kind: 'kid',
      site: 'oasis',
      name: () => t('Юний археолог'),
      intro: () => t('Печатки гробниці зламані. Знайди їх біля сфінкса й піраміди, поки фараон не прокинувся.'),
    },
    objectives: [
      {
        id: 'egy-seals',
        kind: 'fetch',
        icon: '🪬',
        site: 'seals',
        deliverSite: 'tombDoor',
        title: () => t('Знайди 2 печатки гробниці'),
        prompt: () => t('Натисни E — взяти печатку'),
        deliverPrompt: () => t('Тримай E — встав печатки у двері'),
        start: () => t('Перша печатка біля сфінкса, друга на шляху до піраміди.'),
        done: () => t('Двері відкрились. Мумії вже поруч!'),
        count: 2,
        hold: 2.4,
        reward: 140,
        horde: 12,
      },
      {
        id: 'egy-ambush',
        kind: 'survive',
        icon: '⚱️',
        site: 'tombDoor',
        title: () => t('Переживи напад мумій'),
        start: () => t('Гробниця прокинулась. Не дай муміям вийти назовні.'),
        done: () => t('Прокляття ослабло. Фараон вийде на бій.'),
        count: 10,
        reward: 160,
        horde: 0,
        zombieTypes: ['mummy', 'walker', 'runner'],
      },
    ],
  },
};

export function getCountryStory(countryId) {
  return STORIES[countryId] || null;
}

export function storyPreview(countryId) {
  const story = getCountryStory(countryId);
  return story ? story.objectives.map((o) => o.icon) : null;
}

export function shouldUseStoryMissions({ countryId, modeId, isGuest, isCoop, isPlayground }) {
  return modeId === 'campaign'
    && !isGuest
    && !isCoop
    && !isPlayground
    && !!getCountryStory(countryId);
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:

```bash
node test/story-campaign2.mjs
```

Expected result:

```text
✅ story campaign 2 definitions pass
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/story/countryStories.js test/story-campaign2.mjs
git commit -m "feat: add campaign story definitions"
```

---

### Task 2: Main Mission Selector And Fallback Contract

**Files:**
- Modify: `src/main.js` import section near line 9, mission preview near line 1124, mission creation near line 2526, test helpers near line 4651
- Test: `test/story-campaign2.mjs`

- [ ] **Step 1: Extend the failing test for selector integration**

Append this to `test/story-campaign2.mjs`:

```js
const preview = storyPreview('POL');
assert.equal(preview.join(''), '🔥🚂🏰');
console.log('✅ story selector preview pass');
```

- [ ] **Step 2: Run the test and confirm it still passes before main integration**

Run:

```bash
node test/story-campaign2.mjs
```

Expected result:

```text
✅ story campaign 2 definitions pass
✅ story selector preview pass
```

- [ ] **Step 3: Wire story preview and mission selector into `src/main.js`**

Change the existing mission import:

```js
import { DynamicMissions, rollMissionSet, MISSION_TYPES } from './missionpool.js';
```

to:

```js
import { DynamicMissions, rollMissionSet, MISSION_TYPES } from './missionpool.js';
import { StoryMissions } from './story/storymissions.js';
import { shouldUseStoryMissions, storyPreview } from './story/countryStories.js';
```

In `_missionPreviewHtml(countryId)`, insert this before `const runIndex = ...`:

```js
    const storyIcons = storyPreview(countryId);
    if (storyIcons) {
      const chips = storyIcons.map((icon) => `<span>${icon}</span>`);
      return `<span class="mission-preview">${chips.join('')}</span>`;
    }
```

In `_buildLevel()`, replace the campaign mission creation block:

```js
    } else {
      if (!isGuest) level.zombies.populate();
      level.missions = new DynamicMissions(level);
      // 🎲 «Прокачка» і в соло-кампанії: картка після кожної місії (кооп — окремий beat)
      if (!level.net && !isPlayground) level.runBuild = new RunBuild();
    }
```

with:

```js
    } else {
      if (!isGuest) level.zombies.populate();
      const useStory = shouldUseStoryMissions({
        countryId,
        modeId,
        isGuest,
        isCoop: !!coop,
        isPlayground,
      });
      level.missions = useStory ? new StoryMissions(level) : new DynamicMissions(level);
      // 🎲 «Прокачка» і в соло-кампанії: картка після кожної місії (кооп — окремий beat)
      if (!level.net && !isPlayground) level.runBuild = new RunBuild();
    }
```

Add these test helpers inside the existing `this.test = { ... }` object near the other mission helpers:

```js
      missionKind: () => g.level && g.level.missions && g.level.missions.constructor
        ? g.level.missions.constructor.name : null,
      storyObjectiveIds: () => g.level && g.level.missions && g.level.missions.objectives
        ? g.level.missions.objectives.map((o) => o.id) : [],
      completeStoryObjective: (id) => {
        if (g.level && g.level.missions && g.level.missions._completeObjective) {
          g.level.missions._completeObjective(id);
          return true;
        }
        return false;
      },
```

- [ ] **Step 4: Create a temporary minimal `StoryMissions` so imports pass**

Create `src/story/storymissions.js`:

```js
import { getCountryStory } from './countryStories.js';

export class StoryMissions {
  constructor(level) {
    this.level = level;
    this.story = getCountryStory(level.countryId);
    this.objectives = (this.story ? this.story.objectives : []).map((cfg, i) => ({
      ...cfg,
      slotIndex: i,
      state: i === 0 ? 'active' : 'locked',
    }));
    this.prompt = null;
    this.civilians = [];
    this.bossUnlocked = false;
    this.bossStarted = false;
  }

  get(id) {
    return this.objectives.find((o) => o.id === id || o.slotIndex === id) || null;
  }

  getHudList() {
    return this.objectives.map((o) => ({
      icon: o.icon,
      title: o.title(),
      done: o.state === 'done',
    }));
  }

  getMarkers() {
    const active = this.objectives.find((o) => o.state === 'active');
    const site = active && this.level.world.layout[active.site];
    return site ? [{ x: site.x, z: site.z, icon: active.icon }] : [];
  }

  update() {}

  _completeObjective(id) {
    const obj = this.get(id);
    if (!obj || obj.state === 'done') return;
    obj.state = 'done';
    const next = this.objectives.find((o) => o.state === 'locked');
    if (next) next.state = 'active';
    else this.bossUnlocked = true;
  }
}
```

- [ ] **Step 5: Add browser test coverage for selector/fallback**

Create `test/story-campaign2-browser.mjs`:

```js
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, msg, detail = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, detail);
  if (!ok) failed++;
};

await page.goto(`${BASE}/?test&fresh`);
await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 });

const preview = await page.evaluate(() => [...document.querySelectorAll('#country-list .country-item[data-id="UKR"] .mission-preview span')].map((el) => el.textContent));
check(preview.join('') === '🆘📡🛡️', 'UKR preview uses story icons', preview.join(''));

await page.evaluate(() => window.__game.startLevel('UKR'));
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
let st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
}));
check(st.kind === 'StoryMissions', 'UKR solo campaign uses StoryMissions', JSON.stringify(st));
check(st.ids.join(',') === 'ukr-rescue,ukr-signal,ukr-defense', 'UKR story objective IDs are present', JSON.stringify(st.ids));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('DEU'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({ kind: window.__game.test.missionKind() }));
check(st.kind === 'DynamicMissions', 'DEU keeps DynamicMissions fallback', JSON.stringify(st));

check(errors.length === 0, `no JS errors (${errors.slice(0, 2).join('|')})`);
console.log(failed === 0 ? '✅ story campaign 2 browser selector pass' : `❌ story campaign 2 browser selector failed: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 6: Run tests**

Run:

```bash
node test/story-campaign2.mjs
node test/story-campaign2-browser.mjs
```

Expected result:

```text
✅ story campaign 2 definitions pass
✅ story selector preview pass
✅ story campaign 2 browser selector pass
```

- [ ] **Step 7: Commit**

Run:

```bash
git add src/main.js src/story/storymissions.js test/story-campaign2.mjs test/story-campaign2-browser.mjs
git commit -m "feat: select story missions for converted countries"
```

---

### Task 3: Story Anchors And NPC Runtime

**Files:**
- Create: `src/story/npcs.js`
- Modify: `src/maps/ukraine.js`
- Modify: `src/maps/poland.js`
- Modify: `src/maps/egypt.js`
- Modify: `src/story/storymissions.js`
- Test: `test/story-campaign2.mjs`
- Test: `test/story-campaign2-browser.mjs`

- [ ] **Step 1: Add failing anchor assertions**

Append to `test/story-campaign2.mjs`:

```js
const ukraineMap = (await import('../src/maps/ukraine.js')).default;
const polandMap = (await import('../src/maps/poland.js')).default;
const egyptMap = (await import('../src/maps/egypt.js')).default;

assert.ok(ukraineMap.storySites.barn);
assert.ok(ukraineMap.storySites.tower);
assert.ok(ukraineMap.storySites.village);
assert.ok(polandMap.storySites.railDepot);
assert.ok(polandMap.storySites.castleRuin);
assert.equal(polandMap.storySites.bonfires.length, 3);
assert.ok(egyptMap.storySites.sphinx);
assert.ok(egyptMap.storySites.pyramid);
assert.ok(egyptMap.storySites.tombDoor);
assert.equal(egyptMap.storySites.seals.length, 2);
console.log('✅ story anchors pass');
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node test/story-campaign2.mjs
```

Expected result:

```text
TypeError: Cannot read properties of undefined (reading 'barn')
```

- [ ] **Step 3: Add map anchors**

In `src/maps/ukraine.js`, add this object before `zombieDensity`:

```js
  storySites: {
    village: { x: 0, z: 0, r: 18 },
    barn: { x: -98, z: -62, r: 8 },
    tower: { x: 112, z: -92, r: 8 },
    arena: { x: -10, z: -168, r: 28 },
  },
```

In `src/maps/poland.js`, add this object before `zombieDensity`:

```js
  storySites: {
    townSquare: { x: 0, z: -10, r: 16 },
    railDepot: { x: -112, z: 62, r: 12 },
    castleRuin: { x: 12, z: -162, r: 18 },
    arena: { x: 12, z: -162, r: 28 },
    bonfires: [
      { x: -18, z: -20, r: 5 },
      { x: 18, z: -18, r: 5 },
      { x: -4, z: 20, r: 5 },
    ],
  },
```

In `src/maps/egypt.js`, add this object before `zombieDensity`:

```js
  storySites: {
    oasis: { x: -48, z: 36, r: 14 },
    sphinx: { x: 30, z: -86, r: 10 },
    pyramid: { x: 62, z: -110, r: 12 },
    tombDoor: { x: 58, z: -104, r: 8 },
    arena: { x: 14, z: -162, r: 30 },
    seals: [
      { x: 30, z: -86, r: 4 },
      { x: 62, z: -110, r: 4 },
    ],
  },
```

- [ ] **Step 4: Add NPC helper**

Create `src/story/npcs.js`:

```js
import { makeCivilian, setAnim, updateRig } from '../characters.js';

export function spawnStoryNpc(level, npc, site) {
  if (!npc || !site) return null;
  const rig = makeCivilian(npc.kind || 'kid', level.rng);
  const x = site.x + 2;
  const z = site.z + 2;
  rig.group.position.set(x, level.world.groundH(x, z), z);
  level.scene.add(rig.group);
  return { id: npc.id, npc, rig, x, z, talked: false };
}

export function updateStoryNpc(npcState, dt) {
  if (!npcState || !npcState.rig) return;
  setAnim(npcState.rig, 'cheer');
  updateRig(npcState.rig, dt);
}

export function removeStoryNpc(level, npcState) {
  if (npcState && npcState.rig) level.scene.remove(npcState.rig.group);
}
```

- [ ] **Step 5: Update `StoryMissions` to spawn NPC and resolve anchors**

In `src/story/storymissions.js`, replace the file with:

```js
import { t } from '../i18n.js';
import { getCountryStory } from './countryStories.js';
import { removeStoryNpc, spawnStoryNpc, updateStoryNpc } from './npcs.js';

export class StoryMissions {
  constructor(level) {
    this.level = level;
    this.story = getCountryStory(level.countryId);
    this.storySites = (level.country.map && level.country.map.storySites) || {};
    this.objectives = (this.story ? this.story.objectives : []).map((cfg, i) => ({
      ...cfg,
      slotIndex: i,
      state: i === 0 ? 'active' : 'locked',
      progress: 0,
      spawned: [],
      doneCount: 0,
    }));
    this.prompt = null;
    this.civilians = [];
    this.bossUnlocked = false;
    this.bossStarted = false;
    this.bossBeam = null;
    const npcSite = this._site(this.story && this.story.npc && this.story.npc.site);
    this.npcState = spawnStoryNpc(level, this.story && this.story.npc, npcSite);
    if (this.story && this.story.npc) level.bus.emit('toast', this.story.npc.intro());
  }

  _site(id) {
    if (!id) return null;
    return this.storySites[id] || this.level.world.layout[id] || null;
  }

  _objectiveTarget(obj) {
    if (!obj) return null;
    const site = this._site(obj.site);
    if (Array.isArray(site)) return site.find((p) => !p.done) || site[0] || null;
    return site;
  }

  get(id) {
    return this.objectives.find((o) => o.id === id || o.slotIndex === id) || null;
  }

  getHudList() {
    return this.objectives.map((o) => ({
      icon: o.icon,
      title: o.title(),
      done: o.state === 'done',
    }));
  }

  currentStoryObjective() {
    const active = this.objectives.find((o) => o.state === 'active');
    return active ? `${active.icon} ${active.title()}` : '';
  }

  getMarkers() {
    const active = this.objectives.find((o) => o.state === 'active');
    const site = this._objectiveTarget(active);
    const markers = [];
    if (site) markers.push({ x: site.x, z: site.z, icon: active.icon });
    if (this.bossUnlocked && !this.bossStarted) {
      const arena = this._site('arena') || this.level.world.layout.arena;
      markers.push({ x: arena.x, z: arena.z, icon: '👑' });
    }
    return markers;
  }

  update(dt) {
    this.prompt = null;
    updateStoryNpc(this.npcState, dt);
  }

  _completeObjective(id) {
    const obj = this.get(id);
    if (!obj || obj.state === 'done') return;
    obj.state = 'done';
    this.level.addCoins(obj.reward || 0);
    this.level.game.progress.addXp(30);
    this.level.bus.emit('missionDone', { title: obj.title(), reward: obj.reward || 0, icon: obj.icon });
    this.level.bus.emit('toast', obj.done());
    const next = this.objectives.find((o) => o.state === 'locked');
    if (next) {
      next.state = 'active';
      this.level.bus.emit('toast', next.start());
    } else {
      this.bossUnlocked = true;
      const arena = this._site('arena') || this.level.world.layout.arena;
      this.bossBeam = this.level.effects.makeBeam(arena.x, arena.z, 0xff44aa, '👑');
      this.level.audio.bossRoar();
      this.level.bus.emit('bossUnlocked');
    }
  }

  dispose() {
    removeStoryNpc(this.level, this.npcState);
    if (this.bossBeam) this.bossBeam.remove();
  }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
node test/story-campaign2.mjs
node test/story-campaign2-browser.mjs
```

Expected result:

```text
✅ story anchors pass
✅ story campaign 2 browser selector pass
```

- [ ] **Step 7: Commit**

Run:

```bash
git add src/maps/ukraine.js src/maps/poland.js src/maps/egypt.js src/story/npcs.js src/story/storymissions.js test/story-campaign2.mjs
git commit -m "feat: add story anchors and NPC runtime"
```

---

### Task 4: Objective Gameplay Runtime

**Files:**
- Modify: `src/story/storymissions.js`
- Test: `test/story-campaign2-browser.mjs`
- Modify: `test/campaign.mjs`

- [ ] **Step 1: Add failing browser flow checks**

Append these checks in `test/story-campaign2-browser.mjs` after the UKR `StoryMissions` assertion:

```js
await page.evaluate(() => window.__game.test.completeStoryObjective('ukr-rescue'));
st = await page.evaluate(() => ({
  ids: window.__game.test.storyObjectiveIds(),
  hud: window.__game.level.missions.getHudList().map((m) => ({ title: m.title, done: m.done })),
  current: window.__game.level.missions.currentStoryObjective(),
}));
check(st.hud[0].done && /сигнал/i.test(st.current), 'UKR story advances from rescue to signal', JSON.stringify(st));

await page.evaluate(() => {
  window.__game.test.completeStoryObjective('ukr-signal');
  window.__game.test.completeStoryObjective('ukr-defense');
});
st = await page.evaluate(() => ({
  unlocked: window.__game.level.missions.bossUnlocked,
  markers: window.__game.level.missions.getMarkers().map((m) => m.icon),
}));
check(st.unlocked && st.markers.includes('👑'), 'UKR story unlocks boss after final objective', JSON.stringify(st));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('POL'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
  marker: window.__game.level.missions.getMarkers()[0],
}));
check(st.kind === 'StoryMissions' && st.ids[0] === 'pol-bonfires' && st.marker.icon === '🔥', 'POL starts with bonfire story', JSON.stringify(st));

await page.evaluate(() => { window.__game.endLevel(); window.__game.startLevel('EGY'); });
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  ids: window.__game.test.storyObjectiveIds(),
  marker: window.__game.level.missions.getMarkers()[0],
}));
check(st.kind === 'StoryMissions' && st.ids[0] === 'egy-seals' && st.marker.icon === '🪬', 'EGY starts with seal story', JSON.stringify(st));
```

- [ ] **Step 2: Run the browser test and confirm it fails on incomplete runtime**

Run:

```bash
node test/story-campaign2-browser.mjs
```

Expected result:

```text
❌ UKR story advances from rescue to signal
```

or an equivalent failure caused by the story runtime not yet updating objective gameplay state fully.

- [ ] **Step 3: Implement objective runtime methods**

In `src/story/storymissions.js`, add these imports at the top:

```js
import * as THREE from 'three';
import { makeCivilian, setAnim, updateRig, toonMat } from '../characters.js';
```

Then add these methods inside `StoryMissions` before `update(dt)`:

```js
  _playerNear(site, r = 4) {
    if (!site) return false;
    const p = this.level.player.pos;
    return Math.hypot(p.x - site.x, p.z - site.z) <= (site.r || r);
  }

  _spawnWave(obj, count, site) {
    if (!site) return;
    const types = obj.zombieTypes || ['walker', 'runner'];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const type = types[i % types.length];
      const z = this.level.zombies.spawn(type, site.x + Math.cos(a) * 12, site.z + Math.sin(a) * 12, { horde: false });
      z.aggroed = true;
      z.state = 'chase';
      obj.spawned.push(z);
    }
    this.level.audio.horde();
  }

  _ensurePointMesh(point, icon, color = 0xffd84d) {
    if (point.mesh) return;
    const y = this.level.world.groundH(point.x, point.z);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.12, 24), toonMat(color, color, 0.25));
    mesh.position.set(point.x, y + 0.08, point.z);
    this.level.scene.add(mesh);
    point.mesh = mesh;
    point.icon = this.level.effects.makeBeam(point.x, point.z, color, icon);
  }

  _clearPoint(point) {
    if (point.mesh) this.level.scene.remove(point.mesh);
    if (point.icon) point.icon.remove();
    point.mesh = null;
    point.icon = null;
  }

  _updateHold(obj, dt, input, allowControl) {
    const site = this._objectiveTarget(obj);
    if (!site) return;
    this._ensurePointMesh(site, obj.icon);
    if (!this._playerNear(site)) {
      obj.progress = 0;
      return;
    }
    this.prompt = { text: obj.prompt(), hold: true, progress: obj.progress / obj.hold };
    if (!allowControl || !input.down('KeyE')) {
      obj.progress = Math.max(0, obj.progress - dt * 0.5);
      return;
    }
    obj.progress += dt;
    if (obj.progress >= obj.hold) {
      this._clearPoint(site);
      this._completeObjective(obj.id);
    }
  }

  _updateActivate(obj, dt, input, allowControl) {
    const points = this._site(obj.site) || [];
    for (const p of points) if (!p.done) this._ensurePointMesh(p, obj.icon, 0xff8a3d);
    const point = points.find((p) => !p.done && this._playerNear(p));
    if (!point) {
      obj.progress = 0;
      return;
    }
    this.prompt = { text: obj.prompt(), hold: true, progress: obj.progress / obj.hold };
    if (!allowControl || !input.down('KeyE')) {
      obj.progress = Math.max(0, obj.progress - dt * 0.5);
      return;
    }
    obj.progress += dt;
    if (obj.progress >= obj.hold) {
      point.done = true;
      this._clearPoint(point);
      obj.doneCount++;
      obj.progress = 0;
      this.level.bus.emit('toast', `${obj.icon} ${obj.doneCount}/${obj.count}`);
      if (obj.doneCount >= obj.count) this._completeObjective(obj.id);
    }
  }

  _updateFetch(obj, dt, input, allowControl) {
    const points = this._site(obj.site) || [];
    for (const p of points) if (!p.done) this._ensurePointMesh(p, obj.icon, 0xd9b96a);
    const point = points.find((p) => !p.done && this._playerNear(p));
    if (point) {
      this.prompt = { text: obj.prompt(), hold: false };
      if (allowControl && input.pressed('KeyE')) {
        input.justPressed.delete('KeyE');
        point.done = true;
        this._clearPoint(point);
        obj.doneCount++;
        this.level.bus.emit('toast', `${obj.icon} ${obj.doneCount}/${obj.count}`);
      }
      return;
    }
    if (obj.doneCount < obj.count) return;
    const dest = this._site(obj.deliverSite);
    this._ensurePointMesh(dest, obj.icon, 0xd9b96a);
    if (!this._playerNear(dest)) return;
    this.prompt = { text: obj.deliverPrompt(), hold: true, progress: obj.progress / obj.hold };
    if (!allowControl || !input.down('KeyE')) {
      obj.progress = Math.max(0, obj.progress - dt * 0.5);
      return;
    }
    obj.progress += dt;
    if (obj.progress >= obj.hold) {
      this._clearPoint(dest);
      this._completeObjective(obj.id);
    }
  }

  _updateDefense(obj, dt) {
    const site = this._objectiveTarget(obj);
    if (!obj.started) {
      obj.started = true;
      obj.timer = obj.seconds;
      obj.waveT = 0.1;
      this.level.bus.emit('toast', obj.start());
    }
    obj.waveT -= dt;
    if (obj.waveT <= 0) {
      obj.waveT = 6;
      this._spawnWave(obj, 4, site);
    }
    obj.timer -= dt;
    if (obj.timer <= 0) this._completeObjective(obj.id);
  }

  _updateSurvive(obj) {
    const site = this._objectiveTarget(obj);
    if (!obj.started) {
      obj.started = true;
      this._spawnWave(obj, obj.count || 6, site);
      this.level.bus.emit('toast', obj.start());
    }
    if (obj.spawned.length && obj.spawned.every((z) => z.state === 'dead' || z.gone)) {
      this._completeObjective(obj.id);
    }
  }
```

Replace `update(dt)` with:

```js
  update(dt, input, allowControl) {
    this.prompt = null;
    updateStoryNpc(this.npcState, dt);
    const active = this.objectives.find((o) => o.state === 'active');
    if (!active) {
      this._updateBossStart();
      return;
    }
    if (active.kind === 'hold') this._updateHold(active, dt, input, allowControl);
    else if (active.kind === 'activate') this._updateActivate(active, dt, input, allowControl);
    else if (active.kind === 'fetch') this._updateFetch(active, dt, input, allowControl);
    else if (active.kind === 'defense') this._updateDefense(active, dt);
    else if (active.kind === 'survive') this._updateSurvive(active);
    this._updateBossStart();
  }
```

Add `_updateBossStart()` before `dispose()`:

```js
  _updateBossStart() {
    if (!this.bossUnlocked || this.bossStarted) return;
    const arena = this._site('arena') || this.level.world.layout.arena;
    const p = this.level.player.pos;
    if (Math.hypot(p.x - arena.x, p.z - arena.z) >= (arena.r || 30) - 4) return;
    this.bossStarted = true;
    if (this.bossBeam) {
      this.bossBeam.remove();
      this.bossBeam = null;
    }
    this.level.zombies.spawnBoss();
    this.level.audio.bossRoar(this.level.country && this.level.country.id);
    this.level.bus.emit('bossStart');
  }
```

- [ ] **Step 4: Update `test/campaign.mjs` to support story countries**

Replace this block:

```js
  await page.evaluate(() => {
    const g = window.__game;
    g.test.god();
    g.test.completeMission('rescue');
    g.test.completeMission('tower');
    g.test.completeMission('warehouse');
  });
```

with:

```js
  await page.evaluate(() => {
    const g = window.__game;
    g.test.god();
    if (g.test.missionKind() === 'StoryMissions') {
      for (const id of g.test.storyObjectiveIds()) g.test.completeStoryObjective(id);
    } else {
      g.test.completeMission('rescue');
      g.test.completeMission('tower');
      g.test.completeMission('warehouse');
    }
  });
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node test/story-campaign2.mjs
node test/story-campaign2-browser.mjs
node test/campaign.mjs
```

Expected result:

```text
✅ story campaign 2 definitions pass
✅ story campaign 2 browser selector pass
🏆 КАМПАНІЮ ПРОЙДЕНО ВІД ПОЧАТКУ ДО КІНЦЯ
```

- [ ] **Step 6: Commit**

Run:

```bash
git add src/story/storymissions.js test/story-campaign2-browser.mjs test/campaign.mjs
git commit -m "feat: implement story mission objectives"
```

---

### Task 5: HUD Current Story Objective

**Files:**
- Modify: `src/hud.js`
- Modify: `styles.css`
- Test: `test/story-campaign2-browser.mjs`

- [ ] **Step 1: Add failing browser assertion for HUD story line**

Append after the first UKR level starts in `test/story-campaign2-browser.mjs`:

```js
const storyHud = await page.evaluate(() => {
  const el = document.querySelector('.story-objective');
  return el ? el.textContent.trim() : '';
});
check(/Врятуй людей/.test(storyHud), 'compact story objective is visible in HUD', storyHud);
```

- [ ] **Step 2: Run the browser test and confirm it fails**

Run:

```bash
node test/story-campaign2-browser.mjs
```

Expected result:

```text
❌ compact story objective is visible in HUD
```

- [ ] **Step 3: Add HUD element creation/update**

In `src/hud.js`, find the mission HTML block:

```js
    // місії
    const list = level.missions.getHudList();
    let html = '';
    for (const m of list) {
      html += `<div class="mission ${m.done ? 'done' : ''}"><span class="mi">${m.done ? '✅' : m.icon}</span> ${m.title}</div>`;
    }
    if (this.el.missions.innerHTML !== html) this.el.missions.innerHTML = html;
```

Replace it with:

```js
    // місії
    const storyLine = level.missions.currentStoryObjective ? level.missions.currentStoryObjective() : '';
    const list = level.missions.getHudList();
    let html = storyLine ? `<div class="story-objective">${storyLine}</div>` : '';
    for (const m of list) {
      html += `<div class="mission ${m.done ? 'done' : ''}"><span class="mi">${m.done ? '✅' : m.icon}</span> ${m.title}</div>`;
    }
    if (this.el.missions.innerHTML !== html) this.el.missions.innerHTML = html;
```

- [ ] **Step 4: Add styling**

Append to `styles.css`:

```css
.story-objective {
  margin: 0 0 6px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 216, 77, 0.5);
  background: rgba(26, 30, 36, 0.82);
  color: #ffe99a;
  font-weight: 800;
  font-size: 13px;
  line-height: 1.2;
  border-radius: 6px;
}
```

- [ ] **Step 5: Run focused test**

Run:

```bash
node test/story-campaign2-browser.mjs
```

Expected result:

```text
✅ compact story objective is visible in HUD
✅ story campaign 2 browser selector pass
```

- [ ] **Step 6: Commit**

Run:

```bash
git add src/hud.js styles.css test/story-campaign2-browser.mjs
git commit -m "feat: show current story objective in HUD"
```

---

### Task 6: Replay Night Raid

**Files:**
- Modify: `src/story/storymissions.js`
- Modify: `src/main.js`
- Test: `test/story-campaign2-browser.mjs`

- [ ] **Step 1: Add failing replay assertions**

Append to `test/story-campaign2-browser.mjs` before the final error check:

```js
await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.save.liberated = { UKR: true };
  g.save.missionRuns = { UKR: 1 };
  g.startLevel('UKR');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level, null, { timeout: 30000 });
st = await page.evaluate(() => ({
  kind: window.__game.test.missionKind(),
  replay: !!window.__game.level.missions.replayNightRaid,
  time: window.__game.level.world.time,
  current: window.__game.level.missions.currentStoryObjective(),
}));
check(st.kind === 'StoryMissions' && st.replay, 'liberated UKR replay enables Night Raid', JSON.stringify(st));
check(/Нічний рейд/.test(st.current), 'Night Raid appears in current objective text', JSON.stringify(st));
```

- [ ] **Step 2: Run the browser test and confirm it fails**

Run:

```bash
node test/story-campaign2-browser.mjs
```

Expected result:

```text
❌ liberated UKR replay enables Night Raid
```

- [ ] **Step 3: Add replay flag to `StoryMissions`**

In `src/story/storymissions.js`, inside the constructor after `this.storySites = ...`, add:

```js
    this.replayNightRaid = !!(level.game.save.liberated && level.game.save.liberated[level.countryId]);
    if (this.replayNightRaid && level.world) {
      level.world.time = Math.max(level.world.time || 0, 150);
    }
```

In `currentStoryObjective()`, replace:

```js
    return active ? `${active.icon} ${active.title()}` : '';
```

with:

```js
    if (!active) return '';
    return `${this.replayNightRaid ? '🌙 Нічний рейд · ' : ''}${active.icon} ${active.title()}`;
```

In `_completeObjective(id)`, before the `else { this.bossUnlocked = true; ... }` boss unlock branch, add an elite wave when the last objective completes:

```js
    if (!next && this.replayNightRaid) {
      const site = this._objectiveTarget(obj) || this._site('village') || this.level.world.layout.village;
      this._spawnWave({ ...obj, spawned: [], zombieTypes: ['runner', 'big', 'walker'] }, 6, site);
      this.level.bus.emit('toast', t('🌙 Нічний рейд: остання хвиля перед босом!'));
    }
```

- [ ] **Step 4: Run focused browser test**

Run:

```bash
node test/story-campaign2-browser.mjs
```

Expected result:

```text
✅ liberated UKR replay enables Night Raid
✅ Night Raid appears in current objective text
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/story/storymissions.js test/story-campaign2-browser.mjs
git commit -m "feat: add story replay night raid"
```

---

### Task 7: Release Hygiene, Docs, And Full Verification

**Files:**
- Modify: `version.json`
- Modify: `src/main.js`
- Modify: `sw.js`
- Modify: `README.md`
- Test: release/browser checks

- [ ] **Step 1: Update version files**

If the current version is still `273`, bump to `274`.

In `version.json`:

```json
{ "v": 274 }
```

In `src/main.js`, change:

```js
const APP_VERSION = 273;
```

to:

```js
const APP_VERSION = 274;
```

In `sw.js`, change the cache version string from:

```js
const CACHE = 'zr-cache-v273';
```

to:

```js
const CACHE = 'zr-cache-v274';
```

- [ ] **Step 2: Update README current release**

In `README.md`, replace the current build paragraph that says `v262` with:

```md
Актуальний production-білд: **v274**. Live-перевірка: `version.json`, `APP_VERSION` і service worker cache мають однаковий номер, тому PWA бачить новий реліз і чистить старий кеш.

Останній реліз — оновлення «Кампанія 2.0: живі країни» (v274): 🇺🇦 Україна, 🇵🇱 Польща й 🇪🇬 Єгипет отримали сюжетні епізоди з NPC, короткими підказками, унікальними цілями на ландмарках карти, компактним рядком поточної сюжетної цілі в HUD і replay-модифікатором 🌙 «Нічний рейд». Інші країни та кооп-кампанія поки безпечно використовують стару систему динамічних місій.
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
node test/story-campaign2.mjs
node test/story-campaign2-browser.mjs
node test/campaign.mjs
node test/update11.mjs
node test/version-sync.mjs
node test/sw-cache.mjs
git diff --check
```

Expected result:

```text
✅ story campaign 2 definitions pass
✅ story campaign 2 browser selector pass
🏆 КАМПАНІЮ ПРОЙДЕНО ВІД ПОЧАТКУ ДО КІНЦЯ
🎉 НОВІ МІСІЇ ПРАЦЮЮТЬ
version.json.v=274  APP_VERSION=274
```

- [ ] **Step 4: Run smoke**

Run:

```bash
node test/smoke.mjs
```

Expected result:

```text
✅
```

The screenshot step may skip on timeout in this repo; treat the smoke as passing only if the process exits with code `0` and there are no JS errors.

- [ ] **Step 5: Commit**

Run:

```bash
git add version.json src/main.js sw.js README.md
git commit -m "release: v274 campaign 2 living countries"
```

- [ ] **Step 6: Push and verify live GitHub Pages**

Run:

```bash
git push origin main
gh run list --workflow pages-build-deployment --limit 3
curl -fsSL "https://slonce70.github.io/zombie-world-rescue/version.json?ts=$(date +%s)"
```

Expected live version:

```json
{ "v": 274 }
```

If Pages returns the previous version, wait for the `pages-build-deployment` run to finish and retry the cache-busted `curl`.

---

## Self-Review

Spec coverage:

- Country-specific story episodes: Tasks 1, 3, and 4.
- NPC guidance and short dialogue: Tasks 1 and 3.
- Three-country first release: Tasks 1, 2, 3, and 4.
- Dynamic fallback for unconverted countries and co-op: Task 2 and Task 7 browser checks.
- Replay Night Raid: Task 6.
- HUD current objective line: Task 5.
- Tests, release version, PWA cache, and README: Task 7.

Completeness scan:

- The plan has concrete implementation slots and does not rely on cross-task shorthand.
- Each task has concrete files, commands, expected results, and code blocks for changed code.

Type consistency:

- `StoryMissions` exposes the same runtime methods that `HUD`, `main`, and tests expect: `update`, `getHudList`, `getMarkers`, `get`, `prompt`, `civilians`, `bossUnlocked`, and `bossStarted`.
- Story helper names are consistent across tasks: `getCountryStory`, `storyPreview`, `shouldUseStoryMissions`, `currentStoryObjective`, and `_completeObjective`.
