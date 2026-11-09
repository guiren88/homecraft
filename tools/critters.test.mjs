// Logic tests for world/critter-logic.js (roaming farm animals + riding).
// Pure node: the module imports only world/layout.js data — no THREE, no DOM.
// Run: node tools/critters.test.mjs
import assert from 'node:assert';
import {
  SPECIES, ZONES, MOUNT_RANGE, RIDE_TURN_RATE,
  makeAnimals, pickWanderTarget, stepAnimal, blockedMove, isBlocked,
  turnToward, headingTo, cameraHeading, wrapAngle, RideController,
} from '../world/critter-logic.js';
import { POOL, ISLAND } from '../world/layout.js';

let n = 0;
const ok = (cond, name) => { assert.ok(cond, name); n++; console.log(`ok ${n} - ${name}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

let seed = 20261109;
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

// ---------- Species table and zones ----------
{
  ok(Object.keys(SPECIES).sort().join(',') === 'chicken,duck,pig,rabbit,sheep', 'five species defined');
  ok(SPECIES.pig.seat === 0.95 && SPECIES.sheep.seat === 1.0 && SPECIES.rabbit.seat === 0.55
    && SPECIES.chicken.seat === 0.5 && SPECIES.duck.seat === 0.45, 'seat heights match the design');
  ok(Object.values(SPECIES).every(d => d.parts.length >= 6
    && d.parts.every(p => [p.dx, p.dy, p.dz, p.sx, p.sy, p.sz].every(Number.isFinite) && Number.isFinite(p.color))),
    'every species has a complete numeric part template');
  ok(Object.values(SPECIES).every(d => d.parts.some(p => p.role === 'head')), 'every species has head parts');
  ok(ZONES.length === 12, 'twelve zones = twelve individuals');
  const counts = {};
  for (const z of ZONES) counts[z.species] = (counts[z.species] || 0) + 1;
  ok(counts.pig === 2 && counts.sheep === 2 && counts.rabbit === 3 && counts.chicken === 3 && counts.duck === 2,
    'individual counts per species are 2/2/3/3/2');
  ok(MOUNT_RANGE === 2 && RIDE_TURN_RATE === 2.4, 'mount range 2 m, ride turn rate 2.4 rad/s');
}

// ---------- Spawning ----------
{
  const animals = makeAnimals(rng);
  ok(animals.length === 12, 'makeAnimals returns twelve animals');
  ok(animals.every(a => Math.hypot(a.x - a.zone.x, a.z - a.zone.z) <= a.zone.r + 1e-9),
    'every animal spawns inside its home disc');
  ok(animals.every(a => !isBlocked(a.x, a.z)), 'no animal spawns inside the pool or the house');
  ok(animals.filter(a => a.species === 'duck').every(a => a.z < POOL.z0), 'ducks spawn north of the pool');
  const rabbits = animals.filter(a => a.species === 'rabbit');
  ok(rabbits.some(a => a.alt != null) && rabbits.some(a => a.alt == null), 'rabbits have a grey variant');
}

// ---------- Wander targets ----------
{
  const animals = makeAnimals(rng);
  let allClear = true, allInZone = true, ducksDry = true;
  for (const a of animals) {
    for (let i = 0; i < 200; i++) {
      const t = pickWanderTarget(a, rng);
      if (!t) continue;
      if (isBlocked(t.x, t.z)) allClear = false;
      if (Math.hypot(t.x - a.zone.x, t.z - a.zone.z) > a.zone.r + 1e-9) allInZone = false;
      if (a.species === 'duck' && t.z > 23.2) ducksDry = false;
    }
  }
  ok(allClear, 'wander targets never land inside the pool or the house');
  ok(allInZone, 'wander targets stay inside the home disc');
  ok(ducksDry, 'duck targets keep z <= 23.2, out of the water');
}

// ---------- blockedMove ----------
{
  // Straight into the pool: the step is refused, position unchanged.
  let r = blockedMove(-6, 22.5, 0, 2, {});
  ok(r.x === -6 && r.z === 22.5 && !r.moved, 'move into the pool is blocked');
  // Diagonal at the pool edge: slides along x instead.
  r = blockedMove(-6, 22.5, 1.5, 2, {});
  ok(near(r.x, -4.5) && near(r.z, 22.5) && r.moved, 'diagonal move slides along the pool edge (x only)');
  // At the house wall: x blocked, z only succeeds.
  r = blockedMove(-21, 0, 2, 1.5, {});
  ok(near(r.x, -21) && near(r.z, 1.5) && r.moved, 'move at the house wall falls back to z only');
  // Island clamp: cannot walk off the west edge.
  r = blockedMove(-35.5, 0, -5, 0, {});
  ok(near(r.x, ISLAND.x0 + 1.5) && r.moved, 'moves clamp to the island margin');
  // Ridden margin (1 m) clamps less tightly than the wander margin (1.5 m).
  r = blockedMove(-35.5, 0, -5, 0, { margin: 1 });
  ok(near(r.x, ISLAND.x0 + 1), 'ride margin clamps at 1 m');
}

// ---------- Headings ----------
{
  ok(near(wrapAngle(3 * Math.PI), Math.PI) && near(wrapAngle(-Math.PI / 2), -Math.PI / 2), 'wrapAngle normalises to (-PI, PI]');
  ok(near(turnToward(0, Math.PI, 0.1), 0.1), 'turnToward caps the step');
  ok(near(turnToward(0, -Math.PI / 2, 5), -Math.PI / 2), 'turnToward reaches a near target');
  ok(near(headingTo(0, 0, 0, 5), 0) && near(headingTo(0, 0, 5, 0), Math.PI / 2), 'headingTo matches atan2(dx, dz)');
  // Camera forward for rig yaw 0 is (0, -1) (north): verified against
  // engine input.js (W -> input.z = -1) and player.js steer().
  const h0 = cameraHeading(0);
  ok(near(Math.sin(h0), 0) && near(Math.cos(h0), -1), 'cameraHeading(0) faces (0, -1)');
  const h1 = cameraHeading(Math.PI / 2);
  ok(near(Math.sin(h1), -1) && near(Math.cos(h1), 0), 'cameraHeading(PI/2) faces (-1, 0)');
  const h2 = cameraHeading(Math.PI);
  ok(near(Math.sin(h2), 0) && near(Math.cos(h2), 1), 'cameraHeading(PI) faces (0, 1)');
}

// ---------- Wander state machine ----------
{
  const [pig] = makeAnimals(rng).filter(a => a.species === 'pig');
  pig.state = 'idle'; pig.t = 0;
  stepAnimal(pig, 0.016, rng);
  ok(pig.state === 'walk', 'idle animal picks a target and walks');
  ok(Math.hypot(pig.tx - pig.zone.x, pig.tz - pig.zone.z) <= pig.zone.r + 1e-9 && !isBlocked(pig.tx, pig.tz),
    'the picked target is in-zone and unblocked');

  // Walking straight at a target reaches it and returns to idle.
  pig.x = 10; pig.z = 18; pig.tx = 10; pig.tz = 22; pig.heading = 0; pig.state = 'walk';
  let steps = 0;
  while (pig.state === 'walk' && steps < 2000) { stepAnimal(pig, 0.05, rng); steps++; }
  ok(pig.state === 'idle' && Math.hypot(pig.tx - pig.x, pig.tz - pig.z) < 0.3, 'walking animal arrives and idles');

  // Rabbits hop: lift rises above 0 mid-burst and is 0 while grounded.
  const [rabbit] = makeAnimals(rng).filter(a => a.species === 'rabbit');
  rabbit.x = 31; rabbit.z = 2; rabbit.tx = 31; rabbit.tz = 6; rabbit.heading = 0;
  rabbit.state = 'walk'; rabbit.phase = 0;
  let sawLift = false, sawGround = false;
  for (let i = 0; i < 40; i++) {
    stepAnimal(rabbit, 0.05, rng);
    if (rabbit.lift > 0.15) sawLift = true;
    if (rabbit.lift === 0) sawGround = true;
  }
  ok(sawLift && sawGround, 'rabbit lift oscillates between hop height and ground');

  // Chickens peck while idling.
  const [chicken] = makeAnimals(rng).filter(a => a.species === 'chicken');
  chicken.state = 'idle'; chicken.t = 100; chicken.peckT = 0.4;
  let sawPeck = false;
  for (let i = 0; i < 60; i++) { stepAnimal(chicken, 0.05, rng); if (chicken.peck > 0.5) sawPeck = true; }
  ok(sawPeck, 'chicken peck curve rises above 0.5 while idling');
  ok(chicken.state === 'idle', 'chicken with a long idle timer stays idle');
}

// ---------- Riding ----------
function fakePlayer(x, z, standable = () => true) {
  return {
    pos: { x, z }, seat: null, calls: [],
    setSeatY(v) { this.seat = v; },
    teleport(tx, tz, opts) {
      this.calls.push([tx, tz, opts]);
      if (!standable(tx, tz)) return false;
      this.pos.x = tx; this.pos.z = tz;
      return true;
    },
  };
}
{
  const animals = makeAnimals(rng);
  const pig = animals.find(a => a.species === 'pig');
  const player = fakePlayer(pig.x + 1, pig.z);
  let yaw = Math.PI; // camera forward = (0, +1), i.e. target heading 0
  const rc = new RideController({ player, getYaw: () => yaw, animals, rng });

  ok(rc.nearest() === pig, 'nearest() finds the pig within 2 m');
  player.pos.x = pig.x + 30;
  ok(rc.nearest() === null && rc.mount() === false, 'no mount when nothing is near');
  player.pos.x = pig.x + 1;

  ok(rc.mount() === true && rc.riding === pig, 'mount() takes the nearest animal');
  ok(player.seat === 0.95, 'mount sets seatY to the pig seat height');
  ok(pig.state === 'ridden', 'mounted animal is in the ridden state');
  ok(rc.mount() === false, 'mounting twice is refused');

  // The ridden animal ignores the wander AI.
  const px = pig.x, pz = pig.z;
  stepAnimal(pig, 1, rng);
  ok(pig.x === px && pig.z === pz, 'stepAnimal leaves a ridden animal alone');

  // Steering: heading turns toward the camera, throttle moves it forward.
  pig.heading = 1.0;
  rc.setGo(true);
  rc.update(0.5);
  ok(near(pig.heading, 0, 1e-9), 'ridden animal turns to the camera heading at 2.4 rad/s');
  ok(pig.z > pz && near(pig.x, px, 1e-6), 'held throttle walks the animal along its heading');
  const last = player.calls[player.calls.length - 1];
  ok(near(last[0], pig.x) && near(last[1], pig.z), 'player is teleported onto the animal');
  ok(near(last[2].look[0], pig.x + Math.sin(pig.heading)) && near(last[2].look[1], pig.z + Math.cos(pig.heading)),
    'teleport look point is ahead of the animal');
  ok(near(player.pos.x, pig.x) && near(player.pos.z, pig.z), 'player position tracks the animal');

  // No throttle: the animal stands still but the player stays seated.
  const callsBefore = player.calls.length;
  const gx = pig.x, gz = pig.z;
  rc.setGo(false);
  rc.update(0.5);
  ok(pig.x === gx && pig.z === gz && player.calls.length > callsBefore,
    'without throttle the animal stands and the player stays on');

  // Turn the camera 90 degrees: forward becomes (-1, 0).
  yaw = Math.PI / 2;
  rc.setGo(true);
  rc.update(2);
  ok(pig.x < gx - 0.5, 'animal follows the turned camera');

  // Dismount: seat cleared, player stepped to the side, animal pauses.
  const ax = pig.x, az = pig.z;
  ok(rc.dismount() === true && rc.riding === null, 'dismount releases the animal');
  ok(player.seat === 0, 'dismount zeroes seatY');
  ok(near(Math.hypot(player.pos.x - ax, player.pos.z - az), 1.3, 1e-9), 'player steps off 1.3 m to the side');
  ok(pig.state === 'idle' && pig.t === 2, 'animal pauses 2 s after dismount');

  // Dismount with no standable side spot: no crash, player stays.
  const player2 = fakePlayer(pig.x, pig.z, () => false);
  const rc2 = new RideController({ player: player2, getYaw: () => 0, animals, rng });
  player2.pos.x = pig.x + 0.5;
  ok(rc2.mount() === true, 'second controller mounts the same pig');
  ok(rc2.dismount() === true && player2.seat === 0, 'unstandable dismount still clears the seat');
  ok(player2.pos.x === pig.x + 0.5 && player2.pos.z === pig.z, 'player stays put when no side spot is standable');
}

console.log(`\nALL ${n} ASSERTIONS PASSED`);
