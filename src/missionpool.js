// 🎲 Живі завдання: пул типів місій, що роздаються картам випадково (від сіда),
// тож кожна країна і кожне повторне проходження граються інакше.
// Реалізує той самий інтерфейс, що й старі Missions.
import * as THREE from 'three';
import { t, interactKey } from './i18n.js';
import { makeCivilian, updateRig, setAnim, toonMat } from './characters.js';
import { dampAngle, RNG } from './utils.js';

// назви «пристрою для ремонту» за країною — смак без зміни механіки
const REPAIR_NAMES = {
  UKR: t('радіовежу'), POL: t('генератор'), DEU: t('насосну станцію'), FRA: t('антену зв\'язку'),
  TUR: t('маяк Босфору'), EGY: t('сонячну станцію'),
};

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
  // 🎁 четвертий слот — ДОДАТКОВА місія: не блокує боса, дає бонус
  const dPool = ['collect', 'hunt', 'lights', 'defense'].filter((t) => !out.includes(t));
  out.push(dPool[rng.int(0, dPool.length - 1)]);
  return out;
}

// аліаси старих ID — щоб тести і збережені посилання працювали
const SLOT_ALIASES = { rescue: 0, tower: 1, warehouse: 2 };

export class DynamicMissions {
  constructor(level) {
    this.level = level;
    this.L = level.world.layout;
    const game = level.game;
    this.mirror = !!level.mirror;
    // у коопі гість будує місії з runIndex ХОСТА — щоб набір збігався
    const runIndex = level.runIndex !== undefined
      ? level.runIndex
      : (game.save.missionRuns && game.save.missionRuns[level.countryId]) || 0;
    // тестовий хук: примусовий набір місій
    const types = game._forceMissionSet || rollMissionSet(level.countryId, level.country.seed, runIndex);
    this.runIndex = runIndex;

    // слоти карти: A = хлів, B = вежа, C = склад, D = бонус біля села
    const sites = [
      { slot: 'A', site: this.L.rescue, beamAt: { x: this.L.rescue.x, z: this.L.rescue.z - 6 } },
      { slot: 'B', site: this.L.tower, beamAt: { x: this.L.tower.x + 4, z: this.L.tower.z + 4 } },
      { slot: 'C', site: this.L.warehouse, beamAt: { x: this.L.warehouse.x - 2, z: this.L.warehouse.z - 7.5 } },
      { slot: 'D', site: this.L.village, beamAt: { x: this.L.village.x + 8, z: this.L.village.z + 8 } },
    ];
    this.missions = types.map((type, i) => this._makeMission(type, sites[i], i));

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
    const m = {
      id: type, type, slotIndex: idx, icon: mt.icon, reward: mt.reward, horde: mt.horde,
      state: 'active', site: slotInfo.site, slot: slotInfo.slot,
    };
    m.beam = level.effects.makeBeam(slotInfo.beamAt.x, slotInfo.beamAt.z, 0x4cff7a, mt.icon);

    if (type === 'rescue') {
      m.title = t('Врятуй людей у хліві');
      m.opened = false;
      m.openedT = -1;
    } else if (type === 'repair') {
      m.title = t('Полагодь {x}', { x: REPAIR_NAMES[level.countryId] || t('радіовежу') });
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
      m.timer = 45;
      m.started = false;
      m.waveT = 0;
      m.zone = this._makeDefenseZone(m);
    } else if (type === 'hunt') {
      m.title = t('Перемож 3 елітних зомбі');
      m.killed = 0;
      m.elites = this._spawnElites(m);
    } else if (type === 'nests') {
      m.title = t('Знешкодь 3 зомбі-гнізда');
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
    }
    // 🎁 четвертий слот — додаткова місія: позначка і бонусна винагорода
    if (idx === 3) {
      m.optional = true;
      m.reward = Math.round(m.reward * 1.5);
      m.horde = Math.round(m.horde * 0.5);
    }
    return m;
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
    const rng = new RNG(level.country.seed + 333 + this.runIndex + m.slotIndex * 17);
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
    const rng = new RNG(level.country.seed + 444 + this.runIndex + m.slotIndex * 17);
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
        if (m.type === 'nests') extra = ` (${m.cleared}/3)`;
        if (m.type === 'defense' && m.started) extra = ` (${Math.ceil(m.timer)}${t('с')})`;
        if (m.type === 'escort' && m.started) extra = t(' — веди до вежі!');
        if (m.points) extra = ` (${m.activated}/${m.points.length})`;
        if (m.items) {
          extra = m.found < m.items.length ? ` (${m.found}/${m.items.length})` : t(' — неси до цілі!');
        }
      }
      const prefix = m.optional ? '⭐ ' : '';
      out.push({ icon: m.icon, title: prefix + m.title + extra, done: m.state === 'done' });
    }
    if (this.allDone && !this.bossStarted) {
      out.push({ icon: '👑', title: t('Перемоги БОСА на арені!'), done: false });
    } else if (this.bossStarted) {
      out.push({ icon: '👑', title: t('Бій з босом!'), done: false });
    }
    return out;
  }

  getMarkers() {
    const mk = [];
    for (const m of this.missions) {
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
    const count = Math.round(m.horde * ((level.country && level.country.difficulty.counts) || 1));
    if (this.pendingHorde) this.pendingHorde.count += count;
    else this.pendingHorde = { t: 5, count };
    level.bus.emit('hordeWarning', 5);
  }

  // цивільні з хліва (порятунок) — як і раніше
  spawnCivilians() {
    const { x, z } = this.L.rescue;
    const kinds = ['medic', 'granny', 'kid'];
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
        this.pendingHorde = null;
      }
    }
    // відкладені хвилі (ремонт/оборона) — черга, щоб друга не затирала першу
    for (const pw of this.pendingWaves) pw.t -= dt;
    const fired = this.pendingWaves.filter((pw) => pw.t <= 0);
    this.pendingWaves = this.pendingWaves.filter((pw) => pw.t > 0);
    for (const pw of fired) this._towerWave(pw.n, pw.onlyWalkers, pw.site);

    for (const m of this.missions) {
      if (m.state !== 'active') continue;
      this['_up_' + m.type](m, dt, input, allowControl);
    }

    // усі ОСНОВНІ місії виконані → арена боса (додаткова ⭐ не блокує)
    if (!this.allDone && this.missions.filter((m) => !m.optional).every((m) => m.state === 'done')
      && !level.zombies.hordeActive && !this.pendingHorde) {
      this.allDone = true;
      this.bossUnlocked = true;
      this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
      level.audio.bossRoar();
      level.bus.emit('bossUnlocked');
    }
    if (this.bossUnlocked && !this.bossStarted) {
      const challengers = level.players || [{ pos: player.pos, health: player.health }];
      const inArena = challengers.some((p) => p.health > 0
        && Math.hypot(p.pos.x - this.L.arena.x, p.pos.z - this.L.arena.z) < this.L.arena.r - 4);
      if (inArena) {
        this.bossStarted = true;
        if (this.bossBeam) { this.bossBeam.remove(); this.bossBeam = null; }
        level.zombies.spawnBoss(this.bossHpLeft);
        level.audio.bossRoar();
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
    if (m.type === 'collect') {
      const next = m.crates.find((c) => !c.taken);
      return next ? { x: next.x, z: next.z } : null;
    }
    if (m.type === 'nests') {
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
        this.prompt = { text: t('Натисни {k} — відчини хлів', { k: interactKey() }), hold: false };
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
        level.bus.emit('toast', t('Людей врятовано! Медик лікуватиме тебе поблизу 💚'));
      }
    }
  }

  _up_repair(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const rp = level.world.repairPoint;
    const d = Math.hypot(player.pos.x - rp.x, player.pos.z - rp.z);
    // кооп: рахуємо всіх, хто тримає E біля вежі (разом — швидше!)
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
        text: m.progress > 0 ? t('Тримай {k} — ремонт', { k: interactKey() }) : t('Тримай {k} — почни ремонт', { k: interactKey() }),
        hold: true, progress: m.progress,
      };
    }
    if (d < 3.6 || holders > 0) {
      if (holders > 0) {
        m.progress = Math.min(1, m.progress + (dt * holders) / 12);
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
          level.world.setTowerFixed();
          level.netEv('tower');
          this._complete(m.id);
          level.bus.emit('toast', t('Полагоджено! Сигнал надіслано 📡'));
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
        level.bus.emit('toast', t('🛡️ ОБОРОНА! Протримайся в зоні 45 секунд!'));
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
        this._towerWave(3 + Math.round(2 * (1 - m.timer / 45)), m.timer > 25, m.site);
      }
      if (m.timer <= 0) {
        this._complete(m.id);
        level.bus.emit('toast', t('🛡️ Зону втримано! Молодець!'));
      }
    } else {
      this.prompt = { text: t('🛡️ Повернись у синє коло — оборона на паузі!'), hold: false };
    }
  }

  _up_hunt(m) {
    const level = this.level;
    const killed = m.elites.filter((e) => e.state === 'dead' || e.gone).length;
    if (killed !== m.killed) {
      m.killed = killed;
      if (m.killed < 3) {
        level.bus.emit('toast', t('👹 Еліт переможено ({n}/3)! Наступний — за маркером', { n: m.killed }));
        level.audio.mission();
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
        this.prompt = { text: t('🟣 Тримай {k} — знешкодь гніздо', { k: interactKey() }), hold: true, progress: n.progress };
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
            level.bus.emit('toast', m.cleared < 3 ? t('🟣 Гніздо знищено ({n}/3)!', { n: m.cleared }) : t('🟣 Усі гнізда знищено!'));
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
      if (d < 3.6) this.prompt = { text: cfg.prompt, hold: true, progress: p.progress };
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
    level.audio.mission();
    level.effects.burst(new THREE.Vector3(p.x, p.y + 1.2, p.z), cfg.color, 14, { speed: 3.5, up: 4, life: 0.7, size: 1.1 });
    level.netEv('mact', m.slotIndex, m.points.indexOf(p));
    if (m.activated < cfg.n) {
      level.bus.emit('toast', cfg.stepToast.replace('{n}', m.activated).replace('{total}', cfg.n));
    } else {
      level.bus.emit('toast', cfg.doneToast);
      this._complete(m.id);
    }
  }

  // ---------- двигун «знайди та принеси» (balloon/bazaar/tomb) ----------
  _up_balloon(m, dt, input, allowControl) { this._upFetch(m, FETCH_CFG.balloon, dt, input, allowControl); }
  _up_bazaar(m, dt, input, allowControl) { this._upFetch(m, FETCH_CFG.bazaar, dt, input, allowControl); }
  _up_tomb(m, dt, input, allowControl) { this._upFetch(m, FETCH_CFG.tomb, dt, input, allowControl); }

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
    if (d < m.dest.r) this.prompt = { text: cfg.deliverPrompt, hold: true, progress: m.deliverProgress };
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
    const m = this.missions.find((x) => x.type === 'rescue');
    if (!m || m.state !== 'active' || m.opened) return;
    const door = this.level.world.barnDoorCollider;
    if (!near(door.x, door.z - 1, 3.6)) return;
    m.opened = true;
    m.openedT = 0;
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
    this.level.netEv('esc', 1);
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
      else if (m.type === 'defense') a.push(m.started ? 1 : 0, Math.round(m.timer * 10) / 10);
      else if (m.type === 'hunt') a.push(m.killed);
      else if (m.type === 'nests') {
        a.push(m.cleared);
        for (const n of m.nestList) a.push(Math.round(n.progress * 100) / 100);
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
      else if (m.type === 'repair') m.progress = a[1];
      else if (m.type === 'clear') this.crateReady = !!a[1];
      else if (m.type === 'collect') m.found = a[1];
      else if (m.type === 'defense') { m.started = !!a[1]; m.timer = a[2]; }
      else if (m.type === 'hunt') m.killed = a[1];
      else if (m.type === 'nests') {
        m.cleared = a[1];
        m.nestList.forEach((n, j) => { if (!n.cleared) n.progress = a[2 + j] || 0; });
      } else if (m.type === 'escort') {
        if (a[1] && !m.started) { m.started = true; if (!m.traveler) this._spawnTraveler(m); }
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
    const m = this.missions.find((x) => x.type === 'rescue');
    if (m) m.opened = true;
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
      this.level.audio.mission();
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
      if (m.type === 'rescue' && !m.opened) {
        const door = level.world.barnDoorCollider;
        if (near(door.x, door.z - 1, 3.2)) {
          this.prompt = { text: t('Натисни {k} — відчини хлів', { k: interactKey() }), hold: false };
          if (pressE) { net.sendUse('barn'); input.justPressed.delete('KeyE'); pressE = false; }
        }
      } else if (m.type === 'repair') {
        const rp = level.world.repairPoint;
        if (near(rp.x, rp.z, 3.6)) {
          this.prompt = {
            text: m.progress > 0 ? t('Тримай {k} — ремонт', { k: interactKey() }) : t('Тримай {k} — почни ремонт', { k: interactKey() }),
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
      } else if (m.type === 'defense') {
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
