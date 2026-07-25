// 🏆 Екрани кінця: перемога, «Світ врятовано», нарахування зірок/порогів, медалі глав.
// v305: винесено ВЕРБАТИМ із src/main.js (рядки ~5303–5569) — this→game, делегати лишились у Game.
import { t } from '../i18n.js';
import { CHAPTER2, CHAPTER3 } from '../chapter.js';
import { XP_VALUES } from '../progress.js';
import { CAMPAIGN_ORDER, nextTarget } from '../countries.js';
import { TITLES } from '../titles.js';
import { starTotal, countryStars, CAMPAIGN_STAR_MAX, STAR_THRESHOLDS, STARS_PER_COUNTRY } from '../stars.js';
import { rescuedFriendCount, FRIEND_TOTAL } from '../friends.js';
import { claimStarEggs } from '../eggs.js';
import { hasLiberated } from '../net/cloudsave.js';

export function showVictory(game) {
  if (!game.level || game.victoryShown) return;
  if (game.level.playground || game.level.noProgress) return;
  if (game.level.operation && !game._frontCanComplete(game.level)) {
    game.level.frontObjectiveComplete = true;
    return;
  }
  game.victoryShown = true;
  // якщо гравця встигли вдарити в момент перемоги — скасовуємо смерть
  game.deathT = -1;
  game._hideOverlay('overlay-death');
  const country = game.level.country;
  if (game.level.operation) {
    const s = game.level.stats;
    const finalStage = game.level.operation.stage === 2;
    if (game.level.net && game.level.net.authority) {
      game.level.netEv('vict');
      game.level.net.flushEvents();
    }
    game._finishFrontStage(true);
    game.input.exitLock();
    document.querySelector('#overlay-victory h1').textContent = finalStage
      ? t('🌟 ОПЕРАЦІЮ ЗАВЕРШЕНО!')
      : t('✅ ЕТАП ПРОЙДЕНО!');
    document.querySelector('.victory-sub').textContent = finalStage
      ? t('Країна відбудовується, а проєкт Бази просунувся.')
      : t('Прогрес збережено. Наступний етап уже готовий.');
    document.getElementById('victory-stars').innerHTML = '';
    const rb = game.level.runBuild;
    document.getElementById('victory-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${s.kills}</span></div>
      <div class="stat"><span class="stat-icon">🎲</span><span class="stat-name">${t('Твоя збірка')}</span><span class="stat-val">${rb ? rb.summary() : '—'}</span></div>`;
    const next = document.getElementById('btn-victory-next');
    next.style.display = '';
    next.textContent = t('🛰️ ДО ФРОНТУ');
    document.getElementById('btn-victory-retry').style.display = 'none';
    document.getElementById('btn-victory-globe').style.display = 'none';
    game._showOverlay('overlay-victory');
    return;
  }
  if (game.level.expedition) {
    const s = game.level.stats;
    if (game.level.net && game.level.net.authority) {
      game.level.netEv('vict');
      game.level.net.flushEvents();
    }
    game._finishExpeditionNode(true);
    game.input.exitLock();
    document.querySelector('#overlay-victory h1').textContent = t('🧭 ЕТАП ПРОЙДЕНО!');
    document.querySelector('.victory-sub').textContent = t('Маршрут оновлено. Обери наступний виклик.');
    document.getElementById('victory-stars').innerHTML = '';
    const rb = game.level.runBuild;
    document.getElementById('victory-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${s.kills}</span></div>
      <div class="stat"><span class="stat-icon">🎲</span><span class="stat-name">${t('Твоя збірка')}</span><span class="stat-val">${rb ? rb.summary() : '—'}</span></div>`;
    const next = document.getElementById('btn-victory-next');
    next.style.display = '';
    next.textContent = t('🧭 ДО МАРШРУТУ');
    document.getElementById('btn-victory-retry').style.display = 'none';
    document.getElementById('btn-victory-globe').style.display = 'none';
    game._showOverlay('overlay-victory');
    return;
  }
  const wasLiberated = !!game.save.liberated[country.id];
  game.save.liberated[country.id] = true;
  if (!wasLiberated && !(game.save.upgrades.mapeditor > 0)) {
    game.save.upgrades.mapeditor = 1;
    game.hud.toast(t('🧱 Створювач карт відкрито! Повернися на глобус → Меню.'));
  }
  if (game.level.moonRegion) {
    const worldId = game.level.spaceWorld?.id || 'MOON';
    const space = game.save.moonRescue.space;
    const done = worldId === 'MOON' ? game.save.moonRegions : space.regions[worldId];
    const firstLanding = !done[game.level.moonRegion.id];
    done[game.level.moonRegion.id] = true;
    const colonies = space.colonies[worldId];
    colonies[game.level.moonRegion.id] = Math.min(3, (colonies[game.level.moonRegion.id] || 0) + 1);
    if (firstLanding) {
      const completed = Object.keys(done).length;
      space.ship.parts = completed < 4 ? completed : 0;
      if (completed >= 4) space.ship.level = Math.min(3, space.ship.level + 1);
      game.save.coins += 300;
      game.hud.toast(t('🚀 Нова колонія заснована! +300 монет'));
      // 🌍 разова нагорода за ПОВНІСТЮ освоєний світ: раніше 4-й регіон нічим не
      // відрізнявся від інших, тож MARS і EUROPA не мали фінішу
      if (completed >= 4) {
        space.worldClaims = Array.isArray(space.worldClaims) ? space.worldClaims : [];
        if (!space.worldClaims.includes(worldId)) {
          space.worldClaims.push(worldId);
          game.save.crystals = (game.save.crystals || 0) + 25;
          game.save.eggs = (game.save.eggs || 0) + 1;
          game.hud.banner(t('🌍 СВІТ ОСВОЄНО!'),
            t('Усі 4 регіони — 💎 +25 і 🥚 яйце петса'), 5);
        }
      }
    }
  }
  const infectedFirstWin = game.level.infected && !(game.save.infected && game.save.infected.cleared && game.save.infected.cleared[country.id]);
  // 🎁 нагорода-зброя країни видається ОДРАЗУ в момент перемоги (раніше з'являлась лише
  // після наступного завантаження, якщо у наборі не випала місія «зачистка складу»)
  if (country.weaponReward && !game.save.weapons.includes(country.weaponReward)) {
    game.save.weapons.push(country.weaponReward);
    const loadout = game._weaponLoadout();
    if (!loadout.includes(country.weaponReward) && loadout.length < 7) {
      loadout.push(country.weaponReward);
      game.save.weaponLoadout = loadout;
    }
    if (game.level.player && loadout.includes(country.weaponReward)) game.level.player.giveWeapon(country.weaponReward, false);
    if (country.weaponRewardToast) {
      game.hud.toast(typeof country.weaponRewardToast === 'function' ? country.weaponRewardToast() : country.weaponRewardToast);
    }
  } else if (!country.weaponReward && country.coinReward) {
    // 🇪🇸/🇮🇹 більше не дають зброю — натомість монети (вогнемет/лазер тепер за зірковий рівень)
    game.save.coins += country.coinReward;
    game.hud.toast(t('🏆 {n} звільнено! +{c} монет 💰', { n: country.name, c: country.coinReward }));
  }
  // 🧪 Глава 3: перша перемога в Лігві Вірусу — медаль, пет і кристали
  if (country.id === 'LAB' && !wasLiberated) {
    if (!Array.isArray(game.save.medals)) game.save.medals = [];
    if (!game.save.medals.includes(CHAPTER3.id)) game.save.medals.push(CHAPTER3.id);
    if (!game.save.pets.includes('slimepet')) game.save.pets.push('slimepet');
    game.save.crystals = (game.save.crystals || 0) + 25;
    game.hud.banner(t('🎖️ ГЛАВУ 3 ПРОЙДЕНО!'), t('{m} · 💎 +25 · Доктор Слизняк тепер твій пет! 🐾', { m: CHAPTER3.medalName }), 5);
  }
  // наступне проходження цієї країни отримає НОВИЙ набір місій
  game.save.missionRuns[country.id] = (game.save.missionRuns[country.id] || 0) + 1;
  const s = game.level.stats;
  // рекорди країни
  const prev = game.save.records[country.id];
  const isRecord = !prev || s.time < prev.time;
  if (isRecord) {
    game.save.records[country.id] = {
      time: Math.round(s.time), kills: s.kills, deaths: s.deaths,
      combo: game.level.combo.best,
    };
  }
  // ⭐ бонус монет за складність: тільки соло-реплей на зірці >1 (★1 — без змін)
  if (game.level.diffStar > 1) {
    const baseReward = s.coinsEarned;
    const bonus = Math.round(baseReward * 0.25 * (game.level.diffStar - 1));
    if (bonus > 0) {
      game.save.coins += bonus;
      s.coinsEarned += bonus;
      game.hud.toast(t('⭐ Бонус за складність: +{n} монет!', { n: bonus }));
    }
  }
  if (infectedFirstWin) game._grantInfectedWin(country.id, s);
  // ⭐ R3 «Зірки та милосердя» / v298 «Зірки разом»: нараховуємо зірки за перемогу.
  // level.secondaryObjective виставляється РІВНО для зіркового забігу — соло-кампанія АБО
  // кооп-кампанія (story/dynamic, !isInfected, не спецрежими) — тож сама його наявність і є
  // гейтом (заражений забіг глави 2, LAB/LOST, шторм/арена/кімнатні режими його не мають).
  // Кооп: КОЖЕН гравець (хост — свій victory-шлях, гість — netVictory→_showVictory) нараховує
  // зірки у ВЛАСНИЙ сейв локально: ⭐1 перемога; ⭐2 командна ціль (so.done прийшов через `soc`);
  // ⭐3 ОСОБИСТО без падінь (stats.deaths — кожен рахує свої). _awardStars однаковий для соло й коопу.
  const starInfo = game.level.secondaryObjective ? game._awardStars(country.id, s) : null;
  game.progress.addXp(XP_VALUES.country);
  if (!wasLiberated) game.quests.onEvent('country');
  // 🏕️ тижневий квест «Переможи у N країнах»: рахуємо БУДЬ-ЯКУ кампанійну перемогу
  // (соло/кооп), у т.ч. повторну — щоб ветеран із усіма звільненими країнами міг виконати.
  // Гейт — наявність secondaryObjective (виставляється рівно для кампанійного забігу).
  if (game.level.secondaryObjective) game._bumpCamp('victory');
  game.saveGame();
  // 🎁 тости за розблоковані пороги зірок (після saveGame — стан уже узгоджений)
  if (starInfo) for (const th of starInfo.claimed) game.hud.toast(t('🎉 {l}', { l: th.label() }), 5);
  // 🥚 тост за зароблене яйце (кожні 6 зірок) — відкрити в Альбомі → Петси
  if (starInfo && starInfo.eggsGranted > 0) game.hud.toast(t('🥚 Ти заробив {n} яйце петса! Відкрий у Альбомі → 🐾 Петси', { n: starInfo.eggsGranted }), 5);
  // 🤝 бонус за гру РАЗОМ — обом сторонам локально (як _grantWeeklyCoop): wire не чіпаємо
  game._grantCoopWin();
  if (game.level.net && game.level.net.authority) {
    game.level.netEv('vict');
    game.level.net.flushEvents();
  }
  game.globe.setLiberated();
  game.input.exitLock();
  const mins = Math.floor(s.time / 60);
  const secs = Math.floor(s.time % 60);
  const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
  document.querySelector('#overlay-victory h1').textContent = game.level.infected ? t('🧟 ЗАРАЖЕННЯ ОЧИЩЕНО!') : country.victoryTitle;
  document.querySelector('.victory-sub').textContent = game.level.infected ? t('Ти очистив зараження у країні {c}!', { c: country.name }) : t('Ти переміг боса «{b}» і врятував країну!', { b: country.boss.name.replace('👑 ', '') });
  const recBadge = isRecord && prev ? t(' <span class="record-badge">🏆 НОВИЙ РЕКОРД!</span>') : '';
  const bestLine = prev && !isRecord
    ? `<div class="stat best"><span class="stat-icon">🏆</span><span class="stat-name">${t('Рекорд часу')}</span><span class="stat-val">${Math.floor(prev.time / 60)}:${String(prev.time % 60).padStart(2, '0')}</span></div>`
    : '';
  const vrb = game.level.runBuild;
  const victoryBuildRow = vrb && vrb.picks.length
    ? `<div class="stat"><span class="stat-icon">🎲</span><span class="stat-name">${t('Твоя збірка')}</span><span class="stat-val">${vrb.summary()}</span></div>`
    : '';
  document.getElementById('victory-stats').innerHTML = `
    <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">${t('Час')}${recBadge}</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
    ${bestLine}
    ${victoryBuildRow}
    <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">${t('Зомбі переможено')}</span><span class="stat-val">${s.kills}</span></div>
    <div class="stat"><span class="stat-icon">🔥</span><span class="stat-name">${t('Найкраще комбо')}</span><span class="stat-val">x${game.level.combo.best}</span></div>
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
  // ⭐ R3: 3 зірки країни спливають по одній (filled/empty) з причинами
  game._renderVictoryStars(starInfo);
  // «Ще раз»/«Далі» — лише соло-кампанія; в коопі обидві сторони йдуть через глобус
  const solo = !game.level.net;
  const nextBtn = document.getElementById('btn-victory-next');
  const retryBtn = document.getElementById('btn-victory-retry');
  nextBtn.style.display = solo && nextTarget(game.save.liberated) !== null ? '' : 'none';
  retryBtn.style.display = solo ? '' : 'none';
  game._showOverlay('overlay-victory');
  // ⭐ «майже досяг»: тост про перший титул із прогресом ≥80% (раз на сесію, тротл через Set)
  if (!game._almostTitleToasts) game._almostTitleToasts = new Set();
  for (const [id, meta] of Object.entries(TITLES)) {
    if (game.save.titles.includes(id)) continue;
    if (!(meta.target > 0)) continue;
    const cur = meta.current(game.save);
    if (cur / meta.target < 0.8) continue;
    if (game._almostTitleToasts.has(id)) continue;
    game._almostTitleToasts.add(id);
    game.hud.toast(t('⭐ Ще трохи — і титул «{n}»! {c}/{t}', { n: meta.name(), c: cur, t: meta.target }), 5);
    break;
  }
}

// 🌍 v303 «Світ врятовано»: одноразовий тригер фіналу кампанії. Викликається на глобусі —
// з кнопки «На глобус» після переможної 12-ї країни І на першому вході ретро-ветерана.
// Одноразовість надійна: гейт save.worldSaved ставиться РАЗОМ із нагородою під saveGame(),
// тож повторний виклик (реплей, наступний boot, гість коопу) нічого не робить. state==='globe'
// не дає церемонії спливти поверх рівня. Повертає true лише коли реально показали.
export function maybeWorldSaved(game) {
  if (game.state !== 'globe') return false;
  if (game.save.worldSaved) return false;
  if (!CAMPAIGN_ORDER.every((c) => hasLiberated(game.save.liberated, c))) return false;
  game.save.worldSaved = 1;
  game.save.crystals = (game.save.crystals || 0) + 50;
  if (!Array.isArray(game.save.medals)) game.save.medals = [];
  if (!game.save.medals.includes('WORLD')) game.save.medals.push('WORLD');
  game.saveGame();
  game._showWorldSaved();
  return true;
}

export function showWorldSaved(game) {
  const stars = starTotal(game.save);
  const friends = rescuedFriendCount(game.save);
  const killed = (game.save.stats && game.save.stats.killed) | 0;
  const nums = document.getElementById('worldsaved-nums');
  if (nums) {
    nums.textContent = t('🌍 {a}/{b} країн · ⭐ {s}/{sm} зірок · 🤝 {f}/{ft} друзів · 🧟 {n} переможено', {
      a: CAMPAIGN_ORDER.length, b: CAMPAIGN_ORDER.length,
      s: stars, sm: CAMPAIGN_STAR_MAX,
      f: friends, ft: FRIEND_TOTAL, n: killed,
    });
  }
  const reward = document.getElementById('worldsaved-reward');
  if (reward) reward.textContent = t('🎁 Нагорода: 💎 +50 · медаль 🌍 «{m}»', { m: t('Рятівник світу') });
  // конфетті — той самий DOM-патерн, що на екрані перемоги (працює й на глобусі)
  const conf = document.getElementById('worldsaved-confetti');
  if (conf) {
    conf.innerHTML = '';
    for (let i = 0; i < 80; i++) {
      const d = document.createElement('div');
      d.className = 'confetti-piece';
      d.style.left = Math.random() * 100 + '%';
      d.style.background = ['#ffd23f', '#4cff7a', '#44ccff', '#ff5d73', '#b086f2'][i % 5];
      d.style.animationDelay = Math.random() * 3 + 's';
      d.style.animationDuration = 2.5 + Math.random() * 2 + 's';
      conf.appendChild(d);
    }
  }
  game._showOverlay('overlay-worldsaved');
  // 🔊 святковий голос: лише якщо аудіо вже розбуджене жестом — інакше тихо пропускаємо
  if (game.audio) { try { game.audio.victory(); } catch (e) { /* звук не критичний */ } }
}

export function grantInfectedWin(game, countryId, stats) {
  if (!game.save.infected || typeof game.save.infected !== 'object') game.save.infected = { cleared: {}, done: false };
  if (!game.save.infected.cleared || typeof game.save.infected.cleared !== 'object') game.save.infected.cleared = {};
  game.save.infected.cleared[countryId] = true;
  game.save.coins += 300;
  stats.coinsEarned += 300;
  const cleared = Object.keys(game.save.infected.cleared).length;
  game.hud.toast(t('🧪 Зараження очищено: +300 монет!'));
  if (cleared >= CHAPTER2.target && !game.save.infected.done) {
    game.save.infected.done = true;
    game.save.coins += 1200;
    game.save.crystals = (game.save.crystals || 0) + 10;
    stats.coinsEarned += 1200;
    if (!Array.isArray(game.save.medals)) game.save.medals = [];
    if (!game.save.medals.includes(CHAPTER2.id)) game.save.medals.push(CHAPTER2.id);
    game.hud.banner(t('🎖️ ГЛАВУ 2 ПРОЙДЕНО!'), t('{m}: +1200 монет і 💎 10', { m: CHAPTER2.medalName }), 4.5);
  }
}

// ⭐ R3: нарахування зірок за перемогу в країні кампанії (solo). Зберігаємо MAX (реплей
// не втрачає зірок). Повертає інфо для екрана перемоги + список розблокованих порогів.
export function awardStars(game, cid, stats) {
  const so = game.level.secondaryObjective;
  const d1 = true;                          // ⭐1 перемога (бос упав)
  const d2 = !!(so && so.done);             // ⭐2 вторинна ціль забігу
  const d3 = (stats.deaths | 0) === 0;      // ⭐3 без жодної смерті
  const thisRun = (d1 ? 1 : 0) + (d2 ? 1 : 0) + (d3 ? 1 : 0);
  const prev = countryStars(game.save, cid);
  const total = Math.max(prev, thisRun);
  if (!game.save.stars || typeof game.save.stars !== 'object') game.save.stars = {};
  game.save.stars[cid] = total;
  // 🕊️ милосердя скидається після перемоги у цій країні (frustration cleared)
  if (game.save.mercyDeaths && game.save.mercyDeaths.cid === cid) game.save.mercyDeaths = null;
  const claimed = game._claimStarThresholds();
  // 🥚 R5: кожні 6 сумарних зірок — яйце петса (окремі claim'и, НЕ чіпають 12/24/36 вище)
  const eggsGranted = claimStarEggs(game.save);
  return { d1, d2, d3, thisRun, prev, total, secondary: so, claimed, eggsGranted };
}

// 🎁 Одноразові пороги зірок (12/24/36). Нараховує нагороду й запам'ятовує поріг.
export function claimStarThresholds(game) {
  const tot = starTotal(game.save);
  if (!Array.isArray(game.save.starClaims)) game.save.starClaims = [];
  const claimed = [];
  for (const th of STAR_THRESHOLDS) {
    if (tot < th.at || game.save.starClaims.includes(th.at)) continue;
    game.save.starClaims.push(th.at);
    if (th.type === 'coins') game.save.coins += th.n;
    else if (th.type === 'crystals') game.save.crystals = (game.save.crystals || 0) + th.n;
    else if (th.type === 'title' && th.id && !game.save.titles.includes(th.id)) game.save.titles.push(th.id);
    claimed.push(th);
  }
  return claimed;
}

// ⭐ R3: три зірки на екрані перемоги спливають по одній (filled/empty) з причинами.
export function renderVictoryStars(game, info) {
  const box = document.getElementById('victory-stars');
  if (!box) return;
  if (!info) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = '';
  const rows = [
    { on: info.d1, label: t('Перемога') },
    { on: info.d2, label: info.secondary ? info.secondary.label() : t('Вторинна ціль забігу') },
    { on: info.d3, label: t('Без жодної смерті') },
  ];
  const stars = rows.map((r, i) =>
    `<div class="vstar ${r.on ? 'earned' : ''}" style="animation-delay:${(0.2 + i * 0.35).toFixed(2)}s">`
    + `<span class="vstar-ic">${r.on ? '⭐' : '☆'}</span>`
    + `<span class="vstar-lbl">${r.label}</span></div>`).join('');
  box.innerHTML = `<div class="vstar-title">${t('Зірки країни: {n}/{m}', { n: info.total, m: STARS_PER_COUNTRY })}</div>`
    + `<div class="vstar-row">${stars}</div>`;
}
