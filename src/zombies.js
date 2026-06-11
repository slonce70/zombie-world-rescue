// Зомбі: AI (блукання/охорона/погоня/атака/смерть), орди, бос
import * as THREE from 'three';
import { makeZombie, makeBoss, updateRig, setAnim, toonMat } from './characters.js';

import { clamp, dampAngle, closestRaySeg, RNG } from './utils.js';

const TYPE_STATS = {
  walker: { hp: 70, speed: 1.6, chaseSpeed: 3.0, aggro: 18, dmg: 8, attackR: 1.8, coins: 5, pitch: 1.0 },
  runner: { hp: 45, speed: 2.6, chaseSpeed: 5.2, aggro: 30, dmg: 6, attackR: 1.7, coins: 8, pitch: 1.5 },
  tank: { hp: 230, speed: 1.2, chaseSpeed: 2.3, aggro: 16, dmg: 18, attackR: 2.3, coins: 15, pitch: 0.55 },
  snowman: {
    hp: 60, speed: 1.2, chaseSpeed: 2.1, aggro: 30, dmg: 9, attackR: 2.0, coins: 10, pitch: 1.8,
    ranged: { min: 7, max: 30, hold: 13, cd: 3.4, projSpeed: 15, dmg: 7, size: 0.22 },
  },
  boss: { hp: 1300, speed: 2.0, chaseSpeed: 3.6, aggro: 999, dmg: 22, attackR: 3.6, coins: 0, pitch: 0.4 },
};

const FROST_RANGED = { min: 9, max: 40, hold: 0, cd: 5.5, projSpeed: 19, dmg: 16, size: 0.5 };

export class Zombies {
  constructor(level, seed = 999) {
    this.level = level;
    this.scene = level.scene;
    this.world = level.world;
    this.L = level.world.layout;
    this.rng = new RNG(seed);
    this.diff = (level.country && level.country.difficulty) || { hp: 1, dmg: 1, counts: 1 };
    this.extraZombie = (level.country && level.country.extraZombie) || null;
    this.list = [];
    this.boss = null;
    this.hordeRemaining = 0;
    this.hordePending = 0;
    this.hordeSpawnT = 0;
    this.hordeActive = false;
    this._p0 = new THREE.Vector3();
    this._p1 = new THREE.Vector3();
  }

  spawn(type, x, z, opts = {}) {
    const rig = type === 'boss' ? makeBoss(!!opts.frost) : makeZombie(type, this.rng);
    const stats = TYPE_STATS[type];
    const y = this.world.groundH(x, z);
    rig.group.position.set(x, y, z);
    rig.group.rotation.y = this.rng.next() * 6.28;
    this.scene.add(rig.group);
    const hpScale = type === 'boss' ? 1 : this.diff.hp;
    const z_ = {
      rig, type, stats,
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
      chargeCd: 6, charging: 0, chargeDX: 0, chargeDZ: 0, telegraph: 0,
      summonedAt: { 70: false, 40: false },
      frost: !!opts.frost,
      // дальній бій (сніговики, Король Мороз)
      ranged: stats.ranged || (opts.frost ? FROST_RANGED : null),
      rangedCd: this.rng.range(0.5, 2.5),
      throwProj: false,
    };
    z_.damage = (amt, dir, headshot) => this._damage(z_, amt, dir, headshot);
    this.list.push(z_);
    if (type === 'boss') this.boss = z_;
    return z_;
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
    const z_ = this.spawn('walker', x, z, {});
    z_.golden = true;
    z_.hp = z_.maxHp = 80;
    z_.anchor = { x, z, r: 30 };
    // золоте покриття: один матеріал поверх запечених кольорів
    const goldM = toonMat(0xffd23f, 0xcc8800, 0.35);
    z_.rig.group.traverse((o) => {
      if (o.isMesh) o.material = goldM;
    });
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
  }

  // сплячий зомбі-сюрприз у будинку: прокидається, коли гравець поруч
  spawnSurprise(x, z) {
    const type = this.extraZombie && this.rng.chance(0.4) ? this.extraZombie : 'walker';
    const z_ = this.spawn(type, x, z, {});
    z_.sleeping = true;
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
    const b = this.spawn('boss', x, z - 6, { horde: false, frost: cfg.frost });
    b.maxHp = cfg.hp;
    b.hp = hp !== null ? Math.min(cfg.hp, Math.max(150, hp)) : cfg.hp;
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
    level.stats.kills++;
    level.bus.emit('zombieKilled', z);
    // лут
    if (z.type !== 'boss') {
      const coins = z.stats.coins;
      const n = z.type === 'tank' ? 3 : z.type === 'runner' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        level.effects.spawnCoin(z.x + this.rng.range(-0.6, 0.6), z.z + this.rng.range(-0.6, 0.6), Math.ceil(coins / n));
      }
      if (this.boss) {
        // під час бою з босом міньйони гарантовано дають патрони
        level.effects.spawnPickup(z.x - 1, z.z, 'ammo');
      } else if (this.rng.chance(0.07)) level.effects.spawnPickup(z.x + 1, z.z, 'medkit');
      else if (this.rng.chance(0.13)) level.effects.spawnPickup(z.x - 1, z.z, 'ammo');
    }
    if (z.horde) this.hordeRemaining--;
    if (z.golden) {
      // 🏆 джекпот!
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        level.effects.spawnCoin(z.x + Math.cos(a) * this.rng.range(0.5, 2.5), z.z + Math.sin(a) * this.rng.range(0.5, 2.5), 12);
      }
      level.audio.goldenJingle();
      level.bus.emit('toast', '🏆 ЗОЛОТИЙ ЗОМБІ! ДЖЕКПОТ +144 монети!');
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
    const level = this.level;
    const player = level.player;
    const px = player.pos.x, pz = player.pos.z;
    const playerAlive = player.health > 0;

    // спавн орди хвилями
    if (this.hordeActive && this.hordePending > 0) {
      this.hordeSpawnT -= dt;
      if (this.hordeSpawnT <= 0) {
        this.hordeSpawnT = 1.3;
        const batch = Math.min(4, this.hordePending);
        for (let i = 0; i < batch; i++) {
          const a = this.rng.next() * Math.PI * 2;
          const r = this.rng.range(32, 48);
          let x = px + Math.cos(a) * r;
          let z = pz + Math.sin(a) * r;
          const dB = Math.hypot(x, z);
          if (dB > this.L.BOUND - 5) {
            x *= (this.L.BOUND - 8) / dB;
            z *= (this.L.BOUND - 8) / dB;
          }
          const roll = this.rng.next();
          let type;
          if (this.extraZombie) {
            type = roll < 0.45 ? 'walker' : roll < 0.7 ? 'runner' : roll < 0.9 ? this.extraZombie : 'tank';
          } else {
            type = roll < 0.6 ? 'walker' : roll < 0.9 ? 'runner' : 'tank';
          }
          this.spawn(type, x, z, { horde: true });
          this.hordePending--;
        }
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
        updateRig(rig, dt);
        if (z.deadT > 1.6) rig.group.position.y -= dt * 0.7;
        if (z.deadT > 3.0) {
          z.gone = true;
          removeAny = true;
          this.scene.remove(rig.group);
        }
        continue;
      }

      const dxP = px - z.x, dzP = pz - z.z;
      const distP = Math.hypot(dxP, dzP);
      const st = z.stats;
      if (z.rangedCd > 0) z.rangedCd -= dt;

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
          level.bus.emit('toast', '😱 СЮРПРИЗ! У будинку ховався зомбі!');
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
        if (playerAlive && (distP < st.aggro || z.aggroed)) {
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
          this._p1.set(dxP, (player.pos.y + 1.0) - (z.y + z.rig.height * 0.6), dzP).normalize();
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
          this._p1.set(dxP, (player.pos.y + 1.2) - (z.y + z.rig.height * 0.75), dzP).normalize();
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
        } else if (!z.horde && z.type !== 'boss') {
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
              const target = new THREE.Vector3(px, player.pos.y + 1.25, pz);
              level.effects.spawnProjectile(from, target, z.ranged.projSpeed, z.ranged.dmg * this.diff.dmg, z.ranged.size);
              level.audio.throwWhoosh(1 - clamp(distP / 40, 0, 0.8));
            }
          } else if (playerAlive && distP < st.attackR * 1.35) {
            player.takeDamage(st.dmg * this.diff.dmg, z.x, z.z);
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
        for (const thr of [70, 40]) {
          if (frac <= thr && !z.summonedAt[thr]) {
            z.summonedAt[thr] = true;
            level.audio.bossRoar();
            level.bus.emit('bossSummon');
            for (let i = 0; i < 4; i++) {
              const a = (i / 4) * 6.28;
              const mtype = z.frost ? (i % 2 ? 'snowman' : 'walker') : (i % 2 ? 'runner' : 'walker');
              const mz = this.spawn(mtype, z.x + Math.cos(a) * 4, z.z + Math.sin(a) * 4, { horde: false });
              mz.aggroed = true;
              mz.state = 'chase';
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
          if (playerAlive && Math.hypot(px - z.x, pz - z.z) < 2.6 && !z.didHit) {
            z.didHit = true;
            player.takeDamage(28 * this.diff.dmg, z.x, z.z);
            level.audio.slam();
          }
          if (z.charging <= 0) {
            z.didHit = false;
            z.chargeCd = this.rng.range(6, 9);
          }
        } else if (z.chargeCd <= 0 && distP > 7 && distP < 32 && z.state === 'chase') {
          z.telegraph = 0.8;
          z.didHit = false;
          level.audio.chargeWarn();
          level.bus.emit('bossCharge');
        }
        const enraged = frac < 25;
        if (enraged) z.enraged = true;
        // ліш: бос не покидає околиці арени — повертається і лікується
        const dArena = Math.hypot(z.x - this.L.arena.x, z.z - this.L.arena.z);
        if (!z.leashed && dArena > this.L.arena.r + 14) z.leashed = true;
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
          targetX = px; targetZ = pz;
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
}
