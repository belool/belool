import * as THREE from 'three';

// ================================================================
// MAP BUILDER — primitivas de level design (prédios exploráveis,
// paredes com portas/janelas, escadas, túneis, coberturas, árvores).
// Tudo gera AABBs de colisão no World + visuais extras.
// ================================================================

export class MapBuilder {
  constructor(world, rng) {
    this.world = world;
    this.rng = rng;
    this.trees = [];
    this.rocks = [];
    this.lamps = [];
    this.lootSpots = [];
    this.interiors = []; // retângulos internos (para spawn de saque / IA)
  }
  r(a = 0, b = 1) { return a + this.rng() * (b - a); }

  box(cx, cy, cz, sx, sy, sz, mat, opts) { return this.world.addBox(cx, cy, cz, sx, sy, sz, mat, opts); }
  slab(x0, z0, x1, z1, y0, y1, mat, opts) { return this.world.addBoxMinMax(x0, y0, z0, x1, y1, z1, mat, opts); }

  // Parede alinhada a um eixo, com aberturas (portas/janelas) ao longo do comprimento.
  // openings: [{ at: distância do início ao centro, w, y0, y1, glass }]
  wall(x0, z0, x1, z1, h, opts = {}) {
    const t = opts.thick ?? 0.3, mat = opts.mat ?? 'concrete', y0 = opts.y0 ?? 0;
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const sx = Math.min(x0, x1), sz = Math.min(z0, z1);
    const fixed = alongX ? z0 : x0;
    const segs = [];
    const ops = (opts.openings || []).slice().sort((a, b) => a.at - b.at);
    const seg = (a, b, ya, yb, extra = {}) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      const o = { ...extra };
      if (opts.destructible && !extra.mat) { o.destructible = true; o.hp = opts.hp ?? 120; o.explosiveOnly = opts.explosiveOnly; }
      const m = extra.mat || mat;
      if (alongX) segs.push(this.slab(sx + a, fixed - t / 2, sx + b, fixed + t / 2, y0 + ya, y0 + yb, m, { tint: opts.tint, ...o }));
      else segs.push(this.slab(fixed - t / 2, sz + a, fixed + t / 2, sz + b, y0 + ya, y0 + yb, m, { tint: opts.tint, ...o }));
    };
    // Com destruição: divide em módulos de 2 m para criar buracos localizados.
    const pieces = (a, b, ya, yb) => {
      if (!opts.destructible) return seg(a, b, ya, yb);
      const n = Math.max(1, Math.round((b - a) / 2));
      for (let i = 0; i < n; i++) seg(a + (b - a) * i / n, a + (b - a) * (i + 1) / n, ya, yb);
    };
    let cur = 0;
    for (const o of ops) {
      const a = Math.max(0, o.at - o.w / 2), b = Math.min(len, o.at + o.w / 2);
      pieces(cur, a, 0, h);
      seg(a, b, 0, o.y0);                // peitoril
      seg(a, b, o.y1, h);                // verga
      if (o.glass) seg(a, b, o.y0, o.y1, { mat: 'glass', destructible: true, hp: 1, thickOverride: true });
      cur = b;
    }
    pieces(cur, len, 0, h);
    return segs;
  }

  // Prédio explorável com portas, janelas, andares, escadas e telhado.
  building(cx, cz, w, d, o = {}) {
    const h = o.floorH ?? 3.4, floors = o.floors ?? 1, mat = o.mat ?? 'concrete', t = 0.3;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const doors = o.doors ?? ['s'];
    const win = o.windows !== false;
    const destructible = o.destructible ?? false;
    const sides = { n: [x0, z1, x1, z1, w], s: [x0, z0, x1, z0, w], w: [x0, z0, x0, z1, d], e: [x1, z0, x1, z1, d] };
    for (let f = 0; f < floors; f++) {
      for (const [k, [ax, az, bx, bz, len]] of Object.entries(sides)) {
        const openings = [];
        const doorCount = f === 0 ? doors.filter((s) => s === k).length : 0;
        const doorAt = [];
        for (let i = 0; i < doorCount; i++) doorAt.push(len * (i + 1) / (doorCount + 1));
        for (const at of doorAt) openings.push({ at, w: 2.2, y0: 0, y1: 2.4 });
        if (win) {
          const nWin = Math.max(1, Math.floor(len / 4));
          for (let i = 0; i < nWin; i++) {
            const at = len * (i + 0.5) / nWin;
            if (doorAt.some((dd) => Math.abs(dd - at) < 2.4)) continue;
            if (at < 1.2 || at > len - 1.2) continue;
            openings.push({ at, w: 1.4, y0: 1.0, y1: 2.2, glass: o.glass ?? true });
          }
        }
        const ext = k === 'n' || k === 's' ? t / 2 : 0;
        if (k === 'n' || k === 's') this.wall(ax - ext, az, bx + ext, bz, h, { mat, tint: o.tint, y0: f * h, openings: shift(openings, ext), destructible, explosiveOnly: o.explosiveOnly ?? true, hp: o.wallHp ?? 260 });
        else this.wall(ax, az + t / 2, bx, bz - t / 2, h, { mat, tint: o.tint, y0: f * h, openings: shift(openings, -t / 2), destructible, explosiveOnly: o.explosiveOnly ?? true, hp: o.wallHp ?? 260 });
      }
      // Laje/teto deste andar (com vão de escada se houver andar acima)
      const yTop = (f + 1) * h;
      if (f < floors - 1) {
        // escada ao longo da parede oeste, subindo no sentido +z
        const sw = 1.3, steps = Math.ceil(h / 0.25), run = 0.32;
        const sx0 = x0 + t / 2, sz0 = z0 + 1.0;
        for (let i = 0; i < steps; i++) {
          this.slab(sx0, sz0 + i * run, sx0 + sw, sz0 + (i + 1) * run, f * h, f * h + (i + 1) * (h / steps), o.stairMat ?? 'concrete');
        }
        const holeZ1 = sz0 + steps * run;
        this.slab(x0, z0, x1, sz0 - 0.0, yTop - 0.25, yTop, mat, { tint: o.tint });
        this.slab(x0 + sw + t / 2, sz0, x1, holeZ1, yTop - 0.25, yTop, mat, { tint: o.tint });
        this.slab(x0, holeZ1, x1, z1, yTop - 0.25, yTop, mat, { tint: o.tint });
      } else if (o.roof !== false) {
        this.slab(x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2, yTop - 0.25, yTop, o.roofMat ?? mat, { tint: o.roofTint ?? o.tint });
        if (o.parapet) {
          for (const [ax, az, bx, bz] of Object.values(sides)) this.wall(ax, az, bx, bz, 1.0, { mat, tint: o.tint, y0: yTop, thick: 0.25 });
        }
      }
    }
    this.interiors.push({ x0: x0 + 0.6, z0: z0 + 0.6, x1: x1 - 0.6, z1: z1 - 0.6, floors, h });
    // Pontos de saque dentro do prédio
    const nl = Math.max(1, Math.floor((w * d) / 40));
    for (let i = 0; i < nl; i++) this.lootSpots.push([this.r(x0 + 1.2, x1 - 1.2), 0, this.r(z0 + 1.2, z1 - 1.2)]);
    if (floors > 1) this.lootSpots.push([this.r(x0 + 2.5, x1 - 1.2), h, this.r(z0 + 6, z1 - 1.2)]);
    // Móveis simples para cobertura interna
    if (o.furniture !== false && w > 6 && d > 6) {
      this.box(cx + this.r(-w / 4, w / 4), 0.45, cz + this.r(0, d / 4), 1.8, 0.9, 0.9, 'wood', { destructible: true, hp: 80 });
    }
  }

  crate(x, z, s = 1.2, stack = 1, opts = {}) {
    for (let i = 0; i < stack; i++) this.box(x, s / 2 + i * s, z, s, s, s, 'wood', { destructible: true, hp: opts.hp ?? 90, tint: opts.tint });
  }
  barrel(x, z, explosive = true) {
    this.box(x, 0.6, z, 0.75, 1.2, 0.75, 'metal', { destructible: true, hp: explosive ? 40 : 200, explosive, tint: explosive ? 0xb3261e : 0x3f5a7a });
  }
  sandbags(x0, z0, x1, z1, h = 1.1) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    if (alongX) this.slab(Math.min(x0, x1), z0 - 0.45, Math.max(x0, x1), z0 + 0.45, 0, h, 'sandbag');
    else this.slab(x0 - 0.45, Math.min(z0, z1), x0 + 0.45, Math.max(z0, z1), 0, h, 'sandbag');
  }
  container(x, z, alongX = true, tint = 0x8a3324, stack = 1) {
    const L = 6.1, W = 2.45, H = 2.6;
    for (let i = 0; i < stack; i++) {
      if (alongX) this.box(x, H / 2 + i * H, z, L, H, W, 'sheetmetal', { tint });
      else this.box(x, H / 2 + i * H, z, W, H, L, 'sheetmetal', { tint });
    }
  }
  carWreck(x, z, alongX = true) {
    const tint = [0x5a2a2a, 0x2a3a5a, 0x4a4a4a, 0x6a6a3a][Math.floor(this.rng() * 4)];
    if (alongX) { this.box(x, 0.55, z, 4.2, 0.8, 1.8, 'metal', { tint }); this.box(x - 0.2, 1.2, z, 2.2, 0.55, 1.6, 'metal', { tint }); }
    else { this.box(x, 0.55, z, 1.8, 0.8, 4.2, 'metal', { tint }); this.box(x, 1.2, z - 0.2, 1.6, 0.55, 2.2, 'metal', { tint }); }
  }
  fence(x0, z0, x1, z1, h = 1.6) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i < n; i++) {
      const a = (alongX ? Math.min(x0, x1) : Math.min(z0, z1)) + len * i / n, b = a + len / n;
      if (alongX) this.slab(a, z0 - 0.06, b, z0 + 0.06, 0, h, 'wood', { destructible: true, hp: 45 });
      else this.slab(x0 - 0.06, a, x0 + 0.06, b, 0, h, 'wood', { destructible: true, hp: 45 });
    }
  }
  // Torre de vigia com escada e plataforma.
  tower(x, z, h = 6, mat = 'wood') {
    const s = 3.2;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(x + dx * (s / 2 - 0.15), h / 2, z + dz * (s / 2 - 0.15), 0.3, h, 0.3, mat);
    this.slab(x - s / 2, z - s / 2, x + s / 2, z + s / 2, h, h + 0.2, mat);
    this.wall(x - s / 2, z - s / 2, x + s / 2, z - s / 2, 1.1, { mat, y0: h + 0.2, thick: 0.12 });
    this.wall(x - s / 2, z + s / 2, x + s / 2, z + s / 2, 1.1, { mat, y0: h + 0.2, thick: 0.12 });
    this.wall(x + s / 2, z - s / 2, x + s / 2, z + s / 2, 1.1, { mat, y0: h + 0.2, thick: 0.12 });
    this.slab(x - s / 2 - 0.2, z - s / 2 - 0.2, x + s / 2 + 0.2, z + s / 2 + 0.2, h + 2.6, h + 2.8, 'sheetmetal');
    // escada em degraus subindo pelo lado oeste
    const steps = Math.ceil(h / 0.3), run = 0.3;
    for (let i = 0; i < steps; i++) {
      const sz0 = z - s / 2 - 0.5 - (steps - i) * run;
      this.slab(x - s / 2 - 1.1, sz0, x - s / 2, sz0 + run, 0, (i + 1) * (h / steps), mat, { noNav: true });
    }
    this.slab(x - s / 2 - 1.1, z - s / 2 - 0.5, x - s / 2, z - s / 2 + 0.6, h - 0.01, h + 0.2, mat);
  }
  // Túnel coberto (passagem subterrânea sob um aterro). Paredes + teto + aterro visual.
  tunnel(x0, z0, x1, z1, width = 3.2, height = 2.8) {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    if (alongX) {
      const a = Math.min(x0, x1), b = Math.max(x0, x1);
      this.slab(a, z0 - width / 2 - 0.5, b, z0 - width / 2, 0, height, 'concrete', { tint: 0x6e6e68 });
      this.slab(a, z0 + width / 2, b, z0 + width / 2 + 0.5, 0, height, 'concrete', { tint: 0x6e6e68 });
      this.slab(a, z0 - width / 2 - 0.5, b, z0 + width / 2 + 0.5, height, height + 0.5, 'concrete', { tint: 0x6e6e68 });
      this.slab(a + 1, z0 - width / 2 - 6, b - 1, z0 - width / 2 - 0.5, 0, height + 0.8, 'dirt');
      this.slab(a + 1, z0 + width / 2 + 0.5, b - 1, z0 + width / 2 + 6, 0, height + 0.8, 'dirt');
      this.slab(a + 1, z0 - width / 2 - 0.5, b - 1, z0 + width / 2 + 0.5, height + 0.5, height + 1.4, 'dirt');
    } else {
      const a = Math.min(z0, z1), b = Math.max(z0, z1);
      this.slab(x0 - width / 2 - 0.5, a, x0 - width / 2, b, 0, height, 'concrete', { tint: 0x6e6e68 });
      this.slab(x0 + width / 2, a, x0 + width / 2 + 0.5, b, 0, height, 'concrete', { tint: 0x6e6e68 });
      this.slab(x0 - width / 2 - 0.5, a, x0 + width / 2 + 0.5, b, height, height + 0.5, 'concrete', { tint: 0x6e6e68 });
      this.slab(x0 - width / 2 - 6, a + 1, x0 - width / 2 - 0.5, b - 1, 0, height + 0.8, 'dirt');
      this.slab(x0 + width / 2 + 0.5, a + 1, x0 + width / 2 + 6, b - 1, 0, height + 0.8, 'dirt');
      this.slab(x0 - width / 2 - 0.5, a + 1, x0 + width / 2 + 0.5, b - 1, height + 0.5, height + 1.4, 'dirt');
    }
    this.lamps.push([(x0 + x1) / 2, height - 0.3, (z0 + z1) / 2]);
  }
  tree(x, z, scale = 1, kind = 'pine') {
    this.box(x, 2 * scale, z, 0.45 * scale, 4 * scale, 0.45 * scale, 'wood', { tint: 0x4a3422, invisible: true });
    this.trees.push({ x, z, s: scale, kind });
  }
  rock(x, z, s = 2) {
    const h = s * this.r(0.5, 0.9);
    this.box(x, h / 2, z, s, h, s * this.r(0.7, 1.2), 'rock');
  }
  tank(x, z, r = 5, h = 8, tint = 0xb0b4b8) {
    // Tanque cilíndrico: visual cilindro + colisão em caixa inscrita
    const geo = new THREE.CylinderGeometry(r, r, h, 24);
    const mesh = new THREE.Mesh(geo, this.world.material('sheetmetal', { tint }));
    mesh.position.set(x, h / 2, z); mesh.castShadow = mesh.receiveShadow = true;
    this.world.addVisual(mesh);
    const s = r * 1.6;
    this.box(x, h / 2, z, s, h, s, 'metal', { invisible: true });
    this.box(x, h / 2, z, r * 1.95, h, r * 0.9, 'metal', { invisible: true });
    this.box(x, h / 2, z, r * 0.9, h, r * 1.95, 'metal', { invisible: true });
  }
  pipe(x0, z0, x1, z1, y = 3, r = 0.5) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const geo = new THREE.CylinderGeometry(r, r, len, 12);
    const mesh = new THREE.Mesh(geo, this.world.material('metal', { tint: 0x8a7a5a }));
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    mesh.rotation.z = Math.PI / 2;
    mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    mesh.castShadow = true;
    this.world.addVisual(mesh);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    if (alongX) this.slab(Math.min(x0, x1), z0 - r, Math.max(x0, x1), z0 + r, y - r, y + r, 'metal', { invisible: true });
    else this.slab(x0 - r, Math.min(z0, z1), x0 + r, Math.max(z0, z1), y - r, y + r, 'metal', { invisible: true });
  }
  lamp(x, z, h = 6) {
    this.box(x, h / 2, z, 0.2, h, 0.2, 'metal', { tint: 0x333333 });
    this.lamps.push([x, h - 0.2, z]);
  }

  // Cria os visuais instanciados (árvores e palmeiras) ao final.
  finish(theme) {
    if (!this.trees.length) return;
    const leafColor = theme === 'desert' ? 0x6f7d3a : theme === 'forest' ? 0x24432a : 0x34552e;
    const leafMat = this.world.material('foliage', { tint: leafColor });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3422, roughness: 1 });
    const kinds = {
      pine: () => {
        const trunk = new THREE.CylinderGeometry(0.15, 0.25, 4, 6); trunk.translate(0, 2, 0);
        const a = new THREE.ConeGeometry(1.8, 5, 7); a.translate(0, 5.5, 0);
        const b = new THREE.ConeGeometry(1.3, 3.5, 7); b.translate(0, 7.5, 0);
        return [[trunk, trunkMat], [a, leafMat], [b, leafMat]];
      },
      palm: () => {
        const trunk = new THREE.CylinderGeometry(0.14, 0.22, 6.5, 6); trunk.translate(0, 3.25, 0);
        const crown = new THREE.ConeGeometry(2.6, 1.1, 9, 1, true); crown.rotateX(Math.PI); crown.translate(0, 6.3, 0);
        const top = new THREE.SphereGeometry(0.55, 7, 5); top.translate(0, 6.6, 0);
        return [[trunk, new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 1 })], [crown, this.world.material('foliage', { tint: 0x5f7a32 })], [top, leafMat]];
      },
    };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const kind of Object.keys(kinds)) {
      const list = this.trees.filter((t) => (t.kind === 'palm' ? 'palm' : 'pine') === kind);
      if (!list.length) continue;
      const parts = kinds[kind]();
      const meshes = parts.map(([geo, mat]) => new THREE.InstancedMesh(geo, mat, list.length));
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, this.rng() * 6.28);
        sc.setScalar(t.s); p.set(t.x, 0, t.z);
        m.compose(p, q, sc);
        for (const im of meshes) im.setMatrixAt(i, m);
      });
      for (const im of meshes) { im.castShadow = true; im.receiveShadow = true; this.world.addVisual(im); }
    }
  }
}

function shift(openings, d) { return openings.map((o) => ({ ...o, at: o.at + d })); }
