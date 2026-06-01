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
//
// Tunables (LOOKAHEAD, MAX_YAW_RATE, DT, YAW_FREEZE_RANGE) arrive via state.K.
// NAVIGATE / STATUS_* are protocol enums (the mission contract) and stay here.

import type { QuadConsts } from './consts';

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; threshold: number };

type PlannerIn = {
  pos: Vec3;
  step: Step;
  armed: number;
  phase: number;
  yawSetpoint: number;
  K: QuadConsts;
};

type PlannerOut = {
  carrot: Vec3;
  yawSetpoint: number;
  stepStatus: number;
};

const NAVIGATE  = 2;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;

function carrotAlong(pos: Vec3, target: Vec3, lookahead: number): Vec3 {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dz = target.z - pos.z;
  const d  = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d <= lookahead) return target;
  const t = lookahead / d;
  return { x: pos.x + dx * t, y: pos.y + dy * t, z: pos.z + dz * t };
}

function stepYaw(target: number, prev: number, maxDelta: number): number {
  let diff = target - prev;
  while (diff >  Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return prev + Math.max(-maxDelta, Math.min(maxDelta, diff));
}

function step_complete_check(pos: Vec3, step: Step): boolean {
  const dx = step.pos.x - pos.x;
  const dy = step.pos.y - pos.y;
  const dz = step.pos.z - pos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < step.threshold;
}

export function planner_wp(state: PlannerIn): PlannerOut {
  const K = state.K;
  const target = state.step.pos;

  let yawSetpoint = state.yawSetpoint;
  // Yaw points toward the target's horizontal direction. Negate dz because the
  // sim's yaw convention is CCW-positive viewed from above: a +Z target needs
  // a negative heading (cf. quad-l3 fc_navigator). Freeze the setpoint when
  // within YAW_FREEZE_RANGE — atan2 gets pathologically sensitive near the
  // target.
  const dx = target.x - state.pos.x;
  const dz = target.z - state.pos.z;
  if (Math.sqrt(dx * dx + dz * dz) >= K.YAW_FREEZE_RANGE) {
    yawSetpoint = stepYaw(Math.atan2(-dz, dx), state.yawSetpoint, K.MAX_YAW_RATE * K.DT);
  }

  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;
  const stepStatus = navigating && step_complete_check(state.pos, state.step)
    ? STATUS_COMPLETED
    : STATUS_RUNNING;

  if (!navigating) {
    return { carrot: target, yawSetpoint, stepStatus };
  }

  return { carrot: carrotAlong(state.pos, target, K.LOOKAHEAD), yawSetpoint, stepStatus };
}
