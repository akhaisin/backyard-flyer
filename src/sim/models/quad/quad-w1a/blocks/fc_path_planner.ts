// Carrot-and-stick path planner. Sits between the mission (which owns windows) and
// fc_navigator (which owns position PID).
//
// The "carrot" is a virtual waypoint placed LOOKAHEAD metres ahead of the drone along
// the straight-line path from current position to the next window center.  When the
// drone is already closer than LOOKAHEAD the carrot collapses to the window center,
// keeping the drone on track for the gate crossing without overshooting.
//
// yawSetpoint is driven toward the window normal direction (rate-limited to MAX_YAW_RATE).
// Using the window normal rather than the carrot direction avoids oscillation near the gate —
// the carrot direction can flip 180° if the drone overshoots, but the normal is fixed.

type Vec3 = { x: number; y: number; z: number };

type PlannerIn = {
  pos: Vec3;
  windowCenter: Vec3;
  windowNormal: Vec3;
  armed: number;
  phase: number;
  yawSetpoint: number;   // previous setpoint — kept when advancing toward same gate
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
};

const LOOKAHEAD      = 4.0;   // metres ahead on path to window
const NAVIGATE       = 2;
const MAX_YAW_RATE   = Math.PI / 2;  // rad/s — 90 °/s ceiling
const DT             = 0.05;
const MAX_YAW_DELTA  = MAX_YAW_RATE * DT;

function stepYaw(target: number, prev: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-MAX_YAW_DELTA, Math.min(MAX_YAW_DELTA, diff));
}

export function fc_path_planner(state: PlannerIn): PlannerOut {
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
    return { carrot: state.windowCenter, yawSetpoint };
  }

  const dx = state.windowCenter.x - state.pos.x;
  const dy = state.windowCenter.y - state.pos.y;
  const dz = state.windowCenter.z - state.pos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist <= LOOKAHEAD) {
    return { carrot: state.windowCenter, yawSetpoint };
  }

  const t = LOOKAHEAD / dist;
  return {
    carrot: {
      x: state.pos.x + dx * t,
      y: state.pos.y + dy * t,
      z: state.pos.z + dz * t,
    },
    yawSetpoint,
  };
}
