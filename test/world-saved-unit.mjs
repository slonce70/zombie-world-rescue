// 🌍 Лічильник світу, бік клієнта: що показуємо на глобусі і що шлемо у воркер.
// Без браузера — lobby.js вантажимо з підміненими імпортами (як sharecard-unit.mjs).
// node --test test/world-saved-unit.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const stub = (code) => asData(code);
const src = readFileSync(new URL('../src/net/lobby.js', import.meta.url), 'utf8')
  .replace("from './transport.js'", `from '${stub("export const apiBase = () => 'https://relay.test';")}'`)
  .replace("from './league.js'", `from '${stub('export const ensureCid = () => "cid-1";')}'`)
  .replace("from './cloudsave.js'", `from '${stub('export const liberatedCount = () => 0;')}'`)
  .replace("from './coop.js'", `from '${stub('export const loadNick = () => "Влад"; export const cleanNick = (s) => String(s || "");')}'`)
  .replace("from '../i18n.js'", `from '${stub('export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);')}'`)
  .replace("from '../titles.js'", `from '${stub('export const syncTitles = () => {}; export const titleName = () => "";')}'`);
const { LobbyClient, worldSavedText, WORLD_DAY_MIN } = await import(asData(src));

test('добове число показуємо, коли світ уже нарятував на поріг', () => {
  const text = worldSavedText({ worldSaved: 12480, worldSavedWeek: 40000 });
  assert.equal(text, '🌍 Сьогодні врятовано людей: 12 480', 'великі числа групами по три');
  assert.match(worldSavedText({ worldSaved: WORLD_DAY_MIN, worldSavedWeek: 999 }), /Сьогодні/);
});

test('порожній світ не сумує: нижче порога показуємо тиждень', () => {
  const d = { worldSaved: 14, worldSavedWeek: 320 };
  assert.equal(worldSavedText(d), '🌍 За тиждень врятовано людей: 320');
  assert.match(worldSavedText({ worldSaved: WORLD_DAY_MIN - 1, worldSavedWeek: 700 }), /За тиждень/);
});

test('нема даних — нема блока (без інтернету глобус просто без числа)', () => {
  assert.equal(worldSavedText(null), '');
  assert.equal(worldSavedText({}), '');
  assert.equal(worldSavedText({ worldSaved: 0, worldSavedWeek: 0 }), '', 'нуль за тиждень не показуємо');
  assert.equal(worldSavedText({ worldSaved: 'багато', worldSavedWeek: null }), '', 'сміття не малюємо');
});

test('внесок їде окремим пінгом, нуль воркера не турбує', async () => {
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    bodies.push({ url: String(url), body: JSON.parse(opts.body) });
    return new Response('{"online":1}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const lc = new LobbyClient({ save: {}, progress: { level: 3, prestigeStars: 0 } });
    lc.announceSaved(0);
    lc.announceSaved(-5);
    lc.announceSaved(NaN);
    assert.equal(bodies.length, 0, 'нікого не врятували — запиту немає');
    lc.announceSaved(11);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(bodies.length, 1);
    assert.match(bodies[0].url, /\/lobby\/ping$/);
    assert.equal(bodies[0].body.saved, 11, 'внесок їде полем saved у тому самому тілі пінга');
  } finally {
    globalThis.fetch = realFetch;
  }
});
