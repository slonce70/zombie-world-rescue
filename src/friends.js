// 🤝 R4 (v290) «Врятовані друзі»: у кожній країні кампанії схований один названий
// НПС у клітці під охороною зомбі. Звільни його — і він оселиться у живому таборі
// на Базі Рятівника. Спільний модуль: реєстр друзів + чисті хелпери (main.js, hqbase.js,
// альбом, тести) + клас HiddenRescue (клітка у соло-рівні).
//
// Червоні лінії: СОЛО-кампанія лише (guard useStory/!level.net); кооп не чіпаємо; персист
// у save.friends = { cid: true } → SAVE_PROGRESS_KEYS; перф — клітка спавниться біля
// далекого storySites-якоря (не арена боса), фрустум-калиться на старті рівня.
import * as THREE from 'three';
import { t, interactKey } from './i18n.js';
import { CAMPAIGN_ORDER, COUNTRIES } from './countries.js';
import { makeCivilian, setAnim, updateRig, disposeRigSkeleton } from './characters.js';
import { disposeObject } from './utils.js';

// Реєстр друзів: по одному на країну CAMPAIGN_ORDER (12; секретні LAB/LOST — без друга).
// kind — ріг громадянина (makeCivilian: 'kid'|'granny'|'medic'). emoji — портрет для альбому.
// Імена/ролі вигадані у дусі лору країн (side-персонажі, НЕ мішен-НПС із countryStories),
// дитячі, без реальних осіб. Усі рядки — укр. ключ + EN/RU у i18n.
export const FRIENDS = {
  UKR: {
    id: 'UKR', squad: 'heal', kind: 'granny', emoji: '👵',
    name: () => t('Бабуся Оксана'),
    role: () => t('пасічниця 🐝'),
    thanks: () => t('Дякую, дитинко! Тепер меду вистачить на весь табір! 🍯'),
    greeting: () => t('Скуштуй медку, герою — свіженький, з нашого табору! 🍯'),
  },
  POL: {
    id: 'POL', squad: 'fighter', kind: 'kid', emoji: '🧒',
    name: () => t('Стефанко'),
    role: () => t('ковзаняр ⛸️'),
    thanks: () => t('Ти розбив кригу страху! Мчу до табору, дякую!'),
    greeting: () => t('Навчу тебе ковзати, коли зима завітає в табір! ⛸️'),
  },
  DEU: {
    id: 'DEU', squad: 'fighter', kind: 'kid', emoji: '👦',
    name: () => t('Ганс'),
    role: () => t('годинникар ⚙️'),
    thanks: () => t('Ти виручив мене точно вчасно, як добрий годинник! Дякую!'),
    greeting: () => t('У таборі всі мої годинники цокають рівненько — заходь! ⚙️'),
  },
  FRA: {
    id: 'FRA', squad: 'lure', kind: 'kid', emoji: '👧',
    name: () => t('Мірей'),
    role: () => t('квіткарка 💜'),
    thanks: () => t('Ти врятував мене! Насаджу лаванди по всьому табору!'),
    greeting: () => t('Понюхай лаванду, герою — пахне свободою! 💜'),
  },
  ESP: {
    id: 'ESP', squad: 'lure', kind: 'kid', emoji: '🧒',
    name: () => t('Пабліто'),
    role: () => t('гітарист 🎸'),
    thanks: () => t('Оле! Ти врятував мене — заграю для всього табору!'),
    greeting: () => t('Слухай мою гітару, друже — це пісня подяки! 🎸'),
  },
  PRT: {
    id: 'PRT', squad: 'fighter', kind: 'kid', emoji: '👦',
    name: () => t('Тіагу'),
    role: () => t('рибалка 🎣'),
    thanks: () => t('Дякую! Тепер мої сіті ловитимуть лише рибу, не страх!'),
    greeting: () => t('Наловив риби на всіх у таборі — сідай до столу! 🎣'),
  },
  ITA: {
    id: 'ITA', squad: 'heal', kind: 'kid', emoji: '🧒',
    name: () => t('Марко'),
    role: () => t('морозивник 🍦'),
    thanks: () => t('Граціє! Ти врятував мене — морозиво за мій рахунок!'),
    greeting: () => t('Яке морозиво тобі, герою? У таборі всі смаки! 🍦'),
  },
  TUR: {
    id: 'TUR', squad: 'lure', kind: 'kid', emoji: '👦',
    name: () => t('Емре'),
    role: () => t('килимар 🧿'),
    thanks: () => t('Тешеккюр! Ти витягнув мене — зітчу килим на твою честь!'),
    greeting: () => t('Сідай на мій килим, друже, — розкажу казку Босфору! 🧿'),
  },
  SWE: {
    id: 'SWE', squad: 'heal', kind: 'kid', emoji: '👧',
    name: () => t('Ліннея'),
    role: () => t('ягідниця 🫐'),
    thanks: () => t('Такк! Ти врятував мене від сніговиків! Біжу в табір!'),
    greeting: () => t('Назбирала ягід для всіх — пригощайся, герою! 🫐'),
  },
  EGY: {
    id: 'EGY', squad: 'fighter', kind: 'kid', emoji: '🧒',
    name: () => t('Каміль'),
    role: () => t('погонич 🐫'),
    thanks: () => t('Шукран! Ти визволив мене з пісків! Дякую, друже!'),
    greeting: () => t('Мій верблюд возить воду для табору — хочеш прокотитись? 🐫'),
  },
  JPN: {
    id: 'JPN', squad: 'heal', kind: 'kid', emoji: '👧',
    name: () => t('Хана'),
    role: () => t('садівниця 🌸'),
    thanks: () => t('Аріґато! Ти врятував мене — прикрашу табір цвітом сакури!'),
    greeting: () => t('Поглянь, як цвіте моя сакура в таборі — це для тебе! 🌸'),
  },
  CHN: {
    id: 'CHN', squad: 'lure', kind: 'granny', emoji: '👵',
    name: () => t('Бабуся Лі'),
    role: () => t('ліхтарниця 🏮'),
    thanks: () => t('Сєсє! Ти визволив мене — засвічу ліхтарі для табору!'),
    greeting: () => t('Мої ліхтарики світять кожному другові табору — заходь! 🏮'),
  },
};

// Скільки друзів усього (лише кампанія — 12)
export const FRIEND_TOTAL = CAMPAIGN_ORDER.length;

// Дані друга для країни (або null для секретних/невідомих країн)
export function friendFor(countryId) {
  return FRIENDS[countryId] || null;
}

// Чи врятований друг цієї країни (безпечно для будь-якого сейва)
export function isFriendRescued(save, cid) {
  return !!(save && save.friends && save.friends[cid]);
}

// Список id країн, чиїх друзів уже врятовано (лише кампанія, у порядку кампанії)
export function rescuedFriendIds(save) {
  if (!save || !save.friends) return [];
  return CAMPAIGN_ORDER.filter((id) => save.friends[id]);
}

// Скільки друзів врятовано (0..12)
export function rescuedFriendCount(save) {
  return rescuedFriendIds(save).length;
}

// 🏕️ Рівень «оживлення» табору за кількістю друзів (для декору Бази):
//  1+ → намет+багаття, 4+ → лавки+стіл, 8+ → гірлянда ліхтариків, 12 → прапор «ВСІ ВРЯТОВАНІ»
export function campTier(count) {
  return {
    tent: count >= 1,
    benches: count >= 4,
    garland: count >= 8,
    allFlag: count >= FRIEND_TOTAL,
  };
}

// «Щоденне дякую»: відкривається, коли врятовано ≥3 друзів. Ключ дня — той самий формат
// YYYY-MM-DD, що DailyGift.dayKey (локальний, НЕ UTC). save.friendThanks = день останньої видачі.
const FRIEND_THANKS_MIN = 3;
export const FRIEND_THANKS_COINS = 20;

export function friendThanksUnlocked(save) {
  return rescuedFriendCount(save) >= FRIEND_THANKS_MIN;
}

export function friendThanksPending(save, dayKey) {
  if (!friendThanksUnlocked(save)) return false;
  return dayKey > ((save && save.friendThanks) || '');
}

// Детерміновано вибрати якір клітки з storySites (fallback sites), НЕ арену боса.
// Беремо якір, НАЙДАЛЬШИЙ від спавну гравця (fallback — від арени): клітка тулиться в кут
// карти, подалі від старту. Це і тримає перф-бюджет (далекий кут фрустум-калиться на
// кадрі-заміру спавну), і прибирає клітку зі стартового поля бою. Стабільно між забігами;
// Швеція на карті Польщі працює автоматично (читаємо country.map).
function pickCageSite(country, rng) {
  const map = country && country.map;
  if (!map) return null;
  const sites = map.storySites || map.sites || {};
  const arena = sites.arena || (map.sites && map.sites.arena) || null;
  const ref = map.spawn || arena || { x: 0, z: 0 };
  const keys = Object.keys(sites).filter((k) => k !== 'arena' && sites[k]);
  if (!keys.length) return null;
  let best = null;
  let bestD = -1;
  for (const k of keys) {
    const s = sites[k];
    const d = Math.hypot(s.x - ref.x, s.z - ref.z);
    if (d > bestD) { bestD = d; best = s; }
  }
  if (!best) {
    const f = rng && rng.f ? rng.f() : Math.random();
    best = sites[keys[Math.floor(f * keys.length) % keys.length]];
  }
  return best ? { x: best.x, z: best.z, r: best.r || 8 } : null;
}

const FREE_TIME = 2.0;      // 2с прогрес звільнення
const REACH = 2.5;          // підійти на ≤2.5м
const GUARD_RADIUS = 10;    // сторожі у межах ~10м мусять бути мертві
const NEAR_PROMPT = 7;      // з якої відстані показуємо підказку

// 🔒 Клітка з другом у соло-рівні. Створюється лише для соло-кампанії (useStory).
export class HiddenRescue {
  constructor(level) {
    this.level = level;
    this.game = level.game;
    this.cid = level.countryId;
    this.friend = friendFor(this.cid);
    this.active = false;      // клітка присутня на карті
    this.state = 'idle';      // 'idle' | 'freeing' | 'rescued'
    this.rescued = false;
    this.freeT = 0;
    this.hintShown = false;
    this.prompt = null;       // { text, hold, progress } — читає HUD як резерв
    this.group = null;
    this.rig = null;
    this.beam = null;
    this.guards = [];
    this.cageX = 0; this.cageZ = 0; this.cageY = 0;
    this._despawnT = -1;
    if (!this.friend) return;
    // повторне проходження після порятунку → друга вже в таборі, клітки нема
    if (isFriendRescued(this.game.save, this.cid)) return;
    this._spawn();
  }

  _spawn() {
    const level = this.level;
    const site = pickCageSite(level.country, level.rng);
    if (!site) return;
    const rng = level.rng;
    const ang = rng.range ? rng.range(0, Math.PI * 2) : Math.random() * Math.PI * 2;
    const off = 4 + (rng.range ? rng.range(0, 3) : Math.random() * 3);
    const x = site.x + Math.cos(ang) * off;
    const z = site.z + Math.sin(ang) * off;
    const y = level.world && level.world.groundH ? level.world.groundH(x, z) : 0;
    this.cageX = x; this.cageZ = z; this.cageY = y;

    // 🪵 дерев'яна клітка: усі прути — ОДИН InstancedMesh (1 draw call, перф-бюджет),
    // плюс два обіди-кільця. Геометрія per-cage — звільниться з рівнем.
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const woodM = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
    const woodDark = new THREE.MeshLambertMaterial({ color: 0x5f3d22 });
    const barGeo = new THREE.BoxGeometry(0.12, 2.1, 0.12);
    const R = 1.35;
    const BARS = 10;
    const bars = new THREE.InstancedMesh(barGeo, woodM, BARS);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2;
      m4.makeTranslation(Math.cos(a) * R, 1.05, Math.sin(a) * R);
      bars.setMatrixAt(i, m4);
    }
    bars.instanceMatrix.needsUpdate = true;
    group.add(bars);
    // верхнє і нижнє кільце-обід
    const ringGeo = new THREE.TorusGeometry(R, 0.09, 6, 16);
    const top = new THREE.Mesh(ringGeo, woodDark);
    top.rotation.x = Math.PI / 2;
    top.position.y = 2.05;
    const bot = new THREE.Mesh(ringGeo, woodDark);
    bot.rotation.x = Math.PI / 2;
    bot.position.y = 0.1;
    group.add(top, bot);
    level.scene.add(group);
    this.group = group;

    // 👤 друг у клітці (наляканий — 'cower')
    const rig = makeCivilian(this.friend.kind || 'kid', rng);
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = ang;
    setAnim(rig, 'cower');
    level.scene.add(rig.group);
    this.rig = rig;

    // 🧟 3–5 сторожів через стандартний Zombies.spawn (мутатори/складність застосуються)
    const nGuards = 3 + Math.floor((rng.f ? rng.f() : Math.random()) * 3); // 3..5
    const guardType = (level.country && level.country.extraZombie) || 'walker';
    for (let i = 0; i < nGuards; i++) {
      const ga = (i / nGuards) * Math.PI * 2 + ang;
      const gr = 3.2 + (rng.range ? rng.range(0, 2) : Math.random() * 2);
      const gx = x + Math.cos(ga) * gr;
      const gz = z + Math.sin(ga) * gr;
      const zt = i === 0 ? 'walker' : guardType;
      const zb = level.zombies.spawn(zt, gx, gz, { guard: true, anchor: { x, z, r: 12 } });
      if (zb) this.guards.push(zb);
    }
    this.active = true;
  }

  update(dt, input, allowControl) {
    if (!this.active) return;
    if (this.rig) updateRig(this.rig, dt);

    if (this.state === 'rescued') {
      if (this._despawnT > 0) {
        this._despawnT -= dt;
        // клітка «розкривається»: перекидається і тоне
        if (this.group) {
          this.group.rotation.z += dt * 1.6;
          this.group.position.y -= dt * 0.6;
        }
        if (this._despawnT <= 0) this._finishDespawn();
      }
      return;
    }

    const p = this.level.player.pos;
    const dist = Math.hypot(p.x - this.cageX, p.z - this.cageZ);
    const guardsAlive = this._guardsAliveNear();

    // 👀 одноразова підказка: коли всі основні місії зроблено, а друга ще не звільнено
    if (!this.hintShown && this.level.missions && this.level.missions.bossUnlocked) {
      this.hintShown = true;
      if (this.game.hud) this.game.hud.toast(t('👀 Десь тут ще схований друг — шукай клітку!'));
      if (this.level.effects && this.level.effects.makeBeam && !this.beam) {
        this.beam = this.level.effects.makeBeam(this.cageX, this.cageZ, 0x4cff7a, '🤝');
      }
    }

    if (this.state === 'freeing') {
      if (dist > REACH + 0.7 || guardsAlive || !allowControl || !input || !input.down('KeyE')) {
        this.freeT = Math.max(0, this.freeT - dt * 0.8);
        this.state = this.freeT <= 0 ? 'idle' : 'freeing';
      } else {
        this.freeT += dt;
        if (this.level.effects && Math.random() < dt * 5) {
          this.level.effects.burst(new THREE.Vector3(this.cageX, this.cageY + 1.2, this.cageZ), 0x4cff7a, 2, { speed: 1.4, up: 2, life: 0.35, size: 0.6 });
        }
        if (this.freeT >= FREE_TIME) { this._rescue(); return; }
      }
      this.prompt = { text: t('Тримай {k} — визволь друга', { k: interactKey() }), hold: true, progress: Math.min(1, this.freeT / FREE_TIME) };
      return;
    }

    // idle: чи можна почати звільнення?
    if (dist <= REACH && !guardsAlive) {
      this.prompt = { text: t('Тримай {k} — визволь друга', { k: interactKey() }), hold: true, progress: 0 };
      if (allowControl && input && input.down('KeyE')) this.state = 'freeing';
    } else if (dist <= NEAR_PROMPT && guardsAlive) {
      // 🎓 перша клітка друга в полі зору — разова підказка
      if (this.game.hud) this.game.hud.hintOnce('cage1', t('🗝️ ДРУГ У КЛІТЦІ!'), t('Там друг у клітці! Здолай сторожів і звільни! 🗝️'));
      this.prompt = { text: t('🔒 Спершу здолай сторожів клітки!'), hold: false };
    } else {
      this.prompt = null;
    }
  }

  // сторожі саме цієї клітки в радіусі — щоб чужі зомбі поблизу не блокували звільнення
  _guardsAliveNear() {
    return this.guards.some((z) => z && z.state !== 'dead' && !z.gone
      && Math.hypot(z.x - this.cageX, z.z - this.cageZ) < GUARD_RADIUS);
  }

  _rescue() {
    if (this.rescued) return;
    this.rescued = true;
    this.state = 'rescued';
    this.prompt = null;
    const save = this.game.save;
    if (!save.friends || typeof save.friends !== 'object') save.friends = {};
    save.friends[this.cid] = true;
    this.game.saveGame();
    // 🥚 R5: кожен 3-й друг дарує яйце петса — main.js слухає й видає (уникаємо import-циклу
    // eggs.js↔friends.js, тримаючи логіку/тост нагорода-стороною).
    if (this.level && this.level.bus) this.level.bus.emit('friendRescued', this.cid);

    const f = this.friend;
    if (this.rig) setAnim(this.rig, 'cheer');
    if (this.level.audio && this.level.audio.mission) this.level.audio.mission();
    if (this.level.effects) {
      const pos = new THREE.Vector3(this.cageX, this.cageY + 1.4, this.cageZ);
      if (this.level.effects.totemBurst) this.level.effects.totemBurst(pos);
      else if (this.level.effects.burst) this.level.effects.burst(pos, 0xffd23f, 18, { speed: 3.5, up: 4, life: 0.7, size: 1.1 });
    }
    if (this.game.hud) {
      // 🗣️ репліка-подяка через той самий банер, що інтро глави сторі-місій
      this.game.hud.banner(`${f.emoji} ${f.name()}`, f.thanks(), 5);
      this.game.hud.toast(t('🤝 Друга врятовано! Він оселився у таборі'));
    }
    // 🤝 makeBeam повертає ХЕНДЛ {group, remove()}, а не Object3D — scene.remove(handle) був
    // би нопом і промінь+спрайт світилися б над порожньою кліткою весь рівень. remove() чистить.
    if (this.beam) { this.beam.remove(); this.beam = null; }
    this._despawnT = 1.6;
  }

  _finishDespawn() {
    if (this.game.hud) this.game.hud.toast(t('🏕️ {name} побіг у табір!', { name: this.friend.name() }));
    if (this.rig && this.rig.group && this.level.scene) this.level.scene.remove(this.rig.group);
    if (this.rig) disposeRigSkeleton(this.rig);
    this._disposeCage();
    this.rig = null;
    this.group = null;
    this.active = false;
    this._despawnT = -1;
  }

  // 🧹 v294: клітка тримає per-instance гео/матеріали (BoxGeometry прути в InstancedMesh + два
  // TorusGeometry обіди + 2 Lambert) — endLevel викликає dispose() ДО обходу сцени, тож інакше
  // до них не дійде. Звільняємо тут за домашнім патерном (disposeObject береже userData.shared).
  _disposeCage() {
    if (!this.group) return;
    if (this.level && this.level.scene) this.level.scene.remove(this.group);
    disposeObject(this.group);
  }

  dispose() {
    this.prompt = null;
    if (this.rig && this.rig.group && this.level && this.level.scene) this.level.scene.remove(this.rig.group);
    if (this.rig) disposeRigSkeleton(this.rig);
    this._disposeCage();
    if (this.beam) { this.beam.remove(); this.beam = null; }
    this.rig = null; this.group = null; this.guards = [];
  }
}

// зручний ре-експорт для тих, хто вже імпортує friends.js
export { COUNTRIES };
