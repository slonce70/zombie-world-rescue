// 🛡️ Ліміти каналу гаджетів у коопі: рішення «пускати / не пускати» повідомлення гостя.
// src/net/gadgetguard.js — чистий модуль БЕЗ ІМПОРТІВ, тож імпортуємо його прямо з
// data-URL (package.json тут commonjs, звичайний import '.js' не спрацював би).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/net/gadgetguard.js', import.meta.url), 'utf8');
const {
  GADGET_LIMITS, GADGET_KINDS, checkGadget, createGadgetGuard, offerDraftCards, takeDraftCard,
  MSG_GAPS, throttleMsg,
} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const hostSrc = readFileSync(new URL('../src/net/host.js', import.meta.url), 'utf8');
const coopSrc = readFileSync(new URL('../src/net/coop.js', import.meta.url), 'utf8');
const protoSrc = readFileSync(new URL('../src/net/protocol.js', import.meta.url), 'utf8');

// зручні обгортки: гість шле повідомлення в момент `now`
const ok = (guard, kind, now, opts) => checkGadget(guard, kind, now, opts).ok;
const why = (guard, kind, now, opts) => checkGadget(guard, kind, now, opts).reason;
// картка, яку хост роздав і гість підтвердив вибір
const takeCard = (guard, id = 'firetrail', rest = ['dmg25', 'spd12']) => {
  offerDraftCards(guard, [id, ...rest]);
  return takeDraftCard(guard, id);
};

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
  // усі джерела права мусять доїжджати до перевірки
  assert.ok(/if \(args\[0\] === 'dro'\) offerDraftCards\(/.test(hostSrc), 'хост памʼятає роздані набори');
  assert.ok(/case 'dpk'/.test(hostSrc) && /takeDraftCard\(this\._guard\(from\), d\.id\)/.test(hostSrc),
    'хост приймає повідомлення про вибір картки');
  assert.ok(/hypers: \(this\.session\.roster\.get\(from\) \|\| \{\}\)\.hyp/.test(hostSrc),
    'хост бере гіперзаряди з ростера, а не з повідомлення');
  assert.ok(/room: this\.roomGuard/.test(hostSrc) && /roomActive: this\._liveGadgets\(d\.kind, null\)/.test(hostSrc),
    'хост передає стан і лічильник кімнати');
  // Версія протоколу: пінимо не цифру (кожен бамп наступав би на ці граблі), а
  // РОЗСИНХРОН — що номер узагалі є і що кооп жене в мережу саме його, а не свою копію.
  const proto = Number((protoSrc.match(/export const PROTO_VERSION = (\d+);/) || [])[1]);
  assert.ok(Number.isInteger(proto) && proto > 0, 'PROTO_VERSION мусить бути цілим номером');
  assert.ok(/import \{[^}]*\bPROTO_VERSION\b[^}]*\} from '\.\/protocol\.js'/.test(coopSrc),
    'кооп мусить брати номер із protocol.js, а не тримати власну копію');
  assert.ok(/proto: PROTO_VERSION/.test(coopSrc), 'гість шле в hello саме цей номер');
  assert.ok(/d\.proto !== PROTO_VERSION/.test(coopSrc), 'а хост звіряє вхідний hello з ним же');
  assert.ok(/hyp: sanitizeHypers\(own\(src, 'hyp'\)\)/.test(coopSrc), 'ростер чистить оголошені гіперзаряди');
  assert.ok(/HYPER_IDS\.includes\(id\)/.test(coopSrc), 'чистить саме каталогом магазину');
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
  takeCard(g);
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
  takeCard(f);
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
  // сама лише роздача права НЕ дає — набір це пропозиція, а не вибір
  offerDraftCards(g, ['firetrail', 'dmg25', 'spd12']);
  assert.equal(why(g, 'firetrail', 1000), 'nocard', 'показали — ще не значить узяв');
  // а підтверджений вибір — дає
  assert.ok(takeDraftCard(g, 'firetrail'), 'вибір із набору хост зараховує');
  assert.ok(ok(g, 'firetrail', 1000), 'узята картка дає право');
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
});

test('вибір картки: хост зараховує рівно те, що гість узяв із НАДІСЛАНОГО набору', () => {
  const g = createGadgetGuard();
  offerDraftCards(g, ['firetrail', 'dmg25', 'spd12']);
  assert.equal(takeDraftCard(g, 'ricochet'), false, 'картки не з набору не буває');
  assert.equal(why(g, 'firetrail', 1000), 'nocard', 'і права вона не дає');
  assert.ok(takeDraftCard(g, 'firetrail'), 'а свій вибір із набору — зараховуємо');
  assert.ok(ok(g, 'firetrail', 1000), 'право на взяту картку є');

  // повтор того самого вибору права не додає: набір уже витрачений
  assert.equal(takeDraftCard(g, 'firetrail'), false, 'повторне повідомлення про вибір ігнорується');
  assert.equal(g.picked.firetrail, 1, 'зараховано рівно один раз');

  // друга картка з ТОГО САМОГО набору теж не проходить — набору вже немає
  assert.equal(takeDraftCard(g, 'dmg25'), false, 'двох карток з одного набору не буває');

  // сміття і чужі набори
  const other = createGadgetGuard();
  offerDraftCards(other, ['ricochet', 'crithit', 'chillshot']);
  assert.equal(takeDraftCard(other, 'firetrail'), false, 'сусідський набір права не дає');
  offerDraftCards(other, []);
  offerDraftCards(other, null);
  offerDraftCards(other, [42, null, '']);
  assert.equal(takeDraftCard(other, 'firetrail'), false, 'сміття замість набору теж');
  assert.equal(takeDraftCard(other, ''), false, 'порожній вибір відхиляється');
  assert.equal(takeDraftCard(null, 'firetrail'), false, 'без стану гостя — нічого');
});

test('вибір картки: посилення тільки за ДВОМА підтвердженими виборами', () => {
  const once = createGadgetGuard();
  takeCard(once);
  const r1 = checkGadget(once, 'firetrail', 1000, { strong: true });
  assert.ok(r1.ok && r1.strong === false, 'узяв раз — слід слабкий');

  // хост роздав набір із тією ж карткою вдруге, гість узяв її знову
  const twice = createGadgetGuard();
  takeCard(twice);
  takeCard(twice, 'firetrail', ['nades4', 'maxhp40']);
  assert.equal(twice.picked.firetrail, 2, 'два підтверджені вибори');
  const r2 = checkGadget(twice, 'firetrail', 1000, { strong: true });
  assert.ok(r2.ok && r2.strong, 'узяв двічі — сильний слід законний');

  // а от ДВА НАБОРИ з тією ж карткою без другого вибору посилення не дають
  const shown = createGadgetGuard();
  offerDraftCards(shown, ['firetrail', 'dmg25', 'spd12']);
  offerDraftCards(shown, ['firetrail', 'nades4', 'maxhp40']);
  takeDraftCard(shown, 'firetrail');
  const r3 = checkGadget(shown, 'firetrail', 1000, { strong: true });
  assert.ok(r3.ok && r3.strong === false, '«показали двічі» не означає «взяв двічі»');
});

test('гіперзаряд гостя: посилення за оголошеним правом, а не за прапорцем', () => {
  // 🤖 турель і ☄️ метеорит: посилення дає КУПЛЕНИЙ гіперзаряд, який гість оголошує
  // при вході (санітизований каталогом магазину в net/coop.js)
  const bought = createGadgetGuard();
  const turret = checkGadget(bought, 'turret', 1000, { strong: true, active: 0, hypers: ['turret', 'clone'] });
  assert.ok(turret.ok && turret.strong, 'чесно куплений гіперзаряд повертає гіпер-турель');
  const meteor = checkGadget(bought, 'meteor', 1000, { strong: true, hypers: ['meteor'] });
  assert.ok(meteor.ok && meteor.strong, 'те саме для метеорита');

  // без права — звичайна версія, але сам гаджет ставиться
  const plain = createGadgetGuard();
  const t2 = checkGadget(plain, 'turret', 1000, { strong: true, active: 0, hypers: [] });
  assert.ok(t2.ok && t2.strong === false, 'без гіперзаряду турель звичайна');
  const m2 = checkGadget(plain, 'meteor', 1000, { strong: true, hypers: ['turret'] });
  assert.ok(m2.ok && m2.strong === false, 'чужий гіперзаряд метеориту не допомагає');

  // сміття замість списку
  const junk = createGadgetGuard();
  assert.equal(checkGadget(junk, 'turret', 1000, { strong: true, active: 0, hypers: 'turret' }).strong, false,
    'не масив — не право');
  assert.equal(checkGadget(junk, 'wall', 1000, { strong: true, active: 0, hypers: ['wall'] }).strong, false,
    'у барикади посиленої версії не існує');
});

test('право на картку: воно у того гостя, який її взяв', () => {
  const mine = createGadgetGuard();
  const other = createGadgetGuard();
  takeCard(mine, 'firetrail', ['ricochet', 'crithit']);
  takeCard(other, 'ricochet', ['crithit', 'chillshot']);
  assert.ok(ok(mine, 'firetrail', 2000), 'хто взяв — тому й можна');
  assert.equal(why(other, 'firetrail', 2000), 'nocard', 'сусідів вибір права не дає');
});

test('посилення: без прапорця його не буває навіть за авторитетних даних', () => {
  const g = createGadgetGuard();
  const build = ['firetrail', 'firetrail'];
  const asked = checkGadget(g, 'firetrail', 4000, { build, strong: true });
  assert.ok(asked.ok && asked.strong, 'просив і мав право — отримав');
  const quiet = checkGadget(g, 'firetrail', 4000 + GADGET_LIMITS.firetrail.minGapMs, { build });
  assert.ok(quiet.ok && quiet.strong === false, 'не просив — слід лишається слабким');
});

test('межа довіри: guard вірить списку гіперзарядів, володіння він не перевіряє', () => {
  // Список приходить із ростера, куди його поклав САМ гість (`hello.hyp`), а
  // `sanitizeHypers` у net/coop.js звіряє id з каталогом магазину — тобто ФОРМУ, а
  // не володіння. Тут фіксуємо саме це: guard бере список як факт. Це прийнятий
  // розмін (інакше чесний гість втрачає куплений за 5000 монет гіперзаряд), а не
  // недогляд — закрити його можна лише довіреним джерелом покупок.
  // Якщо колись зʼявиться перевірка володіння, цей тест впаде — і це правильно:
  // рішення має бути свідомим.
  const g = createGadgetGuard();
  const declared = checkGadget(g, 'turret', 1000, { strong: true, active: 0, hypers: ['turret'] });
  assert.ok(declared.ok && declared.strong,
    'оголошеного гіперзаряду досить — доказу покупки guard не питає');
});

test('гіперзаряди: заявлене в таблиці збігається з каталогом магазину', () => {
  const shopSrc = readFileSync(new URL('../src/shop.js', import.meta.url), 'utf8');
  assert.ok(/export const HYPER_IDS/.test(shopSrc) && /SHOP_ITEMS\.filter\(\(i\) => i\.hyper\)/.test(shopSrc),
    'каталог виводиться з самих товарів, а не переписаний руками');
  const catalog = new Set([...shopSrc.matchAll(/hyper: '([a-z0-9]+)'/g)].map((m) => m[1]));
  assert.ok(catalog.has('turret') && catalog.has('meteor'), 'у магазині є гіперзаряди турелі й метеорита');
  for (const kind of GADGET_KINDS) {
    const lim = GADGET_LIMITS[kind];
    if (lim.hyper) assert.ok(catalog.has(kind), `${kind}: посилення заявлене, а гіперзаряду в магазині немає`);
    else if (!lim.card) assert.ok(!catalog.has(kind), `${kind}: гіперзаряд у магазині є, а в таблиці не заявлений`);
  }
});

test('стеля кімнати: не залежить від номера гравця', () => {
  const { wall } = GADGET_LIMITS;
  const a = createGadgetGuard();
  assert.equal(why(a, 'wall', 1000, { active: 0, roomActive: wall.roomMax }), 'room',
    'кімната вже повна — не пускаємо навіть гостя з чистими персональними лімітами');
  assert.ok(ok(a, 'wall', 1000, { active: 0, roomActive: wall.roomMax - 1 }), 'під кімнатною стелею — можна');
  // «вийшов — зайшов»: новий guard (новий pid), персональні ліміти чисті, кімната памʼятає
  const rejoined = createGadgetGuard();
  assert.equal(why(rejoined, 'wall', 1000, { active: 0, roomActive: wall.roomMax }), 'room',
    'перепідключення кімнатну стелю не скидає');

  // чесна кімната на чотирьох: троє гостей на СВОЇЙ персональній стелі мусять уміститись
  for (const kind of GADGET_KINDS) {
    const lim = GADGET_LIMITS[kind];
    if (kind === 'tramp') continue; // світ і так тримає лише 3 батути на всіх
    assert.ok(lim.roomMax >= lim.maxActive * 3, `${kind}: троє гостей мають уміщатись у кімнатну стелю`);
  }
});

test('стеля кімнати: цикл «вийшов — зайшов» не обходить ліміт вогню', () => {
  const { maxActive, roomMax, lifeMs } = GADGET_LIMITS.firetrail;
  const room = createGadgetGuard();
  let guest = createGadgetGuard();
  takeCard(guest);
  const alive = [];
  let roomDenied = 0;
  for (let i = 0; i < 600; i++) {
    const now = 1000 + i * 40;
    // «перепідключаємось» перед кожним повідомленням — найгірший випадок ревʼю:
    // новий номер гравця, повне відро жетонів і чиста персональна стеля щоразу
    guest = createGadgetGuard();
    takeCard(guest);
    const r = checkGadget(guest, 'firetrail', now, { room });
    if (r.ok) {
      alive.push(now);
      const together = alive.filter((at) => now - at < lifeMs).length;
      assert.ok(together <= roomMax, `живих у кімнаті не більше за стелю (${together})`);
    } else if (r.reason === 'room') roomDenied++;
  }
  assert.ok(roomDenied > 0, 'саме кімнатна стеля і зупиняє ротацію');
  assert.ok(alive.length < 600, 'обʼєкт на кожне повідомлення не створюється');
  assert.ok(roomMax > maxActive, 'кімнатна стеля вища за персональну — чесним вона не заважає');
});

test('чесний темп: жодної відмови', () => {
  const g = createGadgetGuard();
  takeCard(g);
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
  takeCard(g);
  assert.ok(ok(g, 'firetrail', t0), 'відмова без права не зʼїла бюджет сліду');
});

test('перепідключення гостя починає з чистого стану', () => {
  const before = createGadgetGuard();
  takeCard(before);
  assert.ok(ok(before, 'firetrail', 1000));
  assert.ok(ok(before, 'wall', 1000));

  const after = createGadgetGuard(); // новий RemotePlayer після реконекту
  assert.equal(why(after, 'firetrail', 1001), 'nocard', 'право не успадковується');
  assert.ok(ok(after, 'wall', 1001), 'і ліміт частоти теж не успадковується');
});

// ---------- v770: гард ростера + кулдауни дешевих повідомлень ----------

test('гард ростера стоїть ПЕРШИМ у _handleMessage і пускає повідомлення далі в сесію', () => {
  const body = hostSrc.match(/_handleMessage\(from, d\) \{([\s\S]*?)\n    const level = this\.level;/);
  assert.ok(body, 'у host.js має бути _handleMessage з гардом до розбору типу');
  const guard = body[1].match(/if \(!this\.session\.roster\.has\(from\)\) return (\w+);/);
  assert.ok(guard, 'перевірка «відправник у ростері?» мусить бути на вході, а не по кейсах');
  // `false`, а не `true`: hello НОВОГО гостя ще не має рядка в ростері й мусить
  // доїхати до сесії — з `true` приєднання посеред рівня зламалось би назавжди.
  assert.equal(guard[1], 'false', 'непроцесоване повідомлення мусить доїхати до CoopSession');
  assert.ok(/if \(this\.net && this\.net\.onMessage\(from, d\)\) return;/.test(coopSrc),
    'сесія розбирає повідомлення лише тоді, коли рівень повернув false');
  // чесний порядок: ростер наповнюється в _hostHello ДО того, як гість дізнається про старт
  const hello = coopSrc.match(/_hostHello\(from, d\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(hello, 'у coop.js має бути _hostHello');
  assert.ok(hello[1].indexOf('this.roster.set(from, entry)') < hello[1].indexOf("t: 'welcome'"),
    'ростер мусить наповнюватись РАНІШЕ за welcome/start — інакше чесний гість втратить старт');
});

test('дистанц-гейти хоста fail-closed: без рига повідомлення не проходить', () => {
  // Було «if (rp && …) return true» — при відсутньому ригу перевірка тихо вимикалась.
  assert.ok(!/if \(rp\w* && Math\.hypot/.test(hostSrc),
    'дистанц-гейт не має вимикатись сам собою, коли рига ще немає');
  assert.ok(/if \(!rpN \|\| Math\.hypot/.test(hostSrc), 'граната: немає рига — немає кидка');
  assert.ok(/if \(!rpR \|\| Math\.hypot/.test(hostSrc), 'ракета: немає рига — немає пострілу');
  const shot = hostSrc.match(/_onShot\(from, d\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(shot && /const rp = this\.remotes\.get\(from\);\n(?:\s*\/\/.*\n)*\s*if \(!rp\) return;/.test(shot[1]),
    'постріл: без рига гейтам нема з чим звірятись — виходимо одразу');
});

test('списки влучань обрізані спільною стелею', () => {
  const cap = hostSrc.match(/const MAX_NET_HITS = (\d+);/);
  assert.ok(cap, 'у host.js має бути стеля довжини списків');
  const max = Number(cap[1]);
  // 80 — геометрична стеля конуса вогнемета (сектор ~39 м² / ~0.5 м² на тіло)
  assert.ok(max >= 80, 'стеля мусить бути вищою за найдовшу ЧЕСНУ чергу (конус вогнемета)');
  assert.ok(max <= 256, 'і все ж стелею, а не декорацією');
  for (const field of ['d.hits', 'd.bar', 'd.wl']) {
    assert.ok(hostSrc.includes(`${field}.slice(0, MAX_NET_HITS)`), `${field} мусить обрізатись`);
  }
});

test('кулдауни дешевих повідомлень: перше пускаємо, дубль у тому ж кадрі — ні', () => {
  const seen = new Map();
  for (const [type, gap] of Object.entries(MSG_GAPS)) {
    assert.ok(throttleMsg(seen, 2, type, 1000), `${type}: перше повідомлення проходить`);
    assert.ok(!throttleMsg(seen, 2, type, 1000), `${type}: дубль у тому ж кадрі зникає`);
    assert.ok(!throttleMsg(seen, 2, type, 1000 + gap - 1), `${type}: раніше за інтервал — зникає`);
    assert.ok(throttleMsg(seen, 2, type, 1000 + gap), `${type}: рівно за інтервалом — проходить`);
  }
  // тип без рядка в таблиці не стримується взагалі (позиція, постріл, гаджет)
  for (const type of ['p', 'shot', 'gadget', 'use']) {
    for (let i = 0; i < 50; i++) assert.ok(throttleMsg(seen, 2, type, 1000), `${type} не стримується`);
  }
  // ліміт персональний: сусід у кімнаті чужим темпом не обмежений
  assert.ok(throttleMsg(seen, 3, 'ping', 1000), 'кулдаун рахується на кожного гостя окремо');
});

test('кулдауни мають запас над ЧЕСНИМ темпом відправника', () => {
  // lvlready — клієнт повторює раз на 1.2с (`client.js`, this._readyT = 1.2)
  assert.ok(MSG_GAPS.lvlready < 1200, 'чесний повтор lvlready мусить проходити');
  assert.ok(MSG_GAPS.lvlready > 100, 'але дубль у сусідньому кадрі — ні (два captureState поспіль)');
  // ping — анти-спам відправника 1.2с (`coop.js`, sendPing)
  assert.ok(MSG_GAPS.ping < 1200, 'чесний пінг раз на 1.2с мусить проходити');
  // twh — молот rpm 60, найшвидша чесна комбінація множників дає ~179 мс
  assert.ok(MSG_GAPS.twh < 179, 'найшвидший чесний удар молота мусить проходити');

  const seen = new Map();
  let now = 0;
  for (let i = 0; i < 40; i++) { // чесний молот у максимальному темпі, разом із дрижанням
    now += i % 3 === 0 ? 200 : 179;
    assert.ok(throttleMsg(seen, 2, 'twh', now), `удар ${i} не має губитись`);
  }
  for (let i = 0; i < 20; i++) {
    now += 1200;
    assert.ok(throttleMsg(seen, 2, 'ping', now), `пінг ${i} не має губитись`);
    assert.ok(throttleMsg(seen, 2, 'lvlready', now), `lvlready ${i} не має губитись`);
  }
  // а флуд у 1000 повідомлень за пів секунди дає рівно одне звернення до хоста
  let passed = 0;
  for (let i = 0; i < 1000; i++) if (throttleMsg(seen, 4, 'lvlready', now + i * 0.5)) passed++;
  assert.equal(passed, 1, 'спам lvlready будує рівно один captureState()');
});

test('стан кулдаунів чиститься разом із гостем', () => {
  assert.ok(/this\._msgAt\.delete\(pid\);/.test(hostSrc), 'removeGuest мусить чистити мапу кулдаунів');
  const rm = hostSrc.match(/removeGuest\(pid\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(rm && rm[1].includes('this._msgAt.delete(pid)'), 'і саме в removeGuest, поруч із _fountainAt');
  // сміття на вході не має валити хоста
  assert.ok(throttleMsg(null, 1, 'ping', 0), 'без мапи — просто пускаємо');
  assert.ok(throttleMsg(new Map(), 1, 'ping', NaN), 'без часу — теж');
});
