// 🎡 Слоти дня: 4 кімнатні режими, що змінюються щодоби. Чистий модуль без DOM,
// THREE і мережі — як weeklycamp.js, щоб тести кликали ту саму функцію.
//
// Ротація НІЧОГО не запирає: усі режими лишаються доступні у своїх категоріях.
// Слоти — це вітрина «у що грати сьогодні», щоб дитина не губилась у 19 картках.
// Сервер не потрібен: усі клієнти рахують те саме від дати.
import { DAILY_CHALLENGE_POOL } from './modes.js';

export const ROTATION_SLOTS = 4;

// Пул НЕ дублюємо: DAILY_CHALLENGE_POOL — це вже рівно ті самі 11 кімнатних режимів.
// 11 і 4 взаємно прості, тож у будь-який день слоти різні, а повний цикл — 11 днів.
export function todaySlots(dayIndex, pool = DAILY_CHALLENGE_POOL) {
  const n = pool.length;
  if (!n) return [];
  const day = Number.isFinite(Number(dayIndex)) ? Math.trunc(Number(dayIndex)) : 0;
  const out = [];
  for (let i = 0; i < Math.min(ROTATION_SLOTS, n); i++) {
    // (day*4 + i) % 11 — і невід'ємний залишок для від'ємних дат
    out.push(pool[(((day * ROTATION_SLOTS + i) % n) + n) % n]);
  }
  return out;
}
