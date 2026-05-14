// PID flight controller for floater 2.
// Integral term eliminates steady-state error; derivative term damps oscillation.
// ex/ey/ez accumulate position error over time and are stored in model state.

type FcPidIn = { x: number; y: number; z: number; vx: number; vy: number; vz: number; targetX: number; targetY: number; targetZ: number; ex: number; ey: number; ez: number };
type FcPidOut = { ax: number; ay: number; az: number; ex: number; ey: number; ez: number };

const KP = 1.5;        // proportional gain
const KI = 0.5;        // integral gain
const KD = 2.5;        // derivative gain (applied to velocity)
const GRAVITY = 9.81;
const MAX_ACC = 20.0;
const MAX_INT = 15.0;  // integral clamp — prevents windup
const DT = 0.05;       // seconds per tick

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc_pid(state: FcPidIn): FcPidOut {
  const dx = state.targetX - state.x;
  const dy = state.targetY - state.y;
  const dz = state.targetZ - state.z;

  const ex = clamp(state.ex + dx * DT, MAX_INT);
  const ey = clamp(state.ey + dy * DT, MAX_INT);
  const ez = clamp(state.ez + dz * DT, MAX_INT);

  return {
    ax: clamp(dx * KP + ex * KI - state.vx * KD, MAX_ACC),
    ay: GRAVITY + clamp(dy * KP + ey * KI - state.vy * KD, MAX_ACC),
    az: clamp(dz * KP + ez * KI - state.vz * KD, MAX_ACC),
    ex, ey, ez,
  };
}
