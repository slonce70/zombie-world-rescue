// 🎒🌐 У напарника Загону є ВЛАСНИК: за ним він іде і його лікує. Дефолт — локальний
// гравець, тож соло не змінилось; власником може бути й RemotePlayer гостя, чий Загін
// веде хост — тоді лікування їде гостю подією, бо здоровʼя гостя живе в гостя.
//
// Three.js і DOM тут не потрібні: беремо тіла spawnSquad і _squadAbility прямо з тексту
// src/extras.js (разом із сигнатурою — саме в ній живе дефолтний власник) і крутимо їх
// на макеті рівня. SQUAD_ARCHETYPES беремо справжні — src/squad.js чистий.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/extras.js', import.meta.url), 'utf8');

// репозиторій — CommonJS, тож ESM-модуль вантажимо через data-URL, підмінивши імпорти
// (як у test/squad-unit.mjs). Числа архетипів беремо справжні: перебалансування heal
// має бути видно тесту, а не проїхати повз захардкожену копію.
const { SQUAD_ARCHETYPES, SQUAD_MAX_HP } = await import('data:text/javascript,' + encodeURIComponent(
  readFileSync(new URL('../src/squad.js', import.meta.url), 'utf8')
    .replace(/^import \{ t \}.*$/m, 'const t = (s) => s;')
    .replace(/^import \{ FRIENDS.*$/m, 'const FRIENDS = {}, rescuedFriendIds = () => [];')));

// вирізаємо метод цілком — із сигнатурою, щоб дефолт `owner = this.level.player`
// перевірявся справжній, а не переписаний тестом
function method(name) {
  const m = src.match(new RegExp(`\\n {2}(${name}\\([\\s\\S]*?\\n {2}\\})\\n`));
  assert.ok(m, `у src/extras.js має бути метод ${name}()`);
  return new Function(`return ({ ${m[1]} }).${name};`)();
}

// вільні змінні тіл: константи й хелпери з інших модулів
globalThis.t = (s, v) => (v ? `${s}:${JSON.stringify(v)}` : s);
globalThis.SQUAD_ARCHETYPES = SQUAD_ARCHETYPES;
globalThis.SQUAD_MAX_HP = SQUAD_MAX_HP;
globalThis.CLONE_FOOT_LIFT = 0.16;
globalThis.makeCivilian = () => ({
  group: { position: { set: () => {}, clone: () => ({ setY: () => ({}) }) } },
});
globalThis.FRIENDS = {
  UKR: { name: () => 'Оля', kind: 'girl', squad: 'heal' },
  POL: { name: () => 'Ян', kind: 'boy', squad: 'fighter' },
};

const spawnSquad = method('spawnSquad');
const squadAbility = method('_squadAbility');

const player = (over = {}) => ({
  pos: { x: 0, y: 0, z: 0 }, yaw: 0, health: 50, maxHealth: 100,
  healed: 0, heal(n) { this.healed += n; }, ...over,
});

// net: null = соло; authority true = хост, false = гість
function makeGadgets({ net = null, hurtSelf = null } = {}) {
  const me = hurtSelf || player();
  const g = {
    clones: [],
    toasts: [],
    sent: [],
    _floorY: () => 0,
    _squadAbility: squadAbility,
    spawnSquad,
  };
  g.level = {
    player: me,
    scene: { add: () => {} },
    effects: { burst: () => {} },
    bus: { emit: (_e, msg) => g.toasts.push(msg) },
    net: net && { authority: net.authority, healPlayer: (p, amt) => g.sent.push([p.pid, amt]) },
  };
  return g;
}

const remote = (pid) => player({ pid, pos: { x: 20, y: 0, z: 0 } });

// ---------- власник ----------

test('соло: дефолтний власник — локальний гравець, pid 1', () => {
  const g = makeGadgets();
  g.spawnSquad(['UKR', 'POL']);
  assert.equal(g.clones.length, 2);
  for (const c of g.clones) {
    assert.equal(c.owner, g.level.player, 'власник — саме level.player');
    assert.equal(c.ownerPid, 1);
    assert.equal(c.hp, SQUAD_MAX_HP);
  }
  assert.deepEqual(g.toasts.length, 2, 'про своїх друзів тост є — як було в соло');
});

test('власник-RemotePlayer: напарник спавниться біля НЬОГО і памʼятає його pid', () => {
  const g = makeGadgets({ net: { authority: true } });
  const rp = remote(3);
  g.spawnSquad(['UKR'], rp);
  const c = g.clones[0];
  assert.equal(c.owner, rp);
  assert.equal(c.ownerPid, 3);
  assert.ok(Math.abs(c.x - rp.pos.x) < 1e-9, 'спавн від позиції власника, а не гравця хоста');
  assert.equal(g.toasts.length, 0, 'чужий Загін хост веде мовчки');
});

// ---------- слідування ----------

test('_updateClones веде напарника до власника, а не до level.player', () => {
  const follow = src.match(/const owner = c\.owner \|\| level\.player;\n([^\n]*\n){0,3}/);
  assert.ok(follow, 'у _updateClones має бути власник із фолбеком на локального гравця');
  const target = src.match(/const target = \(c\.squad && far\)\n\s*\? \{ ([^\n]*) \}/);
  assert.ok(target, 'ціль слідування має лишитись однією гілкою');
  assert.match(target[1], /owner\.pos\.x/, 'ідемо до власника');
  assert.doesNotMatch(target[1], /level\.player/, 'level.player у цілі більше немає');
});

test('кіл-кредит іде власнику напарника', () => {
  assert.match(src, /target\.lastHitBy = c\.ownerPid \|\| 1;/,
    'ownerPid має бути читачем — інакше поле мертве');
});

// ---------- лікування ----------

const healTick = (g, member) => { member.abilityT = 0; g._squadAbility.call(g, member, 0); };

test('соло: heal лікує локального гравця напряму', () => {
  const g = makeGadgets();
  g.spawnSquad(['UKR']);
  const c = g.clones[0];
  healTick(g, c);
  assert.equal(g.level.player.healed, SQUAD_ARCHETYPES.heal.healPerSec);
  assert.equal(g.sent.length, 0, 'мережі в соло немає — і не питаємо');
});

test('хост: власний Загін хоста лікується локально, попри увімкнену мережу', () => {
  const g = makeGadgets({ net: { authority: true } });
  g.spawnSquad(['UKR']);
  healTick(g, g.clones[0]);
  assert.equal(g.level.player.healed, SQUAD_ARCHETYPES.heal.healPerSec);
  assert.equal(g.sent.length, 0);
});

test('хост: Загін ГОСТЯ не лікує нікого локально — шле подію саме гостю', () => {
  const g = makeGadgets({ net: { authority: true } });
  const rp = remote(3);
  g.spawnSquad(['UKR'], rp);
  healTick(g, g.clones[0]);
  assert.equal(g.level.player.healed, 0, 'хост не лікує СЕБЕ з чужого напарника');
  assert.equal(rp.healed, 0, 'локальне p.heal() віддаленому власнику безглузде');
  assert.deepEqual(g.sent, [[3, SQUAD_ARCHETYPES.heal.healPerSec]], 'подія поїхала гостю 3');
});

test('лікування не спрацьовує далеко від власника і на повному здоровʼї', () => {
  const g = makeGadgets({ net: { authority: true } });
  const rp = remote(3);
  g.spawnSquad(['UKR'], rp);
  const c = g.clones[0];
  c.x = rp.pos.x + SQUAD_ARCHETYPES.heal.radius + 1;
  healTick(g, c);
  assert.equal(g.sent.length, 0, 'поза радіусом — тиша');
  c.x = rp.pos.x;
  rp.health = rp.maxHealth;
  healTick(g, c);
  assert.equal(g.sent.length, 0, 'цілому власнику лікування не шлемо');
});

test('число лікування клампиться на боці ГОСТЯ, а не довіряється хосту', () => {
  const client = readFileSync(new URL('../src/net/client.js', import.meta.url), 'utf8');
  assert.match(client, /case 'healed':/, 'канал лікування вже є — новий тип не потрібен');
  // саме hostNum: межа 0..MAX_HEAL лишається, а от округлення зʼїдало б дробове
  // лікування щокадру (тотем шле 5*dt) — див. test/guest-trust-unit.mjs
  assert.match(client, /p\.heal\(hostNum\(d\.amt, 0, MAX_HEAL\)\)/, 'amt проходить через межу довіри');
});

// ---------- клон гаджета не зачеплений ----------

test('клон гаджета (без squad) лишається на локальному гравці', () => {
  // у клона гаджета немає ні owner, ні ownerPid — обидва читачі мають фолбек на локального
  assert.match(src, /const owner = c\.owner \|\| level\.player;/);
  assert.match(src, /target\.lastHitBy = c\.ownerPid \|\| 1;/);
  // а до власника він і не піде: гілка слідування вимагає c.squad
  assert.match(src, /const target = \(c\.squad && far\)/);
  // спавн клона гаджета не чіпали — власника він не приймає
  assert.match(src, /\n {2}_spawnClone\(\) \{/);
  assert.doesNotMatch(src, /_spawnClone\(owner/);
});
