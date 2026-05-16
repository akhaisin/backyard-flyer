// Pure PID flight controller — no physical knowledge of mass or gravity.
// Outputs desired thrust vector as throttle % (0-100).
//
// Unlike fc_pd (which feeds-forward MASS·GRAVITY to compensate for the
// constant downward pull), this controller is given only the position error
// and must rely on its integral term to discover any constant disturbance.
// Note: hovering requires the integral to provide ~9.81 N upward. With KI
// and MAX_INT below, the integral may saturate before it reaches that
// magnitude — observe the steady-state y-axis behaviour.

type Vec3 = { x: number; y: number; z: number };
type FcIn = { pos: Vec3; vel: Vec3; target: Vec3; err: Vec3; errPrev: Vec3 };
type FcOut = { desired: Vec3; err: Vec3; errPrev: Vec3 };

const KP = 4.5;
const KI = 1.0;
const KD = 1.5;
const MAX_INT = 40.0;
const MAX_THRUST_N = 30;
const DT = 0.05;

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc_pid(state: FcIn): FcOut {
  const ex = state.target.x - state.pos.x;
  const ey = state.target.y - state.pos.y;
  const ez = state.target.z - state.pos.z;

  const ix = clamp(state.err.x + ex * DT, MAX_INT);
  const iy = clamp(state.err.y + ey * DT, MAX_INT);
  const iz = clamp(state.err.z + ez * DT, MAX_INT);

  const dex = (ex - state.errPrev.x) / DT;
  const dey = (ey - state.errPrev.y) / DT;
  const dez = (ez - state.errPrev.z) / DT;

  // Pure PID law — no MASS, no gravity feedforward.
  const fx = KP * ex + KI * ix + KD * dex;
  const fy = KP * ey + KI * iy + KD * dey;
  const fz = KP * ez + KI * iz + KD * dez;

  const k = 100 / MAX_THRUST_N;
  return {
    desired: { x: fx * k, y: fy * k, z: fz * k },
    err: { x: ix, y: iy, z: iz },
    errPrev: { x: ex, y: ey, z: ez },
  };
}
