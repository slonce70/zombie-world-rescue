// 🌍 Клієнтський бік lobby.js: лічильник світу на глобусі, що шлемо у воркер —
// і власне імʼя дитини, без якого дошка дуелі злипається в один рядок «Гравець».
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
  // нік живе в localStorage — під Node підміняємо його змінною модуля.
  // cleanNick повторює правило coop.js: лайка → «Гравець» (саме той злитий рядок)
  .replace("from './coop.js'", `from '${stub(`
    let stored = '';
    export const loadNick = () => stored;
    export const saveNick = (v) => { stored = v; };
    export const cleanNick = (s) => {
      const n = String(s == null ? '' : s).trim().slice(0, 12);
      return /дурень/i.test(n) ? 'Гравець' : n;
    };
  `)}'`)
  .replace("from '../i18n.js'", `from '${stub('export const t = (s, p) => (p ? s.replace(/\\{(\\w+)\\}/g, (_, k) => p[k]) : s);')}'`)
  .replace("from '../titles.js'", `from '${stub('export const syncTitles = () => {}; export const titleName = () => "";')}'`);
const { LobbyClient, worldSavedText, WORLD_MIN } = await import(asData(src));

test('число на глобусі — тижневе, з групами по три', () => {
  const text = worldSavedText({ worldSaved: 900, worldSavedWeek: 12480 });
  assert.equal(text, '🌍 За тиждень врятовано людей: 12 480', 'великі числа групами по три');
  assert.match(worldSavedText({ worldSaved: 0, worldSavedWeek: WORLD_MIN }), /За тиждень/);
});

test('число НЕ падає протягом дня, коли гравців більшає', () => {
  // саме цей сценарій ламав старе правило: ранок показував тиждень (400),
  // обід перемикався на добове (120) — світ «зменшувався» рівно тоді, коли ріс
  const morning = worldSavedText({ worldSaved: 50, worldSavedWeek: 400 });
  const noon = worldSavedText({ worldSaved: 120, worldSavedWeek: 470 });
  const num = (s) => Number(s.replace(/\D/g, ''));
  assert.ok(num(noon) >= num(morning), `${morning} → ${noon}: число не сміє меншати`);
});

test('порожній світ не сумує: дрібниці не показуємо взагалі', () => {
  assert.equal(worldSavedText({ worldSaved: 3, worldSavedWeek: 3 }), '', 'перший гравець тижня не бачить «врятовано 3»');
  assert.equal(worldSavedText({ worldSaved: 14, worldSavedWeek: WORLD_MIN - 1 }), '', 'поріг має і тижневе число');
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

test('внесок повертає свіже число — глобусу не треба другого читання', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"worldSavedWeek":540}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const lc = new LobbyClient({ save: {}, progress: { level: 1, prestigeStars: 0 } });
    const d = await lc.announceSaved(11);
    assert.equal(worldSavedText(d), '🌍 За тиждень врятовано людей: 540', 'відповідь на власний пінг і є свіжим числом');
    assert.equal(await lc.announceSaved(0), null, 'нікого не врятували — і читати нема чого');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------- 🤝 своє імʼя: половина проблеми «двоє солістів — один рядок» ----------

test('соліст ніка не має за конструкцією — і безіменна спроба на дошку не їде', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return new Response('{"duel":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const lc = new LobbyClient({ save: {}, progress: { level: 1, prestigeStars: 0 } });
    assert.equal(lc.hasNick(), false, 'чистий профіль: кооп-шляхи ніка не зберігали');
    assert.equal(lc.nick(), 'Гравець', 'у лобі підпис лишається — але це НЕ імʼя');
    assert.equal(await lc.announceDuel('bank', 60_000, true), null);
    assert.equal(calls.length, 0, 'без імені спроба на спільну дошку не їде — інакше всі солісти зіллються');

    assert.equal(lc.setNick(''), '', 'порожнє не зберігаємо');
    assert.equal(lc.setNick('О'), '', 'один символ — не імʼя');
    assert.equal(lc.setNick('дурень'), '', 'лайка не стає «Гравцем» тихцем — саме цей рядок і злипався');
    assert.equal(lc.hasNick(), false, 'жодна з невдалих спроб нічого не зберегла');

    assert.equal(lc.setNick('  Соломія  '), 'Соломія', 'нормальне імʼя приймаємо один раз');
    assert.equal(lc.hasNick(), true);
    await lc.announceDuel('bank', 60_000, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].duel.nick, 'Соломія', 'на дошці — те імʼя, яке дитина впізнає');
  } finally {
    globalThis.fetch = realFetch;
  }
});
