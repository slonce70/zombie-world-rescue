// Денний лічильник «скільки людей сьогодні заходило грати» (Lobby DO / dev-relay).
// Перевіряємо унікальність по cid і дедуп. node test/lobby-today.mjs
import { spawnRelay } from './_relay.mjs';

const PORT = 8756;
const API = `http://localhost:${PORT}`;
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

const relay = await spawnRelay(PORT);
const ping = (cid, nick) => fetch(`${API}/lobby/ping`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cid, nick }),
}).then((r) => r.json());
const state = () => fetch(`${API}/lobby/state`).then((r) => r.json());

try {
  console.log('▸ Денний лічильник гравців');
  const v1 = await ping('cid-aaaaaa-1', 'Аня');
  check(typeof v1.today === 'number', 'lobby повертає поле today', JSON.stringify({ today: v1.today, online: v1.online }));
  check(v1.today === 1, 'перший гравець → today=1', String(v1.today));

  const v1b = await ping('cid-aaaaaa-1', 'Аня'); // той самий cid — не дублюється
  check(v1b.today === 1, 'той самий cid не збільшує лічильник (дедуп)', String(v1b.today));

  await ping('cid-bbbbbb-2', 'Боря');
  const v3 = await ping('cid-cccccc-3', 'Віка');
  check(v3.today === 3, 'три УНІКАЛЬНІ гравці → today=3', String(v3.today));

  const s = await state();
  check(s.today === 3, 'GET /lobby/state теж віддає today=3', String(s.today));
  check(s.online >= 1, 'online теж рахується (поточні)', String(s.online));
} finally {
  relay.kill();
}

console.log('');
console.log(failed === 0 ? '🎉 ЛІЧИЛЬНИК ГРАВЦІВ ЗА ДЕНЬ ПРАЦЮЄ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
