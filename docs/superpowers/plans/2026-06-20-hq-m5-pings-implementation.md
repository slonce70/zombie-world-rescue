# M5 «Безпечні пінги» Implementation Plan

> Execute via `superpowers:subagent-driven-development`. Builds on M1-M4,M6,M7 (v26-v31). LOW-RISK netcode slice: 5 fixed safe phrases shown as HUD TOASTS (reuses the toast system — no new 3D bubble rendering), triggered from the existing `#coop-room` chip + a key. The version gate (APP_VERSION checked at room entry) means mixed builds never share a room, so the `PROTO_VERSION` bump is safe.

**Goal:** in a coop game, a kid can send a safe quick-phrase («📍 Сюди!», «🆘 Допоможи!», «👍 Готовий!», «🙏 Дякую!», «🛡️ Захищаю!») that appears as a toast for everyone («Влад: 🆘 Допоможи!»). Safe coordination without any free text — the recommended <13 social pattern.

**Architecture:** `PING_PHRASES` (5, t()-wrapped) in `src/net/coop.js`. `CoopSession.sendPing(i)` (cooldown + local toast) routes to `HostNet.hostPing` (broadcast `ev('pg',1,i)`) or `GuestNet.guestPing` (`send({t:'ping',i})`). Host `_onMsg` `case 'ping'` re-broadcasts + toasts the sender; client `_onEv` `case 'pg'` toasts. Trigger: tap `#coop-room` chip (coop level) or press `C` → `#overlay-ping` wheel → pick → send. `PROTO_VERSION` 3→4. Pings display as toasts (no new world-space rendering). No solo impact.

## Global Constraints (verbatim)
- БЕЗ вільного тексту — лише 5 фіксованих фраз. Без голосу/приватних повідомлень.
- Пінги ТІЛЬКИ як тости (наявна система) — БЕЗ нового 3D-рендеру, БЕЗ нових постійних HUD-елементів (тригер = наявний `#coop-room` + клавіша + модальний оверлей).
- `PROTO_VERSION` 3→4 (новий формат повідомлень). version-sync.mjs лише перевіряє, що PROTO існує — бамп безпечний. APP_VERSION звіряється при вході в кімнату → змішаних білдів у кімнаті не буде.
- Анти-спам: кулдаун на sendPing (≥1.2с).
- i18n: нові рядки через `t('…')` + en/ru (Task 3). Версія 3x: v31→v32.
- Кооп-безпека: індекс пінга клампиться 0..N на хості (untrusted guest data).

## File Structure
- Modify `src/net/protocol.js`: `PROTO_VERSION = 4`.
- Modify `src/net/coop.js`: `export const PING_PHRASES`, `CoopSession.sendPing(i)` + cooldown.
- Modify `src/net/host.js`: `HostNet.hostPing(i)`, `case 'ping'` in `_onMsg`, `_showPing(pid,i)`.
- Modify `src/net/client.js`: `GuestNet.guestPing(i)`, `case 'pg'` in `_onEv`, `_showPing(pid,i)`.
- Modify `src/ui/coopui.js`: tappable `#coop-room`, `#overlay-ping` wheel wiring.
- Modify `index.html` (`#overlay-ping`), `src/main.js` (`C` key), `styles.css`, `src/i18n/*`, `version.json`, `sw.js`, `README.md`.
- Tests: `test/update-hq-m5.mjs` (2-client ping delivery — mirror `test/coop.mjs` harness).

## Verification protocol
Relay auto-spawns in coop tests. **Task 1 + Task 3 run `node test/update-hq-m5.mjs` (2-client ping delivery) + `SLOW=4 node test/coop.mjs` (no regression).** Task 2 runs `node test/_touch-stress.mjs` (HUD overlap — `#coop-room` now tappable). `node test/smoke.mjs` throughout. Pings are coop-only → solo/e2e unaffected (still run smoke).

---

## Task 1: Protocol + netcode (send/receive ping → toast)

**Files:** `src/net/protocol.js`, `src/net/coop.js`, `src/net/host.js`, `src/net/client.js`, test `test/update-hq-m5.mjs`.

**Interfaces produced:** `PING_PHRASES` (array of `{icon,text}`); `CoopSession.sendPing(index)`; `HostNet.hostPing(i)`; `GuestNet.guestPing(i)`; ping intent `{t:'ping',i}`; event `['pg', pid, i]`.

- [ ] **Step 1: `PROTO_VERSION = 4`** in `src/net/protocol.js` (update the comment: «v32: пінги»).
- [ ] **Step 2: `PING_PHRASES` + `sendPing` in `src/net/coop.js`.** Add `import { t } from '../i18n.js'` if absent. 
```js
export const PING_PHRASES = [
  { icon: '📍', text: t('Сюди!') },
  { icon: '🆘', text: t('Допоможи!') },
  { icon: '👍', text: t('Готовий!') },
  { icon: '🙏', text: t('Дякую!') },
  { icon: '🛡️', text: t('Захищаю!') },
];
```
In `CoopSession`, add:
```js
  sendPing(i) {
    i = i | 0;
    if (i < 0 || i >= PING_PHRASES.length) return;
    const now = (this.game && this.game.now ? this.game.now : Date.now());
    if (this._lastPing && now - this._lastPing < 1200) return; // анти-спам
    this._lastPing = now;
    const p = PING_PHRASES[i];
    if (this.game && this.game.hud) this.game.hud.toast(t('Ти: {p}', { p: p.icon + ' ' + p.text })); // локально
    if (this.role === 'host' && this.net && this.net.hostPing) this.net.hostPing(i);
    else if (this.role === 'guest' && this.net && this.net.guestPing) this.net.guestPing(i);
  }
```
(Use a clock the test can advance — `Date.now()` is fine; cooldown just prevents spam.)
- [ ] **Step 3: `HostNet` (`src/net/host.js`).** Add `import { PING_PHRASES } from './coop.js'` (or pass via session). Add a method + intent case:
```js
  hostPing(i) { this.ev('pg', 1, i | 0); }
  _showPing(pid, i) {
    const p = PING_PHRASES[i]; if (!p) return;
    const nick = (this.session.roster.get(pid) || {}).nick || t('Друг');
    if (this.game && this.game.hud) this.game.hud.toast(nick + ': ' + p.icon + ' ' + p.text);
  }
```
In `_onMsg` switch add: `case 'ping': { const i = d.i | 0; if (i >= 0 && i < PING_PHRASES.length) { this.ev('pg', from, i); this._showPing(from, i); } return true; }`
- [ ] **Step 4: `GuestNet` (`src/net/client.js`).** Add `import { PING_PHRASES } from './coop.js'`. Add:
```js
  guestPing(i) { this.send({ t: 'ping', i: i | 0 }); }
  _showPing(pid, i) {
    const p = PING_PHRASES[i]; if (!p) return;
    const nick = (this.session.roster.get(pid) || {}).nick || t('Друг');
    if (this.level && this.level.game && this.level.game.hud) this.level.game.hud.toast(nick + ': ' + p.icon + ' ' + p.text);
  }
```
In `_onEv` switch add: `case 'pg': { if (a[0] === me) break; this._showPing(a[0], a[1]); break; }` (`me` is the local pid already used in this switch). Confirm `t` is imported in client.js (it is).
- [ ] **Step 5: Failing test.** `test/update-hq-m5.mjs` — mirror `test/coop.mjs` harness (it spawns the dev-relay + two browser contexts; copy its setup: relay spawn, host via `__game.test.coopCreate`, guest via `coopJoin`, `coopStartLevel`, wait both in level). Then:
```js
// spy on host toasts
await hostPage.evaluate(() => { window.__pings = []; const h = window.__game.hud; const o = h.toast.bind(h); h.toast = (m) => { window.__pings.push(m); return o(m); }; });
// guest sends ping #1 (Допоможи!)
await guestPage.evaluate(() => window.__game.coop.session.sendPing(1));
const got = await waitFor(async () => {
  const arr = await hostPage.evaluate(() => window.__pings || []);
  return arr.some((m) => /Допоможи|Help|Помоги/.test(m));
}, 8000, 'host received ping toast');
check(got, 'хост отримав пінг гостя як тост');
// host sends ping, guest receives
await guestPage.evaluate(() => { window.__pings = []; const h = window.__game.hud; const o = h.toast.bind(h); h.toast = (m) => { window.__pings.push(m); return o(m); }; });
await hostPage.evaluate(() => window.__game.coop.session.sendPing(0));
const got2 = await waitFor(async () => (await guestPage.evaluate(() => window.__pings || [])).some((m) => /Сюди|Here|Сюда/.test(m)), 8000, 'guest received host ping');
check(got2, 'гість отримав пінг хоста як тост');
```
- [ ] **Step 6: RED → GREEN.** Run `node test/update-hq-m5.mjs` (RED before impl, GREEN after). Also `node test/smoke.mjs` + `SLOW=4 node test/coop.mjs` (no regression).
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(coop): безпечні пінги — протокол(4)+мережа, фрази як тости"`

---

## Task 2: Ping wheel UI (tappable #coop-room + C key + overlay)

**Files:** `index.html`, `src/ui/coopui.js`, `src/main.js`, `styles.css`, test `test/update-hq-m5.mjs`.

- [ ] **Step 1: `#overlay-ping` in `index.html`.** A small modal (mirror `#overlay-wardrobe` structure) with `<div id="ping-wheel"></div>` and a close button. Buttons are built in JS from `PING_PHRASES`.
- [ ] **Step 2: Failing test.** Append: open ping wheel, assert 5 buttons; clicking one calls `sendPing`:
```js
await hostPage.evaluate(() => window.__game.coop.openPingWheel && window.__game.coop.openPingWheel());
const n = await hostPage.evaluate(() => document.querySelectorAll('#ping-wheel .ping-btn').length);
check(n === 5, `колесо пінгів має 5 фраз (${n})`);
```
- [ ] **Step 3: coopui.js wiring.** Add `openPingWheel()` (build `#ping-wheel` buttons from `PING_PHRASES`, show `#overlay-ping`), and a click handler per button → `this.session.sendPing(i)` + hide overlay. Make `#coop-room` tappable when in a coop level: in `updateRoomChip()` (coopui.js:178) add a click listener (once) that calls `openPingWheel()`; give it `cursor:pointer` + a title `t('Пінг команді')`. Only react when `session.state === 'level'`.
- [ ] **Step 4: `C` key in `src/main.js`.** Near the `KeyB` handler (main.js:177), add: `if (e.code === 'KeyC' && this.state === 'level' && this.coop && this.coop.session.state === 'level' && !this.paused) { this.coop.openPingWheel(); }`. Ensure it doesn't fire in solo (coop check) and doesn't conflict with an existing C binding (grep first).
- [ ] **Step 5: CSS.** `.ping-btn{font-size:18px;display:block;width:100%;margin:6px 0;padding:12px;border-radius:12px;border:none;background:rgba(255,255,255,.1);cursor:pointer;text-align:left}#coop-room{cursor:pointer}`
- [ ] **Step 6: GREEN.** `node test/update-hq-m5.mjs` + `node test/_touch-stress.mjs` (HUD overlap, since `#coop-room` is now interactive) + `node test/smoke.mjs`.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(coop): колесо пінгів — тап по чипу кімнати / клавіша C"`

---

## Task 3: i18n + v32 + README + final gates

- [ ] **Step 1: i18n.** en+ru for all new keys: the 5 phrases, `Ти: {p}`, `Друг` (likely present), `Пінг команді`, ping-wheel title. No leak, `{p}` intact.
- [ ] **Step 2: version.** version.json→32; APP_VERSION→32; sw.js CACHE→`zr-cache-v32`. (No new src file → SHELL unchanged; PROTO already 4 from Task 1.)
- [ ] **Step 3: README.** `**v32 «Командні пінги»**: …` above v31 (safe quick-phrases in coop — tap the room code or press C; no free chat).
- [ ] **Step 4: Gates.** `node test/version-sync.mjs` (incl. PROTO=4 exists), `node test/i18n.mjs`, `node test/update-hq-m5.mjs`, `node test/_touch-stress.mjs`, `node test/smoke.mjs`, `SLOW=4 node test/coop.mjs`. All green; retry a flaky timing coop run once.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore(coop): i18n + бамп v32 + README (Командні пінги)"`

---

## Self-Review
- Coverage: protocol+netcode+toast (T1), wheel UI+trigger (T2), i18n/version/gates (T3).
- LOW-RISK: pings = toasts (no new rendering); trigger reuses `#coop-room` + key (no new HUD element); version gate makes PROTO bump safe (no mixed-build rooms).
- Safety: 5 fixed phrases, no free text; index clamped on host; anti-spam cooldown.
- Verified by a 2-client ping-delivery test + coop regression + _touch-stress.
