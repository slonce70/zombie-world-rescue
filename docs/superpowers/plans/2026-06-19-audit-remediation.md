# План усунення зауважень аудиту — «Операція: Порятунок Світу»

> **Для агентів-виконавців:** ОБОВ'ЯЗКОВА ПІД-НАВИЧКА: використовуй `superpowers:subagent-driven-development` (рекомендовано) або `superpowers:executing-plans`, щоб виконувати план задача-за-задачею. Кроки позначені чекбоксами (`- [ ]`).

**Мета:** усунути 41 підтверджену + 1 спірну знахідку аудиту від 2026-06-19, не зламавши наявну поведінку гри, з пріоритетом на збереження прогресу дитини та довіру до тестів.

**Архітектура підходу:** браузерна 3D-гра на Three.js без бандлера (import-map, ES-модулі). Виправлення йдуть фазами; кожна фаза — самодостатня, окремо тестується (`node test/<file>.mjs`, статика на 8741) і може бути задеплоєна окремо. Логічні зміни — через TDD (спершу падаючий тест), косметичні/i18n/CSS — через точкові правки + перевірку.

**Стек:** Three.js (vendor), Cloudflare Worker + Durable Objects (`worker/`), dev-relay на `ws` (`relay/`), Playwright для e2e-тестів, чистий Node для гард-тестів.

## Глобальні обмеження (діють для КОЖНОЇ задачі)

- **Цільова аудиторія — 10-річна дитина.** Нічого страшного, UI українською; en/ru через `src/i18n/*.js` (ключ словника = український рядок-оригінал).
- **Версію бампати у ДВОХ місцях синхронно** при релізі: `version.json` (`v`) і `APP_VERSION` у `src/main.js`. Тест-гард: `node test/version-sync.mjs`. Наразі обидві = **23**; цей план підіймає до **24** у фінальній задачі Z1.
- **Паралельні AI-сесії в цій теці — реальність.** Перед редагуванням ПЕРЕЧИТАЙ файл (чужі зміни зберігай і зливай).
- **Пастка тестів:** упалий прогон лишає dev-relay-сироту на порту → наступні брешуть. Чистити ОКРЕМОЮ командою `pkill -f "node relay/dev-relay"`; НІКОЛИ не став `pkill -f dev-relay` на початок складеної команди (вб'є власну оболонку).
- **Headless повільніший за реальний час** (dt клампиться 0.05): таймінгові тести — через `waitFor`/стан і множник `SLOW=4`, не через реальні секунди.
- **Усе офлайн-сумісне:** жодних нових зовнішніх залежностей у клієнт; Three.js лишається з `vendor/`.
- **Перед стартом:** прогнати базову батарею, щоб мати зелений вихідний стан (задача S0).

---

## Карта файлів (що створюємо / змінюємо)

**Створюємо:**
- `test/save-migration.mjs` — гард міграції сейва (фаза A).
- `test/_relay.mjs` — спільний помічник `spawnRelay(port)` з перевіркою живості (фаза B).
- `test/worker-limits.mjs` — гард rate-limit воркера через `unstable_dev` Wrangler (фаза C) **або** чистий unit на функціях-лімітерах (див. C1).

**Змінюємо (за фазами):**
- A: `src/net/cloudsave.js`, `src/main.js`, `src/ui/saveui.js`
- B: `relay/dev-relay.mjs`, `test/coop.mjs`, `test/coop3.mjs`, `test/coop6.mjs`, `test/cloudsave.mjs`, `test/relay-reconnect.mjs`, `test/coop7.mjs`, `test/i18n.mjs`, `.github/workflows/tests.yml`
- C: `worker/relay-worker.js`
- D: `src/net/host.js`, `src/net/client.js`
- E: `src/zombies.js`, `src/hud.js`, `src/net/client.js`, `src/net/coop.js`, `src/net/remoteplayer.js`, `src/net/league.js`, `src/net/lobby.js`, `src/i18n/en.js`, `src/i18n/ru.js`
- F: `src/zombies.js`, `src/missionpool.js`, `src/main.js`, `src/extras.js`
- G: `src/main.js`, `src/hud.js`, `index.html`, `styles.css`
- H (необов'язково): `src/world.js`, `src/utils.js`, `src/effects.js`
- I (необов'язково): `sw.js`, `manifest.json`, `test/version-sync.mjs`, `src/world.js`
- Z: `version.json`, `src/main.js`, `README.md`

---

## S0. Базова лінія (виконати ПЕРШИМ)

- [ ] **Крок 1: гілка під роботу**

```bash
cd "/Users/trend/Documents/Владос/claude"
git checkout -b audit-remediation-v24
```

- [ ] **Крок 2: миттєві гард-тести (без браузера)**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null; node test/version-sync.mjs
```
Очікувано: `🎉 ВЕРСІЇ СИНХРОНІЗОВАНІ`, exit 0.

- [ ] **Крок 3: швидкий e2e як орієнтир (потрібна статика)**

```bash
python3 -m http.server 8741 >/tmp/srv.log 2>&1 &  echo $! >/tmp/srv.pid
sleep 1; SLOW=4 node test/smoke.mjs; node test/i18n.mjs
```
Очікувано: обидва зелені. Лишай сервер 8741 піднятим на весь сеанс (зупиниш у Z3).

---

# ФАЗА A — Збереження прогресу дитини (ПРІОРИТЕТ 1)

Найцінніший кластер: облачний сейв не повинен мовчки втрачати прогрес, а найвідповідальніший код (міграція) має бути покритий тестом.

## A1. Хмарний сейв: «найновіше перемагає» за серверним ts (HIGH)

**Files:**
- Modify: `src/net/cloudsave.js` (`push` ~35-46, `bootSync` ~102-110)
- Modify: `src/main.js` (`_newSave` ~320-326)

**Interfaces:**
- Produces: `save.cloudTs:number` — серверний `ts` останнього УСПІШНОГО пушу з ЦЬОГО пристрою. `bootSync()` порівнює `cloud.ts` з `save.cloudTs` (серверний-час vs серверний-час, без розсинхрону годинників між пристроями).

- [ ] **Крок 1: додати поле `cloudTs` у дефолтний сейв**

У `src/main.js`, `_newSave()` (рядок ~324-325), додати поле в останній об'єкт:
```js
      missionRuns: {}, kidMode: null, cloudTs: 0,
```

- [ ] **Крок 2: `push()` зберігає серверний ts назад у сейв**

У `src/net/cloudsave.js` замінити тіло `push()` (рядки 35-46):
```js
  async push() {
    if (!this.enabled) return false;
    try {
      const res = await fetch(`${apiBase()}/save/put`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: ensureCid(this.game), data: JSON.stringify(this.game.save) }),
      });
      if (res.ok) {
        this.lastOkTs = Date.now();
        // запам'ятовуємо серверний ts цього сейва: bootSync порівнюватиме його з хмарним
        const j = await res.json().catch(() => null);
        if (j && j.ts) {
          this.game.save.cloudTs = j.ts;
          try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.save)); } catch (e) { /* ignore */ }
        }
        return true;
      }
    } catch (e) { /* офлайн — нічого страшного */ }
    return false;
  }
```

- [ ] **Крок 3: `bootSync()` — порівняння версій, без сліпого перезапису**

Замінити `bootSync()` (рядки 102-110):
```js
  // на старті: узгоджуємо локальний і хмарний сейви БЕЗ втрати новішого прогресу.
  // Правило: якщо хмара має прогрес, записаний ПІЗНІШЕ за наш останній пуш (cloud.ts > save.cloudTs),
  // беремо хмару; інакше пушимо локальний. Так старий пристрій не затирає свіжий прогрес.
  async bootSync() {
    if (!this.enabled) return;
    const local = this.game.save;
    const localHas = saveHasProgress(local);
    const cloud = await this.pull();
    let cloudObj = null;
    if (cloud && cloud.data) { try { cloudObj = JSON.parse(cloud.data); } catch (e) { /* битий хмарний */ } }
    const cloudHas = cloudObj && saveHasProgress(cloudObj);
    if (!cloudHas) { if (localHas) this.push(); return; }   // у хмарі порожньо → пушимо своє
    if (!localHas) { this.adopt(cloud.data); return; }      // локально порожньо → беремо хмару
    // обидва мають прогрес: вирішує серверний час
    if ((cloud.ts | 0) > (local.cloudTs | 0)) this.adopt(cloud.data); // хмара новіша за наш останній пуш
    else this.push();                                                  // ми не старіші → пушимо своє
  }
```

- [ ] **Крок 4: ручна перевірка логіки (sanity, без серверного хука)**

Швидкий чистий unit на чистій функції рішення немає сенсу (логіка зав'язана на fetch). Перевір вручну сценарій із аудиту в DevTools після деплою dev-relay: пристрій-А пушить (cloudTs росте) → пристрій-Б зі старим `cloudTs` на boot ОТРИМУЄ хмару А, а не затирає. Прогон інтеграційного `cloudsave.mjs` (задача A-перевірка нижче) має лишатись зеленим.

- [ ] **Крок 5: регрес наявного хмарного тесту**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null; node test/cloudsave.mjs
```
Очікувано: усі пункти зелені (А→код→Б, bootSync, файл, краш-екран) — нова логіка сумісна, бо тести пишуть свіжі сейви.

- [ ] **Крок 6: коміт**

```bash
git add src/net/cloudsave.js src/main.js
git commit -m "🛡️ cloudsave: newest-wins за серверним ts — стоп сліпому затиранню прогресу (audit A1)"
```

## A2. Тест міграції `_loadSave` (HIGH) — найвідповідальніший непокритий код

**Files:**
- Create: `test/save-migration.mjs`

**Interfaces:**
- Consumes: `window.__game.save` після завантаження; ін'єкція `localStorage['zr-save-v1']` ДО `page.goto`.

- [ ] **Крок 1: написати падаючий тест-гард**

Створити `test/save-migration.mjs`:
```js
// Гард міграції сейва: найвідповідальніший шлях (втрата прогресу дитини).
// Перевіряємо, що historичні/биті форми сейва не кидають винятку і коректно
// мігрують. Потрібна статика на 8741.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader'] });
let failed = 0;
const check = (cond, msg) => { console.log(cond ? '  ✅' : '  ❌', msg); if (!cond) failed++; };

async function loadWith(raw) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  // ?test вимикає хмару/перевірку версій; ставимо сейв ДО завантаження модулів гри
  await page.addInitScript((r) => { try { localStorage.setItem('zr-save-v1', r); } catch (e) {} }, raw);
  await page.goto('http://localhost:8741/?test&fresh=0');
  await page.waitForFunction(() => window.__game && window.__game.state === 'globe', { timeout: 15000 });
  const save = await page.evaluate(() => window.__game.save);
  await page.close();
  return { save, errs };
}

// 1. Легасі-гаджети (заряди → відкриття назавжди)
{
  const { save, errs } = await loadWith(JSON.stringify({
    liberated: { UKR: true }, weapons: ['pistol'], gadgets: { tramp: 2, wall: 1 },
  }));
  check(errs.length === 0, `легасі-гаджети: без винятків (${errs[0] || 'ok'})`);
  check(Array.isArray(save.gadgetsOwned) && save.gadgetsOwned.includes('tramp') && save.gadgetsOwned.includes('wall'),
    'легасі-гаджети: tramp+wall перенесено у gadgetsOwned');
  check(save.gadgets === undefined, 'легасі-гаджети: старе поле gadgets видалено');
}

// 2. Сейв без weapons + зі звільненими країнами → зброя бекфілиться
{
  const { save, errs } = await loadWith(JSON.stringify({ liberated: { UKR: true, POL: true } }));
  check(errs.length === 0, `без weapons: без винятків (${errs[0] || 'ok'})`);
  check(Array.isArray(save.weapons) && save.weapons.length > 0 && !save.weapons.includes(undefined),
    'без weapons: масив зброї заповнено, без undefined');
}

// 3. Зіпсований (не-JSON) сейв → гра стартує на дефолтах, без краша
{
  const { save, errs } = await loadWith('{ це не json');
  check(errs.length === 0, `битий JSON: без винятків (${errs[0] || 'ok'})`);
  check(typeof save.coins === 'number' && isFinite(save.coins), 'битий JSON: coins — скінченне число');
  check(Array.isArray(save.weapons) && save.weapons.includes('pistol'), 'битий JSON: дефолтна зброя pistol');
}

// 4. Порожній об'єкт → повні дефолти
{
  const { save, errs } = await loadWith('{}');
  check(errs.length === 0, `порожній {}: без винятків (${errs[0] || 'ok'})`);
  check(save.activeSkin === 'classic' && Array.isArray(save.skins), 'порожній {}: дефолти скінів на місці');
}

await browser.close();
console.log(failed === 0 ? '\n🎉 МІГРАЦІЯ СЕЙВА НАДІЙНА' : `\n❌ МІГРАЦІЯ: ${failed} провалів`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Крок 2: запустити — має ПРОЙТИ (код уже надійний)**

```bash
node test/save-migration.mjs
```
Очікувано: `🎉 МІГРАЦІЯ СЕЙВА НАДІЙНА`. Якщо щось червоне — це РЕАЛЬНИЙ баг міграції; зафіксуй і виправ у `src/main.js _loadSave` перед продовженням (тест писався як гард, не як демонстрація поломки).

- [ ] **Крок 3: коміт**

```bash
git add test/save-migration.mjs
git commit -m "✅ тест-гард міграції сейва: легасі-гаджети/без-weapons/битий/порожній (audit A2)"
```

## A3. Флаш хмарного пушу при закритті вкладки (MEDIUM)

**Files:**
- Modify: `src/net/cloudsave.js` (конструктор ~21-27)

- [ ] **Крок 1: при `pagehide`/прихованні вкладки — негайний пуш**

У `src/net/cloudsave.js`, наприкінці `constructor` (після `this._timer = null;`, рядок 26) додати:
```js
    // дебаунс 25с не встигає при швидкому закритті вкладки → флашимо стан при відході зі сторінки,
    // щоб остання нагорода не загубилась при переході телефон↔планшет
    if (typeof addEventListener === 'function') {
      const flush = () => {
        if (!this.enabled) return;
        clearTimeout(this._timer);
        try {
          const body = JSON.stringify({ cid: ensureCid(this.game), data: JSON.stringify(this.game.save) });
          if (navigator.sendBeacon) navigator.sendBeacon(`${apiBase()}/save/put`, new Blob([body], { type: 'application/json' }));
          else this.push();
        } catch (e) { /* ignore */ }
      };
      addEventListener('pagehide', flush);
      addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
```

- [ ] **Крок 2: перевірка не-регресу**

```bash
node test/cloudsave.mjs
```
Очікувано: зелено (новий слухач не заважає наявним сценаріям; sendBeacon у Playwright-середовищі ловиться сервером або тихо ігнорується).

- [ ] **Крок 3: коміт**

```bash
git add src/net/cloudsave.js
git commit -m "💾 cloudsave: флаш стану через sendBeacon на pagehide/hidden (audit A3)"
```

## A4. `adopt()` не приймає сейв без прогресу (LOW)

**Files:**
- Modify: `src/net/cloudsave.js` (`adopt` ~89-99)

- [ ] **Крок 1: відмова на порожній/безпрогресний блоб, коли локально Є прогрес**

Замінити перевірку всередині `adopt()` (рядок 92) з:
```js
      if (!s || typeof s !== 'object') return false;
```
на:
```js
      if (!s || typeof s !== 'object') return false;
      // захист від випадкового імпорту порожнього/обрізаного файлу поверх реального прогресу
      if (!saveHasProgress(s) && saveHasProgress(this.game.save)) return false;
```

- [ ] **Крок 2: перевірка**

```bash
node test/cloudsave.mjs
```
Очікувано: зелено (тест адоптує сейв ІЗ прогресом — проходить; нова гілка ріже лише порожні).

- [ ] **Крок 3: коміт**

```bash
git add src/net/cloudsave.js
git commit -m "💾 adopt(): не затирати реальний прогрес порожнім імпортом (audit A4)"
```

## A5. Сигнал при відмові localStorage (LOW)

**Files:**
- Modify: `src/main.js` (`saveGame` ~373-376)

- [ ] **Крок 1: одноразовий тост, якщо запис у localStorage падає**

Замінити `saveGame()` (рядки 373-376):
```js
  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (e) {
      // Safari Private Mode / заблокований сторедж: попереджаємо РАЗ, щоб дитина встигла експортувати
      if (!this._storageWarned) {
        this._storageWarned = true;
        if (this.hud) this.hud.toast(t('⚠️ Браузер не зберігає прогрес — увімкни звичайний режим або експортуй файл'));
      }
    }
    if (this.cloud) this.cloud.schedulePush();
  }
```

- [ ] **Крок 2: додати ключ у словники** (виконується разом із фазою E; тимчасово рядок впаде у фолбек-укр, що прийнятно)

- [ ] **Крок 3: smoke не зламано**

```bash
node test/smoke.mjs
```
Очікувано: зелено.

- [ ] **Крок 4: коміт**

```bash
git add src/main.js
git commit -m "💾 saveGame: одноразове попередження при заблокованому localStorage (audit A5)"
```

---

# ФАЗА B — Довіра до тестів і CI (ПРІОРИТЕТ 1)

## B1. dev-relay не може мовчки впасти; тести перевіряють, що говорять зі СВОЇМ реле (HIGH)

**Files:**
- Modify: `relay/dev-relay.mjs` (createServer ~103, listen ~211)
- Create: `test/_relay.mjs`
- Modify: `test/cloudsave.mjs`, `test/coop.mjs`, `test/coop3.mjs`, `test/coop6.mjs`, `test/relay-reconnect.mjs`

**Interfaces:**
- Produces: `spawnRelay(port, opts?) → Promise<ChildProcess>` — спавнить dev-relay, чекає, ПЕРЕВІРЯЄ що дочірній процес живий і що `/health` повертає унікальний boot-токен ЦЬОГО процесу (інакше кидає — отже, на порту сидить сирота зі старим кодом). Кидає → тест падає замість брехливого зеленого.

- [ ] **Крок 1: dev-relay — обробник помилки listen + `/health` із токеном**

У `relay/dev-relay.mjs` одразу після рядка `const PORT = parseInt(...)` (рядок 12) додати:
```js
const BOOT_TOKEN = `${process.pid}-${Date.now().toString(36)}`;
```
У HTTP-обробнику `createServer((req,res)=>{...})` (рядок 103) додати найпершою гілкою (до решти роутів):
```js
  if (req.url && req.url.startsWith('/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true, pid: process.pid, boot: BOOT_TOKEN }));
    return;
  }
```
Замінити рядок `httpServer.listen(PORT);` (рядок 211) на:
```js
httpServer.on('error', (e) => {
  console.error('[relay] listen FAILED', e && e.code || e);
  process.exit(1); // напр. EADDRINUSE: не лишаємо тести підключатися до сироти
});
httpServer.listen(PORT, () => console.log(`[relay] BOOT ${BOOT_TOKEN}`));
```

- [ ] **Крок 2: спільний помічник `test/_relay.mjs`**

```js
// Спільний спавн dev-relay із перевіркою, що тест говорить зі СВОЇМ процесом,
// а не з осиротілим реле зі старим кодом на тому ж порту.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function spawnRelay(port, { quiet = true } = {}) {
  const relay = spawn('node', ['relay/dev-relay.mjs'], {
    cwd: root, env: { ...process.env, PORT: String(port) },
    stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit',
  });
  let exited = null;
  relay.on('exit', (code) => { exited = code == null ? 0 : code; });
  // даємо час на bind, потім перевіряємо живість і токен
  for (let i = 0; i < 30 && exited === null; i++) {
    await sleep(100);
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      if (r.ok) {
        const j = await r.json();
        relay._bootToken = j.boot;
        return relay; // наш процес відповів — усе гаразд
      }
    } catch (e) { /* ще не піднявся */ }
  }
  if (exited !== null) { throw new Error(`[relay] процес вийшов з кодом ${exited} (порт ${port} зайнятий сиротою?)`); }
  relay.kill(); throw new Error(`[relay] не відповів на /health за 3с (порт ${port})`);
}
```

- [ ] **Крок 3: мігрувати тести на помічник (по одному файлу)**

Для КОЖНОГО з `test/cloudsave.mjs`, `test/coop.mjs`, `test/coop3.mjs`, `test/coop6.mjs`, `test/relay-reconnect.mjs`:
1. Перечитай поточний блок спавну (`grep -n "dev-relay" test/<file>.mjs`) — там зараз `spawn('node', ['relay/dev-relay.mjs'], ...)` + `await sleep(600)`.
2. Додай імпорт угорі: `import { spawnRelay } from './_relay.mjs';`
3. Заміни блок `const relay = spawn(...); ... await sleep(600);` на `const relay = await spawnRelay(RELAY_PORT);` (зберігши наявне ім'я змінної порту у файлі).
4. Лиши наявний `relay.kill()` у teardown без змін.

- [ ] **Крок 4: прогнати мігровані тести (на чистому порту)**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null
node test/cloudsave.mjs && node test/relay-reconnect.mjs
SLOW=4 node test/coop.mjs
```
Очікувано: усі зелені. Контроль негативу: запусти `node relay/dev-relay.mjs` вручну на 8753, потім `node test/cloudsave.mjs` — тепер тест має ВПАСТИ з «процес вийшов… сиротою», а не «пройти». Прибери ручне реле після перевірки.

- [ ] **Крок 5: коміт**

```bash
git add relay/dev-relay.mjs test/_relay.mjs test/cloudsave.mjs test/coop.mjs test/coop3.mjs test/coop6.mjs test/relay-reconnect.mjs
git commit -m "✅ dev-relay /health+boot-token + spawnRelay(): кінець брехливим зеленим на сироті (audit B1)"
```

## B2. Прибрати дубль порту 8753 (LOW / спірне)

**Files:**
- Modify: `test/coop7.mjs` (рядок 9)

- [ ] **Крок 1: змінити порт coop7 на вільний**

У `test/coop7.mjs` рядок `const RELAY_PORT = 8753;` → `const RELAY_PORT = 8754;`

- [ ] **Крок 2: перевірка + коміт**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null; SLOW=4 node test/coop7.mjs
git add test/coop7.mjs && git commit -m "✅ coop7: унікальний порт 8754 (прибрати дубль 8753) (audit B2)"
```

## B3. Розширений неблокуючий CI-джоб для непокритих тестів (MEDIUM)

**Files:**
- Modify: `.github/workflows/tests.yml`

- [ ] **Крок 1: додати джоб `extended` (видимий сигнал, не валить деплой)**

У `.github/workflows/tests.yml` після джоба `e2e` додати новий джоб (рівень відступу як у `coop:`):
```yaml
  # 🧪 розширена батарея: update*/campaign/maps/replay/terrain — НЕ блокує деплой
  # (як coop), але червоніє в Actions при регресії квестів/Шторму/гаджетів/карт.
  extended:
    runs-on: ubuntu-latest
    timeout-minutes: 50
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - name: Start static server
        run: python3 -m http.server 8741 &
      - name: Save migration guard
        run: node test/save-migration.mjs
      - name: Extended battery
        run: |
          for t in update2 update3 update4 update5 update6 update8 update9 update10 update11 campaign maps flows replay terrain-geometry; do
            echo "=== $t ==="; SLOW=4 node test/$t.mjs || exit 1
          done
```

- [ ] **Крок 2: локальна перевірка YAML і кількох тестів із батареї**

```bash
node -e "const y=require('fs').readFileSync('.github/workflows/tests.yml','utf8'); console.log(/extended:/.test(y)?'job present':'MISSING')"
SLOW=4 node test/update4.mjs && SLOW=4 node test/maps.mjs
```
Очікувано: `job present`; тести зелені.

- [ ] **Крок 3: коміт**

```bash
git add .github/workflows/tests.yml
git commit -m "🤝 CI: розширений неблокуючий джоб (update*/campaign/maps/migration) — видимий сигнал (audit B3)"
```

## B4. Coop-джоб: відрізняти таймаут-флейк від реальної поломки (MEDIUM)

**Files:**
- Modify: `.github/workflows/tests.yml` (coop job)

> Контекст: `continue-on-error: true` глушить УСІ падіння. Робимо так, щоб таймаут-флейк (тротлінг гостя на free-runner) залишався неблокуючим, а ассерт-провал — видимим окремим кроком.

- [ ] **Крок 1: винести «жорсткий» ассерт-гард у блокуючий крок**

Найпрагматичніше без перебудови тестів: лишити `coop` неблокуючим, але додати у джоб `smoke` (блокуючий) швидкий кооп-гард, що НЕ залежить від throttled-гостя — `test/relay-reconnect.mjs` уже там; додати `test/coop6.mjs` лише якщо він стабільно вкладається. Якщо ні — лишити коментар-пояснення у YAML, що `coop` свідомо неблокуючий, і покладатись на локальний прогон + B1 (тепер кооп-тести не брешуть на сироті). Рішення зафіксувати коментарем у файлі:
```yaml
    # continue-on-error лишається: free-runner тротлить гостя і дає таймаут-флейк.
    # Реальні регресії ловляться локально (SLOW=4) + B1 (тести більше не «зеленіють» на сироті).
```

- [ ] **Крок 2: коміт**

```bash
git add .github/workflows/tests.yml
git commit -m "🤝 CI: задокументувати межі coop-джоба після B1 (audit B4)"
```

## B5. Послабити крихкі точні рядки в i18n-тесті (LOW)

**Files:**
- Modify: `test/i18n.mjs` (рядки 20, 34-36, 53-54)

- [ ] **Крок 1: замінити `===` на структурні перевірки**

Замінити 6 точних рівностей (напр. `txt.play === '🎮 ГРАТИ'`) на перевірку «перекладено й відрізняється від укр-оригіналу», напр.:
```js
check(txt.play.includes('PLAY'), `EN: кнопка ГРАТИ → ${txt.play}`);
check(txt.play !== uk.play, 'EN: текст відрізняється від української');
```
(адаптуй під наявні змінні у файлі; лиши щонайбільше 1 канарковий точний рядок на мову).

- [ ] **Крок 2: перевірка + коміт**

```bash
node test/i18n.mjs
git add test/i18n.mjs && git commit -m "✅ i18n-тест: структурні перевірки замість крихких точних рядків (audit B5)"
```

---

# ФАЗА C — Безпека воркера (MEDIUM)

> Деплой воркера окремий: `cd worker && npx wrangler deploy`. Зміни тут НЕ впливають на гру-клієнт; тестуються локально через `wrangler dev`/`unstable_dev` або ревʼю коду.

## C1. Per-IP ліміт + стеля рядків на `/league/submit`

**Files:**
- Modify: `worker/relay-worker.js` (`League` ~480-564)

- [ ] **Крок 1: лімітер за IP (дзеркало `_pingAllowed`/`_claimAllowed`)**

У конструкторі `League` (після `this._lastSubmit = new Map();`, рядок 490) додати:
```js
    this._subIp = new Map(); // ip -> {n,t0}
```
Додати метод у клас `League` (поруч із `json`):
```js
  _ipAllowed(ip) {
    const now = Date.now();
    let r = this._subIp.get(ip);
    if (!r || now - r.t0 > 60_000) { r = { n: 0, t0: now }; this._subIp.set(ip, r); }
    if (this._subIp.size > 2000) this._subIp.clear();
    return ++r.n <= 20; // 20 сабмітів/хв/IP
  }
```
У `fetch()` гілці `/league/submit` (рядок 506-508) передати IP і перевірити:
```js
      if (url.pathname === '/league/submit' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'x';
        if (!this._ipAllowed(ip)) return this.json({ error: 'rate' }, 429);
        return this.submit(await request.json());
      }
```

- [ ] **Крок 2: стеля рядків per (mode,country) — показуємо лише топ-50**

Наприкінці `submit()`, ПЕРЕД `return this.rankResponse(...)` (рядок 563), додати прибирання найгірших понад розумну стелю:
```js
    // показуємо лише топ-50 → тримаємо щонайбільше 500 на (mode,country), решту прибираємо
    const ord = MODES[mode] === 'desc' ? 'DESC' : 'ASC';
    const cnt = this.sql.exec('SELECT COUNT(*) AS n FROM entries WHERE mode = ? AND country = ?', mode, country).toArray();
    if ((cnt[0].n | 0) > 500) {
      this.sql.exec(
        `DELETE FROM entries WHERE mode = ? AND country = ? AND cid IN (
           SELECT cid FROM entries WHERE mode = ? AND country = ? ORDER BY score ${ord} LIMIT -1 OFFSET 500)`,
        mode, country, mode, country
      );
    }
```

- [ ] **Крок 3: перевірка (локально через wrangler dev або ревʼю)**

```bash
cd worker && npx wrangler deploy --dry-run 2>&1 | tail -5
```
Очікувано: бандл збирається без помилок. (Повний інтеграційний — за бажанням через `unstable_dev`.)

- [ ] **Крок 4: коміт**

```bash
git add worker/relay-worker.js
git commit -m "🔒 worker: per-IP ліміт + стеля рядків на /league/submit (audit C1)"
```

## C2. Per-IP ліміт на `/save/put`

**Files:**
- Modify: `worker/relay-worker.js` (`SaveVault` ~365-422)

- [ ] **Крок 1: лімітер за IP у SaveVault**

У конструкторі `SaveVault` (після `this._claims = new Map();`, рядок 376) додати:
```js
    this._putIp = new Map(); // ip -> {n,t0}
```
Додати метод (поруч із `_claimAllowed`):
```js
  _putAllowed(ip) {
    const now = Date.now();
    let r = this._putIp.get(ip);
    if (!r || now - r.t0 > 60_000) { r = { n: 0, t0: now }; this._putIp.set(ip, r); }
    if (this._putIp.size > 2000) this._putIp.clear();
    return ++r.n <= 30; // 30 збережень/хв/IP (норм клієнт пушить раз на 25с)
  }
```
У гілці `/save/put` (рядок 407), першим рядком тіла `if`:
```js
      if (url.pathname === '/save/put' && request.method === 'POST') {
        const ip = request.headers.get('CF-Connecting-IP') || 'x';
        if (!this._putAllowed(ip)) return this.json({ error: 'rate' }, 429);
        const d = await request.json();
```

- [ ] **Крок 2: перевірка збірки + коміт**

```bash
cd worker && npx wrangler deploy --dry-run 2>&1 | tail -5
git add worker/relay-worker.js
git commit -m "🔒 worker: per-IP ліміт на /save/put — стоп неаутентифікованому росту сховища (audit C2)"
```

## C3. Стеля тіла POST — перевіряти РОЗПАРСЕНЕ тіло, не лише Content-Length (LOW)

**Files:**
- Modify: `worker/relay-worker.js` (`Lobby.fetch` ~307, `League.fetch` ~507)

- [ ] **Крок 1: читати текст і міряти фактичну довжину перед JSON.parse**

У `Lobby` `/lobby/ping` і `League` `/league/submit` замінити `await request.json()` на:
```js
        const _raw = await request.text();
        if (_raw.length > MAX_BODY_BYTES) return this.json({ error: 'big' }, 413);
        const d = JSON.parse(_raw);
```
(`/save/put` уже має пост-перевірку `data.length` — лишити як є.)

- [ ] **Крок 2: збірка + коміт**

```bash
cd worker && npx wrangler deploy --dry-run 2>&1 | tail -5
git add worker/relay-worker.js
git commit -m "🔒 worker: межа тіла за фактичним розміром, не за Content-Length (audit C3)"
```

---

# ФАЗА D — Коректність мережі/кооперативу

## D1. Терминальний стан рану — durable-флаг у снапшоті (MEDIUM)

**Files:**
- Modify: `src/net/host.js` (snapshot/captureState + update ~360-372)
- Modify: `src/net/client.js` (_applyState / _applySnapshot)

**Interfaces:**
- Produces: у снапшоті Шторму/Арени з'являється поле `over: 0|1`. Гість, що пропустив одноразову подію `stormend/arenaend/vict`, сходиться до фінального екрана з НАСТУПНОГО снапшоту.

- [ ] **Крок 1: хост кладе `over` у снапшот run-стану**

У `src/net/host.js`, у методі, що будує снапшот Шторму/Арени (`_snapshot`, масиви `st`/`br`, ~423-430), додати ознаку завершення поряд із radius/phase/wave, напр. поле `o: run.over ? 1 : 0`. (Перечитай точну форму tuple у `_snapshot` і додай елемент; синхронно онови читання в client.)

- [ ] **Крок 2: гість застосовує `over` ідемпотентно**

У `src/net/client.js`, де застосовується снапшот Шторму/Арени, якщо `o===1` і фінал ще не показано — викликати відповідний `game._endStormRun()/_endArenaRun()` (одноразово, через прапорець `this._endedRun`).

- [ ] **Крок 3: перевірка кооп-Шторму**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null; SLOW=4 node test/coop5.mjs
```
Очікувано: зелено.

- [ ] **Крок 4: коміт**

```bash
git add src/net/host.js src/net/client.js
git commit -m "🤝 net: durable-флаг over у снапшоті рану — гість не застрягає у фіналі (audit D1)"
```

## D2. Хост перевіряє дистанцію пострілів гостя (MEDIUM)

**Files:**
- Modify: `src/net/host.js` (`_onShot` ~196-216)

- [ ] **Крок 1: ігнорувати влучання поза розумним радіусом від гостя**

У `_onShot`, у циклі по `d.hits` (рядок ~199), перед `zb.damage(...)` додати гейт за позицією гостя `rp`:
```js
        if (rp) {
          const far = Math.hypot(zb.x - rp.pos.x, zb.z - rp.pos.z);
          if (far > 90) continue; // далі за будь-яку зброю+запас — це не легітимний постріл
        }
```
Аналогічно для `d.bar` (бочки) і `d.wl` (стіни): пропускати ціль, якщо `rp` є і дистанція від `rp.pos` до бочки/стіни > 90.

- [ ] **Крок 2: перевірка кооп-бою**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null; SLOW=4 node test/coop.mjs
```
Очікувано: зелено (легітимні постріли в межах радіуса).

- [ ] **Крок 3: коміт**

```bash
git add src/net/host.js
git commit -m "🤝 net: гейт дистанції на влучання/бочки/стіни гостя — стоп griefing по всій карті (audit D2)"
```

## D3. Реанімація лише зблизька (LOW) + D4. Виключити «привидів» із all-down (LOW)

**Files:**
- Modify: `src/net/host.js` (`revdone` ~158-171, update all-down ~362-365)

- [ ] **Крок 1: перевірка близькості при `revdone`**

У гілці `case 'revdone'`, у `else`-вітці (target ≠ 1), перед `send(...,'revived')` додати:
```js
          const reviver = this.remotes.get(from);
          if (reviver && trp && Math.hypot(reviver.pos.x - trp.pos.x, reviver.pos.z - trp.pos.z) > 3) return true;
```

- [ ] **Крок 2: all-down ігнорує «завислих» гостей**

У перевірці `allDown` (рядок 363) замінити `.every((p) => p.health <= 0)` на варіант, що рахує лише «свіжих» гравців: гість вважається активним, якщо це хост-проксі або його `performance.now() - rp._lastP < 8000`. Реалізація: фільтруй `level.players` від віддалених, чия остання позиція старіша за 8с, перед `.every(...)`. (Перечитай, як `RemotePlayer` зберігає час останнього пакета — поле `_lastP`; якщо назва інша, використай наявну.)

- [ ] **Крок 3: перевірка + коміт**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null; SLOW=4 node test/coop4.mjs && SLOW=4 node test/coop5.mjs
git add src/net/host.js
git commit -m "🤝 net: реанімація зблизька + all-down ігнорує завислих гостей (audit D3+D4)"
```

---

# ФАЗА E — Повнота локалізації (MEDIUM)

> Ключ словника = український рядок-оригінал. Кожен новий рядок → додати в `src/i18n/en.js` І `src/i18n/ru.js` (en/ru мусять лишатись у синхроні — це перевіряє наявна логіка; тримай рівну кількість ключів).

## E1. `zombies.js` — 5 хардкод-тостів українською

**Files:**
- Modify: `src/zombies.js` (імпорти ~5, тости 371/406/485/486/602)
- Modify: `src/i18n/en.js`, `src/i18n/ru.js`

- [ ] **Крок 1: імпорт `t`**

У `src/zombies.js` після рядка 5 (`import { clamp, damp, ... } from './utils.js';`) додати:
```js
import { t } from './i18n.js';
```

- [ ] **Крок 2: обгорнути 5 тостів у `t()`** (рядки 371, 406, 485, 486, 602) — кожен `'...'` → `t('...')`, напр.:
```js
          level.bus.emit('toast', t('🛡 Ого, щит! Розстріляй його (дивись на тріщини) або обійди ззаду!'));
```

- [ ] **Крок 3: додати 5 ключів у `en.js` і `ru.js`**

У `src/i18n/en.js` (перед закриваючим `};`) додати рядки (приклад EN; для RU — російські відповідники):
```js
"🛡 Ого, щит! Розстріляй його (дивись на тріщини) або обійди ззаду!": "🛡 Whoa, a shield! Shoot the cracks or go around the back!",
"🦾 Броньовик! Нагрудник не проб'єш — цілься в ГОЛОВУ!": "🦾 Armored! Can't pierce the plate — aim for the HEAD!",
"🏆 ЗОЛОТИЙ ЗОМБІ! ДЖЕКПОТ +144 монети!": "🏆 GOLDEN ZOMBIE! JACKPOT +144 coins!",
"🏆 ЗОЛОТОГО ЗОМБІ ВПІЙМАНО! Монети сиплються — розбирайте!": "🏆 GOLDEN ZOMBIE CAUGHT! Coins everywhere — grab them!",
"😱 СЮРПРИЗ! У будинку ховався зомбі!": "😱 SURPRISE! A zombie was hiding in the house!",
```

- [ ] **Крок 4: перевірка**

```bash
node test/i18n.mjs
```
Очікувано: зелено, en/ru у синхроні.

- [ ] **Крок 5: коміт**

```bash
git add src/zombies.js src/i18n/en.js src/i18n/ru.js
git commit -m "🌍 i18n: 5 навчальних тостів zombies.js через t() + ключі en/ru (audit E1)"
```

## E2. Назва зброї в HUD

**Files:**
- Modify: `src/hud.js` (рядок 181)
- Modify: `src/i18n/en.js`, `src/i18n/ru.js`

- [ ] **Крок 1: обгорнути назву у `t()`**

`src/hud.js` рядок 181:
```js
    this.el.weaponName.textContent = `${p.weapon.icon} ${t(p.weapon.name)}`;
```

- [ ] **Крок 2: додати 4 базові назви** (Швидкостріл/Магнум/Снайперка вже є) у `en.js`/`ru.js`:
```js
"Пістолет": "Pistol",
"Автомат": "Rifle",
"Дробовик": "Shotgun",
"Базука": "Bazooka",
```

- [ ] **Крок 3: перевірка + коміт**

```bash
node test/i18n.mjs && node test/smoke.mjs
git add src/hud.js src/i18n/en.js src/i18n/ru.js
git commit -m "🌍 i18n: назва зброї в HUD через t() + базові назви en/ru (audit E2)"
```

## E3. Мережеві рядки + сентинел `'вийшов'`

**Files:**
- Modify: `src/net/client.js` (рядок 85), `src/net/coop.js` (177, 233, 266)
- Modify: `src/i18n/en.js`, `src/i18n/ru.js`

- [ ] **Крок 1: імпорт `t` у client.js і coop.js**

Додати `import { t } from '../i18n.js';` угорі обох файлів.

- [ ] **Крок 2: client.js рядок 85** — обгорнути обидва рядки статусу:
```js
      if (sub) sub.textContent = this.lost ? t('Відновлюємо зʼєднання…') : t('Хост відволікся — чекаємо…');
```
(переклад «Хост відволікся…» уже є в `en.js`/`ru.js` рядок 632 — стане живим; додай ключ «Відновлюємо зʼєднання…».)

- [ ] **Крок 3: coop.js — замінити сентинел на enum + локалізувати тости**

У `_dropGuest`/`_onMessage` замінити рядковий сентинел `'вийшов'`/`'зник'` на ASCII-enum `'left'`/`'lost'`:
- рядок 177: `else if (d.t === 'bye') this._dropGuest(from, 'left');`
- `_onPeer` (рядок 258): `if (!on) this._dropGuest(id, 'lost');`
- рядок 266 (`_dropGuest`):
```js
    this.game.hud.toast(t('👋 {n} {how}', { n: r.nick, how: why === 'left' ? t('вийшов з гри') : t('втратив звʼязок') }));
```
- рядок 233 (приєднання):
```js
    this.game.hud.toast(t('🤝 {n} приєднався!', { n: nick }));
```

- [ ] **Крок 4: додати ключі** у `en.js`/`ru.js`:
```js
"Відновлюємо зʼєднання…": "Reconnecting…",
"🤝 {n} приєднався!": "🤝 {n} joined!",
"👋 {n} {how}": "👋 {n} {how}",
"вийшов з гри": "left the game",
"втратив звʼязок": "lost connection",
```

- [ ] **Крок 5: перевірка кооп + i18n + коміт**

```bash
node test/i18n.mjs; pkill -f "node relay/dev-relay" 2>/dev/null; SLOW=4 node test/coop.mjs
git add src/net/client.js src/net/coop.js src/i18n/en.js src/i18n/ru.js
git commit -m "🌍 i18n: мережеві статуси/тости через t(), сентинел вийшов→enum (audit E3)"
```

## E4. Дефолт-ніки `'Гравець'/'Друг'` (LOW)

**Files:**
- Modify: `src/net/remoteplayer.js` (33), `src/net/coop.js` (59,80,223), `src/net/league.js` (31), `src/net/host.js` (161), `src/net/lobby.js` (43)
- Modify: `src/i18n/en.js`, `src/i18n/ru.js`

- [ ] **Крок 1:** замінити голий `\`Гравець ${pid}\`` на `t('Гравець {n}', { n: pid })`, а `'Друг'` на `t('Друг')`; додати ключі:
```js
"Гравець {n}": "Player {n}",
"Друг": "Friend",
```
(У `remoteplayer.js` нік малюється на canvas-спрайт — переконайся, що значення вже локалізоване перед `makeNameSprite`.)

- [ ] **Крок 2: перевірка + коміт**

```bash
node test/i18n.mjs
git add src/net/remoteplayer.js src/net/coop.js src/net/league.js src/net/host.js src/net/lobby.js src/i18n/en.js src/i18n/ru.js
git commit -m "🌍 i18n: дефолт-ніки Гравець/Друг через t() (audit E4)"
```

---

# ФАЗА F — Коректність геймплею

## F1. Failsafe орди: застряглий зомбі не блокує арену боса (MEDIUM)

**Files:**
- Modify: `src/zombies.js` (горде-гейт ~551-554; update-цикл)

- [ ] **Крок 1: пересчитувати hordeRemaining за фактично живими + таймаут**

Замість довіри лічильнику, біля горде-гейта (рядок 551) додати запобіжник: якщо `hordeActive && hordePending<=0` довше за N секунд — форс-прибрати «застряглих» горде-зомбі. Реалізація: у конструкторі додай `this._hordeIdleT = 0;`. У `update(dt)` коли `hordeActive && hordePending<=0`:
```js
      this._hordeIdleT += dt;
      const aliveHorde = this.list.filter((z) => z.horde && z.state !== 'dead').length;
      if (aliveHorde !== this.hordeRemaining) this.hordeRemaining = aliveHorde; // самокорекція лічильника
      if (this._hordeIdleT > 25 && this.hordeRemaining > 0) {
        for (const z of this.list) if (z.horde && z.state !== 'dead') { z.horde = false; } // звільняємо гейт боса
        this.hordeRemaining = 0;
      }
```
Скинути `this._hordeIdleT = 0;` у `startHorde()` і коли `hordePending > 0`.

- [ ] **Крок 2: перевірка повного проходження (де є орди)**

```bash
SLOW=4 node test/e2e.mjs
```
Очікувано: перемога досягається; орда завершується.

- [ ] **Крок 3: коміт**

```bash
git add src/zombies.js
git commit -m "🧟 failsafe орди: самокорекція лічильника + таймаут — арена боса не зависає (audit F1)"
```

## F2. Черга хвиль ремонту (LOW)

**Files:**
- Modify: `src/missionpool.js` (`_up_repair` 851-862; споживач pendingWave)

- [ ] **Крок 1:** зробити `pendingWave` чергою (масив), щоб друга хвиля не затирала першу. Перечитай споживача (рядки ~715-721) і заміни одиничний слот на `this.pendingWaves = []` із `push`, а у споживачі обробляй усі дозрілі.

- [ ] **Крок 2: перевірка + коміт**

```bash
pkill -f "node relay/dev-relay" 2>/dev/null; SLOW=4 node test/coop2.mjs
git add src/missionpool.js && git commit -m "🔧 ремонт-місія: черга хвиль замість затирання слоту (audit F2)"
```

## F3. Урон-число лише коли HP реально впало (LOW)

**Files:**
- Modify: `src/main.js` (onExplosion ~899-902), `src/zombies.js` (повертати поглинене)

- [ ] **Крок 1:** показувати `damageNumber` ПІСЛЯ `zb.damage(...)` і лише якщо щит/нагрудник не поглинули весь урон. Найпростіше — гейт перед малюванням: `if (!zb.shieldHp && (zb.chestHp|0) <= 0) level.effects.damageNumber(...)`.

- [ ] **Крок 2: smoke + коміт**

```bash
node test/smoke.mjs
git add src/main.js && git commit -m "🎯 урон-число не показуємо при поглинанні щитом/бронею (audit F3)"
```

## F4. Споживати натиск E (LOW)

**Files:**
- Modify: `src/missionpool.js` (обробники E місій), `src/extras.js` (Gadgets.update)

- [ ] **Крок 1:** у кожному місійному обробнику, що діє на `input.pressed('KeyE')`, після дії викликати `input.justPressed.delete('KeyE')`, щоб гаджет не забрав той самий натиск.

- [ ] **Крок 2: перевірка + коміт**

```bash
SLOW=4 node test/update5.mjs
git add src/missionpool.js src/extras.js && git commit -m "🎮 E споживається одним обробником (місія АБО барикада) (audit F4)"
```

---

# ФАЗА G — Мобільний UX

## G1. Помітність режиму «Малюк» (MEDIUM)

**Files:**
- Modify: `src/main.js` (`_applyKidMode` ~388-394), `src/hud.js`, `index.html` (touch-coach), `styles.css`

- [ ] **Крок 1:** при перемиканні kidMode показувати тост зворотного зв'язку; у HUD на тачі — постійний чип «🎯 Авто-приціл ✓», коли увімкнено; у коуч-оверлеї (`index.html` #touch-coach) додати рядок «Ми самі цілимось — лише тисни 🔫» (через `data-i18n`). Точні правки:
  - `_applyKidMode`: після оновлення кнопки додати `if (this.hud) this.hud.setKidChip(on); if (this._kidInited) this.hud.toast(on ? t('🐣 Малюк увімкнено: авто-приціл і авто-вогонь') : t('🐣 Малюк вимкнено: цілишся сам')); this._kidInited = true;`
  - `src/hud.js`: метод `setKidChip(on)` — показ/ховання елемента-чипа (додати `<div id="kid-chip">` у HUD-розмітку `index.html`, стиль у `styles.css`, видно лише `body.touch-mode.kid-mode`).
  - додати i18n-ключі для нових рядків у `en.js`/`ru.js`.

- [ ] **Крок 2: перевірка тач-розкладки**

```bash
node test/_touch-shot.mjs
```
Очікувано: без перетинів HUD на 4 розмірах; чип не накладається на інші елементи.

- [ ] **Крок 3: коміт**

```bash
git add src/main.js src/hud.js index.html styles.css src/i18n/en.js src/i18n/ru.js
git commit -m "📱 Малюк: чип авто-прицілу в HUD + рядок коуча + тост при перемиканні (audit G1)"
```

## G2. Повторюваний коуч керування (LOW)

**Files:**
- Modify: `index.html` (кнопка у pause/touch), `src/main.js` (`_maybeShowTouchCoach`)

- [ ] **Крок 1:** додати кнопку «❓ Як грати» (у #overlay-pause або touch-HUD), що викликає показ коуча в обхід localStorage-гейта. Винеси тіло показу в `_showTouchCoach(force)` і викликай із кнопки з `force=true`.

- [ ] **Крок 2: smoke + коміт**

```bash
node test/smoke.mjs
git add index.html src/main.js && git commit -m "📱 коуч керування переоткривається кнопкою «Як грати» (audit G2)"
```

## G3. aria-label на emoji-кнопках (LOW)

**Files:**
- Modify: `index.html` (#touch-util / #touch-right, рядки ~157-173)

- [ ] **Крок 1:** додати локалізовані `aria-label` на кожну tb-кнопку (`aria-label="Вогонь"`, `"Зброя"`, `"Граната"`, `"Перезарядка"`, `"Гаджет"`, `"Взаємодія"`, `"Стрибок"`, `"Приціл"`, тощо). Ключі вже здебільшого є у словнику; додай відсутні.

- [ ] **Крок 2: коміт**

```bash
git add index.html && git commit -m "♿ aria-label на тач-кнопках (audit G3)"
```

---

# ФАЗА H — Полірування продуктивності (НЕОБОВ'ЯЗКОВО, micro-GC)

> Аудит понизив усі ці до low/info. Робити лише за бажанням; гру не ламають.

- [ ] **H1.** `src/world.js` `collide()` (рядок 3126): повертати переюзаний `this._collideOut = {x:0,z:0}` замість `{x,z}`. Перевірка: `SLOW=4 node test/e2e.mjs`. Коміт.
- [ ] **H2.** `src/utils.js` `closestRaySeg()` (рядок 100): додати out-параметр `out` і писати `out.dist/out.t/out.u`; у `world.js shotBlockDist` передавати скретч. Перевірка: smoke. Коміт.
- [ ] **H3.** `src/effects.js` рядок 748: винести `new THREE.Vector3(0,-100,0)` у поле конструктора `this._hidePos`. Перевірка: smoke. Коміт.
- [ ] **H4.** `src/effects.js` (band гранати, рядок 454): кешувати геометрію смуги у `this.bandGeo` (конструктор) + диспозити в `dispose()`. Перевірка: `SLOW=4 node test/update4.mjs`. Коміт.

---

# ФАЗА I — PWA / архітектура (НЕОБОВ'ЯЗКОВО)

- [ ] **I1.** `sw.js` рядок 4: прив'язати `const CACHE = 'zr-cache-v' + 24;` до версії (бампати разом з APP_VERSION) — тоді cleanup в `activate` оживає. Додати гард у `test/version-sync.mjs`, що число у CACHE = APP_VERSION. Коміт.
- [ ] **I2.** `manifest.json`: додати `"id": "./"`. Коміт.
- [ ] **I3 (велике, окремий план).** Архітектурні рефактори — винести `_lm*` лендмарки з `src/world.js` у `src/landmarks.js`; задокументувати контракт об'єкта `level` коментарем над літералом у `_buildLevel`; розбити `effects.update()/zombies.update()` на під-методи. Це механічні рефактори БЕЗ зміни поведінки; через ризик регресій — окремою гілкою/планом, прогін повної батареї після кожного винесення. **Рекомендація:** мінімум зробити дешевий коментар-контракт `level`; великі винесення — відкласти.

---

# ФАЗА Z — Реліз v24

## Z1. Бамп версії (ДВА місця синхронно) + README

**Files:**
- Modify: `version.json`, `src/main.js` (APP_VERSION), `README.md`

- [ ] **Крок 1:** `version.json`: `{ "v": 24 }`. У `src/main.js` знайти `const APP_VERSION = 23` → `24`. (Якщо I1 зроблено — і `sw.js` CACHE→24.) Якщо протокол кооп змінив форму повідомлень (D1 додав поле) — підняти `PROTO_VERSION` у `src/net/protocol.js`.
- [ ] **Крок 2:** у `README.md` додати рядок про v24 «Аудит-надійність»: збереження прогресу (newest-wins), гард міграції, чесні тести реле, ліміти воркера, i18n-добивка.
- [ ] **Крок 3:** `node test/version-sync.mjs` → `🎉 ВЕРСІЇ СИНХРОНІЗОВАНІ`.
- [ ] **Крок 4: коміт**

```bash
git add version.json src/main.js README.md src/net/protocol.js
git commit -m "🔖 v24 «Аудит-надійність»: збереження прогресу, чесні тести, ліміти воркера, i18n"
```

## Z2. Повна батарея перед деплоєм

- [ ] **Крок 1:** прогнати все локально (множник безкоштовний):

```bash
pkill -f "node relay/dev-relay" 2>/dev/null
node test/version-sync.mjs && SLOW=4 node test/smoke.mjs && node test/version-check.mjs \
 && node test/cloudsave.mjs && node test/save-migration.mjs && node test/i18n.mjs \
 && SLOW=4 node test/e2e.mjs && SLOW=4 node test/coop.mjs && SLOW=4 node test/coop5.mjs
```
Очікувано: усе зелене. Решту `update*/campaign/maps` — за бажанням.

## Z3. Деплой

- [ ] **Крок 1:** воркер (якщо змінювали фазу C/D-протокол):

```bash
cd worker && npx wrangler deploy && cd ..
```
- [ ] **Крок 2:** клієнт — Pages з main:

```bash
git checkout main && git merge --no-ff audit-remediation-v24 && git push
```
(Push у main = деплой. Гра звірить `version.json` і авто-оновить застарілих клієнтів.)

- [ ] **Крок 3:** зупинити локальну статику:

```bash
[ -f /tmp/srv.pid ] && kill "$(cat /tmp/srv.pid)" 2>/dev/null; rm -f /tmp/srv.pid
```

---

## Самоперевірка плану (вже виконана автором)

- **Покриття:** усі 41 підтверджені + 1 спірна знахідки мають задачу (A1-A5, B1-B5, C1-C3, D1-D4, E1-E4, F1-F4, G1-G3, H1-H4, I1-I3). Опроверднуті аудитом (9) свідомо НЕ чіпаємо.
- **Узгодженість типів:** `save.cloudTs` оголошено в A1 і читається лише там; `spawnRelay(port)` визначено в B1 і вживається в мігрованих тестах; `setKidChip(on)` визначено в G1.
- **Пріоритети:** Фази A та B — критичні (прогрес + довіра до тестів), деплояться першими. C-G — корисні, незалежні. H-I — необов'язкові.
- **Застереження виконавцю:** перед редагуванням ПЕРЕЧИТУЙ файл (паралельні сесії); деякі точні номери рядків у фазах D/F/G позначені «перечитай … і онови» там, де я не зафіксував повний контекст методу — це навмисні точки звірки, не заглушки.
