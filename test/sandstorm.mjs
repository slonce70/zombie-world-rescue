// 🌪️ v293 «Характер країн»: фірмовий хазард Єгипту — піщана буря. Перевіряємо
// повний цикл на соло-рівні EGY: телеграф → активна буря (туман стуляється,
// чип видно, зомбі бачать ближче) → туман ВІДНОВЛЮЄТЬСЯ рівно до стану до бурі
// → друга буря може стартувати. І гарантуємо, що поза EGY-соло бурі НЕМАЄ.
import { chromium } from 'playwright';
import { ensureWebServer } from './_server.mjs';

const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
let failed = 0;
const check = (ok, msg, extra = '') => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${msg}${extra ? ' ' + extra : ''}`);
  if (!ok) failed++;
};
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(`${BASE}/?test&fresh&country=EGY`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level', null, { timeout: 30000 });

console.log('▸ EGY соло має піщану бурю');
const has = await page.evaluate(() => ({
  country: window.__game.level.countryId,
  state: window.__game.test.sandstormState(),
}));
check(has.country === 'EGY', 'рівень EGY', has.country);
check(has.state && has.state.phase === 'idle', 'sandstorm ініціалізовано (idle)', JSON.stringify(has.state));

console.log('▸ Повний цикл бурі (детермінований прогон через хук)');
const run = await page.evaluate(() => {
  const g = window.__game;
  const L = g.level;
  const ss = L.sandstorm;
  const fogSnap = () => ({
    c: L.scene.fog.color.getHex(),
    n: +L.scene.fog.near.toFixed(4),
    f: +L.scene.fog.far.toFixed(4),
  });
  const before = fogSnap();
  const started = ss.forceStart();
  const bannerTitle = document.getElementById('banner-title')?.textContent || '';
  const warn = ss.state();
  // 5с → крізь телеграф (4с) в активну бурю
  for (let i = 0; i < 60; i++) ss.update(1 / 12);
  const storm = ss.state();
  const stormFog = fogSnap();
  // ще 30с → крізь бурю (20с) + затихання (3с) → idle, туман відновлено
  for (let i = 0; i < 360; i++) ss.update(1 / 12);
  const after = fogSnap();
  const afterState = ss.state();
  const second = ss.forceStart(); // друга буря може стартувати
  return { before, started, bannerTitle, warn, storm, stormFog, after, afterState, second };
});

check(run.started === true, 'forceStart запускає телеграф');
check(run.bannerTitle.includes('🌪️'), 'банер телеграфа з\'явився', JSON.stringify(run.bannerTitle));
check(run.warn.phase === 'warn', 'фаза телеграфа (warn)', run.warn.phase);

check(run.storm.phase === 'storm' && run.storm.active, 'буря активна', JSON.stringify(run.storm));
check(run.storm.t > 0, 'чип показує відлік (t>0)', String(run.storm.t));
check(run.storm.aggroMul === 0.5, 'зомбі бачать удвічі ближче', String(run.storm.aggroMul));
const fogChanged = run.stormFog.c !== run.before.c || run.stormFog.n < run.before.n || run.stormFog.f < run.before.f;
check(fogChanged, 'туман стуляється під час бурі', `${JSON.stringify(run.before)} → ${JSON.stringify(run.stormFog)}`);

check(run.afterState.phase === 'idle' && !run.afterState.active, 'буря завершилась (idle)', JSON.stringify(run.afterState));
const fogRestored = run.after.c === run.before.c && run.after.n === run.before.n && run.after.f === run.before.f;
check(fogRestored, 'туман ВІДНОВЛЕНО рівно до стану до бурі', `${JSON.stringify(run.before)} vs ${JSON.stringify(run.after)}`);
check(run.second === true, 'друга буря може стартувати');

console.log('▸ endLevel ПОСЕРЕД бурі відновлює coinMat.emissiveIntensity (v294 leak-фікс)');
const restore = await page.evaluate(() => {
  const g = window.__game;
  const L = g.level;
  const ss = L.sandstorm;
  const coinMat = L.effects.coinMat;      // сесійно-кешований (userData.shared) — переживе teardown рівня
  const base = coinMat.emissiveIntensity; // 0.45
  ss.phase = 'idle'; ss.timer = 999;      // гарантуємо, що forceStart спрацює (не в warn з другої бурі)
  ss.forceStart();
  let boosted = base;
  for (let i = 0; i < 150; i++) { ss.update(1 / 12); boosted = Math.max(boosted, coinMat.emissiveIntensity); }
  const beforeEnd = coinMat.emissiveIntensity; // ще в активній бурі → підсилено
  g.endLevel();                                 // кидаємо рівень ПОСЕРЕД бурі
  const afterEnd = coinMat.emissiveIntensity;
  return { base, boosted, beforeEnd, afterEnd, shared: !!(coinMat.userData && coinMat.userData.shared) };
});
check(Math.abs(restore.base - 0.45) < 1e-6, 'база coinMat.emissiveIntensity = 0.45', String(restore.base));
check(restore.boosted > 1.0, 'під час бурі свічення підсилене (0.45→~1.45)', String(restore.boosted));
check(restore.beforeEnd > 0.6, 'на момент endLevel матеріал ще підсилений (буря активна)', String(restore.beforeEnd));
check(Math.abs(restore.afterEnd - 0.45) < 1e-6, 'endLevel ВІДНОВИВ 0.45 (Sandstorm.dispose форсує базу)', JSON.stringify(restore));
check(restore.shared, 'coinMat справді сесійний (userData.shared) — teardown його пропускає', String(restore.shared));

console.log('▸ Поза EGY-соло бурі немає');
await page.goto(`${BASE}/?test&fresh&country=JPN`, { waitUntil: 'commit', timeout: 60000 });
await page.waitForFunction(() => window.__game && window.__game.state === 'level' && window.__game.level.countryId === 'JPN', null, { timeout: 30000 });
const jpn = await page.evaluate(() => ({
  country: window.__game.level.countryId,
  state: window.__game.test.sandstormState(),
  raw: window.__game.level.sandstorm,
}));
check(jpn.country === 'JPN', 'рівень JPN', jpn.country);
check(jpn.state === null && !jpn.raw, 'JPN не має піщаної бурі (гард не-EGY)', JSON.stringify(jpn.state));

console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 10)) console.log('  ', e);
  failed += errors.length;
}
console.log(failed === 0 ? '🎉 ПІЩАНА БУРЯ ПРОЙДЕНА' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
closeServer();
process.exit(failed === 0 ? 0 : 1);
