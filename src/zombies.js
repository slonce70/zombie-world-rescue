// Зомбі: AI (блукання/охорона/погоня/атака/смерть), орди, бос
import * as THREE from 'three';
import { SQUAD_LURE_RADIUS } from './squad.js';
import { makeZombie, makeBoss, makeShieldMesh, makeBurnFx, makeEliteAura, makeIconSprite, updateRig, setAnim, toonMat, disposeRigSkeleton } from './characters.js';

import { clamp, damp, dampAngle, closestRaySeg, RNG, disposeObject } from './utils.js';
import { t } from './i18n.js';
import { ZS_MASK, ZF } from './net/protocol.js';

const TYPE_STATS = {
  walker: { hp: 70, speed: 1.7, chaseSpeed: 3.4, aggro: 20, dmg: 10, attackR: 1.8, coins: 5, pitch: 1.0 },
  runner: { hp: 45, speed: 2.8, chaseSpeed: 5.6, aggro: 32, dmg: 8, attackR: 1.7, coins: 8, pitch: 1.5 },
  headphones: { hp: 102, speed: 1.6, chaseSpeed: 3.3, aggro: 24, dmg: 10, attackR: 1.8, coins: 11, pitch: 1.05, stunImmune: true },
  boxer: { hp: 125, speed: 1.55, chaseSpeed: 3.5, aggro: 26, dmg: 7, attackR: 1.9, coins: 16, pitch: 0.8, punchEvery: 3, punchPush: 5 },
  tank: { hp: 230, speed: 1.3, chaseSpeed: 2.6, aggro: 18, dmg: 22, attackR: 2.3, coins: 15, pitch: 0.55 },
  stone: { hp: 500, speed: 0.9, chaseSpeed: 1.8, aggro: 24, dmg: 10, attackR: 2.1, coins: 25, pitch: 0.5, hitStun: 0.5 },
  moonbrute: { hp: 1000, speed: 0.6, chaseSpeed: 1.2, aggro: 26, dmg: 3, attackR: 2.5, coins: 45, pitch: 0.42 },
  // 🛡 щитоносець: тіло слабке (20 hp), але щит дуже міцний (1000) — НЕ ламай у лоб, ОБІЙДИ збоку/ззаду!
  // фронтальний конус щита (v42) лишається: збоку та ззаду тіло вразливе.
  shield: { hp: 20, speed: 1.0, chaseSpeed: 2.0, aggro: 24, dmg: 16, attackR: 2.0, coins: 40, pitch: 0.7, shieldHp: 1000 },
  snowman: {
    hp: 60, speed: 1.2, chaseSpeed: 2.2, aggro: 32, dmg: 11, attackR: 2.0, coins: 10, pitch: 1.8,
    ranged: { min: 7, max: 30, hold: 13, cd: 3.0, projSpeed: 16, dmg: 9, size: 0.22 },
  },
  // 🤮 плювака: тримає дистанцію і плює отрутою
  spitter: {
    hp: 55, speed: 1.5, chaseSpeed: 3.0, aggro: 34, dmg: 9, attackR: 1.8, coins: 12, pitch: 1.3,
    ranged: { min: 8, max: 26, hold: 12, cd: 3.4, projSpeed: 18, dmg: 12, size: 0.2, color: 0x9be84e },
  },
  // 🔫 зомбі-стрілець: тримає дистанцію і стріляє з пістолета (10 шкоди за постріл)
  gunner: {
    hp: 55, speed: 1.5, chaseSpeed: 3.0, aggro: 32, dmg: 8, attackR: 1.7, coins: 14, pitch: 1.25,
    ranged: { min: 7, max: 30, hold: 13, cd: 2.6, projSpeed: 30, dmg: 10, size: 0.11, color: 0xffe08a },
  },
  archer: {
    hp: 120, speed: 0, chaseSpeed: 0, aggro: 45, dmg: 7, attackR: 1.8, coins: 20, pitch: 0.9,
    ranged: { min: 5, max: 45, hold: 45, cd: 2.8, projSpeed: 24, dmg: 7, size: 0.1, color: 0xd8b06a },
    helmetHp: 125,
  },
  // 🦾 броньовик: залізний нагрудник 600 міцності, повільний; голова вразлива!
  ironclad: { hp: 60, speed: 0.85, chaseSpeed: 1.7, aggro: 22, dmg: 5, attackR: 2.1, coins: 35, pitch: 0.5, chestHp: 600 },
  // 🧙 зомбі-чарівник: кастер. Б'є посохом-орбом здалека (15), прикликає зомбі (≤5 живих),
  // лікує своїх AoE і ставить собі щит на 100 (ре-каст через 5с). Повільний, КАЙТИТЬ.
  wizard: {
    hp: 200, speed: 1.1, chaseSpeed: 2.2, aggro: 30, dmg: 12, attackR: 1.9, coins: 55, pitch: 0.85,
    // hold:28 → тримає дистанцію (кайтить) аж до 28м; min:8 → не стріляє впритул
    ranged: { min: 8, max: 28, hold: 28, cd: 2.5, projSpeed: 16, dmg: 15, size: 0.3, color: 0x9b6bff },
    shieldHp: 100,
  },
  // 🧻 мумія: повільна, але жилава і боляче хапає; вночі особливо моторошна
  mummy: { hp: 160, speed: 1.0, chaseSpeed: 2.3, aggro: 26, dmg: 18, attackR: 2.0, coins: 18, pitch: 0.6 },
  // 🐂 торо: зомбі-бичок Іспанії. Середній hp, швидкий; здаля РОЗГАНЯЄТЬСЯ й б'є рогами (charge)
  toro: { hp: 130, speed: 1.6, chaseSpeed: 4.2, aggro: 30, dmg: 14, attackR: 2.1, coins: 16, pitch: 0.7, charger: true },
  // 🛡️ гладіатор: зомбі-гладіатор Італії зі шоломом-гребенем, мечем і щитом.
  // МІЦНИЙ ближній боєць (високий hp, боляче рубає мечем), середня швидкість.
  // Здаля РОЗГАНЯЄТЬСЯ у випад мечем (charger): телеграф → ривок → удар.
  gladiator: { hp: 175, speed: 1.4, chaseSpeed: 3.6, aggro: 28, dmg: 19, attackR: 2.2, coins: 22, pitch: 0.62, charger: true },
  // ponytail: самурай переюзує готовий charger; окрему катана-механику додамо, коли вона реально потрібна.
  samurai: { hp: 150, speed: 1.65, chaseSpeed: 4.0, aggro: 30, dmg: 17, attackR: 2.1, coins: 20, pitch: 0.78, charger: true },
  // 🏺 теракотовий воїн (Китай): броньований charger — трохи живучіший за самурая, важчий ривок
  terracotta: { hp: 165, speed: 1.55, chaseSpeed: 4.1, aggro: 30, dmg: 18, attackR: 2.1, coins: 21, pitch: 0.72, charger: true },
  // 🧟 шкет (imp): дрібний, слабкий (50hp), зате ДУЖЕ швидкий (швидше за runner) — наздожене будь-кого.
  // Доступний з усіх країн, у т.ч. UKR: лише швидкий, новачку не страшно.
  imp: { hp: 50, speed: 2.8, chaseSpeed: 6.2, aggro: 32, dmg: 6, attackR: 1.5, coins: 6, pitch: 1.8, small: true },
  // 👻 привид: НЕВИДИМИЙ зомбі. Без гаджета «Ікс-рей» його не видно — лише він підсвічує всіх привидів на 4с.
  // Середній і доволі прудкий, тому коштує уваги; багато монет як нагорода за виклик.
  ghost: { hp: 60, speed: 2.0, chaseSpeed: 4.2, aggro: 30, dmg: 12, attackR: 1.8, coins: 20, pitch: 1.4, invisible: true },
  // 🪬 зомбі-шаман: звичайний мелі, але ВОСКРЕСАЄ один раз (добий двічі); може лишити тотем безсмертя
  shaman: { hp: 125, speed: 1.5, chaseSpeed: 3.0, aggro: 28, dmg: 14, attackR: 1.9, coins: 30, pitch: 0.9 },
  // 🤖 зомбі-робот: важкий МЕХ із пілотом (1255hp, НЕ бос). Меч зблизька (dmg 20),
  // гармата здаля (ranged 10). При смерті ВИБУХАЄ по площі (157, обробка в _kill).
  robot: {
    hp: 1255, speed: 1.0, chaseSpeed: 2.1, aggro: 26, dmg: 20, attackR: 2.4, coins: 55, pitch: 0.45,
    ranged: { min: 9, max: 34, hold: 13, cd: 2.4, projSpeed: 26, dmg: 10, size: 0.32, color: 0xffd24a },
    // 🛡 щит-гаджет меха: фронтальний (як wizard/shield), 555 міцності, ре-каст через ~8с після зламу
    shieldHp: 555,
  },
  // 🧛 вампір: швидкий НІЧНИЙ хижак. Зʼявляється лише вночі (nightK>0.5), у будь-якій країні.
  // 150 hp, прудкий у погоні; БЕЗ ranged, БЕЗ щита, без lifesteal (lifesteal — окрема майбутня опція).
  vampire: { hp: 150, speed: 1.7, chaseSpeed: 4.0, aggro: 30, dmg: 14, attackR: 1.9, coins: 24, pitch: 1.15 },
  // 🪓 розділювач (v287): кремезний, повільний; по СМЕРТІ розпадається на 2 міні-зомбі
  // (швидкі, слабкі, ~60% зросту). Міні рахуються у вбивства/квести як звичайні (тип 'runner').
  splitter: { hp: 210, speed: 1.35, chaseSpeed: 2.8, aggro: 26, dmg: 15, attackR: 2.1, coins: 22, pitch: 0.66, splits: true },
  // 💥 підривник (v287): біжить до гравця ШВИДШЕ за всіх; у радіусі ~4м — телеграф 1.2с
  // (миготіння + червоне коло на землі), потім вибух (25 гравцю в радіусі, добиває сусідніх зомбі).
  // Постріл до детонації підриває на місці. Мультяшний бабах — без крові.
  exploder: { hp: 55, speed: 2.6, chaseSpeed: 5.4, aggro: 34, dmg: 5, attackR: 2.0, coins: 18, pitch: 1.35, exploder: true },
  boss: { hp: 1300, speed: 2.0, chaseSpeed: 3.9, aggro: 999, dmg: 26, attackR: 3.6, coins: 0, pitch: 0.4 },
};
// 💥 підривник: радіус вибуху і шкода гравцю; телеграф — час до детонації в межах радіуса
const EXPLODER_RADIUS = 4.5;
const EXPLODER_DMG = 25;
const EXPLODER_TELEGRAPH = 1.2;
// 👹 еліт-декор (v287): іконка над головою + колір аури під ногами, за типом
const ELITE_INFO = {
  shield: { icon: '🛡️', color: 0x8fb7ff },
  splitter: { icon: '🪓', color: 0x7be07b },
  exploder: { icon: '💥', color: 0xff6a4a },
  golden: { icon: '👑', color: 0xffd23f },
  default: { icon: '👑', color: 0xffd23f },
};
const WEEKLY_ELITE_SOURCE_TYPES = new Set(['walker', 'runner', 'headphones', 'boxer', 'mummy', 'imp']);
const HEAVY_TYPES = new Set(['tank', 'stone', 'moonbrute', 'ironclad', 'robot']);

// 🦁 Бестіарій-колекція (R2-5.3): усі звичайні типи зомбі з TYPE_STATS (включно з 'boss' —
// його вбивають у кінці кожної глави, тож ціль «усі види» лишається реально досяжною).
// 'golden' — окремий запис у save.bestiary (золотий зомбі — це варіант звичайного типу,
// не власний вид), тому в лічильник видів для бестіарій-цілей його НЕ включаємо.
export const BESTIARY_TYPE_IDS = Object.freeze(Object.keys(TYPE_STATS));

const FROST_RANGED = { min: 9, max: 40, hold: 0, cd: 4.5, projSpeed: 20, dmg: 18, size: 0.5 };
// 🥖 Шеф Багет жбурляє багети
const BAGUETTE_RANGED = { min: 8, max: 38, hold: 0, cd: 3.6, projSpeed: 19, dmg: 16, size: 0.34, color: 0xd9a35e, stretch: true };
// 🍢 Паша Кебаб кидає розпечені шампури
const KEBAB_RANGED = { min: 8, max: 40, hold: 0, cd: 3.2, projSpeed: 23, dmg: 17, size: 0.3, color: 0xb4543a };
// 🪲 Фараон насилає золотих скарабеїв
const SCARAB_RANGED = { min: 7, max: 42, hold: 0, cd: 2.8, projSpeed: 17, dmg: 19, size: 0.34, color: 0xd4af37 };
// 🗡️ Матадор-зомбі жбурляє бандерильї (червоно-золоті дротики)
const BANDERILLA_RANGED = { min: 8, max: 40, hold: 0, cd: 3.0, projSpeed: 24, dmg: 18, size: 0.3, color: 0xc62828, stretch: true };
// 🔱 Цезар-зомбі (бос Італії) метає вогняні списи-пілуми (видовжені золоті снаряди)
const PILUM_RANGED = { min: 8, max: 42, hold: 0, cd: 2.9, projSpeed: 26, dmg: 20, size: 0.32, color: 0xffb030, stretch: true };

// ── Легка бакет-сітка зомбі для сепарації (пошук сусідів O(сусіди) замість O(N)) ──
// CELL=4 м: будь-яка пара зомбі взаємодіє в межах minD ≤ ~1.7 м, тож 3×3 комірки покривають усіх.
const SEP_CELL = 4;
const SKEY = (cx, cz) => (cx + 512) * 4096 + (cz + 512);

// Side the shot came from in zombie-local space. Keeping this mathematical
// avoids extra hitbox meshes and works for every procedural zombie variant.
const impactSide = (z, dir) => {
  if (!dir) return 'front';
  const yaw = z.rig.group.rotation.y;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const fromX = -dir.x, fromZ = -dir.z;
  const front = fromX * fx + fromZ * fz;
  if (Math.abs(front) >= 0.55) return front > 0 ? 'front' : 'back';
  return fromX * Math.cos(yaw) - fromZ * Math.sin(yaw) > 0 ? 'right' : 'left';
};

export class Zombies {
  constructor(level, seed = 999) {
    this.level = level;
    this.scene = level.scene;
    this.world = level.world;
    this.L = level.world.layout;
    this.rng = new RNG(seed);
    // ⭐ зірки складності (M7): множник на базову difficulty країни.
    // ВАЖЛИВО: на ★1 — ідентичність (this.diff === _base), кампанія/e2e не змінюються.
    const _base = (level.country && level.country.difficulty) || { hp: 1, dmg: 1, counts: 1 };
    const _star = Math.max(1, Math.min(5, level.diffStar || 1));
    this.diffStar = _star;
    // зірка піднімає МІЦНІСТЬ (hp) та ШКОДУ (dmg) зомбі; counts (розмір орди)
    // лишається базовим — масштабування розміру орди свідомо відкладено
    // (це чіпає делікатну логіку спавну орди, яка читає country.difficulty.counts напряму).
    this.diff = _star > 1
      ? { hp: _base.hp * (1 + 0.6 * (_star - 1)), dmg: _base.dmg * (1 + 0.25 * (_star - 1)), counts: _base.counts }
      : _base;
    // 🔫 стрільці-зомбі лише у складнішому контексті: НЕ перша країна (UKR dmg=1) на ★1.
    // Будь-яка пізніша країна (dmg>1) або підняті зірки (diffStar>1) → дозволено.
    this._allowGunner = this.diff.dmg > 1 || this.diffStar > 1;
    // 🧙 чарівник — спец-ворог пізніших країн: НЕ на навчальній Україні ★1.
    // Той самий гейт, що й стрілець (dmg>1 або підняті зірки).
    this._allowWizard = this.diff.dmg > 1 || this.diffStar > 1;
    this._wizardCount = 0; // не більше 1-2 на рівень
    // 👻 невидимі привиди — той самий гейт (НЕ навчальна Україна ★1)
    this._allowGhost = this.diff.dmg > 1 || this.diffStar > 1;
    // 🪬 шаман — рідкісний спец-ворог пізніших країн (той самий гейт, що й привид)
    this._allowShaman = this.diff.dmg > 1 || this.diffStar > 1;
    // 🤖 робот — важкий МЕХ: у КОЖНІЙ країні, ОКРІМ України (за будь-якої складності)
    this._allowRobot = !!(level.country && level.country.id !== 'UKR');
    // 🧛 вампір — НІЧНИЙ хижак: дозволений у КОЖНІЙ країні (ніч універсальна; сама ніч є умовою появи).
    // Спавн — лише вночі (nightK>0.5), див. нічний спавнер в update(). Стан таймера/лічильника тримаємо тут.
    this._allowVampire = true;
    this._vampT = 0;        // акумулятор кадецію нічного спавну (~7с)
    this._vampWasNight = false; // для скидання таймера на світанку (перехід ніч→день)
    this.xrayT = 0; // таймер підсвічування привидів (гаджет «Ікс-рей»)
    this.extraZombie = (level.country && level.country.extraZombie) || null;
    this.list = [];
    this.byNidMap = new Map();
    this.mirror = !!level.mirror;
    this._idSeq = 0;
    this.boss = null;
    this.hordeRemaining = 0;
    this.hordePending = 0;
    this.hordeSpawnT = 0;
    this.hordeActive = false;
    this._hordeIdleT = 0;
    this._hordePrevAlive = undefined;
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
    // 🧲 бакет-сітка зомбі для сепарації: rebuild раз/кадр (Map переюзуємо clear-ом, без алокацій)
    this._sepGrid = new Map();
    // 🪦 тривалість трупа: на тачі коротша (1.6с) — менший вторинний CPU-пік
    // одразу після бою; на десктопі лишаємо 3.0с (видовищніше).
    const touch = !!(level.game && level.game.input && level.game.input.touchMode);
    this._corpseTtl = touch ? 1.6 : 3.0;
  }

  _toughHpBonus(opts = {}) {
    if (opts.mirror) return 0;
    return this.level.game && this.level.game.save && this.level.game.save.toughZombies ? 100 : 0;
  }

  hpWithSettings(baseHp, opts = {}) {
    // 🕊️ R3 невидиме милосердя: −10% HP звичайних зомбі (НЕ боса) після 2+ смертей поспіль.
    // opts.boss пропускає милосердя, щоб maxHp боса й дріб смужки не стрибали між спробами
    // (weekly/складність уже складені у baseHp; tough-бонус лишається).
    const mercy = (this.level.mercy && !opts.boss) ? this.level.mercy.hpMult : 1;
    return Math.max(1, Math.round(baseHp * mercy) + this._toughHpBonus(opts));
  }

  setConfiguredHp(z, baseHp, opts = {}) {
    const hp = this.hpWithSettings(baseHp, opts);
    z.maxHp = hp;
    z.hp = hp;
    z.stats = { ...z.stats, hp };
    return hp;
  }

  spawn(type, x, z, opts = {}) {
    const bossStyle = opts.style || (opts.frost ? 'frost' : 'king');
    const nid = opts.nid !== undefined ? opts.nid
      : (this.level.net && this.level.net.authority ? this.level.net.allocId() : ++this._idSeq);
    // зовнішність зомбі — з nid-сідованого RNG: однакова у всіх гравців кооперативу
    const vrng = new RNG((Math.imul(nid, 2654435761) ^ 0x9e3779) >>> 0);
    let finalType = type;
    let stats = { ...TYPE_STATS[finalType] };
    const wm = this.level.weeklyMutator;
    // 🗓️ Єдина точка перехоплення: не чіпаємо босів, орду, дзеркала коопу
    // та стилізовані boss-виклики, щоб не складати сценарні ефекти двічі.
    const weeklyCanTouch = !!(wm && finalType !== 'boss' && !opts.horde && !opts.mirror && !opts.style && !opts.frost);
    if (weeklyCanTouch) {
      const weeklyEliteOk = !opts.guard && !opts.zone && !opts.golden && !opts.sleeping && !opts.noCoopScale && !opts.mini
        && WEEKLY_ELITE_SOURCE_TYPES.has(finalType);
      if (weeklyEliteOk && wm.eliteChance > 0 && this.rng.chance(wm.eliteChance)) {
        const eliteTypes = Array.isArray(wm.eliteTypes) && wm.eliteTypes.length ? wm.eliteTypes : ['tank', 'shield'];
        finalType = eliteTypes[Math.floor(this.rng.next() * eliteTypes.length)] || 'tank';
        stats = { ...TYPE_STATS[finalType] };
      }
      if (wm.hpMul && wm.hpMul !== 1) stats.hp *= wm.hpMul;
      if (wm.speedMul && wm.speedMul !== 1) {
        stats.speed *= wm.speedMul;
        stats.chaseSpeed *= wm.speedMul;
      }
    }
    const castleKnight = finalType === 'gladiator' && opts.castleKnight === true;
    const castleArcher = finalType === 'archer' && opts.castleArcher === true;
    if (castleKnight) Object.assign(stats, { hp: 150, chestHp: 500, helmetHp: 250 });
    const rig = finalType === 'boss' ? makeBoss(bossStyle) : makeZombie(finalType, vrng, castleKnight ? 'castleKnight' : '');
    const y = opts.zone === 'castle-dungeon' ? this.world.dungeonGroundH(x, z) : this.world.groundH(x, z);
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = this.rng.next() * 6.28;
    this.scene.add(rig.group);
    if (stats && stats.invisible) rig.group.visible = false; // 👻 невидимий до Ікс-рею
    // 🤝 кооп: зомбі сильніші пропорційно команді (2 гравці → ×2 HP, 3 → ×3).
    // noCoopScale — для хвиль Шторму: їх КІЛЬКІСТЬ уже росте з гравцями (+60%/друга),
    // тож додатково множити HP кожного = потрійний стек (count×HP×шкода ≈ ×6.6 для трьох) — несправедливо важко
    const coopScale = (opts.mirror || opts.noCoopScale) ? 1 : this.coopMul();
    const hpScale = finalType === 'boss' ? 1 : this.diff.hp * coopScale;
    const maxHp = castleKnight ? 150 : castleArcher ? 120 : finalType === 'stone' ? 500 : finalType === 'moonbrute' ? 1000 : this.hpWithSettings(stats.hp * hpScale, opts);
    stats.hp = maxHp;
    const z_ = {
      nid, rig, type: finalType, stats,
      hp: maxHp, maxHp,
      x, z, y,
      state: opts.horde ? 'chase' : 'wander',
      anchor: opts.anchor || { x, z, r: 10 },
      guard: !!opts.guard,
      zone: opts.zone || null,
      horde: !!opts.horde,
      castleKnight,
      castleArcher,
      aggroed: !!opts.horde,
      wanderT: this.rng.range(0, 3),
      wx: x, wz: z,
      attackT: -1, didHit: false, attackLockT: 0,
      staggerT: 0, recoverT: 0,
      investigateT: 0, investigateX: x, investigateZ: z,
      // Тактична зграя: сусідні зомбі заходять із різних боків, а не шикуються в одну чергу.
      flankLane: (nid % 3) - 1,
      avoidSide: (nid & 1) ? 1 : -1,
      avoidT: 0,
      stuckT: 0,
      avoidBlockedT: 0,
      stunT: 0,
      confusedT: 0,
      confusedDmgBonus: 0,
      slowT: 0, slowMul: 1,
      deadT: -1,
      groanT: this.rng.range(2, 9),
      groupId: opts.groupId ?? -1,
      gone: false,
      // бос + 🐂 торо (charger): телеграф-ривок-удар рогами
      chargeCd: this.rng.range(2.5, 5), charging: 0, chargeDX: 0, chargeDZ: 0, telegraph: 0,
      charger: !!stats.charger,
      summonedAt: { 75: false, 50: false, 25: false },
      invisible: !!(stats && stats.invisible),
      revivedOnce: false, // 🪬 шаман воскресає один раз

      frost: bossStyle === 'frost',
      bossStyle: finalType === 'boss' ? bossStyle : null,
      noLeash: !!opts.noLeash, // міні-боси шторму гуляють вільно
      // дальній бій (сніговики, плювака, Король Мороз, Шеф Багет)
      ranged: stats.ranged
        || (finalType === 'boss' && bossStyle === 'frost' ? FROST_RANGED : null)
        || (finalType === 'boss' && bossStyle === 'chef' ? BAGUETTE_RANGED : null)
        || (finalType === 'boss' && bossStyle === 'sultan' ? KEBAB_RANGED : null)
        || (finalType === 'boss' && bossStyle === 'pharaoh' ? SCARAB_RANGED : null)
        || (finalType === 'boss' && bossStyle === 'matador' ? BANDERILLA_RANGED : null)
        || (finalType === 'boss' && bossStyle === 'gladiator' ? PILUM_RANGED : null),
      rangedCd: this.rng.range(0.5, 2.5),
      throwProj: false,
      // 🛡 щит
      shieldHp: 0, shieldMax: 0, shieldObj: null,
      // 🧙 чарівник: таймери призову / лікування / ре-касту щита
      summonCd: 0, healCd: 0, shieldRecastCd: 0, minions: [],
    };
    if (finalType === 'shield') {
      z_.shieldHp = z_.shieldMax = stats.shieldHp;
      // 🔥 v47: частина щитоносців на пізніх країнах (де вже є вогнемет) — анти-вогонь.
      // shieldFireproof → вогнемет НЕ ламає щит (гравець мусить обійти збоку), решта шкоди — як завжди.
      // Гейт: лише складніший контекст (НЕ перша Україна на ★1) і ~40% шанс.
      z_.shieldFireproof = (this.diff.dmg > 1 || this.diffStar > 1) && this.rng.chance(0.4);
      const shield = makeShieldMesh(z_.shieldFireproof);
      // щит висить перед тулубом — закриває з фронту (-Z)
      shield.group.position.set(0, 1.05, -0.62);
      rig.body.add(shield.group);
      z_.shieldObj = shield;
    }
    if (finalType === 'wizard') {
      // 🧙 щит чарівника — той самий механізм shieldHp, але менший і відновлюваний
      z_.shieldHp = z_.shieldMax = stats.shieldHp;
      const shield = makeShieldMesh();
      shield.group.position.set(0, 1.05, -0.62);
      rig.body.add(shield.group);
      z_.shieldObj = shield;
      z_.summonCd = this.rng.range(3, 6);
      z_.healCd = this.rng.range(2, 4);
    }
    if (finalType === 'robot') {
      // 🤖🛡 щит-гаджет меха — той самий механізм shieldHp (фронтальний, ре-каст), масштабований під великого меха
      z_.shieldHp = z_.shieldMax = stats.shieldHp; // 555
      const shield = makeShieldMesh();
      // мех великий (rig scale 1.7) → щит помітно більший і вищий
      shield.group.scale.setScalar(1.8);
      shield.group.position.set(0, 1.35, -0.78);
      rig.body.add(shield.group);
      z_.shieldObj = shield;
      z_.shieldRecastCd = 0; // стартує зі щитом; >0 лише після зламу
    }
    z_.chestHp = z_.chestMax = stats.chestHp || 0;
    z_.helmetHp = z_.helmetMax = stats.helmetHp || 0;
    if (z_.chestMax > 0 || z_.helmetMax > 0) {
      // Броня — іменовані групи, клоновані разом із шаблоном персонажа.
      rig.body.traverse((o) => {
        if (o.name === 'chestPlate') z_.chestObj = o;
        if (o.name === 'helmetArmor') z_.helmetObj = o;
        if (o.name === 'chestCracks1') { z_.chestCracks1 = o; o.visible = false; }
        if (o.name === 'chestCracks2') { z_.chestCracks2 = o; o.visible = false; }
      });
    }
    if (finalType === 'vampire') {
      // 🔥 вогонь горіння на сонці — per-instance, чіпляємо як щит (на rig.body). Тоглиться вдень в update().
      z_.burnFx = makeBurnFx();
      rig.body.add(z_.burnFx);
    }
    z_.damage = (amt, dir, headshot, opts) => this._damage(z_, amt, dir, headshot, opts);
    if (opts.golden) this._makeGolden(z_);
    if (opts.elite) this._makeElite(z_);
    // 💥 підривник: телеграф-таймер (0 = ще не почав), маркер детонації, посилання на світний «заряд»
    if (finalType === 'exploder') {
      z_.explodeT = 0;
      z_.exploded = false;
      z_.rig.body.traverse((o) => { if (o.name === 'bombCore') z_.bombCore = o; });
    }
    // 🪓 міні-зомбі розділювача: ~60% зросту, слабкий, мало монет (тіло вже клоноване як 'runner')
    if (opts.mini) {
      z_.mini = true;
      z_.rig.group.scale.multiplyScalar(0.6);
      z_.rig.radius *= 0.6;
      z_.rig.height *= 0.6;
      z_.stats.coins = 4;
      this.setConfiguredHp(z_, 18, opts);
    }
    // 👑 золотий: TTL лише для АМБІЄНТНОГО золотого (v287-подія «дожени за 25с»). Золоті на
    // мапах (populate/goldenZombie) і в коопі роумлять, поки їх не вб'ють — жодного TTL.
    if (opts.ambientGolden) z_.goldenTtl = 25;
    if (opts.sleeping) {
      z_.sleeping = true;
      setAnim(rig, 'idle');
    }
    // 🌋 світовий бос: прапори мусять стояти ДО onZombieSpawn, інакше live-подія zs
    // (бос спавниться посеред бою) не понесе o.wb/o.wbm — гість не забіндить puppet-боса
    if (opts.worldBoss) z_.worldBoss = opts.worldBoss;
    if (opts.worldBossMinion) z_.worldBossMinion = true;
    this.byNidMap.set(nid, z_);
    this.list.push(z_);
    if (finalType === 'boss') this.boss = z_;
    if (this.level.net && this.level.net.authority && !opts.mirror) this.level.net.onZombieSpawn(z_);
    return z_;
  }

  byNid(nid) { return this.byNidMap.get(nid) || null; }

  // 🧪 тест-хук: базове (немодифіковане) hp типу зомбі — для перевірки множників мутатора
  baseHpFor(type) { return (TYPE_STATS[type] && TYPE_STATS[type].hp) || null; }

  // золоте покриття: один матеріал поверх запечених кольорів
  _makeGolden(z_) {
    z_.golden = true;
    const goldM = toonMat(0xffd23f, 0xcc8800, 0.35);
    z_.rig.group.traverse((o) => {
      if (o.isMesh) o.material = goldM;
    });
  }

  // 👹 еліт: золота корона-обідок, більший зріст + (v287) кольорова аура під ногами
  // й іконка-емодзі над головою. Аура/іконка — спільна геометрія + кешовані текстури (дешево).
  _makeElite(z_) {
    z_.elite = true;
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.05, 6, 14),
      toonMat(0xffd23f, 0xcc8800, 0.6)
    );
    crown.rotation.x = Math.PI / 2 - 0.15;
    crown.position.y = 0.38;
    z_.rig.parts.head.add(crown);
    z_.rig.group.scale.multiplyScalar(1.18);
    const info = ELITE_INFO[z_.type] || ELITE_INFO.default;
    const aura = makeEliteAura(info.color);
    z_.rig.group.add(aura);
    z_.eliteAura = aura;
    const icon = makeIconSprite(info.icon);
    icon.position.set(0, z_.rig.height + 0.55, 0);
    z_.rig.group.add(icon);
    z_.eliteIcon = icon;
  }

  populate() {
    const density = (this.level.country && this.level.country.map && this.level.country.map.zombieDensity) || 1;
    // блукаючі групи
    const groups = [
      [-40, 60, 3], [60, -40, 3], [-80, 12, 3], [28, 84, 3],
      [-52, -112, 3], [150, -20, 3],
    ];
    groups.forEach(([gx, gz, baseN], gi) => {
      const n = Math.max(1, Math.round(baseN * density));
      for (let i = 0; i < n; i++) {
        const a = this.rng.next() * 6.28;
        const r = this.rng.range(2, 9);
        let type = this.rng.chance(0.25) ? 'runner' : 'walker';
        // 🧙 чарівник — рідкісний спец-ворог пізніших країн (~6% шанс, максимум 2 на рівень)
        const wizardCap = this.diff.hp >= 1.8 ? 2 : 1;
        if (this._allowWizard && this._wizardCount < wizardCap && this.rng.chance(0.06)) {
          type = 'wizard';
          this._wizardCount++;
        } else if (this.extraZombie && this.rng.chance(0.25)) type = this.extraZombie;
        // 🔫 стрілець — лише у складнішому контексті (НЕ перша Україна на ★1)
        else if (this._allowGunner && this.rng.chance(0.1)) type = 'gunner';
        // 👻 привид — невидимий спец-ворог (бачиш лише з Ікс-реєм), той самий гейт, що й стрілець
        else if (this._allowGhost && this.rng.chance(0.07)) type = 'ghost';
        // 🪬 зомбі-шаман — рідкісний; воскресає раз і може лишити тотем безсмертя
        else if (this._allowShaman && this.rng.chance(0.06)) type = 'shaman';
        // 🧟 шкет — дрібний швидкий зомбі, доступний з УСІХ країн (зокрема UKR)
        else if (this.rng.chance(0.13)) type = 'imp';
        else if (this.rng.chance(0.08)) type = 'headphones';
        else if (this.rng.chance(0.07)) type = 'boxer';
        this.spawn(type, gx + Math.cos(a) * r, gz + Math.sin(a) * r, {
          anchor: { x: gx, z: gz, r: 14 }, groupId: gi,
        });
      }
    });
    if (this.level.countryId === 'MOON') {
      for (const [x, z] of [[74, 76], [-90, -82], [18, -146]]) {
        this.spawn('moonbrute', x, z, { anchor: { x, z, r: 12 }, groupId: 90 });
      }
    }
    // 🤖 рівно 3 зомбі-роботи на рівень (де дозволено), рознесені по карті
    if (this._allowRobot) {
      for (const [rx, rz] of [[56, -44], [-44, 56], [24, 80]]) {
        this.spawn('robot', rx, rz, { anchor: { x: rx, z: rz, r: 16 }, groupId: 1 });
      }
    }
    // охорона місій
    const guardSets = [
      { site: this.L.rescue, types: ['tank', 'runner', 'walker', 'walker', 'walker', 'walker'], gid: 100 },
      { site: this.L.tower, types: ['tank', 'runner', 'runner', 'walker', 'walker', 'walker', 'walker'], gid: 101 },
      { site: this.L.warehouse, types: ['tank', 'tank', 'runner', 'runner', 'walker', 'walker', 'walker', 'walker', 'walker'], gid: 102 },
    ];
    if (this.extraZombie) {
      // у зимовій країні частина охорони — сніговики
      guardSets[0].types[3] = this.extraZombie;
      guardSets[1].types[4] = this.extraZombie;
      guardSets[1].types[5] = this.extraZombie;
      guardSets[2].types[6] = this.extraZombie;
      guardSets[2].types[7] = this.extraZombie;
    }
    if (density >= 1.2) {
      // щільніші карти — більша охорона
      guardSets[0].types.push('walker');
      guardSets[1].types.push('walker');
      guardSets[2].types.push('runner');
    }
    // 🛡 щитоносці охороняють місії (кількість залежить від країни)
    const shieldN = (this.level.country && this.level.country.shieldGuards) || 0;
    for (let i = 0; i < shieldN; i++) {
      guardSets[i % guardSets.length].types.push('shield');
    }
    // 🦾 у складних країнах склад охороняють броньовики
    if (this.diff.hp >= 1.5) {
      guardSets[2].types.push('ironclad');
      guardSets[1].types.push('ironclad');
    }
    for (const gs of guardSets) {
      gs.types.forEach((type, i) => {
        const a = (i / gs.types.length) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
        const r = this.rng.range(5, gs.site.r - 2);
        const x = gs.site.x + Math.cos(a) * r;
        const z = gs.site.z + Math.sin(a) * r;
        this.spawn(type, x, z, {
          anchor: { x: gs.site.x, z: gs.site.z, r: gs.site.r },
          guard: true, groupId: gs.gid,
          zone: gs.site === this.L.warehouse ? 'warehouse' : null,
        });
      });
    }
    // 🏆 золотий зомбі-втікач
    if (this.level.country && this.level.country.map.fun && this.level.country.map.fun.goldenZombie) {
      this.spawnGolden();
    }
  }

  // ambient=false: золотий на мапі (populate) — роумить біля околиці, поки не вб'ють (без TTL).
  // ambient=true: v287-подія — спавн 30–60м ВІД ГРАВЦЯ + TTL 25с, щоб «дожени — гарантована скриня!»
  // була чесною обіцянкою (80–150м від центру були недосяжні за 12с).
  spawnGolden(ambient = false) {
    // v302: два майже однакові цикли пошуку точки злиті в один хелпер (null-guard на
    // будівлі місій тепер усюди — це safety, не зміна поведінки). Амбієнтний спавнить
    // навколо гравця в кільці 30–60 з клампом до меж; мапний — навколо центру 80–150.
    const { x, z } = ambient
      ? this._goldenSpawnPoint(this.level.player.pos.x, this.level.player.pos.z, 30, 60, true)
      : this._goldenSpawnPoint(0, 0, 80, 150, false);
    const z_ = this.spawn('walker', x, z, { golden: true, ambientGolden: ambient });
    this.setConfiguredHp(z_, 80);
    z_.anchor = { x, z, r: 30 };
    return z_;
  }

  // 👑 v302: 20 спроб знайти точку спавну золотого в кільці [rMin,rMax] навколо (cx,cz),
  // що не накладається на будівлі місій. clampBound — тримати точку в межах карти (амбієнт).
  _goldenSpawnPoint(cx, cz, rMin, rMax, clampBound) {
    let x = cx, z = cz;
    for (let tries = 0; tries < 20; tries++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(rMin, rMax);
      x = cx + Math.cos(a) * r;
      z = cz + Math.sin(a) * r;
      if (clampBound) {
        const dB = Math.hypot(x, z);
        if (dB > this.L.BOUND - 6) { x *= (this.L.BOUND - 8) / dB; z *= (this.L.BOUND - 8) / dB; }
      }
      let ok = true;
      for (const key of ['rescue', 'tower', 'warehouse', 'arena']) {
        const s = this.L[key];
        if (s && Math.hypot(x - s.x, z - s.z) < s.r + 12) { ok = false; break; }
      }
      if (ok) break;
    }
    return { x, z };
  }

  // 👹 Елітна хвиля (v287, solo-only): 2–4 еліти навколо гравця (золотий виключений —
  // він амбієнтний). Не позначаємо horde:true (щоб не плутати лічильник орди) — трек окремо.
  // По зачистці всіх еліт падає скриня на позиції останнього (подія eliteWaveCleared).
  spawnEliteWave(n) {
    // v296: у коопі елітну хвилю спавнить ХОСТ (authority); гість бачить еліт-puppet'ів
    // через onZombieSpawn (zs з прапором o.e). Гість сам ніколи не спавнить хвилю.
    if (this.level.net && !this.level.net.authority) return [];
    const player = this.level.player;
    let count = Math.max(2, Math.min(4, n || (2 + Math.floor(this.rng.next() * 3))));
    // 🕊️ R3 невидиме милосердя: −1 еліт у хвилі (мін. 1) після 2+ смертей поспіль
    if (this.level.mercy) count = Math.max(1, count - this.level.mercy.eliteMinus);
    const types = ['shield', 'splitter', 'exploder'];
    const list = [];
    for (let i = 0; i < count; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(30, 44);
      let x = player.pos.x + Math.cos(a) * r;
      let z = player.pos.z + Math.sin(a) * r;
      const dB = Math.hypot(x, z);
      if (dB > this.L.BOUND - 6) { x *= (this.L.BOUND - 8) / dB; z *= (this.L.BOUND - 8) / dB; }
      const type = types[Math.floor(this.rng.next() * types.length)];
      const z_ = this.spawn(type, x, z, { elite: true });
      z_.aggroed = true;
      z_.state = 'chase';
      z_.eliteWave = true;
      list.push(z_);
    }
    this._eliteWave = { list, done: false, lastAlive: list[list.length - 1] };
    this.level.bus.emit('eliteWaveStart', count);
    return list;
  }

  // Скриня по зачистці елітної хвилі — на позиції останнього живого еліта.
  _updateEliteWave() {
    const ew = this._eliteWave;
    if (!ew || ew.done) return;
    // v301: хвилю «зачистив» переможний sweep після боса — без скрині («здача» не рахується)
    if (this.level.bossDefeated) { ew.done = true; return; }
    const alive = ew.list.filter((z) => z.state !== 'dead' && !z.gone);
    if (alive.length > 0) { ew.lastAlive = alive[alive.length - 1]; return; }
    ew.done = true;
    const last = ew.lastAlive || ew.list[ew.list.length - 1];
    const pos = last ? { x: last.x, z: last.z, y: last.y } : { x: this.level.player.pos.x, z: this.level.player.pos.z, y: 0 };
    this.level.bus.emit('eliteWaveCleared', pos);
  }

  // 👑 Амбієнтний золотий (v287): рідкісний, ~1 раз/рівень. Лише соло-кампанія (не кімнатні
  // режими, не карти, де золотий уже спавниться в populate) — щоб не було двох на рівень.
  _updateAmbientGolden(dt) {
    const level = this.level;
    if (level.net) return;
    if (level.knockout || level.defense || level.pvp || level.bank || level.portal
      || level.maze || level.humans || level.soulCollector || level.turretwar
      || level.radiation || level.worldBoss || level.bossRush || level.storm) return;
    const mapGolden = level.country && level.country.map && level.country.map.fun && level.country.map.fun.goldenZombie;
    if (mapGolden) return; // такі карти вже мають золотого з populate()
    if (this._ambientGoldenDone) return;
    if (this._ambientGoldenT === undefined) this._ambientGoldenT = this.rng.range(45, 90);
    this._ambientGoldenT -= dt;
    if (this._ambientGoldenT <= 0) {
      this._ambientGoldenDone = true;
      this.spawnGolden(true);
      level.bus.emit('toast', t('✨ Десь блукає ЗОЛОТИЙ зомбі! Дожени — гарантована скриня!'));
    }
  }

  countAliveInZone(zone) {
    return this.list.filter((z) => z.zone === zone && z.state !== 'dead').length;
  }

  clearNear(x, z, r) {
    for (const zb of this.list) {
      // босів і охоронців місій не чіпаємо — лічильники зон мають лишатись чесними
      if (zb.type === 'boss' || zb.zone || zb.state === 'dead') continue;
      if (Math.hypot(zb.x - x, zb.z - z) < r) {
        zb.gone = true;
        if (zb.horde) this.hordeRemaining--;
        this.scene.remove(zb.rig.group);
        disposeRigSkeleton(zb.rig); // звільняємо per-клон boneTexture (геометрія/матеріал спільні — не чіпаємо)
        this.byNidMap.delete(zb.nid);
        this.level.netEv('zg', zb.nid);
      }
    }
    this.list = this.list.filter((zb) => !zb.gone);
  }

  startHorde(count) {
    // акумулюємо: орди можуть накладатись
    if (!this.hordeActive) this.hordeSpawnT = 0.5;
    this.hordeActive = true;
    this.hordeRemaining = Math.max(0, this.hordeRemaining) + count;
    this.hordePending += count;
    this._hordeIdleT = 0; // скидаємо таймер простою при старті нової орди
    this._hordePrevAlive = undefined;
  }

  // сплячий зомбі-сюрприз у будинку: прокидається, коли гравець поруч
  spawnSurprise(x, z) {
    const type = this.extraZombie && this.rng.chance(0.4) ? this.extraZombie : 'walker';
    const z_ = this.spawn(type, x, z, { sleeping: true });
    z_.anchor = { x, z, r: 2 };
    // стоїть на підлозі будинку, а не на терені під нею
    z_.y = Math.max(this.world.groundH(x, z), this.world.floorAt(x, z, 99));
    z_.rig.group.position.y = z_.y;
    setAnim(z_.rig, 'idle');
    return z_;
  }

  spawnBoss(hp = null) {
    const { x, z } = this.L.arena;
    const cfg = (this.level.country && this.level.country.boss) || { hp: 1300, frost: false };
    const style = cfg.style || (cfg.frost ? 'frost' : 'king');
    const b = this.spawn('boss', x, z - 6, { horde: false, style });
    // 🤝 кооп: бос міцніший пропорційно команді (×N гравців)
    // ⭐ зірки (M7): бос масштабується м'якше (×0.5/зірка), щоб не став «губкою для куль»; на ★1 — ×1.
    const _bs = this.diffStar > 1 ? (1 + 0.5 * (this.diffStar - 1)) : 1;
    const bossHp = this.hpWithSettings(cfg.hp * this.coopMul() * _bs, { boss: true });
    b.maxHp = bossHp;
    b.hp = hp !== null ? Math.min(bossHp, Math.max(150, hp)) : bossHp;
    b.stats = { ...b.stats, hp: bossHp };
    // 🔁 відновлення боса (після смерті гравця): не повторюємо вже пройдені хвилі призову.
    // Свіжий бос на повному HP (frac=100) лишає всі пороги невзятими — хвилі підуть штатно.
    const frac0 = (b.hp / b.maxHp) * 100;
    for (const thr of [75, 50, 25]) if (frac0 <= thr) b.summonedAt[thr] = true;
    b.aggroed = true;
    b.state = 'chase';
    return b;
  }

  despawnBoss() {
    const b = this.boss;
    if (!b) return null;
    const hpLeft = b.hp;
    b.gone = true;
    this.scene.remove(b.rig.group);
    disposeObject(b.rig.group); // бос — свіжий ріг (makeBoss, не cloneRig): геометрія per-instance, безпечно
    this.byNidMap.delete(b.nid);
    this.level.netEv('zg', b.nid);
    this.list = this.list.filter((zb) => zb !== b);
    this.boss = null;
    return hpLeft;
  }

  // промінь проти всіх живих зомбі — повертає найближче влучання
  hitTest(origin, dir, maxD) {
    let best = null;
    for (const z of this.list) {
      if (z.state === 'dead') continue;
      const approxD = Math.hypot(z.x - origin.x, z.z - origin.z);
      if (approxD - 3 > maxD || (best && approxD - 3 > best.t)) continue;
      const r = z.rig.radius;
      const h = z.rig.height;
      this._p0.set(z.x, z.y + r * 0.7, z.z);
      this._p1.set(z.x, z.y + h - r * 0.5, z.z);
      const res = closestRaySeg(origin, dir, this._p0, this._p1);
      if (res.dist < r && res.t > 0.3 && res.t < maxD && (!best || res.t < best.t)) {
        const point = origin.clone().addScaledVector(dir, res.t);
        const heightT = clamp((point.y - z.y) / h, 0, 1);
        const yaw = z.rig.group.rotation.y;
        const lateral = Math.abs((point.x - z.x) * Math.cos(yaw) - (point.z - z.z) * Math.sin(yaw));
        const hitZone = heightT >= 0.74 ? 'head'
          : heightT <= 0.32 ? 'legs'
            : lateral > r * 0.42 ? 'arms' : 'body';
        best = {
          zombie: z, t: res.t, point, hitZone,
          headshot: hitZone === 'head',
          impactSide: impactSide(z, dir),
        };
      }
    }
    return best;
  }

  // opts.fire — урон вогнем (вогнемет, v46). У ЦЬОМУ релізі поведінка щита незмінна:
  // вогонь руйнує звичайний щит, як будь-яка інша шкода. Прапорець — гак для v47
  // (щити, стійкі до вогню): тоді перевірятимемо z.shieldFireproof && opts.fire тут.
  _damage(z, amt, dir, headshot, opts) {
    if (z.state === 'dead') return;
    if (z.type === 'robot') this.level.bus.emit('robotMet'); // 🎓 перша зустріч з роботом → разовий банер
    if (z.elite) this.level.bus.emit('eliteMet'); // 🎓 перший елітний зомбі → разова підказка
    const fire = !!(opts && opts.fire);
    const hitZone = (opts && opts.hitZone) || (headshot ? 'head' : 'body');
    const side = (opts && opts.impactSide) || impactSide(z, dir);
    if (z.worldBossShield) amt *= 0.25;
    if (z.worldBossCoreClosed) amt *= 0.35;
    if (z.worldBossCoreOpen) amt *= 1.4;
    // 🛡 щит: фронтальні влучання та вибухи приймає на себе щит
    if (z.shieldHp > 0) {
      const fx = -Math.sin(z.rig.group.rotation.y);
      const fz = -Math.cos(z.rig.group.rotation.y);
      // dir — напрямок пострілу (від гравця до зомбі); null (вибух) — теж у щит.
      // поріг -0.45 (раніше -0.15): вужчий фронтальний конус → дитині легше зайти збоку.
      const onShield = !dir || (dir.x * fx + dir.z * fz) < -0.45;
      if (onShield) {
        // 🔥 v47-гак: анти-вогонь щит ІГНОРУЄ урон вогнеметом — гравець мусить обійти збоку.
        // Звичайний щит вогонь руйнує, як будь-яка інша шкода.
        if (z.shieldFireproof && fire) {
          // короткий «шиплячий» візуал — дитина бачить, що вогонь не бере
          const fxp = new THREE.Vector3(z.x - Math.sin(z.rig.group.rotation.y) * 0.75, z.y + 1.15, z.z - Math.cos(z.rig.group.rotation.y) * 0.75);
          this.level.effects.burst(fxp, 0x6aa9ff, 3, { speed: 2.0, up: 1.2, life: 0.25, size: 0.5 });
          if (!this._fireShieldHintShown) {
            this._fireShieldHintShown = true;
            this.level.bus.emit('toast', t('🔵 Цей щит не горить! Вогнемет не бере — обійди збоку!'));
          }
          this._aggro(z); // вогонь не шкодить, та зомбі все одно помічає гравця (як і всі інші гілки)
          return; // урон вогнем по анти-вогонь щиту — поглинається без шкоди щиту
        }
        z.shieldFire = z.shieldFire || fire; // маркер: щит уже отримував вогняний урон
        const dealt = Math.min(amt, z.shieldHp);
        z.shieldHp -= amt;
        if (dealt > 0) this.level.bus.emit('zombieDamaged', dealt, z);
        this._aggro(z);
        for (const o of this.list) {
          if (o.groupId === z.groupId && o.groupId >= 0 && o.state !== 'dead'
            && Math.hypot(o.x - z.x, o.z - z.z) < 13) this._aggro(o);
        }
        const level = this.level;
        // перша зустріч зі щитом — підказуємо механіку одразу
        if (!this._shieldHintShown) {
          this._shieldHintShown = true;
          level.bus.emit('toast', t('🛡 Ого, щит! Розстріляй його (дивись на тріщини) або обійди ззаду!'));
        }
        const sparkPos = new THREE.Vector3(z.x + fx * 0.75, z.y + 1.15, z.z + fz * 0.75);
        if (z.shieldHp > 0) {
          // тріщини проступають у міру пошкоджень (3 стадії)
          z.shieldObj.cracks1.visible = z.shieldHp <= z.shieldMax * 0.75;
          z.shieldObj.cracks2.visible = z.shieldHp <= z.shieldMax * 0.5;
          if (z.shieldObj.cracks3) z.shieldObj.cracks3.visible = z.shieldHp <= z.shieldMax * 0.25;
          level.effects.burst(sparkPos, 0xc9d4e2, 4, { speed: 2.6, up: 1.5, life: 0.3, size: 0.7 });
          level.audio.clang();
        } else {
          // 💥 щит зламано! (тіло лишається цілим — далі добивай уже беззахисного — навмисний 2-крок)
          z.shieldHp = 0;
          z.rig.body.remove(z.shieldObj.group);
          z.shieldObj = null;
          // 🧙 чарівник: щит зламано → ре-каст через ~5с; 🤖 робот → новий щит-гаджет через ~8с
          if (z.type === 'wizard') z.shieldRecastCd = 5;
          else if (z.type === 'robot') z.shieldRecastCd = z.pvpShieldCd || 8;
          level.effects.burst(sparkPos, 0x7d8aa0, 14, { speed: 4.5, up: 4, life: 0.7, size: 1.3 });
          level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xc9d4e2, 2.5);
          level.audio.shieldBreak();
          level.bus.emit('shieldBroken', z);
          level.netEv('zsb', z.nid);
        }
        return;
      }
    }
    // 🛡️ Нагрудник ловить body-shot, шолом castleKnight — headshot.
    const armorKind = headshot ? 'helmet' : 'chest';
    const armorHpKey = `${armorKind}Hp`;
    const armorObjKey = `${armorKind}Obj`;
    if (z[armorHpKey] > 0) {
      const dealt = Math.min(amt, z[armorHpKey]);
      z[armorHpKey] -= amt;
      if (dealt > 0) this.level.bus.emit('zombieDamaged', dealt, z);
      this._aggro(z);
      for (const o of this.list) {
        if (o.groupId === z.groupId && o.groupId >= 0 && o.state !== 'dead'
          && Math.hypot(o.x - z.x, o.z - z.z) < 13) this._aggro(o);
      }
      const level = this.level;
      if (armorKind === 'chest' && z.type === 'ironclad' && !this._ironHintShown) {
        this._ironHintShown = true;
        level.bus.emit('toast', t('🦾 Броньовик! Нагрудник не проб\'єш — цілься в ГОЛОВУ!'));
      }
      const sparkPos = new THREE.Vector3(z.x, z.y + (headshot ? z.rig.height * 0.82 : 1.2), z.z);
      if (z[armorHpKey] > 0) {
        if (armorKind === 'chest' && z.chestCracks1) z.chestCracks1.visible = z.chestHp <= z.chestMax * 0.6;
        if (armorKind === 'chest' && z.chestCracks2) z.chestCracks2.visible = z.chestHp <= z.chestMax * 0.3;
        level.effects.burst(sparkPos, 0xc9d4e2, 3, { speed: 2.4, up: 1.4, life: 0.3, size: 0.65 });
        level.audio.clang();
      } else {
        // Броню знято, тіло лишається цілим — наступний постріл уже шкодить HP.
        z[armorHpKey] = 0;
        if (z[armorObjKey]) z[armorObjKey].visible = false;
        if (armorKind === 'chest' && z.chestCracks1) z.chestCracks1.visible = false;
        if (armorKind === 'chest' && z.chestCracks2) z.chestCracks2.visible = false;
        level.effects.burst(sparkPos, 0x7d8aa0, 12, { speed: 4, up: 3.5, life: 0.7, size: 1.2 });
        level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xc9d4e2, 2.2);
        level.audio.shieldBreak();
        level.bus.emit(armorKind === 'helmet' ? 'helmetBroken' : 'chestBroken', z);
        if (armorKind === 'chest') level.netEv('zcb', z.nid);
      }
      return;
    }
    const dealt = Math.min(amt, z.hp);
    z.hp -= amt;
    if (dealt > 0) this.level.bus.emit('zombieDamaged', dealt, z);
    // 💥 постріл ФІЗИЧНО відчутний: здригання + нокбек у напрямку пострілу.
    // ВАЖЛИВО: лазер/вогнемет/калюжі б'ють ЩОКАДРУ дрібним amt — такі тіки НЕ дають
    // ні flinch, ні нокбек (інакше зомбі здуває через мапу і морозить у позі). Поріг amt.
    if (amt >= 5) {
      z.rig.anim.flinchT = 0.18;
      z.rig.anim.flinchSide = side;
      z.lastImpactSide = side;
    }
    if (z.type !== 'boss') {
      if (hitZone === 'legs' && amt >= 3) {
        z.slowT = Math.max(z.slowT || 0, 1);
        z.slowMul = Math.min(z.slowMul || 1, 0.8);
      }
      const force = Number(opts && opts.impactForce) || 0;
      const staggerTime = Number(opts && opts.staggerTime) || (force >= 2.5 ? 0.22 : 0);
      const armInterrupt = hitZone === 'arms' && (amt >= 15 || force >= 1);
      if (armInterrupt) z.attackLockT = Math.max(z.attackLockT || 0, 0.35);
      if (!(z.stats && z.stats.stunImmune) && (staggerTime > 0 || armInterrupt)) {
        z.staggerT = Math.max(z.staggerT || 0, staggerTime || 0.18);
        z.state = 'stagger';
        z.throwProj = false;
        z.didHit = true;
        z.rig.anim.staggerSide = side;
        setAnim(z.rig, 'stagger');
      }
    }
    if (dir && z.type !== 'boss' && amt >= 3) {
      // важкі майже не зсуваються, дрібнота відлітає далі
      const mass = (z.type === 'tank' || z.type === 'robot' || z.type === 'ironclad') ? 0.3
        : z.type === 'imp' ? 1.7 : 1;
      const requested = Number(opts && opts.impactForce) || 0;
      // стеля 45: зброя дає щонайбільше 8, запас — для Зоряної сили Бастіона (7 м × 6)
      const kb = (requested > 0 ? Math.min(45, requested) : Math.min(3.5, amt * 0.04)) * mass;
      z.kbX = (z.kbX || 0) + dir.x * kb;
      z.kbZ = (z.kbZ || 0) + dir.z * kb;
    }
    this._aggro(z);
    // розбудити сусідів по групі (тільки поблизу — не весь склад одразу)
    for (const o of this.list) {
      if (o.groupId === z.groupId && o.groupId >= 0 && o.state !== 'dead'
        && Math.hypot(o.x - z.x, o.z - z.z) < 13) this._aggro(o);
    }
    if (z.hp <= 0) {
      // 💥 підривник: постріл до детонації підриває його НА МІСЦІ (безпечно, якщо гравець далеко)
      if (z.type === 'exploder' && !z.exploded) { this._explode(z, dir); return; }
      // 🪬 шаман воскресає один раз — перша «смерть» його не вбиває
      if (z.type === 'shaman' && !z.revivedOnce) { this._reviveShaman(z); return; }
      this._kill(z, dir);
    }
  }

  // 💥 Вибух підривника (v287): мультяшний бабах — шкода гравцю в радіусі, добиває сусідніх зомбі.
  // Викликається або при детонації телеграфу (update), або коли підривника застрелили (_damage).
  // Kid-safe: яскравий спалах, без крові. Host/solo рахує шкоду; гостю реплікуємо ВІЗУАЛ через 'bm'.
  _explode(z, dir) {
    if (z.exploded) return;
    z.exploded = true;
    const level = this.level;
    const R = EXPLODER_RADIUS;
    const boomPos = new THREE.Vector3(z.x, z.y + 0.9, z.z);
    // мультяшний спалах: помаранчево-жовтий бурст + кільце ударної хвилі (без металевого диму робота)
    level.effects.burst(boomPos, 0xffcf3a, 22, { speed: 7, up: 6, life: 0.8, size: 1.9 });
    level.effects.burst(boomPos, 0xff7a2a, 16, { speed: 6, up: 5, life: 0.7, size: 1.6 });
    level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xff6a2a, R + 0.5);
    level.audio.explosion();
    if (!level.net || level.net.authority) {
      const pls = level.players
        || [{ pid: 1, pos: level.player.pos, get health() { return level.player.health; } }];
      for (const pl of pls) {
        if (pl.health <= 0) continue;
        if (Math.hypot(pl.pos.x - z.x, pl.pos.z - z.z) <= R) this._hurt(pl, EXPLODER_DMG, z.x, z.z, 0, z.y);
      }
      // 🎯 винагорода за кайтинг: вибух добиває інших зомбі поряд (не рекурсивно — direct hp)
      // копія списку: _kill розділювача пушить міні-зомбі просто в this.list, і без копії
      // ітератор побачив би новонароджених та відразу спалив би їх тими самими 120
      for (const o of this.list.slice()) {
        if (o === z || o.state === 'dead' || o.gone) continue;
        if (Math.hypot(o.x - z.x, o.z - z.z) > R) continue;
        if (o.type === 'exploder' && !o.exploded) { this._explode(o, null); continue; } // ланцюг
        const before = o.hp;
        o.hp -= 120;
        if (before > 0) this.level.bus.emit('zombieDamaged', Math.min(before, 120), o);
        if (o.hp <= 0) {
          if (o.type === 'shaman' && !o.revivedOnce) this._reviveShaman(o);
          else this._kill(o, null);
        }
      }
      // реплікація ВІЗУАЛУ гостям наявним каналом 'bm' (client.netExplosion)
      level.netEv('bm', Math.round(boomPos.x * 10) / 10, Math.round(boomPos.y * 10) / 10,
        Math.round(boomPos.z * 10) / 10, R, 0, 0);
    }
    this._kill(z, dir); // сам підривник гине (лут/лічильники — штатно)
  }

  _aggro(z) {
    if (z.state === 'dead' || z.aggroed) return;
    if (z.golden) { z.state = 'flee'; return; } // золотий не нападає — тікає
    z.sleeping = false;
    z.aggroed = true;
    if (z.state === 'wander' || z.state === 'investigate') z.state = 'chase';
    const p = this.level.player;
    const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
    if (d < 42) this.level.audio.shriek(1 - clamp(d / 42, 0, 0.85), z.stats.pitch);
  }

  hearShot(x, zPos, radius) {
    const r2 = radius * radius;
    for (const zombie of this.list) {
      if (zombie.state === 'dead' || zombie.aggroed) continue;
      const dx = zombie.x - x, dz = zombie.z - zPos;
      if (dx * dx + dz * dz > r2) continue;
      zombie.sleeping = false;
      zombie.state = 'investigate';
      zombie.investigateX = x;
      zombie.investigateZ = zPos;
      zombie.investigateT = 4;
    }
  }

  // 🪬 шаман воскресає (перша смерть): повне hp + зелено-золотий спалах; добий ще раз
  _reviveShaman(z) {
    z.revivedOnce = true;
    z.hp = z.maxHp;
    const level = this.level;
    level.effects.totemBurst(new THREE.Vector3(z.x, z.y + 1.2, z.z));
    level.audio.powerup();
    level.netEv('zrev', z.nid); // кооп: спалах воскресіння у гостя
    if (!this._shamanHintShown) {
      this._shamanHintShown = true;
      level.bus.emit('toast', t('🪬 Шаман воскрес! Добий ще раз!'));
    }
  }

  _kill(z, dir) {
    // гард від подвійної смерті: ланцюг підривників може дійти до того самого зомбі двічі,
    // а лут, kills, 'zd' і zombieKilled мають нарахуватись рівно один раз
    if (z.state === 'dead' || z.gone) return;
    z.state = 'dead';
    z.deadT = 0;
    z.rig.anim.deathSide = z.lastImpactSide || impactSide(z, dir);
    setAnim(z.rig, 'die');
    // фінальний удар збиває з ніг: труп ковзає від пострілу (ковзання у dead-блоці update)
    if (dir && z.type !== 'boss') {
      z.kbX = (z.kbX || 0) + dir.x * 2.6;
      z.kbZ = (z.kbZ || 0) + dir.z * 2.6;
    }
    const level = this.level;
    const distV = Math.hypot(z.x - level.player.pos.x, z.z - level.player.pos.z);
    level.audio.zdie(1 - clamp(distV / 50, 0, 0.9));
    if (z.type !== 'boss') level.audio.killPop(1 - clamp(distV / 40, 0, 0.9)); // 🎈 мультяшний «поп»
    // у коопі особиста статистика рахує лише власні перемоги
    if (!level.net || (z.lastHitBy || 1) === 1) level.stats.kills++;
    level.netEv('zd', z.nid, z.lastHitBy || 1, z.golden ? 1 : 0);
    level.bus.emit('zombieKilled', z);
    // лут
    if (z.type !== 'boss') {
      const coins = z.stats.coins;
      const n = z.type === 'tank' || z.type === 'shield' || z.type === 'wizard' ? 3 : z.type === 'runner' ? 2 : 1;
      if (!level.noCoinDrops) {
        for (let i = 0; i < n; i++) {
          level.effects.spawnCoin(z.x + this.rng.range(-0.6, 0.6), z.z + this.rng.range(-0.6, 0.6), Math.ceil(coins / n));
        }
      }
      if (!level.noZombiePickups) {
        if (this.boss) {
          // під час бою з босом міньйони гарантовано дають патрони
          level.effects.spawnPickup(z.x - 1, z.z, 'ammo');
        } else if (this.rng.chance(0.07 * (level.mercy ? level.mercy.medkitMult : 1))) level.effects.spawnPickup(z.x + 1, z.z, 'medkit'); // 🕊️ R3 милосердя: +50% аптечок
        else if (this.rng.chance(0.13)) level.effects.spawnPickup(z.x - 1, z.z, 'ammo');
        else if (this.rng.chance(0.02)) {
          // рідкісний сюрприз: тимчасове підсилення
          level.effects.spawnPickup(z.x + 1, z.z, this.rng.pick(['speed', 'rage', 'bubble', 'magnet']));
        }
        // 🪬 шаман на остаточній смерті: 15% лишає тотем безсмертя
        if (z.type === 'shaman' && this.rng.chance(0.15)) level.effects.spawnPickup(z.x, z.z, 'totem');
      }
    }
    // 🤖💥 зомбі-робот: при смерті ВИБУХАЄ й б'є гравців по площі (радіус 6м, 157 шкоди)
    if (z.type === 'robot') {
      const boomPos = new THREE.Vector3(z.x, z.y + 1.0, z.z);
      level.effects.robotBoom(boomPos); // великий вибуховий візуал (локально у всіх)
      if (!level.net || level.net.authority) {
        const R = 6;
        const pls = level.players
          || [{ pid: 1, pos: level.player.pos, get health() { return level.player.health; } }];
        for (const pl of pls) {
          if (pl.health <= 0) continue;
          if (Math.hypot(pl.pos.x - z.x, pl.pos.z - z.z) <= R) this._hurt(pl, 157, z.x, z.z, 0, z.y);
        }
        // реплікація ВІЗУАЛУ гостям наявним каналом 'bm' → client.netExplosion()
        level.netEv('bm', Math.round(boomPos.x * 10) / 10, Math.round(boomPos.y * 10) / 10,
          Math.round(boomPos.z * 10) / 10, R, 0, 0);
      }
    }
    if (z.horde) this.hordeRemaining--;
    // 🪓 розділювач: по смерті розпадається на 2 міні-зомбі (швидкі, слабкі; рахуються як звичайні).
    // Не для самих міні; у коопі — лише authority (реплікація через onZombieSpawn у spawn()).
    if (z.type === 'splitter' && !z.mini && (!level.net || level.net.authority)) {
      level.effects.burst(new THREE.Vector3(z.x, z.y + 1.0, z.z), 0x7be07b, 12, { speed: 4, up: 3, life: 0.5, size: 1.1 });
      for (let i = 0; i < 2; i++) {
        const a = (i ? 1 : -1) * 0.9 + this.rng.range(-0.3, 0.3);
        const mx = z.x + Math.cos(a) * 1.0, mz = z.z + Math.sin(a) * 1.0;
        const mn = this.spawn('runner', mx, mz, { mini: true });
        mn.aggroed = true;
        mn.state = 'chase';
        mn.anchor = { x: mx, z: mz, r: 12 };
      }
    }
    // v301: «здача» після перемоги (переможний sweep у _onBossDied) — НЕ впольований
    // золотий: без джинглу і без скрині, інакше кожна перемога на карті з золотим дарує
    // халявну скриню всім (у коопі — через gch), а церемонія лізе поверх салюту.
    if (z.golden && !level.bossDefeated) {
      level.audio.goldenJingle(false);
      // 👑 v287: у СОЛО золотий дарує скриню-церемонію (гарантована).
      // 👑 v296 «Еліти разом»: у коопі золоту скриню отримує КОЖЕН гравець локально
      // (ті самі числа, що соло), неблокуючим банером. Хост нараховує собі і шле `gch`.
      // Гілку виконує лише authority (у гостя смерть зомбі — через puppetDie).
      if (!level.net || level.net.authority) {
        level.bus.emit('goldenChest', { x: z.x, z: z.z, y: z.y });
      }
    }
    if (z.type === 'boss') {
      this.boss = null;
      // фонтан монет за боса
      if (!z.worldBoss && !level.noCoinDrops) {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          level.effects.spawnCoin(z.x + Math.cos(a) * this.rng.range(1, 4), z.z + Math.sin(a) * this.rng.range(1, 4), 25);
        }
      }
      level.bus.emit('bossDied', z);
    }
  }

  // Перебудовує бакет-сітку зомбі (раз/кадр). Лише живі — сепарація однаково пропускає мертвих.
  _buildSepGrid() {
    const g = this._sepGrid;
    g.clear();
    for (const z of this.list) {
      if (z.state === 'dead' || z.gone) continue;
      const key = SKEY(Math.floor(z.x / SEP_CELL), Math.floor(z.z / SEP_CELL));
      let bucket = g.get(key);
      if (!bucket) { bucket = []; g.set(key, bucket); }
      bucket.push(z);
    }
  }

  update(dt) {
    // 👻 привиди (Ікс-рей) + 🔥 візуал горіння вампіра — ДО mirror-гарду, щоб їх бачив і ГІСТЬ.
    this._updateGhostXray(dt);
    this._updateVampireBurnFx(dt);
    if (this.mirror) { this._updateMirror(dt); return; }
    const level = this.level;
    const player = level.player;
    // у коопі зомбі полюють на НАЙБЛИЖЧОГО живого гравця (хост або гості)
    const players = level.players
      || (this._soloPlayers || (this._soloPlayers = [{
        pid: 1,
        get pos() { return player.pos; },
        get health() { return player.health; },
        get invisibleT() { return player.invisibleT || 0; },
      }]));
    const clones = (level.gadgets && level.gadgets.clones) || [];
    const targets = clones.length
      ? players.concat(clones.filter((c) => c.hp > 0).map((c) => ({
        clone: c,
        get pos() { return { x: c.x, y: c.y, z: c.z }; },
        get health() { return c.hp; },
      })))
      : players;
    // Three melee attackers in solo; one extra slot per additional co-op player.
    // Map keys are the stable player/clone/zombie objects already used as targets.
    const meleeSlots = new Map();
    const meleeSlotLimit = 2 + Math.max(1, players.reduce((n, p) => n + (p.health > 0 ? 1 : 0), 0));

    // спавн орди хвилями
    this._updateHordeWaves(dt, players, player);
    // 👹 елітна хвиля: скриня по зачистці; 👑 амбієнтний золотий (обидва solo-only)
    this._updateEliteWave();
    this._updateAmbientGolden(dt);

    // 🧛 нічний спавнер вампірів + 🔥 урон горіння на сонці — обидва host/solo-only (вже ПІСЛЯ mirror-гарду).
    this._spawnNightVampires(dt, players);
    this._burnVampiresInSun(dt);

    // 🧲 будуємо бакет-сітку зомбі раз/кадр — далі сепарація питає лише сусідні комірки
    this._buildSepGrid();

    let removeAny = false;
    for (const z of this.list) {
      const rig = z.rig;
      // --- мертві ---
      if (z.state === 'dead') {
        z.deadT += dt;
        // оновлюємо повний риг лише поки програється сама die-анімація (~0.85с);
        // далі поза вже статична — заморожуємо її й не тратимо CPU на риг трупа
        if (rig.anim.dieT < 1) updateRig(rig, dt);
        // труп ковзає від нокбека («збило з ніг») — але не крізь стіни
        if (z.kbX || z.kbZ) {
          z.x += z.kbX * dt; z.z += z.kbZ * dt;
          const kf = Math.max(0, 1 - dt * 4);
          z.kbX *= kf; z.kbZ *= kf;
          if (Math.abs(z.kbX) + Math.abs(z.kbZ) < 0.04) z.kbX = z.kbZ = 0;
          const ds = this.world.collide(z.x, z.z, rig.radius * 0.6);
          z.x = ds.x; z.z = ds.z;
          rig.group.position.x = z.x;
          rig.group.position.z = z.z;
        }
        // занурюємо тіло в землю в останні ~0.7с перед прибиранням — щоб і на тачі
        // (короткий TTL 1.6с) труп плавно зникав, а не «вистрибував»
        if (z.deadT > this._corpseTtl - 0.7) rig.group.position.y -= dt * 0.9;
        if (z.deadT > this._corpseTtl) {
          z.gone = true;
          removeAny = true;
          this.scene.remove(rig.group);
          // лише бос: ріг свіжий (makeBoss), геометрія per-instance. Звичайні зомбі
          // клонуються з кешу (cloneRig ділить mg за посиланням) — диспоз зламав би сіблінгів.
          if (z.type === 'boss') disposeObject(rig.group);
          else disposeRigSkeleton(rig); // звичайний зомбі: геометрія/матеріал спільні, але Skeleton/boneTexture — per-клон
          this.byNidMap.delete(z.nid);
        }
        continue;
      }

      // 💫 оглушений: завмирає на місці (ні руху, ні атак), ледь хитається «в зірках»
      if (z.attackLockT > 0) z.attackLockT = Math.max(0, z.attackLockT - dt);
      if (z.stunT > 0) {
        z.stunT -= dt;
        setAnim(rig, 'idle');
        rig.group.rotation.y += Math.sin(z.stunT * 40) * 0.04;
        updateRig(rig, dt);
        continue;
      }

      if (z.confusedT > 0) {
        z.confusedT = Math.max(0, z.confusedT - dt);
        if (z.confusedT === 0) z.confusedDmgBonus = 0;
      }
      let tgt = null;
      let distP = Infinity;
      if (z.confusedT > 0) {
        const enemy = this._nearestConfusedEnemy(z);
        if (enemy) {
          tgt = {
            zombie: enemy,
            get pos() { return { x: enemy.x, y: enemy.y, z: enemy.z }; },
            get health() { return enemy.hp; },
          };
          distP = Math.hypot(enemy.x - z.x, enemy.z - z.z);
        }
      } else {
        for (const pl of targets) {
          if (pl.health <= 0) continue;
          if (!pl.clone && pl.invisibleT > 0) continue;
          const pp = pl.pos;
          if (z.zone === 'castle-dungeon' && pp.y >= this.world.castleDungeon.surfaceY - 1.5) continue;
          // 🎈 напарник-приманка в межах свого радіуса перехоплює увагу зомбі
          const raw = Math.hypot(pp.x - z.x, pp.z - z.z);
          const lure = pl.clone && pl.clone.squad === 'lure' && pl.clone.downT <= 0
            && raw <= SQUAD_LURE_RADIUS;
          const d = lure ? 0 : raw;
          if (d < distP) { distP = d; tgt = pl; }
        }
      }
      const playerAlive = !!tgt;
      const tp = tgt ? tgt.pos : player.pos;
      if (!playerAlive) distP = Math.hypot(tp.x - z.x, tp.z - z.z);
      const dxP = tp.x - z.x, dzP = tp.z - z.z;
      const dyP = Math.abs((tp.y ?? z.y) - z.y);
      const st = z.stats;
      const attackKey = tgt && (tgt.clone || tgt.zombie || tgt);
      const usesMeleeSlot = attackKey && z.type !== 'boss' && !z.ranged;
      if (usesMeleeSlot && z.state === 'attack' && !z.throwProj) {
        meleeSlots.set(attackKey, (meleeSlots.get(attackKey) || 0) + 1);
      }
      let barricadeHit = null;
      if (z.state === 'chase' && !z.ranged && z.stuckT >= 0.8 && this.world.hitTestDestructible && distP > 0.01) {
        this._p0.set(z.x, z.y + z.rig.height * 0.6, z.z);
        this._p1.set(dxP, (tp.y + 1.0) - (z.y + z.rig.height * 0.6), dzP).normalize();
        const hit = this.world.hitTestDestructible(this._p0, this._p1, st.attackR * 1.25);
        if (hit && hit.destructible.type === 'barricade') barricadeHit = hit;
      }
      if (z.rangedCd > 0) z.rangedCd -= dt;

      // 🌙 вночі зомбі помічають здалеку; 🌪️ у піщану бурю — ближче (чесно: і зомбі,
      // і гравець бачать гірше — можна прокрастися або перевести дух)
      const nightAggro = (1 + (level.nightK || 0) * 0.5)
        * (level.sandstorm && level.sandstorm.active ? 0.5 : 1);
      // золотий зомбі: побачив гравця — тікає; амбієнтний зникає за goldenTtl (мапні — ні)
      if (z.golden && z.state !== 'dead') {
        if (z.goldenTtl !== undefined) {
          z.goldenTtl -= dt;
          if (z.goldenTtl <= 0) {
            z.gone = true;
            removeAny = true;
            this.scene.remove(rig.group);
            disposeRigSkeleton(rig);
            this.byNidMap.delete(z.nid);
            level.netEv('zg', z.nid);
            if (!this._goldenGoneHint) {
              this._goldenGoneHint = true;
              level.bus.emit('toast', t('💨 Золотий зомбі втік! Наступного разу дожени швидше!'));
            }
            continue;
          }
        }
        if (playerAlive && distP < 26) {
          z.state = 'flee';
          if (!z._goldenVoice) {
            z._goldenVoice = true;
            level.audio.goldenJingle();
          }
        }
        else if (z.state === 'flee' && distP > 42) z.state = 'wander';
      }

      // сплячий сюрприз: чекає, поки гравець підійде впритул
      if (z.sleeping) {
        if (playerAlive && distP < 4.5) {
          z.sleeping = false;
          this._aggro(z);
          z.state = 'chase';
          level.audio.shriek(1, st.pitch * 1.4);
          level.bus.emit('toast', t('😱 СЮРПРИЗ! У будинку ховався зомбі!'));
        } else {
          updateRig(rig, dt * 0.35); // спить — ледь погойдується
          continue;
        }
      }

      // LOD: далекі неагресивні зомбі майже не оновлюємо
      if (distP > 110 && !z.aggroed) {
        // охоронці, що відійшли, повертаються додому миттєво (поза екраном)
        if (z.guard && Math.hypot(z.x - z.anchor.x, z.z - z.anchor.z) > 10) {
          const a = this.rng.next() * 6.28;
          z.x = z.anchor.x + Math.cos(a) * z.anchor.r * 0.5;
          z.z = z.anchor.z + Math.sin(a) * z.anchor.r * 0.5;
          z.y = z.zone === 'castle-dungeon' ? this.world.dungeonGroundH(z.x, z.z) : this.world.groundH(z.x, z.z);
          rig.group.position.set(z.x, z.y, z.z);
        }
        if (this.rng.chance(0.02)) rig.group.rotation.y += 0.3;
        continue;
      }

      // --- стани ---
      if (z.state === 'stagger') {
        z.staggerT = Math.max(0, (z.staggerT || 0) - dt);
        if (z.staggerT === 0) {
          z.state = 'recover';
          z.recoverT = Math.max(z.recoverT || 0, 0.16);
        }
      } else if (z.state === 'recover') {
        z.recoverT = Math.max(0, (z.recoverT || 0) - dt);
        if (z.recoverT === 0) z.state = z.aggroed ? 'chase' : 'wander';
      } else if (z.state === 'investigate') {
        z.investigateT = Math.max(0, (z.investigateT || 0) - dt);
        if (playerAlive && distP < st.aggro * nightAggro) {
          z.state = 'chase';
          this._aggro(z);
        } else if (z.investigateT === 0 || Math.hypot(z.investigateX - z.x, z.investigateZ - z.z) < 1) {
          z.state = 'wander';
          z.wanderT = 0;
        }
      } else if (z.state === 'approach') {
        if (!playerAlive) {
          z.state = 'wander';
          z.aggroed = z.horde;
        } else if (!usesMeleeSlot || distP > st.attackR * 1.5
          || (meleeSlots.get(attackKey) || 0) < meleeSlotLimit) {
          z.state = 'chase';
        }
      } else if (z.state === 'wander') {
        if (playerAlive && (distP < st.aggro * nightAggro || z.aggroed)) {
          z.state = 'chase';
          this._aggro(z);
          level.audio.zgroan(1 - clamp(distP / 40, 0, 0.8), st.pitch);
        } else {
          z.wanderT -= dt;
          if (z.wanderT <= 0) {
            z.wanderT = this.rng.range(2.5, 6);
            const a = this.rng.next() * 6.28;
            const r = this.rng.next() * z.anchor.r;
            z.wx = z.anchor.x + Math.cos(a) * r;
            z.wz = z.anchor.z + Math.sin(a) * r;
          }
        }
      } else if (z.state === 'chase') {
        if (!playerAlive) {
          z.state = 'wander';
          z.aggroed = z.horde;
        } else if (barricadeHit && !(z.attackLockT > 0)) {
          z.state = 'attack';
          z.attackT = 0;
          z.didHit = false;
          z.throwProj = false;
          z.attackDestructible = barricadeHit;
          setAnim(rig, 'attack');
        } else if (distP < st.attackR && dyP <= 1.4 && z.telegraph <= 0 && z.charging <= 0
          && !(z.attackLockT > 0) && (!usesMeleeSlot || (meleeSlots.get(attackKey) || 0) < meleeSlotLimit)) {
          // мелі тільки з прямою видимістю — крізь стіни бити не можна
          this._p0.set(z.x, z.y + z.rig.height * 0.6, z.z);
          this._p1.set(dxP, (tp.y + 1.0) - (z.y + z.rig.height * 0.6), dzP).normalize();
          const meleeBlock = this.world.shotBlockDist(this._p0, this._p1, distP);
          if (meleeBlock > distP - 0.35) {
            z.state = 'attack';
            z.attackT = 0;
            z.didHit = false;
            z.throwProj = false;
            z.attackDestructible = null;
            setAnim(rig, 'attack');
            if (usesMeleeSlot) meleeSlots.set(attackKey, (meleeSlots.get(attackKey) || 0) + 1);
          }
        } else if (usesMeleeSlot && distP < st.attackR * 1.35 && dyP <= 1.4
          && (meleeSlots.get(attackKey) || 0) >= meleeSlotLimit) {
          z.state = 'approach';
          z.approachLane = HEAVY_TYPES.has(z.type) ? 0
            : z.type === 'runner' ? (z.avoidSide || 1) : (z.flankLane || z.avoidSide || 1);
        } else if (z.ranged && z.rangedCd <= 0 && distP >= z.ranged.min && distP <= z.ranged.max
          && z.telegraph <= 0 && z.charging <= 0 && !(z.attackLockT > 0)) {
          // кидок сніжки, якщо є пряма видимість
          this._p0.set(z.x, z.y + z.rig.height * 0.75, z.z);
          this._p1.set(dxP, (tp.y + 1.2) - (z.y + z.rig.height * 0.75), dzP).normalize();
          const block = this.world.shotBlockDist(this._p0, this._p1, distP);
          if (block > distP - 1.5) {
            z.state = 'attack';
            z.attackT = 0;
            z.didHit = false;
            z.throwProj = true;
            z.attackDestructible = null;
            z.rangedCd = z.ranged.cd;
            setAnim(rig, 'attack');
          } else {
            z.rangedCd = 0.9;
          }
        } else if (!z.horde && z.type !== 'boss' && !z._stormWave) {
          // охоронці прив'язані до своєї точки, решта — до відстані від гравця
          const giveUp = z.guard
            ? Math.hypot(z.x - z.anchor.x, z.z - z.anchor.z) > 45
            : distP > st.aggro * 2.5 + 25;
          if (giveUp) {
            z.state = 'wander';
            z.aggroed = false;
          }
        }
      } else if (z.state === 'attack') {
        z.attackT += dt / 0.55;
        if (!z.didHit && z.attackT > 0.45) {
          z.didHit = true;
          if (z.attackDestructible) {
            const hit = z.attackDestructible;
            z.attackDestructible = null;
            if (!hit.destructible.destroyed) {
              this.world.damageDestructible(hit, Math.max(8, st.dmg * this.diff.dmg), hit.point);
              level.audio.zattack(1);
            }
          } else if (z.throwProj) {
            z.throwProj = false;
            if (playerAlive) {
              const from = new THREE.Vector3(z.x, z.y + z.rig.height * 0.78, z.z);
              const target = new THREE.Vector3(tp.x, tp.y + 1.25, tp.z);
              level.effects.spawnProjectile(from, target, z.ranged.projSpeed, z.ranged.dmg * this.diff.dmg, z.ranged.size, z.ranged.color);
              level.netEv('proj',
                Math.round(from.x * 10) / 10, Math.round(from.y * 10) / 10, Math.round(from.z * 10) / 10,
                Math.round(target.x * 10) / 10, Math.round(target.y * 10) / 10, Math.round(target.z * 10) / 10,
                z.ranged.projSpeed, z.ranged.size, z.ranged.color || 0);
              level.audio.throwWhoosh(1 - clamp(distP / 40, 0, 0.8));
            }
          } else if (playerAlive && this._canMeleeContact(z, tp, st.attackR)) {
            const confusedBonus = z.confusedT > 0 ? (z.confusedDmgBonus || 0) : 0;
            const damage = (z.type === 'stone' || z.type === 'moonbrute' ? st.dmg : st.dmg * this.diff.dmg) + confusedBonus;
            const hit = this._hurt(tgt, damage, z.x, z.z, st.hitStun || 0, z.y);
            if (hit && st.punchEvery) {
              z.punchHits = (z.punchHits || 0) + 1;
              if (z.punchHits % st.punchEvery === 0) this._punchPush(tgt, z.x, z.z, st.punchPush || 5);
            }
            level.audio.zattack(1);
            if (z.type === 'boss') {
              level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), z.frost ? 0x66ccff : 0xff6644, 5);
              level.audio.slam();
            }
          }
        }
        if (z.attackT >= 1) {
          z.state = 'recover';
          z.recoverT = z.throwProj ? 0.12 : 0.18;
          setAnim(rig, 'idle');
        }
      }

      // --- 🐂 торо (charger, не-бос): телеграф → ривок рогами здаля ---
      if (z.charger && z.type !== 'boss' && z.state !== 'dead' && z.state !== 'stagger' && z.state !== 'recover' && z.aggroed) {
        this._updateChargerAI(z, dt, distP, dxP, dzP, tp, playerAlive, tgt);
      }

      // --- 💥 підривник: телеграф у радіусі → вибух. Детонація прибирає зомбі — далі не оновлюємо. ---
      if (z.type === 'exploder' && z.state !== 'dead') {
        if (this._updateExploderAI(z, dt, distP, playerAlive)) continue;
      }

      // --- бос: чардж і призов ---
      if (z.type === 'boss' && z.state !== 'dead') {
        this._updateBossAI(z, dt, distP, dxP, dzP, tp, playerAlive, tgt);
      }

      // --- 🧙 чарівник: призов / лікування / ре-каст щита ---
      if (z.type === 'wizard' && z.state !== 'dead' && z.aggroed) {
        this._updateWizard(z, dt);
      }

      // --- 🤖 робот: ре-каст щита-гаджета по таймеру ---
      if (z.type === 'robot' && z.state !== 'dead') {
        this._updateRobotShield(z, dt);
      }

      // --- рух, колізії, поворот і анімація ---
      this._moveAndAnimateZombie(z, dt, distP, dxP, dzP, tp);

      // --- звуки ---
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = z.aggroed ? this.rng.range(1.5, 4) : this.rng.range(4, 10);
        if (distP < 45) {
          level.audio.zgroan(1 - clamp(distP / 45, 0, 0.92), st.pitch);
        }
      }
    }
    if (removeAny) this.list = this.list.filter((z) => !z.gone);
  }

  // 👻 Ікс-рей: невидимі привиди видимі лише поки активний таймер (хост і гість).
  _updateGhostXray(dt) {
    if (this.xrayT > 0) this.xrayT = Math.max(0, this.xrayT - dt);
    const reveal = this.xrayT > 0;
    for (const z of this.list) if (z.invisible) z.rig.group.visible = reveal;
  }

  // 🔥 Візуал горіння вампіра — ДО mirror-гарду, щоб ГІСТЬ теж бачив полумʼя.
  // nightK<0.5 (день) → burnFx видимий + час-базовий флікер; інакше прихований. Урон — окремо
  // (host-only, _burnVampiresInSun); тут лише картинка. Синхронна через level.nightK + level.stats.time.
  _updateVampireBurnFx(dt) {
    const nk = this.level.nightK || 0;
    const burning = nk < 0.5;
    const tnow = (this.level.stats && this.level.stats.time) || 0;
    for (const z of this.list) {
      if (z.type !== 'vampire' || !z.burnFx) continue;
      const fx = z.burnFx;
      if (burning && z.state !== 'dead' && !z.gone) {
        fx.visible = true;
        // флікер: per-instance фаза від nid, щоб язики не пульсували в унісон
        const f = 0.85 + 0.25 * Math.sin(tnow * 14 + (z.nid || 0) * 1.7);
        fx.scale.set(f, 0.8 + 0.4 * f, f);
        // зрідка дим/іскри — кадеція на вампіра (раз на ~0.4с)
        z._burnFxT = (z._burnFxT || 0) - dt;
        if (z._burnFxT <= 0) {
          z._burnFxT = 0.4;
          this.level.effects.burst(new THREE.Vector3(z.x, z.y + 1.2, z.z), 0xff8a2a, 4, { speed: 2.2, up: 2.4, life: 0.5, size: 0.8 });
        }
      } else if (fx.visible) {
        fx.visible = false;
      }
    }
  }

  // 🌊 Спавн орди хвилями (host/solo-only). players — живі гравці кооперативу; player — фолбек.
  _updateHordeWaves(dt, players, player) {
    const level = this.level;
    if (this.hordeActive && this.hordePending > 0) {
      this._hordeIdleT = 0; // поки є незаспавнені — таймер простою не рахуємо
      this.hordeSpawnT -= dt;
      if (this.hordeSpawnT <= 0) {
        // 🧟 модифікатор тижня «Навала»: частіші/більші пачки того САМОГО пулу
        // (hordePending не росте — одночасних акторів і draw calls не більшає)
        const rush = level.weeklyMod && level.weeklyMod.horde;
        this.hordeSpawnT = rush ? 0.8 : 1.3;
        const batch = Math.min(rush ? 6 : 4, this.hordePending);
        const alivePl = players.filter((p) => p.health > 0);
        for (let i = 0; i < batch; i++) {
          const cp = alivePl.length ? alivePl[Math.floor(this.rng.next() * alivePl.length)].pos : player.pos;
          const a = this.rng.next() * Math.PI * 2;
          const r = this.rng.range(32, 48);
          let x = cp.x + Math.cos(a) * r;
          let z = cp.z + Math.sin(a) * r;
          const dB = Math.hypot(x, z);
          if (dB > this.L.BOUND - 5) {
            x *= (this.L.BOUND - 8) / dB;
            z *= (this.L.BOUND - 8) / dB;
          }
          const roll = this.rng.next();
          const withShield = (this.level.country && this.level.country.shieldGuards) > 0;
          const hard = this.diff.hp >= 1.5; // DEU/FRA — броньовики в ордах
          let type;
          if (this._allowGunner && this.rng.chance(0.08)) type = 'gunner';
          else if (hard && this.rng.chance(0.09)) type = 'ironclad';
          else if (this.rng.chance(0.08)) type = 'headphones';
          else if (this.extraZombie && withShield) {
            type = roll < 0.4 ? 'walker' : roll < 0.62 ? 'runner' : roll < 0.8 ? this.extraZombie
              : roll < 0.9 ? 'shield' : 'tank';
          } else if (this.extraZombie) {
            type = roll < 0.45 ? 'walker' : roll < 0.7 ? 'runner' : roll < 0.9 ? this.extraZombie : 'tank';
          } else if (withShield) {
            type = roll < 0.5 ? 'walker' : roll < 0.8 ? 'runner' : roll < 0.9 ? 'shield' : 'tank';
          } else {
            type = roll < 0.6 ? 'walker' : roll < 0.9 ? 'runner' : 'tank';
          }
          this.spawn(type, x, z, { horde: true });
          this.hordePending--;
        }
      }
    }
    if (this.hordeActive && this.hordePending <= 0) {
      // самокорекція лічильника + таймаут захист від застряглих зомбі
      const aliveHorde = this.list.filter((z) => z.horde && z.state !== 'dead').length;
      if (aliveHorde !== this.hordeRemaining) this.hordeRemaining = aliveHorde;
      // скидаємо таймер простою якщо гравець робить прогрес (вбивства)
      if (this._hordePrevAlive === undefined || aliveHorde < this._hordePrevAlive) {
        this._hordeIdleT = 0;
      } else {
        this._hordeIdleT += dt;
      }
      this._hordePrevAlive = aliveHorde;
      if (this._hordeIdleT > 25 && this.hordeRemaining > 0) {
        for (const z of this.list) if (z.horde && z.state !== 'dead') z.horde = false;
        this.hordeRemaining = 0;
      }
    }
    if (this.hordeActive && this.hordePending <= 0 && this.hordeRemaining <= 0) {
      this.hordeActive = false;
      level.bus.emit('hordeEnd');
      level.netEv('he'); // кооп: кінець орди гостю
    }
  }

  // 🧛 Нічний спавнер вампірів (host/solo-only). Ніч (nightK>0.5) + живий гравець → раз на ~7с
  // 1-2 вампіри навколо гравця, доки живих < cap. Удень нові НЕ спавняться; таймер скидаємо на світанку.
  _spawnNightVampires(dt, players) {
    const level = this.level;
    // 🚪 кімнатні режими спавнять зомбі самі (пачки/ліміти) — амбієнтний вампір
    // там ламає баланс і лічильники (мутатор «ніч» v280 форсить nightK з t=0)
    if (level.knockout || level.defense || level.pvp || level.bank || level.portal
      || level.maze || level.humans || level.soulCollector || level.turretwar
      || level.radiation || level.worldBoss || level.bossRush) return;
    const isNight = (level.nightK || 0) > 0.5;
    if (isNight && this._allowVampire) {
      const VAMP_CAP = 6;
      this._vampT -= dt;
      if (this._vampT <= 0) {
        this._vampT = 7; // кадеція ~7с
        const aliveVamp = this.list.filter((z) => z.type === 'vampire' && z.state !== 'dead').length;
        const alivePl = players.filter((p) => p.health > 0);
        if (alivePl.length && aliveVamp < VAMP_CAP) {
          const want = Math.min(this.rng.next() < 0.5 ? 1 : 2, VAMP_CAP - aliveVamp);
          for (let i = 0; i < want; i++) {
            const cp = alivePl[Math.floor(this.rng.next() * alivePl.length)].pos;
            const a = this.rng.next() * Math.PI * 2;
            const r = this.rng.range(30, 46);
            let x = cp.x + Math.cos(a) * r;
            let z = cp.z + Math.sin(a) * r;
            const dB = Math.hypot(x, z);
            if (dB > this.L.BOUND - 5) {
              x *= (this.L.BOUND - 8) / dB;
              z *= (this.L.BOUND - 8) / dB;
            }
            this.spawn('vampire', x, z, {});
          }
        }
      }
      this._vampWasNight = true;
    } else if (this._vampWasNight) {
      // 🌅 світанок: ніч скінчилась → скидаємо таймер. Наявні вампіри вдень ЗГОРАЮТЬ (_burnVampiresInSun).
      this._vampT = 0;
      this._vampWasNight = false;
    }
  }

  // 🔥 Урон горіння вампіра на сонці (host/solo-only). День (nightK<0.5) → DoT; повне сонце ~40 dps.
  // НЕ через _damage (спамив би aggro/звук щокадру) — прямий z.hp-=, смерть через _kill (синк гостю 'zd').
  _burnVampiresInSun(dt) {
    const level = this.level;
    const nk = level.nightK || 0;
    if (nk >= 0.5) return;
    const sun = clamp((0.5 - nk) * 2, 0, 1);
    const burnDps = 40 * sun;
    for (const z of this.list) {
      if (z.type !== 'vampire' || z.state === 'dead' || z.gone) continue;
      z.hp -= burnDps * dt;
      z._burnNumT = (z._burnNumT || 0) - dt;
      if (z._burnNumT <= 0) {
        z._burnNumT = 0.5;
        level.effects.damageNumber(new THREE.Vector3(z.x, z.y + 1.4, z.z), burnDps * 0.5);
      }
      if (z.hp <= 0) this._kill(z, null);
    }
  }

  // 🐂 Charger (торо/гладіатор/самурай/теракота, не-бос): телеграф → ривок рогами здаля.
  _updateChargerAI(z, dt, distP, dxP, dzP, tp, playerAlive, tgt) {
    const st = z.stats;
    const level = this.level;
    z.chargeCd -= dt;
    if (z.telegraph > 0) {
      z.telegraph -= dt;
      if (z.telegraph <= 0) {
        z.charging = 0.8;
        const d = Math.max(0.5, distP);
        z.chargeDX = dxP / d;
        z.chargeDZ = dzP / d;
        z.didHit = false;
        level.audio.shriek(0.5, st.pitch * 0.9);
      }
    } else if (z.charging > 0) {
      z.charging -= dt;
      const cs = 13;
      z.x += z.chargeDX * cs * dt;
      z.z += z.chargeDZ * cs * dt;
      if (playerAlive && this._canMeleeContact(z, tp, 2.3, z.chargeDX, z.chargeDZ) && !z.didHit) {
        z.didHit = true;
        this._hurt(tgt, 20 * this.diff.dmg, z.x, z.z, 0, z.y);
        level.audio.slam();
      }
      if (z.charging <= 0) {
        z.didHit = false;
        z.chargeCd = this.rng.range(3.5, 6);
      }
    } else if (z.chargeCd <= 0 && z.state === 'chase' && distP > 6 && distP < 26) {
      // телеграф ривка лише з прямою видимістю — не крізь стіни
      this._p0.set(z.x, z.y + z.rig.height * 0.6, z.z);
      this._p1.set(dxP, (tp.y + 1.0) - (z.y + z.rig.height * 0.6), dzP).normalize();
      if (this.world.shotBlockDist(this._p0, this._p1, distP) > distP - 0.5) {
        z.telegraph = 0.7;
        z.didHit = false;
        level.audio.zgroan(0.7, st.pitch);
      } else {
        z.chargeCd = 0.8;
      }
    }
  }

  // 💥 Підривник (v287): у радіусі ~4м — телеграф 1.2с (миготіння заряду + пульс червоного кола),
  // потім вибух. Повертає true, якщо детонував цього кадру (зомбі вже прибрано/мертвий).
  _updateExploderAI(z, dt, distP, playerAlive) {
    const level = this.level;
    if (z.explodeT > 0) {
      z.explodeT -= dt;
      // блимання заряду — частішає до вибуху (per-instance bombCore, transform-only)
      if (z.bombCore) {
        const blink = 0.6 + 0.7 * Math.abs(Math.sin((EXPLODER_TELEGRAPH - z.explodeT) * 18));
        z.bombCore.scale.setScalar(blink);
      }
      // пульс червоного кола радіуса вибуху на землі
      z._decalT = (z._decalT || 0) - dt;
      if (z._decalT <= 0) {
        z._decalT = 0.4;
        level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xff3a2a, EXPLODER_RADIUS);
      }
      if (z.explodeT <= 0) { this._explode(z, null); return true; }
      return false;
    }
    // почав телеграф, коли добіг близько до живого гравця
    if (z.aggroed && playerAlive && distP <= 4) {
      z.explodeT = EXPLODER_TELEGRAPH;
      z._decalT = 0;
      level.audio.chargeWarn();
      level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xff3a2a, EXPLODER_RADIUS);
      if (!this._exploderHint) {
        this._exploderHint = true;
        level.bus.emit('toast', t('💥 Підривник! Відбіжи або підстрель здалеку — рвоне у колі!'));
      }
    }
    return false;
  }

  // 👑 Бос: пороги призову (75/50/25%), чардж-ривок, лють (<35% HP) і ліш до арени.
  _updateBossAI(z, dt, distP, dxP, dzP, tp, playerAlive, tgt) {
    const level = this.level;
    const frac = (z.hp / z.maxHp) * 100;
    for (const thr of [75, 50, 25]) {
      if (frac <= thr && !z.summonedAt[thr]) {
        z.summonedAt[thr] = true;
        level.audio.bossRoar();
        level.bus.emit('bossSummon');
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 6.28;
          const st = z.bossStyle || 'king';
          const mtype = st === 'frost' ? (i % 2 ? 'snowman' : 'walker')
            : st === 'iron' ? (i % 2 ? 'shield' : 'runner')
              : st === 'chef' ? (i % 2 ? 'spitter' : 'walker')
                : st === 'sultan' ? (i % 2 ? 'gunner' : 'runner')
                  : st === 'pharaoh' ? (i % 2 ? 'mummy' : 'walker')
                    : st === 'matador' ? (i % 2 ? 'toro' : 'runner')
                      : st === 'gladiator' ? (i % 2 ? 'gladiator' : 'runner')
                        : st === 'sumo' ? (i % 2 ? 'samurai' : 'runner')
                          : st === 'rex' ? (i % 2 ? 'toro' : 'imp')
                            : st === 'emperor' ? (i % 2 ? 'terracotta' : 'runner')
                              : st === 'slime' ? (i % 2 ? 'imp' : 'spitter')
                                : (i % 3 === 0 ? 'tank' : i % 2 ? 'runner' : 'walker');
          const mz = this.spawn(mtype, z.x + Math.cos(a) * 4.5, z.z + Math.sin(a) * 4.5,
            { horde: false, noCoopScale: !!z._stormWave });
          mz.aggroed = true;
          mz.state = 'chase';
          if (z._stormWave) mz._stormWave = true;
        }
      }
    }
    // 🧪 МЕГА-СЛИЗНЯК: слизовий щит фазами (патерн крижаного генерала worldboss.js):
    // 4с щит ×0.25 шкоди → 8с вікно «стріляй!». Стан на z — переживає клон-кеш не треба (бос свіжий риг)
    if (z.bossStyle === 'slime') {
      z._slimeT = (z._slimeT === undefined ? 6 : z._slimeT) - dt;
      if (z._slimeT <= 0) {
        const on = !z.worldBossShield;
        z.worldBossShield = on;
        z._slimeT = on ? 4.0 : 8.0;
        level.effects.ring(new THREE.Vector3(z.x, z.y + 1, z.z), on ? 0x79ff4d : 0xd6ff6e, on ? 5.5 : 3.2);
        level.bus.emit('toast', on ? t('🟢 Слиз затвердів! Шкода тимчасово слабша.') : t('💥 Слиз розм\'як — стріляй зараз!'));
      }
    }
    z.chargeCd -= dt;
    if (z.telegraph > 0) {
      z.telegraph -= dt;
      if (z.telegraph <= 0) {
        z.charging = 1.1;
        const d = Math.max(0.5, distP);
        z.chargeDX = dxP / d;
        z.chargeDZ = dzP / d;
      }
    } else if (z.charging > 0) {
      z.charging -= dt;
      const cs = 15;
      z.x += z.chargeDX * cs * dt;
      z.z += z.chargeDZ * cs * dt;
      if (playerAlive && this._canMeleeContact(z, tp, 2.6, z.chargeDX, z.chargeDZ) && !z.didHit) {
        z.didHit = true;
        this._hurt(tgt, 34 * this.diff.dmg, z.x, z.z, 0, z.y);
        level.audio.slam();
      }
      if (z.charging <= 0) {
        z.didHit = false;
        z.chargeCd = this.rng.range(4.5, 7);
      }
    } else if (z.chargeCd <= 0 && distP > 7 && distP < 32 && z.state === 'chase') {
      z.telegraph = 0.8;
      z.didHit = false;
      level.audio.chargeWarn();
      level.bus.emit('bossCharge');
    }
    // лють лише у фазі низького HP; якщо ліш залікував боса вище 35% — спадає
    z.enraged = frac < 35;
    // ліш: бос не покидає околиці арени — повертається і лікується
    const dArena = Math.hypot(z.x - this.L.arena.x, z.z - this.L.arena.z);
    if (!z.noLeash && !z.leashed && dArena > this.L.arena.r + 14) z.leashed = true;
    else if (z.leashed && dArena < 8) z.leashed = false;
    if (z.leashed) {
      z.telegraph = 0;
      z.charging = 0;
      z.hp = Math.min(z.maxHp, z.hp + 10 * dt);
    }
  }

  // 🚶 Рух + сепарація (бакет-сітка) + чесні схили + колізії + поворот + анімація. distP/dxP/dzP/tp — ціль.
  _moveAndAnimateZombie(z, dt, distP, dxP, dzP, tp) {
    const st = z.stats;
    const rig = z.rig;
    const startX = z.x, startZ = z.z;
    let targetX = null, targetZ = null, spd = 0;
    if (z.state === 'flee') {
      targetX = z.x - dxP;
      targetZ = z.z - dzP;
      spd = 6.2;
    } else if (z.state === 'investigate') {
      targetX = z.investigateX;
      targetZ = z.investigateZ;
      spd = st.speed;
    } else if (z.state === 'approach') {
      const lane = z.approachLane || 0;
      if (lane && distP > 0.01) {
        const orbit = st.attackR * (z.type === 'runner' ? 1.15 : 0.9);
        targetX = tp.x + (-dzP / distP) * lane * orbit;
        targetZ = tp.z + (dxP / distP) * lane * orbit;
        spd = st.chaseSpeed * 0.75;
      } else if (distP > st.attackR * 0.9) {
        targetX = tp.x;
        targetZ = tp.z;
        spd = st.chaseSpeed * 0.45;
      }
    } else if (z.state === 'chase') {
      if (z.type === 'boss' && z.leashed) {
        targetX = this.L.arena.x; targetZ = this.L.arena.z;
      } else {
        targetX = tp.x; targetZ = tp.z;
        // Відкриті зграї оббігають гравця зліва/справа. Біля дистанції удару
        // зміщення зникає, тому мелі лишається точним і передбачуваним.
        if (!z.guard && !z.ranged && z.type !== 'boss' && z.zone !== 'castle-dungeon' && distP > st.attackR * 1.2) {
          const lane = Number.isFinite(z.flankLane) ? z.flankLane : ((z.nid % 3) - 1);
          const flank = lane * Math.min(4.5, (distP - st.attackR * 1.2) * 0.32);
          if (flank && distP > 0.01) {
            targetX += (-dzP / distP) * flank;
            targetZ += (dxP / distP) * flank;
          }
        }
      }
      spd = st.chaseSpeed * (z.enraged ? 1.5 : 1);
    } else if (z.state === 'wander') {
      targetX = z.wx; targetZ = z.wz;
      spd = st.speed;
      if (Math.hypot(z.wx - z.x, z.wz - z.z) < 1) spd = 0;
    }
    if (z.charging > 0 || z.telegraph > 0 || z.explodeT > 0) spd = 0;
    if (z.slowT > 0) {
      spd *= z.slowMul || 0.5;
      z.slowT = Math.max(0, z.slowT - dt);
      if (z.slowT === 0) z.slowMul = 1;
    }
    // сніговик тримає дистанцію і кидає сніжки (зупиняється лише в зоні кидка)
    if (z.ranged && z.ranged.hold > 0 && z.state === 'chase'
      && distP < z.ranged.hold && distP > Math.max(st.attackR * 1.2, z.ranged.min)) spd = 0;

    let moving = false;
    const avoiding = z.avoidT > 0;
    if (avoiding) z.avoidT = Math.max(0, z.avoidT - dt);
    if (spd > 0 && targetX !== null) {
      const dx = targetX - z.x, dz = targetZ - z.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        const dirX = dx / d, dirZ = dz / d;
        let moveX = dirX, moveZ = dirZ;
        if (avoiding && z.state === 'chase') {
          const side = z.avoidSide || 1;
          moveX = dirX * 0.34 - dirZ * side * 0.94;
          moveZ = dirZ * 0.34 + dirX * side * 0.94;
          const ml = Math.hypot(moveX, moveZ);
          moveX /= ml; moveZ /= ml;
        }
        let mx = moveX * spd * dt;
        let mz = moveZ * spd * dt;
        // сепарація від інших зомбі (квадрати відстаней — без зайвих sqrt).
        // Кандидатів беремо з бакет-сітки: лише 3×3 сусідні комірки замість всього this.list.
        const cgx = Math.floor(z.x / SEP_CELL), cgz = Math.floor(z.z / SEP_CELL);
        for (let gx = -1; gx <= 1; gx++) {
          for (let gz = -1; gz <= 1; gz++) {
            const bucket = this._sepGrid.get(SKEY(cgx + gx, cgz + gz));
            if (!bucket) continue;
            for (const o of bucket) {
              if (o === z || o.state === 'dead') continue;
              const sx = z.x - o.x, sz = z.z - o.z;
              const minD = (z.rig.radius + o.rig.radius) * 0.9;
              const sd2 = sx * sx + sz * sz;
              if (sd2 < minD * minD && sd2 > 1e-4) {
                const sd = Math.sqrt(sd2);
                mx += (sx / sd) * (minD - sd) * 0.5;
                mz += (sz / sd) * (minD - sd) * 0.5;
              }
            }
          }
        }
        // 🏔️ чесні схили: у відвісну кручу зомбі не лізе — обходить уздовж стіни
        if (this.world._terrainMod) {
          const groundAt = z.zone === 'castle-dungeon'
            ? (x, zPos) => this.world.dungeonGroundH(x, zPos)
            : (x, zPos) => this.world.groundH(x, zPos);
          // 🚀 висоту під зомбі семплимо раз/кадр: на старті кадру (x,z) ще ті самі,
          // що в кінці минулого (рух застосовується нижче) — переюзаємо кеш точним збігом.
          const ghO = (z._ghX === z.x && z._ghZ === z.z) ? z._gh : groundAt(z.x, z.z);
          const ok = (ax, az) =>
            groundAt(ax, az) - ghO <= Math.hypot(ax - z.x, az - z.z) * 1.6 + 0.35;
          if (!ok(z.x + mx, z.z + mz)) {
            if (ok(z.x + mx, z.z)) mz = 0;
            else if (ok(z.x, z.z + mz)) mx = 0;
            else {
              // обидві осі впираються в крутий схил: ковзаємо вздовж нього (дотичний крок),
              // а не завмираємо намертво — інакше зомбі «застрягає» біля нерівностей
              const px = -mz, pz = mx;
              if (ok(z.x + px, z.z + pz)) { mx = px; mz = pz; }
              else if (ok(z.x - px, z.z - pz)) { mx = -px; mz = -pz; }
              else { mx = 0; mz = 0; }
            }
          }
        }
        z.x += mx;
        z.z += mz;
        moving = true;
      }
    }
    // нокбек від пострілів: імпульс штовхає й швидко згасає (працює навіть коли зомбі стоїть)
    if (z.kbX || z.kbZ) {
      z.x += z.kbX * dt;
      z.z += z.kbZ * dt;
      const kf = Math.max(0, 1 - dt * 6);
      z.kbX *= kf; z.kbZ *= kf;
      if (Math.abs(z.kbX) + Math.abs(z.kbZ) < 0.04) z.kbX = z.kbZ = 0;
    }
    // колізії зі світом
    const solved = this.world.collide(z.x, z.z, z.rig.radius * 0.8, z.y);
    z.x = solved.x;
    z.z = solved.z;
    const dungeon = z.zone === 'castle-dungeon' ? this.world.castleDungeon : null;
    if (dungeon && (z.x < dungeon.enemyMinX || dungeon.floorHeightAt(z.x, z.z) === null)) {
      const startWasInside = startX >= dungeon.enemyMinX && dungeon.floorHeightAt(startX, startZ) !== null;
      z.x = startWasInside ? startX : z.anchor.x;
      z.z = startWasInside ? startZ : z.anchor.z;
      z.kbX = 0;
      z.kbZ = 0;
    }
    const gh = z.zone === 'castle-dungeon' ? this.world.dungeonGroundH(z.x, z.z) : this.world.groundH(z.x, z.z);
    z._ghX = z.x; z._ghZ = z.z; z._gh = gh; // кеш для slope-чеку наступного кадру
    z.y = Math.max(gh, this.world.floorAt(z.x, z.z, z.y));
    const movedX = z.x - startX, movedZ = z.z - startZ;
    const movedD = Math.hypot(movedX, movedZ);
    moving = spd > 0 && movedD > 1e-4;

    // 0.8с без прогресу — боковий обхід; 1.8с — міняємо бік і локальну flank-ціль.
    if (z.state === 'chase' && spd > 0 && targetX !== null && !z.charging && !z.telegraph) {
      const tx = targetX - startX, tz = targetZ - startZ;
      const td = Math.hypot(tx, tz);
      const expected = spd * dt;
      const progress = td > 0.01 ? (movedX * tx + movedZ * tz) / td : movedD;
      if (expected > 0.001 && progress < expected * 0.18) z.stuckT = (z.stuckT || 0) + dt;
      else z.stuckT = Math.max(0, (z.stuckT || 0) - dt * 2);
      if (!avoiding && z.stuckT >= 0.8) {
        z.avoidT = 1.25;
      }
      if (z.stuckT >= 1.8) {
        z.avoidSide = -(z.avoidSide || 1);
        z.flankLane = -(z.flankLane || z.avoidSide);
        z.avoidT = 1.25;
        z.stuckT = 0.8;
      }
    } else {
      z.stuckT = 0;
    }

    // --- поворот і анімація ---
    let faceX = 0, faceZ = 0;
    if (z.state === 'attack' || z.telegraph > 0 || (z.state === 'chase' && !z.leashed)) {
      faceX = dxP; faceZ = dzP;
    } else if (z.charging > 0) {
      faceX = z.chargeDX; faceZ = z.chargeDZ;
    } else if (moving) {
      faceX = movedX; faceZ = movedZ;
    }
    if (faceX !== 0 || faceZ !== 0) {
      const targetYaw = Math.atan2(-faceX, -faceZ);
      rig.group.rotation.y = dampAngle(rig.group.rotation.y, targetYaw, 8, dt);
    }
    z._netMoving = moving;
    rig.group.position.set(z.x, z.y, z.z);

    if (z.state !== 'attack') {
      if (z.telegraph > 0) {
        setAnim(rig, 'cheer'); // махає руками — телеграф чарджу
      } else if (z.state === 'stagger') {
        setAnim(rig, 'stagger');
      } else if (moving) {
        setAnim(rig, spd > 4 || z.charging > 0 ? 'run' : 'walk');
        rig.anim.speed = z.charging > 0 ? 14 : spd;
      } else {
        setAnim(rig, 'idle');
      }
    }
    updateRig(rig, dt);
  }

  // 🧙 AI чарівника: викликається з update() щокадру (лише на хості/соло).
  _updateWizard(z, dt) {
    const level = this.level;
    // прибираємо мертвих/зниклих прислужників — звільняємо слоти (макс 5 живих)
    z.minions = z.minions.filter((m) => m && !m.gone && m.state !== 'dead');

    // 1) ПРИЗОВ: кожні ~6с прикликає 1-2 слабких, тримаючи ≤5 живих своїх
    z.summonCd -= dt;
    if (z.summonCd <= 0) {
      z.summonCd = this.rng.range(5.5, 6.5);
      const free = 5 - z.minions.length;
      if (free > 0) {
        const n = Math.min(free, this.rng.chance(0.5) ? 2 : 1);
        for (let i = 0; i < n; i++) {
          const a = this.rng.next() * 6.28;
          const r = this.rng.range(1.6, 3.2);
          const mtype = this.rng.chance(0.5) ? 'runner' : 'walker';
          const spawnOpts = { groupId: z.groupId };
          if (z.zone === 'castle-dungeon') Object.assign(spawnOpts, {
            zone: z.zone,
            guard: true,
            anchor: { x: z.x, z: z.z, r: 4 },
          });
          const mz = this.spawn(mtype, z.x + Math.cos(a) * r, z.z + Math.sin(a) * r, spawnOpts);
          mz.aggroed = true;
          mz.state = 'chase';
          mz._summonedBy = z;
          z.minions.push(mz);
        }
        // ефект призову — фіолетове кільце + іскри
        level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0x9b6bff, 2.6);
        level.effects.burst(new THREE.Vector3(z.x, z.y + 1.2, z.z), 0x9b6bff, 10, { speed: 3.5, up: 3, life: 0.6, size: 1.1 });
        level.audio.shriek(0.5, z.stats.pitch * 0.8);
      }
    }

    // 2) ЛІКУВАННЯ (AoE): кожні ~4с лікує поранених сусідів-зомбі в радіусі 10 на ~15 HP
    z.healCd -= dt;
    if (z.healCd <= 0) {
      z.healCd = this.rng.range(3.5, 4.5);
      let healedAny = false;
      for (const o of this.list) {
        if (o === z || o.state === 'dead' || o.type === 'boss') continue;
        if (o.hp >= o.maxHp) continue;
        if (Math.hypot(o.x - z.x, o.z - z.z) > 10) continue;
        o.hp = Math.min(o.maxHp, o.hp + 15);
        healedAny = true;
        // зелений «+» над зціленим
        level.effects.burst(new THREE.Vector3(o.x, o.y + o.rig.height * 0.7, o.z), 0x5dff7a, 6, { speed: 1.8, up: 2.6, life: 0.7, size: 0.9 });
      }
      // чарівник лікує і себе трішки
      if (z.hp < z.maxHp) { z.hp = Math.min(z.maxHp, z.hp + 15); healedAny = true; }
      if (healedAny) {
        level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0x5dff7a, 6);
      }
    }

    // 3) РЕ-КАСТ ЩИТА: коли щит зламано — через ~5с чарівник ставить новий (100 HP)
    if (!z.shieldObj && z.shieldRecastCd > 0) {
      const net = this.level.net;
      if (net && !net.authority) return;
      z.shieldRecastCd -= dt;
      if (z.shieldRecastCd <= 0) {
        this._recastWizardShield(z);
        this.level.netEv('zsr', z.nid);
      }
    }
  }

  _updateRobotShield(z, dt) {
    // ре-каст лише коли щит зламано (shieldObj === null) і запущено таймер
    if (z.shieldObj || z.shieldRecastCd <= 0) return;
    // КООП: новий щит ставить ЛИШЕ authority (host); гість дізнається через подію 'zsr'
    const net = this.level.net;
    if (net && !net.authority) return;
    z.shieldRecastCd -= dt;
    if (z.shieldRecastCd > 0) return;
    this._recastRobotShield(z);
    this.level.netEv('zsr', z.nid);
  }

  // створює (або відновлює) щит-гаджет меха; викликається authority і гостем (через 'zsr')
  _recastRobotShield(z) {
    if (z.shieldObj) return;
    const level = this.level;
    z.shieldHp = z.shieldMax = z.stats.shieldHp;
    const shield = makeShieldMesh();
    shield.group.scale.setScalar(1.8);
    shield.group.position.set(0, 1.35, -0.78);
    z.rig.body.add(shield.group);
    z.shieldObj = shield;
    z.shieldFire = false;
    z.shieldRecastCd = 0;
    // ефект касту — жовтогаряче кільце (під колір меха/гармати)
    level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xffd24a, 3.6);
    level.effects.burst(new THREE.Vector3(z.x, z.y + 1.3, z.z), 0xffd24a, 14, { speed: 3.2, up: 3, life: 0.6, size: 1.2 });
    level.audio.clang();
  }

  _recastWizardShield(z) {
    if (z.shieldObj) return;
    const level = this.level;
    z.shieldHp = z.shieldMax = z.stats.shieldHp;
    const shield = makeShieldMesh();
    shield.group.position.set(0, 1.05, -0.62);
    z.rig.body.add(shield.group);
    z.shieldObj = shield;
    z.shieldFire = false;
    z.shieldRecastCd = 0;
    level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0x6aa9ff, 3.2);
    level.effects.burst(new THREE.Vector3(z.x, z.y + 1.1, z.z), 0x6aa9ff, 12, { speed: 3, up: 2.6, life: 0.6, size: 1.0 });
    level.audio.clang();
  }

  // 🤝 множник команди: соло/дзеркало = 1, кооп = кількість гравців
  coopMul() {
    const level = this.level;
    if (level.mirror) return 1;
    const byPlayers = level.players && level.players.length;
    if (byPlayers) return byPlayers;
    // початкові зомбі спавняться ще ДО підключення мережі — рахуємо ростер кімнати
    const sess = level.game && level.game.coop && level.game.coop.session;
    return (sess && sess.state === 'level') ? Math.max(1, sess.roster.size) : 1;
  }

  _nearestConfusedEnemy(z) {
    let best = null, bd = Infinity;
    for (const other of this.list) {
      if (other === z || other.state === 'dead' || other.gone || other.type === 'boss') continue;
      const d = Math.hypot(other.x - z.x, other.z - z.z);
      if (d < bd) { bd = d; best = other; }
    }
    return best;
  }

  // шкода гравцю: у коопі — через мережу (хост), соло — напряму
  _canMeleeContact(z, tp, range, faceX, faceZ) {
    const dx = tp.x - z.x, dz = tp.z - z.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range || Math.abs((tp.y ?? z.y) - z.y) > 1.4) return false;
    const fx = faceX === undefined ? -Math.sin(z.rig.group.rotation.y) : faceX;
    const fz = faceZ === undefined ? -Math.cos(z.rig.group.rotation.y) : faceZ;
    if (dist > 0.001 && (dx * fx + dz * fz) / dist < 0.45) return false;
    this._p0.set(z.x, z.y + z.rig.height * 0.6, z.z);
    this._p1.set(dx, (tp.y + 1.0) - (z.y + z.rig.height * 0.6), dz).normalize();
    return this.world.shotBlockDist(this._p0, this._p1, dist) > dist - 0.35;
  }

  _hurt(tgt, dmg, fx, fz, stun = 0, fy = null) {
    if (!tgt) return false;
    if (tgt.zombie) {
      const dir = new THREE.Vector3(tgt.zombie.x - fx, 0, tgt.zombie.z - fz).normalize();
      tgt.zombie.damage(dmg, dir, false, { confused: true });
      return true;
    }
    if (tgt.clone) { if (tgt.clone.takeDamage) tgt.clone.takeDamage(dmg); else tgt.clone.hp -= dmg; return true; }
    if (Number.isFinite(fy) && Math.abs(tgt.pos.y - fy) >= 2.8) return false;
    // ponytail: мелі (звичайна атака/ривок торо/слем боса) не дістає гравця на вишці/даху —
    // зазор по висоті від землі під ним; стрибок (~1.8м) не блокує, башта (+4.25м) блокує.
    const floorY = Math.max(this.world.groundH(tgt.pos.x, tgt.pos.z), this.world.floorAt(tgt.pos.x, tgt.pos.z, tgt.pos.y));
    if (tgt.pos.y - floorY > 3) return false;
    if (this.level.net && this.level.net.authority) this.level.net.hurtPlayer(tgt, dmg, fx, fz, stun);
    else {
      this.level.player.takeDamage(dmg, fx, fz);
      if (stun && this.level.player.health > 0) this.level.player.stunT = Math.max(this.level.player.stunT || 0, stun);
    }
    return true;
  }

  _punchPush(tgt, fx, fz, dist) {
    const pos = tgt.clone || tgt.pos;
    if (!pos) return;
    const dx = pos.x - fx;
    const dz = pos.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    const out = this.world.collide(pos.x + (dx / d) * dist, pos.z + (dz / d) * dist, tgt.clone ? 0.35 : 0.45, pos.y);
    pos.x = out.x;
    pos.z = out.z;
    if (tgt.clone) {
      if (typeof tgt.clone.syncToFloor === 'function') tgt.clone.syncToFloor();
      else if (tgt.clone.mesh) tgt.clone.mesh.position.set(pos.x, pos.y, pos.z);
    }
  }

  // ================= ДЗЕРКАЛО (гість кооперативу) =================
  // Зомбі-маріонетка: позиції/стани приходять з хоста, тут лише анімація.
  spawnPuppet(nid, type, x, z, o = {}) {
    if (this.byNidMap.has(nid)) return this.byNidMap.get(nid);
    const z_ = this.spawn(type, x, z, {
      nid, mirror: true,
      golden: !!o.g, elite: !!o.e, sleeping: !!o.sl, horde: !!o.h,
      style: o.st || undefined,
    });
    if (o.k) z_.knockout = true;
    if (o.d) z_.defense = true;
    if (o.rm) z_.radiationMode = true;
    if (o.tw) z_.turretwar = true;
    // 🌋 світовий бос: гість біндить puppet-боса, HUD/маркер читають level.zombies.boss
    if (o.wb) { z_.worldBoss = o.wb; this.boss = z_; }
    if (o.wbm) z_.worldBossMinion = true;
    if (o.mhp) { z_.maxHp = o.mhp; z_.hp = o.hp !== undefined ? o.hp : o.mhp; }
    if (o.sh !== undefined && z_.shieldMax > 0) this._applyShieldPct(z_, o.sh);
    if (o.ch !== undefined && z_.chestMax > 0) this._applyChestPct(z_, o.ch);
    z_.netT = { x, z, y: z_.y };
    z_.netB = 0;
    return z_;
  }

  puppetDie(z, mine, golden) {
    if (z.state === 'dead') return;
    z.state = 'dead';
    z.deadT = 0;
    setAnim(z.rig, 'die');
    const level = this.level;
    const distV = Math.hypot(z.x - level.player.pos.x, z.z - level.player.pos.z);
    level.audio.zdie(1 - clamp(distV / 50, 0, 0.9));
    if (z.type !== 'boss') level.audio.killPop(1 - clamp(distV / 40, 0, 0.9)); // 🎈 мультяшний «поп»
    if (z.horde) this.hordeRemaining--;
    if (mine) {
      level.stats.kills++;
      level.bus.emit('zombieKilled', z);
    }
    if (golden) level.audio.goldenJingle(false);
    if (z.type === 'boss') this.boss = null;
  }

  puppetGone(nid) {
    const z = this.byNidMap.get(nid);
    if (!z) return;
    z.gone = true;
    this.scene.remove(z.rig.group);
    if (z.type === 'boss') disposeObject(z.rig.group); // бос per-instance; звичайні — спільний кеш
    else disposeRigSkeleton(z.rig); // per-клон Skeleton/boneTexture
    this.byNidMap.delete(nid);
    if (this.boss === z) this.boss = null;
    this.list = this.list.filter((zb) => zb !== z);
  }

  puppetShieldBreak(nid) {
    const z = this.byNidMap.get(nid);
    if (!z || !z.shieldObj) return;
    this._applyShieldPct(z, 0);
  }

  puppetShieldRecast(nid) {
    const z = this.byNidMap.get(nid);
    if (!z || z.shieldObj) return;
    if (z.type === 'robot') this._recastRobotShield(z);
    else if (z.type === 'wizard') this._recastWizardShield(z);
  }

  puppetChestBreak(nid) {
    const z = this.byNidMap.get(nid);
    if (!z) return;
    this._applyChestPct(z, 0);
  }

  _applyShieldPct(z, pct) {
    if (!z.shieldMax) return;
    z.shieldHp = (z.shieldMax * pct) / 100;
    if (pct <= 0 && z.shieldObj) {
      const fx = -Math.sin(z.rig.group.rotation.y);
      const fz = -Math.cos(z.rig.group.rotation.y);
      const sparkPos = new THREE.Vector3(z.x + fx * 0.75, z.y + 1.15, z.z + fz * 0.75);
      z.rig.body.remove(z.shieldObj.group);
      z.shieldObj = null;
      z.shieldHp = 0;
      this.level.effects.burst(sparkPos, 0x7d8aa0, 14, { speed: 4.5, up: 4, life: 0.7, size: 1.3 });
      this.level.audio.shieldBreak();
    } else if (z.shieldObj) {
      z.shieldObj.cracks1.visible = pct <= 75;
      z.shieldObj.cracks2.visible = pct <= 50;
      if (z.shieldObj.cracks3) z.shieldObj.cracks3.visible = pct <= 25;
    }
  }

  _applyChestPct(z, pct) {
    if (!z.chestMax) return;
    z.chestHp = (z.chestMax * pct) / 100;
    if (pct <= 0) {
      if (z.chestObj && z.chestObj.visible) {
        z.chestObj.visible = false;
        if (z.chestCracks1) z.chestCracks1.visible = false;
        if (z.chestCracks2) z.chestCracks2.visible = false;
        this.level.effects.burst(new THREE.Vector3(z.x, z.y + 1.2, z.z), 0x7d8aa0, 12, { speed: 4, up: 3.5, life: 0.7, size: 1.2 });
        this.level.audio.shieldBreak();
      }
    } else {
      if (z.chestCracks1) z.chestCracks1.visible = pct <= 60;
      if (z.chestCracks2) z.chestCracks2.visible = pct <= 30;
    }
  }

  // снапшот хоста: цілі для інтерполяції
  applySnapshot(zarr) {
    for (const t of zarr) {
      const z = this.byNidMap.get(t[0]);
      if (!z || z.state === 'dead') continue;
      z.netT = { x: t[1], z: t[2], y: t[3] };
      z.netB = t[4];
      z.hp = Math.max(1, Math.round((z.maxHp * t[5]) / 100));
      if (t.length > 6) {
        const v = t[6];
        if (v >= 0 && z.shieldMax > 0 && z.shieldObj) this._applyShieldPct(z, v);
        else if (v < 0 && z.chestMax > 0) this._applyChestPct(z, -(v + 1));
      }
      z.sleeping = !!(t[4] & ZF.SLEEPING);
    }
  }

  clearAllPuppets() {
    for (const z of this.list) {
      this.scene.remove(z.rig.group);
      if (z.type === 'boss') disposeObject(z.rig.group); // бос per-instance; звичайні — спільний кеш
      else disposeRigSkeleton(z.rig); // per-клон Skeleton/boneTexture
    }
    this.list = [];
    this.byNidMap.clear();
    this.boss = null;
  }

  _updateMirror(dt) {
    const level = this.level;
    const p = level.player;
    let removeAny = false;
    for (const z of this.list) {
      const rig = z.rig;
      if (z.state === 'dead') {
        z.deadT += dt;
        // риг трупа оновлюємо лише поки грає die-анімація — потім поза заморожена
        if (rig.anim.dieT < 1) updateRig(rig, dt);
        // занурюємо тіло в землю в останні ~0.7с перед прибиранням — щоб і на тачі
        // (короткий TTL 1.6с) труп плавно зникав, а не «вистрибував»
        if (z.deadT > this._corpseTtl - 0.7) rig.group.position.y -= dt * 0.9;
        if (z.deadT > this._corpseTtl) {
          z.gone = true;
          removeAny = true;
          this.scene.remove(rig.group);
          // лише бос: ріг свіжий (makeBoss), геометрія per-instance. Звичайні зомбі
          // клонуються з кешу (cloneRig ділить mg за посиланням) — диспоз зламав би сіблінгів.
          if (z.type === 'boss') disposeObject(rig.group);
          else disposeRigSkeleton(rig); // звичайний зомбі: геометрія/матеріал спільні, але Skeleton/boneTexture — per-клон
          this.byNidMap.delete(z.nid);
        }
        continue;
      }
      const b = z.netB || 0;
      const state = b & ZS_MASK; // 0 wander 1 chase 2 attack 3 dead 4 flee 5 stagger 6 recover
      const charging = (b & ZF.CHARGING) !== 0;
      const telegraph = (b & ZF.TELEGRAPH) !== 0;
      if (z.netT) {
        const ddx = z.netT.x - z.x, ddz = z.netT.z - z.z;
        const snapDist = Math.hypot(ddx, ddz);
        if (snapDist > 10) {
          z.x = z.netT.x; z.z = z.netT.z; z.y = z.netT.y;
        } else {
          z.x = damp(z.x, z.netT.x, 12, dt);
          z.z = damp(z.z, z.netT.z, 12, dt);
          z.y = damp(z.y, z.netT.y, 12, dt);
        }
        z._mirrorSpd = damp(z._mirrorSpd || 0, snapDist * 12, 8, dt);
        // обличчям до руху, в атаці — до найближчого гравця (локальна здогадка)
        let fx = ddx, fz = ddz;
        if (state === 2 || telegraph) {
          fx = p.pos.x - z.x; fz = p.pos.z - z.z;
          let bd = Math.hypot(fx, fz);
          if (level.net) {
            for (const rp of level.net.remotes.values()) {
              const d2 = Math.hypot(rp.pos.x - z.x, rp.pos.z - z.z);
              if (d2 < bd) { bd = d2; fx = rp.pos.x - z.x; fz = rp.pos.z - z.z; }
            }
          }
        }
        if (Math.abs(fx) > 0.01 || Math.abs(fz) > 0.01) {
          rig.group.rotation.y = dampAngle(rig.group.rotation.y, Math.atan2(-fx, -fz), 8, dt);
        }
      }
      rig.group.position.set(z.x, z.y, z.z);
      // анімація зі стану
      if (z.sleeping) {
        updateRig(rig, dt * 0.35);
        continue;
      }
      const moving = (z._mirrorSpd || 0) > 0.6;
      if (state === 2) {
        if (rig.anim.mode !== 'attack') setAnim(rig, 'attack');
        else if (rig.anim.attackT >= 1) { rig.anim.attackT = 0; }
      } else if (state === 5) {
        setAnim(rig, 'stagger');
      } else if (telegraph) {
        setAnim(rig, 'cheer');
      } else if (moving) {
        setAnim(rig, (z._mirrorSpd > 4 || charging) ? 'run' : 'walk');
        rig.anim.speed = charging ? 14 : z._mirrorSpd;
      } else {
        setAnim(rig, 'idle');
      }
      updateRig(rig, dt);
      // стогони
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = z.aggroed ? this.rng.range(1.5, 4) : this.rng.range(4, 10);
        const distP = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
        if (distP < 45) level.audio.zgroan(1 - clamp(distP / 45, 0, 0.92), z.stats.pitch);
      }
    }
    if (removeAny) this.list = this.list.filter((z) => !z.gone);
  }
}
