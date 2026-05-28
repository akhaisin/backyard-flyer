// Random wind gusts. Generates a new gust — random horizontal direction
// and magnitude — whenever the current gust's duration expires.
// The first season (season === 0) uses FORCE_INITIAL_PCT so the quad can
// stabilize before full-strength wind arrives.
// Wind state lives at top-level state.wind (shared pattern from floater-pid).

type WindIn = { fx: number; fz: number; ticksLeft: number; season: number };
type WindOut = { fx: number; fz: number; ticksLeft: number; season: number };

const FORCE_INITIAL_PCT = 5;          // % of peak — first season only, lets quad stabilize
const FORCE_MAX_PCT = 30;             // % of peak — increase to make wind stronger
const WIND_MAX_N = 20;                // scale matches 4×MAX_THRUST_N at 100 %
const DURATION_MIN_TICKS = 100;       // 5 s at 20 Hz
const DURATION_MAX_TICKS = 300;       // 20 s at 20 Hz

export function wind(state: WindIn): WindOut {
  if (state.ticksLeft > 0) {
    return { fx: state.fx, fz: state.fz, ticksLeft: state.ticksLeft - 1, season: state.season };
  }
  const pct = state.season === 0 ? FORCE_INITIAL_PCT : FORCE_MAX_PCT;
  const maxN = (pct / 100) * WIND_MAX_N;
  const angle = Math.random() * 2 * Math.PI;
  const magnitude = Math.random() * maxN;
  const ticks = Math.floor(
    DURATION_MIN_TICKS + Math.random() * (DURATION_MAX_TICKS - DURATION_MIN_TICKS),
  );
  return {
    fx: magnitude * Math.cos(angle),
    fz: magnitude * Math.sin(angle),
    ticksLeft: ticks,
    season: state.season + 1,
  };
}
