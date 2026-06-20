// Віддалений гравець: ріг героя зі скіном, нік над головою, смужка HP,
// зброя в руці, плавна інтерполяція позиції зі снапшотів.
import * as THREE from 'three';
import { makeHero, makeGunMesh, makeDog, setAnim, updateRig, bakeGroupMeshes } from '../characters.js';
import { damp, dampAngle } from '../utils.js';
import { PF, idxToWeapon } from './protocol.js';
import { t } from '../i18n.js';

const WEAPON_SLOTS = ['pistol', 'rifle', 'shotgun', 'smg', 'magnum', 'sniper', 'bazooka'];

function makeNameSprite(nick) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = '900 56px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(10, 20, 30, 0.9)';
  ctx.strokeText(nick, 256, 50);
  ctx.fillStyle = '#9fe8ff';
  ctx.fillText(nick, 256, 50);
  const tex = new THREE.CanvasTexture(cv);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(2.6, 0.65, 1);
  spr.renderOrder = 5;
  return { spr, ctx, cv, tex };
}

export class RemotePlayer {
  constructor(level, pid, info) {
    this.level = level;
    this.pid = pid;
    this.nick = info.nick || t('Гравець {n}', { n: pid });
    this.skin = info.skin || 'classic';
    this.tracer = info.tracer || 'classic';

    this.rig = makeHero(this.skin, info.hero || null);
    level.scene.add(this.rig.group);

    // зброя в правій руці (як tpGuns у player.js)
    this.guns = {};
    for (const w of WEAPON_SLOTS) {
      const gun = makeGunMesh(w);
      bakeGroupMeshes(gun.group, { outline: 0.012 });
      gun.group.rotation.x = -Math.PI / 2;
      gun.group.position.set(0, -0.62, -0.05);
      gun.group.scale.setScalar(1.35);
      this.rig.parts.armR.add(gun.group);
      gun.group.visible = w === 'pistol';
      this.guns[w] = gun;
    }
    this.curWeapon = 'pistol';

    // нік + смужка HP над головою
    const name = makeNameSprite(this.nick);
    this.nameSpr = name.spr;
    this.nameSpr.position.y = 2.45;
    this.rig.group.add(this.nameSpr);
    const barCv = document.createElement('canvas');
    barCv.width = 128; barCv.height = 16;
    this.barCtx = barCv.getContext('2d');
    this.barTex = new THREE.CanvasTexture(barCv);
    this.barSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, transparent: true, depthTest: false }));
    this.barSpr.scale.set(1.1, 0.14, 1);
    this.barSpr.position.y = 2.12;
    this.barSpr.renderOrder = 5;
    this.rig.group.add(this.barSpr);
    this._lastBarPct = -1;
    this._drawBar(1);

    // 🛡️ бульбашка гаджет-щита
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 14, 10),
      new THREE.MeshBasicMaterial({
        color: 0x4fd8ff, transparent: true, opacity: 0.2,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.shieldMesh.visible = false;
    this.shieldMesh.position.y = 1.1;
    this.rig.group.add(this.shieldMesh);

    // цільові значення зі снапшотів (плавно доганяємо)
    this.pos = new THREE.Vector3(0, -100, 0);
    this.target = new THREE.Vector3(0, -100, 0);
    this.yaw = 0;
    this.targetYaw = 0;
    this.pitch = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.flags = 0;
    this.rideIdx = -1;
    this.emote = null;
    this._hasFirst = false;
    this._speed = 0;
    this._danceSpin = 0;

    // 🐶 песик власника видно всім (косметика, біжить за хазяїном локально)
    this.dog = null;
    if (info.dog) {
      this.dog = makeDog();
      this.dog.x = 0; this.dog.z = 0; this.dog.yaw = 0;
      this.dog.group.visible = false;
      level.scene.add(this.dog.group);
    }
  }

  // прийшов снапшот
  apply(x, y, z, yaw, pitch, hp, mhp, weapIdx, flags, rideIdx, emote) {
    this.target.set(x, y, z);
    this.targetYaw = yaw;
    this.pitch = pitch;
    this.health = hp;
    this.maxHealth = mhp || 100;
    this.flags = flags;
    this.rideIdx = rideIdx;
    this.emote = emote || null;
    const w = idxToWeapon(weapIdx);
    if (w !== this.curWeapon) {
      this.guns[this.curWeapon].group.visible = false;
      this.guns[w].group.visible = true;
      this.curWeapon = w;
    }
    if (!this._hasFirst) {
      this._hasFirst = true;
      this.pos.copy(this.target);
      this.yaw = yaw;
    }
  }

  update(dt) {
    if (!this._hasFirst) return;
    // телепорт при великій похибці (респавн, батут)
    if (this.pos.distanceTo(this.target) > 12) this.pos.copy(this.target);
    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x = damp(this.pos.x, this.target.x, 14, dt);
    this.pos.y = damp(this.pos.y, this.target.y, 14, dt);
    this.pos.z = damp(this.pos.z, this.target.z, 14, dt);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 12, dt);
    this._speed = damp(this._speed, Math.hypot(this.pos.x - prevX, this.pos.z - prevZ) / Math.max(dt, 1e-4), 8, dt);

    const g = this.rig.group;
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    const dead = (this.flags & PF.DEAD) !== 0;
    this.shieldMesh.visible = !dead && (this.flags & PF.SHIELD) !== 0;
    if (this.shieldMesh.visible) this.shieldMesh.rotation.y += dt * 0.4;

    if (dead) {
      setAnim(this.rig, 'die');
    } else if (this.flags & PF.RIDING) {
      setAnim(this.rig, 'ride');
    } else if (this.emote) {
      if (this.emote === 'spin') { this._danceSpin += dt * 7; g.rotation.y = this.yaw + this._danceSpin; }
      this.rig.anim.danceStyle = this.emote;
      setAnim(this.rig, 'dance');
    } else {
      this._danceSpin = 0;
      setAnim(this.rig, 'aim');
      this.rig.anim.speed = this._speed;
      this.rig.anim.aimPitch = this.pitch;
    }
    updateRig(this.rig, dt);

    // 🐶 песик дріботить за хазяїном
    if (this.dog) {
      const g = this.dog;
      if (!g.group.visible && this._hasFirst) {
        g.x = this.pos.x + 1.5; g.z = this.pos.z + 1.5;
        g.group.visible = true;
      }
      const tx = this.pos.x + Math.sin(this.yaw + 2.4) * 1.7;
      const tz = this.pos.z + Math.cos(this.yaw + 2.4) * 1.7;
      const dx = tx - g.x, dz = tz - g.z;
      const d = Math.hypot(dx, dz);
      if (d > 35) { g.x = tx; g.z = tz; }
      const spd = d > 8 ? 9.5 : d > 1.1 ? 5.5 : 0;
      let moving = false;
      if (spd > 0 && d > 0.1) {
        g.x += (dx / d) * spd * dt;
        g.z += (dz / d) * spd * dt;
        g.yaw = Math.atan2(-dx, -dz);
        moving = true;
      }
      const gy = this.level.world.groundH(g.x, g.z);
      g.phase = (g.phase || 0) + dt * (moving ? 14 : 3);
      g.legs.forEach((leg, i) => {
        leg.rotation.x = moving ? Math.sin(g.phase + (i % 2) * Math.PI) * 0.7 : 0;
      });
      g.tail.rotation.z = Math.sin(g.phase * 1.6) * 0.5;
      g.group.position.set(g.x, gy, g.z);
      g.group.rotation.y += (g.yaw - g.group.rotation.y) * Math.min(1, dt * 9);
    }

    // HP-бар
    const pct = Math.max(0, Math.min(1, this.health / this.maxHealth));
    if (Math.abs(pct - this._lastBarPct) > 0.01) this._drawBar(pct);
    // нік згасає вдалині
    const me = this.level.player;
    const d = me ? Math.hypot(me.pos.x - this.pos.x, me.pos.z - this.pos.z) : 0;
    const fade = d > 60 ? Math.max(0, 1 - (d - 60) / 30) : 1;
    this.nameSpr.material.opacity = fade;
    this.barSpr.material.opacity = fade;
  }

  _drawBar(pct) {
    this._lastBarPct = pct;
    const ctx = this.barCtx;
    ctx.clearRect(0, 0, 128, 16);
    ctx.fillStyle = 'rgba(10,18,26,0.8)';
    ctx.fillRect(0, 0, 128, 16);
    ctx.fillStyle = pct > 0.5 ? '#4cff7a' : pct > 0.25 ? '#ffd23f' : '#ff5d5d';
    ctx.fillRect(2, 2, 124 * pct, 12);
    this.barTex.needsUpdate = true;
  }

  // постріл віддаленого гравця: трасер з дула + звук
  muzzleWorld(out) {
    const gun = this.guns[this.curWeapon];
    if (gun && gun.muzzle) return gun.muzzle.getWorldPosition(out);
    out.copy(this.pos); out.y += 1.4;
    return out;
  }

  dispose() {
    this.level.scene.remove(this.rig.group);
    if (this.dog) this.level.scene.remove(this.dog.group);
    // звільняємо унікальні per-instance GPU-ресурси (запечена гео тіла/зброї, нік+HP канвас-текстури,
    // сфера щита). Спільні кеші (toonMat/bakedMat/cachedGeo, позначені userData.shared) НЕ чіпаємо —
    // вони живуть на весь сеанс. Без цього кожен дисконект/реконнект лишав би їх у пам'яті GPU.
    this._free(this.rig.group);
    if (this.dog) this._free(this.dog.group);
  }

  _free(root) {
    if (!root) return;
    root.traverse((o) => {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (!m || (m.userData && m.userData.shared)) return;
          if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose();
          m.dispose();
        });
      }
    });
  }
}
