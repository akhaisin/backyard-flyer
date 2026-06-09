// coordinated-turn navigator — the "RC pilot" for scripted maneuvers.
//
// Normal mode: reads planner_cturn's sampled arc plan and writes it to aetr.
// Same role as navigator_wp but for the maneuver path. Kept as a separate block
// (rather than collapsed into planner_cturn) so the planner ↔ navigator split is
// consistent across mission types.
//
// Debug mode (planner sets debug=1): the planner skips the arc and instead hands
// us the active straight-leg target (targetX/Y/Z). We fly straight to it with the
// same position→attitude→AETR law as navigator_wp (no integral term — KI is 0
// there too), so the cturn's three waypoints render as two straight legs. Used to
// visually inspect a route's geometry without the arc dynamics.
//
// When the planner reports inactive, this block passes through the current aetr
// unchanged — letting navigator_wp's value (or any earlier writer) stand.

type Vec3 = { x: number; y: number; z: number };
type Aetr = { throttle: number; roll: number; pitch: number; yaw: number };

type NavConsts = {
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
};

type NavIn = {
  planThrottle: number;
  planRoll:   number;
  planPitch:  number;
  planYaw:    number;
  planActive: number;
  planDebug:  number;   // 1 → fly straight to (planTargetX/Y/Z) instead of the arc plan
  planTargetX: number;
  planTargetY: number;
  planTargetZ: number;
  planTargetYaw: number;
  pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3;
  K: NavConsts;
  aetr: Aetr;
};

type NavOut = { aetr: Aetr };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r >  Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export function navigator_cturn(state: NavIn): NavOut {
  if (Math.round(state.planActive) !== 1) {
    return { aetr: state.aetr };
  }

  if (Math.round(state.planDebug) === 1) {
    return { aetr: flyToTarget(state, false) };
  }

  return { aetr: flyToTarget(state, true) };
}

// Straight-line position controller toward (planTargetX/Y/Z). Mirrors the L3
// cascade folded into navigator_wp: position PID → desired accel → desired
// attitude + thrust → desired torques → AETR rate sticks. Integral term omitted
// (navigator_wp runs it with KI = 0).
function flyToTarget(state: NavIn, usePlannedHeading: boolean): Aetr {
  const K = state.K;
  const KP_ATT_L3 = 2.0;
  const KD_ATT_L3 = 0.2;
  const KP_ATT_YAW_L3 = 0.5;
  const KD_ATT_YAW_L3 = 0.15;

  const ex = state.planTargetX - state.pos.x;
  const ey = state.planTargetY - state.pos.y;
  const ez = state.planTargetZ - state.pos.z;

  // In debug legs, follow velocity heading to avoid waypoint-handoff spins.
  // In arc mode, planner supplies the target tangent heading.
  const speed2 = state.vel.x * state.vel.x + state.vel.z * state.vel.z;
  const yaw_des = usePlannedHeading
    ? state.planTargetYaw
    : (speed2 > 0.25 ? Math.atan2(-state.vel.z, state.vel.x) : state.attitude.y);

  const ax_des = K.KP_POS * ex - K.KD_POS * state.vel.x;
  const ay_des = K.KP_POS * ey - K.KD_POS * state.vel.y;
  const az_des = K.KP_POS * ez - K.KD_POS * state.vel.z;

  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const thrust_N = Math.max(0, K.MASS * (ay_des + K.GRAVITY) / tilt_cos);
  const g_eff    = Math.max(thrust_N / K.MASS, 1.0);

  const psi = state.attitude.y;
  const cp  = Math.cos(psi);
  const sp  = Math.sin(psi);
  const pitch_des = clamp((-cp * ax_des + sp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);
  const roll_des  = clamp(( sp * ax_des + cp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);

  const err_roll  = roll_des  - state.attitude.x;
  const err_pitch = pitch_des - state.attitude.z;
  const err_yaw   = wrapAngle(yaw_des - state.attitude.y);

  const tau_roll  = KP_ATT_L3     * err_roll  - KD_ATT_L3     * state.angularVel.x;
  const tau_pitch = KP_ATT_L3     * err_pitch - KD_ATT_L3     * state.angularVel.z;
  const tau_yaw   = KP_ATT_YAW_L3 * err_yaw   - KD_ATT_YAW_L3 * state.angularVel.y;

  const rate_roll  = state.angularVel.x + tau_roll  / K.KP_RATE;
  const rate_pitch = state.angularVel.z + tau_pitch / K.KP_RATE;
  const rate_yaw   = state.angularVel.y + tau_yaw   / K.KP_RATE_YAW;

  return {
    throttle: clamp(thrust_N / (4 * K.MAX_THRUST_N), 0, 1),
    roll:   clamp(rate_roll  / K.MAX_RATE_ROLL_PITCH, -1, 1),
    pitch:  clamp(rate_pitch / K.MAX_RATE_ROLL_PITCH, -1, 1),
    yaw:    clamp(rate_yaw   / K.MAX_RATE_YAW,        -1, 1),
  };
}
