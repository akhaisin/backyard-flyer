// Cascaded position + attitude controller for X-configuration quadrotor.
// Outer loop: position error → desired total thrust + desired roll/pitch angles.
// Inner loop: attitude error → desired torques → motor mixing.
//
// Motor layout (top view, X = forward, Z = right):
//   M0(CCW) · M1(CW)     M0: front-left  (+X, -Z)
//       \   /             M1: front-right (+X, +Z)
//       /   \             M2: rear-right  (-X, +Z)
//   M3(CW)  · M2(CCW)    M3: rear-left   (-X, -Z)
//
// Attitude convention (attitude.x = roll φ, attitude.y = yaw ψ, attitude.z = pitch θ):
//   roll  φ > 0 → left side up  → thrust tilts +Z (right)
//   pitch θ > 0 → nose up       → thrust tilts -X (backward)
//   yaw   ψ > 0 → turn left (CCW from above)

type Vec3 = { x: number; y: number; z: number };
type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type FcIn = { pos: Vec3; vel: Vec3; attitude: Vec3; angularVel: Vec3; target: Vec3; armed: number };
type FcOut = { motors: Motors4 };

const KP_POS = 2.0;
const KD_POS = 1.5;
const KP_ATT = 2.0;
const KD_ATT = 0.2;
const MASS = 1.0;
const GRAVITY = 9.81;
const MAX_THRUST_N = 10;   // per motor; total max = 40 N
const ARM = 0.2;           // motor arm length (m)
const K_DRAG = 0.02;       // yaw reactive torque coefficient (N·m / N)
const MAX_TILT = 0.3;      // max desired roll/pitch (rad, ~17°) — keeps motors out of saturation

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

export function fc(state: FcIn): FcOut {
  if (!state.armed) return { motors: { m0: 0, m1: 0, m2: 0, m3: 0 } };

  // --- Position loop → desired accelerations ---
  const ax_des = KP_POS * (state.target.x - state.pos.x) - KD_POS * state.vel.x;
  const ay_des = KP_POS * (state.target.y - state.pos.y) - KD_POS * state.vel.y;
  const az_des = KP_POS * (state.target.z - state.pos.z) - KD_POS * state.vel.z;

  // Thrust compensation: when tilted, vertical component = F_total·cos(roll)·cos(pitch).
  // Divide by the current tilt factor so altitude is maintained through manoeuvres.
  const tilt_cos = Math.max(Math.cos(state.attitude.x) * Math.cos(state.attitude.z), 0.2);
  const f_total = Math.max(0, MASS * (ay_des + GRAVITY) / tilt_cos);

  // Desired tilt angles (small-angle: sin θ ≈ θ), clamped to keep motors unsaturated.
  // pitch θ = -ax / (f_total/MASS)  →  negative pitch (nose down) gives +X force
  // roll  φ =  az / (f_total/MASS)  →  positive roll (left up)    gives +Z force
  const g_eff = Math.max(f_total / MASS, 1.0);
  const pitch_des = clamp(-ax_des / g_eff, MAX_TILT);
  const roll_des  = clamp( az_des / g_eff, MAX_TILT);

  // --- Attitude loop → desired torques ---
  const tau_roll  = KP_ATT * (roll_des  - state.attitude.x) - KD_ATT * state.angularVel.x;
  const tau_pitch = KP_ATT * (pitch_des - state.attitude.z) - KD_ATT * state.angularVel.z;
  const tau_yaw   = KP_ATT * (0         - state.attitude.y) - KD_ATT * state.angularVel.y;

  // --- Motor mixing (inverse of torque equations) ---
  // τ_roll  = ARM * (F0 - F1 - F2 + F3)
  // τ_pitch = ARM * (F0 + F1 - F2 - F3)
  // τ_yaw   = K_DRAG * (-F0 + F1 - F2 + F3)
  const base = f_total / 4;
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
  };
}
