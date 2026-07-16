// Регресія v282: разовий day-score («топ-3 сьогодні») НЕ губиться, коли плановий
// пінг лобі ще в польоті. Раніше _ping при _busy просто повертався і викидав
// вантаж {day} — результат шторму зникав. Тепер вантаж чекає в _pendingExtra
// і летить одразу після завершення поточного запиту. node test/lobby-dayscore-queue.mjs
import { openBrowserTest, makeCheck } from './_browser.mjs';

const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { BASE, ctx, page, closeTest } = await openBrowserTest({ launch: { args: ['--use-angle=swiftshader'] }, context: { viewport: { width: 1280, height: 800 } }, captureErrors: false });
let fail = 0;
const check = makeCheck(() => fail++);

try {

  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', null, { timeout: 30000 * SLOW });

  const out = await page.evaluate(async (SLOW_) => {
    const lc = window.__game.coop && window.__game.coop.lobbyNet;
    if (!lc) return { error: 'нема game.coop.lobbyNet' };
    const calls = [];
    let releaseFirst;
    const orig = window.fetch;
    const okResponse = () => new Response('{"online":1,"top3":[]}', {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    window.fetch = (url, opts) => {
      if (!String(url).includes('/lobby/ping')) return orig(url, opts);
      calls.push(JSON.parse(opts.body));
      if (calls.length === 1) {
        // перший пінг «зависає в польоті», доки тест його не відпустить
        return new Promise((res) => { releaseFirst = () => res(okResponse()); });
      }
      return Promise.resolve(okResponse());
    };
    try {
      lc._ping();               // плановий пінг: тепер висить у польоті
      lc.announceDayScore(7);   // разовий результат приходить ПІД ЧАС польоту
      const inFlightCalls = calls.length; // раніше day тут просто викидався
      releaseFirst();
      await new Promise((r) => setTimeout(r, 80 * SLOW_)); // мікрочерга + відкладений fetch
      return {
        inFlightCalls,
        calls: calls.map((c) => ({ hasDay: !!c.day, score: c.day && c.day.score })),
      };
    } finally {
      window.fetch = orig;
    }
  }, SLOW);

  check(!out.error, 'lobbyNet доступний у грі', out.error || '');
  check(out.inFlightCalls === 1, 'під час польоту другий запит НЕ шлеться (вантаж у черзі)', JSON.stringify(out));
  check(out.calls && out.calls.length === 2, 'після завершення першого пінга летить відкладений другий', JSON.stringify(out.calls));
  check(out.calls && out.calls[1] && out.calls[1].hasDay && out.calls[1].score === 7,
    'відкладений пінг несе day.score=7 (результат НЕ загубився)', JSON.stringify(out.calls && out.calls[1]));
} finally {
  await closeTest();
}

console.log('');
console.log(fail === 0 ? '🎉 DAY-SCORE НЕ ГУБИТЬСЯ ПРИ IN-FLIGHT ПІНГУ' : `💥 ПРОВАЛЕНО: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
