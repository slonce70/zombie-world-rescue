// Процедурні мультяшні персонажі (стиль Fortnite-lite) + анімації
import * as THREE from 'three';

let gradMap = null;
function getGradMap() {
  if (!gradMap) {
    const data = new Uint8Array([110, 160, 215, 255]);
    gradMap = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
    gradMap.minFilter = THREE.NearestFilter;
    gradMap.magFilter = THREE.NearestFilter;
    gradMap.needsUpdate = true;
  }
  return gradMap;
}

const matCache = new Map();
export function toonMat(color, emissive = 0x000000, emissiveIntensity = 0) {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshToonMaterial({
      color, gradientMap: getGradMap(), emissive, emissiveIntensity,
    });
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// Кеш геометрій: однакові примітиви ділять одну BufferGeometry
const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
function capsule(r, len, mat, capSeg = 5, radSeg = 12) {
  return new THREE.Mesh(cachedGeo(`cap|${r}|${len}|${capSeg}|${radSeg}`, () => new THREE.CapsuleGeometry(r, len, capSeg, radSeg)), mat);
}
function sphere(r, mat, w = 16, h = 12) {
  return new THREE.Mesh(cachedGeo(`sph|${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h)), mat);
}
function box(w, h, d, mat) {
  return new THREE.Mesh(cachedGeo(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
}
function cone(r, h, mat, seg = 10) {
  return new THREE.Mesh(cachedGeo(`con|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat);
}
function cylinder(rT, rB, h, mat, seg = 12) {
  return new THREE.Mesh(cachedGeo(`cyl|${rT}|${rB}|${h}|${seg}`, () => new THREE.CylinderGeometry(rT, rB, h, seg)), mat);
}

// ============================================================
// Запікання: усі меші групи → один vertex-colored меш (1 draw call)
// ============================================================
let bakedMat = null;
function getBakedMat() {
  if (!bakedMat) {
    bakedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradMap() });
  }
  return bakedMat;
}

export function bakeGroupMeshes(group, { castShadow = false, receiveShadow = false } = {}) {
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) return null;
  const geos = [];
  let total = 0;
  const mat4 = new THREE.Matrix4();
  for (const mesh of meshes) {
    mesh.updateMatrix();
    mat4.copy(mesh.matrix);
    let p = mesh.parent;
    while (p && p !== group) {
      p.updateMatrix();
      mat4.premultiply(p.matrix);
      p = p.parent;
    }
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(mat4);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    const c = mesh.material.color;
    for (let i = 0; i < n; i++) {
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geos.push(g);
    total += n;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    col.set(g.attributes.color.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const mesh of meshes) mesh.parent.remove(mesh);
  const baked = new THREE.Mesh(mg, getBakedMat());
  baked.castShadow = castShadow;
  baked.receiveShadow = receiveShadow;
  group.add(baked);
  return baked;
}

const PART_NAMES = ['legL', 'legR', 'armL', 'armR', 'torso', 'head'];

// Запікає всі анімовані частини ріга (7 draw calls на персонажа)
export function bakeRig(rig, castAll = false) {
  for (const key of PART_NAMES) {
    const shadow = castAll || key === 'torso' || key === 'head';
    bakeGroupMeshes(rig.parts[key], { castShadow: shadow });
  }
  // прямі меші на тілі (плечі боса тощо)
  const direct = rig.body.children.filter((c) => c.isMesh);
  if (direct.length) {
    const g = new THREE.Group();
    g.name = 'extras';
    for (const m of direct) g.add(m);
    rig.body.add(g);
    bakeGroupMeshes(g, { castShadow: castAll });
  }
  return rig;
}

// Клон ріга-шаблона: ділить геометрії/матеріали, нова ієрархія та анімаційний стан
export function cloneRig(tpl) {
  const group = tpl.group.clone(true);
  const body = group.children.find((c) => c.name === 'body') || group.children[0];
  const parts = {};
  body.traverse((o) => {
    if (PART_NAMES.includes(o.name)) parts[o.name] = o;
  });
  return {
    group, body, parts,
    spec: tpl.spec, height: tpl.height, radius: tpl.radius, ztype: tpl.ztype,
    anim: { mode: 'idle', t: 0, phase: Math.random() * 6.28, speed: 0, attackT: -1, dieT: -1, aimPitch: 0 },
    base: tpl.base,
    dieSpin: (Math.random() - 0.5) * 0.8,
  };
}

// ============================================================
// Гуманоїд. Стоїть на y=0, дивиться у бік -Z.
// Конвенції: rotation.x > 0 — кінцівка вперед (-Z); тіло падає назад при rotation.x > 0.
// ============================================================
export function makeHumanoid(spec) {
  const s = Object.assign({
    scale: 1, skin: 0xffc9a3, shirt: 0x4a90d9, pants: 0x3b4252, shoes: 0x6b4f3a,
    belly: 1, headR: 0.27, armsForward: 0, lean: 0,
    eyeWhite: 0xffffff, eyeL: 0.062, eyeR: 0.062, pupilColor: 0x222222,
    brow: 0, browColor: 0x46342a, mouth: 'smile', mouthColor: 0x7a2c2c,
    teeth: false, tongue: false, nose: true, cast: 'some',
  }, spec);

  const root = new THREE.Group();
  const body = new THREE.Group(); // для бобу/падіння — обертається навколо ніг
  body.name = 'body';
  root.add(body);

  const skinM = toonMat(s.skin);
  const shirtM = toonMat(s.shirt);
  const pantsM = toonMat(s.pants);
  const shoesM = toonMat(s.shoes);

  const parts = {};
  const castAll = s.cast === 'all';

  // Ноги
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.name = side < 0 ? 'legL' : 'legR';
    g.position.set(0.14 * side, 0.92, 0);
    const leg = capsule(0.105, 0.5, pantsM);
    leg.position.y = -0.42;
    leg.castShadow = castAll;
    const foot = box(0.17, 0.12, 0.3, shoesM);
    foot.position.set(0, -0.84, -0.05);
    foot.castShadow = false;
    g.add(leg, foot);
    body.add(g);
    parts[side < 0 ? 'legL' : 'legR'] = g;
  }

  // Тулуб
  const torsoG = new THREE.Group();
  torsoG.name = 'torso';
  torsoG.position.y = 0.95;
  const torso = capsule(0.25, 0.42, shirtM);
  torso.position.y = 0.36;
  torso.scale.set(s.belly, 1, s.belly * 0.92);
  torso.castShadow = true;
  torsoG.add(torso);
  if (s.bellySkin) {
    const bel = sphere(0.26 * s.belly, skinM, 14, 10);
    bel.position.set(0, 0.2, -0.1 * s.belly);
    bel.scale.set(0.85, 0.7, 0.8);
    torsoG.add(bel);
  }
  body.add(torsoG);
  parts.torso = torsoG;

  // Руки
  const shoulderY = 1.52;
  const shoulderX = 0.25 * s.belly + 0.1;
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.name = side < 0 ? 'armL' : 'armR';
    g.position.set(shoulderX * side, shoulderY, 0);
    const arm = capsule(0.085, 0.46, s.sleeves === 'skin' ? skinM : shirtM);
    arm.position.y = -0.3;
    arm.castShadow = castAll;
    const hand = sphere(0.1, skinM, 12, 9);
    hand.position.y = -0.6;
    g.add(arm, hand);
    g.rotation.x = s.armsForward;
    body.add(g);
    parts[side < 0 ? 'armL' : 'armR'] = g;
  }

  // Голова
  const headG = new THREE.Group();
  headG.name = 'head';
  headG.position.y = 1.74;
  const head = sphere(s.headR, skinM, 20, 16);
  head.position.y = 0.14;
  head.castShadow = true;
  headG.add(head);

  // Обличчя (фронт = -Z)
  const fz = -s.headR + 0.045;
  const eyeWhiteM = toonMat(s.eyeWhite);
  const pupilM = toonMat(s.pupilColor);
  for (const side of [-1, 1]) {
    const er = side < 0 ? s.eyeL : s.eyeR;
    const eye = sphere(er, eyeWhiteM, 12, 9);
    eye.position.set(0.105 * side, 0.2, fz);
    const pupil = sphere(er * 0.45, pupilM, 8, 6);
    pupil.position.set(0.105 * side + (s.crossEyed ? -0.018 * side : 0), 0.2, fz - er * 0.75);
    headG.add(eye, pupil);
    if (s.brow !== 0) {
      const brow = box(0.11, 0.025, 0.03, toonMat(s.browColor));
      brow.position.set(0.105 * side, 0.2 + er + 0.035, fz - 0.02);
      brow.rotation.z = -s.brow * side;
      headG.add(brow);
    }
  }
  if (s.nose) {
    const nose = sphere(0.035, skinM, 8, 6);
    nose.position.set(0, 0.12, fz - 0.05);
    headG.add(nose);
  }
  const mouthM = toonMat(s.mouthColor);
  if (s.mouth === 'smile') {
    const m = box(0.14, 0.03, 0.02, mouthM);
    m.position.set(0, 0.02, fz - 0.02);
    headG.add(m);
  } else if (s.mouth === 'crooked') {
    const m = box(0.15, 0.055, 0.025, mouthM);
    m.position.set(0.03, 0.02, fz - 0.02);
    m.rotation.z = 0.25;
    headG.add(m);
    if (s.teeth) {
      const t1 = box(0.03, 0.035, 0.02, toonMat(0xfff7d6));
      t1.position.set(-0.02, 0.035, fz - 0.035);
      t1.rotation.z = 0.25;
      headG.add(t1);
    }
  } else if (s.mouth === 'open') {
    const m = sphere(0.06, mouthM, 10, 8);
    m.position.set(0, 0.0, fz - 0.01);
    m.scale.set(1, 1.25, 0.5);
    headG.add(m);
    if (s.teeth) {
      const t1 = box(0.025, 0.03, 0.02, toonMat(0xfff7d6));
      t1.position.set(-0.025, 0.045, fz - 0.04);
      headG.add(t1);
    }
  }
  if (s.tongue) {
    const tg = box(0.05, 0.11, 0.03, toonMat(0xe87a90));
    tg.position.set(0.04, -0.06, fz - 0.03);
    tg.rotation.x = 0.35;
    headG.add(tg);
  }
  body.add(headG);
  parts.head = headG;

  root.scale.setScalar(s.scale);

  const rig = {
    group: root, body, parts, spec: s,
    height: 2.1 * s.scale,
    radius: 0.42 * s.scale * Math.max(1, s.belly * 0.85),
    anim: { mode: 'idle', t: 0, phase: Math.random() * 6.28, speed: 0, attackT: -1, dieT: -1, aimPitch: 0 },
    base: {
      armL: s.armsForward, armR: s.armsForward,
      bodyRotX: s.lean, bodyY: 0,
    },
    dieSpin: (Math.random() - 0.5) * 0.8,
  };
  body.rotation.x = s.lean;
  return rig;
}

export function setAnim(rig, mode) {
  if (rig.anim.mode === mode) return;
  rig.anim.mode = mode;
  rig.anim.t = 0;
  if (mode === 'attack') rig.anim.attackT = 0;
  if (mode === 'die') rig.anim.dieT = 0;
}

const lerp_ = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function updateRig(rig, dt) {
  const a = rig.anim;
  const p = rig.parts;
  const b = rig.base;
  a.t += dt;

  let legL = 0, legR = 0, armL = b.armL, armR = b.armR;
  let bodyRotX = b.bodyRotX, bodyRotZ = 0, bodyY = 0, headRotZ = 0, headRotX = 0;

  switch (a.mode) {
    case 'idle': {
      a.phase += dt * 1.6;
      bodyRotZ = Math.sin(a.phase) * 0.025;
      armL += Math.sin(a.phase) * 0.06;
      armR += Math.sin(a.phase + 1.3) * 0.06;
      headRotZ = Math.sin(a.phase * 0.7) * 0.05;
      bodyY = Math.sin(a.phase * 2) * 0.01;
      break;
    }
    case 'walk':
    case 'run': {
      const spd = Math.max(0.5, a.speed);
      a.phase += dt * spd * (2.6 / Math.sqrt(rig.spec.scale));
      const amp = a.mode === 'run' ? 0.85 : 0.55;
      const sw = Math.sin(a.phase);
      legL = sw * amp;
      legR = -sw * amp;
      if (b.armL > 0.5) { // руки-вперед (зомбі)
        armL = b.armL + Math.sin(a.phase) * 0.15;
        armR = b.armR + Math.sin(a.phase + 2.5) * 0.15;
      } else {
        armL = -sw * amp * 0.7;
        armR = sw * amp * 0.7;
      }
      bodyY = Math.abs(Math.cos(a.phase)) * 0.05 * amp;
      bodyRotZ = Math.sin(a.phase) * (rig.spec.belly > 1.2 ? 0.09 : 0.03);
      headRotZ = Math.sin(a.phase) * 0.04;
      break;
    }
    case 'attack': {
      a.attackT += dt / 0.55;
      const t = Math.min(1, a.attackT);
      const raise = t < 0.4 ? lerp_(b.armL, 2.4, t / 0.4) : lerp_(2.4, 0.5, (t - 0.4) / 0.6);
      armL = raise;
      armR = raise * 0.95;
      bodyRotX = b.bodyRotX - Math.sin(t * Math.PI) * 0.3;
      a.phase += dt * 2;
      legL = Math.sin(a.phase) * 0.15;
      legR = -Math.sin(a.phase) * 0.15;
      break;
    }
    case 'die': {
      a.dieT += dt / 0.85;
      const t = Math.min(1, a.dieT);
      bodyRotX = b.bodyRotX + sstep(0, 0.75, t) * 1.62;
      bodyRotZ = sstep(0, 1, t) * rig.dieSpin;
      armL = b.armL + t * 1.2;
      armR = b.armR + t * 0.8;
      legL = t * 0.4;
      legR = -t * 0.3;
      break;
    }
    case 'cheer': {
      a.phase += dt * 7;
      armL = 2.9 + Math.sin(a.phase) * 0.25;
      armR = 2.9 + Math.sin(a.phase + 1) * 0.25;
      bodyY = Math.abs(Math.sin(a.phase * 0.5)) * 0.18;
      headRotZ = Math.sin(a.phase * 0.5) * 0.1;
      break;
    }
    case 'cower': {
      a.phase += dt * 22;
      bodyY = -0.3;
      bodyRotX = b.bodyRotX - 0.35;
      armL = 0.9; armR = 0.9;
      bodyRotZ = Math.sin(a.phase) * 0.02;
      legL = 0.5; legR = -0.4;
      break;
    }
    case 'aim': { // герой у виді від 3-ї особи зі зброєю
      const spd = Math.max(0.5, a.speed);
      if (a.speed > 0.3) {
        a.phase += dt * spd * 2.6;
        const amp = a.speed > 6 ? 0.8 : 0.5;
        const sw = Math.sin(a.phase);
        legL = sw * amp;
        legR = -sw * amp;
        bodyY = Math.abs(Math.cos(a.phase)) * 0.045 * amp;
      } else {
        a.phase += dt * 1.6;
        bodyY = Math.sin(a.phase * 2) * 0.008;
      }
      armR = 1.5 + a.aimPitch;
      armL = 1.25 + a.aimPitch * 0.8;
      headRotX = -a.aimPitch * 0.35;
      break;
    }
  }

  p.legL.rotation.x = legL;
  p.legR.rotation.x = legR;
  p.armL.rotation.x = armL;
  p.armR.rotation.x = armR;
  if (a.mode === 'aim') {
    p.armL.rotation.z = 0.55; // ліва рука підтримує зброю
    p.armR.rotation.z = -0.12;
  } else {
    p.armL.rotation.z = 0.07;
    p.armR.rotation.z = -0.07;
  }
  rig.body.rotation.x = bodyRotX;
  rig.body.rotation.z = bodyRotZ;
  rig.body.position.y = bodyY;
  p.head.rotation.z = headRotZ;
  p.head.rotation.x = headRotX;
}

// ============================================================
// Конкретні персонажі
// ============================================================
const ZOMBIE_SKINS = [0x7fc25c, 0x8ed068, 0x6cb050, 0x96d957];
const ZOMBIE_SHIRTS = [0x8d6bb8, 0x5a7fb0, 0x9c5d52, 0x607a4e, 0x7a6a8f];
const ZOMBIE_PANTS = [0x4a4458, 0x504a40, 0x3e4a55];

// Шаблони зомбі: 3 варіанти на тип, запечені один раз — нові зомбі клонуються
const zombieTemplates = new Map();
export function makeZombie(type, rng) {
  if (!zombieTemplates.has(type)) zombieTemplates.set(type, [null, null, null]);
  const arr = zombieTemplates.get(type);
  const idx = rng.int(0, 2);
  if (!arr[idx]) {
    const rig = buildZombie(type, rng);
    bakeRig(rig);
    arr[idx] = rig;
  }
  return cloneRig(arr[idx]);
}

function buildZombie(type, rng) {
  const skin = rng.pick(ZOMBIE_SKINS);
  const common = {
    skin,
    shirt: rng.pick(ZOMBIE_SHIRTS),
    pants: rng.pick(ZOMBIE_PANTS),
    shoes: 0x4a3b30,
    eyeWhite: 0xf2f7c8,
    eyeL: 0.085, eyeR: 0.055,
    pupilColor: 0x37474f,
    crossEyed: rng.chance(0.5),
    mouth: 'crooked', teeth: true,
    brow: 0.3,
    sleeves: 'skin',
    nose: false,
  };
  let rig;
  if (type === 'runner') {
    rig = makeHumanoid(Object.assign(common, {
      scale: 0.92, belly: 0.78, armsForward: 0.6, lean: -0.3,
      tongue: true, mouth: 'open',
    }));
  } else if (type === 'tank') {
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.35, belly: 1.65, armsForward: 0.9, headR: 0.22,
      bellySkin: true, eyeL: 0.055, eyeR: 0.075,
    }));
  } else { // walker
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.0, belly: 1.05, armsForward: 1.35,
    }));
  }
  // скуйовджене волосся-пасма
  const hairM = toonMat(0x3f5e30);
  const nTufts = rng.int(2, 4);
  for (let i = 0; i < nTufts; i++) {
    const tuft = box(0.07, 0.16, 0.07, hairM);
    tuft.position.set(rng.range(-0.15, 0.15), 0.36, rng.range(-0.12, 0.12));
    tuft.rotation.set(rng.range(-0.5, 0.5), 0, rng.range(-0.5, 0.5));
    rig.parts.head.add(tuft);
  }
  // латка на сорочці
  if (rng.chance(0.5)) {
    const patch = box(0.12, 0.12, 0.03, toonMat(0xc9a86a));
    patch.position.set(rng.range(-0.1, 0.1), 0.35, -0.26 * rig.spec.belly);
    patch.rotation.z = rng.range(-0.4, 0.4);
    rig.parts.torso.add(patch);
  }
  rig.ztype = type;
  return rig;
}

export function makeBoss() {
  const rig = makeHumanoid({
    scale: 2.7, belly: 1.7, armsForward: 0.9, headR: 0.24,
    skin: 0x5da045, shirt: 0x6b3548, pants: 0x3a3344, shoes: 0x2e2620,
    eyeWhite: 0xffd24a, eyeL: 0.075, eyeR: 0.075, pupilColor: 0xc62828,
    mouth: 'open', teeth: true, brow: 0.45, browColor: 0x2e4620,
    bellySkin: true, sleeves: 'skin', nose: false,
  });
  // маленька золота корона на величезній голові — кумедно і видно здалеку
  const gold = toonMat(0xffc933, 0xffa000, 0.25);
  const crown = new THREE.Group();
  const band = cylinder(0.14, 0.16, 0.09, gold, 10);
  crown.add(band);
  for (let i = 0; i < 5; i++) {
    const spike = cone(0.035, 0.1, gold, 6);
    const ang = (i / 5) * Math.PI * 2;
    spike.position.set(Math.cos(ang) * 0.13, 0.08, Math.sin(ang) * 0.13);
    crown.add(spike);
  }
  crown.position.set(0, 0.42, 0);
  crown.rotation.z = 0.12;
  rig.parts.head.add(crown);
  // шипи на плечах
  const spikeM = toonMat(0x4a4458);
  for (const side of [-1, 1]) {
    const pad = sphere(0.16, spikeM, 10, 8);
    pad.position.set(0.46 * side, 1.58, 0);
    pad.scale.set(1.2, 0.7, 1.2);
    rig.body.add(pad);
    const sp = cone(0.05, 0.16, spikeM, 6);
    sp.position.set(0.46 * side, 1.7, 0);
    rig.body.add(sp);
  }
  rig.ztype = 'boss';
  bakeRig(rig);
  return rig;
}

export function makeHero() {
  const rig = makeHumanoid({
    scale: 1.0, skin: 0xffc9a3, shirt: 0x2f80c3, pants: 0x474f63, shoes: 0x303642,
    eyeL: 0.058, eyeR: 0.058, mouth: 'smile', mouthColor: 0x8a4b3a,
    brow: -0.08, cast: 'all',
  });
  // кепка
  const capM = toonMat(0xff8c42);
  const capTop = sphere(0.275, capM, 16, 10);
  capTop.position.y = 0.2;
  capTop.scale.set(1, 0.62, 1);
  const brim = box(0.3, 0.035, 0.18, capM);
  brim.position.set(0, 0.26, -0.3);
  rig.parts.head.add(capTop, brim);
  // рюкзак
  const packM = toonMat(0x55a04b);
  const pack = box(0.34, 0.4, 0.16, packM);
  pack.position.set(0, 0.34, 0.3);
  rig.parts.torso.add(pack);
  const pocket = box(0.2, 0.16, 0.05, toonMat(0x3d7a36));
  pocket.position.set(0, 0.24, 0.4);
  rig.parts.torso.add(pocket);
  // пояс
  const belt = cylinder(0.27, 0.27, 0.07, toonMat(0x6b4f3a), 14);
  belt.position.y = 0.05;
  rig.parts.torso.add(belt);
  bakeRig(rig, true);
  return rig;
}

const CIV_SHIRTS = [0xe2725b, 0x6fa8dc, 0xc99fd1, 0xf2c14e];
const CIV_SKINS = [0xffc9a3, 0xf2b48c, 0xffd9b8];

export function makeCivilian(kind, rng) {
  if (kind === 'medic') {
    const rig = makeHumanoid({
      skin: rng.pick(CIV_SKINS), shirt: 0xf5f5f5, pants: 0xd84f4f, shoes: 0xffffff,
      mouth: 'smile', brow: -0.05,
    });
    // червоний хрест на грудях
    const redM = toonMat(0xd32f2f);
    const c1 = box(0.06, 0.18, 0.02, redM);
    c1.position.set(0, 0.4, -0.255);
    const c2 = box(0.18, 0.06, 0.02, redM);
    c2.position.set(0, 0.4, -0.255);
    rig.parts.torso.add(c1, c2);
    // біла шапочка
    const capM = toonMat(0xffffff);
    const cap = cylinder(0.2, 0.24, 0.1, capM, 12);
    cap.position.y = 0.38;
    const cr1 = box(0.04, 0.1, 0.02, redM);
    cr1.position.set(0, 0.38, -0.225);
    rig.parts.head.add(cap, cr1);
    rig.civKind = 'medic';
    bakeRig(rig);
    return rig;
  }
  if (kind === 'granny') {
    const rig = makeHumanoid({
      skin: 0xf2b48c, shirt: 0x8d6bb8, pants: 0x5d4a66, shoes: 0x46342a,
      mouth: 'smile', scale: 0.94,
    });
    // хустинка
    const scarfM = toonMat(0xe2c044);
    const scarf = sphere(0.3, scarfM, 14, 10);
    scarf.position.y = 0.18;
    scarf.scale.set(1.02, 0.9, 1.02);
    scarf.position.z = 0.03;
    rig.parts.head.add(scarf);
    const knot = box(0.08, 0.12, 0.06, scarfM);
    knot.position.set(0, -0.05, -0.24);
    rig.parts.head.add(knot);
    rig.civKind = 'granny';
    bakeRig(rig);
    return rig;
  }
  // дитина
  const rig = makeHumanoid({
    skin: rng.pick(CIV_SKINS), shirt: rng.pick(CIV_SHIRTS), pants: 0x4a6da7, shoes: 0xd9d9d9,
    scale: 0.68, headR: 0.32, mouth: 'smile',
  });
  const hairM = toonMat(0x6b4f3a);
  const hair = sphere(0.33, hairM, 14, 10);
  hair.position.y = 0.22;
  hair.scale.set(1, 0.55, 1);
  rig.parts.head.add(hair);
  rig.civKind = 'kid';
  bakeRig(rig);
  return rig;
}

// ============================================================
// Зброя. Ствол уздовж -Z, muzzle — точка вильоту.
// ============================================================
export function makeGunMesh(kind) {
  const g = new THREE.Group();
  const darkM = toonMat(0x3a4252);
  const midM = toonMat(0x71819c);
  const lightM = toonMat(0x99a8c2);
  const accentM = toonMat(0xff8c42, 0xcc5500, 0.15);
  const muzzle = new THREE.Object3D();
  if (kind === 'rifle') {
    const body = box(0.07, 0.1, 0.55, midM);
    body.position.z = -0.15;
    const topRail = box(0.05, 0.025, 0.45, lightM);
    topRail.position.set(0, 0.06, -0.15);
    const barrel = cylinder(0.022, 0.022, 0.3, darkM, 10);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.55);
    const tip = cylinder(0.036, 0.036, 0.08, accentM, 10);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0, 0.015, -0.69);
    const stock = box(0.055, 0.12, 0.2, darkM);
    stock.position.set(0, -0.025, 0.2);
    const stockPad = box(0.06, 0.13, 0.04, accentM);
    stockPad.position.set(0, -0.025, 0.3);
    const mag = box(0.05, 0.16, 0.09, accentM);
    mag.position.set(0, -0.12, -0.12);
    mag.rotation.x = 0.18;
    const grip = box(0.05, 0.12, 0.06, darkM);
    grip.position.set(0, -0.1, 0.05);
    grip.rotation.x = -0.3;
    const sightF = box(0.02, 0.045, 0.03, darkM);
    sightF.position.set(0, 0.095, -0.36);
    const sightR = box(0.045, 0.04, 0.03, darkM);
    sightR.position.set(0, 0.095, 0.04);
    g.add(body, topRail, barrel, tip, stock, stockPad, mag, grip, sightF, sightR);
    muzzle.position.set(0, 0.015, -0.74);
  } else {
    const slide = box(0.06, 0.09, 0.28, midM);
    slide.position.z = -0.06;
    const slideTop = box(0.05, 0.028, 0.26, lightM);
    slideTop.position.set(0, 0.052, -0.06);
    const tip = box(0.064, 0.06, 0.05, accentM);
    tip.position.set(0, 0.005, -0.21);
    const grip = box(0.055, 0.16, 0.09, darkM);
    grip.position.set(0, -0.1, 0.04);
    grip.rotation.x = -0.22;
    const gripPanel = box(0.062, 0.1, 0.06, accentM);
    gripPanel.position.set(0, -0.09, 0.045);
    gripPanel.rotation.x = -0.22;
    const guard = box(0.03, 0.02, 0.08, darkM);
    guard.position.set(0, -0.055, -0.02);
    const sightF = box(0.016, 0.03, 0.02, darkM);
    sightF.position.set(0, 0.075, -0.18);
    const sightR = box(0.04, 0.026, 0.02, darkM);
    sightR.position.set(0, 0.073, 0.06);
    g.add(slide, slideTop, tip, grip, gripPanel, guard, sightF, sightR);
    muzzle.position.set(0, 0.02, -0.24);
  }
  g.add(muzzle);
  return { group: g, muzzle };
}

// Руки від першої особи (кріпляться до камери)
export function makeFPArms(gunKind) {
  const g = new THREE.Group();
  const skinM = toonMat(0xffc9a3);
  const sleeveM = toonMat(0x2f80c3);
  const gun = makeGunMesh(gunKind);
  gun.group.position.set(0, 0, 0);
  g.add(gun.group);
  // права рука тримає руків'я
  const armR = capsule(0.055, 0.3, sleeveM);
  armR.rotation.x = Math.PI / 2 - 0.45;
  armR.rotation.z = -0.35;
  armR.position.set(0.1, -0.18, 0.22);
  const handR = sphere(0.06, skinM, 10, 8);
  handR.position.set(0.005, -0.09, 0.05);
  // ліва рука підтримує цівку
  const armL = capsule(0.055, 0.28, sleeveM);
  armL.rotation.x = Math.PI / 2 - 0.25;
  armL.rotation.z = 0.5;
  armL.position.set(-0.12, -0.2, gunKind === 'rifle' ? -0.1 : 0.1);
  const handL = sphere(0.07, skinM, 10, 8);
  handL.position.set(-0.025, -0.085, gunKind === 'rifle' ? -0.24 : 0.0);
  g.add(armR, handR, armL, handL);
  return { group: g, muzzle: gun.muzzle };
}
