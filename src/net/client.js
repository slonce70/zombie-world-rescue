// Гість-мережа рівня: власний герой локальний (рух/фізика), решта світу —
// дзеркало хоста: зомбі/лут/місії приходять подіями і снапшотами.
import * as THREE from 'three';
import { RemotePlayer } from './remoteplayer.js';
import { PF, weaponToIdx, idxToWeapon } from './protocol.js';
import { PING_PHRASES } from './coop.js';
import { t } from '../i18n.js';

const SEND_HZ = 15;

export class GuestNet {
  constructor(session, level, spec) {
    this.session = session;
    this.game = session.game;
    this.level = level;
    this.role = 'guest';
    this.authority = false;
    this.spec = spec;
    this.remotes = new Map(); // pid -> RemotePlayer (включно з хостом pid=1)
    this.sendT = 0;
    this.lastSnapAt = performance.now();
    this.waiting = false;     // показуємо «чекаємо хоста»
    this.lost = false;
    this.holdE = false;       // ставлять місії-дзеркала, їде у прапорцях p
    this._tmpV = new THREE.Vector3();
    this._ready = false;
  }

  attach(spec) {
    this.spec = spec;
    this.level.players = null; // на гості AI не працює
    this.session.transport.send(1, { t: 'lvlready' }, true);
  }

  send(d) { this.session.transport.send(1, d); }
  myPid() { return this.session.myPid; }

  // ---------- наміри (викликаються ігровим кодом) ----------
  shotReport(weapon, endPoint, hits, barrels, walls, ball) {
    const d = { t: 'shot', w: weaponToIdx(weapon) };
    if (endPoint) d.e = [Math.round(endPoint.x * 10) / 10, Math.round(endPoint.y * 10) / 10, Math.round(endPoint.z * 10) / 10];
    if (hits && hits.length) d.hits = hits;
    if (barrels && barrels.length) d.bar = barrels;
    if (walls && walls.length) d.wl = walls;
    if (ball) d.ball = 1;
    this.send(d);
  }

  sendNade(pos, vel) {
    this.send({ t: 'nade', o: [pos.x, pos.y, pos.z].map((v) => Math.round(v * 100) / 100), v: [vel.x, vel.y, vel.z].map((v) => Math.round(v * 100) / 100) });
  }

  sendRocket(origin, dir, dmg) {
    this.send({ t: 'rocket', o: [origin.x, origin.y, origin.z].map((v) => Math.round(v * 100) / 100), d: [dir.x, dir.y, dir.z].map((v) => Math.round(v * 1000) / 1000), dmg });
  }

  sendUse(kind, extra = {}) { this.send({ t: 'use', kind, ...extra }); }
  sendGadget(kind, x, z, yaw) { this.send({ t: 'gadget', kind, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, yaw: Math.round(yaw * 100) / 100 }); }
  sendRespawned() { this.send({ t: 'respawned' }); }
  sendRevive(pid) { this.send({ t: 'revdone', target: pid }); }
  sendFountain(x, z) { this.send({ t: 'fountain', x: Math.round(x), z: Math.round(z) }); }

  // 📣 пінг гостя: намір хосту (він розсилає подію 'pg' усім)
  guestPing(i) { this.send({ t: 'ping', i: i | 0 }); }

  _showPing(pid, i) {
    const p = PING_PHRASES[i]; if (!p) return;
    const nick = (this.session.roster.get(pid) || {}).nick || t('Друг');
    if (this.level && this.level.game && this.level.game.hud) this.level.game.hud.toast(nick + ': ' + p.icon + ' ' + p.text);
  }

  // ---------- цикл ----------
  update(dt) {
    // поки хост не надіслав повний стан — нагадуємо про себе (він міг ще будувати рівень)
    if (!this._ready) {
      this._readyT = (this._readyT || 0) - dt;
      if (this._readyT <= 0) {
        this._readyT = 1.2;
        this.session.transport.send(1, { t: 'lvlready' }, true);
      }
    }
    for (const rp of this.remotes.values()) rp.update(dt);
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / SEND_HZ;
      this._sendP();
    }
    // вотчдог: хост мовчить (згорнув вкладку / зник)
    const silent = (performance.now() - this.lastSnapAt) / 1000;
    const shouldWait = silent > 4 || this.lost;
    if (shouldWait !== this.waiting) {
      this.waiting = shouldWait;
      const el = document.getElementById('overlay-net-wait');
      if (el) el.classList.toggle('show', shouldWait);
      const sub = document.getElementById('net-wait-sub');
      if (sub) sub.textContent = this.lost ? t('Відновлюємо зʼєднання…') : t('Хост відволікся — чекаємо…');
    }
  }

  _sendP() {
    const p = this.level.player;
    if (!p) return;
    let f = 0;
    if (p.onGround) f |= PF.GROUND;
    if (p.riding) f |= PF.RIDING;
    if (p.emoting) f |= PF.EMOTING;
    if (p.reloading > 0) f |= PF.RELOADING;
    if (p.health <= 0) f |= PF.DEAD;
    if (p.gadgetShield > 0) f |= PF.SHIELD;
    if (this.holdE && this.game.input.down('KeyE')) f |= PF.HOLDE;
    if (p.buffs.magnet > 0) f |= 1024;
    const d = {
      t: 'p',
      x: Math.round(p.pos.x * 100) / 100, y: Math.round(p.pos.y * 100) / 100, z: Math.round(p.pos.z * 100) / 100,
      yaw: Math.round(p.yaw * 100) / 100, pi: Math.round(p.pitch * 100) / 100,
      hp: Math.round(p.health), mhp: p.maxHealth, w: weaponToIdx(p.cur), f,
    };
    if (p.riding) d.ri = this.level.vehicles.list.findIndex((r) => r.riderPid === this.myPid() || r === p.riding);
    if (p.emoting) d.em = p.emoting;
    this.send(d);
  }

  // ---------- вхідні ----------
  onMessage(from, d) {
    if (from !== 1) return false;
    switch (d.t) {
      case 's': this._applySnapshot(d); return true;
      case 'ev': for (const e of d.l) this._applyEv(e); return true;
      case 'state': this._applyState(d); return true;
      case 'hurt': {
        const p = this.level.player;
        if (p && p.health > 0) p.takeDamage(d.dmg, d.fx, d.fz);
        return true;
      }
      case 'healed': {
        const p = this.level.player;
        if (p) p.heal(d.amt);
        return true;
      }
      case 'revived': {
        this.game.applyRevive(d.by || null);
        return true;
      }
      default: return false;
    }
  }

  _remote(pid, infoFallback = null) {
    let rp = this.remotes.get(pid);
    if (!rp) {
      const info = this.session.roster.get(pid) || infoFallback || {};
      rp = new RemotePlayer(this.level, pid, info);
      this.remotes.set(pid, rp);
    }
    return rp;
  }

  _applySnapshot(s) {
    // відкидаємо застарілі/позачергові снапшоти (окремі ~100мс пачки, гонка під час reconnect),
    // щоб позиції/HP/час не «відкочувались» назад
    if (s.n != null) {
      if (this._lastSnapSeq != null && s.n <= this._lastSnapSeq) return;
      this._lastSnapSeq = s.n;
    }
    this.lastSnapAt = performance.now();
    this.lost = false;
    const level = this.level;
    level.stats.time = s.tm;
    const me = this.myPid();
    const seen = new Set();
    for (const t of s.pl) {
      const pid = t[0];
      if (pid === me) continue;
      seen.add(pid);
      const rp = this._remote(pid);
      rp.apply(t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[9], t[10], t[11], t[12] || null);
    }
    for (const [pid, rp] of this.remotes) {
      if (!seen.has(pid)) { rp.dispose(); this.remotes.delete(pid); }
    }
    level.zombies.applySnapshot(s.z);
    if (s.m && level.missions.applyNet) level.missions.applyNet(s.m);
    if (s.ball && level.effects.ball) {
      const bp = level.effects.ball.mesh.position;
      bp.x += (s.ball[0] - bp.x) * 0.4;
      bp.y += (s.ball[1] - bp.y) * 0.4;
      bp.z += (s.ball[2] - bp.z) * 0.4;
    }
    if (s.h) {
      level.zombies.hordeActive = !!s.h[0];
      level.zombies.hordeRemaining = s.h[1];
    }
    if (s.st && level.storm && level.storm.applyNet) {
      level.storm.applyNet(s.st);
      if (s.st[5] === 1 && !this._endedRun) {
        this._endedRun = true;
        this.game._endStormRun();
      }
    }
    if (s.br && level.bossRush) {
      level.bossRush.applyNet(s.br);
      if (s.br[3] === 1 && !this._endedRun) {
        this._endedRun = true;
        this.game._endArenaRun();
      }
    }
  }

  _applyEv(e) {
    const level = this.level;
    const game = this.game;
    const me = this.myPid();
    const [code, ...a] = e;
    switch (code) {
      case 'zs': level.zombies.spawnPuppet(a[0], a[1], a[2], a[3], a[4] || {}); break;
      case 'zd': {
        const zb = level.zombies.byNid(a[0]);
        if (zb) level.zombies.puppetDie(zb, a[1] === me, !!a[2]);
        break;
      }
      case 'zg': level.zombies.puppetGone(a[0]); break;
      case 'zsb': level.zombies.puppetShieldBreak(a[0]); break;
      case 'zcb': level.zombies.puppetChestBreak(a[0]); break;
      case 'it': level.effects.spawnNetItem(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); break;
      case 'lt': {
        const item = level.effects.removeItemByNid(a[0]);
        // подія могла продублюватись (reconnect/повторна пачка) — кредитуємо ЛИШЕ якщо предмет ще існував,
        // інакше монета/аптечка/набої/зброя зарахувалися б удруге з одного підбору
        if (item && a[1] === me && level.effects.onPickup) level.effects.onPickup(a[2], a[3]);
        else if (item && a[2] === 'coin') level.audio.coin();
        break;
      }
      case 'ig': level.effects.removeItemByNid(a[0]); break;
      case 'gn': level.effects.spawnNetGrenade(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); break;
      case 'rk': level.effects.spawnNetRocket(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); break;
      case 'bm': level.effects.netExplosion(a[0], a[1], a[2], a[3], a[4], a[5] || []); break;
      case 'met': level.effects.callMeteor(a[0], a[1]); break; // ☄️ візуал метеорита (шкода — у хоста)
      case 'ad': level.effects.netAirdrop(a[0], a[1]); break;
      case 'sh': {
        if (a[0] === me) break;
        const rp = this.remotes.get(a[0]);
        if (rp && a[2]) {
          const muzzle = rp.muzzleWorld(this._tmpV).clone();
          level.effects.tracer(muzzle, new THREE.Vector3(a[2][0], a[2][1], a[2][2]));
        }
        const p = this.level.player;
        if (rp && p && Math.hypot(rp.pos.x - p.pos.x, rp.pos.z - p.pos.z) < 70) {
          level.audio.shot(idxToWeapon(a[1]));
        }
        break;
      }
      case 'barn': {
        level.world.openBarn();
        level.audio.door();
        if (level.missions.netBarnOpened) level.missions.netBarnOpened();
        break;
      }
      case 'crate': level.world.openCrate(); level.audio.door(); break;
      case 'tower': level.world.setTowerFixed(); break;
      case 'sup': {
        if (level.missions.netSupplyTaken) level.missions.netSupplyTaken(a[0], a[1], a[2]);
        break;
      }
      case 'nest': {
        if (level.missions.netNestCleared) level.missions.netNestCleared(a[0], a[1]);
        break;
      }
      case 'mact': {
        if (level.missions.netActDone) level.missions.netActDone(a[0], a[1]);
        break;
      }
      case 'fit': {
        if (level.missions.netFetchTaken) level.missions.netFetchTaken(a[0], a[1]);
        break;
      }
      case 'md': {
        if (level.missions.netMissionDone) level.missions.netMissionDone(a[0], a[1], a[2]);
        break;
      }
      case 'mb': {
        if (level.megabox) level.megabox.openNet(a[0]);
        break;
      }
      case 'wall': level.gadgets.netWall(a[0], a[1], a[2], a[3], a[4]); break;
      case 'wallgo': level.gadgets.netWallGone(a[0], !!a[1]); break;
      case 'tramp': level.gadgets.netTramp(a[0], a[1], a[2], a[3]); break;
      case 'trampgo': level.gadgets.netTrampGone(a[0]); break;
      case 'turr': level.gadgets.netTurret(a[0], a[1], a[2], a[3]); break;
      case 'turrgo': level.gadgets.netTurretGone(a[0], !!a[1]); break;
      case 'tsh': level.gadgets.netTurretShot(a[0], a[1], a[2], a[3]); break;
      case 'ride': {
        level.vehicles.netRide(a[0], a[1], !!a[2], a[3], a[4], me);
        break;
      }
      case 'bstart': {
        level.bus.emit('bossStart');
        level.audio.bossRoar();
        break;
      }
      case 'vict': game.netVictory(); break;
      case 'stormend': game._endStormRun(); break;
      case 'arenaend': game._endArenaRun(); break;
      case 'hw': level.bus.emit('hordeWarning', 5); break;
      case 'hs': level.audio.horde(); level.bus.emit('hordeStart', a[0]); break;
      case 'he': level.bus.emit('hordeEnd'); break;
      case 'proj': {
        level.effects.spawnProjectile(
          new THREE.Vector3(a[0], a[1], a[2]),
          new THREE.Vector3(a[3], a[4], a[5]),
          a[6], 0, a[7], a[8] || null
        );
        break;
      }
      case 'pg': { if (a[0] === me) break; this._showPing(a[0], a[1]); break; } // 📣 пінг від хоста/іншого гостя
      case 'toast': game.hud.toast(a[0]); break;
      case 'banner': game.hud.banner(a[0], a[1] || '', a[2] || 3.2); break;
      case 'sbb': {
        // міні-бос шторму (на майбутнє) / святковий бонус
        level.addCoins(a[0] || 120);
        break;
      }
      default: break;
    }
  }

  _applyState(st) {
    const level = this.level;
    // повна пересинхронізація (вхід/реконект): дозволяємо наступному снапшоту з будь-яким seq
    this._lastSnapSeq = null;
    // скидаємо прапорець завершення рану, щоб реконект-гість сходився до фінального екрана
    this._endedRun = false;
    level.stats.time = st.tm || 0;
    // зомбі
    level.zombies.clearAllPuppets();
    for (const [nid, type, x, z, o] of st.zoms) level.zombies.spawnPuppet(nid, type, x, z, o);
    // предмети
    level.effects.clearNetItems();
    for (const [nid, kind, x, z, y, value, life] of st.items) level.effects.spawnNetItem(nid, kind, x, z, y, value, life);
    // світ
    const w = st.world;
    if (w.barn) { level.world.openBarn(); if (level.missions.netBarnOpened) level.missions.netBarnOpened(true); }
    if (w.crate) level.world.openCrate();
    if (w.tower) level.world.setTowerFixed();
    for (const idx of w.barrelsGone || []) level.effects.netBarrelGone(idx);
    for (const [wid, x, z, yaw] of w.walls || []) level.gadgets.netWall(wid, 0, x, z, yaw);
    for (const [tid, x, z] of w.tramps || []) level.gadgets.netTramp(tid, 0, x, z);
    for (const [tnid, owner, x, z] of w.turrets || []) level.gadgets.netTurret(tnid, owner, x, z);
    for (const [idx, x, z, rider] of w.scooters || []) {
      const r = level.vehicles.list[idx];
      if (!r) continue;
      if (rider && rider !== this.myPid()) {
        r.taken = true; r.riderPid = rider; r.sc.group.visible = false;
      } else {
        r.x = x; r.z = z; r.y = level.world.groundH(x, z);
        r.sc.group.position.set(r.x, r.y, r.z);
      }
    }
    if (w.airdrop) {
      level.effects.netAirdrop(w.airdrop[0], w.airdrop[1]);
      if (w.airdrop[2] && level.effects.airdrop) {
        const ad = level.effects.airdrop;
        ad.g.position.y = ad.gy + 0.5;
        ad.landed = true;
        ad.chute.visible = false;
      }
    }
    if (w.megabox && !w.megabox.opened && !level.megabox && this.game.makeGuestMegabox) {
      this.game.makeGuestMegabox(w.megabox);
    }
    if (st.missions && level.missions.applyNetFull) level.missions.applyNetFull(st.missions);
    this._ready = true;
    this.lastSnapAt = performance.now();
  }

  connectionLost() {
    this.lost = true;
  }

  connectionBack() {
    this.lost = false;
    // після реконекту хост надішле свіжий state у відповідь на lvlready
    this.session.transport.send(1, { t: 'lvlready' }, true);
  }

  dispose() {
    for (const rp of this.remotes.values()) rp.dispose();
    this.remotes.clear();
    const el = document.getElementById('overlay-net-wait');
    if (el) el.classList.remove('show');
  }
}
