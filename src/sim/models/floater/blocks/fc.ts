// Flight controller: simple proportional control.
// Outputs desired thrust vector in world frame, scaled as throttle % (0-100).
// HW translates % to Newtons and applies inertia/limits.

type FcIn = { x: number; y: number; z: number; vx: number; vy: number; vz: number; targetX: number; targetY: number; targetZ: number };
type FcOut = { tdx: number; tdy: number; tdz: number };

const K = 3.0;             // position gain
const KV = 1.5;            // velocity damping
const MASS = 1.0;          // kg
const GRAVITY = 9.81;      // m/s²
const MAX_THRUST_N = 30;   // must match HW

export function fc(state: FcIn): FcOut {
  // Desired net force (Newtons, world frame): proportional pull to target,
  // velocity damping, gravity compensation.
  const fx = MASS * (K * (state.targetX - state.x) - KV * state.vx);
  const fy = MASS * (K * (state.targetY - state.y) - KV * state.vy) + MASS * GRAVITY;
  const fz = MASS * (K * (state.targetZ - state.z) - KV * state.vz);

  // Convert to throttle % (HW saturates if > 100)
  const k = 100 / MAX_THRUST_N;
  return { tdx: fx * k, tdy: fy * k, tdz: fz * k };
}
