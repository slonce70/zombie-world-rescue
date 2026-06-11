// Головний модуль: state machine (глобус ↔ рівень), цикл гри, збереження
import * as THREE from 'three';
import { Input } from './input.js';
import { AudioMan } from './audio.js';
import { World, LAYOUT } from './world.js';
import { Player } from './player.js';
import { Zombies } from './zombies.js';
import { Missions } from './missions.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { Shop } from './shop.js';
import { Globe } from './globe.js';
import { Bus, RNG } from './utils.js';

const SAVE_KEY = 'zr-save-v1';

class Game {
  constructor() {
    this.params = new URLSearchParams(location.search);
    this.testMode = this.params.has('test');
    this.seed = parseInt(this.params.get('seed') || '1377', 10);

    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 1.5 });
    this.renderer.setSize(innerWidth, innerHeight);
    this.pixelRatio = Math.min(devicePixelRatio, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // оновлюємо тіні вручну через кадр
    this._shadowFrame = 0;
    this._lowFpsSec = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.input = new Input(canvas);
    this.audio = new AudioMan();
    if (this.params.has('mute') || this.testMode) this.audio.setMuted(true);
    this.save = this._loadSave();
    if (this.params.has('fresh')) this.save = { coins: 50, upgrades: {}, liberated: {} };

    this.hud = new HUD(this);
    this.shop = new Shop(this);
    this.globe = new Globe(this);

    this.state = 'loading';
    this.level = null;
    this.paused = false;
    this.victoryShown = false;
    this.deathT = -1;
    this.fps = 0;
    this._fpsAcc = 0;
    this._fpsN = 0;
    this._musT = 0;

    this.input.onUserGesture = () => {
      this.audio.ensure();
      if (this.audio.mode === null) {
        this.audio.setMode(this.state === 'globe' ? 'globe' : 'calm');
      }
    };
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'level' && !this.shop.isOpen
        && this.deathT < 0 && !this.victoryShown && !this.testMode
        && !document.getElementById('overlay-start').classList.contains('show')) {
        this.showPause();
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyB' && this.state === 'level' && this.deathT < 0 && !this.victoryShown && !this.paused) {
        this.shop.toggle();
      }
      if (e.code === 'KeyM') {
        this.audio.setMuted(!this.audio.muted);
        this.hud.toast(this.audio.muted ? '🔇 Звук вимкнено' : '🔊 Звук увімкнено');
      }
      if (e.code === 'Escape' && this.shop.isOpen) this.shop.close();
    });

    // кнопки оверлеїв
    document.getElementById('overlay-start').addEventListener('click', () => {
      this._hideOverlay('overlay-start');
      this.audio.ensure();
      this.audio.setMode('calm');
      this.input.request();
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      this.paused = false;
      this._hideOverlay('overlay-pause');
      this.audio.click();
      this.input.request();
    });
    document.getElementById('btn-pause-globe').addEventListener('click', () => {
      this.paused = false;
      this._hideOverlay('overlay-pause');
      this.endLevel();
    });
    document.getElementById('btn-victory-globe').addEventListener('click', () => {
      this._hideOverlay('overlay-victory');
      this.endLevel();
    });

    window.addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.globe.onResize();
      if (this.level) {
        this.level.player.camera.aspect = innerWidth / innerHeight;
        this.level.player.camera.updateProjectionMatrix();
      }
    });

    this.clock = new THREE.Clock();
    window.__game = this;
    this._boot();
  }

  _loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        return Object.assign({ coins: 50, upgrades: {}, liberated: {} }, s);
      }
    } catch (e) { /* зіпсований сейв — почнемо заново */ }
    return { coins: 50, upgrades: {}, liberated: {} };
  }

  saveGame() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ }
  }

  async _boot() {
    try {
      await this.globe.load();
    } catch (e) {
      console.error('Не вдалося завантажити карту країн', e);
    }
    this._hideOverlay('overlay-loading');
    this.state = 'globe';
    this._showGlobeUI(true);
    this.renderer.setAnimationLoop(() => this._frame());
    if (this.params.get('country') === 'UKR') this.startLevel('UKR');
  }

  _showGlobeUI(show) {
    document.getElementById('globe-ui').style.display = show ? 'flex' : 'none';
    document.body.classList.toggle('in-level', !show);
    if (show) {
      document.getElementById('liberated-count').textContent =
        Object.keys(this.save.liberated).length;
    }
  }

  _showOverlay(id) { document.getElementById(id).classList.add('show'); }
  _hideOverlay(id) { document.getElementById(id).classList.remove('show'); }

  // ---------- рівень ----------
  startLevel(countryId) {
    this._showGlobeUI(false);
    const level = {
      game: this,
      countryId,
      scene: new THREE.Scene(),
      bus: new Bus(),
      rng: new RNG(this.seed + 1),
      audio: this.audio,
      stats: { kills: 0, shotsFired: 0, shotsHit: 0, coinsEarned: 0, deaths: 0, time: 0 },
    };
    level.world = new World(level.scene, this.seed);
    level.effects = new Effects(level.scene, level.world, this.audio);
    level.addCoins = (n) => {
      this.save.coins += n;
      level.stats.coinsEarned += n;
      this.saveGame();
    };
    level.player = new Player(level);
    // застосовуємо куплені прокачування
    const u = this.save.upgrades;
    level.player.maxHealth = 100 + (u.maxhp || 0) * 25;
    level.player.health = level.player.maxHealth;
    level.player.speedMult = 1 + (u.speed || 0) * 0.1;
    level.player.damageMult = 1 + (u.damage || 0) * 0.15;

    level.zombies = new Zombies(level, this.seed + 2);
    level.zombies.populate();
    level.missions = new Missions(level);

    level.effects.getPlayerPos = () => level.player.pos;
    level.effects.onPickup = (type, value) => {
      if (type === 'coin') {
        level.addCoins(value);
        this.audio.coin();
      } else if (type === 'medkit') {
        if (level.player.heal(30)) this.hud.toast('🩹 +30 здоров’я');
        this.audio.heal();
      } else {
        level.player.addAmmo(30);
        this.audio.pickup();
        this.hud.toast('🔋 +30 набоїв для автомата');
      }
    };

    this.hud.wire(level.bus);
    level.bus.on('playerDied', () => this._onPlayerDied());
    level.bus.on('bossDied', () => this._onBossDied());
    level.bus.on('hordeEnd', () => level.addCoins(60));

    this.level = level;
    this.state = 'level';
    this.victoryShown = false;
    this.paused = false;
    this.deathT = -1;
    this.hud.showBoss(false);

    if (this.testMode) {
      this.audio.setMode('calm');
    } else {
      this._showOverlay('overlay-start');
    }
    this.hud.banner('🇺🇦 УКРАЇНА', 'Виконай 3 завдання і переможи БОСА! (Shift — біг)', 4.5);
  }

  endLevel() {
    if (this.level) {
      // звільняємо ресурси сцени
      this.level.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
      this.renderer.renderLists.dispose();
    }
    this.level = null;
    this.state = 'globe';
    this.victoryShown = false;
    this.deathT = -1;
    this.input.exitLock();
    // прибираємо всі оверлеї рівня
    for (const id of ['overlay-death', 'overlay-pause', 'overlay-victory', 'overlay-start']) {
      this._hideOverlay(id);
    }
    if (this.shop.isOpen) this.shop.close();
    this.paused = false;
    this._showGlobeUI(true);
    this.audio.setMode(this.audio.ctx ? 'globe' : null);
    this.hud.showBoss(false);
  }

  _onPlayerDied() {
    this.level.stats.deaths++;
    this.deathT = 3.5;
    this.audio.defeat();
    this._showOverlay('overlay-death');
  }

  _onBossDied() {
    this.audio.victory();
    this.audio.setMode(null);
    this.level.bossDefeated = true;
    // решта зомбі святково "здається" — дитину ніхто не вб'є під час салюту
    for (const zb of [...this.level.zombies.list]) {
      if (zb.state !== 'dead') zb.damage(99999, null, false);
    }
    const { x, z } = LAYOUT.arena;
    const eff = this.level.effects;
    const world = this.level.world;
    // салют
    let burstN = 0;
    const burstIv = setInterval(() => {
      if (!this.level || burstN++ > 10) { clearInterval(burstIv); return; }
      const bx = x + (Math.random() - 0.5) * 20;
      const bz = z + (Math.random() - 0.5) * 20;
      eff.burst(new THREE.Vector3(bx, world.groundH(bx, bz) + 6 + Math.random() * 6, bz),
        [0xffd23f, 0x4cff7a, 0x44ccff, 0xff5d73][burstN % 4], 14,
        { speed: 5, up: 2, life: 1.1, size: 1.4 });
    }, 220);
    setTimeout(() => this._showVictory(), 2400);
  }

  _showVictory() {
    if (!this.level || this.victoryShown) return;
    this.victoryShown = true;
    // якщо гравця встигли вдарити в момент перемоги — скасовуємо смерть
    this.deathT = -1;
    this._hideOverlay('overlay-death');
    this.save.liberated.UKR = true;
    this.saveGame();
    this.globe.setLiberated();
    this.input.exitLock();
    const s = this.level.stats;
    const mins = Math.floor(s.time / 60);
    const secs = Math.floor(s.time % 60);
    const acc = s.shotsFired > 0 ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0;
    document.getElementById('victory-stats').innerHTML = `
      <div class="stat"><span class="stat-icon">⏱️</span><span class="stat-name">Час</span><span class="stat-val">${mins}:${String(secs).padStart(2, '0')}</span></div>
      <div class="stat"><span class="stat-icon">🧟</span><span class="stat-name">Зомбі переможено</span><span class="stat-val">${s.kills}</span></div>
      <div class="stat"><span class="stat-icon">🎯</span><span class="stat-name">Точність</span><span class="stat-val">${acc}%</span></div>
      <div class="stat"><span class="stat-icon">🪙</span><span class="stat-name">Монет здобуто</span><span class="stat-val">${s.coinsEarned}</span></div>
      <div class="stat"><span class="stat-icon">💀</span><span class="stat-name">Смертей</span><span class="stat-val">${s.deaths}</span></div>`;
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
    this._showOverlay('overlay-victory');
  }

  // ---------- цикл ----------
  _frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this._fpsAcc += dt;
    this._fpsN++;
    if (this._fpsAcc >= 1) {
      this.fps = Math.round(this._fpsN / this._fpsAcc);
      this._fpsAcc = 0;
      this._fpsN = 0;
      const fpsEl = document.getElementById('fps');
      if (this.params.has('fps') || this.testMode) {
        fpsEl.style.display = 'block';
        fpsEl.textContent = this.fps + ' FPS';
      }
      // адаптивна роздільність: довго < 48 fps → знижуємо рендер-масштаб
      if (this.fps < 48 && this.state === 'level') {
        if (++this._lowFpsSec >= 3 && this.pixelRatio > 1.0) {
          this.pixelRatio = Math.max(1.0, this.pixelRatio - 0.25);
          this.renderer.setPixelRatio(this.pixelRatio);
          this.renderer.setSize(innerWidth, innerHeight);
          this._lowFpsSec = 0;
        }
      } else {
        this._lowFpsSec = 0;
      }
    }
    // тіні оновлюємо через кадр — для мультяшного стилю 30 Гц непомітно
    if ((this._shadowFrame = (this._shadowFrame + 1) % 2) === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    if (this.state === 'globe') {
      this.globe.update(dt);
      this.renderer.render(this.globe.scene, this.globe.camera);
    } else if (this.state === 'level' && this.level) {
      const blocked = this.paused || this.shop.isOpen || this.victoryShown;
      if (!blocked) {
        const alive = this.level.player.health > 0;
        const allowControl = (this.input.locked || this.testMode) && this.deathT < 0 && alive;
        this.level.player.update(dt, this.input, allowControl);
        this.level.zombies.update(dt);
        this.level.missions.update(dt, this.input, allowControl);
        this.level.world.update(dt, this.level.player.pos);
        this.level.effects.update(dt);
        this.level.stats.time += dt;
        this._updateMusic(dt);
        // відлік смерті
        if (this.deathT >= 0) {
          this.deathT -= dt;
          const n = Math.max(1, Math.ceil(this.deathT));
          document.getElementById('death-countdown').textContent = n;
          if (this.deathT <= 0) {
            this._hideOverlay('overlay-death');
            this.level.player.respawn();
            this.level.zombies.clearNear(LAYOUT.SPAWN.x, LAYOUT.SPAWN.z, 30);
            this.deathT = -1;
            if (!this.testMode && !this.input.locked) this._showOverlay('overlay-start');
          }
        }
      }
      this.hud.update(dt);
      this.renderer.render(this.level.scene, this.level.player.camera);
    }
    this.input.postUpdate();
  }

  _updateMusic(dt) {
    this._musT -= dt;
    if (this._musT > 0 || !this.audio.ctx) return;
    this._musT = 0.6;
    if (this.level.bossDefeated || this.victoryShown) {
      this.audio.setMode(null);
      return;
    }
    const z = this.level.zombies;
    let mode = 'calm';
    if (z.boss) mode = 'boss';
    else if (z.hordeActive) mode = 'battle';
    else {
      const p = this.level.player.pos;
      for (const zb of z.list) {
        if (zb.state !== 'dead' && zb.aggroed && Math.hypot(zb.x - p.x, zb.z - p.z) < 40) {
          mode = 'battle';
          break;
        }
      }
    }
    this.audio.setMode(mode);
  }

  showPause() {
    this.paused = true;
    this._showOverlay('overlay-pause');
  }

  // ---------- API для автотестів ----------
  get test() {
    const g = this;
    return {
      state: () => ({
        state: g.state,
        coins: g.save.coins,
        fps: g.fps,
        player: g.level ? {
          x: g.level.player.pos.x, y: g.level.player.pos.y, z: g.level.player.pos.z,
          health: g.level.player.health, weapons: g.level.player.weapons, cur: g.level.player.cur,
          firstPerson: g.level.player.firstPerson,
        } : null,
        missions: g.level ? g.level.missions.missions.map((m) => ({ id: m.id, state: m.state })) : null,
        bossStarted: g.level ? g.level.missions.bossStarted : false,
        bossHp: g.level && g.level.zombies.boss ? g.level.zombies.boss.hp : null,
        zombies: g.level ? g.level.zombies.list.filter((z) => z.state !== 'dead').length : 0,
        hordeActive: g.level ? g.level.zombies.hordeActive : false,
        stats: g.level ? g.level.stats : null,
        victoryShown: g.victoryShown,
      }),
      teleport: (x, z) => {
        const p = g.level.player;
        p.pos.set(x, g.level.world.groundH(x, z), z);
        p.vel.set(0, 0, 0);
      },
      setAim: (yaw, pitch) => {
        g.level.player.yaw = yaw;
        g.level.player.pitch = pitch;
      },
      aimAtNearestZombie: () => {
        const p = g.level.player;
        let best = null, bd = 1e9;
        for (const z of g.level.zombies.list) {
          if (z.state === 'dead') continue;
          const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
          if (d < bd) { bd = d; best = z; }
        }
        if (!best) return null;
        const dx = best.x - p.pos.x, dz = best.z - p.pos.z;
        p.yaw = Math.atan2(-dx, -dz);
        const eyeY = p.pos.y + 1.62;
        const targetY = best.y + best.rig.height * 0.55;
        p.pitch = Math.atan2(targetY - eyeY, Math.hypot(dx, dz));
        return bd;
      },
      key: (code, down) => {
        if (down) { g.input.keys.add(code); g.input.justPressed.add(code); }
        else g.input.keys.delete(code);
      },
      mouse: (down) => {
        g.input.mouseDown = down;
        if (down) g.input.justClicked = true;
      },
      god: () => { g.level.player.respawnProtect = 1e9; },
      giveCoins: (n) => g.level.addCoins(n),
      giveRifle: () => g.level.player.giveRifle(),
      killZombiesNear: (x, z, r) => {
        for (const zb of [...g.level.zombies.list]) {
          if (zb.state !== 'dead' && Math.hypot(zb.x - x, zb.z - z) < r) {
            zb.damage(99999, null, false);
          }
        }
      },
      completeMission: (id) => g.level.missions._complete(id),
      finishHorde: () => {
        const zm = g.level.zombies;
        zm.hordePending = 0;
        for (const zb of [...zm.list]) {
          if (zb.horde && zb.state !== 'dead') zb.damage(99999, null, false);
        }
        zm.hordeRemaining = 0;
      },
      damageBoss: (amt) => {
        if (g.level.zombies.boss) g.level.zombies.boss.damage(amt, null, false);
      },
    };
  }
}

new Game();
