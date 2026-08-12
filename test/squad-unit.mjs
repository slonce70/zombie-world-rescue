// 🎒 Загін: чиста логіка слотів, санітизації та перемикання.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// i18n і friends тягнуть t() — вантажимо модуль як є через data-URL з підміною імпортів
const root = new URL('../src/', import.meta.url);
const squadSrc = readFileSync(new URL('squad.js', root), 'utf8')
  .replace("from './i18n.js'", "from './_i18n-stub.mjs'")
  .replace("from './friends.js'", "from './_friends-stub.mjs'");

const stubs = new Map([
  ['./_i18n-stub.mjs', 'export const t = (s) => s;'],
  ['./_friends-stub.mjs', `
    export const FRIENDS = {
      UKR: { id: 'UKR', squad: 'heal' }, POL: { id: 'POL', squad: 'fighter' },
      DEU: { id: 'DEU', squad: 'fighter' }, FRA: { id: 'FRA', squad: 'lure' },
      ESP: { id: 'ESP', squad: 'lure' }, PRT: { id: 'PRT', squad: 'fighter' },
      ITA: { id: 'ITA', squad: 'heal' }, TUR: { id: 'TUR', squad: 'lure' },
      SWE: { id: 'SWE', squad: 'heal' }, EGY: { id: 'EGY', squad: 'fighter' },
      JPN: { id: 'JPN', squad: 'heal' }, CHN: { id: 'CHN', squad: 'lure' },
      NOPE: { id: 'NOPE' },
    };
    export const rescuedFriendIds = (save) =>
      Object.keys((save && save.friends) || {}).filter((id) => save.friends[id]);
  `],
]);

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
let resolved = squadSrc;
for (const [spec, code] of stubs) resolved = resolved.replace(spec, asData(code));
const squad = await import(asData(resolved));
const {
  SQUAD_ARCHETYPES, SQUAD_MAX_HP, SQUAD_DOWN_SECS, SQUAD_NET_MAX,
  squadSlots, squadArchetype, sanitizeSquad, sanitizeSquadNet, toggleSquadMember,
} = squad;

const saveWith = (ids, squadIds = []) => ({
  friends: Object.fromEntries(ids.map((id) => [id, true])),
  squad: squadIds,
});

test('archetypes are three and balanced across all twelve friends', async () => {
  assert.deepEqual(Object.keys(SQUAD_ARCHETYPES), ['heal', 'lure', 'fighter']);
  assert.equal(SQUAD_MAX_HP, 60);
  assert.equal(SQUAD_DOWN_SECS, 20);
  const source = readFileSync(new URL('friends.js', root), 'utf8');
  const found = [...source.matchAll(/squad: '(\w+)'/g)].map((m) => m[1]);
  assert.equal(found.length, 12);
  for (const kind of ['heal', 'lure', 'fighter']) {
    assert.equal(found.filter((x) => x === kind).length, 4, `${kind} має бути рівно 4`);
  }
});

test('slots open at one and six rescued friends', () => {
  assert.equal(squadSlots(saveWith([])), 0);
  assert.equal(squadSlots(saveWith(['UKR'])), 1);
  assert.equal(squadSlots(saveWith(['UKR', 'POL', 'DEU', 'FRA', 'ESP'])), 1);
  assert.equal(squadSlots(saveWith(['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT'])), 2);
  assert.equal(squadSlots(null), 0);
});

test('sanitize drops unrescued, unknown, duplicated and over-slot members', () => {
  assert.deepEqual(sanitizeSquad(saveWith(['UKR'], ['UKR'])), ['UKR']);
  assert.deepEqual(sanitizeSquad(saveWith(['UKR'], ['POL'])), [], 'неврятований не йде в бій');
  assert.deepEqual(sanitizeSquad(saveWith(['UKR'], ['UKR', 'UKR'])), ['UKR']);
  assert.deepEqual(sanitizeSquad(saveWith(['UKR', 'POL'], ['UKR', 'POL'])), ['UKR'], 'до 6 друзів лише 1 слот');
  assert.deepEqual(sanitizeSquad(saveWith(['UKR'], ['NOPE'])), [], 'друг без архетипу не береться');
  assert.deepEqual(sanitizeSquad({ friends: { UKR: true } }), [], 'старий сейв без ключа');
  assert.deepEqual(sanitizeSquad(saveWith(['UKR'], 'UKR')), [], 'не масив — порожньо');
});

test('toggle adds, removes and rotates when slots are full', () => {
  const one = saveWith(['UKR', 'POL']);
  assert.deepEqual(toggleSquadMember(one, 'UKR'), ['UKR']);
  assert.deepEqual(toggleSquadMember({ ...one, squad: ['UKR'] }, 'UKR'), [], 'повторний клік знімає');
  assert.deepEqual(toggleSquadMember({ ...one, squad: ['UKR'] }, 'POL'), ['POL'], 'один слот — заміна');
  assert.deepEqual(toggleSquadMember(one, 'DEU'), [], 'неврятований не додається');
  assert.deepEqual(toggleSquadMember(saveWith([]), 'UKR'), [], 'без друзів слотів немає');

  const six = saveWith(['UKR', 'POL', 'DEU', 'FRA', 'ESP', 'PRT'], ['UKR']);
  assert.deepEqual(toggleSquadMember(six, 'POL'), ['UKR', 'POL'], 'на 6 друзях два слоти');
  assert.deepEqual(toggleSquadMember({ ...six, squad: ['UKR', 'POL'] }, 'DEU'), ['POL', 'DEU'],
    'слоти повні — найстаріший поступається');
});

// ---------- v770: гість оголошує склад Загону, хост його чистить ----------

test('оголошений склад: сміття, дублі й довжина ріжуться без жодного сейва', () => {
  assert.equal(SQUAD_NET_MAX, 2, 'стеля в мережі — та сама, що максимум слотів у соло');
  assert.deepEqual(sanitizeSquadNet(['UKR', 'POL']), ['UKR', 'POL'], 'порядок гостя зберігається');
  assert.deepEqual(sanitizeSquadNet(['UKR', 'POL', 'DEU']), ['UKR', 'POL'], 'третій напарник відрізаний');
  assert.deepEqual(sanitizeSquadNet(['UKR', 'UKR', 'POL']), ['UKR', 'POL'], 'дубль не з’їдає слот');
  assert.deepEqual(sanitizeSquadNet(['NOPE', 'LOST', 'UKR']), ['UKR'], 'без архетипу і поза каталогом — ні');
  assert.deepEqual(sanitizeSquadNet([42, null, undefined, {}, ['UKR'], '', 'UKR']), ['UKR'], 'не рядок — не друг');
  for (const junk of [undefined, null, 'UKR', {}, 0, { 0: 'UKR', length: 1 }]) {
    assert.deepEqual(sanitizeSquadNet(junk), [], 'не масив — порожньо');
  }
});

test('оголошений склад: хост звіряє ФОРМУ, а не володіння — і це навмисно', () => {
  // Сейв гостя живе у гостя: доказу «я справді врятував Стефанка» в хоста немає й
  // бути не може (та сама межа, що в sanitizeHypers). Модифікований клієнт може
  // оголосити двох чужих напарників — лікування і шкода в них однаково авторитарні
  // в хоста. Якщо колись зʼявиться довірене джерело прогресу, цей тест впаде — і це
  // правильно: рішення має бути свідомим.
  assert.deepEqual(sanitizeSquadNet(['JPN', 'CHN']), ['JPN', 'CHN'],
    'оголошення досить — сейва хост не питає');
  // а соло-шлях лишається суворим: там сейв Є, і він перевіряється
  assert.deepEqual(sanitizeSquad(saveWith(['UKR'], ['JPN'])), [], 'у соло неврятований не йде в бій');
});

test('склад Загону доїжджає в ростер хоста тим самим ключем', () => {
  const coopSrc = readFileSync(new URL('net/coop.js', root), 'utf8');
  const protoSrc = readFileSync(new URL('net/protocol.js', root), 'utf8');
  // `sq` приїхав у 27 — старі вкладки мусять отримати відмову, а не мовчазний збій.
  // Пінимо «не нижче», а не саме 27: наступний бамп протоколу нічого тут не ламає.
  const proto = Number((protoSrc.match(/export const PROTO_VERSION = (\d+);/) || [])[1]);
  assert.ok(proto >= 27, `склад Загону в hello вимагає протоколу ≥27 (зараз ${proto})`);
  assert.ok(/sq: sanitizeSquad\(save\)/.test(coopSrc), 'гість оголошує склад зі свого сейва');
  assert.ok(/sq: sanitizeSquadNet\(own\(src, 'sq'\)\)/.test(coopSrc), 'хост чистить оголошене каталогом');
  // _rosterList() проганяє вже чистий запис через sanitizeRosterEntry ще раз — якщо
  // ключ на вході й на виході розійдеться, склад мовчки згубиться дорогою до гостей
  assert.ok(!/squad: sanitizeSquadNet/.test(coopSrc), 'ключ ростера мусить збігатися з ключем hello');
});

test('archetype lookup is safe for unknown countries', () => {
  assert.equal(squadArchetype('UKR'), 'heal');
  assert.equal(squadArchetype('POL'), 'fighter');
  assert.equal(squadArchetype('LOST'), null);
  assert.equal(squadArchetype(undefined), null);
});
