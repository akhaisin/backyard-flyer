// Pre-gate staging path planner (vehicle B). Identical to quad-w1b fc_path_planner.
//
// yawSetpoint is driven toward the window normal direction (rate-limited to MAX_YAW_RATE).
// Using the window normal rather than the carrot direction avoids oscillation near the gate —
// the carrot direction can flip 180° if the drone overshoots, but the normal is fixed.

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
  yawSetpoint: number;
};

type PlannerOut = {
  carrot: Vec3;
  preGateDone: number;
  activeWindowIdx: number;
  yawSetpoint: number;
};

const LOOKAHEAD          = 4.0;   // metres ahead on path to current target
const ENTRY_DIST         = 5.0;   // metres in front of gate along normal (staging point)
const PREGATE_THRESHOLD  = 1.5;   // metres — triggers preGateDone when drone is this close
const NAVIGATE           = 2;
const MAX_YAW_RATE       = Math.PI / 2;
const DT                 = 0.05;
const MAX_YAW_DELTA      = MAX_YAW_RATE * DT;

function stepYaw(target: number, prev: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-MAX_YAW_DELTA, Math.min(MAX_YAW_DELTA, diff));
}

export function fc_path_planner(state: PlannerIn): PlannerOut {
  const winIdx = Math.round(state.windowIdx);

  // During NAVIGATE: face the gate crossing direction (window normal).
  // All other phases (MISSED, RTH, LAND, TAKEOFF, …): face toward the current target.
  let yawTarget: number;
  if (Math.round(state.phase) === NAVIGATE) {
    yawTarget = Math.atan2(-state.windowNormal.z, state.windowNormal.x);
  } else {
    const dx = state.windowCenter.x - state.pos.x;
    const dz = state.windowCenter.z - state.pos.z;
    yawTarget = Math.sqrt(dx * dx + dz * dz) > 0.5
      ? Math.atan2(-dz, dx)
      : state.yawSetpoint;
  }
  const yawSetpoint = stepYaw(yawTarget, state.yawSetpoint);

  if (!state.armed || Math.round(state.phase) !== NAVIGATE) {
    return { carrot: state.windowCenter, preGateDone: 0, activeWindowIdx: winIdx, yawSetpoint };
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
    return { carrot: target, preGateDone: done, activeWindowIdx: activeWinIdx, yawSetpoint };
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
    yawSetpoint,
  };
}
