// Головний модуль: state machine (глобус ↔ рівень), цикл гри, збереження
import * as THREE from 'three';
import { t, keyHint, interactKey, translateHtml, getLang, setLang, LANGS, LANG_NAMES } from './i18n.js';
import { Input } from './input.js';
import { AudioMan } from './audio.js';
import { World } from './world.js';
import { Player, WEAPONS, WEAPON_SLOTS } from './player.js';
import { Zombies, BESTIARY_TYPE_IDS } from './zombies.js';
import { DynamicMissions, rollMissionSet, MISSION_TYPES } from './missionpool.js';
import { StoryMissions, storyMissionPreview } from './story/storymissions.js';
import { shouldUseStoryMissions } from './story/countryStories.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Shop, goalInfo, SHOP_ITEMS } from './shop.js';
import { Draft } from './draft.js';
import { RunBuild } from './runbuild.js';
import { advanceMomentum, tickMomentum } from './combatmomentum.js';
import {
  EXPEDITION_NODE_TYPES, EXPEDITION_STEPS, chooseExpeditionNode, completeExpeditionNode,
  createExpedition, expeditionCard, expeditionLevelConfig, sanitizeExpedition,
} from './expedition.js';
import {
  EXPEDITION_FIGHTER_IDS, FIGHTER_UPGRADE_COSTS, SPECIALISTS,
  buyFighterLevel, claimSpecialistMastery, fighterLevelMultiplier,
  sanitizeFighterId, sanitizeFighterLevels, sanitizeSpecialistClaims, sanitizeSpecialistId,
  sanitizeSpecialistXp, specialistModifiers, specialistRank,
} from './specialists.js';
import {
  applyFrontEvent, createFront, frontCountryState, frontStageConfig, frontViewModel, sanitizeFront,
} from './worldfront.js';
import { encounterPlan, specialistEffects } from './worldevents.js';
import { Globe } from './globe.js';
import { getMoonRegion, getSpaceWorld } from './moonregions.js';
import { MoonHazards } from './moonhazards.js';
import { Bus, RNG, disposeObject } from './utils.js';
import { COUNTRIES, CAMPAIGN_ORDER, getBiome, isCountryOpen, nextTarget } from './countries.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { Progress, DailyQuests, DailyGift, GIFT_TABLE, PASS_REWARDS, PASS_MAX_LEVEL, xpForLevel, XP_VALUES } from './progress.js';
import { Megabox, Pet, Vehicles, Gadgets, GADGETS, TOWER_SKINS, SuperPickup } from './extras.js';
import { StormMode } from './storm.js';
import { Sandstorm } from './sandstorm.js';
import { BossRush } from './bossrush.js';
import {
  KnockoutMode, KNOCKOUT_UNLOCK_LEVEL, KNOCKOUT_STAFF_CHANCE,
  OVERLOADED_KNOCKOUT_UNLOCK_COUNTRIES,
} from './knockout.js';
import { DefenseMode, DEFENSE_UNLOCK_COUNTRIES, OVERLOADED_DEFENSE_UNLOCK_COUNTRIES, ZONE_DEFENSE_UNLOCK_COUNTRIES } from './defense.js';
import { TurretWarMode, TURRETWAR_UNLOCK_COUNTRIES } from './turretwar.js';
import { PvpMode, PVP_UNLOCK_COUNTRIES, OVERLOADED_PVP_UNLOCK_COUNTRIES } from './pvp.js';
import { BankMode, BANK_UNLOCK_COUNTRIES } from './bank.js';
import { PortalMode, PORTAL_UNLOCK_COUNTRIES } from './portal.js';
import { MazeMode, MAZE_UNLOCK_COUNTRIES } from './maze.js';
import { HumansMode, HUMANS_UNLOCK_COUNTRIES, OVERLOADED_HUMANS_UNLOCK_COUNTRIES } from './humans.js';
import { SoulCollectorMode, SOUL_COLLECTOR_UNLOCK_LEVEL, SOUL_LEVEL_COST, SOUL_WIN_REWARD } from './souls.js';
import {
  WorldBossMode, WORLD_BOSSES, WORLD_BOSS_BY_ID, WORLD_BOSS_MIN_COUNTRIES,
  worldBossUnlocked,
} from './worldboss.js';
import { RadiationMode, RADIATION_UNLOCK_COUNTRIES, RADIATION_WIN_COINS } from './radiationmode.js';
import {
  HERO_SKINS, DANCES, TRACERS, HERO_PALETTE, HERO_HATS, HERO_FACES,
  HERO_BODY_TYPES, HERO_HAIR, HERO_ACCESSORIES, HERO_BACKS, PETS, makeHero, makeCivilian, setAnim, updateRig,
} from './characters.js';
import { CoopUI } from './ui/coopui.js';
import { LeagueUI } from './ui/leagueui.js';
import { SaveUI } from './ui/saveui.js';
import { RescueHQ } from './ui/hq.js';
import { FrontUI } from './ui/frontui.js';
import { frontCountryCopy } from './ui/frontcopy.js';
import { LivingHQ } from './hqbase.js';
import { Chapter, CHAPTER2, CHAPTER3, CHAPTER2_UNLOCK_COUNTRIES } from './chapter.js';
import { TITLES, syncTitles } from './titles.js';
import { starTotal, countryStars, STARS_PER_COUNTRY, CAMPAIGN_STAR_MAX, STAR_THRESHOLDS, pickSecondaryObjective, COOP_SECONDARY_IDS } from './stars.js';
import { HiddenRescue, FRIENDS, FRIEND_TOTAL, friendFor, isFriendRescued, rescuedFriendCount } from './friends.js';
import {
  claimStarEggs, claimFriendEggs, claimBacklogEggs, openEgg, eggOddsText,
  petLevel, canFeed, feedCost, feedPet, activePetMagnet, PET_MAX_LEVEL,
  ELITE_CHEST_EGG_CHANCE, GOLDEN_CHEST_EGG_CHANCE,
} from './eggs.js';
import {
  ensureWeeklyCamp, bumpWeeklyCamp, weeklyCampState, weeklyCampReminder, claimWeeklyCamp,
} from './weeklycamp.js';
import { submitScore } from './net/league.js';
import { CloudSave, SAVE_KEY, DEFAULT_HERO, NEW_SAVE_COINS, liberatedIds, liberatedCount, hasLiberated } from './net/cloudsave.js';
import { frontMetricsEnabled, sendFrontMetric, sendFrontReturns, setFrontMetricsEnabled } from './net/frontmetrics.js';
import {
  MAP_SIZE_MODES, MAP_SIZE_METERS, MAP_STYLE_MODES,
  sanitizeMapSize, sanitizeMapStyle, scaleMap,
} from './mapsize.js';

// v305: розпил main.js — таблиці режимів, нагороди, альбом, енд-скріни й тест-хуки
// переїхали у власні модулі; тут лишились тонкі делегати (тіла з this→game).
import {
  CHEST_REWARDS,
  grantEliteChestCoop, grantGoldenChestCoop, rollChestEgg, onFriendRescued, bumpCamp, refreshCampChip,
  openEggFromAlbum, feedPetFromAlbum, rollCoopSecondary, bumpSecondary, secondaryDoneToast,
  trySuperPickup, spawnSuperMirror, updateCoopSuper, grantSuperCoop, superBannerFor, activateSuperPower,
  openMegaboxReward, chestCeremony, closeChest, spawnChestConfetti, unlockWeapon,
} from './rewards.js';
import {
  SOLO_MODE_GROUPS, HARD_VARIANTS, MODE_RULES, MODIFIERS, WEEKLY_MODIFIER_POOL,
  modeIdFromOpts, MODE_START_OPTS, SOLO_MODES, DAILY_CHALLENGE_POOL, MODE_MILESTONES,
} from './modes.js';
import { renderAlbum, skinHint, petHint } from './ui/album.js';
import {
  showVictory, maybeWorldSaved, showWorldSaved, grantInfectedWin,
  awardStars, claimStarThresholds, renderVictoryStars,
} from './ui/endscreens.js';
import { buildTestApi } from './testapi.js';
import { CUSTOM_COUNTRY, CustomMapMode, sanitizeCustomMap } from './custommap.js';

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
const APP_VERSION = 609;
window.__APP_VERSION = APP_VERSION;

const QUALITY_MODES = ['auto', 'high', 'fast'];
const QUALITY_LABELS = { auto: t('Авто'), high: t('Гарна'), fast: t('Швидка') };
const DIFFICULTY_PRESETS = {
  kid: [true, false, false],
  normal: [false, false, false],
  hard: [false, true, false],
  extreme: [false, true, true],
};
const DIFFICULTY_LABELS = {
  kid: t('Малюк'), normal: t('Звичайна'), hard: t('Складна'), extreme: t('Екстремальна'), custom: t('Власна'),
};
const MAP_SIZE_LABELS = {
  small: t('Мала'), standard: t('Стандартна'), large: t('Велика'), huge: t('Дуже велика'),
};
const MAP_STYLE_LABELS = {
  classic: t('Класична'), forest: t('Лісова'), lakes: t('Озерна'), stone: t('Камʼяна'),
};
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
const FRONT_MISSION_PRESETS = Object.freeze({
  'rescue-group': ['rescue'],
  'rebuild-center': ['rebuild'],
  'spain-rebuild-center': ['rebuild'],
  'spain-clear-village': ['villageclear'],
  'spain-defend-fireworks': ['fireworks'],
  'pol-light-bonfires': ['bonfire'],
  'pol-rescue-train': ['repair'],
  'pol-defeat-pursuer': [],
  'deu-rescue-mechanics': ['rescue'],
  'deu-start-convoy': ['convoy'],
  'deu-defeat-baron': [],
  'rescue-train': ['repair'],
  'rescue-ship': ['shiprescue'],
  'destroy-nests': ['nests'],
  'repair-generator': ['repair'],
  'activate-beacons': ['lights'],
  'elite-squad': ['hunt'],
  'commander-pursuer': [],
  'commander-queen': [],
  'commander-ram': [],
  'commander-stalker': [],
});
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
    this.gift = new DailyGift(this);
    this._soloModeById = new Map(SOLO_MODES.map((mode) => [mode.id, mode]));

    this.hud = new HUD(this);
    this.shop = new Shop(this);
    this.draft = new Draft(this);
    this.globe = new Globe(this);
    this.coop = new CoopUI(this);
    this.league = new LeagueUI(this);
    this.saveui = new SaveUI(this);
    this.frontui = new FrontUI(this);
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
      // 🎁 v300: церемонія скрині сама відпускає lock (v295) — це НЕ вихід гравця, паузу не відкривати
      if (!locked && this.state === 'level' && !this.shop.isOpen && !this._chestState
        && this.deathT < 0 && !this.victoryShown && !this.testMode
        && !document.getElementById('overlay-start').classList.contains('show')) {
        this.showPause();
      }
    };

    window.addEventListener('keydown', (e) => {
      // у полі вводу літери B/M — це просто літери, а не магазин/звук
      if (e.code === 'Escape') {
        const dialog = [...document.querySelectorAll('.overlay.show[role="dialog"][data-escape-close]')].pop();
        if (dialog) { document.getElementById(dialog.dataset.escapeClose)?.click(); return; }
      }
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
      if (this.level && this.level.operation) return this._leaveFrontResult('overlay-victory');
      if (this.level && this.level.expedition) return this._leaveExpeditionResult('overlay-victory');
      this._hideOverlay('overlay-victory');
      this.endLevel();
      // 🌍 фінал кампанії: якщо цією перемогою звільнено всі 12 країн — церемонія
      // «Світ врятовано» показується РІВНО тут, уже на глобусі (не поверх victory-екрана)
      this._maybeWorldSaved();
    });
    document.getElementById('btn-worldsaved-close').addEventListener('click', () => {
      this.audio.click();
      this._hideOverlay('overlay-worldsaved');
      const conf = document.getElementById('worldsaved-confetti');
      if (conf) conf.innerHTML = '';
    });
    document.getElementById('btn-victory-retry').addEventListener('click', () => {
      const cid = this.level.countryId;
      const inf = !!this.level.infected;
      this._hideOverlay('overlay-victory');
      this.endLevel();
      inf ? this.startInfected(cid) : this.startLevel(cid);
    });
    document.getElementById('btn-victory-next').addEventListener('click', () => {
      if (this.level && this.level.operation) return this._leaveFrontResult('overlay-victory');
      if (this.level && this.level.expedition) return this._leaveExpeditionResult('overlay-victory');
      const nid = nextTarget(this.save.liberated);
      if (!nid) return;
      this._hideOverlay('overlay-victory');
      this.endLevel();
      this.startLevel(nid);
    });
    document.getElementById('btn-death-revenge').addEventListener('click', () => {
      if (!this.level || this.level.net || this.deathT < 0) return;
      const cid = this.level.countryId;
      const inf = !!this.level.infected;
      this.deathT = -1;
      this._hideOverlay('overlay-death');
      this.endLevel();
      inf ? this.startInfected(cid) : this.startLevel(cid);
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
      if (e.target.closest('#btn-map-editor') && !(this.save.upgrades.mapeditor > 0)) return;
      if (e.target.closest('.globe-act')) this._hideOverlay('overlay-menu');
    });
    document.getElementById('btn-pass').addEventListener('click', () => {
      this.renderPassPanel();
      this._showOverlay('overlay-pass');
      this.audio.click();
    });
    document.getElementById('btn-souls').addEventListener('click', () => {
      this.renderSoulPathPanel();
      this._showOverlay('overlay-souls');
      this.audio.click();
    });
    document.getElementById('btn-quests').addEventListener('click', () => {
      this.renderQuestsPanel();
      this._showOverlay('overlay-quests');
      this.audio.click();
    });
    // 🎁 подарунок дня: чіп на глобусі відкриває модалку, кнопка «Забрати» видає нагороду
    const giftChip = document.getElementById('gift-chip');
    if (giftChip) giftChip.addEventListener('click', () => { this.audio.click(); this._openGiftModal(); });
    const giftClaim = document.getElementById('btn-gift-claim');
    if (giftClaim) giftClaim.addEventListener('click', () => this._claimGift());
    const campClaim = document.getElementById('btn-campquest-claim');
    if (campClaim) campClaim.addEventListener('click', () => this._claimCampQuest());
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
    document.getElementById('btn-map-editor').addEventListener('click', () => {
      if (!(this.save.upgrades.mapeditor > 0)) {
        this.audio.denied();
        this.hud.toast(t('🔒 Зайди в країну → відкрий магазин {k} → Режими → Створювач карт', { k: keyHint('🛒', 'B') }), 6);
        return;
      }
      this.audio.click();
      this.startLevel('CUSTOM', { customMap: 'edit', customMapSlot: this.save.customMapSlot || 0 });
    });
    document.getElementById('btn-custom-play').addEventListener('click', () => {
      const slot = this.save.customMapSlot === 1 ? 1 : 0;
      const map = slot ? this.save.customMap2 : this.save.customMap;
      if (!(map && map.objects.length)) return;
      this.audio.click();
      this.startLevel('CUSTOM', { customMap: 'play', customMapSlot: slot });
    });
    document.getElementById('btn-custom-slot').addEventListener('click', () => {
      if (!(this.save.upgrades.mapeditorplus > 0)) return;
      this.save.customMapSlot = this.save.customMapSlot === 1 ? 0 : 1;
      this.audio.click(); this.saveGame(); this._showGlobeUI(true);
    });
    document.getElementById('btn-custom-biome').addEventListener('click', () => {
      if (!(this.save.upgrades.mapeditorplus > 0)) return;
      const key = this.save.customMapSlot === 1 ? 'customMap2' : 'customMap';
      this.save[key].biome = this.save[key].biome === 'snow' ? 'summer' : 'snow';
      this.audio.click(); this.saveGame(); this._showGlobeUI(true);
    });
    document.getElementById('btn-custom-delete').addEventListener('click', () => {
      const key = this.save.customMapSlot === 1 ? 'customMap2' : 'customMap';
      if (!this.save[key].objects.length || !confirm(t('Видалити цю власну карту назавжди?'))) return;
      this.save[key] = sanitizeCustomMap({ biome: this.save[key].biome, objects: [] });
      this.audio.click(); this.saveGame(); this._showGlobeUI(true);
      this.hud.toast(t('🗑️ Власну карту видалено'));
    });
    // 📖 R4 «Альбом»: колекція друзів (жива) + заглушки скінів/петсів/еліт (наповнення R5)
    const albumBtn = document.getElementById('btn-album');
    if (albumBtn) albumBtn.addEventListener('click', () => {
      this.audio.click();
      this.renderAlbum();
      this._showOverlay('overlay-album');
      // 🎓 разове знайомство з Альбомом (раз назавжди)
      this.hud.hintOnce('album1', t('📖 ТВОЯ КОЛЕКЦІЯ!'), t('Тут живе твоя колекція. Сірі картки підкажуть, де шукати! 😊'));
    });
    // 🏕️ чіп квесту табору на глобусі відкриває панель квесту
    const campChip = document.getElementById('camp-quest-chip');
    if (campChip) campChip.addEventListener('click', () => { this.audio.click(); this._openCampQuest(); });
    document.getElementById('btn-hqbase').addEventListener('click', () => this.enterHQBase());
    document.getElementById('btn-moonbase').addEventListener('click', () => {
      this.audio.click();
      this._hideOverlay('overlay-hq');
      this.globe.setMode('moon');
    });
    document.getElementById('btn-moon-globe').addEventListener('click', () => {
      this.audio.click();
      this.globe.cycleMode();
    });
    document.getElementById('btn-solo').addEventListener('click', () => {
      this.audio.click();
      this.renderSoloMenu();
      this._showOverlay('overlay-solo');
    });
    document.getElementById('btn-expedition-go').addEventListener('click', () => this._expeditionGo());
    document.getElementById('btn-expedition-abandon').addEventListener('click', () => {
      this.save.expedition = null;
      this.saveGame();
      this._hideOverlay('overlay-expedition');
    });
    document.getElementById('btn-fighter-select').addEventListener('click', () => {
      if (!this._selectExpeditionSpecialist(this._fighterProfileId)) return;
      this.audio.click();
      this._hideOverlay('overlay-fighter');
    });
    document.getElementById('btn-fighter-upgrade').addEventListener('click', () => {
      const next = buyFighterLevel(this.save, this._fighterProfileId);
      if (!next.ok) {
        this.audio.denied();
        const message = next.reason === 'coins' ? 'Не вистачає монет'
          : next.reason === 'crystals' ? 'Не вистачає кристалів'
            : 'Бойовий набір ще створюється';
        this.hud.toast(t(message));
        return;
      }
      this.save.fighterLevels = next.fighterLevels;
      this.save.coins = next.coins;
      this.save.crystals = next.crystals;
      this.saveGame();
      this.audio.purchase();
      this.renderExpedition();
      this._overlayFocus?.set('overlay-fighter',
        document.querySelector(`[data-specialist="${this._fighterProfileId}"]`));
      this.renderExpeditionFighter();
    });
    document.getElementById('btn-arena-retry').addEventListener('click', () => {
      this._hideOverlay('overlay-arena-end');
      const mode = this._lastEndMode;
      this.endLevel();
      this._startSoloMode(mode || 'arena', mode === 'worldboss' ? (this._lastWorldBossId || 'radiation') : undefined);
    });
    document.getElementById('btn-arena-globe').addEventListener('click', () => {
      if (this.level && this.level.operation) return this._leaveFrontResult('overlay-arena-end');
      if (this.level && this.level.expedition) return this._leaveExpeditionResult('overlay-arena-end');
      this._hideOverlay('overlay-arena-end');
      this.endLevel();
    });
    document.getElementById('btn-front-result-primary').addEventListener('click', () => {
      this._finishFrontResult(document.getElementById('btn-front-result-primary').dataset.action);
    });
    document.getElementById('btn-front-result-end').addEventListener('click', () => {
      this._finishFrontResult(document.getElementById('btn-front-result-end').dataset.action);
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

    const settingsBtn = document.getElementById('btn-settings');
    const settingsBack = document.getElementById('btn-settings-back');
    settingsBtn.addEventListener('click', () => {
      this.audio.click();
      document.querySelector('#overlay-settings .settings-advanced').open = false;
      this._renderDifficultySettings();
      this._showOverlay('overlay-settings', settingsBtn);
    });
    settingsBack.addEventListener('click', () => {
      this.audio.click();
      this._hideOverlay('overlay-settings');
      this._showOverlay('overlay-menu', document.getElementById('btn-menu'));
      settingsBtn.focus({ preventScroll: true });
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

    const mapSizeBtn = document.getElementById('btn-map-size');
    if (mapSizeBtn) mapSizeBtn.addEventListener('click', () => {
      const current = sanitizeMapSize(this.save.mapSize);
      this.save.mapSize = MAP_SIZE_MODES[(MAP_SIZE_MODES.indexOf(current) + 1) % MAP_SIZE_MODES.length];
      this.saveGame();
      this._applyMapSize();
      this.audio.click();
      if (this.hud) this.hud.toast(t('🗺️ Новий розмір буде в наступній грі'));
    });
    this._applyMapSize();

    const mapStyleBtn = document.getElementById('btn-map-style');
    if (mapStyleBtn) mapStyleBtn.addEventListener('click', () => {
      const current = sanitizeMapStyle(this.save.mapStyle);
      this.save.mapStyle = MAP_STYLE_MODES[(MAP_STYLE_MODES.indexOf(current) + 1) % MAP_STYLE_MODES.length];
      this.saveGame();
      this._applyMapStyle();
      this.audio.click();
      if (this.hud) this.hud.toast(t('🌍 Новий вид карти буде в наступній грі'));
    });
    this._applyMapStyle();

    const cameraShakeBtn = document.getElementById('btn-camera-shake');
    if (cameraShakeBtn) cameraShakeBtn.addEventListener('click', () => {
      this.save.cameraShake = !this.save.cameraShake;
      this.saveGame();
      this._applyCombatSettings();
      this.audio.click();
    });
    const reducedFlashesBtn = document.getElementById('btn-reduced-flashes');
    if (reducedFlashesBtn) reducedFlashesBtn.addEventListener('click', () => {
      this.save.reducedFlashes = !this.save.reducedFlashes;
      this.saveGame();
      this._applyCombatSettings();
      this.audio.click();
    });
    this._applyCombatSettings();

    // 🐣 Режим Малюк: за замовчуванням УВІМКНЕНО на телефоні, ВИМКНЕНО на десктопі.
    // kidMode === null/undefined → ще не обрано вручну → беремо тип пристрою.
    // Щойно дитина/батько торкнеться кнопки, вибір стає явним (true/false) і більше не перезаписується.
    if (this.save.kidMode === null || this.save.kidMode === undefined) {
      this.save.kidMode = isTouchDevice();
      this.saveGame();
    }
    this._applyKidMode({ silent: true }); // boot init — тост не потрібен
    this._applyStrongZombies({ silent: true });
    this._applyToughZombies({ silent: true });
    document.querySelectorAll('.difficulty-option').forEach((button) => {
      button.addEventListener('click', () => {
        const preset = DIFFICULTY_PRESETS[button.dataset.difficulty];
        if (!preset) return;
        [this.save.kidMode, this.save.strongZombies, this.save.toughZombies] = preset;
        this.saveGame();
        this._applyKidMode({ silent: true });
        this._applyStrongZombies({ silent: true });
        this._applyToughZombies({ silent: true });
        this._renderDifficultySettings();
        this.audio.click();
      });
    });
    this._renderDifficultySettings();
    const metricsBtn = document.getElementById('btn-front-metrics');
    const renderMetrics = () => {
      if (metricsBtn) metricsBtn.textContent = frontMetricsEnabled(this)
        ? t('📊 Анонімна статистика: увімк')
        : t('📊 Анонімна статистика: вимк');
    };
    if (metricsBtn) metricsBtn.addEventListener('click', () => {
      setFrontMetricsEnabled(!frontMetricsEnabled(this));
      renderMetrics();
      this.audio.click();
    });
    renderMetrics();

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
      xp: 0, passLvl: 1, skins: ['classic', 'custom'], dances: ['shuffle'], tracers: ['classic'],
      souls: 0, soulLevel: 1, radiationCoins: 0,
      activeSkin: 'classic', activeDance: 'shuffle', activeTracer: 'classic',
      cloneSkins: [], activeCloneSkin: 'ninja',
      titles: [], activeTitle: null,
      hero: { ...DEFAULT_HERO },
      gadgetsOwned: [], gadgetHypers: [], activeGadget: null, megaPity: 0, quests: null, megaQuests: {}, stormBest: {}, worldBosses: {},
      modeBest: {}, modeWins: {}, modeRewards: {}, weekly: {},
      pets: [], activePet: null,
      towerSkins: ['default'], activeTowerSkin: 'default',
      missionRuns: {}, moonRegions: {}, kidMode: null, strongZombies: false, toughZombies: false,
      cameraShake: true, reducedFlashes: false,
      mapSize: 'standard', mapStyle: 'classic', cloudTs: 0, goal: null,
      customMap: { biome: 'summer', objects: [] }, customMap2: { biome: 'summer', objects: [] }, customMapSlot: 0,
      // 🎭 кооп-роль (null|'guard'|'medic'|'scout'): прес-налаштування кооп-лобі, НЕ прогрес
      coopRole: null,
      specialistXp: { guard: 0, medic: 0, scout: 0 },
      specialistClaims: [],
      fighterLevels: { guard: 1, medic: 1, scout: 1, bastion: 1, impulse: 1 },
      // 🌟 «Пожертва рятівника»: donations — скільки разів купив (від нього росте ціна й титули),
      // donStars — престиж-зірки за донації (поки 1:1 з donations, але тримаємо окремо)
      donations: 0, donStars: 0,
      // 🤝 кооп-перемоги: coopWins — лічильник перемог у грі разом (roster>1);
      // coopBonusDay — dayKey останнього виданого щоденного командного кристала (скаляр, НЕ map)
      coopWins: 0, coopBonusDay: '',
      // 🎁 подарунок дня зі стрик-календарем; 🗓️ ціль тижня «300 зомбі → 💎 25»
      gift: { last: '', streak: 0, week: 1 },
      weeklyGoal: { week: -1, n: 0, claimed: false },
      stats: { killed: 0, headshots: 0, bosses: 0, megaboxes: 0, golden: 0, bestCombo: 0, coinsSpent: 0, cloneUses: 0, gadgetUses: 0, damageDealt: 0 },
      bestiary: {},
      // 🦁 Бестіарій-колекція: одноразові прапорці нагород за 10/20/усі зібрані види
      bestiaryGoals: { b10: false, b20: false, all: false },
      chapter: { p: {}, done: false }, medals: [], infected: { cleared: {}, done: false },
      diffStar: 1,
      // ⭐ R3 «Зірки та милосердя»: зірки країн (0..3), видані пороги-нагороди (12/24/36),
      // milosердя — лічильник смертей поспіль на одній країні ({ cid, n } | null, БЕЗ UI)
      stars: {}, starClaims: [], mercyDeaths: null,
      // 🎓 разові підказки-знайомства (вежа/самокат/гаджет/робот): { ключ: 1 } = вже показано
      hints: {},
      // 🤝 R4 «Врятовані друзі»: врятовані НПС ({ cid: true }) і день останнього «щоденного дякую»
      // з табору (YYYY-MM-DD, формат DailyGift.dayKey — скаляр, НЕ map)
      friends: {}, friendThanks: '',
      // 🥚 R5 «Колекція та яйця»: лічильник яєць, видані пороги-яйця (зірки/друзі),
      // корм (з дублікатів) і рівні петсів ({ petId: 1..3 })
      eggs: 0, eggClaims: [], friendEggClaims: [], petFood: 0, petLevels: {},
      // 🏕️🥚 R4 (v299) «Табір кличе»: тижневий квест табору. { wk: номер тижня, q: id квесту,
      // p: прогрес, claimed }. Детермінований від _weekIndex(); БЕЗ FOMO (не згорає).
      weeklyCamp: null,
      // 🌍 v303 «Світ врятовано»: 0/1 — чи вже показано фінал кампанії (усі 12 країн вільні).
      // Одноразовий гейт церемонії; медаль 'WORLD' і +50💎 видаються рівно раз.
      worldSaved: 0,
      // 🧭 v400: активний багаторівневий забіг; чиста компактна структура з expedition.js
      expedition: null,
      // 🛰️ v500: детермінована дошка операцій; renderer/runtime-об'єкти сюди не потрапляють
      front: null,
      // Кооп-нагороди гостя мають окремий ledger: host snapshot ніколи не
      // підміняє особисті board/projects/restored.
      frontCoopClaims: [],
      // 🌙 жива місячна місія: реле, оборона, бос і одноразова нагорода
      moonRescue: { relays: [], defenseDone: false, bossDefeated: false, rewarded: false, done: false,
        space: { regions: { MARS: {}, EUROPA: {} }, colonies: { MOON: {}, MARS: {}, EUROPA: {} }, ship: { level: 1, parts: 0 } } },
      // 🏘️ постійний результат української відбудови
      settlement: { level: 0, wood: 0, stone: 0, survivors: 0 },
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
        const nestedDefaults = { stats: defaults.stats, hero: defaults.hero, chapter: defaults.chapter, infected: defaults.infected };
        out = Object.assign(defaults, s);
        out.customMap = sanitizeCustomMap(out.customMap);
        out.customMap2 = sanitizeCustomMap(out.customMap2);
        out.customMapSlot = out.upgrades.mapeditorplus > 0 && out.customMapSlot === 1 ? 1 : 0;
        // F26: глибокий merge дефолтів для вкладених об'єктів (stats/hero/chapter…).
        // Поверхневий Object.assign замінює весь вкладений об'єкт цілком — тож якщо
        // старий сейв має stats БЕЗ нового під-поля, воно лишилось би undefined → NaN.
        // Беремо бракуючі під-поля з _newSave-дефолтів. Тип-валідація нижче лишається —
        // вона ще й ловить чужі значення неправильного типу (рядок замість числа тощо).
        for (const k of ['stats', 'hero', 'chapter', 'infected']) {
          if (out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
            out[k] = Object.assign({}, nestedDefaults[k], out[k]);
          }
        }
        // вкладені об'єкти і списки могли прийти зі старого сейва неповними
        if (!Array.isArray(out.gadgetsOwned)) out.gadgetsOwned = [];
        out.gadgetsOwned = out.gadgetsOwned.filter((id, i, arr) => GADGETS[id] && arr.indexOf(id) === i);
        if (!Array.isArray(out.gadgetHypers)) out.gadgetHypers = [];
        out.gadgetHypers = out.gadgetHypers.filter((id, i, arr) => GADGETS[id] && arr.indexOf(id) === i);
        if (!out.megaQuests || typeof out.megaQuests !== 'object' || Array.isArray(out.megaQuests)) out.megaQuests = {};
        if (!out.worldBosses || typeof out.worldBosses !== 'object' || Array.isArray(out.worldBosses)) out.worldBosses = {};
        // міграція зі старої системи витратних гаджетів: заряди → відкриття назавжди
        if (out.gadgets) {
          if (out.gadgets.tramp > 0 && !out.gadgetsOwned.includes('tramp')) out.gadgetsOwned.push('tramp');
          if (out.gadgets.wall > 0 && !out.gadgetsOwned.includes('wall')) out.gadgetsOwned.push('wall');
          delete out.gadgets;
        }
        if (out.activeGadget && (!GADGETS[out.activeGadget] || !out.gadgetsOwned.includes(out.activeGadget))) out.activeGadget = null;
        out.missionRuns = out.missionRuns || {};
        if (!out.moonRegions || typeof out.moonRegions !== 'object' || Array.isArray(out.moonRegions)) out.moonRegions = {};
        out.moonRegions = Object.fromEntries(Object.entries(out.moonRegions).filter(([id, done]) => ['MARE', 'TYCHO', 'COPERNICUS', 'POLARIS'].includes(id) && done === true));
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
        for (const k of ['modeBest', 'modeWins', 'modeRewards', 'weekly']) {
          if (!out[k] || typeof out[k] !== 'object') out[k] = {};
        }
        if (!out.stats || typeof out.stats !== 'object') out.stats = {};
        for (const k of ['killed', 'headshots', 'bosses', 'megaboxes', 'golden', 'bestCombo', 'coinsSpent', 'cloneUses', 'gadgetUses', 'damageDealt']) {
          if (typeof out.stats[k] !== 'number' || !isFinite(out.stats[k])) out.stats[k] = 0;
        }
        if (!Array.isArray(out.titles)) out.titles = [];
        if (out.activeTitle !== null && typeof out.activeTitle !== 'string') out.activeTitle = null;
        if (typeof out.souls !== 'number' || !isFinite(out.souls) || out.souls < 0) out.souls = 0;
        if (typeof out.soulLevel !== 'number' || !isFinite(out.soulLevel) || out.soulLevel < 1) out.soulLevel = 1;
        out.souls = Math.floor(out.souls);
        out.soulLevel = Math.floor(out.soulLevel);
        if (typeof out.radiationCoins !== 'number' || !isFinite(out.radiationCoins) || out.radiationCoins < 0) out.radiationCoins = 0;
        out.radiationCoins = Math.floor(out.radiationCoins);
        // 🌟 донації рятівнику: скінченні цілі ≥0 (зіпсоване/чуже → 0)
        for (const k of ['donations', 'donStars']) {
          if (typeof out[k] !== 'number' || !isFinite(out[k]) || out[k] < 0) out[k] = 0;
          out[k] = Math.floor(out[k]);
        }
        // 🤝 кооп-перемоги: лічильник — ціле ≥0; день бонуса — рядок (зіпсоване/чуже → 0/'')
        if (typeof out.coopWins !== 'number' || !isFinite(out.coopWins) || out.coopWins < 0) out.coopWins = 0;
        out.coopWins = Math.floor(out.coopWins);
        if (typeof out.coopBonusDay !== 'string') out.coopBonusDay = '';
        if (!Array.isArray(out.cloneSkins)) out.cloneSkins = [];
        out.cloneSkins = out.cloneSkins.filter((id, i, arr) => id === 'radiation' && arr.indexOf(id) === i);
        if (out.activeCloneSkin !== 'radiation' || !out.cloneSkins.includes('radiation')) out.activeCloneSkin = 'ninja';
        syncTitles(out);
        if (!out.bestiary || typeof out.bestiary !== 'object') out.bestiary = {};
        // 🦁 бестіарій-цілі: старий сейв без полів дістає дефолти (не видані нагороди)
        if (!out.bestiaryGoals || typeof out.bestiaryGoals !== 'object' || Array.isArray(out.bestiaryGoals)) out.bestiaryGoals = { b10: false, b20: false, all: false };
        else out.bestiaryGoals = { b10: !!out.bestiaryGoals.b10, b20: !!out.bestiaryGoals.b20, all: !!out.bestiaryGoals.all };
        if (!out.chapter || typeof out.chapter !== 'object') out.chapter = { p: {}, done: false };
        if (!out.chapter.p || typeof out.chapter.p !== 'object') out.chapter.p = {};
        if (!out.infected || typeof out.infected !== 'object') out.infected = { cleared: {}, done: false };
        if (!out.infected.cleared || typeof out.infected.cleared !== 'object') out.infected.cleared = {};
        if (!Array.isArray(out.medals)) out.medals = [];
        out.specialistXp = sanitizeSpecialistXp(out.specialistXp);
        out.specialistClaims = sanitizeSpecialistClaims(out.specialistClaims);
        out.fighterLevels = sanitizeFighterLevels(out.fighterLevels);
        out.expedition = sanitizeExpedition(out.expedition);
        out.front = sanitizeFront(out.front, { liberated: out.liberated, rescuedFriends: out.friends });
        out.frontCoopClaims = [...new Set((Array.isArray(out.frontCoopClaims) ? out.frontCoopClaims : [])
          .filter((id) => typeof id === 'string' && /^front:[A-Za-z0-9_:-]{1,90}$/.test(id)))].slice(-128);
        const moon = out.moonRescue && typeof out.moonRescue === 'object' && !Array.isArray(out.moonRescue) ? out.moonRescue : {};
        const moonRelays = [...new Set((Array.isArray(moon.relays) ? moon.relays : []).filter((id) => ['solar', 'comms', 'oxygen'].includes(id)))];
        const moonDefenseDone = !!moon.defenseDone;
        const moonBossDefeated = !!moon.bossDefeated;
        const rawSpace = moon.space && typeof moon.space === 'object' ? moon.space : {};
        const rawRegions = rawSpace.regions && typeof rawSpace.regions === 'object' ? rawSpace.regions : {};
        const rawColonies = rawSpace.colonies && typeof rawSpace.colonies === 'object' ? rawSpace.colonies : {};
        const cleanFlags = (value, ids) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {})
          .filter(([id, done]) => ids.includes(id) && done === true));
        const cleanLevels = (value, ids) => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {})
          .filter(([id]) => ids.includes(id)).map(([id, level]) => [id, Math.max(0, Math.min(3, Math.trunc(Number(level) || 0)))]));
        const ship = rawSpace.ship && typeof rawSpace.ship === 'object' ? rawSpace.ship : {};
        out.moonRescue = {
          relays: moonRelays,
          defenseDone: moonDefenseDone,
          bossDefeated: moonBossDefeated,
          rewarded: !!moon.rewarded || !!moon.done,
          done: moonRelays.length === 3 && moonDefenseDone && moonBossDefeated,
          space: {
            regions: {
              MARS: cleanFlags(rawRegions.MARS, ['ARSIA', 'UTOPIA', 'VALLES', 'OLYMPUS']),
              EUROPA: cleanFlags(rawRegions.EUROPA, ['CONAMARA', 'LINEA', 'THERA', 'ARGADNEL']),
            },
            colonies: {
              MOON: cleanLevels(rawColonies.MOON, ['MARE', 'TYCHO', 'COPERNICUS', 'POLARIS']),
              MARS: cleanLevels(rawColonies.MARS, ['ARSIA', 'UTOPIA', 'VALLES', 'OLYMPUS']),
              EUROPA: cleanLevels(rawColonies.EUROPA, ['CONAMARA', 'LINEA', 'THERA', 'ARGADNEL']),
            },
            ship: { level: Math.max(1, Math.min(3, Math.trunc(Number(ship.level) || 1))), parts: Math.max(0, Math.min(4, Math.trunc(Number(ship.parts) || 0))) },
          },
        };
        const settlement = out.settlement && typeof out.settlement === 'object' && !Array.isArray(out.settlement) ? out.settlement : {};
        const settlementInt = (value, max) => Math.max(0, Math.min(max, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0));
        out.settlement = {
          level: settlementInt(settlement.level, 3),
          wood: settlementInt(settlement.wood, 999999),
          stone: settlementInt(settlement.stone, 999999),
          survivors: settlementInt(settlement.survivors, 9999),
        };
        if (out.goal !== null && typeof out.goal !== 'string') out.goal = null;
        // ⭐ зірки складності (M7): тільки ціле 1..5; зіпсоване/чуже значення → ★1
        if (typeof out.diffStar !== 'number' || !(out.diffStar >= 1 && out.diffStar <= 5)) out.diffStar = 1;
        out.diffStar = Math.round(out.diffStar);
        // ⭐ R3 зірки країн: об'єкт { cid: 0..3 }; зіпсоване/чуже значення → чисто
        if (!out.stars || typeof out.stars !== 'object' || Array.isArray(out.stars)) out.stars = {};
        for (const id of Object.keys(out.stars)) {
          const v = out.stars[id] | 0;
          if (v <= 0) delete out.stars[id];
          else out.stars[id] = Math.min(STARS_PER_COUNTRY, v);
        }
        if (!Array.isArray(out.starClaims)) out.starClaims = [];
        out.starClaims = out.starClaims.filter((n, i, arr) => STAR_THRESHOLDS.some((th) => th.at === n) && arr.indexOf(n) === i);
        // 🕊️ невидиме милосердя: { cid, n } | null (валідні поля або скидання)
        if (!out.mercyDeaths || typeof out.mercyDeaths !== 'object' || Array.isArray(out.mercyDeaths)
          || typeof out.mercyDeaths.cid !== 'string' || typeof out.mercyDeaths.n !== 'number'
          || !isFinite(out.mercyDeaths.n) || out.mercyDeaths.n < 0) {
          out.mercyDeaths = null;
        } else {
          out.mercyDeaths = { cid: out.mercyDeaths.cid, n: Math.floor(out.mercyDeaths.n) };
        }
        // 🥚 R5 «Колекція та яйця»: лічильники — цілі ≥0; claim-списки — унікальні пороги;
        // petLevels — { petId: 1..3 } лише для наявних петсів (зіпсоване/чуже → чисто)
        if (typeof out.eggs !== 'number' || !isFinite(out.eggs) || out.eggs < 0) out.eggs = 0;
        out.eggs = Math.floor(out.eggs);
        if (typeof out.petFood !== 'number' || !isFinite(out.petFood) || out.petFood < 0) out.petFood = 0;
        out.petFood = Math.floor(out.petFood);
        if (!Array.isArray(out.eggClaims)) out.eggClaims = [];
        out.eggClaims = out.eggClaims.filter((n, i, arr) => typeof n === 'number' && isFinite(n) && arr.indexOf(n) === i);
        if (!Array.isArray(out.friendEggClaims)) out.friendEggClaims = [];
        out.friendEggClaims = out.friendEggClaims.filter((n, i, arr) => typeof n === 'number' && isFinite(n) && arr.indexOf(n) === i);
        if (!out.petLevels || typeof out.petLevels !== 'object' || Array.isArray(out.petLevels)) out.petLevels = {};
        for (const id of Object.keys(out.petLevels)) {
          const v = out.petLevels[id] | 0;
          if (!PETS[id] || v <= 1) delete out.petLevels[id];
          else out.petLevels[id] = Math.min(3, v);
        }
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
        // 🎁 подарунок дня і 🗓️ ціль тижня — старий сейв без полів дістає дефолти
        if (!out.gift || typeof out.gift !== 'object' || Array.isArray(out.gift)) out.gift = { last: '', streak: 0, week: 1 };
        else out.gift = Object.assign({ last: '', streak: 0, week: 1 }, out.gift);
        if (!out.weeklyGoal || typeof out.weeklyGoal !== 'object' || Array.isArray(out.weeklyGoal)) out.weeklyGoal = { week: -1, n: 0, claimed: false };
        else out.weeklyGoal = this._sanitizeWeeklyGoal(Object.assign({ week: -1, n: 0, claimed: false }, out.weeklyGoal));
        // 🏕️ тижневий квест табору — старий сейв без поля дістає чистий старт (ретро-безпека)
        if (out.weeklyCamp !== null && (typeof out.weeklyCamp !== 'object' || Array.isArray(out.weeklyCamp))) out.weeklyCamp = null;
        out.strongZombies = !!out.strongZombies;
        out.toughZombies = !!out.toughZombies;
        out.cameraShake = out.cameraShake !== false;
        out.reducedFlashes = out.reducedFlashes === true;
        out.mapSize = sanitizeMapSize(out.mapSize);
        out.mapStyle = sanitizeMapStyle(out.mapStyle);
        // 🎭 кооп-роль: лише з білого списку (зіпсоване/чуже → null, без ролі)
        if (!['guard', 'medic', 'scout'].includes(out.coopRole)) out.coopRole = null;
        if (typeof out.xp !== 'number' || !isFinite(out.xp)) out.xp = 0;
        // легасі-сейв БЕЗ passLvl (Object.assign підставив дефолт 1 — НЕ вір йому:
        // видача 2..40 повторилась би) → null: grantBacklog ініціалізує «до 40 видано»
        if (!('passLvl' in s) || typeof out.passLvl !== 'number' || !isFinite(out.passLvl)) out.passLvl = null;
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
    // ⭐ R3 ретро-нарахування: кожній ВЖЕ звільненій країні кампанії без зірок — 1 зірка
    // (за перемогу). Ветеран не має побачити обнулений зірковий прогрес при міграції.
    if (out.stars && typeof out.stars === 'object' && out.liberated && typeof out.liberated === 'object') {
      for (const id of CAMPAIGN_ORDER) {
        if (out.liberated[id] && !((out.stars[id] | 0) > 0)) out.stars[id] = 1;
      }
    }
    syncTitles(out);
    // 🥚 R5 ретро-нарахування яєць: ветеран з накопиченими зірками/друзями одразу дістає
    // весь беклог яєць (ідемпотентно через eggClaims/friendEggClaims). Тихо на завантаженні —
    // тости за live-пороги видаються в _awardStars / _onFriendRescued.
    claimBacklogEggs(out);
    return out;
  }

  saveGame() {
    if (this.level && this.level.playground) return;
    syncTitles(this.save);
    this.save._cloudDirty = true;
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

  _applyMapSize() {
    const mode = sanitizeMapSize(this.save.mapSize);
    this.save.mapSize = mode;
    const btn = document.getElementById('btn-map-size');
    if (btn) btn.textContent = t('🗺️ Карта: {size} · {meters} м', {
      size: MAP_SIZE_LABELS[mode], meters: MAP_SIZE_METERS[mode],
    });
  }

  _applyMapStyle() {
    const style = sanitizeMapStyle(this.save.mapStyle);
    this.save.mapStyle = style;
    const btn = document.getElementById('btn-map-style');
    if (btn) btn.textContent = t('🌍 Вид карти: {style}', { style: MAP_STYLE_LABELS[style] });
  }

  _applyCombatSettings() {
    const shake = this.save.cameraShake !== false;
    const flashes = this.save.reducedFlashes === true;
    const shakeBtn = document.getElementById('btn-camera-shake');
    const flashesBtn = document.getElementById('btn-reduced-flashes');
    if (shakeBtn) shakeBtn.textContent = shake ? t('📳 Тряска камери: увімк') : t('📳 Тряска камери: викл');
    if (flashesBtn) flashesBtn.textContent = flashes ? t('✨ Зменшені спалахи: увімк') : t('✨ Зменшені спалахи: викл');
  }

  _difficultyPreset() {
    const current = [!!this.save.kidMode, !!this.save.strongZombies, !!this.save.toughZombies];
    return Object.keys(DIFFICULTY_PRESETS).find((id) => DIFFICULTY_PRESETS[id].every((value, i) => value === current[i])) || 'custom';
  }

  _renderDifficultySettings() {
    const current = this._difficultyPreset();
    const label = document.getElementById('settings-difficulty-current');
    if (label) label.textContent = DIFFICULTY_LABELS[current];
    document.querySelectorAll('.difficulty-option').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.difficulty === current));
    });
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

  _applyStrongZombies(opts = {}) {
    const on = !!this.save.strongZombies;
    const btn = document.getElementById('btn-strong-zombies');
    if (btn) btn.textContent = on ? t('🧟 Сильні зомбі: увімк') : t('🧟 Сильні зомбі: викл');
    if (!opts.silent && this.hud) {
      this.hud.toast(on
        ? t('🧟 Сильні зомбі: +10 шкоди турелям, баштам і тотемам')
        : t('🧟 Сильні зомбі вимкнені'));
    }
  }

  _applyToughZombies(opts = {}) {
    const on = !!this.save.toughZombies;
    const btn = document.getElementById('btn-tough-zombies');
    if (btn) btn.textContent = on ? t('💪 Живучі зомбі: увімк') : t('💪 Живучі зомбі: викл');
    if (!opts.silent && this.hud) {
      this.hud.toast(on
        ? t('💪 Живучі зомбі: у всіх зомбі +100 HP')
        : t('💪 Живучі зомбі вимкнені'));
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
    // 🎁 catch-up продовженого Зоряного шляху (40→65): пропущені по XP рівні видаються разом
    this.progress.grantBacklog();
    this._ensureFront();
    if (this.save.front) this._applyFrontTransition({ type: 'INIT' });
    sendFrontReturns(this);
    this._showGlobeUI(true);
    // 🌍 ретро-ветеран: перший вхід на глобус із уже повними 12/12 (гра до v303 нічого не
    // святкувала) — показуємо фінал одноразово. Ідемпотентно через save.worldSaved.
    this._maybeWorldSaved();
    // 👋 welcome-back: показуємо прогрес і компас, якщо це не свіжий старт і не автозапуск рівня з URL
    const libN0 = liberatedCount(this.save.liberated);
    if (libN0 > 0 && !this.params.get('country')) {
      const a = this._nextActionInfo();
      this.hud.toast(t('👋 З поверненням! Звільнено країн: {n}. {i} {x}', { n: libN0, i: a.icon, x: a.text }), 6);
    }
    // 🎁 автовідкриття подарунка дня — лише для гравця з прогресом, поза автозапуском рівня і тестами
    if (this.gift.pending() && libN0 > 0 && !this.params.get('country') && !this.testMode) this._openGiftModal();
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
      item.innerHTML = `<span class="ci-flag">${c.flag}</span><span class="ci-name">${c.name}</span><span class="ci-badge">${badge}</span>${this._missionPreviewHtml(id)}`;
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

  _missionPreviewHtml(countryId) {
    const c = COUNTRIES[countryId];
    if (!c) return '';
    const runIndex = (this.save.missionRuns && this.save.missionRuns[countryId]) || 0;
    const storyIcons = storyMissionPreview(countryId, c.seed, runIndex);
    if (storyIcons) {
      const chips = storyIcons.map((icon) => `<span>${icon}</span>`);
      return `<span class="mission-preview">${chips.join('')}</span>`;
    }
    const types = rollMissionSet(countryId, c.seed, runIndex);
    const labels = {
      rescue: t('Порятунок'), repair: t('Ремонт'), clear: t('Склад'), collect: t('Припаси'),
      defense: t('Оборона'), hunt: t('Еліти'), nests: t('Гнізда'), escort: t('Мандрівник'),
      lights: t('Ліхтарі'), well: t('Колодязі'), bonfire: t('Багаття'), convoy: t('Конвой'),
      balloon: t('Куля'), bazaar: t('Базар'), tomb: t('Гробниця'),
    };
    const chips = types.slice(0, 4).map((type, i) => {
      const cfg = MISSION_TYPES[type] || {};
      const prefix = i === 3 ? t('Бонус') + ': ' : '';
      return `<span>${cfg.icon || '🎯'} ${prefix}${labels[type] || type}</span>`;
    });
    while (chips.length < 4) chips.push(`<span>🎁 ${t('Бонус')}: ${t('далі')}</span>`);
    return `<span class="mission-preview">${chips.join('')}</span>`;
  }

  _nextActionInfo() {
    const gi = goalInfo(this);
    if (gi && !gi.done) {
      const unit = gi.item.crystalPrice ? '💎' : '₴';
      return {
        icon: '🎯',
        title: t('Ціль магазину'),
        text: t('{i} {n}: ще {r} {u}', { i: gi.item.icon, n: gi.item.name, r: gi.remaining, u: unit }),
      };
    }
    const lib = this.save.liberated || {};
    const next = CAMPAIGN_ORDER.find((id) => !lib[id]);
    if (next) {
      const c = COUNTRIES[next];
      return {
        icon: '🧭',
        title: t('Далі'),
        text: t('{f} {n}: звільни країну', { f: c.flag, n: c.name }),
      };
    }
    if (!(this.save.infected && this.save.infected.done)) {
      return { icon: '🧟', title: t('Далі'), text: t('Глава 2: очисти заражені країни') };
    }
    if (!lib.LOST) {
      return { icon: '🦖', title: t('Далі'), text: t('Острів Динозаврів чекає фінальний бій') };
    }
    if (!lib.LAB) {
      return { icon: '🧪', title: t('Далі'), text: t('Глава 3: знайди Лігво Вірусу') };
    }
    // 🎯 кампанія пройдена, але лишились невиконані завдання дня — кличемо туди
    const qLeft = this.quests.list.filter((q) => !q.done).length;
    if (qLeft > 0) return { icon: '🎯', title: t('Завдання дня'), text: t('Виконано {d}/{n} — зазирни у 📅 Завдання', { d: 3 - qLeft, n: 3 }) };
    // 🗓️ світ врятовано → спершу кличемо у «випробування тижня», поки недільну нагороду не взято
    const wkMode = SOLO_MODES.find((m) => m.id === this.weeklyChallengeId());
    if (wkMode && !this.save.weekly['W' + this._weekIndex() + ':mode']) {
      return {
        icon: '🗓️',
        title: t('Випробування тижня'),
        text: t('{i} {m} — нагорода ×3 цього тижня!', { i: wkMode.icon, m: wkMode.name() }),
      };
    }
    // 🎯 …далі щодня кличемо у «випробування дня» з подвійною нагородою
    const dailyMode = SOLO_MODES.find((m) => m.id === this.dailyChallengeId());
    if (dailyMode) {
      return { icon: '🎯', title: t('Випробування дня'), text: t('{i} {m} — нагорода ×2 сьогодні!', { i: dailyMode.icon, m: dailyMode.name() }) };
    }
    return { icon: '⭐', title: t('Далі'), text: t('Світ врятовано! Щодня — нове випробування, зазирай!') };
  }

  _playerCompassHtml() {
    const a = this._nextActionInfo();
    return `<div id="player-compass" class="player-compass"><b>${a.icon} ${a.title}</b><span>${a.text}</span></div>`;
  }

  _showGlobeUI(show) {
    document.getElementById('globe-ui').style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('in-level', !show);
    if (show) document.body.classList.remove('storm-mode', 'no-shop-mode', 'banner-active', 'map-editor-mode');
    // ховаємо тултип країни при виході з глобуса, щоб «звільнено…» не лишався над рівнем
    if (!show) { const tt = document.getElementById('globe-tooltip'); if (tt) tt.style.display = 'none'; }
    if (show) {
      document.getElementById('liberated-count').textContent =
        liberatedCount(this.save.liberated);
      // ⭐ R3: сумарний лічильник зірок кампанії «X/36» на глобусі
      const starTotalEl = document.getElementById('star-total');
      if (starTotalEl) starTotalEl.textContent = `${starTotal(this.save)}/${CAMPAIGN_STAR_MAX}`;
      // 🧭 компас «що далі» просто на глобусі — не чекаючи відкриття меню «Грати»
      const compassEl = document.getElementById('globe-compass');
      if (compassEl) {
        const a = this._nextActionInfo();
        compassEl.innerHTML = `<b>${a.icon} ${a.title}</b><span>${a.text}</span>`;
      }
      // бейджі: рівень пасса і незавершені завдання дня
      const passBadge = document.getElementById('pass-badge');
      passBadge.textContent = `⭐${this.progress.level}`;
      passBadge.classList.add('show');
      const qLeft = this.quests.pendingCount;
      const qBadge = document.getElementById('quest-badge');
      qBadge.textContent = qLeft;
      qBadge.classList.toggle('show', qLeft > 0);
      // 🎁 чіп подарунка дня — видно лише коли подарунок готовий
      const giftChip = document.getElementById('gift-chip');
      if (giftChip) giftChip.classList.toggle('show', this.gift.pending());
      // 🏕️ чіп-нагадування квесту табору — коли виконано й не забрано
      this._refreshCampChip();
      // 🗓️ ціль тижня — оновлюємо текст/бар
      this._refreshWeeklyGoalUI();
      if (this._newVersion) this._onNewVersion(this._newVersion);
      if (this.frontui) this.frontui.render(this.getFrontViewModel());
      const editorBtn = document.getElementById('btn-map-editor');
      const playBtn = document.getElementById('btn-custom-play');
      const slotBtn = document.getElementById('btn-custom-slot');
      const biomeBtn = document.getElementById('btn-custom-biome');
      const deleteBtn = document.getElementById('btn-custom-delete');
      const editorOwned = this.save.upgrades.mapeditor > 0;
      const plusOwned = this.save.upgrades.mapeditorplus > 0;
      const customSlot = plusOwned && this.save.customMapSlot === 1 ? 1 : 0;
      const customMap = customSlot ? this.save.customMap2 : this.save.customMap;
      if (editorBtn) {
        editorBtn.textContent = editorOwned ? t('🧱 Створювач карт') : t('🔒 Створювач карт');
        editorBtn.classList.toggle('locked', !editorOwned);
      }
      if (slotBtn) { slotBtn.hidden = !plusOwned; slotBtn.textContent = t('🗺️ Карта {n}', { n: customSlot + 1 }); }
      if (biomeBtn) { biomeBtn.hidden = !plusOwned; biomeBtn.textContent = customMap.biome === 'snow' ? t('❄️ Снігова карта') : t('☀️ Літня карта'); }
      if (playBtn) playBtn.hidden = !editorOwned || !customMap.objects.length;
      if (deleteBtn) deleteBtn.hidden = !editorOwned || !customMap.objects.length;
    }
    if (this.coop) this.coop.updateRoomChip();
  }

  // ---------- 🏠 Живий Штаб ----------
  enterHQBase(mode = 'base') {
    this.audio.click();
    if (this.save.front) this._applyFrontTransition({ type: 'INIT', baseVisited: true });
    this._hideOverlay('overlay-hq');
    this._hideOverlay('overlay-menu');
    this._showGlobeUI(false);
    document.body.classList.remove('in-level'); // це не рівень — ховаємо бойовий HUD (амуніція/мінікарта/тач)
    document.body.classList.toggle('moon-mission', mode === 'moon');
    this.state = 'hqbase';
    this.hqbase.enter(mode);
    this.clock.getDelta(); // не накопичуємо dt за час на меню
  }

  exitHQBase() {
    this.audio.click();
    this.hqbase.exit();
    document.body.classList.remove('moon-mission');
    this.state = 'globe';
    this._showGlobeUI(true);
  }

  _startSoloMode(modeId, arg) {
    const mode = this._soloModeById && this._soloModeById.get(modeId);
    if (!mode || typeof mode.start !== 'function') return false;
    mode.start(this, arg);
    return true;
  }

  startMode(modeId, arg) {
    const make = MODE_START_OPTS[modeId];
    if (!make) return false;
    const countryId = arg && COUNTRIES[arg] ? arg : 'UKR';
    return this.startLevel(countryId, make(arg));
  }

  // ---------- 🎮 меню «Грати» (соло-режими) ----------
  renderSoloMenu() {
    const libN = liberatedCount(this.save.liberated);
    const modeState = { game: this, libN };
    const modes = SOLO_MODES.map((mode) => ({
      ...mode,
      name: mode.name(),
      locked: mode.locked(modeState),
      desc: mode.desc(modeState),
    }));
    const root = document.getElementById('solo-modes');
    const byId = new Map(modes.map((m) => [m.id, m]));
    const groups = SOLO_MODE_GROUPS.map((g) => ({ ...g, title: g.title() }));
    const daily = this.dailyChallengeId();
    const weekly = this.weeklyChallengeId();
    const wkMod = this._modifierById(this.weeklyModifierId());
    const fmtBest = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    // 💀 кнопка складного варіанта — коли і базовий, і перегружений розлочені
    const hardBtn = (m) => {
      const hardId = HARD_VARIANTS[m.id];
      if (m.locked || !hardId) return '';
      const hard = byId.get(hardId);
      if (!hard || hard.locked) return '';
      // span, НЕ button: вкладений button у button — невалідний HTML, браузер його «випльовує»
      return `<span role="button" class="sm-skull" data-hard="${hardId}" title="${hard.desc}">💀 ${t('Складно')}</span>`;
    };
    const modeHtml = (m) => `
      <button type="button" class="solo-mode ${m.locked ? 'locked' : ''}${!m.locked && m.id === daily ? ' daily' : ''}${!m.locked && m.id === weekly ? ' weekly' : ''}" data-mode="${m.id}">
        <div class="sm-ico">${m.icon}</div>
        <div class="sm-body"><div class="sm-name">${m.name}${m.locked ? ' 🔒' : ''}${!m.locked && m.id === daily ? ' <span class="sm-daily">🎯 ×2</span>' : ''}${!m.locked && m.id === weekly ? ' <span class="sm-daily sm-weekly">🗓️ ×3</span>' : ''}${!m.locked && m.id === 'campaign' && wkMod ? ` <span class="sm-daily sm-weekly">${wkMod.icon} ${wkMod.name()}</span>` : ''}</div>
        <div class="sm-desc">${m.desc}</div>
        ${!m.locked && this.save.modeBest && this.save.modeBest[m.id] != null ? `<div class="sm-best">🏆 ${t('Рекорд: {t}', { t: fmtBest(this.save.modeBest[m.id]) })}</div>` : ''}
        ${hardBtn(m)}</div>
        <div class="sm-go">${m.locked ? '' : '▶'}</div>
      </button>`;
    const catalogOrder = groups.flatMap((g) => g.ids);
    const recommendedIds = [];
    const addRecommendation = (id) => {
      const mode = byId.get(id);
      if (mode && !mode.locked && !recommendedIds.includes(id) && recommendedIds.length < 3) recommendedIds.push(id);
    };
    [daily, weekly, 'expedition'].forEach(addRecommendation);
    ['campaign', 'storm', 'defense', 'knockout', ...catalogOrder].forEach(addRecommendation);
    root.innerHTML = `
      ${this._playerCompassHtml()}
      <section class="solo-recommended" aria-labelledby="solo-recommended-title">
        <h3 id="solo-recommended-title">${t('РЕКОМЕНДОВАНО ЗАРАЗ')}</h3>
        ${recommendedIds.map((id) => modeHtml(byId.get(id))).join('')}
      </section>
      ${groups.map((g) => `
      <details class="solo-category" data-category="${g.id}">
        <summary>${g.title}<span>${g.ids.length}</span></summary>
        <section class="solo-section" data-category="${g.id}" aria-label="${g.title}">
          ${g.ids.map((id) => modeHtml(byId.get(id))).join('')}
        </section>
      </details>`).join('')}`;
    const cRoot = document.getElementById('solo-countries');
    cRoot.style.display = 'none';
    cRoot.innerHTML = '';
    root.querySelectorAll('.solo-category').forEach((category) => {
      category.querySelector('summary').addEventListener('click', () => {
        root.querySelectorAll('.solo-category').forEach((other) => { if (other !== category) other.open = false; });
      });
      category.addEventListener('toggle', () => {
        if (!category.open) return;
        root.querySelectorAll('.solo-mode').forEach((x) => x.classList.remove('sel'));
        cRoot.style.display = 'none';
        cRoot.innerHTML = '';
      });
    });
    // 💀 складний варіант стартує одразу, не розгортаючи базову картку
    root.querySelectorAll('.sm-skull').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.click();
        this._hideOverlay('overlay-solo');
        this._startSoloMode(el.dataset.hard);
      });
    });
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
        const modeCfg = this._soloModeById.get(mode);
        if (!modeCfg) return;
        if (modeCfg.picker === 'campaign') {
          // вибір країни ТУТ (після ГРАТИ), а не на головному екрані
          root.querySelectorAll('.solo-mode').forEach((x) => x.classList.toggle('sel', x === el));
          cRoot.style.display = '';
          cRoot.innerHTML = t('<div class="solo-cty-title">Яку країну рятуємо?</div>');
          const listBox = document.createElement('div');
          listBox.id = 'country-list';
          cRoot.appendChild(listBox);
          this.renderCountryList(listBox, () => this._hideOverlay('overlay-solo'));
        } else if (modeCfg.picker === 'infected') {
          root.querySelectorAll('.solo-mode').forEach((x) => x.classList.toggle('sel', x === el));
          cRoot.style.display = '';
          cRoot.innerHTML = t('<div class="solo-cty-title">Яку заражену країну очищаємо?</div>')
            + CAMPAIGN_ORDER.filter((id) => hasLiberated(this.save.liberated, id)).map((id) => {
              const c = COUNTRIES[id];
              const done = !!(this.save.infected && this.save.infected.cleared && this.save.infected.cleared[id]);
              return `<button class="btn solo-cty" data-id="${id}">🧟 ${c.flag} ${c.name}${done ? ' ✅' : ''}</button>`;
            }).join('');
          cRoot.querySelectorAll('.solo-cty').forEach((b) => {
            b.addEventListener('click', () => {
              this.audio.click();
              this._hideOverlay('overlay-solo');
              this._startSoloMode(mode, b.dataset.id);
            });
          });
        } else if (modeCfg.picker === 'worldboss') {
          root.querySelectorAll('.solo-mode').forEach((x) => x.classList.toggle('sel', x === el));
          cRoot.style.display = '';
          cRoot.innerHTML = t('<div class="solo-cty-title">Якого світового боса викликаємо?</div>')
            + WORLD_BOSSES.map((b) => {
              const ok = worldBossUnlocked(b.id, libN);
              const done = !!(this.save.worldBosses && this.save.worldBosses[b.id]);
              const isWk = this.weeklyBossId() === b.id;
              const label = ok
                ? `${b.icon} ${b.shortName()}${done ? ' ✅' : ''}${isWk ? ' 🗓️' : ''}`
                : `${b.icon} ${b.shortName()} 🔒 ${b.unlockCountries}`;
              return `<button class="btn solo-cty ${ok ? '' : 'locked'}" data-id="${b.id}">${label}</button>`;
            }).join('');
          cRoot.querySelectorAll('.solo-cty').forEach((b) => {
            b.addEventListener('click', () => {
              if (b.classList.contains('locked')) { this.audio.denied(); return; }
              this.audio.click();
              this._hideOverlay('overlay-solo');
              this._startSoloMode(mode, b.dataset.id);
            });
          });
        } else if (modeCfg.picker === 'storm') {
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
              this._startSoloMode(mode, b.dataset.id);
            });
          });
        } else {
          this._hideOverlay('overlay-solo');
          this._startSoloMode(mode);
        }
      });
    });
  }

  // ---------- панелі глобуса ----------
  renderPassPanel() {
    const lvl = this.progress.level;
    const frac = this.progress.levelFrac();
    const need = lvl < PASS_MAX_LEVEL ? xpForLevel(lvl) : 0;
    const prestige = this.progress.prestigeStars;
    // 🌟 зірки за пожертви рятівнику — окремим рядком (обчислюваний престиж НЕ чіпаємо)
    const donStars = this.save.donStars || 0;
    const donLine = donStars > 0 ? `<br>${t('🌟 Зірки пожертв: {n}', { n: donStars })}` : '';
    document.getElementById('pass-progress').innerHTML = (lvl >= PASS_MAX_LEVEL
      ? t('⭐ Рівень {lvl} — МАКСИМУМ! Ти зірка! 🏆', { lvl }) + (prestige > 0 ? `<br>${t('🎖️ Ранг Рятівника: {n} ⭐', { n: prestige })}` : '')
      : t('⭐ Рівень {lvl} · до наступного: {a}/{b} XP', { lvl, a: Math.round(frac * need), b: need }) + `
         <div class="xpbar"><div style="width:${Math.round(frac * 100)}%"></div></div>`) + donLine;
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

  _soulReward(lvl) {
    if (lvl === 2) return { type: 'coins', n: 500, icon: '💰', name: t('500 монет') };
    if (lvl === 3) return { type: 'gadget', id: 'xray', icon: '👁️', name: t('Гаджет «Ікс-рей»') };
    if (lvl === 4) return { type: 'skin', id: 'ghost', icon: '👻', name: t('Скін «Привид»') };
    if (lvl === 5) return { type: 'titleHyper', titleId: 'ghost', hyperId: 'invisibility', icon: '👻', name: t('Титул «Привид» + гіпер «Невидимка»') };
    return { type: 'coins', n: 500 + lvl * 100, icon: '💰', name: t('{n} монет', { n: 500 + lvl * 100 }) };
  }

  _grantSoulReward(lvl) {
    const r = this._soulReward(lvl);
    if (r.type === 'coins') {
      this.save.coins += r.n;
      return t('Нагорода: {i} {n}', { i: r.icon, n: r.name });
    }
    if (r.type === 'gadget') {
      const had = this.save.gadgetsOwned.includes(r.id);
      if (!had) this.save.gadgetsOwned.push(r.id);
      if (!this.save.activeGadget) this.save.activeGadget = r.id;
      if (had) {
        this.save.coins += 300;
        return t('Нагорода: гаджет уже є — +300 монет');
      }
      return t('Нагорода: {i} {n}', { i: r.icon, n: r.name });
    }
    if (r.type === 'skin') {
      if (!this.save.skins.includes(r.id)) this.save.skins.push(r.id);
      return t('Нагорода: {i} {n}', { i: r.icon, n: r.name });
    }
    if (r.type === 'title') {
      if (!this.save.titles.includes(r.id)) this.save.titles.push(r.id);
      return t('Нагорода: {i} {n}', { i: r.icon, n: r.name });
    }
    if (r.type === 'titleHyper') {
      if (!this.save.titles.includes(r.titleId)) this.save.titles.push(r.titleId);
      if (!Array.isArray(this.save.gadgetHypers)) this.save.gadgetHypers = [];
      if (!this.save.gadgetHypers.includes(r.hyperId)) this.save.gadgetHypers.push(r.hyperId);
      return t('Нагорода: {i} {n}', { i: r.icon, n: r.name });
    }
    return t('Нагорода отримана');
  }

  claimSoulLevel() {
    if ((this.save.souls || 0) < SOUL_LEVEL_COST) {
      this.audio.denied();
      this.hud.toast(t('Потрібно {n} душ', { n: SOUL_LEVEL_COST }));
      return false;
    }
    this.save.souls -= SOUL_LEVEL_COST;
    this.save.soulLevel = Math.max(1, this.save.soulLevel || 1) + 1;
    const sub = this._grantSoulReward(this.save.soulLevel);
    syncTitles(this.save);
    this.saveGame();
    this.hud.banner(t('👻 ШЛЯХ ДУШ: рівень {n}!', { n: this.save.soulLevel }), sub, 4.2);
    this.renderSoulPathPanel();
    return true;
  }

  renderSoulPathPanel() {
    const lvl = Math.max(1, this.save.soulLevel || 1);
    const souls = Math.max(0, this.save.souls || 0);
    const can = souls >= SOUL_LEVEL_COST;
    const next = this._soulReward(lvl + 1);
    document.getElementById('soul-progress').innerHTML = `
      ${t('👻 Рівень {lvl} · душі: {a}/{b}', { lvl, a: Math.min(souls, SOUL_LEVEL_COST), b: SOUL_LEVEL_COST })}
      <div class="xpbar"><div style="width:${Math.min(100, Math.round((souls / SOUL_LEVEL_COST) * 100))}%"></div></div>
      <button class="btn btn-primary big" data-action="claim-soul" ${can ? '' : 'disabled'}>${t('Підняти рівень за {n} душ', { n: SOUL_LEVEL_COST })}</button>`;
    document.getElementById('soul-track').innerHTML = `
      <div class="pass-row got"><div class="pass-lvl">${lvl}</div><div class="pass-ico">👻</div><div class="pass-name">${t('Поточний рівень')}</div><div class="pass-state">✅</div></div>
      <div class="pass-row ${can ? 'current' : 'locked'}"><div class="pass-lvl">${lvl + 1}</div><div class="pass-ico">${next.icon}</div><div class="pass-name">${next.name}</div><div class="pass-state">${can ? '🎁' : '🔒'}</div></div>`;
    document.querySelector('[data-action="claim-soul"]')?.addEventListener('click', () => this.claimSoulLevel());
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

  // 📖 v305: Альбом винесено у src/ui/album.js — делегати лишають назви методів.
  renderAlbum() { return renderAlbum(this); }

  _skinHint(id) { return skinHint(this, id); }

  _petHint(id) { return petHint(this, id); }

  renderWardrobe() {
    const save = this.save;
    syncTitles(save);
    const hex6 = (n) => '#' + ((n >>> 0) & 0xffffff).toString(16).padStart(6, '0');
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
      ['titles', t('Титули')],
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
    let titleHtml = t('<div class="ward-section">Титули</div><div class="ward-grid">');
    for (const [id, meta] of Object.entries(TITLES)) {
      const owned = save.titles.includes(id);
      // прогрес-бар лише для нерозблокованих титулів із «рахунковим» порогом (>1)
      const tgt = meta.target;
      const cur = typeof meta.current === 'function' ? meta.current(save) : 0;
      const pct = tgt > 0 ? Math.min(100, Math.round((cur / tgt) * 100)) : 0;
      const statHtml = (!owned && tgt > 1)
        ? `<div class="ward-progress"><div class="ward-progress-fill" style="width:${pct}%"></div></div><div class="ward-progress-text">${cur}/${tgt}</div>`
        : '';
      titleHtml += card(id, { icon: meta.icon, name: meta.name(), desc: meta.desc(), detail: meta.detail(), stat: statHtml }, owned, save.activeTitle === id, 'title');
    }
    titleHtml += '</div>';
    let html = `<div class="ward-tabs">${tabs.map(([id, label]) => `<button class="shop-tab ward-tab ${this._wardrobeTab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>`;
    html += pane('skins', skinsHtml) + pane('weapon', weaponHtml) + pane('gadget', gadgetHtml) + pane('dance', danceHtml) + pane('pet', petHtml) + pane('tower', towerHtml) + pane('tracer', tracerHtml) + pane('titles', titleHtml) + pane('hero', heroHtml);
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
        else if (kind === 'title') save.activeTitle = id;
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
        if (pick) { const css = hex6(save.hero[slot]); pick.style.background = css; pick.querySelector('input').value = css; }
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

  _rebuildHeroPreview() {
    const hp = this._heroPrev;
    if (!hp) return;
    hp.scene.remove(hp.rig.group);
    disposeObject(hp.rig.group); // не лишаємо запечену гео старого рига в пам'яті GPU
    hp.rig = makeHero('custom', this.save.hero);
    this._setHeroPreviewView(hp.view);
    this._setHeroPreviewPose(hp.pose);
    hp.scene.add(hp.rig.group);
  }

  _stopHeroPreview() {
    const hp = this._heroPrev;
    if (!hp) return;
    cancelAnimationFrame(hp.raf);
    disposeObject(hp.rig.group);
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

  startInfected(countryId = 'UKR') {
    const lib = liberatedCount(this.save.liberated);
    if (lib < CHAPTER2_UNLOCK_COUNTRIES || !hasLiberated(this.save.liberated, countryId)) {
      this.audio.denied();
      this.hud.toast(t('🧟 Глава 2 відкриється після {n} звільнених країн!', { n: CHAPTER2_UNLOCK_COUNTRIES }));
      return false;
    }
    return this.startLevel(countryId, { infected: true });
  }

  // ---------- 🧪 Глава 3: Лігво Вірусу ----------
  startChapter3() {
    if (!(this.save.infected && this.save.infected.done && hasLiberated(this.save.liberated, 'LOST'))) {
      this.audio.denied();
      this.hud.toast(t('🧪 Глава 3 відкриється після Глави 2 і Острова Динозаврів!'));
      return false;
    }
    return this.startLevel('LAB');
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
    return this.startMode('worldboss', id);
  }

  // ---------- ☢️ Радіація ----------
  startRadiation() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('☢️🤝 Радіація поки доступна тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < RADIATION_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('☢️ Радіація відкриється після {n} звільнених країн!', { n: RADIATION_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('radiation');
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
    return this.startMode('knockout');
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
    return this.startMode('overloaded-knockout');
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
    return this.startMode('defense');
  }

  // ---------- 🗼 Оборона турелі (дизайн Влада, v236) ----------
  startTurretWar() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🗼🤝 Оборона турелі поки доступна тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < TURRETWAR_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('🗼 Оборона турелі відкриється після {n} звільнених країн!', { n: TURRETWAR_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('turretwar');
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
    return this.startMode('overloaded-defense');
  }

  startZoneDefense() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('⭕🤝 Оборона в зоні поки доступна тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < ZONE_DEFENSE_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('⭕ Оборона в зоні відкриється після {n} звільнених країн!', { n: ZONE_DEFENSE_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('zone-defense');
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
    return this.startMode('pvp');
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
    return this.startMode('overloaded-pvp');
  }

  // ---------- 🏦 Банк ----------
  startBank() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🏦🤝 Банк поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < BANK_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('🏦 Банк відкриється після {n} звільнених країн!', { n: BANK_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('bank');
  }

  // ---------- 🌀 Портал ----------
  startPortal() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🌀🤝 Портал поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < PORTAL_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('🌀 Портал відкриється після {n} звільнених країн!', { n: PORTAL_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('portal');
  }

  // ---------- 🧩 Лабіринт ----------
  startMaze() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('🧩🤝 Лабіринт поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < MAZE_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('🧩 Лабіринт відкриється після {n} звільнених країн!', { n: MAZE_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('maze');
  }

  // ---------- ⚔️ Зомбі проти людей ----------
  startHumans() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('⚔️🤝 Зомбі проти людей поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < HUMANS_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('⚔️ Зомбі проти людей відкриється після {n} звільнених країн!', { n: HUMANS_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('humans');
  }

  startOverloadedHumans() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('💥🤝 Перегружена зомбі проти людей поки доступна тільки у соло.'));
      this.audio.denied();
      return;
    }
    const lib = liberatedCount(this.save.liberated);
    if (lib < OVERLOADED_HUMANS_UNLOCK_COUNTRIES) {
      this.audio.denied();
      this.hud.toast(t('💥 Перегружена зомбі проти людей відкриється після {n} звільнених країн!', { n: OVERLOADED_HUMANS_UNLOCK_COUNTRIES }));
      return;
    }
    this.audio.click();
    return this.startMode('overloaded-humans');
  }

  // ---------- 👻 Збирач душ ----------
  startSoulCollector() {
    if (this.coop && this.coop.session.state !== 'idle') {
      this.hud.toast(t('👻🤝 Збирач душ поки доступний тільки у соло.'));
      this.audio.denied();
      return;
    }
    if (this.progress.level < SOUL_COLLECTOR_UNLOCK_LEVEL) {
      this.audio.denied();
      this.hud.toast(t('👻 Збирач душ відкриється на {n} рівні Зоряного шляху!', { n: SOUL_COLLECTOR_UNLOCK_LEVEL }));
      return;
    }
    this.audio.click();
    return this.startMode('soul-collector');
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

  _showOverlay(id, returnFocus = document.activeElement) {
    const overlay = document.getElementById(id);
    if (!overlay.classList.contains('show') && overlay.getAttribute('role') === 'dialog') {
      this._overlayFocus ||= new Map();
      this._overlayFocus.set(id, returnFocus);
    }
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.querySelector('[data-dialog-focus]')?.focus({ preventScroll: true });
  }
  _hideOverlay(id) {
    const overlay = document.getElementById(id);
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    const trigger = this._overlayFocus && this._overlayFocus.get(id);
    if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true });
    if (this._overlayFocus) this._overlayFocus.delete(id);
    // закрили гардероб — гасимо 3D-прев'ю (вигляд героя застосується при вході в рівень)
    if (id === 'overlay-wardrobe') this._stopHeroPreview();
  }

  // ---------- 🛰️ Живий фронт ----------
  _frontContext() {
    return {
      seed: this.seed,
      liberated: this.save.liberated || {},
      rescuedFriends: this.save.friends || {},
      day: this.gift ? this.gift.dayKey() : new Date().toISOString().slice(0, 10),
    };
  }

  _frontToast(effect) {
    const messages = {
      'front.projectSelected': '🏗️ Проєкт Бази обрано',
      'front.operationStarted': '🛰️ Операція почалася. Прогрес між етапами зберігається.',
      'front.stageComplete': '✅ Етап завершено. Обери підсилення і продовжуй!',
      'front.stageFailed': '💚 Загрозу не посилено — повтори етап, коли будеш готовий.',
      'front.operationAbandoned': '🏳️ Операцію відкладено без штрафу.',
      'front.operationComplete': '🌟 Операцію завершено!',
      'front.rewardClaimed': '🏗️ Країна відбудовується, а проєкт Бази просунувся.',
      'front.cycleComplete': '🥚 Покоління фронту завершено!',
      'front.generationAdvanced': '🛰️ Нові операції вже на карті.',
      'front.counterattack': '🚨 Зомбі захопили район незахищеної країни — контратака вже на карті!',
      'front.worldAttacked': '🚨 Поки тебе не було, зомбі атакували країну: місто пошкоджене, люди чекають допомоги.',
      'front.civilianRescued': '🆘 Врятована людина повернулася до міста. Населення зростає!',
    };
    return messages[effect.key] || effect.key;
  }

  _applyFrontTransition(event, { sync = true } = {}) {
    const previousSecondStarts = (this.save.front && this.save.front.stats && this.save.front.stats.secondStarts) || 0;
    const result = applyFrontEvent(this.save.front, { ...this._frontContext(), ...event });
    if (!result || result.front === undefined) return result;
    this.save.front = result.front;
    let shouldSave = false;
    for (const effect of result.effects || []) {
      if (effect.type === 'grant') {
        this.save.coins += Math.max(0, effect.coins | 0);
        this.save.crystals = (this.save.crystals || 0) + Math.max(0, effect.crystals | 0);
        this.save.eggs = (this.save.eggs || 0) + Math.max(0, effect.eggs | 0);
      } else if (effect.type === 'toast' && this.hud) {
        this.hud.toast(t(this._frontToast(effect)));
      } else if (effect.type === 'save') {
        shouldSave = true;
      }
    }
    if (shouldSave) this.saveGame();
    if (shouldSave) {
      const metric = event.type === 'START_OPERATION' ? 'front_start'
        : ['CLAIM_OPERATION', 'COMPLETE_OPERATION'].includes(event.type) ? 'front_complete'
        : event.type === 'INIT' && event.opened ? 'front_open'
        : event.type === 'INIT' && event.baseVisited ? 'front_base_visit' : null;
      if (metric) sendFrontMetric(this, metric);
      if (event.type === 'START_OPERATION' && result.front.stats.secondStarts > previousSecondStarts) {
        sendFrontMetric(this, 'front_second_start');
      }
    }
    const session = this.coop && this.coop.session;
    if (sync && session && session.role === 'host' && session.syncFront) session.syncFront(this.save.front, result.effects || []);
    if (this.frontui) this.frontui.render(this.getFrontViewModel());
    return result;
  }

  applyFrontNetworkRewards(grantEffects = []) {
    const previousClaims = new Set(this.save.frontCoopClaims || []);
    let granted = false;
    for (const effect of grantEffects) {
      if (!effect || effect.type !== 'grant' || previousClaims.has(effect.rewardId)
          || !/^front:[A-Za-z0-9_:-]{1,90}$/.test(effect.rewardId || '')) continue;
      this.save.coins += Math.max(0, effect.coins | 0);
      this.save.crystals = (this.save.crystals || 0) + Math.max(0, effect.crystals | 0);
      this.save.eggs = (this.save.eggs || 0) + Math.max(0, effect.eggs | 0);
      previousClaims.add(effect.rewardId);
      granted = true;
    }
    if (!granted) return false;
    this.save.frontCoopClaims = [...previousClaims].slice(-128);
    this.saveGame();
    return true;
  }

  _ensureFront() {
    if (liberatedCount(this.save.liberated) < 1) return null;
    if (!this.save.front) {
      this.save.front = createFront(this._frontContext());
      if (this.save.front) this.saveGame();
    }
    // Mid-stage snapshots deliberately restart the current stage after reload.
    if (this.save.front && this.save.front.active && this.save.front.active.status === 'active' && !this.level) {
      this._applyFrontTransition({ type: 'FAIL_STAGE' });
    }
    return this.save.front;
  }

  getFrontViewModel(previewSpecialist = null) {
    const front = this.save.front ? sanitizeFront(this.save.front, this._frontContext()) : null;
    return front ? frontViewModel(front, this.save, { previewSpecialist }) : null;
  }

  continueRescue() {
    if (!this._ensureFront()) {
      this.renderSoloMenu();
      this._showOverlay('overlay-solo');
      document.querySelector('.solo-mode[data-mode="campaign"]')?.click();
      document.querySelector(`#solo-countries [data-id="${nextTarget(this.save.liberated) || 'UKR'}"]`)?.focus();
      return true;
    }
    const vm = this.getFrontViewModel();
    this.frontui.selectedOperationId = vm && vm.recommendedOperationId;
    return this.openFront();
  }

  openFront() {
    const front = this._ensureFront();
    if (!front) {
      this.hud.toast(t('🔒 Звільни Україну, щоб відкрити Живий фронт.'));
      return false;
    }
    if (!front.active && front.board.every((operation) => operation.status === 'claimed')) {
      this._applyFrontTransition({ type: 'ADVANCE_GENERATION' });
    }
    this._applyFrontTransition({ type: 'INIT', opened: true });
    this.frontui.open(this.getFrontViewModel());
    return true;
  }

  selectFrontSpecialist(id) {
    return id;
  }

  selectFrontProject(projectId) {
    this._applyFrontTransition({ type: 'SELECT_PROJECT', projectId });
  }

  startFrontOperation(operationId, specialist = 'dispatcher', launch = 'solo') {
    if (!this._ensureFront()) return false;
    const together = launch === 'together';
    let front = this.save.front;
    if (!front.active) {
      this._applyFrontTransition({ type: 'START_OPERATION', operationId, specialist }, { sync: together });
      front = this.save.front;
    }
    if (!front || !front.active || front.active.status !== 'ready') return false;
    const config = frontStageConfig(front);
    if (!config) return false;
    this.frontui.close();
    const session = this.coop && this.coop.session;
    if (together) {
      if (!session || session.role !== 'host' || session.state !== 'lobby' || !session.startFrontStage) return false;
      return session.startFrontStage(config.countryId, config.modeOpts, config.operation);
    }
    config.operation.attempt = (this._frontAttempt = (this._frontAttempt || 0) + 1);
    this._applyFrontTransition({ type: 'START_STAGE' }, { sync: false });
    return this.startLevel(config.countryId, {
      ...config.modeOpts,
      operation: config.operation,
      missionPreset: config.missionPreset,
      encounterPlan: config.encounterPlan,
    });
  }

  prepareFrontTogether(operationId, specialist = 'dispatcher') {
    if (!this._ensureFront()) return false;
    if (!this.save.front.active) this._applyFrontTransition({ type: 'START_OPERATION', operationId, specialist });
    if (!this.save.front.active || this.save.front.active.status !== 'ready') return false;
    this.frontui.close();
    this.coop.openForFront();
    return true;
  }

  abandonFrontOperation() {
    if (!this.save.front || !this.save.front.active) return false;
    this._applyFrontTransition({ type: 'ABANDON_OPERATION' });
    return true;
  }

  _finishFrontStage(won) {
    const level = this.level;
    if (!level || !level.operation || level._frontFinished) return false;
    level._frontFinished = true;
    if (level.net && !level.net.authority) return true;
    const before = frontCountryState(this.save.front, level.countryId);
    const picked = level.runBuild ? level.runBuild.ids.slice(level._frontBuildStart || 0) : [];
    const finalWin = won && this.save.front.active.stage === 2;
    const transitioned = this._applyFrontTransition({
      type: finalWin ? 'COMPLETE_OPERATION' : won ? 'COMPLETE_STAGE' : 'FAIL_STAGE', build: picked,
    }, { sync: false });
    const effects = transitioned.effects || [];
    const terminal = won && !this.save.front.active;
    const after = frontCountryState(this.save.front, level.countryId);
    const result = {
      id: `front:${level.operation.generation}:${level.operation.operationId}:${level.operation.stage}:a${level.operation.attempt || 0}:${won ? 'win' : 'fail'}`,
      countryId: level.countryId, won, terminal, before, after,
    };
    const continueCountryOperation = won && !terminal
      && /^(spain|pol|deu)-/.test(level.operation.missionPreset || '');
    const session = level.net && level.net.authority && this.coop && this.coop.session;
    if (session && session.syncFront) session.syncFront(this.save.front, effects, continueCountryOperation ? null : result);
    if (continueCountryOperation) {
      this.victoryShown = true;
      this.input.exitLock();
      this._frontNextAction = 'continue';
      setTimeout(() => { if (this.level === level) this.endLevel(); }, 0);
      return true;
    }
    return this._showFrontResult(result);
  }

  _showFrontResult({ won, terminal, before, after, countryId = null, guest = false }) {
    const kind = won ? (terminal ? 'complete' : 'checkpoint') : 'failed';
    const primary = document.getElementById('btn-front-result-primary');
    const end = document.getElementById('btn-front-result-end');
    const country = COUNTRIES[countryId || (this.level && this.level.countryId)];
    const beforeCopy = frontCountryCopy(before, country ? country.name : countryId || '');
    const afterCopy = frontCountryCopy(after, country ? country.name : countryId || '');
    this.victoryShown = true;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    this.input.exitLock();
    document.getElementById('front-result-title').textContent = t(won
      ? (terminal ? '🌟 ОПЕРАЦІЮ ЗАВЕРШЕНО!' : '✅ ЕТАП ПРОЙДЕНО!')
      : '💀 ОПЕРАЦІЮ ПРОВАЛЕНО');
    document.getElementById('front-result-summary').textContent = t(guest ? 'Чекаємо на хоста' : won
      ? (terminal ? 'Країна відбудовується, а проєкт Бази просунувся.' : 'Прогрес збережено. Наступний етап уже готовий.')
      : 'Етап можна повторити або завершити операцію.');
    const change = document.getElementById('front-result-change');
    change.className = 'front-result-change front-status';
    change.innerHTML = `<span class="front-status-icon">🗺️</span><div><strong>${t('Стан країни')}</strong><span>${beforeCopy.label} → ${afterCopy.label}</span></div>`;
    primary.textContent = t(guest ? 'ПІДТВЕРДИТИ Й ЧЕКАТИ' : won ? (terminal ? 'ПРОДОВЖИТИ ПОРЯТУНОК' : 'ПРОДОВЖИТИ ОПЕРАЦІЮ') : 'ПОВТОРИТИ ФАЗУ');
    primary.dataset.action = guest ? 'wait' : won ? (terminal ? 'globe' : 'continue') : 'retry';
    end.textContent = t(won ? 'ДО ГЛОБУСА' : 'ЗАВЕРШИТИ ОПЕРАЦІЮ');
    end.dataset.action = won ? 'globe' : 'end';
    end.hidden = guest;
    const overlay = document.getElementById('overlay-front-result');
    overlay.dataset.kind = kind;
    this._showOverlay('overlay-front-result');
    return true;
  }

  _finishFrontResult(action) {
    this._hideOverlay('overlay-front-result');
    if (action === 'end') this._applyFrontTransition({ type: 'END_FAILED_OPERATION' });
    this._frontNextAction = action;
    this.endLevel();
  }

  _initFrontRuntime(level, front) {
    if (!level.operation || !front) return;
    const teamSize = level.net && this.coop && this.coop.session ? Math.max(1, this.coop.session.roster.size) : 1;
    const plan = encounterPlan({
      seed: front.seed + front.generation,
      countryId: level.countryId,
      template: level.operation.template,
      stage: level.operation.stage,
      threat: level.operation.threat,
      teamSize,
    });
    level.frontDirector = { plan, phaseIndex: -1, remaining: 0 };
    if (level.defense && level.defense.towerMaxHp > 0) {
      level.defense.towerMaxHp = Math.round(level.defense.towerMaxHp * level.operationEffects.alliedObjectHealthMultiplier);
      level.defense.towerHp = level.defense.towerMaxHp;
    }
    if (level.operation.template === 'evacuation' && level.operation.stage === 1) {
      if (!level.frontEvacuees) this._addFrontEvacuees(level);
      if (level.defense && level.defense.zone) level.defense.timer = Math.min(level.defense.timer, 75);
    }
    this._addFrontSupport(level);
    level.bus.on('zombieKilled', (zombie) => {
      if (!zombie || !zombie.frontCommander || this.victoryShown || level._frontFinished) return;
      level.bossDefeated = true;
      level.frontCommanderDefeated = true;
      level.frontObjectiveComplete = true;
      if (this._frontCanComplete(level)) {
        this.audio.victory();
        setTimeout(() => { if (this.level === level) this._showVictory(); }, 650);
      }
    });
    this._enterFrontPhase(level, 0);
  }

  _addFrontOutpost(level, restoredLevel, state) {
    const tier = Math.max(0, Math.min(3, restoredLevel | 0));
    if (!tier) return;
    const village = level.world.layout.village || level.world.layout.SPAWN;
    const x = village.x + Math.min(20, Math.max(12, (village.r || 20) * 0.5));
    const z = village.z - Math.min(16, Math.max(10, (village.r || 20) * 0.4));
    const y = level.world.groundH(x, z);
    const group = new THREE.Group();
    group.name = 'front-rescue-outpost';
    const wall = new THREE.MeshStandardMaterial({ color: tier >= 3 ? 0xe6ddd0 : 0xc89c68, roughness: 0.88 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x784638, roughness: 0.82 });
    const safe = new THREE.MeshStandardMaterial({ color: 0x55d779, roughness: 0.75 });
    const glow = new THREE.MeshStandardMaterial({ color: 0xffd879, emissive: 0xffb43b, emissiveIntensity: 0.8 });
    const width = tier >= 3 ? 13 : tier >= 2 ? 10 : 7;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, tier >= 3 ? 6.5 : 4.2, 7), wall);
    body.position.y = tier >= 3 ? 3.25 : 2.1;
    body.castShadow = body.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, 3, 4), roofM);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = tier >= 3 ? 7.5 : 5.4;
    roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.2, 0.25), roofM);
    door.position.set(0, 1.6, 3.62);
    group.add(body, roof, door);
    for (const sx of [-1, 1]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 0.18), glow);
      window.position.set(sx * width * 0.27, tier >= 3 ? 4.1 : 2.8, 3.64);
      group.add(window);
    }
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12), safe);
    flag.position.set(-width * 0.58, 2.1, 2.5);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1), safe);
    cloth.position.set(-width * 0.58 + 0.9, 3.65, 2.5);
    group.add(flag, cloth);
    if (tier >= 2) {
      const clinic = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.7, 4), wall);
      clinic.position.set(width * 0.65, 1.35, -1.2);
      clinic.castShadow = true;
      group.add(clinic);
    }
    group.position.set(x, y, z);
    level.scene.add(group);
    level.frontOutpostDrawCalls = group.children.length;
    this._addFrontCitizens(level, state, tier, { x, z, group });
  }

  _addFrontCitizens(level, state, tier = 0, center = null) {
    const village = level.world.layout.village || level.world.layout.SPAWN;
    const { x, z, group = null } = center || { x: village.x, z: village.z };
    level.frontLivingCity = { x, z, tier, group, citizens: [] };
    const kinds = ['boy', 'girl', 'granny', 'medic', 'farmer', 'mechanic'];
    const count = 2 + tier * 2;
    for (let i = 0; i < count; i++) {
      const rig = makeCivilian(kinds[i % kinds.length], level.rng);
      const angle = (i / count) * Math.PI * 2;
      const radius = 7 + (i % 2) * 2;
      const cx = x + Math.cos(angle) * radius;
      const cz = z + Math.sin(angle) * radius;
      rig.group.position.set(cx, level.world.groundH(cx, cz), cz);
      rig.group.rotation.y = angle + Math.PI / 2;
      const job = state === 'saved' ? (i < 2 ? 'guard' : i === 2 ? 'builder' : 'resident')
        : i < Math.ceil(count / 2) ? 'builder' : 'resident';
      setAnim(rig, job === 'resident' ? 'walk' : 'idle');
      level.scene.add(rig.group);
      level.frontLivingCity.citizens.push({
        rig, angle, radius, job, hitT: i * 0.17, speed: 0.08 + (i % 3) * 0.025,
      });
    }
  }

  _addFrontDamage(level, damageLevel) {
    const damage = Math.max(0, Math.min(3, damageLevel | 0));
    if (!damage) return;
    const village = level.world.layout.village || level.world.layout.SPAWN;
    const group = new THREE.Group();
    group.name = 'front-city-damage';
    const rubble = new THREE.MeshStandardMaterial({ color: 0x665d58, roughness: 1 });
    const count = damage * 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + damage * 0.37;
      const radius = 9 + (i % 4) * 3.4;
      const x = village.x + Math.cos(angle) * radius;
      const z = village.z + Math.sin(angle) * radius;
      const piece = new THREE.Mesh(new THREE.BoxGeometry(1.2 + (i % 3), 0.5 + (i % 2) * 0.5, 1.4), rubble);
      piece.position.set(x, level.world.groundH(x, z) + 0.25, z);
      piece.rotation.set((i % 2) * 0.18, angle, (i % 3 - 1) * 0.22);
      piece.castShadow = piece.receiveShadow = true;
      group.add(piece);
    }
    level.scene.add(group);
    level.frontDamage = group;
  }

  _addFrontEvacuees(level) {
    const cx = level.defense ? level.defense.cx : level.world.layout.arena.x;
    const cz = level.defense ? level.defense.cz : level.world.layout.arena.z;
    level.frontEvacuees = [];
    for (let i = 0; i < 6; i++) {
      const rig = makeCivilian(['boy', 'girl', 'granny', 'farmer'][i % 4], level.rng);
      const angle = i * Math.PI / 3;
      const x = cx + Math.cos(angle) * 5;
      const z = cz + Math.sin(angle) * 5;
      rig.group.position.set(x, level.world.groundH(x, z), z);
      rig.group.rotation.y = -angle;
      setAnim(rig, 'idle');
      level.scene.add(rig.group);
      level.frontEvacuees.push(rig);
    }
  }

  _updateLivingCity(level, dt) {
    const city = level.frontLivingCity;
    if (city) {
      const now = level.stats.time;
      city.citizens.forEach((citizen, index) => {
        if (citizen.job === 'guard') {
          let target = null;
          let nearest = 18;
          for (const zombie of level.zombies.list) {
            if (zombie.state === 'dead') continue;
            const distance = Math.hypot(zombie.x - citizen.rig.group.position.x, zombie.z - citizen.rig.group.position.z);
            if (distance < nearest) { nearest = distance; target = zombie; }
          }
          citizen.hitT -= dt;
          if (target) {
            const dx = target.x - citizen.rig.group.position.x;
            const dz = target.z - citizen.rig.group.position.z;
            citizen.rig.group.rotation.y = Math.atan2(-dx, -dz);
            if (citizen.hitT <= 0) {
              citizen.hitT = 1.15;
              setAnim(citizen.rig, 'attack');
              if (!level.net || level.net.authority) {
                target.lastHitBy = 1;
                target.damage(6 + city.tier * 2, new THREE.Vector3(dx, 0, dz).normalize(), false);
              }
            }
          } else setAnim(citizen.rig, 'idle');
        } else if (citizen.job === 'builder') {
          setAnim(citizen.rig, Math.floor(now * 1.3 + index) % 5 === 0 ? 'attack' : 'idle');
        } else {
          const angle = citizen.angle + now * citizen.speed;
          const x = city.x + Math.cos(angle) * citizen.radius;
          const z = city.z + Math.sin(angle) * citizen.radius;
          citizen.rig.group.position.set(x, level.world.groundH(x, z), z);
          citizen.rig.group.rotation.y = -angle;
          setAnim(citizen.rig, level.nightK > 0.72 ? 'idle' : 'walk');
        }
        updateRig(citizen.rig, dt);
      });
    }
    if (level.frontEvacuees) for (const rig of level.frontEvacuees) updateRig(rig, dt);
  }

  _addFrontSupport(level) {
    const fx = level.operationEffects;
    if (!fx || !fx.support) return;
    const spawn = level.world.layout.SPAWN || { x: 0, z: 0 };
    const x = spawn.x + 3;
    const z = spawn.z + 1;
    const y = level.world.groundH(x, z);
    if (fx.support === 'medkit') {
      level.effects.spawnPickup(x, z, 'medkit', 9999, y + 0.3);
      return;
    }
    if (fx.extraCache) {
      level.effects.spawnPickup(x + 1.5, z, 'ammo', 9999, y + 0.3);
      level.effects.spawnPickup(x - 1.5, z, 'grenade', 9999, y + 0.3);
    }
    const group = new THREE.Group();
    group.name = `front-support-${fx.support}`;
    const color = fx.support === 'fortified-barrier' ? 0x5d86a8 : fx.support === 'signal-flare' ? 0xffc642 : 0x6cbf67;
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(fx.support === 'fortified-barrier' ? 3 : 1.8, 1, 1), material);
    body.position.y = 0.5;
    group.add(body);
    if (fx.support === 'signal-flare') {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8), material);
      mast.position.y = 1.7;
      group.add(mast);
    }
    group.position.set(x, y, z);
    level.scene.add(group);
  }

  _enterFrontPhase(level, index) {
    const director = level.frontDirector;
    const phase = director && director.plan.phases[index];
    if (!phase) return;
    director.phaseIndex = index;
    director.remaining = phase.duration;
    const labels = {
      quiet: ['🧭 ОЗИРНИСЬ', 'Виконуй задачу — тиск почнеться не одразу.'],
      pressure: ['⚠️ ТИСК', 'Орда наближається!'],
      reward: ['🎁 ПЕРЕПОЧИНОК', 'Збери припаси та заверши задачу.'],
    };
    if (phase.id === 'spike') {
      const warnings = {
        charger: 'Ривок: відійди з лінії атаки.',
        summon: 'Викликає підкріплення: не дай себе оточити.',
        shield: 'Щит: атакуй з флангу.',
        invisible: 'Невидимість: стеж за рухом.',
      };
      const mechanics = phase.commander && phase.commander.mechanics.map((mechanic) => t(warnings[mechanic])).join(' · ');
      this.hud.banner(t(phase.commander ? '👑 КОМАНДИР' : '⚠️ Елітна хвиля!'),
        mechanics || t('Готуйся — йдуть еліти! 👹'), 2, { prio: 1 });
      this.audio.horde();
      director.spikeWarning = 2;
      return;
    }
    const copy = labels[phase.id];
    if (copy) this.hud.banner(t(copy[0]), t(copy[1]), 2.8);
    const authority = !level.net || level.net.authority;
    if (!authority) return;
    if (phase.id === 'pressure' && !level.defense && !level.portal) {
      const a = level.world.layout.arena || level.world.layout.village;
      const types = ['walker', 'runner', 'boxer'];
      // Campaign stages already contain a populated horde. Reuse it before
      // allocating new meshes so Front stays inside its +10 draw-call budget.
      const existing = level.zombies.list.filter((zombie) =>
        !zombie.dead && !zombie.gone && !zombie.frontCommander);
      for (let i = 0; i < phase.spawnBudget; i++) {
        const reused = existing[i];
        if (reused) {
          reused.frontEncounter = true;
          reused.horde = true;
          reused.aggroed = true;
          reused.state = 'chase';
          continue;
        }
        const angle = ((director.plan.seed + i * 7) % 360) * Math.PI / 180;
        const radius = 18 + (i % 4) * 2;
        const zombie = level.zombies.spawn(types[(director.plan.seed + i) % types.length],
          a.x + Math.cos(angle) * radius, a.z + Math.sin(angle) * radius, {
            horde: true,
            anchor: { x: a.x, z: a.z, r: 38 },
          });
        zombie.frontEncounter = true;
      }
      return;
    }
    if (phase.id === 'reward') {
      const p = level.player.pos;
      level.effects.spawnPickup(p.x + 1.2, p.z, 'medkit', 90);
      level.effects.spawnPickup(p.x - 1.2, p.z, 'ammo', 90);
      level.frontRewardDrop = true;
      if (level.frontPendingResult) {
        const pending = level.frontPendingResult;
        level.frontPendingResult = null;
        this._showFrontModeResult(level, true, pending.icon, pending.objective, pending.detail);
      } else if (level.frontObjectiveComplete && this._frontCanComplete(level)) {
        this._showVictory();
      }
      return;
    }
  }

  _spawnFrontSpike(level) {
    const director = level.frontDirector;
    const phase = director && director.plan.phases[director.phaseIndex];
    if (!phase || phase.id !== 'spike' || (level.net && !level.net.authority)) return;
    if (level.operation.stage === 2) {
      const a = level.world.layout.arena || level.world.layout.village;
      const commander = director.plan.commander;
      const zombie = level.zombies.spawn(commander.zombieType, a.x, a.z, {
        elite: true,
        horde: true,
        anchor: { x: a.x, z: a.z, r: 32 },
      });
      zombie.frontCommander = commander.id;
      zombie.maxHp = Math.round(zombie.maxHp * (1.7 + level.operation.threat * 0.25));
      zombie.hp = zombie.maxHp;
    } else if (!level.defense && !level.portal) {
      level.zombies.spawnEliteWave(Math.max(1, Math.min(3, level.operation.threat)));
    }
  }

  _updateFrontDirector(level, dt) {
    const director = level.frontDirector;
    if (!director || director.phaseIndex >= director.plan.phases.length - 1) return;
    if (director.spikeWarning > 0) {
      director.spikeWarning -= dt;
      if (director.spikeWarning <= 0) this._spawnFrontSpike(level);
      return;
    }
    director.remaining -= dt;
    if (director.remaining <= 0) this._enterFrontPhase(level, director.phaseIndex + 1);
  }

  _onFrontObjectiveComplete(level) {
    if (!level || !level.operation || level.frontObjectiveComplete) return;
    level.frontObjectiveComplete = true;
    if (level.operation.stage === 2) {
      if (level.frontDirector && level.frontDirector.phaseIndex < 2) this._enterFrontPhase(level, 2);
      return;
    }
    this._showVictory();
  }

  _frontCanComplete(level) {
    if (!level || !level.operation || !level.frontDirector) return true;
    if (level.net && !level.net.authority && level.frontRemoteComplete) return true;
    return level.operation.stage === 2 ? !!level.frontCommanderDefeated : !!level.frontObjectiveComplete;
  }

  _showFrontModeResult(level, won, icon, objective, detail) {
    if (won) level.frontObjectiveComplete = true;
    if (won && !this._frontCanComplete(level)) {
      level.frontPendingResult = { icon, objective, detail };
      return false;
    }
    level.bossDefeated = !!won;
    this.victoryShown = true;
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    if (won) this.audio.victory();
    else this.audio.defeat();
    this.audio.setMode(null);
    this.input.exitLock();
    return this._finishFrontStage(!!won);
  }

  _leaveFrontResult(overlay) {
    this._hideOverlay(overlay);
    this._finishFrontResult('globe');
  }

  // ---------- 🧭 експедиція ----------
  _expeditionCountries() {
    const ids = CAMPAIGN_ORDER.filter((id) => isCountryOpen(this.save.liberated, id) || hasLiberated(this.save.liberated, id));
    return ids.length ? ids : ['UKR'];
  }

  openExpedition({ coop = false } = {}) {
    let run = sanitizeExpedition(this.save.expedition);
    if (!run || (run.coop && !coop) || (!run.coop && coop)) {
      run = createExpedition({
        countries: this._expeditionCountries(),
        coop,
        specialist: sanitizeSpecialistId(this.save.coopRole, 'guard'),
      });
      this.save.expedition = run;
      this.saveGame();
    }
    this.renderExpedition();
    this._showOverlay('overlay-expedition');
    this.audio.click();
  }

  _selectExpeditionSpecialist(id) {
    const run = sanitizeExpedition(this.save.expedition);
    if (!run || run.coop || run.status !== 'active' || run.step !== 0 || run.wins !== 0) return false;
    run.specialist = sanitizeSpecialistId(id, 'guard');
    this.save.coopRole = run.specialist;
    this.save.expedition = run;
    this.saveGame();
    this.renderExpedition();
    return true;
  }

  _claimExpeditionMastery(run) {
    if (!run || !['won', 'failed'].includes(run.status)) return null;
    const id = run.coop ? sanitizeSpecialistId(this.save.coopRole, 'guard') : run.specialist;
    const next = claimSpecialistMastery(this.save, run, id);
    this.save.specialistXp = next.specialistXp;
    this.save.specialistClaims = next.specialistClaims;
    if (next.result.awarded) {
      this._lastSpecialistMastery = { id, ...next.result };
      if (run.coop && this.coop && this.coop.session.state !== 'idle') this.coop.session.setMyRole(id);
    }
    return { id, ...next.result };
  }

  openExpeditionFighter(id, trigger = document.activeElement) {
    this._fighterProfileId = sanitizeFighterId(id, 'guard');
    this.renderExpeditionFighter();
    this._showOverlay('overlay-fighter', trigger);
    this.audio.click();
  }

  renderExpeditionFighter() {
    const id = sanitizeFighterId(this._fighterProfileId, 'guard');
    const cfg = SPECIALISTS[id];
    const levels = sanitizeFighterLevels(this.save.fighterLevels);
    const level = levels[id];
    const bonus = Math.round((fighterLevelMultiplier(level) - 1) * 100);
    const run = sanitizeExpedition(this.save.expedition);
    const locked = !run || run.coop || run.status !== 'active' || run.step !== 0 || run.wins !== 0;
    const pending = !cfg.playable;
    const selected = run && run.specialist === id;
    const abilities = [
      ['АТАКА', cfg.attackName],
      ['SUPER', cfg.superName],
      ['ГАДЖЕТ 1', cfg.gadgets[0]],
      ['ГАДЖЕТ 2', cfg.gadgets[1]],
    ];
    document.getElementById('fighter-title').textContent = `${cfg.icon} ${t(cfg.name)}`;
    document.getElementById('fighter-role').textContent = t('Клас: {role}', { role: t(cfg.role) });
    document.getElementById('fighter-level').textContent = t('Рівень {n}/5', { n: level });
    document.getElementById('fighter-stats').textContent = t('+{n}% HP · +{n}% шкоди', { n: bonus });
    document.getElementById('fighter-abilities').innerHTML = abilities.map(([label, value]) =>
      `<div class="fighter-ability" ${pending ? 'data-pending' : ''}><strong>${t(label)}</strong><span>${t(value)}</span></div>`).join('');
    document.getElementById('fighter-status').textContent = pending
      ? t('Додай атаку, Super і гаджети — тоді боєць відкриється для гри.')
      : locked
        ? t('Боєць і прокачка зафіксовані до кінця забігу.')
        : t('Super заряджається влучаннями. На 100% натисни F або кнопку Super.');
    const select = document.getElementById('btn-fighter-select');
    select.textContent = selected ? t('✅ Обрано') : t('✅ Обрати');
    select.disabled = pending || locked || selected;
    const upgrade = document.getElementById('btn-fighter-upgrade');
    const cost = FIGHTER_UPGRADE_COSTS[level + 1];
    upgrade.textContent = level >= 5
      ? t('⭐ МАКС. РІВЕНЬ')
      : t('⬆️ Рівень {n}: 🪙 {coins}{crystals}', {
        n: level + 1,
        coins: cost.coins,
        crystals: cost.crystals ? ` · 💎 ${cost.crystals}` : '',
      });
    upgrade.disabled = pending || locked || level >= 5;
  }

  renderExpedition() {
    const run = sanitizeExpedition(this.save.expedition);
    if (!run) return;
    this.save.expedition = run;
    const summary = document.getElementById('expedition-summary');
    const route = document.getElementById('expedition-route');
    const build = document.getElementById('expedition-build');
    const votes = document.getElementById('expedition-votes');
    const go = document.getElementById('btn-expedition-go');
    const abandon = document.getElementById('btn-expedition-abandon');
    const specialists = document.getElementById('expedition-specialists');
    const lock = document.getElementById('expedition-specialist-lock');
    const mastery = document.getElementById('expedition-mastery');
    const selected = run.coop ? sanitizeSpecialistId(this.save.coopRole, 'guard') : run.specialist;
    const locked = run.coop || run.status !== 'active' || run.step !== 0 || run.wins !== 0;
    const fighterLevels = sanitizeFighterLevels(this.save.fighterLevels);
    specialists.innerHTML = EXPEDITION_FIGHTER_IDS.map((id) => {
      const cfg = SPECIALISTS[id];
      const rank = specialistRank(this.save.specialistXp[id]);
      const upcoming = !cfg.playable;
      const detail = upcoming
        ? `${t(cfg.role)} · ${t('Очікує твоєї ідеї')}`
        : `${t(cfg.passive)} · Super: ${t(cfg.superName)}`;
      return `<button class="expedition-specialist${rank === 3 ? ' rank-3' : ''}${upcoming ? ' upcoming' : ''}" data-specialist="${id}" aria-pressed="${id === selected}"><strong>${cfg.icon} ${t(cfg.name)} · ${t('Рівень')} ${fighterLevels[id]}</strong><span>${detail}</span></button>`;
    }).join('');
    specialists.querySelectorAll('[data-specialist]').forEach((button) => {
      button.addEventListener('click', () => this.openExpeditionFighter(button.dataset.specialist, button));
    });
    lock.textContent = !run.coop && locked ? t('Спеціаліста зафіксовано до кінця забігу') : '';
    mastery.textContent = '';
    summary.textContent = run.status === 'won'
      ? t('Експедицію завершено: {n}/{all} перемог.', { n: run.wins, all: EXPEDITION_STEPS })
      : run.status === 'failed'
        ? t('Експедиція завершилась після {n} перемог.', { n: run.wins })
        : t('Етап {n}/{all} · {kind}', { n: run.step + 1, all: EXPEDITION_STEPS, kind: run.coop ? t('разом') : t('соло') });
    build.textContent = run.build.length
      ? t('🎲 Збірка: {cards}', { cards: run.build.map((id) => (expeditionCard(id) || {}).icon || '◆').join('') })
      : t('🎲 Збірка зʼявиться після першого вибору маршруту.');
    votes.textContent = '';
    route.innerHTML = '';
    if (run.status === 'active' && run.current) {
      const meta = EXPEDITION_NODE_TYPES[run.current.type];
      route.innerHTML = `<div class="expedition-node sel"><strong>${meta.icon} ${t(meta.name)}</strong><span>${t(meta.desc)}</span></div>`;
      go.textContent = t('🚀 ПОЧАТИ ЕТАП');
      go.style.display = '';
    } else if (run.status === 'choice') {
      for (const node of run.choices) {
        const meta = EXPEDITION_NODE_TYPES[node.type];
        const card = expeditionCard(node.card);
        const button = document.createElement('button');
        button.className = 'expedition-node';
        button.dataset.node = node.id;
        button.innerHTML = `<strong>${meta.icon} ${t(meta.name)}</strong><span>${t(meta.desc)}${card ? ` · ${card.icon} ${t(card.name)}` : ''}</span>`;
        button.addEventListener('click', () => {
          if (run.coop) {
            this.coop.session.voteExpedition(node.id);
            route.querySelectorAll('.expedition-node').forEach((el) => el.classList.toggle('sel', el === button));
          } else {
            this.save.expedition = chooseExpeditionNode(run, node.id);
            this.saveGame();
            this.renderExpedition();
          }
        });
        route.appendChild(button);
      }
      go.textContent = run.coop ? t('🗳️ ОБРАТИ ГОЛОСУВАННЯМ') : t('Обери маршрут вище');
      go.style.display = run.coop && this.coop.session.role === 'host' ? '' : 'none';
      if (run.coop) votes.textContent = t('Голоси: {n}/{all}. За рівності вирішує голос хоста.', {
        n: this.coop.session.expeditionVotes.size,
        all: this.coop.session.roster.size,
      });
    } else {
      const claim = this._claimExpeditionMastery(run);
      if (claim.awarded) this.saveGame();
      const r = run.reward;
      route.innerHTML = `<div class="expedition-node sel"><strong>${run.status === 'won' ? t('🏆 ЕКСПЕДИЦІЮ ПРОЙДЕНО!') : t('🧭 ЗАБІГ ЗАВЕРШЕНО')}</strong><span>${t('Нагорода')}: 🪙 ${r.coins} · 💎 ${r.crystals}</span></div>`;
      const xp = this.save.specialistXp[claim.id];
      const rank = specialistRank(xp);
      const next = rank === 1 ? 100 : rank === 2 ? 300 : null;
      const gained = this._lastSpecialistMastery && this._lastSpecialistMastery.id === claim.id
        ? this._lastSpecialistMastery.awarded : 0;
      mastery.textContent = `${SPECIALISTS[claim.id].icon} ${t('Майстерність')}: ${gained ? `+${gained} XP · ` : ''}${xp} XP · ${t('Ранг')} ${rank}${next ? ` · ${next - xp} XP ${t('до наступного рангу')}` : ` · ${t('МАКС. РАНГ')}`}`;
      go.textContent = t('🧭 НОВА ЕКСПЕДИЦІЯ');
      go.style.display = run.coop && this.coop.session.role !== 'host' ? 'none' : '';
    }
    abandon.style.display = ['active', 'choice'].includes(run.status) ? '' : 'none';
  }

  _expeditionGo() {
    const run = sanitizeExpedition(this.save.expedition);
    if (!run) return this.openExpedition();
    if (run.status === 'active') return this._startExpeditionNode(run);
    if (run.status === 'choice') {
      if (run.coop && this.coop.session.role === 'host') return this.coop.session.commitExpeditionVote();
      return;
    }
    this._lastSpecialistMastery = null;
    this.save.expedition = createExpedition({
      countries: this._expeditionCountries(),
      coop: run.coop,
      specialist: sanitizeSpecialistId(this.save.coopRole, 'guard'),
    });
    this.saveGame();
    if (run.coop && this.coop.session.syncExpedition) this.coop.session.syncExpedition(this.save.expedition);
    this.renderExpedition();
  }

  _startExpeditionNode(run = this.save.expedition) {
    const cfg = expeditionLevelConfig(run);
    if (!cfg) return;
    this._hideOverlay('overlay-expedition');
    if (run.coop) return this.coop.session.startExpeditionNode(run);
    this.startLevel(cfg.countryId, cfg.opts);
  }

  _finishExpeditionNode(won) {
    const current = this.level && this.level.expedition;
    if (!current || this.level._expeditionFinished) return false;
    this.level._expeditionFinished = true;
    const run = completeExpeditionNode(current, { won: !!won, build: this.level.runBuild ? this.level.runBuild.ids : [] });
    if (!run) return false;
    if ((run.status === 'won' || run.status === 'failed') && !run.reward.claimed) {
      this.save.coins += run.reward.coins;
      this.save.crystals = (this.save.crystals || 0) + run.reward.crystals;
      if (run.status === 'won' && this.level.net) this._grantCoopWin();
      run.reward.claimed = true;
    }
    this._claimExpeditionMastery(run);
    this.save.expedition = run;
    this.saveGame();
    if (run.coop && this.coop.session.syncExpedition) this.coop.session.syncExpedition(run);
    const retry = document.getElementById('btn-arena-retry');
    const globe = document.getElementById('btn-arena-globe');
    if (retry) retry.style.display = 'none';
    if (globe) globe.textContent = t('🧭 ДО МАРШРУТУ');
    return true;
  }

  _leaveExpeditionResult(overlay) {
    this._hideOverlay(overlay);
    this.endLevel();
    setTimeout(() => {
      this.renderExpedition();
      this._showOverlay('overlay-expedition');
    }, 50);
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
    const arenaGlobe = document.getElementById('btn-arena-globe');
    if (arenaGlobe) arenaGlobe.textContent = t('🌍 На глобус');
    const victoryGlobe = document.getElementById('btn-victory-globe');
    if (victoryGlobe) victoryGlobe.style.display = '';
    const victoryNext = document.getElementById('btn-victory-next');
    if (victoryNext) victoryNext.textContent = t('▶️ Далі');
    const spaceWorld = countryId === 'MOON' ? getSpaceWorld(opts.spaceWorld) : null;
    const moonRegion = countryId === 'MOON' ? getMoonRegion(opts.moonRegion, spaceWorld.id) : null;
    const isCustomEditor = opts.customMap === 'edit';
    const isCustomPlay = opts.customMap === 'play';
    const isCustom = isCustomEditor || isCustomPlay;
    const customMapSlot = this.save.upgrades.mapeditorplus > 0 && opts.customMapSlot === 1 ? 1 : 0;
    const customMapData = opts.customMapData || (customMapSlot ? this.save.customMap2 : this.save.customMap);
    const rawCountry = isCustom ? CUSTOM_COUNTRY : (COUNTRIES[countryId] || COUNTRIES.UKR);
    const baseCountry = moonRegion ? {
      ...rawCountry,
      name: moonRegion.name,
      flag: spaceWorld.icon,
      seed: moonRegion.seed,
      banner: t(spaceWorld.banner),
      boss: { ...rawCountry.boss, name: t(spaceWorld.bossName) },
    } : rawCountry;
    const mapSize = sanitizeMapSize((opts.coop && opts.coop.spec && opts.coop.spec.ms) || this.save.mapSize);
    const mapStyle = sanitizeMapStyle((opts.coop && opts.coop.spec && opts.coop.spec.mt) || this.save.mapStyle);
    const country = { ...baseCountry, map: { ...scaleMap(baseCountry.map, mapSize), mapStyle } };
    const coopFront = opts.operation && opts.coop && opts.coop.role === 'guest'
      ? opts.coop.session.frontRun : null;
    const savedFront = sanitizeFront(
      (opts.operation && coopFront) || this.save.front,
      opts.operation && coopFront ? {} : this._frontContext(),
    );
    const savedOperation = savedFront && opts.operation
      ? savedFront.board.find((item) => item.id === opts.operation.operationId)
      : null;
    const derivedFrontStage = savedFront && opts.operation ? frontStageConfig(savedFront) : null;
    const operation = opts.operation && savedOperation ? {
      ...opts.operation,
      template: savedOperation.template,
      threat: savedOperation.threat,
      missionPreset: opts.missionPreset || (derivedFrontStage && derivedFrontStage.missionPreset) || null,
    } : null;
    const isStorm = !!opts.storm;
    document.body.classList.toggle('storm-mode', isStorm);
    const isKnockout = !!opts.knockout;
    const knockoutVariant = opts.knockout === 'overloaded' ? 'overloaded' : opts.knockout === 'friendly' ? 'friendly' : 'normal';
    const isOverloadedKnockout = isKnockout && knockoutVariant === 'overloaded';
    const isFriendlyKnockout = isKnockout && knockoutVariant === 'friendly';
    const isDefense = !!opts.defense;
    // friendly-варіанти (кооп) грають на конфігах normal/zone — «дружність» лише у
    // доступності з кооп-лобі; соло-рекорди в коопі й так не пишуться (_soloModeFinish)
    const defenseVariant = opts.defense === 'overloaded' ? 'overloaded'
      : (opts.defense === 'zone' || opts.defense === 'zone-friendly') ? 'zone' : 'normal';
    const isOverloadedDefense = isDefense && defenseVariant === 'overloaded';
    const isZoneDefense = isDefense && defenseVariant === 'zone';
    const isPvp = !!opts.pvp;
    const pvpVariant = opts.pvp === 'overloaded' ? 'overloaded' : 'normal';
    const isBank = !!opts.bank;
    const isPortal = !!opts.portal;
    const isMaze = !!opts.maze;
    const isHumans = !!opts.humans;
    const isSoulCollector = !!opts.soulCollector;
    const isTurretWar = !!opts.turretwar;
    const isRadiation = !!opts.radiation;
    const isInfected = !!opts.infected;
    const humansVariant = opts.humans === 'overloaded' ? 'overloaded' : 'normal';
    const isOverloadedHumans = isHumans && humansVariant === 'overloaded';
    const worldBossId = opts.worldBoss || null;
    const isWorldBoss = !!worldBossId;
    const modeId = modeIdFromOpts(opts, worldBossId);
    const baseRules = MODE_RULES[modeId] || MODE_RULES.campaign;
    const isPlayground = !!opts.playground;
    const coop = opts.coop || null;
    const soloWeeklyModId = (!coop && !isPlayground) ? this.weeklyModifierId() : null;
    // 🗓️ мутатор тижня: соло-реплеї кампанії ВЖЕ звільнених країн (перші проходження —
    // без сюрпризів); у коопі — лише зі spec хоста (opts.mut), а НЕ з локального
    // календаря гостя (границя тижня опівночі не розсинхронить команду)
    // weeklyMod (правила/орда) лишається campaign-only соло — у коопі його НЕ вмикаємо,
    // мутатор тижня несе лише hp/type/night-ефекти через weeklyMutator нижче
    const wkModId = coop
      ? null
      : (modeId === 'campaign' && !opts.playground && hasLiberated(this.save.liberated, countryId)
        ? soloWeeklyModId : null);
    const wkMod = this._modifierById(wkModId);
    // джерело id мутатора: соло — гейтований календарний id; кооп — id зі spec хоста
    const mutatorSrcId = coop ? (opts.mut || null) : soloWeeklyModId;
    const weeklyMutator = this._buildWeeklyMutator(mutatorSrcId, { coop, isPlayground });
    const modeRules = wkMod && wkMod.rules ? { ...baseRules, ...wkMod.rules } : baseRules;
    document.body.classList.toggle('no-shop-mode', !!modeRules.noShop);
    const isGuest = !!(coop && coop.role === 'guest');
    const isArena = !!opts.arena;
    // екран завантаження рівня з порадою
    document.getElementById('ll-title').textContent = operation
      ? t('🛰️ ЖИВИЙ ФРОНТ · ЕТАП {n}/3', { n: operation.stage + 1 })
      : opts.expedition
      ? t('🧭 ЕКСПЕДИЦІЯ')
      : isWorldBoss
      ? t('🌋 СВІТОВИЙ БОС')
      : isPvp
      ? (pvpVariant === 'overloaded' ? t('💣 Перегружене ПВП') : t('⚔️ ПВП'))
      : isBank
      ? t('🏦 БАНК')
      : isPortal
      ? t('🌀 ПОРТАЛ')
      : isMaze
      ? t('🧩 ЛАБІРИНТ')
      : isHumans
      ? (isOverloadedHumans ? t('💥 Перегружена зомбі проти людей') : t('⚔️ ЗОМБІ ПРОТИ ЛЮДЕЙ'))
      : isSoulCollector
      ? t('👻 ЗБИРАЧ ДУШ')
      : isTurretWar
      ? t('🗼 ОБОРОНА ТУРЕЛІ')
      : isRadiation
      ? t('☢️ РАДІАЦІЯ')
      : isCustomEditor
      ? t('🧱 СТВОРЮВАЧ КАРТ')
      : isCustomPlay
      ? t('🗺️ МОЯ КАРТА')
      : isDefense
      ? (isZoneDefense ? t('⭕ Оборона в зоні') : isOverloadedDefense ? t('🏰 Перегружена оборона') : t('🛡️ ОБОРОНА'))
      : isKnockout
      ? (isFriendlyKnockout ? t('🤝 Дружній нокаут') : isOverloadedKnockout ? t('💥 Перегружений нокаут') : t('🥊 НОКАУТ'))
      : isArena
      ? t('👑 АРЕНА БОСІВ')
      : isStorm
        ? t('⛈️ ШТОРМ: {c}', { c: country.name.toUpperCase() })
        : isPlayground
          ? t('🧪 ПОЛІГОН ГАДЖЕТІВ')
          : `${country.flag} ${country.name.toUpperCase()}`;
    const tips = buildTips();
    // у noShop-режимах не радимо магазин, якого нема
    const tipPool = modeRules.noShop ? tips.filter((s) => !/🛒|магазин|shop/i.test(s)) : tips;
    document.getElementById('ll-tip').textContent = '💡 ' + tipPool[Math.floor(Math.random() * tipPool.length)];
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
     *   bank     — тільки в режимі Банк; інакше — undefined.
     *   portal   — тільки в режимі Портал; інакше — undefined.
     *   maze     — тільки в режимі Лабіринт; інакше — undefined.
     *   humans   — тільки в режимі Зомбі проти людей; інакше — undefined.
     *   worldBoss — тільки в режимі Світового боса; інакше — undefined.
     *   sandstorm — тільки соло-кампанія EGY (піщана буря); інакше — null/undefined.
     *   radiation — тільки в режимі Радіація; інакше — undefined.
     *   megabox  — null для гостя (isGuest) або арени (isArena); інакше new Megabox(...).
     *
     * Правило: перед доступом до режимо-умовних полів завжди перевіряй наявність (level.storm?.foo).
     */
    const level = {
      game: this,
      countryId,
      modeId,
      country,
      moonRegion,
      spaceWorld,
      mapSize,
      mapStyle,
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
      infected: isInfected,
      playgroundGadget: isPlayground ? (GADGETS[opts.gadget] ? opts.gadget : Object.keys(GADGETS)[0]) : null,
      weeklyMod: wkMod,
      weeklyModId: wkModId,
      weeklyMutator,
      weekly: opts.weekly || null,
      expedition: sanitizeExpedition(opts.expedition || (coop && coop.spec && coop.spec.ex)),
      operation,
      frontCountryState: frontCountryState(savedFront, countryId),
      encounterPlan: operation ? (opts.encounterPlan || null) : null,
      noGadgets: isCustomEditor || !!modeRules.noGadgets,
      modeShield: pvpVariant === 'overloaded' ? { hp: 1000, cd: 45 } : null,
      noShop: isCustomEditor || !!modeRules.noShop,
      noBuffs: !!modeRules.noBuffs,
      noPickups: !!modeRules.noPickups,
      noZombiePickups: !!modeRules.noZombiePickups,
      noCoinDrops: !!modeRules.noCoinDrops,
      customEditor: isCustomEditor,
      customPlay: isCustomPlay,
    };
    // ⭐ зірки складності (M7): діють ЛИШЕ при соло-реплеї вже звільненої країни.
    // Перші проходження / шторм / арена / будь-який кооп → ★1 (без десинхрону).
    // ВАЖЛИВО: ставимо ДО new Zombies(...) — конструктор читає level.diffStar.
    const coopActive = !!(this.coop && this.coop.session && this.coop.session.state !== 'idle');
    const soloReplay = !operation && !opts.expedition && !isStorm && !isArena && !isKnockout && !isDefense && !isPvp && !isBank && !isPortal && !isMaze && !isHumans && !isSoulCollector && !isTurretWar && !isRadiation && !isWorldBoss && !coopActive && hasLiberated(this.save.liberated, countryId);
    level.diffStar = isInfected ? Math.max(3, this.save.diffStar || 1) : soloReplay ? (this.save.diffStar || 1) : 1;
    this._applyLevelExposure(countryId);
    level.world = new World(level.scene, country.seed,
      getBiome(isCustom ? (customMapData.biome === 'snow' ? 'POL' : 'UKR') : countryId, moonRegion && spaceWorld.palette),
      country.map, this._qualityWorldOpts());
    level.effects = new Effects(level.scene, level.world, this.audio);
    level.effects.levelRef = level;
    // 💸 R3 «Поразка теж платить»: знімок XP на старті — щоб показати ЗДОБУТЕ за забіг на екрані смерті
    level._startXp = this.save.xp || 0;
    // ⭐ R3 зірки/милосердя (solo-only, лише країни кампанії) виставляються нижче після вибору місій
    level.addCoins = (n) => {
      if (level.playground) return;
      this.save.coins += n;
      level.stats.coinsEarned += n;
      this._bumpSecondary(level, 'coins', n); // ⭐2 «Збери N монет за забіг»
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
    if (isKnockout || isDefense || isPvp || isBank || isPortal || isHumans || isSoulCollector || isTurretWar || isRadiation) {
      level.player.weapons = isRadiation ? ['shotgun'] : isTurretWar ? ['hammer'] : isSoulCollector ? ['staff', 'sword'] : isHumans ? ['pistol', 'staff', 'sword'] : isPortal ? ['pistol', 'bazooka'] : isBank ? ['staff', 'pistol'] : isPvp ? (pvpVariant === 'overloaded' ? ['cannon', 'sword'] : ['staff']) : isZoneDefense ? ['staff', 'pistol'] : isDefense ? ['pistol', 'rifle'] : ['pistol'];
      level.player.cur = isRadiation ? 'shotgun' : isTurretWar ? 'hammer' : isSoulCollector ? 'staff' : isHumans ? 'pistol' : isPortal ? 'pistol' : isBank ? 'staff' : isPvp ? (pvpVariant === 'overloaded' ? 'cannon' : 'staff') : isZoneDefense ? 'staff' : isDefense ? 'rifle' : 'pistol';
      level.player.grenades = 0;
      if (isPortal) level.player.addRockets(WEAPONS.bazooka.cap);
      if (isRadiation) {
        level.player.maxHealth = 50;
        level.player.health = 50;
        level.player.maxArmor = 0;
        level.player.armor = 0;
        level.player.damageMult = 1;
        level.player.ammo.shotgun.mag = Math.min(WEAPONS.shotgun.mag, 10);
        level.player.ammo.shotgun.reserve = Math.max(0, 10 - level.player.ammo.shotgun.mag);
      } else if (isPvp) {
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
      } else if (isOverloadedHumans) {
        level.player.maxHealth = 350;
        level.player.health = 350;
        level.player.maxArmor = 0;
        level.player.armor = 0;
      } else if (isSoulCollector) {
        level.player.maxHealth = 50;
        level.player.health = 50;
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
    if (level.expedition) {
      const id = level.expedition.coop
        ? sanitizeSpecialistId(this.save.coopRole, 'guard')
        : sanitizeSpecialistId(level.expedition.specialist, 'guard');
      const rank = specialistRank(this.save.specialistXp[id]);
      const modifiers = specialistModifiers(id, rank);
      const active = !isRadiation;
      const fighterLevel = level.expedition.coop ? null : sanitizeFighterLevels(this.save.fighterLevels)[id];
      level.specialist = { id, rank, level: fighterLevel, charge: 0, maxCharge: 100, active };
      if (active) {
        level.player.maxHealth += modifiers.maxHealthBonus;
        level.player.health = level.player.maxHealth;
        level.player.healMult *= modifiers.healMult;
        level.player.speedMult *= modifiers.speedMult;
        level.player.pickupMult *= modifiers.pickupMult;
        if (!level.expedition.coop) {
          const levelMultiplier = fighterLevelMultiplier(fighterLevel);
          level.player.maxHealth = Math.round(level.player.maxHealth * levelMultiplier);
          level.player.health = level.player.maxHealth;
          level.player.damageMult *= levelMultiplier;
        }
        const nodeType = level.expedition.current && level.expedition.current.type;
        if (['rescue', 'elite', 'boss'].includes(nodeType)) {
          level.player.weapons = [...SPECIALISTS[id].kit];
        } else if (nodeType !== 'turretwar') {
          level.player.weapons = [...new Set([...level.player.weapons, SPECIALISTS[id].signature])];
        }
        if (!level.player.weapons.includes(level.player.cur)) level.player.cur = level.player.weapons[0];
        level.player._applyView();
      }
    }
    if (operation) {
      level.operationEffects = specialistEffects(operation.specialist, savedFront.projects);
      const baseHeal = level.player.heal.bind(level.player);
      level.player.heal = (amount) => baseHeal(amount * level.operationEffects.healingMultiplier);
    }

    level.zombies = new Zombies(level, this.seed + 2);
    if (isCustom) {
      level.customMap = new CustomMapMode(level, customMapData, isCustomEditor, customMapSlot);
      level.missions = level.customMap;
      document.body.classList.toggle('map-editor-mode', isCustomEditor);
    } else if (isKnockout) {
      level.knockout = new KnockoutMode(level, knockoutVariant);
      level.missions = level.knockout;
      // 🎲 «Прокачка» у Нокауті: соло-драфт на середині забігу (див. KnockoutMode.update)
      // (level.net тут ЩЕ null — кооп визначаємо по coop-параметру, net ставиться нижче)
      if (!coop) level.runBuild = new RunBuild();
    } else if (isDefense) {
      level.defense = new DefenseMode(level, defenseVariant);
      level.missions = level.defense;
      // 🎲 «Прокачка» в Обороні: соло-драфт на межі хвилі (див. DefenseMode.update)
      if (!coop) level.runBuild = new RunBuild();
    } else if (isPvp) {
      level.pvp = new PvpMode(level, pvpVariant);
      level.missions = level.pvp;
    } else if (isBank) {
      level.bank = new BankMode(level);
      level.missions = level.bank;
    } else if (isPortal) {
      level.portal = new PortalMode(level);
      level.missions = level.portal;
      // 🎲 «Прокачка» у Порталі: соло-драфт при закритті кожного порталу (див. PortalMode.damagePortal)
      if (!coop) level.runBuild = new RunBuild();
    } else if (isMaze) {
      level.maze = new MazeMode(level);
      level.missions = level.maze;
    } else if (isHumans) {
      level.humans = new HumansMode(level, humansVariant);
      level.missions = level.humans;
    } else if (isSoulCollector) {
      level.soulCollector = new SoulCollectorMode(level);
      level.missions = level.soulCollector;
    } else if (isTurretWar) {
      level.turretwar = new TurretWarMode(level);
      level.missions = level.turretwar;
    } else if (isRadiation) {
      level.radiation = new RadiationMode(level);
      level.missions = level.radiation;
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
      // 🎲 «Прокачка» у Штормі: соло І кооп (v236) — у коопі хост роздає набори подією
      // dro, а apply() кожен робить локально в себе (стати гостя не авторитарні)
      level.runBuild = new RunBuild();
    } else {
      if (!isGuest) level.zombies.populate();
      const useStory = shouldUseStoryMissions({
        countryId,
        modeId,
        isGuest,
        isCoop: !!coop,
        isPlayground,
      }) && (!moonRegion || moonRegion.story) && !this._forceMissionSet && !level.expedition && !operation;
      const frontPreset = coop && operation && operation.missionPreset === 'rebuild-center'
        ? 'rescue-group'
        : operation && operation.missionPreset;
      const frontMissions = frontPreset && FRONT_MISSION_PRESETS[frontPreset];
      level.missions = useStory ? new StoryMissions(level) : new DynamicMissions(level, (moonRegion && moonRegion.missions) || frontMissions || null, { objectiveOnly: !!operation });
      // 🤝 R4 «Врятовані друзі»: схований НПС у клітці — ЛИШЕ соло-кампанія (useStory вже
      // означає campaign + !guest + !coop + !playground). У коопі клітка просто не спавниться.
      if (useStory) level.rescueCage = new HiddenRescue(level);
      // 🌪️ Фірмовий хазард Єгипту (v293): піщана буря ЛИШЕ у соло-кампанії EGY.
      // useStory ⇒ campaign + !guest + !coop + !playground; додатково виключаємо
      // інфекцію (Глава 2). Кооп/спецрежими/PROTO лишаються без бурі (синк погоди
      // хостом поза скоупом).
      level.sandstorm = null;
      if (useStory && countryId === 'EGY' && !isInfected) level.sandstorm = new Sandstorm(level);
      // 🎲 «Прокачка» і в соло-кампанії: картка після кожної місії (кооп — окремий beat)
      if (!coop && !isPlayground) level.runBuild = new RunBuild();
      // 🌟 «момент могутності» (v288): супер-пікап 1×/рівень у соло-кампанії ТА кооп-кампанії.
      // v297 «Сила разом»: рішення про спавн приймає ХОСТ (гість малює дзеркало по `spx`).
      if ((!coop || coop.role === 'host') && !isPlayground) level.superEligible = true;
      // ⭐ R3 «Зірки та милосердя»: лише СОЛО-забіг країни кампанії (не інфекція/кооп/полігон).
      if (!coop && !isPlayground && !isInfected && !level.expedition && !operation && CAMPAIGN_ORDER.includes(countryId)) {
        // ⭐2 — 1 випадкова вторинна ціль на забіг (варіює за країною й повтором; тест форсить тип)
        const runIdx = (this.save.missionRuns[countryId] || 0);
        level.secondaryObjective = pickSecondaryObjective(country, country.seed + runIdx * 3, this._forceSecondary || null);
        // 🕊️ невидиме милосердя: після 2+ смертей поспіль у ЦІЙ країні — тихі послаблення (БЕЗ UI).
        const md = this.save.mercyDeaths;
        level.mercy = (md && md.cid === countryId && md.n >= 2) ? { hpMult: 0.9, medkitMult: 1.5, eliteMinus: 1 } : null;
      } else if (coop && !isPlayground && !isInfected && !level.expedition && !operation && CAMPAIGN_ORDER.includes(countryId)) {
        // ⭐ R3 «Зірки разом» (v298): у КООП-кампанії вторинна ціль КОМАНДНА. Дефініцію
        // ({id,target}) ролить ХОСТ від сіда кімнати у coop.startLevel і кладе у spec (`so`),
        // тож обидві сторони будують ТУ САМУ ціль (чип видно всім). Прогрес рахує лише хост
        // (див. _bumpSecondary/уникредитований лічильник елітів), виконання шле подією `soc`.
        // 🕊️ Милосердя (mercy) лишається СОЛО-only: у коопі тебе піднімає друг — це і є
        // милосердя. Тож level.mercy тут НЕ виставляємо (і mercyDeaths у коопі не тікаємо).
        const soDef = coop.spec && coop.spec.so;
        if (soDef && soDef.id) level.secondaryObjective = pickSecondaryObjective(country, 0, soDef.id);
      }
    }
    if (level.expedition) {
      if (!level.runBuild) level.runBuild = new RunBuild();
      level.runBuild.restore(level.expedition.build, level.player);
    }
    if (operation) {
      if (!level.runBuild) level.runBuild = new RunBuild();
      level.runBuild.restore(operation.build, level.player);
      level._frontBuildStart = level.runBuild.ids.length;
    }
    if (isInfected && !isGuest) this._seedInfectedThreats(level);
    // 🦙🐶🛴🦘 іграшки рівня (мегабокс гостю створить мережа — позиція від хоста)
    level.megabox = (isCustom || isGuest || isArena || isPlayground || isKnockout || isDefense || isPvp || isBank || isPortal || isMaze || isHumans || isSoulCollector || isTurretWar || isRadiation || isWorldBoss) ? null : new Megabox(level, isStorm ? 8 : null, isStorm ? 8 : null);
    // 🌟 супер-пікап: стан на рівні (спавн — через _trySuperPickup на 2-й місії/елітній хвилі)
    level.superPickup = null;
    level.superSpawned = false;
    level.superMissions = 0;
    // 🌟 кооп-хост: активні супер-сили гостей (pid→{power,ttl}) — джерело істини для
    // магніт-бурі у хостовому лут-циклі (getPickupTargets). Тикається у _updateCoopSuper.
    level.superActive = new Map();
    level.vehicles = new Vehicles(level);
    level.gadgets = new Gadgets(level);
    this._startGadgetChallenge(level, level.playgroundGadget);
    level.pet = (isCustomEditor || isPvp || isBank || isHumans || isSoulCollector || isTurretWar || isRadiation) ? null : this.save.activePet ? new Pet(level, this.save.activePet) : null;
    level.effects.tracerStyle = this.save.activeTracer === 'classic' ? null : this.save.activeTracer;

    // 🎲 лут у будинках перемішується ЩОЗАБІГУ — ніколи не знаєш, що знайдеш
    if (!isStorm && !isArena && !isKnockout && !isDefense && !isPvp && !isBank && !isPortal && !isMaze && !isHumans && !isSoulCollector && !isTurretWar && !isRadiation && !isGuest && !isPlayground) {
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
    for (const ls of ((isGuest || isArena || isKnockout || isDefense || isPvp || isBank || isPortal || isMaze || isHumans || isSoulCollector || isTurretWar || isRadiation || isPlayground) ? [] : level.world.lootSpots)) {
      if (ls.type === 'coins') {
        for (let i = 0; i < 5; i++) {
          level.effects.spawnCoin(ls.x + (Math.random() - 0.5) * 0.8, ls.z + (Math.random() - 0.5) * 0.8, 10, 9999, ls.y);
        }
      } else {
        level.effects.spawnPickup(ls.x, ls.z, ls.type, 9999, ls.y);
      }
    }
    if (!isGuest && !isKnockout && !isDefense && !isPvp && !isPortal && !isMaze && !isHumans && !isSoulCollector && !isTurretWar && !isRadiation) for (const sp of level.world.surpriseSpots) level.zombies.spawnSurprise(sp.x, sp.z);

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
    if (isCustom || isKnockout || isDefense || isPvp || isBank || isPortal || isMaze || isHumans || isSoulCollector || isTurretWar || isRadiation) level.effects.airdropT = Infinity;

    level.effects.getPlayerPos = () => level.player.pos;
    level.effects.getMagnetActive = () => level.player.buffs.magnet > 0;
    // 🌟 «Магніт-буря»: тягне монети з усієї мапи (радіус ∞) поки сила активна
    level.effects.getSuperMagnet = () => !!(level.player.superPower && level.player.superPower.type === 'magnet');
    // 🐾 R5: рівень активного петса трохи розширює радіус магніту монет (×1.05/×1.10). Супер виграє.
    level.effects.getPetMagnet = () => activePetMagnet(this.save);
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
      if (type === 'spacesuit') {
        level.player.equipSpacesuit();
        this.audio.powerup();
        this.hud.banner(t('🧑‍🚀 СКАФАНДР ЗНАЙДЕНО!'), t('Тепер ти можеш дихати на поверхні Місяця.'));
      } else if (type === 'coin') {
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
    if (countryId === 'MOON' && !isGuest) {
      const suit = country.map.storySites.suit;
      level.moonSuitPoint = { ...suit };
      level.effects.spawnPickup(suit.x, suit.z, 'spacesuit', 9999);
      if (!coop) level.moonHazards = new MoonHazards(level);
    }
    // вибух (граната/бочка 135 за замовч., ракета базуки 220 — передається явно): шкода зомбі по радіусу.
    // ownerPid — хто підірвав (для чесного кіл-кредиту/комбо/квестів у коопі); 1 = локальний гравець/хост
    level.effects.onExplosion = (x, y, z, r, baseDmg = 135, ownerPid = 1, meta = null) => {
      // вибух трощить і барикади поблизу
      for (const w of [...level.gadgets.walls]) {
        if (Math.hypot(w.x - x, w.z - z) < r) level.gadgets.damageWall(w, baseDmg);
      }
      for (const destructible of level.world.destructibles || []) {
        if (destructible.destroyed) continue;
        const pos = destructible.mesh.getWorldPosition(new THREE.Vector3());
        const d = Math.hypot(pos.x - x, pos.z - z);
        if (d < r) level.world.damageDestructible(destructible, Math.round(baseDmg * (1 - d / r * 0.55)), pos);
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
          zb.damage(dmg, null, false, { weaponId: 'explosion', hitZone: 'body', impactForce: 8, staggerTime: 0.45 });
        }
      }
      const missionEngine = level.missions && (level.missions.delegate || level.missions);
      const barracks = missionEngine && missionEngine.get && missionEngine.get('barracks');
      if (barracks && barracks.state === 'active') {
        const d = Math.hypot(barracks.site.x - x, barracks.site.z - z);
        if (d < r + 6) missionEngine.damageBarracks(Math.round(baseDmg * Math.max(0.35, 1 - d / (r + 6))));
      }
      const pd = Math.hypot(level.player.pos.x - x, level.player.pos.z - z);
      if (pd < r + 3) level.player.camShake = Math.max(level.player.camShake, 1.2);
      // 🚀 F10: вибух (своя ракета/бочка/граната) НЕ ранить гравця — лише струшує камеру.
      // Разом зі зведенням ракети (~3 м, див. effects.js) дитина не підриває себе
      // пострілом у натовп упритул. Шкода по ворогах (вище) лишається повною.
    };
    // сніжки/гармати ворогів
    level.effects.getDamageTargets = () => {
      const out = level.player.health > 0 ? [{ pos: level.player.pos, pid: 1 }] : [];
      const clones = level.gadgets && level.gadgets.clones;
      if (clones && clones.length) {
        for (const c of clones) if (c.hp > 0) out.push({ clone: c, pos: { x: c.x, y: c.y, z: c.z } });
      }
      return out;
    };
    level.effects.onProjectileHit = (dmg, x, z, tgt) => {
      if (tgt && tgt.clone) {
        if (tgt.clone.takeDamage) tgt.clone.takeDamage(dmg);
        else tgt.clone.hp -= dmg;
        return;
      }
      level.player.takeDamage(dmg, x, z);
    };

    this.hud.wire(level.bus);
    level.bus.on('hitmarker', (crit, weapon) => {
      if (crit && weapon !== 'rifle' && weapon !== 'smg') this._hitstopT = Math.max(this._hitstopT, 0.055);
    });
    level.bus.on('hitmarker', () => {
      const specialist = level.specialist;
      if (!specialist || !specialist.active || level.player.health <= 0) return;
      specialist.charge = Math.min(specialist.maxCharge,
        specialist.charge + SPECIALISTS[specialist.id].chargePerHit);
    });
    level.bus.on('zombieKilled', (z) => {
      if (level.mirror) return;
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      this._hitstopT = Math.max(this._hitstopT, z.type === 'boss' ? 0.07 : 0.045);
      if (this.save.activeSkin === 'angel') {
        level.effects.burst(new THREE.Vector3(z.x, z.y + 0.8, z.z), 0xffffff, 24, { speed: 2.4, up: 2.8, life: 3, size: 0.55 });
      } else if (this.save.activeSkin === 'demon') {
        level.effects.burst(new THREE.Vector3(z.x, z.y + 0.8, z.z), 0xff2b2b, 24, { speed: 2.4, up: 2.8, life: 3, size: 0.55 });
      } else if (this.save.activeSkin === 'radiation' && level.effects.radiationPuddle) {
        level.effects.radiationPuddle(new THREE.Vector3(z.x, z.y, z.z), (this.save.upgrades.radiationupgrade || 0) > 0);
      }
    });
    level.bus.on('playerDied', () => this._onPlayerDied());
    level.bus.on('playerRevived', () => this._onPlayerRevivedFx());
    level.bus.on('bossDied', () => this._onBossDied());
    level.bus.on('hordeEnd', () => {
      if (level.playground) return;
      level.addCoins(60);
      this.progress.addXp(XP_VALUES.horde);
      this.quests.onEvent('horde');
    });
    // 👹 v287: скриня по зачистці елітної хвилі — церемонія + монети/кристали.
    // 🤝 v296: у коопі кожен гравець нараховує собі локально неблокуючим банером
    // (без fullscreen-церемонії — рішення v294). Хост шле `ewc` решті і кредитує себе.
    level.bus.on('eliteWaveCleared', (pos) => {
      if (level.playground) return;
      if (level.net) {
        // v300 (PROTO 14): seq — щоб повторно доставлена пачка не кредитувала двічі
        if (level.net.authority) {
          level._chestEvSeq = (level._chestEvSeq || 0) + 1;
          level.netEv('ewc', level._chestEvSeq);
          this._grantEliteChestCoop();
        }
        return;
      }
      const { coins, crystals, eggChance } = CHEST_REWARDS.elite;
      level.addCoins(coins);
      this.save.crystals = (this.save.crystals || 0) + crystals;
      this.progress.addXp(XP_VALUES.horde);
      if (pos && level.effects) {
        level.effects.ring(new THREE.Vector3(pos.x, pos.y || 0, pos.z), 0xffd23f, 3.5);
        level.effects.burst(new THREE.Vector3(pos.x, (pos.y || 0) + 1, pos.z), 0xffd23f, 20, { speed: 5, up: 5, life: 0.9, size: 1.4 });
      }
      const items = [{ icon: '💰', n: coins }, { icon: '💎', n: crystals }];
      if (this._rollChestEgg(eggChance)) items.push({ icon: '🥚', label: t('яйце петса!') });
      this.chestCeremony({ title: t('🎁 СКРИНЯ ЕЛІТНОЇ ХВИЛІ!'), items });
      this.saveGame();
    });
    // 👑 v287: золотий зомбі впольовано — гарантована золота скриня.
    // 🤝 v296: у коопі кожен гравець нараховує собі локально (ті самі числа) банером.
    // Хост шле `gch` решті і кредитує себе.
    level.bus.on('goldenChest', (pos) => {
      if (level.playground) return;
      if (level.net) {
        if (level.net.authority) {
          level._chestEvSeq = (level._chestEvSeq || 0) + 1;
          level.netEv('gch', level._chestEvSeq);
          this._grantGoldenChestCoop();
        }
        return;
      }
      const { coins, crystals, eggChance } = CHEST_REWARDS.golden;
      level.addCoins(coins);
      this.save.crystals = (this.save.crystals || 0) + crystals;
      const items = [{ icon: '💰', n: coins }, { icon: '💎', n: crystals }];
      if (this._rollChestEgg(eggChance)) items.push({ icon: '🥚', label: t('яйце петса!') });
      this.chestCeremony({ title: t('🏆 ЗОЛОТА СКРИНЯ!'), items });
      this.saveGame();
    });
    // 🤝 R5: кожен 3-й врятований друг дарує яйце петса — теплий тост від друга
    level.bus.on('friendRescued', (cid) => this._onFriendRescued(cid));
    // 🏕️ тижневий квест «Врятуй N людей»: хлів рятунку = 3 людини (medic/granny/kid).
    // Гачок кіл-кредитований господарем (у гостя _complete не бігає) — рахуємо локально.
    level.bus.on('missionDone', (m) => { if (m && m.type === 'rescue') this._bumpCamp('rescue', 3); });
    // ⭐ зірковий досвід і щоденні завдання
    level.bus.on('zombieKilled', (z) => {
      if (level.playground) return;
      // кооп-хост: чужі перемоги зараховуються їхнім господарям (події zd)
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      if (this.touch) this.touch.vibeKill(z.type === 'boss');
      // 🧛 картка драфта «+1 HP за вбивство» (run-only, лише соло — runBuild нема в коопі)
      const lp = level.player;
      if (lp.lifeSteal > 0 && lp.health > 0) {
        lp.maxHealth += lp.lifeSteal;
        lp.health += lp.lifeSteal;
      }
      this.save.stats.killed++;
      // ⭐2 «Убий N елітних зомбі» — СОЛО тікає тут (свій кіл-кредит). У коопі командний
      // лічильник елітів рахує окремий уникредитований гачок нижче (еліт, убитий будь-ким).
      if (z.elite && !level.net) this._bumpSecondary(level, 'elite');
      // 🏕️ тижневий квест табору «Здолай N елітних» — тікає з ЛОКАЛЬНИХ елітних кілів
      // гравця (цей гачок уже кіл-кредитований: у коопі-хості чужі кіли відсіяно вище)
      if (z.elite) this._bumpCamp('elite');
      this._bumpWeeklyGoal();
      const bk = z.golden ? 'golden' : z.type;
      this.save.bestiary[bk] = (this.save.bestiary[bk] || 0) + 1;
      this._checkBestiaryGoals();
      if (z.golden) this.save.stats.golden++;
      const big = z.type === 'tank' || z.type === 'shield' || z.type === 'snowman' || z.type === 'spitter';
      const killXp = (level.worldBoss || level.radiation) && z.type === 'boss'
        ? 0
        : z.golden ? XP_VALUES.killGolden : z.type === 'boss' ? XP_VALUES.killBoss : big ? XP_VALUES.killBig : XP_VALUES.kill;
      if (killXp) this.progress.addXp(killXp);
      if (!((level.worldBoss || level.radiation) && z.type === 'boss')) this.quests.onEvent('kill', { weapon: level.player.cur });
      if (!level.infected && !level.knockout && !level.defense && !level.pvp && !level.bank && !level.portal && !level.maze && !level.humans && !level.soulCollector && !level.radiation && !level.worldBoss) this.chapter.onEvent('kill');
      // v302: «Дожени золотого» не зараховуємо за золотого, добитого переможним sweep
      // після смерті боса (той самий гейт, що v301 дав скрині в zombies.js) — інакше
      // будь-яка перемога на карті із золотим дарує квест-тік «на халяву».
      if (z.golden && !level.bossDefeated) this.quests.onEvent('golden');
      if (z.type === 'boss' && !level.storm && !level.radiation && !level.worldBoss) {
        this.quests.onEvent('boss');
        if (!level.infected && !level.knockout && !level.defense && !level.pvp && !level.bank && !level.portal && !level.maze && !level.humans && !level.soulCollector && !level.radiation && !level.worldBoss) this.chapter.onEvent('boss');
        this.save.stats.bosses++;
      }
    });
    // ⭐ R3 «Зірки разом» (v298): КОМАНДНИЙ прогрес цілі «Убий N елітних» рахує ХОСТ
    // НЕЗАЛЕЖНО від кіл-кредиту — еліт, убитий будь-ким (у т.ч. гостем), помирає у хостовій
    // симуляції. Кредитований гачок вище лишається СОЛО-only, тож подвійного тіку нема.
    level.bus.on('zombieKilled', (z) => {
      if (!level.net || !level.net.authority) return; // соло/гість тут не рахують
      if (z.elite) this._bumpSecondary(level, 'elite');
    });
    level.bus.on('zombieDamaged', (n, z) => {
      if (level.playground) return;
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      this.save.stats.damageDealt += Math.round(n);
      this.quests.onEvent('damage', { n: Math.round(n), weapon: level.player.cur });
      if (n >= 8 && this.save.activeSkin === 'radiation' && (this.save.upgrades.radiationupgrade || 0) > 0 && z && z.state !== 'dead' && level.effects.radiationDrops) {
        level.effects.radiationDrops(new THREE.Vector3(z.x, z.y + (z.rig?.height || 1.6) * 0.45, z.z));
      }
    });
    level.bus.on('missionDone', () => {
      if (level.playground) return;
      this.progress.addXp(XP_VALUES.mission);
      if (!level.infected && !level.knockout && !level.defense && !level.pvp && !level.bank && !level.portal && !level.maze && !level.humans && !level.soulCollector && !level.radiation && !level.worldBoss) this.chapter.onEvent('mission');
      // 🎲 кампанія: місію здано → драфт «Прокачки» (лише соло; Шторм відкриває свій після хвилі).
      // Гард на смерть: draft.isOpen морозить сим — відкритий над мертвим гравцем завісив би респавн.
      // У ?test вимкнено (сценарні тести здають місії пачками; вмикається &draft — test/draft-campaign.mjs),
      // такий самий патерн, як ?test-вимкнення хмари з опцією &cloud.
      if (!level.net && level.runBuild && !level.storm && !level.operation && !this.victoryShown && this.draft
        && level.player.health > 0 && (!this.testMode || this.params.has('draft'))) this.draft.open();
      // 🌟 «момент могутності»: супер-пікап на 2-й зданій місії (або раніше на елітній хвилі)
      level.superMissions = (level.superMissions || 0) + 1;
      if (level.superMissions >= 2) this._trySuperPickup(level);
    });
    // 🌟 елітна хвиля стартує раніше за 2-гу місію → супер-пікап тут (що настане першим)
    level.bus.on('eliteWaveWarning', () => this._trySuperPickup(level));
    // 🌟 схопив супер-пікап → активація сили зі слоу-мо, банером і стінгером
    level.bus.on('superPickupGrabbed', (type) => this._activateSuperPower(level, type));
    level.bus.on('superPowerEnd', () => {
      // superPower має ЛИШЕ той, хто взяв силу (соло-гравець або кооп-грабер) — тож у коопі
      // ця подія б'є тільки в нього. Кінець сили відчуває саме він, як у соло.
      this.audio.superEnd();
      this.hud.toast(t('Суперсила скінчилась'));
    });
    level.bus.on('gadgetUsed', (id) => {
      if (!level.playground) {
        this.save.stats.gadgetUses++;
        if (id === 'clone') this.save.stats.cloneUses++;
        this.quests.onEvent('gadget');
        if (!level.infected && !level.knockout && !level.defense && !level.pvp && !level.bank && !level.portal && !level.maze && !level.humans && !level.soulCollector && !level.radiation && !level.worldBoss) this.chapter.onEvent('gadget');
        return;
      }
      const ch = level.gadgetChallenge;
      if (!ch || ch.gadget !== id || ch.done) return;
      ch.progress = Math.min(ch.target, ch.progress + 1);
      ch.done = ch.progress >= ch.target;
    });
    level.bus.on('hitmarker', (crit) => { if (!level.playground && crit) { this.quests.onEvent('headshot'); this.save.stats.headshots++; this._bumpSecondary(level, 'headshot'); } }); // ⭐2 «Зроби N хедшотів»
    level.bus.on('shieldBroken', () => { if (!level.playground) this.quests.onEvent('shield'); });
    level.bus.on('megaboxOpened', () => {
      if (level.playground) return;
      this.progress.addXp(XP_VALUES.megabox);
      this.quests.onEvent('megabox');
      this.save.stats.megaboxes++;
      this._bumpSecondary(level, 'megabox'); // ⭐2 «Відкрий мегабокс»
    });
    level.bus.on('dance', () => { if (!level.playground) this.quests.onEvent('dance'); });
    // комбо за серії вбивств
    level.bus.on('zombieKilled', (z) => {
      if (level.playground || level.knockout || level.defense || level.pvp || level.bank || level.portal || level.maze || level.humans || level.soulCollector || level.radiation || level.worldBoss) return;
      if (level.net && level.net.authority && (z.lastHitBy || 1) !== 1) return;
      if (level.bossDefeated) return; // «здача» після перемоги не рахується
      const c = level.combo;
      const momentum = advanceMomentum(c);
      if (c.best > this.save.stats.bestCombo) this.save.stats.bestCombo = c.best;
      if (c.n >= 3) this.hud.comboPop(c.n);
      if (momentum.tierUp) {
        const titles = [null, '🔥 РОЗІГРІВ!', '⚔️ НАТИСК!', '☄️ НЕСТРИМНИЙ!'];
        const descriptions = [null,
          '+10% швидкості · +15% темпу вогню й перезарядки',
          '+25% шкоди · +15% швидкості · +25% темпу',
          '+50% шкоди · +25% швидкості · +40% темпу'];
        this.hud.banner(t(titles[momentum.tier]), t(descriptions[momentum.tier]), 2.7, { prio: 1 });
        this.hud.powerFlash(momentum.tier === 3 ? 'rgba(255,74,52,0.58)' : 'rgba(255,210,63,0.48)');
        this.audio.levelUp();
      }
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

    // 🎭 кооп-ролі v1: СНАПШОТ своєї ролі на СТАРТІ рівня (зміна ролі посеред бою не діє —
    // анти-гриф). Скромні САМО-бафи; radiation (контракт 50 HP) і pvp — виключення.
    // Дефолт для соло/несумісних режимів: без ролі, revive-фактор 1/3 (3с).
    this._coopReviveRate = 1 / 3;
    if (coop && !level.expedition && !isRadiation && !isPvp) {
      const myRole = ['guard', 'medic', 'scout'].includes(this.save.coopRole) ? this.save.coopRole : null;
      level.coopRole = myRole;
      if (myRole === 'guard') {
        level.player.maxHealth += 25;
        level.player.health = level.player.maxHealth;
      } else if (myRole === 'scout') {
        level.player.speedMult *= 1.08;
        level.player.pickupMult = 1.25;
      } else if (myRole === 'medic') {
        this._coopReviveRate = 1 / 1.8;
      }
    } else if (coop && level.specialist && level.specialist.active) {
      level.coopRole = level.specialist.id;
      this._coopReviveRate = 1 / specialistModifiers(level.specialist.id, level.specialist.rank).reviveSecs;
    }

    // 🤝 кооп: мережевий шар рівня
    if (coop) {
      level.net = coop.session.makeNet(level, coop.spec);
      level.netEv = (...a) => level.net.ev(...a);
      if (coop.role === 'host') {
        // предмети підбирають і снаряди б'ють УСІХ гравців
        level.effects.getPickupTargets = () => {
          const out = [];
          const roster = coop.session.roster;
          for (const pl of level.players || []) {
            if (pl.health <= 0) continue;
            // 🎭 scout: ширший радіус підбору. Хост читає роль кожного гравця з ростера
            // (снапшот на старті рівня — зміна ролі посеред бою не діє: див. _buildLevel).
            const remoteInfo = roster.get(pl.pid) || {};
            const remoteScout = pl.pid !== 1 && remoteInfo.role === 'scout';
            out.push({
              pos: pl.pos,
              magnet: pl.pid === 1 ? level.player.buffs.magnet > 0 : !!pl.magnet,
              // 🌟 «Магніт-буря» в коопі: монети тягне ∞-радіусом ЛИШЕ гравцю з активною
              // силою «магніт». pid 1 (хост) — свій player.superPower; гості — мапа superActive.
              superMagnet: pl.pid === 1
                ? !!(level.player.superPower && level.player.superPower.type === 'magnet')
                : ((level.superActive && level.superActive.get(pl.pid) || {}).power === 'magnet'),
              pid: pl.pid,
              // pid 1 — снапшот у player.pickupMult (заморожено на старті); гості — роль з ростера
              pickMult: pl.pid === 1 ? (level.player.pickupMult || 1)
                : (remoteScout ? (remoteInfo.rank >= 2 ? 1.35 : 1.25) : 1),
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

    if (isArena || isKnockout || isDefense || isPvp || isBank || isPortal || isMaze || isHumans || isSoulCollector || isRadiation || isWorldBoss) {
      const a = level.world.layout.arena;
      const z = isWorldBoss ? a.z + 16 : isRadiation ? a.z + 12 : isKnockout ? a.z : isPvp ? a.z + 4 : isPortal ? a.z + 18 : isMaze ? a.z + 30 : isHumans ? a.z + 130 : isSoulCollector ? a.z + 18 : isDefense ? a.z + 8 : a.z + 12;
      const gy = level.world.groundH(a.x, z);
      level.player.pos.set(a.x, gy, z);
      if (level.defense && level.defense.zone) level.defense._placePlayerInZone();
      if (level.bank) level.bank.placePlayer();
      if (level.portal) level.portal.placePlayer();
      if (level.maze) level.maze.placePlayer();
      if (level.humans) level.humans.placePlayer();
      if (level.soulCollector) level.soulCollector.placePlayer();
    }

    this.level = level;
    if (savedFront && (level.operation || modeId === 'campaign')) {
      const state = level.frontCountryState && level.frontCountryState.state;
      if (state === 'attacked' || state === 'destroyed') this._addFrontDamage(level, level.frontCountryState.damage);
      if (state === 'attacked') {
        const village = level.world.layout.village || level.world.layout.SPAWN;
        level.frontPressure = level.zombies.list.filter((zombie) =>
          !zombie.dead && !zombie.gone && !zombie.horde && !zombie.aggroed && zombie.state !== 'chase').slice(0, 3);
        level.frontPressure.forEach((zombie, index) => {
          const angle = index * Math.PI * 2 / level.frontPressure.length;
          zombie.x = village.x + Math.cos(angle) * 12;
          zombie.z = village.z + Math.sin(angle) * 12;
          zombie.rig.group.position.set(zombie.x, level.world.groundH(zombie.x, zombie.z), zombie.z);
        });
      }
      if (state === 'rebuilding' || state === 'saved') this._addFrontOutpost(level, level.frontCountryState.restored, state);
      if (state === 'destroyed') this._addFrontEvacuees(level);
    }
    if (level.operation) this._initFrontRuntime(level, savedFront);
    if (level.expedition && level.expedition.current && level.expedition.current.type === 'elite' && (!level.net || level.net.authority)) {
      level.zombies.spawnEliteWave(4);
    }
    if (this.chapter && !level.infected && !level.playground && !level.knockout && !level.defense && !level.pvp && !level.bank && !level.portal && !level.maze && !level.humans && !level.soulCollector && !level.turretwar && !level.radiation && !level.worldBoss) this.chapter.onEvent('enterLevel');
    this.state = 'level';
    this.hud.update(0);
    this._applyKidMode({ silent: true }); // 🐣 клас kid-mode активний і в бою (тост — лише на ручне перемикання)
    this.victoryShown = false;
    this._nightAnnounced = false;
    const toastMod = level.weeklyMod || this._modifierById(level.weeklyMutator && level.weeklyMutator.id);
    if (toastMod) this.hud.toast(t('🗓️ Подія тижня: {i} {n}!', { i: toastMod.icon, n: toastMod.name() }));
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
    const bannerTitle = level.expedition ? t('🧭 ЕКСПЕДИЦІЯ · ЕТАП {n}/{all}', { n: level.expedition.step + 1, all: EXPEDITION_STEPS }) : level.infected ? t('🧟 ГЛАВА 2: ЗАРАЖЕНА КРАЇНА') : level.worldBoss ? level.worldBoss.cfg.name() : level.radiation ? t('☢️ РАДІАЦІЯ') : level.soulCollector ? t('👻 ЗБИРАЧ ДУШ') : level.humans ? (level.humans.variant === 'overloaded' ? t('💥 Перегружена зомбі проти людей') : t('⚔️ ЗОМБІ ПРОТИ ЛЮДЕЙ')) : level.turretwar ? t('🗼 ОБОРОНА ТУРЕЛІ') : level.maze ? t('🧩 ЛАБІРИНТ') : level.portal ? t('🌀 ПОРТАЛ') : level.bank ? t('🏦 БАНК') : level.pvp ? (level.pvp.variant === 'overloaded' ? t('💣 Перегружене ПВП') : t('⚔️ ПВП')) : level.defense ? (level.defense.variant === 'zone' ? t('⭕ Оборона в зоні') : level.defense.variant === 'overloaded' ? t('🏰 Перегружена оборона') : t('🛡️ ОБОРОНА')) : level.knockout ? (level.knockout.variant === 'friendly' ? t('🤝 Дружній нокаут') : level.knockout.variant === 'overloaded' ? t('💥 Перегружений нокаут') : t('🥊 НОКАУТ')) : level.playground ? t('🧪 Полігон гаджетів') : level.storm ? t('⛈️ ШТОРМ') : `${country.flag} ${country.name.toUpperCase()}`;
    const bannerText = level.infected ? t('Темрява, сильніші вороги і додатковий робот. Очисти країну від зараження!') : level.worldBoss ? level.worldBoss.cfg.mechanic() : level.radiation ? t('50 HP, дробовик з 10 патронами і один зомбі на 500 HP. Перемога: +50 монет радіації.') : level.soulCollector ? t('20 привидів, 50 HP, посох і меч. Перемога дає 3 душі.') : level.humans ? (level.humans.variant === 'overloaded' ? t('45 клонів, 5 стрільців, 125 зомбі, 5 боксерів і робот 1795 HP.') : t('30 клонів проти 65 зомбі і робота. Поразка забирає 100 монет.')) : level.turretwar ? t('Знеси зомбі-турель молотом і роботом раніше, ніж впаде твоя! Хвилі зомбі кожні 10с.') : level.maze ? t('Знайди 3 ключі, відкрий вихід і виживи.') : level.portal ? t('Закрий 3 портали, поки вони випускають хвилі зомбі.') : level.bank ? t('Захисти свій банк і знищ банк зомбі. Кожні 5 секунд біля банку зомбі зʼявляються 5 зомбі.') : level.pvp ? (level.pvp.variant === 'overloaded' ? t('Гармата і меч проти зомбі на 3000 HP. У тебе 2500 HP і щит.') : t('Посох проти зомбі на 250 HP. У тебе 50 HP.')) : level.defense ? (level.defense.variant === 'zone' ? t('Протримайся 125 секунд у синьому колі.') : level.defense.variant === 'overloaded' ? t('3 хвилі. Захисти вежу 500 HP: у тебе 250 HP, у зомбі 234 HP.') : t('Захисти вежу: 250 HP, пістолет і автомат')) : level.knockout ? (level.knockout.variant === 'friendly' ? t('20 зомбі для гри з другом, тільки пістолет.') : level.knockout.variant === 'overloaded' ? t('20 зомбі, 150 HP, 1 пістолет, без магазину й гаджетів') : t('10 зомбі, 1 пістолет, без магазину й гаджетів')) : level.playground ? t('Спробуй будь-який гаджет без нагород і ризику') : level.storm ? t('Виживи у колі, що звужується. Рекорд — у Лігу!') : bannerSub;
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

  _seedInfectedThreats(level) {
    const a = level.world.layout.arena || { x: 0, z: -10 };
    const spawn = (type, dx, dz) => level.zombies.spawn(type, a.x + dx, a.z + dz, {
      anchor: { x: a.x, z: a.z, r: 35 }, groupId: 222,
    });
    spawn('robot', 0, -18);
    spawn('boxer', -8, -12);
    spawn('boxer', 8, -12);
  }

  // 🤝 гість: перемога (подія від хоста)
  netVictory() {
    if (!this.level || this.victoryShown) return;
    if (this.level.operation && this.level.net && !this.level.net.authority) {
      // `vict` already passed GuestNet's trusted-host boundary. A guest's local
      // Director clock (and non-serialized commander flag) must not veto it.
      this.level.frontRemoteComplete = true;
    }
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

  // 🎁 v305: нагороди/скрині/супер-сили винесено у src/rewards.js — тіла з this→game.
  // Делегати лишають назви методів (тому call-sites у net/client.js, coop, DOM не міняються).
  _grantEliteChestCoop() { return grantEliteChestCoop(this); }

  _grantGoldenChestCoop() { return grantGoldenChestCoop(this); }

  _rollChestEgg(chance) { return rollChestEgg(this, chance); }

  _onFriendRescued(cid) { return onFriendRescued(this, cid); }

  _bumpCamp(metric, amount = 1) { return bumpCamp(this, metric, amount); }

  _refreshCampChip() { return refreshCampChip(this); }

  _openEggFromAlbum() { return openEggFromAlbum(this); }

  _feedPetFromAlbum(id) { return feedPetFromAlbum(this, id); }

  _rollCoopSecondary(countryId, seed) { return rollCoopSecondary(this, countryId, seed); }

  _bumpSecondary(level, ev, n = 1) { return bumpSecondary(this, level, ev, n); }

  _secondaryDoneToast(level) { return secondaryDoneToast(this, level); }

  _trySuperPickup(level) { return level && level.expedition ? null : trySuperPickup(this, level); }

  _spawnSuperMirror(nid, x, z) { return spawnSuperMirror(this, nid, x, z); }

  _updateCoopSuper(level, dt) { return updateCoopSuper(this, level, dt); }

  _grantSuperCoop(level, pid, sp) { return grantSuperCoop(this, level, pid, sp); }

  _superBannerFor(pid, power) { return superBannerFor(this, pid, power); }

  _activateSuperPower(level, type) { return activateSuperPower(this, level, type); }

  openMegaboxReward(x, z) { return openMegaboxReward(this, x, z); }

  chestCeremony(opts) { return chestCeremony(this, opts); }

  _closeChest(skipRelock = false) { return closeChest(this, skipRelock); }

  _spawnChestConfetti(root) { return spawnChestConfetti(this, root); }

  unlockWeapon(id) { return unlockWeapon(this, id); }

  endLevel() {
    const leavingExpedition = !!(this.level && this.level.expedition);
    const leavingFront = !!(this.level && this.level.operation);
    const leavingFrontCoop = !!(this.level && this.level.net);
    const frontNextAction = this._frontNextAction;
    this._frontNextAction = null;
    if (this.hud) this.hud.clearBanners(); // 🪧 черга банерів не переживає зміну стану гри
    if (this.draft) this.draft.close(); // кооп: оверлей драфту міг лишитись відкритим
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
          if (leavingFront && sess.role === 'host') {
            const active = this.save.front && this.save.front.active;
            if ((frontNextAction === 'continue' || frontNextAction === 'retry') && active) {
              this.startFrontOperation(active.operationId, active.specialist, 'together');
            } else {
              this.openFront();
            }
          } else if (leavingFront) {
            document.getElementById('net-wait-sub').textContent = t('Чекаємо на хоста');
            this._showOverlay('overlay-net-wait');
          } else if (leavingExpedition) {
            this.renderExpedition();
            this._showOverlay('overlay-expedition');
          } else {
            this._showOverlay('overlay-lobby');
            this.coop._renderLobby();
          }
        }
      }, 50);
    }
    if (this.level) {
      document.getElementById('map-editor-tools')?.classList.remove('show');
      document.body.classList.remove('map-editor-mode');
      // standalone-ресурси Effects (оригінал tracerMat, гео монет/снарядів/гранат) обхід сцени
      // нижче не дістає — звільняємо їх явно, поки рівень ще цілий.
      if (this.level.worldBoss && this.level.worldBoss.dispose) this.level.worldBoss.dispose();
      if (this.level.moonHazards) this.level.moonHazards.dispose();
      if (this.level.rescueCage && this.level.rescueCage.dispose) this.level.rescueCage.dispose();
      // 🌪️ буря чіпає сесійно-кешований coinMat — форс-відновлюємо, поки рівень цілий (до обходу сцени)
      if (this.level.sandstorm && this.level.sandstorm.dispose) this.level.sandstorm.dispose();
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
        // SkinnedMesh: Skeleton — завжди per-клон (навіть коли geometry/material спільні,
        // див. characters.js cloneRig), тож boneTexture DataTexture тут ще не звільнено вище.
        if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose();
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
    if (this.touch && this.touch.resetPointers) this.touch.resetPointers();
    else if (this.input && this.input.resetTransient) this.input.resetTransient();
    // прибираємо всі оверлеї рівня
    for (const id of ['overlay-death', 'overlay-pause', 'overlay-victory', 'overlay-start', 'overlay-storm-end', 'overlay-arena-end', 'overlay-front-result']) {
      this._hideOverlay(id);
    }
    if (this.shop.isOpen) this.shop.close();
    this.paused = false;
    this._showGlobeUI(true);
    this.audio.setMode(this.audio.ctx ? 'globe' : null);
    this.hud.showBoss(false);
    if (leavingFront && !leavingFrontCoop && (frontNextAction === 'continue' || frontNextAction === 'retry')) {
      const active = this.save.front && this.save.front.active;
      if (active) this.startFrontOperation(active.operationId);
    } else if (leavingFront && !leavingFrontCoop && (frontNextAction === 'end' || frontNextAction === 'globe')) {
      this.openFront();
    }
  }

  _onPlayerDied() {
    // ⭐3 (v298 «Зірки разом»): stats.deaths — це ОСОБИСТІ падіння цього клієнта за забіг.
    // У коопі кожен рахує СВОЇ (хост — свій player, гість — свій), і ⭐3 отримує лише той,
    // у кого 0 падінь. Тебе піднімає друг — це і є «милосердя» коопу (mercy нижче — соло-only).
    this.level.stats.deaths++;
    // 🕊️ R3 невидиме милосердя: смерті ПОСПІЛЬ на одній країні кампанії (solo). БЕЗ жодного UI.
    // Наступний забіг цієї країни при n≥2 дістане тихі послаблення (див. створення рівня).
    // secondaryObjective виставляється для соло- І кооп-забігу кампанії, тож гейт milości —
    // саме `!this.level.net`: у коопі mercyDeaths НЕ тікаємо (милосердя = друг тебе підіймає).
    if (this.level.secondaryObjective && !this.level.net) {
      const cid = this.level.countryId;
      const md = this.save.mercyDeaths;
      this.save.mercyDeaths = (md && md.cid === cid) ? { cid, n: md.n + 1 } : { cid, n: 1 };
      this.saveGame();
    }
    // кнопка реваншу — лише для фінальної соло-гілки кампанії, решта режимів мають свій end-флоу
    const revengeBtn = document.getElementById('btn-death-revenge');
    if (revengeBtn) revengeBtn.style.display = 'none';
    if (this.level.net && this.level.operation) {
      this._showCoopDowned();
      return;
    }
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
    if (this.level.turretwar) {
      this._endTurretWarRun(false, 'player');
      return;
    }
    if (this.level.pvp) {
      this._endPvpRun(false);
      return;
    }
    if (this.level.bank) {
      this._endBankRun(false);
      return;
    }
    if (this.level.portal) {
      this._endPortalRun(false);
      return;
    }
    if (this.level.maze) {
      this._endMazeRun(false);
      return;
    }
    if (this.level.humans) {
      this._endHumansRun(false);
      return;
    }
    if (this.level.soulCollector) {
      this._endSoulCollectorRun(false);
      return;
    }
    if (this.level.radiation) {
      this._endRadiationRun(false);
      return;
    }
    if (this.level.worldBoss) {
      this._endWorldBossRun(false);
      return;
    }
    if (this.level.operation) {
      this._showFrontModeResult(this.level, false, '🛰️', 'Поточний етап', t('можна повторити'));
      return;
    }
    if (this.level.expedition && !this.level.net) {
      this._finishExpeditionNode(false);
      this.victoryShown = true;
      this.audio.defeat();
      this.input.exitLock();
      document.querySelector('#overlay-arena-end h1').textContent = t('🧭 ЕКСПЕДИЦІЮ ЗАВЕРШЕНО');
      document.getElementById('arena-stats').innerHTML = `<div class="stat"><span class="stat-icon">🏁</span><span class="stat-name">${t('Пройдено етапів')}</span><span class="stat-val">${this.save.expedition.wins} / ${EXPEDITION_STEPS}</span></div>`;
      this._showOverlay('overlay-arena-end');
      return;
    }
    const coop = !!this.level.net;
    if (coop) {
      this._showCoopDowned();
      return;
    }
    // соло: швидкий респавн; кооп вище лишається в чинному revive-потоці
    this.deathT = 3.5;
    const card = document.querySelector('#overlay-death p');
    if (card) {
      card.textContent = t('Не хвилюйся — прогрес місій зберігся.');
    }
    // 💸 R3 «Поразка теж платить» (solo): показуємо ЗДОБУТЕ за забіг (монети й XP уже збережені)
    const earnedEl = document.getElementById('death-earned');
    if (earnedEl) {
      const earnedCoins = Math.max(0, this.level.stats.coinsEarned | 0);
      const earnedXp = Math.max(0, (this.save.xp | 0) - (this.level._startXp | 0));
      if (earnedCoins > 0 || earnedXp > 0) {
        earnedEl.textContent = t('Ти все одно здобув: 💰{c} · ⚡{x} XP', { c: earnedCoins, x: earnedXp });
        earnedEl.style.display = '';
      } else {
        earnedEl.style.display = 'none';
      }
    }
    if (revengeBtn) revengeBtn.style.display = '';
    this.audio.defeat();
    this._showOverlay('overlay-death');
  }

  _showCoopDowned() {
    this.deathT = 20;
    const card = document.querySelector('#overlay-death p');
    if (card) card.textContent = t('💚 Друг може підбігти і підняти тебе ({k})! Або відродишся біля бази.', { k: interactKey() });
    const earned = document.getElementById('death-earned');
    if (earned) earned.style.display = 'none';
    const revenge = document.getElementById('btn-death-revenge');
    if (revenge) revenge.style.display = 'none';
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
    this.level.bus.emit('playerRevived', { kind: 'coop' });
    this.hud.banner(t('💚 ТЕБЕ ПІДНЯЛИ!'), byNick ? t('{n} прийшов на допомогу — до бою!', { n: byNick }) : t('Дякуй другу і до бою!'));
  }

  _onPlayerRevivedFx() {
    if (!this.level) return;
    const p = this.level.player;
    if (!p || p.health <= 0 || !this.level.effects) return;
    if (this.save.activeSkin === 'angel' && this.level.effects.angelRevive) this.level.effects.angelRevive(p.pos.clone());
    else if (this.save.activeSkin === 'demon' && this.level.effects.demonRevive) this.level.effects.demonRevive(p.pos.clone());
    else if (this.save.activeSkin === 'radiation' && this.level.effects.radiationRevive) this.level.effects.radiationRevive(p.pos.clone());
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
      // 🎭 медик піднімає швидше (1.8с проти 3с) — снапшот-фактор із _buildLevel
      this._revProg = Math.min(1, (this._revProg || 0) + dt * (this._coopReviveRate || 1 / 3));
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

  // 🎯 режим «випробування дня» — детерміновано від локальної дати
  dailyChallengeId() {
    const d = new Date();
    const key = d.getFullYear() * 372 + d.getMonth() * 31 + (d.getDate() - 1);
    return DAILY_CHALLENGE_POOL[key % DAILY_CHALLENGE_POOL.length];
  }

  // 🎁 модалка подарунка дня: грід 7 клітинок поточного тижня, підсвічений сьогоднішній день
  _openGiftModal() {
    const info = this.gift.dayInfo();
    const rewardText = (r) => {
      const parts = [];
      if (r.coins) parts.push(`🪙 ${r.coins}`);
      if (r.crystals) parts.push(`💎 ${r.crystals}`);
      return parts.join(' · ');
    };
    const week = GIFT_TABLE[info.week - 1];
    let cells = '';
    for (let d = 1; d <= 7; d++) {
      const r = week[d - 1];
      const claimed = d < info.day; // дні цього тижня, вже пройдені стриком
      const today = d === info.day && this.gift.pending();
      const cls = `gift-cell${today ? ' today' : ''}${claimed ? ' claimed' : ''}${d === 7 ? ' box' : ''}`;
      cells += `<div class="${cls}">
        <div class="gift-day">${d === 7 ? '🎁' : t('День {n}', { n: d })}</div>
        <div class="gift-reward">${rewardText(r)}</div>
        ${claimed ? '<div class="gift-check">✅</div>' : ''}
      </div>`;
    }
    document.getElementById('gift-week').textContent = t('Тиждень {n}', { n: info.week });
    document.getElementById('gift-grid').innerHTML = cells;
    const claimBtn = document.getElementById('btn-gift-claim');
    if (claimBtn) claimBtn.style.display = this.gift.pending() ? '' : 'none';
    this._showOverlay('overlay-gift');
  }

  // 🎁 забрати подарунок дня з модалки: грант, звук, оновити грід і сховати чіп
  _claimGift() {
    const r = this.gift.claim();
    if (!r) return;
    // 🎁 v287: церемонія скрині замість миттєвого банера (нагорода та сама)
    const items = [];
    if (r.coins) items.push({ icon: '🪙', n: r.coins });
    if (r.crystals) items.push({ icon: '💎', n: r.crystals });
    this.chestCeremony({ title: t('🎁 ПОДАРУНОК ДНЯ!'), items });
    this._openGiftModal();       // перемалювати грід (день зсунувся, кнопка сховається)
    const giftChip = document.getElementById('gift-chip');
    if (giftChip) giftChip.classList.remove('show');
  }

  // 🏕️ панель тижневого квесту табору: опис, прогрес X/N, кнопка «Забрати 🥚» коли виконано.
  // Викликається з чипа на глобусі АБО з дошки квесту в таборі бази (hqbase).
  _openCampQuest() {
    const st = weeklyCampState(this.save, this._weekIndex());
    const def = st.def;
    const titleEl = document.getElementById('campquest-title');
    const descEl = document.getElementById('campquest-desc');
    const progEl = document.getElementById('campquest-prog');
    const fillEl = document.getElementById('campquest-fill');
    const claimBtn = document.getElementById('btn-campquest-claim');
    const doneEl = document.getElementById('campquest-claimed');
    if (titleEl) titleEl.textContent = def ? `${def.emoji} ${def.title()}` : t('Квест табору');
    if (descEl) descEl.textContent = def ? def.desc() : '';
    if (progEl) progEl.textContent = `${st.p}/${st.goal}`;
    if (fillEl) fillEl.style.width = `${st.goal ? Math.round((st.p / st.goal) * 100) : 0}%`;
    if (claimBtn) claimBtn.style.display = st.claimable ? '' : 'none';
    if (doneEl) doneEl.style.display = (st.done && st.claimed) ? '' : 'none';
    this._showOverlay('overlay-campquest');
  }

  // 🏕️ забрати нагороду квесту табору: +1🥚 +🍖×2 через церемонію скрині (мета-екран — можна).
  _claimCampQuest() {
    const r = claimWeeklyCamp(this.save, this._weekIndex());
    if (!r) { this.audio.denied(); return; }
    this.saveGame();
    this._hideOverlay('overlay-campquest');
    this.chestCeremony({ title: t('🏕️ НАГОРОДА ТАБОРУ!'), items: [{ icon: '🥚', n: r.eggs }, { icon: '🍖', n: r.food }] });
    this._refreshCampChip();
  }

  // 🗓️ оновити текст і бар цілі тижня на глобусі
  _refreshWeeklyGoalUI() {
    const el = document.getElementById('weekly-goal');
    if (!el) return;
    const wg = this._sanitizeWeeklyGoal(this.save.weeklyGoal || { week: -1, n: 0, claimed: false });
    // reset тижня ледачий (перший кіл у _bumpWeeklyGoal) — але ГЛОБУС не сміє
    // показувати торішнє «✅ 300/300» у понеділок: новий тиждень = чистий 0/300
    const stale = this._weekIndex() > wg.week;
    const claimed = !stale && wg.claimed;
    const n = stale ? 0 : Math.min(300, wg.n | 0);
    const label = el.querySelector('.wg-label');
    const fill = el.querySelector('.wg-fill');
    if (claimed) {
      if (label) label.textContent = t('✅ Ціль тижня: 300/300 · 💎 +25');
      if (fill) fill.style.width = '100%';
    } else {
      if (label) label.textContent = t('🗓️ Ціль тижня: {n}/300 🧟', { n });
      if (fill) fill.style.width = `${Math.round((n / 300) * 100)}%`;
    }
  }

  // 🗓️ ціль тижня «300 зомбі → 💎 25». Forward-only reset нового тижня; переведені
  // назад години морозять лічильник. Викликається з zombieKilled одразу після stats.killed++.
  _bumpWeeklyGoal() {
    const w = this._weekIndex();
    let wg = this.save.weeklyGoal;
    if (!wg || typeof wg !== 'object') wg = this.save.weeklyGoal = { week: -1, n: 0, claimed: false };
    wg = this._sanitizeWeeklyGoal(wg);
    if (wg.week > w + 1) { wg.week = w; wg.n = 0; wg.claimed = false; } // битий годинник (>+1 тижня вперед) → реініт, цей кіл піде як n=1
    if (w > wg.week) { wg.week = w; wg.n = 0; wg.claimed = false; }   // новий тиждень — обнуляємо лічильник
    if (wg.week !== w) return;                                        // переведені назад години (або +1 тижня) → freeze
    wg.n++;
    if (!wg.claimed && wg.n >= 300) {
      wg.claimed = true;
      this.save.crystals = (this.save.crystals || 0) + 25;
      this.hud.banner(t('🏆 ЦІЛЬ ТИЖНЯ ВИКОНАНО!'), t('300 зомбі · 💎 +25'), 4.5);
      this.saveGame();
    }
  }

  // 🦁 Бестіарій-колекція: пороги за кількістю ЗІБРАНИХ ВИДІВ (унікальні ключі save.bestiary
  // з count>0, без 'golden' — golden не є окремим видом). Викликається одразу після
  // інкремента save.bestiary в zombieKilled; лічба дешева (Object.keys), а видача — одноразова
  // через прапорці save.bestiaryGoals.
  _checkBestiaryGoals() {
    const bg = this.save.bestiaryGoals || (this.save.bestiaryGoals = { b10: false, b20: false, all: false });
    if (bg.b10 && bg.b20 && bg.all) return; // усе видано — не рахувати види на кожному кілі
    let granted = false;
    const n = Object.keys(this.save.bestiary || {}).filter((id) => BESTIARY_TYPE_IDS.includes(id) && this.save.bestiary[id] > 0).length;
    if (!bg.b10 && n >= 10) {
      bg.b10 = true;
      granted = true;
      this.save.coins += 1000;
      this.audio.levelUp();
      this.hud.banner(t('📖 БЕСТІАРІЙ: 10 ВИДІВ!'), t('+1000 монет 🪙'), 4.5);
    }
    if (!bg.b20 && n >= 20) {
      bg.b20 = true;
      granted = true;
      this.save.crystals = (this.save.crystals || 0) + 25;
      this.audio.levelUp();
      this.hud.banner(t('📖 БЕСТІАРІЙ: 20 ВИДІВ!'), t('💎 +25'), 4.5);
    }
    if (!bg.all && n >= BESTIARY_TYPE_IDS.length) {
      bg.all = true;
      granted = true;
      this.save.crystals = (this.save.crystals || 0) + 50;
      this.audio.levelUp();
      this.hud.banner(t('🦁 БЕСТІАРІЙ ЗІБРАНО ПОВНІСТЮ!'), t('💎 +50 · титул «Зоолог» 🎖️'), 5);
      // титул zoologist синкнеться сам через syncTitles (unlocked-предикат від save.bestiary)
      syncTitles(this.save);
    }
    if (granted) this.saveGame(); // сейв лише при видачі — НЕ на кожному кілі (фризи на мобільному)
  }

  // 🗓️ приведення полів цілі тижня до безпечних типів (week/n — цілі, claimed — bool).
  // Мутує переданий об'єкт і повертає його. Спільне місце для _loadSave і _bumpWeeklyGoal.
  _sanitizeWeeklyGoal(wg) {
    wg.week = Number.isFinite(wg.week) ? Math.floor(wg.week) : -1;
    wg.n = Number.isFinite(wg.n) ? Math.floor(wg.n) : 0;
    wg.claimed = !!wg.claimed;
    return wg;
  }

  // 🗓️ номер тижня від тієї ж лінійної дати, що й daily
  _weekIndex() {
    const d = new Date();
    return Math.floor((d.getFullYear() * 372 + d.getMonth() * 31 + (d.getDate() - 1)) / 7);
  }

  weeklyChallengeId() {
    return DAILY_CHALLENGE_POOL[this._weekIndex() % DAILY_CHALLENGE_POOL.length];
  }

  weeklyModifierId() {
    return WEEKLY_MODIFIER_POOL[this._weekIndex() % WEEKLY_MODIFIER_POOL.length];
  }

  _modifierById(id) {
    return id && Object.prototype.hasOwnProperty.call(MODIFIERS, id) ? MODIFIERS[id] : null;
  }

  _buildWeeklyMutator(id, { coop = null, isPlayground = false } = {}) {
    if (isPlayground) return null;
    // у тестах мутатор їде від РЕАЛЬНОГО календаря → батарея зелена/червона залежно від тижня;
    // тому в ?test він вимкнений, опт-ін через ?weekmod (той самий патерн, що ?draft для драфту).
    // У КООПІ гейт уже застосував хост (_hostWeeklyMutatorId), а id прийшов зі spec —
    // гість БЕЗ ?weekmod все одно має бачити мутатор (джерело — хост, не URL гостя).
    if (!coop && this.testMode && !this.params.has('weekmod')) return null;
    const mod = this._modifierById(id);
    if (!mod) return null;
    const hpMul = (mod.zMul && mod.zMul.hp) || 1;
    const speedMul = (mod.zMul && mod.zMul.speed) || 1;
    const eliteChance = mod.eliteChance || 0;
    const night = !!mod.night;
    if (hpMul === 1 && speedMul === 1 && eliteChance <= 0 && !night) return null;
    return {
      id,
      hpMul,
      speedMul,
      eliteChance,
      eliteTypes: ['tank', 'shield'],
      night,
    };
  }

  // 🎲🤝 id мутатора тижня, який ХОСТ кладе у кооп-spec (їде обом сторонам).
  // Ті самі гейти, що соло: ?test без ?weekmod → null (детермінізм тестів),
  // а сам id — з реального календаря хоста (джерело істини для команди).
  _hostWeeklyMutatorId() {
    if (this.testMode && !this.params.has('weekmod')) return null;
    return this.weeklyModifierId();
  }

  weeklyBossId() {
    return WORLD_BOSSES[this._weekIndex() % WORLD_BOSSES.length].id;
  }

  // 🗓️🤝 командне випробування тижня — свій пул з КООП-здатних режимів
  // (недільний соло-режим може бути solo-only, як-от bank/maze)
  weeklyCoopModeId() {
    const pool = ['storm', 'friendly-knockout', 'friendly-defense', 'friendly-zone-defense', 'radiation', 'turretwar'];
    return pool[this._weekIndex() % pool.length];
  }

  // одноразова недільна нагорода за командну перемогу; кожен клієнт нараховує
  // собі ЛОКАЛЬНО (патерн нагород кооп-Шторму), ключ тижня w — зі spec хоста
  _grantWeeklyCoop(level, won) {
    if (!won || !level || !level.weekly || level.weekly.w == null) return;
    const wk = 'W' + level.weekly.w + ':coop';
    if (this.save.weekly[wk]) return;
    this.save.weekly[wk] = true;
    this.save.crystals = (this.save.crystals || 0) + 25;
    this.hud.banner(t('🗓️ КОМАНДНЕ ВИПРОБУВАННЯ ТИЖНЯ!'), t('💎 +25 — раз на тиждень'), 4.5);
    this.audio.levelUp();
    this.saveGame();
  }

  // 🤝 нагорода за перемогу В КООПІ (roster>1) — обом сторонам локально, wire не чіпаємо:
  // командний бонус монет ЗАВЖДИ, а щоденний кристал — раз на день (coopBonusDay = dayKey).
  _grantCoopWin() {
    const level = this.level;
    if (!level || !level.net) return;             // тільки кооп-перемоги
    const roster = this.coop && this.coop.session && this.coop.session.roster;
    if (!roster || roster.size <= 1) return;      // грали разом (не сам-один у кімнаті)
    this.save.coopWins = (this.save.coopWins || 0) + 1;
    this.save.coins += 150;                        // командний бонус — завжди
    const day = this.gift.dayKey();                // локальний 'YYYY-MM-DD' — те саме джерело дати
    if (this.save.coopBonusDay !== day) {
      this.save.coopBonusDay = day;
      this.save.crystals = (this.save.crystals || 0) + 1;
      this.hud.banner(t('🤝 КОМАНДНИЙ БОНУС!'), t('🪙 +150 · 💎 +1 (щодня за гру разом)'), 4.5);
    } else {
      this.hud.banner(t('🤝 КОМАНДНИЙ БОНУС!'), t('🪙 +150 за гру разом'), 4.5);
    }
    this.audio.levelUp();
    this.saveGame();
  }

  // 🏁 спільний фінал кімнатних режимів: перемоги, віхи, рекорд часу, множник дня.
  // Викликати ДО нарахування нагород; mult множить монети/XP режиму.
  // Кооп-варіанти (friendly-нокаут) рекорди/віхи не чіпають — це соло-прогрес.
  _soloModeFinish(modeId, won, timeMs = null) {
    const out = { mult: 1, recBadge: '', bestRow: '' };
    if (this.level && (this.level.net || this.level.expedition)) return out;
    const daily = this.dailyChallengeId() === modeId;
    const weekly = this.weeklyChallengeId() === modeId;
    if (won) {
      if (weekly) {
        out.mult = 3;
        const wk = 'W' + this._weekIndex() + ':mode';
        if (!this.save.weekly[wk]) {
          this.save.weekly[wk] = true;
          this.save.crystals = (this.save.crystals || 0) + 25;
          this.hud.banner(t('🗓️ ВИПРОБУВАННЯ ТИЖНЯ!'), t('Нагорода ×3 · 💎 +25 — раз на тиждень'), 4.5);
          this.audio.levelUp();
        } else {
          this.hud.banner(t('🗓️ ВИПРОБУВАННЯ ТИЖНЯ!'), t('Нагороду потроєно ×3'), 4);
        }
      } else if (daily) {
        out.mult = 2;
        this.hud.banner(t('🎯 ВИПРОБУВАННЯ ДНЯ!'), t('Нагороду подвоєно ×2'), 4);
      }
      this.save.modeWins[modeId] = (this.save.modeWins[modeId] || 0) + 1;
      const wins = this.save.modeWins[modeId];
      for (const ms of MODE_MILESTONES) {
        const key = modeId + ':' + ms.wins;
        if (wins < ms.wins || this.save.modeRewards[key]) continue;
        this.save.modeRewards[key] = true;
        this.save.crystals = (this.save.crystals || 0) + ms.crystals;
        this.hud.banner(t('🏅 ВІХА РЕЖИМУ!'), t('{n} перемог — 💎 +{c} кристалів', { n: ms.wins, c: ms.crystals }), 4.5);
        this.audio.levelUp();
      }
      // титули за перемоги відкриває syncTitles за предикатами — тут лише сповіщаємо
      const titlesBefore = (this.save.titles || []).length;
      syncTitles(this.save);
      if ((this.save.titles || []).length > titlesBefore) {
        this.hud.banner(t('🎖️ НОВИЙ ТИТУЛ!'), t('Дивись у Гардеробі 🎒'), 4.5);
        this.audio.levelUp();
      }
      if (timeMs != null) {
        const prev = this.save.modeBest[modeId];
        if (!prev || timeMs < prev) {
          this.save.modeBest[modeId] = timeMs;
          if (prev) out.recBadge = t(' <span class="record-badge">🏆 НОВИЙ РЕКОРД!</span>');
        }
      }
    }
    const best = this.save.modeBest[modeId];
    if (best != null) {
      out.bestRow = `<div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">${t('Рекорд')}</span><span class="stat-val">${Math.floor(best / 60000)}:${String(Math.floor((best % 60000) / 1000)).padStart(2, '0')}</span></div>`;
    }
    return out;
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
    // 🗓️🤝 шторм нескінченний — «перемога» командного тижня = дожити до 5-ї хвилі
    this._grantWeeklyCoop(level, res.wave >= 5);
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
      // дедуп ніків: після реконекту ростер може тримати той самий нік двічі —
      // у таблиці Ліги «Влад + Влад» виглядає як брехня (воркер дедупить так само)
      const team = level.net
        ? [...new Set([...this.coop.session.roster.values()].map((r) => r.nick || '').filter(Boolean))]
        : [];
      submitScore(this, { mode: 'storm', country: level.countryId, score: res.wave, team }).then((r) => {
        if (r && r.me) placeEl.textContent = t('🌍 Твоє місце у світовій Лізі: #{r}', { r: r.me.rank });
      });
      // 🤝 командний рекорд шторму: ЛИШЕ хост (authority) і лише коли реально грали разом (≥2)
      if (level.net && level.net.authority && team.length >= 2) {
        submitScore(this, { mode: 'coopstorm', country: level.countryId, score: res.wave, team });
      }
    }
    // 🏆 «топ-3 сьогодні» в лобі: шлемо свій штормовий результат у денний рейтинг
    if (this.coop && this.coop.lobbyNet) this.coop.lobbyNet.announceDayScore(res.wave);
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
    if (res.completed && level.net) this._grantCoopWin(); // 🤝 бонус «разом» і на арені босів
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

  // 🎲 Драфт «Прокачки» на межі хвилі в аренних режимах (Нокаут/Оборона/Портал).
  // Лише соло (!level.net), живий гравець, режим не завершено. У ?test вимкнено тим самим
  // гейтом, що й кампанія (main.js missionDone): вмикається лише з &draft — інакше
  // оверлей заморозив би цикл гри у тестах режимів (knockout.mjs/defense.mjs).
  _maybeModeDraft(level) {
    if (!level || level.net || !level.runBuild || !this.draft || this.draft.isOpen) return;
    if (this.victoryShown || level.player.health <= 0) return;
    if (this.testMode && !this.params.has('draft')) return;
    this.draft.open();
  }

  _endKnockoutRun(won = true) {
    const level = this.level;
    if (!level || !level.knockout || level.knockout.over) return;
    level.knockout.completed = !!won;
    const res = level.knockout.results();
    level.knockout.over = true;
    this._grantWeeklyCoop(level, !!won);
    // 🤝 v279-бонус «за перемогу разом» — у ВСІХ кооп-перемогах, не лише в кампанії
    if (won && level.net) this._grantCoopWin();
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

    const koModeId = level.knockout.variant === 'overloaded' ? 'overloaded-knockout' : 'knockout';
    const fin = this._soloModeFinish(koModeId, !!won, res.timeMs);
    let roll = Math.random();
    if (this._knockoutForce !== undefined) {
      roll = this._knockoutForce;
      this._knockoutForce = undefined;
    }
    let rewardTitle = t('Без нагороди');
    if (won) {
      this.progress.addXp(80 * fin.mult);
      rewardTitle = t('🪙 +{n} монет', { n: 100 * fin.mult });
      if (roll < KNOCKOUT_STAFF_CHANCE && !this.save.weapons.includes('staff')) {
        level.player.giveWeapon('staff');
        this.save.weapons.push('staff');
        this._weaponLoadout();
        rewardTitle = t('🪄 Випав Посох!');
        this.hud.banner(t('🥊 НОКАУТ ПРОЙДЕНО!'), t('З ящика випав Посох!'), 4.5);
      } else if (roll < 0.98) {
        this.save.crystals = (this.save.crystals || 0) + 5;
        rewardTitle = t('💎 +5 кристалів');
        this.hud.banner(t('🥊 НОКАУТ ПРОЙДЕНО!'), t('+5 кристалів з ящика'), 4.5);
      } else {
        level.addCoins(100 * fin.mult);
        this.hud.banner(t('🥊 НОКАУТ ПРОЙДЕНО!'), t('+{n} монет з ящика', { n: 100 * fin.mult }), 4.5);
      }
      this.saveGame();
    }
    this._lastEndMode = 'knockout';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🥊 НОКАУТ ПРОЙДЕНО!') : t('💀 НОКАУТ ПРОГРАНО');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills} / ${level.knockout.target}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Ящик зі зброєю')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endDefenseRun(won = true) {
    const level = this.level;
    if (!level || !level.defense || level.defense.over) return;
    const res = level.defense.results();
    level.defense.completed = !!won;
    level.defense.over = true;
    if (level.operation) {
      const detail = level.defense.zone
        ? `${Math.max(0, res.timeLeft)} ${t('с')}`
        : `${res.towerHp} / ${level.defense.towerMaxHp} HP`;
      this._showFrontModeResult(level, won, level.defense.zone ? '⭕' : '🗼', level.defense.zone ? 'Евакуаційна зона' : 'Генератор', detail);
      return;
    }
    // 🌐 кооп: фінал вирішує хост і сповіщає гостей (дзеркало stormend)
    if (level.net && level.net.authority) level.netEv('dfend', won ? 1 : 0);
    this._grantWeeklyCoop(level, !!won);
    if (won && level.net && !level.expedition) this._grantCoopWin(); // 🤝 бонус «разом» і в дружній обороні
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
    const isZone = level.defense.variant === 'zone';
    const defModeId = isZone ? 'zone-defense' : level.defense.variant === 'overloaded' ? 'overloaded-defense' : 'defense';
    const fin = this._soloModeFinish(defModeId, !!won, isZone ? null : res.timeMs);
    if (won && !level.expedition) {
      this.progress.addXp(100 * fin.mult);
      level.addCoins(150 * fin.mult);
      this.saveGame();
    }
    this._lastEndMode = defModeId;
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = isZone
      ? (won ? t('🛡️ ЗОНУ ВТРИМАНО!') : t('💀 ЗОНУ ВТРАЧЕНО'))
      : won ? t('🛡️ ОБОРОНА ВИСТОЯЛА!') : t('💀 ВЕЖУ ЗРУЙНОВАНО');
    document.getElementById('arena-stats').innerHTML = isZone ? `
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Залишилось')}</span><span class="stat-val">${res.timeLeft} ${t('с')}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>`
      : `
      <div class="stat"><span class="stat-icon">🗼</span><span class="stat-name">${t('HP вежі')}</span><span class="stat-val">${res.towerHp} / ${level.defense.towerMaxHp}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills} / ${level.defense.target}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}`;
    this._finishExpeditionNode(won);
    this._showOverlay('overlay-arena-end');
  }

  _endTurretWarRun(won = true, reason = 'turret') {
    const level = this.level;
    if (!level || !level.turretwar || level.turretwar.over) return;
    // 🌐 кооп: бій веде хост (update гостя дзеркальний) — фінал сповіщаємо подією (патерн dfend)
    if (level.net && level.net.authority) level.netEv('twend', won ? 1 : 0, reason);
    this._grantWeeklyCoop(level, !!won);
    if (won && level.net && !level.expedition) this._grantCoopWin(); // 🤝 бонус «разом» і в турельній війні
    level.turretwar.completed = !!won;
    const res = level.turretwar.results();
    level.turretwar.over = true;
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
      retryBtn.textContent = t('🗼 Ще раз!');
    }
    const fin = this._soloModeFinish('turretwar', !!won, res.timeMs);
    if (won && !level.expedition) {
      this.progress.addXp(100 * fin.mult);
      level.addCoins(150 * fin.mult);
      this.saveGame();
    }
    this._lastEndMode = 'turretwar';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won
      ? t('🗼 ЗОМБІ-ТУРЕЛЬ ЗНЕСЕНО!')
      : reason === 'player' ? t('💀 ГЕРОЯ ПЕРЕМОЖЕНО') : t('💀 ТВОЮ ТУРЕЛЬ ЗРУЙНОВАНО');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🗼</span><span class="stat-name">${t('Твоя турель')}</span><span class="stat-val">${res.playerHp} / 500</span></div>
      <div class="stat"><span class="stat-icon">💀</span><span class="stat-name">${t('Зомбі-турель')}</span><span class="stat-val">${res.enemyHp} / 500</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}`;
    this._finishExpeditionNode(won);
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

    const pvpModeId = level.pvp.variant === 'overloaded' ? 'overloaded-pvp' : 'pvp';
    const fin = this._soloModeFinish(pvpModeId, !!won, res.timeMs);
    let rewardTitle = t('Без нагороди');
    if (won) {
      let roll = Math.random();
      if (this._pvpForce !== undefined) {
        roll = this._pvpForce;
        this._pvpForce = undefined;
      }
      if (roll < 0.5) {
        level.addCoins(100 * fin.mult);
        rewardTitle = t('🪙 +{n} монет', { n: 100 * fin.mult });
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
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endBankRun(won = true) {
    const level = this.level;
    if (!level || !level.bank || level.bank.over) return;
    const res = level.bank.results();
    level.bank.completed = !!won;
    level.bank.over = true;
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
      retryBtn.textContent = t('🏦 Ще раз!');
    }
    const fin = this._soloModeFinish('bank', !!won, res.timeMs);
    let rewardTitle = t('Без нагороди');
    if (won) {
      this.progress.addXp(90 * fin.mult);
      level.addCoins(125 * fin.mult);
      rewardTitle = t('🪙 +{n} монет', { n: 125 * fin.mult });
      this.saveGame();
    }
    this._lastEndMode = 'bank';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🏦 БАНК ЗАХИЩЕНО!') : t('💀 БАНК ВТРАЧЕНО');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🏦</span><span class="stat-name">${t('Банків лишилось')}</span><span class="stat-val">${res.safesLeft} / 2</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endPortalRun(won = true) {
    const level = this.level;
    if (!level || !level.portal || level.portal.over) return;
    const res = level.portal.results();
    level.portal.completed = !!won;
    level.portal.over = true;
    if (level.operation) {
      this._showFrontModeResult(level, won, '🌀', 'Портали закрито', `${res.closed} / 3`);
      return;
    }
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
      retryBtn.textContent = t('🌀 Ще раз!');
    }
    const fin = this._soloModeFinish('portal', !!won, res.timeMs);
    let rewardTitle = t('Без нагороди');
    if (won && !level.expedition) {
      this.progress.addXp(110 * fin.mult);
      level.addCoins(150 * fin.mult);
      rewardTitle = t('🪙 +{n} монет', { n: 150 * fin.mult });
      this.saveGame();
    }
    this._lastEndMode = 'portal';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🌀 ПОРТАЛИ ЗАКРИТО!') : t('💀 ПОРТАЛИ ПРОРВАЛИСЯ');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🌀</span><span class="stat-name">${t('Портали закрито')}</span><span class="stat-val">${res.closed} / 3</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._finishExpeditionNode(won);
    this._showOverlay('overlay-arena-end');
  }

  _endMazeRun(won = true) {
    const level = this.level;
    if (!level || !level.maze || level.maze.over) return;
    const res = level.maze.results();
    level.maze.completed = !!won;
    level.maze.over = true;
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
      retryBtn.textContent = t('🧩 Ще раз!');
    }
    const fin = this._soloModeFinish('maze', !!won, res.timeMs);
    let rewardTitle = t('Без нагороди');
    if (won) {
      this.progress.addXp(120 * fin.mult);
      level.addCoins(175 * fin.mult);
      rewardTitle = t('🪙 +{n} монет', { n: 175 * fin.mult });
      this.saveGame();
    }
    this._lastEndMode = 'maze';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('🧩 ЛАБІРИНТ ПРОЙДЕНО!') : t('💀 ЛАБІРИНТ НЕ ПРОЙДЕНО');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🔑</span><span class="stat-name">${t('Ключі знайдено')}</span><span class="stat-val">${res.keys} / 3</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endHumansRun(won = true) {
    const level = this.level;
    if (!level || !level.humans || level.humans.over) return;
    const res = level.humans.results();
    level.humans.completed = !!won;
    level.humans.over = true;
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
    const humansModeId = level.humans.variant === 'overloaded' ? 'overloaded-humans' : 'humans';
    const fin = this._soloModeFinish(humansModeId, !!won, res.timeMs);
    let rewardTitle = t('Без нагороди');
    if (won) {
      this.progress.addXp(130 * fin.mult);
      rewardTitle = t('⭐ +{n} XP', { n: 130 * fin.mult });
      this.saveGame();
    }
    this._lastEndMode = humansModeId;
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('⚔️ ЛЮДИ ПЕРЕМОГЛИ!') : t('💀 ЗОМБІ ПЕРЕМОГЛИ');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі лишилось')}</span><span class="stat-val">${res.remaining} / ${res.target}</span></div>
      <div class="stat"><span class="stat-icon">🧍</span><span class="stat-name">${t('Клони живі')}</span><span class="stat-val">${res.clones} / ${res.cloneTotal}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Наслідок')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endSoulCollectorRun(won = true) {
    const level = this.level;
    if (!level || !level.soulCollector || level.soulCollector.over) return;
    const res = level.soulCollector.results();
    level.soulCollector.completed = !!won;
    level.soulCollector.over = true;
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
      retryBtn.textContent = t('👻 Ще раз!');
    }
    const fin = this._soloModeFinish('soul-collector', !!won, res.timeMs);
    let rewardTitle = t('Без нагороди');
    if (won) {
      this.save.souls = (this.save.souls || 0) + SOUL_WIN_REWARD * fin.mult;
      if (!this.save.soulLevel) this.save.soulLevel = 1;
      rewardTitle = t('👻 +{n} душі', { n: SOUL_WIN_REWARD * fin.mult });
      this.saveGame();
    }
    this._lastEndMode = 'soul-collector';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('👻 ДУШІ ЗІБРАНО!') : t('💀 ДУШІ ВТЕКЛИ');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">👻</span><span class="stat-name">${t('Привидів лишилось')}</span><span class="stat-val">${res.remaining} / ${res.target}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._showOverlay('overlay-arena-end');
  }

  _endRadiationRun(won = true) {
    const level = this.level;
    if (!level || !level.radiation || level.radiation.over) return;
    // 🌐 кооп: фінал кожен детектить сам зі стану puppet-боса (патерн нокауту)
    this._grantWeeklyCoop(level, !!won);
    if (won && level.net && !level.expedition) this._grantCoopWin(); // 🤝 бонус «разом» і в радіації
    level.radiation.completed = !!won;
    const res = level.radiation.results();
    level.radiation.over = true;
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
      retryBtn.textContent = t('☢️ Ще раз!');
    }
    const fin = this._soloModeFinish('radiation', !!won, res.timeMs);
    let rewardTitle = t('Без нагороди');
    if (won && !level.expedition) {
      // ×2/×3 дня-тижня діють і на монети радіації — інакше ротація для режиму пуста
      const gain = RADIATION_WIN_COINS * fin.mult;
      this.save.radiationCoins = (this.save.radiationCoins || 0) + gain;
      rewardTitle = t('☢️ +{n} монет радіації', { n: gain });
      this.saveGame();
    }
    this._lastEndMode = 'radiation';
    const mins = Math.floor(res.timeMs / 60000);
    const secs = Math.floor((res.timeMs % 60000) / 1000);
    document.getElementById('arena-league-place').textContent = '';
    document.querySelector('#overlay-arena-end h1').textContent = won ? t('☢️ РАДІАЦІЮ ОЧИЩЕНО!') : t('💀 РАДІАЦІЯ ПЕРЕМОГЛА');
    document.getElementById('arena-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">☢️</span><span class="stat-name">${t('Радіаційний зомбі')}</span><span class="stat-val">${won ? t('переможено') : t('вижив')}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${res.kills} / ${level.radiation.target}</span></div>
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${fin.recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      ${fin.bestRow}
      <div class="stat best"><span class="stat-icon">🎁</span><span class="stat-name">${t('Нагорода')}</span><span class="stat-val">${rewardTitle}</span></div>`;
    this._finishExpeditionNode(won);
    this._showOverlay('overlay-arena-end');
  }

  _endWorldBossRun(won = true) {
    const level = this.level;
    if (!level || !level.worldBoss) return;
    const mode = level.worldBoss;
    if (mode._ended) return;
    mode._ended = true;
    // 🌐 кооп: фінал кожен детектить сам зі стану puppet-боса (патерн radiation).
    // Командний бонус + недільна нагорода — обом сторонам локально (wire не чіпаємо).
    // Кожен локально пише save.worldBosses[id] нижче — гість отримує clear без окремого
    // соло-анлоку СВІДОМО (прецедент radiationCoins: нагороди коопу нараховуються локально).
    this._grantWeeklyCoop(level, !!won);
    if (won && level.net && !level.expedition) this._grantCoopWin();
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
    const firstClear = won && !level.expedition && !(this.save.worldBosses && this.save.worldBosses[mode.id]);
    const wkBossKey = 'W' + this._weekIndex() + ':boss';
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
    } else if (won && !level.expedition && this.weeklyBossId() === mode.id && !this.save.weekly[wkBossKey]) {
      // 🗓️ бос тижня: повторна нагорода — раз на тиждень
      this.save.weekly[wkBossKey] = true;
      this.save.coins += mode.cfg.reward.coins;
      this.save.crystals = (this.save.crystals || 0) + mode.cfg.reward.crystals;
      this.progress.addXp(mode.cfg.reward.xp);
      rewardTitle = t('🗓️ Бос тижня: 🪙 +{c} · 💎 +{k} · ⭐ +{x} XP', {
        c: mode.cfg.reward.coins,
        k: mode.cfg.reward.crystals,
        x: mode.cfg.reward.xp,
      });
      this.saveGame();
    }

    if (won && !level.expedition) this.quests.onEvent('radiationBoss', { bossId: mode.id });
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
    this._finishExpeditionNode(won);
    this._showOverlay('overlay-arena-end');
  }

  _onBossDied() {
    if (this.level && this.level.bossRush) {
      this.level.bossRush.onBossDied();
      return;
    }
    if (this.level && this.level.radiation) {
      this.level.radiation.update(0);
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

  // 🏆 v305: екрани кінця винесено у src/ui/endscreens.js — делегати лишають назви методів
  // (netVictory/_onBossDied/глобус викликають _showVictory/_maybeWorldSaved по цих іменах).
  _showVictory() { return this.level && this.level.operation ? this._finishFrontStage(true) : showVictory(this); }

  _maybeWorldSaved() { return maybeWorldSaved(this); }

  _showWorldSaved() { return showWorldSaved(this); }

  _grantInfectedWin(countryId, stats) { return grantInfectedWin(this, countryId, stats); }

  _awardStars(cid, stats) { return awardStars(this, cid, stats); }

  _claimStarThresholds() { return claimStarThresholds(this); }

  _renderVictoryStars(info) { return renderVictoryStars(this, info); }

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
      // 🎁 v294: соло-церемонія скрині морозить сим (як draft) — fullscreen-оверлей інакше
      // ковтав би постріли посеред бою (мегабокс/еліт/золото). Тап-пропуск працює на DOM-кліку.
      const blocked = isCoop ? this.victoryShown : (this.paused || this.shop.isOpen || this.draft.isOpen || this.victoryShown || !!this._chestState);
      const hitstopScale = this._hitstopT > 0 ? 0.15 : 1;
      if (this._hitstopT > 0) this._hitstopT = Math.max(0, this._hitstopT - timerDt);
      const simDt = dt * hitstopScale;
      if (!blocked) {
        const alive = this.level.player.health > 0;
        const allowControl = (this.input.locked || this.testMode || this.input.touchMode)
          && this.deathT < 0 && alive
          && !(isCoop && (this.paused || this.shop.isOpen));
        if (this.level.customMap && this.level.customMap.editor) {
          this.level.missions.update(simDt, this.input, allowControl);
          this.level.world.update(simDt, this.level.player.pos);
          this.level.effects.update(simDt);
          this.level.stats.time += timerDt;
        } else {
        this.level.player.update(simDt, this.input, allowControl);
        this.level.zombies.update(simDt);
        if (this.level.moonHazards) this.level.moonHazards.update(simDt);
        if (this.level.operation) this._updateFrontDirector(this.level, simDt);
        this.level.missions.update(simDt, this.input, allowControl);
        // 🤝 схований друг у клітці (соло-кампанія): підхід + звільнення 2с + летить у табір
        if (this.level.rescueCage) this.level.rescueCage.update(simDt, this.input, allowControl);
        // іграшки: самокати, мегабокс, гаджети, песик
        if (!this.level.noGadgets) this.level.vehicles.update(simDt, this.input, allowControl);
        if (this.level.megabox && !this.level.megabox.done) {
          this.level.megabox.update(simDt, this.input, allowControl);
        }
        if (this.level.superPickup && !this.level.superPickup.done) {
          this.level.superPickup.update(simDt);
        }
        // 🌟 кооп: host-authoritative підбір зірки + згасання сил гостей (у гостя — no-op)
        if (this.level.net) this._updateCoopSuper(this.level, simDt);
        if (!this.level.noGadgets || this.level.modeShield) this.level.gadgets.update(simDt, this.input, allowControl);
        if (this.level.net) this._updateRevive(simDt, allowControl);
        if (this.level.pet) this.level.pet.update(simDt);
        this.level.world.update(simDt, this.level.player.pos);
        this.level.effects.update(simDt);
        this.level.stats.time += timerDt;
        this._updateLivingCity(this.level, simDt);
        this._updateDayNight();
        // 🌪️ піщана буря Єгипту: оверлей туману лягає ПІСЛЯ нічного перерахунку
        if (this.level.sandstorm) this.level.sandstorm.update(simDt);
        // комбо згасає разом із симуляцією: freeze-frame не краде серію
        tickMomentum(this.level.combo, simDt);
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
    if (level.infected) k = Math.max(k, 0.45);
    if (level.operation && level.operation.template === 'evacuation' && level.operation.stage === 1) k = Math.max(k, 0.9);
    if ((level.weeklyMod && level.weeklyMod.night) || (level.weeklyMutator && level.weeklyMutator.night)) k = Math.max(k, 0.75);
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
    if (this.touch && this.touch.resetPointers) this.touch.resetPointers();
    else if (this.input && this.input.resetTransient) this.input.resetTransient();
    this.paused = true;
    const note = document.getElementById('pause-coop-note');
    if (note) note.style.display = this.level && this.level.net ? 'block' : 'none';
    this._showOverlay('overlay-pause');
  }

  // ---------- API для автотестів ----------
  get test() {
    // 🧪 v305: тест-API винесено у src/testapi.js (`const g = this` → `const g = game`).
    return buildTestApi(this);
  }
}

new Game();
