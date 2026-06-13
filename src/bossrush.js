// 👑 Арена босів: усі 6 босів кампанії поспіль на час.
// Реалізує той самий інтерфейс, що й Missions/StormMode (update/getHudList/...),
// тож HUD і main працюють без змін. У коопі — дзеркало як у Шторму.
import { COUNTRIES, CAMPAIGN_ORDER } from './countries.js';
import { t } from './i18n.js';

export class BossRush {
  constructor(level) {
    this.level = level;
    this.mirror = !!level.mirror;
    this.idx = 0;            // скільки босів уже переможено
    this.total = CAMPAIGN_ORDER.length;
    this.state = 'break';    // break (перерва) | fight
    this.breakT = 4;         // до першого боса — коротка пауза
    this.over = false;
    this.completed = false;

    // сумісність із Missions API
    this.missions = [];
    this.civilians = [];
    this.prompt = null;
    this.bossStarted = false;
    this.bossUnlocked = false;
    this.allDone = false;
  }

  // --- Missions API ---
  get(id) { void id; return null; }

  _bossCfg(i) {
    return COUNTRIES[CAMPAIGN_ORDER[i]].boss;
  }

  getHudList() {
    const sec = Math.floor(this.level.stats.time); // не t: затінило б переклад
    const out = [
      { icon: '👑', title: t('АРЕНА БОСІВ — {a}/{b}', { a: this.idx, b: this.total }), done: false },
      { icon: '⏱️', title: t('Час: {m}', { m: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` }), done: false },
    ];
    if (this.state === 'fight' && this.idx < this.total) {
      out.push({ icon: '⚔️', title: this._bossCfg(this.idx).name.replace('👑 ', ''), done: false });
    } else if (!this.over && this.idx < this.total) {
      out.push({ icon: '⏳', title: t('Наступний бос за {n}с…', { n: Math.ceil(this.breakT) }), done: false });
    }
    return out;
  }

  getMarkers() {
    const b = this.level.zombies.boss;
    return b && b.state !== 'dead' ? [{ x: b.x, z: b.z, color: '#ff44aa', icon: '👑' }] : [];
  }

  // гість: стан раунду зі снапшота
  applyNet(br) {
    this.idx = br[0];
    this.state = br[1] ? 'fight' : 'break';
    this.breakT = br[2];
  }

  update(dt) {
    const level = this.level;
    if (this.over || this.mirror) return;

    if (this.state === 'break' && this.idx < this.total) {
      this.breakT -= dt;
      if (this.breakT <= 0) this._spawnBoss();
    }
  }

  _spawnBoss() {
    const level = this.level;
    const cfg = this._bossCfg(this.idx);
    const { x, z } = level.world.layout.arena;
    const b = level.zombies.spawn('boss', x, z - 6, { style: cfg.style, noLeash: true });
    // наростання: 80% → 120% сили + кооп-масштаб
    const playersN = (level.players && level.players.length) || 1;
    const hp = Math.round(cfg.hp * (0.8 + 0.08 * this.idx) * playersN);
    b.maxHp = b.hp = hp;
    b.aggroed = true;
    b.state = 'chase';
    this.state = 'fight';
    this.bossStarted = true;
    const name = cfg.name.replace('👑 ', '');
    document.getElementById('boss-name').textContent = cfg.name;
    level.game.hud.banner(t('👑 БОС {a}/{b}', { a: this.idx + 1, b: this.total }), name, 3.5);
    level.netEv('banner', t('👑 БОС {a}/{b}', { a: this.idx + 1, b: this.total }), name, 3.5);
    level.audio.bossRoar();
  }

  // викликає main._onBossDied
  onBossDied() {
    const level = this.level;
    this.idx++;
    this.bossStarted = false;
    if (this.idx >= this.total) {
      this.completed = true;
      level.game._endArenaRun();
      return;
    }
    // нагорода і перерва з припасами біля арени
    const bonus = 80 + this.idx * 40;
    level.addCoins(bonus);
    level.netEv('sbb', bonus);
    level.game.progress.addXp(40 + this.idx * 15);
    this.state = 'break';
    this.breakT = 8;
    level.game.hud.banner(t('✅ {a}/{b} ПЕРЕМОЖЕНО!', { a: this.idx, b: this.total }), t('+{n} монет · наступний за 8с — підбери припаси!', { n: bonus }), 3.5);
    level.netEv('banner', t('✅ {a}/{b} ПЕРЕМОЖЕНО!', { a: this.idx, b: this.total }), t('+{n} монет · наступний за 8с!', { n: bonus }), 3.5);
    level.audio.mission();
    const { x, z } = level.world.layout.arena;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this.idx;
      level.effects.spawnPickup(x + Math.cos(a) * 8, z + Math.sin(a) * 8,
        i % 3 === 0 ? 'medkit' : i % 3 === 1 ? 'ammo' : 'armor', 60);
    }
  }

  results() {
    return {
      bosses: this.idx,
      timeMs: Math.round(this.level.stats.time * 1000),
      completed: this.completed,
    };
  }
}
