// Random wind gusts. Generates a new gust with random horizontal direction
// and magnitude whenever the current gust duration expires.

type WindConsts = {
  WIND_FORCE_INITIAL_PCT: number;
  WIND_FORCE_MAX_PCT: number;
  WIND_MAX_N: number;
  WIND_DURATION_MIN_TICKS: number;
  WIND_DURATION_MAX_TICKS: number;
};

type WindIn = { fx: number; fz: number; ticksLeft: number; season: number; K: WindConsts };
type WindOut = { fx: number; fz: number; ticksLeft: number; season: number };

export function wind(state: WindIn): WindOut {
  const K = state.K;
  if (state.ticksLeft > 0) {
    return { fx: state.fx, fz: state.fz, ticksLeft: state.ticksLeft - 1, season: state.season };
  }
  const pct = state.season === 0 ? K.WIND_FORCE_INITIAL_PCT : K.WIND_FORCE_MAX_PCT;
  const maxN = (pct / 100) * K.WIND_MAX_N;
  const angle = Math.random() * 2 * Math.PI;
  const magnitude = Math.random() * maxN;
  const ticks = Math.floor(
    K.WIND_DURATION_MIN_TICKS + Math.random() * (K.WIND_DURATION_MAX_TICKS - K.WIND_DURATION_MIN_TICKS),
  );
  return {
    fx: magnitude * Math.cos(angle),
    fz: magnitude * Math.sin(angle),
    ticksLeft: ticks,
    season: state.season + 1,
  };
}