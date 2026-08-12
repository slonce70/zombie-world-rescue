// 💾 v780 «Моя гра всюди»: переїзд прогресу на інший пристрій.
//
// Головне, що тут прибито — ПОПЕРЕДЖЕННЯ ПЕРЕД ЗАМІНОЮ. Дитина мусить побачити
// конкретику (скільки країн, монет, зірок, які улюбленці) ДО того, як натисне,
// і мусити мати змогу скасувати. Тому перевіряємо не текст верстки, а поведінку:
// жоден шлях заміни (код і файл) не викликає adopt() без явного «Так, замінити».
//
// Без браузера: saveui.js вантажимо з підміненими імпортами (прийом
// world-saved-unit.mjs) на мікро-DOM — рівно ті методи, яких торкається панель.
// node --test test/transfer-warn-unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const saveuiSrc = read('../src/ui/saveui.js');
const cloudSrc = read('../src/net/cloudsave.js')
  .replace("from './transport.js'", `from '${asData("export const apiBase = () => 'https://relay.test';")}'`)
  .replace("from './league.js'", `from '${asData('export const ensureCid = () => "cid-1";')}'`);
const cloudUrl = asData(cloudSrc);
const { progressLoss, saveHasProgress } = await import(cloudUrl);

const { SaveUI } = await import(asData(saveuiSrc
  .replace("from '../net/cloudsave.js'", `from '${cloudUrl}'`)
  .replace("from '../characters.js'", `from '${asData(`export const PETS = {
    dog: { name: 'Песик Дружок', icon: '🐶' },
    cat: { name: 'Кошеня Мурчик', icon: '🐱' },
  };`)}'`)
  .replace("from '../i18n.js'", `from '${asData('export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);')}'`)));

// ---------- мікро-DOM: рівно те, чим користується SaveUI ----------
function makeDoc() {
  const els = new Map();
  const make = (id) => {
    let text = '';
    const el = {
      id, value: '', hidden: false, dataset: {}, children: [], files: null, handlers: {},
      addEventListener(type, fn) { (el.handlers[type] || (el.handlers[type] = [])).push(fn); },
      async fire(type) { for (const fn of el.handlers[type] || []) await fn(); },
      click() { return el.fire('click'); },
      appendChild(child) { el.children.push(child); },
    };
    Object.defineProperty(el, 'textContent', {
      get: () => text,
      set: (v) => { text = String(v); el.children.length = 0; },
    });
    return el;
  };
  return {
    getElementById(id) { if (!els.has(id)) els.set(id, make(id)); return els.get(id); },
    createElement: () => make('li'),
  };
}

// сейв, який дитині шкода: 3 країни, монети понад стартові, зірки і два улюбленці
const RICH = () => ({ liberated: { UKR: true, POL: true, ESP: true }, coins: 1240, stars: { UKR: 3, POL: 2 }, pets: ['dog', 'cat'] });

function panel(save) {
  const doc = makeDoc();
  globalThis.document = doc;
  const adopted = [];
  const game = {
    save,
    audio: { click() {} },
    _showOverlay() {},
    cloud: {
      enabled: true, lastOkTs: 1, lastFailTs: 0, lastFailStatus: 0,
      adopt(raw, opts) { adopted.push({ raw, opts }); return true; },
      claim: async () => ({ data: JSON.stringify({ liberated: { JPN: true }, coins: 10 }) }),
      fetchCode: async () => 'ABCD1234',
      push: async () => true,
    },
  };
  const ui = new SaveUI(game);
  doc.getElementById('progress-warn').hidden = true;   // стартовий стан із index.html
  return { ui, doc, adopted, el: (id) => doc.getElementById(id) };
}

async function claimCode(p) {
  p.el('cloud-code-input').value = 'ABCD1234';
  await p.el('btn-cloud-claim').click();
}

test('progressLoss називає саме те, що шкода втратити', () => {
  assert.deepEqual(progressLoss(RICH()), {
    countries: 3, coins: 1240, stars: 5, pets: ['dog', 'cat'],
  });
  // порожній/битий сейв не має падати і не має нічого вигадувати
  assert.deepEqual(progressLoss(null), { countries: 0, coins: 0, stars: 0, pets: [] });
});

test('порожній пристрій: втрачати нічого — переносимо без зайвого страху', async () => {
  const p = panel({});
  assert.equal(saveHasProgress(p.ui.game.save), false);
  await claimCode(p);
  assert.equal(p.adopted.length, 1);
  assert.equal(p.el('progress-warn').hidden, true);
});

test('є свій прогрес: спершу попередження з конкретикою, adopt не викликано', async () => {
  const p = panel(RICH());
  await claimCode(p);
  assert.equal(p.adopted.length, 0, 'нічого не замінюємо, доки дитина не підтвердила');
  assert.equal(p.el('progress-warn').hidden, false);
  assert.equal(p.el('progress-steps').hidden, true);
  const lines = p.el('progress-warn-list').children.map((li) => li.textContent);
  assert.deepEqual(lines, [
    '🌍 Звільнені країни: 3',
    '🪙 Монети: 1240',
    '⭐ Зірки: 5',
    '🐾 Улюбленці: 🐶 Песик Дружок, 🐱 Кошеня Мурчик',
  ]);
  assert.match(p.el('progress-warn-ask').textContent, /Точно замінити/);
});

test('скасувати можна: «Ні, залишити цю гру» повертає панель і нічого не міняє', async () => {
  const p = panel(RICH());
  await claimCode(p);
  await p.el('btn-progress-keep').click();
  assert.equal(p.adopted.length, 0);
  assert.equal(p.el('progress-warn').hidden, true);
  assert.equal(p.el('progress-steps').hidden, false);
  // і навіть якщо після скасування хтось смикне «Так, замінити» — заміни вже нема
  await p.el('btn-progress-replace').click();
  assert.equal(p.adopted.length, 0);
});

test('«Так, замінити» переносить рівно один раз', async () => {
  const p = panel(RICH());
  await claimCode(p);
  await p.el('btn-progress-replace').click();
  assert.equal(p.adopted.length, 1);
  await p.el('btn-progress-replace').click();
  assert.equal(p.adopted.length, 1, 'повторний клік по схованій кнопці нічого не замінює');
});

test('відновлення з файлу йде через те саме попередження', async () => {
  const p = panel(RICH());
  const input = p.el('save-file-input');
  input.files = [{ text: async () => JSON.stringify({ liberated: { JPN: true }, coins: 10 }) }];
  await input.fire('change');
  assert.equal(p.adopted.length, 0);
  assert.equal(p.el('progress-warn').hidden, false);
  await p.el('btn-progress-replace').click();
  assert.equal(p.adopted.length, 1);
  assert.equal(p.adopted[0].opts.justImported, true, 'F25: імпортований файл має стати найновішим у хмарі');
});

test('панель не повертається до системного confirm()', () => {
  const code = saveuiSrc.replace(/(^|[^:])\/\/[^\n]*/g, '$1');   // без коментарів
  assert.equal(/\bconfirm\(/.test(code), false,
    'попередження мусить бути кроком у панелі з конкретикою, а не системним діалогом');
});
