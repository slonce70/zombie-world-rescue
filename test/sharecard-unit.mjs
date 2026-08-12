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
  .replace('./_share.mjs', asData('export const shareImageFile = async () => "shared";'));
const { fmtTime, trimNick, victoryCardText, CARD } = await import(asData(resolved));

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
