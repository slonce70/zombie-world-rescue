// Хост-мережа рівня: авторитет над зомбі, лутом, місіями, вибухами.
// Гості шлють наміри (постріли, E-взаємодії, гранати) і власну позицію;
// хост розсилає події (рівно один раз) + снапшоти 12 разів/с.
import * as THREE from 'three';
import { RemotePlayer } from './remoteplayer.js';
import { r1, r2, PF, packZombieState, weaponToIdx, idxToWeapon } from './protocol.js';
import { PING_PHRASES } from './coop.js';
import { t } from '../i18n.js';

const SNAP_HZ = 12;
const GUEST_STALE_MS = 120000;
// санітизація вхідної шкоди від гостя: завжди скінченне число в розумних межах
// (родинний кооп довіряє гостю, але NaN/Infinity/абсурд не мають псувати стан хоста)
const clampDmg = (v) => Math.max(0, Math.min(2000, Number(v) || 0));
const isVec3 = (a) => Array.isArray(a) && a.length >= 3
  && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]);

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
      rp.dispose();
      this.remotes.delete(pid);
      this._rebuildPlayers();
    }
    this.readyGuests.delete(pid);
  }

  _rebuildPlayers() {
    this.level.players = [this.hostProxy, ...this.remotes.values()];
  }

  ev(...args) { this.evQueue.push(args); }

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
    const level = this.level;
    switch (d.t) {
      case 'lvlready': {
        this.readyGuests.add(from);
        this.session.transport.send(from, this.captureState(), true);
        return true;
      }
      case 'p': {
        // гість, якого вже прибрали з ростера — ігноруємо (не воскрешаємо рігів)
        if (!this.session.roster.has(from)) return true;
        // позиція — найчастіший пакет і потрапляє у снапшот для ВСІХ; NaN/Infinity тут зламали б
        // інтерполяцію рига в усієї кімнати (JSON перетворює їх на null). Відкидаємо такий пакет —
        // як уже роблять nade/rocket через isVec3. hp/mhp теж тримаємо скінченними.
        if (!(Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.z)
              && Number.isFinite(d.yaw) && Number.isFinite(d.pi))) return true;
        let rp = this.remotes.get(from);
        if (!rp) {
          const info = this.session.roster.get(from) || {};
          rp = new RemotePlayer(level, from, info);
          rp.holdE = false;
          rp.magnet = false;
          this.remotes.set(from, rp);
          this._rebuildPlayers();
        }
        const hp = Math.max(0, Math.min(100000, Number(d.hp) || 0));
        const mhp = Math.max(1, Math.min(100000, Number(d.mhp) || 100));
        rp.apply(d.x, d.y, d.z, d.yaw, d.pi, hp, mhp, d.w, d.f, d.ri ?? -1, d.em || null);
        rp.holdE = (d.f & PF.HOLDE) !== 0;
        rp.magnet = (d.f & 1024) !== 0;
        rp._lastP = performance.now();
        if (rp.health <= 0) this._downedAt.set(from, rp._lastP); // зафіксували факт смерті — для 'respawned'
        return true;
      }
      case 'shot': return (this._onShot(from, d), true);
      case 'nade': {
        const o = d.o, v = d.v;
        if (!isVec3(o) || !isVec3(v)) return true;
        this.spawnNetGrenade(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(v[0], v[1], v[2]), from);
        return true;
      }
      case 'rocket': {
        const o = d.o, dir = d.d;
        if (!isVec3(o) || !isVec3(dir)) return true;
        this.spawnNetRocket(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(dir[0], dir[1], dir[2]), clampDmg(d.dmg), from);
        return true;
      }
      case 'use': return (this._onUse(from, d), true);
      case 'gadget': return (this._onGadget(from, d), true);
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
      case 'fountain': {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          level.effects.spawnCoin(d.x + Math.cos(a) * (1 + Math.random() * 2.2), d.z + Math.sin(a) * (1 + Math.random() * 2.2), 14);
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

  _onShot(from, d) {
    const level = this.level;
    const rp = this.remotes.get(from);
    const w = idxToWeapon(d.w);
    // D2: дальність зброї + 30 u лаг-маржа (hitscan max 140; shotgun pellets 45)
    const reach = ((w && w.pellets) ? 45 : 140) + 30;
    // звук + трасер для всіх (і для хоста)
    if (rp) {
      const muzzle = rp.muzzleWorld(this._tmpV).clone();
      if (d.e) level.effects.tracer(muzzle, new THREE.Vector3(d.e[0], d.e[1], d.e[2]));
      const dd = Math.hypot(rp.pos.x - level.player.pos.x, rp.pos.z - level.player.pos.z);
      if (dd < 70) level.audio.shot(w);
    }
    this.ev('sh', from, d.w, d.e || 0);
    // влучання: довіряємо гостю (сімейний кооп), але форму перевіряємо і шкоду санітизуємо
    if (Array.isArray(d.hits)) {
      for (const h of d.hits) {
        if (!Array.isArray(h)) continue;
        const zb = level.zombies.byNid(h[0]);
        if (!zb || zb.state === 'dead') continue;
        // D2: гейт дистанції — легітимний постріл не може влучити далі reach одиниць від гостя
        if (rp && Math.hypot(zb.x - rp.pos.x, zb.z - rp.pos.z) > reach) continue;
        const dir = this._tmpV.set(zb.x - (rp ? rp.pos.x : 0), 0, zb.z - (rp ? rp.pos.z : 0));
        if (dir.lengthSq() > 1e-4) dir.normalize();
        zb.lastHitBy = from;
        zb.damage(clampDmg(h[1]), dir, !!h[2]);
      }
    }
    if (Array.isArray(d.bar)) for (const e of d.bar) {
      if (!Array.isArray(e)) continue;
      const b = level.effects.barrels && level.effects.barrels[e[0]];
      // D2: гейт дистанції для бочок
      if (b && rp && Math.hypot(b.x - rp.pos.x, b.z - rp.pos.z) > reach) continue;
      if (b) level.effects.damageBarrel(b, clampDmg(e[1]));
    }
    if (Array.isArray(d.wl)) for (const e of d.wl) {
      if (!Array.isArray(e)) continue;
      const wall = level.gadgets.walls.find((x) => x.nid === e[0]);
      // D2: гейт дистанції для стін
      if (wall && rp && Math.hypot(wall.x - rp.pos.x, wall.z - rp.pos.z) > reach) continue;
      if (wall) level.gadgets.damageWall(wall, clampDmg(e[1]));
    }
    if (d.ball && level.effects.ball && rp) {
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
      case 'barn': if (ms.useBarn) ms.useBarn(from, near); break;
      case 'crate': if (ms.useCrate) ms.useCrate(from, near); break;
      case 'supply': if (ms.useSupply) ms.useSupply(from, d.i, near); break;
      case 'escort': if (ms.useEscort) ms.useEscort(from, near); break;
      case 'fitem': if (ms.useFetchItem) ms.useFetchItem(from, d.slot, d.i, near); break;
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
    // NaN/Infinity-координати обходять перевірки відстані нижче (NaN > 6 === false), тож гаджет
    // міг би лягти в NaN-точку й піти у снапшот усім. Відкидаємо нескінченні координати/кут.
    if (!Number.isFinite(d.x) || !Number.isFinite(d.z) || (d.yaw != null && !Number.isFinite(d.yaw))) return;
    if (Math.hypot(rp.pos.x - d.x, rp.pos.z - d.z) > 6) return;
    const solved = level.world.collide(d.x, d.z, 0.7);
    if (Math.hypot(solved.x - d.x, solved.z - d.z) > 0.4) return;
    if (d.kind === 'wall') level.gadgets.placeWallAt(d.x, d.z, d.yaw, from);
    else if (d.kind === 'tramp') level.gadgets.placeTrampAt(d.x, d.z, from);
    else if (d.kind === 'turret') level.gadgets.placeTurretAt(d.x, d.z, from);
  }

  // ---------- зомбі / гравці: гачки для ігрових систем ----------
  onZombieSpawn(z) {
    const o = {};
    if (z.golden) o.g = 1;
    if (z.elite) o.e = 1;
    if (z.sleeping) o.sl = 1;
    if (z.horde) o.h = 1;
    if (z.bossStyle) o.st = z.bossStyle;
    if (z.maxHp !== Math.round(z.stats.hp * (z.type === 'boss' ? 1 : this.level.zombies.diff.hp))) o.mhp = z.maxHp;
    this.ev('zs', z.nid, z.type, r1(z.x), r1(z.z), o);
  }

  // шкода гравцю pid (від зомбі/снарядів/вибухів)
  hurtPlayer(proxy, dmg, fx, fz) {
    if (proxy.pid === 1) {
      this.level.player.takeDamage(dmg, fx, fz);
    } else {
      this.session.transport.send(proxy.pid, { t: 'hurt', dmg, fx: r1(fx), fz: r1(fz) });
    }
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
    this.level.effects.spawnRocket(origin, dir, dmg, gid, ownerPid);
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

    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 1 / SNAP_HZ;
      this.session.transport.broadcast(this._snapshot());
    }
    this.flushEvents();
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
    if (level.missions && level.missions.netState) snap.m = level.missions.netState();
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
      walls: level.gadgets.walls.map((w) => [w.nid, w.x, w.z, w.yaw, Math.round(w.hp)]),
      tramps: level.gadgets.tramps.map((t) => [t.nid, t.pad.x, t.pad.z]),
      turrets: level.gadgets.turrets.map((t) => [t.nid, t.ownerPid, r1(t.x), r1(t.z)]),
      scooters: level.vehicles.list.map((r, i) => [i, r1(r.x), r1(r.z), r.riderPid || (r.taken ? 1 : 0)]),
      airdrop: eff.airdrop ? [r1(eff.airdrop.x), r1(eff.airdrop.z), eff.airdrop.landed ? 1 : 0] : 0,
      megabox: level.megabox ? { x: r1(level.megabox.x), z: r1(level.megabox.z), opened: level.megabox.opened ? 1 : 0 } : 0,
    };
    const state = { t: 'state', zoms, items, world, tm: r1(level.stats.time) };
    if (level.missions && level.missions.netFullState) state.missions = level.missions.netFullState();
    return state;
  }

  connectionLost() { /* хост не реконектиться — relay тримає кімнату */ }
  connectionBack() { /* — */ }

  dispose() {
    for (const rp of this.remotes.values()) rp.dispose();
    this.remotes.clear();
    if (this.level) this.level.players = null;
  }
}
