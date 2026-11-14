// ================================================================
// MAPAS — cada mapa é uma função de construção sobre o MapBuilder.
// Retorna spawns por equipe e pontos estratégicos nomeados.
// ================================================================

const perimeter = (B, s, h = 4, mat = 'concrete', tint) => {
  B.wall(-s, -s, s, -s, h, { mat, tint, thick: 1 });
  B.wall(-s, s, s, s, h, { mat, tint, thick: 1 });
  B.wall(-s, -s, -s, s, h, { mat, tint, thick: 1 });
  B.wall(s, -s, s, s, h, { mat, tint, thick: 1 });
};
const scatter = (B, n, s, fn, avoid = []) => {
  for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
    const x = B.r(-s, s), z = B.r(-s, s);
    if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
    fn(x, z); i++;
  }
};
const line = (a, b, n) => Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * i / Math.max(1, n - 1), a[1] + (b[1] - a[1]) * i / Math.max(1, n - 1)]);

export const MAPS = {
  refinery: {
    id: 'refinery', name: 'Refinaria Vulcano', theme: 'industrial', size: 85,
    ground: { kind: 'asphalt', tint: 0x4a4a48, mat: 'concrete' },
    desc: 'Complexo petroquímico com tanques, armazéns, contêineres e um túnel de dutos.',
    defaults: { time: 18.5, weather: 'fog' },
    build(B) {
      const S = 85;
      perimeter(B, S, 5, 'concrete', 0x77756f);
      for (const [x, z] of [[-18, -14], [18, -14], [-18, 18], [18, 18]]) B.tank(x, z, 5.5, 9);
      B.pipe(-12, -14, 12, -14, 4, 0.6); B.pipe(-12, 18, 12, 18, 5, 0.6);
      B.building(-52, -35, 26, 16, { mat: 'sheetmetal', tint: 0x6d7b84, floorH: 7, doors: ['n', 's', 'e', 'w'], glass: false, destructible: false });
      B.building(52, 38, 26, 16, { mat: 'sheetmetal', tint: 0x84706d, floorH: 7, doors: ['n', 's', 'e', 'w'], glass: false });
      B.building(0, 58, 16, 12, { mat: 'brick', floors: 2, doors: ['s', 'e'], parapet: true, destructible: true });
      B.building(0, -58, 16, 12, { mat: 'brick', floors: 2, doors: ['n', 'w'], parapet: true, destructible: true });
      for (let i = 0; i < 4; i++) { B.container(-48 + i * 0, 30 + i * 7, true, [0x8a3324, 0x2b5d8a, 0x3c7a3a, 0xa8822a][i], i % 2 + 1); }
      for (let i = 0; i < 4; i++) { B.container(48, -28 - i * 7, true, [0x2b5d8a, 0x8a3324, 0xa8822a, 0x3c7a3a][i], (i + 1) % 2 + 1); }
      B.container(-30, 52, false, 0x555555, 2); B.container(30, -52, false, 0x555555, 2);
      B.tunnel(-78, 0, -38, 0, 3.4, 3);
      B.tunnel(38, 0, 78, 0, 3.4, 3);
      for (const [x, z] of [[-6, 0], [6, 2], [0, -32], [-3, 34], [30, 10], [-30, -8], [60, -60], [-60, 60]]) B.barrel(x, z, true);
      for (const [x, z] of [[-10, 5], [10, -5], [-35, 15], [35, -15], [-25, -50], [25, 50], [65, 10], [-65, -12]]) B.crate(x, z, 1.3, 1 + Math.floor(B.r(0, 2)));
      B.sandbags(-8, -30, 8, -30); B.sandbags(-8, 30, 8, 30);
      B.tower(-70, -70, 6, 'metal'); B.tower(70, 70, 6, 'metal');
      for (const [x, z] of [[-30, 0], [30, 0], [0, 30], [0, -30], [-60, 15], [60, -15]]) B.lamp(x, z);
      return {
        spawns: { 0: line([-30, -76], [30, -76], 6), 1: line([-30, 76], [30, 76], 6) },
        points: { A: [-55, 5], B: [0, 2], C: [55, -5], baseA: [0, -72], baseB: [0, 72], intel: [0, 58], jammer: [52, 38], extract: [-70, -70] },
      };
    },
  },

  district: {
    id: 'district', name: 'Distrito 9', theme: 'urban', size: 80,
    ground: { kind: 'asphalt', tint: 0x3d3d3f, mat: 'concrete' },
    desc: 'Centro urbano em ruínas: prédios de dois andares, ruas estreitas e esgoto.',
    defaults: { time: 10, weather: 'clear' },
    build(B) {
      const S = 80;
      perimeter(B, S, 8, 'brick', 0x6b4a3a);
      const tints = [0x8a4b35, 0x9a8a70, 0x6d6a66, 0x7a5a4a, 0xa0896a];
      const blocks = [-50, -17, 17, 50];
      for (const bx of blocks) for (const bz of blocks) {
        if (Math.abs(bx) < 20 && Math.abs(bz) < 20) continue; // praça central
        const t = tints[Math.floor(B.r(0, tints.length))];
        if (B.r() < 0.5) {
          B.building(bx, bz, 18, 14, { mat: 'brick', tint: t, floors: 2, doors: ['n', 's'], parapet: true, destructible: true });
        } else {
          B.building(bx - 4.5, bz, 9, 14, { mat: 'concrete', tint: t, floors: 2, doors: ['e', 's'], parapet: true, destructible: true });
          B.building(bx + 5, bz + 2, 8, 10, { mat: 'brick', tint: t, floors: 1, doors: ['n', 'w'], destructible: true });
        }
      }
      // Praça central
      B.box(0, 0.5, 0, 5, 1, 5, 'concrete'); B.box(0, 1.6, 0, 1, 2.2, 1, 'concrete');
      B.sandbags(-9, -6, -9, 6); B.sandbags(9, -6, 9, 6);
      for (const [x, z, a] of [[-33, -5, false], [33, 8, false], [5, -33, true], [-8, 33, true], [-33, 40, false], [33, -40, false], [60, 33, true], [-60, -33, true]]) B.carWreck(x, z, a);
      for (const [x, z] of [[-33, 20], [33, -22], [20, 33], [-22, -33]]) { B.crate(x, z, 1.2, 2); B.barrel(x + 2, z + 1.5, true); }
      B.tunnel(-66, -70, -66, -36, 3.2, 2.8);
      B.tunnel(66, 36, 66, 70, 3.2, 2.8);
      for (const [x, z] of [[-33, -33], [33, 33], [-33, 33], [33, -33], [0, 66], [0, -66]]) B.lamp(x, z, 5);
      return {
        spawns: { 0: line([-40, -74], [40, -74], 6), 1: line([-40, 74], [40, 74], 6) },
        points: { A: [-33, 0], B: [0, 4], C: [33, 0], baseA: [0, -70], baseB: [0, 70], intel: [50, 50], extract: [-70, -74] },
      };
    },
  },

  forest: {
    id: 'forest', name: 'Floresta Negra', theme: 'forest', size: 90,
    ground: { kind: 'ground', tint: 0x3e5230, mat: 'dirt' },
    desc: 'Mata fechada com cabanas, bunker com túnel e um vale rochoso.',
    defaults: { time: 6.5, weather: 'rain' },
    build(B) {
      const S = 90;
      perimeter(B, S, 3, 'rock');
      const clear = [[0, 0, 16], [-50, 40, 14], [50, -40, 14], [45, 45, 12], [-45, -45, 12], [0, -80, 12], [0, 80, 12], [-15, -55, 8]];
      scatter(B, 260, S - 4, (x, z) => B.tree(x, z, B.r(0.8, 1.4)), clear);
      scatter(B, 40, S - 6, (x, z) => B.rock(x, z, B.r(1.2, 3.5)), clear);
      const cabin = (x, z, doors) => B.building(x, z, 9, 8, { mat: 'wood', tint: 0x7a5533, doors, destructible: true, explosiveOnly: false, wallHp: 140, roofMat: 'wood' });
      cabin(-50, 40, ['s', 'e']); cabin(-42, 46, ['w']); cabin(50, -40, ['n', 'w']); cabin(45, 45, ['s']); cabin(-45, -45, ['n']);
      // Bunker de concreto com túnel
      B.building(0, 0, 12, 10, { mat: 'concrete', tint: 0x6e6f66, doors: ['n', 's', 'e', 'w'], glass: false });
      B.sandbags(-8, -8, 8, -8); B.sandbags(-8, 8, 8, 8);
      B.tunnel(-15, -70, -15, -40, 3.2, 2.8);
      B.tower(30, 0, 7); B.tower(-30, 10, 7);
      B.fence(-60, 30, -38, 30); B.fence(40, -30, 62, -30);
      for (const [x, z] of [[4, -12], [-5, 12], [48, 48], [-48, -42]]) B.crate(x, z, 1.1, 2);
      B.barrel(-38, 40, true); B.barrel(55, -36, true);
      return {
        spawns: { 0: line([-30, -82], [30, -82], 6), 1: line([-30, 82], [30, 82], 6) },
        points: { A: [-48, 42], B: [0, 0], C: [48, -42], baseA: [0, -80], baseB: [0, 80], hostages: [-45, 45], hostages2: [45, 45], extract: [0, -82] },
      };
    },
  },

  desert: {
    id: 'desert', name: 'Posto Oásis', theme: 'desert', size: 90,
    ground: { kind: 'ground', tint: 0xb59a6a, mat: 'dirt' },
    desc: 'Vila de adobe no deserto, muralhas, palmeiras e um túnel sob a mesa rochosa.',
    defaults: { time: 13, weather: 'clear' },
    build(B) {
      const S = 90;
      perimeter(B, S, 3, 'rock', 0x9a7a55);
      const adobe = 0xc9a36b;
      const houses = [[-30, -20], [-15, -30], [12, -24], [28, -10], [-28, 12], [-10, 26], [14, 22], [30, 14], [0, 0]];
      houses.forEach(([x, z], i) => B.building(x, z, 10 + (i % 3) * 2, 9, { mat: 'brick', tint: adobe, floors: i % 3 === 0 ? 2 : 1, doors: [['n', 's', 'e', 'w'][i % 4], 's'], parapet: true, destructible: true, glass: false }));
      // Muralha da vila com portões
      B.wall(-45, -45, 45, -45, 3, { mat: 'brick', tint: 0xb08a58, thick: 0.8, openings: [{ at: 45, w: 6, y0: 0, y1: 3 }] });
      B.wall(-45, 45, 45, 45, 3, { mat: 'brick', tint: 0xb08a58, thick: 0.8, openings: [{ at: 45, w: 6, y0: 0, y1: 3 }] });
      B.wall(-45, -45, -45, 45, 3, { mat: 'brick', tint: 0xb08a58, thick: 0.8, openings: [{ at: 45, w: 6, y0: 0, y1: 3 }] });
      B.wall(45, -45, 45, 45, 3, { mat: 'brick', tint: 0xb08a58, thick: 0.8, openings: [{ at: 45, w: 6, y0: 0, y1: 3 }] });
      scatter(B, 35, S - 5, (x, z) => B.tree(x, z, B.r(0.7, 1.1), 'palm'), [[0, 0, 50]]);
      scatter(B, 30, S - 5, (x, z) => B.rock(x, z, B.r(2, 5)), [[0, 0, 52], [0, -78, 10], [0, 78, 10]]);
      // Mesa rochosa com túnel
      B.tunnel(60, -30, 60, 30, 3.4, 3);
      B.slab(66, -28, 84, 28, 0, 7, 'rock', { tint: 0x9a7a55 });
      for (const [x, z, a] of [[-60, 10, false], [-55, -30, true], [20, 60, true], [-20, -60, true]]) B.carWreck(x, z, a);
      for (const [x, z] of [[-6, 10], [8, -10], [-38, 0], [38, 2], [0, 38]]) B.crate(x, z, 1.2, 2);
      for (const [x, z] of [[-4, -12], [20, 34], [-36, -34]]) B.barrel(x, z, true);
      B.tower(-40, -40, 6); B.tower(40, 40, 6);
      return {
        spawns: { 0: line([-30, -80], [30, -80], 6), 1: line([-30, 80], [30, 80], 6) },
        points: { A: [-28, -2], B: [0, 6], C: [30, 0], baseA: [0, -78], baseB: [0, 78], convoy1: [-60, 10], convoy2: [60, 0], convoy3: [20, 60], extract: [0, -80] },
      };
    },
  },

  fortress: {
    id: 'fortress', name: 'Fortaleza Krane', theme: 'base', size: 90,
    ground: { kind: 'ground', tint: 0x5a5a4a, mat: 'dirt' },
    desc: 'Base militar fortificada: muralhas, torres, quartéis, hangar e QG de dois andares.',
    defaults: { time: 21, weather: 'storm' },
    build(B) {
      const S = 90;
      perimeter(B, S, 6, 'concrete', 0x5e5f58);
      // Muralha interna com portões
      B.wall(-60, -60, 60, -60, 4, { mat: 'concrete', tint: 0x6b6c63, thick: 1, openings: [{ at: 60, w: 7, y0: 0, y1: 4 }, { at: 20, w: 3, y0: 0, y1: 2.6 }] });
      B.wall(-60, 60, 60, 60, 4, { mat: 'concrete', tint: 0x6b6c63, thick: 1, openings: [{ at: 60, w: 7, y0: 0, y1: 4 }] });
      B.wall(-60, -60, -60, 60, 4, { mat: 'concrete', tint: 0x6b6c63, thick: 1, openings: [{ at: 60, w: 5, y0: 0, y1: 4 }] });
      B.wall(60, -60, 60, 60, 4, { mat: 'concrete', tint: 0x6b6c63, thick: 1, openings: [{ at: 60, w: 5, y0: 0, y1: 4 }] });
      for (const [x, z] of [[-55, -55], [55, -55], [-55, 55], [55, 55]]) B.tower(x, z, 7, 'concrete');
      // QG
      B.building(0, 32, 22, 16, { mat: 'concrete', tint: 0x7c7d74, floors: 2, doors: ['s', 'e', 'w'], parapet: true, destructible: true });
      // Quartéis
      for (const z of [-35, -15]) { B.building(-35, z, 18, 9, { mat: 'concrete', tint: 0x6d7060, doors: ['n', 's'] }); B.building(35, z, 18, 9, { mat: 'concrete', tint: 0x6d7060, doors: ['n', 's'] }); }
      // Hangar
      B.building(-36, 32, 22, 18, { mat: 'sheetmetal', tint: 0x55605a, floorH: 7, doors: ['s', 's', 'e'], glass: false });
      // Heliporto + ninhos de sacos de areia
      B.slab(26, 22, 46, 42, 0, 0.15, 'concrete', { tint: 0x3a3a3a });
      for (const [x, z] of [[-10, -5], [10, -5], [0, 12], [-20, 10], [20, 10]]) { B.sandbags(x - 2.5, z, x + 2.5, z); }
      for (let i = 0; i < 3; i++) B.container(-10 + i * 10, -45, true, [0x3c5a3a, 0x5a5a3a, 0x3a4a5a][i], 1 + (i % 2));
      B.tunnel(75, -80, 75, -40, 3.2, 2.8);
      B.tunnel(-75, 40, -75, 80, 3.2, 2.8);
      for (const [x, z] of [[-5, 18], [5, 18], [-25, -25], [25, -25], [45, 5], [-45, 5]]) B.barrel(x, z, true);
      for (const [x, z] of [[-14, 0], [14, 0], [0, -30], [-30, 50], [30, 50]]) B.crate(x, z, 1.2, 2);
      scatter(B, 50, S - 4, (x, z) => B.tree(x, z, B.r(0.9, 1.3)), [[0, 0, 64]]);
      for (const [x, z] of [[-30, 0], [30, 0], [0, -50], [0, 50]]) B.lamp(x, z, 7);
      return {
        spawns: { 0: line([-40, -80], [40, -80], 6), 1: line([-20, 20], [20, 20], 6) },
        points: { A: [-35, -25], B: [0, 0], C: [35, -25], baseA: [0, -78], baseB: [0, 45], boss: [0, 32], gate: [0, -60], extract: [0, -82] },
      };
    },
  },

  island: {
    id: 'island', name: 'Ilha Zero', theme: 'island', size: 320, large: true,
    ground: { kind: 'ground', tint: 0x4d5e38, mat: 'dirt' },
    desc: 'Mapa de grande escala para Battle Royale: vilas, zona industrial, floresta e base.',
    defaults: { time: 15, weather: 'clear' },
    build(B) {
      const S = 320;
      perimeter(B, S, 4, 'rock');
      const towns = [];
      const kinds = ['urban', 'cabins', 'industrial', 'adobe', 'base'];
      for (let i = 0, tries = 0; i < 16 && tries < 400; tries++) {
        const x = B.r(-S + 50, S - 50), z = B.r(-S + 50, S - 50);
        if (towns.some((t) => Math.hypot(t.x - x, t.z - z) < 95)) continue;
        towns.push({ x, z, kind: kinds[i % kinds.length] }); i++;
      }
      for (const t of towns) {
        const { x, z } = t;
        if (t.kind === 'urban') {
          for (const [dx, dz] of [[-14, -12], [14, -12], [-14, 12], [14, 12]]) B.building(x + dx, z + dz, 12, 10, { mat: 'brick', tint: 0x8a5a45, floors: 2, doors: ['n', 's'], parapet: true, destructible: true });
          B.carWreck(x, z, true); B.carWreck(x + 3, z - 25, false);
        } else if (t.kind === 'cabins') {
          for (const [dx, dz] of [[-10, 0], [10, 6], [0, -12]]) B.building(x + dx, z + dz, 8, 7, { mat: 'wood', tint: 0x7a5533, doors: ['s'], destructible: true, explosiveOnly: false, wallHp: 140 });
          B.tower(x + 18, z - 18, 7);
        } else if (t.kind === 'industrial') {
          B.building(x, z, 22, 14, { mat: 'sheetmetal', tint: 0x6d7b84, floorH: 7, doors: ['n', 's', 'e'], glass: false });
          B.tank(x + 20, z + 16, 4.5, 8); B.container(x - 20, z + 14, true, 0x8a3324, 2); B.container(x - 20, z - 14, false, 0x2b5d8a);
          B.barrel(x + 8, z + 12, true); B.barrel(x - 6, z - 12, true);
        } else if (t.kind === 'adobe') {
          for (const [dx, dz] of [[-12, -8], [10, -10], [0, 10]]) B.building(x + dx, z + dz, 10, 9, { mat: 'brick', tint: 0xc9a36b, doors: ['s', 'n'], parapet: true, destructible: true, glass: false });
        } else {
          B.building(x, z, 16, 10, { mat: 'concrete', tint: 0x6d7060, floors: 2, doors: ['s', 'n'], parapet: true, destructible: true });
          B.sandbags(x - 6, z - 12, x + 6, z - 12); B.tower(x + 16, z + 10, 6, 'concrete');
        }
        for (let k = 0; k < 4; k++) B.crate(x + B.r(-25, 25), z + B.r(-25, 25), 1.2, 1 + (k % 2));
      }
      const avoid = towns.map((t) => [t.x, t.z, 36]);
      scatter(B, 900, S - 6, (x, z) => B.tree(x, z, B.r(0.8, 1.4)), avoid);
      scatter(B, 160, S - 6, (x, z) => B.rock(x, z, B.r(1.5, 4)), avoid);
      for (let i = 0; i < 4; i++) {
        const x = B.r(-S + 60, S - 60), z = B.r(-S + 60, S - 60);
        if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 45)) continue;
        B.tunnel(x, z, x + 40, z, 3.4, 3);
      }
      const spawns = Array.from({ length: 120 }, () => [B.r(-S + 20, S - 20), B.r(-S + 20, S - 20)]);
      return { spawns: { 0: spawns, 1: spawns }, points: { center: [0, 0] }, towns };
    },
  },
};

export const MAP_LIST = ['refinery', 'district', 'forest', 'desert', 'fortress'];
