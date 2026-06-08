// planner_c2a — velocity-lead intercept planner for the c2 chase family.
//
// Places the carrot K.LEAD_DIST metres ahead of the target along its current
// heading (deviated pure pursuit). The target's velocity is estimated from the
// last two positions kept in planner state (prevTargetPos1 = 1-tick-ago).
//
// Why not a geometric intercept solve?  The navigator uses a damped PD cascade,
// not straight-line travel at a fixed speed, so a quadratic-solve intercept
// time T is systematically wrong.  Velocity lead avoids the model-mismatch
// problem and adapts naturally to the target's curved path.
//
// Pre-staging works the same way as planner_c1b: fly to step.pos first (latch
// preGateDone), then switch to velocity-lead pursuit.
//
// STATUS_FAILED fires when the target completes its circuit (targetPhase ≥ RTH).

type Vec3 = { x: number; y: number; z: number };
type Step = { pos: Vec3; threshold?: number };
type PlannerK = { LEAD_DIST: number };

type PlannerIn = {
  pos:            Vec3;
  targetPos:      Vec3;
  prevTargetPos1: Vec3;   // targetPos from 1 tick ago
  targetPhase:    number;
  step:           Step;
  armed:          number;
  phase:          number;
  yawSetpoint:    number;
  preGateDone:    number;
  K:              PlannerK;
};

type PlannerOut = {
  carrot:         Vec3;
  yawSetpoint:    number;
  stepStatus:     number;
  preGateDone:    number;
  prevTargetPos1: Vec3;   // current targetPos → prev1 next tick
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
  // Shift history every tick so velocity estimate is always current.
  const newPrev1 = state.targetPos;

  const navigating = !!state.armed && Math.round(state.phase) === NAVIGATE;

  if (!navigating) {
    const yaw = faceTarget(state.pos, state.step.pos, state.yawSetpoint);
    return { carrot: state.step.pos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING,
             preGateDone: 0, prevTargetPos1: newPrev1 };
  }

  let preGateDone = Math.round(state.preGateDone);

  if (preGateDone === 0) {
    if (dist3(state.pos, state.step.pos) <= PREGATE_THRESHOLD) {
      preGateDone = 1;
    } else {
      const yaw = faceTarget(state.pos, state.step.pos, state.yawSetpoint);
      return { carrot: state.step.pos, yawSetpoint: yaw, stepStatus: STATUS_RUNNING,
               preGateDone: 0, prevTargetPos1: newPrev1 };
    }
  }

  if (Math.round(state.targetPhase) >= PHASE_RTH) {
    const yaw = faceTarget(state.pos, state.targetPos, state.yawSetpoint);
    return { carrot: state.targetPos, yawSetpoint: yaw, stepStatus: STATUS_FAILED,
             preGateDone, prevTargetPos1: newPrev1 };
  }

  // ── Velocity-lead (deviated pure pursuit) ────────────────────────────────
  // Estimate target velocity from position history, then place the carrot
  // LEAD_DIST metres ahead of the target along its current heading.
  const vx = state.targetPos.x - state.prevTargetPos1.x;
  const vy = state.targetPos.y - state.prevTargetPos1.y;
  const vz = state.targetPos.z - state.prevTargetPos1.z;
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

  const scale = speed > 0.01 ? state.K.LEAD_DIST / speed : 0;
  const carrot = {
    x: state.targetPos.x + vx * scale,
    y: Math.max(1.0, state.targetPos.y + vy * scale),
    z: state.targetPos.z + vz * scale,
  };

  const d         = dist3(state.pos, state.targetPos);
  const threshold = state.step.threshold ?? 2.0;
  const yaw       = faceTarget(state.pos, carrot, state.yawSetpoint);

  if (d < threshold) {
    return { carrot, yawSetpoint: yaw, stepStatus: STATUS_COMPLETED,
             preGateDone, prevTargetPos1: newPrev1 };
  }
  return { carrot, yawSetpoint: yaw, stepStatus: STATUS_RUNNING,
           preGateDone, prevTargetPos1: newPrev1 };
}
