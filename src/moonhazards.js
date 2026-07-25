import * as THREE from 'three';

const METEOR_TYPES = Object.freeze({
  small: Object.freeze({ size: 5, damage: 35, color: 0xd6d2cb }),
  medium: Object.freeze({ size: 10, damage: 55, color: 0xaaa7a2 }),
  large: Object.freeze({ size: 19, damage: 75, color: 0x777672 }),
});

export class MoonHazards {
  constructor(level) {
    this.level = level;
    this.active = [];
    this.timer = 7;
    this.auto = !new URLSearchParams(location.search).has('test');
  }

  spawn(type = 'small', x = null, z = null) {
    const cfg = METEOR_TYPES[type] || METEOR_TYPES.small;
    const p = this.level.player.pos;
    const a = this.level.rng.next() * Math.PI * 2;
    const r = 18 + this.level.rng.next() * 24;
    const bound = (this.level.world.layout.BOUND || 240) - cfg.size;
    x = x == null ? THREE.MathUtils.clamp(p.x + Math.cos(a) * r, -bound, bound) : x;
    z = z == null ? THREE.MathUtils.clamp(p.z + Math.sin(a) * r, -bound, bound) : z;
    const y = this.level.world.groundH(x, z);
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(cfg.size / 2, 1),
      new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 1, emissive: 0x241008, emissiveIntensity: 0.3 }),
    );
    mesh.position.set(x, y + 62, z);
    mesh.castShadow = true;
    const warning = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(1, cfg.size * 0.35), cfg.size * 0.52, 32),
      new THREE.MeshBasicMaterial({ color: 0xff522e, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
    );
    warning.rotation.x = -Math.PI / 2;
    warning.position.set(x, y + 0.08, z);
    this.level.scene.add(mesh, warning);
    const meteor = { type, size: cfg.size, damage: cfg.damage, mesh, warning, x, z, y, t: 1.6 };
    this.active.push(meteor);
    return meteor;
  }

  update(dt) {
    if (this.auto) {
      this.timer -= dt;
      if (this.timer <= 0) {
        const n = this.level.rng.next();
        this.spawn(n < 0.58 ? 'small' : n < 0.88 ? 'medium' : 'large');
        this.timer = 8 + this.level.rng.next() * 7;
      }
    }
    for (const meteor of [...this.active]) {
      meteor.t -= dt;
      meteor.warning.material.opacity = 0.35 + Math.abs(Math.sin(meteor.t * 9)) * 0.5;
      meteor.warning.rotation.z += dt;
      meteor.mesh.rotation.x += dt * 2.2;
      meteor.mesh.rotation.z += dt * 1.6;
      if (meteor.t <= 0) meteor.mesh.position.y -= 34 * dt;
      if (meteor.t <= 0 && meteor.mesh.position.y <= meteor.y + meteor.size * 0.42) this._impact(meteor);
    }
  }

  _impact(meteor) {
    const p = this.level.player.pos;
    if (Math.hypot(p.x - meteor.x, p.z - meteor.z) <= meteor.size * 0.58 + 1) {
      this.level.player.takeDamage(meteor.damage, meteor.x, meteor.z);
    }
    this.level.effects.ring(new THREE.Vector3(meteor.x, meteor.y + 0.15, meteor.z), 0xff6338, meteor.size * 0.7);
    this.level.effects.burst(new THREE.Vector3(meteor.x, meteor.y + 0.7, meteor.z), 0xff8b42, Math.max(18, Math.round(meteor.size * 3)));
    this._remove(meteor);
  }

  _remove(meteor) {
    this.level.scene.remove(meteor.mesh, meteor.warning);
    meteor.mesh.geometry.dispose(); meteor.mesh.material.dispose();
    meteor.warning.geometry.dispose(); meteor.warning.material.dispose();
    const i = this.active.indexOf(meteor);
    if (i >= 0) this.active.splice(i, 1);
  }

  dispose() { for (const meteor of [...this.active]) this._remove(meteor); }
}
