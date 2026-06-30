import * as THREE from 'three';
import { t } from './i18n.js';

export const KNOCKOUT_UNLOCK_LEVEL = 20;
export const OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES = 8;
export const FRIENDLY_KNOCKOUT_UNLOCK_COUNTRIES = 8;
export const KNOCKOUT_ROOM_SIZE = 33;
export const KNOCKOUT_STAFF_CHANCE = 0.12;

const KNOCKOUT_CONFIGS = {
  normal: {
    title: 'НОКАУТ',
    zombies: 10,
    playerHp: null,
    loadoutText: 'Тільки пістолет. Без магазину, гаджетів і бафів.',
  },
  overloaded: {
    title: 'Перегружений нокаут',
    zombies: 20,
    playerHp: 150,
    loadoutText: '20 зомбі, 150 HP, тільки пістолет. Без магазину, гаджетів і бафів.',
  },
  friendly: {
    title: 'Дружній нокаут',
    zombies: 20,
    playerHp: null,
    loadoutText: '20 зомбі для гри з другом. Тільки пістолет. Без магазину, гаджетів і бафів.',
  },
};

export class KnockoutMode {
  constructor(level, variant = 'normal') {
    this.level = level;
    this.variant = KNOCKOUT_CONFIGS[variant] ? variant : 'normal';
    this.cfg = KNOCKOUT_CONFIGS[this.variant];
    this.roomSize = KNOCKOUT_ROOM_SIZE;
    this.target = this.cfg.zombies;
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
      { icon: '🥊', title: t(this.cfg.title), done: false },
      { icon: '🧟', title: t('Зомбі лишилось: {n}/{t}', { n: left, t: this.target }), done: left <= 0 },
      { icon: '🔫', title: t(this.cfg.loadoutText), done: false },
    ];
  }

  getMarkers() {
    return this.level.zombies.list
      .filter((z) => z.knockout && z.state !== 'dead')
      .map((z) => ({ x: z.x, z: z.z, color: '#ff5d73', icon: '🧟' }));
  }

  remaining() {
    return this.level.zombies.list.filter((z) => z.knockout && z.state !== 'dead').length;
  }

  update() {
    this._clampActor(this.level.player);
    for (const z of this.level.zombies.list) {
      if (z.knockout && z.state !== 'dead') this._clampZombie(z);
    }
    if (!this.over && this.remaining() <= 0) {
      this.completed = true;
      this.level.game._endKnockoutRun();
    }
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x24354b, roughness: 0.85, metalness: 0.05 });
    const railM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5, metalness: 0.1 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x34495e, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.18, this.roomSize), floorM);
    floor.position.set(cx, level.world.groundH(cx, cz) - 0.08, cz);
    floor.receiveShadow = true;
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
    level.scene.add(floor);
    mkWall(cx, cz - h, this.roomSize, 0.35);
    mkWall(cx, cz + h, this.roomSize, 0.35);
    mkWall(cx - h, cz, 0.35, this.roomSize);
    mkWall(cx + h, cz, 0.35, this.roomSize);
  }

  _spawnZombies() {
    const types = ['walker', 'runner', 'imp', 'headphones', 'snowman', 'spitter', 'walker', 'runner', 'imp', 'gunner'];
    for (let i = 0; i < this.target; i++) {
      const a = (i / this.target) * Math.PI * 2;
      const r = 7 + (i % 3) * 2.2;
      const x = this.cx + Math.cos(a) * r;
      const z = this.cz + Math.sin(a) * r;
      const zb = this.level.zombies.spawn(types[i % types.length], x, z, {
        noLeash: true,
        anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
      });
      zb.knockout = true;
      zb.aggroed = true;
      zb.state = 'chase';
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
    };
  }
}
