import * as THREE from 'three';

// Modelo humanoide low-poly procedural com animação (andar, correr,
// agachar, mirar, morrer). Geometrias compartilhadas entre instâncias.
const G = {
  torso: new THREE.BoxGeometry(0.46, 0.58, 0.28),
  vest: new THREE.BoxGeometry(0.5, 0.42, 0.34),
  pelvis: new THREE.BoxGeometry(0.4, 0.2, 0.26),
  thigh: new THREE.BoxGeometry(0.17, 0.44, 0.18),
  shin: new THREE.BoxGeometry(0.15, 0.44, 0.16),
  boot: new THREE.BoxGeometry(0.16, 0.1, 0.28),
  head: new THREE.BoxGeometry(0.22, 0.24, 0.24),
  helmet: new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  visor: new THREE.BoxGeometry(0.2, 0.05, 0.02),
  upperArm: new THREE.BoxGeometry(0.13, 0.32, 0.13),
  foreArm: new THREE.BoxGeometry(0.11, 0.3, 0.11),
  gun: new THREE.BoxGeometry(0.06, 0.1, 1),
  pack: new THREE.BoxGeometry(0.36, 0.4, 0.16),
};
for (const k of ['thigh', 'shin', 'upperArm', 'foreArm']) G[k].translate(0, -G[k].parameters.height / 2, 0);
G.gun.translate(0, 0, -0.5);

// Mescla várias geometrias (com cor e transformação) em uma só, com cores de vértice.
function merge(parts) {
  const pos = [], nor = [], col = [];
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (const [geo, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1] of parts) {
    const g = geo.toNonIndexed();
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    c.setHex(color);
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const SHARED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
const geoCache = new Map();
const SKIN = 0xc29072, DARK = 0x1d1d1d;
// Geometrias por esquema de cores (compartilhadas entre soldados da mesma equipe).
function cap(r, len, sx = 1, sy = 1, sz = 1) { const g = new THREE.CapsuleGeometry(r, len, 3, 8); g.scale(sx, sy, sz); return g; }
// pendura a cápsula para baixo a partir da articulação
function limb(r, total) { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, total - 2 * r), 3, 8); g.translate(0, -total / 2, 0); return g; }
const P = {
  torso: cap(0.2, 0.22, 1.12, 1, 0.72), belt: new THREE.BoxGeometry(0.42, 0.06, 0.27),
  vest: new THREE.BoxGeometry(0.46, 0.4, 0.31), pouch: new THREE.BoxGeometry(0.1, 0.11, 0.06), strap: new THREE.BoxGeometry(0.07, 0.05, 0.32),
  pack: new THREE.BoxGeometry(0.34, 0.38, 0.17), antenna: new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4),
  pelvis: cap(0.17, 0.08, 1.2, 0.9, 0.8),
  thigh: limb(0.088, 0.46), shin: limb(0.075, 0.44), knee: new THREE.BoxGeometry(0.12, 0.1, 0.06),
  boot: new THREE.BoxGeometry(0.15, 0.11, 0.27),
  head: cap(0.105, 0.06, 1, 1, 1.05), helmet: new THREE.SphereGeometry(0.152, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), brim: new THREE.CylinderGeometry(0.16, 0.16, 0.025, 12),
  goggles: new THREE.BoxGeometry(0.2, 0.05, 0.05), visor: new THREE.BoxGeometry(0.17, 0.04, 0.02), mic: new THREE.BoxGeometry(0.02, 0.02, 0.09),
  upperArm: limb(0.066, 0.32), foreArm: limb(0.056, 0.3), glove: new THREE.SphereGeometry(0.055, 8, 6), pad: new THREE.SphereGeometry(0.08, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  gRecv: new THREE.BoxGeometry(0.06, 0.1, 0.42), gBarrel: new THREE.CylinderGeometry(0.014, 0.014, 0.36, 6), gMag: new THREE.BoxGeometry(0.04, 0.16, 0.07),
  gStock: new THREE.BoxGeometry(0.05, 0.09, 0.22), gSight: new THREE.BoxGeometry(0.03, 0.04, 0.08), gGrip: new THREE.BoxGeometry(0.035, 0.09, 0.04),
};
P.gBarrel.rotateX(Math.PI / 2);
const darker = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
// Geometrias por esquema de cores (compartilhadas entre soldados da mesma equipe).
function bodyGeos(tc) {
  const key = [tc.uniform, tc.vest, tc.helmet, tc.visor].join(':');
  if (geoCache.has(key)) return geoCache.get(key);
  const u = tc.uniform, v = tc.vest, gear = darker(tc.vest, 0.75), metal = 0x2a2c2f, black = 0x141414;
  const g = {
    pelvis: merge([[P.pelvis, u], [P.belt, black, 0, 0.06, 0]]),
    spine: merge([
      [P.torso, u, 0, 0.3, 0], [P.vest, v, 0, 0.34, 0],
      [P.pouch, gear, -0.13, 0.24, -0.17], [P.pouch, gear, 0, 0.24, -0.17], [P.pouch, gear, 0.13, 0.24, -0.17],
      [P.strap, gear, -0.15, 0.53, 0], [P.strap, gear, 0.15, 0.53, 0],
      [P.pack, gear, 0, 0.36, 0.23], [P.antenna, black, 0.12, 0.72, 0.25],
    ]),
    head: merge([[P.head, SKIN, 0, 0.11, 0], [P.helmet, tc.helmet, 0, 0.15, 0, 1, 0.92, 1.1], [P.brim, tc.helmet, 0, 0.15, 0, 1, 1, 1.08], [P.goggles, black, 0, 0.2, -0.12], [P.visor, tc.visor, 0, 0.11, -0.115], [P.mic, black, 0.08, 0.06, -0.08]]),
    thigh: merge([[P.thigh, u]]),
    shin: merge([[P.shin, u], [P.knee, gear, 0, -0.02, -0.07], [P.boot, black, 0, -0.44, -0.05]]),
    upperArm: merge([[P.upperArm, u], [P.pad, gear, 0, -0.02, 0, 1, 0.8, 1]]),
    foreArm: merge([[P.foreArm, u], [P.glove, black, 0, -0.31, 0, 1, 1.2, 1]]),
    gun: merge([[P.gRecv, metal, 0, 0, -0.18], [P.gBarrel, black, 0, 0.015, -0.56], [P.gMag, black, 0, -0.1, -0.2], [P.gStock, metal, 0, -0.01, 0.12], [P.gSight, black, 0, 0.07, -0.16], [P.gGrip, black, 0, -0.08, -0.02]]),
  };
  geoCache.set(key, g);
  return g;
}

export const TEAM_COLORS = {
  0: { uniform: 0x4b5a3a, vest: 0x3a4430, helmet: 0x3f4a33, visor: 0x55aaff, name: 'Força Zero' },
  1: { uniform: 0x5a4636, vest: 0x2e2a26, helmet: 0x3a332c, visor: 0xff4433, name: 'Legião Krane' },
  2: { uniform: 0x3a3a46, vest: 0x2a2a30, helmet: 0x30303a, visor: 0xffcc33, name: 'Mercenários' },
};

export class SoldierModel {
  constructor(team, opts = {}) {
    const tc = { ...(TEAM_COLORS[team] || TEAM_COLORS[2]), ...(opts.colors || {}) };
    const geos = bodyGeos(tc);
    const g = new THREE.Group();
    this.group = g;
    g.rotation.order = 'YXZ';
    // 12 malhas por soldado (antes ~20); só tronco e pernas projetam sombra
    const mesh = (geo, shadow) => { const me = new THREE.Mesh(geo, SHARED_MAT); me.castShadow = shadow; return me; };
    this.hips = new THREE.Group(); this.hips.position.y = 0.92; g.add(this.hips);
    this.hips.add(mesh(geos.pelvis, true));
    this.spine = new THREE.Group(); this.spine.position.y = 0.08; this.hips.add(this.spine);
    this.spine.add(mesh(geos.spine, true));
    this.neck = new THREE.Group(); this.neck.position.y = 0.64; this.spine.add(this.neck);
    this.neck.add(mesh(geos.head, true));
    const leg = (side) => {
      const hip = new THREE.Group(); hip.position.set(side * 0.11, -0.05, 0); this.hips.add(hip);
      hip.add(mesh(geos.thigh, true));
      const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
      knee.add(mesh(geos.shin, true));
      return { hip, knee };
    };
    this.legL = leg(-1); this.legR = leg(1);
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.3, 0.56, 0); this.spine.add(sh);
      sh.add(mesh(geos.upperArm, false));
      const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
      el.add(mesh(geos.foreArm, false));
      return { sh, el };
    };
    this.armL = arm(-1); this.armR = arm(1);
    this.gunPivot = new THREE.Group(); this.gunPivot.position.set(0.1, 0.42, -0.3); this.spine.add(this.gunPivot);
    this.gun = mesh(geos.gun, false); this.gunPivot.add(this.gun);
    this.muzzle = new THREE.Object3D(); this.gunPivot.add(this.muzzle);
    this.setGunLength(0.75);
    if (opts.scale) g.scale.setScalar(opts.scale);
    this.phase = Math.random() * 6;
    this.deathT = -1;
    this.deathDir = 1;
  }
  setGunLength(len) { this.gun.scale.set(1, 1, len / 0.75); this.muzzle.position.set(0, 0.015, -0.74 * len / 0.75); }

  // speed: velocidade horizontal (m/s); crouch 0..1; pitch em rad
  animate(dt, speed, crouch, pitch, aiming, onGround) {
    if (this.deathT >= 0) return this._death(dt);
    // Convenção: o modelo olha para -Z; rotação +X leva a ponta de um membro
    // pendurado (-Y) para frente (-Z).
    this.phase += dt * (2 + speed * 1.6);
    const sw = Math.min(1, speed / 4.5);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = 0.7 * sw;
    this.legL.hip.rotation.x = s * amp + crouch * 1.25;
    this.legR.hip.rotation.x = -s * amp + crouch * 1.25;
    this.legL.knee.rotation.x = -(Math.max(0, c) * amp * 1.3 + crouch * 2.1);
    this.legR.knee.rotation.x = -(Math.max(0, -c) * amp * 1.3 + crouch * 2.1);
    if (!onGround) { this.legL.hip.rotation.x = 0.7; this.legR.hip.rotation.x = 0.1; this.legL.knee.rotation.x = -1.1; this.legR.knee.rotation.x = -0.5; }
    this.hips.position.y = 0.92 - crouch * 0.36 + Math.abs(s) * 0.04 * sw;
    const lean = (speed > 6 ? 0.28 : 0.06) + crouch * 0.18;
    this.spine.rotation.x = pitch * 0.45 - lean;
    this.neck.rotation.x = pitch * 0.45 + lean * 0.7;
    // braços segurando a arma à frente do corpo
    const aim = pitch * 0.45 + lean;
    const lower = speed > 6 && !aiming ? 0.55 : 0;
    this.armR.sh.rotation.set(1.2 + aim - lower, 0, -0.25);
    this.armR.el.rotation.set(0.5, 0, 0);
    this.armL.sh.rotation.set(1.4 + aim - lower, 0, 0.62);
    this.armL.el.rotation.set(0.15, 0, 0);
    this.gunPivot.rotation.x = aim - lower;
  }
  die(dirX, dirZ) { this.deathT = 0; this.deathDir = Math.random() < 0.5 ? 1 : -1; }
  _death(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 0.55);
    const e = t * t;
    this.group.rotation.x = e * Math.PI / 2 * 0.97 * this.deathDir;
    this.legL.knee.rotation.x = -0.4 * e; this.legR.knee.rotation.x = -0.2 * e;
    this.armL.sh.rotation.x = 2.6 * e; this.armR.sh.rotation.x = 2.8 * e;
  }
}
