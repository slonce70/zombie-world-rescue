import * as THREE from 'three';
import { t } from './i18n.js';

export const PORTAL_UNLOCK_COUNTRIES = 9;
export const PORTAL_HP = 1222;
export const PORTAL_ROOM_SIZE = 70;

export class PortalMode {
  constructor(level) {
    this.level = level;
    this.roomSize = PORTAL_ROOM_SIZE;
    this.target = 3;
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
    this._half = this.roomSize / 2;
    this.floorY = level.world.groundH(this.cx, this.cz) + 0.08;
    this.portals = [];
    this._clearRoomBlockers();
    this._buildRoom();
  }

  get(id) { void id; return null; }

  getHudList() {
    return [
      { icon: '🌀', title: t('ПОРТАЛ'), done: false },
      { icon: '💥', title: t('Закрий портали: {n}/3', { n: this.closedCount() }), done: this.completed },
      { icon: '🧟', title: t('Кожні 5с портали випускають хвилю зомбі'), done: false },
    ];
  }

  getMarkers() {
    const out = this.portals.filter((p) => p.open)
      .map((p) => ({ x: p.x, z: p.z, color: '#b86cff', icon: '🌀' }));
    for (const z of this.level.zombies.list) {
      if (z.portal && z.state !== 'dead') out.push({ x: z.x, z: z.z, color: '#ff5d73', icon: '🧟' });
    }
    return out;
  }

  closedCount() {
    return this.portals.filter((p) => !p.open).length;
  }

  update(dt) {
    this._clampActor(this.level.player);
    for (const z of this.level.zombies.list) {
      if (z.portal && z.state !== 'dead') this._clampZombie(z);
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT += 5;
      this._spawnWave();
    }
    if (!this.over && this.closedCount() >= this.target) {
      this.completed = true;
      this.level.game._endPortalRun(true);
    }
  }

  portalHitTest(origin, dir, maxD) {
    let best = null;
    for (const portal of this.portals) {
      if (!portal.open) continue;
      const oc = portal.pos.clone().sub(origin);
      const tHit = oc.dot(dir);
      if (tHit < 0 || tHit > maxD) continue;
      const p = origin.clone().addScaledVector(dir, tHit);
      if (p.distanceTo(portal.pos) > 1.7) continue;
      if (!best || tHit < best.t) best = { portal, t: tHit, point: p };
    }
    return best;
  }

  damagePortal(portal, dmg) {
    if (!portal || !portal.open || this.over) return;
    portal.hp = Math.max(0, portal.hp - dmg);
    if (portal.bar) portal.bar.scale.x = Math.max(0.02, portal.hp / portal.maxHp);
    this.level.effects.damageNumber(portal.pos.clone().setY(this.floorY + 2), Math.round(dmg), false);
    if (portal.hp > 0) return;
    portal.open = false;
    portal.group.visible = false;
    this.level.effects.burst(portal.pos.clone(), 0xb86cff, 24, { speed: 6, up: 4, life: 0.9 });
    this.level.audio.shieldBreak();
    if (this.closedCount() >= this.target) {
      this.completed = true;
      this.level.game._endPortalRun(true);
    }
  }

  results() {
    return {
      timeMs: Math.round(this.level.stats.time * 1000),
      kills: this.level.stats.kills,
      completed: this.completed,
      closed: this.closedCount(),
    };
  }

  placePlayer() {
    const p = this.level.player;
    p.pos.set(this.cx, this.floorY, this.cz + 18);
    p.vel.set(0, 0, 0);
    p.onGround = true;
  }

  _buildRoom() {
    const { level, cx, cz, _half: h } = this;
    const floorM = new THREE.MeshStandardMaterial({ color: 0x1f2637, roughness: 0.9 });
    const wallM = new THREE.MeshStandardMaterial({ color: 0x2a2240, roughness: 0.85 });
    const railM = new THREE.MeshBasicMaterial({ color: 0xb86cff });
    level.world.floors.push({ x: cx, z: cz, ry: 0, w: this.roomSize - 1, d: this.roomSize - 1, top: this.floorY });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(this.roomSize, 0.16, this.roomSize), floorM);
    floor.position.set(cx, this.floorY - 0.08, cz);
    floor.receiveShadow = true;
    level.scene.add(floor);
    const mkWall = (x, z, sx, sz) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 2.8, sz), wallM);
      wall.position.set(x, this.floorY + 1.4, z);
      wall.castShadow = wall.receiveShadow = true;
      level.scene.add(wall);
    };
    mkWall(cx, cz - h, this.roomSize, 0.35);
    mkWall(cx, cz + h, this.roomSize, 0.35);
    mkWall(cx - h, cz, 0.35, this.roomSize);
    mkWall(cx + h, cz, 0.35, this.roomSize);
    const spots = [
      [cx, cz - 17],
      [cx - 18, cz + 10],
      [cx + 18, cz + 10],
    ];
    for (const [x, z] of spots) this._addPortal(x, z, railM);
  }

  _addPortal(x, z, mat) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.12, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0xb86cff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.8, 1),
      new THREE.MeshBasicMaterial({ color: 0x8f5dff, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending })
    );
    core.position.y = 1.1;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.12), mat);
    bar.position.y = 2.2;
    group.add(ring, core, bar);
    group.position.set(x, this.floorY, z);
    this.level.scene.add(group);
    this.portals.push({ x, z, pos: new THREE.Vector3(x, this.floorY + 1.1, z), hp: PORTAL_HP, maxHp: PORTAL_HP, open: true, group, bar });
  }

  _spawnWave() {
    const types = ['walker', 'runner'];
    for (const p of this.portals) {
      if (!p.open) continue;
      for (let i = 0; i < 2; i++) {
        const a = i * Math.PI + this.level.rng.next() * 0.4;
        const x = p.x + Math.cos(a) * 3;
        const z = p.z + Math.sin(a) * 3;
        const zb = this.level.zombies.spawn(types[i % types.length], x, z, {
          noLeash: true,
          anchor: { x: this.cx, z: this.cz, r: this._half - 2 },
        });
        zb.portal = true;
        zb.stats = { ...zb.stats, coins: 0 };
        zb.aggroed = true;
        zb.state = 'chase';
        this._clampZombie(zb);
      }
    }
  }

  _clampActor(p) {
    const x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, p.pos.x));
    const z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, p.pos.z));
    if (x !== p.pos.x) { p.pos.x = x; p.vel.x = 0; }
    if (z !== p.pos.z) { p.pos.z = z; p.vel.z = 0; }
    if (p.pos.y < this.floorY || p.pos.y > this.floorY + 4) {
      p.pos.y = this.floorY;
      if (p.vel.y < 0) p.vel.y = 0;
      p.onGround = true;
    }
  }

  _clampZombie(z) {
    z.x = Math.max(this.cx - this._half + 1, Math.min(this.cx + this._half - 1, z.x));
    z.z = Math.max(this.cz - this._half + 1, Math.min(this.cz + this._half - 1, z.z));
    z.y = this.floorY;
    if (z.rig && z.rig.group) z.rig.group.position.set(z.x, z.y, z.z);
  }

  _clearRoomBlockers() {
    const inside = (c) => Math.abs(c.x - this.cx) < this._half - 1 && Math.abs(c.z - this.cz) < this._half - 1;
    this.level.world.colliders = this.level.world.colliders.filter((c) => !inside(c));
    this.level.world.occluders = this.level.world.occluders.filter((c) => !inside(c));
    if (typeof this.level.world._buildGrid === 'function') this.level.world._buildGrid();
  }
}
