// 🎁 Нагороди: скрині, яйця, супер-сили, церемонія скрині, мегабокс, розблок зброї.
// v305: винесено ВЕРБАТИМ із src/main.js (const-и + тіла методів) — this→game, делегати лишились у Game.
import * as THREE from 'three';
import { t } from './i18n.js';
import {
  claimFriendEggs, openEgg, feedPet,
  ELITE_CHEST_EGG_CHANCE, GOLDEN_CHEST_EGG_CHANCE,
} from './eggs.js';
import { friendFor } from './friends.js';
import { bumpWeeklyCamp, weeklyCampReminder } from './weeklycamp.js';
import { PETS, HERO_SKINS, DANCES } from './characters.js';
import { COUNTRIES, CAMPAIGN_ORDER } from './countries.js';
import { pickSecondaryObjective, COOP_SECONDARY_IDS } from './stars.js';
import { SuperPickup } from './extras.js';

// 🎁 v302: єдина таблиця нагород скринь — числа продубльовані у 4 місцях (соло-хендлери
// eliteWaveCleared/goldenChest + кооп-гранти _grantEliteChestCoop/_grantGoldenChestCoop).
// Значення рантайму лишаються ті самі, що були захардкоджені.
export const CHEST_REWARDS = {
  elite: { coins: 120, crystals: 3, eggChance: ELITE_CHEST_EGG_CHANCE },
  golden: { coins: 144, crystals: 5, eggChance: GOLDEN_CHEST_EGG_CHANCE },
};

// 🌟 v302: єдина таблиця суперсил — тривалість/лейбли/іконки/кольори були продубльовані
// у _grantSuperCoop/_activateSuperPower/_superBannerFor. Лейбли — ЛІНИВІ функції (),
// бо t() залежить від поточної мови (обчислюємо на момент показу, не імпорту).
const SUPER_POWERS = {
  shkval: {
    dur: 12,
    label: () => t('🔥 ШКВАЛ'),
    sub: () => t('Безлім патронів + скорострільність!'),
    flash: 'rgba(255,120,60,0.55)',
    color: 0xff7a3c,
  },
  magnet: {
    dur: 15,
    label: () => t('🧲 МАГНІТ-БУРЯ'),
    sub: () => t('Магніт монет + швидкість!'),
    flash: 'rgba(102,221,255,0.55)',
    color: 0x66ddff,
  },
};

// 🤝 v296 «Еліти разом»: нагорода зачистки елітної хвилі в коопі — КОЖЕН гравець
// (і хост, і гість по ev `ewc`) нараховує собі локально ті самі числа, що соло,
// але без блокуючої церемонії (рішення v294): неблокуючий банер зі складом.
export function grantEliteChestCoop(game) {
  if (game.level?.noProgress) return;
  const { coins, crystals, eggChance } = CHEST_REWARDS.elite;
  game.level.addCoins(coins);
  game.save.crystals = (game.save.crystals || 0) + crystals;
  const gotEgg = game._rollChestEgg(eggChance); // незалежний рол у кожного
  game.hud.banner(t('🎁 СКРИНЯ ЕЛІТНОЇ ХВИЛІ!'), t('+{c} 💰   +{k} 💎', { c: coins, k: crystals }), 4.5);
  if (gotEgg) game.hud.toast(t('🥚 У скрині було яйце!'), 5);
  game.saveGame();
}

// 🤝 v296: золота скриня в коопі — той самий локальний, неблокуючий шлях (числа соло: 144🪙+5💎).
export function grantGoldenChestCoop(game) {
  if (game.level?.noProgress) return;
  const { coins, crystals, eggChance } = CHEST_REWARDS.golden;
  game.level.addCoins(coins);
  game.save.crystals = (game.save.crystals || 0) + crystals;
  const gotEgg = game._rollChestEgg(eggChance);
  game.hud.banner(t('🏆 ЗОЛОТА СКРИНЯ!'), t('+{c} 💰   +{k} 💎', { c: coins, k: crystals }), 4.5);
  if (gotEgg) game.hud.toast(t('🥚 У скрині було яйце!'), 5);
  game.saveGame();
}

// 🥚 R5: чи включити яйце в церемонію скрині (solo-only). Тест форсить через _forceChestEgg.
export function rollChestEgg(game, chance) {
  const roll = typeof game._forceChestEgg === 'boolean' ? (game._forceChestEgg ? 0 : 1) : Math.random();
  if (roll >= chance) return false;
  game.save.eggs = (game.save.eggs || 0) + 1;
  return true;
}

// 🤝 R5: друга врятовано → кожен 3-й дарує яйце (ретро-безпечно через friendEggClaims).
export function onFriendRescued(game, cid) {
  if (game.level?.noProgress) return;
  game._bumpCamp('rescue', 1); // 🏕️ звільнений друг — теж «врятована людина» для квесту табору
  const granted = claimFriendEggs(game.save);
  if (granted > 0) {
    const f = friendFor(cid);
    const who = f ? f.name() : t('Друг');
    game.hud.toast(t('🥚 {who} дарує тобі яйце петса! Відкрий у Альбомі → 🐾 Петси', { who }), 5);
    game.saveGame();
  }
}

// 🏕️ тік тижневого квесту табору від ЛОКАЛЬНОЇ події гравця (соло І кооп). Коли квест
// САМЕ виконано — теплий банер + чип-нагадування на глобусі + сейв. Проміжний прогрес
// не пише сейв на кожній події (як _bumpWeeklyGoal) — його підхопить наступний saveGame.
export function bumpCamp(game, metric, amount = 1) {
  if (game.level?.noProgress) return false;
  const done = bumpWeeklyCamp(game.save, game._weekIndex(), metric, amount);
  if (done) {
    game.hud.banner(t('🏕️ КВЕСТ ТАБОРУ ВИКОНАНО!'), t('Забери 🥚 у таборі бази!'), 4.5);
    game._refreshCampChip();
    game.saveGame();
  }
  return done;
}

// 🏕️ показ/сховок чипа-нагадування «📌 Квест табору» на глобусі (виконано й не забрано)
export function refreshCampChip(game) {
  const chip = document.getElementById('camp-quest-chip');
  if (chip) chip.classList.toggle('show', weeklyCampReminder(game.save, game._weekIndex()));
}

// 🥚 відкрити одне яйце з Альбому → церемонія скрині: новий петс АБО дублікат → корм ×2
export function openEggFromAlbum(game) {
  if ((game.save.eggs || 0) <= 0) { game.audio.denied(); return; }
  const res = openEgg(game.save);
  if (!res) { game.audio.denied(); return; }
  const meta = PETS[res.petId];
  if (res.duplicate) {
    game.chestCeremony({
      title: t('🥚 З ЯЙЦЯ!'), sub: t('{i} {n} вже з тобою — це корм!', { i: meta.icon, n: meta.name }),
      items: [{ icon: '🍖', label: t('Корм ×{n}', { n: res.food }) }],
    });
  } else {
    game.chestCeremony({ title: t('🥚 НОВИЙ ПЕТС!'), sub: meta.name, items: [{ icon: meta.icon, label: meta.name }] });
  }
  game.saveGame();
  game.renderAlbum();
}

// 🍖 годуємо петса кормом → наступний рівень (більший + баф магніту, іскри на Рів.3)
export function feedPetFromAlbum(game, id) {
  const lv = feedPet(game.save, id);
  if (!lv) { game.audio.denied(); return; }
  game.audio.purchase();
  game.hud.toast(t('🍖 {n} виріс до Рівня {lv}!', { n: PETS[id].name, lv }));
  if (game.save.activePet === id) game.spawnPet(); // перестворюємо для нового масштабу/іскор
  game.saveGame();
  game.renderAlbum();
}

// ⭐ R3 «Зірки разом» (v298): детермінований рол КОМАНДНОЇ вторинної цілі кооп-кампанії.
// Викликає coop.startLevel ПЕРЕД розсилкою spec, щоб `so` доїхав обом сторонам однаково.
// Пул звужено (COOP_SECONDARY_IDS) до цілей, які ХОСТ бачить авторитетно для всієї команди
// (див. коментар у stars.js). Тест форсить тип через _forceSecondary. Повертає {id,target} або null.
export function rollCoopSecondary(game, countryId, seed) {
  const country = COUNTRIES[countryId];
  if (!country || !CAMPAIGN_ORDER.includes(countryId)) return null;
  const pool = COOP_SECONDARY_IDS;
  const forced = game._forceSecondary && pool.includes(game._forceSecondary) ? game._forceSecondary : null;
  const id = forced || pool[(((seed | 0) % pool.length) + pool.length) % pool.length];
  const so = pickSecondaryObjective(country, 0, id);
  return { id: so.id, target: so.target };
}

// ⭐ R3: тік вторинної цілі забігу (⭐2). Викликається з відповідних подій.
// Соло: level.secondaryObjective виставляється лише у соло-кампанії — тікає локально.
// Кооп: прогрес КОМАНДНИЙ і авторитетний у ХОСТА. Гість-дзеркало НЕ тікає локально —
// він отримує progress у снапшоті (snap.so) і виконання подією `soc`. На виконанні хост
// шле `soc` → тік+дзвіночок+тост у всіх (як соло).
export function bumpSecondary(game, level, ev, n = 1) {
  const so = level && level.secondaryObjective;
  if (!so || so.done || so.ev !== ev) return;
  if (level.net && !level.net.authority) return; // гість не рахує сам — прогрес йде від хоста
  so.progress = Math.min(so.target, so.progress + n);
  if (so.progress >= so.target) {
    so.done = true;
    game._secondaryDoneToast(level);
    if (level.net && level.net.authority) level.netEv('soc'); // сповіщаємо команду
  }
}

// ⭐ v302: спільний тост+дзвіночок «ціль забігу виконана» — соло/хост тікають у
// _bumpSecondary, кооп-гість дублював це в net/client.js по ev `soc`. Текст/звук ті самі.
export function secondaryDoneToast(game, level) {
  const so = level && level.secondaryObjective;
  if (!so) return;
  game.audio.questDone();       // 🔔 дзвіночок «ціль виконана»
  game.hud.toast(t('⭐ Ціль забігу виконана: {l}!', { l: so.label() }));
}

// 🌟 «момент могутності» (v288): спавн супер-пікапа 1×/рівень.
// Тригер — перше з: 2-га здана місія АБО старт елітної хвилі.
// v297 «Сила разом»: у коопі спавнить ЛИШЕ хост (authority) — гість малює дзеркало по `spx`.
export function trySuperPickup(game, level) {
  if (!level || (level.net && !level.net.authority) || !level.superEligible) return;
  if (level.superSpawned || level.superPickup) return;
  if (level.player.health <= 0) return;
  level.superSpawned = true;
  const nid = (level.net && level.net.authority) ? level.net.allocId() : null;
  level.superPickup = new SuperPickup(level, game._forceSuperPower || null, nid ? { nid } : {});
  // кооп-хост: телеграф гостям — дзеркальна зірка (позиція від хоста; тип лишається у хоста,
  // бо підбір host-authoritative — гість дізнається силу лише при `spg`).
  if (nid) {
    const sp = level.superPickup;
    level.netEv('spx', nid, Math.round(sp.x * 10) / 10, Math.round(sp.z * 10) / 10);
  }
}

// 🌟 кооп-дзеркало супер-пікапа в гостя (події `spx` / state-синк mid-join). Лише візуал.
export function spawnSuperMirror(game, nid, x, z) {
  const level = game.level;
  if (!level) return;
  if (level.superPickup) { level.superPickup.remove(); level.superPickup = null; }
  level.superPickup = new SuperPickup(level, null, { nid, x, z, mirror: true });
  level.superSpawned = true;
}

// 🌟 кооп-тік host-authority: підбір зірки будь-яким живим гравцем + згасання сил гостей.
export function updateCoopSuper(game, level, dt) {
  const net = level.net;
  if (!net || !net.authority) return;
  // згасання активних сил гостей (ttl для магніт-бурі у getPickupTargets)
  if (level.superActive) {
    for (const [pid, s] of level.superActive) {
      s.t -= dt;
      if (s.t <= 0) level.superActive.delete(pid);
    }
  }
  const sp = level.superPickup;
  if (!sp || sp.done || !sp.nid) return;
  // перший живий гравець у радіусі бере зірку (радіус трохи щедріший за соло — лаг гостей)
  for (const pl of level.players || []) {
    if (pl.health <= 0) continue;
    if (Math.hypot(pl.pos.x - sp.x, pl.pos.z - sp.z) < 3.6) {
      game._grantSuperCoop(level, pl.pid, sp);
      break;
    }
  }
}

// 🌟 кооп-хост роздає силу: despawn у всіх, активація в грабера, банер решті.
export function grantSuperCoop(game, level, pid, sp) {
  const power = sp.type;
  const nid = sp.nid;
  sp.remove();
  level.superPickup = null;
  level.netEv('spg', nid, pid, power); // гостям: активація у грабера, банер решті
  // силу гостя хост тримає в мапі (магніт-буря в лут-циклі + знання про Шквал гостя).
  // Свою (pid 1) не пишемо — читаємо player.superPower напряму (див. getPickupTargets).
  if (pid !== 1 && level.superActive) level.superActive.set(pid, { power, t: SUPER_POWERS[power]?.dur || 12 });
  if (pid === 1) game._activateSuperPower(level, power); // хост схопив сам → локальна активація
  else game._superBannerFor(pid, power);                 // друг схопив → у хоста лише банер
}

// 🌟 банер «друг схопив силу» + короткий стінгер (реюз звуку супера) — у всіх, крім грабера.
export function superBannerFor(game, pid, power) {
  const roster = game.coop && game.coop.session && game.coop.session.roster;
  const r = roster && roster.get(pid);
  const nick = (r && r.nick) || t('Друг');
  const label = (SUPER_POWERS[power] || SUPER_POWERS.magnet).label();
  game.hud.banner(t('⭐ {n} схопив {p}!', { n: nick, p: label }), t('Сила разом! 💪'), 3.2);
  game.audio.superStart(power);
}

// 🌟 активація сили: слоу-мо 0.5с (reuse hitstop), золотий спалах, банер, стінгер.
// Соло — через bus 'superPickupGrabbed'; кооп — прямий виклик у грабера (`spg`/хост-підбір).
// Спрацьовує ЛИШЕ в того, хто взяв: слоу-мо/спалах/чип відліку бачить тільки він.
export function activateSuperPower(game, level, type) {
  const spec = SUPER_POWERS[type] || SUPER_POWERS.shkval;
  const dur = spec.dur;
  level.player.superPower = { type, t: dur, dur };
  game._hitstopT = Math.max(game._hitstopT, 0.5); // 0.5с слоу-мо (той самий хук, що хітстоп)
  game.audio.superStart(type);
  game.hud.powerFlash(spec.flash);
  if (level.effects) {
    const p = level.player;
    const col = spec.color;
    level.effects.ring(new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z), col, 4);
    level.effects.burst(new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), col, 24, { speed: 6, up: 6, life: 0.9, size: 1.4 });
  }
  game.hud.banner(spec.label(), spec.sub(), 3.4);
  level.superPickup = null;
}

// 🦙 нагорода Мегабокса: pity гарантує круте після 2 невдач
export function openMegaboxReward(game, x, z) {
  const save = game.save;
  const level = game.level;
  const items = []; // 🎁 v287: перелік нагород для церемонії скрині
  if (Math.random() < 0.78) {
    save.crystals = (save.crystals || 0) + 15;
    items.push({ icon: '💎', n: 15 });
  }
  const unownedSkins = ['frog', 'super'].filter((id) => !save.skins.includes(id));
  const unownedDances = ['jump', 'chicken'].filter((id) => !save.dances.includes(id));
  const hasCosmetic = unownedSkins.length + unownedDances.length > 0;
  let roll = Math.random();
  if (game._megaForce !== undefined) { roll = game._megaForce; game._megaForce = undefined; }
  let title, sub;
  if (hasCosmetic && (save.megaPity >= 2 || roll < 0.45)) {
    save.megaPity = 0;
    const pickSkin = unownedSkins.length && (!unownedDances.length || roll < 0.25);
    if (pickSkin) {
      const id = unownedSkins[0];
      save.skins.push(id);
      title = t('{i} НОВИЙ СКІН!', { i: HERO_SKINS[id].icon });
      sub = t('«{n}» — одягни в Гардеробі 🎒', { n: HERO_SKINS[id].name });
      items.push({ icon: HERO_SKINS[id].icon, label: HERO_SKINS[id].name });
    } else {
      const id = unownedDances[0];
      save.dances.push(id);
      save.activeDance = id;
      title = t('{i} НОВИЙ ТАНЕЦЬ!', { i: DANCES[id].icon });
      sub = t('«{n}» — натисни N і танцюй!', { n: DANCES[id].name });
      items.push({ icon: DANCES[id].icon, label: DANCES[id].name });
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
      items.push({ icon: '💰', label: t('фонтан!') });
    } else if (roll < 0.83) {
      if (level) {
        level.player.grenades += 3;
        level.player.addRockets(2);
        level.player.addAmmo(120);
      }
      title = t('🧨 БОЙОВИЙ НАБІР!');
      sub = t('+3 гранати, +2 ракети і гора патронів!');
      items.push({ icon: '💣', n: 3 }, { icon: '🚀', n: 2 }, { icon: '🔫', n: 120 });
    } else {
      for (const k of ['speed', 'rage', 'bubble', 'magnet']) level.player.buffs[k] = 20;
      title = t('🌈 УСІ ПІДСИЛЕННЯ!');
      sub = t('Швидкість, лють, бульбашка і магніт — на 20 секунд!');
      items.push({ icon: '⚡', label: t('20с') }, { icon: '💪', label: t('20с') }, { icon: '🛡', label: t('20с') }, { icon: '🧲', label: t('20с') });
    }
  }
  // 🎁 v287: замість миттєвого банера — соковита церемонія скрині (нагороди ті самі)
  // 🤝 v294: у коопі церемонія морозила б лише когось одного / ковтала постріли — тому в коопі
  // повертаємо до-v287 неблокуючий банер (нагороди вже видані вище).
  if (level && level.net) {
    // v300: банер губив items — 💎-грант ішов мовчки (решта нагород уже описана в sub)
    const extra = items.filter((it) => it.icon === '💎' && typeof it.n === 'number').map((it) => `${it.icon} +${it.n}`).join(' · ');
    game.hud.banner(title, extra ? (sub ? `${sub} · ${extra}` : extra) : sub, 4.5);
  } else game.chestCeremony({ title, sub, items });
  game.saveGame();
}

// 🎁 Церемонія скрині (v287): reusable DOM/CSS — трясеться → вибух → предмети вилітають
// по одному з count-up → авто-закриття. Тап пропускає до підсумку. Не паузить сим (як банер/
// мегабокс — просто DOM-оверлей поверх). items: [{icon, n}] (count-up) або [{icon, label}].
export function chestCeremony(game, { title = t('🎁 СКРИНЯ!'), sub = '', items = [] } = {}) {
  const root = document.getElementById('chest-ceremony');
  if (!root) return;
  // якщо попередня церемонія ще йде — миттєво закриваємо (черга не потрібна дітям).
  // v300: relock успадковуємо від перерваної церемонії — document.pointerLockElement
  // зараз null (lock уже відпущено), і без цього другий поспіль сундук губив мишу.
  const prevRelock = !!(game._chestState && game._chestState.relock);
  if (game._chestState) game._closeChest(true);
  game.audio.megabox(); // барабанний дріб + «тада!» (reuse наявного стінгера)
  const iconEl = root.querySelector('.chest-icon');
  const titleEl = root.querySelector('.chest-title');
  const subEl = root.querySelector('.chest-sub');
  const itemsEl = root.querySelector('.chest-items');
  titleEl.textContent = title;
  subEl.textContent = sub;
  itemsEl.innerHTML = '';
  iconEl.textContent = '🎁';
  root.classList.remove('burst');
  root.classList.add('show', 'shaking');
  root.setAttribute('aria-hidden', 'false');
  const state = { timers: [], busted: false };
  game._chestState = state;
  // 🖱️ v295: pointer lock перехоплює ВСІ mouse-події на #chest-ceremony (клік миші не спрацьовував,
  // хоч тач і працював) — тож на час церемонії відпускаємо lock і повертаємо його по закриттю.
  state.relock = prevRelock || !!document.pointerLockElement;
  game.input.exitLock();
  // ⌨️ v295: клавіатурний скіп (пробіл/ентер) — той самий обробник, що й клік по оверлею.
  state.onKey = (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (root.onclick) root.onclick();
    }
  };
  window.addEventListener('keydown', state.onKey);
  const T = (fn, ms) => { const id = setTimeout(fn, game.testMode ? 0 : ms); state.timers.push(id); return id; };
  const revealItem = (it) => {
    const chip = document.createElement('div');
    chip.className = 'chest-item';
    const hasN = typeof it.n === 'number';
    chip.innerHTML = `<span class="ci-icon">${it.icon}</span><span class="ci-val">${hasN ? '0' : (it.label || '')}</span>`;
    itemsEl.appendChild(chip);
    requestAnimationFrame(() => chip.classList.add('in'));
    if (hasN) {
      const valEl = chip.querySelector('.ci-val');
      const target = it.n;
      const stepN = Math.max(1, Math.round(target / 16));
      let cur = 0;
      const up = () => {
        cur = Math.min(target, cur + stepN);
        valEl.textContent = String(cur);
        if (cur < target) state.timers.push(setTimeout(up, game.testMode ? 0 : 45));
      };
      up();
    }
  };
  const burst = () => {
    if (state.busted) return;
    state.busted = true;
    root.classList.remove('shaking');
    root.classList.add('burst');
    iconEl.textContent = '📦';
    game._spawnChestConfetti(root);
    const shown = items.length ? items : [{ icon: '🎁', label: '' }];
    shown.forEach((it, i) => T(() => revealItem(it), i * 420));
    T(() => game._closeChest(), shown.length * 420 + 2600);
  };
  T(burst, 1150); // трясеться ~1.2с, потім вибух
  // тап будь-де — пропустити: спершу показуємо весь підсумок, потім закриваємо
  root.onclick = () => {
    if (!state.busted) {
      state.timers.forEach(clearTimeout);
      state.timers = [];
      burst();
    } else {
      game._closeChest();
    }
  };
}

// skipRelock — виклик із chestCeremony(): наступна церемонія стартує одразу і сама
// вирішить долю lock'а (успадкований relock), тож проміжний request() лише заважає.
export function closeChest(game, skipRelock = false) {
  const root = document.getElementById('chest-ceremony');
  let relock = false;
  if (game._chestState) {
    game._chestState.timers.forEach(clearTimeout);
    if (game._chestState.onKey) window.removeEventListener('keydown', game._chestState.onKey);
    relock = !!game._chestState.relock;
    game._chestState = null;
  }
  if (!root) return;
  root.classList.remove('show', 'shaking', 'burst');
  root.setAttribute('aria-hidden', 'true');
  root.onclick = null;
  const cf = root.querySelector('.chest-confetti');
  if (cf) cf.innerHTML = '';
  // 🖱️ v295: повертаємо pointer lock, якщо його тримали до церемонії і гру не блокує щось інше
  // (пауза/перемога/магазин/драфт) — інакше нав'язали б захоплення миші поверх іншого UI.
  if (!skipRelock && relock && game.level && !game.paused && !game.victoryShown && !game.shop.isOpen && !game.draft.isOpen) game.input.request();
}

export function spawnChestConfetti(game, root) {
  const cf = root.querySelector('.chest-confetti');
  if (!cf) return;
  cf.innerHTML = '';
  const cols = ['#ffd23f', '#4cff7a', '#44ccff', '#ff5d73', '#b086f2'];
  for (let i = 0; i < 40; i++) {
    const d = document.createElement('div');
    d.className = 'confetti-piece';
    d.style.left = Math.random() * 100 + '%';
    d.style.background = cols[i % cols.length];
    d.style.animationDelay = Math.random() * 0.8 + 's';
    d.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
    cf.appendChild(d);
  }
}

// нагорода-зброя за країну: видається і запам'ятовується назавжди.
// Якщо зброя вже куплена в магазині — компенсація монетами.
export function unlockWeapon(game, id) {
  if (!id) return; // 🛡 ESP/PRT/ITA більше не мають weaponReward — гард від unlockWeapon(undefined)
  if (!game.level) return;
  if (game.level.playground || game.level.noProgress) {
    game.level.player.giveWeapon(id);
    return;
  }
  if (game.save.weapons.includes(id)) {
    game.level.addCoins(300);
    game.hud.toast(t('🪙 Така зброя в тебе вже є — тримай +300 монет!'));
    return;
  }
  game.level.player.refillFuel(id); // 🔋 нова паливна зброя — повний балон
  game.save.weapons.push(id);
  const loadout = game._weaponLoadout();
  if (loadout.includes(id) || loadout.length < 7) {
    if (!loadout.includes(id)) game.save.weaponLoadout.push(id);
    game.level.player.giveWeapon(id);
  } else {
    game.hud.toast(t('🔓 Зброю відкрито! Додай її в Гардеробі — максимум 7.'));
  }
  game.saveGame();
}
