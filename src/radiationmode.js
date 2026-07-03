import * as THREE from 'three';
import { t } from './i18n.js';

export const RADIATION_UNLOCK_COUNTRIES = 12;
export const RADIATION_ROOM_SIZE = 50;
export const RADIATION_WIN_COINS = 50;

export class RadiationMode {
  constructor(level) {
    this.level = level;
    this.roomSize = RADIATION_ROOM_SIZE;
    this.target = 1;
    this.completed = false;
    this.over = false;
    this.prompt = null;
    this.missions = [];
    this.civilians = [];
    this.bossStarted = true;
    this.bossUnlocked = true;
    this.allDone = false;
    const a = level.world.layout.arena || { x: 0, z: 0 };
    this.cx = a.x;
    this.cz = a.z;
    this._half = this.roomSize / 2;
    this._buildRoom();
    this._spawnZombie();
  }

  get(id) { void id; return null; }

  getHudList() {
    return [
      { icon: '☢️', title: t('РАДІАЦІЯ'), done: false },
      { icon: '🧟', title: t('Радіаційний зомбі: {n} HP', { n: Math.max(0, Math.ceil(this.zombie?.hp || 0)) }), done: this.remaining() <= 0 },
      { icon: '💥', title: t('50 HP, тільки дробовик і 10 патронів. Перемога: +50 монет радіації.'), done: false },
    ];
  }

  getMarkers() {
    return this.level.zombies.list
      .filter((z) => z.radiationMode && z.state !== 'dead')
      .map((z) => ({ x: z.x, z: z.z, color: '#8dff5a', icon: '☢️' }));
  }

  remaining() {
    return this.level.zombies.list.filter((z) => z.radiationMode && z.state !== 'dead').length;
  }

  update() {
    this._clampActor(this.level.player);
    for (const z of this.level.zombies.list) {
      if (z.radiationMode && z.state !== 'dead') this._clampZombie(z);
    }
    if (!this.over && this.remaining() <= 0) {
      this.completed = true;
      this.level.game._endRadiationRun(true);
    }
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x21362b, roughness: 0.85, metalness: 0.05 });
    const railM = new THREE.MeshStandardMaterial({ color: 0x95ff4d, emissive: 0x244d12, roughness: 0.45, metalness: 0.08 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x24382d, roughness: 0.92 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.18, this.roomSize), floorM);
    floor.position.set(cx, level.world.groundH(cx, cz) - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const y = level.world.groundH(x, z) + 1.4;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), wallM);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz + 0.03), railM);
      stripe.position.set(x, y + 0.25, z);
      level.scene.add(wall, stripe);
    };
    mkWall(cx, cz - h, this.roomSize, 0.35);
    mkWall(cx, cz + h, this.roomSize, 0.35);
    mkWall(cx - h, cz, 0.35, this.roomSize);
    mkWall(cx + h, cz, 0.35, this.roomSize);
  }

  _spawnZombie() {
    const zb = this.level.zombies.spawn('boss', this.cx, this.cz - 9, {
      style: 'radiation',
      noLeash: true,
      anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
    });
    zb.radiationMode = true;
    zb.maxHp = 500;
    zb.hp = 500;
    zb.stats = { ...zb.stats, hp: 500, dmg: 10, coins: 0 };
    zb.aggroed = true;
    zb.state = 'chase';
    this.level.zombies.boss = zb;
    this.zombie = zb;
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
    };
  }
}
