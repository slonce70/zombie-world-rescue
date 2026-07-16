import { t } from './i18n.js';
import { buildRectArena, clampActorToRect, clampZombieToRect } from './roomkit.js';

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
    // живий пошук: у коопі state-ресинк гостя заміняє об'єкт боса на puppet
    const boss = this.level.zombies.list.find((z) => z.radiationMode) || this.zombie;
    return [
      { icon: '☢️', title: t('РАДІАЦІЯ'), done: false },
      { icon: '🧟', title: t('Радіаційний зомбі: {n} HP', { n: Math.max(0, Math.ceil(boss?.hp || 0)) }), done: this.remaining() <= 0 },
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
    buildRectArena(this.level, this.cx, this.cz, this.roomSize, {
      wall: { color: 0x21362b, roughness: 0.85, metalness: 0.05 },
      rail: { color: 0x95ff4d, emissive: 0x244d12, roughness: 0.45, metalness: 0.08 },
      floor: { color: 0x24382d, roughness: 0.92 },
    });
  }

  _spawnZombie() {
    const zb = this.level.zombies.spawn('boss', this.cx, this.cz - 9, {
      style: 'radiation',
      noLeash: true,
      anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
    });
    zb.radiationMode = true;
    this.level.zombies.setConfiguredHp(zb, 500);
    zb.stats = { ...zb.stats, dmg: 10, coins: 0 };
    zb.aggroed = true;
    zb.state = 'chase';
    this.level.zombies.boss = zb;
    this.zombie = zb;
  }

  // radiationmode НЕ затискає по Y — floorY лишаємо null
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
