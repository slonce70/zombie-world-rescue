// 🎲 Прокачка 7.2: драфт «Прокачки» на межі хвилі в аренних режимах (Нокаут/Оборона/Портал),
// розширений пул (~24 картки) і крос-тегова синергія «Універсал».
// Драфт-оверлей морозить цикл гри → після відкриття мусимо g.draft.pick(0), інакше зависання.
// Гейт як у кампанії: у ?test драфт мовчить, вмикається лише з &draft.
import { chromium } from 'playwright';
import { waitFor as waitForAsync, makeCheck } from './_browser.mjs';
import { ensureWebServer } from './_server.mjs';

const SLOW = Math.max(1, parseFloat(process.env.SLOW || '1') || 1);
const { base: BASE, close: closeServer } = await ensureWebServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });

let failed = 0;
const check = makeCheck(() => failed++);

const waitFor = (page, fn, timeoutMs, label) => waitForAsync(fn, timeoutMs, label, 200);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// &draft у URL обходить testMode-гейт (як у draft-campaign.mjs)
await page.goto(`${BASE}/?test&fresh&seed=3&draft`, { waitUntil: 'commit', timeout: 60000 });
await waitFor(page, async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000 * SLOW, 'глобус');

// helper: старт режиму → чекаємо рівень
async function startMode(fn, flagPath, label) {
  await page.evaluate(async (f) => {
    const g = window.__game;
    if (g.level) g.endLevel();
    await g.test[f]();
  }, fn);
  await waitFor(page, async () => (await page.evaluate((fp) => {
    const g = window.__game;
    return g.state === 'level' && g.level && !!g.level[fp];
  }, flagPath)), 30000 * SLOW, label);
}

// ─── НОКАУТ: драфт на середині забігу (половина зомбі зачищена) ───
console.log('▸ Нокаут: драфт на середині забігу');
// Нокаут відкривається на 20 рівні Зоряного шляху — донараховуємо XP
await page.evaluate(async () => {
  const g = window.__game;
  const { xpForLevel } = await import('/src/progress.js');
  let xp = 0;
  for (let lvl = g.progress.level; lvl < 20; lvl++) xp += xpForLevel(lvl);
  g.test.addXp(xp);
});
await startMode('startKnockout', 'knockout', 'рівень Нокаут');
const koBuild = await page.evaluate(() => !!window.__game.level.runBuild);
check(koBuild, 'у соло-Нокауті створюється runBuild');

// вбиваємо половину+1 зомбі, щоб перетнути поріг remaining <= target/2
await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  const alive = g.level.zombies.list.filter((z) => z.knockout && z.state !== 'dead');
  const kill = Math.ceil(alive.length / 2) + 1;
  for (let i = 0; i < kill; i++) alive[i].damage(99999, null, false);
});
const koDraft = await waitFor(page, async () => (await page.evaluate(() => window.__game.draft.isOpen)), 8000 * SLOW, 'драфт Нокауту');
check(koDraft, 'Нокаут: драфт відкрився на межі хвилі (середина)');
const koPick = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const snap = { dmg: p.damageMult, spd: p.speedMult, maxHp: p.maxHealth, gren: p.grenades, life: p.lifeSteal || 0, jump: p.jumpPower };
  g.draft.pick(0);
  const changed = p.damageMult !== snap.dmg || p.speedMult !== snap.spd || p.maxHealth !== snap.maxHp
    || p.grenades !== snap.gren || (p.lifeSteal || 0) !== snap.life || p.jumpPower !== snap.jump;
  return { open: g.draft.isOpen, picks: g.level.runBuild.picks.length, changed };
});
check(!koPick.open, 'Нокаут: pick(0) закрив драфт', JSON.stringify(koPick));
check(koPick.picks === 1, 'Нокаут: картку взято', JSON.stringify(koPick));
check(koPick.changed, 'Нокаут: картка застосувала стат до гравця', JSON.stringify(koPick));

// драфт не відкривається вдруге за той самий забіг
const koOnce = await page.evaluate(() => {
  const g = window.__game;
  const alive = g.level.zombies.list.filter((z) => z.knockout && z.state !== 'dead');
  if (alive[0]) alive[0].damage(99999, null, false);
  return g.level.knockout._draftFired;
});
check(koOnce === true, 'Нокаут: драфт помічено як спрацьований (раз за забіг)', String(koOnce));

// ─── ОБОРОНА (перегружена, 3 хвилі): драфт на межі хвилі ───
console.log('▸ Оборона: драфт на межі хвилі');
await startMode('startOverloadedDefense', 'defense', 'рівень Оборона');
const defWaves = await page.evaluate(() => window.__game.level.defense.waveTotal);
check(defWaves >= 2, 'перегружена Оборона має ≥2 хвилі', String(defWaves));
// зачищаємо поточну хвилю → на межі відкриється драфт перед спавном наступної
await page.evaluate(() => {
  const g = window.__game;
  g.test.god();
  for (const z of [...g.level.zombies.list]) if (z.defense && z.state !== 'dead') z.damage(99999, null, false);
});
const defDraft = await waitFor(page, async () => (await page.evaluate(() => window.__game.draft.isOpen)), 8000 * SLOW, 'драфт Оборони');
check(defDraft, 'Оборона: драфт відкрився на межі хвилі');
const defPick = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const snap = { dmg: p.damageMult, spd: p.speedMult, maxHp: p.maxHealth, gren: p.grenades, life: p.lifeSteal || 0, jump: p.jumpPower };
  g.draft.pick(0);
  const changed = p.damageMult !== snap.dmg || p.speedMult !== snap.spd || p.maxHealth !== snap.maxHp
    || p.grenades !== snap.gren || (p.lifeSteal || 0) !== snap.life || p.jumpPower !== snap.jump;
  return { open: g.draft.isOpen, picks: g.level.runBuild.picks.length, changed, wave: g.level.defense.wave };
});
check(!defPick.open && defPick.picks === 1 && defPick.changed, 'Оборона: pick застосувався і закрив драфт', JSON.stringify(defPick));
// після піка гра продовжилась → наступна хвиля заспавнилась
const defResume = await waitFor(page, async () => (await page.evaluate(() =>
  window.__game.level.zombies.list.some((z) => z.defense && z.state !== 'dead'))), 8000 * SLOW, 'наступна хвиля Оборони');
check(defResume, 'Оборона: після піка гра продовжилась (наступна хвиля заспавнилась)');

// ─── ПОРТАЛ: драфт при закритті порталу ───
console.log('▸ Портал: драфт при закритті порталу');
await startMode('startPortal', 'portal', 'рівень Портал');
const portalBuild = await page.evaluate(() => !!window.__game.level.runBuild);
check(portalBuild, 'у соло-Порталі створюється runBuild');
await page.evaluate(() => {
  const g = window.__game;
  const portal = g.level.portal.portals.find((p) => p.open);
  g.level.portal.damagePortal(portal, portal.hp); // закриваємо один портал
});
const portalDraft = await waitFor(page, async () => (await page.evaluate(() => window.__game.draft.isOpen)), 8000 * SLOW, 'драфт Порталу');
check(portalDraft, 'Портал: драфт відкрився при закритті порталу');
const portalPick = await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player;
  const snap = { dmg: p.damageMult, spd: p.speedMult, maxHp: p.maxHealth, gren: p.grenades, life: p.lifeSteal || 0, jump: p.jumpPower };
  g.draft.pick(0);
  const changed = p.damageMult !== snap.dmg || p.speedMult !== snap.spd || p.maxHealth !== snap.maxHp
    || p.grenades !== snap.gren || (p.lifeSteal || 0) !== snap.life || p.jumpPower !== snap.jump;
  return { open: g.draft.isOpen, picks: g.level.runBuild.picks.length, changed, closed: g.level.portal.closedCount() };
});
check(!portalPick.open && portalPick.picks === 1 && portalPick.changed, 'Портал: pick застосувався і закрив драфт', JSON.stringify(portalPick));
check(portalPick.closed === 1, 'Портал: один портал лишається закритим після драфту', JSON.stringify(portalPick));

// ─── ОБОРОНА (звичайна, 1 хвиля): драфт на середині пачки (v282) ───
console.log('▸ Оборона (звичайна): драфт на середині пачки');
await startMode('startDefense', 'defense', 'рівень Оборона (звичайна)');
const nd = await page.evaluate(() => ({
  waves: window.__game.level.defense.waveTotal,
  target: window.__game.level.defense.target,
  open: window.__game.draft.isOpen,
}));
check(nd.waves === 1, 'звичайна Оборона має 1 хвилю', JSON.stringify(nd));
if (nd.open) await page.evaluate(() => window.__game.draft.pick(0)); // стартовий бордер-драфт (як у overloaded)
await page.evaluate(() => {
  const g = window.__game;
  let toKill = Math.ceil(g.level.defense.target / 2) + 1;
  for (const z of [...g.level.zombies.list]) {
    if (toKill <= 0) break;
    if (z.defense && z.state !== 'dead') { z.damage(99999, null, false); toKill--; }
  }
});
const ndDraft = await waitFor(page, async () => (await page.evaluate(() => window.__game.draft.isOpen)), 8000 * SLOW, 'драфт звичайної Оборони');
check(ndDraft, 'звичайна Оборона: драфт відкрився на середині пачки');
const ndPick = await page.evaluate(() => {
  const g = window.__game;
  g.draft.pick(0);
  return { open: g.draft.isOpen, picks: g.level.runBuild.picks.length };
});
check(!ndPick.open && ndPick.picks >= 1, 'звичайна Оборона: pick застосувався і закрив драфт', JSON.stringify(ndPick));

// ─── ОБОРОНА В ЗОНІ: драфт на половині часу (v282) ───
console.log('▸ Оборона в зоні: драфт на половині часу');
await startMode('startZoneDefense', 'defense', 'рівень Оборона в зоні');
await page.evaluate(() => {
  const d = window.__game.level.defense;
  d.timer = d.cfg.duration / 2 - 0.5; // перемотуємо на середину
});
const zdDraft = await waitFor(page, async () => (await page.evaluate(() => window.__game.draft.isOpen)), 8000 * SLOW, 'драфт зони');
check(zdDraft, 'зона: драфт відкрився на половині часу');
const zdPick = await page.evaluate(() => {
  const g = window.__game;
  g.draft.pick(0);
  return { open: g.draft.isOpen, picks: g.level.runBuild.picks.length };
});
check(!zdPick.open && zdPick.picks >= 1, 'зона: pick застосувався і закрив драфт', JSON.stringify(zdPick));

// ─── Пул ~24 картки + крос-тегова синергія «Універсал» ───
console.log('▸ Пул і крос-тегова синергія');
const poolInfo = await page.evaluate(async () => {
  const mod = await import('/src/runbuild.js');
  const { CARD_POOL, COMBOS, RunBuild } = mod;
  const byTag = { power: 0, speed: 0, tank: 0 };
  for (const c of CARD_POOL) byTag[c.tag] = (byTag[c.tag] || 0) + 1;
  // рука з 3 тегів: беремо по одній картці кожного тега → має спрацювати cross
  const one = (tg) => CARD_POOL.find((c) => c.tag === tg);
  const p = { damageMult: 1, speedMult: 1, maxHealth: 100, health: 100, grenades: 2, maxArmor: 50, armor: 0, jumpPower: 7.6 };
  const rb = new RunBuild();
  const fired = [];
  fired.push(rb.apply(one('power'), p));
  fired.push(rb.apply(one('speed'), p));
  const dmgBefore = p.damageMult;
  const last = rb.apply(one('tank'), p);
  fired.push(last);
  return {
    total: CARD_POOL.length,
    byTag,
    hasCross: !!COMBOS.cross,
    crossFired: last === 'cross' || fired.includes('cross'),
    firedSeq: fired,
    dmgBumpedByCross: p.damageMult > dmgBefore, // cross дає +10% шкоди понад tank-картку (яка шкоду не чіпає)
    crossTitle: COMBOS.cross ? COMBOS.cross.title : '',
  };
});
check(poolInfo.total >= 24, 'пул має ≥24 карток', String(poolInfo.total));
check(poolInfo.byTag.power >= 3 && poolInfo.byTag.speed >= 3 && poolInfo.byTag.tank >= 3,
  'кожен тег має ≥ по картках', JSON.stringify(poolInfo.byTag));
check(poolInfo.hasCross, 'у COMBOS є крос-теговий бонус cross');
check(poolInfo.crossFired, 'крос-синергія спрацювала при зборі 3 тегів', JSON.stringify(poolInfo.firedSeq));
check(poolInfo.dmgBumpedByCross, 'крос-синергія дала бонус до шкоди (додатковий стат)', String(poolInfo.dmgBumpedByCross));

check(errors.length === 0, 'без JS-помилок', errors.slice(0, 3).join(' | '));
console.log(failed === 0 ? '\n🎉 DRAFT-MODES OK' : `\n❌ ПРОВАЛЕНО: ${failed}`);
await ctx.close();
await browser.close();
closeServer();
process.exit(failed ? 1 : 0);
