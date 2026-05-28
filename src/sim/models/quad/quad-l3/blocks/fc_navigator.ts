// Yaw-aware navigator: position PID → desired attitude + thrust.
// Outer loop of the cascaded two-controller architecture.
//
// Changes from quad-l2 fc_navigator:
//   1. yaw_des tracks the horizontal direction to the current target:
//        yaw_des = atan2(target.z − pos.z, target.x − pos.x)
//      When the target is directly overhead (horizontal dist² < 0.01 m²), the
//      current attitude.y is returned so the drone holds its last heading at hover.
//   2. World-frame acceleration demands are rotated into the body frame using the
//      current yaw ψ before the small-angle pitch/roll mapping:
//
//        pitch_des = (−cos ψ · ax_des + sin ψ · az_des) / g_eff
//        roll_des  = ( sin ψ · ax_des + cos ψ · az_des) / g_eff
//
//      At ψ = 0 this reduces to the standard pitch_des = −ax/g, roll_des = az/g.
//      The derivation: the 2×2 matrix mapping [θ, φ] to [ax, az]/g under yaw ψ
//      has determinant −1 and is its own inverse, giving the closed-form above.
//
// Attitude convention (shared with world/stabilizer):
//   attitude.x = roll  φ  (positive → left side up  → thrust tilts +Z)
//   attitude.z = pitch θ  (positive → nose up        → thrust tilts -X)
//   attitude.y = yaw   ψ  (positive → turn left CCW)

type Vec3 = { x: number; y: number; z: number };
type FcNavIn = {
  pos: Vec3; vel: Vec3; attitude: Vec3; target: Vec3; armed: number;
  integralPos: Vec3;
};
type FcNavOut = {
  roll_des: number; pitch_des: number; yaw_des: number; thrust: number;
  integralPos: Vec3;
};

const KP_POS = 2.0;
const KI_POS = 0;    // zero: no wind or drag in this model; tune when disturbances are added
const KD_POS = 1.5;

const MASS    = 1.0;
const GRAVITY = 9.81;
const DT      = 0.05;
const MAX_TILT = 0.3;  // max desired roll/pitch (rad, ~17°)

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc_navigator(state: FcNavIn): FcNavOut {
  const zero3: Vec3 = { x: 0, y: 0, z: 0 };
  if (!state.armed) return { roll_des: 0, pitch_des: 0, yaw_des: 0, thrust: 0, integralPos: zero3 };

  const ex = state.target.x - state.pos.x;
  const ey = state.target.y - state.pos.y;
  const ez = state.target.z - state.pos.z;

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

  // Yaw setpoint: face the horizontal direction to the current target.
  // Fall back to current heading when the target is directly overhead.
  const hd2 = ex * ex + ez * ez;
  // Negate ez: positive yaw = CCW from above = nose toward -Z, so the angle to a
  // +Z target must be negative (CW). atan2(-ez, ex) gives the correct signed heading.
  const yaw_des = hd2 > 0.01 ? Math.atan2(-ez, ex) : state.attitude.y;

  return {
    roll_des, pitch_des, yaw_des, thrust,
    integralPos: {
      x: state.integralPos.x + ex * DT,
      y: state.integralPos.y + ey * DT,
      z: state.integralPos.z + ez * DT,
    },
  };
}
