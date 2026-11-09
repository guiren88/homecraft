// Pure logic for the farm animals in world/critters.js: the species table,
// wander AI, movement blocking and the ride controller. No THREE and no DOM
// here, so tools/critters.test.mjs can exercise everything in node; the
// renderer in critters.js only draws what this module decides.
//
// Coordinates follow the site convention: x east, z south, y up. An animal's
// heading h faces (sin h, cos h), the same convention as the player
// (engine/world/player.js turnTowards uses heading = atan2(dx, dz)).

import { ISLAND, POOL, HOUSE } from './layout.js';

export const MOUNT_RANGE = 2; // metres from the player to offer a mount
export const RIDE_TURN_RATE = 2.4; // rad/s, steering while ridden
const WANDER_TURN_RATE = 2.2; // rad/s while wandering
const ARRIVE_DIST = 0.25;

// ---------- Species ----------
// Part template: { dx, dy, dz, sx, sy, sz, color } in animal space, where
// +z is forward, dy is the part centre's height, and sizes are in metres.
// Optional fields: pitch (radians, nose-down positive, around the part's own
// centre), role ('head' parts dip when a chicken pecks), main (recoloured by
// an individual's alt colour, e.g. the grey rabbit).
export const SPECIES = {
  pig: {
    name: '小猪', emoji: '🐷', seat: 0.95, walkSpeed: 0.7, rideSpeed: 2.4,
    parts: [
      { dx: 0, dy: 0.62, dz: 0, sx: 0.62, sy: 0.55, sz: 0.95, color: 0xf2a7bb, main: true },
      { dx: 0, dy: 0.72, dz: 0.58, sx: 0.42, sy: 0.4, sz: 0.36, color: 0xf2a7bb, main: true, role: 'head' },
      { dx: 0, dy: 0.66, dz: 0.8, sx: 0.22, sy: 0.16, sz: 0.1, color: 0xe58aa5, role: 'head' },
      { dx: -0.15, dy: 0.99, dz: 0.5, sx: 0.12, sy: 0.16, sz: 0.05, color: 0xe58aa5 },
      { dx: 0.15, dy: 0.99, dz: 0.5, sx: 0.12, sy: 0.16, sz: 0.05, color: 0xe58aa5 },
      { dx: -0.2, dy: 0.17, dz: 0.32, sx: 0.13, sy: 0.35, sz: 0.13, color: 0xe58aa5 },
      { dx: 0.2, dy: 0.17, dz: 0.32, sx: 0.13, sy: 0.35, sz: 0.13, color: 0xe58aa5 },
      { dx: -0.2, dy: 0.17, dz: -0.32, sx: 0.13, sy: 0.35, sz: 0.13, color: 0xe58aa5 },
      { dx: 0.2, dy: 0.17, dz: -0.32, sx: 0.13, sy: 0.35, sz: 0.13, color: 0xe58aa5 },
      { dx: 0, dy: 0.8, dz: -0.52, sx: 0.07, sy: 0.22, sz: 0.07, color: 0xe58aa5, pitch: -0.5 },
    ],
  },
  sheep: {
    name: '小羊', emoji: '🐑', seat: 1.0, walkSpeed: 0.7, rideSpeed: 2.4,
    parts: [
      { dx: 0, dy: 0.68, dz: 0, sx: 0.7, sy: 0.6, sz: 1.0, color: 0xf0ead8, main: true },
      { dx: 0, dy: 1.03, dz: 0, sx: 0.62, sy: 0.18, sz: 0.9, color: 0xfaf6ec, main: true },
      { dx: 0, dy: 0.72, dz: 0.62, sx: 0.34, sy: 0.36, sz: 0.34, color: 0x4a4038, role: 'head' },
      { dx: -0.23, dy: 0.84, dz: 0.58, sx: 0.15, sy: 0.06, sz: 0.1, color: 0x4a4038 },
      { dx: 0.23, dy: 0.84, dz: 0.58, sx: 0.15, sy: 0.06, sz: 0.1, color: 0x4a4038 },
      { dx: -0.24, dy: 0.19, dz: 0.36, sx: 0.12, sy: 0.38, sz: 0.12, color: 0x4a4038 },
      { dx: 0.24, dy: 0.19, dz: 0.36, sx: 0.12, sy: 0.38, sz: 0.12, color: 0x4a4038 },
      { dx: -0.24, dy: 0.19, dz: -0.36, sx: 0.12, sy: 0.38, sz: 0.12, color: 0x4a4038 },
      { dx: 0.24, dy: 0.19, dz: -0.36, sx: 0.12, sy: 0.38, sz: 0.12, color: 0x4a4038 },
    ],
  },
  rabbit: {
    name: '兔子', emoji: '🐰', seat: 0.55, walkSpeed: 1.2, rideSpeed: 2.6, hops: true,
    alts: [null, 0xb9bdc4], // second rabbit is grey
    parts: [
      { dx: 0, dy: 0.34, dz: 0, sx: 0.4, sy: 0.36, sz: 0.55, color: 0xf5f5f5, main: true },
      { dx: 0, dy: 0.52, dz: 0.32, sx: 0.3, sy: 0.28, sz: 0.28, color: 0xf5f5f5, main: true, role: 'head' },
      { dx: -0.08, dy: 0.87, dz: 0.3, sx: 0.07, sy: 0.42, sz: 0.04, color: 0xf5f5f5, main: true, pitch: 0.15 },
      { dx: 0.08, dy: 0.87, dz: 0.3, sx: 0.07, sy: 0.42, sz: 0.04, color: 0xf5f5f5, main: true, pitch: 0.15 },
      { dx: 0, dy: 0.42, dz: -0.32, sx: 0.15, sy: 0.15, sz: 0.15, color: 0xffffff },
      { dx: -0.11, dy: 0.07, dz: 0.22, sx: 0.08, sy: 0.14, sz: 0.08, color: 0xf5f5f5, main: true },
      { dx: 0.11, dy: 0.07, dz: 0.22, sx: 0.08, sy: 0.14, sz: 0.08, color: 0xf5f5f5, main: true },
      { dx: -0.16, dy: 0.05, dz: -0.14, sx: 0.1, sy: 0.1, sz: 0.26, color: 0xf5f5f5, main: true },
      { dx: 0.16, dy: 0.05, dz: -0.14, sx: 0.1, sy: 0.1, sz: 0.26, color: 0xf5f5f5, main: true },
    ],
  },
  chicken: {
    name: '小鸡', emoji: '🐔', seat: 0.5, walkSpeed: 0.5, rideSpeed: 1.8, pecks: true,
    parts: [
      { dx: 0, dy: 0.36, dz: 0, sx: 0.38, sy: 0.34, sz: 0.5, color: 0xf7f4ec, main: true },
      { dx: 0, dy: 0.62, dz: 0.3, sx: 0.24, sy: 0.24, sz: 0.24, color: 0xf7f4ec, main: true, role: 'head' },
      { dx: 0, dy: 0.58, dz: 0.47, sx: 0.1, sy: 0.08, sz: 0.14, color: 0xf59e0b, role: 'head' },
      { dx: 0, dy: 0.79, dz: 0.28, sx: 0.06, sy: 0.1, sz: 0.16, color: 0xd23a2e, role: 'head' },
      { dx: 0, dy: 0.52, dz: -0.29, sx: 0.26, sy: 0.22, sz: 0.08, color: 0xf7f4ec, main: true, pitch: -0.6 },
      { dx: -0.09, dy: 0.07, dz: 0.02, sx: 0.05, sy: 0.14, sz: 0.05, color: 0xf59e0b },
      { dx: 0.09, dy: 0.07, dz: 0.02, sx: 0.05, sy: 0.14, sz: 0.05, color: 0xf59e0b },
    ],
  },
  duck: {
    name: '鸭子', emoji: '🦆', seat: 0.45, walkSpeed: 0.5, rideSpeed: 1.8,
    parts: [
      { dx: 0, dy: 0.3, dz: 0, sx: 0.4, sy: 0.3, sz: 0.58, color: 0xf6cf4b, main: true },
      { dx: 0, dy: 0.56, dz: 0.32, sx: 0.26, sy: 0.26, sz: 0.26, color: 0xf6cf4b, main: true, role: 'head' },
      { dx: 0, dy: 0.52, dz: 0.51, sx: 0.16, sy: 0.07, sz: 0.16, color: 0xf59e0b, role: 'head' },
      { dx: 0, dy: 0.42, dz: -0.33, sx: 0.24, sy: 0.12, sz: 0.12, color: 0xf6cf4b, main: true, pitch: -0.5 },
      { dx: -0.1, dy: 0.04, dz: 0.05, sx: 0.12, sy: 0.07, sz: 0.16, color: 0xf59e0b },
      { dx: 0.1, dy: 0.04, dz: 0.05, sx: 0.12, sy: 0.07, sz: 0.16, color: 0xf59e0b },
    ],
  },
};

// One entry per individual. maxZ keeps the ducks on the deck strip north of
// the pool (POOL.z0 is 24) instead of in the water.
export const ZONES = [
  { species: 'pig', x: -6, z: 20, r: 6 },
  { species: 'pig', x: 10, z: 20, r: 5 },
  { species: 'sheep', x: -29, z: 4, r: 5 },
  { species: 'sheep', x: 18, z: 20, r: 4 },
  { species: 'rabbit', x: 31, z: 2, r: 4.5 },
  { species: 'rabbit', x: -29, z: -6, r: 4 },
  { species: 'rabbit', x: 0, z: -20, r: 6 },
  { species: 'chicken', x: 30, z: 10, r: 4 },
  { species: 'chicken', x: -14, z: -20, r: 5 },
  { species: 'chicken', x: -16, z: 20, r: 4 },
  { species: 'duck', x: -4, z: 22.2, r: 2.2, maxZ: 23.2 },
  { species: 'duck', x: -10, z: 22.2, r: 2, maxZ: 23.2 },
];

// ---------- Blocking ----------
// Rects animals may not enter: the pool water and the house shell.
export const BLOCKERS = [
  { ...POOL, pad: 0.3 },
  { ...HOUSE, pad: 0.2 },
];

export const inRect = (x, z, r, pad = 0) =>
  x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;

export const isBlocked = (x, z, blockers = BLOCKERS) =>
  blockers.some(r => inRect(x, z, r, r.pad || 0));

const clampToIsland = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Axis-separated move: try the full step, then x only, then z only, so an
// animal slides along a fence line instead of sticking to it. The result is
// always clamped inside the island with `margin` to spare.
export function blockedMove(x, z, dx, dz, { blockers = BLOCKERS, island = ISLAND, margin = 1.5 } = {}) {
  const cx = v => clampToIsland(v, island.x0 + margin, island.x1 - margin);
  const cz = v => clampToIsland(v, island.z0 + margin, island.z1 - margin);
  const tries = [[x + dx, z + dz], [x + dx, z], [x, z + dz]];
  for (const [nx, nz] of tries) {
    const px = cx(nx), pz = cz(nz);
    if (!isBlocked(px, pz, blockers)) return { x: px, z: pz, moved: px !== x || pz !== z };
  }
  return { x, z, moved: false };
}

// ---------- Headings ----------
export const wrapAngle = a => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
};

// Turn heading h toward target by at most maxStep radians.
export function turnToward(h, target, maxStep) {
  const diff = wrapAngle(target - h);
  return h + Math.max(-maxStep, Math.min(maxStep, diff));
}

export const headingTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

// The animal heading whose forward (sin h, cos h) matches the camera's
// ground-forward for a rig yaw. Verified against the engine: input.js maps
// W/ArrowUp to input.z = -1, and player.js steer() turns that into the world
// direction (-sin yaw, -cos yaw), so the matching heading is atan2 of that.
export const cameraHeading = yaw => Math.atan2(-Math.sin(yaw), -Math.cos(yaw));

// ---------- Animals ----------
export function makeAnimals(rng = Math.random) {
  const counts = {};
  return ZONES.map(zone => {
    const def = SPECIES[zone.species];
    const index = counts[zone.species] = (counts[zone.species] || 0) + 1;
    const a = {
      species: zone.species, def, zone, index,
      alt: def.alts ? def.alts[(index - 1) % def.alts.length] : null,
      x: zone.x, z: zone.z, heading: rng() * Math.PI * 2,
      state: 'idle', t: 0.5 + rng() * 2.5, tx: zone.x, tz: zone.z,
      lift: 0, peck: 0, peckT: 1 + rng() * 1.5, moving: false, phase: rng() * Math.PI * 2,
    };
    // Spawn a little off the anchor, but never inside a blocked rect.
    for (let i = 0; i < 8; i++) {
      const px = zone.x + (rng() * 2 - 1) * Math.min(1.5, zone.r * 0.4);
      const pz = Math.min(zone.z + (rng() * 2 - 1) * Math.min(1.5, zone.r * 0.4), zone.maxZ ?? Infinity);
      if (!isBlocked(px, pz)) { a.x = px; a.z = pz; break; }
    }
    return a;
  });
}

// A random point in the animal's home disc (or maxZ-clamped strip) that is
// not inside a blocked rect; null when every try failed.
export function pickWanderTarget(a, rng = Math.random) {
  const { zone } = a;
  for (let i = 0; i < 8; i++) {
    const ang = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * zone.r;
    const tx = zone.x + Math.cos(ang) * rad;
    const tz = Math.min(zone.z + Math.sin(ang) * rad, zone.maxZ ?? Infinity);
    if (!isBlocked(tx, tz)) return { x: tx, z: tz };
  }
  return null;
}

// Advance one wandering animal. `riding` animals are driven by RideController
// instead and are skipped here.
export function stepAnimal(a, dt, rng = Math.random) {
  if (a.state === 'ridden') { a.moving = false; return; }
  a.moving = false;

  if (a.state === 'idle') {
    a.t -= dt;
    // Chickens peck at the ground while idling: peckT counts down to the
    // next peck, and its last 0.45 s are the peck itself. peck is a 0..1
    // curve the renderer uses to dip the head parts.
    if (a.def.pecks) {
      a.peckT -= dt;
      if (a.peckT <= 0) a.peckT = 1.2 + rng() * 1.3;
      a.peck = a.peckT <= 0.45 ? Math.sin((0.45 - a.peckT) / 0.45 * Math.PI) : 0;
    } else a.peck = 0;
    if (a.t <= 0) {
      const target = pickWanderTarget(a, rng);
      if (target) { a.tx = target.x; a.tz = target.z; a.state = 'walk'; }
      else a.t = 1 + rng() * 2;
    }
    return;
  }

  // state === 'walk'
  const dx = a.tx - a.x, dz = a.tz - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVE_DIST) { a.state = 'idle'; a.t = 1 + rng() * 3; a.lift = 0; return; }
  a.heading = turnToward(a.heading, headingTo(a.x, a.z, a.tx, a.tz), WANDER_TURN_RATE * dt);

  let speed = a.def.walkSpeed;
  if (a.def.hops) {
    // Rabbits move in bursts: airborne for 0.35 s at hop speed, then a
    // 0.35 s pause on the ground. lift is the renderer's hop height.
    a.phase += dt;
    const cycle = a.phase % 0.7;
    if (cycle < 0.35) { speed = 2.4; a.lift = Math.sin(cycle / 0.35 * Math.PI) * 0.28; }
    else { speed = 0; a.lift = 0; }
  }
  if (speed > 0) {
    const step = Math.min(speed * dt, dist);
    const res = blockedMove(a.x, a.z, Math.sin(a.heading) * step, Math.cos(a.heading) * step, { margin: 1.5 });
    a.x = res.x; a.z = res.z; a.moving = res.moved;
    if (!res.moved) { a.state = 'idle'; a.t = 0.8 + rng() * 1.5; a.lift = 0; }
  }
}

// ---------- Riding ----------
export class RideController {
  // player: the engine player (pos, teleport, setSeatY). getYaw: () => the
  // camera rig's yaw. animals: the shared animal array from makeAnimals().
  constructor({ player, getYaw, animals, rng = Math.random }) {
    this.player = player;
    this.getYaw = getYaw;
    this.animals = animals;
    this.rng = rng;
    this.riding = null;
    this.goHeld = false;
  }

  nearest() {
    const p = this.player?.pos;
    if (!p) return null;
    let best = null, bestD = MOUNT_RANGE;
    for (const a of this.animals) {
      const d = Math.hypot(a.x - p.x, a.z - p.z);
      if (d <= bestD) { best = a; bestD = d; }
    }
    return best;
  }

  mount(a = this.nearest()) {
    if (!a || this.riding) return false;
    this.riding = a;
    a.state = 'ridden'; a.lift = 0; a.peck = 0; a.moving = false;
    this.player.setSeatY?.(a.def.seat);
    return true;
  }

  dismount() {
    const a = this.riding;
    if (!a) return false;
    this.riding = null;
    this.goHeld = false;
    this.player.setSeatY?.(0);
    // Step off 1.3 m to the animal's left, else its right, else stay put.
    const sx = Math.cos(a.heading), sz = -Math.sin(a.heading);
    const opts = { look: [a.x + Math.sin(a.heading), a.z + Math.cos(a.heading)] };
    if (!this.player.teleport(a.x + sx * 1.3, a.z + sz * 1.3, opts)) {
      this.player.teleport(a.x - sx * 1.3, a.z - sz * 1.3, opts);
    }
    a.state = 'idle'; a.t = 2; // a short pause before it wanders off again
    return true;
  }

  setGo(held) { this.goHeld = !!held; }

  update(dt) {
    const a = this.riding;
    if (!a) return;
    a.heading = turnToward(a.heading, cameraHeading(this.getYaw()), RIDE_TURN_RATE * dt);
    a.moving = false;
    if (this.goHeld) {
      let speed = a.def.rideSpeed;
      if (a.def.hops) {
        a.phase += dt;
        const cycle = a.phase % 0.6;
        if (cycle < 0.3) { speed = 4.4; a.lift = Math.sin(cycle / 0.3 * Math.PI) * 0.3; }
        else { speed = 0; a.lift = 0; }
      }
      if (speed > 0) {
        const res = blockedMove(a.x, a.z,
          Math.sin(a.heading) * speed * dt, Math.cos(a.heading) * speed * dt, { margin: 1 });
        a.x = res.x; a.z = res.z; a.moving = res.moved;
      }
    } else a.lift = 0;
    // Keep the player seated on the animal. teleport() cancels whatever the
    // engine's own WASD movement did this frame and snaps to standable
    // ground; if the spot is unstandable it returns false and we skip.
    this.player.teleport(a.x, a.z, {
      look: [a.x + Math.sin(a.heading), a.z + Math.cos(a.heading)],
    });
  }
}
