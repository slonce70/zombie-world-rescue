import * as THREE from 'three';
import { t } from './i18n.js';

export const MAZE_UNLOCK_COUNTRIES = 11;
export const MAZE_ROOM_SIZE = 76;

export class MazeMode {
  constructor(level) {
    this.level = level;
    this.roomSize = MAZE_ROOM_SIZE;
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
    this.floorY = this._calcFloorY();
    this.keys = [];
    this.keysTaken = 0;
    this.exit = null;
    this._clearRoomBlockers();
    this._buildRoom();
    this._spawnZombies();
  }

  get(id) { void id; return null; }

  getHudList() {
    return [
      { icon: '🧩', title: t('ЛАБІРИНТ'), done: false },
      { icon: '🔑', title: t('Знайди ключі: {n}/3', { n: this.keysTaken }), done: this.keysTaken >= 3 },
      { icon: '🚪', title: this.exit?.open ? t('Вихід відкритий') : t('Вихід відкриється після 3 ключів'), done: this.completed },
    ];
  }

  getMarkers() {
    const out = this.keys.filter((k) => !k.taken).map((k) => ({ x: k.x, z: k.z, color: '#ffd23f', icon: '🔑' }));
    if (this.exit) out.push({ x: this.exit.x, z: this.exit.z, color: this.exit.open ? '#4dd6a8' : '#9aa7b3', icon: '🚪' });
    for (const z of this.level.zombies.list) {
      if (z.maze && z.state !== 'dead') out.push({ x: z.x, z: z.z, color: '#ff5d73', icon: '🧟' });
    }
    return out;
  }

  update(dt) {
    void dt;
    this._clampActor(this.level.player);
    for (const key of this.keys) {
      if (!key.taken && Math.hypot(this.level.player.pos.x - key.x, this.level.player.pos.z - key.z) < 2) {
        this.collectKey(key);
      }
    }
    if (this.exit?.open && Math.hypot(this.level.player.pos.x - this.exit.x, this.level.player.pos.z - this.exit.z) < 2.5) {
      this.finish();
    }
  }

  collectKey(key) {
    if (!key || key.taken || this.over) return;
    key.taken = true;
    key.group.visible = false;
    this.keysTaken++;
    this.level.audio.coin();
    this.level.effects.burst(key.pos, 0xffd23f, 12, { speed: 3, up: 3, life: 0.6 });
    if (this.keysTaken >= 3) {
      this.exit.open = true;
      this.exit.mat.color.setHex(0x4dd6a8);
      this.level.audio.levelUp();
    }
  }

  finish() {
    if (!this.exit?.open || this.over) return;
    this.completed = true;
    this.level.game._endMazeRun(true);
  }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
      keys: this.keysTaken,
    };
  }

  placePlayer() {
    const p = this.level.player;
    p.pos.set(this.cx, this.floorY, this.cz + 30);
    p.vel.set(0, 0, 0);
    p.onGround = true;
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const floorM = new THREE.MeshStandardMaterial({ color: 0x202833, roughness: 0.9 });
    const wallM = new THREE.MeshStandardMaterial({ color: 0x3a4858, roughness: 0.85 });
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomSize - 1, d: this.roomSize - 1, top: this.floorY });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.16, this.roomSize), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    this._addWall(cx, cz - h, this.roomSize, 0.5, wallM);
    this._addWall(cx, cz + h, this.roomSize, 0.5, wallM);
    this._addWall(cx - h, cz, 0.5, this.roomSize, wallM);
    this._addWall(cx + h, cz, 0.5, this.roomSize, wallM);
    this._addWall(cx - 18, cz - 12, 0.6, 36, wallM);
    this._addWall(cx + 10, cz + 10, 0.6, 38, wallM);
    this._addWall(cx - 5, cz - 6, 34, 0.6, wallM);
    this._addWall(cx + 18, cz + 23, 34, 0.6, wallM);
    this._addKey(cx - 27, cz - 25);
    this._addKey(cx + 27, cz - 17);
    this._addKey(cx - 24, cz + 19);
    this._addExit(cx, cz - 34);
    level.world._buildGrid();
  }

  _addWall(x, z, sx, sz, mat) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 3, sz), mat);
    wall.position.set(x, this.floorY + 1.5, z);
    wall.castShadow = wall.receiveShadow = true;
    this.level.scene.add(wall);
    const steps = Math.max(1, Math.ceil(Math.max(sx, sz) / 2));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps - 0.5 : 0;
      const cx = x + (sx >= sz ? t * sx : 0);
      const cz = z + (sz > sx ? t * sz : 0);
      this.level.world.colliders.push({ x: cx, z: cz, r: 0.9, top: this.floorY + 3 });
      this.level.world.occluders.push({ x: cx, z: cz, r: 0.8, h: this.floorY + 3 });
    }
  }

  _addKey(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.1, 8, 18), mat);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.0), mat);
    stem.position.z = 0.65;
    group.add(head, stem);
    group.rotation.x = Math.PI / 2;
    group.position.set(x, this.floorY + 1.0, z);
    this.level.scene.add(group);
    this.keys.push({ x, z, pos: new THREE.Vector3(x, this.floorY + 1.0, z), taken: false, group });
  }

  _addExit(x, z) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x9aa7b3, transparent: true, opacity: 0.75 });
    const gate = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.25), mat);
    gate.position.set(x, this.floorY + 1.5, z);
    this.level.scene.add(gate);
    this.exit = { x, z, open: false, mat, mesh: gate };
  }

  _spawnZombies() {
    const spots = [
      [this.cx - 27, this.cz - 7], [this.cx + 26, this.cz - 2], [this.cx - 7, this.cz + 16],
      [this.cx + 24, this.cz + 28], [this.cx - 30, this.cz + 30], [this.cx + 5, this.cz - 28],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const zb = this.level.zombies.spawn(i % 2 ? 'runner' : 'walker', x, z, {
        noLeash: true,
        anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
      });
      zb.maze = true;
      zb.stats = { ...zb.stats, coins: 0 };
      zb.aggroed = false;
      zb.state = 'wander';
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

  _calcFloorY() {
    let y = -Infinity;
    for (const ox of [-this._half + 4, -this._half * 0.5, 0, this._half * 0.5, this._half - 4]) {
      for (const oz of [-this._half + 4, -this._half * 0.5, 0, this._half * 0.5, this._half - 4]) {
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
