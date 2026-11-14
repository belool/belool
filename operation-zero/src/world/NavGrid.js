// ================================================================
// NAVGRID — grade de navegação 2D + A* com suavização de caminho.
// Independente do Three.js (testável em Node).
// ================================================================

export class NavGrid {
  constructor(minX, minZ, maxX, maxZ, cell = 1) {
    this.cell = cell;
    this.minX = minX; this.minZ = minZ;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.cover = new Uint8Array(this.w * this.h); // 1 = célula com obstáculo alto adjacente
    // Buffers reaproveitados pelo A*
    const n = this.w * this.h;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.visit = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.search = 0;
  }
  idx(ix, iz) { return iz * this.w + ix; }
  toCell(x, z) {
    return [Math.floor((x - this.minX) / this.cell), Math.floor((z - this.minZ) / this.cell)];
  }
  center(ix, iz) { return [this.minX + (ix + 0.5) * this.cell, this.minZ + (iz + 0.5) * this.cell]; }
  inside(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.w && iz < this.h; }
  walkable(ix, iz) { return this.inside(ix, iz) && !this.blocked[this.idx(ix, iz)]; }
  walkableAt(x, z) { const [ix, iz] = this.toCell(x, z); return this.walkable(ix, iz); }

  // Rasteriza obstáculos (caixas que bloqueiam a passagem de um soldado).
  rasterize(boxes, agentRadius = 0.4, region = null) {
    const r = agentRadius;
    let x0 = 0, z0 = 0, x1 = this.w - 1, z1 = this.h - 1;
    if (region) {
      [x0, z0] = this.toCell(region.minX - 1, region.minZ - 1);
      [x1, z1] = this.toCell(region.maxX + 1, region.maxZ + 1);
      x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(this.w - 1, x1); z1 = Math.min(this.h - 1, z1);
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) { this.blocked[this.idx(ix, iz)] = 0; this.cover[this.idx(ix, iz)] = 0; }
    }
    const high = [];
    // Uma célula é bloqueada se o SEU CENTRO estiver dentro do obstáculo expandido
    // pelo raio do agente (portas de 2,2 m sempre têm ao menos uma célula livre).
    const span = (a, b, origin) => [Math.ceil((a - origin) / this.cell - 0.5), Math.floor((b - origin) / this.cell - 0.5)];
    for (const b of boxes) {
      if (b.removed || b.noCollide) continue;
      if (b.min.y > 1.7 || b.max.y < 0.45) continue; // passa por baixo / sobe por cima
      if (region && (b.max.x < region.minX - 2 || b.min.x > region.maxX + 2 || b.max.z < region.minZ - 2 || b.min.z > region.maxZ + 2)) continue;
      const [ax, bx] = span(b.min.x - r, b.max.x + r, this.minX);
      const [az, bz] = span(b.min.z - r, b.max.z + r, this.minZ);
      for (let iz = Math.max(az, z0); iz <= Math.min(bz, z1); iz++)
        for (let ix = Math.max(ax, x0); ix <= Math.min(bx, x1); ix++) this.blocked[this.idx(ix, iz)] = 1;
      if (b.max.y >= 1.0 && !b.seeThrough) high.push(b);
    }
    // Pontos de cobertura: células livres vizinhas de obstáculos altos (>= 1 m).
    for (const b of high) {
      const [ax, bx] = span(b.min.x - r - this.cell, b.max.x + r + this.cell, this.minX);
      const [az, bz] = span(b.min.z - r - this.cell, b.max.z + r + this.cell, this.minZ);
      for (let iz = Math.max(az, z0); iz <= Math.min(bz, z1); iz++)
        for (let ix = Math.max(ax, x0); ix <= Math.min(bx, x1); ix++)
          if (!this.blocked[this.idx(ix, iz)]) this.cover[this.idx(ix, iz)] = 1;
    }
  }

  nearestWalkable(x, z, maxRing = 12) {
    let [cx, cz] = this.toCell(x, z);
    cx = Math.max(0, Math.min(this.w - 1, cx)); cz = Math.max(0, Math.min(this.h - 1, cz));
    if (this.walkable(cx, cz)) return [cx, cz];
    for (let r = 1; r <= maxRing; r++)
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        if (this.walkable(cx + dx, cz + dz)) return [cx + dx, cz + dz];
      }
    return null;
  }

  // A* com heurística octil. Retorna lista de pontos [x,z] no mundo ou null.
  findPath(sx, sz, tx, tz, maxIter = 20000) {
    const s = this.nearestWalkable(sx, sz), t = this.nearestWalkable(tx, tz);
    if (!s || !t) return null;
    const W = this.w;
    const start = this.idx(s[0], s[1]), goal = this.idx(t[0], t[1]);
    if (start === goal) return [[tx, tz]];
    const sid = ++this.search;
    const heap = new MinHeap();
    const H = (i) => {
      const dx = Math.abs((i % W) - t[0]), dz = Math.abs(((i / W) | 0) - t[1]);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    this.g[start] = 0; this.visit[start] = sid; this.parent[start] = -1;
    heap.push(start, H(start));
    let iter = 0, found = false;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (heap.size && iter++ < maxIter) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      if (this.closed[cur] === sid) continue;
      this.closed[cur] = sid;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (!this.walkable(nx, nz)) continue;
        if (k >= 4 && (!this.walkable(cx + DX[k], cz) || !this.walkable(cx, cz + DZ[k]))) continue; // sem cortar quinas
        const ni = nz * W + nx;
        if (this.closed[ni] === sid) continue;
        const ng = this.g[cur] + (k >= 4 ? 1.4142 : 1);
        if (this.visit[ni] !== sid || ng < this.g[ni]) {
          this.visit[ni] = sid; this.g[ni] = ng; this.parent[ni] = cur;
          heap.push(ni, ng + H(ni));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let c = goal; c !== -1; c = this.parent[c]) cells.push(c);
    cells.reverse();
    // Suavização (string pulling) por linha de visão na grade.
    const pts = [];
    let anchor = 0;
    for (let i = 1; i < cells.length; i++) {
      if (!this.gridLOS(cells[anchor], cells[i])) { pts.push(cells[i - 1]); anchor = i - 1; }
    }
    pts.push(cells[cells.length - 1]);
    const out = pts.map((c) => this.center(c % W, (c / W) | 0));
    out[out.length - 1] = [tx, tz];
    if (!this.walkableAt(tx, tz)) out[out.length - 1] = this.center(t[0], t[1]);
    return out;
  }

  gridLOS(a, b) {
    const W = this.w;
    let x0 = a % W, z0 = (a / W) | 0;
    const x1 = b % W, z1 = (b / W) | 0;
    const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;
    for (;;) {
      if (!this.walkable(x0, z0)) return false;
      if (x0 === x1 && z0 === z1) return true;
      const e2 = 2 * err;
      if (e2 > -dz && e2 < dx) { // passo diagonal: checa as duas laterais
        if (!this.walkable(x0 + sx, z0) || !this.walkable(x0, z0 + sz)) return false;
      }
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }

  // Células de cobertura num raio, para avaliação tática.
  coverCandidates(x, z, radius, max = 40) {
    const out = [];
    const [cx, cz] = this.toCell(x, z);
    const r = Math.ceil(radius / this.cell);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const ix = cx + dx, iz = cz + dz;
      if (!this.inside(ix, iz)) continue;
      const i = this.idx(ix, iz);
      if (this.cover[i] && !this.blocked[i]) {
        const [wx, wz] = this.center(ix, iz);
        out.push({ x: wx, z: wz, d: Math.hypot(wx - x, wz - z) });
      }
    }
    out.sort((a, b) => a.d - b.d);
    if (out.length > max) {
      // amostra distribuída para não favorecer só os mais próximos
      const step = out.length / max;
      const s = [];
      for (let i = 0; i < max; i++) s.push(out[Math.floor(i * step)]);
      return s;
    }
    return out;
  }

  randomWalkable(rng = Math.random, near = null, radius = 30) {
    for (let i = 0; i < 200; i++) {
      let x, z;
      if (near) { x = near[0] + (rng() * 2 - 1) * radius; z = near[1] + (rng() * 2 - 1) * radius; }
      else { x = this.minX + rng() * this.w * this.cell; z = this.minZ + rng() * this.h * this.cell; }
      if (this.walkableAt(x, z)) return [x, z];
    }
    return near ? [...near] : null;
  }
}

class MinHeap {
  constructor() { this.items = []; this.prio = []; }
  get size() { return this.items.length; }
  push(item, p) {
    const a = this.items, q = this.prio;
    a.push(item); q.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (q[par] <= q[i]) break;
      [a[par], a[i]] = [a[i], a[par]]; [q[par], q[i]] = [q[i], q[par]];
      i = par;
    }
  }
  pop() {
    const a = this.items, q = this.prio;
    const top = a[0];
    const la = a.pop(), lq = q.pop();
    if (a.length) {
      a[0] = la; q[0] = lq;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [q[m], q[i]] = [q[i], q[m]];
        i = m;
      }
    }
    return top;
  }
}
