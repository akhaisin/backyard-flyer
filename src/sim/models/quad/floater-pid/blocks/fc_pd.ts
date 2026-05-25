// PD flight controller. Outputs desired thrust vector as throttle % (0-100).
// - Proportional (KP): pulls toward the target
// - Derivative (KV, applied as -KV·velocity): damps motion before overshoot
//
// Pure P with no damping does not converge — it's a frictionless spring.
// (Think planetary orbits: gravity alone is "pure P", and the Moon orbits
// the Earth forever because nothing dissipates the energy.)
// The KV term provides that missing dissipation.

type Vec3 = { x: number; y: number; z: number };
type FcIn = { pos: Vec3; vel: Vec3; target: Vec3 };
type FcOut = { desired: Vec3 };

const KP = 3.0;           // proportional gain
const KV = 0.5;           // velocity damping (lower than full PID so contrast stays visible)
const MASS = 1.0;
const GRAVITY = 9.81;
const MAX_THRUST_N = 30;

// Position sensor noise — uniform per-axis jitter applied to pos readings
// before the controller sees them. Knob: NOISE_PCT.
//   0   = perfect sensor
//   100 = jitter up to ±NOISE_SCALE_M on each axis
const NOISE_PCT = 1;
const NOISE_SCALE_M = 3;

function jitter(v: number): number {
  const amp = (NOISE_PCT / 100) * NOISE_SCALE_M;
  return v + (Math.random() - 0.5) * 2 * amp;
}

export function fc_pd(state: FcIn): FcOut {
  // Noisy position reading — controller never sees the true pos directly.
  const px = jitter(state.pos.x);
  const py = jitter(state.pos.y);
  const pz = jitter(state.pos.z);

  const fx = MASS * (KP * (state.target.x - px) - KV * state.vel.x);
  const fy = MASS * (KP * (state.target.y - py) - KV * state.vel.y) + MASS * GRAVITY;
  const fz = MASS * (KP * (state.target.z - pz) - KV * state.vel.z);

  const k = 100 / MAX_THRUST_N;
  return { desired: { x: fx * k, y: fy * k, z: fz * k } };
}
