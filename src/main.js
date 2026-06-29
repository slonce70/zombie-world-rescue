// Головний модуль: state machine (глобус ↔ рівень), цикл гри, збереження
import * as THREE from 'three';
import { t, keyHint, interactKey, translateHtml, getLang, setLang, LANGS, LANG_NAMES } from './i18n.js';
import { Input } from './input.js';
import { AudioMan } from './audio.js';
import { World } from './world.js';
import { Player, WEAPONS, WEAPON_SLOTS } from './player.js';
import { Zombies } from './zombies.js';
import { DynamicMissions, rollMissionSet, MISSION_TYPES } from './missionpool.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Shop } from './shop.js';
import { Draft } from './draft.js';
import { RunBuild } from './runbuild.js';
import { Globe } from './globe.js';
import { Bus, RNG } from './utils.js';
import { COUNTRIES, CAMPAIGN_ORDER, getBiome, isCountryOpen } from './countries.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Progress, DailyQuests, PASS_REWARDS, PASS_MAX_LEVEL, xpForLevel, XP_VALUES } from './progress.js';
import { Megabox, Pet, Vehicles, Gadgets, GADGETS, TOWER_SKINS } from './extras.js';
import { StormMode } from './storm.js';
import { BossRush } from './bossrush.js';
import { KnockoutMode, KNOCKOUT_UNLOCK_LEVEL, KNOCKOUT_STAFF_CHANCE, OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES } from './knockout.js';
import { DefenseMode, DEFENSE_UNLOCK_COUNTRIES, OVERLOADED_DEFENSE_UNLOCK_COUNTRIES } from './defense.js';
import { PvpMode, PVP_UNLOCK_COUNTRIES, OVERLOADED_PVP_UNLOCK_COUNTRIES } from './pvp.js';
import {
  WorldBossMode, WORLD_BOSSES, WORLD_BOSS_BY_ID, WORLD_BOSS_MIN_COUNTRIES,
  worldBossUnlocked,
} from './worldboss.js';
import {
  HERO_SKINS, DANCES, TRACERS, HERO_PALETTE, HERO_HATS, HERO_FACES,
  HERO_BODY_TYPES, HERO_HAIR, HERO_ACCESSORIES, HERO_BACKS, PETS, makeHero, setAnim, updateRig,
} from './characters.js';
import { CoopUI } from './ui/coopui.js';
import { LeagueUI } from './ui/leagueui.js';
import { SaveUI } from './ui/saveui.js';
import { RescueHQ } from './ui/hq.js';
import { LivingHQ } from './hqbase.js';
import { Chapter } from './chapter.js';
import { submitScore } from './net/league.js';
import { CloudSave, SAVE_KEY, DEFAULT_HERO, NEW_SAVE_COINS, liberatedIds, liberatedCount, hasLiberated } from './net/cloudsave.js';

// 🌍 статичний HTML перекладається ОДРАЗУ — до того, як гравець щось побачить
translateHtml(document.body);
document.documentElement.lang = getLang();

// 🚑 Аварійний екран: непіймана помилка → зрозумілий екран із кнопкою
// перезавантаження замість мовчазно замерзлої гри. Сейв не страждає.
let crashShown = false;
function showCrash(msg) {
  if (crashShown) return;
  crashShown = true;
  try {
    const info = document.getElementById('crash-info');
    if (info) info.textContent = String(msg || t('невідома помилка')).slice(0, 300);
    const ov = document.getElementById('overlay-crash');
    if (ov) ov.classList.add('show');
    const b = document.getElementById('btn-crash-reload');
    if (b) b.onclick = () => location.reload();
    document.exitPointerLock && document.exitPointerLock();
  } catch (e) { /* зовсім погано — хоч не зациклюємось */ }
}
window.addEventListener('error', (e) => showCrash(e.message));
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  showCrash(r && (r.stack || r.message) || r);
});

// тримати в синхроні з version.json — бампити при кожному релізі
const APP_VERSION = 176;
window.__APP_VERSION = APP_VERSION;

const QUALITY_MODES = ['auto', 'high', 'fast'];
const QUALITY_LABELS = { auto: t('Авто'), high: t('Гарна'), fast: t('Швидка') };
const DEFAULT_EXPOSURE = 1.06;
const BIOME_EXPOSURE = {
  summer: 1.08,
  winterDusk: 1.02,
  autumnGold: 1.08,
  provence: 1.06,
  spainSun: 0.98,
  italyMed: 1.0,
  bosphorus: 1.03,
  desert: 0.96,
  sakura: 1.05,
};
// Підказки будуються при показі (а не при завантаженні): keyHint потребує
// живого input.touchMode, щоб на телефоні згадувати екранні кнопки, а не клавіші.
function buildTips() {
  return [
    keyHint('Тягни джойстик 🕹 до краю — і біжиш від орди!', 'Тримай Shift, щоб бігти від орди!'),
    t('Гранати ({k}) вибухають і червоні бочки — ланцюгова реакція!', { k: keyHint('кнопка 💣', 'G') }),
    t('Зазирай у будинки з відчиненими дверима — там лут. Але обережно…'),
    t('Золотий зомбі ⭐ тікає від тебе. Дожени — отримаєш джекпот!'),
    t('Батути 🔵 закидають на дахи. Там сховані скарби!'),
    t('Медик з хліва лікує тебе, коли стоїш поруч 💚'),
    t('Хедшот робить подвійну шкоду. Цілься в голову!'),
    keyHint('Дробовик — король ближнього бою. Перемкни кнопкою 🔁!', 'Дробовик — король ближнього бою. Клавіша 3!'),
    t('На льоду ковзько — гальмуй заздалегідь! ⛸'),
    t('Комбо-серії вбивств дають бонусні монети 🔥'),
    t('Шукай аеродропи 🪂 — там навіть БАЗУКА буває!'),
    keyHint('Кнопка 📷 — подивись на свого героя збоку!', 'Клавіша V — подивись на свого героя збоку!'),
    t('Щит щитоносця 🛡 не проб’єш у лоб — обійди ззаду або зламай!'),
    t('У магазині ({k}) є нова зброя, бронежилет і шолом!', { k: keyHint('кнопка 🛒', 'B') }),
    t('Світні кулі — підсилення: ⚡швидкість, 💪лють, 🛡бульбашка, 🧲магніт!'),
    t('Бронежилет 🦺 поглинає шкоду — поповнюй пластинами!'),
    t('Снайперка 🎯 пробиває трьох зомбі наскрізь — шикуй їх у чергу!'),
    t('Смаколики 🥐 на столиках повертають здоров’я!'),
    t('Шукай 🦙 МЕГАБОКС — фіолетовий промінь видно здалеку!'),
    keyHint('Кнопка 💃 — переможний танець. Спробуй після боса! 💃', 'Клавіша N — переможний танець. Спробуй після боса! 💃'),
    t('Самокат 🛴 збиває зомбі на повній швидкості!'),
    t('Гаджет ({k}) обирається в Гардеробі: щит, відновлення, батут чи барикада! 🧰', { k: keyHint('кнопка 🦘', 'F') }),
    t('Барикаду 🧱 можна розстріляти або забрати назад ({k})', { k: keyHint('кнопка ✋', 'E') }),
    t('Песик Дружок 🐶 збирає монети і чує сюрпризи в будинках'),
    t('Виконуй щоденні завдання 📅 — монети й зірковий досвід!'),
    t('Грай у ⛈️ ШТОРМ після звільнення країни — там рекорди!'),
    keyHint('Кнопка 🔭 — оптика снайперки', 'Права кнопка миші — оптика снайперки 🔭'),
    t('Броньовик 🦾 у залізному нагруднику — цілься в ГОЛОВУ!'),
    t('Зомбі-стрілець 🔫 б\'є здалеку — ховайся за будинки!'),
    t('Базука 🚀 тепер НАЙСИЛЬНІША зброя — бережи ракети для товстунів!'),
    keyHint('На самокаті 🛴: газуй джойстиком уперед, керуй ліворуч/праворуч', 'На самокаті: W — газ, S — гальмо, A/D — кермо 🛴'),
    t('Щоразу нові завдання! Перепройди країну — буде інакше 🎲'),
    t('Елітні зомбі 👹 в золотих коронах — сильні, але щедрі'),
    t('Зомбі-гнізда 🟣 знешкоджуються утриманням {k} — стережись охорони!', { k: keyHint('кнопки ✋', 'E') }),
    t('Мандрівника 🧳 захищай від укусів — він сховається, якщо боляче'),
    t('Лут у будинках щоразу інший — заглядай усюди! 🎁'),
  ];
}

class Game {
  constructor() {
    this.params = new URLSearchParams(location.search);
    this.testMode = this.params.has('test');
    this.seed = parseInt(this.params.get('seed') || '1377', 10);

    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 1.5 });
    this._onContextLost = (e) => {
      e.preventDefault();
      this._contextLost = true;
      if (this.hud) this.hud.toast(t('⚠️ Графіка перезапускається — зачекай...'));
    };
    this._onContextRestored = () => {
      if (this._contextLost) location.reload();
    };
    canvas.addEventListener('webglcontextlost', this._onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
    this.renderer.setSize(innerWidth, innerHeight);
    this.pixelRatio = Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // оновлюємо тіні вручну через кадр
    this._shadowFrame = 0;
    this._lowFpsSec = 0;
    this._highFpsSec = 0;
    this._hitstopT = 0;
    // у режимі «Авто» це рідний (бажаний) масштаб: адаптивка може тимчасово
    // опуститись нижче, але мусить піднятись назад, коли FPS знову стабільно високий
    this._autoTargetRatio = this.pixelRatio;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = DEFAULT_EXPOSURE;

    this.input = new Input(canvas);
    this.audio = new AudioMan();
    if (this.params.has('mute') || this.testMode) this.audio.setMuted(true);
    this.save = this._loadSave();
    if (this.params.has('fresh')) this.save = this._newSave();
    this.cloud = new CloudSave(this);
    this.progress = new Progress(this);
    this.quests = new DailyQuests(this);

    this.hud = new HUD(this);
    this.shop = new Shop(this);
    this.draft = new Draft(this);
    this.globe = new Globe(this);
    this.coop = new CoopUI(this);
    this.league = new LeagueUI(this);
    this.saveui = new SaveUI(this);
    this.hq = new RescueHQ(this);
    this.hqbase = new LivingHQ(this);
    this.chapter = new Chapter(this);
    this.touch = isTouchDevice() ? new TouchControls(this) : null;
    if (this.touch) {
      const startH2 = document.querySelector('#overlay-start h2');
      if (startH2) startH2.textContent = t('👆 ТОРКНИСЬ, ЩОБ ГРАТИ');
      // підказка глобуса без іконки миші — на тачі крутимо пальцем
      const globeHint = document.querySelector('.globe-hint');
      if (globeHint) globeHint.textContent = t('👆 Крути глобус · 🔴 червона країна — тисни і визволяй!');
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
      // у полі вводу літери B/M — це просто літери, а не магазин/звук
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (e.code === 'Escape' && this.state === 'hqbase') { this.exitHQBase(); return; }
      if (e.code === 'Escape' && this.shop.isOpen) { this.shop.close(); return; }
      if (e.code === 'Escape' && this.state === 'level' && !this.paused
        && this.deathT < 0 && !this.victoryShown && !this.draft.isOpen) {
        this.showPause();
        return;
      }
      if (e.code === 'KeyB' && this.state === 'level' && this.deathT < 0 && !this.victoryShown && !this.paused) {
        this.shop.toggle();
      }
      // 📣 C — колесо пінгів, лише у кооп-рівні (не соло, не на паузі)
      if (e.code === 'KeyC' && this.state === 'level' && this.coop && this.coop.session.state === 'level' && !this.paused) {
        this.coop.openPingWheel();
      }
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.hud.toast(this.audio.muted ? t('🔇 Звук вимкнено') : t('🔊 Звук увімкнено'));
      }
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
    document.getElementById('btn-how-to-play').addEventListener('click', () => {
      this.paused = false;
      this._hideOverlay('overlay-pause');
      this._showTouchCoach(true);
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
    // ☰ висувне меню: другорядні кнопки (профіль/налаштування)
    document.getElementById('btn-menu').addEventListener('click', () => {
      this.audio.click();
      this._showOverlay('overlay-menu');
    });
    // тап по пункту ☰-меню закриває саме меню, щоб його панель не перекривала відкриту (v36)
    document.getElementById('overlay-menu').addEventListener('click', (e) => {
      if (e.target.closest('.globe-act')) this._hideOverlay('overlay-menu');
    });
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
    document.getElementById('btn-hq').addEventListener('click', () => {
      this.audio.click();
      this.hq.render();
      this._showOverlay('overlay-hq');
    });
    document.getElementById('btn-hqbase').addEventListener('click', () => this.enterHQBase());
    document.getElementById('btn-solo').addEventListener('click', () => {
      this.audio.click();
      this.renderSoloMenu();
      this._showOverlay('overlay-solo');
    });
    document.getElementById('btn-arena-retry').addEventListener('click', () => {
      this._hideOverlay('overlay-arena-end');
      const mode = this._lastEndMode;
      this.endLevel();
      if (mode === 'knockout') this.startKnockout();
      else if (mode === 'defense') this.startDefense();
      else if (mode === 'overloaded-defense') this.startOverloadedDefense();
      else if (mode === 'pvp') this.startPvp();
      else if (mode === 'worldboss') this.startWorldBoss(this._lastWorldBossId || 'radiation');
      else this.startArena();
    });
    document.getElementById('btn-arena-globe').addEventListener('click', () => {
      this._hideOverlay('overlay-arena-end');
      this.endLevel();
    });
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

    // 🌐 перемикач мови: uk → en → ru (перезавантаження застосовує все одразу)
    const wireLangBtn = (langBtn) => {
      if (!langBtn) return;
      langBtn.textContent = `🌐 ${LANG_NAMES[getLang()]}`;
      langBtn.addEventListener('click', () => {
        this.audio.click();
        setLang(LANGS[(LANGS.indexOf(getLang()) + 1) % LANGS.length]);
      });
    };
    wireLangBtn(document.getElementById('btn-lang'));
    wireLangBtn(document.getElementById('btn-lang-globe'));

    // перемикач якості
    document.getElementById('btn-quality').addEventListener('click', () => {
      const i = QUALITY_MODES.indexOf(this.save.quality || 'auto');
      this.save.quality = QUALITY_MODES[(i + 1) % QUALITY_MODES.length];
      this.saveGame();
      this._applyQuality();
      this.audio.click();
    });
    this._applyQuality();

    // 🐣 Режим Малюк: за замовчуванням УВІМКНЕНО на телефоні, ВИМКНЕНО на десктопі.
    // kidMode === null/undefined → ще не обрано вручну → беремо тип пристрою.
    // Щойно дитина/батько торкнеться кнопки, вибір стає явним (true/false) і більше не перезаписується.
    if (this.save.kidMode === null || this.save.kidMode === undefined) {
      this.save.kidMode = isTouchDevice();
      this.saveGame();
    }
    const kidBtn = document.getElementById('btn-kid');
    if (kidBtn) {
      kidBtn.addEventListener('click', () => {
        this.save.kidMode = !this.save.kidMode; // явний вибір — фіксуємо булеан
        this.saveGame();
        this._applyKidMode();
        this.audio.click();
      });
    }
    this._applyKidMode({ silent: true }); // boot init — тост не потрібен

    window.addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.globe.onResize();
      if (this.level) {
        this.level.player.camera.aspect = innerWidth / innerHeight;
        this.level.player.camera.updateProjectionMatrix();
      }
      if (this.hqbase && this.state === 'hqbase') this.hqbase.onResize();
    });

    this.clock = new THREE.Clock();
    // 🤝 кооп: у фоновій вкладці rAF спить, а хост мусить крутити світ.
    // Web Worker-таймери браузер не тротлить — він і буде метрономом.
    this._lastRaf = performance.now();
    try {
      const src = 'setInterval(() => postMessage(1), 33);';
      this._ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this._ticker.onmessage = () => {
        // у коопі тікер — повноцінне друге джерело кроків: getDelta() ділить
        // реальний час між викликами, тож сумарна швидкість світу точна,
        // навіть коли rAF спить у фоновій вкладці
        if (this.level && this.level.net) this._frame(true);
      };
    } catch (e) { /* без воркера гра просто живе на rAF */ }
    // дебаг-API лише для тестів і локальної розробки: на проді читерські
    // хендли (spawnZombie, god…) не світяться у кожній консолі
    if (this.testMode || ['localhost', '127.0.0.1'].includes(location.hostname)) {
      window.__game = this;
      window.__makeHeroTest = (skinId, colors) => makeHero(skinId, colors);
    }
    this._boot();
  }

  _newSave() {
    return {
      coins: NEW_SAVE_COINS, crystals: 0, upgrades: {}, liberated: {}, weapons: [], records: {},
      weaponLoadout: ['pistol'],
      xp: 0, skins: ['classic', 'custom'], dances: ['shuffle'], tracers: ['classic'],
      activeSkin: 'classic', activeDance: 'shuffle', activeTracer: 'classic',
      hero: { ...DEFAULT_HERO },
      gadgetsOwned: [], gadgetHypers: [], activeGadget: null, megaPity: 0, quests: null, megaQuests: {}, stormBest: {}, worldBosses: {},
      pets: [], activePet: null,
      towerSkins: ['default'], activeTowerSkin: 'default',
      missionRuns: {}, kidMode: null, cloudTs: 0, goal: null,
      stats: { killed: 0, headshots: 0, bosses: 0, megaboxes: 0, golden: 0, bestCombo: 0 },
      bestiary: {},
      chapter: { p: {}, done: false }, medals: [],
      diffStar: 1,
      // 🎓 разові підказки-знайомства (вежа/самокат/гаджет/робот): { ключ: 1 } = вже показано
      hints: {},
    };
  }

  _loadSave() {
    const defaults = this._newSave();
    let out = defaults;
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        // F26: знімок вкладених дефолтів ДО Object.assign — бо assign перезапише
        // defaults.* посиланнями зі сейва, і дефолти стали б недоступні для merge нижче.
        const nestedDefaults = { stats: defaults.stats, hero: defaults.hero, chapter: defaults.chapter };
        out = Object.assign(defaults, s);
        // F26: глибокий merge дефолтів для вкладених об'єктів (stats/hero/chapter…).
        // Поверхневий Object.assign замінює весь вкладений об'єкт цілком — тож якщо
        // старий сейв має stats БЕЗ нового під-поля, воно лишилось би undefined → NaN.
        // Беремо бракуючі під-поля з _newSave-дефолтів. Тип-валідація нижче лишається —
        // вона ще й ловить чужі значення неправильного типу (рядок замість числа тощо).
        for (const k of ['stats', 'hero', 'chapter']) {
          if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
            out[k] = Object.assign({}, nestedDefaults[k], out[k]);
          }
        }
        // вкладені об'єкти і списки могли прийти зі старого сейва неповними
        if (!Array.isArray(out.gadgetsOwned)) out.gadgetsOwned = [];
        if (!Array.isArray(out.gadgetHypers)) out.gadgetHypers = [];
        if (!out.megaQuests || typeof out.megaQuests !== 'object' || Array.isArray(out.megaQuests)) out.megaQuests = {};
        if (!out.worldBosses || typeof out.worldBosses !== 'object' || Array.isArray(out.worldBosses)) out.worldBosses = {};
        // міграція зі старої системи витратних гаджетів: заряди → відкриття назавжди
        if (out.gadgets) {
          if (out.gadgets.tramp > 0 && !out.gadgetsOwned.includes('tramp')) out.gadgetsOwned.push('tramp');
          if (out.gadgets.wall > 0 && !out.gadgetsOwned.includes('wall')) out.gadgetsOwned.push('wall');
          delete out.gadgets;
        }
        if (out.activeGadget && !out.gadgetsOwned.includes(out.activeGadget)) out.activeGadget = null;
        out.missionRuns = out.missionRuns || {};
        if (!out.activeGadget && out.gadgetsOwned.length) out.activeGadget = out.gadgetsOwned[0];
        // улюбленці: легасі-собака (upgrades.dog) → у список pets; узгодити activePet
        if (!Array.isArray(out.pets)) out.pets = [];
        if ((out.upgrades && out.upgrades.dog > 0) && !out.pets.includes('dog')) out.pets.push('dog');
        if (out.activePet && !out.pets.includes(out.activePet)) out.activePet = null;
        if (!out.activePet && out.pets.length) out.activePet = out.pets[0];
        // 🗼 скіни башти: default завжди є; gold — куплений (у towerSkins); stone — за Францію (динамічно)
        if (!Array.isArray(out.towerSkins)) out.towerSkins = ['default'];
        if (!out.towerSkins.includes('default')) out.towerSkins.unshift('default');
        if (!TOWER_SKINS[out.activeTowerSkin]) out.activeTowerSkin = 'default';
        if (!Array.isArray(out.skins) || !out.skins.length) out.skins = ['classic'];
        if (!out.skins.includes('custom')) out.skins.push('custom');
        if (!out.hero || typeof out.hero !== 'object') out.hero = {};
        for (const k of ['shirt', 'pants', 'skin', 'shoes', 'hatColor']) {
          if (typeof out.hero[k] !== 'number') out.hero[k] = DEFAULT_HERO[k];
        }
        if (!HERO_HATS[out.hero.hat]) out.hero.hat = DEFAULT_HERO.hat;
        if (!HERO_FACES[out.hero.face]) out.hero.face = DEFAULT_HERO.face;
        if (!HERO_BODY_TYPES[out.hero.body]) out.hero.body = DEFAULT_HERO.body;
        if (!HERO_HAIR[out.hero.hair]) out.hero.hair = DEFAULT_HERO.hair;
        if (!HERO_ACCESSORIES[out.hero.accessory]) out.hero.accessory = DEFAULT_HERO.accessory;
        if (!HERO_BACKS[out.hero.back]) out.hero.back = DEFAULT_HERO.back;
        if (!Array.isArray(out.dances) || !out.dances.length) out.dances = ['shuffle'];
        if (!Array.isArray(out.tracers) || !out.tracers.length) out.tracers = ['classic'];
        if (!out.skins.includes(out.activeSkin)) out.activeSkin = 'classic';
        if (!out.dances.includes(out.activeDance)) out.activeDance = 'shuffle';
        out.stormBest = out.stormBest || {};
        if (!out.stats || typeof out.stats !== 'object') out.stats = {};
        for (const k of ['killed', 'headshots', 'bosses', 'megaboxes', 'golden', 'bestCombo']) {
          if (typeof out.stats[k] !== 'number' || !isFinite(out.stats[k])) out.stats[k] = 0;
        }
        if (!out.bestiary || typeof out.bestiary !== 'object') out.bestiary = {};
        if (!out.chapter || typeof out.chapter !== 'object') out.chapter = { p: {}, done: false };
        if (!out.chapter.p || typeof out.chapter.p !== 'object') out.chapter.p = {};
        if (!Array.isArray(out.medals)) out.medals = [];
        if (out.goal !== null && typeof out.goal !== 'string') out.goal = null;
        // ⭐ зірки складності (M7): тільки ціле 1..5; зіпсоване/чуже значення → ★1
        if (typeof out.diffStar !== 'number' || !(out.diffStar >= 1 && out.diffStar <= 5)) out.diffStar = 1;
        out.diffStar = Math.round(out.diffStar);
        // критичні поля валідуємо за формою — зіпсований/чужий сейв не має ламати завантаження
        if (!Array.isArray(out.weapons)) out.weapons = ['pistol'];
        if (!Array.isArray(out.weaponLoadout)) out.weaponLoadout = null;
        if (!out.liberated || typeof out.liberated !== 'object') out.liberated = {};
        for (const id of Object.keys(out.liberated)) if (!out.liberated[id]) delete out.liberated[id];
        if (!out.records || typeof out.records !== 'object') out.records = {};
        if (!out.upgrades || typeof out.upgrades !== 'object') out.upgrades = {};
        if (typeof out.coins !== 'number' || !isFinite(out.coins)) out.coins = 0;
        if (typeof out.crystals !== 'number' || !isFinite(out.crystals)) out.crystals = 0;
        if (!out.hints || typeof out.hints !== 'object') out.hints = {}; // 🎓 старий сейв без hints
        if (typeof out.xp !== 'number' || !isFinite(out.xp)) out.xp = 0;
      }
    } catch (e) { /* зіпсований сейв — почнемо заново */ }
    // міграція: зброя за вже звільнені країни (старі сейви без weapons).
    // Захищено формою (Array/object) — щоб ніколи не кинути виняток на завантаженні (інакше — вічний краш-екран).
    if (Array.isArray(out.weapons) && out.liberated && typeof out.liberated === 'object') {
      for (const id of liberatedIds(out.liberated)) {
        const w = COUNTRIES[id] && COUNTRIES[id].weaponReward;
        if (w && !out.weapons.includes(w)) out.weapons.push(w);
      }
    }
    return out;
  }

  saveGame() {
    if (this.level && this.level.playground) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch (e) {
      // Safari Private Mode / заблокований сторедж: попереджаємо РАЗ, щоб дитина встигла експортувати
      if (!this._storageWarned) {
        this._storageWarned = true;
        if (this.hud) this.hud.toast(t('⚠️ Браузер не зберігає прогрес — увімкни звичайний режим або експортуй файл'));
      }
    }
    if (this.cloud) this.cloud.schedulePush();
  }

  _ownedWeapons() {
    return new Set(['pistol', ...(this.save.weapons || []).filter((id) => WEAPONS[id])]);
  }

  _weaponLoadout() {
    const owned = this._ownedWeapons();
    const hasLoadout = Array.isArray(this.save.weaponLoadout);
    const raw = hasLoadout ? this.save.weaponLoadout : [...owned];
    const out = ['pistol'];
    for (const id of raw) {
      if (id !== 'pistol' && owned.has(id) && !out.includes(id) && out.length < 7) out.push(id);
    }
    if (!hasLoadout) {
      for (const id of WEAPON_SLOTS) {
        if (owned.has(id) && !out.includes(id) && out.length < Math.min(7, owned.size)) out.push(id);
      }
    }
    this.save.weaponLoadout = out;
    return out;
  }

  _toggleLoadoutWeapon(id) {
    const owned = this._ownedWeapons();
    if (!owned.has(id)) return;
    const loadout = this._weaponLoadout();
    if (id === 'pistol') {
      this.audio.denied();
      this.hud.toast(t('Пістолет завжди з тобою'));
      return;
    }
    const idx = loadout.indexOf(id);
    if (idx >= 0) loadout.splice(idx, 1);
    else if (loadout.length >= 7) {
      this.audio.denied();
      this.hud.toast(t('Можна взяти максимум 7 зброй'));
      return;
    } else {
      loadout.push(id);
    }
    this.save.weaponLoadout = loadout;
    this.saveGame();
    this.audio.purchase();
    this.renderWardrobe();
  }

  _adaptiveResolutionEnabled() {
    const q = this.save.quality || 'auto';
    return q === 'auto' || q === 'high';
  }

  _applyLevelExposure(countryId) {
    const biome = (COUNTRIES[countryId] || COUNTRIES.UKR).biome;
    this.renderer.toneMappingExposure = BIOME_EXPOSURE[biome] || DEFAULT_EXPOSURE;
  }

  _applyDefaultExposure() {
    this.renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  }

  _restoreAdaptiveResolution() {
    if (this._adaptiveResolutionEnabled() && this.pixelRatio < this._autoTargetRatio) {
      this.pixelRatio = this._autoTargetRatio;
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(innerWidth, innerHeight);
    }
    this._lowFpsSec = 0;
    this._highFpsSec = 0;
  }

  _applyQuality() {
    const q = this.save.quality || 'auto';
    document.getElementById('btn-quality').textContent = t('⚙️ Якість: {q}', { q: QUALITY_LABELS[q] });
    if (q === 'fast') this.pixelRatio = 1.0;
    else if (q === 'high') this.pixelRatio = Math.min(devicePixelRatio, 1.75);
    else this.pixelRatio = Math.min(devicePixelRatio, 1.5);
    // рідний масштаб для Авто/Гарна адаптивки + скидаємо лічильники гістерезису
    this._autoTargetRatio = this.pixelRatio;
    this._lowFpsSec = 0;
    this._highFpsSec = 0;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // 🐣 Режим Малюк: оновлюємо підпис кнопки і клас на body (м'яка допомога з прицілом + CSS)
  // opts.silent — не показувати тост (при авто-init та вході в рівень)
  _applyKidMode(opts = {}) {
    const on = !!this.save.kidMode;
    document.body.classList.toggle('kid-mode', on);
    const btn = document.getElementById('btn-kid');
    if (btn) btn.textContent = on ? t('🐣 Малюк: вкл') : t('🐣 Малюк: викл');
    if (this.hud) this.hud.setKidChip(on);
    if (!opts.silent) {
      if (this.hud) this.hud.toast(on
        ? t('🐣 Малюк: допомагає прицілитись — стріляй сам кнопкою 🔫')
        : t('🐣 Малюк вимкнено: цілишся сам'));
    }
  }

  // 👆 Перше знайомство з керуванням: показуємо раз, лише на телефоні
  _maybeShowTouchCoach() {
    this._showTouchCoach(false);
  }

  // 👆 Показати коуч керування. force=true — ігнорує localStorage-гейт (для кнопки «Як грати»)
  _showTouchCoach(force) {
    if (!this.touch) return; // тільки телефон: на десктопі this.touch === null
    if (!force) {
      let coached = false;
      try { coached = localStorage.getItem('zr-touch-coached') === '1'; } catch (e) { /* ignore */ }
      if (coached) return;
    }
    const el = document.getElementById('touch-coach');
    if (!el) return;
    // 🌍 локалізуємо підписи коуча зараз: ключ — оригінальний укр. рядок (data-i18n)
    for (const node of el.querySelectorAll('[data-i18n]')) {
      node.textContent = t(node.getAttribute('data-i18n'));
    }
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    const dismiss = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      el.classList.remove('show');
      el.setAttribute('aria-hidden', 'true');
      if (!force) {
        try { localStorage.setItem('zr-touch-coached', '1'); } catch (err) { /* ignore */ }
      }
      // 🔊 тап по коучу = той самий жест, що й клік по «торкнись, щоб грати»: розблоковуємо звук
      if (this.input.onUserGesture) this.input.onUserGesture();
      el.removeEventListener('touchstart', dismiss);
      el.removeEventListener('mousedown', dismiss);
    };
    el.addEventListener('touchstart', dismiss, { passive: false });
    el.addEventListener('mousedown', dismiss);
  }

  // 📱 Слабкий/тач-пристрій? Дитячий телефон/планшет не тягне найдорожчий GPU-pass.
  // Тач (телефон/планшет) АБО мало ядер (<=4) АБО мало памʼяті (<=4 ГБ).
  _isWeakDevice() {
    try {
      if (isTouchDevice()) return true;
      const cores = navigator.hardwareConcurrency;
      if (typeof cores === 'number' && cores <= 4) return true;
      const mem = navigator.deviceMemory;
      if (typeof mem === 'number' && mem <= 4) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  _qualityWorldOpts() {
    const q = this.save.quality || 'auto';
    // Явний вибір користувача поважаємо як є.
    if (q === 'fast') return { shadow: 1024, snow: 160, lights: false, cameraFar: 220, fogFar: 200, skyRadius: 180 };
    if (q === 'high') return { shadow: 2048, snow: 380, lights: true };
    // 'auto': на слабкому/тач-пристрої — проміжний профіль (легші тіні, без зайвих світел);
    // на потужному ПК — повна якість, як було.
    if (this._isWeakDevice()) return { shadow: 1024, snow: 220, lights: false, cameraFar: 220, fogFar: 200, skyRadius: 180 };
    return { shadow: 2048, snow: 380, lights: true };
  }

  async _boot() {
    try {
      await this.globe.load();
    } catch (e) {
      console.error(t('Не вдалося завантажити карту країн'), e);
    }
    this._hideOverlay('overlay-loading');
    this.state = 'globe';
    // 🎖️ catch-up: гравці, які ВЖЕ на зірковому рівні ≥25/≥28, одразу отримують вогнемет/лазер
    this.progress._checkWeaponUnlocks();
    this._showGlobeUI(true);
    this._initVersionCheck();
    this.cloud.bootSync(); // тихо: пуш прогресу або підхоплення хмарного сейва
    this.renderer.setAnimationLoop(() => {
      this._lastRaf = performance.now();
      this._frame(false);
    });
    const c = this.params.get('country');
    if (c && COUNTRIES[c]) this.startLevel(c);
  }

  // 🌍 Список країн під глобусом: чіпи з прапором/назвою/станом.
  // Список країн кампанії: показується у ГРАТИ → Кампанія (#solo-countries).
  // Глобус лишається клікабельним — список дублює таргети для тих, кому важко
  // влучити по країні пальцем. Тап доступної країни → startLevel() (+ закриває
  // оверлей, якщо переданий). Заблокована → denied-тост.
  renderCountryList(box, onPlay) {
    if (!box) return;
    const lib = this.save.liberated || {};
    box.innerHTML = '';
    for (const id of CAMPAIGN_ORDER) {
      const c = COUNTRIES[id];
      if (!c) continue;
      const liberated = !!lib[id];
      const open = isCountryOpen(lib, id);
      const playable = liberated || open;
      const badge = liberated ? '✅' : (open ? '🔴' : '🔒');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'country-item' + (playable ? '' : ' locked');
      item.dataset.id = id;
      item.innerHTML = `<span class="ci-flag">${c.flag}</span><span class="ci-name">${c.name}</span><span class="ci-badge">${badge}</span>`;
      item.addEventListener('click', () => {
        this.audio.ensure();
        const nowLib = this.save.liberated || {};
        if (nowLib[id] || isCountryOpen(nowLib, id)) {
          this.audio.click();
          if (onPlay) onPlay();
          this.startLevel(id);
        } else {
          this.audio.denied();
          this.hud.toast(t('🔒 {n}: спочатку звільни Україну!', { n: c.name }));
        }
      });
      box.appendChild(item);
    }
  }

  _showGlobeUI(show) {
    document.getElementById('globe-ui').style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('in-level', !show);
    if (show) document.body.classList.remove('storm-mode', 'no-shop-mode', 'banner-active');
    // ховаємо тултип країни при виході з глобуса, щоб «звільнено…» не лишався над рівнем
    if (!show) { const tt = document.getElementById('globe-tooltip'); if (tt) tt.style.display = 'none'; }
    if (show) {
      document.getElementById('liberated-count').textContent =
        liberatedCount(this.save.liberated);
      // бейджі: рівень пасса і незавершені завдання дня
      const passBadge = document.getElementById('pass-badge');
      passBadge.textContent = `⭐${this.progress.level}`;
      passBadge.classList.add('show');
      const qLeft = this.quests.pendingCount;
      const qBadge = document.getElementById('quest-badge');
      qBadge.textContent = qLeft;
      qBadge.classList.toggle('show', qLeft > 0);
      if (this._newVersion) this._onNewVersion(this._newVersion);
    }
    if (this.coop) this.coop.updateRoomChip();
  }

  // ---------- 🏠 Живий Штаб ----------
  enterHQBase() {
    this.audio.click();
    this._hideOverlay('overlay-hq');
    this._hideOverlay('overlay-menu');
    this._showGlobeUI(false);
    document.body.classList.remove('in-level'); // це не рівень — ховаємо бойовий HUD (амуніція/мінікарта/тач)
    this.state = 'hqbase';
    this.hqbase.enter();
    this.clock.getDelta(); // не накопичуємо dt за час на меню
  }

  exitHQBase() {
    this.audio.click();
    this.hqbase.exit();
    this.state = 'globe';
    this._showGlobeUI(true);
  }

  // ---------- 🎮 меню «Грати» (соло-режими) ----------
  renderSoloMenu() {
    const libN = liberatedCount(this.save.liberated);
    const modes = [
      {
        id: 'campaign', icon: '🎯', name: t('КАМПАНІЯ'), locked: false,
        desc: t('Звільняй країни світу: місії, боси, нагороди'),
      },
      {
        id: 'storm', icon: '⛈️', name: t('ШТОРМ'), locked: libN < 1,
        desc: libN < 1 ? t('Відкриється після першої звільненої країни') : t('Виживи у колі, що звужується. Рекорд — у Лігу!'),
      },
      {
        id: 'arena', icon: '👑', name: t('АРЕНА БОСІВ'), locked: libN < 2,
        desc: libN < 2 ? t('Відкриється після двох звільнених країн') : t('Усі {n} босів поспіль на час. Час — у Лігу!', { n: CAMPAIGN_ORDER.length }),
      },
      {
        id: 'worldboss', icon: '🌋', name: t('СВІТОВІ БОСИ'), locked: libN < WORLD_BOSS_MIN_COUNTRIES,
        desc: libN < WORLD_BOSS_MIN_COUNTRIES
          ? t('Відкриється після {n} звільнених країн', { n: WORLD_BOSS_MIN_COUNTRIES })
          : t('Великі боси з окремими механіками і разовими нагородами.'),
      },
      {
        id: 'knockout', icon: '🥊', name: t('НОКАУТ'), locked: this.progress.level < KNOCKOUT_UNLOCK_LEVEL,
        desc: this.progress.level < KNOCKOUT_UNLOCK_LEVEL
          ? t('Відкриється на {n} рівні Зоряного шляху', { n: KNOCKOUT_UNLOCK_LEVEL })
          : t('Кімната 33×33, 10 зомбі, тільки пістолет. Перемога може дати Посох!'),
      },
      {
        id: 'overloaded-knockout', icon: '💥', name: t('Перегружений нокаут'), locked: libN < OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES,
        desc: libN < OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES
          ? t('Відкриється після {n} звільнених країн', { n: OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES })
          : t('Кімната 33×33, 20 зомбі, у тебе 150 HP і тільки пістолет.'),
      },
      {
        id: 'defense', icon: '🛡️', name: t('ОБОРОНА'), locked: libN < DEFENSE_UNLOCK_COUNTRIES,
        desc: libN < DEFENSE_UNLOCK_COUNTRIES
          ? t('Відкриється після {n} звільнених країн', { n: DEFENSE_UNLOCK_COUNTRIES })
          : t('Кімната 120×120, вежа 250 HP, пістолет і автомат.'),
      },
      {
        id: 'overloaded-defense', icon: '🏰', name: t('Перегружена оборона'), locked: libN < OVERLOADED_DEFENSE_UNLOCK_COUNTRIES,
        desc: libN < OVERLOADED_DEFENSE_UNLOCK_COUNTRIES
          ? t('Відкриється після {n} звільнених країн', { n: OVERLOADED_DEFENSE_UNLOCK_COUNTRIES })
          : t('3 хвилі: вежа 500 HP, гравець 250 HP, зомбі 234 HP.'),
      },
      {
        id: 'overloaded-pvp', icon: '💣', name: t('Перегружене ПВП'), locked: libN < OVERLOADED_PVP_UNLOCK_COUNTRIES,
        desc: libN < OVERLOADED_PVP_UNLOCK_COUNTRIES
          ? t('Відкриється після {n} звільнених країн', { n: OVERLOADED_PVP_UNLOCK_COUNTRIES })
          : t('Дуель 35×35: гармата, меч і щити проти зомбі 3000 HP.'),
      },
      {
        id: 'pvp', icon: '⚔️', name: t('ПВП'), locked: libN < PVP_UNLOCK_COUNTRIES,
        desc: libN < PVP_UNLOCK_COUNTRIES
          ? t('Відкриється після {n} звільнених країн', { n: PVP_UNLOCK_COUNTRIES })
          : t('Дуель 30×30: посох проти зомбі на 250 HP.'),
      },
    ];
    const root = document.getElementById('solo-modes');
    root.innerHTML = modes.map((m) => `
      <button type="button" class="solo-mode ${m.locked ? 'locked' : ''}" data-mode="${m.id}">
        <div class="sm-ico">${m.icon}</div>
        <div class="sm-body"><div class="sm-name">${m.name}${m.locked ? ' 🔒' : ''}</div>
        <div class="sm-desc">${m.desc}</div></div>
        <div class="sm-go">${m.locked ? '' : '▶'}</div>
      </button>`).join('');
    const cRoot = document.getElementById('solo-countries');
    cRoot.style.display = 'none';
    cRoot.innerHTML = '';
    root.querySelectorAll('.solo-mode').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = el.dataset.mode;
        if (el.classList.contains('locked')) {
          this.audio.denied();
          return;
        }
        this.audio.click();
        // повторний тап по вже обраному режимі — згортає список країн назад до режимів
        if (el.classList.contains('sel') && cRoot.style.display !== 'none') {
          el.classList.remove('sel');
          cRoot.style.display = 'none';
          cRoot.innerHTML = '';
          return;
        }
        if (mode === 'campaign') {
          // вибір країни ТУТ (після ГРАТИ), а не на головному екрані
          root.querySelectorAll('.solo-mode').forEach((x) => x.classList.toggle('sel', x === el));
          cRoot.style.display = '';
          cRoot.innerHTML = t('<div class="solo-cty-title">Яку країну рятуємо?</div>');
          const listBox = document.createElement('div');
          listBox.id = 'country-list';
          cRoot.appendChild(listBox);
          this.renderCountryList(listBox, () => this._hideOverlay('overlay-solo'));
        } else if (mode === 'arena') {
          this._hideOverlay('overlay-solo');
          this.startArena();
        } else if (mode === 'worldboss') {
          root.querySelectorAll('.solo-mode').forEach((x) => x.classList.toggle('sel', x === el));
          cRoot.style.display = '';
          cRoot.innerHTML = t('<div class="solo-cty-title">Якого світового боса викликаємо?</div>')
            + WORLD_BOSSES.map((b) => {
              const ok = worldBossUnlocked(b.id, libN);
              const done = !!(this.save.worldBosses && this.save.worldBosses[b.id]);
              const label = ok
                ? `${b.icon} ${b.shortName()}${done ? ' ✅' : ''}`
                : `${b.icon} ${b.shortName()} 🔒 ${b.unlockCountries}`;
              return `<button class="btn solo-cty ${ok ? '' : 'locked'}" data-id="${b.id}">${label}</button>`;
            }).join('');
          cRoot.querySelectorAll('.solo-cty').forEach((b) => {
            b.addEventListener('click', () => {
              if (b.classList.contains('locked')) { this.audio.denied(); return; }
              this.audio.click();
              this._hideOverlay('overlay-solo');
              this.startWorldBoss(b.dataset.id);
            });
          });
        } else if (mode === 'knockout') {
          this._hideOverlay('overlay-solo');
          this.startKnockout();
        } else if (mode === 'overloaded-knockout') {
          this._hideOverlay('overlay-solo');
          this.startOverloadedKnockout();
        } else if (mode === 'defense') {
          this._hideOverlay('overlay-solo');
          this.startDefense();
        } else if (mode === 'overloaded-defense') {
          this._hideOverlay('overlay-solo');
          this.startOverloadedDefense();
        } else if (mode === 'overloaded-pvp') {
          this._hideOverlay('overlay-solo');
          this.startOverloadedPvp();
        } else if (mode === 'pvp') {
          this._hideOverlay('overlay-solo');
          this.startPvp();
        } else {
          // шторм: обери звільнену країну (у кожної — своя таблиця Ліги)
          root.querySelectorAll('.solo-mode').forEach((x) => x.classList.toggle('sel', x === el));
          cRoot.style.display = '';
          cRoot.innerHTML = t('<div class="solo-cty-title">Де переживати Шторм?</div>')
            + CAMPAIGN_ORDER.filter((id) => hasLiberated(this.save.liberated, id)).map((id) =>
              `<button class="btn solo-cty" data-id="${id}">${COUNTRIES[id].flag} ${COUNTRIES[id].name}</button>`).join('');
          cRoot.querySelectorAll('.solo-cty').forEach((b) => {
            b.addEventListener('click', () => {
              this.audio.click();
              this._hideOverlay('overlay-solo');
              this.startStorm(b.dataset.id);
            });
          });
        }
      });
    });
  }

  // ---------- панелі глобуса ----------
  renderPassPanel() {
    const lvl = this.progress.level;
    const frac = this.progress.levelFrac();
    const need = lvl < PASS_MAX_LEVEL ? xpForLevel(lvl) : 0;
    document.getElementById('pass-progress').innerHTML = lvl >= PASS_MAX_LEVEL
      ? t('⭐ Рівень {lvl} — МАКСИМУМ! Ти зірка! 🏆', { lvl })
      : t('⭐ Рівень {lvl} · до наступного: {a}/{b} XP', { lvl, a: Math.round(frac * need), b: need }) + `
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
    this.quests.ensureMegaQuests();
    let html = `<div class="quest-section-title">${t('Мега-квести')}</div>`;
    if (!this.quests.megaUnlocked) {
      html += `<div class="quest-row locked">
        <div class="quest-title">🔒 ${t('Мега-квести відкриються на {n} рівні Зоряного шляху', { n: this.quests.megaUnlockLevel })}</div>
        <div class="quest-reward">${t('Поки прокачуй щоденні завдання і країни')}</div>
      </div>`;
    } else {
      for (const q of this.quests.megaList) {
        const pct = Math.round((q.progress / q.target) * 100);
        html += `<div class="quest-row mega ${q.done ? 'done' : ''}">
          <div class="quest-title">${q.icon} ${q.title} ${q.done ? '✅' : ''}</div>
          <div class="quest-reward">${q.rewardText}</div>
          <div class="quest-bar"><div style="width:${pct}%"></div></div>
          <div class="quest-prog">${q.progress} / ${q.target}</div>
        </div>`;
      }
    }
    html += `<div class="quest-section-title">${t('Щоденні')}</div>`;
    for (const q of this.quests.list) {
      const pct = Math.round((q.progress / q.target) * 100);
      html += `<div class="quest-row ${q.done ? 'done' : ''}">
        <div class="quest-title">${q.icon} ${q.title} ${q.done ? '✅' : ''}</div>
        <div class="quest-reward">${t('🪙 120 монет · ⭐ 40 XP')}</div>
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
        ${meta.detail ? `<div class="ward-desc">${meta.detail}</div>` : ''}
        ${meta.stat ? `<div class="ward-stat">${meta.stat}</div>` : ''}
        <div class="ward-tag">${equipped ? t('✅ Одягнено') : owned ? t('Натисни — обрати') : '🔒 ' + (meta.desc || '')}</div>
        ${meta.tryable ? `<button class="ward-try" data-action="gadget-try" data-id="${id}">${t('Спробувати')}</button>` : ''}
      </div>`;
    const tabs = [
      ['skins', t('Скіни')],
      ['weapon', t('Зброя')],
      ['gadget', t('Гаджети')],
      ['dance', t('Танці')],
      ['pet', t('Улюбленці')],
      ['tower', t('Башта')],
      ['tracer', t('Кулі')],
      ['hero', t('Герой')],
    ];
    if (!this._wardrobeTab) this._wardrobeTab = save.activeSkin === 'custom' ? 'hero' : 'skins';
    if (!tabs.some(([id]) => id === this._wardrobeTab)) this._wardrobeTab = 'skins';
    const pane = (id, body) => `<div class="ward-pane" data-tab="${id}" ${this._wardrobeTab === id ? '' : 'hidden'}>${body}</div>`;
    let skinsHtml = t('<div class="ward-section">Скіни героя</div><div class="ward-grid">');
    for (const [id, meta] of Object.entries(HERO_SKINS)) {
      skinsHtml += card(id, meta, save.skins.includes(id), save.activeSkin === id, 'skin');
    }
    skinsHtml += '</div>';
    const loadout = this._weaponLoadout();
    const ownedWeapons = this._ownedWeapons();
    let weaponHtml = t('<div class="ward-section">Зброя — максимум 7 із 10</div><div class="ward-grid">');
    for (const id of WEAPON_SLOTS) {
      const meta = WEAPONS[id];
      const owned = ownedWeapons.has(id);
      const selected = loadout.includes(id);
      const meta2 = {
        icon: meta.icon,
        name: meta.name,
        desc: id === 'pistol' ? t('Базова зброя') : t('Спершу відкрий цю зброю'),
        stat: selected ? t('У наборі') : owned && loadout.length >= 7 ? t('Ліміт 7') : '',
      };
      weaponHtml += card(id, meta2, owned, selected, 'weapon');
    }
    weaponHtml += '</div>';
    let heroHtml = t('<div class="ward-section">🎨 Створи свого героя</div><div class="ward-grid">');
    heroHtml += card('custom', HERO_SKINS.custom, save.skins.includes('custom'), save.activeSkin === 'custom', 'skin');
    heroHtml += '</div>';
    if (save.activeSkin === 'custom') {
      const h = save.hero;
      const slotLabel = { skin: t('Шкіра'), shirt: t('Футболка'), pants: t('Штани'), shoes: t('Взуття'), hatColor: t('Колір шапки') };
      const hex6 = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
      const partGroup = (title, part, items) => {
        let out = `<div class="hero-sub">${title}</div><div class="ward-grid hero-parts">`;
        for (const [id, m] of Object.entries(items)) {
          out += `<div class="ward-card hero-part-card ${h[part] === id ? 'equipped' : ''}" data-part="${part}" data-id="${id}"><div class="ward-ico">${m.icon}</div><div class="ward-name">${m.name}</div></div>`;
        }
        return out + '</div>';
      };
      heroHtml += '<div class="hero-editor"><div class="hero-stage"><canvas id="hero-preview" class="hero-preview" width="260" height="300"></canvas>';
      heroHtml += `<div class="hero-preview-tools"><button class="hero-view-btn on" data-view="front">↻</button><button class="hero-view-btn" data-view="left">←</button><button class="hero-view-btn" data-view="right">→</button><input id="hero-zoom" type="range" min="3.4" max="5.4" step="0.1" value="4.7"></div>`;
      heroHtml += `<div class="hero-preview-tools"><button class="hero-pose-btn on" data-pose="idle">${t('Стійка')}</button><button class="hero-pose-btn" data-pose="run">${t('Біг')}</button><button class="hero-pose-btn" data-pose="dance">${t('Танець')}</button></div></div><div class="hero-controls">`;
      heroHtml += `<button id="hero-random" class="btn hero-random">🎲 ${t('Випадковий герой')}</button>`;
      for (const slot of ['skin', 'shirt', 'pants', 'shoes', 'hatColor']) {
        heroHtml += `<div class="hero-swatch-row"><span class="hero-swatch-lbl">${slotLabel[slot]}</span>`;
        for (const hexv of HERO_PALETTE[slot]) {
          const on = h[slot] === hexv ? ' on' : '';
          heroHtml += `<button class="hero-swatch${on}" data-slot="${slot}" data-hex="${hexv}" style="background:${hex6(hexv)}"></button>`;
        }
        heroHtml += `<label class="hero-pick" title="${t('Будь-який колір')}" style="background:${hex6(h[slot])}">🎨<input type="color" data-slot="${slot}" value="${hex6(h[slot])}"></label>`;
        heroHtml += '</div>';
      }
      heroHtml += partGroup(t('🧍 Тіло'), 'body', HERO_BODY_TYPES);
      heroHtml += partGroup(t('🎩 Шапка'), 'hat', HERO_HATS);
      heroHtml += partGroup(t('💇 Волосся'), 'hair', HERO_HAIR);
      heroHtml += partGroup(t('😀 Обличчя'), 'face', HERO_FACES);
      heroHtml += partGroup(t('⭐ Аксесуар'), 'accessory', HERO_ACCESSORIES);
      heroHtml += partGroup(t('🎒 Спина'), 'back', HERO_BACKS);
      heroHtml += '</div></div>';
    }
    let danceHtml = t('<div class="ward-section">Танці (N)</div><div class="ward-grid">');
    for (const [id, meta] of Object.entries(DANCES)) {
      danceHtml += card(id, meta, save.dances.includes(id), save.activeDance === id, 'dance');
    }
    danceHtml += '</div>';
    let gadgetHtml = t('<div class="ward-section">Гаджет — береш ОДИН із собою ({k})</div>', { k: keyHint('кнопка 🦘', 'F') });
    gadgetHtml += `<button class="btn gadget-playground-btn" data-action="gadget-playground">${t('🧪 Полігон гаджетів')} · ${t('Спробувати гаджети')}</button><div class="ward-grid">`;
    for (const [id, meta] of Object.entries(GADGETS)) {
      const meta2 = { icon: meta.icon, name: meta.name, desc: meta.desc + t(' (купи в магазині)'), detail: meta.desc, stat: `⏳ ${meta.cd}с`, tryable: true };
      gadgetHtml += card(id, meta2, save.gadgetsOwned.includes(id), save.activeGadget === id, 'gadget');
    }
    gadgetHtml += '</div>';
    let petHtml = t('<div class="ward-section">🐾 Улюбленець — біжить поряд</div><div class="ward-grid">');
    for (const [id, meta] of Object.entries(PETS)) {
      const meta2 = { icon: meta.icon, name: meta.name, desc: meta.desc + t(' (купи в магазині)') };
      petHtml += card(id, meta2, save.pets.includes(id), save.activePet === id, 'pet');
    }
    petHtml += '</div>';
    let towerHtml = t('<div class="ward-section">🗼 Скін башти (гаджет)</div><div class="ward-grid">');
    const towerOwned = (id) => id === 'default' || (id === 'stone' && hasLiberated(save.liberated, 'FRA')) || save.towerSkins.includes(id);
    for (const [id, meta] of Object.entries(TOWER_SKINS)) {
      const meta2 = { icon: meta.icon, name: meta.name, desc: id === 'stone' ? t('Звільни Францію 🇫🇷') : id === 'gold' ? t('Купи в магазині') : t('Базова') };
      towerHtml += card(id, meta2, towerOwned(id), save.activeTowerSkin === id, 'tower');
    }
    towerHtml += '</div>';
    let tracerHtml = t('<div class="ward-section">Сліди куль</div><div class="ward-grid">');
    for (const [id, meta] of Object.entries(TRACERS)) {
      tracerHtml += card(id, meta, save.tracers.includes(id), save.activeTracer === id, 'tracer');
    }
    tracerHtml += '</div>';
    let html = `<div class="ward-tabs">${tabs.map(([id, label]) => `<button class="shop-tab ward-tab ${this._wardrobeTab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>`;
    html += pane('skins', skinsHtml) + pane('weapon', weaponHtml) + pane('gadget', gadgetHtml) + pane('dance', danceHtml) + pane('pet', petHtml) + pane('tower', towerHtml) + pane('tracer', tracerHtml) + pane('hero', heroHtml);
    const root = document.getElementById('wardrobe-content');
    this._stopHeroPreview(); // прибрати старий рендер перед перемальовкою
    root.innerHTML = html;
    root.querySelectorAll('.ward-tab').forEach((el) => {
      el.addEventListener('click', () => {
        this._wardrobeTab = el.dataset.tab;
        this.audio.click();
        root.querySelectorAll('.ward-tab').forEach((btn) => btn.classList.toggle('on', btn === el));
        root.querySelectorAll('.ward-pane').forEach((p) => { p.hidden = p.dataset.tab !== this._wardrobeTab; });
        if (this._wardrobeTab === 'hero' && save.activeSkin === 'custom') this._startHeroPreview();
        else this._stopHeroPreview();
      });
    });
    root.querySelector('[data-action="gadget-playground"]')?.addEventListener('click', () => this.startGadgetPlayground());
    root.querySelectorAll('[data-action="gadget-try"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startGadgetPlayground(el.dataset.id);
      });
    });
    root.querySelectorAll('.ward-card:not(.locked):not(.hero-part-card)').forEach((el) => {
      el.addEventListener('click', () => {
        const { kind, id } = el.dataset;
        if (kind === 'skin') {
          save.activeSkin = id;
          this._wardrobeTab = id === 'custom' ? 'hero' : 'skins';
        }
        else if (kind === 'weapon') { this._toggleLoadoutWeapon(id); return; }
        else if (kind === 'dance') save.activeDance = id;
        else if (kind === 'gadget') save.activeGadget = id;
        else if (kind === 'pet') { save.activePet = id; this.spawnPet(); }
        else if (kind === 'tower') save.activeTowerSkin = id;
        else if (kind === 'tracer') {
          save.activeTracer = id;
          if (this.level) this.level.effects.tracerStyle = id === 'classic' ? null : id;
        }
        this.saveGame();
        this.audio.purchase();
        this.renderWardrobe();
      });
    });
    // --- редактор кастом-героя: без повної перемальовки, живий 3D-прев'ю ---
    const onHeroChange = () => { this.saveGame(); this._rebuildHeroPreview(); };
    root.querySelectorAll('.hero-swatch').forEach((el) => {
      el.addEventListener('click', () => {
        const slot = el.dataset.slot;
        save.hero[slot] = parseInt(el.dataset.hex, 10);
        for (const sib of el.parentElement.querySelectorAll('.hero-swatch')) sib.classList.toggle('on', sib === el);
        const pick = el.parentElement.querySelector('.hero-pick');
        if (pick) { const css = '#' + ((save.hero[slot] >>> 0) & 0xffffff).toString(16).padStart(6, '0'); pick.style.background = css; pick.querySelector('input').value = css; }
        this.audio.purchase();
        onHeroChange();
      });
    });
    root.querySelectorAll('.hero-pick input[type=color]').forEach((el) => {
      el.addEventListener('input', () => {
        const slot = el.dataset.slot;
        save.hero[slot] = parseInt(el.value.slice(1), 16);
        el.parentElement.style.background = el.value;
        for (const sib of el.parentElement.querySelectorAll('.hero-swatch')) sib.classList.remove('on');
        onHeroChange();
      });
    });
    root.querySelectorAll('.hero-part-card').forEach((el) => {
      el.addEventListener('click', () => {
        const { part, id } = el.dataset;
        save.hero[part] = id;
        for (const sib of root.querySelectorAll(`.hero-part-card[data-part="${part}"]`)) sib.classList.toggle('equipped', sib === el);
        this.audio.purchase();
        onHeroChange();
      });
    });
    const pickRandom = (items) => Object.keys(items)[Math.floor(Math.random() * Object.keys(items).length)];
    const heroRandom = root.querySelector('#hero-random');
    if (heroRandom) heroRandom.addEventListener('click', () => {
      save.hero.body = pickRandom(HERO_BODY_TYPES);
      save.hero.hat = pickRandom(HERO_HATS);
      save.hero.hair = pickRandom(HERO_HAIR);
      save.hero.face = pickRandom(HERO_FACES);
      save.hero.accessory = pickRandom(HERO_ACCESSORIES);
      save.hero.back = pickRandom(HERO_BACKS);
      for (const slot of ['skin', 'shirt', 'pants', 'shoes', 'hatColor']) {
        save.hero[slot] = HERO_PALETTE[slot][Math.floor(Math.random() * HERO_PALETTE[slot].length)];
      }
      this.audio.purchase();
      this.saveGame();
      this.renderWardrobe();
    });
    root.querySelectorAll('.hero-view-btn').forEach((el) => {
      el.addEventListener('click', () => this._setHeroPreviewView(el.dataset.view));
    });
    root.querySelectorAll('.hero-pose-btn').forEach((el) => {
      el.addEventListener('click', () => this._setHeroPreviewPose(el.dataset.pose));
    });
    const zoom = root.querySelector('#hero-zoom');
    if (zoom) zoom.addEventListener('input', () => this._setHeroPreviewZoom(parseFloat(zoom.value)));
    if (save.activeSkin === 'custom' && this._wardrobeTab === 'hero') this._startHeroPreview();
  }

  // ---------- живий 3D-перегляд кастом-героя в гардеробі ----------
  _startHeroPreview() {
    const cv = document.getElementById('hero-preview');
    if (!cv) return;
    this._stopHeroPreview();
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    } catch {
      cv.dataset.previewFallback = 'webgl';
      return;
    }
    renderer.setSize(cv.width, cv.height, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(2, 4, 2); scene.add(dir);
    const cam = new THREE.PerspectiveCamera(32, cv.width / cv.height, 0.1, 50);
    const zoom = parseFloat(document.getElementById('hero-zoom')?.value || '4.7');
    cam.position.set(0, 1.15, -zoom); cam.lookAt(0, 1.05, 0); // -Z = перед героя (дивиться у -Z)
    const rig = makeHero('custom', this.save.hero);
    scene.add(rig.group);
    let raf = 0;
    const hp = { renderer, scene, cam, rig, raf, view: 'front', pose: 'idle', zoom };
    const loop = () => {
      if (hp.pose === 'run') { hp.rig.anim.speed = 5.5; setAnim(hp.rig, 'run'); updateRig(hp.rig, 1 / 60); }
      else if (hp.pose === 'dance') { hp.rig.anim.danceStyle = this.save.activeDance || 'shuffle'; setAnim(hp.rig, 'dance'); updateRig(hp.rig, 1 / 60); }
      else { setAnim(hp.rig, 'idle'); updateRig(hp.rig, 1 / 60); }
      renderer.render(scene, cam);
      hp.raf = requestAnimationFrame(loop);
    };
    loop();
    this._heroPrev = hp;
  }

  _setHeroPreviewView(view) {
    document.querySelectorAll('.hero-view-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.view === (view || 'front')));
    const hp = this._heroPrev;
    if (!hp) return;
    hp.view = view || 'front';
    hp.rig.group.rotation.y = hp.view === 'left' ? -Math.PI / 2 : hp.view === 'right' ? Math.PI / 2 : 0;
  }

  _setHeroPreviewPose(pose) {
    document.querySelectorAll('.hero-pose-btn').forEach((btn) => btn.classList.toggle('on', btn.dataset.pose === (pose || 'idle')));
    const hp = this._heroPrev;
    if (!hp) return;
    hp.pose = pose || 'idle';
    setAnim(hp.rig, hp.pose === 'dance' ? 'dance' : hp.pose === 'run' ? 'run' : 'idle');
  }

  _setHeroPreviewZoom(zoom) {
    const hp = this._heroPrev;
    if (!hp || !isFinite(zoom)) return;
    hp.zoom = zoom;
    hp.cam.position.z = -zoom;
    hp.cam.lookAt(0, 1.05, 0);
  }

  // звільняємо унікальну per-instance гео/матеріали рига (запечене тіло — НЕ shared),
  // спільні кеші (userData.shared) лишаємо. Інакше кожна правка в редакторі тече по GPU.
  _freeRig(group) {
    if (!group) return;
    group.traverse((o) => {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (!m || (m.userData && m.userData.shared)) return;
        if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose();
        m.dispose();
      });
    });
  }

  _rebuildHeroPreview() {
    const hp = this._heroPrev;
    if (!hp) return;
    hp.scene.remove(hp.rig.group);
    this._freeRig(hp.rig.group); // не лишаємо запечену гео старого рига в пам'яті GPU
    hp.rig = makeHero('custom', this.save.hero);
    this._setHeroPreviewView(hp.view);
    this._setHeroPreviewPose(hp.pose);
    hp.scene.add(hp.rig.group);
  }

  _stopHeroPreview() {
    const hp = this._heroPrev;
    if (!hp) return;
    cancelAnimationFrame(hp.raf);
    this._freeRig(hp.rig.group);
    // r160 dispose() НЕ звільняє WebGL-контекст — форсимо, інакше ~16 контекстів і канвас гасне
    if (hp.renderer.forceContextLoss) hp.renderer.forceContextLoss();
    hp.renderer.dispose();
    this._heroPrev = null;
  }

  // ---------- шторм ----------
  startGadgetPlayground(gadgetId = null) {
    this.audio.click();
    this._hideOverlay('overlay-wardrobe');
    this.startLevel('UKR', { playground: true, gadget: gadgetId });
  }

  _startGadgetChallenge(level, id) {
    if (!level.playground || !id) return;
    level.gadgetChallenge = {
      gadget: id,
      title: t('Тренування майстра гаджетів'),
      progress: 0,
      target: 3,
      done: false,
    };
  }

  startStorm(countryId = null) {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('⛈️🤝 У коопі Шторм запускається з лобі кімнати — обери режим «Шторм»!'));
      this.audio.denied();
      return;
    }
    const lib = liberatedIds(this.save.liberated);
    if (!lib.length) {
      this.audio.denied();
      this.hud.toast(t('⛈️ Шторм відкриється після звільнення першої країни!'));
      return;
    }
    // найсвіжіша звільнена країна кампанії
    if (!countryId) {
      for (let i = CAMPAIGN_ORDER.length - 1; i >= 0; i--) {
        if (hasLiberated(this.save.liberated, CAMPAIGN_ORDER[i])) { countryId = CAMPAIGN_ORDER[i]; break; }
      }
    }
    this.audio.click();
    this.startLevel(countryId || 'UKR', { storm: true });
  }

  // ---------- 👑 Арена босів ----------
  startArena() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('👑🤝 У коопі Арена запускається з лобі кімнати — обери режим «Арена»!'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < 2) {
      this.audio.denied();
      this.hud.toast(t('👑 Арена босів відкриється після звільнення 2 країн!'));
      return;
    }
    this.audio.click();
    this.startLevel('UKR', { arena: true });
  }

  // ---------- 🌋 Світові боси ----------
  startWorldBoss(id) {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🌋🤝 Світові боси поки доступні тільки у соло.'));
      this.audio.denied();
      return;
    }
    const cfg = WORLD_BOSS_BY_ID[id];
    const lib = liberatedCount(this.save.liberated);
    if (!cfg) {
      this.audio.denied();
      this.hud.toast(t('🌋 Такого світового боса немає.'));
      return;
    }
    if (!worldBossUnlocked(id, lib)) {
      this.audio.denied();
      this.hud.toast(t('🌋 {b} відкриється після {n} звільнених країн!', { b: cfg.shortName(), n: cfg.unlockCountries }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { worldBoss: id });
  }

  // ---------- 🥊 Нокаут ----------
  startKnockout() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🥊🤝 Нокаут поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    if (this.progress.level < KNOCKOUT_UNLOCK_LEVEL) {
      this.audio.denied();
      this.hud.toast(t('🥊 Нокаут відкриється на {n} рівні Зоряного шляху!', { n: KNOCKOUT_UNLOCK_LEVEL }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { knockout: true });
  }

  startOverloadedKnockout() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('💥🤝 Перегружений нокаут поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('💥 Перегружений нокаут відкриється після {n} звільнених країн!', { n: OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { knockout: 'overloaded' });
  }

  // ---------- 🛡️ Оборона ----------
  startDefense() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🛡️🤝 Оборона поки доступна тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < DEFENSE_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('🛡️ Оборона відкриється після {n} звільнених країн!', { n: DEFENSE_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { defense: true });
  }

  startOverloadedDefense() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🏰🤝 Перегружена оборона поки доступна тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < OVERLOADED_DEFENSE_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('🏰 Перегружена оборона відкриється після {n} звільнених країн!', { n: OVERLOADED_DEFENSE_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { defense: 'overloaded' });
  }

  // ---------- ⚔️ ПВП ----------
  startPvp() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('⚔️🤝 ПВП поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < PVP_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('⚔️ ПВП відкриється після {n} звільнених країн!', { n: PVP_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { pvp: true });
  }

  startOverloadedPvp() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('💣🤝 Перегружене ПВП поки доступне тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < OVERLOADED_PVP_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('💣 Перегружене ПВП відкриється після {n} звільнених країн!', { n: OVERLOADED_PVP_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startLevel('UKR', { pvp: 'overloaded' });
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
    if (tag) tag.textContent = t('🔄 Вийшло оновлення v{v}! Онови сторінку: Ctrl(⌘)+Shift+R', { v });
  }

  _showOverlay(id) { document.getElementById(id).classList.add('show'); }
  _hideOverlay(id) {
    document.getElementById(id).classList.remove('show');
    // закрили гардероб — гасимо 3D-прев'ю (вигляд героя застосується при вході в рівень)
    if (id === 'overlay-wardrobe') this._stopHeroPreview();
  }

  // ---------- рівень ----------
  async startLevel(countryId, opts = {}) {
    if (this._startingLevel) return;
    this._startingLevel = true;
    try {
      await this._buildLevel(countryId, opts);
      // свіжий старт лічильника часу: перший кадр рівня не отримає величезний dt від паузи на завантаження
      this.clock.getDelta();
      this._timeAcc = 0;
      // адаптивка: кожен рівень стартує з рідного масштабу — коротка просадка на
      // минулому рівні більше не лишає гру «мильною» весь сеанс (Авто/Гарна)
      this._restoreAdaptiveResolution();
    } catch (e) {
      // не блокуємо гру назавжди — повертаємось на глобус
      console.error(t('Помилка побудови рівня'), e);
      this._applyDefaultExposure();
      this._restoreAdaptiveResolution();
      this._hitstopT = 0;
      this.level = null;
      this.state = 'globe';
      this._showGlobeUI(true);
      this.hud.toast(t('😵 Ой! Щось пішло не так. Спробуй ще раз.'));
    } finally {
      this._hideOverlay('overlay-level-loading');
      this._startingLevel = false;
    }
  }

  async _buildLevel(countryId, opts = {}) {
    const country = COUNTRIES[countryId] || COUNTRIES.UKR;
    const isStorm = !!opts.storm;
    document.body.classList.toggle('storm-mode', isStorm);
    const isKnockout = !!opts.knockout;
    const knockoutVariant = opts.knockout === 'overloaded' ? 'overloaded' : 'normal';
    const isOverloadedKnockout = isKnockout && knockoutVariant === 'overloaded';
    const isDefense = !!opts.defense;
    const defenseVariant = opts.defense === 'overloaded' ? 'overloaded' : 'normal';
    const isOverloadedDefense = isDefense && defenseVariant === 'overloaded';
    const isPvp = !!opts.pvp;
    const pvpVariant = opts.pvp === 'overloaded' ? 'overloaded' : 'normal';
    const worldBossId = opts.worldBoss || null;
    const isWorldBoss = !!worldBossId;
    document.body.classList.toggle('no-shop-mode', isStorm || isKnockout || isDefense || isPvp || isWorldBoss);
    const isPlayground = !!opts.playground;
    const coop = opts.coop || null;
    const isGuest = !!(coop && coop.role === 'guest');
    const isArena = !!opts.arena;
    // екран завантаження рівня з порадою
    document.getElementById('ll-title').textContent = isWorldBoss
      ? t('🌋 СВІТОВИЙ БОС')
      : isPvp
      ? (pvpVariant === 'overloaded' ? t('💣 Перегружене ПВП') : t('⚔️ ПВП'))
      : isDefense
      ? (isOverloadedDefense ? t('🏰 Перегружена оборона') : t('🛡️ ОБОРОНА'))
      : isKnockout
      ? (isOverloadedKnockout ? t('💥 Перегружений нокаут') : t('🥊 НОКАУТ'))
      : isArena
      ? t('👑 АРЕНА БОСІВ')
      : isStorm
        ? t('⛈️ ШТОРМ: {c}', { c: country.name.toUpperCase() })
        : isPlayground
          ? t('🧪 ПОЛІГОН ГАДЖЕТІВ')
          : `${country.flag} ${country.name.toUpperCase()}`;
    const tips = buildTips();
    document.getElementById('ll-tip').textContent = '💡 ' + tips[Math.floor(Math.random() * tips.length)];
    this._showOverlay('overlay-level-loading');
    this._showGlobeUI(false);
    // даємо браузеру намалювати екран завантаження
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    /**
     * Спільний контекст забігу (per-run), передається в усі підсистеми як перший аргумент або через замикання.
     * Поля, що існують ЗАВЖДИ (у всіх режимах):
     *   game, countryId, country, scene, bus, rng, audio, stats, combo,
     *   bossDefeated, net, mirror, netEv, players, runIndex,
     *   world, effects, addCoins, player, zombies, missions,
     *   vehicles, gadgets, pet.
     *
     * РЕЖИМО-УМОВНІ поля (присутні тільки в певних режимах):
     *   storm    — тільки в режимі Шторм (isStorm); інакше — undefined.
     *   bossRush — тільки в режимі Арени (isArena); інакше — undefined.
     *   knockout — тільки в режимі Нокаут (isKnockout); інакше — undefined.
     *   defense  — тільки в режимі Оборона (isDefense); інакше — undefined.
     *   pvp      — тільки в режимі ПВП (isPvp); інакше — undefined.
     *   worldBoss — тільки в режимі Світового боса; інакше — undefined.
     *   megabox  — null для гостя (isGuest) або арени (isArena); інакше new Megabox(...).
     *
     * Правило: перед доступом до режимо-умовних полів завжди перевіряй наявність (level.storm?.foo).
     */
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
      // кооп: net ставиться нижче; netEv — безпечна заглушка для соло
      net: null,
      mirror: isGuest,
      netEv: () => {},
      players: null,
      runIndex: coop && coop.spec ? coop.spec.runIndex : undefined,
      playground: isPlayground,
      playgroundGadget: isPlayground ? (GADGETS[opts.gadget] ? opts.gadget : Object.keys(GADGETS)[0]) : null,
      noGadgets: isKnockout || isDefense || isPvp,
      modeShield: pvpVariant === 'overloaded' ? { hp: 1000, cd: 45 } : null,
      noShop: isStorm || isKnockout || isDefense || isPvp || isWorldBoss,
      noBuffs: isKnockout || isDefense || isPvp,
      noPickups: isPvp || isOverloadedDefense,
      noZombiePickups: isKnockout || isDefense || isPvp,
      noCoinDrops: isPvp || isOverloadedDefense,
    };
    // ⭐ зірки складності (M7): діють ЛИШЕ при соло-реплеї вже звільненої країни.
    // Перші проходження / шторм / арена / будь-який кооп → ★1 (без десинхрону).
    // ВАЖЛИВО: ставимо ДО new Zombies(...) — конструктор читає level.diffStar.
    const coopActive = !!(this.coop && this.coop.session && this.coop.session.state !== 'idle');
    const soloReplay = !isStorm && !isArena && !isKnockout && !isDefense && !isPvp && !isWorldBoss && !coopActive && hasLiberated(this.save.liberated, countryId);
    level.diffStar = soloReplay ? (this.save.diffStar || 1) : 1;
    this._applyLevelExposure(countryId);
    level.world = new World(level.scene, country.seed, getBiome(countryId), country.map, this._qualityWorldOpts());
    level.effects = new Effects(level.scene, level.world, this.audio);
    level.effects.levelRef = level;
    level.addCoins = (n) => {
      if (level.playground) return;
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
    // зброя, здобута в попередніх країнах. У спецрежимах даємо фіксований набір.
    if (isKnockout || isDefense || isPvp) {
      level.player.weapons = isPvp ? (pvpVariant === 'overloaded' ? ['cannon', 'sword'] : ['staff']) : isDefense ? ['pistol', 'rifle'] : ['pistol'];
      level.player.cur = isPvp ? (pvpVariant === 'overloaded' ? 'cannon' : 'staff') : isDefense ? 'rifle' : 'pistol';
      level.player.grenades = 0;
      if (isPvp) {
        level.player.maxHealth = pvpVariant === 'overloaded' ? 2500 : 50;
        level.player.health = level.player.maxHealth;
        level.player.maxArmor = 0;
        level.player.armor = 0;
        level.player.damageMult = 1;
      } else if (isOverloadedDefense) {
        level.player.maxHealth = 250;
        level.player.health = 250;
        level.player.maxArmor = 0;
        level.player.armor = 0;
      } else if (isOverloadedKnockout) {
        level.player.maxHealth = 150;
        level.player.health = 150;
        level.player.maxArmor = 0;
        level.player.armor = 0;
      }
      level.player._applyView();
    } else {
      const loadout = this._weaponLoadout();
      for (const w of loadout) level.player.giveWeapon(w, false);
      if (loadout.includes('bazooka')) level.player.addRockets(2);
      // 🔋 паливні зброї (v46): на старті рівня — повний балон у кожної наявної
      for (const w of loadout) level.player.refillFuel(w);
    }

    level.zombies = new Zombies(level, this.seed + 2);
    if (isKnockout) {
      level.knockout = new KnockoutMode(level, knockoutVariant);
      level.missions = level.knockout;
    } else if (isDefense) {
      level.defense = new DefenseMode(level, defenseVariant);
      level.missions = level.defense;
    } else if (isPvp) {
      level.pvp = new PvpMode(level, pvpVariant);
      level.missions = level.pvp;
    } else if (isWorldBoss) {
      level.worldBoss = new WorldBossMode(level, worldBossId);
      level.missions = level.worldBoss;
    } else if (isArena) {
      // 👑 арена: тільки боси, чиста мапа
      level.bossRush = new BossRush(level);
      level.missions = level.bossRush;
    } else if (isStorm) {
      // ⛈️ шторм: без місій, тільки хвилі і коло
      level.storm = new StormMode(level);
      level.missions = level.storm;
      // 🎲 «Прокачка» — внутрі-забігова прокачка лише в СОЛО-Штормі (кооп — окремий beat)
      if (!level.net) level.runBuild = new RunBuild();
    } else {
      if (!isGuest) level.zombies.populate();
      level.missions = new DynamicMissions(level);
    }
    // 🦙🐶🛴🦘 іграшки рівня (мегабокс гостю створить мережа — позиція від хоста)
    level.megabox = (isGuest || isArena || isPlayground || isKnockout || isDefense || isPvp || isWorldBoss) ? null : new Megabox(level, isStorm ? 8 : null, isStorm ? 8 : null);
    level.vehicles = new Vehicles(level);
    level.gadgets = new Gadgets(level);
    this._startGadgetChallenge(level, level.playgroundGadget);
    level.pet = isPvp ? null : this.save.activePet ? new Pet(level, this.save.activePet) : null;
    level.effects.tracerStyle = this.save.activeTracer === 'classic' ? null : this.save.activeTracer;

    // 🎲 лут у будинках перемішується ЩОЗАБІГУ — ніколи не знаєш, що знайдеш
    if (!isStorm && !isArena && !isKnockout && !isDefense && !isPvp && !isGuest && !isPlayground) {
      const LOOT_POOL = [
        'coins', 'coins', 'coins', 'medkit', 'ammo', 'ammo', 'grenade',
        'armor', 'food', 'speed', 'rage', 'bubble', 'magnet',
      ];
      for (const ls of level.world.lootSpots) {
        if (Math.random() < 0.7) {
          ls.type = LOOT_POOL[Math.floor(Math.random() * LOOT_POOL.length)];
        }
      }
    }
    // лут і зомбі-сюрпризи всередині будинків (вічний лут — не зникає)
    for (const ls of ((isGuest || isArena || isKnockout || isDefense || isPvp || isPlayground) ? [] : level.world.lootSpots)) {
      if (ls.type === 'coins') {
        for (let i = 0; i < 5; i++) {
          level.effects.spawnCoin(ls.x + (Math.random() - 0.5) * 0.8, ls.z + (Math.random() - 0.5) * 0.8, 10, 9999, ls.y);
        }
      } else {
        level.effects.spawnPickup(ls.x, ls.z, ls.type, 9999, ls.y);
      }
    }
    if (!isGuest && !isKnockout && !isDefense && !isPvp) for (const sp of level.world.surpriseSpots) level.zombies.spawnSurprise(sp.x, sp.z);

    // приколи карти: бочки, м'яч, тварини, аеродроп
    const fun = country.map.fun || {};
    for (const [bx, bz] of fun.barrels || []) level.effects.addBarrel(bx, bz);
    if (fun.barrels && fun.barrels.length) level.world._buildGrid();
    if (fun.soccerBall) level.effects.addBall(fun.soccerBall.x, fun.soccerBall.z);
    if (fun.animals) level.effects.addAnimals(fun.animals);
    level.effects.onAirdrop = () => {
      this.hud.toast(this.save.weapons.includes('bazooka')
        ? t('🪂 Аеродроп! Припаси падають поблизу — шукай блакитний промінь!')
        : t('🪂 Аеродроп! Кажуть, у таких ящиках буває БАЗУКА… 🚀'));
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
    if (isKnockout || isDefense || isPvp) level.effects.airdropT = Infinity;

    level.effects.getPlayerPos = () => level.player.pos;
    level.effects.getMagnetActive = () => level.player.buffs.magnet > 0;
    level.effects.zombieHitTest = (origin, dir, maxD) => level.zombies.hitTest(origin, dir, maxD);
    const BUFF_INFO = {
      speed: { dur: 20, msg: t('⚡ ТУРБО-ШВИДКІСТЬ на 20 секунд!') },
      rage: { dur: 15, msg: t('💪 ПОДВІЙНА ШКОДА на 15 секунд!') },
      bubble: { dur: 8, msg: t('🛡 НЕВРАЗЛИВІСТЬ на 8 секунд!') },
      magnet: { dur: 25, msg: t('🧲 МАГНІТ МОНЕТ на 25 секунд!') },
    };
    level.effects.onPickup = (type, value) => {
      if (level.noPickups && type !== 'coin') {
        this.audio.denied();
        this.hud.toast(t('У цьому режимі пікапи вимкнені'));
        return;
      }
      if (!level.playground && type !== 'coin') this.quests.onEvent('pickup');
      if (type === 'coin') {
        level.addCoins(value);
        this.audio.coin();
      } else if (type === 'medkit') {
        if (level.player.heal(30)) this.hud.toast(t('🩹 +30 здоров’я'));
        this.audio.heal();
      } else if (type === 'grenade') {
        level.player.grenades++;
        this.audio.pickup();
        this.hud.toast(t('💣 +1 граната ({k})', { k: keyHint('кнопка 💣', 'G — кинути') }));
      } else if (type === 'food') {
        level.player.heal(15);
        this.audio.heal();
        this.hud.toast(t('😋 Смачний {f}! +15 здоров’я', { f: level.country.food || t('смаколик') }));
      } else if (type === 'armor') {
        level.player.addArmor(value || 40);
        this.audio.pickup();
        this.hud.toast(t('🛡️ +40 броні!'));
      } else if (type === 'rocket') {
        level.player.addRockets(value || 2);
        this.audio.pickup();
        this.hud.toast(t('🧨 +2 ракети для базуки!'));
      } else if (type === 'bazooka') {
        this.unlockWeapon('bazooka');
        level.player.addRockets(3);
        this.audio.powerup();
        this.hud.banner(t('🚀 БАЗУКА!'), t('{k} — рознеси їх усіх! (+3 ракети)', { k: keyHint('кнопка 🔁', 'Клавіша 7') }));
      } else if (type === 'totem') {
        // 🪬 тотем безсмертя: +1 заряд воскресіння (рятує від смерті раз)
        level.player.reviveCharges = (level.player.reviveCharges || 0) + 1;
        this.audio.powerup();
        this.hud.toast(t('🪬 Тотем безсмертя!'));
      } else if (BUFF_INFO[type]) {
        if (level.noBuffs) {
          this.audio.denied();
          this.hud.toast(t('У цьому режимі бафи вимкнені'));
          return;
        }
        level.player.buffs[type] = BUFF_INFO[type].dur;
        this.audio.powerup();
        this.hud.toast(BUFF_INFO[type].msg);
      } else {
        level.player.addAmmo(30);
        this.audio.pickup();
        this.hud.toast(t('🔋 +30 набоїв'));
      }
    };
    // вибух (граната/бочка 135 за замовч., ракета базуки 220 — передається явно): шкода зомбі по радіусу.
    // ownerPid — хто підірвав (для чесного кіл-кредиту/комбо/квестів у коопі); 1 = локальний гравець/хост
    level.effects.onExplosion = (x, y, z, r, baseDmg = 135, ownerPid = 1, meta = null) => {
      // вибух трощить і барикади поблизу
      for (const w of [...level.gadgets.walls]) {
        if (Math.hypot(w.x - x, w.z - z) < r) level.gadgets.damageWall(w, baseDmg);
      }
      for (const zb of [...level.zombies.list]) {
        if (zb.state === 'dead') continue;
        const d = Math.hypot(zb.x - x, zb.z - z);
        if (d < r) {
          const rage = level.player.buffs.rage > 0 ? 2 : 1;
          const mult = meta && meta.finalDamage ? 1 : level.player.damageMult * rage;
          const dmg = Math.round(baseDmg * (1 - (d / r) * 0.55) * mult);
          // вибух: не малюємо число, якщо щит або нагрудник повністю поглинає удар
          const absorbed = zb.shieldHp > 0 || (zb.chestHp > 0); // вибух не є headshot → chestHp завжди поглинає
          if (!absorbed) {
            level.effects.damageNumber(new THREE.Vector3(zb.x, zb.y + zb.rig.height * 0.8, zb.z), dmg, false);
          }
          zb.lastHitBy = ownerPid; // чесний кіл-кредит за вибухове добивання
          zb.damage(dmg, null, false);
        }
      }
      const pd = Math.hypot(level.player.pos.x - x, level.player.pos.z - z);
      if (pd < r + 3) level.player.camShake = Math.max(level.player.camShake, 1.2);
      // 🚀 F10: вибух (своя ракета/бочка/граната) НЕ ранить гравця — лише струшує камеру.
      // Разом зі зведенням ракети (~3 м, див. effects.js) дитина не підриває себе
      // пострілом у натовп упритул. Шкода по ворогах (вище) лишається повною.
    };
    // сніжки сніговиків
    level.effects.onProjectileHit = (dmg, x, z) => {
      level.player.takeDamage(dmg, x, z);
    };

    this.hud.wire(level.bus);
    level.bus.on('hitmarker', (crit, weapon) => {
      if (crit && weapon !== 'rifle' && weapon !== 'smg') this._hitstopT = Math.max(this._hitstopT, 0.055);
    });
    level.bus.on('zombieKilled', (z) => {
      if (level.mirror) return;
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      this._hitstopT = Math.max(this._hitstopT, z.type === 'boss' ? 0.07 : 0.045);
    });
    level.bus.on('playerDied', () => this._onPlayerDied());
    level.bus.on('bossDied', () => this._onBossDied());
    level.bus.on('hordeEnd', () => {
      if (level.playground) return;
      level.addCoins(60);
      this.progress.addXp(XP_VALUES.horde);
      this.quests.onEvent('horde');
    });
    // ⭐ зірковий досвід і щоденні завдання
    level.bus.on('zombieKilled', (z) => {
      if (level.playground) return;
      // кооп-хост: чужі перемоги зараховуються їхнім господарям (події zd)
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      this.save.stats.killed++;
      const bk = z.golden ? 'golden' : z.type;
      this.save.bestiary[bk] = (this.save.bestiary[bk] || 0) + 1;
      if (z.golden) this.save.stats.golden++;
      const big = z.type === 'tank' || z.type === 'shield' || z.type === 'snowman' || z.type === 'spitter';
      const killXp = level.worldBoss && z.type === 'boss'
        ? 0
        : z.golden ? XP_VALUES.killGolden : z.type === 'boss' ? XP_VALUES.killBoss : big ? XP_VALUES.killBig : XP_VALUES.kill;
      if (killXp) this.progress.addXp(killXp);
      if (!(level.worldBoss && z.type === 'boss')) this.quests.onEvent('kill', { weapon: level.player.cur });
      if (!level.knockout && !level.defense && !level.pvp && !level.worldBoss) this.chapter.onEvent('kill');
      if (z.golden) this.quests.onEvent('golden');
      if (z.type === 'boss' && !level.storm && !level.worldBoss) {
        this.quests.onEvent('boss');
        if (!level.knockout && !level.defense && !level.pvp && !level.worldBoss) this.chapter.onEvent('boss');
        this.save.stats.bosses++;
      }
    });
    level.bus.on('zombieDamaged', (n, z) => {
      if (level.playground) return;
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      this.quests.onEvent('damage', { n: Math.round(n) });
    });
    level.bus.on('missionDone', () => { if (!level.playground) { this.progress.addXp(XP_VALUES.mission); if (!level.knockout && !level.defense && !level.pvp && !level.worldBoss) this.chapter.onEvent('mission'); } });
    level.bus.on('gadgetUsed', (id) => {
      if (!level.playground) {
        this.quests.onEvent('gadget');
        if (!level.knockout && !level.defense && !level.pvp && !level.worldBoss) this.chapter.onEvent('gadget');
        return;
      }
      const ch = level.gadgetChallenge;
      if (!ch || ch.gadget !== id || ch.done) return;
      ch.progress = Math.min(ch.target, ch.progress + 1);
      ch.done = ch.progress >= ch.target;
    });
    level.bus.on('hitmarker', (crit) => { if (!level.playground && crit) { this.quests.onEvent('headshot'); this.save.stats.headshots++; } });
    level.bus.on('shieldBroken', () => { if (!level.playground) this.quests.onEvent('shield'); });
    level.bus.on('megaboxOpened', () => {
      if (level.playground) return;
      this.progress.addXp(XP_VALUES.megabox);
      this.quests.onEvent('megabox');
      this.save.stats.megaboxes++;
    });
    level.bus.on('dance', () => { if (!level.playground) this.quests.onEvent('dance'); });
    // комбо за серії вбивств
    level.bus.on('zombieKilled', (z) => {
      if (level.playground || level.knockout || level.defense || level.pvp || level.worldBoss) return;
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      if (level.bossDefeated) return; // «здача» після перемоги не рахується
      const c = level.combo;
      c.n++;
      c.t = 3.2;
      if (c.n > c.best) c.best = c.n;
      if (c.best > this.save.stats.bestCombo) this.save.stats.bestCombo = c.best;
      if (c.n >= 3) this.hud.comboPop(c.n);
      if (c.n % 5 === 0) {
        const bonus = c.n * 2;
        level.addCoins(bonus);
        this.audio.comboDing(c.n / 5);
        this.hud.toast(t('🔥 КОМБО x{n}! +{b} монет', { n: c.n, b: bonus }));
      }
    });
    level.bus.on('bossStart', () => {
      document.getElementById('boss-name').textContent = level.worldBoss ? level.worldBoss.cfg.name() : country.boss.name;
    });

    // прогріваємо шейдери, поки висить екран завантаження — без фризу на старті
    try { this.renderer.compile(level.scene, level.player.camera); } catch (e) { /* ignore */ }

    // 🤝 кооп: мережевий шар рівня
    if (coop) {
      level.net = coop.session.makeNet(level, coop.spec);
      level.netEv = (...a) => level.net.ev(...a);
      if (coop.role === 'host') {
        // предмети підбирають і снаряди б'ють УСІХ гравців
        level.effects.getPickupTargets = () => {
          const out = [];
          for (const pl of level.players || []) {
            if (pl.health <= 0) continue;
            out.push({
              pos: pl.pos,
              magnet: pl.pid === 1 ? level.player.buffs.magnet > 0 : !!pl.magnet,
              pid: pl.pid,
            });
          }
          return out;
        };
        level.effects.getDamageTargets = () => (level.players || []).filter((p) => p.health > 0);
        level.effects.onProjectileHit = (dmg, x, z, tgt) => {
          if (tgt) level.net.hurtPlayer(tgt, dmg, x, z);
          else level.player.takeDamage(dmg, x, z);
        };
      } else {
        level.effects.getPickupTargets = () => [];
      }
      level.net.attach(coop.spec);
    }

    if (isArena || isKnockout || isDefense || isPvp || isWorldBoss) {
      const a = level.world.layout.arena;
      const z = isWorldBoss ? a.z + 16 : isKnockout ? a.z : isPvp ? a.z + 4 : isDefense ? a.z + 8 : a.z + 12;
      const gy = level.world.groundH(a.x, z);
      level.player.pos.set(a.x, gy, z);
    }

    this.level = level;
    if (this.chapter && !level.playground && !level.knockout && !level.defense && !level.pvp && !level.worldBoss) this.chapter.onEvent('enterLevel');
    this.state = 'level';
    this._applyKidMode({ silent: true }); // 🐣 клас kid-mode активний і в бою (тост — лише на ручне перемикання)
    this.victoryShown = false;
    this._nightAnnounced = false;
    this.paused = false;
    this.deathT = -1;
    this._hitstopT = 0;
    this.hud.showBoss(false);

    if (this.testMode) {
      this.audio.setMode('calm');
    } else if (this.touch) {
      // 📱 ТЕЛЕФОН: жодного стеку оверлеїв. Перший раз — лише коуч (він і є «торкнись, щоб почати»
      // + його тап розблоковує звук). Далі звук уже розблоковано → нічого не перекриває гру.
      this._maybeShowTouchCoach();
    } else {
      // 🖱️ ДЕСКТОП: екран «клікни, щоб грати» (захоплення курсора) — без змін.
      this._showOverlay('overlay-start');
    }
    const bannerSub = typeof country.banner === 'function' ? country.banner() : country.banner;
    const bannerTitle = level.worldBoss ? level.worldBoss.cfg.name() : level.pvp ? (level.pvp.variant === 'overloaded' ? t('💣 Перегружене ПВП') : t('⚔️ ПВП')) : level.defense ? (level.defense.variant === 'overloaded' ? t('🏰 Перегружена оборона') : t('🛡️ ОБОРОНА')) : level.knockout ? (level.knockout.variant === 'overloaded' ? t('💥 Перегружений нокаут') : t('🥊 НОКАУТ')) : level.playground ? t('🧪 Полігон гаджетів') : `${country.flag} ${country.name.toUpperCase()}`;
    const bannerText = level.worldBoss ? level.worldBoss.cfg.mechanic() : level.pvp ? (level.pvp.variant === 'overloaded' ? t('Гармата і меч проти зомбі на 3000 HP. У тебе 2500 HP і щит.') : t('Посох проти зомбі на 250 HP. У тебе 50 HP.')) : level.defense ? (level.defense.variant === 'overloaded' ? t('3 хвилі. Захисти вежу 500 HP: у тебе 250 HP, у зомбі 234 HP.') : t('Захисти вежу: 250 HP, пістолет і автомат')) : level.knockout ? (level.knockout.variant === 'overloaded' ? t('20 зомбі, 150 HP, 1 пістолет, без магазину й гаджетів') : t('10 зомбі, 1 пістолет, без магазину й гаджетів')) : level.playground ? t('Спробуй будь-який гаджет без нагород і ризику') : bannerSub;
    this.hud.banner(bannerTitle, bannerText, 4.5);
    // ⭐ тост складності: лише соло-реплей на зірці >1 (кооп/перший прохід — завжди ★1)
    if (level.diffStar > 1) {
      this.hud.toast(t('⭐ Складність {n} — вороги міцніші, монет більше!', { n: level.diffStar }));
    }
  }

  // 🤝 гість: мегабокс на позиції хоста
  makeGuestMegabox(mb) {
    if (!this.level || this.level.megabox) return;
    this.level.megabox = new Megabox(this.level, mb.x, mb.z);
  }

  // 🤝 гість: перемога (подія від хоста)
  netVictory() {
    if (!this.level || this.victoryShown) return;
    this.audio.victory();
    this.audio.setMode(null);
    this.level.bossDefeated = true;
    this._showVictory();
  }

  // 🐾 (пере)створюємо улюбленця в поточному рівні за save.activePet (купівля або зміна в гардеробі)
  spawnPet() {
    if (!this.level) return;
    if (this.level.pet) this.level.pet.dispose();
    this.level.pet = this.save.activePet ? new Pet(this.level, this.save.activePet) : null;
  }

  // 🦙 нагорода Мегабокса: pity гарантує круте після 2 невдач
  openMegaboxReward(x, z) {
    const save = this.save;
    const level = this.level;
    if (Math.random() < 0.78) {
      save.crystals = (save.crystals || 0) + 15;
      this.hud.toast(t('💎 +15 кристалів з Мегабокса!'));
    }
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
        title = t('{i} НОВИЙ СКІН!', { i: HERO_SKINS[id].icon });
        sub = t('«{n}» — одягни в Гардеробі 🎒', { n: HERO_SKINS[id].name });
      } else {
        const id = unownedDances[0];
        save.dances.push(id);
        save.activeDance = id;
        title = t('{i} НОВИЙ ТАНЕЦЬ!', { i: DANCES[id].icon });
        sub = t('«{n}» — натисни N і танцюй!', { n: DANCES[id].name });
      }
    } else {
      save.megaPity = (save.megaPity || 0) + 1;
      if (roll < 0.62 || !level) {
        // фонтан монет
        if (level && level.mirror) {
          level.net.sendFountain(x, z);
        } else if (level) {
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            level.effects.spawnCoin(x + Math.cos(a) * (1 + Math.random() * 2.2), z + Math.sin(a) * (1 + Math.random() * 2.2), 14);
          }
        }
        title = t('💰 ФОНТАН МОНЕТ!');
        sub = t('Збирай скоріше! (наступний бокс щасливіший 😉)');
      } else if (roll < 0.83) {
        if (level) {
          level.player.grenades += 3;
          level.player.addRockets(2);
          level.player.addAmmo(120);
        }
        title = t('🧨 БОЙОВИЙ НАБІР!');
        sub = t('+3 гранати, +2 ракети і гора патронів!');
      } else {
        for (const k of ['speed', 'rage', 'bubble', 'magnet']) level.player.buffs[k] = 20;
        title = t('🌈 УСІ ПІДСИЛЕННЯ!');
        sub = t('Швидкість, лють, бульбашка і магніт — на 20 секунд!');
      }
    }
    this.hud.banner(title, sub, 4.5);
    this.saveGame();
  }

  // нагорода-зброя за країну: видається і запам'ятовується назавжди.
  // Якщо зброя вже куплена в магазині — компенсація монетами.
  unlockWeapon(id) {
    if (!id) return; // 🛡 ESP/PRT/ITA більше не мають weaponReward — гард від unlockWeapon(undefined)
    if (!this.level) return;
    if (this.level.playground) {
      this.level.player.giveWeapon(id);
      return;
    }
    if (this.save.weapons.includes(id)) {
      this.level.addCoins(300);
      this.hud.toast(t('🪙 Така зброя в тебе вже є — тримай +300 монет!'));
      return;
    }
    this.level.player.refillFuel(id); // 🔋 нова паливна зброя — повний балон
    this.save.weapons.push(id);
    const loadout = this._weaponLoadout();
    if (loadout.includes(id) || loadout.length < 7) {
      if (!loadout.includes(id)) this.save.weaponLoadout.push(id);
      this.level.player.giveWeapon(id);
    } else {
      this.hud.toast(t('🔓 Зброю відкрито! Додай її в Гардеробі — максимум 7.'));
    }
    this.saveGame();
  }

  endLevel() {
    // 🤝 кооп: рівень завершено — всі назад у лобі (кімната жива)
    if (this.level && this.level.net && this.coop) {
      const sess = this.coop.session;
      if (sess.role === 'host' && sess.state === 'level') {
        sess.transport.broadcast({ t: 'lvlend' });
      }
      sess.levelEnded();
      this.level.net = null;
      setTimeout(() => {
        if (sess.state === 'lobby') {
          this._showOverlay('overlay-lobby');
          this.coop._renderLobby();
        }
      }, 50);
    }
    if (this.level) {
      // standalone-ресурси Effects (оригінал tracerMat, гео монет/снарядів/гранат) обхід сцени
      // нижче не дістає — звільняємо їх явно, поки рівень ще цілий.
      if (this.level.worldBoss && this.level.worldBoss.dispose) this.level.worldBoss.dispose();
      if (this.level.effects && this.level.effects.dispose) this.level.effects.dispose();
      // звільняємо ресурси сцени — але НЕ спільні кешовані (matCache/geoCache/gradMap/bakedMat
      // із characters.js): вони живуть на весь сеанс і переюзаються наступними рівнями.
      // Диспоз спільного матеріалу/геометрії змусив би GPU перезаливати їх щоразу (ривок) і
      // покладався б на крихку ліниву реініціалізацію three. Позначка userData.shared їх береже.
      this.level.scene.traverse((o) => {
        if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.userData && m.userData.shared) return;
            if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose();
            m.dispose();
          });
        }
      });
      this.renderer.renderLists.dispose();
    }
    if (this._burstIv) { clearInterval(this._burstIv); this._burstIv = null; } // салют боса не тикає по знесеному рівню
    this._timeAcc = 0; // кооп-акумулятор не переносить борг між рівнями (інакше — ривок фаст-форварду на старті)
    this._applyDefaultExposure();
    this._restoreAdaptiveResolution();
    this._hitstopT = 0;
    this.level = null;
    this.state = 'globe';
    this.victoryShown = false;
    this.deathT = -1;
    this.input.exitLock();
    // прибираємо всі оверлеї рівня
    for (const id of ['overlay-death', 'overlay-pause', 'overlay-victory', 'overlay-start', 'overlay-storm-end', 'overlay-arena-end']) {
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
    if (this.level.bossRush) {
      if (this.level.net) {
        this.deathT = 9999;
        const card = document.querySelector('#overlay-death p');
        if (card) card.textContent = t('👑 Команда ще б\'ється! Чекай, поки друг підніме ({k}).', { k: interactKey() });
        this.audio.defeat();
        this._showOverlay('overlay-death');
        return;
      }
      this._endArenaRun();
      return;
    }
    if (this.level.storm) {
      if (this.level.net) {
        // ⛈️🤝 кооп-шторм: лежиш і чекаєш на підняття — авто-респавна немає.
        // Забіг завершується, лише коли впала ВСЯ команда (детектить хост).
        this.deathT = 9999;
        const card = document.querySelector('#overlay-death p');
        if (card) card.textContent = t('⛈️ Команда ще тримається! Чекай, поки друг підбіжить і підніме ({k}).', { k: interactKey() });
        this.audio.defeat();
        this._showOverlay('overlay-death');
        return;
      }
      this._endStormRun();
      return;
    }
    if (this.level.knockout) {
      this._endKnockoutRun(false);
      return;
    }
    if (this.level.defense) {
      this._endDefenseRun(false);
      return;
    }
    if (this.level.pvp) {
      this._endPvpRun(false);
      return;
    }
    if (this.level.worldBoss) {
      this._endWorldBossRun(false);
      return;
    }
    const coop = !!this.level.net;
    // кооп: лежиш 20с — друг може підняти; соло — швидкий респавн
    this.deathT = coop ? 20 : 3.5;
    const card = document.querySelector('#overlay-death p');
    if (card) {
      card.textContent = coop
        ? t('💚 Друг може підбігти і підняти тебе ({k})! Або відродишся біля бази.', { k: interactKey() })
        : t('Не хвилюйся — прогрес місій зберігся.');
    }
    this.audio.defeat();
    this._showOverlay('overlay-death');
  }

  // 🤝 друг підняв: встаємо на місці з половиною здоровʼя
  applyRevive(byNick = null) {
    if (!this.level || this.deathT < 0) return;
    const p = this.level.player;
    if (p.health > 0) return;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    p.health = Math.ceil(p.maxHealth * 0.5);
    p.respawnProtect = 2;
    p.vel.set(0, 0, 0);
    this.audio.heal();
    this.level.effects.burst(p.pos.clone().setY(p.pos.y + 1.4), 0x6dff9c, 14, { speed: 2.5, up: 3, life: 0.8 });
    this.hud.banner(t('💚 ТЕБЕ ПІДНЯЛИ!'), byNick ? t('{n} прийшов на допомогу — до бою!', { n: byNick }) : t('Дякуй другу і до бою!'));
  }

  // 🤝 підняття пораненого тіммейта: тримай E біля тіла 3 секунди
  _updateRevive(dt, allowControl) {
    const level = this.level;
    const me = level.player;
    if (me.health <= 0) { this._revProg = 0; return; }
    let target = null;
    for (const rp of level.net.remotes.values()) {
      if (rp.health > 0) continue;
      const d = Math.hypot(rp.pos.x - me.pos.x, rp.pos.z - me.pos.z);
      if (d < 2.8) { target = rp; break; }
    }
    if (!target) {
      this._revProg = 0;
      this._revTarget = null;
      return;
    }
    if (this._revTarget !== target.pid) {
      this._revTarget = target.pid;
      this._revProg = 0;
    }
    if (allowControl && this.input.down('KeyE')) {
      this._revProg = Math.min(1, (this._revProg || 0) + dt / 3);
      if (this._revProg >= 1) {
        this._revProg = 0;
        level.net.sendRevive(target.pid);
      }
    } else {
      this._revProg = Math.max(0, (this._revProg || 0) - dt * 0.7);
    }
    if (!level.missions.prompt) {
      level.missions.prompt = {
        text: t('💚 Тримай {k} — підніми {n}!', { k: interactKey(), n: target.nick }),
        hold: true,
        progress: this._revProg || 0,
      };
    }
  }

  _endStormRun() {
    const level = this.level;
    if (!level || !level.storm || level.storm.over) return;
    const res = level.storm.results();
    level.storm.over = true;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    // у коопі «Ще раз» недоречна — всі повертаються в лобі
    const retryBtn = document.getElementById('btn-storm-retry');
    if (retryBtn) retryBtn.style.display = level.net ? 'none' : '';
    this.audio.defeat();
    this.input.exitLock();
    // рекорд по країні
    const prev = this.save.stormBest[level.countryId];
    const isRecord = !prev || res.wave > prev.wave || (res.wave === prev.wave && res.time > prev.time);
    if (isRecord) this.save.stormBest[level.countryId] = { wave: res.wave, time: res.time };
    this.progress.addXp(20 + res.wave * 5);
    // ⛈️ нагороди за досягнуті хвилі (раз назавжди)
    this.save.stormRewards = this.save.stormRewards || {};
    const STORM_MILESTONES = [
      { wave: 5, type: 'tracer', id: 'storm', label: t('🌩️ Штормові кулі') },
      { wave: 8, type: 'dance', id: 'lightning', label: t('⚡ Танець «Блискавка»') },
      { wave: 12, type: 'skin', id: 'hunter', label: t('🌙 Скін «Нічний мисливець»') },
      { wave: 16, type: 'skin', id: 'thunder', label: t('⚡ Скін «Громовідвід»') },
    ];
    for (const ms of STORM_MILESTONES) {
      if (res.wave < ms.wave || this.save.stormRewards[ms.id]) continue;
      this.save.stormRewards[ms.id] = true;
      const pool = ms.type === 'tracer' ? this.save.tracers : ms.type === 'dance' ? this.save.dances : this.save.skins;
      if (!pool.includes(ms.id)) pool.push(ms.id);
      this.hud.banner(t('⛈️ НАГОРОДА ШТОРМУ!'), t('{l} — дивись у Гардеробі 🎒', { l: ms.label }), 5);
      this.audio.levelUp();
    }
    this.saveGame();
    // 🏆 Ліга: відправляємо результат і показуємо місце у світі
    const placeEl = document.getElementById('storm-league-place');
    if (placeEl) {
      placeEl.textContent = '';
      const team = level.net
        ? [...this.coop.session.roster.values()].map((r) => r.nick || '')
        : [];
      submitScore(this, { mode: 'storm', country: level.countryId, score: res.wave, team }).then((r) => {
        if (r && r.me) placeEl.textContent = t('🌍 Твоє місце у світовій Лізі: #{r}', { r: r.me.rank });
      });
    }
    const rec = isRecord && prev ? t(' <span class="record-badge">🏆 НОВИЙ РЕКОРД!</span>') : '';
    const best = this.save.stormBest[level.countryId];
    const rb = level.runBuild;
    const buildRow = rb && rb.picks.length
      ? `<div class="stat"><span class="stat-icon">🎲</span><span class="stat-name">${t('Твоя збірка')}</span><span class="stat-val">${rb.summary()}</span></div>`
      : '';
    document.getElementById('storm-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🌀</span><span class="stat-name">${t('Хвиль відбито')}${rec}</span><span class="stat-val">${res.wave - 1}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Протримався')}</span><span class="stat-val">${Math.floor(res.time / 60)}:${String(res.time % 60).padStart(2, '0')}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      ${buildRow}
      <div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">${t('Рекорд')} (${this.level.country.name})</span><span class="stat-val">${t('хвиля')} ${best.wave}</span></div>`;
    this._showOverlay('overlay-storm-end');
  }

  // 👑 кінець забігу Арени (перемога над усіма або падіння команди)
  _endArenaRun() {
    const level = this.level;
    if (!level || !level.bossRush || level.bossRush.over) return;
    const res = level.bossRush.results();
    level.bossRush.over = true;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    if (level.net && level.net.authority) {
      level.netEv('arenaend');
      level.net.flushEvents();
    }
    const retryBtn = document.getElementById('btn-arena-retry');
    if (retryBtn) retryBtn.style.display = level.net ? 'none' : '';
    if (res.completed) this.audio.victory();
    else this.audio.defeat();
    this.input.exitLock();
    if (retryBtn) retryBtn.textContent = t('👑 Ще раз!');
    this._lastEndMode = 'arena';
    // рекорд: лише ПОВНІ проходження, менший час кращий
    let isRecord = false;
    if (res.completed) {
      const prev = this.save.arenaBest;
      isRecord = !prev || res.timeMs < prev;
      if (isRecord) this.save.arenaBest = res.timeMs;
      this.progress.addXp(150);
    } else {
      this.progress.addXp(15 + res.bosses * 20);
    }
    this.saveGame();
    // 🏆 Ліга (тільки завершені забіги)
    const placeEl = document.getElementById('arena-league-place');
    if (placeEl) {
      placeEl.textContent = '';
      if (res.completed) {
        const team = level.net
          ? [...this.coop.session.roster.values()].map((r) => r.nick || '')
          : [];
        submitScore(this, { mode: 'arena', country: 'ALL', score: res.timeMs, team }).then((r) => {
          if (r && r.me) placeEl.textContent = t('🌍 Твоє місце у світовій Лізі: #{r}', { r: r.me.rank });
        });
      }
    }
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.querySelector('#overlay-arena-end h1').textContent = res.completed
      ? t('👑 УСІХ БОСІВ ПЕРЕМОЖЕНО!')
      : t('💀 Арена цього разу сильніша…');
    const recBadge = isRecord && res.completed ? t(' <span class="record-badge">🏆 НОВИЙ РЕКОРД!</span>') : '';
    const best = this.save.arenaBest;
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">👑</span><span class="stat-name">${t('Босів переможено')}</span><span class="stat-val">${res.bosses} / ${CAMPAIGN_ORDER.length}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${best ? `<div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">${t('Рекорд')}</span><span class="stat-val">${Math.floor(best / 60000)}:${String(Math.floor((best % 60000) / 1000)).padStart(2, '0')}</span></div>` : ''}
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${level.stats.kills}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endKnockoutRun(won = true) {
    const level = this.level;
    if (!level || !level.knockout || level.knockout.over) return;
    level.knockout.completed = !!won;
    const res = level.knockout.results();
    level.knockout.over = true;
    level.bossDefeated = !!won;
    this.victoryShown = true;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.audio.setMode(null);
    this.input.exitLock();
    const retryBtn = document.getElementById('btn-arena-retry');
    if (retryBtn) {
      retryBtn.style.display = '';
      retryBtn.textContent = t('🥊 Ще раз!');
    }

    let roll = Math.random();
    if (this._knockoutForce !== undefined) {
      roll = this._knockoutForce;
      this._knockoutForce = undefined;
    }
    let rewardTitle = t('Без нагороди');
    if (won) {
      this.progress.addXp(80);
      rewardTitle = t('🪙 +100 монет');
      if (roll < KNOCKOUT_STAFF_CHANCE && !this.save.weapons.includes('staff')) {
        this.save.weapons.push('staff');
        this._weaponLoadout();
        level.player.giveWeapon('staff');
        rewardTitle = t('🪄 Випав Посох!');
        this.hud.banner(t('🥊 НОКАУТ ПРОЙДЕНО!'), t('З ящика випав Посох!'), 4.5);
      } else if (roll < 0.98) {
        this.save.crystals = (this.save.crystals || 0) + 5;
        rewardTitle = t('💎 +5 кристалів');
        this.hud.banner(t('🥊 НОКАУТ ПРОЙДЕНО!'), t('+5 кристалів з ящика'), 4.5);
      } else {
        level.addCoins(100);
        this.hud.banner(t('🥊 НОКАУТ ПРОЙДЕНО!'), t('+100 монет з ящика'), 4.5);
      }
      this.saveGame();
    }
    this._lastEndMode = 'knockout';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🥊 НОКАУТ ПРОЙДЕНО!') : t('💀 НОКАУТ ПРОГРАНО');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills} / ${level.knockout.target}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Ящик зі зброєю')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endDefenseRun(won = true) {
    const level = this.level;
    if (!level || !level.defense || level.defense.over) return;
    level.defense.completed = !!won;
    const res = level.defense.results();
    level.defense.over = true;
    level.bossDefeated = !!won;
    this.victoryShown = true;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.audio.setMode(null);
    this.input.exitLock();
    const retryBtn = document.getElementById('btn-arena-retry');
    if (retryBtn) {
      retryBtn.style.display = '';
      retryBtn.textContent = t('🛡️ Ще раз!');
    }
    if (won) {
      this.progress.addXp(100);
      level.addCoins(150);
      this.saveGame();
    }
    this._lastEndMode = level.defense.variant === 'overloaded' ? 'overloaded-defense' : 'defense';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🛡️ ОБОРОНА ВИСТОЯЛА!') : t('💀 ВЕЖУ ЗРУЙНОВАНО');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🗼</span><span class="stat-name">${t('HP вежі')}</span><span class="stat-val">${res.towerHp} / ${level.defense.towerMaxHp}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills} / ${level.defense.target}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endPvpRun(won = true) {
    const level = this.level;
    if (!level || !level.pvp || level.pvp.over) return;
    level.pvp.completed = !!won;
    const res = level.pvp.results();
    level.pvp.over = true;
    level.bossDefeated = !!won;
    this.victoryShown = true;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.audio.setMode(null);
    this.input.exitLock();
    const retryBtn = document.getElementById('btn-arena-retry');
    if (retryBtn) {
      retryBtn.style.display = '';
      retryBtn.textContent = t('⚔️ Ще раз!');
    }

    let rewardTitle = t('Без нагороди');
    if (won) {
      let roll = Math.random();
      if (this._pvpForce !== undefined) {
        roll = this._pvpForce;
        this._pvpForce = undefined;
      }
      if (roll < 0.5) {
        level.addCoins(100);
        rewardTitle = t('🪙 +100 монет');
      } else {
        this.save.crystals = (this.save.crystals || 0) + 3;
        rewardTitle = t('💎 +3 кристали');
        this.saveGame();
      }
    }
    this._lastEndMode = 'pvp';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('⚔️ ПВП ПЕРЕМОГА!') : t('💀 ПВП ПРОГРАНО');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills} / ${level.pvp.target}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endWorldBossRun(won = true) {
    const level = this.level;
    if (!level || !level.worldBoss) return;
    const mode = level.worldBoss;
    if (mode._ended) return;
    mode._ended = true;
    mode.completed = !!won;
    mode.over = true;
    level.bossDefeated = !!won;
    this.victoryShown = !!won;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.audio.setMode(null);
    this.input.exitLock();
    const retryBtn = document.getElementById('btn-arena-retry');
    if (retryBtn) {
      retryBtn.style.display = '';
      retryBtn.textContent = t('🌋 Ще раз!');
    }

    let rewardTitle = t('Нагороду вже отримано');
    const firstClear = won && !(this.save.worldBosses && this.save.worldBosses[mode.id]);
    if (firstClear) {
      this.save.worldBosses = this.save.worldBosses || {};
      this.save.worldBosses[mode.id] = true;
      this.save.coins += mode.cfg.reward.coins;
      this.save.crystals = (this.save.crystals || 0) + mode.cfg.reward.crystals;
      this.progress.addXp(mode.cfg.reward.xp);
      rewardTitle = t('🪙 +{c} · 💎 +{k} · ⭐ +{x} XP', {
        c: mode.cfg.reward.coins,
        k: mode.cfg.reward.crystals,
        x: mode.cfg.reward.xp,
      });
      this.saveGame();
    }

    this._lastEndMode = 'worldboss';
    this._lastWorldBossId = mode.id;
    const res = mode.results();
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🌋 СВІТОВОГО БОСА ПЕРЕМОЖЕНО!') : t('💀 БОС СИЛЬНІШИЙ ЦЬОГО РАЗУ');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">${mode.cfg.icon}</span><span class="stat-name">${t('Бос')}</span><span class="stat-val">${mode.cfg.shortName()}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${level.stats.kills}</span></div>
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${won ? rewardTitle : t('Без нагороди')}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _onBossDied() {
    if (this.level && this.level.bossRush) {
      this.level.bossRush.onBossDied();
      return;
    }
    if (this.level && this.level.worldBoss) {
      this.level.worldBoss.onBossDied();
      return;
    }
    if (this.level && this.level.storm) {
      // ⛈️ міні-бос шторму: бонус і граємо далі
      this.level.addCoins(120);
      this.progress.addXp(60);
      this.hud.banner(t('👑 МІНІ-БОСА ПЕРЕМОЖЕНО!'), t('+120 монет · шторм триває!'));
      // кооп: гостю — той самий бонус монет + банер (XP лишається локальним: це особиста прогресія)
      this.level.netEv('sbb', 120);
      this.level.netEv('banner', t('👑 МІНІ-БОСА ПЕРЕМОЖЕНО!'), t('+120 монет · шторм триває!'), 3.2);
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
    // салют (зберігаємо хендл — endLevel його гасить, щоб не тикав по знесеному рівню)
    let burstN = 0;
    if (this._burstIv) clearInterval(this._burstIv);
    const burstIv = this._burstIv = setInterval(() => {
      if (!this.level || burstN++ > 10) { clearInterval(burstIv); this._burstIv = null; return; }
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
    if (this.level.playground) return;
    this.victoryShown = true;
    // якщо гравця встигли вдарити в момент перемоги — скасовуємо смерть
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    const country = this.level.country;
    const wasLiberated = !!this.save.liberated[country.id];
    this.save.liberated[country.id] = true;
    // 🎁 нагорода-зброя країни видається ОДРАЗУ в момент перемоги (раніше з'являлась лише
    // після наступного завантаження, якщо у наборі не випала місія «зачистка складу»)
    if (country.weaponReward && !this.save.weapons.includes(country.weaponReward)) {
      this.save.weapons.push(country.weaponReward);
      const loadout = this._weaponLoadout();
      if (!loadout.includes(country.weaponReward) && loadout.length < 7) {
        loadout.push(country.weaponReward);
        this.save.weaponLoadout = loadout;
      }
      if (this.level.player && loadout.includes(country.weaponReward)) this.level.player.giveWeapon(country.weaponReward, false);
      if (country.weaponRewardToast) {
        this.hud.toast(typeof country.weaponRewardToast === 'function' ? country.weaponRewardToast() : country.weaponRewardToast);
      }
    } else if (!country.weaponReward && country.coinReward) {
      // 🇪🇸/🇮🇹 більше не дають зброю — натомість монети (вогнемет/лазер тепер за зірковий рівень)
      this.save.coins += country.coinReward;
      this.hud.toast(t('🏆 {n} звільнено! +{c} монет 💰', { n: country.name, c: country.coinReward }));
    }
    // наступне проходження цієї країни отримає НОВИЙ набір місій
    this.save.missionRuns[country.id] = (this.save.missionRuns[country.id] || 0) + 1;
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
    // ⭐ бонус монет за складність: тільки соло-реплей на зірці >1 (★1 — без змін)
    if (this.level.diffStar > 1) {
      const baseReward = s.coinsEarned;
      const bonus = Math.round(baseReward * 0.25 * (this.level.diffStar - 1));
      if (bonus > 0) {
        this.save.coins += bonus;
        s.coinsEarned += bonus;
        this.hud.toast(t('⭐ Бонус за складність: +{n} монет!', { n: bonus }));
      }
    }
    this.progress.addXp(XP_VALUES.country);
    if (!wasLiberated) this.quests.onEvent('country');
    this.saveGame();
    if (this.level.net && this.level.net.authority) this.level.netEv('vict');
    this.globe.setLiberated();
    this.input.exitLock();
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
    document.querySelector('#overlay-victory h1').textContent = country.victoryTitle;
    document.querySelector('.victory-sub').textContent = t('Ти переміг боса «{b}» і врятував країну!', { b: country.boss.name.replace('👑 ', '') });
    const recBadge = isRecord && prev ? t(' <span class="record-badge">🏆 НОВИЙ РЕКОРД!</span>') : '';
    const bestLine = prev && !isRecord
      ? `<div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">${t('Рекорд часу')}</span><span class="stat-val">${Math.floor(prev.time / 60)}:${String(prev.time % 60).padStart(2, '0')}</span></div>`
      : '';
    document.getElementById('victory-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${bestLine}
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${s.kills}</span></div>
      <div class="stat"><span class="stat-icon">🔥</span><span class="stat-name">${t('Найкраще комбо')}</span><span class="stat-val">x${this.level.combo.best}</span></div>
      <div class="stat"><span class="stat-icon">🎯</span><span class="stat-name">${t('Точність')}</span><span class="stat-val">${acc}%</span></div>
      <div class="stat"><span class="stat-icon">💰</span><span class="stat-name">${t('Монет здобуто')}</span><span class="stat-val">${s.coinsEarned}</span></div>
      <div class="stat"><span class="stat-icon">💀</span><span class="stat-name">${t('Смертей')}</span><span class="stat-val">${s.deaths}</span></div>`;
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
  _frame(skipRender = false) {
    if (this._contextLost) {
      if (this.clock) this.clock.getDelta();
      return;
    }
    // 🤝 кооп: накопичуємо РЕАЛЬНИЙ час і за потреби робимо кілька кроків —
    // після сну вкладки (фонові пачки повідомлень тікера) світ наздоганяє
    // годинник, а не падає у slow-motion
    if (this.level && this.level.net) {
      const real = Math.min(this.clock.getDelta(), 1);
      // не більше 1.5с боргу: після дуже довгого сну наздоганяємо лише хвіст
      this._timeAcc = Math.min((this._timeAcc || 0) + real, 1.5);
      let steps = 0;
      while (this._timeAcc > 0.0004 && steps < 10) {
        steps++;
        const dt = Math.min(this._timeAcc, 0.05);
        this._timeAcc -= dt;
        const last = this._timeAcc <= 0.0004 || steps === 10;
        this._step(dt, skipRender || !last);
      }
      return;
    }
    const real = this.clock.getDelta();
    this._step(Math.min(real, 0.05), skipRender);
  }

  _step(dt, skipRender, timerDt = dt) {
    timerDt = Math.min(timerDt, dt);
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
      // адаптивна роздільність (Авто/Гарна, лише в бою): гістерезис, щоб не «пульсувало» —
      // довго < 48 fps → знижуємо рендер-масштаб; довго > 57 fps → піднімаємо назад до рідного.
      if (this._adaptiveResolutionEnabled() && this.state === 'level') {
        if (this.fps < 48) {
          this._highFpsSec = 0;
          if (++this._lowFpsSec >= 3 && this.pixelRatio > 1.0) {
            this.pixelRatio = Math.max(1.0, this.pixelRatio - 0.25);
            this.renderer.setPixelRatio(this.pixelRatio);
            this.renderer.setSize(innerWidth, innerHeight);
            this._lowFpsSec = 0;
          }
        } else if (this.fps > 57) {
          this._lowFpsSec = 0;
          // після короткої просадки відновлюємось, коли FPS стабільно високий
          if (++this._highFpsSec >= 4 && this.pixelRatio < this._autoTargetRatio) {
            this.pixelRatio = Math.min(this._autoTargetRatio, this.pixelRatio + 0.25);
            this.renderer.setPixelRatio(this.pixelRatio);
            this.renderer.setSize(innerWidth, innerHeight);
            this._highFpsSec = 0;
          }
        } else {
          // «нейтральна» зона 48–57: не рухаємось, але й не накопичуємо лічильники
          this._lowFpsSec = 0;
          this._highFpsSec = 0;
        }
      } else {
        this._lowFpsSec = 0;
        this._highFpsSec = 0;
      }
    }
    // тіні оновлюємо через кадр — для мультяшного стилю 30 Гц непомітно
    if ((this._shadowFrame = (this._shadowFrame + 1) % 2) === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    if (this.state === 'globe') {
      this.globe.update(dt);
      if (!skipRender) this.renderer.render(this.globe.scene, this.globe.camera);
    } else if (this.state === 'hqbase') {
      this.hqbase.update(dt);
      if (!skipRender) this.renderer.render(this.hqbase.scene, this.hqbase.camera);
    } else if (this.state === 'level' && this.level) {
      const isCoop = !!this.level.net;
      // кооп: пауза/магазин ховають керування, але світ ЖИВЕ (інші ж грають!)
      const blocked = isCoop ? this.victoryShown : (this.paused || this.shop.isOpen || this.draft.isOpen || this.victoryShown);
      const hitstopScale = this._hitstopT > 0 ? 0.15 : 1;
      if (this._hitstopT > 0) this._hitstopT = Math.max(0, this._hitstopT - timerDt);
      const simDt = dt * hitstopScale;
      if (!blocked) {
        const alive = this.level.player.health > 0;
        const allowControl = (this.input.locked || this.testMode || this.input.touchMode)
          && this.deathT < 0 && alive
          && !(isCoop && (this.paused || this.shop.isOpen));
        this.level.player.update(simDt, this.input, allowControl);
        this.level.zombies.update(simDt);
        this.level.missions.update(simDt, this.input, allowControl);
        // іграшки: самокати, мегабокс, гаджети, песик
        if (!this.level.noGadgets) this.level.vehicles.update(simDt, this.input, allowControl);
        if (this.level.megabox && !this.level.megabox.done) {
          this.level.megabox.update(simDt, this.input, allowControl);
        }
        if (!this.level.noGadgets || this.level.modeShield) this.level.gadgets.update(simDt, this.input, allowControl);
        if (this.level.net) this._updateRevive(simDt, allowControl);
        if (this.level.pet) this.level.pet.update(simDt);
        this.level.world.update(simDt, this.level.player.pos);
        this.level.effects.update(simDt);
        this.level.stats.time += timerDt;
        this._updateDayNight();
        // комбо згасає разом із симуляцією: freeze-frame не краде серію
        if (this.level.combo.t > 0) {
          this.level.combo.t -= simDt;
          if (this.level.combo.t <= 0) this.level.combo.n = 0;
        }
        this._updateMusic(simDt);
        // відлік смерті
        if (this.deathT >= 0) {
          this.deathT -= timerDt;
          const n = Math.max(1, Math.ceil(this.deathT));
          document.getElementById('death-countdown').textContent = n;
          if (this.deathT <= 0) {
            this._hideOverlay('overlay-death');
            this.level.player.respawn();
            if (!this.level.mirror) this.level.zombies.clearNear(this.level.world.layout.SPAWN.x, this.level.world.layout.SPAWN.z, 30);
            this.deathT = -1;
            // на тачі pointer-lock не потрібен (і input.locked завжди false) — не показуємо
            // зайвий екран «торкнись, щоб грати» після кожного респавну
            if (!this.testMode && !this.input.locked && !this.input.touchMode) this._showOverlay('overlay-start');
          }
        }
      }
      if (this.level.net) this.level.net.update(dt);
      this.hud.update(dt);
      if (!skipRender) this.renderer.render(this.level.scene, this.level.player.camera);
    }
    this.input.postUpdate();
  }

  // 🌙 цикл день/ніч: ~2хв день → 20с сутінки → ~1хв ніч → 20с світанок.
  // nightK їде від часу рівня, тож у коопі ніч настає в усіх ОДНОЧАСНО.
  _updateDayNight() {
    const level = this.level;
    if (!level) return;
    const CYCLE = 220;
    const ct = level.stats.time % CYCLE;
    let k = 0;
    if (ct < 120) k = 0;
    else if (ct < 140) k = (ct - 120) / 20;
    else if (ct < 195) k = 1;
    else if (ct < 215) k = 1 - (ct - 195) / 20;
    k = k * k * (3 - 2 * k); // плавні переходи
    level.nightK = k;
    level.world.setNight(k);
    level.player.setLamp(k);
    const isNight = k > 0.5;
    if (isNight && !this._nightAnnounced) {
      this._nightAnnounced = true;
      this.hud.toast(t('🌙 НІЧ! Зомбі бачать далі — твій ліхтарик увімкнено'));
    } else if (!isNight && this._nightAnnounced) {
      this._nightAnnounced = false;
      this.hud.toast(t('☀️ Світанок! Зомбі знову сонні'));
    }
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
        // у дзеркалі гостя агро читаємо зі стану снапшота (біт chase)
        const aggro = zb.aggroed || ((zb.netB || 0) & 7) === 1;
        if (zb.state !== 'dead' && aggro && Math.hypot(zb.x - p.x, zb.z - p.z) < 40) {
          mode = 'battle';
          break;
        }
      }
    }
    this.audio.setMode(mode);
  }

  showPause() {
    this.paused = true;
    const note = document.getElementById('pause-coop-note');
    if (note) note.style.display = this.level && this.level.net ? 'block' : 'none';
    this._showOverlay('overlay-pause');
  }

  // ---------- API для автотестів ----------
  get test() {
    const g = this;
    return {
      state: () => ({
        state: g.state,
        coins: g.save.coins,
        crystals: g.save.crystals || 0,
        fps: g.fps,
        country: g.level ? g.level.countryId : null,
        grenades: g.level ? g.level.player.grenades : 0,
        combo: g.level ? g.level.combo.n : 0,
        liberated: liberatedIds(g.save.liberated),
        player: g.level ? {
          x: g.level.player.pos.x, y: g.level.player.pos.y, z: g.level.player.pos.z,
          health: g.level.player.health, weapons: g.level.player.weapons, cur: g.level.player.cur,
          firstPerson: g.level.player.firstPerson,
          armor: g.level.player.armor, maxArmor: g.level.player.maxArmor,
          buffs: { ...g.level.player.buffs },
          rockets: g.level.player.ammo.bazooka.reserve + g.level.player.ammo.bazooka.mag,
        } : null,
        // id — стабільні назви слотів (сумісність зі старими тестами), type — справжній тип
        missions: g.level ? g.level.missions.missions.map((m, i) => ({
          id: ['rescue', 'tower', 'warehouse'][i] || m.id, type: m.type || m.id, state: m.state,
        })) : null,
        missionRuns: { ...g.save.missionRuns },
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
        megaQuests: g.quests.megaList.map((q) => ({ id: q.id, ev: q.ev, progress: q.progress, target: q.target, done: q.done })),
        megabox: g.level && g.level.megabox ? { x: g.level.megabox.x, z: g.level.megabox.z, opened: g.level.megabox.opened } : null,
        pet: g.level ? !!g.level.pet : false,
        activePet: g.save.activePet || null,
        pets: [...(g.save.pets || [])],
        riding: g.level ? !!g.level.player.riding : false,
        emoting: g.level ? g.level.player.emoting : null,
        scooters: g.level ? g.level.vehicles.list.map((r) => ({ x: r.x, z: r.z })) : [],
        walls: g.level ? g.level.gadgets.walls.map((w) => ({ x: w.x, z: w.z, hp: w.hp })) : [],
        tramps: g.level ? g.level.gadgets.tramps.length : 0,
        jumpPads: g.level ? g.level.world.jumpPads.length : 0,
        nightK: g.level ? Math.round((g.level.nightK || 0) * 100) / 100 : 0,
        storm: g.level && g.level.storm ? {
          wave: g.level.storm.wave, r: g.level.storm.r,
          outside: g.level.storm.isOutside(), over: g.level.storm.over,
          phase: g.level.storm.phase,
        } : null,
        worldBoss: g.level && g.level.worldBoss ? {
          id: g.level.worldBoss.id,
          over: g.level.worldBoss.over,
          bossHp: g.level.zombies.boss ? g.level.zombies.boss.hp : null,
          shield: !!(g.level.zombies.boss && g.level.zombies.boss.worldBossShield),
          coreOpen: !!(g.level.zombies.boss && g.level.zombies.boss.worldBossCoreOpen),
          hazards: g.level.worldBoss.hazards.length,
        } : null,
        stormBest: { ...g.save.stormBest },
        worldBosses: { ...(g.save.worldBosses || {}) },
      }),
      playgroundSelectGadget: (id) => {
        if (g.level && g.level.playground && GADGETS[id]) {
          g.level.playgroundGadget = id;
          g._startGadgetChallenge(g.level, id);
        }
      },
      setLevelTime: (t) => { g.level.stats.time = t; },
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
        if (g.level.missions) g.level.missions.pendingHorde = null;
        zm.hordePending = 0;
        for (const zb of [...zm.list]) {
          if (zb.horde && zb.state !== 'dead') zb.damage(99999, null, false);
        }
        zm.hordeRemaining = 0;
        zm.hordeActive = false;
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
      giveGadgets: (tramps = 1, walls = 1) => {
        // ponytail: legacy screenshot helper; gadgets are now unlocks, not consumable counts.
        const ids = [];
        if (tramps > 0) ids.push('tramp');
        if (walls > 0) ids.push('wall');
        for (const id of ids) {
          if (!g.save.gadgetsOwned.includes(id)) g.save.gadgetsOwned.push(id);
        }
        if (!g.save.activeGadget && ids.length) g.save.activeGadget = ids[0];
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
      startArena: () => g.startArena(),
      startKnockout: () => g.startKnockout(),
      startOverloadedKnockout: () => {
        g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
        return g.startOverloadedKnockout();
      },
      startDefense: () => {
        g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
        return g.startDefense();
      },
      startOverloadedDefense: () => {
        g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
        return g.startOverloadedDefense();
      },
      startPvp: () => {
        g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true };
        return g.startPvp();
      },
      startOverloadedPvp: () => {
        g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true };
        return g.startOverloadedPvp();
      },
      weapon: (id) => WEAPONS[id] || null,
      startWorldBoss: (id) => {
        g.save.liberated = { UKR: true, POL: true, DEU: true, FRA: true, ESP: true, PRT: true, ITA: true, TUR: true, EGY: true, JPN: true, CHN: true, DIN: true };
        return g.startWorldBoss(id);
      },
      knockoutForce: (roll) => { g._knockoutForce = roll; },
      pvpForce: (roll) => { g._pvpForce = roll; },
      finishKnockout: () => {
        for (const zb of [...g.level.zombies.list]) {
          if (zb.knockout && zb.state !== 'dead') zb.damage(99999, null, false);
        }
        g._endKnockoutRun();
      },
      finishPvp: () => {
        for (const zb of [...g.level.zombies.list]) {
          if (zb.pvp && zb.state !== 'dead') zb.damage(99999, null, false);
        }
        g.level.pvp.update();
      },
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
      givePet: (id = 'dog') => {
        if (!g.save.pets.includes(id)) g.save.pets.push(id);
        g.save.activePet = id;
        g.spawnPet();
      },
      setActivePet: (id) => {
        if (!g.save.pets.includes(id)) g.save.pets.push(id);
        g.save.activePet = id;
        g.saveGame();
        g.spawnPet();
      },
      petPos: () => g.level.pet ? { x: g.level.pet.x, z: g.level.pet.z } : null,
      petKind: () => g.level.pet ? g.level.pet.id : null,
      rollMissions: (c, seed, run) => rollMissionSet(c, seed, run),
      missionTypes: () => Object.keys(MISSION_TYPES),
      setMissionRun: (c, n) => {
        g.save.missionRuns[c] = n;
        g.saveGame();
      },
      forceMissions: (types) => { g._forceMissionSet = types; },
      // 🤝 кооп
      coopCreate: async (nick) => {
        const code = await g.coop.session.create(nick || t('Хост'));
        g.coop._openLobby(); // як у UI: вмикає лобі-пінги (анонс кімнати)
        return code;
      },
      coopJoin: async (code, nick) => {
        await g.coop.session.join(code, nick || t('Гість'));
        g.coop._openLobby();
      },
      coopSetCountry: (c) => g.coop.session.setCountry(c),
      coopSetMode: (mo) => g.coop.session.setMode(mo),
      coopStartLevel: () => g.coop.session.startLevel(),
      coopLeave: () => g.coop.session.leave(),
      coopState: () => {
        const s = g.coop.session;
        const net = g.level && g.level.net;
        return {
          role: s.role, room: s.room, state: s.state, myPid: s.myPid,
          roster: [...s.roster.entries()].map(([pid, r]) => ({ pid, nick: r.nick })),
          remotes: net ? [...net.remotes.keys()] : [],
          remotePos: net ? Object.fromEntries([...net.remotes.entries()].map(([pid, rp]) => [pid,
            { x: Math.round(rp.pos.x * 10) / 10, y: Math.round(rp.pos.y * 10) / 10, z: Math.round(rp.pos.z * 10) / 10, hp: rp.health }])) : {},
          remotePets: net ? Object.fromEntries([...net.remotes.entries()].map(([pid, rp]) => [pid, rp.petId || null])) : {},
          aliveZombies: g.level ? g.level.zombies.list.filter((z) => z.state !== 'dead').length : 0,
          items: g.level ? g.level.effects.coins.length : 0,
          waiting: (net && net.waiting) || false,
          connected: s.transport.connected,
        };
      },
    };
  }
}

new Game();
