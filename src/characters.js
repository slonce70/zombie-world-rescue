// Процедурні мультяшні персонажі (стиль Fortnite-lite) + анімації
import * as THREE from 'three';
import { t } from './i18n.js';

function patchToonGradientRampShader() {
  const chunk = THREE.ShaderChunk.gradientmap_pars_fragment;
  const grayscaleSample = 'return vec3( texture2D( gradientMap, coord ).r );';
  const colorSample = 'return texture2D( gradientMap, coord ).rgb;';
  if (typeof chunk === 'string' && chunk.includes(grayscaleSample) && !chunk.includes(colorSample)) {
    THREE.ShaderChunk.gradientmap_pars_fragment = chunk.replace(grayscaleSample, colorSample);
  }
}

patchToonGradientRampShader();

let gradMap = null;
function getGradMap() {
  if (!gradMap) {
    const data = new Uint8Array([
      130, 150, 190, 255,
      168, 184, 220, 255,
      214, 224, 246, 255,
      255, 236, 204, 255,
    ]);
    gradMap = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
    gradMap.minFilter = THREE.NearestFilter;
    gradMap.magFilter = THREE.NearestFilter;
    gradMap.needsUpdate = true;
    gradMap.userData.shared = true; // спільний на весь сеанс — endLevel його НЕ диспозить
  }
  return gradMap;
}

const matCache = new Map();
export function toonMat(color, emissive = 0x000000, emissiveIntensity = 0) {
  const key = `${color}|${emissive}|${emissiveIntensity}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshToonMaterial({
      color, gradientMap: getGradMap(), emissive, emissiveIntensity, dithering: true,
    });
    m.userData.shared = true; // кешований на весь сеанс і переюзаний усіма рівнями
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// Кеш геометрій: однакові примітиви ділять одну BufferGeometry
const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) {
    const g = make();
    g.userData.shared = true; // кешована геометрія живе на весь сеанс — не диспозити в endLevel
    geoCache.set(key, g);
  }
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
    bakedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradMap(), dithering: true });
    bakedMat.userData.shared = true; // спільний матеріал запечених мешів — не диспозити в endLevel
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
  rig.anim.armLZ = rig.anim.armRZ = undefined; // інакше поза рук танцю/самоката залипає на наступний режим
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
      } else if (style === 'lightning') {
        // ⚡ блискавка: різкі кутасті пози — руки зигзагом, стрибки в присіді
        const step = Math.floor(ph * 1.1) % 4;
        armL = step === 0 ? 2.6 : step === 1 ? 0.6 : step === 2 ? 1.8 : 0.2;
        armR = step === 0 ? 0.2 : step === 1 ? 1.8 : step === 2 ? 0.6 : 2.6;
        a.armLZ = step % 2 ? 0.9 : -0.4;
        a.armRZ = step % 2 ? -0.4 : 0.9;
        bodyY = step % 2 ? 0.1 : -0.06;
        bodyRotZ = (step - 1.5) * 0.12;
        headRotX = step % 2 ? -0.15 : 0.12;
        legL = step % 2 ? 0.5 : -0.1;
        legR = step % 2 ? -0.1 : 0.5;
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

export function makeShieldMesh(fireproof = false) {
  if (!shieldTpl) shieldTpl = buildShieldTpl();
  const g = shieldTpl.clone(true);
  const cracks1 = g.children.find((c) => c.name === 'cracks1');
  const cracks2 = g.children.find((c) => c.name === 'cracks2');
  const cracks3 = g.children.find((c) => c.name === 'cracks3');
  cracks1.visible = false;
  cracks2.visible = false;
  cracks3.visible = false;
  // 🔵 анти-вогонь щит — синювато-металевий, щоб дитина бачила різницю (вогнемет його не бере)
  if (fireproof) {
    const iceM = toonMat(0x5a8fd6, 0x2a5aa0, 0.25);
    const base = g.children.find((c) => c.name !== 'cracks1' && c.name !== 'cracks2' && c.name !== 'cracks3');
    if (base) base.traverse((o) => { if (o.isMesh) o.material = iceM; });
  }
  return { group: g, cracks1, cracks2, cracks3 };
}

function buildZombie(type, rng) {
  if (type === 'snowman') return buildSnowman(rng);
  if (type === 'mummy') {
    // 🧻 мумія: вся в бинтах, очі світяться з-під пов'язок
    const wrapCol = rng.pick([0xe2dac4, 0xd9d2bc, 0xe8e0cc]);
    const rig = makeHumanoid({
      scale: 1.05, belly: 0.95, armsForward: 1.15, lean: -0.1,
      skin: wrapCol, shirt: wrapCol, pants: wrapCol, shoes: 0xc9c2ac,
      eyeWhite: 0x7fe8ff, eyeL: 0.09, eyeR: 0.09,
      pupilColor: 0x115a7a, mouth: 'crooked', teeth: false,
      brow: 0.42, sleeves: 'skin', nose: false,
    });
    // смуги бинтів навхрест по тулубу, руках і голові
    const bandM = toonMat(0xcfc6a8);
    for (let i = 0; i < 3; i++) {
      const band = box(0.46, 0.06, 0.4, bandM);
      band.position.set(0, 0.08 + i * 0.18, 0);
      band.rotation.y = i % 2 ? 0.35 : -0.3;
      rig.parts.torso.add(band);
    }
    const headBand = box(0.4, 0.07, 0.38, bandM);
    headBand.position.set(0, 0.12, 0);
    headBand.rotation.y = 0.25;
    rig.parts.head.add(headBand);
    // звисаючий хвостик бинта
    const loose = box(0.07, 0.4, 0.03, bandM);
    loose.position.set(0.2, -0.32, -0.15);
    loose.rotation.z = 0.25;
    rig.parts.armR.add(loose);
    rig.ztype = 'mummy';
    return rig;
  }
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
  } else if (type === 'wizard') {
    // 🧙 зомбі-чарівник: худорлявий у балахоні, з гострим капюшоном і світним посохом-орбом
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.06, belly: 0.8, armsForward: 0.7, lean: -0.05,
      skin: 0x8fb56a, shirt: 0x4b2c7a, pants: 0x3a2360, shoes: 0x2a1a45,
      eyeWhite: 0xe6d6ff, eyeL: 0.085, eyeR: 0.085, pupilColor: 0x7b2fd6, brow: 0.5,
    }));
    const robeM = toonMat(0x4b2c7a);
    const trimM = toonMat(0x9b6bff, 0x6a2fd0, 0.35);
    // мантія — спідниця-конус від пояса донизу
    const robe = cone(0.42, 0.95, robeM, 12);
    robe.position.set(0, -0.4, 0);
    rig.parts.torso.add(robe);
    // капюшон — гострий конус на голові + кільце-комір
    const hood = cone(0.3, 0.45, robeM, 10);
    hood.position.set(0, 0.34, 0.02);
    const hoodTip = sphere(0.05, robeM, 6, 5);
    hoodTip.position.set(0, 0.58, 0.04);
    rig.parts.head.add(hood, hoodTip);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 14), robeM);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.02, 0);
    rig.parts.head.add(collar);
    // зірочки на мантії
    for (let i = 0; i < 3; i++) {
      const star = box(0.06, 0.06, 0.02, trimM);
      star.position.set(rng.range(-0.18, 0.18), rng.range(0.1, 0.4), -0.27);
      star.rotation.z = 0.78;
      rig.parts.torso.add(star);
    }
    // посох у правій руці: довге древко + світний орб
    const staffM = toonMat(0x5a3a22);
    const staff = cylinder(0.035, 0.045, 1.25, staffM, 8);
    staff.position.set(0.04, -0.4, -0.16);
    const orbM = toonMat(0x9b6bff, 0x9b6bff, 1.0);
    const orb = sphere(0.13, orbM, 12, 10);
    orb.position.set(0.04, 0.28, -0.16);
    const orbHalo = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 14), trimM);
    orbHalo.position.copy(orb.position);
    orbHalo.rotation.x = 0.6;
    rig.parts.armR.add(staff, orb, orbHalo);
    rig.ztype = 'wizard';
    addZombieWear(rig);
    return rig;
  } else if (type === 'toro') {
    // 🐂 торо: кремезний зомбі-бичок, нахилений уперед, з рогами — готовий до ривка
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.18, belly: 1.5, armsForward: 1.1, headR: 0.26, lean: -0.28,
      skin: 0x6e5a52, shirt: 0x4a3a34, pants: 0x37302a, shoes: 0x232020,
      eyeWhite: 0xffd24a, eyeL: 0.07, eyeR: 0.07, pupilColor: 0xc62828, brow: 0.55,
      bellySkin: true, nose: false, mouth: 'open', teeth: true,
    }));
    const hornM = toonMat(0xe8dcc4);   // кістяні роги
    const noseM = toonMat(0x2a2422);
    // велика бичача морда
    const snout = box(0.26, 0.18, 0.16, toonMat(0x5a4a42));
    snout.position.set(0, -0.05, -0.27);
    rig.parts.head.add(snout);
    // ніздрі-кільце
    const nring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12), toonMat(0xc9b06a, 0x8a6a2a, 0.2));
    nring.position.set(0, -0.1, -0.35);
    nring.rotation.x = Math.PI / 2;
    rig.parts.head.add(nring);
    for (const side of [-1, 1]) {
      const nostril = sphere(0.025, noseM, 5, 4);
      nostril.position.set(side * 0.07, -0.04, -0.35);
      rig.parts.head.add(nostril);
    }
    // 🐂 вигнуті роги
    for (const side of [-1, 1]) {
      const horn = cone(0.06, 0.34, hornM, 7);
      horn.position.set(side * 0.2, 0.22, -0.08);
      horn.rotation.z = side * -1.15;
      horn.rotation.x = -0.35;
      rig.parts.head.add(horn);
      const tip = sphere(0.05, hornM, 6, 5);
      tip.position.set(side * 0.36, 0.34, -0.12);
      rig.parts.head.add(tip);
    }
    // вуха обабіч
    for (const side of [-1, 1]) {
      const ear = box(0.12, 0.07, 0.04, toonMat(0x5a4a42));
      ear.position.set(side * 0.27, 0.06, 0.02);
      ear.rotation.z = side * 0.4;
      rig.parts.head.add(ear);
    }
    // горб на спині (бичача загривок)
    const hump = sphere(0.26, toonMat(0x5a4a42), 10, 8);
    hump.position.set(0, 0.5, 0.16);
    hump.scale.set(1.1, 0.7, 1);
    rig.parts.torso.add(hump);
    rig.ztype = 'toro';
    addZombieWear(rig);
    return rig;
  } else if (type === 'gladiator') {
    // 🛡️ зомбі-гладіатор: кремезний боєць у бронзовому шоломі з гребенем,
    // зі щитом у лівій руці й коротким мечем (гладіусом) у правій.
    rig = makeHumanoid(Object.assign(common, {
      scale: 1.22, belly: 1.35, armsForward: 0.85, headR: 0.24, lean: -0.12,
      skin: 0x7a6354, shirt: 0x8a5a32, pants: 0x6e4a2a, shoes: 0x3a2a1c,
      eyeWhite: 0xffe08a, pupilColor: 0xc62828, brow: 0.5,
      sleeves: 'skin', mouth: 'open', teeth: true, nose: false,
    }));
    const bronzeM = toonMat(0xc89b4a, 0x8a6a2a, 0.25);   // бронза/латунь
    const bronzeD = toonMat(0xb0863a);
    const crestM = toonMat(0xc62828);   // багряний кінський гребінь
    // 🪖 бронзовий шолом-каска (галея) з нащічниками
    const helm = sphere(0.3, bronzeM, 14, 10);
    helm.position.y = 0.2;
    helm.scale.set(1.04, 0.82, 1.04);
    rig.parts.head.add(helm);
    const rim = cylinder(0.31, 0.33, 0.06, bronzeD, 14);
    rim.position.y = 0.1;
    rig.parts.head.add(rim);
    // нащічники
    for (const side of [-1, 1]) {
      const cheek = box(0.07, 0.18, 0.18, bronzeD);
      cheek.position.set(side * 0.26, -0.02, -0.04);
      rig.parts.head.add(cheek);
    }
    // переніссник
    const nasal = box(0.06, 0.2, 0.06, bronzeD);
    nasal.position.set(0, 0.02, -0.27);
    rig.parts.head.add(nasal);
    // 🔺 поперечний кінський гребінь (crista) — головна впізнавана риса
    for (let i = 0; i < 7; i++) {
      const h = 0.26 - Math.abs(i - 3) * 0.04;
      const tuft = box(0.05, h, 0.07, crestM);
      tuft.position.set(0, 0.46, 0.16 - i * 0.05);
      rig.parts.head.add(tuft);
    }
    // бронзовий нагрудник (мускульна кіраса)
    const cuirass = box(0.5, 0.5, 0.16, bronzeM);
    cuirass.position.set(0, 0.34, -0.26);
    rig.parts.torso.add(cuirass);
    // наплічник на правому плечі
    const pauldron = sphere(0.18, bronzeD, 8, 6);
    pauldron.position.set(0.36, 0.56, 0);
    pauldron.scale.set(1.2, 0.7, 1.2);
    rig.parts.torso.add(pauldron);
    // 🛡️ круглий щит (parma) у лівій руці
    const shield = cylinder(0.34, 0.34, 0.07, bronzeD, 16);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(0, -0.42, -0.18);
    const boss = sphere(0.1, bronzeM, 10, 8);   // умбон у центрі щита
    boss.position.set(0, -0.42, -0.26);
    rig.parts.armL.add(shield, boss);
    // ⚔️ короткий меч (гладіус) у правій руці
    const bladeM = toonMat(0xc9d0d8);
    const blade = box(0.07, 0.62, 0.03, bladeM);
    blade.position.set(0, -0.78, 0);
    const hilt = box(0.16, 0.07, 0.07, toonMat(0x6b4226));
    hilt.position.set(0, -0.46, 0);
    const pommel = sphere(0.06, bronzeD, 8, 6);
    pommel.position.set(0, -0.4, 0);
    rig.parts.armR.add(blade, hilt, pommel);
    rig.ztype = 'gladiator';
    addZombieWear(rig);
    return rig;
  } else if (type === 'imp') {
    // 🧟 шкет: дрібний і дуже швидкий зомбі — впізнавано МАЛЕНЬКИЙ (≈0.66 зросту),
    // велика голова й вирячені очі надають хижого «дитячого» вигляду
    rig = makeHumanoid(Object.assign(common, {
      scale: 0.66, belly: 0.78, armsForward: 1.5, headR: 0.3, lean: -0.18,
      eyeWhite: 0xfff0a0, eyeL: 0.1, eyeR: 0.1, pupilColor: 0xc62828, brow: 0.2,
    }));
    rig.ztype = 'imp';
    addZombieWear(rig);
    return rig;
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
  // 🇹🇷 Паша Кебаб: оксамитовий жилет, феска і шампур
  sultan: {
    skin: 0x7eb054, shirt: 0x8c2f3e, pants: 0x3a3050, shoes: 0x2e2620,
    eyeWhite: 0xffe9b8, pupilColor: 0x8a4a1a, browColor: 0x3a2a20,
  },
  // 🇪🇬 Фараон Тут-Анх-Зомб: бинти і золото
  pharaoh: {
    skin: 0xb8c49a, shirt: 0xe8e0cc, pants: 0xd9d2bc, shoes: 0xc9b88a,
    eyeWhite: 0x9be8ff, pupilColor: 0x1a6a8a, browColor: 0x8a6a2a,
  },
  // 🇪🇸 Матадор-зомбі: бичача шкура, золотий «traje de luces» (костюм світла)
  matador: {
    skin: 0x6e5a52, shirt: 0xffd23f, pants: 0xc62828, shoes: 0x2a2220,
    eyeWhite: 0xffd24a, pupilColor: 0xc62828, browColor: 0x2e2620,
  },
  // 🇮🇹 Цезар-зомбі (бос Італії): бронзова кіраса, багряна туніка, золото імператора
  gladiator: {
    skin: 0x7a6354, shirt: 0x8c2f3e, pants: 0xc89b4a, shoes: 0x3a2a1c,
    eyeWhite: 0xffe08a, pupilColor: 0xc62828, browColor: 0x2e2620,
  },
  // 🇯🇵 Сумо-зомбі (бос Японії): рожево-засмагла шкіра рікісі, маваші-пояс, тьонмаге
  sumo: {
    skin: 0xd9a48f, shirt: 0x6b2233, pants: 0x2e2838, shoes: 0x2a2220,
    eyeWhite: 0xfff0e0, pupilColor: 0x3a2a20, browColor: 0x2e2620,
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
  } else if (style === 'sultan') {
    // 🍢 феска з китицею
    const fezM = toonMat(0xb4262f);
    const fez = cylinder(0.2, 0.24, 0.22, fezM, 12);
    fez.position.set(0, 0.42, 0);
    fez.rotation.z = 0.1;
    const tassel = sphere(0.06, toonMat(0xffd23f), 6, 5);
    tassel.position.set(0.16, 0.5, 0);
    rig.parts.head.add(fez, tassel);
    // закручені вуса
    const mouM = toonMat(0x2e2620);
    for (const side of [-1, 1]) {
      const mou = box(0.14, 0.045, 0.03, mouM);
      mou.position.set(side * 0.1, 0.05, -0.21);
      mou.rotation.z = side * 0.55;
      const curl = sphere(0.035, mouM, 6, 5);
      curl.position.set(side * 0.18, 0.1, -0.21);
      rig.parts.head.add(mou, curl);
    }
    // золотий пояс-кушак і жилет
    const sash = box(0.66, 0.16, 0.5, toonMat(0xffd23f, 0xcc8800, 0.2));
    sash.position.set(0, 0.06, 0);
    rig.parts.torso.add(sash);
    // 🍢 величезний шампур із шматками кебаба в руці
    const skewer = cylinder(0.035, 0.035, 1.05, toonMat(0x9aa3ad), 6);
    skewer.position.set(0, -0.62, 0);
    const meatM = toonMat(0xa85636);
    for (let i = 0; i < 3; i++) {
      const meat = sphere(0.1, meatM, 8, 6);
      meat.position.set(0, -0.45 - i * 0.22, 0);
      meat.scale.set(1, 0.8, 1);
      rig.parts.armL.add(meat);
    }
    rig.parts.armL.add(skewer);
  } else if (style === 'pharaoh') {
    // 👑 немес — смугаста хустка фараона
    const nemesM = toonMat(0x3f7fc4);
    const goldM = toonMat(0xffd23f, 0xcc8800, 0.3);
    const hood = sphere(0.3, nemesM, 12, 9);
    hood.position.set(0, 0.28, 0.04);
    hood.scale.set(1.05, 0.85, 1.1);
    rig.parts.head.add(hood);
    for (const side of [-1, 1]) {
      const flap = box(0.16, 0.42, 0.07, nemesM);
      flap.position.set(side * 0.22, 0.0, 0.0);
      flap.rotation.z = side * 0.12;
      rig.parts.head.add(flap);
    }
    const band = box(0.45, 0.09, 0.3, goldM);
    band.position.set(0, 0.34, -0.12);
    rig.parts.head.add(band);
    // золота кобра на чолі
    const cobra = cone(0.045, 0.16, goldM, 6);
    cobra.position.set(0, 0.44, -0.22);
    rig.parts.head.add(cobra);
    // бинти мумії поверх тіла
    const wrapM = toonMat(0xd9d2bc);
    for (let i = 0; i < 3; i++) {
      const wrap = box(0.58, 0.07, 0.5, wrapM);
      wrap.position.set(0, 0.05 + i * 0.22, 0);
      wrap.rotation.y = (i % 2 ? 0.18 : -0.14);
      rig.parts.torso.add(wrap);
    }
    // золотий комір-усех
    const collar = cylinder(0.34, 0.42, 0.1, goldM, 12);
    collar.position.set(0, 0.62, 0);
    rig.parts.torso.add(collar);
    // посох-анкх у руці
    const staff = cylinder(0.03, 0.03, 1.0, goldM, 6);
    staff.position.set(0, -0.6, 0);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 6, 12), goldM);
    loop.position.set(0, -1.12, 0);
    rig.parts.armL.add(staff, loop);
  } else if (style === 'matador') {
    // 🐂 МАТАДОР-ЗОМБІ: велетенський зомбі-бик у золотому костюмі тореадора
    const hornM = toonMat(0xe8dcc4);
    const goldM = toonMat(0xffd23f, 0xcc8800, 0.3);
    const capeM = toonMat(0xc62828);   // червоний плащ-мулета
    // величезні бичачі роги
    for (const side of [-1, 1]) {
      const horn = cone(0.1, 0.5, hornM, 8);
      horn.position.set(side * 0.24, 0.34, -0.06);
      horn.rotation.z = side * -1.1;
      horn.rotation.x = -0.3;
      rig.parts.head.add(horn);
      const tip = sphere(0.08, hornM, 7, 6);
      tip.position.set(side * 0.46, 0.5, -0.1);
      rig.parts.head.add(tip);
    }
    // бичача морда + ніздряне кільце
    const snout = box(0.3, 0.2, 0.18, toonMat(0x5a4a42));
    snout.position.set(0, -0.04, -0.27);
    rig.parts.head.add(snout);
    const nring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), goldM);
    nring.position.set(0, -0.1, -0.37);
    nring.rotation.x = Math.PI / 2;
    rig.parts.head.add(nring);
    // montera — чорний капелюх тореадора
    const hat = sphere(0.26, toonMat(0x2a2620), 14, 10);
    hat.position.set(0, 0.34, 0);
    hat.scale.set(1, 0.8, 1.05);
    rig.parts.head.add(hat);
    for (const side of [-1, 1]) {
      const bobble = sphere(0.1, toonMat(0x2a2620), 8, 6);
      bobble.position.set(side * 0.26, 0.34, 0);
      rig.parts.head.add(bobble);
    }
    // золота вишивка на куртці (traje de luces) + еполети
    for (const side of [-1, 1]) {
      const epaulet = sphere(0.16, goldM, 8, 6);
      epaulet.position.set(side * 0.34, 0.5, 0);
      epaulet.scale.set(1, 0.6, 1);
      rig.parts.torso.add(epaulet);
    }
    for (let i = 0; i < 3; i++) {
      const braid = box(0.4, 0.05, 0.02, goldM);
      braid.position.set(0, 0.42 - i * 0.18, -0.3);
      rig.parts.torso.add(braid);
    }
    // червоний кушак
    const sash = box(0.6, 0.16, 0.5, capeM);
    sash.position.set(0, 0.0, 0);
    rig.parts.torso.add(sash);
    // 🔴 червоний плащ-мулета на лівій руці
    const cape = box(0.55, 0.85, 0.05, capeM);
    cape.position.set(0, -0.5, 0.05);
    cape.rotation.x = 0.12;
    rig.parts.armL.add(cape);
    // 🗡️ бандерилья (прикрашений дротик) у правій руці
    const dartM = toonMat(0x8a6a3a);
    const dart = cylinder(0.025, 0.025, 0.9, dartM, 6);
    dart.position.set(0, -0.6, 0);
    const dartTip = cone(0.05, 0.14, toonMat(0xb0b0b8), 6);
    dartTip.position.set(0, -1.08, 0);
    dartTip.rotation.x = Math.PI;
    for (const c of [0xc62828, 0xffd23f]) {
      const ribbon = box(0.12, 0.18, 0.02, toonMat(c));
      ribbon.position.set(c === 0xc62828 ? -0.07 : 0.07, -0.1, 0);
      rig.parts.armR.add(ribbon);
    }
    rig.parts.armR.add(dart, dartTip);
  } else if (style === 'gladiator') {
    // 👑 ЦЕЗАР-ЗОМБІ: велетенський зомбі-імператор-гладіатор у бронзовій кірасі,
    // зі шоломом-гребенем, лавровим вінком і великим списом-пілумом.
    const bronzeM = toonMat(0xc89b4a, 0x8a6a2a, 0.3);
    const bronzeD = toonMat(0xb0863a);
    const goldM = toonMat(0xffd23f, 0xcc8800, 0.3);
    const crestM = toonMat(0xc62828);     // багряний гребінь
    const laurelM = toonMat(0x57a83e);    // лавровий вінок
    // 🪖 величезний бронзовий шолом
    const helm = sphere(0.34, bronzeM, 16, 12);
    helm.position.y = 0.2;
    helm.scale.set(1.05, 0.86, 1.05);
    rig.parts.head.add(helm);
    const rim = cylinder(0.36, 0.38, 0.07, bronzeD, 16);
    rim.position.y = 0.08;
    rig.parts.head.add(rim);
    const nasal = box(0.07, 0.24, 0.07, bronzeD);
    nasal.position.set(0, 0.0, -0.31);
    rig.parts.head.add(nasal);
    // 🔺 високий поздовжній гребінь (crista)
    for (let i = 0; i < 9; i++) {
      const h = 0.4 - Math.abs(i - 4) * 0.05;
      const tuft = box(0.06, h, 0.09, crestM);
      tuft.position.set(0, 0.56, 0.22 - i * 0.055);
      rig.parts.head.add(tuft);
    }
    // 🌿 лавровий вінок поверх шолома (золото імперії)
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 6, 16), laurelM);
    wreath.rotation.x = Math.PI / 2 - 0.1;
    wreath.position.y = 0.28;
    rig.parts.head.add(wreath);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = box(0.07, 0.04, 0.12, laurelM);
      leaf.position.set(Math.cos(a) * 0.33, 0.3, Math.sin(a) * 0.33);
      leaf.rotation.y = -a;
      rig.parts.head.add(leaf);
    }
    // бронзова мускульна кіраса з золотим орлом (aquila)
    const cuirass = box(0.66, 0.6, 0.16, bronzeM);
    cuirass.position.set(0, 0.36, -0.4);
    rig.parts.torso.add(cuirass);
    const eagle = box(0.22, 0.22, 0.05, goldM);
    eagle.position.set(0, 0.42, -0.49);
    eagle.rotation.z = 0.78;
    rig.parts.torso.add(eagle);
    // багряний імператорський плащ (палудаментум) за спиною
    const cloak = box(0.74, 1.0, 0.06, crestM);
    cloak.position.set(0, 0.1, 0.44);
    rig.parts.torso.add(cloak);
    // золоті наплічники-фібули
    for (const side of [-1, 1]) {
      const fib = sphere(0.14, goldM, 8, 6);
      fib.position.set(side * 0.4, 0.62, 0.1);
      rig.parts.torso.add(fib);
    }
    // птеруги (шкіряні смуги спідниці-броні)
    for (let i = -2; i <= 2; i++) {
      const strip = box(0.14, 0.34, 0.05, toonMat(0x8a5a32));
      strip.position.set(i * 0.16, -0.18, -0.34);
      rig.parts.torso.add(strip);
    }
    // 🔱 великий спис-пілум у правій руці
    const spearM = toonMat(0x8a6a3a);
    const shaft = cylinder(0.05, 0.05, 1.6, spearM, 8);
    shaft.position.set(0, -0.5, 0);
    const tip = cone(0.09, 0.32, toonMat(0xc9d0d8), 8);
    tip.position.set(0, -1.4, 0);
    tip.rotation.x = Math.PI;
    rig.parts.armR.add(shaft, tip);
    // 🛡️ великий прямокутний щит (scutum) у лівій руці
    const scutum = box(0.55, 0.85, 0.08, crestM);
    scutum.position.set(0, -0.5, -0.16);
    const scBoss = sphere(0.12, goldM, 10, 8);
    scBoss.position.set(0, -0.5, -0.24);
    rig.parts.armL.add(scutum, scBoss);
  } else if (style === 'sumo') {
    // 🇯🇵 СУМО-ЗОМБІ: велетень-рікісі. Пузо вже задано belly:1.7; підсилюємо торс
    // і вішаємо маваші-пояс (лобовий «щит» у стилі щитоносця, але суто візуальний).
    rig.parts.torso.scale.set(1.22, 1.04, 1.22);
    const hairM = toonMat(0x2a221c);
    const bun = sphere(0.1, hairM, 10, 8); bun.position.set(0, 0.4, 0.02);
    const knot = cylinder(0.04, 0.05, 0.12, hairM, 8); knot.position.set(0, 0.34, 0.08); knot.rotation.x = 0.5;
    rig.parts.head.add(bun, knot);
    for (const side of [-1, 1]) {
      const cheek = sphere(0.11, toonMat(0xd9a48f), 8, 6); // пухкі щоки
      cheek.position.set(side * 0.16, -0.04, -0.14);
      rig.parts.head.add(cheek);
    }
    const beltM = toonMat(0x6b2233, 0x3a121c, 0.2);
    const belt = box(0.78, 0.34, 0.62, beltM); belt.position.set(0, -0.18, 0); // маваші-пояс
    rig.parts.torso.add(belt);
    for (let i = -2; i <= 2; i++) {
      const cord = box(0.05, 0.3, 0.04, toonMat(0xe8c84a)); // сагарі — золоті шнури спереду
      cord.position.set(i * 0.13, -0.42, -0.32);
      rig.parts.torso.add(cord);
    }
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

// ---------- Палітра кастом-героя (фіксована, нуль вільного тексту) ----------
export const HERO_PALETTE = {
  skin: [0xffc9a3, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffd9b3, 0xd9f0a3, 0xbfa6ff],
  shirt: [0x2f80c3, 0xe14b4b, 0x46b340, 0xf5a623, 0x8e44ad, 0x16a085, 0xec407a, 0x34495e],
  pants: [0x474f63, 0x2d3436, 0x6b4f3a, 0x2c3e50, 0x7f8c8d, 0x512e5f, 0x1e6f5c, 0x9b2d2d],
  shoes: [0x303642, 0xffffff, 0xe14b4b, 0x2f80c3, 0xf5a623, 0x2d3436],
  hatColor: [0x2f80c3, 0xe14b4b, 0x46b340, 0xf5a623, 0x8e44ad, 0xf4c430, 0xffffff, 0x34495e],
};

// частини редактора героя (id → метадані для UI; геометрію будує buildHeroHat / faceSpec)
export const HERO_HATS = {
  none: { name: t('Без шапки'), icon: '🚫' },
  cap: { name: t('Кепка'), icon: '🧢' },
  beanie: { name: t('Шапочка'), icon: '🧶' },
  cowboy: { name: t('Капелюх'), icon: '🤠' },
  crown: { name: t('Корона'), icon: '👑' },
  ears: { name: t('Вушка'), icon: '🐻' },
  party: { name: t('Ковпак'), icon: '🥳' },
};
export const HERO_FACES = {
  smile: { name: t('Усмішка'), icon: '🙂' },
  grin: { name: t('Сміх'), icon: '😄' },
  cool: { name: t('Крутий'), icon: '😎' },
};

// будує обрану шапку на голові героя (headG = rig.parts.head), колір hatColor
export function buildHeroHat(headG, hatId, hatColor) {
  const m = toonMat(hatColor != null ? hatColor : 0x2f80c3);
  if (hatId === 'cap') {
    const top = sphere(0.275, m, 16, 10); top.position.y = 0.2; top.scale.set(1, 0.62, 1); headG.add(top);
    const brim = box(0.26, 0.04, 0.2, m); brim.position.set(0, 0.16, -0.22); headG.add(brim);
  } else if (hatId === 'beanie') {
    const top = sphere(0.285, m, 16, 10); top.position.y = 0.16; top.scale.set(1, 0.7, 1); headG.add(top);
    const band = cylinder(0.29, 0.29, 0.07, toonMat(0xffffff), 16); band.position.y = 0.05; headG.add(band);
    const pom = sphere(0.06, toonMat(0xffffff), 10, 8); pom.position.y = 0.34; headG.add(pom);
  } else if (hatId === 'cowboy') {
    const brim = cylinder(0.4, 0.4, 0.035, m, 18); brim.position.y = 0.12; headG.add(brim);
    const crown = cylinder(0.2, 0.23, 0.18, m, 14); crown.position.y = 0.22; headG.add(crown);
  } else if (hatId === 'crown') {
    const gold = toonMat(0xf4c430, 0xf4c430, 0.25);
    const band = cylinder(0.26, 0.26, 0.1, gold, 14); band.position.y = 0.22; headG.add(band);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const sp = cone(0.04, 0.1, gold, 5); sp.position.set(Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24); headG.add(sp); }
  } else if (hatId === 'ears') {
    for (const side of [-1, 1]) { const ear = sphere(0.08, m, 10, 8); ear.position.set(0.14 * side, 0.26, 0); headG.add(ear); const inr = sphere(0.045, toonMat(0xeaa6b0), 8, 6); inr.position.set(0.14 * side, 0.27, -0.04); headG.add(inr); }
  } else if (hatId === 'party') {
    const cone1 = cone(0.16, 0.34, m, 14); cone1.position.y = 0.34; headG.add(cone1);
    const pom = sphere(0.05, toonMat(0xffffff), 8, 6); pom.position.y = 0.52; headG.add(pom);
  }
}

// параметри обличчя для makeHumanoid (+ чи додавати окуляри для 'cool')
function faceSpec(faceId) {
  if (faceId === 'grin') return { mouth: 'open', teeth: true, glasses: false };
  if (faceId === 'cool') return { mouth: 'smile', teeth: false, glasses: true };
  return { mouth: 'smile', teeth: false, glasses: false };
}

// ---------- Скіни героя ----------
export const HERO_SKINS = {
  classic: { name: t('Класик'), icon: '🧢', desc: t('Перевірений герой у кепці') },
  ninja: { name: t('Ніндзя'), icon: '🥷', desc: t('Тихий, як тінь') },
  astro: { name: t('Космонавт'), icon: '👨‍🚀', desc: t('Прямо з орбіти') },
  pirate: { name: t('Пірат'), icon: '🏴‍☠️', desc: t('Йо-хо-хо!') },
  robot: { name: t('Робот'), icon: '🤖', desc: t('Біп-буп, зомбі!') },
  frog: { name: t('Жабеня'), icon: '🐸', desc: t('Ква проти зомбі (з Мегабокса)') },
  super: { name: t('Супергерой'), icon: '🦸', desc: t('Плащ майорить! (з Мегабокса)') },
  hunter: { name: t('Нічний мисливець'), icon: '🌙', desc: t('Шторм, хвиля 12') },
  thunder: { name: t('Громовідвід'), icon: '⚡', desc: t('Шторм, хвиля 16') },
  legend: { name: t('Легенда'), icon: '🏆', desc: t('Зоряний шлях, рівень 25') },
  knight: { name: t('Лицар'), icon: '🛡️', desc: t('Зоряний шлях, рівень 30') },
  custom: { name: t('Мій герой'), icon: '🎨', desc: t('Твої кольори') },
};

// ---------- Танці (емоції) ----------
export const DANCES = {
  shuffle: { name: t('Денс'), icon: '🕺', desc: t('Класика перемоги') },
  spin: { name: t('Дзиґа'), icon: '🌪️', desc: t('Крутись, як вихор!') },
  robot: { name: t('Робот'), icon: '🤖', desc: t('Біп-буп-денс') },
  wave: { name: t('Хвиля'), icon: '🌊', desc: t('Котить хвилю руками') },
  jump: { name: t('Стрибунець'), icon: '🦘', desc: t('Радісні підскоки (з Мегабокса)') },
  chicken: { name: t('Курча'), icon: '🐤', desc: t('Кудкудак! (з Мегабокса)') },
  lightning: { name: t('Блискавка'), icon: '⚡', desc: t('Шторм, хвиля 8') },
};

// ---------- Сліди куль ----------
export const TRACERS = {
  classic: { name: t('Класичні'), icon: '➖' },
  gold: { name: t('Золоті'), icon: '✨' },
  rainbow: { name: t('Веселкові'), icon: '🌈' },
  storm: { name: t('Штормові'), icon: '🌩️' },
  neon: { name: t('Неонові'), icon: '🟢' },
  royal: { name: t('Королівські'), icon: '👑' },
};

export function makeHero(skinId = 'classic', heroColors = null) {
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
    // 🌙 Нічний мисливець: темний плащ із каптуром, місячні очі
    hunter() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xd9c2a8, shirt: 0x1d2433, pants: 0x161c28, shoes: 0x10141d,
        eyeL: 0.07, eyeR: 0.07, eyeWhite: 0xaee8ff, pupilColor: 0x2255aa,
        mouth: 'smile', mouthColor: 0x6a4b3a, brow: -0.1, cast: 'all', sleeves: 'shirt',
      });
      const hoodM = toonMat(0x222b3d);
      const hood = sphere(0.3, hoodM, 16, 12);
      hood.position.set(0, 0.16, 0.05);
      hood.scale.set(1.02, 1.0, 1.08);
      rig.parts.head.add(hood);
      const peak = cone(0.1, 0.22, hoodM, 8);
      peak.position.set(0, 0.34, 0.12);
      peak.rotation.x = 0.7;
      rig.parts.head.add(peak);
      // місячний кулон
      const moon = sphere(0.06, toonMat(0xcfe2ff, 0x88aaff, 0.6), 8, 6);
      moon.position.set(0, 0.42, -0.24);
      rig.parts.torso.add(moon);
      // плащ за спиною
      const cape = box(0.5, 0.78, 0.05, toonMat(0x1a2233));
      cape.position.set(0, 0.05, 0.27);
      cape.rotation.x = -0.08;
      rig.parts.torso.add(cape);
      return rig;
    },
    // ⚡ Громовідвід: синьо-золотий, блискавка на грудях
    thunder() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xffc9a3, shirt: 0x2b4a8c, pants: 0x21304f, shoes: 0xffd23f,
        eyeL: 0.062, eyeR: 0.062, mouth: 'smile', mouthColor: 0x8a4b3a,
        brow: -0.06, cast: 'all', sleeves: 'shirt',
      });
      const boltM = toonMat(0xffd23f, 0xffaa00, 0.7);
      // зигзаг-блискавка на грудях із трьох сегментів
      for (const [bx, by, rz] of [[0.05, 0.36, -0.5], [-0.03, 0.22, 0.55], [0.05, 0.08, -0.5]]) {
        const seg = box(0.07, 0.17, 0.04, boltM);
        seg.position.set(bx, by, -0.25);
        seg.rotation.z = rz;
        rig.parts.torso.add(seg);
      }
      // золоті браслети
      for (const side of ['armL', 'armR']) {
        const band = cylinder(0.085, 0.085, 0.07, boltM, 10);
        band.position.y = -0.42;
        rig.parts[side].add(band);
      }
      // шпичка-громовідвід на голові
      const rod = cylinder(0.02, 0.02, 0.22, toonMat(0xc9d4e2), 6);
      rod.position.y = 0.4;
      const tip = sphere(0.04, boltM, 6, 5);
      tip.position.y = 0.52;
      rig.parts.head.add(rod, tip);
      return rig;
    },
    // 🏆 Легенда: золотий герой із лавровим вінком
    legend() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xffd9a8, shirt: 0xc9a227, pants: 0x8a6f1d, shoes: 0x6e5a18,
        eyeL: 0.06, eyeR: 0.06, mouth: 'smile', mouthColor: 0x8a4b3a,
        brow: -0.08, cast: 'all', sleeves: 'shirt',
      });
      const goldM = toonMat(0xffd23f, 0xcc8800, 0.45);
      // лавровий вінок
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        if (Math.abs(a - Math.PI) < 0.5) continue; // потилицю лишаємо
        const leaf = box(0.1, 0.04, 0.03, goldM);
        leaf.position.set(Math.cos(a) * 0.27, 0.18, Math.sin(a) * 0.27);
        leaf.rotation.y = -a;
        rig.parts.head.add(leaf);
      }
      // сяюча зірка на грудях
      const star = sphere(0.08, goldM, 8, 6);
      star.position.set(0, 0.3, -0.26);
      rig.parts.torso.add(star);
      // плащ переможця
      const cape = box(0.52, 0.8, 0.05, toonMat(0xb4262f));
      cape.position.set(0, 0.04, 0.27);
      cape.rotation.x = -0.08;
      rig.parts.torso.add(cape);
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
    // 🛡️ Лицар: сталеві лати, шолом із плюмажем, золотий хрест — за зірковий шлях 30
    knight() {
      const rig = makeHumanoid({
        scale: 1.0, skin: 0xe8c4a0, shirt: 0xc4ccd6, pants: 0x8a929c, shoes: 0x5a626c,
        eyeL: 0.056, eyeR: 0.056, mouth: 'smile', mouthColor: 0x8a4b3a, brow: -0.1, cast: 'all', sleeves: 'shirt',
      });
      const steel = toonMat(0xc4ccd6), dark = toonMat(0x6b7280), gold = toonMat(0xf4c430, 0xf4c430, 0.25);
      // шолом із прорізом-візором
      const helm = sphere(0.285, steel, 16, 12); helm.position.y = 0.13; helm.scale.set(1.02, 1.06, 1.02); rig.parts.head.add(helm);
      const visor = box(0.3, 0.07, 0.06, dark); visor.position.set(0, 0.18, -0.255); rig.parts.head.add(visor);
      const plume = cone(0.05, 0.24, gold, 8); plume.position.set(0, 0.42, 0.04); rig.parts.head.add(plume);
      // золотий хрест на нагруднику (перед = -Z)
      const cv = box(0.07, 0.22, 0.04, gold); cv.position.set(0, 0.14, -0.26); rig.parts.torso.add(cv);
      const ch = box(0.18, 0.07, 0.04, gold); ch.position.set(0, 0.18, -0.26); rig.parts.torso.add(ch);
      // наплічники
      for (const side of [-1, 1]) { const p = sphere(0.12, steel, 10, 8); p.position.set(0.27 * side, 0.34, 0); p.scale.set(1, 0.7, 1); rig.parts.torso.add(p); }
      return rig;
    },
    custom() {
      const hc = heroColors || {};
      const f = faceSpec(hc.face || 'smile');
      const rig = makeHumanoid({
        scale: 1.0,
        skin: hc.skin || 0xffc9a3, shirt: hc.shirt || 0x2f80c3, pants: hc.pants || 0x474f63,
        shoes: hc.shoes != null ? hc.shoes : 0x303642,
        eyeL: 0.058, eyeR: 0.058, mouth: f.mouth, teeth: f.teeth, mouthColor: 0x8a4b3a, brow: -0.08, cast: 'all',
      });
      // 🎩 обрана шапка (колір hatColor); за замовчуванням кепка кольору сорочки
      const hatId = hc.hat || 'cap';
      const hatCol = hc.hatColor != null ? hc.hatColor : (hc.shirt || 0x2f80c3);
      buildHeroHat(rig.parts.head, hatId, hatCol);
      // 😎 окуляри для «крутого» обличчя
      if (f.glasses) {
        const gl = box(0.34, 0.07, 0.04, toonMat(0x1a1a1a)); gl.position.set(0, 0.07, -0.235); rig.parts.head.add(gl);
      }
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
  } else if (kind === 'laser') {
    // 🔫 Лазер: футуристична зброя з ціановою «лінзою» на дулі
    const cyanM = toonMat(0x2bd6e0, 0x0f8a92, 0.5);
    const glowM = toonMat(0x9ffcff, 0x4fe0ff, 0.85);
    const body = box(0.08, 0.12, 0.42, midM);
    body.position.z = -0.1;
    const topFin = box(0.04, 0.05, 0.34, cyanM);
    topFin.position.set(0, 0.09, -0.12);
    const emitter = cylinder(0.05, 0.07, 0.22, darkM, 10);
    emitter.rotation.x = Math.PI / 2;
    emitter.position.set(0, 0.02, -0.4);
    const lens = cylinder(0.055, 0.055, 0.04, glowM, 12);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 0.02, -0.52);
    const coil1 = cylinder(0.062, 0.062, 0.03, cyanM, 10);
    coil1.rotation.x = Math.PI / 2;
    coil1.position.set(0, 0.02, -0.32);
    const coil2 = cylinder(0.062, 0.062, 0.03, cyanM, 10);
    coil2.rotation.x = Math.PI / 2;
    coil2.position.set(0, 0.02, -0.22);
    const grip = box(0.05, 0.13, 0.07, darkM);
    grip.position.set(0, -0.1, 0.06);
    grip.rotation.x = -0.28;
    const cell = box(0.06, 0.1, 0.12, glowM); // енергоблок-«балон»
    cell.position.set(0, -0.05, 0.16);
    const stock = box(0.05, 0.1, 0.16, midM);
    stock.position.set(0, -0.02, 0.24);
    g.add(body, topFin, emitter, lens, coil1, coil2, grip, cell, stock);
    muzzle.position.set(0, 0.02, -0.56);
  } else if (kind === 'flamethrower') {
    // 🔥 Вогнемет: широке сопло + балон-резервуар
    const redM = toonMat(0xc0392b, 0x7a2018, 0.3);
    const tank = cylinder(0.08, 0.08, 0.3, redM, 12); // балон
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, -0.04, 0.18);
    const tankCap = cylinder(0.085, 0.085, 0.05, accentM, 12);
    tankCap.rotation.z = Math.PI / 2;
    tankCap.position.set(0.16, -0.04, 0.18);
    const body = box(0.07, 0.1, 0.34, midM);
    body.position.z = -0.06;
    const pipe = cylinder(0.022, 0.022, 0.4, darkM, 8);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(0, 0.02, -0.26);
    const nozzle = cylinder(0.06, 0.035, 0.14, darkM, 12); // розтруб сопла
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(0, 0.02, -0.5);
    const pilot = cone(0.025, 0.07, accentM, 8); // вогник-запальник
    pilot.rotation.x = -Math.PI / 2;
    pilot.position.set(0.05, 0.06, -0.5);
    const grip = box(0.05, 0.13, 0.07, darkM);
    grip.position.set(0, -0.1, 0.04);
    grip.rotation.x = -0.25;
    const grip2 = box(0.05, 0.1, 0.06, darkM);
    grip2.position.set(0, -0.07, -0.2);
    g.add(tank, tankCap, body, pipe, nozzle, pilot, grip, grip2);
    muzzle.position.set(0, 0.02, -0.58);
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
// 🐾 УЛЮБЛЕНЦІ (процедурні моделі в стилі makeDog)
// Кожен білдер повертає { group, head, legs|wings, tail, phase } —
// Pet.update анімує наявні частини за типом руху (quad/bird/hop).
// ============================================================

// спільні милі очі з відблиском
function petEyes(headG, dx, dy, dz, r = 0.028, color = 0x141414) {
  for (const side of [-1, 1]) {
    const eye = sphere(r, toonMat(color), 8, 6);
    eye.position.set(dx * side, dy, dz);
    headG.add(eye);
    const glint = sphere(r * 0.42, toonMat(0xffffff), 6, 5);
    glint.position.set(dx * side - 0.008, dy + 0.012, dz - 0.012);
    headG.add(glint);
  }
}

// 🐱 кошеня: струнке, трикутні вушка, вуса, довгий хвіст
export function makeCat() {
  const root = new THREE.Group();
  const furM = toonMat(0x9aa0a6), darkM = toonMat(0x6f757b), pinkM = toonMat(0xe79aa6);
  const body = capsule(0.12, 0.28, furM); body.rotation.x = Math.PI / 2; body.position.y = 0.3; body.castShadow = true; root.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 0.46, -0.22);
  const head = sphere(0.13, furM, 14, 10); head.castShadow = true; headG.add(head);
  const muzzle = sphere(0.07, toonMat(0xc7ccd1), 10, 8); muzzle.position.set(0, -0.03, -0.1); muzzle.scale.set(1, 0.7, 0.8); headG.add(muzzle);
  const nose = sphere(0.02, pinkM, 8, 6); nose.position.set(0, -0.01, -0.15); headG.add(nose);
  petEyes(headG, 0.06, 0.04, -0.11, 0.026, 0x6bbf59);
  for (const side of [-1, 1]) {
    const ear = cone(0.055, 0.12, furM, 4); ear.position.set(0.075 * side, 0.13, 0.01); ear.rotation.z = -0.18 * side; headG.add(ear);
    const earIn = cone(0.028, 0.07, pinkM, 4); earIn.position.set(0.075 * side, 0.135, -0.005); earIn.rotation.z = -0.18 * side; headG.add(earIn);
    for (const wy of [-0.025, 0.005]) { const wh = cylinder(0.003, 0.003, 0.14, darkM, 4); wh.rotation.z = Math.PI / 2; wh.position.set(0.11 * side, wy, -0.12); headG.add(wh); }
  }
  root.add(headG);
  const legs = [];
  for (const [lx, lz] of [[-0.07, -0.13], [0.07, -0.13], [-0.07, 0.13], [0.07, 0.13]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.22, lz);
    const lm = capsule(0.032, 0.14, furM, 3, 8); lm.position.y = -0.09; leg.add(lm);
    const paw = sphere(0.038, darkM, 8, 6); paw.position.y = -0.18; leg.add(paw);
    root.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.38, 0.2);
  const t1 = capsule(0.032, 0.2, furM, 3, 8); t1.position.y = 0.11; t1.rotation.x = -0.5; tail.add(t1);
  const t2 = sphere(0.042, darkM, 8, 6); t2.position.set(0, 0.24, -0.06); tail.add(t2);
  root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🦊 лисеня: руде, біла грудка, великі вуха, пухнастий хвіст із білим кінчиком
export function makeFox() {
  const root = new THREE.Group();
  const furM = toonMat(0xe08234), whiteM = toonMat(0xf4ece0), darkM = toonMat(0x2b2622);
  const body = capsule(0.12, 0.28, furM); body.rotation.x = Math.PI / 2; body.position.y = 0.3; body.castShadow = true; root.add(body);
  const chest = sphere(0.11, whiteM, 10, 8); chest.position.set(0, 0.28, -0.16); chest.scale.set(0.9, 0.9, 0.7); root.add(chest);
  const headG = new THREE.Group(); headG.position.set(0, 0.46, -0.24);
  const head = sphere(0.13, furM, 14, 10); head.castShadow = true; headG.add(head);
  const snout = cone(0.07, 0.16, furM, 8); snout.rotation.x = -Math.PI / 2; snout.position.set(0, -0.02, -0.15); headG.add(snout);
  const snoutW = cone(0.05, 0.1, whiteM, 8); snoutW.rotation.x = -Math.PI / 2; snoutW.position.set(0, -0.04, -0.17); headG.add(snoutW);
  const nose = sphere(0.025, darkM, 8, 6); nose.position.set(0, -0.02, -0.24); headG.add(nose);
  petEyes(headG, 0.06, 0.05, -0.1, 0.026, 0x241c14);
  for (const side of [-1, 1]) {
    const ear = cone(0.06, 0.16, furM, 4); ear.position.set(0.08 * side, 0.16, 0.02); ear.rotation.z = -0.12 * side; headG.add(ear);
    const earT = cone(0.03, 0.07, darkM, 4); earT.position.set(0.08 * side, 0.22, 0.02); earT.rotation.z = -0.12 * side; headG.add(earT);
  }
  root.add(headG);
  const legs = [];
  for (const [lx, lz] of [[-0.07, -0.13], [0.07, -0.13], [-0.07, 0.13], [0.07, 0.13]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.22, lz);
    const lm = capsule(0.034, 0.15, darkM, 3, 8); lm.position.y = -0.09; leg.add(lm);
    root.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.36, 0.22);
  const t1 = capsule(0.07, 0.22, furM, 4, 10); t1.position.y = 0.12; t1.rotation.x = -0.6; tail.add(t1);
  const t2 = sphere(0.07, whiteM, 10, 8); t2.position.set(0, 0.26, -0.08); tail.add(t2);
  root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🐼 панда: округла, чорні лапи/вуха/плями навколо очей
export function makePanda() {
  const root = new THREE.Group();
  const whiteM = toonMat(0xf2f2ee), blackM = toonMat(0x2a2a2e);
  const body = capsule(0.18, 0.2, whiteM); body.rotation.x = Math.PI / 2; body.position.y = 0.34; body.castShadow = true; root.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 0.56, -0.18);
  const head = sphere(0.17, whiteM, 16, 12); head.castShadow = true; headG.add(head);
  const snout = sphere(0.06, whiteM, 8, 6); snout.position.set(0, -0.04, -0.14); headG.add(snout);
  const nose = sphere(0.025, blackM, 8, 6); nose.position.set(0, -0.02, -0.18); headG.add(nose);
  for (const side of [-1, 1]) {
    const patch = sphere(0.05, blackM, 8, 6); patch.position.set(0.07 * side, 0.03, -0.12); patch.scale.set(1, 1.3, 0.6); patch.rotation.z = 0.4 * side; headG.add(patch);
    const ear = sphere(0.055, blackM, 8, 6); ear.position.set(0.12 * side, 0.15, 0.02); headG.add(ear);
  }
  petEyes(headG, 0.07, 0.04, -0.14, 0.022, 0x111111);
  root.add(headG);
  const legs = [];
  for (const [lx, lz] of [[-0.1, -0.12], [0.1, -0.12], [-0.1, 0.12], [0.1, 0.12]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.24, lz);
    const lm = capsule(0.055, 0.12, blackM, 3, 8); lm.position.y = -0.09; leg.add(lm);
    root.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.34, 0.2);
  const tm = sphere(0.05, whiteM, 8, 6); tm.position.y = 0.04; tail.add(tm); root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🐰 зайчик: довгі вуха, пухнастий хвостик, великі задні лапи (рух hop)
export function makeBunny() {
  const root = new THREE.Group();
  const furM = toonMat(0xe9e2d6), pinkM = toonMat(0xeaa6b0), darkM = toonMat(0x4a4038);
  const body = capsule(0.12, 0.16, furM); body.position.y = 0.26; body.castShadow = true; root.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 0.46, -0.06);
  const head = sphere(0.12, furM, 14, 10); head.castShadow = true; headG.add(head);
  const nose = sphere(0.02, pinkM, 8, 6); nose.position.set(0, -0.01, -0.12); headG.add(nose);
  petEyes(headG, 0.06, 0.02, -0.1, 0.028, 0x3a2a2a);
  for (const side of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(0.05 * side, 0.12, 0.0); ear.rotation.z = -0.12 * side;
    const eo = capsule(0.035, 0.22, furM, 3, 8); eo.position.y = 0.13; ear.add(eo);
    const ei = capsule(0.02, 0.18, pinkM, 3, 6); ei.position.set(0, 0.13, -0.025); ear.add(ei);
    headG.add(ear);
  }
  root.add(headG);
  const legs = [];
  // передні маленькі
  for (const lx of [-0.07, 0.07]) { const leg = new THREE.Group(); leg.position.set(lx, 0.16, -0.08); const lm = capsule(0.03, 0.08, furM, 3, 6); lm.position.y = -0.06; leg.add(lm); root.add(leg); legs.push(leg); }
  // задні великі
  for (const lx of [-0.09, 0.09]) { const leg = new THREE.Group(); leg.position.set(lx, 0.14, 0.1); const foot = capsule(0.045, 0.1, furM, 3, 8); foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.05, 0.02); leg.add(foot); root.add(leg); legs.push(leg); }
  const tail = new THREE.Group(); tail.position.set(0, 0.3, 0.16);
  const tm = sphere(0.05, toonMat(0xffffff), 8, 6); tail.add(tm); root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🐸 жабка: широкий рот, опуклі очі зверху, перетинчасті лапи (рух hop)
export function makeFrog() {
  const root = new THREE.Group();
  const skinM = toonMat(0x6fbf4a), bellyM = toonMat(0xd6e8a8), darkM = toonMat(0x2c2c2c);
  const body = sphere(0.18, skinM, 16, 12); body.position.y = 0.18; body.scale.set(1, 0.8, 1.05); body.castShadow = true; root.add(body);
  const belly = sphere(0.13, bellyM, 12, 8); belly.position.set(0, 0.12, -0.08); belly.scale.set(1, 0.7, 0.7); root.add(belly);
  const headG = new THREE.Group(); headG.position.set(0, 0.2, -0.12);
  // широкий рот-усмішка
  const mouth = box(0.18, 0.02, 0.02, darkM); mouth.position.set(0, 0.0, -0.06); headG.add(mouth);
  for (const side of [-1, 1]) {
    const bulge = sphere(0.06, skinM, 10, 8); bulge.position.set(0.08 * side, 0.12, -0.02); headG.add(bulge);
    const eye = sphere(0.04, toonMat(0xf4d03f), 8, 6); eye.position.set(0.08 * side, 0.15, -0.04); headG.add(eye);
    const pupil = sphere(0.018, darkM, 6, 5); pupil.position.set(0.08 * side, 0.15, -0.075); headG.add(pupil);
  }
  root.add(headG);
  const legs = [];
  for (const lx of [-0.12, 0.12]) { const leg = new THREE.Group(); leg.position.set(lx, 0.1, -0.08); const lm = capsule(0.025, 0.06, skinM, 3, 6); lm.position.y = -0.04; leg.add(lm); const foot = sphere(0.05, skinM, 8, 6); foot.scale.set(1.4, 0.4, 1); foot.position.set(0, -0.08, -0.04); leg.add(foot); root.add(leg); legs.push(leg); }
  for (const lx of [-0.14, 0.14]) { const leg = new THREE.Group(); leg.position.set(lx, 0.1, 0.1); const lm = capsule(0.03, 0.1, skinM, 3, 6); lm.rotation.x = -0.6; lm.position.y = -0.04; leg.add(lm); const foot = sphere(0.06, skinM, 8, 6); foot.scale.set(1.5, 0.4, 1.1); foot.position.set(0, -0.1, 0.06); leg.add(foot); root.add(leg); legs.push(leg); }
  return { group: root, head: headG, legs, tail: null, phase: Math.random() * 6 };
}

// 🐧 пінгвін: чорна спинка, біле черевце, дзьоб і ластами (waddle = quad)
export function makePenguin() {
  const root = new THREE.Group();
  const blackM = toonMat(0x2b3138), whiteM = toonMat(0xf4f4f0), orangeM = toonMat(0xf2912e);
  const body = capsule(0.15, 0.18, blackM); body.position.y = 0.32; body.castShadow = true; root.add(body);
  const belly = capsule(0.12, 0.16, whiteM); belly.position.set(0, 0.3, -0.06); belly.scale.set(0.9, 1, 0.6); root.add(belly);
  const headG = new THREE.Group(); headG.position.set(0, 0.58, -0.02);
  const head = sphere(0.13, blackM, 14, 10); head.castShadow = true; headG.add(head);
  const face = sphere(0.1, whiteM, 12, 8); face.position.set(0, -0.01, -0.07); face.scale.set(0.9, 1, 0.5); headG.add(face);
  const beak = cone(0.05, 0.1, orangeM, 8); beak.rotation.x = -Math.PI / 2; beak.position.set(0, -0.02, -0.14); headG.add(beak);
  petEyes(headG, 0.05, 0.03, -0.1, 0.024, 0x111111);
  root.add(headG);
  // ласти як «лапи» для анімації махів
  const legs = [];
  for (const side of [-1, 1]) { const w = new THREE.Group(); w.position.set(0.15 * side, 0.34, 0); const wm = capsule(0.03, 0.16, blackM, 3, 8); wm.position.y = -0.06; wm.rotation.z = 0.3 * side; w.add(wm); root.add(w); legs.push(w); }
  // ноги
  for (const lx of [-0.06, 0.06]) { const f = box(0.08, 0.03, 0.12, orangeM); f.position.set(lx, 0.16, -0.04); root.add(f); }
  const tail = new THREE.Group(); tail.position.set(0, 0.2, 0.14); const tm = cone(0.06, 0.1, blackM, 6); tm.rotation.x = Math.PI / 2 + 0.4; tail.add(tm); root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🐢 черепашка: купол-панцир із візерунком, коротенькі лапки
export function makeTurtle() {
  const root = new THREE.Group();
  const shellM = toonMat(0x4f7c3a), shellD = toonMat(0x3a5e2a), skinM = toonMat(0xb6c46a);
  const shell = sphere(0.22, shellM, 14, 8); shell.position.y = 0.26; shell.scale.set(1, 0.6, 1.2); shell.castShadow = true; root.add(shell);
  const rim = cylinder(0.24, 0.24, 0.06, shellD, 16); rim.position.y = 0.18; root.add(rim);
  // шестикутні плитки на панцирі
  for (const [hx, hz] of [[0, 0], [0.1, -0.12], [-0.1, -0.12], [0.1, 0.12], [-0.1, 0.12], [0, 0.18], [0, -0.2]]) {
    const tile = cylinder(0.05, 0.05, 0.03, shellD, 6); tile.position.set(hx, 0.34, hz); root.add(tile);
  }
  const headG = new THREE.Group(); headG.position.set(0, 0.22, -0.26);
  const head = sphere(0.09, skinM, 12, 8); head.castShadow = true; headG.add(head);
  petEyes(headG, 0.04, 0.02, -0.06, 0.02, 0x111111);
  root.add(headG);
  const legs = [];
  for (const [lx, lz] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.14, lz);
    const lm = capsule(0.05, 0.04, skinM, 3, 8); lm.rotation.z = Math.PI / 2; lm.position.y = -0.04; leg.add(lm);
    root.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.18, 0.24); const tm = cone(0.04, 0.1, skinM, 6); tm.rotation.x = Math.PI / 2; tail.add(tm); root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🦜 папуга: яскравий, гнутий дзьоб, чубчик, кольорові крила (рух bird)
export function makeParrot() {
  const root = new THREE.Group();
  const redM = toonMat(0xe8403a), blueM = toonMat(0x2f7fe0), yellowM = toonMat(0xf4c430), darkM = toonMat(0x222222);
  const body = capsule(0.1, 0.2, redM); body.position.y = 0.34; body.castShadow = true; root.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 0.52, -0.04);
  const head = sphere(0.1, redM, 12, 10); head.castShadow = true; headG.add(head);
  // гнутий дзьоб
  const beakU = cone(0.05, 0.1, darkM, 8); beakU.rotation.x = -Math.PI / 2 - 0.4; beakU.position.set(0, -0.01, -0.1); headG.add(beakU);
  const beakL = cone(0.035, 0.05, toonMat(0x444444), 8); beakL.rotation.x = -Math.PI / 2 - 0.1; beakL.position.set(0, -0.05, -0.08); headG.add(beakL);
  // чубчик
  for (const cy of [-0.03, 0, 0.03]) { const cf = cone(0.02, 0.08, yellowM, 5); cf.position.set(cy, 0.11, 0.02); cf.rotation.x = 0.3; headG.add(cf); }
  petEyes(headG, 0.06, 0.02, -0.05, 0.022, 0x111111);
  root.add(headG);
  // крила (для махів)
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(0.08 * side, 0.4, 0.02);
    const wm = box(0.04, 0.04, 0.22, blueM); wm.position.set(0.06 * side, 0, 0); w.add(wm);
    const tip = box(0.03, 0.03, 0.1, yellowM); tip.position.set(0.12 * side, 0, 0.02); w.add(tip);
    root.add(w); wings.push(w);
  }
  // хвостове пір'я
  const tail = new THREE.Group(); tail.position.set(0, 0.32, 0.16);
  for (const [tx, tc] of [[-0.03, blueM], [0, yellowM], [0.03, blueM]]) { const tf = box(0.025, 0.02, 0.2, tc); tf.position.set(tx, 0, 0.08); tf.rotation.x = 0.3; tail.add(tf); }
  root.add(tail);
  return { group: root, head: headG, wings, tail, phase: Math.random() * 6 };
}

// 🦖 динозаврик: зелений Т-рекс, велика голова з зубами, шипи, довгий хвіст
export function makeDino() {
  const root = new THREE.Group();
  const skinM = toonMat(0x5bbf6a), bellyM = toonMat(0xcfe89a), darkM = toonMat(0x214a2a);
  const body = capsule(0.14, 0.22, skinM); body.rotation.x = Math.PI / 2 - 0.3; body.position.y = 0.34; body.castShadow = true; root.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 0.56, -0.2);
  const head = sphere(0.14, skinM, 14, 10); head.scale.set(1, 0.95, 1.2); head.castShadow = true; headG.add(head);
  const jaw = box(0.16, 0.06, 0.16, skinM); jaw.position.set(0, -0.08, -0.06); headG.add(jaw);
  // зуби
  for (const tx of [-0.05, 0, 0.05]) { const tooth = cone(0.015, 0.05, toonMat(0xffffff), 4); tooth.rotation.x = Math.PI; tooth.position.set(tx, -0.04, -0.14); headG.add(tooth); }
  petEyes(headG, 0.07, 0.06, -0.1, 0.026, 0xf2c20a);
  root.add(headG);
  // спинні шипи
  for (let i = 0; i < 5; i++) { const sp = cone(0.03, 0.09, darkM, 4); sp.position.set(0, 0.5 - i * 0.02, -0.1 + i * 0.09); root.add(sp); }
  // великі задні ноги
  const legs = [];
  for (const lx of [-0.1, 0.1]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.26, 0.04);
    const thigh = capsule(0.06, 0.12, skinM, 3, 8); thigh.position.y = -0.08; leg.add(thigh);
    const foot = box(0.08, 0.04, 0.14, darkM); foot.position.set(0, -0.18, -0.04); leg.add(foot);
    root.add(leg); legs.push(leg);
  }
  // крихітні ручки
  for (const side of [-1, 1]) { const arm = capsule(0.02, 0.06, skinM, 3, 6); arm.position.set(0.1 * side, 0.42, -0.12); arm.rotation.x = -0.6; root.add(arm); }
  const tail = new THREE.Group(); tail.position.set(0, 0.36, 0.2);
  const t1 = capsule(0.07, 0.18, skinM, 4, 8); t1.rotation.x = Math.PI / 2 - 0.2; t1.position.set(0, -0.02, 0.12); tail.add(t1);
  const t2 = cone(0.05, 0.14, skinM, 8); t2.rotation.x = Math.PI / 2 - 0.2; t2.position.set(0, -0.05, 0.28); tail.add(t2);
  root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🐉 дракончик: роги, крильця (легкий мах), шипи, лусочка
export function makeDragon() {
  const root = new THREE.Group();
  const skinM = toonMat(0x8e44d6), bellyM = toonMat(0xe4c0ff), hornM = toonMat(0xf4e3b0), darkM = toonMat(0x5a2a8a);
  const body = capsule(0.13, 0.22, skinM); body.rotation.x = Math.PI / 2; body.position.y = 0.34; body.castShadow = true; root.add(body);
  const headG = new THREE.Group(); headG.position.set(0, 0.54, -0.22);
  const head = sphere(0.13, skinM, 14, 10); head.castShadow = true; headG.add(head);
  const snout = box(0.1, 0.07, 0.1, skinM); snout.position.set(0, -0.03, -0.14); headG.add(snout);
  for (const nx of [-0.025, 0.025]) { const nostril = sphere(0.012, darkM, 6, 5); nostril.position.set(nx, -0.02, -0.19); headG.add(nostril); }
  petEyes(headG, 0.06, 0.05, -0.1, 0.026, 0xf2c20a);
  for (const side of [-1, 1]) { const horn = cone(0.025, 0.12, hornM, 6); horn.position.set(0.06 * side, 0.14, 0.04); horn.rotation.z = 0.3 * side; horn.rotation.x = -0.3; headG.add(horn); }
  root.add(headG);
  // крильця кажана: пласкі віяла, що махають (тонкі по Y, широкі по X/Z)
  const wings = [];
  for (const side of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(0.09 * side, 0.46, 0.02);
    const memb = box(0.22, 0.02, 0.18, bellyM); memb.position.set(0.14 * side, 0, -0.01); w.add(memb);
    // кісткові «пальці» по передньому краю
    const bone = capsule(0.012, 0.2, darkM, 3, 6); bone.rotation.z = Math.PI / 2; bone.position.set(0.14 * side, 0.012, -0.08); w.add(bone);
    for (let f = 0; f < 3; f++) { const fr = capsule(0.008, 0.12, darkM, 3, 5); fr.position.set((0.04 + f * 0.08) * side, 0.012, 0.0); w.add(fr); }
    root.add(w); wings.push(w);
  }
  for (let i = 0; i < 5; i++) { const sp = cone(0.025, 0.07, hornM, 4); sp.position.set(0, 0.48 - i * 0.02, -0.08 + i * 0.08); root.add(sp); }
  const legs = [];
  for (const [lx, lz] of [[-0.08, -0.12], [0.08, -0.12], [-0.08, 0.12], [0.08, 0.12]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.24, lz);
    const lm = capsule(0.04, 0.12, skinM, 3, 8); lm.position.y = -0.09; leg.add(lm); root.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.34, 0.22);
  const t1 = capsule(0.05, 0.2, skinM, 4, 8); t1.rotation.x = Math.PI / 2 - 0.2; t1.position.set(0, -0.02, 0.12); tail.add(t1);
  const t2 = cone(0.06, 0.1, hornM, 4); t2.rotation.x = Math.PI; t2.position.set(0, 0.0, 0.26); tail.add(t2);
  root.add(tail);
  return { group: root, head: headG, legs, wings, tail, phase: Math.random() * 6 };
}

// 🦄 єдиноріг: білий, золотий ріг, веселкова грива і хвіст
export function makeUnicorn() {
  const root = new THREE.Group();
  const bodyM = toonMat(0xf6f0fb), hornM = toonMat(0xf4c430, 0xf4c430, 0.3), hoofM = toonMat(0xd9b3e0);
  const RB = [0xff5e7a, 0xffa64d, 0xf4d03f, 0x6bd47a, 0x4db3ff, 0xb06bff];
  const body = capsule(0.13, 0.3, bodyM); body.rotation.x = Math.PI / 2; body.position.y = 0.42; body.castShadow = true; root.add(body);
  const neck = capsule(0.07, 0.12, bodyM); neck.position.set(0, 0.52, -0.22); neck.rotation.x = -0.5; root.add(neck);
  const headG = new THREE.Group(); headG.position.set(0, 0.66, -0.3);
  const head = sphere(0.1, bodyM, 14, 10); head.scale.set(1, 1, 1.25); head.castShadow = true; headG.add(head);
  petEyes(headG, 0.06, 0.0, -0.08, 0.026, 0x3a2a4a);
  for (const side of [-1, 1]) { const ear = cone(0.03, 0.08, bodyM, 5); ear.position.set(0.05 * side, 0.12, 0.04); headG.add(ear); }
  // золотий спіральний ріг
  const horn = cone(0.03, 0.18, hornM, 8); horn.position.set(0, 0.16, -0.06); horn.rotation.x = -0.3; headG.add(horn);
  // веселкова грива
  for (let i = 0; i < 6; i++) { const m = sphere(0.04, toonMat(RB[i]), 8, 6); m.position.set(0, 0.1 - i * 0.04, -0.02 + i * 0.03); headG.add(m); }
  root.add(headG);
  const legs = [];
  for (const [lx, lz] of [[-0.08, -0.15], [0.08, -0.15], [-0.08, 0.15], [0.08, 0.15]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.32, lz);
    const lm = capsule(0.04, 0.2, bodyM, 3, 8); lm.position.y = -0.12; leg.add(lm);
    const hoof = cylinder(0.045, 0.045, 0.05, hoofM, 8); hoof.position.y = -0.24; leg.add(hoof);
    root.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.46, 0.24);
  for (let i = 0; i < 6; i++) { const tf = capsule(0.022, 0.12, toonMat(RB[i]), 3, 6); tf.position.set((i - 2.5) * 0.018, -0.02, 0.04); tf.rotation.x = -0.7; tail.add(tf); }
  root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// 🤖 робо-пес: металевий, світні очі, антена, боксова форма
export function makeRoboPet() {
  const root = new THREE.Group();
  const metalM = toonMat(0x9aa7b4), darkM = toonMat(0x4a5560), eyeM = toonMat(0x33e0ff, 0x33e0ff, 0.9);
  const body = box(0.3, 0.2, 0.42, metalM); body.position.y = 0.36; body.castShadow = true; root.add(body);
  const panel = box(0.18, 0.1, 0.02, darkM); panel.position.set(0, 0.36, -0.22); root.add(panel);
  const headG = new THREE.Group(); headG.position.set(0, 0.52, -0.24);
  const head = box(0.2, 0.18, 0.18, metalM); head.castShadow = true; headG.add(head);
  const visor = box(0.18, 0.06, 0.02, darkM); visor.position.set(0, 0.02, -0.1); headG.add(visor);
  for (const side of [-1, 1]) { const eye = sphere(0.025, eyeM, 8, 6); eye.position.set(0.05 * side, 0.02, -0.11); headG.add(eye); const ear = box(0.03, 0.08, 0.03, darkM); ear.position.set(0.1 * side, 0.12, 0); headG.add(ear); }
  const antenna = cylinder(0.008, 0.008, 0.12, darkM, 6); antenna.position.set(0, 0.16, 0.04); headG.add(antenna);
  const bulb = sphere(0.025, eyeM, 8, 6); bulb.position.set(0, 0.23, 0.04); headG.add(bulb);
  root.add(headG);
  const legs = [];
  for (const [lx, lz] of [[-0.11, -0.16], [0.11, -0.16], [-0.11, 0.16], [0.11, 0.16]]) {
    const leg = new THREE.Group(); leg.position.set(lx, 0.26, lz);
    const lm = box(0.06, 0.18, 0.06, darkM); lm.position.y = -0.09; leg.add(lm);
    const foot = box(0.08, 0.04, 0.1, metalM); foot.position.y = -0.18; leg.add(foot);
    root.add(leg); legs.push(leg);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.44, 0.22);
  const tm = cylinder(0.02, 0.02, 0.16, darkM, 6); tm.position.y = 0.06; tm.rotation.x = -0.7; tail.add(tm);
  const tb = sphere(0.03, eyeM, 8, 6); tb.position.set(0, 0.14, -0.06); tail.add(tb);
  root.add(tail);
  return { group: root, head: headG, legs, tail, phase: Math.random() * 6 };
}

// реєстр улюбленців (id → метадані + білдер + тип руху для Pet.update)
export const PETS = {
  dog: { name: t('Песик Дружок'), icon: '🐶', desc: t('Збирає монети і гавкає на сюрпризи!'), make: makeDog, move: 'quad' },
  cat: { name: t('Кошеня Мурчик'), icon: '🐱', desc: t('Спритне кошеня — мчить по монетки.'), make: makeCat, move: 'quad' },
  fox: { name: t('Лисеня Руде'), icon: '🦊', desc: t('Хитре лисеня з пухнастим хвостом.'), make: makeFox, move: 'quad' },
  panda: { name: t('Панда Бамбук'), icon: '🐼', desc: t('Гладка панда — найкращий обнімашка.'), make: makePanda, move: 'quad' },
  bunny: { name: t('Зайчик Стриб'), icon: '🐰', desc: t('Скаче поряд і збирає монетки.'), make: makeBunny, move: 'hop' },
  frog: { name: t('Жабка Кваки'), icon: '🐸', desc: t('Стрибуча жабка з великими очима.'), make: makeFrog, move: 'hop' },
  penguin: { name: t('Пінгвін Льодик'), icon: '🐧', desc: t('Перевальцем тупає за тобою.'), make: makePenguin, move: 'quad' },
  turtle: { name: t('Черепашка Панцир'), icon: '🐢', desc: t('Повільна, зате з міцним панциром.'), make: makeTurtle, move: 'quad' },
  parrot: { name: t('Папуга Барвій'), icon: '🦜', desc: t('Літає поряд і махає крилами.'), make: makeParrot, move: 'bird' },
  dino: { name: t('Динозаврик Рекс'), icon: '🦖', desc: t('Маленький Т-рекс — грізний друг!'), make: makeDino, move: 'quad' },
  dragon: { name: t('Дракончик Іскра'), icon: '🐉', desc: t('Махає крильцями — справжній дракон!'), make: makeDragon, move: 'quad' },
  unicorn: { name: t('Єдиноріг Зоря'), icon: '🦄', desc: t('Чарівний ріг і веселкова грива.'), make: makeUnicorn, move: 'quad' },
  robo: { name: t('Робо-пес Болт'), icon: '🤖', desc: t('Залізний друг зі світними очима.'), make: makeRoboPet, move: 'quad' },
};

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
// 🤖 сторожова турель: тринога + обертова голова з дулом
export function makeTurretMesh() {
  const g = new THREE.Group();
  const metalM = toonMat(0x5a6470);
  const darkM = toonMat(0x37404f);
  const accentM = toonMat(0x4fd8ff, 0x2288cc, 0.4);
  // тринога
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cylinder(0.05, 0.07, 0.85, darkM, 6);
    leg.position.set(Math.cos(a) * 0.34, 0.38, Math.sin(a) * 0.34);
    leg.rotation.z = Math.cos(a) * 0.45;
    leg.rotation.x = -Math.sin(a) * 0.45;
    g.add(leg);
  }
  // стійка і корпус
  const post = cylinder(0.09, 0.11, 0.5, metalM, 8);
  post.position.y = 0.85;
  g.add(post);
  // обертова голова
  const head = new THREE.Group();
  head.position.y = 1.18;
  const body = box(0.42, 0.3, 0.5, metalM);
  const eye = sphere(0.075, accentM, 8, 6);
  eye.position.set(0, 0.05, -0.27);
  const barrel = cylinder(0.045, 0.045, 0.5, darkM, 7);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.12, -0.04, -0.4);
  const barrelTip = cylinder(0.06, 0.06, 0.08, accentM, 7);
  barrelTip.rotation.x = Math.PI / 2;
  barrelTip.position.set(0.12, -0.04, -0.66);
  const antenna = cylinder(0.015, 0.015, 0.3, darkM, 5);
  antenna.position.set(-0.14, 0.28, 0.1);
  const antTip = sphere(0.035, toonMat(0xff5d5d, 0xff2222, 0.6), 6, 5);
  antTip.position.set(-0.14, 0.44, 0.1);
  head.add(body, eye, barrel, barrelTip, antenna, antTip);
  g.add(head);
  // дуло (для трасерів)
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.12, -0.04, -0.7);
  head.add(muzzle);
  return { group: g, head, muzzle };
}

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
