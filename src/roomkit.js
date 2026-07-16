import * as THREE from 'three';

// Спільні хелпери кімнатних режимів: утримання акторів/зомбі у прямокутній
// арені. До цього ця пара методів була дослівно скопійована у кожен режим
// (souls/bank/knockout/pvp/portal/worldboss/defense/turretwar/humans/…).
//
// Семантика збережена дослівно:
//  • x/z затискаємо у [c-half+1, c+half-1], занулюючи ту компоненту швидкості,
//    яку зрізали (лише актор);
//  • floorY === null → жодного затиску по Y (напр. radiationmode);
//  • floorY — число → підіймаємо на підлогу. opts.ceil=true додає стелю
//    (y > floorY+4 теж збиває вниз, як у souls/bank/portal/humans/maze);
//  • зомбі: z.y = floorY, а позу ріга оновлюємо або лише по Y (posMode 'y'),
//    або повністю x/y/z (posMode 'xyz').

export function clampActorToRect(p, cx, cz, halfW, halfD, floorY = null, opts = {}) {
  const x = Math.max(cx - halfW + 1, Math.min(cx + halfW - 1, p.pos.x));
  const z = Math.max(cz - halfD + 1, Math.min(cz + halfD - 1, p.pos.z));
  if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
  if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
  if (floorY != null && (p.pos.y < floorY || (opts.ceil && p.pos.y > floorY + 4))) {
    p.pos.y = floorY;
    if (p.vel.y < 0) p.vel.y = 0;
    p.onGround = true;
  }
}

export function clampZombieToRect(z, cx, cz, halfW, halfD, floorY = null, opts = {}) {
  z.x = Math.max(cx - halfW + 1, Math.min(cx + halfW - 1, z.x));
  z.z = Math.max(cz - halfD + 1, Math.min(cz + halfD - 1, z.z));
  if (floorY != null) {
    z.y = floorY;
    if (z.rig && z.rig.group) {
      if (opts.posMode === 'xyz') z.rig.group.position.set(z.x, floorY, z.z);
      else z.rig.group.position.y = floorY;
    }
  }
}

export function clearRectBlockers(world, cx, cz, halfW, halfD = halfW) {
  const inside = (c) => Math.abs(c.x - cx) < halfW - 1 && Math.abs(c.z - cz) < halfD - 1;
  world.colliders = world.colliders.filter((c) => !inside(c));
  world.occluders = world.occluders.filter((c) => !inside(c));
  if (typeof world._buildGrid === 'function') world._buildGrid();
}

export function buildRectArena(level, cx, cz, size, materials) {
  const half = size / 2;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.18, size),
    new THREE.MeshStandardMaterial(materials.floor),
  );
  floor.position.set(cx, level.world.groundH(cx, cz) - 0.08, cz);
  floor.receiveShadow = true;
  level.scene.add(floor);
  const wallM = new THREE.MeshStandardMaterial(materials.wall);
  const railM = new THREE.MeshStandardMaterial(materials.rail);
  const addWall = (x, z, w, d) => {
    const y = level.world.groundH(x, z) + 1.4;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, d), wallM);
    wall.position.set(x, y, z);
    wall.castShadow = wall.receiveShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d + 0.03), railM);
    stripe.position.set(x, y + 0.25, z);
    level.scene.add(wall, stripe);
  };
  addWall(cx, cz - half, size, 0.35);
  addWall(cx, cz + half, size, 0.35);
  addWall(cx - half, cz, 0.35, size);
  addWall(cx + half, cz, 0.35, size);
}
