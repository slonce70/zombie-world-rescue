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
import { COUNTRIES, getBiome } from './countries.js';
import { TouchControls, isTouchDevice } from './touch.js';

const SAVE_KEY = 'zr-save-v1';

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
    if (this.params.has('fresh')) {
      this.save = { coins: 50, upgrades: {}, liberated: {}, weapons: [], records: {} };
    }

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

  _loadSave() {
    const defaults = { coins: 50, upgrades: {}, liberated: {}, weapons: [], records: {} };
    let out = defaults;
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') out = Object.assign(defaults, s);
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
    }
  }

  _showOverlay(id) { document.getElementById(id).classList.add('show'); }
  _hideOverlay(id) { document.getElementById(id).classList.remove('show'); }

  // ---------- рівень ----------
  async startLevel(countryId) {
    if (this._startingLevel) return;
    this._startingLevel = true;
    try {
      await this._buildLevel(countryId);
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

  async _buildLevel(countryId) {
    const country = COUNTRIES[countryId] || COUNTRIES.UKR;
    // екран завантаження рівня з порадою
    document.getElementById('ll-title').textContent = `${country.flag} ${country.name.toUpperCase()}`;
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
    level.zombies.populate();
    level.missions = new Missions(level);

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
    level.bus.on('hordeEnd', () => level.addCoins(60));
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
    for (const id of ['overlay-death', 'overlay-pause', 'overlay-victory', 'overlay-start']) {
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
    this.deathT = 3.5;
    this.audio.defeat();
    this._showOverlay('overlay-death');
  }

  _onBossDied() {
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
    };
  }
}

new Game();
