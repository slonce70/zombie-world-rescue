// Спільний спавн dev-relay із перевіркою, що тест говорить зі СВОЇМ процесом,
// а не з осиротілим реле зі старим кодом на тому ж порту.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Якщо порт уже зайнятий ЖИВИМ relay — це сирота з попереднього прогону на тому ж порту
// (тест упав до relay.kill()). Глушимо її за pid із /health і чекаємо звільнення порту.
// Жодного reuse: тест завжди піднімає СВІЙ процес із поточним кодом.
async function freePortIfOrphan(port) {
  let pid = null;
  try {
    const r = await fetch(`http://localhost:${port}/health`);
    if (r.ok) { const j = await r.json(); pid = j && j.pid; }
  } catch (e) { return; } // порт вільний — нічого робити
  if (!pid) return;
  try { process.kill(pid, 'SIGKILL'); } catch (e) { /* вже мертвий — однаково чекаємо звільнення */ }
  for (let i = 0; i < 30; i++) { // до 3с на звільнення порту
    await sleep(100);
    try { await fetch(`http://localhost:${port}/health`); } catch (e) { return; } // не відповідає — вільно
  }
}

async function spawnOnce(port, quiet) {
  const relay = spawn('node', ['relay/dev-relay.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(port) },
    stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  });
  let exited = null;
  relay.on('exit', (code, signal) => { exited = code == null ? (signal ? `signal:${signal}` : 'signal') : code; });
  // даємо час на bind, потім перевіряємо живість і токен
  for (let i = 0; i < 30 && exited === null; i++) {
    await sleep(100);
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      if (r.ok) {
        const j = await r.json();
        if (j.pid !== relay.pid) continue; // чужий процес (сирота) — ігноруємо, чекаємо далі
        relay._bootToken = j.boot;
        return relay; // наш процес відповів — усе гаразд
      }
    } catch (e) { /* ще не піднявся */ }
  }
  if (exited !== null) return { _exited: exited }; // напр. EADDRINUSE → верхній цикл повторить
  relay.kill(); throw new Error(`[relay] не відповів на /health за 3с (порт ${port})`);
}

export async function spawnRelay(port, { quiet = true } = {}) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await freePortIfOrphan(port); // прибираємо сироту з попереднього прогону, якщо є
    const relay = await spawnOnce(port, quiet);
    if (relay && !relay._exited) return relay; // піднявся наш процес
    last = relay && relay._exited; // вийшов (ймовірно EADDRINUSE) — повтор після паузи
    await sleep(300);
  }
  throw new Error(`[relay] процес вийшов з кодом ${last} (порт ${port} зайнятий сиротою?)`);
}
