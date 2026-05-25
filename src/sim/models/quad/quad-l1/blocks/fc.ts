// Cascaded position + attitude PID controller for X-configuration quadrotor.
// Outer loop: position error → desired total thrust + desired roll/pitch angles.
// Inner loop: attitude error → desired torques → motor mixing.
//
// Both loops are PID. KI_POS and KI_ATT are intentionally zero because this model
// has no persistent disturbances: gravity is handled by explicit feedforward, there
// is no wind or aerodynamic drag, and motors are perfectly symmetric. Adding I on
// top of PD in a disturbance-free sim only introduces windup risk with no benefit.
// Integral state is wired through the simulation state so that adding wind or motor
// noise later requires only a KI value change — no structural refactor.
//
// Motor layout (top view, X = forward, Z = right):
//   M0(CCW) · M1(CW)     M0: front-left  (+X, -Z)
//       \   /             M1: front-right (+X, +Z)
//       /   \             M2: rear-right  (-X, +Z)
//   M3(CW)  · M2(CCW)    M3: rear-left   (-X, -Z)
//
// Attitude convention (attitude.x = roll φ, attitude.y = yaw ψ, attitude.z = pitch θ):
//   roll  φ > 0 → left side up  → thrust tilts +Z (right)
//   pitch θ > 0 → nose up       → thrust tilts -X (backward)
//   yaw   ψ > 0 → turn left (CCW from above)

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type FcIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3;
  target: Vec3; armed: number;
  integralPos: Vec3;  // accumulated position error × DT (x, y, z)
  integralAtt: Vec3;  // accumulated attitude error × DT (roll=x, yaw=y, pitch=z)
};
type FcOut = {
  motors: Motors4;
  integralPos: Vec3;
  integralAtt: Vec3;
};

const KP_POS = 2.0;
const KI_POS = 0;    // zero: no wind or drag in this model; tune when disturbances are added
const KD_POS = 1.5;

const KP_ATT = 2.0;
const KI_ATT = 0;    // zero: motors are symmetric and balanced; tune when imbalance is modelled
const KD_ATT = 0.2;

const MASS = 1.0;
const GRAVITY = 9.81;
const DT = 0.05;
const MAX_THRUST_N = 10;   // per motor; total max = 40 N
const ARM = 0.2;           // motor arm length (m)
const K_DRAG = 0.02;       // yaw reactive torque coefficient (N·m / N)
const MAX_TILT = 0.3;      // max desired roll/pitch (rad, ~17°) — keeps motors out of saturation

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc(state: FcIn): FcOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };
  if (!state.armed) {
    return { motors: { m0: 0, m1: 0, m2: 0, m3: 0 }, integralPos: zero3, integralAtt: zero3 };
  }

  // --- Position PID loop → desired accelerations ---
  const ex = state.target.x - state.pos.x;
  const ey = state.target.y - state.pos.y;
  const ez = state.target.z - state.pos.z;

  const ax_des = KP_POS * ex + KI_POS * state.integralPos.x - KD_POS * state.vel.x;
  const ay_des = KP_POS * ey + KI_POS * state.integralPos.y - KD_POS * state.vel.y;
  const az_des = KP_POS * ez + KI_POS * state.integralPos.z - KD_POS * state.vel.z;

  // Thrust compensation: when tilted, vertical component = F_total·cos(roll)·cos(pitch).
  // Gravity is handled as feedforward here — not by the I term.
  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const f_total = Math.max(0, MASS * (ay_des + GRAVITY) / tilt_cos);

  // Desired tilt angles (small-angle: sin θ ≈ θ), clamped to keep motors unsaturated.
  const g_eff = Math.max(f_total / MASS, 1.0);
  const pitch_des = clamp(-ax_des / g_eff, MAX_TILT);
  const roll_des  = clamp( az_des / g_eff, MAX_TILT);

  // --- Attitude PID loop → desired torques ---
  const err_roll  = roll_des  - state.attitude.x;
  const err_pitch = pitch_des - state.attitude.z;
  const err_yaw   = 0         - state.attitude.y;

  const tau_roll  = KP_ATT * err_roll  + KI_ATT * state.integralAtt.x - KD_ATT * state.angularVel.x;
  const tau_pitch = KP_ATT * err_pitch + KI_ATT * state.integralAtt.z - KD_ATT * state.angularVel.z;
  const tau_yaw   = KP_ATT * err_yaw   + KI_ATT * state.integralAtt.y - KD_ATT * state.angularVel.y;

  // --- Motor mixing (inverse of torque equations) ---
  const base = f_total / 4;
  const dr   = tau_roll  / (4 * ARM);
  const dp   = tau_pitch / (4 * ARM);
  const dy   = tau_yaw   / (4 * K_DRAG);

  const k = 1 / MAX_THRUST_N;

  return {
    motors: {
      m0: clamp01((base + dr + dp - dy) * k),
      m1: clamp01((base - dr + dp + dy) * k),
      m2: clamp01((base - dr - dp - dy) * k),
      m3: clamp01((base + dr - dp + dy) * k),
    },
    integralPos: { x: state.integralPos.x + ex * DT, y: state.integralPos.y + ey * DT, z: state.integralPos.z + ez * DT },
    integralAtt: { x: state.integralAtt.x + err_roll * DT, y: state.integralAtt.y + err_yaw * DT, z: state.integralAtt.z + err_pitch * DT },
  };
}
