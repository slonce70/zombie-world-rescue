// Зомбі: AI (блукання/охорона/погоня/атака/смерть), орди, бос
import * as THREE from 'three';
import { makeZombie, makeBoss, makeShieldMesh, updateRig, setAnim, toonMat } from './characters.js';

import { clamp, damp, dampAngle, closestRaySeg, RNG } from './utils.js';
import { t } from './i18n.js';

const TYPE_STATS = {
  walker: { hp: 70, speed: 1.7, chaseSpeed: 3.4, aggro: 20, dmg: 10, attackR: 1.8, coins: 5, pitch: 1.0 },
  runner: { hp: 45, speed: 2.8, chaseSpeed: 5.6, aggro: 32, dmg: 8, attackR: 1.7, coins: 8, pitch: 1.5 },
  tank: { hp: 230, speed: 1.3, chaseSpeed: 2.6, aggro: 18, dmg: 22, attackR: 2.3, coins: 15, pitch: 0.55 },
  // 🛡 щитоносець: тіло слабке, але спершу зламай щит (250 міцності — здоланно навіть стартовим пістолетом)!
  shield: { hp: 20, speed: 1.0, chaseSpeed: 2.0, aggro: 24, dmg: 16, attackR: 2.0, coins: 40, pitch: 0.7, shieldHp: 250 },
  snowman: {
    hp: 60, speed: 1.2, chaseSpeed: 2.2, aggro: 32, dmg: 11, attackR: 2.0, coins: 10, pitch: 1.8,
    ranged: { min: 7, max: 30, hold: 13, cd: 3.0, projSpeed: 16, dmg: 9, size: 0.22 },
  },
  // 🤮 плювака: тримає дистанцію і плює отрутою
  spitter: {
    hp: 55, speed: 1.5, chaseSpeed: 3.0, aggro: 34, dmg: 9, attackR: 1.8, coins: 12, pitch: 1.3,
    ranged: { min: 8, max: 26, hold: 12, cd: 3.4, projSpeed: 18, dmg: 12, size: 0.2, color: 0x9be84e },
  },
  // 🔫 зомбі-стрілець: тримає дистанцію і стріляє з пістолета (10 шкоди за постріл)
  gunner: {
    hp: 55, speed: 1.5, chaseSpeed: 3.0, aggro: 32, dmg: 8, attackR: 1.7, coins: 14, pitch: 1.25,
    ranged: { min: 7, max: 30, hold: 13, cd: 2.6, projSpeed: 30, dmg: 10, size: 0.11, color: 0xffe08a },
  },
  // 🦾 броньовик: залізний нагрудник 600 міцності, повільний; голова вразлива!
  ironclad: { hp: 60, speed: 0.85, chaseSpeed: 1.7, aggro: 22, dmg: 5, attackR: 2.1, coins: 35, pitch: 0.5, chestHp: 600 },
  // 🧻 мумія: повільна, але жилава і боляче хапає; вночі особливо моторошна
  mummy: { hp: 160, speed: 1.0, chaseSpeed: 2.3, aggro: 26, dmg: 18, attackR: 2.0, coins: 18, pitch: 0.6 },
  boss: { hp: 1300, speed: 2.0, chaseSpeed: 3.9, aggro: 999, dmg: 26, attackR: 3.6, coins: 0, pitch: 0.4 },
};

const FROST_RANGED = { min: 9, max: 40, hold: 0, cd: 4.5, projSpeed: 20, dmg: 18, size: 0.5 };
// 🥖 Шеф Багет жбурляє багети
const BAGUETTE_RANGED = { min: 8, max: 38, hold: 0, cd: 3.6, projSpeed: 19, dmg: 16, size: 0.34, color: 0xd9a35e, stretch: true };
// 🍢 Паша Кебаб кидає розпечені шампури
const KEBAB_RANGED = { min: 8, max: 40, hold: 0, cd: 3.2, projSpeed: 23, dmg: 17, size: 0.3, color: 0xb4543a };
// 🪲 Фараон насилає золотих скарабеїв
const SCARAB_RANGED = { min: 7, max: 42, hold: 0, cd: 2.8, projSpeed: 17, dmg: 19, size: 0.34, color: 0xd4af37 };

export class Zombies {
  constructor(level, seed = 999) {
    this.level = level;
    this.scene = level.scene;
    this.world = level.world;
    this.L = level.world.layout;
    this.rng = new RNG(seed);
    // ⭐ зірки складності (M7): множник на базову difficulty країни.
    // ВАЖЛИВО: на ★1 — ідентичність (this.diff === _base), кампанія/e2e не змінюються.
    const _base = (level.country && level.country.difficulty) || { hp: 1, dmg: 1, counts: 1 };
    const _star = Math.max(1, Math.min(5, level.diffStar || 1));
    this.diffStar = _star;
    // зірка піднімає МІЦНІСТЬ (hp) та ШКОДУ (dmg) зомбі; counts (розмір орди)
    // лишається базовим — масштабування розміру орди свідомо відкладено
    // (це чіпає делікатну логіку спавну орди, яка читає country.difficulty.counts напряму).
    this.diff = _star > 1
      ? { hp: _base.hp * (1 + 0.6 * (_star - 1)), dmg: _base.dmg * (1 + 0.25 * (_star - 1)), counts: _base.counts }
      : _base;
    // 🔫 стрільці-зомбі лише у складнішому контексті: НЕ перша країна (UKR dmg=1) на ★1.
    // Будь-яка пізніша країна (dmg>1) або підняті зірки (diffStar>1) → дозволено.
    this._allowGunner = this.diff.dmg > 1 || this.diffStar > 1;
    this.extraZombie = (level.country && level.country.extraZombie) || null;
    this.list = [];
    this.byNidMap = new Map();
    this.mirror = !!level.mirror;
    this._idSeq = 0;
    this.boss = null;
    this.hordeRemaining = 0;
    this.hordePending = 0;
    this.hordeSpawnT = 0;
    this.hordeActive = false;
    this._hordeIdleT = 0;
    this._hordePrevAlive = undefined;
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
    // 🪦 тривалість трупа: на тачі коротша (1.6с) — менший вторинний CPU-пік
    // одразу після бою; на десктопі лишаємо 3.0с (видовищніше).
    const touch = !!(level.game && level.game.input && level.game.input.touchMode);
    this._corpseTtl = touch ? 1.6 : 3.0;
  }

  spawn(type, x, z, opts = {}) {
    const bossStyle = opts.style || (opts.frost ? 'frost' : 'king');
    const nid = opts.nid !== undefined ? opts.nid
      : (this.level.net && this.level.net.authority ? this.level.net.allocId() : ++this._idSeq);
    // зовнішність зомбі — з nid-сідованого RNG: однакова у всіх гравців кооперативу
    const vrng = new RNG((Math.imul(nid, 2654435761) ^ 0x9e3779) >>> 0);
    const rig = type === 'boss' ? makeBoss(bossStyle) : makeZombie(type, vrng);
    const stats = TYPE_STATS[type];
    const y = this.world.groundH(x, z);
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = this.rng.next() * 6.28;
    this.scene.add(rig.group);
    // 🤝 кооп: зомбі сильніші пропорційно команді (2 гравці → ×2 HP, 3 → ×3).
    // noCoopScale — для хвиль Шторму: їх КІЛЬКІСТЬ уже росте з гравцями (+60%/друга),
    // тож додатково множити HP кожного = потрійний стек (count×HP×шкода ≈ ×6.6 для трьох) — несправедливо важко
    const coopScale = (opts.mirror || opts.noCoopScale) ? 1 : this.coopMul();
    const hpScale = type === 'boss' ? 1 : this.diff.hp * coopScale;
    const z_ = {
      nid, rig, type, stats,
      hp: Math.round(stats.hp * hpScale), maxHp: Math.round(stats.hp * hpScale),
      x, z, y,
      state: opts.horde ? 'chase' : 'wander',
      anchor: opts.anchor || { x, z, r: 10 },
      guard: !!opts.guard,
      zone: opts.zone || null,
      horde: !!opts.horde,
      aggroed: !!opts.horde,
      wanderT: this.rng.range(0, 3),
      wx: x, wz: z,
      attackT: -1, didHit: false,
      deadT: -1,
      groanT: this.rng.range(2, 9),
      groupId: opts.groupId ?? -1,
      gone: false,
      // бос
      chargeCd: 4, charging: 0, chargeDX: 0, chargeDZ: 0, telegraph: 0,
      summonedAt: { 75: false, 50: false, 25: false },
      frost: bossStyle === 'frost',
      bossStyle: type === 'boss' ? bossStyle : null,
      noLeash: !!opts.noLeash, // міні-боси шторму гуляють вільно
      // дальній бій (сніговики, плювака, Король Мороз, Шеф Багет)
      ranged: stats.ranged
        || (type === 'boss' && bossStyle === 'frost' ? FROST_RANGED : null)
        || (type === 'boss' && bossStyle === 'chef' ? BAGUETTE_RANGED : null)
        || (type === 'boss' && bossStyle === 'sultan' ? KEBAB_RANGED : null)
        || (type === 'boss' && bossStyle === 'pharaoh' ? SCARAB_RANGED : null),
      rangedCd: this.rng.range(0.5, 2.5),
      throwProj: false,
      // 🛡 щит
      shieldHp: 0, shieldMax: 0, shieldObj: null,
    };
    if (type === 'shield') {
      z_.shieldHp = z_.shieldMax = stats.shieldHp;
      const shield = makeShieldMesh();
      // щит висить перед тулубом — закриває з фронту (-Z)
      shield.group.position.set(0, 1.05, -0.62);
      rig.body.add(shield.group);
      z_.shieldObj = shield;
    }
    if (type === 'ironclad') {
      // 🦾 нагрудник: окрема група на тулубі (клонована з шаблоном)
      z_.chestHp = z_.chestMax = stats.chestHp;
      rig.body.traverse((o) => {
        if (o.name === 'chestPlate') z_.chestObj = o;
        if (o.name === 'chestCracks1') { z_.chestCracks1 = o; o.visible = false; }
        if (o.name === 'chestCracks2') { z_.chestCracks2 = o; o.visible = false; }
      });
    } else {
      z_.chestHp = 0;
    }
    z_.damage = (amt, dir, headshot) => this._damage(z_, amt, dir, headshot);
    if (opts.golden) this._makeGolden(z_);
    if (opts.elite) this._makeElite(z_);
    if (opts.sleeping) {
      z_.sleeping = true;
      setAnim(rig, 'idle');
    }
    this.byNidMap.set(nid, z_);
    this.list.push(z_);
    if (type === 'boss') this.boss = z_;
    if (this.level.net && this.level.net.authority && !opts.mirror) this.level.net.onZombieSpawn(z_);
    return z_;
  }

  byNid(nid) { return this.byNidMap.get(nid) || null; }

  // золоте покриття: один матеріал поверх запечених кольорів
  _makeGolden(z_) {
    z_.golden = true;
    const goldM = toonMat(0xffd23f, 0xcc8800, 0.35);
    z_.rig.group.traverse((o) => {
      if (o.isMesh) o.material = goldM;
    });
  }

  // 👹 еліт: золота корона-обідок і більший зріст
  _makeElite(z_) {
    z_.elite = true;
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.05, 6, 14),
      toonMat(0xffd23f, 0xcc8800, 0.6)
    );
    crown.rotation.x = Math.PI / 2 - 0.15;
    crown.position.y = 0.38;
    z_.rig.parts.head.add(crown);
    z_.rig.group.scale.multiplyScalar(1.18);
  }

  populate() {
    const density = (this.level.country && this.level.country.map && this.level.country.map.zombieDensity) || 1;
    // блукаючі групи
    const groups = [
      [-40, 60, 3], [60, -40, 3], [-80, 12, 3], [28, 84, 3],
      [-52, -112, 3], [150, -20, 3],
    ];
    groups.forEach(([gx, gz, baseN], gi) => {
      const n = Math.max(1, Math.round(baseN * density));
      for (let i = 0; i < n; i++) {
        const a = this.rng.next() * 6.28;
        const r = this.rng.range(2, 9);
        let type = this.rng.chance(0.25) ? 'runner' : 'walker';
        if (this.extraZombie && this.rng.chance(0.25)) type = this.extraZombie;
        // 🔫 стрілець — лише у складнішому контексті (НЕ перша Україна на ★1)
        else if (this._allowGunner && this.rng.chance(0.1)) type = 'gunner';
        this.spawn(type, gx + Math.cos(a) * r, gz + Math.sin(a) * r, {
          anchor: { x: gx, z: gz, r: 14 }, groupId: gi,
        });
      }
    });
    // охорона місій
    const guardSets = [
      { site: this.L.rescue, types: ['tank', 'runner', 'walker', 'walker', 'walker', 'walker'], gid: 100 },
      { site: this.L.tower, types: ['tank', 'runner', 'runner', 'walker', 'walker', 'walker', 'walker'], gid: 101 },
      { site: this.L.warehouse, types: ['tank', 'tank', 'runner', 'runner', 'walker', 'walker', 'walker', 'walker', 'walker'], gid: 102 },
    ];
    if (this.extraZombie) {
      // у зимовій країні частина охорони — сніговики
      guardSets[0].types[3] = this.extraZombie;
      guardSets[1].types[4] = this.extraZombie;
      guardSets[1].types[5] = this.extraZombie;
      guardSets[2].types[6] = this.extraZombie;
      guardSets[2].types[7] = this.extraZombie;
    }
    if (density >= 1.2) {
      // щільніші карти — більша охорона
      guardSets[0].types.push('walker');
      guardSets[1].types.push('walker');
      guardSets[2].types.push('runner');
    }
    // 🛡 щитоносці охороняють місії (кількість залежить від країни)
    const shieldN = (this.level.country && this.level.country.shieldGuards) || 0;
    for (let i = 0; i < shieldN; i++) {
      guardSets[i % guardSets.length].types.push('shield');
    }
    // 🦾 у складних країнах склад охороняють броньовики
    if (this.diff.hp >= 1.5) {
      guardSets[2].types.push('ironclad');
      guardSets[1].types.push('ironclad');
    }
    for (const gs of guardSets) {
      gs.types.forEach((type, i) => {
        const a = (i / gs.types.length) * Math.PI * 2 + this.rng.range(-0.3, 0.3);
        const r = this.rng.range(5, gs.site.r - 2);
        const x = gs.site.x + Math.cos(a) * r;
        const z = gs.site.z + Math.sin(a) * r;
        this.spawn(type, x, z, {
          anchor: { x: gs.site.x, z: gs.site.z, r: gs.site.r },
          guard: true, groupId: gs.gid,
          zone: gs.site === this.L.warehouse ? 'warehouse' : null,
        });
      });
    }
    // 🏆 золотий зомбі-втікач
    if (this.level.country && this.level.country.map.fun && this.level.country.map.fun.goldenZombie) {
      this.spawnGolden();
    }
  }

  spawnGolden() {
    // десь на околиці, далеко від місій
    let x = 0, z = 0;
    for (let tries = 0; tries < 20; tries++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(80, 150);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      let ok = true;
      for (const key of ['rescue', 'tower', 'warehouse', 'arena']) {
        const s = this.L[key];
        if (Math.hypot(x - s.x, z - s.z) < s.r + 12) { ok = false; break; }
      }
      if (ok) break;
    }
    const z_ = this.spawn('walker', x, z, { golden: true });
    z_.hp = z_.maxHp = 80;
    z_.anchor = { x, z, r: 30 };
    return z_;
  }

  countAliveInZone(zone) {
    return this.list.filter((z) => z.zone === zone && z.state !== 'dead').length;
  }

  clearNear(x, z, r) {
    for (const zb of this.list) {
      // босів і охоронців місій не чіпаємо — лічильники зон мають лишатись чесними
      if (zb.type === 'boss' || zb.zone || zb.state === 'dead') continue;
      if (Math.hypot(zb.x - x, zb.z - z) < r) {
        zb.gone = true;
        if (zb.horde) this.hordeRemaining--;
        this.scene.remove(zb.rig.group);
        this.byNidMap.delete(zb.nid);
        this.level.netEv('zg', zb.nid);
      }
    }
    this.list = this.list.filter((zb) => !zb.gone);
  }

  startHorde(count) {
    // акумулюємо: орди можуть накладатись
    if (!this.hordeActive) this.hordeSpawnT = 0.5;
    this.hordeActive = true;
    this.hordeRemaining = Math.max(0, this.hordeRemaining) + count;
    this.hordePending += count;
    this._hordeIdleT = 0; // скидаємо таймер простою при старті нової орди
    this._hordePrevAlive = undefined;
  }

  // сплячий зомбі-сюрприз у будинку: прокидається, коли гравець поруч
  spawnSurprise(x, z) {
    const type = this.extraZombie && this.rng.chance(0.4) ? this.extraZombie : 'walker';
    const z_ = this.spawn(type, x, z, { sleeping: true });
    z_.anchor = { x, z, r: 2 };
    // стоїть на підлозі будинку, а не на терені під нею
    z_.y = Math.max(this.world.groundH(x, z), this.world.floorAt(x, z, 99));
    z_.rig.group.position.y = z_.y;
    setAnim(z_.rig, 'idle');
    return z_;
  }

  spawnBoss(hp = null) {
    const { x, z } = this.L.arena;
    const cfg = (this.level.country && this.level.country.boss) || { hp: 1300, frost: false };
    const style = cfg.style || (cfg.frost ? 'frost' : 'king');
    const b = this.spawn('boss', x, z - 6, { horde: false, style });
    // 🤝 кооп: бос міцніший пропорційно команді (×N гравців)
    // ⭐ зірки (M7): бос масштабується м'якше (×0.5/зірка), щоб не став «губкою для куль»; на ★1 — ×1.
    const _bs = this.diffStar > 1 ? (1 + 0.5 * (this.diffStar - 1)) : 1;
    const bossHp = Math.round(cfg.hp * this.coopMul() * _bs);
    b.maxHp = bossHp;
    b.hp = hp !== null ? Math.min(bossHp, Math.max(150, hp)) : bossHp;
    // 🔁 відновлення боса (після смерті гравця): не повторюємо вже пройдені хвилі призову.
    // Свіжий бос на повному HP (frac=100) лишає всі пороги невзятими — хвилі підуть штатно.
    const frac0 = (b.hp / b.maxHp) * 100;
    for (const thr of [75, 50, 25]) if (frac0 <= thr) b.summonedAt[thr] = true;
    b.aggroed = true;
    b.state = 'chase';
    return b;
  }

  despawnBoss() {
    const b = this.boss;
    if (!b) return null;
    const hpLeft = b.hp;
    b.gone = true;
    this.scene.remove(b.rig.group);
    this.byNidMap.delete(b.nid);
    this.level.netEv('zg', b.nid);
    this.list = this.list.filter((zb) => zb !== b);
    this.boss = null;
    return hpLeft;
  }

  // промінь проти всіх живих зомбі — повертає найближче влучання
  hitTest(origin, dir, maxD) {
    let best = null;
    for (const z of this.list) {
      if (z.state === 'dead') continue;
      const approxD = Math.hypot(z.x - origin.x, z.z - origin.z);
      if (approxD - 3 > maxD || (best && approxD - 3 > best.t)) continue;
      const r = z.rig.radius;
      const h = z.rig.height;
      this._p0.set(z.x, z.y + r * 0.7, z.z);
      this._p1.set(z.x, z.y + h - r * 0.5, z.z);
      const res = closestRaySeg(origin, dir, this._p0, this._p1);
      if (res.dist < r && res.t > 0.3 && res.t < maxD && (!best || res.t < best.t)) {
        const point = origin.clone().addScaledVector(dir, res.t);
        best = { zombie: z, t: res.t, point, headshot: point.y > z.y + h * 0.74 };
      }
    }
    return best;
  }

  _damage(z, amt, dir, headshot) {
    if (z.state === 'dead') return;
    // 🛡 щит: фронтальні влучання та вибухи приймає на себе щит
    if (z.shieldHp > 0) {
      const fx = -Math.sin(z.rig.group.rotation.y);
      const fz = -Math.cos(z.rig.group.rotation.y);
      // dir — напрямок пострілу (від гравця до зомбі); null (вибух) — теж у щит.
      // поріг -0.45 (раніше -0.15): вужчий фронтальний конус → дитині легше зайти збоку.
      const onShield = !dir || (dir.x * fx + dir.z * fz) < -0.45;
      if (onShield) {
        z.shieldHp -= amt;
        this._aggro(z);
        for (const o of this.list) {
          if (o.groupId === z.groupId && o.groupId >= 0 && o.state !== 'dead'
            && Math.hypot(o.x - z.x, o.z - z.z) < 13) this._aggro(o);
        }
        const level = this.level;
        // перша зустріч зі щитом — підказуємо механіку одразу
        if (!this._shieldHintShown) {
          this._shieldHintShown = true;
          level.bus.emit('toast', t('🛡 Ого, щит! Розстріляй його (дивись на тріщини) або обійди ззаду!'));
        }
        const sparkPos = new THREE.Vector3(z.x + fx * 0.75, z.y + 1.15, z.z + fz * 0.75);
        if (z.shieldHp > 0) {
          // тріщини проступають у міру пошкоджень (3 стадії)
          z.shieldObj.cracks1.visible = z.shieldHp <= z.shieldMax * 0.75;
          z.shieldObj.cracks2.visible = z.shieldHp <= z.shieldMax * 0.5;
          if (z.shieldObj.cracks3) z.shieldObj.cracks3.visible = z.shieldHp <= z.shieldMax * 0.25;
          level.effects.burst(sparkPos, 0xc9d4e2, 4, { speed: 2.6, up: 1.5, life: 0.3, size: 0.7 });
          level.audio.clang();
        } else {
          // 💥 щит зламано! (тіло лишається цілим — далі добивай уже беззахисного — навмисний 2-крок)
          z.shieldHp = 0;
          z.rig.body.remove(z.shieldObj.group);
          z.shieldObj = null;
          level.effects.burst(sparkPos, 0x7d8aa0, 14, { speed: 4.5, up: 4, life: 0.7, size: 1.3 });
          level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xc9d4e2, 2.5);
          level.audio.shieldBreak();
          level.bus.emit('shieldBroken', z);
          level.netEv('zsb', z.nid);
        }
        return;
      }
    }
    // 🦾 нагрудник броньовика: ловить усе, КРІМ влучань у голову
    if (z.chestHp > 0 && !headshot) {
      z.chestHp -= amt;
      this._aggro(z);
      for (const o of this.list) {
        if (o.groupId === z.groupId && o.groupId >= 0 && o.state !== 'dead'
          && Math.hypot(o.x - z.x, o.z - z.z) < 13) this._aggro(o);
      }
      const level = this.level;
      if (!this._ironHintShown) {
        this._ironHintShown = true;
        level.bus.emit('toast', t('🦾 Броньовик! Нагрудник не проб\'єш — цілься в ГОЛОВУ!'));
      }
      const sparkPos = new THREE.Vector3(z.x, z.y + 1.2, z.z);
      if (z.chestHp > 0) {
        if (z.chestCracks1) z.chestCracks1.visible = z.chestHp <= z.chestMax * 0.6;
        if (z.chestCracks2) z.chestCracks2.visible = z.chestHp <= z.chestMax * 0.3;
        level.effects.burst(sparkPos, 0xc9d4e2, 3, { speed: 2.4, up: 1.4, life: 0.3, size: 0.65 });
        level.audio.clang();
      } else {
        // 💥 нагрудник пробито! (тіло лишається — цілься в голову/добивай — навмисний 2-крок)
        z.chestHp = 0;
        if (z.chestObj) z.chestObj.visible = false;
        if (z.chestCracks1) z.chestCracks1.visible = false;
        if (z.chestCracks2) z.chestCracks2.visible = false;
        level.effects.burst(sparkPos, 0x7d8aa0, 12, { speed: 4, up: 3.5, life: 0.7, size: 1.2 });
        level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), 0xc9d4e2, 2.2);
        level.audio.shieldBreak();
        level.bus.emit('chestBroken', z);
        level.netEv('zcb', z.nid);
      }
      return;
    }
    z.hp -= amt;
    this._aggro(z);
    // розбудити сусідів по групі (тільки поблизу — не весь склад одразу)
    for (const o of this.list) {
      if (o.groupId === z.groupId && o.groupId >= 0 && o.state !== 'dead'
        && Math.hypot(o.x - z.x, o.z - z.z) < 13) this._aggro(o);
    }
    if (z.hp <= 0) this._kill(z, dir);
  }

  _aggro(z) {
    if (z.state === 'dead' || z.aggroed) return;
    if (z.golden) { z.state = 'flee'; return; } // золотий не нападає — тікає
    z.sleeping = false;
    z.aggroed = true;
    if (z.state === 'wander') z.state = 'chase';
    const p = this.level.player;
    const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
    if (d < 42) this.level.audio.shriek(1 - clamp(d / 42, 0, 0.85), z.stats.pitch);
  }

  _kill(z, dir) {
    z.state = 'dead';
    z.deadT = 0;
    setAnim(z.rig, 'die');
    const level = this.level;
    const distV = Math.hypot(z.x - level.player.pos.x, z.z - level.player.pos.z);
    level.audio.zdie(1 - clamp(distV / 50, 0, 0.9));
    // у коопі особиста статистика рахує лише власні перемоги
    if (!level.net || (z.lastHitBy || 1) === 1) level.stats.kills++;
    level.netEv('zd', z.nid, z.lastHitBy || 1, z.golden ? 1 : 0);
    level.bus.emit('zombieKilled', z);
    // лут
    if (z.type !== 'boss') {
      const coins = z.stats.coins;
      const n = z.type === 'tank' || z.type === 'shield' ? 3 : z.type === 'runner' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        level.effects.spawnCoin(z.x + this.rng.range(-0.6, 0.6), z.z + this.rng.range(-0.6, 0.6), Math.ceil(coins / n));
      }
      if (this.boss) {
        // під час бою з босом міньйони гарантовано дають патрони
        level.effects.spawnPickup(z.x - 1, z.z, 'ammo');
      } else if (this.rng.chance(0.07)) level.effects.spawnPickup(z.x + 1, z.z, 'medkit');
      else if (this.rng.chance(0.13)) level.effects.spawnPickup(z.x - 1, z.z, 'ammo');
      else if (this.rng.chance(0.02)) {
        // рідкісний сюрприз: тимчасове підсилення
        level.effects.spawnPickup(z.x + 1, z.z, this.rng.pick(['speed', 'rage', 'bubble', 'magnet']));
      }
    }
    if (z.horde) this.hordeRemaining--;
    if (z.golden) {
      // 🏆 джекпот!
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        level.effects.spawnCoin(z.x + Math.cos(a) * this.rng.range(0.5, 2.5), z.z + Math.sin(a) * this.rng.range(0.5, 2.5), 12);
      }
      level.audio.goldenJingle();
      level.bus.emit('toast', t('🏆 ЗОЛОТИЙ ЗОМБІ! ДЖЕКПОТ +144 монети!'));
      level.netEv('toast', t('🏆 ЗОЛОТОГО ЗОМБІ ВПІЙМАНО! Монети сиплються — розбирайте!'));
    }
    if (z.type === 'boss') {
      this.boss = null;
      // фонтан монет за боса
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        level.effects.spawnCoin(z.x + Math.cos(a) * this.rng.range(1, 4), z.z + Math.sin(a) * this.rng.range(1, 4), 25);
      }
      level.bus.emit('bossDied', z);
    }
  }

  update(dt) {
    if (this.mirror) { this._updateMirror(dt); return; }
    const level = this.level;
    const player = level.player;
    const px = player.pos.x, pz = player.pos.z;
    // у коопі зомбі полюють на НАЙБЛИЖЧОГО живого гравця (хост або гості)
    const players = level.players
      || (this._soloPlayers || (this._soloPlayers = [{
        pid: 1,
        get pos() { return player.pos; },
        get health() { return player.health; },
      }]));

    // спавн орди хвилями
    if (this.hordeActive && this.hordePending > 0) {
      this._hordeIdleT = 0; // поки є незаспавнені — таймер простою не рахуємо
      this.hordeSpawnT -= dt;
      if (this.hordeSpawnT <= 0) {
        this.hordeSpawnT = 1.3;
        const batch = Math.min(4, this.hordePending);
        const alivePl = players.filter((p) => p.health > 0);
        for (let i = 0; i < batch; i++) {
          const cp = alivePl.length ? alivePl[Math.floor(this.rng.next() * alivePl.length)].pos : player.pos;
          const a = this.rng.next() * Math.PI * 2;
          const r = this.rng.range(32, 48);
          let x = cp.x + Math.cos(a) * r;
          let z = cp.z + Math.sin(a) * r;
          const dB = Math.hypot(x, z);
          if (dB > this.L.BOUND - 5) {
            x *= (this.L.BOUND - 8) / dB;
            z *= (this.L.BOUND - 8) / dB;
          }
          const roll = this.rng.next();
          const withShield = (this.level.country && this.level.country.shieldGuards) > 0;
          const hard = this.diff.hp >= 1.5; // DEU/FRA — броньовики в ордах
          let type;
          if (this._allowGunner && this.rng.chance(0.08)) type = 'gunner';
          else if (hard && this.rng.chance(0.09)) type = 'ironclad';
          else if (this.extraZombie && withShield) {
            type = roll < 0.4 ? 'walker' : roll < 0.62 ? 'runner' : roll < 0.8 ? this.extraZombie
              : roll < 0.9 ? 'shield' : 'tank';
          } else if (this.extraZombie) {
            type = roll < 0.45 ? 'walker' : roll < 0.7 ? 'runner' : roll < 0.9 ? this.extraZombie : 'tank';
          } else if (withShield) {
            type = roll < 0.5 ? 'walker' : roll < 0.8 ? 'runner' : roll < 0.9 ? 'shield' : 'tank';
          } else {
            type = roll < 0.6 ? 'walker' : roll < 0.9 ? 'runner' : 'tank';
          }
          this.spawn(type, x, z, { horde: true });
          this.hordePending--;
        }
      }
    }
    if (this.hordeActive && this.hordePending <= 0) {
      // самокорекція лічильника + таймаут захист від застряглих зомбі
      const aliveHorde = this.list.filter((z) => z.horde && z.state !== 'dead').length;
      if (aliveHorde !== this.hordeRemaining) this.hordeRemaining = aliveHorde;
      // скидаємо таймер простою якщо гравець робить прогрес (вбивства)
      if (this._hordePrevAlive === undefined || aliveHorde < this._hordePrevAlive) {
        this._hordeIdleT = 0;
      } else {
        this._hordeIdleT += dt;
      }
      this._hordePrevAlive = aliveHorde;
      if (this._hordeIdleT > 25 && this.hordeRemaining > 0) {
        for (const z of this.list) if (z.horde && z.state !== 'dead') z.horde = false;
        this.hordeRemaining = 0;
      }
    }
    if (this.hordeActive && this.hordePending <= 0 && this.hordeRemaining <= 0) {
      this.hordeActive = false;
      level.bus.emit('hordeEnd');
    }

    let removeAny = false;
    for (const z of this.list) {
      const rig = z.rig;
      // --- мертві ---
      if (z.state === 'dead') {
        z.deadT += dt;
        // оновлюємо повний риг лише поки програється сама die-анімація (~0.85с);
        // далі поза вже статична — заморожуємо її й не тратимо CPU на риг трупа
        if (rig.anim.dieT < 1) updateRig(rig, dt);
        if (z.deadT > 1.6) rig.group.position.y -= dt * 0.7;
        if (z.deadT > this._corpseTtl) {
          z.gone = true;
          removeAny = true;
          this.scene.remove(rig.group);
          this.byNidMap.delete(z.nid);
        }
        continue;
      }

      let tgt = null;
      let distP = Infinity;
      for (const pl of players) {
        if (pl.health <= 0) continue;
        const d = Math.hypot(pl.pos.x - z.x, pl.pos.z - z.z);
        if (d < distP) { distP = d; tgt = pl; }
      }
      const playerAlive = !!tgt;
      const tp = tgt ? tgt.pos : player.pos;
      if (!playerAlive) distP = Math.hypot(tp.x - z.x, tp.z - z.z);
      const dxP = tp.x - z.x, dzP = tp.z - z.z;
      const st = z.stats;
      if (z.rangedCd > 0) z.rangedCd -= dt;

      // 🌙 вночі зомбі помічають здалеку
      const nightAggro = 1 + (level.nightK || 0) * 0.5;
      // золотий зомбі: побачив гравця — тікає
      if (z.golden && z.state !== 'dead') {
        if (playerAlive && distP < 26) z.state = 'flee';
        else if (z.state === 'flee' && distP > 42) z.state = 'wander';
      }

      // сплячий сюрприз: чекає, поки гравець підійде впритул
      if (z.sleeping) {
        if (playerAlive && distP < 4.5) {
          z.sleeping = false;
          this._aggro(z);
          z.state = 'chase';
          level.audio.shriek(1, st.pitch * 1.4);
          level.bus.emit('toast', t('😱 СЮРПРИЗ! У будинку ховався зомбі!'));
        } else {
          updateRig(rig, dt * 0.35); // спить — ледь погойдується
          continue;
        }
      }

      // LOD: далекі неагресивні зомбі майже не оновлюємо
      if (distP > 110 && !z.aggroed) {
        // охоронці, що відійшли, повертаються додому миттєво (поза екраном)
        if (z.guard && Math.hypot(z.x - z.anchor.x, z.z - z.anchor.z) > 10) {
          const a = this.rng.next() * 6.28;
          z.x = z.anchor.x + Math.cos(a) * z.anchor.r * 0.5;
          z.z = z.anchor.z + Math.sin(a) * z.anchor.r * 0.5;
          z.y = this.world.groundH(z.x, z.z);
          rig.group.position.set(z.x, z.y, z.z);
        }
        if (this.rng.chance(0.02)) rig.group.rotation.y += 0.3;
        continue;
      }

      // --- стани ---
      if (z.state === 'wander') {
        if (playerAlive && (distP < st.aggro * nightAggro || z.aggroed)) {
          z.state = 'chase';
          this._aggro(z);
          level.audio.zgroan(1 - clamp(distP / 40, 0, 0.8), st.pitch);
        } else {
          z.wanderT -= dt;
          if (z.wanderT <= 0) {
            z.wanderT = this.rng.range(2.5, 6);
            const a = this.rng.next() * 6.28;
            const r = this.rng.next() * z.anchor.r;
            z.wx = z.anchor.x + Math.cos(a) * r;
            z.wz = z.anchor.z + Math.sin(a) * r;
          }
        }
      } else if (z.state === 'chase') {
        if (!playerAlive) {
          z.state = 'wander';
          z.aggroed = z.horde;
        } else if (distP < st.attackR && z.telegraph <= 0 && z.charging <= 0) {
          // мелі тільки з прямою видимістю — крізь стіни бити не можна
          this._p0.set(z.x, z.y + z.rig.height * 0.6, z.z);
          this._p1.set(dxP, (tp.y + 1.0) - (z.y + z.rig.height * 0.6), dzP).normalize();
          const meleeBlock = this.world.shotBlockDist(this._p0, this._p1, distP);
          if (meleeBlock > distP - 0.35) {
            z.state = 'attack';
            z.attackT = 0;
            z.didHit = false;
            z.throwProj = false;
            setAnim(rig, 'attack');
          }
        } else if (z.ranged && z.rangedCd <= 0 && distP >= z.ranged.min && distP <= z.ranged.max
          && z.telegraph <= 0 && z.charging <= 0) {
          // кидок сніжки, якщо є пряма видимість
          this._p0.set(z.x, z.y + z.rig.height * 0.75, z.z);
          this._p1.set(dxP, (tp.y + 1.2) - (z.y + z.rig.height * 0.75), dzP).normalize();
          const block = this.world.shotBlockDist(this._p0, this._p1, distP);
          if (block > distP - 1.5) {
            z.state = 'attack';
            z.attackT = 0;
            z.didHit = false;
            z.throwProj = true;
            z.rangedCd = z.ranged.cd;
            setAnim(rig, 'attack');
          } else {
            z.rangedCd = 0.9;
          }
        } else if (!z.horde && z.type !== 'boss' && !z._stormWave) {
          // охоронці прив'язані до своєї точки, решта — до відстані від гравця
          const giveUp = z.guard
            ? Math.hypot(z.x - z.anchor.x, z.z - z.anchor.z) > 45
            : distP > st.aggro * 2.5 + 25;
          if (giveUp) {
            z.state = 'wander';
            z.aggroed = false;
          }
        }
      } else if (z.state === 'attack') {
        z.attackT += dt / 0.55;
        if (!z.didHit && z.attackT > 0.45) {
          z.didHit = true;
          if (z.throwProj) {
            z.throwProj = false;
            if (playerAlive) {
              const from = new THREE.Vector3(z.x, z.y + z.rig.height * 0.78, z.z);
              const target = new THREE.Vector3(tp.x, tp.y + 1.25, tp.z);
              level.effects.spawnProjectile(from, target, z.ranged.projSpeed, z.ranged.dmg * this.diff.dmg, z.ranged.size, z.ranged.color);
              level.netEv('proj',
                Math.round(from.x * 10) / 10, Math.round(from.y * 10) / 10, Math.round(from.z * 10) / 10,
                Math.round(target.x * 10) / 10, Math.round(target.y * 10) / 10, Math.round(target.z * 10) / 10,
                z.ranged.projSpeed, z.ranged.size, z.ranged.color || 0);
              level.audio.throwWhoosh(1 - clamp(distP / 40, 0, 0.8));
            }
          } else if (playerAlive && distP < st.attackR * 1.35) {
            this._hurt(tgt, st.dmg * this.diff.dmg, z.x, z.z);
            level.audio.zattack(1);
            if (z.type === 'boss') {
              level.effects.ring(new THREE.Vector3(z.x, z.y, z.z), z.frost ? 0x66ccff : 0xff6644, 5);
              level.audio.slam();
            }
          }
        }
        if (z.attackT >= 1) {
          z.state = 'chase';
          setAnim(rig, 'walk');
        }
      }

      // --- бос: чардж і призов ---
      if (z.type === 'boss' && z.state !== 'dead') {
        const frac = (z.hp / z.maxHp) * 100;
        for (const thr of [75, 50, 25]) {
          if (frac <= thr && !z.summonedAt[thr]) {
            z.summonedAt[thr] = true;
            level.audio.bossRoar();
            level.bus.emit('bossSummon');
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * 6.28;
              const st = z.bossStyle || 'king';
              const mtype = st === 'frost' ? (i % 2 ? 'snowman' : 'walker')
                : st === 'iron' ? (i % 2 ? 'shield' : 'runner')
                  : st === 'chef' ? (i % 2 ? 'spitter' : 'walker')
                    : st === 'sultan' ? (i % 2 ? 'gunner' : 'runner')
                      : st === 'pharaoh' ? (i % 2 ? 'mummy' : 'walker')
                        : (i % 3 === 0 ? 'tank' : i % 2 ? 'runner' : 'walker');
              const mz = this.spawn(mtype, z.x + Math.cos(a) * 4.5, z.z + Math.sin(a) * 4.5,
                { horde: false, noCoopScale: !!z._stormWave });
              mz.aggroed = true;
              mz.state = 'chase';
              if (z._stormWave) mz._stormWave = true;
            }
          }
        }
        z.chargeCd -= dt;
        if (z.telegraph > 0) {
          z.telegraph -= dt;
          if (z.telegraph <= 0) {
            z.charging = 1.1;
            const d = Math.max(0.5, distP);
            z.chargeDX = dxP / d;
            z.chargeDZ = dzP / d;
          }
        } else if (z.charging > 0) {
          z.charging -= dt;
          const cs = 15;
          z.x += z.chargeDX * cs * dt;
          z.z += z.chargeDZ * cs * dt;
          if (playerAlive && Math.hypot(tp.x - z.x, tp.z - z.z) < 2.6 && !z.didHit) {
            z.didHit = true;
            this._hurt(tgt, 34 * this.diff.dmg, z.x, z.z);
            level.audio.slam();
          }
          if (z.charging <= 0) {
            z.didHit = false;
            z.chargeCd = this.rng.range(4.5, 7);
          }
        } else if (z.chargeCd <= 0 && distP > 7 && distP < 32 && z.state === 'chase') {
          z.telegraph = 0.8;
          z.didHit = false;
          level.audio.chargeWarn();
          level.bus.emit('bossCharge');
        }
        // лють лише у фазі низького HP; якщо ліш залікував боса вище 35% — спадає
        z.enraged = frac < 35;
        // ліш: бос не покидає околиці арени — повертається і лікується
        const dArena = Math.hypot(z.x - this.L.arena.x, z.z - this.L.arena.z);
        if (!z.noLeash && !z.leashed && dArena > this.L.arena.r + 14) z.leashed = true;
        else if (z.leashed && dArena < 8) z.leashed = false;
        if (z.leashed) {
          z.telegraph = 0;
          z.charging = 0;
          z.hp = Math.min(z.maxHp, z.hp + 10 * dt);
        }
      }

      // --- рух ---
      let targetX = null, targetZ = null, spd = 0;
      if (z.state === 'flee') {
        targetX = z.x - dxP;
        targetZ = z.z - dzP;
        spd = 6.2;
      } else if (z.state === 'chase') {
        if (z.type === 'boss' && z.leashed) {
          targetX = this.L.arena.x; targetZ = this.L.arena.z;
        } else {
          targetX = tp.x; targetZ = tp.z;
        }
        spd = st.chaseSpeed * (z.enraged ? 1.5 : 1);
      } else if (z.state === 'wander') {
        targetX = z.wx; targetZ = z.wz;
        spd = st.speed;
        if (Math.hypot(z.wx - z.x, z.wz - z.z) < 1) spd = 0;
      }
      if (z.charging > 0 || z.telegraph > 0) spd = 0;
      // сніговик тримає дистанцію і кидає сніжки (зупиняється лише в зоні кидка)
      if (z.ranged && z.ranged.hold > 0 && z.state === 'chase'
        && distP < z.ranged.hold && distP > Math.max(st.attackR * 1.2, z.ranged.min)) spd = 0;

      let moving = false;
      if (spd > 0 && targetX !== null) {
        const dx = targetX - z.x, dz = targetZ - z.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.4) {
          let mx = (dx / d) * spd * dt;
          let mz = (dz / d) * spd * dt;
          // сепарація від інших зомбі (квадрати відстаней — без зайвих sqrt)
          for (const o of this.list) {
            if (o === z || o.state === 'dead') continue;
            const sx = z.x - o.x, sz = z.z - o.z;
            const minD = (z.rig.radius + o.rig.radius) * 0.9;
            const sd2 = sx * sx + sz * sz;
            if (sd2 < minD * minD && sd2 > 1e-4) {
              const sd = Math.sqrt(sd2);
              mx += (sx / sd) * (minD - sd) * 0.5;
              mz += (sz / sd) * (minD - sd) * 0.5;
            }
          }
          // 🏔️ чесні схили: у відвісну кручу зомбі не лізе — обходить уздовж стіни
          if (this.world._terrainMod) {
            const ghO = this.world.groundH(z.x, z.z);
            const ok = (ax, az) =>
              this.world.groundH(ax, az) - ghO <= Math.hypot(ax - z.x, az - z.z) * 1.6 + 0.35;
            if (!ok(z.x + mx, z.z + mz)) {
              if (ok(z.x + mx, z.z)) mz = 0;
              else if (ok(z.x, z.z + mz)) mx = 0;
              else { mx = 0; mz = 0; }
            }
          }
          z.x += mx;
          z.z += mz;
          moving = true;
        }
      }
      // колізії зі світом
      const solved = this.world.collide(z.x, z.z, z.rig.radius * 0.8);
      z.x = solved.x;
      z.z = solved.z;
      z.y = Math.max(this.world.groundH(z.x, z.z), this.world.floorAt(z.x, z.z, z.y));

      // --- поворот і анімація ---
      let faceX = 0, faceZ = 0;
      if (z.state === 'attack' || z.telegraph > 0) {
        faceX = dxP; faceZ = dzP;
      } else if (z.charging > 0) {
        faceX = z.chargeDX; faceZ = z.chargeDZ;
      } else if (moving && targetX !== null) {
        faceX = targetX - z.x; faceZ = targetZ - z.z;
      }
      if (faceX !== 0 || faceZ !== 0) {
        const targetYaw = Math.atan2(-faceX, -faceZ);
        rig.group.rotation.y = dampAngle(rig.group.rotation.y, targetYaw, 8, dt);
      }
      z._netMoving = moving;
      rig.group.position.set(z.x, z.y, z.z);

      if (z.state !== 'attack') {
        if (z.telegraph > 0) {
          setAnim(rig, 'cheer'); // махає руками — телеграф чарджу
        } else if (moving) {
          setAnim(rig, spd > 4 || z.charging > 0 ? 'run' : 'walk');
          rig.anim.speed = z.charging > 0 ? 14 : spd;
        } else {
          setAnim(rig, 'idle');
        }
      }
      updateRig(rig, dt);

      // --- звуки ---
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = z.aggroed ? this.rng.range(1.5, 4) : this.rng.range(4, 10);
        if (distP < 45) {
          level.audio.zgroan(1 - clamp(distP / 45, 0, 0.92), st.pitch);
        }
      }
    }
    if (removeAny) this.list = this.list.filter((z) => !z.gone);
  }

  // 🤝 множник команди: соло/дзеркало = 1, кооп = кількість гравців
  coopMul() {
    const level = this.level;
    if (level.mirror) return 1;
    const byPlayers = level.players && level.players.length;
    if (byPlayers) return byPlayers;
    // початкові зомбі спавняться ще ДО підключення мережі — рахуємо ростер кімнати
    const sess = level.game && level.game.coop && level.game.coop.session;
    return (sess && sess.state === 'level') ? Math.max(1, sess.roster.size) : 1;
  }

  // шкода гравцю: у коопі — через мережу (хост), соло — напряму
  _hurt(tgt, dmg, fx, fz) {
    if (!tgt) return;
    if (this.level.net && this.level.net.authority) this.level.net.hurtPlayer(tgt, dmg, fx, fz);
    else this.level.player.takeDamage(dmg, fx, fz);
  }

  // ================= ДЗЕРКАЛО (гість кооперативу) =================
  // Зомбі-маріонетка: позиції/стани приходять з хоста, тут лише анімація.
  spawnPuppet(nid, type, x, z, o = {}) {
    if (this.byNidMap.has(nid)) return this.byNidMap.get(nid);
    const z_ = this.spawn(type, x, z, {
      nid, mirror: true,
      golden: !!o.g, elite: !!o.e, sleeping: !!o.sl, horde: !!o.h,
      style: o.st || undefined,
    });
    if (o.mhp) { z_.maxHp = o.mhp; z_.hp = o.hp !== undefined ? o.hp : o.mhp; }
    if (o.sh !== undefined && z_.shieldMax > 0) this._applyShieldPct(z_, o.sh);
    if (o.ch !== undefined && z_.chestMax > 0) this._applyChestPct(z_, o.ch);
    z_.netT = { x, z, y: z_.y };
    z_.netB = 0;
    return z_;
  }

  puppetDie(z, mine, golden) {
    if (z.state === 'dead') return;
    z.state = 'dead';
    z.deadT = 0;
    setAnim(z.rig, 'die');
    const level = this.level;
    const distV = Math.hypot(z.x - level.player.pos.x, z.z - level.player.pos.z);
    level.audio.zdie(1 - clamp(distV / 50, 0, 0.9));
    if (z.horde) this.hordeRemaining--;
    if (mine) {
      level.stats.kills++;
      level.bus.emit('zombieKilled', z);
    }
    if (golden) level.audio.goldenJingle();
    if (z.type === 'boss') this.boss = null;
  }

  puppetGone(nid) {
    const z = this.byNidMap.get(nid);
    if (!z) return;
    z.gone = true;
    this.scene.remove(z.rig.group);
    this.byNidMap.delete(nid);
    if (this.boss === z) this.boss = null;
    this.list = this.list.filter((zb) => zb !== z);
  }

  puppetShieldBreak(nid) {
    const z = this.byNidMap.get(nid);
    if (!z || !z.shieldObj) return;
    this._applyShieldPct(z, 0);
  }

  puppetChestBreak(nid) {
    const z = this.byNidMap.get(nid);
    if (!z) return;
    this._applyChestPct(z, 0);
  }

  _applyShieldPct(z, pct) {
    if (!z.shieldMax) return;
    z.shieldHp = (z.shieldMax * pct) / 100;
    if (pct <= 0 && z.shieldObj) {
      const fx = -Math.sin(z.rig.group.rotation.y);
      const fz = -Math.cos(z.rig.group.rotation.y);
      const sparkPos = new THREE.Vector3(z.x + fx * 0.75, z.y + 1.15, z.z + fz * 0.75);
      z.rig.body.remove(z.shieldObj.group);
      z.shieldObj = null;
      z.shieldHp = 0;
      this.level.effects.burst(sparkPos, 0x7d8aa0, 14, { speed: 4.5, up: 4, life: 0.7, size: 1.3 });
      this.level.audio.shieldBreak();
    } else if (z.shieldObj) {
      z.shieldObj.cracks1.visible = pct <= 75;
      z.shieldObj.cracks2.visible = pct <= 50;
      if (z.shieldObj.cracks3) z.shieldObj.cracks3.visible = pct <= 25;
    }
  }

  _applyChestPct(z, pct) {
    if (!z.chestMax) return;
    z.chestHp = (z.chestMax * pct) / 100;
    if (pct <= 0) {
      if (z.chestObj && z.chestObj.visible) {
        z.chestObj.visible = false;
        if (z.chestCracks1) z.chestCracks1.visible = false;
        if (z.chestCracks2) z.chestCracks2.visible = false;
        this.level.effects.burst(new THREE.Vector3(z.x, z.y + 1.2, z.z), 0x7d8aa0, 12, { speed: 4, up: 3.5, life: 0.7, size: 1.2 });
        this.level.audio.shieldBreak();
      }
    } else {
      if (z.chestCracks1) z.chestCracks1.visible = pct <= 60;
      if (z.chestCracks2) z.chestCracks2.visible = pct <= 30;
    }
  }

  // снапшот хоста: цілі для інтерполяції
  applySnapshot(zarr) {
    for (const t of zarr) {
      const z = this.byNidMap.get(t[0]);
      if (!z || z.state === 'dead') continue;
      z.netT = { x: t[1], z: t[2], y: t[3] };
      z.netB = t[4];
      z.hp = Math.max(1, Math.round((z.maxHp * t[5]) / 100));
      if (t.length > 6) {
        const v = t[6];
        if (v >= 0 && z.shieldMax > 0 && z.shieldObj) this._applyShieldPct(z, v);
        else if (v < 0 && z.chestMax > 0) this._applyChestPct(z, -(v + 1));
      }
      z.sleeping = !!(t[4] & 64);
    }
  }

  clearAllPuppets() {
    for (const z of this.list) this.scene.remove(z.rig.group);
    this.list = [];
    this.byNidMap.clear();
    this.boss = null;
  }

  _updateMirror(dt) {
    const level = this.level;
    const p = level.player;
    let removeAny = false;
    for (const z of this.list) {
      const rig = z.rig;
      if (z.state === 'dead') {
        z.deadT += dt;
        // риг трупа оновлюємо лише поки грає die-анімація — потім поза заморожена
        if (rig.anim.dieT < 1) updateRig(rig, dt);
        if (z.deadT > 1.6) rig.group.position.y -= dt * 0.7;
        if (z.deadT > this._corpseTtl) {
          z.gone = true;
          removeAny = true;
          this.scene.remove(rig.group);
          this.byNidMap.delete(z.nid);
        }
        continue;
      }
      const b = z.netB || 0;
      const state = b & 7; // 0 wander 1 chase 2 attack 3 dead 4 flee
      const charging = (b & 16) !== 0;
      const telegraph = (b & 32) !== 0;
      if (z.netT) {
        const ddx = z.netT.x - z.x, ddz = z.netT.z - z.z;
        const snapDist = Math.hypot(ddx, ddz);
        if (snapDist > 10) {
          z.x = z.netT.x; z.z = z.netT.z; z.y = z.netT.y;
        } else {
          z.x = damp(z.x, z.netT.x, 12, dt);
          z.z = damp(z.z, z.netT.z, 12, dt);
          z.y = damp(z.y, z.netT.y, 12, dt);
        }
        z._mirrorSpd = damp(z._mirrorSpd || 0, snapDist * 12, 8, dt);
        // обличчям до руху, в атаці — до найближчого гравця (локальна здогадка)
        let fx = ddx, fz = ddz;
        if (state === 2 || telegraph) {
          fx = p.pos.x - z.x; fz = p.pos.z - z.z;
          let bd = Math.hypot(fx, fz);
          if (level.net) {
            for (const rp of level.net.remotes.values()) {
              const d2 = Math.hypot(rp.pos.x - z.x, rp.pos.z - z.z);
              if (d2 < bd) { bd = d2; fx = rp.pos.x - z.x; fz = rp.pos.z - z.z; }
            }
          }
        }
        if (Math.abs(fx) > 0.01 || Math.abs(fz) > 0.01) {
          rig.group.rotation.y = dampAngle(rig.group.rotation.y, Math.atan2(-fx, -fz), 8, dt);
        }
      }
      rig.group.position.set(z.x, z.y, z.z);
      // анімація зі стану
      if (z.sleeping) {
        updateRig(rig, dt * 0.35);
        continue;
      }
      const moving = (z._mirrorSpd || 0) > 0.6;
      if (state === 2) {
        if (rig.anim.mode !== 'attack') setAnim(rig, 'attack');
        else if (rig.anim.attackT >= 1) { rig.anim.attackT = 0; }
      } else if (telegraph) {
        setAnim(rig, 'cheer');
      } else if (moving) {
        setAnim(rig, (z._mirrorSpd > 4 || charging) ? 'run' : 'walk');
        rig.anim.speed = charging ? 14 : z._mirrorSpd;
      } else {
        setAnim(rig, 'idle');
      }
      updateRig(rig, dt);
      // стогони
      z.groanT -= dt;
      if (z.groanT <= 0) {
        z.groanT = z.aggroed ? this.rng.range(1.5, 4) : this.rng.range(4, 10);
        const distP = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
        if (distP < 45) level.audio.zgroan(1 - clamp(distP / 45, 0, 0.92), z.stats.pitch);
      }
    }
    if (removeAny) this.list = this.list.filter((z) => !z.gone);
  }
}
