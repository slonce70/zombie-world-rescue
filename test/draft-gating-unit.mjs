// 🎲 Драфт і керування: невалідний індекс не морозить сим, а гейти pointer lock
// (пауза під драфтом, магазин поверх драфту) знають про draft.isOpen.
// DOM/THREE тут не потрібні: тіло Draft.pick() береться прямо з тексту src/draft.js
// і крутиться на макеті гри (патерн test/clone-squad-unit.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const draftSrc = read('draft.js');

const bodyOf = (src, sig) => {
  const m = src.match(new RegExp(`\\n {2}${sig} \\{\\n([\\s\\S]*?)\\n {2}\\}\\n`));
  assert.ok(m, `у src/draft.js має бути метод ${sig}`);
  return m[1];
};

// вільні змінні тіл: t() і COMBOS з інших модулів
globalThis.t = (s) => s;
globalThis.COMBOS = {};

const closeBody = new Function(bodyOf(draftSrc, 'close\\(\\)'));
const pickBody = new Function('idx', bodyOf(draftSrc, 'pick\\(idx\\)'));

const makeDraft = (offered) => ({
  isOpen: true,
  offered,
  _expire: null,
  close: closeBody,
  shown: true,
  el: { classList: { add() { this.owner.shown = true; }, remove() { this.owner.shown = false; } } },
  game: {
    paused: false,
    audio: { purchase() {}, click() {} },
    hud: { banner() {} },
    input: { requested: 0, request() { this.requested++; } },
    level: { runBuild: { apply: () => null, summary: () => '' }, player: {} },
  },
});

const draftWithEl = (offered) => {
  const d = makeDraft(offered);
  d.el.classList.owner = d;
  return d;
};

const CARD = { id: 'dmg', name: 'Урон' };

test('pick() with a valid index closes the overlay and unfreezes the sim', () => {
  const d = draftWithEl([CARD]);
  pickBody.call(d, 0);
  assert.equal(d.isOpen, false);
  assert.equal(d.shown, false, 'клас .show знято');
  assert.equal(d.game.input.requested, 1, 'керування повернуто');
});

test('pick() with an invalid index closes the draft instead of freezing the game', () => {
  for (const idx of [7, -1, undefined, NaN, 'x']) {
    const d = draftWithEl([CARD]);
    d._expire = setTimeout(() => {}, 60000);
    pickBody.call(d, idx);
    assert.equal(d.isOpen, false, `idx=${String(idx)}: сим не лишається замороженим`);
    assert.equal(d.shown, false, `idx=${String(idx)}: оверлей знято`);
    assert.equal(d._expire, null, `idx=${String(idx)}: таймер авто-піку знято`);
  }
});

test('pick() on a level-less game does not leave the overlay hanging', () => {
  const d = draftWithEl([CARD]);
  d.game.level = null;
  pickBody.call(d, 0);
  assert.equal(d.isOpen, false);
  assert.equal(d.shown, false);
});

// 🛒 Магазин поверх драфту: гейт відкриття живе в toggle() (його смикають і KeyB,
// і тач-кнопка «🛒»), повернення lock — у close(). Обидва тіла беремо з тексту shop.js.
const shopSrc = read('shop.js');
const shopBody = (sig) => {
  const m = shopSrc.match(new RegExp(`\\n {2}${sig} \\{\\n([\\s\\S]*?)\\n {2}\\}\\n`));
  assert.ok(m, `у src/shop.js має бути метод ${sig}`);
  return m[1];
};
const shopClose = new Function(shopBody('close\\(\\)'));
const shopToggle = new Function(shopBody('toggle\\(\\)'));

const makeShop = (draftOpen, isOpen = false) => ({
  isOpen,
  opened: 0,
  open() { this.opened++; this.isOpen = true; },
  close: shopClose,
  el: { classList: { add() {}, remove() {} } },
  game: {
    paused: false,
    level: {},
    draft: { isOpen: draftOpen },
    audio: { click() {} },
    input: { requested: 0, request() { this.requested++; } },
  },
});

test('shop does not open over the draft, but still closes over it', () => {
  const blocked = makeShop(true);
  shopToggle.call(blocked);
  assert.equal(blocked.opened, 0, 'при відкритому драфті магазин не відкривається');
  assert.equal(blocked.isOpen, false);

  const stacked = makeShop(true, true);        // магазин уже висів, драфт відкрився зверху
  shopToggle.call(stacked);
  assert.equal(stacked.isOpen, false, 'закрити магазин драфт не заважає');
  assert.equal(stacked.game.input.requested, 0, 'lock не повертається в драфт');

  const normal = makeShop(false);
  shopToggle.call(normal);
  assert.equal(normal.opened, 1, 'поза драфтом магазин працює як раніше');
  shopToggle.call(normal);
  assert.equal(normal.isOpen, false);
  assert.equal(normal.game.input.requested, 1, 'поза драфтом lock повертається');
});

// Гейт паузи живе в обробнику pointerlockchange — юнітом його не викликати.
// Мінімальний сторож від регресії: умова мусить згадувати draft.isOpen.
test('the pause gate knows about the open draft', () => {
  const lockChange = read('main.js').match(/this\.input\.onLockChange = \(locked\) => \{[\s\S]*?\n {4}\};/);
  assert.ok(lockChange, 'у src/main.js має бути onLockChange');
  assert.match(lockChange[0], /!this\.draft\.isOpen/, 'драфт не відкриває меню паузи під собою');
});
