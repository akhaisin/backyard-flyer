// planner_c2a — pre-staged live-target pursuit planner for the c2 chase family.
//
// Unlike the c1 family where the target is a kinematic ghost, here `targetPos`
// is the true physics position of a real simulated vehicle. Pre-staging works
// the same way as planner_c1b: fly to `step.pos` first, latch `preGateDone`,
// then switch to direct pursuit.
//
// STATUS_FAILED fires when the target completes its circuit (targetPhase >= 3,
// i.e. RTH or later) — this sends the interceptor through a full RTH/land cycle
// rather than the quick anchor-fly-back of STATUS_RESTART. One intercept
// (dist < threshold) → STATUS_COMPLETED → mission advances (one-step restriction → RTH).
//
// Yaw:
//   • Pre-stage leg → face step.pos
//   • Pursuit leg   → face the target vehicle's current position
//   • Non-navigate  → face step.pos, reset preGateDone

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; threshold?: number };

type PlannerIn = {
  pos:          Vec3;
  targetPos:    Vec3;
  targetPhase:  number;
  step:         Step;
  armed:        number;
  phase:        number;
  yawSetpoint:  number;
  preGateDone:  number;
};

type PlannerOut = {
  carrot:      Vec3;
  yawSetpoint: number;
  stepStatus:  number;
  preGateDone: number;
};

const NAVIGATE          = 2;
const PHASE_RTH         = 3;
const PREGATE_THRESHOLD = 2.0;

const STATUS_RUNNING   = 0;
const STATUS_COMPLETED = 1;
const STATUS_FAILED    = 2;

function dist3(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function faceTarget(pos: Vec3, target: Vec3, prev: number): number {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  return (dx * dx + dz * dz > 0.01) ? Math.atan2(-dz, dx) : prev;
}

export function planner_c2a(state: PlannerIn): PlannerOut {
  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;

  if (!navigating) {
    const yaw = faceTarget(state.pos, state.step.pos, state.yawSetpoint);
    return { carrot: state.step.pos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING, preGateDone: 0 };
  }

  let preGateDone = Math.round(state.preGateDone);

  if (preGateDone === 0) {
    if (dist3(state.pos, state.step.pos) <= PREGATE_THRESHOLD) {
      preGateDone = 1;
    } else {
      const yaw = faceTarget(state.pos, state.step.pos, state.yawSetpoint);
      return { carrot: state.step.pos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING, preGateDone: 0 };
    }
  }

  // Target completed its circuit — abort via STATUS_FAILED so the interceptor
  // follows the full RTH/land sequence instead of the quick anchor-fly-back.
  if (Math.round(state.targetPhase) >= PHASE_RTH) {
    const yaw = faceTarget(state.pos, state.targetPos, state.yawSetpoint);
    return { carrot: state.targetPos, yawSetpoint: yaw, stepStatus: STATUS_FAILED, preGateDone };
  }

  const threshold = state.step.threshold ?? 2.0;
  const d         = dist3(state.pos, state.targetPos);
  const yaw       = faceTarget(state.pos, state.targetPos, state.yawSetpoint);

  if (d < threshold) {
    return { carrot: state.targetPos, yawSetpoint: yaw, stepStatus: STATUS_COMPLETED, preGateDone };
  }

  return { carrot: state.targetPos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING, preGateDone };
}
