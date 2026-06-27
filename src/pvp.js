import * as THREE from 'three';
import { t } from './i18n.js';

export const PVP_UNLOCK_COUNTRIES = 10;
export const PVP_ROOM_SIZE = 30;
export const PVP_ZOMBIE_HP = 250;
export const PVP_ZOMBIE_DMG = 10;

export class PvpMode {
  constructor(level) {
    this.level = level;
    this.roomSize = PVP_ROOM_SIZE;
    this.target = 1;
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
    this._spawnZombie();
  }

  get(id) { void id; return null; }

  getHudList() {
    return [
      { icon: '⚔️', title: t('ПВП'), done: false },
      { icon: '🧟', title: t('Зомбі: {n} HP', { n: Math.max(0, Math.ceil(this.zombie?.hp || 0)) }), done: this.remaining() <= 0 },
      { icon: '🪄', title: t('Тільки посох. 50 HP. Без магазину, гаджетів і пікапів.'), done: false },
    ];
  }

  getMarkers() {
    return this.level.zombies.list
      .filter((z) => z.pvp && z.state !== 'dead')
      .map((z) => ({ x: z.x, z: z.z, color: '#ff5d73', icon: '🧟' }));
  }

  remaining() {
    return this.level.zombies.list.filter((z) => z.pvp && z.state !== 'dead').length;
  }

  update() {
    this._clampActor(this.level.player);
    for (const z of this.level.zombies.list) {
      if (z.pvp && z.state !== 'dead') this._clampZombie(z);
    }
    if (!this.over && this.remaining() <= 0) {
      this.completed = true;
      this.level.game._endPvpRun(true);
    }
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x3a2638, roughness: 0.85, metalness: 0.05 });
    const railM = new THREE.MeshStandardMaterial({ color: 0xb86cff, roughness: 0.5, metalness: 0.1 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x2d3346, roughness: 0.9 });
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
    const zb = this.level.zombies.spawn('walker', this.cx, this.cz - 8, {
      noLeash: true,
      anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
    });
    zb.pvp = true;
    zb.maxHp = PVP_ZOMBIE_HP;
    zb.hp = PVP_ZOMBIE_HP;
    zb.stats = { ...zb.stats, hp: PVP_ZOMBIE_HP, dmg: PVP_ZOMBIE_DMG, coins: 0 };
    zb.aggroed = true;
    zb.state = 'chase';
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
