// Hardware: 4 fixed-direction motors with spool-up inertia.
// Each motor points straight up in the body frame.
// Input:  desired motor power (0–1) per motor from FC.
// Output: actual thrust force (N) per motor after slew-rate limiting.
//
// Tunables (MAX_THRUST_N, THRUST_RATE_N_PER_S, DT) arrive via state.K.

type Motors4 = { m0: number; m1: number; m2: number; m3: number };
type HwConsts = {
  MAX_THRUST_N: number;
  THRUST_RATE_N_PER_S: number;
  DT: number;
};

type HwIn = { motors: Motors4; thrustPrev: Motors4; K: HwConsts };
type HwOut = { thrust: Motors4 };

function slew(desired: number, current: number, maxDelta: number): number {
  return current + Math.max(-maxDelta, Math.min(maxDelta, desired - current));
}

export function hw(state: HwIn): HwOut {
  const K = state.K;
  const maxDelta = K.THRUST_RATE_N_PER_S * K.DT;
  const des = state.motors;
  const prev = state.thrustPrev;
  return {
    thrust: {
      m0: slew(des.m0 * K.MAX_THRUST_N, prev.m0, maxDelta),
      m1: slew(des.m1 * K.MAX_THRUST_N, prev.m1, maxDelta),
      m2: slew(des.m2 * K.MAX_THRUST_N, prev.m2, maxDelta),
      m3: slew(des.m3 * K.MAX_THRUST_N, prev.m3, maxDelta),
    },
  };
}
