// Хост-мережа рівня: авторитет над зомбі, лутом, місіями, вибухами.
// Гості шлють наміри (постріли, E-взаємодії, гранати) і власну позицію;
// хост розсилає події (рівно один раз) + снапшоти 12 разів/с.
import * as THREE from 'three';
import { RemotePlayer } from './remoteplayer.js';
import { r1, r2, PF, packZombieState, weaponToIdx, idxToWeapon } from './protocol.js';
import { PING_PHRASES } from './coop.js';
import { checkGadget, createGadgetGuard, offerDraftCards, takeDraftCard, throttleMsg } from './gadgetguard.js';
import { t } from '../i18n.js';
import { WEAPONS } from '../player.js';

const SNAP_HZ = 12;
const GUEST_STALE_MS = 120000;
// Third-person camera is 4.4m behind the player; leave one position-packet of
// movement slack without allowing actions at arbitrary map coordinates.
const REMOTE_PROJECTILE_ORIGIN_MAX = 8;
// санітизація вхідної шкоди від гостя: завжди скінченне число в розумних межах
// (родинний кооп довіряє гостю, але NaN/Infinity/абсурд не мають псувати стан хоста)
const clampDmg = (v) => Math.max(0, Math.min(2000, Number(v) || 0));
const HIT_ZONES = new Set(['head', 'arms', 'legs', 'body']);
// 🧊 заморозка від картки драфту: не довше 3с і той самий множник, що в player.js
const CHILL_SLOW_MUL = 0.6;
const clampChill = (v) => Math.max(0, Math.min(3, Number(v) || 0));
const clampHitMeta = (h) => ({
  hitZone: HIT_ZONES.has(h[5]) ? h[5] : (h[2] ? 'head' : 'body'),
  impactForce: Math.max(0, Math.min(12, Number(h[6]) || 0)),
  staggerTime: Math.max(0, Math.min(1.5, Number(h[7]) || 0)),
});
const isVec3 = (a) => Array.isArray(a) && a.length >= 3
  && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]);
// 🎯 стеля довжини списків у повідомленні `shot`: кожен елемент — це пошук цілі
// і `damage` у кадрі хоста, тож масив довільної довжини клав би кімнату.
// Чесну межу задає НЕ дробовик (7 шротин) і не снайперка (pierce 3), а вогнемет:
// `_flameCone` кладе рядок на КОЖНОГО зомбі в конусі (`player.js`: range 8,
// coneCos 0.82 → сектор ~39 м²), тобто стільки тіл, скільки туди фізично влізе.
// Сепарація тримає зомбі на (0.42+0.42)×0.9 ≈ 0.76 од. один від одного, тож у
// найщільнішій купі це ~80 тіл. 96 стоїть ВИЩЕ за цю геометричну стелю —
// чесний вогнемет не обрізає, а нескінченний цикл робить константним.
// Бочки (`bar`) і стіни (`wl`) обмежені кількістю шротин — для них це вже
// величезний запас, але константа спільна: одна межа, одне правило.
const MAX_NET_HITS = 96;

// 🧰 Хто що ставить за повідомленням гостя. Ключі мусять збігатися з
// `GADGET_LIMITS` (gadgetguard.js): тип без рядка в таблиці лімітів не проходить
// `checkGadget`, тож новий гаджет неможливо додати повз перевірку — а звірку
// обох таблиць тримає `test/gadgetguard-unit.mjs`.
const GADGET_PLACERS = {
  wall: (g, d, pid) => g.placeWallAt(d.x, d.z, d.yaw, pid),
  tramp: (g, d, pid) => g.placeTrampAt(d.x, d.z, pid),
  turret: (g, d, pid, strong) => g.placeTurretAt(d.x, d.z, pid, strong),
  // ☄️ метеорит на найближчого до гостя
  meteor: (g, d, pid, strong) => g.hostMeteor(d.x, d.z, strong),
  // 🌋 картка драфту «Вогняний слід» гостя: шкоду вогню ставить ХОСТ (гість малює
  // лише картинку). `strong` тут означає «гість узяв картку двічі» — окремого поля
  // під DPS у каналі гаджетів немає, а числа картки й так фіксовані.
  firetrail: (g, d, pid, strong) => g.hostFireTrail(d.x, d.z, strong),
};

export class HostNet {
  constructor(session, level) {
    this.session = session;
    this.game = session.game;
    this.level = level;
    this.role = 'host';
    this.authority = true;
    this.spec = null;          // заповнить main після побудови
    this.remotes = new Map();  // pid -> RemotePlayer (і проксі для AI)
    this._downedAt = new Map(); // pid -> час, коли хост востаннє бачив гостя полеглим (для чесного 'respawned')
    this.readyGuests = new Set();
    this.evQueue = [];
    this.snapT = 0;
    this.seq = 0;
    this._nextId = 10000;      // мережеві id (>10000, щоб не зіткнутись із pre-net id)
    this._tmpV = new THREE.Vector3();
    this._hostShotCd = 0;
    this._fountainAt = new Map(); // pid -> час останнього fountain (анти-флуд декору)
    this._msgAt = new Map();   // pid -> { тип: час } — кулдауни дешевих повідомлень (MSG_GAPS)
    // 🏠 стеля каналу гаджетів на ВСЮ кімнату: живе на рівні, а не на гості, тож
    // цикл «вийшов — зайшов із новим pid» її не скидає (персональні ліміти скидає).
    this.roomGuard = createGadgetGuard();
    this._destroyedWorldIds = new Set((level.world.destructibles || []).filter((d) => d.destroyed).map((d) => d.id));

    // адаптер власного гравця для AI-циклів (level.players)
    const p = level.player;
    const self = this;
    this.hostProxy = {
      pid: 1,
      get pos() { return p.pos; },
      get health() { return p.health; },
      get alive() { return p.health > 0; },
      get holdE() { return self.game.input.down('KeyE'); },
      get magnet() { return p.buffs.magnet > 0; },
      nick: session.nick,
    };
  }

  allocId() { return this._nextId++; }

  // викликається main-ом наприкінці побудови рівня
  attach(spec) {
    this.spec = spec;
    const level = this.level;
    level.players = [this.hostProxy];
    // гості, що вже в кімнаті (зайшли в лобі) — чекаємо їхній lvlready
    for (const pid of this.session.roster.keys()) {
      if (pid !== 1) this.addGuest(pid);
    }
  }

  addGuest(pid) {
    // RemotePlayer створюється при першому p-повідомленні (коли гість збудує рівень)
    this.readyGuests.delete(pid);
  }

  removeGuest(pid) {
    const rp = this.remotes.get(pid);
    if (rp) {
      // якщо їхав на самокаті — припаркувати
      this._dismountPid(pid, rp.pos.x, rp.pos.z);
      // 🎒 Загін гостя веде хост, тож і прибирає його теж хост — ДО rp.dispose():
      // інакше owner напарника вказував би на мертвий риг, і напарник застиг би
      // біля останньої позиції гостя до кінця забігу.
      if (this.level.gadgets) this.level.gadgets.removeSquadOf(pid);
      rp.dispose();
      this.remotes.delete(pid);
      this._rebuildPlayers();
    }
    this.readyGuests.delete(pid);
    this._fountainAt.delete(pid);
    this._msgAt.delete(pid);
  }

  _rebuildPlayers() {
    this.level.players = [this.hostProxy, ...this.remotes.values()];
  }

  ev(...args) {
    // 🎲 роздача набору драфту гостю: запамʼятовуємо, З ЧОГО він обиратиме. Права
    // це ще не дає — його дасть підтверджений вибір (`dpk`), який ми звіримо саме
    // з цим набором. Ловимо в момент відправки, щоб облік не розʼїхався з подією.
    if (args[0] === 'dro') offerDraftCards(this._guard(args[1]), args[2]);
    this.evQueue.push(args);
  }

  // стан лімітів каналу гаджетів живе на самому гості: відвалився — стан пішов з ним
  _guard(pid) {
    const rp = this.remotes.get(pid);
    if (!rp) return null;
    return rp.gadgetGuard || (rp.gadgetGuard = createGadgetGuard());
  }

  // 📣 пінг хоста: розсилаємо подію всім гостям (від pid 1)
  hostPing(i) { this.ev('pg', 1, i | 0); }

  _showPing(pid, i) {
    const p = PING_PHRASES[i]; if (!p) return;
    const nick = (this.session.roster.get(pid) || {}).nick || t('Друг');
    if (this.game && this.game.hud) this.game.hud.toast(nick + ': ' + p.icon + ' ' + p.text);
  }

  flushEvents() {
    if (this.evQueue.length) {
      this.session.transport.broadcast({ t: 'ev', l: this.evQueue });
      this.evQueue = [];
    }
  }

  // ---------- вхідні повідомлення ----------
  onMessage(from, d) {
    const handled = this._handleMessage(from, d);
    // відповідь-події летять одразу — взаємодії гостей відчуваються миттєвими
    if (handled) this.flushEvents();
    return handled;
  }

  _handleMessage(from, d) {
    // 🚪 Один гард замість розсипаних по кейсах `if (rp && …)`: не в ростері —
    // не в кімнаті, рівневих повідомлень від такого pid не слухаємо взагалі.
    // Порядок подій це дозволяє: `_hostHello` кладе гостя в ростер ЩЕ ДО того, як
    // надішле йому welcome/start, а `lvlready` гість шле лише після start — тобто
    // чесний вхід (лобі → ростер → lvlready → p) гард не бачить.
    // Повертаємо `false`, а не `true`: рівень цього повідомлення не обробив, і воно
    // мусить доїхати до сесії — саме там ловиться `hello` НОВОГО гостя, якого в
    // ростері ще немає (з `true` приєднання посеред рівня зламалось би назавжди).
    if (!this.session.roster.has(from)) return false;
    // ⏱️ кулдаун дешевих типів (lvlready/ping/twh). Відмова тиха — повідомлення
    // просто зникає, як і понадлімітний гаджет: у дитячому коопі лаг звичайніший
    // за чит, а модифікований клієнт не має дізнаватись, де проходить межа.
    if (!throttleMsg(this._msgAt, from, d.t, performance.now())) return true;
    const level = this.level;
    switch (d.t) {
      case 'lvlready': {
        this.readyGuests.add(from);
        this.session.transport.send(from, this.captureState(), true);
        return true;
      }
      case 'p': {
        // позиція — найчастіший пакет і потрапляє у снапшот для ВСІХ; NaN/Infinity тут зламали б
        // інтерполяцію рига в усієї кімнати (JSON перетворює їх на null). Відкидаємо такий пакет —
        // як уже роблять nade/rocket через isVec3. hp/mhp теж тримаємо скінченними.
        if (!(Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.z)
              && Number.isFinite(d.yaw) && Number.isFinite(d.pi))) return true;
        let rp = this.remotes.get(from);
        let fresh = false;
        if (!rp) {
          const info = this.session.roster.get(from) || {};
          rp = new RemotePlayer(level, from, info);
          rp.holdE = false;
          rp.magnet = false;
          rp.coinMagnet = false;
          this.remotes.set(from, rp);
          this._rebuildPlayers();
          fresh = true;
        }
        const hp = Math.max(0, Math.min(100000, Number(d.hp) || 0));
        const mhp = Math.max(1, Math.min(100000, Number(d.mhp) || 100));
        rp.apply(d.x, d.y, d.z, d.yaw, d.pi, hp, mhp, d.w, d.f, d.ri ?? -1, d.em || null);
        rp.holdE = (d.f & PF.HOLDE) !== 0;
        rp.magnet = (d.f & 1024) !== 0;
        // 🧲 картка драфту «Магніт монет» гостя: підбір монет вирішує хост, тож прапорець
        // мусить доїхати сюди — інакше гість бачив би, як монети летять, і не отримував їх.
        rp.coinMagnet = (d.f & 2048) !== 0;
        rp._lastP = performance.now();
        if (rp.health <= 0) this._downedAt.set(from, rp._lastP); // зафіксували факт смерті — для 'respawned'
        // 🎒 перший пакет позиції = гість збудував рівень і стоїть у світі. Саме тут
        // спавнимо його Загін: раніше (на lvlready) позиція власника ще (0,-100,0).
        if (fresh) this._spawnGuestSquad(from, rp);
        return true;
      }
      case 'shot': return (this._onShot(from, d), true);
      case 'dh': {
        const rp = this.remotes.get(from);
        const id = Number.isInteger(d.id) ? d.id : -1;
        const target = level.world.destructibles?.[id];
        if (!rp || !target || target.destroyed) return true;
        const weaponId = idxToWeapon(d.w);
        const w = WEAPONS[weaponId] || WEAPONS.pistol;
        const reach = ((w.pellets ? 45 : (w.range || 140))) + 30;
        const pos = target.mesh.getWorldPosition(this._tmpV);
        if (Math.hypot(pos.x - rp.pos.x, pos.z - rp.pos.z) > reach) return true;
        if (level.world.damageDestructible(id, clampDmg(d.dmg))) {
          this._destroyedWorldIds.add(id);
          this.ev('dx', id);
        }
        return true;
      }
      case 'nade': {
        const o = d.o, v = d.v;
        if (!isVec3(o) || !isVec3(v)) return true;
        // F20: дистанц-гейт як у shot/gadget — граната має вилітати з-під самого гостя.
        // Без нього гість міг би кинути гранату в будь-яку точку карти.
        // без рига гейт нема з чим звіряти — відмовляємо, а не пропускаємо: гість шле
        // свою позицію з ПЕРШОГО ж кадру рівня (client.js, sendT = 0), тож на момент
        // будь-якого чесного кидка риг у хоста вже є.
        const rpN = this.remotes.get(from);
        if (!rpN || Math.hypot(o[0] - rpN.pos.x, o[2] - rpN.pos.z) > REMOTE_PROJECTILE_ORIGIN_MAX) return true;
        this.spawnNetGrenade(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(v[0], v[1], v[2]), from);
        return true;
      }
      case 'rocket': {
        const o = d.o, dir = d.d;
        if (!isVec3(o) || !isVec3(dir)) return true;
        // F20: ракета теж стартує з-під гостя — той самий дистанц-гейт.
        const rpR = this.remotes.get(from);
        if (!rpR || Math.hypot(o[0] - rpR.pos.x, o[2] - rpR.pos.z) > REMOTE_PROJECTILE_ORIGIN_MAX) return true;
        this.spawnNetRocket(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(dir[0], dir[1], dir[2]), clampDmg(d.dmg), from);
        return true;
      }
      case 'use': return (this._onUse(from, d), true);
      case 'gadget': return (this._onGadget(from, d), true);
      case 'dpk': {
        // 🎲 гість повідомив, яку картку взяв (PROTO 26). Зараховуємо, лише якщо вона
        // була в наборі, який хост САМ йому надіслав; набір при цьому витрачається,
        // тож повтор права не додасть. Мовчазна відмова — як і скрізь у цьому каналі.
        takeDraftCard(this._guard(from), d.id);
        return true;
      }
      case 'respawned': {
        // чистимо спавн лише якщо хост СПРАВДІ бачив гостя полеглим нещодавно (анти-гриф/анти-флуд):
        // інакше гість міг би спамити 'respawned', тримаючи зону вічно чистою і збиваючи лічильник орди
        const dAt = this._downedAt.get(from);
        if (!dAt || (performance.now() - dAt) > 30000) return true;
        this._downedAt.delete(from); // спожито: повторний 'respawned' без нової смерті — ігнор
        const L = level.world.layout;
        level.zombies.clearNear(L.SPAWN.x, L.SPAWN.z, 30);
        return true;
      }
      case 'revdone': {
        // гість підняв когось: перевіряємо, що ціль і досі лежить, і повідомляємо її
        const target = d.target | 0;
        const reviverNick = (this.session.roster.get(from) || {}).nick || t('Друг');
        if (target === 1) {
          // F21: реанімація хоста лише впритул (≤3 од.) — симетрія з реанімацією гостей нижче.
          // Без цього гість міг би «підняти» хоста з будь-якої точки карти.
          const reviver = this.remotes.get(from);
          if (!reviver || Math.hypot(reviver.pos.x - level.player.pos.x, reviver.pos.z - level.player.pos.z) > 3) return true;
          this.game.applyRevive(reviverNick);
        } else {
          const trp = this.remotes.get(target);
          if (trp && trp.health <= 0) {
            // D3: перевірка близькості — реанімація лише впритул (≤3 од.)
            const reviver = this.remotes.get(from);
            if (!reviver || !trp || Math.hypot(reviver.pos.x - trp.pos.x, reviver.pos.z - trp.pos.z) > 3) return true;
            this.session.transport.send(target, { t: 'revived', by: reviverNick }, true);
          }
        }
        return true;
      }
      case 'twh': {
        // 🔨 молот гостя по зомбі-турелі: гість поруч із нею? шкоду клампимо —
        // стати гостя не авторитарні (той самий принцип, що й кооп-драфт)
        const tw = level.turretwar;
        const rp = this.remotes.get(from);
        if (tw && !tw.over && rp && Math.hypot(rp.pos.x - tw.ex, rp.pos.z - tw.cz) < 7) {
          tw.hitEnemyTurret(Math.min(60, Math.max(0, d.dmg | 0)));
        }
        return true;
      }
      case 'fountain': {
        // F23: декор-монети від гостя — кламп координат у межі карти + кулдаун ≥3с на pid.
        // Без цього гість міг би спамити фонтанами (лаг/сміття в снапшоті) або
        // розкидати монети в NaN/за межами карти.
        if (!Number.isFinite(d.x) || !Number.isFinite(d.z)) return true;
        const now = performance.now();
        const last = this._fountainAt.get(from) || 0;
        if (now - last < 3000) return true;
        this._fountainAt.set(from, now);
        const bound = (level.world.layout && level.world.layout.BOUND) || 200;
        let fx = d.x, fz = d.z;
        const dC = Math.hypot(fx, fz);
        if (dC > bound) { fx *= bound / dC; fz *= bound / dC; } // у коло радіуса BOUND
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          level.effects.spawnCoin(fx + Math.cos(a) * (1 + Math.random() * 2.2), fz + Math.sin(a) * (1 + Math.random() * 2.2), 14);
        }
        return true;
      }
      case 'ping': {
        // 📣 індекс гостя не довіряємо — клампимо в межі масиву фраз
        const i = d.i | 0;
        if (i >= 0 && i < PING_PHRASES.length) { this.ev('pg', from, i); this._showPing(from, i); }
        return true;
      }
      default: return false;
    }
  }

  // 🎒 Загін ГОСТЯ веде хост: зомбі й шкода авторитарні саме тут, тож напарник гостя —
  // звичайний обʼєкт світу (заразом безкоштовно оживають lure і fighter). Нової довіри
  // це не потребує: єдиний вхід — оголошення складу при вході, уже зрізане
  // sanitizeSquadNet у ростері. Режими з noGadgets лишаються без Загону в усіх —
  // симетрія з соло (main.js), де кімнатні режими свідомо про обмежене спорядження.
  _spawnGuestSquad(pid, rp) {
    const level = this.level;
    if (!level.gadgets || level.noGadgets || level.playground) return;
    const ids = (this.session.roster.get(pid) || {}).sq;
    if (Array.isArray(ids) && ids.length) level.gadgets.spawnSquad(ids, rp);
  }

  _onShot(from, d) {
    const level = this.level;
    const rp = this.remotes.get(from);
    // без рига гейти дистанції нижче тихо вимикались би («rp && …»), і постріл
    // проходив би з будь-якої точки карти. Чесному це не заважає: позиція гостя
    // приїжджає з першого ж кадру його рівня (client.js, sendT = 0).
    if (!rp) return;
    const weaponId = idxToWeapon(d.w);
    const w = WEAPONS[weaponId] || WEAPONS.pistol;
    // D2: дальність зброї + 30 u лаг-маржа (hitscan max 140; shotgun pellets 45; fuel weapons use cfg.range)
    const reach = ((w.pellets ? 45 : (w.range || 140))) + 30;
    // звук + трасер для всіх (і для хоста)
    const muzzle = rp.muzzleWorld(this._tmpV).clone();
    if (d.e) level.effects.tracer(muzzle, new THREE.Vector3(d.e[0], d.e[1], d.e[2]));
    if (Math.hypot(rp.pos.x - level.player.pos.x, rp.pos.z - level.player.pos.z) < 70) level.audio.shot(weaponId);
    this.ev('sh', from, d.w, d.e || 0);
    // влучання: довіряємо гостю (сімейний кооп), але форму перевіряємо і шкоду санітизуємо
    if (Array.isArray(d.hits)) {
      for (const h of d.hits.slice(0, MAX_NET_HITS)) {
        if (!Array.isArray(h)) continue;
        const zb = level.zombies.byNid(h[0]);
        if (!zb || zb.state === 'dead') continue;
        // D2: гейт дистанції — легітимний постріл не може влучити далі reach одиниць від гостя
        if (Math.hypot(zb.x - rp.pos.x, zb.z - rp.pos.z) > reach) continue;
        const dir = this._tmpV.set(zb.x - rp.pos.x, 0, zb.z - rp.pos.z);
        if (dir.lengthSq() > 1e-4) dir.normalize();
        zb.lastHitBy = from;
        // [5..7] are additive Combat Reborn metadata; old 3/5-field hit arrays
        // still resolve to the legacy head/body behavior. Weapon comes from d.w,
        // never from guest-provided hit metadata, so the host remains authoritative.
        const opts = { weaponId, ...clampHitMeta(h) };
        if (w.flame) opts.fire = true;
        zb.damage(clampDmg(h[1]), dir, !!h[2], opts);
        // 💫 гаджет «Оглушливі кулі» гостя: оглушуємо лише з пістолета/магнума
        if (h[3] && (weaponId === 'pistol' || weaponId === 'magnum') && zb.state !== 'dead' && !(zb.stats && zb.stats.stunImmune)) zb.stunT = h[4] === 1 ? 1 : 0.5;
        // 🧊 картка драфту «Крижані кулі» гостя (9-й елемент, PROTO 25): сповільнення
        // ставить ХОСТ тим самим полем slowT/slowMul, що й крижана граната — інакше
        // гість бачив би заморожених зомбі, яких хост жене на повній швидкості.
        const chill = clampChill(h[8]);
        if (chill > 0 && zb.state !== 'dead') {
          zb.slowT = Math.max(zb.slowT || 0, chill);
          zb.slowMul = Math.min(zb.slowMul || 1, CHILL_SLOW_MUL);
        }
      }
    }
    if (Array.isArray(d.bar)) for (const e of d.bar.slice(0, MAX_NET_HITS)) {
      if (!Array.isArray(e)) continue;
      const b = level.effects.barrels && level.effects.barrels[e[0]];
      // D2: гейт дистанції для бочок
      if (b && Math.hypot(b.x - rp.pos.x, b.z - rp.pos.z) > reach) continue;
      if (b) level.effects.damageBarrel(b, clampDmg(e[1]));
    }
    if (Array.isArray(d.wl)) for (const e of d.wl.slice(0, MAX_NET_HITS)) {
      if (!Array.isArray(e)) continue;
      const wall = level.gadgets.walls.find((x) => x.nid === e[0]);
      // D2: гейт дистанції для стін
      if (wall && Math.hypot(wall.x - rp.pos.x, wall.z - rp.pos.z) > reach) continue;
      if (wall) level.gadgets.damageWall(wall, clampDmg(e[1]));
    }
    if (d.ball && level.effects.ball) {
      const bp = level.effects.ball.mesh.position;
      const dir = this._tmpV.set(bp.x - rp.pos.x, 0.3, bp.z - rp.pos.z).normalize();
      level.effects.kickBall(dir, 9);
    }
  }

  _onUse(from, d) {
    const level = this.level;
    const rp = this.remotes.get(from);
    if (!rp) return;
    const near = (x, z, r) => Math.hypot(rp.pos.x - x, rp.pos.z - z) < r;
    const ms = level.missions;
    switch (d.kind) {
      // 🏘️ карта спільноти: єдиний вид взаємодії гостя. Хост сам звіряє індекси,
      // фазу, одноразовість і відстань — координатам гостя тут не вірять.
      case 'cmap': if (ms.useCmap) ms.useCmap(from, near, d); break;
      case 'barn': if (ms.useBarn) ms.useBarn(from, near); break;
      case 'crate': if (ms.useCrate) ms.useCrate(from, near); break;
      case 'supply': if (ms.useSupply) ms.useSupply(from, d.i, near); break;
      case 'escort': if (ms.useEscort) ms.useEscort(from, near); break;
      case 'fitem': if (ms.useFetchItem) ms.useFetchItem(from, d.slot, d.i, near); break;
      case 'ship': if (ms.useShip) ms.useShip(from, d.a, near); break;
      case 'megabox': {
        const mb = level.megabox;
        if (mb && !mb.opened && near(mb.x, mb.z, 4.2)) mb.open(from);
        break;
      }
      case 'scooter': {
        const r = level.vehicles.list[d.i];
        if (r && !r.taken && near(r.x, r.z, 3.2)) {
          r.taken = true;
          r.riderPid = from; // самокат тепер їде під віддаленим гравцем (vehicles.update)
          this.ev('ride', from, d.i, 1, 0, 0);
        }
        break;
      }
      case 'dismount': {
        this._dismountPid(from, d.x ?? rp.pos.x, d.z ?? rp.pos.z);
        break;
      }
      case 'wallback': {
        const i = level.gadgets.walls.findIndex((x) => x.nid === d.i);
        if (i >= 0 && near(level.gadgets.walls[i].x, level.gadgets.walls[i].z, 3.6)) {
          level.gadgets._removeWall(i, false);
        }
        break;
      }
    }
  }

  _dismountPid(pid, x, z) {
    const level = this.level;
    const r = level.vehicles.list.find((v) => v.riderPid === pid);
    if (!r) return;
    const idx = level.vehicles.list.indexOf(r);
    r.taken = false;
    r.riderPid = null;
    r.x = x; r.z = z;
    r.y = level.world.groundH(x, z);
    r.sc.group.visible = true;
    r.sc.group.position.set(r.x, r.y, r.z);
    r.sc.group.rotation.z = 0.09;
    this.ev('ride', pid, idx, 0, r1(x), r1(z));
  }

  _onGadget(from, d) {
    const level = this.level;
    const rp = this.remotes.get(from);
    if (!rp) return;
    // невідомий тип — мовчки в нікуди (і повз таблицю лімітів пройти теж нікуди)
    const place = GADGET_PLACERS[d.kind];
    if (!place) return;
    // NaN/Infinity-координати обходять перевірки відстані нижче (NaN > 6 === false), тож гаджет
    // міг би лягти в NaN-точку й піти у снапшот усім. Відкидаємо нескінченні координати/кут.
    if (!Number.isFinite(d.x) || !Number.isFinite(d.z) || (d.yaw != null && !Number.isFinite(d.yaw))) return;
    if (Math.hypot(rp.pos.x - d.x, rp.pos.z - d.z) > 6) return;
    const solved = level.world.collide(d.x, d.z, 0.7);
    if (Math.hypot(solved.x - d.x, solved.z - d.z) > 0.4) return;
    // 🛡️ ліміти каналу: право на картку + частота + стеля живих обʼєктів.
    // Рішення приймає gadgetguard.js, і саме ОСТАННІМ кроком: невдале місце не
    // має зʼїдати бюджет чесного гостя. Понадлімітне повідомлення просто зникає.
    const verdict = checkGadget(this._guard(from), d.kind, performance.now(), {
      strong: !!d.hyper,
      hypers: (this.session.roster.get(from) || {}).hyp,
      build: this._sharedBuild(),
      active: this._liveGadgets(d.kind, from),
      room: this.roomGuard,
      roomActive: this._liveGadgets(d.kind, null),
    });
    if (!verdict.ok) return;
    place(level.gadgets, d, from, verdict.strong);
  }

  // 🎒 СПІЛЬНА збірка забігу — друге джерело права на карткові ефекти (перше —
  // роздача `dro`). Це рівно ті режими, де хост віддає збірку ВСІЙ кімнаті у spec
  // і обидві сторони застосовують її на своєму гравцеві: Експедиція (`ex`) і Фронт
  // (`fr`). Беремо саме ці масиви, а не `runBuild.ids` хоста: у Штормі збірка в
  // кожного СВОЯ (право дає лише роздача), а у Фронті хост може взяти картку
  // всередині рівня — гостю вона не діставалась, тож права давати не повинна.
  // У кооп-кампанії збірки забігу гостю не створюють — тут null, і слід відхиляється.
  _sharedBuild() {
    const level = this.level;
    if (level.expedition && Array.isArray(level.expedition.build)) return level.expedition.build;
    if (level.operation && Array.isArray(level.operation.build)) return level.operation.build;
    return null;
  }

  // скільки обʼєктів цього типу живі у світі просто зараз: `pid` — лише гостя,
  // `null` — усі, включно з обʼєктами хоста й тих, хто вже вийшов (стеля кімнати).
  // Стіни, батути й турелі памʼятають власника; метеорит і вогняний слід власника
  // не мають — їх guard рахує сам за часом життя.
  _liveGadgets(kind, pid) {
    const g = this.level.gadgets;
    if (!g) return 0;
    const mine = (o) => pid == null || o.ownerPid === pid;
    if (kind === 'wall') return g.walls.filter(mine).length;
    if (kind === 'tramp') return g.tramps.filter(mine).length;
    if (kind === 'turret') return g.turrets.filter(mine).length;
    return 0;
  }

  // ---------- зомбі / гравці: гачки для ігрових систем ----------
  onZombieSpawn(z) {
    const o = {};
    if (z.golden) o.g = 1;
    if (z.elite) o.e = 1;
    if (z.sleeping) o.sl = 1;
    if (z.horde) o.h = 1;
    if (z.radiationMode) o.rm = 1;
    if (z.turretwar) o.tw = 1;
    // 🌋 світовий бос: id боса → puppet забіндить level.worldBoss.boss; міньйони — маркер HUD
    if (z.worldBoss) o.wb = z.worldBoss;
    if (z.worldBossMinion) o.wbm = 1;
    if (z.bossStyle) o.st = z.bossStyle;
    // 🩺 mhp долітає до puppet-а гостя, лише якщо відрізняється від його НАЇВНОЇ
    // переоцінки (mirror: coopScale=1, без мутатора → baseHp×diff.hp). Раніше базою
    // було z.stats.hp, яке на спавні вже = maxHp (coopMul/мутатор «запечені»), тож
    // gate завжди фолсив і puppet-и мали занижений hp у коопі 2+ / під мутатором тижня.
    const baseHp = z.type === 'boss' ? null : this.level.zombies.baseHpFor(z.type);
    const guestNaiveHp = baseHp != null
      ? Math.max(1, Math.round(baseHp * this.level.zombies.diff.hp))
      : Math.round(z.stats.hp * (z.type === 'boss' ? 1 : this.level.zombies.diff.hp));
    if (z.maxHp !== guestNaiveHp) o.mhp = z.maxHp;
    this.ev('zs', z.nid, z.type, r1(z.x), r1(z.z), o);
  }

  // шкода гравцю pid (від зомбі/снарядів/вибухів)
  hurtPlayer(proxy, dmg, fx, fz, stun = 0) {
    if (proxy.pid === 1) {
      this.level.player.takeDamage(dmg, fx, fz);
      if (stun && this.level.player.health > 0) this.level.player.stunT = Math.max(this.level.player.stunT || 0, stun);
    } else {
      this.session.transport.send(proxy.pid, { t: 'hurt', dmg, fx: r1(fx), fz: r1(fz), stun });
    }
  }

  // 🎒 тост ОДНОМУ гостю (Загін гостя спавнить хост — сам гість про друга не знає).
  // Канал той самий, що в банерів шторму: подія 'toast', але адресна, не broadcast.
  toastTo(pid, text) {
    if (pid === 1) { if (this.game && this.game.hud) this.game.hud.toast(text); return; }
    this.session.transport.send(pid, { t: 'ev', l: [['toast', text]] }, true);
  }

  healPlayer(proxy, amt) {
    if (proxy.pid === 1) this.level.player.heal(amt);
    else this.session.transport.send(proxy.pid, { t: 'healed', amt });
  }

  // власний постріл хоста — трасер/звук для гостей
  onLocalShot(weapon, endPoint) {
    if (this._hostShotCd > 0) return;
    this.ev('sh', 1, weaponToIdx(weapon), endPoint ? [r1(endPoint.x), r1(endPoint.y), r1(endPoint.z)] : 0);
  }

  // хост сам когось підняв
  sendRevive(pid) {
    this.session.transport.send(pid, { t: 'revived', by: this.session.nick }, true);
  }

  spawnNetGrenade(pos, vel, ownerPid = 1) {
    const gid = this.allocId();
    this.level.effects.spawnGrenade(pos, vel, gid, ownerPid);
    this.ev('gn', gid, r2(pos.x), r2(pos.y), r2(pos.z), r2(vel.x), r2(vel.y), r2(vel.z));
  }

  spawnNetRocket(origin, dir, dmg, ownerPid = 1) {
    const gid = this.allocId();
    this.level.effects.spawnRocket(origin, dir, dmg, gid, ownerPid, true);
    this.ev('rk', gid, r2(origin.x), r2(origin.y), r2(origin.z), r2(dir.x), r2(dir.y), r2(dir.z));
  }

  // ---------- снапшот ----------
  update(dt) {
    if (this._hostShotCd > 0) this._hostShotCd -= dt;
    for (const rp of this.remotes.values()) {
      rp.update(dt);
      // гість ДУЖЕ давно мовчить (зомбі-сокет: relay не помітив розрив) — прибираємо.
      // Звичайний розрив ловить relay подією peer-off значно раніше.
      // Background/headless browsers can throttle a connected guest hard enough
      // to miss normal position packets. Relay peer-off is the authoritative
      // disconnect signal, so stale-packet cleanup must be conservative.
      if (rp._lastP && performance.now() - rp._lastP > GUEST_STALE_MS) {
        this.session._dropGuest(rp.pid, 'зник');
        break;
      }
    }

    // ⛈️👑 кооп-виживання: якщо впала ВСЯ команда — забіг завершено для всіх
    const level = this.level;
    for (const d of level.world.destructibles || []) {
      if (d.destroyed && !this._destroyedWorldIds.has(d.id)) {
        this._destroyedWorldIds.add(d.id);
        this.ev('dx', d.id);
      }
    }
    const run = level.storm || level.bossRush;
    if (run && !run.over) {
      // D4: виключаємо «привидів» — гостей, чий останній пакет старший за 8 с.
      // Хост-проксі (pid 1) завжди враховується; RemotePlayer без _lastP — вважається свіжим.
      const now = performance.now();
      const activePlayers = (level.players || []).filter((p) => {
        if (p.pid === 1) return true; // хост завжди активний
        const rp = this.remotes.get(p.pid);
        return !rp || !rp._lastP || (now - rp._lastP) < 8000;
      });
      const allDown = activePlayers.length > 0 && activePlayers.every((p) => p.health <= 0);
      if (allDown) {
        this.ev(level.storm ? 'stormend' : 'arenaend');
        this.flushEvents();
        if (level.storm) this.game._endStormRun();
        else this.game._endArenaRun();
      }
    }

    // 📣 Події летять ПЕРЕД снапшотом: подія ОГОЛОШУЄ зміну, а снапшот її вже містить.
    // Зі зворотним порядком снапшот того ж кадру обганяв подію — гість виводив «виконано»
    // з голих чисел (напр. `so` = ціль) і глушив подію (`soc`) гардом `!so.done`: ціль
    // тихо зникала з HUD без тоста й дзвіночка. Снапшот будується вже після флаша,
    // тож жодна подія не суперечить числам у ньому.
    this.flushEvents();
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 1 / SNAP_HZ;
      this.session.transport.broadcast(this._snapshot());
    }
  }

  _playerTuple() {
    const p = this.level.player;
    const g = this.game;
    let f = 0;
    if (p.onGround) f |= PF.GROUND;
    if (p.riding) f |= PF.RIDING;
    if (p.emoting) f |= PF.EMOTING;
    if (p.reloading > 0) f |= PF.RELOADING;
    if (p.health <= 0) f |= PF.DEAD;
    if (p.gadgetShield > 0) f |= PF.SHIELD;
    let rideIdx = -1;
    if (p.riding) rideIdx = this.level.vehicles.list.indexOf(p.riding);
    return [1, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch),
      Math.round(p.health), p.maxHealth, Math.round(p.armor), weaponToIdx(p.cur), f, rideIdx,
      p.emoting || 0];
  }

  _snapshot() {
    const level = this.level;
    this.seq++;
    const pl = [this._playerTuple()];
    for (const rp of this.remotes.values()) {
      pl.push([rp.pid, r2(rp.target.x), r2(rp.target.y), r2(rp.target.z), r2(rp.targetYaw), r2(rp.pitch),
        Math.round(rp.health), rp.maxHealth, 0, weaponToIdx(rp.curWeapon), rp.flags, rp.rideIdx, rp.emote || 0]);
    }
    const z = [];
    for (const zb of level.zombies.list) {
      if (zb.state === 'dead' || zb.gone) continue;
      const t = [zb.nid, r1(zb.x), r1(zb.z), r1(zb.y), packZombieState(zb, zb._netMoving || false),
        Math.max(0, Math.round((zb.hp / zb.maxHp) * 100))];
      if (zb.shieldMax > 0) t.push(Math.max(0, Math.round((zb.shieldHp / zb.shieldMax) * 100)));
      else if (zb.chestMax > 0) t.push(-Math.max(0, Math.round((zb.chestHp / zb.chestMax) * 100)) - 1);
      z.push(t);
    }
    const snap = { t: 's', n: this.seq, tm: r1(level.stats.time), pl, z };
    // 🎒 напарники Загону: ≤8 записів по 5 полів — поруч із десятками зомбі це нічого.
    // Порожній Загін ключа не додає, але гість усе одно зве netSquad([]) — інакше
    // останній напарник, що зник, лишився б у нього назавжди.
    const sq = level.gadgets ? level.gadgets.squadNet() : [];
    if (sq.length) snap.sq = sq;
    if (level.missions && level.missions.netState) snap.m = level.missions.netState();
    // ⭐ v298 «Зірки разом»: КОМАНДНИЙ прогрес вторинної цілі → чип гостя тікає наживо
    // (виконання дублює подія `soc`, але прогрес живе тут). Дефініцію гість уже має зі spec.
    if (level.secondaryObjective) snap.so = level.secondaryObjective.progress;
    if (level.effects.ball) {
      const bp = level.effects.ball.mesh.position;
      snap.ball = [r1(bp.x), r1(bp.y), r1(bp.z)];
    }
    const zm = level.zombies;
    snap.h = [zm.hordeActive ? 1 : 0, zm.hordeRemaining];
    if (level.storm) {
      const st = level.storm;
      snap.st = [r1(st.r), st.phase === 'shrink' ? 1 : 0, r1(st.phaseT), st.wave, st.waveAlive, st.over ? 1 : 0];
    }
    if (level.bossRush) {
      const br = level.bossRush;
      snap.br = [br.idx, br.state === 'fight' ? 1 : 0, r1(br.breakT), br.over ? 1 : 0];
    }
    return snap;
  }

  // ---------- повний стан (для гостя, що приєднався/повернувся) ----------
  captureState() {
    const level = this.level;
    const zoms = [];
    for (const zb of level.zombies.list) {
      if (zb.state === 'dead' || zb.gone) continue;
      const o = {};
      if (zb.golden) o.g = 1;
      if (zb.elite) o.e = 1;
      if (zb.sleeping) o.sl = 1;
      if (zb.horde) o.h = 1;
      // прапори кімнатних режимів: без них гість після state-синку рахував
      // remaining()=0 і миттєво «перемагав» (реальний баг friendly-нокауту)
      if (zb.knockout) o.k = 1;
      if (zb.defense) o.d = 1;
      if (zb.radiationMode) o.rm = 1;
      if (zb.turretwar) o.tw = 1;
      if (zb.worldBoss) o.wb = zb.worldBoss;
      if (zb.worldBossMinion) o.wbm = 1;
      if (zb.bossStyle) o.st = zb.bossStyle;
      o.mhp = zb.maxHp;
      o.hp = zb.hp;
      if (zb.shieldMax > 0) o.sh = Math.round((zb.shieldHp / zb.shieldMax) * 100);
      if (zb.chestMax > 0) o.ch = Math.round((zb.chestHp / zb.chestMax) * 100);
      zoms.push([zb.nid, zb.type, r1(zb.x), r1(zb.z), o]);
    }
    const items = [];
    for (const c of level.effects.coins) {
      items.push([c.nid, c.type, r1(c.mesh.position.x), r1(c.mesh.position.z),
        c.baseY !== undefined ? r1(c.baseY - (c.type === 'coin' ? 0.35 : 0.3)) : null, c.value, Math.round(c.life)]);
    }
    const eff = level.effects;
    const world = {
      barn: level.world.barnOpened ? 1 : 0,
      crate: level.world.crateOpened ? 1 : 0,
      tower: level.world.towerFixed ? 1 : 0,
      barrelsGone: (eff.barrels || []).map((b, i) => (b.exploded ? i : -1)).filter((i) => i >= 0),
      destructiblesGone: (level.world.destructibles || []).filter((d) => d.destroyed).map((d) => d.id),
      walls: level.gadgets.walls.map((w) => [w.nid, w.x, w.z, w.yaw, Math.round(w.hp)]),
      tramps: level.gadgets.tramps.map((t) => [t.nid, t.pad.x, t.pad.z]),
      turrets: level.gadgets.turrets.map((t) => [t.nid, t.ownerPid, r1(t.x), r1(t.z)]),
      // 🎒 mid-join/реконект бачить уже наявних напарників, а не порожнечу
      squad: level.gadgets.squadNet(),
      scooters: level.vehicles.list.map((r, i) => [i, r1(r.x), r1(r.z), r.riderPid || (r.taken ? 1 : 0)]),
      airdrop: eff.airdrop ? [r1(eff.airdrop.x), r1(eff.airdrop.z), eff.airdrop.landed ? 1 : 0] : 0,
      megabox: level.megabox ? { x: r1(level.megabox.x), z: r1(level.megabox.z), opened: level.megabox.opened ? 1 : 0 } : 0,
    };
    const state = { t: 'state', zoms, items, world, tm: r1(level.stats.time) };
    const frun = this.spec && this.spec.fr && this.session.frontSnapshot && this.session.frontSnapshot();
    if (frun) state.frun = frun;
    if (level.missions && level.missions.netFullState) state.missions = level.missions.netFullState();
    // ⭐ v298 «Зірки разом»: mid-join/реконект відновлює чип цілі й КОМАНДНИЙ прогрес+виконаність.
    // (Дефініцію гість також дістає зі spec при вході, але тут несемо id/target для повноти й безпеки.)
    if (level.secondaryObjective) {
      const so = level.secondaryObjective;
      state.so = [so.id, so.target, so.progress, so.done ? 1 : 0];
    }
    // 🌟 v297: непідібраний супер-пікап переживає mid-join/реконект (nid+позиція; тип лишається
    // у хоста — підбір host-authoritative). Активні сили короткочасні, у стан НЕ пишемо.
    const sp = level.superPickup;
    if (sp && !sp.done && sp.nid) state.spu = [sp.nid, r1(sp.x), r1(sp.z)];
    return state;
  }

  connectionLost() {
    // хост лишається авторитетом і симулює далі; снапшоти у мертвий сокет — no-op (readyState-гард).
    this._netDown = true;
  }

  connectionBack() {
    this._netDown = false;
    // прогалина снапшотів за час простою → повна пересинхронізація кожному гостю свіжим captureState
    // (як у відповідь на lvlready: гість у _applyState скидає _lastSnapSeq і приймає свіжий стан).
    if (this.level && this.level.player) {
      const state = this.captureState();
      for (const pid of this.session.roster.keys()) {
        if (pid !== 1) this.session.transport.send(pid, state, true);
      }
    }
  }

  dispose() {
    for (const rp of this.remotes.values()) rp.dispose();
    this.remotes.clear();
    if (this.level) this.level.players = null;
  }
}
