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
Object.assign(globalThis, SQ);

globalThis.CLONE_FOOT_LIFT = 0.16;
globalThis.damp = (a, b) => b;          // тест перевіряє напрямок, не криву згладжування
globalThis.dampAngle = (a, b) => b;
globalThis.setAnim = (rig, mode) => { rig.anim.mode = mode; };
globalThis.updateRig = (rig) => { rig.ticks = (rig.ticks || 0) + 1; };
globalThis.disposeObject = (g) => { g.disposed = true; };
globalThis.makeCivilian = (kind) => ({
  kind, anim: { mode: 'idle', speed: 0 },
  group: { position: { x: 0, y: 0, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, rotation: { y: 0 } },
});

const squadNet = method('squadNet');
const netSquad = method('netSquad');
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

test('байт стану: лежить / біжить / бʼє / бабуся', () => {
  const st = (over) => gadgets([mate(over)]).squadNet()[0][4];
  assert.equal(st({}), 0, 'стоїть — нуль');
  assert.equal(st({ rig: { anim: { mode: 'run' } } }), SQ.SQ_RUN);
  assert.equal(st({ rig: { anim: { mode: 'attack' } } }), SQ.SQ_ATTACK);
  assert.equal(st({ civKind: 'granny' }), SQ.SQ_GRANNY);
  // впав — це стан сильніший за анімацію бігу, з якої він упав
  assert.equal(st({ downT: 3, rig: { anim: { mode: 'run' } }, civKind: 'granny' }),
    SQ.SQ_DOWN | SQ.SQ_GRANNY);
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

test('гість застосовує список і зі снапшота, і зі стану — завжди, навіть порожній', () => {
  assert.match(client, /netSquad\(s\.sq \|\| \[\]\)/, 'снапшот без ключа теж прибирає зниклих');
  assert.match(client, /netSquad\(w\.squad \|\| \[\]\)/, 'mid-join бачить наявних');
});
