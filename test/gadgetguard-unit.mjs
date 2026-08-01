// 🛡️ Ліміти каналу гаджетів у коопі: рішення «пускати / не пускати» повідомлення гостя.
// src/net/gadgetguard.js — чистий модуль БЕЗ ІМПОРТІВ, тож імпортуємо його прямо з
// data-URL (package.json тут commonjs, звичайний import '.js' не спрацював би).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/net/gadgetguard.js', import.meta.url), 'utf8');
const { GADGET_LIMITS, GADGET_KINDS, checkGadget, createGadgetGuard, grantDraftCards } = await import(
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const hostSrc = readFileSync(new URL('../src/net/host.js', import.meta.url), 'utf8');

// зручні обгортки: гість шле повідомлення в момент `now`
const ok = (guard, kind, now, opts) => checkGadget(guard, kind, now, opts).ok;
const why = (guard, kind, now, opts) => checkGadget(guard, kind, now, opts).reason;

test('таблиця лімітів покриває ВСІ типи, які хост уміє ставити', () => {
  const block = hostSrc.match(/const GADGET_PLACERS = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'у host.js має бути таблиця GADGET_PLACERS');
  const placers = [...block[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(placers.slice().sort(), GADGET_KINDS.slice().sort(),
    'кожен тип у host.js мусить мати рядок у GADGET_LIMITS — інакше він пройде повз перевірку');
  for (const kind of GADGET_KINDS) {
    const lim = GADGET_LIMITS[kind];
    assert.ok(lim.minGapMs > 0, `${kind}: інтервал мусить бути додатним`);
    assert.ok(lim.maxActive > 0, `${kind}: стеля мусить бути додатною`);
  }
  // старий шлях «if (d.kind === ...)» більше не має існувати
  assert.ok(!/d\.kind === 'firetrail'/.test(hostSrc), 'вогняний слід іде тільки через таблицю');
  // обидва джерела права мусять доїжджати до перевірки
  assert.ok(/if \(args\[0\] === 'dro'\) grantDraftCards\(/.test(hostSrc), 'хост обліковує роздачі набору');
  assert.ok(/build: this\._sharedBuild\(\)/.test(hostSrc), 'хост передає спільну збірку в перевірку');
  assert.ok(/level\.expedition && Array\.isArray\(level\.expedition\.build\)/.test(hostSrc)
    && /level\.operation && Array\.isArray\(level\.operation\.build\)/.test(hostSrc),
  'спільна збірка береться з Експедиції і Фронту');
});

test('невідомий тип відхиляється, а не проходить мовчки', () => {
  const g = createGadgetGuard();
  assert.equal(why(g, 'mine', 1000), 'unknown');
  assert.equal(why(g, '', 1000), 'unknown');
  assert.equal(why(g, undefined, 1000), 'unknown');
  assert.equal(why(g, 'wall', NaN), 'state');
  assert.equal(why(g, 'firetrail', Infinity), 'state');
  assert.equal(why(null, 'wall', 1000), 'state');
});

test('частота: пачка повідомлень пропускає рівно перше', () => {
  const g = createGadgetGuard();
  let passed = 0;
  for (let i = 0; i < 50; i++) if (ok(g, 'wall', 1000 + i)) passed++;
  assert.equal(passed, 1, 'із пачки барикад проходить одна');
  assert.equal(why(g, 'wall', 1000 + GADGET_LIMITS.wall.minGapMs - 1), 'rate');
  assert.ok(ok(g, 'wall', 1000 + GADGET_LIMITS.wall.minGapMs), 'через інтервал — знову можна');
});

test('частота: злиплі повідомлення пускаємо в межах запасу жетонів', () => {
  const g = createGadgetGuard();
  grantDraftCards(g, ['firetrail']);
  const burst = GADGET_LIMITS.firetrail.burst;
  // хост підвис і віддав кілька чесних слідів одним тиком — з нульовим інтервалом
  let passed = 0;
  for (let i = 0; i < 30; i++) if (ok(g, 'firetrail', 1000)) passed++;
  assert.equal(passed, burst, 'запас жетонів рятує чесний слід, але не робить пачку безмежною');
  assert.equal(why(g, 'firetrail', 1000), 'rate');
  // жетон повертається раз на інтервал
  assert.ok(ok(g, 'firetrail', 1000 + GADGET_LIMITS.firetrail.minGapMs));
  assert.equal(why(g, 'firetrail', 1000 + GADGET_LIMITS.firetrail.minGapMs), 'rate');
});

test('частота рахується окремо на кожен тип і на кожного гостя', () => {
  const a = createGadgetGuard();
  const b = createGadgetGuard();
  assert.ok(ok(a, 'wall', 5000), 'барикада гостя A');
  assert.ok(ok(a, 'tramp', 5000), 'батут того ж гостя тим самим кадром — інший бюджет');
  assert.ok(ok(a, 'turret', 5000), 'турель теж');
  assert.equal(why(a, 'wall', 5001), 'rate', 'а друга барикада — вже ні');
  assert.ok(ok(b, 'wall', 5001), 'у другого гостя свій бюджет');
});

test('стеля живих обʼєктів: світ рахує стіни, guard — вогонь', () => {
  const g = createGadgetGuard();
  const t0 = 100000;
  // стіни: живих рахує світ (`active`), стеля не пускає 17-ту
  assert.equal(why(g, 'wall', t0, { active: GADGET_LIMITS.wall.maxActive }), 'cap');
  assert.ok(ok(g, 'wall', t0, { active: GADGET_LIMITS.wall.maxActive - 1 }), 'під стелею — пускаємо');

  // вогняний слід: власника у світі немає, живих рахує сам guard за часом життя.
  // Сама лише частота дала б 2400/150 = 16 плям одночасно — стеля тримає 12.
  const f = createGadgetGuard();
  grantDraftCards(f, ['firetrail']);
  const { maxActive, lifeMs } = GADGET_LIMITS.firetrail;
  const step = 160; // швидше за легальні 300 мс, але вже в межах інтервалу 150 мс
  const alive = [];
  let capped = 0;
  for (let i = 0; i < 120; i++) {
    const now = t0 + i * step;
    const r = checkGadget(f, 'firetrail', now);
    if (r.ok) {
      alive.push(now);
      const together = alive.filter((at) => now - at < lifeMs).length;
      assert.ok(together <= maxActive, `одночасно живих плям не більше за стелю (${together})`);
    } else if (r.reason === 'cap') capped++;
  }
  assert.ok(capped > 0, 'понадстельові плями відхилені саме стелею');
  assert.ok(alive.length < 120, 'пачка не створює обʼєкт на кожне повідомлення');
  // плями догоріли — місце звільнилось
  assert.ok(ok(f, 'firetrail', t0 + 120 * step + lifeMs), 'після часу життя стеля відпускає');
});

test('право на картку: без роздачі і без спільної збірки — відмова', () => {
  // кооп-кампанія: збірки забігу гостю не створюють, наборів хост не роздає
  const g = createGadgetGuard();
  assert.equal(why(g, 'firetrail', 1000), 'nocard', 'ні роздач, ні збірки — ні');
  assert.equal(why(g, 'firetrail', 1000, { build: null }), 'nocard', 'порожня збірка права не дає');
  assert.equal(why(g, 'firetrail', 1000, { build: [] }), 'nocard', 'пуста збірка теж');
  assert.equal(why(g, 'firetrail', 1000, { build: ['ricochet', 'crithit'] }), 'nocard',
    'збірка без цієї картки права не дає');
  assert.equal(why(g, 'firetrail', 1000, { build: 'firetrail' }), 'nocard', 'не масив — не збірка');
  // а роздача — дає
  grantDraftCards(g, ['firetrail']);
  assert.ok(ok(g, 'firetrail', 1000), 'роздача набору дає право');
});

test('право на картку: спільна збірка забігу дає право без жодної роздачі', () => {
  // Експедиція/Фронт у коопі: збірку хост роздав усій кімнаті, вона в обох однакова
  const g = createGadgetGuard();
  const build = ['ricochet', 'firetrail', 'crithit'];
  assert.ok(ok(g, 'firetrail', 1000, { build }), 'картка зі спільної збірки — законна');
  assert.ok(ok(g, 'firetrail', 1000 + GADGET_LIMITS.firetrail.minGapMs, { build }),
    'і на наступному сліді теж — право не витрачається');
  // сусід у тій самій кімнаті грає ту саму збірку — право те саме
  const other = createGadgetGuard();
  assert.ok(ok(other, 'firetrail', 1000, { build }), 'право спільне, бо збірка спільна');
  // а от картки, якої у збірці немає, не буде ні в кого
  assert.equal(why(other, 'firetrail', 2000, { build: ['ricochet'] }), 'nocard',
    'збірка без картки лишається відмовою');
});

test('право на картку: сила зі спільної збірки — за числом входжень', () => {
  const g = createGadgetGuard();
  const once = checkGadget(g, 'firetrail', 1000, { build: ['firetrail'], strong: true });
  assert.ok(once.ok, 'слід зі збірки пускаємо');
  assert.equal(once.strong, false, 'одне входження — слід слабкий, а не відкинутий');

  const twice = createGadgetGuard();
  const r = checkGadget(twice, 'firetrail', 1000, { build: ['firetrail', 'dmg25', 'firetrail'], strong: true });
  assert.ok(r.ok && r.strong, 'двічі у збірці — сильний слід законний');

  // роздача і збірка складаються: разом це теж «дали двічі»
  const mixed = createGadgetGuard();
  grantDraftCards(mixed, ['firetrail']);
  const sum = checkGadget(mixed, 'firetrail', 1000, { build: ['firetrail'], strong: true });
  assert.ok(sum.ok && sum.strong, 'роздача + збірка = картка була двічі');
});

test('право на картку: пускаємо лише те, що хост роздав саме цьому гостю', () => {
  const mine = createGadgetGuard();
  const other = createGadgetGuard();
  grantDraftCards(mine, ['firetrail', 'ricochet', 'crithit']);
  grantDraftCards(other, ['ricochet', 'crithit', 'chillshot']);
  assert.ok(ok(mine, 'firetrail', 2000), 'кому роздали — тому й можна');
  assert.equal(why(other, 'firetrail', 2000), 'nocard', 'сусідський набір права не дає');
  grantDraftCards(other, []);
  grantDraftCards(other, null);
  grantDraftCards(other, [42, null, '']);
  assert.equal(why(other, 'firetrail', 3000), 'nocard', 'сміття в наборі права не дає');
});

test('подвійна картка: сильний слід лише тому, кому її роздавали двічі', () => {
  const once = createGadgetGuard();
  grantDraftCards(once, ['firetrail']);
  const r1 = checkGadget(once, 'firetrail', 4000, { strong: true });
  assert.ok(r1.ok, 'слід пускаємо');
  assert.equal(r1.strong, false, 'але слабким — узяти картку двічі гість не міг');

  const twice = createGadgetGuard();
  grantDraftCards(twice, ['firetrail']);
  grantDraftCards(twice, ['firetrail']);
  const r2 = checkGadget(twice, 'firetrail', 4000, { strong: true });
  assert.ok(r2.ok && r2.strong, 'роздавали двічі — сильний слід законний');
  const r3 = checkGadget(twice, 'firetrail', 4000 + GADGET_LIMITS.firetrail.minGapMs);
  assert.equal(r3.strong, false, 'без прапорця слід лишається слабким');
});

test('чесний темп: жодної відмови', () => {
  const g = createGadgetGuard();
  grantDraftCards(g, ['firetrail']);
  let now = 0;

  // 🌋 слід у спринті: раз на 0.3с, десять секунд бігу
  for (let i = 0; i < 33; i++) {
    now += 300;
    assert.ok(ok(g, 'firetrail', now), `слід ${i} не має губитись`);
  }
  // те саме, але мережа «злипла» — сусідні пакети приїхали на 100 мс ближче
  for (let i = 0; i < 20; i++) {
    now += i % 2 ? 200 : 400;
    assert.ok(ok(g, 'firetrail', now), `слід із дрижанням ${i} не має губитись`);
  }
  // а тут підвис кадр хоста: три чесні сліди приїхали одним тиком
  now += 900;
  for (let i = 0; i < 3; i++) {
    assert.ok(ok(g, 'firetrail', now), `злиплий слід ${i} не має губитись`);
  }

  // 🧱 барикада: спільний кулдаун гаджетів — 25с; ставимо у максимальному темпі
  let walls = 0;
  for (let i = 0; i < 10; i++) {
    now += 25000;
    assert.ok(ok(g, 'wall', now, { active: walls }), `барикада ${i} не має губитись`);
    walls++;
  }
  // 🦘🤖☄️ решта каналу тим самим забігом
  for (let i = 0; i < 5; i++) {
    now += 20000;
    assert.ok(ok(g, 'tramp', now, { active: Math.min(3, i) }), `батут ${i} не має губитись`);
    now += 45000;
    assert.ok(ok(g, 'turret', now, { active: 1 }), `турель ${i} (заміна своєї ж) не має губитись`);
    now += 45000;
    assert.ok(ok(g, 'meteor', now), `метеорит ${i} не має губитись`);
  }
});

test('відмова нічого не витрачає й нічого не ламає', () => {
  const g = createGadgetGuard();
  const t0 = 7000;
  assert.ok(ok(g, 'wall', t0));
  for (let i = 0; i < 100; i++) checkGadget(g, 'wall', t0 + 1 + i, { active: 99 });
  // понадлімітні спроби не зрушили таймер: чесна установка проходить рівно за інтервалом
  assert.ok(ok(g, 'wall', t0 + GADGET_LIMITS.wall.minGapMs), 'відмови не відсувають чесну установку');
  const denied = checkGadget(g, 'firetrail', t0);
  assert.deepEqual(denied, { ok: false, strong: false, reason: 'nocard' });
  grantDraftCards(g, ['firetrail']);
  assert.ok(ok(g, 'firetrail', t0), 'відмова без права не зʼїла бюджет сліду');
});

test('перепідключення гостя починає з чистого стану', () => {
  const before = createGadgetGuard();
  grantDraftCards(before, ['firetrail']);
  assert.ok(ok(before, 'firetrail', 1000));
  assert.ok(ok(before, 'wall', 1000));

  const after = createGadgetGuard(); // новий RemotePlayer після реконекту
  assert.equal(why(after, 'firetrail', 1001), 'nocard', 'право не успадковується');
  assert.ok(ok(after, 'wall', 1001), 'і ліміт частоти теж не успадковується');
});
