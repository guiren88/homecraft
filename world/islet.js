// The bridge, the islet and the lighthouse, south of the bay. The block
// grid only spans the island (layout ISLAND), so — like the pier and the
// mountain — this is a site of its own: BoxBatch geometry plus the ground
// levels the player walks on. The bridge leaves the south shore at x = 18,
// where the bay cuts in (the shore is at z ≈ 27 there), and lands on a
// grassy islet whose top is level with the island's ground (y 0).
import * as THREE from 'three';
import { BoxBatch } from '@engine/world/blocks.js';

export const ISLET = { x0: 13.5, x1: 22.5, z0: 33, z1: 42, y: 0 };
export const BRIDGE = { x0: 16.8, x1: 19.2, z0: 26.4, z1: 34.5, y: 0.24 };
// What the player cannot walk or fly through: the lighthouse and the palm.
const SOLIDS = [
  { x0: 15.7, x1: 20.3, z0: 36.2, z1: 40.8, y0: 0, y1: 9.05 },
  { x0: 15.6, x1: 16.3, z0: 35.0, z1: 35.4, y0: 0, y1: 3.2 },
];
const BODY = 1.8, RADIUS = 0.3;

const OAK = { tex: 'wood_floor' }, WALNUT = { tex: 'walnut' };
const paint = tint => ({ tex: 'paint', tint });
const WHITE = paint(0xf1efe9), RED = paint(0xc23b2e), CHARCOAL = paint(0x2f3438);
const WARM = { tex: 'paint', tint: 0xffd8a0, emissive: 0.9 };

export function buildIslet(layer, materials) {
  const root = new THREE.Group(); root.name = 'islet';
  const B = new BoxBatch(layer);
  const box = (x, y, z, w, h, d, look, opts = {}) => B.box(x, y, z, w, h, d, look, { shadow: false, ...opts });

  // The islet: a stone skirt under the waterline and a sand block with a
  // grass top, plus two rocks and a small palm.
  box(18, -2.8, 37.5, 10.5, 1.9, 10.5, { tex: 'stone' });
  box(18, -2.2, 37.5, 9, 2.2, 9, { tex: 'sand', top: 'grass_top' });
  box(14.6, -0.5, 34.2, 1.1, 0.9, 1.0, { tex: 'stone' });
  box(21.6, -0.6, 41, 1.3, 1.0, 1.1, { tex: 'stone' });
  box(15.8, 0, 35.2, 0.28, 1.1, 0.28, { tex: 'log' });
  box(15.9, 1.1, 35.2, 0.26, 1.1, 0.26, { tex: 'log' });
  box(16.05, 2.2, 35.2, 0.24, 1.0, 0.24, { tex: 'log' });
  for (let k = 0; k < 5; k++) B.at(16.1, 3.15, 35.2, k * Math.PI * 2 / 5, () => {
    B.box(0.85, -0.05, 0, 1.8, 0.06, 0.55, { tex: 'hedge' }, { rz: -0.25, shadow: false });
  });

  // The lighthouse on the islet's south half: white and red bands stepping
  // in, a gallery, a glowing lamp room behind glass, and a stepped cap.
  box(18, 0, 38.5, 4.6, 1.8, 4.6, WHITE);
  box(18, 1.8, 38.5, 3.9, 1.8, 3.9, RED);
  box(18, 3.6, 38.5, 3.2, 1.8, 3.2, WHITE);
  box(18, 5.4, 38.5, 2.6, 1.2, 2.6, RED);
  box(18, 6.6, 38.5, 3.3, 0.18, 3.3, CHARCOAL);
  box(18, 6.85, 38.5, 0.95, 0.85, 0.95, WARM);
  box(18, 6.78, 38.5, 1.9, 1.15, 1.9, { tex: 'glass', glass: true });
  box(18, 7.93, 38.5, 2.5, 0.35, 2.5, CHARCOAL);
  box(18, 8.28, 38.5, 1.4, 0.35, 1.4, CHARCOAL);
  box(18, 8.63, 38.5, 0.28, 0.42, 0.28, CHARCOAL);
  // The door faces the bridge; a small window on each white/red band.
  box(18, 0, 36.16, 0.95, 1.75, 0.1, CHARCOAL);
  box(18, 2.6, 36.52, 0.5, 0.6, 0.08, CHARCOAL);
  box(18, 4.4, 36.87, 0.45, 0.55, 0.08, CHARCOAL);

  // The bridge: plank segments on posts, railed on both sides with a gap
  // in the west rail halfway across.
  for (let i = 0; i < 7; i++) box(18, 0.15, 27 + i * 1.15, 2.4, 0.09, 1.25, OAK);
  for (const z of [28.5, 31.5]) for (const x of [17.05, 18.95]) box(x, -2.2, z, 0.18, 2.35, 0.18, WALNUT);
  for (const z of [27.3, 29.7, 32.1, 33.9]) for (const x of [16.95, 19.05]) box(x, 0.24, z, 0.08, 0.85, 0.08, WALNUT);
  box(19.05, 1.02, 30.6, 0.07, 0.07, 7.3, WALNUT);
  box(16.95, 1.02, 28.5, 0.07, 0.07, 3.1, WALNUT);
  box(16.95, 1.02, 32.9, 0.07, 0.07, 2.7, WALNUT);

  for (const m of B.build(materials)) root.add(m);

  const bounds = new THREE.Box3(
    new THREE.Vector3(ISLET.x0, -1, BRIDGE.z0), new THREE.Vector3(ISLET.x1, 9.05, ISLET.z1));
  const hit = new THREE.Vector3();
  const inside = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
  return {
    group: root,
    foot: { x: 18, z: 27 },
    levels(x, z, out) {
      if (inside(ISLET, x, z)) out.push({ y: ISLET.y, site: 'islet' });
      if (inside(BRIDGE, x, z)) out.push({ y: BRIDGE.y, site: 'islet' });
    },
    obstructed(x, z, feet) {
      return SOLIDS.some(b => inside(b, x, z) && b.y0 < feet + BODY && b.y1 > feet + 0.05);
    },
    collides(x, feet, z) {
      return SOLIDS.some(b => x + RADIUS > b.x0 && x - RADIUS < b.x1 && z + RADIUS > b.z0 && z - RADIUS < b.z1
        && feet + BODY > b.y0 && feet < b.y1);
    },
    pick(ray) { return ray.intersectBox(bounds, hit) ? { t: hit.distanceTo(ray.origin), point: hit.clone(), site: 'islet' } : null; },
    spots: () => [{ x: 18, z: 40.5 }],
  };
}
