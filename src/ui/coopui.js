// UI кооперативу: модалка «Грати разом» (нік, створити/приєднатися) і лобі
// (код кімнати, ростер, вибір країни хостом, СТАРТ).
import { CoopSession, loadNick, cleanNick } from '../net/coop.js';
import { COUNTRIES, CAMPAIGN_ORDER } from '../countries.js';
import { HERO_SKINS } from '../characters.js';

export class CoopUI {
  constructor(game) {
    this.game = game;
    this.session = new CoopSession(game);
    const $ = (id) => document.getElementById(id);
    this.el = {
      open: $('btn-coop'),
      modal: $('overlay-coop'),
      nick: $('coop-nick'),
      create: $('btn-coop-create'),
      join: $('btn-coop-join'),
      code: $('coop-code'),
      err: $('coop-error'),
      lobby: $('overlay-lobby'),
      lobbyCode: $('lobby-code'),
      roster: $('lobby-roster'),
      countries: $('lobby-countries'),
      modes: $('lobby-modes'),
      start: $('btn-lobby-start'),
      leave: $('btn-lobby-leave'),
      hint: $('lobby-hint'),
    };

    this.el.open.addEventListener('click', () => {
      game.audio.click();
      this.el.nick.value = loadNick() || 'Гравець';
      this._err('');
      this.el.code.value = '';
      game._showOverlay('overlay-coop');
    });
    document.querySelectorAll('[data-close="overlay-coop"]').forEach((b) =>
      b.addEventListener('click', () => game._hideOverlay('overlay-coop')));

    this.el.create.addEventListener('click', () => this._create());
    this.el.join.addEventListener('click', () => this._join());
    this.el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._join(); });
    this.el.code.addEventListener('input', () => {
      this.el.code.value = this.el.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
    this.el.start.addEventListener('click', () => {
      if (this.session.role === 'host') {
        game.audio.click();
        this.session.startLevel();
      }
    });
    this.el.leave.addEventListener('click', () => {
      game.audio.click();
      this.session.leave();
      game._hideOverlay('overlay-lobby');
    });

    this.session.onRoster = () => this._renderLobby();
    this.session.onCfg = () => this._renderLobby();
    this.session.onStarted = () => game._hideOverlay('overlay-lobby');
    this.session.onEnd = (reason, wasLevel) => {
      game._hideOverlay('overlay-lobby');
      if (wasLevel && game.state === 'level') {
        game.endLevel();
      }
      const msgs = {
        hostgone: '😴 Хост закрив гру — кімнати більше немає',
        lost: '📡 Звʼязок втрачено',
        closed: '🚪 Кімнату закрито',
      };
      game.hud.toast(msgs[reason] || '🚪 Кімнату закрито');
    };

    // швидкий вхід для тестів: ?coophost / ?coopjoin=CODE (&nick=)
    const params = game.params;
    if (params.has('coophost')) {
      this._autoHost(params.get('nick') || 'Хост');
    } else if (params.get('coopjoin')) {
      this._autoJoin(params.get('coopjoin'), params.get('nick') || 'Гість');
    }
  }

  async _autoHost(nick) {
    try {
      const code = await this.session.create(nick);
      this._openLobby();
      console.log('[coop] room', code);
    } catch (e) { console.error('coophost failed', e); }
  }

  async _autoJoin(code, nick) {
    try {
      await this.session.join(code.toUpperCase(), nick);
      this._openLobby();
    } catch (e) { console.error('coopjoin failed', e); }
  }

  _err(text) {
    this.el.err.textContent = text;
    this.el.err.style.display = text ? 'block' : 'none';
  }

  _nickOk() {
    const nick = cleanNick(this.el.nick.value);
    if (nick.length < 2) {
      this._err('Введи нік (хоча б 2 символи) 😊');
      return null;
    }
    return nick;
  }

  async _create() {
    const nick = this._nickOk();
    if (!nick) return;
    this._err('');
    this.el.create.disabled = true;
    this.el.create.textContent = '⏳ Створюємо…';
    try {
      await this.session.create(nick);
      this.game._hideOverlay('overlay-coop');
      this._openLobby();
      this.game.audio.mission();
    } catch (e) {
      this._err(this._connErr(e));
    } finally {
      this.el.create.disabled = false;
      this.el.create.textContent = '🏠 СТВОРИТИ КІМНАТУ';
    }
  }

  async _join() {
    const nick = this._nickOk();
    if (!nick) return;
    const code = this.el.code.value.trim().toUpperCase();
    if (code.length < 4) { this._err('Введи код кімнати з 4 літер'); return; }
    this._err('');
    this.el.join.disabled = true;
    this.el.join.textContent = '⏳ Заходимо…';
    try {
      await this.session.join(code, nick);
      this.game._hideOverlay('overlay-coop');
      this._openLobby();
      this.game.audio.mission();
    } catch (e) {
      this._err(this._connErr(e));
    } finally {
      this.el.join.disabled = false;
      this.el.join.textContent = '🚪 ПРИЄДНАТИСЯ';
    }
  }

  _connErr(e) {
    const m = String(e && e.message || e);
    if (m === 'norelay') return 'Сервер кооперативу ще не налаштовано — потрібно задеплоїти worker/ і вписати адресу в src/net/transport.js (див. README)';
    if (m === 'noroom') return 'Кімнати з таким кодом немає 🤔 Перевір код!';
    if (m === 'full') return 'Кімната вже повна (4 гравці) 😅';
    if (m === 'taken') return 'Спробуй ще раз — код зайнятий';
    if (m.startsWith('build:')) return `У вас різні версії гри! Онови сторінку: Ctrl(⌘)+Shift+R`;
    if (m === 'timeout' || m === 'closed' || m === 'badurl') return 'Не вдалося звʼязатися з сервером 📡 Перевір інтернет';
    return 'Щось пішло не так… Спробуй ще раз';
  }

  _openLobby() {
    this._renderLobby();
    this.game._showOverlay('overlay-lobby');
  }

  _renderLobby() {
    const s = this.session;
    if (s.state === 'idle') return;
    this.el.lobbyCode.textContent = s.room || '';
    const isHost = s.role === 'host';

    // ростер
    let html = '';
    for (const [pid, r] of s.roster) {
      const skin = HERO_SKINS[r.skin] ? HERO_SKINS[r.skin].icon : '🙂';
      html += `<div class="lobby-player ${pid === s.myPid ? 'me' : ''}">
        <span class="lp-skin">${skin}</span>
        <span class="lp-nick">${this._esc(r.nick || '...')}</span>
        <span class="lp-role">${pid === 1 ? '👑 хост' : ''}</span>
      </div>`;
    }
    for (let i = s.roster.size; i < 4; i++) {
      html += '<div class="lobby-player empty"><span class="lp-skin">➕</span><span class="lp-nick">вільне місце</span></div>';
    }
    this.el.roster.innerHTML = html;

    // режим: кампанія чи шторм
    const save = this.game.save;
    const anyLib = Object.keys(save.liberated || {}).length > 0;
    const stormAllowed = !isHost || anyLib;
    let mh = '';
    const libCount = Object.keys(save.liberated || {}).length;
    for (const [mid, label] of [['campaign', '🎯 Кампанія'], ['storm', '⛈️ Шторм'], ['arena', '👑 Арена']]) {
      const sel = s.mode === mid;
      const locked = isHost && ((mid === 'storm' && !anyLib) || (mid === 'arena' && libCount < 2));
      mh += `<div class="lobby-mode ${sel ? 'sel' : ''} ${isHost && !locked ? 'pick' : ''} ${locked ? 'locked' : ''}" data-mode="${mid}">${label}${locked ? ' 🔒' : ''}</div>`;
    }
    this.el.modes.innerHTML = mh;
    if (isHost) {
      this.el.modes.querySelectorAll('.lobby-mode.pick').forEach((el) => {
        el.addEventListener('click', () => {
          this.game.audio.click();
          s.setMode(el.dataset.mode);
          // шторм лише на звільнених — перескакуємо, якщо поточна не пасує
          if (s.mode === 'storm' && !save.liberated[s.countryId]) {
            const lib = CAMPAIGN_ORDER.filter((c) => save.liberated[c]);
            if (lib.length) s.setCountry(lib[lib.length - 1]);
          }
          this._renderLobby();
        });
      });
    }
    void stormAllowed;

    // вибір країни (в Арени своя мапа — пікер ховаємо)
    document.querySelectorAll('#overlay-lobby .lobby-section')[1].style.display = s.mode === 'arena' ? 'none' : '';
    this.el.countries.style.display = s.mode === 'arena' ? 'none' : '';
    let ch = '';
    for (const id of CAMPAIGN_ORDER) {
      const c = COUNTRIES[id];
      // у шторм-режимі грають лише ЗВІЛЬНЕНІ хостом країни
      const unlocked = s.mode === 'storm'
        ? !!save.liberated[id]
        : (id === 'UKR' || save.liberated[CAMPAIGN_ORDER[CAMPAIGN_ORDER.indexOf(id) - 1]]);
      const sel = s.countryId === id;
      const cls = `lobby-country ${sel ? 'sel' : ''} ${isHost && unlocked ? 'pick' : ''} ${!unlocked && isHost ? 'locked' : ''}`;
      ch += `<div class="${cls}" data-id="${id}">${c.flag}<span>${c.name}</span>${!unlocked && isHost ? '🔒' : ''}</div>`;
    }
    this.el.countries.innerHTML = ch;
    if (isHost) {
      this.el.countries.querySelectorAll('.lobby-country.pick').forEach((el) => {
        el.addEventListener('click', () => {
          this.game.audio.click();
          s.setCountry(el.dataset.id);
          this._renderLobby();
        });
      });
    }

    this.el.start.style.display = isHost ? '' : 'none';
    this.el.start.disabled = false;
    const modeTxt = s.mode === 'storm' ? '⛈️ ШТОРМ' : s.mode === 'arena' ? '👑 АРЕНУ БОСІВ' : 'кампанію';
    this.el.hint.textContent = isHost
      ? (s.roster.size > 1 ? 'Усі в зборі? Тисни СТАРТ!' : 'Продиктуй другу код кімнати 👆')
      : `Хост обрав ${modeTxt} · ${COUNTRIES[s.countryId] ? COUNTRIES[s.countryId].flag + ' ' + COUNTRIES[s.countryId].name : ''} — чекаємо на СТАРТ…`;
  }

  _esc(str) {
    return String(str).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  }
}
