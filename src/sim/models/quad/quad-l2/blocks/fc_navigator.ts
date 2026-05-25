// Navigator FC: position PID → desired attitude angles + total thrust.
// Outer loop of the cascaded two-controller architecture.
//
// KI_POS is intentionally zero because this model has no persistent horizontal
// disturbances: gravity is handled as explicit feedforward, and world.ts models
// no wind or aerodynamic drag. PD is sufficient to converge to zero position
// error in a disturbance-free environment. The integral state is still wired
// through the simulation state so that adding wind or drag later requires only
// a KI_POS value change — no structural refactor needed.
//
// Uses current attitude only for tilt compensation so altitude holds during manoeuvres.
//
// Attitude convention (shared with world/stabilizer):
//   attitude.x = roll  φ  (positive → left side up  → thrust tilts +Z)
//   attitude.z = pitch θ  (positive → nose up        → thrust tilts -X)
//   attitude.y = yaw   ψ  (positive → turn left CCW)

type Vec3 = { x: number; y: number; z: number };
type FcNavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; target: Vec3; armed: number;
  integralPos: Vec3;  // accumulated position error × DT (x, y, z)
};
type FcNavOut = {
  roll_des: number; pitch_des: number; yaw_des: number; thrust: number;
  integralPos: Vec3;
};

const KP_POS = 2.0;
const KI_POS = 0;    // zero: no wind or drag in this model; tune when disturbances are added
const KD_POS = 1.5;

const MASS = 1.0;
const GRAVITY = 9.81;
const DT = 0.05;
const MAX_TILT = 0.3;  // max desired roll/pitch (rad, ~17°)

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc_navigator(state: FcNavIn): FcNavOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };
  if (!state.armed) return { roll_des: 0, pitch_des: 0, yaw_des: 0, thrust: 0, integralPos: zero3 };

  // Position PID → desired accelerations
  const ex = state.target.x - state.pos.x;
  const ey = state.target.y - state.pos.y;
  const ez = state.target.z - state.pos.z;

  const ax_des = KP_POS * ex + KI_POS * state.integralPos.x - KD_POS * state.vel.x;
  const ay_des = KP_POS * ey + KI_POS * state.integralPos.y - KD_POS * state.vel.y;
  const az_des = KP_POS * ez + KI_POS * state.integralPos.z - KD_POS * state.vel.z;

  // Total thrust: vertical component = F·cos(φ)·cos(θ), so divide by tilt factor.
  // Gravity feedforward is explicit here — not handled by the I term.
  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const thrust = Math.max(0, MASS * (ay_des + GRAVITY) / tilt_cos);

  // Small-angle: sin θ ≈ θ; divide by effective g to get angle
  const g_eff = Math.max(thrust / MASS, 1.0);
  const pitch_des = clamp(-ax_des / g_eff, MAX_TILT);  // nose down → +X force
  const roll_des  = clamp( az_des / g_eff, MAX_TILT);  // left up   → +Z force

  return {
    roll_des, pitch_des, yaw_des: 0, thrust,
    integralPos: { x: state.integralPos.x + ex * DT, y: state.integralPos.y + ey * DT, z: state.integralPos.z + ez * DT },
  };
}
