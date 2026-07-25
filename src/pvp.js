import { t } from './i18n.js';
import { buildRectArena, clampActorToRect, clampZombieToRect } from './roomkit.js';

export const OVERLOADED_PVP_UNLOCK_COUNTRIES = 8;
const PVP_ROOM_SIZE = 30;
const PVP_ZOMBIE_HP = 250;
const PVP_ZOMBIE_DMG = 10;

const PVP_CONFIGS = {
  normal: {
    title: 'ПВП',
    roomSize: PVP_ROOM_SIZE,
    zombieType: 'walker',
    zombieHp: PVP_ZOMBIE_HP,
    zombieDmg: PVP_ZOMBIE_DMG,
    zombieZ: -8,
  },
  overloaded: {
    title: 'Перегружене ПВП',
    roomSize: 35,
    zombieType: 'robot',
    zombieHp: 3000,
    zombieDmg: 300,
    zombieZ: -10,
    zombieShield: 1000,
    zombieShieldCd: 45,
    zombieRanged: { min: 7, max: 32, hold: 13, cd: 2.5, projSpeed: 26, dmg: 350, size: 0.32, color: 0xffd24a },
  },
};

export class PvpMode {
  constructor(level, variant = 'normal') {
    this.level = level;
    this.variant = PVP_CONFIGS[variant] ? variant : 'normal';
    this.cfg = PVP_CONFIGS[this.variant];
    this.roomSize = this.cfg.roomSize;
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

  getHudList() {
    return [
      { icon: '⚔️', title: t(this.cfg.title), done: false },
      { icon: '🧟', title: t('Зомбі: {n} HP', { n: Math.max(0, Math.ceil(this.zombie?.hp || 0)) }), done: this.remaining() <= 0 },
      { icon: this.variant === 'overloaded' ? '💣' : '🪄', title: this.variant === 'overloaded'
        ? t('Гармата і меч. Щит 1000 HP. Без магазину й пікапів.')
        : t('Тільки посох. 50 HP. Без магазину, гаджетів і пікапів.'), done: false },
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
    buildRectArena(this.level, this.cx, this.cz, this.roomSize, {
      wall: { color: 0x3a2638, roughness: 0.85, metalness: 0.05 },
      rail: { color: 0xb86cff, roughness: 0.5, metalness: 0.1 },
      floor: { color: 0x2d3346, roughness: 0.9 },
    });
  }

  _spawnZombie() {
    const zb = this.level.zombies.spawn(this.cfg.zombieType, this.cx, this.cz + this.cfg.zombieZ, {
      noLeash: true,
      anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
    });
    zb.pvp = true;
    this.level.zombies.setConfiguredHp(zb, this.cfg.zombieHp);
    zb.stats = { ...zb.stats, dmg: this.cfg.zombieDmg, coins: 0 };
    if (this.cfg.zombieRanged) zb.ranged = { ...this.cfg.zombieRanged };
    if (this.cfg.zombieShield) {
      zb.shieldHp = zb.shieldMax = this.cfg.zombieShield;
      zb.stats.shieldHp = this.cfg.zombieShield;
      zb.pvpShieldCd = this.cfg.zombieShieldCd || 8;
    }
    zb.aggroed = true;
    zb.state = 'chase';
    this.zombie = zb;
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
