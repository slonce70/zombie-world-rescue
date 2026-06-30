import * as THREE from 'three';
import { t } from './i18n.js';

export const DEFENSE_UNLOCK_COUNTRIES = 8;
export const OVERLOADED_DEFENSE_UNLOCK_COUNTRIES = 8;
export const ZONE_DEFENSE_UNLOCK_COUNTRIES = 6;
export const DEFENSE_ROOM_SIZE = 120;
export const DEFENSE_TOWER_HP = 250;
export const DEFENSE_ZOMBIES = 20;

const DEFENSE_CONFIGS = {
  normal: {
    title: 'ОБОРОНА',
    towerHp: DEFENSE_TOWER_HP,
    waveSizes: [DEFENSE_ZOMBIES],
    towerDps: 6,
    types: ['walker', 'runner', 'tank', 'shield', 'imp', 'spitter', 'walker', 'gunner'],
    loadoutText: 'Пістолет і автомат. Без магазину, гаджетів і бафів.',
  },
  overloaded: {
    title: 'Перегружена оборона',
    towerHp: 500,
    waveSizes: [7, 7, 6],
    zombieHp: 234,
    zombieDmg: 25,
    towerDps: 25,
    types: ['walker', 'runner', 'tank', 'imp', 'spitter', 'gunner', 'walker'],
    loadoutText: '3 хвилі. Вежа 500 HP, у тебе 250 HP. Без магазину, гаджетів, бафів і пікапів.',
  },
  zone: {
    title: 'Оборона в зоні',
    roomSize: 30,
    duration: 125,
    waveEvery: 5,
    waveSize: 4,
    zone: true,
    types: ['walker', 'runner', 'imp', 'spitter'],
    loadoutText: 'Посох і пістолет. Без пікапів, магазину, гаджетів і гранат.',
  },
};

export class DefenseMode {
  constructor(level, variant = 'normal') {
    this.level = level;
    this.variant = DEFENSE_CONFIGS[variant] ? variant : 'normal';
    this.cfg = DEFENSE_CONFIGS[this.variant];
    this.zone = !!this.cfg.zone;
    this.roomSize = this.cfg.roomSize || DEFENSE_ROOM_SIZE;
    this.target = this.zone ? 0 : this.cfg.waveSizes.reduce((sum, n) => sum + n, 0);
    this.towerMaxHp = this.cfg.towerHp || 0;
    this.towerHp = this.cfg.towerHp || 0;
    this.wave = 0;
    this.waveTotal = this.cfg.waveSizes ? this.cfg.waveSizes.length : 0;
    this.spawned = 0;
    this.timer = this.cfg.duration || 0;
    this.spawnT = this.zone ? 0 : Infinity;
    this.completed = false;
    this.over = false;
    this.prompt = null;
    this.missions = [];
    this.civilians = [];
    this.bossStarted = false;
    this.bossUnlocked = false;
    this.allDone = false;
    const a = level.world.layout.arena || { x: 0, z: 0 };
    this.cx = a.x;
    this.cz = a.z;
    this._half = this.roomSize / 2;
    this.radius = this._half;
    this.floorY = this._calcFloorY();
    if (this.zone) {
      this._buildZoneRoom();
      this._placePlayerInZone();
    } else this._buildRoom();
    this._spawnZombies();
  }

  get(id) { void id; return null; }

  getHudList() {
    if (this.zone) {
      return [
        { icon: '🛡️', title: t(this.cfg.title), done: false },
        { icon: '⏱️', title: t('Протримайся: {n} с', { n: Math.max(0, Math.ceil(this.timer)) }), done: this.timer <= 0 },
        { icon: '⭕', title: t('Лишайся в синьому колі'), done: false },
        { icon: '🔫', title: t(this.cfg.loadoutText), done: false },
      ];
    }
    const left = Math.max(0, this.target - Math.min(this.target, this.level.stats.kills));
    const list = [
      { icon: '🛡️', title: t(this.cfg.title), done: false },
      { icon: '🗼', title: t('Вежа: {n}/{t} HP', { n: Math.max(0, Math.ceil(this.towerHp)), t: this.towerMaxHp }), done: this.towerHp > 0 },
      { icon: '🧟', title: t('Зомбі лишилось: {n}/{t}', { n: left, t: this.target }), done: left <= 0 },
      { icon: '🔫', title: t(this.cfg.loadoutText), done: false },
    ];
    if (this.waveTotal > 1) list.splice(1, 0, { icon: '🌊', title: t('Хвиля {n}/{t}', { n: this.wave, t: this.waveTotal }), done: false });
    return list;
  }

  getMarkers() {
    const out = [{ x: this.cx, z: this.cz, color: this.zone ? '#4fc3ff' : '#ffd23f', icon: this.zone ? '⭕' : '🗼' }];
    for (const z of this.level.zombies.list) {
      if (z.defense && z.state !== 'dead') out.push({ x: z.x, z: z.z, color: '#ff5d73', icon: '🧟' });
    }
    return out;
  }

  remaining() {
    return this.level.zombies.list.filter((z) => z.defense && z.state !== 'dead').length;
  }

  update(dt) {
    if (this.zone) {
      this._updateZone(dt);
      return;
    }
    this._clampActor(this.level.player);
    for (const z of this.level.zombies.list) {
      if (!z.defense || z.state === 'dead') continue;
      this._clampZombie(z);
      const dx = this.cx - z.x;
      const dz = this.cz - z.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 2.2) {
        const step = Math.min(d - 2.2, dt * (z.stats?.speed || 2.2) * 0.55);
        z.x += (dx / d) * step;
        z.z += (dz / d) * step;
        z.aggroed = false;
        z.state = 'wander';
      } else {
        this.towerHp -= dt * this.cfg.towerDps;
      }
      this._damagePlayerIfClose(z, dt);
    }
    if (!this.over && this.towerHp <= 0) this.level.game._endDefenseRun(false);
    if (!this.over && this.remaining() <= 0) {
      if (this.wave < this.waveTotal) this._spawnWave(this.wave);
      else {
        this.completed = true;
        this.level.game._endDefenseRun(true);
      }
    }
  }

  _updateZone(dt) {
    this._clampActor(this.level.player);
    this.timer -= dt;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this._spawnZoneWave();
      this.spawnT += this.cfg.waveEvery;
    }
    const p = this.level.player;
    for (const z of this.level.zombies.list) {
      if (!z.defense || z.state === 'dead') continue;
      this._clampZombie(z);
      const dx = p.pos.x - z.x;
      const dz = p.pos.z - z.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 1.8) {
        const step = Math.min(d - 1.8, dt * (z.stats?.speed || 2.2) * 0.75);
        z.x += (dx / d) * step;
        z.z += (dz / d) * step;
        z.aggroed = false;
        z.state = 'wander';
      }
      this._damagePlayerIfClose(z, dt);
    }
    if (!this.over && this.timer <= 0) {
      this.completed = true;
      this.level.game._endDefenseRun(true);
    }
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.85, metalness: 0.05 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x4f8d5f, roughness: 0.9 });
    const towerM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.55, metalness: 0.15 });
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomSize - 1, d: this.roomSize - 1, top: this.floorY });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.16, this.roomSize), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.4, sz), wallM);
      wall.position.set(x, this.floorY + 1.2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      level.scene.add(wall);
    };
    mkWall(cx, cz - h, this.roomSize, 0.45);
    mkWall(cx, cz + h, this.roomSize, 0.45);
    mkWall(cx - h, cz, 0.45, this.roomSize);
    mkWall(cx + h, cz, 0.45, this.roomSize);

    const tower = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 5, 18), towerM);
    body.position.y = 2.5;
    body.castShadow = true;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.4, 18), towerM);
    top.position.y = 5.7;
    top.castShadow = true;
    tower.add(body, top);
    tower.position.set(cx, this.floorY, cz);
    level.scene.add(tower);
    this.tower = tower;
  }

  _buildZoneRoom() {
    const { level, cx, cz } = this;
    const floorM = new THREE.MeshStandardMaterial({ color: 0x2f876d, roughness: 0.9 });
    const zoneM = new THREE.MeshStandardMaterial({ color: 0x4fc3ff, roughness: 0.45, transparent: true, opacity: 0.32 });
    const ringM = new THREE.MeshStandardMaterial({ color: 0xb7f7ff, emissive: 0x1b6f8f, emissiveIntensity: 0.35, roughness: 0.35 });
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomSize, d: this.roomSize, top: this.floorY });
    const base = new THREE.Mesh(new THREE.CircleGeometry(this.radius + 1.5, 64), floorM);
    base.rotation.x = -Math.PI / 2;
    base.position.set(cx, this.floorY - 0.07, cz);
    base.receiveShadow = true;
    level.scene.add(base);
    const zone = new THREE.Mesh(new THREE.CircleGeometry(this.radius, 64), zoneM);
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(cx, this.floorY + 0.01, cz);
    zone.receiveShadow = true;
    level.scene.add(zone);
    const ring = new THREE.Mesh(new THREE.RingGeometry(this.radius - 0.2, this.radius, 64), ringM);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, this.floorY + 0.04, cz);
    level.scene.add(ring);
  }

  _placePlayerInZone() {
    const p = this.level.player;
    p.pos.x = this.cx;
    p.pos.z = this.cz;
    p.pos.y = this.floorY;
    p.vel.x = 0;
    p.vel.y = 0;
    p.vel.z = 0;
    p.onGround = true;
  }

  _calcFloorY() {
    let y = -Infinity;
    const h = this._half - 1;
    for (const ox of [-h, -h * 0.5, 0, h * 0.5, h]) {
      for (const oz of [-h, -h * 0.5, 0, h * 0.5, h]) {
        y = Math.max(y, this.level.world.groundH(this.cx + ox, this.cz + oz));
      }
    }
    return y + 0.08;
  }

  _spawnZombies() {
    if (this.zone) {
      this._spawnZoneWave();
      this.spawnT = this.cfg.waveEvery;
    } else this._spawnWave(0);
  }

  _spawnWave(idx) {
    const count = this.cfg.waveSizes[idx] || 0;
    this.wave = idx + 1;
    for (let i = 0; i < count; i++) {
      const n = this.spawned + i;
      const a = (i / count) * Math.PI * 2 + idx * 0.45;
      const r = this._half - 7 - (i % 4) * 3;
      const x = this.cx + Math.cos(a) * r;
      const z = this.cz + Math.sin(a) * r;
      const zb = this.level.zombies.spawn(this.cfg.types[n % this.cfg.types.length], x, z, {
        noLeash: true,
        anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
      });
      this._tuneZombie(zb);
      zb.defense = true;
      zb.aggroed = false;
      zb.state = 'wander';
      this._clampZombie(zb);
    }
    this.spawned += count;
  }

  _spawnZoneWave() {
    const count = this.cfg.waveSize;
    const offset = (this.spawned / count) * 0.35;
    for (let i = 0; i < count; i++) {
      const n = this.spawned + i;
      const a = (i / count) * Math.PI * 2 + offset;
      const r = this.radius - 1.4;
      const x = this.cx + Math.cos(a) * r;
      const z = this.cz + Math.sin(a) * r;
      const zb = this.level.zombies.spawn(this.cfg.types[n % this.cfg.types.length], x, z, {
        noLeash: true,
        anchor: { x: this.cx, z: this.cz, r: this.radius - 0.6 },
      });
      zb.defense = true;
      zb.aggroed = false;
      zb.state = 'wander';
      this._clampZombie(zb);
    }
    this.spawned += count;
  }

  _tuneZombie(zb) {
    if (!this.cfg.zombieHp) return;
    zb.maxHp = this.cfg.zombieHp;
    zb.hp = this.cfg.zombieHp;
    zb.stats = { ...zb.stats, hp: this.cfg.zombieHp, dmg: this.cfg.zombieDmg, coins: 0 };
    if (zb.ranged) zb.ranged = { ...zb.ranged, dmg: this.cfg.zombieDmg };
  }

  _clampActor(p) {
    if (this.zone) {
      const beforeX = p.pos.x;
      const beforeZ = p.pos.z;
      this._clampCircle(p.pos, 0.8);
      if (p.pos.x !== beforeX || p.pos.z !== beforeZ) {
        const dx = p.pos.x - this.cx;
        const dz = p.pos.z - this.cz;
        const d = Math.hypot(dx, dz) || 1;
        const outward = (p.vel.x * dx + p.vel.z * dz) / d;
        if (outward > 0) {
          p.vel.x -= (dx / d) * outward;
          p.vel.z -= (dz / d) * outward;
        }
      }
      if (p.pos.y < this.floorY) {
        p.pos.y = this.floorY;
        if (p.vel.y < 0) p.vel.y = 0;
        p.onGround = true;
      }
      return;
    }
    const x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, p.pos.x));
    const z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, p.pos.z));
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
    if (p.pos.y < this.floorY) {
      p.pos.y = this.floorY;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
    }
  }

  _clampZombie(z) {
    if (this.zone) {
      const pos = { x: z.x, z: z.z };
      this._clampCircle(pos, 0.6);
      z.x = pos.x;
      z.z = pos.z;
      z.y = this.floorY;
      if (z.rig && z.rig.group) z.rig.group.position.y = this.floorY;
      return;
    }
    z.x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, z.x));
    z.z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, z.z));
    z.y = this.floorY;
    if (z.rig && z.rig.group) z.rig.group.position.y = this.floorY;
  }

  _clampCircle(pos, pad = 0) {
    const max = this.radius - pad;
    const dx = pos.x - this.cx;
    const dz = pos.z - this.cz;
    const d = Math.hypot(dx, dz);
    if (d <= max) return;
    const k = max / (d || 1);
    pos.x = this.cx + dx * k;
    pos.z = this.cz + dz * k;
  }

  _damagePlayerIfClose(z, dt) {
    const p = this.level.player;
    z.defenseHitCd = Math.max(0, (z.defenseHitCd || 0) - dt);
    if (!p || p.health <= 0 || z.defenseHitCd > 0 || p.pos.y - this.floorY > 3) return;
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
      towerHp: Math.max(0, Math.ceil(this.towerHp)),
      timeLeft: Math.max(0, Math.ceil(this.timer)),
    };
  }
}
