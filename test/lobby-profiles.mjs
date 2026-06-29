// Публічні профілі у «Грати разом»: коротка статистика поруч зі списком гравців.
// node test/lobby-profiles.mjs
import { spawnRelay } from './_relay.mjs';

const PORT = 8757;
const API = `http://localhost:${PORT}`;
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

const relay = await spawnRelay(PORT);
const ping = (cid, nick, profile) => fetch(`${API}/lobby/ping`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ cid, nick, profile }),
}).then((r) => r.json());

try {
  console.log('▸ Публічні профілі гравців у лобі');
  await ping('cid-profile-1', 'Аня', { countries: 2, coins: 75, crystals: 4, kills: 9, star: 3 });
  const v = await ping('cid-profile-2', 'Боря', { countries: 99, coins: -5, crystals: 2.7, kills: 4, star: 8 });

  check(v.players.includes('Аня') && v.players.includes('Боря'), 'старий список players лишився ніками', JSON.stringify(v.players));
  check(Array.isArray(v.profiles), 'lobby повертає масив profiles', JSON.stringify(v));
  const anya = (v.profiles || []).find((p) => p.nick === 'Аня');
  const borya = (v.profiles || []).find((p) => p.nick === 'Боря');
  check(!!anya && anya.countries === 2 && anya.coins === 75 && anya.crystals === 4 && anya.kills === 9 && anya.star === 3,
    'профіль віддає статистику гравця', JSON.stringify(anya));
  check(!!borya && borya.countries === 99 && borya.coins === 0 && borya.crystals === 2 && borya.kills === 4 && borya.star === 5,
    'числа профілю чистяться до безпечних меж', JSON.stringify(borya));
} finally {
  relay.kill();
}

console.log('');
console.log(failed === 0 ? '🎉 ПРОФІЛІ В ЛОБІ ПРАЦЮЮТЬ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
