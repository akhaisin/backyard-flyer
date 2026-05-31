// Pre-gate staging path planner + window-crossing completion check (w1b).
//
// Improvement over w1a: oblique approaches build lateral momentum that can
// throw the drone outside the frame. Solving that needs a *pre-stage*
// waypoint ENTRY_DIST in front of the gate along the inverse normal, so the
// drone has time to align with the approach axis before crossing.
//
// step.preStageDist comes from the mission's WindowStep — per-gate, so
// different gates can have different staging distances. preStageDist === 0
// degrades to the w1a carrot behaviour (no pre-stage point).
//
// `preGateDone` is a per-step latch on planner state: it flips to 1 the
// first tick the drone is within PREGATE_THRESHOLD of the pre-stage point
// and resets when mission advances to a new stepIdx. Without the latch the
// pre-stage distance check oscillates: the drone passes the pre-gate,
// distance grows, target snaps back to the pre-gate, target snaps forward.
//
// Crossing detection identical to w1a: signed distance sign flip from
// approach side to exit side while within the gate frame → STATUS_COMPLETED;
// flip outside the frame → STATUS_FAILED.

type Vec3 = { x: number; y: number; z: number };
type Step = {
  center: Vec3;
  normal: Vec3;
  width: number;
  height: number;
  preStageDist: number;
};

type PlannerIn = {
  pos: Vec3;
  step: Step;
  stepIdx: number;
  armed: number;
  phase: number;
  yawSetpoint: number;
  windowSide: number;
  activeStepIdx: number;
  preGateDone: number;
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  stepStatus: number;
  windowSide: number;
  activeStepIdx: number;
  preGateDone: number;
};

const LOOKAHEAD         = 4.0;
const PREGATE_THRESHOLD = 1.5;
const NAVIGATE          = 2;
const MAX_YAW_RATE      = Math.PI / 2;
const DT                = 0.05;
const MAX_YAW_DELTA     = MAX_YAW_RATE * DT;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;
const STATUS_FAILED    = 2;

function stepYaw(target: number, prev: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-MAX_YAW_DELTA, Math.min(MAX_YAW_DELTA, diff));
}

function sideScore(pos: Vec3, step: Step): number {
  return (pos.x - step.center.x) * step.normal.x
       + (pos.y - step.center.y) * step.normal.y
       + (pos.z - step.center.z) * step.normal.z;
}

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

  // Pre-stage point: ENTRY_DIST behind the gate along the inverse normal.
  // preStageDist <= 0 means "no pre-stage" — target collapses to step.center.
  const usePreStage = navigating && state.step.preStageDist > 0;
  const preStage: Vec3 = {
    x: state.step.center.x - state.step.preStageDist * state.step.normal.x,
    y: state.step.center.y - state.step.preStageDist * state.step.normal.y,
    z: state.step.center.z - state.step.preStageDist * state.step.normal.z,
  };

  // Reset latches when mission advances to a new step.
  const stepChanged = stepIdx !== Math.round(state.activeStepIdx);
  const prevSide    = stepChanged ? 0 : Math.round(state.windowSide);
  let preGateDone   = stepChanged ? 0 : Math.round(state.preGateDone);

  // Latch preGateDone the first tick the drone is close enough to the pre-stage.
  if (usePreStage && preGateDone === 0) {
    const dx = preStage.x - state.pos.x;
    const dy = preStage.y - state.pos.y;
    const dz = preStage.z - state.pos.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= PREGATE_THRESHOLD) {
      preGateDone = 1;
    }
  }

  // Yaw target: face the gate normal during NAVIGATE (stable); face the
  // current target during recovery/approach phases.
  let yawTarget: number;
  if (navigating) {
    yawTarget = Math.atan2(-state.step.normal.z, state.step.normal.x);
  } else {
    const dx = state.step.center.x - state.pos.x;
    const dz = state.step.center.z - state.pos.z;
    yawTarget = Math.sqrt(dx * dx + dz * dz) > 0.5
      ? Math.atan2(-dz, dx)
      : state.yawSetpoint;
  }
  const yawSetpoint = stepYaw(yawTarget, state.yawSetpoint);

  if (!navigating) {
    return {
      carrot:        state.step.center,
      yawSetpoint,
      stepStatus:    STATUS_RUNNING,
      windowSide:    0,
      activeStepIdx: stepIdx,
      preGateDone:   0,
    };
  }

  // The active target depends on whether pre-stage is done.
  const target = (usePreStage && preGateDone === 0) ? preStage : state.step.center;

  // Crossing detection runs only on the gate plane (independent of which
  // target the carrot tracks — the geometry of the gate doesn't change).
  const score = sideScore(state.pos, state.step);
  const currentSide = score > 0 ? 1 : -1;

  if (prevSide === 0) {
    return {
      carrot:        carrotAlong(state.pos, target),
      yawSetpoint,
      stepStatus:    STATUS_RUNNING,
      windowSide:    currentSide,
      activeStepIdx: stepIdx,
      preGateDone,
    };
  }

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
      preGateDone,
    };
  }

  return {
    carrot:        carrotAlong(state.pos, target),
    yawSetpoint,
    stepStatus:    STATUS_RUNNING,
    windowSide:    currentSide,
    activeStepIdx: stepIdx,
    preGateDone,
  };
}
