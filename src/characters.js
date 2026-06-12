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

export function bakeGroupMeshes(group, { castShadow = false, receiveShadow = false, outline = 0 } = {}) {
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
  // 🖍️ мультяшна обводка: вивернута роздута копія в ТІЙ САМІЙ геометрії —
  // жодного зайвого draw call, лише трохи вершин
  const copies = outline > 0 ? 2 : 1;
  const pos = new Float32Array(total * 3 * copies);
  const nor = new Float32Array(total * 3 * copies);
  const col = new Float32Array(total * 3 * copies);
  let off = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    nor.set(g.attributes.normal.array, off * 3);
    col.set(g.attributes.color.array, off * 3);
    off += g.attributes.position.count;
    g.dispose();
  }
  if (outline > 0) {
    const base = total * 3;
    for (let t = 0; t < total; t += 3) {
      // обернений порядок вершин трикутника → видно лише «зсередини» (inverted hull)
      for (let k = 0; k < 3; k++) {
        const src = (t + (k === 1 ? 2 : k === 2 ? 1 : 0)) * 3;
        const dst = base + (t + k) * 3;
        pos[dst] = pos[src] + nor[src] * outline;
        pos[dst + 1] = pos[src + 1] + nor[src + 1] * outline;
        pos[dst + 2] = pos[src + 2] + nor[src + 2] * outline;
        nor[dst] = -nor[src];
        nor[dst + 1] = -nor[src + 1];
        nor[dst + 2] = -nor[src + 2];
        col[dst] = 0.045; col[dst + 1] = 0.045; col[dst + 2] = 0.06;
      }
    }
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
  const outline = 0.028 / Math.max(0.7, rig.spec ? rig.spec.scale : 1); // у світі ~3см
  for (const key of PART_NAMES) {
    const shadow = castAll || key === 'torso' || key === 'head';
    bakeGroupMeshes(rig.parts[key], { castShadow: shadow, outline });
  }
  // прямі меші на тілі (плечі боса, кулі сніговика тощо)
  const direct = rig.body.children.filter((c) => c.isMesh);
  if (direct.length) {
    const g = new THREE.Group();
    g.name = 'extras';
    for (const m of direct) g.add(m);
    rig.body.add(g);
    bakeGroupMeshes(g, { castShadow: true, outline });
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
    spec: tpl.spec, height: tpl.height, radius: tpl.radius, ztype: tpl.ztype, kind: tpl.kind,
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
    const sole = box(0.19, 0.045, 0.33, toonMat(0x2a2622));
    sole.position.set(0, -0.92, -0.05);
    g.add(leg, foot, sole);
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
    const cuff = cylinder(0.095, 0.095, 0.06, s.sleeves === 'skin' ? skinM : shirtM, 10);
    cuff.position.y = -0.52;
    const hand = sphere(0.105, skinM, 12, 9);
    hand.position.y = -0.6;
    g.add(arm, cuff, hand);
    g.rotation.x = s.armsForward;
    body.add(g);
    parts[side < 0 ? 'armL' : 'armR'] = g;
  }

  // Голова (з шиєю)
  const headG = new THREE.Group();
  headG.name = 'head';
  headG.position.y = 1.74;
  const neck = cylinder(0.09, 0.11, 0.14, skinM, 10);
  neck.position.y = -0.06;
  headG.add(neck);
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
    const glint = sphere(er * 0.16, eyeWhiteM, 6, 5);
    glint.position.set(0.105 * side + er * 0.16, 0.2 + er * 0.2, fz - er * 0.95);
    headG.add(eye, pupil, glint);
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
  if (rig.kind === 'snowman') {
    updateSnowmanRig(rig, dt);
    return;
  }
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
      // нахил уперед на бігу — динаміка!
      bodyRotX = b.bodyRotX + (a.mode === 'run' ? 0.14 : 0.05);
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
    case 'dance': { // 💃 емоції-танці героя
      const style = a.danceStyle || 'shuffle';
      a.phase += dt * 9;
      const ph = a.phase;
      if (style === 'shuffle') {
        // класичний денс: ноги човгають, руки махають навхрест
        legL = Math.sin(ph) * 0.5;
        legR = -Math.sin(ph) * 0.5;
        armL = 0.6 + Math.sin(ph) * 0.9;
        armR = 0.6 - Math.sin(ph) * 0.9;
        bodyY = Math.abs(Math.sin(ph)) * 0.09;
        headRotZ = Math.sin(ph * 0.5) * 0.12;
      } else if (style === 'spin') {
        // дзиґа: руки в боки, обертання робить Player
        armL = 0.4; armR = 0.4;
        a.armLZ = 1.45; a.armRZ = -1.45;
        bodyY = Math.abs(Math.sin(ph * 0.7)) * 0.07;
      } else if (style === 'robot') {
        // робот: різкі квантовані пози
        const q = Math.floor(ph * 0.7) % 4;
        const poses = [
          [1.6, 0.2, 0.2, -1.1], [0.2, 1.6, 1.1, -0.2],
          [1.6, 1.6, 0.6, -0.6], [0.2, 0.2, 0.1, -0.1],
        ];
        [armL, armR] = [poses[q][0], poses[q][1]];
        a.armLZ = poses[q][2]; a.armRZ = poses[q][3];
        headRotZ = (q % 2 ? 0.18 : -0.18);
        bodyY = 0;
      } else if (style === 'wave') {
        // хвиля: руки котять хвилю, тіло гойдається
        armL = 1.5 + Math.sin(ph) * 0.5;
        armR = 1.5 + Math.sin(ph + 1.6) * 0.5;
        a.armLZ = 0.8 + Math.sin(ph + 0.8) * 0.4;
        a.armRZ = -0.8 + Math.sin(ph + 2.4) * 0.4;
        bodyRotZ = Math.sin(ph * 0.5) * 0.12;
        headRotZ = Math.sin(ph * 0.5 + 0.5) * 0.12;
      } else if (style === 'jump') {
        // стрибунець: радісні підскоки, руки вгору
        const j = Math.abs(Math.sin(ph * 0.8));
        bodyY = j * 0.3;
        armL = 2.6 + Math.sin(ph) * 0.3;
        armR = 2.6 + Math.cos(ph) * 0.3;
        legL = j * 0.5; legR = j * 0.5;
      } else if (style === 'chicken') {
        // курча: лікті-крильця плескають, голова дзьобає
        armL = 0.4; armR = 0.4;
        a.armLZ = 1.1 + Math.sin(ph * 1.4) * 0.55;
        a.armRZ = -1.1 - Math.sin(ph * 1.4) * 0.55;
        headRotX = 0.25 + Math.sin(ph * 1.4) * 0.25;
        legL = Math.sin(ph * 0.7) * 0.3;
        legR = -Math.sin(ph * 0.7) * 0.3;
        bodyY = Math.abs(Math.sin(ph * 0.7)) * 0.05;
      }
      break;
    }
    case 'ride': { // 🛴 на самокаті: стоїть на дошці, руки на кермі
      const steer = a.steer || 0;
      legL = 0.45;  // передня нога
      legR = -0.2;  // задня нога
      armL = 1.1 - steer * 0.15;
      armR = 1.1 + steer * 0.15;
      a.armLZ = 0.3; a.armRZ = -0.3;
      bodyRotZ = -steer * 0.16;
      bodyRotX = b.bodyRotX - 0.06;
      headRotZ = -steer * 0.1;
      a.phase += dt * 2;
      bodyY = Math.sin(a.phase) * 0.008;
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
        bodyRotX = b.bodyRotX + (a.speed > 6 ? 0.1 : 0.04);
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
  } else if ((a.mode === 'dance' || a.mode === 'ride') && a.armLZ !== undefined) {
    p.armL.rotation.z = a.armLZ;
    p.armR.rotation.z = a.armRZ;
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
    if (rig._postBake) rig._postBake(rig);
    arr[idx] = rig;
  }
  return cloneRig(arr[idx]);
}

// ============================================================
// Сніговик-зомбі: кидає сніжки, тане при смерті
// ============================================================
function buildSnowman(rng) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  root.add(body);
  // прохолодніший за сніг на землі — щоб силует читався на білому
  const snowM = toonMat(0xd6e2ef);
  const coalM = toonMat(0x232a30);

  const bottom = sphere(0.46, snowM, 16, 12);
  bottom.position.y = 0.45;
  bottom.castShadow = true;
  const middle = sphere(0.34, snowM, 14, 10);
  middle.position.y = 1.02;
  middle.castShadow = true;
  body.add(bottom, middle);
  // вуглинки-ґудзики
  for (let i = 0; i < 3; i++) {
    const btn = sphere(0.04, coalM, 6, 5);
    btn.position.set(0, 0.85 + i * 0.17, -0.31);
    body.add(btn);
  }
  // шарф
  const scarfM = toonMat(rng.pick([0xd84f4f, 0x8d6bb8, 0x4a8ad4]));
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 8, 16), scarfM);
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.32;
  const scarfTail = box(0.12, 0.3, 0.05, scarfM);
  scarfTail.position.set(0.14, 1.16, -0.22);
  scarfTail.rotation.z = 0.2;
  body.add(scarf, scarfTail);

  // голова
  const headG = new THREE.Group();
  headG.name = 'head';
  headG.position.y = 1.5;
  const head = sphere(0.27, snowM, 16, 12);
  head.position.y = 0.12;
  head.castShadow = true;
  headG.add(head);
  // зомбі-очі: одна вуглинка, одне зелене світяче
  const eye1 = sphere(0.05, coalM, 6, 5);
  eye1.position.set(-0.1, 0.18, -0.23);
  const eye2 = sphere(0.065, toonMat(0x7fff6a, 0x44ff22, 0.7), 8, 6);
  eye2.position.set(0.1, 0.18, -0.22);
  headG.add(eye1, eye2);
  // морква (трохи погризена — коротка)
  const nose = cone(0.05, 0.22, toonMat(0xff8c42), 8);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.1, -0.33);
  headG.add(nose);
  // кривий рот з вуглинок
  for (let i = 0; i < 4; i++) {
    const m = sphere(0.025, coalM, 5, 4);
    m.position.set(-0.09 + i * 0.06, -0.02 + Math.sin(i * 2) * 0.025, -0.24);
    headG.add(m);
  }
  // відерце на голові
  const bucket = cylinder(0.19, 0.24, 0.22, toonMat(0x46506b), 10);
  bucket.position.set(0.05, 0.38, 0);
  bucket.rotation.z = -0.25;
  headG.add(bucket);
  body.add(headG);

  // руки-гілки
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.name = side < 0 ? 'armL' : 'armR';
    g.position.set(0.3 * side, 1.1, 0);
    const stickM = toonMat(0x6b4a2a);
    const stick = cylinder(0.025, 0.035, 0.55, stickM, 6);
    stick.position.set(side * 0.22, 0.05, 0);
    stick.rotation.z = side * 1.25;
    const twig = cylinder(0.018, 0.022, 0.2, stickM, 5);
    twig.position.set(side * 0.4, 0.18, 0);
    twig.rotation.z = side * 0.5;
    g.add(stick, twig);
    body.add(g);
  }
  // порожні "ноги" для сумісності з апдейтером
  for (const n of ['legL', 'legR']) {
    const g = new THREE.Group();
    g.name = n;
    body.add(g);
  }
  const rig = {
    group: root, body,
    parts: {
      torso: body.children.find((c) => c.name === 'body') || body, head: headG,
      armL: body.children.find((c) => c.name === 'armL'),
      armR: body.children.find((c) => c.name === 'armR'),
      legL: body.children.find((c) => c.name === 'legL'),
      legR: body.children.find((c) => c.name === 'legR'),
    },
    spec: { scale: 1 },
    height: 1.95, radius: 0.5,
    anim: { mode: 'idle', t: 0, phase: Math.random() * 6.28, speed: 0, attackT: -1, dieT: -1, aimPitch: 0 },
    base: { armL: 0, armR: 0, bodyRotX: 0, bodyY: 0 },
    dieSpin: (Math.random() - 0.5) * 0.8,
    kind: 'snowman', ztype: 'snowman',
  };
  // торс — фіктивна група (анімуємо body напряму), але названа для клонування
  rig.parts.torso = new THREE.Group();
  rig.parts.torso.name = 'torso';
  body.add(rig.parts.torso);
  return rig;
}

function updateSnowmanRig(rig, dt) {
  const a = rig.anim;
  a.t += dt;
  const p = rig.parts;
  let bodyRotZ = 0, bodyRotX = 0, bodyY = 0;
  let armL = -0.15, armR = -0.15, headRotZ = 0;
  switch (a.mode) {
    case 'idle':
      a.phase += dt * 1.4;
      bodyRotZ = Math.sin(a.phase) * 0.04;
      headRotZ = Math.sin(a.phase * 0.8) * 0.08;
      break;
    case 'walk':
    case 'run': {
      a.phase += dt * Math.max(1.5, a.speed) * 2.2;
      bodyRotZ = Math.sin(a.phase) * 0.14; // перевалюється з боку на бік
      bodyRotX = -0.08;
      bodyY = Math.abs(Math.sin(a.phase)) * 0.07;
      armL = -0.15 + Math.sin(a.phase) * 0.2;
      armR = -0.15 - Math.sin(a.phase) * 0.2;
      headRotZ = -bodyRotZ * 0.6;
      break;
    }
    case 'attack': {
      a.attackT += dt / 0.55;
      const t = Math.min(1, a.attackT);
      // замах назад і кидок уперед
      if (t < 0.45) {
        bodyRotX = lerp_(0, 0.3, t / 0.45);
        armR = lerp_(-0.15, -1.6, t / 0.45);
      } else {
        bodyRotX = lerp_(0.3, -0.35, (t - 0.45) / 0.55);
        armR = lerp_(-1.6, 1.8, (t - 0.45) / 0.55);
      }
      armL = -0.4;
      break;
    }
    case 'die': {
      a.dieT += dt / 0.9;
      const t = Math.min(1, a.dieT);
      // тане: тіло сплющується, голова скочується
      rig.body.scale.set(1 + t * 0.45, Math.max(0.25, 1 - t * 0.6), 1 + t * 0.45);
      p.head.position.y = 1.5 + 1.1 * t - 2.6 * t * t;
      p.head.position.z = -t * 0.9;
      p.head.rotation.x = -t * 1.8;
      armL = -1.2 * t;
      armR = 1.2 * t;
      break;
    }
  }
  rig.body.rotation.z = bodyRotZ;
  rig.body.rotation.x = bodyRotX;
  rig.body.position.y = bodyY;
  if (p.armL) p.armL.rotation.x = armL;
  if (p.armR) p.armR.rotation.x = armR;
  p.head.rotation.z = headRotZ;
}

// ============================================================
// Щит щитоносця: металеві двері з тріщинами (2 стадії пошкоджень).
// НЕ запікається — кріпиться до клона після spawn, щоб тріщини були індивідуальні.
// ============================================================
// Шаблон будується один раз і запікається у 3 меші (основа + 2 стадії тріщин),
// клонується на кожного щитоносця — інакше 20 щитів = сотні draw calls.
let shieldTpl = null;
function buildShieldTpl() {
  const base = new THREE.Group();
  const steelM = toonMat(0x7d8aa0);
  const rimM = toonMat(0x55617a);
  const plate = box(1.15, 1.45, 0.09, steelM);
  base.add(plate);
  // окантовка
  for (const sy of [-0.69, 0.69]) {
    const rim = box(1.2, 0.1, 0.11, rimM);
    rim.position.y = sy;
    base.add(rim);
  }
  for (const sx of [-0.55, 0.55]) {
    const rim = box(0.1, 1.45, 0.11, rimM);
    rim.position.x = sx;
    base.add(rim);
  }
  // заклепки
  const rivetM = toonMat(0xb8c4d4);
  for (const [rx, ry] of [[-0.45, 0.58], [0.45, 0.58], [-0.45, -0.58], [0.45, -0.58]]) {
    const rivet = sphere(0.04, rivetM, 6, 5);
    rivet.position.set(rx, ry, -0.06);
    base.add(rivet);
  }
  // знак "СТОП-рука" по центру (кумедний)
  const sign = cylinder(0.22, 0.22, 0.02, toonMat(0xd84f4f), 12);
  sign.rotation.x = Math.PI / 2;
  sign.position.z = -0.06;
  base.add(sign);
  const palm = box(0.12, 0.18, 0.02, toonMat(0xf5efe0));
  palm.position.z = -0.075;
  base.add(palm);
  bakeGroupMeshes(base, { castShadow: true });
  // тріщини: стадія 1 (з'являються при 2/3 міцності)
  const crackM = toonMat(0x2a3138);
  const cracks1 = new THREE.Group();
  cracks1.name = 'cracks1';
  for (const [cx, cy, rot, len] of [[-0.2, 0.3, 0.6, 0.5], [0.05, 0.12, -0.3, 0.4], [-0.35, -0.1, 1.2, 0.35]]) {
    const c = box(len, 0.035, 0.02, crackM);
    c.position.set(cx, cy, -0.057);
    c.rotation.z = rot;
    cracks1.add(c);
  }
  bakeGroupMeshes(cracks1);
  // тріщини: стадія 2 (1/3 — щит ледь тримається)
  const cracks2 = new THREE.Group();
  cracks2.name = 'cracks2';
  for (const [cx, cy, rot, len] of [[0.25, -0.3, 0.9, 0.55], [0.1, 0.45, -0.8, 0.45], [-0.1, -0.5, 0.25, 0.5], [0.38, 0.25, 1.4, 0.35], [-0.3, 0.55, -1.1, 0.3]]) {
    const c = box(len, 0.04, 0.02, crackM);
    c.position.set(cx, cy, -0.06);
    c.rotation.z = rot;
    cracks2.add(c);
  }
  bakeGroupMeshes(cracks2);
  // тріщини: стадія 3 (щит от-от розлетиться — павутина по всій площі)
  const cracks3 = new THREE.Group();
  cracks3.name = 'cracks3';
  for (const [cx, cy, rot, len] of [[0, 0, 0.45, 0.9], [-0.15, 0.2, -1.2, 0.7], [0.3, 0.5, 0.2, 0.5], [-0.4, -0.4, -0.5, 0.6], [0.2, -0.55, 1.1, 0.45], [-0.45, 0.45, 0.85, 0.4], [0.45, -0.05, -0.95, 0.5]]) {
    const c = box(len, 0.045, 0.02, crackM);
    c.position.set(cx, cy, -0.062);
    c.rotation.z = rot;
    cracks3.add(c);
  }
  bakeGroupMeshes(cracks3);
  const g = new THREE.Group();
  g.add(base, cracks1, cracks2, cracks3);
  return g;
}

export function makeShieldMesh() {
  if (!shieldTpl) shieldTpl = buildShieldTpl();
  const g = shieldTpl.clone(true);
  const cracks1 = g.children.find((c) => c.name === 'cracks1');
  const cracks2 = g.children.find((c) => c.name === 'cracks2');
  const cracks3 = g.children.find((c) => c.name === 'cracks3');
  cracks1.visible = false;
  cracks2.visible = false;
  cracks3.visible = false;
  return { group: g, cracks1, cracks2, cracks3 };
}

function buildZombie(type, rng) {
  if (type === 'snowman') return buildSnowman(rng);
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
  // пошарпаність: латки на одязі і чубчик волосся — додаються після збирання
  const addZombieWear = (r) => {
    const patchM = toonMat(0x3a3430);
    for (let i = 0; i < 2; i++) {
      const patch = box(0.12 + rng.next() * 0.08, 0.1 + rng.next() * 0.06, 0.03, patchM);
      patch.position.set(rng.range(-0.16, 0.16), rng.range(0.18, 0.5), rng.chance(0.5) ? -0.26 : 0.24);
      patch.rotation.z = rng.range(-0.5, 0.5);
      r.parts.torso.add(patch);
    }
    const tuft = box(0.06, 0.09, 0.05, toonMat(0x4a5a3a));
    tuft.position.set(rng.range(-0.1, 0.1), 0.4, rng.range(-0.05, 0.05));
    tuft.rotation.z = rng.range(-0.4, 0.4);
    r.parts.head.add(tuft);
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
  } else if (type === 'shield') {
    // щитоносець: кремезний будівельник з каскою, руки тримають щит
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.12, belly: 1.3, armsForward: 1.05, headR: 0.25,
      shirt: 0xc97f2f, pants: 0x3e4a55,
      eyeL: 0.07, eyeR: 0.07, brow: 0.45,
    }));
    // будівельна каска
    const helmM = toonMat(0xffd23f);
    const helm = sphere(0.27, helmM, 14, 10);
    helm.position.y = 0.24;
    helm.scale.set(1.05, 0.7, 1.05);
    const brim = cylinder(0.3, 0.32, 0.04, helmM, 14);
    brim.position.y = 0.18;
    rig.parts.head.add(helm, brim);
  } else if (type === 'spitter') {
    // плювака: худий, отруйно-зелений, з величезним ротом
    rig = makeHumanoid(Object.assign(common, {
      scale: 0.98, belly: 0.7, armsForward: 0.45, lean: -0.18,
      skin: 0xa3d94e, shirt: 0x4a6e3a, headR: 0.3,
      eyeL: 0.095, eyeR: 0.06, eyeWhite: 0xe8ffc8, pupilColor: 0x2e5a1e,
      mouth: 'open', teeth: false, tongue: true, brow: 0.5,
    }));
    // роздутий зоб з отрутою
    const sacM = toonMat(0xc4e86a, 0x86d14e, 0.35);
    const sac = sphere(0.16, sacM, 10, 8);
    sac.position.set(0, -0.08, -0.18);
    sac.scale.set(1, 1.2, 0.9);
    rig.parts.head.add(sac);
    // крапля отрути на підборідді
    const drip = cone(0.04, 0.1, sacM, 6);
    drip.rotation.x = Math.PI;
    drip.position.set(0.06, -0.18, -0.22);
    rig.parts.head.add(drip);
  } else if (type === 'gunner') {
    // 🔫 стрілець: хитрий зомбі з кепкою і пістолетом
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.0, belly: 0.85, armsForward: 0.9, lean: -0.08,
      shirt: 0x5a7fb0, eyeL: 0.06, eyeR: 0.08, brow: 0.4,
    }));
    // кепка задом наперед
    const capM = toonMat(0x3e4a55);
    const capTop = sphere(0.27, capM, 14, 10);
    capTop.position.y = 0.21;
    capTop.scale.set(1, 0.6, 1);
    const brim = box(0.28, 0.035, 0.17, capM);
    brim.position.set(0, 0.25, 0.29); // козирок назад!
    rig.parts.head.add(capTop, brim);
    // пістолет у правій руці
    const gunM = toonMat(0x4a5160);
    const barrel = box(0.07, 0.07, 0.3, gunM);
    barrel.position.set(0, -0.62, -0.18);
    const grip = box(0.06, 0.16, 0.08, toonMat(0x33271c));
    grip.position.set(0, -0.66, -0.02);
    rig.parts.armR.add(barrel, grip);
  } else if (type === 'ironclad') {
    // 🦾 броньовик: кремезний, повільний, у залізному нагруднику (чіпляється після запікання)
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.22, belly: 1.45, armsForward: 0.85, headR: 0.24,
      shirt: 0x4a4458, eyeL: 0.06, eyeR: 0.06, brow: 0.5,
    }));
    // нагрудник додаємо ПІСЛЯ bakeRig окремими групами — щоб ламався на клонах
    rig._postBake = (r) => {
      const ironM = toonMat(0x5d6a80);
      const trimM = toonMat(0x8a96aa);
      const plate = new THREE.Group();
      plate.name = 'chestPlate';
      const front = box(0.56, 0.62, 0.13, ironM);
      front.position.set(0, 0.34, -0.3);
      const backP = box(0.56, 0.62, 0.11, ironM);
      backP.position.set(0, 0.34, 0.28);
      plate.add(front, backP);
      const ridge = box(0.1, 0.6, 0.04, trimM);
      ridge.position.set(0, 0.34, -0.37);
      plate.add(ridge);
      for (const side of [-1, 1]) {
        const shoulder = box(0.16, 0.1, 0.42, trimM);
        shoulder.position.set(side * 0.24, 0.62, 0);
        plate.add(shoulder);
      }
      for (const [rx, ry] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, 0.16], [0.2, 0.16]]) {
        const rivet = sphere(0.035, trimM, 6, 5);
        rivet.position.set(rx, ry, -0.37);
        plate.add(rivet);
      }
      bakeGroupMeshes(plate, { castShadow: true });
      // тріщини нагрудника (2 стадії)
      const crackM = toonMat(0x232830);
      const mkCracks = (name, list) => {
        const g = new THREE.Group();
        g.name = name;
        for (const [cx, cy, rot, len] of list) {
          const c = box(len, 0.03, 0.02, crackM);
          c.position.set(cx, cy, -0.375);
          c.rotation.z = rot;
          g.add(c);
        }
        bakeGroupMeshes(g);
        g.visible = false;
        return g;
      };
      const cr1 = mkCracks('chestCracks1', [[-0.12, 0.42, 0.5, 0.25], [0.1, 0.26, -0.4, 0.22], [-0.16, 0.18, 1.1, 0.2]]);
      const cr2 = mkCracks('chestCracks2', [[0.14, 0.45, 0.9, 0.3], [0, 0.3, -0.9, 0.3], [-0.1, 0.5, 0.2, 0.26], [0.16, 0.14, 1.3, 0.22]]);
      r.parts.torso.add(plate, cr1, cr2);
    };
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
  addZombieWear(rig);
  return rig;
}

const BOSS_SPECS = {
  king: {
    skin: 0x5da045, shirt: 0x6b3548, pants: 0x3a3344, shoes: 0x2e2620,
    eyeWhite: 0xffd24a, pupilColor: 0xc62828, browColor: 0x2e4620,
  },
  frost: {
    skin: 0x8fd0d8, shirt: 0x3a5a8c, pants: 0x2e3a55, shoes: 0x223044,
    eyeWhite: 0xd9f4ff, pupilColor: 0x1a4a8a, browColor: 0x2e4a60,
  },
  iron: {
    skin: 0x9aa3ad, shirt: 0x4a5160, pants: 0x37404f, shoes: 0x2a3138,
    eyeWhite: 0xffb84a, pupilColor: 0xb33a1e, browColor: 0x37404f,
  },
  chef: {
    skin: 0x9fce62, shirt: 0xf2efe4, pants: 0x46506b, shoes: 0x2e2620,
    eyeWhite: 0xfff4d6, pupilColor: 0x6e3a1a, browColor: 0x5a4030,
  },
};

export function makeBoss(style = 'king') {
  if (style === true) style = 'frost'; // сумісність зі старим прапорцем frost
  if (!BOSS_SPECS[style]) style = 'king';
  const colors = BOSS_SPECS[style];
  const rig = makeHumanoid(Object.assign({
    scale: 2.7, belly: 1.7, armsForward: 0.9, headR: 0.24,
    eyeL: 0.075, eyeR: 0.075,
    mouth: 'open', teeth: true, brow: 0.45,
    bellySkin: style !== 'iron', sleeves: 'skin', nose: false,
  }, colors));
  if (style === 'chef') {
    // ковпак шеф-кухаря замість корони
    const hatM = toonMat(0xf7f4ea);
    const hatBand = cylinder(0.2, 0.22, 0.12, hatM, 12);
    hatBand.position.set(0, 0.36, 0);
    const hatTop = sphere(0.24, hatM, 12, 9);
    hatTop.position.set(0, 0.52, 0);
    hatTop.scale.set(1, 0.85, 1);
    const hatPuff = sphere(0.13, hatM, 8, 6);
    hatPuff.position.set(0.14, 0.58, 0.05);
    rig.parts.head.add(hatBand, hatTop, hatPuff);
    // вуса
    const mouM = toonMat(0x5a4030);
    for (const side of [-1, 1]) {
      const mou = box(0.12, 0.04, 0.03, mouM);
      mou.position.set(side * 0.09, 0.06, -0.21);
      mou.rotation.z = side * 0.35;
      rig.parts.head.add(mou);
    }
    // фартух з плямою
    const apron = box(0.62, 0.55, 0.04, toonMat(0xf2efe4));
    apron.position.set(0, 0.28, -0.44);
    const stain = sphere(0.09, toonMat(0xc9605a), 8, 6);
    stain.position.set(0.1, 0.32, -0.47);
    stain.scale.set(1, 1.3, 0.3);
    rig.parts.torso.add(apron, stain);
    // багет у руці
    const baguetteM = toonMat(0xd9a35e);
    const baguette = capsule(0.07, 0.55, baguetteM, 4, 8);
    baguette.position.set(0, -0.62, 0);
    rig.parts.armL.add(baguette);
  } else {
    // корона: золота / льодяна / залізна
    const crownM = style === 'frost'
      ? toonMat(0xaee8ff, 0x66ccff, 0.5)
      : style === 'iron'
        ? toonMat(0x6e7a8a, 0x222a36, 0.15)
        : toonMat(0xffc933, 0xffa000, 0.25);
    const crown = new THREE.Group();
    const band = cylinder(0.14, 0.16, 0.09, crownM, 10);
    crown.add(band);
    for (let i = 0; i < 5; i++) {
      const spike = cone(0.035, style === 'frost' ? 0.16 : 0.1, crownM, 6);
      const ang = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(ang) * 0.13, 0.08, Math.sin(ang) * 0.13);
      crown.add(spike);
    }
    crown.position.set(0, 0.42, 0);
    crown.rotation.z = 0.12;
    rig.parts.head.add(crown);
  }
  // шипи на плечах (льодяні для Мороза, броньовані для Барона)
  const spikeM = style === 'frost' ? toonMat(0xc9ecf7)
    : style === 'iron' ? toonMat(0x7d8aa0) : toonMat(0x4a4458);
  for (const side of [-1, 1]) {
    const pad = sphere(style === 'iron' ? 0.2 : 0.16, spikeM, 10, 8);
    pad.position.set(0.46 * side, 1.58, 0);
    pad.scale.set(1.2, 0.7, 1.2);
    rig.body.add(pad);
    const sp = cone(0.05, style === 'iron' ? 0.22 : 0.16, spikeM, 6);
    sp.position.set(0.46 * side, 1.7, 0);
    rig.body.add(sp);
  }
  if (style === 'frost') {
    // бурульки на руках
    for (const side of [-1, 1]) {
      const ice = cone(0.06, 0.22, toonMat(0xc9ecf7), 6);
      ice.position.set(0, -0.55, 0);
      ice.rotation.x = Math.PI;
      rig.parts[side < 0 ? 'armL' : 'armR'].add(ice);
    }
  }
  if (style === 'iron') {
    // нагрудна броня з заклепками
    const plateM = toonMat(0x6e7a8a);
    const plate = box(0.66, 0.5, 0.1, plateM);
    plate.position.set(0, 0.36, -0.42);
    rig.parts.torso.add(plate);
    const rivetM = toonMat(0xb8c4d4);
    for (const [rx, ry] of [[-0.22, 0.5], [0.22, 0.5], [-0.22, 0.2], [0.22, 0.2]]) {
      const rv = sphere(0.035, rivetM, 6, 5);
      rv.position.set(rx, ry, -0.46);
      rig.parts.torso.add(rv);
    }
  }
  rig.ztype = 'boss';
  bakeRig(rig);
  return rig;
}

// ============================================================
// Спорядження героя (видиме у виді 3-ї особи)
// ============================================================
export function attachHeroGear(rig, kind) {
  if (kind === 'vest') {
    const vestM = toonMat(0x2e4a6e);
    const front = box(0.42, 0.46, 0.1, vestM);
    front.position.set(0, 0.36, -0.24);
    const backP = box(0.42, 0.46, 0.08, vestM);
    backP.position.set(0, 0.36, 0.22);
    const pocketM = toonMat(0x223a55);
    for (const px of [-0.12, 0.12]) {
      const pocket = box(0.14, 0.14, 0.04, pocketM);
      pocket.position.set(px, 0.28, -0.3);
      rig.parts.torso.add(pocket);
    }
    const strapM = toonMat(0x1a2c40);
    for (const side of [-1, 1]) {
      const strap = box(0.1, 0.06, 0.5, strapM);
      strap.position.set(side * 0.16, 0.6, 0);
      rig.parts.torso.add(strap);
    }
    rig.parts.torso.add(front, backP);
    return [front, backP];
  }
  if (kind === 'helmet') {
    const helmM = toonMat(0x556b3a);
    const helm = sphere(0.3, helmM, 14, 10);
    helm.position.y = 0.22;
    helm.scale.set(1.03, 0.78, 1.03);
    const rim = cylinder(0.31, 0.33, 0.05, helmM, 14);
    rim.position.y = 0.13;
    const star = cylinder(0.06, 0.06, 0.02, toonMat(0xffd23f), 5);
    star.rotation.x = Math.PI / 2;
    star.position.set(0, 0.26, -0.27);
    rig.parts.head.add(helm, rim, star);
    return [helm, rim, star];
  }
  if (kind === 'sneakers') {
    const shoeM = toonMat(0xff8c42, 0xcc5500, 0.3);
    const out = [];
    for (const leg of [rig.parts.legL, rig.parts.legR]) {
      const shoe = box(0.2, 0.14, 0.34, shoeM);
      shoe.position.set(0, -0.83, -0.06);
      const stripe = box(0.22, 0.05, 0.1, toonMat(0xffffff));
      stripe.position.set(0, -0.8, -0.2);
      leg.add(shoe, stripe);
      out.push(shoe, stripe);
    }
    return out;
  }
  return [];
}

// ---------- Скіни героя ----------
export const HERO_SKINS = {
  classic: { name: 'Класик', icon: '🧢', desc: 'Перевірений герой у кепці' },
  ninja: { name: 'Ніндзя', icon: '🥷', desc: 'Тихий, як тінь' },
  astro: { name: 'Космонавт', icon: '👨‍🚀', desc: 'Прямо з орбіти' },
  pirate: { name: 'Пірат', icon: '🏴‍☠️', desc: 'Йо-хо-хо!' },
  robot: { name: 'Робот', icon: '🤖', desc: 'Біп-буп, зомбі!' },
  frog: { name: 'Жабеня', icon: '🐸', desc: 'Ква проти зомбі (з Мегабокса)' },
  super: { name: 'Супергерой', icon: '🦸', desc: 'Плащ майорить! (з Мегабокса)' },
};

// ---------- Танці (емоції) ----------
export const DANCES = {
  shuffle: { name: 'Денс', icon: '🕺', desc: 'Класика перемоги' },
  spin: { name: 'Дзиґа', icon: '🌪️', desc: 'Крутись, як вихор!' },
  robot: { name: 'Робот', icon: '🤖', desc: 'Біп-буп-денс' },
  wave: { name: 'Хвиля', icon: '🌊', desc: 'Котить хвилю руками' },
  jump: { name: 'Стрибунець', icon: '🦘', desc: 'Радісні підскоки (з Мегабокса)' },
  chicken: { name: 'Курча', icon: '🐤', desc: 'Кудкудак! (з Мегабокса)' },
};

// ---------- Сліди куль ----------
export const TRACERS = {
  classic: { name: 'Класичні', icon: '➖' },
  gold: { name: 'Золоті', icon: '✨' },
  rainbow: { name: 'Веселкові', icon: '🌈' },
};

export function makeHero(skinId = 'classic') {
  const builders = {
    classic() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xffc9a3, shirt: 0x2f80c3, pants: 0x474f63, shoes: 0x303642,
        eyeL: 0.058, eyeR: 0.058, mouth: 'smile', mouthColor: 0x8a4b3a,
        brow: -0.08, cast: 'all',
      });
      const capM = toonMat(0xff8c42);
      const capTop = sphere(0.275, capM, 16, 10);
      capTop.position.y = 0.2;
      capTop.scale.set(1, 0.62, 1);
      const brim = box(0.3, 0.035, 0.18, capM);
      brim.position.set(0, 0.26, -0.3);
      rig.parts.head.add(capTop, brim);
      return rig;
    },
    ninja() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xffc9a3, shirt: 0x2b2f3a, pants: 0x20242e, shoes: 0x16181f,
        eyeL: 0.06, eyeR: 0.06, mouth: 'smile', mouthColor: 0x6a4b3a,
        brow: -0.14, cast: 'all', sleeves: 'shirt',
      });
      // маска-каптур із прорізом для очей
      const maskM = toonMat(0x232733);
      const hood = sphere(0.285, maskM, 16, 12);
      hood.position.y = 0.14;
      hood.scale.set(1.02, 1.05, 1.02);
      rig.parts.head.add(hood);
      const slit = box(0.3, 0.085, 0.06, toonMat(0xffe2c2));
      slit.position.set(0, 0.2, -0.255);
      rig.parts.head.add(slit);
      for (const side of [-1, 1]) {
        const eye = sphere(0.035, toonMat(0x222222), 8, 6);
        eye.position.set(0.085 * side, 0.2, -0.295);
        rig.parts.head.add(eye);
      }
      // червоний пояс зі стрічками
      const beltM = toonMat(0xd84f4f);
      const belt = cylinder(0.27, 0.27, 0.08, beltM, 14);
      belt.position.y = 0.05;
      rig.parts.torso.add(belt);
      const ribbon = box(0.07, 0.3, 0.03, beltM);
      ribbon.position.set(0.16, -0.1, 0.22);
      ribbon.rotation.x = 0.25;
      rig.parts.torso.add(ribbon);
      return rig;
    },
    astro() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xffc9a3, shirt: 0xe8ecf2, pants: 0xcdd5e0, shoes: 0x8a94a8,
        eyeL: 0.058, eyeR: 0.058, mouth: 'smile', mouthColor: 0x8a4b3a,
        brow: -0.05, cast: 'all',
      });
      // скляний купол-шолом
      const helmM = toonMat(0xbfe2ff);
      const dome = sphere(0.34, helmM, 16, 12);
      dome.position.y = 0.14;
      dome.scale.set(1, 0.55, 1);
      dome.position.y = 0.38;
      rig.parts.head.add(dome);
      const collar = cylinder(0.3, 0.32, 0.08, toonMat(0x9aa6b8), 14);
      collar.position.y = -0.08;
      rig.parts.head.add(collar);
      // ранець життєзабезпечення
      const pack = box(0.36, 0.42, 0.18, toonMat(0xb8c2d4));
      pack.position.set(0, 0.36, 0.3);
      rig.parts.torso.add(pack);
      for (const side of [-1, 1]) {
        const tank = cylinder(0.07, 0.07, 0.3, toonMat(0x6fc3ff), 10);
        tank.position.set(0.1 * side, 0.4, 0.42);
        rig.parts.torso.add(tank);
      }
      // емблема-зірка
      const star = cylinder(0.06, 0.06, 0.02, toonMat(0xffd23f), 5);
      star.rotation.x = Math.PI / 2;
      star.position.set(0.12, 0.45, -0.27);
      rig.parts.torso.add(star);
      return rig;
    },
    pirate() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xf2b48c, shirt: 0xd84f4f, pants: 0x3a3f4a, shoes: 0x2a2118,
        eyeL: 0.06, eyeR: 0.028, mouth: 'crooked', mouthColor: 0x7a2c2c,
        brow: -0.2, cast: 'all',
      });
      // бандана з хвостиком
      const banM = toonMat(0x2a2f3a);
      const ban = sphere(0.285, banM, 16, 10);
      ban.position.y = 0.22;
      ban.scale.set(1.02, 0.55, 1.02);
      rig.parts.head.add(ban);
      const knot = box(0.1, 0.16, 0.05, banM);
      knot.position.set(0.22, 0.12, 0.18);
      knot.rotation.z = -0.5;
      rig.parts.head.add(knot);
      // пов'язка на око
      const patch = box(0.09, 0.07, 0.03, toonMat(0x1a1a1a));
      patch.position.set(-0.105, 0.2, -0.245);
      rig.parts.head.add(patch);
      // череп на грудях і пояс
      const skull = sphere(0.06, toonMat(0xf5f0e0), 8, 6);
      skull.position.set(0, 0.42, -0.26);
      rig.parts.torso.add(skull);
      const belt = cylinder(0.27, 0.27, 0.08, toonMat(0x6b4f3a), 14);
      belt.position.y = 0.05;
      rig.parts.torso.add(belt);
      const buckle = box(0.1, 0.08, 0.03, toonMat(0xffd23f));
      buckle.position.set(0, 0.05, -0.26);
      rig.parts.torso.add(buckle);
      return rig;
    },
    robot() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0x9aa6b8, shirt: 0x7d8aa0, pants: 0x5d6a80, shoes: 0x3d4658,
        eyeWhite: 0x4fd8ff, eyeL: 0.07, eyeR: 0.07, pupilColor: 0x1a6a8a,
        mouth: 'smile', mouthColor: 0x394556, nose: false, cast: 'all',
      });
      // антена з кулькою
      const antM = toonMat(0x4fd8ff, 0x2288cc, 0.6);
      const rod = cylinder(0.02, 0.02, 0.2, toonMat(0x5d6a80), 6);
      rod.position.y = 0.48;
      rig.parts.head.add(rod);
      const tip = sphere(0.05, antM, 8, 6);
      tip.position.y = 0.6;
      rig.parts.head.add(tip);
      // панель з кнопками на грудях
      const panel = box(0.26, 0.2, 0.04, toonMat(0x394556));
      panel.position.set(0, 0.38, -0.26);
      rig.parts.torso.add(panel);
      const cols = [0xff5d5d, 0xffd23f, 0x58c14c];
      cols.forEach((c, i) => {
        const btn = sphere(0.03, toonMat(c, c, 0.5), 6, 5);
        btn.position.set(-0.07 + i * 0.07, 0.38, -0.285);
        rig.parts.torso.add(btn);
      });
      // плечові «болти»
      for (const side of [-1, 1]) {
        const bolt = sphere(0.07, toonMat(0xb8c2d4), 8, 6);
        bolt.position.set(0, -0.02, 0);
        rig.parts[side < 0 ? 'armL' : 'armR'].add(bolt);
      }
      return rig;
    },
    frog() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xffc9a3, shirt: 0x58c14c, pants: 0x3e8a36, shoes: 0x2e6a28,
        eyeL: 0.058, eyeR: 0.058, mouth: 'open', mouthColor: 0x7a3a3a,
        brow: -0.05, cast: 'all',
      });
      // каптур-жабка з очима зверху
      const hoodM = toonMat(0x4cb242);
      const hood = sphere(0.3, hoodM, 16, 12);
      hood.position.y = 0.18;
      hood.scale.set(1.04, 0.92, 1.04);
      hood.position.z = 0.03;
      rig.parts.head.add(hood);
      for (const side of [-1, 1]) {
        const eyeBase = sphere(0.09, hoodM, 10, 8);
        eyeBase.position.set(0.13 * side, 0.43, -0.05);
        rig.parts.head.add(eyeBase);
        const eyeW = sphere(0.055, toonMat(0xffffff), 8, 6);
        eyeW.position.set(0.13 * side, 0.46, -0.1);
        rig.parts.head.add(eyeW);
        const pup = sphere(0.025, toonMat(0x222222), 6, 5);
        pup.position.set(0.13 * side, 0.46, -0.145);
        rig.parts.head.add(pup);
      }
      // черевце
      const belly = sphere(0.2, toonMat(0xd8f0c2), 12, 9);
      belly.position.set(0, 0.3, -0.16);
      belly.scale.set(1, 1.2, 0.5);
      rig.parts.torso.add(belly);
      return rig;
    },
    super() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xffc9a3, shirt: 0x2f6fd8, pants: 0xd84f4f, shoes: 0xd84f4f,
        eyeL: 0.058, eyeR: 0.058, mouth: 'smile', mouthColor: 0x8a4b3a,
        brow: -0.12, cast: 'all',
      });
      // маска-доміно
      const mask = box(0.32, 0.09, 0.05, toonMat(0x16314e));
      mask.position.set(0, 0.2, -0.245);
      rig.parts.head.add(mask);
      // емблема-блискавка (жовтий ромбик)
      const emb = cylinder(0.09, 0.09, 0.02, toonMat(0xffd23f, 0xcc9900, 0.4), 4);
      emb.rotation.x = Math.PI / 2;
      emb.position.set(0, 0.42, -0.27);
      rig.parts.torso.add(emb);
      // плащ за спиною
      const capeM = toonMat(0xd84f4f);
      const cape = box(0.5, 0.78, 0.04, capeM);
      cape.position.set(0, 0.18, 0.27);
      cape.rotation.x = 0.16;
      rig.parts.torso.add(cape);
      const capeKnot = box(0.46, 0.06, 0.06, toonMat(0xb03a3a));
      capeKnot.position.set(0, 0.58, 0.05);
      rig.parts.torso.add(capeKnot);
      return rig;
    },
  };
  const rig = (builders[skinId] || builders.classic)();
  // спільне для всіх скінів: рюкзачок (крім астронавта — у нього ранець) і пояс
  if (skinId !== 'astro') {
    const packM = toonMat(skinId === 'ninja' ? 0x394150 : 0x55a04b);
    const pack = box(0.34, 0.4, 0.16, packM);
    pack.position.set(0, 0.34, 0.3);
    rig.parts.torso.add(pack);
  }
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
  } else if (kind === 'shotgun') {
    const woodM = toonMat(0x8a5a32);
    // два стволи поруч
    for (const side of [-1, 1]) {
      const barrel = cylinder(0.032, 0.032, 0.52, darkM, 10);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 0.034, 0.02, -0.3);
      const tip = cylinder(0.038, 0.038, 0.05, accentM, 10);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(side * 0.034, 0.02, -0.55);
      g.add(barrel, tip);
    }
    const receiver = box(0.1, 0.1, 0.18, midM);
    receiver.position.set(0, 0, -0.02);
    const stock = box(0.07, 0.11, 0.26, woodM);
    stock.position.set(0, -0.04, 0.18);
    stock.rotation.x = -0.12;
    const pump = box(0.09, 0.07, 0.16, woodM);
    pump.position.set(0, -0.03, -0.32);
    const sightF = box(0.018, 0.035, 0.025, accentM);
    sightF.position.set(0, 0.065, -0.5);
    g.add(receiver, stock, pump, sightF);
    muzzle.position.set(0, 0.02, -0.58);
  } else if (kind === 'smg') {
    const tealM = toonMat(0x3fae9c, 0x1a6e60, 0.12);
    const body = box(0.065, 0.1, 0.34, midM);
    body.position.z = -0.08;
    const shroud = cylinder(0.034, 0.034, 0.22, tealM, 10);
    shroud.rotation.x = Math.PI / 2;
    shroud.position.set(0, 0.02, -0.33);
    const barrel = cylinder(0.018, 0.018, 0.1, darkM, 8);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.48);
    const mag = box(0.045, 0.24, 0.07, darkM);
    mag.position.set(0, -0.16, -0.1);
    mag.rotation.x = 0.12;
    const grip = box(0.05, 0.12, 0.06, darkM);
    grip.position.set(0, -0.1, 0.06);
    grip.rotation.x = -0.25;
    const stockBar = box(0.03, 0.03, 0.18, lightM);
    stockBar.position.set(0, 0.02, 0.18);
    const stockPad = box(0.05, 0.1, 0.04, tealM);
    stockPad.position.set(0, 0, 0.28);
    const sightF = box(0.016, 0.035, 0.02, tealM);
    sightF.position.set(0, 0.08, -0.3);
    g.add(body, shroud, barrel, mag, grip, stockBar, stockPad, sightF);
    muzzle.position.set(0, 0.02, -0.54);
  } else if (kind === 'magnum') {
    const steelM = toonMat(0xb8c4d4);
    const woodM = toonMat(0x7a4a28);
    const barrel = box(0.05, 0.07, 0.34, steelM);
    barrel.position.set(0, 0.03, -0.22);
    const under = cylinder(0.02, 0.02, 0.3, steelM, 8);
    under.rotation.x = Math.PI / 2;
    under.position.set(0, -0.012, -0.2);
    const drum = cylinder(0.052, 0.052, 0.09, darkM, 8);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, 0.005, -0.02);
    const frame = box(0.04, 0.1, 0.14, steelM);
    frame.position.set(0, 0.0, 0.02);
    const grip = box(0.05, 0.14, 0.07, woodM);
    grip.position.set(0, -0.1, 0.07);
    grip.rotation.x = -0.32;
    const hammer = box(0.02, 0.05, 0.03, darkM);
    hammer.position.set(0, 0.075, 0.07);
    const sightF = box(0.014, 0.035, 0.02, accentM);
    sightF.position.set(0, 0.085, -0.36);
    g.add(barrel, under, drum, frame, grip, hammer, sightF);
    muzzle.position.set(0, 0.03, -0.42);
  } else if (kind === 'sniper') {
    const camoM = toonMat(0x5e7050);
    const body = box(0.06, 0.09, 0.5, camoM);
    body.position.z = -0.1;
    const barrel = cylinder(0.02, 0.02, 0.55, darkM, 10);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.62);
    const brake = cylinder(0.034, 0.034, 0.09, accentM, 8);
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.02, -0.88);
    // оптичний приціл
    const scope = cylinder(0.035, 0.035, 0.22, darkM, 10);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, -0.1);
    const lens = cylinder(0.04, 0.04, 0.02, toonMat(0x9fd8ff, 0x4fb8ff, 0.6), 10);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.1, -0.22);
    const mount1 = box(0.02, 0.05, 0.03, midM);
    mount1.position.set(0, 0.06, -0.16);
    const mount2 = box(0.02, 0.05, 0.03, midM);
    mount2.position.set(0, 0.06, -0.04);
    const mag = box(0.05, 0.12, 0.1, darkM);
    mag.position.set(0, -0.1, -0.14);
    const stock = box(0.055, 0.12, 0.24, camoM);
    stock.position.set(0, -0.03, 0.22);
    stock.rotation.x = -0.1;
    const cheek = box(0.05, 0.04, 0.14, accentM);
    cheek.position.set(0, 0.045, 0.22);
    const grip = box(0.05, 0.11, 0.06, darkM);
    grip.position.set(0, -0.1, 0.07);
    grip.rotation.x = -0.3;
    // сошки
    for (const side of [-1, 1]) {
      const leg = cylinder(0.012, 0.012, 0.16, lightM, 6);
      leg.position.set(side * 0.05, -0.1, -0.42);
      leg.rotation.z = side * 0.4;
      g.add(leg);
    }
    g.add(body, barrel, brake, scope, lens, mount1, mount2, mag, stock, cheek, grip);
    muzzle.position.set(0, 0.02, -0.94);
  } else if (kind === 'bazooka') {
    const oliveM = toonMat(0x6b7a4a);
    const tube = cylinder(0.075, 0.075, 0.85, oliveM, 12);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.05, -0.1);
    const mouth = cylinder(0.105, 0.085, 0.14, darkM, 12);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.set(0, 0.05, -0.58);
    const back = cylinder(0.085, 0.1, 0.12, darkM, 12);
    back.rotation.x = Math.PI / 2;
    back.position.set(0, 0.05, 0.38);
    // бойова частина ракети визирає
    const warhead = cone(0.06, 0.16, accentM, 10);
    warhead.rotation.x = -Math.PI / 2;
    warhead.position.set(0, 0.05, -0.62);
    const grip = box(0.05, 0.14, 0.07, darkM);
    grip.position.set(0, -0.08, 0.02);
    grip.rotation.x = -0.2;
    const grip2 = box(0.05, 0.1, 0.06, darkM);
    grip2.position.set(0, -0.06, -0.22);
    const sight = box(0.02, 0.09, 0.03, lightM);
    sight.position.set(0, 0.16, -0.2);
    const band1 = cylinder(0.08, 0.08, 0.05, toonMat(0xffd23f), 12);
    band1.rotation.x = Math.PI / 2;
    band1.position.set(0, 0.05, -0.35);
    g.add(tube, mouth, back, warhead, grip, grip2, sight, band1);
    muzzle.position.set(0, 0.05, -0.68);
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
  const longGun = ['rifle', 'shotgun', 'smg', 'sniper', 'bazooka'].includes(gunKind);
  const armL = capsule(0.055, 0.28, sleeveM);
  armL.rotation.x = Math.PI / 2 - 0.25;
  armL.rotation.z = 0.5;
  armL.position.set(-0.12, -0.2, longGun ? -0.1 : 0.1);
  const handL = sphere(0.07, skinM, 10, 8);
  handL.position.set(-0.025, -0.085, longGun ? -0.24 : 0.0);
  g.add(armR, handR, armL, handL);
  bakeGroupMeshes(g, { outline: 0.01 });
  return { group: g, muzzle: gun.muzzle };
}

// ============================================================
// 🐶 Песик Дружок — компаньйон героя
// ============================================================
export function makeDog() {
  const root = new THREE.Group();
  const furM = toonMat(0xc98f4e);
  const darkM = toonMat(0xa06a32);

  // тулуб (горизонтальна капсула)
  const body = capsule(0.16, 0.34, furM);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.34;
  body.castShadow = true;
  root.add(body);

  // голова (дивиться у -Z, як усі)
  const headG = new THREE.Group();
  headG.position.set(0, 0.52, -0.28);
  const head = sphere(0.16, furM, 14, 10);
  head.castShadow = true;
  headG.add(head);
  const snout = box(0.12, 0.09, 0.12, toonMat(0xe2b27a));
  snout.position.set(0, -0.03, -0.16);
  headG.add(snout);
  const nose = sphere(0.035, toonMat(0x3a2a1a), 8, 6);
  nose.position.set(0, 0, -0.22);
  headG.add(nose);
  for (const side of [-1, 1]) {
    const eye = sphere(0.03, toonMat(0x222222), 8, 6);
    eye.position.set(0.07 * side, 0.06, -0.13);
    headG.add(eye);
    const ear = box(0.07, 0.14, 0.04, darkM);
    ear.position.set(0.11 * side, 0.16, 0.02);
    ear.rotation.z = -0.3 * side;
    headG.add(ear);
  }
  root.add(headG);

  // лапи
  const legs = [];
  for (const [lx, lz] of [[-0.1, -0.16], [0.1, -0.16], [-0.1, 0.16], [0.1, 0.16]]) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.26, lz);
    const lm = capsule(0.045, 0.18, darkM, 3, 8);
    lm.position.y = -0.12;
    leg.add(lm);
    root.add(leg);
    legs.push(leg);
  }

  // хвостик
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, 0.26);
  const tm = capsule(0.04, 0.16, furM, 3, 8);
  tm.position.y = 0.08;
  tm.rotation.x = -0.7;
  tail.add(tm);
  root.add(tail);

  // нашийник
  const collar = cylinder(0.13, 0.13, 0.045, toonMat(0xd84f4f), 12);
  collar.position.set(0, 0.47, -0.2);
  collar.rotation.x = 0.5;
  root.add(collar);

  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// ============================================================
// 🛴 Самокат
// ============================================================
export function makeScooter(color = 0x4fd8ff) {
  const g = new THREE.Group();
  const mainM = toonMat(color);
  const darkM = toonMat(0x3a4250);

  const deck = box(0.34, 0.06, 1.05, mainM);
  deck.position.y = 0.18;
  deck.castShadow = true;
  g.add(deck);

  const stem = cylinder(0.035, 0.035, 1.0, darkM, 8);
  stem.position.set(0, 0.66, -0.52);
  stem.rotation.x = 0.18;
  g.add(stem);
  const bar = cylinder(0.035, 0.035, 0.5, darkM, 8);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.14, -0.6);
  g.add(bar);
  for (const side of [-1, 1]) {
    const grip = cylinder(0.045, 0.045, 0.14, toonMat(0xff8c42), 8);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0.3 * side, 1.14, -0.6);
    g.add(grip);
  }

  const wheels = [];
  for (const wz of [-0.56, 0.48]) {
    const wheel = cylinder(0.12, 0.12, 0.07, darkM, 14);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.12, wz);
    g.add(wheel);
    wheels.push(wheel);
    const hub = cylinder(0.05, 0.05, 0.08, toonMat(0xffd23f), 8);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(0, 0.12, wz);
    g.add(hub);
  }
  return { group: g, wheels };
}

// ============================================================
// 🦙 Мегабокс — святкова скриня з сюрпризом
// ============================================================
export function makeMegaboxMesh() {
  const g = new THREE.Group();
  const boxM = toonMat(0xb086f2);
  const ribbonM = toonMat(0xffd23f, 0xcc9900, 0.25);

  const base = box(1.15, 0.85, 1.15, boxM);
  base.position.y = 0.42;
  base.castShadow = true;
  g.add(base);
  // стрічки навхрест
  const r1 = box(0.22, 0.88, 1.18, ribbonM);
  r1.position.y = 0.42;
  g.add(r1);
  const r2 = box(1.18, 0.88, 0.22, ribbonM);
  r2.position.y = 0.42;
  g.add(r2);

  // кришка (відлітає при відкритті)
  const lid = new THREE.Group();
  const lidTop = box(1.28, 0.22, 1.28, toonMat(0x9a6ee0));
  lidTop.castShadow = true;
  lid.add(lidTop);
  const bowM = toonMat(0xff5d8c);
  for (const side of [-1, 1]) {
    const loop = sphere(0.16, bowM, 10, 8);
    loop.position.set(0.16 * side, 0.2, 0);
    loop.scale.set(1.2, 0.7, 0.7);
    lid.add(loop);
  }
  const knot = sphere(0.1, bowM, 8, 6);
  knot.position.y = 0.18;
  lid.add(knot);
  lid.position.y = 0.96;
  g.add(lid);

  // зірочки на боках
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const star = cylinder(0.1, 0.1, 0.02, toonMat(0xffffff), 5);
    star.position.set(Math.sin(a) * 0.59, 0.45, Math.cos(a) * 0.59);
    star.rotation.x = Math.PI / 2;
    star.rotation.y = a;
    g.add(star);
  }
  return { group: g, lid };
}

// ============================================================
// Гаджети: 🦘 кишеньковий батут і 🧱 барикада
// ============================================================
export function makeTrampolineMesh() {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(
    cachedGeo('tramp-rim', () => new THREE.TorusGeometry(0.85, 0.12, 8, 20)),
    toonMat(0xff8c42)
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.42;
  rim.castShadow = true;
  g.add(rim);
  const mat = cylinder(0.82, 0.82, 0.05, toonMat(0x4fa8e8, 0x2266aa, 0.35), 20);
  mat.position.y = 0.4;
  g.add(mat);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    const leg = cylinder(0.05, 0.05, 0.4, toonMat(0x3a4250), 8);
    leg.position.set(Math.sin(a) * 0.7, 0.2, Math.cos(a) * 0.7);
    g.add(leg);
  }
  return g;
}

export function makeBarricadeMesh() {
  const g = new THREE.Group();
  const woods = [0xb08a5a, 0xa07a4a, 0xc09a6a];
  // 5 вертикальних дощок уздовж X
  for (let i = 0; i < 5; i++) {
    const plank = box(0.44, 1.7 + (i % 2) * 0.12, 0.09, toonMat(woods[i % 3]));
    plank.position.set(-0.96 + i * 0.48, 0.86, 0);
    plank.rotation.z = (i % 2 ? 0.02 : -0.02);
    plank.castShadow = true;
    g.add(plank);
  }
  // 2 поперечні рейки
  for (const ry of [0.5, 1.25]) {
    const rail = box(2.5, 0.16, 0.07, toonMat(0x8a6a42));
    rail.position.set(0, ry, -0.07);
    g.add(rail);
  }
  return g;
}
