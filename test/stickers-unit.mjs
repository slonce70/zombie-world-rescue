// 🎟️ Стікери: набір ЗАКРИТИЙ і його порядок ЗАМОРОЖЕНИЙ — по мережі їде індекс,
// тож перестановка старих стікерів мовчки підмінить фразу в чужій кімнаті.
// Без браузера: coop.js тягне three.js через characters.js, тому вирізаємо з тексту
// сам літерал PING_PHRASES і рахуємо його зі stub-ом t().
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coopSrc = readFileSync(new URL('../src/net/coop.js', import.meta.url), 'utf8');
const cssSrc = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

const literal = coopSrc.match(/export const PING_PHRASES = (\[[\s\S]*?\n\]);/);
assert.ok(literal, 'PING_PHRASES знайдено у src/net/coop.js');
const PING_PHRASES = new Function('t', `return ${literal[1]};`)((s) => s);

// перші п'ять — контракт мережі: були в проді, індекси змінювати не можна ніколи
const FROZEN = [
  { icon: '📍', text: 'Сюди!' },
  { icon: '🆘', text: 'Допоможи!' },
  { icon: '👍', text: 'Готовий!' },
  { icon: '🙏', text: 'Дякую!' },
  { icon: '🛡️', text: 'Захищаю!' },
];

test('стікерів рівно 12 — закритий набір, вільного тексту в грі немає', () => {
  assert.equal(PING_PHRASES.length, 12);
});

test('перші п\'ять лишились на своїх індексах — індекс їде по мережі', () => {
  FROZEN.forEach((expected, i) => assert.deepEqual(PING_PHRASES[i], expected, `індекс ${i}`));
});

test('кожен стікер має емодзі й підпис, емодзі не повторюються', () => {
  for (const [i, p] of PING_PHRASES.entries()) {
    assert.ok(p.icon && p.icon.trim(), `стікер ${i} без емодзі`);
    assert.ok(p.text && p.text.trim(), `стікер ${i} без підпису`);
  }
  const icons = PING_PHRASES.map((p) => p.icon);
  assert.equal(new Set(icons).size, icons.length, 'два стікери з однаковою емодзі — дитина їх не розрізнить');
});

test('анти-спам стікерів лишився 1.2 с', () => {
  assert.match(coopSrc, /now - this\._lastPing < 1200/);
});

// заявлене «влізуть без скролу» перевіряємо арифметикою по самому CSS, а не оком:
// колонки × висота кнопки × проміжки мусять лишитись у бюджеті висоти на телефоні.
// Найтісніший екран у наших рук — 375×667 (iPhone SE); картка оверлея з заголовком
// і полями лишає сітці приблизно 460 px. Хтось зробить кнопку вищою або колонку
// вужчою — тест впаде тут, а не в дитини під час гри.
const PHONE_GRID_BUDGET = 460;

function cssNum(re, what) {
  const m = cssSrc.match(re);
  assert.ok(m, `у styles.css має бути ${what}`);
  return Number(m[1]);
}

test('12 стікерів влізають у телефон без скролу: 3 колонки × 4 ряди в бюджеті висоти', () => {
  const cols = cssNum(/#ping-wheel\s*\{[^}]*grid-template-columns:\s*repeat\((\d+), 1fr\)/, 'сітка #ping-wheel');
  const gap = cssNum(/#ping-wheel\s*\{[^}]*gap:\s*(\d+)px/, 'проміжок у сітці');
  // box-sizing: border-box глобально (styles.css:11), тож поля вже всередині min-height
  const rowH = cssNum(/\.ping-btn\s*\{[^}]*min-height:\s*(\d+)px/, 'висота кнопки .ping-btn');
  assert.ok(cols >= 3, `${cols} колонки — на 12 стікерів це вже стовпчик, буде скрол`);
  const rows = Math.ceil(PING_PHRASES.length / cols);
  const total = rows * rowH + (rows - 1) * gap;
  assert.ok(total <= PHONE_GRID_BUDGET,
    `${rows} рядів × ${rowH}px = ${total}px — більше за бюджет ${PHONE_GRID_BUDGET}px, на телефоні буде скрол`);
});

test('заголовок оверлея — про стікери, а не про старий пінг', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const header = html.match(/<div id="overlay-ping"[\s\S]*?<h2>([^<]+)<\/h2>/);
  assert.ok(header, 'оверлей #overlay-ping має заголовок');
  assert.match(header[1], /СТІКЕР/, `заголовок «${header[1].trim()}» лишився від колеса фраз`);
});
