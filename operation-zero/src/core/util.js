// Utilitários matemáticos sem dependência do Three.js (testáveis em Node).
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const angleWrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
// Gerador pseudoaleatório determinístico (mapas procedurais reprodutíveis).
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
// Interseção raio x AABB (método das lajes). Retorna [tEntrada, tSaída, eixoNormal, sinal] ou null.
export function rayAABB(ox, oy, oz, dx, dy, dz, min, max, tMax) {
  let t0 = 0, t1 = tMax, axis = -1, sign = 0;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [min.x, min.y, min.z], mx = [max.x, max.y, max.z];
  let inside = true;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
      continue;
    }
    const inv = 1 / d[i];
    let tn = (mn[i] - o[i]) * inv, tf = (mx[i] - o[i]) * inv, s = -1;
    if (tn > tf) { const tmp = tn; tn = tf; tf = tmp; s = 1; }
    if (tn > t0) { t0 = tn; axis = i; sign = s; inside = false; }
    if (tf < t1) t1 = tf;
    if (t0 > t1) return null;
  }
  if (axis === -1 && !inside) return null;
  return [t0, t1, axis, sign];
}
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, tMax) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  if (t < 0 || t > tMax) return null;
  return t;
}
