// Waypoint planner + completion checker — the simplest possible waypoint logic:
// fly straight at the next waypoint, face it, and report COMPLETED once within
// step.threshold so mission advances to the next step.
//
//   carrot      = step.pos          (no lookahead — straight at the target)
//   yawSetpoint = atan2 toward the target, frozen once inside step.threshold
//                 (atan2 gets numerically unstable as the position error → 0)
//   stepStatus  = STATUS_COMPLETED when in PHASE_NAVIGATE and within threshold,
//                 STATUS_RUNNING otherwise
//
// No lookahead carrot and no yaw rate-limit (those were carried over from the
// racing planner, which cuts corners and flies coordinated turns — neither is
// wanted here). navigator_wp still reads `carrot`; it is just always the target.
//
// NAVIGATE / STATUS_* are protocol enums (the mission contract) and stay here.

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; threshold: number };

type PlannerIn = {
  pos: Vec3;
  step: Step;
  armed: number;
  phase: number;
  yawSetpoint: number;
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  stepStatus: number;
};

const NAVIGATE  = 2;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function planner_wp(state: PlannerIn): PlannerOut {
  const target = state.step.pos;
  const reached = dist3(state.pos, target) < state.step.threshold;

  // Face the target. Negate dz because the sim's yaw convention is CCW-positive
  // viewed from above: a +Z target needs a negative heading (cf. quad-l3). Hold
  // the last heading once within threshold — atan2 swings wildly as the drone
  // closes the final centimetres on the waypoint.
  let yawSetpoint = state.yawSetpoint;
  if (!reached) {
    const dx = target.x - state.pos.x;
    const dz = target.z - state.pos.z;
    yawSetpoint = Math.atan2(-dz, dx);
  }

  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;
  const stepStatus = navigating && reached ? STATUS_COMPLETED : STATUS_RUNNING;

  return { carrot: target, yawSetpoint, stepStatus };
}
