// Відкритий світ: терен, село, ліс, дороги, особливі будівлі, колайдери
import * as THREE from 'three';
import { toonMat, bakeGroupMeshes } from './characters.js';
import { makeFBM, smoothstep, lerp, clamp, distToSeg, closestRaySeg, RNG } from './utils.js';
import { BIOMES } from './countries.js';

const GKEY = (cx, cz) => (cx + 512) * 4096 + (cz + 512);

export const LAYOUT = {
  BOUND: 200,
  SPAWN: { x: 6, z: 168 },
  village: { x: 0, z: 0, r: 50 },
  rescue: { x: -98, z: -62, r: 16 },
  tower: { x: 112, z: -92, r: 16 },
  warehouse: { x: 128, z: 58, r: 22 },
  arena: { x: -10, z: -168, r: 30 },
};

export const ROADS = [
  [[6, 192], [6, 120], [2, 60], [0, 10]],
  [[0, 10], [-40, -18], [-78, -48], [-96, -58]],
  [[2, 6], [40, -30], [80, -64], [110, -88]],
  [[4, 12], [50, 12], [95, 36], [124, 54]],
  [[-2, 4], [-6, -60], [-10, -120], [-10, -146]],
];

const ROAD_SEGS = [];
for (const line of ROADS) {
  for (let i = 0; i < line.length - 1; i++) {
    ROAD_SEGS.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]]);
  }
}

export class World {
  constructor(scene, seed = 1377, biome = null) {
    this.scene = scene;
    this.biome = biome || BIOMES.summer;
    this.rng = new RNG(seed);
    this.fbmLow = makeFBM(seed, 2);
    this.fbmHi = makeFBM(seed + 7, 2);
    this.colliders = []; // {x, z, r} — для руху
    this.occluders = []; // {x, z, r, h} — вертикальні капсули для куль
    this.grid = new Map();
    this.time = 0;
    this.animatedFlags = [];
    // усі нерухомі пропси збираються сюди і запікаються в один меш
    this.staticGroup = new THREE.Group();
    this.scene.add(this.staticGroup);
    this._buildLights();
    this._buildSky();
    this._buildTerrain();
    this._buildRoads();
    this._buildVegetation();
    this._buildVillage();
    this._buildBarn();
    this._buildTower();
    this._buildWarehouse();
    this._buildArena();
    this._buildClouds();
    if (this.biome.snowfall) this._buildSnowfall();
    this._buildGrid();
    bakeGroupMeshes(this.staticGroup, { castShadow: true, receiveShadow: true });
  }

  // ---------- висота терену (аналітична — однакова для меша і фізики) ----------
  groundH(x, z) {
    const low = this.fbmLow(x * 0.011, z * 0.011) * 6.0;
    const hi = this.fbmHi(x * 0.045, z * 0.045) * 1.1;
    const dTower = Math.hypot(x - LAYOUT.tower.x, z - LAYOUT.tower.z);
    const hill = 8 * Math.exp(-(dTower * dTower) / (2 * 42 * 42));
    let h = low + hi + hill;
    // дороги — прибираємо дрібні горби
    let roadD = Infinity;
    for (const s of ROAD_SEGS) {
      const d = distToSeg(x, z, s[0], s[1], s[2], s[3]);
      if (d < roadD) roadD = d;
    }
    const rw = smoothstep(6.0, 2.4, roadD);
    if (rw > 0) h = lerp(h, low * 0.9 + hill, rw);
    // майданчики місій — рівні
    for (const key of ['village', 'rescue', 'tower', 'warehouse', 'arena']) {
      const site = LAYOUT[key];
      const d = Math.hypot(x - site.x, z - site.z);
      const w = smoothstep(site.r + 12, site.r * 0.5, d);
      if (w > 0) {
        if (this._siteH === undefined) this._siteH = {};
        if (this._siteH[key] === undefined) {
          const sl = this.fbmLow(site.x * 0.011, site.z * 0.011) * 6.0;
          const dT = Math.hypot(site.x - LAYOUT.tower.x, site.z - LAYOUT.tower.z);
          this._siteH[key] = sl + 8 * Math.exp(-(dT * dT) / (2 * 42 * 42));
        }
        h = lerp(h, this._siteH[key], w);
      }
    }
    return h;
  }

  roadDist(x, z) {
    let d = Infinity;
    for (const s of ROAD_SEGS) {
      const v = distToSeg(x, z, s[0], s[1], s[2], s[3]);
      if (v < d) d = v;
    }
    return d;
  }

  // ---------- освітлення і небо ----------
  _buildLights() {
    const b = this.biome;
    const hemi = new THREE.HemisphereLight(b.hemiSky, b.hemiGround, b.hemiIntensity);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(b.sunColor, b.sunIntensity);
    sun.position.set(b.sunPos[0], b.sunPos[1], b.sunPos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -75;
    sun.shadow.camera.right = 75;
    sun.shadow.camera.top = 75;
    sun.shadow.camera.bottom = -75;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    this.sunBaseX = b.sunPos[0];
    this.sunBaseY = b.sunPos[1];
    this.sunBaseZ = b.sunPos[2];
    this.scene.fog = new THREE.Fog(b.fogColor, b.fogNear, b.fogFar);
  }

  // сонце-тінь слідує за гравцем (з кроком, щоб тіні не мерехтіли)
  followSun(px, pz) {
    if (this._sunX !== undefined && Math.hypot(px - this._sunX, pz - this._sunZ) < 3) return;
    this._sunX = px;
    this._sunZ = pz;
    const texel = 150 / 2048;
    const sx = Math.round(px / texel) * texel;
    const sz = Math.round(pz / texel) * texel;
    this.sun.position.set(sx + this.sunBaseX, this.sunBaseY, sz + this.sunBaseZ);
    this.sun.target.position.set(sx, 0, sz);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(750, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(this.biome.skyTop) },
        horizon: { value: new THREE.Color(this.biome.skyHorizon) },
        bottom: { value: new THREE.Color(this.biome.skyBottom) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
        varying vec3 vPos;
        void main(){
          float t = normalize(vPos).y;
          vec3 c = t > 0.0 ? mix(horizon, top, pow(min(t*1.6,1.0), 0.7)) : mix(horizon, bottom, min(-t*3.0,1.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    this.scene.add(sky);
    this.sky = sky;
    // сонячний диск
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(38, 24),
      new THREE.MeshBasicMaterial({ color: this.biome.sunDisc, fog: false, transparent: true, opacity: 0.95 })
    );
    sunDisc.position.set(this.biome.sunDiscPos[0], this.biome.sunDiscPos[1], this.biome.sunDiscPos[2]);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(70, 24),
      new THREE.MeshBasicMaterial({ color: this.biome.sunDisc, fog: false, transparent: true, opacity: 0.25 })
    );
    glow.position.copy(sunDisc.position).multiplyScalar(0.995);
    glow.lookAt(0, 0, 0);
    this.scene.add(glow);
  }

  // ---------- терен ----------
  _buildTerrain() {
    const SIZE = 460, SEG = 130;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass1 = new THREE.Color(this.biome.grass1);
    const cGrass2 = new THREE.Color(this.biome.grass2);
    const cGrass3 = new THREE.Color(this.biome.grass3);
    const cDirt = new THREE.Color(this.biome.dirt);
    const cPlaza = new THREE.Color(this.biome.plaza);
    const cArena = new THREE.Color(this.biome.arenaGround);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.groundH(x, z);
      pos.setY(i, h);
      const n = this.fbmHi(x * 0.055 + 50, z * 0.055 + 50);
      tmp.copy(cGrass1);
      if (n > 0.25) tmp.lerp(cGrass3, smoothstep(0.25, 0.6, n));
      else if (n < -0.2) tmp.lerp(cGrass2, smoothstep(-0.2, -0.6, n));
      const roadD = this.roadDist(x, z);
      if (roadD < 3.4) tmp.lerp(cDirt, smoothstep(3.4, 2.0, roadD));
      const dV = Math.hypot(x - LAYOUT.village.x - 4, z - LAYOUT.village.z - 6);
      if (dV < 16) tmp.lerp(cPlaza, smoothstep(16, 8, dV) * 0.8);
      const dA = Math.hypot(x - LAYOUT.arena.x, z - LAYOUT.arena.z);
      if (dA < LAYOUT.arena.r + 4) tmp.lerp(cArena, smoothstep(LAYOUT.arena.r + 4, LAYOUT.arena.r - 6, dA) * 0.85);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  // ---------- дорожня стрічка з чітким краєм ----------
  _buildRoads() {
    const positions = [];
    const colors = [];
    const cols = [-2.7, -1.9, 1.9, 2.7];
    const cMain = new THREE.Color(this.biome.roadMain);
    const cEdge = new THREE.Color(this.biome.roadEdge);
    const tmp = new THREE.Color();
    const pushV = (x, z, c) => {
      positions.push(x, this.groundH(x, z) + 0.07, z);
      colors.push(c.r, c.g, c.b);
    };
    for (const line of ROADS) {
      for (let s = 0; s < line.length - 1; s++) {
        const [ax, az] = line[s];
        const [bx, bz] = line[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(2, Math.ceil(len / 4));
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const px = -dz, pz = dx; // перпендикуляр
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps, t1 = (i + 1) / steps;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
          const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          for (let c = 0; c < 3; c++) {
            const o0 = cols[c], o1 = cols[c + 1];
            const isEdge = c !== 1;
            const col0 = isEdge ? cEdge : tmp.copy(cMain).offsetHSL(0, 0, this.fbmHi(x0 * 0.2, z0 * 0.2) * 0.03);
            // два трикутники квада
            pushV(x0 + px * o0, z0 + pz * o0, col0);
            pushV(x0 + px * o1, z0 + pz * o1, col0);
            pushV(x1 + px * o1, z1 + pz * o1, col0);
            pushV(x0 + px * o0, z0 + pz * o0, col0);
            pushV(x1 + px * o1, z1 + pz * o1, col0);
            pushV(x1 + px * o0, z1 + pz * o0, col0);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({
      vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // стовпи зв'язку вздовж дороги до вежі
    const poleM = toonMat(0x6e4f2f);
    const line = ROADS[2];
    for (let s = 0; s < line.length - 1; s++) {
      const [ax, az] = line[s];
      const [bx, bz] = line[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let d = 10; d < len; d += 22) {
        const x = ax + dx * d - dz * 4.2;
        const z = az + dz * d + dx * 4.2;
        const y = this.groundH(x, z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 7), poleM);
        pole.position.set(x, y + 2.3, z);
        const cross = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.09), poleM);
        cross.position.set(x, y + 4.2, z);
        cross.rotation.y = Math.atan2(dx, dz);
        this.staticGroup.add(pole, cross);
        this._addCollider(x, z, 0.22, y + 4.4, 0.13);
      }
    }
  }

  // ---------- рослинність (інстансована) ----------
  _addCollider(x, z, r, occH = 0, occR = 0) {
    this.colliders.push({ x, z, r });
    if (occH > 0) this.occluders.push({ x, z, r: occR || r, h: occH });
  }

  _scatterPoints(count, minDist, accept) {
    const pts = [];
    let guard = 0;
    while (pts.length < count && guard++ < count * 30) {
      const a = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * (LAYOUT.BOUND + 18);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!accept(x, z)) continue;
      let ok = true;
      for (const p of pts) {
        if (Math.hypot(p.x - x, p.z - z) < minDist) { ok = false; break; }
      }
      if (ok) pts.push({ x, z });
    }
    return pts;
  }

  _farFromSites(x, z, pad = 8) {
    for (const key of ['rescue', 'tower', 'warehouse', 'arena']) {
      const s = LAYOUT[key];
      if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return false;
    }
    return true;
  }

  _buildVegetation() {
    const rng = this.rng;
    const isForest = (x, z) => this.fbmLow(x * 0.016 + 200, z * 0.016 + 200) > 0.12;
    const acceptTree = (x, z) => {
      const d = Math.hypot(x, z);
      if (d > LAYOUT.BOUND + 16) return false;
      if (this.roadDist(x, z) < 7) return false;
      if (!this._farFromSites(x, z, 10)) return false;
      if (Math.hypot(x - LAYOUT.village.x, z - LAYOUT.village.z) < 42 && !rng.chance(0.12)) return false;
      // густий ліс у "лісових" зонах і по краю мапи
      if (d > LAYOUT.BOUND - 14) return true;
      return isForest(x, z) || rng.chance(0.22);
    };

    const pr = this.biome.pineRatio;
    const oaks = this._scatterPoints(Math.round(340 * (1 - pr)), 4.5, acceptTree);
    const pines = this._scatterPoints(Math.round(340 * pr), 4.5, (x, z) => acceptTree(x, z) && this.fbmHi(x * 0.02, z * 0.02) > -0.3);

    // дуби: стовбур + 3 кулі крони
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 7);
    const trunkMat = toonMat(0x7a5230);
    const oakTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, oaks.length);
    const crownGeo = new THREE.IcosahedronGeometry(1, 1);
    const crownMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: trunkMat.gradientMap });
    const oakCrowns = new THREE.InstancedMesh(crownGeo, crownMat, oaks.length * 3);
    const greens = this.biome.treeGreens;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v3 = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    let ci = 0;
    oaks.forEach((p, i) => {
      const h = this.groundH(p.x, p.z);
      const tH = rng.range(2.2, 3.4);
      q.setFromEuler(new THREE.Euler(0, rng.next() * 6.28, rng.range(-0.06, 0.06)));
      m4.compose(v3.set(p.x, h + tH / 2 - 0.1, p.z), q, sc.set(1, tH, 1));
      oakTrunks.setMatrixAt(i, m4);
      const baseR = rng.range(1.5, 2.3);
      for (let k = 0; k < 3; k++) {
        const ang = rng.next() * 6.28;
        const off = k === 0 ? 0 : rng.range(0.5, 1.0);
        const r = k === 0 ? baseR : baseR * rng.range(0.55, 0.75);
        m4.compose(
          v3.set(p.x + Math.cos(ang) * off, h + tH + (k === 0 ? 0.4 : rng.range(0.6, 1.4)), p.z + Math.sin(ang) * off),
          q.setFromEuler(new THREE.Euler(rng.next(), rng.next(), 0)),
          sc.set(r, r * 0.85, r)
        );
        oakCrowns.setMatrixAt(ci, m4);
        oakCrowns.setColorAt(ci, col.setHex(rng.pick(greens)));
        ci++;
      }
      this._addCollider(p.x, p.z, 0.55, h + 2.6, 0.3);
    });
    oakTrunks.castShadow = true;
    oakCrowns.castShadow = true;
    this.scene.add(oakTrunks, oakCrowns);

    // сосни: стовбур + 2 конуси
    const pTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pines.length);
    const coneGeo = new THREE.ConeGeometry(1, 1, 8);
    const pCones = new THREE.InstancedMesh(coneGeo, crownMat, pines.length * 2);
    const pineGreens = this.biome.pineGreens;
    let pi = 0;
    pines.forEach((p, i) => {
      const h = this.groundH(p.x, p.z);
      const tH = rng.range(1.6, 2.4);
      q.setFromEuler(new THREE.Euler(0, rng.next() * 6.28, 0));
      m4.compose(v3.set(p.x, h + tH / 2, p.z), q, sc.set(0.8, tH, 0.8));
      pTrunks.setMatrixAt(i, m4);
      const cR = rng.range(1.3, 1.9);
      const c1H = rng.range(2.6, 3.6);
      m4.compose(v3.set(p.x, h + tH + c1H / 2 - 0.3, p.z), q, sc.set(cR, c1H, cR));
      pCones.setMatrixAt(pi, m4);
      pCones.setColorAt(pi, col.setHex(rng.pick(pineGreens)));
      pi++;
      m4.compose(v3.set(p.x, h + tH + c1H * 0.75, p.z), q, sc.set(cR * 0.65, c1H * 0.7, cR * 0.65));
      pCones.setMatrixAt(pi, m4);
      pCones.setColorAt(pi, col.setHex(rng.pick(pineGreens)));
      pi++;
      this._addCollider(p.x, p.z, 0.5, h + 2.4, 0.28);
    });
    pTrunks.castShadow = true;
    pCones.castShadow = true;
    this.scene.add(pTrunks, pCones);

    // кущі
    const bushPts = this._scatterPoints(170, 3, (x, z) =>
      Math.hypot(x, z) < LAYOUT.BOUND + 5 && this.roadDist(x, z) > 4.5 && this._farFromSites(x, z, 4));
    const bushGeo = new THREE.IcosahedronGeometry(1, 1);
    const bushes = new THREE.InstancedMesh(bushGeo, crownMat, bushPts.length);
    bushPts.forEach((p, i) => {
      const h = this.groundH(p.x, p.z);
      const s = rng.range(0.5, 1.1);
      q.setFromEuler(new THREE.Euler(0, rng.next() * 6.28, 0));
      m4.compose(v3.set(p.x, h + s * 0.45, p.z), q, sc.set(s, s * 0.7, s));
      bushes.setMatrixAt(i, m4);
      bushes.setColorAt(i, col.setHex(rng.pick(greens)));
    });
    bushes.castShadow = true;
    this.scene.add(bushes);

    // камені
    const rockPts = this._scatterPoints(70, 6, (x, z) =>
      Math.hypot(x, z) < LAYOUT.BOUND + 8 && this.roadDist(x, z) > 5 && this._farFromSites(x, z, 5));
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: trunkMat.gradientMap, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockPts.length);
    const rockCols = [0x9aa3ad, 0x8a929c, 0xa8b0b8];
    rockPts.forEach((p, i) => {
      const h = this.groundH(p.x, p.z);
      const s = rng.range(0.4, 1.6);
      q.setFromEuler(new THREE.Euler(rng.next(), rng.next() * 6.28, rng.next()));
      m4.compose(v3.set(p.x, h + s * 0.3, p.z), q, sc.set(s, s * rng.range(0.6, 0.9), s));
      rocks.setMatrixAt(i, m4);
      rocks.setColorAt(i, col.setHex(rng.pick(rockCols)));
      if (s > 0.9) this._addCollider(p.x, p.z, s * 0.8, h + s, s * 0.8);
    });
    rocks.castShadow = true;
    this.scene.add(rocks);

    // квіти біля села та галявин
    if (!this.biome.flowers) return;
    const flowerPts = this._scatterPoints(260, 1.5, (x, z) => {
      const d = Math.hypot(x, z);
      return d < 130 && this.roadDist(x, z) > 3.5 && this._farFromSites(x, z, 4) && !isForest(x, z);
    });
    const headGeo = new THREE.SphereGeometry(0.09, 8, 6);
    const headMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: trunkMat.gradientMap });
    const flowers = new THREE.InstancedMesh(headGeo, headMat, flowerPts.length);
    const fCols = [0xff5d73, 0xffd23f, 0xff8c42, 0xb086f2, 0xffffff];
    flowerPts.forEach((p, i) => {
      const h = this.groundH(p.x, p.z);
      m4.compose(v3.set(p.x, h + 0.22, p.z), q.identity(), sc.set(1, 1, 1));
      flowers.setMatrixAt(i, m4);
      flowers.setColorAt(i, col.setHex(rng.pick(fCols)));
    });
    this.scene.add(flowers);
    const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4);
    const stems = new THREE.InstancedMesh(stemGeo, toonMat(0x3f8f2f), flowerPts.length);
    flowerPts.forEach((p, i) => {
      const h = this.groundH(p.x, p.z);
      m4.compose(v3.set(p.x, h + 0.11, p.z), q.identity(), sc.set(1, 1, 1));
      stems.setMatrixAt(i, m4);
    });
    this.scene.add(stems);
  }

  // ---------- будинки ----------
  _prismGeo(w, h, d) {
    // двосхилий дах: гребінь уздовж X
    const hw = w / 2, hd = d / 2;
    const verts = [
      // передній схил (z-)
      -hw, 0, -hd, hw, 0, -hd, hw, h, 0,
      -hw, 0, -hd, hw, h, 0, -hw, h, 0,
      // задній схил
      hw, 0, hd, -hw, 0, hd, -hw, h, 0,
      hw, 0, hd, -hw, h, 0, hw, h, 0,
      // фронтони
      hw, 0, -hd, hw, 0, hd, hw, h, 0,
      -hw, 0, hd, -hw, 0, -hd, -hw, h, 0,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }

  _makeHouse(x, z, ry, opts = {}) {
    const rng = this.rng;
    const w = opts.w || rng.range(5.5, 7.5);
    const d = opts.d || rng.range(4.6, 6);
    const h = opts.h || rng.range(2.7, 3.2);
    const wallC = opts.wall || rng.pick(this.biome.housePalette);
    const roofC = opts.roof || rng.pick(this.biome.roofPalette);
    const g = new THREE.Group();
    const gy = this.groundH(x, z);

    const found = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), toonMat(0x9aa3ad));
    found.position.y = 0.15;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMat(wallC));
    walls.position.y = 0.4 + h / 2;
    walls.castShadow = true;
    const roof = new THREE.Mesh(this._prismGeo(w + 0.7, h * 0.55, d + 0.7), toonMat(roofC));
    roof.position.y = 0.4 + h;
    roof.castShadow = true;
    g.add(found, walls, roof);
    if (this.biome.snow) {
      // снігова шапка на даху
      const cap = new THREE.Mesh(this._prismGeo(w + 0.8, h * 0.2, d + 0.8), toonMat(0xf4f9fc));
      cap.position.y = 0.4 + h + h * 0.42;
      g.add(cap);
    }

    // димар
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), toonMat(0xb0654a));
    chim.position.set(w * 0.25, 0.4 + h + h * 0.35, d * 0.18);
    chim.castShadow = true;
    g.add(chim);

    // двері (фронт -Z)
    const doorM = toonMat(0x6b4226);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.7, 0.1), doorM);
    door.position.set(0, 0.4 + 0.85, -d / 2 - 0.03);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.14), toonMat(0xffffff));
    lintel.position.set(0, 0.4 + 1.78, -d / 2 - 0.03);
    g.add(door, lintel);

    // вікна
    const frameM = toonMat(0xffffff);
    const glassM = toonMat(0x9fd8ff, 0x4fb8ff, 0.25);
    const addWindow = (wx, wy, wz, rotY) => {
      const wg = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.0, 0.08), frameM);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.82, 0.09), glassM);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.1), frameM);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.1), frameM);
      wg.add(frame, glass, bar, bar2);
      wg.position.set(wx, wy, wz);
      wg.rotation.y = rotY;
      g.add(wg);
    };
    addWindow(-w * 0.28, 0.4 + h * 0.55, -d / 2 - 0.03, 0);
    addWindow(w * 0.28, 0.4 + h * 0.55, -d / 2 - 0.03, 0);
    addWindow(-w / 2 - 0.03, 0.4 + h * 0.55, 0, Math.PI / 2);
    addWindow(w / 2 + 0.03, 0.4 + h * 0.55, 0, Math.PI / 2);

    g.position.set(x, gy, z);
    g.rotation.y = ry;
    this.staticGroup.add(g);

    // колайдери — ланцюжок кіл уздовж довшої осі з урахуванням повороту
    const long = Math.max(w, d), short = Math.min(w, d);
    const n = Math.max(1, Math.round(long / short));
    const axisAlongX = w >= d;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (long - short);
      const lx = axisAlongX ? t : 0;
      const lz = axisAlongX ? 0 : t;
      const cx = x + lx * Math.cos(ry) + lz * Math.sin(ry);
      const cz = z - lx * Math.sin(ry) + lz * Math.cos(ry);
      this._addCollider(cx, cz, short / 2 + 0.25, gy + h + 0.5, short / 2 + 0.2);
    }
    return g;
  }

  _buildVillage() {
    const houses = [
      [18, 40, Math.PI / 2], [-14, 30, -Math.PI / 2], [16, 8, Math.PI / 2],
      [-16, -8, -Math.PI / 2], [-30, -26, 0], [26, -20, Math.PI],
      [38, 22, 0], [-12, 78, -Math.PI / 2], [20, 98, Math.PI / 2],
      [60, 4, 0],
    ];
    for (const [x, z, ry] of houses) this._makeHouse(x, z, ry);

    // криниця в центрі села
    const wx = 4, wz = 6;
    const wy = this.groundH(wx, wz);
    const wellG = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.8, 12), toonMat(0x9aa3ad));
    ring.position.y = 0.4;
    ring.castShadow = true;
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.82, 12), toonMat(0x2a3a4a));
    inner.position.y = 0.42;
    const postM = toonMat(0x7a5230);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), postM);
      post.position.set(sx * 0.85, 1.2, 0);
      wellG.add(post);
    }
    const wellRoof = new THREE.Mesh(this._prismGeo(2.4, 0.7, 1.6), toonMat(0xc0563b));
    wellRoof.position.y = 2.0;
    wellRoof.castShadow = true;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.25, 8), toonMat(0x6b4226));
    bucket.position.y = 1.1;
    wellG.add(ring, inner, wellRoof, bucket);
    wellG.position.set(wx, wy, wz);
    this.staticGroup.add(wellG);
    this._addCollider(wx, wz, 1.15, wy + 1.2, 1.0);

    // ліхтарі вздовж південної дороги
    const lampM = toonMat(0x37404f);
    const lampHeadM = toonMat(0xffd97a, 0xffc233, this.biome.lampGlow);
    for (const [lx, lz] of [[10, 130], [2, 90], [10, 50], [-4, 24], [12, 14], [-8, -2]]) {
      const ly = this.groundH(lx, lz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), lampM);
      pole.position.set(lx, ly + 1.7, lz);
      pole.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampHeadM);
      head.position.set(lx, ly + 3.5, lz);
      this.staticGroup.add(pole, head);
      this._addCollider(lx, lz, 0.25, ly + 3.2, 0.15);
    }

    // парканчики навколо двох дворів
    const fenceM = toonMat(0xe8e2d0);
    const addFenceRun = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.floor(len / 0.55);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const fx = lerp(x1, x2, t), fz = lerp(z1, z2, t);
        const fy = this.groundH(fx, fz);
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.04), fenceM);
        p.position.set(fx, fy + 0.37, fz);
        p.rotation.y = Math.atan2(z2 - z1, x2 - x1);
        this.staticGroup.add(p);
      }
      const ry = Math.atan2(z2 - z1, x2 - x1);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.05), fenceM);
      const my = this.groundH((x1 + x2) / 2, (z1 + z2) / 2);
      rail.position.set((x1 + x2) / 2, my + 0.55, (z1 + z2) / 2);
      rail.rotation.y = -ry;
      this.staticGroup.add(rail);
    };
    addFenceRun(12, 35, 12, 45); addFenceRun(12, 45, 25, 45); addFenceRun(25, 45, 25, 35);
    addFenceRun(-20, 25, -20, 36); addFenceRun(-20, 36, -9, 36);

    // сіно на схід від села
    const hayM = toonMat(0xe2c044);
    for (let i = 0; i < (this.biome.hay ? 7 : 0); i++) {
      const hx = this.rng.range(55, 95), hz = this.rng.range(-15, 30);
      if (this.roadDist(hx, hz) < 5) continue;
      const hy = this.groundH(hx, hz);
      const hay = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 12), hayM);
      hay.rotation.z = Math.PI / 2;
      hay.rotation.y = this.rng.next() * 3;
      hay.position.set(hx, hy + 0.8, hz);
      this.staticGroup.add(hay);
      this._addCollider(hx, hz, 1.0, hy + 1.4, 0.8);
    }

    // вказівник на в'їзді
    this._makeSign(12, 162, this.biome.signText, 0);
  }

  _makeSign(x, z, text, ry = 0) {
    const y = this.groundH(x, z);
    const g = new THREE.Group();
    const postM = toonMat(0x7a5230);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 8), postM);
    post.position.y = 1.1;
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#5e3c1e'; ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 502, 118);
    ctx.fillStyle = '#ffeebf';
    ctx.font = 'bold 58px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.66, 0.1),
      [toonMat(0x8a5a32), toonMat(0x8a5a32), toonMat(0x8a5a32), toonMat(0x8a5a32),
        new THREE.MeshBasicMaterial({ map: tex }), toonMat(0x8a5a32)]
    );
    board.position.y = 1.9;
    board.castShadow = true;
    g.add(post, board);
    g.position.set(x, y, z);
    g.rotation.y = ry;
    this.scene.add(g);
    this._addCollider(x, z, 0.25, y + 2, 0.15);
  }

  // ---------- хлів із людьми (місія 1) ----------
  _buildBarn() {
    const { x, z } = LAYOUT.rescue;
    const gy = this.groundH(x, z);
    const g = new THREE.Group(); // динаміка — двері
    const gs = new THREE.Group(); // статика — стіни/дах
    const W = 9, D = 7, H = 3.6;
    const wallM = toonMat(0xc0463c);
    const trimM = toonMat(0xf5efe0);

    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallM);
    walls.position.y = H / 2;
    const roof = new THREE.Mesh(this._prismGeo(W + 1, 2.2, D + 1), toonMat(0x8a4b32));
    roof.position.y = H;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.15, 0.3, D + 0.15), trimM);
    trim.position.y = 0.15;
    gs.add(walls, roof, trim);

    // великі двостулкові двері на -Z
    this.barnDoors = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.5, 0, -D / 2 - 0.05);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.6, 0.12), toonMat(0xa83a30));
      panel.position.set(-side * 0.75, 1.4, 0);
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.14), trimM);
      cross1.position.copy(panel.position);
      cross1.rotation.z = 0.7;
      const cross2 = cross1.clone();
      cross2.rotation.z = -0.7;
      pivot.add(panel, cross1, cross2);
      g.add(pivot);
      this.barnDoors.push({ pivot, side, open: 0 });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.25, 0.2), trimM);
    lintel.position.set(0, 2.85, -D / 2 - 0.05);
    gs.add(lintel);

    // віконце на фронтоні
    const loft = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), trimM);
    loft.position.set(0, H + 0.8, -D / 2 + 2.4);
    gs.add(loft);

    g.position.set(x, gy, z);
    gs.position.set(x, gy, z);
    this.scene.add(g);
    this.staticGroup.add(gs);
    this.barnGroup = g;
    this.barnDoorCollider = { x, z: z - D / 2, r: 1.6 };
    // стіни: три кола + двері
    this._addCollider(x - 3, z, 3.0, gy + H, 3.0);
    this._addCollider(x + 3, z, 3.0, gy + H, 3.0);
    this._addCollider(x, z + 1.5, 3.0, gy + H, 3.0);
    this.colliders.push(this.barnDoorCollider);
    // багаття перед хлівом (декор)
    const fireG = new THREE.Group();
    const logM = toonMat(0x6b4226);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), logM);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI;
      log.position.y = 0.1;
      fireG.add(log);
    }
    fireG.position.set(x + 4, this.groundH(x + 4, z - 5), z - 5);
    this.staticGroup.add(fireG);
  }

  openBarn() {
    this.barnOpening = true;
    const i = this.colliders.indexOf(this.barnDoorCollider);
    if (i >= 0) this.colliders.splice(i, 1);
    this._buildGrid();
  }

  // ---------- радіовежа (місія 2) ----------
  _buildTower() {
    const { x, z } = LAYOUT.tower;
    const gy = this.groundH(x, z);
    const g = new THREE.Group(); // динаміка: тарілка, вогник, промінь, екран
    const gs = new THREE.Group(); // статика: каркас
    const metalM = toonMat(0xb84a3a);
    const metalM2 = toonMat(0xe8e2d0);
    const H = 15;
    for (const [sx, sz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, H, 8), metalM);
      leg.position.set(sx * 0.55, H / 2, sz * 0.55);
      // нахил ніг всередину
      const tilt = Math.atan2(Math.hypot(sx, sz) * 0.55 * 0.6, H);
      leg.rotation.z = sx > 0 ? tilt : -tilt;
      leg.rotation.x = sz > 0 ? -tilt : tilt;
      leg.position.x = sx * (0.55 + 0.3);
      leg.position.z = sz * (0.55 + 0.3);
      gs.add(leg);
      this._addCollider(x + sx * 0.85, z + sz * 0.85, 0.22, gy + H * 0.7, 0.15);
    }
    for (let lvl = 1; lvl <= 3; lvl++) {
      const yy = (H / 4) * lvl;
      const w = lerp(3.4, 1.6, lvl / 3.5);
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.12), metalM2);
      b1.position.set(0, yy, -w / 2);
      const b2 = b1.clone(); b2.position.z = w / 2;
      const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, w), metalM2);
      b3.position.set(-w / 2, yy, 0);
      const b4 = b3.clone(); b4.position.x = w / 2;
      gs.add(b1, b2, b3, b4);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 2.2), metalM2);
    platform.position.y = H;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 8), metalM);
    mast.position.y = H + 2;
    gs.add(platform, mast);
    // тарілка (зламана — звисає)
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1.0, 14, 10, 0, Math.PI), toonMat(0xd8dde4));
    dish.position.y = H + 1.2;
    dish.rotation.x = Math.PI / 2 + 1.2; // звисає вниз — зламана
    dish.castShadow = true;
    g.add(dish);
    this.towerDish = dish;
    // вогник
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshToonMaterial({ color: 0xff5544, gradientMap: toonMat(0).gradientMap, emissive: 0xff2211, emissiveIntensity: 1 }));
    light.position.y = H + 4.1;
    g.add(light);
    this.towerLight = light;
    this.towerFixed = false;
    // сигнальний промінь (з'являється після ремонту)
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.25, 60, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    );
    beam.position.y = H + 30;
    g.add(beam);
    this.towerBeam = beam;
    // щиток керування біля ноги — точка ремонту
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.3), toonMat(0x4d5a6e));
    panel.position.set(2.6, 0.55, 0.4);
    gs.add(panel);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.05), toonMat(0xff5544, 0xff2211, 0.6));
    screen.position.set(2.6, 0.75, 0.23);
    g.add(screen);
    this.towerScreen = screen;
    this._addCollider(x + 2.6, z + 0.4, 0.5, gy + 1.2, 0.4);

    g.position.set(x, gy, z);
    gs.position.set(x, gy, z);
    this.scene.add(g);
    this.staticGroup.add(gs);
    this.towerGroup = g;
    this.repairPoint = { x: x + 2.6, z: z + 1.3 };
  }

  setTowerFixed() {
    this.towerFixed = true;
    this.towerDish.rotation.x = Math.PI / 2 - 0.5; // дивиться вгору
    this.towerLight.material = new THREE.MeshToonMaterial({
      color: 0x55ff88, gradientMap: toonMat(0).gradientMap, emissive: 0x22ff66, emissiveIntensity: 1.2,
    });
    this.towerScreen.material = toonMat(0x55ff88, 0x22ff66, 0.8);
    this.towerBeam.material.opacity = 0.35;
  }

  // ---------- склад зброї (місія 3) ----------
  _buildWarehouse() {
    const { x, z } = LAYOUT.warehouse;
    const gy = this.groundH(x, z);
    const g = new THREE.Group();
    const W = 16, D = 9, H = 5;
    const wallM = toonMat(0x7d8aa0);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallM);
    walls.position.y = H / 2;
    walls.castShadow = true;
    // ребра "гофри"
    const ribM = toonMat(0x6b7a92);
    for (let i = -3; i <= 3; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.15), ribM);
      rib.position.set(i * 2.2, H / 2, -D / 2 - 0.05);
      g.add(rib);
    }
    const roof = new THREE.Mesh(this._prismGeo(W + 0.8, 1.6, D + 0.8), toonMat(0x55617a));
    roof.position.y = H;
    roof.castShadow = true;
    // великі ворота зі смугами
    const gate = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 0.2), toonMat(0x55617a));
    gate.position.set(0, 1.8, -D / 2 - 0.08);
    const stripeM = toonMat(0xffd23f);
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.6, 0.22), stripeM);
      st.position.set(-1.5 + i * 1.5, 1.8, -D / 2 - 0.09);
      st.rotation.z = 0;
      g.add(st);
    }
    g.add(walls, roof, gate);
    g.position.set(x, gy, z);
    this.staticGroup.add(g);
    // колайдери складу
    this._addCollider(x - 5, z, 4.7, gy + H, 4.7);
    this._addCollider(x, z, 4.7, gy + H, 4.7);
    this._addCollider(x + 5, z, 4.7, gy + H, 4.7);

    // ящики навколо
    const crateM = toonMat(0xb08d57);
    const crateM2 = toonMat(0x8f6f42);
    const cratePos = [
      [x - 9, z - 7, 1.2], [x - 9, z - 7, 0, 1.2], [x - 7.8, z - 6.4, 1.1],
      [x + 8, z - 6, 1.3], [x + 9.4, z - 6.5, 1.0], [x + 8.6, z - 6, 0, 1.1],
      [x - 4, z - 8.5, 1.15], [x + 3, z - 9, 1.25],
    ];
    for (const c of cratePos) {
      const s = c[3] || c[2];
      const stacked = c.length === 4;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), this.rng.chance(0.5) ? crateM : crateM2);
      crate.position.set(c[0], this.groundH(c[0], c[1]) + (stacked ? s * 1.5 : s / 2), c[1]);
      crate.rotation.y = this.rng.next() * 0.8;
      this.staticGroup.add(crate);
      if (!stacked) this._addCollider(c[0], c[1], s * 0.75, this.groundH(c[0], c[1]) + s, s * 0.7);
    }

    // військовий ящик зі зброєю (відкривається)
    const wg = new THREE.Group();
    const boxM = toonMat(0x5e7050);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 1.0), boxM);
    crate.position.y = 0.4;
    crate.castShadow = true;
    const lid = new THREE.Group();
    lid.position.set(0, 0.8, 0.5);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.18, 1.05), toonMat(0x4d5e40));
    lidMesh.position.set(0, 0.09, -0.5);
    lid.add(lidMesh);
    const star = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 5), toonMat(0xffd23f));
    star.rotation.x = Math.PI / 2;
    star.position.set(0, 0.19, -0.5);
    lid.add(star);
    wg.add(crate, lid);
    const cx = x - 2, cz = z - 7.5;
    wg.position.set(cx, this.groundH(cx, cz), cz);
    this.scene.add(wg);
    this.weaponCrate = { group: wg, lid, open: 0, opening: false, x: cx, z: cz };
    this._addCollider(cx, cz, 1.1, this.groundH(cx, cz) + 0.9, 0.9);
  }

  openCrate() {
    this.weaponCrate.opening = true;
  }

  // ---------- арена боса ----------
  _buildArena() {
    const { x, z, r } = LAYOUT.arena;
    const gy0 = this.groundH(x, z);
    const stoneM = toonMat(0x8d949c);
    const stoneM2 = toonMat(0x7a828c);
    const N = 26;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      // ворота з півдня (кут ~ PI/2 в світі: +z бік)
      const gapCenter = Math.PI / 2;
      let dAng = Math.abs(ang - gapCenter);
      if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
      if (dAng < 0.28) continue;
      const bx = x + Math.cos(ang) * r;
      const bz = z + Math.sin(ang) * r;
      const by = this.groundH(bx, bz);
      const h = this.rng.range(1.6, 3.2);
      const w = this.rng.range(1.8, 2.6);
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.4), this.rng.chance(0.5) ? stoneM : stoneM2);
      block.position.set(bx, by + h / 2 - 0.2, bz);
      block.rotation.y = -ang + this.rng.range(-0.15, 0.15);
      this.staticGroup.add(block);
      this._addCollider(bx, bz, Math.max(w, 1.4) * 0.62, by + h, Math.max(w, 1.4) * 0.55);
    }
    // стовпи з прапорами біля воріт
    const poleM = toonMat(0x5e4a36);
    for (const side of [-1, 1]) {
      const px = x + side * 5.5, pz = z + r;
      const py = this.groundH(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), poleM);
      pole.position.set(px, py + 2.5, pz);
      this.staticGroup.add(pole);
      const flagGeo = new THREE.PlaneGeometry(1.6, 0.9, 6, 2);
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshToonMaterial({
        color: 0x8d3bbd, gradientMap: toonMat(0).gradientMap, side: THREE.DoubleSide,
      }));
      flag.position.set(px + 0.85, py + 4.4, pz);
      this.scene.add(flag);
      this.animatedFlags.push(flag);
      this._addCollider(px, pz, 0.25, py + 4.5, 0.15);
    }
    // черепи-декор (кумедні)
    for (let i = 0; i < 4; i++) {
      const sx = x + this.rng.range(-6, 6), sz = z + r - this.rng.range(2, 6);
      const sy = this.groundH(sx, sz);
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), toonMat(0xf2efe4));
      skull.position.set(sx, sy + 0.22, sz);
      skull.scale.set(1, 0.85, 1.05);
      const eyeM = toonMat(0x2a3138);
      for (const es of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), eyeM);
        eye.position.set(sx + es * 0.12, sy + 0.28, sz - 0.26);
        this.staticGroup.add(eye);
      }
      this.staticGroup.add(skull);
    }
    this._makeSign(x + 10, z + r + 6, 'НЕБЕЗПЕКА: БОС!', 0);
  }

  // ---------- хмари ----------
  _buildClouds() {
    this.clouds = [];
    const cloudM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonMat(0).gradientMap, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 11; i++) {
      const g = new THREE.Group();
      const n = this.rng.int(3, 5);
      for (let k = 0; k < n; k++) {
        const s = this.rng.range(4, 9);
        const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cloudM);
        puff.position.set(this.rng.range(-10, 10), this.rng.range(-1.5, 1.5), this.rng.range(-4, 4));
        puff.scale.y = 0.55;
        g.add(puff);
      }
      g.position.set(this.rng.range(-350, 350), this.rng.range(65, 110), this.rng.range(-350, 350));
      this.scene.add(g);
      this.clouds.push({ g, speed: this.rng.range(1.2, 2.8) });
    }
  }

  // ---------- снігопад ----------
  _buildSnowfall() {
    const N = 380;
    const geo = new THREE.SphereGeometry(0.05, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    this.snowMesh = new THREE.InstancedMesh(geo, mat, N);
    this.snowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.snowMesh.frustumCulled = false;
    this.scene.add(this.snowMesh);
    this.snowFlakes = [];
    for (let i = 0; i < N; i++) {
      this.snowFlakes.push({
        x: this.rng.range(-35, 35), y: this.rng.range(0, 30), z: this.rng.range(-35, 35),
        spd: this.rng.range(1.6, 3.4), drift: this.rng.range(0.5, 1.6), ph: this.rng.range(0, 6.28),
      });
    }
    this._snowM4 = new THREE.Matrix4();
    this._snowQ = new THREE.Quaternion();
    this._snowS = new THREE.Vector3(1, 1, 1);
    this._snowV = new THREE.Vector3();
  }

  _updateSnowfall(dt, px, pz) {
    if (!this.snowMesh) return;
    for (let i = 0; i < this.snowFlakes.length; i++) {
      const f = this.snowFlakes[i];
      f.y -= f.spd * dt;
      f.x += Math.sin(this.time * f.drift + f.ph) * dt * 0.8;
      if (f.y < -2) {
        f.y = 26 + this.rng.range(0, 6);
        f.x = this.rng.range(-35, 35);
        f.z = this.rng.range(-35, 35);
      }
      this._snowM4.compose(
        this._snowV.set(px + f.x, this.groundH(px + f.x, pz + f.z) + f.y, pz + f.z),
        this._snowQ, this._snowS
      );
      this.snowMesh.setMatrixAt(i, this._snowM4);
    }
    this.snowMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- просторова сітка колайдерів ----------
  _buildGrid() {
    this.grid.clear();
    const CELL = 16;
    for (const c of this.colliders) {
      const cx0 = Math.floor((c.x - c.r) / CELL), cx1 = Math.floor((c.x + c.r) / CELL);
      const cz0 = Math.floor((c.z - c.r) / CELL), cz1 = Math.floor((c.z + c.r) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = GKEY(cx, cz);
          if (!this.grid.has(key)) this.grid.set(key, []);
          this.grid.get(key).push(c);
        }
      }
    }
  }

  // Розв'язання колізій: повертає скориговану позицію {x, z}
  collide(x, z, r) {
    const CELL = 16;
    for (let iter = 0; iter < 2; iter++) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          const list = this.grid.get(GKEY(cx + gx, cz + gz));
          if (!list) continue;
          for (const c of list) {
            const dx = x - c.x, dz = z - c.z;
            const minD = c.r + r;
            const d2 = dx * dx + dz * dz;
            if (d2 < minD * minD) {
              if (d2 > 1e-12) {
                const d = Math.sqrt(d2);
                const push = (minD - d) / d;
                x += dx * push;
                z += dz * push;
              } else {
                x += minD;
              }
            }
          }
        }
      }
    }
    // межа світу
    const dC = Math.hypot(x, z);
    if (dC > LAYOUT.BOUND) {
      x *= LAYOUT.BOUND / dC;
      z *= LAYOUT.BOUND / dC;
    }
    return { x, z };
  }

  // Дистанція блокування пострілу (стіни/стовбури/терен). Infinity якщо вільно.
  shotBlockDist(origin, dir, maxT) {
    let best = Infinity;
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    for (const oc of this.occluders) {
      const dx = oc.x - origin.x, dz = oc.z - origin.z;
      const approx = Math.hypot(dx, dz);
      if (approx - oc.r > Math.min(maxT, best)) continue;
      p0.set(oc.x, -2, oc.z);
      p1.set(oc.x, oc.h, oc.z);
      const res = closestRaySeg(origin, dir, p0, p1);
      if (res.dist < oc.r && res.t > 0.1 && res.t < Math.min(maxT, best)) best = res.t;
    }
    // терен — крокуємо променем
    const step = 4;
    const lim = Math.min(maxT, best, 250);
    for (let t = step; t < lim; t += step) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      if (y < this.groundH(x, z) - 0.1) {
        if (t < best) best = t;
        break;
      }
    }
    return best;
  }

  update(dt, playerPos) {
    this.time += dt;
    // хмари
    for (const c of this.clouds) {
      c.g.position.x += c.speed * dt;
      if (c.g.position.x > 380) c.g.position.x = -380;
    }
    // прапори
    for (let i = 0; i < this.animatedFlags.length; i++) {
      const f = this.animatedFlags[i];
      const pos = f.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const px = pos.getX(v);
        pos.setZ(v, Math.sin(this.time * 4 + px * 2.5 + i) * 0.12 * (px + 0.8));
      }
      pos.needsUpdate = true;
    }
    // вогник вежі блимає поки зламана
    if (!this.towerFixed && this.towerLight) {
      this.towerLight.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(this.time * 3)) * 0.8;
    }
    // двері хліва
    if (this.barnOpening) {
      let done = true;
      for (const d of this.barnDoors) {
        if (d.open < 1) {
          d.open = Math.min(1, d.open + dt * 1.2);
          d.pivot.rotation.y = -d.side * d.open * 1.9;
          done = false;
        }
      }
      if (done) this.barnOpening = false;
    }
    // кришка ящика
    const wc = this.weaponCrate;
    if (wc && wc.opening && wc.open < 1) {
      wc.open = Math.min(1, wc.open + dt * 1.4);
      wc.lid.rotation.x = wc.open * 1.8;
    }
    if (playerPos) {
      this.followSun(playerPos.x, playerPos.z);
      if (this.snowMesh) this._updateSnowfall(dt, playerPos.x, playerPos.z);
    }
  }
}
