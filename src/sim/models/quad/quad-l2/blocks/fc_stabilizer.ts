// Stabilizer FC: attitude PID → per-motor power (0–1).
// Inner loop of the cascaded two-controller architecture.
//
// KI_ATT is intentionally zero because this model uses perfectly symmetric,
// balanced motors with no persistent torque disturbances. PD is sufficient
// to drive attitude error to zero without integral action. The integral state
// is still wired through the simulation state so that adding motor imbalance
// or aerodynamic asymmetry later requires only a KI_ATT value change — no
// structural refactor needed.
//
// Motor layout (top view, X = forward, Z = right):
//   M0(CCW) · M1(CW)     M0: front-left  (+X, -Z)
//       \   /             M1: front-right (+X, +Z)
//       /   \             M2: rear-right  (-X, +Z)
//   M3(CW)  · M2(CCW)    M3: rear-left   (-X, -Z)
//
// Torque mixing:
//   τ_roll  = ARM · (F0 - F1 - F2 + F3)
//   τ_pitch = ARM · (F0 + F1 - F2 - F3)
//   τ_yaw   = K_DRAG · (-F0 + F1 - F2 + F3)

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type FcStabIn = {
  attitude: Vec3; angularVel: Vec3;
  roll_des: number; pitch_des: number; yaw_des: number; thrust: number;
  armed: number;
  integralAtt: Vec3;  // accumulated attitude error × DT (roll=x, yaw=y, pitch=z)
};
type FcStabOut = { motors: Motors4; integralAtt: Vec3 };

const KP_ATT = 2.0;
const KI_ATT = 0;    // zero: motors are symmetric and balanced; tune when imbalance is modelled
const KD_ATT = 0.2;

const MAX_THRUST_N = 10;   // per motor; total max = 40 N
const ARM = 0.2;           // motor arm length (m)
const K_DRAG = 0.02;       // yaw reactive torque coefficient (N·m / N)
const DT = 0.05;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function fc_stabilizer(state: FcStabIn): FcStabOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };
  if (!state.armed) return { motors: { m0: 0, m1: 0, m2: 0, m3: 0 }, integralAtt: zero3 };

  // Attitude PID → desired torques
  const err_roll  = state.roll_des  - state.attitude.x;
  const err_pitch = state.pitch_des - state.attitude.z;
  const err_yaw   = state.yaw_des   - state.attitude.y;

  const tau_roll  = KP_ATT * err_roll  + KI_ATT * state.integralAtt.x - KD_ATT * state.angularVel.x;
  const tau_pitch = KP_ATT * err_pitch + KI_ATT * state.integralAtt.z - KD_ATT * state.angularVel.z;
  const tau_yaw   = KP_ATT * err_yaw   + KI_ATT * state.integralAtt.y - KD_ATT * state.angularVel.y;

  // Motor mixing (inverse of torque equations)
  const base = state.thrust / 4;
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
    integralAtt: {
      x: state.integralAtt.x + err_roll  * DT,
      y: state.integralAtt.y + err_yaw   * DT,
      z: state.integralAtt.z + err_pitch * DT,
    },
  };
}
