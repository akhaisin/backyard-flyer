// Carrot-and-stick path planner + window-crossing completion check.
//
// During PHASE_NAVIGATE this block owns the window-specific bits:
//   • Detect a plane crossing (signed distance flips along step.normal).
//   • Report STATUS_COMPLETED if the crossing happened inside the frame.
//   • Report STATUS_FAILED if the crossing was outside the frame (miss).
//   • Otherwise STATUS_RUNNING.
//
// Outside NAVIGATE the planner does *not* do crossing detection; it just
// emits a carrot toward step.center (which mission sets to HOME, LAND_PAD,
// or the recovery anchor depending on phase).
//
// Yaw setpoint chases the window normal during NAVIGATE (stable target —
// gate orientation doesn't move) and the direct line to step.center during
// recovery/approach phases. Rate-limited to MAX_YAW_RATE.
//
// Persistent state on the planner: windowSide (signed-distance side from the
// previous tick) and activeStepIdx (used to reset windowSide when mission
// advances to a new step).

type Vec3 = { x: number; y: number; z: number };
type Step = { center: Vec3; normal: Vec3; width: number; height: number };

type PlannerIn = {
  pos: Vec3;
  step: Step;
  stepIdx: number;
  armed: number;
  phase: number;
  yawSetpoint: number;
  windowSide: number;     // -1 | 0 | 1, 0 = not yet computed for current step
  activeStepIdx: number;  // step index for which windowSide was sampled
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  stepStatus: number;
  windowSide: number;
  activeStepIdx: number;
};

const LOOKAHEAD     = 4.0;
const NAVIGATE      = 2;
const MAX_YAW_RATE  = Math.PI / 2;
const DT            = 0.05;
const MAX_YAW_DELTA = MAX_YAW_RATE * DT;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;
const STATUS_FAILED    = 2;

function stepYaw(target: number, prev: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-MAX_YAW_DELTA, Math.min(MAX_YAW_DELTA, diff));
}

// Signed distance from pos to step plane (positive = "exit" side along normal).
function sideScore(pos: Vec3, step: Step): number {
  return (pos.x - step.center.x) * step.normal.x
       + (pos.y - step.center.y) * step.normal.y
       + (pos.z - step.center.z) * step.normal.z;
}

// Perpendicular distance from pos to the step plane's center.
function perpDist(pos: Vec3, step: Step): number {
  const score = sideScore(pos, step);
  const rx = (pos.x - step.center.x) - score * step.normal.x;
  const ry = (pos.y - step.center.y) - score * step.normal.y;
  const rz = (pos.z - step.center.z) - score * step.normal.z;
  return Math.sqrt(rx * rx + ry * ry + rz * rz);
}

function carrotAlong(pos: Vec3, target: Vec3): Vec3 {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= LOOKAHEAD) return target;
  const t = LOOKAHEAD / d;
  return { x: pos.x + dx * t, y: pos.y + dy * t, z: pos.z + dz * t };
}

export function planner_window(state: PlannerIn): PlannerOut {
  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;
  const stepIdx    = Math.round(state.stepIdx);
  const target     = state.step.center;

  // Yaw target: face the gate normal during NAVIGATE (stable); face the
  // current target during recovery/approach phases.
  let yawTarget: number;
  if (navigating) {
    yawTarget = Math.atan2(-state.step.normal.z, state.step.normal.x);
  } else {
    const dx = target.x - state.pos.x;
    const dz = target.z - state.pos.z;
    yawTarget = Math.sqrt(dx * dx + dz * dz) > 0.5
      ? Math.atan2(-dz, dx)
      : state.yawSetpoint;
  }
  const yawSetpoint = stepYaw(yawTarget, state.yawSetpoint);

  if (!navigating) {
    return {
      carrot:        target,
      yawSetpoint,
      stepStatus:    STATUS_RUNNING,
      windowSide:    0,
      activeStepIdx: stepIdx,
    };
  }

  // Reset windowSide when mission advanced to a new step.
  const prevSide = stepIdx !== Math.round(state.activeStepIdx)
    ? 0
    : Math.round(state.windowSide);

  const score = sideScore(state.pos, state.step);
  const currentSide = score > 0 ? 1 : -1;

  // First tick on this step: record side, no crossing decision yet.
  if (prevSide === 0) {
    return {
      carrot:        carrotAlong(state.pos, target),
      yawSetpoint,
      stepStatus:    STATUS_RUNNING,
      windowSide:    currentSide,
      activeStepIdx: stepIdx,
    };
  }

  // Only approach→exit (-1 → +1) counts; the reverse is the drone retreating.
  const planeCrossed = prevSide === -1 && currentSide === 1;
  if (planeCrossed) {
    const withinFrame = perpDist(state.pos, state.step)
      < Math.max(state.step.width, state.step.height) / 2;
    return {
      carrot:        target,
      yawSetpoint,
      stepStatus:    withinFrame ? STATUS_COMPLETED : STATUS_FAILED,
      windowSide:    currentSide,
      activeStepIdx: stepIdx,
    };
  }

  return {
    carrot:        carrotAlong(state.pos, target),
    yawSetpoint,
    stepStatus:    STATUS_RUNNING,
    windowSide:    currentSide,
    activeStepIdx: stepIdx,
  };
}
