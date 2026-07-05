// 🤝 Командна ліга (coopstorm) + «топ-3 сьогодні» — HTTP-тест проти dev-relay.
// Дзеркалить семантику League/Lobby DO з worker/relay-worker.js. node test/team-league.mjs
import { spawnRelay } from './_relay.mjs';

const PORT = 8759;
const API = `http://localhost:${PORT}`;
let failed = 0;
const check = (ok, msg, extra = '') => { console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`); if (!ok) failed++; };

const submit = (body) => fetch(`${API}/league/submit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

const top = (mode, country, cid = '') => fetch(
  `${API}/league/top?mode=${mode}&country=${country}&cid=${encodeURIComponent(cid)}`,
).then((r) => r.json());

const ping = (body) => fetch(`${API}/lobby/ping`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json());

const relay = await spawnRelay(PORT);
try {
  // ── (а) командний сабміт coopstorm з team[] → таблиця команд віддає запис ──
  console.log('▸ (а) командний рекорд coopstorm');
  const r1 = await submit({ cid: 'cid-host-aaaa', nick: 'Мама', mode: 'coopstorm', country: 'UKR', score: 7, team: ['Мама', 'Син'] });
  check(r1.status === 200, 'сабміт coopstorm приймається', String(r1.status));
  let t1 = await top('coopstorm', 'UKR', 'cid-host-aaaa');
  check(t1.top.length === 1, 'таблиця команд має 1 запис', JSON.stringify(t1.top.map((e) => e.score)));
  check(Array.isArray(t1.top[0].team) && t1.top[0].team.length === 2, 'запис несе склад команди (2 ніки)', JSON.stringify(t1.top[0].team));
  check(t1.top[0].score === 7, 'скор команди = 7', String(t1.top[0].score));

  // ── (б) повторний менший — не гіршає; більший — оновлюється ──
  console.log('▸ (б) upsert по кращому результату');
  await submit({ cid: 'cid-host-aaaa', nick: 'Мама', mode: 'coopstorm', country: 'UKR', score: 4, team: ['Мама', 'Син'] });
  t1 = await top('coopstorm', 'UKR', 'cid-host-aaaa');
  check(t1.top[0].score === 7, 'менший скор рекорд НЕ погіршив (лишилось 7)', String(t1.top[0].score));
  await submit({ cid: 'cid-host-aaaa', nick: 'Мама', mode: 'coopstorm', country: 'UKR', score: 12, team: ['Мама', 'Син', 'Тато'] });
  t1 = await top('coopstorm', 'UKR', 'cid-host-aaaa');
  check(t1.top[0].score === 12, 'більший скор ОНОВИВ рекорд (12)', String(t1.top[0].score));
  check(t1.top[0].team.length === 3, 'склад команди теж оновився (3 ніки)', JSON.stringify(t1.top[0].team));

  // ── (в) сміттєві поля клампляться ──
  console.log('▸ (в) кламп сміттєвих полів');
  const big = await submit({
    cid: 'cid-troll-bbbb', nick: '<script>alert(1)</script>', mode: 'coopstorm', country: 'UKR',
    score: 1e12, team: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
  });
  check(big.status === 400, 'score=1e12 (>200) відхилено як недійсний', String(big.status));
  // валідний скор, але сміттєвий нік і завеликий team → приймається з клампом
  const ok = await submit({
    cid: 'cid-troll-bbbb', nick: '<script>x</script>', mode: 'coopstorm', country: 'UKR',
    score: 9, team: ['<b>Аня</b>', 'Бо', 'Ва', 'Га', 'ЗАЙВИЙ5'],
  });
  check(ok.status === 200, 'валідний coopstorm зі сміттям приймається', String(ok.status));
  const t2 = await top('coopstorm', 'UKR', 'cid-troll-bbbb');
  const rec = t2.top.find((e) => e.score === 9);
  check(rec && rec.team.length === 4, 'team обрізано до 4 ніків (5-й «ЗАЙВИЙ5» відкинуто)', rec && JSON.stringify(rec.team));
  check(rec && rec.nick.length <= 12 && rec.team.every((n) => n.length <= 12), 'ніки клампнуто до 12 символів', rec && JSON.stringify([rec.nick, rec.team]));
  check(rec && !rec.team.includes('ЗАЙВИЙ5'), '5-й нік не потрапив у команду', rec && JSON.stringify(rec.team));

  // одиничний склад команди — це не «команда»
  const solo = await submit({ cid: 'cid-solo-cccc', nick: 'Сам', mode: 'coopstorm', country: 'UKR', score: 6, team: ['Сам'] });
  check(solo.status === 400, 'coopstorm з team<2 відхилено (не команда)', String(solo.status));

  // соло-режими не зламані (storm/arena досі працюють)
  console.log('▸ соло-режими не зламані');
  const s1 = await submit({ cid: 'cid-solo-dddd', nick: 'Гравець', mode: 'storm', country: 'UKR', score: 5, team: [] });
  check(s1.status === 200 && s1.json.top.length >= 1, 'storm-сабміт працює', String(s1.status));
  const a1 = await submit({ cid: 'cid-solo-eeee', nick: 'Гонщик', mode: 'arena', country: 'ALL', score: 120000, team: [] });
  check(a1.status === 200, 'arena-сабміт працює', String(a1.status));

  // ── (г) топ-3 дня: денні результати → пінг лобі повертає відсортований топ ──
  console.log('▸ (г) топ-3 сьогодні');
  await ping({ cid: 'cid-day-1111', nick: 'Оля', day: { nick: 'Оля', score: 3 } });
  await ping({ cid: 'cid-day-2222', nick: 'Іван', day: { nick: 'Іван', score: 9 } });
  await ping({ cid: 'cid-day-3333', nick: 'Ліза', day: { nick: 'Ліза', score: 6 } });
  const v = await ping({ cid: 'cid-day-4444', nick: 'Макс' }); // звичайний пінг → бачить топ
  check(Array.isArray(v.top3), 'пінг лобі повертає поле top3', JSON.stringify(v.top3));
  check(v.top3.length === 3, 'топ-3 має 3 записи', String(v.top3.length));
  check(v.top3[0].nick === 'Іван' && v.top3[0].score === 9, 'найкращий — Іван (9)', JSON.stringify(v.top3[0]));
  check(v.top3[1].score === 6 && v.top3[2].score === 3, 'відсортовано за спаданням (6, 3)', JSON.stringify(v.top3.map((e) => e.score)));

  // повторний денний результат того ж ніка — тримаємо КРАЩИЙ, без дубля
  const v2 = await ping({ cid: 'cid-day-1111', nick: 'Оля', day: { nick: 'Оля', score: 11 } });
  const olya = v2.top3.filter((e) => e.nick === 'Оля');
  check(olya.length === 1 && olya[0].score === 11, 'один запис на нік, кращий результат (Оля=11)', JSON.stringify(olya));
  check(v2.top3[0].nick === 'Оля', 'Оля тепер перша (11)', JSON.stringify(v2.top3[0]));
  // слабший ПІЗНІШИЙ забіг не затирає рекорд дня (v282: «кращий», не «останній»)
  const v2b = await ping({ cid: 'cid-day-1111', nick: 'Оля', day: { nick: 'Оля', score: 2 } });
  const olyaAfter = v2b.top3.filter((e) => e.nick === 'Оля');
  check(olyaAfter.length === 1 && olyaAfter[0].score === 11, 'слабший забіг (2) НЕ затер рекорд Олі (11)', JSON.stringify(olyaAfter));

  // ── (д) дедуп ніків команди (v282): ростер після реконекту міг дати той самий нік двічі ──
  console.log('▸ (д) дедуп ніків команди');
  await submit({ cid: 'cid-dedup-aaaa', nick: 'Влад', mode: 'coopstorm', country: 'POL', score: 5, team: ['Влад', 'Влад', 'Мама'] });
  const td = await top('coopstorm', 'POL', 'cid-dedup-aaaa');
  check(td.top.length === 1 && JSON.stringify(td.top[0].team) === JSON.stringify(['Влад', 'Мама']),
    'дубль ніка прибрано — команда [Влад, Мама]', JSON.stringify(td.top[0] && td.top[0].team));
  const rd = await submit({ cid: 'cid-dedup-bbbb', nick: 'Соло', mode: 'coopstorm', country: 'POL', score: 5, team: ['Соло', 'Соло'] });
  check(rd.status === 400, '«команда» з двох ОДНАКОВИХ ніків відхилена (1 унікальний нік — не команда)', String(rd.status));
} finally {
  relay.kill();
}

console.log('');
console.log(failed === 0 ? '🎉 КОМАНДНА ЛІГА + ТОП-3 ДНЯ ПРАЦЮЮТЬ' : `💥 ПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
