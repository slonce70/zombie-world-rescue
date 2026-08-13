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
// код на вужчому потічку (див. test/terrain-geometry.mjs). CHN — без ріки, але
// з Великою стіною на хребті.
for (const country of ['DEU', 'TUR', 'CHN']) {
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
    //
    // Рахуємо ЛИШЕ нерухомі пропси. Дим із димаря, листя, сніжинки, блискітки й
    // бойові FX — це частинки, які літають довкола гравця щокадру, і пролітати
    // над рікою для них нормально (дим із прирічкового будинку в Німеччині саме
    // це й робить). Усі вони позначені DynamicDrawUsage, статична розсипка — ні.
    const DYNAMIC = 35048; // THREE.DynamicDrawUsage === gl.DYNAMIC_DRAW
    // Матриці інстансів локальні (клітки друзів, наприклад, лежать у зсунутій
    // групі) — переводимо в світові координати повною матрицею обʼєкта.
    w.scene.updateMatrixWorld(true);
    let inWater = 0, scattered = 0;
    const wet = [];
    w.scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.count) return;
      if (o.instanceMatrix.usage === DYNAMIC) return;
      const arr = o.instanceMatrix.array;
      const e = o.matrixWorld.elements;
      for (let i = 0; i < o.count; i++) {
        const lx = arr[i * 16 + 12], ly = arr[i * 16 + 13], lz = arr[i * 16 + 14];
        const x = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
        const z = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
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
    // 3️⃣ Велика стіна Китаю — та сама хвороба на ландмарку: суцільна коробка
    // 22 × 7 × 4 плюс башта 6 × 6 на кінці, і все на позначці центру.
    let wall = null;
    const gw = (w.map.landmarks || []).includes('greatwall') && w.map.landmarkParams.greatwall;
    if (gw) {
      let lowMesh = Infinity, lowGround = Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        if (Math.abs(pos[i] - gw.x) <= 11.1 && Math.abs(pos[i + 2] - gw.z) <= 2.1) {
          lowMesh = Math.min(lowMesh, pos[i + 1]);
        }
      }
      for (let i = -11; i <= 11; i++) {
        for (const dz of [-2, 0, 2]) lowGround = Math.min(lowGround, w.groundH(gw.x + i, gw.z + dz));
      }
      wall = { gap: Math.round((lowMesh - lowGround) * 100) / 100 };
    }

    return {
      inWater, scattered, wet, rivers: w.rivers.length, wall,
      worstGap: gaps.reduce((m, g) => (g.gap > m.gap ? g : m), { gap: -99 }),
      houses: gaps.length,
    };
  });

  check(res.scattered > 300, `${country}: декорації розсипані`, `(${res.scattered})`);
  if (res.rivers) {
    check(res.inWater === 0, `${country}: жодна декорація не стоїть у воді`, res.wet.join(' '));
  }
  check(res.houses > 0, `${country}: будинки села побудовані`, `(${res.houses})`);
  // 0.06 — допуск на товщину плити (низ фундаменту на 0.1 нижче за землю)
  check(res.worstGap.gap <= 0.06,
    `${country}: фундамент дістає до землі під усім будинком`,
    `найгірший (${res.worstGap.x},${res.worstGap.z}) щілина ${res.worstGap.gap}м`);
  if (res.wall) {
    check(res.wall.gap <= 0, `${country}: Велика стіна вросла в хребет, а не висить`,
      `щілина ${res.wall.gap}м`);
  }
}

await closeTest();
console.log(failed ? `\n❌ провалено перевірок: ${failed}` : '\n✅ світ охайний');
process.exit(failed ? 1 : 0);
