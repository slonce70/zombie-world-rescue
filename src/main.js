// Головний модуль: state machine (глобус ↔ рівень), цикл гри, збереження
import * as THREE from 'three';
import { Input } from './input.js';
import { AudioMan } from './audio.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Zombies } from './zombies.js';
import { Missions } from './missions.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Shop } from './shop.js';
import { Globe } from './globe.js';
import { Bus, RNG } from './utils.js';
import { COUNTRIES, CAMPAIGN_ORDER, getBiome } from './countries.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Progress, DailyQuests, PASS_REWARDS, PASS_MAX_LEVEL, xpForLevel, XP_VALUES } from './progress.js';
import { Megabox, Pet, Vehicles, Gadgets, GADGETS } from './extras.js';
import { StormMode } from './storm.js';
import { HERO_SKINS, DANCES, TRACERS } from './characters.js';

const SAVE_KEY = 'zr-save-v1';
// тримати в синхроні з version.json — бампити при кожному релізі
const APP_VERSION = 5;

const QUALITY_MODES = ['auto', 'high', 'fast'];
const QUALITY_LABELS = { auto: 'Авто', high: 'Гарна', fast: 'Швидка' };
const TIPS = [
  'Тримай Shift, щоб бігти від орди!',
  'Гранати (G) вибухають і червоні бочки — ланцюгова реакція!',
  'Зазирай у будинки з відчиненими дверима — там лут. Але обережно…',
  'Золотий зомбі ⭐ тікає від тебе. Дожени — отримаєш джекпот!',
  'Батути 🔵 закидають на дахи. Там сховані скарби!',
  'Медик з хліва лікує тебе, коли стоїш поруч 💚',
  'Хедшот робить подвійну шкоду. Цілься в голову!',
  'Дробовик — король ближнього бою. Клавіша 3!',
  'На льоду ковзько — гальмуй заздалегідь! ⛸',
  'Комбо-серії вбивств дають бонусні монети 🔥',
  'Шукай аеродропи 🪂 — там навіть БАЗУКА буває!',
  'Клавіша V — подивись на свого героя збоку!',
  'Щит щитоносця 🛡 не проб’єш у лоб — обійди ззаду або зламай!',
  'У магазині (B) є нова зброя, бронежилет і шолом!',
  'Світні кулі — підсилення: ⚡швидкість, 💪лють, 🛡бульбашка, 🧲магніт!',
  'Бронежилет 🦺 поглинає шкоду — поповнюй пластинами!',
  'Снайперка 🎯 пробиває трьох зомбі наскрізь — шикуй їх у чергу!',
  'Смаколики 🥐 на столиках повертають здоров’я!',
  'Шукай 🦙 МЕГАБОКС — фіолетовий промінь видно здалеку!',
  'Клавіша N — переможний танець. Спробуй після боса! 💃',
  'Самокат 🛴 збиває зомбі на повній швидкості!',
  'Гаджет (F) обирається в Гардеробі: щит, відновлення, батут чи барикада! 🧰',
  'Барикаду 🧱 можна розстріляти або забрати назад (E)',
  'Песик Дружок 🐶 збирає монети і чує сюрпризи в будинках',
  'Виконуй щоденні завдання 📅 — монети й зірковий досвід!',
  'Грай у ⛈️ ШТОРМ після звільнення країни — там рекорди!',
  'Права кнопка миші — оптика снайперки 🔭',
  'Броньовик 🦾 у залізному нагруднику — цілься в ГОЛОВУ!',
  'Зомбі-стрілець 🔫 б\'є здалеку — ховайся за будинки!',
  'Базука 🚀 тепер НАЙСИЛЬНІША зброя — бережи ракети для товстунів!',
  'На самокаті: W — газ, S — гальмо, A/D — кермо 🛴',
];

class Game {
  constructor() {
    this.params = new URLSearchParams(location.search);
    this.testMode = this.params.has('test');
    this.seed = parseInt(this.params.get('seed') || '1377', 10);

    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 1.5 });
    this.renderer.setSize(innerWidth, innerHeight);
    this.pixelRatio = Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // оновлюємо тіні вручну через кадр
    this._shadowFrame = 0;
    this._lowFpsSec = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.input = new Input(canvas);
    this.audio = new AudioMan();
    if (this.params.has('mute') || this.testMode) this.audio.setMuted(true);
    this.save = this._loadSave();
    if (this.params.has('fresh')) this.save = this._newSave();
    this.progress = new Progress(this);
    this.quests = new DailyQuests(this);

    this.hud = new HUD(this);
    this.shop = new Shop(this);
    this.globe = new Globe(this);
    this.touch = isTouchDevice() ? new TouchControls(this) : null;
    if (this.touch) {
      const startH2 = document.querySelector('#overlay-start h2');
      if (startH2) startH2.textContent = '👆 ТОРКНИСЬ, ЩОБ ГРАТИ';
    }

    this.state = 'loading';
    this.level = null;
    this.paused = false;
    this.victoryShown = false;
    this.deathT = -1;
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsN = 0;
    this._musT = 0;

    this.input.onUserGesture = () => {
      this.audio.ensure();
      if (this.audio.mode === null) {
        this.audio.setMode(this.state === 'globe' ? 'globe' : 'calm');
      }
    };
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'level' && !this.shop.isOpen
        && this.deathT < 0 && !this.victoryShown && !this.testMode
        && !document.getElementById('overlay-start').classList.contains('show')) {
        this.showPause();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && this.state === 'level' && this.deathT < 0 && !this.victoryShown && !this.paused) {
        this.shop.toggle();
      }
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.hud.toast(this.audio.muted ? '🔇 Звук вимкнено' : '🔊 Звук увімкнено');
      }
      if (e.code === 'Escape' && this.shop.isOpen) this.shop.close();
    });

    // кнопки оверлеїв
    document.getElementById('overlay-start').addEventListener('click', () => {
      this._hideOverlay('overlay-start');
      this.audio.ensure();
      this.audio.setMode('calm');
      this.input.request();
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.paused = false;
      this._hideOverlay('overlay-pause');
      this.audio.click();
      this.input.request();
    });
    document.getElementById('btn-pause-globe').addEventListener('click', () => {
      this.paused = false;
      this._hideOverlay('overlay-pause');
      this.endLevel();
    });
    document.getElementById('btn-victory-globe').addEventListener('click', () => {
      this._hideOverlay('overlay-victory');
      this.endLevel();
    });
    // панелі глобуса: пасс, завдання, гардероб, шторм
    for (const el of document.querySelectorAll('.panel-close')) {
      el.addEventListener('click', () => {
        this._hideOverlay(el.dataset.close);
        this.audio.click();
      });
    }
    document.getElementById('btn-pass').addEventListener('click', () => {
      this.renderPassPanel();
      this._showOverlay('overlay-pass');
      this.audio.click();
    });
    document.getElementById('btn-quests').addEventListener('click', () => {
      this.renderQuestsPanel();
      this._showOverlay('overlay-quests');
      this.audio.click();
    });
    document.getElementById('btn-wardrobe').addEventListener('click', () => {
      this.renderWardrobe();
      this._showOverlay('overlay-wardrobe');
      this.audio.click();
    });
    document.getElementById('btn-storm').addEventListener('click', () => this.startStorm());
    document.getElementById('btn-storm-retry').addEventListener('click', () => {
      this._hideOverlay('overlay-storm-end');
      const c = this.level ? this.level.countryId : null;
      this.endLevel();
      this.startStorm(c);
    });
    document.getElementById('btn-storm-globe').addEventListener('click', () => {
      this._hideOverlay('overlay-storm-end');
      this.endLevel();
    });

    // перемикач якості
    document.getElementById('btn-quality').addEventListener('click', () => {
      const i = QUALITY_MODES.indexOf(this.save.quality || 'auto');
      this.save.quality = QUALITY_MODES[(i + 1) % QUALITY_MODES.length];
      this.saveGame();
      this._applyQuality();
      this.audio.click();
    });
    this._applyQuality();

    window.addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.globe.onResize();
      if (this.level) {
        this.level.player.camera.aspect = innerWidth / innerHeight;
        this.level.player.camera.updateProjectionMatrix();
      }
    });

    this.clock = new THREE.Clock();
    window.__game = this;
    this._boot();
  }

  _newSave() {
    return {
      coins: 50, upgrades: {}, liberated: {}, weapons: [], records: {},
      xp: 0, skins: ['classic'], dances: ['shuffle'], tracers: ['classic'],
      activeSkin: 'classic', activeDance: 'shuffle', activeTracer: 'classic',
      gadgetsOwned: [], activeGadget: null, megaPity: 0, quests: null, stormBest: {},
    };
  }

  _loadSave() {
    const defaults = this._newSave();
    let out = defaults;
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        out = Object.assign(defaults, s);
        // вкладені об'єкти і списки могли прийти зі старого сейва неповними
        if (!Array.isArray(out.gadgetsOwned)) out.gadgetsOwned = [];
        // міграція зі старої системи витратних гаджетів: заряди → відкриття назавжди
        if (out.gadgets) {
          if (out.gadgets.tramp > 0 && !out.gadgetsOwned.includes('tramp')) out.gadgetsOwned.push('tramp');
          if (out.gadgets.wall > 0 && !out.gadgetsOwned.includes('wall')) out.gadgetsOwned.push('wall');
          delete out.gadgets;
        }
        if (out.activeGadget && !out.gadgetsOwned.includes(out.activeGadget)) out.activeGadget = null;
        if (!out.activeGadget && out.gadgetsOwned.length) out.activeGadget = out.gadgetsOwned[0];
        if (!Array.isArray(out.skins) || !out.skins.length) out.skins = ['classic'];
        if (!Array.isArray(out.dances) || !out.dances.length) out.dances = ['shuffle'];
        if (!Array.isArray(out.tracers) || !out.tracers.length) out.tracers = ['classic'];
        if (!out.skins.includes(out.activeSkin)) out.activeSkin = 'classic';
        if (!out.dances.includes(out.activeDance)) out.activeDance = 'shuffle';
        out.stormBest = out.stormBest || {};
      }
    } catch (e) { /* зіпсований сейв — почнемо заново */ }
    // міграція: зброя за вже звільнені країни (старі сейви без weapons)
    for (const id of Object.keys(out.liberated || {})) {
      const w = COUNTRIES[id] && COUNTRIES[id].weaponReward;
      if (w && !out.weapons.includes(w)) out.weapons.push(w);
    }
    return out;
  }

  saveGame() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ }
  }

  _applyQuality() {
    const q = this.save.quality || 'auto';
    document.getElementById('btn-quality').textContent = `⚙️ Якість: ${QUALITY_LABELS[q]}`;
    if (q === 'fast') this.pixelRatio = 1.0;
    else if (q === 'high') this.pixelRatio = Math.min(devicePixelRatio, 1.75);
    else this.pixelRatio = Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  _qualityWorldOpts() {
    const q = this.save.quality || 'auto';
    return q === 'fast'
      ? { shadow: 1024, snow: 160 }
      : { shadow: 2048, snow: 380 };
  }

  async _boot() {
    try {
      await this.globe.load();
    } catch (e) {
      console.error('Не вдалося завантажити карту країн', e);
    }
    this._hideOverlay('overlay-loading');
    this.state = 'globe';
    this._showGlobeUI(true);
    this._initVersionCheck();
    this.renderer.setAnimationLoop(() => this._frame());
    const c = this.params.get('country');
    if (c && COUNTRIES[c]) this.startLevel(c);
  }

  _showGlobeUI(show) {
    document.getElementById('globe-ui').style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('in-level', !show);
    if (show) {
      document.getElementById('liberated-count').textContent =
        Object.keys(this.save.liberated).length;
      // бейджі: рівень пасса і незавершені завдання дня
      const passBadge = document.getElementById('pass-badge');
      passBadge.textContent = `⭐${this.progress.level}`;
      passBadge.classList.add('show');
      const qLeft = this.quests.list.filter((q) => !q.done).length;
      const qBadge = document.getElementById('quest-badge');
      qBadge.textContent = qLeft;
      qBadge.classList.toggle('show', qLeft > 0);
      // шторм доступний після першої звільненої країни
      const anyLib = Object.keys(this.save.liberated).length > 0;
      document.getElementById('btn-storm').classList.toggle('locked', !anyLib);
      if (this._newVersion) this._onNewVersion(this._newVersion);
    }
  }

  // ---------- панелі глобуса ----------
  renderPassPanel() {
    const lvl = this.progress.level;
    const frac = this.progress.levelFrac();
    const need = lvl < PASS_MAX_LEVEL ? xpForLevel(lvl) : 0;
    document.getElementById('pass-progress').innerHTML = lvl >= PASS_MAX_LEVEL
      ? `⭐ Рівень ${lvl} — МАКСИМУМ! Ти зірка! 🏆`
      : `⭐ Рівень ${lvl} · до наступного: ${Math.round(frac * need)}/${need} XP
         <div class="xpbar"><div style="width:${Math.round(frac * 100)}%"></div></div>`;
    let html = '';
    for (let n = 2; n <= PASS_MAX_LEVEL; n++) {
      const r = PASS_REWARDS[n];
      if (!r) continue;
      const got = lvl >= n;
      const cls = got ? 'got' : (n === lvl + 1 ? 'current' : 'locked');
      html += `<div class="pass-row ${cls}">
        <div class="pass-lvl">${n}</div>
        <div class="pass-ico">${r.icon}</div>
        <div class="pass-name">${r.name}</div>
        <div class="pass-state">${got ? '✅' : '🔒'}</div>
      </div>`;
    }
    document.getElementById('pass-track').innerHTML = html;
  }

  renderQuestsPanel() {
    this.quests.ensureToday();
    let html = '';
    for (const q of this.quests.list) {
      const pct = Math.round((q.progress / q.target) * 100);
      html += `<div class="quest-row ${q.done ? 'done' : ''}">
        <div class="quest-title">${q.icon} ${q.title} ${q.done ? '✅' : ''}</div>
        <div class="quest-reward">🪙 120 монет · ⭐ 40 XP</div>
        <div class="quest-bar"><div style="width:${pct}%"></div></div>
        <div class="quest-prog">${q.progress} / ${q.target}</div>
      </div>`;
    }
    document.getElementById('quest-list').innerHTML = html;
  }

  renderWardrobe() {
    const save = this.save;
    const card = (id, meta, owned, equipped, kind) => `
      <div class="ward-card ${equipped ? 'equipped' : ''} ${owned ? '' : 'locked'}" data-kind="${kind}" data-id="${id}">
        <div class="ward-ico">${meta.icon}</div>
        <div class="ward-name">${meta.name}</div>
        <div class="ward-tag">${equipped ? '✅ Одягнено' : owned ? 'Натисни — обрати' : '🔒 ' + (meta.desc || '')}</div>
      </div>`;
    let html = '<div class="ward-section">Скіни героя</div><div class="ward-grid">';
    for (const [id, meta] of Object.entries(HERO_SKINS)) {
      html += card(id, meta, save.skins.includes(id), save.activeSkin === id, 'skin');
    }
    html += '</div><div class="ward-section">Танці (N)</div><div class="ward-grid">';
    for (const [id, meta] of Object.entries(DANCES)) {
      html += card(id, meta, save.dances.includes(id), save.activeDance === id, 'dance');
    }
    html += '</div><div class="ward-section">Гаджет — береш ОДИН із собою (F)</div><div class="ward-grid">';
    for (const [id, meta] of Object.entries(GADGETS)) {
      const meta2 = { icon: meta.icon, name: meta.name, desc: `${meta.desc} (купи в магазині)` };
      html += card(id, meta2, save.gadgetsOwned.includes(id), save.activeGadget === id, 'gadget');
    }
    html += '</div><div class="ward-section">Сліди куль</div><div class="ward-grid">';
    for (const [id, meta] of Object.entries(TRACERS)) {
      html += card(id, meta, save.tracers.includes(id), save.activeTracer === id, 'tracer');
    }
    html += '</div>';
    const root = document.getElementById('wardrobe-content');
    root.innerHTML = html;
    root.querySelectorAll('.ward-card:not(.locked)').forEach((el) => {
      el.addEventListener('click', () => {
        const { kind, id } = el.dataset;
        if (kind === 'skin') save.activeSkin = id;
        else if (kind === 'dance') save.activeDance = id;
        else if (kind === 'gadget') save.activeGadget = id;
        else if (kind === 'tracer') {
          save.activeTracer = id;
          if (this.level) this.level.effects.tracerStyle = id === 'classic' ? null : id;
        }
        this.saveGame();
        this.audio.purchase();
        this.renderWardrobe();
      });
    });
  }

  // ---------- шторм ----------
  startStorm(countryId = null) {
    const lib = Object.keys(this.save.liberated);
    if (!lib.length) {
      this.audio.denied();
      this.hud.toast('⛈️ Шторм відкриється після звільнення першої країни!');
      return;
    }
    // найсвіжіша звільнена країна кампанії
    if (!countryId) {
      for (let i = CAMPAIGN_ORDER.length - 1; i >= 0; i--) {
        if (this.save.liberated[CAMPAIGN_ORDER[i]]) { countryId = CAMPAIGN_ORDER[i]; break; }
      }
    }
    this.audio.click();
    this.startLevel(countryId || 'UKR', { storm: true });
  }

  // ---------- автооновлення ----------
  // Браузер (особливо відновлена стара вкладка) може тримати застарілу збірку.
  // Періодично звіряємо version.json із сервера і перезавантажуємось на глобусі.
  _initVersionCheck() {
    const tag = document.getElementById('version-tag');
    if (tag) tag.textContent = 'v' + APP_VERSION;
    if (this.params.has('test')) return;
    const check = async () => {
      try {
        const res = await fetch('./version.json', { cache: 'no-store' });
        const data = await res.json();
        if (data && data.v > APP_VERSION) this._onNewVersion(data.v);
      } catch (e) { /* офлайн — спробуємо пізніше */ }
    };
    check();
    setInterval(check, 5 * 60 * 1000);
  }

  _onNewVersion(v) {
    this._newVersion = v;
    // посеред рівня не перезавантажуємо — гравець втратить прогрес місії
    if (this.state !== 'globe') return;
    let alreadyTried = false;
    try { alreadyTried = sessionStorage.getItem('zr-reload-for') === String(v); } catch (e) { /* ignore */ }
    if (!alreadyTried) {
      try { sessionStorage.setItem('zr-reload-for', String(v)); } catch (e) { /* ignore */ }
      location.reload();
      return;
    }
    // перезавантаження не допомогло (кеш ще тримає старі файли) — кажемо гравцю
    const tag = document.getElementById('version-tag');
    if (tag) tag.textContent = `🔄 Вийшло оновлення v${v}! Онови сторінку: Ctrl(⌘)+Shift+R`;
  }

  _showOverlay(id) { document.getElementById(id).classList.add('show'); }
  _hideOverlay(id) { document.getElementById(id).classList.remove('show'); }

  // ---------- рівень ----------
  async startLevel(countryId, opts = {}) {
    if (this._startingLevel) return;
    this._startingLevel = true;
    try {
      await this._buildLevel(countryId, opts);
    } catch (e) {
      // не блокуємо гру назавжди — повертаємось на глобус
      console.error('Помилка побудови рівня', e);
      this.level = null;
      this.state = 'globe';
      this._showGlobeUI(true);
      this.hud.toast('😵 Ой! Щось пішло не так. Спробуй ще раз.');
    } finally {
      this._hideOverlay('overlay-level-loading');
      this._startingLevel = false;
    }
  }

  async _buildLevel(countryId, opts = {}) {
    const country = COUNTRIES[countryId] || COUNTRIES.UKR;
    const isStorm = !!opts.storm;
    // екран завантаження рівня з порадою
    document.getElementById('ll-title').textContent = isStorm
      ? `⛈️ ШТОРМ: ${country.name.toUpperCase()}`
      : `${country.flag} ${country.name.toUpperCase()}`;
    document.getElementById('ll-tip').textContent = '💡 ' + TIPS[Math.floor(Math.random() * TIPS.length)];
    this._showOverlay('overlay-level-loading');
    this._showGlobeUI(false);
    // даємо браузеру намалювати екран завантаження
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const level = {
      game: this,
      countryId,
      country,
      scene: new THREE.Scene(),
      bus: new Bus(),
      rng: new RNG(country.seed + 1),
      audio: this.audio,
      stats: { kills: 0, shotsFired: 0, shotsHit: 0, coinsEarned: 0, deaths: 0, time: 0 },
      combo: { n: 0, t: 0, best: 0 },
      bossDefeated: false,
    };
    level.world = new World(level.scene, country.seed, getBiome(countryId), country.map, this._qualityWorldOpts());
    level.effects = new Effects(level.scene, level.world, this.audio);
    level.addCoins = (n) => {
      this.save.coins += n;
      level.stats.coinsEarned += n;
      this.quests.onEvent('coins', { n });
      this.saveGame();
    };
    level.player = new Player(level);
    // застосовуємо куплені прокачування
    const u = this.save.upgrades;
    level.player.maxHealth = 100 + (u.maxhp || 0) * 25;
    level.player.health = level.player.maxHealth;
    level.player.speedMult = (1 + (u.speed || 0) * 0.1) * (u.sneakers ? 1.08 : 1);
    level.player.damageMult = 1 + (u.damage || 0) * 0.15;
    // спорядження: бронежилет, шолом, кросівки (видно на герої)
    level.player.applyGear(u);
    if ((u.vest || 0) > 0) level.player.armor = level.player.maxArmor;
    // зброя, здобута в попередніх країнах
    for (const w of this.save.weapons) level.player.giveWeapon(w, false);
    if (this.save.weapons.includes('bazooka')) level.player.addRockets(2);

    level.zombies = new Zombies(level, this.seed + 2);
    if (isStorm) {
      // ⛈️ шторм: без місій, тільки хвилі і коло
      level.storm = new StormMode(level);
      level.missions = level.storm;
    } else {
      level.zombies.populate();
      level.missions = new Missions(level);
    }
    // 🦙🐶🛴🦘 іграшки рівня
    level.megabox = new Megabox(level, isStorm ? 8 : null, isStorm ? 8 : null);
    level.vehicles = new Vehicles(level);
    level.gadgets = new Gadgets(level);
    level.pet = (this.save.upgrades.dog || 0) > 0 ? new Pet(level) : null;
    level.effects.tracerStyle = this.save.activeTracer === 'classic' ? null : this.save.activeTracer;

    // лут і зомбі-сюрпризи всередині будинків (вічний лут — не зникає)
    for (const ls of level.world.lootSpots) {
      if (ls.type === 'coins') {
        for (let i = 0; i < 5; i++) {
          level.effects.spawnCoin(ls.x + (Math.random() - 0.5) * 0.8, ls.z + (Math.random() - 0.5) * 0.8, 10, 9999, ls.y);
        }
      } else {
        level.effects.spawnPickup(ls.x, ls.z, ls.type, 9999, ls.y);
      }
    }
    for (const sp of level.world.surpriseSpots) level.zombies.spawnSurprise(sp.x, sp.z);

    // приколи карти: бочки, м'яч, тварини, аеродроп
    const fun = country.map.fun || {};
    for (const [bx, bz] of fun.barrels || []) level.effects.addBarrel(bx, bz);
    if (fun.barrels && fun.barrels.length) level.world._buildGrid();
    if (fun.soccerBall) level.effects.addBall(fun.soccerBall.x, fun.soccerBall.z);
    if (fun.animals) level.effects.addAnimals(fun.animals);
    level.effects.onAirdrop = () => {
      this.hud.toast(this.save.weapons.includes('bazooka')
        ? '🪂 Аеродроп! Припаси падають поблизу — шукай блакитний промінь!'
        : '🪂 Аеродроп! Кажуть, у таких ящиках буває БАЗУКА… 🚀');
      this.audio.mission();
    };
    // особливий вміст аеродропа
    level.effects.rollAirdropSpecial = () => {
      if (!this.save.weapons.includes('bazooka')) return 'bazooka';
      const roll = Math.random();
      if (roll < 0.3) return 'rocket';
      if (roll < 0.5) return 'armor';
      if (roll < 0.75) return ['speed', 'rage', 'bubble', 'magnet'][Math.floor(Math.random() * 4)];
      return 'grenade';
    };

    level.effects.getPlayerPos = () => level.player.pos;
    level.effects.getMagnetActive = () => level.player.buffs.magnet > 0;
    level.effects.zombieHitTest = (origin, dir, maxD) => level.zombies.hitTest(origin, dir, maxD);
    const BUFF_INFO = {
      speed: { dur: 20, msg: '⚡ ТУРБО-ШВИДКІСТЬ на 20 секунд!' },
      rage: { dur: 15, msg: '💪 ПОДВІЙНА ШКОДА на 15 секунд!' },
      bubble: { dur: 8, msg: '🛡 НЕВРАЗЛИВІСТЬ на 8 секунд!' },
      magnet: { dur: 25, msg: '🧲 МАГНІТ МОНЕТ на 25 секунд!' },
    };
    level.effects.onPickup = (type, value) => {
      if (type !== 'coin') this.quests.onEvent('pickup');
      if (type === 'coin') {
        level.addCoins(value);
        this.audio.coin();
      } else if (type === 'medkit') {
        if (level.player.heal(30)) this.hud.toast('🩹 +30 здоров’я');
        this.audio.heal();
      } else if (type === 'grenade') {
        level.player.grenades++;
        this.audio.pickup();
        this.hud.toast('💣 +1 граната (G — кинути)');
      } else if (type === 'food') {
        level.player.heal(15);
        this.audio.heal();
        this.hud.toast(`😋 Смачний ${level.country.food || 'смаколик'}! +15 здоров’я`);
      } else if (type === 'armor') {
        level.player.addArmor(value || 40);
        this.audio.pickup();
        this.hud.toast('🛡️ +40 броні!');
      } else if (type === 'rocket') {
        level.player.addRockets(value || 2);
        this.audio.pickup();
        this.hud.toast('🧨 +2 ракети для базуки!');
      } else if (type === 'bazooka') {
        this.unlockWeapon('bazooka');
        level.player.addRockets(3);
        this.audio.powerup();
        this.hud.banner('🚀 БАЗУКА!', 'Клавіша 7 — рознеси їх усіх! (+3 ракети)');
      } else if (BUFF_INFO[type]) {
        level.player.buffs[type] = BUFF_INFO[type].dur;
        this.audio.powerup();
        this.hud.toast(BUFF_INFO[type].msg);
      } else {
        level.player.addAmmo(30);
        this.audio.pickup();
        this.hud.toast('🔋 +30 набоїв');
      }
    };
    // вибух (граната 135, ракета базуки 50): шкода зомбі по радіусу
    level.effects.onExplosion = (x, y, z, r, baseDmg = 135) => {
      // вибух трощить і барикади поблизу
      for (const w of [...level.gadgets.walls]) {
        if (Math.hypot(w.x - x, w.z - z) < r) level.gadgets.damageWall(w, baseDmg);
      }
      for (const zb of [...level.zombies.list]) {
        if (zb.state === 'dead') continue;
        const d = Math.hypot(zb.x - x, zb.z - z);
        if (d < r) {
          const rage = level.player.buffs.rage > 0 ? 2 : 1;
          const dmg = Math.round(baseDmg * (1 - (d / r) * 0.55) * level.player.damageMult * rage);
          level.effects.damageNumber(new THREE.Vector3(zb.x, zb.y + zb.rig.height * 0.8, zb.z), dmg, false);
          zb.damage(dmg, null, false);
        }
      }
      const pd = Math.hypot(level.player.pos.x - x, level.player.pos.z - z);
      if (pd < r + 3) level.player.camShake = Math.max(level.player.camShake, 1.2);
    };
    // сніжки сніговиків
    level.effects.onProjectileHit = (dmg, x, z) => {
      level.player.takeDamage(dmg, x, z);
    };

    this.hud.wire(level.bus);
    level.bus.on('playerDied', () => this._onPlayerDied());
    level.bus.on('bossDied', () => this._onBossDied());
    level.bus.on('hordeEnd', () => {
      level.addCoins(60);
      this.progress.addXp(XP_VALUES.horde);
      this.quests.onEvent('horde');
    });
    // ⭐ зірковий досвід і щоденні завдання
    level.bus.on('zombieKilled', (z) => {
      const big = z.type === 'tank' || z.type === 'shield' || z.type === 'snowman' || z.type === 'spitter';
      this.progress.addXp(z.golden ? XP_VALUES.killGolden : z.type === 'boss' ? XP_VALUES.killBoss : big ? XP_VALUES.killBig : XP_VALUES.kill);
      this.quests.onEvent('kill', { weapon: level.player.cur });
      if (z.golden) this.quests.onEvent('golden');
      if (z.type === 'boss' && !level.storm) this.quests.onEvent('boss');
    });
    level.bus.on('missionDone', () => this.progress.addXp(XP_VALUES.mission));
    level.bus.on('hitmarker', (crit) => { if (crit) this.quests.onEvent('headshot'); });
    level.bus.on('shieldBroken', () => this.quests.onEvent('shield'));
    level.bus.on('megaboxOpened', () => {
      this.progress.addXp(XP_VALUES.megabox);
      this.quests.onEvent('megabox');
    });
    level.bus.on('dance', () => this.quests.onEvent('dance'));
    // комбо за серії вбивств
    level.bus.on('zombieKilled', () => {
      if (level.bossDefeated) return; // «здача» після перемоги не рахується
      const c = level.combo;
      c.n++;
      c.t = 3.2;
      if (c.n > c.best) c.best = c.n;
      if (c.n >= 3) this.hud.comboPop(c.n);
      if (c.n % 5 === 0) {
        const bonus = c.n * 2;
        level.addCoins(bonus);
        this.audio.comboDing(c.n / 5);
        this.hud.toast(`🔥 КОМБО x${c.n}! +${bonus} монет`);
      }
    });
    level.bus.on('bossStart', () => {
      document.getElementById('boss-name').textContent = country.boss.name;
    });

    this.level = level;
    this.state = 'level';
    this.victoryShown = false;
    this.paused = false;
    this.deathT = -1;
    this.hud.showBoss(false);

    if (this.testMode) {
      this.audio.setMode('calm');
    } else {
      this._showOverlay('overlay-start');
    }
    this.hud.banner(`${country.flag} ${country.name.toUpperCase()}`, country.banner, 4.5);
  }

  // 🐶 купили песика — з'являється просто в поточному рівні
  spawnPet() {
    if (this.level && !this.level.pet) this.level.pet = new Pet(this.level);
  }

  // 🦙 нагорода Мегабокса: pity гарантує круте після 2 невдач
  openMegaboxReward(x, z) {
    const save = this.save;
    const level = this.level;
    const unownedSkins = ['frog', 'super'].filter((id) => !save.skins.includes(id));
    const unownedDances = ['jump', 'chicken'].filter((id) => !save.dances.includes(id));
    const hasCosmetic = unownedSkins.length + unownedDances.length > 0;
    let roll = Math.random();
    if (this._megaForce !== undefined) { roll = this._megaForce; this._megaForce = undefined; }
    let title, sub;
    if (hasCosmetic && (save.megaPity >= 2 || roll < 0.45)) {
      save.megaPity = 0;
      const pickSkin = unownedSkins.length && (!unownedDances.length || roll < 0.25);
      if (pickSkin) {
        const id = unownedSkins[0];
        save.skins.push(id);
        title = `${HERO_SKINS[id].icon} НОВИЙ СКІН!`;
        sub = `«${HERO_SKINS[id].name}» — одягни в Гардеробі 🎒`;
      } else {
        const id = unownedDances[0];
        save.dances.push(id);
        save.activeDance = id;
        title = `${DANCES[id].icon} НОВИЙ ТАНЕЦЬ!`;
        sub = `«${DANCES[id].name}» — натисни N і танцюй!`;
      }
    } else {
      save.megaPity = (save.megaPity || 0) + 1;
      if (roll < 0.62 || !level) {
        // фонтан монет
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          level.effects.spawnCoin(x + Math.cos(a) * (1 + Math.random() * 2.2), z + Math.sin(a) * (1 + Math.random() * 2.2), 14);
        }
        title = '💰 ФОНТАН МОНЕТ!';
        sub = 'Збирай скоріше! (наступний бокс щасливіший 😉)';
      } else if (roll < 0.83) {
        if (level) {
          level.player.grenades += 3;
          level.player.addRockets(2);
          level.player.addAmmo(120);
        }
        title = '🧨 БОЙОВИЙ НАБІР!';
        sub = '+3 гранати, +2 ракети і гора патронів!';
      } else {
        for (const k of ['speed', 'rage', 'bubble', 'magnet']) level.player.buffs[k] = 20;
        title = '🌈 УСІ ПІДСИЛЕННЯ!';
        sub = 'Швидкість, лють, бульбашка і магніт — на 20 секунд!';
      }
    }
    this.hud.banner(title, sub, 4.5);
    this.saveGame();
  }

  // нагорода-зброя за країну: видається і запам'ятовується назавжди.
  // Якщо зброя вже куплена в магазині — компенсація монетами.
  unlockWeapon(id) {
    if (!this.level) return;
    if (this.save.weapons.includes(id)) {
      this.level.addCoins(300);
      this.hud.toast('🪙 Така зброя в тебе вже є — тримай +300 монет!');
      return;
    }
    this.level.player.giveWeapon(id);
    this.save.weapons.push(id);
    this.saveGame();
  }

  endLevel() {
    if (this.level) {
      // звільняємо ресурси сцени
      this.level.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      this.renderer.renderLists.dispose();
    }
    this.level = null;
    this.state = 'globe';
    this.victoryShown = false;
    this.deathT = -1;
    this.input.exitLock();
    // прибираємо всі оверлеї рівня
    for (const id of ['overlay-death', 'overlay-pause', 'overlay-victory', 'overlay-start', 'overlay-storm-end']) {
      this._hideOverlay(id);
    }
    if (this.shop.isOpen) this.shop.close();
    this.paused = false;
    this._showGlobeUI(true);
    this.audio.setMode(this.audio.ctx ? 'globe' : null);
    this.hud.showBoss(false);
  }

  _onPlayerDied() {
    this.level.stats.deaths++;
    if (this.level.storm) {
      this._endStormRun();
      return;
    }
    this.deathT = 3.5;
    this.audio.defeat();
    this._showOverlay('overlay-death');
  }

  _endStormRun() {
    const level = this.level;
    if (!level || level.storm.over) return;
    const res = level.storm.results();
    level.storm.over = true;
    this.audio.defeat();
    this.input.exitLock();
    // рекорд по країні
    const prev = this.save.stormBest[level.countryId];
    const isRecord = !prev || res.wave > prev.wave || (res.wave === prev.wave && res.time > prev.time);
    if (isRecord) this.save.stormBest[level.countryId] = { wave: res.wave, time: res.time };
    this.progress.addXp(20 + res.wave * 5);
    this.saveGame();
    const rec = isRecord && prev ? ' <span class="record-badge">🏆 НОВИЙ РЕКОРД!</span>' : '';
    const best = this.save.stormBest[level.countryId];
    document.getElementById('storm-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🌀</span><span class="stat-name">Хвиль відбито${rec}</span><span class="stat-val">${res.wave - 1}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">Протримався</span><span class="stat-val">${Math.floor(res.time / 60)}:${String(res.time % 60).padStart(2, '0')}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">Зомбі переможено</span><span class="stat-val">${res.kills}</span></div>
      <div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">Рекорд (${this.level.country.name})</span><span class="stat-val">хвиля ${best.wave}</span></div>`;
    this._showOverlay('overlay-storm-end');
  }

  _onBossDied() {
    if (this.level && this.level.storm) {
      // ⛈️ міні-бос шторму: бонус і граємо далі
      this.level.addCoins(120);
      this.progress.addXp(60);
      this.hud.banner('👑 МІНІ-БОСА ПЕРЕМОЖЕНО!', '+120 монет · шторм триває!');
      this.audio.mission();
      return;
    }
    this.audio.victory();
    this.audio.setMode(null);
    this.level.bossDefeated = true;
    // решта зомбі святково "здається" — дитину ніхто не вб'є під час салюту
    for (const zb of [...this.level.zombies.list]) {
      if (zb.state !== 'dead') zb.damage(99999, null, false);
    }
    const { x, z } = this.level.world.layout.arena;
    const eff = this.level.effects;
    const world = this.level.world;
    // салют
    let burstN = 0;
    const burstIv = setInterval(() => {
      if (!this.level || burstN++ > 10) { clearInterval(burstIv); return; }
      const bx = x + (Math.random() - 0.5) * 20;
      const bz = z + (Math.random() - 0.5) * 20;
      eff.burst(new THREE.Vector3(bx, world.groundH(bx, bz) + 6 + Math.random() * 6, bz),
        [0xffd23f, 0x4cff7a, 0x44ccff, 0xff5d73][burstN % 4], 14,
        { speed: 5, up: 2, life: 1.1, size: 1.4 });
    }, 220);
    setTimeout(() => this._showVictory(), 2400);
  }

  _showVictory() {
    if (!this.level || this.victoryShown) return;
    this.victoryShown = true;
    // якщо гравця встигли вдарити в момент перемоги — скасовуємо смерть
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    const country = this.level.country;
    this.save.liberated[country.id] = true;
    const s = this.level.stats;
    // рекорди країни
    const prev = this.save.records[country.id];
    const isRecord = !prev || s.time < prev.time;
    if (isRecord) {
      this.save.records[country.id] = {
        time: Math.round(s.time), kills: s.kills, deaths: s.deaths,
        combo: this.level.combo.best,
      };
    }
    this.progress.addXp(XP_VALUES.country);
    this.saveGame();
    this.globe.setLiberated();
    this.input.exitLock();
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
    document.querySelector('#overlay-victory h1').textContent = country.victoryTitle;
    document.querySelector('.victory-sub').textContent = `Ти переміг боса «${country.boss.name.replace('👑 ', '')}» і врятував країну!`;
    const recBadge = isRecord && prev ? ' <span class="record-badge">🏆 НОВИЙ РЕКОРД!</span>' : '';
    const bestLine = prev && !isRecord
      ? `<div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">Рекорд часу</span><span class="stat-val">${Math.floor(prev.time / 60)}:${String(prev.time % 60).padStart(2, '0')}</span></div>`
      : '';
    document.getElementById('victory-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">Час${recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${bestLine}
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">Зомбі переможено</span><span class="stat-val">${s.kills}</span></div>
      <div class="stat"><span class="stat-icon">🔥</span><span class="stat-name">Найкраще комбо</span><span class="stat-val">x${this.level.combo.best}</span></div>
      <div class="stat"><span class="stat-icon">🎯</span><span class="stat-name">Точність</span><span class="stat-val">${acc}%</span></div>
      <div class="stat"><span class="stat-icon">💰</span><span class="stat-name">Монет здобуто</span><span class="stat-val">${s.coinsEarned}</span></div>
      <div class="stat"><span class="stat-icon">💀</span><span class="stat-name">Смертей</span><span class="stat-val">${s.deaths}</span></div>`;
    // конфеті
    const conf = document.getElementById('confetti');
    conf.innerHTML = '';
    for (let i = 0; i < 60; i++) {
      const d = document.createElement('div');
      d.className = 'confetti-piece';
      d.style.left = Math.random() * 100 + '%';
      d.style.background = ['#ffd23f', '#4cff7a', '#44ccff', '#ff5d73', '#b086f2'][i % 5];
      d.style.animationDelay = Math.random() * 3 + 's';
      d.style.animationDuration = 2.5 + Math.random() * 2 + 's';
      conf.appendChild(d);
    }
    this._showOverlay('overlay-victory');
  }

  // ---------- цикл ----------
  _frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this._fpsAcc += dt;
    this._fpsN++;
    if (this._fpsAcc >= 1) {
      this.fps = Math.round(this._fpsN / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsN = 0;
      const fpsEl = document.getElementById('fps');
      if (this.params.has('fps') || this.testMode) {
        fpsEl.style.display = 'block';
        fpsEl.textContent = this.fps + ' FPS';
      }
      // адаптивна роздільність: довго < 48 fps → знижуємо рендер-масштаб (лише в режимі Авто)
      if ((this.save.quality || 'auto') === 'auto' && this.fps < 48 && this.state === 'level') {
        if (++this._lowFpsSec >= 3 && this.pixelRatio > 1.0) {
          this.pixelRatio = Math.max(1.0, this.pixelRatio - 0.25);
          this.renderer.setPixelRatio(this.pixelRatio);
          this.renderer.setSize(innerWidth, innerHeight);
          this._lowFpsSec = 0;
        }
      } else {
        this._lowFpsSec = 0;
      }
    }
    // тіні оновлюємо через кадр — для мультяшного стилю 30 Гц непомітно
    if ((this._shadowFrame = (this._shadowFrame + 1) % 2) === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    if (this.state === 'globe') {
      this.globe.update(dt);
      this.renderer.render(this.globe.scene, this.globe.camera);
    } else if (this.state === 'level' && this.level) {
      const blocked = this.paused || this.shop.isOpen || this.victoryShown;
      if (!blocked) {
        const alive = this.level.player.health > 0;
        const allowControl = (this.input.locked || this.testMode || this.input.touchMode)
          && this.deathT < 0 && alive;
        this.level.player.update(dt, this.input, allowControl);
        this.level.zombies.update(dt);
        this.level.missions.update(dt, this.input, allowControl);
        // іграшки: самокати, мегабокс, гаджети, песик
        this.level.vehicles.update(dt, this.input, allowControl);
        if (this.level.megabox && !this.level.megabox.done) {
          this.level.megabox.update(dt, this.input, allowControl);
        }
        this.level.gadgets.update(dt, this.input, allowControl);
        if (this.level.pet) this.level.pet.update(dt);
        this.level.world.update(dt, this.level.player.pos);
        this.level.effects.update(dt);
        this.level.stats.time += dt;
        // комбо згасає без вбивств
        if (this.level.combo.t > 0) {
          this.level.combo.t -= dt;
          if (this.level.combo.t <= 0) this.level.combo.n = 0;
        }
        this._updateMusic(dt);
        // відлік смерті
        if (this.deathT >= 0) {
          this.deathT -= dt;
          const n = Math.max(1, Math.ceil(this.deathT));
          document.getElementById('death-countdown').textContent = n;
          if (this.deathT <= 0) {
            this._hideOverlay('overlay-death');
            this.level.player.respawn();
            this.level.zombies.clearNear(this.level.world.layout.SPAWN.x, this.level.world.layout.SPAWN.z, 30);
            this.deathT = -1;
            if (!this.testMode && !this.input.locked) this._showOverlay('overlay-start');
          }
        }
      }
      this.hud.update(dt);
      this.renderer.render(this.level.scene, this.level.player.camera);
    }
    this.input.postUpdate();
  }

  _updateMusic(dt) {
    this._musT -= dt;
    if (this._musT > 0 || !this.audio.ctx) return;
    this._musT = 0.6;
    if (this.level.bossDefeated || this.victoryShown) {
      this.audio.setMode(null);
      return;
    }
    const z = this.level.zombies;
    let mode = 'calm';
    if (z.boss) mode = 'boss';
    else if (z.hordeActive) mode = 'battle';
    else {
      const p = this.level.player.pos;
      for (const zb of z.list) {
        if (zb.state !== 'dead' && zb.aggroed && Math.hypot(zb.x - p.x, zb.z - p.z) < 40) {
          mode = 'battle';
          break;
        }
      }
    }
    this.audio.setMode(mode);
  }

  showPause() {
    this.paused = true;
    this._showOverlay('overlay-pause');
  }

  // ---------- API для автотестів ----------
  get test() {
    const g = this;
    return {
      state: () => ({
        state: g.state,
        coins: g.save.coins,
        fps: g.fps,
        country: g.level ? g.level.countryId : null,
        grenades: g.level ? g.level.player.grenades : 0,
        combo: g.level ? g.level.combo.n : 0,
        liberated: Object.keys(g.save.liberated),
        player: g.level ? {
          x: g.level.player.pos.x, y: g.level.player.pos.y, z: g.level.player.pos.z,
          health: g.level.player.health, weapons: g.level.player.weapons, cur: g.level.player.cur,
          firstPerson: g.level.player.firstPerson,
          armor: g.level.player.armor, maxArmor: g.level.player.maxArmor,
          buffs: { ...g.level.player.buffs },
          rockets: g.level.player.ammo.bazooka.reserve + g.level.player.ammo.bazooka.mag,
        } : null,
        missions: g.level ? g.level.missions.missions.map((m) => ({ id: m.id, state: m.state })) : null,
        bossStarted: g.level ? g.level.missions.bossStarted : false,
        bossHp: g.level && g.level.zombies.boss ? g.level.zombies.boss.hp : null,
        zombies: g.level ? g.level.zombies.list.filter((z) => z.state !== 'dead').length : 0,
        hordeActive: g.level ? g.level.zombies.hordeActive : false,
        stats: g.level ? g.level.stats : null,
        victoryShown: g.victoryShown,
        // оновлення 4
        xp: g.save.xp,
        passLevel: g.progress.level,
        skins: [...g.save.skins],
        dances: [...g.save.dances],
        activeSkin: g.save.activeSkin,
        activeDance: g.save.activeDance,
        gadgets: { owned: [...g.save.gadgetsOwned], active: g.save.activeGadget, cd: g.level ? g.level.gadgets.cd : 0 },
        gadgetShield: g.level ? g.level.player.gadgetShield : 0,
        scoped: g.level ? g.level.player.scoped : false,
        rideSpeed: g.level ? g.level.player.rideSpeed : 0,
        megaPity: g.save.megaPity,
        quests: g.quests.list.map((q) => ({ id: q.id, ev: q.ev, progress: q.progress, target: q.target, done: q.done })),
        megabox: g.level && g.level.megabox ? { x: g.level.megabox.x, z: g.level.megabox.z, opened: g.level.megabox.opened } : null,
        pet: g.level ? !!g.level.pet : false,
        riding: g.level ? !!g.level.player.riding : false,
        emoting: g.level ? g.level.player.emoting : null,
        scooters: g.level ? g.level.vehicles.list.map((r) => ({ x: r.x, z: r.z })) : [],
        walls: g.level ? g.level.gadgets.walls.map((w) => ({ x: w.x, z: w.z, hp: w.hp })) : [],
        tramps: g.level ? g.level.gadgets.tramps.length : 0,
        jumpPads: g.level ? g.level.world.jumpPads.length : 0,
        storm: g.level && g.level.storm ? {
          wave: g.level.storm.wave, r: g.level.storm.r,
          outside: g.level.storm.isOutside(), over: g.level.storm.over,
          phase: g.level.storm.phase,
        } : null,
        stormBest: { ...g.save.stormBest },
      }),
      teleport: (x, z) => {
        const p = g.level.player;
        p.pos.set(x, g.level.world.groundH(x, z), z);
        p.vel.set(0, 0, 0);
      },
      setAim: (yaw, pitch) => {
        g.level.player.yaw = yaw;
        g.level.player.pitch = pitch;
      },
      aimAtNearestZombie: () => {
        const p = g.level.player;
        let best = null, bd = 1e9;
        for (const z of g.level.zombies.list) {
          if (z.state === 'dead') continue;
          const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
          if (d < bd) { bd = d; best = z; }
        }
        if (!best) return null;
        const dx = best.x - p.pos.x, dz = best.z - p.pos.z;
        p.yaw = Math.atan2(-dx, -dz);
        const eyeY = p.pos.y + 1.62;
        const targetY = best.y + best.rig.height * 0.55;
        p.pitch = Math.atan2(targetY - eyeY, Math.hypot(dx, dz));
        return bd;
      },
      key: (code, down) => {
        if (down) { g.input.keys.add(code); g.input.justPressed.add(code); }
        else g.input.keys.delete(code);
      },
      mouse: (down) => {
        g.input.mouseDown = down;
        if (down) g.input.justClicked = true;
      },
      god: () => { g.level.player.respawnProtect = 1e9; },
      giveCoins: (n) => g.level.addCoins(n),
      giveRifle: () => g.level.player.giveRifle(),
      giveWeapon: (id) => g.unlockWeapon(id),
      throwGrenade: () => g.level.player.throwGrenade(),
      spawnZombie: (type, x, z) => g.level.zombies.spawn(type, x, z, {}),
      airdropNow: () => { g.level.effects.airdropT = 0.05; },
      shopBuy: (id) => g.shop.buy(id),
      killZombiesNear: (x, z, r) => {
        for (const zb of [...g.level.zombies.list]) {
          if (zb.state !== 'dead' && Math.hypot(zb.x - x, zb.z - z) < r) {
            zb.damage(99999, null, false);
          }
        }
      },
      completeMission: (id) => g.level.missions._complete(id),
      finishHorde: () => {
        const zm = g.level.zombies;
        zm.hordePending = 0;
        for (const zb of [...zm.list]) {
          if (zb.horde && zb.state !== 'dead') zb.damage(99999, null, false);
        }
        zm.hordeRemaining = 0;
      },
      damageBoss: (amt) => {
        if (g.level.zombies.boss) g.level.zombies.boss.damage(amt, null, false);
      },
      // оновлення 4
      addXp: (n) => g.progress.addXp(n),
      megaForce: (roll) => { g._megaForce = roll; },
      openMegabox: () => g.level.megabox && g.level.megabox.open(),
      placeTramp: () => g.level.gadgets._placeTramp(),
      placeWall: () => g.level.gadgets._placeWall(),
      unlockGadget: (id) => {
        if (!g.save.gadgetsOwned.includes(id)) g.save.gadgetsOwned.push(id);
        g.save.activeGadget = id;
        g.saveGame();
      },
      useGadget: () => g.level.gadgets.use(),
      gadgetCdReset: () => { g.level.gadgets.cd = 0; },
      dance: () => g.level.player.emote(),
      stopDance: () => g.level.player.stopEmote(),
      mountScooter: (i = 0) => {
        const r = g.level.vehicles.list[i];
        g.test.teleport(r.x + 1, r.z);
        g.level.vehicles.mount(r);
      },
      dismountScooter: () => g.level.vehicles.dismount(),
      startStorm: (c) => g.startStorm(c),
      questEvent: (ev, data) => g.quests.onEvent(ev, data || {}),
      regenQuests: (dateKey) => {
        g.save.quests = null;
        g.quests.ensureToday(dateKey);
      },
      setSkin: (id) => {
        if (!g.save.skins.includes(id)) g.save.skins.push(id);
        g.save.activeSkin = id;
        g.saveGame();
      },
      setDance: (id) => {
        if (!g.save.dances.includes(id)) g.save.dances.push(id);
        g.save.activeDance = id;
        g.saveGame();
      },
      givePet: () => {
        g.save.upgrades.dog = 1;
        g.spawnPet();
      },
      petPos: () => g.level.pet ? { x: g.level.pet.x, z: g.level.pet.z } : null,
    };
  }
}

new Game();
