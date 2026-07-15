// Сесія кооперативу: кімната, ростер, лобі. Живе на рівні гри (глобуса),
// на кожен рівень створює HostNet або GuestNet.
import { Transport } from './transport.js';
import { makeRoomCode, PROTO_VERSION } from './protocol.js';
import { HostNet } from './host.js';
import { GuestNet } from './client.js';
import { t } from '../i18n.js';
import { DANCES, HERO_FACES, HERO_HATS, HERO_SKINS, PETS, TRACERS } from '../characters.js';
import { nickIsBad, normNick } from '../../worker/nick.mjs';
import { chooseExpeditionNode, createExpedition, expeditionLevelConfig, sanitizeExpedition } from '../expedition.js';
import {
  canonicalFrontRewards, expandFrontSpec, FRONT_GUEST_FORBIDDEN, frontSpecFromState,
  sanitizeFrontSnapshot, sanitizeFrontSpec,
} from './frontsync.js';
import { sanitizeMapSize } from '../mapsize.js';

const NICK_KEY = 'zr-nick';
const JOIN_WELCOME_TIMEOUT_MS = 30000;

// 🎭 кооп-ролі v1: дитина в лобі обирає «ким я буду» (ідентичність + маленький САМО-баф).
// Роль знімається СНАПШОТОМ на старті рівня (див. main._buildLevel), змінити посеред бою не діє.
// Бафи скромні: guard — +25 maxHealth; medic — швидший ревайв друга (3с→1.8с);
// scout — швидкість ×1.08 + радіус підбору ×1.25. У radiation/pvp/соло ролі НЕ діють.
export const COOP_ROLE_IDS = ['guard', 'medic', 'scout'];
export const COOP_ROLES = {
  guard: { icon: '🛡️', maxHealthBonus: 25 },
  medic: { icon: '💉', reviveSecs: 1.8 },
  scout: { icon: '🏹', speedMult: 1.08, pickupMult: 1.25 },
};
// клампимо будь-яку вхідну роль (сейв/мережа) у whitelist — інакше null (без ролі)
export function sanitizeCoopRole(r) {
  return COOP_ROLE_IDS.includes(r) ? r : null;
}
export function coopRoleIcon(r) {
  return (COOP_ROLES[r] && COOP_ROLES[r].icon) || '';
}

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
  const s = normNick(raw); // спільна нормалізація з сервером — правила живуть у worker/nick.mjs
  // 🧼 безпека дітей: груба лайка в ніку (видно над головою/в пінгах) → нейтральний нік
  if (s && nickIsBad(s)) return t('Гравець');
  return s;
}

// 🛡️ Захист гостя: welcome/roster приходять від ХОСТА, а хост може бути
// модифікованим клієнтом — чистимо кожен запис так само, як хост чистить
// hello гостей (_hostHello). Інакше лайка з мережі потрапить дітям на екран.
const DEFAULT_HERO = {
  shirt: 0x2f80c3, pants: 0x474f63, skin: 0xffc9a3, shoes: 0x303642, hatColor: 0x2f80c3,
  hat: 'cap', face: 'smile',
};

function validPid(pid) {
  return Number.isInteger(pid) && pid >= 1 && pid <= 4 ? pid : 0;
}

function own(source, key) {
  return Object.hasOwn(source, key) ? source[key] : undefined;
}

function rosterId(registry, value, fallback) {
  return typeof value === 'string' && Object.hasOwn(registry, value) ? value : fallback;
}

function heroColor(value, fallback) {
  return Number.isInteger(value) ? value & 0xffffff : fallback;
}

function sanitizeHero(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    shirt: heroColor(own(src, 'shirt'), DEFAULT_HERO.shirt),
    pants: heroColor(own(src, 'pants'), DEFAULT_HERO.pants),
    skin: heroColor(own(src, 'skin'), DEFAULT_HERO.skin),
    shoes: heroColor(own(src, 'shoes'), DEFAULT_HERO.shoes),
    hatColor: heroColor(own(src, 'hatColor'), DEFAULT_HERO.hatColor),
    hat: rosterId(HERO_HATS, own(src, 'hat'), DEFAULT_HERO.hat),
    face: rosterId(HERO_FACES, own(src, 'face'), DEFAULT_HERO.face),
  };
}

export function sanitizeRosterEntry(raw, forcedPid = undefined) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const pid = validPid(forcedPid === undefined ? own(src, 'pid') : forcedPid);
  if (!pid) return null;
  const skin = rosterId(HERO_SKINS, own(src, 'skin'), 'classic');
  return {
    pid,
    nick: cleanNick(own(src, 'nick')) || t('Гравець'),
    role: sanitizeCoopRole(own(src, 'role')),
    skin,
    hero: skin === 'custom' ? sanitizeHero(own(src, 'hero')) : null,
    tracer: rosterId(TRACERS, own(src, 'tracer'), 'classic'),
    dance: rosterId(DANCES, own(src, 'dance'), 'shuffle'),
    pet: rosterId(PETS, own(src, 'pet'), null),
  };
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
    this.mode = 'campaign';    // campaign | storm | arena | friendly-knockout
    this.onRoster = null;      // () => {} — оновити лобі
    this.onCfg = null;         // (countryId)
    this.onEnd = null;         // (reason) — кімната померла
    this.onStarted = null;     // () => {} — рівень стартував (закрити лобі)
    this.expeditionVotes = new Map();
    this.frontRun = null;      // canonical host snapshot for the current Front room

    this.transport.onMessage = (from, d) => this._onMessage(from, d);
    this.transport.onPeer = (id, on) => this._onPeer(id, on);
    this.transport.onClose = (reason) => this._onClose(reason);
  }

  myInfo() {
    const save = this.game.save;
    return sanitizeRosterEntry({
      pid: this.myPid,
      nick: this.nick,
      // 🎭 кооп-роль (див. COOP_ROLES): їде в hello/roster, щоб друзі бачили «💉 медик»
      role: sanitizeCoopRole(save.coopRole),
      skin: save.activeSkin || 'classic',
      // 🎨 кастом-герой: 3 числа {shirt,pants,skin} — щоб друзі бачили твій вигляд.
      // Лише для активного кастом-скіна; інакше null (дефолтна гілка makeHero).
      hero: (save.activeSkin === 'custom' && save.hero) ? save.hero : null,
      tracer: save.activeTracer || 'classic',
      dance: save.activeDance || 'shuffle',
      pet: save.activePet || null, // 🐾 id активного улюбленця — друзі бачать його поряд
    });
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
    this.frontRun = null;
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

  // 🎭 моя кооп-роль (лобі): зберігаємо у сейв, оновлюємо ростер і синхронізуємо кімнату.
  // Хост міняє локально + ребродкаст; гість шле намір хосту (той клампить і ребродкастить).
  setMyRole(role) {
    role = sanitizeCoopRole(role);
    this.game.save.coopRole = role;
    this.game.saveGame();
    const mine = this.roster.get(this.myPid);
    if (mine) mine.role = role;
    if (this.role === 'host') {
      this._broadcastRoster();
    } else {
      this.transport.send(1, { t: 'role', r: role }, true);
    }
    if (this.onRoster) this.onRoster();
  }

  // хост отримав намір гостя змінити роль: клампимо, оновлюємо ростер, ребродкаст
  _hostSetGuestRole(from, r) {
    const rr = this.roster.get(from);
    if (!rr) return;
    rr.role = sanitizeCoopRole(r);
    this._broadcastRoster();
    if (this.onRoster) this.onRoster();
  }

  // хост тисне СТАРТ
  startLevel() {
    if (this.role !== 'host') return;
    const game = this.game;
    if (this.mode === 'expedition') {
      let run = sanitizeExpedition(game.save.expedition);
      if (!run || !run.coop || ['won', 'failed'].includes(run.status)) {
        run = createExpedition({ countries: game._expeditionCountries(), coop: true });
        game.save.expedition = run;
        game.saveGame();
      }
      this.syncExpedition(run);
      if (run.status === 'choice') return game.openExpedition({ coop: true });
      return this.startExpeditionNode(run);
    }
    const countryId = this.countryId;
    const runIndex = (game.save.missionRuns && game.save.missionRuns[countryId]) || 0;
    // 🗓️ weekly-кооп: реальний режим тижня обирає ХОСТ і кладе ключ тижня у spec —
    // гість нічого не рахує сам (границя тижня опівночі не розсинхронить команду)
    let mode = this.mode;
    const weekly = mode === 'weekly-coop' ? { w: game._weekIndex() } : null;
    if (weekly) mode = game.weeklyCoopModeId();
    const storm = mode === 'storm';
    const arena = mode === 'arena';
    const knockout = mode === 'friendly-knockout' ? 'friendly' : null;
    const defense = mode === 'friendly-defense' ? 'friendly'
      : mode === 'friendly-zone-defense' ? 'zone-friendly' : null;
    const radiation = mode === 'radiation';
    const turretwar = mode === 'turretwar';
    // 🌋 кооп-worldboss: ХОСТ обирає боса тижня і кладе id у spec (wb). Гість стартує
    // рівень саме з opts.wb, а не з локального weeklyBossId — інакше розсинхрон опівночі.
    const wb = mode === 'worldboss' ? game.weeklyBossId() : null;
    const realCountry = (arena || knockout || defense || radiation || turretwar || wb) ? 'UKR' : countryId;
    // 🎲 мутатор тижня в коопі: ХОСТ — джерело id (їде у spec обом сторонам;
    // ті самі гейти, що соло: playground/?test-без-weekmod → null). Гість НЕ рахує
    // локально — інакше розсинхрон опівночі/часових поясів.
    const mut = game._hostWeeklyMutatorId();
    // ⭐ v298 «Зірки разом»: КОМАНДНУ вторинну ціль ролить ХОСТ від сіда кімнати ТУТ (перед
    // розсилкою spec), щоб `so` доїхав обом сторонам однаково — лише у чистій кооп-кампанії
    // (не шторм/арена/нокаут/оборона/радіація/турель/світовий бос). Той самий сід-патерн, що соло.
    const isPlainCampaign = !storm && !arena && !knockout && !defense && !radiation && !turretwar && !wb;
    const so = isPlainCampaign ? game._rollCoopSecondary(realCountry, game.seed + runIndex * 3) : null;
    const spec = { countryId: realCountry, seed: game.seed, runIndex, storm, arena, knockout, defense, radiation, turretwar, wb, weekly, mut, so, ms: sanitizeMapSize(game.save.mapSize) };
    this.transport.broadcast({ t: 'start', ...spec }, true);
    this.state = 'level';
    if (this.onStarted) this.onStarted();
    game.startLevel(realCountry, { coop: { session: this, role: 'host', spec }, storm, arena, knockout, defense, radiation, turretwar, worldBoss: wb, weekly, mut });
  }

  startExpeditionNode(value) {
    if (this.role !== 'host') return;
    const run = sanitizeExpedition(value);
    const cfg = expeditionLevelConfig(run);
    if (!cfg) return;
    const opts = cfg.opts;
    const spec = {
      countryId: cfg.countryId, seed: this.game.seed, runIndex: run.step,
      defense: opts.defense || null, radiation: !!opts.radiation, turretwar: !!opts.turretwar,
      wb: opts.worldBoss || null, portal: !!opts.portal, ex: run,
      ms: sanitizeMapSize(this.game.save.mapSize),
    };
    this.transport.broadcast({ t: 'start', ...spec }, true);
    this.state = 'level';
    if (this.onStarted) this.onStarted();
    this.game.startLevel(cfg.countryId, {
      coop: { session: this, role: 'host', spec }, defense: opts.defense || null,
      radiation: !!opts.radiation, turretwar: !!opts.turretwar, worldBoss: opts.worldBoss || null,
      portal: !!opts.portal, expedition: run,
    });
  }

  // World Front start is host-only. `opts` uses the existing startLevel options;
  // the only new protocol field is compact `fr`.
  startFrontStage(countryId, opts = {}, operation = null) {
    if (this.role !== 'host') return false;
    const run = this.frontSnapshot();
    const fr = frontSpecFromState(run, operation);
    if (!run || !fr) return false;
    const spec = {
      countryId, seed: this.game.seed, runIndex: fr.g,
      defense: opts.defense || null,
      radiation: !!opts.radiation,
      turretwar: !!opts.turretwar,
      wb: opts.worldBoss || null,
      portal: !!opts.portal,
      fr,
      ms: sanitizeMapSize(this.game.save.mapSize),
    };
    this.syncFront(run);
    this.transport.broadcast({ t: 'start', ...spec }, true);
    this.state = 'level';
    this.mode = 'front';
    this.countryId = countryId;
    if (this.onStarted) this.onStarted();
    this.game.startLevel(countryId, {
      coop: { session: this, role: 'host', spec },
      defense: spec.defense, radiation: spec.radiation, turretwar: spec.turretwar,
      worldBoss: spec.wb, portal: spec.portal,
      operation: expandFrontSpec(fr),
    });
    return true;
  }

  frontSnapshot() {
    return sanitizeFrontSnapshot(this.frontRun || (this.game.save && this.game.save.front));
  }

  // Called after the host has applied applyFrontEvent(). Reward amounts never
  // travel: guests replay the canonical transition from previous → next.
  syncFront(value, effects = []) {
    if (this.role !== 'host') return null;
    const run = sanitizeFrontSnapshot(value);
    if (!run) return null;
    this.frontRun = run;
    const msg = { t: 'frun', run };
    this.transport.broadcast(msg, true);
    return run;
  }

  applyFrontSnapshot(value) {
    const run = sanitizeFrontSnapshot(value);
    if (!run) return null;
    const rewards = canonicalFrontRewards(this.frontRun, run);
    this.frontRun = run;
    // Host state is session-only. Never replace the guest's personal board,
    // projects or restored countries with another player's snapshot.
    if (rewards.length && typeof this.game.applyFrontNetworkRewards === 'function') {
      this.game.applyFrontNetworkRewards(rewards);
    }
    return run;
  }

  syncExpedition(value) {
    const run = sanitizeExpedition(value);
    if (!run || this.role !== 'host') return;
    this.game.save.expedition = run;
    this.transport.broadcast({ t: 'xprun', run }, true);
  }

  voteExpedition(nodeId) {
    const run = sanitizeExpedition(this.game.save.expedition);
    if (!run || run.status !== 'choice' || !run.choices.some((n) => n.id === nodeId)) return;
    if (this.role === 'host') {
      this.expeditionVotes.set(1, nodeId);
      this._broadcastExpeditionVotes();
    } else if (this.role === 'guest') {
      this.transport.send(1, { t: 'xpv', node: nodeId }, true);
    }
  }

  _broadcastExpeditionVotes() {
    this.transport.broadcast({ t: 'xpvotes', votes: [...this.expeditionVotes] }, true);
    if (this.game.state === 'globe') this.game.renderExpedition();
  }

  commitExpeditionVote() {
    if (this.role !== 'host') return;
    const run = sanitizeExpedition(this.game.save.expedition);
    if (!run || run.status !== 'choice') return;
    const counts = new Map(run.choices.map((n) => [n.id, 0]));
    for (const node of this.expeditionVotes.values()) if (counts.has(node)) counts.set(node, counts.get(node) + 1);
    const hostVote = this.expeditionVotes.get(1);
    const chosen = [...counts].sort((a, b) => b[1] - a[1] || (a[0] === hostVote ? -1 : b[0] === hostVote ? 1 : 0))[0][0];
    const next = chooseExpeditionNode(run, chosen);
    this.expeditionVotes.clear();
    this.game.save.expedition = next;
    this.game.saveGame();
    this.syncExpedition(next);
    this.game._hideOverlay('overlay-expedition');
    this.startExpeditionNode(next);
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
    // Result, reward and snapshot messages are host-only. Consume forged guest
    // variants before the active level net can see them.
    if (this.role === 'host' && from !== 1 && FRONT_GUEST_FORBIDDEN.has(d.t)) return;
    // повідомлення рівня — у net
    if (this.net && this.net.onMessage(from, d)) return;

    if (this.role === 'host') {
      if (d.t === 'hello') this._hostHello(from, d);
      else if (d.t === 'bye') this._dropGuest(from, 'left');
      else if (d.t === 'role') this._hostSetGuestRole(from, d.r);
      else if (d.t === 'xpv') {
        const run = sanitizeExpedition(this.game.save.expedition);
        if (this.state === 'lobby' && this.roster.has(from) && run && run.status === 'choice' && run.choices.some((n) => n.id === d.node)) {
          this.expeditionVotes.set(from, d.node);
          this._broadcastExpeditionVotes();
        }
      }
    } else {
      if (d.t === 'welcome') {
        const assignedPid = validPid(d.pid);
        if (!assignedPid) return;
        this.myPid = assignedPid;
        this.roster.clear();
        for (const r of d.roster || []) { const c = sanitizeRosterEntry(r); if (c) this.roster.set(c.pid, c); }
        this.countryId = d.countryId || 'UKR';
        if (d.mode) this.mode = d.mode;
        if (d.ex) this.game.save.expedition = sanitizeExpedition(d.ex);
        if (d.frun) this.applyFrontSnapshot(d.frun);
        if (this._joinResolve) { this._joinResolve(); this._joinResolve = null; this._joinReject = null; }
        if (this.onRoster) this.onRoster();
      } else if (d.t === 'reject') {
        if (this._joinReject) { this._joinReject(new Error(d.why === 'build' ? `build:${d.hostBuild}` : d.why)); this._joinReject = null; this._joinResolve = null; }
        this.transport.close();
      } else if (d.t === 'roster') {
        this.roster.clear();
        for (const r of d.list || []) { const c = sanitizeRosterEntry(r); if (c) this.roster.set(c.pid, c); }
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
        const fr = d.fr == null ? null : sanitizeFrontSpec(d.fr);
        if (d.fr != null && !fr) return; // malformed Front start is fail-closed
        this.state = 'level';
        if (this.onStarted) this.onStarted();
        if (d.ex) { this.game.save.expedition = sanitizeExpedition(d.ex); this.game.saveGame(); }
        this.game.startLevel(d.countryId, { coop: { session: this, role: 'guest', spec: { ...d, fr } }, storm: !!d.storm, arena: !!d.arena, knockout: d.knockout || null, defense: d.defense || null, radiation: !!d.radiation, turretwar: !!d.turretwar, worldBoss: d.wb || null, portal: !!d.portal, expedition: d.ex || null, operation: expandFrontSpec(fr), weekly: d.weekly || null, mut: d.mut || null });
      } else if (d.t === 'lvlend') {
        if (this.game.state === 'level') this.game.endLevel();
      } else if (d.t === 'xprun') {
        if (from !== 1) return;
        const run = sanitizeExpedition(d.run);
        if (run) {
          this.game.save.expedition = run;
          this.game.saveGame();
          if (this.game.state === 'globe') this.game.renderExpedition();
        }
      } else if (d.t === 'frun') {
        if (from !== 1) return;
        this.applyFrontSnapshot(d.run);
      } else if (d.t === 'xpvotes') {
        if (from !== 1) return;
        const run = sanitizeExpedition(this.game.save.expedition);
        const choices = new Set(run && run.status === 'choice' ? run.choices.map((n) => n.id) : []);
        this.expeditionVotes.clear();
        for (const pair of Array.isArray(d.votes) ? d.votes : []) {
          if (!Array.isArray(pair) || !validPid(pair[0]) || !choices.has(pair[1])) continue;
          this.expeditionVotes.set(pair[0], pair[1]);
        }
        if (this.game.state === 'globe') this.game.renderExpedition();
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
    // дедуп У МЕЖАХ стелі 12: гість повторно жене ростер через normNick, і суфікс
    // « (2)» поза бюджетом обрізався б у кашу («Володимир123 (2)» → «Володимир123»)
    const taken = new Set([...this.roster].filter(([pid]) => pid !== from).map(([, r]) => r.nick));
    if (taken.has(nick)) {
      const base = nick;
      for (let n = 2; taken.has(nick); n++) {
        const suf = ` (${n})`;
        nick = base.slice(0, 12 - suf.length).trimEnd() + suf;
      }
    }
    const entry = sanitizeRosterEntry(d, from);
    if (!entry) { this.transport.send(from, { t: 'reject', why: 'invalid' }, true); return; }
    entry.nick = nick;
    this.roster.set(from, entry);
    this.transport.send(from, {
      t: 'welcome', pid: from, countryId: this.countryId, mode: this.mode,
      roster: this._rosterList(),
      inLevel: this.state === 'level',
      ex: this.mode === 'expedition' ? sanitizeExpedition(this.game.save.expedition) : null,
      frun: this.mode === 'front' ? this.frontSnapshot() : null,
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
      const clean = sanitizeRosterEntry(r, pid);
      if (clean) out.push(clean);
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
    // 🔌 тихий реконект ХОСТА: моргання мережі не повинно вбивати кімнату (relay тримає
    // грейс ~30с). Хост лишається АВТОРИТЕТОМ (симуляція в памʼяті вкладки) — повертає
    // слот 1 (resume=1) і ре-синкає гостей. Без hello (хост не представляється сам собі).
    if (this.role === 'host' && this.myPid === 1 && (this.state === 'level' || this.state === 'lobby')) {
      if (this.net) this.net.connectionLost();
      this._tryReconnectHost();
      return;
    }
    // тихий реконект гостя з тим самим pid: і в РІВНІ (зберегти бій), і в ЛОБІ
    // (моргання Wi-Fi у лобі не повинно вбивати кімнату). У лобі this.net ще немає.
    if (this.role === 'guest' && this.myPid >= 2 && (this.state === 'level' || this.state === 'lobby')) {
      if (this.net) this.net.connectionLost();
      this._tryReconnect();
      return;
    }
    this._roomOver(reason);
  }

  // 🔌 тихий реконект ХОСТА: повертаємо авторитетний слот 1 (resume=1 + resumeKey) у межах грейсу.
  async _tryReconnectHost() {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1200 + i * 800));
      try {
        await this.transport.connect(this.room, { resume: 1 });
        // грейс минув → relay видав нам НОВИЙ pid як гостю: авторитету вже нема, кімната мертва
        if (this.transport.you !== 1) { this._roomOver('lost'); return; }
        this.myPid = 1;
        if (this.net) this.net.connectionBack(); // відновити розсилку + повна пересинхронізація гостей
        return;
      } catch (e) { /* ще спроба (taken/closed/timeout) */ }
    }
    this._roomOver('lost');
  }

  async _tryReconnect() {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1200 + i * 800));
      try {
        const expectedPid = this.myPid;
        await this.transport.connect(this.room, { resume: expectedPid });
        // грейс минув або relay не прийняв resumeKey → нам видали інший pid.
        // Як і хост, fail-closed: інакше гість продовжить бій під чужою ідентичністю.
        if (this.transport.you !== expectedPid) { this._roomOver('lost'); return; }
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
