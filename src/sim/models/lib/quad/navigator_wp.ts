// Waypoint navigator — the "RC pilot" for autonomous flight.
//
// Reads the active waypoint from mission plus the sensed world state, then
// emits AETR sticks for fc_acro. Internally this is the L3 control split folded
// into one block:
//   1. Position PID  → desired world-frame acceleration
//   2. Acceleration  → desired attitude + thrust
//   3. Desired attitude + measured rates → desired torques (L3 stabilizer law)
//   4. Desired torques → desired body rates → AETR sticks for fc_acro
//
// Throttle is a direct value, not a rate — matches real RC throttle stick:
//   aetr.thrust = total_thrust_N / (4 * MAX_THRUST_N), clamped to [0, 1].
//
// Tunables arrive via state.K from the params block. The position loop still
// reads K, while the folded-in attitude law intentionally mirrors quad-l3's
// behavior so quad-l4 flies like L3 without changing the fc_acro contract.

type Vec3 = { x: number; y: number; z: number };
type Aetr = { thrust: number; roll: number; pitch: number; yaw: number };
type Step = { pos: Vec3; threshold: number };
type NavigatorConsts = {
  KP_POS: number;
  KD_POS: number;
  MASS: number;
  GRAVITY: number;
  MAX_TILT: number;
  KP_RATE: number;
  KP_RATE_YAW: number;
  MAX_THRUST_N: number;
  MAX_RATE_ROLL_PITCH: number;
  MAX_RATE_YAW: number;
  MAX_INT_POS: number;
  DT: number;
};

type NavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3;
  step: Step;
  armed: number;
  integralPos: Vec3;
  aetr: Aetr;
  K: NavigatorConsts;
};

type NavOut = {
  aetr: Aetr;
  integralPos: Vec3;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r >  Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

function rateCommandFromTorque(tau: number, measuredRate: number, kpRate: number): number {
  return measuredRate + tau / kpRate;
}

export function navigator_wp(state: NavIn): NavOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };
  const KI_POS_L3 = 0;
  const KP_ATT_L3 = 2.0;
  const KD_ATT_L3 = 0.2;
  const KP_ATT_YAW_L3 = 0.5;
  const KD_ATT_YAW_L3 = 0.15;

  if (!state.armed) {
    return { aetr: state.aetr, integralPos: zero3 };
  }

  const K = state.K;
  const target = state.step.pos;

  // Step 1: position PID → world-frame acceleration demand.
  const ex = target.x - state.pos.x;
  const ey = target.y - state.pos.y;
  const ez = target.z - state.pos.z;

  const horizontalDist2 = ex * ex + ez * ez;
  const yaw_des = horizontalDist2 > 0.01
    ? Math.atan2(-ez, ex)
    : state.attitude.y;

  const ax_des = K.KP_POS * ex + KI_POS_L3 * state.integralPos.x - K.KD_POS * state.vel.x;
  const ay_des = K.KP_POS * ey + KI_POS_L3 * state.integralPos.y - K.KD_POS * state.vel.y;
  const az_des = K.KP_POS * ez + KI_POS_L3 * state.integralPos.z - K.KD_POS * state.vel.z;

  // Step 2: acceleration → desired total thrust + desired body-frame attitude.
  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const thrust_N = Math.max(0, K.MASS * (ay_des + K.GRAVITY) / tilt_cos);
  const g_eff    = Math.max(thrust_N / K.MASS, 1.0);

  const psi = state.attitude.y;
  const cp  = Math.cos(psi);
  const sp  = Math.sin(psi);
  const pitch_des = clamp((-cp * ax_des + sp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);
  const roll_des  = clamp(( sp * ax_des + cp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);

  // Step 3: L3 stabilizer law folded in here: attitude error + measured rate
  // produce desired body torques.
  const err_roll  = roll_des  - state.attitude.x;
  const err_pitch = pitch_des - state.attitude.z;
  const err_yaw   = wrapAngle(yaw_des - state.attitude.y);

  const tau_roll  = KP_ATT_L3     * err_roll  - KD_ATT_L3     * state.angularVel.x;
  const tau_pitch = KP_ATT_L3     * err_pitch - KD_ATT_L3     * state.angularVel.z;
  const tau_yaw   = KP_ATT_YAW_L3 * err_yaw   - KD_ATT_YAW_L3 * state.angularVel.y;

  // Step 4: invert fc_acro's rate P-law so the AETR bus reproduces the same
  // desired torque behavior while preserving the L4 block contract.
  const rate_roll  = rateCommandFromTorque(tau_roll,  state.angularVel.x, K.KP_RATE);
  const rate_pitch = rateCommandFromTorque(tau_pitch, state.angularVel.z, K.KP_RATE);
  const rate_yaw   = rateCommandFromTorque(tau_yaw,   state.angularVel.y, K.KP_RATE_YAW);

  const aetr: Aetr = {
    thrust: clamp(thrust_N / (4 * K.MAX_THRUST_N), 0, 1),
    roll:   clamp(rate_roll  / K.MAX_RATE_ROLL_PITCH, -1, 1),
    pitch:  clamp(rate_pitch / K.MAX_RATE_ROLL_PITCH, -1, 1),
    yaw:    clamp(rate_yaw   / K.MAX_RATE_YAW,        -1, 1),
  };

  return {
    aetr,
    integralPos: {
      x: Math.max(-K.MAX_INT_POS, Math.min(K.MAX_INT_POS, state.integralPos.x + ex * K.DT)),
      y: Math.max(-K.MAX_INT_POS, Math.min(K.MAX_INT_POS, state.integralPos.y + ey * K.DT)),
      z: Math.max(-K.MAX_INT_POS, Math.min(K.MAX_INT_POS, state.integralPos.z + ez * K.DT)),
    },
  };
}
