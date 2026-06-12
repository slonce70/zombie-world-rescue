// Іграшки рівня: 🦙 Мегабокс, 🐶 пес Дружок, 🛴 самокати, 🦘🧱 гаджети
import * as THREE from 'three';
import {
  makeMegaboxMesh, makeDog, makeScooter, makeTrampolineMesh, makeBarricadeMesh,
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
      level.bus.emit('toast', '🦙 МЕГАБОКС поблизу! Знайди фіолетовий промінь!');
    }
    if (d < 3.6 && !level.missions.prompt) {
      level.missions.prompt = { text: '🦙 Натисни E — відкрий МЕГАБОКС!', hold: false };
      if (allowControl && input.pressed('KeyE')) this.open();
    }
  }

  open() {
    if (this.opened) return;
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
    level.game.openMegaboxReward(this.x, this.z);
    level.bus.emit('megaboxOpened');
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
            level.bus.emit('toast', '🐶 Гав-гав! Дружок щось відчуває поблизу…');
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
    if (this.riding) {
      const r = this.riding;
      // самокат під ногами героя, нахиляється в поворот разом із ним
      r.sc.group.position.set(p.pos.x, p.pos.y, p.pos.z);
      r.sc.group.rotation.set(0, p.yaw, -(p._rideSteer || 0) * 0.14);
      for (const w of r.sc.wheels) w.rotation.x -= p.rideSpeed * dt * 6;
      // зійти: E
      if (allowControl && input.pressed('KeyE')) {
        input.justPressed.delete('KeyE');
        this.dismount();
      }
      return;
    }
    // сісти: E біля самоката
    if (p.emoting || p.health <= 0) return;
    for (const r of this.list) {
      const d = Math.hypot(p.pos.x - r.x, p.pos.z - r.z);
      if (d < 2.4) {
        if (!level.missions.prompt) {
          level.missions.prompt = { text: '🛴 Натисни E — поїхали!', hold: false };
        }
        if (allowControl && input.pressed('KeyE')) {
          input.justPressed.delete('KeyE');
          this.mount(r);
        }
        break;
      }
    }
  }

  mount(r) {
    const p = this.level.player;
    this.riding = r;
    r.taken = true;
    p.riding = r;
    p.rideSpeed = 0;
    this._wasFP = p.firstPerson;
    p.firstPerson = false; // на самокаті видно героя збоку
    p._applyView();
    r.sc.group.rotation.z = 0;
    this.level.audio.bell();
    this.level.bus.emit('toast', '🛴 W — газ, S — гальмо, A/D — кермо. E — зійти');
  }

  dismount() {
    const r = this.riding;
    const p = this.level.player;
    if (!r) return;
    this.riding = null;
    p.riding = null;
    p.rideSpeed = 0;
    r.taken = false;
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
  shield: { name: 'Щит', icon: '🛡️', cd: 30, price: 300, desc: 'Поглинає 255 шкоди, поки не розіб\'ється' },
  heal: { name: 'Відновлення', icon: '💚', cd: 25, price: 250, desc: '+50 здоров\'я миттєво' },
  tramp: { name: 'Кишеньковий батут', icon: '🦘', cd: 20, price: 150, desc: 'Постав і застрибни на дах' },
  wall: { name: 'Барикада', icon: '🧱', cd: 25, price: 200, desc: 'Стіна на 100 міцності (E — забрати)' },
};

export class Gadgets {
  constructor(level) {
    this.level = level;
    this.cd = 0;
    this.tramps = [];
    this.walls = [];
    this._thunkCd = 0;
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
      this.shieldMesh.material.opacity = 0.1 + 0.2 * (p.gadgetShield / 255);
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
          this._removeWall(i, false);
          level.bus.emit('toast', '🧱 Барикаду забрано назад');
          level.audio.pickup();
          break;
        }
      }
    }
    // підказка біля своєї барикади
    if (!level.missions.prompt) {
      for (const w of this.walls) {
        if (Math.hypot(p.pos.x - w.x, p.pos.z - w.z) < 3.2) {
          level.missions.prompt = { text: '🧱 Натисни E — забрати барикаду', hold: false };
          break;
        }
      }
    }

    // зомбі гатять по барикадах
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
      level.bus.emit('toast', '🧰 Обери гаджет у Гардеробі на глобусі!');
      return false;
    }
    if (this.cd > 0) {
      level.bus.emit('toast', `${GADGETS[id].icon} Ще ${Math.ceil(this.cd)}с перезарядки…`);
      game.audio.denied();
      return false;
    }
    const p = level.player;
    let ok = false;
    if (id === 'shield') {
      p.gadgetShield = 255;
      level.audio.powerup();
      level.bus.emit('toast', '🛡️ Щит увімкнено: поглине 255 шкоди!');
      ok = true;
    } else if (id === 'heal') {
      if (p.health >= p.maxHealth) {
        level.bus.emit('toast', 'Здоров\'я і так повне! 💪');
        game.audio.denied();
        return false;
      }
      p.heal(50);
      level.audio.heal();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.4), 0x6dff9c, 12, { speed: 2, up: 3, life: 0.8 });
      level.bus.emit('toast', '💚 +50 здоров\'я!');
      ok = true;
    } else if (id === 'tramp') {
      ok = this._placeTramp();
    } else if (id === 'wall') {
      ok = this._placeWall();
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

  _placeTramp() {
    const pos = this._placePos(2.1);
    if (!pos) {
      this.level.bus.emit('toast', 'Тут не можна поставити батут 🙈');
      return false;
    }
    const mesh = makeTrampolineMesh();
    mesh.position.set(pos.x, pos.y, pos.z);
    this.level.scene.add(mesh);
    const pad = { x: pos.x, z: pos.z, y: pos.y, power: 15, cd: 0 };
    this.level.world.jumpPads.push(pad);
    this.tramps.push({ mesh, pad });
    if (this.tramps.length > 3) {
      const old = this.tramps.shift();
      this.level.scene.remove(old.mesh);
      const idx = this.level.world.jumpPads.indexOf(old.pad);
      if (idx >= 0) this.level.world.jumpPads.splice(idx, 1);
    }
    this.level.audio.boing();
    this.level.effects.ring(new THREE.Vector3(pos.x, pos.y, pos.z), 0x4fa8e8, 2);
    return true;
  }

  _placeWall() {
    const level = this.level;
    const pos = this._placePos(2.6);
    if (!pos) {
      level.bus.emit('toast', 'Тут не можна поставити барикаду 🙈');
      return false;
    }
    const yaw = level.player.yaw;
    const mesh = makeBarricadeMesh();
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.rotation.y = yaw;
    level.scene.add(mesh);
    const colliders = [];
    for (const off of [-0.85, 0, 0.85]) {
      const cx = pos.x + Math.cos(yaw) * off;
      const cz = pos.z - Math.sin(yaw) * off;
      const col = { x: cx, z: cz, r: 0.55, top: pos.y + 1.8 };
      level.world.colliders.push(col);
      colliders.push(col);
    }
    level.world._buildGrid();
    this.walls.push({ mesh, colliders, hp: 100, x: pos.x, z: pos.z, y: pos.y, yaw });
    level.audio.door();
    return true;
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

  _removeWall(i, broken) {
    const level = this.level;
    const w = this.walls[i];
    this.walls.splice(i, 1);
    level.scene.remove(w.mesh);
    level.world.colliders = level.world.colliders.filter((c) => !w.colliders.includes(c));
    level.world._buildGrid();
    if (broken) {
      level.effects.burst(new THREE.Vector3(w.x, w.y + 1, w.z), 0xb08a5a, 16, { speed: 4, up: 4, life: 0.8, size: 1.2 });
      level.audio.shieldBreak();
      level.bus.emit('toast', '🧱 Барикаду зламали!');
    }
  }
}
