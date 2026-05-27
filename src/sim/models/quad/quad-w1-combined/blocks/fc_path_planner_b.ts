// Pre-gate staging path planner. Improvement over w1a's pure carrot-and-stick.
//
// Problem with a pure distance check: once the drone passes the pre-gate and
// starts moving toward the window center, distToPreGate grows back above the
// threshold, snapping the target back to the pre-gate — causing oscillation.
//
// Fix: persist a `preGateDone` flag in state. It is set when the drone first
// closes to within PREGATE_THRESHOLD of the pre-gate, and is reset only when
// `windowIdx` changes (new gate). Until it is set, target = pre-gate.
// After it is set, target = window center.

type Vec3 = { x: number; y: number; z: number };

type PlannerIn = {
  pos: Vec3;
  windowCenter: Vec3;
  windowNormal: Vec3;
  windowIdx: number;
  armed: number;
  phase: number;
  preGateDone: number;    // 0 | 1 — persisted across ticks
  activeWindowIdx: number; // window index for which preGateDone was set
};

type PlannerOut = {
  carrot: Vec3;
  preGateDone: number;
  activeWindowIdx: number;
};

const LOOKAHEAD          = 4.0;   // metres ahead on path to current target
const ENTRY_DIST         = 5.0;   // metres in front of gate along normal (staging point)
const PREGATE_THRESHOLD  = 1.5;   // metres — triggers preGateDone when drone is this close
const NAVIGATE           = 2;

export function fc_path_planner(state: PlannerIn): PlannerOut {
  const winIdx = Math.round(state.windowIdx);

  if (!state.armed || Math.round(state.phase) !== NAVIGATE) {
    return { carrot: state.windowCenter, preGateDone: 0, activeWindowIdx: winIdx };
  }

  // Detect window change — reset the pre-gate flag for the new gate.
  const preGateDone   = winIdx !== Math.round(state.activeWindowIdx) ? 0 : Math.round(state.preGateDone);
  const activeWinIdx  = winIdx;

  // Pre-gate: ENTRY_DIST on the approach side of the gate (opposite to normal).
  const preGate: Vec3 = {
    x: state.windowCenter.x - ENTRY_DIST * state.windowNormal.x,
    y: state.windowCenter.y - ENTRY_DIST * state.windowNormal.y,
    z: state.windowCenter.z - ENTRY_DIST * state.windowNormal.z,
  };

  // Latch preGateDone the first tick the drone is close enough.
  const pgx = preGate.x - state.pos.x;
  const pgy = preGate.y - state.pos.y;
  const pgz = preGate.z - state.pos.z;
  const distToPreGate = Math.sqrt(pgx * pgx + pgy * pgy + pgz * pgz);
  const done = preGateDone === 1 || distToPreGate <= PREGATE_THRESHOLD ? 1 : 0;

  const target = done === 1 ? state.windowCenter : preGate;

  // Place carrot LOOKAHEAD metres along the path to the chosen target.
  const dx = target.x - state.pos.x;
  const dy = target.y - state.pos.y;
  const dz = target.z - state.pos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist <= LOOKAHEAD) {
    return { carrot: target, preGateDone: done, activeWindowIdx: activeWinIdx };
  }

  const t = LOOKAHEAD / dist;
  return {
    carrot: {
      x: state.pos.x + dx * t,
      y: state.pos.y + dy * t,
      z: state.pos.z + dz * t,
    },
    preGateDone:     done,
    activeWindowIdx: activeWinIdx,
  };
}
