// Yaw-aware navigator: position PID → desired attitude + thrust.
// Target is the *carrot* produced by fc_path_planner (smooth gate tracking).
// yawSetpoint comes from the planner (window normal direction) and is passed
// straight through to the stabilizer.
// World-frame acceleration demands are rotated into the body frame using the
// current yaw before the small-angle pitch/roll mapping.

type Vec3 = { x: number; y: number; z: number };
type FcNavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; carrot: Vec3; armed: number;
  integralPos: Vec3;
  yawSetpoint: number;
};
type FcNavOut = {
  roll_des: number; pitch_des: number; yaw_des: number; thrust: number;
  integralPos: Vec3;
};

const KP_POS = 2.0;
const KI_POS = 0.3;
const KD_POS = 1.5;
const MAX_INT_POS = 15.0;  // anti-windup clamp — covers ~75% of max wind force (30%×20N/kg)

const MASS    = 1.0;
const GRAVITY = 9.81;
const DT      = 0.05;
const MAX_TILT = 0.4;

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc_navigator(state: FcNavIn): FcNavOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };
  if (!state.armed) return { roll_des: 0, pitch_des: 0, yaw_des: 0, thrust: 0, integralPos: zero3 };

  const ex = state.carrot.x - state.pos.x;
  const ey = state.carrot.y - state.pos.y;
  const ez = state.carrot.z - state.pos.z;

  const ax_des = KP_POS * ex + KI_POS * state.integralPos.x - KD_POS * state.vel.x;
  const ay_des = KP_POS * ey + KI_POS * state.integralPos.y - KD_POS * state.vel.y;
  const az_des = KP_POS * ez + KI_POS * state.integralPos.z - KD_POS * state.vel.z;

  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const thrust   = Math.max(0, MASS * (ay_des + GRAVITY) / tilt_cos);
  const g_eff    = Math.max(thrust / MASS, 1.0);

  // Rotate world-frame demands into body frame using current yaw.
  const psi = state.attitude.y;
  const cp  = Math.cos(psi);
  const sp  = Math.sin(psi);
  const pitch_des = clamp((-cp * ax_des + sp * az_des) / g_eff, MAX_TILT);
  const roll_des  = clamp(( sp * ax_des + cp * az_des) / g_eff, MAX_TILT);

  return {
    roll_des, pitch_des,
    yaw_des: state.yawSetpoint,
    thrust,
    integralPos: {
      x: Math.max(-MAX_INT_POS, Math.min(MAX_INT_POS, state.integralPos.x + ex * DT)),
      y: Math.max(-MAX_INT_POS, Math.min(MAX_INT_POS, state.integralPos.y + ey * DT)),
      z: Math.max(-MAX_INT_POS, Math.min(MAX_INT_POS, state.integralPos.z + ez * DT)),
    },
  };
}
