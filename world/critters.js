// Farm animals: five voxel species (pig, sheep, rabbit, chicken, duck)
// roaming the lawns, all rideable. The simulation lives in
// world/critter-logic.js; this module only renders it (one InstancedMesh
// per species, following world/vertec.js) and wires the kid-facing ride UI.
//
// Riding uses the user-approved engine fork patch in engine/world/player.js:
// player.setSeatY() lifts the avatar onto the animal's back (render only).
// The mount follows the player: while ridden, the player moves with the
// engine's completely normal controls and the animal is glued under them
// (see RideController in critter-logic.js), so riding feels exactly like
// walking — WASD / touch to move, Shift to run, Space to jump. Entering
// water or flying drops the rider automatically.

import * as THREE from 'three';
import { floorAt } from './layout.js';
import { SPECIES, makeAnimals, stepAnimal, RideController } from './critter-logic.js';

const CSS = `
#critter-bar{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);
  z-index:60;display:flex;gap:10px;align-items:center;
  font:17px/1.4 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
#critter-bar button{font:inherit;font-weight:700;cursor:pointer;border:0;border-radius:999px;
  padding:14px 24px;background:#7cb342;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.35)}
#critter-bar [hidden]{display:none!important}
`;

export function createCritters(app) {
  const { stage, player } = app;
  const rng = Math.random;
  const animals = makeAnimals(rng);
  const ride = new RideController({ player, animals });

  // ---- Rendering: one InstancedMesh per species, unit box scaled per part.
  const groups = [];
  {
    const color = new THREE.Color();
    for (const [key, def] of Object.entries(SPECIES)) {
      const mine = animals.filter(a => a.species === key);
      if (!mine.length) continue;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), mine.length * def.parts.length);
      mesh.frustumCulled = false; // instances span the whole island
      const list = [];
      let i = 0;
      for (const a of mine) {
        for (const part of def.parts) {
          color.setHex(part.main && a.alt != null ? a.alt : part.color);
          mesh.setColorAt(i, color);
          list.push({ a, part, i });
          i++;
        }
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      stage.scene.add(mesh);
      groups.push({ def, mesh, list });
    }
  }

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qp = new THREE.Quaternion();
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0);

  function draw() {
    for (const { mesh, list } of groups) {
      for (const { a, part, i } of list) {
        const h = a.heading, cos = Math.cos(h), sin = Math.sin(h);
        let dy = part.dy, dz = part.dz;
        let pitch = part.pitch || 0;
        if (part.role === 'head' && a.peck) {
          dy -= a.peck * 0.15; dz += a.peck * 0.05; pitch += a.peck * 0.7;
        }
        const bob = a.moving && !a.def.hops ? Math.sin(a.bobT || 0) * (a.bobAmp ?? 0.03) : 0;
        pitch += a.tilt || 0; // ridden mounts lean gently into their motion
        // Rotate the part's local offset by the heading (forward = +z maps
        // to (sin h, cos h)), then place it over the animal's ground spot.
        pos.set(
          a.x + part.dx * cos + dz * sin,
          (a.groundY || 0) + a.lift + bob + dy,
          a.z - part.dx * sin + dz * cos,
        );
        q.setFromAxisAngle(AXIS_Y, h);
        if (pitch) { qp.setFromAxisAngle(AXIS_X, pitch); q.multiply(qp); }
        scl.set(part.sx, part.sy, part.sz);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- Ride UI: one contextual button row, bottom centre.
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.id = 'critter-bar';
  bar.innerHTML = `
    <button type="button" class="cb-mount" hidden></button>
    <span class="cb-ridebox" hidden>
      <button type="button" class="cb-off">⬇️ 下来</button>
    </span>`;
  document.body.appendChild(bar);
  const mountBtn = bar.querySelector('.cb-mount');
  const rideBox = bar.querySelector('.cb-ridebox');
  const offBtn = bar.querySelector('.cb-off');

  mountBtn.addEventListener('click', () => ride.mount());
  offBtn.addEventListener('click', () => ride.dismount());

  // While the quiz modal is up it owns the screen (and the keys); riding
  // input stays out of its way. Movement keys need no handling here at all:
  // the engine moves the player and the mount simply follows.
  const quizOpen = () => {
    const ov = document.querySelector('#quiz-overlay');
    return !!ov && !ov.hidden;
  };
  addEventListener('keydown', e => {
    if (quizOpen()) return;
    if (e.code === 'KeyF') { if (ride.riding) ride.dismount(); else ride.mount(); }
  });

  let uiKey = '';
  function refreshUI() {
    const near = ride.riding ? null : ride.nearest();
    const key = ride.riding ? 'ride' : near ? `mount:${near.species}:${near.index}` : 'none';
    if (key === uiKey) return;
    uiKey = key;
    mountBtn.hidden = !near;
    rideBox.hidden = !ride.riding;
    if (near) mountBtn.textContent = `${near.def.emoji} 骑上${near.def.name}`;
  }

  draw();

  return {
    animals,
    ride,
    update(dt) {
      ride.update(dt); // first: it sets the ridden animal's gait state
      for (const a of animals) {
        stepAnimal(a, dt, rng);
        if (a.moving && !a.def.hops) {
          // Wandering animals bob at a fixed rate; a ridden mount's bob
          // tracks how fast the player is actually moving, and swells a
          // little with speed.
          const ridden = a.state === 'ridden';
          a.bobT = (a.bobT || 0) + dt * (ridden ? 3 + (a.speedNow || 0) * 2.5 : 7);
          a.bobAmp = ridden ? 0.02 + Math.min(0.03, (a.speedNow || 0) * 0.008) : 0.03;
        }
      }
      for (const a of animals) a.groundY = floorAt(a.x, a.z);
      draw();
      refreshUI();
    },
  };
}
