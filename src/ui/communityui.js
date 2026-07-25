// 🏘️ Операції спільноти (v700): каталог, точні посилання, перевірка й публікація,
// соло/кооп старт, результат, реакції та скарги.
//
// Три межі, які тут ніколи не розмиваються:
//   1) чужа карта живе лише в памʼяті забігу — у save/localStorage не потрапляє;
//   2) публікація можлива тільки після власного переможного перевірочного забігу,
//      і цей доказ (pending) гине разом з рівнем — reload/смерть/вихід його стирають;
//   3) кожен мережевий виклик мʼякий: помилка дає керований стан, а не падіння гри.
import { t } from '../i18n.js';
import {
  communityList, communityMap, communityPublish, communityUnpublish,
  communityRunStart, communityComplete, communityReact, communityReport,
  communityShareUrl, makeRunId,
} from '../net/community.js';
import { shareLink } from './share.js';
import {
  COMMUNITY_REACTIONS, COMMUNITY_REPORTS, validateCustomMap,
} from '../../worker/community-schema.mjs';
import { CUSTOM_QUEST_INFO } from '../custommap.js';

const TABS = Object.freeze([
  { id: 'weekly', label: () => t('🗓️ Тиждень') },
  { id: 'new', label: () => t('🆕 Нові') },
  { id: 'popular', label: () => t('🔥 Популярні') },
  { id: 'my', label: () => t('🧱 Мої') },
]);

const REACTION_INFO = Object.freeze({
  fun: { icon: '😄', name: () => t('Весело') },
  challenging: { icon: '🔥', name: () => t('Складно') },
  beautiful: { icon: '🎨', name: () => t('Красиво') },
});

const REPORT_INFO = Object.freeze({
  inappropriate: { icon: '🚫', name: () => t('Недоречне') },
  broken: { icon: '🧩', name: () => t('Зламана карта') },
  spam: { icon: '📢', name: () => t('Спам') },
});

const STATUS_INFO = Object.freeze({
  active: () => t('опубліковано'),
  unpublished: () => t('знято з публікації'),
  quarantined: () => t('на перевірці модератора'),
  disabled: () => t('вимкнено'),
});

// коди воркера → дитяча мова; невідомий код падає на загальне повідомлення
function errorText(code) {
  const map = {
    net: t('📡 Спільнота недоступна — перевір інтернет і спробуй ще раз'),
    none: t('🚫 Карти вже немає: її зняли з публікації або сховали'),
    owner: t('🚫 На власній карті це недоступно'),
    completion: t('🔒 Спершу пройди карту — тоді зможеш поставити реакцію'),
    quarantined: t('🚧 Карта на перевірці модератора'),
    disabled: t('🚧 Карту вимкнено'),
    daily: t('⏳ На сьогодні досить публікацій — заходь завтра'),
    slow: t('⏳ Зачекай трохи перед наступною публікацією'),
    rate: t('⏳ Забагато запитів — трохи зачекай'),
    big: t('📦 Карта завелика для публікації'),
    map_big: t('📦 Карта завелика для публікації'),
    tasks: t('⭐ Постав від 1 до 3 завдань — і карту можна публікувати'),
    objects: t('📦 На карті забагато обʼєктів'),
    bounds: t('📐 Є обʼєкти за межами карти — прибери їх'),
    overlap: t('🧱 Обʼєкти налазять один на одного'),
    spawn: t('🚩 Звільни місце навколо точки старту гравця'),
  };
  return map[code] || t('😵 Не вийшло. Спробуй ще раз.');
}

function biomeIcon(biome) {
  return biome === 'snow' ? '❄️' : '☀️';
}

// назва складається лише з фіксованих enum: біом, головний квест і ID карти
function itemTitle(item) {
  const quest = CUSTOM_QUEST_INFO[item.quest] || CUSTOM_QUEST_INFO.rescue;
  return `${biomeIcon(item.biome)} ${quest.icon} ${t(quest.title)} · #${item.mapId}`;
}

export class CommunityUI {
  constructor(game) {
    this.game = game;
    this.tab = 'weekly';
    this.items = [];
    this.state = 'idle';        // idle | loading | ready | empty | error
    this.errorCode = '';
    this.pending = null;        // memory-only доказ перевірки: {slot, map, mapSize, mapStyle, verified}
    this.run = null;            // активний забіг: {mapId, revision, runId, coop, owned, completed, reaction}
    this.published = null;      // остання публікація: {mapId, revision, url}
    this._loadToken = 0;
    this._bind();
  }

  // ---------- 🧷 прив'язка ----------
  _bind() {
    const game = this.game;
    const catalog = document.getElementById('overlay-community');
    if (catalog) {
      catalog.addEventListener('click', (event) => {
        if (!catalog.classList.contains('show')) return; // клік по прихованому діалогу нічого не робить
        const tab = event.target.closest('[data-community-tab]');
        if (tab) { this.openTab(tab.dataset.communityTab); return; }
        if (event.target.closest('#btn-community-retry')) { this._load(); return; }
        const action = event.target.closest('[data-community-act]');
        if (!action) return;
        const mapId = action.closest('[data-map-id]')?.dataset.mapId;
        const item = this.items.find((row) => row.mapId === mapId);
        if (item) this._itemAction(action.dataset.communityAct, item);
      });
    }
    const result = document.getElementById('overlay-community-result');
    if (result) {
      result.addEventListener('click', (event) => {
        if (!result.classList.contains('show')) return;
        if (event.target.closest('#btn-community-result-publish')) { this.publishPending(); return; }
        if (event.target.closest('#btn-community-result-share')) { this.shareLast(); return; }
        if (event.target.closest('#btn-community-result-catalog')) {
          game._hideOverlay('overlay-community-result');
          game.endLevel();
          this.open();
          return;
        }
        if (event.target.closest('#btn-community-result-room')) {
          game._hideOverlay('overlay-community-result');
          game.endLevel();
          document.getElementById('btn-coop')?.click(); // той самий вхід у кімнату, що з глобуса
          return;
        }
        const reaction = event.target.closest('[data-reaction]');
        if (reaction) { this.react(reaction.dataset.reaction); return; }
        const report = event.target.closest('[data-report]');
        if (report) this.report(report.dataset.report);
      });
    }
  }

  // ---------- 📚 каталог ----------
  open(tab = this.tab) {
    this.game.audio.click();
    this.tab = TABS.some((row) => row.id === tab) ? tab : 'weekly';
    this.game._showOverlay('overlay-community');
    this._load();
  }

  openTab(tab) {
    if (!TABS.some((row) => row.id === tab) || tab === this.tab) return;
    this.game.audio.click();
    this.tab = tab;
    this._load();
  }

  async _load() {
    const token = ++this._loadToken;
    this.state = 'loading';
    this.items = [];
    this.errorCode = '';
    this.render();
    const response = await communityList(this.game, this.tab);
    if (token !== this._loadToken) return; // користувач уже перемкнув вкладку
    if (!response.ok) {
      this.state = 'error';
      this.errorCode = response.error;
    } else {
      this.items = Array.isArray(response.items) ? response.items : [];
      this.state = this.items.length ? 'ready' : 'empty';
    }
    this.render();
  }

  render() {
    const tabs = document.getElementById('community-tabs');
    if (tabs) {
      for (const button of tabs.querySelectorAll('[data-community-tab]')) {
        const on = button.dataset.communityTab === this.tab;
        button.classList.toggle('on', on);
        button.setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }
    const status = document.getElementById('community-status');
    if (status) {
      status.textContent = this.state === 'loading' ? t('⏳ Завантажуємо карти…')
        : this.state === 'error' ? errorText(this.errorCode)
        : this.state === 'empty' ? (this.tab === 'my'
          ? t('Тут зʼявляться твої опубліковані карти. Створи карту в редакторі й перевір її забігом.')
          : t('Поки що порожньо — зазирни пізніше або опублікуй свою карту.'))
        : '';
    }
    const retry = document.getElementById('btn-community-retry');
    if (retry) retry.hidden = this.state !== 'error';
    const list = document.getElementById('community-list');
    if (list) list.innerHTML = this.items.map((item) => this._itemHtml(item)).join('');
  }

  _itemHtml(item) {
    const tier = item.tier === 'plus' ? '💎 Plus' : '🧱 Base';
    const reactions = COMMUNITY_REACTIONS
      .map((id) => `${REACTION_INFO[id].icon} ${item.reactions[id] || 0}`).join(' · ');
    const status = item.status !== 'active' ? ` · ${STATUS_INFO[item.status]()}` : '';
    const playable = item.status === 'active';
    // кооп-старт віддає карту всій кімнаті — доступний лише хосту живої кімнати
    const canCoop = playable && this.game.coop?.session?.role === 'host';
    return `<article class="community-item" data-map-id="${item.mapId}">
      <div class="community-item-head">
        <h3 class="community-item-title">${itemTitle(item)}</h3>
        <span class="community-item-tier">${tier}</span>
      </div>
      <p class="community-item-meta">${t('Ревізія {r}', { r: item.revision })} · 🏁 ${item.externalRuns} · 🏆 ${item.externalCompletions} · ${reactions}${status}</p>
      <div class="community-item-actions">
        ${playable ? `<button class="btn btn-primary" data-community-act="play">${t('▶️ Грати')}</button>` : ''}
        ${canCoop ? `<button class="btn" data-community-act="coop">${t('🤝 Разом')}</button>` : ''}
        ${playable ? `<button class="btn" data-community-act="share">${t('🔗 Поділитися')}</button>` : ''}
        ${item.owned && item.status === 'active' ? `<button class="btn" data-community-act="unpublish">${t('🚫 Зняти з публікації')}</button>` : ''}
      </div>
    </article>`;
  }

  _itemAction(action, item) {
    if (action === 'play') return this.playMap(item.mapId, item.revision);
    if (action === 'coop') return this.playMap(item.mapId, item.revision, { coop: true });
    if (action === 'share') return this.shareMap(item.mapId, item.revision);
    if (action === 'unpublish') return this.unpublish(item);
  }

  async shareMap(mapId, revision) {
    await shareLink(this.game, {
      text: t('Пройди мою карту в «Операції: Порятунок Світу»! 🧟'),
      url: communityShareUrl(mapId, revision),
      copiedMessage: t('🔗 Посилання на карту скопійовано!'),
    });
  }

  shareLast() {
    if (!this.published) return;
    this.shareMap(this.published.mapId, this.published.revision);
  }

  async unpublish(item) {
    if (!confirm(t('Зняти карту з публікації? Старі посилання перестануть працювати.'))) return;
    const response = await communityUnpublish(this.game, item.mapId);
    if (!response.ok) {
      this.game.audio.denied();
      this.game.hud.toast(errorText(response.error));
      return;
    }
    this.game.hud.toast(t('🚫 Карту знято з публікації'));
    this._load();
  }

  // ---------- ▶️ запуск чужої карти ----------
  // Точний знімок завантажується ДО створення світу; локальний слот ніколи не підміняє
  // недоступну чужу карту.
  async playMap(mapId, revision = null, { coop = false } = {}) {
    const game = this.game;
    const response = await communityMap(game, mapId, revision);
    if (!response.ok) {
      game.audio.denied();
      game.hud.toast(errorText(response.error), 6);
      return false;
    }
    const snapshot = response.cm;
    if (coop && game.coop.session.role === 'host') {
      return game.coop.session.startCommunityMap(snapshot);
    }
    const runId = makeRunId();
    game._hideOverlay('overlay-community');
    if (game.state === 'level') game.endLevel();
    await game.startLevel('CUSTOM', {
      customMap: 'community', communityMap: snapshot, communityRunId: runId,
    });
    return game.state === 'level';
  }

  // рівень уже побудований: реєструємо сесію забігу (мʼяко — офлайн не рве гру)
  onRunStarted(level) {
    const context = level && level.customMapContext;
    const snapshot = context && context.snapshot;
    if (!snapshot) return;
    this.run = {
      mapId: snapshot.id,
      revision: snapshot.revision,
      runId: context.runId,
      coop: !!level.net,
      completed: false,
      reaction: null,
      reported: false,
    };
    communityRunStart(this.game, {
      mapId: this.run.mapId, revision: this.run.revision, runId: this.run.runId, coop: this.run.coop,
    });
  }

  // ---------- 🏁 результат ----------
  onResult(level, won) {
    const context = level && level.customMapContext;
    const kind = context && context.kind;
    const publish = document.getElementById('btn-community-result-publish');
    const share = document.getElementById('btn-community-result-share');
    const room = document.getElementById('btn-community-result-room');
    const catalog = document.getElementById('btn-community-result-catalog');
    const block = document.getElementById('community-result-community');
    const note = document.getElementById('community-result-note');
    if (publish) publish.hidden = !(kind === 'verify' && won && this.pending);
    if (share) share.hidden = !this.published;
    if (room) room.hidden = !(kind === 'community' && won && !level.net);
    if (catalog) catalog.hidden = kind === 'edit';
    if (block) block.hidden = true;
    if (note) note.textContent = '';
    if (kind === 'verify' && won && this.pending) {
      this.pending.verified = true;
      if (note) note.textContent = t('✅ Карта працює — тепер її можна опублікувати.');
      if (block) block.hidden = false;
    }
    if (kind === 'community' && won && this.run) this._finishRun(level);
  }

  async _finishRun(level) {
    const run = this.run;
    const note = document.getElementById('community-result-note');
    const response = await communityComplete(this.game, {
      mapId: run.mapId, revision: run.revision, runId: run.runId, coop: run.coop,
    });
    if (this.run !== run) return; // забіг уже змінився
    if (!response.ok) {
      if (note) note.textContent = errorText(response.error);
      this._renderRunActions(false, false);
      return;
    }
    run.completed = true;
    const external = response.external === true;
    if (response.reward) this._grantWeekly(response.reward);
    if (note) {
      note.textContent = external
        ? t('Дякуємо! Автор побачить твоє проходження.')
        : t('Це твоя карта — реакції й нагороди тут не нараховуються.');
    }
    this._renderRunActions(external, external);
  }

  _renderRunActions(canReact, canReport) {
    const block = document.getElementById('community-result-community');
    if (!block) return;
    block.hidden = !(canReact || canReport);
    for (const button of block.querySelectorAll('[data-reaction]')) {
      button.hidden = !canReact;
      const on = this.run && this.run.reaction === button.dataset.reaction;
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.classList.toggle('on', !!on);
    }
    for (const button of block.querySelectorAll('[data-report]')) {
      button.hidden = !canReport || (this.run && this.run.reported);
    }
  }

  // 💎 нагорода тижня нараховується ЛИШЕ після підтвердження воркером і рівно раз
  // на server week id — локальний ключ save.weekly робить повтор безпечним.
  _grantWeekly(reward) {
    const key = `community:${reward.weekId}`;
    const game = this.game;
    if (!game.save.weekly || game.save.weekly[key]) return false;
    game.save.weekly[key] = true;
    game.save.crystals = (game.save.crystals || 0) + reward.crystals;
    game.saveGame();
    game.hud.banner(t('🗓️ КАРТА ТИЖНЯ ПРОЙДЕНА!'), t('💎 +{n} — раз на тиждень', { n: reward.crystals }), 4.5);
    game.audio.levelUp();
    return true;
  }

  async react(reaction) {
    const run = this.run;
    if (!run || !run.completed) return;
    const next = run.reaction === reaction ? null : reaction;
    const response = await communityReact(this.game, {
      mapId: run.mapId, revision: run.revision, reaction: next,
    });
    if (!response.ok) {
      this.game.audio.denied();
      this.game.hud.toast(errorText(response.error));
      return;
    }
    run.reaction = next;
    this.game.audio.click();
    this._renderRunActions(true, !run.reported);
  }

  async report(reason) {
    const run = this.run;
    if (!run || run.reported || !COMMUNITY_REPORTS.includes(reason)) return;
    if (!confirm(t('Поскаржитися на цю карту?'))) return;
    const response = await communityReport(this.game, {
      mapId: run.mapId, revision: run.revision, reason,
    });
    if (!response.ok) {
      this.game.audio.denied();
      this.game.hud.toast(errorText(response.error));
      return;
    }
    run.reported = true;
    this.game.hud.toast(t('📮 Скаргу надіслано — дякуємо!'));
    this._renderRunActions(run.completed, false);
  }

  // ---------- 🌍 перевірка й публікація ----------
  // Крок 1: строга перевірка збереженого знімка саме з поточними mapSize/mapStyle.
  startVerify(level) {
    const game = this.game;
    const custom = level && level.customMap;
    if (!custom || !custom.editor) return false;
    custom.save();
    const map = game.save[custom.slot ? 'customMap2' : 'customMap'];
    const checked = validateCustomMap(map, { profile: 'publication', mapSize: level.mapSize });
    if (!checked.ok) {
      game.audio.denied();
      game.hud.toast(errorText(checked.code), 6);
      return false;
    }
    const mapSize = level.mapSize;
    const mapStyle = level.mapStyle;
    game.hud.toast(t('🧪 Перевірка: пройди свою карту — і зʼявиться кнопка публікації'), 6);
    game.endLevel(); // endLevel чистить pending — доказ створюємо вже після виходу з редактора
    this.pending = {
      slot: custom.slot,
      map: { biome: checked.value.biome, objects: checked.value.objects },
      mapSize,
      mapStyle,
      verified: false,
    };
    this.published = null;
    game.startLevel('CUSTOM', {
      customMap: 'verify',
      customMapData: this.pending.map,
      customMapSlot: this.pending.slot,
      mapSize: this.pending.mapSize,
      mapStyle: this.pending.mapStyle,
    });
    return true;
  }

  async publishPending() {
    const pending = this.pending;
    const game = this.game;
    if (!pending || !pending.verified) return false;
    const button = document.getElementById('btn-community-result-publish');
    if (button) button.disabled = true;
    const response = await communityPublish(game, {
      slot: pending.slot, map: pending.map, mapSize: pending.mapSize, mapStyle: pending.mapStyle,
    });
    if (button) button.disabled = false;
    const note = document.getElementById('community-result-note');
    if (!response.ok) {
      game.audio.denied();
      if (note) note.textContent = errorText(response.error);
      return false;
    }
    this.published = {
      mapId: response.mapId,
      revision: response.revision,
      url: communityShareUrl(response.mapId, response.revision),
    };
    this.pending = null;
    if (button) button.hidden = true;
    const share = document.getElementById('btn-community-result-share');
    if (share) share.hidden = false;
    if (note) {
      note.textContent = t('🌍 Опубліковано: #{id} · ревізія {r}. Поділись точним посиланням!', {
        id: response.mapId, r: response.revision,
      });
    }
    game.audio.victory();
    return true;
  }

  // рівень завершився — доказ публікації й активний забіг живуть тільки в памʼяті
  clearPending() {
    this.pending = null;
    this.run = null;
  }
}
