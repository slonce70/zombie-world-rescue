import * as THREE from 'three';
import { t } from './i18n.js';

export const SOUL_COLLECTOR_UNLOCK_LEVEL = 35;
export const SOUL_ROOM_SIZE = 100;
export const SOUL_GHOSTS = 20;
export const SOUL_GHOST_HP = 125;
export const SOUL_WIN_REWARD = 3;
export const SOUL_LEVEL_COST = 5;

const ROOM_CENTER = { x: -520, z: 0 };

export class SoulCollectorMode {
  constructor(level) {
    this.level = level;
    this.roomSize = SOUL_ROOM_SIZE;
    this.target = SOUL_GHOSTS;
    this.completed = false;
    this.over = false;
    this.prompt = null;
    this.missions = [];
    this.civilians = [];
    this.bossStarted = false;
    this.bossUnlocked = false;
    this.allDone = false;
    this.cx = ROOM_CENTER.x;
    this.cz = ROOM_CENTER.z;
    this._half = this.roomSize / 2;
    this.floorY = this._calcFloorY();
    this._clearRoomBlockers();
    this._buildRoom();
    this._spawnGhosts();
  }

  get(id) { void id; return null; }

  getHudList() {
    return [
      { icon: '👻', title: t('ЗБИРАЧ ДУШ'), done: false },
      { icon: '🧟', title: t('Привидів лишилось: {n}/{total}', { n: this.remaining(), total: this.target }), done: this.completed },
      { icon: '🪄', title: t('Посох і меч. Без пікапів, гаджетів і магазину.'), done: false },
    ];
  }

  getMarkers() {
    return this.level.zombies.list
      .filter((z) => z.soulGhost && z.state !== 'dead')
      .map((z) => ({ x: z.x, z: z.z, color: '#ffffff', icon: '👻' }));
  }

  remaining() {
    return this.level.zombies.list.filter((z) => z.soulGhost && z.state !== 'dead').length;
  }

  update() {
    this._clampActor(this.level.player);
    for (const z of this.level.zombies.list) {
      if (z.soulGhost && z.state !== 'dead') this._clampZombie(z);
    }
    if (!this.over && this.remaining() <= 0) {
      this.completed = true;
      this.level.game._endSoulCollectorRun(true);
    }
  }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
      remaining: this.remaining(),
      target: this.target,
    };
  }

  placePlayer() {
    const p = this.level.player;
    p.pos.set(this.cx, this.floorY, this.cz + this._half - 12);
    p.vel.set(0, 0, 0);
    p.onGround = true;
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const floorM = new THREE.MeshStandardMaterial({ color: 0x303642, roughness: 0.9 });
    const wallM = new THREE.MeshStandardMaterial({ color: 0x5f6673, roughness: 0.85 });
    level.world.layout.BOUND = Math.max(level.world.layout.BOUND || 0, Math.hypot(cx, cz) + h + 20);
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomSize - 1, d: this.roomSize - 1, top: this.floorY });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.16, this.roomSize), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 3, sz), wallM);
      wall.position.set(x, this.floorY + 1.5, z);
      wall.castShadow = wall.receiveShadow = true;
      level.scene.add(wall);
    };
    mkWall(cx, cz - h, this.roomSize, 1);
    mkWall(cx, cz + h, this.roomSize, 1);
    mkWall(cx - h, cz, 1, this.roomSize);
    mkWall(cx + h, cz, 1, this.roomSize);
  }

  _spawnGhosts() {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, transparent: true, opacity: 0.9 });
    for (let i = 0; i < SOUL_GHOSTS; i++) {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = this.cx - 24 + col * 12;
      const z = this.cz - 22 + row * 12;
      const zb = this.level.zombies.spawn('ghost', x, z, {
        noLeash: true,
        anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
      });
      zb.soulGhost = true;
      zb.invisible = false;
      zb.hp = zb.maxHp = SOUL_GHOST_HP;
      zb.stats = { ...zb.stats, hp: SOUL_GHOST_HP, coins: 0, invisible: false };
      zb.aggroed = true;
      zb.state = 'chase';
      zb.rig.group.visible = true;
      zb.rig.group.traverse((o) => { if (o.isMesh) o.material = white; });
      this._clampZombie(zb);
    }
  }

  _clampActor(p) {
    const x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, p.pos.x));
    const z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, p.pos.z));
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
    if (p.pos.y < this.floorY || p.pos.y > this.floorY + 4) {
      p.pos.y = this.floorY;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
    }
  }

  _clampZombie(z) {
    z.x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, z.x));
    z.z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, z.z));
    z.y = this.floorY;
    if (z.rig && z.rig.group) z.rig.group.position.set(z.x, this.floorY, z.z);
  }

  _calcFloorY() {
    let y = -Infinity;
    for (const ox of [-this._half + 4, 0, this._half - 4]) {
      for (const oz of [-this._half + 4, 0, this._half - 4]) {
        y = Math.max(y, this.level.world.groundH(this.cx + ox, this.cz + oz));
      }
    }
    return y + 0.08;
  }

  _clearRoomBlockers() {
    const inside = (c) => Math.abs(c.x - this.cx) < this._half - 1 && Math.abs(c.z - this.cz) < this._half - 1;
    this.level.world.colliders = this.level.world.colliders.filter((c) => !inside(c));
    this.level.world.occluders = this.level.world.occluders.filter((c) => !inside(c));
    if (typeof this.level.world._buildGrid === 'function') this.level.world._buildGrid();
  }
}
