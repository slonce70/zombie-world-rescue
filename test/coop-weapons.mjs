// Co-op weapon regressions: network-visible weapon ids, continuous weapons from guest,
// and host-side shot validation.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();

let failed = 0;
const check = (cond, msg, extra = '') => {
  console.log(cond ? '  ✅' : '  ❌', msg, extra);
  if (!cond) failed++;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(`${BASE}/?test&fresh&country=UKR`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

  console.log('▸ Protocol: every gameplay weapon round-trips over co-op');
  const protocol = await page.evaluate(async () => {
    const { WEAPON_SLOTS } = await import('/src/player.js');
    const { weaponToIdx, idxToWeapon } = await import('/src/net/protocol.js');
    return WEAPON_SLOTS.map((id) => ({ id, idx: weaponToIdx(id), back: idxToWeapon(weaponToIdx(id)) }));
  });
  const badProtocol = protocol.filter((r) => r.back !== r.id);
  check(badProtocol.length === 0, 'WEAPON_IDX covers all gameplay weapons', JSON.stringify(badProtocol));

  console.log('▸ RemotePlayer: snapshots can show fuel weapons');
  const remote = await page.evaluate(async () => {
    const { Scene } = await import('/vendor/three.module.js');
    const { RemotePlayer } = await import('/src/net/remoteplayer.js');
    const { weaponToIdx } = await import('/src/net/protocol.js');
    const level = { scene: new Scene() };
    const rp = new RemotePlayer(level, 2, { nick: 'Guest' });
    const out = {};
    for (const id of ['laser', 'flamethrower']) {
      try {
        rp.apply(0, 0, 0, 0, 0, 100, 100, weaponToIdx(id), 0, -1, null);
        out[id] = rp.curWeapon;
      } catch (e) {
        out[id] = `ERR:${e.message}`;
      }
    }
    return out;
  });
  check(remote.laser === 'laser', 'remote rig switches to laser', JSON.stringify(remote));
  check(remote.flamethrower === 'flamethrower', 'remote rig switches to flamethrower', JSON.stringify(remote));

  console.log('▸ Guest continuous weapons: report authoritative hits to host');
  const cont = await page.evaluate(() => {
    const g = window.__game;
    const level = g.level;
    const pl = level.player;
    g.test.giveWeapon('laser');
    g.test.teleport(0, 0);
    pl.switchWeapon('laser');
    const z = g.test.spawnZombie('walker', pl.pos.x, pl.pos.z - 8);
    z.maxHp = z.hp = 999999;

    const prevMirror = level.mirror;
    const prevNet = level.net;
    const reports = [];
    level.mirror = true;
    level.net = {
      shotReport(weapon, endPoint, hits) {
        reports.push({ weapon, endPoint: !!endPoint, hits: hits || [] });
      },
    };
    pl._contWasEmpty = false;
    pl._fireContinuous(0.2, true);
    level.mirror = prevMirror;
    level.net = prevNet;
    z.damage(999999, null, false);
    return reports;
  });
  check(cont.length === 1, 'guest laser sends one shotReport pulse', JSON.stringify(cont));
  check(cont[0] && cont[0].weapon === 'laser', 'shotReport keeps laser weapon id', JSON.stringify(cont[0]));
  check(cont[0] && cont[0].hits && cont[0].hits.length > 0, 'shotReport carries laser hit ids/damage', JSON.stringify(cont[0]));

  console.log('▸ Host validation: shotgun reports keep shotgun range');
  const shotgun = await page.evaluate(async () => {
    const { HostNet } = await import('/src/net/host.js');
    const { weaponToIdx } = await import('/src/net/protocol.js');
    const { Vector3 } = await import('/vendor/three.module.js');
    let damaged = false;
    const zombie = {
      nid: 77,
      x: 100,
      z: 0,
      state: 'wander',
      damage() { damaged = true; },
    };
    const host = Object.create(HostNet.prototype);
    host.level = {
      player: { pos: new Vector3(0, 0, 0) },
      zombies: { byNid: (nid) => (nid === 77 ? zombie : null) },
      effects: { tracer() {} },
      audio: { shot() {} },
    };
    host.remotes = new Map([[2, { pos: new Vector3(0, 0, 0), muzzleWorld: (v) => v.set(0, 1, 0) }]]);
    host._tmpV = new Vector3();
    host.ev = () => {};
    host._onShot(2, { w: weaponToIdx('shotgun'), e: [100, 1, 0], hits: [[77, 100, 0]] });
    return { damaged };
  });
  check(!shotgun.damaged, 'host rejects shotgun hit beyond 75 units', JSON.stringify(shotgun));

  console.log('▸ Guest pet pickup: mirror items stay host-authoritative');
  const petPickup = await page.evaluate(() => {
    const g = window.__game;
    const level = g.level;
    const effects = level.effects;
    const prevMirror = level.mirror;
    let granted = 0;
    const prevPickup = effects.onPickup;
    level.mirror = true;
    effects.onPickup = (type, value) => { if (type === 'coin') granted += value; };
    const c = { nid: 12345, type: 'coin', value: 40, mesh: { position: { x: 0, y: 0, z: 0 } } };
    effects.coins.push(c);
    effects.collectCoinNow(c);
    const stillExists = effects.coins.includes(c);
    effects.coins = effects.coins.filter((it) => it !== c);
    level.mirror = prevMirror;
    effects.onPickup = prevPickup;
    return { granted, stillExists };
  });
  check(petPickup.granted === 0, 'guest dog does not grant coins locally', JSON.stringify(petPickup));
  check(petPickup.stillExists, 'guest dog leaves mirror item until host lt/ig event', JSON.stringify(petPickup));

  const realErrors = errors.filter((e) => !/Failed to load resource|favicon/i.test(e));
  check(realErrors.length === 0, `без JS-помилок консолі (${realErrors.length})`, realErrors.slice(0, 3).join(' | '));
} catch (e) {
  failed++;
  console.error('❌ ТЕСТ ВПАВ:', e.message);
} finally {
  await browser.close();
  closeServer();
}

console.log(failed === 0 ? '\n🎉 COOP WEAPONS: мережеві регресії закриті' : `\n💥 COOP WEAPONS провалів: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
