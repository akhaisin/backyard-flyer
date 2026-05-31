// Waypoint planner + completion checker.
//
// Produces a lookahead carrot along the line to step.pos, plus a rate-limited
// yaw setpoint facing the target. Reports stepStatus to mission each tick:
//   STATUS_COMPLETED when in PHASE_NAVIGATE and within step.threshold,
//   STATUS_RUNNING   otherwise.
//
// Outside PHASE_NAVIGATE the carrot is pinned to the target (no lookahead)
// and the yaw setpoint keeps moving so the cascade is already pointed when
// NAVIGATE starts.

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

const LOOKAHEAD = 3.0;
const NAVIGATE  = 2;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

const MAX_YAW_RATE  = Math.PI / 2;
const DT            = 0.05;
const MAX_YAW_DELTA = MAX_YAW_RATE * DT;

// Freeze the yaw setpoint when within this distance of the target. atan2(dz, dx)
// becomes pathologically sensitive as the position-error vector shrinks: a 5 cm
// overshoot at 50 cm range = ~6° yaw swing; the same overshoot at 5 cm range =
// ~90°+. 2.0 m gives the cascade time to settle on the approach heading before
// threshold effects kick in.
const YAW_FREEZE_RANGE = 2.0;

function carrotAlong(pos: Vec3, target: Vec3): Vec3 {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= LOOKAHEAD) return target;
  const t = LOOKAHEAD / d;
  return { x: pos.x + dx * t, y: pos.y + dy * t, z: pos.z + dz * t };
}

function stepYaw(target: number, prev: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-MAX_YAW_DELTA, Math.min(MAX_YAW_DELTA, diff));
}

function step_complete_check(pos: Vec3, step: Step): boolean {
  const dx = step.pos.x - pos.x;
  const dy = step.pos.y - pos.y;
  const dz = step.pos.z - pos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < step.threshold;
}

export function planner_wp(state: PlannerIn): PlannerOut {
  const target = state.step.pos;

  let yawSetpoint = state.yawSetpoint;
  // Yaw points toward the target's horizontal direction. Negate dz because the
  // sim's yaw convention is CCW-positive viewed from above: a +Z target needs
  // a negative heading (cf. quad-l3 fc_navigator).
  const dx = target.x - state.pos.x;
  const dz = target.z - state.pos.z;
  if (Math.sqrt(dx * dx + dz * dz) >= YAW_FREEZE_RANGE) {
    yawSetpoint = stepYaw(Math.atan2(-dz, dx), state.yawSetpoint);
  }

  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;
  const stepStatus = navigating && step_complete_check(state.pos, state.step)
    ? STATUS_COMPLETED
    : STATUS_RUNNING;

  if (!navigating) {
    return { carrot: target, yawSetpoint, stepStatus };
  }

  return { carrot: carrotAlong(state.pos, target), yawSetpoint, stepStatus };
}
