// 🛰️ World Front DOM overlay. Gameplay and save transitions stay in worldfront.js/main.js.
import { t } from '../i18n.js';
import { COUNTRIES } from '../countries.js';

const TEMPLATE_UI = {
  evacuation: { icon: '🚑', name: 'Евакуація', desc: 'Врятуй людей і втримай зону' },
  outbreak: { icon: '🦠', name: 'Спалах', desc: 'Знищ гнізда і закрий портали' },
  siege: { icon: '🛡️', name: 'Облога', desc: 'Полагодь генератор і відбий орду' },
  hunt: { icon: '🎯', name: 'Полювання', desc: 'Знайди маяки і знешкодь командира' },
};

const SPECIALIST_UI = {
  dispatcher: { icon: '📡', name: 'Диспетчер', desc: 'Без бонусу — зате завжди поруч' },
  medic: { icon: '🩺', name: 'Медик', desc: '+25% лікування і аптечка' },
  engineer: { icon: '🛠️', name: 'Інженер', desc: '+25% міцності та швидший ремонт' },
  scout: { icon: '🔭', name: 'Розвідник', desc: 'Показує ворога і схованку' },
  supplier: { icon: '📦', name: 'Снабженець', desc: 'Чотири картки на вибір' },
};

const PROJECT_UI = {
  medbay: { icon: '🏥', name: 'Медпункт', desc: '+5% лікування за рівень' },
  workshop: { icon: '🔧', name: 'Майстерня', desc: '+10% міцності об’єктів' },
  radio: { icon: '🛰️', name: 'Радіовежа', desc: 'Відкриває розвіддані фронту' },
};

const STATUS_LABEL = {
  available: 'Доступна',
  active: 'В операції',
  completed: 'Відбудова',
  claimed: 'Безпечно',
  locked: 'Закрита',
};

const esc = (value) => String(value == null ? '' : value).replace(/[<>&"']/g, (char) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
}[char]));

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

export class FrontUI {
  constructor(game) {
    this.game = game;
    this.selectedOperationId = null;
    this.selectedSpecialistId = null;
    this.lastFocus = null;
    this.bound = false;
    this.bind();
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.el = {
      overlay: document.getElementById('overlay-front'),
      cta: document.getElementById('btn-front'),
      ctaLabel: document.getElementById('front-cta-label'),
      status: document.getElementById('front-status'),
      operations: document.getElementById('front-operations'),
      specialists: document.getElementById('front-specialists'),
      projects: document.getElementById('front-projects'),
      projectProgress: document.getElementById('front-project-progress'),
      rewards: document.getElementById('front-rewards'),
      go: document.getElementById('btn-front-go'),
      abandon: document.getElementById('btn-front-abandon'),
      close: document.getElementById('btn-front-close'),
      solo: document.getElementById('btn-solo'),
    };
    if (!this.el.overlay || !this.el.cta) return;

    this.el.cta.addEventListener('click', () => {
      this._click();
      if (typeof this.game.openFront === 'function') this.game.openFront();
      else this.open();
    });
    this.el.close.addEventListener('click', () => { this._click(); this.close(); });
    this.el.overlay.addEventListener('click', (event) => {
      if (event.target === this.el.overlay) this.close();
    });
    this.el.operations.addEventListener('click', (event) => this._selectOperation(event));
    this.el.specialists.addEventListener('click', (event) => this._selectSpecialist(event));
    this.el.projects.addEventListener('click', (event) => this._selectProject(event));
    this.el.go.addEventListener('click', () => this._start());
    this.el.abandon.addEventListener('click', () => this._abandon());
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.el.overlay.classList.contains('show')) this.close();
    });
  }

  open(viewModel) {
    this.lastFocus = document.activeElement;
    this.render(viewModel);
    this.el.overlay.classList.add('show');
    this.el.overlay.setAttribute('aria-hidden', 'false');
    this.el.close.focus({ preventScroll: true });
  }

  close() {
    if (!this.el || !this.el.overlay) return;
    this.el.overlay.classList.remove('show');
    this.el.overlay.setAttribute('aria-hidden', 'true');
    if (this.lastFocus && typeof this.lastFocus.focus === 'function') this.lastFocus.focus({ preventScroll: true });
    this.lastFocus = null;
  }

  render(input) {
    if (!this.el || !this.el.overlay) return null;
    const vm = this._normalize(input === undefined ? this._readViewModel() : input);
    this.vm = vm;

    this.el.cta.hidden = !vm.unlocked;
    if (this.el.solo) {
      this.el.solo.textContent = vm.unlocked ? t('🎮 ІНШІ РЕЖИМИ') : t('🎮 ГРАТИ');
      this.el.solo.classList.toggle('btn-primary', !vm.unlocked);
    }
    const playRow = this.el.cta.closest('.globe-play-row');
    if (playRow) playRow.classList.toggle('front-ready', vm.unlocked);
    if (!vm.unlocked) {
      this.el.ctaLabel.textContent = t('🛰️ ЖИВИЙ ФРОНТ');
      this._renderLocked();
      return vm;
    }

    const active = vm.active;
    const activeOperation = active && vm.operations.find((op) => op.id === active.operationId);
    const available = vm.operations.filter((op) => !['completed', 'claimed', 'locked'].includes(op.status));
    if (!this.selectedOperationId || !available.some((op) => op.id === this.selectedOperationId)) {
      this.selectedOperationId = (active && active.operationId)
        || vm.recommendedOperationId
        || (available[0] && available[0].id)
        || (vm.operations[0] && vm.operations[0].id)
        || null;
    }
    if (active && active.specialist) this.selectedSpecialistId = active.specialist;
    if (!this.selectedSpecialistId || !vm.specialists.some((item) => item.id === this.selectedSpecialistId && item.available)) {
      const selected = vm.specialists.find((item) => item.selected && item.available)
        || vm.specialists.find((item) => item.available);
      this.selectedSpecialistId = selected ? selected.id : null;
    }

    this.el.ctaLabel.textContent = active
      ? t('▶️ ПРОДОВЖИТИ · ЕТАП {n}/3', { n: clamp(active.stage, 0, 2) + 1 })
      : t('🛰️ ЖИВИЙ ФРОНТ');

    this.el.status.innerHTML = this._statusHtml(vm, activeOperation);
    const orderedOperations = [...vm.operations].sort((a, b) => Number(b.recommended) - Number(a.recommended));
    this.el.operations.innerHTML = orderedOperations.map((op) => this._operationHtml(op, vm)).join('')
      || `<div class="front-empty">${esc(t('Фронт безпечний. Нові операції вже готуються!'))}</div>`;
    this.el.specialists.innerHTML = vm.specialists.map((item) => this._specialistHtml(item, !!active)).join('');
    this.el.projects.innerHTML = vm.projects.map((item) => this._projectHtml(item, vm)).join('');
    this.el.projectProgress.textContent = t('{n}/3 операцій', { n: clamp(vm.projectProgress, 0, 3) });
    this._renderActions(vm);
    return vm;
  }

  _readViewModel() {
    try {
      if (typeof this.game.getFrontViewModel === 'function') return this.game.getFrontViewModel();
      if (typeof this.game.frontViewModel === 'function') return this.game.frontViewModel();
      if (this.game.frontViewModel && typeof this.game.frontViewModel === 'object') return this.game.frontViewModel;
    } catch (error) { /* a malformed save is rendered as locked, never crashes the globe */ }
    return this.game.save && this.game.save.front;
  }

  _normalize(source) {
    const raw = source && source.front && !source.board ? source.front : source;
    if (!raw || raw.unlocked === false) return this._emptyViewModel();
    const board = Array.isArray(raw.board) ? raw.board : (Array.isArray(raw.operations) ? raw.operations : []);
    const active = raw.active && typeof raw.active === 'object' ? raw.active : null;
    const operations = board.map((op, index) => ({
      ...op,
      id: String(op.id || `front-op-${index}`),
      country: String(op.country || op.countryId || 'UKR'),
      template: TEMPLATE_UI[op.template] ? op.template : 'evacuation',
      threat: clamp(op.threat || 1, 1, 3),
      status: STATUS_LABEL[op.status] ? op.status : 'available',
      recommended: !!op.recommended,
      countryState: op.countryState && typeof op.countryState === 'object' ? op.countryState : null,
    }));
    const specialists = Array.isArray(raw.specialists)
      ? raw.specialists.map((item) => ({
        ...item,
        id: String(item.id || item.role || 'dispatcher'),
        role: SPECIALIST_UI[item.role] ? item.role : 'dispatcher',
        available: item.available !== false,
      }))
      : this._fallbackSpecialists(active);
    const projects = Array.isArray(raw.projects)
      ? raw.projects.map((item) => ({
        ...item,
        id: PROJECT_UI[item.id] ? item.id : 'medbay',
        level: clamp(item.level, 0, 3),
        progress: clamp(item.progress, 0, 3),
      }))
      : this._fallbackProjects(raw);
    const recommended = raw.recommendedOperationId
      || (operations.find((op) => op.recommended) || {}).id
      || (operations.filter((op) => op.status === 'available').sort((a, b) => a.threat - b.threat)[0] || {}).id
      || null;
    return {
      unlocked: raw.unlocked !== false && (raw.unlocked === true || operations.length > 0),
      guided: !!raw.guided,
      generation: Math.max(0, Number(raw.generation) || 0),
      operations,
      active,
      specialists,
      projects,
      recommendedOperationId: recommended,
      canSelectProject: raw.canSelectProject !== false && !active,
      canAdvance: raw.canAdvance !== false,
      completedOperations: clamp(raw.completedOperations, 0, 3),
      totalOperations: clamp(raw.totalOperations || operations.length || 3, 1, 3),
      projectProgress: raw.projectProgress != null
        ? raw.projectProgress
        : (projects.find((item) => item.selected) || {}).progress || 0,
    };
  }

  _emptyViewModel() {
    return {
      unlocked: false, guided: false, generation: 0, operations: [], active: null,
      specialists: [], projects: [], recommendedOperationId: null,
      canSelectProject: false, canAdvance: false, completedOperations: 0,
      totalOperations: 3, projectProgress: 0,
    };
  }

  _fallbackSpecialists(active) {
    const friends = this.game.save && this.game.save.friends || {};
    const groups = {
      medic: ['UKR', 'FRA', 'SWE'], engineer: ['DEU', 'JPN', 'CHN'],
      scout: ['POL', 'ESP', 'TUR'], supplier: ['PRT', 'ITA', 'EGY'],
    };
    const out = [];
    for (const [role, ids] of Object.entries(groups)) {
      const id = ids.find((countryId) => friends[countryId]);
      if (id) out.push({ id, role, available: true, selected: active && active.specialist === id });
    }
    if (!out.length || (active && active.specialist === 'dispatcher')) {
      out.unshift({ id: 'dispatcher', role: 'dispatcher', available: true, selected: true });
    }
    return out;
  }

  _fallbackProjects(raw) {
    const values = raw.projects && !Array.isArray(raw.projects) ? raw.projects : {};
    return Object.keys(PROJECT_UI).map((id) => ({
      id,
      level: clamp(values[id], 0, 3),
      progress: id === raw.activeProject ? clamp(raw.projectProgress, 0, 3) : 0,
      selected: id === (raw.activeProject || 'medbay'),
      maxed: Number(values[id]) >= 3,
      locked: !!raw.active,
    }));
  }

  _renderLocked() {
    this.el.status.innerHTML = `<div class="front-status-icon">🌍</div><div><strong>${esc(t('Фронт ще не відкрито'))}</strong><span>${esc(t('Звільни Україну, щоб отримати першу операцію.'))}</span></div>`;
    this.el.operations.innerHTML = '';
    this.el.specialists.innerHTML = '';
    this.el.projects.innerHTML = '';
    this.el.projectProgress.textContent = '';
    this.el.rewards.innerHTML = '';
    this.el.go.disabled = true;
    this.el.go.textContent = t('🔒 СПОЧАТКУ ЗВІЛЬНИ УКРАЇНУ');
    this.el.abandon.hidden = true;
  }

  _statusHtml(vm, operation) {
    if (vm.active) {
      const country = this._country(operation && operation.country);
      const stage = clamp(vm.active.stage, 0, 2) + 1;
      return `<div class="front-status-icon">▶️</div><div><strong>${esc(t('{flag} Операція триває', { flag: country.flag }))}</strong><span>${esc(t('Етап {n}/3 · прогрес збережено', { n: stage }))}</span></div>`;
    }
    const done = clamp(vm.completedOperations, 0, vm.totalOperations);
    return `<div class="front-status-icon">${vm.guided ? '🎓' : '🛰️'}</div><div><strong>${esc(vm.guided ? t('Навчальна операція') : t('Покоління фронту {n}', { n: vm.generation + 1 }))}</strong><span>${esc(t('Завершено: {done}/{all} · країни не втрачаються', { done, all: vm.totalOperations }))}</span></div>`;
  }

  _operationHtml(op, vm) {
    const template = TEMPLATE_UI[op.template];
    const country = this._country(op.country);
    const selected = op.id === this.selectedOperationId;
    const disabled = ['completed', 'claimed', 'locked'].includes(op.status) || (!!vm.active && vm.active.operationId !== op.id);
    const reward = op.reward && typeof op.reward === 'object' ? op.reward : null;
    const rewardText = reward
      ? `🪙 ${clamp(reward.coins, 0, 99999)} · 💎 ${clamp(reward.crystals, 0, 999)}`
      : t('🎁 Розвідай');
    const threat = '⚠️'.repeat(op.threat);
    const commander = op.commander ? `<span class="front-op-intel">👑 ${esc(op.commander)}</span>` : '';
    const restoring = op.countryState && op.countryState.state === 'restoring';
    const countryState = restoring ? 'rebuilding'
      : (op.countryState && ['threat', 'safe'].includes(op.countryState.state) ? op.countryState.state : 'threat');
    const statusLabel = restoring ? 'Відбудова' : STATUS_LABEL[op.status];
    return `<button class="front-operation ${selected ? 'selected' : ''} ${op.recommended ? 'recommended' : ''} status-${esc(op.status)} ${restoring ? 'state-restoring' : ''}" type="button"
      data-operation-id="${esc(op.id)}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>
      <span class="front-op-flag">${country.flag}</span>
      <span class="front-op-main">
        <span class="front-op-top"><strong>${template.icon} ${esc(t(template.name))}</strong>${op.recommended ? `<b>${esc(t('РЕКОМЕНОВАНО'))}</b>` : ''}</span>
        <span class="front-op-country"><i class="front-marker ${countryState}"></i>${esc(country.name)} · ${esc(t(statusLabel))}</span>
        <span class="front-op-desc">${esc(t(template.desc))}</span>
        ${commander}
      </span>
      <span class="front-op-side"><span class="front-threat" aria-label="${esc(t('Загроза {n} з 3', { n: op.threat }))}">${threat}</span><span>${esc(rewardText)}</span></span>
    </button>`;
  }

  _specialistHtml(item, operationActive) {
    const ui = SPECIALIST_UI[item.role] || SPECIALIST_UI.dispatcher;
    const selected = item.id === this.selectedSpecialistId;
    const disabled = !item.available || operationActive;
    const country = item.id.length === 3 && COUNTRIES[item.id] ? this._country(item.id) : null;
    return `<button class="front-choice ${selected ? 'selected' : ''}" type="button" data-specialist-id="${esc(item.id)}"
      aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>
      <span class="front-choice-icon">${ui.icon}</span><span><strong>${esc(t(ui.name))}${country ? ` · ${country.flag}` : ''}</strong><small>${esc(t(ui.desc))}</small></span>
      ${!item.available ? `<span class="front-lock">🔒 ${esc(t('Врятуй друга'))}</span>` : ''}
    </button>`;
  }

  _projectHtml(item, vm) {
    const ui = PROJECT_UI[item.id];
    const selected = !!item.selected;
    const disabled = item.locked || item.maxed || !vm.canSelectProject;
    const level = clamp(item.level, 0, 3);
    const pips = [0, 1, 2].map((index) => `<i class="${index < level ? 'on' : ''}"></i>`).join('');
    return `<button class="front-choice front-project ${selected ? 'selected' : ''} ${item.maxed ? 'maxed' : ''}" type="button"
      data-project-id="${esc(item.id)}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>
      <span class="front-choice-icon">${ui.icon}</span><span><strong>${esc(t(ui.name))}</strong><small>${esc(t(ui.desc))}</small><span class="front-level" aria-label="${esc(t('Рівень {n} з 3', { n: level }))}">${pips}</span></span>
    </button>`;
  }

  _renderActions(vm) {
    const active = vm.active;
    const selected = vm.operations.find((op) => op.id === this.selectedOperationId);
    this.el.go.disabled = !vm.canAdvance || (!active && (!selected || ['completed', 'claimed', 'locked'].includes(selected.status)));
    this.el.go.textContent = active
      ? t('▶️ ПРОДОВЖИТИ ЕТАП {n}/3', { n: clamp(active.stage, 0, 2) + 1 })
      : t('🚀 ПОЧАТИ ОПЕРАЦІЮ');
    this.el.abandon.hidden = !active;
    if (selected) {
      const reward = selected.reward && typeof selected.reward === 'object' ? selected.reward : null;
      const rewardText = reward
        ? `🪙 ${clamp(reward.coins, 0, 99999)} · 💎 ${clamp(reward.crystals, 0, 999)}`
        : t('Розвідані про нагороду ще невідомі');
      this.el.rewards.innerHTML = `<span>🎯 ${esc(t('Три короткі етапи'))}</span><span>🎁 ${esc(rewardText)}</span>`;
    } else {
      this.el.rewards.innerHTML = '';
    }
  }

  _selectOperation(event) {
    const button = event.target.closest('[data-operation-id]');
    if (!button || button.disabled) return;
    this._click();
    this.selectedOperationId = button.dataset.operationId;
    this.render(this.vm);
  }

  _selectSpecialist(event) {
    const button = event.target.closest('[data-specialist-id]');
    if (!button || button.disabled) return;
    this._click();
    this.selectedSpecialistId = button.dataset.specialistId;
    if (typeof this.game.selectFrontSpecialist === 'function') this.game.selectFrontSpecialist(this.selectedSpecialistId);
    this.render(this.vm);
  }

  _selectProject(event) {
    const button = event.target.closest('[data-project-id]');
    if (!button || button.disabled) return;
    this._click();
    const projectId = button.dataset.projectId;
    if (typeof this.game.selectFrontProject === 'function') this.game.selectFrontProject(projectId);
    else {
      this.vm.projects.forEach((item) => { item.selected = item.id === projectId; });
    }
    this.render();
  }

  _start() {
    if (this.el.go.disabled) return;
    this._click();
    const operationId = this.vm.active ? this.vm.active.operationId : this.selectedOperationId;
    if (typeof this.game.startFrontOperation === 'function') {
      this.game.startFrontOperation(operationId, this.selectedSpecialistId);
    }
  }

  _abandon() {
    if (!this.vm || !this.vm.active || typeof this.game.abandonFrontOperation !== 'function') return;
    this._click();
    this.game.abandonFrontOperation();
    this.render();
  }

  _country(id) {
    const country = COUNTRIES[id];
    return country ? { flag: country.flag, name: country.name } : { flag: '🌍', name: id || t('Невідома країна') };
  }

  _click() {
    if (this.game.audio && typeof this.game.audio.click === 'function') this.game.audio.click();
  }
}
