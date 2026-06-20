// Сесія кооперативу: кімната, ростер, лобі. Живе на рівні гри (глобуса),
// на кожен рівень створює HostNet або GuestNet.
import { Transport } from './transport.js';
import { makeRoomCode, PROTO_VERSION } from './protocol.js';
import { HostNet } from './host.js';
import { GuestNet } from './client.js';
import { t } from '../i18n.js';
import { nickIsBad } from '../../worker/nick.mjs';

const NICK_KEY = 'zr-nick';
const JOIN_WELCOME_TIMEOUT_MS = 30000;

// 📣 безпечні пінги — лише 5 фіксованих фраз, без вільного тексту
export const PING_PHRASES = [
  { icon: '📍', text: t('Сюди!') },
  { icon: '🆘', text: t('Допоможи!') },
  { icon: '👍', text: t('Готовий!') },
  { icon: '🙏', text: t('Дякую!') },
  { icon: '🛡️', text: t('Захищаю!') },
];

export function loadNick() {
  try { return localStorage.getItem(NICK_KEY) || ''; } catch (e) { return ''; }
}
export function saveNick(nick) {
  try { localStorage.setItem(NICK_KEY, nick); } catch (e) { /* ignore */ }
}
export function cleanNick(raw) {
  let s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length > 12) s = s.slice(0, 12);
  // 🧼 безпека дітей: груба лайка в ніку (видно над головою/в пінгах) → нейтральний нік
  if (s && nickIsBad(s)) return t('Гравець');
  return s;
}

export class CoopSession {
  constructor(game) {
    this.game = game;
    this.transport = new Transport();
    this.role = null;          // 'host' | 'guest'
    this.room = null;
    this.myPid = 0;
    this.roster = new Map();   // pid -> {nick, skin, tracer, dance}
    this.state = 'idle';       // idle | lobby | level
    this.net = null;           // HostNet | GuestNet поточного рівня
    this.countryId = 'UKR';
    this.mode = 'campaign';    // campaign | storm
    this.onRoster = null;      // () => {} — оновити лобі
    this.onCfg = null;         // (countryId)
    this.onEnd = null;         // (reason) — кімната померла
    this.onStarted = null;     // () => {} — рівень стартував (закрити лобі)
    this._helloTimers = new Map();

    this.transport.onMessage = (from, d) => this._onMessage(from, d);
    this.transport.onPeer = (id, on) => this._onPeer(id, on);
    this.transport.onClose = (reason) => this._onClose(reason);
  }

  myInfo() {
    const save = this.game.save;
    return {
      nick: this.nick,
      skin: save.activeSkin || 'classic',
      // 🎨 кастом-герой: 3 числа {shirt,pants,skin} — щоб друзі бачили твій вигляд.
      // Лише для активного кастом-скіна; інакше null (дефолтна гілка makeHero).
      hero: (save.activeSkin === 'custom' && save.hero) ? save.hero : null,
      tracer: save.activeTracer || 'classic',
      dance: save.activeDance || 'shuffle',
      dog: (save.upgrades.dog || 0) > 0 ? 1 : 0,
    };
  }

  // ---------- створення / приєднання ----------
  async create(nick) {
    this.nick = cleanNick(nick) || t('Гравець');
    saveNick(this.nick);
    // кілька спроб на випадок зайнятого коду
    let lastErr = null;
    for (let i = 0; i < 3; i++) {
      const code = makeRoomCode(4);
      try {
        await this.transport.connect(code, { create: true });
        this.role = 'host';
        this.room = code;
        this.myPid = 1;
        this.state = 'lobby';
        this.roster.clear();
        this.roster.set(1, this.myInfo());
        return code;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('relay');
  }

  async join(code, nick) {
    this.nick = cleanNick(nick) || t('Гравець');
    saveNick(this.nick);
    await this.transport.connect(code, {});
    this.role = 'guest';
    this.room = code;
    this.myPid = this.transport.you;
    this.state = 'lobby';
    this.roster.clear();
    // представляємось хосту
    this.transport.send(1, {
      t: 'hello', ...this.myInfo(),
      build: this.game.constructor.APP_VERSION ?? window.__APP_VERSION,
      proto: PROTO_VERSION,
    }, true);
    // чекаємо welcome (хост може бути зайнятий боєм — даємо запас)
    await new Promise((resolve, reject) => {
      this._joinResolve = resolve;
      this._joinReject = reject;
      setTimeout(() => {
        if (this._joinReject) {
          this._joinReject(new Error('timeout'));
          this._joinReject = null;
          this._joinResolve = null;
          // прибираємо напівз'єднання: пізній welcome не повинен тягти у гру з помилкою на екрані
          this.transport.close();
          this._reset();
        }
      }, JOIN_WELCOME_TIMEOUT_MS);
    });
    return this.room;
  }

  leave() {
    if (this.role === 'guest') this.transport.send(1, { t: 'bye' }, true);
    else this.transport.broadcast({ t: 'end', why: 'closed' }, true);
    this.transport.close();
    this._reset();
  }

  // 📣 пінг (безпечна фраза): локальний тост + розсилка/намір. Анти-спам ≥1.2с.
  sendPing(i) {
    i = i | 0;
    if (i < 0 || i >= PING_PHRASES.length) return;
    const now = (this.game && this.game.now ? this.game.now : Date.now());
    if (this._lastPing && now - this._lastPing < 1200) return; // анти-спам
    this._lastPing = now;
    const p = PING_PHRASES[i];
    if (this.game && this.game.hud) this.game.hud.toast(t('Ти: {p}', { p: p.icon + ' ' + p.text })); // локально
    if (this.role === 'host' && this.net && this.net.hostPing) this.net.hostPing(i);
    else if (this.role === 'guest' && this.net && this.net.guestPing) this.net.guestPing(i);
  }

  _reset() {
    this.role = null;
    this.room = null;
    this.state = 'idle';
    this.roster.clear();
    if (this.net) { this.net.dispose(); this.net = null; }
  }

  // ---------- лобі (хост) ----------
  setCountry(countryId) {
    this.countryId = countryId;
    if (this.role === 'host') this.transport.broadcast({ t: 'cfg', countryId, mode: this.mode }, true);
  }

  setMode(mode) {
    this.mode = mode;
    if (this.role === 'host') this.transport.broadcast({ t: 'cfg', countryId: this.countryId, mode }, true);
  }

  // хост тисне СТАРТ
  startLevel() {
    if (this.role !== 'host') return;
    const game = this.game;
    const countryId = this.countryId;
    const runIndex = (game.save.missionRuns && game.save.missionRuns[countryId]) || 0;
    const storm = this.mode === 'storm';
    const arena = this.mode === 'arena';
    const realCountry = arena ? 'UKR' : countryId;
    const spec = { countryId: realCountry, seed: game.seed, runIndex, storm, arena };
    this.transport.broadcast({ t: 'start', ...spec }, true);
    this.state = 'level';
    if (this.onStarted) this.onStarted();
    game.startLevel(realCountry, { coop: { session: this, role: 'host', spec }, storm, arena });
  }

  // створення мережевого шару рівня (викликає main під час побудови)
  makeNet(level, spec) {
    if (this.net) this.net.dispose();
    this.net = this.role === 'host'
      ? new HostNet(this, level)
      : new GuestNet(this, level, spec);
    return this.net;
  }

  // рівень завершився (будь-чий endLevel) — назад у лобі
  levelEnded() {
    if (this.net) { this.net.dispose(); this.net = null; }
    if (this.state === 'level') this.state = 'lobby';
  }

  // ---------- повідомлення ----------
  _onMessage(from, d) {
    if (!d || !d.t) return;
    // повідомлення рівня — у net
    if (this.net && this.net.onMessage(from, d)) return;

    if (this.role === 'host') {
      if (d.t === 'hello') this._hostHello(from, d);
      else if (d.t === 'bye') this._dropGuest(from, 'left');
    } else {
      if (d.t === 'welcome') {
        this.myPid = d.pid;
        this.roster.clear();
        for (const r of d.roster) this.roster.set(r.pid, r);
        this.countryId = d.countryId || 'UKR';
        if (this._joinResolve) { this._joinResolve(); this._joinResolve = null; this._joinReject = null; }
        if (this.onRoster) this.onRoster();
      } else if (d.t === 'reject') {
        if (this._joinReject) { this._joinReject(new Error(d.why === 'build' ? `build:${d.hostBuild}` : d.why)); this._joinReject = null; this._joinResolve = null; }
        this.transport.close();
      } else if (d.t === 'roster') {
        this.roster.clear();
        for (const r of d.list) this.roster.set(r.pid, r);
        if (this.onRoster) this.onRoster();
      } else if (d.t === 'cfg') {
        this.countryId = d.countryId;
        if (d.mode) this.mode = d.mode;
        if (this.onCfg) this.onCfg(d.countryId);
      } else if (d.t === 'start') {
        // 🔌 гард реконекту: якщо ми ВЖЕ в рівні з живим мережевим шаром — це повторний
        // start після тихого переприєднання. Перебудова зруйнувала б бій (екран завантаження
        // + втрата позиції). Ігноруємо: свіжий стан долетить через lvlready → captureState.
        if (this.state === 'level' && this.game?.state === 'level' && this.net) {
          return;
        }
        this.state = 'level';
        if (this.onStarted) this.onStarted();
        this.game.startLevel(d.countryId, { coop: { session: this, role: 'guest', spec: d }, storm: !!d.storm, arena: !!d.arena });
      } else if (d.t === 'lvlend') {
        if (this.game.state === 'level') this.game.endLevel();
      } else if (d.t === 'end') {
        this._roomOver(d.why || 'closed');
      }
    }
  }

  _hostHello(from, d) {
    const appV = window.__APP_VERSION;
    if (d.proto !== PROTO_VERSION || d.build !== appV) {
      this.transport.send(from, { t: 'reject', why: 'build', hostBuild: appV }, true);
      return;
    }
    // 🔌 чи це повернення вже відомого гостя (тихий реконект), а не новий вхід?
    const isReconnect = this.roster.has(from);
    if (this.state === 'level' && !this.roster.has(from)) {
      // приєднання посеред рівня: пускаємо! (стан долетить батчем)
      if (this.roster.size >= 4) { this.transport.send(from, { t: 'reject', why: 'full' }, true); return; }
    }
    if (this.roster.size >= 4 && !this.roster.has(from)) {
      this.transport.send(from, { t: 'reject', why: 'full' }, true);
      return;
    }
    let nick = cleanNick(d.nick) || t('Гравець {n}', { n: from });
    // 🧼 безпека дітей: захист від клієнта, що оминає cleanNick (нік видно іншій дитині)
    if (nickIsBad(nick)) nick = t('Гравець');
    for (const [pid, r] of this.roster) if (pid !== from && r.nick === nick) nick += ' (2)';
    this.roster.set(from, { pid: from, nick, skin: d.skin, hero: d.hero || null, tracer: d.tracer, dance: d.dance, dog: d.dog || 0 });
    this.transport.send(from, {
      t: 'welcome', pid: from, countryId: this.countryId,
      roster: this._rosterList(),
      inLevel: this.state === 'level',
    }, true);
    this._broadcastRoster();
    if (this.onRoster) this.onRoster();
    this.game.hud.toast(t('🤝 {n} приєднався!', { n: nick }));
    this.game.audio.click();
    if (this.state === 'level' && this.net) {
      // 🔌 тихий реконект уже відомого гостя: рівень у нього вже побудований —
      // повторний 'start' зруйнував би його (екран завантаження + втрата позиції).
      // Покладаємось лише на його lvlready → captureState (свіжий стан долетить).
      if (d.resume && isReconnect) {
        this.net.addGuest(from);
      } else {
        // гість серед бою (перший вхід): шлемо start і чекаємо lvlready
        this.transport.send(from, { t: 'start', ...this.net.spec }, true);
        this.net.addGuest(from);
      }
    }
  }

  _rosterList() {
    const out = [];
    for (const [pid, r] of this.roster) {
      out.push({ pid, nick: r.nick || this.nick, skin: r.skin, hero: r.hero || null, tracer: r.tracer, dog: r.dog || 0 });
    }
    return out;
  }

  _broadcastRoster() {
    this.transport.broadcast({ t: 'roster', list: this._rosterList() }, true);
  }

  _onPeer(id, on) {
    if (this.role !== 'host') return;
    if (!on) this._dropGuest(id, 'lost');
  }

  _dropGuest(pid, why) {
    const r = this.roster.get(pid);
    if (!r) return;
    this.roster.delete(pid);
    this._broadcastRoster();
    if (this.onRoster) this.onRoster();
    if (this.net) this.net.removeGuest(pid);
    this.game.hud.toast(t('👋 {n} {how}', { n: r.nick, how: why === 'left' ? t('вийшов з гри') : t('втратив звʼязок') }));
  }

  _onClose(reason) {
    if (this.role === 'guest' && this.state === 'level' && this.net) {
      // спроба тихого реконекту з тим самим pid
      this.net.connectionLost();
      this._tryReconnect();
      return;
    }
    this._roomOver(reason);
  }

  async _tryReconnect() {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1200 + i * 800));
      try {
        await this.transport.connect(this.room, { resume: this.myPid });
        this.transport.send(1, {
          t: 'hello', ...this.myInfo(),
          build: window.__APP_VERSION, proto: PROTO_VERSION, resume: 1,
        }, true);
        if (this.net) this.net.connectionBack();
        return;
      } catch (e) { /* ще спроба */ }
    }
    this._roomOver('lost');
  }

  _roomOver(reason) {
    const g = this.game;
    this.transport.close();
    const wasLevel = this.state === 'level';
    this._reset();
    if (this.onEnd) this.onEnd(reason, wasLevel);
  }
}
