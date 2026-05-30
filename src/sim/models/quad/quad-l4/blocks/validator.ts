// Cross-track error tracker. Path-agnostic: mission emits the current active
// segment as (segStart, segEnd); this block measures perpendicular distance
// from drone position to that segment during NAVIGATE, then commits the lap
// mean on NAVIGATE → other transition.

type Vec3 = { x: number; y: number; z: number };

type ValidatorIn = {
  pos: Vec3;
  phase: number;
  segStart: Vec3;
  segEnd: Vec3;
  prevPhase: number;
  lapsTotal: number;
  lapErrSum: number;
  lapErrTicks: number;
  totalLapErrSum: number;
  pass: number;
};

type ValidatorOut = {
  prevPhase: number;
  lapsTotal: number;
  lapErrSum: number;
  lapErrTicks: number;
  totalLapErrSum: number;
  lapErr: number;
  avgErr: number;
  currentErr: number;
  pass: number;
};

const NAVIGATE = 2;
// Acceptance threshold for avgErr. Once exceeded the run is marked failed
// (sticky) — a regression detector for tuning changes.
const PASS_AVG_ERR_LIMIT = 2.0;

function distPointToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  const t = ab2 > 0
    ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / ab2))
    : 0;
  const cx = a.x + t * abx, cy = a.y + t * aby, cz = a.z + t * abz;
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function validator(state: ValidatorIn): ValidatorOut {
  const phase = Math.round(state.phase);
  const prevPhase = Math.round(state.prevPhase);

  let lapsTotal      = state.lapsTotal;
  let lapErrSum      = state.lapErrSum;
  let lapErrTicks    = state.lapErrTicks;
  let totalLapErrSum = state.totalLapErrSum;

  if (prevPhase === NAVIGATE && phase !== NAVIGATE && lapErrTicks > 0) {
    totalLapErrSum += lapErrSum / lapErrTicks;
    lapsTotal += 1;
    lapErrSum = 0;
    lapErrTicks = 0;
  }

  const currentErr = phase === NAVIGATE
    ? distPointToSegment(state.pos, state.segStart, state.segEnd)
    : 0;

  if (phase === NAVIGATE) {
    lapErrSum += currentErr;
    lapErrTicks += 1;
  }

  const avgErr = lapsTotal > 0 ? totalLapErrSum / lapsTotal : 0;
  // Sticky pass/fail: once avgErr breaches the limit the run is failed for
  // the rest of the session, even if later laps drag the average back down.
  const pass = state.pass !== 0 && avgErr <= PASS_AVG_ERR_LIMIT ? 1 : 0;

  return {
    prevPhase: phase,
    lapsTotal,
    lapErrSum,
    lapErrTicks,
    totalLapErrSum,
    lapErr: lapErrTicks > 0 ? lapErrSum / lapErrTicks : 0,
    avgErr,
    currentErr,
    pass,
  };
}
