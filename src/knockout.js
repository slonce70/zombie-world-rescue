import { t } from './i18n.js';
import { buildRectArena, clampActorToRect, clampZombieToRect } from './roomkit.js';

export const OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES = 8;
const KNOCKOUT_ROOM_SIZE = 33;
export const KNOCKOUT_STAFF_CHANCE = 0.12;

const KNOCKOUT_CONFIGS = {
  normal: {
    title: 'НОКАУТ',
    zombies: 10,
    playerHp: null,
    loadoutText: 'Тільки пістолет. Без магазину, гаджетів і бафів.',
  },
  overloaded: {
    title: 'Перевантажений нокаут',
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
    // 🎲 драфт на «межі хвилі»: у Нокауті одна пачка, тож ловимо середину забігу —
    // коли зачищено половину зомбі (раз за забіг, лише соло).
    if (!this.over && !this._draftFired && this.remaining() <= Math.floor(this.target / 2)) {
      this._draftFired = true;
      this.level.game._maybeModeDraft(this.level);
    }
    if (!this.over && this.remaining() <= 0) {
      this.completed = true;
      this.level.game._endKnockoutRun();
    }
  }

  _buildRoom() {
    buildRectArena(this.level, this.cx, this.cz, this.roomSize, {
      wall: { color: 0x24354b, roughness: 0.85, metalness: 0.05 },
      rail: { color: 0xffd23f, roughness: 0.5, metalness: 0.1 },
      floor: { color: 0x34495e, roughness: 0.9 },
    });
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

  _clampActor(p) { clampActorToRect(p, this.cx, this.cz, this._half, this._half); }

  _clampZombie(z) { clampZombieToRect(z, this.cx, this.cz, this._half, this._half); }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
    };
  }
}
