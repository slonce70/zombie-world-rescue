// Частинки, трасери, монети, підбирання, промені-маркери
import * as THREE from 'three';
import { toonMat } from './characters.js';

export class Effects {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.onPickup = null; // (type, value) => {}
    this.getPlayerPos = null;

    // пул частинок
    this.MAX_P = 220;
    const geo = new THREE.IcosahedronGeometry(0.07, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pMesh = new THREE.InstancedMesh(geo, mat, this.MAX_P);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.particles = [];
    for (let i = 0; i < this.MAX_P; i++) {
      this.particles.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, color: new THREE.Color() });
    }
    scene.add(this.pMesh);
    this._m4 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();

    // трасери — пул мешів з однією unit-геометрією (без алокацій на постріл)
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 4, 1, true);
    this.tracerPool = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracerPool.push({ mesh: m, life: 0 });
    }
    this._up = new THREE.Vector3(0, 1, 0);
    this._tmpDir = new THREE.Vector3();

    // спалах пострілу
    this.flashLight = new THREE.PointLight(0xffc966, 0, 9);
    scene.add(this.flashLight);
    this.flashT = 0;

    // монети та підбирання
    this.coins = [];
    this.coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12);
    this.coinMat = toonMat(0xffd23f, 0xffaa00, 0.45);
    this.medGeo = new THREE.BoxGeometry(0.4, 0.25, 0.4);
    this.medMat = toonMat(0xf5f5f5);
    this.ammoGeo = new THREE.BoxGeometry(0.35, 0.25, 0.25);
    this.ammoMat = toonMat(0x5e7050);

    // кільця (слем боса)
    this.rings = [];
  }

  burst(pos, colorHex, n = 8, opts = {}) {
    let spawned = 0;
    for (const pt of this.particles) {
      if (pt.alive) continue;
      pt.alive = true;
      pt.p.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const up = opts.up !== undefined ? opts.up : 3;
      const spd = (opts.speed || 3) * (0.5 + Math.random() * 0.8);
      pt.v.set(Math.cos(a) * spd, Math.random() * up, Math.sin(a) * spd);
      pt.life = pt.maxLife = (opts.life || 0.5) * (0.7 + Math.random() * 0.6);
      pt.size = (opts.size || 1) * (0.6 + Math.random() * 0.9);
      pt.color.setHex(colorHex);
      if (++spawned >= n) break;
    }
  }

  tracer(from, to) {
    const dir = this._tmpDir.copy(to).sub(from);
    const len = dir.length();
    if (len < 0.5) return;
    let slot = null;
    for (const t of this.tracerPool) {
      if (!t.mesh.visible) { slot = t; break; }
    }
    if (!slot) slot = this.tracerPool[0];
    slot.life = 0.07;
    slot.mesh.visible = true;
    slot.mesh.scale.set(1, len, 1);
    slot.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    slot.mesh.quaternion.setFromUnitVectors(this._up, dir.normalize());
    slot.mesh.material.opacity = 0.85;
  }

  muzzleFlash(pos) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 14;
    this.flashT = 0.05;
  }

  ring(pos, colorHex = 0xff8844, maxR = 6) {
    const geo = new THREE.TorusGeometry(1, 0.12, 8, 28);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    m.position.y += 0.15;
    this.scene.add(m);
    this.rings.push({ mesh: m, t: 0, maxR });
  }

  spawnCoin(x, z, value = 5) {
    const m = new THREE.Mesh(this.coinGeo, this.coinMat);
    const y = this.world.groundH(x, z);
    m.position.set(x, y + 0.4, z);
    m.rotation.x = Math.PI / 2 - 0.3;
    this.scene.add(m);
    this.coins.push({ mesh: m, type: 'coin', value, t: Math.random() * 6, vy: 2.5, baseY: y + 0.35, life: 45 });
  }

  spawnPickup(x, z, type) {
    const m = new THREE.Mesh(type === 'medkit' ? this.medGeo : this.ammoGeo, type === 'medkit' ? this.medMat : this.ammoMat);
    if (type === 'medkit') {
      const redM = toonMat(0xd32f2f);
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.26), redM);
      const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.08), redM);
      m.add(c1, c2);
    } else {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.26), toonMat(0xffd23f));
      tip.position.y = 0.12;
      m.add(tip);
    }
    const y = this.world.groundH(x, z);
    m.position.set(x, y + 0.35, z);
    this.scene.add(m);
    this.coins.push({ mesh: m, type, value: type === 'medkit' ? 25 : 30, t: Math.random() * 6, vy: 0, baseY: y + 0.3, life: 45 });
  }

  update(dt) {
    // частинки
    let any = false;
    let idx = 0;
    for (const pt of this.particles) {
      if (pt.alive) {
        pt.life -= dt;
        if (pt.life <= 0) { pt.alive = false; }
        else {
          pt.p.addScaledVector(pt.v, dt);
          pt.v.y -= 9 * dt;
          const s = pt.size * Math.max(0.1, pt.life / pt.maxLife);
          this._m4.compose(pt.p, this._q, this._s.set(s, s, s));
          this.pMesh.setMatrixAt(idx, this._m4);
          this.pMesh.setColorAt(idx, pt.color);
          idx++;
          any = true;
        }
      }
    }
    // приховуємо решту інстансів
    this._m4.compose(new THREE.Vector3(0, -100, 0), this._q, this._s.set(0.001, 0.001, 0.001));
    for (let i = idx; i < this.MAX_P; i++) this.pMesh.setMatrixAt(i, this._m4);
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    // трасери
    for (const t of this.tracerPool) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.85;
      if (t.life <= 0) t.mesh.visible = false;
    }

    // спалах
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
      else this.flashLight.intensity *= 0.6;
    }

    // кільця
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt * 2.2;
      const rr = r.t * r.maxR;
      r.mesh.scale.set(rr, rr, 1);
      r.mesh.material.opacity = Math.max(0, 0.85 * (1 - r.t));
      if (r.t >= 1) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.rings.splice(i, 1);
      }
    }

    // монети/підбирання
    const pp = this.getPlayerPos ? this.getPlayerPos() : null;
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.t += dt;
      c.life -= dt;
      if (c.type === 'coin') {
        c.mesh.rotation.z = c.t * 4;
        // підстрибування при спавні
        if (c.vy !== 0) {
          c.mesh.position.y += c.vy * dt;
          c.vy -= 12 * dt;
          if (c.mesh.position.y <= c.baseY) { c.mesh.position.y = c.baseY; c.vy = 0; }
        } else {
          c.mesh.position.y = c.baseY + 0.12 + Math.sin(c.t * 3) * 0.08;
        }
      } else {
        c.mesh.rotation.y = c.t * 2;
        c.mesh.position.y = c.baseY + 0.15 + Math.sin(c.t * 2.5) * 0.07;
      }
      if (pp) {
        const dx = pp.x - c.mesh.position.x;
        const dz = pp.z - c.mesh.position.z;
        const d = Math.hypot(dx, dz);
        const magnetR = c.type === 'coin' ? 5 : 2.2;
        if (d < magnetR && d > 0.01) {
          const pull = (c.type === 'coin' ? 14 : 8) * dt / Math.max(d, 0.5);
          c.mesh.position.x += dx * pull;
          c.mesh.position.z += dz * pull;
        }
        if (d < 1.0) {
          if (this.onPickup) this.onPickup(c.type, c.value);
          this.scene.remove(c.mesh);
          this.coins.splice(i, 1);
          continue;
        }
      }
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }
  }

  // Маркер місії: стовп світла + іконка
  makeBeam(x, z, colorHex, icon) {
    const g = new THREE.Group();
    const y = this.world.groundH(x, z);
    const beamMat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.65, 70, 12, 1, true), beamMat);
    beam.position.y = 35;
    g.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 8, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    g.add(ring);
    // іконка-спрайт
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.font = '90px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 64, 70);
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    sprite.scale.set(2.6, 2.6, 1);
    sprite.position.y = 7;
    g.add(sprite);
    g.position.set(x, y, z);
    this.scene.add(g);
    const handle = {
      group: g, beam, ring, sprite, t: 0,
      update: (dt) => {
        handle.t += dt;
        beam.material.opacity = 0.22 + Math.sin(handle.t * 2.5) * 0.1;
        ring.scale.setScalar(1 + Math.sin(handle.t * 2.5) * 0.15);
        sprite.position.y = 7 + Math.sin(handle.t * 1.8) * 0.5;
      },
      remove: () => {
        this.scene.remove(g);
      },
    };
    return handle;
  }
}
