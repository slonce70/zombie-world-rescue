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
export function closestRaySeg(o, d, p0, p1, out) {
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
  const dist = Math.hypot(px, py, pz);
  if (out) { out.dist = dist; out.t = t; out.u = u; return out; }
  return { dist, t, u };
}

// Звільнення GPU-ресурсів об'єкта. Спільні кеші (userData.shared — toonMat,
// gradientMap, запечені меші) НЕ чіпаємо: вони живуть на весь сеанс і
// переюзані всіма. Дзеркалить teardown у main.js — інакше влучання ракети чи
// вибух бочки диспозили б спільний матеріал → ривок GPU на телефоні.
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (!m || (m.userData && m.userData.shared)) return;
        if (m.map && !(m.map.userData && m.map.userData.shared)) m.map.dispose();
        m.dispose();
      });
    }
  });
}

// ---------- 🏔️ примітиви великого рельєфу для map.terrain(x,z) ----------
// Кожен повертає Δвисоту в точці; карта складає з них свій унікальний ландшафт.

// гірський гребінь уздовж відрізка: h на осі, плавний спад до 0 на відстані w
export function ridge(x, z, ax, az, bx, bz, h, w) {
  const d = distToSeg(x, z, ax, az, bx, bz);
  if (d >= w) return 0;
  const t = 1 - (d / w) * (d / w);
  return h * t * t;
}

// долина/каньйон — те саме, але вниз
export function valley(x, z, ax, az, bx, bz, depth, w) {
  return -ridge(x, z, ax, az, bx, bz, depth, w);
}

// плоскогір'я (меза) з крутим краєм: повна висота всередині r, спад на смузі edge
export function mesa(x, z, cx, cz, r, h, edge = 6) {
  const d = Math.hypot(x - cx, z - cz);
  return h * smoothstep(r + edge, r, d);
}

// терасований пагорб: конус, порізаний на сходинки stepH (виноградники, поля)
export function terraces(x, z, cx, cz, r, h, stepH = 1.1) {
  const d = Math.hypot(x - cx, z - cz);
  if (d >= r) return 0;
  const base = h * (1 - d / r);
  const lo = Math.floor(base / stepH) * stepH;
  const f = (base - lo) / stepH;
  // вузька крутая «стінка» між полицями, широка пласка полиця
  return lo + stepH * smoothstep(0.82, 0.98, f);
}

// поле дюн: дві хвилі під кутом — м'які піщані гряди
export function dunes(x, z, amp, wavelength = 46, angle = 0.5) {
  const u = x * Math.cos(angle) + z * Math.sin(angle);
  const v = -x * Math.sin(angle) + z * Math.cos(angle);
  const w1 = 0.5 + 0.5 * Math.sin((u / wavelength) * Math.PI * 2);
  const w2 = 0.5 + 0.5 * Math.sin((v / (wavelength * 2.3)) * Math.PI * 2 + 1.7);
  return amp * Math.pow(w1, 1.4) * (0.55 + 0.45 * w2);
}

// западина/кратер (озеро, оаза)
export function basin(x, z, cx, cz, r, depth, edge = 10) {
  const d = Math.hypot(x - cx, z - cz);
  return -depth * smoothstep(r + edge, r * 0.4, d);
}

export class Bus {
  constructor() { this.m = new Map(); }
  on(e, f) {
    if (!this.m.has(e)) this.m.set(e, []);
    this.m.get(e).push(f);
  }
  emit(e, ...a) { (this.m.get(e) || []).forEach((f) => f(...a)); }
}
