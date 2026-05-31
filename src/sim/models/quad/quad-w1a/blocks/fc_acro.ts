// fc_acro — single-mode flight controller. Always treats inputs as AETR sticks.
//
// AETR conventions (sign = direction of body-frame rate produced):
//   thrust ∈ [0, 1]      raw throttle, per-motor base in Newtons via × MAX_THRUST_N
//   roll   ∈ [-1, 1]     +1 = roll right (attitude.x positive)
//   pitch  ∈ [-1, 1]     +1 = pitch back / nose up (attitude.z positive)
//   yaw    ∈ [-1, 1]     +1 = yaw right (attitude.y positive)
//
// Inner loop: pure-P rate PID on each axis.
//   tau = KP_RATE × (stick × MAX_RATE − measured_rate)
//
// No attitude memory — drone holds attitude only because navigator_window
// stops commanding rate. Canonical FPV "acro mode". MAX_RATE_* constants
// MUST match navigator_window's matching constants.

type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type Vec3    = { x: number; y: number; z: number };

type FcIn = {
  angularVel: Vec3;
  armed: number;
  aetrThrust: number;
  aetrRoll:   number;
  aetrPitch:  number;
  aetrYaw:    number;
};
type FcOut = { motors: Motors4 };

const KP_RATE     = 0.05;
const KP_RATE_YAW = 0.012;

const MAX_RATE_ROLL_PITCH = Math.PI;
const MAX_RATE_YAW        = Math.PI / 2;

const MAX_THRUST_N = 10;
const ARM    = 0.2;
const K_DRAG = 0.02;

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export function fc_acro(state: FcIn): FcOut {
  if (!state.armed) return { motors: { m0: 0, m1: 0, m2: 0, m3: 0 } };

  const rate_roll_des  = state.aetrRoll  * MAX_RATE_ROLL_PITCH;
  const rate_pitch_des = state.aetrPitch * MAX_RATE_ROLL_PITCH;
  const rate_yaw_des   = state.aetrYaw   * MAX_RATE_YAW;

  const tau_roll  = KP_RATE     * (rate_roll_des  - state.angularVel.x);
  const tau_pitch = KP_RATE     * (rate_pitch_des - state.angularVel.z);
  const tau_yaw   = KP_RATE_YAW * (rate_yaw_des   - state.angularVel.y);

  const base = state.aetrThrust * MAX_THRUST_N;
  const dr = tau_roll  / (4 * ARM);
  const dp = tau_pitch / (4 * ARM);
  const dy = tau_yaw   / (4 * K_DRAG);

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
