# M4 «Поклич друга» (invite link) Implementation Plan

> Execute via `superpowers:subagent-driven-development`. Builds on M1-M3 (v26-v28). Cheapest viral loop: the `?coopjoin=CODE` auto-join already works — just add a one-tap share/copy button in the lobby.

**Goal:** in the coop lobby, a «📨 Поклич друга» button generates an invite link and shares it (native share sheet on mobile, clipboard copy on desktop) so a friend joins in one tap instead of dictating a 4-letter code. Plus: an invited friend keeps their own saved nick. No protocol change, no QR (deferred), no 3D.

**Architecture:** add `#btn-coop-invite` to the lobby overlay; `CoopUI._inviteUrl(code)` builds `origin+pathname+?coopjoin=CODE`; the click handler uses `navigator.share` → `navigator.clipboard` → fallback. Tiny `_autoJoin` tweak: when the invite URL carries no `&nick`, fall back to the device's saved nick (not «Гість»).

## Global Constraints (verbatim)
- Без бандлера; без QR-бібліотек (QR відкладено). БЕЗ 3D.
- i18n: нові рядки через `t('…')` + en/ru (Task 2).
- Нуль ЗМІН ПРОТОКОЛУ: `?coopjoin` вже існує; це лише UI + URL. PROTO_VERSION не чіпати.
- Безпека: URL несе ЛИШЕ код кімнати (+ опційно нік) — нуль реального імені/гео.
- Версія 3x: v28→v29 (version.json/APP_VERSION/sw.js CACHE).

## File Structure
- Modify `index.html`: `#btn-coop-invite` inside `.lobby-code-box` (after `#lobby-code`, ~line 447).
- Modify `src/ui/coopui.js`: `invite` el + `_inviteUrl()` + click handler; `_autoJoin` nick fallback (line ~152-153).
- Modify `styles.css` (optional small style), `src/i18n/en.js`, `ru.js`, `version.json`, `src/main.js`, `sw.js` CACHE, `README.md`.
- Test: `test/update-hq-m4.mjs`.

## Verification protocol (each task)
Server :8741. `node test/update-hq-m4.mjs` + `node test/smoke.mjs`. Coop unaffected: run `node test/coop.mjs` (SLOW=4) at Task 2 to confirm no coop regression. Controller browser screenshots if preview env works; else headless+review floor.

---

## Task 1: Invite button + share/copy link + nick fallback

**Files:** `index.html`, `src/ui/coopui.js`, `styles.css`, test `test/update-hq-m4.mjs`.

**Interfaces produced:** `CoopUI._inviteUrl(code) → string`; `#btn-coop-invite`.

- [ ] **Step 1: Failing test.** `test/update-hq-m4.mjs` (mirror update4 header). Core assertions (no relay needed):
```js
console.log('▸ M4: Поклич друга');
await loadCountry('UKR');
// button exists in lobby DOM
const hasBtn = await page.evaluate(() => !!document.getElementById('btn-coop-invite'));
check(hasBtn, 'кнопка «Поклич друга» є в лобі');
// URL builder produces a ?coopjoin link to THIS origin
const url = await page.evaluate(() => window.__game.coop._inviteUrl('ABCD'));
check(/\?coopjoin=ABCD$/.test(url), `_inviteUrl будує посилання з кодом — ${url}`);
check(url.startsWith(location.origin) || url.startsWith('http'), 'посилання містить origin');
// invite handler with no active room is a safe no-op (no throw)
const safe = await page.evaluate(() => { try { window.__game.coop._shareInvite(); return 'ok'; } catch(e){ return 'throw:'+e.message; } });
check(safe === 'ok', 'клік без кімнати не падає');
```
- [ ] **Step 2: RED.** `node test/update-hq-m4.mjs` → FAIL (no button / `_inviteUrl` undefined).
- [ ] **Step 3: Lobby button (`index.html`).** Inside `.lobby-code-box` (~line 447), after `<div id="lobby-code" …>`, add:
```html
        <button id="btn-coop-invite" class="btn coop-wide">📨 Поклич друга</button>
```
- [ ] **Step 4: `coopui.js` — el + URL builder + handler.** Add `invite: $('btn-coop-invite'),` to `this.el`. Add methods:
```js
  _inviteUrl(code) {
    return location.origin + location.pathname + '?coopjoin=' + encodeURIComponent(code);
  }
  async _shareInvite() {
    const code = this.session && this.session.room;
    if (!code) return; // no room → no-op
    const url = this._inviteUrl(code);
    const text = t('Гайда грати разом проти зомбі! 🧟 Тисни — і ти в моїй грі:');
    this.game.audio.click();
    try {
      if (navigator.share) { await navigator.share({ title: t('Операція: Порятунок Світу'), text, url }); return; }
    } catch (e) { /* користувач скасував share — ок */ return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        this.game.hud.toast(t('🔗 Посилання скопійовано — надішли другу!'));
        return;
      }
    } catch (e) { /* clipboard заблоковано — покажемо посилання */ }
    this.game.hud.toast(t('🔗 Посилання: {u}', { u: url }));
  }
```
Wire in constructor (near the other lobby buttons): `this.el.invite.addEventListener('click', () => this._shareInvite());`
- [ ] **Step 5: Nick fallback in `_autoJoin` call site** (~line 152-153). Change the join branch to prefer the saved nick when URL has none:
```js
    } else if (params.get('coopjoin')) {
      this._autoJoin(params.get('coopjoin'), params.get('nick') || loadNick() || t('Гість'));
    }
```
(`loadNick` is already imported.) This keeps the invited friend's own name instead of overwriting to «Гість».
- [ ] **Step 6: GREEN.** `node test/update-hq-m4.mjs` → PASS. Then `node test/smoke.mjs`.
- [ ] **Step 7: Commit.** `git add index.html src/ui/coopui.js styles.css test/update-hq-m4.mjs && git commit -m "feat(coop): «Поклич друга» — інвайт-посилання в один тап + збереження ніка гостя"`

---

## Task 2: i18n + v29 + README + final

**Files:** `src/i18n/en.js`, `ru.js`, `version.json`, `src/main.js`, `sw.js`, `README.md`.

- [ ] **Step 1: i18n.** Add en+ru entries for new keys: `📨 Поклич друга`, `Гайда грати разом проти зомбі! 🧟 Тисни — і ти в моїй грі:`, `Операція: Порятунок Світу` (likely already present — skip if so), `🔗 Посилання скопійовано — надішли другу!`, `🔗 Посилання: {u}`. Placeholders intact, no Ukrainian leak.
- [ ] **Step 2: version.** `version.json`→29; `src/main.js` APP_VERSION→29; `sw.js` CACHE→`zr-cache-v29`. (No new src file → SHELL unchanged.)
- [ ] **Step 3: README.** `**v29 «Поклич друга»**: …` note above v28 (one tap shares an invite link; friend joins in one click).
- [ ] **Step 4: Gates.** `node test/version-check.mjs`, `node test/i18n.mjs`, `node test/update-hq-m4.mjs`, `node test/smoke.mjs`, and `SLOW=4 node test/coop.mjs` (confirm no coop regression).
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore(coop): i18n + бамп v29 + README (Поклич друга)"`

---

## Self-Review
- Coverage: invite button+link+share (T1), nick fallback (T1), i18n/version (T2).
- No protocol change (only `?coopjoin` URL, which exists). Coop test confirms no regression.
- Safety: URL carries only room code (+optional nick); share/clipboard wrapped in try/catch (cancel-safe).
- QR deferred (documented) — link share is the 80/20 viral win.
