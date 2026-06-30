// UI кооперативу: модалка «Грати разом» і лобі кімнати.
// Потік: нік (раз) → панель з кнопками ліворуч і «життям» праворуч —
// лічильник онлайна, хто в мережі, відкриті кімнати з кнопкою «Зайти» без кода.
import { CoopSession, loadNick, saveNick, cleanNick, PING_PHRASES } from '../net/coop.js';
import { t } from '../i18n.js';
import { nickIsBad } from '../../worker/nick.mjs';
import { LobbyClient } from '../net/lobby.js';
import { COUNTRIES, CAMPAIGN_ORDER, isCountryOpen } from '../countries.js';
import { HERO_SKINS } from '../characters.js';
import { liberatedCount, hasLiberated } from '../net/cloudsave.js';
import { FRIENDLY_KNOCKOUT_UNLOCK_COUNTRIES } from '../knockout.js';

const PUBLIC_KEY = 'zr-public';
const MODE_ICON = { campaign: '🎯', storm: '⛈️', arena: '👑', 'friendly-knockout': '🤝' };

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
      todayN: $('coop-today-n'),
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
      invite: $('btn-coop-invite'),
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

    this.el.invite.addEventListener('click', () => this._shareInvite());

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
      if (n > 1) game.hud.toast(t('⚔️ Вас {n} — зомбі сильніші ×{n}! Тримайтесь разом!', { n }));
      this.lobbyNet.refresh(); // у списку кімнат стане «⚔️ у грі»
    };
    // гість більше не заручник мовчазного хоста: з очікування можна вийти
    const netLeave = document.getElementById('btn-net-leave');
    if (netLeave) {
      netLeave.addEventListener('click', () => {
        game._hideOverlay('overlay-net-wait');
        this.session.leave();
        if (game.state === 'level') game.endLevel();
        game.hud.toast(t('🚪 Ти вийшов з кімнати'));
        this._syncPolling();
        this.updateRoomChip();
      });
    }
    this.session.onEnd = (reason, wasLevel) => {
      game._hideOverlay('overlay-lobby');
      if (wasLevel && game.state === 'level') {
        game.endLevel();
      }
      const msgs = {
        hostgone: t('😴 Хост закрив гру — кімнати більше немає'),
        lost: t('📡 Звʼязок втрачено'),
        closed: t('🚪 Кімнату закрито'),
      };
      game.hud.toast(msgs[reason] || t('🚪 Кімнату закрито'));
      this._syncPolling();
    };

    // швидкий вхід для тестів: ?coophost / ?coopjoin=CODE (&nick=)
    const params = game.params;
    if (params.has('coophost')) {
      this._autoHost(params.get('nick') || t('Хост'));
    } else if (params.get('coopjoin')) {
      this._autoJoin(params.get('coopjoin'), params.get('nick') || loadNick() || t('Гість'));
    }
  }

  // ---------- 📨 поклич друга ----------
  // Лінк на цю ж гру з кодом кімнати — друг тисне й одразу заходить (?coopjoin=CODE).
  _inviteUrl(code) {
    return location.origin + location.pathname + '?coopjoin=' + encodeURIComponent(code);
  }

  async _shareInvite() {
    const code = this.session && this.session.room;
    if (!code) return; // нема кімнати → нічого не робимо
    const url = this._inviteUrl(code);
    const text = t('Гайда грати разом проти зомбі! 🧟 Тисни — і ти в моїй грі:');
    this.game.audio.click();
    try {
      if (navigator.share) { await navigator.share({ title: t('Операція: Порятунок Світу'), text, url }); return; }
    } catch (e) { /* користувач скасував share — ок */ return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        this.game.hud.toast(t('🔗 Посилання скопійовано — надішли другу!'));
        return;
      }
    } catch (e) { /* clipboard заблоковано — покажемо посилання */ }
    this.game.hud.toast(t('🔗 Посилання: {u}', { u: url }));
  }

  // ---------- публічність ----------
  _loadPublic() {
    try { return localStorage.getItem(PUBLIC_KEY) === '1'; } catch (e) { return false; }
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
      el.innerHTML = t('🤝 Код:', {}) + ` <b>${this._esc(s.room)}</b> · ${n}/4${n > 1 ? ` · 🧟×${n}` : ''}`;
    }
    // тап по чипу = колесо пінгів (без нового HUD-елемента). Слухач навішуємо раз.
    if (!this._chipPingWired) {
      this._chipPingWired = true;
      el.title = t('Пінг команді');
      el.addEventListener('click', () => {
        if (this.session.state === 'level') this.openPingWheel();
      });
    }
  }

  // 📣 колесо пінгів: 5 фіксованих фраз з PING_PHRASES, клік → sendPing + закрити
  openPingWheel() {
    if (this.session.state !== 'level') return;
    const wheel = document.getElementById('ping-wheel');
    if (!wheel) return;
    this.game.audio.click();
    let html = '';
    PING_PHRASES.forEach((p, i) => {
      html += `<button class="ping-btn" data-i="${i}">${p.icon} ${this._esc(p.text)}</button>`;
    });
    wheel.innerHTML = html;
    wheel.querySelectorAll('.ping-btn').forEach((b) => {
      b.addEventListener('click', () => {
        this.session.sendPing(b.dataset.i | 0);
        this.game._hideOverlay('overlay-ping');
      });
    });
    this.game._showOverlay('overlay-ping');
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
    // 🧼 безпека дітей: лайку в ніку не приймаємо тихо — просимо обрати інший
    if (nickIsBad(this.el.nick.value)) {
      this.el.nickErr.textContent = t('Обери, будь ласка, інший нік 🙂');
      this.el.nickErr.style.display = 'block';
      return;
    }
    const nick = cleanNick(this.el.nick.value);
    if (nick.length < 2) {
      this.el.nickErr.textContent = t('Введи нік (хоча б 2 символи) 😊');
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
      if (this.el.todayN) this.el.todayN.textContent = '—';
      this.el.rooms.innerHTML = t('<div class="coop-side-empty">📡 Сервер недоступний — перевір інтернет</div>');
      this.el.players.innerHTML = '';
      return;
    }
    this.el.onlineN.textContent = d.online;
    if (this.el.todayN) this.el.todayN.textContent = d.today != null ? d.today : '—';

    // кімнати: лише сумісні з нашою версією і не наша власна
    const build = window.__APP_VERSION;
    const myNick = cleanNick(loadNick());
    const rooms = (d.rooms || []).filter((r) => r.build === build && r.code !== this.session.room);
    let rh = '';
    for (const r of rooms) {
      const c = COUNTRIES[r.country];
      const where = r.mode === 'arena' ? t('Арена') : c ? `${c.flag} ${c.name}` : r.country;
      const full = r.n >= 4;
      rh += `<div class="coop-room">
        <span class="cr-mode">${MODE_ICON[r.mode] || '🎯'}</span>
        <span class="cr-info"><b>${esc(r.host)}</b><small>${where} · ${r.state === 'game' ? t('⚔️ у грі') : t('🛋️ збирається')}</small></span>
        <span class="cr-n">${r.n}/4</span>
        <button class="btn cr-join" data-code="${esc(r.code)}" ${full ? 'disabled' : ''}>${full ? t('Повна') : t('Зайти')}</button>
      </div>`;
    }
    if (!rh) rh = t('<div class="coop-side-empty">Поки немає відкритих кімнат.<br>Створи свою — і на тебе чекатимуть! 🏠</div>');
    this.el.rooms.innerHTML = rh;
    this.el.rooms.querySelectorAll('.cr-join:not([disabled])').forEach((b) =>
      b.addEventListener('click', () => {
        this.game.audio.click();
        this._join(b.dataset.code);
      }));

    // гравці + короткі профілі
    let ph = '';
    const profiles = Array.isArray(d.profiles)
      ? d.profiles
      : (d.players || []).map((nick) => ({ nick, countries: 0, coins: 0, crystals: 0, kills: 0, star: 1, prestige: 0, title: '' }));
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const me = p.nick === myNick;
      ph += `<div class="coop-player ${me ? 'me' : ''}">
        <span class="cp-main"><span class="cp-nick">${esc(p.nick)}${me ? t(' (ти)') : ''}</span>${p.title ? `<span class="cp-title">${esc(p.title)}</span>` : ''}</span>
        <button class="cp-profile" data-i="${i}">${t('Профіль')}</button>
      </div>`;
      if (this._profileNick === p.nick) ph += this._profileHtml(p);
    }
    this.el.players.innerHTML = ph || t('<div class="coop-side-empty">Тут зʼявляться гравці онлайн</div>');
    this.el.players.querySelectorAll('.cp-profile').forEach((b) => {
      b.addEventListener('click', () => {
        const p = profiles[b.dataset.i | 0];
        this.game.audio.click();
        this._profileNick = this._profileNick === p.nick ? null : p.nick;
        this._renderSide(this.lobbyNet.data);
      });
    });
  }

  _profileHtml(p) {
    const star = Math.max(1, Math.min(40, p.star | 0));
    const prestige = Math.max(0, p.prestige | 0);
    const starText = prestige > 0 ? `${star} · ${t('Ранг Рятівника')} ${prestige}` : `${star}`;
    return `<div class="coop-profile">
      <div>🌍 ${t('Звільнені країни')}: <b>${p.countries | 0}</b></div>
      <div>🪙 ${t('Монети')}: <b>${p.coins | 0}</b></div>
      <div>💎 ${t('Кристали')}: <b>${p.crystals | 0}</b></div>
      <div>🧟 ${t('Зомбі вбито')}: <b>${p.kills | 0}</b></div>
      <div>⭐ ${t('Зоряний шлях')}: <b>${starText}</b></div>
    </div>`;
  }

  // ---------- вхід у кімнату ----------
  async _autoHost(nick) {
    try {
      saveNick(cleanNick(nick) || t('Хост'));
      const code = await this.session.create(nick);
      this._openLobby();
      this._syncPolling();
      console.log('[coop] room', code);
    } catch (e) { console.error('coophost failed', e); }
  }

  async _autoJoin(code, nick) {
    try {
      saveNick(cleanNick(nick) || t('Гість'));
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
    this.el.create.textContent = t('⏳ Створюємо…');
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
      this.el.create.textContent = t('🏠 СТВОРИТИ КІМНАТУ');
    }
  }

  async _join(codeArg) {
    const nick = this._myNick();
    if (!nick) return;
    const code = (codeArg || this.el.code.value).trim().toUpperCase();
    if (code.length < 4) { this._err(t('Введи код кімнати з 4 літер')); return; }
    this._err('');
    this.el.join.disabled = true;
    this.el.join.textContent = t('⏳ Заходимо…');
    try {
      await this.session.join(code, nick);
      this.game._hideOverlay('overlay-coop');
      this._openLobby();
      this.game.audio.mission();
    } catch (e) {
      this._err(this._connErr(e));
    } finally {
      this.el.join.disabled = false;
      this.el.join.textContent = t('🚪 ЗАЙТИ');
    }
  }

  _connErr(e) {
    const m = String(e && e.message || e);
    if (m === 'norelay') {
      // 🤝 F15: дитині — дружнє повідомлення; технічну деталь лишаємо в консолі для дорослих
      console.warn('[coop] norelay: deploy worker/ and set its address in src/net/transport.js (see README)');
      return t('🤝 Гра разом поки недоступна');
    }
    if (m === 'noroom') return t('Кімнати з таким кодом немає 🤔 Перевір код!');
    if (m === 'full') return t('Кімната вже повна (4 гравці) 😅');
    if (m === 'taken') return t('Спробуй ще раз — код зайнятий');
    if (m.startsWith('build:')) return t('У вас різні версії гри! Онови сторінку: Ctrl(⌘)+Shift+R');
    if (m === 'timeout' || m === 'closed' || m === 'badurl') return t('Не вдалося звʼязатися з сервером 📡 Перевір інтернет');
    return t('Щось пішло не так… Спробуй ще раз');
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
        <span class="lp-role">${pid === 1 ? t('👑 хост') : ''}</span>
      </div>`;
    }
    for (let i = s.roster.size; i < 4; i++) {
      html += t('<div class="lobby-player empty"><span class="lp-skin">➕</span><span class="lp-nick">вільне місце</span></div>');
    }
    this.el.roster.innerHTML = html;

    // режим
    const save = this.game.save;
    const anyLib = liberatedCount(save.liberated) > 0;
    let mh = '';
    const libCount = liberatedCount(save.liberated);
    for (const [mid, label] of [
      ['campaign', t('🎯 Кампанія')],
      ['storm', t('⛈️ Шторм')],
      ['friendly-knockout', t('🤝 Дружній нокаут')],
      ['arena', t('👑 Арена')],
    ]) {
      const sel = s.mode === mid;
      const locked = isHost && ((mid === 'storm' && !anyLib)
        || (mid === 'arena' && libCount < 2)
        || (mid === 'friendly-knockout' && libCount < FRIENDLY_KNOCKOUT_UNLOCK_COUNTRIES));
      mh += `<div class="lobby-mode ${sel ? 'sel' : ''} ${isHost && !locked ? 'pick' : ''} ${locked ? 'locked' : ''}" data-mode="${mid}">${label}${locked ? ' 🔒' : ''}</div>`;
    }
    this.el.modes.innerHTML = mh;
    if (isHost) {
      this.el.modes.querySelectorAll('.lobby-mode.pick').forEach((el) => {
        el.addEventListener('click', () => {
          this.game.audio.click();
          s.setMode(el.dataset.mode);
          // шторм лише на звільнених — перескакуємо, якщо поточна не пасує
          if (s.mode === 'storm' && !hasLiberated(save.liberated, s.countryId)) {
            const lib = CAMPAIGN_ORDER.filter((c) => hasLiberated(save.liberated, c));
            if (lib.length) s.setCountry(lib[lib.length - 1]);
          }
          this._renderLobby();
          this.lobbyNet.refresh();
        });
      });
    }

    // вибір країни (в Арени і Дружнього нокауту своя кімната — пікер ховаємо)
    const hideCountries = s.mode === 'arena' || s.mode === 'friendly-knockout';
    document.querySelectorAll('#overlay-lobby .lobby-section')[1].style.display = hideCountries ? 'none' : '';
    this.el.countries.style.display = hideCountries ? 'none' : '';
    let ch = '';
    for (const id of CAMPAIGN_ORDER) {
      const c = COUNTRIES[id];
      // у шторм-режимі грають лише ЗВІЛЬНЕНІ хостом країни
      const unlocked = s.mode === 'storm'
        ? hasLiberated(save.liberated, id)
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
    const modeTxt = s.mode === 'storm' ? t('⛈️ ШТОРМ') : s.mode === 'arena' ? t('👑 АРЕНУ БОСІВ') : s.mode === 'friendly-knockout' ? t('🤝 ДРУЖНІЙ НОКАУТ') : t('кампанію');
    this.el.hint.textContent = isHost
      ? (s.roster.size > 1 ? t('Усі в зборі? Тисни СТАРТ!') : (this.publicOn
        ? t('Кімнату видно у списку — чекай гостей або продиктуй код 👆')
        : t('Продиктуй другу код кімнати 👆')))
      : t('Хост обрав {m} · {c} — чекаємо на СТАРТ…', { m: modeTxt, c: COUNTRIES[s.countryId] ? COUNTRIES[s.countryId].flag + ' ' + COUNTRIES[s.countryId].name : '' });
  }

  _esc(str) {
    return String(str).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
  }
}
