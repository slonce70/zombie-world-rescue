// 📖 Альбом: герой/друзі/скіни/петси/еліти + чесні підказки де що здобути.
// v305: винесено ВЕРБАТИМ із src/main.js (рядки ~1763–1995) — this→game, делегати лишились у Game.
import { t } from '../i18n.js';
import { rescuedFriendCount, FRIEND_TOTAL, friendFor, isFriendRescued } from '../friends.js';
import { CAMPAIGN_ORDER, COUNTRIES } from '../countries.js';
import { claimBacklogEggs, eggOddsText, petLevel, PET_MAX_LEVEL, canFeed, feedCost } from '../eggs.js';
import { HERO_SKINS, PETS } from '../characters.js';
import { starTotal, CAMPAIGN_STAR_MAX } from '../stars.js';
import { liberatedCount } from '../net/cloudsave.js';
import { CHAPTER3 } from '../chapter.js';
import { SHOP_ITEMS } from '../shop.js';
import { TITLES } from '../titles.js';

// 📖 R4 «Альбом»: секція «Друзі» жива (картка на країну), решта — заглушки «Скоро!» (R5)
export function renderAlbum(game) {
  const save = game.save;
  const tabs = [
    ['hero', t('🏅 Герой')],
    ['friends', t('🤝 Друзі')],
    ['skins', t('🧢 Скіни')],
    ['pets', t('🐾 Петси')],
    ['elites', t('👹 Еліти')],
  ];
  if (!game._albumTab || !tabs.some(([id]) => id === game._albumTab)) game._albumTab = 'hero';
  const rescued = rescuedFriendCount(save);
  let friendsHtml = `<div class="album-counter">🤝 ${rescued}/${FRIEND_TOTAL}</div><div class="album-grid">`;
  for (const cid of CAMPAIGN_ORDER) {
    const f = friendFor(cid);
    if (!f) continue;
    const c = COUNTRIES[cid];
    const flag = c ? c.flag : '';
    const country = c ? c.name : cid;
    if (isFriendRescued(save, cid)) {
      friendsHtml += `<div class="album-card revealed" data-cid="${cid}">
        <div class="album-portrait">${f.emoji}</div>
        <div class="album-name">${f.name()}</div>
        <div class="album-role">${f.role()}</div>
        <div class="album-flag">${flag} ${country}</div>
      </div>`;
    } else {
      friendsHtml += `<div class="album-card locked" data-cid="${cid}">
        <div class="album-portrait silhouette">${f.emoji}</div>
        <div class="album-name">???</div>
        <div class="album-hint">${t('Схований у {country}', { country })}</div>
      </div>`;
    }
  }
  friendsHtml += '</div>';

  // 🥚 R5: відкриття Альбому — робастна точка ретро-нарахування яєць (ідемпотентно, тихо)
  if (claimBacklogEggs(save) > 0) game.saveGame();

  const nextBadge = `<div class="album-next">${t('🎯 наступна ціль')}</div>`;

  // 🧢 Скіни: картка на кожен обтяжуваний скін (source: HERO_SKINS). Owned → іконка+назва;
  // ні → силует + чесна підказка (ціна з даних магазину, щоб не дрейфувала). X/Y + «наступна ціль».
  const skinIds = Object.keys(HERO_SKINS);
  const ownedSkins = skinIds.filter((id) => save.skins.includes(id));
  let skinNext = false;
  let skinsHtml = `<div class="album-counter">🧢 ${ownedSkins.length}/${skinIds.length}</div><div class="album-grid">`;
  for (const id of skinIds) {
    const meta = HERO_SKINS[id];
    if (save.skins.includes(id)) {
      skinsHtml += `<div class="album-card revealed" data-id="${id}">
        <div class="album-portrait">${meta.icon}</div>
        <div class="album-name">${meta.name}</div>
      </div>`;
    } else {
      const isNext = !skinNext; skinNext = true;
      skinsHtml += `<div class="album-card locked${isNext ? ' next' : ''}" data-id="${id}">
        ${isNext ? nextBadge : ''}
        <div class="album-portrait silhouette">${meta.icon}</div>
        <div class="album-name">???</div>
        <div class="album-hint">${game._skinHint(id)}</div>
      </div>`;
    }
  }
  skinsHtml += '</div>';

  // 🐾 Петси: рядок «🥚 Яйця: N — [Відкрити]» з надрукованими шансами; далі картка на кожного
  // петса з PETS. Owned → іконка+назва+РІВЕНЬ (Рів.1–3 + прогрес годування); ні → силует+підказка.
  const petIds = Object.keys(PETS);
  const ownedPets = petIds.filter((id) => save.pets.includes(id));
  let petNext = false;
  const eggN = save.eggs || 0;
  let petsHtml = `<div class="album-egg-row">
    <span class="album-egg-count">🥚 ${t('Яйця')}: ${eggN}</span>
    <button class="album-egg-open" ${eggN > 0 ? '' : 'disabled'}>${t('Відкрити')}</button>
    <div class="album-egg-odds">${eggOddsText()}</div>
  </div>`;
  petsHtml += `<div class="album-counter">🐾 ${ownedPets.length}/${petIds.length}</div><div class="album-grid">`;
  for (const id of petIds) {
    const meta = PETS[id];
    if (save.pets.includes(id)) {
      const lv = petLevel(save, id);
      const stars = '⭐'.repeat(lv) + '·'.repeat(PET_MAX_LEVEL - lv);
      const feedRow = lv < PET_MAX_LEVEL
        ? `<button class="album-feed-btn" data-pet="${id}" ${canFeed(save, id) ? '' : 'disabled'}>${t('Годувати')} (🍖 ${feedCost(lv + 1)})</button>`
        : `<div class="album-lvl-max">${t('Макс. рівень!')}</div>`;
      petsHtml += `<div class="album-card revealed" data-id="${id}">
        <div class="album-portrait">${meta.icon}</div>
        <div class="album-name">${meta.name}</div>
        <div class="album-lvl">${t('Рів.')} ${lv} <span class="album-lvl-stars">${stars}</span></div>
        ${feedRow}
      </div>`;
    } else {
      const isNext = !petNext; petNext = true;
      petsHtml += `<div class="album-card locked${isNext ? ' next' : ''}" data-id="${id}">
        ${isNext ? nextBadge : ''}
        <div class="album-portrait silhouette">${meta.icon}</div>
        <div class="album-name">???</div>
        <div class="album-hint">${game._petHint(id)}</div>
      </div>`;
    }
  }
  petsHtml += '</div>';

  // 👹 Еліти: картка на кожен елітний тип (v287: shield/splitter/exploder/golden). Лічильники —
  // з персистентного save.bestiary (per-type kill counts вже є). Вбито ≥1 → «Переможено: N».
  const ELITE_ALBUM = [
    { key: 'shield', icon: '🛡️', name: t('Щитоносець'), hint: t("З'являється в елітній хвилі") },
    { key: 'splitter', icon: '🪓', name: t('Розділювач'), hint: t("З'являється в елітній хвилі") },
    { key: 'exploder', icon: '💥', name: t('Підривник'), hint: t("З'являється в елітній хвилі") },
    { key: 'golden', icon: '👑', name: t('Золотий зомбі'), hint: t('Тікає — лови!') },
  ];
  const bestiary = save.bestiary || {};
  const killedElites = ELITE_ALBUM.filter((e) => (bestiary[e.key] || 0) > 0).length;
  let eliteNext = false;
  let elitesHtml = `<div class="album-counter">👹 ${killedElites}/${ELITE_ALBUM.length}</div><div class="album-grid">`;
  for (const e of ELITE_ALBUM) {
    const n = bestiary[e.key] || 0;
    if (n > 0) {
      elitesHtml += `<div class="album-card revealed" data-id="${e.key}">
        <div class="album-portrait">${e.icon}</div>
        <div class="album-name">${e.name}</div>
        <div class="album-count">${t('Переможено: {n}', { n })}</div>
      </div>`;
    } else {
      const isNext = !eliteNext; eliteNext = true;
      elitesHtml += `<div class="album-card locked${isNext ? ' next' : ''}" data-id="${e.key}">
        ${isNext ? nextBadge : ''}
        <div class="album-portrait silhouette">${e.icon}</div>
        <div class="album-name">???</div>
        <div class="album-hint">${e.hint}</div>
      </div>`;
    }
  }
  elitesHtml += '</div>';

  // 🏅 Герой: профіль пригоди — рівень+XP, зірки, звільнені країни, медалі, рекорди,
  // лічильники колекцій і активний титул. Усе читається з наявного save (жодних нових ключів тут).
  const lvl = game.progress.level;
  const lvlPct = Math.round(game.progress.levelFrac() * 100);
  const starPct = Math.round((starTotal(save) / CAMPAIGN_STAR_MAX) * 100);
  const heroLibN = liberatedCount(save.liberated);
  const libPct = Math.round((heroLibN / CAMPAIGN_ORDER.length) * 100);
  const bar = (pct) => `<div class="hero-bar"><div class="hero-bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div>`;
  const barRow = (label, right, pct) => `<div class="hero-bar-row"><div class="hero-bar-label"><span>${label}</span><span>${right}</span></div>${bar(pct)}</div>`;
  const statRow = (icon, name, val) => `<div class="stat">${icon ? `<span class="stat-icon">${icon}</span>` : ''}<span class="stat-name">${name}</span><span class="stat-val">${val}</span></div>`;
  // медалі: здобуті — яскраві; нездобуті — сірий силует із підказкою як здобути (патерн album-card)
  const medals = save.medals || [];
  const medalCard = (owned, icon, name, hint) => owned
    ? `<div class="album-card revealed"><div class="album-portrait">${icon}</div><div class="album-name">${name}</div></div>`
    : `<div class="album-card locked"><div class="album-portrait silhouette">${icon}</div><div class="album-name">???</div><div class="album-hint">${hint}</div></div>`;
  const medalsHtml = medalCard(medals.includes(CHAPTER3.id), '🧪', CHAPTER3.medalName, t('Пройди Главу 3 у Лігві Вірусу'))
    + medalCard(medals.includes('WORLD'), '🌍', t('Рятівник світу'), t('Звільни всі 12 країн світу'));
  // рекорди: найшвидша країна (мін time), найкраще комбо (макс по records)
  const records = save.records || {};
  let fastCid = null; let fastTime = Infinity; let bestCombo = 0;
  for (const [cid, r] of Object.entries(records)) {
    if (!r) continue;
    if (typeof r.time === 'number' && r.time < fastTime) { fastTime = r.time; fastCid = cid; }
    if ((r.combo | 0) > bestCombo) bestCombo = r.combo | 0;
  }
  const fastCountry = fastCid ? COUNTRIES[fastCid] : null;
  const fastVal = fastCid
    ? `${(fastCountry && fastCountry.flag) || ''} ${(fastCountry && fastCountry.name) || fastCid} · ${Math.floor(fastTime / 60)}:${String(Math.round(fastTime) % 60).padStart(2, '0')}`
    : '—';
  const killed = (save.stats && save.stats.killed) | 0;
  const bosses = (save.stats && save.stats.bosses) | 0;
  // активний титул + скільки титулів здобуто
  const activeTitleName = save.activeTitle && TITLES[save.activeTitle] ? TITLES[save.activeTitle].name() : t('Ще немає');
  const titlesGot = (save.titles || []).length;
  const titlesTotal = Object.keys(TITLES).length;
  const heroHtml = `<div class="hero-pane">
    ${barRow(`⭐ ${t('Рівень')} ${lvl}`, `${lvlPct}%`, lvlPct)}
    ${barRow(`⭐ ${t('Зірки кампанії')}`, `${starTotal(save)}/${CAMPAIGN_STAR_MAX}`, starPct)}
    ${barRow(`🌍 ${t('Країни світу')}`, `${heroLibN}/${CAMPAIGN_ORDER.length}`, libPct)}
    <div class="hero-sec">${t('🏅 Медалі')}</div>
    <div class="album-grid">${medalsHtml}</div>
    <div class="hero-sec">${t('🏆 Рекорди')}</div>
    ${statRow('⚡', t('Найшвидша країна'), fastVal)}
    ${statRow('🔥', t('Найкраще комбо'), 'x' + bestCombo)}
    ${statRow('🧟', t('Усього переможено'), killed)}
    ${statRow('👑', t('Босів переможено'), bosses)}
    <div class="hero-sec">${t('🎒 Колекції')}</div>
    ${statRow('', t('🤝 Друзі'), `${rescued}/${FRIEND_TOTAL}`)}
    ${statRow('', t('🐾 Петси'), `${ownedPets.length}/${petIds.length}`)}
    ${statRow('', t('🧢 Скіни'), `${ownedSkins.length}/${skinIds.length}`)}
    <div class="hero-sec">${t('🏷️ Титул')}</div>
    ${statRow('🏷️', activeTitleName, t('здобуто {x}/{y}', { x: titlesGot, y: titlesTotal }))}
  </div>`;

  const pane = (id, body) => `<div class="album-pane" data-tab="${id}" ${game._albumTab === id ? '' : 'hidden'}>${body}</div>`;
  let html = `<div class="ward-tabs album-tabs">${tabs.map(([id, label]) => `<button class="shop-tab album-tab ${game._albumTab === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('')}</div>`;
  html += pane('hero', heroHtml) + pane('friends', friendsHtml) + pane('skins', skinsHtml) + pane('pets', petsHtml) + pane('elites', elitesHtml);
  const root = document.getElementById('album-content');
  root.innerHTML = html;
  root.querySelectorAll('.album-tab').forEach((el) => {
    el.addEventListener('click', () => {
      game._albumTab = el.dataset.tab;
      game.audio.click();
      root.querySelectorAll('.album-tab').forEach((b) => b.classList.toggle('on', b === el));
      root.querySelectorAll('.album-pane').forEach((p) => { p.hidden = p.dataset.tab !== game._albumTab; });
    });
  });
  // 🥚 відкрити яйце → церемонія (петс або дублікат→корм), потім re-render
  const eggBtn = root.querySelector('.album-egg-open');
  if (eggBtn) eggBtn.addEventListener('click', () => game._openEggFromAlbum());
  // 🍖 годувати петса → наступний рівень
  root.querySelectorAll('.album-feed-btn').forEach((el) => {
    el.addEventListener('click', () => game._feedPetFromAlbum(el.dataset.pet));
  });
}

// 🧢 Чесна підказка де здобути скін: ціна з даних магазину (без ручних цифр, що дрейфують),
// інакше — опис із HERO_SKINS (бокс/шлях/шторм тощо).
export function skinHint(game, id) {
  const shopItem = SHOP_ITEMS.find((i) => i.skin === id);
  if (shopItem) {
    if (shopItem.crystalPrice) return t('Магазин: {n} 💎', { n: shopItem.crystalPrice });
    if (shopItem.price) return t('Магазин: {n} 💰', { n: shopItem.price });
  }
  if (id === 'angel') return t('Набір Ангела');
  if (id === 'demon') return t('Набір Демона');
  return HERO_SKINS[id].desc;
}

// 🐾 Чесна підказка де здобути петса: ексклюзиви — своє джерело; магазинні — ціна з даних; решта — з яйця.
export function petHint(game, id) {
  if (id === 'slimepet') return t('Нагорода Глави 3');
  if (id === 'radiationlizard') return t('Розділ Радіація');
  const shopItem = SHOP_ITEMS.find((i) => i.id === id && i.pet);
  if (shopItem && shopItem.price) return t('Магазин: {n} 💰', { n: shopItem.price });
  return t('З яйця 🥚');
}
