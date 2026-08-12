// 🖼️ Листівка перемоги: чиста композиція (формат часу, обрізання ніка, розкладка рядків).
// Без браузера й канваса — тестуємо рівно те, що можна зламати правкою тексту.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/sharecard.js', import.meta.url), 'utf8')
  .replace("from '../i18n.js'", "from './_i18n.mjs'")
  .replace("from './share.js'", "from './_share.mjs'");

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const resolved = src
  .replace('./_i18n.mjs', asData("export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);"))
  .replace('./_share.mjs', asData('globalThis.__shared = [];'
    + 'export const shareImageFile = async (g, blob) => { globalThis.__shared.push(blob); return "shared"; };'));
const { fmtTime, trimNick, victoryCardText, inviteCardText, shareCard, CARD } = await import(asData(resolved));

test('час на листівці — той самий M:SS, що на екрані перемоги', () => {
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(9), '0:09');
  assert.equal(fmtTime(65), '1:05');
  assert.equal(fmtTime(272.9), '4:32', 'дробові секунди зрізаються вниз');
  assert.equal(fmtTime(3600), '60:00', 'година йде у хвилини, а не в 0:00');
  assert.equal(fmtTime(-5), '0:00', 'мінус не малює «-1:-5»');
  assert.equal(fmtTime(undefined), '0:00');
  assert.equal(fmtTime('90'), '1:30');
});

test('довгий нік ріжеться, порожній стає «Рятівник»', () => {
  assert.equal(trimNick('Влад'), 'Влад');
  assert.equal(trimNick('  Влад  '), 'Влад');
  assert.equal(trimNick(''), 'Рятівник');
  assert.equal(trimNick('   '), 'Рятівник');
  assert.equal(trimNick(null), 'Рятівник');
  assert.equal(trimNick('РівноЧотирнадц'), 'РівноЧотирнадц', '14 символів лишаються цілими');
  const cut = trimNick('НадзвичайноДовгийНікДитини');
  assert.equal([...cut].length, 14, 'разом із «…» — рівно 14 знаків');
  assert.ok(cut.endsWith('…'));
  // емодзі в ніку — один символ, а не два: ріжемо по код-поінтах
  assert.equal([...trimNick('🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟🧟')].length, 14);
});

test('розкладка листівки: країна великим, решта — дрібним рядком', () => {
  const c = victoryCardText({
    flag: '🇺🇦', country: 'Україна', nick: 'Влад',
    timeSec: 272, stars: 2, starMax: 3, kills: 87,
  });
  assert.equal(c.flag, '🇺🇦');
  assert.equal(c.headline, 'УКРАЇНА', 'назва країни — капсом і окремим рядком');
  assert.equal(c.sub, 'ЗВІЛЬНЕНО!');
  assert.equal(c.stars, '⭐⭐☆', 'зірки забігу, а не сумарні');
  assert.equal(c.meta, 'Влад · ⏱ 4:32 · 🧟 87');
  assert.equal(c.brand, 'Операція: Порятунок Світу');
  assert.equal(CARD, 1080, 'PNG 1080×1080 — влазить і в сторіс, і в чат');
});

test('листівка-запрошення: код найбільшим рядком, посилання поруч', () => {
  const url = 'https://example.org/zwr/?coopjoin=AB3D';
  const c = inviteCardText({ code: 'ab3d', nick: 'Влад', url });
  assert.equal(c.headline, 'AB3D', 'код кімнати — капсом і головним рядком');
  assert.ok(c.headlinePx > 104, `код більший за назву країни: ${c.headlinePx}`);
  assert.equal(c.frame, null, 'у лобі кадру гри ще немає');
  assert.equal(c.flag, '', 'верх листівки віддано коду');
  assert.equal(c.meta, url, 'посилання ?coopjoin= намальоване на картинці');
  assert.equal(c.stars, 'Влад чекає на тебе');
  assert.equal(c.brand, 'Операція: Порятунок Світу');
  assert.ok(c.text.includes('AB3D') && c.text.endsWith(url), `у тексті шеру код і лінк: ${c.text}`);
  assert.equal(c.filename, 'zombie-rescue-room-AB3D.png');
});

test('запрошення не малює чужий чи порожній код', () => {
  // код завжди береться з переданого — жодних дефолтів «на минулу кімнату»
  assert.equal(inviteCardText({ code: 'ZZ99' }).headline, 'ZZ99');
  assert.equal(inviteCardText({ code: ' q7k2 ' }).headline, 'Q7K2', 'пробіли не потрапляють у код');
  const empty = inviteCardText({});
  assert.equal(empty.headline, '', 'без кімнати — порожньо, а не «undefined»');
  assert.equal(empty.meta, '');
  assert.equal(empty.filename, 'zombie-rescue-room-coop.png');
  assert.ok(!empty.text.endsWith(' '), 'без лінка текст не тягне хвостовий пробіл');
  assert.equal(inviteCardText({ code: 'AB3D' }).stars, 'Рятівник чекає на тебе', 'порожній нік → Рятівник');
});

// 🕰️ Головне в шері з телефона: navigator.share() мусить піти в тому ж таску, що й тап.
// Тому готовий blob віддається БЕЗ жодного await, а не готовий — не мовчить.
test('готовий blob іде в share синхронно — iOS не встигає забрати жест', () => {
  globalThis.__shared.length = 0;
  const toasts = [];
  const game = { hud: { toast: (m) => toasts.push(m) } };
  const done = shareCard(game, { blob: 'PNG', filename: 'a.png', text: 'hi' });
  assert.equal(globalThis.__shared.length, 1, 'share мусить викликатись ще до першої мікрозадачі');
  assert.equal(globalThis.__shared[0], 'PNG', 'віддаємо підготовлену картинку, а не малюємо заново');
  assert.equal(toasts.length, 0);
  return done;
});

test('тап раніше за готовність картинки — зрозумілий тост, а не тиша', async () => {
  globalThis.__shared.length = 0;
  const toasts = [];
  const game = { hud: { toast: (m) => toasts.push(m) } };
  assert.equal(await shareCard(game, { pending: true }), 'pending');
  assert.equal(globalThis.__shared.length, 0, 'поки PNG не готовий — нічого не шеримо');
  assert.equal(toasts.length, 1, 'кнопка не мовчить');
  assert.ok(toasts[0].includes('ще малюється'), toasts[0]);
});

test('розкладка не ламається на порожніх і кривих даних', () => {
  const zero = victoryCardText({});
  assert.equal(zero.flag, '🏆', 'країна без прапора — не «undefined»');
  assert.equal(zero.headline, '');
  assert.equal(zero.stars, '☆☆☆');
  assert.equal(zero.meta, 'Рятівник · ⏱ 0:00 · 🧟 0');
  assert.equal(victoryCardText({ stars: 9 }).stars, '⭐⭐⭐', 'зірок не більше за максимум');
  assert.equal(victoryCardText({ stars: -3 }).stars, '☆☆☆');
  assert.equal(victoryCardText({ kills: 12.7 }).meta.endsWith('🧟 12'), true);
  const long = victoryCardText({ country: 'Острів Динозаврів', nick: 'НадзвичайноДовгийНік' });
  assert.equal(long.headline, 'ОСТРІВ ДИНОЗАВРІВ');
  assert.ok(long.meta.startsWith('НадзвичайноДо…'), `нік обрізано: ${long.meta}`);
});
