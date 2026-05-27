// Windsock wind indicator.
//
// The sock is split into two segments joined at a bend point:
//
//   mount ──[upper segment, baseAngle]──► bend point ──[lower segment, lowerAngle]──► tail
//
// Both angles are expressed as a drop below the horizontal plane (0 = horizontal, π/2 = hanging).
// lowerDrop = BEND_RATIO × drop, capped at π/2, so the tail always droops further down than
// the base.  As wind increases, drop → 0 and the sock stretches out horizontally — matching
// how a real windsock goes taut in a strong wind.
//
// Each segment is an independent THREE.Group so updating position + quaternion is
// straightforward: no nested-quaternion math needed.

import * as THREE from 'three';
import type { ModelState } from '../../engine/types';
import type { ScenePlugin } from '../scenePlugin';

export interface VisWind { fx: number; fz: number; }

const POLE_HEIGHT   = 4.0;   // m
const SOCK_LENGTH   = 2.5;   // m total
const MOUTH_RADIUS  = 0.35;  // m (large, open end)
const TAIL_RADIUS   = 0.06;  // m (narrow end)
const STRIPES       = 5;
const UPPER_STRIPES = 2;                        // stripes belonging to the upper segment
const SEG_LEN       = SOCK_LENGTH / STRIPES;   // 0.5 m per stripe
const UPPER_LENGTH  = UPPER_STRIPES * SEG_LEN;  // 1.0 m from mount to bend
const STRIPE_COLORS = [0xff5500, 0xffffff] as const;

// Force (N) at which the sock reaches full extension (horizontal).
// Matches wind block defaults: WIND_MAX_N(10) × FORCE_MAX_PCT(15 %) = 1.5 N.
const MAX_FORCE_N = 1.5;
// Lower segment droops BEND_RATIO times more than the upper segment; capped at π/2.
const BEND_RATIO  = 2.5;

// Module-level constant to avoid per-tick allocation in setFromUnitVectors.
const NEG_Y = new THREE.Vector3(0, -1, 0);

export function windSock(
  getWind: (state: ModelState) => VisWind,
  opts: { position?: [number, number, number] } = {},
): ScenePlugin {
  const { position = [-3, 0, -3] } = opts;

  let mountX = 0, mountY = 0, mountZ = 0;
  let pole: THREE.Mesh | null = null;
  let upperPivot: THREE.Group | null = null;  // mouth → bend point
  let lowerPivot: THREE.Group | null = null;  // bend point → tail
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  function own<T extends THREE.BufferGeometry | THREE.Material>(x: T): T {
    disposables.push(x);
    return x;
  }

  function makeStripe(i: number, localJ: number): THREE.Mesh {
    const t0 = i / STRIPES;
    const t1 = (i + 1) / STRIPES;
    const rTop = MOUTH_RADIUS + (TAIL_RADIUS - MOUTH_RADIUS) * t0;
    const rBot = MOUTH_RADIUS + (TAIL_RADIUS - MOUTH_RADIUS) * t1;
    const mesh = new THREE.Mesh(
      own(new THREE.CylinderGeometry(rTop, rBot, SEG_LEN, 8, 1, true)),
      own(new THREE.MeshPhongMaterial({
        color: STRIPE_COLORS[i % STRIPE_COLORS.length],
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      })),
    );
    mesh.position.y = -(localJ + 0.5) * SEG_LEN;
    return mesh;
  }

  return {
    init(scene) {
      const [px, py, pz] = position;
      mountX = px;
      mountY = py + POLE_HEIGHT;
      mountZ = pz;

      // Vertical pole
      pole = new THREE.Mesh(
        own(new THREE.CylinderGeometry(0.05, 0.07, POLE_HEIGHT, 6)),
        own(new THREE.MeshPhongMaterial({ color: 0x888888 })),
      );
      pole.position.set(px, py + POLE_HEIGHT / 2, pz);
      scene.add(pole);

      // Upper pivot — origin at mount point, sock extends in local -Y.
      upperPivot = new THREE.Group();
      upperPivot.position.set(mountX, mountY, mountZ);
      scene.add(upperPivot);

      // Rigid mounting ring at the mouth (y=0 of upperPivot, tilts with the segment).
      // rotation.x = π/2 makes the XY-plane torus face the sock axis (+Y local).
      const ring = new THREE.Mesh(
        own(new THREE.TorusGeometry(MOUTH_RADIUS, 0.04, 6, 16)),
        own(new THREE.MeshPhongMaterial({ color: 0xcccccc })),
      );
      ring.rotation.x = Math.PI / 2;
      upperPivot.add(ring);

      for (let i = 0; i < UPPER_STRIPES; i++) upperPivot.add(makeStripe(i, i));

      // Lower pivot — origin at bend point (updated every tick), extends in local -Y.
      lowerPivot = new THREE.Group();
      lowerPivot.position.set(mountX, mountY - UPPER_LENGTH, mountZ);
      scene.add(lowerPivot);

      for (let i = UPPER_STRIPES; i < STRIPES; i++) lowerPivot.add(makeStripe(i, i - UPPER_STRIPES));
    },

    update(state) {
      if (!upperPivot || !lowerPivot) return;
      const { fx, fz } = getWind(state);
      const mag = Math.sqrt(fx * fx + fz * fz);

      if (mag < 0.001) {
        upperPivot.quaternion.identity();
        lowerPivot.position.set(mountX, mountY - UPPER_LENGTH, mountZ);
        lowerPivot.quaternion.identity();
        return;
      }

      const t = Math.min(mag / MAX_FORCE_N, 1.0);

      // drop: angle below horizontal (π/2 = hanging at no wind, 0 = horizontal at max wind).
      const drop      = (1 - t) * (Math.PI / 2);
      const lowerDrop = Math.min(BEND_RATIO * drop, Math.PI / 2);

      // Horizontal wind direction (unit vector in XZ plane).
      const nx = fx / mag;
      const nz = fz / mag;

      // Upper segment direction: from mount toward bend point.
      const upperDir = new THREE.Vector3(nx * Math.cos(drop), -Math.sin(drop), nz * Math.cos(drop));

      // Orient upper pivot so its local -Y aligns with upperDir.
      upperPivot.quaternion.setFromUnitVectors(NEG_Y, upperDir);

      // Bend point = mount + UPPER_LENGTH along upperDir.
      lowerPivot.position.set(
        mountX + upperDir.x * UPPER_LENGTH,
        mountY + upperDir.y * UPPER_LENGTH,
        mountZ + upperDir.z * UPPER_LENGTH,
      );

      // Lower segment direction: from bend point toward tail.
      const lowerDir = new THREE.Vector3(nx * Math.cos(lowerDrop), -Math.sin(lowerDrop), nz * Math.cos(lowerDrop));

      // Orient lower pivot so its local -Y aligns with lowerDir.
      lowerPivot.quaternion.setFromUnitVectors(NEG_Y, lowerDir);
    },

    dispose(scene) {
      if (pole)        scene.remove(pole);
      if (upperPivot)  scene.remove(upperPivot);
      if (lowerPivot)  scene.remove(lowerPivot);
      disposables.forEach(d => d.dispose());
      disposables.length = 0;
      pole = null;
      upperPivot = null;
      lowerPivot = null;
    },
  };
}
