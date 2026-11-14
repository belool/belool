// Testes unitários da lógica pura (rodar com: node --test tests/unit)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rayAABB, raySphere, angleWrap, mulberry32 } from '../../src/core/util.js';
import { computeStats, damageAtRange, regionDamage, penetrationCost, WEAPONS, ATTACHMENTS, AMMO_TYPES } from '../../src/combat/weapons.js';
import { NavGrid } from '../../src/world/NavGrid.js';
import { xpForLevel, levelFromXp, rankOf, rankDelta, Progression, newChallenges, MAX_LEVEL } from '../../src/progression/Progression.js';
import { defaultProfile } from '../../src/core/Save.js';
import { Events } from '../../src/core/Events.js';

const box = (x0, y0, z0, x1, y1, z1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

test('rayAABB acerta, calcula espessura e normal da face', () => {
  const b = box(5, 0, -1, 5.3, 3, 1);
  const r = rayAABB(0, 1, 0, 1, 0, 0, b.min, b.max, 100);
  assert.ok(r);
  assert.ok(Math.abs(r[0] - 5) < 1e-9);
  assert.ok(Math.abs(r[1] - 5.3) < 1e-9);
  assert.equal(r[2], 0); // eixo X
  assert.equal(r[3], -1); // normal -X (face voltada para o atirador)
  assert.equal(rayAABB(0, 5, 0, 1, 0, 0, b.min, b.max, 100), null); // passa por cima
  assert.equal(rayAABB(0, 1, 0, 1, 0, 0, b.min, b.max, 4), null);   // alcance insuficiente
});

test('raySphere acerta a cabeça', () => {
  assert.ok(Math.abs(raySphere(0, 1.6, 0, 0, 0, -1, 0, 1.6, -10, 0.15, 100) - 9.85) < 1e-9);
  assert.equal(raySphere(0, 1.6, 0, 0, 0, -1, 1, 1.6, -10, 0.15, 100), null);
});

test('angleWrap e PRNG determinístico', () => {
  assert.ok(Math.abs(angleWrap(Math.PI * 3) - Math.PI) < 1e-9);
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('todas as armas têm atributos válidos', () => {
  for (const id of Object.keys(WEAPONS)) {
    const s = computeStats(id);
    assert.ok(s.damage > 0, id);
    assert.ok(s.fireInterval > 0, id);
    if (id !== 'knife') { assert.ok(s.mag > 0 && s.velocity > 0 && s.range > 0, id); }
  }
});

test('acessórios e munição modificam os atributos', () => {
  const base = computeStats('ar4');
  const mod = computeStats('ar4', { muzzle: 'suppressor', grip: 'vertical', mag: 'extended', optic: 'acog' }, 'ap');
  assert.ok(mod.suppressed && !base.suppressed);
  assert.ok(mod.noise < base.noise);
  assert.ok(mod.recoil.vert < base.recoil.vert);
  assert.equal(mod.mag, 45);
  assert.equal(mod.adsZoom, 3);
  assert.ok(mod.pen > base.pen * 1.9);
  assert.ok(mod.damage < base.damage);
  const hp = computeStats('ar4', {}, 'hp');
  assert.ok(hp.damage > base.damage && hp.pen < base.pen);
});

test('queda de dano por distância e multiplicadores por região', () => {
  const s = computeStats('vespa');
  assert.equal(damageAtRange(s, 5), s.damage);
  assert.ok(damageAtRange(s, 100) < s.damage);
  assert.ok(Math.abs(damageAtRange(s, 1e6) - s.damage * s.minMul) < 1e-9);
  assert.ok(regionDamage(s, 20, 'head') > regionDamage(s, 20, 'chest'));
  assert.ok(regionDamage(s, 20, 'leg') < regionDamage(s, 20, 'chest'));
  // um tiro de sniper na cabeça a curta distância é letal
  const sn = computeStats('longbow');
  assert.ok(regionDamage(sn, damageAtRange(sn, 50), 'head') >= 100);
});

test('penetração: madeira é atravessável, concreto não', () => {
  const ar = computeStats('ar4');
  assert.ok(penetrationCost('wood', 0.12) < ar.pen);
  assert.ok(penetrationCost('concrete', 0.3) > ar.pen);
  const ap = computeStats('longbow', {}, 'ap');
  assert.ok(penetrationCost('brick', 0.25) < ap.pen, 'sniper AP atravessa tijolo');
});

test('NavGrid: A* contorna um muro e respeita portas', () => {
  const n = new NavGrid(-20, -20, 20, 20, 1);
  // muro em z=0 de x=-20..20 com uma porta de 2,2 m em x=8
  const walls = [box(-20, 0, -0.15, 6.9, 3, 0.15), box(9.1, 0, -0.15, 20, 3, 0.15)];
  n.rasterize(walls, 0.36);
  const p = n.findPath(-10, -10, -10, 10);
  assert.ok(p, 'existe caminho pela porta');
  // o caminho precisa passar perto da porta
  assert.ok(p.some(([x, z]) => Math.abs(x - 8) < 2 && Math.abs(z) < 2), JSON.stringify(p));
  // sem porta: sem caminho
  const n2 = new NavGrid(-20, -20, 20, 20, 1);
  n2.rasterize([box(-20, 0, -0.15, 20, 3, 0.15)], 0.36);
  assert.equal(n2.findPath(-10, -10, -10, 10), null);
});

test('NavGrid: pontos de cobertura ao lado de obstáculos altos', () => {
  const n = new NavGrid(-10, -10, 10, 10, 1);
  n.rasterize([box(-1, 0, -1, 1, 1.2, 1)], 0.36);
  const c = n.coverCandidates(0, 0, 5);
  assert.ok(c.length > 0);
  assert.ok(c.every((p) => n.walkableAt(p.x, p.z)));
});

test('NavGrid: atualização regional após destruição', () => {
  const n = new NavGrid(-10, -10, 10, 10, 1);
  const wall = box(-10, 0, -0.15, 10, 3, 0.15);
  n.rasterize([wall], 0.36);
  assert.equal(n.findPath(0, -5, 0, 5), null);
  wall.removed = true;
  n.rasterize([wall], 0.36, { minX: -10, minZ: -0.15, maxX: 10, maxZ: 0.15 });
  assert.ok(n.findPath(0, -5, 0, 5));
});

test('Progressão: curva de nível, ranking e desbloqueios', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(xpForLevel(5)), 5);
  assert.equal(levelFromXp(xpForLevel(5) - 1), 4);
  assert.equal(levelFromXp(1e12), MAX_LEVEL);
  assert.equal(rankOf(1000).name, 'Bronze');
  assert.ok(rankDelta(true, 20, 5, 3000) > rankDelta(false, 2, 10, 200));
  const ev = new Events();
  const ups = [];
  ev.on('levelup', (e) => ups.push(e));
  const pr = new Progression(defaultProfile(), ev);
  assert.ok(pr.isUnlocked('weapon', 'ar4'));
  assert.ok(!pr.isUnlocked('weapon', 'titan'));
  pr.addXp(xpForLevel(12), 'teste');
  assert.ok(pr.isUnlocked('weapon', 'titan'));
  assert.ok(ups.length === 1 && ups[0].unlocks.length > 0);
});

test('Progressão: abates contam para camuflagens, desafios e conquistas', () => {
  const prof = defaultProfile();
  prof.challenges = newChallenges(7);
  const pr = new Progression(prof, new Events());
  assert.ok(!pr.camoUnlocked('ar4', 'desert'));
  for (let i = 0; i < 15; i++) pr.record({ type: 'kill', weapon: 'ar4', cls: 'ar', headshot: i % 2 === 0, dist: 20 });
  assert.ok(pr.camoUnlocked('ar4', 'desert'));
  assert.equal(prof.stats.kills, 15);
  assert.ok(prof.achievements.first_blood);
  assert.ok(prof.xp > 0);
});

test('Eventos: inscrição e cancelamento', () => {
  const ev = new Events(); let n = 0;
  const off = ev.on('x', () => n++);
  ev.emit('x'); off(); ev.emit('x');
  assert.equal(n, 1);
});
