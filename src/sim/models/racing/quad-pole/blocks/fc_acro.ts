// fc_acro — single-mode flight controller. Always treats inputs as AETR sticks.
//
// Mode-2 RC semantics:
//   thrust ∈ [0, 1]              raw throttle (per-motor base in Newtons)
//   roll/pitch/yaw ∈ [-1, 1]     body-frame rate-stick deflection
//
// Inner loop: pure-P rate PID on each axis. tau = KP_RATE × (stick × MAX_RATE − measured_rate).
// No attitude memory — drone holds attitude only because the upstream navigator
// (or human pilot) stops commanding rate. This is the canonical FPV "acro mode".
// An angle/horizon-mode variant (fc_angle) would integrate stick into a held
// attitude target; that's a future model, not this one.
//
// MAX_RATE_* constants are the FC's interpretation of stick = ±1. navigator_wp
// inverts this mapping (rate / MAX_RATE → stick), so the two MUST stay in sync.
//
// Motor layout (top view, X = forward, Z = right):
//   M0(CCW) · M1(CW)     M0: front-left, M1: front-right, M2: rear-right, M3: rear-left

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

// Gains in Nm per rad/s of rate error.
// KP_RATE = 0.05 with I_XX = 0.01 gives ~5 rad/s² accel per 1 rad/s rate error
// (≈ 0.2 s rate time constant). At full stick (rate_des = π rad/s, actual = 0)
// the resulting tau ≈ 0.157 Nm produces ~15.7 rad/s² — fast but well below
// motor-saturation regime.
const KP_RATE     = 0.05;
const KP_RATE_YAW = 0.012;   // yaw torque is drag-based; lower authority

// Stick = ±1 maps to these body rates. Must equal navigator_wp's matching constants.
const MAX_RATE_ROLL_PITCH = Math.PI;        // 180 °/s
const MAX_RATE_YAW        = Math.PI / 2;    //  90 °/s

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
