// Іграшки рівня: 🦙 Мегабокс, 🐶 пес Дружок, 🛴 самокати, 🦘🧱 гаджети
import * as THREE from 'three';
import { t, keyHint } from './i18n.js';
import {
  makeMegaboxMesh, makeDog, makeScooter, makeTrampolineMesh, makeBarricadeMesh, makeTurretMesh,
} from './characters.js';

// ============================================================
// 🦙 Мегабокс: святкова скриня з pity-механікою
// ============================================================
export class Megabox {
  constructor(level, x = null, z = null) {
    this.level = level;
    this.opened = false;
    this.t = 0;
    const world = level.world;
    if (x === null) {
      // десь на карті, але не в зонах місій
      const rng = level.rng;
      for (let tries = 0; tries < 30; tries++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(35, 85);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
        if (world._farFromSites(x, z, 10) && world.roadDist(x, z) > 4) break;
      }
    }
    this.x = x;
    this.z = z;
    this.y = world.groundH(x, z);
    const m = makeMegaboxMesh();
    this.mesh = m;
    m.group.position.set(x, this.y, z);
    m.group.rotation.y = Math.random() * 6.28;
    level.scene.add(m.group);
    this.beam = level.effects.makeBeam(x, z, 0xb086f2, '🦙');
    this._hinted = false;
  }

  update(dt, input, allowControl) {
    const level = this.level;
    this.t += dt;
    if (this.opened) {
      // кришка відлітає і скриня тоне в землю
      this.mesh.lid.position.y += dt * 6;
      this.mesh.lid.rotation.x += dt * 5;
      this.mesh.lid.rotation.z += dt * 3;
      if (this.t - this.openedAt > 1.2) this.mesh.group.position.y -= dt * 0.7;
      if (this.t - this.openedAt > 3) {
        level.scene.remove(this.mesh.group);
        this.done = true;
      }
      return;
    }
    // підстрибує і сяє
    this.mesh.group.position.y = this.y + Math.abs(Math.sin(this.t * 2.2)) * 0.18;
    this.mesh.group.rotation.y += dt * 0.5;
    this.beam.update(dt);
    const p = level.player;
    const d = Math.hypot(p.pos.x - this.x, p.pos.z - this.z);
    if (d < 28 && !this._hinted) {
      this._hinted = true;
      level.bus.emit('toast', t('🦙 МЕГАБОКС поблизу! Знайди фіолетовий промінь!'));
    }
    if (d < 3.6 && !level.missions.prompt) {
      level.missions.prompt = { text: t('🦙 Натисни E — відкрий МЕГАБОКС!'), hold: false };
      if (allowControl && input.pressed('KeyE')) {
        if (level.mirror) level.net.sendUse('megabox');
        else this.open(1);
      }
    }
  }

  // святкова анімація відкриття (однакова всюди)
  _openFx() {
    this.opened = true;
    this.openedAt = this.t;
    const level = this.level;
    this.beam.remove();
    level.audio.megabox();
    // феєрверк
    for (let i = 0; i < 3; i++) {
      level.effects.burst(
        new THREE.Vector3(this.x, this.y + 1 + i * 0.6, this.z),
        [0xffd23f, 0xff5d8c, 0xb086f2][i], 16,
        { speed: 4.5, up: 4, life: 1.0, size: 1.3 }
      );
    }
  }

  open(byPid = 1) {
    if (this.opened) return;
    this._openFx();
    const level = this.level;
    level.netEv('mb', byPid);
    if (byPid === 1) {
      level.game.openMegaboxReward(this.x, this.z);
      level.bus.emit('megaboxOpened');
    }
  }

  // гість: скриню відкрито (можливо, мною)
  openNet(byPid) {
    if (this.opened) return;
    this._openFx();
    const level = this.level;
    const me = level.net ? level.net.myPid() : 0;
    if (byPid === me) {
      level.game.openMegaboxReward(this.x, this.z);
      level.bus.emit('megaboxOpened');
    }
  }
}

// ============================================================
// 🐶 Пес Дружок: біжить поруч, збирає монети, гавкає на сюрпризи
// ============================================================
export class Pet {
  constructor(level) {
    this.level = level;
    this.dog = makeDog();
    const p = level.player.pos;
    this.x = p.x + 1.5;
    this.z = p.z + 1.5;
    this.y = level.world.groundH(this.x, this.z);
    this.yaw = 0;
    this.barkCd = 2;
    this.grabCd = 0;
    this.grabbing = null;
    level.scene.add(this.dog.group);
  }

  update(dt) {
    const level = this.level;
    const p = level.player;
    // ціль: трохи позаду-збоку героя або монетка поблизу
    let tx = p.pos.x + Math.sin(p.yaw + 2.4) * 1.7;
    let tz = p.pos.z + Math.cos(p.yaw + 2.4) * 1.7;
    // шукаємо монету в радіусі — пес побіжить по неї
    if (!this.grabbing && this.grabCd <= 0) {
      let best = null, bd = 9;
      for (const c of level.effects.coins) {
        if (c.type !== 'coin') continue;
        const d = Math.hypot(c.mesh.position.x - this.x, c.mesh.position.z - this.z);
        if (d < bd) { bd = d; best = c; }
      }
      this.grabbing = best;
    }
    if (this.grabCd > 0) this.grabCd -= dt;
    if (this.grabbing) {
      if (!level.effects.coins.includes(this.grabbing)) {
        this.grabbing = null; // гравець підібрав сам
      } else {
        tx = this.grabbing.mesh.position.x;
        tz = this.grabbing.mesh.position.z;
        if (Math.hypot(tx - this.x, tz - this.z) < 0.8) {
          level.effects.collectCoinNow(this.grabbing);
          this.grabbing = null;
          this.grabCd = 0.4;
          this.dog.tail.rotation.z = 1;
        }
      }
    }
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 35) { this.x = tx; this.z = tz; } // телепорт, якщо загубився
    const spd = d > 8 ? 9.5 : d > 1.1 ? 5.5 : 0;
    let moving = false;
    if (spd > 0 && d > 0.1) {
      this.x += (dx / d) * spd * dt;
      this.z += (dz / d) * spd * dt;
      this.yaw = Math.atan2(-dx, -dz);
      moving = true;
    }
    const solved = level.world.collide(this.x, this.z, 0.3);
    this.x = solved.x;
    this.z = solved.z;
    this.y = Math.max(level.world.groundH(this.x, this.z), level.world.floorAt(this.x, this.z, this.y));

    // анімація: лапки, хвостик, радість під час танцю героя
    const g = this.dog;
    g.phase += dt * (moving ? 14 : 3);
    g.legs.forEach((leg, i) => {
      leg.rotation.x = moving ? Math.sin(g.phase + (i % 2) * Math.PI) * 0.7 : 0;
    });
    g.tail.rotation.z = Math.sin(g.phase * 1.6) * 0.5;
    g.head.rotation.x = moving ? 0 : Math.sin(g.phase * 0.5) * 0.12;
    let hopY = 0;
    if (p.emoting) {
      hopY = Math.abs(Math.sin(g.phase * 0.8)) * 0.35; // пес теж танцює!
      g.tail.rotation.z = Math.sin(g.phase * 3) * 0.8;
    }
    g.group.position.set(this.x, this.y + hopY, this.z);
    g.group.rotation.y += (this.yaw - g.group.rotation.y) * Math.min(1, dt * 9);

    // гавкає на сплячі сюрпризи й золотого зомбі
    this.barkCd -= dt;
    if (this.barkCd <= 0) {
      this.barkCd = 2.4;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || (!z.sleeping && !z.golden)) continue;
        if (Math.hypot(z.x - this.x, z.z - this.z) < 12) {
          level.audio.bark();
          // підстрибує і дивиться в бік знахідки
          this.yaw = Math.atan2(-(z.x - this.x), -(z.z - this.z));
          level.effects.burst(
            new THREE.Vector3(this.x, this.y + 0.9, this.z),
            0xffd23f, 3, { speed: 1.2, up: 2, life: 0.5, size: 0.6 }
          );
          if (!this._barkHint) {
            this._barkHint = true;
            level.bus.emit('toast', t('🐶 Гав-гав! Дружок щось відчуває поблизу…'));
          }
          break;
        }
      }
    }
  }
}

// ============================================================
// 🛴 Самокати: стоять на карті, E — поїхати / зійти
// ============================================================
export class Vehicles {
  constructor(level) {
    this.level = level;
    this.list = [];
    const L = level.world.layout;
    const spots = [
      { x: L.SPAWN.x + 4, z: L.SPAWN.z - 3 },
      { x: L.village.x + 6, z: L.village.z + 5 },
    ];
    const colors = [0x4fd8ff, 0xff8c42];
    spots.forEach((sp, i) => {
      const solved = level.world.collide(sp.x, sp.z, 0.8);
      const sc = makeScooter(colors[i % 2]);
      const y = level.world.groundH(solved.x, solved.z);
      sc.group.position.set(solved.x, y, solved.z);
      sc.group.rotation.z = 0.09; // на підніжці
      sc.group.rotation.y = Math.random() * 6.28;
      level.scene.add(sc.group);
      this.list.push({ sc, x: solved.x, z: solved.z, y, taken: false });
    });
    this.riding = null;
    this._wasFP = true;
  }

  update(dt, input, allowControl) {
    const level = this.level;
    const p = level.player;
    // чужі райдери: самокат їде під віддаленим гравцем
    if (level.net) {
      const me = level.net.myPid ? level.net.myPid() : 1;
      for (const r of this.list) {
        if (!r.riderPid || r.riderPid === me || (level.net.role === 'host' && r.riderPid === 1)) continue;
        const rp = level.net.remotes.get(r.riderPid);
        if (rp) {
          r.sc.group.position.copy(rp.pos);
          r.sc.group.rotation.set(0, rp.yaw, 0);
          for (const w of r.sc.wheels) w.rotation.x -= (rp._speed || 0) * dt * 1.2;
        }
      }
    }
    if (this.riding) {
      const r = this.riding;
      // самокат під ногами героя, нахиляється в поворот разом із ним
      r.sc.group.position.set(p.pos.x, p.pos.y, p.pos.z);
      r.sc.group.rotation.set(0, p.yaw, -(p._rideSteer || 0) * 0.14);
      for (const w of r.sc.wheels) w.rotation.x -= p.rideSpeed * dt * 6;
      // зійти: E
      if (allowControl && input.pressed('KeyE')) {
        input.justPressed.delete('KeyE');
        if (level.mirror) level.net.sendUse('dismount', { x: Math.round(p.pos.x * 10) / 10, z: Math.round(p.pos.z * 10) / 10 });
        else this.dismount();
      }
      return;
    }
    // сісти: E біля самоката
    if (p.emoting || p.health <= 0) return;
    for (const r of this.list) {
      if (r.taken) continue;
      const d = Math.hypot(p.pos.x - r.x, p.pos.z - r.z);
      if (d < 2.4) {
        if (!level.missions.prompt) {
          level.missions.prompt = { text: t('🛴 Натисни E — поїхали!'), hold: false };
        }
        if (allowControl && input.pressed('KeyE')) {
          input.justPressed.delete('KeyE');
          if (level.mirror) level.net.sendUse('scooter', { i: this.list.indexOf(r) });
          else this.mount(r);
        }
        break;
      }
    }
  }

  // подія з мережі: хтось сів/зійшов
  netRide(pid, idx, on, x, z, myPid) {
    const r = this.list[idx];
    if (!r) return;
    if (on) {
      if (pid === myPid) {
        this.mount(r);
        r.riderPid = pid;
      } else {
        r.taken = true;
        r.riderPid = pid;
      }
    } else if (pid === myPid) {
      if (this.riding === r) this.dismountLocal(x, z);
    } else {
      r.taken = false;
      r.riderPid = null;
      r.x = x; r.z = z;
      r.y = this.level.world.groundH(x, z);
      r.sc.group.position.set(r.x, r.y, r.z);
      r.sc.group.rotation.z = 0.09;
    }
  }

  mount(r) {
    const p = this.level.player;
    this.riding = r;
    r.taken = true;
    r.riderPid = this.level.net ? (this.level.net.myPid ? this.level.net.myPid() : 1) : 1;
    if (this.level.net && this.level.net.authority) {
      this.level.netEv('ride', 1, this.list.indexOf(r), 1, 0, 0);
    }
    p.riding = r;
    p.rideSpeed = 0;
    this._wasFP = p.firstPerson;
    p.firstPerson = false; // на самокаті видно героя збоку
    p._applyView();
    r.sc.group.rotation.z = 0;
    this.level.audio.bell();
    this.level.bus.emit('toast', t('🛴 W — газ, S — гальмо, A/D — кермо. E — зійти'));
  }

  dismountLocal(x, z) {
    // зійти за командою хоста (позиція вже відома)
    const r = this.riding;
    const p = this.level.player;
    if (!r) return;
    this.riding = null;
    p.riding = null;
    p.rideSpeed = 0;
    r.taken = false;
    r.riderPid = null;
    r.x = x !== undefined ? x : p.pos.x;
    r.z = z !== undefined ? z : p.pos.z;
    r.y = this.level.world.groundH(r.x, r.z);
    r.sc.group.position.set(r.x, r.y, r.z);
    r.sc.group.rotation.z = 0.09;
    if (this._wasFP) {
      p.firstPerson = true;
      p._applyView();
    }
  }

  dismount() {
    const r = this.riding;
    const p = this.level.player;
    if (!r) return;
    this.riding = null;
    p.riding = null;
    p.rideSpeed = 0;
    r.taken = false;
    r.riderPid = null;
    if (this.level.net && this.level.net.authority) {
      this.level.netEv('ride', 1, this.list.indexOf(r), 0,
        Math.round(p.pos.x * 10) / 10, Math.round(p.pos.z * 10) / 10);
    }
    r.x = p.pos.x + Math.sin(p.yaw) * 1.2;
    r.z = p.pos.z + Math.cos(p.yaw) * 1.2;
    r.y = this.level.world.groundH(r.x, r.z);
    r.sc.group.position.set(r.x, r.y, r.z);
    r.sc.group.rotation.z = 0.09;
    if (this._wasFP) {
      p.firstPerson = true;
      p._applyView();
    }
  }
}

// ============================================================
// 🧰 Гаджети: обираєш ОДИН перед боєм (Гардероб), клавіша F, перезарядка
// ============================================================
export const GADGETS = {
  shield: { name: t('Щит'), icon: '🛡️', cd: 30, price: 300, desc: t('Аварійна бульбашка: поглинає 50 шкоди') },
  heal: { name: t('Відновлення'), icon: '💚', cd: 25, price: 250, desc: t('+50 здоров\'я миттєво') },
  tramp: { name: t('Кишеньковий батут'), icon: '🦘', cd: 20, price: 150, desc: t('Постав і застрибни на дах') },
  // desc — getter: текст «забрати» залежить від керування і читається у момент показу
  wall: { name: t('Барикада'), icon: '🧱', cd: 25, price: 200, get desc() { return t('Стіна на 100 міцності ({k})', { k: keyHint('кнопка ✋ — забрати', 'E — забрати') }); } },
  // 🤖 преміум: автоматична вогнева підтримка
  turret: { name: t('Турель'), icon: '🤖', cd: 45, price: 450, desc: t('Сторожова турель: 30с сама обстрілює зомбі поруч') },
};

// баланс турелі: підтримка, а не заміна гравця (DPS героя ~180-220)
export const TURRET = { range: 14, dmg: 14, fireCd: 0.5, life: 30, hp: 120 };

export class Gadgets {
  constructor(level) {
    this.level = level;
    this.cd = 0;
    this.tramps = [];
    this.walls = [];
    this.turrets = [];
    this._thunkCd = 0;
    this._gidSeq = 0;
    // 🛡 бульбашка гаджет-щита довкола героя
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 18, 14),
      new THREE.MeshBasicMaterial({
        color: 0x4fd8ff, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.shieldMesh.visible = false;
    level.scene.add(this.shieldMesh);
  }

  get active() { return this.level.game.save.activeGadget; }

  update(dt, input, allowControl) {
    const level = this.level;
    const p = level.player;
    if (this.cd > 0) this.cd -= dt;
    if (allowControl && p.health > 0 && input.pressed('KeyF')) this.use();

    // бульбашка щита слідує за героєм і тане з міцністю
    if (p.gadgetShield > 0) {
      this.shieldMesh.visible = true;
      this.shieldMesh.position.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
      this.shieldMesh.material.opacity = 0.1 + 0.2 * Math.min(1, p.gadgetShield / 50);
      this.shieldMesh.rotation.y += dt * 0.4;
    } else if (this.shieldMesh.visible) {
      this.shieldMesh.visible = false;
      level.effects.burst(new THREE.Vector3(p.pos.x, p.pos.y + 1.1, p.pos.z), 0x4fd8ff, 12, { speed: 3.5, up: 2, life: 0.6 });
      level.audio.shieldBreak();
    }

    // E біля своєї барикади — забрати назад
    if (allowControl && input.pressed('KeyE')) {
      for (let i = this.walls.length - 1; i >= 0; i--) {
        const w = this.walls[i];
        if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < 3.2) {
          input.justPressed.delete('KeyE');
          if (level.mirror) {
            level.net.sendUse('wallback', { i: w.nid });
          } else {
            this._removeWall(i, false);
            level.bus.emit('toast', t('🧱 Барикаду забрано назад'));
            level.audio.pickup();
          }
          break;
        }
      }
    }
    // підказка біля своєї барикади
    if (!level.missions.prompt) {
      for (const w of this.walls) {
        if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < 3.2) {
          level.missions.prompt = { text: t('🧱 Натисни E — забрати барикаду'), hold: false };
          break;
        }
      }
    }

    // дзеркало (гість): голова турелі ліниво обертається між пострілами
    if (level.mirror) {
      for (const t of this.turrets) {
        t.idleSpin += dt;
        if (t.idleSpin > 2.5) t.mesh.head.rotation.y += dt * 0.6;
      }
      return;
    }
    // 🤖 турелі: стрільба/тиск/життя (рахує лише хост/соло)
    this._updateTurrets(dt);
    // зомбі гатять по барикадах (рахує лише хост/соло)
    this._thunkCd -= dt;
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      let pressure = 0;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || !z.aggroed) continue;
        if (Math.hypot(z.x - w.x, z.z - w.z) < 2.7) pressure += z.stats.dmg;
      }
      if (pressure > 0) {
        w.hp -= pressure * dt * 0.85;
        if (this._thunkCd <= 0) {
          this._thunkCd = 0.5;
          level.audio.kick();
          level.effects.burst(new THREE.Vector3(w.x, w.y + 1, w.z), 0xb08a5a, 3, { speed: 2, up: 2, life: 0.4, size: 0.6 });
        }
        w.mesh.rotation.x = (1 - w.hp / 100) * 0.12;
        if (w.hp <= 0) this._removeWall(i, true);
      }
    }
  }

  // F — застосувати обраний гаджет
  use() {
    const level = this.level;
    const game = level.game;
    const id = this.active;
    if (!id) {
      level.bus.emit('toast', t('🧰 Обери гаджет у Гардеробі на глобусі!'));
      return false;
    }
    if (this.cd > 0) {
      level.bus.emit('toast', t('{i} Ще {n}с перезарядки…', { i: GADGETS[id].icon, n: Math.ceil(this.cd) }));
      game.audio.denied();
      return false;
    }
    const p = level.player;
    let ok = false;
    if (id === 'shield') {
      p.gadgetShield = 50;
      level.audio.powerup();
      level.bus.emit('toast', t('🛡️ Щит увімкнено: поглине 50 шкоди!'));
      ok = true;
    } else if (id === 'heal') {
      if (p.health >= p.maxHealth) {
        level.bus.emit('toast', t('Здоров\'я і так повне! 💪'));
        game.audio.denied();
        return false;
      }
      p.heal(50);
      level.audio.heal();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.4), 0x6dff9c, 12, { speed: 2, up: 3, life: 0.8 });
      level.bus.emit('toast', t('💚 +50 здоров\'я!'));
      ok = true;
    } else if (id === 'tramp') {
      if (level.mirror) ok = this._requestPlace('tramp', 2.1);
      else ok = this._placeTramp();
    } else if (id === 'wall') {
      if (level.mirror) ok = this._requestPlace('wall', 2.6);
      else ok = this._placeWall();
    } else if (id === 'turret') {
      if (level.mirror) ok = this._requestPlace('turret', 2.2);
      else ok = this._placeTurret();
    }
    if (ok) {
      this.cd = GADGETS[id].cd;
      level.bus.emit('gadgetUsed', id);
    }
    return ok;
  }

  _placePos(dist) {
    const p = this.level.player;
    const x = p.pos.x - Math.sin(p.yaw) * dist;
    const z = p.pos.z - Math.cos(p.yaw) * dist;
    const solved = this.level.world.collide(x, z, 0.7);
    if (Math.hypot(solved.x - x, solved.z - z) > 0.4) return null;
    return { x, z, y: this.level.world.groundH(x, z) };
  }

  // гість: просимо хоста поставити гаджет у нашій точці
  _requestPlace(kind, dist) {
    const pos = this._placePos(dist);
    if (!pos) {
      this.level.bus.emit('toast', kind === 'wall' ? t('Тут не можна поставити барикаду 🙈')
        : kind === 'turret' ? t('Тут не можна поставити турель 🙈') : t('Тут не можна поставити батут 🙈'));
      return false;
    }
    this.level.net.sendGadget(kind, pos.x, pos.z, this.level.player.yaw);
    return true;
  }

  _placeTramp() {
    const pos = this._placePos(2.1);
    if (!pos) {
      this.level.bus.emit('toast', t('Тут не можна поставити батут 🙈'));
      return false;
    }
    this.placeTrampAt(pos.x, pos.z, 1);
    return true;
  }

  placeTrampAt(x, z, ownerPid) {
    const level = this.level;
    const y = level.world.groundH(x, z);
    const nid = level.net && level.net.authority ? level.net.allocId() : ++this._gidSeq;
    this._buildTramp(nid, x, y, z);
    if (level.net && level.net.authority) level.netEv('tramp', nid, ownerPid, Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    return true;
  }

  _buildTramp(nid, x, y, z) {
    const mesh = makeTrampolineMesh();
    mesh.position.set(x, y, z);
    this.level.scene.add(mesh);
    const pad = { x, z, y, power: 15, cd: 0 };
    this.level.world.jumpPads.push(pad);
    this.tramps.push({ mesh, pad, nid });
    if (this.tramps.length > 3) {
      const old = this.tramps.shift();
      this._disposeTramp(old);
      if (this.level.net && this.level.net.authority) this.level.netEv('trampgo', old.nid);
    }
    this.level.audio.boing();
    this.level.effects.ring(new THREE.Vector3(x, y, z), 0x4fa8e8, 2);
  }

  _disposeTramp(t) {
    this.level.scene.remove(t.mesh);
    const idx = this.level.world.jumpPads.indexOf(t.pad);
    if (idx >= 0) this.level.world.jumpPads.splice(idx, 1);
  }

  // гість: батут із мережі
  netTramp(nid, ownerPid, x, z) {
    if (this.tramps.some((t) => t.nid === nid)) return;
    this._buildTramp(nid, x, this.level.world.groundH(x, z), z);
  }

  netTrampGone(nid) {
    const i = this.tramps.findIndex((t) => t.nid === nid);
    if (i >= 0) {
      this._disposeTramp(this.tramps[i]);
      this.tramps.splice(i, 1);
    }
  }

  _placeWall() {
    const level = this.level;
    const pos = this._placePos(2.6);
    if (!pos) {
      level.bus.emit('toast', t('Тут не можна поставити барикаду 🙈'));
      return false;
    }
    this.placeWallAt(pos.x, pos.z, level.player.yaw, 1);
    return true;
  }

  placeWallAt(x, z, yaw, ownerPid) {
    const level = this.level;
    const nid = level.net && level.net.authority ? level.net.allocId() : ++this._gidSeq;
    this._buildWall(nid, x, z, yaw, ownerPid);
    if (level.net && level.net.authority) {
      level.netEv('wall', nid, ownerPid, Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(yaw * 100) / 100);
    }
    return true;
  }

  _buildWall(nid, x, z, yaw, ownerPid) {
    const level = this.level;
    const y = level.world.groundH(x, z);
    const mesh = makeBarricadeMesh();
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    level.scene.add(mesh);
    const colliders = [];
    for (const off of [-0.85, 0, 0.85]) {
      const cx = x + Math.cos(yaw) * off;
      const cz = z - Math.sin(yaw) * off;
      const col = { x: cx, z: cz, r: 0.55, top: y + 1.8 };
      level.world.colliders.push(col);
      colliders.push(col);
    }
    level.world._buildGrid();
    this.walls.push({ mesh, colliders, hp: 100, x, z, y, yaw, nid, ownerPid });
    level.audio.door();
  }

  // гість: барикада з мережі
  netWall(nid, ownerPid, x, z, yaw) {
    if (this.walls.some((w) => w.nid === nid)) return;
    this._buildWall(nid, x, z, yaw, ownerPid);
  }

  netWallGone(nid, broken) {
    const i = this.walls.findIndex((w) => w.nid === nid);
    if (i >= 0) this._removeWall(i, broken);
  }

  // куля гравця може влучити в барикаду (і зруйнувати її)
  wallHitTest(origin, dir, maxD) {
    let best = null;
    for (const w of this.walls) {
      for (const c of w.colliders) {
        // вертикальний циліндр r=0.55, висота 1.8
        const dx = c.x - origin.x, dz = c.z - origin.z;
        const t = dx * dir.x + dz * dir.z;
        if (t < 0.3 || t > maxD) continue;
        const px = origin.x + dir.x * t, pz = origin.z + dir.z * t;
        const py = origin.y + dir.y * t;
        if (Math.hypot(px - c.x, pz - c.z) < 0.55 && py > w.y - 0.2 && py < w.y + 1.9) {
          if (!best || t < best.t) best = { t, wall: w };
        }
      }
    }
    return best;
  }

  damageWall(w, dmg) {
    w.hp -= dmg;
    this.level.effects.burst(new THREE.Vector3(w.x, w.y + 1, w.z), 0xb08a5a, 4, { speed: 2.4, up: 2, life: 0.4, size: 0.7 });
    if (w.hp <= 0) {
      const i = this.walls.indexOf(w);
      if (i >= 0) this._removeWall(i, true);
    }
  }

  // ================= 🤖 ТУРЕЛЬ =================
  _placeTurret() {
    const pos = this._placePos(2.2);
    if (!pos) {
      this.level.bus.emit('toast', t('Тут не можна поставити турель 🙈'));
      return false;
    }
    this.placeTurretAt(pos.x, pos.z, 1);
    return true;
  }

  placeTurretAt(x, z, ownerPid) {
    const level = this.level;
    const nid = level.net && level.net.authority ? level.net.allocId() : ++this._gidSeq;
    this._buildTurret(nid, x, z, ownerPid);
    if (level.net && level.net.authority) {
      level.netEv('turr', nid, ownerPid, Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    }
    return true;
  }

  _buildTurret(nid, x, z, ownerPid) {
    const level = this.level;
    // одна активна турель на гравця — нова замінює стару
    const oldIdx = this.turrets.findIndex((t) => t.ownerPid === ownerPid);
    if (oldIdx >= 0) this._removeTurret(oldIdx, false);
    const y = level.world.groundH(x, z);
    const m = makeTurretMesh();
    m.group.position.set(x, y, z);
    level.scene.add(m.group);
    const collider = { x, z, r: 0.45, top: y + 1.3 };
    level.world.colliders.push(collider);
    level.world._buildGrid();
    this.turrets.push({
      nid, ownerPid, x, z, y,
      hp: TURRET.hp, life: TURRET.life, fireT: 0.6,
      mesh: m, collider, idleSpin: 0,
    });
    level.audio.powerup();
    level.effects.ring(new THREE.Vector3(x, y, z), 0x4fd8ff, 2.2);
  }

  _removeTurret(i, broken) {
    const level = this.level;
    const tu = this.turrets[i]; // не t: затінило б переклад
    if (!tu) return;
    this.turrets.splice(i, 1);
    if (level.net && level.net.authority) level.netEv('turrgo', tu.nid, broken ? 1 : 0);
    level.scene.remove(tu.mesh.group);
    level.world.colliders = level.world.colliders.filter((c) => c !== tu.collider);
    level.world._buildGrid();
    if (broken) {
      level.effects.burst(new THREE.Vector3(tu.x, tu.y + 1, tu.z), 0x7d8aa0, 14, { speed: 4, up: 3.5, life: 0.7, size: 1.1 });
      level.audio.shieldBreak();
      level.bus.emit('toast', t('🤖 Турель зламали!'));
    } else {
      level.effects.burst(new THREE.Vector3(tu.x, tu.y + 1, tu.z), 0x4fd8ff, 8, { speed: 2.5, up: 2, life: 0.5, size: 0.8 });
    }
  }

  // гість: турель із мережі (лише візуал — стріляє хост подіями tsh)
  netTurret(nid, ownerPid, x, z) {
    if (this.turrets.some((t) => t.nid === nid)) return;
    this._buildTurret(nid, x, z, ownerPid);
  }

  netTurretGone(nid, broken) {
    const i = this.turrets.findIndex((t) => t.nid === nid);
    if (i >= 0) this._removeTurret(i, broken);
  }

  // гість: постріл турелі — поворот голови, трасер, звук
  netTurretShot(nid, tx, ty, tz) {
    const tu = this.turrets.find((x) => x.nid === nid);
    if (!tu) return;
    tu.mesh.head.rotation.y = Math.atan2(-(tx - tu.x), -(tz - tu.z));
    const muzzle = new THREE.Vector3();
    tu.mesh.muzzle.getWorldPosition(muzzle);
    this.level.effects.tracer(muzzle, new THREE.Vector3(tx, ty, tz));
    const p = this.level.player.pos;
    if (Math.hypot(tu.x - p.x, tu.z - p.z) < 55) this.level.audio.shot('pistol');
  }

  // господар турелі (хост/соло): вибір цілі, стрільба, тиск зомбі, час життя
  _updateTurrets(dt) {
    const level = this.level;
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.life -= dt;
      if (t.life <= 0) { this._removeTurret(i, false); continue; }
      // зомбі гатять по турелі (як по барикаді)
      let pressure = 0;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || !z.aggroed) continue;
        if (Math.hypot(z.x - t.x, z.z - t.z) < 2.4) pressure += z.stats.dmg;
      }
      if (pressure > 0) {
        t.hp -= pressure * dt * 0.85;
        if (t.hp <= 0) { this._removeTurret(i, true); continue; }
      }
      // стрільба: найближчий живий зомбі в радіусі
      t.fireT -= dt;
      if (t.fireT > 0) continue;
      let best = null;
      let bd = TURRET.range;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || z.gone) continue;
        const d = Math.hypot(z.x - t.x, z.z - t.z);
        if (d < bd) { bd = d; best = z; }
      }
      if (!best) { t.fireT = 0.2; continue; }
      t.fireT = TURRET.fireCd;
      const ty = best.y + best.rig.height * 0.6;
      t.mesh.head.rotation.y = Math.atan2(-(best.x - t.x), -(best.z - t.z));
      const muzzle = new THREE.Vector3();
      t.mesh.muzzle.getWorldPosition(muzzle);
      level.effects.tracer(muzzle, new THREE.Vector3(best.x, ty, best.z));
      const p = level.player.pos;
      if (Math.hypot(t.x - p.x, t.z - p.z) < 55) level.audio.shot('pistol');
      const dir = new THREE.Vector3(best.x - t.x, 0, best.z - t.z).normalize();
      best.lastHitBy = t.ownerPid;
      best.damage(TURRET.dmg, dir, false);
      if (level.net && level.net.authority) {
        level.netEv('tsh', t.nid, Math.round(best.x * 10) / 10, Math.round(ty * 10) / 10, Math.round(best.z * 10) / 10);
      }
    }
  }

  _removeWall(i, broken) {
    const level = this.level;
    const w = this.walls[i];
    this.walls.splice(i, 1);
    if (level.net && level.net.authority) level.netEv('wallgo', w.nid, broken ? 1 : 0);
    level.scene.remove(w.mesh);
    level.world.colliders = level.world.colliders.filter((c) => !w.colliders.includes(c));
    level.world._buildGrid();
    if (broken) {
      level.effects.burst(new THREE.Vector3(w.x, w.y + 1, w.z), 0xb08a5a, 16, { speed: 4, up: 4, life: 0.8, size: 1.2 });
      level.audio.shieldBreak();
      level.bus.emit('toast', t('🧱 Барикаду зламали!'));
    }
  }
}
