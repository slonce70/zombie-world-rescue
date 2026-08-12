// 💥 Ланцюг підривників: два підривники в радіусі один одного мусять дати рівно два
// нарахування, а не три-чотири. Three.js тут не потрібен — беремо справжні тіла
// _explode і _kill прямо з тексту src/zombies.js і крутимо їх на макеті рівня.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/zombies.js', import.meta.url), 'utf8');

const explodeBody = src.match(/\n {2}_explode\(z, dir\) \{\n([\s\S]*?)\n {2}\}\n/);
assert.ok(explodeBody, 'у src/zombies.js має бути метод _explode(z, dir)');
const killBody = src.match(/\n {2}_kill\(z, dir\) \{\n([\s\S]*?)\n {2}\}\n/);
assert.ok(killBody, 'у src/zombies.js має бути метод _kill(z, dir)');

// вільні змінні тіл: константи модуля, хелпери рига і THREE (тільки Vector3)
globalThis.EXPLODER_RADIUS = Number(src.match(/EXPLODER_RADIUS = ([\d.]+)/)[1]);
globalThis.EXPLODER_DMG = Number(src.match(/EXPLODER_DMG = ([\d.]+)/)[1]);
globalThis.THREE = { Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } } };
globalThis.setAnim = () => {};
globalThis.impactSide = () => 'front';
globalThis.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
globalThis.t = (s) => s;

const _explode = new Function('z', 'dir', explodeBody[1]);
const _kill = new Function('z', 'dir', killBody[1]);

const zombie = (type, x, extra = {}) => ({
  type, x, y: 0, z: 0, hp: 55, maxHp: 55, nid: `${type}-${x}`,
  state: 'chase', gone: false, exploded: false, stats: { coins: 5, pitch: 1 },
  rig: { anim: {} }, ...extra,
});

const makeZombies = (list) => {
  const emitted = [];
  const netEvents = [];
  const spawned = [];
  return {
    list, emitted, netEvents, spawned,
    rng: { range: () => 0, chance: () => false, pick: (a) => a[0] },
    boss: null,
    hordeRemaining: 0,
    _hurt: () => {},
    _reviveShaman(z) { z.revivedOnce = true; z.hp = z.maxHp; },
    _explode, _kill,
    spawn(type, x, z, opt) {
      const mn = zombie(type, x, { ...opt, hp: 20, maxHp: 20, z });
      spawned.push(mn);
      this.list.push(mn); // як у справжньому spawn(): міні одразу в загальному списку
      return mn;
    },
    level: {
      net: null,
      player: { pos: { x: 100, y: 0, z: 100 }, health: 100 },
      stats: { kills: 0 },
      effects: {
        burst: () => {}, ring: () => {}, spawnCoin: () => {}, spawnPickup: () => {},
        robotBoom: () => {}, damageNumber: () => {},
      },
      audio: {
        explosion: () => {}, zdie: () => {}, killPop: () => {},
        goldenJingle: () => {}, powerup: () => {},
      },
      bus: { emit: (name, ...args) => emitted.push([name, ...args]) },
      netEv: (name, ...args) => netEvents.push([name, ...args]),
    },
  };
};

const killEvents = (zs) => zs.emitted.filter((e) => e[0] === 'zombieKilled').length;

test('ланцюг із двох підривників нараховує кожного рівно один раз', () => {
  const a = zombie('exploder', 0);
  const b = zombie('exploder', 2); // у радіусі 4.5 від A
  const zs = makeZombies([a, b]);
  zs._explode(a, null);

  assert.equal(zs.level.stats.kills, 2, 'два підривники — дві перемоги, не три-чотири');
  assert.equal(killEvents(zs), 2, 'zombieKilled (XP, бестіарій, вторинні цілі) — по одному на зомбі');
  assert.equal(zs.netEvents.filter((e) => e[0] === 'zd').length, 2, 'кооп бачить дві смерті');
  assert.equal(a.state, 'dead');
  assert.equal(b.state, 'dead');
});

test('_kill двічі поспіль нічого не додає', () => {
  const z = zombie('walker', 0);
  const zs = makeZombies([z]);
  zs._kill(z, null);
  zs._kill(z, null);
  assert.equal(zs.level.stats.kills, 1);
  assert.equal(killEvents(zs), 1);
  // прибраний зі сцени зомбі (gone) теж не воскресає заради повторного лутання
  const g = zombie('walker', 5, { gone: true });
  zs.list.push(g);
  zs._kill(g, null);
  assert.equal(zs.level.stats.kills, 1, 'прибраний зомбі не нараховується');
});

test('міні-зомбі розділювача не гинуть у мить народження', () => {
  const a = zombie('exploder', 0);
  const sp = zombie('splitter', 2, { hp: 40 });
  const zs = makeZombies([a, sp]);
  zs._explode(a, null);

  assert.equal(zs.spawned.length, 2, 'розділювач дав двох міні');
  assert.ok(zs.spawned.every((m) => m.state !== 'dead' && m.hp > 0),
    'новонароджені міні лишаються живими — цикл вибуху йде по копії списку');
  assert.equal(zs.level.stats.kills, 2, 'підривник + розділювач, міні не рахуються');
});

test('одиночний вибух без сусідів рахується один раз', () => {
  const a = zombie('exploder', 0);
  const far = zombie('walker', 40);
  const zs = makeZombies([a, far]);
  zs._explode(a, null);
  assert.equal(zs.level.stats.kills, 1);
  assert.equal(far.state, 'chase', 'зомбі поза радіусом не чіпаємо');
});
