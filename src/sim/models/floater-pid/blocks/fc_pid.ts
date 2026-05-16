// PID flight controller. Outputs desired thrust vector as throttle % (0-100).
// - Proportional: pulls toward the target
// - Integral: eliminates steady-state error; accumulator stored in state.err
// - Derivative: damps oscillation by penalising velocity

type Vec3 = { x: number; y: number; z: number };
type FcIn = { pos: Vec3; vel: Vec3; target: Vec3; err: Vec3 };
type FcOut = { desired: Vec3; err: Vec3 };

const KP = 4.5;            // strong proportional pull — exceeds PD's KP=3.0
const KI = 0.3;            // modest integral; large values cause windup on moving targets
const KD = 1.5;            // damping ratio ζ ≈ 0.35 — suppresses oscillation without over-braking
const MAX_INT = 15.0;      // integral clamp — prevents windup
const MASS = 1.0;
const GRAVITY = 9.81;
const MAX_THRUST_N = 30;
const DT = 0.05;

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc_pid(state: FcIn): FcOut {
  const dx = state.target.x - state.pos.x;
  const dy = state.target.y - state.pos.y;
  const dz = state.target.z - state.pos.z;

  // Integral accumulator (clamped to avoid windup)
  const ex = clamp(state.err.x + dx * DT, MAX_INT);
  const ey = clamp(state.err.y + dy * DT, MAX_INT);
  const ez = clamp(state.err.z + dz * DT, MAX_INT);

  // PID law → desired force (Newtons, world frame)
  const fx = MASS * (KP * dx + KI * ex - KD * state.vel.x);
  const fy = MASS * (KP * dy + KI * ey - KD * state.vel.y) + MASS * GRAVITY;
  const fz = MASS * (KP * dz + KI * ez - KD * state.vel.z);

  const k = 100 / MAX_THRUST_N;
  return {
    desired: { x: fx * k, y: fy * k, z: fz * k },
    err: { x: ex, y: ey, z: ez },
  };
}
