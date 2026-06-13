// Regression checks for terrain-attached geometry: rivers and pyramid collision.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  OK' : '  FAIL', msg);
  if (!cond) failed++;
};

async function loadCountry(id) {
  await page.goto(`${BASE}/?test&fresh&country=${id}`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 40000 });
  await page.waitForTimeout(900);
}

for (const country of ['UKR', 'DEU']) {
  await loadCountry(country);
  const river = await page.evaluate(() => {
    const g = window.__game;
    const w = g.level.world;
    const waterMeshes = [];
    w.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry || !obj.material) return;
      if (Math.abs((obj.material.opacity || 1) - 0.78) < 0.001 && obj.material.transparent) {
        waterMeshes.push(obj);
      }
    });
    let maxAboveGround = -Infinity;
    let minAboveGround = Infinity;
    for (const mesh of waterMeshes) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + mesh.position.x;
        const y = pos.getY(i) + mesh.position.y;
        const z = pos.getZ(i) + mesh.position.z;
        const diff = y - w.groundH(x, z);
        maxAboveGround = Math.max(maxAboveGround, diff);
        minAboveGround = Math.min(minAboveGround, diff);
      }
    }
    return {
      meshCount: waterMeshes.length,
      maxAboveGround: Math.round(maxAboveGround * 100) / 100,
      minAboveGround: Math.round(minAboveGround * 100) / 100,
    };
  });
  check(river.meshCount > 0, `${country}: river water mesh exists`);
  check(river.maxAboveGround <= 0.3,
    `${country}: river water follows terrain, max +${river.maxAboveGround}m`);
  check(river.minAboveGround >= -0.05,
    `${country}: river water stays above terrain, min ${river.minAboveGround}m`);
}

await loadCountry('UKR');
const pond = await page.evaluate(() => {
  const g = window.__game;
  const w = g.level.world;
  const waterMeshes = [];
  w.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.material) return;
    if (Math.abs((obj.material.opacity || 1) - 0.82) < 0.001 && obj.material.transparent) {
      waterMeshes.push(obj);
    }
  });
  let maxAboveGround = -Infinity;
  let minAboveGround = Infinity;
  for (const mesh of waterMeshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + mesh.position.x;
      const y = pos.getY(i) + mesh.position.y;
      const z = pos.getZ(i) + mesh.position.z;
      const diff = y - w.groundH(x, z);
      maxAboveGround = Math.max(maxAboveGround, diff);
      minAboveGround = Math.min(minAboveGround, diff);
    }
  }
  return {
    meshCount: waterMeshes.length,
    maxAboveGround: Math.round(maxAboveGround * 100) / 100,
    minAboveGround: Math.round(minAboveGround * 100) / 100,
  };
});
check(pond.meshCount > 0, 'UKR: pond water mesh exists');
check(pond.maxAboveGround <= 0.4,
  `UKR: animated pond water follows terrain, max +${pond.maxAboveGround}m`);
check(pond.minAboveGround >= -0.02,
  `UKR: animated pond water stays above terrain, min ${pond.minAboveGround}m`);

await loadCountry('POL');
const poland = await page.evaluate(() => {
  const w = window.__game.level.world;
  const round = (n) => Math.round(n * 100) / 100;
  const meshStats = (meshes) => {
    let maxAboveGround = -Infinity;
    let minAboveGround = Infinity;
    let vertexCount = 0;
    for (const mesh of meshes) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + mesh.position.x;
        const y = pos.getY(i) + mesh.position.y;
        const z = pos.getZ(i) + mesh.position.z;
        const diff = y - w.groundH(x, z);
        maxAboveGround = Math.max(maxAboveGround, diff);
        minAboveGround = Math.min(minAboveGround, diff);
        vertexCount++;
      }
    }
    return {
      meshCount: meshes.length,
      vertexCount,
      maxAboveGround: round(maxAboveGround),
      minAboveGround: round(minAboveGround),
    };
  };
  const townPlaza = [];
  const frozenLake = [];
  w.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || !obj.material) return;
    const p = obj.geometry.parameters || {};
    if (p.radius === 22 && obj.material.map) townPlaza.push(obj);
    if (p.radius === 36 && obj.material.color?.getHex?.() === 0x9ccbe8) frozenLake.push(obj);
  });
  return {
    townPlaza: meshStats(townPlaza),
    frozenLake: meshStats(frozenLake),
  };
});
check(poland.townPlaza.meshCount === 1, 'POL: town square plaza mesh exists');
check(poland.townPlaza.maxAboveGround <= 0.2,
  `POL: town square follows terrain, max +${poland.townPlaza.maxAboveGround}m`);
check(poland.townPlaza.minAboveGround >= 0.02,
  `POL: town square stays above terrain, min ${poland.townPlaza.minAboveGround}m`);
check(poland.frozenLake.meshCount === 1, 'POL: frozen lake mesh exists');
check(poland.frozenLake.maxAboveGround <= 0.2,
  `POL: frozen lake follows terrain, max +${poland.frozenLake.maxAboveGround}m`);
check(poland.frozenLake.minAboveGround >= 0.02,
  `POL: frozen lake stays above terrain, min ${poland.frozenLake.minAboveGround}m`);

await loadCountry('EGY');
const pyramid = await page.evaluate(() => {
  const w = window.__game.level.world;
  const x = 62;
  const z = -110;
  const gy = w.groundH(x, z);
  const probe = (px, pz, y) => {
    const solved = w.collide(px, pz, 0.45, y);
    return Math.hypot(solved.x - px, solved.z - pz);
  };
  const lowStepBlocked = probe(x, z - 17.2, gy + 0.7);
  const insideBlocked = probe(x, z, gy + 0.7);
  return {
    lowStepBlocked: Math.round(lowStepBlocked * 1000) / 1000,
    insideBlocked: Math.round(insideBlocked * 1000) / 1000,
  };
});
check(pyramid.lowStepBlocked > 0.2,
  `EGY: pyramid side-entry is blocked after small lift (${pyramid.lowStepBlocked}m push)`);
check(pyramid.insideBlocked > 0.2,
  `EGY: pyramid interior cannot be entered through walls (${pyramid.insideBlocked}m push)`);

await browser.close();

if (failed) {
  console.error(`terrain geometry regressions: ${failed}`);
  process.exit(1);
}

console.log('terrain geometry regressions: ok');
