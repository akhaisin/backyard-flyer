// fc_acro — single-mode flight controller. Always treats inputs as AETR sticks.
//
// AETR conventions (sign = direction of body-frame rate produced; the inverse
// of navigator_wp's normalization):
//   throttle ∈ [0, 1]    raw throttle, per-motor base in Newtons via × MAX_THRUST_N
//   roll   ∈ [-1, 1]     +1 = roll right (attitude.x positive)
//   pitch  ∈ [-1, 1]     +1 = pitch back / nose up (attitude.z positive)
//                        NOTE: opposite of typical Mode-2 elevator stick. The
//                        internal AETR bus follows the sim's body-rate sign,
//                        not transmitter convention.
//   yaw    ∈ [-1, 1]     +1 = yaw right (attitude.y positive)
//
// Inner loop: pure-P rate PID on each axis. tau = KP_RATE × (stick × MAX_RATE − measured_rate).
// No attitude memory — drone holds attitude only because the upstream navigator
// stops commanding rate. Canonical FPV "acro mode".
//
// Tunables (MAX_RATE_*, KP_*, MAX_THRUST_N, ARM, K_DRAG) arrive via state.K from
// the params block. navigator_wp inverts the MAX_RATE mapping using the SAME K,
// so the two stay in sync by construction.

type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type Vec3    = { x: number; y: number; z: number };
type FcConsts = {
  MAX_RATE_ROLL_PITCH: number;
  MAX_RATE_YAW: number;
  KP_RATE: number;
  KP_RATE_YAW: number;
  MAX_THRUST_N: number;
  ARM: number;
  K_DRAG: number;
};

type FcIn = {
  angularVel: Vec3;
  armed: number;
  aetrThrottle: number;
  aetrRoll:   number;
  aetrPitch:  number;
  aetrYaw:    number;
  K: FcConsts;
};
type FcOut = { motors: Motors4 };

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

export function fc_acro(state: FcIn): FcOut {
  if (!state.armed) return { motors: { m0: 0, m1: 0, m2: 0, m3: 0 } };

  const K = state.K;

  const rate_roll_des  = state.aetrRoll  * K.MAX_RATE_ROLL_PITCH;
  const rate_pitch_des = state.aetrPitch * K.MAX_RATE_ROLL_PITCH;
  const rate_yaw_des   = -state.aetrYaw  * K.MAX_RATE_YAW;

  const tau_roll  = K.KP_RATE     * (rate_roll_des  - state.angularVel.x);
  const tau_pitch = K.KP_RATE     * (rate_pitch_des - state.angularVel.z);
  const tau_yaw   = K.KP_RATE_YAW * (rate_yaw_des   - state.angularVel.y);

  const base = state.aetrThrottle * K.MAX_THRUST_N;
  const dr = tau_roll  / (4 * K.ARM);
  const dp = tau_pitch / (4 * K.ARM);
  const dy = tau_yaw   / (4 * K.K_DRAG);

  const k = 1 / K.MAX_THRUST_N;
  return {
    motors: {
      m0: clamp01((base + dr + dp - dy) * k),
      m1: clamp01((base - dr + dp + dy) * k),
      m2: clamp01((base - dr - dp - dy) * k),
      m3: clamp01((base + dr - dp + dy) * k),
    },
  };
}
