# World Bosses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete solo “World Bosses” update with three unlockable bosses, three new procedural boss models, clear mechanics, first-clear rewards, save safety, tests, and release notes.

**Architecture:** Use one new `WorldBossMode` module and one `WORLD_BOSSES` config list. Reuse the existing `startLevel('UKR', opts)`, `level.missions` HUD contract, `overlay-arena-end`, `makeBoss(style)`, and centralized zombie damage path. Add only the smallest shared hooks needed in `main.js`, `zombies.js`, and `characters.js`.

**Tech Stack:** Vanilla JavaScript modules, Three.js procedural models, Playwright browser tests, static local server via `npm run serve`.

---

## Scope

This update adds three world bosses at once:

- `radiation`: **☢️ Бос Радіації**, opens after 4 liberated countries.
- `ice`: **❄️ Крижаний Генерал**, opens after 8 liberated countries.
- `titan`: **🤖 Механічний Титан**, opens after 12 liberated countries.

World Bosses are solo-only. They are not campaign countries, do not liberate countries, do not spawn Megaboxes, and do not use the campaign victory overlay. The shop is disabled during the fight, but the player keeps their wardrobe-selected weapons and gadgets. That makes the mode feel like a big arsenal check without creating another fixed-loadout ruleset.

First clear gives the boss reward once. Replay gives no duplicate reward; it is for fun and practice.

Rewards:

- Radiation: `+800` coins, `+10` crystals, `+450` XP.
- Ice: `+1200` coins, `+15` crystals, `+650` XP.
- Titan: `+2000` coins, `+25` crystals, `+900` XP.

Save shape:

```js
save.worldBosses = {
  radiation: true,
  ice: true,
  titan: true,
};
```

No separate best-time, league, season, online event, crafting currency, or asset pipeline in this release. Add those only after Vlad plays the basic version and still wants more.

## File Structure

- Modify `src/characters.js`: add three new procedural model styles inside `makeBoss(style)`.
- Create `src/worldboss.js`: boss configs, unlock helpers, arena room, mechanics, results.
- Modify `src/zombies.js`: one centralized damage modifier hook for world-boss shield/core phases.
- Modify `src/main.js`: menu card/list, `startWorldBoss(id)`, level flags, event routing, rewards, retry, test API.
- Modify `src/net/cloudsave.js`: treat `worldBosses` as real progress so cloud/import never overwrites it as “empty”.
- Modify `test/cloudsave.mjs`: add save-progress coverage for `worldBosses`.
- Create `test/worldboss.mjs`: focused regression for menu, model style, mode flags, mechanics, rewards, replay, and death flow.
- Modify `src/i18n/en.js` and `src/i18n/ru.js`: translations for new UI strings.
- Modify `README.md`, `version.json`, `src/main.js`, `sw.js`: release bump and notes after tests pass.

## Implementation Tasks

### Task 1: New Boss Models

**Files:**
- Modify: `src/characters.js`
- Test: `test/worldboss.mjs`

- [ ] **Step 1: Create the failing model smoke test**

Create `test/worldboss.mjs` with this initial content:

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

await page.goto(`${BASE}/?test&fresh`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game, null, { timeout: 30000 });

console.log('▸ Світові боси: моделі');
const expectedSkins = { radiation: 0x78c957, iceGeneral: 0xa8e8ff, mechTitan: 0x9aa3ad };
const modelInfo = await page.evaluate(async () => {
  const mod = await import('/src/characters.js');
  return ['radiation', 'iceGeneral', 'mechTitan'].map((style) => {
    const rig = mod.makeBoss(style);
    return {
      style,
      ok: !!(rig && rig.group && rig.parts && rig.parts.head && rig.parts.torso),
      ztype: rig && rig.ztype,
      scale: rig && rig.spec && rig.spec.scale,
      skin: rig && rig.spec && rig.spec.skin,
      children: rig && rig.group ? rig.group.children.length : 0,
    };
  });
});

for (const m of modelInfo) {
  check(m.ok && m.ztype === 'boss' && m.scale >= 2.7 && m.skin === expectedSkins[m.style],
    `модель ${m.style} створюється саме як новий стиль`, JSON.stringify(m));
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  failed += errors.length;
}
if (failed) process.exit(1);
```

- [ ] **Step 2: Run the new test and verify it fails**

Run the local server in Terminal A:

```bash
npm run serve
```

Run the test in Terminal B:

```bash
node test/worldboss.mjs
```

Expected: FAIL because unknown styles fall back to `king`, so `skin` does not match the expected new style colors.

- [ ] **Step 3: Add the three style specs**

In `src/characters.js`, extend `BOSS_SPECS` just before the closing `};` with:

```js
  // 🌍 Світовий бос: заражений реактором мутант
  radiation: {
    skin: 0x78c957, shirt: 0x263b26, pants: 0x31422e, shoes: 0x222820,
    eyeWhite: 0xd6ff5a, pupilColor: 0x0b3614, browColor: 0x13351a,
  },
  // 🌍 Світовий бос: крижаний командир
  iceGeneral: {
    skin: 0xa8e8ff, shirt: 0x244a7a, pants: 0x1f304f, shoes: 0x17243c,
    eyeWhite: 0xf0fbff, pupilColor: 0x0f4a9e, browColor: 0x224a66,
  },
  // 🌍 Світовий бос: важкий механічний титан
  mechTitan: {
    skin: 0x9aa3ad, shirt: 0x3b4656, pants: 0x252d38, shoes: 0x171d25,
    eyeWhite: 0xffd24a, pupilColor: 0xff3a1e, browColor: 0x151a22,
  },
```

- [ ] **Step 4: Add the new model branches in `makeBoss`**

In `src/characters.js`, inside `makeBoss(style)`, add these branches after the existing `emperor` branch and before the final `else` crown branch:

```js
  } else if (style === 'radiation') {
    const toxicM = toonMat(0x79ff4d, 0x39ff18, 0.9);
    const darkM = toonMat(0x1f2a22);
    const metalM = toonMat(0x56636a, 0x1a2226, 0.15);
    const mask = box(0.36, 0.18, 0.12, darkM);
    mask.position.set(0, 0.03, -0.28);
    rig.parts.head.add(mask);
    for (const side of [-1, 1]) {
      const filter = cylinder(0.06, 0.07, 0.14, metalM, 8);
      filter.position.set(side * 0.17, -0.02, -0.34);
      filter.rotation.x = Math.PI / 2;
      rig.parts.head.add(filter);
      const eye = sphere(0.08, toxicM, 10, 8);
      eye.position.set(side * 0.1, 0.2, -0.24);
      rig.parts.head.add(eye);
    }
    const tankM = toonMat(0x5d6f62, 0x39ff18, 0.15);
    const tank = cylinder(0.18, 0.18, 0.62, tankM, 12);
    tank.position.set(0, 0.22, 0.5);
    tank.rotation.x = Math.PI / 2;
    rig.parts.torso.add(tank);
    const symbol = new THREE.Group();
    const disk = cylinder(0.16, 0.16, 0.035, toxicM, 18);
    disk.rotation.x = Math.PI / 2;
    symbol.add(disk);
    for (let i = 0; i < 3; i++) {
      const blade = box(0.06, 0.2, 0.03, darkM);
      blade.position.y = 0.08;
      blade.rotation.z = i * 2.094;
      symbol.add(blade);
    }
    symbol.position.set(0, 0.38, -0.48);
    rig.parts.torso.add(symbol);
    for (const side of [-1, 1]) {
      const claw = cone(0.08, 0.22, toxicM, 6);
      claw.position.set(0, -0.72, -0.04);
      claw.rotation.x = Math.PI;
      rig.parts[side < 0 ? 'armL' : 'armR'].add(claw);
    }
  } else if (style === 'iceGeneral') {
    const iceM = toonMat(0xcdf6ff, 0x80ddff, 0.65);
    const blueM = toonMat(0x2f6fb0, 0x163a78, 0.2);
    const silverM = toonMat(0xb8d4e8, 0x6dbce8, 0.18);
    const helm = sphere(0.34, silverM, 16, 12);
    helm.position.y = 0.2;
    helm.scale.set(1.05, 0.86, 1.05);
    rig.parts.head.add(helm);
    for (const side of [-1, 1]) {
      const horn = cone(0.08, 0.42, iceM, 7);
      horn.position.set(side * 0.24, 0.34, -0.02);
      horn.rotation.z = side * -0.95;
      horn.rotation.x = -0.25;
      rig.parts.head.add(horn);
    }
    const crest = box(0.12, 0.5, 0.12, iceM);
    crest.position.set(0, 0.55, 0.08);
    crest.rotation.x = 0.35;
    rig.parts.head.add(crest);
    const breast = box(0.68, 0.58, 0.14, blueM);
    breast.position.set(0, 0.35, -0.43);
    rig.parts.torso.add(breast);
    for (let i = -2; i <= 2; i++) {
      const shard = cone(0.055, 0.28, iceM, 6);
      shard.position.set(i * 0.13, 0.78 - Math.abs(i) * 0.04, -0.4);
      rig.parts.torso.add(shard);
    }
    const sword = box(0.09, 1.05, 0.04, iceM);
    sword.position.set(0, -0.86, -0.02);
    const guard = box(0.28, 0.06, 0.08, silverM);
    guard.position.set(0, -0.4, 0);
    rig.parts.armR.add(sword, guard);
    const shield = cylinder(0.26, 0.26, 0.08, iceM, 6);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(0, -0.48, -0.2);
    rig.parts.armL.add(shield);
  } else if (style === 'mechTitan') {
    const steelM = toonMat(0x687482, 0x202a34, 0.16);
    const darkM = toonMat(0x202832);
    const warnM = toonMat(0xffc933, 0xff8a00, 0.35);
    const coreM = toonMat(0xff4a2a, 0xff1e00, 0.9);
    rig.parts.torso.scale.set(1.18, 1.08, 1.18);
    const visor = box(0.38, 0.11, 0.05, coreM);
    visor.position.set(0, 0.17, -0.29);
    rig.parts.head.add(visor);
    const jaw = box(0.34, 0.14, 0.12, darkM);
    jaw.position.set(0, -0.06, -0.25);
    rig.parts.head.add(jaw);
    for (const side of [-1, 1]) {
      const antenna = cylinder(0.025, 0.025, 0.42, steelM, 6);
      antenna.position.set(side * 0.19, 0.46, 0.02);
      antenna.rotation.z = side * -0.32;
      rig.parts.head.add(antenna);
      const shoulder = box(0.34, 0.22, 0.34, steelM);
      shoulder.position.set(0.5 * side, 1.58, 0);
      rig.body.add(shoulder);
    }
    const chest = box(0.74, 0.62, 0.2, steelM);
    chest.position.set(0, 0.34, -0.42);
    rig.parts.torso.add(chest);
    const core = cylinder(0.16, 0.16, 0.06, coreM, 18);
    core.rotation.x = Math.PI / 2;
    core.position.set(0, 0.34, -0.55);
    rig.parts.torso.add(core);
    for (const x of [-0.23, 0.23]) {
      const stripe = box(0.09, 0.54, 0.035, warnM);
      stripe.position.set(x, 0.34, -0.58);
      stripe.rotation.z = x < 0 ? -0.24 : 0.24;
      rig.parts.torso.add(stripe);
    }
    const cannon = cylinder(0.11, 0.13, 0.7, darkM, 10);
    cannon.position.set(0, -0.56, -0.08);
    cannon.rotation.x = Math.PI / 2;
    rig.parts.armR.add(cannon);
    const fist = box(0.28, 0.22, 0.28, steelM);
    fist.position.set(0, -0.72, -0.02);
    rig.parts.armL.add(fist);
  } else {
```

- [ ] **Step 5: Run the model smoke test**

Run:

```bash
node test/worldboss.mjs
```

Expected: PASS for all three model styles.

- [ ] **Step 6: Commit**

```bash
git add src/characters.js test/worldboss.mjs
git commit -m "Add world boss models"
```

### Task 2: World Boss Mode Module

**Files:**
- Create: `src/worldboss.js`
- Modify: `test/worldboss.mjs`

- [ ] **Step 1: Extend the test with mode config checks**

Append this block to `test/worldboss.mjs` after the model smoke section and before `await browser.close()`:

```js
console.log('▸ Світові боси: конфіг');
const cfgInfo = await page.evaluate(async () => {
  const mod = await import('/src/worldboss.js');
  return {
    ids: mod.WORLD_BOSSES.map((b) => b.id),
    unlocks: Object.fromEntries(mod.WORLD_BOSSES.map((b) => [b.id, b.unlockCountries])),
    rewards: Object.fromEntries(mod.WORLD_BOSSES.map((b) => [b.id, b.reward])),
  };
});
check(JSON.stringify(cfgInfo.ids) === JSON.stringify(['radiation', 'ice', 'titan']),
  'є рівно три світові боси у правильному порядку', JSON.stringify(cfgInfo.ids));
check(cfgInfo.unlocks.radiation === 4 && cfgInfo.unlocks.ice === 8 && cfgInfo.unlocks.titan === 12,
  'відкриття босів: 4 / 8 / 12 країн', JSON.stringify(cfgInfo.unlocks));
check(cfgInfo.rewards.titan.crystals === 25 && cfgInfo.rewards.titan.xp === 900,
  'нагорода Титана задана в конфігу', JSON.stringify(cfgInfo.rewards.titan));
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/worldboss.mjs
```

Expected: FAIL because `/src/worldboss.js` does not exist.

- [ ] **Step 3: Create `src/worldboss.js` with configs and the mode skeleton**

Create `src/worldboss.js`:

```js
import * as THREE from 'three';
import { t } from './i18n.js';
import { disposeObject } from './utils.js';

export const WORLD_BOSSES = [
  {
    id: 'radiation',
    icon: '☢️',
    name: () => t('☢️ БОС РАДІАЦІЇ'),
    shortName: () => t('Бос Радіації'),
    style: 'radiation',
    unlockCountries: 4,
    hp: 9000,
    roomSize: 86,
    color: 0x79ff4d,
    mechanic: () => t('Токсичні зони на підлозі. Не стій у зеленому колі.'),
    reward: { coins: 800, crystals: 10, xp: 450 },
  },
  {
    id: 'ice',
    icon: '❄️',
    name: () => t('❄️ КРИЖАНИЙ ГЕНЕРАЛ'),
    shortName: () => t('Крижаний Генерал'),
    style: 'iceGeneral',
    unlockCountries: 8,
    hp: 12000,
    roomSize: 92,
    color: 0x9be8ff,
    mechanic: () => t('Крижаний щит інколи зменшує шкоду. Перечекай і стріляй після спаду.'),
    reward: { coins: 1200, crystals: 15, xp: 650 },
  },
  {
    id: 'titan',
    icon: '🤖',
    name: () => t('🤖 МЕХАНІЧНИЙ ТИТАН'),
    shortName: () => t('Механічний Титан'),
    style: 'mechTitan',
    unlockCountries: 12,
    hp: 16000,
    roomSize: 100,
    color: 0xff6a2a,
    mechanic: () => t('Слабке ядро відкривається хвилями. Бий у момент червоного спалаху.'),
    reward: { coins: 2000, crystals: 25, xp: 900 },
  },
];

export const WORLD_BOSS_MIN_COUNTRIES = WORLD_BOSSES[0].unlockCountries;
export const WORLD_BOSS_BY_ID = Object.fromEntries(WORLD_BOSSES.map((b) => [b.id, b]));

export function worldBossUnlocked(id, liberatedCount) {
  const cfg = WORLD_BOSS_BY_ID[id];
  return !!cfg && liberatedCount >= cfg.unlockCountries;
}

export function nextWorldBoss(liberatedCount) {
  return WORLD_BOSSES.find((b) => liberatedCount < b.unlockCountries) || null;
}

export class WorldBossMode {
  constructor(level, id) {
    this.level = level;
    this.cfg = WORLD_BOSS_BY_ID[id] || WORLD_BOSSES[0];
    this.id = this.cfg.id;
    this.roomSize = this.cfg.roomSize;
    this.completed = false;
    this.over = false;
    this.prompt = null;
    this.missions = [];
    this.civilians = [];
    this.bossStarted = true;
    this.bossUnlocked = true;
    this.allDone = false;
    this.hazards = [];
    this._hazardT = 1.2;
    this._shieldT = 4.0;
    this._coreT = 3.0;
    this._summonT = 7.0;
    const a = level.world.layout.arena || { x: 0, z: 0 };
    this.cx = a.x;
    this.cz = a.z;
    this._half = this.roomSize / 2;
    this._buildRoom();
    this._spawnBoss();
  }

  get(id) { void id; return null; }

  getHudList() {
    const hp = Math.max(0, Math.ceil(this.boss?.hp || 0));
    return [
      { icon: this.cfg.icon, title: this.cfg.name(), done: this.completed },
      { icon: '❤️', title: t('HP боса: {n}', { n: hp }), done: hp <= 0 },
      { icon: '💡', title: this.cfg.mechanic(), done: false },
    ];
  }

  getMarkers() {
    return this.boss && this.boss.state !== 'dead'
      ? [{ x: this.boss.x, z: this.boss.z, color: '#ff5d73', icon: this.cfg.icon }]
      : [];
  }

  remaining() {
    return this.boss && this.boss.state !== 'dead' ? 1 : 0;
  }

  update(dt = 0.016) {
    this._clampActor(this.level.player);
    if (this.boss && this.boss.state !== 'dead') this._clampZombie(this.boss);
    if (this.id === 'radiation') this._updateRadiation(dt);
    if (this.id === 'ice') this._updateIce(dt);
    if (this.id === 'titan') this._updateTitan(dt);
    this._updateHazards(dt);
  }

  onBossDied() {
    if (this.over) return;
    this.completed = true;
    this.over = true;
    this.level.game._endWorldBossRun(true);
  }

  results() {
    return {
      id: this.id,
      name: this.cfg.name(),
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
    };
  }

  dispose() {
    for (const h of this.hazards) {
      this.level.scene.remove(h.mesh);
      disposeObject(h.mesh);
    }
    this.hazards = [];
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x242833, roughness: 0.85, metalness: 0.05 });
    const railM = new THREE.MeshStandardMaterial({ color: this.cfg.color, roughness: 0.35, metalness: 0.15, emissive: this.cfg.color, emissiveIntensity: 0.12 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x303848, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.18, this.roomSize), floorM);
    floor.position.set(cx, level.world.groundH(cx, cz) - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const y = level.world.groundH(x, z) + 1.4;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), wallM);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz + 0.03), railM);
      stripe.position.set(x, y + 0.25, z);
      level.scene.add(wall, stripe);
    };
    mkWall(cx, cz - h, this.roomSize, 0.35);
    mkWall(cx, cz + h, this.roomSize, 0.35);
    mkWall(cx - h, cz, 0.35, this.roomSize);
    mkWall(cx + h, cz, 0.35, this.roomSize);
  }

  _spawnBoss() {
    const boss = this.level.zombies.spawn('boss', this.cx, this.cz - 11, {
      style: this.cfg.style,
      noLeash: true,
      anchor: { x: this.cx, z: this.cz, r: this._half - 3 },
    });
    boss.worldBoss = this.id;
    boss.maxHp = this.cfg.hp;
    boss.hp = this.cfg.hp;
    boss.stats = { ...boss.stats, hp: this.cfg.hp, coins: 0 };
    boss.aggroed = true;
    boss.state = 'chase';
    this.level.zombies.boss = boss;
    this.boss = boss;
    this.level.bus.emit('bossStart');
    this.level.game.hud.banner(this.cfg.name(), this.cfg.mechanic(), 4.2);
  }

  _updateRadiation(dt) {
    this._hazardT -= dt;
    if (this._hazardT > 0) return;
    this._hazardT = 5.4;
    const p = this.level.player.pos;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + this.level.stats.time * 0.7;
      const d = 5 + i * 3;
      this._addHazard(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 4.7, 4.0, 9, 0x79ff4d);
    }
    this.level.effects.ring(new THREE.Vector3(this.boss.x, this.boss.y, this.boss.z), 0x79ff4d, 7);
  }

  _updateIce(dt) {
    this._shieldT -= dt;
    if (this._shieldT <= 0) {
      const on = !this.boss.worldBossShield;
      this.boss.worldBossShield = on;
      this._shieldT = on ? 4.0 : 8.0;
      this.level.effects.ring(new THREE.Vector3(this.boss.x, this.boss.y, this.boss.z), on ? 0x9be8ff : 0xffffff, on ? 5.5 : 3.2);
      this.level.game.hud.toast(on ? t('❄️ Крижаний щит! Шкода тимчасово слабша.') : t('❄️ Щит спав! Стріляй зараз!'));
    }
  }

  _updateTitan(dt) {
    this._coreT -= dt;
    if (this._coreT <= 0) {
      const open = !this.boss.worldBossCoreOpen;
      this.boss.worldBossCoreOpen = open;
      this.boss.worldBossCoreClosed = !open;
      this._coreT = open ? 5.0 : 8.0;
      this.level.effects.ring(new THREE.Vector3(this.boss.x, this.boss.y, this.boss.z), open ? 0xff3a1e : 0xffc933, open ? 6.2 : 3.5);
      this.level.game.hud.toast(open ? t('🤖 Ядро відкрите! Нанось більше шкоди!') : t('🤖 Броня закрилась. Переживи фазу.'));
    }
    this._summonT -= dt;
    if (this._summonT <= 0) {
      this._summonT = 12.0;
      for (const off of [-5, 0, 5]) {
        const z = this.level.zombies.spawn('robot', this.cx + off, this.cz + 9, {
          noLeash: true,
          anchor: { x: this.cx, z: this.cz, r: this._half - 3 },
        });
        z.worldBossMinion = true;
        z.aggroed = true;
        z.state = 'chase';
      }
    }
  }

  _addHazard(x, z, r, life, dps, color) {
    const y = this.level.world.groundH(x, z) + 0.08;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.65, r, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    this.level.scene.add(mesh);
    this.hazards.push({ mesh, x, z, r, life, maxLife: life, dps, tick: 0 });
  }

  _updateHazards(dt) {
    const p = this.level.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h.mesh.material.opacity = Math.max(0, 0.45 * (h.life / h.maxLife));
      h.mesh.scale.setScalar(1 + Math.sin((this.level.stats.time + i) * 6) * 0.04);
      if (Math.hypot(p.pos.x - h.x, p.pos.z - h.z) <= h.r && p.health > 0) {
        h.tick += dt;
        if (h.tick >= 0.5) {
          h.tick = 0;
          p.takeDamage(h.dps * 0.5, h.x, h.z);
        }
      }
      if (h.life <= 0) {
        this.level.scene.remove(h.mesh);
        disposeObject(h.mesh);
        this.hazards.splice(i, 1);
      }
    }
  }

  _clampActor(p) {
    const x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, p.pos.x));
    const z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, p.pos.z));
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
  }

  _clampZombie(z) {
    z.x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, z.x));
    z.z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, z.z));
  }
}
```

- [ ] **Step 4: Run the config test**

Run:

```bash
node test/worldboss.mjs
```

Expected: PASS for model and config sections.

- [ ] **Step 5: Commit**

```bash
git add src/worldboss.js test/worldboss.mjs
git commit -m "Add world boss mode config"
```

### Task 3: Menu, Start Flow, and Level Wiring

**Files:**
- Modify: `src/main.js`
- Modify: `test/worldboss.mjs`

- [ ] **Step 1: Extend the test with menu and start-flow checks**

Append this block to `test/worldboss.mjs` before `await browser.close()`:

```js
console.log('▸ Світові боси: меню і старт');
const menuInfo = await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true };
  g.renderSoloMenu();
  const locked = document.querySelector('.solo-mode[data-mode="worldboss"]');
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true };
  g.renderSoloMenu();
  const open = document.querySelector('.solo-mode[data-mode="worldboss"]');
  return {
    locked: locked?.classList.contains('locked') || false,
    open: !!open && !open.classList.contains('locked'),
    text: open?.textContent || '',
  };
});
check(menuInfo.locked && menuInfo.open && menuInfo.text.includes('СВІТОВІ БОСИ'),
  'меню світових босів закрите до 4 країн і відкрите після 4', JSON.stringify(menuInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true };
  return g.test.startWorldBoss('radiation');
});
await page.waitForFunction(() => window.__game.state === 'level' && window.__game.level?.worldBoss, null, { timeout: 30000 });
const startInfo = await page.evaluate(() => {
  const g = window.__game;
  return {
    id: g.level.worldBoss.id,
    noShop: g.level.noShop,
    noGadgets: g.level.noGadgets,
    bossStyle: g.level.zombies.boss?.bossStyle,
    hp: g.level.zombies.boss?.maxHp,
    megabox: !!g.level.megabox,
    playerWeapons: g.level.player.weapons,
  };
});
check(startInfo.id === 'radiation' && startInfo.noShop && !startInfo.noGadgets,
  'світовий бос стартує як спецрежим: магазин вимкнений, гаджети доступні', JSON.stringify(startInfo));
check(startInfo.bossStyle === 'radiation' && startInfo.hp === 9000 && !startInfo.megabox,
  'Радіаційний бос має нову модель, HP і без мегабокса', JSON.stringify(startInfo));
check(startInfo.playerWeapons.includes('pistol'),
  'звичайний лоадаут гравця лишається доступним', JSON.stringify(startInfo.playerWeapons));
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/worldboss.mjs
```

Expected: FAIL because `main.js` does not know `worldboss` yet.

- [ ] **Step 3: Import world-boss helpers**

In `src/main.js`, add after the PvP import:

```js
import {
  WorldBossMode, WORLD_BOSSES, WORLD_BOSS_BY_ID, WORLD_BOSS_MIN_COUNTRIES,
  worldBossUnlocked, nextWorldBoss,
} from './worldboss.js';
```

- [ ] **Step 4: Add default save and migration**

In `_newSave()`, change:

```js
      hero: { ...DEFAULT_HERO },
      gadgetsOwned: [], gadgetHypers: [], activeGadget: null, megaPity: 0, quests: null, megaQuests: {}, stormBest: {},
```

to:

```js
      hero: { ...DEFAULT_HERO },
      gadgetsOwned: [], gadgetHypers: [], activeGadget: null, megaPity: 0, quests: null, megaQuests: {}, stormBest: {}, worldBosses: {},
```

In `_loadSave()`, after the `megaQuests` guard, add:

```js
        if (!out.worldBosses || typeof out.worldBosses !== 'object' || Array.isArray(out.worldBosses)) out.worldBosses = {};
```

- [ ] **Step 5: Add the solo menu card and boss list**

In `renderSoloMenu()`, after the arena mode object, insert:

```js
      {
        id: 'worldboss', icon: '🌋', name: t('СВІТОВІ БОСИ'), locked: libN < WORLD_BOSS_MIN_COUNTRIES,
        desc: libN < WORLD_BOSS_MIN_COUNTRIES
          ? t('Відкриється після {n} звільнених країн', { n: WORLD_BOSS_MIN_COUNTRIES })
          : t('Великі боси з окремими механіками і разовими нагородами.'),
      },
```

In the click handler, add a branch after `arena` and before `knockout`:

```js
        } else if (mode === 'worldboss') {
          root.querySelectorAll('.solo-mode').forEach((x) => x.classList.toggle('sel', x === el));
          cRoot.style.display = '';
          cRoot.innerHTML = t('<div class="solo-cty-title">Якого світового боса викликаємо?</div>')
            + WORLD_BOSSES.map((b) => {
              const ok = worldBossUnlocked(b.id, libN);
              const done = !!(this.save.worldBosses && this.save.worldBosses[b.id]);
              const label = ok
                ? `${b.icon} ${b.shortName()}${done ? ' ✅' : ''}`
                : `${b.icon} ${b.shortName()} 🔒 ${b.unlockCountries}`;
              return `<button class="btn solo-cty ${ok ? '' : 'locked'}" data-id="${b.id}">${label}</button>`;
            }).join('');
          cRoot.querySelectorAll('.solo-cty').forEach((b) => {
            b.addEventListener('click', () => {
              if (b.classList.contains('locked')) { this.audio.denied(); return; }
              this.audio.click();
              this._hideOverlay('overlay-solo');
              this.startWorldBoss(b.dataset.id);
            });
          });
```

- [ ] **Step 6: Add `startWorldBoss(id)`**

In `src/main.js`, add after `startArena()` and before `startKnockout()`:

```js
  // ---------- 🌋 Світові боси ----------
  startWorldBoss(id) {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🌋🤝 Світові боси поки доступні тільки у соло.'));
      this.audio.denied();
      return;
    }
    const cfg = WORLD_BOSS_BY_ID[id];
    const lib = Object.keys(this.save.liberated || {}).length;
    if (!cfg) {
      this.audio.denied();
      this.hud.toast(t('🌋 Такого світового боса немає.'));
      return;
    }
    if (!worldBossUnlocked(id, lib)) {
      this.audio.denied();
      this.hud.toast(t('🌋 {b} відкриється після {n} звільнених країн!', { b: cfg.shortName(), n: cfg.unlockCountries }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { worldBoss: id });
  }
```

- [ ] **Step 7: Wire the level flags**

In `_buildLevel()`, after `const isPvp = !!opts.pvp;`, add:

```js
    const worldBossId = opts.worldBoss || null;
    const isWorldBoss = !!worldBossId;
```

Change:

```js
    document.body.classList.toggle('no-shop-mode', isStorm || isKnockout || isDefense || isPvp);
```

to:

```js
    document.body.classList.toggle('no-shop-mode', isStorm || isKnockout || isDefense || isPvp || isWorldBoss);
```

In the loading title chain, add World Boss before PvP:

```js
    document.getElementById('ll-title').textContent = isWorldBoss
      ? t('🌋 СВІТОВИЙ БОС')
      : isPvp
```

In the level comment, add:

```js
     *   worldBoss — тільки в режимі Світового боса; інакше — undefined.
```

In the `level` object, change:

```js
      noGadgets: isKnockout || isDefense || isPvp,
      noShop: isStorm || isKnockout || isDefense || isPvp,
```

to:

```js
      noGadgets: isKnockout || isDefense || isPvp,
      noShop: isStorm || isKnockout || isDefense || isPvp || isWorldBoss,
```

Change the solo replay calculation:

```js
    const soloReplay = !isStorm && !isArena && !isKnockout && !isDefense && !isPvp && !coopActive && !!(this.save.liberated && this.save.liberated[countryId]);
```

to:

```js
    const soloReplay = !isStorm && !isArena && !isKnockout && !isDefense && !isPvp && !isWorldBoss && !coopActive && !!(this.save.liberated && this.save.liberated[countryId]);
```

After the PvP mode branch, add:

```js
    } else if (isWorldBoss) {
      level.worldBoss = new WorldBossMode(level, worldBossId);
      level.missions = level.worldBoss;
```

Change Megabox creation logic wherever it excludes special modes so it includes World Boss:

```js
isArena || isKnockout || isDefense || isPvp || isWorldBoss
```

In the player spawn block, change:

```js
    if (isArena || isKnockout || isDefense || isPvp) {
```

to:

```js
    if (isArena || isKnockout || isDefense || isPvp || isWorldBoss) {
```

and use:

```js
      const z = isWorldBoss ? a.z + 16 : isKnockout ? a.z : isPvp ? a.z + 4 : isDefense ? a.z + 8 : a.z + 12;
```

- [ ] **Step 8: Add world-boss banner text**

Change the banner title/text block near the end of `_buildLevel()` to include World Boss first:

```js
    const bannerSub = typeof country.banner === 'function' ? country.banner() : country.banner;
    const bannerTitle = level.worldBoss ? level.worldBoss.cfg.name() : level.pvp ? t('⚔️ ПВП') : level.defense ? t('🛡️ ОБОРОНА') : level.knockout ? t('🥊 НОКАУТ') : level.playground ? t('🧪 Полігон гаджетів') : `${country.flag} ${country.name.toUpperCase()}`;
    const bannerText = level.worldBoss ? level.worldBoss.cfg.mechanic() : level.pvp ? t('Посох проти зомбі на 250 HP. У тебе 50 HP.') : level.defense ? t('Захисти вежу: 250 HP, пістолет і автомат') : level.knockout ? t('10 зомбі, 1 пістолет, без магазину й гаджетів') : level.playground ? t('Спробуй будь-який гаджет без нагород і ризику') : bannerSub;
```

- [ ] **Step 9: Add test API helper**

In `get test`, add near the other start helpers:

```js
      startWorldBoss: (id) => {
        g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true, DIN: true };
        return g.startWorldBoss(id);
      },
```

In `test.state()`, add after `storm`:

```js
        worldBoss: g.level && g.level.worldBoss ? {
          id: g.level.worldBoss.id,
          over: g.level.worldBoss.over,
          bossHp: g.level.zombies.boss ? g.level.zombies.boss.hp : null,
          shield: !!(g.level.zombies.boss && g.level.zombies.boss.worldBossShield),
          coreOpen: !!(g.level.zombies.boss && g.level.zombies.boss.worldBossCoreOpen),
          hazards: g.level.worldBoss.hazards.length,
        } : null,
        worldBosses: { ...(g.save.worldBosses || {}) },
```

- [ ] **Step 10: Run the world-boss test**

Run:

```bash
node test/worldboss.mjs
```

Expected: PASS through the menu/start-flow section.

- [ ] **Step 11: Commit**

```bash
git add src/main.js test/worldboss.mjs
git commit -m "Wire world boss mode"
```

### Task 4: Mechanics and Damage Modifiers

**Files:**
- Modify: `src/zombies.js`
- Modify: `test/worldboss.mjs`

- [ ] **Step 1: Extend the test with mechanics checks**

Append this block to `test/worldboss.mjs` before `await browser.close()`:

```js
console.log('▸ Світові боси: механіки');
const radiationInfo = await page.evaluate(() => {
  const g = window.__game;
  for (let i = 0; i < 420; i++) g.level.worldBoss.update(1 / 60);
  return {
    hazards: g.level.worldBoss.hazards.length,
    hpBefore: g.level.player.health,
  };
});
check(radiationInfo.hazards > 0, 'Бос Радіації створює токсичні зони', JSON.stringify(radiationInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startWorldBoss('ice');
});
await page.waitForFunction(() => window.__game.level?.worldBoss?.id === 'ice', null, { timeout: 30000 });
const iceInfo = await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.zombies.boss;
  b.worldBossShield = true;
  const hp0 = b.hp;
  b.damage(100, null, false);
  const shielded = hp0 - b.hp;
  b.worldBossShield = false;
  const hp1 = b.hp;
  b.damage(100, null, false);
  const open = hp1 - b.hp;
  return { shielded, open };
});
check(iceInfo.shielded < iceInfo.open && iceInfo.shielded === 25,
  'крижаний щит зменшує шкоду до 25%', JSON.stringify(iceInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startWorldBoss('titan');
});
await page.waitForFunction(() => window.__game.level?.worldBoss?.id === 'titan', null, { timeout: 30000 });
const titanInfo = await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.zombies.boss;
  b.worldBossCoreClosed = true;
  b.worldBossCoreOpen = false;
  const hp0 = b.hp;
  b.damage(100, null, false);
  const closed = hp0 - b.hp;
  b.worldBossCoreClosed = false;
  b.worldBossCoreOpen = true;
  const hp1 = b.hp;
  b.damage(100, null, false);
  const open = hp1 - b.hp;
  return { closed, open };
});
check(titanInfo.closed === 35 && titanInfo.open === 140,
  'ядро Титана: 35% шкоди закрите, 140% відкрите', JSON.stringify(titanInfo));
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/worldboss.mjs
```

Expected: FAIL on ice/titan damage checks because `_damage()` does not apply world-boss modifiers yet.

- [ ] **Step 3: Add one centralized damage modifier hook**

In `src/zombies.js`, inside `_damage(z, amt, dir, headshot, opts)`, immediately after:

```js
    const fire = !!(opts && opts.fire);
```

add:

```js
    if (z.worldBossShield) amt = Math.max(1, Math.round(amt * 0.25));
    if (z.worldBossCoreClosed) amt = Math.max(1, Math.round(amt * 0.35));
    if (z.worldBossCoreOpen) amt = Math.max(1, Math.round(amt * 1.4));
```

This is intentionally in `_damage`, not in each weapon, so bullets, explosions, rockets, fire, and tests all obey the same rule.

- [ ] **Step 4: Run the mechanics test**

Run:

```bash
node test/worldboss.mjs
```

Expected: PASS through mechanics.

- [ ] **Step 5: Commit**

```bash
git add src/zombies.js test/worldboss.mjs
git commit -m "Add world boss mechanics"
```

### Task 5: Win, Lose, Rewards, and Replay

**Files:**
- Modify: `src/main.js`
- Modify: `src/worldboss.js`
- Modify: `test/worldboss.mjs`

- [ ] **Step 1: Extend the test with rewards and death checks**

Append this block to `test/worldboss.mjs` before `await browser.close()`:

```js
console.log('▸ Світові боси: перемога, нагорода, смерть');
await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.save.worldBosses = {};
  g.save.coins = 100;
  g.save.crystals = 0;
  g.save.xp = 0;
  g.test.startWorldBoss('radiation');
});
await page.waitForFunction(() => window.__game.level?.worldBoss?.id === 'radiation', null, { timeout: 30000 });
await page.evaluate(() => {
  const g = window.__game;
  g.level.zombies.boss.damage(99999, null, false);
});
await page.waitForFunction(() => document.getElementById('overlay-arena-end').classList.contains('show'), null, { timeout: 30000 });
const winInfo = await page.evaluate(() => ({
  title: document.querySelector('#overlay-arena-end h1').textContent,
  stats: document.getElementById('arena-stats').textContent,
  coins: window.__game.save.coins,
  crystals: window.__game.save.crystals,
  xp: window.__game.save.xp,
  done: window.__game.save.worldBosses.radiation,
  last: window.__game._lastEndMode,
}));
check(winInfo.title.includes('БОСА ПЕРЕМОЖЕНО') && winInfo.done && winInfo.last === 'worldboss',
  'перемога світового боса показує результат і записує clear', JSON.stringify(winInfo));
check(winInfo.coins >= 900 && winInfo.crystals === 10 && winInfo.xp >= 450,
  'перша перемога дає монети, кристали і XP', JSON.stringify(winInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startWorldBoss('radiation');
});
await page.waitForFunction(() => window.__game.level?.worldBoss?.id === 'radiation', null, { timeout: 30000 });
await page.evaluate(() => window.__game.level.zombies.boss.damage(99999, null, false));
await page.waitForFunction(() => document.getElementById('overlay-arena-end').classList.contains('show'), null, { timeout: 30000 });
const replayInfo = await page.evaluate(() => ({
  crystals: window.__game.save.crystals,
  stats: document.getElementById('arena-stats').textContent,
}));
check(replayInfo.crystals === 10 && replayInfo.stats.includes('вже отримано'),
  'повтор не дублює разову нагороду', JSON.stringify(replayInfo));

await page.evaluate(() => {
  const g = window.__game;
  g.endLevel();
  g.test.startWorldBoss('ice');
});
await page.waitForFunction(() => window.__game.level?.worldBoss?.id === 'ice', null, { timeout: 30000 });
await page.evaluate(() => window.__game.level.player.takeDamage(9999, 0, 0));
await page.waitForFunction(() => document.getElementById('overlay-arena-end').classList.contains('show'), null, { timeout: 30000 });
const loseInfo = await page.evaluate(() => ({
  title: document.querySelector('#overlay-arena-end h1').textContent,
  state: window.__game.state,
  deathT: window.__game.deathT,
}));
check(loseInfo.title.includes('БОС СИЛЬНІШИЙ') && loseInfo.deathT === -1,
  'смерть у світовому босі завершує забіг без респавну', JSON.stringify(loseInfo));
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node test/worldboss.mjs
```

Expected: FAIL because boss death still routes to campaign victory, and player death has no world-boss branch.

- [ ] **Step 3: Route boss death before campaign victory**

In `_onBossDied()`, after the Boss Rush branch and before the Storm branch, add:

```js
    if (this.level && this.level.worldBoss) {
      this.level.worldBoss.onBossDied();
      return;
    }
```

- [ ] **Step 4: Route player death**

In `_onPlayerDied()`, after the Storm branch and before Knockout, add:

```js
    if (this.level.worldBoss) {
      this._endWorldBossRun(false);
      return;
    }
```

- [ ] **Step 5: Add world-boss end flow**

In `src/main.js`, add after `_endPvpRun()`:

```js
  _endWorldBossRun(won = true) {
    const level = this.level;
    if (!level || !level.worldBoss || level.worldBoss.over && !won) return;
    const mode = level.worldBoss;
    mode.completed = !!won;
    mode.over = true;
    level.bossDefeated = !!won;
    this.victoryShown = !!won;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.audio.setMode(null);
    this.input.exitLock();
    const retryBtn = document.getElementById('btn-arena-retry');
    if (retryBtn) {
      retryBtn.style.display = '';
      retryBtn.textContent = t('🌋 Ще раз!');
    }

    let rewardTitle = t('Нагороду вже отримано');
    const firstClear = won && !(this.save.worldBosses && this.save.worldBosses[mode.id]);
    if (firstClear) {
      this.save.worldBosses = this.save.worldBosses || {};
      this.save.worldBosses[mode.id] = true;
      this.save.coins += mode.cfg.reward.coins;
      this.save.crystals = (this.save.crystals || 0) + mode.cfg.reward.crystals;
      this.progress.addXp(mode.cfg.reward.xp);
      rewardTitle = t('🪙 +{c} · 💎 +{k} · ⭐ +{x} XP', {
        c: mode.cfg.reward.coins,
        k: mode.cfg.reward.crystals,
        x: mode.cfg.reward.xp,
      });
      this.saveGame();
    }

    this._lastEndMode = 'worldboss';
    this._lastWorldBossId = mode.id;
    const res = mode.results();
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🌋 СВІТОВОГО БОСА ПЕРЕМОЖЕНО!') : t('💀 БОС СИЛЬНІШИЙ ЦЬОГО РАЗУ');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">${mode.cfg.icon}</span><span class="stat-name">${t('Бос')}</span><span class="stat-val">${mode.cfg.shortName()}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${level.stats.kills}</span></div>
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${won ? rewardTitle : t('Без нагороди')}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }
```

- [ ] **Step 6: Fix retry button routing**

In the `btn-arena-retry` click handler, change:

```js
      if (mode === 'knockout') this.startKnockout();
      else if (mode === 'defense') this.startDefense();
      else if (mode === 'pvp') this.startPvp();
      else this.startArena();
```

to:

```js
      if (mode === 'knockout') this.startKnockout();
      else if (mode === 'defense') this.startDefense();
      else if (mode === 'pvp') this.startPvp();
      else if (mode === 'worldboss') this.startWorldBoss(this._lastWorldBossId || 'radiation');
      else this.startArena();
```

- [ ] **Step 7: Clean world-boss hazards on level end**

In `endLevel()`, before disposing `level.effects`, add:

```js
      if (this.level.worldBoss && this.level.worldBoss.dispose) this.level.worldBoss.dispose();
```

Also add `overlay-arena-end` already exists in the hide list, so no new overlay entry is needed.

- [ ] **Step 8: Keep chapter/campaign events out of world bosses**

In `src/main.js`, update all special-mode exclusions that currently check `!level.knockout && !level.defense && !level.pvp` to include `!level.worldBoss`.

For example:

```js
if (!level.knockout && !level.defense && !level.pvp && !level.worldBoss) this.chapter.onEvent('kill');
```

Apply the same pattern to `chapter.onEvent('boss')`, `mission`, `gadget`, `enterLevel`, and combo counting.

In the boss quest block, change:

```js
      if (z.type === 'boss' && !level.storm) {
```

to:

```js
      if (z.type === 'boss' && !level.storm && !level.worldBoss) {
```

- [ ] **Step 9: Run the win/lose test**

Run:

```bash
node test/worldboss.mjs
```

Expected: PASS through rewards and death flow.

- [ ] **Step 10: Commit**

```bash
git add src/main.js src/worldboss.js test/worldboss.mjs
git commit -m "Add world boss rewards"
```

### Task 6: Cloud Save Safety

**Files:**
- Modify: `src/net/cloudsave.js`
- Modify: `test/cloudsave.mjs`

- [ ] **Step 1: Add the failing cloud-save progress check**

In `test/cloudsave.mjs`, add a new case near the other permanent progression checks:

```js
  check(saveHasProgress({ worldBosses: { radiation: true } }),
    'worldBosses рахується як реальний прогрес');
```

- [ ] **Step 2: Run the cloud save test and verify it fails**

Run:

```bash
node test/cloudsave.mjs
```

Expected: FAIL because `saveHasProgress()` does not inspect `worldBosses` yet.

- [ ] **Step 3: Update `saveHasProgress()`**

In `src/net/cloudsave.js`, add this condition after the `stormBest` condition:

```js
    || Object.keys(s.worldBosses || {}).length > 0
```

- [ ] **Step 4: Run the cloud save test**

Run:

```bash
node test/cloudsave.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/net/cloudsave.js test/cloudsave.mjs
git commit -m "Preserve world boss save progress"
```

### Task 7: Localization and UI Text

**Files:**
- Modify: `src/i18n/en.js`
- Modify: `src/i18n/ru.js`
- Test: `test/i18n.mjs`

- [ ] **Step 1: Run i18n test before adding strings**

Run:

```bash
node test/i18n.mjs
```

Expected: PASS before edits.

- [ ] **Step 2: Add English translations**

In `src/i18n/en.js`, add entries for these Ukrainian source strings:

```js
  'СВІТОВІ БОСИ': 'WORLD BOSSES',
  'Великі боси з окремими механіками і разовими нагородами.': 'Huge bosses with unique mechanics and one-time rewards.',
  'Якого світового боса викликаємо?': 'Which world boss do we summon?',
  '☢️ БОС РАДІАЦІЇ': '☢️ RADIATION BOSS',
  'Бос Радіації': 'Radiation Boss',
  '❄️ КРИЖАНИЙ ГЕНЕРАЛ': '❄️ ICE GENERAL',
  'Крижаний Генерал': 'Ice General',
  '🤖 МЕХАНІЧНИЙ ТИТАН': '🤖 MECHANICAL TITAN',
  'Механічний Титан': 'Mechanical Titan',
  'Токсичні зони на підлозі. Не стій у зеленому колі.': 'Toxic zones appear on the floor. Do not stand in the green circle.',
  'Крижаний щит інколи зменшує шкоду. Перечекай і стріляй після спаду.': 'The ice shield sometimes reduces damage. Wait it out, then shoot.',
  'Слабке ядро відкривається хвилями. Бий у момент червоного спалаху.': 'The weak core opens in waves. Attack during the red flash.',
  '🌋 СВІТОВИЙ БОС': '🌋 WORLD BOSS',
  '🌋🤝 Світові боси поки доступні тільки у соло.': '🌋🤝 World Bosses are solo-only for now.',
  '🌋 Такого світового боса немає.': '🌋 That world boss does not exist.',
  '🌋 {b} відкриється після {n} звільнених країн!': '🌋 {b} unlocks after {n} liberated countries!',
  'HP боса: {n}': 'Boss HP: {n}',
  '❄️ Крижаний щит! Шкода тимчасово слабша.': '❄️ Ice shield! Damage is reduced for a moment.',
  '❄️ Щит спав! Стріляй зараз!': '❄️ Shield down! Shoot now!',
  '🤖 Ядро відкрите! Нанось більше шкоди!': '🤖 Core open! Deal extra damage!',
  '🤖 Броня закрилась. Переживи фазу.': '🤖 Armor closed. Survive the phase.',
  'Нагороду вже отримано': 'Reward already claimed',
  '🪙 +{c} · 💎 +{k} · ⭐ +{x} XP': '🪙 +{c} · 💎 +{k} · ⭐ +{x} XP',
  '🌋 СВІТОВОГО БОСА ПЕРЕМОЖЕНО!': '🌋 WORLD BOSS DEFEATED!',
  '💀 БОС СИЛЬНІШИЙ ЦЬОГО РАЗУ': '💀 THE BOSS WON THIS TIME',
  'Бос': 'Boss',
```

- [ ] **Step 3: Add Russian translations**

In `src/i18n/ru.js`, add entries for the same source strings:

```js
  'СВІТОВІ БОСИ': 'МИРОВЫЕ БОССЫ',
  'Великі боси з окремими механіками і разовими нагородами.': 'Большие боссы с отдельными механиками и разовыми наградами.',
  'Якого світового боса викликаємо?': 'Какого мирового босса вызвать?',
  '☢️ БОС РАДІАЦІЇ': '☢️ БОСС РАДИАЦИИ',
  'Бос Радіації': 'Босс Радиации',
  '❄️ КРИЖАНИЙ ГЕНЕРАЛ': '❄️ ЛЕДЯНОЙ ГЕНЕРАЛ',
  'Крижаний Генерал': 'Ледяной Генерал',
  '🤖 МЕХАНІЧНИЙ ТИТАН': '🤖 МЕХАНИЧЕСКИЙ ТИТАН',
  'Механічний Титан': 'Механический Титан',
  'Токсичні зони на підлозі. Не стій у зеленому колі.': 'На полу появляются токсичные зоны. Не стой в зелёном круге.',
  'Крижаний щит інколи зменшує шкоду. Перечекай і стріляй після спаду.': 'Ледяной щит иногда уменьшает урон. Пережди и стреляй после спада.',
  'Слабке ядро відкривається хвилями. Бий у момент червоного спалаху.': 'Слабое ядро открывается волнами. Бей во время красной вспышки.',
  '🌋 СВІТОВИЙ БОС': '🌋 МИРОВОЙ БОСС',
  '🌋🤝 Світові боси поки доступні тільки у соло.': '🌋🤝 Мировые боссы пока доступны только в соло.',
  '🌋 Такого світового боса немає.': '🌋 Такого мирового босса нет.',
  '🌋 {b} відкриється після {n} звільнених країн!': '🌋 {b} откроется после {n} освобождённых стран!',
  'HP боса: {n}': 'HP босса: {n}',
  '❄️ Крижаний щит! Шкода тимчасово слабша.': '❄️ Ледяной щит! Урон временно снижен.',
  '❄️ Щит спав! Стріляй зараз!': '❄️ Щит спал! Стреляй сейчас!',
  '🤖 Ядро відкрите! Нанось більше шкоди!': '🤖 Ядро открыто! Наноси больше урона!',
  '🤖 Броня закрилась. Переживи фазу.': '🤖 Броня закрылась. Переживи фазу.',
  'Нагороду вже отримано': 'Награда уже получена',
  '🪙 +{c} · 💎 +{k} · ⭐ +{x} XP': '🪙 +{c} · 💎 +{k} · ⭐ +{x} XP',
  '🌋 СВІТОВОГО БОСА ПЕРЕМОЖЕНО!': '🌋 МИРОВОЙ БОСС ПОБЕЖДЁН!',
  '💀 БОС СИЛЬНІШИЙ ЦЬОГО РАЗУ': '💀 БОСС СИЛЬНЕЕ В ЭТОТ РАЗ',
  'Бос': 'Босс',
```

- [ ] **Step 4: Run i18n test**

Run:

```bash
node test/i18n.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/en.js src/i18n/ru.js
git commit -m "Localize world bosses"
```

### Task 8: Release Bump and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `version.json`
- Modify: `src/main.js`
- Modify: `sw.js`

- [ ] **Step 1: Bump version to v152**

Update:

- `version.json` version/build to `152`.
- `src/main.js` `APP_VERSION` to `152`.
- `sw.js` cache key/version to `152`.

- [ ] **Step 2: Add README release note**

At the top of `README.md`, add a new v152 entry:

```md
## v152 — Світові боси

- Додано режим **Світові боси** у меню “Грати”.
- Додано трьох босів: ☢️ Бос Радіації, ❄️ Крижаний Генерал, 🤖 Механічний Титан.
- Кожен бос має нову процедурну модель, окрему механіку і разову нагороду.
- Магазин у режимі вимкнений, але зброя з Гардероба і гаджети доступні.
- Додано захист хмарного сейва для переможених світових босів.
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
node test/worldboss.mjs
node test/cloudsave.mjs
node test/i18n.mjs
node test/version-sync.mjs
```

Expected: all PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Check formatting and git state**

Run:

```bash
git diff --check
git status --short --branch
```

Expected:

```text
## main...origin/main
```

plus only the intended changed files before commit.

- [ ] **Step 6: Commit release**

```bash
git add README.md version.json src/main.js sw.js
git commit -m "Release v152 world bosses"
```

- [ ] **Step 7: Final push if on `main` and all tests passed**

```bash
git push origin main
```

Expected: push succeeds.

## Self-Review Checklist

- [ ] Spec coverage: all three bosses are in one plan, all three get new procedural models, unlock rules, mechanics, rewards, UI, save safety, tests, and release notes.
- [ ] Placeholder scan: no forbidden vague markers remain.
- [ ] Type consistency: world-boss ids are `radiation`, `ice`, `titan`; model styles are `radiation`, `iceGeneral`, `mechTitan`; save key is `worldBosses`.
- [ ] Ponytail check: one mode module, one config array, one damage hook, reused overlay/menu/test patterns, no new dependencies or asset pipeline.
