// 📦 Спільна логіка фан-ауту пачки {t:'b', m:[{to,d},…]} по отримувачах.
// Ідентична у dev-relay (ws) і Cloudflare-воркері (Hibernation) — самі виклики
// send() різні, тож тут ЛИШЕ чиста трансформація: групуємо d по pid у порядку
// надсилання й повертаємо готові конверти. to===0 → всім, крім себе.
//
// Повертає [{ pid, msg }] у порядку обходу отримувачів; msg — те, що треба
// сериалізувати й надіслати: {from, d} для одного айтема, інакше {from, b:[…]}.
export function routeBatch(items, selfId, peerIds, hasPeer, maxItems) {
  const per = new Map(); // pid -> [d, …] у порядку надсилання
  for (const it of items.slice(0, maxItems)) {
    if (!it || it.d === undefined) continue;
    if (it.to === 0) {
      for (const pid of peerIds) {
        if (pid === selfId) continue;
        if (!per.has(pid)) per.set(pid, []);
        per.get(pid).push(it.d);
      }
    } else {
      const pid = it.to | 0;
      if (pid === selfId || !hasPeer(pid)) continue;
      if (!per.has(pid)) per.set(pid, []);
      per.get(pid).push(it.d);
    }
  }
  const out = [];
  for (const [pid, list] of per) {
    out.push({ pid, msg: list.length === 1 ? { from: selfId, d: list[0] } : { from: selfId, b: list } });
  }
  return out;
}
