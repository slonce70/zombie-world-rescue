import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'child_process';


// 🔌 Порт можна перекрити змінною ZR_PORT. Навіщо: `ensureWebServer` перевикористовує
// вже піднятий сервер, тож два прогони на одній машині мовчки їли б ОДНЕ дерево —
// і тест бачив би чужі правки. Своя змінна = свій порт = свій репозиторій.
const ENV_PORT = Number(process.env.ZR_PORT) || 0;

export async function ensureWebServer({ port = ENV_PORT || 8741, quiet = true } = {}) {
  const base = `http://localhost:${port}`;
  const ready = async () => {
    try {
      const r = await fetch(`${base}/version.json`, { cache: 'no-store' });
      return r.ok;
    } catch (e) {
      return false;
    }
  };
  const waitReady = async () => {
    for (let i = 0; i < 50; i++) {
      if (await ready()) return;
      await sleep(100);
    }
    throw new Error(`${base}/version.json не відповів`);
  };

  if (await ready()) return { base, close() {} };

  const server = spawn('python3', ['-m', 'http.server', String(port)], {
    stdio: quiet ? 'ignore' : 'inherit',
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    server.kill();
  };
  process.once('exit', close);
  await waitReady();
  return { base, close };
}
