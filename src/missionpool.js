// 🎲 Живі завдання: пул типів місій, що роздаються картам випадково (від сіда),
// тож кожна країна і кожне повторне проходження граються інакше.
// Реалізує той самий інтерфейс, що й старі Missions.
import * as THREE from 'three';
import { t, interactKey } from './i18n.js';
import { makeCivilian, makeGunMesh, updateRig, setAnim, toonMat } from './characters.js';
import { dampAngle, RNG } from './utils.js';
import { livingWorldReward, pickLivingWorldEvent, shouldOfferLivingWorld } from './livingworld.js';

// назви «пристрою для ремонту» за країною — смак без зміни механіки
const REPAIR_NAMES = {
  UKR: t('радіовежу'), DEU: t('насосну станцію'), FRA: t('антену зв\'язку'),
  TUR: t('маяк Босфору'), EGY: t('сонячну станцію'), MOON: t('кисневі реле'),
};

const teamworkPrompt = (text, holders) => holders > 1 ? `${text} · ${t('Разом швидше ×{n}', { n: holders })}` : text;

// ---------- описи типів місій ----------
// slot: до якого зі слотів карти тип може потрапити
// (A — хлів/порятунок, B — вежа/пристрій, C — склад/зона)
export const MISSION_TYPES = {
  rescue: { icon: '🆘', slots: ['A'], reward: 80, horde: 15 },
  repair: { icon: '📡', slots: ['B'], reward: 100, horde: 20 },
  clear: { icon: '📦', slots: ['C'], reward: 120, horde: 24 },
  collect: { icon: '🧺', slots: ['A', 'C'], reward: 110, horde: 18 },
  defense: { icon: '🛡️', slots: ['B', 'C'], reward: 120, horde: 20 },
  hunt: { icon: '👹', slots: ['A', 'C'], reward: 130, horde: 18 },
  nests: { icon: '🟣', slots: ['B', 'C'], reward: 120, horde: 20 },
  escort: { icon: '🧳', slots: ['A'], reward: 130, horde: 18 },
  // v16: «активуй N точок» (kind: activate) і «знайди та принеси» (kind: fetch).
  // country — фірмова місія країни: гарантовано випадає у своєму слоті
  lights: { icon: '🔦', slots: ['B', 'C'], reward: 100, horde: 14, kind: 'activate' },
  well: { icon: '💧', slots: ['A', 'C'], reward: 110, horde: 16, kind: 'activate', country: 'UKR' },
  bonfire: { icon: '🔥', slots: ['B', 'C'], reward: 110, horde: 16, kind: 'activate', country: 'POL' },
  convoy: { icon: '🚚', slots: ['C', 'A'], reward: 130, horde: 18, kind: 'activate', country: 'DEU' },
  balloon: { icon: '🎈', slots: ['A', 'C'], reward: 120, horde: 16, kind: 'fetch', country: 'FRA' },
  bazaar: { icon: '🧿', slots: ['A', 'C'], reward: 120, horde: 16, kind: 'fetch', country: 'TUR' },
  tomb: { icon: '⚱️', slots: ['B', 'C'], reward: 140, horde: 20, kind: 'fetch', country: 'EGY' },
  // Сюжетний штурм Польщі. Не позначаємо country, бо bonfire лишається
  // фірмовою випадковою місією країни, а castle додає storyMissionSet().
  castle: { icon: '🏰', slots: ['C'], reward: 250, horde: 0, kind: 'castle' },
  barracks: { icon: '🏚️', slots: ['D'], reward: 220, horde: 0, kind: 'barracks' },
  shiprescue: { icon: '🚢', slots: ['D'], reward: 260, horde: 0, kind: 'shiprescue' },
  rebuild: { icon: '🏗️', slots: ['D'], reward: 240, horde: 0, kind: 'rebuild' },
  villageclear: { icon: '🏘️', slots: ['D'], reward: 220, horde: 0, kind: 'villageclear' },
  fireworks: { icon: '🎆', slots: ['D'], reward: 240, horde: 0, kind: 'fireworks' },
  stationrepair: { icon: '🛰️', slots: ['D'], reward: 300, horde: 0, kind: 'stationrepair' },
  bases: { icon: '🏚️', slots: ['D'], reward: 180, horde: 0, kind: 'bases' },
  manor: { icon: '🏛️', slots: ['D'], reward: 350, horde: 0, kind: 'manor' },
};

// конфіги двигунів: activate — N точок, біля кожної тримай E
const ACT_CFG = {
  lights: {
    n: 4, hold: 1.6, color: 0xffe066, emoji: '🔦', spread: 'village',
    title: t('Засвіти 4 ліхтарі'), prompt: t('Тримай {k} — засвіти ліхтар', { k: interactKey() }),
    stepToast: t('🔦 Ліхтар світить ({n}/{total})!'), doneToast: t('🔦 Усі ліхтарі світять — стало затишно!'),
  },
  well: {
    n: 3, hold: 3, color: 0x4db8ff, emoji: '💧', spread: 'map',
    title: t('Набери води з 3 колодязів'), prompt: t('Тримай {k} — набери води', { k: interactKey() }),
    stepToast: t('💧 Відро набрано ({n}/{total})!'), doneToast: t('💧 Вода є! Село каже дякую!'),
  },
  bonfire: {
    n: 3, hold: 2.5, color: 0xff8a3d, emoji: '🔥', spread: 'map',
    title: t('Розпали 3 багаття'), prompt: t('Тримай {k} — розпали багаття', { k: interactKey() }),
    stepToast: t('🔥 Багаття палає ({n}/{total})!'), doneToast: t('🔥 Усі багаття палають — мороз відступає!'),
  },
  convoy: {
    n: 3, hold: 1.2, color: 0xffd23f, emoji: '🚚', spread: 'map', guards: 3,
    title: t('Розблокуй конвой: 3 вантажівки'), prompt: t('Тримай {k} — заведи вантажівку', { k: interactKey() }),
    stepToast: t('🚚 Вантажівка завелась ({n}/{total})!'), doneToast: t('🚚 Конвой урятовано — їде по людей!'),
  },
};

// fetch — розкидані предмети; зібрав усі → принеси і здай (тримай E)
const FETCH_CFG = {
  balloon: {
    n: 3, hold: 2, color: 0xff6ea8, emoji: '🛢️', deliver: 'balloon', deliverEmoji: '🎈',
    title: t('Знайди 3 балони газу для кулі'), prompt: t('Натисни {k} — візьми балон ({n}/{total})', { k: interactKey() }),
    deliverPrompt: t('Тримай {k} — заправ кулю', { k: interactKey() }), stepToast: t('🛢️ Балон є ({n}/{total})!'),
    foundToast: t('🎈 Усі балони зібрано — неси до кулі!'), doneToast: t('🎈 Куля летить по допомогу!'),
  },
  bazaar: {
    n: 3, hold: 2, color: 0x46c8d8, emoji: '🧶', deliver: 'grandBazaar', deliverEmoji: '🧿',
    title: t('Поверни 3 килими на базар'), prompt: t('Натисни {k} — підбери килим ({n}/{total})', { k: interactKey() }),
    deliverPrompt: t('Тримай {k} — розклади килими', { k: interactKey() }), stepToast: t('🧶 Килим знайдено ({n}/{total})!'),
    foundToast: t('🧿 Усі килими в тебе — неси на базар!'), doneToast: t('🧿 Базар знову працює!'),
  },
  tomb: {
    n: 2, hold: 4, color: 0xd9b96a, emoji: '🪬', deliver: 'pyramids', deliverEmoji: '⚱️', ambush: 4,
    title: t('Відкрий гробницю: 2 печатки'), prompt: t('Натисни {k} — візьми печатку ({n}/{total})', { k: interactKey() }),
    deliverPrompt: t('Тримай {k} — відкрий гробницю', { k: interactKey() }), stepToast: t('🪬 Печатка у тебе ({n}/{total})!'),
    foundToast: t('⚱️ Печатки зібрано — до дверей гробниці!'), doneToast: t('⚱️ Гробниця відкрита! Скарб твій!'),
  },
};

// яка комбінація випаде карті: класика для першого проходження України,
// далі — сідований мікс без повторів типів
export function rollMissionSet(countryId, seed, runIndex) {
  if (countryId === 'UKR' && runIndex === 0) {
    return ['rescue', 'repair', 'clear']; // навчальна класика
  }
  const rng = new RNG((seed * 31 + runIndex * 7777 + 13) >>> 0);
  const bySlot = {
    A: ['rescue', 'collect', 'hunt', 'escort'],
    B: ['repair', 'defense', 'nests', 'lights'],
    C: ['clear', 'defense', 'collect', 'hunt', 'nests', 'lights'],
  };
  const used = new Set();
  const out = [];
  for (const slot of ['A', 'B', 'C']) {
    const pool = bySlot[slot].filter((t) => !used.has(t));
    const pick = pool[rng.int(0, pool.length - 1)];
    used.add(pick);
    out.push(pick);
  }
  // 🌟 фірмова місія країни — гарантовано в одному зі своїх слотів
  const special = Object.keys(MISSION_TYPES).find((t) => MISSION_TYPES[t].country === countryId);
  if (special) {
    const slots = MISSION_TYPES[special].slots;
    const slot = slots[rng.int(0, slots.length - 1)];
    out['ABC'.indexOf(slot)] = special;
  }
  // 🎁 четвертий слот — турецький корабель або звичайна бонусна місія
  const dPool = ['collect', 'hunt', 'lights', 'defense'].filter((t) => !out.includes(t));
  out.push(countryId === 'TUR' ? 'shiprescue' : dPool[rng.int(0, dPool.length - 1)]);
  return out;
}

// аліаси старих ID — щоб тести і збережені посилання працювали
const SLOT_ALIASES = { rescue: 0, tower: 1, warehouse: 2 };
const CASTLE_PHASES = ['find', 'carry', 'plant', 'fight', 'dungeon', 'rescue', 'done'];
const SHIP_PHASES = ['find', 'carry', 'repair', 'board', 'sailing', 'rescue', 'return-board', 'returning', 'unload'];

export class DynamicMissions {
  // storyTypes — примусовий набір для сюжетного рівня (StoryMissions передає
  // storyMissionSet(...)); пріоритет: тестовий хук > сюжет > природний роль
  constructor(level, storyTypes = null, { objectiveOnly = false } = {}) {
    this.level = level;
    this.L = level.world.layout;
    const game = level.game;
    this.mirror = !!level.mirror;
    this.objectiveOnly = !!objectiveOnly;
    // у коопі гість будує місії з runIndex ХОСТА — щоб набір збігався
    const runIndex = level.runIndex !== undefined
      ? level.runIndex
      : (game.save.missionRuns && game.save.missionRuns[level.countryId]) || 0;
    // тестовий хук: примусовий набір місій
    const types = game._forceMissionSet || storyTypes || rollMissionSet(level.countryId, level.country.seed, runIndex);
    this.runIndex = runIndex;

    // слоти карти: A = хлів, B = вежа, C = склад, D = бонус біля села
    const sites = [
      { slot: 'A', site: this.L.rescue, beamAt: { x: this.L.rescue.x, z: this.L.rescue.z - 6 } },
      { slot: 'B', site: this.L.tower, beamAt: { x: this.L.tower.x + 4, z: this.L.tower.z + 4 } },
      { slot: 'C', site: this.L.warehouse, beamAt: { x: this.L.warehouse.x - 2, z: this.L.warehouse.z - 7.5 } },
      { slot: 'D', site: this.L.village, beamAt: { x: this.L.village.x + 8, z: this.L.village.z + 8 } },
    ];
    const missionSites = this.objectiveOnly
      ? types.map((type) => sites.find((site) => MISSION_TYPES[type].slots.includes(site.slot)))
      : sites;
    this.missions = types.map((type, i) => this._makeMission(type, missionSites[i], i));

    this.civilians = [];
    this.prompt = null;
    this.medicAlive = false;
    this.healPulseT = 0;
    this.pendingHorde = null;
    this.pendingWaves = [];
    this.bossUnlocked = false;
    this.bossStarted = false;
    this.bossBeam = null;
    this.bossHpLeft = null;
    this.allDone = false;
    this.crateReady = false; // для мінімапи (актуально лише з місією «зачистка»)
    this.livingWorld = null;
    this.livingWorldOffered = false;

    // якщо гравець загинув у бою з босом — бій перезапускається з арени
    level.bus.on('playerDied', () => {
      if (this.mirror) return;
      if (level.net && level.players && level.players.some((p) => p.health > 0)) return; // хтось живий — бій триває
      if (this.bossStarted && level.zombies.boss) {
        this.bossHpLeft = level.zombies.despawnBoss();
        this.bossStarted = false;
        this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
        level.bus.emit('toast', t('👑 Бос повернувся на арену й чекає на реванш!'));
      }
    });
  }

  // ---------- створення місії конкретного типу ----------
  _makeMission(type, slotInfo, idx) {
    const level = this.level;
    const mt = MISSION_TYPES[type];
    const train = type === 'repair' && level.countryId === 'POL' && !!level.world.trainStartPoint;
    if (type === 'castle') {
      if (level.world.activateCastleMission) level.world.activateCastleMission();
      const castle = level.country.map.storySites.castleRuin;
      slotInfo = { slot: 'C', site: castle, beamAt: { x: castle.x, z: castle.z } };
    } else if (type === 'barracks') {
      const barracks = level.country.map.storySites.barracks;
      slotInfo = { slot: 'D', site: barracks, beamAt: { x: barracks.x, z: barracks.z } };
    } else if (type === 'shiprescue') {
      const dock = level.country.map.storySites.shipDock;
      const boards = level.country.map.storySites.boardsCrate;
      slotInfo = { slot: 'D', site: dock, beamAt: { x: boards.x, z: boards.z } };
    } else if (type === 'rebuild') {
      const spanish = level.countryId === 'ESP' && level.operation?.missionPreset === 'spain-rebuild-center';
      const site = spanish ? level.country.map.storySites.fiestaSquare : this.L.village;
      const beamAt = spanish ? level.country.map.storySites.musicians : site;
      slotInfo = { slot: 'D', site, beamAt };
    } else if (type === 'villageclear') {
      slotInfo = { slot: 'D', site: level.country.map.sites.village, beamAt: level.country.map.sites.village };
    } else if (type === 'fireworks') {
      const fireworks = level.country.map.storySites.fireworks;
      slotInfo = { slot: 'D', site: fireworks, beamAt: fireworks };
    } else if (type === 'stationrepair') {
      const station = level.country.map.storySites.stationWreck;
      slotInfo = { slot: 'D', site: station, beamAt: station };
    } else if (type === 'bases') {
      slotInfo = { slot: 'D', site: this.L.warehouse, beamAt: this.L.warehouse };
    } else if (type === 'manor') {
      const manor = level.country.map.storySites.manor;
      slotInfo = { slot: 'D', site: manor, beamAt: { x: manor.x - manor.w / 2, z: manor.z } };
    } else if (type === 'defense' && level.countryId === 'UKR') {
      slotInfo = { slot: 'C', site: this.L.village, beamAt: this.L.village };
    } else if (type === 'defense' && level.countryId === 'DEU') {
      const gate = level.country.map.storySites.cityGate;
      slotInfo = { slot: slotInfo.slot, site: gate, beamAt: gate };
    } else if (train) {
      const depot = level.country.map.storySites.railDepot;
      slotInfo = { slot: slotInfo.slot, site: depot, beamAt: level.world.trainStartPoint };
    }
    const m = {
      id: type, type, slotIndex: idx, icon: mt.icon, reward: mt.reward, horde: mt.horde,
      state: 'active', site: slotInfo.site, slot: slotInfo.slot,
    };
    m.beam = level.effects.makeBeam(slotInfo.beamAt.x, slotInfo.beamAt.z, 0x4cff7a, mt.icon);

    if (type === 'rescue') {
      m.title = level.countryId === 'MOON'
        ? t('Врятуй космонавтів з аварійного модуля')
        : t('Врятуй людей у хліві');
      m.opened = false;
      m.openedT = -1;
    } else if (type === 'repair') {
      m.train = train;
      m.repairPoint = m.train ? level.world.trainStartPoint : level.world.repairPoint;
      m.title = m.train ? t('Запусти рятувальний поїзд') : t('Полагодь {x}', { x: REPAIR_NAMES[level.countryId] || t('радіовежу') });
      m.progress = 0;
      m.tickT = 0;
      m.waves = [false, false];
    } else if (type === 'clear') {
      m.title = t('Зачисть склад зброї');
      m.crateOpenedT = -1;
    } else if (type === 'collect') {
      m.title = t('Збери 4 ящики припасів');
      m.found = 0;
      m.crates = this._spawnSupplyCrates(m);
    } else if (type === 'defense') {
      m.title = t('Оборона: протримайся в зоні');
      m.timer = level.countryId === 'UKR' ? 22 : 45;
      m.started = false;
      m.waveT = 0;
      m.zone = this._makeDefenseZone(m);
    } else if (type === 'villageclear') {
      m.siteId = 'village';
      m.title = t('Зачисти село від зомбі');
      m.targets = this._spawnVillageClearZombies(m);
    } else if (type === 'fireworks') {
      m.siteId = 'fireworks';
      m.title = t('Оборони феєрверки');
      m.timer = 30;
      m.duration = 30;
      m.started = false;
      m.waveT = 0;
      m.zone = this._makeDefenseZone(m);
    } else if (type === 'hunt') {
      m.title = t('Перемож 3 елітних зомбі');
      m.killed = 0;
      m.elites = this._spawnElites(m);
    } else if (type === 'nests' || type === 'bases') {
      m.title = type === 'bases' ? t('Зачисть 3 зомбі-бази') : t('Знешкодь 3 зомбі-гнізда');
      m.cleared = 0;
      m.nestList = this._spawnNests(m);
    } else if (type === 'escort') {
      m.title = t('Проведи мандрівника до вежі');
      m.started = false;
      m.traveler = null;
      m.dest = { x: this.L.tower.x, z: this.L.tower.z, r: 7 };
      m.midWave = false;
    } else if (ACT_CFG[type]) {
      const cfg = ACT_CFG[type];
      m.title = cfg.title;
      m.activated = 0;
      m.points = this._spawnActPoints(m, cfg);
    } else if (FETCH_CFG[type]) {
      const cfg = FETCH_CFG[type];
      m.title = cfg.title;
      m.found = 0;
      m.delivered = false;
      m.deliverProgress = 0;
      m.items = this._spawnFetchItems(m, cfg);
      m.dest = this._makeDeliverPoint(m, cfg);
    } else if (type === 'castle') {
      m.phase = 'find';
      m.title = t('Знайди ящик з вибухівкою');
      m.started = false;
      m.plantProgress = 0;
      m.rescueProgress = 0;
      m.guards = [];
      m.archers = [];
      m.dungeonWizards = [];
      m.dungeonStones = [];
      m.explosive = this._makeCastleExplosive(m);
      m.plantPoint = this._castlePlantPoint(m);
      if (m.beam && m.beam.group) {
        m.beam.group.position.x = m.explosive.x;
        m.beam.group.position.z = m.explosive.z;
        m.beam.group.visible = false;
      }
    } else if (type === 'barracks') {
      m.hp = 2500;
      m.maxHp = 2500;
      m.spawnFastT = 2;
      m.spawnGiantT = 7;
      m.destroyed = false;
      m.barracks = this._makeZombieBarracks(m);
      m.title = t('Зламай казарму зомбі: {hp}/2500 HP', { hp: m.hp });
    } else if (type === 'shiprescue') {
      this._makeTurkeyRescueShip(m);
    } else if (type === 'rebuild') {
      this._makeRebuildMission(m);
    } else if (type === 'stationrepair') {
      this._makeStationRepairMission(m);
    } else if (type === 'manor') {
      this._makeManorMission(m);
    }
    // 🎁 четвертий слот — додаткова місія: позначка і бонусна винагорода
    if (idx === 3 && !['barracks', 'shiprescue', 'rebuild', 'stationrepair', 'bases', 'manor'].includes(type)) {
      m.optional = true;
      m.reward = Math.round(m.reward * 1.5);
      m.horde = Math.round(m.horde * 0.5);
    }
    return m;
  }

  _makeCastleExplosive(m) {
    const level = this.level;
    const stash = level.country.map.sites?.warehouse || level.country.map.storySites?.railDepot;
    const x = stash ? stash.x + 8 : m.site.x + 70;
    const z = stash ? stash.z - 8 : m.site.z + 70;
    const y = level.world.groundH(x, z);
    const group = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.1), toonMat(0x8a5a32));
    crate.position.y = 0.48;
    crate.castShadow = true;
    group.add(crate);
    const red = toonMat(0xc92d2d, 0x7a1111, 0.25);
    for (let i = 0; i < 4; i++) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.82, 8), red);
      stick.rotation.z = Math.PI / 2;
      stick.position.set(-0.42 + i * 0.28, 0.96, 0);
      stick.castShadow = true;
      group.add(stick);
    }
    const icon = this._makeIconSprite('🧨', 1.7);
    icon.position.y = 2.15;
    group.add(icon);
    group.position.set(x, y, z);
    level.scene.add(group);
    return { x, z, y, mesh: group, icon, taken: false };
  }

  // ---------- 🔦/💧/🔥/🚚 двигун «активуй точки» ----------
  // спрайт-іконка з емодзі — видно здалеку, зрозуміло без слів
  _makeIconSprite(emoji, scale = 1.6) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 32, 36);
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    spr.scale.set(scale, scale, 1);
    return spr;
  }

  _spawnActPoints(m, cfg) {
    const level = this.level;
    const world = level.world;
    const rng = new RNG(level.country.seed + 333 + this.runIndex + m.slotIndex * 17 + (cfg.seedOffset || 0));
    const points = [];
    for (let i = 0; i < cfg.n; i++) {
      let x = m.site.x, z = m.site.z;
      const baseR = cfg.spread === 'village' ? 14 : 10;
      const stepR = cfg.spread === 'village' ? 8 : 14;
      for (let tries = 0; tries < 25; tries++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(baseR, baseR + stepR + i * 8);
        x = m.site.x + Math.cos(a) * r;
        z = m.site.z + Math.sin(a) * r;
        const solved = world.collide(x, z, 1.0);
        if (Math.hypot(solved.x - x, solved.z - z) < 0.2 && Math.hypot(x, z) < this.L.BOUND - 8) break;
      }
      const g = new THREE.Group();
      // тумба-пристрій: постамент + «лампа», що загориться кольором місії
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.9, 10), toonMat(0x77808c));
      base.position.y = 0.45;
      base.castShadow = true;
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x333a44 })
      );
      lamp.position.y = 1.05;
      const icon = this._makeIconSprite(cfg.emoji);
      icon.position.y = 2.0;
      g.add(base, lamp, icon);
      const y = world.groundH(x, z);
      g.position.set(x, y, z);
      level.scene.add(g);
      points.push({ x, z, y, mesh: g, lamp, icon, done: false, progress: 0, guardsSpawned: false });
    }
    return points;
  }

  // ---------- 🎈/🧿/⚱️ двигун «знайди та принеси» ----------
  _spawnFetchItems(m, cfg) {
    const level = this.level;
    const world = level.world;
    const rng = new RNG(level.country.seed + 444 + this.runIndex + m.slotIndex * 17 + (cfg.seedOffset || 0));
    const items = [];
    for (let i = 0; i < cfg.n; i++) {
      let x = m.site.x, z = m.site.z;
      for (let tries = 0; tries < 25; tries++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(8, 20 + i * 12);
        x = m.site.x + Math.cos(a) * r;
        z = m.site.z + Math.sin(a) * r;
        const solved = world.collide(x, z, 0.8);
        if (Math.hypot(solved.x - x, solved.z - z) < 0.2 && Math.hypot(x, z) < this.L.BOUND - 8) break;
      }
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), toonMat(cfg.color));
      box.position.y = 0.3;
      box.castShadow = true;
      const icon = this._makeIconSprite(cfg.emoji, 1.4);
      icon.position.y = 1.5;
      g.add(box, icon);
      const y = world.groundH(x, z);
      g.position.set(x, y, z);
      level.scene.add(g);
      items.push({ x, z, y, mesh: g, taken: false });
    }
    return items;
  }

  // точка здачі: кільце на землі біля ландмарки країни (або біля слота)
  _makeDeliverPoint(m, cfg) {
    const level = this.level;
    const world = level.world;
    const lp = (world.map.landmarkParams || {})[cfg.deliver];
    // центр ландмарки (від нього відсуваємось «назовні», по +z — як було раніше)
    const cx = lp ? lp.x : m.site.x;
    const cz = lp ? lp.z : m.site.z;
    // шукаємо першу прохідну точку, відсуваючи кандидат усе далі від центру.
    // collide() з радіусом гравця повертає точку, виштовхнуту з перешкод;
    // якщо вона майже не зсунулась — там можна стояти. Балон/базар лишаються
    // як були (їхній перший кандидат lp.z+6 уже вільний), а гробниця (всередині
    // суцільної піраміди) зсувається до прохідної землі.
    const PR = 0.45; // радіус гравця (як у player.js)
    let x = cx;
    let z = cz + 6;
    for (const off of [6, 10, 14, 18, 22, 26, 30]) {
      const candX = cx;
      const candZ = cz + off;
      const solved = world.collide(candX, candZ, PR);
      const disp = Math.hypot(solved.x - candX, solved.z - candZ);
      x = candX;
      z = candZ;
      if (disp < 0.2) break; // прохідно — беремо цю точку
    }
    // belt-and-suspenders: фінально розв'язуємо колізію, щоб центр кільця
    // ніколи не опинився всередині суцільної споруди (для вже-вільної точки — без змін)
    const solvedFinal = world.collide(x, z, PR);
    x = solvedFinal.x;
    z = solvedFinal.z;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.16, 8, 30),
      new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    const y = level.world.groundH(x, z);
    ring.position.set(x, y + 0.25, z);
    const icon = this._makeIconSprite(cfg.deliverEmoji, 2.2);
    icon.position.set(x, y + 3.2, z);
    level.scene.add(ring);
    level.scene.add(icon);
    return { x, z, y, r: 5, ring, icon };
  }

  _makeRebuildMission(m) {
    m.spanish = this.level.countryId === 'ESP'
      && this.level.operation?.missionPreset === 'spain-rebuild-center';
    m.phases = m.spanish
      ? ['musicians', 'tools', 'resources', 'build', 'done']
      : ['tools', 'resources', 'build', 'done'];
    m.required = m.spanish
      ? { iron: 50, stone: 100, wood: 55 }
      : { iron: 0, stone: 50, wood: 120 };
    m.buildSeconds = 30;
    m.attackSides = m.spanish ? [0, Math.PI / 2, Math.PI, Math.PI * 1.5] : [-1, 1];
    const axeCfg = { n: 1, color: 0xd28b3c, emoji: '🪓', seedOffset: 101 };
    const pickCfg = { n: 1, color: 0x8fa3b8, emoji: '⛏️', seedOffset: 202 };
    m.tools = [
      { ...this._spawnFetchItems(m, axeCfg)[0], kind: 'axe', cfg: axeCfg },
      { ...this._spawnFetchItems(m, pickCfg)[0], kind: 'pickaxe', cfg: pickCfg },
    ];
    for (const tool of m.tools) {
      this.level.scene.remove(tool.mesh);
      tool.mesh = makeGunMesh(tool.kind).group;
      tool.mesh.scale.setScalar(2.1);
      tool.mesh.rotation.set(-0.35, tool.kind === 'axe' ? 0.6 : -0.6, 0.15);
      tool.mesh.position.set(tool.x, tool.y + 0.7, tool.z);
      this.level.scene.add(tool.mesh);
    }
    m.iron = 0;
    m.wood = 0;
    m.stone = 0;
    m.buildProgress = 0;
    m.buildWaveT = 0;
    m.buildWaves = 0;
    m.phase = m.spanish ? 'musicians' : 'tools';
    m.title = m.spanish ? t('Врятуй музикантів') : t('Знайди сокиру й кірку');
    m.musiciansOpened = false;
    m.musiciansT = 0;
    const resourceNodes = (kind, n, amount, emoji, color, seedOffset) => this._spawnActPoints(
      m, { n, emoji, color, spread: 'map', seedOffset },
    ).map((p) => ({ ...p, kind, amount, hp: 4 }));
    m.woodNodes = resourceNodes('wood', m.spanish ? 5 : 3, m.spanish ? 11 : 40, '🌲', 0x4f9a4b, 303);
    m.stoneNodes = resourceNodes('stone', m.spanish ? 4 : 2, 25, '🪨', 0x9299a3, 404);
    m.ironNodes = m.spanish ? resourceNodes('iron', 2, 25, '⛓️', 0x687887, 505) : [];
    m.points = [...m.woodNodes, ...m.stoneNodes, ...m.ironNodes];
    for (const p of m.points) {
      this.level.scene.remove(p.mesh);
      p.mesh = this._makeResourceMesh(p.kind);
      p.mesh.position.set(p.x, p.y, p.z);
      this.level.scene.add(p.mesh);
    }
    m.dest = this._makeDeliverPoint(m, {
      color: 0xffc857,
      deliver: m.spanish ? 'musicCenter' : 'cityCenter',
      deliverEmoji: m.spanish ? '🎵' : '🏗️',
    });
    m.buildingAt = { x: m.site.x, z: m.site.z, y: this.level.world.groundH(m.site.x, m.site.z) };
    m.dest.x = m.site.x;
    m.dest.z = m.site.z + 13;
    m.dest.y = this.level.world.groundH(m.dest.x, m.dest.z);
    m.dest.ring.position.set(m.dest.x, m.dest.y + 0.25, m.dest.z);
    m.dest.icon.position.set(m.dest.x, m.dest.y + 3.2, m.dest.z);
    m.dest.ring.visible = false;
    m.dest.icon.visible = false;
  }

  _spawnVillageClearZombies(m) {
    if (this.mirror) return [];
    const targets = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const radius = 12 + (i % 3) * 5;
      const zombie = this.level.zombies.spawn(
        i % 4 === 0 ? 'runner' : 'walker',
        m.site.x + Math.cos(angle) * radius,
        m.site.z + Math.sin(angle) * radius,
        { horde: false, guard: true, anchor: { x: m.site.x, z: m.site.z, r: m.site.r } },
      );
      zombie.villageClear = true;
      targets.push(zombie);
    }
    return targets;
  }

  _makeStationRepairMission(m) {
    const level = this.level;
    const metal = toonMat(0xaeb9c7, 0x6fc8ff, 0.25);
    m.fragments = level.country.map.storySites.stationFragments.map((point, i) => {
      const mesh = new THREE.Group();
      const core = new THREE.Mesh(i % 2
        ? new THREE.CylinderGeometry(0.35, 0.55, 1.5, 8)
        : new THREE.BoxGeometry(1.3, 0.35, 0.9), metal);
      core.rotation.set(i * 0.3, i * 0.7, i * 0.2);
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 12), toonMat(0x56d7ff, 0x1b8eb8, 0.65));
      wire.rotation.x = Math.PI / 2;
      mesh.add(core, wire);
      const y = level.world.groundH(point.x, point.z);
      mesh.position.set(point.x, y + 0.8, point.z);
      level.scene.add(mesh);
      return { ...point, y, mesh, taken: false };
    });
    m.found = 0;
    m.phase = 'fragments';
    m.repairProgress = 0;
    m.waveT = 0;
    m.waves = 0;
    m.title = t('Знайди уламки станції: 0/5');
  }

  _makeResourceMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'wood') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 4.2, 10), toonMat(0x76502c));
      trunk.position.y = 2.1;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.5, 9), toonMat(0x3f8a42));
      crown.position.y = 5.4;
      trunk.castShadow = crown.castShadow = true;
      g.add(trunk, crown);
    } else {
      const rockM = toonMat(kind === 'iron' ? 0x566675 : 0x7e8791);
      for (const [x, y, z, s] of [[0, 0.75, 0, 1.25], [0.8, 0.48, 0.35, 0.75], [-0.7, 0.4, 0.4, 0.65]]) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockM);
        rock.position.set(x, y, z);
        rock.rotation.set(x + 0.2, z + 0.3, y);
        rock.castShadow = true;
        g.add(rock);
      }
    }
    return g;
  }

  _makeCityCenter(m) {
    const level = this.level;
    const g = new THREE.Group();
    const tier = Math.max(1, Math.min(3, level.game.save.settlement?.level | 0));
    g.userData.settlementTier = tier;
    const wallM = toonMat(0xe4d4b7);
    const roofM = toonMat(0x376fa8);
    const stoneM = toonMat(0xaeb6bf);
    const windowM = new THREE.MeshBasicMaterial({ color: 0xffd77a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 9), wallM);
    body.position.y = 3.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(8.7, 3.6, 4), roofM);
    roof.position.y = 8.8;
    roof.rotation.y = Math.PI / 4;
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(5.5, 6, 2.2), stoneM);
    entrance.position.set(0, 3, 5);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.2), toonMat(0x654126));
    door.position.set(0, 1.6, 6.15);
    g.add(body, roof, entrance, door);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 8), wallM);
      wing.position.set(side * 9.5, 2.5, 0.4);
      const wingRoof = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2.5, 4), roofM);
      wingRoof.position.set(side * 9.5, 6.2, 0.4);
      wingRoof.rotation.y = Math.PI / 4;
      g.add(wing, wingRoof);
      for (const x of [side * 7.8, side * 10.8]) {
        for (const y of [2.1, 4.1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.35, 0.15), windowM);
          win.position.set(x, y, 4.48);
          g.add(win);
        }
      }
    }
    for (const x of [-5.4, -2.8, 2.8, 5.4]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.5, 0.15), windowM);
      win.position.set(x, 4.1, 4.58);
      g.add(win);
    }
    for (const x of [-1.9, 1.9]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 5, 10), stoneM);
      column.position.set(x, 2.5, 6.1);
      g.add(column);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8), toonMat(0x808890));
    pole.position.set(0, 12.4, 0);
    const flag = new THREE.Group();
    const blue = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 0.06), new THREE.MeshBasicMaterial({ color: 0x2072c9 }));
    const yellow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 0.06), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    blue.position.set(1.15, 13.8, 0); yellow.position.set(1.15, 13.25, 0);
    flag.add(blue, yellow);
    g.add(pole, flag);
    if (m.spanish) {
      const music = this._makeIconSprite('🎵', 3.2);
      music.position.set(0, 15.5, 0);
      g.add(music);
      g.userData.kind = 'music-center';
    }
    if (tier >= 2) {
      for (const side of [-1, 1]) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 7.5, 10), stoneM);
        tower.position.set(side * 13, 3.75, -2.5);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0x62e59a }));
        beacon.position.set(side * 13, 7.8, -2.5);
        g.add(tower, beacon);
      }
    }
    if (tier >= 3) {
      for (const [x, z, sx, sz] of [[0, -7, 28, 0.6], [-14, 0, 0.6, 14], [14, 0, 0.6, 14]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), stoneM);
        wall.position.set(x, 1.4, z);
        g.add(wall);
      }
    }
    g.position.set(m.buildingAt.x, m.buildingAt.y, m.buildingAt.z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    level.scene.add(g);
    level.world.colliders.push({ x: m.buildingAt.x, z: m.buildingAt.z, r: 9, top: m.buildingAt.y + 14 });
    level.world._buildGrid();
    return g;
  }

  // ---------- допоміжні споруди місій ----------
  // 🧺 ящики припасів: навколо слота і трохи по карті
  _spawnSupplyCrates(m) {
    const level = this.level;
    const world = level.world;
    const rng = new RNG(level.country.seed + 555 + this.runIndex);
    const crates = [];
    const woodM = toonMat(0xb08a5a);
    const bandM = toonMat(0x4cff7a, 0x2a8a3a, 0.3);
    for (let i = 0; i < 4; i++) {
      let x = m.site.x, z = m.site.z;
      for (let tries = 0; tries < 25; tries++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(6, 16 + i * 9); // перший — поруч, далі все далі
        x = m.site.x + Math.cos(a) * r;
        z = m.site.z + Math.sin(a) * r;
        const solved = world.collide(x, z, 0.8);
        if (Math.hypot(solved.x - x, solved.z - z) < 0.2 && Math.hypot(x, z) < this.L.BOUND - 8) break;
      }
      const g = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), woodM);
      crate.position.y = 0.36;
      crate.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 0.86), bandM);
      band.position.y = 0.36;
      g.add(crate, band);
      const y = world.groundH(x, z);
      g.position.set(x, y, z);
      level.scene.add(g);
      crates.push({ x, z, y, mesh: g, taken: false });
    }
    return crates;
  }

  // 🛡️ зона оборони: кільце на землі
  _makeDefenseZone(m) {
    const level = this.level;
    const zr = Math.min(m.site.r, 20); // слот D — село з великим r, кільце не роздуваємо
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(zr * 0.7, 0.18, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    const y = level.world.groundH(m.site.x, m.site.z);
    ring.position.set(m.site.x, y + 0.25, m.site.z);
    level.scene.add(ring);
    return { ring, r: zr * 0.7, x: m.site.x, z: m.site.z };
  }

  // 👹 елітні зомбі: більші, з золотою короною-обідком, розкидані по карті
  _spawnElites(m) {
    if (this.mirror) return [];
    const level = this.level;
    const rng = new RNG(level.country.seed + 999 + this.runIndex);
    const elites = [];
    const spots = [
      m.site,
      { x: -m.site.x * 0.7 + 20, z: -m.site.z * 0.7 - 15 },
      { x: m.site.z * 0.6 - 10, z: m.site.x * 0.6 + 18 },
    ];
    const types = ['runner', 'tank', 'walker'];
    spots.forEach((sp, i) => {
      let x = sp.x + rng.range(-6, 6), z = sp.z + rng.range(-6, 6);
      if (Math.hypot(x, z) > this.L.BOUND - 10) { x *= 0.7; z *= 0.7; }
      const z_ = level.zombies.spawn(types[i % 3], x, z, { elite: true });
      z_.hp = z_.maxHp = Math.round(z_.maxHp * 2.2);
      z_.anchor = { x, z, r: 12 };
      elites.push(z_);
    });
    return elites;
  }

  // 🟣 гнізда: фіолетові кокони з охороною, тримай E щоб знешкодити
  _spawnNests(m) {
    const level = this.level;
    const rng = new RNG(level.country.seed + 777 + this.runIndex);
    const nests = [];
    for (let i = 0; i < 3; i++) {
      let x = m.site.x, z = m.site.z;
      for (let tries = 0; tries < 25; tries++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(5, 12 + i * 10);
        x = m.site.x + Math.cos(a) * r;
        z = m.site.z + Math.sin(a) * r;
        const solved = level.world.collide(x, z, 1.2);
        if (Math.hypot(solved.x - x, solved.z - z) < 0.2 && Math.hypot(x, z) < this.L.BOUND - 8) break;
      }
      const g = new THREE.Group();
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), toonMat(0x8d3bbd, 0x5a1a8a, 0.35));
      pod.scale.set(1, 1.25, 1);
      pod.position.y = 0.8;
      pod.castShadow = true;
      const goo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8), toonMat(0x6a2a9a));
      goo.scale.set(1, 0.22, 1);
      goo.position.y = 0.08;
      g.add(pod, goo);
      const y = level.world.groundH(x, z);
      g.position.set(x, y, z);
      level.scene.add(g);
      // охоронець гнізда (на гості приїде подією від хоста)
      if (!this.mirror) {
        level.zombies.spawn(rng.chance(0.5) ? 'walker' : 'runner', x + 2, z + 1, {
          anchor: { x, z, r: 6 }, guard: true,
        });
      }
      nests.push({ x, z, y, mesh: g, pod, progress: 0, cleared: false });
    }
    return nests;
  }

  // 🧳 мандрівник для ескорту
  _spawnTraveler(m) {
    const level = this.level;
    const rig = makeCivilian('granny', level.rng);
    const x = m.site.x, z = m.site.z + 2;
    rig.group.position.set(x, level.world.groundH(x, z), z);
    level.scene.add(rig.group);
    m.traveler = { rig, x, z, hp: 60, maxHp: 60, hurtCd: 0 };
    level.bus.emit('toast', t('🧳 Мандрівник іде за тобою! Доведи його цілим до вежі 📡'));
  }

  // ---------- Missions API ----------
  get(id) {
    let m = this.missions.find((x) => x.id === id);
    if (!m && id in SLOT_ALIASES) m = this.missions[SLOT_ALIASES[id]];
    return m || null;
  }

  getHudList() {
    const out = [];
    for (const m of this.missions) {
      let extra = '';
      if (m.state === 'active') {
        if (m.type === 'repair' && m.progress > 0) extra = ` (${Math.round(m.progress * 100)}%)`;
        if (m.type === 'clear') {
          const n = this.level.zombies.countAliveInZone('warehouse');
          extra = this.crateReady ? t(' — відкрий ящик!') : t(' (зомбі: {n})', { n });
        }
        if (m.type === 'collect') extra = ` (${m.found}/4)`;
        if (m.type === 'hunt') extra = ` (${m.killed}/3)`;
        if (m.type === 'nests' || m.type === 'bases') extra = ` (${m.cleared}/3)`;
        if (m.type === 'manor') extra = m.phase === 'clear' ? ` (${m.killed}/120)` : t(' — люди на 2 поверсі!');
        if ((m.type === 'defense' || m.type === 'fireworks') && m.started) extra = ` (${Math.ceil(m.timer)}${t('с')})`;
        if (m.type === 'villageclear') extra = ` (${m.targets.filter((zombie) => zombie.state !== 'dead' && !zombie.gone).length})`;
        if (m.type === 'escort' && m.started) extra = t(' — веди до вежі!');
        if (m.type === 'stationrepair' && m.phase === 'fragments') extra = ` (${m.found}/5)`;
        if (m.points && m.type !== 'rebuild') extra = ` (${m.activated}/${m.points.length})`;
        if (m.items) {
          extra = m.found < m.items.length ? ` (${m.found}/${m.items.length})` : t(' — неси до цілі!');
        }
      }
      const prefix = m.optional ? '⭐ ' : '';
      out.push({ icon: m.icon, title: prefix + m.title + extra, done: m.state === 'done', primary: m.state === 'active' && !m.optional, optional: m.optional });
    }
    const spainStage = {
      'spain-rebuild-center': 0,
      'spain-clear-village': 4,
      'spain-defend-fireworks': 5,
    }[this.level.operation?.missionPreset];
    if (this.level.countryId === 'ESP' && spainStage !== undefined && out.length === 1) {
      const m = this.missions[0];
      const activeIndex = spainStage === 0
        ? ({ musicians: 0, tools: 1, resources: 2, build: 3, done: 3 }[m.phase] ?? 0)
        : spainStage;
      const titles = [
        t('Врятуй музикантів'),
        t('Знайди сокиру й кірку'),
        t('Добудь 50 заліза, 100 каменю і 55 дерева'),
        t('Віднови музичний центр 30 секунд'),
        t('Зачисти село від зомбі'),
        t('Оборони феєрверки'),
      ];
      titles[activeIndex] = out[0].title;
      return titles.map((title, index) => ({
        icon: ['🎺', '🪓', '⛏️', '🎵', '🏘️', '🎆'][index],
        title,
        done: index < activeIndex,
        primary: index === activeIndex,
        visible: true,
      }));
    }
    if (!this.objectiveOnly && this.allDone && !this.bossStarted) {
      out.push({ icon: '👑', title: t('Перемоги БОСА на арені!'), done: false });
    } else if (this.bossStarted) {
      out.push({ icon: '👑', title: t('Бій з босом!'), done: false });
    }
    return out;
  }

  getMarkers(missions = this.missions) {
    const mk = [];
    for (const m of missions) {
      if (m.state !== 'active') continue;
      if (m.type === 'hunt') {
        // маркер — найближчий живий еліт
        const pool = this.mirror ? this.level.zombies.list.filter((e) => e.elite) : m.elites;
        const alive = pool.find((e) => e.state !== 'dead' && !e.gone);
        if (alive) mk.push({ x: alive.x, z: alive.z, color: '#ffd23f', icon: '👹' });
        continue;
      }
      if (m.type === 'collect') {
        const next = m.crates.find((c) => !c.taken);
        if (next) mk.push({ x: next.x, z: next.z, color: '#4cff7a', icon: '🧺' });
        continue;
      }
      if (m.type === 'nests') {
        const next = m.nestList.find((n) => !n.cleared);
        if (next) mk.push({ x: next.x, z: next.z, color: '#b06ee8', icon: '🟣' });
        continue;
      }
      if (m.type === 'escort' && m.started) {
        mk.push({ x: m.dest.x, z: m.dest.z, color: '#44ccff', icon: '📡' });
        continue;
      }
      if (m.type === 'castle') {
        const target = this._castleTarget(m);
        if (target) mk.push({
          x: target.x, z: target.z, color: '#ff9e63',
          icon: m.phase === 'rescue' ? '🆘' : m.phase === 'dungeon' ? '🧙' : '🏰',
        });
        continue;
      }
      if (m.type === 'shiprescue') {
        const target = this._shipTarget(m);
        mk.push({ x: target.x, z: target.z, color: '#3fc8d8', icon: '🚢' });
        continue;
      }
      if (m.points) {
        const next = m.points.find((p) => !p.done);
        if (next) mk.push({ x: next.x, z: next.z, color: '#ffd23f', icon: m.icon });
        continue;
      }
      if (m.items) {
        const next = m.found < m.items.length ? m.items.find((it) => !it.taken) : m.dest;
        if (next) mk.push({ x: next.x, z: next.z, color: '#ff9e63', icon: m.icon });
        continue;
      }
      mk.push({ x: m.site.x, z: m.site.z, color: '#4cff7a', icon: m.icon });
    }
    if (this.bossUnlocked && !this.bossStarted) mk.push({ x: this.L.arena.x, z: this.L.arena.z, color: '#ff44aa', icon: '👑' });
    if (this.livingWorld) mk.push({ x: this.livingWorld.x, z: this.livingWorld.z, color: '#ffd84d', icon: '🌍' });
    return mk;
  }

  _complete(id) {
    const m = this.get(id);
    if (!m || m.state === 'done') return;
    m.state = 'done';
    if (m.beam) { m.beam.remove(); m.beam = null; }
    if (m.zone) { this.level.scene.remove(m.zone.ring); m.zone = null; }
    if (m.dest && m.dest.ring) {
      this.level.scene.remove(m.dest.ring);
      this.level.scene.remove(m.dest.icon);
      m.dest.ring = null;
    }
    const level = this.level;
    level.addCoins(m.reward);
    level.audio.mission();
    level.bus.emit('missionDone', m);
    level.netEv('md', m.slotIndex, m.reward, m.type);
    if (this.objectiveOnly) {
      this.allDone = true;
      level.game._onFrontObjectiveComplete(level);
      return;
    }
    const count = Math.round(m.horde * ((level.country && level.country.difficulty.counts) || 1));
    if (count <= 0) {
      this._maybeStartLivingWorld(m);
      return;
    }
    const fresh = !this.pendingHorde;
    if (this.pendingHorde) this.pendingHorde.count += count;
    else this.pendingHorde = { t: 5, count };
    // 👹 елітна хвиля (v287): кожна ~3-тя орда стає елітною — анонс за 3с
    // (правило Brotato) + стінгер; 2–4 еліти доспавнюються при старті орди.
    // v296 «Еліти разом»: рішення приймає ХОСТ (authority) — у гостя-дзеркалі
    // _complete і так не бігає, але гард робимо явним, щоб гість не позначив свою хвилю.
    let eliteWave = false;
    if (fresh && (!level.net || level.net.authority)) {
      this._soloHordeNum = (this._soloHordeNum || 0) + 1;
      if (this._soloHordeNum % 3 === 0) eliteWave = true;
    }
    if (eliteWave) {
      this.pendingHorde.elite = true;
      this.pendingHorde.t = 3;
      // кооп: телеграф-банер + стінгер гостям (хост зіграв локально через bus вище)
      this.telegraphEliteWave();
    } else {
      level.bus.emit('hordeWarning', 5);
      level.netEv('hw'); // кооп: попередження про орду і гостю
    }
    this._maybeStartLivingWorld(m);
  }

  // 👹 v302: телеграф елітної хвилі — стінгер + банер-попередження (bus) + ev гостям.
  // Спільне для реального шляху (_complete) і тест-хука forceEliteWave (main.js).
  telegraphEliteWave() {
    const level = this.level;
    level.audio.eliteWave();
    level.bus.emit('eliteWaveWarning');
    if (level.net) level.netEv('ew'); // телеграф гостям
  }

  _maybeStartLivingWorld(m) {
    const level = this.level;
    if (this.livingWorld || this.livingWorldOffered || level.mirror || level.storm || level.bossRush || level.infected) return;
    const needsRescue = !level.operation && level.frontCountryState && level.frontCountryState.damage > 0;
    if (!needsRescue && !shouldOfferLivingWorld({
      countryId: level.countryId,
      runIndex: this.runIndex,
      missionIndex: m.slotIndex,
      modeId: level.modeId,
    })) return;
    const ev = needsRescue ? { id: 'survivor' } : pickLivingWorldEvent({
      countryId: level.countryId,
      seed: level.country.seed,
      runIndex: this.runIndex,
      missionIndex: m.slotIndex,
    });
    this.livingWorldOffered = true;
    const base = this.L.village || m.site || this.L.tower;
    const x = base.x + 10, z = base.z - 10;
    const y = level.world.groundH(x, z);
    const live = {
      id: ev.id, x, z, y, state: 'active', spawned: [],
      beam: level.effects.makeBeam(x, z, 0xffd84d, ev.id === 'survivor' ? '🆘' : ev.id === 'crate' ? '🎁' : '🏆'),
    };
    if (ev.id === 'survivor') {
      const rig = makeCivilian('kid', level.rng);
      rig.group.position.set(x, y, z);
      level.scene.add(rig.group);
      live.rig = rig;
      live.title = t('🆘 SOS! Знайди загубленого малого рятівника');
      live.prompt = t('Натисни {k} — врятуй малого рятівника', { k: interactKey() });
    } else if (ev.id === 'crate') {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5), toonMat(0x8d5cff));
      mesh.position.set(x, y + 0.55, z);
      mesh.castShadow = true;
      level.scene.add(mesh);
      live.mesh = mesh;
      live.title = t('🎁 Заражений ящик! Відкрий і відбий охорону');
      live.prompt = t('Натисни {k} — відкрити заражений ящик', { k: interactKey() });
    } else {
      live.title = t('🏆 Золота орда! Перемож хвилю за бонус');
      this._spawnLivingWorldWave(live, 7, true);
      live.state = 'fight';
    }
    this.livingWorld = live;
    level.bus.emit('toast', live.title);
    level.audio.mission();
  }

  _spawnLivingWorldWave(live, n, golden = false) {
    const level = this.level;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const type = i % 4 === 0 ? 'runner' : 'walker';
      const z = level.zombies.spawn(type, live.x + Math.cos(a) * 12, live.z + Math.sin(a) * 12, { horde: false, golden: golden && i === 0 });
      z.aggroed = true;
      z.state = 'chase';
      live.spawned.push(z);
    }
    level.audio.horde();
  }

  _completeLivingWorld() {
    const live = this.livingWorld;
    if (!live || live.state === 'done') return;
    live.state = 'done';
    if (live.beam) live.beam.remove();
    if (live.mesh) this.level.scene.remove(live.mesh);
    if (live.rig) this.level.scene.remove(live.rig.group);
    const reward = livingWorldReward(live.id, this.level.diffStar || 1);
    this.level.addCoins(reward.coins);
    this.level.game.progress.addXp(reward.xp);
    this.level.bus.emit('toast', t('🌍 Живий світ: +{c} монет, +{xp} XP', { c: reward.coins, xp: reward.xp }));
    this.level.audio.levelUp();
    this.livingWorld = null;
  }

  _updateLivingWorld(dt, input, allowControl) {
    const live = this.livingWorld;
    if (!live) return;
    const level = this.level;
    const player = level.player;
    if (live.beam) live.beam.update(dt);
    if (live.mesh) live.mesh.rotation.y += dt * 1.2;
    if (live.rig) {
      setAnim(live.rig, 'cheer');
      updateRig(live.rig, dt);
    }
    if (live.state === 'fight') {
      if (live.spawned.every((z) => z.state === 'dead' || z.gone)) this._completeLivingWorld();
      return;
    }
    const near = Math.hypot(player.pos.x - live.x, player.pos.z - live.z) < 4;
    if (!near) return;
    this.prompt = { text: live.prompt || t('Натисни {k} — допомогти', { k: interactKey() }), hold: false };
    if (!allowControl || !input.pressed('KeyE')) return;
    input.justPressed.delete('KeyE');
    if (live.id === 'survivor') {
      this._spawnLivingWorldWave(live, 4);
      if (level.game && typeof level.game._applyFrontTransition === 'function') {
        level.game._applyFrontTransition({ type: 'RESCUE_CIVILIAN', countryId: level.countryId });
        level.frontCountryState.population = Math.min(100, level.frontCountryState.population + 5);
      }
      this._completeLivingWorld();
    } else {
      if (live.mesh) { level.scene.remove(live.mesh); live.mesh = null; }
      this._spawnLivingWorldWave(live, 6);
      live.state = 'fight';
      level.bus.emit('toast', t('🎁 Охорона ящика прокинулась — зачисти її!'));
    }
  }

  // цивільні з хліва (порятунок) — як і раніше
  spawnCivilians() {
    const { x, z } = this.L.rescue;
    const kinds = this.level.countryId === 'MOON'
      ? ['astronaut-commander', 'astronaut-engineer', 'astronaut-medic']
      : (this.level.countryId === 'ESP'
        ? ['musician-trumpet', 'musician-guitar', 'musician-drum']
        : ['medic', 'granny', 'kid']);
    kinds.forEach((kind, i) => {
      const rig = makeCivilian(kind, this.level.rng);
      const cx = x - 1.5 + i * 1.5, cz = z + 0.5;
      rig.group.position.set(cx, this.level.world.groundH(cx, cz), cz);
      this.level.scene.add(rig.group);
      this.civilians.push({
        rig, kind, x: cx, z: cz,
        state: 'exit', exitT: 0,
        angle: (i / 3) * Math.PI * 2,
        cheerT: 2.5,
      });
      if (kind === 'medic') this.medicAlive = true;
    });
  }

  _updateCivilians(dt) {
    const level = this.level;
    const player = level.player;
    for (const c of this.civilians) {
      const rig = c.rig;
      let spd = 0, tx = null, tz = null;
      if (c.state === 'exit') {
        c.exitT += dt;
        tx = this.L.rescue.x + (c.angle - 3) * 1.2;
        tz = this.L.rescue.z - 8;
        spd = 3;
        if (c.exitT > 2.2) c.state = 'follow';
      } else {
        const ox = Math.cos(c.angle) * 2.6;
        const oz = Math.sin(c.angle) * 2.6;
        let fp = player.pos;
        if (level.players) {
          let bd = Infinity;
          for (const pl of level.players) {
            if (pl.health <= 0) continue;
            const dd = Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z);
            if (dd < bd) { bd = dd; fp = pl.pos; }
          }
        }
        tx = fp.x + ox;
        tz = fp.z + oz;
        const d = Math.hypot(tx - c.x, tz - c.z);
        if (d > 30) {
          c.x = player.pos.x + ox;
          c.z = player.pos.z + oz;
        }
        spd = d > 12 ? 5.2 : d > 2 ? 3.4 : 0;
      }
      if (spd > 0 && tx !== null) {
        const dx = tx - c.x, dz = tz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) {
          c.x += (dx / d) * spd * dt;
          c.z += (dz / d) * spd * dt;
          const yawT = Math.atan2(-dx, -dz);
          rig.group.rotation.y = dampAngle(rig.group.rotation.y, yawT, 8, dt);
          setAnim(rig, spd > 4 ? 'run' : 'walk');
          rig.anim.speed = spd;
        } else {
          setAnim(rig, c.cheerT > 0 ? 'cheer' : 'idle');
        }
      } else {
        setAnim(rig, c.cheerT > 0 ? 'cheer' : 'idle');
      }
      if (c.cheerT > 0) c.cheerT -= dt;
      const solved = level.world.collide(c.x, c.z, 0.4);
      c.x = solved.x; c.z = solved.z;
      rig.group.position.set(c.x, level.world.groundH(c.x, c.z), c.z);
      updateRig(rig, dt);
    }
    const medic = this.civilians.find((c) => c.kind === 'medic');
    if (medic) {
      const patients = level.players || [{ pid: 1, pos: player.pos, health: player.health }];
      for (const pl of patients) {
        if (pl.health <= 0) continue;
        const d = Math.hypot(medic.x - pl.pos.x, medic.z - pl.pos.z);
        if (d >= 9) continue;
        if (pl.pid === 1) {
          if (player.health < player.maxHealth) {
            player.heal(3.2 * dt);
            this.healPulseT -= dt;
            if (this.healPulseT <= 0) {
              this.healPulseT = 1.1;
              const pp = player.pos;
              level.effects.burst(new THREE.Vector3(pp.x, pp.y + 1.6, pp.z), 0x6dff9c, 4, { speed: 0.8, up: 1.6, life: 0.7, size: 0.7 });
            }
          }
        } else if (level.net && level.net.authority) {
          // гостям шлемо лікування пачками раз на секунду
          pl._healAcc = (pl._healAcc || 0) + 3.2 * dt;
          if (pl._healAcc >= 3) {
            level.net.healPlayer(pl, Math.round(pl._healAcc * 10) / 10);
            pl._healAcc = 0;
          }
        }
      }
    }
  }

  _towerWave(n, onlyWalkers, site) {
    const level = this.level;
    const { x, z } = site || this.L.tower;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const type = onlyWalkers ? 'walker' : (i % 3 === 0 ? 'runner' : 'walker');
      const zb = level.zombies.spawn(type, x + Math.cos(a) * 22, z + Math.sin(a) * 22, { horde: false });
      zb.aggroed = true;
      zb.state = 'chase';
    }
    level.bus.emit('toast', t('🧟 Зомбі почули шум — захищайся!'));
  }

  // ---------- головний цикл ----------
  update(dt, input, allowControl) {
    if (this.mirror) { this._updateMirror(dt, input, allowControl); return; }
    const level = this.level;
    const player = level.player;
    const px = player.pos.x, pz = player.pos.z;
    this.prompt = null;

    this._updateBeams(dt);

    // відкладена орда
    if (this.pendingHorde) {
      this.pendingHorde.t -= dt;
      if (this.pendingHorde.t <= 0) {
        level.zombies.startHorde(this.pendingHorde.count);
        level.audio.horde();
        level.bus.emit('hordeStart', this.pendingHorde.count);
        level.netEv('hs', this.pendingHorde.count); // кооп: рев і банер старту орди гостю
        if (this.pendingHorde.elite) level.zombies.spawnEliteWave(); // 👹 доспавн еліт-хвилі
        this.pendingHorde = null;
      }
    }
    // відкладені хвилі (ремонт/оборона) — черга, щоб друга не затирала першу
    for (const pw of this.pendingWaves) pw.t -= dt;
    const fired = this.pendingWaves.filter((pw) => pw.t <= 0);
    this.pendingWaves = this.pendingWaves.filter((pw) => pw.t > 0);
    for (const pw of fired) this._towerWave(pw.n, pw.onlyWalkers, pw.site);

    this._updateLivingWorld(dt, input, allowControl);

    for (const m of this.missions) {
      if (m.type === 'manor' && m.state === 'done' && m.started) this._updateManorChests(m, input, allowControl);
      if (m.state !== 'active') continue;
      this['_up_' + m.type](m, dt, input, allowControl);
    }

    // усі ОСНОВНІ місії виконані → Front переходить до кульмінації,
    // звичайна кампанія відкриває арену боса.
    if (!this.allDone && this.missions.filter((m) => !m.optional).every((m) => m.state === 'done')
      && !level.zombies.hordeActive && !this.pendingHorde) {
      this.allDone = true;
      if (level.operation) {
        level.game._onFrontObjectiveComplete(level);
      } else {
        this.bossUnlocked = true;
        this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
        level.audio.bossRoar();
        level.bus.emit('bossUnlocked');
      }
    }
    if (this.bossUnlocked && !this.bossStarted) {
      const challengers = level.players || [{ pos: player.pos, health: player.health }];
      const inArena = challengers.some((p) => p.health > 0
        && Math.hypot(p.pos.x - this.L.arena.x, p.pos.z - this.L.arena.z) < this.L.arena.r - 4);
      if (inArena) {
        this.bossStarted = true;
        if (this.bossBeam) { this.bossBeam.remove(); this.bossBeam = null; }
        level.zombies.spawnBoss(this.bossHpLeft);
        level.audio.bossRoar(level.country && level.country.id); // сценка «Леся + бос» цієї країни
        level.bus.emit('bossStart');
        level.netEv('bstart');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.5;
          const sx = this.L.arena.x + Math.cos(a) * (this.L.arena.r - 7);
          const sz = this.L.arena.z + Math.sin(a) * (this.L.arena.r - 7);
          level.effects.spawnPickup(sx, sz, i % 3 === 0 ? 'medkit' : 'ammo');
        }
      }
    }

    this._updateCivilians(dt);
  }

  _updateBeams(dt) {
    for (const m of this.missions) {
      if (!m.beam) continue;
      m.beam.update(dt);
      // 🧭 маяк веде до НАСТУПНОЇ цілі місії, а не стоїть на місці
      const target = this._beamTarget(m);
      if (!target) continue;
      const g = m.beam.group;
      const ty = this.level.world.groundH(target.x, target.z);
      g.position.x += (target.x - g.position.x) * Math.min(1, dt * 6);
      g.position.z += (target.z - g.position.z) * Math.min(1, dt * 6);
      g.position.y = ty;
    }
    if (this.bossBeam) this.bossBeam.update(dt);
  }

  // куди має стояти маяк місії просто зараз
  _beamTarget(m) {
    if (m.state !== 'active') return null;
    if (m.type === 'rebuild') {
      if (m.phase === 'musicians') return this.level.country.map.storySites.musicians;
      if (m.phase === 'tools') return m.tools.find((it) => !it.taken) || null;
      if (m.phase === 'resources') return m.points.find((p) => !p.done) || null;
      return m.dest;
    }
    if (m.type === 'stationrepair') {
      return m.phase === 'fragments' ? m.fragments.find((fragment) => !fragment.taken) : m.site;
    }
    if (m.type === 'manor') {
      const manor = this.level.world.zombieManor;
      return m.phase === 'rescue' ? manor.hostage : { x: manor.x - manor.w / 2, z: manor.z };
    }
    if (m.type === 'collect') {
      const next = m.crates.find((c) => !c.taken);
      return next ? { x: next.x, z: next.z } : null;
    }
    if (m.type === 'nests' || m.type === 'bases') {
      const next = m.nestList.find((n) => !n.cleared);
      return next ? { x: next.x, z: next.z } : null;
    }
    if (m.type === 'hunt') {
      const pool = this.mirror ? this.level.zombies.list.filter((e) => e.elite) : m.elites;
      const alive = pool.find((e) => e.state !== 'dead' && !e.gone);
      return alive ? { x: alive.x, z: alive.z } : null;
    }
    if (m.type === 'escort') {
      // до старту — на точці зустрічі; після — веде до вежі
      return m.started ? { x: m.dest.x, z: m.dest.z } : { x: m.site.x, z: m.site.z + 2 };
    }
    if (m.type === 'castle') return this._castleTarget(m);
    if (m.type === 'shiprescue') return this._shipTarget(m);
    if (m.points) {
      const next = m.points.find((p) => !p.done);
      return next ? { x: next.x, z: next.z } : null;
    }
    if (m.items) {
      if (m.found < m.items.length) {
        const next = m.items.find((it) => !it.taken);
        return next ? { x: next.x, z: next.z } : null;
      }
      return { x: m.dest.x, z: m.dest.z };
    }
    return null; // rescue/repair/clear/defense — маяк на місці
  }

  // ---------- апдейтери типів ----------
  _up_rescue(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (!m.opened) {
      const door = level.world.barnDoorCollider;
      const d = Math.hypot(player.pos.x - door.x, player.pos.z - (door.z - 1));
      if (d < 3.2) {
        this.prompt = { text: level.countryId === 'MOON'
          ? t('Натисни {k} — відкрий аварійний модуль', { k: interactKey() })
          : t('Натисни {k} — відчини хлів', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          m.opened = true;
          m.openedT = 0;
          level.world.openBarn();
          level.audio.door();
          this.spawnCivilians();
          level.netEv('barn');
          input.justPressed.delete('KeyE');
        }
      }
    } else {
      m.openedT += dt;
      if (m.openedT > 2.0) {
        this._complete(m.id);
        level.bus.emit('toast', level.countryId === 'MOON'
          ? t('Космонавтів врятовано! Екіпаж слідуватиме за тобою. 🚀')
          : (level.countryId === 'ESP'
            ? t('Музиканти врятовані! Тепер удар у святковий дзвін.')
            : t('Людей врятовано! Медик лікуватиме тебе поблизу 💚')));
      }
    }
  }

  _up_repair(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const rp = m.repairPoint || level.world.repairPoint;
    const d = Math.hypot(player.pos.x - rp.x, player.pos.z - rp.z);
    // кооп: рахуємо всіх, хто тримає E біля пристрою (разом — швидше!)
    let holders = 0;
    if (d < 3.6 && allowControl && input.down('KeyE')) holders++;
    if (level.players) {
      for (const pl of level.players) {
        if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
        if (Math.hypot(pl.pos.x - rp.x, pl.pos.z - rp.z) < 3.6) holders++;
      }
    }
    if (d < 3.6) {
      this.prompt = {
        text: teamworkPrompt(level.countryId === 'MOON'
          ? (m.progress > 0 ? t('Тримай {k} — відновлюй кисневе реле', { k: interactKey() }) : t('Тримай {k} — запусти кисневе реле', { k: interactKey() }))
          : m.train
          ? t('Тримай {k} — заведи поїзд', { k: interactKey() })
          : (m.progress > 0 ? t('Тримай {k} — ремонт', { k: interactKey() }) : t('Тримай {k} — почни ремонт', { k: interactKey() })), holders),
        hold: true, progress: m.progress,
      };
    }
    if (d < 3.6 || holders > 0) {
      if (holders > 0) {
        const repairSpeed = level.operationEffects && level.operationEffects.repairSpeedMultiplier || 1;
        m.progress = Math.min(1, m.progress + (dt * holders * repairSpeed) / 12);
        m.tickT -= dt;
        if (m.tickT <= 0) {
          m.tickT = 0.35;
          level.audio.repairTick();
          const sp = new THREE.Vector3(rp.x, level.world.groundH(rp.x, rp.z) + 1, rp.z);
          level.effects.burst(sp, 0xffe066, 3, { speed: 1.6, up: 2.2, life: 0.3, size: 0.6 });
        }
        if (m.progress > 0.15 && !m.waves[0]) {
          m.waves[0] = true;
          this.pendingWaves.push({ t: 2.5, n: 4, onlyWalkers: true, site: m.site });
          level.audio.horde();
          level.bus.emit('toast', t('👂 Чуєш гарчання? Приготуйся! ⚠️'));
        }
        if (m.progress > 0.55 && !m.waves[1]) {
          m.waves[1] = true;
          this.pendingWaves.push({ t: 2.5, n: 5, onlyWalkers: false, site: m.site });
          level.audio.horde();
          level.bus.emit('toast', t('👂 Ще одна хвиля наближається! ⚠️'));
        }
        if (m.progress >= 1) {
          if (m.train) level.world.startRescueTrain();
          else {
            level.world.setTowerFixed();
            level.netEv('tower');
          }
          this._complete(m.id);
          level.bus.emit('toast', m.train ? t('🚂 Рятувальний поїзд запущено!') : t('Полагоджено! Сигнал надіслано 📡'));
        }
      }
    }
  }

  _up_clear(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (!this.crateReady) {
      if (level.zombies.countAliveInZone('warehouse') === 0) {
        this.crateReady = true;
        level.bus.emit('toast', t('Склад зачищено! Відкрий ящик зі зброєю 📦'));
      }
    } else if (m.crateOpenedT < 0) {
      const wc = level.world.weaponCrate;
      const d = Math.hypot(player.pos.x - wc.x, player.pos.z - wc.z);
      if (d < 3.4) {
        this.prompt = { text: t('Натисни {k} — відкрий ящик', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          m.crateOpenedT = 0;
          level.world.openCrate();
          level.audio.door();
          level.netEv('crate');
          input.justPressed.delete('KeyE');
        }
      }
    } else {
      m.crateOpenedT += dt;
      if (m.crateOpenedT > 0.9) {
        const w = level.country.weaponReward;
        if (w) {
          const hadIt = (level.game.save.weapons || []).includes(w);
          level.game.unlockWeapon(w); // видає зброю (соло/хост); якщо вже є — unlockWeapon сам дає +300 монет і тост «вже є»
          this._complete(m.id);
          // тост-нагороду показуємо ЛИШЕ якщо зброя справді нова; weaponRewardToast — ФУНКЦІЯ,
          // тож ВИКЛИКАЄМО її (раніше емітували саму функцію → у тост лазив код), і не дублюємо
          // повідомлення «Ти отримав…», коли зброя вже була (тоді гравець бачить «вже є +300»)
          if (!hadIt && level.country.weaponRewardToast) {
            const tw = level.country.weaponRewardToast;
            level.bus.emit('toast', typeof tw === 'function' ? tw() : tw);
          }
        } else {
          // 🇪🇸/🇮🇹 склад без зброї: ящик дає МОНЕТИ (вогнемет/лазер тепер за зірковий рівень)
          const c = level.country.coinReward || 120;
          level.game.save.coins += c;
          level.game.saveGame();
          this._complete(m.id);
          level.bus.emit('toast', t('📦 Ящик зі скарбом! +{c} монет 💰', { c }));
        }
      }
    }
  }

  _up_collect(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    for (const c of m.crates) {
      if (c.taken) continue;
      c.mesh.position.y = c.y + Math.abs(Math.sin(performance.now() / 400 + c.x)) * 0.12;
      const d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      if (d < 3.4) {
        this.prompt = { text: t('🧺 Натисни {k} — забери припаси ({n}/4)', { k: interactKey(), n: m.found }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          c.taken = true;
          m.found++;
          level.scene.remove(c.mesh);
          level.netEv('sup', m.slotIndex, m.crates.indexOf(c), 1);
          level.audio.pickup();
          level.effects.burst(new THREE.Vector3(c.x, c.y + 0.8, c.z), 0x4cff7a, 8, { speed: 2.5, up: 3, life: 0.6 });
          level.bus.emit('toast', m.found < 4 ? t('🧺 Ящик {n}/4! Шукай наступний за маркером', { n: m.found }) : t('🧺 Усі припаси зібрано!'));
          if (m.found >= 4) this._complete(m.id);
          input.justPressed.delete('KeyE');
        }
        break;
      }
    }
  }

  _up_defense(m, dt) {
    const level = this.level;
    const player = level.player;
    const defenders = level.players || [{ pos: player.pos, health: player.health }];
    const inZone = defenders.some((p) => p.health > 0
      && Math.hypot(p.pos.x - m.zone.x, p.pos.z - m.zone.z) < m.zone.r);
    m.zone.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.2;
    if (!m.started) {
      if (inZone) {
        m.started = true;
        level.bus.emit('toast', t('🛡️ ОБОРОНА! Протримайся в зоні {n} секунд!', { n: Math.ceil(m.timer) }));
        level.audio.horde();
        m.waveT = 1.5;
      }
      return;
    }
    // таймер іде лише в зоні — вийшов: пауза і підказка
    if (inZone) {
      m.timer -= dt;
      m.waveT -= dt;
      if (m.waveT <= 0) {
        m.waveT = 9;
        const total = m.duration || (level.countryId === 'UKR' ? 22 : 45);
        this._towerWave(3 + Math.round(2 * (1 - m.timer / total)), m.timer > total * 0.55, m.site);
      }
      if (m.timer <= 0) {
        this._complete(m.id);
        level.bus.emit('toast', t('🛡️ Зону втримано! Молодець!'));
      }
    } else {
      this.prompt = { text: t('🛡️ Повернись у синє коло — оборона на паузі!'), hold: false };
    }
  }

  _up_fireworks(m, dt) {
    this._up_defense(m, dt);
  }

  _up_villageclear(m) {
    const alive = m.targets.filter((zombie) => zombie.state !== 'dead' && !zombie.gone).length;
    m.title = t('Зачисти село від зомбі: залишилося {n}', { n: alive });
    if (alive > 0) return;
    this._complete(m.id);
    this.level.bus.emit('toast', t('🏘️ Село зачищено! Шлях до феєрверків відкрито.'));
  }

  _up_hunt(m) {
    const level = this.level;
    const killed = m.elites.filter((e) => e.state === 'dead' || e.gone).length;
    if (killed !== m.killed) {
      m.killed = killed;
      if (m.killed < 3) {
        level.bus.emit('toast', t('👹 Еліт переможено ({n}/3)! Наступний — за маркером', { n: m.killed }));
        // проміжний прогрес — чекпойнт, а не «квест виконано» (той лунає у _complete)
        level.audio.checkpoint();
      }
    }
    if (m.killed >= 3) {
      this._complete(m.id);
      level.bus.emit('toast', t('👹 Усіх елітних переможено!'));
    }
  }

  _up_nests(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const bases = m.type === 'bases';
    for (const n of m.nestList) {
      if (n.cleared) continue;
      n.pod.scale.y = 1.25 + Math.sin(performance.now() / 350 + n.x) * 0.07;
      const d = Math.hypot(player.pos.x - n.x, player.pos.z - n.z);
      let holders = 0;
      if (d < 3.8 && allowControl && input.down('KeyE')) holders++;
      if (level.players) {
        for (const pl of level.players) {
          if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
          if (Math.hypot(pl.pos.x - n.x, pl.pos.z - n.z) < 3.8) holders++;
        }
      }
      if (d < 3.8) {
        this.prompt = { text: teamworkPrompt(bases
          ? t('🏚️ Тримай {k} — знищ зомбі-базу', { k: interactKey() })
          : t('🟣 Тримай {k} — знешкодь гніздо', { k: interactKey() }), holders), hold: true, progress: n.progress };
      }
      if (d < 3.8 || holders > 0) {
        if (holders > 0) {
          n.progress = Math.min(1, n.progress + (dt * holders) / 4);
          if (Math.random() < dt * 6) {
            level.effects.burst(new THREE.Vector3(n.x, n.y + 1, n.z), 0xb06ee8, 2, { speed: 1.5, up: 2, life: 0.4, size: 0.7 });
          }
          if (n.progress >= 1) {
            n.cleared = true;
            m.cleared++;
            level.scene.remove(n.mesh);
            level.netEv('nest', m.slotIndex, m.nestList.indexOf(n));
            level.audio.shieldBreak();
            level.effects.burst(new THREE.Vector3(n.x, n.y + 1, n.z), 0x8d3bbd, 16, { speed: 4, up: 4, life: 0.8, size: 1.2 });
            level.bus.emit('toast', bases
              ? (m.cleared < 3 ? t('🏚️ Базу знищено ({n}/3)!', { n: m.cleared }) : t('🏚️ Усі зомбі-бази знищено!'))
              : (m.cleared < 3 ? t('🟣 Гніздо знищено ({n}/3)!', { n: m.cleared }) : t('🟣 Усі гнізда знищено!')));
            if (m.cleared >= 3) this._complete(m.id);
          }
        } else {
          n.progress = Math.max(0, n.progress - dt * 0.5);
        }
        break;
      } else if (n.progress > 0) {
        n.progress = Math.max(0, n.progress - dt * 0.5);
      }
    }
  }

  _up_bases(m, dt, input, allowControl) { this._up_nests(m, dt, input, allowControl); }

  _makeManorMission(m) {
    m.phase = 'clear';
    m.killed = 0;
    m.rescueProgress = 0;
    m.started = false;
    m.manorZombies = [];
    m.chests = [];
    m.title = t('Зачисть маєток: {n}/120 зомбі', { n: 0 });
  }

  _activateManorMission(m) {
    if (m.started) return;
    m.started = true;
    const level = this.level;
    const manor = level.world.zombieManor;
    if (this.mirror || !manor) return;

    const points = [];
    // 80 ворогів на першому поверсі, 40 — у кімнатах другого.
    for (let i = 0; i < 120; i++) {
      const floor = i >= 80 ? 1 : 0;
      const j = floor ? i - 80 : i;
      const rows = floor ? 4 : 8;
      let px = manor.building.x - manor.building.w / 2 + 12
        + ((j % 10) + 0.5) * (manor.building.w - 24) / 10;
      let pz = manor.building.z - manor.building.d / 2 + 12
        + (Math.floor(j / 10) + 0.5) * (manor.building.d - 24) / rows;
      for (const wallX of [-45, 0, 45]) if (Math.abs(px - (manor.building.x + wallX)) < 3) px += 5;
      if (Math.abs(Math.abs(pz - manor.building.z) - 7) < 3) pz += pz < manor.building.z ? -5 : 5;
      points.push({ x: px, z: pz, floor });
    }
    points.forEach((point, i) => {
      const type = i % 20 === 0 ? 'tank' : i % 5 === 0 ? 'runner' : 'walker';
      const zombie = level.zombies.spawn(type, point.x, point.z, {
        horde: false, anchor: { x: manor.x, z: manor.z, r: manor.w * 0.48 },
      });
      zombie.manorZombie = true;
      zombie.manorFloor = point.floor;
      if (point.floor === 1) {
        zombie.y = manor.hostage.y;
        zombie.rig.group.position.y = zombie.y;
      }
      m.manorZombies.push(zombie);
    });

    const rng = new RNG(level.country.seed + 953 + this.runIndex);
    const chestSpots = [
      [-66, -35, 0], [-20, 35, 0], [30, -35, 0],
      [66, 35, 1], [20, -35, 1],
    ];
    const rewards = ['coins', 'crystals', 'xp', 'buff'];
    const wood = toonMat(0x8a542f);
    const gold = toonMat(0xe0b83f, 0xa87418, 0.35);
    m.chests = chestSpots.map(([ox, oz, floor]) => {
      const mesh = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.3), wood);
      box.position.y = 0.42;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 1.4), gold);
      lid.position.y = 1;
      mesh.add(box, lid);
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const x = manor.x + ox, z = manor.z + oz;
      const y = level.world.groundH(x, z) + floor * 5.15;
      mesh.position.set(x, y, z);
      level.scene.add(mesh);
      return { x, z, y, floor, mesh, opened: false, reward: rng.pick(rewards), buff: rng.pick(['speed', 'rage', 'bubble', 'magnet']) };
    });
    level.audio.horde();
  }

  _openManorChest(m, chest) {
    if (!chest || chest.opened) return false;
    const level = this.level;
    chest.opened = true;
    level.scene.remove(chest.mesh);
    if (chest.reward === 'coins') {
      level.addCoins(100);
      level.bus.emit('toast', t('Нагорода: {i} {n}', { i: '💰', n: t('100 монет') }));
    } else if (chest.reward === 'crystals') {
      level.game.save.crystals = (level.game.save.crystals || 0) + 3;
      level.game.saveGame();
      level.bus.emit('toast', t('💎 +3 кристали'));
    } else if (chest.reward === 'xp') {
      level.game.progress.addXp(25);
      level.bus.emit('toast', t('Нагорода: {i} {n}', { i: '⭐', n: '25 XP' }));
    } else {
      level.effects.onPickup(chest.buff, 0);
    }
    if (chest.reward !== 'buff') level.audio.pickup();
    level.effects.burst(new THREE.Vector3(chest.x, chest.y + 0.8, chest.z), 0xffd23f, 12, { speed: 3, up: 4, life: 0.7 });
    return true;
  }

  _updateManorChests(m, input, allowControl) {
    const player = this.level.player;
    for (const chest of m.chests) {
      if (chest.opened) continue;
      if (Math.hypot(player.pos.x - chest.x, player.pos.z - chest.z) >= 3
        || Math.abs(player.pos.y - chest.y) >= 2.5) continue;
      this.prompt = { text: t('Натисни {k} — відкрити скриню', { k: interactKey() }), hold: false };
      if (allowControl && input.pressed('KeyE')) {
        this._openManorChest(m, chest);
        input.justPressed.delete('KeyE');
      }
      break;
    }
  }

  _spawnManorCivilians(m) {
    const level = this.level;
    const manor = level.world.zombieManor;
    const kinds = ['medic', 'granny', 'kid', 'granny', 'kid'];
    kinds.forEach((kind, i) => {
      const rig = makeCivilian(kind, level.rng);
      const x = manor.entrance.x - 4 + i * 2, z = manor.entrance.z - 5;
      rig.group.position.set(x, level.world.groundH(x, z), z);
      level.scene.add(rig.group);
      this.civilians.push({ rig, kind, x, z, state: 'follow', angle: (i / kinds.length) * Math.PI * 2, cheerT: 3 });
      if (kind === 'medic') this.medicAlive = true;
    });
  }

  _up_manor(m, dt, input, allowControl) {
    const level = this.level;
    const manor = level.world.zombieManor;
    if (!manor) return;
    this._activateManorMission(m);
    this._updateManorChests(m, input, allowControl);
    if (m.phase === 'clear') {
      const alive = m.manorZombies.filter((z) => z.state !== 'dead' && !z.gone).length;
      m.killed = 120 - alive;
      m.title = t('Зачисть маєток: {n}/120 зомбі', { n: m.killed });
      if (alive > 0) return;
      m.phase = 'rescue';
      m.title = t('Піднімися на 2 поверх і врятуй людей');
      level.bus.emit('toast', t('🏛️ Маєток зачищено! Люди замкнені на другому поверсі.'));
    }

    const target = manor.hostage;
    const player = level.player;
    const near = Math.hypot(player.pos.x - target.x, player.pos.z - target.z) < 4 && Math.abs(player.pos.y - target.y) < 2.5;
    let holders = near && allowControl && input.down('KeyE') ? 1 : 0;
    if (level.players) for (const pl of level.players) {
      if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
      if (Math.hypot(pl.pos.x - target.x, pl.pos.z - target.z) < 4 && Math.abs(pl.pos.y - target.y) < 2.5) holders++;
    }
    if (near) this.prompt = { text: teamworkPrompt(t('Тримай {k} — звільни людей', { k: interactKey() }), holders), hold: true, progress: m.rescueProgress };
    if (!holders) return;
    m.rescueProgress = Math.min(1, m.rescueProgress + (dt * holders) / 3);
    if (m.rescueProgress < 1) return;
    this._spawnManorCivilians(m);
    this._complete(m.id);
    level.bus.emit('toast', t('🏛️ Людей із маєтку врятовано!'));
  }

  _up_rebuild(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (m.phase === 'musicians') {
      const door = level.world.barnDoorCollider;
      const d = Math.hypot(player.pos.x - door.x, player.pos.z - (door.z - 1));
      if (!m.musiciansOpened && d < 3.2) {
        this.prompt = { text: t('Натисни {k} — врятуй музикантів', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          input.justPressed.delete('KeyE');
          m.musiciansOpened = true;
          level.world.openBarn();
          level.audio.door();
          this.spawnCivilians();
          level.netEv('barn');
        }
      }
      if (m.musiciansOpened) {
        m.musiciansT += dt;
        if (m.musiciansT >= 2) {
          m.phase = 'tools';
          m.title = t('Знайди сокиру й кірку');
          level.bus.emit('toast', t('🎺 Музикантів врятовано! Тепер знайди сокиру й кірку.'));
        }
      }
      return;
    }
    if (m.phase === 'tools') {
      for (const tool of m.tools) {
        if (tool.taken) continue;
        tool.mesh.position.y = tool.y + 0.7 + Math.abs(Math.sin(performance.now() / 400 + tool.x)) * 0.14;
        if (Math.hypot(player.pos.x - tool.x, player.pos.z - tool.z) >= 3.4) continue;
        this.prompt = { text: tool.kind === 'axe'
          ? t('Натисни {k} — взяти сокиру', { k: interactKey() })
          : t('Натисни {k} — взяти кірку', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          input.justPressed.delete('KeyE');
          tool.taken = true;
          level.scene.remove(tool.mesh);
          player.giveWeapon(tool.kind);
          level.audio.pickup();
          level.bus.emit('toast', tool.kind === 'axe' ? t('🪓 Сокиру знайдено!') : t('⛏️ Кірку знайдено!'));
          if (m.tools.every((it) => it.taken)) {
            m.phase = 'resources';
            level.bus.emit('toast', m.spanish
              ? t('⛏️ Інструменти готові — добудь 50 заліза, 100 каменю і 55 дерева!')
              : t('⛏️ Інструменти готові — добудь 120 дерева і 50 каменю!'));
          }
        }
        break;
      }
      return;
    }
    if (m.phase === 'resources') {
      m.title = m.spanish
        ? t('Ресурси: залізо {iron}/50 · камінь {stone}/100 · дерево {wood}/55', m)
        : t('Добудь ресурси: дерево {wood}/120 · камінь {stone}/50', m);
      for (const p of m.points) {
        if (p.done) continue;
        const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
        if (d >= 3.6) continue;
        const needed = p.kind === 'wood' ? 'axe' : 'pickaxe';
        this.prompt = player.cur === needed
          ? { text: p.kind === 'wood' ? t('Атакуй дерево сокирою')
            : p.kind === 'iron' ? t('Добувай залізо кіркою') : t('Атакуй камінь кіркою'), hold: false, progress: (4 - p.hp) / 4 }
          : { text: p.kind === 'wood' ? t('Обери сокиру: X або колесо зброї') : t('Обери кірку: X або колесо зброї'), hold: false };
        break;
      }
      return;
    }
    m.dest.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.18;
    const d = Math.hypot(player.pos.x - m.dest.x, player.pos.z - m.dest.z);
    const seconds = Math.ceil((1 - m.buildProgress) * m.buildSeconds);
    m.title = m.spanish ? t('Віднови музичний центр: {n} с', { n: seconds }) : t('Віднови центр міста: {n} с', { n: seconds });
    if (d < m.dest.r) this.prompt = { text: m.spanish
      ? t('Тримай {k} — відновлюй музичний центр', { k: interactKey() })
      : t('Тримай {k} — відновлюй центр міста', { k: interactKey() }), hold: true, progress: m.buildProgress };
    if (d < m.dest.r && allowControl && input.down('KeyE')) {
      m.buildWaveT -= dt;
      if (m.buildWaveT <= 0) {
        m.buildWaveT += 10;
        m.buildWaves++;
        for (const side of m.attackSides) {
          const count = m.spanish ? 2 : 4;
          for (let i = 0; i < count; i++) {
            const x = m.spanish
              ? m.dest.x + Math.cos(side) * 20 + Math.cos(side + Math.PI / 2) * (i ? 3 : -3)
              : m.dest.x + side * (18 + i * 1.5);
            const z = m.spanish
              ? m.dest.z + Math.sin(side) * 20 + Math.sin(side + Math.PI / 2) * (i ? 3 : -3)
              : m.dest.z + (i - 1.5) * 4;
            const zombie = level.zombies.spawn(i === 0 ? 'runner' : 'walker', x, z, { horde: false });
            zombie.rebuildAttack = true;
            zombie.aggroed = true;
            zombie.state = 'chase';
          }
        }
        level.audio.horde();
        level.bus.emit('toast', m.spanish
          ? t('🧟 Зомбі атакують музичний центр з усіх сторін!')
          : t('🧟 Зомбі атакують центр з обох боків!'));
      }
      m.buildProgress = Math.min(1, m.buildProgress + dt / m.buildSeconds);
      if (m.buildProgress >= 1) {
        const settlement = level.game.save.settlement || (level.game.save.settlement = { level: 0, wood: 0, stone: 0, survivors: 0 });
        settlement.level = Math.min(3, (settlement.level | 0) + 1);
        settlement.wood = Math.min(999999, (settlement.wood | 0) + m.wood);
        settlement.stone = Math.min(999999, (settlement.stone | 0) + m.stone);
        settlement.survivors = Math.min(9999, (settlement.survivors | 0) + 3);
        level.game.saveGame();
        m.rebuilt = this._makeCityCenter(m);
        m.phase = 'done';
        level.bus.emit('toast', m.spanish
          ? t('🎵 Музичний центр відновлено!')
          : t('🏗️ Поселення покращено до рівня {n}/3!', { n: settlement.level }));
        this._complete(m.id);
      }
    }
  }

  _up_stationrepair(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (m.phase === 'fragments') {
      for (const fragment of m.fragments) {
        if (fragment.taken) continue;
        fragment.mesh.rotation.y += dt;
        fragment.mesh.position.y = fragment.y + 0.8 + Math.sin(performance.now() / 350 + fragment.x) * 0.15;
        if (Math.hypot(player.pos.x - fragment.x, player.pos.z - fragment.z) >= 3.4) continue;
        this.prompt = { text: t('Натисни {k} — взяти уламок станції', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          input.justPressed.delete('KeyE');
          fragment.taken = true;
          m.found++;
          level.scene.remove(fragment.mesh);
          level.audio.pickup();
          level.effects.burst(new THREE.Vector3(fragment.x, fragment.y + 0.8, fragment.z), 0x6fc8ff, 10);
          m.title = t('Знайди уламки станції: {n}/5', { n: m.found });
          if (m.found === 5) {
            m.phase = 'repair';
            level.bus.emit('toast', t('🛰️ Усі уламки знайдено — повертайся до космічної станції!'));
          }
        }
        break;
      }
      return;
    }
    const d = Math.hypot(player.pos.x - m.site.x, player.pos.z - m.site.z);
    const seconds = Math.ceil((1 - m.repairProgress) * 30);
    m.title = t('Відбудуй космічну станцію: {n} с', { n: seconds });
    if (d < 7) this.prompt = { text: t('Тримай {k} — відбудовуй космічну станцію', { k: interactKey() }), hold: true, progress: m.repairProgress };
    if (d >= 7 || !allowControl || !input.down('KeyE')) return;
    m.waveT -= dt;
    if (m.waveT <= 0) {
      m.waveT += 8;
      m.waves++;
      for (let side = 0; side < 4; side++) {
        const a = side * Math.PI / 2;
        for (let i = 0; i < 3; i++) {
          const x = m.site.x + Math.cos(a) * (24 + i * 2);
          const z = m.site.z + Math.sin(a) * (24 + i * 2);
          const zombie = level.zombies.spawn(i === 0 ? 'runner' : 'walker', x, z, { horde: false });
          zombie.aggroed = true;
          zombie.state = 'chase';
          zombie.stationAttack = true;
          zombie.stationSide = side;
        }
      }
      level.audio.horde();
      level.bus.emit('toast', t('🧟 Зомбі атакують космічну станцію з усіх сторін!'));
    }
    m.repairProgress = Math.min(1, m.repairProgress + dt / 30);
    level.world.setMoonStationRepair(m.repairProgress);
    if (m.repairProgress >= 1) {
      m.phase = 'launched';
      level.world.launchMoonStation();
      this._complete(m.id);
    }
  }

  _up_escort(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (!m.started) {
      const d = Math.hypot(player.pos.x - m.site.x, player.pos.z - (m.site.z + 2));
      if (d < 5) {
        this.prompt = { text: t('🧳 Натисни {k} — забери мандрівника', { k: interactKey() }), hold: false };
        if (allowControl && input.pressed('KeyE')) {
          m.started = true;
          this._spawnTraveler(m);
          this.pendingWaves.push({ t: 3, n: 4, onlyWalkers: true, site: m.site });
          input.justPressed.delete('KeyE');
        }
      }
      return;
    }
    const tr = m.traveler;
    if (!tr) return;
    // мандрівник іде за найближчим живим гравцем
    let fp = player.pos;
    if (level.players) {
      let bd = Infinity;
      for (const pl of level.players) {
        if (pl.health <= 0) continue;
        const dd = Math.hypot(pl.pos.x - tr.x, pl.pos.z - tr.z);
        if (dd < bd) { bd = dd; fp = pl.pos; }
      }
    }
    const tx = fp.x + 1.8, tz = fp.z + 1.2;
    const dx = tx - tr.x, dz = tz - tr.z;
    const d = Math.hypot(dx, dz);
    if (d > 30) { tr.x = tx; tr.z = tz; }
    const spd = d > 10 ? 5.4 : d > 1.6 ? 3.6 : 0;
    if (spd > 0) {
      tr.x += (dx / d) * spd * dt;
      tr.z += (dz / d) * spd * dt;
      tr.rig.group.rotation.y = dampAngle(tr.rig.group.rotation.y, Math.atan2(-dx, -dz), 8, dt);
      setAnim(tr.rig, spd > 4 ? 'run' : 'walk');
      tr.rig.anim.speed = spd;
    } else {
      setAnim(tr.rig, 'idle');
    }
    const solved = level.world.collide(tr.x, tr.z, 0.4);
    tr.x = solved.x; tr.z = solved.z;
    tr.rig.group.position.set(tr.x, level.world.groundH(tr.x, tr.z), tr.z);
    updateRig(tr.rig, dt);
    // зомбі кусають мандрівника
    if (tr.hurtCd > 0) tr.hurtCd -= dt;
    for (const z of level.zombies.list) {
      if (z.state === 'dead' || !z.aggroed) continue;
      if (tr.hurtCd <= 0 && Math.hypot(z.x - tr.x, z.z - tr.z) < 1.6) {
        tr.hp -= 8;
        tr.hurtCd = 1.2;
        level.effects.burst(new THREE.Vector3(tr.x, 1.4, tr.z), 0xff5d5d, 4, { speed: 2, up: 2, life: 0.4 });
        if (tr.hp <= 35 && !m.midWarned) {
          m.midWarned = true;
          level.bus.emit('toast', t('⚠️ Мандрівника кусають! Захисти його!'));
        }
        if (tr.hp <= 0) {
          // не караємо жорстко: мандрівник «ховається» і чекає на новий супровід.
          // Скидаємо і прапори етапів — щоб повторний супровід знову мав засідку й попередження
          level.scene.remove(tr.rig.group);
          m.traveler = null;
          m.started = false;
          m.midWave = false;
          m.midWarned = false;
          level.bus.emit('toast', t('😿 Мандрівник сховався у хліві. Повернись по нього!'));
          return;
        }
      }
    }
    // середина шляху — невелика засідка
    const half = Math.hypot(tr.x - m.dest.x, tr.z - m.dest.z);
    if (!m.midWave && half < Math.hypot(m.site.x - m.dest.x, m.site.z - m.dest.z) * 0.5) {
      m.midWave = true;
      this.pendingWaves.push({ t: 1.5, n: 4, onlyWalkers: false, site: { x: tr.x, z: tr.z, r: 8 } });
    }
    // дійшли!
    if (Math.hypot(tr.x - m.dest.x, tr.z - m.dest.z) < m.dest.r) {
      setAnim(tr.rig, 'cheer');
      this._complete(m.id);
      level.bus.emit('toast', t('🧳 Мандрівник у безпеці! Дякує тобі від душі 💛'));
      // лишається радіти біля вежі
      m.traveler = null;
    }
  }
  // ---------- двигун «активуй точки» (lights/well/bonfire/convoy) ----------
  _up_lights(m, dt, input, allowControl) { this._upActivate(m, ACT_CFG.lights, dt, input, allowControl); }
  _up_well(m, dt, input, allowControl) { this._upActivate(m, ACT_CFG.well, dt, input, allowControl); }
  _up_bonfire(m, dt, input, allowControl) { this._upActivate(m, ACT_CFG.bonfire, dt, input, allowControl); }
  _up_convoy(m, dt, input, allowControl) { this._upActivate(m, ACT_CFG.convoy, dt, input, allowControl); }

  _upActivate(m, cfg, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    for (const p of m.points) {
      if (p.done) continue;
      p.icon.position.y = 2.0 + Math.sin(performance.now() / 400 + p.x) * 0.15;
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      // 🚚 охорона просинається, коли хтось підходить
      if (cfg.guards && !p.guardsSpawned && d < 15) {
        p.guardsSpawned = true;
        for (let i = 0; i < cfg.guards; i++) {
          const a = (i / cfg.guards) * Math.PI * 2;
          const zb = level.zombies.spawn(i === 1 ? 'runner' : 'walker', p.x + Math.cos(a) * 5, p.z + Math.sin(a) * 5, { horde: false });
          zb.aggroed = true;
          zb.state = 'chase';
        }
        level.bus.emit('toast', t('🚚 Зомбі стережуть вантажівку — відбий її!'));
      }
      let holders = 0;
      if (d < 3.6 && allowControl && input.down('KeyE')) holders++;
      if (level.players) {
        for (const pl of level.players) {
          if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
          if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 3.6) holders++;
        }
      }
      if (d < 3.6) this.prompt = { text: teamworkPrompt(cfg.prompt, holders), hold: true, progress: p.progress };
      if (holders > 0) {
        p.progress = Math.min(1, p.progress + (dt * holders) / cfg.hold);
        if (Math.random() < dt * 5) {
          level.effects.burst(new THREE.Vector3(p.x, p.y + 1.2, p.z), cfg.color, 2, { speed: 1.4, up: 2, life: 0.35, size: 0.6 });
        }
        if (p.progress >= 1) this._actDone(m, cfg, p);
      } else if (p.progress > 0) {
        p.progress = Math.max(0, p.progress - dt * 0.5);
      }
      if (d < 3.6) break;
    }
  }

  _actDone(m, cfg, p) {
    const level = this.level;
    p.done = true;
    m.activated++;
    p.lamp.material.color.set(cfg.color);
    level.effects.burst(new THREE.Vector3(p.x, p.y + 1.2, p.z), cfg.color, 14, { speed: 3.5, up: 4, life: 0.7, size: 1.1 });
    level.netEv('mact', m.slotIndex, m.points.indexOf(p));
    if (m.activated < cfg.n) {
      // проміжна точка — легкий чекпойнт (БЕЗ голосу «квест виконано»)
      level.audio.checkpoint();
      level.bus.emit('toast', cfg.stepToast.replace('{n}', m.activated).replace('{total}', cfg.n));
    } else {
      // фінальна точка — джингл грає _complete() (level.audio.mission()), тут НЕ дублюємо
      level.bus.emit('toast', cfg.doneToast);
      this._complete(m.id);
    }
  }

  // ---------- двигун «знайди та принеси» (balloon/bazaar/tomb) ----------
  _up_balloon(m, dt, input, allowControl) { this._upFetch(m, FETCH_CFG.balloon, dt, input, allowControl); }
  _up_bazaar(m, dt, input, allowControl) { this._upFetch(m, FETCH_CFG.bazaar, dt, input, allowControl); }
  _up_tomb(m, dt, input, allowControl) { this._upFetch(m, FETCH_CFG.tomb, dt, input, allowControl); }
  _makeTurkeyRescueShip(m) {
    const level = this.level;
    const sites = level.country.map.storySites;
    const dock = sites.shipDock, shore = sites.rescueShore, boards = sites.boardsCrate;
    const waterY = level.world.rivers[0]?.level
      ?? level.world.groundH((dock.x + shore.x) / 2, (dock.z + shore.z) / 2) + 0.2;

    const ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.1, 9.5), toonMat(0x75462c));
    hull.position.y = 0.55;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.25, 7.8), toonMat(0xc58a4b));
    deck.position.y = 1.2;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.9, 2.5), toonMat(0xf0dfba));
    cabin.position.set(0, 2.05, 1.5);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 6, 8), toonMat(0x5b3925));
    mast.position.set(0, 4.1, -0.7);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.6), toonMat(0xf4eee0));
    sail.position.set(0, 4.4, -0.78);
    sail.rotation.y = Math.PI;
    ship.add(hull, deck, cabin, mast, sail);
    ship.position.set(dock.x, waterY - 0.22, dock.z);
    level.scene.add(ship);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.5), toonMat(0x9a6538));
    crate.position.set(boards.x, level.world.groundH(boards.x, boards.z) + 0.65, boards.z);
    level.scene.add(crate);
    const people = ['kid', 'granny', 'kid'].map((kind, i) => {
      const rig = makeCivilian(kind, level.rng);
      const x = shore.x + 7, z = shore.z - 2 + i * 2;
      rig.group.position.set(x, level.world.groundH(x, z), z);
      level.scene.add(rig.group);
      return rig;
    });
    Object.assign(m, {
      phase: 'find', repairProgress: 0, rescueProgress: 0, unloadProgress: 0, sailT: 0,
      carrierPid: 0, riderMask: 0, dock, shore, boards, waterY, ship, crate, people, title: t('Знайди ящик із дошками'),
    });
  }

  _shipTarget(m) {
    if (m.phase === 'find') return m.boards;
    if (m.phase === 'sailing' || m.phase === 'rescue' || m.phase === 'return-board') return m.shore;
    return m.dock;
  }

  _shipRiderMask(point) {
    const level = this.level;
    let mask = level.player.health > 0 && Math.hypot(level.player.pos.x - point.x, level.player.pos.z - point.z) < 5 ? (1 << 1) : 0;
    for (const player of level.players || []) {
      if (player.pid !== 1 && player.health > 0 && Math.hypot(player.pos.x - point.x, player.pos.z - point.z) < 5) mask |= 1 << player.pid;
    }
    return mask;
  }

  _setShipPosition(m, t, returning = false, movePlayer = true) {
    const a = returning ? m.shore : m.dock;
    const b = returning ? m.dock : m.shore;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    m.ship.position.set(x, m.waterY - 0.22, z);
    m.ship.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    const player = this.level.player;
    if (movePlayer) {
      player.pos.set(x, m.waterY + 1.1, z);
      if (player.vel) player.vel.set(0, 0, 0);
    }
    if (m.phase === 'returning') m.people.forEach((rig, i) => rig.group.position.set(x - 1.2 + i * 1.2, m.waterY + 1.1, z + 0.6));
  }

  _syncShipVisual(m, movePlayer = false) {
    const level = this.level;
    if (SHIP_PHASES.indexOf(m.phase) >= SHIP_PHASES.indexOf('board')) {
      if (m.crate.parent) m.crate.removeFromParent();
    } else if (!m.crate.parent) level.scene.add(m.crate);

    if (m.phase === 'find') {
      m.crate.position.set(m.boards.x, level.world.groundH(m.boards.x, m.boards.z) + 0.65, m.boards.z);
    } else if (m.phase === 'carry') {
      let carrier = null;
      if (this.mirror && level.net) {
        carrier = m.carrierPid === level.net.myPid() ? level.player : level.net.remotes?.get(m.carrierPid);
      } else carrier = m.carrierPid === 1 ? level.player : level.players?.find((pl) => pl.pid === m.carrierPid);
      if (carrier) m.crate.position.set(carrier.pos.x, carrier.pos.y + 0.7, carrier.pos.z - 0.8);
    } else if (m.phase === 'repair') {
      m.crate.position.set(m.dock.x + 3, m.waterY + 0.7, m.dock.z);
    }

    if (m.phase === 'sailing') this._setShipPosition(m, m.sailT, false, movePlayer);
    else if (m.phase === 'returning') this._setShipPosition(m, m.sailT, true, movePlayer);
    else {
      const point = m.phase === 'rescue' || m.phase === 'return-board' ? m.shore : m.dock;
      m.ship.position.set(point.x, m.waterY - 0.22, point.z);
    }

    if (m.phase !== 'returning') {
      const unloaded = m.phase === 'unload' || m.state === 'done';
      m.people.forEach((rig, i) => {
        const x = (unloaded ? m.dock.x : m.shore.x) + 7;
        const z = (unloaded ? m.dock.z : m.shore.z) - 2 + i * 2;
        rig.group.position.set(x, level.world.groundH(x, z), z);
        if (unloaded) setAnim(rig, 'cheer');
      });
    }
  }

  _up_shiprescue(m, dt, input, allowControl) {
    const level = this.level, player = level.player;
    const near = (p, r = 4) => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < r;
    if (m.phase === 'find') {
      m.crate.rotation.y += dt * 0.7;
      if (near(m.boards, 3.5)) this.prompt = { text: t('Натисни {k} — підібрати ящик із дошками', { k: interactKey() }), hold: false };
      if (near(m.boards, 3.5) && allowControl && input.pressed('KeyE')) {
        input.justPressed.delete('KeyE'); m.phase = 'carry'; m.carrierPid = 1; m.title = t('Віднеси дошки до корабля');
        level.audio.pickup(); level.bus.emit('toast', t('🪵 Дошки у тебе — неси їх до корабля!'));
      }
      return;
    }
    if (m.phase === 'carry') {
      const carrier = m.carrierPid === 1 ? player : level.players?.find((pl) => pl.pid === m.carrierPid);
      if (!carrier || carrier.health <= 0) {
        m.phase = 'find'; m.carrierPid = 0; m.title = t('Знайди ящик із дошками');
        this._syncShipVisual(m);
        return;
      }
      m.crate.position.set(carrier.pos.x, carrier.pos.y + 0.7, carrier.pos.z - 0.8);
      if (Math.hypot(carrier.pos.x - m.dock.x, carrier.pos.z - m.dock.z) < 4) {
        m.phase = 'repair'; m.title = t('Ремонтуй корабель 30 секунд');
        m.crate.position.set(m.dock.x + 3, m.waterY + 0.7, m.dock.z);
      }
      return;
    }
    if (m.phase === 'repair') {
      m.title = t('Ремонтуй корабель: {n} с', { n: Math.max(0, Math.ceil(30 * (1 - m.repairProgress))) });
      let holders = near(m.dock, 4) && allowControl && input.down('KeyE') ? 1 : 0;
      for (const pl of level.players || []) {
        if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
        if (Math.hypot(pl.pos.x - m.dock.x, pl.pos.z - m.dock.z) < 4) holders++;
      }
      if (near(m.dock, 4)) this.prompt = { text: teamworkPrompt(t('Тримай {k} — ремонтуй корабель', { k: interactKey() }), holders), hold: true, progress: m.repairProgress };
      if (holders > 0) {
        m.repairProgress = Math.min(1, m.repairProgress + (dt * holders) / 30);
        if (m.repairProgress >= 1) {
          level.scene.remove(m.crate); m.phase = 'board'; m.title = t('Залізь на корабель');
          level.bus.emit('toast', t('🚢 Корабель відремонтовано — час плисти по людей!'));
        }
      }
      return;
    }
    if (m.phase === 'board' || m.phase === 'return-board') {
      const point = m.phase === 'board' ? m.dock : m.shore;
      if (near(point, 5)) this.prompt = { text: t('Натисни {k} — сісти на корабель', { k: interactKey() }), hold: false };
      if (near(point, 5) && allowControl && input.pressed('KeyE')) {
        input.justPressed.delete('KeyE'); m.phase = m.phase === 'board' ? 'sailing' : 'returning'; m.sailT = 0;
        m.riderMask = this._shipRiderMask(point);
        m.title = m.phase === 'sailing' ? t('Пливи до людей') : t('Поверни людей на сушу');
      }
      return;
    }
    if (m.phase === 'sailing' || m.phase === 'returning') {
      m.sailT = Math.min(1, m.sailT + dt / 8);
      const hostRides = !!(m.riderMask & (1 << 1));
      this._setShipPosition(m, m.sailT, m.phase === 'returning', hostRides);
      if (m.sailT >= 1) {
        if (m.phase === 'sailing') {
          m.phase = 'rescue'; m.title = t('Забери людей із берега');
          if (hostRides) player.pos.set(m.shore.x + 5, level.world.groundH(m.shore.x + 5, m.shore.z), m.shore.z);
        } else {
          m.phase = 'unload'; m.title = t('Висади людей на сушу');
          if (hostRides) player.pos.set(m.dock.x + 5, level.world.groundH(m.dock.x + 5, m.dock.z), m.dock.z);
        }
      }
      return;
    }
    if (m.phase === 'rescue') {
      let holders = near(m.shore, 6) && allowControl && input.down('KeyE') ? 1 : 0;
      for (const pl of level.players || []) {
        if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
        if (Math.hypot(pl.pos.x - m.shore.x, pl.pos.z - m.shore.z) < 6) holders++;
      }
      if (near(m.shore, 6)) this.prompt = { text: teamworkPrompt(t('Тримай {k} — забрати людей', { k: interactKey() }), holders), hold: true, progress: m.rescueProgress };
      if (holders > 0) {
        m.rescueProgress = Math.min(1, m.rescueProgress + (dt * holders) / 2);
        if (m.rescueProgress >= 1) { m.phase = 'return-board'; m.title = t('Повернись на корабель із людьми'); }
      }
      return;
    }
    if (m.phase === 'unload') {
      let holders = near(m.dock, 6) && allowControl && input.down('KeyE') ? 1 : 0;
      for (const pl of level.players || []) {
        if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
        if (Math.hypot(pl.pos.x - m.dock.x, pl.pos.z - m.dock.z) < 6) holders++;
      }
      if (near(m.dock, 6)) this.prompt = { text: teamworkPrompt(t('Тримай {k} — висадити людей', { k: interactKey() }), holders), hold: true, progress: m.unloadProgress };
      if (holders > 0) {
        m.unloadProgress = Math.min(1, m.unloadProgress + (dt * holders) / 2);
        if (m.unloadProgress >= 1) {
          m.people.forEach((rig, i) => {
            const x = m.dock.x + 7, z = m.dock.z - 2 + i * 2;
            rig.group.position.set(x, level.world.groundH(x, z), z);
            setAnim(rig, 'cheer');
          });
          this._complete(m.id);
        }
      }
    }
  }

  _castleTarget(m) {
    if (m.phase === 'find') return m.explosive;
    if (m.phase === 'carry' || m.phase === 'plant') return m.plantPoint;
    if (m.phase === 'fight') return this.level.world.castleGate || m.site;
    if (m.phase === 'dungeon') {
      if (this.mirror && m.dungeonTarget) return m.dungeonTarget;
      return m.dungeonWizards.find((z) => z.state !== 'dead' && !z.gone)
        || m.dungeonStones.find((z) => z.state !== 'dead' && !z.gone)
        || this.level.world.castleDungeon || m.site;
    }
    if (m.phase === 'rescue') return this.level.world.castleDungeon || m.site;
    return null;
  }

  _castlePlantPoint(m) {
    const gate = this.level.world.castleGate || { x: m.site.x, z: m.site.z + m.site.r };
    return { x: gate.x, z: gate.z + 6 };
  }

  _castleObjectiveActive() {
    const story = this.level.missions;
    if (!story || !Array.isArray(story.objectives)) return true;
    const objective = story.objectives.find((o) => o.id === 'pol-castle');
    return !objective || objective.state === 'active';
  }

  _up_castle(m, dt, input, allowControl) {
    if (!this._castleObjectiveActive()) return;
    const level = this.level;
    const player = level.player;
    if (!m.started) {
      m.started = true;
      if (m.beam && m.beam.group) m.beam.group.visible = true;
      level.bus.emit('toast', t('🏰 Знайди вибухівку і пробийся до великого замку!'));
    }

    const explosive = m.explosive;
    if (m.phase === 'find') {
      explosive.mesh.position.y = explosive.y + Math.abs(Math.sin(performance.now() / 350)) * 0.12;
      const near = Math.hypot(player.pos.x - explosive.x, player.pos.z - explosive.z) < 3.4;
      if (near) this.prompt = { text: t('Натисни {k} — підняти ящик з вибухівкою', { k: interactKey() }), hold: false };
      if (near && allowControl && input.pressed('KeyE')) {
        input.justPressed.delete('KeyE');
        explosive.taken = true;
        m.phase = 'carry';
        m.title = t('Віднеси вибухівку до воріт замку');
        if (m.beam && m.beam.group) {
          m.beam.group.position.x = m.plantPoint.x;
          m.beam.group.position.z = m.plantPoint.z;
        }
        level.audio.pickup();
        level.bus.emit('toast', t('🧨 Ящик у тебе — неси його до воріт!'));
      }
      return;
    }

    if (m.phase === 'carry') {
      explosive.x = player.pos.x;
      explosive.z = player.pos.z;
      explosive.mesh.position.set(player.pos.x, player.pos.y + 0.75, player.pos.z - 0.75);
      explosive.mesh.rotation.y = player.yaw || 0;
      const near = Math.hypot(player.pos.x - m.plantPoint.x, player.pos.z - m.plantPoint.z) < 3.5;
      if (near) {
        m.phase = 'plant';
        m.title = t('Заклади вибухівку біля воріт');
      }
      return;
    }

    if (m.phase === 'plant') {
      const point = m.plantPoint;
      explosive.mesh.position.set(point.x, level.world.groundH(point.x, point.z) + 0.05, point.z);
      explosive.mesh.rotation.y = 0;
      const near = Math.hypot(player.pos.x - point.x, player.pos.z - point.z) < 3.5;
      if (near) this.prompt = { text: t('Тримай {k} — заклади вибухівку', { k: interactKey() }), hold: true, progress: m.plantProgress };
      if (near && allowControl && input.down('KeyE')) {
        m.plantProgress = Math.min(1, m.plantProgress + dt / 2.2);
        if (m.plantProgress >= 1) this._blastCastleGate(m);
      } else if (m.plantProgress > 0) {
        m.plantProgress = Math.max(0, m.plantProgress - dt * 0.4);
      }
      return;
    }

    if (m.phase === 'fight') {
      const regularLeft = m.guards.filter((z) => !z.castleKnight && z.state !== 'dead' && !z.gone).length;
      const knightLeft = m.guards.filter((z) => z.castleKnight && z.state !== 'dead' && !z.gone).length;
      const archerLeft = m.archers.filter((z) => z.state !== 'dead' && !z.gone).length;
      m.title = t('Зачисть замок: зомбі {z}/25 · лицарі {k}/5 · лучники {a}/4', { z: 25 - regularLeft, k: 5 - knightLeft, a: 4 - archerLeft });
      if (regularLeft === 0 && knightLeft === 0 && archerLeft === 0) {
        m.phase = 'dungeon';
        m.title = t('Зайди у підземелля і переможи 5 чаклунів та 11 камʼяних зомбі');
        const dungeon = level.world.castleDungeon || m.site;
        if (level.world.openCastleDungeon) level.world.openCastleDungeon();
        else {
          if (dungeon.group) dungeon.group.removeFromParent();
          if (dungeon.collider) level.world.removeCollider(dungeon.collider);
        }
        this._spawnCastleDungeonEnemies(m);
        m.beam = level.effects.makeBeam(dungeon.entranceX + 2, dungeon.entranceZ, 0x9b6bff, '🧙');
        level.bus.emit('toast', t('🔓 Прохід відкрито! У підземеллі 5 чаклунів і 11 камʼяних зомбі!'));
      }
      return;
    }

    if (m.phase === 'dungeon') {
      const wizardLeft = m.dungeonWizards.filter((z) => z.state !== 'dead' && !z.gone).length;
      const stoneLeft = m.dungeonStones.filter((z) => z.state !== 'dead' && !z.gone).length;
      m.title = t('Зачисть підземелля: чаклуни {w}/5 · камʼяні {s}/11', { w: 5 - wizardLeft, s: 11 - stoneLeft });
      const dungeon = level.world.castleDungeon || m.site;
      if (Math.hypot(player.pos.x - dungeon.x, player.pos.z - dungeon.z) < 4.5) {
        this.prompt = { text: t('🔒 Переможи всіх ворогів — залишилося: {n}', { n: wizardLeft + stoneLeft }), hold: false };
      }
      if (wizardLeft === 0 && stoneLeft === 0) {
        m.phase = 'rescue';
        m.title = t('Дійди до кінця підземелля і звільни людей');
        if (m.beam) m.beam.remove();
        m.beam = level.effects.makeBeam(dungeon.x, dungeon.z, 0x4cff7a, '🆘');
        level.bus.emit('toast', t('🪨 Підземелля зачищено — люди чекають у кінці!'));
      }
      return;
    }

    if (m.phase === 'rescue') {
      const dungeon = level.world.castleDungeon || { x: m.site.x, z: m.site.z };
      const near = Math.hypot(player.pos.x - dungeon.x, player.pos.z - dungeon.z) < 4.5;
      let holders = near && allowControl && input.down('KeyE') ? 1 : 0;
      if (level.players) {
        for (const pl of level.players) {
          if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
          if (Math.hypot(pl.pos.x - dungeon.x, pl.pos.z - dungeon.z) < 4.5) holders++;
        }
      }
      if (near) this.prompt = { text: teamworkPrompt(t('Тримай {k} — звільни людей', { k: interactKey() }), holders), hold: true, progress: m.rescueProgress };
      if (holders > 0) {
        m.rescueProgress = Math.min(1, m.rescueProgress + (dt * holders) / 2);
        if (m.rescueProgress >= 1) this._rescueCastlePeople(m);
      } else if (m.rescueProgress > 0) {
        m.rescueProgress = Math.max(0, m.rescueProgress - dt * 0.4);
      }
    }
  }

  _blastCastleGate(m) {
    const level = this.level;
    const gate = level.world.castleGate || { x: m.site.x, z: m.site.z + m.site.r };
    level.scene.remove(m.explosive.mesh);
    if (level.world.destroyCastleGate) level.world.destroyCastleGate();
    else {
      if (gate.group) gate.group.removeFromParent();
      if (gate.collider) level.world.removeCollider(gate.collider);
      gate.destroyed = true;
    }
    level.effects.robotBoom(new THREE.Vector3(gate.x, level.world.groundH(gate.x, gate.z) + 1.6, gate.z));
    if (m.beam) { m.beam.remove(); m.beam = null; }
    this.prompt = null;
    m.phase = 'fight';
    m.title = t('Зачисть замок: зомбі 0/25 · лицарі 0/5 · лучники 0/4');
    this._spawnCastleGuards(m);
    level.bus.emit('toast', t('💥 Ворота знищено! Зачисть 25 зомбі та 5 лицарів!'));
    level.bus.emit('toast', t('⚔️ Лицар-зомбі: тіло 150, нагрудник 500, шолом 250!'));
  }

  _spawnCastleGuards(m) {
    const level = this.level;
    const rng = new RNG(level.country.seed + 503);
    const radius = Math.max(18, Math.min(30, (m.site.r || 36) - 7));
    level.zombies.clearNear(m.site.x, m.site.z, radius + 2);
    for (let i = 0; i < 30; i++) {
      const knight = i >= 25;
      const ring = i % 3 === 0 ? radius * 0.45 : radius * 0.78;
      const a = (i / 30) * Math.PI * 2 + rng.range(-0.09, 0.09);
      const x = m.site.x + Math.cos(a) * ring;
      const z = m.site.z + Math.sin(a) * ring;
      const type = knight ? 'gladiator' : (i % 6 === 0 ? 'runner' : i % 9 === 0 ? 'snowman' : 'walker');
      const zombie = level.zombies.spawn(type, x, z, {
        horde: false,
        guard: true,
        castleKnight: knight,
        anchor: { x: m.site.x, z: m.site.z, r: radius },
      });
      zombie.castleGuard = true;
      zombie.aggroed = true;
      zombie.state = 'chase';
      m.guards.push(zombie);
    }
    m.archers = (level.world.castleTowerSpawns || []).slice(0, 4).map((spot) => {
      const archer = level.zombies.spawn('archer', spot.x, spot.z, {
        horde: false,
        guard: true,
        castleArcher: true,
        anchor: { x: spot.x, z: spot.z, r: 2.5 },
      });
      archer.castleGuard = true;
      archer.aggroed = true;
      archer.state = 'chase';
      archer.y = spot.y;
      archer.rig.group.position.y = spot.y;
      return archer;
    });
    level.audio.horde();
  }

  _spawnCastleDungeonEnemies(m) {
    const level = this.level;
    const dungeon = level.world.castleDungeon;
    const spots = dungeon?.wizardSpawns || [];
    m.dungeonWizards = spots.slice(0, 5).map((spot) => {
      const wizard = level.zombies.spawn('wizard', spot.x, spot.z, {
        horde: false,
        guard: true,
        zone: 'castle-dungeon',
        anchor: { x: spot.x, z: spot.z, r: 4 },
      });
      wizard.castleDungeonWizard = true;
      return wizard;
    });
    m.dungeonStones = (dungeon?.stoneSpawns || []).slice(0, 11).map((spot) => {
      const stone = level.zombies.spawn('stone', spot.x, spot.z, {
        horde: false,
        guard: true,
        zone: 'castle-dungeon',
        anchor: { x: spot.x, z: spot.z, r: 4 },
      });
      stone.castleDungeonStone = true;
      stone.aggroed = true;
      stone.state = 'chase';
      return stone;
    });
  }

  _rescueCastlePeople(m) {
    const level = this.level;
    const dungeon = level.world.castleDungeon || { x: m.site.x, z: m.site.z };
    const kinds = ['kid', 'granny', 'medic'];
    kinds.forEach((kind, i) => {
      const rig = makeCivilian(kind, level.rng);
      const x = dungeon.x - 1.4 + i * 1.4;
      const z = dungeon.z - 1.2;
      rig.group.position.set(x, level.world.dungeonGroundH(x, z), z);
      level.scene.add(rig.group);
      this.civilians.push({ rig, kind, x, z, state: 'follow', angle: (i / kinds.length) * Math.PI * 2, cheerT: 2.5 });
    });
    m.phase = 'done';
    level.bus.emit('toast', t('🎉 Людей врятовано з підземелля!'));
    this._complete(m.id);
  }

  _makeZombieBarracks(m) {
    const level = this.level;
    const { x, z } = m.site;
    const y = level.world.groundH(x, z);
    const group = new THREE.Group();
    const wallM = toonMat(0x59616b);
    const darkM = toonMat(0x252b33);
    const roofM = toonMat(0x702f2f);
    const toxicM = toonMat(0x76c442);
    const body = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 8), wallM);
    body.position.y = 2.75;
    body.castShadow = true;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 3.2, 4), roofM);
    roof.position.y = 7.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, 0.35), darkM);
    door.position.set(0, 2.1, 4.15);
    group.add(door);
    for (const side of [-1, 1]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.5, 0.3), toxicM);
      window.position.set(side * 3.3, 3.3, 4.18);
      group.add(window);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), toonMat(0xd8d3bd));
    skull.position.set(0, 6.1, 4.3);
    group.add(skull);
    group.position.set(x, y, z);
    level.scene.add(group);
    const collider = { x, z, r: 5.2, top: y + 8.8 };
    const occluder = { x, z, r: 5.4, h: y + 8.8 };
    level.world.colliders.push(collider);
    level.world.occluders.push(occluder);
    level.world._buildGrid();
    return { group, collider, occluder, x, z, y, radius: 6.2 };
  }

  barracksHitTest(origin, dir, maxD) {
    const m = this.missions.find((mission) => mission.type === 'barracks' && mission.state === 'active' && !mission.destroyed);
    if (!m || !m.barracks) return null;
    const b = m.barracks;
    const cx = b.x, cy = b.y + 3.7, cz = b.z;
    const ox = origin.x - cx, oy = origin.y - cy, oz = origin.z - cz;
    const proj = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - b.radius * b.radius;
    const disc = proj * proj - c;
    if (disc < 0) return null;
    const tHit = -proj - Math.sqrt(disc);
    const t = tHit >= 0 ? tHit : -proj + Math.sqrt(disc);
    if (t < 0 || t > maxD) return null;
    return { mission: m, t, point: origin.clone().addScaledVector(dir, t) };
  }

  resourceHitTest(origin, dir, maxD, tool) {
    const m = this.missions.find((mission) => mission.type === 'rebuild' && mission.state === 'active' && mission.phase === 'resources');
    if (!m || !['axe', 'pickaxe'].includes(tool)) return null;
    let best = null;
    for (const node of m.points) {
      if (node.done || (node.kind === 'wood' ? tool !== 'axe' : tool !== 'pickaxe')) continue;
      const cy = node.y + (node.kind === 'wood' ? 2.1 : 0.75);
      const radius = node.kind === 'wood' ? 1.15 : 1.45;
      const ox = origin.x - node.x, oy = origin.y - cy, oz = origin.z - node.z;
      const proj = ox * dir.x + oy * dir.y + oz * dir.z;
      const disc = proj * proj - (ox * ox + oy * oy + oz * oz - radius * radius);
      if (disc < 0) continue;
      const near = -proj - Math.sqrt(disc);
      const far = -proj + Math.sqrt(disc);
      const t = near >= 0 ? near : far;
      if (t >= 0 && t <= maxD && (!best || t < best.t)) {
        best = { node, t, point: origin.clone().addScaledVector(dir, t) };
      }
    }
    return best;
  }

  damageResource(node, point, tool) {
    const m = this.missions.find((mission) => mission.type === 'rebuild' && mission.state === 'active' && mission.phase === 'resources');
    if (!m || !node || node.done || (node.kind === 'wood' ? tool !== 'axe' : tool !== 'pickaxe')) return false;
    node.hp--;
    node.mesh.rotation.z += node.kind === 'wood' ? 0.025 : 0;
    node.mesh.scale.setScalar(0.94 + node.hp * 0.015);
    this.level.effects.burst(point, node.kind === 'wood' ? 0xb9793d : node.kind === 'iron' ? 0x718596 : 0xaeb6bf, 7, { speed: 2.5, up: 2.5, life: 0.45, size: 0.8 });
    if (node.hp > 0) return true;
    node.done = true;
    m[node.kind] += node.amount;
    this.level.scene.remove(node.mesh);
    this.level.audio.checkpoint();
    if (m.iron >= m.required.iron && m.stone >= m.required.stone && m.wood >= m.required.wood) {
      m.phase = 'build';
      m.dest.ring.visible = true;
      m.dest.icon.visible = true;
      this.level.bus.emit('toast', m.spanish
        ? t('🎵 Ресурси зібрано — відновлюй музичний центр 30 секунд!')
        : t('🏗️ Ресурси зібрано — відновлюй центр міста 30 секунд!'));
    }
    return true;
  }

  damageBarracks(damage, point = null) {
    const m = this.missions.find((mission) => mission.type === 'barracks' && mission.state === 'active' && !mission.destroyed);
    if (!m) return false;
    const dmg = Math.max(0, Math.min(1000, Number(damage) || 0));
    if (!dmg) return false;
    m.hp = Math.max(0, m.hp - dmg);
    m.title = t('Зламай казарму зомбі: {hp}/2500 HP', { hp: Math.ceil(m.hp) });
    const p = point || new THREE.Vector3(m.site.x, m.barracks.y + 3, m.site.z);
    this.level.effects.burst(p, 0xff8a3d, 5, { speed: 2.2, up: 2.4, life: 0.35, size: 0.8 });
    if (m.hp > 0) return true;
    m.destroyed = true;
    this._destroyBarracksVisual(m);
    this.level.effects.robotBoom(new THREE.Vector3(m.site.x, m.barracks.y + 2.5, m.site.z));
    this.level.bus.emit('toast', t('💥 Казарму зруйновано — зомбі більше не виходять!'));
    this._complete(m.id);
    return true;
  }

  _destroyBarracksVisual(m) {
    if (!m || !m.barracks || m.barracks.removed) return;
    m.barracks.removed = true;
    this.level.scene.remove(m.barracks.group);
    this.level.world.removeCollider(m.barracks.collider);
    const oi = this.level.world.occluders.indexOf(m.barracks.occluder);
    if (oi >= 0) this.level.world.occluders.splice(oi, 1);
  }

  _up_barracks(m, dt) {
    const alive = this.level.zombies.list.filter((z) => z.barracksSpawn && z.state !== 'dead' && !z.gone).length;
    if (alive >= 40) {
      m.spawnFastT = Math.min(2, Math.max(0.1, m.spawnFastT));
      m.spawnGiantT = Math.min(7, Math.max(0.1, m.spawnGiantT));
      return;
    }
    m.spawnFastT -= dt;
    m.spawnGiantT -= dt;
    while (m.spawnFastT <= 0 && !m.destroyed) {
      m.spawnFastT += 2;
      this._spawnBarracksZombie(m, this.level.rng.chance(0.5) ? 'runner' : 'walker');
    }
    while (m.spawnGiantT <= 0 && !m.destroyed) {
      m.spawnGiantT += 7;
      this._spawnBarracksZombie(m, 'tank');
    }
  }

  _spawnBarracksZombie(m, type) {
    const a = this.level.rng.range(-0.45, 0.45);
    const x = m.site.x + Math.sin(a) * 3;
    const z = m.site.z + 6 + Math.cos(a) * 1.5;
    const zombie = this.level.zombies.spawn(type, x, z, {
      horde: false,
      guard: true,
      anchor: { x: m.site.x, z: m.site.z, r: 24 },
    });
    zombie.barracksSpawn = true;
    zombie.aggroed = true;
    zombie.state = 'chase';
  }

  _upFetch(m, cfg, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    m.dest.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.18;
    if (m.found < cfg.n) {
      for (const it of m.items) {
        if (it.taken) continue;
        it.mesh.position.y = it.y + Math.abs(Math.sin(performance.now() / 400 + it.x)) * 0.14;
        const d = Math.hypot(player.pos.x - it.x, player.pos.z - it.z);
        if (d < 3.4) {
          this.prompt = { text: cfg.prompt.replace('{n}', m.found).replace('{total}', cfg.n), hold: false };
          if (allowControl && input.pressed('KeyE')) {
            this._fetchTake(m, cfg, m.items.indexOf(it));
            input.justPressed.delete('KeyE');
          }
          break;
        }
      }
      return;
    }
    // усе зібрано — здача біля точки призначення (разом — швидше)
    const d = Math.hypot(player.pos.x - m.dest.x, player.pos.z - m.dest.z);
    let holders = 0;
    if (d < m.dest.r && allowControl && input.down('KeyE')) holders++;
    if (level.players) {
      for (const pl of level.players) {
        if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
        if (Math.hypot(pl.pos.x - m.dest.x, pl.pos.z - m.dest.z) < m.dest.r) holders++;
      }
    }
    if (d < m.dest.r) this.prompt = { text: teamworkPrompt(cfg.deliverPrompt, holders), hold: true, progress: m.deliverProgress };
    if (holders > 0) {
      m.deliverProgress = Math.min(1, m.deliverProgress + (dt * holders) / cfg.hold);
      if (m.deliverProgress >= 1 && !m.delivered) {
        m.delivered = true;
        // ⚱️ засідка з гробниці!
        if (cfg.ambush) {
          this.pendingWaves.push({ t: 1.2, n: cfg.ambush, onlyWalkers: false, site: { x: m.dest.x, z: m.dest.z, r: 8 } });
        }
        level.bus.emit('toast', cfg.doneToast);
        this._complete(m.id);
      }
    } else if (m.deliverProgress > 0 && !m.delivered) {
      m.deliverProgress = Math.max(0, m.deliverProgress - dt * 0.5);
    }
  }

  _fetchTake(m, cfg, i) {
    const level = this.level;
    const it = m.items[i];
    if (!it || it.taken) return;
    it.taken = true;
    m.found++;
    level.scene.remove(it.mesh);
    level.netEv('fit', m.slotIndex, i);
    level.audio.pickup();
    level.effects.burst(new THREE.Vector3(it.x, it.y + 0.8, it.z), cfg.color, 8, { speed: 2.5, up: 3, life: 0.6 });
    level.bus.emit('toast', m.found < cfg.n
      ? cfg.stepToast.replace('{n}', m.found).replace('{total}', cfg.n)
      : cfg.foundToast);
  }

  // ================= КООП =================
  // --- хост: інтеракції гостей (E) з перевіркою відстані ---
  useFetchItem(pid, slot, i, near) {
    const m = this.missions[slot];
    if (!m || m.state !== 'active' || !FETCH_CFG[m.type]) return;
    const it = m.items[i];
    if (!it || it.taken || !near(it.x, it.z, 3.8)) return;
    this._fetchTake(m, FETCH_CFG[m.type], i);
  }

  useBarn(pid, near) {
    const m = this.missions.find((x) => x.type === 'rescue' || (x.type === 'rebuild' && x.phase === 'musicians'));
    const opened = m && (m.type === 'rescue' ? m.opened : m.musiciansOpened);
    if (!m || m.state !== 'active' || opened) return;
    const door = this.level.world.barnDoorCollider;
    if (!near(door.x, door.z - 1, 3.6)) return;
    if (m.type === 'rescue') {
      m.opened = true;
      m.openedT = 0;
    } else {
      m.musiciansOpened = true;
      m.musiciansT = 0;
    }
    this.level.world.openBarn();
    this.level.audio.door();
    this.spawnCivilians();
    this.level.netEv('barn');
  }

  useCrate(pid, near) {
    const m = this.missions.find((x) => x.type === 'clear');
    if (!m || m.state !== 'active' || !this.crateReady || m.crateOpenedT >= 0) return;
    const wc = this.level.world.weaponCrate;
    if (!near(wc.x, wc.z, 3.8)) return;
    m.crateOpenedT = 0;
    this.level.world.openCrate();
    this.level.audio.door();
    this.level.netEv('crate');
  }

  useSupply(pid, i, near) {
    const m = this.missions.find((x) => x.type === 'collect');
    if (!m || m.state !== 'active') return;
    const c = m.crates[i];
    if (!c || c.taken || !near(c.x, c.z, 3.8)) return;
    c.taken = true;
    m.found++;
    this.level.scene.remove(c.mesh);
    this.level.netEv('sup', m.slotIndex, i, pid);
    this.level.audio.pickup();
    this.level.effects.burst(new THREE.Vector3(c.x, c.y + 0.8, c.z), 0x4cff7a, 8, { speed: 2.5, up: 3, life: 0.6 });
    this.level.bus.emit('toast', m.found < 4 ? t('🧺 Ящик {n}/4!', { n: m.found }) : t('🧺 Усі припаси зібрано!'));
    if (m.found >= 4) this._complete(m.id);
  }

  useEscort(pid, near) {
    const m = this.missions.find((x) => x.type === 'escort');
    if (!m || m.state !== 'active' || m.started) return;
    if (!near(m.site.x, m.site.z + 2, 5)) return;
    m.started = true;
    this._spawnTraveler(m);
    this.pendingWaves.push({ t: 3, n: 4, onlyWalkers: true, site: m.site });
    // ескорт синхронізується снапшотом (m.started → гість спавнить мандрівника); окрема подія не потрібна
  }

  useShip(pid, action, near) {
    const m = this.missions.find((mission) => mission.type === 'shiprescue');
    if (!m || m.state !== 'active') return;
    if (action === 'pickup' && m.phase === 'find' && near(m.boards.x, m.boards.z, 3.5)) {
      m.phase = 'carry';
      m.carrierPid = pid;
      m.title = t('Віднеси дошки до корабля');
      this.level.audio.pickup();
      return;
    }
    if (action === 'board' && m.phase === 'board' && near(m.dock.x, m.dock.z, 5)) {
      m.phase = 'sailing'; m.sailT = 0; m.riderMask = this._shipRiderMask(m.dock); m.title = t('Пливи до людей');
      return;
    }
    if (action === 'return' && m.phase === 'return-board' && near(m.shore.x, m.shore.z, 5)) {
      m.phase = 'returning'; m.sailT = 0; m.riderMask = this._shipRiderMask(m.shore); m.title = t('Поверни людей на сушу');
    }
  }

  _removeTraveler(m) {
    if (!m || !m.traveler) return;
    this.level.scene.remove(m.traveler.rig.group);
    m.traveler = null;
  }

  // --- хост: стан місій для снапшота ---
  netState() {
    const out = {
      g: [this.allDone ? 1 : 0, this.bossUnlocked ? 1 : 0, this.bossStarted ? 1 : 0],
      s: [],
      c: this.civilians.map((c) => [
        Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10,
        c.rig.anim.mode === 'run' ? 2 : c.rig.anim.mode === 'walk' ? 1 : c.rig.anim.mode === 'cheer' ? 3 : 0,
      ]),
      t: 0,
    };
    for (const m of this.missions) {
      const a = [m.state === 'done' ? 1 : 0];
      if (m.type === 'rescue') a.push(m.opened ? 1 : 0);
      else if (m.type === 'repair') a.push(Math.round(m.progress * 100) / 100);
      else if (m.type === 'clear') a.push(this.crateReady ? 1 : 0);
      else if (m.type === 'collect') a.push(m.found);
      else if (m.type === 'defense' || m.type === 'fireworks') a.push(m.started ? 1 : 0, Math.round(m.timer * 10) / 10);
      else if (m.type === 'hunt') a.push(m.killed);
      else if (m.type === 'nests') {
        a.push(m.cleared);
        for (const n of m.nestList) a.push(Math.round(n.progress * 100) / 100);
      } else if (m.type === 'barracks') {
        a.push(Math.max(0, Math.ceil(m.hp)));
      } else if (m.type === 'manor') {
        a.push(m.phase === 'rescue' ? 1 : 0, m.killed, Math.round(m.rescueProgress * 100) / 100);
      } else if (m.type === 'castle') {
        const regularLeft = m.guards.filter((z) => !z.castleKnight && z.state !== 'dead' && !z.gone).length;
        const knightLeft = m.guards.filter((z) => z.castleKnight && z.state !== 'dead' && !z.gone).length;
        const dungeonLeft = m.dungeonWizards.filter((z) => z.state !== 'dead' && !z.gone).length
          + m.dungeonStones.filter((z) => z.state !== 'dead' && !z.gone).length;
        const target = this._castleTarget(m) || m.site;
        a.push(
          Math.max(0, CASTLE_PHASES.indexOf(m.phase)),
          Math.round(m.rescueProgress * 100) / 100,
          25 - regularLeft, 5 - knightLeft, dungeonLeft,
          Math.round(target.x * 10) / 10, Math.round(target.z * 10) / 10,
        );
      } else if (m.type === 'shiprescue') {
        a.push(
          Math.max(0, SHIP_PHASES.indexOf(m.phase)),
          Math.round(m.repairProgress * 100) / 100,
          Math.round(m.rescueProgress * 100) / 100,
          Math.round(m.unloadProgress * 100) / 100,
          Math.round(m.sailT * 100) / 100,
          m.carrierPid || 0,
          m.riderMask || 0,
        );
      } else if (m.type === 'escort') a.push(m.started ? 1 : 0);
      else if (m.points) {
        a.push(m.activated);
        for (const p of m.points) a.push(p.done ? 1 : Math.round(p.progress * 100) / 100);
      } else if (m.items) a.push(m.found, m.delivered ? 1 : 0, Math.round(m.deliverProgress * 100) / 100);
      out.s.push(a);
    }
    const esc = this.missions.find((x) => x.type === 'escort');
    if (esc && esc.traveler) {
      out.t = [Math.round(esc.traveler.x * 10) / 10, Math.round(esc.traveler.z * 10) / 10, esc.traveler.hp];
    }
    return out;
  }

  // повний стан для гостя, що приєднався
  netFullState() {
    const out = this.netState();
    for (const m of this.missions) {
      if (m.type === 'collect') out.sup = m.crates.map((c) => (c.taken ? 1 : 0));
      if (m.type === 'nests') out.nst = m.nestList.map((n) => (n.cleared ? 1 : 0));
    }
    // v16: маски точок/предметів за слотами — для mid-join
    out.actm = this.missions.map((m) => (m.points ? m.points.map((p) => (p.done ? 1 : 0)) : 0));
    out.fitm = this.missions.map((m) => (m.items ? m.items.map((it) => (it.taken ? 1 : 0)) : 0));
    return out;
  }

  // --- гість: застосувати стан зі снапшота ---
  applyNet(ms) {
    const level = this.level;
    const wasUnlocked = this.bossUnlocked;
    this.allDone = !!ms.g[0];
    this.bossUnlocked = !!ms.g[1];
    this.bossStarted = !!ms.g[2];
    if (!wasUnlocked && this.bossUnlocked && !this.bossStarted && !this.bossBeam) {
      this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
      level.audio.bossRoar();
      level.bus.emit('bossUnlocked');
    }
    if (this.bossStarted && this.bossBeam) { this.bossBeam.remove(); this.bossBeam = null; }
    ms.s.forEach((a, i) => {
      const m = this.missions[i];
      if (!m) return;
      if (m.type === 'rescue') m.opened = !!a[1];
      else if (m.type === 'repair') {
        m.progress = a[1];
        if (m.train && (a[0] || m.progress >= 1)) level.world.startRescueTrain();
      }
      else if (m.type === 'clear') this.crateReady = !!a[1];
      else if (m.type === 'collect') m.found = a[1];
      else if (m.type === 'defense' || m.type === 'fireworks') { m.started = !!a[1]; m.timer = a[2]; }
      else if (m.type === 'hunt') m.killed = a[1];
      else if (m.type === 'nests') {
        m.cleared = a[1];
        m.nestList.forEach((n, j) => { if (!n.cleared) n.progress = a[2 + j] || 0; });
      } else if (m.type === 'barracks') {
        m.hp = Math.max(0, Number(a[1]) || 0);
        m.title = t('Зламай казарму зомбі: {hp}/2500 HP', { hp: Math.ceil(m.hp) });
        if (m.hp <= 0) { m.destroyed = true; this._destroyBarracksVisual(m); }
      } else if (m.type === 'manor') {
        m.phase = a[1] ? 'rescue' : 'clear';
        m.killed = Number(a[2]) || 0;
        m.rescueProgress = Number(a[3]) || 0;
        m.title = m.phase === 'rescue'
          ? t('Піднімися на 2 поверх і врятуй людей')
          : t('Зачисть маєток: {n}/120 зомбі', { n: m.killed });
      } else if (m.type === 'castle') {
        const previousPhase = m.phase;
        const phaseIndex = Math.max(0, Math.min(CASTLE_PHASES.length - 1, Number(a[1]) || 0));
        m.phase = CASTLE_PHASES[phaseIndex];
        m.rescueProgress = Number(a[2]) || 0;
        m.dungeonLeft = Number(a[5]) || 0;
        m.dungeonTarget = Number.isFinite(a[6]) && Number.isFinite(a[7]) ? { x: a[6], z: a[7] } : null;
        if (phaseIndex >= 3 && level.world.destroyCastleGate) level.world.destroyCastleGate();
        if (phaseIndex >= 4 && level.world.openCastleDungeon) level.world.openCastleDungeon();
        if (m.phase === 'fight') m.title = t('Зачисть замок: зомбі {z}/25 · лицарі {k}/5', { z: a[3] || 0, k: a[4] || 0 });
        else if (m.phase === 'dungeon') {
          m.title = t('Зачисть підземелля: вороги {n}/16', { n: 16 - m.dungeonLeft });
          if (previousPhase !== 'dungeon') {
            if (m.beam) m.beam.remove();
            const dungeon = level.world.castleDungeon || m.site;
            m.beam = level.effects.makeBeam(dungeon.entranceX + 2, dungeon.entranceZ, 0x9b6bff, '🧙');
          }
        }
        else if (m.phase === 'rescue') {
          m.title = t('Дійди до кінця підземелля і звільни людей');
          if (previousPhase !== 'rescue') {
            if (m.beam) m.beam.remove();
            const dungeon = level.world.castleDungeon || m.site;
            m.beam = level.effects.makeBeam(dungeon.x, dungeon.z, 0x4cff7a, '🆘');
          }
        }
      } else if (m.type === 'shiprescue') {
        const phaseIndex = Math.max(0, Math.min(SHIP_PHASES.length - 1, Number(a[1]) || 0));
        m.phase = SHIP_PHASES[phaseIndex];
        m.repairProgress = Number(a[2]) || 0;
        m.rescueProgress = Number(a[3]) || 0;
        m.unloadProgress = Number(a[4]) || 0;
        m.sailT = Number(a[5]) || 0;
        m.carrierPid = Number(a[6]) || 0;
        m.riderMask = Number(a[7]) || 0;
        if (m.phase === 'find') m.title = t('Знайди ящик із дошками');
        else if (m.phase === 'carry') m.title = t('Віднеси дошки до корабля');
        else if (m.phase === 'repair') m.title = t('Ремонтуй корабель: {n} с', { n: Math.max(0, Math.ceil(30 * (1 - m.repairProgress))) });
        else if (m.phase === 'board') m.title = t('Залізь на корабель');
        else if (m.phase === 'sailing') m.title = t('Пливи до людей');
        else if (m.phase === 'rescue') m.title = t('Забери людей із берега');
        else if (m.phase === 'return-board') m.title = t('Повернись на корабель із людьми');
        else if (m.phase === 'returning') m.title = t('Поверни людей на сушу');
        else m.title = t('Висади людей на сушу');
        this._syncShipVisual(m);
      } else if (m.type === 'escort') {
        if (a[1] && !m.started) { m.started = true; if (!m.traveler) this._spawnTraveler(m); }
        else if (!a[1]) { m.started = false; this._removeTraveler(m); }
      } else if (m.points) {
        m.activated = a[1];
        m.points.forEach((p, j) => { if (!p.done) p.progress = a[2 + j] || 0; });
      } else if (m.items) {
        m.found = a[1];
        m.delivered = !!a[2];
        m.deliverProgress = a[3] || 0;
      }
    });
    // мандрівник: ціль для плавного руху
    const esc = this.missions.find((x) => x.type === 'escort');
    if (esc && esc.traveler && ms.t) {
      esc.traveler.netT = { x: ms.t[0], z: ms.t[1] };
      esc.traveler.hp = ms.t[2];
    } else if (esc && esc.traveler && !ms.t) {
      esc.started = false;
      this._removeTraveler(esc);
    }
    this._civNet = ms.c || [];
  }

  applyNetFull(ms) {
    this.applyNet(ms);
    ms.s.forEach((a, i) => {
      const m = this.missions[i];
      if (m && a[0] && m.state !== 'done') this.netMissionDone(i, 0, m.type, true);
    });
    const collect = this.missions.find((x) => x.type === 'collect');
    if (collect && ms.sup) {
      ms.sup.forEach((taken, i) => {
        if (taken && !collect.crates[i].taken) {
          collect.crates[i].taken = true;
          this.level.scene.remove(collect.crates[i].mesh);
        }
      });
    }
    const nests = this.missions.find((x) => x.type === 'nests');
    if (nests && ms.nst) {
      ms.nst.forEach((cl, i) => {
        if (cl && !nests.nestList[i].cleared) {
          nests.nestList[i].cleared = true;
          this.level.scene.remove(nests.nestList[i].mesh);
        }
      });
    }
    const rescue = this.missions.find((x) => x.type === 'rescue');
    if (rescue && rescue.opened) this.netBarnOpened(true);
    // v16: mid-join — позначаємо вже активовані точки і забрані предмети
    if (ms.actm) {
      ms.actm.forEach((mask, slot) => {
        if (!mask) return;
        mask.forEach((done, i) => { if (done) this.netActDone(slot, i, true); });
      });
    }
    if (ms.fitm) {
      ms.fitm.forEach((mask, slot) => {
        if (!mask) return;
        mask.forEach((taken, i) => { if (taken) this.netFetchTaken(slot, i, true); });
      });
    }
  }

  // --- гість: дискретні події ---
  netBarnOpened(silent = false) {
    const m = this.missions.find((x) => x.type === 'rescue' || (x.type === 'rebuild' && x.phase === 'musicians'));
    if (m?.type === 'rescue') m.opened = true;
    if (m?.type === 'rebuild') {
      m.musiciansOpened = true;
      m.phase = 'tools';
      m.title = t('Знайди сокиру й кірку');
    }
    if (!this.civilians.length) this.spawnCivilians();
    if (!silent) this.level.bus.emit('toast', t('Людей врятовано! Медик лікуватиме вас поблизу 💚'));
  }

  netSupplyTaken(slot, i, byPid) {
    const m = this.missions[slot];
    if (!m || m.type !== 'collect') return;
    const c = m.crates[i];
    if (!c || c.taken) return;
    c.taken = true;
    m.found = Math.max(m.found, m.crates.filter((x) => x.taken).length);
    this.level.scene.remove(c.mesh);
    this.level.audio.pickup();
    this.level.effects.burst(new THREE.Vector3(c.x, c.y + 0.8, c.z), 0x4cff7a, 8, { speed: 2.5, up: 3, life: 0.6 });
  }

  netNestCleared(slot, i) {
    const m = this.missions[slot];
    if (!m || m.type !== 'nests') return;
    const n = m.nestList[i];
    if (!n || n.cleared) return;
    n.cleared = true;
    m.cleared = m.nestList.filter((x) => x.cleared).length;
    this.level.scene.remove(n.mesh);
    this.level.audio.shieldBreak();
    this.level.effects.burst(new THREE.Vector3(n.x, n.y + 1, n.z), 0x8d3bbd, 16, { speed: 4, up: 4, life: 0.8, size: 1.2 });
  }

  // v16: гість — активована точка (лампа загорілась)
  netActDone(slot, i, silent = false) {
    const m = this.missions[slot];
    if (!m || !m.points) return;
    const p = m.points[i];
    if (!p || p.done) return;
    const cfg = ACT_CFG[m.type];
    p.done = true;
    m.activated = m.points.filter((x) => x.done).length;
    p.lamp.material.color.set(cfg.color);
    if (!silent) {
      // гість: кожна активована точка — чекпойнт; фінальний джингл дасть netMissionDone
      this.level.audio.checkpoint();
      this.level.effects.burst(new THREE.Vector3(p.x, p.y + 1.2, p.z), cfg.color, 14, { speed: 3.5, up: 4, life: 0.7, size: 1.1 });
    }
  }

  // v16: гість — предмет fetch-місії забрано
  netFetchTaken(slot, i, silent = false) {
    const m = this.missions[slot];
    if (!m || !m.items) return;
    const it = m.items[i];
    if (!it || it.taken) return;
    it.taken = true;
    m.found = m.items.filter((x) => x.taken).length;
    this.level.scene.remove(it.mesh);
    if (!silent) {
      this.level.audio.pickup();
      this.level.effects.burst(new THREE.Vector3(it.x, it.y + 0.8, it.z), FETCH_CFG[m.type].color, 8, { speed: 2.5, up: 3, life: 0.6 });
    }
  }

  netMissionDone(slot, reward, type, silent = false) {
    const m = this.missions[slot];
    if (!m || m.state === 'done') return;
    m.state = 'done';
    if (type === 'barracks') { m.hp = 0; m.destroyed = true; this._destroyBarracksVisual(m); }
    if (m.beam) { m.beam.remove(); m.beam = null; }
    if (m.zone) { this.level.scene.remove(m.zone.ring); m.zone = null; }
    if (m.dest && m.dest.ring) {
      this.level.scene.remove(m.dest.ring);
      this.level.scene.remove(m.dest.icon);
      m.dest.ring = null;
    }
    if (!silent) {
      if (reward) this.level.addCoins(reward);
      this.level.audio.mission();
      this.level.bus.emit('missionDone', m);
      // нагорода країни за зачистку складу — усім гравцям
      if (type === 'clear') this.level.game.unlockWeapon(this.level.country.weaponReward);
    } else if (type === 'clear' && this.level.country.weaponReward) {
      // mid-join: гість приєднався ПІСЛЯ зачистки складу — тихо видаємо нагороду-зброю
      // в його сейв і руки (без тосту/монет/перемикання), щоб не втратив постійну нагороду
      const w = this.level.country.weaponReward;
      const save = this.level.game.save;
      if (Array.isArray(save.weapons) && !save.weapons.includes(w)) {
        save.weapons.push(w);
        if (this.level.player) this.level.player.giveWeapon(w, false);
        this.level.game.saveGame();
      }
    }
  }

  // --- гість: дзеркальний цикл — підказки, маяки, анімації ---
  _updateMirror(dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const net = level.net;
    this.prompt = null;
    if (net) net.holdE = false;

    this._updateBeams(dt);

    const near = (x, z, r) => Math.hypot(player.pos.x - x, player.pos.z - z) < r;
    let pressE = allowControl && input.pressed('KeyE');

    for (const m of this.missions) {
      if (m.state !== 'active') continue;
      if (m.type === 'rebuild') {
        if (m.phase === 'musicians') {
          const door = level.world.barnDoorCollider;
          if (near(door.x, door.z - 1, 3.2)) {
            this.prompt = { text: t('Натисни {k} — врятуй музикантів', { k: interactKey() }), hold: false };
            if (pressE) { net.sendUse('barn'); input.justPressed.delete('KeyE'); pressE = false; }
          }
        } else if (m.phase === 'build') {
          m.dest.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.18;
          if (near(m.dest.x, m.dest.z, m.dest.r)) {
            this.prompt = { text: t('Тримай {k} — відновлюй музичний центр', { k: interactKey() }), hold: true, progress: m.buildProgress };
            net.holdE = true;
          }
        }
      } else if (m.type === 'rescue' && !m.opened) {
        const door = level.world.barnDoorCollider;
        if (near(door.x, door.z - 1, 3.2)) {
          this.prompt = { text: t('Натисни {k} — відчини хлів', { k: interactKey() }), hold: false };
          if (pressE) { net.sendUse('barn'); input.justPressed.delete('KeyE'); pressE = false; }
        }
      } else if (m.type === 'repair') {
        const rp = m.repairPoint || level.world.repairPoint;
        if (near(rp.x, rp.z, 3.6)) {
          this.prompt = {
            text: m.train
              ? t('Тримай {k} — заведи поїзд', { k: interactKey() })
              : (m.progress > 0 ? t('Тримай {k} — ремонт', { k: interactKey() }) : t('Тримай {k} — почни ремонт', { k: interactKey() })),
            hold: true, progress: m.progress,
          };
          if (net) net.holdE = true;
        }
      } else if (m.type === 'clear') {
        if (this.crateReady) {
          const wc = level.world.weaponCrate;
          if (near(wc.x, wc.z, 3.4)) {
            this.prompt = { text: t('Натисни {k} — відкрий ящик', { k: interactKey() }), hold: false };
            if (pressE) { net.sendUse('crate'); input.justPressed.delete('KeyE'); pressE = false; }
          }
        }
      } else if (m.type === 'collect') {
        for (let i = 0; i < m.crates.length; i++) {
          const c = m.crates[i];
          if (c.taken) continue;
          c.mesh.position.y = c.y + Math.abs(Math.sin(performance.now() / 400 + c.x)) * 0.12;
          if (near(c.x, c.z, 3.4)) {
            this.prompt = { text: t('🧺 Натисни {k} — забери припаси ({n}/4)', { k: interactKey(), n: m.found }), hold: false };
            if (pressE) { net.sendUse('supply', { i }); input.justPressed.delete('KeyE'); pressE = false; }
            break;
          }
        }
      } else if (m.type === 'defense' || m.type === 'fireworks') {
        m.zone.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.2;
        if (m.started && !near(m.zone.x, m.zone.z, m.zone.r)) {
          this.prompt = { text: t('🛡️ Повернись у синє коло — тримайте оборону!'), hold: false };
        }
      } else if (m.type === 'nests') {
        for (const n of m.nestList) {
          if (n.cleared) continue;
          n.pod.scale.y = 1.25 + Math.sin(performance.now() / 350 + n.x) * 0.07;
          if (near(n.x, n.z, 3.8)) {
            this.prompt = { text: t('🟣 Тримай {k} — знешкодь гніздо', { k: interactKey() }), hold: true, progress: n.progress };
            if (net) net.holdE = true;
            break;
          }
        }
      } else if (m.type === 'escort' && !m.started) {
        if (near(m.site.x, m.site.z + 2, 5)) {
          this.prompt = { text: t('🧳 Натисни {k} — забери мандрівника', { k: interactKey() }), hold: false };
          if (pressE) { net.sendUse('escort'); input.justPressed.delete('KeyE'); pressE = false; }
        }
      } else if (m.type === 'shiprescue') {
        const rides = !!(m.riderMask & (1 << net.myPid()));
        this._syncShipVisual(m, rides && (m.phase === 'sailing' || m.phase === 'returning'));
        if (m.phase === 'find') {
          m.crate.rotation.y += dt * 0.7;
          if (near(m.boards.x, m.boards.z, 3.5)) {
            this.prompt = { text: t('Натисни {k} — підібрати ящик із дошками', { k: interactKey() }), hold: false };
            if (pressE) { net.sendUse('ship', { a: 'pickup' }); input.justPressed.delete('KeyE'); pressE = false; }
          }
        } else if (m.phase === 'repair' && near(m.dock.x, m.dock.z, 4)) {
          this.prompt = { text: t('Тримай {k} — ремонтуй корабель', { k: interactKey() }), hold: true, progress: m.repairProgress };
          net.holdE = true;
        } else if (m.phase === 'board' && near(m.dock.x, m.dock.z, 5)) {
          this.prompt = { text: t('Натисни {k} — сісти на корабель', { k: interactKey() }), hold: false };
          if (pressE) { net.sendUse('ship', { a: 'board' }); input.justPressed.delete('KeyE'); pressE = false; }
        } else if (m.phase === 'rescue' && near(m.shore.x, m.shore.z, 6)) {
          this.prompt = { text: t('Тримай {k} — забрати людей', { k: interactKey() }), hold: true, progress: m.rescueProgress };
          net.holdE = true;
        } else if (m.phase === 'return-board' && near(m.shore.x, m.shore.z, 5)) {
          this.prompt = { text: t('Натисни {k} — сісти на корабель', { k: interactKey() }), hold: false };
          if (pressE) { net.sendUse('ship', { a: 'return' }); input.justPressed.delete('KeyE'); pressE = false; }
        } else if (m.phase === 'unload' && near(m.dock.x, m.dock.z, 6)) {
          this.prompt = { text: t('Тримай {k} — висадити людей', { k: interactKey() }), hold: true, progress: m.unloadProgress };
          net.holdE = true;
        }
      } else if (m.type === 'manor' && m.phase === 'rescue') {
        const target = level.world.zombieManor.hostage;
        if (near(target.x, target.z, 4) && Math.abs(player.pos.y - target.y) < 2.5) {
          this.prompt = { text: t('Тримай {k} — звільни людей', { k: interactKey() }), hold: true, progress: m.rescueProgress };
          net.holdE = true;
        }
      } else if (m.type === 'castle') {
        const dungeon = level.world.castleDungeon || m.site;
        if (m.phase === 'dungeon' && near(dungeon.x, dungeon.z, 4.5) && m.dungeonLeft > 0) {
          this.prompt = { text: t('🔒 Переможи всіх ворогів — залишилося: {n}', { n: m.dungeonLeft }), hold: false };
        } else if (m.phase === 'rescue' && near(dungeon.x, dungeon.z, 4.5)) {
          this.prompt = { text: t('Тримай {k} — звільни людей', { k: interactKey() }), hold: true, progress: m.rescueProgress };
          if (net) net.holdE = true;
        }
      } else if (m.points) {
        const cfg = ACT_CFG[m.type];
        for (const p of m.points) {
          if (p.done) continue;
          p.icon.position.y = 2.0 + Math.sin(performance.now() / 400 + p.x) * 0.15;
          if (near(p.x, p.z, 3.6)) {
            this.prompt = { text: cfg.prompt, hold: true, progress: p.progress };
            if (net) net.holdE = true;
            break;
          }
        }
      } else if (m.items) {
        const cfg = FETCH_CFG[m.type];
        m.dest.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.18;
        if (m.found < m.items.length) {
          for (let i = 0; i < m.items.length; i++) {
            const it = m.items[i];
            if (it.taken) continue;
            it.mesh.position.y = it.y + Math.abs(Math.sin(performance.now() / 400 + it.x)) * 0.14;
            if (near(it.x, it.z, 3.4)) {
              this.prompt = { text: cfg.prompt.replace('{n}', m.found).replace('{total}', m.items.length), hold: false };
              if (pressE) { net.sendUse('fitem', { slot: m.slotIndex, i }); input.justPressed.delete('KeyE'); pressE = false; }
              break;
            }
          }
        } else if (near(m.dest.x, m.dest.z, m.dest.r)) {
          this.prompt = { text: cfg.deliverPrompt, hold: true, progress: m.deliverProgress };
          if (net) net.holdE = true;
        }
      }
    }

    // цивільні: плавно до цілей зі снапшота
    if (this._civNet && this.civilians.length) {
      this.civilians.forEach((c, i) => {
        const t = this._civNet[i];
        if (!t) return;
        const dx = t[0] - c.x, dz = t[1] - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 12) { c.x = t[0]; c.z = t[1]; }
        else { c.x += dx * Math.min(1, dt * 8); c.z += dz * Math.min(1, dt * 8); }
        if (d > 0.2) c.rig.group.rotation.y = Math.atan2(-dx, -dz);
        setAnim(c.rig, ['idle', 'walk', 'run', 'cheer'][t[2]] || 'idle');
        if (t[2] === 1 || t[2] === 2) c.rig.anim.speed = t[2] === 2 ? 5 : 3.4;
        c.rig.group.position.set(c.x, level.world.groundH(c.x, c.z), c.z);
        updateRig(c.rig, dt);
      });
      // медик лікує і гостя — локально, як у соло
      const medic = this.civilians.find((c) => c.kind === 'medic');
      if (medic && player.health > 0 && player.health < player.maxHealth) {
        if (Math.hypot(medic.x - player.pos.x, medic.z - player.pos.z) < 9) {
          player.heal(3.2 * dt);
        }
      }
    }

    // мандрівник
    const esc = this.missions.find((x) => x.type === 'escort');
    if (esc && esc.traveler && esc.traveler.netT) {
      const t = esc.traveler;
      const dx = t.netT.x - t.x, dz = t.netT.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d > 12) { t.x = t.netT.x; t.z = t.netT.z; }
      else { t.x += dx * Math.min(1, dt * 8); t.z += dz * Math.min(1, dt * 8); }
      if (d > 0.3) {
        t.rig.group.rotation.y = Math.atan2(-dx, -dz);
        setAnim(t.rig, d > 1.5 ? 'run' : 'walk');
        t.rig.anim.speed = d > 1.5 ? 5 : 3.4;
      } else {
        setAnim(t.rig, 'idle');
      }
      t.rig.group.position.set(t.x, level.world.groundH(t.x, t.z), t.z);
      updateRig(t.rig, dt);
    }
  }
}
