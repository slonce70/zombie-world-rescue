import { spawn } from 'child_process';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ensureWebServer({ port = 8741, quiet = true } = {}) {
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
