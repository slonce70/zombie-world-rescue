// 🎒🌐 Загін у кооперативі: хост веде напарників ГОСТЯ і кладе їх у снапшот,
// гість малює з цього ріг — і більше нічого. Перевіряємо саме межу між ними:
// упакований байт стану, створення/оновлення/прибирання рігів у гостя і те, що
// вихід гостя забирає його напарників (інакше вони застигли б біля мертвого рига).
//
// Three.js і DOM тут не потрібні: беремо тіла методів прямо з тексту src/extras.js
// (як у test/squad-owner-unit.mjs) і крутимо їх на макеті рівня.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/extras.js', import.meta.url), 'utf8');
const host = readFileSync(new URL('../src/net/host.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/net/client.js', import.meta.url), 'utf8');

function method(name, text = src) {
  const m = text.match(new RegExp(`\\n {2}(${name}\\([\\s\\S]*?\\n {2}\\})\\n`));
  assert.ok(m, `має бути метод ${name}()`);
  return new Function(`return ({ ${m[1]} }).${name};`)();
}

// біти стану беремо СПРАВЖНІ з extras.js: перенумерують — тест має це побачити
const bits = src.match(/const (SQ_DOWN = \d+, SQ_RUN = \d+, SQ_ATTACK = \d+, SQ_GRANNY = \d+);/);
assert.ok(bits, 'у src/extras.js мають бути біти стану напарника');
const SQ = Function(`const ${bits[1]}; return { SQ_DOWN, SQ_RUN, SQ_ATTACK, SQ_GRANNY };`)();
// 🔫 біти видимої дії живуть окремим рядком — теж справжні
const fxBits = src.match(/const (SQ_SHOT = \d+, SQ_HEAL = \d+);/);
assert.ok(fxBits, 'у src/extras.js мають бути біти пострілу й лікування');
Object.assign(SQ, Function(`const ${fxBits[1]}; return { SQ_SHOT, SQ_HEAL };`)());
Object.assign(globalThis, SQ);

// стеля довжини списку — теж СПРАВЖНЯ з extras.js (netSquad читає її як модульну константу)
const MAX_NET_SQUAD = Number((src.match(/const MAX_NET_SQUAD = (\d+);/) || [])[1]);
assert.ok(Number.isInteger(MAX_NET_SQUAD), 'у src/extras.js має бути стеля MAX_NET_SQUAD');
globalThis.MAX_NET_SQUAD = MAX_NET_SQUAD;

globalThis.CLONE_FOOT_LIFT = 0.16;
globalThis.damp = (a, b) => b;          // тест перевіряє напрямок, не криву згладжування
globalThis.dampAngle = (a, b) => b;
globalThis.setAnim = (rig, mode) => { rig.anim.mode = mode; };
globalThis.updateRig = (rig) => { rig.ticks = (rig.ticks || 0) + 1; };
globalThis.disposeObject = (g) => { g.disposed = true; };
globalThis.THREE = { Vector3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } } };
globalThis.makeCivilian = (kind) => ({
  kind, anim: { mode: 'idle', speed: 0 },
  group: { position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, rotation: { y: 0 } },
});

const squadNet = method('squadNet');
const netSquad = method('netSquad');
const netSquadFx = method('_netSquadFx');
const updateNetSquad = method('_updateNetSquad');
const removeSquadOf = method('removeSquadOf');
const spawnGuestSquad = method('_spawnGuestSquad', host);

const mate = (over = {}) => ({
  squad: 'fighter', nid: 1, x: 1.234, z: -2.567, downT: 0, civKind: 'kid',
  rig: { anim: { mode: 'idle' } }, mesh: { rotation: { y: 0.5 } }, ...over,
});

const gadgets = (clones = []) => ({
  clones,
  squadNet,
  netSquad,
  removeSquadOf,
  _updateNetSquad: updateNetSquad,
  _netSquad: new Map(),
  _floorY: () => 0,
  removed: [],
  _removeClone(i) { this.removed.push(this.clones[i]); this.clones.splice(i, 1); },
  // ефект пострілу/лікування перевіряємо окремо (нижче) — тут лише ФАКТ виклику
  fx: [],
  _netSquadFx(m, rise) { this.fx.push([m, rise]); },
  level: { scene: { added: [], add(g) { this.added.push(g); }, remove() {} } },
});

// ---------- хост: пакування ----------

test('у снапшот ідуть лише напарники Загону, по 5 полів', () => {
  const g = gadgets([mate(), { hp: 50, mesh: {} }]); // другий — клон гаджета, без squad
  const list = g.squadNet();
  assert.equal(list.length, 1, 'клон гаджета в каналі Загону не має що робити');
  assert.equal(list[0].length, 5, 'рівно 5 полів, як у турелей і зомбі');
  assert.deepEqual(list[0].slice(0, 4), [1, 1.2, -2.6, 0.5], 'id, x, z, yaw — округлені');
});

test('байт стану: лежить / біжить / бабуся', () => {
  const st = (over) => gadgets([mate(over)]).squadNet()[0][4];
  assert.equal(st({}), 0, 'стоїть — нуль');
  assert.equal(st({ rig: { anim: { mode: 'run' } } }), SQ.SQ_RUN);
  assert.equal(st({ civKind: 'granny' }), SQ.SQ_GRANNY);
  // впав — це стан сильніший за анімацію бігу, з якої він упав
  assert.equal(st({ downT: 3, rig: { anim: { mode: 'run' } }, civKind: 'granny' }),
    SQ.SQ_DOWN | SQ.SQ_GRANNY);
});

// 🔫 головне з рев'ю v770: поза анімації живе ОДИН кадр, снапшот на 12 Гц її не ловить.
test('біт дії тримає таймер, а не поза анімації', () => {
  const st = (over) => gadgets([mate(over)]).squadNet()[0][4];
  // поза 'attack' сама по собі більше нічого не означає: наступний кадр її затирає
  assert.equal(st({ rig: { anim: { mode: 'attack' } } }), 0, 'поза без таймера — не подія');
  assert.equal(st({ actT: 0.2, actFx: 'melee' }), SQ.SQ_ATTACK);
  assert.equal(st({ actT: 0.2, actFx: 'shot' }), SQ.SQ_SHOT);
  assert.equal(st({ actT: 0.2, actFx: 'heal' }), SQ.SQ_HEAL);
  assert.equal(st({ actT: 0, actFx: 'shot' }), 0, 'таймер вигорів — біт згас');
  // біг і постріл — незалежні біти: інакше напарник застигав би на кожному пострілі
  assert.equal(st({ actT: 0.2, actFx: 'shot', rig: { anim: { mode: 'run' } } }),
    SQ.SQ_RUN | SQ.SQ_SHOT);
  // упалий не стріляє, хай там що лишилось у таймері
  assert.equal(st({ downT: 3, actT: 0.2, actFx: 'shot' }), SQ.SQ_DOWN);
});

test('таймер дії коротший за паузу між ударами — інакше фронту більше не буде', () => {
  const secs = Number((src.match(/const SQ_ACT_SECS = ([\d.]+);/) || [])[1]);
  assert.ok(secs > 0, 'у src/extras.js має бути вікно біта дії');
  // пауза між ударами напарника: c.hitT = melee ? 0.7 : 0.9
  const gaps = [...src.matchAll(/c\.hitT = melee \? ([\d.]+) : ([\d.]+);/g)][0];
  assert.ok(gaps, 'у _updateClones має бути пауза між ударами');
  assert.ok(secs < Math.min(Number(gaps[1]), Number(gaps[2])),
    'біт мусить згаснути ДО наступного удару, інакше гість побачить один постріл і тишу');
});

test('таймер гасне до всіх continue — біт не залипає на напарнику без цілі', () => {
  const loop = src.match(/_updateClones\(dt\) \{[\s\S]*?\n {2}\}/)[0];
  const decay = loop.indexOf('c.actT -= dt');
  const firstContinue = loop.indexOf('continue;');
  assert.ok(decay > 0, 'таймер дії має спадати в _updateClones');
  assert.ok(decay < firstContinue, 'спадання стоїть перед першим continue, інакше біт залипає');
});

// ---------- гість: дзеркало ----------

test('гість створює ріг на новий nid і не дублює його на наступних снапшотах', () => {
  const g = gadgets();
  g.netSquad([[7, 1, 2, 0, 0]]);
  assert.equal(g._netSquad.size, 1);
  assert.equal(g.level.scene.added.length, 1, 'ріг додано у сцену');
  g.netSquad([[7, 3, 4, 1, 0]]);
  assert.equal(g._netSquad.size, 1, 'той самий напарник — той самий ріг');
  assert.equal(g.level.scene.added.length, 1, 'другого рига не створюємо');
  const m = g._netSquad.get(7);
  assert.deepEqual([m.tx, m.tz, m.tyaw], [3, 4, 1], 'ціль інтерполяції оновилась');
});

test('вид рига береться з байта стану', () => {
  const g = gadgets();
  g.netSquad([[7, 0, 0, 0, SQ.SQ_GRANNY], [8, 0, 0, 0, 0]]);
  assert.equal(g._netSquad.get(7).rig.kind, 'granny');
  assert.equal(g._netSquad.get(8).rig.kind, 'kid');
});

// одного біта на вид вистачає РІВНО доти, доки видів два. З'явиться друг із
// kind: 'boy' — хост намалює хлопця, а гість мовчки звичайну дитину. Прибиваємо
// припущення тут, щоб воно впало в тесті, а не в дитини на екрані.
test('усі друзі — це granny або kid, інакше одного біта вже мало', () => {
  const friends = readFileSync(new URL('../src/friends.js', import.meta.url), 'utf8');
  const kinds = [...friends.matchAll(/kind:\s*'([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 12, `знайдено лише ${kinds.length} kind — розбір friends.js зламався`);
  for (const k of new Set(kinds)) {
    assert.ok(k === 'granny' || k === 'kid',
      `вид «${k}» SQ_GRANNY не закодує — потрібне окреме поле виду в снапшоті`);
  }
});

test('напарник зник зі снапшота — ріг знято і звільнено (без витоку на реконектах)', () => {
  const g = gadgets();
  g.netSquad([[7, 0, 0, 0, 0], [8, 0, 0, 0, 0]]);
  const gone = g._netSquad.get(8).rig.group;
  g.netSquad([[7, 0, 0, 0, 0]]);
  assert.equal(g._netSquad.size, 1);
  assert.ok(gone.disposed, 'disposeObject на знятому ригу — інакше течуть GPU-ресурси');
  g.netSquad([]);
  assert.equal(g._netSquad.size, 0, 'порожній список прибирає всіх');
});

test('довжина списку від хоста має стелю — симетрія до MAX_NET_HITS', () => {
  const cap = MAX_NET_SQUAD;
  assert.ok(cap >= 8, 'стеля мусить умістити 2 напарники × 4 гравці');
  const g = gadgets();
  // зламаний хост: 500 унікальних nid, кожен — makeCivilian + bakeRig з нуля
  g.netSquad(Array.from({ length: 500 }, (_, i) => [i, 0, 0, 0, 0]));
  assert.equal(g._netSquad.size, cap, 'рігів створено рівно по стелю');
  assert.equal(g.level.scene.added.length, cap, 'і в сцену додано стільки ж');
  // чесний максимум проходить недоторканим
  const honest = gadgets();
  honest.netSquad(Array.from({ length: cap }, (_, i) => [i, i, i, 0, 0]));
  assert.equal(honest._netSquad.size, cap, 'повний Загін кімнати не обрізається');
  // не-масив теж не валить гостя (у for…of число кинуло б TypeError)
  for (const junk of [null, undefined, 7, 'сміття', {}]) {
    const j = gadgets();
    j.netSquad(junk);
    assert.equal(j._netSquad.size, 0, `${String(junk)} — просто порожній список`);
  }
});

test('криві числа від хоста не доходять до трансформа рига', () => {
  const g = gadgets();
  g.netSquad([[7, NaN, 0, 0, 0], [8, 0, Infinity, 0, 0], 'сміття', [9, 0, 0, 0, 0]]);
  assert.deepEqual([...g._netSquad.keys()], [9], 'проходить лише коректний запис');
});

test('дзеркало лише малює: позиція, поворот, анімація — і жодного hp/шкоди', () => {
  const g = gadgets();
  g.netSquad([[7, 5, 6, 1.2, SQ.SQ_RUN]]);
  g._updateNetSquad(0.1);
  const m = g._netSquad.get(7);
  assert.equal(m.rig.group.position.x, 5);
  assert.equal(m.rig.group.position.z, 6);
  assert.equal(m.rig.group.position.y, 0.16, 'ріг стоїть на підлозі, а не в нулі');
  assert.equal(m.rig.group.rotation.y, 1.2);
  assert.equal(m.rig.anim.mode, 'run');
  assert.ok(m.rig.ticks > 0, 'ріг анімується');
  assert.equal(m.hp, undefined, 'у дзеркала немає здоровʼя');
  assert.equal(m.owner, undefined, 'і власника теж — лікувати нема кого');
});

test('упалий напарник видимо лежить і не мерехтить між снапшотами', () => {
  const g = gadgets();
  g.netSquad([[7, 0, 0, 0, SQ.SQ_DOWN]]);
  g._updateNetSquad(0.1);
  assert.equal(g._netSquad.get(7).rig.anim.mode, 'die', 'поза «лежить»');
  g.netSquad([[7, 0, 0, 0, SQ.SQ_DOWN]]);
  g._updateNetSquad(0.1);
  assert.equal(g._netSquad.get(7).rig.anim.mode, 'die', 'той самий ріг, та сама поза');
  assert.equal(g.level.scene.added.length, 1, 'ріг не перестворювався');
});

// ---------- гість: постріл і лікування ----------

test('ефект малюється РІВНО на вмиканні біта, а не поки він увімкнений', () => {
  const g = gadgets();
  g.netSquad([[7, 0, 0, 0, 0]]);
  assert.equal(g.fx.length, 0, 'спокійний напарник нічого не малює');
  g.netSquad([[7, 0, 0, 0, SQ.SQ_SHOT]]);
  assert.deepEqual(g.fx.map((f) => f[1]), [SQ.SQ_SHOT], 'фронт — один постріл');
  // біт ще горить кілька снапшотів (вікно 0.25 с проти 12 Гц) — але це ТОЙ САМИЙ постріл
  g.netSquad([[7, 0, 0, 0, SQ.SQ_SHOT]]);
  g.netSquad([[7, 0, 0, 0, SQ.SQ_SHOT | SQ.SQ_RUN]]);
  assert.equal(g.fx.length, 1, 'кулемета з одного пострілу не вийшло');
  g.netSquad([[7, 0, 0, 0, 0]]);
  g.netSquad([[7, 0, 0, 0, SQ.SQ_SHOT]]);
  assert.equal(g.fx.length, 2, 'біт згас і спалахнув знову — це вже наступний постріл');
});

test('поява напарника — не постріл (mid-join не має стріляти всією кімнатою)', () => {
  const g = gadgets();
  g.netSquad([[7, 0, 0, 0, SQ.SQ_SHOT | SQ.SQ_HEAL]]);
  assert.equal(g.fx.length, 0, 'перший снапшот задає стан, а не подію');
});

test('іскра лікування їде тим самим каналом', () => {
  const g = gadgets();
  g.netSquad([[7, 0, 0, 0, 0]]);
  g.netSquad([[7, 0, 0, 0, SQ.SQ_HEAL]]);
  assert.deepEqual(g.fx.map((f) => f[1]), [SQ.SQ_HEAL]);
});

test('на пострілі гість малює трасер і грає звук, на лікуванні — зелену іскру', () => {
  const eff = { tracers: [], bursts: [] };
  const g = {
    _netSquadFx: netSquadFx,
    _nearestZombie: (x, z) => ({ x: x + 3, y: 0, z, rig: { height: 2 } }),
    level: {
      effects: {
        tracer: (from, to) => eff.tracers.push([from, to]),
        burst: (pos, color) => eff.bursts.push(color),
      },
      audio: { shot: (w) => eff.shots = (eff.shots || []).concat(w) },
      player: { pos: { x: 0, z: 0 } },
    },
  };
  const m = { x: 1, z: 2, yaw: 0, rig: { group: { position: { y: 0.16 } } } };
  g._netSquadFx(m, SQ.SQ_SHOT);
  assert.equal(eff.tracers.length, 1, 'трасер від напарника до зомбі');
  assert.deepEqual(eff.shots, ['pistol'], 'і звук пострілу — інакше друг убиває мовчки');
  assert.deepEqual([eff.tracers[0][0].x, eff.tracers[0][0].z], [1, 2], 'з напарника');
  assert.equal(eff.tracers[0][1].x, 4, 'у найближчого зомбі');
  assert.equal(eff.bursts.length, 0);
  g._netSquadFx(m, SQ.SQ_HEAL);
  assert.deepEqual(eff.bursts, [0x6dff9c], 'зелена іскра лікування');
  assert.equal(eff.tracers.length, 1, 'лікування не стріляє');
});

test('далекий постріл не чути — як у турелі', () => {
  const shots = [];
  const g = {
    _netSquadFx: netSquadFx,
    _nearestZombie: () => null,
    level: {
      effects: { tracer: () => {}, burst: () => {} },
      audio: { shot: (w) => shots.push(w) },
      player: { pos: { x: 500, z: 500 } },
    },
  };
  g._netSquadFx({ x: 0, z: 0, yaw: 0, rig: { group: { position: { y: 0 } } } }, SQ.SQ_SHOT);
  assert.equal(shots.length, 0, 'напарник за півкарти не має гриміти над вухом');
});

// ---------- хост і соло: як напарник біжить ----------

// 🏃 конвенція проєкту: anim.speed = реальна швидкість. Беремо САМ блок руху з
// _updateClones і крутимо його — дефолт 0 давав крок в ~11 разів рідший (characters.js).
const moveBlock = src.match(/\n {6}(if \(dist > stopAt\) \{[\s\S]*?\n {6}\})\n/);
assert.ok(moveBlock, 'у _updateClones має бути блок руху');
const move = new Function('c', 'dist', 'stopAt', 'dt', 'level', 'dx', 'dz', moveBlock[1]);

const runner = () => ({
  x: 0, z: 0, y: 0, rig: { anim: { mode: 'idle', speed: 0 } },
  mesh: { position: { set() {} } }, syncToFloor() {},
});
const lvl = { world: { collide: (x, z) => ({ x, z }), groundH: () => 0 } };

test('напарник у бігу отримує реальну швидкість, а не дефолтний нуль', () => {
  const c = runner();
  move(c, 20, 2.0, 1 / 60, lvl, 20, 0);
  assert.equal(c.rig.anim.mode, 'run');
  assert.equal(c.rig.anim.speed, 5.5, 'та сама 5.5, що в дзеркалі гостя і в main.js');
  // гість малює SQ_RUN з тією ж 5.5 — обидва екрани мусять збігатись
  assert.match(src, /m\.rig\.anim\.speed = running \? 5\.5 : 0;/);
});

test('на підході швидкість спадає разом із кроком, а не стрибає', () => {
  const c = runner();
  move(c, 2.05, 2.0, 1, lvl, 2.05, 0); // великий dt: крок обмежує залишок дистанції
  assert.ok(c.rig.anim.speed > 0 && c.rig.anim.speed <= 5.5,
    `швидкість ${c.rig.anim.speed} має лишатись реальною`);
});

// ---------- вихід гостя ----------

test('вихід гостя забирає ЙОГО напарників і не чіпає чужих', () => {
  const g = gadgets([
    mate({ nid: 1, ownerPid: 3 }), mate({ nid: 2, ownerPid: 1 }),
    { hp: 50, ownerPid: 3, mesh: {} }, mate({ nid: 3, ownerPid: 3 }),
  ]);
  g.removeSquadOf(3);
  assert.deepEqual(g.clones.map((c) => c.nid ?? 'клон'), [2, 'клон'],
    'пішли лише напарники гостя 3');
  assert.equal(g.removed.length, 2);
});

test('прибирання стоїть ДО rp.dispose() — інакше owner уже мертвий', () => {
  const m = host.match(/removeSquadOf\(pid\);\n\s*rp\.dispose\(\);/);
  assert.ok(m, 'у removeGuest напарники мають зникати перед dispose рига');
});

// ---------- хост: спавн Загону гостя ----------

function hostStub({ sq, level = {} } = {}) {
  const spawned = [];
  return {
    spawned,
    _spawnGuestSquad: spawnGuestSquad,
    session: { roster: new Map([[3, { sq }]]) },
    level: { gadgets: { spawnSquad: (ids, owner) => spawned.push([ids, owner]) }, ...level },
  };
}

test('склад беремо з ростера — іншого входу в хоста немає', () => {
  const h = hostStub({ sq: ['UKR', 'POL'] });
  const rp = { pid: 3 };
  h._spawnGuestSquad(3, rp);
  assert.deepEqual(h.spawned, [[['UKR', 'POL'], rp]], 'спавн від імені гостя');
});

test('порожній або відсутній склад нічого не спавнить', () => {
  for (const sq of [undefined, [], null, 'UKR']) {
    const h = hostStub({ sq });
    h._spawnGuestSquad(3, { pid: 3 });
    assert.equal(h.spawned.length, 0, `склад ${JSON.stringify(sq)} — тиша`);
  }
  const unknown = hostStub({ sq: ['UKR'] });
  unknown._spawnGuestSquad(99, { pid: 99 });
  assert.equal(unknown.spawned.length, 0, 'гостя немає в ростері — Загону теж');
});

test('режими з noGadgets лишаються без Загону — симетрія з соло', () => {
  for (const level of [{ noGadgets: true }, { playground: 'turret' }]) {
    const h = hostStub({ sq: ['UKR'], level });
    h._spawnGuestSquad(3, { pid: 3 });
    assert.equal(h.spawned.length, 0, `${JSON.stringify(level)} — Загону немає`);
  }
});

// ---------- проводка ----------

test('снапшот і повний стан несуть той самий список', () => {
  assert.match(host, /snap\.sq = sq;/, 'снапшот несе напарників');
  assert.match(host, /squad: level\.gadgets\.squadNet\(\),/, 'captureState — для mid-join');
});

// у соло тост «{n} йде з тобою!» бачить кожен; Загін гостя спавнить ХОСТ, тож
// локальний bus нікому нічого не скаже — потрібен адресний канал
test('гість дізнається, що напарник пішов із ним', () => {
  assert.match(src, /this\.level\.net\.toastTo\(ownerPid, hello\)/, 'spawnSquad шле тост власнику');
  assert.match(host, /toastTo\(pid, text\) \{/, 'у хоста є адресний тост');
  assert.match(host, /send\(pid, \{ t: 'ev', l: \[\['toast', text\]\] \}/, 'спільний канал тостів гостя');
});

test('гість застосовує список і зі снапшота, і зі стану — завжди, навіть порожній', () => {
  assert.match(client, /netSquad\(s\.sq \|\| \[\]\)/, 'снапшот без ключа теж прибирає зниклих');
  assert.match(client, /netSquad\(w\.squad \|\| \[\]\)/, 'mid-join бачить наявних');
});
