// 🎲 Живі завдання: пул типів місій, що роздаються картам випадково (від сіда),
// тож кожна країна і кожне повторне проходження граються інакше.
// Реалізує той самий інтерфейс, що й старі Missions.
import * as THREE from 'three';
import { makeCivilian, updateRig, setAnim, toonMat } from './characters.js';
import { dampAngle, RNG } from './utils.js';

// назви «пристрою для ремонту» за країною — смак без зміни механіки
const REPAIR_NAMES = {
  UKR: 'радіовежу', POL: 'генератор', DEU: 'насосну станцію', FRA: 'антену зв\'язку',
  TUR: 'маяк Босфору', EGY: 'сонячну станцію',
};

// ---------- описи типів місій ----------
// slot: до якого зі слотів карти тип може потрапити
// (A — хлів/порятунок, B — вежа/пристрій, C — склад/зона)
export const MISSION_TYPES = {
  rescue: { icon: '🆘', slots: ['A'], reward: 80, horde: 15 },
  repair: { icon: '📡', slots: ['B'], reward: 100, horde: 20 },
  clear: { icon: '📦', slots: ['C'], reward: 120, horde: 24 },
  collect: { icon: '🧺', slots: ['A', 'C'], reward: 110, horde: 18 },
  defense: { icon: '🛡️', slots: ['B', 'C'], reward: 120, horde: 20 },
  hunt: { icon: '👹', slots: ['A', 'C'], reward: 130, horde: 18 },
  nests: { icon: '🟣', slots: ['B', 'C'], reward: 120, horde: 20 },
  escort: { icon: '🧳', slots: ['A'], reward: 130, horde: 18 },
};

// яка комбінація випаде карті: класика для першого проходження України,
// далі — сідований мікс без повторів типів
export function rollMissionSet(countryId, seed, runIndex) {
  if (countryId === 'UKR' && runIndex === 0) {
    return ['rescue', 'repair', 'clear']; // навчальна класика
  }
  const rng = new RNG((seed * 31 + runIndex * 7777 + 13) >>> 0);
  const bySlot = {
    A: ['rescue', 'collect', 'hunt', 'escort'],
    B: ['repair', 'defense', 'nests'],
    C: ['clear', 'defense', 'collect', 'hunt', 'nests'],
  };
  const used = new Set();
  const out = [];
  for (const slot of ['A', 'B', 'C']) {
    const pool = bySlot[slot].filter((t) => !used.has(t));
    const pick = pool[rng.int(0, pool.length - 1)];
    used.add(pick);
    out.push(pick);
  }
  return out;
}

// аліаси старих ID — щоб тести і збережені посилання працювали
const SLOT_ALIASES = { rescue: 0, tower: 1, warehouse: 2 };

export class DynamicMissions {
  constructor(level) {
    this.level = level;
    this.L = level.world.layout;
    const game = level.game;
    this.mirror = !!level.mirror;
    // у коопі гість будує місії з runIndex ХОСТА — щоб набір збігався
    const runIndex = level.runIndex !== undefined
      ? level.runIndex
      : (game.save.missionRuns && game.save.missionRuns[level.countryId]) || 0;
    // тестовий хук: примусовий набір місій
    const types = game._forceMissionSet || rollMissionSet(level.countryId, level.country.seed, runIndex);
    this.runIndex = runIndex;

    // три слоти карти: A = хлів, B = вежа, C = склад
    const sites = [
      { slot: 'A', site: this.L.rescue, beamAt: { x: this.L.rescue.x, z: this.L.rescue.z - 6 } },
      { slot: 'B', site: this.L.tower, beamAt: { x: this.L.tower.x + 4, z: this.L.tower.z + 4 } },
      { slot: 'C', site: this.L.warehouse, beamAt: { x: this.L.warehouse.x - 2, z: this.L.warehouse.z - 7.5 } },
    ];
    this.missions = types.map((type, i) => this._makeMission(type, sites[i], i));

    this.civilians = [];
    this.prompt = null;
    this.medicAlive = false;
    this.healPulseT = 0;
    this.pendingHorde = null;
    this.pendingWave = null;
    this.bossUnlocked = false;
    this.bossStarted = false;
    this.bossBeam = null;
    this.bossHpLeft = null;
    this.allDone = false;
    this.crateReady = false; // для мінімапи (актуально лише з місією «зачистка»)

    // якщо гравець загинув у бою з босом — бій перезапускається з арени
    level.bus.on('playerDied', () => {
      if (this.mirror) return;
      if (level.net && level.players && level.players.some((p) => p.health > 0)) return; // хтось живий — бій триває
      if (this.bossStarted && level.zombies.boss) {
        this.bossHpLeft = level.zombies.despawnBoss();
        this.bossStarted = false;
        this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
        level.bus.emit('toast', '👑 Бос повернувся на арену й чекає на реванш!');
      }
    });
  }

  // ---------- створення місії конкретного типу ----------
  _makeMission(type, slotInfo, idx) {
    const level = this.level;
    const t = MISSION_TYPES[type];
    const m = {
      id: type, type, slotIndex: idx, icon: t.icon, reward: t.reward, horde: t.horde,
      state: 'active', site: slotInfo.site, slot: slotInfo.slot,
    };
    m.beam = level.effects.makeBeam(slotInfo.beamAt.x, slotInfo.beamAt.z, 0x4cff7a, t.icon);

    if (type === 'rescue') {
      m.title = 'Врятуй людей у хліві';
      m.opened = false;
      m.openedT = -1;
    } else if (type === 'repair') {
      m.title = `Полагодь ${REPAIR_NAMES[level.countryId] || 'радіовежу'}`;
      m.progress = 0;
      m.tickT = 0;
      m.waves = [false, false];
    } else if (type === 'clear') {
      m.title = 'Зачисть склад зброї';
      m.crateOpenedT = -1;
    } else if (type === 'collect') {
      m.title = 'Збери 4 ящики припасів';
      m.found = 0;
      m.crates = this._spawnSupplyCrates(m);
    } else if (type === 'defense') {
      m.title = 'Оборона: протримайся в зоні';
      m.timer = 45;
      m.started = false;
      m.waveT = 0;
      m.zone = this._makeDefenseZone(m);
    } else if (type === 'hunt') {
      m.title = 'Перемож 3 елітних зомбі';
      m.killed = 0;
      m.elites = this._spawnElites(m);
    } else if (type === 'nests') {
      m.title = 'Знешкодь 3 зомбі-гнізда';
      m.cleared = 0;
      m.nestList = this._spawnNests(m);
    } else if (type === 'escort') {
      m.title = 'Проведи мандрівника до вежі';
      m.started = false;
      m.traveler = null;
      m.dest = { x: this.L.tower.x, z: this.L.tower.z, r: 7 };
      m.midWave = false;
    }
    return m;
  }

  // ---------- допоміжні споруди місій ----------
  // 🧺 ящики припасів: навколо слота і трохи по карті
  _spawnSupplyCrates(m) {
    const level = this.level;
    const world = level.world;
    const rng = new RNG(level.country.seed + 555 + this.runIndex);
    const crates = [];
    const woodM = toonMat(0xb08a5a);
    const bandM = toonMat(0x4cff7a, 0x2a8a3a, 0.3);
    for (let i = 0; i < 4; i++) {
      let x = m.site.x, z = m.site.z;
      for (let tries = 0; tries < 25; tries++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(6, 16 + i * 9); // перший — поруч, далі все далі
        x = m.site.x + Math.cos(a) * r;
        z = m.site.z + Math.sin(a) * r;
        const solved = world.collide(x, z, 0.8);
        if (Math.hypot(solved.x - x, solved.z - z) < 0.2 && Math.hypot(x, z) < this.L.BOUND - 8) break;
      }
      const g = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), woodM);
      crate.position.y = 0.36;
      crate.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.16, 0.86), bandM);
      band.position.y = 0.36;
      g.add(crate, band);
      const y = world.groundH(x, z);
      g.position.set(x, y, z);
      level.scene.add(g);
      crates.push({ x, z, y, mesh: g, taken: false });
    }
    return crates;
  }

  // 🛡️ зона оборони: кільце на землі
  _makeDefenseZone(m) {
    const level = this.level;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(m.site.r * 0.7, 0.18, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    const y = level.world.groundH(m.site.x, m.site.z);
    ring.position.set(m.site.x, y + 0.25, m.site.z);
    level.scene.add(ring);
    return { ring, r: m.site.r * 0.7, x: m.site.x, z: m.site.z };
  }

  // 👹 елітні зомбі: більші, з золотою короною-обідком, розкидані по карті
  _spawnElites(m) {
    if (this.mirror) return [];
    const level = this.level;
    const rng = new RNG(level.country.seed + 999 + this.runIndex);
    const elites = [];
    const spots = [
      m.site,
      { x: -m.site.x * 0.7 + 20, z: -m.site.z * 0.7 - 15 },
      { x: m.site.z * 0.6 - 10, z: m.site.x * 0.6 + 18 },
    ];
    const types = ['runner', 'tank', 'walker'];
    spots.forEach((sp, i) => {
      let x = sp.x + rng.range(-6, 6), z = sp.z + rng.range(-6, 6);
      if (Math.hypot(x, z) > this.L.BOUND - 10) { x *= 0.7; z *= 0.7; }
      const z_ = level.zombies.spawn(types[i % 3], x, z, { elite: true });
      z_.hp = z_.maxHp = Math.round(z_.maxHp * 2.2);
      z_.anchor = { x, z, r: 12 };
      elites.push(z_);
    });
    return elites;
  }

  // 🟣 гнізда: фіолетові кокони з охороною, тримай E щоб знешкодити
  _spawnNests(m) {
    const level = this.level;
    const rng = new RNG(level.country.seed + 777 + this.runIndex);
    const nests = [];
    for (let i = 0; i < 3; i++) {
      let x = m.site.x, z = m.site.z;
      for (let tries = 0; tries < 25; tries++) {
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(5, 12 + i * 10);
        x = m.site.x + Math.cos(a) * r;
        z = m.site.z + Math.sin(a) * r;
        const solved = level.world.collide(x, z, 1.2);
        if (Math.hypot(solved.x - x, solved.z - z) < 0.2 && Math.hypot(x, z) < this.L.BOUND - 8) break;
      }
      const g = new THREE.Group();
      const pod = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), toonMat(0x8d3bbd, 0x5a1a8a, 0.35));
      pod.scale.set(1, 1.25, 1);
      pod.position.y = 0.8;
      pod.castShadow = true;
      const goo = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8), toonMat(0x6a2a9a));
      goo.scale.set(1, 0.22, 1);
      goo.position.y = 0.08;
      g.add(pod, goo);
      const y = level.world.groundH(x, z);
      g.position.set(x, y, z);
      level.scene.add(g);
      // охоронець гнізда (на гості приїде подією від хоста)
      if (!this.mirror) {
        level.zombies.spawn(rng.chance(0.5) ? 'walker' : 'runner', x + 2, z + 1, {
          anchor: { x, z, r: 6 }, guard: true,
        });
      }
      nests.push({ x, z, y, mesh: g, pod, progress: 0, cleared: false });
    }
    return nests;
  }

  // 🧳 мандрівник для ескорту
  _spawnTraveler(m) {
    const level = this.level;
    const rig = makeCivilian('granny', level.rng);
    const x = m.site.x, z = m.site.z + 2;
    rig.group.position.set(x, level.world.groundH(x, z), z);
    level.scene.add(rig.group);
    m.traveler = { rig, x, z, hp: 60, maxHp: 60, hurtCd: 0 };
    level.bus.emit('toast', '🧳 Мандрівник іде за тобою! Доведи його цілим до вежі 📡');
  }

  // ---------- Missions API ----------
  get(id) {
    let m = this.missions.find((x) => x.id === id);
    if (!m && id in SLOT_ALIASES) m = this.missions[SLOT_ALIASES[id]];
    return m || null;
  }

  getHudList() {
    const out = [];
    for (const m of this.missions) {
      let extra = '';
      if (m.state === 'active') {
        if (m.type === 'repair' && m.progress > 0) extra = ` (${Math.round(m.progress * 100)}%)`;
        if (m.type === 'clear') {
          const n = this.level.zombies.countAliveInZone('warehouse');
          extra = this.crateReady ? ' — відкрий ящик!' : ` (зомбі: ${n})`;
        }
        if (m.type === 'collect') extra = ` (${m.found}/4)`;
        if (m.type === 'hunt') extra = ` (${m.killed}/3)`;
        if (m.type === 'nests') extra = ` (${m.cleared}/3)`;
        if (m.type === 'defense' && m.started) extra = ` (${Math.ceil(m.timer)}с)`;
        if (m.type === 'escort' && m.started) extra = ' — веди до вежі!';
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
    const mk = [];
    for (const m of this.missions) {
      if (m.state !== 'active') continue;
      if (m.type === 'hunt') {
        // маркер — найближчий живий еліт
        const pool = this.mirror ? this.level.zombies.list.filter((e) => e.elite) : m.elites;
        const alive = pool.find((e) => e.state !== 'dead' && !e.gone);
        if (alive) mk.push({ x: alive.x, z: alive.z, color: '#ffd23f', icon: '👹' });
        continue;
      }
      if (m.type === 'collect') {
        const next = m.crates.find((c) => !c.taken);
        if (next) mk.push({ x: next.x, z: next.z, color: '#4cff7a', icon: '🧺' });
        continue;
      }
      if (m.type === 'nests') {
        const next = m.nestList.find((n) => !n.cleared);
        if (next) mk.push({ x: next.x, z: next.z, color: '#b06ee8', icon: '🟣' });
        continue;
      }
      if (m.type === 'escort' && m.started) {
        mk.push({ x: m.dest.x, z: m.dest.z, color: '#44ccff', icon: '📡' });
        continue;
      }
      mk.push({ x: m.site.x, z: m.site.z, color: '#4cff7a', icon: m.icon });
    }
    if (this.bossUnlocked && !this.bossStarted) mk.push({ x: this.L.arena.x, z: this.L.arena.z, color: '#ff44aa', icon: '👑' });
    return mk;
  }

  _complete(id) {
    const m = this.get(id);
    if (!m || m.state === 'done') return;
    m.state = 'done';
    if (m.beam) { m.beam.remove(); m.beam = null; }
    if (m.zone) { this.level.scene.remove(m.zone.ring); m.zone = null; }
    const level = this.level;
    level.addCoins(m.reward);
    level.audio.mission();
    level.bus.emit('missionDone', m);
    level.netEv('md', m.slotIndex, m.reward, m.type);
    const count = Math.round(m.horde * ((level.country && level.country.difficulty.counts) || 1));
    if (this.pendingHorde) this.pendingHorde.count += count;
    else this.pendingHorde = { t: 5, count };
    level.bus.emit('hordeWarning', 5);
  }

  // цивільні з хліва (порятунок) — як і раніше
  spawnCivilians() {
    const { x, z } = this.L.rescue;
    const kinds = ['medic', 'granny', 'kid'];
    kinds.forEach((kind, i) => {
      const rig = makeCivilian(kind, this.level.rng);
      const cx = x - 1.5 + i * 1.5, cz = z + 0.5;
      rig.group.position.set(cx, this.level.world.groundH(cx, cz), cz);
      this.level.scene.add(rig.group);
      this.civilians.push({
        rig, kind, x: cx, z: cz,
        state: 'exit', exitT: 0,
        angle: (i / 3) * Math.PI * 2,
        cheerT: 2.5,
      });
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
        const ox = Math.cos(c.angle) * 2.6;
        const oz = Math.sin(c.angle) * 2.6;
        let fp = player.pos;
        if (level.players) {
          let bd = Infinity;
          for (const pl of level.players) {
            if (pl.health <= 0) continue;
            const dd = Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z);
            if (dd < bd) { bd = dd; fp = pl.pos; }
          }
        }
        tx = fp.x + ox;
        tz = fp.z + oz;
        const d = Math.hypot(tx - c.x, tz - c.z);
        if (d > 30) {
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
    const medic = this.civilians.find((c) => c.kind === 'medic');
    if (medic) {
      const patients = level.players || [{ pid: 1, pos: player.pos, health: player.health }];
      for (const pl of patients) {
        if (pl.health <= 0) continue;
        const d = Math.hypot(medic.x - pl.pos.x, medic.z - pl.pos.z);
        if (d >= 9) continue;
        if (pl.pid === 1) {
          if (player.health < player.maxHealth) {
            player.heal(3.2 * dt);
            this.healPulseT -= dt;
            if (this.healPulseT <= 0) {
              this.healPulseT = 1.1;
              const pp = player.pos;
              level.effects.burst(new THREE.Vector3(pp.x, pp.y + 1.6, pp.z), 0x6dff9c, 4, { speed: 0.8, up: 1.6, life: 0.7, size: 0.7 });
            }
          }
        } else if (level.net && level.net.authority) {
          // гостям шлемо лікування пачками раз на секунду
          pl._healAcc = (pl._healAcc || 0) + 3.2 * dt;
          if (pl._healAcc >= 3) {
            level.net.healPlayer(pl, Math.round(pl._healAcc * 10) / 10);
            pl._healAcc = 0;
          }
        }
      }
    }
  }

  _towerWave(n, onlyWalkers, site) {
    const level = this.level;
    const { x, z } = site || this.L.tower;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const type = onlyWalkers ? 'walker' : (i % 3 === 0 ? 'runner' : 'walker');
      const zb = level.zombies.spawn(type, x + Math.cos(a) * 22, z + Math.sin(a) * 22, { horde: false });
      zb.aggroed = true;
      zb.state = 'chase';
    }
    level.bus.emit('toast', '🧟 Зомбі почули шум — захищайся!');
  }

  // ---------- головний цикл ----------
  update(dt, input, allowControl) {
    if (this.mirror) { this._updateMirror(dt, input, allowControl); return; }
    const level = this.level;
    const player = level.player;
    const px = player.pos.x, pz = player.pos.z;
    this.prompt = null;

    for (const m of this.missions) {
      if (!m.beam) continue;
      m.beam.update(dt);
      // 🧭 маяк веде до НАСТУПНОЇ цілі місії, а не стоїть на місці
      const target = this._beamTarget(m);
      if (target) {
        const g = m.beam.group;
        const ty = this.level.world.groundH(target.x, target.z);
        g.position.x += (target.x - g.position.x) * Math.min(1, dt * 6);
        g.position.z += (target.z - g.position.z) * Math.min(1, dt * 6);
        g.position.y = ty;
      }
    }
    if (this.bossBeam) this.bossBeam.update(dt);

    // відкладена орда
    if (this.pendingHorde) {
      this.pendingHorde.t -= dt;
      if (this.pendingHorde.t <= 0) {
        level.zombies.startHorde(this.pendingHorde.count);
        level.audio.horde();
        level.bus.emit('hordeStart', this.pendingHorde.count);
        this.pendingHorde = null;
      }
    }
    // відкладена хвиля (ремонт/оборона)
    if (this.pendingWave) {
      this.pendingWave.t -= dt;
      if (this.pendingWave.t <= 0) {
        this._towerWave(this.pendingWave.n, this.pendingWave.onlyWalkers, this.pendingWave.site);
        this.pendingWave = null;
      }
    }

    for (const m of this.missions) {
      if (m.state !== 'active') continue;
      this['_up_' + m.type](m, dt, input, allowControl);
    }

    // усі місії виконані → арена боса
    if (!this.allDone && this.missions.every((m) => m.state === 'done')
      && !level.zombies.hordeActive && !this.pendingHorde) {
      this.allDone = true;
      this.bossUnlocked = true;
      this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
      level.audio.bossRoar();
      level.bus.emit('bossUnlocked');
    }
    if (this.bossUnlocked && !this.bossStarted) {
      const challengers = level.players || [{ pos: player.pos, health: player.health }];
      const inArena = challengers.some((p) => p.health > 0
        && Math.hypot(p.pos.x - this.L.arena.x, p.pos.z - this.L.arena.z) < this.L.arena.r - 4);
      if (inArena) {
        this.bossStarted = true;
        if (this.bossBeam) { this.bossBeam.remove(); this.bossBeam = null; }
        level.zombies.spawnBoss(this.bossHpLeft);
        level.audio.bossRoar();
        level.bus.emit('bossStart');
        level.netEv('bstart');
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

  // куди має стояти маяк місії просто зараз
  _beamTarget(m) {
    if (m.state !== 'active') return null;
    if (m.type === 'collect') {
      const next = m.crates.find((c) => !c.taken);
      return next ? { x: next.x, z: next.z } : null;
    }
    if (m.type === 'nests') {
      const next = m.nestList.find((n) => !n.cleared);
      return next ? { x: next.x, z: next.z } : null;
    }
    if (m.type === 'hunt') {
      const pool = this.mirror ? this.level.zombies.list.filter((e) => e.elite) : m.elites;
      const alive = pool.find((e) => e.state !== 'dead' && !e.gone);
      return alive ? { x: alive.x, z: alive.z } : null;
    }
    if (m.type === 'escort') {
      // до старту — на точці зустрічі; після — веде до вежі
      return m.started ? { x: m.dest.x, z: m.dest.z } : { x: m.site.x, z: m.site.z + 2 };
    }
    return null; // rescue/repair/clear/defense — маяк на місці
  }

  // ---------- апдейтери типів ----------
  _up_rescue(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (!m.opened) {
      const door = level.world.barnDoorCollider;
      const d = Math.hypot(player.pos.x - door.x, player.pos.z - (door.z - 1));
      if (d < 3.2) {
        this.prompt = { text: 'Натисни E — відчини хлів', hold: false };
        if (allowControl && input.pressed('KeyE')) {
          m.opened = true;
          m.openedT = 0;
          level.world.openBarn();
          level.audio.door();
          this.spawnCivilians();
          level.netEv('barn');
        }
      }
    } else {
      m.openedT += dt;
      if (m.openedT > 2.0) {
        this._complete(m.id);
        level.bus.emit('toast', 'Людей врятовано! Медик лікуватиме тебе поблизу 💚');
      }
    }
  }

  _up_repair(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const rp = level.world.repairPoint;
    const d = Math.hypot(player.pos.x - rp.x, player.pos.z - rp.z);
    // кооп: рахуємо всіх, хто тримає E біля вежі (разом — швидше!)
    let holders = 0;
    if (d < 3.6 && allowControl && input.down('KeyE')) holders++;
    if (level.players) {
      for (const pl of level.players) {
        if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
        if (Math.hypot(pl.pos.x - rp.x, pl.pos.z - rp.z) < 3.6) holders++;
      }
    }
    if (d < 3.6) {
      this.prompt = {
        text: m.progress > 0 ? 'Тримай E — ремонт' : 'Тримай E — почни ремонт',
        hold: true, progress: m.progress,
      };
    }
    if (d < 3.6 || holders > 0) {
      if (holders > 0) {
        m.progress = Math.min(1, m.progress + (dt * holders) / 12);
        m.tickT -= dt;
        if (m.tickT <= 0) {
          m.tickT = 0.35;
          level.audio.repairTick();
          const sp = new THREE.Vector3(rp.x, level.world.groundH(rp.x, rp.z) + 1, rp.z);
          level.effects.burst(sp, 0xffe066, 3, { speed: 1.6, up: 2.2, life: 0.3, size: 0.6 });
        }
        if (m.progress > 0.15 && !m.waves[0]) {
          m.waves[0] = true;
          this.pendingWave = { t: 2.5, n: 4, onlyWalkers: true, site: m.site };
          level.audio.horde();
          level.bus.emit('toast', '👂 Чуєш гарчання? Приготуйся! ⚠️');
        }
        if (m.progress > 0.55 && !m.waves[1]) {
          m.waves[1] = true;
          this.pendingWave = { t: 2.5, n: 5, onlyWalkers: false, site: m.site };
          level.audio.horde();
          level.bus.emit('toast', '👂 Ще одна хвиля наближається! ⚠️');
        }
        if (m.progress >= 1) {
          level.world.setTowerFixed();
          level.netEv('tower');
          this._complete(m.id);
          level.bus.emit('toast', 'Полагоджено! Сигнал надіслано 📡');
        }
      }
    }
  }

  _up_clear(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (!this.crateReady) {
      if (level.zombies.countAliveInZone('warehouse') === 0) {
        this.crateReady = true;
        level.bus.emit('toast', 'Склад зачищено! Відкрий ящик зі зброєю 📦');
      }
    } else if (m.crateOpenedT < 0) {
      const wc = level.world.weaponCrate;
      const d = Math.hypot(player.pos.x - wc.x, player.pos.z - wc.z);
      if (d < 3.4) {
        this.prompt = { text: 'Натисни E — відкрий ящик', hold: false };
        if (allowControl && input.pressed('KeyE')) {
          m.crateOpenedT = 0;
          level.world.openCrate();
          level.audio.door();
          level.netEv('crate');
        }
      }
    } else {
      m.crateOpenedT += dt;
      if (m.crateOpenedT > 0.9) {
        level.game.unlockWeapon(level.country.weaponReward);
        this._complete(m.id);
        level.bus.emit('toast', level.country.weaponRewardToast);
      }
    }
  }

  _up_collect(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    for (const c of m.crates) {
      if (c.taken) continue;
      c.mesh.position.y = c.y + Math.abs(Math.sin(performance.now() / 400 + c.x)) * 0.12;
      const d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      if (d < 3.4) {
        this.prompt = { text: `🧺 Натисни E — забери припаси (${m.found}/4)`, hold: false };
        if (allowControl && input.pressed('KeyE')) {
          c.taken = true;
          m.found++;
          level.scene.remove(c.mesh);
          level.netEv('sup', m.slotIndex, m.crates.indexOf(c), 1);
          level.audio.pickup();
          level.effects.burst(new THREE.Vector3(c.x, c.y + 0.8, c.z), 0x4cff7a, 8, { speed: 2.5, up: 3, life: 0.6 });
          level.bus.emit('toast', m.found < 4 ? `🧺 Ящик ${m.found}/4! Шукай наступний за маркером` : '🧺 Усі припаси зібрано!');
          if (m.found >= 4) this._complete(m.id);
        }
        break;
      }
    }
  }

  _up_defense(m, dt) {
    const level = this.level;
    const player = level.player;
    const defenders = level.players || [{ pos: player.pos, health: player.health }];
    const inZone = defenders.some((p) => p.health > 0
      && Math.hypot(p.pos.x - m.zone.x, p.pos.z - m.zone.z) < m.zone.r);
    m.zone.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.2;
    if (!m.started) {
      if (inZone) {
        m.started = true;
        level.bus.emit('toast', '🛡️ ОБОРОНА! Протримайся в зоні 45 секунд!');
        level.audio.horde();
        m.waveT = 1.5;
      }
      return;
    }
    // таймер іде лише в зоні — вийшов: пауза і підказка
    if (inZone) {
      m.timer -= dt;
      m.waveT -= dt;
      if (m.waveT <= 0) {
        m.waveT = 9;
        this._towerWave(3 + Math.round(2 * (1 - m.timer / 45)), m.timer > 25, m.site);
      }
      if (m.timer <= 0) {
        this._complete(m.id);
        level.bus.emit('toast', '🛡️ Зону втримано! Молодець!');
      }
    } else {
      this.prompt = { text: '🛡️ Повернись у синє коло — оборона на паузі!', hold: false };
    }
  }

  _up_hunt(m) {
    const level = this.level;
    const killed = m.elites.filter((e) => e.state === 'dead' || e.gone).length;
    if (killed !== m.killed) {
      m.killed = killed;
      if (m.killed < 3) {
        level.bus.emit('toast', `👹 Еліт переможено (${m.killed}/3)! Наступний — за маркером`);
        level.audio.mission();
      }
    }
    if (m.killed >= 3) {
      this._complete(m.id);
      level.bus.emit('toast', '👹 Усіх елітних переможено!');
    }
  }

  _up_nests(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    for (const n of m.nestList) {
      if (n.cleared) continue;
      n.pod.scale.y = 1.25 + Math.sin(performance.now() / 350 + n.x) * 0.07;
      const d = Math.hypot(player.pos.x - n.x, player.pos.z - n.z);
      let holders = 0;
      if (d < 3.8 && allowControl && input.down('KeyE')) holders++;
      if (level.players) {
        for (const pl of level.players) {
          if (pl.pid === 1 || pl.health <= 0 || !pl.holdE) continue;
          if (Math.hypot(pl.pos.x - n.x, pl.pos.z - n.z) < 3.8) holders++;
        }
      }
      if (d < 3.8) {
        this.prompt = { text: '🟣 Тримай E — знешкодь гніздо', hold: true, progress: n.progress };
      }
      if (d < 3.8 || holders > 0) {
        if (holders > 0) {
          n.progress = Math.min(1, n.progress + (dt * holders) / 4);
          if (Math.random() < dt * 6) {
            level.effects.burst(new THREE.Vector3(n.x, n.y + 1, n.z), 0xb06ee8, 2, { speed: 1.5, up: 2, life: 0.4, size: 0.7 });
          }
          if (n.progress >= 1) {
            n.cleared = true;
            m.cleared++;
            level.scene.remove(n.mesh);
            level.netEv('nest', m.slotIndex, m.nestList.indexOf(n));
            level.audio.shieldBreak();
            level.effects.burst(new THREE.Vector3(n.x, n.y + 1, n.z), 0x8d3bbd, 16, { speed: 4, up: 4, life: 0.8, size: 1.2 });
            level.bus.emit('toast', m.cleared < 3 ? `🟣 Гніздо знищено (${m.cleared}/3)!` : '🟣 Усі гнізда знищено!');
            if (m.cleared >= 3) this._complete(m.id);
          }
        } else {
          n.progress = Math.max(0, n.progress - dt * 0.5);
        }
        break;
      } else if (n.progress > 0) {
        n.progress = Math.max(0, n.progress - dt * 0.5);
      }
    }
  }

  _up_escort(m, dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    if (!m.started) {
      const d = Math.hypot(player.pos.x - m.site.x, player.pos.z - (m.site.z + 2));
      if (d < 5) {
        this.prompt = { text: '🧳 Натисни E — забери мандрівника', hold: false };
        if (allowControl && input.pressed('KeyE')) {
          m.started = true;
          this._spawnTraveler(m);
          this.pendingWave = { t: 3, n: 4, onlyWalkers: true, site: m.site };
        }
      }
      return;
    }
    const t = m.traveler;
    if (!t) return;
    // мандрівник іде за найближчим живим гравцем
    let fp = player.pos;
    if (level.players) {
      let bd = Infinity;
      for (const pl of level.players) {
        if (pl.health <= 0) continue;
        const dd = Math.hypot(pl.pos.x - t.x, pl.pos.z - t.z);
        if (dd < bd) { bd = dd; fp = pl.pos; }
      }
    }
    const tx = fp.x + 1.8, tz = fp.z + 1.2;
    const dx = tx - t.x, dz = tz - t.z;
    const d = Math.hypot(dx, dz);
    if (d > 30) { t.x = tx; t.z = tz; }
    const spd = d > 10 ? 5.4 : d > 1.6 ? 3.6 : 0;
    if (spd > 0) {
      t.x += (dx / d) * spd * dt;
      t.z += (dz / d) * spd * dt;
      t.rig.group.rotation.y = dampAngle(t.rig.group.rotation.y, Math.atan2(-dx, -dz), 8, dt);
      setAnim(t.rig, spd > 4 ? 'run' : 'walk');
      t.rig.anim.speed = spd;
    } else {
      setAnim(t.rig, 'idle');
    }
    const solved = level.world.collide(t.x, t.z, 0.4);
    t.x = solved.x; t.z = solved.z;
    t.rig.group.position.set(t.x, level.world.groundH(t.x, t.z), t.z);
    updateRig(t.rig, dt);
    // зомбі кусають мандрівника
    if (t.hurtCd > 0) t.hurtCd -= dt;
    for (const z of level.zombies.list) {
      if (z.state === 'dead' || !z.aggroed) continue;
      if (t.hurtCd <= 0 && Math.hypot(z.x - t.x, z.z - t.z) < 1.6) {
        t.hp -= 8;
        t.hurtCd = 1.2;
        level.effects.burst(new THREE.Vector3(t.x, 1.4, t.z), 0xff5d5d, 4, { speed: 2, up: 2, life: 0.4 });
        if (t.hp <= 35 && !m.midWarned) {
          m.midWarned = true;
          level.bus.emit('toast', '⚠️ Мандрівника кусають! Захисти його!');
        }
        if (t.hp <= 0) {
          // не караємо жорстко: мандрівник «ховається» і чекає на новий супровід
          level.scene.remove(t.rig.group);
          m.traveler = null;
          m.started = false;
          level.bus.emit('toast', '😿 Мандрівник сховався у хліві. Повернись по нього!');
          return;
        }
      }
    }
    // середина шляху — невелика засідка
    const half = Math.hypot(t.x - m.dest.x, t.z - m.dest.z);
    if (!m.midWave && half < Math.hypot(m.site.x - m.dest.x, m.site.z - m.dest.z) * 0.5) {
      m.midWave = true;
      this.pendingWave = { t: 1.5, n: 4, onlyWalkers: false, site: { x: t.x, z: t.z, r: 8 } };
    }
    // дійшли!
    if (Math.hypot(t.x - m.dest.x, t.z - m.dest.z) < m.dest.r) {
      setAnim(t.rig, 'cheer');
      this._complete(m.id);
      level.bus.emit('toast', '🧳 Мандрівник у безпеці! Дякує тобі від душі 💛');
      // лишається радіти біля вежі
      m.traveler = null;
    }
  }
  // ================= КООП =================
  // --- хост: інтеракції гостей (E) з перевіркою відстані ---
  useBarn(pid, near) {
    const m = this.missions.find((x) => x.type === 'rescue');
    if (!m || m.state !== 'active' || m.opened) return;
    const door = this.level.world.barnDoorCollider;
    if (!near(door.x, door.z - 1, 3.6)) return;
    m.opened = true;
    m.openedT = 0;
    this.level.world.openBarn();
    this.level.audio.door();
    this.spawnCivilians();
    this.level.netEv('barn');
  }

  useCrate(pid, near) {
    const m = this.missions.find((x) => x.type === 'clear');
    if (!m || m.state !== 'active' || !this.crateReady || m.crateOpenedT >= 0) return;
    const wc = this.level.world.weaponCrate;
    if (!near(wc.x, wc.z, 3.8)) return;
    m.crateOpenedT = 0;
    this.level.world.openCrate();
    this.level.audio.door();
    this.level.netEv('crate');
  }

  useSupply(pid, i, near) {
    const m = this.missions.find((x) => x.type === 'collect');
    if (!m || m.state !== 'active') return;
    const c = m.crates[i];
    if (!c || c.taken || !near(c.x, c.z, 3.8)) return;
    c.taken = true;
    m.found++;
    this.level.scene.remove(c.mesh);
    this.level.netEv('sup', m.slotIndex, i, pid);
    this.level.audio.pickup();
    this.level.effects.burst(new THREE.Vector3(c.x, c.y + 0.8, c.z), 0x4cff7a, 8, { speed: 2.5, up: 3, life: 0.6 });
    this.level.bus.emit('toast', m.found < 4 ? `🧺 Ящик ${m.found}/4!` : '🧺 Усі припаси зібрано!');
    if (m.found >= 4) this._complete(m.id);
  }

  useEscort(pid, near) {
    const m = this.missions.find((x) => x.type === 'escort');
    if (!m || m.state !== 'active' || m.started) return;
    if (!near(m.site.x, m.site.z + 2, 5)) return;
    m.started = true;
    this._spawnTraveler(m);
    this.pendingWave = { t: 3, n: 4, onlyWalkers: true, site: m.site };
    this.level.netEv('esc', 1);
  }

  // --- хост: стан місій для снапшота ---
  netState() {
    const out = {
      g: [this.allDone ? 1 : 0, this.bossUnlocked ? 1 : 0, this.bossStarted ? 1 : 0],
      s: [],
      c: this.civilians.map((c) => [
        Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10,
        c.rig.anim.mode === 'run' ? 2 : c.rig.anim.mode === 'walk' ? 1 : c.rig.anim.mode === 'cheer' ? 3 : 0,
      ]),
      t: 0,
    };
    for (const m of this.missions) {
      const a = [m.state === 'done' ? 1 : 0];
      if (m.type === 'rescue') a.push(m.opened ? 1 : 0);
      else if (m.type === 'repair') a.push(Math.round(m.progress * 100) / 100);
      else if (m.type === 'clear') a.push(this.crateReady ? 1 : 0);
      else if (m.type === 'collect') a.push(m.found);
      else if (m.type === 'defense') a.push(m.started ? 1 : 0, Math.round(m.timer * 10) / 10);
      else if (m.type === 'hunt') a.push(m.killed);
      else if (m.type === 'nests') {
        a.push(m.cleared);
        for (const n of m.nestList) a.push(Math.round(n.progress * 100) / 100);
      } else if (m.type === 'escort') a.push(m.started ? 1 : 0);
      out.s.push(a);
    }
    const esc = this.missions.find((x) => x.type === 'escort');
    if (esc && esc.traveler) {
      out.t = [Math.round(esc.traveler.x * 10) / 10, Math.round(esc.traveler.z * 10) / 10, esc.traveler.hp];
    }
    return out;
  }

  // повний стан для гостя, що приєднався
  netFullState() {
    const out = this.netState();
    for (const m of this.missions) {
      if (m.type === 'collect') out.sup = m.crates.map((c) => (c.taken ? 1 : 0));
      if (m.type === 'nests') out.nst = m.nestList.map((n) => (n.cleared ? 1 : 0));
    }
    return out;
  }

  // --- гість: застосувати стан зі снапшота ---
  applyNet(ms) {
    const level = this.level;
    const wasUnlocked = this.bossUnlocked;
    this.allDone = !!ms.g[0];
    this.bossUnlocked = !!ms.g[1];
    this.bossStarted = !!ms.g[2];
    if (!wasUnlocked && this.bossUnlocked && !this.bossStarted && !this.bossBeam) {
      this.bossBeam = level.effects.makeBeam(this.L.arena.x, this.L.arena.z, 0xff44aa, '👑');
      level.audio.bossRoar();
      level.bus.emit('bossUnlocked');
    }
    if (this.bossStarted && this.bossBeam) { this.bossBeam.remove(); this.bossBeam = null; }
    ms.s.forEach((a, i) => {
      const m = this.missions[i];
      if (!m) return;
      if (m.type === 'rescue') m.opened = !!a[1];
      else if (m.type === 'repair') m.progress = a[1];
      else if (m.type === 'clear') this.crateReady = !!a[1];
      else if (m.type === 'collect') m.found = a[1];
      else if (m.type === 'defense') { m.started = !!a[1]; m.timer = a[2]; }
      else if (m.type === 'hunt') m.killed = a[1];
      else if (m.type === 'nests') {
        m.cleared = a[1];
        m.nestList.forEach((n, j) => { if (!n.cleared) n.progress = a[2 + j] || 0; });
      } else if (m.type === 'escort') {
        if (a[1] && !m.started) { m.started = true; if (!m.traveler) this._spawnTraveler(m); }
      }
    });
    // мандрівник: ціль для плавного руху
    const esc = this.missions.find((x) => x.type === 'escort');
    if (esc && esc.traveler && ms.t) {
      esc.traveler.netT = { x: ms.t[0], z: ms.t[1] };
      esc.traveler.hp = ms.t[2];
    }
    this._civNet = ms.c || [];
  }

  applyNetFull(ms) {
    this.applyNet(ms);
    ms.s.forEach((a, i) => {
      const m = this.missions[i];
      if (m && a[0] && m.state !== 'done') this.netMissionDone(i, 0, m.type, true);
    });
    const collect = this.missions.find((x) => x.type === 'collect');
    if (collect && ms.sup) {
      ms.sup.forEach((taken, i) => {
        if (taken && !collect.crates[i].taken) {
          collect.crates[i].taken = true;
          this.level.scene.remove(collect.crates[i].mesh);
        }
      });
    }
    const nests = this.missions.find((x) => x.type === 'nests');
    if (nests && ms.nst) {
      ms.nst.forEach((cl, i) => {
        if (cl && !nests.nestList[i].cleared) {
          nests.nestList[i].cleared = true;
          this.level.scene.remove(nests.nestList[i].mesh);
        }
      });
    }
    const rescue = this.missions.find((x) => x.type === 'rescue');
    if (rescue && rescue.opened) this.netBarnOpened(true);
  }

  // --- гість: дискретні події ---
  netBarnOpened(silent = false) {
    const m = this.missions.find((x) => x.type === 'rescue');
    if (m) m.opened = true;
    if (!this.civilians.length) this.spawnCivilians();
    if (!silent) this.level.bus.emit('toast', 'Людей врятовано! Медик лікуватиме вас поблизу 💚');
  }

  netSupplyTaken(slot, i, byPid) {
    const m = this.missions[slot];
    if (!m || m.type !== 'collect') return;
    const c = m.crates[i];
    if (!c || c.taken) return;
    c.taken = true;
    m.found = Math.max(m.found, m.crates.filter((x) => x.taken).length);
    this.level.scene.remove(c.mesh);
    this.level.audio.pickup();
    this.level.effects.burst(new THREE.Vector3(c.x, c.y + 0.8, c.z), 0x4cff7a, 8, { speed: 2.5, up: 3, life: 0.6 });
  }

  netNestCleared(slot, i) {
    const m = this.missions[slot];
    if (!m || m.type !== 'nests') return;
    const n = m.nestList[i];
    if (!n || n.cleared) return;
    n.cleared = true;
    m.cleared = m.nestList.filter((x) => x.cleared).length;
    this.level.scene.remove(n.mesh);
    this.level.audio.shieldBreak();
    this.level.effects.burst(new THREE.Vector3(n.x, n.y + 1, n.z), 0x8d3bbd, 16, { speed: 4, up: 4, life: 0.8, size: 1.2 });
  }

  netMissionDone(slot, reward, type, silent = false) {
    const m = this.missions[slot];
    if (!m || m.state === 'done') return;
    m.state = 'done';
    if (m.beam) { m.beam.remove(); m.beam = null; }
    if (m.zone) { this.level.scene.remove(m.zone.ring); m.zone = null; }
    if (!silent) {
      if (reward) this.level.addCoins(reward);
      this.level.audio.mission();
      this.level.bus.emit('missionDone', m);
      // нагорода країни за зачистку складу — усім гравцям
      if (type === 'clear') this.level.game.unlockWeapon(this.level.country.weaponReward);
    }
  }

  // --- гість: дзеркальний цикл — підказки, маяки, анімації ---
  _updateMirror(dt, input, allowControl) {
    const level = this.level;
    const player = level.player;
    const net = level.net;
    this.prompt = null;
    if (net) net.holdE = false;

    for (const m of this.missions) {
      if (m.beam) {
        m.beam.update(dt);
        const target = this._beamTarget(m);
        if (target) {
          const g = m.beam.group;
          const ty = level.world.groundH(target.x, target.z);
          g.position.x += (target.x - g.position.x) * Math.min(1, dt * 6);
          g.position.z += (target.z - g.position.z) * Math.min(1, dt * 6);
          g.position.y = ty;
        }
      }
    }
    if (this.bossBeam) this.bossBeam.update(dt);

    const near = (x, z, r) => Math.hypot(player.pos.x - x, player.pos.z - z) < r;
    const pressE = allowControl && input.pressed('KeyE');

    for (const m of this.missions) {
      if (m.state !== 'active') continue;
      if (m.type === 'rescue' && !m.opened) {
        const door = level.world.barnDoorCollider;
        if (near(door.x, door.z - 1, 3.2)) {
          this.prompt = { text: 'Натисни E — відчини хлів', hold: false };
          if (pressE) net.sendUse('barn');
        }
      } else if (m.type === 'repair') {
        const rp = level.world.repairPoint;
        if (near(rp.x, rp.z, 3.6)) {
          this.prompt = {
            text: m.progress > 0 ? 'Тримай E — ремонт' : 'Тримай E — почни ремонт',
            hold: true, progress: m.progress,
          };
          if (net) net.holdE = true;
        }
      } else if (m.type === 'clear') {
        if (this.crateReady) {
          const wc = level.world.weaponCrate;
          if (near(wc.x, wc.z, 3.4)) {
            this.prompt = { text: 'Натисни E — відкрий ящик', hold: false };
            if (pressE) net.sendUse('crate');
          }
        }
      } else if (m.type === 'collect') {
        for (let i = 0; i < m.crates.length; i++) {
          const c = m.crates[i];
          if (c.taken) continue;
          c.mesh.position.y = c.y + Math.abs(Math.sin(performance.now() / 400 + c.x)) * 0.12;
          if (near(c.x, c.z, 3.4)) {
            this.prompt = { text: `🧺 Натисни E — забери припаси (${m.found}/4)`, hold: false };
            if (pressE) net.sendUse('supply', { i });
            break;
          }
        }
      } else if (m.type === 'defense') {
        m.zone.ring.material.opacity = 0.35 + Math.sin(performance.now() / 300) * 0.2;
        if (m.started && !near(m.zone.x, m.zone.z, m.zone.r)) {
          this.prompt = { text: '🛡️ Повернись у синє коло — тримайте оборону!', hold: false };
        }
      } else if (m.type === 'nests') {
        for (const n of m.nestList) {
          if (n.cleared) continue;
          n.pod.scale.y = 1.25 + Math.sin(performance.now() / 350 + n.x) * 0.07;
          if (near(n.x, n.z, 3.8)) {
            this.prompt = { text: '🟣 Тримай E — знешкодь гніздо', hold: true, progress: n.progress };
            if (net) net.holdE = true;
            break;
          }
        }
      } else if (m.type === 'escort' && !m.started) {
        if (near(m.site.x, m.site.z + 2, 5)) {
          this.prompt = { text: '🧳 Натисни E — забери мандрівника', hold: false };
          if (pressE) net.sendUse('escort');
        }
      }
    }

    // цивільні: плавно до цілей зі снапшота
    if (this._civNet && this.civilians.length) {
      this.civilians.forEach((c, i) => {
        const t = this._civNet[i];
        if (!t) return;
        const dx = t[0] - c.x, dz = t[1] - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 12) { c.x = t[0]; c.z = t[1]; }
        else { c.x += dx * Math.min(1, dt * 8); c.z += dz * Math.min(1, dt * 8); }
        if (d > 0.2) c.rig.group.rotation.y = Math.atan2(-dx, -dz);
        setAnim(c.rig, ['idle', 'walk', 'run', 'cheer'][t[2]] || 'idle');
        if (t[2] === 1 || t[2] === 2) c.rig.anim.speed = t[2] === 2 ? 5 : 3.4;
        c.rig.group.position.set(c.x, level.world.groundH(c.x, c.z), c.z);
        updateRig(c.rig, dt);
      });
      // медик лікує і гостя — локально, як у соло
      const medic = this.civilians.find((c) => c.kind === 'medic');
      if (medic && player.health > 0 && player.health < player.maxHealth) {
        if (Math.hypot(medic.x - player.pos.x, medic.z - player.pos.z) < 9) {
          player.heal(3.2 * dt);
        }
      }
    }

    // мандрівник
    const esc = this.missions.find((x) => x.type === 'escort');
    if (esc && esc.traveler && esc.traveler.netT) {
      const t = esc.traveler;
      const dx = t.netT.x - t.x, dz = t.netT.z - t.z;
      const d = Math.hypot(dx, dz);
      if (d > 12) { t.x = t.netT.x; t.z = t.netT.z; }
      else { t.x += dx * Math.min(1, dt * 8); t.z += dz * Math.min(1, dt * 8); }
      if (d > 0.3) {
        t.rig.group.rotation.y = Math.atan2(-dx, -dz);
        setAnim(t.rig, d > 1.5 ? 'run' : 'walk');
        t.rig.anim.speed = d > 1.5 ? 5 : 3.4;
      } else {
        setAnim(t.rig, 'idle');
      }
      t.rig.group.position.set(t.x, level.world.groundH(t.x, t.z), t.z);
      updateRig(t.rig, dt);
    }
  }
}
