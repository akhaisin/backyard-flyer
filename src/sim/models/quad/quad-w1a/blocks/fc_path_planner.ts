// Carrot-and-stick path planner. Sits between the mission (which owns windows) and
// fc_navigator (which owns position PID).
//
// The "carrot" is a virtual waypoint placed LOOKAHEAD metres ahead of the drone along
// the straight-line path from current position to the next window center.  When the
// drone is already closer than LOOKAHEAD the carrot collapses to the window center,
// keeping the drone on track for the gate crossing without overshooting.
//
// This separation lets fc_navigator run a pure PID to an always-moving point, which
// produces smoother flight than jerky target-switch-on-arrival used for static waypoints.

type Vec3 = { x: number; y: number; z: number };

type PlannerIn = {
  pos: Vec3;
  windowCenter: Vec3;
  windowNormal: Vec3;
  armed: number;
  phase: number;
};

type PlannerOut = {
  carrot: Vec3;
};

const LOOKAHEAD   = 4.0;   // metres ahead on path to window
const NAVIGATE    = 2;

export function fc_path_planner(state: PlannerIn): PlannerOut {
  if (!state.armed || Math.round(state.phase) !== NAVIGATE) {
    // Outside navigate: carrot = window center (used as passthrough target for other phases)
    return { carrot: state.windowCenter };
  }

  const dx = state.windowCenter.x - state.pos.x;
  const dy = state.windowCenter.y - state.pos.y;
  const dz = state.windowCenter.z - state.pos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist <= LOOKAHEAD) {
    // Close enough — drive straight to gate center so we actually cross it.
    return { carrot: state.windowCenter };
  }

  // Place carrot LOOKAHEAD metres along the path.
  const t = LOOKAHEAD / dist;
  return {
    carrot: {
      x: state.pos.x + dx * t,
      y: state.pos.y + dy * t,
      z: state.pos.z + dz * t,
    },
  };
}
