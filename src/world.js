// Відкритий світ: терен, село, ліс, дороги, особливі будівлі, колайдери
import * as THREE from 'three';
import { t } from './i18n.js';
import { toonMat, bakeGroupMeshes } from './characters.js';
import { makeFBM, smoothstep, lerp, clamp, distToSeg, closestRaySeg, RNG } from './utils.js';
import { BIOMES } from './countries.js';

const GKEY = (cx, cz) => (cx + 512) * 4096 + (cz + 512);

export class World {
  constructor(scene, seed = 1377, biome = null, map = null, quality = null) {
    this.scene = scene;
    this.biome = biome || BIOMES.summer;
    this.map = map;
    this.quality = quality || { shadow: 2048, snow: 380, lights: true };
    // layout сумісний зі старим глобальним LAYOUT: BOUND, SPAWN + сайти місій
    this.layout = Object.assign(
      { BOUND: map.bound, SPAWN: map.spawn },
      map.sites
    );
    this.roads = map.roads;
    this.roadSegs = [];
    for (const line of this.roads) {
      for (let i = 0; i < line.length - 1; i++) {
        this.roadSegs.push([line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]]);
      }
    }
    this.rng = new RNG(seed);
    this.fbmLow = makeFBM(seed, 2);
    this.fbmHi = makeFBM(seed + 7, 2);
    // 🏔️ великий рельєф країни (гори/долини/дюни). Чиста функція (x,z)->Δвисота,
    // тече у groundH ПЕРЕД згладжуванням доріг і майданчиків, тож дороги
    // драпіруються по схилах, а майданчики місій лишаються пласкими на схилі.
    this._terrainMod = typeof map.terrain === 'function' ? map.terrain : null;
    // 🌊 ріки: дно вирізається до АБСОЛЮТНОЇ позначки level-depth, вода — стрічка на level.
    // Сегменти рахуємо один раз; формат map.rivers = [{pts:[[x,z]..], width, level, depth}]
    this.rivers = (map.rivers || []).map((r) => ({
      ...r,
      segs: r.pts.slice(0, -1).map((p, i) => [p[0], p[1], r.pts[i + 1][0], r.pts[i + 1][1]]),
    }));
    this.colliders = []; // {x, z, r} — для руху
    this._collideOut = { x: 0, z: 0 }; // scratch для collide() — без алокацій щокадру
    this._sbP0 = new THREE.Vector3(); // scratch для shotBlockDist (без алокацій щокадру)
    this._sbP1 = new THREE.Vector3();
    this._raySegOut = { dist: 0, t: 0, u: 0 }; // scratch для closestRaySeg у shotBlockDist
    this.occluders = []; // {x, z, r, h} — вертикальні капсули для куль
    this.grid = new Map();
    this.time = 0;
    this.animatedFlags = [];
    this.lootSpots = [];       // лут всередині будинків (спавниться main-ом після Effects)
    this.surpriseSpots = [];   // зомбі-сюрпризи в будинках
    this.floors = [];          // підлоги будинків — підвищують рівень "землі" всередині
    this.iceZone = map.ice || null;
    this.jumpPads = [];
    this.spinners = [];        // обертові елементи (лопаті млина тощо)
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
    if (!(map.landmarks || []).includes('castleRuin')) this._buildArena();
    this._buildLandmarks();
    this._buildFun();
    this._buildClouds();
    if (this.biome.snowfall) this._buildSnowfall();
    if (this.biome.dustfall) this._buildSnowfall(true);
    if (this.biome.leaffall) this._buildLeaffall();
    this._buildGrid();
    bakeGroupMeshes(this.staticGroup, { castShadow: true, receiveShadow: true });
  }

  // ---------- ландмарки карти ----------
  _buildLandmarks() {
    const lm = this.map.landmarks || [];
    const P = this.map.landmarkParams || {};
    const build = {
      sunflowerField: () => this._lmSunflowers(P.sunflowerField),
      pond: () => this._lmPond(P.pond),
      windmill: () => this._lmWindmill(P.windmill),
      townSquare: () => this._lmTownSquare(P.townSquare),
      frozenLake: () => this._lmFrozenLake(P.frozenLake),
      castleRuin: () => this._lmCastleRuin(P.castleRuin),
      railDepot: () => this._lmRailDepot(P.railDepot),
      garlandTrees: () => this._lmGarlands(P.garlandTrees),
      cityGate: () => this._lmCityGate(P.cityGate),
      autobahn: () => this._lmAutobahn(P.autobahn),
      beerGarden: () => this._lmBeerGarden(P.beerGarden),
      eiffelTower: () => this._lmEiffelTower(P.eiffelTower),
      cafe: () => this._lmCafe(P.cafe),
      lavenderField: () => this._lmLavender(P.lavenderField),
      vineyard: () => this._lmVineyard(P.vineyard),
      balloon: () => this._lmBalloon(P.balloon),
      chimneySmoke: () => this._lmChimneySmoke(),
      grandBazaar: () => this._lmGrandBazaar(P.grandBazaar),
      galataTower: () => this._lmGalataTower(P.galataTower),
      teaGarden: () => this._lmTeaGarden(P.teaGarden),
      cappadociaBalloons: () => this._lmCappadociaBalloons(P.cappadociaBalloons),
      pyramids: () => this._lmPyramids(P.pyramids),
      sphinx: () => this._lmSphinx(P.sphinx),
      oasis: () => this._lmOasis(P.oasis),
      bullring: () => this._lmBullring(P.bullring),
      plazaFountain: () => this._lmPlazaFountain(P.plazaFountain),
      oliveGrove: () => this._lmOliveGrove(P.oliveGrove),
      cathedral: () => this._lmCathedral(P.cathedral),
      colosseum: () => this._lmColosseum(P.colosseum),
      leaningTower: () => this._lmLeaningTower(P.leaningTower),
      romanRuins: () => this._lmRomanRuins(P.romanRuins),
      torii: () => this._lmTorii(P.torii),
      pagoda: () => this._lmPagoda(P.pagoda),
      birds: () => this._lmBirds(),
    };
    for (const id of lm) if (build[id]) build[id]();
    if (lm.includes('obelisks')) for (const o of P.obelisks || []) this._lmObelisk(o);
  }

  // ⛩️ Ворота торії на вʼїзді в село: дві червоні колони + дві поперечні балки.
  _lmTorii({ x, z }) {
    const gy = this.groundH(x, z);
    const redM = toonMat(0xd6402c);
    const blackM = toonMat(0x2a211e);
    const H = 6.0, SPAN = 5.0;
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, H, 10), redM);
      pillar.position.set(x + sx * SPAN, gy + H / 2, z);
      pillar.castShadow = true;
      this.staticGroup.add(pillar);
      this._addCollider(x + sx * SPAN, z, 0.5, gy + H, 0.4);
    }
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(SPAN * 2 + 3.0, 0.55, 0.9), blackM); // верхня балка
    kasagi.position.set(x, gy + H + 0.2, z);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(SPAN * 2 + 0.6, 0.4, 0.6), redM);        // нижня балка
    nuki.position.set(x, gy + H - 1.1, z);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 0.16), toonMat(0xf0e4d0));
    plaque.position.set(x, gy + H - 0.5, z + 0.35);
    this.staticGroup.add(kasagi, nuki, plaque);
    this._makeSign(x + 3.5, z + 2, t('ВОРОТА ТОРІЇ'), 0);
  }

  // 🏯 Свята пагода: пʼятиярусна вежа з червоними дахами (суцільний орієнтир).
  _lmPagoda({ x, z }) {
    const gy = this.groundH(x, z);
    const wallM = toonMat(0xefe7da);
    const roofM = toonMat(0xc0392b);
    const TIERS = 5;
    let w = 9, y = gy;
    for (let i = 0; i < TIERS; i++) {
      const h = 2.0;
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), wallM);
      body.position.set(x, y + h / 2, z);
      body.castShadow = i % 2 === 0;
      body.receiveShadow = true;
      const roof = new THREE.Mesh(this._prismGeo(w + 2.4, 1.1, w + 2.4), roofM);
      roof.position.set(x, y + h + 0.55, z);
      roof.castShadow = true;
      this.staticGroup.add(body, roof);
      y += h + 1.0;
      w *= 0.82;
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 2.2, 8), toonMat(0xffd23f, 0xcc8800, 0.3));
    spire.position.set(x, y + 1.0, z);
    this.staticGroup.add(spire);
    this._addCollider(x, z, 5.0, gy + 13, 4.6); // суцільна вежа — крізь неї не пройти
    this._makeSign(x + 7, z + 7, t('СВЯТА ПАГОДА'), 0.5);
  }

  _drapeXZGeometry(geo, cx, cz, offset = 0) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.groundH(cx + pos.getX(i), cz + pos.getZ(i)) + offset);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  // 🏛 міська брама: дві вежі, арка-місток нагорі (можна вилізти батутом!)
  _lmCityGate({ x, z }) {
    const gy = this.groundH(x, z);
    const stoneM = toonMat(0xd8cdbb);
    const trimM = toonMat(0xb0a080);
    const roofM = toonMat(0x6b4a3a);
    for (const side of [-1, 1]) {
      const tx = x + side * 6;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 4), stoneM);
      tower.position.set(tx, gy + 4.5, z);
      tower.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 2.6, 4), roofM);
      cap.position.set(tx, gy + 10.3, z);
      cap.rotation.y = Math.PI / 4;
      cap.castShadow = true;
      this.staticGroup.add(tower, cap);
      // вікна-бійниці (гравець під'їжджає з півдня, +z — прикрашаємо обидва боки)
      for (const wy of [3, 6]) {
        for (const wz of [-2.05, 2.05]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.2), toonMat(0x46506b));
          win.position.set(tx, gy + wy, z + wz);
          this.staticGroup.add(win);
        }
      }
      this._addCollider(tx, z, 2.6, gy + 9, 2.4);
    }
    // арка-місток зверху (на неї веде батут)
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 3.4), trimM);
    bridge.position.set(x, gy + 8, z);
    bridge.castShadow = true;
    this.staticGroup.add(bridge);
    // зубці на містку (з обох боків)
    for (let i = -3; i <= 3; i++) {
      for (const mz of [-1.6, 1.6]) {
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.3), trimM);
        merlon.position.set(x + i * 1.3, gy + 8.9, z + mz);
        this.staticGroup.add(merlon);
      }
    }
    // герб над аркою (з боку в'їзду)
    const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 6), toonMat(0xffd23f, 0xcc8800, 0.2));
    crest.rotation.x = Math.PI / 2;
    crest.position.set(x, gy + 6.8, z + 1.8);
    this.staticGroup.add(crest);
    // вертикальні прапори-банери на вежах (чорний-червоний-золотий)
    for (const side of [-1, 1]) {
      const cols = [0x2a2a2a, 0xd84f4f, 0xffd23f];
      for (let i = 0; i < 3; i++) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.08), toonMat(cols[i]));
        strip.position.set(x + side * 6, gy + 6.4 - i * 1.1, z + 2.1);
        this.staticGroup.add(strip);
      }
    }
    // верх брами — поверхня, на якій можна стояти
    this.floors.push({ x, z, ry: 0, w: 9, d: 3.4, top: gy + 8.6 });
    this._makeSign(x + 8, z + 4, this.biome.signText, 0.3);
  }

  // 🚗 автобан: покинуті машини (на дахи можна стрибати!)
  _lmAutobahn({ z, from, to }) {
    const carCols = [0xd84f4f, 0x4a8ad4, 0xe2c044, 0x57b83e, 0x8d6bb8, 0xd8d8d8];
    const rng = this.rng;
    // білий пунктир по центру
    for (let x = from + 6; x < to; x += 9) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 0.3), toonMat(0xf5f5f5));
      dash.position.set(x, this.groundH(x, z) + 0.12, z);
      this.staticGroup.add(dash);
    }
    // машини врозкид по смугах
    let i = 0;
    for (let x = from + 14; x < to - 10; x += rng.range(13, 22)) {
      const off = rng.range(-2.2, 2.2);
      const ry = (off > 0 ? 0 : Math.PI) + rng.range(-0.5, 0.5);
      this._makeCar(x, z + off, ry, carCols[i++ % carCols.length]);
    }
    // один шкільний автобус — великий, з даху чудовий огляд
    this._makeBus(from + (to - from) * 0.55, z - 1, 0.25);
  }

  _makeCar(x, z, ry, color) {
    const gy = this.groundH(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.85, 1.7), toonMat(color));
    body.position.y = 0.75;
    body.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1.55), toonMat(color));
    cabin.position.set(-0.1, 1.45, 0);
    cabin.castShadow = true;
    const glassM = toonMat(0x9fd8ff, 0x4fb8ff, 0.2);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 1.4), glassM);
    windshield.position.set(0.9, 1.45, 0);
    windshield.rotation.z = -0.35;
    const rear = windshield.clone();
    rear.position.x = -1.1;
    rear.rotation.z = 0.35;
    g.add(body, cabin, windshield, rear);
    const wheelM = toonMat(0x2a3138);
    for (const wx of [-1.2, 1.2]) {
      for (const wz of [-0.9, 0.9]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 10), wheelM);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.38, wz);
        g.add(wheel);
      }
    }
    g.position.set(x, gy, z);
    g.rotation.y = ry;
    this.staticGroup.add(g);
    this._addCollider(x + Math.cos(ry) * 0.9, z - Math.sin(ry) * 0.9, 1.0, gy + 1.7, 0.9);
    this._addCollider(x - Math.cos(ry) * 0.9, z + Math.sin(ry) * 0.9, 1.0, gy + 1.7, 0.9);
    // дах — можна стояти
    this.floors.push({ x, z, ry, w: 3.6, d: 1.7, top: gy + 1.18 });
    this.floors.push({ x, z, ry, w: 1.9, d: 1.55, top: gy + 1.8 });
  }

  _makeBus(x, z, ry) {
    const gy = this.groundH(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8.5, 2.4, 2.3), toonMat(0xe2a83d));
    body.position.y = 1.65;
    body.castShadow = true;
    g.add(body);
    const glassM = toonMat(0x9fd8ff, 0x4fb8ff, 0.2);
    for (let i = -3; i <= 3; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), glassM);
      win.position.set(i * 1.15, 2.2, -1.18);
      const win2 = win.clone();
      win2.position.z = 1.18;
      g.add(win, win2);
    }
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(8.55, 0.3, 2.35), toonMat(0x37404f));
    stripe.position.y = 1.1;
    g.add(stripe);
    const wheelM = toonMat(0x2a3138);
    for (const wx of [-3, 3]) {
      for (const wz of [-1.1, 1.1]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10), wheelM);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.45, wz);
        g.add(wheel);
      }
    }
    g.position.set(x, gy, z);
    g.rotation.y = ry;
    this.staticGroup.add(g);
    const cosR = Math.cos(ry), sinR = Math.sin(ry);
    for (const lx of [-3, 0, 3]) {
      this._addCollider(x + lx * cosR, z - lx * sinR, 1.45, gy + 2.9, 1.3);
    }
    this.floors.push({ x, z, ry, w: 8.5, d: 2.3, top: gy + 2.9 });
    // драбинка ззаду (підказка, що можна нагору) і лут на даху
    this.lootSpots.push({ x, z, y: gy + 2.95, type: 'coins' });
  }

  // 🍺 пивний садок: столи, парасолі, ятка з брецлями
  _lmBeerGarden({ x, z, r }) {
    const woodM = toonMat(0x8a5a32);
    const umbCols = [0xd84f4f, 0xe2c044, 0x4a8ad4];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const tx = x + Math.cos(a) * (r - 5);
      const tz = z + Math.sin(a) * (r - 5);
      const ty = this.groundH(tx, tz);
      // довгий стіл з лавами
      const table = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 1.1), woodM);
      table.position.set(tx, ty + 0.95, tz);
      table.rotation.y = a;
      table.castShadow = true;
      this.staticGroup.add(table);
      for (const legX of [-1.4, 1.4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.95, 1.0), woodM);
        leg.position.set(tx + Math.cos(a) * legX, ty + 0.48, tz + Math.sin(a) * legX);
        leg.rotation.y = a;
        this.staticGroup.add(leg);
      }
      for (const side of [-1, 1]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.4), woodM);
        bench.position.set(tx - Math.sin(a) * side * 0.95, ty + 0.5, tz + Math.cos(a) * side * 0.95);
        bench.rotation.y = a;
        this.staticGroup.add(bench);
      }
      // парасоля
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), toonMat(0xe8e2d0));
      pole.position.set(tx, ty + 2.0, tz);
      const umb = new THREE.Mesh(new THREE.ConeGeometry(2.2, 0.9, 8), toonMat(umbCols[i]));
      umb.position.set(tx, ty + 3.4, tz);
      umb.castShadow = true;
      this.staticGroup.add(pole, umb);
      this._addCollider(tx, tz, 1.6, ty + 1.05, 1.4);
      // кухоль на столі (декор)
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), toonMat(0xe2c044));
      mug.position.set(tx + 0.5, ty + 1.18, tz);
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), toonMat(0xfff8ef));
      foam.position.set(tx + 0.5, ty + 1.36, tz);
      foam.scale.y = 0.5;
      this.staticGroup.add(mug, foam);
      // 🥨 брецлі на столах — смаколики!
      this.lootSpots.push({ x: tx - 0.6, z: tz, y: ty + 1.0, type: 'food' });
    }
    // ятка з брецлями
    const sx = x, sz = z + r - 3;
    const sy = this.groundH(sx, sz);
    const stall = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.2), woodM);
    counter.position.y = 0.5;
    counter.castShadow = true;
    const canopy = new THREE.Mesh(this._prismGeo(3.0, 0.7, 1.8), toonMat(0xd84f4f));
    canopy.position.y = 2.3;
    const stripeC = new THREE.Mesh(this._prismGeo(3.02, 0.4, 1.0), toonMat(0xf5efe0));
    stripeC.position.y = 2.34;
    for (const [px, pz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), woodM);
      post.position.set(px, 1.15, pz);
      stall.add(post);
    }
    stall.add(counter, canopy, stripeC);
    stall.position.set(sx, sy, sz);
    this.staticGroup.add(stall);
    this._addCollider(sx, sz, 1.5, sy + 1.1, 1.3);
    this.lootSpots.push({ x: sx + 0.8, z: sz - 0.9, y: sy + 1.05, type: 'food' });
    this.lootSpots.push({ x: sx - 0.8, z: sz - 0.9, y: sy + 1.05, type: 'food' });
  }

  // 🗼 Ейфелева вежа: батутами на самий верх, нагорі — скарб!
  _lmEiffelTower({ x, z }) {
    const gy = this.groundH(x, z);
    const ironM = toonMat(0x6e5a4a);
    const ironM2 = toonMat(0x7d6850);
    // 4 вигнуті ноги (сегментами)
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      let px = sx * 5.5, pz = sz * 5.5;
      for (let seg = 0; seg < 4; seg++) {
        const t0 = seg / 4, t1 = (seg + 1) / 4;
        const r0 = 5.5 * (1 - t0 * 0.82), r1 = 5.5 * (1 - t1 * 0.82);
        const y0 = t0 * 10, y1 = t1 * 10;
        const mx = (sx * r0 + sx * r1) / 2, mz = (sz * r0 + sz * r1) / 2;
        const len = Math.hypot(r0 - r1, y1 - y0) + 0.4;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, len, 0.55), ironM);
        leg.position.set(x + mx, gy + (y0 + y1) / 2, z + mz);
        const tilt = Math.atan2(r0 - r1, y1 - y0);
        leg.rotation.z = sx * tilt * 0.7;
        leg.rotation.x = -sz * tilt * 0.7;
        leg.castShadow = true;
        this.staticGroup.add(leg);
        px = sx * r1; pz = sz * r1;
      }
      this._addCollider(x + sx * 4.6, z + sz * 4.6, 0.9, gy + 7, 0.6);
    }
    // поперечні балки-хрестовини між ногами (низ)
    for (const side of [-1, 1]) {
      const beamA = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 0.35), ironM2);
      beamA.position.set(x, gy + 4.6, z + side * 4.4);
      const beamB = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 9), ironM2);
      beamB.position.set(x + side * 4.4, gy + 4.6, z);
      this.staticGroup.add(beamA, beamB);
    }
    // арки внизу
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 6, 14, Math.PI), ironM2);
      arch.position.set(x, gy + 1.2, z + side * 4.5);
      this.staticGroup.add(arch);
      const arch2 = new THREE.Mesh(arch.geometry, arch.material); // переюз гео/мат арки — без осиротілої TorusGeometry
      arch2.position.set(x + side * 4.5, gy + 1.2, z);
      arch2.rotation.y = Math.PI / 2;
      this.staticGroup.add(arch2);
    }
    // 1-й ярус (платформа, можна стояти)
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.7, 9.5), ironM);
    p1.position.set(x, gy + 10.3, z);
    p1.castShadow = true;
    this.staticGroup.add(p1);
    this.floors.push({ x, z, ry: 0, w: 9.5, d: 9.5, top: gy + 10.65 });
    // перила 1-го ярусу
    for (const [ox, oz, w, d] of [[0, -4.6, 9.4, 0.15], [0, 4.6, 9.4, 0.15], [-4.6, 0, 0.15, 9.4], [4.6, 0, 0.15, 9.4]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), ironM2);
      rail.position.set(x + ox, gy + 11.1, z + oz);
      this.staticGroup.add(rail);
    }
    // середня секція
    const mid = new THREE.Mesh(new THREE.BoxGeometry(3.6, 8.5, 3.6), ironM);
    mid.position.set(x, gy + 15, z);
    mid.castShadow = true;
    this.staticGroup.add(mid);
    // 2-й ярус
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.6, 5.5), ironM);
    p2.position.set(x, gy + 19.3, z);
    p2.castShadow = true;
    this.staticGroup.add(p2);
    this.floors.push({ x, z, ry: 0, w: 5.5, d: 5.5, top: gy + 19.6 });
    for (const [ox, oz, w, d] of [[0, -2.6, 5.4, 0.15], [0, 2.6, 5.4, 0.15], [-2.6, 0, 0.15, 5.4], [2.6, 0, 0.15, 5.4]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), ironM2);
      rail.position.set(x + ox, gy + 20.1, z + oz);
      this.staticGroup.add(rail);
    }
    // шпиль і вогник
    const spike = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6.5, 4), ironM);
    spike.position.set(x, gy + 23, z);
    spike.castShadow = true;
    this.staticGroup.add(spike);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6),
      new THREE.MeshToonMaterial({ color: 0xffd23f, gradientMap: toonMat(0).gradientMap, emissive: 0xffaa00, emissiveIntensity: 1.2 }));
    beacon.position.set(x, gy + 26.5, z);
    this.scene.add(beacon);
    // батут на 1-му ярусі веде на 2-й
    this.jumpPads.push({ x: x + 2.8, z: z + 2.8, y: gy + 10.65, power: 20, cd: 0 });
    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.18, 18),
      new THREE.MeshToonMaterial({ color: 0x6fc3ff, emissive: 0x2288cc, emissiveIntensity: 0.5, gradientMap: toonMat(0).gradientMap })
    );
    padMesh.position.set(x + 2.8, gy + 10.75, z + 2.8);
    this.scene.add(padMesh);
    // 💎 скарб на 2-му ярусі
    this.lootSpots.push({ x, z, y: gy + 19.65, type: 'coins' });
    this.lootSpots.push({ x: x + 1, z, y: gy + 19.65, type: 'grenade' });
    this.lootSpots.push({ x: x - 1, z, y: gy + 19.65, type: 'rage' });
    this._makeSign(x + 7, z + 7, t('ВЕЖА: СКАРБ НАГОРІ!'), 0.5);
  }

  // ☕ кафе з круасанами
  _lmCafe({ x, z }) {
    const gy = this.groundH(x, z);
    const g = new THREE.Group();
    const woodM = toonMat(0x8a5a32);
    // вітрина-фасад
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3, 0.4), toonMat(0xf5e2c8));
    wall.position.y = 1.5;
    wall.castShadow = true;
    const win = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 0.2), toonMat(0x9fd8ff, 0x4fb8ff, 0.3));
    win.position.set(-0.4, 1.5, -0.18);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.2), toonMat(0x6b4226));
    door.position.set(2.0, 1.05, -0.18);
    g.add(wall, win, door);
    // смугастий навіс
    const awning = new THREE.Mesh(this._prismGeo(6, 0.8, 2.4), toonMat(0xd84f4f));
    awning.position.set(0, 2.6, -1.0);
    const awnStripe = new THREE.Mesh(this._prismGeo(6.04, 0.5, 1.4), toonMat(0xf5efe0));
    awnStripe.position.set(0, 2.64, -1.0);
    g.add(awning, awnStripe);
    g.position.set(x, gy, z);
    this.staticGroup.add(g);
    this._addCollider(x, z, 2.8, gy + 3, 2.6);
    // столики з круасанами перед кафе
    for (const side of [-1, 1]) {
      const tx = x + side * 2.2, tz = z - 3.4;
      const ty = this.groundH(tx, tz);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 10), toonMat(0xf5efe0));
      top.position.set(tx, ty + 0.95, tz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.95, 8), toonMat(0x37404f));
      leg.position.set(tx, ty + 0.5, tz);
      this.staticGroup.add(top, leg);
      this._addCollider(tx, tz, 0.75, ty + 1, 0.6);
      this.lootSpots.push({ x: tx, z: tz, y: ty + 1.0, type: 'food' });
    }
    this._makeSign(x - 4, z - 2, t('КАФЕ «У ЗОМБІ»'), -0.4);
  }

  // 💜 лавандове поле
  _lmLavender({ x, z, w, d }) {
    const pts = [];
    for (let gx = -w / 2; gx < w / 2; gx += 1.4) {
      for (let gz = -d / 2; gz < d / 2; gz += 1.4) {
        const px = x + gx + this.rng.range(-0.4, 0.4);
        const pz = z + gz + this.rng.range(-0.4, 0.4);
        if (this.roadDist(px, pz) < 4) continue;
        pts.push([px, pz]);
      }
    }
    const stemGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.7, 5);
    const stems = new THREE.InstancedMesh(stemGeo, toonMat(0x5e7050), pts.length);
    const headGeo = new THREE.CapsuleGeometry(0.09, 0.3, 3, 6);
    const headMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonMat(0).gradientMap });
    const heads = new THREE.InstancedMesh(headGeo, headMat, pts.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    const purples = [0x8d6bb8, 0x9d7bd0, 0x7a5aa8, 0xa888e0];
    pts.forEach(([px, pz], i) => {
      const gy = this.groundH(px, pz);
      m4.compose(v.set(px, gy + 0.35, pz), q.identity(), s.set(1, 1, 1));
      stems.setMatrixAt(i, m4);
      m4.compose(v.set(px, gy + 0.85, pz), q.identity(), s.set(1, 1, 1));
      heads.setMatrixAt(i, m4);
      heads.setColorAt(i, col.setHex(this.rng.pick(purples)));
    });
    heads.castShadow = true;
    this.scene.add(stems, heads);
  }

  // 🍇 виноградник: рівні ряди лоз
  _lmVineyard({ x, z }) {
    const postM = toonMat(0x6e4f2f);
    const vineM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonMat(0).gradientMap });
    const rows = 4, len = 24;
    const blobs = [];
    for (let r = 0; r < rows; r++) {
      const rz = z - 9 + r * 6;
      for (let lx = -len / 2; lx <= len / 2; lx += 6) {
        const px = x + lx;
        const py = this.groundH(px, rz);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.12), postM);
        post.position.set(px, py + 0.85, rz);
        this.staticGroup.add(post);
      }
      // дріт
      const wy0 = this.groundH(x - len / 2, rz);
      const wy1 = this.groundH(x + len / 2, rz);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.04), postM);
      wire.position.set(x, (wy0 + wy1) / 2 + 1.45, rz);
      wire.rotation.z = Math.atan2(wy1 - wy0, len);
      this.staticGroup.add(wire);
      for (let lx = -len / 2 + 1.5; lx < len / 2; lx += 2.2) {
        blobs.push([x + lx, rz]);
      }
    }
    const blobGeo = new THREE.IcosahedronGeometry(0.55, 1);
    const vines = new THREE.InstancedMesh(blobGeo, vineM, blobs.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const vineCols = [0x57a83e, 0x4a9636, 0x68b84a];
    blobs.forEach(([px, pz], i) => {
      const gy = this.groundH(px, pz);
      q.setFromEuler(new THREE.Euler(0, this.rng.next() * 6.28, 0));
      m4.compose(v.set(px, gy + 1.1, pz), q, s.set(1, 0.85, 0.55));
      vines.setMatrixAt(i, m4);
      vines.setColorAt(i, col.setHex(this.rng.pick(vineCols)));
    });
    vines.castShadow = true;
    this.scene.add(vines);
    // грона винограду (декор) — фіолетові кульки під лозами
    for (let i = 0; i < 10; i++) {
      const [px, pz] = blobs[Math.floor(this.rng.next() * blobs.length)];
      const grape = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), toonMat(0x6b4a9e));
      grape.position.set(px + this.rng.range(-0.3, 0.3), this.groundH(px, pz) + 0.75, pz + this.rng.range(-0.2, 0.2));
      grape.scale.y = 1.4;
      this.staticGroup.add(grape);
    }
  }

  // 🎈 повітряна куля пливе колами над картою
  _lmBalloon({ x, z }) {
    const g = new THREE.Group();
    const envM = new THREE.MeshToonMaterial({ color: 0xd84f4f, gradientMap: toonMat(0).gradientMap });
    const env = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 12), envM);
    env.scale.y = 1.15;
    // смуги
    for (let i = 0; i < 4; i++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.18, 6, 18), toonMat(i % 2 ? 0xffd23f : 0xf5efe0));
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = -0.8 + i * 0.9;
      stripe.scale.setScalar(1 - Math.abs(i - 1.5) * 0.12);
      g.add(stripe);
    }
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), toonMat(0x8a5a32));
    basket.position.y = -4.6;
    for (const [rx, rz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), toonMat(0x5e4530));
      rope.position.set(rx, -3.8, rz);
      g.add(rope);
    }
    g.add(env, basket);
    g.position.set(x, 40, z);
    this.scene.add(g);
    this.balloon = { g, cx: x, cz: z, ph: 0 };
  }

  // 🌻 соняшникове поле
  _lmSunflowers({ x, z, w, d }) {
    const pts = [];
    for (let gx = -w / 2; gx < w / 2; gx += 1.7) {
      for (let gz = -d / 2; gz < d / 2; gz += 1.7) {
        const px = x + gx + this.rng.range(-0.5, 0.5);
        const pz = z + gz + this.rng.range(-0.5, 0.5);
        if (this.roadDist(px, pz) < 4) continue;
        pts.push([px, pz, this.rng.range(1.2, 1.7)]);
      }
    }
    const stemGeo = new THREE.CylinderGeometry(0.045, 0.06, 1, 5);
    const stems = new THREE.InstancedMesh(stemGeo, toonMat(0x3f8f2f), pts.length);
    const petalGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10);
    const petalM = new THREE.MeshToonMaterial({ color: 0xffd23f, gradientMap: toonMat(0).gradientMap });
    const petals = new THREE.InstancedMesh(petalGeo, petalM, pts.length);
    const coreGeo = new THREE.SphereGeometry(0.14, 8, 6);
    const cores = new THREE.InstancedMesh(coreGeo, toonMat(0x6b4226), pts.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.4, 0, 0));
    pts.forEach(([px, pz, hgt], i) => {
      const gy = this.groundH(px, pz);
      m4.compose(v.set(px, gy + hgt / 2, pz), q.identity(), s.set(1, hgt, 1));
      stems.setMatrixAt(i, m4);
      m4.compose(v.set(px, gy + hgt, pz - 0.12), tilt, s.set(1, 1, 1));
      petals.setMatrixAt(i, m4);
      m4.compose(v.set(px, gy + hgt + 0.04, pz - 0.2), q.identity(), s.set(1, 1, 1));
      cores.setMatrixAt(i, m4);
    });
    petals.castShadow = true;
    this.scene.add(stems, petals, cores);
  }

  // ставок з хвилями, піщаним берегом, пірсом і очеретом
  _lmPond({ x, z, r }) {
    // сітка з внутрішніми вершинами — інакше хвилі неможливі
    const geo = new THREE.PlaneGeometry(r * 2, r * 2, 12, 12);
    geo.rotateX(-Math.PI / 2);
    const pp = geo.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const vx = pp.getX(i), vz = pp.getZ(i);
      const d = Math.hypot(vx, vz);
      if (d > r) {
        pp.setX(i, (vx / d) * r);
        pp.setZ(i, (vz / d) * r);
      }
    }
    const mat = new THREE.MeshToonMaterial({
      color: 0x3f9fd4, transparent: true, opacity: 0.82,
      gradientMap: toonMat(0).gradientMap,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4,
    });
    this._drapeXZGeometry(geo, x, z, 0.34);
    const water = new THREE.Mesh(geo, mat);
    water.position.set(x, 0, z);
    this.scene.add(water);
    this.pond = { mesh: water, base: pp.array.slice(), t: 0 };
    // піщаний берег
    const sand = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r + 1.6, 26), toonMat(0xe8d9a0));
    sand.rotation.x = -Math.PI / 2;
    this._drapeXZGeometry(sand.geometry, x, z, 0.08);
    sand.position.set(x, 0, z);
    this.staticGroup.add(sand);
    // пірс
    const pierM = toonMat(0x8a5a32);
    for (let i = 0; i < 4; i++) {
      const px = x - r + 1.2 + i * 0.6;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.55), pierM);
      plank.position.set(px, this.groundH(px, z + 2) + 0.36, z + 2);
      this.staticGroup.add(plank);
    }
    // очерет
    for (let i = 0; i < 9; i++) {
      const a = this.rng.range(0, 6.28);
      const rr = r + this.rng.range(-0.5, 1.5);
      const rx = x + Math.cos(a) * rr, rz = z + Math.sin(a) * rr;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.5, 5), toonMat(0x4f8f3f));
      reed.position.set(rx, this.groundH(rx, rz) + 0.75, rz);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 5), toonMat(0x6b4226));
      top.position.set(rx, this.groundH(rx, rz) + 1.55, rz);
      this.staticGroup.add(reed, top);
    }
    // лілії
    for (let i = 0; i < 4; i++) {
      const lx = x + this.rng.range(-r * 0.6, r * 0.6);
      const lz = z + this.rng.range(-r * 0.6, r * 0.6);
      const lily = new THREE.Mesh(new THREE.CircleGeometry(0.45, 8), toonMat(0x57b83e));
      lily.rotation.x = -Math.PI / 2;
      lily.position.set(lx, this.groundH(lx, lz) + 0.4, lz);
      this.staticGroup.add(lily); // статична непрозора декорація — у батч, не повз нього
    }
  }

  // вітряк з обертовими лопатями
  _lmWindmill({ x, z }) {
    const gy = this.groundH(x, z);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.4, 7.5, 10), toonMat(0xe8dcc8));
    base.position.y = 3.75;
    base.castShadow = true;
    const roofC = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.8, 10), toonMat(0xc0563b));
    roofC.position.y = 8.3;
    roofC.castShadow = true;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.15), toonMat(0x6b4226));
    door.position.set(0, 1.05, -2.2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.12), toonMat(0x9fd8ff, 0x4fb8ff, 0.3));
    win.position.set(0, 5, -2.0);
    g.add(base, roofC, door, win);
    g.position.set(x, gy, z);
    this.staticGroup.add(g);
    // лопаті — окремо, обертаються (широкі вітрила з планками — видно здалеку)
    const blades = new THREE.Group();
    const bladeM = toonMat(0xf5efe0);
    const frameM = toonMat(0x6e4a26);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      const spar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 4.6, 0.16), frameM);
      spar.position.y = 2.3;
      const sail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.6, 0.07), bladeM);
      sail.position.set(0.75, 2.6, 0);
      arm.add(spar, sail);
      for (let p = 0; p < 3; p++) {
        const slat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.1), frameM);
        slat.position.set(0.75, 1.4 + p * 1.2, 0);
        arm.add(slat);
      }
      arm.rotation.z = (i / 4) * Math.PI * 2;
      blades.add(arm);
    }
    blades.position.set(x, gy + 7.2, z - 2.35);
    this.scene.add(blades);
    this.spinners.push({ group: blades, speed: 0.5, axis: 'z' });
    this._addCollider(x, z, 2.6, gy + 7, 2.2);
    // підніжжя: пшеничне поле, тюки, стежка-паркан
    const wheatM = toonMat(0xe2c044);
    for (let i = 0; i < 26; i++) {
      const a = this.rng.range(0, 6.28);
      const rr = this.rng.range(5, 13);
      const wx = x + Math.cos(a) * rr, wz = z + Math.sin(a) * rr;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.35, this.rng.range(0.7, 1.1), 5), wheatM);
      tuft.position.set(wx, this.groundH(wx, wz) + 0.4, wz);
      this.staticGroup.add(tuft);
    }
    for (let i = 0; i < 3; i++) {
      const a = this.rng.range(0, 6.28);
      const hx = x + Math.cos(a) * this.rng.range(6, 10);
      const hz = z + Math.sin(a) * this.rng.range(6, 10);
      const hy = this.groundH(hx, hz);
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 12), wheatM);
      bale.rotation.z = Math.PI / 2;
      bale.rotation.y = this.rng.next() * 3;
      bale.position.set(hx, hy + 0.8, hz);
      this.staticGroup.add(bale);
      this._addCollider(hx, hz, 1.0, hy + 1.4, 0.8);
    }
  }

  // дим з димарів
  _lmChimneySmoke() {
    const N = Math.min(this.map.houses.length, 7) * 4;
    const geo = new THREE.SphereGeometry(0.3, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xdfe5ea, transparent: true, opacity: 0.32 });
    this.smokeMesh = new THREE.InstancedMesh(geo, mat, N);
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smokeMesh.frustumCulled = false;
    this.scene.add(this.smokeMesh);
    this.smokePuffs = [];
    const houses = this.map.houses.slice(0, 7);
    for (let i = 0; i < N; i++) {
      const h = houses[i % houses.length];
      this.smokePuffs.push({
        x: h.x + 1.4, z: h.z + 0.8,
        y0: this.groundH(h.x, h.z) + 4.1,
        t: this.rng.range(0, 4), dur: this.rng.range(3.5, 5),
        drift: this.rng.range(0.2, 0.6),
      });
    }
    this._smokeM4 = new THREE.Matrix4();
    this._smokeQ = new THREE.Quaternion();
    this._smokeV = new THREE.Vector3();
    this._smokeS = new THREE.Vector3();
  }

  // птахи в небі
  _lmBirds() {
    this.birds = [];
    const birdM = toonMat(0x37404f);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.32), birdM);
        wing.position.x = side * 0.55;
        wing.name = side < 0 ? 'wL' : 'wR';
        g.add(wing);
      }
      this.scene.add(g);
      this.birds.push({
        g, cx: this.rng.range(-100, 100), cz: this.rng.range(-100, 100),
        r: this.rng.range(25, 60), h: this.rng.range(38, 60),
        speed: this.rng.range(0.15, 0.3), ph: this.rng.range(0, 6.28),
      });
    }
  }

  // 🐂 Арена-корида (bullring): кругла піщана арена з кам'яною стіною й трибунами.
  // Усередині б'ється бос-МАТАДОР. На трибуни можна вилізти (видно всю карту!).
  _lmBullring({ x, z }) {
    const gy = this.groundH(x, z);
    const Rin = 18;          // радіус піщаного майданчика
    const Rwall = 19.4;      // внутрішня кам'яна стіна (барʼєр)
    const Rstand = 25;       // зовнішнє кільце трибун
    const sandM = toonMat(0xe0c074);   // золотистий пісок арени
    const wallM = toonMat(0xdfae6a);   // теракотово-вохриста стіна
    const stoneM = toonMat(0xcaa878);
    // піщаний майданчик (кільце-диск, драпується по плато)
    const sand = new THREE.Mesh(new THREE.CircleGeometry(Rin, 40), sandM);
    sand.rotation.x = -Math.PI / 2;
    this._drapeXZGeometry(sand.geometry, x, z, 0.06);
    sand.position.set(x, 0, z);
    this.staticGroup.add(sand);
    // червоно-жовте коло-розмітка в центрі (як справжня корида)
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(8, 8.6, 32), toonMat(0xd84f4f));
    ring1.rotation.x = -Math.PI / 2;
    this._drapeXZGeometry(ring1.geometry, x, z, 0.1);
    ring1.position.set(x, 0, z);
    this.staticGroup.add(ring1);
    // кам'яний барʼєр навколо арени (сегментами, з проходом на півдні для входу)
    const segs = 40;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      // прохід для гравця з боку в'їзду (+z)
      if (a > Math.PI * 0.42 && a < Math.PI * 0.58) continue;
      const px = x + Math.cos(a) * Rwall;
      const pz = z + Math.sin(a) * Rwall;
      const wy = this.groundH(px, pz);
      const post = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.7), wallM);
      post.position.set(px, wy + 1.1, pz);
      post.rotation.y = -a;
      post.castShadow = true;
      this.staticGroup.add(post);
      this._addCollider(px, pz, 1.4, wy + 2.2, 1.2);
      // червона поручня по верху барʼєра
      const cap = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.85), toonMat(0xc0392b));
      cap.position.set(px, wy + 2.35, pz);
      cap.rotation.y = -a;
      this.staticGroup.add(cap);
    }
    // трибуни: 3 яруси кам'яних сходинок-кілець навколо (можна стояти)
    for (let tier = 0; tier < 3; tier++) {
      const rr = Rwall + 1.4 + tier * 2.0;
      const th = 1.4 + tier * 1.3;
      const benchN = 36;
      for (let i = 0; i < benchN; i++) {
        const a = (i / benchN) * Math.PI * 2;
        if (a > Math.PI * 0.42 && a < Math.PI * 0.58) continue; // прохід-тунель
        const px = x + Math.cos(a) * rr;
        const pz = z + Math.sin(a) * rr;
        const py = this.groundH(px, pz);
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2.6, th, 2.0), tier % 2 ? stoneM : wallM);
        bench.position.set(px, py + th / 2, pz);
        bench.rotation.y = -a;
        this.staticGroup.add(bench);
      }
      // верхній ярус — поверхня, на якій стоять (кільце «підлог»)
      if (tier === 2) {
        const fN = 18;
        for (let i = 0; i < fN; i++) {
          const a = (i / fN) * Math.PI * 2;
          if (a > Math.PI * 0.4 && a < Math.PI * 0.6) continue;
          const px = x + Math.cos(a) * rr;
          const pz = z + Math.sin(a) * rr;
          this.floors.push({ x: px, z: pz, ry: -a, w: 2.6, d: 2.0, top: this.groundH(px, pz) + th });
        }
      }
    }
    // святкові прапорці навколо арени (червоно-жовті — кольори Іспанії)
    const flagCols = [0xd84f4f, 0xffd23f];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * (Rstand + 1.5);
      const pz = z + Math.sin(a) * (Rstand + 1.5);
      const py = this.groundH(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.0, 6), stoneM);
      pole.position.set(px, py + 2.0, pz);
      this.staticGroup.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), toonMat(flagCols[i % 2]));
      flag.position.set(px + Math.cos(a) * 0.5, py + 3.7, pz + Math.sin(a) * 0.5);
      flag.rotation.y = -a;
      this.staticGroup.add(flag);
    }
    // лут на трибунах — нагорода за вилазку
    this.lootSpots.push({ x: x, z: z + Rwall + 5.0, y: gy + 4.0, type: 'coins' });
    this.lootSpots.push({ x: x - 4, z: z - Rwall - 5.0, y: gy + 4.0, type: 'grenade' });
    this._makeSign(x + 10, z + Rstand, t('🐂 АРЕНА КОРИДИ'), -0.5);
  }

  // ⛲ Площа з фонтаном: восьмикутна кам'яна чаша з водою у центрі села
  _lmPlazaFountain({ x, z }) {
    const gy = this.groundH(x, z);
    const stoneM = toonMat(0xcabfa4);
    const trimM = toonMat(0xb0a080);
    // нижня чаша
    const basinO = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.9, 8), stoneM);
    basinO.position.set(x, gy + 0.45, z);
    basinO.castShadow = true;
    this.staticGroup.add(basinO);
    this._addCollider(x, z, 2.9, gy + 1.0, 0.8);
    // вода в чаші
    const waterM = new THREE.MeshToonMaterial({
      color: 0x49b8e8, transparent: true, opacity: 0.8,
      gradientMap: toonMat(0).gradientMap, polygonOffset: true, polygonOffsetFactor: -3,
    });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 8), waterM);
    water.position.set(x, gy + 0.9, z);
    this.scene.add(water);
    // центральна колона
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 2.0, 8), trimM);
    col.position.set(x, gy + 1.9, z);
    col.castShadow = true;
    this.staticGroup.add(col);
    // верхня менша чаша
    const basinT = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 0.4, 8), stoneM);
    basinT.position.set(x, gy + 2.9, z);
    this.staticGroup.add(basinT);
    // струмінь-маківка
    const jet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), waterM);
    jet.position.set(x, gy + 3.3, z);
    this.scene.add(jet);
    this.fountain = { jet, base: gy + 3.3, t: 0 };
    // декоративні горщики з помаранчевими деревцями навколо площі
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      const px = x + Math.cos(a) * 5.5;
      const pz = z + Math.sin(a) * 5.5;
      const py = this.groundH(px, pz);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.6, 8), toonMat(0xc0563b));
      pot.position.set(px, py + 0.3, pz);
      const foliage = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), toonMat(0x57a83e));
      foliage.position.set(px, py + 1.3, pz);
      foliage.castShadow = true;
      this.staticGroup.add(pot, foliage);
      // помаранчі
      for (let o = 0; o < 3; o++) {
        const orange = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), toonMat(0xff8c1a));
        orange.position.set(px + this.rng.range(-0.4, 0.4), py + 1.3 + this.rng.range(-0.3, 0.3), pz + this.rng.range(-0.4, 0.4));
        this.staticGroup.add(orange);
      }
      this._addCollider(px, pz, 0.5, py + 0.6, 0);
    }
  }

  // 🫒 Оливковий гай: рівні ряди оливкових дерев зі срібно-зеленим листям
  _lmOliveGrove({ x, z, w, d }) {
    const trunkM = toonMat(0x6e5a44);
    const leafM = toonMat(0x8aa86a);   // приглушена срібляста зелень оливи
    const olivePts = [];
    for (let gx = -w / 2; gx <= w / 2; gx += 6) {
      for (let gz = -d / 2; gz <= d / 2; gz += 6) {
        const px = x + gx + this.rng.range(-0.6, 0.6);
        const pz = z + gz + this.rng.range(-0.6, 0.6);
        if (this.roadDist(px, pz) < 4) continue;
        const py = this.groundH(px, pz);
        // кривий стовбур
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.4, 6), trunkM);
        trunk.position.set(px, py + 0.7, pz);
        trunk.rotation.z = this.rng.range(-0.12, 0.12);
        trunk.castShadow = true;
        this.staticGroup.add(trunk);
        // округла крона з кількох куль
        for (let c = 0; c < 3; c++) {
          const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(this.rng.range(0.7, 1.0), 0), leafM);
          crown.position.set(px + this.rng.range(-0.5, 0.5), py + 1.6 + this.rng.range(-0.1, 0.4), pz + this.rng.range(-0.5, 0.5));
          crown.castShadow = true;
          this.staticGroup.add(crown);
        }
        this._addCollider(px, pz, 0.5, py + 1.6, 0.3);
        olivePts.push([px, pz]);
      }
    }
    // купка оливок у кошику — смаколик
    if (olivePts.length) {
      const [bx, bz] = olivePts[Math.floor(olivePts.length / 2)];
      this.lootSpots.push({ x: bx + 1.4, z: bz, y: this.groundH(bx, bz) + 0.05, type: 'food' });
    }
  }

  // ⛪ Собор: біла церква з куполом, дзвіницею і батутом на вершину
  _lmCathedral({ x, z }) {
    const gy = this.groundH(x, z);
    const wallM = toonMat(0xf2ead8);
    const trimM = toonMat(0xe2c044);
    const roofM = toonMat(0xc0563b);
    // головна нава
    const nave = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 10), wallM);
    nave.position.set(x, gy + 3.5, z);
    nave.castShadow = true;
    this.staticGroup.add(nave);
    this._addCollider(x, z, 4.2, gy + 7, 3.6);
    // двосхилий дах нави
    const naveRoof = new THREE.Mesh(this._prismGeo(7.4, 2.0, 10.2), roofM);
    naveRoof.position.set(x, gy + 8.0, z);
    naveRoof.castShadow = true;
    this.staticGroup.add(naveRoof);
    // великий купол
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), toonMat(0xd9b34a, 0x8a6a2a, 0.15));
    dome.position.set(x, gy + 9.0, z + 2.5);
    dome.castShadow = true;
    this.staticGroup.add(dome);
    // дзвіниця-вежа збоку
    const tx = x - 4.6;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.2, 12, 3.2), wallM);
    tower.position.set(tx, gy + 6, z - 3);
    tower.castShadow = true;
    this.staticGroup.add(tower);
    this._addCollider(tx, z - 3, 2.0, gy + 12, 1.8);
    // дзвонова камера (арки)
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.0, 0.3), toonMat(0x46506b));
      arch.position.set(tx + side * 1.1, gy + 10, z - 3 - 1.65);
      this.staticGroup.add(arch);
    }
    // дзвін
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.7, 8), trimM);
    bell.position.set(tx, gy + 10, z - 3);
    this.staticGroup.add(bell);
    // дах-піраміда дзвіниці + хрест
    const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 4), roofM);
    towerRoof.position.set(tx, gy + 13.3, z - 3);
    towerRoof.rotation.y = Math.PI / 4;
    towerRoof.castShadow = true;
    this.staticGroup.add(towerRoof);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), trimM);
    crossV.position.set(tx, gy + 15.2, z - 3);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.12), trimM);
    crossH.position.set(tx, gy + 15.3, z - 3);
    this.staticGroup.add(crossV, crossH);
    // велике кругле вітражне вікно (роза)
    const rose = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16), toonMat(0x6fc3ff, 0x2288cc, 0.4));
    rose.position.set(x, gy + 4.5, z - 5.05);
    this.staticGroup.add(rose);
    // двері
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.0, 0.2), toonMat(0x6b4226));
    door.position.set(x, gy + 1.5, z - 5.05);
    this.staticGroup.add(door);
    // дах нави — пласка ділянка, куди підкине батут (лут нагорі)
    this.floors.push({ x, z, ry: 0, w: 6.8, d: 9.8, top: gy + 7.0 });
    this.lootSpots.push({ x, z, y: gy + 7.1, type: 'coins' });
    this._makeSign(x + 6, z - 4, t('СОБОР СВЯТОЇ КОРИДИ'), 0.4);
  }

  // 🏛 КОЛІЗЕЙ: велика овальна арена з двома ярусами арок навколо. Усередині —
  // ЧИСТИЙ піщаний інтер'єр (бос ЦЕЗАР спавниться на голій землі, НЕ в геометрії).
  // На верхні яруси можна вилізти батутом — звідти видно всю карту і чекає лут.
  _lmColosseum({ x, z }) {
    const gy = this.groundH(x, z);
    const Rin = 17;          // радіус піщаної арени (чистий core під ярусами)
    const Rwall = 18.6;      // внутрішня кам'яна стінка-подіум
    const stoneM = toonMat(0xe2cba0);   // травертин (теплий римський камінь)
    const stoneM2 = toonMat(0xd4b886);
    const sandM = toonMat(0xdcc488);    // золотистий пісок арени
    // піщаний майданчик (овал — масштабуємо коло по X)
    const sand = new THREE.Mesh(new THREE.CircleGeometry(Rin, 44), sandM);
    sand.rotation.x = -Math.PI / 2;
    sand.scale.x = 1.18; // овальна форма Колізею
    this._drapeXZGeometry(sand.geometry, x, z, 0.06);
    sand.position.set(x, 0, z);
    this.staticGroup.add(sand);
    // розмітка-овал у центрі (де бились гладіатори)
    const ring1 = new THREE.Mesh(new THREE.RingGeometry(7, 7.6, 36), toonMat(0xc0563b));
    ring1.rotation.x = -Math.PI / 2;
    ring1.scale.x = 1.18;
    this._drapeXZGeometry(ring1.geometry, x, z, 0.1);
    ring1.position.set(x, 0, z);
    this.staticGroup.add(ring1);
    // подіум-стінка навколо арени (сегментами; прохід на півдні для входу)
    const segs = 44;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      if (a > Math.PI * 0.42 && a < Math.PI * 0.58) continue; // прохід для гравця (+z)
      // овальна позиція подіуму (по X розтягнуто на 1.18 — форма Колізею)
      const ox = x + Math.cos(a) * Rwall * 1.18;
      const oz = z + Math.sin(a) * Rwall;
      const wy = this.groundH(ox, oz);
      const post = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.0, 0.7), stoneM);
      post.position.set(ox, wy + 1.0, oz);
      post.rotation.y = -a;
      post.castShadow = true;
      this.staticGroup.add(post);
      this._addCollider(ox, oz, 1.3, wy + 2.0, 1.1);
    }
    // 🏛 ДВА ЯРУСИ АРОК навколо — головна впізнавана риса Колізею
    for (let tier = 0; tier < 2; tier++) {
      const rr = Rwall + 2.6 + tier * 4.2;     // зовнішнє кільце ярусу
      const ty = 3.6 + tier * 4.0;             // висота низу ярусу
      const tierH = 4.0;                       // висота ярусу
      const archN = 26;
      for (let i = 0; i < archN; i++) {
        const a = (i / archN) * Math.PI * 2;
        if (a > Math.PI * 0.44 && a < Math.PI * 0.56) continue; // вхідний тунель
        const px = x + Math.cos(a) * rr * 1.18;
        const pz = z + Math.sin(a) * rr;
        const py = this.groundH(px, pz);
        const mat = tier % 2 ? stoneM2 : stoneM;
        // пілон (стовп між арками)
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.1, tierH, 1.1), mat);
        pier.position.set(px, py + ty + tierH / 2, pz);
        pier.rotation.y = -a;
        pier.castShadow = true;
        this.staticGroup.add(pier);
        // напівкругла арка зверху (тор-півколо)
        const arch = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.28, 6, 12, Math.PI), mat);
        arch.position.set(px, py + ty + tierH - 0.2, pz);
        arch.rotation.y = -a + Math.PI / 2;
        this.staticGroup.add(arch);
        if (tier === 0) this._addCollider(px, pz, 0.9, py + ty + tierH, 0.7);
      }
      // карниз-кільце над ярусом (де можна стояти на верхньому ярусі)
      const ledgeN = 22;
      for (let i = 0; i < ledgeN; i++) {
        const a = (i / ledgeN) * Math.PI * 2;
        const px = x + Math.cos(a) * rr * 1.18;
        const pz = z + Math.sin(a) * rr;
        const py = this.groundH(px, pz);
        const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.4), stoneM2);
        ledge.position.set(px, py + ty + tierH + 0.25, pz);
        ledge.rotation.y = -a;
        this.staticGroup.add(ledge);
        if (tier === 1 && !(a > Math.PI * 0.42 && a < Math.PI * 0.58)) {
          this.floors.push({ x: px, z: pz, ry: -a, w: 2.0, d: 1.4, top: py + ty + tierH + 0.5 });
        }
      }
    }
    // часткова руїна-пролом: один кусок верхнього ярусу «обвалено» (нижчі пілони)
    // — додаємо впізнаваний силует напівзруйнованого Колізею з боку (+x)
    for (let k = 0; k < 3; k++) {
      const a = -0.25 + k * 0.22;
      const px = x + Math.cos(a) * (Rwall + 6.8) * 1.18;
      const pz = z + Math.sin(a) * (Rwall + 6.8);
      const py = this.groundH(px, pz);
      const stub = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.0 - k * 0.6, 1.1), stoneM);
      stub.position.set(px, py + (3.0 - k * 0.6) / 2, pz);
      stub.castShadow = true;
      this.staticGroup.add(stub);
    }
    // лаврові прапори навколо (золото-багрянець Риму)
    const flagCols = [0xffd23f, 0x8c2f3e];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const px = x + Math.cos(a) * (Rwall + 11.5) * 1.18;
      const pz = z + Math.sin(a) * (Rwall + 11.5);
      const py = this.groundH(px, pz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.0, 6), stoneM2);
      pole.position.set(px, py + 2.0, pz);
      this.staticGroup.add(pole);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), toonMat(flagCols[i % 2]));
      flag.position.set(px + Math.cos(a) * 0.5, py + 3.7, pz + Math.sin(a) * 0.5);
      flag.rotation.y = -a;
      this.staticGroup.add(flag);
    }
    // 💎 лут на верхньому ярусі — нагорода за вилазку
    this.lootSpots.push({ x: x, z: z + (Rwall + 6.8) * 1.0, y: gy + 11.0, type: 'coins' });
    this.lootSpots.push({ x: x - 6, z: z - (Rwall + 6.8), y: gy + 11.0, type: 'grenade' });
    this._makeSign(x + 12, z + 30, t('🏛 КОЛІЗЕЙ'), -0.5);
  }

  // 🏯 ПІЗАНСЬКА (похила) ВЕЖА: круглий білий циліндр з ярусами колонад, нахилений!
  _lmLeaningTower({ x, z }) {
    const gy = this.groundH(x, z);
    const marbleM = toonMat(0xf2ead8);    // білий мармур
    const marbleM2 = toonMat(0xe6dcc4);
    const tilt = 0.16;                     // характерний нахил вежі
    const dirX = Math.sin(tilt), dirZ = 0;
    const g = new THREE.Group();
    const tiers = 7;
    const tierH = 2.1;
    const R = 2.0;
    // основа (товстіший перший ярус)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.15, R + 0.3, tierH, 18), marbleM);
    base.position.y = tierH / 2;
    base.castShadow = true;
    g.add(base);
    // колонадні яруси з мініатюрними арками-колонами
    for (let tr = 1; tr < tiers; tr++) {
      const y = tr * tierH;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.18, R - 0.18, tierH * 0.55, 18), tr % 2 ? marbleM2 : marbleM);
      drum.position.y = y + tierH * 0.28;
      drum.castShadow = true;
      g.add(drum);
      // кільце колон навколо ярусу
      const colN = 12;
      for (let i = 0; i < colN; i++) {
        const a = (i / colN) * Math.PI * 2;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, tierH * 0.85, 6), marbleM);
        col.position.set(Math.cos(a) * (R - 0.02), y - tierH * 0.05, Math.sin(a) * (R - 0.02));
        g.add(col);
      }
    }
    // дзвонова камера на вершині
    const belfry = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.5, R - 0.4, tierH * 0.9, 16), marbleM2);
    belfry.position.y = tiers * tierH + tierH * 0.2;
    belfry.castShadow = true;
    g.add(belfry);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, R - 0.4, 0.5, 16), marbleM);
    cap.position.y = tiers * tierH + tierH * 0.75;
    g.add(cap);
    // 📐 нахиляємо всю вежу — впізнавана Піза! (нахил навколо основи)
    g.rotation.z = -tilt;
    g.position.set(x, gy, z);
    this.staticGroup.add(g);
    // колайдер біля основи (нахилений верх не заважає руху)
    this._addCollider(x, z, R + 0.6, gy + 5, R);
    this._addCollider(x + dirX * 6, z + dirZ * 6, R, gy + 11, R * 0.7);
    this._makeSign(x + 5, z + 4, t('🏯 ПОХИЛА ВЕЖА'), 0.4);
  }

  // 🏛 РИМСЬКІ РУЇНИ: ряд античних колон (деякі зламані) + тріумфальна арка.
  // На верх арки веде батут — нагорода нагорі.
  _lmRomanRuins({ x, z }) {
    const stoneM = toonMat(0xe2d6b8);     // вивітрений травертин
    const stoneM2 = toonMat(0xd0c2a0);
    // ряд із 5 колон (висота різна — частина «зламана»)
    const heights = [4.5, 2.4, 4.5, 3.2, 4.5];
    for (let i = 0; i < 5; i++) {
      const cx = x - 8 + i * 4;
      const cz = z - 4;
      const cy = this.groundH(cx, cz);
      const h = heights[i];
      // канельований стовбур (рифлений циліндр — кілька тонких ребер)
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, h, 12), stoneM);
      shaft.position.set(cx, cy + h / 2, cz);
      shaft.castShadow = true;
      this.staticGroup.add(shaft);
      // база
      const cbase = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.4, 12), stoneM2);
      cbase.position.set(cx, cy + 0.2, cz);
      this.staticGroup.add(cbase);
      this._addCollider(cx, cz, 0.6, cy + h, 0.5);
      // капітель (тільки на цілих колонах)
      if (h > 3.5) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), stoneM2);
        cap.position.set(cx, cy + h + 0.2, cz);
        this.staticGroup.add(cap);
      } else {
        // зламаний верх — нерівний уламок
        const broke = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), stoneM);
        broke.position.set(cx, cy + h + 0.2, cz);
        broke.rotation.set(0.4, 0.7, 0.3);
        this.staticGroup.add(broke);
      }
    }
    // антаблемент-балка лежить на двох цілих колонах (перекриття)
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.6, 1.0), stoneM2);
    lintel.position.set(x - 4, this.groundH(x - 8, z - 4) + 4.9, z - 4);
    lintel.castShadow = true;
    this.staticGroup.add(lintel);
    // 🏛 тріумфальна арка (як Арка Тита) — дві опори + напівкругла арка + аттик
    const ax = x + 5, az = z + 2;
    const ay = this.groundH(ax, az);
    const archH = 6.5;
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.6, archH, 1.6), stoneM);
      pier.position.set(ax + side * 2.4, ay + archH / 2, az);
      pier.castShadow = true;
      this.staticGroup.add(pier);
      this._addCollider(ax + side * 2.4, az, 1.0, ay + archH, 0.9);
    }
    // напівкругла арка-проліт
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.55, 8, 16, Math.PI), stoneM2);
    arch.position.set(ax, ay + archH, az);
    arch.rotation.z = 0;
    this.staticGroup.add(arch);
    // аттик зверху (на нього стрибати батутом)
    const attic = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.4, 1.8), stoneM);
    attic.position.set(ax, ay + archH + 1.4, az);
    attic.castShadow = true;
    this.staticGroup.add(attic);
    this.floors.push({ x: ax, z: az, ry: 0, w: 6.8, d: 1.8, top: ay + archH + 2.1 });
    // напис SPQR (золоті блоки) на аттику
    for (let i = 0; i < 4; i++) {
      const letter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), toonMat(0xffd23f, 0xcc8800, 0.3));
      letter.position.set(ax - 1.5 + i * 1.0, ay + archH + 1.4, az - 0.95);
      this.staticGroup.add(letter);
    }
    // 💎 лут на аттику арки
    this.lootSpots.push({ x: ax, z: az, y: ay + archH + 2.2, type: 'coins' });
    this._makeSign(x - 9, z + 1, t('🏛 РИМСЬКІ РУЇНИ'), 0.5);
  }

  // 🛍 Великий базар: критий ринок з арками, килимами і лампами (лут усередині!)
  _lmGrandBazaar({ x, z }) {
    const gy = this.groundH(x, z);
    const W = 26, D = 13, H = 5.2;
    const wallM = toonMat(0xe2cba0);
    const trimM = toonMat(0xb4543a);
    // довгі стіни з арковими проходами (по 3 арки з кожного боку)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const px = x - W / 2 + (i + 0.5) * (W / 4);
        const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2, H, 1.1), wallM);
        pier.position.set(px, gy + H / 2, z + side * D / 2);
        this.staticGroup.add(pier);
        this._addCollider(px, z + side * D / 2, 1.3, gy + H, 0.8);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 1.2, 1.3), trimM);
      lintel.position.set(x, gy + H - 0.4, z + side * D / 2);
      this.staticGroup.add(lintel);
    }
    // торці
    for (const side of [-1, 1]) {
      const endW = new THREE.Mesh(new THREE.BoxGeometry(1.1, H, D - 2.6), wallM);
      endW.position.set(x + side * W / 2, gy + H / 2, z);
      this.staticGroup.add(endW);
      this._addCollider(x + side * W / 2, z - D / 4, 1.4, gy + H, 0.9);
      this._addCollider(x + side * W / 2, z + D / 4, 1.4, gy + H, 0.9);
    }
    // дах із трьома куполами
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 0.5, D + 2), trimM);
    roof.position.set(x, gy + H + 0.25, z);
    this.staticGroup.add(roof);
    this.floors.push({ x, z, ry: 0, w: W + 2, d: D + 2, top: gy + H + 0.5 });
    const domeM = toonMat(0x6e9aa8);
    for (let i = -1; i <= 1; i++) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.0, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeM);
      dome.position.set(x + i * 8.5, gy + H + 0.5, z);
      this.staticGroup.add(dome);
    }
    // прилавки з килимами та лампами всередині
    const rugCols = [0xd84f4f, 0x4a8ad4, 0xffd23f, 0x8d3bbd, 0x4cae54];
    for (let i = 0; i < 4; i++) {
      const sx = x - W / 2 + 4 + i * 6;
      const stall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.0, 1.6), toonMat(0x8a5a32));
      stall.position.set(sx, gy + 0.5, z - 2.2);
      const rug = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.4), toonMat(rugCols[i % rugCols.length]));
      rug.position.set(sx, gy + 1.05, z - 2.2);
      this.staticGroup.add(stall, rug);
      this._addCollider(sx, z - 2.2, 1.2, gy + 1.2, 0);
      // висячий ліхтарик
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), toonMat(0xffc233, 0xff9e2c, 1.0));
      lamp.position.set(sx, gy + H - 1.1, z);
      this.staticGroup.add(lamp);
    }
    // килими на стіні і лут
    for (let i = 0; i < 3; i++) {
      const wallRug = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 0.08), toonMat(rugCols[(i + 2) % rugCols.length]));
      wallRug.position.set(x - 6 + i * 6, gy + 2.6, z + D / 2 - 0.7);
      this.staticGroup.add(wallRug);
    }
    this.lootSpots.push({ x: x - 8, z: z + 2.2, y: gy + 0.05, type: 'coins' });
    this.lootSpots.push({ x: x + 2, z: z + 2.2, y: gy + 0.05, type: 'coins' });
    this.lootSpots.push({ x: x + 9, z: z + 2.2, y: gy + 0.05, type: 'food' });
    this.surpriseSpots.push({ x: x + W / 2 - 4, z });
  }

  // 🗼 вежа Галата: кругла вежа з оглядовим майданчиком (батутом нагору!)
  _lmGalataTower({ x, z }) {
    const gy = this.groundH(x, z);
    const H = 12.5;
    const bodyM = toonMat(0xd9c8a8);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.5, H, 14), bodyM);
    body.position.set(x, gy + H / 2, z);
    body.castShadow = true;
    this.staticGroup.add(body);
    this._addCollider(x, z, 3.6, gy + H, 3.0);
    // вікна-бійниці
    const winM = toonMat(0x37404f);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.2), winM);
      win.position.set(x + Math.cos(a) * 3.25, gy + H * 0.62, z + Math.sin(a) * 3.25);
      win.lookAt(x, gy + H * 0.62, z);
      this.staticGroup.add(win);
    }
    // оглядовий майданчик з огорожею
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.5, 14), toonMat(0xb4543a));
    deck.position.set(x, gy + H + 0.25, z);
    this.staticGroup.add(deck);
    this.floors.push({ x, z, ry: 0, w: 7.6, d: 7.6, top: gy + H + 0.5 });
    const railM = toonMat(0x8a6a4a);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 5), railM);
      post.position.set(x + Math.cos(a) * 4.0, gy + H + 1.0, z + Math.sin(a) * 4.0);
      this.staticGroup.add(post);
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.07, 6, 18), railM);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x, gy + H + 1.5, z);
    this.staticGroup.add(rail);
    // конічний дах-шпиль над майданчиком
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.6, 14), toonMat(0x6e8a9a));
    cone.position.set(x, gy + H + 3.6, z);
    cone.castShadow = true;
    this.staticGroup.add(cone);
    // центральна опора шпиля, щоб дах «тримався»
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.0, 8), railM);
    pole.position.set(x, gy + H + 1.4, z);
    this.staticGroup.add(pole);
  }

  // 🍵 чайний садок: столики, чайники і смаколики
  _lmTeaGarden({ x, z }) {
    const gy = this.groundH(x, z);
    const woodM = toonMat(0x8a5a32);
    const glassM = toonMat(0xd84f4f);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const tx = x + Math.cos(a) * 4.5;
      const tz = z + Math.sin(a) * 4.5;
      const ty = this.groundH(tx, tz);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.12, 10), woodM);
      top.position.set(tx, ty + 0.78, tz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.78, 7), woodM);
      leg.position.set(tx, ty + 0.39, tz);
      this.staticGroup.add(top, leg);
      this._addCollider(tx, tz, 1.0, ty + 0.9, 0);
      // чайничок і тюльпаноподібні склянки
      const pot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), toonMat(0xc9c2b4));
      pot.position.set(tx - 0.25, ty + 0.97, tz);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.14, 7), glassM);
      cup.position.set(tx + 0.25, ty + 0.92, tz + 0.1);
      this.staticGroup.add(pot, cup);
      // табурети
      for (let st = 0; st < 2; st++) {
        const sa = a + (st ? 0.7 : -0.7);
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.45, 8), toonMat(0xb4543a));
        const sx = tx + Math.cos(sa) * 1.5;
        const sz = tz + Math.sin(sa) * 1.5;
        stool.position.set(sx, this.groundH(sx, sz) + 0.22, sz);
        this.staticGroup.add(stool);
      }
    }
    // великий самовар-казан у центрі
    const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 9), toonMat(0xb8a468, 0x8a6a2a, 0.2));
    kettle.position.set(x, gy + 0.8, z);
    kettle.scale.set(1, 1.2, 1);
    this.staticGroup.add(kettle);
    this._addCollider(x, z, 0.9, gy + 1.4, 0);
    // смаколики на столиках
    this.lootSpots.push({ x: x + 4.5, z, y: gy + 0.95, type: 'food' });
    this.lootSpots.push({ x: x - 4.5, z: z + 0.5, y: gy + 0.95, type: 'food' });
  }

  // 🎈 кулі Каппадокії: кілька різнокольорових куль дрейфують у небі
  _lmCappadociaBalloons({ x, z }) {
    this.balloonsExtra = [];
    const palettes = [
      [0xd84f4f, 0xffd23f], [0x4a8ad4, 0xf5efe0], [0x8d3bbd, 0xffd23f], [0x4cae54, 0xf5efe0],
    ];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const [c1, c2] = palettes[i % palettes.length];
      const env = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), new THREE.MeshToonMaterial({ color: c1, gradientMap: toonMat(0).gradientMap }));
      env.scale.y = 1.15;
      for (let k = 0; k < 3; k++) {
        const stripe = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.16, 6, 16), toonMat(c2));
        stripe.rotation.x = Math.PI / 2;
        stripe.position.y = -0.7 + k * 0.9;
        stripe.scale.setScalar(1 - Math.abs(k - 1) * 0.14);
        g.add(stripe);
      }
      const basket = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), toonMat(0x8a5a32));
      basket.position.y = -3.8;
      g.add(env, basket);
      const bx = x + this.rng.range(-26, 26);
      const bz = z + this.rng.range(-26, 26);
      const h = this.rng.range(26, 46);
      g.position.set(bx, h, bz);
      this.scene.add(g);
      this.balloonsExtra.push({ g, cx: bx, cz: bz, h, ph: this.rng.range(0, 6.28), spd: this.rng.range(0.03, 0.07) });
    }
  }

  // 🔺 піраміди: Велика (вилазь уступами до скарбу!) і дві малі
  _lmPyramids({ x, z }) {
    const gy = this.groundH(x, z);
    const stoneA = toonMat(0xddc18c);
    const stoneB = toonMat(0xd0b27a);
    // Велика піраміда: 13 уступів по 1.25м — на кожен можна вистрибнути
    const LAYERS = 13;
    const STEP = 1.25;
    const BASE = 34;
    for (let i = 0; i < LAYERS; i++) {
      const size = BASE * (1 - i / LAYERS);
      const layer = new THREE.Mesh(new THREE.BoxGeometry(size, STEP, size), i % 2 ? stoneA : stoneB);
      layer.position.set(x, gy + STEP / 2 + i * STEP, z);
      layer.castShadow = i % 3 === 0; // не всі шари — тіні дорогі
      layer.receiveShadow = true;
      this.staticGroup.add(layer);
      this.floors.push({ x, z, ry: 0, w: size, d: size, top: gy + (i + 1) * STEP });
    }
    // золота верхівка
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 4), toonMat(0xffd23f, 0xcc8800, 0.35));
    cap.position.set(x, gy + LAYERS * STEP + 0.8, z);
    cap.rotation.y = Math.PI / 4;
    this.staticGroup.add(cap);
    const half = BASE / 2;
    // низький фундамент не дає зайти крізь боки, але вимикається після посадки на перший уступ.
    const firstStepBlockTop = gy + STEP * 0.52;
    this._addCollider(x, z, half - 0.35, firstStepBlockTop, 0);
    // колайдери лише по периметру основи (всередину не зайдеш, зомбі не лізуть)
    for (let t = -half + 1.5; t <= half - 1.5; t += 3) {
      this._addCollider(x + t, z - half, 1.6, firstStepBlockTop, 0);
      this._addCollider(x + t, z + half, 1.6, firstStepBlockTop, 0);
      this._addCollider(x - half, z + t, 1.6, firstStepBlockTop, 0);
      this._addCollider(x + half, z + t, 1.6, firstStepBlockTop, 0);
    }
    // скарб на вершині
    this.lootSpots.push({ x, z, y: gy + LAYERS * STEP + 0.05, type: 'coins' });
    // дві малі піраміди поряд (суцільні, без сходження)
    for (const [ox, oz, sc] of [[-24, 14, 0.45], [20, 20, 0.34]]) {
      const mh = 16 * sc;
      const mini = new THREE.Mesh(new THREE.ConeGeometry(13 * sc, mh, 4), stoneB);
      const mx = x + ox, mz = z + oz;
      const my = this.groundH(mx, mz);
      mini.position.set(mx, my + mh / 2, mz);
      mini.rotation.y = Math.PI / 4;
      mini.castShadow = true;
      this.staticGroup.add(mini);
      this._addCollider(mx, mz, 10 * sc, my + mh, 4 * sc);
    }
  }

  // 🦁 сфінкс: лежачий лев з обличчям фараона
  _lmSphinx({ x, z }) {
    const gy = this.groundH(x, z);
    const sandM = toonMat(0xd9b87e);
    const g = new THREE.Group();
    // тіло
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 3.6), sandM);
    body.position.set(0, 1.5, 0);
    // передні лапи
    for (const side of [-1, 1]) {
      const paw = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 1.1), sandM);
      paw.position.set(-5.4, 0.65, side * 1.15);
      g.add(paw);
    }
    // груди і голова
    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 3.0), sandM);
    chest.position.set(-3.6, 2.4, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.0, 1.7), sandM);
    head.position.set(-3.6, 4.9, 0);
    // немес — смугаста хустка фараона
    const nemesM = toonMat(0x4a8ad4);
    for (const side of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.5), nemesM);
      flap.position.set(-3.6, 4.6, side * 1.05);
      flap.rotation.x = side * 0.12;
      g.add(flap);
    }
    const crownBand = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.5, 1.9), toonMat(0xffd23f, 0xcc8800, 0.25));
    crownBand.position.set(-3.6, 5.9, 0);
    // обличчя: очі
    const eyeM = toonMat(0x37404f);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.35), eyeM);
      eye.position.set(-4.58, 5.1, side * 0.4);
      g.add(eye);
    }
    // задні стегна і хвіст
    const hips = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.0, 3.4), sandM);
    hips.position.set(3.6, 1.8, 0);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.6, 7), sandM);
    tail.rotation.z = 1.25;
    tail.position.set(4.6, 1.2, 1.6);
    g.add(body, chest, head, crownBand, hips, tail);
    g.position.set(x, gy, z);
    g.rotation.y = -0.35;
    this.staticGroup.add(g);
    this._addCollider(x - 3, z, 2.6, gy + 4.5, 1.6);
    this._addCollider(x + 2, z, 2.6, gy + 3, 1.6);
    // спина сфінкса — секретна полиця
    this.floors.push({ x: x + 0.5, z, ry: -0.35, w: 8, d: 3.4, top: gy + 2.8 });
  }

  // 🌴 оаза: вода, пальми навколо, тінь і прохолода
  _lmOasis({ x, z }) {
    this._lmPond({ x, z, r: 9 });
    // пальми по колу
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
      const r = 10.5 + this.rng.range(0, 3);
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      this._buildPalm(px, pz, this.rng.range(0.9, 1.25));
    }
  }

  // 🗿 обеліск із золотою верхівкою
  _lmObelisk({ x, z }) {
    const gy = this.groundH(x, z);
    const stoneM = toonMat(0xc9ab74);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 2.4), stoneM);
    base.position.set(x, gy + 0.5, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 8.5, 4), stoneM);
    shaft.position.set(x, gy + 5.2, z);
    shaft.rotation.y = Math.PI / 4;
    shaft.castShadow = true;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.9, 4), toonMat(0xffd23f, 0xcc8800, 0.3));
    tip.position.set(x, gy + 9.9, z);
    tip.rotation.y = Math.PI / 4;
    this.staticGroup.add(base, shaft, tip);
    this._addCollider(x, z, 1.4, gy + 9, 0.7);
    // ієрогліфи-рисочки
    const glyphM = toonMat(0x8a6a3a);
    for (let i = 0; i < 5; i++) {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.06), glyphM);
      gl.position.set(x, gy + 2.2 + i * 1.2, z - 0.78 + (i % 2) * 0.04);
      this.staticGroup.add(gl);
    }
  }

  // 🌴 одна пальма: вигнутий стовбур + віяло листя (і колайдер)
  _buildPalm(x, z, scale = 1) {
    const gy = this.groundH(x, z);
    const trunkM = toonMat(0x9a7448);
    const lean = this.rng.range(-0.18, 0.18);
    const segs = 4;
    const H = 4.6 * scale;
    let topX = x, topY = gy;
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * scale * (1 - i * 0.12), 0.2 * scale * (1 - i * 0.1), H / segs + 0.15, 7), trunkM);
      topX = x + lean * (i + 0.5) * (H / segs);
      seg.position.set(topX, gy + (i + 0.5) * (H / segs), z);
      seg.rotation.z = -lean * 0.8;
      seg.castShadow = true;
      this.staticGroup.add(seg);
    }
    topY = gy + H;
    topX = x + lean * H;
    const leafM = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonMat(0).gradientMap, side: THREE.DoubleSide });
    const greens = this.biome.treeGreens;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.34 * scale, 2.6 * scale, 4), leafM.clone());
      leaf.material.color.setHex(greens[i % greens.length]);
      leaf.position.set(topX + Math.cos(a) * 1.1 * scale, topY + 0.25, z + Math.sin(a) * 1.1 * scale);
      leaf.rotation.z = Math.cos(a) * 1.25;
      leaf.rotation.x = -Math.sin(a) * 1.25;
      leaf.castShadow = i % 2 === 0;
      this.staticGroup.add(leaf);
    }
    // кокоси
    for (let i = 0; i < 3; i++) {
      const coco = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 7, 6), toonMat(0x6b4a2a));
      coco.position.set(topX + this.rng.range(-0.3, 0.3), topY - 0.1, z + this.rng.range(-0.3, 0.3));
      this.staticGroup.add(coco);
    }
    this._addCollider(x, z, 0.45 * scale, gy + 2.4, 0.25);
  }

  // сума пагорбів карти в точці
  _hillsAt(x, z) {
    let h = 0;
    for (const hill of this.map.hills) {
      const d2 = (x - hill.x) * (x - hill.x) + (z - hill.z) * (z - hill.z);
      h += hill.h * Math.exp(-d2 / (2 * hill.sigma * hill.sigma));
    }
    return h;
  }

  // ---------- висота терену (аналітична — однакова для меша і фізики) ----------
  groundH(x, z) {
    const low = this.fbmLow(x * 0.011, z * 0.011) * 6.0;
    const hi = this.fbmHi(x * 0.045, z * 0.045) * 1.1;
    const hill = this._hillsAt(x, z);
    const terr = this._terrainMod ? this._terrainMod(x, z) : 0;
    let h = low + hi + hill + terr;
    // дороги — прибираємо дрібні горби (але драпіруються по великому рельєфу terr)
    let roadD = Infinity;
    for (const s of this.roadSegs) {
      const d = distToSeg(x, z, s[0], s[1], s[2], s[3]);
      if (d < roadD) roadD = d;
    }
    const rw = smoothstep(6.0, 2.4, roadD);
    if (rw > 0) h = lerp(h, low * 0.9 + hill + terr, rw);
    // майданчики місій та додаткові рівні зони — пласкі (на рівні великого рельєфу)
    if (this._flatList === undefined) {
      this._flatList = Object.values(this.map.sites).concat(this.map.flats || []);
      this._flatH = this._flatList.map((site) =>
        this.fbmLow(site.x * 0.011, site.z * 0.011) * 6.0 + this._hillsAt(site.x, site.z)
          + (this._terrainMod ? this._terrainMod(site.x, site.z) : 0));
    }
    for (let i = 0; i < this._flatList.length; i++) {
      const site = this._flatList[i];
      const d = Math.hypot(x - site.x, z - site.z);
      const w = smoothstep(site.r + 12, site.r * 0.5, d);
      if (w > 0) h = lerp(h, this._flatH[i], w);
    }
    // 🌊 русла рік: дно — абсолютна позначка, береги плавно зливаються з рельєфом
    for (const rv of this.rivers) {
      let d = Infinity;
      for (const s of rv.segs) {
        const v = distToSeg(x, z, s[0], s[1], s[2], s[3]);
        if (v < d) d = v;
      }
      const w = smoothstep(rv.width, rv.width * 0.45, d);
      if (w > 0) h = lerp(h, rv.level - rv.depth, w);
    }
    return h;
  }

  roadDist(x, z) {
    let d = Infinity;
    for (const s of this.roadSegs) {
      const v = distToSeg(x, z, s[0], s[1], s[2], s[3]);
      if (v < d) d = v;
    }
    return d;
  }

  // верх підлоги/даху в точці; обирається найвища поверхня, до якої можна "дотягтись" з висоти y.
  // Дахи зі схилом (slope) — висота росте до гребеня, як у справжнього даху.
  floorAt(x, z, y = 1.5) {
    let best = -Infinity;
    for (const f of this.floors) {
      const dx = x - f.x, dz = z - f.z;
      const c = Math.cos(f.ry), s = Math.sin(f.ry);
      const lx = c * dx - s * dz;
      const lz = s * dx + c * dz;
      if (Math.abs(lx) < f.w / 2 && Math.abs(lz) < f.d / 2) {
        const top = f.slope
          ? f.top + f.slope * (1 - Math.abs(lz) / (f.d / 2))
          : f.top;
        if (top <= y + 1.0 && top > best) best = top;
      }
    }
    return best;
  }

  // ---------- освітлення і небо ----------
  _buildLights() {
    const b = this.biome;
    const hemi = new THREE.HemisphereLight(b.hemiSky, b.hemiGround, b.hemiIntensity);
    this.scene.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight(b.sunColor, b.sunIntensity);
    sun.position.set(b.sunPos[0], b.sunPos[1], b.sunPos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.quality.shadow, this.quality.shadow);
    // 🪶 Тіні потрібні лише поблизу гравця: менша камера (±45) = вища ефективна
    // роздільність тіні навіть на меншій мапі. Дальні обʼєкти тіней не кидають.
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
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
    // 🌙 база для циклу день/ніч
    this.nightK = 0;
    this._dayFog = new THREE.Color(b.fogColor);
    this._nightFog = new THREE.Color(0x131b2e);
    this._daySun = new THREE.Color(b.sunColor);
    this._nightSun = new THREE.Color(0x9db8e8);
  }

  // 🌙 ніч: k = 0 (день) … 1 (глибока ніч). Викликається щокадру з main.
  setNight(k) {
    if (Math.abs(k - this.nightK) < 0.002) return;
    this.nightK = k;
    const b = this.biome;
    // сонце стає місячним світлом
    this.sun.intensity = b.sunIntensity * (1 - k * 0.82);
    this.sun.color.copy(this._daySun).lerp(this._nightSun, k);
    this.hemi.intensity = b.hemiIntensity * (1 - k * 0.62);
    // небо
    if (this.sky) {
      const u = this.sky.material.uniforms;
      u.top.value.setHex(b.skyTop).lerp(this._skyNightTop, k);
      u.horizon.value.setHex(b.skyHorizon).lerp(this._skyNightHor, k);
      u.bottom.value.setHex(b.skyBottom).lerp(this._skyNightBot, k);
    }
    // туман густішає і синішає
    this.scene.fog.color.copy(this._dayFog).lerp(this._nightFog, k);
    this.scene.fog.far = b.fogFar * (1 - k * 0.3);
    // сонячний диск ховається, місяць і зорі виходять
    if (this.sunDiscs) for (const d of this.sunDiscs) d.material.opacity = d.userData.baseOp * (1 - k);
    if (this.moon) this.moon.material.opacity = k * 0.95;
    if (this.moonGlow) this.moonGlow.material.opacity = k * 0.22;
    if (this.stars) this.stars.material.opacity = k * 0.9;
    // ліхтарі розгораються
    if (this.lampHeadM) this.lampHeadM.emissiveIntensity = b.lampGlow + k * 2.2;
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
    this._skyNightTop = new THREE.Color(0x0a1226);
    this._skyNightHor = new THREE.Color(0x1d2a4a);
    this._skyNightBot = new THREE.Color(0x0d1422);
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
    sunDisc.userData.baseOp = 0.95;
    glow.userData.baseOp = 0.25;
    this.sunDiscs = [sunDisc, glow];

    // 🌙 місяць (з кратерами) — на протилежному боці неба, вдень прозорий
    const mp = this.biome.sunDiscPos;
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(26, 22),
      new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false, transparent: true, opacity: 0 })
    );
    moon.position.set(-mp[0] * 0.9, Math.max(mp[1], 280), -mp[2] * 0.9);
    moon.lookAt(0, 0, 0);
    this.scene.add(moon);
    this.moon = moon;
    const mGlow = new THREE.Mesh(
      new THREE.CircleGeometry(46, 22),
      new THREE.MeshBasicMaterial({ color: 0xbcd0ff, fog: false, transparent: true, opacity: 0 })
    );
    mGlow.position.copy(moon.position).multiplyScalar(1.002);
    mGlow.lookAt(0, 0, 0);
    this.scene.add(mGlow);
    this.moonGlow = mGlow;

    // ✨ зорі: жменя точок по куполу
    const starN = 320;
    const starPos = new Float32Array(starN * 3);
    const srng = new RNG(42);
    for (let i = 0; i < starN; i++) {
      const a = srng.range(0, Math.PI * 2);
      const elev = Math.asin(srng.range(0.08, 0.98));
      const R = 720;
      starPos[i * 3] = Math.cos(a) * Math.cos(elev) * R;
      starPos[i * 3 + 1] = Math.sin(elev) * R;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(elev) * R;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xfff8e0, size: 2.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0,
    }));
    this.scene.add(stars);
    this.stars = stars;
  }

  // ---------- терен ----------
  _buildTerrain() {
    // на картах із великим рельєфом — густіша сітка, щоб скелі були чіткі
    const SIZE = 460;
    const SEG = this._terrainMod && this.quality.shadow >= 2048 ? 176 : 130;
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
    const cRock = new THREE.Color(this.biome.rock || 0x8d8377);
    const cPeak = new THREE.Color(this.biome.peak || this.biome.rock || 0x8d8377);
    const cBed = new THREE.Color(this.biome.riverbed || 0x9a8a64);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.groundH(x, z);
      pos.setY(i, h);
      const n = this.fbmHi(x * 0.055 + 50, z * 0.055 + 50);
      tmp.copy(cGrass1);
      if (n > 0.25) tmp.lerp(cGrass3, smoothstep(0.25, 0.6, n));
      else if (n < -0.2) tmp.lerp(cGrass2, smoothstep(-0.2, -0.6, n));
      // 🏔️ високо — скеля, ще вище — вершина (сніг/світла порода)
      if (this._terrainMod) {
        const rockW = smoothstep(8.5, 13.5, h);
        if (rockW > 0) tmp.lerp(cRock, rockW * 0.9);
        const peakW = smoothstep(14, 19, h);
        if (peakW > 0) tmp.lerp(cPeak, peakW);
      }
      // 🌊 дно і береги рік — пісок/мул
      for (const rv of this.rivers) {
        let d = Infinity;
        for (const s of rv.segs) {
          const v = distToSeg(x, z, s[0], s[1], s[2], s[3]);
          if (v < d) d = v;
        }
        if (d < rv.width + 2) tmp.lerp(cBed, smoothstep(rv.width + 2, rv.width * 0.5, d) * 0.85);
      }
      const roadD = this.roadDist(x, z);
      if (roadD < 3.4) tmp.lerp(cDirt, smoothstep(3.4, 2.0, roadD));
      const dV = Math.hypot(x - this.layout.village.x - 4, z - this.layout.village.z - 6);
      if (dV < 16) tmp.lerp(cPlaza, smoothstep(16, 8, dV) * 0.8);
      const dA = Math.hypot(x - this.layout.arena.x, z - this.layout.arena.z);
      if (dA < this.layout.arena.r + 4) tmp.lerp(cArena, smoothstep(this.layout.arena.r + 4, this.layout.arena.r - 6, dA) * 0.85);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, dithering: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this._buildWater();
  }

  // ---------- 🌊 водні стрічки рік ----------
  _buildWater() {
    if (!this.rivers.length) return;
    for (const rv of this.rivers) {
      const positions = [];
      const half = rv.width * 0.82;
      const pushWaterVertex = (x, z) => positions.push(x, this.groundH(x, z) + 0.2, z);
      for (let s = 0; s < rv.pts.length - 1; s++) {
        const [ax, az] = rv.pts[s];
        const [bx, bz] = rv.pts[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const steps = Math.max(2, Math.ceil(len / 6));
        for (let i = 0; i < steps; i++) {
          const t0 = i / steps, t1 = (i + 1) / steps;
          const x0 = lerp(ax, bx, t0), z0 = lerp(az, bz, t0);
          const x1 = lerp(ax, bx, t1), z1 = lerp(az, bz, t1);
          pushWaterVertex(x0 - nx * half, z0 - nz * half);
          pushWaterVertex(x0 + nx * half, z0 + nz * half);
          pushWaterVertex(x1 - nx * half, z1 - nz * half);
          pushWaterVertex(x0 + nx * half, z0 + nz * half);
          pushWaterVertex(x1 + nx * half, z1 + nz * half);
          pushWaterVertex(x1 - nx * half, z1 - nz * half);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshToonMaterial({
        color: this.biome.water || 0x4dc3e8, transparent: true, opacity: 0.78,
        side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4,
        dithering: true,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 1;
      this.scene.add(mesh);
    }
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
    for (const line of this.roads) {
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
    const line = this.roads[2];
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
    // top — висота перешкоди: вище неї колайдер не діє (можна стояти на даху)
    this.colliders.push({ x, z, r, top: occH > 0 ? occH : Infinity });
    if (occH > 0) this.occluders.push({ x, z, r: occR || r, h: occH });
  }

  _scatterPoints(count, minDist, accept) {
    const pts = [];
    let guard = 0;
    while (pts.length < count && guard++ < count * 30) {
      const a = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * (this.layout.BOUND + 18);
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
      const s = this.layout[key];
      if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return false;
    }
    // також обминаємо додаткові рівні зони (озеро, млин...)
    for (const f of this.map.flats || []) {
      if (Math.hypot(x - f.x, z - f.z) < f.r + pad) return false;
    }
    return true;
  }

  _buildVegetation() {
    const rng = this.rng;
    // 🌴 пустельний біом: рідкі пальми замість лісу
    if (this.biome.palms) {
      const acceptPalm = (x, z) => {
        const d = Math.hypot(x, z);
        if (d > this.layout.BOUND + 10) return false;
        if (this.roadDist(x, z) < 7) return false;
        if (!this._farFromSites(x, z, 12)) return false;
        return rng.chance(0.5);
      };
      const palmPts = this._scatterPoints(85, 9, acceptPalm);
      for (const p of palmPts) this._buildPalm(p.x, p.z, rng.range(0.8, 1.3));
      // сухі кущики і каміння пустелі
      const bushPts = this._scatterPoints(120, 4, (x, z) =>
        Math.hypot(x, z) < this.layout.BOUND + 5 && this.roadDist(x, z) > 4.5 && this._farFromSites(x, z, 4));
      const bushGeo = new THREE.IcosahedronGeometry(1, 1);
      const bushMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonMat(0).gradientMap });
      const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushPts.length);
      const dryCols = [0xa89a58, 0x968a4e, 0x7e8a44, 0xb0a468];
      const m4d = new THREE.Matrix4();
      const qd = new THREE.Quaternion();
      const v3d = new THREE.Vector3();
      const scd = new THREE.Vector3();
      const cold = new THREE.Color();
      bushPts.forEach((p, i) => {
        const h = this.groundH(p.x, p.z);
        const sz = rng.range(0.35, 0.8);
        qd.setFromEuler(new THREE.Euler(0, rng.next() * 6.28, 0));
        m4d.compose(v3d.set(p.x, h + sz * 0.4, p.z), qd, scd.set(sz, sz * 0.55, sz));
        bushes.setMatrixAt(i, m4d);
        bushes.setColorAt(i, cold.setHex(rng.pick(dryCols)));
      });
      bushes.castShadow = true;
      this.scene.add(bushes);
      const rockPts = this._scatterPoints(90, 6, (x, z) =>
        Math.hypot(x, z) < this.layout.BOUND + 8 && this.roadDist(x, z) > 5 && this._farFromSites(x, z, 5));
      const rockGeo = new THREE.IcosahedronGeometry(1, 0);
      const rockMat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonMat(0).gradientMap, flatShading: true });
      const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockPts.length);
      const rockCols = [0xc9ab74, 0xb8995e, 0xd4b780];
      rockPts.forEach((p, i) => {
        const h = this.groundH(p.x, p.z);
        const sz = rng.range(0.4, 1.7);
        qd.setFromEuler(new THREE.Euler(rng.next(), rng.next() * 6.28, rng.next()));
        m4d.compose(v3d.set(p.x, h + sz * 0.3, p.z), qd, scd.set(sz, sz * rng.range(0.55, 0.85), sz));
        rocks.setMatrixAt(i, m4d);
        rocks.setColorAt(i, cold.setHex(rng.pick(rockCols)));
        if (sz > 0.9) this._addCollider(p.x, p.z, sz * 0.8, h + sz, sz * 0.8);
      });
      rocks.castShadow = true;
      this.scene.add(rocks);
      return;
    }
    const isForest = (x, z) => this.fbmLow(x * 0.016 + 200, z * 0.016 + 200) > 0.12;
    const acceptTree = (x, z) => {
      const d = Math.hypot(x, z);
      if (d > this.layout.BOUND + 16) return false;
      if (this.roadDist(x, z) < 7) return false;
      if (!this._farFromSites(x, z, 10)) return false;
      if (Math.hypot(x - this.layout.village.x, z - this.layout.village.z) < 42 && !rng.chance(0.12)) return false;
      // густий ліс у "лісових" зонах і по краю мапи
      if (d > this.layout.BOUND - 14) return true;
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
      Math.hypot(x, z) < this.layout.BOUND + 5 && this.roadDist(x, z) > 4.5 && this._farFromSites(x, z, 4));
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
      Math.hypot(x, z) < this.layout.BOUND + 8 && this.roadDist(x, z) > 5 && this._farFromSites(x, z, 5));
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
    // двосхилий дах: гребінь уздовж X (фронтони — нормалями назовні!)
    const hw = w / 2, hd = d / 2;
    const verts = [
      // передній схил (z-)
      -hw, 0, -hd, hw, 0, -hd, hw, h, 0,
      -hw, 0, -hd, hw, h, 0, -hw, h, 0,
      // задній схил
      hw, 0, hd, -hw, 0, hd, -hw, h, 0,
      hw, 0, hd, -hw, h, 0, hw, h, 0,
      // фронтон +X (CCW, якщо дивитись з +X)
      hw, 0, hd, hw, 0, -hd, hw, h, 0,
      // фронтон -X (CCW, якщо дивитись з -X)
      -hw, 0, -hd, -hw, 0, hd, -hw, h, 0,
    ];
    // внутрішній бік: ті самі трикутники з оберненим порядком — дах не «просвічується»,
    // коли камера або гравець опиняються під ним
    const inner = [];
    for (let i = 0; i < verts.length; i += 9) {
      inner.push(
        verts[i], verts[i + 1], verts[i + 2],
        verts[i + 6], verts[i + 7], verts[i + 8],
        verts[i + 3], verts[i + 4], verts[i + 5]
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...verts, ...inner], 3));
    geo.computeVertexNormals();
    return geo;
  }

  // стіна з ланцюжка малих колайдерів (з прорізом на двері) — і для куль теж
  _addWallColliders(hx, hz, ry, x1, z1, x2, z2, hTop, doorAt = null, doorW = 1.3) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(2, Math.ceil(len / 0.55));
    const cosR = Math.cos(ry), sinR = Math.sin(ry);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const lx = lerp(x1, x2, t);
      const lz = lerp(z1, z2, t);
      // проріз на двері
      if (doorAt !== null && Math.abs(lerp(0, len, t) - doorAt) < doorW / 2) continue;
      const wx = hx + lx * cosR + lz * sinR;
      const wz = hz - lx * sinR + lz * cosR;
      this._addCollider(wx, wz, 0.32, hTop, 0.3);
    }
  }

  _makeEnterableHouse(x, z, ry, opts = {}) {
    const rng = this.rng;
    const w = opts.w || rng.range(6.2, 7.6);
    const d = opts.d || rng.range(5.2, 6.2);
    const h = opts.tall ? 4.2 : rng.range(2.9, 3.3);
    const wallC = opts.wall || rng.pick(this.biome.housePalette);
    const roofC = opts.roof || rng.pick(this.biome.roofPalette);
    const g = new THREE.Group();
    const gy = this.groundH(x, z);
    // пастельні стіни — всередині затишно, а не кислотно
    const pastel = new THREE.Color(wallC).lerp(new THREE.Color(0xfff8ef), 0.45).getHex();
    const wallM = toonMat(pastel);
    const TH = 0.18; // товщина стін
    const doorW = 1.35;

    // підлога і фундамент
    const found = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), toonMat(0x9aa3ad));
    found.position.y = 0.15;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.1, d - 0.1), toonMat(0xb08d57));
    floor.position.y = 0.45;
    g.add(found, floor);

    // фронтальна стіна з дверним прорізом (фронт -Z), двері трохи збоку
    const doorOff = 0.9; // зсув дверей від центру
    const frontL = (w / 2) + doorOff - doorW / 2;
    const frontR = w - frontL - doorW;
    const wallFL = new THREE.Mesh(new THREE.BoxGeometry(frontL, h, TH), wallM);
    wallFL.position.set(-w / 2 + frontL / 2, 0.4 + h / 2, -d / 2);
    const wallFR = new THREE.Mesh(new THREE.BoxGeometry(frontR, h, TH), wallM);
    wallFR.position.set(w / 2 - frontR / 2, 0.4 + h / 2, -d / 2);
    // перемичка над дверима
    const lintelF = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, h - 2.1, TH), wallM);
    lintelF.position.set(-w / 2 + frontL + doorW / 2, 0.4 + 2.1 + (h - 2.1) / 2, -d / 2);
    // задня і бічні стіни
    const wallB = new THREE.Mesh(new THREE.BoxGeometry(w, h, TH), wallM);
    wallB.position.set(0, 0.4 + h / 2, d / 2);
    const wallL = new THREE.Mesh(new THREE.BoxGeometry(TH, h, d), wallM);
    wallL.position.set(-w / 2, 0.4 + h / 2, 0);
    const wallR = new THREE.Mesh(new THREE.BoxGeometry(TH, h, d), wallM);
    wallR.position.set(w / 2, 0.4 + h / 2, 0);
    for (const m of [wallFL, wallFR, lintelF, wallB, wallL, wallR]) m.castShadow = true;
    g.add(wallFL, wallFR, lintelF, wallB, wallL, wallR);

    // стеля і дах
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), toonMat(0xd8cdbb));
    ceil.position.y = 0.4 + h;
    const roof = new THREE.Mesh(this._prismGeo(w + 0.7, h * 0.5, d + 0.7), toonMat(roofC));
    roof.position.y = 0.46 + h;
    roof.castShadow = true;
    g.add(ceil, roof);
    if (this.biome.snow) {
      const cap = new THREE.Mesh(this._prismGeo(w + 0.8, h * 0.18, d + 0.8), toonMat(0xf4f9fc));
      cap.position.y = 0.46 + h + h * 0.38;
      g.add(cap);
    }

    // відчинені двері (запрошують зайти)
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.15, 1.95, 0.08), toonMat(0x6b4226));
    door.position.set(-w / 2 + frontL + 0.1, 0.4 + 1.0, -d / 2 - 0.45);
    door.rotation.y = 1.9;
    g.add(door);

    // вікна (передні + бічні)
    const frameM = toonMat(0xffffff);
    const glassM = toonMat(0x9fd8ff, 0x4fb8ff, 0.25);
    const addWindow = (wx, wy, wz, rotY) => {
      const wg = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.0, 0.08), frameM);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.82, 0.09), glassM);
      wg.add(frame, glass);
      wg.position.set(wx, wy, wz);
      wg.rotation.y = rotY;
      g.add(wg);
    };
    addWindow(w / 2 - frontR / 2, 0.4 + h * 0.55, -d / 2 - 0.03, 0);
    addWindow(-w / 2 - 0.03, 0.4 + h * 0.55, 0, Math.PI / 2);
    addWindow(w / 2 + 0.03, 0.4 + h * 0.55, 0, Math.PI / 2);

    // лампа під стелею + тепле світло (найдешевший спосіб оживити кімнату)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), toonMat(0xfff2c2, 0xffd56b, 0.9));
    lamp.position.set(0, 0.4 + h - 0.25, 0);
    g.add(lamp);
    // Реальне точкове світло у кожному будинку — лише на явному «high».
    // distance=9 надворі майже не видно; на 'auto'/'fast' лишається тільки
    // емісивна лампа (без втрат для ока, але без зайвого GPU-pass на телефоні).
    if (this.quality.lights) {
      const pl = new THREE.PointLight(0xffd9a0, 5, 9, 1.4);
      pl.position.set(0, 0.4 + h - 0.4, 0);
      g.add(pl);
    }
    // килимок і картина — затишок
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 14), toonMat(0xc9605a));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.52, 0.3);
    g.add(rug);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.05), toonMat(0x8a5a32));
    frame.position.set(0.8, 0.4 + h * 0.6, d / 2 - 0.12);
    const art = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.06), toonMat(0x6fc3ff));
    art.position.set(0.8, 0.4 + h * 0.6, d / 2 - 0.13);
    g.add(frame, art);

    // меблі (з колайдерами в локальних координатах)
    const furn = [];
    const woodM = toonMat(0x8a5a32);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.1), toonMat(0xc9605a));
    bed.position.set(-w / 2 + 1.25, 0.72, d / 2 - 0.85);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.7), toonMat(0xf5f0e0));
    pillow.position.set(-w / 2 + 0.55, 1.05, d / 2 - 0.85);
    furn.push([bed, 1.0], [pillow, 0]);
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.9), woodM);
    table.position.set(w / 2 - 1.4, 1.05, 0.4);
    const tLeg = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.12), woodM);
    tLeg.position.set(w / 2 - 1.4, 0.55, 0.4);
    furn.push([table, 0.8], [tLeg, 0]);
    const wardrobe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.6), woodM);
    wardrobe.position.set(w / 2 - 0.8, 0.4 + 1.05, -d / 2 + 0.55);
    furn.push([wardrobe, 0.7]);
    const stove = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.9), toonMat(0xe8e2d0));
    stove.position.set(-w / 2 + 0.75, 0.4 + 0.7, -d / 2 + 0.75);
    furn.push([stove, 0.7]);
    for (const [m] of furn) {
      m.castShadow = false;
      g.add(m);
    }

    g.position.set(x, gy, z);
    g.rotation.y = ry;
    this.staticGroup.add(g);
    const floorTop = gy + 0.51;
    this.floors.push({ x, z, ry, w: w + 0.5, d: d + 0.5, top: floorTop });
    // дах — теж поверхня зі схилом: ходиться як по справжньому даху
    this.floors.push({ x, z, ry, w: w + 0.7, d: d + 0.7, top: gy + 0.46 + h, slope: h * 0.5 });

    // колайдери стін (повертаємо локальні координати на ry)
    const top = gy + h + 0.5;
    this._addWallColliders(x, z, ry, -w / 2, -d / 2, w / 2, -d / 2, top, frontL + doorW / 2, doorW + 0.5);
    this._addWallColliders(x, z, ry, -w / 2, d / 2, w / 2, d / 2, top);
    this._addWallColliders(x, z, ry, -w / 2, -d / 2, -w / 2, d / 2, top);
    this._addWallColliders(x, z, ry, w / 2, -d / 2, w / 2, d / 2, top);
    // меблі-колайдери
    const cosR = Math.cos(ry), sinR = Math.sin(ry);
    for (const [m, r] of furn) {
      if (r <= 0) continue;
      const wx = x + m.position.x * cosR + m.position.z * sinR;
      const wz = z - m.position.x * sinR + m.position.z * cosR;
      this.colliders.push({ x: wx, z: wz, r });
    }

    // лут усередині (на підлозі)
    const lootTypes = ['ammo', 'medkit', 'grenade'];
    const lootN = opts.surprise ? 3 : 2;
    for (let i = 0; i < lootN; i++) {
      const lx = rng.range(-w / 2 + 1.4, w / 2 - 1.4);
      const lz = rng.range(-d / 2 + 1.6, d / 2 - 1.6);
      this.lootSpots.push({
        x: x + lx * cosR + lz * sinR,
        z: z - lx * sinR + lz * cosR,
        y: floorTop,
        type: i === 0 && opts.surprise ? 'coins' : rng.pick(lootTypes),
      });
    }
    // зомбі-сюрприз за меблями
    if (opts.surprise) {
      const sx = x + (w / 2 - 1.6) * cosR + 0.8 * sinR;
      const sz = z - (w / 2 - 1.6) * sinR + 0.8 * cosR;
      this.surpriseSpots.push({ x: sx, z: sz });
    }
    return g;
  }

  _makeHouse(x, z, ry, opts = {}) {
    if (opts.enterable) return this._makeEnterableHouse(x, z, ry, opts);
    const rng = this.rng;
    const w = opts.w || rng.range(5.5, 7.5);
    const d = opts.d || rng.range(4.6, 6);
    const h = opts.h || (opts.tall ? 4.2 : rng.range(2.7, 3.2));
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

    // фахверкові балки (німецький стиль)
    if (this.biome.timber) {
      const beamM = toonMat(0x4a3a2c);
      for (const bz of [-d / 2 - 0.05, d / 2 + 0.05]) {
        for (const bx of [-w / 2 + 0.15, 0, w / 2 - 0.15]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, h, 0.1), beamM);
          post.position.set(bx, 0.4 + h / 2, bz);
          g.add(post);
        }
        const beamTop = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.1), beamM);
        beamTop.position.set(0, 0.4 + h - 0.1, bz);
        const beamMid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.1), beamM);
        beamMid.position.set(0, 0.4 + h * 0.32, bz);
        const diag = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.13, 0.1), beamM);
        diag.position.set(-w / 4, 0.4 + h * 0.16, bz);
        diag.rotation.z = 0.45;
        const diag2 = diag.clone();
        diag2.position.x = w / 4;
        diag2.rotation.z = -0.45;
        g.add(beamTop, beamMid, diag, diag2);
      }
    }

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
    for (const h of this.map.houses) {
      if (h.skipAuto) continue;
      this._makeHouse(h.x, h.z, h.ry, h);
    }
    const extras = this.map.villageExtras || [];
    if (extras.includes('well')) this._buildWell();
    if (extras.includes('lamps')) this._buildLamps();
    if (extras.includes('fences')) this._buildFences();
    this._buildHay();
    for (const s of this.map.signs || []) {
      this._makeSign(s.x, s.z, this.biome.signText, s.ry || 0);
    }
  }

  _buildWell() {
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
  }

  _buildLamps() {
    // ліхтарі вздовж південної дороги
    const lampM = toonMat(0x37404f);
    const lampHeadM = toonMat(0xffd97a, 0xffc233, this.biome.lampGlow);
    this.lampHeadM = lampHeadM; // вночі розгоряється (setNight)
    for (const [lx, lz] of [[10, 130], [2, 90], [10, 50], [-4, 24], [12, 14], [-8, -2]]) {
      const ly = this.groundH(lx, lz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), lampM);
      pole.position.set(lx, ly + 1.7, lz);
      pole.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampHeadM);
      head.position.set(lx, ly + 3.5, lz);
      this.staticGroup.add(pole);
      this.scene.add(head); // НЕ в staticGroup: запікання з'їдає emissive, а вночі ліхтар світиться
      this._addCollider(lx, lz, 0.25, ly + 3.2, 0.15);
    }
  }

  _buildFences() {
    // парканчики навколо двох дворів
    const fenceM = toonMat(0xe8e2d0);
    const addFenceRun = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.floor(len / 0.55);
      const heights = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const fx = lerp(x1, x2, t), fz = lerp(z1, z2, t);
        const fy = this.groundH(fx, fz);
        heights.push([fx, fz, fy]);
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.75, 0.04), fenceM);
        p.position.set(fx, fy + 0.37, fz);
        p.rotation.y = Math.atan2(z2 - z1, x2 - x1);
        this.staticGroup.add(p);
      }
      // поперечина сегментами між сусідніми стовпчиками — повторює терен, не косить
      const ry = Math.atan2(z2 - z1, x2 - x1);
      for (let i = 0; i < n; i++) {
        const [ax, az, ah] = heights[i];
        const [bx, bz, bh] = heights[i + 1];
        const segLen = Math.hypot(bx - ax, bz - az, bh - ah);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen + 0.06, 0.07, 0.05), fenceM);
        rail.position.set((ax + bx) / 2, (ah + bh) / 2 + 0.55, (az + bz) / 2);
        rail.rotation.y = -ry;
        rail.rotation.z = Math.atan2(bh - ah, Math.hypot(bx - ax, bz - az));
        this.staticGroup.add(rail);
      }
    };
    addFenceRun(12, 35, 12, 45); addFenceRun(12, 45, 25, 45); addFenceRun(25, 45, 25, 35);
    addFenceRun(-20, 25, -20, 36); addFenceRun(-20, 36, -9, 36);
  }

  _buildHay() {
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

  // 🏛 ринкова площа: бруківка, ратуша з годинником, замерзлий фонтан, лавки
  _lmTownSquare({ x, z, r }) {
    // бруківка з канвас-текстурою
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const c2 = cv.getContext('2d');
    c2.fillStyle = '#8d93a4';
    c2.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 220; i++) {
      const bx = (i * 37) % 256, by = (Math.floor(i / 8) * 34 + (i % 2) * 17) % 256;
      c2.fillStyle = ['#979daf', '#848a9b', '#9aa1b3'][i % 3];
      c2.beginPath();
      c2.roundRect(bx, by, 28, 26, 7);
      c2.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(r / 4, r / 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.CircleGeometry(r, 28);
    geo.rotateX(-Math.PI / 2);
    this._drapeXZGeometry(geo, x, z, 0.09);
    const plaza = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonMat(0).gradientMap, polygonOffset: true, polygonOffsetFactor: -3 }));
    plaza.position.set(x, 0, z);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // ратуша з високою вежею-годинником (обличчям до площі, +z)
    const hx = x, hz = z - r - 6;
    const hy = this.groundH(hx, hz);
    const hall = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 7), toonMat(0xd8c8b8));
    body.position.y = 3.5;
    body.castShadow = true;
    const roof = new THREE.Mesh(this._prismGeo(13, 3, 8), toonMat(0x8a4a3a));
    roof.position.y = 7;
    roof.castShadow = true;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3.6, 18, 3.6), toonMat(0xc9bba8));
    tower.position.y = 9;
    tower.castShadow = true;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.6, 4), toonMat(0x5a6478));
    spire.position.y = 19.8;
    spire.rotation.y = Math.PI / 4;
    // світні вікна (присмерк — вони продають "життя" в місті)
    const winM = new THREE.MeshBasicMaterial({ color: 0xffd97a });
    for (const [wx2, wy2] of [[-3.5, 4.2], [0, 4.2], [3.5, 4.2], [-3.5, 2.2], [3.5, 2.2]]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.1), winM);
      win.position.set(wx2, wy2, 3.55);
      hall.add(win);
    }
    const towerWin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.1), winM);
    towerWin.position.set(0, 8, 1.85);
    hall.add(towerWin);
    // циферблат
    const ccv = document.createElement('canvas');
    ccv.width = 128; ccv.height = 128;
    const cc = ccv.getContext('2d');
    cc.fillStyle = '#f5efe0';
    cc.beginPath(); cc.arc(64, 64, 60, 0, 6.29); cc.fill();
    cc.strokeStyle = '#3a4252'; cc.lineWidth = 6; cc.stroke();
    cc.lineWidth = 7; cc.beginPath(); cc.moveTo(64, 64); cc.lineTo(64, 22); cc.stroke();
    cc.lineWidth = 9; cc.beginPath(); cc.moveTo(64, 64); cc.lineTo(92, 76); cc.stroke();
    const ctex = new THREE.CanvasTexture(ccv);
    ctex.colorSpace = THREE.SRGBColorSpace;
    const clock = new THREE.Mesh(new THREE.CircleGeometry(1.35, 20), new THREE.MeshBasicMaterial({ map: ctex }));
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.6, 0.2), toonMat(0x6b4226));
    door.position.set(0, 1.3, 3.55);
    hall.add(body, roof, tower, spire, door);
    hall.position.set(hx, hy, hz);
    this.staticGroup.add(hall);
    // циферблат не запікається (текстура) — окремо, обличчям до площі (+z)
    clock.position.set(hx, hy + 15, hz + 1.86);
    this.scene.add(clock);
    this._addCollider(hx - 4, hz, 3.8, hy + 7, 3.6);
    this._addCollider(hx, hz, 3.8, hy + 18, 3.6);
    this._addCollider(hx + 4, hz, 3.8, hy + 7, 3.6);

    // ринкові ятки кільцем навколо фонтана
    const stallCanvas = [0xd84f4f, 0x4a8ad4, 0x57b83e, 0xff8c42, 0x8d6bb8];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.9;
      const sx = x + Math.cos(a) * (r - 7);
      const sz = z + Math.sin(a) * (r - 7);
      const sy = this.groundH(sx, sz);
      const stall = new THREE.Group();
      const postM2 = toonMat(0x6b4a2a);
      for (const [px2, pz2] of [[-1.1, -0.8], [1.1, -0.8], [-1.1, 0.8], [1.1, 0.8]]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), postM2);
        post.position.set(px2, 1.1, pz2);
        stall.add(post);
      }
      const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.5), toonMat(0x8a5a32));
      counter.position.y = 0.5;
      stall.add(counter);
      // смугастий навіс
      const canopy = new THREE.Mesh(this._prismGeo(2.8, 0.7, 2.1), toonMat(stallCanvas[i]));
      canopy.position.y = 2.2;
      const stripe = new THREE.Mesh(this._prismGeo(2.82, 0.4, 1.2), toonMat(0xf5efe0));
      stripe.position.y = 2.24;
      stall.add(canopy, stripe);
      stall.position.set(sx, sy, sz);
      stall.rotation.y = -a + Math.PI / 2;
      this.staticGroup.add(stall);
      this._addCollider(sx, sz, 1.4, sy + 1.2, 1.2);
    }

    // замерзлий фонтан у центрі площі
    const fy = this.groundH(x, z);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.8, 14), toonMat(0x9aa3ad));
    basin.position.set(x, fy + 0.4, z);
    basin.castShadow = true;
    const iceM = toonMat(0xcfe9f5, 0x88ccee, 0.25);
    const iceTop = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.25, 14), iceM);
    iceTop.position.set(x, fy + 0.85, z);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 8), iceM);
    spike.position.set(x, fy + 2.1, z);
    this.staticGroup.add(basin, iceTop, spike);
    this._addCollider(x, z, 2.6, fy + 2, 2.2);

    // лавки
    const benchM = toonMat(0x6b4a2a);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const bx = x + Math.cos(a) * (r - 4);
      const bz = z + Math.sin(a) * (r - 4);
      const by = this.groundH(bx, bz);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), benchM);
      seat.position.set(bx, by + 0.55, bz);
      seat.rotation.y = -a;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.1), benchM);
      back.position.set(bx - Math.cos(a) * 0.25, by + 0.95, bz - Math.sin(a) * 0.25);
      back.rotation.y = -a;
      this.staticGroup.add(seat, back);
      this._addCollider(bx, bz, 0.8, by + 1, 0.6);
    }
  }

  // ❄️ замерзле озеро (лід — фізика ковзання в player.js)
  _lmFrozenLake({ x, z, r }) {
    const geo = new THREE.CircleGeometry(r, 30);
    geo.rotateX(-Math.PI / 2);
    this._drapeXZGeometry(geo, x, z, 0.1);
    const ice = new THREE.Mesh(geo, new THREE.MeshToonMaterial({
      color: 0x9ccbe8, gradientMap: toonMat(0).gradientMap,
      emissive: 0x3a7fc4, emissiveIntensity: 0.22,
      dithering: true,
    }));
    ice.position.set(x, 0, z);
    this.scene.add(ice);
    // тріщини
    const crackM = new THREE.MeshBasicMaterial({ color: 0x9bc4d8 });
    for (let i = 0; i < 7; i++) {
      const a = this.rng.range(0, 6.28);
      const len = this.rng.range(5, 14);
      const crack = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.16), crackM);
      const cx = x + this.rng.range(-r * 0.6, r * 0.6);
      const cz = z + this.rng.range(-r * 0.6, r * 0.6);
      crack.position.set(cx, this.groundH(cx, cz) + 0.13, cz);
      crack.rotation.y = a;
      this.scene.add(crack);
    }
    // сніговий бортик
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.8, 1.1, 8, 36), toonMat(0xf4f9fc));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(x, this.groundH(x, z) - 0.45, z);
    rim.scale.set(1, 1, 0.5);
    this.staticGroup.add(rim);
    // табличка "ОБЕРЕЖНО: СЛИЗЬКО!"
    this._makeSign(x, z + r + 3, t('ОБЕРЕЖНО: СЛИЗЬКО! ⛸'), 0);
  }

  // 🏰 руїни замку — арена боса
  _lmCastleRuin({ x, z, r }) {
    const stoneM = toonMat(0x8d949c);
    const stoneM2 = toonMat(0x767e88);
    // кутові вежі
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const tx = x + Math.cos(a) * r;
      const tz = z + Math.sin(a) * r;
      const ty = this.groundH(tx, tz);
      const broken = i === 1; // одна вежа зруйнована
      const h = broken ? 4 : 9;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, h, 10), i % 2 ? stoneM : stoneM2);
      tower.position.set(tx, ty + h / 2, tz);
      tower.castShadow = true;
      this.staticGroup.add(tower);
      if (!broken) {
        for (let b = 0; b < 6; b++) {
          const ba = (b / 6) * Math.PI * 2;
          const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.6), stoneM);
          merlon.position.set(tx + Math.cos(ba) * 2.2, ty + h + 0.45, tz + Math.sin(ba) * 2.2);
          merlon.rotation.y = -ba;
          this.staticGroup.add(merlon);
        }
      }
      this._addCollider(tx, tz, 2.9, ty + h, 2.6);
    }
    // зруйновані стіни між вежами (з проходом-брамою на півдні)
    const N = 30;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      let dAng = Math.abs(ang - Math.PI / 2);
      if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
      if (dAng < 0.3) continue; // брама
      // пропуски-руйнування
      if (this.rng.chance(0.22)) continue;
      const bx = x + Math.cos(ang) * r;
      const bz = z + Math.sin(ang) * r;
      const by = this.groundH(bx, bz);
      const h = this.rng.range(2.2, 4.2);
      const block = new THREE.Mesh(new THREE.BoxGeometry(2.4, h, 1.6), this.rng.chance(0.5) ? stoneM : stoneM2);
      block.position.set(bx, by + h / 2 - 0.3, bz);
      block.rotation.y = -ang + this.rng.range(-0.1, 0.1);
      block.castShadow = true;
      this.staticGroup.add(block);
      this._addCollider(bx, bz, 1.5, by + h, 1.3);
    }
    // брама: дві колони + прапори
    for (const side of [-1, 1]) {
      const px = x + side * 5, pz = z + r;
      const py = this.groundH(px, pz);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 6, 8), stoneM);
      col.position.set(px, py + 3, pz);
      col.castShadow = true;
      this.staticGroup.add(col);
      this._addCollider(px, pz, 1.3, py + 6, 1.1);
      const flagGeo = new THREE.PlaneGeometry(1.6, 0.9, 6, 2);
      const flag = new THREE.Mesh(flagGeo, new THREE.MeshToonMaterial({
        color: 0x8d3bbd, gradientMap: toonMat(0).gradientMap, side: THREE.DoubleSide,
      }));
      flag.position.set(px + 0.85, py + 6.5, pz);
      this.scene.add(flag);
      this.animatedFlags.push(flag);
    }
    this._makeSign(x + 10, z + r + 6, t('НЕБЕЗПЕКА: БОС!'), 0);
  }

  // 🚂 залізничне депо: рейки, вагони, платформа
  _lmRailDepot({ x, z }) {
    const railM = toonMat(0x4a5160);
    const tieM = toonMat(0x5e4530);
    // рейки повз склад: короткі сегменти повторюють схил, щоб довга балка не висіла у повітрі
    for (const off of [-0.8, 0.8]) {
      for (let sx = -30; sx < 30; sx += 2.5) {
        const ax = x + sx, bx = x + Math.min(30, sx + 2.5);
        const rz = z + 9 + off;
        const ay = this.groundH(ax, rz), by = this.groundH(bx, rz);
        const len = Math.hypot(bx - ax, by - ay);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.04, 0.15, 0.18), railM);
        rail.position.set((ax + bx) / 2, (ay + by) / 2 + 0.12, rz);
        rail.rotation.z = Math.atan2(by - ay, bx - ax);
        this.staticGroup.add(rail);
      }
    }
    for (let i = 0; i < 28; i++) {
      const tx = x - 29 + i * 2.1;
      const tz = z + 9;
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 2.4), tieM);
      tie.position.set(tx, this.groundH(tx, tz) + 0.06, tz);
      this.staticGroup.add(tie);
    }
    // вагони
    const carCols = [0x9c4a3e, 0x4a6da7, 0x5e7050];
    for (let i = 0; i < 3; i++) {
      const cx = x - 16 + i * 12;
      const cz = z + 9;
      const cy = this.groundH(cx, cz);
      const car = new THREE.Mesh(new THREE.BoxGeometry(9, 3.0, 2.6), toonMat(carCols[i]));
      car.position.set(cx, cy + 1.9, cz);
      car.castShadow = true;
      const carRoof = new THREE.Mesh(new THREE.BoxGeometry(9.3, 0.25, 2.9), toonMat(0x3a4252));
      carRoof.position.set(cx, cy + 3.5, cz);
      this.staticGroup.add(car, carRoof);
      for (const wx of [-3, 3]) {
        for (const wzz of [-1, 1]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 10), toonMat(0x2a3138));
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(cx + wx, cy + 0.45, cz + wzz * 1.1);
          this.staticGroup.add(wheel);
        }
      }
      this._addCollider(cx - 3, cz, 1.9, cy + 3.6, 1.6);
      this._addCollider(cx, cz, 1.9, cy + 3.6, 1.6);
      this._addCollider(cx + 3, cz, 1.9, cy + 3.6, 1.6);
      // дах вагона — можна стояти
      this.floors.push({ x: cx, z: cz, ry: 0, w: 9, d: 2.6, top: cy + 3.65 });
    }
    // платформа з ліхтарем
    const platM = toonMat(0x767e88);
    for (let i = 0; i < 8; i++) {
      const px = x - 7 + i * 2;
      const plat = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.6, 3.5), platM);
      plat.position.set(px, this.groundH(px, z + 5.2) + 0.3, z + 5.2);
      this.staticGroup.add(plat);
    }
  }

  // 🎄 ялинки з гірляндами
  _lmGarlands({ spots }) {
    const lightCols = [0xff5d73, 0xffd23f, 0x6dff9c, 0x6fc3ff];
    for (const [gx, gz] of spots) {
      const gy = this.groundH(gx, gz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 7), toonMat(0x7a5230));
      trunk.position.set(gx, gy + 0.6, gz);
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.2, 9), toonMat(0x2c5f48));
      c1.position.set(gx, gy + 2.6, gz);
      c1.castShadow = true;
      const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 9), toonMat(0x356b52));
      c2.position.set(gx, gy + 4.0, gz);
      this.staticGroup.add(trunk, c1, c2);
      // спіраль вогників
      for (let i = 0; i < 12; i++) {
        const t = i / 12;
        const a = t * Math.PI * 5;
        const rr = 1.6 * (1 - t * 0.75);
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.09, 6, 5),
          new THREE.MeshToonMaterial({
            color: lightCols[i % 4], emissive: lightCols[i % 4], emissiveIntensity: 1.2,
            gradientMap: toonMat(0).gradientMap,
          })
        );
        bulb.position.set(gx + Math.cos(a) * rr, gy + 1.3 + t * 3.6, gz + Math.sin(a) * rr);
        this.scene.add(bulb);
      }
      const star = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), toonMat(0xffd23f, 0xffaa00, 1.4));
      star.position.set(gx, gy + 5.4, gz);
      this.scene.add(star);
      this._addCollider(gx, gz, 0.6, gy + 3, 0.4);
    }
  }

  // ---------- приколи: батути, бочки-позиції, секретний лут ----------
  _buildFun() {
    const fun = this.map.fun || {};
    // батути
    for (const jp of fun.jumpPads || []) {
      const gy = this.groundH(jp.x, jp.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 8, 18), toonMat(0xff8c42));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(jp.x, gy + 0.22, jp.z);
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.0, 0.18, 18),
        new THREE.MeshToonMaterial({ color: 0x6fc3ff, emissive: 0x2288cc, emissiveIntensity: 0.5, gradientMap: toonMat(0).gradientMap })
      );
      pad.position.set(jp.x, gy + 0.16, jp.z);
      this.scene.add(ring, pad);
      this.jumpPads.push({ x: jp.x, z: jp.z, y: gy, power: jp.power || 14, cd: 0, pad });
    }
    // секретний лут на дахах (dy — висота над тереном)
    for (const sl of fun.secretLoot || []) {
      const gy = this.groundH(sl.x, sl.z);
      this.lootSpots.push({ x: sl.x, z: sl.z, y: gy + (sl.dy || 3.6), type: 'coins' });
      this.lootSpots.push({ x: sl.x + 0.8, z: sl.z, y: gy + (sl.dy || 3.6), type: 'grenade' });
    }
  }

  // прибрати колайдер (вибухнула бочка тощо)
  removeCollider(c) {
    const i = this.colliders.indexOf(c);
    if (i >= 0) {
      this.colliders.splice(i, 1);
      this._buildGrid();
    }
  }

  // ---------- хлів із людьми (місія 1) ----------
  _buildBarn() {
    const { x, z } = this.layout.rescue;
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
    if (this.barnOpened) return;
    this.barnOpened = true;
    this.barnOpening = true;
    const i = this.colliders.indexOf(this.barnDoorCollider);
    if (i >= 0) this.colliders.splice(i, 1);
    this._buildGrid();
  }

  // ---------- радіовежа (місія 2) ----------
  _buildTower() {
    const { x, z } = this.layout.tower;
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
    const { x, z } = this.layout.warehouse;
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
    // дах ангара — посадковий майданчик для батута (зі схилом)
    this.floors.push({ x, z, ry: 0, w: W + 0.8, d: D + 0.8, top: gy + H, slope: 1.6 });

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
    this.crateOpened = true;
    this.weaponCrate.opening = true;
  }

  // ---------- арена боса ----------
  _buildArena() {
    const { x, z, r } = this.layout.arena;
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
    this._makeSign(x + 10, z + r + 6, t('НЕБЕЗПЕКА: БОС!'), 0);
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
  _buildSnowfall(dust = false) {
    const N = dust ? Math.round(this.quality.snow * 0.5) : this.quality.snow;
    const geo = new THREE.SphereGeometry(dust ? 0.04 : 0.05, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: dust ? 0xe8cf9a : 0xffffff,
      transparent: true,
      opacity: dust ? 0.4 : 0.85,
    });
    this.dustMode = dust;
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

  // ---------- 🍂 листопад (осінній біом) ----------
  _buildLeaffall() {
    const N = Math.round(this.quality.snow * 0.6);
    const geo = new THREE.BoxGeometry(0.22, 0.02, 0.16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.leafMesh = new THREE.InstancedMesh(geo, mat, N);
    this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leafMesh.frustumCulled = false;
    this.scene.add(this.leafMesh);
    this.leaves = [];
    const cols = [0xe89a3a, 0xd8742f, 0xc9582c, 0xe2b03d, 0xb85c38];
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.leaves.push({
        x: this.rng.range(-35, 35), y: this.rng.range(0, 25), z: this.rng.range(-35, 35),
        spd: this.rng.range(0.8, 1.8), drift: this.rng.range(0.8, 2.2), ph: this.rng.range(0, 6.28),
      });
      this.leafMesh.setColorAt(i, col.setHex(cols[i % cols.length]));
    }
    this._leafM4 = new THREE.Matrix4();
    this._leafQ = new THREE.Quaternion();
    this._leafE = new THREE.Euler();
    this._leafS = new THREE.Vector3(1, 1, 1);
    this._leafV = new THREE.Vector3();
  }

  _updateLeaffall(dt, px, pz) {
    if (!this.leafMesh) return;
    // листя косметичне — висоту землі семплимо раз/кадр (а не повним groundH на кожну)
    const gh0 = this.groundH(px, pz);
    for (let i = 0; i < this.leaves.length; i++) {
      const f = this.leaves[i];
      f.y -= f.spd * dt;
      f.x += Math.sin(this.time * f.drift + f.ph) * dt * 1.6;
      if (f.y < -2) {
        f.y = 22 + this.rng.range(0, 5);
        f.x = this.rng.range(-35, 35);
        f.z = this.rng.range(-35, 35);
      }
      this._leafE.set(this.time * f.drift + f.ph, f.ph, Math.sin(this.time * 2 + f.ph) * 0.8);
      this._leafQ.setFromEuler(this._leafE);
      this._leafM4.compose(
        this._leafV.set(px + f.x, gh0 + f.y, pz + f.z),
        this._leafQ, this._leafS
      );
      this.leafMesh.setMatrixAt(i, this._leafM4);
    }
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  _updateSnowfall(dt, px, pz) {
    if (!this.snowMesh) return;
    // сніжинки косметичні й падають довкола гравця — висоту землі семплимо раз/кадр,
    // а не повним groundH() на кожну з ~380 (велика економія CPU на мобільному)
    const gh0 = this.groundH(px, pz);
    for (let i = 0; i < this.snowFlakes.length; i++) {
      const f = this.snowFlakes[i];
      if (this.dustMode) {
        // піщана імла: несеться вітром майже горизонтально
        f.x += f.spd * dt * 2.2;
        f.y -= f.spd * dt * 0.25;
        f.z += Math.sin(this.time * f.drift + f.ph) * dt * 1.4;
        if (f.x > 35) { f.x = -35; f.y = this.rng.range(0.5, 14); f.z = this.rng.range(-35, 35); }
      } else {
        f.y -= f.spd * dt;
        f.x += Math.sin(this.time * f.drift + f.ph) * dt * 0.8;
      }
      if (f.y < -2) {
        f.y = 26 + this.rng.range(0, 6);
        f.x = this.rng.range(-35, 35);
        f.z = this.rng.range(-35, 35);
      }
      this._snowM4.compose(
        this._snowV.set(px + f.x, gh0 + f.y, pz + f.z),
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
  collide(x, z, r, y = -Infinity) {
    const CELL = 16;
    for (let iter = 0; iter < 2; iter++) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let gx = -1; gx <= 1; gx++) {
        for (let gz = -1; gz <= 1; gz++) {
          const list = this.grid.get(GKEY(cx + gx, cz + gz));
          if (!list) continue;
          for (const c of list) {
            // над перешкодою (на даху/в стрибку) — колайдер не діє.
            // top undefined (напр. меблі) = суцільна висота: не пропускаємо (явно, без покладання на NaN-порівняння)
            if (c.top != null && y > c.top + 0.1) continue;
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
    if (dC > this.layout.BOUND) {
      x *= this.layout.BOUND / dC;
      z *= this.layout.BOUND / dC;
    }
    this._collideOut.x = x;
    this._collideOut.z = z;
    return this._collideOut;
  }

  // Дистанція блокування пострілу (стіни/стовбури/терен). Infinity якщо вільно.
  shotBlockDist(origin, dir, maxT) {
    let best = Infinity;
    const p0 = this._sbP0, p1 = this._sbP1;
    for (const oc of this.occluders) {
      const dx = oc.x - origin.x, dz = oc.z - origin.z;
      const approx = Math.hypot(dx, dz);
      if (approx - oc.r > Math.min(maxT, best)) continue;
      p0.set(oc.x, -2, oc.z);
      p1.set(oc.x, oc.h, oc.z);
      const res = closestRaySeg(origin, dir, p0, p1, this._raySegOut);
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
    // обертові елементи (лопаті млина)
    for (const sp of this.spinners) {
      sp.group.rotation[sp.axis || 'z'] += sp.speed * dt;
    }
    // хвилі на ставку
    if (this.pond) {
      this.pond.t += dt;
      const pos = this.pond.mesh.geometry.attributes.position;
      const base = this.pond.base;
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
        pos.setY(i, by + Math.sin(this.pond.t * 1.7 + bx * 0.55 + bz * 0.4) * 0.16);
      }
      pos.needsUpdate = true;
    }
    // ⛲ фонтан на площі: струмінь-маківка пульсує вгору-вниз
    if (this.fountain) {
      this.fountain.t += dt;
      const j = this.fountain.jet;
      j.position.y = this.fountain.base + Math.abs(Math.sin(this.fountain.t * 3.2)) * 0.45;
      const s = 0.85 + Math.sin(this.fountain.t * 4.0) * 0.18;
      j.scale.set(s, 1.1 + (1 - s) * 1.5, s);
    }
    // дим з димарів
    if (this.smokeMesh) {
      for (let i = 0; i < this.smokePuffs.length; i++) {
        const p = this.smokePuffs[i];
        p.t += dt;
        if (p.t > p.dur) p.t = 0;
        const k = p.t / p.dur;
        const s = 0.5 + k * 1.6;
        this._smokeM4.compose(
          this._smokeV.set(p.x + Math.sin(p.t * p.drift * 3) * 0.4 + k * p.drift * 2, p.y0 + k * 4.5, p.z),
          this._smokeQ,
          this._smokeS.set(s, s, s)
        );
        this.smokeMesh.setMatrixAt(i, this._smokeM4);
      }
      this.smokeMesh.instanceMatrix.needsUpdate = true;
    }
    // птахи
    if (this.birds) {
      for (const b of this.birds) {
        b.ph += b.speed * dt;
        b.g.position.set(b.cx + Math.cos(b.ph) * b.r, b.h + Math.sin(b.ph * 2.3) * 2, b.cz + Math.sin(b.ph) * b.r);
        b.g.rotation.y = -b.ph - Math.PI / 2;
        const flap = Math.sin(this.time * 9 + b.ph * 7) * 0.5;
        const wL = b.g.children[0], wR = b.g.children[1];
        if (wL) wL.rotation.z = flap;
        if (wR) wR.rotation.z = -flap;
      }
    }
    // повітряна куля пливе колами
    if (this.balloonsExtra) {
      for (const b of this.balloonsExtra) {
        b.ph += dt * b.spd;
        b.g.position.x = b.cx + Math.cos(b.ph) * 14;
        b.g.position.z = b.cz + Math.sin(b.ph * 0.8) * 12;
        b.g.position.y = b.h + Math.sin(this.time * 0.3 + b.ph * 4) * 1.6;
      }
    }
    if (this.balloon) {
      this.balloon.ph += dt * 0.05;
      const b = this.balloon;
      b.g.position.set(
        b.cx + Math.cos(b.ph) * 55,
        40 + Math.sin(this.time * 0.4) * 2.5,
        b.cz + Math.sin(b.ph) * 55
      );
    }
    if (playerPos) {
      this.followSun(playerPos.x, playerPos.z);
      if (this.snowMesh) this._updateSnowfall(dt, playerPos.x, playerPos.z);
      if (this.leafMesh) this._updateLeaffall(dt, playerPos.x, playerPos.z);
    }
  }
}
