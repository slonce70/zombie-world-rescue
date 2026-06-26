// Протокол кооперативу: версія, утиліти квантизації, коди подій.
// Снапшоти (часті, ідемпотентні) їдуть масивами; події (рівно один раз) — списком кодів.

// бампити РАЗОМ з APP_VERSION у main.js при зміні формату повідомлень
export const PROTO_VERSION = 7; // v95: hits[4] — тривалість гіпер-оглушення

export const ROOM_ALPHABET = 'ABCDEFHKLMNPRSTUWXYZ23456789'; // без плутаних O/0, I/1, G/6
export function makeRoomCode(n = 4) {
  let s = '';
  for (let i = 0; i < n; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
}

export const r2 = (v) => Math.round(v * 100) / 100;
export const r1 = (v) => Math.round(v * 10) / 10;

// --- біти прапорців гравця у снапшоті ---
export const PF = {
  GROUND: 1, RIDING: 2, EMOTING: 4, RELOADING: 8,
  SCOPED: 16, HOLDE: 32, DEAD: 64, SHIELD: 128, FP: 256, SPRINT: 512,
};

// --- байт стану зомбі у снапшоті ---
// нижні 3 біти — стан, далі прапорці
export const ZS = { WANDER: 0, CHASE: 1, ATTACK: 2, DEAD: 3, FLEE: 4 };
export const ZF = { MOVING: 8, CHARGING: 16, TELEGRAPH: 32, SLEEPING: 64, ENRAGED: 128 };

export function packZombieState(z, moving) {
  let b = ZS[z.state.toUpperCase()] ?? ZS.WANDER;
  if (moving) b |= ZF.MOVING;
  if (z.charging > 0) b |= ZF.CHARGING;
  if (z.telegraph > 0) b |= ZF.TELEGRAPH;
  if (z.sleeping) b |= ZF.SLEEPING;
  if (z.enraged) b |= ZF.ENRAGED;
  return b;
}

// індекси зброї для компактної передачі
export const WEAPON_IDX = ['pistol', 'rifle', 'shotgun', 'smg', 'magnum', 'sniper', 'bazooka', 'laser', 'flamethrower', 'staff'];
export const weaponToIdx = (w) => Math.max(0, WEAPON_IDX.indexOf(w));
export const idxToWeapon = (i) => WEAPON_IDX[i] || 'pistol';
