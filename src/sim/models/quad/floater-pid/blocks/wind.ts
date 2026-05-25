// Random wind gusts. Generates a new gust — random horizontal direction
// and magnitude — whenever the current gust's duration expires.
// Both vehicles share this single wind state via top-level state.wind.

type WindIn = { fx: number; fz: number; ticksLeft: number };
type WindOut = { fx: number; fz: number; ticksLeft: number };

// Knobs (each expressed as a percentage where applicable):
const FORCE_MAX_PCT = 5;        // 0 = calm, 100 = peak gust equals MAX_THRUST_N
const WIND_MAX_N = 30;           // scale matches MAX_THRUST_N at 100 %
const DURATION_MIN_TICKS = 150;   // 1 s at 20 Hz
const DURATION_MAX_TICKS = 300;  // 10 s at 20 Hz

export function wind(state: WindIn): WindOut {
  if (state.ticksLeft > 0) {
    return { fx: state.fx, fz: state.fz, ticksLeft: state.ticksLeft - 1 };
  }
  // Current gust expired — sample a new one.
  const maxN = (FORCE_MAX_PCT / 100) * WIND_MAX_N;
  const angle = Math.random() * 2 * Math.PI;          // horizontal direction
  const magnitude = Math.random() * maxN;              // 0 .. maxN
  const ticks = Math.floor(
    DURATION_MIN_TICKS + Math.random() * (DURATION_MAX_TICKS - DURATION_MIN_TICKS),
  );
  return {
    fx: magnitude * Math.cos(angle),
    fz: magnitude * Math.sin(angle),
    ticksLeft: ticks,
  };
}
