// Математичні та допоміжні утиліти

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) { this.f = mulberry32(seed); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length) % arr.length]; }
  chance(p) { return this.f() < p; }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dampAngle = (a, b, lambda, dt) => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const dist2 = (x1, z1, x2, z2) => Math.hypot(x2 - x1, z2 - z1);

// Відстань від точки до відрізка у площині XZ
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// 2D value noise (детермінований, плавний)
export function makeNoise2D(seed) {
  const hash = (x, y) => {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fade(fx), v = fade(fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (lerp(lerp(a, b, u), lerp(c, d, u), v) * 2 - 1); // [-1, 1]
  };
}

export function makeFBM(seed, octaves = 3) {
  const n = makeNoise2D(seed);
  return function fbm(x, y) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += n(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5; freq *= 2.1;
    }
    return sum / norm;
  };
}

// Найближча точка між променем (o, d — нормалізований) і відрізком p0-p1.
// Повертає {dist, t (вздовж променя), u (0..1 вздовж відрізка)}
export function closestRaySeg(o, d, p0, p1) {
  const sx = p1.x - p0.x, sy = p1.y - p0.y, sz = p1.z - p0.z;
  const wx = o.x - p0.x, wy = o.y - p0.y, wz = o.z - p0.z;
  const b = d.x * sx + d.y * sy + d.z * sz;
  const c = sx * sx + sy * sy + sz * sz;
  const dd = d.x * wx + d.y * wy + d.z * wz;
  const e = sx * wx + sy * wy + sz * wz;
  const den = c - b * b;
  let u;
  if (den < 1e-8 || c < 1e-8) u = 0;
  else u = clamp((e - b * dd) / den, 0, 1);
  let t = d.x * (p0.x + sx * u - o.x) + d.y * (p0.y + sy * u - o.y) + d.z * (p0.z + sz * u - o.z);
  if (t < 0) t = 0;
  const px = o.x + d.x * t - (p0.x + sx * u);
  const py = o.y + d.y * t - (p0.y + sy * u);
  const pz = o.z + d.z * t - (p0.z + sz * u);
  return { dist: Math.hypot(px, py, pz), t, u };
}

// Промінь проти AABB (slab-метод). Повертає t входу або Infinity.
export function rayAABB(o, d, box) {
  let tmin = 0, tmax = Infinity;
  const axes = [
    [o.x, d.x, box.minX, box.maxX],
    [o.y, d.y, box.minY, box.maxY],
    [o.z, d.z, box.minZ, box.maxZ],
  ];
  for (const [ov, dv, lo, hi] of axes) {
    if (Math.abs(dv) < 1e-9) {
      if (ov < lo || ov > hi) return Infinity;
    } else {
      let t1 = (lo - ov) / dv, t2 = (hi - ov) / dv;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// Повне звільнення GPU-ресурсів об'єкта (унікальні геометрії/текстури)
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (!m) return;
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

export class Bus {
  constructor() { this.m = new Map(); }
  on(e, f) {
    if (!this.m.has(e)) this.m.set(e, []);
    this.m.get(e).push(f);
  }
  emit(e, ...a) { (this.m.get(e) || []).forEach((f) => f(...a)); }
}
