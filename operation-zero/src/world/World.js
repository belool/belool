import * as THREE from 'three';
import { rayAABB } from '../core/util.js';
import { MATERIALS } from '../combat/weapons.js';
import { getTexture } from './Textures.js';

// ================================================================
// WORLD — geometria de colisão (AABBs), hash espacial, raycast com
// penetração, colisão de personagens e destruição de cenário.
// A geometria estática é mesclada por material (poucas draw calls).
// ================================================================

const HASH = 8; // tamanho da célula do hash espacial (m)
const key = (ix, iz) => (ix + 32768) * 65536 + (iz + 32768);

let BOX_ID = 1;

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.boxes = [];
    this.hash = new Map();
    this.stamp = 0;
    this.materials = new Map();
    this.groundMat = 'dirt';
    this.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    this.dynamicMeshes = [];
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.boxes = [];
    this.hash.clear();
  }

  material(mat, opts = {}) {
    const k = mat + (opts.tint ?? '') + (opts.transparent ? 't' : '');
    if (this.materials.has(k)) return this.materials.get(k);
    const def = MATERIALS[mat] || MATERIALS.concrete;
    const base = opts.tint ?? def.color;
    const painter = mat === 'dirt' ? 'dirt' : mat;
    const m = new THREE.MeshStandardMaterial({
      map: getTexture(painter, base),
      roughness: mat === 'metal' || mat === 'sheetmetal' ? 0.6 : mat === 'glass' ? 0.1 : 0.92,
      metalness: mat === 'metal' ? 0.2 : mat === 'sheetmetal' ? 0.1 : 0,
      transparent: mat === 'glass',
      opacity: mat === 'glass' ? 0.35 : 1,
      depthWrite: mat !== 'glass',
    });
    this.materials.set(k, m);
    return m;
  }

  // Adiciona caixa por centro e tamanho.
  addBox(cx, cy, cz, sx, sy, sz, mat = 'concrete', opts = {}) {
    return this.addBoxMinMax(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, mat, opts);
  }
  addBoxMinMax(x0, y0, z0, x1, y1, z1, mat = 'concrete', opts = {}) {
    const box = {
      id: BOX_ID++,
      min: new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      max: new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
      mat,
      tint: opts.tint,
      destructible: !!opts.destructible,
      explosiveOnly: !!opts.explosiveOnly,
      explosive: !!opts.explosive,
      hp: opts.hp ?? (opts.destructible ? 100 : Infinity),
      maxHp: opts.hp ?? 100,
      invisible: !!opts.invisible,
      noCollide: !!opts.noCollide,
      seeThrough: !!opts.seeThrough || mat === 'glass',
      tag: opts.tag,
      removed: false,
      stamp: 0,
      mesh: null,
    };
    this.boxes.push(box);
    this._hashInsert(box);
    return box;
  }

  _cellsOf(box, fn) {
    const x0 = Math.floor(box.min.x / HASH), x1 = Math.floor(box.max.x / HASH);
    const z0 = Math.floor(box.min.z / HASH), z1 = Math.floor(box.max.z / HASH);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(key(ix, iz));
  }
  _hashInsert(box) {
    this._cellsOf(box, (k) => {
      let arr = this.hash.get(k);
      if (!arr) this.hash.set(k, (arr = []));
      arr.push(box);
    });
  }
  _hashRemove(box) {
    this._cellsOf(box, (k) => {
      const arr = this.hash.get(k);
      if (!arr) return;
      const i = arr.indexOf(box);
      if (i >= 0) arr.splice(i, 1);
    });
  }

  // Caixas que intersectam uma região AABB.
  query(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    this.stamp++;
    const x0 = Math.floor(minX / HASH), x1 = Math.floor(maxX / HASH);
    const z0 = Math.floor(minZ / HASH), z1 = Math.floor(maxZ / HASH);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const arr = this.hash.get(key(ix, iz));
      if (!arr) continue;
      for (const b of arr) {
        if (b.stamp === this.stamp) continue;
        b.stamp = this.stamp;
        if (b.max.x > minX && b.min.x < maxX && b.max.y > minY && b.min.y < maxY && b.max.z > minZ && b.min.z < maxZ) out.push(b);
      }
    }
    return out;
  }

  // Percorre as células do hash atravessadas por um raio (DDA 2D).
  _traverse(ox, oz, dx, dz, maxT, cb) {
    let ix = Math.floor(ox / HASH), iz = Math.floor(oz / HASH);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? HASH / Math.abs(dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? HASH / Math.abs(dz) : Infinity;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (ix + 1) * HASH - ox : ox - ix * HASH) / Math.abs(dx)) : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (iz + 1) * HASH - oz : oz - iz * HASH) / Math.abs(dz)) : Infinity;
    let t = 0;
    for (let guard = 0; guard < 4000; guard++) {
      const tExit = Math.min(tMaxX, tMaxZ, maxT);
      if (cb(key(ix, iz), t, tExit)) return;
      if (tExit >= maxT) return;
      if (tMaxX < tMaxZ) { ix += stepX; t = tMaxX; tMaxX += tDeltaX; } else { iz += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
    }
  }

  // Raycast: retorna o impacto mais próximo (ou null).
  // opts.sight = true ignora objetos transparentes (vidro) e considera fumaça.
  raycast(o, d, maxT, opts = {}) {
    let best = null;
    this.stamp++;
    const st = this.stamp;
    this._traverse(o.x, o.z, d.x, d.z, maxT, (k, t0, t1) => {
      const arr = this.hash.get(k);
      if (arr) for (const b of arr) {
        if (b.stamp === st) continue;
        b.stamp = st;
        if (b.removed || b.noCollide) continue;
        if (opts.sight && b.seeThrough) continue;
        if (opts.ignore && opts.ignore(b)) continue;
        const r = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, b.min, b.max, best ? best.t : maxT);
        if (r && (!best || r[0] < best.t)) best = { t: r[0], tExit: r[1], axis: r[2], sign: r[3], box: b };
      }
      return best && best.t <= t1;
    });
    if (d.y < -1e-6) {
      const tg = -o.y / d.y;
      if (tg >= 0 && tg <= maxT && (!best || tg < best.t)) best = { t: tg, tExit: tg + 1e3, axis: 1, sign: 1, box: null, ground: true };
    }
    if (best) {
      best.point = new THREE.Vector3(o.x + d.x * best.t, o.y + d.y * best.t, o.z + d.z * best.t);
      best.normal = new THREE.Vector3();
      if (best.axis >= 0) best.normal.setComponent(best.axis, best.sign);
      else best.normal.set(-d.x, -d.y, -d.z);
      best.mat = best.box ? best.box.mat : this.groundMat;
    }
    return best;
  }

  // Todos os impactos ao longo de um segmento (para penetração).
  raycastAll(o, d, maxT) {
    const hits = [];
    this.stamp++;
    const st = this.stamp;
    this._traverse(o.x, o.z, d.x, d.z, maxT, (k) => {
      const arr = this.hash.get(k);
      if (arr) for (const b of arr) {
        if (b.stamp === st) continue;
        b.stamp = st;
        if (b.removed || b.noCollide) continue;
        const r = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, b.min, b.max, maxT);
        if (r) hits.push({ t: r[0], tExit: r[1], axis: r[2], sign: r[3], box: b, mat: b.mat });
      }
      return false;
    });
    if (d.y < -1e-6) {
      const tg = -o.y / d.y;
      if (tg >= 0 && tg <= maxT) hits.push({ t: tg, tExit: tg + 1e3, axis: 1, sign: 1, box: null, ground: true, mat: this.groundMat });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  // Linha de visão entre dois pontos (considera nuvens de fumaça).
  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    const hit = this.raycast(a, d, len - 0.05, { sight: true });
    if (hit) return false;
    if (this.game.smokeBlocks && this.game.smokeBlocks(a, d, len)) return false;
    return true;
  }

  // Colisão e movimento de personagem (cilindro aproximado por AABB).
  moveCharacter(pos, vel, radius, height, dt, onGroundPrev, stepHeight = 0.5) {
    const tmp = [];
    let onGround = false;
    const overlaps = (px, py, pz) => {
      const out = this.query(px - radius, py + 0.001, pz - radius, px + radius, py + height, pz + radius, []);
      return out.filter((b) => !b.removed && !b.noCollide);
    };
    // Eixos horizontais com step-up (escadas, degraus, meio-fio).
    for (const axis of ['x', 'z']) {
      const delta = vel[axis] * dt;
      if (delta === 0) continue;
      pos[axis] += delta;
      const hits = overlaps(pos.x, pos.y, pos.z);
      for (const b of hits) {
        const rise = b.max.y - pos.y;
        if (rise > 0 && rise <= stepHeight && onGroundPrev) {
          const saveY = pos.y;
          pos.y = b.max.y + 0.001;
          if (overlaps(pos.x, pos.y, pos.z).length === 0) continue;
          pos.y = saveY;
        }
        if (delta > 0) pos[axis] = Math.min(pos[axis], b.min[axis] - radius - 0.001);
        else pos[axis] = Math.max(pos[axis], b.max[axis] + radius + 0.001);
        vel[axis] = 0;
      }
    }
    // Eixo vertical.
    pos.y += vel.y * dt;
    const hits = overlaps(pos.x, pos.y, pos.z);
    for (const b of hits) {
      if (vel.y <= 0 && b.max.y - pos.y < 0.9) { pos.y = b.max.y; vel.y = 0; onGround = true; }
      else if (vel.y > 0) { pos.y = b.min.y - height - 0.001; vel.y = 0; }
    }
    if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; onGround = true; }
    // Sonda de chão (para não perder contato em descidas suaves).
    if (!onGround && vel.y <= 0) {
      tmp.length = 0;
      this.query(pos.x - radius, pos.y - 0.06, pos.z - radius, pos.x + radius, pos.y + 0.01, pos.z + radius, tmp);
      if (tmp.some((b) => !b.removed && !b.noCollide && b.max.y <= pos.y + 0.02)) onGround = true;
    }
    const B = this.bounds;
    pos.x = Math.max(B.minX + radius, Math.min(B.maxX - radius, pos.x));
    pos.z = Math.max(B.minZ + radius, Math.min(B.maxZ - radius, pos.z));
    return onGround;
  }

  // Dano a objetos destrutíveis.
  damageBox(box, amount, explosive = false, point = null, attacker = null) {
    if (!box || box.removed || !box.destructible) return false;
    if (box.explosiveOnly && !explosive) return false;
    if (attacker) box.lastAttacker = attacker;
    box.hp -= amount;
    if (box.group && box.hp > 0 && box.mat !== 'glass') {
      // Feedback visual de dano parcial: escurece progressivamente (cores de vértice).
      this._shade(box, Math.max(0.35, box.hp / box.maxHp));
    }
    if (box.hp <= 0) { this.destroyBox(box, point); return true; }
    return false;
  }

  destroyBox(box, point) {
    if (box.removed) return;
    box.removed = true;
    this._hashRemove(box);
    if (box.group) this._rebuildGroup(box.group, box);
    const center = new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5);
    const size = new THREE.Vector3().subVectors(box.max, box.min);
    this.game.fx?.debris(center, size, box.mat, box.tint);
    this.game.audio?.play(box.mat === 'glass' ? 'glass' : 'break', center);
    this.game.events.emit('worldChanged', { box });
    if (box.explosive) this.game.explode(center, { radius: 7, damage: 130, attacker: box.lastAttacker || null, source: 'barrel' });
  }

  // Monta a malha: estáticos mesclados por material; destrutíveis isolados.
  build() {
    const groups = new Map();
    for (const b of this.boxes) {
      if (b.invisible || b.removed) continue;
      if (b.destructible) { this._addDestructible(b); continue; }
      const k = b.mat + ':' + (b.tint ?? '');
      if (!groups.has(k)) groups.set(k, { mat: b.mat, tint: b.tint, boxes: [] });
      groups.get(k).boxes.push(b);
    }
    for (const g of this.dgroups?.values() || []) this._rebuildGroup(g);
    this.built = true;
    for (const g of groups.values()) {
      const geo = boxesGeometry(g.boxes);
      const mesh = new THREE.Mesh(geo, this.material(g.mat, { tint: g.tint }));
      mesh.castShadow = g.mat !== 'glass';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
  }
  // Destrutíveis: agrupados por material e região (24 m) numa malha mesclada
  // com cores de vértice. Quebrar um objeto reconstrói apenas o seu grupo.
  _addDestructible(b) {
    const cx = Math.floor((b.min.x + b.max.x) / 48), cz = Math.floor((b.min.z + b.max.z) / 48);
    const key = `${b.mat}:${b.tint ?? ''}:${cx}:${cz}`;
    this.dgroups ||= new Map();
    let g = this.dgroups.get(key);
    if (!g) {
      const base = this.material(b.mat, { tint: b.tint });
      const mat = base.clone();
      mat.vertexColors = true;
      g = { key, boxes: [], mesh: new THREE.Mesh(new THREE.BufferGeometry(), mat), mat: b.mat };
      g.mesh.castShadow = b.mat !== 'glass';
      g.mesh.receiveShadow = true;
      g.mesh.matrixAutoUpdate = false;
      this.root.add(g.mesh);
      this.dgroups.set(key, g);
    }
    g.boxes.push(b);
    b.group = g;
    g.dirty = true;
    if (this.built) this._rebuildGroup(g);
  }
  _makeMesh(b) { this._addDestructible(b); }
  _rebuildGroup(g, removed = null) {
    if (removed) g.boxes = g.boxes.filter((x) => x !== removed);
    const geo = boxesGeometry(g.boxes);
    const col = new Float32Array(g.boxes.length * 24 * 3);
    g.boxes.forEach((b, i) => {
      b.vOffset = i * 24;
      const k = b.hp > 0 && isFinite(b.hp) ? Math.max(0.35, b.hp / b.maxHp) : 1;
      col.fill(k, i * 72, i * 72 + 72);
    });
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.mesh.geometry.dispose();
    g.mesh.geometry = geo;
    g.mesh.visible = g.boxes.length > 0;
    g.dirty = false;
  }
  _shade(b, k) {
    const attr = b.group.mesh.geometry.getAttribute('color');
    if (!attr || b.vOffset === undefined) return;
    attr.array.fill(k, b.vOffset * 3, b.vOffset * 3 + 72);
    attr.needsUpdate = true;
  }

  addVisual(obj) { this.root.add(obj); return obj; }
}

// Gera geometria de várias caixas com UV em escala de mundo (2 m por repetição).
export function boxesGeometry(boxes, texScale = 0.5) {
  const n = boxes.length;
  const pos = new Float32Array(n * 24 * 3), nor = new Float32Array(n * 24 * 3), uv = new Float32Array(n * 24 * 2);
  const idx = new Uint32Array(n * 36);
  let v = 0, ii = 0;
  const faces = [
    // normal, 4 cantos (x,y,z em termos de min(0)/max(1)), eixos u/v
    [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], 'z', 'y'],
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], 'z', 'y'],
    [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], 'x', 'z'],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], 'x', 'z'],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], 'x', 'y'],
    [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], 'x', 'y'],
  ];
  for (const b of boxes) {
    for (const [nrm, corners, ua, va] of faces) {
      const base = v;
      for (const c of corners) {
        const x = c[0] ? b.max.x : b.min.x, y = c[1] ? b.max.y : b.min.y, z = c[2] ? b.max.z : b.min.z;
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        nor[v * 3] = nrm[0]; nor[v * 3 + 1] = nrm[1]; nor[v * 3 + 2] = nrm[2];
        const p = { x, y, z };
        uv[v * 2] = p[ua] * texScale; uv[v * 2 + 1] = p[va] * texScale;
        v++;
      }
      idx[ii++] = base; idx[ii++] = base + 1; idx[ii++] = base + 2;
      idx[ii++] = base; idx[ii++] = base + 2; idx[ii++] = base + 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
