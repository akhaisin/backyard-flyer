// Cross-track error tracker for window-gate missions. Mission emits the active
// segment (segStart → segEnd, here from one window center to the next during
// NAVIGATE); this block measures perpendicular distance from drone position to
// that segment and commits the lap mean on NAVIGATE → RTH.
//
// Also counts NAVIGATE → MISSED transitions as `misses` (off-frame plane
// crossings). Error accumulation is skipped during MISSED — recovery isn't
// part of the intended path.
//
// Uses TRUE position (s.pos), not noisy sensor pos — ground-truth validation.

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
  misses: number;
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
  misses: number;
};

const NAVIGATE = 2;
const RTH      = 3;
const MISSED   = 7;

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
  let misses         = state.misses;

  // Lap completion: NAVIGATE → RTH (all gates cleared). MISSED is mid-lap.
  if (prevPhase === NAVIGATE && phase === RTH && lapErrTicks > 0) {
    totalLapErrSum += lapErrSum / lapErrTicks;
    lapsTotal += 1;
    lapErrSum = 0;
    lapErrTicks = 0;
  }

  if (prevPhase === NAVIGATE && phase === MISSED) {
    misses += 1;
  }

  const currentErr = phase === NAVIGATE
    ? distPointToSegment(state.pos, state.segStart, state.segEnd)
    : 0;

  if (phase === NAVIGATE) {
    lapErrSum += currentErr;
    lapErrTicks += 1;
  }

  return {
    prevPhase: phase,
    lapsTotal,
    lapErrSum,
    lapErrTicks,
    totalLapErrSum,
    lapErr: lapErrTicks > 0 ? lapErrSum / lapErrTicks : 0,
    avgErr: lapsTotal > 0 ? totalLapErrSum / lapsTotal : 0,
    currentErr,
    misses,
  };
}
