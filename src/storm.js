// ⛈️ Режим «Шторм»: коло безпеки звужується, хвилі зомбі сильнішають.
// Реалізує той самий інтерфейс, що й Missions (update/getHudList/getMarkers/...),
// тому HUD і main працюють без змін.
import * as THREE from 'three';
import { t } from './i18n.js';

export class StormMode {
  constructor(level) {
    this.level = level;
    this.cx = 0;
    this.cz = 0;
    this.r = level.world.layout.BOUND * 0.95;
    this.minR = 16;
    this.wave = 0;
    this.phase = 'rest'; // 'rest' (пауза) | 'shrink' (коло їде)
    this.phaseT = 6;
    this.damageT = 0;
    this.targetR = this.r;
    this.shrinkFrom = this.r;
    this.waveAlive = 0;
    this.over = false;
    this.time = 0;

    // сумісність із Missions API
    this.missions = [];
    this.civilians = [];
    this.prompt = null;
    this.bossStarted = false;
    this.bossUnlocked = false;

    // фіолетова стіна шторму
    const geo = new THREE.CylinderGeometry(1, 1, 60, 48, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      // рахуємо від ЛОКАЛЬНИХ координат циліндра (y: -30 низ ... +30 верх):
      // вони не залежать від модельної матриці і однакові на будь-якому GPU
      vertexShader: `
        varying vec3 vLocal;
        void main() {
          vLocal = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vLocal;
        uniform float uTime;
        void main() {
          float ang = atan(vLocal.z, vLocal.x);
          float stripes = sin(ang * 40.0 + uTime * 1.6) * 0.5 + 0.5;
          float fade = 1.0 - smoothstep(-26.0, 14.0, vLocal.y);
          float groundGlow = 1.0 - smoothstep(-30.0, -21.0, vLocal.y);
          float a = (0.42 + stripes * 0.22) * fade + groundGlow * 0.3;
          gl_FragColor = vec4(0.66, 0.38, 0.98, a);
        }`,
    });
    this.wall = new THREE.Mesh(geo, mat);
    this.wall.position.set(this.cx, 26, this.cz);
    this.wall.scale.set(this.r, 1, this.r);
    this.wall.frustumCulled = false;
    level.scene.add(this.wall);

    this.mirror = !!level.mirror;
    if (!this.mirror) this._spawnWave();
  }

  // гість: стан кола/хвилі зі снапшота хоста
  applyNet(st) {
    this.r = st[0];
    this.phase = st[1] ? 'shrink' : 'rest';
    this.phaseT = st[2];
    this.wave = st[3];
    this.waveAlive = st[4];
    this.wall.scale.set(this.r, 1, this.r);
  }

  // --- Missions API ---
  get(id) { void id; return null; }

  getHudList() {
    const out = [
      { icon: '⛈️', title: t('ШТОРМ — хвиля {n}', { n: this.wave }), done: false },
      { icon: '🧟', title: t('Зомбі лишилось: {n}', { n: this.waveAlive }), done: false },
    ];
    if (this.phase === 'shrink') out.push({ icon: '🟣', title: t('Коло звужується — тікай усередину!'), done: false });
    else out.push({ icon: '⏳', title: t('Коло поїде за {n}с', { n: Math.ceil(this.phaseT) }), done: false });
    return out;
  }

  getMarkers() {
    return [];
  }

  isOutside() {
    const p = this.level.player.pos;
    return Math.hypot(p.x - this.cx, p.z - this.cz) > this.r;
  }

  update(dt) {
    const level = this.level;
    if (this.over) return;
    this.time += dt;
    this.prompt = null;
    this.wall.material.uniforms.uTime.value = this.time;

    if (this.mirror) {
      // коло і хвилі веде хост (applyNet) — у гостя лише власна шкода поза колом
      this._outsideDamage(dt);
      return;
    }

    // фази кола
    this.phaseT -= dt;
    if (this.phase === 'rest' && this.phaseT <= 0) {
      this.phase = 'shrink';
      this.phaseT = 22;
      this.shrinkFrom = this.r;
      this.targetR = Math.max(this.minR, this.r * 0.68);
      level.audio.stormSiren();
      level.bus.emit('toast', t('🟣 УВАГА! Коло звужується!'));
      level.netEv('toast', t('🟣 УВАГА! Коло звужується!'));
    } else if (this.phase === 'shrink') {
      const k = 1 - Math.max(0, this.phaseT / 22);
      this.r = this.shrinkFrom + (this.targetR - this.shrinkFrom) * k;
      if (this.phaseT <= 0) {
        this.phase = 'rest';
        this.phaseT = this.r <= this.minR + 1 ? 999 : 18;
        this.r = this.targetR;
      }
    }
    this.wall.scale.set(this.r, 1, this.r);

    this._outsideDamage(dt);

    // лічимо живих зомбі хвилі
    let alive = 0;
    for (const z of level.zombies.list) {
      if (z.state !== 'dead' && z._stormWave) alive++;
    }
    this.waveAlive = alive;
    if (alive === 0 && this._spawnWaveSoon === undefined) {
      // хвилю відбито!
      const bonus = 25 + this.wave * 10;
      level.addCoins(bonus);
      level.game.progress.addXp(12 + this.wave * 3);
      level.game.hud.banner(t('🎉 ХВИЛЮ {n} ВІДБИТО!', { n: this.wave }), t('+{b} монет · хвиля {w} за 6с…', { b: bonus, w: this.wave + 1 }), 3.5);
      // гостям: банер + той самий бонус монет (подія sbb)
      level.netEv('banner', t('🎉 ХВИЛЮ {n} ВІДБИТО!', { n: this.wave }), t('+{b} монет · хвиля {w} за 6с…', { b: bonus, w: this.wave + 1 }), 3.5);
      level.netEv('sbb', bonus);
      if (this.wave % 3 === 2) {
        level.bus.emit('toast', t('🛒 Поповни запаси (B) — з кожною хвилею дорожче!'));
        level.netEv('toast', t('🛒 Поповни запаси (B) — з кожною хвилею дорожче!'));
      }
      level.audio.mission();
      this._spawnWaveSoon = 6;
    }
    if (this._spawnWaveSoon !== undefined) {
      this._spawnWaveSoon -= dt;
      if (this._spawnWaveSoon <= 0) {
        delete this._spawnWaveSoon;
        this._spawnWave();
      }
    }
  }

  // шкода поза колом (оминає броню — як справжній шторм!); і хост, і гість — по собі
  _outsideDamage(dt) {
    const level = this.level;
    const p = level.player;
    if (this.isOutside() && p.health > 0) {
      this.damageT -= dt;
      if (this.damageT <= 0) {
        this.damageT = 0.8;
        const dmg = 3 + this.wave;
        p.health -= dmg;
        p.camShake = Math.max(p.camShake, 0.5);
        level.audio.hurt();
        level.bus.emit('playerHurt');
        if (p.health <= 0) {
          p.health = 0;
          level.bus.emit('playerDied');
        }
      }
    }
  }

  _spawnWave() {
    const level = this.level;
    this.wave++;
    delete this._spawnWaveSoon;
    // 🤝 кооп: хвиля більша на +60% за кожного додаткового гравця.
    // Перша хвиля спавниться ще ДО підключення мережі — тоді рахуємо ростер кімнати.
    const sess = level.game.coop && level.game.coop.session;
    const playersN = (level.players && level.players.length)
      || (sess && sess.state === 'level' ? Math.max(1, sess.roster.size) : 1);
    const n = Math.round((5 + this.wave * 3) * (1 + 0.6 * (playersN - 1)));
    // типи: чим більше країн звільнено, тим різноманітніші зомбі
    const lib = level.game.save.liberated || {};
    const pool = ['walker', 'walker', 'runner'];
    if (this.wave >= 2) pool.push('runner', 'tank', 'gunner');
    if (lib.POL || this.wave >= 3) pool.push('snowman');
    if (lib.DEU || this.wave >= 4) pool.push('shield');
    if (lib.FRA || this.wave >= 5) pool.push('spitter', 'ironclad');
    if (lib.TUR || this.wave >= 6) pool.push('gunner', 'gunner');
    if (lib.EGY || this.wave >= 7) pool.push('mummy', 'mummy');
    const p = level.player.pos;
    const rng = level.zombies.rng;
    for (let i = 0; i < n; i++) {
      // у колі, але не впритул до гравця
      let x = this.cx, z = this.cz;
      for (let tries = 0; tries < 12; tries++) {
        const a = rng.next() * Math.PI * 2;
        const rr = rng.range(this.r * 0.35, Math.max(this.r - 4, this.r * 0.85));
        x = this.cx + Math.cos(a) * rr;
        z = this.cz + Math.sin(a) * rr;
        if (Math.hypot(x - p.x, z - p.z) > 20) break;
      }
      const type = pool[rng.int(0, pool.length - 1)];
      // кількість хвилі вже масштабується гравцями — HP кожного НЕ множимо повторно (анти-«мішок з кулями»)
      const zb = level.zombies.spawn(type, x, z, { noCoopScale: true });
      zb._stormWave = true;
      zb.aggroed = true;
      zb.state = 'chase';
    }
    // кожна 4-та хвиля — міні-бос!
    if (this.wave % 4 === 0) {
      const styles = ['king', 'frost', 'iron', 'chef'];
      const b = level.zombies.spawn('boss', this.cx, this.cz - Math.min(this.r * 0.5, 25), {
        style: styles[(this.wave / 4 - 1) % 4], noLeash: true,
      });
      b.maxHp = b.hp = Math.round((700 + this.wave * 120) * playersN);
      b._stormWave = true;
      b.aggroed = true;
      b.state = 'chase';
      level.game.hud.banner(t('👑 МІНІ-БОС ПРИЙШОВ!'), t('Він теж хоче в коло!'), 3);
      level.netEv('banner', t('👑 МІНІ-БОС ПРИЙШОВ!'), t('Він теж хоче в коло!'), 3);
      level.audio.bossRoar();
    }
    if (this.wave > 1) level.audio.horde();
    level.bus.emit('stormWave', this.wave);
  }

  // підсумки забігу (для екрана фіналу і рекордів)
  results() {
    return {
      wave: this.wave,
      time: Math.round(this.level.stats.time),
      kills: this.level.stats.kills,
    };
  }
}
