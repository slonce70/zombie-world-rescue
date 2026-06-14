// Частинки, трасери, монети, підбирання, промені-маркери, бочки, м'яч, аеродроп, тварини
import * as THREE from 'three';
import { toonMat } from './characters.js';
import { closestRaySeg, disposeObject } from './utils.js';

// квадрат найкоротшої відстані від точки (px,py,pz) до відрізка a→b (обидва THREE.Vector3)
function segPointDist2(a, b, px, py, pz) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

export class Effects {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.onPickup = null; // (type, value) => {}
    this.getPlayerPos = null;
    this.getPickupTargets = null;  // кооп: () => [{pos, magnet, pid}] — хто може підбирати
    this.getDamageTargets = null;  // кооп: () => [{pos, pid}] — кого б'ють снаряди
    this.levelRef = null;          // ставить main: доступ до level.net/netEv/mirror
    this.nidSeq = 0;               // локальні id предметів (соло)

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
    this._sbOld = new THREE.Vector3(); // позиція снаряда ДО руху (swept-перевірка влучання)

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

    // снаряди ворогів (сніжки, отрута, багети)
    this.projectiles = [];
    this.projGeo = new THREE.SphereGeometry(1, 8, 6);
    this.projMat = toonMat(0xf4f9ff);
    this.onProjectileHit = null; // (dmg, x, z, target?) => {}

    // 🚀 ракети гравця
    this.rockets = [];
    this.onWeaponFound = null; // (id) => {}

    // гранати
    this.grenadesLive = [];
    this.grenadeGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.grenadeMat = new THREE.MeshToonMaterial({ color: 0x4d5e40, gradientMap: this.coinMat.gradientMap });
    this.grenadeHotMat = new THREE.MeshToonMaterial({ color: 0xff5544, emissive: 0xff2200, emissiveIntensity: 0.8, gradientMap: this.coinMat.gradientMap });
    this.onExplosion = null; // (x, y, z, radius, damage, ownerPid?) => {}

    // літаючі цифри шкоди
    this.dmgPool = [];
    for (let i = 0; i < 18; i++) {
      const cv = document.createElement('canvas');
      cv.width = 128; cv.height = 64;
      const tex = new THREE.CanvasTexture(cv);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.scale.set(1.5, 0.75, 1);
      spr.visible = false;
      scene.add(spr);
      this.dmgPool.push({ spr, cv, tex, life: 0, vy: 0 });
    }
    this._dmgIdx = 0;
  }

  // звільнити standalone GPU-ресурси цього рівня (НЕ спільні toon-матеріали з userData.shared).
  // Частину з них (оригінал tracerMat, гео монет/набоїв/снарядів/гранат) обхід сцени в endLevel
  // не дістає, бо вони не висять у сцені окремими вузлами — тож звільняємо явно. Викликає endLevel.
  dispose() {
    const sc = this.scene;
    sc.remove(this.pMesh, this.flashLight);
    for (const t of this.tracerPool) { sc.remove(t.mesh); if (t.mesh.material) t.mesh.material.dispose(); }
    for (const d of this.dmgPool) { sc.remove(d.spr); if (d.spr.material) d.spr.material.dispose(); if (d.tex) d.tex.dispose(); }
    this.pMesh.geometry.dispose();
    this.pMesh.material.dispose();
    for (const g of [this.tracerGeo, this.coinGeo, this.medGeo, this.ammoGeo, this.projGeo, this.grenadeGeo]) g.dispose();
    for (const m of [this.tracerMat, this.grenadeMat, this.grenadeHotMat]) m.dispose();
    // coinMat/medMat/ammoMat/projMat — спільні toonMat (userData.shared) — лишаємо на сеанс
  }

  // предмет створено: дати мережевий id і (на хості) розіслати гостям
  _finishItem(c, x, z, yOverride, nid) {
    const L = this.levelRef;
    c.nid = nid !== null && nid !== undefined ? nid
      : (L && L.net && L.net.authority ? L.net.allocId() : ++this.nidSeq);
    this.coins.push(c);
    if (L && L.net && L.net.authority && (nid === null || nid === undefined)) {
      L.netEv('it', c.nid, c.type, Math.round(x * 10) / 10, Math.round(z * 10) / 10,
        yOverride === null || yOverride === undefined ? null : Math.round(yOverride * 10) / 10,
        c.value, Math.round(c.life));
    }
    return c;
  }

  // гість: предмет із мережі
  spawnNetItem(nid, kind, x, z, y, value, life) {
    if (this.removeItemByNid(nid)) { /* перестворення — прибрали стару копію */ }
    if (kind === 'coin') this.spawnCoin(x, z, value, life, y, nid);
    else this.spawnPickup(x, z, kind, life, y, nid);
    const c = this.coins[this.coins.length - 1];
    if (c) c.value = value;
  }

  removeItemByNid(nid) {
    for (let i = 0; i < this.coins.length; i++) {
      if (this.coins[i].nid === nid) {
        this.scene.remove(this.coins[i].mesh);
        this.coins.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  clearNetItems() {
    for (const c of this.coins) this.scene.remove(c.mesh);
    this.coins = [];
  }

  // ---------- 🧨 вибухові бочки ----------
  addBarrel(x, z) {
    if (!this.barrels) this.barrels = [];
    const gy = this.world.groundH(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.15, 12), toonMat(0xc0392b));
    body.position.y = 0.58;
    body.castShadow = true;
    for (const sy of [0.25, 0.9]) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 12), toonMat(0xffd23f));
      stripe.position.y = sy;
      g.add(stripe);
    }
    const skullCv = document.createElement('canvas');
    skullCv.width = 64; skullCv.height = 64;
    const sc = skullCv.getContext('2d');
    sc.font = '44px serif';
    sc.textAlign = 'center';
    sc.fillText('💥', 32, 48);
    const tex = new THREE.CanvasTexture(skullCv);
    const decal = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    decal.scale.set(0.6, 0.6, 1);
    decal.position.set(0, 0.6, 0);
    g.add(body, decal);
    g.position.set(x, gy, z);
    this.scene.add(g);
    const collider = { x, z, r: 0.6 };
    this.world.colliders.push(collider);
    this.barrels.push({ x, z, y: gy, hp: 25, mesh: g, collider, exploded: false, fuse: -1 });
  }

  barrelHitTest(origin, dir, maxT) {
    if (!this.barrels) return null;
    let best = null;
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    for (const b of this.barrels) {
      if (b.exploded) continue;
      p0.set(b.x, b.y + 0.1, b.z);
      p1.set(b.x, b.y + 1.15, b.z);
      const res = closestRaySeg(origin, dir, p0, p1);
      if (res.dist < 0.55 && res.t > 0.3 && res.t < maxT && (!best || res.t < best.t)) {
        best = { barrel: b, t: res.t };
      }
    }
    return best;
  }

  damageBarrel(b, dmg) {
    if (b.exploded || b.fuse >= 0) return;
    b.hp -= dmg;
    if (b.hp <= 0) b.fuse = 0.1;
  }

  _explodeAt(pos, radius = 5.5, dmg = 135, meta = null) {
    this.burst(pos, 0xffa040, 16, { speed: 6, up: 5, life: 0.7, size: 1.6 });
    this.burst(pos, 0x553a22, 10, { speed: 4, up: 4, life: 0.6, size: 1.2 });
    this.ring(pos, 0xffaa44, radius + 0.5);
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 30;
    this.flashT = 0.12;
    this.audio.explosion();
    const L = this.levelRef;
    if (L && L.net && L.net.authority) {
      L.netEv('bm', Math.round(pos.x * 10) / 10, Math.round(pos.y * 10) / 10, Math.round(pos.z * 10) / 10,
        radius, (meta && meta.gid) || 0, (meta && meta.barrels) || 0);
    }
    if (this.onExplosion) this.onExplosion(pos.x, pos.y, pos.z, radius, dmg, (meta && meta.pid) || 1);
    // ланцюгова реакція бочок
    if (this.barrels) {
      for (const ob of this.barrels) {
        if (ob.exploded || ob.fuse >= 0) continue;
        if (Math.hypot(ob.x - pos.x, ob.z - pos.z) < radius + 1) ob.fuse = 0.18;
      }
    }
  }

  // ---------- ⚽ футбольний м'яч ----------
  addBall(x, z) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#f5f5f5';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#2a3138';
    for (let i = 0; i < 8; i++) {
      const bx = (i * 47) % 128, by = (i * 31 + 20) % 128;
      c.beginPath();
      c.arc(bx, by, 13, 0, 6.29);
      c.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 16, 12),
      new THREE.MeshToonMaterial({ map: tex, gradientMap: toonMat(0).gradientMap })
    );
    mesh.castShadow = true;
    mesh.position.set(x, this.world.groundH(x, z) + 0.45, z);
    this.scene.add(mesh);
    this.ball = { mesh, v: new THREE.Vector3() };
  }

  ballHitTest(origin, dir, maxT) {
    if (!this.ball) return null;
    const p = this.ball.mesh.position;
    const p0 = new THREE.Vector3(p.x, p.y - 0.2, p.z);
    const p1 = new THREE.Vector3(p.x, p.y + 0.2, p.z);
    const res = closestRaySeg(origin, dir, p0, p1);
    if (res.dist < 0.55 && res.t > 0.3 && res.t < maxT) return { t: res.t };
    return null;
  }

  kickBall(dir, power) {
    if (!this.ball) return;
    this.ball.v.x += dir.x * power;
    this.ball.v.z += dir.z * power;
    this.ball.v.y += Math.max(1.5, dir.y * power + 2.5);
    this.audio.kick();
  }

  // ---------- 🪂 аеродроп ----------
  _spawnAirdrop(px, pz, fixed = false) {
    let x, z;
    if (fixed) {
      x = px; z = pz;
    } else {
      const a = Math.random() * Math.PI * 2;
      x = px + Math.cos(a) * 26;
      z = pz + Math.sin(a) * 26;
      const dB = Math.hypot(x, z);
      const bound = this.world.layout.BOUND;
      if (dB > bound - 12) {
        x *= (bound - 14) / dB;
        z *= (bound - 14) / dB;
      }
    }
    const g = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.2), toonMat(0xb08d57));
    crate.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.2, 1.25), toonMat(0x6fc3ff));
    const chute = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 10, 1, true), new THREE.MeshToonMaterial({
      color: 0xff8c42, gradientMap: toonMat(0).gradientMap, side: THREE.DoubleSide,
    }));
    chute.position.y = 3.2;
    g.add(crate, band, chute);
    const gy = this.world.groundH(x, z);
    g.position.set(x, gy + 55, z);
    this.scene.add(g);
    const beam = this.makeBeam(x, z, 0x6fc3ff, '🪂');
    this.airdrop = { g, chute, x, z, gy, beam, landed: false, lifeAfter: 60 };
    const L = this.levelRef;
    if (L && L.net && L.net.authority) L.netEv('ad', Math.round(x * 10) / 10, Math.round(z * 10) / 10);
    if (this.onAirdrop) this.onAirdrop();
  }

  // гість: аеродроп із мережі
  netAirdrop(x, z) {
    if (this.airdrop) return;
    this._spawnAirdrop(x, z, true);
  }

  // ---------- 🐔/🐇 тварини ----------
  addAnimals(kind, n = 6) {
    this.animals = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      if (kind === 'chickens') {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toonMat(0xf5f0e0));
        body.position.y = 0.26;
        body.scale.set(1, 0.9, 1.25);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), toonMat(0xf5f0e0));
        head.position.set(0, 0.5, -0.2);
        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 6), toonMat(0xff8c42));
        beak.rotation.x = -Math.PI / 2;
        beak.position.set(0, 0.48, -0.32);
        const comb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.12), toonMat(0xd84f4f));
        comb.position.set(0, 0.62, -0.18);
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 7, 6), toonMat(0xe8e2d0));
        tail.position.set(0, 0.36, 0.26);
        g.add(body, head, beak, comb, tail);
      } else if (kind === 'cats') {
        // 🐈 вуличний котик: тільце, вушка-трикутнички і хвіст-трубою
        const catCol = [0xe8a04a, 0x4a4a52, 0xf5f0e0, 0xb86a3a][i % 4];
        const catM = toonMat(catCol);
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), catM);
        body.position.y = 0.22;
        body.scale.set(1, 0.85, 1.4);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), catM);
        head.position.set(0, 0.42, -0.24);
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 4), catM);
          ear.position.set(side * 0.07, 0.55, -0.24);
          g.add(ear);
        }
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.42, 6), catM);
        tail.position.set(0, 0.42, 0.3);
        tail.rotation.x = -0.5;
        const noseC = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.05, 4), toonMat(0xff8c8c));
        noseC.rotation.x = -Math.PI / 2;
        noseC.position.set(0, 0.4, -0.36);
        g.add(body, head, tail, noseC);
      } else if (kind === 'camels') {
        // 🐫 верблюд: великий, з горбами і довгою шиєю
        const camM = toonMat([0xc9a86a, 0xb8945a, 0xd4b274][i % 3]);
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 9), camM);
        body.position.y = 0.95;
        body.scale.set(1, 0.8, 1.5);
        for (const hz of [-0.25, 0.3]) {
          const hump = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), camM);
          hump.position.set(0, 1.4, hz);
          g.add(hump);
        }
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 7), camM);
        neck.position.set(0, 1.45, -0.78);
        neck.rotation.x = 0.45;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), camM);
        head.position.set(0, 1.9, -1.0);
        head.scale.set(0.9, 0.8, 1.3);
        for (const side of [-1, 1]) {
          for (const lz of [-0.4, 0.45]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.95, 6), camM);
            leg.position.set(side * 0.28, 0.48, lz);
            g.add(leg);
          }
        }
        const tailC = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.5, 5), camM);
        tailC.position.set(0, 1.1, 0.85);
        tailC.rotation.x = 0.3;
        g.add(body, neck, head, tailC);
      } else {
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toonMat(0xb8bcc4));
        body.position.y = 0.22;
        body.scale.set(1, 0.95, 1.35);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), toonMat(0xc4c8d0));
        head.position.set(0, 0.42, -0.22);
        for (const side of [-1, 1]) {
          const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 3, 6), toonMat(0xc4c8d0));
          ear.position.set(side * 0.06, 0.62, -0.22);
          ear.rotation.z = side * 0.18;
          g.add(ear);
        }
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), toonMat(0xf5f5f5));
        tail.position.set(0, 0.3, 0.3);
        g.add(body, head, tail);
      }
      const hx = (Math.random() - 0.5) * 70;
      const hz = (Math.random() - 0.5) * 70;
      g.position.set(hx, this.world.groundH(hx, hz), hz);
      this.scene.add(g);
      this.animals.push({
        g, kind, hx, hz, x: hx, z: hz, tx: hx, tz: hz,
        t: Math.random() * 3, ph: Math.random() * 6,
      });
    }
  }

  spawnProjectile(from, target, speed, dmg, size = 0.22, color = null) {
    const m = new THREE.Mesh(this.projGeo, color ? toonMat(color) : this.projMat);
    m.scale.setScalar(size);
    if (color === 0xd9a35e) m.scale.set(size * 0.45, size * 0.45, size * 1.9); // 🥖 багет — довгий
    m.position.copy(from);
    const v = target.clone().sub(from);
    const d = v.length();
    v.normalize().multiplyScalar(speed);
    v.y += d * 0.12; // легка дуга
    if (color === 0xd9a35e) m.lookAt(target);
    this.scene.add(m);
    this.projectiles.push({ mesh: m, v, dmg, size, life: 4, color: color || 0xf4f9ff, spin: color === 0xd9a35e });
  }

  // 🚀 ракета базуки: летить прямо, вибухає від першого дотику
  spawnRocket(from, dir, dmg, gid = null, pid = 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), toonMat(0x6b7a4a));
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 8), toonMat(0xd84f4f));
    head.rotation.x = -Math.PI / 2;
    head.position.z = -0.32;
    const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), toonMat(0xffaa44, 0xff6a00, 0.9));
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.z = 0.31;
    g.add(body, head, exhaust);
    g.position.copy(from);
    g.lookAt(from.clone().add(dir));
    this.scene.add(g);
    this.rockets.push({ mesh: g, v: dir.clone().multiplyScalar(30), dmg, life: 6, smokeT: 0, gid, pid });
  }

  spawnGrenade(pos, vel, gid = null, pid = 1) {
    const m = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    m.position.copy(pos);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.06), toonMat(0xb8b8b8));
    band.position.y = 0.13;
    m.add(band);
    this.scene.add(m);
    this.grenadesLive.push({ mesh: m, v: vel.clone(), fuse: 2.0, blink: 0, gid, pid });
  }

  // гість: граната з мережі (вибухне лише за подією bm від хоста)
  spawnNetGrenade(gid, px, py, pz, vx, vy, vz) {
    this.spawnGrenade(new THREE.Vector3(px, py, pz), new THREE.Vector3(vx, vy, vz), gid);
    const g = this.grenadesLive[this.grenadesLive.length - 1];
    if (g) g.netWait = true;
  }

  spawnNetRocket(gid, ox, oy, oz, dx, dy, dz) {
    this.spawnRocket(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize(), 0, gid);
    const rk = this.rockets[this.rockets.length - 1];
    if (rk) rk.netWait = true;
  }

  // гість: вибух з мережі — лише картинка/звук, бочки і струс
  netExplosion(x, y, z, r, gid, barrelIdxs) {
    const pos = new THREE.Vector3(x, y, z);
    this.burst(pos, 0xffa040, 16, { speed: 6, up: 5, life: 0.7, size: 1.6 });
    this.burst(pos, 0x553a22, 10, { speed: 4, up: 4, life: 0.6, size: 1.2 });
    this.ring(pos, 0xffaa44, r + 0.5);
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 30;
    this.flashT = 0.12;
    this.audio.explosion();
    if (gid) {
      for (let i = this.grenadesLive.length - 1; i >= 0; i--) {
        if (this.grenadesLive[i].gid === gid) {
          this.scene.remove(this.grenadesLive[i].mesh);
          this.grenadesLive.splice(i, 1);
        }
      }
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        if (this.rockets[i].gid === gid) {
          this.scene.remove(this.rockets[i].mesh);
          disposeObject(this.rockets[i].mesh);
          this.rockets.splice(i, 1);
        }
      }
    }
    for (const idx of barrelIdxs || []) this.netBarrelGone(idx);
    const pp = this.getPlayerPos ? this.getPlayerPos() : null;
    if (pp && this.levelRef) {
      const pd = Math.hypot(pp.x - x, pp.z - z);
      if (pd < r + 3) this.levelRef.player.camShake = Math.max(this.levelRef.player.camShake, 1.2);
    }
  }

  netBarrelGone(idx) {
    const b = this.barrels && this.barrels[idx];
    if (!b || b.exploded) return;
    b.exploded = true;
    this.scene.remove(b.mesh);
    disposeObject(b.mesh);
    this.world.removeCollider(b.collider);
  }

  _explodeGrenade(g) {
    this._explodeAt(g.mesh.position, 5.5, 135, { gid: g.gid || 0, pid: g.pid || 1 });
    this.scene.remove(g.mesh);
  }

  damageNumber(pos, amt, crit = false) {
    const slot = this.dmgPool[this._dmgIdx];
    this._dmgIdx = (this._dmgIdx + 1) % this.dmgPool.length;
    const ctx = slot.cv.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = `900 ${crit ? 44 : 36}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(String(Math.round(amt)), 64, 32);
    ctx.fillStyle = crit ? '#ffd23f' : '#ffffff';
    ctx.fillText(String(Math.round(amt)), 64, 32);
    slot.tex.needsUpdate = true;
    slot.spr.position.set(
      pos.x + (Math.random() - 0.5) * 0.5,
      pos.y + 0.3,
      pos.z + (Math.random() - 0.5) * 0.5
    );
    slot.spr.material.opacity = 1;
    slot.spr.visible = true;
    slot.life = 0.75;
    slot.vy = 2.0;
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
    // стиль сліду куль (нагороди Зоряного шляху і Шторму)
    if (this.tracerStyle === 'gold') slot.mesh.material.color.setHex(0xffd23f);
    else if (this.tracerStyle === 'rainbow') slot.mesh.material.color.setHSL((performance.now() / 600) % 1, 0.9, 0.62);
    else if (this.tracerStyle === 'storm') slot.mesh.material.color.setHSL(0.72 + Math.sin(performance.now() / 180) * 0.055, 0.95, 0.66);
    else if (this.tracerStyle === 'neon') slot.mesh.material.color.setHex(0x39ff88);
    else if (this.tracerStyle === 'royal') slot.mesh.material.color.setHSL(Math.sin(performance.now() / 260) > 0 ? 0.13 : 0.97, 0.95, 0.6);
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

  // пес або інший помічник збирає предмет негайно
  collectCoinNow(c) {
    const i = this.coins.indexOf(c);
    if (i < 0) return;
    if (this.onPickup) this.onPickup(c.type, c.value);
    this.scene.remove(c.mesh);
    this.coins.splice(i, 1);
  }

  spawnCoin(x, z, value = 5, life = 45, yOverride = null, nid = null) {
    const L = this.levelRef;
    if (L && L.mirror && nid === null) return; // на гості предмети існують лише з мережі
    const m = new THREE.Mesh(this.coinGeo, this.coinMat);
    const y = yOverride !== null ? yOverride : this.world.groundH(x, z);
    m.position.set(x, y + 0.4, z);
    m.rotation.x = Math.PI / 2 - 0.3;
    this.scene.add(m);
    this._finishItem({ mesh: m, type: 'coin', value, t: Math.random() * 6, vy: 2.5, baseY: y + 0.35, life }, x, z, yOverride, nid);
  }

  spawnPickup(x, z, type, life = 45, yOverride = null, nid = null) {
    const L = this.levelRef;
    if (L && L.mirror && nid === null) return;
    const y0 = yOverride !== null ? yOverride : this.world.groundH(x, z);
    if (type === 'grenade') {
      const gm = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
      gm.scale.setScalar(1.5);
      gm.position.set(x, y0 + 0.35, z);
      this.scene.add(gm);
      this._finishItem({ mesh: gm, type: 'grenade', value: 1, t: Math.random() * 6, vy: 0, baseY: y0 + 0.3, life }, x, z, yOverride, nid);
      return;
    }
    // ⚡💪🛡🧲 світні кулі-підсилення
    const POWERUPS = { speed: 0x4fd8ff, rage: 0xff5d73, bubble: 0xffd23f, magnet: 0xb086f2 };
    if (POWERUPS[type]) {
      const g = new THREE.Group();
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 9), toonMat(POWERUPS[type], POWERUPS[type], 0.85));
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.035, 6, 18),
        new THREE.MeshBasicMaterial({ color: POWERUPS[type], transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.rotation.x = Math.PI / 2;
      g.add(orb, halo);
      g.position.set(x, y0 + 0.55, z);
      this.scene.add(g);
      this._finishItem({ mesh: g, type, value: 1, t: Math.random() * 6, vy: 0, baseY: y0 + 0.5, life }, x, z, yOverride, nid);
      return;
    }
    if (type === 'armor') {
      // 🦺 бронепластина
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.1), toonMat(0x2e4a6e));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.11), toonMat(0x6fc3ff, 0x2288cc, 0.3));
      g.add(plate, stripe);
      g.position.set(x, y0 + 0.4, z);
      this.scene.add(g);
      this._finishItem({ mesh: g, type, value: 40, t: Math.random() * 6, vy: 0, baseY: y0 + 0.35, life }, x, z, yOverride, nid);
      return;
    }
    if (type === 'rocket') {
      // ракета для базуки
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), toonMat(0x6b7a4a));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), toonMat(0xd84f4f));
      head.position.y = 0.35;
      g.add(body, head);
      g.rotation.z = 0.5;
      g.position.set(x, y0 + 0.4, z);
      this.scene.add(g);
      this._finishItem({ mesh: g, type, value: 2, t: Math.random() * 6, vy: 0, baseY: y0 + 0.35, life }, x, z, yOverride, nid);
      return;
    }
    if (type === 'bazooka') {
      // 🚀 ціла базука! Світиться, щоб не пропустити
      const g = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 10), toonMat(0x6b7a4a));
      tube.rotation.z = Math.PI / 2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), toonMat(0xffd23f, 0xffaa00, 0.6));
      band.rotation.z = Math.PI / 2;
      band.position.x = -0.2;
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.16, 10), toonMat(0x3a4252));
      mouth.rotation.z = Math.PI / 2;
      mouth.position.x = -0.55;
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.04, 6, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.rotation.x = Math.PI / 2;
      g.add(tube, band, mouth, halo);
      g.position.set(x, y0 + 0.55, z);
      this.scene.add(g);
      this._finishItem({ mesh: g, type, value: 1, t: Math.random() * 6, vy: 0, baseY: y0 + 0.5, life }, x, z, yOverride, nid);
      return;
    }
    if (type === 'food') {
      // 🥐 смаколик країни: повертає трохи здоров'я
      const g = new THREE.Group();
      const bun = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.09, 8, 14, 4.4), toonMat(0xd9a35e));
      bun.rotation.x = -Math.PI / 2;
      bun.rotation.z = 0.4;
      const sugar = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), toonMat(0xfff2c2));
      sugar.position.set(0.1, 0.08, 0);
      g.add(bun, sugar);
      g.position.set(x, y0 + 0.35, z);
      this.scene.add(g);
      this._finishItem({ mesh: g, type, value: 15, t: Math.random() * 6, vy: 0, baseY: y0 + 0.3, life }, x, z, yOverride, nid);
      return;
    }
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
    m.position.set(x, y0 + 0.35, z);
    this.scene.add(m);
    this._finishItem({ mesh: m, type, value: type === 'medkit' ? 25 : 30, t: Math.random() * 6, vy: 0, baseY: y0 + 0.3, life }, x, z, yOverride, nid);
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

    // снаряди ворогів
    const ppos = this.getPlayerPos ? this.getPlayerPos() : null;
    // цілі шкоди рахуємо РАЗ на кадр (а не на кожен снаряд) — менше алокацій масиву/обʼєктів і викликів у кооп-замикання
    const dmgTargets = this.getDamageTargets
      ? this.getDamageTargets()
      : (ppos ? [{ pos: ppos, pid: 1 }] : []);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.v.y -= 7 * dt;
      // перевірка перешкод на шляху за кадр — сніжки не літають крізь стіни
      const speed = pr.v.length();
      const frameDist = speed * dt;
      let blockedAt = Infinity;
      if (frameDist > 1e-4) {
        this._tmpDir.copy(pr.v).divideScalar(speed);
        blockedAt = this.world.shotBlockDist(pr.mesh.position, this._tmpDir, frameDist + pr.size);
      }
      this._sbOld.copy(pr.mesh.position); // ДО руху — для swept-перевірки влучання
      pr.mesh.position.addScaledVector(pr.v, dt);
      const mp = pr.mesh.position;
      let hit = blockedAt <= frameDist + pr.size;
      // влучання в гравця рахуємо вздовж усього відрізка [стара→нова позиція], а не лише
      // в кінцевій точці: інакше швидкий снаряд на низькому FPS «перестрибує» гравця за кадр
      const rr = (pr.size + 0.62) * (pr.size + 0.62);
      if (!hit && pr.dmg > 0) {
        for (const tgt of dmgTargets) {
          const tpv = tgt.pos;
          if (segPointDist2(this._sbOld, mp, tpv.x, tpv.y + 1.1, tpv.z) < rr) {
            if (this.onProjectileHit) this.onProjectileHit(pr.dmg, mp.x, mp.z, tgt);
            hit = true;
            break;
          }
        }
      } else if (!hit && ppos) {
        // dmg=0 (дзеркало): зникає біля свого гравця без шкоди
        if (segPointDist2(this._sbOld, mp, ppos.x, ppos.y + 1.1, ppos.z) < rr) hit = true;
      }
      if (!hit && mp.y < this.world.groundH(mp.x, mp.z) + pr.size * 0.5) hit = true;
      if (pr.spin) pr.mesh.rotation.x += dt * 9; // багет крутиться в польоті
      if (hit || pr.life <= 0) {
        this.burst(mp, pr.color, 7, { speed: 2.5, up: 2, life: 0.4, size: 0.9 });
        this.scene.remove(pr.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // 🚀 ракети базуки
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rk = this.rockets[i];
      rk.life -= dt;
      const speed = rk.v.length();
      const frameDist = speed * dt;
      this._tmpDir.copy(rk.v).divideScalar(speed);
      // перешкоди світу
      let hitT = this.world.shotBlockDist(rk.mesh.position, this._tmpDir, frameDist + 0.3);
      // зомбі на шляху
      if (this.zombieHitTest) {
        const zh = this.zombieHitTest(rk.mesh.position, this._tmpDir, frameDist + 0.6);
        if (zh && zh.t < hitT) hitT = zh.t;
      }
      let boom = hitT <= frameDist + 0.3;
      rk.mesh.position.addScaledVector(rk.v, dt);
      const rp = rk.mesh.position;
      if (!boom && rp.y < this.world.groundH(rp.x, rp.z) + 0.15) boom = true;
      // димний слід
      rk.smokeT -= dt;
      if (rk.smokeT <= 0) {
        rk.smokeT = 0.04;
        this.burst(rp, 0xd8d8d8, 1, { speed: 0.4, up: 0.8, life: 0.5, size: 0.8 });
      }
      if (boom || rk.life <= 0) {
        if (rk.netWait) {
          // гість: ховаємо ракету, великий вибух прийде подією bm
          if (rk.life > 0.5) rk.life = 0.5;
          rk.v.multiplyScalar(0.0);
          rk.mesh.visible = false;
          if (rk.life <= 0) { this.scene.remove(rk.mesh); disposeObject(rk.mesh); this.rockets.splice(i, 1); }
        } else {
          this._explodeAt(rp.clone(), 4.5, rk.dmg, { gid: rk.gid || 0, pid: rk.pid || 1 });
          this.scene.remove(rk.mesh);
          disposeObject(rk.mesh);
          this.rockets.splice(i, 1);
        }
      }
    }

    // гранати
    for (let i = this.grenadesLive.length - 1; i >= 0; i--) {
      const g = this.grenadesLive[i];
      g.fuse -= dt;
      g.v.y -= 14 * dt;
      // 🧱 граната не пролітає крізь стіни — горизонтальний замет з відскоком (як у ракет/снарядів).
      // Маленька дистанція кадру означає, що террейн у shotBlockDist не семплиться — перевіряємо лише оклюдери (стіни/стовбури).
      const ghv = Math.hypot(g.v.x, g.v.z);
      if (ghv > 0.4) {
        this._tmpDir.set(g.v.x / ghv, 0, g.v.z / ghv);
        const reach = ghv * dt + 0.2;
        if (this.world.shotBlockDist(g.mesh.position, this._tmpDir, reach) <= reach) {
          g.v.x *= -0.4; g.v.z *= -0.4;
          if (ghv > 3) this.audio.bounce();
        }
      }
      g.mesh.position.addScaledVector(g.v, dt);
      g.mesh.rotation.x += dt * 6;
      const gy = this.world.groundH(g.mesh.position.x, g.mesh.position.z) + 0.13;
      if (g.mesh.position.y < gy) {
        g.mesh.position.y = gy;
        if (Math.abs(g.v.y) > 2) this.audio.bounce();
        g.v.y = -g.v.y * 0.42;
        g.v.x *= 0.65;
        g.v.z *= 0.65;
      }
      // миготить червоним перед вибухом
      g.blink += dt;
      if (g.fuse < 0.8) {
        g.mesh.material = (Math.floor(g.blink * 10) % 2) ? this.grenadeHotMat : this.grenadeMat;
      }
      if (g.fuse <= 0) {
        if (g.netWait) { g.fuse = 0.01; continue; }
        this._explodeGrenade(g);
        this.grenadesLive.splice(i, 1);
      }
    }

    // бочки: запалені ґноти і вибухи
    if (this.barrels) {
      for (const b of this.barrels) {
        if (b.exploded || b.fuse < 0) continue;
        b.fuse -= dt;
        if (b.fuse <= 0) {
          b.exploded = true;
          this._explodeAt(new THREE.Vector3(b.x, b.y + 0.6, b.z), 5.5, 135, { barrels: [this.barrels.indexOf(b)] });
          this.scene.remove(b.mesh);
          disposeObject(b.mesh);
          this.world.removeCollider(b.collider);
        }
      }
    }

    // м'яч (на гості позиція їде зі снапшота — фізику не чіпаємо)
    if (this.ball && this.levelRef && this.levelRef.mirror) {
      this.ball.mesh.rotation.x += dt * 2;
    } else if (this.ball) {
      const bl = this.ball;
      bl.v.y -= 13 * dt;
      bl.mesh.position.addScaledVector(bl.v, dt);
      const bg = Math.max(
        this.world.groundH(bl.mesh.position.x, bl.mesh.position.z),
        this.world.floorAt(bl.mesh.position.x, bl.mesh.position.z, bl.mesh.position.y)
      ) + 0.45;
      if (bl.mesh.position.y < bg) {
        bl.mesh.position.y = bg;
        bl.v.y = Math.abs(bl.v.y) > 1.5 ? -bl.v.y * 0.55 : 0;
        bl.v.x *= 0.94;
        bl.v.z *= 0.94;
      }
      const solved = this.world.collide(bl.mesh.position.x, bl.mesh.position.z, 0.45);
      if (solved.x !== bl.mesh.position.x || solved.z !== bl.mesh.position.z) {
        bl.v.x *= -0.5;
        bl.v.z *= -0.5;
        bl.mesh.position.x = solved.x;
        bl.mesh.position.z = solved.z;
      }
      // удар ногою — підбіг впритул
      if (ppos) {
        const dx = bl.mesh.position.x - ppos.x;
        const dz = bl.mesh.position.z - ppos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.0 && d > 0.01) {
          bl.v.x = (dx / d) * 8;
          bl.v.z = (dz / d) * 8;
          bl.v.y = 3.5;
          this.audio.kick();
        }
      }
      // котиться
      bl.mesh.rotation.x += bl.v.z * dt / 0.45;
      bl.mesh.rotation.z -= bl.v.x * dt / 0.45;
      bl.v.x *= (1 - 0.4 * dt);
      bl.v.z *= (1 - 0.4 * dt);
    }

    // аеродроп (таймер крутиться лише там, де є авторитет)
    if (this.airdropT === undefined) this.airdropT = 80;
    if (!this.airdrop) {
      if (!this.levelRef || !this.levelRef.mirror) {
        this.airdropT -= dt;
        if (this.airdropT <= 0 && ppos) this._spawnAirdrop(ppos.x, ppos.z);
      }
    } else {
      const ad = this.airdrop;
      if (!ad.landed) {
        ad.g.position.y -= 7 * dt;
        ad.g.rotation.y += dt * 0.5;
        if (ad.g.position.y <= ad.gy + 0.5) {
          ad.g.position.y = ad.gy + 0.5;
          ad.landed = true;
          ad.chute.visible = false;
          this.burst(ad.g.position, 0xd8cdbb, 8, { speed: 3, life: 0.5 });
          if (!this.levelRef || !this.levelRef.mirror) {
            // лут навколо ящика + особливий сюрприз
            this.spawnPickup(ad.x + 1.2, ad.z, 'ammo', 90);
            this.spawnPickup(ad.x - 1.2, ad.z, 'medkit', 90);
            const special = this.rollAirdropSpecial ? this.rollAirdropSpecial() : 'grenade';
            this.spawnPickup(ad.x, ad.z + 1.4, special, 90);
            if (special !== 'grenade' && Math.random() < 0.6) {
              this.spawnPickup(ad.x - 0.5, ad.z - 1.3, 'grenade', 90);
            }
            for (let i = 0; i < 6; i++) {
              this.spawnCoin(ad.x + (Math.random() - 0.5) * 3, ad.z + (Math.random() - 0.5) * 3, 10, 90);
            }
          }
        }
      } else {
        ad.lifeAfter -= dt;
        if (ad.lifeAfter <= 0) {
          this.scene.remove(ad.g);
          disposeObject(ad.g);
          ad.beam.remove();
          this.airdrop = null;
          this.airdropT = 120 + Math.random() * 50;
        }
      }
    }

    // тварини: блукають, тікають від гравця і зомбі
    if (this.animals) {
      for (const an of this.animals) {
        an.t -= dt;
        let spd = 1.2;
        let fleeing = false;
        if (ppos) {
          const dx = an.x - ppos.x, dz = an.z - ppos.z;
          const d = Math.hypot(dx, dz);
          if (d < 5 && d > 0.01) {
            an.tx = an.x + (dx / d) * 8;
            an.tz = an.z + (dz / d) * 8;
            spd = 4.6;
            fleeing = true;
            if (an.kind === 'chickens') this.audio.cluck();
          }
        }
        if (!fleeing && an.t <= 0) {
          an.t = 2 + Math.random() * 3;
          an.tx = an.hx + (Math.random() - 0.5) * 24;
          an.tz = an.hz + (Math.random() - 0.5) * 24;
        }
        const mx = an.tx - an.x, mz = an.tz - an.z;
        const md = Math.hypot(mx, mz);
        if (md > 0.5) {
          an.x += (mx / md) * spd * dt;
          an.z += (mz / md) * spd * dt;
          const solved = this.world.collide(an.x, an.z, 0.25);
          an.x = solved.x;
          an.z = solved.z;
          an.g.rotation.y = Math.atan2(-mx, -mz);
          an.ph += dt * spd * 5;
        }
        an.g.position.set(an.x, this.world.groundH(an.x, an.z) + Math.abs(Math.sin(an.ph)) * 0.08, an.z);
      }
    }

    // цифри шкоди
    for (const d of this.dmgPool) {
      if (!d.spr.visible) continue;
      d.life -= dt;
      d.spr.position.y += d.vy * dt;
      d.vy *= 0.94;
      d.spr.material.opacity = Math.min(1, d.life / 0.3);
      if (d.life <= 0) d.spr.visible = false;
    }

    // монети/підбирання
    const pp = ppos;
    // цілі підбору рахуємо РАЗ на кадр, а не на кожну монету (фонтан боса/золотого = десятки монет → десятки алокацій/кадр)
    const pickTargets = this.getPickupTargets
      ? this.getPickupTargets()
      : (pp ? [{ pos: pp, magnet: this.getMagnetActive && this.getMagnetActive(), pid: 1 }] : []);
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
      const L = this.levelRef;
      let granted = null;
      let pulled = false;
      for (const tgt of pickTargets) {
        const tpv = tgt.pos;
        const dx = tpv.x - c.mesh.position.x;
        const dz = tpv.z - c.mesh.position.z;
        const d = Math.hypot(dx, dz);
        const magnetR = c.type === 'coin' ? (tgt.magnet ? 22 : 5) : 2.2;
        if (!pulled && d < magnetR && d > 0.01) {
          const pull = (c.type === 'coin' ? 14 : 8) * dt / Math.max(d, 0.5);
          c.mesh.position.x += dx * pull;
          c.mesh.position.z += dz * pull;
          pulled = true;
        }
        const grabR = tgt.pid === 1 ? 1.0 : 1.5; // гостям трохи щедріше через лаг
        if (d < grabR && Math.abs(c.mesh.position.y - (tpv.y + 0.6)) < 1.8) {
          granted = tgt;
          break;
        }
      }
      // гість: магніт лише як картинка, підбирання вирішує хост
      if (L && L.mirror && pp && !pulled) {
        const dx = pp.x - c.mesh.position.x;
        const dz = pp.z - c.mesh.position.z;
        const d = Math.hypot(dx, dz);
        const magnetOn = this.getMagnetActive && this.getMagnetActive();
        const magnetR = c.type === 'coin' ? (magnetOn ? 22 : 5) : 2.2;
        if (d < magnetR && d > 0.01) {
          const pull = (c.type === 'coin' ? 14 : 8) * dt / Math.max(d, 0.5);
          c.mesh.position.x += dx * pull;
          c.mesh.position.z += dz * pull;
        }
      }
      if (granted) {
        if (L && L.net && L.net.authority) {
          L.netEv('lt', c.nid, granted.pid, c.type, c.value);
          if (granted.pid === 1 && this.onPickup) this.onPickup(c.type, c.value);
        } else if (this.onPickup) {
          this.onPickup(c.type, c.value);
        }
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        continue;
      }
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        if (L && L.net && L.net.authority) L.netEv('ig', c.nid);
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
        disposeObject(g);
      },
    };
    return handle;
  }
}
