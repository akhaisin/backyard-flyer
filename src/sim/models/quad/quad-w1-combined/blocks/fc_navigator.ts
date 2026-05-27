// Navigator FC: position PID → desired attitude angles + total thrust.
// Identical to quad-noice fc_navigator except the target is the *carrot* produced
// by fc_path_planner rather than the raw mission window center. This gives smooth
// carrot-and-stick tracking through the gate sequence.

type Vec3 = { x: number; y: number; z: number };
type FcNavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; carrot: Vec3; armed: number;
  integralPos: Vec3;
};
type FcNavOut = {
  roll_des: number; pitch_des: number; yaw_des: number; thrust: number;
  integralPos: Vec3;
};

const KP_POS = 3.0;
const KI_POS = 0.3;
const KD_POS = 2.5;

const MASS    = 1.0;
const GRAVITY = 9.81;
const DT      = 0.05;
const MAX_TILT = 0.6;

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
  const pitch_des = clamp(-ax_des / g_eff, MAX_TILT);
  const roll_des  = clamp( az_des / g_eff, MAX_TILT);

  return {
    roll_des, pitch_des, yaw_des: 0, thrust,
    integralPos: {
      x: state.integralPos.x + ex * DT,
      y: state.integralPos.y + ey * DT,
      z: state.integralPos.z + ez * DT,
    },
  };
}
