// Гравець: рух, камера FP/TP, зброя, стрільба
import * as THREE from 'three';
import { makeHero, makeGunMesh, makeFPArms, updateRig, setAnim } from './characters.js';
import { LAYOUT } from './world.js';
import { clamp, damp, lerp } from './utils.js';

export const WEAPONS = {
  pistol: { name: 'Пістолет', dmg: 34, rpm: 320, mag: 12, spread: 0.012, auto: false, reloadT: 1.0, recoil: 0.028, infinite: true },
  rifle: { name: 'Автомат', dmg: 21, rpm: 620, mag: 30, spread: 0.02, auto: true, reloadT: 1.5, recoil: 0.013, infinite: false },
};

export class Player {
  constructor(level) {
    this.level = level;
    const { scene, world } = level;
    this.world = world;

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 1200);
    scene.add(this.camera);

    const gy = world.groundH(LAYOUT.SPAWN.x, LAYOUT.SPAWN.z);
    this.pos = new THREE.Vector3(LAYOUT.SPAWN.x, gy, LAYOUT.SPAWN.z);
    this.vel = new THREE.Vector3();
    this.yaw = 0; // дивимось на північ (-Z), до села
    this.pitch = 0;
    this.onGround = true;

    this.maxHealth = 100;
    this.health = 100;
    this.speedMult = 1;
    this.damageMult = 1;
    this.respawnProtect = 0;

    this.weapons = ['pistol'];
    this.cur = 'pistol';
    this.ammo = {
      pistol: { mag: WEAPONS.pistol.mag, reserve: Infinity },
      rifle: { mag: WEAPONS.rifle.mag, reserve: 120 },
    };
    this.shootCd = 0;
    this.reloading = 0;
    this.firstPerson = true;

    // герой для виду від 3-ї особи
    this.rig = makeHero();
    scene.add(this.rig.group);
    this.tpGuns = {};
    for (const w of ['pistol', 'rifle']) {
      const gun = makeGunMesh(w);
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
    for (const w of ['pistol', 'rifle']) {
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

    this.bobPhase = 0;
    this.bobAmp = 0;
    this.gunKick = 0;
    this.camShake = 0;
    this.fovTarget = 75;
    this._camPos = new THREE.Vector3();
    this._camInit = false;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this._applyView();
  }

  get weapon() { return WEAPONS[this.cur]; }
  get curAmmo() { return this.ammo[this.cur]; }

  forwardVec(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  _applyView() {
    this.rig.group.visible = !this.firstPerson;
    for (const w of ['pistol', 'rifle']) {
      this.fpArms[w].group.visible = this.firstPerson && w === this.cur;
      this.tpGuns[w].group.visible = !this.firstPerson && w === this.cur;
    }
  }

  switchWeapon(w) {
    if (!this.weapons.includes(w) || this.cur === w) return;
    this.cur = w;
    this.reloading = 0;
    this.shootCd = Math.max(this.shootCd, 0.25);
    this._applyView();
    this.level.audio.click();
  }

  giveRifle() {
    if (!this.weapons.includes('rifle')) {
      this.weapons.push('rifle');
      this.switchWeapon('rifle');
    }
  }

  addAmmo(n) {
    this.ammo.rifle.reserve = Math.min(240, this.ammo.rifle.reserve + n);
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

    // --- огляд ---
    if (allowControl) {
      const { dx, dy } = input.consumeMouse();
      const sens = 0.0023;
      this.yaw -= dx * sens;
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
    }
    const moving = (mx !== 0 || mz !== 0);
    const sprint = moving && (input.down('ShiftLeft') || input.down('ShiftRight'));
    const speed = 5.6 * this.speedMult * (sprint ? 1.55 : 1);
    let tx = 0, tz = 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      tx = (fx * -mz + rx * mx) * speed;
      tz = (fz * -mz + rz * mx) * speed;
    }
    const accel = this.onGround ? 14 : 4;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.z = damp(this.vel.z, tz, accel, dt);

    // стрибок і гравітація
    if (allowControl && input.pressed('Space') && this.onGround) {
      this.vel.y = 7.6;
      this.onGround = false;
    }
    this.vel.y -= 21 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    const gh = world.groundH(this.pos.x, this.pos.z);
    if (this.pos.y <= gh) {
      this.pos.y = gh;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > gh + 0.05) {
      this.onGround = false;
    }
    const solved = world.collide(this.pos.x, this.pos.z, 0.45);
    this.pos.x = solved.x;
    this.pos.z = solved.z;

    // --- перемикання ---
    if (allowControl) {
      if (input.pressed('Digit1')) this.switchWeapon('pistol');
      if (input.pressed('Digit2')) this.switchWeapon('rifle');
      if (input.pressed('KeyV')) {
        this.firstPerson = !this.firstPerson;
        this._applyView();
      }
      if (input.pressed('KeyR')) this.startReload();
    }

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
    if (allowControl && this.reloading <= 0) {
      const w = this.weapon;
      const trigger = w.auto ? input.mouseDown : input.justClicked;
      if (trigger && this.shootCd <= 0) {
        if (this.curAmmo.mag > 0) this._shoot();
        else {
          this.level.audio.empty();
          this.shootCd = 0.35;
          this.startReload();
        }
      }
    }

    // --- анімація і камера ---
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmp = damp(this.bobAmp, this.onGround ? Math.min(1, hSpeed / 5) : 0, 8, dt);
    this.bobPhase += dt * (4 + hSpeed * 1.15);
    this.gunKick = Math.max(0, this.gunKick - dt * 7);
    this.camShake = Math.max(0, this.camShake - dt * 3);
    this.fovTarget = sprint ? 82 : 75;
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
      this.rig.group.rotation.y = this.yaw;
      setAnim(this.rig, 'aim');
      this.rig.anim.speed = hSpeed;
      this.rig.anim.aimPitch = this.pitch;
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
    this.pitch = clamp(this.pitch + w.recoil * (0.6 + Math.random() * 0.7), -1.45, 1.45);
    this.yaw += (Math.random() - 0.5) * w.recoil * 0.4;
    level.audio.shot(this.cur);
    level.stats.shotsFired++;

    // промінь із камери через приціл (з розкидом)
    const origin = this._shootOrigin.copy(this.camera.position);
    const dir = this.forwardVec(this._shootDir);
    const spreadMult = (this.bobAmp > 0.5 ? 1.6 : 1);
    dir.x += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
    dir.y += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
    dir.z += (Math.random() - 0.5) * w.spread * 2 * spreadMult;
    dir.normalize();

    const MAX_D = 140;
    const hit = level.zombies ? level.zombies.hitTest(origin, dir, MAX_D) : null;
    const blockT = this.world.shotBlockDist(origin, dir, hit ? hit.t : MAX_D);

    let endPoint;
    if (blockT < (hit ? hit.t : Infinity)) {
      endPoint = this._shootEnd.copy(origin).addScaledVector(dir, blockT);
      level.effects.burst(endPoint, 0xb09a72, 5, { speed: 2, life: 0.35, size: 0.7 });
    } else if (hit) {
      endPoint = hit.point;
      const dmg = w.dmg * this.damageMult * (hit.headshot ? 2 : 1);
      hit.zombie.damage(dmg, dir, hit.headshot);
      level.effects.burst(hit.point, 0x86d14e, 8, { speed: 2.6, life: 0.45 });
      level.audio.hit(hit.headshot);
      level.stats.shotsHit++;
      level.bus.emit('hitmarker', hit.headshot);
    } else {
      endPoint = this._shootEnd.copy(origin).addScaledVector(dir, MAX_D);
    }

    // трасер від дула
    const arms = this.firstPerson ? this.fpArms[this.cur] : this.tpGuns[this.cur];
    arms.muzzle.getWorldPosition(this._muzzlePos);
    level.effects.tracer(this._muzzlePos, endPoint);
    level.effects.muzzleFlash(this._muzzlePos);
  }

  takeDamage(amt, fromX, fromZ) {
    if (this.respawnProtect > 0 || this.health <= 0) return;
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
    const gy = this.world.groundH(LAYOUT.SPAWN.x, LAYOUT.SPAWN.z);
    this.pos.set(LAYOUT.SPAWN.x, gy, LAYOUT.SPAWN.z);
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
