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

test('колесо — сітка, а не стовпчик: 12 кнопок мусять влізти в телефон без скролу', () => {
  assert.match(cssSrc, /#ping-wheel\s*\{[^}]*grid-template-columns:\s*repeat\(3, 1fr\)/);
});
