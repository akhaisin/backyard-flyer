// Waypoint navigator — the "RC pilot" for autonomous flight.
//
// Reads carrot + yawSetpoint from planner_wp, sensor state from the world, and
// outputs AETR sticks (Mode-2 transmitter conventions) for fc_acro to execute.
//
// Cascade structure:
//   1. Position PID  → desired body-frame acceleration
//   2. Acceleration  → desired attitude (yaw-aware decomposition)
//   3. Attitude error → desired body rate (outer P loop)
//   4. Rate → stick   (normalize by MAX_RATE_*; matches fc_acro's constants
//                      since fc_acro performs the inverse mapping — both read
//                      the same state.K)
//
// Throttle is a direct value, not a rate — matches real RC throttle stick:
//   aetr.thrust = total_thrust_N / (4 * MAX_THRUST_N), clamped to [0, 1].
//
// Tunables arrive via state.K from the params block. The cascade effective gain
// (KP_ATT_OUTER × fc_acro.KP_RATE) sizes the attitude response; the autonomous
// path often saturates the rate stick (±1) for non-trivial errors — that's fine.

import type { QuadConsts } from './consts';

type Vec3 = { x: number; y: number; z: number };
type Aetr = { thrust: number; roll: number; pitch: number; yaw: number };

type NavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3;
  carrot: Vec3; yawSetpoint: number;
  armed: number;
  integralPos: Vec3;
  aetr: Aetr;
  K: QuadConsts;
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

export function navigator_wp(state: NavIn): NavOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };

  if (!state.armed) {
    return { aetr: state.aetr, integralPos: zero3 };
  }

  const K = state.K;

  // Step 1: position PID → world-frame acceleration demand.
  const ex = state.carrot.x - state.pos.x;
  const ey = state.carrot.y - state.pos.y;
  const ez = state.carrot.z - state.pos.z;

  const ax_des = K.KP_POS * ex + K.KI_POS * state.integralPos.x - K.KD_POS * state.vel.x;
  const ay_des = K.KP_POS * ey + K.KI_POS * state.integralPos.y - K.KD_POS * state.vel.y;
  const az_des = K.KP_POS * ez + K.KI_POS * state.integralPos.z - K.KD_POS * state.vel.z;

  // Step 2: acceleration → desired total thrust + desired body-frame attitude.
  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const thrust_N = Math.max(0, K.MASS * (ay_des + K.GRAVITY) / tilt_cos);
  const g_eff    = Math.max(thrust_N / K.MASS, 1.0);

  const psi = state.attitude.y;
  const cp  = Math.cos(psi);
  const sp  = Math.sin(psi);
  const pitch_des = clamp((-cp * ax_des + sp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);
  const roll_des  = clamp(( sp * ax_des + cp * az_des) / g_eff, -K.MAX_TILT, K.MAX_TILT);
  const yaw_des   = state.yawSetpoint;

  // Step 3: attitude error → desired body rate.
  const err_roll  = roll_des  - state.attitude.x;
  const err_pitch = pitch_des - state.attitude.z;
  const err_yaw   = wrapAngle(yaw_des - state.attitude.y);

  const rate_roll  = K.KP_ATT_OUTER * err_roll;
  const rate_pitch = K.KP_ATT_OUTER * err_pitch;
  const rate_yaw   = K.KP_YAW_OUTER * err_yaw;

  // Step 4: rate → stick (mirrors fc_acro's stick → rate).
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
