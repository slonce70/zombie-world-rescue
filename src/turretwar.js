// 🗼⚔️ «Оборона турелі» (дизайн Влада, v236): коридор 200×50, дві турелі по 500 HP.
// На старті біля зомбі-турелі спавниться ворожий РОБОТ (1000 HP, 20 шкоди зблизька),
// на 30-й секунді біля турелі гравця — робот-СОЮЗНИК (1000 HP), що йде ламати ворожу.
// Кожні 10с біля зомбі-турелі — 5 зомбі. Кожна турель раз/с б'є 50 шкоди по площі
// 50×50 навколо себе. Єдина зброя — 🔨 молот (35, 1 удар/с). Перемога — знеси ворожу
// турель (молотом і роботом), поразка — впала твоя турель або ти.
import * as THREE from 'three';
import { t } from './i18n.js';
import { makeZombie, updateRig, setAnim } from './characters.js';
import { RNG } from './utils.js';

export const TURRETWAR_UNLOCK_COUNTRIES = 12;
const TURRET_HP = 500;
const TURRET_DMG = 50;       // раз на секунду
const TURRET_ZONE = 25;      // половина квадрата 50×50
const ROBOT_HP = 1000;
const ROBOT_DMG = 20;        // удар робота по турелі (раз на секунду)
const WAVE_EVERY = 10;
const WAVE_SIZE = 5;
const ALLY_AT = 30;          // союзник на другій 30-секундці
const ALIVE_CAP = 25;        // ponytail: кап живих, щоб хвилі не з'їли draw calls

export class TurretWarMode {
  constructor(level) {
    this.level = level;
    this.roomW = 200;
    this.roomD = 50;
    const a = level.world.layout.arena || { x: 0, z: 0 };
    this.cx = a.x;
    this.cz = a.z;
    this._halfW = this.roomW / 2;
    this._halfD = this.roomD / 2;
    this.floorY = this._calcFloorY();
    // турель гравця — захід, зомбі-турель — схід
    this.px = this.cx - this._halfW + 12;
    this.ex = this.cx + this._halfW - 12;
    this.playerHp = TURRET_HP;
    this.enemyHp = TURRET_HP;
    this.time = 0;
    this.waveT = 0;          // перша хвиля одразу
    this.fireT = 1;
    this.allySpawned = false;
    this.enemyRobot = null;
    this.ally = null;        // робот-союзник: НЕ зомбі (свій риг, зомбі його не бачать)
    this.completed = false;
    this.over = false;
    this.prompt = null;
    this.missions = [];
    this.civilians = [];
    this.bossStarted = false;
    this.bossUnlocked = false;
    this.allDone = false;
    this._lastCd = 0;
    this._buildRoom();
    this._spawnEnemyRobot();
  }

  get(id) { void id; return null; }

  getHudList() {
    return [
      { icon: '🗼', title: t('Твоя турель: {n}/{t} HP', { n: Math.max(0, Math.ceil(this.playerHp)), t: TURRET_HP }), done: false },
      { icon: '💀', title: t('Зомбі-турель: {n}/{t} HP', { n: Math.max(0, Math.ceil(this.enemyHp)), t: TURRET_HP }), done: this.enemyHp <= 0 },
      { icon: '🤖', title: this.ally ? t('Твій робот: {n} HP', { n: Math.max(0, Math.ceil(this.ally.hp)) }) : t('Робот-союзник прибуде на {n}с', { n: ALLY_AT }), done: false },
      { icon: '🔨', title: t('Тільки молот. Без магазину, гаджетів і пікапів.'), done: false },
    ];
  }

  getMarkers() {
    const out = [
      { x: this.px, z: this.cz, color: '#ffd23f', icon: '🗼' },
      { x: this.ex, z: this.cz, color: '#ff5d73', icon: '💀' },
    ];
    if (this.ally) out.push({ x: this.ally.x, z: this.ally.z, color: '#4fc3ff', icon: '🤖' });
    for (const z of this.level.zombies.list) {
      if (z.turretwar && z.state !== 'dead') out.push({ x: z.x, z: z.z, color: '#ff5d73', icon: z.type === 'robot' ? '🤖' : '🧟' });
    }
    return out;
  }

  update(dt) {
    const level = this.level;
    if (this.over) return;
    this.time += dt;
    this._clampActor(level.player);

    // робот-союзник: на 30-й секунді, йде до ворожої турелі й довбе її
    if (!this.allySpawned && this.time >= ALLY_AT) {
      this.allySpawned = true;
      this._spawnAlly();
      level.game.hud.toast(t('🤖 Твій робот прибув — веди його до зомбі-турелі!'));
    }
    if (this.ally) this._updateAlly(dt);

    // хвиля зомбі кожні 10с біля зомбі-турелі
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.waveT = WAVE_EVERY;
      this._spawnWave();
    }

    // рух ворогів до турелі гравця + шкода турелі/гравцю (патерн DefenseMode)
    for (const z of level.zombies.list) {
      if (!z.turretwar || z.state === 'dead') continue;
      this._clampZombie(z);
      const dx = this.px - z.x;
      const dz = this.cz - z.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 2.6) {
        const step = Math.min(d - 2.6, dt * (z.stats?.speed || 2.2) * 0.55);
        z.x += (dx / d) * step;
        z.z += (dz / d) * step;
        z.aggroed = false;
        z.state = 'wander';
      } else {
        // біля турелі: робот б'є 20 раз/с, зомбі гризуть 6 dps
        if (z.type === 'robot') {
          z._twHitT = (z._twHitT || 0) - dt;
          if (z._twHitT <= 0) { z._twHitT = 1; this.playerHp -= ROBOT_DMG; this._hitFx(this.px, this.cz); }
        } else this.playerHp -= dt * 6;
      }
      this._damagePlayerIfClose(z, dt);
    }

    // турелі стріляють раз на секунду по своїй площі 50×50
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = 1;
      this._turretFire();
    }

    // 🔨 молот по ворожій турелі: гравець щойно вдарив (shootCd стрибнув угору) поруч із нею
    const p = level.player;
    if (p.shootCd > this._lastCd && Math.hypot(p.pos.x - this.ex, p.pos.z - this.cz) < 4.5) {
      const dmg = 35 * (p.damageMult || 1);
      this.enemyHp -= dmg;
      level.effects.damageNumber(new THREE.Vector3(this.ex, this.floorY + 3, this.cz), dmg, false);
      this._hitFx(this.ex, this.cz);
      level.audio.hit(false);
    }
    this._lastCd = p.shootCd;

    if (!this.over && this.playerHp <= 0) level.game._endTurretWarRun(false);
    if (!this.over && this.enemyHp <= 0) {
      this.completed = true;
      level.game._endTurretWarRun(true);
    }
  }

  _turretFire() {
    const level = this.level;
    const inZone = (x, z, tx) => Math.abs(x - tx) <= TURRET_ZONE && Math.abs(z - this.cz) <= TURRET_ZONE;
    // турель гравця б'є ворогів у своїй зоні
    let firedP = false;
    for (const z of level.zombies.list) {
      if (z.turretwar && z.state !== 'dead' && inZone(z.x, z.z, this.px)) {
        z.lastHitBy = 1;
        z.damage(TURRET_DMG, null, false);
        firedP = true;
      }
    }
    if (firedP) level.effects.ring(new THREE.Vector3(this.px, this.floorY + 4.5, this.cz), 0xffd23f, 4);
    // зомбі-турель б'є гравця і робота-союзника у своїй зоні
    let firedE = false;
    const p = level.player;
    if (p.health > 0 && inZone(p.pos.x, p.pos.z, this.ex)) {
      p.takeDamage(TURRET_DMG, this.ex, this.cz);
      firedE = true;
    }
    if (this.ally && inZone(this.ally.x, this.ally.z, this.ex)) {
      this.ally.hp -= TURRET_DMG;
      firedE = true;
    }
    if (firedE) level.effects.ring(new THREE.Vector3(this.ex, this.floorY + 4.5, this.cz), 0xff5d73, 4);
  }

  _spawnWave() {
    const level = this.level;
    const alive = level.zombies.list.filter((z) => z.turretwar && z.state !== 'dead').length;
    const n = Math.min(WAVE_SIZE, Math.max(0, ALIVE_CAP - alive));
    const types = ['walker', 'runner', 'imp', 'walker', 'spitter'];
    for (let i = 0; i < n; i++) {
      const zb = level.zombies.spawn(types[i % types.length], this.ex - 6 - (i % 3) * 2, this.cz - 8 + i * 4, {
        noLeash: true,
        anchor: { x: this.px, z: this.cz, r: this._halfW * 2 },
      });
      zb.turretwar = true;
      zb.aggroed = false;
      zb.state = 'wander';
      this._clampZombie(zb);
    }
  }

  _spawnEnemyRobot() {
    const level = this.level;
    const zb = level.zombies.spawn('robot', this.ex - 8, this.cz + 6, {
      noLeash: true,
      anchor: { x: this.px, z: this.cz, r: this._halfW * 2 },
    });
    zb.maxHp = ROBOT_HP;
    zb.hp = ROBOT_HP;
    zb.stats = { ...zb.stats, dmg: ROBOT_DMG, coins: 0 };
    zb.turretwar = true;
    zb.aggroed = false;
    zb.state = 'wander';
    this.enemyRobot = zb;
  }

  _spawnAlly() {
    const rig = makeZombie('robot', new RNG(4242));
    rig.group.position.set(this.px + 6, this.floorY, this.cz - 6);
    this.level.scene.add(rig.group);
    setAnim(rig, 'run');
    this.ally = { rig, x: this.px + 6, z: this.cz - 6, hp: ROBOT_HP, hitT: 0 };
  }

  _updateAlly(dt) {
    const a = this.ally;
    if (a.hp <= 0) {
      this.level.scene.remove(a.rig.group);
      this.level.game.hud.toast(t('💥 Твого робота розбито!'));
      this.ally = null;
      return;
    }
    const dx = this.ex - a.x;
    const dz = this.cz - a.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > 3.2) {
      const step = dt * 2.4;
      a.x += (dx / d) * step;
      a.z += (dz / d) * step;
    } else {
      a.hitT -= dt;
      if (a.hitT <= 0) {
        a.hitT = 1;
        this.enemyHp -= ROBOT_DMG;
        this._hitFx(this.ex, this.cz);
      }
    }
    a.rig.group.position.set(a.x, this.floorY, a.z);
    a.rig.group.rotation.y = Math.atan2(dx, dz) + Math.PI;
    updateRig(a.rig, dt);
  }

  _hitFx(x, z) {
    this.level.effects.burst(new THREE.Vector3(x, this.floorY + 2.5, z), 0xffd23f, 6, { speed: 2.5, life: 0.35 });
  }

  _buildRoom() {
    const { level, cx, cz } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x2f3d52, roughness: 0.85, metalness: 0.05 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x46605a, roughness: 0.9 });
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomW - 1, d: this.roomD - 1, top: this.floorY });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomW, 0.16, this.roomD), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.6, sz), wallM);
      wall.position.set(x, this.floorY + 1.3, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      level.scene.add(wall);
    };
    mkWall(cx, cz - this._halfD, this.roomW, 0.45);
    mkWall(cx, cz + this._halfD, this.roomW, 0.45);
    mkWall(cx - this._halfW, cz, 0.45, this.roomD);
    mkWall(cx + this._halfW, cz, 0.45, this.roomD);
    // турелі: жовта гравця (захід) і червона зомбі (схід)
    this.playerTurret = this._buildTurret(this.px, 0xffd23f);
    this.enemyTurret = this._buildTurret(this.ex, 0xff5d73);
    // гравця телепортуємо до своєї турелі
    const p = level.player;
    p.pos.x = this.px + 5;
    p.pos.z = cz;
    p.pos.y = this.floorY;
    p.vel.set(0, 0, 0);
    p.onGround = true;
  }

  _buildTurret(x, color) {
    const level = this.level;
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.3, 4.5, 16), m);
    body.position.y = 2.25;
    body.castShadow = true;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10), m);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(x < this.cx ? 1.2 : -1.2, 4.2, 0);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), m);
    top.position.y = 4.6;
    top.castShadow = true;
    g.add(body, barrel, top);
    g.position.set(x, this.floorY, this.cz);
    level.scene.add(g);
    return g;
  }

  _calcFloorY() {
    // арена ширша за чисту зону arena-flat → рельєф/дерева стирчали б крізь підлогу.
    // Піднімаємо платформу НАД найвищою точкою (зловлено скріншотом): арена «в небі».
    let y = -Infinity;
    for (let ox = -this._halfW + 2; ox <= this._halfW - 2; ox += 24) {
      for (let oz = -this._halfD + 2; oz <= this._halfD - 2; oz += 11) {
        y = Math.max(y, this.level.world.groundH(this.cx + ox, this.cz + oz));
      }
    }
    return y + 7;
  }

  _clampActor(p) {
    const x = Math.max(this.cx - this._halfW + 1, Math.min(this.cx + this._halfW - 1, p.pos.x));
    const z = Math.max(this.cz - this._halfD + 1, Math.min(this.cz + this._halfD - 1, p.pos.z));
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
    if (p.pos.y < this.floorY) {
      p.pos.y = this.floorY;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
    }
  }

  _clampZombie(z) {
    z.x = Math.max(this.cx - this._halfW + 1, Math.min(this.cx + this._halfW - 1, z.x));
    z.z = Math.max(this.cz - this._halfD + 1, Math.min(this.cz + this._halfD - 1, z.z));
    z.y = this.floorY;
    if (z.rig && z.rig.group) z.rig.group.position.y = this.floorY;
  }

  _damagePlayerIfClose(z, dt) {
    z.defenseHitCd = Math.max(0, (z.defenseHitCd || 0) - dt);
    if (z.defenseHitCd > 0) return;
    const p = this.level.player;
    if (!p || p.health <= 0 || p.pos.y - this.floorY > 3) return;
    const reach = (z.stats?.attackR || 1.8) * 1.25;
    if (Math.hypot(p.pos.x - z.x, p.pos.z - z.z) > reach) return;
    z.defenseHitCd = 0.9;
    p.takeDamage(z.stats?.dmg || 10, z.x, z.z);
  }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
      playerHp: Math.max(0, Math.ceil(this.playerHp)),
      enemyHp: Math.max(0, Math.ceil(this.enemyHp)),
    };
  }
}
