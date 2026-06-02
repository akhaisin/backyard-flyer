// Waypoint completion checker for the simple waypoint stack.
//
// planner_wp owns only step completion: once the vehicle is within
// step.threshold, it reports COMPLETED so mission advances. The actual steering
// toward the waypoint lives in navigator_wp.
//
// It is active in PHASE_NAVIGATE (waypoint models) and PHASE_RESTART (window
// models, where it watches the fly-back to a missed gate's start anchor — the
// anchor mission emits during recovery is a plain proximity waypoint). Window
// steps carry no threshold, so a NAVIGATE-phase window step never trips this.
//
// NAVIGATE / RESTART / STATUS_* are protocol enums (the mission contract) and
// stay here.

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; threshold: number };

type PlannerIn = {
  pos: Vec3;
  step: Step;
  armed: number;
  phase: number;
};

type PlannerOut = {
  stepStatus: number;
};

const NAVIGATE  = 2;
const RESTART   = 7;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function planner_wp(state: PlannerIn): PlannerOut {
  const reached = dist3(state.pos, state.step.pos) < state.step.threshold;
  const phase = Math.round(state.phase);
  const navigating = !!state.armed && (phase === NAVIGATE || phase === RESTART);
  const stepStatus = navigating && reached ? STATUS_COMPLETED : STATUS_RUNNING;

  return { stepStatus };
}
