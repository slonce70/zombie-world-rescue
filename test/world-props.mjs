// Охайність світу: декорації не стоять у воді, а будинки не висять над схилом.
// Обидва інваріанти суто геометричні — міряються по сцені, без ока.
import { openBrowserTest, makeCheck } from './_browser.mjs';

const { BASE, page, closeTest } = await openBrowserTest({
  launch: { args: ['--use-angle=swiftshader'] },
  context: { viewport: { width: 1000, height: 640 } },
  captureErrors: false,
});

let failed = 0;
const check = makeCheck(() => failed++);

// DEU і TUR — найширші ріки і найкрутіші схили під селом; UKR ганяє той самий
// код на вужчому потічку (див. test/terrain-geometry.mjs).
for (const country of ['DEU', 'TUR']) {
  await page.goto(`${BASE}/?test&fresh&country=${country}`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 60000 });

  const res = await page.evaluate(() => {
    const w = window.__game.level.world;
    const distToSeg = (px, pz, ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    };

    // 1️⃣ Декорації у воді. Проп «у воді» = він у коридорі русла І земля під ним
    // нижча за ватерлінію. RIVER_BANK у world.js = 1.37 ширини.
    let inWater = 0, scattered = 0;
    const wet = [];
    w.scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.count) return;
      const arr = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const x = arr[i * 16 + 12] + o.position.x;
        const z = arr[i * 16 + 14] + o.position.z;
        scattered++;
        for (const rv of w.rivers) {
          let d = Infinity;
          for (const s of rv.segs) {
            const v = distToSeg(x, z, s[0], s[1], s[2], s[3]);
            if (v < d) d = v;
          }
          if (d < rv.width * 1.37 && w.groundH(x, z) < rv.level) {
            inWater++;
            if (wet.length < 5) wet.push(`(${Math.round(x)},${Math.round(z)})`);
          }
        }
      }
    });

    // 2️⃣ Будинки на схилі. Фундамент мусить діставати до НАЙНИЖЧОЇ землі під
    // собою — інакше під нижнім кутом стіни зяє щілина. Беремо запечену
    // статичну геометрію (staticGroup у світових координатах): найнижча її
    // вершина в межах футпринта — це низ плити.
    let baked = null;
    w.staticGroup.traverse((o) => { if (o.isMesh && o.geometry.attributes.position.count > 1000) baked = o; });
    // Зовнішній прямокутник ловить кути плити (коробка має вершини ЛИШЕ по кутах),
    // внутрішній — землю, гарантовано під будинком навіть найвужчим (5.5 × 4.6).
    const OW = 4.1, OD = 3.4, IW = 2.6, ID = 2.1;
    const gaps = [];
    const pos = baked.geometry.attributes.position.array;
    for (const h of w.map.houses || []) {
      if (h.skipAuto) continue;
      const c = Math.cos(h.ry || 0), s = Math.sin(h.ry || 0);
      let lowGround = Infinity;
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const gx = h.x + (a * IW) * c + (b * ID) * s;
          const gz = h.z - (a * IW) * s + (b * ID) * c;
          lowGround = Math.min(lowGround, w.groundH(gx, gz));
        }
      }
      let lowMesh = Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        const dx = pos[i] - h.x, dz = pos[i + 2] - h.z;
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        if (Math.abs(lx) <= OW && Math.abs(lz) <= OD) lowMesh = Math.min(lowMesh, pos[i + 1]);
      }
      gaps.push({ x: h.x, z: h.z, gap: Math.round((lowMesh - lowGround) * 100) / 100 });
    }
    return {
      inWater, scattered, wet, rivers: w.rivers.length,
      worstGap: gaps.reduce((m, g) => (g.gap > m.gap ? g : m), { gap: -99 }),
      houses: gaps.length,
    };
  });

  check(res.rivers > 0, `${country}: у карті є ріка`);
  check(res.scattered > 300, `${country}: декорації розсипані`, `(${res.scattered})`);
  check(res.inWater === 0, `${country}: жодна декорація не стоїть у воді`, res.wet.join(' '));
  check(res.houses > 0, `${country}: будинки села побудовані`, `(${res.houses})`);
  // 0.06 — допуск на товщину плити (низ фундаменту на 0.1 нижче за землю)
  check(res.worstGap.gap <= 0.06,
    `${country}: фундамент дістає до землі під усім будинком`,
    `найгірший (${res.worstGap.x},${res.worstGap.z}) щілина ${res.worstGap.gap}м`);
}

await closeTest();
console.log(failed ? `\n❌ провалено перевірок: ${failed}` : '\n✅ світ охайний');
process.exit(failed ? 1 : 0);
