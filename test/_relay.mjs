// Спільний спавн dev-relay із перевіркою, що тест говорить зі СВОЇМ процесом,
// а не з осиротілим реле зі старим кодом на тому ж порту.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function spawnRelay(port, { quiet = true } = {}) {
  const relay = spawn('node', ['relay/dev-relay.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(port) },
    stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  });
  let exited = null;
  relay.on('exit', (code) => { exited = code == null ? 0 : code; });
  // даємо час на bind, потім перевіряємо живість і токен
  for (let i = 0; i < 30 && exited === null; i++) {
    await sleep(100);
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      if (r.ok) {
        const j = await r.json();
        relay._bootToken = j.boot;
        return relay; // наш процес відповів — усе гаразд
      }
    } catch (e) { /* ще не піднявся */ }
  }
  if (exited !== null) { throw new Error(`[relay] процес вийшов з кодом ${exited} (порт ${port} зайнятий сиротою?)`); }
  relay.kill(); throw new Error(`[relay] не відповів на /health за 3с (порт ${port})`);
}
