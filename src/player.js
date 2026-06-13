// Гравець: рух, камера FP/TP, зброя, стрільба, броня, бафи
import * as THREE from 'three';
import { makeHero, makeGunMesh, makeFPArms, attachHeroGear, updateRig, setAnim, bakeGroupMeshes } from './characters.js';

import { clamp, damp, lerp } from './utils.js';

export const WEAPONS = {
  pistol: { name: 'Пістолет', icon: '🔫', dmg: 34, rpm: 320, mag: 12, spread: 0.012, auto: false, reloadT: 1.0, recoil: 0.028, infinite: true },
  rifle: { name: 'Автомат', icon: '🔥', dmg: 21, rpm: 620, mag: 30, spread: 0.02, auto: true, reloadT: 1.5, recoil: 0.013, infinite: false, reserve: 120, cap: 240 },
  shotgun: { name: 'Дробовик', icon: '💥', dmg: 17, rpm: 95, mag: 6, spread: 0.055, auto: false, reloadT: 2.0, recoil: 0.05, infinite: false, pellets: 7, reserve: 24, cap: 60 },
  smg: { name: 'Швидкостріл', icon: '🌀', dmg: 13, rpm: 920, mag: 40, spread: 0.034, auto: true, reloadT: 1.2, recoil: 0.008, infinite: false, reserve: 160, cap: 320 },
  magnum: { name: 'Магнум', icon: '🤠', dmg: 60, rpm: 140, mag: 6, spread: 0.006, auto: false, reloadT: 1.6, recoil: 0.05, infinite: false, reserve: 18, cap: 48 },
  sniper: { name: 'Снайперка', icon: '🎯', dmg: 120, rpm: 42, mag: 5, spread: 0.001, auto: false, reloadT: 2.2, recoil: 0.07, infinite: false, pierce: 3, reserve: 10, cap: 30 },
  bazooka: { name: 'Базука', icon: '🚀', dmg: 220, rpm: 30, mag: 1, spread: 0.004, auto: false, reloadT: 2.5, recoil: 0.09, infinite: false, rocket: true, reserve: 0, cap: 9 },
};
export const WEAPON_SLOTS = ['pistol', 'rifle', 'shotgun', 'smg', 'magnum', 'sniper', 'bazooka'];
const SLOT_KEYS = { Digit1: 'pistol', Digit2: 'rifle', Digit3: 'shotgun', Digit4: 'smg', Digit5: 'magnum', Digit6: 'sniper', Digit7: 'bazooka' };

export class Player {
  constructor(level) {
    this.level = level;
    const { scene, world } = level;
    this.world = world;
    this.L = world.layout;

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 1200);
    scene.add(this.camera);

    const gy = world.groundH(this.L.SPAWN.x, this.L.SPAWN.z);
    this.pos = new THREE.Vector3(this.L.SPAWN.x, gy, this.L.SPAWN.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0; // дивимось на північ (-Z), до села
    this.pitch = 0;
    this.onGround = true;

    this.maxHealth = 100;
    this.health = 100;
    this.speedMult = 1;
    this.damageMult = 1;
    this.respawnProtect = 0;
    // броня: поглинає 60% шкоди, поки є
    this.armor = 0;
    this.maxArmor = 50;
    this.helmetMult = 1; // шолом: множник вхідної шкоди
    this.jumpPower = 7.6;
    this.gearAttached = {};
    // тимчасові бафи (секунди, що лишились)
    this.buffs = { speed: 0, rage: 0, bubble: 0, magnet: 0 };
    this.gadgetShield = 0; // 🛡️ гаджет-щит: поглинає шкоду повністю, поки не розіб'ється

    // 💃 емоції-танці та 🛴 їзда на самокаті
    this.emoting = null;
    this._emoteWasFP = true;
    this._danceSpin = 0;
    this.riding = null;
    this.rideSpeed = 0;   // 🛴 поточна швидкість самоката (м/с, мінус — задній хід)
    this._rideSteer = 0;  // плавний нахил керма для анімації
    this.scoped = false; // 🔭 оптика снайперки (ПКМ або кнопка)

    this.weapons = ['pistol'];
    this.cur = 'pistol';
    this.ammo = {};
    for (const w of WEAPON_SLOTS) {
      this.ammo[w] = { mag: WEAPONS[w].mag, reserve: WEAPONS[w].infinite ? Infinity : WEAPONS[w].reserve };
    }
    this.grenades = 2;
    this.grenadeCd = 0;
    this.stepT = 0;
    this._clickBuffer = 0;
    this.shootCd = 0;
    this.reloading = 0;
    this.firstPerson = true;

    // герой для виду від 3-ї особи (з обраним скіном)
    this.rig = makeHero((level.game && level.game.save.activeSkin) || 'classic');
    scene.add(this.rig.group);
    this.tpGuns = {};
    for (const w of WEAPON_SLOTS) {
      const gun = makeGunMesh(w);
      bakeGroupMeshes(gun.group, { outline: 0.012 }); // контур + 1 draw call
      gun.group.rotation.x = -Math.PI / 2; // у руці: ствол уздовж -Y руки
      gun.group.position.set(0, -0.62, -0.05);
      gun.group.scale.setScalar(1.35); // більший — щоб читався з-за спини
      this.rig.parts.armR.add(gun.group);
      gun.group.visible = false;
      this.tpGuns[w] = gun;
    }

    // руки від 1-ї особи
    this.weaponRoot = new THREE.Group();
    this.camera.add(this.weaponRoot);
    this.fpArms = {};
    for (const w of WEAPON_SLOTS) {
      const arms = makeFPArms(w);
      arms.group.visible = false;
      this.weaponRoot.add(arms.group);
      this.fpArms[w] = arms;
    }
    this.weaponBase = new THREE.Vector3(0.27, -0.26, -0.58);
    this.weaponRoot.position.copy(this.weaponBase);
    this.weaponRoot.scale.setScalar(0.85);
    this._shootOrigin = new THREE.Vector3();
    this._shootDir = new THREE.Vector3();
    this._shootEnd = new THREE.Vector3();
    this._muzzlePos = new THREE.Vector3();

    // 🔦 ліхтарик (вмикається вночі сам — setLamp із циклу день/ніч)
    this.lamp = new THREE.SpotLight(0xfff0c2, 0, 30, 0.52, 0.5, 1.1);
    this.lamp.position.set(0, 0.15, 0.1);
    this.camera.add(this.lamp);
    this.lamp.target.position.set(0, -0.12, -12);
    this.camera.add(this.lamp.target);

    this.bobPhase = 0;
    this.bobAmp = 0;
    this.gunKick = 0;
    this.camShake = 0;
    this.fovTarget = 75;
    this._camPos = new THREE.Vector3();
    this._camO = new THREE.Vector3();
    this._camD = new THREE.Vector3();
    this._camInit = false;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this._applyView();
  }

  // 🔦 яскравість ліхтарика від глибини ночі
  setLamp(nightK) {
    this.lamp.intensity = nightK * 42;
  }

  get weapon() { return WEAPONS[this.cur]; }
  get curAmmo() { return this.ammo[this.cur]; }

  forwardVec(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  _applyView() {
    this.rig.group.visible = !this.firstPerson;
    for (const w of WEAPON_SLOTS) {
      this.fpArms[w].group.visible = this.firstPerson && w === this.cur;
      this.tpGuns[w].group.visible = !this.firstPerson && w === this.cur;
    }
  }

  switchWeapon(w) {
    if (!this.weapons.includes(w) || this.cur === w) return;
    this.cur = w;
    this.reloading = 0;
    this.scoped = false;
    this.shootCd = Math.max(this.shootCd, 0.25);
    this._applyView();
    this.level.audio.click();
  }

  giveWeapon(id, switchTo = true) {
    if (!WEAPONS[id] || this.weapons.includes(id)) return;
    this.weapons.push(id);
    if (switchTo) this.switchWeapon(id);
  }

  giveRifle() { this.giveWeapon('rifle'); }

  throwGrenade() {
    if (this.grenades <= 0 || this.grenadeCd > 0 || this.health <= 0) return false;
    this.grenades--;
    this.grenadeCd = 0.9;
    const dir = this.forwardVec(new THREE.Vector3());
    const pos = this.camera.position.clone().addScaledVector(dir, 0.6);
    const vel = dir.multiplyScalar(11.5);
    vel.y += 4.5;
    if (this.level.mirror) this.level.net.sendNade(pos, vel);
    else if (this.level.net) this.level.net.spawnNetGrenade(pos, vel);
    else this.level.effects.spawnGrenade(pos, vel);
    this.level.audio.throwWhoosh(1);
    this.gunKick = 0.6;
    return true;
  }

  addAmmo(n) {
    // патрони для всієї вогнепальної зброї пропорційно (ракети — окремо)
    const ratio = { rifle: 1, smg: 1.4, shotgun: 1 / 7.5, magnum: 1 / 6, sniper: 1 / 10 };
    for (const [w, k] of Object.entries(ratio)) {
      this.ammo[w].reserve = Math.min(WEAPONS[w].cap, this.ammo[w].reserve + Math.ceil(n * k));
    }
  }

  addRockets(n) {
    this.ammo.bazooka.reserve = Math.min(WEAPONS.bazooka.cap, this.ammo.bazooka.reserve + n);
  }

  // куплене спорядження: ефекти + видимі речі на герої (3-тя особа)
  applyGear(upgrades) {
    const vest = upgrades.vest || 0;
    this.maxArmor = 50 + vest * 50;
    this.helmetMult = upgrades.helmet ? 0.85 : 1;
    this.jumpPower = upgrades.sneakers ? 8.6 : 7.6;
    for (const kind of ['vest', 'helmet', 'sneakers']) {
      if ((upgrades[kind] || 0) > 0 && !this.gearAttached[kind]) {
        attachHeroGear(this.rig, kind);
        this.gearAttached[kind] = true;
      }
    }
  }

  addArmor(n) {
    if (this.armor >= this.maxArmor) return false;
    this.armor = Math.min(this.maxArmor, this.armor + n);
    return true;
  }

  // 💃 станцювати поточний обраний танець (N)
  emote() {
    if (this.emoting || this.riding || this.health <= 0 || !this.onGround) return false;
    this.emoting = (this.level.game && this.level.game.save.activeDance) || 'shuffle';
    this._emoteWasFP = this.firstPerson;
    this._danceSpin = 0;
    this.firstPerson = false;
    this._applyView();
    this.rig.anim.danceStyle = this.emoting;
    setAnim(this.rig, 'dance');
    this.level.audio.dance();
    this.level.effects.burst(
      this.pos.clone().setY(this.pos.y + 1.5),
      [0xffd23f, 0xff5d8c, 0x4fd8ff][Math.floor(Math.random() * 3)], 14,
      { speed: 3, up: 3, life: 0.9, size: 1.1 }
    );
    this.level.bus.emit('dance');
    return true;
  }

  stopEmote() {
    if (!this.emoting) return;
    this.emoting = null;
    if (this._emoteWasFP) {
      this.firstPerson = true;
      this._applyView();
    }
  }

  startReload() {
    const a = this.curAmmo;
    const w = this.weapon;
    if (this.reloading > 0 || a.mag >= w.mag || (!w.infinite && a.reserve <= 0)) return;
    this.reloading = w.reloadT;
    this.level.audio.reload(this.cur);
  }

  update(dt, input, allowControl) {
    const world = this.world;
    if (this.respawnProtect > 0) this.respawnProtect -= dt;

    // --- 🔭 оптика снайперки ---
    const wantScope = (input.rmbDown || input.touchScope)
      && this.cur === 'sniper' && this.firstPerson
      && this.reloading <= 0 && !this.emoting && !this.riding && this.health > 0;
    if (wantScope !== this.scoped) {
      this.scoped = wantScope;
      this.level.audio.click();
      // у приціл не видно власної гвинтівки
      this.fpArms.sniper.group.visible = this.firstPerson && this.cur === 'sniper' && !this.scoped;
    }

    // --- огляд ---
    if (allowControl) {
      const { dx, dy } = input.consumeMouse();
      const sens = this.scoped ? 0.0008 : 0.0023; // в оптиці рухи плавніші
      if (!this.riding) this.yaw -= dx * sens; // на самокаті кермо — тільки A/D
      this.pitch = clamp(this.pitch - dy * sens, -1.45, 1.45);
    } else {
      input.consumeMouse();
    }

    // --- рух ---
    let mx = 0, mz = 0;
    if (allowControl) {
      if (input.down('KeyW')) mz -= 1;
      if (input.down('KeyS')) mz += 1;
      if (input.down('KeyA')) mx -= 1;
      if (input.down('KeyD')) mx += 1;
      // віртуальний джойстик (мобільні)
      if (input.touchMove && (input.touchMove.x !== 0 || input.touchMove.z !== 0)) {
        mx += input.touchMove.x;
        mz += input.touchMove.z;
      }
    }
    // бафи згасають
    for (const k in this.buffs) {
      if (this.buffs[k] > 0) this.buffs[k] -= dt;
    }

    const moving = (Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05);
    const sprint = !this.riding && moving && (input.down('ShiftLeft') || input.down('ShiftRight') || input.touchSprint);
    if (this.riding) {
      // 🛴 фізика самоката: W — газ, S — гальмо/назад, A/D — кермо. Вбік не ковзає!
      const gas = -mz;       // W = вперед
      const steer = -mx;     // A = ліворуч
      if (gas > 0.05) this.rideSpeed = Math.min(12.5, this.rideSpeed + 9.5 * dt);
      else if (gas < -0.05) this.rideSpeed = Math.max(-3.5, this.rideSpeed - 13 * dt);
      else this.rideSpeed = Math.abs(this.rideSpeed) < 0.25 ? 0 : this.rideSpeed - Math.sign(this.rideSpeed) * 5.5 * dt;
      // кермо працює тільки в русі (як справжнє), на задньому ході — навпаки
      const turnK = Math.min(1, Math.abs(this.rideSpeed) / 4.5) * (this.rideSpeed >= 0 ? 1 : -1);
      this.yaw += steer * 1.75 * dt * turnK;
      this._rideSteer = damp(this._rideSteer, steer * Math.min(1, Math.abs(this.rideSpeed) / 3), 7, dt);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      this.vel.x = fx * this.rideSpeed;
      this.vel.z = fz * this.rideSpeed;
    } else {
      this.rideSpeed = 0;
      this._rideSteer = damp(this._rideSteer, 0, 7, dt);
      const buffSpeed = this.buffs.speed > 0 ? 1.45 : 1;
      const speed = 5.6 * this.speedMult * buffSpeed * (sprint ? 1.55 : 1);
      let tx = 0, tz = 0;
      if (moving) {
        const len = Math.max(1, Math.hypot(mx, mz));
        mx /= len; mz /= len;
        // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        tx = (fx * -mz + rx * mx) * speed;
        tz = (fz * -mz + rz * mx) * speed;
      }
      // лід: на замерзлому озері керування "пливе" — ковзаємо за інерцією
      const ice = this.world.iceZone;
      const onIce = this.onGround && ice
        && Math.hypot(this.pos.x - ice.x, this.pos.z - ice.z) < ice.r;
      const accel = this.onGround ? (onIce ? 2.3 : 14) : 4;
      this.vel.x = damp(this.vel.x, tx, accel, dt);
      this.vel.z = damp(this.vel.z, tz, accel, dt);
    }

    // стрибок і гравітація
    if (allowControl && input.pressed('Space') && this.onGround) {
      this.vel.y = this.jumpPower;
      this.onGround = false;
    }
    this.vel.y -= 21 * dt;
    const preSlopeX = this.pos.x, preSlopeZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // 🏔️ чесні схили: пішки у відвісну кручу не зайти (стрибком на уступ — можна).
    // Межа ~55°; перевіряємо лише на картах із великим рельєфом
    if (world._terrainMod && this.onGround) {
      const gh0 = world.groundH(preSlopeX, preSlopeZ);
      const allow = (ax, az) =>
        world.groundH(ax, az) - gh0 <= Math.hypot(ax - preSlopeX, az - preSlopeZ) * 1.45 + 0.3;
      if (!allow(this.pos.x, this.pos.z)) {
        if (allow(this.pos.x, preSlopeZ)) this.pos.z = preSlopeZ;
        else if (allow(preSlopeX, this.pos.z)) this.pos.x = preSlopeX;
        else { this.pos.x = preSlopeX; this.pos.z = preSlopeZ; }
      }
    }

    const gh = Math.max(world.groundH(this.pos.x, this.pos.z), world.floorAt(this.pos.x, this.pos.z, this.pos.y));
    if (this.pos.y <= gh) {
      this.pos.y = gh;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > gh + 0.05) {
      this.onGround = false;
    }
    const preX = this.pos.x, preZ = this.pos.z;
    const solved = world.collide(this.pos.x, this.pos.z, 0.45, this.pos.y);
    this.pos.x = solved.x;
    this.pos.z = solved.z;
    // 🛴 врізались у перешкоду — самокат різко гальмує
    if (this.riding && Math.hypot(solved.x - preX, solved.z - preZ) > 0.04) {
      this.rideSpeed *= 0.35;
    }

    // --- батути ---
    for (const jp of world.jumpPads) {
      if (jp.cd > 0) jp.cd -= dt;
      if (this.onGround && jp.cd <= 0
        && Math.hypot(this.pos.x - jp.x, this.pos.z - jp.z) < 1.35
        && Math.abs(this.pos.y - (jp.y !== undefined ? jp.y : this.pos.y)) < 2.2) {
        this.vel.y = jp.power;
        this.onGround = false;
        jp.cd = 0.6;
        this.level.audio.boing();
        this.level.effects.burst(
          new THREE.Vector3(jp.x, this.pos.y + 0.3, jp.z), 0x6fc3ff, 8,
          { speed: 3, up: 4, life: 0.5 }
        );
      }
    }

    // --- перемикання ---
    if (allowControl) {
      for (const [code, w] of Object.entries(SLOT_KEYS)) {
        if (input.pressed(code)) this.switchWeapon(w);
      }
      if (input.pressed('KeyQ')) {
        // швидке перемикання по колу
        const have = this.weapons;
        const next = have[(have.indexOf(this.cur) + 1) % have.length];
        this.switchWeapon(next);
      }
      if (input.pressed('KeyV')) {
        this.firstPerson = !this.firstPerson;
        this._applyView();
      }
      if (input.pressed('KeyR')) this.startReload();
      if (input.pressed('KeyG')) this.throwGrenade();
      if (input.pressed('KeyN')) {
        if (this.emoting) this.stopEmote();
        else this.emote();
      }
    }
    // рух, постріл або стрибок скасовують танець
    if (this.emoting && (moving || input.justClicked || input.pressed('Space'))) this.stopEmote();
    if (this.grenadeCd > 0) this.grenadeCd -= dt;

    // --- перезарядка ---
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const a = this.curAmmo;
        const w = this.weapon;
        const need = w.mag - a.mag;
        if (w.infinite) a.mag = w.mag;
        else {
          const take = Math.min(need, a.reserve);
          a.mag += take;
          a.reserve -= take;
        }
        this.reloading = 0;
      }
    }

    // --- стрільба ---
    this.shootCd -= dt;
    // буфер кліку: якщо клікнули на мить раніше, ніж минув кулдаун — постріл не губиться
    if (input.justClicked) this._clickBuffer = 0.3;
    else if (this._clickBuffer > 0) this._clickBuffer -= dt;
    if (allowControl && this.reloading <= 0 && !this.emoting) {
      const w = this.weapon;
      const trigger = w.auto ? input.mouseDown : (input.justClicked || this._clickBuffer > 0);
      if (trigger && this.shootCd <= 0) {
        this._clickBuffer = 0;
        if (this.curAmmo.mag > 0) this._shoot();
        else {
          this.level.audio.empty();
          this.shootCd = 0.35;
          this.startReload();
        }
      }
    }

    // --- кроки ---
    const hSpeed0 = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hSpeed0 > 1.5) {
      this.stepT -= dt * hSpeed0;
      if (this.stepT <= 0) {
        this.stepT = 3.1;
        this.level.audio.step();
      }
    } else {
      this.stepT = Math.min(this.stepT, 1.2);
    }

    // --- анімація і камера ---
    const hSpeed = hSpeed0;
    this.bobAmp = damp(this.bobAmp, this.onGround ? Math.min(1, hSpeed / 5) : 0, 8, dt);
    this.bobPhase += dt * (4 + hSpeed * 1.15);
    this.gunKick = Math.max(0, this.gunKick - dt * 7);
    this.camShake = Math.max(0, this.camShake - dt * 3);
    this.fovTarget = this.scoped ? 24 : sprint ? 82 : 75;
    this.camera.fov = damp(this.camera.fov, this.fovTarget, 8, dt);
    this.camera.updateProjectionMatrix();

    this._updateCamera(dt, hSpeed);
    this._updateRigs(dt, hSpeed, moving, sprint);
  }

  _updateCamera(dt, hSpeed) {
    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    if (this.firstPerson) {
      const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmp;
      const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmp;
      cam.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.pos.y + 1.62 + bobY, this.pos.z - bobX * Math.sin(this.yaw));
      cam.rotation.set(this.pitch, this.yaw, 0);
      this._camInit = false;
      // зброя: боб + віддача
      this.weaponRoot.position.set(
        this.weaponBase.x + Math.cos(this.bobPhase) * 0.013 * this.bobAmp,
        this.weaponBase.y + Math.abs(Math.sin(this.bobPhase)) * 0.018 * this.bobAmp - (this.reloading > 0 ? 0.16 : 0),
        this.weaponBase.z + this.gunKick * 0.09
      );
      this.weaponRoot.rotation.set(
        this.gunKick * 0.16 + (this.reloading > 0 ? -0.5 : 0),
        0.06, Math.sin(this.bobPhase) * 0.008 * this.bobAmp
      );
    } else {
      // третя особа: орбітальна камера за спиною
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const fx = -Math.sin(this.yaw) * cp, fy = sp, fz = -Math.cos(this.yaw) * cp;
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const pivotX = this.pos.x + rx * 0.55;
      const pivotY = this.pos.y + 1.6;
      const pivotZ = this.pos.z + rz * 0.55;
      const dist = 4.4;
      let cx = pivotX - fx * dist;
      let cy = pivotY - fy * dist + 0.25;
      let cz = pivotZ - fz * dist;
      // кламп: камера не пролазить крізь стіни/дерева (важливо в приміщеннях)
      const ddx = cx - pivotX, ddy = cy - pivotY, ddz = cz - pivotZ;
      const dLen = Math.hypot(ddx, ddy, ddz);
      this._camO.set(pivotX, pivotY, pivotZ);
      this._camD.set(ddx / dLen, ddy / dLen, ddz / dLen);
      const blockT = this.world.shotBlockDist(this._camO, this._camD, dLen + 0.3);
      if (blockT < dLen) {
        const t = Math.max(0.6, blockT - 0.35);
        cx = pivotX + this._camD.x * t;
        cy = pivotY + this._camD.y * t;
        cz = pivotZ + this._camD.z * t;
      }
      const minY = this.world.groundH(cx, cz) + 0.35;
      if (cy < minY) cy = minY;
      if (!this._camInit) {
        this._camPos.set(cx, cy, cz);
        this._camInit = true;
      } else {
        this._camPos.x = damp(this._camPos.x, cx, 22, dt);
        this._camPos.y = damp(this._camPos.y, cy, 22, dt);
        this._camPos.z = damp(this._camPos.z, cz, 22, dt);
      }
      cam.position.copy(this._camPos);
      cam.rotation.set(this.pitch, this.yaw, 0);
    }
    if (this.camShake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.camShake * 0.14;
      cam.position.y += (Math.random() - 0.5) * this.camShake * 0.14;
    }
  }

  _updateRigs(dt, hSpeed, moving, sprint) {
    if (!this.firstPerson) {
      this.rig.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      if (this.riding) {
        // 🛴 стоїть на дошці, руки на кермі, нахил у поворот
        this.rig.group.rotation.y = this.yaw;
        this.rig.anim.steer = this._rideSteer;
        setAnim(this.rig, 'ride');
        updateRig(this.rig, dt);
        return;
      }
      if (this.emoting) {
        // 💃 танець: «Дзиґа» крутиться всім тілом
        if (this.emoting === 'spin') this._danceSpin += dt * 7;
        this.rig.group.rotation.y = this.yaw + this._danceSpin;
        this.rig.anim.danceStyle = this.emoting;
        setAnim(this.rig, 'dance');
      } else {
        this.rig.group.rotation.y = this.yaw;
        setAnim(this.rig, 'aim');
        this.rig.anim.speed = hSpeed;
        this.rig.anim.aimPitch = this.pitch;
      }
      updateRig(this.rig, dt);
    }
  }

  _shoot() {
    const w = this.weapon;
    const a = this.curAmmo;
    const level = this.level;
    a.mag--;
    this.shootCd = 60 / w.rpm;
    this.gunKick = 1;
    level.audio.shot(this.cur);
    level.stats.shotsFired++;
    const dmgMult = this.damageMult * (this.buffs.rage > 0 ? 2 : 1);
    // віддача підкидає приціл ПІСЛЯ пострілу — куля летить туди, куди цілився
    const applyRecoil = () => {
      this.pitch = clamp(this.pitch + w.recoil * (0.6 + Math.random() * 0.7), -1.45, 1.45);
      this.yaw += (Math.random() - 0.5) * w.recoil * 0.4;
    };

    const arms = this.firstPerson ? this.fpArms[this.cur] : this.tpGuns[this.cur];
    arms.muzzle.getWorldPosition(this._muzzlePos);
    level.effects.muzzleFlash(this._muzzlePos);

    // кооп: гість збирає влучання і шле хосту одним повідомленням
    const netHits = [];
    const netBar = [];
    const netWalls = [];
    let netBall = false;
    let netEnd = null;

    // точка пострілу: від 1-ї особи — поточні очі (камера оновлюється в кінці кадру
    // і після телепорту може відставати), від 3-ї — камера через приціл
    const origin = this.firstPerson
      ? this._shootOrigin.set(this.pos.x, this.pos.y + 1.62, this.pos.z)
      : this._shootOrigin.copy(this.camera.position);

    // 🚀 базука: летить ракета, шкода — вибухом
    if (w.rocket) {
      const dir = this.forwardVec(this._shootDir).clone().normalize();
      const ro = origin.clone().addScaledVector(dir, 0.7);
      if (level.mirror) level.net.sendRocket(ro, dir, Math.round(w.dmg * dmgMult));
      else if (level.net) level.net.spawnNetRocket(ro, dir, Math.round(w.dmg * dmgMult));
      else level.effects.spawnRocket(ro, dir, w.dmg);
      level.audio.rocket();
      this.camShake = Math.max(this.camShake, 0.5);
      applyRecoil();
      return;
    }

    // промені через приціл (дробовик — кілька шротин)
    const MAX_D = w.pellets ? 45 : 140;
    const pellets = w.pellets || 1;
    const spreadMult = (this.bobAmp > 0.5 ? 1.6 : 1);

    let anyHit = false;
    let anyHeadshot = false;
    const dmgByZombie = new Map();
    for (let i = 0; i < pellets; i++) {
      const dir = this.forwardVec(this._shootDir);
      dir.x += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
      dir.y += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
      dir.z += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
      dir.normalize();

      const hit = level.zombies ? level.zombies.hitTest(origin, dir, MAX_D) : null;
      const blockT = this.world.shotBlockDist(origin, dir, hit ? hit.t : MAX_D);

      // вибухові бочки і м'яч — теж цілі
      const bHit = level.effects.barrelHitTest(origin, dir, MAX_D);
      if (bHit && bHit.t < blockT && (!hit || bHit.t < hit.t)) {
        if (level.mirror) netBar.push([level.effects.barrels.indexOf(bHit.barrel), Math.round(w.dmg * dmgMult)]);
        else level.effects.damageBarrel(bHit.barrel, w.dmg * dmgMult);
        const bp = this._shootEnd.copy(origin).addScaledVector(dir, bHit.t);
        level.effects.burst(bp, 0xff5544, 4, { speed: 2, life: 0.3 });
        if (i < 3) level.effects.tracer(this._muzzlePos, bp);
        continue;
      }
      const wHit = level.gadgets ? level.gadgets.wallHitTest(origin, dir, MAX_D) : null;
      if (wHit && wHit.t < blockT && (!hit || wHit.t < hit.t)) {
        if (level.mirror) netWalls.push([wHit.wall.nid, Math.round(w.dmg * dmgMult)]);
        else level.gadgets.damageWall(wHit.wall, w.dmg * dmgMult);
        const wp = this._shootEnd.copy(origin).addScaledVector(dir, wHit.t);
        if (i < 3) level.effects.tracer(this._muzzlePos, wp);
        continue;
      }
      const ballHit = level.effects.ballHitTest(origin, dir, MAX_D);
      if (ballHit && ballHit.t < blockT && (!hit || ballHit.t < hit.t)) {
        if (level.mirror) netBall = true;
        else level.effects.kickBall(dir, 9);
        const bp = this._shootEnd.copy(origin).addScaledVector(dir, ballHit.t);
        if (i < 3) level.effects.tracer(this._muzzlePos, bp);
        continue;
      }

      let endPoint;
      if (blockT < (hit ? hit.t : Infinity)) {
        endPoint = this._shootEnd.copy(origin).addScaledVector(dir, blockT);
        if (i < 2) level.effects.burst(endPoint, 0xb09a72, 4, { speed: 2, life: 0.35, size: 0.7 });
      } else if (hit) {
        endPoint = hit.point;
        let dmg = w.dmg * dmgMult * (hit.headshot ? 2 : 1);
        if (level.mirror) netHits.push([hit.zombie.nid, Math.round(dmg), hit.headshot ? 1 : 0]);
        else { hit.zombie.lastHitBy = 1; hit.zombie.damage(dmg, dir, hit.headshot); }
        const acc = dmgByZombie.get(hit.zombie) || { total: 0, point: hit.point, crit: false };
        acc.total += dmg;
        acc.point = hit.point;
        acc.crit = acc.crit || hit.headshot;
        dmgByZombie.set(hit.zombie, acc);
        if (i < 3) level.effects.burst(hit.point, 0x86d14e, 6, { speed: 2.6, life: 0.45 });
        anyHit = true;
        anyHeadshot = anyHeadshot || hit.headshot;

        // 🎯 снайперка: куля пробиває кілька зомбі наскрізь
        if (w.pierce) {
          let pierceLeft = w.pierce - 1;
          let from = hit.point.clone().addScaledVector(dir, 0.5);
          let travelled = hit.t;
          while (pierceLeft > 0 && travelled < MAX_D) {
            const next = level.zombies.hitTest(from, dir, MAX_D - travelled);
            if (!next) break;
            const wallT = this.world.shotBlockDist(from, dir, next.t);
            if (wallT < next.t) break;
            dmg *= 0.7;
            if (level.mirror) netHits.push([next.zombie.nid, Math.round(dmg), next.headshot ? 1 : 0]);
            else { next.zombie.lastHitBy = 1; next.zombie.damage(dmg, dir, next.headshot); }
            const acc2 = dmgByZombie.get(next.zombie) || { total: 0, point: next.point, crit: false };
            acc2.total += dmg;
            acc2.point = next.point;
            acc2.crit = acc2.crit || next.headshot;
            dmgByZombie.set(next.zombie, acc2);
            level.effects.burst(next.point, 0x86d14e, 4, { speed: 2.4, life: 0.4 });
            endPoint = next.point;
            travelled += next.t + 0.5;
            from = next.point.clone().addScaledVector(dir, 0.5);
            pierceLeft--;
          }
        }
      } else {
        endPoint = this._shootEnd.copy(origin).addScaledVector(dir, MAX_D);
      }
      if (i < 3) level.effects.tracer(this._muzzlePos, endPoint);
      if (i === 0 && endPoint) netEnd = { x: endPoint.x, y: endPoint.y, z: endPoint.z };
    }
    applyRecoil();
    if (level.net) {
      if (level.mirror) level.net.shotReport(this.cur, netEnd, netHits, netBar, netWalls, netBall);
      else level.net.onLocalShot(this.cur, netEnd);
    }
    for (const [, acc] of dmgByZombie) {
      level.effects.damageNumber(acc.point, acc.total, acc.crit);
    }
    if (anyHit) {
      level.audio.hit(anyHeadshot);
      level.stats.shotsHit++;
      level.bus.emit('hitmarker', anyHeadshot);
    }
  }

  takeDamage(amt, fromX, fromZ) {
    if (this.respawnProtect > 0 || this.health <= 0) return;
    // 🛡 бульбашка: повна невразливість, поки діє баф
    if (this.buffs.bubble > 0) {
      this.level.bus.emit('bubbleBlock');
      return;
    }
    // 🛡️ гаджет-щит приймає удар на себе повністю
    if (this.gadgetShield > 0) {
      const absorb = Math.min(this.gadgetShield, amt);
      this.gadgetShield -= absorb;
      amt -= absorb;
      this.level.audio.clang();
      if (amt <= 0) return;
    }
    amt *= this.helmetMult; // ⛑ шолом зменшує всю шкоду
    // 🦺 броня поглинає 60% шкоди, поки не зламається
    if (this.armor > 0) {
      const absorb = Math.min(this.armor, amt * 0.6);
      this.armor -= absorb;
      amt -= absorb;
      this.level.bus.emit('armorHit');
    }
    this.health -= amt;
    this.camShake = 1;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x += (dx / d) * 4;
    this.vel.z += (dz / d) * 4;
    this.level.audio.hurt();
    this.level.bus.emit('playerHurt');
    if (this.health <= 0) {
      this.health = 0;
      this.level.bus.emit('playerDied');
    }
  }

  heal(amt) {
    if (this.health <= 0) return false;
    if (this.health >= this.maxHealth) return false;
    this.health = Math.min(this.maxHealth, this.health + amt);
    return true;
  }

  respawn() {
    if (this.level.mirror) this.level.net.sendRespawned();
    const gy = this.world.groundH(this.L.SPAWN.x, this.L.SPAWN.z);
    this.pos.set(this.L.SPAWN.x, gy, this.L.SPAWN.z);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.respawnProtect = 3;
    this.ammo[this.cur].mag = this.weapon.mag;
    this.reloading = 0;
    this._camInit = false;
  }
}
