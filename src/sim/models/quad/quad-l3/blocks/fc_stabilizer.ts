// Stabilizer FC: attitude PID → per-motor power (0–1).
// Inner loop of the cascaded two-controller architecture.
//
// Changes from quad-l2 fc_stabilizer:
//   - Yaw uses lower gains. At hover (base ≈ 2.45 N) the max safe yaw torque before
//     motor saturation is only ~0.196 Nm. KP_ATT = 2.0 on a 0.157 rad error produces
//     0.314 Nm, instantly saturating two motors and killing roll/pitch authority.
//   - Yaw error is wrapped to (−π, π] so heading transitions through ±π
//     (e.g. flying from +X toward −X) produce the shortest-path correction.
//
// KI_ATT and KI_ATT_YAW are both zero: this model has no persistent torque
// disturbances. The integral state is wired through so adding motor imbalance
// later requires only a gain change, not a structural refactor.
//
// Motor layout (top view, X = forward, Z = right):
//   M0(CCW) · M1(CW)     M0: front-left  (+X, -Z)
//       \   /             M1: front-right (+X, +Z)
//       /   \             M2: rear-right  (-X, +Z)
//   M3(CW)  · M2(CCW)    M3: rear-left   (-X, -Z)
//
// Torque mixing:
//   τ_roll  = ARM_LENGTH · (F0 - F1 - F2 + F3)
//   τ_pitch = ARM_LENGTH · (F0 + F1 - F2 - F3)
//   τ_yaw   = K_DRAG · (-F0 + F1 - F2 + F3)

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type FcStabIn = {
  attitude: Vec3; angularVel: Vec3;
  roll_des: number; pitch_des: number; yaw_des: number; thrust: number;
  armed: number;
  integralAtt: Vec3;
};
type FcStabOut = { motors: Motors4; integralAtt: Vec3 };

const KP_ATT     = 2.0;
const KI_ATT     = 0;    // zero: no persistent torque disturbances
const KD_ATT     = 0.2;

const KP_ATT_YAW = 0.5;  // lower: yaw has less torque headroom at hover
const KI_ATT_YAW = 0;
const KD_ATT_YAW = 0.15;

const MAX_THRUST_N = 10;
const ARM_LENGTH = 0.2;
const K_DRAG = 0.02;
const DT     = 0.05;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r >  Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export function fc_stabilizer(state: FcStabIn): FcStabOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };
  if (!state.armed) return { motors: { m0: 0, m1: 0, m2: 0, m3: 0 }, integralAtt: zero3 };

  const err_roll  = state.roll_des  - state.attitude.x;
  const err_pitch = state.pitch_des - state.attitude.z;
  const err_yaw   = wrapAngle(state.yaw_des - state.attitude.y);

  const tau_roll  = KP_ATT     * err_roll  + KI_ATT     * state.integralAtt.x - KD_ATT     * state.angularVel.x;
  const tau_pitch = KP_ATT     * err_pitch + KI_ATT     * state.integralAtt.z - KD_ATT     * state.angularVel.z;
  const tau_yaw   = KP_ATT_YAW * err_yaw   + KI_ATT_YAW * state.integralAtt.y - KD_ATT_YAW * state.angularVel.y;

  const base = state.thrust / 4;
  const dr   = tau_roll  / (4 * ARM_LENGTH);
  const dp   = tau_pitch / (4 * ARM_LENGTH);
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
