// Flight controller: simple proportional control.
// Outputs desired thrust vector in world frame, scaled as throttle % (0-100).
// HW translates % to Newtons and applies inertia/limits.

type Vec3 = { x: number; y: number; z: number };
type FcIn = { pos: Vec3; vel: Vec3; target: Vec3 };
type FcOut = { desired: Vec3 };

const K = 3.0;             // position gain
const KV = 1.5;            // velocity damping
const MASS = 1.0;          // kg
const GRAVITY = 9.81;      // m/s²
const MAX_THRUST_N = 30;   // must match HW

export function fc(state: FcIn): FcOut {
  // Desired net force (Newtons, world frame): proportional pull to target,
  // velocity damping, gravity compensation.
  const fx = MASS * (K * (state.target.x - state.pos.x) - KV * state.vel.x);
  const fy = MASS * (K * (state.target.y - state.pos.y) - KV * state.vel.y) + MASS * GRAVITY;
  const fz = MASS * (K * (state.target.z - state.pos.z) - KV * state.vel.z);

  // Convert to throttle % (HW saturates if > 100)
  const k = 100 / MAX_THRUST_N;
  return { desired: { x: fx * k, y: fy * k, z: fz * k } };
}
