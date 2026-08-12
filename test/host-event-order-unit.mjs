// 📣 Порядок розсилки хоста: події ПЕРЕД снапшотом того самого кадру.
//
// Подія ОГОЛОШУЄ зміну, снапшот її вже МІСТИТЬ. Зі зворотним порядком снапшот
// обганяв подію на тому ж кадрі, і гість виводив зміну з голих чисел, а потім
// глушив саму подію власним гардом. Живий приклад — ⭐2 «ціль забігу»: снапшот
// із `so` = target ставив гостю `so.done = true`, після чого `case 'soc'` у
// net/client.js відсікався гардом `!so.done` — ціль зникала з HUD без тоста й
// дзвіночка. Те саме стосується будь-якої іншої події, чий ефект видно у числах
// снапшота, тож прибиваємо саме ПОРЯДОК, а не окремий випадок.
//
// Three.js і DOM не потрібні: беремо тіло update() прямо з тексту src/net/host.js
// (як у test/squad-net-unit.mjs) і крутимо його на макеті.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const host = readFileSync(new URL('../src/net/host.js', import.meta.url), 'utf8');

const hz = host.match(/const SNAP_HZ = (\d+)/);
assert.ok(hz, 'у src/net/host.js має бути SNAP_HZ');
globalThis.SNAP_HZ = Number(hz[1]);

const m = host.match(/\n {2}(update\(dt\)[\s\S]*?\n {2}\})\n/);
assert.ok(m, 'у src/net/host.js має бути метод update(dt)');
const update = new Function(`return ({ ${m[1]} }).update;`)();

// макет хоста: порожні remotes/руйнівні об'єкти, без storm/bossRush — лишається
// рівно та частина update(), що вирішує порядок розсилки.
function makeNet() {
  const sent = [];
  return {
    sent,
    _hostShotCd: 0,
    remotes: new Map(),
    _destroyedWorldIds: new Set(),
    snapT: 0,                      // снапшот ГАРАНТОВАНО піде цим же кадром — тут і був race
    evQueue: [['soc']],
    level: { world: { destructibles: [] }, players: [], storm: null, bossRush: null },
    session: { transport: { broadcast: (msg) => sent.push(msg.t) } },
    flushEvents() {
      if (this.evQueue.length) {
        this.session.transport.broadcast({ t: 'ev', l: this.evQueue });
        this.evQueue = [];
      }
    },
    _snapshot() { return { t: 's' }; },
    update,
  };
}

test('подія летить ПЕРЕД снапшотом того самого кадру', () => {
  const net = makeNet();
  net.update(1 / 60);
  assert.deepEqual(net.sent, ['ev', 's'],
    'ev мусить піти перед s: інакше снапшот обганяє подію і гість глушить її власним гардом');
});

test('кадр без снапшота все одно віддає накопичені події', () => {
  const net = makeNet();
  net.snapT = 10;                  // до наступного снапшота ще далеко
  net.update(1 / 60);
  assert.deepEqual(net.sent, ['ev'], 'події не мають чекати на снапшот');
});
