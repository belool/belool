import * as THREE from 'three';
import { MATERIALS } from '../combat/weapons.js';
import { rand } from '../core/util.js';

// ================================================================
// EFFECTS — partículas em GPU (Points), traçantes, decalques de
// impacto, destroços físicos e luzes de flash pooled.
// ================================================================

const VS = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vAlpha; varying vec3 vColor;
uniform float scale;
void main(){
  vAlpha = alpha; vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying float vAlpha; varying vec3 vColor;
uniform float soft;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = vAlpha * (soft > 0.5 ? smoothstep(0.5, 0.0, d) : 1.0 - smoothstep(0.35,0.5,d));
  gl_FragColor = vec4(vColor, a);
}`;

class ParticlePool {
  constructor(scene, cap, additive) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol);
    g.setAttribute('size', this.aSize); g.setAttribute('alpha', this.aAlpha);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 }, soft: { value: additive ? 1 : 1 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    this.geo = g;
    scene.add(this.points);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, drag = 0, grow = 0) {
    let i = this.n;
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap); else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.alpha[i] = a; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        if (i !== n) this._copy(n, i);
        i--; continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5);
    }
    this.n = n;
    this.geo.setDrawRange(0, n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
  _copy(from, to) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.vel[to * 3 + k] = this.vel[from * 3 + k]; this.col[to * 3 + k] = this.col[from * 3 + k];
    }
    this.life[to] = this.life[from]; this.max[to] = this.max[from]; this.size[to] = this.size[from]; this.alpha[to] = this.alpha[from];
    this.a0[to] = this.a0[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.grow[to] = this.grow[from];
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.density = 1;
    this.glow = new ParticlePool(scene, 3000, true);
    this.smoke = new ParticlePool(scene, 5000, false);
    // Traçantes / riscos imediatos (recriados a cada quadro)
    this.lineCap = 600;
    this.linePos = new Float32Array(this.lineCap * 6);
    this.lineCol = new Float32Array(this.lineCap * 6);
    const lg = new THREE.BufferGeometry();
    this.aLinePos = new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aLineCol = new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('position', this.aLinePos); lg.setAttribute('color', this.aLineCol);
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.lines.frustumCulled = false;
    this.lineGeo = lg; this.lineN = 0;
    scene.add(this.lines);
    // Decalques (marcas de bala)
    this.decalCap = 400; this.decalI = 0;
    const dc = document.createElement('canvas'); dc.width = dc.height = 64;
    const dctx = dc.getContext('2d');
    const grd = dctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.35, 'rgba(20,18,15,0.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = grd; dctx.fillRect(0, 0, 64, 64);
    const dtex = new THREE.CanvasTexture(dc);
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dtex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), this.decalCap);
    this.decals.count = 0; this.decals.frustumCulled = false;
    scene.add(this.decals);
    // Destroços físicos
    this.debCap = 400; this.deb = [];
    this.debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), this.debCap);
    this.debMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.debCap * 3), 3);
    this.debMesh.count = 0; this.debMesh.castShadow = true; this.debMesh.frustumCulled = false;
    scene.add(this.debMesh);
    // Luzes de flash
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 12, 2);
      l.userData.t = 0;
      scene.add(l); this.lights.push(l);
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  clear() {
    this.glow.clear(); this.smoke.clear(); this.decals.count = 0; this.decalI = 0; this.deb.length = 0; this.debMesh.count = 0;
    for (const l of this.lights) l.intensity = 0;
  }

  flash(pos, color = 0xffaa55, intensity = 6, dist = 12, dur = 0.06) {
    let l = this.lights.find((x) => x.userData.t <= 0) || this.lights.reduce((a, b) => (a.userData.t < b.userData.t ? a : b));
    l.position.copy(pos); l.color.setHex(color); l.distance = dist; l.userData.i = intensity; l.userData.t = dur; l.userData.d = dur; l.intensity = intensity;
  }

  streak(a, b, color = 0xffd27a, k = 1) {
    if (this.lineN >= this.lineCap) return;
    const i = this.lineN++;
    const c = new THREE.Color(color).multiplyScalar(k);
    this.linePos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.lineCol.set([c.r * 0.2, c.g * 0.2, c.b * 0.2, c.r, c.g, c.b], i * 6);
  }

  muzzle(pos, dir, big = 1) {
    for (let i = 0; i < 6 * big; i++) {
      const s = rand(0.5, 3) * 6;
      this.glow.spawn(pos.x, pos.y, pos.z, dir.x * s + rand(-1, 1), dir.y * s + rand(-1, 1), dir.z * s + rand(-1, 1), 0.05, rand(0.15, 0.35) * big, 1, 0.75, 0.35, 1);
    }
    this.smoke.spawn(pos.x, pos.y, pos.z, dir.x, dir.y + 0.4, dir.z, 0.6, 0.3, 0.6, 0.6, 0.6, 0.25, -0.3, 1, 0.8);
  }

  impact(point, normal, mat) {
    const m = MATERIALS[mat] || MATERIALS.concrete;
    const c = new THREE.Color(m.color || 0x888888);
    const d = this.density;
    const n = Math.ceil(6 * d);
    for (let i = 0; i < n; i++) {
      const v = 2 + Math.random() * 4;
      this.smoke.spawn(point.x, point.y, point.z, normal.x * v + rand(-1.5, 1.5), normal.y * v + rand(0, 2), normal.z * v + rand(-1.5, 1.5), rand(0.3, 0.8), rand(0.05, 0.12), c.r, c.g, c.b, 1, 9, 1.5);
    }
    this.smoke.spawn(point.x, point.y, point.z, normal.x * 0.8, normal.y * 0.8 + 0.3, normal.z * 0.8, 0.9, 0.35, c.r * 0.9 + 0.1, c.g * 0.9 + 0.1, c.b * 0.9 + 0.1, 0.45, -0.2, 2, 1.2);
    if (m.spark) for (let i = 0; i < 6 * d; i++) {
      const v = 4 + Math.random() * 8;
      this.glow.spawn(point.x, point.y, point.z, normal.x * v + rand(-3, 3), normal.y * v + rand(-1, 4), normal.z * v + rand(-3, 3), rand(0.1, 0.3), 0.06, 1, 0.8, 0.4, 1, 12, 1);
    }
    if (mat !== 'glass' && mat !== 'foliage') this.decal(point, normal, mat === 'metal' ? 0.12 : 0.16);
  }

  blood(point, dir, amount = 1) {
    for (let i = 0; i < 8 * amount * this.density; i++) {
      const v = 1 + Math.random() * 3;
      this.smoke.spawn(point.x, point.y, point.z, dir.x * v + rand(-1, 1), dir.y * v + rand(-0.5, 1.5), dir.z * v + rand(-1, 1), rand(0.3, 0.7), rand(0.06, 0.14), 0.55, 0.02, 0.02, 1, 9, 2);
    }
    this.smoke.spawn(point.x, point.y, point.z, dir.x, dir.y, dir.z, 0.5, 0.3, 0.45, 0.03, 0.03, 0.5, 0, 3, 0.8);
  }

  decal(point, normal, size) {
    const i = this.decalI++ % this.decalCap;
    this.decals.count = Math.min(this.decalCap, this.decalI);
    this._v.copy(point).addScaledVector(normal, 0.012);
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    this._s.setScalar(size * (0.8 + Math.random() * 0.5));
    this._m.compose(this._v, this._q, this._s);
    this.decals.setMatrixAt(i, this._m);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  explosion(pos, radius = 7) {
    const d = this.density;
    for (let i = 0; i < 60 * d; i++) {
      const v = Math.random() * radius * 3;
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.5;
      this.glow.spawn(pos.x, pos.y + 0.3, pos.z, Math.cos(th) * Math.cos(ph) * v, Math.sin(ph) * v + 2, Math.sin(th) * Math.cos(ph) * v, rand(0.2, 0.6), rand(0.5, 1.6), 1, rand(0.4, 0.75), 0.15, 1, 4, 3, 2);
    }
    for (let i = 0; i < 40 * d; i++) {
      const v = Math.random() * radius;
      const th = Math.random() * Math.PI * 2;
      this.smoke.spawn(pos.x + rand(-1, 1), pos.y + rand(0, 1.5), pos.z + rand(-1, 1), Math.cos(th) * v, rand(1, 5), Math.sin(th) * v, rand(1.5, 3.5), rand(1.2, 2.5), 0.18, 0.17, 0.16, 0.75, -0.6, 1.4, 1.6);
    }
    for (let i = 0; i < 25 * d; i++) {
      const th = Math.random() * Math.PI * 2;
      this.glow.spawn(pos.x, pos.y + 0.5, pos.z, Math.cos(th) * rand(8, 22), rand(4, 14), Math.sin(th) * rand(8, 22), rand(0.4, 1.2), 0.08, 1, 0.7, 0.3, 1, 14, 0.5);
    }
    this.flash(pos.clone().setY(pos.y + 1), 0xff8833, 40, radius * 4, 0.35);
    this.decal(new THREE.Vector3(pos.x, 0.01, pos.z), new THREE.Vector3(0, 1, 0), radius * 0.5);
  }

  smokeCloud(pos, radius) {
    for (let i = 0; i < 4 * this.density; i++) {
      this.smoke.spawn(pos.x + rand(-radius, radius) * 0.6, pos.y + rand(0, radius * 0.5), pos.z + rand(-radius, radius) * 0.6, rand(-0.4, 0.4), rand(0, 0.3), rand(-0.4, 0.4), rand(3, 5), rand(2.5, 4.5), 0.78, 0.8, 0.8, 0.9, -0.05, 0.4, 0.6);
    }
  }

  debris(center, size, mat, tint) {
    const m = MATERIALS[mat] || MATERIALS.concrete;
    const c = new THREE.Color(tint ?? m.color ?? 0x888888);
    const n = Math.min(24, Math.ceil(size.x * size.y * size.z * 6) + 6);
    for (let i = 0; i < n; i++) {
      if (this.deb.length >= this.debCap) this.deb.shift();
      const s = mat === 'glass' ? rand(0.03, 0.12) : rand(0.08, 0.35);
      this.deb.push({
        p: new THREE.Vector3(center.x + rand(-0.5, 0.5) * size.x, center.y + rand(-0.5, 0.5) * size.y, center.z + rand(-0.5, 0.5) * size.z),
        v: new THREE.Vector3(rand(-4, 4), rand(1, 6), rand(-4, 4)),
        r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)), w: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        s, life: rand(6, 12), c: c.clone().multiplyScalar(rand(0.7, 1.1)),
      });
    }
    for (let i = 0; i < 12 * this.density; i++) {
      this.smoke.spawn(center.x + rand(-1, 1) * size.x * 0.5, center.y, center.z + rand(-1, 1) * size.z * 0.5, rand(-1, 1), rand(0, 1.5), rand(-1, 1), rand(1, 2.5), rand(0.8, 1.8), c.r, c.g, c.b, 0.6, -0.1, 1, 1);
    }
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    // linhas: enviadas e zeradas para o próximo quadro
    this.lineGeo.setDrawRange(0, this.lineN * 2);
    this.aLinePos.needsUpdate = this.aLineCol.needsUpdate = true;
    this.lineN = 0;
    for (const l of this.lights) {
      if (l.userData.t > 0) { l.userData.t -= dt; l.intensity = l.userData.i * Math.max(0, l.userData.t / l.userData.d); }
      else l.intensity = 0;
    }
    // destroços
    let j = 0;
    for (let i = 0; i < this.deb.length; i++) {
      const d = this.deb[i];
      d.life -= dt;
      if (d.life <= 0) continue;
      d.v.y -= 18 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < d.s / 2) { d.p.y = d.s / 2; d.v.y *= -0.3; d.v.x *= 0.7; d.v.z *= 0.7; d.w.multiplyScalar(0.7); }
      d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
      this._q.setFromEuler(d.r); this._s.setScalar(d.s * Math.min(1, d.life));
      this._m.compose(d.p, this._q, this._s);
      this.debMesh.setMatrixAt(j, this._m);
      this.debMesh.setColorAt(j, d.c);
      this.deb[j++] = d;
    }
    this.deb.length = j;
    this.debMesh.count = j;
    this.debMesh.instanceMatrix.needsUpdate = true;
    if (this.debMesh.instanceColor) this.debMesh.instanceColor.needsUpdate = true;
  }

  setScale(px) { this.glow.mat.uniforms.scale.value = px; this.smoke.mat.uniforms.scale.value = px; }
}
