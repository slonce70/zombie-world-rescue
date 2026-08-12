// 🚪 Кулдаун повторного `hello` в хості (src/net/coop.js, _hostHello).
//
// `hello` — єдині двері в хост без ліміту: гість, уже прийнятий у кімнату, проходить
// і гард ростера (host.js: pid у ростері є), і throttleMsg (у MSG_GAPS немає рядка
// `hello` — і не може бути: перший hello до троттлера не доїжджає взагалі). А кожен
// hello — це розсилка ростера ВСІМ, тост і клац у хоста, а при реконекті ще й повний
// `start` spec. 60 Гц такого — і в дитини екран забитий тостами, зупинити нічим.
//
// Головне, що тут прибито: ПЕРШИЙ hello від невідомого pid мусить проходити ЗАВЖДИ,
// інакше жодна дитина не зайде до друга. Гейт стосується лише повторного.
//
// Three.js і DOM не потрібні: беремо тіло методу прямо з тексту coop.js (як у
// test/squad-net-unit.mjs) і крутимо його на макеті сесії з керованим годинником.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/net/coop.js', import.meta.url), 'utf8');
const hostSrc = readFileSync(new URL('../src/net/host.js', import.meta.url), 'utf8');
const guardSrc = readFileSync(new URL('../src/net/gadgetguard.js', import.meta.url), 'utf8');

const HELLO_GAP = Number((src.match(/const HELLO_GAP = (\d+);/) || [])[1]);
assert.ok(Number.isInteger(HELLO_GAP) && HELLO_GAP > 0, 'у coop.js має бути інтервал HELLO_GAP');

const body = src.match(/\n {2}(_hostHello\(from, d\)[\s\S]*?\n {2}\})\n/);
assert.ok(body, 'у src/net/coop.js має бути метод _hostHello(from, d)');

// залежності передаємо параметрами, а не через globalThis: годинник має бути наш
const clock = { t: 0 };
const hostHello = new Function(
  'performance', 'window', 'PROTO_VERSION', 'HELLO_GAP',
  'cleanNick', 't', 'nickIsBad', 'sanitizeRosterEntry', 'sanitizeExpedition',
  `return ({ ${body[1]} })._hostHello;`,
)(
  { now: () => clock.t },
  { __APP_VERSION: '777' },
  7,
  HELLO_GAP,
  (s) => String(s == null ? '' : s).slice(0, 12),
  (s, v) => (v ? `${s}:${JSON.stringify(v)}` : s),
  () => false,
  (d, pid) => ({ pid, nick: d.nick, skin: d.skin || 'classic', sq: d.sq || null }),
  () => null,
);

// макет сесії-хоста: рахуємо рівно те, що коштує кожен hello
function session(state = 'lobby') {
  const s = {
    state,
    roster: new Map(),
    _helloAt: new Map(),
    frontResumeReady: new Map(),
    frontRun: null,
    frontResult: null,
    communityMap: null,
    mode: 'campaign',
    countryId: 'UKR',
    net: state === 'level' ? { spec: { rid: 'r1' }, addGuest: (pid) => s.log.addGuest.push(pid) } : null,
    log: { sent: [], broadcasts: 0, toasts: 0, clicks: 0, addGuest: [] },
    transport: { send: (pid, msg) => s.log.sent.push([pid, msg.t]) },
    difficultyStar: () => 1,
    frontSnapshot: () => null,
    _rosterList: () => [],
    _broadcastRoster() { s.log.broadcasts++; },
    _resetReady() {},
    onRoster: null,
    game: {
      save: { expedition: null },
      hud: { toast: () => s.log.toasts++ },
      audio: { click: () => s.log.clicks++ },
    },
  };
  s._hostHello = hostHello;
  return s;
}

const hello = (s, pid, over = {}) => s._hostHello(pid, { nick: `Друг${pid}`, build: '777', proto: 7, ...over });
const cost = (s) => s.log.broadcasts + s.log.toasts + s.log.clicks;

// ---------- вхід у кімнату не зламано ----------

test('перший hello від невідомого pid проходить ЗАВЖДИ — це вхід у кімнату', () => {
  for (const state of ['lobby', 'level']) {
    const s = session(state);
    clock.t = 0;
    hello(s, 2);
    assert.ok(s.roster.has(2), `${state}: гість у ростері`);
    assert.ok(s.log.sent.some(([pid, t]) => pid === 2 && t === 'welcome'), `${state}: welcome полетів`);
    assert.equal(s.log.broadcasts, 1, `${state}: ростер розіслано`);
    assert.equal(s.log.toasts, 1, `${state}: «приєднався» показано`);
  }
});

test('кожна дитина заходить своїм першим hello — навіть усі в один мілісекунд', () => {
  const s = session();
  clock.t = 12345; // годинник спільний: гейт мусить бути персональним
  for (const pid of [2, 3, 4]) hello(s, pid);
  assert.deepEqual([...s.roster.keys()], [2, 3, 4], 'у кімнаті всі троє');
  assert.equal(s.log.toasts, 3, 'і кожного вітали окремо');
});

test('гість зайшов посеред бою — і отримав start spec', () => {
  const s = session('level');
  clock.t = 0;
  hello(s, 2);
  assert.ok(s.log.sent.some(([pid, t]) => pid === 2 && t === 'start'), 'рівень будується у гостя');
  assert.deepEqual(s.log.addGuest, [2]);
});

// ---------- повторний hello ----------

test('спам hello від того, хто вже в кімнаті, коштує рівно один прохід', () => {
  const s = session();
  clock.t = 0;
  hello(s, 2);
  const after = cost(s);
  for (let i = 1; i <= 1000; i++) { clock.t = i * 0.5; hello(s, 2); } // 1000 hello за пів секунди
  assert.equal(cost(s), after, 'жодного зайвого тоста, клацу чи розсилки ростера');
  assert.equal(s.roster.size, 1, 'і ростер не переписувався');
  // а на довгій дистанції темп впирається в інтервал, а не в частоту кадрів
  const before = cost(s);
  for (let i = 1; i <= 600; i++) { clock.t = 500 + i * (1000 / 60); hello(s, 2); } // 60 Гц × 10 с
  assert.ok(cost(s) - before <= 11 * 3, `10 секунд спаму дають одиниці проходів, а не 600: ${cost(s) - before}`);
});

test('спам hello посеред бою не пересилає start spec щокадру', () => {
  const s = session('level');
  clock.t = 0;
  hello(s, 2);
  const starts = () => s.log.sent.filter(([, t]) => t === 'start').length;
  assert.equal(starts(), 1);
  for (let i = 1; i <= 1000; i++) { clock.t = i * 0.5; hello(s, 2, { resume: 0 }); }
  assert.equal(starts(), 1, 'повторна серіалізація spec — найдорожче, що вміє hello');
});

test('чесний повтор після паузи проходить — реконект не зламано', () => {
  const s = session();
  clock.t = 0;
  hello(s, 2);
  clock.t = HELLO_GAP - 1;
  hello(s, 2, { nick: 'Пізно' });
  assert.equal(s.roster.get(2).nick, 'Друг2', 'раніше за інтервал — тиша');
  clock.t = HELLO_GAP;
  hello(s, 2, { nick: 'Вчасно' });
  assert.equal(s.roster.get(2).nick, 'Вчасно', 'рівно за інтервалом — проходить');
  // реконект (coop.js, _tryReconnect) чекає щонайменше 1200 мс між спробами
  assert.ok(HELLO_GAP <= 1200, 'інтервал мусить бути з запасом під чесний реконект');
});

test('гейт персональний: сусід у кімнаті чужим спамом не заблокований', () => {
  const s = session();
  clock.t = 0;
  hello(s, 2);
  for (let i = 1; i <= 30; i++) { clock.t = i; hello(s, 2); }
  clock.t = 30;
  hello(s, 3);
  assert.ok(s.roster.has(3), 'новий гість зайшов посеред чужого спаму');
});

test('гість вийшов і повернувся тим самим pid одразу — hello проходить', () => {
  const s = session();
  clock.t = 0;
  hello(s, 2);
  // _dropGuest прибирає слід разом із гостем (інакше повернення впиралось би в нього)
  s.roster.delete(2);
  s._helloAt.delete(2);
  clock.t = 10;
  hello(s, 2);
  assert.ok(s.roster.has(2), 'повернення в межах інтервалу не має відсікатись');
});

// ---------- проводка ----------

test('гейт живе саме в _hostHello, а не в таблиці кулдаунів', () => {
  assert.ok(!/hello:/.test(guardSrc.match(/const MSG_GAPS = \{[^}]*\}/)[0]),
    'рядок hello у MSG_GAPS нічого не дав би: перший hello до троттлера не доїжджає');
  assert.match(src, /this\._helloAt\.get\(from\)/, '_hostHello тримає власну мапу часу');
  assert.match(src, /this\.roster\.has\(from\) && lastHello !== undefined/,
    'гейт зобовʼязаний питати ростер — інакше перший вхід відсічеться');
  const drop = src.match(/_dropGuest\(pid, why\) \{([\s\S]*?)\n {2}\}\n/);
  assert.ok(drop && drop[1].includes('this._helloAt.delete(pid)'), 'слід чиститься разом із гостем');
  assert.match(src, /this\._helloAt\.clear\(\)/, 'і повністю при _reset кімнати');
  assert.match(hostSrc, /if \(!this\.session\.roster\.has\(from\)\) return false;/,
    'гард ростера в host.js повертає false — саме тому hello доїжджає до сесії');
});
