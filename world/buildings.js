// The children's buildings, added 2026-11-09: a farm for the animals on the
// west lawn, an English classroom on the south lawn, a castle on the east
// lawn, a hedge maze in the south-west corner, a playground beside the
// classroom, and a treehouse in a new tree east of the playground. (The
// bridge, islet and lighthouse are a site of their own: world/islet.js.)
//
// Everything structural is grid blocks, so collision, ground and the map
// come from the engine as usual; small furniture goes into the furnish
// static BoxBatch, with footprints appended to its obstacles, in the style
// of world/furnish.js. Coordinates: grid fills are cell indices (half-open);
// batch boxes are continuous, from their bottom centre.
import { buildTrees } from '@engine/world/terrain.js';
import { FARM } from './layout.js';

const L = {
  oak: { tex: 'oak' }, wood: { tex: 'wood_panel' }, steel: { tex: 'steel' },
  stone: { tex: 'stone' }, books: { tex: 'bookshelf', top: 'wood_panel' },
  paint: tint => ({ tex: 'paint', tint }),
  light: (tint, emissive = 1) => ({ tex: 'paint', tint, emissive }),
};

export function buildBuildings({ grid, batch: B, obstacles, lighting }) {
  grid.define('fence', { tex: { all: 'oak' }, merge: true });
  grid.define('hay', { tex: { all: 'sand' }, tint: 0xe6c34f, merge: true });
  grid.define('schoolwall', { tex: { all: 'plaster' }, merge: true });
  grid.define('schoolglass', { kind: 'glass', tex: { all: 'glass' }, merge: true });
  grid.define('heartblock', { tex: { all: 'flower_red' }, merge: true });
  const foot = (x0, z0, x1, z1) => obstacles.push({ x0, x1, z0, z1, level: 0 });
  const isLog = (x, z) => grid.type(x, 0, z)?.name === 'log';

  buildFarm(grid, B, foot, isLog);
  buildClassroom(grid, B, foot, lighting);
  buildCastle(grid, B, foot);
  buildMaze(grid, foot, isLog);
  buildPlayground(grid, B, foot);
  buildTreehouse(grid, B);
}

// ---------- 1. The farm (west lawn) ----------
// Fence on the FARM perimeter cells, one block high, with the two-cell gate
// in the south fence left open between two log posts. Tree trunks standing
// on the fence line serve as posts and are left in place.
function buildFarm(grid, B, foot, isLog) {
  const { x0, x1, z0, z1, gate } = FARM;
  for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) {
    if (z === z1 && x >= gate.x0 && x < gate.x1) continue; // the gate gap
    if (isLog(x, z)) continue; // a trunk is the post here
    grid.set(x, 0, z, 'fence');
  }
  for (let z = z0 + 1; z < z1; z++) for (const x of [x0, x1]) grid.set(x, 0, z, 'fence');
  // Gate posts, two high, either side of the gap.
  for (const x of [gate.x0 - 1, gate.x1]) for (let y = 0; y < 2; y++) grid.set(x, y, z1, 'log');

  // The shelter shed in the north-west corner: west and north plank walls,
  // a log post at the open corner, and a flat roof with an overhang. The
  // front (south-east) stays open.
  for (let z = 5; z <= 7; z++) for (let y = 0; y < 3; y++) grid.set(-32, y, z, 'planks');
  for (let x = -32; x <= -30; x++) for (let y = 0; y < 3; y++) grid.set(x, y, 5, 'planks');
  for (let y = 0; y < 3; y++) grid.set(-30, y, 7, 'log');
  grid.fill(-33, 3, 4, -28, 4, 9, 'planks');
  // Hay bales in and around the shed.
  grid.set(-31, 0, 6, 'hay'); grid.set(-31, 1, 6, 'hay'); grid.set(-31, 0, 7, 'hay');
  grid.set(-24, 0, 12, 'hay'); grid.set(-24, 1, 12, 'hay');
  grid.set(-31, 0, 12, 'hay'); grid.set(-27, 0, 10, 'hay');

  // The feed trough along the north fence: a wooden rim of hay.
  B.box(-29, 0, 5.8, 2.0, 0.4, 0.8, L.oak);
  B.box(-29, 0.3, 5.8, 1.7, 0.18, 0.55, L.paint(0xe6c34f));
  foot(-30.05, 5.35, -27.95, 6.25);
  // The water trough by the east fence: a stone rim of water.
  B.box(-23.9, 0, 6.4, 1.1, 0.45, 0.8, L.stone);
  B.box(-23.9, 0.36, 6.4, 0.9, 0.1, 0.6, { tex: 'water' });
  foot(-24.5, 5.95, -23.3, 6.85);
}

// ---------- 2. The English classroom (south lawn, east of the pool) ----------
// Cells x 5..12, z 21..27: plaster walls three high, a plank floor, a roof
// slab with an overhang, a two-wide door in the south wall and glass
// windows. Inside: a blackboard on the north wall, a teacher's desk, four
// pupil desks with chairs, and bookshelves along the west wall.
function buildClassroom(grid, B, foot, lighting) {
  for (let x = 5; x <= 12; x++) for (let z = 21; z <= 27; z++) grid.set(x, -1, z, 'planks');
  const glassAt = new Set(['6,21', '7,21', '10,21', '11,21', '6,27', '11,27', '5,23', '5,24', '12,23', '12,24']);
  for (let x = 5; x <= 12; x++) for (const z of [21, 27]) for (let y = 0; y < 3; y++) {
    if (z === 27 && (x === 8 || x === 9) && y < 2) continue; // the door gap (lintel above)
    grid.set(x, y, z, glassAt.has(`${x},${z}`) && y === 1 ? 'schoolglass' : 'schoolwall');
  }
  for (let z = 22; z <= 26; z++) for (const x of [5, 12]) for (let y = 0; y < 3; y++) {
    grid.set(x, y, z, glassAt.has(`${x},${z}`) && y === 1 ? 'schoolglass' : 'schoolwall');
  }
  grid.fill(4, 3, 20, 14, 4, 29, 'roof');

  // The blackboard, framed in oak, on the north wall's inner face (z = 22).
  B.box(9, 1.0, 22.1, 3.6, 1.5, 0.1, L.oak);
  B.box(9, 1.07, 22.16, 3.3, 1.32, 0.05, L.paint(0x24382e));
  B.box(9, 0.94, 22.18, 3.3, 0.05, 0.14, L.oak);
  B.box(8.2, 0.99, 22.24, 0.16, 0.03, 0.03, L.paint(0xf5f2e8)); // a stub of chalk
  // The teacher's desk, facing the class, with a book and an apple.
  B.box(9, 0.72, 23.2, 1.6, 0.06, 0.75, L.wood);
  for (const lx of [8.35, 9.65]) B.box(lx, 0, 23.2, 0.08, 0.72, 0.7, L.steel);
  B.box(8.7, 0.78, 23.1, 0.3, 0.05, 0.22, L.paint(0xd1495b));
  B.box(9.4, 0.78, 23.3, 0.09, 0.09, 0.09, L.paint(0xd23a2e));
  foot(8.15, 22.8, 9.85, 23.6);
  // Four pupil desks with chairs, in two rows facing the board.
  const chairTints = [0xd1495b, 0x2a9d8f, 0xe9c46a, 0x4361ee];
  [[7.3, 24.6], [10.2, 24.6], [7.3, 26.0], [10.2, 26.0]].forEach(([x, z], i) => {
    B.box(x, 0.68, z, 1.15, 0.05, 0.55, L.oak);
    for (const lx of [x - 0.48, x + 0.48]) B.box(lx, 0, z, 0.07, 0.68, 0.5, L.paint(0x8d9799));
    B.box(x - 0.25, 0.73, z, 0.26, 0.04, 0.19, L.paint(0xf5f2e8)); // an open exercise book
    const c = L.paint(chairTints[i]);
    B.box(x, 0.42, z + 0.62, 0.5, 0.05, 0.45, c);
    B.box(x, 0.47, z + 0.85, 0.5, 0.55, 0.05, c);
    for (const px of [x - 0.21, x + 0.21]) B.box(px, 0, z + 0.85, 0.05, 0.47, 0.05, c);
    foot(x - 0.62, z - 0.32, x + 0.62, z + 0.95);
  });
  // Bookshelves along the west wall, in the house's bookshelf finish.
  for (const z of [23.4, 24.55, 25.7]) B.box(6.22, 0, z, 0.4, 1.9, 1.05, L.books);
  foot(6.0, 22.8, 6.5, 26.3);
  // A rug and a ceiling lamp (baked; the classroom is inside the light volume).
  B.box(9, 0.01, 25.3, 3.8, 0.02, 2.4, L.paint(0xe07a5f));
  B.box(9, 2.8, 24.5, 0.05, 0.25, 0.05, L.steel);
  B.box(9, 2.5, 24.5, 0.55, 0.14, 0.55, L.light(0xffdfa8));
  lighting.push({ id: 'classroom-lamp', position: [9, 2.4, 24.5], power: 1.1, radius: 6, direction: [0, -1, 0] });
}

// ---------- 3. The castle (east lawn) ----------
// Cells x 27..35, z 0..8: stone walls three high with crenellations, four
// corner towers five high with stepped deepslate caps, a gate in the south
// wall, and a flag over a gravel courtyard.
function buildCastle(grid, B, foot) {
  for (let x = 28; x <= 34; x++) for (let z = 1; z <= 7; z++) grid.set(x, -1, z, 'gravel');
  const onWall = (x, z) => x === 27 || x === 35 || z === 0 || z === 8;
  for (let x = 27; x <= 35; x++) for (let z = 0; z <= 8; z++) {
    if (!onWall(x, z)) continue;
    if (z === 8 && (x === 30 || x === 31)) continue; // the gate gap
    for (let y = 0; y < 3; y++) grid.set(x, y, z, 'stone');
    if ((x + z) % 2 === 0) grid.set(x, 3, z, 'stone'); // crenellation
  }
  // The gate frame and lintel in deepslate.
  for (let y = 0; y < 3; y++) grid.set(32, y, 8, 'deepslate');
  grid.set(30, 3, 8, 'deepslate'); grid.set(31, 3, 8, 'deepslate');
  // Corner towers with stepped caps.
  for (const [tx, tz] of [[27, 0], [33, 0], [27, 6], [33, 6]]) {
    grid.fill(tx, 0, tz, tx + 3, 5, tz + 3, 'stone');
    grid.fill(tx, 5, tz, tx + 3, 6, tz + 3, 'deepslate');
    grid.set(tx + 1, 6, tz + 1, 'deepslate');
  }
  // Benches and the flag pole in the courtyard.
  for (const [x, z] of [[28, 4], [28, 5], [34, 4], [34, 5]]) grid.set(x, 0, z, 'stone');
  for (let y = 0; y < 6; y++) grid.set(31, y, 4, 'log');
  B.box(32.05, 5.05, 4.5, 1.1, 0.6, 0.06, L.paint(0xd23a2e));
  foot(31, 4, 32, 5);
}

// ---------- 4. The hedge maze (south-west lawn) ----------
// Cells x -35..-25, z 18..27, two-high hedges. The layout is a spanning
// tree over a node lattice (nodes at odd/odd cells), designed and
// BFS-verified offline: the entrance (east side, row 5) reaches every path
// cell, and the centre clearing (rows 3-4, cols 3-5) is 11 steps in.
// '#' is hedge, '.' is path. Tree trunks on wall cells stay standing and
// serve as the hedge there.
export const MAZE_ROWS = [
  '###########',
  '#...#.....#',
  '###.#.#.###',
  '#.#...#...#',
  '#.#...###.#',
  '#.#.#...#..',
  '#.#.#####.#',
  '#.........#',
  '###########',
  '###########',
];
function buildMaze(grid, foot, isLog) {
  for (let j = 0; j < MAZE_ROWS.length; j++) for (let i = 0; i < MAZE_ROWS[j].length; i++) {
    if (MAZE_ROWS[j][i] !== '#') continue;
    const x = -35 + i, z = 18 + j;
    if (isLog(x, z)) continue; // the trunk is the hedge here
    grid.set(x, 0, z, 'hedge'); grid.set(x, 1, z, 'hedge');
  }
  // The prize at the centre: a flower block on a stone pedestal.
  grid.set(-30, 0, 21, 'stone'); grid.set(-30, 1, 21, 'heartblock');
  foot(-30, 21, -29, 22);
  // Entrance posts east of the gap.
  for (let y = 0; y < 2; y++) { grid.set(-24, y, 22, 'log'); grid.set(-24, y, 24, 'log'); }
}

// ---------- 5. The playground (south lawn, east of the classroom) ----------
// A slide with a stepped tower and a rotated chute, a swing set with two
// swings, and a seesaw; sand patches under the slide landing and swings.
function buildPlayground(grid, B, foot) {
  for (let x = 17; x <= 21; x++) for (let z = 23; z <= 25; z++) grid.set(x, -1, z, 'sand');
  for (let x = 20; x <= 23; x++) for (let z = 23; z <= 25; z++) grid.set(x, -1, z, 'sand');
  // The slide: a step up to a two-by-two platform, then the chute east.
  grid.set(15, 0, 24, 'concrete');
  grid.fill(16, 0, 23, 18, 2, 25, 'planks');
  const chute = { rz: -0.6 };
  B.box(19.0, 1.05, 24.5, 2.6, 0.08, 0.9, L.paint(0xe63946), chute);
  B.box(19.0, 1.13, 24.02, 2.6, 0.18, 0.07, L.paint(0xe63946), chute);
  B.box(19.0, 1.13, 24.98, 2.6, 0.18, 0.07, L.paint(0xe63946), chute);
  foot(17.9, 24.02, 20.6, 24.98);
  // The swing set: two A-frames and a top bar, two swings hanging still.
  for (const fx of [21.2, 23.8]) {
    B.box(fx, 0, 23.35, 0.09, 2.5, 0.09, L.steel, { rx: 0.42 });
    B.box(fx, 0, 24.65, 0.09, 2.5, 0.09, L.steel, { rx: -0.42 });
  }
  B.box(22.5, 2.42, 24, 3.6, 0.09, 0.09, L.steel);
  [[21.9, 0x2a9d8f], [23.1, 0xe9c46a]].forEach(([x, tint]) => {
    for (const cz of [23.88, 24.12]) B.box(x, 1.05, cz, 0.04, 1.35, 0.04, L.steel);
    B.box(x, 0.98, 24, 0.55, 0.06, 0.3, L.paint(tint));
  });
  foot(20.9, 23.1, 23.95, 24.9);
  // The seesaw, tipped toward the east.
  B.box(23.5, 0, 22.5, 0.45, 0.5, 0.45, L.stone);
  B.box(23.5, 0.5, 22.5, 3.4, 0.07, 0.4, L.oak, { rz: 0.16 });
  B.box(21.84, 0.26, 22.5, 0.55, 0.06, 0.42, L.paint(0xe9c46a), { rz: 0.16 });
  B.box(25.16, 0.8, 22.5, 0.55, 0.06, 0.42, L.paint(0xe9c46a), { rz: 0.16 });
  foot(21.7, 22.25, 25.3, 22.75);
}

// ---------- 6. The treehouse (a new tree east of the playground) ----------
// A tree planted for the purpose (trunk 6, crown radius 3), with a plank
// platform tucked under its crown at y 4, a railing, a two-wall hut in one
// corner, and a flight of ever-taller step stacks up its west side. The
// crown's leaves are cleared out of the platform's headroom (y 5-6) so the
// platform is a room inside the leaves, roofed by the y 7-8 layers.
function buildTreehouse(grid, B) {
  buildTrees(grid, [[29, 24, 6, 3, 'leaves']]);
  for (let x = 27; x <= 31; x++) for (let z = 22; z <= 26; z++) for (let y = 5; y <= 6; y++) {
    if (grid.type(x, y, z)?.name === 'leaves') grid.set(x, y, z, null);
  }
  // The crown's lowest layer can also leave a leaf over the top step.
  if (grid.type(27, 4, 24)?.name === 'leaves') grid.set(27, 4, 24, null);
  // The step flight: stacks of one, two, three and four blocks, west side.
  grid.set(24, 0, 24, 'planks');
  grid.fill(25, 0, 24, 26, 2, 25, 'planks');
  grid.fill(26, 0, 24, 27, 3, 25, 'planks');
  grid.fill(27, 0, 24, 28, 4, 25, 'planks');
  // Support posts under the platform's west corners.
  for (let y = 0; y < 4; y++) { grid.set(27, y, 22, 'log'); grid.set(27, y, 26, 'log'); }
  // The platform ring at y 4 (the trunk and the top step are left as they are).
  for (let x = 27; x <= 31; x++) for (let z = 22; z <= 26; z++) {
    if ((x === 29 && z === 24) || (x === 27 && z === 24)) continue;
    grid.set(x, 4, z, 'planks');
  }
  // The hut in the north-east corner: north and east walls, and a roof.
  for (const [x, z] of [[30, 22], [31, 22], [31, 23]]) for (let y = 5; y < 7; y++) grid.set(x, y, z, 'planks');
  grid.fill(29, 7, 22, 32, 8, 24, 'planks');
  // The railing around the open edges (the step gap and the hut stay open).
  for (const [x, z] of [[27, 22], [28, 22], [29, 22], [27, 23], [27, 25],
    [27, 26], [28, 26], [29, 26], [30, 26], [31, 26], [31, 24], [31, 25]]) {
    grid.set(x, 5, z, 'fence');
  }
  // A tiny table on the platform.
  B.box(28.4, 5.5, 25.5, 0.7, 0.05, 0.7, L.oak);
  B.box(28.4, 5.0, 25.5, 0.09, 0.5, 0.09, L.oak);
}
