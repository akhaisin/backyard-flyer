// planner_c1a — direct-pursuit planner for the c1 chase family, variant a.
//
// The simplest possible chase strategy: set the carrot to the target's
// current position each tick. navigator_w1 then drives the quad toward
// the carrot using the same PID cascade used by the window-gate family.
//
// Completion logic (only active in PHASE_NAVIGATE):
//   STATUS_COMPLETED  if quad is within step.threshold of the target
//                     (regardless of whether the target is still moving)
//   STATUS_RESTART    if target has reached its destination (TARGET_ARRIVED)
//                     AND quad is still outside the threshold — target escaped
//   STATUS_RUNNING    otherwise
//
// Yaw tracks the bearing from quad to target in the XZ plane each tick,
// including on STATUS_COMPLETED and STATUS_RESTART, so the drone always
// faces its quarry while navigating.

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; threshold?: number };

type PlannerIn = {
  pos:          Vec3;
  targetPos:    Vec3;
  targetPhase:  number;
  step:         Step;
  armed:        number;
  phase:        number;
  yawSetpoint:  number; // carry-over so navigator has a stable value when not chasing
};

type PlannerOut = {
  carrot:      Vec3;
  yawSetpoint: number;
  stepStatus:  number;
};

const NAVIGATE      = 2;
const TARGET_LAPPED = 2;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;
const STATUS_RESTART   = 3;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function planner_c1a(state: PlannerIn): PlannerOut {
  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;

  if (!navigating) {
    // During PHASE_RESTART mission sets step.pos to the restart anchor (HOME or
    // previous step's pos). Using it as the carrot lets navigator_w1 fly the quad
    // back there so planner_wp can detect arrival via statusReturn. During other
    // non-navigate phases (TAKEOFF, ARMING) step.pos is HOME — also correct.
    const ax = state.step.pos.x - state.pos.x;
    const az = state.step.pos.z - state.pos.z;
    const yaw = (ax * ax + az * az > 0.01) ? Math.atan2(-az, ax) : state.yawSetpoint;
    return { carrot: state.step.pos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING };
  }

  const threshold   = state.step.threshold ?? 2.5;
  const d           = dist3(state.pos, state.targetPos);
  const targetPhase = Math.round(state.targetPhase);

  // Face the target in XZ regardless of step status.
  const dx = state.targetPos.x - state.pos.x;
  const dz = state.targetPos.z - state.pos.z;
  const yawSetpoint = (dx * dx + dz * dz > 0.01)
    ? Math.atan2(-dz, dx)
    : state.yawSetpoint;

  if (d < threshold) {
    return { carrot: state.targetPos, yawSetpoint, stepStatus: STATUS_COMPLETED };
  }

  if (targetPhase === TARGET_LAPPED) {
    return { carrot: state.targetPos, yawSetpoint, stepStatus: STATUS_RESTART };
  }

  return { carrot: state.targetPos, yawSetpoint, stepStatus: STATUS_RUNNING };
}
