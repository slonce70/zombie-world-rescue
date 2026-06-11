// Місії: порятунок людей, ремонт вежі, зачистка складу, фінальний бос
import * as THREE from 'three';
import { makeCivilian, updateRig, setAnim } from './characters.js';

import { clamp, dampAngle } from './utils.js';

export class Missions {
  constructor(level) {
    this.level = level;
    this.L = level.world.layout;
    this.missions = [
      { id: 'rescue', icon: '🆘', title: 'Врятуй людей у хліві', state: 'active', color: 0x4cff7a, reward: 80, horde: 12 },
      { id: 'tower', icon: '📡', title: 'Полагодь радіовежу', state: 'active', color: 0x44ccff, reward: 100, horde: 16 },
      { id: 'warehouse', icon: '📦', title: 'Зачисть склад зброї', state: 'active', color: 0xffaa33, reward: 120, horde: 18 },
    ];
    this.beams = {};
    const eff = level.effects;
    this.beams.rescue = eff.makeBeam(this.L.rescue.x, this.L.rescue.z - 6, 0x4cff7a, '🆘');
    this.beams.tower = eff.makeBeam(this.L.tower.x + 4, this.L.tower.z + 4, 0x44ccff, '📡');
    this.beams.warehouse = eff.makeBeam(this.L.warehouse.x - 2, this.L.warehouse.z - 7.5, 0xffaa33, '📦');
    this.bossBeam = null;

    this.civilians = [];
    this.prompt = null;
    this.repairProgress = 0;
    this.repairTickT = 0;
    this.towerWaves = [false, false];
    this.crateReady = false;
    this.crateOpenedT = -1;
    this.barnOpened = false;
    this.barnOpenedT = -1;
    this.medicAlive = false;
    this.healPulseT = 0;
    this.pendingHorde = null;
    this.pendingWave = null;
    this.bossUnlocked = false;
    this.bossStarted = false;
    this.bossHpLeft = null;
    this.allDone = false;

    // якщо гравець загинув у бою з босом — бій перезапускається з арени
    level.bus.on('playerDied', () => {
      if (this.bossStarted && level.zombies.boss) {
        this.bossHpLeft = level.zombies.despawnBoss();
        this.bossStarted = false;
        this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
        level.bus.emit('toast', '👑 Бос повернувся на арену й чекає на реванш!');
      }
    });
  }

  get(id) { return this.missions.find((m) => m.id === id); }

  getHudList() {
    const out = [];
    for (const m of this.missions) {
      let extra = '';
      if (m.id === 'tower' && m.state === 'active' && this.repairProgress > 0) {
        extra = ` (${Math.round(this.repairProgress * 100)}%)`;
      }
      if (m.id === 'warehouse' && m.state === 'active') {
        const n = this.level.zombies.countAliveInZone('warehouse');
        extra = this.crateReady ? ' — відкрий ящик!' : ` (зомбі: ${n})`;
      }
      out.push({ icon: m.icon, title: m.title + extra, done: m.state === 'done' });
    }
    if (this.allDone && !this.bossStarted) {
      out.push({ icon: '👑', title: 'Перемоги БОСА на арені!', done: false });
    } else if (this.bossStarted) {
      out.push({ icon: '👑', title: 'Бій з босом!', done: false });
    }
    return out;
  }

  getMarkers() {
    // для мінікарти
    const mk = [];
    if (this.get('rescue').state === 'active') mk.push({ x: this.L.rescue.x, z: this.L.rescue.z, color: '#4cff7a', icon: '🆘' });
    if (this.get('tower').state === 'active') mk.push({ x: this.L.tower.x, z: this.L.tower.z, color: '#44ccff', icon: '📡' });
    if (this.get('warehouse').state === 'active') mk.push({ x: this.L.warehouse.x, z: this.L.warehouse.z, color: '#ffaa33', icon: '📦' });
    if (this.bossUnlocked && !this.bossStarted) mk.push({ x: this.L.arena.x, z: this.L.arena.z, color: '#ff44aa', icon: '👑' });
    return mk;
  }

  _complete(id) {
    const m = this.get(id);
    if (!m || m.state === 'done') return;
    m.state = 'done';
    if (this.beams[id]) { this.beams[id].remove(); delete this.beams[id]; }
    const level = this.level;
    level.addCoins(m.reward);
    level.audio.mission();
    level.bus.emit('missionDone', m);
    // орда після короткої паузи (накладання орд — додаємо, не затираємо)
    const count = Math.round(m.horde * ((level.country && level.country.difficulty.counts) || 1));
    if (this.pendingHorde) this.pendingHorde.count += count;
    else this.pendingHorde = { t: 5, count };
    level.bus.emit('hordeWarning', 5);
  }

  spawnCivilians() {
    const { x, z } = this.L.rescue;
    const kinds = ['medic', 'granny', 'kid'];
    kinds.forEach((kind, i) => {
      const rig = makeCivilian(kind, this.level.rng);
      const cx = x - 1.5 + i * 1.5, cz = z + 0.5;
      rig.group.position.set(cx, this.level.world.groundH(cx, cz), cz);
      this.level.scene.add(rig.group);
      const civ = {
        rig, kind, x: cx, z: cz,
        state: 'exit', exitT: 0,
        angle: (i / 3) * Math.PI * 2,
        cheerT: 2.5,
      };
      this.civilians.push(civ);
      if (kind === 'medic') this.medicAlive = true;
    });
  }

  _updateCivilians(dt) {
    const level = this.level;
    const player = level.player;
    for (const c of this.civilians) {
      const rig = c.rig;
      let spd = 0, tx = null, tz = null;
      if (c.state === 'exit') {
        c.exitT += dt;
        tx = this.L.rescue.x + (c.angle - 3) * 1.2;
        tz = this.L.rescue.z - 8;
        spd = 3;
        if (c.exitT > 2.2) c.state = 'follow';
      } else {
        // йдуть за гравцем
        const ox = Math.cos(c.angle) * 2.6;
        const oz = Math.sin(c.angle) * 2.6;
        tx = player.pos.x + ox;
        tz = player.pos.z + oz;
        const d = Math.hypot(tx - c.x, tz - c.z);
        if (d > 30) { // телепорт якщо сильно відстали
          c.x = player.pos.x + ox;
          c.z = player.pos.z + oz;
        }
        spd = d > 12 ? 5.2 : d > 2 ? 3.4 : 0;
      }
      if (spd > 0 && tx !== null) {
        const dx = tx - c.x, dz = tz - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) {
          c.x += (dx / d) * spd * dt;
          c.z += (dz / d) * spd * dt;
          const yawT = Math.atan2(-dx, -dz);
          rig.group.rotation.y = dampAngle(rig.group.rotation.y, yawT, 8, dt);
          setAnim(rig, spd > 4 ? 'run' : 'walk');
          rig.anim.speed = spd;
        } else {
          setAnim(rig, c.cheerT > 0 ? 'cheer' : 'idle');
        }
      } else {
        setAnim(rig, c.cheerT > 0 ? 'cheer' : 'idle');
      }
      if (c.cheerT > 0) c.cheerT -= dt;
      const solved = level.world.collide(c.x, c.z, 0.4);
      c.x = solved.x; c.z = solved.z;
      rig.group.position.set(c.x, level.world.groundH(c.x, c.z), c.z);
      updateRig(rig, dt);
    }
    // медик лікує поблизу
    const medic = this.civilians.find((c) => c.kind === 'medic');
    if (medic && player.health > 0 && player.health < player.maxHealth) {
      const d = Math.hypot(medic.x - player.pos.x, medic.z - player.pos.z);
      if (d < 9) {
        player.heal(3.2 * dt);
        this.healPulseT -= dt;
        if (this.healPulseT <= 0) {
          this.healPulseT = 1.1;
          const pp = player.pos;
          level.effects.burst(new THREE.Vector3(pp.x, pp.y + 1.6, pp.z), 0x6dff9c, 4, { speed: 0.8, up: 1.6, life: 0.7, size: 0.7 });
        }
      }
    }
  }

  update(dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const px = player.pos.x, pz = player.pos.z;
    this.prompt = null;

    // маркери пульсують
    for (const k in this.beams) this.beams[k].update(dt);
    if (this.bossBeam) this.bossBeam.update(dt);

    // --- відкладена орда ---
    if (this.pendingHorde) {
      this.pendingHorde.t -= dt;
      if (this.pendingHorde.t <= 0) {
        level.zombies.startHorde(this.pendingHorde.count);
        level.audio.horde();
        level.bus.emit('hordeStart', this.pendingHorde.count);
        this.pendingHorde = null;
      }
    }

    // --- відкладена хвиля захисту вежі (телеграф 2.5с) ---
    if (this.pendingWave) {
      this.pendingWave.t -= dt;
      if (this.pendingWave.t <= 0) {
        this._towerWave(this.pendingWave.n, this.pendingWave.onlyWalkers);
        this.pendingWave = null;
      }
    }

    // --- місія 1: хлів ---
    const rescue = this.get('rescue');
    if (rescue.state === 'active') {
      if (!this.barnOpened) {
        const door = level.world.barnDoorCollider;
        const d = Math.hypot(px - door.x, pz - (door.z - 1));
        if (d < 3.2) {
          this.prompt = { text: 'Натисни E — відчини хлів', hold: false };
          if (allowControl && input.pressed('KeyE')) {
            this.barnOpened = true;
            this.barnOpenedT = 0;
            level.world.openBarn();
            level.audio.door();
            this.spawnCivilians();
          }
        }
      } else {
        this.barnOpenedT += dt;
        if (this.barnOpenedT > 2.0) {
          this._complete('rescue');
          level.bus.emit('toast', 'Людей врятовано! Медик лікуватиме тебе поблизу 💚');
        }
      }
    }

    // --- місія 2: вежа ---
    const tower = this.get('tower');
    if (tower.state === 'active') {
      const rp = level.world.repairPoint;
      const d = Math.hypot(px - rp.x, pz - rp.z);
      if (d < 3.0) {
        this.prompt = {
          text: this.repairProgress > 0 ? 'Тримай E — ремонт вежі' : 'Тримай E — почни ремонт',
          hold: true, progress: this.repairProgress,
        };
        if (allowControl && input.down('KeyE')) {
          this.repairProgress = Math.min(1, this.repairProgress + dt / 12);
          this.repairTickT -= dt;
          if (this.repairTickT <= 0) {
            this.repairTickT = 0.35;
            level.audio.repairTick();
            const sp = new THREE.Vector3(rp.x, level.world.groundH(rp.x, rp.z) + 1, rp.z);
            level.effects.burst(sp, 0xffe066, 3, { speed: 1.6, up: 2.2, life: 0.3, size: 0.6 });
          }
          // хвилі захисту — з попередженням заздалегідь
          if (this.repairProgress > 0.15 && !this.towerWaves[0]) {
            this.towerWaves[0] = true;
            this.pendingWave = { t: 2.5, n: 4, onlyWalkers: true };
            level.audio.horde();
            level.bus.emit('toast', '👂 Чуєш гарчання? Зомбі почули шум — приготуйся! ⚠️');
          }
          if (this.repairProgress > 0.55 && !this.towerWaves[1]) {
            this.towerWaves[1] = true;
            this.pendingWave = { t: 2.5, n: 5, onlyWalkers: false };
            level.audio.horde();
            level.bus.emit('toast', '👂 Ще одна хвиля наближається! ⚠️');
          }
          if (this.repairProgress >= 1) {
            level.world.setTowerFixed();
            this._complete('tower');
            level.bus.emit('toast', 'Радіовежа працює! Сигнал надіслано 📡');
          }
        }
      }
    }

    // --- місія 3: склад ---
    const wh = this.get('warehouse');
    if (wh.state === 'active') {
      if (!this.crateReady) {
        if (level.zombies.countAliveInZone('warehouse') === 0) {
          this.crateReady = true;
          level.bus.emit('toast', 'Склад зачищено! Відкрий ящик зі зброєю 📦');
        }
      } else if (this.crateOpenedT < 0) {
        const wc = level.world.weaponCrate;
        const d = Math.hypot(px - wc.x, pz - wc.z);
        if (d < 2.8) {
          this.prompt = { text: 'Натисни E — відкрий ящик', hold: false };
          if (allowControl && input.pressed('KeyE')) {
            this.crateOpenedT = 0;
            level.world.openCrate();
            level.audio.door();
          }
        }
      } else {
        this.crateOpenedT += dt;
        if (this.crateOpenedT > 0.9) {
          level.game.unlockWeapon(level.country.weaponReward);
          this._complete('warehouse');
          level.bus.emit('toast', level.country.weaponRewardToast);
        }
      }
    }

    // --- усі місії виконані → арена боса ---
    if (!this.allDone && this.missions.every((m) => m.state === 'done')
      && !level.zombies.hordeActive && !this.pendingHorde) {
      this.allDone = true;
      this.bossUnlocked = true;
      this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
      level.audio.bossRoar();
      level.bus.emit('bossUnlocked');
    }
    if (this.bossUnlocked && !this.bossStarted && player.health > 0) {
      const d = Math.hypot(px - this.L.arena.x, pz - this.L.arena.z);
      if (d < this.L.arena.r - 4) {
        this.bossStarted = true;
        if (this.bossBeam) { this.bossBeam.remove(); this.bossBeam = null; }
        level.zombies.spawnBoss(this.bossHpLeft);
        level.audio.bossRoar();
        level.bus.emit('bossStart');
        // гарантовані припаси по периметру арени
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.5;
          const sx = this.L.arena.x + Math.cos(a) * (this.L.arena.r - 7);
          const sz = this.L.arena.z + Math.sin(a) * (this.L.arena.r - 7);
          level.effects.spawnPickup(sx, sz, i % 3 === 0 ? 'medkit' : 'ammo');
        }
      }
    }

    this._updateCivilians(dt);
  }

  _towerWave(n, onlyWalkers) {
    const level = this.level;
    const { x, z } = this.L.tower;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const type = onlyWalkers ? 'walker' : (i % 3 === 0 ? 'runner' : 'walker');
      const zb = level.zombies.spawn(type,
        x + Math.cos(a) * 22, z + Math.sin(a) * 22, { horde: false });
      zb.aggroed = true;
      zb.state = 'chase';
    }
    level.bus.emit('toast', '🧟 Зомбі атакують вежу! Захищайся!');
  }
}
