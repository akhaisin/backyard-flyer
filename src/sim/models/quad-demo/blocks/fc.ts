// Flight controller: PD position control. Outputs desired thrust (throttle %).
// When disarmed, outputs zero thrust so the craft stays on the ground.

type Vec3 = { x: number; y: number; z: number };
type FcIn = { pos: Vec3; vel: Vec3; target: Vec3; armed: number };
type FcOut = { desired: Vec3 };

const K = 3.0;
const KV = 1.5;
const MASS = 1.0;
const GRAVITY = 9.81;
const MAX_THRUST_N = 30;

export function fc(state: FcIn): FcOut {
  if (!state.armed) {
    return { desired: { x: 0, y: 0, z: 0 } };
  }
  const fx = MASS * (K * (state.target.x - state.pos.x) - KV * state.vel.x);
  const fy = MASS * (K * (state.target.y - state.pos.y) - KV * state.vel.y) + MASS * GRAVITY;
  const fz = MASS * (K * (state.target.z - state.pos.z) - KV * state.vel.z);
  const k = 100 / MAX_THRUST_N;
  return { desired: { x: fx * k, y: fy * k, z: fz * k } };
}
