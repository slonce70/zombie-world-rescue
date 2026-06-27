import * as THREE from 'three';
import { t } from './i18n.js';
import { disposeObject } from './utils.js';

export const WORLD_BOSSES = [
  {
    id: 'radiation',
    icon: '☢️',
    name: () => t('☢️ БОС РАДІАЦІЇ'),
    shortName: () => t('Бос Радіації'),
    style: 'radiation',
    unlockCountries: 4,
    hp: 9000,
    roomSize: 86,
    color: 0x79ff4d,
    mechanic: () => t('Токсичні зони на підлозі. Не стій у зеленому колі.'),
    reward: { coins: 800, crystals: 10, xp: 450 },
  },
  {
    id: 'ice',
    icon: '❄️',
    name: () => t('❄️ КРИЖАНИЙ ГЕНЕРАЛ'),
    shortName: () => t('Крижаний Генерал'),
    style: 'iceGeneral',
    unlockCountries: 8,
    hp: 12000,
    roomSize: 92,
    color: 0x9be8ff,
    mechanic: () => t('Крижаний щит інколи зменшує шкоду. Перечекай і стріляй після спаду.'),
    reward: { coins: 1200, crystals: 15, xp: 650 },
  },
  {
    id: 'titan',
    icon: '🤖',
    name: () => t('🤖 МЕХАНІЧНИЙ ТИТАН'),
    shortName: () => t('Механічний Титан'),
    style: 'mechTitan',
    unlockCountries: 12,
    hp: 16000,
    roomSize: 100,
    color: 0xff6a2a,
    mechanic: () => t('Слабке ядро відкривається хвилями. Бий у момент червоного спалаху.'),
    reward: { coins: 2000, crystals: 25, xp: 900 },
  },
];

export const WORLD_BOSS_MIN_COUNTRIES = WORLD_BOSSES[0].unlockCountries;
export const WORLD_BOSS_BY_ID = Object.fromEntries(WORLD_BOSSES.map((b) => [b.id, b]));

export function worldBossUnlocked(id, liberatedCount) {
  const cfg = WORLD_BOSS_BY_ID[id];
  return !!cfg && liberatedCount >= cfg.unlockCountries;
}

export function nextWorldBoss(liberatedCount) {
  return WORLD_BOSSES.find((b) => liberatedCount < b.unlockCountries) || null;
}

export class WorldBossMode {
  constructor(level, id) {
    this.level = level;
    this.cfg = WORLD_BOSS_BY_ID[id] || WORLD_BOSSES[0];
    this.id = this.cfg.id;
    this.roomSize = this.cfg.roomSize;
    this.completed = false;
    this.over = false;
    this.prompt = null;
    this.missions = [];
    this.civilians = [];
    this.bossStarted = false;
    this.bossUnlocked = true;
    this.allDone = false;
    this.hazards = [];
    this.roomMeshes = [];
    this._hazardT = 1.2;
    this._shieldT = 4.0;
    this._coreT = 3.0;
    this._summonT = 7.0;
    const a = level.world.layout.arena || { x: 0, z: 0 };
    this.cx = a.x;
    this.cz = a.z;
    this._half = this.roomSize / 2;
    this._buildRoom();
    this._spawned = false;
  }

  get(id) { void id; return null; }

  getHudList() {
    const hp = Math.max(0, Math.ceil(this.boss?.hp || 0));
    return [
      { icon: this.cfg.icon, title: this.cfg.name(), done: this.completed },
      { icon: '❤️', title: t('HP боса: {n}', { n: hp }), done: hp <= 0 },
      { icon: '💡', title: this.cfg.mechanic(), done: false },
    ];
  }

  getMarkers() {
    return this.boss && this.boss.state !== 'dead'
      ? [{ x: this.boss.x, z: this.boss.z, color: '#ff5d73', icon: this.cfg.icon }]
      : [];
  }

  remaining() {
    return this.boss && this.boss.state !== 'dead' ? 1 : 0;
  }

  update(dt = 0.016) {
    if (this.over) return;
    if (!this._spawned) {
      this._spawned = true;
      this._spawnBoss();
    }
    this._clampActor(this.level.player);
    if (this.boss && this.boss.state !== 'dead') this._clampZombie(this.boss);
    if (this.id === 'radiation') this._updateRadiation(dt);
    if (this.id === 'ice') this._updateIce(dt);
    if (this.id === 'titan') this._updateTitan(dt);
    this._updateHazards(dt);
  }

  onBossDied() {
    if (this.over) return;
    this.completed = true;
    this.over = true;
    this.level.game._endWorldBossRun(true);
  }

  results() {
    return {
      id: this.id,
      name: this.cfg.name(),
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
    };
  }

  dispose() {
    for (const h of this.hazards) {
      this.level.scene.remove(h.mesh);
      disposeObject(h.mesh);
    }
    this.hazards = [];
    for (const mesh of this.roomMeshes) {
      this.level.scene.remove(mesh);
      disposeObject(mesh);
    }
    this.roomMeshes = [];
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x242833, roughness: 0.85, metalness: 0.05 });
    const railM = new THREE.MeshStandardMaterial({ color: this.cfg.color, roughness: 0.35, metalness: 0.15, emissive: this.cfg.color, emissiveIntensity: 0.12 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x303848, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.18, this.roomSize), floorM);
    floor.position.set(cx, level.world.groundH(cx, cz) - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    this.roomMeshes.push(floor);
    const mkWall = (x, z, sx, sz) => {
      const y = level.world.groundH(x, z) + 1.4;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), wallM);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz + 0.03), railM);
      stripe.position.set(x, y + 0.25, z);
      level.scene.add(wall, stripe);
      this.roomMeshes.push(wall, stripe);
    };
    mkWall(cx, cz - h, this.roomSize, 0.35);
    mkWall(cx, cz + h, this.roomSize, 0.35);
    mkWall(cx - h, cz, 0.35, this.roomSize);
    mkWall(cx + h, cz, 0.35, this.roomSize);
  }

  _spawnBoss() {
    const boss = this.level.zombies.spawn('boss', this.cx, this.cz - 11, {
      style: this.cfg.style,
      noLeash: true,
      anchor: { x: this.cx, z: this.cz, r: this._half - 3 },
    });
    boss.worldBoss = this.id;
    boss.maxHp = this.cfg.hp;
    boss.hp = this.cfg.hp;
    boss.stats = { ...boss.stats, hp: this.cfg.hp, coins: 0 };
    boss.aggroed = true;
    boss.state = 'chase';
    this.level.zombies.boss = boss;
    this.boss = boss;
    this.bossStarted = true;
    this.level.bus.emit('bossStart');
    this.level.game.hud.banner(this.cfg.name(), this.cfg.mechanic(), 4.2);
  }

  _updateRadiation(dt) {
    this._hazardT -= dt;
    if (this._hazardT > 0) return;
    this._hazardT = 5.4;
    const p = this.level.player.pos;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + this.level.stats.time * 0.7;
      const d = 5 + i * 3;
      this._addHazard(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, 4.7, 4.0, 9, 0x79ff4d);
    }
    this.level.effects.ring(new THREE.Vector3(this.boss.x, this.boss.y, this.boss.z), 0x79ff4d, 7);
  }

  _updateIce(dt) {
    this._shieldT -= dt;
    if (this._shieldT <= 0) {
      const on = !this.boss.worldBossShield;
      this.boss.worldBossShield = on;
      this._shieldT = on ? 4.0 : 8.0;
      this.level.effects.ring(new THREE.Vector3(this.boss.x, this.boss.y, this.boss.z), on ? 0x9be8ff : 0xffffff, on ? 5.5 : 3.2);
      this.level.game.hud.toast(on ? t('❄️ Крижаний щит! Шкода тимчасово слабша.') : t('❄️ Щит спав! Стріляй зараз!'));
    }
  }

  _updateTitan(dt) {
    this._coreT -= dt;
    if (this._coreT <= 0) {
      const open = !this.boss.worldBossCoreOpen;
      this.boss.worldBossCoreOpen = open;
      this.boss.worldBossCoreClosed = !open;
      this._coreT = open ? 5.0 : 8.0;
      this.level.effects.ring(new THREE.Vector3(this.boss.x, this.boss.y, this.boss.z), open ? 0xff3a1e : 0xffc933, open ? 6.2 : 3.5);
      this.level.game.hud.toast(open ? t('🤖 Ядро відкрите! Нанось більше шкоди!') : t('🤖 Броня закрилась. Переживи фазу.'));
    }
    this._summonT -= dt;
    if (this._summonT <= 0) {
      this._summonT = 12.0;
      for (const off of [-5, 0, 5]) {
        const z = this.level.zombies.spawn('robot', this.cx + off, this.cz + 9, {
          noLeash: true,
          anchor: { x: this.cx, z: this.cz, r: this._half - 3 },
        });
        z.worldBossMinion = true;
        z.aggroed = true;
        z.state = 'chase';
      }
    }
  }

  _addHazard(x, z, r, life, dps, color) {
    const y = this.level.world.groundH(x, z) + 0.08;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.65, r, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    this.level.scene.add(mesh);
    this.hazards.push({ mesh, x, z, r, life, maxLife: life, dps, tick: 0 });
  }

  _updateHazards(dt) {
    const p = this.level.player;
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h.mesh.material.opacity = Math.max(0, 0.45 * (h.life / h.maxLife));
      h.mesh.scale.setScalar(1 + Math.sin((this.level.stats.time + i) * 6) * 0.04);
      if (Math.hypot(p.pos.x - h.x, p.pos.z - h.z) <= h.r && p.health > 0) {
        h.tick += dt;
        if (h.tick >= 0.5) {
          h.tick = 0;
          p.takeDamage(h.dps * 0.5, h.x, h.z);
        }
      }
      if (h.life <= 0) {
        this.level.scene.remove(h.mesh);
        disposeObject(h.mesh);
        this.hazards.splice(i, 1);
      }
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
}
