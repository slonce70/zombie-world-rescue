import * as THREE from 'three';

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
    gradMap.userData.shared = true;
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
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

const geoCache = new Map();
export function cachedGeo(key, make) {
  if (!geoCache.has(key)) {
    const g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

export function capsule(r, len, mat, capSeg = 5, radSeg = 12) {
  return new THREE.Mesh(cachedGeo(`cap|${r}|${len}|${capSeg}|${radSeg}`, () => new THREE.CapsuleGeometry(r, len, capSeg, radSeg)), mat);
}

export function sphere(r, mat, w = 16, h = 12) {
  return new THREE.Mesh(cachedGeo(`sph|${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h)), mat);
}

export function box(w, h, d, mat) {
  return new THREE.Mesh(cachedGeo(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), mat);
}

export function cone(r, h, mat, seg = 10) {
  return new THREE.Mesh(cachedGeo(`con|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat);
}

export function cylinder(rT, rB, h, mat, seg = 12) {
  return new THREE.Mesh(cachedGeo(`cyl|${rT}|${rB}|${h}|${seg}`, () => new THREE.CylinderGeometry(rT, rB, h, seg)), mat);
}

let bakedMat = null;
export function getBakedMat() {
  if (!bakedMat) {
    bakedMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getGradMap(), dithering: true });
    bakedMat.userData.shared = true;
  }
  return bakedMat;
}

// Обходить групу, запікає трансформи+кольори в плоскі буфери (position/normal/color),
// і за потреби добудовує outline-оболонку в ТИХ САМИХ масивах. Чиста генерація даних,
// без створення BufferGeometry/Mesh — щоб той самий результат міг лягти і в SkinnedMesh.
export function bakeGroupGeometry(group, { outline = 0 } = {}) {
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
  return { position: pos, normal: nor, color: col, count: total * copies };
}

export function bakeGroupMeshes(group, { castShadow = false, receiveShadow = false, outline = 0 } = {}) {
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) return null;
  const bakedData = bakeGroupGeometry(group, { outline });
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(bakedData.position, 3));
  mg.setAttribute('normal', new THREE.BufferAttribute(bakedData.normal, 3));
  mg.setAttribute('color', new THREE.BufferAttribute(bakedData.color, 3));
  for (const mesh of meshes) mesh.parent.remove(mesh);
  const baked = new THREE.Mesh(mg, getBakedMat());
  baked.castShadow = castShadow;
  baked.receiveShadow = receiveShadow;
  group.add(baked);
  return baked;
}
