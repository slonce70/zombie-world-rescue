// Тести мобільного оновлення (Task 1): режим «Малюк» — лише м'яка допомога
// прицілу, БЕЗ автовогню й гарантованого хедшоту. Десктоп не зачіпається.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}

// ============ 🐣 Режим Малюк: без автовогню ============
console.log('▸ Mobile: режим Малюк — без автовогню');
await page.goto(`${BASE}/?test&fresh&country=UKR&touch`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'level');

const shotsBefore = await page.evaluate(() => {
  const g = window.__game;
  g.save.kidMode = true;            // вмикаємо режим Малюк
  g.input.touchMode = true;         // переконуємось, що тач активний
  // зомбі прямо у передньому конусі гравця (8 м попереду по поточному yaw)
  const p = g.level.player;
  g.test.spawnZombie('walker', p.pos.x - Math.sin(p.yaw) * 8, p.pos.z - Math.cos(p.yaw) * 8);
  return g.level.stats.shotsFired;
});

// ~1.5с без жодного вводу вогню: режим Малюк НЕ має стріляти сам
await page.waitForTimeout(1500);
const shotsAfter = await page.evaluate(() => window.__game.level.stats.shotsFired);
check(shotsAfter === shotsBefore, `режим Малюк НЕ стріляє сам (${shotsBefore}→${shotsAfter})`);

// ============ ✋ Task 2: жодних клавіш на тачі (E→✋) ============
console.log('▸ Mobile: підказки взаємодії на тачі — ✋, не «E»');

// interactKey() під тачем має повертати ✋ (а не «E»)
const ik = await page.evaluate(async () => {
  const m = await import('/src/i18n.js');
  return m.interactKey();
});
check(ik === '✋', `interactKey() під тачем → «${ik}» (очікувано ✋)`);

// Репрезентативна перетворена підказка місії, зібрана під тачем,
// має містити ✋ і НЕ містити окрему клавішу «E».
const prompts = await page.evaluate(async () => {
  const { t, interactKey } = await import('/src/i18n.js');
  return [
    t('Тримай {k} — засвіти ліхтар', { k: interactKey() }),
    t('Натисни {k} — відчини хлів', { k: interactKey() }),
    t('💚 Тримай {k} — підніми {n}!', { k: interactKey(), n: 'Друг' }),
  ];
});
for (const p of prompts) {
  check(/✋/.test(p) && !/\bE\b/.test(p), `підказка містить ✋, без «E»: «${p}»`);
}

// Production-facing: у джерелах місій/реанімації не лишилось сирих E-підказок
// (усі переведені на {k}+interactKey()). Перевіряємо віддані сервером модулі.
const srcRawE = await page.evaluate(async () => {
  const out = {};
  for (const f of ['/src/missionpool.js', '/src/main.js']) {
    const txt = await (await fetch(f)).text();
    const m = txt.match(/(?:Тримай|Натисни) E —/g);
    if (m) out[f] = m.length;
  }
  return out;
});
check(Object.keys(srcRawE).length === 0,
  `жодних сирих «Тримай E»/«Натисни E» у місіях/реанімації (${JSON.stringify(srcRawE)})`);

// Жодна жива підказка місії, показана на тачі, не має містити окрему «E».
const livePromptOk = await page.evaluate(() => {
  const pr = window.__game && window.__game.level && window.__game.level.missions
    && window.__game.level.missions.prompt;
  if (!pr || !pr.text) return true; // немає активної підказки — не валимо тест
  return !/\bE\b/.test(pr.text);
});
check(livePromptOk, 'жива підказка місії на тачі не містить окрему «E»');

// ============ ✋ Task 2b: іграшки рівня (extras.js) — без клавіш на тачі ============
console.log('▸ Mobile: підказки extras.js (мегабокс/самокат/барикада) на тачі — без «E»');

// Репрезентативні підказки extras, зібрані під тачем (interactKey()→✋),
// мають містити ✋ і НЕ містити окрему клавішу «E».
const extrasPrompts = await page.evaluate(async () => {
  const { t, interactKey, keyHint } = await import('/src/i18n.js');
  return [
    t('🦙 Натисни {k} — відкрий МЕГАБОКС!', { k: interactKey() }),
    t('🛴 Натисни {k} — поїхали!', { k: interactKey() }),
    t('🧱 Натисни {k} — забрати барикаду', { k: interactKey() }),
    keyHint('🛴 Кермуй джойстиком, ✋ — зійти', '🛴 W — газ, S — гальмо, A/D — кермо. E — зійти'),
  ];
});
for (const p of extrasPrompts) {
  check(/✋/.test(p) && !/\bE\b/.test(p) && !/\bW\b/.test(p) && !/\bA\/D\b/.test(p),
    `extras-підказка містить ✋, без клавіш: «${p}»`);
}

// Production-facing: у джерелі extras.js не лишилось сирих гравцю-видимих клавіш,
// які потрапляють на ТАЧ. «Натисни E» в t() — завжди leak. «W — газ» тощо
// дозволені ЛИШЕ у клавіатурній (другій) гілці keyHint(...) — на тач не йдуть.
const extrasRawKeys = await page.evaluate(async () => {
  const txt = await (await fetch('/src/extras.js')).text();
  const out = {};
  // «Натисни E —» у t() — сирий E-промпт, leak на тачі (не має лишатись жодного)
  const e = txt.match(/Натисни E —/g);
  if (e) out['Натисни E'] = e.length;
  // клавіатурні рядки самоката (W — газ…) допустимі тільки всередині keyHint(...)
  for (const line of txt.split('\n')) {
    if (/W — газ/.test(line) && !/keyHint\(/.test(line)) {
      out['W — газ поза keyHint'] = (out['W — газ поза keyHint'] || 0) + 1;
    }
  }
  return out;
});
check(Object.keys(extrasRawKeys).length === 0,
  `жодних сирих клавіш-leak у extras.js (${JSON.stringify(extrasRawKeys)})`);

// ============ ПІДСУМОК ============
console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 12)) console.log('  ', e);
  failed += errors.length;
} else {
  console.log('✅ Без помилок у консолі');
}
console.log(failed === 0 ? '🎉 УСІ ПЕРЕВІРКИ ПРОЙШЛИ' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
