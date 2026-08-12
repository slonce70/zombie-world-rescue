// 🔒 Адреса relay: `?relay=` і localStorage['zr-relay'] приймаються лише на локальному хості.
// Чужа адреса — це чужий сервер для всіх викликів apiBase(), включно з хмарним сейвом
// (cloudsave.js шле cid і весь прогрес через sendBeacon на закриття вкладки).
// src/net/transport.js імпортів не має, тож тягнемо його прямо з data-URL
// (package.json тут commonjs, звичайний import '.js' не спрацював би).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/net/transport.js', import.meta.url), 'utf8');
const { apiBase } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const SHIPPED = 'https://zr-relay.slonce70.workers.dev';
const EVIL = 'wss://evil.example/relay';

// підміна оточення сторінки: hostname + ?relay= + збережений zr-relay
function page(hostname, { relay = '', stored = '' } = {}) {
  globalThis.location = { hostname, search: relay ? `?relay=${encodeURIComponent(relay)}` : '' };
  globalThis.localStorage = { getItem: (k) => (k === 'zr-relay' && stored ? stored : null) };
}

test('бойовий домен ігнорує підкинуту адресу', () => {
  page('slonce70.github.io', { relay: EVIL });
  assert.equal(apiBase(), SHIPPED, '?relay= на бойовому домені мусить бути відкинутий');
  page('slonce70.github.io', { stored: EVIL });
  assert.equal(apiBase(), SHIPPED, 'zr-relay зі сховища на бойовому домені мусить бути відкинутий');
  page('slonce70.github.io');
  assert.equal(apiBase(), SHIPPED);
});

test('будь-який чужий хост — теж бойовий режим', () => {
  for (const host of ['evil.example', 'localhost.evil.example', 'notlocalhost', '127.0.0.1.evil.example']) {
    page(host, { relay: EVIL, stored: EVIL });
    assert.equal(apiBase(), SHIPPED, `${host} не має права підміняти relay`);
  }
});

test('локальна розробка працює як раніше', () => {
  for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', '']) {
    page(host, { relay: 'ws://localhost:8742' });
    assert.equal(apiBase(), 'http://localhost:8742', `${host || 'file://'}: ?relay= мусить діяти`);
    page(host, { stored: 'ws://127.0.0.1:8742' });
    assert.equal(apiBase(), 'http://127.0.0.1:8742', `${host || 'file://'}: zr-relay мусить діяти`);
    page(host);
    assert.equal(apiBase(), SHIPPED, `${host || 'file://'}: без параметра — вшита адреса`);
  }
});

test('перевірка живе в одному місці', () => {
  assert.equal(source.match(/relayAllowed\(\)/g).length, 2, 'гард оголошений раз і викликаний раз');
  assert.match(source, /function relayUrl\(\) \{\n\s*if \(!relayAllowed\(\)\) return DEFAULT_RELAY;/,
    'гард мусить стояти першим рядком relayUrl — усі виклики йдуть через нього');
  assert.equal(source.match(/DEFAULT_RELAY = '([^']+)'/)[1], SHIPPED.replace('https', 'wss'));
});
