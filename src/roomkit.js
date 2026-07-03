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
