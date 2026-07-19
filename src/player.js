// Гравець: рух, камера FP/TP, зброя, стрільба, броня, бафи
import * as THREE from 'three';
import { makeHero, makeGunMesh, makeFPArms, attachHeroGear, updateRig, setAnim, bakeGroupMeshes } from './characters.js';

import { clamp, damp, dampAngle } from './utils.js';
import { t } from './i18n.js';
import { momentumStats } from './combatmomentum.js';

export const WEAPONS = {
  pistol: { name: 'Пістолет', icon: '🔫', dmg: 34, rpm: 320, mag: 12, spread: 0.012, auto: false, reloadT: 1.0, recoil: 0.028, kick: 0.65, recover: 11, noise: 18, impact: 1, stagger: 0.08, infinite: true },
  rifle: { name: 'Автомат', icon: '🔥', dmg: 21, rpm: 620, mag: 30, spread: 0.02, auto: true, reloadT: 1.5, recoil: 0.013, kick: 0.72, recover: 8, noise: 30, impact: 1.5, stagger: 0.12, burst: true, infinite: false, reserve: 120, cap: 240 },
  shotgun: { name: 'Дробовик', icon: '💥', dmg: 17, rpm: 95, mag: 6, spread: 0.055, auto: false, reloadT: 2.0, recoil: 0.05, kick: 1.45, recover: 5, noise: 40, impact: 4, stagger: 0.32, infinite: false, pellets: 7, reserve: 24, cap: 60 },
  smg: { name: 'Швидкостріл', icon: '🌀', dmg: 13, rpm: 920, mag: 40, spread: 0.034, auto: true, reloadT: 1.2, recoil: 0.008, kick: 0.52, recover: 10, noise: 30, impact: 1, stagger: 0.08, burst: true, infinite: false, reserve: 160, cap: 320 },
  magnum: { name: 'Магнум', icon: '🤠', dmg: 60, rpm: 140, mag: 6, spread: 0.006, auto: false, reloadT: 1.6, recoil: 0.05, kick: 1.35, recover: 5, noise: 30, impact: 5, stagger: 0.35, infinite: false, reserve: 36, cap: 90 },
  sniper: { name: 'Снайперка', icon: '🎯', dmg: 120, rpm: 42, mag: 5, spread: 0.001, auto: false, reloadT: 2.2, recoil: 0.07, kick: 1.55, recover: 4, noise: 40, impact: 6, stagger: 0.35, infinite: false, pierce: 3, reserve: 25, cap: 60 },
  staff: { name: 'Посох', icon: '🪄', dmg: 95, rpm: 55, mag: 1, spread: 0.002, auto: false, reloadT: 3.0, recoil: 0.04, infinite: true, pierce: 2 },
  cannon: { name: 'Гармата', icon: '💣', dmg: 350, rpm: 24, mag: 1, spread: 0.002, auto: false, reloadT: 2.5, recoil: 0.09, infinite: true },
  sword: { name: 'Меч', icon: '🗡️', dmg: 300, rpm: 80, mag: Infinity, spread: 0, auto: false, reloadT: 0.6, recoil: 0.04, kick: 1, recover: 6, impact: 5, stagger: 0.3, infinite: true, melee: true, range: 3.0, cleave: 3 },
  // 🔨 молот — єдина зброя режиму «Оборона турелі»: 35 шкоди, 1 удар/с
  hammer: { name: 'Молот', icon: '🔨', dmg: 35, rpm: 60, mag: Infinity, spread: 0, auto: false, reloadT: 1.0, recoil: 0.06, kick: 1.1, recover: 5, impact: 5, stagger: 0.3, infinite: true, melee: true, range: 3.2 },
  axe: { name: 'Сокира', icon: '🪓', dmg: 45, rpm: 80, mag: Infinity, spread: 0, auto: false, reloadT: 0.6, recoil: 0.06, kick: 1.1, recover: 6, impact: 4, stagger: 0.25, infinite: true, melee: true, range: 3.6, cleave: 3 },
  pickaxe: { name: 'Кірка', icon: '⛏️', dmg: 35, rpm: 80, mag: Infinity, spread: 0, auto: false, reloadT: 0.6, recoil: 0.06, kick: 1.1, recover: 6, impact: 4, stagger: 0.25, infinite: true, melee: true, range: 3.6 },
  bazooka: { name: 'Базука', icon: '🚀', dmg: 220, rpm: 30, mag: 1, spread: 0.004, auto: false, reloadT: 2.5, recoil: 0.09, kick: 1.8, recover: 3.5, noise: 50, impact: 8, stagger: 0.45, infinite: false, rocket: true, reserve: 0, cap: 9 },
  // 🔋 паливні зброї (v46): стріляють БЕЗПЕРЕРВНО, поки тримаєш вогонь, і витрачають
  // ЗАРЯД-МАГАЗИН (балон = 5с безперервної стрільби), а не патрони-штуки. fuelMax — місткість балона.
  // Коли балон вичерпано (або тиснеш R) — ПЕРЕЗАРЯДКА (reloadT), після неї знову повні 5с. Нескінченно.
  // dps — шкода ЗА СЕКУНДУ (застосовується щокадру: dmg = dps * dt).
  // 🔫 Лазер: безперервний промінь-хітскан, пробиває кількох (як снайперка, але потоком).
  //   dps 90 → walker (70hp) ~0.8с, але балон лише 5с і ще треба тримати лінію. Потужно, не імба.
  laser: { name: 'Лазер', icon: '🔫', dmg: 0, dps: 90, rpm: 0, mag: 0, spread: 0, auto: true, reloadT: 2.0, recoil: 0, infinite: false, continuous: true, beam: true, pierce: 6, range: 90, fuelMax: 5.0 },
  // 🔥 Вогнемет: короткий конус полум'я, висока шкода зблизька, спадає з дистанцією.
  //   dps 120 у впор, падає до ~0 на краю (range 8). Тип шкоди «вогонь» — гак для v47.
  flamethrower: { name: 'Вогнемет', icon: '🔥', dmg: 0, dps: 120, rpm: 0, mag: 0, spread: 0, auto: true, reloadT: 2.5, recoil: 0, infinite: false, continuous: true, flame: true, range: 8, coneCos: 0.82, fuelMax: 5.0 },
};
export const WEAPON_SLOTS = ['pistol', 'rifle', 'shotgun', 'smg', 'magnum', 'sniper', 'bazooka', 'laser', 'flamethrower', 'staff'];
const ALL_WEAPON_IDS = Object.keys(WEAPONS);
const SLOT_KEYS = { Digit1: 'pistol', Digit2: 'rifle', Digit3: 'shotgun', Digit4: 'smg', Digit5: 'magnum', Digit6: 'sniper', Digit7: 'bazooka', Digit8: 'laser', Digit9: 'flamethrower', Digit0: 'staff' };
// 🟡 зброя з гільзами (лазер/вогнемет/посох/меч/молот/базука гільз не викидають)
const SHELL_WEAPONS = new Set(['pistol', 'rifle', 'smg', 'shotgun', 'magnum', 'sniper']);
const HIT_ZONE_MULT = { head: 2, arms: 0.85, legs: 0.75, body: 1 };

export class Player {
  constructor(level) {
    this.level = level;
    const { scene, world } = level;
    this.world = world;
    this.L = world.layout;

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, world.quality.cameraFar || 1200);
    scene.add(this.camera);

    const gy = world.groundH(this.L.SPAWN.x, this.L.SPAWN.z);
    this.pos = new THREE.Vector3(this.L.SPAWN.x, gy, this.L.SPAWN.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0; // дивимось на північ (-Z), до села
    this.pitch = 0;
    this.onGround = true;
    this.inCastleDungeon = false;
    this.moon = level.countryId === 'MOON';
    this.gravity = this.moon ? 8.2 : 21;
    this.oxygen = this.moon ? 100 : null;
    this.spacesuit = false;
    this._oxygenDamageT = 0;

    this.maxHealth = 100;
    this.health = 100;
    this.speedMult = 1;
    this.pickupMult = 1; // 🎭 кооп-scout: радіус підбору монет/дропів ×1.25 (див. effects)
    this.damageMult = 1;
    this.damageTotemMult = 1;
    this.respawnProtect = 0;
    // броня: поглинає 60% шкоди, поки є
    this.armor = 0;
    this.maxArmor = 50;
    this.helmetMult = 1; // шолом: множник вхідної шкоди
    this.jumpPower = this.moon ? 9.4 : 7.6;
    this.gearAttached = {};
    // тимчасові бафи (секунди, що лишились)
    this.buffs = { speed: 0, rage: 0, bubble: 0, magnet: 0 };
    this.gadgetShield = 0; // 🛡️ гаджет-щит: поглинає шкоду повністю, поки не розіб'ється
    this.infiniteAmmoT = 0;
    // 🌟 «момент могутності» (v288): супер-пікап дає одну з двох сил на 12–15с.
    // { type: 'shkval'|'magnet', t, dur } — run-only, без персисту; згасання емітить superPowerEnd.
    this.superPower = null;
    this._superSparkT = 0;
    this.stunAmmoT = 0; // 💫 гаджет «Оглушливі кулі»: кулі пістолета/магнума оглушують зомбі
    this.stunT = 0;
    this.invisibleT = 0;
    this.invisibleRegenRate = 0;
    this.appleT = 0; this.appleBonus = 20; // 🍎 золоте яблуко: тимчасовий maxHealth бонус згасає сам

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
    // 🔋 паливо паливних зброй (v46): секунди безперервної дії, що лишились. Старт — повний балон.
    this.fuel = {};
    for (const w of ALL_WEAPON_IDS) {
      this.ammo[w] = { mag: WEAPONS[w].mag, reserve: WEAPONS[w].infinite ? Infinity : WEAPONS[w].reserve };
      if (WEAPONS[w].continuous) this.fuel[w] = WEAPONS[w].fuelMax;
    }
    this.grenades = 2;
    this.grenadeCd = 0;
    this.reviveCharges = 0; // 🪬 заряди тотема безсмертя — кожен рятує від смерті 1 раз
    this.stepT = 0;
    this._clickBuffer = 0;
    this.shootCd = 0;
    this.reloading = 0;
    this.firstPerson = true;

    // герой для виду від 3-ї особи (з обраним скіном)
    this.rig = makeHero((level.game && level.game.save.activeSkin) || 'classic', level.game && level.game.save.hero);
    scene.add(this.rig.group);
    this.tpGuns = {};
    for (const w of ALL_WEAPON_IDS) {
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
    for (const w of ALL_WEAPON_IDS) {
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
    this.fireHeat = 0;
    this.fireHeatT = 0;
    this.weaponSwitchT = 0;
    this.reloadDur = 0;
    this.meleeSwing = null;
    this.camShake = 0;
    this.landDip = 0; // 🦶 squash приземлення: 1 у момент торкання землі → 0 за ~0.12с
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
    for (const w of ALL_WEAPON_IDS) {
      this.fpArms[w].group.visible = this.firstPerson && w === this.cur;
      this.tpGuns[w].group.visible = !this.firstPerson && w === this.cur;
    }
  }

  switchWeapon(w) {
    if (!this.weapons.includes(w) || this.cur === w) return;
    this.cur = w;
    this.reloading = 0;
    this.meleeSwing = null;
    this.rig.anim.reloadT = 0;
    this.scoped = false;
    this.shootCd = Math.max(this.shootCd, 0.25);
    this.weaponSwitchT = 0.28;
    this.rig.anim.drawT = 0.22;
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
    // патрони для всієї вогнепальної зброї пропорційно (ракети — окремо).
    // магнум/снайперка поповнюються щедріше (1/3, 1/4 замість 1/6, 1/10) —
    // потужні, але тепер ними реально можна гратись, а не «стріляти крихтами».
    const ratio = { rifle: 1, smg: 1.4, shotgun: 1 / 7.5, magnum: 1 / 3, sniper: 1 / 4 };
    for (const [w, k] of Object.entries(ratio)) {
      this.ammo[w].reserve = Math.min(WEAPONS[w].cap, this.ammo[w].reserve + Math.ceil(n * k));
    }
    // 🔋 паливні зброї поповнюються фіксовано: ~2с балона за пікап набоїв (90 → +2с),
    // масштабовано від n, щоб дрібний пікап давав менше. Балон ≤5с.
    this.addFuel(Math.max(1, n / 45));
  }

  addRockets(n) {
    this.ammo.bazooka.reserve = Math.min(WEAPONS.bazooka.cap, this.ammo.bazooka.reserve + n);
  }

  // куплене спорядження: ефекти + видимі речі на герої (3-тя особа)
  applyGear(upgrades) {
    const vest = upgrades.vest || 0;
    this.maxArmor = 50 + vest * 50;
    this.helmetMult = upgrades.helmet ? 0.85 : 1;
    this.jumpPower = (upgrades.sneakers ? 8.6 : 7.6) + (this.moon ? 1.8 : 0);
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
    const w = this.weapon;
    if (w.continuous) {
      // континуальна зброя (лазер/вогнемет): перезаряджаємо балон, якщо він не повний
      if (this.reloading > 0 || (this.fuel[this.cur] || 0) >= w.fuelMax) return;
      this.reloading = w.reloadT;
      this.reloadDur = w.reloadT;
      this.rig.anim.reloadT = w.reloadT;
      this.rig.anim.reloadDuration = w.reloadT;
      this.level.audio.reload(this.cur);
      return;
    }
    const a = this.curAmmo;
    if (this.reloading > 0 || a.mag >= w.mag || (!w.infinite && a.reserve <= 0)) return;
    this.reloading = w.reloadT;
    this.reloadDur = w.reloadT;
    this.rig.anim.reloadT = w.reloadT;
    this.rig.anim.reloadDuration = w.reloadT;
    this.level.audio.reload(this.cur);
  }

  update(dt, input, allowControl) {
    const world = this.world;
    if (this.respawnProtect > 0) this.respawnProtect -= dt;
    const stunned = this.stunT > 0;
    if (stunned) this.stunT = Math.max(0, this.stunT - dt);
    allowControl = allowControl && !stunned;

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

    // --- 🐣 Режим Малюк: лише м'яка допомога з прицілом (тільки тач, не ламає десктоп) ---
    if (allowControl) this._kidAimAssist(dt, input);

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
    this._updateBuffTimers(dt);
    this._updateMoonLifeSupport(dt);

    const moving = (Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05);
    const sprint = !this.riding && moving && (input.down('ShiftLeft') || input.down('ShiftRight') || input.touchSprint);
    this._updateLocomotion(dt, moving, sprint, mx, mz);
    this._updateGravityCollide(dt, input, allowControl);
    this._updateJumpPads(dt);

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
      if (input.pressed('KeyX') && this.weapons.includes('axe')) {
        this.switchWeapon(this.cur === 'axe' && this.weapons.includes('pickaxe') ? 'pickaxe' : 'axe');
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

    this._updateWeaponFiring(dt, input, allowControl);
    this._updateMeleeSwing(dt);

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
    // на самокаті немає кроків — від 1-ї особи гасимо біговий боб (3-тя особа має позу 'ride')
    const bobTarget = this.riding ? 0 : (this.onGround ? Math.min(1, hSpeed / 5) : 0);
    this.bobAmp = damp(this.bobAmp, bobTarget, 8, dt);
    this.bobPhase += dt * (4 + hSpeed * 1.15);
    this.fireHeatT = Math.max(0, this.fireHeatT - dt);
    if (this.fireHeatT <= 0) this.fireHeat = Math.max(0, this.fireHeat - dt * 4);
    this.weaponSwitchT = Math.max(0, this.weaponSwitchT - dt);
    this.gunKick = Math.max(0, this.gunKick - dt * (this.weapon.recover || 7));
    this.camShake = Math.max(0, this.camShake - dt * 3);
    this.landDip = Math.max(0, this.landDip - dt / 0.12); // squash приземлення відновлюється за ~0.12с
    this.fovTarget = this.scoped ? 24 : sprint ? 82 : 75;
    this.camera.fov = damp(this.camera.fov, this.fovTarget, 8, dt);
    this.camera.updateProjectionMatrix();

    this._updateCamera(dt, hSpeed);
    this._updateRigs(dt, hSpeed, moving, sprint);
  }

  // згасання бафів/боєприпасних таймерів; 🍎 яблуко повертає бонус-HP при згасанні
  _updateBuffTimers(dt) {
    for (const k in this.buffs) {
      if (this.buffs[k] > 0) this.buffs[k] -= dt;
    }
    if (this.infiniteAmmoT > 0) this.infiniteAmmoT = Math.max(0, this.infiniteAmmoT - dt);
    // 🌟 супер-сила: відлік + іскровий шлейф для «Магніт-бурі», емісія кінця
    if (this.superPower) {
      this.superPower.t -= dt;
      if (this.superPower.type === 'magnet') {
        this._superSparkT -= dt;
        if (this._superSparkT <= 0) {
          this._superSparkT = 0.12;
          this.level.effects.burst(new THREE.Vector3(this.pos.x, this.pos.y + 0.35, this.pos.z), 0x66ddff, 3, { speed: 1.3, up: 2, life: 0.5, size: 0.6 });
        }
      }
      if (this.superPower.t <= 0) {
        const ended = this.superPower;
        this.superPower = null;
        this.level.bus.emit('superPowerEnd', ended);
      }
    }
    if (this.stunAmmoT > 0) this.stunAmmoT = Math.max(0, this.stunAmmoT - dt);
    if (this.invisibleT > 0) {
      const activeDt = Math.min(dt, this.invisibleT);
      if ((this.invisibleRegenRate || 0) > 0 && this.health > 0) {
        this.health = Math.min(this.maxHealth, this.health + this.invisibleRegenRate * activeDt);
      }
      this.invisibleT = Math.max(0, this.invisibleT - dt);
      this.rig.group.visible = false;
      if (this.invisibleT === 0) { this.invisibleRegenRate = 0; this._applyView(); }
    }
    if (this.appleT > 0) {
      this.appleT = Math.max(0, this.appleT - dt);
      if (this.appleT === 0) { this.maxHealth -= this.appleBonus || 20; this.appleBonus = 20; if (this.health > this.maxHealth) this.health = this.maxHealth; }
    }
  }

  // 🛴 самокат (W газ / S гальмо / A,D кермо, без бокового ковзання) АБО пішки (із льодом-інерцією).
  _updateLocomotion(dt, moving, sprint, mx, mz) {
    if (this.riding) {
      // 🛴 фізика самоката: W — газ, S — гальмо/назад, A/D — кермо. Вбік не ковзає!
      const gas = -mz;       // W = вперед
      const steer = -mx;     // A = ліворуч
      const rover = this.riding && this.riding.rover;
      if (gas > 0.05) this.rideSpeed = Math.min(rover ? 17 : 12.5, this.rideSpeed + (rover ? 7.5 : 9.5) * dt);
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
      // 🧲 «Магніт-буря»: +20% швидкості поки сила активна
      const superSpeed = (this.superPower && this.superPower.type === 'magnet') ? 1.2 : 1;
      const momentum = momentumStats(this.level.combo);
      const speed = 5.6 * this.speedMult * buffSpeed * superSpeed * momentum.speed * (sprint ? 1.55 : 1);
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
  }

  // стрибок, гравітація, 🏔️ чесні схили (пішки у відвісну кручу не зайти), приземлення і колізії світу.
  _updateGravityCollide(dt, input, allowControl) {
    const world = this.world;
    // стрибок і гравітація
    if (allowControl && input.pressed('Space') && this.onGround) {
      this.vel.y = this.jumpPower;
      this.onGround = false;
    }
    this.vel.y -= this.gravity * dt;
    const preSlopeX = this.pos.x, preSlopeZ = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // 🏔️ чесні схили: пішки у відвісну кручу не зайти (стрибком на уступ — можна).
    // Межа ~55°; перевіряємо лише на картах із великим рельєфом
    if (world._terrainMod && this.onGround && !this.inCastleDungeon) {
      const gh0 = world.groundH(preSlopeX, preSlopeZ);
      const allow = (ax, az) =>
        world.groundH(ax, az) - gh0 <= Math.hypot(ax - preSlopeX, az - preSlopeZ) * 1.45 + 0.3;
      if (!allow(this.pos.x, this.pos.z)) {
        if (allow(this.pos.x, preSlopeZ)) this.pos.z = preSlopeZ;
        else if (allow(preSlopeX, this.pos.z)) this.pos.x = preSlopeX;
        else { this.pos.x = preSlopeX; this.pos.z = preSlopeZ; }
      }
    }

    const surfaceH = world.groundH(this.pos.x, this.pos.z);
    const dungeon = world.castleDungeon?.open ? world.castleDungeon : null;
    let dungeonH = dungeon ? dungeon.floorHeightAt(this.pos.x, this.pos.z) : null;
    if (dungeonH !== null && dungeonH !== undefined) {
      const enteredThroughMouth = preSlopeX < dungeon.tunnelStartX
        && this.pos.x >= dungeon.tunnelStartX
        && Math.abs(this.pos.z - dungeon.entranceZ) < 3.7;
      const alreadyBelowGround = this.pos.y < surfaceH - 1.5;
      if (enteredThroughMouth || alreadyBelowGround) this.inCastleDungeon = true;
    } else if (this.inCastleDungeon && dungeon) {
      const leftThroughMouth = preSlopeX >= dungeon.tunnelStartX
        && this.pos.x < dungeon.tunnelStartX
        && Math.abs(this.pos.z - dungeon.entranceZ) < 3.7
        && this.pos.y >= dungeon.surfaceY - 0.5;
      if (leftThroughMouth) {
        this.inCastleDungeon = false;
      } else {
        // Стіна не є виходом: повертаємо останню валідну підземну позицію,
        // замість того щоб підхопити поверхневий groundH і телепортувати героя нагору.
        this.pos.x = preSlopeX;
        this.pos.z = preSlopeZ;
        dungeonH = dungeon.floorHeightAt(preSlopeX, preSlopeZ);
        this.vel.x = 0;
        this.vel.z = 0;
      }
    }
    const supportH = this.inCastleDungeon && dungeonH !== null && dungeonH !== undefined
      ? dungeonH
      : surfaceH;
    const gh = Math.max(supportH, world.floorAt(this.pos.x, this.pos.z, this.pos.y));
    if (this.pos.y <= gh) {
      // 🦶 приземлення з падіння: короткий squash (провал камери в 1-й особі / сплюск тіла в 3-й)
      if (!this.onGround && this.vel.y < -4) this.landDip = 1;
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
    if (this.inCastleDungeon && dungeon
      && dungeon.floorHeightAt(this.pos.x, this.pos.z) === null) {
      this.pos.x = preSlopeX;
      this.pos.z = preSlopeZ;
      this.vel.x = 0;
      this.vel.z = 0;
    }
    // 🛴 врізались у перешкоду — самокат різко гальмує
    if (this.riding && Math.hypot(solved.x - preX, solved.z - preZ) > 0.04) {
      this.rideSpeed *= 0.35;
    }
  }

  _updateMoonLifeSupport(dt) {
    if (!this.moon || this.health <= 0) return;
    if (this.spacesuit) { this.oxygen = 100; this._oxygenDamageT = 0; return; }
    const station = this.level.country.map.storySites.station;
    const inside = Math.hypot(this.pos.x - station.x, this.pos.z - station.z) < 48;
    const relay = this.level.missions?.objectives?.find((objective) => objective.id === 'moon-relays');
    if (inside) this.oxygen = Math.min(100, this.oxygen + 22 * dt);
    else this.oxygen = Math.max(0, this.oxygen - (relay?.state === 'done' ? 0.35 : 0.9) * dt);
    if (this.oxygen > 0) { this._oxygenDamageT = 0; return; }
    this._oxygenDamageT -= dt;
    if (this._oxygenDamageT <= 0) {
      this._oxygenDamageT = 1;
      this.takeDamage(8, this.pos.x, this.pos.z);
    }
  }

  equipSpacesuit() {
    if (this.spacesuit) return false;
    this.spacesuit = true;
    this.oxygen = 100;
    this.gearAttached.spacesuit = attachHeroGear(this.rig, 'spacesuit');
    return true;
  }

  // 🦘 батути: торкання активної площадки підкидає гравця вгору (з кулдауном).
  _updateJumpPads(dt) {
    const world = this.world;
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
  }

  // перезарядка (дострілювання магазину/балона) + тригер пострілу (континуал чи дискретний).
  _updateWeaponFiring(dt, input, allowControl) {
    // --- перезарядка ---
    if (this.reloading > 0) {
      this.reloading -= dt * momentumStats(this.level.combo).reload;
      if (this.reloading <= 0) {
        const w = this.weapon;
        if (w.continuous) {
          this.fuel[this.cur] = w.fuelMax; // балон знову повний (5с стрільби)
        } else {
          const a = this.curAmmo;
          const need = w.mag - a.mag;
          if (w.infinite) a.mag = w.mag;
          else {
            const take = Math.min(need, a.reserve);
            a.mag += take;
            a.reserve -= take;
          }
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
      if (w.continuous) {
        // 🔋 паливна зброя: тримаєш вогонь → безперервний дренаж палива + шкода щокадру
        this._fireContinuous(dt, input.mouseDown);
      } else {
        const trigger = w.auto ? input.mouseDown : (input.justClicked || this._clickBuffer > 0);
        if (trigger && this.shootCd <= 0) {
          this._clickBuffer = 0;
          if (this.curAmmo.mag > 0 || (this.infiniteAmmoT > 0 && (this.cur === 'rifle' || this.cur === 'smg')) || (this.superPower && this.superPower.type === 'shkval')) this._shoot();
          else {
            this.level.audio.empty();
            this.shootCd = 0.35;
            this.startReload();
          }
        }
      }
    }
    // безперервна зброя при відпущеному гачку / неактивному керуванні — глушимо звук
    if ((!this.weapon.continuous || !allowControl) && this._contAudio) {
      this.level.audio.stopBeam && this.level.audio.stopBeam();
      this._contAudio = false;
    }
  }

  _updateCamera(dt, hSpeed) {
    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    if (this.firstPerson) {
      const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmp;
      const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmp;
      cam.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.pos.y + 1.62 + bobY - this.landDip * 0.06, this.pos.z - bobX * Math.sin(this.yaw));
      cam.rotation.set(this.pitch, this.yaw, 0);
      this._camInit = false;
      // зброя: боб + віддача
      this.weaponRoot.position.set(
        this.weaponBase.x + Math.cos(this.bobPhase) * 0.013 * this.bobAmp,
        this.weaponBase.y + Math.abs(Math.sin(this.bobPhase)) * 0.018 * this.bobAmp
          - (this.reloading > 0 ? 0.16 : 0) - (this.weaponSwitchT > 0 ? Math.sin(this.weaponSwitchT / 0.28 * Math.PI) * 0.22 : 0),
        this.weaponBase.z + this.gunKick * 0.13
      );
      this.weaponRoot.rotation.set(
        this.gunKick * 0.22 + (this.reloading > 0 ? -0.5 : 0),
        0.06 + this.gunKick * (this.cur === 'magnum' || this.cur === 'sniper' ? 0.08 : 0),
        Math.sin(this.bobPhase) * 0.008 * this.bobAmp + (this.reloading > 0 ? -0.18 : 0)
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
    if (this.camShake > 0 && (!this.level.game || this.level.game.save.cameraShake !== false)) {
      cam.position.x += (Math.random() - 0.5) * this.camShake * 0.09;
      cam.position.y += (Math.random() - 0.5) * this.camShake * 0.09;
    }
  }

  _updateRigs(dt, hSpeed, moving, sprint) {
    if (this.firstPerson) {
      for (const key of ['fireT', 'reloadT', 'drawT']) this.rig.anim[key] = Math.max(0, (this.rig.anim[key] || 0) - dt);
    }
    if (!this.firstPerson) {
      this.rig.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      // 🦶 squash приземлення: через anim.extSquash — сам масштаб виставляє updateRig
      // (він щокадру пише body.scale для squash-and-stretch, пряме scale.y тут би затерлось)
      this.rig.anim.extSquash = 1 - this.landDip * 0.08;
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

  // 🐣 Режим Малюк: лише м'який доворот прицілу на найближчого зомбі у передньому
  // конусі — дитина сама стріляє кнопкою. БЕЗ автовогню й гарантованого хедшоту
  // (цілимось у тулуб). Працює ЛИШЕ на тачі з увімкненим kidMode —
  // десктоп/клавіатура не зачіпаються.
  _kidAimAssist(dt, input) {
    const level = this.level;
    const game = level && level.game;
    if (!game || !game.save.kidMode || !input.touchMode) return;
    if (this.health <= 0 || this.riding || this.emoting) return;
    if (!level.zombies) return;

    const eyeY = this.pos.y + 1.62;
    const fwd = this.forwardVec(this._fwd); // вже нормований
    let best = null, bestDot = 0.91, bestD = 0; // конус ~24° (cos 24° ≈ 0.913)
    for (const z of level.zombies.list) {
      // не наводимося на невидимих привидів, поки їх не підсвітив Ікс-рей
      if (z.state === 'dead' || (z.invisible && !z.rig.group.visible)) continue;
      const dx = z.x - this.pos.x;
      const dz = z.z - this.pos.z;
      const torsoY = z.y + z.rig.height * 0.55;
      const dy = torsoY - eyeY;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.3 || d > 70) continue;
      const dot = (fwd.x * dx + fwd.y * dy + fwd.z * dz) / d;
      if (dot > bestDot) { bestDot = dot; best = z; bestD = Math.hypot(dx, dz); }
    }
    if (!best) return;

    // М'який доворот — лише ніжний нудж до тулуба зомбі (rate 4 yaw / 3 pitch),
    // дитина все одно грубо наводить й тисне на гачок сама. Жодного автовогню.
    const dx = best.x - this.pos.x, dz = best.z - this.pos.z;
    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = clamp(Math.atan2((best.y + best.rig.height * 0.55) - eyeY, bestD), -1.45, 1.45);
    this.yaw = dampAngle(this.yaw, targetYaw, 4, dt);
    this.pitch = clamp(damp(this.pitch, targetPitch, 3, dt), -1.45, 1.45);
  }

  _shoot() {
    const w = this.weapon;
    const a = this.curAmmo;
    const level = this.level;
    // ♾️ гаджет-безлім (тільки автомат/швидкостріл) АБО 🔥 «Шквал» (усі зброї) — не їсть магазин
    const gadgetInf = this.infiniteAmmoT > 0 && (this.cur === 'rifle' || this.cur === 'smg');
    const shkval = !!(this.superPower && this.superPower.type === 'shkval');
    const infAmmo = gadgetInf || shkval;
    if (!infAmmo) a.mag--;
    // «Шквал»: скорострільність ×1.8 (композиться з гаджет-прискоренням 0.45)
    this.shootCd = (60 / w.rpm) * (gadgetInf ? 0.45 : 1) / ((shkval ? 1.8 : 1) * momentumStats(level.combo).fire);
    if (w.burst) {
      this.fireHeat = Math.min(1, this.fireHeat + (this.cur === 'smg' ? 0.08 : 0.12));
      this.fireHeatT = 0.25;
    } else this.fireHeat = 0;
    this.gunKick = (w.kick || 1) * (1 + this.fireHeat * 0.35);
    this.rig.anim.fireT = w.melee ? 0.22 : 0.12;
    level.stats.shotsFired++;
    const dmgMult = this.damageMult * (this.damageTotemMult || 1) * (this.buffs.rage > 0 ? 2 : 1) * momentumStats(level.combo).damage;

    const arms = this.firstPerson ? this.fpArms[this.cur] : this.tpGuns[this.cur];
    arms.muzzle.getWorldPosition(this._muzzlePos);

    if (w.melee) {
      level.audio.throwWhoosh(0.65);
      this.meleeSwing = { t: 0.14, weaponId: this.cur, dmgMult };
      return;
    }

    level.audio.shot(this.cur);
    level.zombies?.hearShot?.(this.pos.x, this.pos.z, w.noise || 30);
    const reducedFlashes = level.game && level.game.save.reducedFlashes;
    level.effects.muzzleFlash(this._muzzlePos, (shkval ? 1.7 : 1) * (reducedFlashes ? 0.45 : 1));
    // 🟡 гільза вилітає праворуч-вгору від дула
    if (SHELL_WEAPONS.has(this.cur)) level.effects.ejectShell(this._muzzlePos, Math.cos(this.yaw), -Math.sin(this.yaw));

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
    if (w.rocket) { this._fireRocket(origin, dmgMult); return; }

    // промені через приціл (дробовик — кілька шротин)
    const MAX_D = w.pellets ? 45 : 140;
    const pellets = w.pellets || 1;
    const spreadMult = (this.bobAmp > 0.5 ? 1.6 : 1) * (1 + this.fireHeat * 0.55);

    let anyHit = false;
    let anyHeadshot = false;
    let hitZone = 'body';
    // 💫 «Оглушливі кулі»: лише пістолет і магнум оглушують на 0.5с / 1с з гіперзарядом
    const stunShot = this.stunAmmoT > 0 && (this.cur === 'pistol' || this.cur === 'magnum');
    const stunTime = stunShot && (level.game.save.gadgetHypers || []).includes('stunammo') ? 1 : 0.5;
    const dmgByZombie = new Map();
    for (let i = 0; i < pellets; i++) {
      const dir = this.forwardVec(this._shootDir);
      dir.x += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
      dir.y += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
      dir.z += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
      dir.normalize();

      const hit = level.zombies ? level.zombies.hitTest(origin, dir, MAX_D) : null;
      const blockT = this.world.shotBlockDist(origin, dir, hit ? hit.t : MAX_D);
      const destructibleHit = this.world.hitTestDestructible?.(origin, dir, MAX_D);

      if (destructibleHit && destructibleHit.t <= blockT + 0.25 && (!hit || destructibleHit.t < hit.t)) {
        if (level.mirror && level.net.reportDestructibleHit) level.net.reportDestructibleHit(destructibleHit.destructible.id, Math.round(w.dmg * dmgMult));
        else this.world.damageDestructible(destructibleHit.destructible, w.dmg * dmgMult, destructibleHit.point);
        if (i < 3) level.effects.tracer(this._muzzlePos, destructibleHit.point);
        anyHit = true;
        continue;
      }

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
      const safeHit = level.bank ? level.bank.safeHitTest(origin, dir, MAX_D) : null;
      if (safeHit && safeHit.t < blockT && (!hit || safeHit.t < hit.t)) {
        level.bank.damageSafe(safeHit.safe, w.dmg * dmgMult, true);
        if (i < 3) level.effects.tracer(this._muzzlePos, safeHit.point);
        anyHit = true;
        continue;
      }
      const portalHit = level.portal ? level.portal.portalHitTest(origin, dir, MAX_D) : null;
      if (portalHit && portalHit.t < blockT && (!hit || portalHit.t < hit.t)) {
        level.portal.damagePortal(portalHit.portal, w.dmg * dmgMult);
        if (i < 3) level.effects.tracer(this._muzzlePos, portalHit.point);
        anyHit = true;
        continue;
      }
      const missionEngine = level.missions && (level.missions.delegate || level.missions);
      const barracksHit = missionEngine && missionEngine.barracksHitTest
        ? missionEngine.barracksHitTest(origin, dir, MAX_D) : null;
      if (barracksHit && barracksHit.t <= blockT && (!hit || barracksHit.t < hit.t)) {
        const damage = w.dmg * dmgMult;
        missionEngine.damageBarracks(damage, barracksHit.point);
        if (i < 3) level.effects.tracer(this._muzzlePos, barracksHit.point);
        anyHit = true;
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
        const zone = hit.hitZone || (hit.headshot ? 'head' : 'body');
        let dmg = w.dmg * dmgMult * (HIT_ZONE_MULT[zone] || 1);
        const impactForce = w.impact || 1;
        const staggerTime = this.cur === 'shotgun' && hit.t > 12 ? 0.12 : (w.stagger || 0);
        const damageOpts = { weaponId: this.cur, hitZone: zone, impactSide: hit.impactSide, impactForce, staggerTime };
        const armoredBefore = hit.zombie.shieldHp > 0 || hit.zombie.chestHp > 0 || hit.zombie.helmetHp > 0;
        const canStun = stunShot && !(hit.zombie.stats && hit.zombie.stats.stunImmune);
        if (level.mirror) netHits.push([hit.zombie.nid, Math.round(dmg), hit.headshot ? 1 : 0, canStun ? 1 : 0, stunTime, zone, impactForce, staggerTime]);
        else { hit.zombie.lastHitBy = 1; hit.zombie.damage(dmg, dir, hit.headshot, damageOpts); }
        // оглушення хост-авторитетне: соло/хост ставлять одразу, гість шле прапорець хосту (4-й елемент)
        if (canStun && !level.mirror && hit.zombie.state !== 'dead') hit.zombie.stunT = stunTime;
        const acc = dmgByZombie.get(hit.zombie) || { total: 0, point: hit.point, crit: false };
        acc.total += dmg;
        acc.point = hit.point;
        acc.crit = acc.crit || hit.headshot;
        dmgByZombie.set(hit.zombie, acc);
        if (i < 3) level.effects.burst(hit.point, 0x86d14e, 6, { speed: 2.6, life: 0.45 });
        anyHit = true;
        anyHeadshot = anyHeadshot || hit.headshot;
        const markerZone = armoredBefore ? 'armor' : zone;
        if (hit.headshot || hitZone === 'body') hitZone = markerZone;

        // 🎯 снайперка: куля пробиває кілька зомбі наскрізь
        if (w.pierce) {
          let pierceLeft = w.pierce - 1;
          let pierceBase = w.dmg * dmgMult;
          let from = hit.point.clone().addScaledVector(dir, 0.5);
          let travelled = hit.t;
          while (pierceLeft > 0 && travelled < MAX_D) {
            const next = level.zombies.hitTest(from, dir, MAX_D - travelled);
            if (!next) break;
            const wallT = this.world.shotBlockDist(from, dir, next.t);
            if (wallT < next.t) break;
            pierceBase *= 0.7;
            const nextZone = next.hitZone || (next.headshot ? 'head' : 'body');
            dmg = pierceBase * (HIT_ZONE_MULT[nextZone] || 1);
            const nextOpts = { weaponId: this.cur, hitZone: nextZone, impactSide: next.impactSide, impactForce, staggerTime };
            if (level.mirror) netHits.push([next.zombie.nid, Math.round(dmg), next.headshot ? 1 : 0, 0, 0, nextZone, impactForce, staggerTime]);
            else { next.zombie.lastHitBy = 1; next.zombie.damage(dmg, dir, next.headshot, nextOpts); }
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
    this._applyRecoil(w);
    if (level.net) {
      if (level.mirror) level.net.shotReport(this.cur, netEnd, netHits, netBar, netWalls, netBall);
      else level.net.onLocalShot(this.cur, netEnd);
    }
    for (const [, acc] of dmgByZombie) {
      // ⭐ хедшот: сніп золотих зірочок у точці влучання
      if (acc.crit) level.effects.burst(acc.point, 0xffd23f, 6, { speed: 3.2, up: 3.5, life: 0.55, size: 1.7 });
      level.effects.damageNumber(acc.point, acc.total, acc.crit);
    }
    if (anyHit) {
      level.audio.hit(anyHeadshot);
      level.stats.shotsHit++;
      level.bus.emit('hitmarker', anyHeadshot, this.cur, hitZone);
    }
  }

  _updateMeleeSwing(dt) {
    if (!this.meleeSwing) return;
    this.meleeSwing.t -= dt;
    if (this.meleeSwing.t > 0) return;
    const swing = this.meleeSwing;
    this.meleeSwing = null;
    this._resolveMeleeSwing(swing);
  }

  _resolveMeleeSwing({ weaponId, dmgMult }) {
    const w = WEAPONS[weaponId];
    if (!w || this.health <= 0) return;
    const level = this.level;
    const range = w.range || 3;
    const origin = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z);
    const dir = this.forwardVec(new THREE.Vector3()).setY(0).normalize();
    const lineHit = level.zombies?.hitTest(origin, dir, range);
    const missionEngine = level.missions && (level.missions.delegate || level.missions);
    const resourceHit = missionEngine?.resourceHitTest?.(origin, dir, range, weaponId);
    const barracksHit = missionEngine?.barracksHitTest?.(origin, dir, range);
    const destructibleHit = this.world.hitTestDestructible?.(origin, dir, range);
    const nearestEnemyT = lineHit?.t ?? Infinity;

    if (resourceHit && resourceHit.t < nearestEnemyT && (!barracksHit || resourceHit.t < barracksHit.t)
      && (!destructibleHit || resourceHit.t < destructibleHit.t)) {
      missionEngine.damageResource(resourceHit.node, resourceHit.point, weaponId);
      level.audio.hit(false);
      this._applyRecoil(w);
      return;
    }
    if (destructibleHit && destructibleHit.t < nearestEnemyT && (!barracksHit || destructibleHit.t < barracksHit.t)) {
      if (level.mirror && level.net.reportDestructibleHit) level.net.reportDestructibleHit(destructibleHit.destructible.id, Math.round(w.dmg * dmgMult));
      else this.world.damageDestructible(destructibleHit.destructible, w.dmg * dmgMult, destructibleHit.point);
      level.audio.hit(false);
      this._applyRecoil(w);
      return;
    }
    if (barracksHit && barracksHit.t < nearestEnemyT) {
      missionEngine.damageBarracks(w.dmg * dmgMult, barracksHit.point);
      level.effects.burst(barracksHit.point, 0xff8a3d, 8, { speed: 2.4, life: 0.4 });
      level.audio.hit(false);
      level.stats.shotsHit++;
      this._applyRecoil(w);
      return;
    }

    const hits = [];
    for (const zombie of level.zombies?.list || []) {
      if (zombie.state === 'dead' || Math.abs(zombie.y - this.pos.y) > 1.4) continue;
      const dx = zombie.x - this.pos.x;
      const dz = zombie.z - this.pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.2 || distance > range + zombie.rig.radius) continue;
      if ((dx * dir.x + dz * dir.z) / distance < Math.cos(35 * Math.PI / 180)) continue;
      const point = new THREE.Vector3(zombie.x, zombie.y + zombie.rig.height * 0.55, zombie.z);
      const ray = point.clone().sub(origin);
      const rayLen = ray.length();
      ray.normalize();
      if (this.world.shotBlockDist(origin, ray, rayLen) < rayLen - zombie.rig.radius) continue;
      hits.push({ zombie, point, distance });
    }
    hits.sort((a, b) => a.distance - b.distance);
    hits.length = Math.min(hits.length, w.cleave || 1);
    if (!hits.length) { this._applyRecoil(w); return; }

    const netHits = [];
    const falloff = [1, 0.75, 0.55];
    const baseDmg = level.soulCollector && weaponId === 'sword' ? 30 : w.dmg;
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const damage = baseDmg * dmgMult * falloff[i];
      const opts = { weaponId, hitZone: 'body', impactForce: w.impact || 4, staggerTime: w.stagger || 0.25 };
      if (level.mirror) netHits.push([hit.zombie.nid, Math.round(damage), 0, 0, 0, 'body', opts.impactForce, opts.staggerTime]);
      else { hit.zombie.lastHitBy = 1; hit.zombie.damage(damage, dir, false, opts); }
      level.effects.burst(hit.point, 0x86d14e, 8, { speed: 2.4, life: 0.4 });
      level.effects.damageNumber(hit.point, damage, false);
    }
    if (level.mirror) level.net.shotReport(weaponId, hits[0].point, netHits, [], [], false);
    else if (level.net) level.net.onLocalShot(weaponId, hits[0].point);
    level.audio.hit(false);
    level.stats.shotsHit++;
    level.bus.emit('hitmarker', false, weaponId, 'body');
    this._applyRecoil(w);
  }

  // віддача підкидає приціл ПІСЛЯ пострілу — куля летить туди, куди цілився
  _applyRecoil(w) {
    const recoil = w.recoil * (1 + this.fireHeat * 0.75);
    this.pitch = clamp(this.pitch + recoil * (0.6 + Math.random() * 0.7), -1.45, 1.45);
    this.yaw += (Math.random() - 0.5) * recoil * 0.4;
  }

  // 🚀 базука: летить ракета (соло — локально, кооп — через мережу), шкода — вибухом при влучанні.
  _fireRocket(origin, dmgMult) {
    const w = this.weapon;
    const level = this.level;
    const dir = this.forwardVec(this._shootDir).clone().normalize();
    const ro = origin.clone().addScaledVector(dir, 0.7);
    if (level.mirror) level.net.sendRocket(ro, dir, Math.round(w.dmg * dmgMult));
    else if (level.net) level.net.spawnNetRocket(ro, dir, Math.round(w.dmg * dmgMult));
    else level.effects.spawnRocket(ro, dir, w.dmg * dmgMult, null, 1, true);
    level.audio.rocket();
    this.camShake = Math.max(this.camShake, 0.5);
    this._applyRecoil(w);
  }

  // 🔋 паливна зброя: безперервна стрільба з дренажем палива і щокадровою шкодою.
  // held — тримають вогонь (mouseDown). При fuel<=0 — клац-порожньо.
  _fireContinuous(dt, held) {
    const w = this.weapon;
    const shkval = !!(this.superPower && this.superPower.type === 'shkval');
    const fuel = this.fuel[this.cur] || 0;
    if (!held) { this._contWasEmpty = false; return; }
    if (fuel <= 0 && !shkval) {
      // балон вичерпано → автоматична перезарядка (разовий «клац», далі reload)
      if (!this._contWasEmpty) { this._contWasEmpty = true; this.level.audio.empty(); }
      this.startReload();
      return;
    }
    this._contWasEmpty = false;
    // дренаж палива (не нижче 0) — «Шквал» тримає балон повним
    if (!shkval) this.fuel[this.cur] = Math.max(0, fuel - dt);
    this.gunKick = Math.min(0.5, this.gunKick + dt * 2); // легке тремтіння ствола
    const level = this.level;
    const dmgMult = this.damageMult * (this.damageTotemMult || 1) * (this.buffs.rage > 0 ? 2 : 1) * momentumStats(level.combo).damage;
    const dmgThisFrame = w.dps * dmgMult * dt;

    // точка вильоту (як у _shoot)
    const origin = this.firstPerson
      ? this._shootOrigin.set(this.pos.x, this.pos.y + 1.62, this.pos.z)
      : this._shootOrigin.copy(this.camera.position);
    const dir = this.forwardVec(this._shootDir).normalize();
    const arms = this.firstPerson ? this.fpArms[this.cur] : this.tpGuns[this.cur];
    arms.muzzle.getWorldPosition(this._muzzlePos);

    // дросселюємо звук/число-маркер, щоб не сипати щокадру
    this._contSfxT = (this._contSfxT || 0) - dt;
    const netReport = level.mirror && level.net ? { endPoint: null, hits: [] } : null;
    let anyHit = false;
    if (w.beam) anyHit = this._laserBeam(origin, dir, w, dmgThisFrame, level, netReport);
    else if (w.flame) anyHit = this._flameCone(origin, dir, w, dmgThisFrame, level, netReport);
    if (netReport && (netReport.endPoint || netReport.hits.length)) {
      level.net.shotReport(this.cur, netReport.endPoint, netReport.hits);
    }

    if (this._contSfxT <= 0) {
      this._contSfxT = 0.11;
      level.zombies?.hearShot?.(this.pos.x, this.pos.z, w.beam ? 30 : 18);
      if (w.beam) level.audio.beamTick(); else level.audio.flameTick();
      this._contAudio = true;
      // ponytail: лік дроселюємо разом зі звуком (~9/с). Без цього континуалка
      // накручує ~300 «пострілів» за балон і робить статистику точності сміттям.
      if (anyHit) level.stats.shotsHit++;
      level.stats.shotsFired++;
    }
  }

  // 🔫 ЛАЗЕР: миттєвий промінь-хітскан уперед, пробиває кількох зомбі на лінії.
  _laserBeam(origin, dir, w, dmg, level, netReport = null) {
    const MAX_D = w.range;
    let anyHit = false;
    let endPoint = this._shootEnd.copy(origin).addScaledVector(dir, MAX_D);
    const destructibleHit = this.world.hitTestDestructible?.(origin, dir, MAX_D);
    if (level.zombies) {
      let pierceLeft = w.pierce;
      let from = origin;
      let travelled = 0;
      let first = true;
      while (pierceLeft > 0 && travelled < MAX_D) {
        const hit = level.zombies.hitTest(from, dir, MAX_D - travelled);
        if (!hit) break;
        const wallT = this.world.shotBlockDist(from, dir, hit.t);
        if (first && destructibleHit && destructibleHit.t <= wallT + 0.25 && destructibleHit.t < hit.t) {
          if (level.mirror && level.net.reportDestructibleHit) level.net.reportDestructibleHit(destructibleHit.destructible.id, dmg);
          else this.world.damageDestructible(destructibleHit.destructible, dmg, destructibleHit.point);
          endPoint = destructibleHit.point;
          anyHit = true;
          break;
        }
        if (wallT < hit.t) { // стіна раніше за зомбі — промінь гаснемо об стіну
          endPoint = this._shootEnd.copy(from).addScaledVector(dir, wallT);
          first = false;
          break;
        }
        // соло/хост б'є локально; гість (mirror) репортить влучання, шкоду рахує хост
        const zone = hit.hitZone || (hit.headshot ? 'head' : 'body');
        const dealt = dmg * (HIT_ZONE_MULT[zone] || 1);
        if (level.mirror) netReport?.hits.push([hit.zombie.nid, Math.round(dealt), hit.headshot ? 1 : 0, 0, 0, zone, 1, 0]);
        else { hit.zombie.lastHitBy = 1; hit.zombie.damage(dealt, dir, hit.headshot, { weaponId: this.cur, hitZone: zone, impactSide: hit.impactSide, impactForce: 1, staggerTime: 0 }); }
        anyHit = true;
        endPoint = hit.point;
        // легке свічення/іскри в точці влучання (без важких ефектів)
        level.effects.burst(hit.point, 0x66ffff, 2, { speed: 2, up: 1, life: 0.18, size: 0.5 });
        travelled += hit.t + 0.4;
        from = hit.point.clone().addScaledVector(dir, 0.4);
        pierceLeft--;
        first = false;
      }
      if (first) {
        // нікого не зачепили — перевіряємо лише стіну
        const wallT = this.world.shotBlockDist(origin, dir, MAX_D);
        if (destructibleHit && destructibleHit.t <= wallT + 0.25) {
          if (level.mirror && level.net.reportDestructibleHit) level.net.reportDestructibleHit(destructibleHit.destructible.id, dmg);
          else this.world.damageDestructible(destructibleHit.destructible, dmg, destructibleHit.point);
          endPoint = destructibleHit.point;
          anyHit = true;
        } else if (wallT < MAX_D) endPoint = this._shootEnd.copy(origin).addScaledVector(dir, wallT);
      }
    }
    const missionEngine = level.missions && (level.missions.delegate || level.missions);
    const barracksHit = missionEngine && missionEngine.barracksHitTest
      ? missionEngine.barracksHitTest(origin, dir, MAX_D) : null;
    if (barracksHit && barracksHit.t <= this.world.shotBlockDist(origin, dir, barracksHit.t + 0.1)) {
      missionEngine.damageBarracks(dmg, barracksHit.point);
      endPoint = barracksHit.point;
      anyHit = true;
    }
    // яскравий ціановий промінь від ствола до точки влучання (перевикористовуємо trace-пул)
    if (netReport) netReport.endPoint = { x: endPoint.x, y: endPoint.y, z: endPoint.z };
    level.effects.laserBeam(this._muzzlePos, endPoint);
    return anyHit;
  }

  // 🔥 ВОГНЕМЕТ: короткий конус полум'я. Шкода спадає з дистанцією; тип шкоди «вогонь».
  _flameCone(origin, dir, w, dmg, level, netReport = null) {
    let anyHit = false;
    if (level.zombies) {
      for (const z of level.zombies.list) {
        if (z.state === 'dead') continue;
        const dx = z.x - origin.x;
        const dy = (z.y + z.rig.height * 0.5) - origin.y;
        const dz = z.z - origin.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 0.3 || d > w.range) continue;
        const dot = (dir.x * dx + dir.y * dy + dir.z * dz) / d;
        if (dot < w.coneCos) continue; // поза конусом
        // стіна між гравцем і зомбі гасить полум'я
        this._flameDir = this._flameDir || new THREE.Vector3();
        this._flameDir.set(dx / d, dy / d, dz / d);
        if (this.world.shotBlockDist(origin, this._flameDir, d) < d) continue;
        // лінійний спад шкоди з дистанцією (повна у впор → ~0 на краю)
        const falloff = 1 - (d / w.range) * 0.85;
        // 🔥 ТИП ШКОДИ «вогонь» (v47-гак): передаємо опції з прапорцем fire.
        // соло/хост б'є локально; гість (mirror) репортить влучання, шкоду рахує хост
        if (level.mirror) netReport?.hits.push([z.nid, Math.round(dmg * falloff), 0]);
        else { z.lastHitBy = 1; z.damage(dmg * falloff, this._flameDir.clone(), false, { fire: true }); }
        anyHit = true;
      }
    }
    const missionEngine = level.missions && (level.missions.delegate || level.missions);
    const barracksHit = missionEngine && missionEngine.barracksHitTest
      ? missionEngine.barracksHitTest(origin, dir, w.range) : null;
    if (barracksHit) {
      const falloff = 1 - (barracksHit.t / w.range) * 0.65;
      const dealt = dmg * Math.max(0.35, falloff);
      missionEngine.damageBarracks(dealt, barracksHit.point);
      anyHit = true;
    }
    // конус вогняних частинок (перевикористовуємо систему частинок effects.js)
    level.effects.flameCone(this._muzzlePos, dir, w.range);
    return anyHit;
  }

  // 🔋 поповнити паливо паливних зброй (airdrop/ammo-pickup/магазин). secs — секунд балона.
  addFuel(secs) {
    for (const id of WEAPON_SLOTS) {
      const cfg = WEAPONS[id];
      if (cfg && cfg.continuous) {
        this.fuel[id] = Math.min(cfg.fuelMax, (this.fuel[id] || 0) + secs);
      }
    }
  }

  // 🔋 наповнити балон конкретної зброї повністю (розблокування/старт рівня)
  refillFuel(id) {
    const cfg = WEAPONS[id];
    if (cfg && cfg.continuous) this.fuel[id] = cfg.fuelMax;
  }

  takeDamage(amt, fromX, fromZ) {
    if (this.respawnProtect > 0 || this.health <= 0) return;
    if (this.level.playground) return;
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
    const sourceYaw = Math.atan2(-(fromX - this.pos.x), -(fromZ - this.pos.z));
    this.level.bus.emit('playerHurt', { angle: sourceYaw - this.yaw });
    if (this.health <= 0) {
      // 🪬 тотем безсмертя: рятує від смерті 1 раз — воскресає замість гинути
      if (this.reviveCharges > 0) {
        this.reviveCharges--;
        this.health = Math.ceil(this.maxHealth * 0.5);
        this.respawnProtect = 2; // коротка невразливість після воскресіння
        if (this.level.effects) this.level.effects.totemBurst(this.pos.clone().setY(this.pos.y + 1.0));
        this.level.audio.powerup();
        this.level.bus.emit('toast', t('🪬 Тотем урятував тебе!'));
        this.level.bus.emit('playerRevived', { kind: 'totem' });
        return;
      }
      this.health = 0;
      this.level.bus.emit('playerDied');
    }
  }

  heal(amt) {
    if (this.health <= 0) return false;
    if (this.health >= this.maxHealth) return false;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amt);
    const healed = this.health - before;
    const game = this.level && this.level.game;
    if (healed > 0 && game && game.quests && !this.level.playground) {
      this._questHealAcc = (this._questHealAcc || 0) + healed;
      const whole = Math.floor(this._questHealAcc);
      if (whole > 0) {
        this._questHealAcc -= whole;
        game.quests.onEvent('heal', { n: whole });
      }
    }
    return true;
  }

  respawn() {
    if (this.level.mirror) this.level.net.sendRespawned();
    const gy = this.world.groundH(this.L.SPAWN.x, this.L.SPAWN.z);
    this.pos.set(this.L.SPAWN.x, gy, this.L.SPAWN.z);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.inCastleDungeon = false;
    this.health = this.maxHealth;
    this.respawnProtect = 3;
    this.ammo[this.cur].mag = this.weapon.mag;
    this.reloading = 0;
    this._camInit = false;
    this.level.bus.emit('playerRevived', { kind: 'respawn' });
  }
}
