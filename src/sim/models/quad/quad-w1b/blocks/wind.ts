// Random wind gusts. Generates a new gust — random horizontal direction
// and magnitude — whenever the current gust's duration expires.
// Wind state lives at top-level state.wind (shared pattern from floater-pid).

type WindIn = { fx: number; fz: number; ticksLeft: number };
type WindOut = { fx: number; fz: number; ticksLeft: number };

const FORCE_MAX_PCT = 15;         // % of peak — increase to make wind stronger
const WIND_MAX_N = 10;            // scale matches 4×MAX_THRUST_N at 100 %
const DURATION_MIN_TICKS = 200;   // 5 s at 20 Hz
const DURATION_MAX_TICKS = 800;   // 20 s at 20 Hz

export function wind(state: WindIn): WindOut {
  if (state.ticksLeft > 0) {
    return { fx: state.fx, fz: state.fz, ticksLeft: state.ticksLeft - 1 };
  }
  const maxN = (FORCE_MAX_PCT / 100) * WIND_MAX_N;
  const angle = Math.random() * 2 * Math.PI;
  const magnitude = Math.random() * maxN;
  const ticks = Math.floor(
    DURATION_MIN_TICKS + Math.random() * (DURATION_MAX_TICKS - DURATION_MIN_TICKS),
  );
  return {
    fx: magnitude * Math.cos(angle),
    fz: magnitude * Math.sin(angle),
    ticksLeft: ticks,
  };
}
