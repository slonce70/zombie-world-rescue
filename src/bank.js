import * as THREE from 'three';
import { t } from './i18n.js';

export const BANK_UNLOCK_COUNTRIES = 7;
export const BANK_ROOM_W = 55;
export const BANK_ROOM_D = 23;
export const BANK_SAFE_HP = 500;

export class BankMode {
  constructor(level) {
    this.level = level;
    this.roomW = BANK_ROOM_W;
    this.roomD = BANK_ROOM_D;
    this.target = 1;
    this.completed = false;
    this.over = false;
    this.spawnT = 5;
    this.prompt = null;
    this.missions = [];
    this.civilians = [];
    this.bossStarted = false;
    this.bossUnlocked = false;
    this.allDone = false;
    const a = level.world.layout.arena || { x: 0, z: 0 };
    this.cx = a.x;
    this.cz = a.z;
    this._hx = this.roomW / 2;
    this._hz = this.roomD / 2;
    this.floorY = level.world.groundH(this.cx, this.cz) + 0.08;
    this.safes = [];
    this._buildRoom();
  }

  get(id) { void id; return null; }

  getHudList() {
    const liveSafes = this.safes.filter((s) => s.hp > 0).length;
    return [
      { icon: '🏦', title: t('БАНК'), done: false },
      { icon: '🔐', title: t('Зламай сейф: живих {n}/2', { n: liveSafes }), done: this.completed },
      { icon: '🧟', title: t('Кожні 5с біля сейфів зʼявляються 10 зомбі'), done: false },
      { icon: '🪄', title: t('Посох і пістолет. Без магазину, гаджетів, бафів і пікапів.'), done: false },
    ];
  }

  getMarkers() {
    const out = this.safes.filter((s) => s.hp > 0).map((s) => ({ x: s.x, z: s.z, color: '#ffd23f', icon: '🔐' }));
    for (const z of this.level.zombies.list) {
      if (z.bank && z.state !== 'dead') out.push({ x: z.x, z: z.z, color: '#ff5d73', icon: '🧟' });
    }
    return out;
  }

  update(dt) {
    this._clampActor(this.level.player);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT += 5;
      this._spawnWave();
    }
    for (const z of this.level.zombies.list) {
      if (!z.bank || z.state === 'dead') continue;
      this._clampZombie(z);
      const safe = this._nearestLiveSafe(z.x, z.z);
      if (!safe) continue;
      const dx = safe.x - z.x;
      const dz = safe.z - z.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 2.1) {
        const step = Math.min(d - 2.1, dt * (z.stats?.speed || 2.2) * 0.6);
        z.x += (dx / d) * step;
        z.z += (dz / d) * step;
        z.aggroed = false;
        z.state = 'wander';
      } else {
        this.damageSafe(safe, (z.stats?.dmg || 10) * dt, false);
      }
      this._damagePlayerIfClose(z, dt);
    }
    if (!this.over && this.safes.every((s) => s.hp <= 0)) this.level.game._endBankRun(false);
  }

  safeHitTest(origin, dir, maxD) {
    let best = null;
    for (const safe of this.safes) {
      if (safe.hp <= 0) continue;
      const c = safe.pos;
      const oc = c.clone().sub(origin);
      const tHit = oc.dot(dir);
      if (tHit < 0 || tHit > maxD) continue;
      const p = origin.clone().addScaledVector(dir, tHit);
      if (p.distanceTo(c) > 1.6) continue;
      if (!best || tHit < best.t) best = { safe, t: tHit, point: p };
    }
    return best;
  }

  damageSafe(safe, dmg, byPlayer = true) {
    if (!safe || safe.hp <= 0 || this.over) return;
    safe.hp = Math.max(0, safe.hp - dmg);
    if (safe.bar) safe.bar.scale.x = Math.max(0.02, safe.hp / safe.maxHp);
    if (byPlayer) this.level.effects.damageNumber(safe.pos.clone().setY(this.floorY + 1.7), Math.round(dmg), false);
    if (safe.hp <= 0) {
      safe.group.visible = false;
      if (byPlayer) {
        this.completed = true;
        this.level.game._endBankRun(true);
      }
    }
  }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
      safesLeft: this.safes.filter((s) => s.hp > 0).length,
    };
  }

  _buildRoom() {
    const { level, cx, cz, _hx: hx, _hz: hz } = this;
    const wallM = new THREE.MeshStandardMaterial({ color: 0x28323f, roughness: 0.85, metalness: 0.05 });
    const floorM = new THREE.MeshStandardMaterial({ color: 0x516070, roughness: 0.9 });
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomW - 1, d: this.roomD - 1, top: this.floorY });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomW, 0.16, this.roomD), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), wallM);
      wall.position.set(x, this.floorY + 1.4, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      level.scene.add(wall);
    };
    mkWall(cx, cz - hz, this.roomW, 0.4);
    mkWall(cx, cz + hz, this.roomW, 0.4);
    mkWall(cx - hx, cz, 0.4, this.roomD);
    mkWall(cx + hx, cz, 0.4, this.roomD);
    this._addSafe(cx - 12, cz);
    this._addSafe(cx + 12, cz);
  }

  _addSafe(x, z) {
    const group = new THREE.Group();
    const bodyM = new THREE.MeshStandardMaterial({ color: 0x9aa7b3, roughness: 0.45, metalness: 0.35 });
    const doorM = new THREE.MeshStandardMaterial({ color: 0x59636f, roughness: 0.45, metalness: 0.45 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.3, 1.6), bodyM);
    body.position.y = 1.15;
    body.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 0.14), doorM);
    door.position.set(0, 1.15, -0.84);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 16), doorM);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(0.55, 1.15, -0.93);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: 0x4dd6a8 }));
    bar.position.set(0, 2.55, 0);
    group.add(body, door, knob, bar);
    group.position.set(x, this.floorY, z);
    this.level.scene.add(group);
    this.safes.push({ x, z, pos: new THREE.Vector3(x, this.floorY + 1.15, z), hp: BANK_SAFE_HP, maxHp: BANK_SAFE_HP, group, bar });
  }

  _spawnWave() {
    const types = ['walker', 'runner', 'imp', 'spitter', 'walker'];
    for (let s = 0; s < this.safes.length; s++) {
      const safe = this.safes[s];
      if (safe.hp <= 0) continue;
      for (let i = 0; i < 5; i++) {
        const side = s === 0 ? -1 : 1;
        const x = safe.x + side * (4 + i * 0.7);
        const z = safe.z + (i - 2) * 1.4;
        const zb = this.level.zombies.spawn(types[(s * 5 + i) % types.length], x, z, {
          noLeash: true,
          anchor: { x: this.cx, z: this.cz, r: Math.max(this._hx, this._hz) },
        });
        zb.bank = true;
        zb.stats = { ...zb.stats, coins: 0 };
        zb.aggroed = false;
        zb.state = 'wander';
        this._clampZombie(zb);
      }
    }
  }

  _nearestLiveSafe(x, z) {
    let best = null, bestD = Infinity;
    for (const s of this.safes) {
      if (s.hp <= 0) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  _clampActor(p) {
    const x = Math.max(this.cx - this._hx + 1, Math.min(this.cx + this._hx - 1, p.pos.x));
    const z = Math.max(this.cz - this._hz + 1, Math.min(this.cz + this._hz - 1, p.pos.z));
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
    if (p.pos.y < this.floorY) {
      p.pos.y = this.floorY;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
    }
  }

  _clampZombie(z) {
    z.x = Math.max(this.cx - this._hx + 1, Math.min(this.cx + this._hx - 1, z.x));
    z.z = Math.max(this.cz - this._hz + 1, Math.min(this.cz + this._hz - 1, z.z));
    z.y = this.floorY;
    if (z.rig && z.rig.group) z.rig.group.position.y = this.floorY;
  }

  _damagePlayerIfClose(z, dt) {
    const p = this.level.player;
    if (!p || p.health <= 0 || p.pos.y - this.floorY > 3) return;
    if (Math.hypot(p.pos.x - z.x, p.pos.z - z.z) > 1.8) return;
    p.takeDamage((z.stats?.dmg || 10) * dt, z.x, z.z);
  }
}
