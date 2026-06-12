// UI кооперативу: модалка «Грати разом» і лобі кімнати.
// Потік: нік (раз) → панель з кнопками ліворуч і «життям» праворуч —
// лічильник онлайна, хто в мережі, відкриті кімнати з кнопкою «Зайти» без кода.
import { CoopSession, loadNick, saveNick, cleanNick } from '../net/coop.js';
import { LobbyClient } from '../net/lobby.js';
import { COUNTRIES, CAMPAIGN_ORDER, isCountryOpen } from '../countries.js';
import { HERO_SKINS } from '../characters.js';

const PUBLIC_KEY = 'zr-public';
const MODE_ICON = { campaign: '🎯', storm: '⛈️', arena: '👑' };

export class CoopUI {
  constructor(game) {
    this.game = game;
    this.session = new CoopSession(game);
    this.lobbyNet = new LobbyClient(game);
    const $ = (id) => document.getElementById(id);
    this.el = {
      open: $('btn-coop'),
      modal: $('overlay-coop'),
      stepNick: $('coop-step-nick'),
      stepMain: $('coop-step-main'),
      nick: $('coop-nick'),
      nickBtn: $('btn-coop-nick'),
      nickErr: $('coop-nick-error'),
      meNick: $('coop-me-nick'),
      rename: $('btn-coop-rename'),
      create: $('btn-coop-create'),
      join: $('btn-coop-join'),
      code: $('coop-code'),
      err: $('coop-error'),
      pub: $('coop-public'),
      onlineN: $('coop-online-n'),
      rooms: $('coop-rooms'),
      players: $('coop-players'),
      lobby: $('overlay-lobby'),
      lobbyCode: $('lobby-code'),
      lobbyPubRow: $('lobby-public-row'),
      lobbyPub: $('lobby-public'),
      roster: $('lobby-roster'),
      countries: $('lobby-countries'),
      modes: $('lobby-modes'),
      start: $('btn-lobby-start'),
      leave: $('btn-lobby-leave'),
      hint: $('lobby-hint'),
    };

    // публічність кімнати — запам'ятовуємо вибір
    this.publicOn = this._loadPublic();
    this.el.pub.checked = this.publicOn;
    this.el.lobbyPub.checked = this.publicOn;

    // 🟢 лобі-сервіс: що анонсуємо і куди малюємо
    this.lobbyNet.getRoom = () => this._roomAnnounce();
    this.lobbyNet.onUpdate = (d) => this._renderSide(d);

    this.el.open.addEventListener('click', () => {
      game.audio.click();
      this._openCoop();
    });
    document.querySelectorAll('[data-close="overlay-coop"]').forEach((b) =>
      b.addEventListener('click', () => {
        game._hideOverlay('overlay-coop');
        this._syncPolling();
      }));

    // крок 1: нік
    const acceptNick = () => this._acceptNick();
    this.el.nickBtn.addEventListener('click', acceptNick);
    this.el.nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') acceptNick(); });
    this.el.rename.addEventListener('click', () => {
      game.audio.click();
      this._showStep('nick');
    });

    // крок 2: створити / зайти
    this.el.create.addEventListener('click', () => this._create());
    this.el.join.addEventListener('click', () => this._join());
    this.el.code.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._join(); });
    this.el.code.addEventListener('input', () => {
      this.el.code.value = this.el.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    });
    const onPub = (checked) => {
      this.publicOn = checked;
      this.el.pub.checked = checked;
      this.el.lobbyPub.checked = checked;
      this._savePublic(checked);
      this.lobbyNet.refresh();
    };
    this.el.pub.addEventListener('change', () => onPub(this.el.pub.checked));
    this.el.lobbyPub.addEventListener('change', () => { game.audio.click(); onPub(this.el.lobbyPub.checked); });

    this.el.start.addEventListener('click', () => {
      if (this.session.role === 'host') {
        game.audio.click();
        this.session.startLevel();
      }
    });
    this.el.leave.addEventListener('click', () => {
      game.audio.click();
      const code = this.session.role === 'host' ? this.session.room : null;
      this.session.leave();
      game._hideOverlay('overlay-lobby');
      if (code) this.lobbyNet.announceClose(code);
      this._syncPolling();
    });

    this.session.onRoster = () => {
      this._renderLobby();
      this.updateRoomChip();
      this.lobbyNet.refresh();
    };
    this.session.onCfg = () => this._renderLobby();
    this.session.onStarted = () => {
      game._hideOverlay('overlay-lobby');
      this.updateRoomChip();
      const n = this.session.roster.size;
      if (n > 1) game.hud.toast(`⚔️ Вас ${n} — зомбі сильніші ×${n}! Тримайтесь разом!`);
      this.lobbyNet.refresh(); // у списку кімнат стане «⚔️ у грі»
    };
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
      this._syncPolling();
    };

    // швидкий вхід для тестів: ?coophost / ?coopjoin=CODE (&nick=)
    const params = game.params;
    if (params.has('coophost')) {
      this._autoHost(params.get('nick') || 'Хост');
    } else if (params.get('coopjoin')) {
      this._autoJoin(params.get('coopjoin'), params.get('nick') || 'Гість');
    }
  }

  // ---------- публічність ----------
  _loadPublic() {
    try { return localStorage.getItem(PUBLIC_KEY) !== '0'; } catch (e) { return true; }
  }

  _savePublic(on) {
    try { localStorage.setItem(PUBLIC_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // що розповідаємо світу: хост публічної кімнати — її стан, решта — лише присутність
  _roomAnnounce() {
    const s = this.session;
    if (s.role !== 'host' || !s.room || !this.publicOn) return null;
    return {
      code: s.room, mode: s.mode, country: s.countryId,
      n: s.roster.size, state: s.state === 'level' ? 'game' : 'lobby',
      build: window.__APP_VERSION,
    };
  }

  // 🤝 чип у HUD: код кімнати + скільки нас (видно всім — клич друзів просто в бою)
  updateRoomChip() {
    const el = document.getElementById('coop-room');
    if (!el) return;
    const s = this.session;
    const show = s.state === 'level' && !!s.room;
    el.style.display = show ? '' : 'none';
    if (show) {
      const n = s.roster.size;
      el.innerHTML = `🤝 Код: <b>${this._esc(s.room)}</b> · ${n}/4${n > 1 ? ` · 🧟×${n}` : ''}`;
    }
  }

  // пінгуємо, поки видно модалку або жива сесія
  _syncPolling() {
    const modalOpen = this.el.modal.classList.contains('show');
    if (modalOpen || this.session.state !== 'idle') this.lobbyNet.start();
    else this.lobbyNet.stop();
  }

  // ---------- кроки модалки ----------
  _openCoop() {
    this._err('');
    this.el.code.value = '';
    const nick = cleanNick(loadNick());
    this._showStep(nick.length >= 2 ? 'main' : 'nick');
    this.game._showOverlay('overlay-coop');
    this._syncPolling();
  }

  _showStep(step) {
    const nick = cleanNick(loadNick());
    this.el.stepNick.style.display = step === 'nick' ? '' : 'none';
    this.el.stepMain.style.display = step === 'main' ? '' : 'none';
    if (step === 'nick') {
      this.el.nick.value = nick;
      this.el.nickErr.style.display = 'none';
      setTimeout(() => this.el.nick.focus(), 50);
    } else {
      this.el.meNick.textContent = nick;
      this._renderSide(this.lobbyNet.data);
    }
  }

  _acceptNick() {
    const nick = cleanNick(this.el.nick.value);
    if (nick.length < 2) {
      this.el.nickErr.textContent = 'Введи нік (хоча б 2 символи) 😊';
      this.el.nickErr.style.display = 'block';
      return;
    }
    saveNick(nick);
    this.game.audio.click();
    this._showStep('main');
    this.lobbyNet.refresh(); // одразу показатись у списку з новим ніком
  }

  // ---------- права панель: онлайн ----------
  _renderSide(d) {
    if (!this.el.modal.classList.contains('show')) return;
    const esc = (x) => this._esc(x);
    if (!d) {
      this.el.onlineN.textContent = '—';
      this.el.rooms.innerHTML = '<div class="coop-side-empty">📡 Сервер недоступний — перевір інтернет</div>';
      this.el.players.innerHTML = '';
      return;
    }
    this.el.onlineN.textContent = d.online;

    // кімнати: лише сумісні з нашою версією і не наша власна
    const build = window.__APP_VERSION;
    const myNick = cleanNick(loadNick());
    const rooms = (d.rooms || []).filter((r) => r.build === build && r.code !== this.session.room);
    let rh = '';
    for (const r of rooms) {
      const c = COUNTRIES[r.country];
      const where = r.mode === 'arena' ? 'Арена' : c ? `${c.flag} ${c.name}` : r.country;
      const full = r.n >= 4;
      rh += `<div class="coop-room">
        <span class="cr-mode">${MODE_ICON[r.mode] || '🎯'}</span>
        <span class="cr-info"><b>${esc(r.host)}</b><small>${where} · ${r.state === 'game' ? '⚔️ у грі' : '🛋️ збирається'}</small></span>
        <span class="cr-n">${r.n}/4</span>
        <button class="btn cr-join" data-code="${esc(r.code)}" ${full ? 'disabled' : ''}>${full ? 'Повна' : 'Зайти'}</button>
      </div>`;
    }
    if (!rh) rh = '<div class="coop-side-empty">Поки немає відкритих кімнат.<br>Створи свою — і на тебе чекатимуть! 🏠</div>';
    this.el.rooms.innerHTML = rh;
    this.el.rooms.querySelectorAll('.cr-join:not([disabled])').forEach((b) =>
      b.addEventListener('click', () => {
        this.game.audio.click();
        this._join(b.dataset.code);
      }));

    // гравці в мережі
    let ph = '';
    for (const nick of d.players || []) {
      const me = nick === myNick;
      ph += `<span class="coop-player ${me ? 'me' : ''}">${esc(nick)}${me ? ' (ти)' : ''}</span>`;
    }
    this.el.players.innerHTML = ph || '<div class="coop-side-empty">Тут зʼявляться гравці онлайн</div>';
  }

  // ---------- вхід у кімнату ----------
  async _autoHost(nick) {
    try {
      saveNick(cleanNick(nick) || 'Хост');
      const code = await this.session.create(nick);
      this._openLobby();
      this._syncPolling();
      console.log('[coop] room', code);
    } catch (e) { console.error('coophost failed', e); }
  }

  async _autoJoin(code, nick) {
    try {
      saveNick(cleanNick(nick) || 'Гість');
      await this.session.join(code.toUpperCase(), nick);
      this._openLobby();
      this._syncPolling();
    } catch (e) { console.error('coopjoin failed', e); }
  }

  _err(text) {
    this.el.err.textContent = text;
    this.el.err.style.display = text ? 'block' : 'none';
  }

  _myNick() {
    const nick = cleanNick(loadNick());
    if (nick.length < 2) { this._showStep('nick'); return null; }
    return nick;
  }

  async _create() {
    const nick = this._myNick();
    if (!nick) return;
    this._err('');
    this.el.create.disabled = true;
    this.el.create.textContent = '⏳ Створюємо…';
    try {
      await this.session.create(nick);
      this.game._hideOverlay('overlay-coop');
      this._openLobby();
      this.lobbyNet.refresh(); // публічна кімната одразу в списку
      this.game.audio.mission();
    } catch (e) {
      this._err(this._connErr(e));
    } finally {
      this.el.create.disabled = false;
      this.el.create.textContent = '🏠 СТВОРИТИ КІМНАТУ';
    }
  }

  async _join(codeArg) {
    const nick = this._myNick();
    if (!nick) return;
    const code = (codeArg || this.el.code.value).trim().toUpperCase();
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
      this.el.join.textContent = '🚪 ЗАЙТИ';
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
    this._syncPolling();
  }

  _renderLobby() {
    const s = this.session;
    if (s.state === 'idle') return;
    this.el.lobbyCode.textContent = s.room || '';
    const isHost = s.role === 'host';
    this.el.lobbyPubRow.style.display = isHost ? '' : 'none';

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
          this.lobbyNet.refresh();
        });
      });
    }

    // вибір країни (в Арени своя мапа — пікер ховаємо)
    document.querySelectorAll('#overlay-lobby .lobby-section')[1].style.display = s.mode === 'arena' ? 'none' : '';
    this.el.countries.style.display = s.mode === 'arena' ? 'none' : '';
    let ch = '';
    for (const id of CAMPAIGN_ORDER) {
      const c = COUNTRIES[id];
      // у шторм-режимі грають лише ЗВІЛЬНЕНІ хостом країни
      const unlocked = s.mode === 'storm'
        ? !!save.liberated[id]
        : isCountryOpen(save.liberated, id);
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
          this.lobbyNet.refresh();
        });
      });
    }

    this.el.start.style.display = isHost ? '' : 'none';
    this.el.start.disabled = false;
    const modeTxt = s.mode === 'storm' ? '⛈️ ШТОРМ' : s.mode === 'arena' ? '👑 АРЕНУ БОСІВ' : 'кампанію';
    this.el.hint.textContent = isHost
      ? (s.roster.size > 1 ? 'Усі в зборі? Тисни СТАРТ!' : (this.publicOn
        ? 'Кімнату видно у списку — чекай гостей або продиктуй код 👆'
        : 'Продиктуй другу код кімнати 👆'))
      : `Хост обрав ${modeTxt} · ${COUNTRIES[s.countryId] ? COUNTRIES[s.countryId].flag + ' ' + COUNTRIES[s.countryId].name : ''} — чекаємо на СТАРТ…`;
  }

  _esc(str) {
    return String(str).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  }
}
