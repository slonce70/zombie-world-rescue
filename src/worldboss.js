import * as THREE from 'three';
import { t } from './i18n.js';
import { disposeObject } from './utils.js';
import { clampActorToRect, clampZombieToRect } from './roomkit.js';

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
    this.floorY = this._calcFloorY();
    this._buildRoom();
    this._spawned = false;
  }

  // 🌐 кооп: гість шукає боса живим у списку (state-ресинк заміняє об'єкт на puppet
  // із прапором o.wb); host/solo — прямий this.boss
  _liveBoss() {
    if (this.boss && this.boss.state !== 'dead') return this.boss;
    return this.level.zombies.list.find((z) => z.worldBoss && z.state !== 'dead') || this.boss || null;
  }

  getHudList() {
    const boss = this._liveBoss();
    const hp = Math.max(0, Math.ceil(boss?.hp || 0));
    return [
      { icon: this.cfg.icon, title: this.cfg.name(), done: this.completed },
      { icon: '❤️', title: t('HP боса: {n}', { n: hp }), done: hp <= 0 },
      { icon: '💡', title: this.cfg.mechanic(), done: false },
    ];
  }

  getMarkers() {
    const boss = this._liveBoss();
    return boss && boss.state !== 'dead'
      ? [{ x: boss.x, z: boss.z, color: '#ff5d73', icon: this.cfg.icon }]
      : [];
  }

  remaining() {
    return this._liveBoss() ? 1 : 0;
  }

  // авторитет над спавнами/фазами/хазардами: соло (level.net===null) або хост
  get _authority() { return !this.level.net || this.level.net.authority; }

  update(dt = 0.016) {
    if (this.over) return;
    // 🌐 гість: боса/міньйонів/хазарди спавнить лише хост (puppet-и приходять через zs);
    // фінал детектимо самі зі стану puppet-боса (патерн radiation)
    if (!this._authority) {
      this._updateGuest();
      return;
    }
    if (!this._spawned) {
      this._spawned = true;
      this._spawnBoss();
    }
    this._clampActor(this.level.player);
    if (this.boss && this.boss.state !== 'dead') this._clampZombie(this.boss);
    for (const z of this.level.zombies.list || []) {
      if (z.worldBossMinion && z.state !== 'dead') this._clampZombie(z);
    }
    if (this.id === 'radiation') this._updateRadiation(dt);
    if (this.id === 'ice') this._updateIce(dt);
    if (this.id === 'titan') this._updateTitan(dt);
    this._updateHazards(dt);
  }

  // 🌐 гість: тримаємось у кімнаті, детектимо перемогу зі стану puppet-боса.
  // Хазарди/урон від них — авторитет хоста (гість не рахує собі шкоду).
  _updateGuest() {
    this._clampActor(this.level.player);
    // хост убив боса → puppet мертвий/зник у списку → перемога кожному локально
    if (!this._detectedWin && this._bossSeen && !this._liveBoss()) {
      this._detectedWin = true;
      this.completed = true;
      this.over = true;
      this.level.game._endWorldBossRun(true);
      return;
    }
    if (this._liveBoss()) this._bossSeen = true;
  }

  onBossDied() {
    if (this.over) return;
    this.completed = true;
    this.over = true;
    this.level.game._endWorldBossRun(true);
  }

  // 🌐 генеричний канал snap.m (level.missions === level.worldBoss): фази боса їдуть
  // гостю у снапшоті хоста. Puppet-бос — джерело HP/позиції; сюди кладемо лише прапори фаз.
  netState() {
    const b = this.boss;
    return [
      b && b.worldBossShield ? 1 : 0,
      b && b.worldBossCoreOpen ? 1 : 0,
      b && b.worldBossCoreClosed ? 1 : 0,
      // maxHp боса: puppet рахує наївний boss-HP (не 9000/12000/16000) — виправляємо,
      // щоб «HP боса: {n}» у гостя показував ту саму абсолютну шкалу, що й хост
      this.cfg.hp,
    ];
  }

  applyNet(m) {
    const b = this._liveBoss();
    if (!b || !Array.isArray(m)) return;
    b.worldBossShield = m[0] === 1;
    b.worldBossCoreOpen = m[1] === 1;
    b.worldBossCoreClosed = m[2] === 1;
    // фіксуємо шкалу maxHp один раз: снапшот далі жене hp як % від maxHp
    if (m[3] && b.maxHp !== m[3]) {
      const pct = b.maxHp > 0 ? b.hp / b.maxHp : 1;
      b.maxHp = m[3];
      b.hp = Math.max(1, Math.round(b.maxHp * pct));
    }
  }

  // повний стан для новоприбулого/реконект-гостя — ті самі прапори фаз
  netFullState() { return this.netState(); }
  applyNetFull(m) { this.applyNet(m); }

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
    if (this._floorEntry) {
      const i = this.level.world.floors.indexOf(this._floorEntry);
      if (i >= 0) this.level.world.floors.splice(i, 1);
      this._floorEntry = null;
    }
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x242833, roughness: 0.85, metalness: 0.05 });
    const railM = new THREE.MeshStandardMaterial({ color: this.cfg.color, roughness: 0.35, metalness: 0.15, emissive: this.cfg.color, emissiveIntensity: 0.12 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x303848, roughness: 0.9 });
    this._floorEntry = { x: cx, z: cz, ry: 0, w: this.roomSize - 1, d: this.roomSize - 1, top: this.floorY };
    level.world.floors.push(this._floorEntry);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.18, this.roomSize), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    this.roomMeshes.push(floor);
    const mkWall = (x, z, sx, sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), wallM);
      wall.position.set(x, this.floorY + 1.4, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.12, sz + 0.03), railM);
      stripe.position.set(x, this.floorY + 1.65, z);
      level.scene.add(wall, stripe);
      this.roomMeshes.push(wall, stripe);
    };
    mkWall(cx, cz - h, this.roomSize, 0.35);
    mkWall(cx, cz + h, this.roomSize, 0.35);
    mkWall(cx - h, cz, 0.35, this.roomSize);
    mkWall(cx + h, cz, 0.35, this.roomSize);
  }

  _calcFloorY() {
    let y = -Infinity;
    const h = this._half - 1;
    for (const ox of [-h, -h * 0.5, 0, h * 0.5, h]) {
      for (const oz of [-h, -h * 0.5, 0, h * 0.5, h]) {
        y = Math.max(y, this.level.world.groundH(this.cx + ox, this.cz + oz));
      }
    }
    return y + 0.08;
  }

  _spawnBoss() {
    const boss = this.level.zombies.spawn('boss', this.cx, this.cz - 11, {
      style: this.cfg.style,
      noLeash: true,
      worldBoss: this.id, // прапор ставиться до onZombieSpawn → o.wb їде гостю у live-zs
      anchor: { x: this.cx, z: this.cz, r: this._half - 3 },
    });
    boss.worldBoss = this.id;
    if (this.level.zombies && typeof this.level.zombies.setConfiguredHp === 'function') {
      this.level.zombies.setConfiguredHp(boss, this.cfg.hp);
    } else {
      boss.maxHp = boss.hp = this.cfg.hp;
      boss.stats = { ...boss.stats, hp: this.cfg.hp };
    }
    boss.stats = { ...boss.stats, coins: 0 };
    boss.aggroed = true;
    boss.state = 'chase';
    this.level.zombies.boss = boss;
    this.boss = boss;
    this._clampZombie(boss);
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
          worldBossMinion: true, // прапор до onZombieSpawn → o.wbm гостю
          anchor: { x: this.cx, z: this.cz, r: this._half - 3 },
        });
        z.worldBossMinion = true;
        z.aggroed = true;
        z.state = 'chase';
        this._clampZombie(z);
      }
    }
  }

  _addHazard(x, z, r, life, dps, color) {
    const y = this.floorY + 0.08;
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
    const level = this.level;
    const net = level.net;
    // 🌐 кооп-хост б'є ВСІХ гравців (собі — локально, віддаленим — через net.hurtPlayer);
    // соло — лише свій гравець. Гість сюди не заходить (авторитет хоста).
    const targets = (net && level.players) ? level.players : [{ pid: 1, pos: level.player.pos, health: level.player.health }];
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.life -= dt;
      h.mesh.material.opacity = Math.max(0, 0.45 * (h.life / h.maxLife));
      h.mesh.scale.setScalar(1 + Math.sin((this.level.stats.time + i) * 6) * 0.04);
      const inside = targets.filter((pl) => pl.health > 0 && Math.hypot(pl.pos.x - h.x, pl.pos.z - h.z) <= h.r);
      if (inside.length) {
        h.tick += dt;
        if (h.tick >= 0.5) {
          h.tick = 0;
          const dmg = h.dps * 0.5;
          for (const pl of inside) {
            if (net) net.hurtPlayer(pl, dmg, h.x, h.z);
            else level.player.takeDamage(dmg, h.x, h.z);
          }
        }
      }
      if (h.life <= 0) {
        this.level.scene.remove(h.mesh);
        disposeObject(h.mesh);
        this.hazards.splice(i, 1);
      }
    }
  }

  _clampActor(p) { clampActorToRect(p, this.cx, this.cz, this._half, this._half, this.floorY); }

  _clampZombie(z) { clampZombieToRect(z, this.cx, this.cz, this._half, this._half, this.floorY); }
}
