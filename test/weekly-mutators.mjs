// 🗓️ Глобальні мутатори тижня: solo-room ефекти через Zombies.spawn + кооп-гард
import { chromium } from 'playwright';
import { waitFor as waitForAsync } from './_browser.mjs';
import { ensureWebServer } from './_server.mjs';

const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });

let failed = 0;
const check = (ok, msg, detail = '') => {
  console.log(ok ? '  ✅' : '  ❌', msg, detail);
  if (!ok) failed++;
};

const waitFor = (page, fn, timeoutMs, label) => waitForAsync(fn, timeoutMs, label, 200);

async function startBankWith(page, modId) {
  await page.evaluate((id) => {
    const g = window.__game;
    if (g.level) g.endLevel();
    const toasts = document.getElementById('toasts');
    if (toasts) toasts.innerHTML = '';
    g.weeklyModifierId = () => id;
    g.test.startBank();
  }, modId);
  await waitFor(page, async () => (
    await page.evaluate(() => window.__game.state === 'level' && !!window.__game.level && !!window.__game.level.bank)
  ), 30000 * SLOW, `банк із мутатором ${modId}`);
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?test&fresh&seed=7&weekmod`, { waitUntil: 'domcontentloaded' });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус');

console.log('▸ tough: HP множиться у кімнатному solo-режимі');
await startBankWith(page, 'tough');
const tough = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.level.zombies.spawn('walker', p.x + 9, p.z + 1, {});
  return {
    weeklyMod: g.level.weeklyMod,
    weeklyMutator: g.level.weeklyMutator,
    type: z.type,
    maxHp: z.maxHp,
    expected: Math.round(70 * g.level.zombies.diff.hp * 1.35),
  };
});
check(tough.weeklyMod === null, 'campaign weeklyMod не ставиться у bank', JSON.stringify(tough.weeklyMod));
check(!!tough.weeklyMutator && tough.weeklyMutator.hpMul === 1.35, 'weeklyMutator tough активний у bank', JSON.stringify(tough.weeklyMutator));
check(Math.abs(tough.maxHp - tough.expected) <= 1, 'walker HP отримав ×1.35', JSON.stringify(tough));

console.log('▸ swift: speed/chaseSpeed множаться у spawn');
await startBankWith(page, 'swift');
const swift = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.level.zombies.spawn('walker', p.x + 10, p.z + 1, {});
  return {
    weeklyMutator: g.level.weeklyMutator,
    speed: z.stats.speed,
    chaseSpeed: z.stats.chaseSpeed,
  };
});
check(!!swift.weeklyMutator && swift.weeklyMutator.speedMul === 1.25, 'weeklyMutator swift активний у bank', JSON.stringify(swift.weeklyMutator));
check(Math.abs(swift.speed - 1.7 * 1.25) < 0.0001, 'walker speed отримав ×1.25', JSON.stringify(swift));
check(Math.abs(swift.chaseSpeed - 3.4 * 1.25) < 0.0001, 'walker chaseSpeed отримав ×1.25', JSON.stringify(swift));

console.log('▸ elite: безпечна підміна простих типів, без boss');
await startBankWith(page, 'elite');
const elite = await page.evaluate(() => {
  const g = window.__game;
  g.level.weeklyMutator.eliteChance = 1;
  const p = g.level.player.pos;
  const made = [];
  for (let i = 0; i < 6; i++) {
    const z = g.level.zombies.spawn(i % 2 ? 'runner' : 'walker', p.x + 12 + i, p.z + 2, {});
    made.push({ type: z.type, maxHp: z.maxHp, bossStyle: z.bossStyle });
  }
  return { weeklyMutator: g.level.weeklyMutator, made };
});
check(!!elite.weeklyMutator && elite.weeklyMutator.eliteChance === 1, 'eliteChance можна зробити детермінованим у тесті', JSON.stringify(elite.weeklyMutator));
check(elite.made.every((z) => z.type === 'tank' || z.type === 'shield'), 'elite підміняє walker/runner тільки на tank/shield', JSON.stringify(elite.made));
check(!elite.made.some((z) => z.type === 'boss' || z.bossStyle), 'elite ніколи не створює boss', JSON.stringify(elite.made));

console.log('▸ night: ніч форситься у кімнатному solo-режимі та показує один подієвий тост');
await startBankWith(page, 'night');
const night = await page.evaluate(() => {
  const g = window.__game;
  g.level.stats.time = 10;
  g._updateDayNight();
  const toasts = [...document.querySelectorAll('#toasts .toast, .toast')].map((el) => el.textContent);
  return {
    weeklyMod: g.level.weeklyMod,
    weeklyMutator: g.level.weeklyMutator,
    nightK: g.level.nightK,
    eventToasts: toasts.filter((txt) => txt.includes('Подія тижня')),
  };
});
check(night.weeklyMod === null, 'night у bank не чіпає campaign weeklyMod', JSON.stringify(night.weeklyMod));
check(!!night.weeklyMutator && night.weeklyMutator.night === true, 'weeklyMutator night активний у bank', JSON.stringify(night.weeklyMutator));
check(night.nightK >= 0.75, 'night форсить nightK >= 0.75 у bank', JSON.stringify(night));
check(night.eventToasts.length === 1, 'подієвий тост показано рівно один раз', JSON.stringify(night.eventToasts));

// 🧛 v282: форс ночі НЕ вмикає амбієнтного спавнера вампірів у кімнатних режимах —
// пачки/ліміти там свої, зайвий вампір ламає баланс дитині
const vamp = await page.evaluate(() => {
  const g = window.__game;
  const z = g.level.zombies;
  const before = z.list.filter((x) => x.type === 'vampire').length;
  z._vampT = 0; // таймер «дозрів» — спавн мав би статись цього ж виклику
  z._spawnNightVampires(1, [g.level.player]);
  const after = z.list.filter((x) => x.type === 'vampire').length;
  return { before, after, nightK: g.level.nightK };
});
check(vamp.after === vamp.before, 'вампіри НЕ спавняться у кімнатному режимі попри ніч', JSON.stringify(vamp));

console.log('▸ guard: unknown/playground → null; coop зі spec-id → мутатор (M2.1)');
const guards = await page.evaluate(() => {
  const g = window.__game;
  return {
    hasBuilder: typeof g._buildWeeklyMutator === 'function',
    unknown: g._buildWeeklyMutator && g._buildWeeklyMutator('__none', { coop: null, isPlayground: false }),
    playground: g._buildWeeklyMutator && g._buildWeeklyMutator('tough', { coop: null, isPlayground: true }),
    // M2.1: у коопі мутатор БУДУЄТЬСЯ з id зі spec хоста (гейт застосував хост);
    // порожній id у коопі все одно null
    coop: g._buildWeeklyMutator && g._buildWeeklyMutator('tough', { coop: { role: 'host' }, isPlayground: false }),
    coopNoId: g._buildWeeklyMutator && g._buildWeeklyMutator(null, { coop: { role: 'host' }, isPlayground: false }),
  };
});
check(guards.hasBuilder, '_buildWeeklyMutator доступний для чесного unit-гарда', JSON.stringify(guards));
check(guards.unknown === null && guards.playground === null, 'unknown/playground резолвляться у null', JSON.stringify(guards));
check(guards.coop && guards.coop.id === 'tough' && guards.coopNoId === null, 'coop зі spec-id → мутатор; без id → null', JSON.stringify(guards));

console.log('▸ testMode-гейт: без ?weekmod мутатор у ?test вимкнений (батарея не залежить від реального тижня)');
const gatePage = await ctx.newPage();
gatePage.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await gatePage.goto(`${BASE}/?test&fresh&seed=7`, { waitUntil: 'domcontentloaded' });
await waitFor(gatePage, async () => (await gatePage.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус без weekmod');
await gatePage.evaluate(() => {
  const g = window.__game;
  g.weeklyModifierId = () => 'tough';
  g.test.startBank();
});
await waitFor(gatePage, async () => (
  await gatePage.evaluate(() => window.__game.state === 'level' && !!window.__game.level && !!window.__game.level.bank)
), 30000 * SLOW, 'банк без weekmod');
const gated = await gatePage.evaluate(() => window.__game.level.weeklyMutator);
check(gated === null || gated === undefined, 'у ?test без ?weekmod level.weeklyMutator не ставиться', JSON.stringify(gated));
await gatePage.close();

console.log('▸ JS-помилки');
check(errors.length === 0, 'немає pageerror/console error', errors.slice(0, 10).join('\n'));

await ctx.close();
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
