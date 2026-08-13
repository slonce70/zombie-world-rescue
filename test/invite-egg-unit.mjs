// 🎁 v780 «Запрошення з нагородою»: привів друга — яйце обом, рівно один раз на кімнату.
//
// Тут прибито дві речі одразу:
//  1) правило нарахування (хто, коли, скільки разів);
//  2) ЧЕРВОНА ЛІНІЯ ПРИВАТНОСТІ — атрибуція «хто кого привів» живе тільки в памʼяті
//     кімнати. Кімната закрилась (_reset) або гість вийшов (_dropGuest) — звʼязок зник.
//     Жодного постійного списку друзів, нічого в сейві, нічого в лобі/хмарі.
//
// coop.js тягне three.js через host.js/client.js, тож методи беремо ТЕКСТОМ і крутимо
// на макеті сесії — прийом сусідніх юнітів (hello-gate-unit.mjs, squad-net-unit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const src = read('src/net/coop.js');
const clientSrc = read('src/net/client.js');
const mainSrc = read('src/main.js');
const uiSrc = read('src/ui/coopui.js');

function method(signature) {
  const m = src.match(new RegExp(`\\n {2}(${signature}[\\s\\S]*?\\n {2}\\})\\n`));
  assert.ok(m, `у src/net/coop.js має бути метод ${signature}`);
  return m[1];
}
const bodies = [
  method('_noteInvite\\(from, fromNick\\) \\{'),
  method('claimInviteEgg\\(\\) \\{'),
  method('_reset\\(\\) \\{'),
  method('_dropGuest\\(pid, why\\) \\{'),
].join(',\n');
// залежності — параметрами, а не через globalThis: нік чистимо так само, як гра
const methods = new Function('cleanNick', 't',
  `return ({\n${bodies}\n});`)((s) => String(s == null ? '' : s).trim().slice(0, 12), (s) => s);

// макет кімнати-хоста: рівно ті поля, яких торкаються перевіряні методи
function room(over = {}) {
  const s = {
    role: 'host',
    nick: 'Влад',
    room: 'ABCD',
    state: 'lobby',
    mode: 'campaign',
    roster: new Map(),
    net: null,
    sent: [],
    transport: { send: (pid, msg) => s.sent.push([pid, msg]) },
    frontRun: null,
    frontResult: null,
    frontResults: new Set(),
    frontAttempt: 0,
    frontStartedOperationId: null,
    frontResumeReady: new Map(),
    communityMap: null,
    hostDiffStar: 1,
    _helloAt: new Map(),
    invitedBy: null,
    _invited: new Set(),
    inviteEggDone: false,
    _resetReady() {},
    _broadcastRoster() {},
    onRoster: null,
    game: { hud: { toast() {} } },
    ...over,
  };
  return Object.assign(s, methods);
}
// гість заходить: спершу оголошення (hello), потім його кладуть у ростер (_hostHello)
const arrive = (s, pid, from = null) => { s._noteInvite(pid, from); s.roster.set(pid, { pid, nick: `Друг${pid}` }); };
const eggEvents = (s) => s.sent.filter(([, m]) => m.t === 'ev' && m.l.some((e) => e[0] === 'ieg'));

// ---------- правило нарахування ----------

test('гість зайшов за посиланням і пройшов рівень → яйце обом', () => {
  const s = room();
  s.roster.set(1, { pid: 1, nick: 'Влад' });
  arrive(s, 2, 'Влад');
  assert.equal(s.claimInviteEgg(), true, 'хост нараховує собі');
  assert.deepEqual(eggEvents(s).map(([pid]) => pid), [2], 'і рівно тому гостю, що прийшов за листівкою');
  assert.deepEqual(eggEvents(s)[0][1].l, [['ieg', 1]], 'подія несе лише seq — жодного числа нагороди');
});

test('гість зайшов сам, без посилання → нагороди немає', () => {
  for (const from of [null, undefined, '', '   ', 'Хтось', 'влад ']) {
    const s = room();
    arrive(s, 2, from);
    assert.equal(s.claimInviteEgg(), false, `from=${JSON.stringify(from)} — це не запрошення від хоста`);
    assert.equal(eggEvents(s).length, 0);
  }
  // рівно той самий нік, що в хоста, — єдиний, що вважається запрошенням
  const ok = room();
  arrive(ok, 2, 'Влад');
  assert.equal(ok.claimInviteEgg(), true);
});

test('той самий гість вдруге в тій самій кімнаті → нагороди немає', () => {
  const s = room();
  arrive(s, 2, 'Влад');
  assert.equal(s.claimInviteEgg(), true);
  for (let i = 0; i < 5; i++) assert.equal(s.claimInviteEgg(), false, 'наступні забіги кімнати нічого не дають');
  assert.equal(eggEvents(s).length, 1, 'подія полетіла рівно один раз');
  // і повторний вхід тим самим посиланням її не переоткриває
  s.roster.delete(2);
  arrive(s, 2, 'Влад');
  assert.equal(s.claimInviteEgg(), false, 'перезахід по колу яєць не фармить');
});

test('запрошений уже вийшов — нагороджувати нікого', () => {
  const s = room();
  arrive(s, 2, 'Влад');
  s.roster.delete(2);
  assert.equal(s.claimInviteEgg(), false);
  assert.equal(s.inviteEggDone, false, 'і право не згоріло — друг ще може повернутись');
  s.roster.set(2, { pid: 2 });
  assert.equal(s.claimInviteEgg(), true);
});

// ---------- гість не може виписати яйце сам ----------

test('рішення ухвалює лише хост', () => {
  const g = room({ role: 'guest' });
  arrive(g, 2, 'Влад');
  assert.equal(g.claimInviteEgg(), false, 'на боці гостя функція не нараховує нічого');
  assert.equal(g.sent.length, 0);
});

test('проводка: гість лише виконує подію хоста, хост — лише як авторитет', () => {
  const ieg = clientSrc.match(/case 'ieg':.*/);
  assert.ok(ieg, 'у client.js має бути обробник ieg');
  assert.match(ieg[0], /_chestEvOnce\('ieg', a\[0\]\)\) game\._grantInviteEgg\(\);/,
    'exactly-once тим самим механізмом, що гранти скринь (reconnect не кредитує двічі)');
  assert.ok(!/_grantInviteEgg\(a\[/.test(clientSrc), 'у грант не передається жодне число з пакета');
  assert.match(mainSrc, /if \(level\.net\.authority && this\.coop\.session\.claimInviteEgg\(\)\) this\._grantInviteEgg\(\);/,
    'у _grantCoopWin рішення ухвалює лише авторитет (хост)');
  // гість не має власного шляху до нарахування: єдиний виклик у client.js — з case 'ieg'
  assert.equal((clientSrc.match(/_grantInviteEgg\(/g) || []).length, 1);
});

// ---------- червона лінія приватності ----------

test('кімната закрилась — звʼязок зник', () => {
  const s = room({ invitedBy: 'Влад' });
  arrive(s, 2, 'Влад');
  s.claimInviteEgg();
  s._reset();
  assert.equal(s._invited.size, 0, 'жодного pid не лишилось');
  assert.equal(s.invitedBy, null, 'і жодного ніка того, хто покликав');
  assert.equal(s.inviteEggDone, false, 'нова кімната починається з чистого аркуша');
  // у новій кімнаті з тим самим складом нагороди немає, поки друг не прийде за НОВИМ посиланням
  s.roster.set(2, { pid: 2 });
  assert.equal(s.claimInviteEgg(), false);
});

test('гість вийшов — його атрибуція йде разом із ним', () => {
  const s = room();
  arrive(s, 2, 'Влад');
  s._dropGuest(2, 'left');
  assert.equal(s._invited.size, 0);
  // той самий pid дістається іншій дитині, яка зайшла кодом — чужого «привів друга» вона не успадкує
  arrive(s, 2, null);
  assert.equal(s.claimInviteEgg(), false);
});

test('атрибуція нікуди не їде: ні в ростер, ні в лобі, ні в сейв', () => {
  // 1) ростер (його бачить уся кімната) чиститься білим списком полів — from/inv туди не входять
  const entry = src.match(/export function sanitizeRosterEntry[\s\S]*?\n\}\n/)[0];
  for (const key of ['from', 'invited', 'inv:']) {
    assert.ok(!entry.includes(key), `sanitizeRosterEntry не має нести «${key}»`);
  }
  // 2) анонс кімнати в лобі-сервіс (це вже мережа поза кімнатою)
  const announce = uiSrc.match(/_roomAnnounce\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.ok(!/invit|from/i.test(announce), 'у публічний анонс кімнати атрибуція не потрапляє');
  // 3) сейв і хмара: жодного нового ключа прогресу (яйця вже там і рахуються числом)
  const cloud = read('src/net/cloudsave.js');
  const keys = cloud.match(/SAVE_PROGRESS_KEYS = Object\.freeze\(\[[\s\S]*?\]\)/)[0];
  assert.ok(!/invit/i.test(keys), 'у SAVE_PROGRESS_KEYS немає нічого про запрошення');
  assert.ok(!/localStorage[^\n]*invit/i.test(src + uiSrc), 'і нічого не лягає в localStorage');
});

test('про запрошення знають рівно два файли гри — і жодного рядка на сервері', () => {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(new URL(dir, root))) {
      const rel = dir + name;
      if (statSync(new URL(rel, root)).isDirectory()) walk(rel + '/');
      else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(rel);
    }
  })('src/');
  (function walkWorker(dir) {
    for (const name of readdirSync(new URL(dir, root))) {
      const rel = dir + name;
      if (statSync(new URL(rel, root)).isDirectory()) walkWorker(rel + '/');
      else if (name.endsWith('.js') || name.endsWith('.mjs')) files.push(rel);
    }
  })('worker/');
  const holders = files.filter((f) => /invitedBy|_invited\b|inviteEggDone/.test(read(f)));
  assert.deepEqual(holders.sort(), ['src/net/coop.js', 'src/ui/coopui.js'],
    'атрибуція живе лише в сесії кімнати та у формі посилання — і ніде більше');
});
