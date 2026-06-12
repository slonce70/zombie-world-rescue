// Тести оновлення 4: XP/пасс, щоденні завдання, скіни/танці, Мегабокс,
// пес, самокат, гаджети, режим «Шторм», стрілка до цілі
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
const state = () => page.evaluate(() => window.__game.test.state());
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await page.waitForTimeout(300);
  }
  console.log(`  ⚠️ Таймаут: ${label}`);
  return false;
}
async function loadCountry(c, extra = '') {
  await page.goto(`${BASE}/?test&fresh&country=${c}${extra}`);
  await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'рівень ' + c);
}

// ============ ⭐ XP І ЗОРЯНИЙ ШЛЯХ ============
console.log('▸ Зірковий досвід і Зоряний шлях');
await loadCountry('UKR');
let st = await state();
check(st.xp === 0 && st.passLevel === 1, `новий сейв: 0 XP, рівень 1 (${st.xp}, ${st.passLevel})`);
check(st.skins.length === 1 && st.skins[0] === 'classic', 'на старті лише скін «Класик»');
check(st.gadgets.tramp === 0 && st.gadgets.wall === 0, 'гаджетів немає');

// вбивство дає XP
await page.evaluate(() => {
  const g = window.__game;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('walker', p.x + 5, p.z);
  z.damage(9999, null, false);
});
st = await state();
check(st.xp >= 2, `вбивство зомбі дає XP (${st.xp})`);

// рівень 2 → +100 монет; рівень 3 → танець «Дзиґа»; рівень 5 → скін «Ніндзя»
const coinsBefore = st.coins;
await page.evaluate(() => window.__game.test.addXp(80));
st = await state();
check(st.passLevel >= 2, `80 XP → рівень 2 (${st.passLevel})`);
check(st.coins >= coinsBefore + 100, `нагорода рівня 2: +100 монет (${coinsBefore} → ${st.coins})`);
await page.evaluate(() => window.__game.test.addXp(700));
st = await state();
check(st.passLevel >= 5, `усього 780+ XP → рівень ≥5 (${st.passLevel})`);
check(st.dances.includes('spin'), 'рівень 3 дав танець «Дзиґа»');
check(st.skins.includes('ninja'), 'рівень 5 дав скін «Ніндзя»');
check(st.gadgets.tramp >= 2, `рівень 4 дав батути (${st.gadgets.tramp})`);

// збереження: XP лишився після перезавантаження
await page.goto(`${BASE}/?test&country=UKR`);
await waitFor(async () => (await page.evaluate(() => window.__game && window.__game.state)) === 'level', 30000, 'reload');
st = await state();
check(st.passLevel >= 5, `XP зберігається у сейві (рівень ${st.passLevel})`);

// ============ 📅 ЩОДЕННІ ЗАВДАННЯ ============
console.log('▸ Щоденні завдання');
st = await state();
check(st.quests.length === 3, `згенеровано 3 завдання дня (${st.quests.length})`);
const questsA = await page.evaluate(() => {
  window.__game.test.regenQuests('2026-06-12');
  return window.__game.test.state().quests.map((q) => q.id);
});
const questsB = await page.evaluate(() => {
  window.__game.test.regenQuests('2026-06-12');
  return window.__game.test.state().quests.map((q) => q.id);
});
check(JSON.stringify(questsA) === JSON.stringify(questsB), 'завдання детерміновані від дати');
const questsC = await page.evaluate(() => {
  window.__game.test.regenQuests('2026-06-13');
  return window.__game.test.state().quests.map((q) => q.id);
});
check(JSON.stringify(questsA) !== JSON.stringify(questsC), 'інший день — інші завдання');

// прогрес і нагорода
const questReward = await page.evaluate(() => {
  const g = window.__game;
  g.test.regenQuests('2026-06-12');
  const q = g.quests.list[0];
  const coinsBefore = g.save.coins;
  const xpBefore = g.save.xp;
  // доганяємо до цілі подіями
  for (let i = 0; i < q.target; i++) g.test.questEvent(q.ev, { n: 1, weapon: q.weapon });
  return {
    done: g.quests.list[0].done,
    coinsGain: g.save.coins - coinsBefore,
    xpGain: g.save.xp - xpBefore,
  };
});
check(questReward.done, 'завдання виконується подіями');
check(questReward.coinsGain >= 120, `нагорода: +120 монет (${questReward.coinsGain})`);
check(questReward.xpGain >= 40, `нагорода: +40 XP (${questReward.xpGain})`);

// вбивство просуває «kill»-завдання
const killQuest = await page.evaluate(() => {
  const g = window.__game;
  g.test.regenQuests('2026-06-14');
  const q = g.quests.list.find((x) => x.ev === 'kill' && !x.weapon);
  if (!q) return { skip: true };
  const before = q.progress;
  const p = g.level.player.pos;
  const z = g.test.spawnZombie('walker', p.x + 6, p.z);
  z.damage(9999, null, false);
  return { skip: false, before, after: g.quests.list.find((x) => x.id === q.id).progress };
});
if (!killQuest.skip) check(killQuest.after === killQuest.before + 1, `вбивство просуває завдання (${killQuest.before} → ${killQuest.after})`);

// ============ 💃 ТАНЦІ І СКІНИ ============
console.log('▸ Танці і скіни');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const danceRes = await page.evaluate(async () => {
  const g = window.__game;
  g.test.setDance('chicken');
  g.test.dance();
  await new Promise((r) => setTimeout(r, 400));
  return {
    emoting: g.level.player.emoting,
    thirdPerson: !g.level.player.firstPerson,
    animMode: g.level.player.rig.anim.mode,
  };
});
check(danceRes.emoting === 'chicken', `танець активний (${danceRes.emoting})`);
check(danceRes.thirdPerson, 'камера перейшла у 3-тю особу');
check(danceRes.animMode === 'dance', `анімація «dance» (${danceRes.animMode})`);
const danceStop = await page.evaluate(() => {
  const g = window.__game;
  g.test.stopDance();
  return { emoting: g.level.player.emoting, fp: g.level.player.firstPerson };
});
check(!danceStop.emoting && danceStop.fp, 'танець зупинився, камера повернулась');

// зміна скіна перебудовує героя
const skinRes = await page.evaluate(() => {
  const g = window.__game;
  g.test.setSkin('ninja');
  return { active: g.save.activeSkin, owned: g.save.skins.includes('ninja') };
});
check(skinRes.active === 'ninja' && skinRes.owned, 'скін «Ніндзя» одягається');
await loadCountry('UKR', '&keep=1'); // fresh скине — перевіримо лише, що рівень будується
st = await state();
check(st.state === 'level', 'рівень будується з активним скіном');

// ============ 🦙 МЕГАБОКС ============
console.log('▸ Мегабокс');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
st = await state();
check(st.megabox && !st.megabox.opened, `Мегабокс на карті (${st.megabox && Math.round(st.megabox.x)}, ${st.megabox && Math.round(st.megabox.z)})`);

// pity: 2 «прості» нагороди поспіль → третя гарантовано косметика
const mega = await page.evaluate(() => {
  const g = window.__game;
  const out = [];
  // невдалі роли
  g.test.megaForce(0.99);
  g.openMegaboxReward(0, 0);
  out.push({ pity: g.save.megaPity, skins: g.save.skins.length, dances: g.save.dances.length });
  g.test.megaForce(0.7);
  g.openMegaboxReward(0, 0);
  out.push({ pity: g.save.megaPity, skins: g.save.skins.length, dances: g.save.dances.length });
  // pity ≥ 2 → косметика навіть із поганим ролом
  g.test.megaForce(0.99);
  g.openMegaboxReward(0, 0);
  out.push({ pity: g.save.megaPity, skins: g.save.skins.length, dances: g.save.dances.length });
  return out;
});
check(mega[0].pity === 1 && mega[1].pity === 2, `невдачі накопичують pity (${mega[0].pity}, ${mega[1].pity})`);
check(mega[2].pity === 0, 'pity скидається після косметики');
check(mega[2].skins + mega[2].dances > mega[1].skins + mega[1].dances, 'третій бокс гарантовано дав скін або танець');

// фізичне відкриття через E
const megaOpen = await page.evaluate(async () => {
  const g = window.__game;
  const mb = g.level.megabox;
  g.test.teleport(mb.x + 1, mb.z);
  const t0 = performance.now();
  while (performance.now() - t0 < 6000 && !mb.opened) {
    g.test.key('KeyE', true);
    await new Promise((r) => setTimeout(r, 350));
    g.test.key('KeyE', false);
  }
  return { opened: mb.opened };
});
check(megaOpen.opened, 'Мегабокс відкривається клавішею E біля нього');

// ============ 🐶 ПЕС ДРУЖОК ============
console.log('▸ Пес Дружок');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const petRes = await page.evaluate(async () => {
  const g = window.__game;
  g.test.givePet();
  const p = g.level.player.pos;
  // монета за 4 метри — пес має її підібрати
  g.level.effects.spawnCoin(p.x + 4, p.z + 1, 5);
  const coinsBefore = g.save.coins;
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) {
    await new Promise((r) => setTimeout(r, 300));
    if (g.save.coins > coinsBefore) break;
  }
  return {
    hasPet: !!g.level.pet,
    collected: g.save.coins > coinsBefore,
    petNear: g.test.petPos() && Math.hypot(g.test.petPos().x - p.x, g.test.petPos().z - p.z) < 30,
  };
});
check(petRes.hasPet, 'пес з\'являється після покупки');
check(petRes.collected, 'пес збирає монети поблизу');
check(petRes.petNear, 'пес тримається біля героя');

// ============ 🛴 САМОКАТ ============
console.log('▸ Самокат');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
st = await state();
check(st.scooters.length >= 2, `на карті ${st.scooters.length} самокати`);
const rideRes = await page.evaluate(async () => {
  const g = window.__game;
  g.test.mountScooter(0);
  await new Promise((r) => setTimeout(r, 200));
  const riding = !!g.level.player.riding;
  const tp = !g.level.player.firstPerson;
  // таран: сплячий зомбі прямо по курсу
  const p = g.level.player;
  const z = g.test.spawnZombie('walker', p.pos.x - Math.sin(p.yaw) * 6, p.pos.z - Math.cos(p.yaw) * 6);
  z.sleeping = true;
  const hpBefore = z.hp;
  // розганяємось уперед
  g.test.key('KeyW', true);
  const t0 = performance.now();
  while (performance.now() - t0 < 5000 && z.hp >= hpBefore) {
    await new Promise((r) => setTimeout(r, 150));
  }
  g.test.key('KeyW', false);
  const rammed = z.hp < hpBefore;
  g.test.dismountScooter();
  return { riding, tp, rammed, dismounted: !g.level.player.riding };
});
check(rideRes.riding, 'герой сідає на самокат (E)');
check(rideRes.tp, 'на самокаті — вид від 3-ї особи');
check(rideRes.rammed, 'таран б\'є зомбі');
check(rideRes.dismounted, 'E — зійти із самоката');

// ============ 🦘🧱 ГАДЖЕТИ ============
console.log('▸ Гаджети');
await loadCountry('UKR');
await page.evaluate(() => window.__game.test.god());
const gadgetRes = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveGadgets(2, 2);
  const padsBefore = g.test.state().jumpPads;
  const okTramp = g.test.placeTramp();
  const padsAfter = g.test.state().jumpPads;
  const okWall = g.test.placeWall();
  const walls = g.test.state().walls;
  return {
    okTramp, okWall,
    padAdded: padsAfter === padsBefore + 1,
    wallCount: walls.length,
    trampLeft: g.save.gadgets.tramp,
    wallLeft: g.save.gadgets.wall,
  };
});
check(gadgetRes.okTramp && gadgetRes.padAdded, 'батут ставиться і працює як джамп-пад');
check(gadgetRes.okWall && gadgetRes.wallCount === 1, 'барикада ставиться');
check(gadgetRes.trampLeft === 1 && gadgetRes.wallLeft === 1, 'витрачається 1 заряд');

// барикада блокує зомбі і ламається
const wallRes = await page.evaluate(async () => {
  const g = window.__game;
  const w = g.level.gadgets.walls[0];
  // колайдер штовхає зомбі
  const solved = g.level.world.collide(w.x, w.z, 0.4);
  const blocked = Math.hypot(solved.x - w.x, solved.z - w.z) > 0.3;
  // гравець ховається ЗА барикадою — танк пре на неї і гатить
  g.test.teleport(w.x - 1.6, w.z);
  const z = g.test.spawnZombie('tank', w.x + 1.4, w.z);
  z.aggroed = true;
  z.state = 'chase';
  const hpBefore = w.hp;
  // 1) міцність реально тане під тиском
  let t0 = performance.now();
  while (performance.now() - t0 < 12000 && w.hp > hpBefore - 8) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const damaged = w.hp < hpBefore - 8;
  // 2) добиваємо до зламу (не чекаючи повільного headless-часу)
  w.hp = 3;
  t0 = performance.now();
  while (performance.now() - t0 < 8000 && g.level.gadgets.walls.length) {
    await new Promise((r) => setTimeout(r, 300));
  }
  return { blocked, damaged, broken: g.level.gadgets.walls.length === 0 };
});
check(wallRes.blocked, 'барикада блокує прохід');
check(wallRes.damaged, 'зомбі завдають барикаді шкоди');
check(wallRes.broken, 'барикада ламається на 0 міцності');

// ============ ⛈️ ШТОРМ ============
console.log('▸ Режим «Шторм»');
await page.evaluate(() => {
  // відкриваємо шторм: Україна звільнена
  const g = window.__game;
  g.save.liberated.UKR = true;
  g.saveGame();
});
await page.evaluate(() => window.__game.test.startStorm('UKR'));
await waitFor(async () => {
  const s = await page.evaluate(() => window.__game.test.state());
  return s.storm && s.storm.wave >= 1;
}, 30000, 'шторм стартував');
st = await state();
check(st.storm && st.storm.wave === 1, `шторм: хвиля 1 (${st.storm && st.storm.wave})`);
check(st.zombies > 0, `хвиля заспавнила зомбі (${st.zombies})`);
const r0 = st.storm.r;

// поза колом — здоров'я тане
const outsideRes = await page.evaluate(async () => {
  const g = window.__game;
  g.level.player.respawnProtect = 0;
  const R = g.level.storm.r;
  g.test.teleport(R + 25, 0);
  const hpBefore = g.level.player.health;
  const t0 = performance.now();
  while (performance.now() - t0 < 6000 && g.level.player.health >= hpBefore) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const outside = g.level.storm.isOutside();
  const hpAfter = g.level.player.health;
  g.test.teleport(0, 5);
  g.test.god();
  return { outside, hpBefore, hpAfter };
});
check(outsideRes.outside, 'гравець поза колом визначається');
check(outsideRes.hpAfter < outsideRes.hpBefore, `шторм завдає шкоди (${outsideRes.hpBefore} → ${Math.round(outsideRes.hpAfter)})`);

// коло звужується
await page.evaluate(() => { window.__game.level.storm.phaseT = 0.2; });
const shrunk = await waitFor(async () => {
  const s = await page.evaluate(() => window.__game.test.state());
  return s.storm.r < r0 - 2;
}, 30000, 'коло звузилось');
check(shrunk, 'коло звужується з часом');

// зачистка хвилі → хвиля 2
const wave2 = await page.evaluate(async () => {
  const g = window.__game;
  for (const z of [...g.level.zombies.list]) {
    if (z.state !== 'dead') z.damage(99999, null, false);
  }
  // чекаємо, поки шторм сам помітить пустку і поставить таймер, потім пришвидшуємо
  const t0 = performance.now();
  while (performance.now() - t0 < 20000 && g.level.storm.wave < 2) {
    if (g.level.storm._spawnWaveSoon !== undefined && g.level.storm._spawnWaveSoon > 0.3) {
      g.level.storm._spawnWaveSoon = 0.3;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return g.level.storm.wave;
});
check(wave2 >= 2, `після зачистки приходить хвиля 2 (${wave2})`);

// смерть → екран результатів + рекорд
const stormEnd = await page.evaluate(async () => {
  const g = window.__game;
  g.level.player.respawnProtect = 0;
  g.level.player.buffs.bubble = 0;
  g.level.player.armor = 0;
  g.level.player.takeDamage(99999, 0, 0);
  await new Promise((r) => setTimeout(r, 600));
  return {
    over: g.level.storm.over,
    overlayShown: document.getElementById('overlay-storm-end').classList.contains('show'),
    best: g.save.stormBest.UKR,
  };
});
check(stormEnd.over, 'смерть завершує забіг');
check(stormEnd.overlayShown, 'показано екран результатів шторму');
check(stormEnd.best && stormEnd.best.wave >= 2, `рекорд збережено (хвиля ${stormEnd.best && stormEnd.best.wave})`);

// ============ 🎯 СТРІЛКА ДО ЦІЛІ ============
console.log('▸ Стрілка до цілі');
await loadCountry('UKR');
const wpRes = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 800));
  const wp = document.getElementById('waypoint');
  return {
    shown: wp.classList.contains('show'),
    label: document.getElementById('wp-label').textContent,
  };
});
check(wpRes.shown, 'стрілка видима, коли є активна місія');
check(/м$/.test(wpRes.label), `підпис із відстанню (${wpRes.label})`);

// ============ 🛒 МАГАЗИН: НОВІ ТОВАРИ ============
console.log('▸ Магазин: гаджети і пес');
await loadCountry('UKR');
const shopRes = await page.evaluate(() => {
  const g = window.__game;
  g.test.giveCoins(1000);
  g.test.shopBuy('tramp');
  g.test.shopBuy('wall');
  g.test.shopBuy('dog');
  return {
    tramp: g.save.gadgets.tramp,
    wall: g.save.gadgets.wall,
    dog: g.save.upgrades.dog,
    pet: !!g.level.pet,
  };
});
check(shopRes.tramp === 1, `батут купується (${shopRes.tramp})`);
check(shopRes.wall === 1, `барикада купується (${shopRes.wall})`);
check(shopRes.dog === 1 && shopRes.pet, 'пес купується і одразу з\'являється');

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
