// 🛡️ Гість не довіряє числам хоста наосліп: hostNum/hostInt із src/net/client.js.
// Частина чисел хоста тече в game.save (монети, рекорди шторму/арени, XP), а звідти
// в хмару — зіпсований сейв переживе забіг назавжди. Тут перевіряємо і сам кламп,
// і те, що кожне таке місце в client.js реально через нього проходить.
//
// client.js тягне three.js та решту гри, тож у node імпортуємо його БЕЗ import-рядків
// (усі вони потрібні лише в методах класу) — прийом сусідніх юнітів із data-URL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/net/client.js', import.meta.url), 'utf8');
const headless = src.replace(/^import .*$/gm, '');
const { hostNum, hostInt, GuestNet } = await import(
  'data:text/javascript;base64,' + Buffer.from(headless).toString('base64'));

// 🧪 гість-заглушка: рівно ті поля, яких торкаються перевіряні гілки. Викликаємо
// методи прототипу напряму — конструктор потяг би за собою three.js і всю гру.
function fakeGuest() {
  const log = { coins: [], picked: [], damage: [], healed: [], missions: [] };
  const g = {
    log,
    session: { myPid: 2, roster: new Map(), transport: { send() {} } },
    myPid: () => 2,
    level: {
      stats: {},
      addCoins: (n) => log.coins.push(n),
      audio: { horde() {}, coin() {} },
      bus: { emit: (name, v) => log.horde = v },
      player: {
        health: 100,
        takeDamage: (...a) => log.damage.push(a),
        heal: (n) => log.healed.push(n),
      },
      zombies: { applySnapshot() {}, hordeActive: false, hordeRemaining: 0 },
      effects: { removeItemByNid: () => ({}), onPickup: (...a) => log.picked.push(a) },
      missions: { netMissionDone: (...a) => log.missions.push(a) },
      secondaryObjective: { progress: 0, target: 10, done: false },
    },
    game: { hud: { toast() {}, banner() {} } },
    remotes: new Map(),
  };
  return g;
}
const ev = (g, e) => GuestNet.prototype._applyEv.call(g, e);
const snap = (g, s) => GuestNet.prototype._applySnapshot.call(g, { pl: [], z: [], ...s });

test('чесні значення проходять без змін', () => {
  assert.equal(hostNum(12.5, 0, 2000), 12.5);
  assert.equal(hostNum(0, 0, 2000), 0);
  assert.equal(hostNum(2000, 0, 2000), 2000);
  assert.equal(hostInt(120, 0, 5000), 120);
  assert.equal(hostInt('120', 0, 5000), 120, 'число рядком — теж чесне число');
  assert.equal(hostNum(-3.5, -5000, 5000), -3.5, 'координати бувають відʼємні');
});

test('сміття дає дефолт, а не виняток і не NaN', () => {
  for (const junk of [NaN, undefined, {}, [1, 2], 'сто монет', () => 1, 'abc']) {
    assert.equal(hostNum(junk, 0, 2000), 0, `${String(junk)} → дефолт`);
  }
  assert.equal(hostNum('nope', 0, 5000, 120), 120, 'дефолт задається викликом');
  assert.equal(hostInt(null, 0, 5000, 120), 0, 'null — це 0, а не сміття (Number(null) === 0)');
  // головне: жодне зі значень не повертає NaN — саме NaN назавжди псує save.coins
  for (const junk of [NaN, 'abc', {}, undefined]) {
    assert.ok(Number.isFinite(hostInt(junk, 0, 5000, 120)), 'результат завжди скінченний');
  }
});

test('нескінченність і величезні числа впираються в стелю', () => {
  assert.equal(hostNum(Infinity, 0, 2000), 0, 'Infinity — не число в межах, це сміття');
  assert.equal(hostNum(-Infinity, 0, 2000), 0);
  assert.equal(hostNum(1e9, 0, 2000), 2000, 'кінцеве, але завелике — обрізаємо до стелі');
  assert.equal(hostNum(1e9, 0, 5000, 120), 5000, 'дефолт для сміття, стеля для перебору');
  assert.equal(hostNum(-50, 0, 2000), 0, 'відʼємне здоровʼя/монети не бувають');
  assert.equal(hostInt(Number.MAX_SAFE_INTEGER, 0, 1000), 1000);
});

test('hostInt — ціле', () => {
  assert.equal(hostInt(5.6, 0, 100), 6);
  assert.equal(hostInt(5.4, 0, 100), 5);
  assert.equal(hostInt(0.4, 0, 100), 0);
});

// --- поведінка: ганяємо самі гілки гостя зі сміттям у пакеті ---

test('сміттєві монети хоста не доходять до save.coins', () => {
  const g = fakeGuest();
  for (const junk of [NaN, Infinity, '1e9', {}, undefined, -500, 1e12]) {
    ev(g, ['sbb', junk]);
    ev(g, ['md', 0, junk, 'clear']);
    ev(g, ['lt', 7, 2, 'coin', junk]);
  }
  const numbers = [...g.log.coins, ...g.log.missions.map((m) => m[1]), ...g.log.picked.map((p) => p[1])];
  assert.ok(numbers.length > 0, 'гілки справді відпрацювали');
  for (const n of numbers) {
    assert.ok(Number.isInteger(n) && n >= 0 && n <= 5000, `у сейв іде тільки чесне ціле, а не ${n}`);
  }
  // чесна виплата проходить недоторканою
  ev(g, ['sbb', 220]);
  assert.equal(g.log.coins.at(-1), 220);
  ev(g, ['md', 1, 130, 'hunt']);
  assert.deepEqual(g.log.missions.at(-1), [1, 130, 'hunt']);
  ev(g, ['lt', 7, 2, 'coin', 5]);
  assert.deepEqual(g.log.picked.at(-1), ['coin', 5]);
});

test('hurt із нескінченністю не вбиває гостя і не робить NaN зі здоровʼя', () => {
  const g = fakeGuest();
  for (const junk of [Infinity, NaN, '100500', {}, -70]) {
    GuestNet.prototype.onMessage.call(g, 1, { t: 'hurt', dmg: junk, fx: junk, fz: junk, stun: junk });
    GuestNet.prototype.onMessage.call(g, 1, { t: 'healed', amt: junk });
  }
  for (const [dmg, fx, fz] of g.log.damage) {
    assert.ok(Number.isInteger(dmg) && dmg >= 0 && dmg <= 2000, `шкода ${dmg} поза межами`);
    assert.ok(Number.isFinite(fx) && Number.isFinite(fz), 'напрямок удару лишається числом');
  }
  for (const amt of g.log.healed) assert.ok(Number.isFinite(amt) && amt >= 0);
  assert.equal(g.level.player.stunT, 5, 'вічний параліч зрізаний до стелі');
  // чесний удар доходить без змін
  GuestNet.prototype.onMessage.call(g, 1, { t: 'hurt', dmg: 12, fx: 3.5, fz: -4, stun: 0.5 });
  assert.deepEqual(g.log.damage.at(-1), [12, 3.5, -4]);
});

test('снапшот зі сміттям не псує час забігу, лічильники й хвилю шторму', () => {
  const g = fakeGuest();
  const waves = [];
  g.level.storm = { applyNet: (st) => waves.push(st[3]) };
  for (const junk of [NaN, Infinity, 'ой', {}, -3, 1e12]) {
    snap(g, { tm: junk, h: [1, junk], so: junk, st: [junk, 0, junk, junk, junk, 0] });
    assert.ok(Number.isFinite(g.level.stats.time) && g.level.stats.time >= 0, 'час забігу лишається числом');
    assert.ok(Number.isInteger(g.level.zombies.hordeRemaining), 'лічильник хорди — ціле');
    assert.ok(g.level.secondaryObjective.progress >= 0
      && g.level.secondaryObjective.progress <= g.level.secondaryObjective.target, 'прогрес ⭐2 у межах');
  }
  for (const w of waves) assert.ok(Number.isInteger(w) && w >= 0 && w <= 999, `хвиля ${w} поза межами`);
  // чесний снапшот проходить як є
  snap(g, { tm: 123.4, h: [1, 7], so: 3, st: [40, 1, 12, 9, 4, 0] });
  assert.equal(g.level.stats.time, 123.4);
  assert.equal(g.level.zombies.hordeRemaining, 7);
  assert.equal(g.level.secondaryObjective.progress, 3);
  assert.equal(waves.at(-1), 9);
});

test('снапшот із Infinity-seq не заморожує гостя назавжди', () => {
  const g = fakeGuest();
  snap(g, { n: Infinity, tm: 10 });
  snap(g, { n: 5, tm: 20 });
  assert.equal(g.level.stats.time, 20, 'чесний снапшот після кривого мусить застосуватись');
  snap(g, { n: 4, tm: 99 });
  assert.equal(g.level.stats.time, 20, 'а справді застарілий — ні');
});

// --- місця виклику: без них кламп існує, але нічого не боронить ---

test('шкода/лікування/паралізація від хоста проходять кламп', () => {
  assert.match(src, /p\.takeDamage\(hostInt\(d\.dmg, 0, MAX_DMG\)/, 'hurt: dmg клампиться');
  assert.match(src, /hostNum\(d\.fx, -MAX_POS, MAX_POS\), hostNum\(d\.fz, -MAX_POS, MAX_POS\)/, 'hurt: напрямок теж');
  assert.match(src, /hostNum\(d\.stun, 0, MAX_STUN\)/, 'hurt: stun має стелю — інакше вічний параліч');
  assert.match(src, /p\.heal\(hostInt\(d\.amt, 0, MAX_HEAL\)\)/, 'healed: amt клампиться');
});

test('усе, що тече в save.coins, має стелю', () => {
  assert.match(src, /level\.addCoins\(hostInt\(a\[0\], 0, MAX_COINS, 120\)\)/, 'sbb: бонус хоста');
  assert.match(src, /netMissionDone\(a\[0\], hostInt\(a\[1\], 0, MAX_COINS\), a\[2\]\)/, 'md: нагорода місії');
  assert.match(src, /onPickup\(a\[2\], hostInt\(a\[3\], 0, MAX_PICKUP\)\)/, 'lt: цінність підібраного');
  assert.match(src, /spawnNetItem\(a\[0\], a\[1\], a\[2\], a\[3\], a\[4\], hostInt\(a\[5\], 0, MAX_PICKUP\)/,
    'it: цінність предмета, який лежить у світі гостя');
  assert.match(src, /spawnNetItem\(nid, kind, x, z, y, hostInt\(value, 0, MAX_PICKUP\)/, 'state: те саме при mid-join');
});

test('гранти скринь не беруть жодного числа хоста, крім seq для дедуплікації', () => {
  const ewc = src.match(/case 'ewc':.*/)[0];
  const gch = src.match(/case 'gch':.*/)[0];
  assert.match(ewc, /_chestEvOnce\('ewc', a\[0\]\)\) game\._grantEliteChestCoop\(\);/);
  assert.match(gch, /_chestEvOnce\('gch', a\[0\]\)\) game\._grantGoldenChestCoop\(\);/);
  // склад нагороди — локальна таблиця CHEST_REWARDS, а не пакет: сміттєвий seq
  // може лише зняти дедуплікацію, але не записати сміття в сейв
  assert.ok(!/_grantEliteChestCoop\(a\[/.test(src) && !/_grantGoldenChestCoop\(a\[/.test(src),
    'у грант не передається жодне число з пакета');
  assert.match(src, /const n = Number\(seq\);\n\s*if \(!Number\.isFinite\(n\)\) return true;/,
    'seq нормалізується числом — щоб 5 і "5" були одним ключем');
});

test('час забігу і рекордні числа режимів клампляться до того, як стануть «своїми»', () => {
  assert.match(src, /level\.stats\.time = hostNum\(s\.tm, 0, MAX_TIME\)/, 'снапшот: час → save.stormBest/arenaBest');
  assert.match(src, /level\.stats\.time = hostNum\(st\.tm, 0, MAX_TIME\)/, 'повний стан: те саме');
  assert.match(src, /hostInt\(s\.st\[3\], 0, MAX_WAVE\)/, 'шторм: хвиля → рекорд, віхи-нагороди і XP');
  assert.match(src, /bossRush\.applyNet\(\[hostInt\(s\.br\[0\], 0, MAX_WAVE\)/, 'арена: пройдені боси → XP');
  assert.match(src, /Number\.isFinite\(s\.n\)/,
    'seq снапшота: NaN отруїв би порівняння, Infinity заморозив би гостя назавжди');
});

test('лічильники HUD не показують NaN', () => {
  assert.match(src, /hordeRemaining = hostInt\(s\.h\[1\], 0, MAX_COUNT\)/, 'скільки зомбі лишилось');
  assert.match(src, /emit\('hordeStart', hostInt\(a\[0\], 0, MAX_COUNT\)\)/, 'розмір хорди');
  assert.match(src, /so\.progress = hostInt\(s\.so, 0, so\.target\)/, '⭐2: прогрес командної цілі');
  assert.match(src, /so\.progress = hostInt\(st\.so\[2\], 0, so\.target\)/, '⭐2 при mid-join');
});

test('межі лишились осмисленими', () => {
  const lim = Object.fromEntries([...src.matchAll(/^const (MAX_\w+) = (\d+);/gm)].map((m) => [m[1], +m[2]]));
  assert.equal(lim.MAX_DMG, 2000, 'та сама стеля, що в clampDmg на хості');
  assert.ok(lim.MAX_COINS >= 500 && lim.MAX_COINS <= 100000, 'чесна виплата — сотні монет, стеля з запасом');
  assert.ok(lim.MAX_PICKUP >= 100, 'броня 40, набої 30 — запас є');
  assert.ok(lim.MAX_TIME >= 3600, 'довгий кооп-забіг мусить уміститись');
  assert.ok(lim.MAX_STUN <= 10, 'параліз довший за кілька секунд — це вже не гра');
});
