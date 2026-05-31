// Window navigator — the "RC pilot" for gate-flight navigation.
//
// Reads carrot + yawSetpoint from planner_window and sensor state from the
// noise block, emits Mode-2 AETR sticks for fc_acro to execute. Cascade
// identical in shape to quad-l4 / quad-pole navigator_wp:
//
//   1. Position PID  → desired body-frame acceleration
//   2. Acceleration  → desired attitude (yaw-aware decomposition)
//   3. Attitude err  → desired body rate (outer P loop)
//   4. Rate → stick   (normalise by MAX_RATE_*; fc_acro inverts)
//
// MAX_TILT is held at 0.4 rad (~23°) — gentler than quad-l4's 0.6 rad because
// gate runs need predictable approach angles, not aggressive carrot chases.
//
// KI_POS is on (0.3) so the integral can reject wind. Anti-windup clamped at
// ±15 — same as quad-l4 + quad-noise.

type Vec3 = { x: number; y: number; z: number };
type Aetr = { thrust: number; roll: number; pitch: number; yaw: number };

type NavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3;
  carrot: Vec3; yawSetpoint: number;
  armed: number;
  integralPos: Vec3;
  aetr: Aetr;
};

type NavOut = {
  aetr: Aetr;
  integralPos: Vec3;
};

const KP_POS = 2.0;
const KI_POS = 0.3;
const KD_POS = 1.5;
const MAX_INT_POS = 15.0;

const KP_ATT_OUTER = 40.0;
const KP_YAW_OUTER = 10.0;

const MAX_RATE_ROLL_PITCH = Math.PI;
const MAX_RATE_YAW        = Math.PI / 2;
const MAX_THRUST_N        = 10;

const MASS    = 1.0;
const GRAVITY = 9.81;
const DT      = 0.05;
const MAX_TILT = 0.4;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r >  Math.PI) r -= 2 * Math.PI;
  if (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

export function navigator_window(state: NavIn): NavOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };

  if (!state.armed) {
    return { aetr: state.aetr, integralPos: zero3 };
  }

  const ex = state.carrot.x - state.pos.x;
  const ey = state.carrot.y - state.pos.y;
  const ez = state.carrot.z - state.pos.z;

  const ax_des = KP_POS * ex + KI_POS * state.integralPos.x - KD_POS * state.vel.x;
  const ay_des = KP_POS * ey + KI_POS * state.integralPos.y - KD_POS * state.vel.y;
  const az_des = KP_POS * ez + KI_POS * state.integralPos.z - KD_POS * state.vel.z;

  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const thrust_N = Math.max(0, MASS * (ay_des + GRAVITY) / tilt_cos);
  const g_eff    = Math.max(thrust_N / MASS, 1.0);

  const psi = state.attitude.y;
  const cp  = Math.cos(psi);
  const sp  = Math.sin(psi);
  const pitch_des = clamp((-cp * ax_des + sp * az_des) / g_eff, -MAX_TILT, MAX_TILT);
  const roll_des  = clamp(( sp * ax_des + cp * az_des) / g_eff, -MAX_TILT, MAX_TILT);
  const yaw_des   = state.yawSetpoint;

  const err_roll  = roll_des  - state.attitude.x;
  const err_pitch = pitch_des - state.attitude.z;
  const err_yaw   = wrapAngle(yaw_des - state.attitude.y);

  const rate_roll  = KP_ATT_OUTER * err_roll;
  const rate_pitch = KP_ATT_OUTER * err_pitch;
  const rate_yaw   = KP_YAW_OUTER * err_yaw;

  const aetr: Aetr = {
    thrust: clamp(thrust_N / (4 * MAX_THRUST_N), 0, 1),
    roll:   clamp(rate_roll  / MAX_RATE_ROLL_PITCH, -1, 1),
    pitch:  clamp(rate_pitch / MAX_RATE_ROLL_PITCH, -1, 1),
    yaw:    clamp(rate_yaw   / MAX_RATE_YAW,        -1, 1),
  };

  return {
    aetr,
    integralPos: {
      x: Math.max(-MAX_INT_POS, Math.min(MAX_INT_POS, state.integralPos.x + ex * DT)),
      y: Math.max(-MAX_INT_POS, Math.min(MAX_INT_POS, state.integralPos.y + ey * DT)),
      z: Math.max(-MAX_INT_POS, Math.min(MAX_INT_POS, state.integralPos.z + ez * DT)),
    },
  };
}
