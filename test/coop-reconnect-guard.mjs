// 🔌 Guest reconnect guard: якщо relay після resume повернув інший pid,
// гість fail-closed, як хост, а не продовжує рівень під чужим id.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

let failures = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${msg}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

try {
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 25000 });

  const result = await page.evaluate(async () => {
    window.__APP_VERSION = window.__APP_VERSION || 1;
    const { CoopSession } = await import('/src/net/coop.js');
    const game = {
      save: {},
      hud: { toast() {} },
      audio: { click() {} },
    };
    const session = new CoopSession(game);
    session.role = 'guest';
    session.room = 'ROOM';
    session.myPid = 2;
    session.state = 'level';

    const calls = { connect: [], send: [], close: 0, end: [], back: 0, disposed: 0 };
    session.net = {
      connectionBack() { calls.back++; },
      dispose() { calls.disposed++; },
    };
    session.transport.connect = async (room, opts) => {
      calls.connect.push({ room, opts });
      session.transport.you = 3;
    };
    session.transport.send = (to, data, urgent) => calls.send.push({ to, data, urgent });
    session.transport.close = () => { calls.close++; };
    session.onEnd = (reason, wasLevel) => calls.end.push({ reason, wasLevel });

    const realSetTimeout = window.setTimeout;
    window.setTimeout = (fn) => { fn(); return 0; };
    try {
      await session._tryReconnect();
    } finally {
      window.setTimeout = realSetTimeout;
    }

    return {
      calls,
      role: session.role,
      state: session.state,
      myPid: session.myPid,
      net: !!session.net,
    };
  });

  console.log('coop-reconnect-guard:', JSON.stringify(result));
  check(result.calls.connect.length === 1, 'guest спробував resume один раз', JSON.stringify(result.calls.connect));
  check(result.calls.connect[0]?.opts?.resume === 2, 'guest просив старий pid=2', JSON.stringify(result.calls.connect[0]));
  check(result.calls.end.length === 1 && result.calls.end[0].reason === 'lost' && result.calls.end[0].wasLevel === true,
    'pid mismatch завершує кімнату як lost', JSON.stringify(result.calls.end));
  check(result.calls.close === 1, 'pid mismatch закриває transport', String(result.calls.close));
  check(result.calls.send.length === 0, 'pid mismatch не шле hello під чужим pid', JSON.stringify(result.calls.send));
  check(result.calls.back === 0, 'pid mismatch не викликає connectionBack()', String(result.calls.back));
  check(result.role === null && result.state === 'idle' && result.net === false,
    'pid mismatch скидає session у idle', JSON.stringify({ role: result.role, state: result.state, net: result.net }));
} catch (e) {
  failures++;
  console.error('❌ ТЕСТ ВПАВ:', e.message.split('\n')[0]);
} finally {
  await browser.close().catch(() => {});
  closeServer();
}

console.log(failures === 0 ? '\n✅ COOP RECONNECT GUARD ПРОЙДЕНО' : `\n❌ COOP RECONNECT GUARD провалів: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
