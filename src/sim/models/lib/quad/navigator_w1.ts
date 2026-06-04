// navigator_w1 — the "RC pilot" for gate-flight navigation, shared across the
// whole w1 window-gate family (w1a, w1b, …). The planners differ per variant
// (planner_w1a / planner_w1b), but execution is identical, so it lives in one
// family-level navigator.
//
// Reads the carrot + yawSetpoint from the active w1 planner and the sensed world
// state, then emits Mode-2 AETR sticks for fc_acro. Same cascade shape as the shared
// navigator_wp, but steered by the planner's carrot/yaw instead of the raw
// waypoint, with a plain outer-P attitude loop (no folded-in L3 stabilizer):
//
//   1. Position PID  → desired world-frame acceleration (+ wind-rejecting KI)
//   2. Acceleration  → desired attitude + thrust (yaw-aware decomposition)
//   3. Attitude err  → desired body rate (outer P loop)
//   4. Rate → stick   (normalised by K.MAX_RATE_* onto the shared AETR bus)
//
// All gains/limits arrive via state.K from the lifecycle block. The model bumps
// KI_POS (wind rejection) and MAX_TILT through per-instance overrides; everything
// else is the shared QUAD_DEFAULTS. Because both this block and fc_acro read the
// SAME K.MAX_RATE_*, the stick normalisation stays in sync with the inner loop.

type Vec3 = { x: number; y: number; z: number };
type Aetr = { throttle: number; roll: number; pitch: number; yaw: number };
type NavigatorConsts = {
  KP_POS: number;
  KI_POS: number;
  KD_POS: number;
  MAX_INT_POS: number;
  KP_ATT_OUTER: number;
  KP_YAW_OUTER: number;
  YAW_MEAS_LPF: number;
  MAX_TILT: number;
  MASS: number;
  GRAVITY: number;
  MAX_THRUST_N: number;
  MAX_RATE_ROLL_PITCH: number;
  MAX_RATE_YAW: number;
  DT: number;
};

type NavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3;
  carrot: Vec3; yawSetpoint: number;
  armed: number;
  integralPos: Vec3;
  yawMeas: number;        // low-passed yaw measurement carried across ticks
  aetr: Aetr;
  K: NavigatorConsts;
};

type NavOut = {
  aetr: Aetr;
  integralPos: Vec3;
  yawMeas: number;
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

export function navigator_w1(state: NavIn): NavOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };

  if (!state.armed) {
    // Track the raw measurement while disarmed so the filter has no lag at arm.
    return { aetr: state.aetr, integralPos: zero3, yawMeas: state.attitude.y };
  }

  const K = state.K;

  // Low-pass the noisy yaw measurement before the pure-P yaw loop so sensor
  // jitter isn't amplified by KP_YAW_OUTER into a left/right yaw wobble. Angle-
  // aware EMA: factor 1 = pass-through (no filtering), smaller = more smoothing.
  const yawMeas = wrapAngle(
    state.yawMeas + K.YAW_MEAS_LPF * wrapAngle(state.attitude.y - state.yawMeas),
  );

  const ex = state.carrot.x - state.pos.x;
  const ey = state.carrot.y - state.pos.y;
  const ez = state.carrot.z - state.pos.z;

  const ax_des = K.KP_POS * ex + K.KI_POS * state.integralPos.x - K.KD_POS * state.vel.x;
  const ay_des = K.KP_POS * ey + K.KI_POS * state.integralPos.y - K.KD_POS * state.vel.y;
  const az_des = K.KP_POS * ez + K.KI_POS * state.integralPos.z - K.KD_POS * state.vel.z;

  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const thrust_N = Math.max(0, K.MASS * (ay_des + K.GRAVITY) / tilt_cos);
  const g_eff    = Math.max(thrust_N / K.MASS, 1.0);

  const psi = state.attitude.y;
  const cp  = Math.cos(psi);
  const sp  = Math.sin(psi);
  const pitch_des = clamp((-cp * ax_des + sp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);
  const roll_des  = clamp(( sp * ax_des + cp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);
  const yaw_des   = state.yawSetpoint;

  const err_roll  = roll_des  - state.attitude.x;
  const err_pitch = pitch_des - state.attitude.z;
  const err_yaw   = wrapAngle(yaw_des - yawMeas);

  const rate_roll  = K.KP_ATT_OUTER * err_roll;
  const rate_pitch = K.KP_ATT_OUTER * err_pitch;
  const rate_yaw   = K.KP_YAW_OUTER * err_yaw;

  const aetr: Aetr = {
    throttle: clamp(thrust_N / (4 * K.MAX_THRUST_N), 0, 1),
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
    yawMeas,
  };
}
