import * as THREE from 'three';
import { mulberry32 } from '../core/util.js';

// Texturas procedurais geradas em canvas (sem arquivos externos).
const cache = new Map();

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function noise(ctx, size, rng, amount, alpha = 0.08) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rng() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rng()})`;
    const s = 1 + rng() * 3;
    ctx.fillRect(rng() * size, rng() * size, s, s);
  }
}
function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

const painters = {
  concrete(ctx, s, rng, base) {
    ctx.fillStyle = hex(base); ctx.fillRect(0, 0, s, s);
    noise(ctx, s, rng, 6000, 0.12);
    for (let i = 0; i < 14; i++) {
      const g = ctx.createRadialGradient(rng() * s, rng() * s, 0, rng() * s, rng() * s, 40 + rng() * 60);
      g.addColorStop(0, 'rgba(40,40,35,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, s, s);
  },
  brick(ctx, s, rng, base) {
    ctx.fillStyle = '#9a9184'; ctx.fillRect(0, 0, s, s);
    const bh = s / 8, bw = s / 4;
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
      const off = r % 2 ? bw / 2 : 0;
      const k = 0.8 + rng() * 0.35;
      const col = new THREE.Color(base).multiplyScalar(k);
      ctx.fillStyle = '#' + col.getHexString();
      ctx.fillRect(c * bw + off + 2, r * bh + 2, bw - 4, bh - 4);
    }
    noise(ctx, s, rng, 3000, 0.1);
  },
  metal(ctx, s, rng, base) {
    ctx.fillStyle = hex(base); ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) { ctx.fillStyle = `rgba(255,255,255,${rng() * 0.04})`; ctx.fillRect(0, i, s, 1); }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, s - 4, s - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    for (const [x, y] of [[10, 10], [s - 10, 10], [10, s - 10], [s - 10, s - 10]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
    for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(120,60,20,${0.1 + rng() * 0.15})`; ctx.beginPath(); ctx.arc(rng() * s, rng() * s, 4 + rng() * 16, 0, 7); ctx.fill(); }
  },
  sheetmetal(ctx, s, rng, base) {
    ctx.fillStyle = hex(base); ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0.12)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, s);
    }
    noise(ctx, s, rng, 2000, 0.1);
  },
  wood(ctx, s, rng, base) {
    ctx.fillStyle = hex(base); ctx.fillRect(0, 0, s, s);
    const pw = s / 6;
    for (let p = 0; p < 6; p++) {
      const col = new THREE.Color(base).multiplyScalar(0.8 + rng() * 0.4);
      ctx.fillStyle = '#' + col.getHexString(); ctx.fillRect(p * pw, 0, pw - 2, s);
      for (let i = 0; i < 20; i++) { ctx.strokeStyle = `rgba(40,20,5,${rng() * 0.25})`; ctx.beginPath(); const x = p * pw + rng() * pw; ctx.moveTo(x, 0); ctx.lineTo(x + rng() * 6 - 3, s); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; for (let p = 0; p < 6; p++) ctx.fillRect(p * pw + pw - 2, 0, 2, s);
  },
  glass(ctx, s) {
    ctx.fillStyle = '#bfe3f0'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(20, s * 0.6); ctx.lineTo(s * 0.6, 20); ctx.stroke();
  },
  sandbag(ctx, s, rng, base) {
    ctx.fillStyle = '#6d5f42'; ctx.fillRect(0, 0, s, s);
    const h = s / 4;
    for (let r = 0; r < 4; r++) for (let c = -1; c < 3; c++) {
      const off = r % 2 ? s / 4 : 0;
      const col = new THREE.Color(base).multiplyScalar(0.85 + rng() * 0.25);
      ctx.fillStyle = '#' + col.getHexString();
      ctx.beginPath(); ctx.ellipse(c * s / 2 + off + s / 4, r * h + h / 2, s / 4 - 3, h / 2 - 3, 0, 0, 7); ctx.fill();
    }
    noise(ctx, s, rng, 2500, 0.1);
  },
  ground(ctx, s, rng, base) {
    ctx.fillStyle = hex(base); ctx.fillRect(0, 0, s, s);
    noise(ctx, s, rng, 14000, 0.16);
    for (let i = 0; i < 30; i++) {
      const g = ctx.createRadialGradient(rng() * s, rng() * s, 0, rng() * s, rng() * s, 30 + rng() * 50);
      const dark = rng() > 0.5;
      g.addColorStop(0, dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }
  },
  asphalt(ctx, s, rng, base) {
    painters.ground(ctx, s, rng, base);
    ctx.fillStyle = 'rgba(230,200,60,0.5)';
    ctx.fillRect(s / 2 - 3, 0, 6, s / 3);
  },
  rock(ctx, s, rng, base) { painters.concrete(ctx, s, rng, base); noise(ctx, s, rng, 4000, 0.2); },
  dirt(ctx, s, rng, base) { painters.ground(ctx, s, rng, base); },
  foliage(ctx, s, rng, base) {
    ctx.fillStyle = hex(base); ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const col = new THREE.Color(base).multiplyScalar(0.6 + rng() * 0.8);
      ctx.fillStyle = '#' + col.getHexString();
      ctx.beginPath(); ctx.ellipse(rng() * s, rng() * s, 3 + rng() * 6, 2 + rng() * 3, rng() * 3, 0, 7); ctx.fill();
    }
  },
};

export function getTexture(kind, baseColor, anisotropy = 4) {
  const key = kind + ':' + baseColor;
  if (cache.has(key)) return cache.get(key);
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  const rng = mulberry32(kind.length * 9973 + baseColor);
  (painters[kind] || painters.concrete)(ctx, 256, rng, baseColor);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  cache.set(key, t);
  return t;
}
