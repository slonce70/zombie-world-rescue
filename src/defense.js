import * as THREE from 'three';
import { t } from './i18n.js';

export const DEFENSE_UNLOCK_COUNTRIES = 8;
export const DEFENSE_ROOM_SIZE = 120;
export const DEFENSE_TOWER_HP = 250;
export const DEFENSE_ZOMBIES = 20;

export class DefenseMode {
  constructor(level) {
    this.level = level;
    this.roomSize = DEFENSE_ROOM_SIZE;
    this.target = DEFENSE_ZOMBIES;
    this.towerMaxHp = DEFENSE_TOWER_HP;
    this.towerHp = DEFENSE_TOWER_HP;
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
    this._buildRoom();
    this._spawnZombies();
  }

  get(id) { void id; return null; }

  getHudList() {
    const left = this.remaining();
    return [
      { icon: '🛡️', title: t('ОБОРОНА'), done: false },
      { icon: '🗼', title: t('Вежа: {n}/{t} HP', { n: Math.max(0, Math.ceil(this.towerHp)), t: this.towerMaxHp }), done: this.towerHp > 0 },
      { icon: '🧟', title: t('Зомбі лишилось: {n}/{t}', { n: left, t: this.target }), done: left <= 0 },
      { icon: '🔫', title: t('Пістолет і автомат. Без магазину, гаджетів і бафів.'), done: false },
    ];
  }

  getMarkers() {
    const out = [{ x: this.cx, z: this.cz, color: '#ffd23f', icon: '🗼' }];
    for (const z of this.level.zombies.list) {
      if (z.defense && z.state !== 'dead') out.push({ x: z.x, z: z.z, color: '#ff5d73', icon: '🧟' });
    }
    return out;
  }

  remaining() {
    return this.level.zombies.list.filter((z) => z.defense && z.state !== 'dead').length;
  }

  update(dt) {
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
        this.towerHp -= dt * 6;
      }
    }
    if (!this.over && this.towerHp <= 0) this.level.game._endDefenseRun(false);
    if (!this.over && this.remaining() <= 0) {
      this.completed = true;
      this.level.game._endDefenseRun(true);
    }
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.85, metalness: 0.05 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x4f8d5f, roughness: 0.9 });
    const towerM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.55, metalness: 0.15 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.16, this.roomSize), floorM);
    floor.position.set(cx, level.world.groundH(cx, cz) - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const y = level.world.groundH(x, z) + 1.2;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.4, sz), wallM);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      level.scene.add(wall);
    };
    mkWall(cx, cz - h, this.roomSize, 0.45);
    mkWall(cx, cz + h, this.roomSize, 0.45);
    mkWall(cx - h, cz, 0.45, this.roomSize);
    mkWall(cx + h, cz, 0.45, this.roomSize);

    const baseY = level.world.groundH(cx, cz);
    const tower = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 5, 18), towerM);
    body.position.y = 2.5;
    body.castShadow = true;
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.4, 18), towerM);
    top.position.y = 5.7;
    top.castShadow = true;
    tower.add(body, top);
    tower.position.set(cx, baseY, cz);
    level.scene.add(tower);
    this.tower = tower;
  }

  _spawnZombies() {
    const types = ['walker', 'runner', 'tank', 'shield', 'imp', 'spitter', 'walker', 'gunner'];
    for (let i = 0; i < this.target; i++) {
      const a = (i / this.target) * Math.PI * 2;
      const r = this._half - 7 - (i % 4) * 3;
      const x = this.cx + Math.cos(a) * r;
      const z = this.cz + Math.sin(a) * r;
      const zb = this.level.zombies.spawn(types[i % types.length], x, z, {
        noLeash: true,
        anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
      });
      zb.defense = true;
      zb.aggroed = false;
      zb.state = 'wander';
    }
  }

  _clampActor(p) {
    const x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, p.pos.x));
    const z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, p.pos.z));
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
  }

  _clampZombie(z) {
    z.x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, z.x));
    z.z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, z.z));
  }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
      towerHp: Math.max(0, Math.ceil(this.towerHp)),
    };
  }
}
