// Іграшки рівня: 🦙 Мегабокс, 🐶 пес Дружок, 🛴 самокати, 🦘🧱 гаджети
import * as THREE from 'three';
import { t, keyHint, interactKey } from './i18n.js';
import {
  makeMegaboxMesh, makeScooter, makeTrampolineMesh, makeBarricadeMesh, makeTurretMesh,
  makeHero, updateRig, setAnim, PETS,
} from './characters.js';
import { disposeObject } from './utils.js';

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
        disposeObject(this.mesh.group);
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
      level.missions.prompt = { text: t('🦙 Натисни {k} — відкрий МЕГАБОКС!', { k: interactKey() }), hold: false };
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
  constructor(level, id = 'dog') {
    this.level = level;
    this.id = PETS[id] ? id : 'dog';
    this.move = PETS[this.id].move;
    this.model = PETS[this.id].make();
    const p = level.player.pos;
    this.x = p.x + 1.5;
    this.z = p.z + 1.5;
    this.y = level.world.groundH(this.x, this.z);
    this.yaw = 0;
    this.barkCd = 2;
    this.grabCd = 0;
    this.grabbing = null;
    level.scene.add(this.model.group);
  }

  dispose() {
    if (this.model && this.model.group) {
      this.level.scene.remove(this.model.group);
      disposeObject(this.model.group);
    }
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
          if (this.model.tail) this.model.tail.rotation.z = 1;
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

    // анімація залежно від типу руху улюбленця
    const g = this.model;
    g.phase += dt * (moving ? 14 : 3);
    let hopY = 0;
    if (this.move === 'bird') {
      // папуга: махи крил + легке ширяння над землею
      const flap = Math.sin(g.phase * (moving ? 1.0 : 0.7));
      if (g.wings) { g.wings[0].rotation.z = -(0.4 + flap * 0.8); g.wings[1].rotation.z = 0.4 + flap * 0.8; }
      if (g.tail) g.tail.rotation.x = Math.sin(g.phase * 0.6) * 0.2;
      hopY = 0.45 + Math.sin(g.phase * 0.8) * 0.1;
    } else if (this.move === 'hop') {
      // зайчик/жабка: підстрибують у русі
      const hop = Math.abs(Math.sin(g.phase * 0.5));
      if (g.legs) g.legs.forEach((leg) => { leg.rotation.x = moving ? -hop * 0.8 : 0; });
      hopY = moving ? hop * 0.4 : 0;
      if (g.tail) g.tail.rotation.z = Math.sin(g.phase) * 0.15;
    } else {
      // quad: крокують лапи, хвіст, голова; крила (дракон) трохи махають
      if (g.legs) g.legs.forEach((leg, i) => { leg.rotation.x = moving ? Math.sin(g.phase + (i % 2) * Math.PI) * 0.7 : 0; });
      if (g.tail) g.tail.rotation.z = Math.sin(g.phase * 1.6) * 0.5;
      if (g.head) g.head.rotation.x = moving ? 0 : Math.sin(g.phase * 0.5) * 0.12;
      if (g.wings) { const fl = Math.sin(g.phase * 0.8); g.wings[0].rotation.z = -(0.2 + fl * 0.3); g.wings[1].rotation.z = 0.2 + fl * 0.3; }
    }
    if (p.emoting) {
      hopY = Math.abs(Math.sin(g.phase * 0.8)) * 0.35; // улюбленець теж танцює!
      if (g.tail) g.tail.rotation.z = Math.sin(g.phase * 3) * 0.8;
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
            level.bus.emit('toast', t('🐾 Твій улюбленець щось відчуває поблизу…'));
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
          level.missions.prompt = { text: t('🛴 Натисни {k} — поїхали!', { k: interactKey() }), hold: false };
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
    this.level.bus.emit('toast', keyHint('🛴 Кермуй джойстиком, ✋ — зійти', '🛴 W — газ, S — гальмо, A/D — кермо. E — зійти'));
    this.level.bus.emit('scooterRide'); // 🎓 HUD покаже разове знайомство (раз назавжди)
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
// ponytail: більшість гаджетів коштує 1000 монет; кристальні винятки задає магазин.
export const GADGETS = {
  shield: { name: t('Щит'), icon: '🛡️', cd: 30, price: 1000, desc: t('Аварійна бульбашка: поглинає 50 шкоди') },
  heal: { name: t('Відновлення'), icon: '💚', cd: 25, price: 1000, desc: t('+50 здоров\'я миттєво') },
  tramp: { name: t('Кишеньковий батут'), icon: '🦘', cd: 20, price: 1000, desc: t('Постав і застрибни на дах') },
  // desc — getter: текст «забрати» залежить від керування і читається у момент показу
  wall: { name: t('Барикада'), icon: '🧱', cd: 25, price: 1000, get desc() { return t('Стіна на 100 міцності ({k})', { k: keyHint('кнопка ✋ — забрати', 'E — забрати') }); } },
  // 🤖 преміум: автоматична вогнева підтримка
  turret: { name: t('Турель'), icon: '🤖', cd: 45, price: 1000, desc: t('Сторожова турель: 30с сама обстрілює зомбі поруч') },
  clone: { name: t('Клон'), icon: '🧍', cd: 50, price: 1000, desc: t('Союзник: 50 HP, меч 10 зблизька, пістолет 5 здалека') },
  healtotem: { name: t('Тотем відновлення'), icon: '🪬', cd: 45, price: 0, desc: t('50 HP, лікує 5 HP/с у площі 8×8 м') },
  damagetotem: { name: t('Тотем шкоди'), icon: '🔥', cd: 45, price: 0, desc: t('50 HP, подвоює шкоду у площі 5×5 м') },
  watchtower: { name: t('Башня спостереження'), icon: '🗼', cd: 125, price: 1000, get desc() { return t('Залізна башта: {k} — залізти або спуститися', { k: interactKey() }); } },
  // 🩻 Ікс-рей: підсвічує всіх невидимих зомбі (Привидів) на 4с, перезарядка 25с
  xray: { name: t('Ікс-рей'), icon: '🩻', cd: 25, price: 1000, desc: t('Підсвічує всіх невидимих зомбі на 4 секунди') },
  infammo: { name: t('Бескінечні патрони'), icon: '♾️', cd: 45, price: 1000, desc: t('3 секунди автомат і швидкостріл не витрачають патрони') },
  invisibility: { name: t('Невидимка'), icon: '👻', cd: 45, price: 0, desc: t('Гравця не видно зомбі 5 секунд') },
  // 💫 Оглушливі кулі: 3с кулі пістолета/магнума оглушують зомбі на 0.5с
  stunammo: { name: t('Оглушливі кулі'), icon: '💫', cd: 45, price: 1000, desc: t('3 секунди кулі пістолета й магнума оглушують зомбі на 0.5с') },
  // 🪄 Телепортація: миттєвий ривок уперед на ~8м (вирватись із натовпу), перезарядка 45с
  // (іконка 🪄, а не 🌀 — 🌀 уже зайнятий швидкострілом)
  teleport: { name: t('Телепортація'), icon: '🪄', cd: 45, price: 1000, desc: t('Миттєвий стрибок уперед — вирвись із натовпу') },
  // 🍎 Золоте яблуко: +20 тимчасового HP на 5с (бонус-макс, згасає сам), перезарядка 45с
  goldapple: { name: t('Золоте яблуко'), icon: '🍎', cd: 45, price: 1000, desc: t('+20 здоров\'я на 5 секунд') },
  // ☄️ Метеорит: викликає з космосу метеорит на НАЙБЛИЖЧОГО зомбі — 135 шкоди згори
  meteor: { name: t('Метеорит'), icon: '☄️', cd: 45, price: 1000, desc: t('Метеорит з космосу — 250 шкоди по площі 7×7 м') },
};

// ☄️ напрямок удару метеорита — згори вниз: обходить фронтальний щит (кут) і нагрудник (headshot)
const METEOR_DOWN = new THREE.Vector3(0, -1, 0);

// баланс турелі: підтримка, а не заміна гравця (DPS героя ~180-220)
export const TURRET = { range: 14, dmg: 14, fireCd: 0.5, life: 30, hp: 120 };
export const TURRET_HYPER = { hp: 100, dmg: 25 };
const WATCHTOWER_HP = 200;

// 🗼 скіни башти: id → кольори (metal — ноги/щаблі, dark — платформа) + метадані для UI
export const TOWER_SKINS = {
  default: { name: t('Залізна башта'), icon: '🗼', metal: 0x6f7d8a, dark: 0x3c4650 },
  stone: { name: t('Камʼяна башта'), icon: '🪨', metal: 0x9b9489, dark: 0x6b6359 },
  gold: { name: t('Золота башта'), icon: '🏅', metal: 0xf4c430, dark: 0xb8860b },
};

function makeWatchtowerMesh(skinId) {
  const s = TOWER_SKINS[skinId] || TOWER_SKINS.default;
  const g = new THREE.Group();
  const metal = new THREE.MeshToonMaterial({ color: s.metal });
  const dark = new THREE.MeshToonMaterial({ color: s.dark });
  const legGeo = new THREE.CylinderGeometry(0.055, 0.075, 4.0, 6);
  for (const sx of [-0.85, 0.85]) {
    for (const sz of [-0.85, 0.85]) {
      const leg = new THREE.Mesh(legGeo, metal);
      leg.position.set(sx, 2, sz);
      leg.castShadow = true;
      g.add(leg);
    }
  }
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 2.2), dark);
  platform.position.y = 4.05;
  platform.castShadow = platform.receiveShadow = true;
  g.add(platform);
  for (const x of [-0.45, 0, 0.45]) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.07), metal);
    rung.position.set(x, 1.2 + (x + 0.45) * 2.2, -0.95);
    rung.castShadow = true;
    g.add(rung);
  }
  return g;
}

function makeHealTotemMesh() {
  const g = new THREE.Group();
  const gold = new THREE.MeshToonMaterial({ color: 0xffd23f });
  const green = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.8, 6), gold);
  body.position.y = 0.4;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), new THREE.MeshToonMaterial({ color: 0x2fe08a }));
  gem.position.y = 0.86;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.035, 8, 36), green);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  g.add(body, gem, ring);
  return g;
}

function makeDamageTotemMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.8, 6), new THREE.MeshToonMaterial({ color: 0xff6a2a }));
  body.position.y = 0.4;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), new THREE.MeshToonMaterial({ color: 0xffd23f }));
  gem.position.y = 0.86;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.5, 0.035, 8, 36),
    new THREE.MeshBasicMaterial({ color: 0xff5d5d, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  g.add(body, gem, ring);
  return g;
}

export class Gadgets {
  constructor(level) {
    this.level = level;
    this.cd = 0;
    this.tramps = [];
    this.walls = [];
    this.turrets = [];
    this.clones = [];
    this.totems = [];
    this.damageTotems = [];
    this.towers = [];
    this._meteorFires = [];
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

  get active() {
    if (this.level.noGadgets) return null;
    return this.level.playground ? this.level.playgroundGadget : this.level.game.save.activeGadget;
  }

  update(dt, input, allowControl) {
    const level = this.level;
    const p = level.player;
    if (this.cd > 0) this.cd -= dt;
    this._syncWatchtowerPlayer();
    if (allowControl && input.pressed('KeyY')) {
      this._toggleWatchtower();
      input.justPressed.delete('KeyY');
    } else if (allowControl && input.pressed('KeyE') && this._toggleWatchtower()) {
      // ✋ на тачі клавіші Y немає — підйом/спуск через кнопку взаємодії.
      // ponytail: KeyE з'їдається лише коли поряд башта (toggle вернув true), тож E-взаємодії місій цілі;
      // колізія можлива лише якщо башту поставлено в <2.6м від E-точки місії — рідкісний край.
      input.justPressed.delete('KeyE');
    }
    if (allowControl && p.health > 0 && input.pressed('KeyF')) this.use();
    this._updateMeteorFires(dt);

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
          level.missions.prompt = { text: t('🧱 Натисни {k} — забрати барикаду', { k: interactKey() }), hold: false };
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
    this._updateClones(dt);
    this._updateTotems(dt);
    this._updateDamageTotems(dt);
    this._updateTowers(dt);
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
    if (level.noGadgets) {
      level.bus.emit('toast', t('У цьому режимі гаджети вимкнені'));
      game.audio.denied();
      return false;
    }
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
      const hp = (game.save.gadgetHypers || []).includes('shield') ? 100 : 50;
      p.gadgetShield = hp;
      level.audio.powerup();
      level.bus.emit('toast', t('🛡️ Щит увімкнено: поглине {n} шкоди!', { n: hp }));
      ok = true;
    } else if (id === 'heal') {
      if (p.health >= p.maxHealth) {
        level.bus.emit('toast', t('Здоров\'я і так повне! 💪'));
        game.audio.denied();
        return false;
      }
      const hp = (game.save.gadgetHypers || []).includes('heal') ? 100 : 50;
      p.heal(hp);
      level.audio.heal();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.4), 0x6dff9c, 12, { speed: 2, up: 3, life: 0.8 });
      level.bus.emit('toast', t('💚 +{n} здоров\'я!', { n: hp }));
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
    } else if (id === 'clone') {
      if (level.mirror) {
        level.bus.emit('toast', t('Клон доступний тільки в соло 🙈'));
        return false;
      }
      ok = this._spawnClone();
    } else if (id === 'healtotem') {
      if (level.mirror) {
        level.bus.emit('toast', t('Тотем доступний тільки в соло 🙈'));
        return false;
      }
      ok = this._placeHealTotem();
    } else if (id === 'damagetotem') {
      if (level.mirror) {
        level.bus.emit('toast', t('Тотем доступний тільки в соло 🙈'));
        return false;
      }
      ok = this._placeDamageTotem();
    } else if (id === 'watchtower') {
      if (level.mirror) {
        level.bus.emit('toast', t('Башта доступна тільки в соло 🙈'));
        return false;
      }
      ok = this._placeWatchtower();
    } else if (id === 'xray') {
      // 🩻 локальний ефект (не синхронізуємо): підсвічує невидимих привидів на 4с
      level.zombies.xrayT = 4;
      level.audio.powerup();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.2), 0x9be8ff, 14, { speed: 3, up: 3, life: 0.7 });
      level.bus.emit('toast', t('🩻 Ікс-рей! Невидимі зомбі підсвічені на 4с'));
      ok = true;
    } else if (id === 'infammo') {
      p.infiniteAmmoT = 3;
      level.audio.powerup();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.2), 0xffd23f, 16, { speed: 3, up: 3, life: 0.7 });
      level.bus.emit('toast', t('♾️ Бескінечні патрони на 3с! Автомат і швидкостріл шаленіють'));
      ok = true;
    } else if (id === 'invisibility') {
      p.invisibleT = 5;
      p.rig.group.visible = false;
      level.audio.powerup();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.2), 0x9be8ff, 16, { speed: 3, up: 3, life: 0.7 });
      level.bus.emit('toast', t('👻 Невидимка на 5 секунд!'));
      ok = true;
    } else if (id === 'stunammo') {
      p.stunAmmoT = 3;
      level.audio.powerup();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.2), 0xc9a8ff, 16, { speed: 3, up: 3, life: 0.7 });
      level.bus.emit('toast', t('💫 Оглушливі кулі на 3с! Пістолет і магнум оглушують зомбі'));
      ok = true;
    } else if (id === 'teleport') {
      // 🌀 ривок уперед на ~20м; collide не дає опинитися в стіні чи за межами
      const dist = 20;
      const tx = p.pos.x - Math.sin(p.yaw) * dist;
      const tz = p.pos.z - Math.cos(p.yaw) * dist;
      const solved = level.world.collide(tx, tz, 0.45, p.pos.y);
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.0), 0x9b6bff, 18, { speed: 4, up: 3, life: 0.6 });
      p.watchtower = null; // якщо стояв на башті — телепорт знімає
      p.pos.x = solved.x;
      p.pos.z = solved.z;
      p.pos.y = Math.max(level.world.groundH(solved.x, solved.z), level.world.floorAt(solved.x, solved.z, p.pos.y));
      p.vel.set(0, 0, 0);
      p.onGround = true;
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.0), 0x9b6bff, 18, { speed: 4, up: 3, life: 0.6 });
      level.audio.powerup();
      level.bus.emit('toast', t('🪄 Телепорт!'));
      ok = true;
    } else if (id === 'goldapple') {
      const hp = (game.save.gadgetHypers || []).includes('goldapple') ? 40 : 20;
      // бонус-HP на 5с; guard appleT<=0 не дає подвоїти бонус (cd 45с і так не дасть)
      if (p.appleT <= 0) { p.appleBonus = hp; p.maxHealth += hp; p.health += hp; }
      p.appleT = 5;
      level.audio.heal();
      level.effects.burst(p.pos.clone().setY(p.pos.y + 1.4), 0xffd23f, 16, { speed: 2.5, up: 3, life: 0.9 });
      level.bus.emit('toast', t('🍎 Золоте яблуко: +{n} здоров\'я на 5с!', { n: hp }));
      ok = true;
    } else if (id === 'meteor') {
      // ☄️ гість шле запит хосту (шкода — авторитетна), хост/соло б'є напряму
      ok = level.mirror ? this._requestMeteor() : this._callMeteor();
    }
    if (ok) {
      this.cd = level.playground ? 0 : GADGETS[id].cd;
      level.bus.emit('gadgetUsed', id);
    }
    return ok;
  }

  // ☄️ найближчий ЖИВИЙ зомбі до точки (соло/хост мають авторитетний список)
  _nearestZombie(x, z) {
    let best = null, bd = Infinity;
    for (const zb of this.level.zombies.list) {
      if (zb.state === 'dead' || zb.gone) continue;
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d < bd) { bd = d; best = zb; }
    }
    return best;
  }

  // 💥 шкода ЗГОРИ по ВСІХ живих зомбі в зоні 7×7 м: 135 звичайним, 500 роботу (мех трощиться).
  // METEOR_DOWN обходить фронтальний щит, headshot — нагрудник.
  _meteorAoE(x, z, hyper = false) {
    for (const zb of this.level.zombies.list) {
      if (zb.state === 'dead' || zb.gone) continue;
      if (Math.abs(zb.x - x) <= 3.5 && Math.abs(zb.z - z) <= 3.5) {
        zb.damage(zb.type === 'robot' ? 500 : 250, METEOR_DOWN, true);
      }
    }
    if (hyper) this._addMeteorFire(x, z, true);
  }

  _addMeteorFire(x, z, damage = true) {
    const y = this.level.world.groundH(x, z) + 0.04;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.5, 0.05, 24),
      new THREE.MeshBasicMaterial({ color: 0xff6a18, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    mesh.position.set(x, y, z);
    this.level.scene.add(mesh);
    this._meteorFires.push({ x, z, mesh, life: 10, damage });
  }

  _updateMeteorFires(dt) {
    for (let i = this._meteorFires.length - 1; i >= 0; i--) {
      const f = this._meteorFires[i];
      f.life -= dt;
      f.mesh.rotation.y += dt * 1.7;
      const pulse = 0.96 + Math.sin(f.life * 9) * 0.04;
      f.mesh.scale.set(pulse, 1, pulse);
      if (f.damage) {
        for (const zb of this.level.zombies.list) {
          if (zb.state === 'dead' || zb.gone) continue;
          if (Math.hypot(zb.x - f.x, zb.z - f.z) <= 3.5) zb.damage(10 * dt, null, false, { fire: true });
        }
      }
      if (f.life <= 0) {
        this.level.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this._meteorFires.splice(i, 1);
      }
    }
  }

  // ціль метеорита: ПРІОРИТЕТНО найближчий робот поблизу (≤50м), інакше найближчий зомбі
  // (робот великий/повільний — без пріоритету метеорит падав би на дрібних)
  _meteorTarget(x, z) {
    let robot = null, rd = Infinity;
    for (const zb of this.level.zombies.list) {
      if (zb.type !== 'robot' || zb.state === 'dead' || zb.gone) continue;
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d < rd) { rd = d; robot = zb; }
    }
    if (robot && rd <= 50) return robot;
    return this._nearestZombie(x, z);
  }

  // соло/хост: метеорит падає на точку найближчого зомбі, б'є площу 7×7; візуал гостям ('met')
  _callMeteor() {
    const level = this.level;
    const zb = this._meteorTarget(level.player.pos.x, level.player.pos.z);
    if (!zb) { level.bus.emit('toast', t('☄️ Немає цілі поблизу!')); level.game.audio.denied(); return false; }
    const ix = zb.x, iz = zb.z;
    const hyper = (level.game.save.gadgetHypers || []).includes('meteor');
    level.effects.callMeteor(ix, iz, () => this._meteorAoE(ix, iz, hyper), level.player.pos.x, level.player.pos.z);
    level.audio.powerup();
    level.bus.emit('toast', t('☄️ Метеорит летить!'));
    if (level.net && level.net.authority) level.netEv('met', Math.round(ix * 10) / 10, Math.round(iz * 10) / 10, hyper ? 1 : 0);
    return true;
  }

  // гість: просимо хоста викликати метеорит (шле нашу позицію — хост шукає ціль)
  _requestMeteor() {
    const p = this.level.player;
    this.level.net.sendGadget('meteor', p.pos.x, p.pos.z, p.yaw, (this.level.game.save.gadgetHypers || []).includes('meteor'));
    return true;
  }

  // хост: метеорит на найближчого до позиції гравця-замовника, площа 7×7 + розсилка візуалу
  hostMeteor(x, z, hyper = false) {
    const zb = this._meteorTarget(x, z);
    if (!zb) return;
    const ix = zb.x, iz = zb.z;
    this.level.effects.callMeteor(ix, iz, () => this._meteorAoE(ix, iz, hyper), x, z);
    this.level.netEv('met', Math.round(ix * 10) / 10, Math.round(iz * 10) / 10, hyper ? 1 : 0);
  }

  _placePos(dist) {
    const p = this.level.player;
    const x = p.pos.x - Math.sin(p.yaw) * dist;
    const z = p.pos.z - Math.cos(p.yaw) * dist;
    const solved = this.level.world.collide(x, z, 0.7);
    if (Math.hypot(solved.x - x, solved.z - z) > 0.4) return null;
    return { x, z, y: this.level.world.groundH(x, z) };
  }

  _spawnClone() {
    const pos = this._placePos(1.8);
    if (!pos) {
      this.level.bus.emit('toast', t('Тут не можна створити клона 🙈'));
      return false;
    }
    while (this.clones.length) this._removeClone(0, false);
    const count = (this.level.game.save.gadgetHypers || []).includes('clone') ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * 1.1;
      const x = pos.x + Math.cos(this.level.player.yaw) * off;
      const z = pos.z - Math.sin(this.level.player.yaw) * off;
      const y = this.level.world.groundH(x, z);
      const rig = makeHero('ninja');
      const shieldMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.72, 1),
        new THREE.MeshBasicMaterial({ color: 0x8fd3ff, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      shieldMesh.position.y = 1.05;
      rig.group.add(shieldMesh);
      rig.group.position.set(x, y, z);
      this.level.scene.add(rig.group);
      const clone = { x, z, y, hp: 50, shieldHp: 20, shieldMesh, hitT: 0, rig, mesh: rig.group };
      clone.takeDamage = (dmg) => {
        const block = Math.min(clone.shieldHp || 0, dmg);
        clone.shieldHp = Math.max(0, (clone.shieldHp || 0) - block);
        clone.hp -= dmg - block;
        if (clone.shieldMesh) {
          if (clone.shieldHp > 0) clone.shieldMesh.material.opacity = 0.16 + 0.18 * (clone.shieldHp / 20);
          else { rig.group.remove(clone.shieldMesh); disposeObject(clone.shieldMesh); clone.shieldMesh = null; }
        }
      };
      this.clones.push(clone);
    }
    this.level.audio.powerup();
    this.level.effects.ring(new THREE.Vector3(pos.x, pos.y, pos.z), 0x8fd3ff, 1.8);
    this.level.bus.emit('toast', count > 1 ? t('🧍🧍 Клони у бою!') : t('🧍 Клон у бою!'));
    return true;
  }

  _removeClone(i, broken) {
    const c = this.clones[i];
    if (!c) return;
    this.clones.splice(i, 1);
    this.level.scene.remove(c.mesh);
    disposeObject(c.mesh);
    if (broken) {
      this.level.effects.burst(new THREE.Vector3(c.x, c.y + 1, c.z), 0x8fd3ff, 12, { speed: 3, up: 3, life: 0.6 });
      this.level.bus.emit('toast', t('🧍 Клона перемогли!'));
    }
  }

  _placeHealTotem() {
    const pos = this._placePos(2.0);
    if (!pos) {
      this.level.bus.emit('toast', t('Тут не можна поставити тотем 🙈'));
      return false;
    }
    while (this.totems.length) this._removeTotem(0, false);
    const mesh = makeHealTotemMesh();
    mesh.position.set(pos.x, pos.y, pos.z);
    this.level.scene.add(mesh);
    this.totems.push({ x: pos.x, z: pos.z, y: pos.y, hp: 50, pulseT: 0, mesh });
    this.level.audio.heal();
    this.level.effects.totemBurst(new THREE.Vector3(pos.x, pos.y + 0.6, pos.z));
    this.level.bus.emit('toast', t('🪬 Тотем відновлення поставлено!'));
    return true;
  }

  _removeTotem(i, broken) {
    const ttm = this.totems[i];
    if (!ttm) return;
    this.totems.splice(i, 1);
    this.level.scene.remove(ttm.mesh);
    disposeObject(ttm.mesh);
    if (broken) {
      this.level.effects.burst(new THREE.Vector3(ttm.x, ttm.y + 0.6, ttm.z), 0x39ff88, 12, { speed: 3, up: 3, life: 0.6 });
      this.level.bus.emit('toast', t('🪬 Тотем зламали!'));
    }
  }

  _placeDamageTotem() {
    const pos = this._placePos(2.0);
    if (!pos) {
      this.level.bus.emit('toast', t('Тут не можна поставити тотем 🙈'));
      return false;
    }
    while (this.damageTotems.length) this._removeDamageTotem(0, false);
    const mesh = makeDamageTotemMesh();
    mesh.position.set(pos.x, pos.y, pos.z);
    this.level.scene.add(mesh);
    this.damageTotems.push({ x: pos.x, z: pos.z, y: pos.y, hp: 50, pulseT: 0, mesh });
    this.level.audio.powerup();
    this.level.effects.burst(new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), 0xff6a2a, 18, { speed: 5, up: 5, life: 0.7 });
    this.level.bus.emit('toast', t('🔥 Тотем шкоди поставлено!'));
    return true;
  }

  _removeDamageTotem(i, broken) {
    const ttm = this.damageTotems[i];
    if (!ttm) return;
    this.damageTotems.splice(i, 1);
    this.level.scene.remove(ttm.mesh);
    disposeObject(ttm.mesh);
    this.level.player.damageTotemMult = 1;
    if (broken) {
      this.level.effects.burst(new THREE.Vector3(ttm.x, ttm.y + 0.6, ttm.z), 0xff6a2a, 12, { speed: 3, up: 3, life: 0.6 });
      this.level.bus.emit('toast', t('🔥 Тотем шкоди зламали!'));
    }
  }

  _updateDamageTotems(dt) {
    const level = this.level;
    const players = level.players || [level.player];
    for (const pl of players) pl.damageTotemMult = 1;
    for (let i = this.damageTotems.length - 1; i >= 0; i--) {
      const ttm = this.damageTotems[i];
      let pressure = 0;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || !z.aggroed) continue;
        if (Math.hypot(z.x - ttm.x, z.z - ttm.z) < 2.4) pressure += z.stats.dmg;
      }
      if (pressure) {
        ttm.hp -= pressure * dt * 0.85;
        if (ttm.hp <= 0) { this._removeDamageTotem(i, true); continue; }
      }
      for (const pl of players) {
        if (pl.health > 0 && Math.abs(pl.pos.x - ttm.x) <= 2.5 && Math.abs(pl.pos.z - ttm.z) <= 2.5) pl.damageTotemMult = 2;
      }
      ttm.pulseT -= dt;
      if (ttm.pulseT <= 0) {
        ttm.pulseT = 1;
        level.effects.ring(new THREE.Vector3(ttm.x, ttm.y, ttm.z), 0xff5d5d, 2.5);
      }
    }
  }

  _updateTotems(dt) {
    const level = this.level;
    for (let i = this.totems.length - 1; i >= 0; i--) {
      const ttm = this.totems[i];
      let pressure = 0;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || !z.aggroed) continue;
        if (Math.hypot(z.x - ttm.x, z.z - ttm.z) < 2.4) pressure += z.stats.dmg;
      }
      if (pressure) {
        ttm.hp -= pressure * dt * 0.85;
        if (ttm.hp <= 0) { this._removeTotem(i, true); continue; }
      }
      const players = level.players || [level.player];
      for (const pl of players) {
        if (pl.health <= 0 || Math.abs(pl.pos.x - ttm.x) > 4 || Math.abs(pl.pos.z - ttm.z) > 4) continue;
        if (pl === level.player || pl.pid === 1 || !level.net || !level.net.authority) pl.heal(5 * dt);
        else level.net.healPlayer(pl, 5 * dt);
      }
      ttm.pulseT -= dt;
      if (ttm.pulseT <= 0) {
        ttm.pulseT = 1;
        level.effects.ring(new THREE.Vector3(ttm.x, ttm.y, ttm.z), 0x39ff88, 4);
      }
    }
  }

  _updateClones(dt) {
    const level = this.level;
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      let pressure = 0;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || !z.aggroed) continue;
        if (Math.hypot(z.x - c.x, z.z - c.z) < 1.6) pressure += z.stats.dmg;
      }
      if (pressure) {
        if (c.takeDamage) c.takeDamage(pressure * dt * 0.85);
        else c.hp -= pressure * dt * 0.85;
      }
      if (c.hp <= 0) { this._removeClone(i, true); continue; }

      const target = this._nearestZombie(c.x, c.z);
      if (!target) { setAnim(c.rig, 'idle'); updateRig(c.rig, dt); continue; }
      const dx = target.x - c.x, dz = target.z - c.z;
      const dist = Math.hypot(dx, dz);
      c.mesh.rotation.y = Math.atan2(-dx, -dz);
      if (dist > 2.0) {
        const step = Math.min(dist - 1.8, 5.5 * dt);
        const solved = level.world.collide(c.x + (dx / dist) * step, c.z + (dz / dist) * step, 0.45, c.y);
        c.x = solved.x; c.z = solved.z; c.y = level.world.groundH(c.x, c.z);
        c.mesh.position.set(c.x, c.y, c.z);
        setAnim(c.rig, 'run');
      } else {
        setAnim(c.rig, 'idle');
      }
      for (let j = 0; j < this.clones.length; j++) {
        if (j === i) continue;
        const o = this.clones[j];
        let sx = c.x - o.x, sz = c.z - o.z;
        let sd = Math.hypot(sx, sz);
        if (sd >= 1.35) continue;
        if (sd < 0.001) { const a = (i + 1) * 2.4; sx = Math.cos(a); sz = Math.sin(a); sd = 1; }
        const push = (1.35 - sd) * 0.75;
        c.x += (sx / sd) * push;
        c.z += (sz / sd) * push;
        const solved = level.world.collide(c.x, c.z, 0.45, c.y);
        c.x = solved.x; c.z = solved.z; c.y = level.world.groundH(c.x, c.z);
        c.mesh.position.set(c.x, c.y, c.z);
      }
      c.hitT -= dt;
      if (c.hitT <= 0 && dist <= 16) {
        const melee = dist <= 2.1;
        const visible = melee || level.world.shotBlockDist(new THREE.Vector3(c.x, c.y + 1.25, c.z), new THREE.Vector3(dx, 0, dz).normalize(), dist) >= dist - 0.2;
        if (!visible) { c.hitT = 0.25; updateRig(c.rig, dt); continue; }
        c.hitT = melee ? 0.7 : 0.9;
        target.lastHitBy = 1;
        target.damage(melee ? 10 : 5, new THREE.Vector3(dx, 0, dz).normalize(), false);
        setAnim(c.rig, melee ? 'attack' : 'aim');
        if (!melee) {
          level.effects.tracer(new THREE.Vector3(c.x, c.y + 1.25, c.z), new THREE.Vector3(target.x, target.y + target.rig.height * 0.6, target.z));
          level.audio.shot('pistol');
        }
      }
      updateRig(c.rig, dt);
    }
  }

  // ================= 🗼 БАШТА СПОСТЕРЕЖЕННЯ =================
  _placeWatchtower() {
    const pos = this._placePos(2.6);
    if (!pos) {
      this.level.bus.emit('toast', t('Тут не можна поставити башту 🙈'));
      return false;
    }
    this.placeWatchtowerAt(pos.x, pos.z, 1);
    return true;
  }

  placeWatchtowerAt(x, z, ownerPid) {
    const level = this.level;
    const oldIdx = this.towers.findIndex((t) => t.ownerPid === ownerPid);
    if (oldIdx >= 0) this._removeWatchtower(oldIdx, false);
    const y = level.world.groundH(x, z);
    const mesh = makeWatchtowerMesh(level.game && level.game.save && level.game.save.activeTowerSkin);
    mesh.position.set(x, y, z);
    level.scene.add(mesh);
    const collider = { x, z, r: 0.8, top: y + 2.4 };
    level.world.colliders.push(collider);
    level.world._buildGrid();
    this.towers.push({ x, z, y, topY: y + 4.25, hp: WATCHTOWER_HP, ownerPid, mesh, collider });
    level.audio.powerup();
    level.effects.ring(new THREE.Vector3(x, y, z), 0x9aa8b5, 2.4);
    return true;
  }

  _toggleWatchtower() {
    const p = this.level.player;
    const current = p.watchtower;
    if (current && this.towers.includes(current)) {
      p.watchtower = null;
      p.pos.set(current.x + 1.9, this.level.world.groundH(current.x + 1.9, current.z), current.z);
      p.vel.set(0, 0, 0);
      p.onGround = true;
      return true;
    }
    let best = null, bd = 2.6;
    for (const t of this.towers) {
      const d = Math.hypot(p.pos.x - t.x, p.pos.z - t.z);
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) return false;
    p.watchtower = best;
    p.pos.set(best.x, best.topY, best.z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    return true;
  }

  _syncWatchtowerPlayer() {
    const p = this.level.player;
    const t = p.watchtower;
    if (!t) return;
    if (!this.towers.includes(t) || Math.hypot(p.pos.x - t.x, p.pos.z - t.z) > 1.2) {
      p.watchtower = null;
      return;
    }
    p.pos.y = t.topY;
    p.vel.y = 0;
    p.onGround = true;
  }

  _updateTowers(dt) {
    const level = this.level;
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const t = this.towers[i];
      let pressure = 0;
      for (const z of level.zombies.list) {
        if (z.state === 'dead' || !z.aggroed) continue;
        if (Math.hypot(z.x - t.x, z.z - t.z) < 2.6) pressure += z.stats.dmg;
      }
      if (pressure > 0) {
        t.hp -= pressure * dt * 0.85;
        if (t.hp <= 0) this._removeWatchtower(i, true);
      }
    }
  }

  _removeWatchtower(i, broken) {
    const level = this.level;
    const tower = this.towers[i];
    if (!tower) return;
    this.towers.splice(i, 1);
    if (level.player.watchtower === tower) {
      level.player.watchtower = null;
      level.player.pos.set(tower.x + 1.9, level.world.groundH(tower.x + 1.9, tower.z), tower.z);
      level.player.vel.set(0, 0, 0);
    }
    level.scene.remove(tower.mesh);
    disposeObject(tower.mesh); // per-instance гео/матеріали вежі; спільний toon-кеш guard-неться
    level.world.colliders = level.world.colliders.filter((c) => c !== tower.collider);
    level.world._buildGrid();
    if (broken) {
      level.effects.burst(new THREE.Vector3(tower.x, tower.y + 2, tower.z), 0x7d8aa0, 18, { speed: 4, up: 4, life: 0.8, size: 1.0 });
      level.audio.shieldBreak();
      level.bus.emit('toast', t('🗼 Башту зламали!'));
    }
  }

  // гість: просимо хоста поставити гаджет у нашій точці
  _requestPlace(kind, dist) {
    const pos = this._placePos(dist);
    if (!pos) {
      this.level.bus.emit('toast', kind === 'wall' ? t('Тут не можна поставити барикаду 🙈')
        : kind === 'turret' ? t('Тут не можна поставити турель 🙈') : t('Тут не можна поставити батут 🙈'));
      return false;
    }
    const hyper = kind === 'turret' && (this.level.game.save.gadgetHypers || []).includes('turret');
    this.level.net.sendGadget(kind, pos.x, pos.z, this.level.player.yaw, hyper);
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
    disposeObject(t.mesh);
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
    this.placeTurretAt(pos.x, pos.z, 1, (this.level.game.save.gadgetHypers || []).includes('turret'));
    return true;
  }

  placeTurretAt(x, z, ownerPid, hyper = false) {
    const level = this.level;
    const nid = level.net && level.net.authority ? level.net.allocId() : ++this._gidSeq;
    this._buildTurret(nid, x, z, ownerPid, hyper);
    if (level.net && level.net.authority) {
      level.netEv('turr', nid, ownerPid, Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    }
    return true;
  }

  _buildTurret(nid, x, z, ownerPid, hyper = false) {
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
      hp: hyper ? TURRET_HYPER.hp : TURRET.hp,
      dmg: hyper ? TURRET_HYPER.dmg : TURRET.dmg,
      life: TURRET.life, fireT: 0.6,
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
    disposeObject(tu.mesh.group); // турелі експайрять кожні ~30с — інакше течуть весь сеанс
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
      best.damage(t.dmg || TURRET.dmg, dir, false);
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
    disposeObject(w.mesh); // стіни рецикляться — диспозимо per-instance гео
    level.world.colliders = level.world.colliders.filter((c) => !w.colliders.includes(c));
    level.world._buildGrid();
    if (broken) {
      level.effects.burst(new THREE.Vector3(w.x, w.y + 1, w.z), 0xb08a5a, 16, { speed: 4, up: 4, life: 0.8, size: 1.2 });
      level.audio.shieldBreak();
      level.bus.emit('toast', t('🧱 Барикаду зламали!'));
    }
  }
}
