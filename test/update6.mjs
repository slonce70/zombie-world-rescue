// Тести оновлення 6 «Живі завдання»: динамічні місії з пулу, нові типи,
// випадковий лут, перероздача після перемоги
import { chromium } from 'playwright';

const BASE = 'http://localhost:8741';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

let failed = 0;
const check = (cond, msg) => {
  console.log(cond ? '  ✅' : '  ❌', msg);
  if (!cond) failed++;
};
async function loadCountry(c, pre = null) {
  await page.goto(`${BASE}/?test&fresh`);
  await page.waitForFunction(() => window.__game?.state === 'globe', null, { timeout: 30000 });
  if (pre) await page.evaluate(pre);
  await page.evaluate((id) => window.__game.startLevel(id), c);
  await page.waitForFunction(() => window.__game?.state === 'level' && window.__game.level, null, { timeout: 40000 });
}
const missionList = () => page.evaluate(() => window.__game.level.missions.missions.map((m) => m.type));

// ============ 🎲 РОЗДАЧА МІСІЙ ============
console.log('▸ Роздача місій із пулу');
await loadCountry('UKR');
let types = await missionList();
check(JSON.stringify(types) === '["rescue","repair","clear"]', `перше проходження України — класика (${types})`);

const rolls = await page.evaluate(() => {
  const g = window.__game;
  return {
    polA: g.test.rollMissions('POL', 2025, 0),
    polB: g.test.rollMissions('POL', 2025, 0),
    deu: g.test.rollMissions('DEU', 4040, 0),
    fra: g.test.rollMissions('FRA', 5050, 0),
    polRun1: g.test.rollMissions('POL', 2025, 1),
    ukrRun1: g.test.rollMissions('UKR', 1377, 1),
    all: g.test.missionTypes(),
  };
});
check(JSON.stringify(rolls.polA) === JSON.stringify(rolls.polB), `роздача детермінована (${rolls.polA})`);
check(new Set(rolls.polA).size === 3, 'три РІЗНІ типи місій на карті');
const distinctSets = new Set([rolls.polA, rolls.deu, rolls.fra, rolls.ukrRun1].map((x) => JSON.stringify(x)));
check(distinctSets.size >= 3, `країни мають різні набори (${distinctSets.size}/4 унікальних)`);
check(JSON.stringify(rolls.polA) !== JSON.stringify(rolls.polRun1) || JSON.stringify(rolls.ukrRun1) !== '["rescue","repair","clear"]',
  `повторне проходження перероздає місії (POL run1: ${rolls.polRun1})`);
check(rolls.all.length >= 8, `у пулі ${rolls.all.length} типів місій`);
for (const arr of [rolls.polA, rolls.deu, rolls.fra]) {
  for (const t of arr) check(rolls.all.includes(t), `тип «${t}» валідний`);
}

// POL реально будується зі своїм набором
await loadCountry('POL');
types = await missionList();
check(JSON.stringify(types) === JSON.stringify(rolls.polA), `Польща отримала свій набір (${types})`);

// ============ 🧺 ЗБІР ПРИПАСІВ ============
console.log('▸ Місія «Збір припасів»');
await loadCountry('UKR', () => { window.__game._forceMissionSet = ['collect', 'repair', 'clear']; });
await page.evaluate(() => window.__game.test.god());
const collectRes = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.level.missions.missions[0];
  const out = { type: m.type, crates: m.crates.length, found: [] };
  for (const c of m.crates) {
    g.test.teleport(c.x, c.z);
    const t0 = performance.now();
    while (performance.now() - t0 < 8000 && !c.taken) {
      g.test.key('KeyE', true);
      await new Promise((r) => setTimeout(r, 300));
      g.test.key('KeyE', false);
    }
    out.found.push(c.taken);
  }
  out.done = m.state === 'done';
  out.foundN = m.found;
  return out;
});
check(collectRes.type === 'collect' && collectRes.crates === 4, '4 ящики розкладено по карті');
check(collectRes.found.every(Boolean), `усі ящики підбираються (${collectRes.foundN}/4)`);
check(collectRes.done, 'місія «Збір» завершується');

// ============ 🛡️ ОБОРОНА ============
console.log('▸ Місія «Оборона»');
await loadCountry('UKR', () => { window.__game._forceMissionSet = ['rescue', 'defense', 'clear']; });
await page.evaluate(() => window.__game.test.god());
const defenseRes = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.level.missions.missions[1];
  const out = { type: m.type };
  const zx = m.zone.x, zz = m.zone.z; // координати зони (зникає після завершення)
  g.test.teleport(zx, zz);
  const t0 = performance.now();
  while (performance.now() - t0 < 8000 && !m.started) await new Promise((r) => setTimeout(r, 250));
  out.started = m.started;
  // хвиля повинна заспавнитись
  const t1 = performance.now();
  while (performance.now() - t1 < 12000 && g.level.zombies.list.filter((z) => z.aggroed && z.state !== 'dead').length === 0) {
    await new Promise((r) => setTimeout(r, 300));
  }
  out.waveCame = g.level.zombies.list.some((z) => z.aggroed && z.state !== 'dead');
  // пришвидшуємо таймер
  m.timer = 0.4;
  const t2 = performance.now();
  while (performance.now() - t2 < 8000 && m.state !== 'done') await new Promise((r) => setTimeout(r, 250));
  out.done = m.state === 'done';
  g.test.killZombiesNear(zx, zz, 60);
  return out;
});
check(defenseRes.type === 'defense' && defenseRes.started, 'оборона стартує при вході в зону');
check(defenseRes.waveCame, 'хвилі нападників приходять');
check(defenseRes.done, 'зона втримана — місія завершена');

// ============ 👹 ПОЛЮВАННЯ ============
console.log('▸ Місія «Полювання на елітних»');
await loadCountry('UKR', () => { window.__game._forceMissionSet = ['hunt', 'repair', 'clear']; });
await page.evaluate(() => window.__game.test.god());
const huntRes = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.level.missions.missions[0];
  const out = { type: m.type, n: m.elites.length, hp: m.elites.map((e) => e.maxHp) };
  for (const e of m.elites) e.damage(99999, null, false);
  const t0 = performance.now();
  while (performance.now() - t0 < 8000 && m.state !== 'done') await new Promise((r) => setTimeout(r, 250));
  out.done = m.state === 'done';
  out.markers = g.level.missions.getMarkers().length;
  return out;
});
check(huntRes.type === 'hunt' && huntRes.n === 3, '3 елітні зомбі на карті');
check(huntRes.hp.every((h) => h >= 90), `еліти посилені (HP: ${huntRes.hp})`);
check(huntRes.done, 'усі еліти переможені — місія завершена');

// ============ 🟣 ГНІЗДА ============
console.log('▸ Місія «Гнізда»');
await loadCountry('UKR', () => { window.__game._forceMissionSet = ['rescue', 'nests', 'clear']; });
await page.evaluate(() => window.__game.test.god());
const nestsRes = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.level.missions.missions[1];
  const out = { type: m.type, n: m.nestList.length };
  for (const nest of m.nestList) {
    g.test.killZombiesNear(nest.x, nest.z, 12);
    g.test.teleport(nest.x + 1.5, nest.z);
    nest.progress = 0.9; // headless-час повільний — докручуємо хвостик чесним утриманням E
    const t0 = performance.now();
    g.test.key('KeyE', true);
    while (performance.now() - t0 < 10000 && !nest.cleared) {
      g.input.keys.add('KeyE');
      await new Promise((r) => setTimeout(r, 250));
    }
    g.test.key('KeyE', false);
    g.input.keys.delete('KeyE');
    out['cleared' + m.cleared] = nest.cleared;
  }
  out.done = m.state === 'done';
  out.cleared = m.cleared;
  return out;
});
check(nestsRes.type === 'nests' && nestsRes.n === 3, '3 гнізда на карті');
check(nestsRes.cleared === 3, `усі гнізда знешкоджено утриманням E (${nestsRes.cleared}/3)`);
check(nestsRes.done, 'місія «Гнізда» завершена');

// ============ 🧳 ЕСКОРТ ============
console.log('▸ Місія «Ескорт»');
await loadCountry('UKR', () => { window.__game._forceMissionSet = ['escort', 'repair', 'clear']; });
await page.evaluate(() => window.__game.test.god());
const escortRes = await page.evaluate(async () => {
  const g = window.__game;
  const m = g.level.missions.missions[0];
  const out = { type: m.type };
  // забираємо мандрівника
  g.test.teleport(m.site.x, m.site.z + 2);
  const t0 = performance.now();
  while (performance.now() - t0 < 8000 && !m.started) {
    g.test.key('KeyE', true);
    await new Promise((r) => setTimeout(r, 300));
    g.test.key('KeyE', false);
  }
  out.started = m.started;
  out.hasTraveler = !!m.traveler;
  // ведемо до вежі (телепорт — мандрівник наздожене телепортом >30м)
  g.test.teleport(m.dest.x + 2, m.dest.z + 2);
  const t1 = performance.now();
  while (performance.now() - t1 < 15000 && m.state !== 'done') await new Promise((r) => setTimeout(r, 300));
  out.done = m.state === 'done';
  return out;
});
check(escortRes.type === 'escort' && escortRes.started, 'мандрівник приєднується (E)');
check(escortRes.hasTraveler, 'мандрівник іде за героєм');
check(escortRes.done, 'мандрівник доведений — місія завершена');

// ============ 🔁 АЛІАСИ І ПЕРЕРОЗДАЧА ============
console.log('▸ Сумісність і перероздача');
await loadCountry('UKR', () => { window.__game._forceMissionSet = ['collect', 'defense', 'hunt']; });
const aliasRes = await page.evaluate(() => {
  const g = window.__game;
  // старі ID працюють як слоти
  g.test.completeMission('rescue'); // слот 0 = collect
  g.test.completeMission('tower'); // слот 1 = defense
  g.test.completeMission('warehouse'); // слот 2 = hunt
  return g.level.missions.missions.map((m) => m.state);
});
check(aliasRes.every((s2) => s2 === 'done'), 'старі ID місій працюють як аліаси слотів');

const runsRes = await page.evaluate(() => {
  const g = window.__game;
  g.test.setMissionRun('POL', 0);
  const run0 = g.test.rollMissions('POL', 2025, 0);
  const run3 = g.test.rollMissions('POL', 2025, 3);
  return { differs: JSON.stringify(run0) !== JSON.stringify(run3), run0, run3 };
});
check(runsRes.differs, `різні проходження — різні місії (${runsRes.run0} ≠ ${runsRes.run3})`);

// ============ 🎁 ВИПАДКОВИЙ ЛУТ ============
console.log('▸ Випадковий лут');
const loot1 = await page.evaluate(() => window.__game.level.world.lootSpots.map((l) => l.type).join(','));
await loadCountry('UKR');
const loot2 = await page.evaluate(() => window.__game.level.world.lootSpots.map((l) => l.type).join(','));
await loadCountry('UKR');
const loot3 = await page.evaluate(() => window.__game.level.world.lootSpots.map((l) => l.type).join(','));
check(loot1 !== loot2 || loot2 !== loot3, 'вміст будинків перемішується щозабігу');

// ============ ПІДСУМОК ============
console.log('');
if (errors.length) {
  console.log('❌ ПОМИЛКИ КОНСОЛІ:');
  for (const e of errors.slice(0, 12)) console.log('  ', e);
  failed += errors.length;
} else {
  console.log('✅ Без помилок у консолі');
}
console.log(failed === 0 ? '🎉 УСІ ТЕСТИ ОНОВЛЕННЯ 6 ПРОЙДЕНО' : `💥 ПРОВАЛЕНО: ${failed}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
