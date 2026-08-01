// Тести M7: «Світ у вогні» — зірки складності (опційні, opt-in).
// ★1 == сьогодні (ідентичність): множник = 1 для hp/dmg/counts і боса.
// ★>1 робить зомбі міцнішими/сильнішими; дефолт save.diffStar === 1.
import { openBrowserTest, waitFor as waitForAsync, makeCheck } from './_browser.mjs';

const { BASE, page, errors, closeTest } = await openBrowserTest({ context: { viewport: { width: 1280, height: 800 } } });

let failed = 0;
const check = makeCheck(() => failed++);
const waitFor = (fn, timeoutMs, label) => waitForAsync(fn, timeoutMs, label, 300);
async function loadCountry(c, extra = '') {
  await page.goto(`${BASE}/?test&fresh&country=${c}${extra}`);
  await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'рівень ' + c);
}

// ============ ⭐ ЗІРКИ СКЛАДНОСТІ ============
console.log('▸ M7: Світ у вогні (зірки складності)');
await loadCountry('UKR');

// spawn-овий walker на заданій зірці → повертаємо його maxHp.
// Свіжий Zombies(level, seed) читає level.diffStar у конструкторі.
const hpAt = (star) => page.evaluate((s) => {
  const g = window.__game; g.level.diffStar = s;
  const Z = g.level.zombies.constructor;
  const zm = new Z(g.level, 12345);
  const p = g.level.player.pos;
  const z = zm.spawn('walker', p.x + 6, p.z);
  const hp = z.maxHp; if (z.rig) g.level.scene.remove(z.rig.group);
  return hp;
}, star);

const hp1 = await hpAt(1);
const hp3 = await hpAt(3);
check(hp3 > hp1 * 1.5, `★3 робить зомбі міцнішими (${hp1} → ${hp3})`);
check((await page.evaluate(() => window.__game.save.diffStar)) === 1, 'дефолтна складність — ★1');
// ★1 ідентична базі: walker TYPE_STATS.hp = 70, базова country.difficulty.hp у соло = 1
check(hp1 === 70, `★1 = базова HP walker (${hp1})`);

// boss теж масштабується зіркою (м'якше), але на ★1 — ідентичний
const bossHpAt = (star) => page.evaluate((s) => {
  const g = window.__game; g.level.diffStar = s;
  const Z = g.level.zombies.constructor;
  const zm = new Z(g.level, 12345);
  const b = zm.spawnBoss();
  const hp = b.maxHp; zm.despawnBoss && zm.despawnBoss();
  if (b.rig) g.level.scene.remove(b.rig.group);
  return hp;
}, star);
const bhp1 = await bossHpAt(1);
const bhp3 = await bossHpAt(3);
check(bhp3 > bhp1, `★3 робить боса міцнішим (${bhp1} → ${bhp3})`);

// diffStar валідується в save (1..5)
const validated = await page.evaluate(() => {
  const g = window.__game;
  g.save.diffStar = 99; g.saveGame();
  // повторне завантаження сейва має повернути в межі 1..5
  const out = g._loadSave();
  return out.diffStar;
});
check(validated >= 1 && validated <= 5, `save.diffStar валідується в 1..5 (got ${validated})`);

// ============ ⭐ СЕЛЕКТОР У НАЛАШТУВАННЯХ (v740: складність зібрана в одному екрані) ============
console.log('▸ M7: ★ селектор у Налаштуваннях');
await page.evaluate(() => { window.__game.save.diffStar = 1; window.__game._renderDifficultySettings(); });
const stars = await page.evaluate(() => document.querySelectorAll('#settings-stars [data-star]').length);
check(stars === 5, `у Налаштуваннях 5 кнопок зірок (${stars})`);
const hqStars = await page.evaluate(() => { window.__game.hq.render(); return document.querySelectorAll('#hq-content .hq-star').length; });
check(hqStars === 0, `у Штабі дубля зірок більше немає (${hqStars})`);
await page.evaluate(() => { const b = document.querySelector('#settings-stars [data-star="4"]'); if (b) b.click(); });
check((await page.evaluate(() => window.__game.save.diffStar)) === 4, 'клік ★4 ставить save.diffStar=4');

// ============ ⭐ v750: ЗІРКА ДІЄ ТАМ, ДЕ ДИТИНА ГРАЄ ============
console.log('▸ v750: зірка на першому проходженні, у кімнатних режимах і в коопі');
await page.goto(`${BASE}/?test&fresh`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'globe', 30000, 'глобус');

// перше проходження країни (liberated порожній) тепер поважає обрану зірку
const firstRun = await page.evaluate(async () => {
  const g = window.__game;
  g.save.diffStar = 3;
  g.save.liberated = {};
  await g.startLevel('UKR');
  const chip = document.getElementById('diff-chip');
  return {
    wasLiberated: !!g.save.liberated.UKR,
    diffStar: g.level.diffStar,
    active: g.level.diffStarActive === true,
    chipText: chip ? chip.textContent : '',
    chipShown: !!chip && chip.style.display !== 'none',
  };
});
check(firstRun.wasLiberated === false && firstRun.diffStar === 3 && firstRun.active,
  `★3 діє на ПЕРШОМУ проходженні країни (${JSON.stringify(firstRun)})`);
check(firstRun.chipShown && /3/.test(firstRun.chipText),
  `чип складності видно на HUD (${JSON.stringify(firstRun.chipText)})`);

// кімнатний режим лишається поза системою зірок
const roomMode = await page.evaluate(async () => {
  const g = window.__game;
  g.save.diffStar = 5;
  g.endLevel();
  await g.startLevel('UKR', { knockout: true });
  const chip = document.getElementById('diff-chip');
  const out = { diffStar: g.level.diffStar, active: g.level.diffStarActive === true, chipShown: !!chip && chip.style.display !== 'none' };
  g.endLevel();
  return out;
});
check(roomMode.diffStar === 1 && !roomMode.active && !roomMode.chipShown,
  `нокаут лишається ★1 навіть при save.diffStar=5 (${JSON.stringify(roomMode)})`);

// кооп: зірку задає ХОСТ і вона їде гостю мережею (cfg/welcome/start spec)
const coopStar = await page.evaluate(async () => {
  const { sanitizeDiffStar } = await import('/src/net/protocol.js');
  const g = window.__game;
  const s = g.coop.session;
  const before = { role: s.role, star: s.hostDiffStar };
  s.role = 'host';
  g.save.diffStar = 4;
  const host = s.difficultyStar();
  s.role = 'guest';
  s.hostDiffStar = 1;
  s._onMessage(1, { t: 'cfg', countryId: 'UKR', mode: 'campaign', ds: 5 });
  const guest = s.difficultyStar();
  s._onMessage(1, { t: 'cfg', countryId: 'UKR', mode: 'campaign', ds: 99 });
  const clamped = s.difficultyStar();
  s.role = before.role;
  s.hostDiffStar = before.star;
  return { host, guest, clamped, sane: [sanitizeDiffStar(undefined), sanitizeDiffStar('4'), sanitizeDiffStar(0)] };
});
check(coopStar.host === 4, `хост віддає свою зірку в кімнату (${coopStar.host})`);
check(coopStar.guest === 5, `гість бере зірку хоста з cfg, а не свою (${coopStar.guest})`);
check(coopStar.clamped === 1 && JSON.stringify(coopStar.sane) === '[1,4,1]',
  `санітайзер зірки: сміття → ★1 (${JSON.stringify(coopStar)})`);

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
await closeTest();
process.exit(failed === 0 ? 0 : 1);
