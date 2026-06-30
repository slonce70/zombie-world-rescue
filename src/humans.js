import * as THREE from 'three';
import { makeHero, setAnim, updateRig } from './characters.js';
import { disposeObject } from './utils.js';
import { t } from './i18n.js';

export const HUMANS_UNLOCK_COUNTRIES = 11;
export const OVERLOADED_HUMANS_UNLOCK_COUNTRIES = 12;
export const HUMANS_ROOM_SIZE = 750;
export const HUMANS_CLONES = 30;
export const HUMANS_ZOMBIES = 65;
const CLONE_FOOT_LIFT = 0.08;
const HUMANS_CFG = {
  normal: { title: 'ЗОМБІ ПРОТИ ЛЮДЕЙ', clones: 30, shooters: 0, zombies: 65, boxers: 0, robotHp: null },
  overloaded: { title: 'Перегружена зомбі проти людей', clones: 45, shooters: 5, zombies: 125, boxers: 5, robotHp: 1795 },
};

export class HumansMode {
  constructor(level, variant = 'normal') {
    this.level = level;
    this.variant = variant === 'overloaded' ? 'overloaded' : 'normal';
    this.cfg = HUMANS_CFG[this.variant];
    this.roomSize = HUMANS_ROOM_SIZE;
    this.target = this.cfg.zombies + this.cfg.boxers + 1;
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
    this.clones = [];
    this._clearRoomBlockers();
    this._buildRoom();
    this._spawnClones();
    this._spawnZombies();
  }

  get(id) { void id; return null; }

  getHudList() {
    return [
      { icon: '⚔️', title: t(this.cfg.title), done: false },
      { icon: '🧍', title: t('Клони живі: {n}/{total}', { n: this.aliveClones(), total: this.cfg.clones + this.cfg.shooters }), done: false },
      { icon: '🧟', title: t('Зомбі лишилось: {n}/{total}', { n: this.remaining(), total: this.target }), done: this.completed },
      { icon: '🔫', title: t('Пістолет, посох і меч. Без пікапів і магазину. Є тільки щит-гаджет.'), done: false },
    ];
  }

  getMarkers() {
    const out = this.clones.filter((c) => c.hp > 0)
      .map((c) => ({ x: c.x, z: c.z, color: c.shooter ? '#7bdcff' : '#4dd6a8', icon: c.shooter ? '🔫' : '🧍' }));
    for (const z of this.level.zombies.list) {
      if (z.humans && z.state !== 'dead') out.push({ x: z.x, z: z.z, color: z.type === 'robot' ? '#ffd23f' : z.type === 'boxer' ? '#ff9a3d' : '#ff5d73', icon: z.type === 'robot' ? '🤖' : z.type === 'boxer' ? '🥊' : '🧟' });
    }
    return out;
  }

  aliveClones() {
    return this.clones.filter((c) => c.hp > 0).length;
  }

  remaining() {
    return this.level.zombies.list.filter((z) => z.humans && z.state !== 'dead').length;
  }

  update(dt) {
    if (this.level.gadgets) this.level.gadgets.clones = this.clones;
    this._clampActor(this.level.player);
    for (const z of this.level.zombies.list) {
      if (z.humans && z.state !== 'dead') this._clampZombie(z);
    }
    this._updateClones(dt);
    if (!this.over && this.remaining() <= 0) {
      this.completed = true;
      this.level.game._endHumansRun(true);
    }
  }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
      remaining: this.remaining(),
      clones: this.aliveClones(),
      target: this.target,
      cloneTotal: this.cfg.clones + this.cfg.shooters,
    };
  }

  placePlayer() {
    const p = this.level.player;
    const x = this.cx;
    const z = this.cz + this._half - 55;
    p.pos.set(x, this._floorAt(x, z), z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const floorM = new THREE.MeshStandardMaterial({ color: 0x28333d, roughness: 0.9 });
    const wallM = new THREE.MeshStandardMaterial({ color: 0x3d4652, roughness: 0.85 });
    level.world.layout.BOUND = Math.max(level.world.layout.BOUND || 0, Math.hypot(cx, cz) + h + 20);
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomSize - 1, d: this.roomSize - 1, top: this.floorY });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.16, this.roomSize), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 3.2, sz), wallM);
      wall.position.set(x, this.floorY + 1.6, z);
      wall.castShadow = wall.receiveShadow = true;
      level.scene.add(wall);
    };
    mkWall(cx, cz - h, this.roomSize, 1);
    mkWall(cx, cz + h, this.roomSize, 1);
    mkWall(cx - h, cz, 1, this.roomSize);
    mkWall(cx + h, cz, 1, this.roomSize);
  }

  _spawnClones() {
    const total = this.cfg.clones + this.cfg.shooters;
    const baseZ = this.cz + this._half - 130;
    for (let i = 0; i < total; i++) {
      const col = i % 10;
      const row = Math.floor(i / 10);
      const x = this.cx - 45 + col * 10;
      const z = baseZ + row * 10;
      const y = this._floorAt(x, z) + CLONE_FOOT_LIFT;
      const rig = makeHero('ninja');
      rig.group.position.set(x, y, z);
      this.level.scene.add(rig.group);
      const clone = { x, z, y, hp: 30, hitT: 0, shooter: i >= this.cfg.clones, rig, mesh: rig.group };
      clone.takeDamage = (dmg) => {
        clone.hp = Math.max(0, clone.hp - dmg);
        if (clone.hp <= 0) clone.mesh.visible = false;
      };
      this.clones.push(clone);
    }
  }

  _spawnZombies() {
    const types = ['walker', 'runner', 'imp', 'spitter', 'gunner', 'tank'];
    const baseZ = this.cz - this._half + 130;
    for (let i = 0; i < this.cfg.zombies; i++) {
      const col = i % 10;
      const row = Math.floor(i / 10);
      this._addZombie(types[i % types.length], this.cx - 45 + col * 10, baseZ - row * 10);
    }
    for (let i = 0; i < this.cfg.boxers; i++) {
      this._addZombie('boxer', this.cx + 70 + i * 8, baseZ);
    }
    const robot = this._addZombie('robot', this.cx, this.cz - this._half + 55);
    if (this.cfg.robotHp) {
      robot.hp = robot.maxHp = this.cfg.robotHp;
      robot.stats = { ...robot.stats, hp: this.cfg.robotHp };
    }
  }

  _addZombie(type, x, z) {
    const zb = this.level.zombies.spawn(type, x, z, {
      noLeash: true,
      anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
    });
    zb.humans = true;
    zb.stats = { ...zb.stats, coins: 0 };
    zb.aggroed = true;
    zb.state = 'chase';
    this._clampZombie(zb);
    return zb;
  }

  _updateClones(dt) {
    for (const c of this.clones) {
      if (c.hp <= 0) continue;
      const target = this._nearestZombie(c.x, c.z);
      if (!target) { setAnim(c.rig, 'idle'); updateRig(c.rig, dt); continue; }
      const dx = target.x - c.x;
      const dz = target.z - c.z;
      const dist = Math.hypot(dx, dz) || 1;
      c.mesh.rotation.y = Math.atan2(-dx, -dz);
      if (c.shooter) { this._updateShooterClone(c, target, dx, dz, dist, dt); updateRig(c.rig, dt); continue; }
      if (dist > 2.1) {
        const step = Math.min(dist - 2.0, 5.2 * dt);
        c.x += (dx / dist) * step;
        c.z += (dz / dist) * step;
        this._clampClone(c);
        setAnim(c.rig, 'run');
      } else {
        c.hitT -= dt;
        if (c.hitT <= 0) {
          c.hitT = 0.75;
          target.lastHitBy = 1;
          target.damage(22, new THREE.Vector3(dx, 0, dz).normalize(), false);
          setAnim(c.rig, 'attack');
        } else {
          setAnim(c.rig, 'idle');
        }
      }
      updateRig(c.rig, dt);
    }
  }

  _updateShooterClone(c, target, dx, dz, dist, dt) {
    if (dist > 18) {
      const step = Math.min(dist - 16, 4.6 * dt);
      c.x += (dx / dist) * step;
      c.z += (dz / dist) * step;
      this._clampClone(c);
      setAnim(c.rig, 'run');
      return;
    }
    c.hitT -= dt;
    if (c.hitT <= 0) {
      c.hitT = 0.9;
      target.lastHitBy = 1;
      target.damage(5, new THREE.Vector3(dx, 0, dz).normalize(), false);
      setAnim(c.rig, 'attack');
    } else {
      setAnim(c.rig, 'idle');
    }
  }

  _nearestZombie(x, z) {
    let best = null;
    let bd = Infinity;
    for (const zb of this.level.zombies.list) {
      if (!zb.humans || zb.state === 'dead') continue;
      const d = Math.hypot(zb.x - x, zb.z - z);
      if (d < bd) { bd = d; best = zb; }
    }
    return best;
  }

  _clampActor(p) {
    const x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, p.pos.x));
    const z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, p.pos.z));
    const floorY = this._floorAt(x, z);
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
    if (p.pos.y < floorY || p.pos.y > floorY + 4) {
      p.pos.y = floorY;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
    }
  }

  _clampZombie(z) {
    z.x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, z.x));
    z.z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, z.z));
    z.y = this._floorAt(z.x, z.z);
    if (z.rig && z.rig.group) z.rig.group.position.set(z.x, z.y, z.z);
  }

  _clampClone(c) {
    c.x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, c.x));
    c.z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, c.z));
    c.y = this._floorAt(c.x, c.z) + CLONE_FOOT_LIFT;
    c.mesh.position.set(c.x, c.y, c.z);
  }

  _floorAt(x, z) {
    return Math.max(this.floorY, this.level.world.floorAt(x, z, this.floorY), this.level.world.groundH(x, z));
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
    this.level.world.floors = this.level.world.floors.filter((f) => !inside(f));
    if (typeof this.level.world._buildGrid === 'function') this.level.world._buildGrid();
  }

  dispose() {
    for (const c of this.clones) {
      this.level.scene.remove(c.mesh);
      disposeObject(c.mesh);
    }
    this.clones = [];
  }
}
